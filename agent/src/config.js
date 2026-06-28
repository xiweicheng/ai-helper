// agent/src/config.js - 配置管理（带内存缓存 + 写入互斥锁）
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';

const AGENT_DIR = join(homedir(), '.ai-helper-agent');
const CONFIG_FILE = join(AGENT_DIR, 'config.json');
const PAIRINGS_FILE = join(AGENT_DIR, 'pairings.json');

const DEFAULTS = {
  port: 18910,
  host: '127.0.0.1',
  workdir: process.cwd(),
  allowedPaths: [],
  pairCodeTTL: 30,
  commandTimeout: 300000,
  fileMaxSize: 50 * 1024 * 1024
};

const VALID_CONFIG_KEYS = Object.keys(DEFAULTS);

// 内存缓存
let configCache = null;
let configCacheMtime = 0;

let pairingsCache = null;
let pairingsCacheMtime = 0;

// 写入互斥锁（防止并发写互相覆盖）
let writeLock = Promise.resolve();

function withWriteLock(fn) {
  const prev = writeLock;
  let release;
  writeLock = new Promise(resolve => { release = resolve; });
  return prev.then(() => fn().finally(release));
}

function ensureAgentDir() {
  if (!existsSync(AGENT_DIR)) {
    try {
      mkdirSync(AGENT_DIR, { recursive: true });
    } catch (err) {
      console.error('[Config] 无法创建 Agent 目录:', err.message);
      throw err;
    }
  }
}

/**
 * 获取文件的 mtime（ms），不存在返回 0
 */
function getMtime(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * 加载配置（带缓存，仅在文件变化时重新读取）
 */
export function loadConfig() {
  ensureAgentDir();

  if (!existsSync(CONFIG_FILE)) {
    const defaults = { ...DEFAULTS, allowedPaths: [DEFAULTS.workdir] };
    saveConfigSync(defaults);
    configCache = defaults;
    configCacheMtime = getMtime(CONFIG_FILE);
    return defaults;
  }

  const mtime = getMtime(CONFIG_FILE);
  if (configCache && mtime === configCacheMtime) {
    return configCache;
  }

  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const userConfig = JSON.parse(raw);
    configCache = { ...DEFAULTS, ...userConfig };
    configCacheMtime = mtime;
    return configCache;
  } catch (err) {
    console.error('[Config] 配置文件解析失败:', err.message);
    configCache = { ...DEFAULTS, allowedPaths: [DEFAULTS.workdir] };
    configCacheMtime = 0;
    return configCache;
  }
}

/**
 * 同步写入磁盘（内部方法，不加锁）
 */
function saveConfigSync(config) {
  ensureAgentDir();
  const safe = {};
  for (const key of VALID_CONFIG_KEYS) {
    if (config[key] !== undefined) safe[key] = config[key];
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(safe, null, 2), 'utf-8');
}

/**
 * 保存配置（写入磁盘并更新缓存，加写锁防并发覆盖）
 */
export async function saveConfig(config) {
  return withWriteLock(async () => {
    try {
      saveConfigSync(config);
      // 从磁盘重新加载确保缓存与磁盘一致
      const mtime = getMtime(CONFIG_FILE);
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      configCache = { ...DEFAULTS, ...JSON.parse(raw) };
      configCacheMtime = mtime;
    } catch (err) {
      console.error('[Config] 保存配置失败:', err.message);
      throw err;
    }
  });
}

/**
 * 更新单字段配置（加写锁防 TOCTOU）
 */
export async function updateConfigField(key, value) {
  if (!VALID_CONFIG_KEYS.includes(key)) {
    throw new Error(`无效配置项: ${key}`);
  }
  return withWriteLock(async () => {
    const config = loadConfig();
    config[key] = value;
    return saveConfig(config).then(() => config);
  });
}

/**
 * 读取已配对的扩展列表（带缓存）
 */
export function loadPairings() {
  ensureAgentDir();

  const mtime = getMtime(PAIRINGS_FILE);
  if (pairingsCache && mtime === pairingsCacheMtime) {
    return pairingsCache;
  }

  if (!existsSync(PAIRINGS_FILE)) {
    pairingsCache = {};
    pairingsCacheMtime = 0;
    return {};
  }

  try {
    pairingsCache = JSON.parse(readFileSync(PAIRINGS_FILE, 'utf-8'));
    pairingsCacheMtime = mtime;
    return pairingsCache;
  } catch (err) {
    console.error('[Config] 配对文件解析失败:', err.message);
    pairingsCache = {};
    pairingsCacheMtime = 0;
    return {};
  }
}

/**
 * 保存配对（加写锁防并发覆盖）
 */
export async function savePairing(extensionId, token) {
  return withWriteLock(async () => {
    const pairings = loadPairings();
    pairings[extensionId] = { token, pairedAt: Date.now() };
    ensureAgentDir();
    try {
      writeFileSync(PAIRINGS_FILE, JSON.stringify(pairings, null, 2), 'utf-8');
      pairingsCache = pairings;
      pairingsCacheMtime = getMtime(PAIRINGS_FILE);
    } catch (err) {
      console.error('[Config] 保存配对失败:', err.message);
      throw err;
    }
  });
}

export { AGENT_DIR, CONFIG_FILE };
