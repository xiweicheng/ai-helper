// agent/src/rag/detect.js - RAG 可选依赖运行时检测（仿 search.js 的 fd/rg 检测模式）
// RAG 是高级功能：不强制安装、不强制启用；依赖缺失或 Node 版本不满足时整体返回不可用（不做降级）
//
// R8（2026-09-29 实测）：检测必须在全新子进程执行（probe-child.mjs）。Node 对模块
// 「求值失败」（模块代码执行阶段抛错）在同一进程内永久缓存——长驻 daemon 内直接
// import 一旦在依赖不完整/安装进行中时失败，安装完成后同进程重试永远误报失败
// （实测 8 次一键安装验证全部失败，而磁盘与新进程均正常）。子进程探测 = 磁盘真实
// 状态，且不会污染 daemon 进程（进程内 import 失败无法恢复，只能重启进程）。
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { t as translate } from '../i18n.js';
import { logSystem } from '../logger.js';

// 默认使用 en（独立调用场景）；server.js 调用时会传入请求语言
let currentLang = 'en';

/**
 * 设置 RAG 模块当前使用的语言（由 server.js 在请求入口处调用）
 * @param {string} lang - 语言代码（'zh' | 'en'）
 */
export function setRagLang(lang) {
  if (lang) currentLang = lang;
}

/**
 * 翻译辅助：使用当前模块语言
 * @param {string} key - 翻译 key
 * @param {object} [params] - 插值参数
 * @returns {string}
 */
function tr(key, params) {
  return translate(currentLang, key, params);
}

// 缓存检测结果（null = 未检测；true / false = 检测结果）
let _ragAvailable = null;

// 最近一次探测的错误摘要（null = 无错误；供安装验证/重新检测接口暴露真实原因）
let _lastProbeError = null;

// 探测子进程脚本（与 detect.js 同目录；依赖解析基准 = src/rag/，与进程内 import 一致）
const PROBE_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'probe-child.mjs');

// 探测超时上限（含 onnxruntime 原生库加载，正常 1-3 秒；留足冷启动余量）
const PROBE_TIMEOUT_MS = 60_000;

/**
 * 检测 Node 版本是否满足 RAG 前置要求（Node 22+）
 * Vectra 0.15 声明 engines: node>=22，officeparser 8 要求 >=22.13.0
 * @returns {boolean}
 */
export function isNodeVersionSupported() {
  return Number(process.versions.node.split('.')[0]) >= 22;
}

/**
 * 把探测详情中失败包的错误汇总为一行摘要
 * @param {object|null} detail - 探测 JSON（包名 → { ok, error? }）
 * @returns {string|null} 如 "vectra: ...; @huggingface/transformers: ..."；无失败返回 null
 */
export function summarizeProbeErrors(detail) {
  if (!detail || typeof detail !== 'object') return null;
  const parts = [];
  for (const [name, entry] of Object.entries(detail)) {
    if (!entry || entry.ok !== true) {
      const reason = entry && typeof entry.error === 'string' && entry.error ? entry.error : 'unknown error';
      parts.push(`${name}: ${reason}`);
    }
  }
  if (parts.length === 0) return null;
  const text = parts.join('; ');
  return text.length > 400 ? `${text.slice(0, 400)}...` : text;
}

/**
 * 在全新子进程内探测 RAG 依赖可用性（结果 = 磁盘真实状态，详见文件头 R8 说明）
 * @param {{ probeScript?: string, timeoutMs?: number }} [opts] 仅测试注入用（生产调用不传）
 * @returns {Promise<{ ok: boolean, detail: object|null, errorSummary: string|null }>}
 */
export function runRagProbe(opts = {}) {
  const scriptPath = opts.probeScript || PROBE_SCRIPT;
  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : PROBE_TIMEOUT_MS;

  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolvePromise(result);
    };

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      finish({ ok: false, detail: null, errorSummary: `probe spawn failed: ${err.message}` });
    });

    // 超时保护：probe 卡住（如原生库加载挂死）时强制终止，避免检测永不返回
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ ok: false, detail: null, errorSummary: `probe timeout (${timeoutMs}ms)` });
    }, timeoutMs);
    timer.unref();

    child.on('close', (code) => {
      // 协议：stdout 末行为单行 JSON（个别库可能先输出噪音，取最后一个可解析的 JSON 行）
      let detail = null;
      const lines = stdout.trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line.startsWith('{')) continue;
        try { detail = JSON.parse(line); break; } catch { /* 继续向前找 */ }
      }
      if (!detail) {
        const tail = (stderr || stdout).trim().split('\n').pop() || '';
        const why = code === 0 ? 'no output' : `exit code ${code}`;
        finish({ ok: false, detail: null, errorSummary: `probe failed (${why})${tail ? `: ${tail.slice(0, 300)}` : ''}` });
        return;
      }
      const vectraOk = detail.vectra && detail.vectra.ok === true;
      const transformersOk = detail['@huggingface/transformers'] && detail['@huggingface/transformers'].ok === true;
      const ok = Boolean(vectraOk && transformersOk);
      finish({ ok, detail, errorSummary: ok ? null : summarizeProbeErrors(detail) });
    });
  });
}

/**
 * 检测 RAG 依赖是否可用（结果缓存，避免重复检测；探测在全新子进程执行，见文件头 R8 说明）
 * @param {{ probeScript?: string, timeoutMs?: number }} [opts] 仅测试注入用（生产调用不传）
 * @returns {Promise<boolean>}
 */
export async function detectRagAvailable(opts = {}) {
  if (_ragAvailable !== null) return _ragAvailable;

  // 前置检查：低版本 Node 无法运行 RAG 依赖，先于探测给出明确原因
  if (!isNodeVersionSupported()) {
    _ragAvailable = false;
    _lastProbeError = null;
    console.log(`[RAG] ${tr('rag.nodeVersionLow', { version: process.version })}`);
    return _ragAvailable;
  }

  const probe = await runRagProbe(opts);
  _ragAvailable = probe.ok;
  _lastProbeError = probe.errorSummary;

  if (!_ragAvailable) {
    console.log(`[RAG] ${tr('rag.depsMissing')}${_lastProbeError ? ` - ${_lastProbeError}` : ''}`);
    // 结构化日志：daemon 的 stdout 不可见，失败原因必须落到日志文件（否则完全不可诊断）
    logSystem('rag_detect_failed', { error: _lastProbeError || 'unknown' });
  } else {
    console.log(`[RAG] ${tr('rag.depsReady')}`);
  }

  return _ragAvailable;
}

/**
 * 同步获取缓存的检测结果（完整检测在启动时异步完成）
 * @returns {boolean}
 */
export function isRagAvailable() {
  return _ragAvailable === true;
}

/**
 * 获取最近一次探测失败的错误摘要（未探测/无错误为 null）
 * @returns {string|null}
 */
export function getLastRagProbeError() {
  return _lastProbeError;
}

/**
 * 重置检测结果（用于手动安装依赖后重新检测）
 */
export function resetRagDetection() {
  _ragAvailable = null;
  _lastProbeError = null;
}
