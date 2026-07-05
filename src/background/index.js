// background/index.js - Service Worker 入口文件

import { cancelReactLoop, resetDialogApiCallCount, incrementDialogApiCallCount, getDialogApiCallCount } from './state.js';
import { getStoredConfig, getChatConfig } from './config.js';
import { getTools, clearAgentConnectivityCache, loadMcpTools, unloadMcpTools } from './tool-executor.js';
import { RAW_TOOLS } from './constants.js';
import { reactLoop, callApiNonStream, activeReactLoops } from './react-loop.js';
import { preselectTools } from './tool-preselector.js';
import { recordTokenUsage } from './token-recorder.js';
import * as AgentClient from './local-agent-client.js';

// chrome.runtime.sendMessage 单条消息最大 64MiB，此常量用于截断大消息
const MAX_LOG_ENTRIES_FOR_MSG = 1000;

// MCP 工具查询缓存，避免每次 GET_MCP_TOOLS 都向 Agent 发网络请求
let mcpToolsCache = null;

// Agent Skill Prompts 缓存
let skillPromptsCache = null;

// SW 存活保持：side panel 通过 chrome.runtime.connect 建立长连接，
// 防止 API 调用期间 Chrome 判定 SW 空闲而将其杀死
const keepalivePorts = new Map(); // sessionId -> Port

chrome.runtime.onConnect.addListener((port) => {
  if (port.name?.startsWith('keepalive-')) {
    const sessionId = port.name.replace('keepalive-', '');
    // 判断是否为重连（SW 重启后的重连），而非首次连接
    const isReconnection = keepalivePorts.has(sessionId);
    keepalivePorts.set(sessionId, port);
    console.log('[Background] keepalive 端口已连接, sessionId:', sessionId, isReconnection ? '(重连)' : '(首次)');

    // SW 静默重启检测：仅在重连时检测，避免首次连接时 activeReactLoops 尚未初始化导致的误报
    if (isReconnection && !activeReactLoops.has(sessionId)) {
      console.warn('[Background] ⚠️ 检测到 SW 已重启，sessionId', sessionId, '的 API 调用已丢失');
      try {
        port.postMessage({ type: 'SW_RESTARTED', sessionId });
      } catch (e) {
        console.warn('[Background] 发送 SW_RESTARTED 消息失败:', e.message);
      }
    }

    port.onDisconnect.addListener(() => {
      keepalivePorts.delete(sessionId);
      console.log('[Background] keepalive 端口已断开, sessionId:', sessionId);
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

// ==================== 消息监听 ====================

// 监听来自 popup/side_panel 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CANCEL_REACT') {
    const { tabId, sessionId } = message;
    // 优先使用 sessionId，兼容旧版 tabId
    if (sessionId) {
      cancelReactLoop(sessionId);
    } else {
      cancelReactLoop(tabId);
    }
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
      console.log(`[Background] GET_MCP_TOOLS 使用缓存（${mcpToolsCache.tools.length} 个工具，${Math.round((now - mcpToolsCache.loadedAt) / 1000)}s 前）`);
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
      console.log(`[Background] GET_MCP_TOOLS 返回 ${mcpTools.length} 个工具（共重载 ${count} 个）`);
      sendResponse({ success: true, tools: mcpTools });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_AGENT_SKILL_PROMPTS') {
    // 带缓存：60 秒内复用上次结果
    const now = Date.now();
    if (skillPromptsCache && (now - skillPromptsCache.loadedAt) < 60000) {
      sendResponse({ success: true, prompts: skillPromptsCache.prompts });
      return true;
    }
    AgentClient.getAgentSkillPrompts().then(result => {
      const prompts = result.success ? (result.prompts || '') : '';
      skillPromptsCache = { prompts, loadedAt: Date.now() };
      sendResponse({ success: true, prompts });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  
  if (message.type === 'CAPTURE_TAB') {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 60 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] 截图失败:', chrome.runtime.lastError.message);
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // 异步响应
  }
  
  if (message.type === 'CALL_API') {
    const { messages, model, useTools, tabId, apiParams, sessionId, imageApiBase, imageApiKey, agentId, agentToolIds } = message;
    
    // 将图片识别独立配置合并到 apiParams 中
    if (imageApiBase) {
      apiParams.imageApiBase = imageApiBase;
    }
    if (imageApiKey) {
      apiParams.imageApiKey = imageApiKey;
    }
    
    // 重置当前会话的 API 调用计数器
    resetDialogApiCallCount(sessionId);
    
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
    chrome.runtime.sendMessage(initialStatus).catch(() => {});
    
    console.log('[Background] 收到 CALL_API 消息，sessionId:', sessionId, 'useTools:', useTools, 'tabId:', tabId, 'apiParams:', apiParams);
    
    const apiCall = useTools 
      ? (async () => {
          const tools = await getTools(agentToolIds);

          // 工具开关打开但实际没有可用工具，跳过预筛选，直接普通对话
          if (tools.length === 0) {
            console.log('[Background] 没有可用工具，跳过预筛选，直接普通对话');
            return callApiNonStream(messages, model, apiParams, sessionId);
          }

          console.log('[Background] 获取到工具列表，数量:', tools.length, '工具:', tools.map(t => t.function.name));

          // 检查工具预筛选开关
          const config = await getStoredConfig();
          const enableToolPreselect = config.reactConfig.enableToolPreselect;

          // 预筛选工具：通过前置规划调用减少不必要的工具传递
          let preselection;
          if (enableToolPreselect) {
            preselection = await preselectTools(messages, model, tools, apiParams);
          } else {
            console.log('[Background] 工具预筛选已关闭，使用全量工具');
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
            console.log('[Background] 发送预筛选状态更新:', statusUpdate);
            chrome.runtime.sendMessage(statusUpdate).then(() => {
              console.log('[Background] 预筛选状态更新发送成功');
            }).catch(err => {
              console.error('[Background] 预筛选状态更新发送失败:', err);
            });
          }

          // 模型直接回答了，无需再调主力模型
          if (preselection.type === 'answer') {
            console.log('[Background] 预筛选模型直接回答，跳过主力模型调用');
            return { content: preselection.content, executionLog: preselection.executionLog };
          }

          const { tools: selectedTools, executionLog: preselectLog } = preselection;
          console.log('[Background] 预筛选后工具数量:', selectedTools.length, '工具:', selectedTools.map(t => t.function.name));
          console.log('[Background] 预筛选执行日志:', JSON.stringify(preselectLog).substring(0, 500));

          // 发送预筛选日志到 Side Panel，使其在流式输出过程中也能看到
          if (preselectLog.length > 0) {
            chrome.runtime.sendMessage({
              type: 'STREAM_PRESELECT',
              sessionId: sessionId,
              preselectLog: preselectLog
            }).catch(() => {});
          }

          const reactResult = await reactLoop(messages, model, selectedTools, tabId, apiParams, sessionId, null, null, { value: 1 }, preselectLog);
          console.log('[Background] ReAct 完成，executionLog 总条数:', reactResult.executionLog?.length);
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
        
        console.log('[Background] API 调用完成，内容长度:', content.length, '执行日志条目数:', executionLog.length);
        // 安全截断：防止 executionLog 超过 chrome.runtime.sendMessage 的 64MiB 限制
        const truncatedLog = executionLog.length > MAX_LOG_ENTRIES_FOR_MSG
          ? executionLog.slice(-MAX_LOG_ENTRIES_FOR_MSG)
          : executionLog;
        chrome.runtime.sendMessage({
          type: 'API_COMPLETE',
          sessionId: sessionId,
          content: content,
          executionLog: truncatedLog,
          reflectionScore: reflectionScore,
          reasoningContent: reasoningContent,
          wasRevised: wasRevised
        }).catch(err => {
          console.warn('[Background] 发送回传消息失败:', err);
        });
      })
      .catch(error => {
        const isAborted = error.name === 'AbortError' || error.message === '请求已被用户取消' || error.message === 'ReAct 循环已被用户取消';
        if (isAborted) {
          console.log('[Background] API 调用已被用户取消');
        } else {
          console.error('[Background] API 调用失败:', error.message || error);
        }
        // 获取 executionLog（如果可用），安全截断防止 64MiB 限制
        const errExecutionLog = error.executionLog || [];
        const truncatedErrLog = errExecutionLog.length > MAX_LOG_ENTRIES_FOR_MSG
          ? errExecutionLog.slice(-MAX_LOG_ENTRIES_FOR_MSG)
          : errExecutionLog;
        chrome.runtime.sendMessage({
          type: 'API_ERROR',
          sessionId: sessionId,
          error: error.message || 'API 调用失败',
          executionLog: truncatedErrLog
        }).catch(err => {
          console.warn('[Background] 发送错误消息失败:', err);
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
    
    console.log('[Background] 收到选中文本工具栏操作:', action, 'tabId:', tabId);
    
    // AI搜索：打开侧边栏，在侧边栏中发起搜索
    if (action === 'ai-search') {
      // 在消息处理器中直接调用 sidePanel.open（必须在任何 await 之前，保留用户手势上下文）
      if (tabId) {
        chrome.sidePanel.open({ tabId }).catch(err => {
          console.warn('[Background] 打开 Side Panel 失败:', err?.message || err);
        });
      }
      handleSelectionSearch(prompt, text, tabId);
      return false;
    }
    
    // 其他操作（解释、翻译、总结、自定义工具）：直接调用 API
    const systemPrompts = {
      'explain': '你是一个知识解释助手。用1-3句话简洁解释用户选中的内容，必要时补充一个简短示例。不要展开长篇论述，不要询问用户是否需要更多信息。',
      'translate': '你是一个翻译助手。自动检测输入语言：中文→英文，英文→中文，其他语言→同时给出中英文。只输出翻译结果，不添加任何解释、说明或额外文字。',
      'summary': '你是一个信息提炼助手。用3-5个要点总结用户选中的内容，每条要点一句话，提炼核心信息即可。'
    };
    
    // 自定义工具使用传入的 systemPrompt，内置工具使用默认的
    const systemContent = systemPrompt || systemPrompts[action] || '你是一个有帮助的AI助手，请用简洁的语言回答用户的问题。';
    
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
            sendFn: (msg) => chrome.tabs.sendMessage(tabId, msg).catch(() => {}),
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

          console.log('[Background] 选中文本工具栏流式 API 完成，内容长度:', content.length);
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

          console.log('[Background] 选中文本工具栏 API 完成，内容长度:', content.length);

          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              type: 'SELECTION_TOOLBAR_RESULT',
              content: content
            }).catch(() => {
              console.warn('[Background] 发送 SELECTION_TOOLBAR_RESULT 到 tab 失败');
            });
          }
        }
      } catch (error) {
        console.error('[Background] 选中文本工具栏 API 失败:', error);
        
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            type: 'SELECTION_TOOLBAR_RESULT',
            error: error.message || 'API 调用失败'
          }).catch(() => {});
        }
      }
    });
    
    return false;
  }
  
  // 选中文本工具栏追问：填充侧边栏输入框
  if (message.type === 'FILL_SIDEPANEL_INPUT') {
    const tabId = sender.tab?.id;
    const text = message.text;
    console.log('[Background] 收到追问填充请求:', text?.substring(0, 50));
    
    // 打开侧边栏
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch(err => {
        console.warn('[Background] 打开 Side Panel 失败:', err?.message || err);
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
      console.log('[Background] Side Panel 未打开，填充内容已存储，等待 Side Panel 加载');
    });
    
    return false;
  }
  
  // 页面导出 PDF（通过 CDP Page.printToPDF）
  if (message.type === 'GENERATE_PDF') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: '无法获取标签页 ID' });
      return false;
    }

    handleGeneratePdf(tabId, message.options)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));

    return true; // 异步响应
  }

  // 选中文本工具栏追问：直接发送到侧边栏
  if (message.type === 'DIRECT_SEND') {
    const tabId = sender.tab?.id;
    const text = message.text;
    const selectedText = message.selectedText || '';
    console.log('[Background] 收到直接发送请求:', text?.substring(0, 50));
    
    // 打开侧边栏
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch(err => {
        console.warn('[Background] 打开 Side Panel 失败:', err?.message || err);
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
      console.log('[Background] Side Panel 未打开，发送内容已存储，等待 Side Panel 加载');
    });
    
    return false;
  }
  if (message.type === 'TRIGGER_AGENT_HEALTH_CHECK') {
    // 重置状态标记，确保无论状态是否变化都会通知 Side Panel
    wasAgentConnected = null;
    performAgentHealthCheck();
    return false;
  }
  if (message.type === 'AGENT_CONNECTION_CHANGED') {
    // 直接转发到 Side Panel，不依赖健康检查 ping
    chrome.runtime.sendMessage({
      type: 'AGENT_CONNECTION_CHANGED',
      connected: message.connected
    }).catch(() => {});
    if (message.connected) {
      // 连接成功，同时触发健康检查以确保 background 内部状态正确
      wasAgentConnected = null;
      performAgentHealthCheck();
    }
    return false;
  }
});

// 处理选中文本的 AI 搜索：存储搜索结果并通知 Side Panel
async function handleSelectionSearch(prompt, selectedText, tabId) {
  console.log('[Background] 处理选中文本 AI 搜索:', prompt.substring(0, 50) + '...');
  
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
    console.log('[Background] Side Panel 未打开，搜索内容已存储，等待 Side Panel 加载');
  });
}

/**
 * 通过 CDP Page.printToPDF 生成 PDF
 */
async function handleGeneratePdf(tabId, options) {
  console.log('[Background] 开始生成 PDF, tabId:', tabId, 'options:', JSON.stringify(options));

  // 附加 debugger 到目标标签页
  return new Promise((resolve) => {
    const debuggee = { tabId };

    chrome.debugger.attach(debuggee, '1.3', () => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: `附加 debugger 失败: ${chrome.runtime.lastError.message}` });
        return;
      }

      // 先启用 Page 域
      chrome.debugger.sendCommand(debuggee, 'Page.enable', {}, () => {
        // 忽略 enable 的错误（可能已经启用）

        // 调用 Page.printToPDF
        chrome.debugger.sendCommand(debuggee, 'Page.printToPDF', options, (result) => {
          // 尝试分离 debugger（忽略分离错误）
          chrome.debugger.detach(debuggee, () => {});

          if (chrome.runtime.lastError) {
            resolve({ success: false, error: `PDF 生成失败: ${chrome.runtime.lastError.message}` });
            return;
          }

          if (!result || !result.data) {
            resolve({ success: false, error: 'PDF 生成失败：返回数据为空' });
            return;
          }

          console.log('[Background] PDF 生成成功，数据大小:', result.data.length, '字符');
          resolve({
            success: true,
            data: result.data
          });
        });
      });
    });
  });
}

// ==================== Agent 健康检查 ====================

let agentHealthCheckInterval = null;
let wasAgentConnected = null; // 上次检查的连接状态

/**
 * 执行 Agent 健康检查，状态变化时通知 Side Panel
 */
async function performAgentHealthCheck() {
  try {
    const storage = await chrome.storage.local.get(['agentUrl', 'agentToken']);
    const isPaired = !!(storage.agentUrl && storage.agentToken);
    
    if (!isPaired) {
      if (wasAgentConnected !== false) {
        wasAgentConnected = false;
        clearAgentConnectivityCache();
        notifyAgentStatusChange(false, '未配对');
      }
      return;
    }
    
    // Ping 代理服务确认可达性
    let connected = false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`${storage.agentUrl}/api/status`, { signal: controller.signal });
      clearTimeout(timeoutId);
      connected = response.ok;
    } catch (err) {
      connected = false;
    }
    
    if (wasAgentConnected !== connected) {
      wasAgentConnected = connected;
      clearAgentConnectivityCache();
      const status = connected ? 'connected' : 'disconnected';
      const detail = connected ? '代理服务已恢复' : '代理服务不可达';
      console.log(`[Background] 代理健康检查状态变化: ${detail}`);
      notifyAgentStatusChange(connected, status);

      // Agent 连接恢复时，重新加载 MCP 工具
      if (connected) {
        loadMcpTools().then(count => {
          if (count > 0) console.log(`[Background] Agent 重连后加载了 ${count} 个 MCP 工具`);
        }).catch(() => {});
      } else {
        // Agent 断开时清理 MCP 工具状态和缓存
        await unloadMcpTools();
        mcpToolsCache = null;
        console.log('[Background] Agent 断开，已清理 MCP 工具');
      }
    }
  } catch (err) {
    console.warn('[Background] 代理健康检查异常:', err.message);
  }
}

/**
 * 通知 Side Panel 代理 状态变化
 */
function notifyAgentStatusChange(connected, status) {
  chrome.runtime.sendMessage({
    type: 'AGENT_STATUS_CHANGE',
    connected,
    status
  }).catch(() => {
    // Side Panel 可能未打开，忽略错误
  });
}

/**
 * 启动 Agent 定期健康检查（30 秒间隔）
 */
function startAgentHealthCheck() {
  stopAgentHealthCheck();
  console.log('[Background] 启动 Agent 健康检查（30s 间隔）');
  
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
    wasAgentConnected = null;
  }
}

// SW 启动时自动开始健康检查
startAgentHealthCheck();
