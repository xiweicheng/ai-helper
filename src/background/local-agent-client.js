// background/local-agent-client.js - 本地代理通信客户端
// 封装与本地代理服务的 HTTP 和 WebSocket 通信

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
      console.log('[AgentClient] 配对成功');
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
  console.log('[AgentClient] 已断开配对');
}

/**
 * 发送带认证的 HTTP 请求到 Agent
 */
async function agentRequest(path, body = {}) {
  const config = await getAgentConfig();
  if (!config.connected) {
    return { success: false, error: 'Agent 未配对，请先在设置中完成配对' };
  }

  try {
    const response = await fetch(`${config.url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      },
      body: JSON.stringify(body)
    });
    return await response.json();
  } catch (err) {
    return { success: false, error: `Agent 请求失败: ${err.message}` };
  }
}

/**
 * 发送带认证的 GET 请求
 */
async function agentGet(path) {
  const config = await getAgentConfig();
  if (!config.connected) {
    return { success: false, error: 'Agent 未配对' };
  }
  try {
    const response = await fetch(`${config.url}${path}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.token}` }
    });
    return await response.json();
  } catch (err) {
    return { success: false, error: `Agent 请求失败: ${err.message}` };
  }
}

async function readFile(filePath) {
  return agentRequest('/api/fs/read', { path: filePath });
}

async function writeFile(filePath, content) {
  return agentRequest('/api/fs/write', { path: filePath, content });
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
async function execCommandWait(command, cwd, force = false) {
  return agentRequest('/api/exec', { command, cwd, wait: true, force });
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
 */
async function createExecWebSocket(wsUrl, onMessage, onClose, onError) {
  const config = await getAgentConfig();
  if (!config.connected) {
    if (onError) onError(new Error('Agent 未配对'));
    return null;
  }

  // WebSocket 无法设置自定义 HTTP 头，认证 token 通过 URL query 参数传递
  const separator = wsUrl.includes('?') ? '&' : '?';
  const authenticatedUrl = `${wsUrl}${separator}token=${encodeURIComponent(config.token)}`;

  const ws = new WebSocket(authenticatedUrl);

  ws.onopen = () => {
    console.log('[AgentClient] WebSocket 已连接:', wsUrl, '(with token)');
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
    console.log('[AgentClient] WebSocket 已关闭');
    if (onClose) onClose();
  };

  ws.onerror = (err) => {
    console.error('[AgentClient] WebSocket 错误:', err);
    if (onError) onError(err);
  };

  return ws;
}

export {
  getAgentConfig,
  isAgentPaired,
  pairWithAgent,
  unpairAgent,
  agentRequest,
  readFile,
  writeFile,
  listDir,
  deleteFile,
  searchFiles,
  searchContent,
  execCommand,
  execCommandWait,
  stopCommand,
  getAgentStatus,
  getAgentDetail,
  createExecWebSocket
};
