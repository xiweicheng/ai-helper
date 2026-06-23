// chat-manager.js - 聊天管理模块
// 从 index.js 提取的聊天相关函数

import state from './state.js';
import { showToast, adjustInputHeight, getSystemPrompt, getApiParams, ensureChatConfigLoaded, copyToClipboard, escapeHtml, formatDuration, getReactConfig } from './utils.js';
import { addToInputHistory } from './input-history.js';
import { formatMessageContent, addCodeCopyButtons, renderMessageMermaid, formatMarkdown, renderMermaidCharts } from './markdown-render.js';
import { loadSessions, saveCurrentSession, createSession, archiveCurrentSession } from './session-manager.js';
import { renderSessionTabs } from './session-manager-ui.js';

// ============================================================
// 辅助函数（仅在模块内使用）
// ============================================================

function setQuoteContext(content) {
  state.quotedContextText = content;
  const indicator = document.getElementById('selectionIndicator');
  const selectionText = document.getElementById('selectionText');
  const userInput = document.getElementById('userInput');
  
  if (indicator && selectionText && userInput) {
    let displayText;
    if (content.length > 100) {
      displayText = content.substring(0, 100) + '...';
    } else if (content.length > 50) {
      displayText = content.substring(0, 50) + '...';
    } else {
      displayText = content;
    }
    selectionText.textContent = `💬 已引用: ${displayText}`;
    indicator.classList.add('show');
  }
}

export function clearSelectedContext() {
  console.log('[SidePanel] 清除选中内容上下文');
  state.selectedContextText = '';
  state.quotedContextText = '';
  const indicator = document.getElementById('selectionIndicator');
  const userInput = document.getElementById('userInput');
  
  if (indicator) {
    indicator.classList.remove('show');
    console.log('[SidePanel] 已隐藏选中内容提示条');
  }
  
  if (typeof window.hideFloatingMenu === 'function') {
    window.hideFloatingMenu();
  }
  
  if (userInput && userInput.value.startsWith('[选中内容]')) {
    const lines = userInput.value.split('\n');
    const questionStartIndex = lines.findIndex(line => line.startsWith('[用户问题]'));
    if (questionStartIndex !== -1) {
      userInput.value = lines.slice(questionStartIndex + 1).join('\n').trim();
    } else {
      userInput.value = '';
    }
  }
}

// ============================================================
// 聊天历史管理
// ============================================================

export async function loadChatHistory() {
  const sessionsData = await loadSessions();
  
  if (sessionsData.activeSessionId && sessionsData.list.length > 0) {
    state.activeSessionId = sessionsData.activeSessionId;
    state.sessions = sessionsData.list;
    
    const activeSession = sessionsData.list.find(s => s.id === sessionsData.activeSessionId);
    if (activeSession) {
      state.messageHistory = activeSession.messageHistory || [];
      state.currentModel = activeSession.model || state.currentModel;
      state.useTools = activeSession.useTools !== undefined ? activeSession.useTools : state.useTools;
      state.enabledTools = activeSession.enabledTools || state.enabledTools;
      state.temperature = activeSession.temperature !== undefined ? activeSession.temperature : state.temperature;
      state.topP = activeSession.topP !== undefined ? activeSession.topP : state.topP;
    }
    
    state.messageHistory.forEach(msg => {
      addMessage(msg.role, msg.content, false, msg.executionLog || []);
    });
    
    const welcomeMessage = document.querySelector('.welcome-message');
    if (welcomeMessage && state.messageHistory.length > 0) {
      welcomeMessage.remove();
    }
    
    renderMermaidCharts();
    
    chrome.storage.local.get(['scrollPosition'], (result) => {
      if (result.scrollPosition !== undefined) {
        setTimeout(() => {
          const chatContainerEl = document.getElementById('chatContainer');
          chatContainerEl.scrollTop = result.scrollPosition;
        }, 100);
      }
    });
    
    renderSessionTabs();
  } else {
    // 首次打开：自动创建默认会话并渲染标签栏
    await createSession();
    
    const refreshedData = await loadSessions();
    if (refreshedData.activeSessionId) {
      state.activeSessionId = refreshedData.activeSessionId;
      state.sessions = refreshedData.list;
    }
    
    renderSessionTabs();
  }
}

export function saveChatHistory() {
  try {
    saveCurrentSession().catch(err => {
      console.error('[SidePanel] 保存当前会话失败:', err);
    });
  } catch (e) {
    console.error('[SidePanel] 保存对话历史异常:', e);
  }
}

export function clearChatHistory() {
  if (state.messageHistory && state.messageHistory.length > 0) {
    archiveCurrentSession().then(() => {
      state.messageHistory = [];
      const chatContainer = document.getElementById('chatContainer');
      if (chatContainer) {
        chatContainer.innerHTML = '';
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'welcome-message';
        welcomeDiv.innerHTML = `
          <div class="icon-wrapper">
            <div class="icon">💬</div>
          </div>
          <h2>开始对话</h2>
          <p>输入您的问题，AI 助手将为您解答</p>
        `;
        chatContainer.appendChild(welcomeDiv);
      }
      chrome.storage.local.remove('scrollPosition');
      renderSessionTabs();
    });
  }
}

export function exportChatHistory() {
  if (!state.messageHistory || state.messageHistory.length === 0) {
    showToast('当前没有对话历史可导出', 'warning');
    return;
  }
  
  const exportData = state.messageHistory.map((msg, index) => {
    const messageDiv = document.querySelectorAll('.message')[index];
    let timestamp = null;
    
    if (messageDiv && messageDiv.dataset.timestamp) {
      timestamp = messageDiv.dataset.timestamp;
    } else {
      timestamp = new Date().toISOString();
    }
    
    return {
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content || '',
      timestamp: timestamp,
      displayName: msg.role === 'user' ? '我' : 'AI助手'
    };
  });
  
  const now = new Date();
  const ts = now.getFullYear() + 
    String(now.getMonth() + 1).padStart(2, '0') + 
    String(now.getDate()).padStart(2, '0') + '-' + 
    String(now.getHours()).padStart(2, '0') + 
    String(now.getMinutes()).padStart(2, '0') + 
    String(now.getSeconds()).padStart(2, '0');
  
  const fileName = `ai-helper-${ts}.json`;
  const jsonData = JSON.stringify(exportData, null, 2);
  
  const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  console.log('[SidePanel] 对话历史已导出:', fileName, '共', exportData.length, '条消息');
  showToast(`对话历史已导出 (${exportData.length} 条消息)`, 'success');
}

// ============================================================
// 模态框
// ============================================================

export function showModal() {
  const confirmModal = document.getElementById('confirmModal');
  confirmModal.classList.add('show');
}

export function hideModal() {
  const confirmModal = document.getElementById('confirmModal');
  confirmModal.classList.remove('show');
}

// ============================================================
// 消息发送
// ============================================================

export async function sendMessage() {
  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const chatContainer = document.getElementById('chatContainer');
  
  const text = userInput.value.trim();
  if (!text || state.isGenerating) return;
  
  const welcomeMessage = chatContainer.querySelector('.welcome-message');
  if (welcomeMessage) {
    welcomeMessage.remove();
  }

  let finalText = text;
  const hasSelectedContext = state.enableSelectionQuery && state.selectedContextText && state.selectedContextText.trim();
  const hasQuotedContext = state.quotedContextText && state.quotedContextText.trim();
  
  if (hasQuotedContext) {
    const ctx = state.quotedContextText.trim();
    finalText = `[引用内容]\n${ctx}\n\n[用户问题]\n${text}`;
    addContextBubble('quoted', ctx, false);
    state.quotedContextText = '';
  } else if (hasSelectedContext) {
    const ctx = state.selectedContextText.trim();
    finalText = `[选中内容]\n${ctx}\n\n[用户问题]\n${text}`;
    addContextBubble('selected', ctx, false);
    state.selectedContextText = '';
  }
  

  addMessage('user', text);
  
  state.messageHistory.push({ role: 'user', content: finalText });
  
  saveChatHistory();
  
  addToInputHistory(text);

  userInput.value = '';
  userInput.style.height = 'auto';
  
  if (hasSelectedContext || hasQuotedContext) {
    clearSelectedContext();
  }

  state.isGenerating = true;
  sendBtn.disabled = true;

  const loadingId = addLoadingMessage();

  const model = state.currentModel;

  try {
    await ensureChatConfigLoaded();
    
    console.log('[SidePanel] 发送消息调试信息:');
    console.log('  - isolateChat:', state.isolateChat);
    console.log('  - chatConfig:', state.chatConfig);
    console.log('  - messageHistory.length:', state.messageHistory.length);
    
    let messages = [
      {
        role: 'system',
        content: getSystemPrompt()
      }
    ];
    
    if (state.isolateChat) {
      let historyToSend = state.messageHistory;
      if (state.chatConfig.maxMemoryMessages !== null && state.chatConfig.maxMemoryMessages !== undefined && state.chatConfig.maxMemoryMessages > 0) {
        const historyWithoutCurrent = state.messageHistory.slice(0, -1);
        const limitedHistory = historyWithoutCurrent.slice(-state.chatConfig.maxMemoryMessages);
        historyToSend = [...limitedHistory, state.messageHistory[state.messageHistory.length - 1]];
        console.log('[SidePanel] 记忆历史限制生效:', state.chatConfig.maxMemoryMessages, '条（不含当前消息），实际发送:', historyToSend.length, '条');
      } else {
        console.log('[SidePanel] 记忆历史限制未生效:', state.chatConfig.maxMemoryMessages);
      }
      messages = [...messages, ...historyToSend];
    } else {
      messages.push({ role: 'user', content: finalText });
    }

    const apiParams = await getApiParams();
    let content, executionLog;
    
    try {
      const result = await callApi(messages, model, state.useTools, apiParams);
      content = result.content;
      executionLog = result.executionLog || [];
    } catch (errorResult) {
      removeLoadingMessage(loadingId);
      
      content = '❌ 请求失败：' + (errorResult.message || '未知错误');
      executionLog = errorResult.executionLog || [];
      
      const messageDiv = addMessage('assistant', content, true, executionLog);
      
      state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog });
      
      saveChatHistory();
      
      throw errorResult;
    }
    
    removeLoadingMessage(loadingId);
    
    const messageDiv = addMessage('assistant', content, true, executionLog);
    
    await renderMessageMermaid(messageDiv);
    
    state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog });
    
    saveChatHistory();
    
  } catch (error) {
  } finally {
    state.isGenerating = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

// 处理选中文本 AI 搜索：复用现有的选中内容上下文机制
export function triggerSelectionSearch(prompt, selectedText) {
  const userInput = document.getElementById('userInput');
  
  if (!selectedText || state.isGenerating) {
    console.log('[SidePanel] triggerSelectionSearch 跳过:', { hasText: !!selectedText, isGenerating: state.isGenerating });
    return;
  }
  
  // 保存原有的 enableSelectionQuery 状态
  const prevEnableSelectionQuery = state.enableSelectionQuery;
  
  // 设置选中内容上下文（复用现有机制，会显示上下文气泡 + [选中内容] 格式）
  state.enableSelectionQuery = true;
  state.selectedContextText = selectedText;
  state.quotedContextText = '';
  
  // 设置输入框内容为搜索提示词
  const searchPrompt = '搜索一下';
  userInput.value = searchPrompt;
  userInput.dispatchEvent(new Event('input'));
  
  // 发送消息（sendMessage 内部会同步处理 selectedContextText，生成 [选中内容]...[用户问题] 格式）
  sendMessage();
  
  // 上下文处理完成后，临时禁用选中内容查询，防止 setInterval 重复显示指示器
  // 1.5 秒后恢复原有状态（此时页面选中文本已被清除，不会再触发）
  state.enableSelectionQuery = false;
  setTimeout(() => {
    state.enableSelectionQuery = prevEnableSelectionQuery;
  }, 1500);
}

// 填充侧边栏输入框（不自动发送，由用户决定是否发送）
export function fillSidePanelInput(text) {
  const userInput = document.getElementById('userInput');
  if (!userInput || !text) return;
  
  userInput.value = text;
  userInput.dispatchEvent(new Event('input'));
  userInput.focus();
}

// 直接发送文本到侧边栏（填充输入框并自动发送，可选带上选中文本上下文）
export function directSend(text, selectedText = '') {
  const userInput = document.getElementById('userInput');
  if (!userInput || !text || state.isGenerating) return;
  
  // 设置选中内容上下文
  if (selectedText) {
    state.enableSelectionQuery = true;
    state.selectedContextText = selectedText;
    state.quotedContextText = '';
  }
  
  userInput.value = text;
  userInput.dispatchEvent(new Event('input'));
  userInput.focus();
  sendMessage();
  
  // 上下文处理完成后，临时禁用选中内容查询
  if (selectedText) {
    state.enableSelectionQuery = false;
    setTimeout(() => {
      state.enableSelectionQuery = true;
    }, 1500);
  }
}

// ============================================================
// 消息渲染
// ============================================================

export function addContextBubble(type, contextText, scroll = true) {
  const chatContainer = document.getElementById('chatContainer');
  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'user-context-bubble';
  bubbleDiv.dataset.role = 'context';
  
  const icon = type === 'quoted' ? '💬' : '📌';
  const label = type === 'quoted' ? '引用内容' : '选中内容';
  
  bubbleDiv.innerHTML = `
    <div class="context-bubble-inner">
      <div class="context-bubble-header" title="点击展开/收起">
        <span class="context-icon">${icon}</span>
        <span class="context-type">${label}</span>
      </div>
      <div class="context-bubble-content">${escapeHtml(contextText)}</div>
    </div>
  `;
  
  const headerEl = bubbleDiv.querySelector('.context-bubble-header');
  const contentEl = bubbleDiv.querySelector('.context-bubble-content');
  headerEl.addEventListener('click', (e) => {
    e.stopPropagation();
    contentEl.classList.toggle('expanded');
  });
  
  chatContainer.appendChild(bubbleDiv);
  
  if (scroll) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  
  return bubbleDiv;
}

export function addMessage(role, content, scroll = true, executionLog = []) {
  const chatContainer = document.getElementById('chatContainer');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  
  const timestamp = new Date().toISOString();
  messageDiv.dataset.timestamp = timestamp;
  
  messageDiv.dataset.rawContent = content;
  
  messageDiv.dataset.executionLog = JSON.stringify(executionLog);
  
  if (role === 'assistant') {
    messageDiv.innerHTML = formatMessageContent(content);
    const footer = document.createElement('div');
    footer.className = 'message-footer';
    
    const footerCopyBtn = document.createElement('button');
    footerCopyBtn.className = 'copy-btn';
    footerCopyBtn.innerHTML = [
      '<svg viewBox="0 0 16 16" fill="currentColor">',
      '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>',
      '</svg>',
      '<span>复制</span>'
    ].join('');
    footerCopyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyAssistantMessage(messageDiv, footerCopyBtn);
    });
    
    footer.appendChild(footerCopyBtn);
    
    const quoteBtn = document.createElement('button');
    quoteBtn.className = 'quote-btn';
    quoteBtn.innerHTML = [
      '<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>',
      '<span>引用</span>'
    ].join('');
    quoteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      quoteAndAsk(messageDiv);
    });
    
    footer.appendChild(quoteBtn);
    
    const exportMenuContainer = document.createElement('div');
    exportMenuContainer.className = 'export-menu-container';
    
    const exportTriggerBtn = document.createElement('button');
    exportTriggerBtn.className = 'export-trigger-btn';
    exportTriggerBtn.innerHTML = '<svg t="1781245244396" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5115" width="14" height="14"><path d="M496.213333 739.84c2.133333 2.133333 4.693333 3.84 7.68 5.12 0.853333 0.426667 2.133333 0.426667 2.986667 0.853333 1.706667 0.426667 2.986667 0.853333 4.693333 0.853334 5.546667 0 11.093333-2.133333 14.933334-6.4l256-256c8.533333-8.533333 8.533333-21.76 0-30.293334s-21.76-8.533333-30.293334 0L533.333333 674.133333V128c0-11.946667-9.386667-21.333333-21.333333-21.333333s-21.333333 9.386667-21.333333 21.333333v545.706667l-219.306667-219.306667c-8.533333-8.533333-21.76-8.533333-30.293333 0s-8.533333 21.76 0 30.293333l255.146666 255.146667zM768 874.666667H256c-11.946667 0-21.333333 9.386667-21.333333 21.333333s9.386667 21.333333 21.333333 21.333333h512c11.946667 0 21.333333-9.386667 21.333333-21.333333s-9.386667-21.333333-21.333333-21.333333z" fill="#8a8a8a" p-id="5116"></path></svg><span>导出</span><svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>';
    
    const exportDropdown = document.createElement('div');
    exportDropdown.className = 'export-dropdown';
    exportDropdown.innerHTML = [
      '<div class="export-dropdown-item export-docx-item">',
      '<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>',
      '<span>导出 Word</span>',
      '</div>',
      '<div class="export-dropdown-item export-pdf-item">',
      '<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>',
      '<span>导出 PDF</span>',
      '</div>'
    ].join('');
    
    exportDropdown.querySelector('.export-docx-item').addEventListener('click', (e) => {
      e.stopPropagation();
      exportAssistantMessageToDocx(messageDiv, exportTriggerBtn);
      exportDropdown.classList.remove('show');
    });
    
    exportDropdown.querySelector('.export-pdf-item').addEventListener('click', (e) => {
      e.stopPropagation();
      exportAssistantMessageToPdf(messageDiv, exportTriggerBtn);
      exportDropdown.classList.remove('show');
    });
    
    exportTriggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.export-dropdown.show').forEach(menu => {
        if (menu !== exportDropdown) menu.classList.remove('show');
      });
      exportDropdown.classList.toggle('show');
    });
    
    let hoverTimer = null;
    exportMenuContainer.addEventListener('mouseenter', () => {
      hoverTimer = setTimeout(() => {
        document.querySelectorAll('.export-dropdown.show').forEach(menu => {
          if (menu !== exportDropdown) menu.classList.remove('show');
        });
        exportDropdown.classList.add('show');
      }, 300);
    });
    exportMenuContainer.addEventListener('mouseleave', () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      setTimeout(() => {
        if (!exportMenuContainer.matches(':hover') && !exportDropdown.matches(':hover')) {
          exportDropdown.classList.remove('show');
        }
      }, 100);
    });
    
    exportMenuContainer.appendChild(exportTriggerBtn);
    exportMenuContainer.appendChild(exportDropdown);
    footer.appendChild(exportMenuContainer);
    
    if (executionLog && executionLog.length > 0) {
      chrome.storage.local.get('enableExecutionLog', (result) => {
        if (result.enableExecutionLog) {
          const logBtn = document.createElement('button');
          logBtn.className = 'execution-log-btn';
          logBtn.title = '执行日志';
          logBtn.innerHTML = [
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
            '<circle cx="12" cy="12" r="10"></circle>',
            '<polyline points="12 6 12 12 16 14"></polyline>',
            '</svg>'
          ].join('');
          logBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showExecutionLog(executionLog);
          });
          footer.appendChild(logBtn);
        }
      });
    }
    
    messageDiv.appendChild(footer);
  } else {
    const quotedMatch = content.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/);
    const selectedMatch = content.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/);
    const match = quotedMatch || selectedMatch;
    
    if (match) {
      const type = quotedMatch ? 'quoted' : 'selected';
      const contextText = match[1].trim();
      const userQuestion = match[2].trim();
      messageDiv._pendingContext = { type, contextText, userQuestion };
      messageDiv.textContent = userQuestion;
    } else {
      messageDiv.textContent = content;
    }
    
    const toolbar = document.createElement('div');
    toolbar.className = 'message-toolbar';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-toolbar-btn copy-btn';
    copyBtn.title = '复制内容';
    copyBtn.innerHTML = [
      '<svg viewBox="0 0 16 16" fill="currentColor">',
      '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>',
      '</svg>'
    ].join('');
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyMessage(messageDiv, copyBtn);
    });
    
    const editBtn = document.createElement('button');
    editBtn.className = 'message-toolbar-btn edit-btn';
    editBtn.title = '编辑后重新发送';
    editBtn.innerHTML = [
      '<svg viewBox="0 0 16 16" fill="currentColor">',
      '<path d="M12.146.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12h.5a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.468-.325z"/>',
      '</svg>'
    ].join('');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editAndResendMessage(messageDiv);
    });
    
    toolbar.appendChild(copyBtn);
    toolbar.appendChild(editBtn);
    messageDiv.appendChild(toolbar);
  }
  
  chatContainer.appendChild(messageDiv);
  
  if (messageDiv._pendingContext) {
    const { type, contextText } = messageDiv._pendingContext;
    const contextBubble = addContextBubble(type, contextText, false);
    chatContainer.insertBefore(contextBubble, messageDiv);
    delete messageDiv._pendingContext;
  }
  
  if (scroll) {
    const userMessages = chatContainer.querySelectorAll('.message.user');
    if (userMessages.length > 0) {
      const latestUserMessages = userMessages[userMessages.length - 1];
      const prevEl = latestUserMessages.previousElementSibling;
      if (prevEl && prevEl.classList.contains('user-context-bubble')) {
        prevEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        latestUserMessages.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }
  
  if (role === 'assistant') {
    addCodeCopyButtons();
  }
  
  return messageDiv;
}

// ============================================================
// Re-export renderMessageMermaid from markdown-render.js
// ============================================================
export { renderMessageMermaid };

// ============================================================
// 执行日志渲染
// ============================================================

function getStatusText(status) {
  const statusMap = {
    'success': '成功',
    'failed': '失败',
    'processing': '处理中'
  };
  return statusMap[status] || status;
}

function renderExecutionTimeline(executionLog) {
  const sortedLog = [...executionLog].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const totalCount = sortedLog.length;
  
  let result = '';
  let currentSubtaskIndex = null;
  
  sortedLog.forEach((entry, index) => {
    const isSubtask = entry.nodeType === 'subtask';
    const isToolExec = entry.nodeType === 'tool_exec';
    const isApiCall = entry.nodeType === 'api_call';
    const isPreselect = entry.nodeType === 'preselect';
    const isPlanTask = isToolExec && entry.action?.name === 'plan_task';
    
    if (isSubtask) {
      currentSubtaskIndex = entry.subtaskIndex;
    }
    
    let indentClass = '';
    let nodeIcon = '';
    
    if (isPreselect) {
      nodeIcon = '📡';
    } else if (isPlanTask) {
      indentClass = 'plan-task-level';
      nodeIcon = '📋';
    } else if (isSubtask) {
      indentClass = 'subtask-level';
      nodeIcon = '🔀';
    } else if (isToolExec && currentSubtaskIndex !== null) {
      indentClass = 'tool-level';
      nodeIcon = '🔧';
    } else if (isApiCall && currentSubtaskIndex !== null) {
      indentClass = 'api-level';
      nodeIcon = '📡';
    } else if (isToolExec) {
      nodeIcon = '⚡';
    } else if (isApiCall) {
      nodeIcon = '📡';
    }
    
    let statusIcon = '○';
    let statusClass = entry.status || 'processing';
    if (entry.status === 'success') {
      statusIcon = '✓';
    } else if (entry.status === 'failed') {
      statusIcon = '✗';
    }
    
    let nodeName = escapeHtml(entry.nodeName || '未知节点');
    
    if (entry.subtaskIndex !== null && entry.subtaskIndex >= 0) {
      nodeName = `<span class="subtask-badge">${entry.subtaskIndex + 1}</span> ${nodeName}`;
    }
    
    if (entry.subtaskCount) {
      nodeName += ` <span class="plan-badge">(${entry.subtaskCount}个子任务, ${entry.strategy === 'sequential' ? '顺序执行' : '并行执行'})</span>`;
    }
    
    if ((isApiCall || isPreselect) && entry.apiRequest) {
      const info = [];
      if (entry.apiRequest.messageCount !== undefined && entry.apiRequest.messageCount !== null) {
        info.push(`💬<span title="本次模型API调用携带的消息数">${entry.apiRequest.messageCount}条</span>`);
      }
      if (!isPreselect && entry.apiRequest.toolCount !== undefined && entry.apiRequest.toolCount !== null) {
        info.push(`🔧<span title="本次模型API调用携带的工具定义数">${entry.apiRequest.toolCount}个</span>`);
      }
      if (info.length > 0) {
        nodeName += ` <span class="api-info-badge">（${info.join(' ')}）</span>`;
      }
    }
    
    result += `
      <div class="timeline-item ${indentClass}" data-status="${entry.status || 'processing'}" data-node-type="${entry.nodeType || ''}">
        <div class="timeline-line"></div>
        <div class="timeline-dot ${statusClass}">
          ${statusIcon}
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="expand-icon">▼</span>
            <span class="node-icon">${nodeIcon}</span>
            <span class="iteration-badge">[${index + 1}/${totalCount}]</span>
            <span class="node-name" title="${escapeHtml(entry.nodeName || '未知节点')}">${nodeName}</span>
            <span class="duration-badge" title="耗时">${formatDuration(entry.duration || 0)}</span>
          </div>
          
          <div class="timeline-details">
            ${entry.thought && entry.thought.trim() ? `
            <div class="timeline-section">
              <div class="section-title">💡 思考</div>
              <div class="section-content">${escapeHtml(entry.thought)}</div>
            </div>
            ` : ''}
            
            ${!isPreselect && entry.action ? `
            <div class="timeline-section">
              <div class="section-title">⚡ 工具调用</div>
              <div class="section-content">
                <strong>工具:</strong> ${escapeHtml(entry.action.name)}<br>
                <strong>参数:</strong> <code>${escapeHtml(JSON.stringify(entry.action.params, null, 2))}</code>
              </div>
            </div>
            ` : ''}
            
            ${isPreselect && entry.action?.params?.selected ? `
            <div class="timeline-section">
              <div class="section-title">🔍 筛选结果</div>
              <div class="section-content">
                <strong>选中工具:</strong> ${entry.action.params.selected.map(t => escapeHtml(t)).join(', ')}<br>
                <strong>数量:</strong> ${entry.action.params.selected.length} 个
              </div>
            </div>
            ` : ''}
            
            ${entry.observation ? `
            <div class="timeline-section">
              <div class="section-title">📝 观察结果</div>
              <div class="section-content">${escapeHtml(entry.observation)}</div>
            </div>
            ` : ''}
            
            ${entry.apiRequest ? `
            <div class="timeline-section">
              <div class="section-title">📡 API 请求</div>
              <div class="section-content">
                ${entry.apiRequest.model ? `<strong>模型:</strong> ${escapeHtml(entry.apiRequest.model)}<br>` : ''}
                ${entry.apiRequest.temperature !== undefined ? `<strong>温度:</strong> ${entry.apiRequest.temperature}<br>` : ''}
                ${entry.apiRequest.top_p !== undefined ? `<strong>top_p:</strong> ${entry.apiRequest.top_p}<br>` : ''}
                ${entry.apiRequest.messageCount !== undefined ? `<strong>消息数:</strong> ${entry.apiRequest.messageCount}<br>` : ''}
                ${!isPreselect && entry.apiRequest.toolCount !== undefined ? `<strong>工具数:</strong> ${entry.apiRequest.toolCount}<br>` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.apiResponse ? `
            <div class="timeline-section">
              <div class="section-title">📤 API 响应</div>
              <div class="section-content">
                ${entry.apiResponse.finishReason ? `<strong>完成原因:</strong> ${escapeHtml(entry.apiResponse.finishReason)}<br>` : ''}
                ${entry.apiResponse.toolCountAfter !== undefined ? `<strong>筛选后工具数:</strong> ${entry.apiResponse.toolCountAfter} 个<br>` : ''}
                ${entry.apiResponse.tokenUsage ? `
                  <strong>Token 使用:</strong><br>
                  - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                  - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                  - Total: ${entry.apiResponse.tokenUsage.total_tokens || 0}
                ` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.error ? `
            <div class="timeline-section error">
              <div class="section-title">❌ 错误信息</div>
              <div class="section-content">${escapeHtml(entry.error)}</div>
            </div>
            ` : ''}
            
            ${entry.result ? `
            <div class="timeline-section">
              <div class="section-title">✅ 子任务结果</div>
              <div class="section-content">${escapeHtml(entry.result)}</div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  });
  
  return result;
}

function renderExecutionLogForPanel(executionLog) {
  const sortedLog = [...executionLog].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // 检测是否有任务组信息
  const hasTaskGroups = sortedLog.some(entry => entry.taskGroup);
  
  if (!hasTaskGroups) {
    // 如果没有任务组信息，使用原来的渲染方式
    return renderExecutionLogOriginal(sortedLog);
  }
  
  // 按任务组分组
  const taskGroups = new Map();
  let currentTaskGroup = null;
  let mainTasks = [];
  
  sortedLog.forEach(entry => {
    if (entry.taskGroup) {
      if (!taskGroups.has(entry.taskGroup)) {
        taskGroups.set(entry.taskGroup, {
          groupId: entry.taskGroup,
          groupIndex: entry.taskGroupIndex,
          groupName: entry.taskGroupName,
          entries: [],
          status: entry.status
        });
      }
      taskGroups.get(entry.taskGroup).entries.push(entry);
      if (entry.status) {
        taskGroups.get(entry.taskGroup).status = entry.status;
      }
    } else {
      mainTasks.push(entry);
    }
  });
  
  // 渲染主任务日志（不在任何任务组中的日志）
  let result = renderMainTasks(mainTasks, sortedLog.length);
  
  // 渲染任务组
  taskGroups.forEach((group, groupId) => {
    const groupStatus = group.status || 'processing';
    const statusIcon = groupStatus === 'success' ? '✓' : (groupStatus === 'failed' ? '✗' : '○');
    const statusClass = groupStatus;
    
    result += `
      <div class="task-group-container" data-group-id="${groupId}">
        <div class="task-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <div class="task-group-line"></div>
          <div class="task-group-dot ${statusClass}">
            ${statusIcon}
          </div>
          <div class="task-group-content">
            <div class="task-group-title">
              <span class="task-group-expand-icon">▼</span>
              <span class="task-group-icon">📁</span>
              <span class="task-group-index">${group.groupIndex}</span>
              <span class="task-group-name">${escapeHtml(group.groupName)}</span>
              <span class="task-group-count">(${group.entries.length} 步骤)</span>
            </div>
          </div>
        </div>
        <div class="task-group-timeline">
          ${renderTaskGroupEntries(group.entries, sortedLog.length)}
        </div>
      </div>
    `;
  });
  
  return result;
}

/**
 * 渲染主任务日志（不在任务组中的日志）
 */
function renderMainTasks(mainTasks, totalCount) {
  if (mainTasks.length === 0) return '';
  
  let result = '';
  
  result += `
    <div class="main-tasks-container">
      <div class="main-tasks-header">
        <div class="main-tasks-line"></div>
        <div class="main-tasks-dot processing">
          ◉
        </div>
        <div class="main-tasks-content">
          <div class="main-tasks-title">
            <span class="main-tasks-icon">🏠</span>
            <span class="main-tasks-name">主任务</span>
            <span class="main-tasks-count">(${mainTasks.length} 步骤)</span>
          </div>
        </div>
      </div>
      <div class="main-tasks-timeline">
  `;
  
  mainTasks.forEach((entry, index) => {
    result += renderSingleEntry(entry, index, totalCount);
  });
  
  result += `
      </div>
    </div>
  `;
  
  return result;
}

/**
 * 渲染任务组内的日志条目
 */
function renderTaskGroupEntries(entries, totalCount) {
  let result = '';
  entries.forEach((entry, index) => {
    result += renderSingleEntry(entry, index, totalCount);
  });
  return result;
}

/**
 * 渲染单个日志条目
 */
function renderSingleEntry(entry, index, totalCount) {
  const isSubtask = entry.nodeType === 'subtask';
  const isToolExec = entry.nodeType === 'tool_exec';
  const isApiCall = entry.nodeType === 'api_call';
  const isPreselect = entry.nodeType === 'preselect';
  const isPlanTask = isToolExec && entry.action?.name === 'plan_task';
  
  let indentClass = '';
  let nodeIcon = '';
  
  if (isPreselect) {
    nodeIcon = '📡';
  } else if (isPlanTask) {
    indentClass = 'plan-task-level';
    nodeIcon = '📋';
  } else if (isSubtask) {
    indentClass = 'subtask-level';
    nodeIcon = '🔀';
  } else if (isToolExec) {
    indentClass = 'tool-level';
    nodeIcon = '🔧';
  } else if (isApiCall) {
    indentClass = 'api-level';
    nodeIcon = '📡';
  } else if (isToolExec) {
    nodeIcon = '⚡';
  } else if (isApiCall) {
    nodeIcon = '📡';
  }
  
  let statusIcon = '○';
  let statusClass = entry.status || 'processing';
  if (entry.status === 'success') {
    statusIcon = '✓';
  } else if (entry.status === 'failed') {
    statusIcon = '✗';
  }
  
  let nodeName = escapeHtml(entry.nodeName || '未知节点');
  
  if (entry.subtaskCount) {
    nodeName += ` <span class="plan-badge">(${entry.subtaskCount}个子任务, ${entry.strategy === 'sequential' ? '顺序执行' : '并行执行'})</span>`;
  }
  
  if ((isApiCall || isPreselect) && entry.apiRequest) {
    const info = [];
    if (entry.apiRequest.messageCount !== undefined && entry.apiRequest.messageCount !== null) {
      info.push(`💬<span title="本次模型API调用携带的消息数">${entry.apiRequest.messageCount}条</span>`);
    }
    if (!isPreselect && entry.apiRequest.toolCount !== undefined && entry.apiRequest.toolCount !== null) {
      info.push(`🔧<span title="本次模型API调用携带的工具定义数">${entry.apiRequest.toolCount}个</span>`);
    }
    if (info.length > 0) {
      nodeName += ` <span class="api-info-badge">（${info.join(' ')}）</span>`;
    }
  }
  
  return `
    <div class="timeline-item ${indentClass}">
      <div class="timeline-line"></div>
      <div class="timeline-dot ${statusClass}">
        ${statusIcon}
      </div>
      <div class="timeline-content">
        <div class="timeline-header">
          <span class="expand-icon">▼</span>
          <span class="node-icon">${nodeIcon}</span>
          <span class="iteration-badge">[${index + 1}/${totalCount}]</span>
          <span class="node-name" title="${escapeHtml(entry.nodeName || '未知节点')}">${nodeName}</span>
          <span class="duration-badge" title="耗时">${formatDuration(entry.duration)}</span>
        </div>
        
        <div class="timeline-details">
          ${entry.thought && entry.thought.trim() ? `
          <div class="timeline-section">
            <div class="section-title">💡 思考</div>
            <div class="section-content">${escapeHtml(entry.thought)}</div>
          </div>
          ` : ''}
          
          ${!isPreselect && entry.action ? `
          <div class="timeline-section">
            <div class="section-title">⚡ 工具调用</div>
            <div class="section-content">
              <strong>工具:</strong> ${escapeHtml(entry.action.name)}<br>
              <strong>参数:</strong> <code>${escapeHtml(JSON.stringify(entry.action.params, null, 2))}</code>
            </div>
          </div>
          ` : ''}
          
          ${isPreselect && entry.action?.params?.selected ? `
          <div class="timeline-section">
            <div class="section-title">🔍 筛选结果</div>
            <div class="section-content">
              <strong>选中工具:</strong> ${entry.action.params.selected.map(t => escapeHtml(t)).join(', ')}<br>
              <strong>数量:</strong> ${entry.action.params.selected.length} 个
            </div>
          </div>
          ` : ''}
          
          ${entry.observation ? `
          <div class="timeline-section">
            <div class="section-title">📝 观察结果</div>
            <div class="section-content">${escapeHtml(entry.observation)}</div>
          </div>
          ` : ''}
          
          ${entry.apiRequest ? `
          <div class="timeline-section">
            <div class="section-title">📡 API 请求</div>
            <div class="section-content">
              ${entry.apiRequest.model ? `<strong>模型:</strong> ${escapeHtml(entry.apiRequest.model)}<br>` : ''}
              ${entry.apiRequest.temperature !== undefined ? `<strong>温度:</strong> ${entry.apiRequest.temperature}<br>` : ''}
              ${entry.apiRequest.top_p !== undefined ? `<strong>top_p:</strong> ${entry.apiRequest.top_p}<br>` : ''}
              ${entry.apiRequest.messageCount !== undefined ? `<strong>消息数:</strong> ${entry.apiRequest.messageCount}<br>` : ''}
              ${!isPreselect && entry.apiRequest.toolCount !== undefined ? `<strong>工具数:</strong> ${entry.apiRequest.toolCount}<br>` : ''}
            </div>
          </div>
          ` : ''}
          
          ${entry.apiResponse ? `
          <div class="timeline-section">
            <div class="section-title">📤 API 响应</div>
            <div class="section-content">
              ${entry.apiResponse.finishReason ? `<strong>完成原因:</strong> ${escapeHtml(entry.apiResponse.finishReason)}<br>` : ''}
              ${entry.apiResponse.toolCountAfter !== undefined ? `<strong>筛选后工具数:</strong> ${entry.apiResponse.toolCountAfter} 个<br>` : ''}
              ${entry.apiResponse.tokenUsage ? `
                <strong>Token 使用:</strong><br>
                - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                - Total: ${entry.apiResponse.tokenUsage.total_tokens || 0}
              ` : ''}
            </div>
          </div>
          ` : ''}
          
          ${entry.error ? `
          <div class="timeline-section error">
            <div class="section-title">❌ 错误信息</div>
            <div class="section-content">${escapeHtml(entry.error)}</div>
          </div>
          ` : ''}
          
          ${entry.result ? `
          <div class="timeline-section">
            <div class="section-title">✅ 子任务结果</div>
            <div class="section-content">${escapeHtml(entry.result)}</div>
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * 原来的日志渲染方式（保留用于没有任务组的场景）
 */
function renderExecutionLogOriginal(sortedLog) {
  let result = '';
  let currentSubtaskIndex = null;
  
  sortedLog.forEach((entry, index) => {
    const isSubtask = entry.nodeType === 'subtask';
    const isToolExec = entry.nodeType === 'tool_exec';
    const isApiCall = entry.nodeType === 'api_call';
    const isPreselect = entry.nodeType === 'preselect';
    const isPlanTask = isToolExec && entry.action?.name === 'plan_task';
    
    if (isSubtask) {
      currentSubtaskIndex = entry.subtaskIndex;
    }
    
    let indentClass = '';
    let nodeIcon = '';
    
    if (isPreselect) {
      nodeIcon = '📡';
    } else if (isPlanTask) {
      indentClass = 'plan-task-level';
      nodeIcon = '📋';
    } else if (isSubtask) {
      indentClass = 'subtask-level';
      nodeIcon = '🔀';
    } else if (isToolExec && currentSubtaskIndex !== null) {
      indentClass = 'tool-level';
      nodeIcon = '🔧';
    } else if (isApiCall && currentSubtaskIndex !== null) {
      indentClass = 'api-level';
      nodeIcon = '📡';
    } else if (isToolExec) {
      nodeIcon = '⚡';
    } else if (isApiCall) {
      nodeIcon = '📡';
    }
    
    let statusIcon = '○';
    let statusClass = entry.status || 'processing';
    if (entry.status === 'success') {
      statusIcon = '✓';
    } else if (entry.status === 'failed') {
      statusIcon = '✗';
    }
    
    let nodeName = escapeHtml(entry.nodeName || '未知节点');
    
    if (entry.subtaskId) {
      nodeName = `<span class="subtask-badge">${currentSubtaskIndex !== null ? currentSubtaskIndex + 1 : ''}</span> ${nodeName}`;
    }
    
    if (entry.subtaskCount) {
      nodeName += ` <span class="plan-badge">(${entry.subtaskCount}个子任务, ${entry.strategy === 'sequential' ? '顺序执行' : '并行执行'})</span>`;
    }
    
    if ((isApiCall || isPreselect) && entry.apiRequest) {
      const info = [];
      if (entry.apiRequest.messageCount !== undefined && entry.apiRequest.messageCount !== null) {
        info.push(`💬<span title="本次模型API调用携带的消息数">${entry.apiRequest.messageCount}条</span>`);
      }
      if (!isPreselect && entry.apiRequest.toolCount !== undefined && entry.apiRequest.toolCount !== null) {
        info.push(`🔧<span title="本次模型API调用携带的工具定义数">${entry.apiRequest.toolCount}个</span>`);
      }
      if (info.length > 0) {
        nodeName += ` <span class="api-info-badge">（${info.join(' ')}）</span>`;
      }
    }
    
    result += `
      <div class="timeline-item ${indentClass}">
        <div class="timeline-line"></div>
        <div class="timeline-dot ${statusClass}">
          ${statusIcon}
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="expand-icon">▼</span>
            <span class="node-icon">${nodeIcon}</span>
            <span class="iteration-badge">[${index + 1}/${sortedLog.length}]</span>
            <span class="node-name" title="${escapeHtml(entry.nodeName || '未知节点')}">${nodeName}</span>
            <span class="duration-badge" title="耗时">${formatDuration(entry.duration)}</span>
          </div>
          
          <div class="timeline-details">
            ${entry.thought && entry.thought.trim() ? `
            <div class="timeline-section">
              <div class="section-title">💡 思考</div>
              <div class="section-content">${escapeHtml(entry.thought)}</div>
            </div>
            ` : ''}
            
            ${!isPreselect && entry.action ? `
            <div class="timeline-section">
              <div class="section-title">⚡ 工具调用</div>
              <div class="section-content">
                <strong>工具:</strong> ${escapeHtml(entry.action.name)}<br>
                <strong>参数:</strong> <code>${escapeHtml(JSON.stringify(entry.action.params, null, 2))}</code>
              </div>
            </div>
            ` : ''}
            
            ${isPreselect && entry.action?.params?.selected ? `
            <div class="timeline-section">
              <div class="section-title">🔍 筛选结果</div>
              <div class="section-content">
                <strong>选中工具:</strong> ${entry.action.params.selected.map(t => escapeHtml(t)).join(', ')}<br>
                <strong>数量:</strong> ${entry.action.params.selected.length} 个
              </div>
            </div>
            ` : ''}
            
            ${entry.observation ? `
            <div class="timeline-section">
              <div class="section-title">📝 观察结果</div>
              <div class="section-content">${escapeHtml(entry.observation)}</div>
            </div>
            ` : ''}
            
            ${entry.apiRequest ? `
            <div class="timeline-section">
              <div class="section-title">📡 API 请求</div>
              <div class="section-content">
                ${entry.apiRequest.model ? `<strong>模型:</strong> ${escapeHtml(entry.apiRequest.model)}<br>` : ''}
                ${entry.apiRequest.temperature !== undefined ? `<strong>温度:</strong> ${entry.apiRequest.temperature}<br>` : ''}
                ${entry.apiRequest.top_p !== undefined ? `<strong>top_p:</strong> ${entry.apiRequest.top_p}<br>` : ''}
                ${entry.apiRequest.messageCount !== undefined ? `<strong>消息数:</strong> ${entry.apiRequest.messageCount}<br>` : ''}
                ${!isPreselect && entry.apiRequest.toolCount !== undefined ? `<strong>工具数:</strong> ${entry.apiRequest.toolCount}<br>` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.apiResponse ? `
            <div class="timeline-section">
              <div class="section-title">📤 API 响应</div>
              <div class="section-content">
                ${entry.apiResponse.finishReason ? `<strong>完成原因:</strong> ${escapeHtml(entry.apiResponse.finishReason)}<br>` : ''}
                ${entry.apiResponse.toolCountAfter !== undefined ? `<strong>筛选后工具数:</strong> ${entry.apiResponse.toolCountAfter} 个<br>` : ''}
                ${entry.apiResponse.tokenUsage ? `
                  <strong>Token 使用:</strong><br>
                  - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                  - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                  - Total: ${entry.apiResponse.tokenUsage.total_tokens || 0}
                ` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.error ? `
            <div class="timeline-section error">
              <div class="section-title">❌ 错误信息</div>
              <div class="section-content">${escapeHtml(entry.error)}</div>
            </div>
            ` : ''}
            
            ${entry.result ? `
            <div class="timeline-section">
              <div class="section-title">✅ 子任务结果</div>
              <div class="section-content">${escapeHtml(entry.result)}</div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  });
  
  return result;
}

function updateRealtimeExecutionLogPanel(status) {
  const panel = document.querySelector('.execution-log-panel.realtime-mode');
  if (!panel) return;
  
  // 更新"执行中"节点名称
  const executingNode = panel.querySelector('.realtime-executing-node');
  if (executingNode) {
    executingNode.textContent = status.nodeName || '处理中...';
  }
  
  const executionLog = status.executionLog || [];
  const totalCount = executionLog.length;
  const successCount = executionLog.filter(entry => entry.status === 'success').length;
  const failedCount = executionLog.filter(entry => entry.status === 'failed').length;
  const subtaskCount = executionLog.filter(entry => entry.nodeType === 'subtask').length;
  const completedSubtasks = executionLog.filter(entry => entry.nodeType === 'subtask' && entry.status === 'success').length;
  
  // 更新统计数字
  const comboValue = panel.querySelector('.combo-value');
  const statSuccess = panel.querySelector('.combo-stat.success .stat-value');
  const statFailed = panel.querySelector('.combo-stat.failed .stat-value');
  const statSubtask = panel.querySelector('.combo-stat.subtask');
  
  if (comboValue) comboValue.textContent = totalCount;
  if (statSuccess) statSuccess.textContent = successCount;
  if (statFailed) statFailed.textContent = failedCount;
  if (statSubtask) {
    if (subtaskCount > 0) {
      statSubtask.style.display = '';
      statSubtask.querySelector('.stat-value').textContent = `${completedSubtasks}/${subtaskCount}`;
    } else {
      statSubtask.style.display = 'none';
    }
  }
  
  // 更新 timeline
  const timeline = panel.querySelector('.timeline');
  timeline.innerHTML = executionLog.length > 0
    ? renderExecutionTimeline(executionLog)
    : '<div class="realtime-waiting-message">等待执行中...</div>';
  
  // 自动滚动到底部
  timeline.scrollTop = timeline.scrollHeight;
}

function showRealtimeExecutionLogPanel(loadingId) {
  const existingPanel = document.querySelector('.execution-log-panel.realtime-mode');
  if (existingPanel) {
    existingPanel.remove();
  }
  
  const panel = document.createElement('div');
  panel.className = 'execution-log-panel realtime-mode';
  
  panel.innerHTML = `
    <div class="log-container">
      <div class="log-header">
        <div class="log-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <h3>实时执行日志</h3>
        </div>
        <div class="log-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>
      
      <div class="log-summary">
        <div class="realtime-executing-indicator">
          <span class="realtime-pulse-dot"></span>
          <span class="realtime-executing-label">执行中:</span>
          <span class="realtime-executing-node">准备中...</span>
        </div>
        <div class="summary-combo">
          <div class="combo-main">
            <span class="combo-icon">◉</span>
            <span class="combo-label">总节点</span>
            <span class="combo-value">0</span>
          </div>
          <div class="combo-stats">
            <div class="combo-stat success" data-status="success">
              <span class="stat-icon">✓</span>
              <span class="stat-label">成功</span>
              <span class="stat-value">0</span>
            </div>
            <div class="combo-stat failed" data-status="failed">
              <span class="stat-icon">✗</span>
              <span class="stat-label">失败</span>
              <span class="stat-value">0</span>
            </div>
            <div class="combo-stat subtask" data-status="subtask" style="display:none">
              <span class="stat-icon">🔀</span>
              <span class="stat-label">子任务</span>
              <span class="stat-value">0/0</span>
            </div>
          </div>
        </div>
        <div class="summary-actions">
          <button class="toggle-expand-btn" title="展开全部节点">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="7 13 12 18 17 13"></polyline>
              <polyline points="7 6 12 11 17 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="timeline">
        <div class="realtime-waiting-message">等待执行中...</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // 关闭按钮
  const closeBtn = panel.querySelector('.log-close');
  closeBtn.addEventListener('click', () => {
    panel.remove();
  });
  
  // 点击遮罩关闭
  panel.addEventListener('click', (e) => {
    if (e.target === panel) {
      panel.remove();
    }
  });
  
  // 展开/收起全部
  const toggleExpandBtn = panel.querySelector('.toggle-expand-btn');
  let isExpanded = false;
  toggleExpandBtn.addEventListener('click', () => {
    isExpanded = !isExpanded;
    const timelineContents = panel.querySelectorAll('.timeline-content');
    timelineContents.forEach(content => {
      if (isExpanded) {
        content.classList.add('expanded');
      } else {
        content.classList.remove('expanded');
      }
    });
    
    const svg = toggleExpandBtn.querySelector('svg');
    if (isExpanded) {
      svg.innerHTML = '<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>';
      toggleExpandBtn.setAttribute('title', '收起全部节点');
    } else {
      svg.innerHTML = '<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>';
      toggleExpandBtn.setAttribute('title', '展开全部节点');
    }
  });
  
  // 单条展开/收起（事件委托）
  panel.addEventListener('click', (e) => {
    const header = e.target.closest('.timeline-header');
    if (header) {
      const content = header.parentElement;
      content.classList.toggle('expanded');
    }
  });
  
  // 按状态筛选
  panel.addEventListener('click', (e) => {
    const target = e.target.closest('.combo-stat[data-status]');
    if (!target) return;
    
    const status = target.dataset.status;
    const isActive = target.classList.contains('active');
    
    panel.querySelectorAll('.combo-stat[data-status]').forEach(item => {
      item.classList.remove('active');
    });
    
    const timelineItems = panel.querySelectorAll('.timeline-item');
    
    if (!isActive) {
      target.classList.add('active');
      
      timelineItems.forEach(timelineItem => {
        if (status === 'subtask') {
          const nodeType = timelineItem.dataset.nodeType;
          if (nodeType === 'subtask') {
            timelineItem.style.display = '';
          } else {
            timelineItem.style.display = 'none';
          }
        } else {
          const dot = timelineItem.querySelector('.timeline-dot');
          if (dot && dot.classList.contains(status)) {
            timelineItem.style.display = '';
          } else {
            timelineItem.style.display = 'none';
          }
        }
      });
    } else {
      timelineItems.forEach(timelineItem => {
        timelineItem.style.display = '';
      });
    }
  });
  
  if (state.currentExecutionStatus) {
    updateRealtimeExecutionLogPanel(state.currentExecutionStatus);
  }
}

function toggleRealtimeExecutionLog(loadingId) {
  const existingPanel = document.querySelector('.execution-log-panel.realtime-mode');
  if (existingPanel) {
    existingPanel.remove();
    return;
  }
  
  showRealtimeExecutionLogPanel(loadingId);
}

function updateExecutionStatus(loadingId, nodeName, status, executionLog) {
  const loadingDiv = document.getElementById(loadingId);
  if (!loadingDiv) return;
  
  console.log('[SidePanel] updateExecutionStatus 被调用:', nodeName, status, '日志数量:', executionLog?.length);
  
  const nodeNameSpan = loadingDiv.querySelector('.current-node-name');
  if (nodeNameSpan) {
    nodeNameSpan.textContent = nodeName || '处理中...';
    nodeNameSpan.title = nodeName || '';
  }
  
  if (!state.currentExecutionStatus) {
    state.currentExecutionStatus = {
      nodeName: nodeName,
      status: status,
      executionLog: []
    };
  } else {
    if (!state.currentExecutionStatus.executionLog) {
      state.currentExecutionStatus.executionLog = [];
    }
    
    if (executionLog && executionLog.length > 0) {
      executionLog.forEach(newEntry => {
        const existingIndex = state.currentExecutionStatus.executionLog.findIndex(
          existing => existing.id === newEntry.id
        );
        if (existingIndex !== -1) {
          const existingEntry = state.currentExecutionStatus.executionLog[existingIndex];
          state.currentExecutionStatus.executionLog[existingIndex] = {
            ...newEntry,
            subtaskIndex: newEntry.subtaskIndex ?? existingEntry.subtaskIndex,
            subtaskId: newEntry.subtaskId ?? existingEntry.subtaskId,
            subtaskName: newEntry.subtaskName ?? existingEntry.subtaskName
          };
        } else {
          state.currentExecutionStatus.executionLog.push(newEntry);
        }
      });
    }
    
    state.currentExecutionStatus.nodeName = nodeName;
    state.currentExecutionStatus.status = status;
  }
  
  const realtimePanel = document.querySelector('.execution-log-panel.realtime-mode');
  if (realtimePanel) {
    updateRealtimeExecutionLogPanel(state.currentExecutionStatus);
  }
}

// ============================================================
// 加载消息 / API 调用
// ============================================================

export function addLoadingMessage() {
  const chatContainer = document.getElementById('chatContainer');
  const loadingId = 'loading-' + Date.now();
  
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading-message';
  loadingDiv.id = loadingId;
  loadingDiv.innerHTML = `
    <div class="loading-content">
      <div class="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span class="loading-text">思考中...</span>
      <button class="stop-task-btn" title="停止任务">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </button>
      <div class="execution-status-container" style="display: none;">
        <button class="execution-log-toggle-btn" title="查看执行日志">
          <svg viewBox="0 0 1024 1024">
            <path d="M512 5.12C230.4 5.12 5.12 230.4 5.12 512s225.28 506.88 506.88 506.88 506.88-225.28 506.88-506.88S793.6 5.12 512 5.12z m0 92.16c107.52 0 215.04 46.08 291.84 122.88s122.88 184.32 122.88 291.84-46.08 215.04-122.88 291.84-184.32 122.88-291.84 122.88-215.04-46.08-291.84-122.88-122.88-184.32-122.88-291.84 46.08-215.04 122.88-291.84S404.48 97.28 512 97.28zM430.08 327.68h-5.12c-5.12 0-5.12 5.12-5.12 5.12v353.28l5.12 5.12h20.48l250.88-168.96s5.12 0 5.12-5.12V512v-5.12s0-5.12-5.12-5.12l-256-168.96c-5.12 0-5.12 0-10.24-5.12z" fill="#707070"></path>
          </svg>
        </button>
        <span class="current-node-name">准备中...</span>
      </div>
    </div>
  `;
  
  chatContainer.appendChild(loadingDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
  const stopBtn = loadingDiv.querySelector('.stop-task-btn');
  const loadingText = loadingDiv.querySelector('.loading-text');
  if (stopBtn) {
    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      stopBtn.disabled = true;
      stopBtn.style.opacity = '0.6';
      stopBtn.style.cursor = 'not-allowed';
      if (loadingText) {
        loadingText.textContent = '停止中...';
      }
      chrome.runtime.sendMessage({ type: 'CANCEL_REACT', tabId: null, sessionId: state.activeSessionId });
    });
  }
  
  // 始终同步注册执行日志监听器，避免竞态（storage.get 是异步的）
  state.executionLogListener = (message, sender, sendResponse) => {
    // 过滤：只处理属于当前会话或没有 sessionId 的消息（兼容）
    if (message.sessionId && message.sessionId !== state.activeSessionId) {
      return false;
    }
    if (message.type === 'EXECUTION_STATUS_UPDATE') {
      console.log('[SidePanel] 收到执行状态更新:', message.nodeName, message.status, '日志数量:', message.executionLog?.length);
      updateExecutionStatus(loadingId, message.nodeName, message.status, message.executionLog);
      return false;
    }
    return false;
  };
  chrome.runtime.onMessage.addListener(state.executionLogListener);

  // enableExecutionLog 只控制面板是否显示
  chrome.storage.local.get('enableExecutionLog', (result) => {
    const enableExecutionLog = result.enableExecutionLog || false;
    if (enableExecutionLog) {
      const statusContainer = loadingDiv.querySelector('.execution-status-container');
      if (statusContainer) {
        statusContainer.style.display = 'flex';
      }
    }
  });
  
  const logToggleBtn = loadingDiv.querySelector('.execution-log-toggle-btn');
  if (logToggleBtn) {
    logToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleRealtimeExecutionLog(loadingId);
    });
  }
  
  return loadingId;
}

export function removeLoadingMessage(loadingId) {
  const loadingDiv = document.getElementById(loadingId);
  if (loadingDiv) {
    const loadingText = loadingDiv.querySelector('.loading-text');
    if (loadingText) {
      loadingText.textContent = '思考中...';
    }
    loadingDiv.remove();
  }
  
  if (state.executionLogListener) {
    chrome.runtime.onMessage.removeListener(state.executionLogListener);
    state.executionLogListener = null;
  }
  
  state.currentExecutionStatus = null;
  
  const realtimePanel = document.querySelector('.execution-log-panel.realtime-mode');
  if (realtimePanel) {
    realtimePanel.remove();
  }
}

export async function callApi(messages, model, useTools = false, apiParams = {}) {
  const reactConfig = await getReactConfig();
  const timeoutMs = reactConfig.loopTimeout;
  
  return new Promise((resolve, reject) => {
    let executionLog = [];
    const timeoutSeconds = Math.round(timeoutMs / 1000);
    
    let timeoutId = setTimeout(() => {
      removeListener();
      chrome.runtime.sendMessage({
        type: 'CANCEL_REACT',
        tabId: state.currentTabId,
        sessionId: state.activeSessionId
      }).catch(err => {
        console.log('[SidePanel] 发送取消请求失败:', err.message);
      });
      reject({
        message: `请求超时（${timeoutSeconds}秒）`,
        executionLog: executionLog
      });
    }, timeoutMs);
    
    const loopStartTime = Date.now();
    let totalPausedDuration = 0;
    let pauseStartTime = null;
    
    const pauseTimeout = () => {
      if (pauseStartTime === null && timeoutId !== null) {
        pauseStartTime = Date.now();
        clearTimeout(timeoutId);
        timeoutId = null;
        console.log('[SidePanel] 前端超时已暂停（澄清工具执行中）');
      }
    };
    
    const resumeTimeout = () => {
      if (pauseStartTime !== null) {
        const pauseDuration = Date.now() - pauseStartTime;
        totalPausedDuration += pauseDuration;
        pauseStartTime = null;
        
        const elapsedTime = Date.now() - loopStartTime;
        const remainingTime = timeoutMs + totalPausedDuration - elapsedTime;
        
        if (remainingTime <= 0) {
          removeListener();
          reject({
            message: `请求超时（${timeoutSeconds}秒）`,
            executionLog: executionLog
          });
          return;
        }
        
        timeoutId = setTimeout(() => {
          removeListener();
          chrome.runtime.sendMessage({
            type: 'CANCEL_REACT',
            tabId: state.currentTabId,
            sessionId: state.activeSessionId
          }).catch(err => {
            console.log('[SidePanel] 发送取消请求失败:', err.message);
          });
          reject({
            message: `请求超时（${timeoutSeconds}秒）`,
            executionLog: executionLog
          });
        }, remainingTime);
        
        console.log('[SidePanel] 前端超时已恢复，暂停时长:', Math.round(pauseDuration / 1000), 's，剩余时间:', Math.round(remainingTime / 1000), 's');
      }
    };

    const listener = (message) => {
      console.log('[SidePanel] 收到消息:', message);
      
      // 过滤：只处理属于当前会话或没有 sessionId 的消息（兼容）
      if (message.sessionId && message.sessionId !== state.activeSessionId) {
        return false;
      }
      
      if (message.type === 'EXECUTION_STATUS_UPDATE') {
        executionLog = message.executionLog || [];
        return false;
      }
      
      if (message.type === 'CLARIFY_START') {
        pauseTimeout();
        return false;
      }
      
      if (message.type === 'CLARIFY_END') {
        resumeTimeout();
        return false;
      }
      
      if (message.type === 'API_COMPLETE') {
        if (timeoutId) clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(listener);
        resolve({ 
          content: message.content, 
          executionLog: message.executionLog || executionLog 
        });
        return false;
      } else if (message.type === 'API_ERROR') {
        if (timeoutId) clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(listener);
        reject({
          message: message.error,
          executionLog: message.executionLog || executionLog
        });
        return false;
      }
      return false;
    };
    
    chrome.runtime.onMessage.addListener(listener);
    
    const removeListener = () => {
      chrome.runtime.onMessage.removeListener(listener);
    };

    console.log('[SidePanel] 发送 CALL_API 消息，useTools:', useTools, 'tabId:', state.currentTabId, 'sessionId:', state.activeSessionId, 'apiParams:', apiParams, 'timeout:', timeoutMs);
    chrome.runtime.sendMessage({
      type: 'CALL_API',
      sessionId: state.activeSessionId,
      messages: messages,
      model: model,
      useTools: useTools,
      tabId: state.currentTabId,
      apiParams: apiParams
    });
  });
}

// ============================================================
// 执行日志面板
// ============================================================

function showExecutionLog(executionLog) {
  const existingPanel = document.querySelector('.execution-log-panel');
  if (existingPanel) {
    existingPanel.remove();
  }
  
  const panel = document.createElement('div');
  panel.className = 'execution-log-panel';
  
  const totalDuration = executionLog.reduce((sum, entry) => sum + (entry.duration || 0), 0);
  const successCount = executionLog.filter(entry => entry.status === 'success').length;
  const failedCount = executionLog.filter(entry => entry.status === 'failed').length;
  const subtaskCount = executionLog.filter(entry => entry.nodeType === 'subtask').length;
  const completedSubtasks = executionLog.filter(entry => entry.nodeType === 'subtask' && entry.status === 'success').length;
  const planTaskCount = executionLog.filter(entry => entry.nodeType === 'tool_exec' && entry.action?.name === 'plan_task' && entry.status === 'success').length;
  
  panel.innerHTML = `
    <div class="log-container">
      <div class="log-header">
        <div class="log-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <h3>执行日志</h3>
          ${planTaskCount > 0 ? `<span class="log-badge">任务拆解</span>` : ''}
        </div>
        <div class="log-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>
      
      <div class="log-summary">
        <div class="summary-item" title="总耗时: ${formatDuration(totalDuration)}">
          <svg class="summary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="summary-label">总耗时</span>
          <span class="summary-value">${formatDuration(totalDuration)}</span>
        </div>
        <div class="summary-combo" title="总节点: ${executionLog.length}">
          <div class="combo-main">
            <span class="combo-icon">◉</span>
            <span class="combo-label">总节点</span>
            <span class="combo-value">${executionLog.length}</span>
          </div>
          <div class="combo-stats">
            <div class="combo-stat success" data-status="success" title="成功: ${successCount}">
              <span class="stat-icon">✓</span>
              <span class="stat-label">成功</span>
              <span class="stat-value">${successCount}</span>
            </div>
            <div class="combo-stat failed" data-status="failed" title="失败: ${failedCount}">
              <span class="stat-icon">✗</span>
              <span class="stat-label">失败</span>
              <span class="stat-value">${failedCount}</span>
            </div>
            ${subtaskCount > 0 ? `
            <div class="combo-stat subtask" data-status="subtask" title="子任务: ${completedSubtasks}/${subtaskCount}">
              <span class="stat-icon">🔀</span>
              <span class="stat-label">子任务</span>
              <span class="stat-value">${completedSubtasks}/${subtaskCount}</span>
            </div>
            ` : ''}
          </div>
        </div>
        <div class="summary-actions">
          <button class="toggle-expand-btn" title="展开全部节点">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="7 13 12 18 17 13"></polyline>
              <polyline points="7 6 12 11 17 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="timeline">
        ${renderExecutionLogForPanel(executionLog)}
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  panel.addEventListener('click', (e) => {
    if (e.target === panel) {
      panel.remove();
    }
  });
  
  const logCloseBtn = panel.querySelector('.log-close');
  logCloseBtn.addEventListener('click', () => {
    panel.remove();
  });
  
  const toggleExpandBtn = panel.querySelector('.toggle-expand-btn');
  const timelineContents = panel.querySelectorAll('.timeline-content');
  let isExpanded = false;
  
  toggleExpandBtn.addEventListener('click', () => {
    isExpanded = !isExpanded;
    timelineContents.forEach(content => {
      if (isExpanded) {
        content.classList.add('expanded');
      } else {
        content.classList.remove('expanded');
      }
    });
    
    const svg = toggleExpandBtn.querySelector('svg');
    if (isExpanded) {
      svg.innerHTML = '<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>';
      toggleExpandBtn.setAttribute('title', '收起全部节点');
    } else {
      svg.innerHTML = '<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>';
      toggleExpandBtn.setAttribute('title', '展开全部节点');
    }
  });
  
  const timelineHeaders = panel.querySelectorAll('.timeline-header');
  timelineHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const content = header.parentElement;
      content.classList.toggle('expanded');
    });
  });
  
  const filterableItems = panel.querySelectorAll('.combo-stat');
  const timelineItems = panel.querySelectorAll('.timeline-item');
  
  filterableItems.forEach(item => {
    item.addEventListener('click', () => {
      const status = item.dataset.status;
      const isActive = item.classList.contains('active');
      
      filterableItems.forEach(i => i.classList.remove('active'));
      
      if (!isActive) {
        item.classList.add('active');
        
        timelineItems.forEach(timelineItem => {
          if (status === 'subtask') {
            if (timelineItem.classList.contains('subtask-level')) {
              timelineItem.style.display = '';
            } else {
              timelineItem.style.display = 'none';
            }
          } else {
            const dot = timelineItem.querySelector('.timeline-dot');
            if (dot && dot.classList.contains(status)) {
              timelineItem.style.display = '';
            } else {
              timelineItem.style.display = 'none';
            }
          }
        });
      } else {
        timelineItems.forEach(timelineItem => {
          timelineItem.style.display = '';
        });
      }
    });
  });
}

// ============================================================
// 消息操作（复制、编辑、引用、导出）
// ============================================================

function copyMessage(messageDiv, copyBtn) {
  try {
    const textToCopy = messageDiv.dataset.rawContent || '';
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
      `;
      copyBtn.classList.add('copied');
      
      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
        copyBtn.classList.remove('copied');
      }, 2000);
    }).catch(err => {
      console.error('[SidePanel] 复制失败:', err);
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
        `;
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (e) {
        showToast('复制失败', 'error');
      }
      document.body.removeChild(textArea);
    });
  } catch (error) {
    console.error('[SidePanel] 复制失败:', error);
    showToast('复制失败', 'error');
  }
}

function editAndResendMessage(messageDiv) {
  try {
    const textToEdit = messageDiv.dataset.rawContent || '';
    
    if (!textToEdit) {
      showToast('无法获取消息内容', 'error');
      return;
    }
    
    const userInput = document.getElementById('userInput');
    userInput.value = textToEdit;
    
    adjustInputHeight();
    
    userInput.focus();
    userInput.selectionStart = userInput.selectionEnd = userInput.value.length;
    
    console.log('[SidePanel] 已加载消息内容到输入框，等待用户编辑后发送');
  } catch (error) {
    console.error('[SidePanel] 编辑消息失败:', error);
    showToast('编辑失败: ' + error.message, 'error');
  }
}

function copyAssistantMessage(messageDiv, copyBtn) {
  try {
    let textToCopy = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';
    
    if (!textToCopy) {
      const lastMsg = state.messageHistory.find(msg => msg.role === 'assistant');
      if (lastMsg) {
        textToCopy = lastMsg.content;
      } else {
        const markdownBody = messageDiv.querySelector('.markdown-body');
        if (markdownBody) {
          textToCopy = markdownBody.innerText;
        } else {
          textToCopy = messageDiv.innerText;
        }
      }
    }
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已复制</span>
      `;
      copyBtn.classList.add('copied');
      
      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
        copyBtn.classList.remove('copied');
      }, 2000);
    }).catch(err => {
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
          <span>已复制</span>
        `;
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (e) {
        showToast('复制失败，请手动选择内容复制', 'error');
      }
      document.body.removeChild(textArea);
    });
  } catch (error) {
    console.error('[SidePanel] 复制失败:', error);
    showToast('复制失败', 'error');
  }
}

function exportAssistantMessageToDocx(messageDiv, exportBtn) {
  try {
    let markdownContent = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';
    
    if (!markdownContent) {
      const markdownBody = messageDiv.querySelector('.markdown-body');
      if (markdownBody) {
        markdownContent = markdownBody.innerText;
      } else {
        markdownContent = messageDiv.innerText;
      }
    }
    
    const htmlContent = formatMarkdown(markdownContent);
    
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>AI Helper 导出</title>
        <style>
          body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
            padding: 20px;
          }
          h1, h2, h3, h4, h5, h6 {
            margin-top: 16pt;
            margin-bottom: 8pt;
          }
          h1 { font-size: 18pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h2 { font-size: 15pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h3 { font-size: 13pt; }
          p { margin: 8pt 0; }
          code {
            font-family: 'Consolas', 'Courier New', monospace;
            background-color: #f5f5f5;
            padding: 2pt 4pt;
            border-radius: 3px;
            font-size: 10pt;
          }
          pre {
            background-color: #f5f5f5;
            padding: 10pt;
            border-radius: 5px;
            overflow-x: auto;
          }
          pre code {
            background-color: transparent;
            padding: 0;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 10pt 0;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 6pt 10pt;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
            font-weight: bold;
          }
          blockquote {
            border-left: 4px solid #ddd;
            margin: 10pt 0;
            padding: 5pt 15pt;
            color: #666;
          }
          ul, ol {
            margin: 8pt 0;
            padding-left: 25pt;
          }
          li { margin: 4pt 0; }
          a { color: #0563c1; text-decoration: none; }
          a:hover { text-decoration: underline; }
          img { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;
    
    const blob = new Blob(['\uFEFF', fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().getTime();
    link.download = `word-${timestamp}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    const originalHTML = exportBtn.innerHTML;
    exportBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已导出</span>
    `;
    
    setTimeout(() => {
      exportBtn.innerHTML = originalHTML;
    }, 2000);
    
    console.log('[SidePanel] Word 文档导出成功');
  } catch (error) {
    console.error('[SidePanel] 导出 Word 失败:', error);
    showToast('导出失败: ' + error.message, 'error');
  }
}

function exportAssistantMessageToPdf(messageDiv, exportBtn) {
  try {
    let markdownContent = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';
    
    if (!markdownContent) {
      const markdownBody = messageDiv.querySelector('.markdown-body');
      if (markdownBody) {
        markdownContent = markdownBody.innerText;
      } else {
        markdownContent = messageDiv.innerText;
      }
    }
    
    const htmlContent = formatMarkdown(markdownContent);
    
    const footerText = `AI Helper - ${new Date().toLocaleString('zh-CN')}`;
    
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>AI Helper 导出</title>
        <style>
          @page {
            size: A4;
            margin: 20mm;
          }
          body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
            padding: 20px;
          }
          h1, h2, h3, h4, h5, h6 {
            margin-top: 16pt;
            margin-bottom: 8pt;
            page-break-after: avoid;
          }
          h1 { font-size: 18pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h2 { font-size: 15pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h3 { font-size: 13pt; }
          p { margin: 8pt 0; page-break-inside: avoid; }
          code {
            font-family: 'Consolas', 'Courier New', monospace;
            background-color: #f5f5f5;
            padding: 2pt 4pt;
            border-radius: 3px;
            font-size: 10pt;
          }
          pre {
            background-color: #f5f5f5;
            padding: 10pt;
            border-radius: 5px;
            overflow-x: auto;
            page-break-inside: avoid;
          }
          pre code {
            background-color: transparent;
            padding: 0;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 10pt 0;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 6pt 10pt;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
            font-weight: bold;
          }
          blockquote {
            border-left: 4px solid #ddd;
            margin: 10pt 0;
            padding: 5pt 15pt;
            color: #666;
          }
          ul, ol {
            margin: 8pt 0;
            padding-left: 25pt;
          }
          li { margin: 4pt 0; }
          a { color: #0563c1; text-decoration: none; }
          a:hover { text-decoration: underline; }
          img { max-width: 100%; height: auto; page-break-inside: avoid; }
          .footer {
            margin-top: 30pt;
            padding-top: 10pt;
            border-top: 1px solid #ddd;
            font-size: 9pt;
            color: #999;
            text-align: center;
          }
        </style>
      </head>
      <body>
        ${htmlContent}
        <div class="footer">${footerText}</div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      showToast('请允许弹出窗口以使用 PDF 导出功能', 'warning');
      return;
    }
    
    printWindow.document.write(fullHtml);
    printWindow.document.close();
    
    printWindow.onload = function() {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 500);
    };
    
    const originalHTML = exportBtn.innerHTML;
    exportBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已触发</span>
    `;
    
    setTimeout(() => {
      exportBtn.innerHTML = originalHTML;
    }, 2000);
    
    console.log('[SidePanel] PDF 导出已触发');
  } catch (error) {
    console.error('[SidePanel] 导出 PDF 失败:', error);
    showToast('导出失败: ' + error.message, 'error');
  }
}

function quoteAndAsk(messageDiv) {
  try {
    const content = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';
    
    if (!content) {
      console.warn('[SidePanel] 无法获取消息内容');
      return;
    }
    
    const userInput = document.getElementById('userInput');
    if (!userInput) {
      console.warn('[SidePanel] 找不到输入框');
      return;
    }
    
    const quoteBtn = messageDiv.querySelector('.quote-btn');
    const originalHTML = quoteBtn ? quoteBtn.innerHTML : '';
    
    setQuoteContext(content);
    
    if (quoteBtn) {
      quoteBtn.innerHTML = `
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已引用</span>
      `;
      quoteBtn.classList.add('quoted');
      
      setTimeout(() => {
        quoteBtn.innerHTML = originalHTML;
        quoteBtn.classList.remove('quoted');
      }, 2000);
    }
    
    userInput.focus();
    
    console.log('[SidePanel] 已引用消息内容到提示条，输入框已获取焦点');
  } catch (error) {
    console.error('[SidePanel] 引用提问失败:', error);
    showToast('引用失败: ' + error.message, 'error');
  }
}
