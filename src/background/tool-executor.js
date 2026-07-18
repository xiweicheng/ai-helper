// background/tool-executor.js - 工具定义与执行
import { BUILTIN_TOOLS, TOOL_EXECUTION_MAP, RAW_TOOLS, PARALLELIZABLE_TOOLS, CONFIRMATION_REQUIRED_TOOLS } from './constants.js';
import { getStoredConfig } from './config.js';
import { searchActiveSessionsMessages, getArchivedSessionsMessages, getActiveSessionId, ensureMigration, saveUiPrototype, getUiPrototype } from '../storage/db.js';
import * as AgentClient from './local-agent-client.js';
import { sendAgentStream, sendAgentStreamDone } from './stream-controller.js';
import { executeDispatchSubAgent } from './agent-dispatcher.js';
import logger from '../shared/logger.js';

// 从拆分子模块导入工具辅助与网络请求函数
import {
  tryParseToolArgs, makeResult, normalizeToolResult, recordToolStats,
  getActiveTabId, sendToContentScriptWithRetry
} from './tool-helpers.js';
import { fetchWithTimeout, fetchWithRetry, executeFetchUrl } from './tool-network.js';
import { executeAgentMemoryStore, executeAgentMemoryRecall, executeAgentMemoryManage } from './tool-memory.js';
import { executeGetPageContent, executeExtractData, executeClipboard, executeCopyToClipboard, executePasteFromClipboard } from './tool-clipboard.js';
import { executeCapturePage, executeTakeFullPageScreenshot, triggerScreenshotDownload } from './tool-screenshot.js';

// 重导出（保持对外接口不变：react-loop.js / tool-preselector.js 仍从本模块导入）
export { fetchWithTimeout, fetchWithRetry, executeFetchUrl };
// 重导出剪贴板工具（保持对外接口不变）
export { executeCopyToClipboard, executePasteFromClipboard } from './tool-clipboard.js';
export { triggerScreenshotDownload } from './tool-screenshot.js';
// 重导出截图下载工具（保持对外接口不变）

// 跟踪正在运行的 Agent 命令（sessionId → { execId, ws }）
// 用于在用户取消任务时关闭 WebSocket 连接，防止旧命令输出污染新任务
const runningAgentCommands = new Map();

// 背景工具处理器映射（仅包含 execution: 'background' 且有 handler 的工具）
// 声明放在前面，避免 rebuildBgHandlers 调用时出现 ReferenceError
const BG_HANDLERS = {};

// Content Script 工具参数构建器映射
// 声明放在前面，避免工具执行时出现 ReferenceError
const CONTENT_PAYLOADS = {};

// Background 工具处理器注册表（单一数据源）
// 声明放在前面，避免 rebuildBgHandlers 调用时出现 ReferenceError
const TOOL_HANDLERS = {};

// ==================== MCP 工具动态注册 ====================

// 已动态注册的 MCP 工具 ID 集合（用于去重和清理）
const mcpToolIds = new Set();

// 互斥锁：防止 loadMcpTools / unloadMcpTools 并发执行
let mcpLoadLock = Promise.resolve();

/**
 * 从 Agent 拉取 MCP 工具列表并动态注入到 RAW_TOOLS 和 TOOL_HANDLERS
 * Agent 未连通或不支持 MCP 时自动跳过
 */
export async function loadMcpTools() {
  // 互斥锁：等待上一次操作完成
  const prevLock = mcpLoadLock;
  let releaseLock;
  mcpLoadLock = new Promise(resolve => { releaseLock = resolve; });
  await prevLock;

  try {
    // 检查全局 MCP 开关
    const { mcpEnabled } = await chrome.storage.local.get(['mcpEnabled']);
    if (mcpEnabled !== true) {
      logger.debug('[Background] MCP 全局开关已关闭，跳过工具加载');
      return 0;
    }

    // 先清理之前注册的 MCP 工具
    unloadMcpToolsInternal();

    // 并行获取工具列表和服务器状态
    const [toolsResult, serversResult] = await Promise.all([
      AgentClient.getMcpTools(),
      AgentClient.getMcpServers()
    ]);

    if (!toolsResult.success || !toolsResult.tools || toolsResult.tools.length === 0) {
      logger.debug('[Background] 无可用的 MCP 工具');
      return 0;
    }

    // 构建已禁用服务器的 ID 集合
    const disabledServerIds = new Set();
    if (serversResult?.servers) {
      for (const server of serversResult.servers) {
        if (server.enabled === false) {
          disabledServerIds.add(server.id);
        }
      }
    }

    let registered = 0;
    for (const tool of toolsResult.tools) {
      if (disabledServerIds.has(tool.serverId)) {
        logger.debug(`[Background] 跳过已禁用 MCP 服务器 "${tool.serverName}" 的工具: ${tool.name}`);
        continue;
      }

      const toolId = `mcp_${tool.serverId}_${tool.name}`;
      if (mcpToolIds.has(toolId)) continue;

      const rawToolDef = {
        id: toolId,
        category: 'mcp',
        execution: 'background',
        parallelizable: true,
        requiresConfirmation: false,
        type: 'function',
        function: {
          name: toolId,
          description: `[MCP:${tool.serverName}] ${tool.description || tool.name}`,
          parameters: tool.inputSchema || { type: 'object', properties: {} }
        }
      };
      RAW_TOOLS.push(rawToolDef);
      BUILTIN_TOOLS.push({ id: rawToolDef.id, type: rawToolDef.type, function: rawToolDef.function });
      TOOL_EXECUTION_MAP[toolId] = 'background';
      TOOL_HANDLERS[toolId] = async (args, toolCallId) => {
        const result = await AgentClient.callMcpTool(tool.serverId, tool.name, args);
        return { success: result.success, content: result.content || result.error || '', tool_call_id: toolCallId };
      };
      mcpToolIds.add(toolId);
      registered++;
    }

    rebuildBgHandlers();

    const mcpToolsForUI = toolsResult.tools
      .filter(t => !disabledServerIds.has(t.serverId))
      .map(t => ({
        id: `mcp_${t.serverId}_${t.name}`,
        name: `mcp_${t.serverId}_${t.name}`,
        description: `[MCP:${t.serverName}] ${t.description || t.name}`,
        category: 'mcp',
        execution: 'background',
        parallelizable: true,
        requiresConfirmation: false,
        enabled: true,
        serverId: t.serverId,
        serverName: t.serverName
      }));
    await chrome.storage.local.set({ mcpTools: mcpToolsForUI });

    logger.debug(`[Background] 已加载 ${registered} 个 MCP 工具`);
    return registered;
  } catch (err) {
    logger.debug('[Background] 加载 MCP 工具失败（Agent 可能不支持 MCP）:', err.message);
    return 0;
  } finally {
    releaseLock();
  }
}

/**
 * 清理所有动态注册的 MCP 工具（内部版本，不加锁，由 loadMcpTools 调用）
 */
function unloadMcpToolsInternal() {
  for (const toolId of mcpToolIds) {
    let idx = RAW_TOOLS.findIndex(t => t.id === toolId);
    if (idx >= 0) RAW_TOOLS.splice(idx, 1);
    idx = BUILTIN_TOOLS.findIndex(t => t.id === toolId);
    if (idx >= 0) BUILTIN_TOOLS.splice(idx, 1);
    delete TOOL_EXECUTION_MAP[toolId];
    delete TOOL_HANDLERS[toolId];
  }
  mcpToolIds.clear();
  rebuildBgHandlers();
  chrome.storage.local.remove('mcpTools');
}

/**
 * 清理所有动态注册的 MCP 工具（公开版本，带互斥锁）
 */
export async function unloadMcpTools() {
  const prevLock = mcpLoadLock;
  let releaseLock;
  mcpLoadLock = new Promise(resolve => { releaseLock = resolve; });
  await prevLock;
  try {
    unloadMcpToolsInternal();
  } finally {
    releaseLock();
  }
}

/**
 * 重建 BG_HANDLERS（RAW_TOOLS 变化后需要重新派生）
 * 注意：直接使用 tool.execution 属性而非 TOOL_EXECUTION_MAP，
 * 因为 TOOL_EXECUTION_MAP 在 constants.js 中定义后不会随动态添加的 MCP 工具更新
 */
function rebuildBgHandlers() {
  for (const key of Object.keys(BG_HANDLERS)) {
    delete BG_HANDLERS[key];
  }
  // 同步重建 PARALLELIZABLE_TOOLS / CONFIRMATION_REQUIRED_TOOLS，确保 MCP 工具也被纳入
  PARALLELIZABLE_TOOLS.clear();
  CONFIRMATION_REQUIRED_TOOLS.clear();
  for (const tool of RAW_TOOLS) {
    if (tool.execution === 'background' && TOOL_HANDLERS[tool.id]) {
      BG_HANDLERS[tool.id] = TOOL_HANDLERS[tool.id];
    }
    if (tool.parallelizable) PARALLELIZABLE_TOOLS.add(tool.id);
    if (tool.requiresConfirmation) CONFIRMATION_REQUIRED_TOOLS.add(tool.id);
  }
}

// ==================== 敏感操作审计日志 ====================

const AUDIT_LOG_KEY = 'sensitiveAuditLog';
const MAX_AUDIT_ENTRIES = 100;

async function appendAuditLog(category, action, details = {}) {
  try {
    const result = await chrome.storage.local.get([AUDIT_LOG_KEY]);
    const entries = result[AUDIT_LOG_KEY] || [];
    entries.unshift({ timestamp: new Date().toISOString(), category, action, details });
    if (entries.length > MAX_AUDIT_ENTRIES) entries.length = MAX_AUDIT_ENTRIES;
    await chrome.storage.local.set({ [AUDIT_LOG_KEY]: entries });
  } catch (e) { logger.warn('[Background] 审计日志写入失败:', e); }
}

// Agent 连通性缓存（避免每次 getTools 都做网络探测）
let agentConnectivityCache = { connected: null, checkedAt: 0 };
const AGENT_CACHE_TTL = 30000; // 30 秒内复用缓存

export function clearAgentConnectivityCache() {
  agentConnectivityCache = { connected: null, checkedAt: 0 };
}

/**
 * 检测 Agent 是否真正连通（storage 有凭据且服务可达）
 * 有缓存时直接返回，避免每次调用都发网络请求
 */
async function checkAgentConnectivity() {
  const now = Date.now();
  if (agentConnectivityCache.connected !== null && (now - agentConnectivityCache.checkedAt) < AGENT_CACHE_TTL) {
    return agentConnectivityCache.connected;
  }

  // 第一步：检查 storage 是否有配对的凭据
  const storage = await chrome.storage.local.get(['agentUrl', 'agentToken']);
  if (!storage.agentUrl || !storage.agentToken) {
    agentConnectivityCache = { connected: false, checkedAt: now };
    AgentClient.setAgentReachable(false);
    return false;
  }

  // 第二步：有凭据，但需确认 代理服务是否可达（1.5 秒超时）
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`${storage.agentUrl}/api/status`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const connected = response.ok;
    agentConnectivityCache = { connected, checkedAt: now };
    AgentClient.setAgentReachable(connected);
    logger.debug('[Background] Agent 连通性检测:', connected ? '可达' : '不可达 (status=' + response.status + ')');
    return connected;
  } catch (err) {
    agentConnectivityCache = { connected: false, checkedAt: now };
    AgentClient.setAgentReachable(false);
    logger.debug('[Background] Agent 连通性检测: 不可达 (' + (err.name === 'AbortError' ? '超时' : err.message) + ')');
    return false;
  }
}

/**
 * 获取启用的工具列表
 * 会自动隐藏不可用的工具（如 Agent 未连通时隐藏 agent_* 工具）
 * @param {string[]|null} agentToolIds - Agent 指定的工具 ID 列表，null = 使用全局 enabledTools
 */
export async function getTools(agentToolIds = null, agentId = null) {
  return new Promise((resolve) => {
    const agentToolsKey = `agentEnabledTools_${agentId || 'default'}`;
    chrome.storage.local.get([agentToolsKey, 'enabledTools', 'enableImageInput'], async (result) => {
      // 优先读取 agent-specific key，降级到旧的全局 enabledTools
      let enabledTools = result[agentToolsKey] || result.enabledTools;
      
      // 如果没有保存的配置，使用默认值（全部启用）
      if (!enabledTools || !Array.isArray(enabledTools) || enabledTools.length === 0) {
        enabledTools = BUILTIN_TOOLS.map(t => t.id);
        logger.debug('[Background] 未找到工具配置，使用默认值（全部启用）');
      }

      // 如果 Agent 指定了工具列表，与全局启用列表取交集
      const finalToolIds = agentToolIds ? enabledTools.filter(id => agentToolIds.includes(id)) : enabledTools;
      if (agentToolIds) {
        logger.debug(`[Background] 工具过滤: ${enabledTools.length} 全局 → ${finalToolIds.length} 最终`);
      }

      // 读取图片识别开关状态
      const visionEnabled = result.enableImageInput === true;
      
      // 检测 Agent 是否真正连通（不仅检查凭据，还要确认服务可达）
      const agentConnected = await checkAgentConnectivity();
      
      logger.debug(`[Background] 工具配置: ${finalToolIds.length} 个启用, Agent=${agentConnected}, 图片识别=${visionEnabled}`);
      
      // 读取 MCP 全局开关和 Agent 连接状态
      const { mcpEnabled, skillsEnabled } = await chrome.storage.local.get(['mcpEnabled', 'skillsEnabled']);

      const tools = BUILTIN_TOOLS
        .filter(tool => finalToolIds.includes(tool.id))
        .filter(tool => {
          // Agent 未连通时，隐藏所有 agent_* 工具
          if (tool.id.startsWith('agent_') && !agentConnected) return false;
          // Skill 全局开关关闭时，过滤掉 Skill 执行/加载工具
          if ((tool.id === 'agent_skill_run' || tool.id === 'agent_skill_load') && skillsEnabled === false) return false;
          // MCP 工具：全局开关关闭 / Agent 未连通 / MCP Server 未连接时过滤
          if (tool.id.startsWith('mcp_')) {
            if (mcpEnabled !== true || !agentConnected) return false;
            if (!mcpToolIds.has(tool.id)) return false;
          }
          return true;
        })
        .map(tool => {
          // 深拷贝避免修改原始 BUILTIN_TOOLS
          const cloned = JSON.parse(JSON.stringify(tool));

          // capture_page 工具：根据图片识别开关动态调整 action 枚举
          if (tool.id === 'capture_page') {
            const actionProp = cloned.function.parameters.properties.action;
            if (!visionEnabled) {
              // 关闭图片识别时，仅保留 download 和 fullpage 模式
              actionProp.enum = ['download', 'fullpage'];
              actionProp.description = '操作模式：download=下载截图，fullpage=全页截图';
              actionProp.default = 'download';
              cloned.function.description = '页面截图并下载到本地';
            }
          }

          return cloned;
        });
      
      logger.debug(`[Background] 最终可用工具: ${tools.length} 个`);
      resolve(tools);
    });
  });
}

// 监听全局 MCP 开关变化
chrome.storage.onChanged.addListener((changes) => {
  if (changes.mcpEnabled) {
    const enabled = changes.mcpEnabled.newValue === true;
    logger.debug('[Background] MCP 全局开关变更:', enabled);
    if (enabled) {
      loadMcpTools().then(count => {
        logger.debug('[Background] MCP 工具已重新加载:', count, '个');
      });
    } else {
      unloadMcpTools().then(() => {
        logger.debug('[Background] MCP 工具已全部卸载');
      });
    }
  }
  if (changes.skillsEnabled) {
    // Skill 开关变更时，由侧边栏 fetchAgentSkillPrompts 自行判断，无需额外处理
    logger.debug('[Background] Skill 全局开关变更:', changes.skillsEnabled.newValue !== false);
  }
});


// tryParseToolArgs / makeResult / normalizeToolResult / recordToolStats
// / getActiveTabId / sendToContentScriptWithRetry 已拆分到 tool-helpers.js

// ==================== 工具路由（基于 RAW_TOOLS 自动派生） ====================

// Background 工具处理器注册表（单一数据源）
// 新增 background 工具时：只需在 RAW_TOOLS 添加定义 + 在此注册 handler
// 使用 Object.assign 赋值，因为 TOOL_HANDLERS 已在文件顶部声明
Object.assign(TOOL_HANDLERS, {
  search_bookmarks: executeSearchBookmarks,
  search_history: executeSearchHistory,
  capture_page: executeCapturePage,
  clarify_question: executeClarifyQuestion,
  show_notification: executeShowNotification,
  fetch_url: executeFetchUrl,
  open_tab: executeOpenTab,
  switch_tab: executeSwitchTab,
  close_tab: executeCloseTab,
  get_tabs: executeGetTabs,
  get_browser_info: executeGetBrowserInfo,
  download_file: executeDownloadFile,
  manage_cookies: executeManageCookies,
  plan_task: executePlanTask,
  clear_page_data: executeClearPageData,
  navigate_back_forward: executeNavigateBackForward,
  reload_tab: executeReloadTab,
  search_conversation_memory: executeSearchConversationMemory,
  preview_ui_prototype: executePreviewUiPrototype,
  agent_read_file: executeAgentReadFile,
  agent_write_file: executeAgentWriteFile,
  agent_list_dir: executeAgentListDir,
  agent_delete_file: executeAgentDeleteFile,
  agent_exec_command: executeAgentExecCommand,
  agent_search_files: executeAgentSearchFiles,
  agent_search_content: executeAgentSearchContent,
  wait_for_navigation: executeWaitForNavigation,
  dispatch_sub_agent: executeDispatchSubAgent,
  agent_skill_run: executeSkillRun,
  agent_skill_load: executeSkillLoad,
  agent_memory_store: executeAgentMemoryStore,
  agent_memory_recall: executeAgentMemoryRecall,
  agent_memory_manage: executeAgentMemoryManage,
  // ── 合并后的工具 ──
  get_page_content: executeGetPageContent,
  extract_data: executeExtractData,
  clipboard: executeClipboard,
});

// 从 RAW_TOOLS 自动派生 BG_HANDLERS（仅包含 execution: 'background' 且有 handler 的工具）
for (const tool of RAW_TOOLS) {
  if (tool.execution === 'background' && TOOL_HANDLERS[tool.id]) {
    BG_HANDLERS[tool.id] = TOOL_HANDLERS[tool.id];
  }
}

// 从 RAW_TOOLS 自动派生 CONTENT_PAYLOADS（根据 function.parameters.properties 自动透传所有参数）
// 新增 content_script 工具时：只需在 RAW_TOOLS 添加定义，payload 自动生成
for (const tool of RAW_TOOLS) {
  if (tool.execution === 'content_script') {
    const props = tool.function.parameters?.properties;
    if (props) {
      const propKeys = Object.keys(props);
      CONTENT_PAYLOADS[tool.id] = (a) => {
        const payload = {};
        for (const key of propKeys) {
          payload[key] = a[key];
        }
        return payload;
      };
    } else {
      CONTENT_PAYLOADS[tool.id] = () => ({});
    }
  }
}

// 特殊覆盖：需要别名或默认值处理的工具
// search_in_page: 兼容 pattern 别名（模型可能传 pattern 而非 query）
CONTENT_PAYLOADS.search_in_page = a => ({
  query: a.query || a.pattern, mode: a.mode, caseSensitive: a.caseSensitive,
  contextLength: a.contextLength, maxResults: a.maxResults, highlight: a.highlight
});

// 模块初始化验证：检查关键映射是否正确填充
(function verifyToolMaps() {
  const bgKeys = Object.keys(BG_HANDLERS);
  const cpKeys = Object.keys(CONTENT_PAYLOADS);
  const thKeys = Object.keys(TOOL_HANDLERS);
  logger.debug('[Background] 模块初始化: BG_HANDLERS=' + bgKeys.length +
    ', CONTENT_PAYLOADS=' + cpKeys.length +
    ', TOOL_HANDLERS=' + thKeys.length +
    ', RAW_TOOLS=' + RAW_TOOLS.length);
})();

/**
 * 执行工具调用
 */
export async function executeTool(toolCall, tabId, sessionId = null) {
  const startTime = Date.now();
  const { name, arguments: argsStr, id, function: functionObj, index } = toolCall;
  
  // 兼容不同的工具调用格式
  let toolName = name || (functionObj && functionObj.name);
  let toolCallId = id;
  let args = {};
  
  logger.debug('[Background] 工具调用原始数据:', JSON.stringify(toolCall));
  
  // 解析参数
  if (functionObj && functionObj.arguments) {
    // 防御：arguments 可能是 string 或已解析的 object
    const argsStrRaw = typeof functionObj.arguments === 'string'
      ? functionObj.arguments
      : JSON.stringify(functionObj.arguments);
    logger.debug('[Background] toolCall.function.arguments 类型:', typeof functionObj.arguments, '长度:', argsStrRaw.length);
    try {
      const parsed = tryParseToolArgs(argsStrRaw);
      args = parsed || {};
    } catch (e) {
      logger.error('[Background] 解析工具参数失败:', e, '原始值:', argsStrRaw.substring(0, 300));
      return { success: false, error: '工具参数解析失败', tool_call_id: toolCallId };
    }
    if (Object.keys(args).length === 0 && argsStrRaw && argsStrRaw.length > 0 && argsStrRaw !== '{}') {
      logger.error('[Background] 参数解析后为空对象！原始 arguments:', argsStrRaw.substring(0, 300));
    }
  } else if (typeof argsStr === 'object') {
    args = argsStr || {};
  } else if (typeof argsStr === 'string') {
    logger.debug('[Background] 使用备用 argsStr 解析:', argsStr.substring(0, 300));
    try {
      const parsed = tryParseToolArgs(argsStr);
      args = parsed || {};
    } catch (e) {
      logger.error('[Background] 解析工具参数失败:', e, '原始值:', argsStr);
      return { success: false, error: '工具参数解析失败', tool_call_id: toolCallId };
    }
  }
  
  logger.debug('[Background] 执行工具:', toolName, args, 'id:', toolCallId);

  // 优先从 TOOL_EXECUTION_MAP 获取执行类型（常量映射，性能好）
  let executionType = TOOL_EXECUTION_MAP[toolName];

  // 回退：从 RAW_TOOLS 查找（支持动态添加的工具）
  if (!executionType) {
    const toolDef = RAW_TOOLS.find(t => t.id === toolName);
    if (toolDef) {
      executionType = toolDef.execution;
    }
  }

  let result;

  if (executionType === 'background') {
    const handler = BG_HANDLERS[toolName];
    if (handler) {
      logger.debug(`[Background] ${toolName} 直接执行，不通过 content script`);
      result = await handler(args, toolCallId, sessionId, tabId);
    } else {
      logger.error('[Background] BG_HANDLERS 中未找到 handler:', toolName);
      result = { success: false, error: '未知工具: ' + toolName, tool_call_id: toolCallId };
    }
  } else if (executionType === 'content_script') {
    // 优先从 CONTENT_PAYLOADS 获取 payload 构建器
    let buildPayload = CONTENT_PAYLOADS[toolName];

    // 回退：动态构建 payload（支持动态添加的工具）
    if (!buildPayload) {
      const toolDef = RAW_TOOLS.find(t => t.id === toolName);
      if (toolDef) {
        const props = toolDef.function.parameters?.properties;
        if (props) {
          const propKeys = Object.keys(props);
          buildPayload = (a) => {
            const payload = {};
            for (const key of propKeys) {
              payload[key] = a[key];
            }
            return payload;
          };
        } else {
          buildPayload = () => ({});
        }
      }
    }
    
    if (buildPayload) {
      const messageType = toolName.toUpperCase();
      const messagePayload = buildPayload(args);
      const targetTabId = tabId || await getActiveTabId();
      if (targetTabId) {
        result = await sendToContentScriptWithRetry(targetTabId, { type: messageType, ...messagePayload }, toolCallId);
      } else {
        result = { success: false, error: '没有可用的标签页', tool_call_id: toolCallId };
      }
    } else {
      result = { success: false, error: '未知工具: ' + toolName, tool_call_id: toolCallId };
    }
  } else {
    result = { success: false, error: '未知工具: ' + toolName, tool_call_id: toolCallId };
  }

  // 统一结果格式
  result = normalizeToolResult(result, toolCallId);

  // 记录工具使用统计
  const duration = Date.now() - startTime;
  recordToolStats(toolName, result, duration);

  return result;
}

/**
 * 执行书签搜索
 */
export function executeSearchBookmarks(args, toolCallId) {
  const query = args.query || '';
  const maxResults = parseInt(args.maxResults, 10) || 10;
  
  logger.debug('[Background] 执行书签搜索:', 'query=', JSON.stringify(query), 'maxResults=', maxResults);
  
  return new Promise((resolve) => {
    if (!chrome.bookmarks) {
      logger.error('[Background] chrome.bookmarks API 不可用');
      resolve(makeResult(false, '浏览器不支持书签 API'));
      return;
    }
    
    // 如果查询为空，获取书签树根节点来列出所有书签
    if (!query || query.trim() === '') {
      logger.debug('[Background] 空查询，获取书签根节点...');
      chrome.bookmarks.getTree((bookmarksTree) => {
        logger.debug('[Background] chrome.bookmarks.getTree 回调, 树节点数量:', bookmarksTree ? bookmarksTree.length : 'null');
        
        if (chrome.runtime.lastError) {
          logger.error('[Background] chrome.bookmarks.getTree 错误:', chrome.runtime.lastError.message);
          resolve(makeResult(false, '获取书签失败: ' + chrome.runtime.lastError.message));
          return;
        }
        
        // 递归收集所有书签（排除文件夹）
        const allBookmarks = [];
        function collectBookmarks(nodes) {
          if (!nodes) return;
          nodes.forEach(node => {
            if (node.url) {
              allBookmarks.push(node);
            }
            if (node.children && node.children.length > 0) {
              collectBookmarks(node.children);
            }
          });
        }
        collectBookmarks(bookmarksTree);
        
        logger.debug('[Background] 收集到的书签总数:', allBookmarks.length);
        
        if (allBookmarks.length === 0) {
          resolve(makeResult(true, '浏览器中暂无书签'));
          return;
        }
        
        // 限制结果数量
        const limitedResults = allBookmarks.slice(0, maxResults);
        
        // 格式化结果
        const formattedResults = limitedResults.map(bookmark => ({
          title: bookmark.title || '(无标题)',
          url: bookmark.url || '',
          dateAdded: bookmark.dateAdded ? new Date(bookmark.dateAdded).toLocaleString('zh-CN') : null
        }));
        
        const resultText = `浏览器中共有 ${allBookmarks.length} 个书签，显示前 ${formattedResults.length} 个：\n` +
          formattedResults.map((b, i) => `${i+1}. ${b.title}\n   URL: ${b.url}`).join('\n\n');
        
        logger.debug('[Background] 书签搜索成功，返回结果:', formattedResults.length);
        resolve(makeResult(true, resultText));
      });
      return;
    }
    
    // 有查询关键词，执行搜索
    logger.debug('[Background] 调用 chrome.bookmarks.search...');
    chrome.bookmarks.search(query, (results) => {
      logger.debug('[Background] chrome.bookmarks.search 回调, 结果数量:', results ? results.length : 'null');
      
      if (chrome.runtime.lastError) {
        logger.error('[Background] chrome.bookmarks.search 错误:', chrome.runtime.lastError.message);
        resolve(makeResult(false, '搜索书签失败: ' + chrome.runtime.lastError.message));
        return;
      }
      
      if (!results || results.length === 0) {
        logger.debug('[Background] 未找到匹配的书签');
        resolve(makeResult(true, '未找到匹配的书签。提示：尝试使用具体关键词搜索'));
        return;
      }
      
      // 限制结果数量
      const limitedResults = results.slice(0, maxResults);
      
      // 格式化结果
      const formattedResults = limitedResults.map(bookmark => ({
        title: bookmark.title || '(无标题)',
        url: bookmark.url || '',
        dateAdded: bookmark.dateAdded ? new Date(bookmark.dateAdded).toLocaleString('zh-CN') : null
      }));
      
      const resultText = `找到 ${results.length} 个匹配的书签，显示前 ${formattedResults.length} 个：\n` +
        formattedResults.map((b, i) => `${i+1}. ${b.title}\n   URL: ${b.url}`).join('\n\n');
      
      logger.debug('[Background] 书签搜索成功，返回结果:', formattedResults.length);
      resolve(makeResult(true, resultText));
    });
  });
}

/**
 * 执行历史记录搜索
 */
export function executeSearchHistory(args, toolCallId) {
  const query = args.query || '';
  const maxResults = parseInt(args.maxResults, 10) || 10;
  const startTime = args.startTime || null;
  const endTime = args.endTime || null;
  
  logger.debug('[Background] 执行历史记录搜索:', 'query=', JSON.stringify(query), 'maxResults=', maxResults, '时间范围:', startTime, '-', endTime);
  
  return new Promise((resolve) => {
    if (!chrome.history) {
      logger.error('[Background] chrome.history API 不可用');
      resolve(makeResult(false, '浏览器不支持历史 API'));
      return;
    }
    
    const searchOptions = {
      text: query,
      maxResults: maxResults
    };
    
    if (startTime) {
      searchOptions.startTime = startTime;
    }
    if (endTime) {
      searchOptions.endTime = endTime;
    }
    
    logger.debug('[Background] 调用 chrome.history.search, 选项:', JSON.stringify(searchOptions));
    chrome.history.search(searchOptions, (results) => {
      logger.debug('[Background] chrome.history.search 回调, 结果数量:', results ? results.length : 'null');
      
      if (chrome.runtime.lastError) {
        logger.error('[Background] chrome.history.search 错误:', chrome.runtime.lastError.message);
        resolve(makeResult(false, '搜索历史失败: ' + chrome.runtime.lastError.message));
        return;
      }
      
      if (!results || results.length === 0) {
        logger.debug('[Background] 未找到匹配的访问记录');
        resolve(makeResult(true, '未找到匹配的访问记录。提示：尝试使用具体关键词搜索'));
        return;
      }
      
      // 格式化结果
      const formattedResults = results.map(history => ({
        title: history.title || '(无标题)',
        url: history.url,
        lastVisitTime: history.lastVisitTime ? new Date(history.lastVisitTime).toLocaleString('zh-CN') : null,
        visitCount: history.visitCount || 0
      }));
      
      const resultText = `找到 ${results.length} 个匹配的访问记录：\n` +
        formattedResults.map((h, i) => `${i+1}. ${h.title}\n   URL: ${h.url}\n   最后访问: ${h.lastVisitTime}\n   访问次数: ${h.visitCount}`).join('\n\n');
      
      logger.debug('[Background] 历史记录搜索成功，返回结果:', formattedResults.length);
      resolve(makeResult(true, resultText));
    });
  });
}

/**
 * 执行对话记忆搜索
 * 搜索当前会话和/或历史会话中的对话记录
 */
async function executeSearchConversationMemory(args, toolCallId, sessionId = null) {
  const query = (args.query || '').toLowerCase();
  const maxResults = parseInt(args.maxResults, 10) || 5;
  const searchScope = args.searchScope || 'current_session';

  logger.debug('[Background] 执行对话记忆搜索:', 'query=', JSON.stringify(query), 'maxResults=', maxResults, 'scope=', searchScope, 'sessionId=', sessionId);

  try {
    // 确保从 chrome.storage 迁移完成
    await ensureMigration();

    // 收集所有可搜索的消息
    let allMessages = [];

    // 活跃会话消息：使用传入的 sessionId，避免多会话切换时读到错误会话
    let activeFilter = null;
    if (searchScope !== 'all_sessions') {
      activeFilter = sessionId || await getActiveSessionId();
    }
    const activeMessages = await searchActiveSessionsMessages(activeFilter);
    allMessages = activeMessages.map((m) => ({
      session: m.sessionLabel,
      index: m.index,
      role: m.role,
      content: m.content,
    }));

    // 归档会话消息（仅在 all_sessions 时）
    if (searchScope === 'all_sessions') {
      const archivedMessages = await getArchivedSessionsMessages();
      archivedMessages.forEach((m) => {
        allMessages.push({
          session: m.sessionLabel,
          index: m.index,
          role: m.role,
          content: m.content,
        });
      });
    }

    if (allMessages.length === 0) {
      return makeResult(true, '未找到任何对话记录。');
    }

    // 关键词匹配搜索（分词 + 包含匹配）
    const keywords = query.split(/\s+/).filter((k) => k.length > 0);
    const scoredMessages = allMessages.map((msg) => {
      const text = typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content) ? msg.content.filter(c => c.type === 'text').map(c => c.text).join('') : '');
      const contentLower = text.toLowerCase();
      let score = 0;

      // 精确匹配整句加分
      if (contentLower.includes(query)) {
        score += 10;
      }

      // 每个关键词匹配加分
      for (const kw of keywords) {
        if (contentLower.includes(kw)) {
          score += 3;
        }
        // 关键词出现次数加权
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const count = (contentLower.match(new RegExp(escaped, 'g')) || []).length;
        score += count * 0.5;
      }

      // 标题/引用标记等更相关
      if (contentLower.includes('[引用内容]') || contentLower.includes('[选中内容]')) {
        score += 1;
      }

      return { ...msg, score };
    });

    // 按分数排序，过滤零分
    const relevant = scoredMessages
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    if (relevant.length === 0) {
      return makeResult(true, `未找到与 "${args.query}" 相关的对话记录。请尝试使用其他关键词搜索。`);
    }

    // 格式化结果
    const resultText =
      `找到 ${relevant.length} 条相关对话记录：\n\n` +
      relevant
        .map((m, i) => {
          const text = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.filter(c => c.type === 'text').map(c => c.text).join('') : '');
          const contentPreview =
            text.length > 500 ? text.substring(0, 500) + '...' : text;
          return `### ${i + 1}. [${m.session}] ${m.role === 'user' ? '用户' : '助手'}消息 (相关度: ${m.score.toFixed(1)})\n${contentPreview}`;
        })
        .join('\n\n---\n\n');

    logger.debug('[Background] 对话记忆搜索成功，返回:', relevant.length, '条结果');
    return makeResult(true, resultText);
  } catch (err) {
    logger.error('[Background] 对话记忆搜索失败:', err);
    return makeResult(false, `搜索对话记录时出错: ${err.message}`);
  }
}


/**
 * 执行问题澄清工具
 * 通过 Side Panel 弹窗让用户选择或输入澄清信息
 * 注意：此工具需要用户交互，使用独立的澄清超时配置
 */
export async function executeClarifyQuestion(args, toolCallId, sessionId = null) {
  const { question, recommendedOption, allowCustomInput = true, allowAdditionalInfo = true } = args;
  
  // 确保 options 是数组，防止 LLM 返回非数组类型
  const options = Array.isArray(args.options) ? args.options : (args.options ? [String(args.options)] : []);
  
  logger.debug('[Background] 执行澄清工具:', args, 'toolCallId:', toolCallId, 'sessionId:', sessionId);
  
  // 获取配置以使用合适的超时时间
  const config = await getStoredConfig();
  const clarifyTimeout = config.reactConfig.clarifyTimeout;
  
  return new Promise((resolve) => {
    const clarifyData = {
      question,
      options: options,
      recommendedOption: recommendedOption !== undefined ? recommendedOption : 0,
      allowCustomInput,
      allowAdditionalInfo,
      toolCallId,
      timeout: clarifyTimeout,  // 传递超时时间给前端显示倒计时
      sessionId  // 携带 sessionId 让前端知道是哪个会话的澄清
    };
    
    let timeoutId = null;
    let clarifyResponseHandler = null;
    
    /**
     * 清理函数：确保监听器和计时器都被正确清理
     */
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (clarifyResponseHandler) {
        chrome.runtime.onMessage.removeListener(clarifyResponseHandler);
        clarifyResponseHandler = null;
      }
    };
    
    /**
     * 处理澄清响应
     */
    const handleResponse = (msg) => {
      if (msg.type === 'CLARIFY_RESPONSE' && msg.toolCallId === toolCallId) {
        cleanup();
        
        logger.debug('[Background] 收到澄清响应:', msg);
        
        const { selectedOption, customInput, additionalInfo } = msg;
        
        let result = '';
        if (selectedOption >= 0 && options[selectedOption]) {
          result = `已选择: ${options[selectedOption]}`;
        } else if (customInput && customInput.trim()) {
          result = `自定义输入: ${customInput.trim()}`;
        } else {
          result = '未提供澄清信息';
        }
        
        if (additionalInfo && additionalInfo.trim()) {
          result += `\n补充说明: ${additionalInfo.trim()}`;
        }
        
        resolve(makeResult(true, result));
      }
    };
    
    // 发送消息到 Side Panel 显示澄清弹窗
    chrome.runtime.sendMessage({
      type: 'SHOW_CLARIFY_DIALOG',
      sessionId,
      data: clarifyData
    }, (response) => {
      if (chrome.runtime.lastError) {
        logger.error('[Background] 发送澄清消息失败:', chrome.runtime.lastError.message);
        cleanup(); // 确保清理
        resolve({ 
          success: false, 
          error: '无法显示澄清对话框: ' + chrome.runtime.lastError.message,
          tool_call_id: toolCallId 
        });
        return;
      }
      
      logger.debug('[Background] 澄清对话框已发送到 Side Panel，超时:', clarifyTimeout, 'ms');
      
      // 设置超时处理（使用配置的澄清超时时间）
      timeoutId = setTimeout(() => {
        logger.error('[Background] 澄清对话框超时');
        cleanup(); // 确保清理
        
        // 通知前端倒计时结束
        chrome.runtime.sendMessage({
          type: 'CLARIFY_TIMEOUT',
          toolCallId: toolCallId,
          sessionId
        }).catch(() => {});
        
        resolve({ 
          success: false, 
          error: `用户未在规定时间内完成澄清 (${Math.round(clarifyTimeout/1000)}秒)`,
          tool_call_id: toolCallId 
        });
      }, clarifyTimeout);
      
      // 监听用户的澄清响应
      clarifyResponseHandler = (msg, sender, sendResponse) => {
        handleResponse(msg);
      };
      
      chrome.runtime.onMessage.addListener(clarifyResponseHandler);
    });
  });
}

/**
 * 执行浏览器通知工具
 * 使用 chrome.notifications API 显示桌面通知
 */
export function executeShowNotification(args, toolCallId) {
  const { 
    title, 
    message, 
    icon, 
    silent = false, 
    requireInteraction = false, 
    playSound = false, 
    soundType = 'default' 
  } = args;
  
  logger.debug('[Background] 执行浏览器通知:', args, 'toolCallId:', toolCallId);
  
  return new Promise((resolve) => {
    // 使用 chrome.notifications API 创建通知
    const notificationOptions = {
      type: 'basic',
      title: title,
      message: message,
      iconUrl: icon || 'icons/icon128.png',
      silent: silent === true || silent === 'true',
      requireInteraction: requireInteraction === true || requireInteraction === 'true'
    };
    
    chrome.notifications.create(notificationOptions, (notificationId) => {
      if (chrome.runtime.lastError) {
        logger.error('[Background] 创建通知失败:', chrome.runtime.lastError.message);
        resolve(makeResult(false, '通知创建失败: ' + chrome.runtime.lastError.message));
        return;
      }
      
      logger.debug('[Background] 通知已创建，ID:', notificationId);
      
      // 播放提示音 - 发送消息到 side_panel 播放
      if (playSound) {
        chrome.runtime.sendMessage({
          type: 'PLAY_NOTIFICATION_SOUND',
          soundType: soundType
        });
      }
      
      resolve(makeResult(true, '通知已发送'));
    });
  });
}

// fetchWithTimeout / fetchWithRetry / executeFetchUrl 已拆分到 tool-network.js

/**
 * 获取浏览器信息
 */
export function executeGetBrowserInfo(args, toolCallId) {
  logger.debug('[Background] 获取浏览器信息');
  
  const info = {
    success: true,
    browserName: navigator.appName,
    browserVersion: navigator.appVersion,
    platform: navigator.platform,
    language: navigator.language,
    userAgent: navigator.userAgent,
    cookieEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    prefersDarkMode: typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches,
    screenWidth: typeof screen !== 'undefined' ? screen.width : null,
    screenHeight: typeof screen !== 'undefined' ? screen.height : null,
    colorDepth: typeof screen !== 'undefined' ? screen.colorDepth : null
  };
  
  // 通过 chrome API 获取更多信息
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    info.extensionVersion = chrome.runtime.getManifest().version;
  }
  
  return Promise.resolve(info);
}

/**
 * 下载文件
 */
export function executeDownloadFile(args, toolCallId) {
  const { url, filename } = args;
  
  logger.debug('[Background] 下载文件:', 'url=', url, 'filename=', filename);
  
  return new Promise((resolve) => {
    // 提取文件名
    let downloadFilename = filename;
    if (!downloadFilename) {
      const urlParts = url.split('/');
      downloadFilename = urlParts[urlParts.length - 1].split('?')[0] || 'download';
    }
    
    chrome.downloads.download({
      url: url,
      filename: 'Downloads/' + downloadFilename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        logger.error('[Background] 下载失败:', chrome.runtime.lastError.message);
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        logger.debug('[Background] 下载已创建，ID:', downloadId);
        resolve({ 
          success: true, 
          message: `文件下载已开始`,
          downloadId: downloadId,
          filename: downloadFilename
        });
      }
    });
  });
}

/**
 * 打开新标签页
 */
export function executeOpenTab(args, toolCallId) {
  const { url, active: rawActive = true } = args;
  const active = typeof rawActive === 'boolean' ? rawActive : String(rawActive).toLowerCase() === 'true';
  
  logger.debug('[Background] 打开新标签页:', 'url=', url, 'active=', active);
  
  return new Promise((resolve) => {
    chrome.tabs.create({ url: url, active: active }, (tab) => {
      if (chrome.runtime.lastError) {
        logger.error('[Background] 打开标签页失败:', chrome.runtime.lastError.message);
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ 
          success: true, 
          message: `已打开新标签页`,
          tabId: tab.id,
          url: tab.url 
        });
      }
    });
  });
}

/**
 * 切换到指定标签页
 */
export function executeSwitchTab(args, toolCallId) {
  const { tabId: rawTabId } = args;
  const tabId = parseInt(rawTabId, 10);
  
  logger.debug('[Background] 切换标签页:', 'tabId=', tabId);
  
  return new Promise((resolve) => {
    chrome.tabs.update(tabId, { active: true }, (tab) => {
      if (chrome.runtime.lastError) {
        logger.error('[Background] 切换标签页失败:', chrome.runtime.lastError.message);
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ 
          success: true, 
          message: `已切换到标签页 ${tabId}`,
          tabId: tab.id,
          url: tab.url 
        });
      }
    });
  });
}

/**
 * 关闭指定标签页
 */
export function executeCloseTab(args, toolCallId) {
  const { tabId: rawTabId } = args;
  const tabId = rawTabId !== undefined ? parseInt(rawTabId, 10) : undefined;
  
  logger.debug('[Background] 关闭标签页:', 'tabId=', tabId);
  
  return new Promise((resolve) => {
    const targetTabId = tabId || null;
    
    if (targetTabId === null) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          chrome.tabs.remove(tabs[0].id, () => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve({ success: true, message: '已关闭当前标签页' });
            }
          });
        } else {
          resolve({ success: false, error: '未找到当前标签页' });
        }
      });
    } else {
      chrome.tabs.remove(tabId, () => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve({ success: true, message: `已关闭标签页 ${tabId}` });
        }
      });
    }
  });
}

/**
 * 获取当前窗口的所有标签页
 */
export function executeGetTabs(args, toolCallId) {
  const { includeUrl = true, includeTitle = true } = args;
  
  logger.debug('[Background] 获取标签页列表:', 'includeUrl=', includeUrl, 'includeTitle=', includeTitle);
  
  return new Promise((resolve) => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        logger.error('[Background] 获取标签页失败:', chrome.runtime.lastError.message);
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        const result = tabs.map(tab => {
          const item = { id: tab.id };
          if (includeUrl) item.url = tab.url;
          if (includeTitle) item.title = tab.title;
          item.active = tab.active;
          return item;
        });
        
        resolve({ 
          success: true, 
          count: result.length,
          tabs: result 
        });
      }
    });
  });
}

/**
 * Cookie管理工具
 */
export function executeManageCookies(args, toolCallId) {
  return new Promise((resolve) => {
    const { action, name, value, domain, path = '/', secure: rawSecure = false, httpOnly: rawHttpOnly = false, expirationDate: rawExpirationDate } = args;
    const secure = rawSecure === true || rawSecure === 'true';
    const httpOnly = rawHttpOnly === true || rawHttpOnly === 'true';
    const expirationDate = rawExpirationDate !== undefined ? parseFloat(rawExpirationDate) : undefined;
    
    const getCurrentDomain = (callback) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url) {
          try {
            const url = new URL(tabs[0].url);
            callback(url.hostname);
          } catch (e) {
            callback('');
          }
        } else {
          callback('');
        }
      });
    };
    
    getCurrentDomain((currentDomain) => {
      const cookieDomain = domain || currentDomain;
      
      switch (action) {
        case 'get':
          if (!name) {
            resolve({ success: false, error: 'get操作需要提供name参数', tool_call_id: toolCallId });
            return;
          }
          chrome.cookies.get({ url: `https://${cookieDomain}`, name }, (cookie) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
            } else {
              resolve({ success: true, cookie: cookie, tool_call_id: toolCallId });
            }
          });
          break;
          
        case 'set':
          if (!name || value === undefined) {
            resolve({ success: false, error: 'set操作需要提供name和value参数', tool_call_id: toolCallId });
            return;
          }
          const cookieData = {
            url: `https://${cookieDomain}`,
            name,
            value,
            path,
            secure,
            httpOnly,
            domain: cookieDomain.startsWith('.') ? cookieDomain : '.' + cookieDomain
          };
          if (expirationDate) {
            cookieData.expirationDate = expirationDate;
          }
          chrome.cookies.set(cookieData, (cookie) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
            } else {
              resolve({ success: true, cookie: cookie, message: `已设置Cookie: ${name}`, tool_call_id: toolCallId });
            }
          });
          break;
          
        case 'remove':
          if (!name) {
            resolve({ success: false, error: 'remove操作需要提供name参数', tool_call_id: toolCallId });
            return;
          }
          chrome.cookies.remove({ url: `https://${cookieDomain}`, name }, (details) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
            } else {
              resolve({ success: true, message: `已删除Cookie: ${name}`, tool_call_id: toolCallId });
              appendAuditLog('cookie_write', `删除 Cookie: ${name}`, { domain: cookieDomain, name });
            }
          });
          break;
          
        case 'list':
          chrome.cookies.getAll({ domain: cookieDomain }, (cookies) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
            } else {
              resolve({ success: true, cookies: cookies, total: cookies.length, tool_call_id: toolCallId });
            }
          });
          break;
          
        default:
          resolve({ success: false, error: `未知操作: ${action}`, tool_call_id: toolCallId });
      }
    });
  });
}

/**
 * 任务规划工具执行函数
 */
export function executePlanTask(args, toolCallId) {
  const { taskDescription, subtasks = [], isComplex = true, strategy = 'sequential' } = args;
  
  logger.debug('[Background] 执行任务规划工具:', JSON.stringify(args));
  
  // 验证必要参数
  if (!taskDescription) {
    return Promise.resolve({ 
      success: false, 
      error: '缺少任务描述参数',
      tool_call_id: toolCallId 
    });
  }
  
  if (!Array.isArray(subtasks) || subtasks.length === 0) {
    return Promise.resolve({ 
      success: false, 
      error: '子任务列表不能为空',
      tool_call_id: toolCallId 
    });
  }
  
  // 验证子任务结构
  const invalidSubtasks = subtasks.filter(st => !st.id || !st.name || !st.description);
  if (invalidSubtasks.length > 0) {
    return Promise.resolve({ 
      success: false, 
      error: `子任务结构不完整，缺少id/name/description`,
      tool_call_id: toolCallId 
    });
  }
  
  // 生成任务规划摘要
  const planSummary = {
    taskDescription: taskDescription,
    isComplex: isComplex,
    strategy: strategy,
    totalSubtasks: subtasks.length,
    estimatedTotalSteps: subtasks.reduce((sum, st) => sum + (st.estimatedSteps || 1), 0),
    subtasks: subtasks.map(st => ({
      id: st.id,
      name: st.name,
      description: st.description,
      dependencies: st.dependencies || [],
      requiredTools: st.requiredTools || [],
      estimatedSteps: st.estimatedSteps || 1
    })),
    planId: toolCallId || crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  
  // 格式化返回结果
  const formatResult = () => {
    let result = `📋 任务规划完成\n\n`;
    result += `**原始任务**: ${taskDescription}\n\n`;
    result += `**任务复杂度**: ${isComplex ? '复杂任务（已拆解）' : '简单任务'}\n`;
    result += `**执行策略**: ${strategy === 'sequential' ? '顺序执行' : strategy === 'parallel' ? '并行执行' : '条件执行'}\n`;
    result += `**子任务数量**: ${subtasks.length}\n\n`;
    result += `**子任务列表**:\n`;
    
    subtasks.forEach((st, index) => {
      result += `\n${index + 1}. **${st.name}**\n`;
      result += `   - ID: ${st.id}\n`;
      result += `   - 描述: ${st.description}\n`;
      if (st.dependencies && st.dependencies.length > 0) {
        result += `   - 依赖: ${st.dependencies.join(', ')}\n`;
      }
      if (st.requiredTools && st.requiredTools.length > 0) {
        result += `   - 所需工具: ${st.requiredTools.join(', ')}\n`;
      }
      result += `   - 预估步骤: ${st.estimatedSteps || 1}\n`;
    });
    
    return result;
  };
  
  return Promise.resolve({
    success: true,
    data: planSummary,
    message: formatResult(),
    tool_call_id: toolCallId
  });
}

/**
 * 清除页面数据（localStorage, sessionStorage, cookies, cache）
 */
export function executeClearPageData(args, toolCallId) {
  const { site } = args;

  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
        resolve({ success: false, error: '无法获取当前标签页', tool_call_id: toolCallId });
        return;
      }

      const tab = tabs[0];
      let origin;
      try {
        const url = new URL(tab.url);
        origin = url.origin;
      } catch (e) {
        resolve({ success: false, error: '无法解析当前标签页 URL', tool_call_id: toolCallId });
        return;
      }

      const targetSite = site || origin;
      const cleared = [];

      // 定义一个 Promise 链来处理所有清除操作
      const cleanupTasks = [];

      // 1. 清除 cookies
      cleanupTasks.push(new Promise((resolveTask) => {
        chrome.cookies.getAll({}, (cookies) => {
          if (chrome.runtime.lastError) {
            logger.warn('[Background] 获取 cookies 失败:', chrome.runtime.lastError.message);
            resolveTask();
            return;
          }
          const matchingCookies = cookies.filter(c => {
            const cookieDomain = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
            try {
              const targetHostname = new URL(targetSite).hostname;
              return targetHostname.endsWith(cookieDomain) || cookieDomain.endsWith(targetHostname);
            } catch (e) {
              return false;
            }
          });

          if (matchingCookies.length === 0) {
            resolveTask();
            return;
          }

          let removed = 0;
          matchingCookies.forEach((cookie) => {
            const protocol = cookie.secure ? 'https:' : 'http:';
            const cookieUrl = `${protocol}//${cookie.domain.replace(/^\./, '')}${cookie.path}`;
            chrome.cookies.remove({ url: cookieUrl, name: cookie.name }, () => {
              removed++;
              if (removed === matchingCookies.length) {
                cleared.push('cookies');
                resolveTask();
              }
            });
          });
        });
      }));

      // 2. 通过 content script 清除 localStorage 和 sessionStorage
      cleanupTasks.push(new Promise((resolveTask) => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'CLEAR_PAGE_DATA',
          storageTypes: ['localStorage', 'sessionStorage']
        }, (response) => {
          if (chrome.runtime.lastError) {
            logger.warn('[Background] 发送 CLEAR_PAGE_DATA 消息失败:', chrome.runtime.lastError.message);
            // 尝试注入 content script 后再试
            const manifest = chrome.runtime.getManifest();
            const contentJsFiles = manifest.content_scripts?.[0]?.js || [];
            const contentFile = contentJsFiles.find(f => f.includes('content-')) || contentJsFiles.find(f => /content/i.test(f)) || 'content.js';
            const contentUrl = chrome.runtime.getURL(contentFile);
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: (url) => {
                return new Promise((resolve) => {
                  if (document.getElementById('__aih_content_script__')) {
                    resolve(true);
                    return;
                  }
                  const script = document.createElement('script');
                  script.id = '__aih_content_script__';
                  script.src = url;
                  script.onload = () => resolve(true);
                  script.onerror = () => resolve(false);
                  document.head.appendChild(script);
                });
              },
              args: [contentUrl]
            }).then(() => {
              setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, {
                  type: 'CLEAR_PAGE_DATA',
                  storageTypes: ['localStorage', 'sessionStorage']
                }, (retryResponse) => {
                  if (chrome.runtime.lastError) {
                    resolveTask();
                  } else {
                    if (retryResponse?.cleared) {
                      cleared.push(...retryResponse.cleared);
                    }
                    resolveTask();
                  }
                });
              }, 500);
            }).catch(() => {
              resolveTask();
            });
          } else {
            if (response?.cleared) {
              cleared.push(...response.cleared);
            }
            resolveTask();
          }
        });
      }));

      // 3. 使用 chrome.browsingData.remove 清除 cache 和 cookies（作为补充）
      cleanupTasks.push(new Promise((resolveTask) => {
        if (!chrome.browsingData) {
          resolveTask();
          return;
        }
        const removalOptions = { origins: [targetSite] };
        chrome.browsingData.remove(removalOptions, {
          cache: true,
          cookies: true,
          localStorage: true
        }, () => {
          if (chrome.runtime.lastError) {
            logger.warn('[Background] browsingData.remove 失败:', chrome.runtime.lastError.message);
          } else {
            if (!cleared.includes('cookies')) cleared.push('cookies');
            if (!cleared.includes('localStorage')) cleared.push('localStorage');
            if (!cleared.includes('cache')) cleared.push('cache');
          }
          resolveTask();
        });
      }));

      Promise.allSettled(cleanupTasks).then(() => {
        const uniqueCleared = [...new Set(cleared)];
        appendAuditLog('page_data_clear', `清除页面数据: ${targetSite}`, { site: targetSite, cleared: uniqueCleared });
        resolve({
          success: true,
          cleared: uniqueCleared,
          site: targetSite,
          tool_call_id: toolCallId
        });
      });
    });
  });
}

/**
 * 导航前进/后退
 */
export function executeNavigateBackForward(args, toolCallId) {
  const { direction = 'back' } = args;

  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
        resolve({ success: false, error: '无法获取当前标签页', tool_call_id: toolCallId });
        return;
      }

      const tabId = tabs[0].id;

      if (direction === 'forward') {
        chrome.tabs.goForward(tabId, () => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
              direction,
              tool_call_id: toolCallId
            });
          } else {
            resolve({ success: true, direction, tool_call_id: toolCallId });
          }
        });
      } else {
        chrome.tabs.goBack(tabId, () => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
              direction,
              tool_call_id: toolCallId
            });
          } else {
            resolve({ success: true, direction, tool_call_id: toolCallId });
          }
        });
      }
    });
  });
}

/**
 * 重新加载标签页
 */
export function executeReloadTab(args, toolCallId) {
  const { tabId: rawTabId, bypassCache = false } = args;
  const tabId = rawTabId !== undefined ? parseInt(rawTabId, 10) : undefined;

  return new Promise((resolve) => {
    const doReload = (targetTabId) => {
      chrome.tabs.reload(targetTabId, { bypassCache: !!bypassCache }, () => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: chrome.runtime.lastError.message,
            tabId: targetTabId,
            bypassCache: !!bypassCache,
            tool_call_id: toolCallId
          });
        } else {
          resolve({
            success: true,
            tabId: targetTabId,
            bypassCache: !!bypassCache,
            tool_call_id: toolCallId
          });
        }
      });
    };

    if (tabId !== undefined) {
      doReload(tabId);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
          resolve({ success: false, error: '无法获取当前标签页', tool_call_id: toolCallId });
          return;
        }
        doReload(tabs[0].id);
      });
    }
  });
}

/**
 * 执行 UI 原型预览/获取工具
 * action=preview: 创建并预览原型（需要 html + title）
 * action=get: 根据 prototypeId 获取原型代码（需要 prototypeId）
 */
export async function executePreviewUiPrototype(args, toolCallId, sessionId = null) {
  const { action = 'preview', html, title, description, prototypeId } = args;
  
  // ── action=get：获取已创建的原型代码 ──
  if (action === 'get') {
    logger.debug('[Background] 执行获取 UI 原型:', 'prototypeId=', prototypeId);
    
    if (!prototypeId || !prototypeId.trim()) {
      return { success: false, error: '缺少 prototypeId 参数', tool_call_id: toolCallId };
    }
    
    try {
      const prototype = await getUiPrototype(prototypeId.trim());
      
      if (!prototype) {
        return { success: false, error: `未找到原型: ${prototypeId}`, tool_call_id: toolCallId };
      }
      
      logger.debug('[Background] 获取原型成功:', prototype.title, 'HTML长度:', prototype.html?.length);
      
      return { 
        success: true, 
        message: `已获取原型 "${prototype.title}" 的代码`,
        prototypeId: prototype.id,
        title: prototype.title,
        description: prototype.description || '',
        html: prototype.html,
        tool_call_id: toolCallId 
      };
    } catch (err) {
      logger.error('[Background] 获取 UI 原型失败:', err);
      return { success: false, error: '获取失败: ' + err.message, tool_call_id: toolCallId };
    }
  }
  
  // ── action=preview：创建并预览原型 ──
  logger.debug('[Background] 执行 UI 原型预览:', 'title=', title, 'sessionId=', sessionId);
  
  if (!html || !html.trim()) {
    return { success: false, error: '缺少 HTML 参数', tool_call_id: toolCallId };
  }
  
  if (!title || !title.trim()) {
    return { success: false, error: '缺少 title 参数', tool_call_id: toolCallId };
  }
  
  try {
    const newPrototypeId = 'proto_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const prototypeData = {
      id: newPrototypeId,
      title: title.trim(),
      description: description || '',
      html: html.trim(),
      sessionId: sessionId || null,
      createdAt: Date.now()
    };
    
    const saved = await saveUiPrototype(prototypeData);
    
    if (!saved) {
      return { success: false, error: '保存原型失败', tool_call_id: toolCallId };
    }
    
    logger.debug('[Background] UI 原型已保存，ID:', newPrototypeId);

    // ── 尝试通过 Agent 写入本地文件并使用本地浏览器打开 ──
    let localOpened = false;
    let localPath = null;

    try {
      const config = await AgentClient.getAgentConfig();
      if (config.connected) {
        const relativePath = `prototypes/${newPrototypeId}/index.html`;
        const writeResult = await AgentClient.writeFile(relativePath, html.trim());

        if (writeResult.success) {
          localPath = writeResult.path; // agent 返回的绝对路径
          logger.debug('[Background] 原型已写入本地:', localPath);

          // 更新 IndexedDB 记录，保存 localPath（包含完整数据，避免覆盖）
          await saveUiPrototype({ ...prototypeData, localPath });

          // 尝试在本地浏览器打开
          const openResult = await AgentClient.openBrowser(localPath);
          if (openResult.success) {
            localOpened = true;
            logger.debug('[Background] 原型已在本地浏览器打开:', localPath);
          } else {
            logger.warn('[Background] 本地浏览器打开失败:', openResult.error);
          }
        } else {
          logger.warn('[Background] Agent 本地文件写入失败:', writeResult.error);
        }
      }
    } catch (err) {
      // 写入或打开失败，不影响主流程，走兜底
      logger.warn('[Background] Agent 本地原型写入/打开失败，回退到 Side Panel:', err.message);
    }

    chrome.runtime.sendMessage({
      type: 'SHOW_UI_PROTOTYPE',
      data: {
        prototypeId: newPrototypeId,
        title: prototypeData.title,
        description: prototypeData.description,
        localOpened,   // 是否已在本地浏览器打开
        localPath,     // 本地文件路径
      }
    }).catch(() => {});
    
    return { 
      success: true, 
      message: localOpened ? `UI 原型 "${title}" 已创建并在本地浏览器打开` : `UI 原型 "${title}" 已创建并预览`,
      prototypeId: newPrototypeId,
      localOpened,
      localPath,
      tool_call_id: toolCallId 
    };
  } catch (err) {
    logger.error('[Background] 执行 UI 原型预览失败:', err);
    return { success: false, error: '执行失败: ' + err.message, tool_call_id: toolCallId };
  }
}

// ========== 本地 Agent 工具处理函数 ==========

/**
 * Skill 执行
 */
async function executeSkillRun(args, toolCallId) {
  const { name, params = {} } = args;
  if (!name) return { success: false, error: '缺少 name 参数', tool_call_id: toolCallId };

  try {
    const result = await AgentClient.runSkill(name, params);
    if (result.success) {
      return {
        success: true,
        content: result.message || `Skill "${name}" 执行完成`,
        execId: result.execId,
        partial: result.partial || false,
        results: result.results,
        tool_call_id: toolCallId
      };
    }
    return { success: false, error: result.error || 'Skill 执行失败', tool_call_id: toolCallId };
  } catch (err) {
    return { success: false, error: `Skill 执行异常: ${err.message}`, tool_call_id: toolCallId };
  }
}

/**
 * Agent Skill 按需加载
 */
// 单次会话中已加载的 Skill 缓存（避免重复网络请求）
const skillLoadCache = new Map(); // name → { timestamp, prompt, skill }

async function executeSkillLoad(args, toolCallId) {
  const { name } = args;
  if (!name) return { success: false, error: '缺少 name 参数', tool_call_id: toolCallId };

  // 检查缓存（60 秒内有效）
  const cached = skillLoadCache.get(name);
  if (cached && (Date.now() - cached.timestamp < 60000)) {
    return {
      success: true,
      content: `已加载 Agent Skill "${name}" 的完整说明：\n\n${cached.prompt}`,
      skill: cached.skill,
      tool_call_id: toolCallId
    };
  }

  try {
    const result = await AgentClient.getAgentSkillPrompt(name);
    if (result.success) {
      // 写入缓存
      skillLoadCache.set(name, { timestamp: Date.now(), prompt: result.prompt, skill: result.skill });
      return {
        success: true,
        content: `已加载 Agent Skill "${name}" 的完整说明：\n\n${result.prompt}`,
        skill: result.skill,
        tool_call_id: toolCallId
      };
    }
    return { success: false, error: result.error || 'Skill 加载失败', tool_call_id: toolCallId };
  } catch (err) {
    return { success: false, error: `Skill 加载异常: ${err.message}`, tool_call_id: toolCallId };
  }
}

/**
 * Agent 文件读取
 */
async function executeAgentReadFile(args, toolCallId) {
  const { path } = args;
  if (!path) return { success: false, error: '缺少 path 参数', tool_call_id: toolCallId };
  
  const result = await AgentClient.readFile(path);
  if (result.success) {
    return { success: true, content: result.content, size: result.size, path: result.path, tool_call_id: toolCallId };
  }
  return { success: false, error: result.error, tool_call_id: toolCallId };
}

// ========== P0/P1 新增工具 (2026-06-28) ==========

/**
 * 等待页面导航完成
 * 监听 tab 更新事件，等待页面加载到指定状态
 */
async function executeWaitForNavigation(args, toolCallId) {
  const { timeout = 30000, waitUntil = 'load' } = args;

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return { success: false, error: '无法获取当前标签页', tool_call_id: toolCallId };
    const tabId = tabs[0].id;

    logger.debug('[Background] 等待页面导航完成: tabId=', tabId, 'waitUntil=', waitUntil, 'timeout=', timeout);

    return new Promise((resolve) => {
      let resolved = false;
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(listener);
          logger.warn('[Background] 等待导航超时:', timeout + 'ms');
          resolve({ success: false, error: `等待导航超时 (${timeout}ms)`, tool_call_id: toolCallId });
        }
      }, timeout);

      // 立刻检查一次：如果当前 tab 已经是 complete 状态则立即返回
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          clearTimeout(timeoutId);
          if (!resolved) { resolved = true; resolve({ success: false, error: '标签页不可用', tool_call_id: toolCallId }); }
          return;
        }
        if (tab.status === 'complete' && waitUntil === 'load') {
          clearTimeout(timeoutId);
          if (!resolved) { resolved = true; resolve({ success: true, status: 'complete', url: tab.url, message: '页面已加载完成', tool_call_id: toolCallId }); }
          return;
        }
        if (tab.status === 'complete' && waitUntil === 'domcontentloaded') {
          clearTimeout(timeoutId);
          if (!resolved) { resolved = true; resolve({ success: true, status: 'complete', url: tab.url, message: '页面 DOM 已就绪', tool_call_id: toolCallId }); }
          return;
        }
      });

      const listener = (updatedTabId, changeInfo, tab) => {
        if (updatedTabId !== tabId) return;
        if (resolved) return;

        if (waitUntil === 'networkidle') {
          // networkIdle 策略：状态为 complete 后，再等 500ms 无新网络活动
          if (changeInfo.status === 'complete') {
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeoutId);
                chrome.tabs.onUpdated.removeListener(listener);
                resolve({ success: true, status: 'complete', url: tab.url, message: '网络空闲，页面加载完成', tool_call_id: toolCallId });
              }
            }, 500);
          }
        } else if (changeInfo.status === 'complete') {
          resolved = true;
          clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve({ success: true, status: 'complete', url: tab.url, message: '页面加载完成', tool_call_id: toolCallId });
        } else if (changeInfo.status === 'loading' && waitUntil === 'domcontentloaded') {
          // 对于 domcontentloaded，loading 状态已经意味着 DOM 开始解析
          // 但我们仍然等 complete（稳妥）
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  } catch (err) {
    return { success: false, error: '执行失败: ' + err.message, tool_call_id: toolCallId };
  }
}

/**
 * 全页截图
 * 通过 CDP 先获取页面真实尺寸，用 Emulation.setDeviceMetricsOverride 临时拉高视口后截图，
 * 避免 captureBeyondViewport 在 fixed/sticky 元素上的重复渲染 bug。
 * 失败时回退到 scroll-and-stitch 分段截图拼接方案。
 */

// Emulation 方案最大视口高度（Chrome GPU 纹理上限约 16384，取安全值）







/**
 * Agent 文件写入
 */
async function executeAgentWriteFile(args, toolCallId) {
  const { path, content } = args;
  if (!path) return { success: false, error: '缺少 path 参数', tool_call_id: toolCallId };
  if (content === undefined || content === null) return { success: false, error: '缺少 content 参数', tool_call_id: toolCallId };
  
  const result = await AgentClient.writeFile(path, content);
  if (result.success) {
    return { success: true, message: `文件已写入: ${result.path} (${result.size} 字节)`, path: result.path, size: result.size, tool_call_id: toolCallId };
  }
  return { success: false, error: result.error, tool_call_id: toolCallId };
}

/**
 * Agent 目录列表
 */
async function executeAgentListDir(args, toolCallId) {
  const { path } = args;
  
  const result = await AgentClient.listDir(path || '.');
  if (result.success) {
    const files = result.entries?.filter(e => e.type === 'file') || [];
    const dirs = result.entries?.filter(e => e.type === 'directory') || [];
    const text = `目录 "${result.path}" 包含 ${result.entries?.length || 0} 个项目:\n` +
      `  📁 ${dirs.length} 个目录\n` +
      `  📄 ${files.length} 个文件\n\n` +
      (result.entries || []).map(e => `  ${e.type === 'directory' ? '📁' : '📄'} ${e.name}${e.type === 'file' ? ` (${e.size} 字节)` : ''}`).join('\n');
    return { success: true, content: text, path: result.path, entries: result.entries, tool_call_id: toolCallId };
  }
  return { success: false, error: result.error, tool_call_id: toolCallId };
}

/**
 * Agent 文件删除
 */
async function executeAgentDeleteFile(args, toolCallId) {
  const { path } = args;
  if (!path) return { success: false, error: '缺少 path 参数', tool_call_id: toolCallId };
  
  const result = await AgentClient.deleteFile(path);
  if (result.success) {
    appendAuditLog('file_delete', `删除文件: ${result.path}`, { path: result.path });
    return { success: true, message: `已删除: ${result.path}`, path: result.path, tool_call_id: toolCallId };
  }
  return { success: false, error: result.error, tool_call_id: toolCallId };
}

/**
 * 请求用户确认敏感命令执行（Agent 端返回 level='confirm' 时调用）
 * 发送 SHOW_CONFIRM_DIALOG 到前端弹框，等待 TOOL_CONFIRMATION_RESPONSE 响应
 * @param {string} command - 要执行的命令
 * @param {string} reason - 需要确认的原因
 * @param {string} toolCallId - 工具调用 ID（用于匹配确认响应）
 * @param {string} [sessionId] - 会话 ID
 * @returns {Promise<boolean>} 用户是否确认
 */
async function requestCommandConfirmation(command, reason, toolCallId, sessionId) {
  const confirmTimeout = 300000; // 5分钟确认超时

  logger.debug(`[Background] 请求用户确认敏感命令: ${command}`, { reason });

  return new Promise((resolve) => {
    const handler = (message) => {
      if (message.type === 'TOOL_CONFIRMATION_RESPONSE' && message.toolCallId === toolCallId) {
        chrome.runtime.onMessage.removeListener(handler);
        clearTimeout(timeoutId);
        logger.debug(`[Background] 命令确认结果: ${command} = ${message.confirmed}`);
        resolve(message.confirmed);
      }
    };

    chrome.runtime.onMessage.addListener(handler);

    const timeoutId = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      logger.debug(`[Background] 命令确认超时，默认拒绝: ${command}`);
      resolve(false);
    }, confirmTimeout);

    chrome.runtime.sendMessage({
      type: 'SHOW_CONFIRM_DIALOG',
      data: {
        toolName: 'agent_exec_command',
        toolLabel: '命令执行',
        args: { command, reason },
        message: `⚠️ 敏感命令需要确认：${reason}`,
        toolCallId,
        sessionId,
        timeout: confirmTimeout
      }
    }).catch(err => {
      logger.debug('[Background] 发送命令确认对话框消息失败:', err.message);
      chrome.runtime.onMessage.removeListener(handler);
      clearTimeout(timeoutId);
      resolve(true); // 发送失败，直接放行
    });
  });
}

/**
 * Agent 命令执行
 * 处理黑名单拦截、灰名单确认、普通命令直接执行三种情况
 */
async function executeAgentExecCommand(args, toolCallId, sessionId) {
  const { command, cwd, force, timeout } = args;
  if (!command) return { success: false, error: '缺少 command 参数', tool_call_id: toolCallId };

  const config = await getStoredConfig();
  const effectiveForce = !!force || !config.reactConfig.toolConfirmationEnabled;
  const useAgentStream = config.streamConfig?.streamEnabled !== false;
  
  const effectiveTimeout = typeof timeout === 'number' && timeout > 0 
    ? timeout 
    : config.reactConfig.toolTimeout;
  const idleTimeoutMs = Math.max(120000, Math.min(effectiveTimeout * 0.8, 600000));

  if (useAgentStream) {
    let initResult = await AgentClient.execCommand(command, cwd, effectiveForce);

    if (initResult.level === 'deny') {
      return { success: false, error: initResult.error || '命令执行被拒绝', level: 'deny', tool_call_id: toolCallId };
    }
    if (!initResult.success && !initResult.level) {
      return { success: false, error: initResult.error || '命令执行失败', tool_call_id: toolCallId };
    }
    if (initResult.level === 'confirm') {
      // 敏感命令弹框确认（等待用户响应期间暂停前端超时，与 clarify 行为一致）
      chrome.runtime.sendMessage({
        type: 'TOOL_CONFIRM_START',
        ...(sessionId ? { sessionId } : {})
      }).catch(err => {
        logger.debug('[Background] 发送 TOOL_CONFIRM_START 消息失败:', err.message);
      });

      let confirmed;
      try {
        confirmed = await requestCommandConfirmation(command, initResult.reason, toolCallId, sessionId);
      } finally {
        chrome.runtime.sendMessage({
          type: 'TOOL_CONFIRM_END',
          ...(sessionId ? { sessionId } : {})
        }).catch(err => {
          logger.debug('[Background] 发送 TOOL_CONFIRM_END 消息失败:', err.message);
        });
      }

      if (!confirmed) {
        return {
          success: false,
          error: '用户拒绝了此命令的执行',
          command,
          tool_call_id: toolCallId
        };
      }

      // 用户确认，用 force=true 重新调用 Agent
      logger.debug(`[Background] 用户已确认敏感命令，用 force=true 重新执行: ${command}`);
      initResult = await AgentClient.execCommand(command, cwd, true);

      if (initResult.level === 'deny') {
        return { success: false, error: initResult.error || '命令执行被拒绝', level: 'deny', tool_call_id: toolCallId };
      }
      if (!initResult.success && !initResult.level) {
        return { success: false, error: initResult.error || '命令执行失败', tool_call_id: toolCallId };
      }
      if (initResult.level === 'confirm') {
        // force=true 时 Agent 端应跳过灰名单，不应再返回 confirm
        return { success: false, error: '命令仍需确认（不应发生）', tool_call_id: toolCallId };
      }
    }

    const { execId, wsUrl } = initResult;
    let stdoutCollected = '';
    let stderrCollected = '';
    let exitCode = null;
    let killed = false;
    let ws = null;
    let normalExit = false; // 标记是否正常收到 exit 消息
    let stopped = false; // 标记后台进程是否已被终止
    let idleTimeout = false; // 标记是否因空闲超时结束（挂起型命令，进程仍存活）

    const cleanupAndStop = async (reason) => {
      // 关闭 WebSocket
      if (ws) {
        try { ws.close(); } catch {}
      }
      // 非正常退出时，终止后台进程，防止孤儿进程持续运行
      if (!normalExit && execId) {
        stopped = true;
        try {
          await AgentClient.stopCommand(execId);
          logger.debug('[AgentExec] 已终止命令进程:', execId, reason ? `(原因: ${reason})` : '');
        } catch (stopErr) {
          logger.warn('[AgentExec] 终止命令进程失败:', stopErr.message);
        }
      }
    };

    try {
      ws = await AgentClient.createExecWebSocket(wsUrl, (data) => {
        if (data.type === 'stdout') {
          stdoutCollected += data.data;
          sendAgentStream(sessionId, execId, toolCallId, 'stdout', data.data);
        } else if (data.type === 'stderr') {
          stderrCollected += data.data;
          sendAgentStream(sessionId, execId, toolCallId, 'stderr', data.data);
        } else if (data.type === 'exit') {
          exitCode = data.exitCode;
          killed = data.killed;
          sendAgentStreamDone(sessionId, execId, toolCallId, exitCode);
        }
      }, () => {
        // WebSocket 正常关闭后的处理已由 Promise 的 onclose 统一管理
        // 此处不再重复处理，避免与 Promise 的 resolve/reject 冲突
      }, (err) => {
        logger.warn('[AgentExec] WebSocket 错误:', err);
      }, idleTimeoutMs);

      if (!ws) {
        throw new Error('创建 WebSocket 连接失败');
      }

      // 注册到 runningAgentCommands，以便取消时能关闭 WebSocket
      if (sessionId) {
        runningAgentCommands.set(sessionId, { execId, ws });
      }

      await new Promise((resolve, reject) => {
        const commandStartTime = Date.now();
        let totalTimeoutId = null;
        let lastOutputTime = Date.now();
        let timeoutExtensions = 0;
        const MAX_EXTENSIONS = 5; // 最多自动延长 5 次总超时

        /**
         * 调度下一次超时检查
         * 双超时机制：
         * 1. 空闲超时：无输出超过 idleTimeoutMs → 命令可能挂起，终止
         * 2. 总超时：总执行时间超过 effectiveTimeout → 如有输出则自动延长，否则终止
         */
        const scheduleTimeoutCheck = () => {
          if (totalTimeoutId) clearTimeout(totalTimeoutId);

          const now = Date.now();
          const elapsed = now - commandStartTime;
          const idleTime = now - lastOutputTime;
          const totalAllowed = effectiveTimeout * (1 + timeoutExtensions);

          // 空闲超时：长时间无输出
          if (idleTime >= idleTimeoutMs) {
            // 挂起型命令（如服务启动）：进程可能仍在运行，不杀进程
            // 关闭 WebSocket 但保留后台进程，返回已收集的输出
            idleTimeout = true;
            logger.warn('[AgentExec] 命令空闲超时（', Math.round(idleTime / 1000), 's 无输出），可能为挂起型服务，保留后台进程');
            if (ws) { try { ws.close(); } catch {} }
            if (totalTimeoutId) clearTimeout(totalTimeoutId);
            resolve();
            return;
          }

          // 总超时检查
          if (elapsed >= totalAllowed) {
            if (timeoutExtensions < MAX_EXTENSIONS) {
              // 命令仍在执行（最近有输出），自动延长总超时
              timeoutExtensions++;
              const newTotal = effectiveTimeout * (1 + timeoutExtensions);
              logger.debug(`[AgentExec] 命令仍在执行，自动延长超时 (第${timeoutExtensions}次，总计${Math.round(newTotal / 1000)}s)`);
              scheduleTimeoutCheck();
              return;
            } else {
              const errMsg = `命令执行总超时（${Math.round(totalAllowed / 1000)}s，已延长${MAX_EXTENSIONS}次）`;
              logger.warn('[AgentExec]', errMsg);
              cleanupAndStop(errMsg).then(() => {
                reject(new Error(errMsg));
              });
              return;
            }
          }

          // 正常调度：取空闲超时和剩余总超时中较小的值
          const remainingTotal = totalAllowed - elapsed;
          const nextCheck = Math.min(idleTimeoutMs, remainingTotal);
          totalTimeoutId = setTimeout(scheduleTimeoutCheck, nextCheck);
        };

        scheduleTimeoutCheck();

        const originalOnMessage = ws.onmessage;
        ws.onmessage = (event) => {
          originalOnMessage(event);
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'stdout' || data.type === 'stderr') {
              // 有输出，更新最后输出时间，重新调度超时检查
              lastOutputTime = Date.now();
              scheduleTimeoutCheck();
            } else if (data.type === 'exit') {
              normalExit = true;
              if (totalTimeoutId) clearTimeout(totalTimeoutId);
              resolve();
            }
          } catch {}
        };

        const originalOnClose = ws.onclose;
        ws.onclose = () => {
          if (totalTimeoutId) clearTimeout(totalTimeoutId);
          if (originalOnClose) originalOnClose();
          runningAgentCommands.delete(sessionId);
          // 空闲超时：进程保留，不杀进程，不 reject
          if (idleTimeout) {
            resolve();
            return;
          }
          // 非正常退出时终止后台进程，防止孤儿进程
          if (!normalExit) {
            exitCode = -1;
            sendAgentStreamDone(sessionId, execId, toolCallId, -1);
            cleanupAndStop('WebSocket 连接意外关闭').then(() => {
              reject(new Error('命令执行中断：WebSocket 连接意外关闭'));
            });
          } else {
            resolve();
          }
        };

        const originalOnError = ws.onerror;
        ws.onerror = (err) => {
          if (totalTimeoutId) clearTimeout(totalTimeoutId);
          if (originalOnError) originalOnError(err);
          runningAgentCommands.delete(sessionId);
          cleanupAndStop(err.message).then(() => {
            reject(err);
          });
        };
      });
    } catch (wsError) {
      logger.warn('[AgentExec] WebSocket 流式失败:', wsError.message);
      runningAgentCommands.delete(sessionId);
      if (wsError.message.includes('超时') || wsError.message.includes('中断') || stopped) {
        sendAgentStreamDone(sessionId, execId, toolCallId, -1);
        appendAuditLog('command_exec', `命令执行失败: ${command}`, { command, cwd, exitCode: -1, error: wsError.message });
        return {
          success: false,
          level: 'allow',
          execId,
          exitCode: -1,
          stdout: stdoutCollected,
          stderr: stderrCollected,
          killed: true,
          message: `命令执行失败：${wsError.message}\n\n已收集的输出:\n${stdoutCollected ? 'stdout:\n\`\`\`\n' + stdoutCollected + '\n\`\`\`' : ''}${stderrCollected ? '\nstderr:\n\`\`\`\n' + stderrCollected + '\n\`\`\`' : ''}`,
          error: wsError.message
        };
      }
      logger.warn('[AgentExec] 回退到同步模式:', wsError.message);
      const result = await AgentClient.execCommandWait(command, cwd, effectiveForce, effectiveTimeout);
      return formatAgentExecResult(result, command, cwd, toolCallId);
    }

    appendAuditLog('command_exec', `执行命令: ${command}`, { command, cwd, exitCode });
    
    // 空闲超时：挂起型命令（如服务启动），返回已收集的输出作为部分结果
    if (idleTimeout) {
      sendAgentStreamDone(sessionId, execId, toolCallId, 0);
      logger.debug('[AgentExec] 空闲超时，返回部分结果（命令可能仍在后台运行）');
      return {
        success: true,
        level: 'allow',
        execId,
        partial: true,
        stdout: stdoutCollected,
        stderr: stderrCollected,
        message: `命令仍在后台运行（已空闲超时，进程未终止）。\n\n执行期间输出:\n${stdoutCollected ? 'stdout:\n\`\`\`\n' + stdoutCollected + '\n\`\`\`' : '(无输出)'}${stderrCollected ? '\nstderr:\n\`\`\`\n' + stderrCollected + '\n\`\`\`' : ''}\n\n⚠️ 注意：此命令为挂起型进程（如服务/守护进程），进程仍在后台运行中。`,
        hint: '命令为挂起型进程，仍在后台运行',
        tool_call_id: toolCallId
      };
    }
    
    const hasExitCode = exitCode !== null && exitCode !== undefined;
    const isSuccess = hasExitCode && exitCode === 0;
    return {
      success: isSuccess,
      level: 'allow',
      execId,
      exitCode: hasExitCode ? exitCode : undefined,
      stdout: stdoutCollected,
      stderr: stderrCollected,
      killed,
      message: `命令执行完毕 ${hasExitCode ? '(exitCode: ' + exitCode + ')' : '(无 exitCode)'}\n\n${stdoutCollected ? '输出:\n```\n' + stdoutCollected + '\n```' : ''}${stderrCollected ? '\n[stderr]\n```\n' + stderrCollected + '\n```' : ''}${killed ? '\n⚠️ 命令因超时被强制终止' : ''}${!hasExitCode ? '\n⚠️ 代理未返回 exitCode' : ''}`,
      error: !isSuccess ? (hasExitCode ? `命令执行失败，exitCode: ${exitCode}` : '命令执行失败，代理未返回 exitCode') : undefined,
      tool_call_id: toolCallId
    };
  }

  const result = await AgentClient.execCommandWait(command, cwd, effectiveForce, effectiveTimeout);
  return formatAgentExecResult(result, command, cwd, toolCallId);
}

/**
 * 格式化 Agent 命令执行结果（非流式模式）
 */
function formatAgentExecResult(result, command, cwd, toolCallId) {
  // 黑名单拦截
  if (result.level === 'deny') {
    return { success: false, error: result.error || '命令执行被拒绝', level: 'deny', tool_call_id: toolCallId };
  }

  // 网络/认证错误
  if (!result.success && !result.level) {
    return { success: false, error: result.error || '命令执行失败', tool_call_id: toolCallId };
  }
  
  // 灰名单 - 需要确认
  if (result.level === 'confirm') {
    return {
      success: true,
      level: 'confirm',
      message: `⚠️ 命令需要用户确认：${result.reason}\n\n命令: \`${command}\`\n\n如果同意执行，请回复"确认"或"同意"，我会用 force: true 重新执行此命令。`,
      reason: result.reason,
      command,
      cwd,
      tool_call_id: toolCallId
    };
  }
  
  // 命令执行完毕，返回完整输出
  appendAuditLog('command_exec', `执行命令: ${command}`, { command, cwd, exitCode: result.exitCode });
  const hasExitCode = result.exitCode !== null && result.exitCode !== undefined;
  const isSuccess = hasExitCode && result.exitCode === 0;
  return {
    success: isSuccess,
    level: 'allow',
    execId: result.execId,
    exitCode: hasExitCode ? result.exitCode : undefined,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    killed: result.killed || false,
    message: `命令执行完毕 ${hasExitCode ? '(exitCode: ' + result.exitCode + ')' : '(无 exitCode)'}\n\n${result.stdout ? '输出:\n```\n' + result.stdout + '\n```' : ''}${result.stderr ? '\n[stderr]\n```\n' + result.stderr + '\n```' : ''}${result.killed ? '\n⚠️ 命令因超时被强制终止' : ''}${!hasExitCode ? '\n⚠️ 代理未返回 exitCode' : ''}`,
    error: !isSuccess ? (hasExitCode ? `命令执行失败，exitCode: ${result.exitCode}` : '命令执行失败，代理未返回 exitCode') : undefined,
    tool_call_id: toolCallId
  };
}

/**
 * Agent 文件名搜索
 */
async function executeAgentSearchFiles(args, toolCallId) {
  const { path, pattern, recursive, maxResults } = args;
  if (!path) return { success: false, error: '缺少 path 参数', tool_call_id: toolCallId };
  
  const result = await AgentClient.searchFiles(path, pattern || '*', recursive !== false, maxResults || 200);
  if (result.success) {
    const engineLabel = result.engine === 'fd' ? ' (引擎: fd)' : ' (引擎: Node.js)';
    return {
      success: true,
      results: result.results,
      total: result.total,
      engine: result.engine,
      message: `找到 ${result.total} 个文件${engineLabel}\n\n${result.results.slice(0, 50).map(r => `${r.path} (${r.size} bytes)`).join('\n')}${result.total > 50 ? '\n\n... (仅显示前 50 条)' : ''}`,
      tool_call_id: toolCallId
    };
  }
  return { success: false, error: result.error, tool_call_id: toolCallId };
}

/**
 * Agent 文件内容搜索
 */
async function executeAgentSearchContent(args, toolCallId) {
  const { path, pattern, filePattern, caseSensitive, maxResults, contextLines } = args;
  if (!path) return { success: false, error: '缺少 path 参数', tool_call_id: toolCallId };
  if (!pattern) return { success: false, error: '缺少 pattern 参数', tool_call_id: toolCallId };
  
  const result = await AgentClient.searchContent(
    path, pattern, filePattern || null,
    caseSensitive || false, maxResults || 100,
    contextLines !== undefined ? contextLines : 2
  );
  if (result.success) {
    const engineLabel = result.engine === 'rg' ? ' (引擎: ripgrep)' : ' (引擎: Node.js)';
    return {
      success: true,
      results: result.results,
      total: result.total,
      engine: result.engine,
      message: `找到 ${result.total} 条匹配${engineLabel}\n\n${result.results.slice(0, 30).map(r => `${r.file}:${r.line}\n${r.content}`).join('\n\n')}${result.total > 30 ? '\n\n... (仅显示前 30 条)' : ''}`,
      tool_call_id: toolCallId
    };
  }
  return { success: false, error: result.error, tool_call_id: toolCallId };
}

// 剪贴板工具（clipboard / get_page_content / extract_data）已拆分到 tool-clipboard.js

// 长期记忆工具（agent_memory_store / agent_memory_recall / agent_memory_manage）已拆分到 tool-memory.js

/**
 * 取消指定会话中正在运行的 Agent 命令
 * @param {string} sessionId - 会话 ID
 * @param {string} [mode='kill'] - 终止模式
 *   - 'kill': 关闭 WebSocket + 停止命令进程（默认）
 *   - 'wait': 仅关闭 WebSocket，进程继续运行
 */
export async function cancelRunningAgentCommands(sessionId, mode = 'kill') {
  const entry = runningAgentCommands.get(sessionId);
  if (!entry) return;
  
  runningAgentCommands.delete(sessionId);
  
  const { execId, ws } = entry;
  logger.debug('[Background] 取消运行中的 Agent 命令，execId:', execId, 'sessionId:', sessionId, 'mode:', mode);
  
  // 关闭 WebSocket 连接，阻止后续 AGENT_STREAM 消息发送
  try { ws.close(); } catch (e) { /* ignore */ }
  
  if (mode === 'kill') {
    // 通过 Agent API 停止命令进程
    try {
      await AgentClient.stopCommand(execId);
      logger.debug('[Background] 已停止 Agent 命令进程:', execId);
    } catch (err) {
      logger.warn('[Background] 停止 Agent 命令进程失败:', err.message);
    }
  } else {
    logger.debug('[Background] 仅断开 WebSocket，命令进程继续运行:', execId);
  }
}
