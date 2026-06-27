// agent/src/config.js - 配置管理
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const AGENT_DIR = join(homedir(), '.ai-helper-agent');
const CONFIG_FILE = join(AGENT_DIR, 'config.json');
const PAIRINGS_FILE = join(AGENT_DIR, 'pairings.json');

// 默认配置
const DEFAULTS = {
  port: 18910,
  host: '127.0.0.1',
  workdir: process.cwd(),
  allowedPaths: [],             // 白名单目录，空=仅允许 workdir
  pairCodeTTL: 30,              // 配对码有效期（秒）
  commandTimeout: 300000,       // 命令执行默认超时（ms）
  fileMaxSize: 50 * 1024 * 1024 // 文件读写最大大小 50MB
};

// 确保 Agent 配置目录存在
function ensureAgentDir() {
  if (!existsSync(AGENT_DIR)) {
    mkdirSync(AGENT_DIR, { recursive: true });
  }
}

/**
 * 加载配置（合并默认值）
 */
export function loadConfig() {
  ensureAgentDir();
  if (!existsSync(CONFIG_FILE)) {
    const defaults = { ...DEFAULTS, allowedPaths: [DEFAULTS.workdir] };
    saveConfig(defaults);
    return defaults;
  }
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const userConfig = JSON.parse(raw);
    return { ...DEFAULTS, ...userConfig };
  } catch {
    return { ...DEFAULTS, allowedPaths: [DEFAULTS.workdir] };
  }
}

/**
 * 保存配置
 */
export function saveConfig(config) {
  ensureAgentDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
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
 * 读取已配对的扩展列表
 */
export function loadPairings() {
  ensureAgentDir();
  if (!existsSync(PAIRINGS_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(PAIRINGS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * 保存配对
 */
export function savePairing(extensionId, token) {
  const pairings = loadPairings();
  pairings[extensionId] = {
    token,
    pairedAt: Date.now()
  };
  ensureAgentDir();
  writeFileSync(PAIRINGS_FILE, JSON.stringify(pairings, null, 2), 'utf-8');
}

export { AGENT_DIR, CONFIG_FILE };
