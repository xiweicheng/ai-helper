// agent/src/asr/detect.js - 语音输入可选依赖运行时检测
//
// 与 RAG 检测的关键差异（见计划「安装与启用策略」第 4 条）：
//   - RAG 每次启动都起子进程探测；ASR 否则会给「未装依赖」的绝大多数用户白付一次
//     onnxruntime 加载（数百 MB 常驻）。因此先做零成本磁盘判定：
//       asr-config.json / node_modules/sherpa-onnx-node/package.json 任一缺失 → 直接不可用
//   - 只有「看起来装过」才起子进程确认（超时 3s，比 RAG 的 60s 短：这里只 require 一个包）
//   - 不做自动重装：包体大，只记录 everSucceeded，由用户显式点「重新安装」

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { t as translate } from '../i18n.js';
import { logSystem } from '../logger.js';

// 默认使用 en（独立调用场景）；server.js 在请求入口处同步请求语言
let currentLang = 'en';

/**
 * 设置 ASR 模块当前使用的语言
 * @param {string} lang
 */
export function setAsrLang(lang) {
  if (lang) currentLang = lang;
}

function tr(key, params) {
  return translate(currentLang, key, params);
}

// 缓存检测结果（null = 未检测）
let _asrAvailable = null;

// 最近一次探测的错误摘要
let _lastProbeError = null;

// 最近一次探测到的依赖版本（供状态接口展示）
let _probeVersion = null;

// 探测子进程脚本（与 detect.js 同目录）
const PROBE_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'probe-child.mjs');

// 探测超时：只 require 一个包，3s 足够；卡住即判失败，绝不让启动流程等 60s
const PROBE_TIMEOUT_MS = 3_000;

/**
 * agent 包根目录（detect.js 位于 <agent>/src/asr/，向上两级）
 */
function getAgentRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/**
 * 零成本磁盘判定：包目录内是否真的存在 sherpa-onnx-node
 * @returns {boolean}
 */
export function hasAsrPackageOnDisk() {
  // 与 AI_HELPER_ASR_DEPS=0 保持一致：强制"不可用"时磁盘判定也应视为未安装，
  // 否则状态里会出现「ready=false 但 packageOnDisk=true」的矛盾组合
  if (process.env.AI_HELPER_ASR_DEPS === '0') return false;
  try {
    return existsSync(join(getAgentRoot(), 'node_modules', 'sherpa-onnx-node', 'package.json'));
  } catch {
    return false;
  }
}

/**
 * 在全新子进程内探测 sherpa-onnx-node 可加载性
 * @param {{ probeScript?: string, timeoutMs?: number }} [opts] 仅测试注入用
 * @returns {Promise<{ ok: boolean, version: string|null, errorSummary: string|null }>}
 */
export function runAsrProbe(opts = {}) {
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
      finish({ ok: false, version: null, errorSummary: `probe spawn failed: ${err.message}` });
    });

    timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* 忽略 */ }
      finish({ ok: false, version: null, errorSummary: `probe timeout (${timeoutMs}ms)` });
    }, timeoutMs);
    timer.unref();

    child.on('close', (code) => {
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
        finish({
          ok: false,
          version: null,
          errorSummary: `probe failed (${why})${tail ? `: ${tail.slice(0, 300)}` : ''}`,
        });
        return;
      }
      const ok = detail.ok === true;
      const reason = typeof detail.error === 'string' && detail.error ? detail.error : null;
      finish({
        ok,
        version: ok && typeof detail.version === 'string' ? detail.version : null,
        errorSummary: ok ? null : (reason ? reason.slice(0, 400) : 'unknown error'),
      });
    });
  });
}

/**
 * 检测 ASR 依赖是否可用（结果缓存）
 *
 * 判定顺序（零成本优先）：
 *   1. AI_HELPER_ASR_DEPS=1|0 显式覆盖（单测环境隔离 / 现场诊断用）
 *   2. 已探测过 → 返回缓存
 *   3. node_modules 内无 sherpa-onnx-node → 直接不可用（不起子进程）
 *   4. 子进程探测（真实反映磁盘状态）
 * @param {{ force?: boolean, probeScript?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<boolean>}
 */
export async function detectAsrAvailable(opts = {}) {
  // 显式覆盖：单测需要确定结果，而探测结果取决于本机是否真的装了 sherpa-onnx-node
  // （装了就是 true），不覆盖会让断言随开发机状态飘移
  const override = process.env.AI_HELPER_ASR_DEPS;
  if (override === '1' || override === '0') {
    const forced = override === '1';
    _asrAvailable = forced;
    _lastProbeError = forced ? null : 'forced_unavailable (AI_HELPER_ASR_DEPS=0)';
    _probeVersion = null;
    return forced;
  }

  if (!opts.force && _asrAvailable !== null) return _asrAvailable;

  if (!hasAsrPackageOnDisk()) {
    _asrAvailable = false;
    _lastProbeError = null;
    _probeVersion = null;
    console.log(`[ASR] ${tr('asr.depsMissing')}`);
    return _asrAvailable;
  }

  const probe = await runAsrProbe(opts);
  _asrAvailable = probe.ok;
  _lastProbeError = probe.errorSummary;
  _probeVersion = probe.version;

  if (!_asrAvailable) {
    console.log(`[ASR] ${tr('asr.depsMissing')}${_lastProbeError ? ` - ${_lastProbeError}` : ''}`);
    logSystem('asr_detect_failed', { error: _lastProbeError || 'unknown' });
  } else {
    console.log(`[ASR] ${tr('asr.depsReady')}`);
  }
  return _asrAvailable;
}

/**
 * 同步读取缓存结果（启动期轻量判定用，不触发探测）
 * @returns {boolean}
 */
export function isAsrAvailable() {
  return _asrAvailable === true;
}

/**
 * 最近一次探测失败原因（无错误为 null）
 * @returns {string|null}
 */
export function getLastAsrProbeError() {
  return _lastProbeError;
}

/**
 * 最近一次探测到的依赖版本
 * @returns {string|null}
 */
export function getAsrProbeVersion() {
  return _probeVersion;
}

/**
 * 重置检测结果（重新检测 / 安装完成后调用）
 */
export function resetAsrDetection() {
  _asrAvailable = null;
  _lastProbeError = null;
  _probeVersion = null;
}
