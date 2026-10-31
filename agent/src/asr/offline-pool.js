// agent/src/asr/offline-pool.js - offline 定稿推理的 worker 线程池（单 worker + 串行队列）
//
// 为什么需要它：sherpa-onnx 的 decode 是同步原生调用（几百毫秒到数十秒）。放在主线程的
// WS 回调 / HTTP handler 里，整个 agent 的事件循环会停摆 —— 期间 /health 探活、cancel 帧、
// 聊天流、工具执行全部排队，用户看到的是「点了停止代理像死了一样」。这里把 offline 推理
// 搬到 worker_threads，主线程只等消息。
//
// 为什么串行：本机单用户形态下并发定稿只会抢同一份 CPU 与内存；串行还保证 worker 里的
// engine 缓存（一个几百 MB 的 ONNX 会话）不会被两次 decode 交错使用。
//
// 生命周期：
//   - 首个任务到来才 spawn（未启用 ASR 的用户零成本）
//   - 空闲 idleMs 后 dispose → terminate，把几百 MB 原生内存还给系统
//   - 崩溃 / 超时：reject 在途任务并丢弃 worker，下一个任务重新 spawn
//   - spawn 失败：退回主线程同步转写（宁可卡一下，也不能让语音输入整个不可用）
//
// 注意 RSS：worker_threads 与主线程共享同一进程地址空间，process.memoryUsage().rss
// 覆盖 worker 里的原生分配，所以 session.js 的 RSS 保护阈值依然有效。

import { Worker } from 'worker_threads';
import { warmupEngines } from './engine.js';

const WORKER_URL = new URL('./offline-worker.js', import.meta.url);

// 单任务超时：5min 音频在慢机上也只需几十秒，180s 已是「线程卡死」的判据
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_HELPER_ASR_OFFLINE_TIMEOUT_MS) > 0
  ? Number(process.env.AI_HELPER_ASR_OFFLINE_TIMEOUT_MS)
  : 180 * 1000;

// dispose 后等待 worker 自行收尾的上限，超时直接 terminate
const DISPOSE_GRACE_MS = 1500;

let worker = null;
let idleTimer = null;
let idleMs = 0;
let nextId = 1;
// 当前 worker 里加载的 offline 模型 id（/api/asr/status 的 loaded 用；worker 不在则 null）
let loadedOfflineId = null;
// 串行队列：每个任务都挂在上一个任务之后
let queue = Promise.resolve();
const pending = new Map();

/**
 * 启动 worker（失败向上抛，由 exec 决定是否退回主线程）
 */
function spawnWorker() {
  const workerData = {};
  // 测试专用：把假的 transcribe 实现塞进 worker，避免加载真实 sherpa-onnx
  if (process.env.AI_HELPER_ASR_OFFLINE_IMPL) {
    workerData.transcribeModule = process.env.AI_HELPER_ASR_OFFLINE_IMPL;
  }
  const w = new Worker(WORKER_URL, {
    workerData,
    // 不继承主线程的 execArgv：--test / --input-type 之类只对主线程入口有意义，
    // 透传下去会让 worker 直接启动失败（ERR_WORKER_INVALID_EXEC_ARGV / 入口不匹配）。
    // NODE_OPTIONS 仍会经环境变量继承，内存/实验开关照常生效。
    execArgv: [],
  });
  w.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'disposed') return;
    const entry = pending.get(msg.id);
    if (!entry) return;
    leaveQueue(msg.id);
    if (msg.ok) {
      entry.resolve(msg.result);
      return;
    }
    const err = new Error(msg.error?.message || 'offline_worker_failed');
    if (msg.error?.code) err.code = msg.error.code;
    entry.reject(err);
  });
  // 线程级异常 / 崩溃：在途任务全部失败，下次任务重新 spawn
  w.on('error', (err) => dropWorker('offline_worker_crashed', err));
  w.on('exit', (code) => {
    if (worker === w && code !== 0) dropWorker('offline_worker_crashed');
  });
  // 空闲时不持住进程（daemon 的存活由 server 自己的句柄决定）
  if (typeof w.unref === 'function') w.unref();
  worker = w;
  return w;
}

/**
 * 丢弃当前 worker：拒绝在途任务、清掉空闲定时器、terminate
 * @param {string} code 失败码（写进 Error.code）
 * @param {Error} [cause]
 */
function dropWorker(code, cause) {
  const w = worker;
  worker = null;
  loadedOfflineId = null;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const inFlight = Array.from(pending.values());
  pending.clear();
  for (const entry of inFlight) {
    clearTimeout(entry.timer);
    const err = new Error(code === 'offline_worker_crashed' && cause ? cause.message : code);
    err.code = code;
    entry.reject(err);
  }
  if (!w) return;
  try { w.removeAllListeners(); } catch { /* 旧版本没有该方法 */ }
  try {
    const p = w.terminate();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* 已退出 */ }
}

/**
 * 空闲卸载：worker 里只剩原生缓存，久不用就把线程也还回去
 * @param {number} ms
 */
function scheduleIdleDispose(ms) {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (!(ms > 0)) return;
  idleMs = ms;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    disposeWorker();
  }, ms);
  if (typeof idleTimer.unref === 'function') idleTimer.unref();
}

/**
 * 优雅销毁 worker：先请它释放原生引擎，再 terminate
 */
function disposeWorker() {
  const w = worker;
  if (!w || pending.size > 0) return;
  worker = null;
  loadedOfflineId = null;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const finish = () => {
    try { w.removeAllListeners(); } catch { /* 忽略 */ }
    try {
      const p = w.terminate();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* 忽略 */ }
  };
  try {
    w.once('message', (msg) => { if (msg && msg.type === 'disposed') finish(); });
    w.postMessage({ type: 'dispose' });
  } catch {
    finish();
    return;
  }
  const timer = setTimeout(finish, DISPOSE_GRACE_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

/**
 * 任务收尾：出队 + 安排空闲卸载（resolve / reject 由调用方自己做，避免重入）
 * @param {number} id
 */
function leaveQueue(id) {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  clearTimeout(entry.timer);
  if (pending.size > 0) return;
  if (worker && typeof worker.unref === 'function') worker.unref();
  scheduleIdleDispose(idleMs);
}

/**
 * 主线程兜底：worker 起不来时退回同步转写（会阻塞事件循环，但保证功能可用）
 */
async function runInMainThread(options, cause) {
  options.onLog?.('asr_offline_worker_unavailable', { error: cause?.message || String(cause) });
  const impl = await import('./transcribe.js');
  if (options.kind === 'wav') return impl.transcribeWav(options.buffer, options.opts || {});
  if (options.kind === 'samples') return impl.transcribeSamples(options.samples, options.opts || {});
  throw cause;
}

/**
 * 跑一个任务（内部串行化；调用方只关心 Promise 结果）
 * @param {object} options
 * @returns {Promise<any>}
 */
async function exec(options) {
  const { kind, samples, buffer, opts = {}, idleMs: nextIdleMs, timeoutMs, modelId } = options;

  if (!worker) {
    try {
      spawnWorker();
    } catch (err) {
      return runInMainThread(options, err);
    }
  }

  const w = worker;
  const id = nextId++;
  if (Number.isFinite(nextIdleMs) && nextIdleMs >= 0) idleMs = nextIdleMs;
  if (modelId) loadedOfflineId = modelId;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // 线程大概率卡在原生调用里：丢弃它，让下次任务重新 spawn
      dropWorker('offline_worker_timeout');
    }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS);
    if (typeof timer.unref === 'function') timer.unref();
    pending.set(id, { resolve, reject, timer });
    // 有在途任务时持住事件循环，任务完成后回到 unref
    if (typeof w.ref === 'function') w.ref();
    const transfer = [];
    const message = { id, kind, opts };
    if (kind === 'warmup') message.models = options.models || {};
    if (kind === 'samples') {
      message.samples = samples;
      // 独占且整块的 buffer 才转移（concatChunks 的产出满足），避免 19MB 拷贝
      if (samples instanceof Float32Array && samples.byteOffset === 0
        && samples.byteLength === samples.buffer.byteLength) {
        transfer.push(samples.buffer);
      }
    }
    if (kind === 'wav') message.buffer = buffer;
    try {
      w.postMessage(message, transfer);
    } catch (err) {
      leaveQueue(id);
      reject(err);
    }
  });
}

/**
 * 提交一个 offline 任务（串行执行）
 * @param {{ kind: 'samples'|'wav'|'warmup', samples?: Float32Array, buffer?: Buffer,
 *   models?: object, opts?: object, idleMs?: number, timeoutMs?: number, modelId?: string,
 *   shouldSkip?: () => boolean, onStart?: () => void,
 *   onLog?: (event: string, payload?: object) => void }} options
 * @returns {Promise<any>}
 */
export function runOfflineTask(options) {
  const shouldSkip = options && typeof options.shouldSkip === 'function' ? options.shouldSkip : null;
  const onStart = options && typeof options.onStart === 'function' ? options.onStart : null;
  // 出队瞬间再判一次：被取消的任务空转返回，不 spawn worker、不 decode。
  // 这是 stop 抢跑的前提 —— 队列是全局串行 FIFO，否则整段定稿要排在所有待精修句子后面。
  // onStart 在真正开跑前回调：调用方要能区分「在跑」与「排队」（背压只能丢排队的那个）。
  const dequeue = () => {
    if (shouldSkip && shouldSkip()) return null;
    if (onStart) onStart();
    return exec(options);
  };
  const run = queue.then(dequeue, dequeue);
  // 队列本身不继承失败：一个任务炸掉不影响后面的任务
  queue = run.then(() => {}, () => {});
  return run;
}

/**
 * 预热：流式在主线程（增量 decode、开销小），offline 在 worker（几百 MB 的原生会话只留一份）
 * @param {{ online?: object|null, offline?: object|null }} models
 * @param {{ idleUnloadMs?: number }} [opts]
 * @returns {Promise<{ warmed: string[], failed: Array<{kind: string, error: string}> }>}
 */
export async function warmupAsrEngines(models, opts = {}) {
  const result = warmupEngines({ online: models?.online || null, offline: null }, opts);
  if (!models?.offline) return result;
  const idleMsOpt = Number.isFinite(opts?.idleUnloadMs) && opts.idleUnloadMs >= 0 ? opts.idleUnloadMs : undefined;
  try {
    const warm = await runOfflineTask({
      kind: 'warmup',
      models: { offline: models.offline },
      opts: { idleUnloadMs: idleMsOpt },
      idleMs: idleMsOpt,
      modelId: models.offline.id,
    });
    result.warmed.push(...(warm?.warmed || []));
    result.failed.push(...(warm?.failed || []));
  } catch (err) {
    result.failed.push({ kind: 'offline', error: err?.message || String(err) });
  }
  return result;
}

/**
 * worker 里当前加载的 offline 模型 id（未加载 / 线程已卸载时返回 null）
 * @returns {string|null}
 */
export function getWorkerLoadedModelId() {
  return worker ? loadedOfflineId : null;
}

/**
 * 关闭池（停服路径）：拒绝在途任务并终止线程
 * @returns {Promise<void>}
 */
export async function closeOfflinePool() {
  dropWorker('offline_pool_closed');
  queue = Promise.resolve();
}