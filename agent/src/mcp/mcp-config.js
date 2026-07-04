// mcp/mcp-config.js - MCP Server 配置管理
// 复用 agent/config.js 的缓存 + 写锁模式
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const AGENT_DIR = join(homedir(), '.ai-helper-agent');
const MCP_CONFIG_FILE = join(AGENT_DIR, 'mcp_servers.json');

// 内存缓存
let configCache = null;
let configCacheMtime = 0;

// 写入互斥锁
let writeLock = Promise.resolve();

function withWriteLock(fn) {
  const prev = writeLock;
  let release;
  writeLock = new Promise(resolve => { release = resolve; });
  return prev.then(() => fn().finally(release));
}

function getMtime(filePath) {
  try { return statSync(filePath).mtimeMs; }
  catch { return 0; }
}

/**
 * 加载 MCP Server 配置（带缓存）
 * @returns {{ servers: Array }}
 */
export function loadMcpConfig() {
  const mtime = getMtime(MCP_CONFIG_FILE);

  if (configCache && mtime === configCacheMtime) {
    return configCache;
  }

  if (!existsSync(MCP_CONFIG_FILE)) {
    const defaults = { servers: [] };
    try { writeFileSync(MCP_CONFIG_FILE, JSON.stringify(defaults, null, 2), 'utf-8'); } catch {}
    configCache = defaults;
    configCacheMtime = getMtime(MCP_CONFIG_FILE);
    return defaults;
  }

  try {
    const raw = readFileSync(MCP_CONFIG_FILE, 'utf-8');
    configCache = JSON.parse(raw);
    if (!configCache.servers) configCache.servers = [];
    configCacheMtime = mtime;
    return configCache;
  } catch (err) {
    console.error('[MCP Config] 配置文件解析失败:', err.message);
    configCache = { servers: [] };
    configCacheMtime = 0;
    return configCache;
  }
}

/**
 * 保存 MCP Server 配置
 */
export async function saveMcpConfig(config) {
  return withWriteLock(async () => {
    try {
      writeFileSync(MCP_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
      configCache = JSON.parse(JSON.stringify(config)); // 深拷贝
      configCacheMtime = getMtime(MCP_CONFIG_FILE);
    } catch (err) {
      console.error('[MCP Config] 保存配置失败:', err.message);
      throw err;
    }
  });
}

/**
 * 添加或更新 MCP Server
 * @param {Object} server - { id, name, command, args, env, enabled }
 */
export async function addMcpServer(server) {
  const config = loadMcpConfig();
  const existingIdx = config.servers.findIndex(s => s.id === server.id);

  if (existingIdx >= 0) {
    config.servers[existingIdx] = { ...config.servers[existingIdx], ...server };
  } else {
    config.servers.push(server);
  }

  await saveMcpConfig(config);
  return { success: true };
}

/**
 * 删除 MCP Server
 */
export async function removeMcpServer(serverId) {
  const config = loadMcpConfig();
  const idx = config.servers.findIndex(s => s.id === serverId);
  if (idx < 0) {
    return { success: false, error: `MCP Server "${serverId}" 不存在` };
  }
  config.servers.splice(idx, 1);
  await saveMcpConfig(config);
  return { success: true };
}

/**
 * 更新 MCP Server 的启用状态
 */
export async function toggleMcpServer(serverId, enabled) {
  const config = loadMcpConfig();
  const server = config.servers.find(s => s.id === serverId);
  if (!server) {
    return { success: false, error: `MCP Server "${serverId}" 不存在` };
  }
  server.enabled = enabled;
  await saveMcpConfig(config);
  return { success: true };
}

export { MCP_CONFIG_FILE };
