// agent/src/rag/install.js - RAG 可选依赖一键安装
//
// 安全设计（见 docs/RAG-Knowledge-Retrieval-Design.md 3.7）：
//   - 不接受调用方传入的包名（防止任意包注入）：安装清单是包自身 package.json 的
//     optionalDependencies 声明（单一事实来源），npm 命令不带任何包名参数
//   - 非 Windows 严格 shell: false；Windows 因 Node 修复 CVE-2024-27980 后不带 shell
//     无法执行 npm.cmd，降级为 shell: true（参数为纯静态常量，无任何用户输入，无注入面）
//   - 异步任务 + 安装锁（同一时刻仅允许一个安装任务），超时上限 10 分钟
//   - 安装完成后自动重新检测依赖可用性（防止"装上但加载失败"的假成功）

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { resetRagDetection, detectRagAvailable } from './detect.js';

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

// 安装任务状态（null = 从未安装）
let installTask = null;
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

  runInstall(task, t).catch((err) => {
    // 兜底：runInstall 内部已收敛所有错误，正常不应到达这里
    task.running = false;
    task.done = true;
    task.success = false;
    task.phase = 'done';
    task.error = err.message;
    task.finishedAt = Date.now();
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
 * 执行安装 + 安装后验证
 */
async function runInstall(task, t) {
  const result = await runNpmInstall(task, t);

  if (!result.success) {
    task.running = false;
    task.done = true;
    task.success = false;
    task.phase = 'done';
    task.error = result.error;
    task.finishedAt = Date.now();
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
      cwd: getAgentRoot(),
      env: { ...process.env },
      windowsHide: true,
    });

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
    npm.on('error', (err) => finish({ success: false, error: t('rag.installFailed', { message: err.message }) }));

    // 超时保护：超过上限强杀 npm，防止任务永久挂起
    timer = setTimeout(() => {
      try { npm.kill('SIGTERM'); } catch {}
      finish({ success: false, error: t('rag.installTimeout') });
    }, INSTALL_TIMEOUT_MS);
    timer.unref();

    npm.on('close', (code) => {
      finish(code === 0
        ? { success: true }
        : { success: false, error: t('rag.installFailed', { message: `exit code ${code}` }) });
    });
  });
}
