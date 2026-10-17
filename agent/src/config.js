// agent/src/config.js - 配置管理（带内存缓存 + 写入互斥锁）
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, chmodSync } from 'fs';
import { t as translate } from './i18n.js';
import { encodeSecret, decodeSecret } from './crypto-lite.js';

const AGENT_DIR = join(homedir(), '.ai-helper-agent');
const CONFIG_FILE = join(AGENT_DIR, 'config.json');
const PAIRINGS_FILE = join(AGENT_DIR, 'pairings.json');
const SKILLS_DIR = join(AGENT_DIR, 'skills');
const WORKSPACE_DIR = join(AGENT_DIR, 'workspace');
const MEMORY_DIR = join(AGENT_DIR, 'memory');

const DEFAULTS = {
  port: 18910,
  host: '127.0.0.1',
  workdir: WORKSPACE_DIR,
  allowedPaths: [WORKSPACE_DIR],
  pairCodeTTL: 30,
  commandTimeout: 300000,
  fileMaxSize: 50 * 1024 * 1024,
  // RAG URL 导入内网访问策略（B2 AND 闸，与扩展侧 network-scope.js 同序）：
  // allowPrivateNetwork 开启 **且** allowedPrivateHosts 命中才放行内网；关闸时白名单不生效，
  // 开闸但白名单为空仍拒绝；缺省均关闭（默认拒绝内网），公网访问不受影响
  ragUrlIngest: { allowPrivateNetwork: false, allowedPrivateHosts: [] },
  // 长期记忆语义召回（hybrid recall）的 embedding 配置：缺省关闭 → recall 只走关键词通道（Tier A），
  // 不引入任何新的默认网络调用。mode: 'openai-compat'（远端，零依赖）| 'local'（本地模型，需 RAG 依赖）。
  // apiKey 只落本地 config.json，任何对外响应均经 mask 脱敏（hasApiKey 供前端提示“已配置”）。
  memoryEmbedding: {
    enabled: false,
    mode: 'openai-compat',
    baseUrl: '',
    modelName: '',
    apiKey: '',
    dimensions: 0,
    queryPrefix: ''
  }
};

const VALID_CONFIG_KEYS = Object.keys(DEFAULTS);

// 内存缓存
let configCache = null;
let configCacheMtime = 0;

let pairingsCache = null;
let pairingsCacheMtime = 0;

// 写入互斥锁（防止并发写互相覆盖）
let writeLock = Promise.resolve();

// 当前模块使用的语言（由 server.js 在请求入口处设置）
let currentLang = 'zh';

/**
 * 设置 config 模块当前使用的语言（由 server.js 在请求入口处调用）
 * @param {string} lang - 语言代码（'zh' | 'en'）
 */
export function setConfigLang(lang) {
  if (lang) currentLang = lang;
}

function withWriteLock(fn) {
  const prev = writeLock;
  let release;
  writeLock = new Promise(resolve => { release = resolve; });
  // fn 允许返回非 Promise（同步写入体）：统一用 Promise.resolve 兜住，
  // 否则 fn().finally 直接 TypeError，且锁永远不会释放。
  return prev
    .then(() => Promise.resolve(fn()))
    .finally(release);
}

function ensureAgentDir() {
  try {
    // 确保 Agent 根目录存在（0700：仅当前用户可进入）
    if (!existsSync(AGENT_DIR)) {
      mkdirSync(AGENT_DIR, { recursive: true, mode: 0o700 });
    }
    // 确保 skills、workspace 和 memory 子目录存在
    for (const dir of [SKILLS_DIR, WORKSPACE_DIR, MEMORY_DIR]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  } catch (err) {
    console.error('[Config] Cannot create Agent directory:', err.message);
    throw err;
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
    // 磁盘密文 → 内存明文（兼容旧版无 enc: 前缀的明文）
    if (userConfig.memoryEmbedding && userConfig.memoryEmbedding.apiKey) {
      userConfig.memoryEmbedding = { ...userConfig.memoryEmbedding, apiKey: decodeSecret(userConfig.memoryEmbedding.apiKey) };
    }
    configCache = { ...DEFAULTS, ...userConfig };
    configCacheMtime = mtime;
  } catch (err) {
    console.error('[Config] Config file parse failed:', err.message);
    configCache = { ...DEFAULTS, allowedPaths: [DEFAULTS.workdir] };
    configCacheMtime = 0;
  }

  // Auto-add skills directory to allowlist
  if (!configCache.allowedPaths.includes(SKILLS_DIR)) {
    configCache.allowedPaths.push(SKILLS_DIR);
  }

  // Auto-add workspace directory to allowlist
  if (!configCache.allowedPaths.includes(WORKSPACE_DIR)) {
    configCache.allowedPaths.push(WORKSPACE_DIR);
  }

  return configCache;
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
  // 落盘前混淆 apiKey（内存缓存保持明文）
  if (safe.memoryEmbedding && safe.memoryEmbedding.apiKey) {
    safe.memoryEmbedding = { ...safe.memoryEmbedding, apiKey: encodeSecret(safe.memoryEmbedding.apiKey) };
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(safe, null, 2), { encoding: 'utf-8', mode: 0o600 });
  try { chmodSync(CONFIG_FILE, 0o600); } catch {} // 历史宽松文件收紧
}

/**
 * 取锁后的实际写入体：落盘 + 刷新缓存（saveConfig 与 updateConfigField 共用）。
 * 必须不加锁：两者都已在自己的 withWriteLock 内，再嵌一次会 自我等自我 而永久挂起。
 */
function writeConfigBody(config) {
  try {
    saveConfigSync(config);
    // 从磁盘重新加载确保缓存与磁盘一致（解码后缓存保持明文）
    const mtime = getMtime(CONFIG_FILE);
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.memoryEmbedding && parsed.memoryEmbedding.apiKey) {
      parsed.memoryEmbedding = { ...parsed.memoryEmbedding, apiKey: decodeSecret(parsed.memoryEmbedding.apiKey) };
    }
    configCache = { ...DEFAULTS, ...parsed };
    configCacheMtime = mtime;
  } catch (err) {
    console.error('[Config] Save config failed:', err.message);
    throw err;
  }
}

/**
 * 保存配置（写入磁盘并更新缓存，加写锁防并发覆盖）
 */
export async function saveConfig(config) {
  return withWriteLock(() => writeConfigBody(config));
}

/**
 * 更新单字段配置（加写锁防 TOCTOU）
 */
export async function updateConfigField(key, value) {
  if (!VALID_CONFIG_KEYS.includes(key)) {
    throw new Error(translate(currentLang, 'error.invalidConfigKey', { key }));
  }
  return withWriteLock(async () => {
    // 浅拷贝后再改：loadConfig() 返回的是缓存本体，直接赋值会就地修改调用方已持有的对象
    const config = { ...loadConfig(), [key]: value };
    writeConfigBody(config);
    return config;
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
    const parsed = JSON.parse(readFileSync(PAIRINGS_FILE, 'utf-8'));
    // 磁盘密文 → 内存明文（兼容旧版）
    for (const entry of Object.values(parsed)) {
      if (entry.token) entry.token = decodeSecret(entry.token);
    }
    pairingsCache = parsed;
    pairingsCacheMtime = mtime;
    return pairingsCache;
  } catch (err) {
    console.error('[Config] Pairings file parse failed:', err.message);
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
      // 落盘前混淆 token（内存缓存保持明文）
      const diskPairings = {};
      for (const [id, entry] of Object.entries(pairings)) {
        diskPairings[id] = { ...entry, token: encodeSecret(entry.token) };
      }
      writeFileSync(PAIRINGS_FILE, JSON.stringify(diskPairings, null, 2), { encoding: 'utf-8', mode: 0o600 });
      try { chmodSync(PAIRINGS_FILE, 0o600); } catch {} // 历史宽松文件收紧
      pairingsCache = pairings;
      pairingsCacheMtime = getMtime(PAIRINGS_FILE);
    } catch (err) {
      console.error('[Config] Save pairing failed:', err.message);
      throw err;
    }
  });
}

export { AGENT_DIR, CONFIG_FILE, MEMORY_DIR };
