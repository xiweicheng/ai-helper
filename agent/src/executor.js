// agent/src/executor.js - 命令执行器（child_process + 流式输出）
import { spawn } from 'child_process';
import crypto from 'crypto';
import { loadConfig } from './config.js';

// 运行中的进程映射：execId → { process, wsClients: Set, timeoutId, forceKillId }
const runningProcesses = new Map();

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

  const proc = spawn('sh', ['-c', command], {
    cwd: workdir,
    env: { ...process.env, TERM: 'dumb', FORCE_COLOR: '0' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const wsClients = new Set();
  if (wsClient) wsClients.add(wsClient);

  let stdoutCollected = '';
  let stderrCollected = '';
  let killed = false;
  let forceKillId = null; // 追踪 SIGKILL 的 setTimeout

  runningProcesses.set(execId, { process: proc, wsClients });

  // 超时控制
  const timeoutId = setTimeout(() => {
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

  // 清理超时计时器
  function clearTimers() {
    clearTimeout(timeoutId);
    if (forceKillId !== null) {
      clearTimeout(forceKillId);
      forceKillId = null;
    }
  }

  // 进程结束
  proc.on('close', (exitCode) => {
    clearTimers();
    broadcast({ type: 'exit', exitCode, execId, killed });
    runningProcesses.delete(execId);
    if (onComplete) {
      onComplete({
        execId, exitCode, killed,
        stdout: collectOutput ? stdoutCollected : undefined,
        stderr: collectOutput ? stderrCollected : undefined
      });
    }
  });

  // 进程错误
  proc.on('error', (err) => {
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
  return new Promise((resolve, reject) => {
    const config = loadConfig();
    const timeout = config.commandTimeout || 300000;

    let resolved = false;

    const execId = executeCommand(command, cwd, null, (result) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    }, true);

    // 超时兜底
    setTimeout(() => {
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
 * 停止正在运行的命令
 */
function killProcess(execId) {
  const entry = runningProcesses.get(execId);
  if (entry) {
    try {
      entry.process.kill('SIGTERM');
    } catch {}
    // 5秒后强制 kill，保存 ID 以便后续清理
    const forceKillId = setTimeout(() => {
      try {
        if (entry.process.exitCode === null) {
          entry.process.kill('SIGKILL');
        }
      } catch {}
    }, 5000);
    entry.forceKillId = forceKillId;
    return true;
  }
  return false;
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

export { executeCommand, executeCommandSync, addWsClient, killProcess, getRunningProcesses };
