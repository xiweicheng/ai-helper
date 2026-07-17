// agent/src/executor.js - 命令执行器（child_process + 流式输出）
import { spawn, exec } from 'child_process';
import crypto from 'crypto';
import os from 'os';
import { loadConfig } from './config.js';

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
          if (require('fs').existsSync(path)) {
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

// 运行中的进程映射：execId → { process, wsClients: Set, timeoutId, forceKillId }
const runningProcesses = new Map();

// 安全的子进程环境变量白名单（不泄露宿主敏感信息）
const SAFE_ENV_KEYS = [
  'PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'PWD', 'OLDPWD', 'NODE_PATH', 'MANPATH', 'INFOPATH',
  'XDG_SESSION_TYPE', 'DISPLAY', 'SSH_AUTH_SOCK', 'COLORTERM',
  'EDITOR', 'VISUAL', 'PAGER', 'BROWSER',
  'GIT_EDITOR', 'GIT_PAGER', 'GIT_SSH_COMMAND',
  // 平台相关
  'TMPDIR', 'TEMPDIR', 'TEMP', 'TMP',
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
  const proc = spawn(shell, [...args, command], {
    cwd: workdir,
    env: buildSafeEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  const wsClients = new Set();
  if (wsClient) wsClients.add(wsClient);

  let stdoutCollected = '';
  let stderrCollected = '';
  let killed = false;
  let finished = false; // 防止 close/error 重复处理

  // 存储到 entry 中供 clearTimers 读取
  const entry = { process: proc, wsClients };
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
    broadcast({ type: 'stdout', data: str, execId });
  });

  // stderr 流式输出
  proc.stderr.on('data', (chunk) => {
    const str = chunk.toString();
    if (collectOutput) stderrCollected += str;
    broadcast({ type: 'stderr', data: str, execId });
  });

  // 进程结束
  proc.on('close', (exitCode) => {
    if (finished) return;
    finished = true;
    clearTimers();
    broadcast({ type: 'exit', exitCode: typeof exitCode === 'number' ? exitCode : -1, execId, killed });
    runningProcesses.delete(execId);
    if (onComplete) {
      onComplete({
        execId,
        exitCode: typeof exitCode === 'number' ? exitCode : -1,
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
        resolve({ execId, exitCode: -1, killed: true, stdout: '', stderr: '', error: 'Command timed out' });
      }
    }, timeout + 5000);
  });
}

/**
 * 添加 WebSocket 客户端到已有进程的监听中
 */
function addWsClient(execId, wsClient) {
  const entry = runningProcesses.get(execId);
  if (entry) {
    entry.wsClients.add(wsClient);
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
 * 停止正在运行的命令（跨平台兼容）
 * - macOS/Linux: SIGTERM（优雅终止）→ 5s → SIGKILL（强制杀）
 * - Windows: taskkill /PID（优雅终止）→ 5s → taskkill /F /PID（强制杀）
 */
function killProcess(execId) {
  const entry = runningProcesses.get(execId);
  if (!entry) return false;

  if (entry.process.exitCode !== null) return false; // 已退出

  const isWin = os.platform() === 'win32';
  const pid = entry.process.pid;

  if (isWin) {
    // Windows: taskkill 支持优雅终止（/PID 发送 WM_CLOSE）和强制终止（/F）
    exec(`taskkill /PID ${pid}`, (err) => {
      if (err) {
        // 尝试强制杀
        exec(`taskkill /F /PID ${pid}`, () => {});
      }
    });
  } else {
    // macOS/Linux: SIGTERM 优雅终止
    try {
      entry.process.kill('SIGTERM');
    } catch {}
  }

  // 清理旧的定时器
  if (entry.timeoutId) {
    clearTimeout(entry.timeoutId);
    entry.timeoutId = null;
  }
  if (entry.forceKillId) {
    clearTimeout(entry.forceKillId);
  }

  // 5秒后强制杀（绑定到 entry 对象防止闭包引用旧变量）
  entry.forceKillId = setTimeout(() => {
    try {
      if (entry.process.exitCode === null) {
        if (isWin) {
          exec(`taskkill /F /PID ${pid}`, () => {});
        } else {
          entry.process.kill('SIGKILL');
        }
      }
    } catch {}
    entry.forceKillId = null;
  }, 5000);

  return true;
}

/**
 * 获取运行中的进程列表
 */
function getRunningProcesses() {
  const list = [];
  for (const [execId] of runningProcesses) {
    list.push({ execId });
  }
  return list;
}

export { executeCommand, executeCommandSync, addWsClient, disconnectWsClient, killProcess, getRunningProcesses };
