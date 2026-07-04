#!/usr/bin/env node
// agent/bin/agent.js - CLI 入口
// 用法: ai-helper-agent <start|stop|restart|status|paircode|config> [options]
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { homedir } from 'os';

const AGENT_DIR = join(homedir(), '.ai-helper-agent');
const CONFIG_FILE = join(AGENT_DIR, 'config.json');
const PID_FILE = join(AGENT_DIR, 'agent.pid');

/**
 * 读取 Agent 配置文件
 */
function readAgentConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`[Agent] 配置文件读取失败: ${err.message}`);
  }
  return { port: 18910, host: '127.0.0.1' };
}

/**
 * 确保 Agent 配置目录存在
 */
function ensureAgentDir() {
  if (!existsSync(AGENT_DIR)) {
    try {
      mkdirSync(AGENT_DIR, { recursive: true });
    } catch (err) {
      console.error(`[Agent] 无法创建配置目录 ${AGENT_DIR}: ${err.message}`);
    }
  }
}

/**
 * 从 PID 文件读取进程 ID（原子化读取，无 TOCTOU）
 */
function getPidFromFile() {
  try {
    const raw = readFileSync(PID_FILE, 'utf-8').trim();
    const pid = parseInt(raw, 10);
    if (isNaN(pid) || pid <= 0) {
      console.error(`[Agent] PID 文件内容无效: "${raw}"`);
      return null;
    }
    return pid;
  } catch {
    return null;
  }
}

/**
 * 删除 PID 文件
 */
function removePidFile() {
  try {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  } catch (err) {
    console.error(`[Agent] 删除 PID 文件失败: ${err.message}`);
  }
}

/**
 * 通过 PID 终止进程
 */
function killByPid(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

/**
 * 校验端口号
 */
function isValidPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * 检查 Agent 是否在运行（轮询直到确认）
 */
async function isRunning(config, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(`http://${config.host}:${config.port}/api/status`);
      if (resp.ok) return true;
    } catch {}
    if (i < retries - 1) await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

/**
 * 等待 Agent 退出（轮询端口释放）
 */
async function waitForExit(config, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const alive = await isRunning(config, 1);
    if (!alive) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
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
  console.log('  start        启动代理服务（前台运行）');
  console.log('  stop         停止正在运行的代理');
  console.log('  restart      重启代理服务');
  console.log('  status       查看代理运行状态');
  console.log('  paircode     查看当前配对码（需认证状态）');
  console.log('  config       查看当前配置');
  console.log('  help         显示此帮助信息');
  console.log('');
  console.log('启动选项:');
  console.log('  --background, -b   后台运行（守护进程模式）');
  console.log('  --port <端口>      设置监听端口 (默认: 18910)');
  console.log('  --host <地址>      设置监听地址 (默认: 127.0.0.1)');
  console.log('  --workdir <目录>   设置工作目录 (默认: 当前目录)');
  console.log('');
  console.log('示例:');
  console.log('  ai-helper-agent start');
  console.log('  ai-helper-agent start --background');
  console.log('  ai-helper-agent start -b --port 18911');
  console.log('  ai-helper-agent stop');
  console.log('  ai-helper-agent restart -b');
  console.log('  ai-helper-agent status');
}

/**
 * 从命令行参数提取端口配置，校验后覆盖 config
 */
function applyCliArgs(config, args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1]) {
      const port = parseInt(args[i + 1], 10);
      if (!isValidPort(port)) {
        console.error(`[Agent] 无效端口号: ${args[i + 1]}，使用默认端口 ${config.port}`);
      } else {
        config.port = port;
      }
      i++;
    } else if (arg === '--host' && args[i + 1]) {
      config.host = args[i + 1];
      i++;
    } else if (arg === '--workdir' && args[i + 1]) {
      config.workdir = args[i + 1];
      i++;
    }
  }
  return config;
}

const command = process.argv[2] || 'help';

// --version / -v
if (command === '--version' || command === '-v') {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    console.log(`ai-helper-agent v${pkg.version}`);
  } catch (err) {
    console.error(`[Agent] 无法读取版本信息: ${err.message}`);
  }
  process.exit(0);
}

// ==================== start ====================
if (command === 'start') {
  const isBg = process.argv.includes('--background') || process.argv.includes('-b');

  // 过滤掉 --background/-b，其余参数传给子进程
  const passArgs = process.argv.slice(3).filter(a => a !== '--background' && a !== '-b');

  if (isBg) {
    ensureAgentDir();

    // 检查是否已有 Agent 在运行
    const existingConfig = readAgentConfig();
    if (await isRunning(existingConfig)) {
      console.log('[Agent] Agent 已在运行中，无需重复启动');
      process.exit(0);
    }

    // 以 detached 模式启动子进程
    const child = spawn(process.execPath, [
      ...process.execArgv,
      process.argv[1],
      'start',
      ...passArgs
    ], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
      env: { ...process.env },
      windowsHide: true
    });

    // 监听 spawn 错误
    let spawnFailed = false;
    child.on('error', (err) => {
      spawnFailed = true;
      console.error(`[Agent] 后台启动失败: ${err.message}`);
      try { unlinkSync(PID_FILE); } catch {}
      process.exit(1);
    });

    // 等待进程启动确认
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!spawnFailed && child.pid) {
      try {
        writeFileSync(PID_FILE, String(child.pid));
      } catch (err) {
        console.error(`[Agent] PID 文件写入失败: ${err.message}`);
        process.exit(1);
      }
      child.unref();
      console.log(`[Agent] Agent 已在后台启动 (PID: ${child.pid})`);
      console.log(`[Agent] 使用 'ai-helper-agent stop' 停止服务`);
      console.log(`[Agent] 使用 'ai-helper-agent status' 查看状态`);
    }

    process.exit(spawnFailed ? 1 : 0);
  }

  // 前台模式：写入 PID 文件以便 stop 能找到
  ensureAgentDir();
  try {
    writeFileSync(PID_FILE, String(process.pid));
  } catch (err) {
    console.error(`[Agent] PID 文件写入失败: ${err.message}`);
  }

  const { startServer } = await import('../src/server.js');
  const { loadConfig } = await import('../src/config.js');

  console.log('[Agent] AI Helper Agent 启动中...');

  const config = applyCliArgs(loadConfig(), passArgs);

  console.log(`[Agent] 工作目录: ${config.workdir}`);
  console.log(`[Agent] 监听地址: ${config.host}:${config.port}`);

  startServer();

// ==================== stop ====================
} else if (command === 'stop') {
  const config = readAgentConfig();
  console.log('[Agent] 正在停止 Agent...');

  const running = await isRunning(config);
  if (running) {
    // 优先通过 API 优雅关闭
    try {
      const resp = await fetch(`http://${config.host}:${config.port}/api/shutdown`, {
        method: 'POST'
      });
      if (resp.ok) {
        const data = await resp.json();
        console.log(`[Agent] ${data.message || 'Agent 已停止'}`);
        removePidFile();
        process.exit(0);
      }
    } catch (err) {
      console.error(`[Agent] API 关闭请求失败: ${err.message}`);
    }
    console.log('[Agent] API 关闭失败，尝试通过 PID 终止...');
  }

  // 回退：通过 PID 文件终止
  const pid = getPidFromFile();
  if (pid) {
    if (killByPid(pid)) {
      console.log(`[Agent] 已向 PID ${pid} 发送终止信号`);
    } else {
      console.log(`[Agent] 进程 ${pid} 已不存在`);
    }
    removePidFile();
  } else if (!running) {
    console.log('[Agent] Agent 未在运行');
  }

  process.exit(0);

// ==================== restart ====================
} else if (command === 'restart') {
  const isBg = process.argv.includes('--background') || process.argv.includes('-b');

  // 先停止现有实例
  const config = readAgentConfig();
  const running = await isRunning(config);

  if (running) {
    console.log('[Agent] 正在停止 Agent...');
    try {
      await fetch(`http://${config.host}:${config.port}/api/shutdown`, { method: 'POST' });
    } catch (err) {
      console.error(`[Agent] API 关闭请求失败: ${err.message}`);
    }
    // 等待进程退出（轮询而非硬延迟）
    const exited = await waitForExit(config, 8000);
    if (!exited) {
      console.log('[Agent] 等待超时，尝试强制终止...');
    }
  }

  // 再通过 PID 兜底
  const pid = getPidFromFile();
  if (pid) {
    killByPid(pid);
    removePidFile();
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 重新启动
  if (isBg) {
    ensureAgentDir();
    const passArgs = process.argv.slice(3).filter(a => a !== '--background' && a !== '-b');

    const child = spawn(process.execPath, [
      ...process.execArgv,
      process.argv[1],
      'start',
      ...passArgs
    ], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
      env: { ...process.env },
      windowsHide: true
    });

    let spawnFailed = false;
    child.on('error', (err) => {
      spawnFailed = true;
      console.error(`[Agent] 后台重启失败: ${err.message}`);
      try { unlinkSync(PID_FILE); } catch {}
      process.exit(1);
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    if (!spawnFailed && child.pid) {
      try {
        writeFileSync(PID_FILE, String(child.pid));
      } catch (err) {
        console.error(`[Agent] PID 文件写入失败: ${err.message}`);
        process.exit(1);
      }
      child.unref();
      console.log(`[Agent] Agent 已在后台重启 (PID: ${child.pid})`);
      console.log(`[Agent] 使用 'ai-helper-agent stop' 停止服务`);
    }

    process.exit(spawnFailed ? 1 : 0);
  }

  // 前台模式
  console.log('[Agent] 正在启动 Agent...');
  ensureAgentDir();
  try {
    writeFileSync(PID_FILE, String(process.pid));
  } catch (err) {
    console.error(`[Agent] PID 文件写入失败: ${err.message}`);
  }

  const { startServer: restartServer } = await import('../src/server.js');
  const { loadConfig: restartConfig } = await import('../src/config.js');
  const cfg = applyCliArgs(restartConfig(),
    process.argv.slice(3).filter(a => a !== '--background' && a !== '-b'));

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
    } catch (err) {
      console.error(`[Agent] 获取状态失败: ${err.message}`);
    }
  }

// ==================== paircode ====================
} else if (command === 'paircode') {
  const config = readAgentConfig();
  const running = await isRunning(config);

  if (!running) {
    console.log('[Agent] Agent 未在运行，请先启动');
    process.exit(1);
  }

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
  } catch (err) {
    console.error(`[Agent] 获取状态失败: ${err.message}`);
  }

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
