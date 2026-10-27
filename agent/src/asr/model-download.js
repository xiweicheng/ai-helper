// agent/src/asr/model-download.js - 推荐模型一键下载
//
// 为什么需要它：模型原本只能靠「外网机器下载 → 拷进内网」分发，但并不是所有机器
// 都真的上不了外网（有的只是需要走镜像）。因此把下载做成「尝试 + 失败降级」：
//   成功 → 模型直接可用；失败 → 状态里写明「未安装」，并保留手动拷贝/导入两条路。
//
// 实现要点：
//   - 逐文件下载（不是 .tar.bz2）：Node 没有内置 bzip2，而 HF 支持单文件 HTTP 取
//   - 落盘目录 MODELS_DIR/.<id>.part/：未完成的包对 scanModels 不可见（点开头的目录跳过），
//     全部文件就绪后才写 manifest.json 并原子 rename 成 MODELS_DIR/<id>/
//   - 秒级续传：已存在且字节数「与哈希」都匹配的文件直接跳过，下载中断后重试不会从头再来
//   - 逐块算 sha256：与写入同步进行，不额外读一遍盘；不匹配即判失败并删除该文件
//   - 任务状态持久化：代理重启后把「运行中」收敛为「已中止」，不出现假进度
//
// 与 deps 安装的刻意差异：不启动子进程（纯 HTTP），因此不需要进程树组杀；
// 中止用 AbortController 即可。

import { createHash } from 'crypto';
import { once } from 'events';
import {
  createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync,
  statSync, writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { MODELS_DIR } from './config.js';
import { readModelManifest, sha256OfFile } from './model-pack.js';
import { MODEL_CATALOG, buildFileUrl, getEntryBytes, resolveCatalogEntries } from './model-catalog.js';
import { logError, logSystem } from '../logger.js';
import { t as translate, parseAcceptLanguage } from '../i18n.js';

// 单次 HTTP 请求的「无数据」超时：镜像偶发挂起时及时失败，而不是让用户等 10 分钟
const STALL_TIMEOUT_MS = 60 * 1000;

// 未完成包的临时目录前缀（scanModels 会跳过点开头的目录，故半成品不可见）
const PART_PREFIX = '.';

// 持久化文件（与 asr-install-state.json 同级）
const STATE_FILE = join(homedir(), '.ai-helper-agent', 'asr-model-download-state.json');

// 模块级语言：无请求上下文时（启动收敛）用
const moduleT = (key, params) => translate(parseAcceptLanguage(), key, params);

/** 下载任务（null = 从未下载过） */
let downloadTask = null;

/** 当前 fetch 的取消控制器集合（每个文件一个，串行执行所以最多 1 个） */
const activeControllers = new Set();

/**
 * 对外暴露的任务快照收敛（防状态文件损坏）
 * @param {object|null} raw
 * @returns {object|null}
 */
function sanitizePersistedState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const targets = Array.isArray(raw.targets)
    ? raw.targets
      .filter((x) => x && typeof x === 'object' && typeof x.id === 'string')
      .map((x) => ({
        id: x.id,
        phase: typeof x.phase === 'string' ? x.phase : null,
        bytesDone: Number.isFinite(x.bytesDone) ? x.bytesDone : 0,
        bytesTotal: Number.isFinite(x.bytesTotal) ? x.bytesTotal : 0,
        error: typeof x.error === 'string' ? x.error : null,
      }))
    : [];
  return {
    running: raw.running === true,
    done: raw.done === true,
    success: raw.success === true,
    aborted: raw.aborted === true,
    phase: typeof raw.phase === 'string' ? raw.phase : null,
    ids: Array.isArray(raw.ids) ? raw.ids.filter((id) => typeof id === 'string') : [],
    bytesDone: Number.isFinite(raw.bytesDone) ? raw.bytesDone : 0,
    bytesTotal: Number.isFinite(raw.bytesTotal) ? raw.bytesTotal : 0,
    startedAt: Number.isFinite(raw.startedAt) ? raw.startedAt : null,
    finishedAt: Number.isFinite(raw.finishedAt) ? raw.finishedAt : null,
    error: typeof raw.error === 'string' ? raw.error : null,
    targets,
  };
}

/**
 * 持久化任务状态（写失败不影响下载主流程）
 */
function savePersistedState() {
  if (!downloadTask) return;
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(downloadTask), 'utf-8');
  } catch (err) {
    console.warn(`[ASR] persist model download state failed: ${err.message}`);
  }
}

// 模块加载时恢复：上次标记「运行中」说明进程被中断，收敛为「已中止」
(function restorePersistedState() {
  let persisted = null;
  try {
    persisted = sanitizePersistedState(JSON.parse(readFileSync(STATE_FILE, 'utf-8')));
  } catch {
    persisted = null;
  }
  if (!persisted) return;
  downloadTask = { ...persisted };
  if (!persisted.running) return;
  downloadTask.running = false;
  downloadTask.done = true;
  downloadTask.success = false;
  downloadTask.aborted = true;
  downloadTask.phase = 'done';
  downloadTask.finishedAt = Date.now();
  downloadTask.error = moduleT('asr.downloadAborted');
  savePersistedState();
})();

/**
 * 获取下载任务状态（供前端轮询；从未下载过返回全零快照）
 * @returns {object}
 */
export function getModelDownloadStatus() {
  if (!downloadTask) {
    return {
      running: false,
      done: false,
      success: false,
      aborted: false,
      phase: null,
      ids: [],
      bytesDone: 0,
      bytesTotal: 0,
      startedAt: null,
      finishedAt: null,
      error: null,
      targets: [],
    };
  }
  return { ...downloadTask, targets: downloadTask.targets.map((x) => ({ ...x })) };
}

/** 是否正在下载 */
export function isModelDownloadRunning() {
  return Boolean(downloadTask && downloadTask.running === true);
}

/**
 * 启动模型下载（异步任务，立即返回）
 *
 * 幂等语义与依赖安装一致：已在下载时返回 alreadyRunning，由前端继续轮询，
 * 不当作错误（用户重复点按钮是常态）。
 * @param {unknown} ids 目标 id 列表（空/非法回落默认组合）
 * @param {(key: string, params?: object) => string} t
 * @returns {{ started: boolean, alreadyRunning?: boolean, skipped?: string, ids?: string[] }}
 */
export function startModelDownload(ids, t) {
  if (downloadTask && downloadTask.running) {
    return { started: false, alreadyRunning: true, ids: downloadTask.ids };
  }

  const entries = resolveCatalogEntries(ids);
  if (entries.length === 0) return { started: false, skipped: 'no_targets' };

  // 已经在 models 目录里可用的包直接跳过，避免重复下载数百 MB
  const pending = entries.filter((entry) => !isInstalled(entry.id));
  if (pending.length === 0) return { started: false, skipped: 'already_installed' };

  const task = {
    running: true,
    done: false,
    success: false,
    aborted: false,
    phase: 'downloading',
    ids: pending.map((entry) => entry.id),
    bytesDone: 0,
    bytesTotal: pending.reduce((sum, entry) => sum + getEntryBytes(entry), 0),
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
    targets: pending.map((entry) => ({
      id: entry.id,
      phase: 'pending',
      bytesDone: 0,
      bytesTotal: getEntryBytes(entry),
      error: null,
    })),
  };
  downloadTask = task;
  savePersistedState();
  logSystem('asr_model_download_start', { ids: task.ids.join(','), bytesTotal: task.bytesTotal });

  runDownload(task, pending, t).catch((err) => {
    task.running = false;
    task.done = true;
    task.success = false;
    task.phase = 'done';
    task.error = err.message;
    task.finishedAt = Date.now();
    savePersistedState();
  });

  return { started: true, ids: task.ids };
}

/**
 * 中止下载（配置页「取消」/ 代理停服）
 * @returns {boolean} 是否真的中止了任务
 */
export function stopModelDownload() {
  const task = downloadTask;
  const wasRunning = Boolean(task && task.running);
  for (const controller of activeControllers) {
    try { controller.abort(); } catch { /* 忽略 */ }
  }
  activeControllers.clear();
  if (wasRunning) {
    task.running = false;
    task.done = true;
    task.success = false;
    task.aborted = true;
    task.phase = 'done';
    task.finishedAt = Date.now();
    task.error = moduleT('asr.downloadAborted');
    savePersistedState();
  }
  return wasRunning;
}

/**
 * 该模型包是否已安装且可用
 * @param {string} id
 * @returns {boolean}
 */
function isInstalled(id) {
  const dir = join(MODELS_DIR, id);
  if (!existsSync(dir)) return false;
  return readModelManifest(dir).ok === true;
}

/**
 * 下载主流程（串行：一次只下一个文件，避免多个大文件抢带宽与磁盘）
 */
async function runDownload(task, entries, t) {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const target = task.targets[i];

    if (task.aborted) return;

    if (isInstalled(entry.id)) {
      target.phase = 'done';
      target.bytesDone = target.bytesTotal;
      task.bytesDone += target.bytesTotal;
      savePersistedState();
      continue;
    }

    target.phase = 'downloading';
    task.phase = `downloading:${entry.id}`;
    savePersistedState();

    const partDir = join(MODELS_DIR, `${PART_PREFIX}${entry.id}.part`);
    try {
      mkdirSync(partDir, { recursive: true });
    } catch (err) {
      return failTask(task, target, t('asr.downloadFailed', { message: `mkdir: ${err.message}` }));
    }

    for (const file of entry.files) {
      if (task.aborted) return;
      const dest = join(partDir, file.name);
      const already = existsSync(dest) ? safeSize(dest) : 0;
      // 续传：字节数对上「且」哈希对上才跳过。只看大小的话，中断 / 掉电留下的
      // 「大小对、内容坏」文件会被当成已下载，重试永远命中这条跳过，直到引擎加载模型才炸。
      if (already === file.size && sha256Matches(dest, file)) {
        target.bytesDone += file.size;
        task.bytesDone += file.size;
        savePersistedState();
        continue;
      }
      if (already > 0) {
        // 大小不符 / 内容不符 = 上次没写对，删掉重下（不做 Range 续传：镜像对 Range 的支持不一致）
        try { rmSync(dest, { force: true }); } catch { /* 忽略 */ }
        task.bytesDone = Math.max(0, task.bytesDone - already);
        target.bytesDone = Math.max(0, target.bytesDone - already);
      }

      const url = buildFileUrl(entry.repo, file.name);
      try {
        await downloadFile(url, dest, file, (delta) => {
          target.bytesDone += delta;
          task.bytesDone += delta;
        }, () => task.aborted);
      } catch (err) {
        if (task.aborted) return;
        logError('system', 'asr_model_download_failed', { id: entry.id, file: file.name, error: err.message });
        return failTask(task, target, t('asr.downloadFailed', { message: `${file.name}: ${err.message}` }));
      }
      savePersistedState();
    }

    // 写 manifest → 用扫描器同一套校验确认「装完即可用」
    try {
      writeFileSync(
        join(partDir, 'manifest.json'),
        JSON.stringify(entry.manifest, null, 2),
        'utf-8',
      );
    } catch (err) {
      return failTask(task, target, t('asr.downloadFailed', { message: `manifest: ${err.message}` }));
    }
    const checked = readModelManifest(partDir, { verifyHash: true });
    if (!checked.ok) {
      return failTask(task, target, t('asr.downloadFailed', { message: `verify: ${checked.error}` }));
    }

    const finalDir = join(MODELS_DIR, entry.id);
    try {
      if (existsSync(finalDir)) rmSync(finalDir, { recursive: true, force: true });
      renameSync(partDir, finalDir);
    } catch (err) {
      return failTask(task, target, t('asr.downloadFailed', { message: `move: ${err.message}` }));
    }

    target.phase = 'done';
    target.bytesDone = target.bytesTotal;
    task.bytesDone = Math.min(task.bytesTotal, task.bytesDone);
    savePersistedState();
    logSystem('asr_model_download_done', { id: entry.id, bytes: target.bytesTotal });
  }

  if (task.aborted) return;
  task.running = false;
  task.done = true;
  task.success = true;
  task.phase = 'done';
  task.finishedAt = Date.now();
  task.bytesDone = task.bytesTotal;
  savePersistedState();
}

/**
 * 收敛为失败态
 */
function failTask(task, target, message) {
  target.error = message;
  target.phase = 'failed';
  task.running = false;
  task.done = true;
  task.success = false;
  task.phase = 'done';
  task.error = message;
  task.finishedAt = Date.now();
  savePersistedState();
}

/**
 * 文件大小（读不到按 0 处理，让调用方走重下路径）
 * @param {string} filePath
 * @returns {number}
 */
function safeSize(filePath) {
  try {
    const st = statSync(filePath);
    return st.isFile() ? st.size : 0;
  } catch {
    return 0;
  }
}

/**
 * 续传前校验「已存在的那个文件」是否真的下完了
 *
 * 只比字节数不够：中断 / 掉电可能留下大小恰好一致、内容却是残片的文件。
 * 这种文件一旦被当成「已下载」，后续每次重试都命中跳过，直到引擎加载模型才炸，
 * 而且报错信息和下载毫无关系，排查成本极高。
 *
 * 清单没给 sha256 时退回「只信大小」（兼容早期不带哈希的包）；
 * 给了哈希但读不出来（权限 / 超限）按不匹配处理，宁可重下也不赌。
 * @param {string} filePath
 * @param {{ name: string, size: number, sha256?: string }} file
 * @returns {boolean}
 */
function sha256Matches(filePath, file) {
  const want = typeof file.sha256 === 'string' ? file.sha256.trim().toLowerCase() : '';
  if (!want) return true;
  const got = sha256OfFile(filePath);
  return typeof got === 'string' && got.toLowerCase() === want;
}

/**
 * 下载单个文件：流式写盘 + 逐块 sha256 + 无数据超时
 * @param {string} url
 * @param {string} destPath
 * @param {{ name: string, size: number, sha256: string }} file 期望值
 * @param {(delta: number) => void} onBytes 进度回调
 * @param {() => boolean} isAborted
 */
async function downloadFile(url, destPath, file, onBytes, isAborted) {
  const controller = new AbortController();
  activeControllers.add(controller);

  let stallTimer = null;
  const armStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
    if (stallTimer.unref) stallTimer.unref();
  };

  let out = null;
  try {
    armStallTimer();
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`http_${res.status}`);
    if (!res.body) throw new Error('empty_body');

    // 镜像的 Content-Length 与实际字节数实测一致，先比一次能尽早发现换源/截断
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > 0 && declared !== file.size) {
      throw new Error(`size_mismatch: header=${declared} expect=${file.size}`);
    }

    out = createWriteStream(destPath);
    const hash = createHash('sha256');
    let written = 0;

    for await (const chunk of res.body) {
      if (isAborted()) throw new Error('aborted');
      armStallTimer();
      const buf = Buffer.from(chunk);
      written += buf.length;
      // 超出预期直接失败：避免被异常响应急剧撑爆磁盘
      if (written > file.size) throw new Error(`oversize: ${written} > ${file.size}`);
      hash.update(buf);
      onBytes(buf.length);
      if (!out.write(buf)) await once(out, 'drain');
    }

    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    out = null;

    if (written !== file.size) throw new Error(`size_mismatch: got=${written} expect=${file.size}`);
    const digest = hash.digest('hex');
    if (file.sha256 && digest !== file.sha256) {
      throw new Error(`sha256_mismatch: ${digest.slice(0, 12)}…`);
    }
  } catch (err) {
    if (out) {
      try { out.destroy(); } catch { /* 忽略 */ }
    }
    // 删掉写了一半的文件：否则下次续传判据会把它当成完整体（大小不符时也会删，但这里更及时）
    try { rmSync(destPath, { force: true }); } catch { /* 忽略 */ }
    throw err;
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
    activeControllers.delete(controller);
  }
}

// 供单测/诊断：清单长度恒等于内置条目数，避免被意外改写
export const CATALOG_SIZE = MODEL_CATALOG.length;
