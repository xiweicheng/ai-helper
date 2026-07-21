// background/index.js - Service Worker 入口文件

import { cancelReactLoop, resetDialogApiCallCount, incrementDialogApiCallCount, getDialogApiCallCount, abortCurrentTool } from './state.js';
import { getStoredConfig, getChatConfig } from './config.js';
import { getTools, clearAgentConnectivityCache, loadMcpTools, unloadMcpTools, cancelRunningAgentCommands } from './tool-executor.js';
import { RAW_TOOLS } from './constants.js';
import { reactLoop, callApiNonStream, activeReactLoops, resumeReactLoopFromCheckpoint } from './react-loop.js';
import { preselectTools } from './tool-preselector.js';
import { recordTokenUsage } from './token-recorder.js';
import * as AgentClient from './local-agent-client.js';
import { getReactCheckpoint, deleteReactCheckpoint, cleanupExpiredReactCheckpoints, getAllReactCheckpoints } from '../storage/db.js';
import { readMemoryFile } from './tool-memory.js';
import logger from '../shared/logger.js';

// SW 启动时清理过期的 ReAct checkpoint（TTL: 7 天）
// 同时作为 DB 自检：验证 reactCheckpoints store 可访问（若 store 不存在会触发 retry 重建连接）
// 同时执行旧格式 Agent 数据迁移
Promise.all([
  cleanupExpiredReactCheckpoints().then(() => getAllReactCheckpoints()),
  AgentClient.migrateFromLegacyFormat()
])
  .then(([all, migrated]) => {
    logger.debug(`[Background] DB 自检通过，当前有 ${all.length} 个 checkpoint` + (migrated ? '，已完成旧格式 Agent 迁移' : ''));
  })
  .catch(err => {
    logger.warn('[Background] 清理过期 checkpoint 或 DB 自检失败:', err);
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
    logger.debug('[Background] keepalive 端口已连接, sessionId:', sessionId, isReconnection ? '(重连)' : '(首次)');

    // SW 静默重启检测：仅在重连时检测，避免首次连接时 activeReactLoops 尚未初始化导致的误报
    if (isReconnection && !activeReactLoops.has(sessionId)) {
      logger.warn('[Background] ⚠️ 检测到 SW 已重启，sessionId', sessionId, '的 API 调用已丢失');
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
          logger.debug('[Background] 检测到可恢复的 checkpoint:', checkpointMeta);
        }
      } catch (e) {
        logger.warn('[Background] 读取 checkpoint 失败:', e.message);
      }
      try {
        port.postMessage({ type: 'SW_RESTARTED', sessionId, checkpoint: checkpointMeta });
      } catch (e) {
        logger.warn('[Background] 发送 SW_RESTARTED 消息失败:', e.message);
      }
    }

    port.onDisconnect.addListener(() => {
      keepalivePorts.delete(sessionId);
      logger.debug('[Background] keepalive 端口已断开, sessionId:', sessionId);
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
      logger.warn('[Background] GET_CHECKPOINT 查询失败:', err);
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
        logger.warn('[Background] DELETE_CHECKPOINT 失败:', err);
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
      sendResponse({ error: '缺少 sessionId' });
      return false;
    }

    logger.debug('[Background] 收到 RESUME_REACT，sessionId:', sessionId, 'userGuidance:', userGuidance ? `"${userGuidance.substring(0, 50)}..."` : '(无)');

    // 如果旧任务仍在运行（页面刷新后 SW 中的 reactLoop 可能还在），
    // 先取消旧任务，避免两个 reactLoop 同时运行导致状态冲突
    const cancelOldTask = activeReactLoops.has(sessionId);

    const doResume = () => {
      // 重置 API 调用计数器（恢复视为新的一轮 API 调用起点）
      resetDialogApiCallCount(sessionId);

      // 立即发送初始状态
      const initialStatus = {
        type: 'EXECUTION_STATUS_UPDATE',
        nodeName: '从 checkpoint 恢复中...',
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
          logger.warn('[Background] RESUME_REACT: 未找到 checkpoint 或恢复失败');
          // 收集诊断信息，帮助定位问题
          getReactCheckpoint(sessionId).then(cp => {
            logger.warn('[Background] RESUME_REACT: 再次查询 checkpoint 结果:', cp ? '存在' : '不存在');
          }).catch(() => {});
          chrome.runtime.sendMessage({
            type: 'API_ERROR',
            sessionId,
            callId: resumeCallId,
            error: '未找到可恢复的任务 checkpoint，可能已过期或被清理。请检查 Service Worker 控制台中的诊断日志（搜索 "checkpoint" 关键字）。',
            executionLog: [],
            resumed: true,
          }).catch(() => {});
          return;
        }
        logger.debug('[Background] RESUME_REACT 完成，内容长度:', result.content?.length);
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
          logger.warn('[Background] 发送 RESUME 完成消息失败:', err);
        });
      })
      .catch(error => {
        const isAborted = error.name === 'AbortError' || error.message === '请求已被用户取消' || error.message === 'ReAct 循环已被用户取消';
        logger.debug('[Background] RESUME_REACT 失败:', isAborted ? '(用户取消)' : error.message);
        const errLog = error.executionLog || [];
        const truncatedErrLog = errLog.length > MAX_LOG_ENTRIES_FOR_MSG ? errLog.slice(-MAX_LOG_ENTRIES_FOR_MSG) : errLog;
        chrome.runtime.sendMessage({
          type: 'API_ERROR',
          sessionId,
          callId: resumeCallId,
          error: error.message || '恢复失败',
          executionLog: truncatedErrLog,
          resumed: true,
        }).catch(() => {});
      });
    };  // doResume 函数结束

    if (cancelOldTask) {
      logger.debug('[Background] RESUME_REACT: 检测到旧任务仍在运行，先取消');
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
      logger.debug(`[Background] GET_MCP_TOOLS 使用缓存（${mcpToolsCache.tools.length} 个工具，${Math.round((now - mcpToolsCache.loadedAt) / 1000)}s 前）`);
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
      logger.debug(`[Background] GET_MCP_TOOLS 返回 ${mcpTools.length} 个工具（共重载 ${count} 个）`);
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

  if (message.type === 'GET_SKILL_LIST') {
    // 获取技能列表（供 side_panel 技能选择器使用）
    AgentClient.getSkillList().then(result => {
      if (result?.success) {
        sendResponse({ success: true, skills: result.skills || [] });
      } else {
        sendResponse({ success: false, skills: [], error: result?.error || '获取失败' });
      }
    }).catch(err => {
      sendResponse({ success: false, skills: [], error: err.message });
    });
    return true;
  }
  
  if (message.type === 'CAPTURE_TAB') {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 100 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        logger.error('[Background] 截图失败:', chrome.runtime.lastError.message);
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
        logger.error('[Background] 页面快捷键截图失败:', chrome.runtime.lastError.message);
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
          logger.error('[Background] 区域截图失败:', chrome.runtime.lastError.message);
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
      nodeName: '准备中...',
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
    
    logger.debug('[Background] 收到 CALL_API 消息，sessionId:', sessionId, 'useTools:', useTools, 'tabId:', tabId, 'apiParams:', apiParams);
    
    const apiCall = useTools 
      ? (async () => {
          const tools = await getTools(agentToolIds, agentId, agentSkillIds);

          // 工具开关打开但实际没有可用工具，跳过预筛选，直接普通对话
          if (tools.length === 0) {
            logger.debug('[Background] 没有可用工具，跳过预筛选，直接普通对话');
            return callApiNonStream(messages, model, apiParams, sessionId, {}, callId);
          }

          logger.debug(`[Background] 获取到 ${tools.length} 个工具`);

          // 检查工具预筛选开关
          const config = await getStoredConfig();
          const enableToolPreselect = config.reactConfig.enableToolPreselect;

          // 预筛选工具：通过前置规划调用减少不必要的工具传递
          let preselection;
          if (enableToolPreselect) {
            preselection = await preselectTools(messages, model, tools, apiParams);
          } else {
            logger.debug('[Background] 工具预筛选已关闭，使用全量工具');
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
              nodeName: '工具预筛选',
              status: 'success',
              executionLog: preselection.executionLog
            };
            if (sessionId) {
              statusUpdate.sessionId = sessionId;
            }
            if (callId) {
              statusUpdate.callId = callId;
            }
            logger.debug('[Background] 发送预筛选状态更新:', statusUpdate);
            chrome.runtime.sendMessage(statusUpdate).then(() => {
              logger.debug('[Background] 预筛选状态更新发送成功');
            }).catch(err => {
              logger.error('[Background] 预筛选状态更新发送失败:', err);
            });
          }

          // 模型直接回答了，无需再调主力模型
          if (preselection.type === 'answer') {
            logger.debug('[Background] 预筛选模型直接回答，跳过主力模型调用');
            return { content: preselection.content, executionLog: preselection.executionLog };
          }

          const { tools: selectedTools, executionLog: preselectLog } = preselection;
          logger.debug(`[Background] 预筛选后 ${selectedTools.length} 个工具`);
          logger.debug('[Background] 预筛选执行日志:', JSON.stringify(preselectLog).substring(0, 500));

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
          logger.debug('[Background] ReAct 完成，executionLog 总条数:', reactResult.executionLog?.length);
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
        const executionLog = result.executionLog || [];
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
        }
        
        logger.debug('[Background] API 调用完成，内容长度:', content.length, '执行日志条目数:', executionLog.length);
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
          logger.warn('[Background] 发送回传消息失败:', err);
        });
      })
      .catch(error => {
        const isAborted = error.name === 'AbortError' || error.message === '请求已被用户取消' || error.message === 'ReAct 循环已被用户取消';
        if (isAborted) {
          logger.debug('[Background] API 调用已被用户取消');
        } else {
          logger.error('[Background] API 调用失败:', error.message || error);
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
          error: error.message || 'API 调用失败',
          executionLog: truncatedErrLog
        }).catch(err => {
          logger.warn('[Background] 发送错误消息失败:', err);
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
    
    logger.debug('[Background] 收到选中文本工具栏操作:', action, 'tabId:', tabId);
    
    // AI搜索：打开侧边栏，在侧边栏中发起搜索
    if (action === 'ai-search') {
      // 在消息处理器中直接调用 sidePanel.open（必须在任何 await 之前，保留用户手势上下文）
      if (tabId) {
        chrome.sidePanel.open({ tabId }).catch(err => {
          logger.warn('[Background] 打开 Side Panel 失败:', err?.message || err);
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

          logger.debug('[Background] 选中文本工具栏流式 API 完成，内容长度:', content.length);
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

          logger.debug('[Background] 选中文本工具栏 API 完成，内容长度:', content.length);

          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              type: 'SELECTION_TOOLBAR_RESULT',
              content: content
            }, { frameId }).catch(() => {
              logger.warn('[Background] 发送 SELECTION_TOOLBAR_RESULT 到 tab 失败');
            });
          }
        }
      } catch (error) {
        logger.error('[Background] 选中文本工具栏 API 失败:', error);
        
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            type: 'SELECTION_TOOLBAR_RESULT',
            error: error.message || 'API 调用失败'
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
    logger.debug('[Background] 收到追问填充请求:', text?.substring(0, 50));
    
    // 打开侧边栏
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch(err => {
        logger.warn('[Background] 打开 Side Panel 失败:', err?.message || err);
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
      logger.debug('[Background] Side Panel 未打开，填充内容已存储，等待 Side Panel 加载');
    });
    
    return false;
  }
  
  // 选中文本工具栏追问：直接发送到侧边栏
  if (message.type === 'DIRECT_SEND') {
    const tabId = sender.tab?.id;
    const text = message.text;
    const selectedText = message.selectedText || '';
    logger.debug('[Background] 收到直接发送请求:', text?.substring(0, 50));
    
    // 打开侧边栏
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch(err => {
        logger.warn('[Background] 打开 Side Panel 失败:', err?.message || err);
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
      logger.debug('[Background] Side Panel 未打开，发送内容已存储，等待 Side Panel 加载');
    });
    
    return false;
  }
  if (message.type === 'TRIGGER_AGENT_HEALTH_CHECK') {
    // 重置状态标记，确保无论状态是否变化都会通知 Side Panel
    _agentLastStatus.clear();
    performAgentHealthCheck();
    return false;
  }
  if (message.type === 'AGENT_CONNECTION_CHANGED') {
    // 选项页配对/断开后通知 Side Panel，同时触发健康检查
    chrome.runtime.sendMessage({
      type: 'AGENT_CONNECTION_CHANGED',
      connected: message.connected,
      agentId: message.agentId
    }).catch(() => {});
    if (message.connected) {
      _agentLastStatus.clear();
      performAgentHealthCheck();
    }
    return false;
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
        const dirPath = message.path.replace(/\/[^/]+\.html$/, '');
        const result = await AgentClient.deleteFile(dirPath);
        if (result.success) {
          logger.debug('[Background] 本地原型文件已删除:', dirPath);
        } else {
          logger.warn('[Background] 本地原型文件删除失败:', result.error);
        }
        sendResponse(result);
      } catch (err) {
        logger.warn('[Background] 本地原型文件删除失败:', err.message);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});

// 处理选中文本的 AI 搜索：存储搜索结果并通知 Side Panel
async function handleSelectionSearch(prompt, selectedText, tabId) {
  logger.debug('[Background] 处理选中文本 AI 搜索:', prompt.substring(0, 50) + '...');
  
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
    logger.debug('[Background] Side Panel 未打开，搜索内容已存储，等待 Side Panel 加载');
  });
}

// ==================== Agent 健康检查 ====================

let agentHealthCheckInterval = null;
const _agentLastStatus = new Map(); // agentId -> boolean（上次检查的状态）

/**
 * 执行 Agent 健康检查，遍历所有配对代理，状态变化时通知 Side Panel
 */
async function performAgentHealthCheck() {
  try {
    const agents = await AgentClient.getPairedAgents();

    if (agents.length === 0) {
      // 没有任何已配对代理
      if (_agentLastStatus.size > 0) {
        _agentLastStatus.clear();
        clearAgentConnectivityCache();
        AgentClient.setAgentReachable('__global__', false);
        notifyAgentStatusChange(false, '未配对');
      }
      return;
    }

    // 并行检查所有代理
    const results = await Promise.allSettled(
      agents.map(async (agent) => {
        let connected = false;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          const response = await fetch(`${agent.url}/api/status`, { signal: controller.signal, cache: 'no-cache' });
          clearTimeout(timeoutId);
          connected = response.ok;
        } catch {
          connected = false;
        }

        const prev = _agentLastStatus.get(agent.id);
        if (prev !== connected) {
          _agentLastStatus.set(agent.id, connected);
          AgentClient.setAgentReachable(agent.id, connected);
          logger.debug(`[Background] 代理 ${agent.name} 状态变化: ${connected ? '在线' : '离线'}`);
          return { agentId: agent.id, name: agent.name, connected, changed: true };
        }
        return { agentId: agent.id, name: agent.name, connected, changed: false };
      })
    );

    // 汇总状态变化
    const changedAgents = results
      .filter(r => r.status === 'fulfilled' && r.value.changed)
      .map(r => r.value);

    if (changedAgents.length > 0) {
      clearAgentConnectivityCache();

      // 检查活跃代理状态是否变化
      const activeAgent = await AgentClient.getActiveAgent();
      const activeChanged = changedAgents.find(a => a.agentId === activeAgent?.id);

      if (activeChanged) {
        notifyAgentStatusChange(activeChanged.connected, activeChanged.connected ? '在线' : '离线', activeChanged.agentId);

        if (activeChanged.connected) {
          loadMcpTools().then(count => {
            if (count > 0) logger.debug(`[Background] Agent 重连后加载了 ${count} 个 MCP 工具`);
          }).catch(() => {});
        } else {
          await unloadMcpTools();
          mcpToolsCache = null;
          logger.debug('[Background] Agent 断开，已清理 MCP 工具');
        }
      }
    }
  } catch (err) {
    logger.warn('[Background] 代理健康检查异常:', err.message);
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
  logger.debug('[Background] 启动 Agent 健康检查（30s 间隔）');
  
  // 立即执行一次
  performAgentHealthCheck();
  
  agentHealthCheckInterval = setInterval(performAgentHealthCheck, 30000);
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
}

// SW 启动时自动开始健康检查
startAgentHealthCheck();
