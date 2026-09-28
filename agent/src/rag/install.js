// agent/src/rag/install.js - RAG 可选依赖一键安装
//
// 安全设计（见 docs/RAG-Knowledge-Retrieval-Design.md 3.7）：
//   - 不接受调用方传入的包名（防止任意包注入）：安装清单是包自身 package.json 的
//     optionalDependencies 声明（单一事实来源），npm 命令不带任何包名参数
//   - 非 Windows 严格 shell: false；Windows 因 Node 修复 CVE-2024-27980 后不带 shell
//     无法执行 npm.cmd，降级为 shell: true（参数为纯静态常量，无任何用户输入，无注入面）
//   - 异步任务 + 安装锁（同一时刻仅允许一个安装任务），超时上限 10 分钟
// 进程治理（R1/R3）：
//   - 非 Windows 以 detached: true 启动 npm（进程组组长），终止走进程树组杀
//     （process-tree.js），防止 npm 孙进程变孤儿继续写 node_modules
//   - 任务状态持久化到 ~/.ai-helper-agent/rag-install-state.json：stopRagInstall（停服/重启）
//     与进程被杀后的重启加载都会把「运行中」收敛为「已中止」，状态不再只存在于内存
//   - 安装完成后自动重新检测依赖可用性（防止"装上但加载失败"的假成功）

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resetRagDetection, detectRagAvailable } from './detect.js';
import { stopProcessTree } from '../process-tree.js';
import { t as translate, parseAcceptLanguage } from '../i18n.js';

// 安装清单（与 package.json 的 optionalDependencies 保持一致，供状态接口/前端展示）
export const RAG_INSTALL_PACKAGES = [
  'vectra',
  '@huggingface/transformers',
  'pdf-parse',
  'mammoth',
  'officeparser',
  'cheerio',
];

// 单次安装超时上限（10 分钟；需下载约 200-300MB 原生依赖）
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

// 安装日志保留上限（行数，防止 npm 输出过长导致内存膨胀）
const LOG_TAIL_LIMIT = 50;

// 任务状态持久化文件（重启后判定「上次安装是否被中断」，R3）
const STATE_FILE = join(homedir(), '.ai-helper-agent', 'rag-install-state.json');

// 模块级语言：无请求上下文的场景（停服中止、重启恢复收敛）消息用
const moduleT = (key) => translate(parseAcceptLanguage(), key);

// 安装任务状态（null = 从未安装）
let installTask = null;

// 运行中的 npm 子进程（stopRagInstall 据此终止进程树）
let npmChild = null;
// {
//   running: boolean,        // 是否有安装任务正在执行
//   done: boolean,           // 是否已有一次安装完成记录
//   success: boolean,        // 最近一次安装是否成功（含安装后验证）
//   phase: string | null,    // installing → verifying → done
//   logTail: string[],       // npm 输出末尾日志
//   startedAt: number|null,  // 开始时间戳
//   finishedAt: number|null, // 完成时间戳
//   error: string | null,    // 失败原因
// }

/**
 * agent 包根目录（install.js 位于 <agent>/src/rag/，向上两级）
 */
function getAgentRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

// ==================== 状态持久化（R3） ====================

/**
 * 收敛持久化字段（防状态文件被篡改/损坏）
 */
function sanitizePersistedState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    running: raw.running === true,
    done: raw.done === true,
    success: raw.success === true,
    phase: typeof raw.phase === 'string' ? raw.phase : null,
    logTail: Array.isArray(raw.logTail) ? raw.logTail.filter((l) => typeof l === 'string').slice(-LOG_TAIL_LIMIT) : [],
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : null,
    finishedAt: typeof raw.finishedAt === 'number' ? raw.finishedAt : null,
    error: typeof raw.error === 'string' ? raw.error : null,
  };
}

/**
 * 持久化当前任务状态（展示/恢复判定用途；写失败不阻塞安装主流程）
 */
function savePersistedState() {
  if (!installTask) return;
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({
      running: installTask.running,
      done: installTask.done,
      success: installTask.success,
      phase: installTask.phase,
      logTail: installTask.logTail.slice(-LOG_TAIL_LIMIT),
      startedAt: installTask.startedAt,
      finishedAt: installTask.finishedAt,
      error: installTask.error,
    }), 'utf-8');
  } catch (err) {
    console.warn(`[RAG] persist install state failed: ${err.message}`);
  }
}

// 模块加载时恢复上次任务状态：若上次标记「运行中」（进程在安装中被杀），收敛为
// 「已中止」并回写（R3）——新进程不再假性 running，用户可重新触发安装
(function restorePersistedState() {
  let persisted = null;
  try {
    persisted = sanitizePersistedState(JSON.parse(readFileSync(STATE_FILE, 'utf-8')));
  } catch {
    persisted = null; // 无状态文件或文件损坏：按从未安装处理
  }
  if (!persisted) return;
  installTask = { ...persisted };
  if (!persisted.running) return;
  installTask.running = false;
  installTask.done = true;
  installTask.success = false;
  installTask.phase = 'done';
  installTask.finishedAt = Date.now();
  installTask.error = moduleT('rag.installAborted');
  savePersistedState();
})();

/**
 * 启动 RAG 依赖安装（异步任务，立即返回）
 * @param {Function} t - 请求级翻译函数
 * @returns {{ started: boolean, error?: string }}
 */
export function startRagInstall(t) {
  if (installTask && installTask.running) {
    return { started: false, error: t('error.ragInstallInProgress') };
  }

  const task = {
    running: true,
    done: false,
    success: false,
    phase: 'installing',
    logTail: [],
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
  };
  installTask = task;
  savePersistedState(); // 启动即持久化 running（R3：重启后可判定被中断）

  runInstall(task, t).catch((err) => {
    // 兜底：runInstall 内部已收敛所有错误，正常不应到达这里
    task.running = false;
    task.done = true;
    task.success = false;
    task.phase = 'done';
    task.error = err.message;
    task.finishedAt = Date.now();
    savePersistedState();
  });

  return { started: true };
}

/**
 * 获取安装任务状态（供前端轮询）
 * @returns {object}
 */
export function getRagInstallStatus() {
  if (!installTask) {
    return {
      running: false,
      done: false,
      success: false,
      phase: null,
      logTail: [],
      startedAt: null,
      finishedAt: null,
      error: null,
      packages: RAG_INSTALL_PACKAGES,
    };
  }
  return { ...installTask, packages: RAG_INSTALL_PACKAGES };
}

/**
 * 中止运行中的安装并终止 npm 进程树（停服/重启路径调用；R1/R3）
 * 幂等：无运行中的任务时返回 false 且不动作；先收敛状态（含持久化）再杀进程，
 * 配合 runInstall 的 aborted 守卫保证 close 收敛不覆写「已中止」
 * @returns {Promise<boolean>} 是否中止了一个运行中的任务
 */
export async function stopRagInstall() {
  const task = installTask;
  const wasRunning = Boolean(task && task.running);
  if (wasRunning) {
    task.running = false;
    task.done = true;
    task.success = false;
    task.phase = 'done';
    task.finishedAt = Date.now();
    task.error = moduleT('rag.installAborted');
    task.aborted = true;
    savePersistedState();
  }
  const child = npmChild;
  npmChild = null;
  if (child) {
    await stopProcessTree(child, { graceMs: 5000 });
  }
  return wasRunning;
}

/**
 * 执行安装 + 安装后验证
 */
async function runInstall(task, t) {
  const result = await runNpmInstall(task, t);

  // 已被 stopRagInstall 中止：状态已收敛并持久化，勿覆写（R3）
  if (task.aborted) return;

  if (!result.success) {
    task.running = false;
    task.done = true;
    task.success = false;
    task.phase = 'done';
    task.error = result.error;
    task.finishedAt = Date.now();
    savePersistedState();
    console.log(`[RAG] ${result.error}`);
    return;
  }

  // npm 退出码 0 → 重新检测依赖可用性（以 detect 结果为准，避免假成功）
  task.phase = 'verifying';
  resetRagDetection();
  const available = await detectRagAvailable();

  task.running = false;
  task.done = true;
  task.success = available;
  task.phase = 'done';
  task.finishedAt = Date.now();
  if (!available) {
    task.error = t('rag.verifyFailed');
  }
  savePersistedState();
}

/**
 * 执行 npm install（参数为纯静态常量，不含任何用户输入）
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
function runNpmInstall(task, t) {
  return new Promise((resolvePromise) => {
    const isWin = process.platform === 'win32';
    // 无包名参数：基于包自身 package.json 的 optionalDependencies 安装缺失依赖（单一事实来源）；
    // --no-save 保证不写回 package.json / package-lock.json，不污染已安装的包目录
    const args = ['install', '--no-save', '--no-audit', '--no-fund'];

    const npm = spawn(isWin ? 'npm.cmd' : 'npm', args, {
      shell: isWin,
      detached: !isWin, // POSIX：npm 作为进程组组长，终止时整树组杀（R1/R3）
      cwd: getAgentRoot(),
      env: { ...process.env },
      windowsHide: true,
    });
    npmChild = npm;

    const appendLog = (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        const trimmed = line.trim();
        if (trimmed) task.logTail.push(trimmed);
      }
      if (task.logTail.length > LOG_TAIL_LIMIT) {
        task.logTail = task.logTail.slice(-LOG_TAIL_LIMIT);
      }
    };

    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolvePromise(result);
    };

    npm.stdout.on('data', appendLog);
    npm.stderr.on('data', appendLog);
    npm.on('error', (err) => {
      if (npmChild === npm) npmChild = null;
      finish({ success: false, error: t('rag.installFailed', { message: err.message }) });
    });

    // 超时保护：超过上限终止 npm 进程树（组杀防孙进程孤儿），防止任务永久挂起
    timer = setTimeout(() => {
      finish({ success: false, error: t('rag.installTimeout') });
      stopProcessTree(npm, { graceMs: 5000 }).catch(() => {});
    }, INSTALL_TIMEOUT_MS);
    timer.unref();

    npm.on('close', (code) => {
      if (npmChild === npm) npmChild = null;
      finish(code === 0
        ? { success: true }
        : { success: false, error: t('rag.installFailed', { message: `exit code ${code}` }) });
    });
  });
}
