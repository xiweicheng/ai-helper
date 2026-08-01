// background/tool-executor.js - 工具定义与执行
import { BUILTIN_TOOLS, TOOL_EXECUTION_MAP, RAW_TOOLS, PARALLELIZABLE_TOOLS, CONFIRMATION_REQUIRED_TOOLS } from './constants.js';
import { getStoredConfig } from './config.js';
import { searchActiveSessionsMessages, getArchivedSessionsMessages, getActiveSessionId, ensureMigration, saveUiPrototype, getUiPrototype, getSession } from '../storage/db.js';
import * as AgentClient from './local-agent-client.js';
import { sendAgentStream, sendAgentStreamDone } from './stream-controller.js';
import { executeDispatchSubAgent } from './agent-dispatcher.js';
import { triggerScreenshotDownload } from './tool-screenshot.js';
import { autoCompleteJson, fixArrayObjectMismatch } from './tool-helpers.js';
import { readMemoryFile, executeAgentMemory } from './tool-memory.js';
import { logger } from '../shared/logger.js';

// 跟踪正在运行的 Agent 命令（sessionId → { execId, ws, resolve }）
// 用于在用户取消任务时关闭 WebSocket 连接，防止旧命令输出污染新任务
// resolve 存储 Promise 的 resolve 函数，以便取消时直接 resolve，不依赖 WebSocket 事件
const runningAgentCommands = new Map();

// 跟踪已取消的会话（sessionId 集合）
// 用于在 WebSocket 的 onclose/onerror handler 中判断是否用户主动终止
// 因为 onclose 和 onerror 可能会先后触发，先触发的会删除 runningAgentCommands 中的 entry
const cancelledSessions = new Set();

// ==================== MCP 工具动态注册 ====================

// 已动态注册的 MCP 工具 ID 集合（用于去重和清理）
const mcpToolIds = new Set();

// 互斥锁：防止 loadMcpTools / unloadMcpTools 并发执行
let mcpLoadLock = null;

// MCP schema 压缩配置
const MCP_DESC_MAX_LEN = 150;        // description 最大长度
const MCP_SCHEMA_MAX_DEPTH = 3;      // properties 嵌套最大深度
const MCP_SCHEMA_MAX_PARAMS = 20;    // 单个工具最大参数数量

/**
 * 压缩 description 文本（截断到最大长度）
 */
function compressDescription(desc, maxLen = MCP_DESC_MAX_LEN) {
  if (!desc || typeof desc !== 'string') return desc;
  if (desc.length <= maxLen) return desc;
  return desc.slice(0, maxLen - 3) + '...';
}

/**
 * 递归压缩 properties（限制嵌套深度，截断 description）
 */
function compressProperties(properties, depth = 0) {
  if (!properties || typeof properties !== 'object' || depth >= MCP_SCHEMA_MAX_DEPTH) {
    return properties;
  }
  const result = {};
  for (const [key, val] of Object.entries(properties)) {
    if (!val || typeof val !== 'object') {
      result[key] = val;
      continue;
    }
    const compressed = { ...val };
    // 移除冗余字段
    delete compressed.$schema;
    delete compressed.$ref;
    delete compressed.definitions;
    delete compressed.additionalProperties;
    // 截断 description
    if (compressed.description) {
      compressed.description = compressDescription(compressed.description);
    }
    // 递归处理嵌套 properties
    if (compressed.properties) {
      compressed.properties = compressProperties(compressed.properties, depth + 1);
    }
    // 处理 items（数组类型）
    if (compressed.items && typeof compressed.items === 'object') {
      if (compressed.items.properties) {
        compressed.items.properties = compressProperties(compressed.items.properties, depth + 1);
      }
      if (compressed.items.description) {
        compressed.items.description = compressDescription(compressed.items.description);
      }
    }
    result[key] = compressed;
  }
  return result;
}

/**
 * 压缩 MCP 工具的 inputSchema，防止撑爆上下文
 * - 移除 $schema/$ref/definitions/additionalProperties 等冗余字段
 * - 截断过长的 description
 * - 限制嵌套深度
 * - 限制参数数量（超出部分截断）
 */
function compressMcpSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
  const { $schema, $ref, definitions, additionalProperties, ...rest } = schema;
  if (!rest.type) rest.type = 'object';
  if (rest.description) rest.description = compressDescription(rest.description);
  if (rest.properties) {
    rest.properties = compressProperties(rest.properties, 0);
    const propKeys = Object.keys(rest.properties);
    if (propKeys.length > MCP_SCHEMA_MAX_PARAMS) {
      // 超出参数上限，截断并合并为 additionalParams
      const kept = propKeys.slice(0, MCP_SCHEMA_MAX_PARAMS);
      const truncated = propKeys.slice(MCP_SCHEMA_MAX_PARAMS);
      const newProps = {};
      kept.forEach(k => { newProps[k] = rest.properties[k]; });
      newProps.additionalParams = {
        type: 'object',
        description: `其他 ${truncated.length} 个参数已省略: ${truncated.join(', ').slice(0, 100)}`
      };
      rest.properties = newProps;
    }
  }
  return rest;
}

Promise.resolve();

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
          description: compressDescription(`[MCP:${tool.serverName}] ${tool.description || tool.name}`, 200),
          parameters: compressMcpSchema(tool.inputSchema)
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
    logger.warn('[Background] 加载 MCP 工具失败（Agent 可能不支持 MCP）:', err.message);
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
  } catch (e) { console.warn('[Background] 审计日志写入失败:', e); }
}

// Agent 连通性缓存（按 agentId 隔离，避免切换代理后命中旧缓存）
const agentConnectivityCacheMap = new Map(); // Map<agentId, { connected: boolean, checkedAt: number }>
const AGENT_CACHE_TTL = 30000; // 30 秒内复用缓存

export function clearAgentConnectivityCache(agentId) {
  if (agentId) {
    agentConnectivityCacheMap.delete(agentId);
  } else {
    agentConnectivityCacheMap.clear();
  }
}

/**
 * 检测 Agent 是否真正连通（storage 有凭据且服务可达）
 * 有缓存时直接返回，避免每次调用都发网络请求
 */
async function checkAgentConnectivity() {
  // 第一步：检查 storage 是否有已配对的活跃代理
  const result = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
  const agents = result.pairedAgents || [];
  const active = agents.find(a => a.id === result.activeAgentId);

  if (!active) {
    agentConnectivityCacheMap.clear();
    AgentClient.setAgentReachable('__global__', false);
    return false;
  }

  // 第二步：检查缓存（按 agentId 隔离）
  const now = Date.now();
  const cached = agentConnectivityCacheMap.get(active.id);
  if (cached && cached.connected !== null && (now - cached.checkedAt) < AGENT_CACHE_TTL) {
    return cached.connected;
  }

  // 第三步：有凭据，但需确认代理服务是否可达（5 秒超时，给远程代理充足时间）
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${active.url}/api/status`, {
      signal: controller.signal,
      cache: 'no-cache'
    });
    clearTimeout(timeoutId);
    const connected = response.ok;
    agentConnectivityCacheMap.set(active.id, { connected, checkedAt: now });
    AgentClient.setAgentReachable(active.id, connected);
    console.log('[Background] Agent 连通性检测:', connected ? '可达' : '不可达 (status=' + response.status + ')');
    return connected;
  } catch (err) {
    agentConnectivityCacheMap.set(active.id, { connected: false, checkedAt: now });
    AgentClient.setAgentReachable(active.id, false);
    console.log('[Background] Agent 连通性检测: 不可达 (' + (err.name === 'AbortError' ? '超时' : err.message) + ')');
    return false;
  }
}

/**
 * 获取启用的工具列表
 * 会自动隐藏不可用的工具（如 Agent 未连通时隐藏 agent_* 工具）
 * @param {string[]|null} agentToolIds - Agent 指定的工具 ID 列表，null = 使用全局 enabledTools
 * @param {string|null} agentId - Agent ID
 * @param {string[]|null} agentSkillIds - Agent 绑定的技能名称列表，非空时自动包含 skill 工具
 */
export async function getTools(agentToolIds = null, agentId = null, agentSkillIds = null) {
  return new Promise((resolve) => {
    const agentToolsKey = `agentEnabledTools_${agentId || 'default'}`;
    chrome.storage.local.get([agentToolsKey, 'enabledTools', 'enableImageInput', 'pairedAgents', 'enableToolPreselect'], async (result) => {
      // 优先读取 agent-specific key，降级到旧的全局 enabledTools
      let enabledTools = result[agentToolsKey] || result.enabledTools;
      
      // 如果没有保存的配置，使用默认值（全部启用）
      if (!enabledTools || !Array.isArray(enabledTools) || enabledTools.length === 0) {
        enabledTools = BUILTIN_TOOLS.map(t => t.id);
        console.log('[Background] 未找到工具配置，使用默认值（全部启用）');
      }

      // 旧工具名迁移：合并前的工具名映射到合并后的新工具名
      const TOOL_NAME_MIGRATION = {
        open_tab: 'manage_tab', switch_tab: 'manage_tab', close_tab: 'manage_tab',
        reload_tab: 'manage_tab', navigate_back_forward: 'manage_tab',
        search_bookmarks: 'search_browser_data', search_history: 'search_browser_data',
        agent_list_trash: 'agent_trash', agent_restore_trash: 'agent_trash',
        ai_agent_list: 'manage_agent', ai_agent_switch: 'manage_agent',
        manage_ai_agent: 'manage_agent',
        dispatch_sub_agent: 'dispatch_task',
        search_conversation_memory: 'search_chats',
        preview_ui_prototype: 'preview_ui',
        agent_read_file: 'agent_file', agent_write_file: 'agent_file', agent_list_dir: 'agent_file', agent_delete_file: 'agent_file', agent_download_file: 'agent_file',
        agent_search_files: 'agent_search', agent_search_content: 'agent_search',
        agent_skill_load: 'agent_skill', agent_workflow_run: 'agent_skill',
        click_element: 'interact_element', hover_element: 'interact_element',
        // 方案C工具名简化迁移
        agent_exec_command: 'agent_exec',
        get_page_content: 'page_content', get_iframe_content: 'iframe_content',
        get_browser_info: 'browser_info', get_tabs: 'list_tabs',
        wait_for_element: 'wait_element', wait_for_navigation: 'wait_navigation',
        query_interactive_elements: 'query_elements', find_similar_elements: 'find_similar',
        scroll_and_collect: 'scroll_collect', drag_and_drop: 'drag_drop',
        show_notification: 'notify', generate_qrcode: 'qrcode',
        clear_page_data: 'clear_data', search_chat_history: 'search_chats',
        ui_prototype: 'preview_ui',
      };
      let migrated = false;
      enabledTools = enabledTools.map(id => {
        if (TOOL_NAME_MIGRATION[id]) { migrated = true; return TOOL_NAME_MIGRATION[id]; }
        return id;
      });
      // 去重（多个旧工具映射到同一新工具）
      enabledTools = [...new Set(enabledTools)];
      if (migrated) console.log('[Background] 检测到旧工具名，已迁移到合并后的新工具名');

      // 如果 Agent 指定了工具列表，与全局启用列表取交集
      const finalToolIds = agentToolIds ? enabledTools.filter(id => agentToolIds.includes(id)) : enabledTools;
      if (agentToolIds) {
        console.log(`[Background] 工具过滤: ${enabledTools.length} 全局 → ${finalToolIds.length} 最终`);
      }

      // 如果 Agent 绑定了技能，自动加入技能工具（agent_skill）
      const hasSkillIds = agentSkillIds != null && Array.isArray(agentSkillIds) && agentSkillIds.length > 0;
      if (hasSkillIds) {
        if (!finalToolIds.includes('agent_skill')) {
          finalToolIds.push('agent_skill');
          console.log('[Background] 自动加入技能工具: agent_skill');
        }
      }

      // 读取图片识别开关状态
      const visionEnabled = result.enableImageInput === true;

      // 读取子任务工具筛选（复用 enableToolPreselect 开关）
      const enableToolPreselect = result.enableToolPreselect === true;
      console.log('[Background] getTools - enableToolPreselect:', enableToolPreselect);
      
      // 检测 Agent 是否真正连通（不仅检查凭据，还要确认服务可达）
      const agentConnected = await checkAgentConnectivity();
      
      // 配对代理数量：小于 2 个时，隐藏代理管理工具（无需切换/查询）
      const pairedCount = (result.pairedAgents || []).length;
      
      console.log(`[Background] 工具配置: ${finalToolIds.length} 个启用, Agent=${agentConnected}, 图片识别=${visionEnabled}`);
      
      // 读取 MCP 全局开关和 Agent 连接状态
      const { mcpEnabled, skillsEnabled } = await chrome.storage.local.get(['mcpEnabled', 'skillsEnabled']);

      const tools = BUILTIN_TOOLS
        .filter(tool => finalToolIds.includes(tool.id))
        .filter(tool => {
          // Agent 未连通时，隐藏所有 agent_* 工具
          if (tool.id.startsWith('agent_') && !agentConnected) return false;
          // 配对代理不足 2 个时，隐藏代理管理工具
          if (tool.id === 'manage_agent' && pairedCount < 2) return false;
          // Skill 全局开关关闭时，过滤掉 Skill 工具
          if (tool.id === 'agent_skill' && skillsEnabled === false) return false;
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
              // 关闭图片识别时，仅保留 download 模式
              actionProp.enum = ['download'];
              actionProp.description = '操作模式：download=下载截图';
              actionProp.default = 'download';
              cloned.function.description = '页面截图并下载到本地';
            }
          }

          // plan_task 工具：工具预筛选开关开启 且 工具数超过阈值时，动态添加 requiredTools 参数
          if (tool.id === 'plan_task') {
            const preselectMinToolCount = result.preselectMinToolCount || 10;
            const shouldAddRequiredTools = enableToolPreselect && finalToolIds.length > preselectMinToolCount;
            console.log('[Background] getTools - 处理 plan_task, enableToolPreselect:', enableToolPreselect, 'toolCount:', finalToolIds.length, 'threshold:', preselectMinToolCount, 'shouldAdd:', shouldAddRequiredTools);
            if (shouldAddRequiredTools) {
              // 1. 修改 plan_task 描述，强引导大模型填写 requiredTools
              cloned.function.description = '任务规划与拆解，将复杂任务分解为子任务。重要：必须为每个子任务的 requiredTools 字段指定所需工具ID列表，子任务仅继承此处指定的工具。';

              // 2. 添加 requiredTools 参数，并在描述中列出可用工具ID帮助选择
              const subtaskItemProps = cloned.function.parameters.properties.subtasks.items.properties;
              subtaskItemProps.requiredTools = {
                type: 'array',
                items: { type: 'string' },
                description: `该子任务所需的工具ID列表（必填）。可用工具: ${finalToolIds.join(', ')}。根据子任务描述选择所需工具，填 [] 表示继承全部工具。`
              };

              // 3. 将 requiredTools 加入 required 数组，强制大模型必须填写
              const requiredArr = cloned.function.parameters.properties.subtasks.items.required;
              if (!requiredArr.includes('requiredTools')) {
                requiredArr.push('requiredTools');
              }

              console.log('[Background] getTools - 已添加 requiredTools 到 plan_task (required)');
            }
          }

          return cloned;
        });
      
      console.log(`[Background] 最终可用工具: ${tools.length} 个`);
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
    console.log('[Background] Skill 全局开关变更:', changes.skillsEnabled.newValue !== false);
  }
});

/**
 * 执行页面截图工具
 * 支持三种模式：download（下载）、analyze（视觉分析）、both（下载+分析）
 * action 参数的可用选项会根据 enableImageInput 开关动态变化
 */
export async function executeCapturePage(args, toolCallId, sessionId = null) {
  const {
    action = 'both',
    tabId,
    format = 'jpeg',
    quality = 60,
    visionMaxDim = 1024,
    visionQuality = 65
  } = args;

  try {
    let targetTabId;
    let targetWindowId;
    let targetUrl = '';
    let targetTitle = '';

    if (tabId) {
      try {
        const tab = await chrome.tabs.get(tabId);
        targetTabId = tab.id;
        targetWindowId = tab.windowId;
        targetUrl = tab.url || '';
        targetTitle = tab.title || '';
        await chrome.tabs.update(targetTabId, { active: true });
        await new Promise(r => setTimeout(r, 300));
      } catch {
        return makeResult(false, `标签页 ${tabId} 不存在或无法访问`, { tool_call_id: toolCallId });
      }
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs.length) {
        return makeResult(false, '无法获取当前标签页', { tool_call_id: toolCallId });
      }
      targetTabId = tabs[0].id;
      targetWindowId = tabs[0].windowId;
      targetUrl = tabs[0].url || '';
      targetTitle = tabs[0].title || '';
    }

    console.log('[Background] 执行截图: tabId=', targetTabId, 'url=', targetUrl, 'action=', action,
      'format=', format, 'quality=', quality, 'visionMaxDim=', visionMaxDim, 'visionQuality=', visionQuality);

    const dataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(
        targetWindowId,
        { format, quality },
        (capturedDataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(capturedDataUrl);
          }
        }
      );
    });

    const sizeKB = (dataUrl.length / 1024).toFixed(1);
    console.log('[Background] 截图完成，大小:', sizeKB, 'KB');

    // 存储截图供 side_panel 展示
    chrome.storage.local.set({ _lastVisionScreenshot: { dataUrl, sizeKB, url: targetUrl, title: targetTitle, timestamp: Date.now() } }).catch(() => {});

    // 根据 action 执行不同操作
    const needDownload = (action === 'download' || action === 'both');
    const needAnalyze = (action === 'analyze' || action === 'both');

    if (needDownload) {
      triggerScreenshotDownload(dataUrl, format);
    }

    if (needAnalyze) {
      // 使用大模型指定的参数压缩截图
      const compressedDataUrl = await compressImageForVision(dataUrl, visionMaxDim, visionQuality / 100);
      const compressedKB = (compressedDataUrl.length / 1024).toFixed(1);
      console.log('[Background] 截图压缩后大小:', compressedKB, 'KB (maxDim:', visionMaxDim, 'quality:', visionQuality, ')');

      // 调用图片识别 API 对压缩后的截图进行视觉分析
      const visionResult = await analyzeScreenshotWithVision(compressedDataUrl, targetUrl, targetTitle, sessionId);

      if (needDownload) {
        // both 模式：下载 + 分析
        return makeResult(true, `截图已下载到本地（${sizeKB} KB）。\n\n${visionResult}`, { tool_call_id: toolCallId });
      }
      return makeResult(true, visionResult, { tool_call_id: toolCallId });
    }

    // 纯 download 模式
    const imageSizeMB = (dataUrl.length / 1024 / 1024).toFixed(2);
    const fmt = format === 'png' ? 'png' : 'jpg';
    return makeResult(true, `截图成功！\n图片大小约 ${imageSizeMB} MB\n格式: ${fmt}\n质量: ${quality}\n截图已自动下载到浏览器默认下载目录`, { tool_call_id: toolCallId });
  } catch (err) {
    return makeResult(false, `截图失败: ${err.message}`, { tool_call_id: toolCallId });
  }
}

/**
 * 使用 OffscreenCanvas 压缩截图图片
 * @param {string} dataUrl - 原始截图 data URL
 * @param {number} maxDim - 最大长边像素（大模型可动态指定）
 * @param {number} jpegQuality - JPEG 质量 0-1（大模型可动态指定）
 */
async function compressImageForVision(dataUrl, maxDim = 1024, jpegQuality = 0.65) {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    let { width, height } = bitmap;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round(height * (maxDim / width));
        width = maxDim;
      } else {
        width = Math.round(width * (maxDim / height));
        height = maxDim;
      }
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const compressedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(compressedBlob);
    });
  } catch (err) {
    console.warn('[Background] 图片压缩失败，使用原始截图:', err.message);
    return dataUrl;
  }
}

/**
 * 调用图片识别 API 对截图进行视觉分析
 * 返回文本描述结果
 */
async function analyzeScreenshotWithVision(dataUrl, pageUrl, pageTitle, sessionId = null) {
  // 读取图片识别配置（独立 API 端点、Key、模型）+ 流式开关
  const visionConfig = await new Promise((resolve) => {
    chrome.storage.local.get(['imageApiBase', 'imageApiKey', 'imageModelName', 'apiBase', 'apiKey', 'modelName', 'streamEnabled'], resolve);
  });

  const apiBase = visionConfig.imageApiBase || visionConfig.apiBase;
  const apiKey = visionConfig.imageApiKey || visionConfig.apiKey;
  const model = visionConfig.imageModelName || visionConfig.modelName;
  const useStream = visionConfig.streamEnabled !== false; // 默认 true

  if (!apiBase || !apiKey) {
    console.log('[Background] 图片识别 API 未配置，返回截图基本信息');
    return `页面截图已获取。\n\n- 页面标题: ${pageTitle}\n- 页面地址: ${pageUrl}\n\n请根据页面 URL 和标题信息进行分析。如需启用图片识别分析，请在设置页面配置图片识别 API。`;
  }

  console.log('[Background] 调用图片识别 API 分析截图，模型:', model, '端点:', apiBase, '流式:', useStream);

  const visionPrompt = `请详细描述这张网页截图的内容，包括：
1. 页面整体布局和主要区块
2. 可见的文本内容（标题、段落、按钮文字等）
3. UI 元素（导航栏、按钮、输入框、表格、图片等）
4. 页面的视觉状态和风格
5. 如有明显错误、异常或问题，请指出

截图来源: ${pageTitle} (${pageUrl})`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const fetchBody = {
      model: model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: visionPrompt },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } }
        ]
      }],
      max_tokens: 2000
    };

    // 根据流式开关决定是否启用 stream
    if (useStream) {
      fetchBody.stream = true;
    }

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(fetchBody),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[Background] 图片识别 API 请求失败:', response.status, errorText);
      return `页面截图已获取。\n\n- 页面标题: ${pageTitle}\n- 页面地址: ${pageUrl}\n\n图片识别分析失败（API 返回 ${response.status}），请检查图片识别 API 配置。`;
    }

    let analysis;

    if (useStream) {
      // 流式模式：SSE 逐块读取，实时推送到 side panel
      analysis = await readVisionSSEStream(response, controller, sessionId);
    } else {
      // 非流式模式：JSON 一次性返回
      const data = await response.json();
      analysis = data.choices?.[0]?.message?.content;
    }

    if (!analysis) {
      console.error('[Background] 图片识别 API 结果为空');
      return `页面截图已获取。\n\n- 页面标题: ${pageTitle}\n- 页面地址: ${pageUrl}\n\n图片识别返回结果为空，请重试。`;
    }

    console.log('[Background] 图片识别分析完成，结果长度:', analysis.length);
    return `页面截图分析结果：\n\n**页面**: ${pageTitle}\n**地址**: ${pageUrl}\n\n${analysis}`;

  } catch (err) {
    clearTimeout(timeout);
    console.error('[Background] 图片识别 API 调用异常:', err.message);
    if (err.name === 'AbortError') {
      return `页面截图已获取。\n\n- 页面标题: ${pageTitle}\n- 页面地址: ${pageUrl}\n\n图片识别分析超时（60秒），请检查图片识别 API 是否可用或尝试重新截图。`;
    }
    return `页面截图已获取。\n\n- 页面标题: ${pageTitle}\n- 页面地址: ${pageUrl}\n\n图片识别分析失败: ${err.message}`;
  }
}

/**
 * 流式读取视觉 API 的 SSE 响应，逐块推送到 side panel 实时展示，完成后返回完整文本
 */
async function readVisionSSEStream(response, abortController, sessionId = null) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  try {
    while (true) {
      let readResult;
      if (abortController && abortController.signal) {
        readResult = await Promise.race([
          reader.read(),
          new Promise((_, reject) => {
            if (abortController.signal.aborted) {
              reject(new DOMException('Aborted', 'AbortError'));
              return;
            }
            const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
            abortController.signal.addEventListener('abort', onAbort, { once: true });
          })
        ]);
      } else {
        readResult = await reader.read();
      }

      const { done, value } = readResult;
      if (done) break;

      buffer += decoder.decode(value, { stream: false });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        let data = '';
        if (line.startsWith('data:')) {
          data = line.substring(5).replace(/^\s+/, '');
        }
        
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          // 兼容多种 SSE 格式：delta.content / message.content / text
          let delta = parsed.choices?.[0]?.delta?.content
            || parsed.choices?.[0]?.message?.content
            || parsed.choices?.[0]?.text
            || '';
          if (delta) {
            fullContent += delta;

            // 实时推送到 side panel 展示
            if (sessionId) {
              chrome.runtime.sendMessage({
                type: 'VISION_ANALYSIS_CHUNK',
                sessionId,
                delta
              }).catch(() => {});
            }
          }
        } catch (err) {
          // 解析失败时记录原始数据，方便排查不同模型的格式差异
          console.warn('[Background] 图片识别 SSE 解析失败，原始数据:', data.substring(0, 200), '错误:', err.message);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

/**
 * 两阶段解析工具参数：
 * 1. 先尝试标准 JSON.parse
 * 2. 失败后尝试修复常见问题：尾随逗号、未加引号的字符串值、嵌套对象
 * 返回 null 表示所有解析尝试均失败
 */
function tryParseToolArgs(argsStr) {
  if (!argsStr) return null;
  
  // 如果已经是对象，直接返回
  if (typeof argsStr === 'object') {
    return argsStr;
  }
  
  if (typeof argsStr !== 'string') return null;
  
  const trimmed = argsStr.trim();
  if (!trimmed) return null;
  
  // 阶段 1: 标准 JSON 解析
  try {
    return JSON.parse(trimmed);
  } catch {
    console.warn('[Background] 工具参数直接解析失败，尝试修复...');
  }
  
  // 阶段 2: 修复常见问题后重试
  let fixed = trimmed;
  
  // 2a. 移除尾随逗号（对象和数组）
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');
  
  // 2b. 修复未加引号的字符串值
  // 匹配模式: "key": value 其中 value 是未加引号的中文/英文/数字组合
  // 支持包含空格、特殊字符的值，直到遇到 , 或 } 或换行符
  fixed = fixed.replace(/"([^"]+)":\s*([^",\{\}\[\]]+?)(\s*[,}\]])/g, (match, key, value, delimiter) => {
    const trimmedValue = value.trim();
    // 跳过已经是数字、布尔值、null 的值
    if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(trimmedValue)) {
      return match;
    }
    // 转义值内部的双引号
    const escapedValue = trimmedValue.replace(/"/g, '\\"');
    return `"${key}": "${escapedValue}"${delimiter}`;
  });
  
  // 2c. 递归修复嵌套对象中的未加引号字符串值
  // 使用深度优先策略：从内层向外层修复
  let prevFixed;
  do {
    prevFixed = fixed;
    fixed = fixed.replace(/"([^"]+)":\s*([^",\{\}\[\]]+?)(\s*[,}\]])/g, (match, key, value, delimiter) => {
      const trimmedValue = value.trim();
      if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(trimmedValue)) {
        return match;
      }
      // 转义值内部的双引号
      const escapedValue = trimmedValue.replace(/"/g, '\\"');
      return `"${key}": "${escapedValue}"${delimiter}`;
    });
  } while (fixed !== prevFixed);
  
  // 2d. 修复已加引号但内部双引号未转义的情况
  // 匹配模式: "key": "value" 其中 value 内部包含未转义的双引号
  fixed = fixed.replace(/"([^"]+)":\s*"([^"]*)(")([^"]*)"/g, (match, key, part1, unescapedQuote, part2) => {
    return `"${key}": "${part1}\\"${part2}"`;
  });
  
  // 2e. 自动补全缺失的闭合引号和括号（处理 LLM 截断输出）
  fixed = autoCompleteJson(fixed);
  
  // 2f. 清除数组中混入的对象键值对（LLM 有时把 "key": value 错误放进数组）
  fixed = fixArrayObjectMismatch(fixed);
  
  // 阶段 2 最终尝试
  try {
    const result = JSON.parse(fixed);
    console.log('[Background] 工具参数修复解析成功:', result);
    return result;
  } catch (e) {
    console.error('[Background] 工具参数修复解析也失败:', e, '修复后字符串:', fixed.substring(0, 200));
    return null;
  }
}

/**
 * 创建统一格式的工具返回结果
 * @param {boolean} success - 是否成功
 * @param {string} content - 给大模型读的内容（必须）
 * @param {Object} [extra] - 额外的元数据字段
 * @returns {{ success: boolean, content: string, tool_call_id?: string }}
 */
function makeResult(success, content, extra = {}) {
  return { success, content, ...extra };
}

/**
 * 格式化文件大小为可读字符串
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * 安全网：统一工具结果格式为 { success, content, error?, ... }
 * 所有 handler 都应该使用 makeResult() 返回，此函数仅处理异常情况
 */
function normalizeToolResult(result, toolCallId) {
  if (result && typeof result === 'object' && 'success' in result) {
    // 标准对象格式：补充缺失的 content 和 tool_call_id
    if (!('content' in result)) {
      if (result.message) {
        result.content = result.message;
      } else if (!result.success && result.error) {
        const escapedError = String(result.error).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        result.content = `操作失败: ${escapedError}`;
        result.message = result.error;
      } else {
        const { success, error, tool_call_id, ...rest } = result;
        result.content = JSON.stringify(rest);
        result.metadata = rest;
      }
      console.warn('[Background] 工具返回格式不标准（缺少 content 字段），已自动补充');
    }
    if (!result.tool_call_id) result.tool_call_id = toolCallId;
    return result;
  }
  if (typeof result === 'string') {
    console.warn('[Background] 工具返回了纯字符串而非标准对象，请改用 makeResult()');
    return { success: true, content: result, tool_call_id: toolCallId };
  }
  return { success: false, error: '未知结果格式', content: '', tool_call_id: toolCallId };
}

/**
 * 记录工具使用统计到 chrome.storage.local
 */
async function recordToolStats(toolName, result, duration) {
  try {
    const toolStatsKey = 'toolUsageStats';
    const stats = await chrome.storage.local.get([toolStatsKey]);
    const toolStats = stats[toolStatsKey] || {};
    const entry = toolStats[toolName] || { callCount: 0, successCount: 0, totalDuration: 0, lastUsed: 0 };
    entry.callCount++;
    if (result.success) entry.successCount++;
    entry.totalDuration += duration;
    entry.lastUsed = Date.now();
    toolStats[toolName] = entry;
    chrome.storage.local.set({ [toolStatsKey]: toolStats });
  } catch (e) {
    console.warn('[Background] 记录工具统计失败:', e);
  }
}

/**
 * 获取当前活跃标签页 ID
 */
function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs.length > 0 ? tabs[0].id : null);
    });
  });
}

/**
 * 向 Content Script 发送消息，失败时自动注入并重试
 * @param {number} tabId - 目标标签页 ID
 * @param {Object} message - 要发送的消息（需包含 type 字段）
 * @param {string} toolCallId - 工具调用 ID
 * @returns {Promise<Object>} 带有 tool_call_id 的结果对象
 */
async function sendToContentScriptWithRetry(tabId, message, toolCallId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        console.warn('[Background] 发送消息到 content script 失败:', errorMsg);

        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            resolve({ success: false, error: '无法访问该标签页: ' + errorMsg, tool_call_id: toolCallId });
            return;
          }

          const url = tab.url || '';
          if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.startsWith('chrome-error://')) {
            if (url.startsWith('chrome-error://')) {
              resolve({ success: false, error: '该标签页显示错误页面，页面未能成功加载。请检查 URL 是否正确、网络是否可达', tool_call_id: toolCallId });
            } else {
              resolve({ success: false, error: '无法在系统页面使用工具: ' + url, tool_call_id: toolCallId });
            }
            return;
          }

          console.log('[Background] 尝试自动注入 content script 到 Tab:', tabId);
          const manifest = chrome.runtime.getManifest();
          const contentJsFiles = manifest.content_scripts?.[0]?.js || [];
          // 查找包含 "content" 关键词的脚本文件，兼容源/构建两种 manifest 路径格式
           const contentFileIdx = contentJsFiles.findIndex(f => /content/i.test(f) && f.endsWith('.js'));
           const injectFiles = contentFileIdx !== -1 ? [contentJsFiles[contentFileIdx]] : contentJsFiles;
           if (contentFileIdx === -1 && injectFiles.length === 0) {
             resolve({ success: false, error: '无法找到 content script 文件', tool_call_id: toolCallId });
             return;
           }
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: injectFiles
          })
            .then(() => {
              console.log('[Background] Content script 注入成功, 开始重试发送消息');
              // 注入后多次重试，应对页面加载慢导致 content script 初始化延迟的情况
              retrySendAfterInjection(tabId, message, 0);
            })
            .catch(err => {
              console.warn('[Background] 注入 content script 失败:', err.message);
              if (err.message && err.message.includes('error page')) {
                resolve({ success: false, error: '该标签页显示错误页面，页面未能成功加载。请检查 URL 是否正确、网络是否可达', tool_call_id: toolCallId });
              } else {
                resolve({ success: false, error: '注入 Content Script 失败: ' + err.message, tool_call_id: toolCallId });
              }
            });
          
          // 注入后重试发送，最多 3 次，指数退避
          function retrySendAfterInjection(retryTabId, retryMessage, attempt) {
            const delays = [300, 600, 1200];
            const maxAttempts = delays.length;
            
            setTimeout(() => {
              chrome.tabs.sendMessage(retryTabId, retryMessage, (retryResponse) => {
                if (chrome.runtime.lastError) {
                  if (attempt < maxAttempts - 1) {
                    console.warn(`[Background] 重试 ${attempt + 2}/${maxAttempts + 1} 失败, ${delays[attempt + 1]}ms 后重试:`, chrome.runtime.lastError.message);
                    retrySendAfterInjection(retryTabId, retryMessage, attempt + 1);
                  } else {
                    console.warn('[Background] 所有重试均失败:', chrome.runtime.lastError.message);
                    resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
                  }
                } else {
                  console.log('[Background] 重试成功 (第' + (attempt + 2) + '次)');
                  resolve({ ...retryResponse, tool_call_id: toolCallId });
                }
              });
            }, delays[attempt]);
          }
        });
      } else {
        resolve({ ...response, tool_call_id: toolCallId });
      }
    });
  });
}

// ==================== 合并工具执行器（按 action 分发到原执行函数） ====================

async function executeManageTab(args, toolCallId) {
  const { action } = args;
  switch (action) {
    case 'open': return executeOpenTab(args, toolCallId);
    case 'switch': return executeSwitchTab(args, toolCallId);
    case 'close': return executeCloseTab(args, toolCallId);
    case 'reload': return executeReloadTab(args, toolCallId);
    case 'navigate': return executeNavigateBackForward(args, toolCallId);
    default: return makeResult(false, `未知的 manage_tab action: ${action}`, { tool_call_id: toolCallId });
  }
}

async function executeSearchBrowserData(args, toolCallId) {
  const { action } = args;
  switch (action) {
    case 'bookmark': return executeSearchBookmarks(args, toolCallId);
    case 'history': return executeSearchHistory(args, toolCallId);
    default: return makeResult(false, `未知的 search_browser_data action: ${action}`, { tool_call_id: toolCallId });
  }
}

async function executeAgentTrash(args, toolCallId) {
  const { action } = args;
  switch (action) {
    case 'list': return executeAgentListTrash(args, toolCallId);
    case 'restore': return executeAgentRestoreTrash(args, toolCallId);
    default: return makeResult(false, `未知的 agent_trash action: ${action}`, { tool_call_id: toolCallId });
  }
}

async function executeManageAiAgent(args, toolCallId) {
  const { action } = args;
  switch (action) {
    case 'list': return executeAgentList(args, toolCallId);
    case 'switch': return executeAgentSwitch(args, toolCallId);
    default: return makeResult(false, `未知的 manage_agent action: ${action}`, { tool_call_id: toolCallId });
  }
}

async function executeAgentFile(args, toolCallId) {
  const { action } = args;
  switch (action) {
    case 'read': return executeAgentReadFile(args, toolCallId);
    case 'write': return executeAgentWriteFile(args, toolCallId);
    case 'list': return executeAgentListDir(args, toolCallId);
    case 'delete': return executeAgentDeleteFile(args, toolCallId);
    case 'download': return executeAgentDownloadFile(args, toolCallId);
    default: return makeResult(false, `未知的 agent_file action: ${action}`, { tool_call_id: toolCallId });
  }
}

async function executeAgentSearch(args, toolCallId) {
  const { searchType } = args;
  switch (searchType) {
    case 'file': return executeAgentSearchFiles(args, toolCallId);
    case 'content': return executeAgentSearchContent(args, toolCallId);
    default: return makeResult(false, `未知的 agent_search searchType: ${searchType}`, { tool_call_id: toolCallId });
  }
}

/**
 * 执行日志提炼工具：从会话的 messageHistory 中提取 executionLog，
 * 分析成功路径、失败教训和反思建议，返回结构化结果供模型分析。
 */
async function executeExtractExecutionLog(args, toolCallId, currentSessionId) {
  const { scope = 'last_n_rounds', rounds = 3, sessionId } = args;

  const sid = sessionId || currentSessionId || await getActiveSessionId();
  if (!sid) {
    return makeResult(false, '无法获取会话ID，请指定 sessionId 参数', { tool_call_id: toolCallId });
  }

  const session = await getSession(sid);
  if (!session) {
    return makeResult(false, `会话不存在: ${sid}`, { tool_call_id: toolCallId });
  }

  const messageHistory = session.messageHistory || [];

  // 收集所有带 executionLog 的 assistant 消息（每条代表一轮 ReAct 循环）
  const roundsWithLog = messageHistory
    .map((msg, idx) => ({ msg, idx }))
    .filter(({ msg }) => msg.role === 'assistant' && Array.isArray(msg.executionLog) && msg.executionLog.length > 0);

  if (roundsWithLog.length === 0) {
    return makeResult(true, '当前会话没有执行日志。', { tool_call_id: toolCallId });
  }

  // 根据 scope 过滤目标轮次
  let targetRounds;
  if (scope === 'full_session') {
    targetRounds = roundsWithLog;
  } else {
    targetRounds = roundsWithLog.slice(-Math.min(rounds, roundsWithLog.length));
  }

  // 从目标轮次中提炼信息
  const successPaths = [];
  const failures = [];
  const reflections = [];
  const timeline = [];

  for (const { msg, idx } of targetRounds) {
    const roundNum = idx + 1;
    const log = msg.executionLog || [];

    for (const entry of log) {
      const nodeType = entry.nodeType;

      // 记录时间线条目
      timeline.push({
        round: roundNum,
        nodeType,
        nodeName: entry.nodeName || entry.action?.name || '未知',
        status: entry.status || 'unknown',
        timestamp: entry.timestamp || null,
        toolName: entry.action?.name || null
      });

      // 工具执行结果
      if (nodeType === 'tool_exec') {
        const toolName = entry.action?.name || entry.nodeName || '未知工具';
        const toolArgs = entry.action?.arguments || entry.action?.args || {};
        const status = entry.status;

        if (status === 'success') {
          successPaths.push({
            round: roundNum,
            tool: toolName,
            args: toolArgs,
            result: entry.observation || entry.result || '成功',
            description: entry.nodeName || ''
          });
        } else if (status === 'failed' || status === 'cancelled') {
          failures.push({
            round: roundNum,
            tool: toolName,
            args: toolArgs,
            status,
            error: entry.error || entry.observation || entry.result || '未知错误',
            description: entry.nodeName || ''
          });
        }
      }

      // 反思节点
      if (nodeType === 'reflection') {
        reflections.push({
          round: roundNum,
          tool: entry.action?.name || entry.nodeName || '未知',
          effective: entry.effective !== undefined ? entry.effective : null,
          reasoning: entry.reasoning || entry.analysis || '',
          suggestion: entry.suggestion || entry.advice || '',
          reflectionType: entry.reflectionType || ''
        });
      }
    }
  }

  // 统计数据
  const totalRounds = targetRounds.length;
  const totalSteps = timeline.length;
  const successCount = timeline.filter(t => t.status === 'success').length;
  const failCount = timeline.filter(t => t.status === 'failed' || t.status === 'cancelled').length;

  // 构建结构化结果
  const result = {
    sessionId: sid,
    scope,
    roundsAnalyzed: totalRounds,
    stats: {
      totalSteps,
      successCount,
      failCount,
      successRate: totalSteps > 0 ? ((successCount / totalSteps) * 100).toFixed(1) + '%' : '0%'
    },
    successPaths,
    failures,
    reflections,
    timeline
  };

  // 构建可读的 Markdown 摘要
  const mdLines = [];
  mdLines.push(`## 执行日志提炼报告`);
  mdLines.push('');
  mdLines.push(`**会话**: ${session.title || sid.slice(0, 8)}`);
  mdLines.push(`**分析范围**: ${scope}（${totalRounds} 轮）`);
  mdLines.push(`**统计**: 共 ${totalSteps} 步，成功 ${successCount}，失败 ${failCount}，成功率 ${result.stats.successRate}`);
  mdLines.push('');

  if (successPaths.length > 0) {
    mdLines.push('### ✅ 成功路径');
    mdLines.push('');
    for (const s of successPaths) {
      mdLines.push(`- **[轮次${s.round}]** 工具 \`${s.tool}\` → ${typeof s.result === 'string' ? s.result.substring(0, 100) : '执行成功'}`);
    }
    mdLines.push('');
  }

  if (failures.length > 0) {
    mdLines.push('### ❌ 失败教训');
    mdLines.push('');
    for (const f of failures) {
      mdLines.push(`- **[轮次${f.round}]** 工具 \`${f.tool}\` ${f.status}: ${typeof f.error === 'string' ? f.error.substring(0, 150) : '未知错误'}`);
    }
    mdLines.push('');
  }

  if (reflections.length > 0) {
    mdLines.push('### 🎯 反思建议');
    mdLines.push('');
    for (const r of reflections) {
      mdLines.push(`- **[轮次${r.round}]** 工具 \`${r.tool}\``);
      if (r.reasoning) mdLines.push(`  - 推理: ${r.reasoning.substring(0, 200)}`);
      if (r.suggestion) mdLines.push(`  - 建议: ${r.suggestion.substring(0, 200)}`);
    }
    mdLines.push('');
  }

  return makeResult(true, mdLines.join('\n'), {
    tool_call_id: toolCallId,
    extractedData: result
  });
}

// ==================== 工具路由（基于 RAW_TOOLS 自动派生） ====================

// Background 工具处理器注册表（单一数据源）
// 新增 background 工具时：只需在 RAW_TOOLS 添加定义 + 在此注册 handler
const TOOL_HANDLERS = {
  capture_page: executeCapturePage,
  clarify_question: executeClarifyQuestion,
  notify: executeShowNotification,
  fetch_url: executeFetchUrl,
  list_tabs: executeGetTabs,
  browser_info: executeGetBrowserInfo,
  download_file: executeDownloadFile,
  manage_cookies: executeManageCookies,
  plan_task: executePlanTask,
  clear_data: executeClearPageData,
  search_chats: executeSearchConversationMemory,
  preview_ui: executePreviewUiPrototype,
  agent_file: executeAgentFile,
  agent_exec: executeAgentExecCommand,
  agent_search: executeAgentSearch,
  agent_skill: executeAgentSkill,
  wait_navigation: executeWaitForNavigation,
  dispatch_task: executeDispatchSubAgent,
  agent_memory: async (args, toolCallId, sessionId) => executeAgentMemory(args, toolCallId, sessionId),
  // ── 合并后的工具 ──
  page_content: executeGetPageContent,
  extract_data: executeExtractData,
  clipboard: executeClipboard,
  manage_tab: executeManageTab,
  search_browser_data: executeSearchBrowserData,
  agent_trash: executeAgentTrash,
  manage_agent: executeManageAiAgent,
  exec_log: executeExtractExecutionLog,
};

// 从 RAW_TOOLS 自动派生 BG_HANDLERS（仅包含 execution: 'background' 且有 handler 的工具）
const BG_HANDLERS = {};
for (const tool of RAW_TOOLS) {
  if (tool.execution === 'background' && TOOL_HANDLERS[tool.id]) {
    BG_HANDLERS[tool.id] = TOOL_HANDLERS[tool.id];
  }
}

// 从 RAW_TOOLS 自动派生 CONTENT_PAYLOADS（根据 function.parameters.properties 自动透传所有参数）
// 新增 content_script 工具时：只需在 RAW_TOOLS 添加定义，payload 自动生成
const CONTENT_PAYLOADS = {};
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
  
  console.log('[Background] 工具调用原始数据:', JSON.stringify(toolCall));
  
  // 解析参数
  if (functionObj && functionObj.arguments) {
    console.log('[Background] toolCall.function.arguments 类型:', typeof functionObj.arguments);
    try {
      const parsed = tryParseToolArgs(functionObj.arguments);
      args = parsed || {};
    } catch (e) {
      console.error('[Background] 解析工具参数失败:', e, '原始值:', JSON.stringify(functionObj.arguments).substring(0, 300));
      return { success: false, error: '工具参数解析失败', tool_call_id: toolCallId };
    }
    const rawArgs = typeof functionObj.arguments === 'string' ? functionObj.arguments.trim() : JSON.stringify(functionObj.arguments);
    if (Object.keys(args).length === 0 && rawArgs.length > 0 && rawArgs !== '{}') {
      console.error('[Background] 参数解析后为空对象！原始 arguments:', JSON.stringify(functionObj.arguments).substring(0, 300));
    }
  } else if (typeof argsStr === 'object') {
    args = argsStr || {};
  } else if (typeof argsStr === 'string') {
    console.log('[Background] 使用备用 argsStr 解析:', argsStr.substring(0, 300));
    try {
      const parsed = tryParseToolArgs(argsStr);
      args = parsed || {};
    } catch (e) {
      console.error('[Background] 解析工具参数失败:', e, '原始值:', argsStr);
      return { success: false, error: '工具参数解析失败', tool_call_id: toolCallId };
    }
  }
  
  console.log('[Background] 执行工具:', toolName, args, 'id:', toolCallId);

  const executionType = TOOL_EXECUTION_MAP[toolName];
  let result;

  if (executionType === 'background') {
    const handler = BG_HANDLERS[toolName];
    if (handler) {
      console.log(`[Background] ${toolName} 直接执行，不通过 content script`);
      
      const toolsNeedingTabId = [
        'page_content', 'extract_data',
        'interact_element', 'scroll_to', 'search_in_page',
        'input_text', 'select_option', 'submit_form', 'wait_navigation',
        'manage_tab'
      ];
      
      if (toolsNeedingTabId.includes(toolName) && !args.tabId && tabId) {
        args = { ...args, tabId };
        console.log(`[Background] ${toolName} 使用会话绑定的 tabId: ${tabId}`);
      }
      
      result = await handler(args, toolCallId, sessionId, tabId);
    } else {
      result = { success: false, error: '未知工具: ' + toolName, tool_call_id: toolCallId };
    }
  } else if (executionType === 'content_script') {
    const buildPayload = CONTENT_PAYLOADS[toolName];
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
  
  console.log('[Background] 执行书签搜索:', 'query=', JSON.stringify(query), 'maxResults=', maxResults);
  
  return new Promise((resolve) => {
    if (!chrome.bookmarks) {
      console.error('[Background] chrome.bookmarks API 不可用');
      resolve(makeResult(false, '浏览器不支持书签 API'));
      return;
    }
    
    // 如果查询为空，获取书签树根节点来列出所有书签
    if (!query || query.trim() === '') {
      console.log('[Background] 空查询，获取书签根节点...');
      chrome.bookmarks.getTree((bookmarksTree) => {
        console.log('[Background] chrome.bookmarks.getTree 回调, 树节点数量:', bookmarksTree ? bookmarksTree.length : 'null');
        
        if (chrome.runtime.lastError) {
          console.error('[Background] chrome.bookmarks.getTree 错误:', chrome.runtime.lastError.message);
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
        
        console.log('[Background] 收集到的书签总数:', allBookmarks.length);
        
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
        
        console.log('[Background] 书签搜索成功，返回结果:', formattedResults.length);
        resolve(makeResult(true, resultText));
      });
      return;
    }
    
    // 有查询关键词，执行搜索
    console.log('[Background] 调用 chrome.bookmarks.search...');
    chrome.bookmarks.search(query, (results) => {
      console.log('[Background] chrome.bookmarks.search 回调, 结果数量:', results ? results.length : 'null');
      
      if (chrome.runtime.lastError) {
        console.error('[Background] chrome.bookmarks.search 错误:', chrome.runtime.lastError.message);
        resolve(makeResult(false, '搜索书签失败: ' + chrome.runtime.lastError.message));
        return;
      }
      
      if (!results || results.length === 0) {
        console.log('[Background] 未找到匹配的书签');
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
      
      console.log('[Background] 书签搜索成功，返回结果:', formattedResults.length);
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
  
  console.log('[Background] 执行历史记录搜索:', 'query=', JSON.stringify(query), 'maxResults=', maxResults, '时间范围:', startTime, '-', endTime);
  
  return new Promise((resolve) => {
    if (!chrome.history) {
      console.error('[Background] chrome.history API 不可用');
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
    
    console.log('[Background] 调用 chrome.history.search, 选项:', JSON.stringify(searchOptions));
    chrome.history.search(searchOptions, (results) => {
      console.log('[Background] chrome.history.search 回调, 结果数量:', results ? results.length : 'null');
      
      if (chrome.runtime.lastError) {
        console.error('[Background] chrome.history.search 错误:', chrome.runtime.lastError.message);
        resolve(makeResult(false, '搜索历史失败: ' + chrome.runtime.lastError.message));
        return;
      }
      
      if (!results || results.length === 0) {
        console.log('[Background] 未找到匹配的访问记录');
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
      
      console.log('[Background] 历史记录搜索成功，返回结果:', formattedResults.length);
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
  // query 为空时默认返回更多消息（用于总结整个会话场景）
  const maxResults = parseInt(args.maxResults, 10) || (query ? 5 : 100);
  const searchScope = args.searchScope || 'current_session';

  console.log('[Background] 执行对话记忆搜索:', 'query=', JSON.stringify(query), 'maxResults=', maxResults, 'scope=', searchScope, 'sessionId=', sessionId);

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

    // query 为空时，直接返回全部消息（按原顺序），不评分过滤
    if (!query) {
      const allResult = allMessages.slice(0, maxResults);
      const resultText =
        `共 ${allMessages.length} 条消息，返回 ${allResult.length} 条：\n\n` +
        allResult
          .map((m, i) => {
            const text = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.filter(c => c.type === 'text').map(c => c.text).join('') : '');
            const contentPreview = text.length > 500 ? text.substring(0, 500) + '...' : text;
            return `### ${i + 1}. [${m.session}] ${m.role === 'user' ? '用户' : '助手'}消息\n${contentPreview}`;
          })
          .join('\n\n---\n\n');
      return makeResult(true, resultText);
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

    console.log('[Background] 对话记忆搜索成功，返回:', relevant.length, '条结果');
    return makeResult(true, resultText);
  } catch (err) {
    console.error('[Background] 对话记忆搜索失败:', err);
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
  
  console.log('[Background] 执行澄清工具:', args, 'toolCallId:', toolCallId, 'sessionId:', sessionId);
  
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
    let sidePanelCheckId = null;
    
    /**
     * 清理函数：确保监听器和计时器都被正确清理
     */
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (sidePanelCheckId) {
        clearInterval(sidePanelCheckId);
        sidePanelCheckId = null;
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
        
        console.log('[Background] 收到澄清响应:', msg);
        
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
        console.error('[Background] 发送澄清消息失败:', chrome.runtime.lastError.message);
        cleanup(); // 确保清理
        resolve({ 
          success: false, 
          error: '无法显示澄清对话框: ' + chrome.runtime.lastError.message,
          tool_call_id: toolCallId 
        });
        return;
      }
      
      console.log('[Background] 澄清对话框已发送到 Side Panel，超时:', clarifyTimeout, 'ms');
      
      // 设置超时处理（使用配置的澄清超时时间）
      timeoutId = setTimeout(() => {
        console.error('[Background] 澄清对话框超时');
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

      // 定期检测 Side Panel 是否关闭，避免监听器和计时器泄漏
      // 若 Side Panel 已关闭，提前终止等待（无需等到超时）
      sidePanelCheckId = setInterval(async () => {
        try {
          const contexts = await chrome.runtime.getContexts({
            contextTypes: ['SIDE_PANEL']
          });
          if (!contexts || contexts.length === 0) {
            console.warn('[Background] Side Panel 已关闭，提前终止澄清等待');
            cleanup();
            chrome.runtime.sendMessage({
              type: 'CLARIFY_TIMEOUT',
              toolCallId: toolCallId,
              sessionId
            }).catch(() => {});
            resolve({
              success: false,
              error: 'Side Panel 已关闭，澄清操作中止',
              tool_call_id: toolCallId
            });
          }
        } catch {
          // getContexts 不可用时静默忽略（回退到超时机制）
        }
      }, 5000);
      
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
  
  console.log('[Background] 执行浏览器通知:', args, 'toolCallId:', toolCallId);
  
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
        console.error('[Background] 创建通知失败:', chrome.runtime.lastError.message);
        resolve(makeResult(false, '通知创建失败: ' + chrome.runtime.lastError.message));
        return;
      }
      
      console.log('[Background] 通知已创建，ID:', notificationId);
      
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

/**
 * 带超时控制的 fetch 请求
 *
 * 核心设计：
 * 1. 超时用 AbortSignal.timeout()（浏览器引擎级，不受 SW setTimeout 节流影响）
 * 2. 外部取消用 addEventListener('abort') 桥接到同一个 AbortController
 * 3. 不使用 AbortSignal.any()（Chrome 有已知 bug，abort 传播可能不生效）
 *
 * @param {string} url
 * @param {Object} options - fetch options（可包含外部 signal）
 * @param {number} timeoutMs
 */
export async function fetchWithTimeout(url, options, timeoutMs) {
  // 确保 timeoutMs 是有效的正整数，防止 AbortSignal.timeout() 报错
  const safeTimeoutMs = Math.max(1, Math.floor(Number(timeoutMs) || 60000));
  const controller = new AbortController();
  const externalSignal = options?.signal;

  // AbortSignal.timeout() 是浏览器引擎级超时，不受 SW 定时器节流影响
  // 低版本 Chrome（<103）不支持，使用 setTimeout 作为回退
  let timeoutSignal;
  let timeoutId;
  if (typeof AbortSignal.timeout === 'function') {
    timeoutSignal = AbortSignal.timeout(safeTimeoutMs);
  } else {
    // 回退：使用 setTimeout 模拟超时
    timeoutSignal = controller.signal;
    timeoutId = setTimeout(() => controller.abort(), safeTimeoutMs);
  }

  // 统一 abort 通道：超时和外部取消都通过 controller.abort() 触发
  const onAbort = () => controller.abort();
  timeoutSignal.addEventListener('abort', onAbort, { once: true });

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal   // 始终使用内部 signal，避免 AbortSignal.any 潜在 bug
    });
    // 清理监听器
    timeoutSignal.removeEventListener('abort', onAbort);
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    if (timeoutId) clearTimeout(timeoutId);
    return response;
  } catch (error) {
    // 清理监听器
    timeoutSignal.removeEventListener('abort', onAbort);
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    if (timeoutId) clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      // 外部取消 → 传播原始 AbortError（fetchWithRetry 不重试）
      if (externalSignal?.aborted) {
        throw error;
      }
      // 内部超时 → 包装为超时错误（fetchWithRetry 会重试）
      throw new Error(`请求超时 (${safeTimeoutMs}ms)`);
    }
    throw error;
  }
}

/**
 * 带重试的 fetch 请求
 * 可重试的错误：网络错误、超时、5xx、429（Rate Limit）
 * 不重试的错误：4xx（除429外）、取消
 * 使用指数退避策略：baseDelay * 2^attempt
 *
 * @param {string} url
 * @param {Object} options - fetch options
 * @param {number} timeoutMs - 单次请求超时时间
 * @param {number} maxRetries - 最大重试次数（默认3）
 * @param {number} baseDelay - 基础延迟毫秒数（默认1000）
 * @param {Function} onRetry - 重试回调 (attempt, error, delay) => void
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options, timeoutMs, maxRetries = 3, baseDelay = 1000, onRetry = null) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);

      // 5xx 或 429 可重试
      if ((response.status >= 500 || response.status === 429) && attempt < maxRetries) {
        const errorText = await response.text().catch(() => '');
        lastError = new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[Background] API 返回 ${response.status}，${delay}ms 后重试 (${attempt + 1}/${maxRetries})`);
        if (onRetry) onRetry(attempt + 1, lastError, delay);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries) break;

      // 被取消（AbortError 且不是超时）不重试
      if (error.name === 'AbortError' && !error.message.includes('超时')) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`[Background] API 调用失败，${delay}ms 后重试 (${attempt + 1}/${maxRetries}):`, error.message);
      if (onRetry) onRetry(attempt + 1, error, delay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export async function executeFetchUrl(args, toolCallId) {
  const { url, method = 'GET', headers = {}, body, timeout = 15000 } = args;
  
  console.log('[Background] 执行 HTTP 请求:', 'method=', method, 'url=', url, 'timeout=', timeout);
  
  // 验证 URL 格式
  if (!url) {
    return { 
      success: false, 
      error: '缺少 URL 参数',
      tool_call_id: toolCallId 
    };
  }
  
  // 检查 URL 是否有效
  try {
    new URL(url);
  } catch (e) {
    return { 
      success: false, 
      error: `无效的 URL 格式: ${url}`,
      tool_call_id: toolCallId 
    };
  }
  
  // Service Worker 的 fetch() 对 headers 类型校验严格，所有值必须是 ByteString。
  // AI 模型可能传入 non-string 类型的 header 值（如 number、boolean、null），
  // 需要先做类型清洗，避免 "is not of type '(record<ByteString, ByteString>'" 错误。
  const sanitizedHeaders = {};
  if (headers && typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      sanitizedHeaders[key] = String(value ?? '');
    }
  }

  const fetchOptions = {
    method: method.toUpperCase(),
    headers: sanitizedHeaders
  };
  
  // 只在有 body 且不是 GET/HEAD 方法时添加 body
  if (body && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
    fetchOptions.body = typeof body === 'object' ? JSON.stringify(body) : body;
  }
  
  console.log('[Background] fetch 选项:', JSON.stringify(fetchOptions));
  
  try {
    const response = await fetchWithRetry(url, fetchOptions, timeout, 1);
    console.log('[Background] HTTP 响应状态:', response.status, response.statusText);
    
    try {
      const text = await response.text();
      const result = {
        success: response.status >= 200 && response.status < 300,
        status: response.status,
        statusText: response.statusText,
        content: text.substring(0, 10000),
        contentLength: text.length,
        url: response.url
      };
      console.log('[Background] HTTP 响应内容长度:', text.length);
      return { ...result, tool_call_id: toolCallId };
    } catch (textError) {
      console.error('[Background] 读取响应内容失败:', textError);
      return {
        success: false,
        error: `读取响应内容失败: ${textError.message}`,
        status: response.status,
        tool_call_id: toolCallId
      };
    }
  } catch (error) {
    let errorMessage = error.message;
    
    if (error.name === 'AbortError') {
      console.warn('[Background] HTTP 请求超时:', url, `(${timeout}ms)`);
      errorMessage = `请求超时 (${timeout}ms)，目标服务器响应过慢。如需获取数据，可尝试：\n1. 适当增大 timeout 参数重新请求\n2. 检查该 URL 在浏览器中是否能快速访问\n3. 如果是 API 接口，尝试缩小请求范围`;
    } else {
      console.error('[Background] HTTP 请求失败:', error.name, error.message);
      if (error.message === 'Failed to fetch') {
        errorMessage = `无法访问目标 URL，可能原因：\n1. 目标服务器不可达\n2. URL 不存在或已失效\n3. 目标服务器拒绝连接\n4. 网络连接问题`;
      } else if (error.message.includes('CORS')) {
        errorMessage = `CORS 跨域限制，目标服务器不允许跨域访问`;
      }
    }
    
    return { 
      success: false, 
      error: errorMessage,
      originalError: error.message,
      url: url,
      tool_call_id: toolCallId 
    };
  }
}

/**
 * 获取浏览器信息
 */
export function executeGetBrowserInfo(args, toolCallId) {
  console.log('[Background] 获取浏览器信息');
  
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
  
  console.log('[Background] 下载文件:', 'url=', url, 'filename=', filename);
  
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
        console.error('[Background] 下载失败:', chrome.runtime.lastError.message);
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[Background] 下载已创建，ID:', downloadId);
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
 * 支持 waitForLoad 参数：等待页面加载完成再返回，避免后续工具因页面未就绪而失败
 */
export function executeOpenTab(args, toolCallId) {
  const { url, active: rawActive = true, waitForLoad = false, loadTimeout = 15000 } = args;
  const active = typeof rawActive === 'boolean' ? rawActive : String(rawActive).toLowerCase() === 'true';
  
  console.log('[Background] 打开新标签页:', 'url=', url, 'active=', active, 'waitForLoad=', waitForLoad, 'loadTimeout=', loadTimeout);
  
  return new Promise((resolve) => {
    chrome.tabs.create({ url: url, active: active }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] 打开标签页失败:', chrome.runtime.lastError.message);
        resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
        return;
      }
      
      if (!waitForLoad) {
        resolve({ 
          success: true, 
          message: `已打开标签页，tabId: ${tab.id}。该tabId可直接用于后续网页操作工具（如page_content、interact_element、extract_data等）`,
          tabId: tab.id,
          url: tab.url,
          tool_call_id: toolCallId
        });
        return;
      }

      // 等待页面加载完成（或超时）
      let resolved = false;
      const safeTimeout = Math.max(1000, Math.floor(Number(loadTimeout) || 15000));
      
      const timeoutId = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        console.warn('[Background] 页面加载超时:', url, `(${safeTimeout}ms)`);
        resolve({
          success: true,
          message: `标签页已打开但加载超时（${safeTimeout}ms），页面可能较慢或无法访问。后续工具调用可能失败`,
          tabId: tab.id,
          url: tab.url,
          loadTimedOut: true,
          tool_call_id: toolCallId
        });
      }, safeTimeout);
      
      const listener = (updatedTabId, changeInfo, updatedTab) => {
        if (updatedTabId === tab.id && changeInfo.status === 'complete') {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(listener);
          console.log('[Background] 页面加载完成:', updatedTab.url);
          resolve({
            success: true,
            message: `已打开并加载完成: ${updatedTab.url}`,
            tabId: tab.id,
            url: updatedTab.url,
            tool_call_id: toolCallId
          });
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

/**
 * 切换到指定标签页
 */
export function executeSwitchTab(args, toolCallId) {
  const { tabId: rawTabId } = args;
  const tabId = parseInt(rawTabId, 10);
  
  console.log('[Background] 切换标签页:', 'tabId=', tabId);
  
  return new Promise((resolve) => {
    chrome.tabs.update(tabId, { active: true }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] 切换标签页失败:', chrome.runtime.lastError.message);
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ 
          success: true, 
          message: `已切换标签页，tabId: ${tab.id}。该tabId可直接用于后续网页操作工具（如page_content、interact_element、extract_data等）`,
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
  
  console.log('[Background] 关闭标签页:', 'tabId=', tabId);
  
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
  const { mode = 'all', includeUrl = true, includeTitle = true } = args;
  
  console.log('[Background] 获取标签页列表:', 'mode=', mode, 'includeUrl=', includeUrl, 'includeTitle=', includeTitle);
  
  return new Promise((resolve) => {
    const queryOptions = mode === 'active' 
      ? { active: true, currentWindow: true } 
      : { currentWindow: true };
      
    chrome.tabs.query(queryOptions, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] 获取标签页失败:', chrome.runtime.lastError.message);
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
  
  console.log('[Background] 执行任务规划工具:', JSON.stringify(args));
  
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
 * 清除页面数据（localStorage, sessionStorage, cookies）
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
            console.warn('[Background] 获取 cookies 失败:', chrome.runtime.lastError.message);
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
            console.warn('[Background] 发送 CLEAR_PAGE_DATA 消息失败:', chrome.runtime.lastError.message);
            // 尝试注入 content script 后再试
            const manifest = chrome.runtime.getManifest();
            const contentJsFiles = manifest.content_scripts?.[0]?.js || [];
            const contentFile = contentJsFiles.find(f => f.includes('content-')) || 'content.js';
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: [contentFile]
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
    console.log('[Background] 执行获取 UI 原型:', 'prototypeId=', prototypeId);
    
    if (!prototypeId || !prototypeId.trim()) {
      return { success: false, error: '缺少 prototypeId 参数', tool_call_id: toolCallId };
    }
    
    try {
      const prototype = await getUiPrototype(prototypeId.trim());
      
      if (!prototype) {
        return { success: false, error: `未找到原型: ${prototypeId}`, tool_call_id: toolCallId };
      }
      
      console.log('[Background] 获取原型成功:', prototype.title, 'HTML长度:', prototype.html?.length);
      
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
      console.error('[Background] 获取 UI 原型失败:', err);
      return { success: false, error: '获取失败: ' + err.message, tool_call_id: toolCallId };
    }
  }
  
  // ── action=preview：创建并预览原型 ──
  console.log('[Background] 执行 UI 原型预览:', 'title=', title, 'sessionId=', sessionId);
  
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
    
    console.log('[Background] UI 原型已保存，ID:', newPrototypeId);

    // ── 尝试通过 Agent 写入文件并打开 ──
    let localOpened = false;
    let localPath = null;
    let isRemoteAgent = false;

    try {
      const config = await AgentClient.getAgentConfig();
      if (config.connected) {
        const relativePath = `prototypes/${newPrototypeId}/index.html`;
        const writeResult = await AgentClient.writeFile(relativePath, html.trim());

        if (writeResult.success) {
          localPath = writeResult.path; // agent 返回的绝对路径
          console.log('[Background] 原型已写入 Agent:', localPath);

          // 更新 IndexedDB 记录，保存 localPath
          await saveUiPrototype({ ...prototypeData, localPath });

          // 判断代理是否在本地
          const isLocal = await AgentClient.isLocalAgent();
          
          if (isLocal) {
            // 本地代理：直接在代理端浏览器打开
            const openResult = await AgentClient.openBrowser(localPath);
            if (openResult.success) {
              localOpened = true;
              console.log('[Background] 原型已在代理端浏览器打开:', localPath);
            } else {
              console.warn('[Background] 代理端浏览器打开失败:', openResult.error);
            }
          } else {
            // 远端代理：不在远端浏览器打开，标记由浏览器端打开
            isRemoteAgent = true;
            console.log('[Background] 代理为远端，将在浏览器端标签页打开原型');
          }
        } else {
          console.warn('[Background] Agent 文件写入失败:', writeResult.error);
        }
      }
    } catch (err) {
      console.warn('[Background] Agent 原型写入/打开失败，回退到 Side Panel:', err.message);
    }

    chrome.runtime.sendMessage({
      type: 'SHOW_UI_PROTOTYPE',
      data: {
        prototypeId: newPrototypeId,
        title: prototypeData.title,
        description: prototypeData.description,
        localOpened,       // 是否已在代理端浏览器打开
        localPath,         // 代理端文件路径
        isRemoteAgent,     // 是否为远端代理（需浏览器端打开）
      }
    }).catch(() => {});
    
    return { 
      success: true, 
      message: localOpened ? `UI 原型 "${title}" 已创建并在代理端浏览器打开` : `UI 原型 "${title}" 已创建`,
      prototypeId: newPrototypeId,
      localOpened,
      isRemoteAgent,
      localPath,
      tool_call_id: toolCallId 
    };
  } catch (err) {
    console.error('[Background] 执行 UI 原型预览失败:', err);
    return { success: false, error: '执行失败: ' + err.message, tool_call_id: toolCallId };
  }
}

// ========== 本地 Agent 工具处理函数 ==========

/**
 * Skill 加载/执行（合并后）
 * action=load: 加载 Skill 说明文档（带缓存）
 * action=run:  执行 Workflow Skill
 */
// 单次会话中已加载的 Skill 缓存（避免重复网络请求）
const skillLoadCache = new Map(); // name → { timestamp, prompt, skill }

/**
 * 清空 Skill 加载缓存（切换代理时调用）
 */
export function clearSkillLoadCache() {
  skillLoadCache.clear();
}

async function executeAgentSkill(args, toolCallId) {
  const { action, name, params = {} } = args;
  if (!name) return { success: false, error: '缺少 name 参数', tool_call_id: toolCallId };

  // action=run: 执行 Workflow Skill
  if (action === 'run') {
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

  // action=load（默认）: 加载 Skill 说明文档
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

    console.log('[Background] 等待页面导航完成: tabId=', tabId, 'waitUntil=', waitUntil, 'timeout=', timeout);

    return new Promise((resolve) => {
      let resolved = false;
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(listener);
          console.warn('[Background] 等待导航超时:', timeout + 'ms');
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
 * Agent 文件写入
 */
async function executeAgentWriteFile(args, toolCallId) {
  const { path, content } = args;
  if (!path) return { success: false, error: '缺少 path 参数', tool_call_id: toolCallId };
  if (content === undefined || content === null) return { success: false, error: '缺少 content 参数', tool_call_id: toolCallId };
  
  const result = await AgentClient.writeFile(path, content);
  if (result.success) {
    appendAuditLog('file_write', `写入文件: ${result.path}`, { path: result.path, size: result.size });
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
    const typeLabel = result.isDir ? '目录' : '文件';
    appendAuditLog('file_delete', `删除${typeLabel}: ${result.path}`, { path: result.path, isDir: result.isDir });
    return { success: true, message: `已删除${typeLabel}: ${result.path}，可在回收站中恢复（7天后自动清理）`, path: result.path, isDir: result.isDir, tool_call_id: toolCallId };
  }
  return { success: false, error: result.error, tool_call_id: toolCallId };
}

/**
 * Agent 回收站列表
 */
async function executeAgentListTrash(args, toolCallId) {
  const result = await AgentClient.getTrashList();
  if (result.success) {
    let entries = result.entries || [];
    // 按可选的 type 参数过滤文件/目录
    if (args.type === 'file') {
      entries = entries.filter(e => !e.isDir);
    } else if (args.type === 'directory') {
      entries = entries.filter(e => e.isDir);
    }
    // 按可选的 hours 参数过滤时间范围
    if (args.hours && typeof args.hours === 'number' && args.hours > 0) {
      const cutoff = Date.now() - args.hours * 3600 * 1000;
      entries = entries.filter(e => e.deletedAt >= cutoff);
    }
    if (entries.length === 0) {
      const typeHint = args.type === 'file' ? '文件' : args.type === 'directory' ? '目录' : '项目';
      return { success: true, content: `回收站为空，没有可恢复的${typeHint}。`, entries: [], tool_call_id: toolCallId };
    }
    const now = Date.now();
    const text = `回收站中共有 ${entries.length} 个项目（7天后自动清理）:\n\n` +
      entries.map((e, i) => {
        const age = Math.round((now - e.deletedAt) / (1000 * 60 * 60));
        const ageStr = age < 1 ? '刚刚' : age < 24 ? `${age}小时前` : `${Math.round(age / 24)}天前`;
        const typeLabel = e.isDir ? '📁 目录' : '📄 文件';
        return `  ${i + 1}. trashId: ${e.id}\n     ${typeLabel}: ${e.name}\n     原路径: ${e.originalPath}\n     大小: ${e.size} 字节 · ${ageStr}`;
      }).join('\n\n');
    return { success: true, content: text, entries, tool_call_id: toolCallId };
  }
  return { success: false, error: result.error, tool_call_id: toolCallId };
}

/**
 * Agent 回收站恢复
 */
async function executeAgentRestoreTrash(args, toolCallId) {
  const { trashId } = args;
  if (!trashId) return { success: false, error: '缺少 trashId 参数，请先调用 agent_trash(action=list) 获取要恢复条目的 id', tool_call_id: toolCallId };

  const result = await AgentClient.restoreTrash(trashId);
  if (result.success) {
    appendAuditLog('file_restore', `恢复文件: ${result.restoredPath}`, { trashId, restoredPath: result.restoredPath });
    return { success: true, message: `已恢复: ${result.restoredPath}`, restoredPath: result.restoredPath, tool_call_id: toolCallId };
  }
  return { success: false, error: result.error, tool_call_id: toolCallId };
}

/**
 * Agent 文件/目录下载
 * 单文件直接返回 base64 内容触发下载，目录自动打包为 zip
 */
async function executeAgentDownloadFile(args, toolCallId) {
  const { path } = args;
  if (!path) return { success: false, error: '缺少 path 参数', tool_call_id: toolCallId };

  const result = await AgentClient.downloadFile(path);
  if (!result.success) {
    return { success: false, error: result.error, tool_call_id: toolCallId };
  }

  try {
    const mimeType = result.mimeType || 'application/octet-stream';
    const dataUrl = `data:${mimeType};base64,${result.content}`;

    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: dataUrl,
        filename: result.name,
        saveAs: false
      }, (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(id);
        }
      });
    });

    const desc = result.type === 'directory'
      ? `目录 "${path}" 已打包为 ${result.name} 并开始下载 (${formatFileSize(result.size)})`
      : `文件 "${result.name}" 已开始下载 (${formatFileSize(result.size)})`;
    return {
      success: true,
      content: desc,
      name: result.name,
      size: result.size,
      type: result.type,
      downloadId,
      tool_call_id: toolCallId
    };
  } catch (err) {
    return { success: false, error: `下载触发失败: ${err.message}`, tool_call_id: toolCallId };
  }
}

/**
 * 可取消的命令执行包装器
 * 用于非流式命令执行路径（execCommandWait），使其支持用户取消
 * 
 * @param {string} sessionId 
 * @param {string} toolCallId
 * @param {Promise} taskPromise - 实际的异步任务（如 execCommandWait）
 * @returns {Promise<{ cancelled: true } | { cancelled: false, value: any }>}
 */
async function executeWithCancel(sessionId, toolCallId, taskPromise) {
  let resolveCancel;
  const cancelPromise = new Promise(r => { resolveCancel = () => r(true); });
  
  // 注册到 runningAgentCommands，供 cancelRunningAgentCommands 调用
  if (sessionId) {
    runningAgentCommands.set(sessionId, { execId: null, ws: null, toolCallId, resolve: resolveCancel });
  }
  
  try {
    const result = await Promise.race([taskPromise, cancelPromise]);
    if (result === true) {
      // cancelPromise 胜出，返回取消标记
      return { cancelled: true };
    }
    return { cancelled: false, value: result };
  } finally {
    if (sessionId) {
      runningAgentCommands.delete(sessionId);
    }
  }
}

/**
 * Agent 命令执行
 * 处理黑名单拦截、灰名单确认、普通命令直接执行三种情况
 */
async function executeAgentExecCommand(args, toolCallId, sessionId) {
  const { command, cwd, force, timeoutMs } = args;
  if (!command) return { success: false, error: '缺少 command 参数', tool_call_id: toolCallId };

  const config = await getStoredConfig();
  const effectiveForce = !!force || !config.reactConfig.toolConfirmationEnabled;
  const useAgentStream = config.streamConfig?.streamEnabled !== false;
  
  const MIN_TIMEOUT_MS = 5000;
  const effectiveTimeout = typeof timeoutMs === 'number' && timeoutMs > 0 
    ? Math.max(MIN_TIMEOUT_MS, timeoutMs)
    : config.reactConfig.toolTimeout;
  const idleTimeoutMs = Math.max(120000, Math.min(effectiveTimeout * 0.8, 600000));

  if (useAgentStream) {
    const initResult = await AgentClient.execCommand(command, cwd, effectiveForce);
    
    if (initResult.level === 'deny') {
      return { success: false, error: initResult.error || '命令执行被拒绝', level: 'deny', tool_call_id: toolCallId };
    }
    if (!initResult.success && !initResult.level) {
      return { success: false, error: initResult.error || '命令执行失败', tool_call_id: toolCallId };
    }
    if (initResult.level === 'confirm') {
      return {
        success: true,
        level: 'confirm',
        message: `⚠️ 命令需要用户确认：${initResult.reason}\n\n命令: \`${command}\`\n\n如果同意执行，请回复"确认"或"同意"，我会用 force: true 重新执行此命令。`,
        reason: initResult.reason,
        command,
        cwd,
        tool_call_id: toolCallId
      };
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
    // 注：cancelledSessions Set 替代了原来的 cancelled 局部变量，用于跨 handler 共享取消状态

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
          console.log('[AgentExec] 已终止命令进程:', execId, reason ? `(原因: ${reason})` : '');
        } catch (stopErr) {
          console.warn('[AgentExec] 终止命令进程失败:', stopErr.message);
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
          normalExit = true; // 竞态修复：回放消息可能在 wrapper 设置前到达
          sendAgentStreamDone(sessionId, execId, toolCallId, exitCode);
        }
      }, () => {
        // WebSocket 正常关闭后的处理已由 Promise 的 onclose 统一管理
        // 此处不再重复处理，避免与 Promise 的 resolve/reject 冲突
      }, (err) => {
        console.warn('[AgentExec] WebSocket 错误:', err);
      }, idleTimeoutMs);

      if (!ws) {
        throw new Error('创建 WebSocket 连接失败');
      }

      // 注册到 runningAgentCommands，以便取消时能关闭 WebSocket
      if (sessionId) {
        runningAgentCommands.set(sessionId, { execId, ws, toolCallId });
      }

      await new Promise((resolve, reject) => {
        // 将 resolve 函数存入 runningAgentCommands，以便取消时直接 resolve Promise
        // 不依赖 WebSocket 的 onclose/onerror 事件
        if (sessionId) {
          const entry = runningAgentCommands.get(sessionId);
          if (entry) entry.resolve = resolve;
        }
        
        // 竞态修复：exit 回放消息已在 onMessage 回调中处理完毕，无需包装 handler
        if (normalExit) {
          resolve();
          return;
        }
        
        const commandStartTime = Date.now();
        let totalTimeoutId = null;
        let lastOutputTime = Date.now();
        let timeoutExtensions = 0;
        const MAX_EXTENSIONS = 5; // 最多自动延长 5 次总超时
        let resolved = false; // 防止 resolve/reject 被调用多次
        
        // 取消兜底超时：当会话被标记为已取消后，如果3秒内没有正常 resolve/reject，强制 resolve
        // 防止 WebSocket 异常导致前端任务卡住
        const checkCancelledAndResolve = () => {
          if (cancelledSessions.has(sessionId)) {
            console.warn('[AgentExec] 取消兜底超时触发，强制 resolve:', sessionId);
            exitCode = -1;
            sendAgentStreamDone(sessionId, execId, toolCallId, -1);
            clearInterval(cancelTimeoutId);
            clearTimeout(hardTimeoutId);
            resolve();
            return true;
          }
          return false;
        };
        const cancelTimeoutId = setInterval(checkCancelledAndResolve, 500);
        
        // 全局硬超时：120秒后强制结束，防止命令永久挂起
        const hardTimeoutId = setTimeout(() => {
          console.error('[AgentExec] 全局硬超时触发（120秒），强制结束命令:', sessionId);
          clearInterval(cancelTimeoutId);
          clearTimeout(totalTimeoutId);
          exitCode = -1;
          sendAgentStreamDone(sessionId, execId, toolCallId, -1);
          cleanupAndStop('命令执行超时').then(() => {
            reject(new Error('命令执行超时'));
          });
        }, 120000);
        
        const finish = (result) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(totalTimeoutId);
          clearInterval(cancelTimeoutId);
          clearTimeout(hardTimeoutId);
          if (result === 'resolve') {
            resolve();
          } else {
            reject(result);
          }
        };

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
            console.warn('[AgentExec] 命令空闲超时（', Math.round(idleTime / 1000), 's 无输出），可能为挂起型服务，保留后台进程');
            if (ws) { try { ws.close(); } catch {} }
            if (totalTimeoutId) clearTimeout(totalTimeoutId);
            finish('resolve');
            return;
          }

          // 总超时检查
          if (elapsed >= totalAllowed) {
            if (timeoutExtensions < MAX_EXTENSIONS) {
              // 命令仍在执行（最近有输出），自动延长总超时
              timeoutExtensions++;
              const newTotal = effectiveTimeout * (1 + timeoutExtensions);
              console.log(`[AgentExec] 命令仍在执行，自动延长超时 (第${timeoutExtensions}次，总计${Math.round(newTotal / 1000)}s)`);
              scheduleTimeoutCheck();
              return;
            } else {
              const errMsg = `命令执行总超时（${Math.round(totalAllowed / 1000)}s，已延长${MAX_EXTENSIONS}次）`;
              console.warn('[AgentExec]', errMsg);
              cleanupAndStop(errMsg).then(() => {
                finish(new Error(errMsg));
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
              try { ws.close(); } catch {}
              finish('resolve');
            } else if (data.type === 'error') {
              // Agent 端返回错误（如进程不存在、spawn 失败等），立即结束不等待超时
              console.warn('[AgentExec] Agent 返回错误:', data.error, 'execId:', data.execId);
              if (totalTimeoutId) clearTimeout(totalTimeoutId);
              try { ws.close(); } catch {}
              cleanupAndStop(data.error || 'Agent 执行错误').then(() => {
                finish(new Error(data.error || 'Agent 端命令执行失败'));
              });
            }
          } catch {}
        };

        const originalOnClose = ws.onclose;
        ws.onclose = () => {
          if (totalTimeoutId) clearTimeout(totalTimeoutId);
          runningAgentCommands.delete(sessionId);
          // 用户主动取消：走正常结束路径，不触发错误处理
          const isCancelled = cancelledSessions.has(sessionId);
          if (isCancelled) {
            exitCode = -1;
            sendAgentStreamDone(sessionId, execId, toolCallId, -1);
            finish('resolve');
            return;
          }
          if (originalOnClose) originalOnClose();
          // 空闲超时：进程保留，不杀进程，不 reject
          if (idleTimeout) {
            finish('resolve');
            return;
          }
          // 非正常退出时终止后台进程，防止孤儿进程
          if (!normalExit) {
            exitCode = -1;
            sendAgentStreamDone(sessionId, execId, toolCallId, -1);
            cleanupAndStop('WebSocket 连接意外关闭').then(() => {
              finish(new Error('命令执行中断：WebSocket 连接意外关闭'));
            });
          } else {
            finish('resolve');
          }
        };

        const originalOnError = ws.onerror;
        ws.onerror = (err) => {
          if (totalTimeoutId) clearTimeout(totalTimeoutId);
          runningAgentCommands.delete(sessionId);
          // 用户主动取消：不触发错误处理，走正常结束路径
          const isCancelled = cancelledSessions.has(sessionId);
          if (isCancelled) {
            exitCode = -1;
            sendAgentStreamDone(sessionId, execId, toolCallId, -1);
            finish('resolve');
            return;
          }
          if (originalOnError) originalOnError(err);
          cleanupAndStop(err.message).then(() => {
            finish(err);
          });
        };
      });
    } catch (wsError) {
      const errorMessage = wsError.message || (wsError instanceof Error ? '未知错误' : String(wsError));
      console.warn('[AgentExec] WebSocket 流式失败:', errorMessage);
      // 确保关闭 WebSocket，防止连接泄露
      if (ws) { try { ws.close(); } catch {} }
      runningAgentCommands.delete(sessionId);
      // 用户主动取消：走正常结束路径，不触发错误处理或回退到同步模式
      const isCancelled = cancelledSessions.has(sessionId);
      if (isCancelled) {
        sendAgentStreamDone(sessionId, execId, toolCallId, -1);
        appendAuditLog('command_exec', `命令执行取消: ${command}`, { command, cwd, exitCode: -1, error: '用户取消' });
        return {
          success: false,
          level: 'allow',
          execId,
          exitCode: -1,
          stdout: stdoutCollected,
          stderr: stderrCollected,
          killed: true,
          content: `命令已取消\n\n已收集的输出:\n${stdoutCollected ? 'stdout:\n\`\`\`\n' + stdoutCollected + '\n\`\`\`' : ''}${stderrCollected ? '\nstderr:\n\`\`\`\n' + stderrCollected + '\n\`\`\`' : ''}`,
          message: `命令已取消\n\n已收集的输出:\n${stdoutCollected ? 'stdout:\n\`\`\`\n' + stdoutCollected + '\n\`\`\`' : ''}${stderrCollected ? '\nstderr:\n\`\`\`\n' + stderrCollected + '\n\`\`\`' : ''}`,
          error: '用户取消'
        };
      }
      if (errorMessage.includes('超时') || errorMessage.includes('中断') || stopped) {
        sendAgentStreamDone(sessionId, execId, toolCallId, -1);
        appendAuditLog('command_exec', `命令执行失败: ${command}`, { command, cwd, exitCode: -1, error: errorMessage });
        return {
          success: false,
          level: 'allow',
          execId,
          exitCode: -1,
          stdout: stdoutCollected,
          stderr: stderrCollected,
          killed: true,
          message: `命令执行失败：${errorMessage}\n\n已收集的输出:\n${stdoutCollected ? 'stdout:\n\`\`\`\n' + stdoutCollected + '\n\`\`\`' : ''}${stderrCollected ? '\nstderr:\n\`\`\`\n' + stderrCollected + '\n\`\`\`' : ''}`,
          error: errorMessage
        };
      }
      console.warn('[AgentExec] 回退到同步模式:', errorMessage);
      // 为同步回退路径也注册取消机制
      const result = await executeWithCancel(sessionId, toolCallId, 
        AgentClient.execCommandWait(command, cwd, effectiveForce, effectiveTimeout)
      );
      if (result.cancelled) {
        return { success: false, content: '命令已取消', error: '用户取消', tool_call_id: toolCallId };
      }
      return formatAgentExecResult(result.value, command, cwd, toolCallId);
    }

    appendAuditLog('command_exec', `执行命令: ${command}`, { command, cwd, exitCode });
    
    // 空闲超时：挂起型命令（如服务启动），返回已收集的输出作为部分结果
    if (idleTimeout) {
      sendAgentStreamDone(sessionId, execId, toolCallId, 0);
      console.log('[AgentExec] 空闲超时，返回部分结果（命令可能仍在后台运行）');
      const message = `命令仍在后台运行（已空闲超时，进程未终止）。\n\n执行期间输出:\n${stdoutCollected ? 'stdout:\n\`\`\`\n' + stdoutCollected + '\n\`\`\`' : '(无输出)'}${stderrCollected ? '\nstderr:\n\`\`\`\n' + stderrCollected + '\n\`\`\`' : ''}\n\n⚠️ 注意：此命令为挂起型进程（如服务/守护进程），进程仍在后台运行中。`;
      return {
        success: true,
        level: 'allow',
        execId,
        partial: true,
        stdout: stdoutCollected,
        stderr: stderrCollected,
        content: message,
        message,
        hint: '命令为挂起型进程，仍在后台运行',
        tool_call_id: toolCallId
      };
    }
    
    const hasExitCode = exitCode !== null && exitCode !== undefined;
    const isSuccess = hasExitCode && exitCode >= 0 && exitCode <= 127;
    const message = `命令执行完毕 ${hasExitCode ? '(exitCode: ' + exitCode + ')' : '(无 exitCode)'}\n\n${stdoutCollected ? '输出:\n```\n' + stdoutCollected + '\n```' : ''}${stderrCollected ? '\n[stderr]\n```\n' + stderrCollected + '\n```' : ''}${killed ? '\n⚠️ 命令因超时被强制终止' : ''}${!hasExitCode ? '\n⚠️ 代理未返回 exitCode' : ''}`;
    return {
      success: isSuccess,
      level: 'allow',
      execId,
      exitCode: hasExitCode ? exitCode : undefined,
      stdout: stdoutCollected,
      stderr: stderrCollected,
      killed,
      content: message,
      message,
      error: !isSuccess ? (hasExitCode ? `命令执行失败，exitCode: ${exitCode}` : '命令执行失败，代理未返回 exitCode') : undefined,
      tool_call_id: toolCallId
    };
  }

  const result = await executeWithCancel(sessionId, toolCallId,
    AgentClient.execCommandWait(command, cwd, effectiveForce, effectiveTimeout)
  );
  if (result.cancelled) {
    return { success: false, content: '命令已取消', error: '用户取消', tool_call_id: toolCallId };
  }
  return formatAgentExecResult(result.value, command, cwd, toolCallId);
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
  const isSuccess = hasExitCode && result.exitCode >= 0 && result.exitCode <= 127;
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
  const { path, pattern, filePattern, caseSensitive, recursive, maxResults, contextLines } = args;
  if (!path) return { success: false, error: '缺少 path 参数', tool_call_id: toolCallId };
  if (!pattern) return { success: false, error: '缺少 pattern 参数', tool_call_id: toolCallId };

  const result = await AgentClient.searchContent(
    path, pattern, filePattern || null,
    caseSensitive || false, recursive !== false, maxResults || 100,
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

// ==================== 剪贴板工具（使用 Offscreen Document） ====================

let creatingOffscreenDocument = null;

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['CLIPBOARD'],
    justification: '用于读写系统剪贴板内容'
  });

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

// ── 合并后的工具处理函数 ──

/**
 * page_content：合并 get_page_text/get_full_html/page_to_markdown/page_to_json
 * 根据 format 参数路由到对应的 content script 消息类型
 */
async function executeGetPageContent(args, toolCallId, _sessionId, sessionTabId) {
  const { format = 'text', selector, maxLength = 15000, tabId: argsTabId } = args;

  const messageTypeMap = {
    text: 'GET_PAGE_TEXT',
    html: 'GET_FULL_HTML'
  };

  const messageType = messageTypeMap[format];
  if (!messageType) {
    return { success: false, error: `不支持的格式: ${format}，可选: text, html`, tool_call_id: toolCallId };
  }

  try {
    const targetTabId = argsTabId || sessionTabId || await getActiveTabId();
    if (!targetTabId) {
      return { success: false, error: '没有可用的标签页', tool_call_id: toolCallId };
    }
    const message = { type: messageType, selector, maxLength };
    return await sendToContentScriptWithRetry(targetTabId, message, toolCallId);
  } catch (e) {
    return { success: false, error: e.message, tool_call_id: toolCallId };
  }
}

/**
 * extract_data：合并 extract_table/extract_metadata/extract_links/extract_forms/extract_images
 * 根据 dataType 参数路由到对应的 content script 消息类型
 */
async function executeExtractData(args, toolCallId, _sessionId, sessionTabId) {
  const {
    dataType,
    selector,
    filterType = 'all',
    includeHeaders = true,
    format = 'json',
    includeImages = false,
    minWidth = 0,
    minHeight = 0,
    maxResults = 100,
    tabId: argsTabId
  } = args;

  if (!dataType) {
    return { success: false, error: '缺少 dataType 参数', tool_call_id: toolCallId };
  }

  const messageTypeMap = {
    table: 'EXTRACT_TABLE',
    metadata: 'EXTRACT_METADATA',
    links: 'EXTRACT_LINKS',
    forms: 'EXTRACT_FORMS',
    images: 'EXTRACT_IMAGES'
  };

  const messageType = messageTypeMap[dataType];
  if (!messageType) {
    return { success: false, error: `不支持的数据类型: ${dataType}，可选: table, metadata, links, forms, images`, tool_call_id: toolCallId };
  }

  try {
    const targetTabId = argsTabId || sessionTabId || await getActiveTabId();
    if (!targetTabId) {
      return { success: false, error: '没有可用的标签页', tool_call_id: toolCallId };
    }

    const message = { type: messageType, selector, filterType, includeHeaders, format, includeImages, minWidth, minHeight, maxResults };
    return await sendToContentScriptWithRetry(targetTabId, message, toolCallId);
  } catch (e) {
    return { success: false, error: e.message, tool_call_id: toolCallId };
  }
}

/**
 * clipboard：合并 copy_to_clipboard/paste_from_clipboard/get_selected_content
 * 根据 action 参数路由到对应的处理器
 */
async function executeClipboard(args, toolCallId) {
  const { action, text, format = 'text' } = args;

  if (!action) {
    return { success: false, error: '缺少 action 参数', tool_call_id: toolCallId };
  }

  if (action === 'copy') {
    return executeCopyToClipboard({ text }, toolCallId);
  }

  if (action === 'paste') {
    return executePasteFromClipboard({}, toolCallId);
  }

  if (action === 'get_selected') {
    try {
      const tabId = await getActiveTabId();
      if (!tabId) {
        return { success: false, error: '没有可用的标签页', tool_call_id: toolCallId };
      }
      return await sendToContentScriptWithRetry(tabId, { type: 'GET_SELECTED_CONTENT', format }, toolCallId);
    } catch (e) {
      return { success: false, error: e.message, tool_call_id: toolCallId };
    }
  }

  return { success: false, error: `不支持的操作: ${action}，可选: copy, paste, get_selected`, tool_call_id: toolCallId };
}

export async function executeCopyToClipboard(args, toolCallId) {
  const { text } = args;
  if (text === undefined || text === null) {
    return { success: false, error: '缺少 text 参数', tool_call_id: toolCallId };
  }

  try {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      type: 'COPY_TO_CLIPBOARD',
      text: text
    });
    if (response?.success) {
      return { success: true, message: response.message || '已复制到剪贴板', tool_call_id: toolCallId };
    } else {
      return { success: false, error: response?.error || '复制失败', tool_call_id: toolCallId };
    }
  } catch (e) {
    return { success: false, error: e.message, tool_call_id: toolCallId };
  }
}

export async function executePasteFromClipboard(args, toolCallId) {
  try {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      type: 'PASTE_FROM_CLIPBOARD'
    });
    if (response?.success) {
      return { success: true, text: response.text, tool_call_id: toolCallId };
    } else {
      return { success: false, error: response?.error || '粘贴失败', tool_call_id: toolCallId };
    }
  } catch (e) {
    return { success: false, error: e.message, tool_call_id: toolCallId };
  }
}

/**
 * 取消指定会话中正在运行的 Agent 命令
 * @param {string} sessionId - 会话 ID
 * @param {string} [mode='kill'] - 终止模式
 *   - 'kill': 关闭 WebSocket + 停止命令进程（默认）
 *   - 'wait': 仅关闭 WebSocket，进程继续运行
 */
export async function cancelRunningAgentCommands(sessionId, mode = 'kill') {
  console.log('[Background] 取消运行中的 Agent 命令，sessionId:', sessionId, 'mode:', mode);
  
  // 在全局 Set 中标记为已取消
  cancelledSessions.add(sessionId);
  
  const entry = runningAgentCommands.get(sessionId);
  if (!entry) {
    console.warn('[Background] runningAgentCommands 中未找到 entry:', sessionId);
    setTimeout(() => { cancelledSessions.delete(sessionId); }, 3000);
    return;
  }
  
  const { execId, ws, resolve, toolCallId } = entry;
  console.log('[Background] 找到运行中的命令，execId:', execId);
  
  // 清理 Map，防止重复触发
  runningAgentCommands.delete(sessionId);
  
  // ★ 先发送"执行完毕"消息给 UI，让界面停止显示"执行中"
  sendAgentStreamDone(sessionId, execId, toolCallId, -1);
  
  // ★ 直接 resolve Promise，不等待 WebSocket 事件
  // 无论 WebSocket 是否报错、onclose/onerror 是否触发，Promise 都会被 resolve
  if (resolve) {
    resolve();
    console.log('[Background] Promise 已直接 resolve，任务继续执行');
  }
  
  // 关闭 WebSocket（后台操作，可能触发 onclose/onerror，但不影响已 resolve 的 Promise）
  try { ws.close(); } catch (e) { /* ignore */ }
  
  // 异步停止进程，不阻塞返回
  if (mode === 'kill') {
    AgentClient.stopCommand(execId).then(() => {
      console.log('[Background] 已停止 Agent 命令进程:', execId);
    }).catch((err) => {
      console.warn('[Background] 停止 Agent 命令进程失败:', err.message);
    });
  } else {
    console.log('[Background] 仅断开 WebSocket，命令进程继续运行:', execId);
  }
  
  // 延迟清理取消标记
  setTimeout(() => {
    cancelledSessions.delete(sessionId);
  }, 3000);
}

// ========== 本地代理管理工具 ==========

/**
 * agent_list - 查询所有已配对的本地代理及其状态
 */
async function executeAgentList(args, toolCallId) {
  try {
    const agents = await AgentClient.getPairedAgents();
    const activeAgent = await AgentClient.getActiveAgent();
    
    const list = [];
    for (const agent of agents) {
      const reachable = AgentClient.isAgentReachable(agent.id);
      list.push({
        id: agent.id,
        name: agent.name,
        url: agent.url,
        reachable: reachable,           // null=未知, true=在线, false=离线
        disabled: agent.disabled || false,
        isActive: activeAgent?.id === agent.id
      });
    }
    
    const summary = list.map(a => {
      const status = a.disabled ? '已停用' : (a.reachable === true ? '在线' : a.reachable === false ? '离线' : '状态未知');
      const activeMark = a.isActive ? ' ★当前活跃' : '';
      return `- ${a.name} (${a.id}): ${status}${activeMark}`;
    }).join('\n');
    
    return {
      success: true,
      content: `已配对代理列表：\n${summary}\n\n完整数据：${JSON.stringify(list, null, 2)}`,
      agents: list,
      activeAgentId: activeAgent?.id || null,
      tool_call_id: toolCallId
    };
  } catch (err) {
    return { success: false, error: `查询代理列表失败: ${err.message}`, tool_call_id: toolCallId };
  }
}

/**
 * agent_switch - 切换到指定的本地代理
 */
async function executeAgentSwitch(args, toolCallId) {
  const { agentId, agentName } = args;
  
  if (!agentId && !agentName) {
    return { success: false, error: '请提供 agentId 或 agentName 参数', tool_call_id: toolCallId };
  }
  
  try {
    const agents = await AgentClient.getPairedAgents();
    
    let targetAgent;
    if (agentId) {
      targetAgent = agents.find(a => a.id === agentId);
    }
    if (!targetAgent && agentName) {
      // 精确匹配
      targetAgent = agents.find(a => a.name === agentName);
      // 模糊匹配
      if (!targetAgent) {
        targetAgent = agents.find(a => a.name && a.name.toLowerCase().includes(agentName.toLowerCase()));
      }
    }
    
    if (!targetAgent) {
      const availableList = agents.map(a => `- ${a.name} (${a.id})`).join('\n');
      return {
        success: false,
        error: `未找到代理 "${agentId || agentName}"。当前可用的代理：\n${availableList}`,
        tool_call_id: toolCallId
      };
    }
    
    if (targetAgent.disabled) {
      return {
        success: false,
        error: `代理 "${targetAgent.name}" 已停用，请先启用后再切换`,
        tool_call_id: toolCallId
      };
    }
    
    const switched = await AgentClient.switchActiveAgent(targetAgent.id);
    if (!switched) {
      return {
        success: false,
        error: `切换到代理 "${targetAgent.name}" 失败`,
        tool_call_id: toolCallId
      };
    }
    
    const reachable = AgentClient.isAgentReachable(targetAgent.id);
    const warning = reachable !== true ? `（注意：该代理当前离线）` : '';
    
    return {
      success: true,
      content: `已成功切换到代理 "${targetAgent.name}" (${targetAgent.id})${warning}`,
      agentId: targetAgent.id,
      agentName: targetAgent.name,
      offline: reachable !== true,
      tool_call_id: toolCallId
    };
  } catch (err) {
    return { success: false, error: `切换代理失败: ${err.message}`, tool_call_id: toolCallId };
  }
}
