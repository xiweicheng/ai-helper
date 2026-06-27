// background/local-agent-client.js - 本地 Agent 通信客户端
// 封装与本地 Agent 服务的 HTTP 和 WebSocket 通信

/**
 * 获取 Agent 连接配置
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
 * @param {string} agentUrl - Agent 地址，如 http://127.0.0.1:18910
 * @param {string} pairCode - 配对码
 * @returns {Promise<{success: boolean, token?: string, error?: string}>}
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
 * 断开配对（清除存储的 token）
 */
async function unpairAgent() {
  await chrome.storage.local.remove(['agentUrl', 'agentToken']);
  console.log('[AgentClient] 已断开配对');
}

/**
 * 发送带认证的 HTTP 请求到 Agent
 * @param {string} path - API 路径，如 '/api/fs/read'
 * @param {Object} body - 请求体
 * @returns {Promise<Object>}
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
 * 读取文件
 */
async function readFile(filePath) {
  return agentRequest('/api/fs/read', { path: filePath });
}

/**
 * 写入文件
 */
async function writeFile(filePath, content) {
  return agentRequest('/api/fs/write', { path: filePath, content });
}

/**
 * 列出目录
 */
async function listDir(dirPath) {
  return agentRequest('/api/fs/list', { path: dirPath });
}

/**
 * 删除文件/目录
 */
async function deleteFile(filePath) {
  return agentRequest('/api/fs/delete', { path: filePath });
}

/**
 * 发起命令执行请求（先发 HTTP，根据返回的 level 决定后续流程）
 * @param {string} command
 * @param {string} [cwd]
 * @returns {Promise<Object>} { success, level, execId?, wsUrl?, reason?, command?, error? }
 */
async function execCommand(command, cwd) {
  return agentRequest('/api/exec', { command, cwd });
}

/**
 * 确认执行灰名单命令
 */
async function execCommandConfirm(command, cwd) {
  return agentRequest('/api/exec/confirm', { command, cwd });
}

/**
 * 停止命令执行
 */
async function stopCommand(execId) {
  return agentRequest('/api/exec/stop', { execId });
}

/**
 * 获取 Agent 状态（配对码、工作目录等）
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
 * 创建 WebSocket 连接，用于接收命令执行的实时输出
 * @param {string} wsUrl - WebSocket URL
 * @param {Function} onMessage - 消息回调 (data) => void
 * @param {Function} onClose - 关闭回调 () => void
 * @param {Function} onError - 错误回调 (error) => void
 * @returns {WebSocket}
 */
async function createExecWebSocket(wsUrl, onMessage, onClose, onError) {
  const config = await getAgentConfig();
  if (!config.connected) {
    if (onError) onError(new Error('Agent 未配对'));
    return null;
  }

  // wsUrl 中已经包含了 token query param
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[AgentClient] WebSocket 已连接:', wsUrl);
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
  execCommand,
  execCommandConfirm,
  stopCommand,
  getAgentStatus,
  createExecWebSocket
};
