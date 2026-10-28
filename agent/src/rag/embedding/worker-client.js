// agent/src/rag/embedding/worker-client.js - 本地 embedding 子进程的客户端（父进程侧）
//
// 职责：把「加载模型 / 算向量 / 数 token」三个动作转发给 embed-worker.mjs（独立进程），
// 主进程因此从不 import transformers —— onnxruntime-node 的 dll 只活在子进程里，不会和
// 语音输入（sherpa-onnx）的 onnxruntime.dll 在同一个 Windows 进程里抢句柄（见
// embed-worker.mjs 文件头的根因说明）。
//
// 治理策略（与 asr/offline-pool.js 同源，但这里是子进程不是线程）：
//   - 懒启动：首个请求才 spawn，未用 RAG/记忆向量的用户零成本
//   - 串行队列：一次只跑一个请求（原生会话不能被两个批量推理交错使用）
//   - 超时：未加载过 180s（含首次下载模型 95MB），已加载 60s；超时即杀子进程
//   - 熔断：连续 3 次失败后冷却 5 分钟，避免在坏依赖上反复 spawn 打转
//   - 空闲回收：默认空闲 10 分钟杀掉子进程，把几百 MB 原生内存还给系统
//   - 子进程异常退出：拒绝所有在途请求（错误码 embed_worker_crashed），下次请求重新 spawn

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// 测试注入点：指向假的 worker 脚本（避免真的 import transformers）
export const WORKER_PATH_ENV = 'AI_HELPER_RAG_EMBED_WORKER';

const DEFAULT_WORKER_PATH = fileURLToPath(new URL('./embed-worker.mjs', import.meta.url));

/** @param {string} name @param {number} fallback @returns {number} */
function envMs(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

// 首次请求要等模型加载（含下载），给足余量
const DEFAULT_LOAD_TIMEOUT_MS = 180 * 1000;
// 模型已就绪后的单次请求上限（批量 10 条中文短文本在慢机上也只需几百毫秒）
const DEFAULT_OP_TIMEOUT_MS = 60 * 1000;
// 空闲多久杀掉子进程
const DEFAULT_IDLE_MS = 10 * 60 * 1000;
// 连续失败达到该次数进入冷却
const MAX_CONSECUTIVE_FAILURES = 3;
// 冷却时长（期间直接失败，不再 spawn）
const COOLDOWN_MS = 5 * 60 * 1000;
// 子进程 stderr 单行长度上限（防止进度条把日志刷爆）
const STDERR_LINE_MAX = 500;

export class EmbedWorkerClient {
  /**
   * @param {{ workerPath?: string, idleMs?: number, loadTimeoutMs?: number, opTimeoutMs?: number }} [opts]
   */
  constructor(opts = {}) {
    this._workerPath = opts.workerPath || process.env[WORKER_PATH_ENV] || DEFAULT_WORKER_PATH;
    this._idleMs = Number.isFinite(opts.idleMs) ? opts.idleMs : envMs('AI_HELPER_RAG_EMBED_IDLE_MS', DEFAULT_IDLE_MS);
    this._loadTimeoutMs = Number(opts.loadTimeoutMs) > 0
      ? Number(opts.loadTimeoutMs)
      : envMs('AI_HELPER_RAG_EMBED_LOAD_TIMEOUT_MS', DEFAULT_LOAD_TIMEOUT_MS);
    this._opTimeoutMs = Number(opts.opTimeoutMs) > 0
      ? Number(opts.opTimeoutMs)
      : envMs('AI_HELPER_RAG_EMBED_TIMEOUT_MS', DEFAULT_OP_TIMEOUT_MS);

    this._child = null;
    this._buffer = '';
    this._nextId = 1;
    /** @type {Map<number, { method: string, resolve: Function, reject: Function, timer: any }>} */
    this._pending = new Map();
    // 串行队列：每个请求挂在上一个请求之后（失败不阻断后续）
    this._chain = Promise.resolve();
    // 是否已经成功加载过模型（决定单次请求用哪个超时）
    this._loaded = false;
    this._failures = 0;
    this._cooldownUntil = 0;
    this._idleTimer = null;
  }

  /**
   * 子进程是否存活
   * @returns {boolean}
   */
  get alive() {
    return Boolean(this._child);
  }

  /**
   * 加载（或确认已加载）模型
   * @param {{ modelName?: string, remoteHost?: string, cacheDir?: string }} [params]
   * @returns {Promise<{ model: string, window: number }>}
   */
  load(params = {}) {
    return this._request('load', params);
  }

  /**
   * 批量生成向量
   * @param {string[]} texts
   * @param {{ modelName?: string, remoteHost?: string, cacheDir?: string }} [params]
   * @returns {Promise<number[][]>}
   */
  embed(texts, params = {}) {
    return this._request('embed', { ...params, texts });
  }

  /**
   * 统计 token 长度与窗口
   * @param {string[]} texts
   * @param {{ modelName?: string, remoteHost?: string, cacheDir?: string }} [params]
   * @returns {Promise<{ counts: number[], window: number }>}
   */
  countTokens(texts, params = {}) {
    return this._request('countTokens', { ...params, texts });
  }

  /**
   * 关闭子进程（停服路径）：先关 stdin 让它自己退，2s 未退再强杀
   * @returns {Promise<void>}
   */
  async close() {
    this._clearIdle();
    const child = this._child;
    this._child = null;
    this._loaded = false;
    this._buffer = '';
    this._rejectAll(this._makeError('embed_worker_closed', 'embedding worker closed'));
    if (!child) return;
    const killer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* 已退出 */ }
    }, 2000);
    if (typeof killer.unref === 'function') killer.unref();
    child.once('exit', () => clearTimeout(killer));
    try { child.stdin.end(); } catch { /* 管道已断 */ }
  }

  /**
   * 排进串行队列
   * @param {string} method
   * @param {object} params
   * @returns {Promise<any>}
   */
  _request(method, params) {
    const run = this._chain.then(() => this._exec(method, params), () => this._exec(method, params));
    this._chain = run.then(() => {}, () => {});
    return run;
  }

  /**
   * 真正发起一次往返
   * @param {string} method
   * @param {object} params
   * @returns {Promise<any>}
   */
  async _exec(method, params) {
    const remaining = this._cooldownUntil - Date.now();
    if (remaining > 0) {
      throw this._makeError(
        'embed_worker_cooldown',
        `embedding worker paused after ${MAX_CONSECUTIVE_FAILURES} consecutive failures, retry in ${Math.ceil(remaining / 1000)}s`
      );
    }

    const child = this._ensureChild();
    const id = this._nextId++;
    const timeoutMs = this._loaded ? this._opTimeoutMs : this._loadTimeoutMs;

    try {
      const result = await this._roundtrip(child, id, method, params, timeoutMs);
      this._loaded = true;
      this._failures = 0;
      this._scheduleIdle();
      return result;
    } catch (err) {
      this._noteFailure(err);
      throw err;
    }
  }

  /**
   * 写一条请求并等对应 id 的响应
   * @param {import('child_process').ChildProcess} child
   * @param {number} id
   * @param {string} method
   * @param {object} params
   * @param {number} timeoutMs
   * @returns {Promise<any>}
   */
  _roundtrip(child, id, method, params, timeoutMs) {
    this._clearIdle();
    // 已有子进程时 _ensureChild 不会再 ref 一次，这里补上：在途请求必须持住事件循环
    this._refChild(child);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // 子进程大概率卡在原生调用/下载里：杀掉，让下次请求重新 spawn
        this._settle(id, this._makeError('embed_worker_timeout', `embedding worker ${method} timeout (${timeoutMs}ms)`));
        this._dropChild('embed_worker_timeout');
      }, timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
      this._pending.set(id, { method, resolve, reject, timer });
      try {
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      } catch (err) {
        this._settle(id, this._makeError('embed_worker_write_failed', err.message || String(err)));
      }
    });
  }

  /**
   * 懒启动子进程
   * @returns {import('child_process').ChildProcess}
   */
  _ensureChild() {
    if (this._child) return this._child;

    const child = spawn(process.execPath, [this._workerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      windowsHide: true,
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { if (this._child === child) this._onStdout(chunk); });
    child.stderr.on('data', (chunk) => this._forwardStderr(chunk));
    // 监听器必须按「哪一个子进程」判定：close()/超时丢弃后可能已经起了新子进程，
    // 旧进程的退出事件不能把新进程当成崩溃处理（否则下一次请求会被错误拒绝）
    child.on('error', (err) => { if (this._child === child) this._dropChild('embed_worker_spawn_failed', err); });
    child.on('exit', (code, signal) => { if (this._child === child) this._onExit(code, signal); });
    // 子进程与三条管道默认持住事件循环：在途请求必须让父进程活着等结果
    // （空闲时由 _unrefChild 释放，不阻止 daemon 正常退出）
    this._refChild(child);

    this._child = child;
    this._buffer = '';
    this._loaded = false;
    console.log(`[RAG] embedding worker started (pid: ${child.pid})`);
    return child;
  }

  /**
   * 持住事件循环（有在途请求时）
   * @param {import('child_process').ChildProcess} [target]
   */
  _refChild(target) {
    for (const handle of [target, target?.stdin, target?.stdout, target?.stderr]) {
      if (handle && typeof handle.ref === 'function') handle.ref();
    }
  }

  /**
   * 释放事件循环（空闲时）：daemon 的存活不应由空闲的 embedding 子进程决定
   */
  _unrefChild() {
    const child = this._child;
    if (!child) return;
    for (const handle of [child, child.stdin, child.stdout, child.stderr]) {
      if (handle && typeof handle.unref === 'function') handle.unref();
    }
  }

  /**
   * 解析子进程 stdout 的 NDJSON 响应
   * @param {string} chunk
   */
  _onStdout(chunk) {
    this._buffer += chunk;
    let index = this._buffer.indexOf('\n');
    while (index >= 0) {
      const line = this._buffer.slice(0, index).trim();
      this._buffer = this._buffer.slice(index + 1);
      if (line) this._handleLine(line);
      index = this._buffer.indexOf('\n');
    }
    // 单行过长（非法协议）时丢弃，避免 buffer 无上限增长
    if (this._buffer.length > 1_000_000) this._buffer = '';
  }

  /**
   * 处理一行响应
   * @param {string} line
   */
  _handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      console.error(`[RAG][embed] invalid protocol line: ${line.slice(0, STDERR_LINE_MAX)}`);
      return;
    }
    const entry = this._pending.get(message?.id);
    if (!entry) return;
    if (message.ok) {
      this._settle(message.id, null, message.result);
      return;
    }
    const err = this._makeError(
      message?.error?.code || 'embed_worker_failed',
      message?.error?.message || 'embedding worker failed'
    );
    this._settle(message.id, err);
  }

  /**
   * 转发子进程 stderr（模型加载/原生库报错都在这条通道）
   * @param {string} chunk
   */
  _forwardStderr(chunk) {
    for (const raw of chunk.split('\n')) {
      const line = raw.trim();
      if (line) console.error(`[RAG][embed] ${line.slice(0, STDERR_LINE_MAX)}`);
    }
  }

  /**
   * 子进程退出：拒绝所有在途请求
   * @param {number|null} code
   * @param {string|null} signal
   */
  _onExit(code, signal) {
    const detail = signal ? `signal ${signal}` : `code ${code}`;
    this._dropChild(code === 0 ? 'embed_worker_exited' : 'embed_worker_crashed', new Error(detail));
  }

  /**
   * 结算单个请求（ok / 失败二选一，重复调用无副作用）
   * @param {number} id
   * @param {Error|null} err
   * @param {any} [result]
   */
  _settle(id, err, result) {
    const entry = this._pending.get(id);
    if (!entry) return;
    this._pending.delete(id);
    clearTimeout(entry.timer);
    if (this._pending.size === 0) {
      // 队列空了：释放事件循环，下次请求前再由 _ensureChild 持住
      this._unrefChild();
      this._scheduleIdle();
    }
    if (err) entry.reject(err);
    else entry.resolve(result);
  }

  /**
   * 丢弃当前子进程：拒绝在途请求并强杀
   * @param {string} code
   * @param {Error} [cause]
   */
  _dropChild(code, cause) {
    const child = this._child;
    this._child = null;
    this._loaded = false;
    this._buffer = '';
    this._clearIdle();
    this._rejectAll(this._makeError(code, cause?.message ? `${code}: ${cause.message}` : code));
    if (!child) return;
    try { child.stdin.end(); } catch { /* 管道已断 */ }
    try { child.kill('SIGKILL'); } catch { /* 已退出 */ }
  }

  /**
   * 拒绝全部在途请求
   * @param {Error} err
   */
  _rejectAll(err) {
    const entries = Array.from(this._pending.values());
    this._pending.clear();
    for (const entry of entries) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
  }

  /**
   * 记一次失败（连续失败到阈值进入冷却）
   * @param {Error} err
   */
  _noteFailure(err) {
    this._failures += 1;
    if (this._failures < MAX_CONSECUTIVE_FAILURES) return;
    this._cooldownUntil = Date.now() + COOLDOWN_MS;
    console.error(
      `[RAG] embedding worker disabled for ${Math.round(COOLDOWN_MS / 60000)}min after ${this._failures} consecutive failures: ${err?.message || err}`
    );
  }

  /**
   * 空闲回收：无在途请求时挂一个 kill 定时器
   */
  _scheduleIdle() {
    this._clearIdle();
    if (!this._child || this._pending.size > 0) return;
    if (!(this._idleMs > 0)) return;
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      this.close().catch(() => {});
    }, this._idleMs);
    if (typeof this._idleTimer.unref === 'function') this._idleTimer.unref();
  }

  _clearIdle() {
    if (!this._idleTimer) return;
    clearTimeout(this._idleTimer);
    this._idleTimer = null;
  }

  /**
   * 构造带错误码的 Error
   * @param {string} code
   * @param {string} message
   * @returns {Error}
   */
  _makeError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
  }
}

/** 进程级单例（RAG 与长期记忆共用同一个子进程，模型只加载一份） */
let singleton = null;

/**
 * 取进程级 embedding 子进程客户端
 * @returns {EmbedWorkerClient}
 */
export function getEmbedWorker() {
  if (!singleton) singleton = new EmbedWorkerClient();
  return singleton;
}

/**
 * 关闭并丢弃单例（停服路径；下次调用会重新 spawn）
 * @returns {Promise<void>}
 */
export async function closeEmbedWorker() {
  const current = singleton;
  singleton = null;
  if (!current) return;
  await current.close();
}
