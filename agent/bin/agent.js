#!/usr/bin/env node
// agent/bin/agent.js - CLI entry point
// Usage: ai-helper-agent <start|stop|restart|status|paircode|config> [options]
import { join, dirname, resolve } from 'path';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { detectSystemLang } from '../src/sys-lang.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = join(homedir(), '.ai-helper-agent');
const CONFIG_FILE = join(AGENT_DIR, 'config.json');
const PID_FILE = join(AGENT_DIR, 'agent.pid');
const SKILLS_DIR = join(AGENT_DIR, 'skills');
const WORKSPACE_DIR = join(AGENT_DIR, 'workspace');

// ==================== CLI i18n ====================
function loadCliTranslations() {
  try {
    const raw = readFileSync(join(__dirname, '..', 'src', 'locales', 'cli.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolveLang(args) {
  // Priority: --lang flag > AI_HELPER_LANG env > system language detection > default 'en'
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang' && args[i + 1]) {
      const val = args[i + 1].toLowerCase();
      if (val === 'zh' || val === 'en') return val;
    }
  }
  const envLang = process.env.AI_HELPER_LANG;
  if (envLang && (envLang === 'zh' || envLang === 'en')) return envLang;
  return detectSystemLang();
}

// Remove --lang <val> and background flags from args to avoid passing to server
function filterLangArgs(args) {
  const filtered = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang' && args[i + 1]) {
      i++; // skip the value too
    } else if (args[i] === '-b' || args[i] === '--background') {
      // 过滤后台标志，避免子进程递归 fork 孙进程
    } else {
      filtered.push(args[i]);
    }
  }
  return filtered;
}

// 健康检查：轮询 GET /api/status，直到成功或超时（最多 8 秒）
async function healthCheck(port, host, timeoutMs = 8000, intervalMs = 500) {
  const endpoint = `http://${host}:${port}/api/status`;
  const maxAttempts = Math.ceil(timeoutMs / intervalMs);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(endpoint);
      if (res.ok) return true;
    } catch {
      // 服务尚未就绪，继续等待
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

// 等待后台服务就绪（带超时），成功返回 true
async function waitForAgentReady(port, host) {
  return healthCheck(port, host);
}

const lang = resolveLang(process.argv);
process.env.AI_HELPER_LANG = lang;
const translations = loadCliTranslations();
const msgs = translations ? translations[lang] : null;

function t(key, vars) {
  if (!msgs || !msgs[key]) return key;
  let msg = msgs[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }
  return msg;
}

function tRestart(key, vars) {
  if (!msgs?.restartHelper || !msgs.restartHelper[key]) return key;
  let msg = msgs.restartHelper[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }
  return msg;
}

/**
 * Read Agent config file
 */
function readAgentConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`[Agent] ${t('configReadFailed')}: ${err.message}`);
  }
  return { port: 18910, host: '127.0.0.1' };
}

/**
 * Ensure Agent config directory exists
 */
function ensureAgentDir() {
  try {
    if (!existsSync(AGENT_DIR)) {
      mkdirSync(AGENT_DIR, { recursive: true });
    }
    for (const dir of [SKILLS_DIR, WORKSPACE_DIR]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  } catch (err) {
    console.error(`[Agent] ${t('configDirCreateFailed')} ${AGENT_DIR}: ${err.message}`);
  }
}

/**
 * Read PID from PID file (atomic read, no TOCTOU)
 */
function getPidFromFile() {
  try {
    const raw = readFileSync(PID_FILE, 'utf-8').trim();
    const pid = parseInt(raw, 10);
    if (isNaN(pid) || pid <= 0) {
      console.error(`[Agent] ${t('invalidPidContent')}: "${raw}"`);
      return null;
    }
    return pid;
  } catch {
    return null;
  }
}

/**
 * Delete PID file
 */
function removePidFile() {
  try {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  } catch (err) {
    console.error(`[Agent] ${t('deletePidFailed')}: ${err.message}`);
  }
}

/**
 * Kill process by PID
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
 * Validate port number
 */
function isValidPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Check if Agent is running (poll until confirmed)
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
 * Wait for Agent to exit (poll port release)
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
 * Print help message
 */
function printHelp() {
  console.log(t('title'));
  console.log('');
  console.log(t('usage'));
  console.log('');
  console.log(t('commands'));
  console.log(t('cmdStart'));
  console.log(t('cmdStop'));
  console.log(t('cmdRestart'));
  console.log(t('cmdStatus'));
  console.log(t('cmdPaircode'));
  console.log(t('cmdConfig'));
  console.log(t('cmdHelp'));
  console.log('');
  console.log(t('startupOptions'));
  console.log(t('optBackground'));
  console.log(t('optPort'));
  console.log(t('optHost'));
  console.log(t('optWorkdir'));
  console.log(t('optLang'));
  console.log('');
  console.log(t('examples'));
  console.log('  ai-helper-agent start');
  console.log('  ai-helper-agent start --background');
  console.log('  ai-helper-agent start -b --port 18911');
  console.log('  ai-helper-agent stop');
  console.log('  ai-helper-agent restart -b');
  console.log('  ai-helper-agent status');
}

/**
 * Apply CLI args to config, with validation
 */
function applyCliArgs(config, args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1]) {
      const port = parseInt(args[i + 1], 10);
      if (!isValidPort(port)) {
        console.error(`[Agent] ${t('invalidPort', { port: args[i + 1], defaultPort: config.port })}`);
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

const rawArgs = process.argv.slice(2);
const command = rawArgs[0] || 'help';
const passArgs = filterLangArgs(rawArgs.slice(1));

// --version / -v
if (command === '--version' || command === '-v') {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    console.log(`ai-helper-agent v${pkg.version}`);
  } catch (err) {
    console.error(`[Agent] ${t('readVersionFailed')}: ${err.message}`);
  }
  process.exit(0);
}

// ==================== start ====================
if (command === 'start') {
  const isBg = process.argv.includes('--background') || process.argv.includes('-b');

  if (isBg) {
    ensureAgentDir();

    const existingConfig = readAgentConfig();
    if (await isRunning(existingConfig)) {
      console.log(`[Agent] ${t('agentAlreadyRunning')}`);
      process.exit(0);
    }

    const agentScript = resolve(process.argv[1]);

    const child = spawn(process.execPath, [
      ...process.execArgv,
      agentScript,
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
      console.error(`[Agent] ${t('backgroundStartFailed')}: ${err.message}`);
      try { unlinkSync(PID_FILE); } catch {}
      process.exit(1);
    });

    // 健康检查：轮询 /api/status，最多等待 8 秒，确保服务真正就绪
    const readyConfig = applyCliArgs(readAgentConfig(), passArgs);
    const healthy = !spawnFailed && child.pid ? await waitForAgentReady(readyConfig.port, readyConfig.host) : false;

    if (!spawnFailed && child.pid && healthy) {
      try {
        writeFileSync(PID_FILE, String(child.pid));
      } catch (err) {
        console.error(`[Agent] ${t('pidWriteFailed')}: ${err.message}`);
        process.exit(1);
      }
      child.unref();
      console.log(`[Agent] ${t('agentStartedBg', { pid: child.pid })}`);
      console.log(`[Agent] ${t('stopHint')}`);
      console.log(`[Agent] ${t('statusHint')}`);
    } else if (!spawnFailed && child.pid && !healthy) {
      // 服务未在超时内就绪，清理 PID 文件并报错
      try { unlinkSync(PID_FILE); } catch {}
      console.error(`[Agent] ${t('backgroundStartFailed')}: health check timed out`);
      process.exit(1);
    }

    process.exit(spawnFailed ? 1 : 0);
  }

  // Foreground mode
  ensureAgentDir();
  try {
    writeFileSync(PID_FILE, String(process.pid));
  } catch (err) {
    console.error(`[Agent] ${t('pidWriteFailed')}: ${err.message}`);
  }

  const { startServer } = await import('../src/server.js');
  const { loadConfig } = await import('../src/config.js');

  console.log(`[Agent] ${t('agentStarting')}`);

  const config = applyCliArgs(loadConfig(), passArgs);

  console.log(`[Agent] ${t('workingDir', { dir: config.workdir })}`);
  console.log(`[Agent] ${t('listeningAddr', { host: config.host, port: config.port })}`);

  startServer();

// ==================== stop ====================
} else if (command === 'stop') {
  const config = readAgentConfig();
  console.log(`[Agent] ${t('stoppingAgent')}`);

  const running = await isRunning(config);
  if (running) {
    let apiShutdownOk = false;
    try {
      const resp = await fetch(`http://${config.host}:${config.port}/api/shutdown`, {
        method: 'POST'
      });
      if (resp.ok) {
        try {
          const data = await resp.json();
          console.log(`[Agent] ${data.message || t('agentStopped')}`);
        } catch {
          // 服务端在发送响应后关闭连接，json() 可能读不到完整数据
          // 但 shutdown 请求已成功送达，服务正在关闭
          console.log(`[Agent] ${t('agentStopped')}`);
        }
        apiShutdownOk = true;
        removePidFile();
        process.exit(0);
      }
    } catch {
      // isRunning() 刚确认服务在线，fetch 出错说明服务端已关闭连接（shutdown 正在执行）
      // 视为关闭成功，不打印错误
      apiShutdownOk = true;
    }
    if (!apiShutdownOk) {
      console.log(`[Agent] ${t('apiShutdownFallback')}`);
    }
  }

  const pid = getPidFromFile();
  if (pid) {
    if (killByPid(pid)) {
      console.log(`[Agent] ${t('sigtermSent', { pid })}`);
    } else {
      console.log(`[Agent] ${t('processGone', { pid })}`);
    }
    removePidFile();
  } else if (!running) {
    console.log(`[Agent] ${t('agentNotRunning')}`);
  }

  process.exit(0);

// ==================== restart ====================
} else if (command === 'restart') {
  const isBg = process.argv.includes('--background') || process.argv.includes('-b');

  const config = readAgentConfig();
  const running = await isRunning(config);

  if (running) {
    console.log(`[Agent] ${t('stoppingAgent')}`);
    try {
      await fetch(`http://${config.host}:${config.port}/api/shutdown`, { method: 'POST' });
    } catch (err) {
      console.error(`[Agent] ${t('apiShutdownFailed')}: ${err.message}`);
    }
    const exited = await waitForExit(config, 8000);
    if (!exited) {
      console.log(`[Agent] ${t('waitTimeoutForceKill')}`);
    }
  }

  const pid = getPidFromFile();
  if (pid) {
    killByPid(pid);
    removePidFile();
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (isBg) {
    ensureAgentDir();

    const agentScript = resolve(process.argv[1]);

    const child = spawn(process.execPath, [
      ...process.execArgv,
      agentScript,
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
      console.error(`[Agent] ${t('backgroundRestartFailed')}: ${err.message}`);
      try { unlinkSync(PID_FILE); } catch {}
      process.exit(1);
    });

    // 健康检查：轮询 /api/status，最多等待 8 秒，确保服务真正就绪
    const readyConfig = applyCliArgs(readAgentConfig(), passArgs);
    const healthy = !spawnFailed && child.pid ? await waitForAgentReady(readyConfig.port, readyConfig.host) : false;

    if (!spawnFailed && child.pid && healthy) {
      try {
        writeFileSync(PID_FILE, String(child.pid));
      } catch (err) {
        console.error(`[Agent] ${t('pidWriteFailed')}: ${err.message}`);
        process.exit(1);
      }
      child.unref();
      console.log(`[Agent] ${t('agentRestartedBg', { pid: child.pid })}`);
      console.log(`[Agent] ${t('stopHint')}`);
    } else if (!spawnFailed && child.pid && !healthy) {
      try { unlinkSync(PID_FILE); } catch {}
      console.error(`[Agent] ${t('backgroundRestartFailed')}: health check timed out`);
      process.exit(1);
    }

    process.exit(spawnFailed ? 1 : 0);
  }

  // Foreground mode
  console.log(`[Agent] ${t('agentRestarting')}`);
  ensureAgentDir();
  try {
    writeFileSync(PID_FILE, String(process.pid));
  } catch (err) {
    console.error(`[Agent] ${t('pidWriteFailed')}: ${err.message}`);
  }

  const { startServer: restartServer } = await import('../src/server.js');
  const { loadConfig: restartConfig } = await import('../src/config.js');
  const cfg = applyCliArgs(restartConfig(), passArgs);

  console.log(`[Agent] ${t('workingDir', { dir: cfg.workdir })}`);
  restartServer();

// ==================== _restart-helper (internal, two-phase restart wrapper) ====================
} else if (command === '_restart-helper') {
  const helperConfig = applyCliArgs({ port: 18910, host: '127.0.0.1' }, passArgs);
  const oldPidIdx = process.argv.indexOf('--old-pid');
  const oldPid = oldPidIdx > -1 ? parseInt(process.argv[oldPidIdx + 1], 10) : 0;
  const scriptIdx = process.argv.indexOf('--script');
  const agentScript = scriptIdx > -1 ? process.argv[scriptIdx + 1] : process.argv[1];

  const port = helperConfig.port;
  const host = helperConfig.host;
  const workdir = helperConfig.workdir || process.cwd();

  const log = (msg) => console.log(`[Agent Restart Helper] ${msg}`);
  log(tRestart('waitingOldExit', { pid: oldPid }));

  const waitForOldExit = (pid, timeoutMs = 15000) => new Promise((resolve) => {
    if (!pid) return resolve(true);
    const start = Date.now();
    const timer = setInterval(() => {
      try {
        process.kill(pid, 0);
      } catch {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        log(tRestart('waitOldTimeout'));
        try { process.kill(pid, 'SIGKILL'); } catch {}
        resolve(false);
      }
    }, 200);
  });

  const waitForPortRelease = async (host, port, timeoutMs = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const resp = await fetch(`http://${host}:${port}/api/status`);
        if (resp.ok) {
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
      } catch {
        return true;
      }
    }
    return false;
  };

  (async () => {
    await waitForOldExit(oldPid);
    await waitForPortRelease(host, port);
    await new Promise(r => setTimeout(r, 500));

    log(tRestart('oldExited'));

    removePidFile();
    ensureAgentDir();

    const child = spawn(process.execPath, [
      ...process.execArgv,
      agentScript,
      'start',
      '--port', String(port),
      '--host', host,
      '--workdir', workdir
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
      log(`${tRestart('startupFailed')}: ${err.message}`);
      process.exit(1);
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    let healthy = false;
    if (!spawnFailed && child.pid) {
      try {
        const resp = await fetch(`http://${host}:${port}/api/status`);
        healthy = resp.ok;
      } catch {}
    }

    if (healthy && child.pid) {
      try {
        writeFileSync(PID_FILE, String(child.pid));
      } catch (err) {
        log(`${tRestart('pidWriteFailed')}: ${err.message}`);
      }
      child.unref();
      log(tRestart('newProcessStarted', { pid: child.pid }));
    } else if (!spawnFailed && child.pid) {
      log(tRestart('healthCheckFailed'));
    }

    process.exit(spawnFailed ? 1 : 0);
  })();

// ==================== status ====================
} else if (command === 'status') {
  const config = readAgentConfig();
  const running = await isRunning(config);

  console.log(`[Agent] ${t('agentStatus')}`);
  console.log(`[Agent] ${t('listeningAddr', { host: config.host, port: config.port })}`);
  console.log(`[Agent] ${t('runningStatus')}: ${running ? t('runningYes') : t('runningNo')}`);
  console.log(`[Agent] ${t('configFile')}: ${CONFIG_FILE}`);

  if (running) {
    try {
      const resp = await fetch(`http://${config.host}:${config.port}/api/status`);
      const data = await resp.json();
      console.log(`[Agent] ${t('version')}:     ${data.version}`);
    } catch (err) {
      console.error(`[Agent] ${t('getStatusFailed')}: ${err.message}`);
    }
  }

// ==================== paircode ====================
} else if (command === 'paircode') {
  const config = readAgentConfig();
  const running = await isRunning(config);

  if (!running) {
    console.log(`[Agent] ${t('agentNotRunningStartFirst')}`);
    process.exit(1);
  }

  console.log(`[Agent] ${t('paircodeInTerminal')}`);
  console.log(`[Agent] ${t('checkPaircodeInTerminal')}`);
  console.log('');
  console.log(`[Agent] ${t('orCheckStatus')}`);
  try {
    const resp = await fetch(`http://${config.host}:${config.port}/api/status`);
    if (resp.ok) {
      const data = await resp.json();
      console.log(`[Agent] ${t('version')}: ${data.version}`);
    }
  } catch (err) {
    console.error(`[Agent] ${t('getStatusFailed')}: ${err.message}`);
  }

// ==================== config ====================
} else if (command === 'config') {
  const config = readAgentConfig();
  console.log(`[Agent] ${t('currentConfig')}`);
  console.log(JSON.stringify(config, null, 2));
  console.log(`[Agent] ${t('configFileLocation', { path: CONFIG_FILE })}`);

// ==================== help ====================
} else {
  printHelp();
}
