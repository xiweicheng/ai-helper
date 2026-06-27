#!/usr/bin/env node
// agent/bin/agent.js - CLI 入口
// 用法: ai-helper-agent <start|stop|restart|status|paircode|config> [options]
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

const AGENT_DIR = join(process.env.HOME || '~', '.ai-helper-agent');
const CONFIG_FILE = join(AGENT_DIR, 'config.json');

/**
 * 读取 Agent 配置文件
 */
function readAgentConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {}
  return { port: 18910, host: '127.0.0.1' };
}

/**
 * 检查 Agent 是否在运行
 */
async function isRunning(config) {
  try {
    const resp = await fetch(`http://${config.host}:${config.port}/api/status`);
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * 打印帮助信息
 */
function printHelp() {
  console.log('AI Helper Agent - 本地文件读写和命令执行代理');
  console.log('');
  console.log('用法: ai-helper-agent <命令> [选项]');
  console.log('');
  console.log('命令:');
  console.log('  start        启动 Agent 服务');
  console.log('  stop         停止正在运行的 Agent');
  console.log('  restart      重启 Agent 服务');
  console.log('  status       查看 Agent 运行状态');
  console.log('  paircode     查看当前配对码（需认证状态）');
  console.log('  config       查看当前配置');
  console.log('  help         显示此帮助信息');
  console.log('');
  console.log('启动选项:');
  console.log('  --port <端口>      设置监听端口 (默认: 18910)');
  console.log('  --host <地址>      设置监听地址 (默认: 127.0.0.1)');
  console.log('  --workdir <目录>   设置工作目录 (默认: 当前目录)');
  console.log('');
  console.log('示例:');
  console.log('  ai-helper-agent start');
  console.log('  ai-helper-agent start --port 18911 --workdir /path/to/project');
  console.log('  ai-helper-agent stop');
  console.log('  ai-helper-agent restart');
  console.log('  ai-helper-agent status');
}

const command = process.argv[2] || 'help';

// --version / -v
if (command === '--version' || command === '-v') {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
  console.log(`ai-helper-agent v${pkg.version}`);
  process.exit(0);
}

// ==================== start ====================
if (command === 'start') {
  const { startServer } = await import('../src/server.js');
  const { loadConfig } = await import('../src/config.js');

  console.log('[Agent] AI Helper Agent 启动中...');

  const args = process.argv.slice(3);
  const config = loadConfig();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1]) {
      config.port = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--host' && args[i + 1]) {
      config.host = args[i + 1];
      i++;
    } else if (arg === '--workdir' && args[i + 1]) {
      config.workdir = args[i + 1];
      i++;
    }
  }

  console.log(`[Agent] 工作目录: ${config.workdir}`);
  console.log(`[Agent] 监听地址: ${config.host}:${config.port}`);

  startServer();

// ==================== stop ====================
} else if (command === 'stop') {
  const config = readAgentConfig();
  console.log('[Agent] 正在停止 Agent...');

  const running = await isRunning(config);
  if (!running) {
    console.log('[Agent] Agent 未在运行');
    process.exit(0);
  }

  try {
    const resp = await fetch(`http://${config.host}:${config.port}/api/shutdown`, {
      method: 'POST'
    });
    const data = await resp.json();
    console.log(`[Agent] ${data.message || 'Agent 已停止'}`);
  } catch {
    console.log('[Agent] 无法发送停止请求，Agent 可能已退出');
  }

// ==================== restart ====================
} else if (command === 'restart') {
  const config = readAgentConfig();
  const running = await isRunning(config);

  if (running) {
    console.log('[Agent] 正在停止 Agent...');
    try {
      await fetch(`http://${config.host}:${config.port}/api/shutdown`, { method: 'POST' });
    } catch {}
    // 等待进程退出
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  console.log('[Agent] 正在启动 Agent...');
  const { startServer: restartServer } = await import('../src/server.js');
  const { loadConfig: restartConfig } = await import('../src/config.js');
  const cfg = restartConfig();

  // 应用命令行参数
  const rargs = process.argv.slice(3);
  for (let i = 0; i < rargs.length; i++) {
    if (rargs[i] === '--port' && rargs[i + 1]) { cfg.port = parseInt(rargs[i + 1], 10); i++; }
    else if (rargs[i] === '--host' && rargs[i + 1]) { cfg.host = rargs[i + 1]; i++; }
    else if (rargs[i] === '--workdir' && rargs[i + 1]) { cfg.workdir = rargs[i + 1]; i++; }
  }

  console.log(`[Agent] 工作目录: ${cfg.workdir}`);
  restartServer();

// ==================== status ====================
} else if (command === 'status') {
  const config = readAgentConfig();
  const running = await isRunning(config);

  console.log('[Agent] ======== Agent 状态 ========');
  console.log(`[Agent] 监听地址: ${config.host}:${config.port}`);
  console.log(`[Agent] 运行状态: ${running ? '✅ 运行中' : '❌ 未运行'}`);
  console.log(`[Agent] 配置文件: ${CONFIG_FILE}`);

  if (running) {
    try {
      const resp = await fetch(`http://${config.host}:${config.port}/api/status`);
      const data = await resp.json();
      console.log(`[Agent] 版本:     ${data.version}`);
    } catch {}
  }

// ==================== paircode ====================
} else if (command === 'paircode') {
  const config = readAgentConfig();
  const running = await isRunning(config);

  if (!running) {
    console.log('[Agent] Agent 未在运行，请先启动');
    process.exit(1);
  }

  // 配对码需要认证，如果没有 token 则直接查看（Agent 启动控制台会打印）
  console.log('[Agent] 配对码已显示在 Agent 启动终端中');
  console.log('[Agent] 请在启动 Agent 的终端窗口中查看配对码');
  console.log('');
  console.log('[Agent] 或查看状态获取更多信息:');
  try {
    const resp = await fetch(`http://${config.host}:${config.port}/api/status`);
    if (resp.ok) {
      const data = await resp.json();
      console.log(`[Agent] 版本: ${data.version}`);
    }
  } catch {}

// ==================== config ====================
} else if (command === 'config') {
  const config = readAgentConfig();
  console.log('[Agent] ======== 当前配置 ========');
  console.log(JSON.stringify(config, null, 2));
  console.log(`[Agent] 配置文件位置: ${CONFIG_FILE}`);

// ==================== help ====================
} else {
  printHelp();
}
