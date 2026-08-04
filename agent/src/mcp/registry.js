// mcp/registry.js - MCP 工具注册表
// 管理所有 MCP Client 实例，提供统一的工具发现和调用接口
import { McpClient } from './client.js';
import { loadMcpConfig, addMcpServer, removeMcpServer, toggleMcpServer } from './mcp-config.js';
import { t as translate, parseAcceptLanguage } from '../i18n.js';

// 默认跟随系统语言；server.js 启动时可用 setMcpRegistryLang 同步 serverLang
let LANG = parseAcceptLanguage();
const T = (key, params) => translate(LANG, key, params);

/**
 * 设置 MCP 注册表当前使用的语言（由 server.js 在启动时调用）
 * @param {string} lang - 语言代码（'zh' | 'en'）
 */
export function setMcpRegistryLang(lang) {
  if (lang) LANG = lang;
}

// 已连接的 MCP Client 映射表: serverId → McpClient
const clients = new Map();

/**
 * 启动时加载并连接所有启用的 MCP Server
 * @returns {Promise<{connected: number, failed: number}>}
 */
export async function initializeMcpRegistry() {
  const config = loadMcpConfig();
  let connected = 0;
  let failed = 0;
  const failedServers = [];

  for (const server of config.servers) {
    if (!server.enabled) continue;

    const client = new McpClient(server);
    const result = await client.connect();
    if (result.success) {
      clients.set(server.id, client);
      connected++;
    } else {
      failed++;
      failedServers.push({ id: server.id, error: result.error });
    }
  }

  if (config.servers.length > 0) {
    if (failed > 0) {
      const failedList = failedServers.map(fs => `${fs.id}(${fs.error})`).join(', ');
      console.warn(`[MCP] ${T('mcp.someFailed', { connected, total: config.servers.length, failed, list: failedList })}`);
    } else if (connected > 0) {
      console.log(`[MCP] ${T('mcp.serversConnected', { count: connected })}`);
    }
  }
  return { connected, failed };
}

/**
 * 获取所有 MCP Server 及其状态
 */
export function getMcpServersStatus() {
  const config = loadMcpConfig();
  const statuses = config.servers.map(server => {
    const client = clients.get(server.id);
    if (client && client.connected) {
      return {
        ...server,
        connected: true,
        toolCount: client.tools.length,
        tools: client.tools,
        serverInfo: client.serverInfo?.serverInfo || null
      };
    }
    return {
      ...server,
      connected: false,
      toolCount: 0,
      tools: [],
      serverInfo: null
    };
  });

  return { success: true, servers: statuses };
}

/**
 * 获取所有已连接 MCP Server 的工具列表（扁平化）
 * @param {string} [serverId] - 可选，只获取指定 Server 的工具
 */
export function getMcpTools(serverId) {
  const tools = [];

  for (const [id, client] of clients) {
    if (serverId && id !== serverId) continue;
    if (!client.connected) continue;

    for (const tool of client.tools) {
      tools.push({
        serverId: id,
        serverName: client.serverName,
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || { type: 'object', properties: {} }
      });
    }
  }

  return { success: true, tools };
}

/**
 * 调用指定 MCP Server 的工具
 * @param {string} serverId
 * @param {string} toolName
 * @param {Object} args
 */
export async function callMcpTool(serverId, toolName, args) {
  const client = clients.get(serverId);
  if (!client) {
    return { success: false, error: T('mcp.serverNotFound', { name: serverId }) };
  }
  if (!client.connected) {
    return { success: false, error: T('mcp.serverNotConnected', { name: serverId }) };
  }

  console.log(`[MCP Registry] ${T('mcp.callingTool', { serverId, toolName })}`, args);
  const result = await client.callTool(toolName, args);
  return result;
}

/**
 * 连接指定 MCP Server
 */
export async function connectMcpServer(serverId) {
  const config = loadMcpConfig();
  const server = config.servers.find(s => s.id === serverId);
  if (!server) {
    return { success: false, error: T('mcp.serverNotFound', { name: serverId }) };
  }

  // 先断开已有连接
  const existingClient = clients.get(serverId);
  if (existingClient) {
    await existingClient.disconnect();
    clients.delete(serverId);
  }

  const client = new McpClient(server);
  const result = await client.connect();
  if (result.success) {
    clients.set(serverId, client);
    return { success: true, toolCount: result.toolCount };
  }
  return result;
}

/**
 * 断开指定 MCP Server
 */
export async function disconnectMcpServer(serverId) {
  const client = clients.get(serverId);
  if (client) {
    await client.disconnect();
    clients.delete(serverId);
    return { success: true };
  }
  return { success: false, error: `MCP Server "${serverId}" 未连接` };
}

/**
 * 关闭所有 MCP 连接（Agent 关闭时调用）
 */
export async function shutdownMcpRegistry() {
  for (const [id, client] of clients) {
    try { await client.disconnect(); } catch {}
  }
  clients.clear();
}

// 重新导出配置管理函数，方便 server.js 使用
export { loadMcpConfig, addMcpServer, removeMcpServer, toggleMcpServer };
