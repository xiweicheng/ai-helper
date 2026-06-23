// background/index.js - Service Worker 入口文件

import { cancelReactLoop, resetDialogApiCallCount, incrementDialogApiCallCount, getDialogApiCallCount, setActiveReactSessionId } from './state.js';
import { getStoredConfig, getChatConfig } from './config.js';
import { getTools } from './tool-executor.js';
import { reactLoop, callApiNonStream } from './react-loop.js';
import { preselectTools } from './tool-preselector.js';

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
  
  if (message.type === 'CALL_API') {
    const { messages, model, useTools, tabId, apiParams, sessionId } = message;
    
    // 设置活跃会话 ID（用于取消控制）
    if (sessionId) {
      setActiveReactSessionId(sessionId);
    }
    
    // 重置当前对话的 API 调用计数器
    resetDialogApiCallCount();
    
    console.log('[Background] 收到 CALL_API 消息，useTools:', useTools, 'tabId:', tabId, 'apiParams:', apiParams);
    
    const apiCall = useTools 
      ? (async () => {
          const tools = await getTools();

          // 工具开关打开但实际没有可用工具，跳过预筛选，直接普通对话
          if (tools.length === 0) {
            console.log('[Background] 没有可用工具，跳过预筛选，直接普通对话');
            return callApiNonStream(messages, model, apiParams);
          }

          console.log('[Background] 获取到工具列表，数量:', tools.length, '工具:', tools.map(t => t.function.name));

          // 预筛选工具：通过前置规划调用减少不必要的工具传递
          // 先递增计数器，让预筛选也能显示正确的调用次数
          const preselectCount = incrementDialogApiCallCount();
          const preselection = await preselectTools(messages, model, tools, apiParams, preselectCount);

          // 发送预筛选完成状态，让实时日志面板也能看到这个步骤
          const currentCount = preselectCount;
          const statusUpdate = {
            type: 'EXECUTION_STATUS_UPDATE',
            nodeName: `API调用 (第${currentCount}次)（🔍工具预筛选）`,
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

          // 模型直接回答了，无需再调主力模型
          if (preselection.type === 'answer') {
            console.log('[Background] 预筛选模型直接回答，跳过主力模型调用');
            return { content: preselection.content, executionLog: preselection.executionLog };
          }

          const { tools: selectedTools, executionLog: preselectLog } = preselection;
          console.log('[Background] 预筛选后工具数量:', selectedTools.length, '工具:', selectedTools.map(t => t.function.name));

          const reactResult = await reactLoop(messages, model, selectedTools, tabId, apiParams, null, null, { value: 1 }, preselectLog);
          return {
            content: reactResult.content !== undefined ? reactResult.content : reactResult,
            executionLog: reactResult.executionLog || preselectLog
          };
        })()
      : callApiNonStream(messages, model, apiParams);
    
    apiCall
      .then(result => {
        // 兼容两种返回格式：{ content, executionLog } 或直接返回 content
        const content = result.content !== undefined ? result.content : result;
        const executionLog = result.executionLog || [];
        
        console.log('[Background] API 调用完成，内容长度:', content.length, '执行日志条目数:', executionLog.length);
        chrome.runtime.sendMessage({
          type: 'API_COMPLETE',
          sessionId: sessionId,
          content: content,
          executionLog: executionLog
        }).catch(err => {
          console.warn('[Background] 发送回传消息失败:', err);
        });
      })
      .catch(error => {
        console.error('[Background] API 调用失败:', error);
        // 获取 executionLog（如果可用）
        const executionLog = error.executionLog || [];
        chrome.runtime.sendMessage({
          type: 'API_ERROR',
          sessionId: sessionId,
          error: error.message || 'API 调用失败',
          executionLog: executionLog
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
        const result = await callApiNonStream(messages, config.modelName, {});
        const content = result.content !== undefined ? result.content : result;
        const executionLog = result.executionLog || [];
        
        console.log('[Background] 选中文本工具栏 API 完成，内容长度:', content.length);
        
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            type: 'SELECTION_TOOLBAR_RESULT',
            content: content
          }).catch(() => {
            console.warn('[Background] 发送 SELECTION_TOOLBAR_RESULT 到 tab 失败');
          });
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
