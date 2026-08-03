// agent/src/executor.js - 命令执行器（child_process + 流式输出）
import { spawn, exec } from 'child_process';
import { existsSync } from 'fs';
import crypto from 'crypto';
import os from 'os';
import { loadConfig } from './config.js';
import { t as translate } from './i18n.js';

// 当前模块使用的语言（由 server.js 在请求入口处设置）
let currentLang = 'zh';

/**
 * 设置 executor 模块当前使用的语言（由 server.js 在请求入口处调用）
 * @param {string} lang - 语言代码（'zh' | 'en'）
 */
export function setExecutorLang(lang) {
  if (lang) currentLang = lang;
}

function getShellForExec() {
  const platform = os.platform();
  const envShell = process.env.SHELL || process.env.COMSPEC || '';

  if (platform === 'win32') {
    if (envShell.toLowerCase().includes('bash')) {
      return { shell: envShell, args: ['-c'] };
    } else if (envShell.toLowerCase().includes('powershell')) {
      return { shell: envShell, args: ['-Command'] };
    } else if (envShell.toLowerCase().includes('cmd')) {
      return { shell: envShell, args: ['/c'] };
    } else {
      const gitBashPaths = [
        'C:\\Program Files\\Git\\bin\\bash.exe',
        'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
        `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Git\\bin\\bash.exe`,
      ];
      for (const path of gitBashPaths) {
        try {
          if (existsSync(path)) {
            return { shell: path, args: ['-c'] };
          }
        } catch {}
      }
      return { shell: 'cmd.exe', args: ['/c'] };
    }
  }

  if (platform === 'darwin') {
    if (envShell.toLowerCase().includes('zsh')) {
      return { shell: envShell, args: ['-c'] };
    } else if (envShell.toLowerCase().includes('bash')) {
      return { shell: envShell, args: ['-c'] };
    }
    return { shell: '/bin/zsh', args: ['-c'] };
  }

  if (envShell.toLowerCase().includes('bash')) {
    return { shell: envShell, args: ['-c'] };
  } else if (envShell.toLowerCase().includes('zsh')) {
    return { shell: envShell, args: ['-c'] };
  } else if (envShell.toLowerCase().includes('fish')) {
    return { shell: envShell, args: ['-c'] };
  }
  return { shell: '/bin/bash', args: ['-c'] };
}

// 运行中的进程映射：execId → { process, wsClients: Set, timeoutId, forceKillId, stdoutBuf, stderrBuf }
const runningProcesses = new Map();

// 输出缓冲区上限（5MB），防止长时间命令内存无限增长
const MAX_OUTPUT_BUFFER = 5 * 1024 * 1024;

/**
 * 安全追加字符串到缓冲区，超过上限时截断并标记
 * @param {string} buf - 当前缓冲区
 * @param {string} chunk - 要追加的字符串
 * @param {object} truncState - 截断状态对象 { truncated: boolean }
 * @returns {string} 更新后的缓冲区
 */
function appendWithLimit(buf, chunk, truncState) {
  if (truncState.truncated) return buf;
  if (buf.length + chunk.length > MAX_OUTPUT_BUFFER) {
    truncState.truncated = true;
    const remaining = MAX_OUTPUT_BUFFER - buf.length;
    return buf + (remaining > 0 ? chunk.slice(0, remaining) : '');
  }
  return buf + chunk;
}
const completedProcesses = new Map();
const COMPLETED_CACHE_TTL = 30000; // 30秒后清理

// 安全的子进程环境变量白名单（不泄露宿主敏感信息）
const SAFE_ENV_KEYS = [
  'PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'PWD', 'OLDPWD', 'NODE_PATH', 'MANPATH', 'INFOPATH',
  'XDG_SESSION_TYPE', 'DISPLAY', 'SSH_AUTH_SOCK', 'COLORTERM',
  'EDITOR', 'VISUAL', 'PAGER', 'BROWSER',
  'GIT_EDITOR', 'GIT_PAGER', 'GIT_SSH_COMMAND',
  // 平台相关
  'TMPDIR', 'TEMPDIR', 'TEMP', 'TMP',
  // Windows 必要环境变量（cmd/powershell 及其子进程依赖）
  // 缺失 COMSPEC/PATHEXT/SystemRoot 会导致 cmd 命令解析异常、npm 等工具找不到；
  // 缺失 PSModulePath 会导致 PowerShell 找不到模块
  'COMSPEC', 'PATHEXT', 'SystemRoot', 'WINDIR',
  'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'PROGRAMDATA',
  'PSModulePath', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
  // 常用工具
  'NVM_DIR', 'NVM_BIN', 'JAVA_HOME', 'GOPATH', 'GOROOT', 'CARGO_HOME',
  'RUSTUP_HOME', 'PYTHONPATH', 'VIRTUAL_ENV', 'CONDA_PREFIX',
  'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'GRADLE_HOME',
  'PKG_CONFIG_PATH', 'LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH',
  // 颜色/格式化
  'NO_COLOR', 'CLICOLOR', 'CLICOLOR_FORCE', 'FORCE_COLOR'
];

/**
 * 构建安全的子进程环境变量
 */
function buildSafeEnv() {
  const env = {};
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  // 强制覆盖
  env.TERM = 'dumb';
  env.FORCE_COLOR = '0';
  return env;
}

/**
 * 生成唯一执行 ID
 */
function generateExecId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * 执行命令并通过 WebSocket 流式输出
 * @param {string} command - 完整命令字符串
 * @param {string} [cwd] - 工作目录
 * @param {Object} wsClient - 单个 WebSocket 客户端（用于流式输出）
 * @param {Function} onComplete - 完成回调 ({ execId, exitCode, killed, stdout?, stderr? })
 * @param {boolean} [collectOutput=false] - 是否收集完整 stdout/stderr 到内存
 * @returns {string} execId
 */
function executeCommand(command, cwd, wsClient, onComplete, collectOutput = false) {
  const config = loadConfig();
  const workdir = cwd || config.workdir;
  const execId = generateExecId();
  const timeout = config.commandTimeout || 300000;

  const { shell, args } = getShellForExec();
  // detached 的取舍（按平台 + shell 类型）：
  // - Unix（macOS/Linux）：任何 shell（zsh/bash/fish 等）都不弹窗（无控制台窗口概念），
  //   且 detached 才能让 killProcess 的 process.kill(-pid) 杀掉整个进程组 → 始终启用。
  // - Windows：分两类 shell——
  //   1) MSYS/Cygwin 系（Git Bash/MSYS2/Cygwin 的 bash/zsh/fish 等）：通过 pty 模拟层，
  //      不依赖 Windows 控制台，detached 不会 AllocConsole → 不弹窗，可安全 detach。
  //   2) Windows 原生控制台程序（cmd/powershell/pwsh 等）：detached 脱离父控制台后会
  //      AllocConsole 创建可见窗口（黑窗），windowsHide 管不住 → 必须禁用 detached。
  //      进程树终止改靠 taskkill /T /PID（killProcess Windows 分支），不依赖 detached。
  //   用黑名单精确识别会弹窗的原生控制台程序，其余（含 MSMS/Cygwin 系）默认 detach。
  const isWin = os.platform() === 'win32';
  const isWinConsoleShell = isWin && /\b(cmd|powershell|pwsh)\b/i.test(shell);
  const proc = spawn(shell, [...args, command], {
    cwd: workdir,
    env: buildSafeEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWinConsoleShell,
    windowsHide: true
  });

  const wsClients = new Set();
  if (wsClient) wsClients.add(wsClient);

  let stdoutCollected = '';
  let stderrCollected = '';
  let killed = false;
  let finished = false; // 防止 close/error 重复处理

  // 存储到 entry 中供 clearTimers 读取
  // stdoutBuf/stderrBuf 始终收集，用于回放给延迟连接的 WS 客户端
  // command/startTime 用于状态详情面板展示运行中进程
  const entry = { process: proc, wsClients, stdoutBuf: '', stderrBuf: '', truncStdout: false, truncStderr: false, command, startTime: Date.now() };
  runningProcesses.set(execId, entry);

  // 超时控制
  entry.timeoutId = setTimeout(() => {
    killed = true;
    killProcess(execId);
  }, timeout);

  // 广播消息给所有连接的 WS 客户端
  function broadcast(data) {
    const msg = JSON.stringify(data);
    for (const client of wsClients) {
      if (client.readyState === 1) {
        client.send(msg);
      }
    }
  }

  // 清理所有定时器
  function clearTimers() {
    clearTimeout(entry.timeoutId);
    entry.timeoutId = null;
    if (entry.forceKillId !== null && entry.forceKillId !== undefined) {
      clearTimeout(entry.forceKillId);
      entry.forceKillId = null;
    }
  }

  // stdout 流式输出
  proc.stdout.on('data', (chunk) => {
    const str = chunk.toString();
    if (collectOutput) stdoutCollected += str;
    const truncState = { truncated: entry.truncStdout };
    entry.stdoutBuf = appendWithLimit(entry.stdoutBuf, str, truncState);
    entry.truncStdout = truncState.truncated;
    if (truncState.truncated) {
      broadcast({ type: 'stdout_truncated', message: translate(currentLang, 'error.stdoutTruncated'), execId });
    }
    broadcast({ type: 'stdout', data: str, execId });
  });

  // stderr 流式输出
  proc.stderr.on('data', (chunk) => {
    const str = chunk.toString();
    if (collectOutput) stderrCollected += str;
    const truncState = { truncated: entry.truncStderr };
    entry.stderrBuf = appendWithLimit(entry.stderrBuf, str, truncState);
    entry.truncStderr = truncState.truncated;
    if (truncState.truncated) {
      broadcast({ type: 'stderr_truncated', message: translate(currentLang, 'error.stderrTruncated'), execId });
    }
    broadcast({ type: 'stderr', data: str, execId });
  });

  // 进程结束
  proc.on('close', (exitCode) => {
    if (finished) return;
    finished = true;
    clearTimers();
    const finalExitCode = typeof exitCode === 'number' ? exitCode : -1;
    broadcast({ type: 'exit', exitCode: finalExitCode, execId, killed });
    // 移入已完成缓存，解决竞态条件：延迟连接的 WS 客户端可回放输出
    const cleanupTimeout = setTimeout(() => {
      completedProcesses.delete(execId);
    }, COMPLETED_CACHE_TTL);
    completedProcesses.set(execId, {
      stdoutBuf: entry.stdoutBuf,
      stderrBuf: entry.stderrBuf,
      exitCode: finalExitCode,
      killed,
      cleanupTimeout
    });
    runningProcesses.delete(execId);
    if (onComplete) {
      onComplete({
        execId,
        exitCode: finalExitCode,
        killed,
        stdout: collectOutput ? stdoutCollected : undefined,
        stderr: collectOutput ? stderrCollected : undefined
      });
    }
  });

  // 进程错误
  proc.on('error', (err) => {
    if (finished) return;
    finished = true;
    clearTimers();
    broadcast({ type: 'error', error: err.message, execId });
    // 移入已完成缓存
    const cleanupTimeout = setTimeout(() => {
      completedProcesses.delete(execId);
    }, COMPLETED_CACHE_TTL);
    completedProcesses.set(execId, {
      stdoutBuf: entry.stdoutBuf,
      stderrBuf: entry.stderrBuf,
      exitCode: -1,
      killed: false,
      error: err.message,
      cleanupTimeout
    });
    runningProcesses.delete(execId);
    if (onComplete) {
      onComplete({
        execId, exitCode: -1, killed: false,
        error: err.message,
        stdout: collectOutput ? stdoutCollected : undefined,
        stderr: collectOutput ? stderrCollected : undefined
      });
    }
  });

  return execId;
}

/**
 * 同步执行命令（阻塞等待完成，返回完整输出）
 * @returns {Promise<{execId, exitCode, stdout, stderr, killed, error?}>}
 */
function executeCommandSync(command, cwd) {
  return new Promise((resolve) => {
    const config = loadConfig();
    const timeout = config.commandTimeout || 300000;

    let resolved = false;
    let syncTimeoutId = null;

    const execId = executeCommand(command, cwd, null, (result) => {
      clearTimeout(syncTimeoutId);
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    }, true);

    // 超时兜底（超时后额外 5s 用于 kill 完成）
    syncTimeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        killProcess(execId);
        resolve({ execId, exitCode: -1, killed: true, stdout: '', stderr: '', error: translate(currentLang, 'error.commandTimeout') });
      }
    }, timeout + 5000);
  });
}

/**
 * 添加 WebSocket 客户端到已有进程的监听中
 * 如果进程已结束，从 completedProcesses 缓存回放全部输出
 */
function addWsClient(execId, wsClient) {
  const entry = runningProcesses.get(execId);
  if (entry) {
    entry.wsClients.add(wsClient);
    return true;
  }
  // 进程已结束，检查缓存并回放全部输出
  const completed = completedProcesses.get(execId);
  if (completed) {
    if (completed.stdoutBuf) {
      wsClient.send(JSON.stringify({ type: 'stdout', data: completed.stdoutBuf, execId }));
    }
    if (completed.stderrBuf) {
      wsClient.send(JSON.stringify({ type: 'stderr', data: completed.stderrBuf, execId }));
    }
    if (completed.error) {
      wsClient.send(JSON.stringify({ type: 'error', error: completed.error, execId }));
    }
    wsClient.send(JSON.stringify({ type: 'exit', exitCode: completed.exitCode, execId, killed: completed.killed }));
    clearTimeout(completed.cleanupTimeout);
    completedProcesses.delete(execId);
    return true;
  }
  return false;
}

/**
 * 断开 WebSocket 客户端连接
 * 当所有客户端都断开后，取消超时定时器，让进程自由运行（不再自动杀）
 */
function disconnectWsClient(execId, wsClient) {
  const entry = runningProcesses.get(execId);
  if (!entry) return false;

  entry.wsClients.delete(wsClient);

  // 所有客户端都断开了 → 取消超时，进程继续运行
  if (entry.wsClients.size === 0) {
    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
      entry.timeoutId = null;
    }
    if (entry.forceKillId) {
      clearTimeout(entry.forceKillId);
      entry.forceKillId = null;
    }
  }
  return true;
}

/**
 * 停止正在运行的命令（跨平台兼容，递归终止全部子进程）
 * - macOS/Linux: SIGTERM to process group（-pid）→ 5s → SIGKILL to process group
 * - Windows: taskkill /T /PID（递归终止进程树）→ 5s → taskkill /F /T /PID
 */
function killProcess(execId) {
  const entry = runningProcesses.get(execId);
  if (!entry) return false;

  if (entry.process.exitCode !== null) return false; // 已退出

  const isWin = os.platform() === 'win32';
  const pid = entry.process.pid;

  if (isWin) {
    // Windows: /T 递归终止整个进程树
    spawn('taskkill', ['/T', '/PID', String(pid)], { windowsHide: true }).on('error', () => {
      spawn('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true });
    });
  } else {
    // Unix: 负 PID 表示杀整个进程组（detached + 未调用 setsid 时有效）
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      // 回退到单进程
      try { entry.process.kill('SIGTERM'); } catch {}
    }
  }

  // 清理旧的定时器
  if (entry.timeoutId) {
    clearTimeout(entry.timeoutId);
    entry.timeoutId = null;
  }
  if (entry.forceKillId) {
    clearTimeout(entry.forceKillId);
  }

  // 5秒后强制杀整个进程组
  entry.forceKillId = setTimeout(() => {
    try {
      if (entry.process.exitCode === null) {
        if (isWin) {
          spawn('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true });
        } else {
          try { process.kill(-pid, 'SIGKILL'); }
          catch { try { entry.process.kill('SIGKILL'); } catch {} }
        }
      }
    } catch {}
    entry.forceKillId = null;
  }, 5000);

  return true;
}

/**
 * 获取运行中的进程列表
 * 返回每个进程的 execId、pid、command、startTime、duration（已运行毫秒数）
 */
function getRunningProcesses() {
  const now = Date.now();
  const list = [];
  for (const [execId, entry] of runningProcesses) {
    list.push({
      execId,
      pid: entry.process && entry.process.pid ? entry.process.pid : null,
      command: entry.command || '',
      startTime: entry.startTime || null,
      duration: entry.startTime ? now - entry.startTime : 0
    });
  }
  return list;
}

export { executeCommand, executeCommandSync, addWsClient, disconnectWsClient, killProcess, getRunningProcesses };
