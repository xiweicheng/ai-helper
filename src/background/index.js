// background/index.js - Service Worker 入口文件

import { cancelReactLoop, resetDialogApiCallCount, incrementDialogApiCallCount, getDialogApiCallCount, abortCurrentTool } from './state.js';
import { getStoredConfig, getChatConfig } from './config.js';
import { getTools, clearAgentConnectivityCache, loadMcpTools, unloadMcpTools, cancelRunningAgentCommands, clearSkillLoadCache } from './tool-executor.js';
import { RAW_TOOLS } from './constants.js';
import { reactLoop, callApiNonStream, activeReactLoops, resumeReactLoopFromCheckpoint } from './react-loop.js';
import { preselectTools } from './tool-preselector.js';
import { recordTokenUsage } from './token-recorder.js';
import * as AgentClient from './local-agent-client.js';
import { getReactCheckpoint, deleteReactCheckpoint, cleanupExpiredReactCheckpoints, getAllReactCheckpoints } from '../storage/db.js';
import { readMemoryFile } from './tool-memory.js';
import logger from '../shared/logger.js';
import { initI18n, t, registerTranslations } from '../shared/i18n.js';

// 背景脚本自注册翻译
registerTranslations('zh', { 
  bg: { 
    missingSessionId: '缺少 sessionId',
    resumingFromCheckpoint: '从 checkpoint 恢复中...',
    checkpointNotFound: '未找到可恢复的任务 checkpoint，可能已过期或被清理。请检查 Service Worker 控制台中的诊断日志（搜索 "checkpoint" 关键字）。',
    resumeFailed: '恢复失败',
    missingSkillName: '缺少技能名称',
    fetchFailed: '获取失败',
    preparing: '准备中...',
    toolPreselect: '工具预筛选',
    requestCancelled: '请求已被用户取消',
    reactCancelled: 'ReAct 循环已被用户取消',
    apiCallFailed: 'API 调用失败',
  } 
});
registerTranslations('en', { 
  bg: { 
    missingSessionId: 'Missing sessionId',
    resumingFromCheckpoint: 'Resuming from checkpoint...',
    checkpointNotFound: 'No checkpoint found for resumption. It may have expired or been cleaned. Check Service Worker console logs (search "checkpoint").',
    resumeFailed: 'Resume failed',
    missingSkillName: 'Missing skill name',
    fetchFailed: 'Fetch failed',
    preparing: 'Preparing...',
    toolPreselect: 'Tool Pre-filter',
    requestCancelled: 'Request was cancelled by user',
    reactCancelled: 'ReAct loop was cancelled by user',
  } 
});

// 初始化国际化（读取语言偏好，供 local-agent-client 设置 Accept-Language 头）
initI18n();

// SW 启动时清理过期的 ReAct checkpoint（TTL: 7 天）
// 同时作为 DB 自检：验证 reactCheckpoints store 可访问（若 store 不存在会触发 retry 重建连接）
// 同时执行旧格式 Agent 数据迁移
Promise.all([
  cleanupExpiredReactCheckpoints().then(() => getAllReactCheckpoints()),
  AgentClient.migrateFromLegacyFormat()
])
  .then(([all, migrated]) => {
    logger.debug(`[Background] DB self-check passed,current has  ${all.length}  checkpoint` + (migrated ? ',completedoldformat Agent migrate' : ''));
  })
  .catch(err => {
    logger.warn('[Background] cleanup expired checkpoint  or  DB self-check failed:', err);
  });

// chrome.runtime.sendMessage 单条消息最大 64MiB，此常量用于截断大消息
const MAX_LOG_ENTRIES_FOR_MSG = 1000;

// MCP 工具查询缓存，避免每次 GET_MCP_TOOLS 都向 Agent 发网络请求
let mcpToolsCache = null;

// Agent Skill Prompts 缓存
let skillPromptsCache = null;

// SW 存活保持：side panel 通过 chrome.runtime.connect 建立长连接，
// 防止 API 调用期间 Chrome 判定 SW 空闲而将其杀死
const keepalivePorts = new Map(); // sessionId -> Port

chrome.runtime.onConnect.addListener(async (port) => {
  if (port.name?.startsWith('keepalive-')) {
    const sessionId = port.name.replace('keepalive-', '');
    // 判断是否为重连（SW 重启后的重连），而非首次连接
    const isReconnection = keepalivePorts.has(sessionId);
    keepalivePorts.set(sessionId, port);
    logger.debug('[Background] keepalive portconnected, sessionId:', sessionId, isReconnection ? '(reconnect)' : '(first times)');

    // SW 静默重启检测：仅在重连时检测，避免首次连接时 activeReactLoops 尚未初始化导致的误报
    if (isReconnection && !activeReactLoops.has(sessionId)) {
      logger.warn('[Background] ⚠️ detected SW re started,sessionId', sessionId, '  API call lost');
      // 检查是否存在 checkpoint，若存在则在通知中带上元数据，供前端展示"继续执行"按钮
      let checkpointMeta = null;
      try {
        const cp = await getReactCheckpoint(sessionId);
        if (cp) {
          checkpointMeta = {
            iteration: cp.iteration,
            interruptedReason: cp.interruptedReason,
            updatedAt: cp.updatedAt,
            messageCount: cp.currentMessages?.length || 0,
            subtaskPlan: cp.subtaskPlan ? { subtaskCount: cp.subtaskPlan.subtasks?.length || 0 } : null,
          };
          logger.debug('[Background] detected recoverable checkpoint:', checkpointMeta);
        }
      } catch (e) {
        logger.warn('[Background] read checkpoint failed:', e.message);
      }
      try {
        port.postMessage({ type: 'SW_RESTARTED', sessionId, checkpoint: checkpointMeta });
      } catch (e) {
        logger.warn('[Background] send SW_RESTARTED message failed:', e.message);
      }
    }

    port.onDisconnect.addListener(() => {
      keepalivePorts.delete(sessionId);
      logger.debug('[Background] keepalive port disconnected, sessionId:', sessionId);
    });
  }
});

// ==================== Side Panel 路由配置 ====================

/**
 * Side Panel 路由配置
 * Chrome 114+ 使用 side_panel.open() API
 */
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });

// 监听标签页变化，确保 Side Panel 可以正确打开
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    chrome.sidePanel?.setOptions?.({
      enabled: true
    });
  }
});

// ==================== 全局快捷键：切换 Side Panel ====================
//
// Chrome sidePanel API 只提供 open() 没有 close()/toggle()，这里通过
// chrome.extension.getViews({ type: 'side_panel' }) 同步判断当前是否打开：
//   - 已打开：发 CLOSE_SIDEPANEL 消息让 Side Panel 页面调用 window.close()
//   - 未打开：直接调 chrome.sidePanel.open()
// onCommand 事件本身是用户手势，满足 sidePanel.open() 的调用前提
chrome.commands?.onCommand?.addListener((command) => {
  if (command !== '_toggle_sidepanel') return;
  try {
    const views = chrome.extension.getViews({ type: 'side_panel' });
    if (views.length > 0) {
      // 已打开 → 通知 Side Panel 关闭自身
      chrome.runtime.sendMessage({ type: 'CLOSE_SIDEPANEL' }).catch((e) => {
        logger.warn('[Background] send CLOSE_SIDEPANEL failed:', e?.message);
      });
    } else {
      // 未打开 → 打开（onCommand 事件即用户手势）
      chrome.sidePanel?.open?.().catch((e) => {
        logger.warn('[Background] open sidePanel failed:', e?.message);
      });
    }
  } catch (e) {
    logger.warn('[Background] toggle sidePanel exception:', e?.message);
  }
});

// ==================== 消息路由表 ====================
//
// 所有消息类型通过 if-chain 分发（非 switch），按频率排序：
//
// | 消息类型                      | 来源        | 用途                       | 异步 |
// |-------------------------------|-------------|---------------------------|------|
// | CANCEL_REACT                  | side_panel  | 取消 ReAct 循环             | 否   |
// | TERMINATE_COMMAND             | side_panel  | 终止命令（不取消 ReAct）     | 否   |
// | RELOAD_MCP_TOOLS              | side_panel  | 强制重载 MCP 工具列表        | 是   |
// | GET_MCP_TOOLS                 | side_panel  | 获取 MCP 工具（30s 缓存）    | 是   |
// | GET_AGENT_SKILL_PROMPTS       | side_panel  | 获取 Skill Prompt（60s 缓存）| 是   |
// | GET_SKILL_LIST                | side_panel  | 获取 Skill 列表             | 是   |
// | CAPTURE_TAB                   | side_panel  | 截取可见标签页              | 是   |
// | CAPTURE_TAB_FROM_PAGE         | content     | 页面快捷键触发全屏截图       | 是   |
// | CAPTURE_REGION_FROM_PAGE      | content     | 页面快捷键触发区域截图       | 是   |
// | CALL_API                      | side_panel  | 主 API 调用入口             | 否   |
// | GET_SESSION                   | side_panel  | 获取当前模型配置            | 是   |
// | GET_CHAT_CONFIG               | side_panel  | 获取聊天完整配置            | 是   |
// | OPEN_OPTIONS_PAGE             | side_panel  | 打开配置页面                | 否   |
// | SELECTION_TOOLBAR_ACTION      | content     | 划词工具栏操作（ai-search/explain/translate/summary）| 否 |
// | FILL_SIDEPANEL_INPUT          | content     | 追问：填充输入框             | 否   |
// | DIRECT_SEND                   | content     | 追问：直接发送文本           | 否   |
// | GENERATE_PDF                  | content     | CDP 生成 PDF               | 是   |
// | TRIGGER_AGENT_HEALTH_CHECK    | side_panel  | 手动触发 Agent 健康检查      | 否   |
// | AGENT_CONNECTION_CHANGED      | options     | Agent 配对状态变更通知       | 否   |
// | OPTIONS_PAGE_OPEN             | options     | 配置页面已打开，触发全量心跳  | 否   |
// | OPTIONS_PAGE_CLOSED           | options     | 配置页面已关闭，仅维护活跃代理 | 否   |
// | OPEN_LOCAL_PROTOTYPE          | side_panel  | 本地浏览器打开原型文件        | 是   |
// | DELETE_LOCAL_PROTOTYPE        | side_panel  | 删除本地原型文件             | 是   |
//
// ==================== 消息监听 ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'IFRAME_SELECTION') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'IFRAME_SELECTION',
        text: message.text,
        x: message.x,
        y: message.y
      }, { frameId: 0 }).catch(() => {});
    }
    return false;
  }

  if (message.type === 'IFRAME_CLICK_DISMISS') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: 'IFRAME_CLICK_DISMISS' }).catch(() => {});
    }
    return false;
  }

  if (message.type === 'IFRAME_SELECTION_CLEAR') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: 'IFRAME_SELECTION_CLEAR' }).catch(() => {});
    }
    return false;
  }

  if (message.type === 'CANCEL_REACT') {
    const { tabId, sessionId } = message;
    // 优先使用 sessionId，兼容旧版 tabId
    if (sessionId) {
      cancelReactLoop(sessionId);
      cancelRunningAgentCommands(sessionId);  // 关闭正在运行的命令 WebSocket + 杀进程
    } else {
      cancelReactLoop(tabId);
    }
    return false;
  }

  // 查询指定会话是否存在可恢复的 ReAct checkpoint
  // 前端加载会话时调用，用于决定是否展示"继续执行"按钮
  if (message.type === 'GET_CHECKPOINT') {
    const { sessionId } = message;
    if (!sessionId) {
      sendResponse({ exists: false });
      return false;
    }
    getReactCheckpoint(sessionId).then(cp => {
      if (!cp) {
        sendResponse({ exists: false });
        return;
      }
      sendResponse({
        exists: true,
        checkpoint: {
          iteration: cp.iteration,
          interruptedReason: cp.interruptedReason,
          updatedAt: cp.updatedAt,
          messageCount: cp.currentMessages?.length || 0,
          subtaskPlan: cp.subtaskPlan ? { subtaskCount: cp.subtaskPlan.subtasks?.length || 0 } : null,
        }
      });
    }).catch(err => {
      logger.warn('[Background] GET_CHECKPOINT query failed:', err);
      sendResponse({ exists: false });
    });
    return true;  // 异步响应
  }

  // 删除指定会话的 checkpoint（用户主动放弃恢复时调用）
  if (message.type === 'DELETE_CHECKPOINT') {
    const { sessionId } = message;
    if (sessionId) {
      deleteReactCheckpoint(sessionId).then(ok => {
        sendResponse({ success: ok });
      }).catch(err => {
        logger.warn('[Background] DELETE_CHECKPOINT failed:', err);
        sendResponse({ success: false });
      });
    } else {
      sendResponse({ success: false });
    }
    return true;
  }

  // 从 checkpoint 恢复 ReAct 循环
  // 与 CALL_API 类似的消息流，但使用 checkpoint 中的 currentMessages 作为初始消息
  if (message.type === 'RESUME_REACT') {
    const { sessionId, callId: resumeCallId, userGuidance = '' } = message;
    if (!sessionId) {
      sendResponse({ error: t('bg.missingSessionId') });
      return false;
    }

    logger.debug('[Background] recei to  RESUME_REACT,sessionId:', sessionId, 'userGuidance:', userGuidance ? `"${userGuidance.substring(0, 50)}..."` : '( no )');

    // 如果旧任务仍在运行（页面刷新后 SW 中的 reactLoop 可能还在），
    // 先取消旧任务，避免两个 reactLoop 同时运行导致状态冲突
    const cancelOldTask = activeReactLoops.has(sessionId);

    const doResume = () => {
      // 重置 API 调用计数器（恢复视为新的一轮 API 调用起点）
      resetDialogApiCallCount(sessionId);

      // 立即发送初始状态
      const initialStatus = {
        type: 'EXECUTION_STATUS_UPDATE',
        nodeName: t('bg.resumingFromCheckpoint'),
        status: 'processing',
        executionLog: [],
        sessionId,
      };
      if (resumeCallId) {
        initialStatus.callId = resumeCallId;
      }
      chrome.runtime.sendMessage(initialStatus).catch(() => {});

      // 关键：将 resumeCallId 传递给 resumeReactLoopFromCheckpoint，
      // 确保 reactLoop 内部的 StreamController 使用新的 callId 发送 STREAM_* 消息，
      // 与前端 listener 的 myCallId 匹配，否则流式消息会被过滤掉
      resumeReactLoopFromCheckpoint(sessionId, userGuidance, resumeCallId)
        .then(result => {
        // checkpoint 不存在或恢复失败返回 null
        if (!result) {
          logger.warn('[Background] RESUME_REACT: not found checkpoint  or restore failed');
          // 收集诊断信息，帮助定位问题
          getReactCheckpoint(sessionId).then(cp => {
            logger.warn('[Background] RESUME_REACT: re-query checkpoint result:', cp ? 'exists' : 'not found');
          }).catch(() => {});
          chrome.runtime.sendMessage({
            type: 'API_ERROR',
            sessionId,
            callId: resumeCallId,
            error: t('bg.checkpointNotFound'),
            executionLog: [],
            resumed: true,
          }).catch(() => {});
          return;
        }
        logger.debug('[Background] RESUME_REACT complete,content length:', result.content?.length);
        const truncatedLog = (result.executionLog || []).length > MAX_LOG_ENTRIES_FOR_MSG
          ? result.executionLog.slice(-MAX_LOG_ENTRIES_FOR_MSG)
          : (result.executionLog || []);
        chrome.runtime.sendMessage({
          type: 'API_COMPLETE',
          sessionId,
          callId: resumeCallId,
          content: result.content || '',
          executionLog: truncatedLog,
          reflectionScore: result.reflectionScore,
          reasoningContent: result.reasoningContent || null,
          wasRevised: result.wasRevised || false,
          resumed: true,  // 标记为恢复的任务
        }).catch(err => {
          logger.warn('[Background] send RESUME completemessage failed:', err);
        });
      })
      .catch(error => {
        const isAborted = error.name === 'AbortError' || error.message === t('bg.requestCancelled') || error.message === t('bg.reactCancelled');
        logger.debug('[Background] RESUME_REACT failed:', isAborted ? '(usercancel)' : error.message);
        const errLog = error.executionLog || [];
        const truncatedErrLog = errLog.length > MAX_LOG_ENTRIES_FOR_MSG ? errLog.slice(-MAX_LOG_ENTRIES_FOR_MSG) : errLog;
        chrome.runtime.sendMessage({
          type: 'API_ERROR',
          sessionId,
          callId: resumeCallId,
          error: error.message || t('bg.resumeFailed'),
          executionLog: truncatedErrLog,
          resumed: true,
        }).catch(() => {});
      });
    };  // doResume 函数结束

    if (cancelOldTask) {
      logger.debug('[Background] RESUME_REACT: detectedoldtaskstill running , first cancel');
      cancelReactLoop(sessionId);
      cancelRunningAgentCommands(sessionId);
      // 给旧任务一点时间清理后再恢复
      setTimeout(doResume, 300);
    } else {
      doResume();
    }

    return false;  // 异步通过 sendMessage 回传结果
  }

  if (message.type === 'TERMINATE_COMMAND') {
    const { sessionId, mode } = message;
    // 终止当前会话正在运行的命令（不取消 ReAct 循环）
    if (sessionId) {
      cancelRunningAgentCommands(sessionId, mode || 'kill');
    }
    return false;
  }

  if (message.type === 'ABORT_CURRENT_TOOL') {
    const { sessionId } = message;
    // 终止当前工具的执行等待（不取消 ReAct 循环，不杀进程）
    const aborted = abortCurrentTool(sessionId);
    sendResponse({ success: aborted });
    return false;
  }

  if (message.type === 'RELOAD_MCP_TOOLS') {
    mcpToolsCache = null; // 强制刷新缓存
    loadMcpTools().then(count => {
      sendResponse({ success: true, count });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_MCP_TOOLS') {
    // 带缓存的重载：30 秒内复用上次结果，避免每次查询都向 Agent 发网络请求
    const now = Date.now();
    if (mcpToolsCache && (now - mcpToolsCache.loadedAt) < 30000) {
      logger.debug(`[Background] GET_MCP_TOOLS usingcache (${mcpToolsCache.tools.length} tool,${Math.round((now - mcpToolsCache.loadedAt) / 1000)}s  before )`);
      sendResponse({ success: true, tools: mcpToolsCache.tools });
      return true;
    }
    loadMcpTools().then(count => {
      const mcpTools = RAW_TOOLS
        .filter(t => t.id.startsWith('mcp_'))
        .map(t => ({
          id: t.id,
          name: t.function?.name || t.id,
          description: t.function?.description || '',
          category: t.category || 'mcp',
          execution: t.execution || 'background',
          parallelizable: t.parallelizable !== false,
          requiresConfirmation: t.requiresConfirmation || false,
          enabled: true
        }));
      mcpToolsCache = { tools: mcpTools, loadedAt: Date.now() };
      logger.debug(`[Background] GET_MCP_TOOLS return ${mcpTools.length} tool ( reloads ${count} )`);
      sendResponse({ success: true, tools: mcpTools });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_AGENT_SKILL_PROMPTS') {
    // 带缓存：60 秒内复用上次结果（未指定 skillNames 时）
    const now = Date.now();
    const skillNames = message.skillNames || null;
    // 如果指定了 skillNames，不使用缓存（因为过滤条件不同）
    if (!skillNames && skillPromptsCache && (now - skillPromptsCache.loadedAt) < 60000) {
      sendResponse({ success: true, prompts: skillPromptsCache.prompts });
      return true;
    }
    
    const fetchPrompts = skillNames && skillNames.length > 0
      ? AgentClient.getAgentSkillPromptsFiltered(skillNames)
      : AgentClient.getAgentSkillPrompts();
    
    fetchPrompts.then(result => {
      const prompts = result.success ? (result.prompts || '') : '';
      // 仅全量请求时缓存（过滤请求不缓存）
      if (!skillNames) {
        skillPromptsCache = { prompts, loadedAt: Date.now() };
      }
      sendResponse({ success: true, prompts });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_AGENT_SKILL_PROMPT') {
    // 获取单个 Agent Skill 的完整 Prompt 内容（供 side_panel 选择技能后直接注入用户消息）
    const name = message.name;
    if (!name) {
      sendResponse({ success: false, error: t('bg.missingSkillName') });
      return true;
    }
    AgentClient.getAgentSkillPrompt(name).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_SKILL_LIST') {
    // 获取技能列表（供 side_panel 技能选择器使用）
    AgentClient.getSkillList().then(result => {
      if (result?.success) {
        sendResponse({ success: true, skills: result.skills || [] });
      } else {
        sendResponse({ success: false, skills: [], error: result?.error || t('bg.fetchFailed') });
      }
    }).catch(err => {
      sendResponse({ success: false, skills: [], error: err.message });
    });
    return true;
  }
  
  if (message.type === 'CAPTURE_TAB') {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 100 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        logger.error('[Background] screenshot failed:', chrome.runtime.lastError.message);
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // 异步响应
  }

  if (message.type === 'CAPTURE_TAB_FROM_PAGE') {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 100 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        logger.error('[Background] pageshortcutscreenshot failed:', chrome.runtime.lastError.message);
      } else {
        chrome.runtime.sendMessage({ type: 'SCREENSHOT_RESULT', dataUrl, mode: 'full' }).catch(() => {});
      }
    });
    return true;
  }

  if (message.type === 'CAPTURE_REGION_FROM_PAGE') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      return false;
    }
    chrome.tabs.sendMessage(tabId, { type: 'START_REGION_SELECTION' }, (rect) => {
      if (!rect) {
        return;
      }
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          logger.error('[Background] region screenshot failed:', chrome.runtime.lastError.message);
        } else {
          chrome.runtime.sendMessage({ type: 'SCREENSHOT_RESULT', dataUrl, mode: 'region', rect }).catch(() => {});
        }
      });
    });
    return true;
  }
  
  if (message.type === 'CALL_API') {
    const { messages, model, useTools, tabId, apiParams, sessionId, imageApiBase, imageApiKey, agentId, agentToolIds, agentSkillIds, callId } = message;

    // 将图片识别独立配置合并到 apiParams 中
    if (imageApiBase) {
      apiParams.imageApiBase = imageApiBase;
    }
    if (imageApiKey) {
      apiParams.imageApiKey = imageApiKey;
    }

    // 重置当前会话的 API 调用计数器
    resetDialogApiCallCount(sessionId);

    // 注意：不再在此处删除旧 checkpoint。
    // 原因：deleteReactCheckpoint 是异步的，可能与 reactLoop 内部的 saveCheckpointNow 产生竞态条件
    // （delete 在 save 之后执行，导致新保存的 checkpoint 被误删）。
    // saveCheckpointNow 使用 store.put()（覆盖写），会自动替换旧 checkpoint，无需预先删除。
    
    // 立即发送初始状态更新，避免用户在工具预筛选等前置步骤期间看不到任何反馈
    const initialStatus = {
      type: 'EXECUTION_STATUS_UPDATE',
      nodeName: t('bg.preparing'),
      status: 'processing',
      executionLog: []
    };
    if (sessionId) {
      initialStatus.sessionId = sessionId;
    }
    if (callId) {
      initialStatus.callId = callId;
    }
    chrome.runtime.sendMessage(initialStatus).catch(() => {});
    
    logger.debug('[Background] recei to  CALL_API message,sessionId:', sessionId, 'useTools:', useTools, 'tabId:', tabId, 'apiParams:', apiParams);
    
    const apiCall = useTools 
      ? (async () => {
          const tools = await getTools(agentToolIds, agentId, agentSkillIds);

          // 工具开关打开但实际没有可用工具，跳过预筛选，直接普通对话
          if (tools.length === 0) {
            logger.debug('[Background] no available tools, skip pre-filter, direct normal conversation');
            return callApiNonStream(messages, model, apiParams, sessionId, {}, callId);
          }

          logger.debug(`[Background] get to  ${tools.length} tool`);

          // 检查工具预筛选开关
          const config = await getStoredConfig();
          const enableToolPreselect = config.reactConfig.enableToolPreselect;

          // 预筛选工具：通过前置规划调用减少不必要的工具传递
          let preselection;
          if (enableToolPreselect) {
            preselection = await preselectTools(messages, model, tools, apiParams);
          } else {
            logger.debug('[Background] toolpre-filterclosed,using alltool');
            preselection = {
              type: 'tools',
              tools,
              executionLog: []
            };
          }

          // 发送预筛选完成状态，让实时日志面板也能看到这个步骤
          if (preselection.executionLog.length > 0) {
            const statusUpdate = {
              type: 'EXECUTION_STATUS_UPDATE',
              nodeName: t('bg.toolPreselect'),
              status: 'success',
              executionLog: preselection.executionLog
            };
            if (sessionId) {
              statusUpdate.sessionId = sessionId;
            }
            if (callId) {
              statusUpdate.callId = callId;
            }
            logger.debug('[Background] sendpre-filterstateupdate:', statusUpdate);
            chrome.runtime.sendMessage(statusUpdate).then(() => {
              logger.debug('[Background] pre-filterstateupdatesend successful');
            }).catch(err => {
              logger.error('[Background] pre-filterstateupdatesend failed:', err);
            });
          }

          // 模型直接回答了，无需再调主力模型
          if (preselection.type === 'answer') {
            logger.debug('[Background] pre-filtermodeldirect answer,skip mainmodelcall with ');
            return { content: preselection.content, executionLog: preselection.executionLog };
          }

          const { tools: selectedTools, executionLog: preselectLog } = preselection;
          logger.debug(`[Background] after pre-filter ${selectedTools.length} tool`);
          logger.debug('[Background] pre-filter executionlog:', JSON.stringify(preselectLog).substring(0, 500));

          // 发送预筛选日志到 Side Panel，使其在流式输出过程中也能看到
          if (preselectLog.length > 0) {
            chrome.runtime.sendMessage({
              type: 'STREAM_PRESELECT',
              sessionId: sessionId,
              callId: callId,
              preselectLog: preselectLog
            }).catch(() => {});
          }

          // 自动预加载长期记忆：检查 messages 中是否已有记忆内容，避免重复注入
          const reactResult = await reactLoop(messages, model, selectedTools, tabId, apiParams, sessionId, null, null, { value: 1 }, preselectLog, callId);
          logger.debug('[Background] ReAct complete,executionLog total:', reactResult.executionLog?.length);
          return {
            content: reactResult.content !== undefined ? reactResult.content : reactResult,
            executionLog: reactResult.executionLog || preselectLog,
            reflectionScore: reactResult.reflectionScore,
            wasRevised: reactResult.wasRevised || false,
            reasoningContent: reactResult.reasoningContent || null
          };
        })()
      : callApiNonStream(messages, model, apiParams, sessionId);
    
    apiCall
      .then(result => {
        // 兼容两种返回格式：{ content, executionLog } 或 { content, usage }
        const content = result.content !== undefined ? result.content : result;
        let executionLog = result.executionLog || [];
        const reflectionScore = result.reflectionScore;
        const wasRevised = result.wasRevised || false;
        const reasoningContent = result.reasoningContent || null;

        // 记录非 ReAct 模式的 token 使用统计
        if (result.usage) {
          recordTokenUsage({
            sessionId,
            model: model || '',
            usage: result.usage,
            callType: 'non_stream'
          }).catch(() => {});

          // 非 ReAct 模式下，将 usage 包装为 executionLog 条目，确保前端能展示 Token 消耗标签
          if (executionLog.length === 0) {
            executionLog = [{
              nodeType: 'api_call',
              nodeName: 'API Call',
              status: 'success',
              timestamp: new Date().toISOString(),
              apiResponse: { tokenUsage: result.usage }
            }];
          }
        }
        
        logger.debug('[Background] API call complete,content length:', content.length, 'execution logcount:', executionLog.length);
        console.log('[Background API_COMPLETE] useTools:', useTools, '| executionLog entries:', executionLog.length, '| agent_file entries:', executionLog.filter(e => e.nodeType === 'tool_exec' && e.action?.name === 'agent_file').length, '| first few types:', executionLog.slice(0, 5).map(e => `${e.nodeType}${e.action ? `(${e.action.name})` : ''}`));
        // 安全截断：防止 executionLog 超过 chrome.runtime.sendMessage 的 64MiB 限制
        const truncatedLog = executionLog.length > MAX_LOG_ENTRIES_FOR_MSG
          ? executionLog.slice(-MAX_LOG_ENTRIES_FOR_MSG)
          : executionLog;
        chrome.runtime.sendMessage({
          type: 'API_COMPLETE',
          sessionId: sessionId,
          callId: callId,
          content: content,
          executionLog: truncatedLog,
          reflectionScore: reflectionScore,
          reasoningContent: reasoningContent,
          wasRevised: wasRevised
        }).catch(err => {
          logger.warn('[Background] send backmessage failed:', err);
        });
      })
      .catch(error => {
        const isAborted = error.name === 'AbortError' || error.message === t('bg.requestCancelled') || error.message === t('bg.reactCancelled');
        if (isAborted) {
          logger.debug('[Background] API call with by usercancel');
        } else {
          logger.error('[Background] API call with failed:', error.message || error);
        }
        // 获取 executionLog（如果可用），安全截断防止 64MiB 限制
        const errExecutionLog = error.executionLog || [];
        const truncatedErrLog = errExecutionLog.length > MAX_LOG_ENTRIES_FOR_MSG
          ? errExecutionLog.slice(-MAX_LOG_ENTRIES_FOR_MSG)
          : errExecutionLog;
        chrome.runtime.sendMessage({
          type: 'API_ERROR',
          sessionId: sessionId,
          callId: callId,
          error: error.message || t('bg.apiCallFailed'),
          executionLog: truncatedErrLog
        }).catch(err => {
          logger.warn('[Background] send errormessage failed:', err);
        });
      });
    
    return false;
  }
  
  if (message.type === 'GET_SESSION') {
    getStoredConfig().then((config) => {
      sendResponse({
        modelName: config.modelName
      });
    });
    return true;
  }
  
  if (message.type === 'GET_CHAT_CONFIG') {
    getChatConfig().then((config) => {
      sendResponse(config);
    });
    return true;
  }

  // 获取永久记忆（注意事项），用于注入系统提示词
  if (message.type === 'GET_PERMANENT_NOTES') {
    readMemoryFile()
      .then((result) => {
        if (!result.success) {
          sendResponse({ success: false, facts: [], error: result.error });
          return;
        }
        // 只返回 fact 类型记忆（永久注意事项），按重要性降序排列
        const facts = (result.data.facts || [])
          .sort((a, b) => (b.importance || 0) - (a.importance || 0));
        sendResponse({ success: true, facts });
      })
      .catch((err) => {
        sendResponse({ success: false, facts: [], error: err.message });
      });
    return true;
  }
  
  // 打开配置页面
  if (message.type === 'OPEN_OPTIONS_PAGE') {
    const targetHash = message.hash || '';
    chrome.runtime.openOptionsPage(() => {
      if (targetHash) {
        // 找到 options 页面并设置 hash
        chrome.tabs.query({ url: chrome.runtime.getURL('options.html') + '*' }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { url: chrome.runtime.getURL('options.html') + '#' + targetHash });
          }
        });
      }
    });
    return false;
  }
  // 选中文本工具栏操作
  if (message.type === 'SELECTION_TOOLBAR_ACTION') {
    const { prompt, action, text, systemPrompt } = message;
    const tabId = sender.tab?.id;
    const frameId = sender.frameId;
    
    logger.debug('[Background] received selected text toolbar operation:', action, 'tabId:', tabId);
    
    // AI搜索：打开侧边栏，在侧边栏中发起搜索
    if (action === 'ai-search') {
      // 在消息处理器中直接调用 sidePanel.open（必须在任何 await 之前，保留用户手势上下文）
      if (tabId) {
        chrome.sidePanel.open({ tabId }).catch(err => {
          logger.warn('[Background] open Side Panel failed:', err?.message || err);
        });
      }
      handleSelectionSearch(prompt, text, tabId);
      return false;
    }
    
    // 其他操作（解释、翻译、总结、自定义工具）：直接调用 API
    const systemPrompts = {
      'explain': '你正在处理用户在网页上选中的内容。用1-3句简洁解释选中内容，必要时补充一个简短示例。不要展开长篇论述。',
      'translate': '你正在处理用户在网页上选中的内容。自动检测语言：中文→英文，英文→中文，其他语言→同时给出中英文。只输出翻译结果，不添加额外说明。',
      'summary': '你正在处理用户在网页上选中的内容。用3-5个要点总结选中内容，每条要点一句话，提炼核心信息即可。'
    };
    
    // 自定义工具使用传入的 systemPrompt，内置工具使用默认的
    const systemContent = systemPrompt || systemPrompts[action] || '你正在处理用户在网页上选中的内容，请用简洁的语言回答用户的问题。';
    
    const messages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: prompt }
    ];
    
    resetDialogApiCallCount();
    
    getStoredConfig().then(async (config) => {
      try {
        const useStream = config.streamConfig?.streamEnabled !== false;

        if (useStream && tabId) {
          // 流式模式：通过 StreamController 向 content script 发送实时消息
          const streamSessionId = `toolbar_${tabId}_${Date.now()}`;
          const result = await callApiNonStream(messages, config.modelName, {}, streamSessionId, {
            sendFn: (msg) => chrome.tabs.sendMessage(tabId, msg, { frameId }).catch(() => {}),
            typePrefix: 'SELECTION_TOOLBAR_'
          });
          const content = result.content !== undefined ? result.content : result;

          // 记录 token 使用统计
          if (result.usage) {
            recordTokenUsage({
              sessionId: 'selection_toolbar',
              model: config.modelName,
              usage: result.usage,
              callType: 'stream'
            }).catch(() => {});
          }

          logger.debug('[Background] selected texttoolbarstreaming API complete,content length:', content.length);
        } else {
          // 非流式模式：等待完整结果后一次性返回
          const result = await callApiNonStream(messages, config.modelName, {});
          const content = result.content !== undefined ? result.content : result;

          // 记录 token 使用统计
          if (result.usage) {
            recordTokenUsage({
              sessionId: 'selection_toolbar',
              model: config.modelName,
              usage: result.usage,
              callType: 'non_stream'
            }).catch(() => {});
          }

          logger.debug('[Background] selected texttoolbar API complete,content length:', content.length);

          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              type: 'SELECTION_TOOLBAR_RESULT',
              content: content
            }, { frameId }).catch(() => {
              logger.warn('[Background] send SELECTION_TOOLBAR_RESULT  to  tab failed');
            });
          }
        }
      } catch (error) {
        logger.error('[Background] selected texttoolbar API failed:', error);
        
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            type: 'SELECTION_TOOLBAR_RESULT',
            error: error.message || t('bg.apiCallFailed')
          }, { frameId }).catch(() => {});
        }
      }
    });
    
    return false;
  }
  
  // 选中文本工具栏追问：填充侧边栏输入框
  if (message.type === 'FILL_SIDEPANEL_INPUT') {
    const tabId = sender.tab?.id;
    const text = message.text;
    logger.debug('[Background] received follow-upfillrequested :', text?.substring(0, 50));
    
    // 打开侧边栏
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch(err => {
        logger.warn('[Background] open Side Panel failed:', err?.message || err);
      });
    }
    
    // 存储待填充的文本到 session storage（防止侧边栏未打开时丢失）
    chrome.storage.session.set({
      pendingFillInput: {
        text: text,
        timestamp: Date.now()
      }
    }).catch(() => {});
    
    // 发送消息给 Side Panel
    chrome.runtime.sendMessage({
      type: 'FILL_SIDEPANEL_INPUT',
      text: text
    }).catch(() => {
      logger.debug('[Background] Side Panel  not open,fillcontentstorage,waiting Side Panel load');
    });
    
    return false;
  }
  
  // 选中文本工具栏追问：直接发送到侧边栏
  if (message.type === 'DIRECT_SEND') {
    const tabId = sender.tab?.id;
    const text = message.text;
    const selectedText = message.selectedText || '';
    logger.debug('[Background] received directsendrequested :', text?.substring(0, 50));
    
    // 打开侧边栏
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch(err => {
        logger.warn('[Background] open Side Panel failed:', err?.message || err);
      });
    }
    
    // 存储待发送的文本到 session storage（防止侧边栏未打开时丢失）
    chrome.storage.session.set({
      pendingDirectSend: {
        text: text,
        selectedText: selectedText,
        timestamp: Date.now()
      }
    }).catch(() => {});
    
    // 发送消息给 Side Panel
    chrome.runtime.sendMessage({
      type: 'DIRECT_SEND',
      text: text,
      selectedText: selectedText
    }).catch(() => {
      logger.debug('[Background] Side Panel  not open,sendcontentstorage,waiting Side Panel load');
    });
    
    return false;
  }
  if (message.type === 'TRIGGER_AGENT_HEALTH_CHECK') {
    // 重置状态标记，确保无论状态是否变化都会通知 Side Panel
    _agentLastStatus.clear();
    performAgentHealthCheck();
    return false;
  }
  if (message.type === 'OPTIONS_PAGE_OPEN') {
    _optionsPageOpen = true;
    _agentLastStatus.clear();
    performAgentHealthCheck(); // 立即触发全量心跳
    return false;
  }
  if (message.type === 'OPTIONS_PAGE_CLOSED') {
    _optionsPageOpen = false;
    return false;
  }
  if (message.type === 'AGENT_CONNECTION_CHANGED') {
    chrome.runtime.sendMessage({
      type: 'AGENT_CONNECTION_CHANGED',
      connected: message.connected,
      agentId: message.agentId
    }).catch(() => {});
    if (message.connected && message.agentId) {
      // 1. 清空所有 agent 特定缓存（Skills/MCP/Prompts）
      AgentClient.clearSkillsCache();
      skillPromptsCache = null;
      mcpToolsCache = null;
      clearSkillLoadCache();

      // 2. 清空健康检查历史 + 连通性缓存
      _agentLastStatus.clear();
      clearAgentConnectivityCache();

      // 3. 乐观标记新代理可达，停止所有旧重连
      AgentClient.setAgentReachable(message.agentId, true);
      _stopAllAutoReconnect();

      // 4. 加载新代理的 MCP 工具
      loadMcpTools().then(count => {
        if (count > 0) logger.debug(`[Background] switchagent after loaded: ${count}  MCP tool`);
      }).catch(() => {});

      // 5. 延迟验证连通性
      setTimeout(() => {
        performAgentHealthCheck();
      }, 3000);
    } else if (!message.connected) {
      // 断开时停止所有重连 + 清理缓存
      _stopAllAutoReconnect();
      mcpToolsCache = null;
      skillPromptsCache = null;
      clearSkillLoadCache();
      performAgentHealthCheck();
    }
    return false;
  }
  // 批量检查文件是否存在（产物删除标记用）
  // 安全策略：Agent 离线/请求失败时假设文件存在，避免误标记删除
  // 此时保留命令解析的快照状态作为兜底
  if (message.type === 'CHECK_FILES_EXIST') {
    const paths = message.paths || [];
    if (paths.length === 0) {
      sendResponse({ success: true, results: {} });
      return false;
    }
    (async () => {
      const results = await Promise.allSettled(
        paths.map(p => AgentClient.statFile(p))
      );
      const existenceMap = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.success) {
          existenceMap[paths[i]] = r.value.exists;
        } else {
          // Agent 离线或请求失败 → 不标记，保留命令解析结果
          existenceMap[paths[i]] = true;
        }
      });
      sendResponse({ success: true, results: existenceMap });
    })();
    return true; // 异步 sendResponse
  }
  // 重启代理
  if (message.type === 'AGENT_RESTART') {
    (async () => {
      const result = await AgentClient.restartAgent();
      sendResponse(result);
    })();
    return true;
  }
  // 更新代理
  if (message.type === 'AGENT_UPDATE') {
    (async () => {
      const result = await AgentClient.updateAgent();
      sendResponse(result);
    })();
    return true;
  }
  // 停止代理
  if (message.type === 'AGENT_STOP') {
    (async () => {
      const result = await AgentClient.stopAgent();
      sendResponse(result);
    })();
    return true;
  }
  // 在本地浏览器打开原型文件
  if (message.type === 'OPEN_LOCAL_PROTOTYPE') {
    (async () => {
      const result = await AgentClient.openBrowser(message.path);
      sendResponse(result);
    })();
    return true; // 异步响应
  }
  // 删除本地原型文件
  if (message.type === 'DELETE_LOCAL_PROTOTYPE') {
    (async () => {
      try {
        const dirPath = message.path.replace(/[\\/][^\\/]+\.html$/, '');
        const result = await AgentClient.deleteFile(dirPath);
        if (result.success) {
          logger.debug('[Background] local prototypefile deleted:', dirPath);
        } else {
          logger.warn('[Background] local prototypefiledelete failed:', result.error);
        }
        sendResponse(result);
      } catch (err) {
        logger.warn('[Background] local prototypefiledelete failed:', err.message);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
  // 查询审计日志
  if (message.type === 'QUERY_AUDIT_LOGS') {
    AgentClient.queryAuditLogs({ category: message.category, limit: message.limit }).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

// 处理选中文本的 AI 搜索：存储搜索结果并通知 Side Panel
async function handleSelectionSearch(prompt, selectedText, tabId) {
  logger.debug('[Background] processselected text AI search:', prompt.substring(0, 50) + '...');
  
  // 存储待处理的搜索内容到 session storage
  await chrome.storage.session.set({
    pendingSelectionSearch: {
      prompt: prompt,
      selectedText: selectedText,
      timestamp: Date.now()
    }
  });
  
  // 发送消息给 Side Panel（Side Panel 已由 content script 在有用户手势时打开）
  chrome.runtime.sendMessage({
    type: 'SELECTION_AI_SEARCH',
    prompt: prompt,
    selectedText: selectedText
  }).catch(() => {
    logger.debug('[Background] Side Panel  not open,searchcontentstorage,waiting Side Panel load');
  });
}

// ==================== Agent 健康检查 ====================

let agentHealthCheckInterval = null;
let agentHeartbeatInterval = null;   // 活跃代理心跳定时器（带 token，维持 lastAuthTime）
let _optionsPageOpen = false;        // 配置页面是否打开（影响非活跃代理心跳）
const _agentLastStatus = new Map();  // agentId -> boolean（上次检查的状态）
const _autoReconnectTimers = new Map(); // agentId -> { timer, retries } — 自动重连

/**
 * 执行单次代理可达性检测（5秒超时 + 重试）
 */
async function checkSingleAgentReachable(agent) {
  let connected = false;
  const timeoutMs = 5000;

  // 首次检测
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${agent.url}/api/status`, { signal: controller.signal, cache: 'no-cache' });
    clearTimeout(timeoutId);
    connected = response.ok;
  } catch {
    connected = false;
  }

  // 首次失败后重试一次（给远程代理连接建立时间）
  if (!connected) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(`${agent.url}/api/status`, { signal: controller.signal, cache: 'no-cache' });
      clearTimeout(timeoutId);
      connected = response.ok;
    } catch {
      connected = false;
    }
  }

  return connected;
}

/**
 * 执行 Agent 健康检查，遍历所有配对代理，状态变化时通知 Side Panel
 */
async function performAgentHealthCheck() {
  try {
    const allAgents = await AgentClient.getPairedAgents();

    if (allAgents.length === 0) {
      if (_agentLastStatus.size > 0) {
        _agentLastStatus.clear();
        clearAgentConnectivityCache();
        AgentClient.setAgentReachable('__global__', false);
        notifyAgentStatusChange(false, '未配对');
      }
      return;
    }

    const activeAgent = await AgentClient.getActiveAgent();

    // 过滤停用的代理
    const enabledAgents = allAgents.filter(a => !a.disabled);

    // 仅检查的代理范围：配置页面打开 → 全部启用代理；否则 → 仅活跃代理
    const agentsToCheck = _optionsPageOpen
      ? enabledAgents
      : (activeAgent && !activeAgent.disabled ? [activeAgent] : []);

    if (agentsToCheck.length === 0) return;

    const results = await Promise.allSettled(
      agentsToCheck.map(async (agent) => {
        const connected = await checkSingleAgentReachable(agent);

        const prev = _agentLastStatus.get(agent.id);
        if (prev !== connected) {
          _agentLastStatus.set(agent.id, connected);
          AgentClient.setAgentReachable(agent.id, connected);
          logger.debug(`[Background] agent ${agent.name} status change: ${connected ? 'online' : 'offline'}`);
          return { agentId: agent.id, name: agent.name, connected, changed: true };
        }
        return { agentId: agent.id, name: agent.name, connected, changed: false };
      })
    );

    const changedAgents = results
      .filter(r => r.status === 'fulfilled' && r.value.changed)
      .map(r => r.value);

    if (changedAgents.length > 0) {
      clearAgentConnectivityCache();

      const activeChanged = changedAgents.find(a => a.agentId === activeAgent?.id);

      if (activeChanged) {
        notifyAgentStatusChange(activeChanged.connected, activeChanged.connected ? '在线' : '离线', activeChanged.agentId);

        if (activeChanged.connected) {
          _stopAutoReconnect(activeChanged.agentId);
          loadMcpTools().then(count => {
            if (count > 0) logger.debug(`[Background] Agent after reconnect loaded: ${count}  MCP tool`);
          }).catch(() => {});
        } else {
          await unloadMcpTools();
          mcpToolsCache = null;
          logger.debug('[Background] Agent disconnect,cleaned MCP tool');
          // 启动自动重连
          _startAutoReconnect(activeAgent);
        }
      }
    }
  } catch (err) {
    logger.warn('[Background] agenthealth checkexception:', err.message);
  }
}

/**
 * 启动自动重连（每 15 秒重试，最多 20 次）
 */
function _startAutoReconnect(agent) {
  if (!agent || agent.disabled) return;

  const existing = _autoReconnectTimers.get(agent.id);
  if (existing) return; // 已在重连中

  const schedule = (retries) => {
    if (retries >= 20) {
      _autoReconnectTimers.delete(agent.id);
      logger.debug(`[Background] agent ${agent.name} auto reconnectabandoned (exceed maxretry times)`);
      return;
    }

    const timer = setTimeout(async () => {
      // 重试前检查：代理是否已被删除或停用
      const currentAgents = await AgentClient.getPairedAgents();
      const current = currentAgents.find(a => a.id === agent.id);
      if (!current || current.disabled) {
        _autoReconnectTimers.delete(agent.id);
        logger.debug(`[Background] agent ${agent.name} ${current?.disabled ? 'disable' : 'delete'},stopauto reconnect`);
        return;
      }

      logger.debug(`[Background] agent ${agent.name} auto reconnectattempt ${retries + 1}/20`);
      const connected = await checkSingleAgentReachable(agent);

      if (connected) {
        _autoReconnectTimers.delete(agent.id);
        _agentLastStatus.set(agent.id, true);
        AgentClient.setAgentReachable(agent.id, true);
        clearAgentConnectivityCache();

        notifyAgentStatusChange(true, '在线', agent.id);
        _refreshActiveAgentState(agent.id);

        loadMcpTools().then(count => {
          if (count > 0) logger.debug(`[Background] Agent ${agent.name} reconnect successful,loaded: ${count}  MCP tool`);
        }).catch(() => {});
        logger.debug(`[Background] agent ${agent.name} auto reconnect successful`);
      } else {
        // 继续重试
        schedule(retries + 1);
      }
    }, 15000);

    _autoReconnectTimers.set(agent.id, { timer, retries });
  };

  schedule(0);
}

/**
 * 停止自动重连
 */
function _stopAutoReconnect(agentId) {
  const entry = _autoReconnectTimers.get(agentId);
  if (entry) {
    clearTimeout(entry.timer);
    _autoReconnectTimers.delete(agentId);
  }
}

/**
 * 停止所有重连计时器
 */
function _stopAllAutoReconnect() {
  for (const [agentId, entry] of _autoReconnectTimers) {
    clearTimeout(entry.timer);
  }
  _autoReconnectTimers.clear();
}

/**
 * 重连成功后刷新活跃代理状态（MCP 工具等）
 */
async function _refreshActiveAgentState(agentId) {
  try {
    const activeAgent = await AgentClient.getActiveAgent();
    if (activeAgent && activeAgent.id === agentId) {
      loadMcpTools().then(count => {
        if (count > 0) logger.debug(`[Background] active agentafter reconnect loaded: ${count}  MCP tool`);
      }).catch(() => {});
    }
  } catch (e) {
    logger.warn('[Background] refreshactive agentstate failed:', e.message);
  }
}

/**
 * 通知 Side Panel 代理状态变化
 */
function notifyAgentStatusChange(connected, status, agentId) {
  chrome.runtime.sendMessage({
    type: 'AGENT_STATUS_CHANGE',
    connected,
    status,
    agentId
  }).catch(() => {
    // Side Panel 可能未打开，忽略错误
  });
}

/**
 * 启动 Agent 定期健康检查（30 秒间隔）
 */
function startAgentHealthCheck() {
  stopAgentHealthCheck();
  logger.debug('[Background] start Agent health check (30s interval)');
  
  // 立即执行一次
  performAgentHealthCheck();
  
  agentHealthCheckInterval = setInterval(performAgentHealthCheck, 30000);

  // 启动活跃代理心跳（带 token，60s 间隔，只对当前活跃代理发）
  startAgentHeartbeat();
}

/**
 * 停止 Agent 定期健康检查
 */
function stopAgentHealthCheck() {
  if (agentHealthCheckInterval) {
    clearInterval(agentHealthCheckInterval);
    agentHealthCheckInterval = null;
    _agentLastStatus.clear();
  }
  stopAgentHeartbeat();
}

/**
 * 活跃代理心跳：只对当前活跃代理发轻量心跳（GET /api/heartbeat，带 token）
 * - 作用：刷新代理端 lastAuthTime，使其感知"插件在线"，从而停止刷新配对码
 * - 只发当前活跃代理，配对但未激活的代理不发
 */
async function performAgentHeartbeat() {
  try {
    const activeAgent = await AgentClient.getActiveAgent();
    if (!activeAgent || activeAgent.disabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(`${activeAgent.url}/api/heartbeat`, {
        headers: { 'Authorization': `Bearer ${activeAgent.token}` },
        signal: controller.signal,
        cache: 'no-cache'
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // 心跳失败静默（连接状态由 performAgentHealthCheck 负责）
  }
}

function startAgentHeartbeat() {
  stopAgentHeartbeat();
  // 立即发一次，让代理端尽快感知插件在线
  performAgentHeartbeat();
  agentHeartbeatInterval = setInterval(performAgentHeartbeat, 60 * 1000);
}

function stopAgentHeartbeat() {
  if (agentHeartbeatInterval) {
    clearInterval(agentHeartbeatInterval);
    agentHeartbeatInterval = null;
  }
}

// SW 启动时自动开始健康检查
startAgentHealthCheck();
