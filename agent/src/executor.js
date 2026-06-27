// agent/src/executor.js - 命令执行器（child_process + 流式输出）
import { spawn } from 'child_process';
import crypto from 'crypto';
import { loadConfig } from './config.js';

// 运行中的进程映射：execId → { process, wsClients: Set }
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
 * @param {string} [cwd] - 工作目录，默认使用配置的 workdir
 * @param {Object} wsClient - 单个 WebSocket 客户端（用于流式输出）
 * @param {Function} onComplete - 完成回调 ({ execId, exitCode, killed })
 * @returns {string} execId
 */
function executeCommand(command, cwd, wsClient, onComplete) {
  const config = loadConfig();
  const workdir = cwd || config.workdir;
  const execId = generateExecId();
  const timeout = config.commandTimeout || 300000;

  // 使用 sh -c 来支持管道、重定向等 shell 特性
  const proc = spawn('sh', ['-c', command], {
    cwd: workdir,
    env: { ...process.env, TERM: 'dumb', FORCE_COLOR: '0' }, // 禁用 ANSI 颜色
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const wsClients = new Set();
  if (wsClient) wsClients.add(wsClient);

  runningProcesses.set(execId, { process: proc, wsClients });

  // 超时控制
  let killed = false;
  const timeoutId = setTimeout(() => {
    killed = true;
    killProcess(execId);
  }, timeout);

  // 广播消息给所有连接的 WS 客户端
  function broadcast(data) {
    const msg = JSON.stringify(data);
    for (const client of wsClients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(msg);
      }
    }
  }

  // stdout 流式输出
  proc.stdout.on('data', (chunk) => {
    broadcast({ type: 'stdout', data: chunk.toString(), execId });
  });

  // stderr 流式输出
  proc.stderr.on('data', (chunk) => {
    broadcast({ type: 'stderr', data: chunk.toString(), execId });
  });

  // 进程结束
  proc.on('close', (exitCode) => {
    clearTimeout(timeoutId);
    broadcast({ type: 'exit', exitCode, execId, killed });
    runningProcesses.delete(execId);
    if (onComplete) {
      onComplete({ execId, exitCode, killed });
    }
  });

  // 进程错误
  proc.on('error', (err) => {
    clearTimeout(timeoutId);
    broadcast({ type: 'error', error: err.message, execId });
    runningProcesses.delete(execId);
    if (onComplete) {
      onComplete({ execId, exitCode: -1, killed: false, error: err.message });
    }
  });

  return execId;
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
    entry.process.kill('SIGTERM');
    // 5秒后强制 kill
    setTimeout(() => {
      try { entry.process.kill('SIGKILL'); } catch {}
    }, 5000);
    return true;
  }
  return false;
}

/**
 * 获取运行中的进程列表
 */
function getRunningProcesses() {
  const list = [];
  for (const [execId, entry] of runningProcesses) {
    list.push({ execId, clientCount: entry.wsClients.size });
  }
  return list;
}

export { executeCommand, addWsClient, killProcess, getRunningProcesses };
