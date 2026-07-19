import logger from '../shared/logger.js';

// background/local-agent-client.js - 代理通信客户端
// 封装与代理服务的 HTTP 和 WebSocket 通信
//
// ==================== Agent API 端点汇总 ====================
//
//   配对与会话:
//     POST   /api/pair                  - 配对认证
//     GET    /api/status                - 健康检查
//     GET    /api/status/detail         - 详细状态（配对码、工作目录）
//
//   文件系统:
//     POST   /api/fs/read               - 读取文件
//     POST   /api/fs/write              - 写入文件
//     POST   /api/fs/list               - 列出目录
//     POST   /api/fs/delete             - 删除文件/目录
//     POST   /api/fs/search_files       - 按模式搜索文件
//     POST   /api/fs/search_content     - 搜索文件内容
//     POST   /api/files/upload          - 上传文件到工作目录
//
//   浏览器:
//     POST   /api/browser/open          - 本地浏览器打开文件
//
//   命令执行:
//     POST   /api/exec                  - 执行命令（支持 wait/stop）
//     POST   /api/exec/stop             - 停止运行中的命令
//
//   MCP:
//     GET    /api/mcp/tools             - 工具列表 [?serverId=]
//     POST   /api/mcp/call              - 调用工具
//     GET    /api/mcp/servers           - Server 列表
//     POST   /api/mcp/servers           - 添加 Server
//     DELETE /api/mcp/servers           - 删除 Server
//     POST   /api/mcp/servers/connect   - 连接 Server
//     POST   /api/mcp/servers/disconnect- 断开 Server
//     PUT    /api/mcp/servers/toggle    - 启用/禁用 Server
//
//   Skill:
//     GET    /api/skill/list            - Skill 列表
//     GET    /api/skill/detail          - Skill 详情 [?name=]
//     POST   /api/skill/run             - 执行 Skill
//     POST   /api/skill/import          - 导入 Skill
//     DELETE /api/skill/delete          - 删除 Skill
//     POST   /api/skill/toggle          - 启用/禁用 Skill
//     POST   /api/skill/save-markdown   - 保存 Markdown
//     GET    /api/skill/markdown        - 获取 Markdown 内容
//     GET    /api/skill/resource        - 获取资源文件
//     POST   /api/skill/import-zip      - ZIP 导入（base64）
//     POST   /api/skill/import-url      - URL 导入
//
//   Agent Skill (Markdown):
//     GET    /api/skill/agent-prompts   - Prompt 汇总
//     GET    /api/skill/agent-prompt    - 单个 Prompt [?name=]
//
// 所有需认证的请求通过 Bearer Token（agentRequest/agentGet）发送

/**
 * 代理服务可达性状态
 * null = 尚未检测（未知），true = 可达，false = 不可达
 * 由 background/index.js 中的健康检查周期性更新
 */
let _agentReachable = null;

/**
 * 设置代理可达性状态
 * @param {boolean} reachable
 */
function setAgentReachable(reachable) {
  if (_agentReachable !== reachable) {
    logger.debug('[AgentClient] 代理可达性变更:', reachable ? '可达' : '不可达');
  }
  _agentReachable = reachable;
}

/**
 * 查询代理是否可达
 * @returns {boolean|null} null=未知, true=可达, false=不可达
 */
function isAgentReachable() {
  return _agentReachable;
}

/**
 * 获取代理 连接配置
 * @returns {Promise<{url: string|null, token: string|null, connected: boolean}>}
 */
async function getAgentConfig() {
  const result = await chrome.storage.local.get(['agentUrl', 'agentToken']);
  const url = result.agentUrl || null;
  const token = result.agentToken || null;
  return {
    url,
    token,
    connected: !!(url && token)
  };
}

/**
 * 检查 Agent 是否已配对
 */
async function isAgentPaired() {
  const config = await getAgentConfig();
  return config.connected;
}

/**
 * 发起配对请求
 */
async function pairWithAgent(agentUrl, pairCode) {
  try {
    const extensionId = chrome.runtime.id;
    const response = await fetch(`${agentUrl}/api/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: pairCode, extensionId })
    });
    const data = await response.json();
    if (data.success && data.token) {
      await chrome.storage.local.set({ agentUrl, agentToken: data.token });
      logger.debug('[AgentClient] 配对成功');
      return { success: true, token: data.token };
    }
    return { success: false, error: data.error || '配对失败' };
  } catch (err) {
    return { success: false, error: `无法连接到 Agent: ${err.message}` };
  }
}

/**
 * 断开配对
 */
async function unpairAgent() {
  await chrome.storage.local.remove(['agentUrl', 'agentToken']);
  logger.debug('[AgentClient] 已断开配对');
}

/**
 * 发送带认证的 HTTP 请求到 Agent
 * @param {string} path
 * @param {Object} [body]
 * @param {string} [method='POST']
 * @param {number} [timeoutMs=60000] - 请求超时时间（毫秒）
 */
async function agentRequest(path, body = {}, method = 'POST', timeoutMs = 60000) {
  const config = await getAgentConfig();
  if (!config.connected) {
    return { success: false, error: 'Agent 未配对，请先在设置中完成配对' };
  }

  // 代理服务已知不可达时，直接返回错误，避免阻塞等待超时
  if (_agentReachable === false) {
    return { success: false, error: '代理服务未连接，请确认代理服务已启动' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      },
      signal: controller.signal
    };

    // GET/DELETE 请求不需要 body
    if (method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(`${config.url}${path}`, fetchOptions);
    clearTimeout(timeoutId);
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { success: false, error: `请求超时 (${timeoutMs}ms)` };
    }
    return { success: false, error: `Agent 请求失败: ${err.message}` };
  }
}

/**
 * 发送带认证的 GET 请求
 * @param {string} path
 * @param {number} [timeoutMs=30000] - 请求超时时间（毫秒）
 */
async function agentGet(path, timeoutMs = 30000) {
  const config = await getAgentConfig();
  if (!config.connected) {
    return { success: false, error: 'Agent 未配对' };
  }

  // 代理服务已知不可达时，直接返回错误，避免阻塞等待超时
  if (_agentReachable === false) {
    return { success: false, error: '代理服务未连接，请确认代理服务已启动' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.url}${path}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.token}` },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { success: false, error: `请求超时 (${timeoutMs}ms)` };
    }
    return { success: false, error: `Agent 请求失败: ${err.message}` };
  }
}

async function readFile(filePath) {
  return agentRequest('/api/fs/read', { path: filePath });
}

async function writeFile(filePath, content) {
  return agentRequest('/api/fs/write', { path: filePath, content });
}

/**
 * 上传文件到 Agent 工作目录
 * @param {File|Blob} file - 浏览器 File/Blob 对象
 * @returns {Promise<{success: boolean, path?: string, name?: string, size?: number, error?: string}>}
 */
async function uploadFile(file) {
  const config = await getAgentConfig();
  if (!config.connected) {
    return { success: false, error: 'Agent 未配对，请先在设置中完成配对' };
  }
  if (_agentReachable === false) {
    return { success: false, error: '代理服务未连接，请确认代理服务已启动' };
  }

  const formData = new FormData();
  formData.append('file', file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${config.url}/api/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`
      },
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { success: false, error: '文件上传超时 (60s)' };
    }
    return { success: false, error: `文件上传失败: ${err.message}` };
  }
}

/**
 * 在本地浏览器中打开文件
 * @param {string} filePath - 文件的绝对路径
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
async function openBrowser(filePath) {
  return agentRequest('/api/browser/open', { path: filePath });
}

async function listDir(dirPath) {
  return agentRequest('/api/fs/list', { path: dirPath });
}

async function deleteFile(filePath) {
  return agentRequest('/api/fs/delete', { path: filePath });
}

/**
 * 按文件名模式搜索文件
 */
async function searchFiles(rootPath, pattern = '*', recursive = true, maxResults = 200) {
  return agentRequest('/api/fs/search_files', { path: rootPath, pattern, recursive, maxResults });
}

/**
 * 搜索文件内容
 */
async function searchContent(rootPath, pattern, filePattern = null, caseSensitive = false, maxResults = 100, contextLines = 2) {
  return agentRequest('/api/fs/search_content', { path: rootPath, pattern, filePattern, caseSensitive, maxResults, contextLines });
}

/**
 * 发起命令执行请求
 * @param {string} command
 * @param {string} [cwd]
 * @param {boolean} [force=false] - 强制执行（跳过安全检查）
 */
async function execCommand(command, cwd, force = false) {
  return agentRequest('/api/exec', { command, cwd, force });
}

/**
 * 同步执行命令并等待结果（用于扩展端获取完整输出）
 * @returns {Promise<Object>} { success, exitCode, stdout, stderr, execId, killed, error? }
 */
async function execCommandWait(command, cwd, force = false, timeoutMs = 600000) {
  return agentRequest('/api/exec', { command, cwd, wait: true, force }, 'POST', timeoutMs);
}

/**
 * 停止命令执行
 */
async function stopCommand(execId) {
  return agentRequest('/api/exec/stop', { execId });
}

/**
 * 获取 Agent 详细状态（需认证）
 */
async function getAgentStatus() {
  const config = await getAgentConfig();
  if (!config.connected) {
    return { success: false, error: 'Agent 未配对' };
  }
  try {
    const response = await fetch(`${config.url}/api/status`);
    return await response.json();
  } catch (err) {
    return { success: false, error: `无法连接到 Agent: ${err.message}` };
  }
}

/**
 * 获取 Agent 详细信息（含配对码和工作目录，需认证）
 */
async function getAgentDetail() {
  return agentGet('/api/status/detail');
}

/**
 * 创建 WebSocket 连接，用于接收命令执行的实时输出
 * Token 通过 getAgentConfig 获取，不再从 URL 传入
 * 注意：空闲超时由调用方（tool-executor.js）的 Promise 超时统一管理，
 * 此处不再设置 WebSocket 层空闲超时，避免双重超时冲突导致连接被意外关闭。
 * @param {string} wsUrl - WebSocket 连接地址
 * @param {Function} onMessage - 消息回调
 * @param {Function} onClose - 关闭回调
 * @param {Function} onError - 错误回调
 * @param {number} [_idleTimeoutMs] - 已废弃，由调用方统一管理超时
 */
async function createExecWebSocket(wsUrl, onMessage, onClose, onError, _idleTimeoutMs) {
  const config = await getAgentConfig();
  if (!config.connected) {
    if (onError) onError(new Error('Agent 未配对'));
    return null;
  }

  // 代理服务已知不可达时，直接返回 null，避免阻塞等待超时
  if (_agentReachable === false) {
    if (onError) onError(new Error('代理服务未连接，请确认代理服务已启动'));
    return null;
  }

  // WebSocket 无法设置自定义 HTTP 头，认证 token 通过 URL query 参数传递
  const separator = wsUrl.includes('?') ? '&' : '?';
  const authenticatedUrl = `${wsUrl}${separator}token=${encodeURIComponent(config.token)}`;

  const ws = new WebSocket(authenticatedUrl);

  ws.onopen = () => {
    logger.debug('[AgentClient] WebSocket 已连接:', wsUrl, '(with token)');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (onMessage) onMessage(data);
    } catch {
      if (onMessage) onMessage({ type: 'raw', data: event.data });
    }
  };

  ws.onclose = () => {
    logger.debug('[AgentClient] WebSocket 已关闭');
    if (onClose) onClose();
  };

  ws.onerror = (err) => {
    logger.error('[AgentClient] WebSocket 错误:', err);
    if (onError) onError(err);
  };

  return ws;
}

// ========== MCP 相关 API ==========

/**
 * 获取所有 MCP 工具列表
 * @param {string} [serverId] - 可选，只获取指定 Server 的工具
 */
async function getMcpTools(serverId) {
  const path = serverId ? `/api/mcp/tools?serverId=${encodeURIComponent(serverId)}` : '/api/mcp/tools';
  return agentGet(path);
}

/**
 * 调用 MCP 工具
 */
async function callMcpTool(serverId, toolName, args) {
  return agentRequest('/api/mcp/call', { serverId, toolName, args });
}

/**
 * 获取所有 MCP Server 配置及状态
 */
async function getMcpServers() {
  return agentGet('/api/mcp/servers');
}

/**
 * 添加 MCP Server
 */
async function addMcpServer(serverConfig) {
  return agentRequest('/api/mcp/servers', serverConfig);
}

/**
 * 删除 MCP Server
 */
async function removeMcpServer(serverId) {
  return agentRequest('/api/mcp/servers', { id: serverId }, 'DELETE');
}

/**
 * 连接 MCP Server
 */
async function connectMcpServer(serverId) {
  return agentRequest('/api/mcp/servers/connect', { id: serverId });
}

/**
 * 断开 MCP Server
 */
async function disconnectMcpServer(serverId) {
  return agentRequest('/api/mcp/servers/disconnect', { id: serverId });
}

/**
 * 切换 MCP Server 启用状态
 */
async function toggleMcpServer(serverId, enabled) {
  return agentRequest('/api/mcp/servers/toggle', { id: serverId, enabled }, 'PUT');
}

// ========== Skill 相关 API ==========

/**
 * 获取 Skill 列表
 */
async function getSkillList() {
  return agentGet('/api/skill/list');
}

/**
 * 获取单个 Skill 详情
 */
async function getSkillDetail(name) {
  return agentGet(`/api/skill/detail?name=${encodeURIComponent(name)}`);
}

/**
 * 执行 Skill
 */
async function runSkill(name, params) {
  return agentRequest('/api/skill/run', { name, params });
}

/**
 * 导入 Skill
 */
async function importSkill(skillDef) {
  return agentRequest('/api/skill/import', skillDef);
}

/**
 * 删除 Skill
 */
async function deleteSkill(name) {
  return agentRequest('/api/skill/delete', { name }, 'DELETE');
}

/**
 * 切换 Skill 启用/停用状态
 */
async function toggleSkill(name) {
  return agentRequest('/api/skill/toggle', { name });
}

// ========== Agent Skill (Markdown) API ==========

/**
 * 获取 Agent Skill 的 Prompt 汇总（用于 System Prompt 注入）
 */
async function getAgentSkillPrompts() {
  return agentGet('/api/skill/agent-prompts');
}

/**
 * 获取指定技能名称的 Agent Skill Prompt 汇总（按名称过滤）
 * @param {string[]} skillNames - 技能名称列表
 * @returns {Promise<{success: boolean, prompts: string, error?: string}>}
 */
async function getAgentSkillPromptsFiltered(skillNames) {
  if (!skillNames || skillNames.length === 0) {
    return { success: true, prompts: '' };
  }
  try {
    const results = await Promise.all(
      skillNames.map(name => getAgentSkillPrompt(name).catch(() => null))
    );
    const prompts = results
      .filter(r => r && r.success && r.prompt)
      .map(r => r.prompt)
      .join('\n\n');
    return { success: true, prompts };
  } catch {
    return { success: false, prompts: '', error: '获取技能提示词失败' };
  }
}

/**
 * 按需加载单个 Agent Skill 的完整内容
 */
async function getAgentSkillPrompt(name) {
  return agentGet(`/api/skill/agent-prompt?name=${encodeURIComponent(name)}`);
}

/**
 * 保存 Agent Skill Markdown
 */
async function saveMarkdownSkill(name, markdown, description, version) {
  return agentRequest('/api/skill/save-markdown', { name, markdown, description, version });
}

/**
 * 获取 Agent Skill 的 SKILL.md 内容
 */
async function getMarkdownSkill(name) {
  return agentGet(`/api/skill/markdown?name=${encodeURIComponent(name)}`);
}

/**
 * 获取 Skill 资源文件内容
 */
async function getSkillResource(name, resource) {
  return agentGet(`/api/skill/resource?name=${encodeURIComponent(name)}&resource=${encodeURIComponent(resource)}`);
}

/**
 * 从 Zip 导入 Agent Skill
 * @param {string} zipBase64 - base64 编码的 zip 文件内容
 * @param {string} [skillName] - 可选，指定 skill 名称
 */
async function importSkillFromZip(zipBase64, skillName) {
  return agentRequest('/api/skill/import-zip', { zipData: zipBase64, name: skillName });
}

/**
 * 从 URL 导入 Agent Skill
 * @param {string} url - Skill zip 包的下载 URL
 */
async function importSkillFromUrl(url) {
  return agentRequest('/api/skill/import-url', { url });
}

export {
  setAgentReachable,
  isAgentReachable,
  getAgentConfig,
  isAgentPaired,
  pairWithAgent,
  unpairAgent,
  agentRequest,
  readFile,
  writeFile,
  uploadFile,
  openBrowser,
  listDir,
  deleteFile,
  searchFiles,
  searchContent,
  execCommand,
  execCommandWait,
  stopCommand,
  getAgentStatus,
  getAgentDetail,
  createExecWebSocket,
  // MCP 相关
  getMcpTools,
  callMcpTool,
  getMcpServers,
  addMcpServer,
  removeMcpServer,
  connectMcpServer,
  disconnectMcpServer,
  toggleMcpServer,
  // Skill 相关
  getSkillList,
  getSkillDetail,
  runSkill,
  importSkill,
  deleteSkill,
  toggleSkill,
  // Agent Skill (Markdown) API
  getAgentSkillPrompts,
  getAgentSkillPromptsFiltered,
  getAgentSkillPrompt,
  saveMarkdownSkill,
  getMarkdownSkill,
  getSkillResource,
  importSkillFromZip,
  importSkillFromUrl
};
