// agent/src/asr/install.js - 语音输入可选依赖一键安装
//
// 安全设计（与 rag/install.js 同构，刻意不共有代码以免改动 RAG 的已验证行为）：
//   - 不接受调用方传入的包名：安装清单是包自身 package.json 的 asrDependencies 字段
//     （单一事实来源），安装命令显式携带该清单构建的 pkg@spec
//   - 非 Windows 严格 shell: false；Windows 优先用当前 Node 直执行 npm-cli.js
//     （shell: false，规避 cmd 把 pkg@^x.y.z 的 ^ 当转义符吞掉），探测不到时降级
//     npm.cmd + shell: true 并对 spec 加双引号（参数为纯静态常量，无用户输入，无注入面）
//   - 异步任务 + 安装锁（同一时刻仅一个任务），超时上限 10 分钟
//   - POSIX 以 detached: true 启动 npm（进程组组长），终止走进程树组杀
//   - 状态持久化到 ~/.ai-helper-agent/asr-install-state.json：重启后把「运行中」收敛为「已中止」
//   - 安装完成后在子进程重新探测依赖（防「装上但加载失败」的假成功）
//
// 与 RAG 的唯一刻意差异：**不做自动重装**。ASR 包体大（约 300MB+），自动重装会在用户
// 无感知的情况下拉满带宽；只记录 everSucceeded，状态里提示「依赖已被清理，请点击重新安装」。

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resetAsrDetection, detectAsrAvailable, getLastAsrProbeError } from './detect.js';
import { stopProcessTree } from '../process-tree.js';
import { logSystem } from '../logger.js';
import { t as translate, parseAcceptLanguage } from '../i18n.js';
import { getRegistryUrl } from '../install-mode.js';

/**
 * agent 包根目录（install.js 位于 <agent>/src/asr/，向上两级）
 */
function getAgentRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/**
 * 读取包内 package.json 的 asrDependencies（读取失败/字段缺失返回空，由构建方拒绝安装）
 * @returns {Array<[string, string]>}
 */
function readAsrDependencies() {
  try {
    const raw = JSON.parse(readFileSync(join(getAgentRoot(), 'package.json'), 'utf-8'));
    const deps = raw && typeof raw.asrDependencies === 'object' && raw.asrDependencies !== null
      ? raw.asrDependencies
      : {};
    return Object.entries(deps).filter(([name, spec]) => name && typeof spec === 'string' && spec.trim());
  } catch {
    return [];
  }
}

const ASR_DEPENDENCY_ENTRIES = readAsrDependencies();

// 包名清单（供状态接口/前端展示）
export const ASR_INSTALL_PACKAGES = ASR_DEPENDENCY_ENTRIES.map(([name]) => name);

/**
 * 安装 spec 列表（name@version-range）：一键安装命令的显式参数
 * @returns {string[]}
 */
export function getAsrInstallSpecs() {
  return ASR_DEPENDENCY_ENTRIES.map(([name, spec]) => `${name}@${spec}`);
}

/**
 * 取 spec 的包名（兼容 scoped：@scope/pkg@^1.0.0 → @scope/pkg）
 * @param {string} spec
 * @returns {string}
 */
function specName(spec) {
  const idx = spec.lastIndexOf('@');
  return idx > 0 ? spec.slice(0, idx) : spec;
}

/**
 * 读取「对侧」可选组件（RAG）曾安装成功的依赖 spec，用于合并安装
 *
 * 背景（实测缺陷）：ASR 与 RAG 的可选依赖都以 `npm install --no-save` 装在同一个
 * 包目录里。npm 执行带包名的 install 时会按依赖树重算包目录，把不在本次清单内的
 * 顶层包当作 extraneous 移除——只带自己清单安装，就会把 RAG 整组依赖清掉。
 * 判据用对侧状态文件的 everSucceeded（持久化，不随目录被清而丢失）：只要对方曾经
 * 装成功过，就把它的清单一起带上，既避免互相清除，也顺带恢复已被清掉的对方。
 * @returns {string[]}
 */
function readPeerPreservedSpecs() {
  try {
    const stateFile = join(homedir(), '.ai-helper-agent', 'rag-install-state.json');
    if (!existsSync(stateFile)) return [];
    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    if (!state || state.everSucceeded !== true) return [];
    const raw = JSON.parse(readFileSync(join(getAgentRoot(), 'package.json'), 'utf-8'));
    const deps = raw && typeof raw.ragDependencies === 'object' && raw.ragDependencies !== null
      ? raw.ragDependencies
      : {};
    return Object.entries(deps)
      .filter(([name, spec]) => name && typeof spec === 'string' && spec.trim())
      .map(([name, spec]) => `${name}@${spec}`);
  } catch {
    return [];
  }
}

/**
 * 合并本组件清单与对侧保全清单（同名包以本组件 spec 为准，本组件顺序在前）
 * @param {string[]} ownSpecs
 * @param {string[]} peerSpecs
 * @returns {string[]}
 */
function mergePreservedSpecs(ownSpecs, peerSpecs) {
  const seen = new Set(ownSpecs.map(specName));
  const merged = [...ownSpecs];
  for (const spec of peerSpecs) {
    const name = specName(spec);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    merged.push(spec);
  }
  return merged;
}

/**
 * Windows：定位与 node 同目录分布的 npm-cli.js
 * @param {string} execPath
 * @returns {string|null}
 */
function findWinNpmCli(execPath) {
  const candidate = join(dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return existsSync(candidate) ? candidate : null;
}

/**
 * 构建 ASR 依赖安装命令（API 一键安装与 CLI 共用；参数可注入供测试）
 * @param {{ isWin?: boolean, execPath?: string, specs?: string[], registry?: string|null, cwd?: string }} [opts]
 * @returns {{ command: string, args: string[], shell: boolean, cwd: string }}
 */
export function buildAsrInstallCommand(opts = {}) {
  const isWin = opts.isWin ?? process.platform === 'win32';
  const execPath = opts.execPath ?? process.execPath;
  const ownSpecs = opts.specs ?? getAsrInstallSpecs();
  if (ownSpecs.length === 0) {
    // 包损坏/被裁剪：拒绝构建（无包名参数的 npm install 会按依赖树重算包目录，不可接受）
    throw new Error('asrDependencies missing in package.json');
  }
  // 显式注入 specs（测试/诊断）视为精确清单，不做对侧保全
  const specs = opts.specs ? ownSpecs : mergePreservedSpecs(ownSpecs, readPeerPreservedSpecs());
  const registryUrl = opts.registry ?? getRegistryUrl();
  const baseArgs = ['install', '--no-save', '--no-audit', '--no-fund'];
  if (registryUrl) baseArgs.push(`--registry=${registryUrl}`);
  const cwd = opts.cwd ?? getAgentRoot();
  if (isWin) {
    const npmCli = findWinNpmCli(execPath);
    if (npmCli) return { command: execPath, args: [npmCli, ...baseArgs, ...specs], shell: false, cwd };
    return { command: 'npm.cmd', args: [...baseArgs, ...specs.map((s) => `"${s}"`)], shell: true, cwd };
  }
  return { command: 'npm', args: [...baseArgs, ...specs], shell: false, cwd };
}

// 单次安装超时上限（10 分钟；需下载约 300MB 原生依赖）
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

// 安装日志保留上限（行数）
const LOG_TAIL_LIMIT = 50;

// 任务状态持久化文件
const STATE_FILE = join(homedir(), '.ai-helper-agent', 'asr-install-state.json');

// 模块级语言：无请求上下文的场景（停服中止、重启收敛）消息用
const moduleT = (key, params) => translate(parseAcceptLanguage(), key, params);

// 安装任务状态（null = 从未安装）
let installTask = null;

// 运行中的 npm 子进程
let npmChild = null;

/**
 * 收敛持久化字段（防状态文件被篡改/损坏）
 */
function sanitizePersistedState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    running: raw.running === true,
    done: raw.done === true,
    success: raw.success === true,
    everSucceeded: raw.everSucceeded === true,
    phase: typeof raw.phase === 'string' ? raw.phase : null,
    logTail: Array.isArray(raw.logTail) ? raw.logTail.filter((l) => typeof l === 'string').slice(-LOG_TAIL_LIMIT) : [],
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : null,
    finishedAt: typeof raw.finishedAt === 'number' ? raw.finishedAt : null,
    error: typeof raw.error === 'string' ? raw.error : null,
  };
}

/**
 * 持久化当前任务状态（写失败不阻塞安装主流程）
 */
function savePersistedState() {
  if (!installTask) return;
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({
      running: installTask.running,
      done: installTask.done,
      success: installTask.success,
      everSucceeded: installTask.everSucceeded === true,
      phase: installTask.phase,
      logTail: installTask.logTail.slice(-LOG_TAIL_LIMIT),
      startedAt: installTask.startedAt,
      finishedAt: installTask.finishedAt,
      error: installTask.error,
    }), 'utf-8');
  } catch (err) {
    console.warn(`[ASR] persist install state failed: ${err.message}`);
  }
}

// 模块加载时恢复上次任务状态：上次标记「运行中」说明进程被杀，收敛为「已中止」
(function restorePersistedState() {
  let persisted = null;
  try {
    persisted = sanitizePersistedState(JSON.parse(readFileSync(STATE_FILE, 'utf-8')));
  } catch {
    persisted = null;
  }
  if (!persisted) return;
  installTask = { ...persisted };
  if (!persisted.running) return;
  installTask.running = false;
  installTask.done = true;
  installTask.success = false;
  installTask.phase = 'done';
  installTask.finishedAt = Date.now();
  installTask.error = moduleT('asr.installAborted');
  savePersistedState();
})();

/**
 * 启动 ASR 依赖安装（异步任务，立即返回）
 * @param {Function} t 请求级翻译函数
 * @returns {{ started: boolean, error?: string }}
 */
export function startAsrInstall(t) {
  if (installTask && installTask.running) {
    // alreadyRunning 让前端区分「已在安装中」与「安装失败」：前者不该弹错误提示，
    // 直接把界面切到进度态继续轮询（用户重复点击是常态，不是异常）
    return { started: false, alreadyRunning: true, error: t('asr.installRunning') };
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
    trigger: 'manual',
    // 「曾成功安装过」只增不减
    everSucceeded: Boolean(installTask && installTask.everSucceeded === true),
  };
  installTask = task;
  savePersistedState();

  runInstall(task, t).catch((err) => {
    task.running = false;
    task.done = true;
    task.success = false;
    task.phase = 'done';
    task.error = err.message;
    task.finishedAt = Date.now();
    savePersistedState();
  });

  return { started: true, alreadyRunning: false };
}

/**
 * 获取安装任务状态（供前端轮询）
 * @returns {object}
 */
export function getAsrInstallStatus() {
  if (!installTask) {
    return {
      running: false,
      done: false,
      success: false,
      everSucceeded: false,
      phase: null,
      logTail: [],
      startedAt: null,
      finishedAt: null,
      error: null,
      packages: ASR_INSTALL_PACKAGES,
    };
  }
  return { ...installTask, packages: ASR_INSTALL_PACKAGES };
}

/**
 * 是否曾成功安装过（前端据此提示「依赖已被清理，请重新安装」）
 * @returns {boolean}
 */
export function hasAsrEverInstalled() {
  return Boolean(installTask && installTask.everSucceeded === true);
}

/**
 * 中止运行中的安装并终止 npm 进程树（停服/重启路径调用）
 * 幂等：无运行中的任务时返回 false
 * @returns {Promise<boolean>}
 */
export async function stopAsrInstall() {
  const task = installTask;
  const wasRunning = Boolean(task && task.running);
  if (wasRunning) {
    task.running = false;
    task.done = true;
    task.success = false;
    task.phase = 'done';
    task.finishedAt = Date.now();
    task.error = moduleT('asr.installAborted');
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

  // 已被 stopAsrInstall 中止：状态已收敛并持久化，勿覆写
  if (task.aborted) return;

  if (!result.success) {
    task.running = false;
    task.done = true;
    task.success = false;
    task.phase = 'done';
    task.error = result.error;
    task.finishedAt = Date.now();
    savePersistedState();
    console.log(`[ASR] ${result.error}`);
    return;
  }

  // npm 退出码 0 → 子进程重新探测（以真实加载结果为准，避免假成功）
  task.phase = 'verifying';
  resetAsrDetection();
  const available = await detectAsrAvailable({ force: true });

  task.running = false;
  task.done = true;
  task.success = available;
  if (available) task.everSucceeded = true;
  task.phase = 'done';
  task.finishedAt = Date.now();
  if (!available) {
    const reason = getLastAsrProbeError();
    task.error = reason ? `${t('asr.verifyFailed')} - ${reason}` : t('asr.verifyFailed');
    if (reason) {
      task.logTail.push(`[verify] ${reason}`);
      if (task.logTail.length > LOG_TAIL_LIMIT) task.logTail = task.logTail.slice(-LOG_TAIL_LIMIT);
    }
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
    let cmd;
    try {
      cmd = buildAsrInstallCommand();
    } catch (err) {
      resolvePromise({ success: false, error: t('asr.installFailed', { message: err.message }) });
      return;
    }

    const npm = spawn(cmd.command, cmd.args, {
      shell: cmd.shell,
      detached: !isWin,
      cwd: cmd.cwd,
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
      finish({ success: false, error: t('asr.installFailed', { message: err.message }) });
    });

    timer = setTimeout(() => {
      finish({ success: false, error: t('asr.installTimeout') });
      stopProcessTree(npm, { graceMs: 5000 }).catch(() => {});
    }, INSTALL_TIMEOUT_MS);
    timer.unref();

    npm.on('close', (code) => {
      if (npmChild === npm) npmChild = null;
      finish(code === 0
        ? { success: true }
        : { success: false, error: t('asr.installFailed', { message: `exit code ${code}` }) });
    });
  });
}
