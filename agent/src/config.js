// agent/src/config.js - 配置管理（带内存缓存）
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

// 内存缓存
let configCache = null;
let configCacheMtime = 0;

let pairingsCache = null;
let pairingsCacheMtime = 0;

function ensureAgentDir() {
  if (!existsSync(AGENT_DIR)) {
    mkdirSync(AGENT_DIR, { recursive: true });
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
    saveConfig(defaults);
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
  } catch {
    configCache = { ...DEFAULTS, allowedPaths: [DEFAULTS.workdir] };
    configCacheMtime = 0;
    return configCache;
  }
}

/**
 * 保存配置（写入磁盘并更新缓存）
 */
export function saveConfig(config) {
  ensureAgentDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  configCache = config;
  configCacheMtime = getMtime(CONFIG_FILE);
}

/**
 * 更新单字段配置
 */
export function updateConfigField(key, value) {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
  return config;
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
  } catch {
    pairingsCache = {};
    pairingsCacheMtime = 0;
    return {};
  }
}

/**
 * 保存配对（写入磁盘并更新缓存）
 */
export function savePairing(extensionId, token) {
  const pairings = loadPairings();
  pairings[extensionId] = { token, pairedAt: Date.now() };
  ensureAgentDir();
  writeFileSync(PAIRINGS_FILE, JSON.stringify(pairings, null, 2), 'utf-8');
  pairingsCache = pairings;
  pairingsCacheMtime = getMtime(PAIRINGS_FILE);
}

export { AGENT_DIR, CONFIG_FILE };
