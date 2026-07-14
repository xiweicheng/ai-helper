// chat-manager.js - 聊天管理模块
// 从 index.js 提取的聊天相关函数

import state from './state.js';
import { showToast, adjustInputHeight, getSystemPrompt, getApiParams, ensureChatConfigLoaded, copyToClipboard, escapeHtml, formatDuration, getReactConfig } from './utils.js';
import { getCurrentAgentPrompt, getCurrentAgentToolIds } from './agent-manager.js';
import { addToInputHistory } from './input-history.js';
import { formatMessageContent, addCodeCopyButtons, renderMessageMermaid, formatMarkdown, renderMermaidCharts, addTableToolbarEvents } from './markdown-render.js';
import { loadSessions, saveCurrentSession, createSession, archiveCurrentSession, appendMessageToSession, importSessions } from './session-manager.js';
import { renderSessionTabs } from './session-manager-ui.js';
import { ICON_COPY_16, ICON_IMAGE_24, ICON_CLOCK_24, ICON_QUOTE_1024, ICON_EXPORT_1024, ICON_WORD_1024, ICON_PDF_1024, ICON_DROPDOWN_ARROW } from './icons.js';
import { loadAndShowPrototype } from './ui-prototype.js';
import { estimateTokens, estimateMessagesTokens, assessContextPressure, getContextWindow, trimMessagesByBudget, compressQuotedContext, generateMessagesSummary, getMessageBudget } from '../shared/token-counter.js';

// 从提取的子模块导入
import { renderExecutionTimeline, renderExecutionLogForPanel, updateRealtimeExecutionLogPanel, showRealtimeExecutionLogPanel, toggleRealtimeExecutionLog, updateExecutionStatus } from './execution-log-render.js';
import { showExportDialog, hideExportDialog, performExport, initExportDialogEvents, triggerImportDialog, handleImportFile } from './export-import.js';
import { openImagePreview, initImagePreviewOverlay, compressAndAttachImage, renderImagePreviewsFromChat, buildUserContent, stripImagesFromContent } from './image-preview.js';
import { buildFileContentText, clearFiles, getFileIcon, formatFileSize } from './file-extract.js';
import { getSkillContextText, clearSkillSelection, getMcpContextText, clearMcpService } from './skill-selector.js';
import { clearPageSelection } from './page-selector.js';

// 从提取的子模块重导出（保持对外接口不变）
export { showExportDialog, hideExportDialog, performExport, initExportDialogEvents, triggerImportDialog, handleImportFile };
export { openImagePreview, initImagePreviewOverlay, compressAndAttachImage, renderImagePreviewsFromChat, buildUserContent, stripImagesFromContent };

// ============================================================
// pendingCallApiSessionIds 持久化帮助函数
// 防止 Side Panel 重开后丢失后台任务状态
// ============================================================

const PENDING_SESSIONS_KEY = 'pendingCallApiSessions';

export function syncPendingSessionsToStorage() {
  chrome.storage.session.set({ [PENDING_SESSIONS_KEY]: [...state.pendingCallApiSessionIds] }).catch(() => {});
}

export async function restorePendingSessionsFromStorage() {
  try {
    const result = await chrome.storage.session.get([PENDING_SESSIONS_KEY]);
    if (result[PENDING_SESSIONS_KEY] && Array.isArray(result[PENDING_SESSIONS_KEY])) {
      state.pendingCallApiSessionIds = new Set(result[PENDING_SESSIONS_KEY]);
    }
  } catch (e) {
    // 忽略恢复错误
  }
}

// ============================================================
// 辅助函数（仅在模块内使用）
// ============================================================

function extractTextContent(content) {
  // 可能是数组格式（含图片时）
  if (Array.isArray(content)) {
    return content.filter(c => c.type === 'text').map(c => c.text).join('');
  }
  // 可能是 JSON 字符串格式的数组（从 dataset.rawContent 读取时）
  if (typeof content === 'string' && content.startsWith('[')) {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.filter(c => c.type === 'text').map(c => c.text).join('');
      }
    } catch (e) { /* not JSON, treat as plain text */ }
  }
  return content;
}

function setQuoteContext(content) {
  const textContent = extractTextContent(content);
  state.quotedContextText = textContent;
  const indicator = document.getElementById('selectionIndicator');
  const selectionText = document.getElementById('selectionText');
  const userInput = document.getElementById('userInput');
  
  if (indicator && selectionText && userInput) {
    let displayText;
    if (textContent.length > 100) {
      displayText = textContent.substring(0, 100) + '...';
    } else if (textContent.length > 50) {
      displayText = textContent.substring(0, 50) + '...';
    } else {
      displayText = textContent;
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
      // enabledTools 由智能体独立 key 管理，不再从会话恢复（此处可能导致竞态条件覆盖正确值）
      state.temperature = activeSession.temperature !== undefined ? activeSession.temperature : state.temperature;
      state.topP = activeSession.topP !== undefined ? activeSession.topP : state.topP;
      // 恢复会话绑定的智能体 ID
      state.activeAgentId = activeSession.agentId || null;
    }
    
    state.messageHistory.forEach(msg => {
      // 从 executionLog 中检测是否有 revised 决策
      let wasRevised = msg.wasRevised;
      if (!wasRevised && msg.executionLog) {
        try {
          const logs = typeof msg.executionLog === 'string' ? JSON.parse(msg.executionLog) : msg.executionLog;
          wasRevised = logs.some(e => e.nodeType === 'reflection' && e.reflectionType === 'post' && e.action?.decision === 'revised');
        } catch {}
      }
      
      // 恢复上下文气泡（技能、MCP、文件、网页、引用/选中内容）
      // 注意：quoted/selected 类型不在此处理，由 addMessage 内部解析 [引用内容]/[选中内容] 格式时统一渲染，
      // 避免刷新后重复显示引用气泡
      if (msg.role === 'user' && msg.contextBubbles && Array.isArray(msg.contextBubbles)) {
        msg.contextBubbles.forEach(bubble => {
          let bubbleText = '';
          switch (bubble.type) {
            case 'skill':
              bubbleText = `使用技能「${bubble.name}」进行问答${bubble.description ? '：' + bubble.description : ''}`;
              break;
            case 'mcp':
              bubbleText = `使用MCP服务「${bubble.serverName}」进行问答`;
              break;
            case 'page':
              bubbleText = `网页「${bubble.title}」\n${bubble.url}`;
              break;
            case 'file':
              bubbleText = `${bubble.name} (${formatFileSize(bubble.size || 0)})`;
              break;
          }
          if (bubbleText) {
            addContextBubble(bubble.type, bubbleText, false);
          }
        });
      }
      
      // 如果有保存的 HTML 内容（流式消息），直接恢复完整 DOM
      if (msg.htmlContent) {
        restoreMessageFromHtml(msg.htmlContent, msg.messageId);
      } else {
        addMessage(msg.role, msg.content, false, msg.executionLog || [], msg.reflectionScore, wasRevised, null, msg.messageId);
      }
    });

    // 消息恢复完成后统一绑定事件委托（避免 restoreMessageFromHtml 逐条调用重复绑定）
    bindExecutionLogDelegate();
    bindReflectionBadgeDelegate();
    
    const welcomeMessage = document.querySelector('.welcome-message');
    if (welcomeMessage && state.messageHistory.length > 0) {
      welcomeMessage.remove();
    }
    
    renderMermaidCharts();
    addCodeCopyButtons();
    
    const scrollKey = 'scrollPosition_' + (state.activeSessionId || 'default');
    chrome.storage.local.get([scrollKey], (result) => {
      if (result[scrollKey] !== undefined) {
        setTimeout(() => {
          const chatContainerEl = document.getElementById('chatContainer');
          chatContainerEl.scrollTop = result[scrollKey];
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

export async function saveChatHistoryAsync() {
  try {
    await saveCurrentSession();
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
      chrome.storage.local.remove('scrollPosition_' + (state.activeSessionId || 'default'));
      renderSessionTabs();
    });
  }
}

// ============================================================
// 导出/导入会话 → 已提取至 export-import.js（重导出保持接口不变）
// ============================================================
//
// 原内容已移至 export-import.js，本文件通过 re-export 保持对外接口不变。
// 如需修改导出/导入逻辑，请编辑 export-import.js。

const _export_import_separator = null; // placeholder

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
// 图片预览 → 已提取至 image-preview.js（重导出保持接口不变）
// ============================================================

// ============================================================
// 消息发送
// ============================================================

export async function sendMessage() {
  const userInput = document.getElementById('userInput');
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
  
  // 收集上下文气泡信息，用于持久化保存和刷新恢复
  const contextBubbles = [];
  
  if (hasQuotedContext) {
    const ctx = state.quotedContextText.trim();
    // 压缩大段引用内容，防止永久占据上下文空间
    const { compressed: compressedCtx, wasCompressed } = compressQuotedContext(ctx);
    finalText = `[引用内容${wasCompressed ? '摘要' : ''}]\n${compressedCtx}\n\n[用户问题]\n${text}`;
    // 先添加独立引用内容气泡
    addContextBubble('quoted', ctx, false);
    contextBubbles.push({ type: 'quoted', text: ctx });
    state.quotedContextText = '';
  } else if (hasSelectedContext) {
    const ctx = state.selectedContextText.trim();
    const { compressed: compressedCtx, wasCompressed } = compressQuotedContext(ctx);
    finalText = `[选中内容${wasCompressed ? '摘要' : ''}]\n${compressedCtx}\n\n[用户问题]\n${text}`;
    // 先添加独立选中内容气泡
    addContextBubble('selected', ctx, false);
    contextBubbles.push({ type: 'selected', text: ctx });
    state.selectedContextText = '';
  }

  // 注入技能上下文（如果已选中技能）
  const skillContext = getSkillContextText();
  if (skillContext) {
    finalText = skillContext + finalText;
    // 添加技能上下文气泡（用户可见）
    addContextBubble('skill', `使用技能「${state.selectedSkill.name}」进行问答${state.selectedSkill.description ? '：' + state.selectedSkill.description : ''}`, false);
    contextBubbles.push({ type: 'skill', name: state.selectedSkill.name, description: state.selectedSkill.description || '' });
    // 清除技能指示器（技能信息已注入消息和气泡，编辑时可恢复）
    clearSkillSelection();
  }

  // 注入 MCP 服务上下文（如果已选中 MCP 服务）
  const mcpContext = getMcpContextText();
  if (mcpContext) {
    finalText = mcpContext + finalText;
    // 添加 MCP 上下文气泡
    addContextBubble('mcp', `使用MCP服务「${state.selectedMcpService.serverName}」进行问答`, false);
    contextBubbles.push({ type: 'mcp', serverName: state.selectedMcpService.serverName });
    // 清除 MCP 指示器
    clearMcpService();
  }

  // 注入网页上下文（如果已选中网页）
  if (state.selectedPage) {
    const pageCtx = `[网页上下文]\n标题: ${state.selectedPage.title}\nURL: ${state.selectedPage.url}\ntabId: ${state.selectedPage.id}\n`;
    finalText = pageCtx + finalText;
    // 添加网页上下文气泡
    addContextBubble('page', `网页「${state.selectedPage.title}」\n${state.selectedPage.url}`, false);
    contextBubbles.push({ type: 'page', title: state.selectedPage.title, url: state.selectedPage.url });
    // 清除网页指示器
    clearPageSelection();
  }
  

  // 注入文件内容（发送给模型，但不显示在用户消息气泡中）
  const attachedFilesSnapshot = state.attachedFiles.slice();
  if (attachedFilesSnapshot.length > 0) {
    const fileContent = buildFileContentText();
    if (fileContent) {
      finalText += fileContent;
    }
    // 收集文件信息用于持久化
    attachedFilesSnapshot.forEach(f => {
      if (f.status === 'done') {
        contextBubbles.push({ type: 'file', name: f.name, size: f.size, fileType: f.type });
      }
    });
  }

  // 显示用户消息（仅展示用户输入的文字+文件标签，上下文内容已通过上方独立气泡展示）
  // rawTextContent 参数传入完整上下文格式，供编辑时恢复
  // attachedFilesSnapshot 用于渲染文件标签
  const { messageId: userMsgId } = addMessage('user', buildUserContent(text), true, [], null, false, finalText, null, attachedFilesSnapshot);
  
  // 消息历史存储拼接后的完整上下文内容（附带上下文气泡信息）
  state.messageHistory.push({ role: 'user', content: buildUserContent(finalText), messageId: userMsgId, contextBubbles });
  
  saveChatHistory();
  
  addToInputHistory(text);
  state.inputHistoryIndex = -1;

  userInput.value = '';
  userInput.style.height = 'auto';
  
  if (hasSelectedContext || hasQuotedContext) {
    clearSelectedContext();
  }

  state.isGenerating = true;

  const mySessionId = state.activeSessionId;
  const loadingId = addLoadingMessage();

  const model = state.enableImageInput && state.attachedImages.length > 0
    ? (state.imageModelName || state.currentModel)
    : state.currentModel;

  // 图片数据已包含在 userContent 中，立即清除并隐藏预览栏 DOM
  if (state.attachedImages.length > 0) {
    const previewBar = document.getElementById('imagePreviewBar');
    if (previewBar) {
      previewBar.innerHTML = '';
      previewBar.style.display = 'none';
    }
  }

  // 文件内容已注入到消息中，清除文件附件
  if (state.attachedFiles.length > 0) {
    clearFiles();
  }

  try {
    await ensureChatConfigLoaded();
    
    // 获取当前 Agent 及其工具配置
    const currentAgent = await getCurrentAgentPrompt();
    const agentToolIds = getCurrentAgentToolIds(currentAgent);
    state.activeAgentToolIds = agentToolIds;
    
    console.log('[SidePanel] 发送消息调试信息:');
    console.log('  - agent:', currentAgent ? currentAgent.name : '默认助手');
    console.log('  - agentToolIds:', agentToolIds);
    console.log('  - isolateChat:', state.isolateChat);
    console.log('  - chatConfig:', state.chatConfig);
    console.log('  - messageHistory.length:', state.messageHistory.length);
    
    let messages = [
      {
        role: 'system',
        content: await getSystemPrompt(currentAgent)
      }
    ];
    
    if (state.isolateChat) {
      let historyToSend = state.messageHistory;
      // Token 预算驱动：根据模型上下文窗口动态裁剪，替代固定条数限制
      const configuredWindow = 0;
      const messageBudget = getMessageBudget(model, state.enabledTools.length, configuredWindow, state.customModelMap);
      // 历史消息占用预算的 70%（预留给工具结果和模型输出）
      const historyBudget = Math.floor(messageBudget * 0.7);
      
      const historyWithoutCurrent = state.messageHistory.slice(0, -1);
      const currentMsg = state.messageHistory[state.messageHistory.length - 1];
      
      // 从后往前保留历史消息，直到 token 量在预算内
      const keptHistory = [];
      let keptTokens = estimateMessagesTokens([currentMsg]);
      for (let i = historyWithoutCurrent.length - 1; i >= 0; i--) {
        const msg = historyWithoutCurrent[i];
        const msgTokens = estimateMessagesTokens([msg]);
        if (keptTokens + msgTokens <= historyBudget) {
          keptHistory.unshift(msg);
          keptTokens += msgTokens;
        } else {
          break;
        }
      }
      
      // 如果有被裁剪的历史消息，生成摘要注入 system prompt
      if (keptHistory.length < historyWithoutCurrent.length) {
        const trimmedCount = historyWithoutCurrent.length - keptHistory.length;
        const trimmedMsgs = historyWithoutCurrent.slice(0, trimmedCount);
        const summary = generateMessagesSummary(trimmedMsgs);
        if (summary) {
          // 控制摘要长度不超过 SYSTEM_PROMPT_BUDGET 的 50%，避免 system prompt 膨胀
          const SUMMARY_MAX_TOKENS = 1000;
          const summaryTokens = estimateTokens(summary);
          const truncatedSummary = summaryTokens > SUMMARY_MAX_TOKENS
            ? summary.substring(0, SUMMARY_MAX_TOKENS * 4) + '\n...[历史摘要已截断]'
            : summary;
          messages[0] = { ...messages[0], content: messages[0].content + '\n\n' + truncatedSummary };
        }
        console.log(`[SidePanel] Token 预算裁剪: 保留 ${keptHistory.length} 条历史消息, 裁剪 ${trimmedCount} 条 (预算: ${historyBudget} tokens)`);
      } else {
        console.log(`[SidePanel] Token 预算内: ${keptHistory.length} 条历史消息 (预算: ${historyBudget} tokens)`);
      }
      
      historyToSend = [...keptHistory, currentMsg];
      messages = [...messages, ...historyToSend];
      // 剥离历史消息中的旧图片数据，只保留当前最新消息的图片
      for (let i = 0; i < messages.length - 1; i++) {
        messages[i] = { ...messages[i], content: stripImagesFromContent(messages[i].content) };
      }
    } else {
      // 构建用户消息 content（支持图片附件）
      const userContent = buildUserContent(finalText);
      messages.push({ role: 'user', content: userContent });
    }

    const apiParams = await getApiParams();
    apiParams._loadingId = loadingId;  // 用于 STREAM_START 时准确定位当前会话的 loading 消息

    // 上下文压力评估 + 主动裁剪：critical 压力时裁剪到安全范围内
    const configuredWindow = 0;
    const msgTokens = estimateMessagesTokens(messages);
    const contextWindow = getContextWindow(model, configuredWindow, state.customModelMap);
    const pressure = assessContextPressure(msgTokens, contextWindow);
    console.log(`[SidePanel] 发送上下文: ${msgTokens} tokens (消息: ${messages.length} 条), 压力: ${pressure.level}(${Math.round(pressure.ratio * 100)}%)`);
    
    if (pressure.level === 'critical') {
      console.warn('[SidePanel] 上下文压力过高，主动裁剪...');
      const budget = getMessageBudget(model, state.enabledTools.length, configuredWindow, state.customModelMap);
      const trimResult = trimMessagesByBudget(messages, budget, { generateSummary: false });
      messages = trimResult.messages;
      console.warn(`[SidePanel] 已主动裁剪: ${msgTokens} → ${estimateMessagesTokens(messages)} tokens (${trimResult.trimmedCount} 条)`);
    }

    let content, executionLog, reflectionScore, wasRevised = false, wasStreamed = false;
    let streamingHtml = null;
    let streamingConnected = true;
    let streamingMsgId = null;
    
    try {
      const result = await callApi(messages, model, state.useTools, apiParams);
      content = result.content;
      executionLog = result.executionLog || [];
      reflectionScore = result.reflectionScore;
      wasRevised = result.wasRevised || false;
      wasStreamed = result.wasStreamed || false;
      streamingHtml = result.streamingHtml || null;
      streamingConnected = result.streamingConnected !== undefined ? result.streamingConnected : true;
      streamingMsgId = result.streamingMsgId || null;
    } catch (errorResult) {
      // 检查是否已切换到其他会话
      if (state.activeSessionId !== mySessionId) {
        // 保存结果到原会话的历史中，不修改当前 DOM
        if (errorResult.message === '任务已被用户停止') {
          appendMessageToSession(mySessionId, { role: 'assistant', content: '任务已取消', executionLog: errorResult.executionLog || [] });
        } else {
          appendMessageToSession(mySessionId, { role: 'assistant', content: '❌ 请求失败：' + (errorResult.message || '未知错误'), executionLog: errorResult.executionLog || [] });
        }
        // 后台写入后清除该会话的 DOM 缓存，确保切回时能看到最新消息
        document.dispatchEvent(new CustomEvent('session-cache-invalidate', { detail: { sessionId: mySessionId } }));
        removeLoadingMessage(loadingId);
        state.substituteLoadingIds.delete(mySessionId);
        return;
      }
      
      // 用户主动取消：显示取消记录，但不作为错误
      if (errorResult.message === '任务已被用户停止') {
        removeLoadingMessage(loadingId);
        state.substituteLoadingIds.delete(mySessionId);
        const { messageId } = addMessage('assistant', '任务已取消', false, errorResult.executionLog || []);
        state.messageHistory.push({ role: 'assistant', content: '任务已取消', executionLog: errorResult.executionLog || [], messageId });
        saveChatHistory();
        return;
      }
      
      removeLoadingMessage(loadingId);
      state.substituteLoadingIds.delete(mySessionId);
      
      content = '❌ 请求失败：' + (errorResult.message || '未知错误');
      executionLog = errorResult.executionLog || [];
      
      const { element: messageDiv, messageId } = addMessage('assistant', content, true, executionLog, reflectionScore);
      
      state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog, reflectionScore: reflectionScore, messageId });
      
      throw errorResult;
    }
    
    // 检查是否已切换到其他会话（成功路径）
    if (state.activeSessionId !== mySessionId) {
      const msgEntry = { role: 'assistant', content: content, executionLog: executionLog, reflectionScore: reflectionScore, wasRevised: wasRevised };
      if (wasStreamed && streamingHtml) {
        msgEntry.htmlContent = streamingHtml;
      }
      appendMessageToSession(mySessionId, msgEntry);
      // 后台写入后清除该会话的 DOM 缓存，确保切回时能看到最新消息
      document.dispatchEvent(new CustomEvent('session-cache-invalidate', { detail: { sessionId: mySessionId } }));
      removeLoadingMessage(loadingId);
      state.substituteLoadingIds.delete(mySessionId);
      return;
    }
    
    let assistantMsgId = null;
    
    // 流式输出已渲染消息，跳过 removeLoadingMessage 和 addMessage
    // 但如果 streamingHtml 为 null（流式输出中断），降级为非流式渲染
    if (!wasStreamed || !streamingHtml) {
      removeLoadingMessage(loadingId);

      // 清理切回会话时创建的替代加载指示器
      if (state.substituteLoadingIds.has(mySessionId)) {
        removeLoadingMessage(state.substituteLoadingIds.get(mySessionId));
        state.substituteLoadingIds.delete(mySessionId);
      }
      
      if (!wasStreamed) {
        const { element: messageDiv, messageId } = addMessage('assistant', content, true, executionLog, reflectionScore, wasRevised);
        assistantMsgId = messageId;
        await renderMessageMermaid(messageDiv);
      } else {
        // 流式模式下仅清理可能的残留
        if (state.substituteLoadingIds.has(mySessionId)) {
          removeLoadingMessage(state.substituteLoadingIds.get(mySessionId));
          state.substituteLoadingIds.delete(mySessionId);
        }
        assistantMsgId = streamingMsgId;
      }
    } else {
      // 流式模式且 streamingHtml 存在，使用流式消息的 messageId
      assistantMsgId = streamingMsgId;
    }
    
    // 保存消息历史：流式模式下捕获完整 HTML 用于持久化
    const msgEntry = { role: 'assistant', content: content, executionLog: executionLog, reflectionScore: reflectionScore, wasRevised: wasRevised, messageId: assistantMsgId };
    if (wasStreamed && streamingHtml) {
      msgEntry.htmlContent = streamingHtml;
      // 如果流式元素不在 DOM 中（用户切换过会话导致 DOM 被清空），重新渲染
      // 但首先检查 DOM 中是否已存在相同 messageId 的消息，防止重复渲染
      if (!streamingConnected) {
        const existingEl = document.querySelector(`[data-message-id="${assistantMsgId}"]`);
        if (!existingEl) {
          restoreMessageFromHtml(streamingHtml);
          bindExecutionLogDelegate();
          bindReflectionBadgeDelegate();
          const chatContainer = document.getElementById('chatContainer');
          if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }
    }
    
    state.messageHistory.push(msgEntry);
    
  } catch (error) {
    console.error('[SidePanel] sendMessage 异常:', error?.message || error);
  } finally {
    // 合并在此处统一保存，减少 IndexedDB 写入次数
    saveChatHistory();
    state.generatingSessionIds.delete(mySessionId);
    document.dispatchEvent(new CustomEvent('generating-state-changed'));
    userInput.focus();
    state.attachedImages = [];
    const previewBar = document.getElementById('imagePreviewBar');
    if (previewBar) previewBar.style.display = 'none';
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
  
  const icon = type === 'quoted' ? '💬' : (type === 'skill' ? '🧩' : (type === 'mcp' ? '🔌' : (type === 'page' ? '🌐' : '📌')));
  const label = type === 'quoted' ? '引用内容' : (type === 'skill' ? '使用技能' : (type === 'mcp' ? '使用MCP服务' : (type === 'page' ? '网页问答' : '选中内容')));
  
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

export function addMessage(role, content, scroll = true, executionLog = [], reflectionScore = null, wasRevised = false, rawTextContent = null, existingMessageId = null, attachedFiles = []) {
  const chatContainer = document.getElementById('chatContainer');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  
  const timestamp = new Date().toISOString();
  messageDiv.dataset.timestamp = timestamp;
  const messageId = existingMessageId || 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  messageDiv.dataset.messageId = messageId;

  // 提取纯文本内容用于显示（content 可能是数组格式，当包含图片时）
  const displayContent = Array.isArray(content)
    ? content.filter(c => c.type === 'text').map(c => c.text).join('')
    : content;
  const hasImages = Array.isArray(content) && content.some(c => c.type === 'image_url');

  // 存储原始内容：数组格式需要序列化，字符串直接存
  messageDiv.dataset.rawContent = Array.isArray(content) ? JSON.stringify(content) : content;
  // 额外存储纯文本版本，供复制/编辑/引用使用（优先使用 rawTextContent 以保留完整上下文格式）
  messageDiv.dataset.textContent_ = rawTextContent || displayContent;
  
  const textContent = displayContent;
  
  messageDiv.dataset.executionLog = JSON.stringify(executionLog);
  if (wasRevised) {
    messageDiv.dataset.wasRevised = 'true';
  }
  
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
    
    const hasExecutionLog = executionLog && executionLog.length > 0;
    const hasReflection = reflectionScore !== null && reflectionScore !== undefined;
    
    // 计算反思轮数（postReflection 类型的成功节点数量）
    const reflectionRounds = executionLog 
      ? executionLog.filter(e => e.nodeType === 'reflection' && e.reflectionType === 'post' && e.status === 'success').length 
      : 0;

    // 绑定事件委托（首次调用时执行一次）
    bindExecutionLogDelegate();
    bindReflectionBadgeDelegate();

    // 提取反思详情数据（用于弹窗展示）
    const postReflection = executionLog?.find(e => e.nodeType === 'reflection' && e.reflectionType === 'post');

    // 1. 执行日志按钮（独立的时钟图标）
    if (hasExecutionLog && state.chatConfig.enableExecutionLog) {
      const logBtn = document.createElement('button');
      logBtn.className = 'execution-log-btn';
      logBtn.type = 'button';
      logBtn.title = '执行日志';
      logBtn.innerHTML = [
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
        '<circle cx="12" cy="12" r="10"></circle>',
        '<polyline points="12 6 12 12 16 14"></polyline>',
        '</svg>'
      ].join('');
      footer.appendChild(logBtn);
    }

    // 2. 质量评估图标（独立的评分徽章）
    if (hasReflection && state.chatConfig.enableExecutionLog) {
      const scoreColor = reflectionScore >= 8 ? 'score-high' : (reflectionScore >= 5 ? 'score-mid' : 'score-low');
      const scoreEmoji = reflectionScore >= 8 ? '✅' : (reflectionScore >= 5 ? '🔍' : '⚠️');
      const revisedTag = wasRevised ? ' <span class="reflection-revised-tag">已修订</span>' : '';
      const roundsTag = reflectionRounds > 1 ? ` (${reflectionRounds}轮)` : '';

      const scoreBadge = document.createElement('button');
      scoreBadge.className = 'reflection-score-btn';
      scoreBadge.type = 'button';
      scoreBadge.title = `AI 质量评估: ${reflectionScore}/10${roundsTag}${wasRevised ? '（已修订）' : ''}\n点击查看评估详情`;
      scoreBadge.innerHTML = `<span class="reflection-badge ${scoreColor}">${scoreEmoji} ${reflectionScore}/10${revisedTag}</span>`;
      scoreBadge.dataset.reflectionData = JSON.stringify({
        overallScore: postReflection?.overallScore ?? reflectionScore,
        dimensions: postReflection?.dimensions || null,
        issues: postReflection?.issues || null,
        suggestions: postReflection?.suggestions || null,
        decision: postReflection?.action?.decision || null,
        useful: postReflection?.useful ?? null,
        reasoning: postReflection?.reasoning || null,
        suggestion: postReflection?.suggestion || null,
        rounds: reflectionRounds,
        wasRevised
      });

      footer.appendChild(scoreBadge);
    } else if (!hasReflection && postReflection && postReflection.status === 'failed' && state.chatConfig?.enableExecutionLog) {
    // 仅当存在 post 反思节点且状态为 failed 时才显示警告（不包括工具级反思失败）
      const warnBadge = document.createElement('button');
      warnBadge.className = 'reflection-score-btn';
      warnBadge.type = 'button';
      warnBadge.title = '反思评估失败（点击查看执行日志）';
      warnBadge.innerHTML = `<span class="reflection-badge score-low">⚠️ 反思失败</span>`;
      footer.appendChild(warnBadge);
    }
    
    const prototypeCall = executionLog?.slice().reverse().find(e => e.nodeType === 'tool_exec' && e.action?.name === 'preview_ui_prototype' && e.status === 'success');
    if (prototypeCall) {
      // 判断是否已在本地浏览器打开
      let localOpened = false;
      if (prototypeCall.observation) {
        try {
          const obs = typeof prototypeCall.observation === 'string' 
            ? JSON.parse(prototypeCall.observation) : prototypeCall.observation;
          localOpened = obs?.localOpened === true;
        } catch (e) {}
      }

      const prototypeBtn = document.createElement('button');
      prototypeBtn.className = 'prototype-btn-small';
      prototypeBtn.type = 'button';
      prototypeBtn.title = localOpened ? '已在本地浏览器打开，点击可在面板内查看' : '查看 UI 原型';
      prototypeBtn.innerHTML = ICON_IMAGE_24;
      prototypeBtn.addEventListener('click', () => {
        // 多种方式尝试获取 prototypeId
        let prototypeId = prototypeCall.prototypeId;
        
        // 兜底：从 observation JSON 中解析
        if (!prototypeId && prototypeCall.observation) {
          try {
            const parsed = typeof prototypeCall.observation === 'string' 
              ? JSON.parse(prototypeCall.observation) : prototypeCall.observation;
            prototypeId = parsed?.prototypeId;
          } catch (e) {}
        }
        
        if (prototypeId) {
          loadAndShowPrototype(prototypeId);
        } else {
          console.error('[SidePanel] 未找到 prototypeId，entry keys:', Object.keys(prototypeCall), 'observation:', prototypeCall.observation);
        }
      });
      footer.appendChild(prototypeBtn);
    }
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.title = '删除消息';
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMessage(messageDiv);
    });
    footer.appendChild(deleteBtn);
    
    messageDiv.appendChild(footer);
  } else {
    const quotedMatch = textContent.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/);
    const selectedMatch = textContent.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/);
    const match = quotedMatch || selectedMatch;
    
    if (match) {
      const type = quotedMatch ? 'quoted' : 'selected';
      const contextText = match[1].trim();
      let userQuestion = match[2].trim();
      // 去除文件附件（仅显示用）
      if (attachedFiles && attachedFiles.length > 0) {
        const fileIdx = userQuestion.search(/\n\n\[(?:工作目录)?文件(?:内容)?:/);
        if (fileIdx !== -1) {
          userQuestion = userQuestion.substring(0, fileIdx);
        }
      }
      // 去除上下文前缀（仅显示用）
      userQuestion = userQuestion.replace(/^\[网页上下文\]\n标题: .+\nURL: .+\ntabId: \d+\n/, '');
      userQuestion = userQuestion.replace(/^\[已选技能: [^\]]+\]\n请使用「[^」]+」技能来处理以下问题：\n/, '');
      userQuestion = userQuestion.replace(/^\[已选MCP服务: [^\]]+\]\n请使用「[^」]+」MCP服务来处理以下问题：\n/, '');
      // 去除内嵌的文件引用（如 [工作目录文件: xxx]）
      userQuestion = userQuestion.replace(/\[工作目录文件: [^\]]+\]/g, '');
      messageDiv._pendingContext = { type, contextText, userQuestion };
      messageDiv.textContent = userQuestion;
    } else {
      // 如果有文件附件，从显示文本中去除文件内容
      let displayText = textContent;
      if (attachedFiles && attachedFiles.length > 0) {
        const fileIdx = displayText.search(/\n\n\[(?:工作目录)?文件(?:内容)?:/);
        if (fileIdx !== -1) {
          displayText = displayText.substring(0, fileIdx);
        }
      }
      // 去除上下文前缀（仅显示用，messageHistory 中保留完整内容供 AI 使用）
      // 网页上下文: [网页上下文]\n标题: ...\nURL: ...\ntabId: ...\n
      // 技能上下文: [已选技能: xxx - xxx]\n请使用「xxx」技能来处理以下问题：\n
      // MCP上下文: [已选MCP服务: xxx]\n请使用「xxx」MCP服务来处理以下问题：\n
      displayText = displayText.replace(/^\[网页上下文\]\n标题: .+\nURL: .+\ntabId: \d+\n/, '');
      displayText = displayText.replace(/^\[已选技能: [^\]]+\]\n请使用「[^」]+」技能来处理以下问题：\n/, '');
      displayText = displayText.replace(/^\[已选MCP服务: [^\]]+\]\n请使用「[^」]+」MCP服务来处理以下问题：\n/, '');
      // 去除内嵌的文件引用（如 [工作目录文件: xxx]）
      displayText = displayText.replace(/\[工作目录文件: [^\]]+\]/g, '');
      messageDiv.textContent = displayText;
    }

    // 如果消息包含图片，显示缩略图
    if (hasImages) {
      const imagesContainer = document.createElement('div');
      imagesContainer.className = 'user-message-images';
      const imageParts = content.filter(c => c.type === 'image_url');
      imageParts.forEach((imgPart, idx) => {
        const imgEl = document.createElement('img');
        imgEl.src = imgPart.image_url.url;
        imgEl.className = 'user-message-image';
        imgEl.title = '点击查看大图';
        imgEl.addEventListener('click', () => {
          openImagePreview(imgPart.image_url.url, imgEl);
        });
        imagesContainer.appendChild(imgEl);
      });
      messageDiv.appendChild(imagesContainer);
    }

    // 如果消息包含文件附件，显示文件标签
    if (attachedFiles && attachedFiles.length > 0) {
      // 存储文件信息供编辑时恢复
      messageDiv.dataset.attachedFiles = JSON.stringify(attachedFiles.map(f => ({
        name: f.name, size: f.size, type: f.type, text: f.text, status: f.status, agentPath: f.agentPath || ''
      })));
      const filesContainer = document.createElement('div');
      filesContainer.className = 'user-message-files';
      const doneFiles = attachedFiles.filter(f => f.status === 'done');
      const otherFiles = attachedFiles.filter(f => f.status !== 'done');
      [...doneFiles, ...otherFiles].forEach(f => {
        const tag = document.createElement('span');
        tag.className = `user-message-file-tag ${f.status}`;
        tag.textContent = `${getFileIcon(f.name)} ${f.name} (${formatFileSize(f.size)})`;
        if (f.status === 'extracting') {
          tag.textContent += ' 提取中...';
        } else if (f.status === 'error') {
          tag.textContent += ' 失败';
          tag.title = f.error || '提取失败';
        }
        filesContainer.appendChild(tag);
      });
      messageDiv.appendChild(filesContainer);
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
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'message-toolbar-btn delete-btn';
    deleteBtn.title = '删除消息';
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMessage(messageDiv);
    });
    toolbar.appendChild(deleteBtn);
    
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
    const assistantMessages = chatContainer.querySelectorAll('.message.assistant');
    if (assistantMessages.length > 0) {
      const latestAssistantMessage = assistantMessages[assistantMessages.length - 1];
      latestAssistantMessage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  
  if (role === 'assistant') {
    addCodeCopyButtons();
  }
  
  return { element: messageDiv, messageId };
}

// ============================================================
// 事件委托：执行日志按钮点击
// ============================================================
let executionLogDelegateBound = false;

/** 当前流式消息 DOM 元素（按 sessionId 隔离，防止会话串台） */
const _streamingElements = new Map();  // sessionId -> HTMLElement
/** 当前流式消息已累积的文本内容（按 sessionId 隔离，用于切回会话时恢复流式输出） */
const _streamedContentMap = new Map();  // sessionId -> accumulated content string
let _pendingPreselectLog = null;  // 缓存的预筛选日志，STREAM_START 时添加到流式元素

/** 思考开始时间（当前步骤的思考耗时） */
let _thinkingStartTime = 0;

/** 总体思考过程开始时间（用于折叠区的总耗时） */
let _processStartTime = 0;

/** 累积的推理内容（思考过程） */
let _reasoningContent = '';

export function bindExecutionLogDelegate() {
  if (executionLogDelegateBound) return;
  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer) return;
  
  chatContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.execution-log-btn');
    if (!btn) return;
    
    const messageEl = btn.closest('.message');
    if (!messageEl) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rawLog = messageEl.dataset.executionLog;
    if (!rawLog) return;
    
    try {
      const log = JSON.parse(rawLog);
      console.log('[chat-manager] 执行日志按钮点击(委托), entries:', log.length);
      showExecutionLog(log);
    } catch (err) {
      console.error('[chat-manager] 解析 executionLog 失败:', err);
    }
  });
  
  executionLogDelegateBound = true;
}

// ============================================================
// 事件委托：质量评估徽章点击
// ============================================================
let reflectionBadgeDelegateBound = false;

export function bindReflectionBadgeDelegate() {
  if (reflectionBadgeDelegateBound) return;
  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer) return;

  chatContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.reflection-score-btn');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const rawData = btn.dataset.reflectionData;
    if (!rawData) return;

    try {
      const data = JSON.parse(rawData);
      showReflectionInfo(data, btn);
    } catch (err) {
      console.error('[chat-manager] 解析 reflectionData 失败:', err);
    }
  });

  reflectionBadgeDelegateBound = true;
}

/**
 * 显示质量评估详情弹窗
 */
function showReflectionInfo(data, anchorBtn) {
  // 关闭已存在的弹窗
  const existing = document.querySelector('.reflection-info-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'reflection-info-overlay';

  const { overallScore, dimensions, issues, suggestions, decision, useful, reasoning, suggestion, rounds, wasRevised } = data;

  const scoreColor = overallScore >= 8 ? 'score-high' : (overallScore >= 5 ? 'score-mid' : 'score-low');
  const scoreEmoji = overallScore >= 8 ? '✅' : (overallScore >= 5 ? '🔍' : '⚠️');
  const decisionLabel = decision === 'passed' ? '✅ 通过' : (decision === 'revised' ? '🔧 已修订' : (decision === 'needs_improvement' ? '⚠️ 需改进' : ''));

  const dimLabels = {
    accuracy: '准确性',
    completeness: '完整性',
    relevance: '相关性',
    clarity: '清晰度',
    usefulness: '实用性',
    safety: '安全性',
    efficiency: '效率'
  };

  let dimensionsHtml = '';
  if (dimensions && Object.keys(dimensions).length > 0) {
    dimensionsHtml = `
      <div class="ri-section">
        <div class="ri-section-title">📊 各维度评分</div>
        <div class="ri-dimensions">
          ${Object.entries(dimensions).map(([key, val]) => {
            const label = dimLabels[key] || key;
            const dimColor = val >= 8 ? '#10b981' : (val >= 5 ? '#f59e0b' : '#ef4444');
            return `
              <div class="ri-dim-item">
                <span class="ri-dim-label">${escapeHtml(label)}</span>
                <span class="ri-dim-bar-bg"><span class="ri-dim-bar-fill" style="width:${val * 10}%;background:${dimColor}"></span></span>
                <span class="ri-dim-score" style="color:${dimColor}">${val}/10</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  let issuesHtml = '';
  if (issues && issues.length > 0) {
    issuesHtml = `
      <div class="ri-section">
        <div class="ri-section-title">📋 发现的问题</div>
        <ul class="ri-list">${issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
      </div>
    `;
  }

  let suggestionsHtml = '';
  if (suggestions && suggestions.length > 0) {
    suggestionsHtml = `
      <div class="ri-section">
        <div class="ri-section-title">💡 改进建议</div>
        <ul class="ri-list">${suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
      </div>
    `;
  }

  let processHtml = '';
  if (rounds > 0 || decision || useful !== null) {
    const processItems = [];
    if (rounds > 0) processItems.push(`<span class="ri-tag">🔄 经过 ${rounds} 轮评估${wasRevised ? '（已修订）' : ''}</span>`);
    if (decision) processItems.push(`<span class="ri-tag">🎯 最终决策: ${decisionLabel}</span>`);
    if (useful !== null) processItems.push(`<span class="ri-tag">${useful ? '✅ AI 认为结果有用' : '⚠️ AI 认为结果需要改进'}</span>`);
    if (reasoning) processItems.push(`<div class="ri-reasoning">📝 ${escapeHtml(reasoning)}</div>`);

    processHtml = `
      <div class="ri-section">
        <div class="ri-section-title">🔍 评估过程</div>
        <div class="ri-process">${processItems.join('')}</div>
      </div>
    `;
  }

  // 评分说明
  const scoreExplanation = overallScore >= 8
    ? 'AI 认为回答质量较高，准确性和完整性良好，可以直接使用。'
    : (overallScore >= 5
      ? 'AI 认为回答存在一些不足，建议核实关键信息或补充细节后再使用。'
      : 'AI 认为回答质量较低，可能存在较多错误或遗漏，建议重新提问或调整问题表述。');

  overlay.innerHTML = `
    <div class="reflection-info-panel">
      <div class="ri-header">
        <div class="ri-title">质量评估详情</div>
        <button class="ri-close" title="关闭">✕</button>
      </div>
      <div class="ri-body">
        <div class="ri-score-overview">
          <span class="ri-score-emoji">${scoreEmoji}</span>
          <span class="ri-score-value ${scoreColor}">${overallScore}<span class="ri-score-max">/10</span></span>
          <span class="ri-score-label">综合评分</span>
        </div>
        <div class="ri-section">
          <div class="ri-section-title">📖 评分说明</div>
          <p class="ri-text">${scoreExplanation}</p>
        </div>
        ${dimensionsHtml}
        ${issuesHtml}
        ${suggestionsHtml}
        ${processHtml}
        <div class="ri-section ri-about">
          <div class="ri-section-title">ℹ️ 什么是质量评估？</div>
          <p class="ri-text">质量评估是 AI 在生成回答后，对自己的回答进行的<strong>自我反思和评分</strong>。AI 会从准确性、完整性、相关性等多个维度审视回答质量，发现潜在问题并尝试改进。</p>
          <p class="ri-text ri-text-sm">评分标准：<span style="color:#10b981">✅ 8-10分 质量良好</span> · <span style="color:#f59e0b">🔍 5-7分 需要关注</span> · <span style="color:#ef4444">⚠️ 1-4分 存在较多问题</span></p>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 关闭事件
  const closeBtn = overlay.querySelector('.ri-close');
  closeBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // 定位弹窗：靠近触发按钮
  const btnRect = anchorBtn.getBoundingClientRect();
  const panel = overlay.querySelector('.reflection-info-panel');
  const panelWidth = 380;
  const panelMaxHeight = Math.min(window.innerHeight - 40, 560);

  // 水平定位：面板右边缘对齐按钮右边缘
  let left = btnRect.right - panelWidth;
  if (left < 10) left = 10;
  if (left + panelWidth > window.innerWidth - 10) left = window.innerWidth - panelWidth - 10;

  // 垂直定位：面板顶部略低于按钮底部
  let top = btnRect.bottom + 6;
  if (top + panelMaxHeight > window.innerHeight - 10) {
    top = btnRect.top - panelMaxHeight - 6;
  }
  if (top < 10) top = 10;

  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  panel.style.maxHeight = panelMaxHeight + 'px';
}

// ============================================================
// Re-export renderMessageMermaid from markdown-render.js
// ============================================================
export { renderMessageMermaid };

// ============================================================
// 执行日志渲染 → 已提取至 execution-log-render.js（导入保持对外接口不变）
// ============================================================

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
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
  
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
      // 发送取消消息到后台
      chrome.runtime.sendMessage({ type: 'CANCEL_REACT', tabId: null, sessionId: state.activeSessionId });
      // 立即清理前端状态：调用 cancelApi 会 reject Promise 并清理 listener 和 timeout
      if (state.pendingCancelApi) {
        state.pendingCancelApi({
          message: '任务已被用户停止',
          executionLog: state.currentExecutionStatus?.executionLog || []
        });
      }
    });
  }
  
  // 始终同步注册执行日志监听器，避免竞态（storage.get 是异步的）
  // 捕获当前会话 ID，防止切换会话后过滤逻辑用错 sessionId
  const mySessionId = state.activeSessionId;
  state.executionLogListener = (message, sender, sendResponse) => {
    // 过滤：只处理属于本会话或没有 sessionId 的消息（兼容）
    if (message.sessionId && message.sessionId !== mySessionId) {
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

  // enableExecutionLog 控制面板显示及执行日志按钮
  if (state.chatConfig.enableExecutionLog) {
    const statusContainer = loadingDiv.querySelector('.execution-status-container');
    if (statusContainer) {
      statusContainer.style.display = 'flex';
    }
  }
  
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
  
  // 按会话隔离清空执行状态，不影响其他会话
  state.currentExecutionStatus = null;
  
  const realtimePanel = document.querySelector('.execution-log-panel.realtime-mode');
  if (realtimePanel) {
    realtimePanel.remove();
  }
}

// ============================================================
// 流式输出 UI 辅助函数
// ============================================================

/**
 * 创建流式输出消息容器
 */
function addStreamingMessage() {
  const chatContainer = document.getElementById('chatContainer');
  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper assistant streaming';
  const messageId = 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  wrapper.dataset.messageId = messageId;
  wrapper.innerHTML = `
    <div class="message-content">
      <div class="stream-content"></div>
      <div class="thinking-indicator">
        <svg class="thinking-icon pulse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
          <circle cx="8" cy="12" r="1.5"/>
          <circle cx="16" cy="12" r="1.5"/>
        </svg>
        <div class="thinking-dots">
          <span></span><span></span><span></span>
        </div>
        <span class="thinking-label">思考中...</span>
        <button class="streaming-stop-btn" title="停止生成">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          </svg>
        </button>
      </div>
      <div class="stream-status hidden"></div>
    </div>
  `;
  chatContainer.appendChild(wrapper);
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });

  // 绑定流式消息内的停止按钮
  const streamingStopBtn = wrapper.querySelector('.streaming-stop-btn');
  if (streamingStopBtn) {
    streamingStopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelStreamingTask(streamingStopBtn);
    });
  }

  return wrapper;
}

/**
 * 从保存的 HTML 恢复消息（用于流式消息的持久化恢复）
 * @param {string} htmlContent - 消息的 outerHTML
 */
export function restoreMessageFromHtml(htmlContent, messageId = null) {
  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer || !htmlContent) return;
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  const messageEl = tempDiv.firstElementChild;
  if (!messageEl) return;
  
  // 使用传入的 messageId 覆盖 HTML 中的 ID（确保与 state.messageHistory 一致）
  if (messageId) {
    messageEl.dataset.messageId = messageId;
  }
  
  // 移除 streaming 类（持久化后不再是流式状态）
  messageEl.classList.remove('streaming');
  
  // 重新绑定事件：折叠/展开思考过程
  const processHeader = messageEl.querySelector('.thinking-process-header');
  if (processHeader) {
    const processHistory = processHeader.closest('.thinking-process');
    processHeader.addEventListener('click', () => {
      processHistory.classList.toggle('collapsed');
    });
  }
  
  // 重新绑定工具卡片展开/折叠
  messageEl.querySelectorAll('.tool-call-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.tool-call-item').classList.toggle('expanded');
    });
  });
  
  // 重新绑定 tool-call-result 点击展开完整输出（流式折叠内容）
  messageEl.querySelectorAll('.tool-call-result').forEach(resultDiv => {
    const codeBlock = resultDiv.querySelector('code');
    if (!codeBlock) return;
    // 从 data-full-content 属性获取完整内容（流式输出时存入）
    const fullContent = codeBlock.dataset.fullContent;
    if (!fullContent || fullContent.length <= 500) return;
    const currentText = codeBlock.textContent || '';
    let isExpanded = false;
    resultDiv.style.cursor = 'pointer';
    resultDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      isExpanded = !isExpanded;
      codeBlock.textContent = isExpanded ? fullContent : currentText;
    });
  });
  
  // 重新绑定底部工具栏按钮事件
  const footer = messageEl.querySelector('.message-footer');
  if (footer) {
    // 复制按钮
    const copyBtn = footer.querySelector('.copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyAssistantMessage(messageEl, copyBtn);
      });
    }
    // 引用按钮
    const quoteBtn = footer.querySelector('.quote-btn');
    if (quoteBtn) {
      quoteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        quoteAndAsk(messageEl);
      });
    }
    // 导出菜单
    const exportTrigger = footer.querySelector('.export-trigger-btn');
    const exportDropdown = footer.querySelector('.export-dropdown');
    if (exportTrigger && exportDropdown) {
      exportTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.export-dropdown.show').forEach(menu => {
          if (menu !== exportDropdown) menu.classList.remove('show');
        });
        exportDropdown.classList.toggle('show');
      });
      exportDropdown.querySelector('.export-docx-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        exportAssistantMessageToDocx(messageEl, exportTrigger);
        exportDropdown.classList.remove('show');
      });
      exportDropdown.querySelector('.export-pdf-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        exportAssistantMessageToPdf(messageEl, exportTrigger);
        exportDropdown.classList.remove('show');
      });
    }

    // 重新绑定原型预览按钮事件
    const prototypeBtn = footer.querySelector('.prototype-btn-small');
    if (prototypeBtn) {
      const logs = (() => {
        try {
          const raw = messageEl.dataset.executionLog;
          return raw ? JSON.parse(raw) : [];
        } catch { return []; }
      })();
      const prototypeCall = logs.find(e => e.nodeType === 'tool_exec' && e.action?.name === 'preview_ui_prototype' && e.status === 'success');
      if (prototypeCall) {
        prototypeBtn.addEventListener('click', () => {
          let prototypeId = prototypeCall.prototypeId;
          if (!prototypeId && prototypeCall.observation) {
            try {
              const parsed = typeof prototypeCall.observation === 'string' 
                ? JSON.parse(prototypeCall.observation) : prototypeCall.observation;
              prototypeId = parsed?.prototypeId;
            } catch (e) {}
          }
          if (prototypeId) {
            loadAndShowPrototype(prototypeId);
          } else {
            console.error('[SidePanel] 未找到 prototypeId，entry keys:', Object.keys(prototypeCall), 'observation:', prototypeCall.observation);
          }
        });
      }
    }

    // 重新绑定删除按钮事件
    const deleteBtn = footer.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMessage(messageEl);
      });
    }
  }

  // 清除按钮的 data-bound 标记（HTML 恢复后按钮上已有旧标记，需重置才能重新绑定事件）
  messageEl.querySelectorAll('.code-copy-btn, .copy-md-btn, .download-excel-btn').forEach(btn => {
    delete btn.dataset.bound;
  });
  
  chatContainer.appendChild(messageEl);
}

/**
 * 批量重新绑定缓存恢复后的消息交互事件
 * 用于从 sessionDOMCache 恢复时，一次性绑定所有事件，避免逐条 rebuild 的开销
 * @param {HTMLElement} container - chatContainer 元素
 */
export function rebindAllMessages(container) {
  // 思考过程折叠/展开
  container.querySelectorAll('.thinking-process-header').forEach(header => {
    header.addEventListener('click', () => {
      const processEl = header.closest('.thinking-process');
      if (processEl) processEl.classList.toggle('collapsed');
    });
  });

  // 工具卡片展开/折叠
  container.querySelectorAll('.tool-call-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.closest('.tool-call-item');
      if (item) item.classList.toggle('expanded');
    });
  });

  // 底部工具栏按钮事件
  container.querySelectorAll('.message-footer').forEach(footer => {
    const messageEl = footer.closest('.message');
    if (!messageEl) return;

    const copyBtn = footer.querySelector('.copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyAssistantMessage(messageEl, copyBtn);
      });
    }

    const quoteBtn = footer.querySelector('.quote-btn');
    if (quoteBtn) {
      quoteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        quoteAndAsk(messageEl);
      });
    }

    const exportTrigger = footer.querySelector('.export-trigger-btn');
    const exportDropdown = footer.querySelector('.export-dropdown');
    if (exportTrigger && exportDropdown) {
      exportTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.export-dropdown.show').forEach(menu => {
          if (menu !== exportDropdown) menu.classList.remove('show');
        });
        exportDropdown.classList.toggle('show');
      });
      exportDropdown.querySelector('.export-docx-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        exportAssistantMessageToDocx(messageEl, exportTrigger);
        exportDropdown.classList.remove('show');
      });
      exportDropdown.querySelector('.export-pdf-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        exportAssistantMessageToPdf(messageEl, exportTrigger);
        exportDropdown.classList.remove('show');
      });
    }

    const prototypeBtn = footer.querySelector('.prototype-btn-small');
    if (prototypeBtn) {
      const logs = (() => {
        try {
          const raw = messageEl.dataset.executionLog;
          return raw ? JSON.parse(raw) : [];
        } catch { return []; }
      })();
      const prototypeCall = logs.find(e => e.nodeType === 'tool_exec' && e.action?.name === 'preview_ui_prototype' && e.status === 'success');
      if (prototypeCall) {
        prototypeBtn.addEventListener('click', () => {
          let prototypeId = prototypeCall.prototypeId;
          if (!prototypeId && prototypeCall.observation) {
            try {
              const parsed = typeof prototypeCall.observation === 'string'
                ? JSON.parse(prototypeCall.observation) : prototypeCall.observation;
              prototypeId = parsed?.prototypeId;
            } catch (e) {}
          }
          if (prototypeId) {
            loadAndShowPrototype(prototypeId);
          }
        });
      }
    }

    const deleteBtn = footer.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMessage(messageEl);
      });
    }
  });

  // 移除旧的 mermaid 工具栏（缓存恢复后需重建以绑定事件）
  container.querySelectorAll('.mermaid-controls').forEach(c => c.remove());

  // 清除代码块和表格工具栏按钮的 data-bound 标记，并重新绑定表格工具栏事件
  container.querySelectorAll('.code-copy-btn, .copy-md-btn, .download-excel-btn').forEach(btn => {
    delete btn.dataset.bound;
  });
  addTableToolbarEvents();

  // 重新绑定事件委托
  bindExecutionLogDelegate();
  bindReflectionBadgeDelegate();
}

/**
 * 切回有后台流式任务的会话时，将脱落的流式元素重新挂回 DOM，恢复实时输出。
 * 旧元素保留了所有工具调用卡片、思考标记等状态（因为 STREAM_TOOL_CALL 等消息
 * 在元素脱落期间仍会更新它），只需要补上脱落后缺失的文本内容。
 * @param {string} sessionId - 会话 ID
 */
export function reconnectStreamingElement(sessionId) {
  const oldEl = _streamingElements.get(sessionId);
  if (!oldEl) {
    // 没有旧元素（极端情况），不处理
    return;
  }

  // 将旧元素重新插入 DOM，它保留了工具调用卡片、思考标记等完整状态
  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer) return;

  chatContainer.appendChild(oldEl);

  // 补充脱落后缺失的文本内容（STREAM_CHUNK 在脱落期间跳过了 DOM 更新）
  const accumulated = _streamedContentMap.get(sessionId) || '';
  if (accumulated) {
    updateStreamingMessage(oldEl, accumulated);

    // 关闭当前可见的思考指示器：正常 ReAct 流程中，每次 STREAM_TOOL_CALL 之后
    // 会由 appendToolCallItems 隐藏思考指示器并插入"思考结果"badge。但元素脱落期间
    // 如果错过了工具调用（或当前轮次没有工具调用），思考指示器会残留在可见状态。
    // 这会导致后续 STREAM_START 触发 "已有可见的思考指示器" 警告并跳过创建新指示器。
    // 主动隐藏残留指示器，确保后续迭代能正常创建新的思考指示器。
    // 注意：仅在 accumulated 非空时才执行，避免在内容被 STREAM_START 重置后
    // 创建出"有 badge 但无对应思考内容"的空洞。
    const visibleIndicators = oldEl.querySelectorAll('.thinking-indicator:not(.hidden)');
    visibleIndicators.forEach(indicator => {
      const parent = indicator.parentElement;
      const prevSibling = indicator.previousElementSibling;
      const badge = document.createElement('span');
      badge.className = 'thinking-badge';
      badge.innerHTML = '<svg class="thinking-icon-static" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/></svg>思考结果';
      if (prevSibling && prevSibling.classList.contains('thinking-content')) {
        parent.insertBefore(badge, prevSibling);
      } else {
        parent.insertBefore(badge, indicator);
      }
      indicator.classList.add('hidden');
    });
  }

  // 滚动到底部
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

/**
 * 更新流式消息内容（增量渲染 Markdown）
 * 流式输出过程中思考指示器保持可见，仅在一轮思考完成后才隐藏并显示思考结果badge
 * 支持多轮 ReAct 迭代：每轮追加独立的思考标记
 */
function updateStreamingMessage(element, fullContent) {
  const contentDiv = element.querySelector('.stream-content');
  if (!contentDiv) return;
  
  // 查找当前可见的思考指示器（判断是否正在思考中）
  // 优先查找 stream-content 内的指示器，然后查找 message-content 内的
  const visibleThinking = contentDiv.querySelector('.thinking-indicator:not(.hidden)')
    || element.querySelector('.thinking-indicator:not(.hidden)');
  
  if (visibleThinking) {
    // 当前正在思考中：检查是否是第一次收到内容，如果是，将"思考中"改为"输出中"
    const thinkingLabel = visibleThinking.querySelector('.thinking-label');
    if (thinkingLabel && thinkingLabel.textContent === '思考中...') {
      thinkingLabel.textContent = '输出中...';
    }
    
    // 当前正在思考中/输出中
    if (contentDiv.contains(visibleThinking)) {
      // 思考指示器在 stream-content 内：在指示器前面创建/更新 thinking-content
      const prevSibling = visibleThinking.previousElementSibling;
      if (prevSibling && prevSibling.classList.contains('thinking-content')) {
        prevSibling.innerHTML = formatMessageContent(fullContent);
      } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'thinking-content';
        wrapper.innerHTML = formatMessageContent(fullContent);
        contentDiv.insertBefore(wrapper, visibleThinking);
      }
    } else {
      // 思考指示器在 message-content 中（第一轮迭代）：
      // 如果 stream-content 中没有 thinking-content，创建新的；否则更新最后一个
      // 注意：这里不能简单地更新最后一个，因为可能有多个轮次的思考内容
      const thinkingContents = contentDiv.querySelectorAll('.thinking-content');
      if (thinkingContents.length === 0) {
        // 没有任何思考内容，创建新的
        const wrapper = document.createElement('div');
        wrapper.className = 'thinking-content';
        wrapper.innerHTML = formatMessageContent(fullContent);
        contentDiv.appendChild(wrapper);
      } else {
        // 检查最后一个 thinking-content 是否是当前轮的（前面没有 thinking-badge）
        const lastContent = thinkingContents[thinkingContents.length - 1];
        const nextSibling = lastContent.nextElementSibling;
        if (!nextSibling || !nextSibling.classList.contains('thinking-badge')) {
          // 最后一个 thinking-content 是当前轮的，更新它
          lastContent.innerHTML = formatMessageContent(fullContent);
        } else {
          // 最后一个 thinking-content 已经是上一轮的（后面有 badge），创建新的
          const wrapper = document.createElement('div');
          wrapper.className = 'thinking-content';
          wrapper.innerHTML = formatMessageContent(fullContent);
          contentDiv.appendChild(wrapper);
        }
      }
    }
  } else {
    // 思考已完成（无可见指示器）：在最后一个 thinking-badge 后更新内容
    const badges = contentDiv.querySelectorAll('.thinking-badge');
    if (badges.length > 0) {
      const lastBadge = badges[badges.length - 1];
      let contentAfter = lastBadge.nextElementSibling;
      if (contentAfter && contentAfter.classList.contains('thinking-content')) {
        contentAfter.innerHTML = formatMessageContent(fullContent);
      } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'thinking-content';
        wrapper.innerHTML = formatMessageContent(fullContent);
        lastBadge.after(wrapper);
      }
    } else {
      // 没有 badge，也没有 thinking-indicator，直接创建 thinking-content
      const wrapper = document.createElement('div');
      wrapper.className = 'thinking-content';
      wrapper.innerHTML = formatMessageContent(fullContent);
      contentDiv.appendChild(wrapper);
    }
  }
  
  // 自动滚动（等浏览器完成布局后再滚动，确保 scrollHeight 已更新）
  // 仅当该流式消息属于当前会话时才滚动，防止后台会话串台滚动
  if (element.isConnected) {
    requestAnimationFrame(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  }
}

/**
 * 更新流式消息状态文本（工具调用时）
 */
function updateStreamingStatus(element, statusText) {
  const statusDiv = element.querySelector('.stream-status');
  if (statusDiv) {
    statusDiv.classList.remove('hidden');
    statusDiv.innerHTML = `<svg class="tool-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> ${statusText}`;
  }
}

/**
 * 在流式消息中添加工具调用详情卡片
 * @param {HTMLElement} element - 流式消息容器
 * @param {Array} toolCalls - 工具调用数组 [{ id, type, function: { name, arguments } }]
 */
function appendToolCallItems(element, toolCalls) {
  if (!element || !toolCalls?.length) return;
  
  const contentDiv = element.querySelector('.stream-content');
  if (!contentDiv) return;
  
  // 一轮思考结束：隐藏思考指示器，添加思考结果badge（在思考内容上面）
  // 查找所有可见的思考指示器（可能在 message-content 或 stream-content 中）
  const visibleThinking = element.querySelector('.thinking-indicator:not(.hidden)');
  if (visibleThinking) {
    const duration = _thinkingStartTime > 0 ? ((Date.now() - _thinkingStartTime) / 1000).toFixed(1) + 's' : '';
    const badge = document.createElement('span');
    badge.className = 'thinking-badge';
    badge.innerHTML = `<svg class="thinking-icon-static" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/></svg>思考结果${duration ? ' <span class="thinking-duration">'+duration+'</span>' : ''}`;
    
    if (contentDiv.contains(visibleThinking)) {
      // 思考指示器在 stream-content 内：找到当前轮的 thinking-content，在它前面插入 badge
      const prevSibling = visibleThinking.previousElementSibling;
      if (prevSibling && prevSibling.classList.contains('thinking-content')) {
        contentDiv.insertBefore(badge, prevSibling);
      } else {
        contentDiv.insertBefore(badge, visibleThinking);
      }
      visibleThinking.classList.add('hidden');
    } else {
      // 思考指示器在 message-content 中：找到最后一个 thinking-content，在它前面插入 badge
      const thinkingContents = contentDiv.querySelectorAll('.thinking-content');
      if (thinkingContents.length > 0) {
        const lastContent = thinkingContents[thinkingContents.length - 1];
        const nextSibling = lastContent.nextElementSibling;
        if (!nextSibling || !nextSibling.classList.contains('thinking-badge')) {
          contentDiv.insertBefore(badge, lastContent);
        } else {
          contentDiv.appendChild(badge);
        }
      } else {
        contentDiv.appendChild(badge);
      }
      visibleThinking.classList.add('hidden');
      visibleThinking.remove();
    }
  }
  
  // 工具分类配置：{ toolName: { icon, label, summaryFn } }
  const toolMeta = {
    execute_command:       { metaType: 'exec' },
    execute_agent_exec_command: { metaType: 'exec' },
    agent_read_file:       { metaType: 'file', action: '读取' },
    agent_write_file:      { metaType: 'file', action: '写入' },
    file_upload:           { metaType: 'file', action: '上传' },
    download_file:         { metaType: 'file', action: '下载' },
    fetch_url:             { metaType: 'web', action: '请求' },
    click_element:         { metaType: 'web', action: '点击' },
    fill_form:             { metaType: 'web', action: '填写' },
    open_tab:              { metaType: 'web', action: '打开' },
    search_bookmarks:      { metaType: 'search' },
    search_history:        { metaType: 'search' },
    search_in_page:        { metaType: 'search' },
  };
  
  toolCalls.forEach(tc => {
    const toolName = tc.function?.name || 'unknown';
    const meta = toolMeta[toolName] || { metaType: 'other' };
    let args;
    try {
      args = JSON.parse(tc.function?.arguments || '{}');
    } catch {
      args = { raw: tc.function?.arguments || '' };
    }
    
    const formattedArgs = JSON.stringify(args, null, 2);
    
    // 根据工具类型构建摘要行
    let summaryHtml = '';
    if (meta.metaType === 'exec') {
      // 命令执行：展示实际命令
      const cmd = args.command || args.cmd || JSON.stringify(args);
      summaryHtml = `<code class="tool-call-cmd">$ ${escapeHtml(cmd)}</code>`;
    } else if (meta.metaType === 'file') {
      // 文件操作：展示路径/文件名
      const path = args.file_path || args.filePath || args.path || args.filename || args.fileName || args.url || '';
      const icon = meta.action === '读取' ? '📖' : meta.action === '写入' ? '📝' : meta.action === '上传' ? '📤' : '📥';
      summaryHtml = `<span class="tool-call-file">${icon} ${escapeHtml(path) || escapeHtml(toolName)}</span>`;
    } else if (meta.metaType === 'web') {
      const url = args.url || args.href || args.selector || '';
      summaryHtml = `<span class="tool-call-web">${escapeHtml(meta.action)}: ${escapeHtml(url) || escapeHtml(JSON.stringify(args).substring(0, 80))}</span>`;
    } else if (meta.metaType === 'search') {
      const query = args.query || args.keyword || args.text || '';
      summaryHtml = `<span class="tool-call-search">🔍 ${escapeHtml(query) || escapeHtml(toolName)}</span>`;
    } else {
      // 其他工具：显示关键参数
      const keys = Object.keys(args);
      if (keys.length === 0) {
        summaryHtml = `<span>${escapeHtml(toolName)}</span>`;
      } else if (keys.length === 1) {
        summaryHtml = `<span>${escapeHtml(keys[0])}: ${escapeHtml(JSON.stringify(args[keys[0]]).substring(0, 80))}</span>`;
      } else {
        const preview = keys.slice(0, 2).map(k => `${escapeHtml(k)}=${escapeHtml(JSON.stringify(args[k]).substring(0, 30))}`).join(', ');
        summaryHtml = `<span>${preview}${keys.length > 2 ? ' ...' : ''}</span>`;
      }
    }
    
    // 图标
    const iconSvg = meta.metaType === 'exec'
      ? `<svg class="tool-call-icon exec" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
         </svg>`
      : meta.metaType === 'file'
      ? `<svg class="tool-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
         </svg>`
      : `<svg class="tool-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
         </svg>`;
    
    const item = document.createElement('div');
    item.className = 'tool-call-item';
    item.setAttribute('data-tool-call-id', tc.id || '');
    item.setAttribute('data-meta-type', meta.metaType);
    item.setAttribute('data-created-at', Date.now());
    item.innerHTML = `
      <div class="tool-call-header">
        ${iconSvg}
        <span class="tool-call-name">${escapeHtml(toolName)}</span>
        <div class="tool-call-summary">${summaryHtml}</div>
        <span class="tool-call-executing">执行中...</span>
        <svg class="tool-call-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="tool-call-body">
        <pre><code>${escapeHtml(formattedArgs)}</code></pre>
      </div>
    `;
    
    // 点击展开/折叠
    item.querySelector('.tool-call-header').addEventListener('click', () => {
      item.classList.toggle('expanded');
    });
    
    contentDiv.appendChild(item);
  });
  
  // 滚动到底部（等浏览器完成布局后）
  // 仅当该流式消息属于当前会话时才滚动，防止后台会话串台滚动
  if (element.isConnected) {
    requestAnimationFrame(() => {
      const chatContainer = document.getElementById('chatContainer');
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  }
}

/**
 * 在流式消息的工具卡片中添加执行结果
 * @param {Object} result - { toolCallId, toolName, success, content, truncated, duration }
 */
function appendToolResult(result, streamingElement) {
  if (!result?.toolCallId) return;
  
  // 在当前流式消息中查找对应的工具卡片
  const element = streamingElement;
  if (!element) return;
  
  const card = element.querySelector(`.tool-call-item[data-tool-call-id="${result.toolCallId}"]`);
  if (!card) return;
  
  // 标记为已有结果，停止执行中动画
  card.classList.add('has-result');

  // 对于极快完成的工具（如 agent_write_file 仅 7ms），STREAM_TOOL_CALL 和
  // STREAM_TOOL_RESULT 几乎同时到达，浏览器来不及渲染"执行中..."状态。
  // 因此设置最小显示延迟 400ms，确保用户能看到执行中的过渡状态。
  const createdTs = parseInt(card.getAttribute('data-created-at'), 10);
  const elapsed = Date.now() - createdTs;
  const MIN_DISPLAY_MS = 400;
  const delay = elapsed < MIN_DISPLAY_MS && elapsed >= 0 ? MIN_DISPLAY_MS - elapsed : 0;
  
  const renderResult = () => {
    // 移除执行中状态标识
    const executingBadge = card.querySelector('.tool-call-executing');
    if (executingBadge) executingBadge.remove();
    
    // 移除旧的结果（如果有）
    const oldResult = card.querySelector('.tool-call-result');
    if (oldResult) oldResult.remove();
    
    // 截断提示
    const truncateNote = result.truncated 
      ? '<span class="tool-result-truncated" title="原始结果过大，已截断显示">(输出过长已截断)</span>' 
      : '';
    
    // 格式化结果内容
    const contentText = result.content || (result.success ? '(无输出)' : '执行失败');
    const contentPreview = contentText.length > 500 
      ? contentText.substring(0, 500) + '\n... (点击展开查看完整输出)' 
      : contentText;
    const fullContent = contentText;
    
    const resultDiv = document.createElement('div');
    resultDiv.className = 'tool-call-result';
    resultDiv.innerHTML = `
      <div class="tool-result-header">
        <span class="tool-result-status ${result.success ? 'success' : 'fail'}">
          ${result.success ? '' : ''}${result.success ? '成功' : '失败'}
        </span>
        ${result.duration ? `<span class="tool-result-duration">${result.duration}ms</span>` : ''}
        ${truncateNote}
      </div>
      <div class="tool-result-content">
        <pre><code>${escapeHtml(contentPreview)}</code></pre>
      </div>
    `;
    
    card.appendChild(resultDiv);
    
    // 如果内容 > 500 字符，支持点击展开完整内容
    if (fullContent.length > 500) {
      const codeBlock = resultDiv.querySelector('code');
      // 将完整内容存储到 data 属性，供历史消息恢复时使用
      codeBlock.dataset.fullContent = fullContent;
      let isExpanded = false;
      resultDiv.style.cursor = 'pointer';
        resultDiv.addEventListener('click', () => {
          isExpanded = !isExpanded;
          codeBlock.textContent = isExpanded ? fullContent : contentPreview;
        });
      }
      
      // 滚动到底部（等浏览器完成布局后）
      // 仅当该流式消息属于当前会话时才滚动，防止后台会话串台滚动
      if (streamingElement.isConnected) {
        requestAnimationFrame(() => {
          const chatContainer = document.getElementById('chatContainer');
          if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
        });
      }
    };
    
    // 根据延迟决定是否立即渲染或延迟渲染
    if (delay > 0) {
      setTimeout(renderResult, delay);
    } else {
      renderResult();
    }
}

/**
 * 创建工具预筛选卡片（用于流式过程折叠区的最前面）
 * @param {Object} entry - preselect 执行日志条目
 * @returns {HTMLElement}
 */
function createPreSelectCard(entry) {
  const card = document.createElement('div');
  card.className = 'tool-call-item expanded preselect-card';
  
  const isFailed = entry.status === 'failed';
  const statusText = isFailed ? '失败' : '完成';
  const statusClass = isFailed ? 'fail' : 'success';
  
  let summaryHtml = '';
  if (entry.action?.params?.selected) {
    // 成功筛选：显示筛选结果
    const selected = entry.action.params.selected;
    const toolCount = entry.apiRequest?.toolCount || '?';
    summaryHtml = `<span class="preselect-summary">从 ${toolCount} 个工具中筛选出 <strong>${selected.length}</strong> 个：${selected.map(n => `<code>${escapeHtml(n)}</code>`).join('、')}</span>`;
  } else if (entry.action?.name === 'all_tools') {
    summaryHtml = `<span class="preselect-summary">跳过筛选（${escapeHtml(entry.action.params.reason || '')}），使用全部工具</span>`;
  } else if (entry.action?.name === 'skip') {
    summaryHtml = `<span class="preselect-summary">跳过筛选（${escapeHtml(entry.action.params.reason || '')}），工具总数 ${entry.action.params.toolCount || '?'}</span>`;
  } else if (entry.error) {
    summaryHtml = `<span class="preselect-summary" style="color:#dc2626;">${escapeHtml(entry.error)}</span>`;
  } else if (entry.thought) {
    summaryHtml = `<span class="preselect-summary">模型直接回答：${escapeHtml(entry.thought).substring(0, 200)}</span>`;
  }
  
  const duration = entry.duration ? `${entry.duration}ms` : '';
  
  card.innerHTML = `
    <div class="tool-call-header">
      <svg class="tool-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span class="tool-call-name">工具预筛选</span>
      <span class="tool-call-status ${statusClass}">${statusText}</span>
      ${duration ? `<span class="tool-call-duration">${duration}</span>` : ''}
      <svg class="tool-call-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="tool-call-body">
      ${summaryHtml}
      ${entry.apiResponse?.toolCountAfter !== undefined ? `<div class="preselect-meta">筛选后工具数：<strong>${entry.apiResponse.toolCountAfter}</strong></div>` : ''}
    </div>
  `;
  
  card.querySelector('.tool-call-header').addEventListener('click', () => {
    card.classList.toggle('expanded');
  });
  
  return card;
}

/**
 * 完成流式消息：移除状态文本，添加底部工具栏（复制/引用/导出/执行日志）
 * 如果包含 ReAct 工具调用过程，自动将思考过程包装到可折叠区域，最终答案始终可见
 * @param {HTMLElement} element - 流式消息容器元素
 * @param {string} content - 最终内容
 * @param {Array} executionLog - 执行日志
 * @param {number|null} reflectionScore - 反思评分
 * @param {string|null} reasoningContent - 推理/思考过程内容
 */
function finalizeStreamingMessage(element, content, executionLog = [], reflectionScore = null, reasoningContent = null, wasRevised = false) {
  if (!element) return;
  
  const messageContent = element.querySelector('.message-content');
  const streamContent = element.querySelector('.stream-content');
  
  // 最后一轮思考结束：隐藏思考指示器，添加思考结果badge（在思考内容上面）
  const visibleThinking = element.querySelector('.thinking-indicator:not(.hidden)');
  if (visibleThinking && streamContent) {
    const duration = _thinkingStartTime > 0 ? ((Date.now() - _thinkingStartTime) / 1000).toFixed(1) + 's' : '';
    const badge = document.createElement('span');
    badge.className = 'thinking-badge';
    badge.innerHTML = `<svg class="thinking-icon-static" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/></svg>思考结果${duration ? ' <span class="thinking-duration">'+duration+'</span>' : ''}`;
    
    if (streamContent.contains(visibleThinking)) {
      // 思考指示器在 stream-content 内：找到当前轮的 thinking-content，在它前面插入 badge
      const prevSibling = visibleThinking.previousElementSibling;
      if (prevSibling && prevSibling.classList.contains('thinking-content')) {
        // thinking-content 在 thinking-indicator 前面，在 content 前面插入 badge
        streamContent.insertBefore(badge, prevSibling);
      } else {
        // 没有 thinking-content，在 thinking-indicator 前面插入 badge
        streamContent.insertBefore(badge, visibleThinking);
      }
      visibleThinking.classList.add('hidden');
    } else {
      // 思考指示器在 message-content 中（第一轮迭代）：找到最后一个 thinking-content，在它前面插入 badge
      const thinkingContents = streamContent.querySelectorAll('.thinking-content');
      if (thinkingContents.length > 0) {
        const lastContent = thinkingContents[thinkingContents.length - 1];
        const nextSibling = lastContent.nextElementSibling;
        if (!nextSibling || !nextSibling.classList.contains('thinking-badge')) {
          // 最后一个 thinking-content 是当前轮的，在它前面插入 badge
          streamContent.insertBefore(badge, lastContent);
        } else {
          // 最后一个 thinking-content 已经是上一轮的，在末尾插入 badge
          streamContent.appendChild(badge);
        }
      } else {
        // 没有 thinking-content，追加到末尾
        streamContent.appendChild(badge);
      }
      visibleThinking.classList.add('hidden');
      visibleThinking.remove();
    }
  }
  
  // 隐藏所有剩余的思考指示器（确保全部隐藏）
  element.querySelectorAll('.thinking-indicator').forEach(el => el.classList.add('hidden'));
  
  const statusDiv = element.querySelector('.stream-status');
  if (statusDiv) statusDiv.remove();
  element.classList.remove('streaming');
  
  // 检测是否为 ReAct 过程（包含工具调用卡片）
  const hasToolCalls = (messageContent && messageContent.querySelector('.tool-call-item'))
    || (streamContent && streamContent.querySelector('.tool-call-item'));
  
  if (hasToolCalls) {
    // ============================================
    // ReAct 模式：包装思考过程到可折叠区域
    // ============================================
    
    // 计算整体思考耗时
    const totalDuration = _processStartTime > 0 ? ((Date.now() - _processStartTime) / 1000).toFixed(1) + 's' : '';
    
    // 创建可折叠的思考过程区域
    const processHistory = document.createElement('div');
    processHistory.className = 'thinking-process collapsed';
    
    const processHeader = document.createElement('div');
    processHeader.className = 'thinking-process-header';
    processHeader.innerHTML = `
      <svg class="thinking-process-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
        <circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/>
      </svg>
      <span class="thinking-process-title">思考过程</span>
      <span class="thinking-process-duration">${totalDuration}</span>
      <svg class="thinking-process-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    `;
    
    const processBody = document.createElement('div');
    processBody.className = 'thinking-process-body';
    const processContent = document.createElement('div');
    processContent.className = 'thinking-process-content';
    processBody.appendChild(processContent);
    
    // 移动 stream-content 的内容到 process-content
    if (streamContent) {
      while (streamContent.firstChild) {
        processContent.appendChild(streamContent.firstChild);
      }
    }
    
    // 移动所有 tool-call-item 到 process-content
    const toolItems = messageContent.querySelectorAll('.tool-call-item');
    toolItems.forEach(item => processContent.appendChild(item));
    
    // 移除流式过程中可能已添加的预筛选卡片（避免重复），然后统一从 executionLog 重建
    processContent.querySelectorAll('.preselect-card').forEach(el => el.remove());
    const preselectEntries = (executionLog || []).filter(e => e.nodeType === 'preselect');
    console.log('[finalizeStreamingMessage] executionLog length:', (executionLog || []).length, 'preselectEntries:', preselectEntries.length);
    preselectEntries.forEach(entry => {
      console.log('[finalizeStreamingMessage] creating preselect card for entry:', entry);
      const preselectCard = createPreSelectCard(entry);
      processContent.insertBefore(preselectCard, processContent.firstChild);
    });
    
    // 移除与最终答案重复的 thinking-badge/thinking-content（最终答案统一由 final-answer 展示）
    // 在 ReAct 模式下，最后一个 thinking-content 就是最终答案，应该始终移除它和它前面的 badge
    // 除非 wasRevised 为 true（反思修改了答案，此时最终答案与最后一个 thinking-content 不同）
    const thinkingContents = processContent.querySelectorAll('.thinking-content');
    const finalText = extractTextContent(content).trim();
    
    if (thinkingContents.length > 0) {
      const lastContent = thinkingContents[thinkingContents.length - 1];
      const lastContentText = lastContent.textContent.trim();
      
      // 判断是否需要移除：
      // 1. 未修订时：始终移除最后一个 thinking-content（因为它就是最终答案）
      // 2. 已修订时：只有当内容相同时才移除（反思没有实际改变内容）
      const shouldRemove = !wasRevised || (wasRevised && lastContentText === finalText);
      
      if (shouldRemove) {
        // 通过 DOM 关系查找对应的 thinking-badge（在 thinking-content 前面）
        let prevSibling = lastContent.previousElementSibling;
        while (prevSibling) {
          if (prevSibling.classList.contains('thinking-badge')) {
            prevSibling.remove();
            break;
          }
          prevSibling = prevSibling.previousElementSibling;
        }
        
        lastContent.remove();
      }
    }
    
    // 检查 processContent 是否还有实际内容
    // 如果为空，则不显示思考过程区域，只显示最终答案
    const hasProcessContent = processContent.children.length > 0 && processContent.textContent.trim();
    
    if (hasProcessContent) {
      processHistory.appendChild(processHeader);
      processHistory.appendChild(processBody);
      
      // 创建最终答案区域（始终可见，不折叠）
      const finalAnswer = document.createElement('div');
      finalAnswer.className = 'final-answer';
      const textContent = extractTextContent(content);
      if (textContent && textContent.trim()) {
        finalAnswer.innerHTML = formatMessageContent(textContent);
      }
      
      // 清理 message-content 中的残留元素
      // 移除原始的 thinking-indicator（来自 addStreamingMessage 模板）
      const origThinking = messageContent.querySelector('.thinking-indicator');
      if (origThinking) origThinking.remove();
      // 清空 stream-content（所有子节点已移入思考过程区域）
      if (streamContent) streamContent.innerHTML = '';
      
      // 插入 process-history 和 final-answer
      messageContent.appendChild(processHistory);
      messageContent.appendChild(finalAnswer);
      
      // 点击头部切换折叠
      processHeader.addEventListener('click', () => {
        processHistory.classList.toggle('collapsed');
      });
    } else {
      // 思考过程区域为空：直接渲染最终答案，不显示思考过程区域
      const origThinking = messageContent.querySelector('.thinking-indicator');
      if (origThinking) origThinking.remove();
      if (streamContent) {
        const textContent = extractTextContent(content);
        if (textContent && textContent.trim()) {
          streamContent.innerHTML = formatMessageContent(textContent);
        }
      }
    }
    
  } else {
    // ============================================
    // 非 ReAct 模式：普通流式回答
    // ============================================
    if (streamContent) {
      const textContent = extractTextContent(content);
      // 如果 stream-content 中已有 thinking-content（流式过程中创建），也包装到可折叠区域
      const hasThinkingContent = streamContent.querySelector('.thinking-content');
      
      if (hasThinkingContent) {
        // 有思考内容：包装到 thinking-process 区域，创建独立的 final-answer 显示最终答案
        const totalDuration = _processStartTime > 0 ? ((Date.now() - _processStartTime) / 1000).toFixed(1) + 's' : '';
        
        const processHistory = document.createElement('div');
        processHistory.className = 'thinking-process collapsed';
        
        const processHeader = document.createElement('div');
        processHeader.className = 'thinking-process-header';
        processHeader.innerHTML = `
          <svg class="thinking-process-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
            <circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/>
          </svg>
          <span class="thinking-process-title">思考过程</span>
          <span class="thinking-process-duration">${totalDuration}</span>
          <svg class="thinking-process-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        `;
        
        const processBody = document.createElement('div');
        processBody.className = 'thinking-process-body';
        const processContent = document.createElement('div');
        processContent.className = 'thinking-process-content';
        processBody.appendChild(processContent);
        
        // 移动 stream-content 的内容到 process-content
        while (streamContent.firstChild) {
          processContent.appendChild(streamContent.firstChild);
        }
        
        // 移除与最终答案重复的最后一个 thinking-content 和对应的 badge
        const thinkingContents = processContent.querySelectorAll('.thinking-content');
        const finalText = textContent.trim();
        if (thinkingContents.length > 0) {
          const lastContent = thinkingContents[thinkingContents.length - 1];
          const lastContentText = lastContent.textContent.trim();
          const shouldRemove = !wasRevised || (wasRevised && lastContentText === finalText);
          if (shouldRemove) {
            let prevSibling = lastContent.previousElementSibling;
            while (prevSibling) {
              if (prevSibling.classList.contains('thinking-badge')) {
                prevSibling.remove();
                break;
              }
              prevSibling = prevSibling.previousElementSibling;
            }
            lastContent.remove();
          }
        }
        
        // 检查 processContent 是否还有实际内容
        // 如果为空，则不显示思考过程区域，只显示最终答案
        const hasProcessContent = processContent.children.length > 0 && processContent.textContent.trim();
        
        if (hasProcessContent) {
          processHistory.appendChild(processHeader);
          processHistory.appendChild(processBody);
          
          // 创建最终答案区域（始终可见，不折叠）
          const finalAnswer = document.createElement('div');
          finalAnswer.className = 'final-answer';
          if (textContent && textContent.trim()) {
            finalAnswer.innerHTML = formatMessageContent(textContent);
          }
          
          // 清理 message-content 中的残留元素
          const origThinking = messageContent.querySelector('.thinking-indicator');
          if (origThinking) origThinking.remove();
          
          // 插入 process-history 和 final-answer
          messageContent.appendChild(processHistory);
          messageContent.appendChild(finalAnswer);
          
          // 点击头部切换折叠
          processHeader.addEventListener('click', () => {
            processHistory.classList.toggle('collapsed');
          });
        } else {
          // 思考过程区域为空：直接渲染最终答案，不显示思考过程区域
          const origThinking = messageContent.querySelector('.thinking-indicator');
          if (origThinking) origThinking.remove();
          if (textContent && textContent.trim()) {
            streamContent.innerHTML = formatMessageContent(textContent);
          }
        }
      } else if (textContent && textContent.trim()) {
        // 没有思考内容：直接渲染最终答案
        streamContent.innerHTML = formatMessageContent(textContent);
      }
    }
  }
  
  // 设置数据属性（供工具栏按钮使用）
  element.classList.add('assistant', 'message');
  element.dataset.rawContent = typeof content === 'string' ? content : JSON.stringify(content);
  element.dataset.textContent_ = extractTextContent(content);
  element.dataset.executionLog = JSON.stringify(executionLog);
  
  // 添加底部工具栏
  const footer = document.createElement('div');
  footer.className = 'message-footer';
  
  // 复制按钮
  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.innerHTML = [
    '<svg viewBox="0 0 16 16" fill="currentColor">',
    '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>',
    '</svg>',
    '<span>复制</span>'
  ].join('');
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyAssistantMessage(element, copyBtn);
  });
  footer.appendChild(copyBtn);
  
  // 引用按钮
  const quoteBtn = document.createElement('button');
  quoteBtn.className = 'quote-btn';
  quoteBtn.innerHTML = [
    '<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>',
    '<span>引用</span>'
  ].join('');
  quoteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    quoteAndAsk(element);
  });
  footer.appendChild(quoteBtn);
  
  // 导出菜单
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
    exportAssistantMessageToDocx(element, exportTriggerBtn);
    exportDropdown.classList.remove('show');
  });
  
  exportDropdown.querySelector('.export-pdf-item').addEventListener('click', (e) => {
    e.stopPropagation();
    exportAssistantMessageToPdf(element, exportTriggerBtn);
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
  
  // 执行日志按钮（如果启用且有日志）
  if (executionLog && executionLog.length > 0 && state.chatConfig?.enableExecutionLog) {
    const logBtn = document.createElement('button');
    logBtn.className = 'execution-log-btn';
    logBtn.type = 'button';
    logBtn.title = '执行日志';
    logBtn.innerHTML = [
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<circle cx="12" cy="12" r="10"></circle>',
      '<polyline points="12 6 12 12 16 14"></polyline>',
      '</svg>'
    ].join('');
    footer.appendChild(logBtn);
  }
  
  // 质量评估徽章（反思评分）
  const hasReflection = reflectionScore !== null && reflectionScore !== undefined;
  const reflectionRounds = executionLog 
    ? executionLog.filter(e => e.nodeType === 'reflection' && e.reflectionType === 'post' && e.status === 'success').length 
    : 0;
  const postReflection = executionLog?.find(e => e.nodeType === 'reflection' && e.reflectionType === 'post');
  
  if (hasReflection && state.chatConfig?.enableExecutionLog) {
    const scoreColor = reflectionScore >= 8 ? 'score-high' : (reflectionScore >= 5 ? 'score-mid' : 'score-low');
    const scoreEmoji = reflectionScore >= 8 ? '✅' : (reflectionScore >= 5 ? '🔍' : '⚠️');
    const roundsTag = reflectionRounds > 1 ? ` (${reflectionRounds}轮)` : '';
    
    const scoreBadge = document.createElement('button');
    scoreBadge.className = 'reflection-score-btn';
    scoreBadge.type = 'button';
    scoreBadge.title = `AI 质量评估: ${reflectionScore}/10${roundsTag}\n点击查看评估详情`;
    scoreBadge.innerHTML = `<span class="reflection-badge ${scoreColor}">${scoreEmoji} ${reflectionScore}/10</span>`;
    scoreBadge.dataset.reflectionData = JSON.stringify({
      overallScore: postReflection?.overallScore ?? reflectionScore,
      dimensions: postReflection?.dimensions || null,
      issues: postReflection?.issues || null,
      suggestions: postReflection?.suggestions || null,
      decision: postReflection?.action?.decision || null,
      useful: postReflection?.useful ?? null,
      reasoning: postReflection?.reasoning || null,
      suggestion: postReflection?.suggestion || null,
      rounds: reflectionRounds,
      wasRevised: false
    });
    
    footer.appendChild(scoreBadge);
  } else if (!hasReflection && postReflection && postReflection.status === 'failed' && state.chatConfig?.enableExecutionLog) {
    const warnBadge = document.createElement('button');
    warnBadge.className = 'reflection-score-btn';
    warnBadge.type = 'button';
    warnBadge.title = '反思评估失败（点击查看执行日志）';
    warnBadge.innerHTML = `<span class="reflection-badge score-low">⚠️ 反思失败</span>`;
    footer.appendChild(warnBadge);
  }
  
  // 原型预览按钮
  const prototypeCall = executionLog?.slice().reverse().find(e => e.nodeType === 'tool_exec' && e.action?.name === 'preview_ui_prototype' && e.status === 'success');
  if (prototypeCall) {
    let localOpened = false;
    if (prototypeCall.observation) {
      try {
        const obs = typeof prototypeCall.observation === 'string' 
          ? JSON.parse(prototypeCall.observation) : prototypeCall.observation;
        localOpened = obs?.localOpened === true;
      } catch (e) {}
    }

    const prototypeBtn = document.createElement('button');
    prototypeBtn.className = 'prototype-btn-small';
    prototypeBtn.type = 'button';
    prototypeBtn.title = localOpened ? '已在本地浏览器打开，点击可在面板内查看' : '查看 UI 原型';
    prototypeBtn.innerHTML = ICON_IMAGE_24;
    prototypeBtn.addEventListener('click', () => {
      let prototypeId = prototypeCall.prototypeId;
      if (!prototypeId && prototypeCall.observation) {
        try {
          const parsed = typeof prototypeCall.observation === 'string' 
            ? JSON.parse(prototypeCall.observation) : prototypeCall.observation;
          prototypeId = parsed?.prototypeId;
        } catch (e) {}
      }
      if (prototypeId) {
        loadAndShowPrototype(prototypeId);
      } else {
        console.error('[SidePanel] 未找到 prototypeId，entry keys:', Object.keys(prototypeCall), 'observation:', prototypeCall.observation);
      }
    });
    footer.appendChild(prototypeBtn);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.title = '删除消息';
  deleteBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  `;
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteMessage(element);
  });
  footer.appendChild(deleteBtn);

  element.querySelector('.message-content').appendChild(footer);
  
  // 绑定事件委托（执行日志/反思弹窗点击）
  bindExecutionLogDelegate();
  bindReflectionBadgeDelegate();
  
  // 添加代码复制按钮、Mermaid 渲染等后处理
  addCodeCopyButtons();
  // Mermaid 渲染为异步操作，渲染完成后自动更新 htmlContent
  renderMessageMermaid(element).then(() => {
    element.dataset.htmlContent = element.outerHTML;
  });
  
  // 先保存当前 HTML 到 dataset（Mermaid 渲染完成后会更新）
  element.dataset.htmlContent = element.outerHTML;
}

/**
 * 统一的停止任务处理函数：供输入区停止按钮和流式消息内停止按钮共用
 * @param {HTMLElement} stopBtn - 被点击的停止按钮元素
 */
export function cancelStreamingTask(stopBtn) {
  if (!stopBtn || stopBtn.disabled) return;

  stopBtn.disabled = true;
  stopBtn.style.opacity = '0.4';
  stopBtn.style.cursor = 'not-allowed';

  // 同时更新加载消息中的停止按钮（如果还存在）
  const loadingStopBtn = document.querySelector('.loading-message .stop-task-btn');
  if (loadingStopBtn) {
    loadingStopBtn.disabled = true;
    loadingStopBtn.style.opacity = '0.6';
    loadingStopBtn.style.cursor = 'not-allowed';
    const loadingText = document.querySelector('.loading-message .loading-text');
    if (loadingText) loadingText.textContent = '停止中...';
  }

  // 发送取消消息到后台
  chrome.runtime.sendMessage({
    type: 'CANCEL_REACT',
    tabId: null,
    sessionId: state.activeSessionId
  });

  // 立即清理前端状态
  if (state.pendingCancelApi) {
    state.pendingCancelApi({
      message: '任务已被用户停止',
      executionLog: state.currentExecutionStatus?.executionLog || []
    });
  }
}

/**
 * 清理被取消的流式消息：移除思考中占位和状态文本
 */
function finalizeCancelledStream(element) {
  if (!element) return;
  
  // 隐藏所有思考指示器
  element.querySelectorAll('.thinking-indicator').forEach(el => el.classList.add('hidden'));
  
  // 更新状态文本为"已取消"
  const statusDiv = element.querySelector('.stream-status');
  if (statusDiv) {
    statusDiv.textContent = '';
  }
  
  // 移除 streaming 动画类
  element.classList.remove('streaming');
  element.classList.add('stream-cancelled');
}

function showDeleteConfirm(messagePreview) {
  return new Promise((resolve) => {
    const existing = document.querySelector('.delete-confirm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'delete-confirm-overlay';
    
    const previewText = messagePreview.length > 50 
      ? messagePreview.substring(0, 50) + '...' 
      : messagePreview;

    overlay.innerHTML = `
      <div class="delete-confirm-modal">
        <div class="delete-confirm-header">
          <div class="delete-confirm-icon">🗑️</div>
          <div class="delete-confirm-title">确认删除消息</div>
        </div>
        <div class="delete-confirm-body">
          <p>删除后消息将从对话历史中移除，且无法恢复。</p>
          <div class="delete-confirm-preview">${previewText}</div>
        </div>
        <div class="delete-confirm-footer">
          <button class="delete-confirm-cancel">取消</button>
          <button class="delete-confirm-confirm">确认删除</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector('.delete-confirm-cancel');
    const confirmBtn = overlay.querySelector('.delete-confirm-confirm');

    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });

    confirmBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
      }
    });
  });
}

export async function deleteMessage(messageElement, skipConfirm = false) {
  const messageId = messageElement.dataset.messageId;
  const role = messageElement.classList.contains('user') ? 'user' : 'assistant';
  
  let previewText = '';
  if (role === 'user') {
    previewText = messageElement.textContent.trim();
  } else {
    previewText = messageElement.dataset.textContent_ || '';
  }

  if (!skipConfirm) {
    const confirmed = await showDeleteConfirm(previewText);
    if (!confirmed) return;
  }

  if (messageId) {
    const index = state.messageHistory.findIndex(msg => msg.messageId === messageId);
    if (index !== -1) {
      state.messageHistory.splice(index, 1);
    }
  } else {
    const timestamp = messageElement.dataset.timestamp;
    const index = state.messageHistory.findIndex(msg => msg.timestamp === timestamp);
    if (index !== -1) {
      state.messageHistory.splice(index, 1);
    }
  }

  const prevSibling = messageElement.previousElementSibling;
  if (prevSibling && prevSibling.classList.contains('user-context-bubble')) {
    prevSibling.remove();
  }

  messageElement.remove();

  const chatContainer = document.getElementById('chatContainer');
  const remainingMessages = chatContainer.querySelectorAll('.message');
  
  if (remainingMessages.length === 0) {
    chatContainer.innerHTML = `
      <div class="welcome-message">
        <div class="icon-wrapper">
          <div class="icon">💬</div>
        </div>
        <h2>开始对话</h2>
        <p>输入您的问题，AI 助手将为您解答</p>
      </div>
    `;
  }

  await saveChatHistoryAsync();

  console.log(`[SidePanel] 已删除消息: ${role}, messageId: ${messageId}`);
}

export async function callApi(messages, model, useTools = false, apiParams = {}) {
  const reactConfig = await getReactConfig();
  const timeoutMs = reactConfig.loopTimeout;
  
  const reflectionConfig = await new Promise((resolve) => {
    chrome.storage.local.get('reflectionConfig', (result) => {
      resolve(result.reflectionConfig || { enabled: false });
    });
  });
  
  // 捕获当前会话 ID，切换会话后仍能正确过滤本会话的响应
  const mySessionId = state.activeSessionId;

  // 按 sessionId 隔离的流式元素访问器（防止多会话并行时串台）
  const _se = (val) => {
    if (val === undefined) return _streamingElements.get(mySessionId) || null;
    _streamingElements.set(mySessionId, val);
    return val;
  };

  // 建立长连接端口以保持 Service Worker 存活，
  // 防止 API 调用耗时较长时 Chrome 判定 SW 空闲而将其杀死
  const keepalivePort = chrome.runtime.connect({ name: 'keepalive-' + mySessionId });
  console.log('[SidePanel] keepalive 端口已连接, sessionId:', mySessionId);

  // 监听 SW 静默重启通知：如果后台检测到 SW 曾崩溃重启，会通过 port 发送 SW_RESTARTED
  // 使用 _swRestartCtx 对象桥接异步的 onMessage 和同步的 Promise executor
  const _swRestartCtx = { restarted: false, rejectFn: null, cleanup: null };
  keepalivePort.onMessage.addListener((msg) => {
    if (msg.type === 'SW_RESTARTED' && msg.sessionId === mySessionId) {
      console.warn('[SidePanel] ⚠️ 收到 SW_RESTARTED 通知，后台已重启，API 调用已丢失');
      _swRestartCtx.restarted = true;
      // 如果 Promise executor 已经初始化（rejectFn 已设置），直接触发清理和拒绝
      if (_swRestartCtx.rejectFn && _swRestartCtx.cleanup) {
        _swRestartCtx.cleanup();
        _swRestartCtx.rejectFn({
          message: '后台服务异常重启，API 调用已中断，请重试',
          executionLog: []
        });
      }
    }
  });

  // timeoutId / removeListener 需放在 Promise 外层作用域，供 cleanupCallApi 及 pause/resume 闭包访问
  // 放在对象上防止 terser 在 minify 时跨作用域重命名导致 ReferenceError
  const _timeoutCtx = { timeoutId: null, removeListener: () => {} };

  // 统一清理函数：断开 keepalive 端口、清理 listener 和 timeout、清除状态
  const cleanupCallApi = () => {
    try { keepalivePort.disconnect(); } catch (e) {}
    if (_timeoutCtx.timeoutId) { clearTimeout(_timeoutCtx.timeoutId); _timeoutCtx.timeoutId = null; }
    _timeoutCtx.removeListener();
    state.pendingCancelApiMap.delete(mySessionId);
    state.pendingCallApiSessionIds.delete(mySessionId);
    _streamingElements.delete(mySessionId);  // 清理本会话的流式元素引用
    _streamedContentMap.delete(mySessionId);  // 清理本会话的流式累积内容
    syncPendingSessionsToStorage();
  };
  
  return new Promise((resolve, reject) => {
    // 桥接 SW 重启检测到 Promise executor
    _swRestartCtx.cleanup = cleanupCallApi;
    _swRestartCtx.rejectFn = reject;

    // SW 重启检测：如果在 Promise 执行前已经收到 SW_RESTARTED 通知，立即 reject
    if (_swRestartCtx.restarted) {
      cleanupCallApi();
      reject({ message: '后台服务异常重启，API 调用已中断，请重试', executionLog: [] });
      return;
    }

    let executionLog = [];
    const timeoutSeconds = Math.round(timeoutMs / 1000);
    
    // 流式输出状态
    _se(null);
    _pendingPreselectLog = null;
    _processStartTime = 0;
    let _streamedContent = '';
    let _agentStreams = {};  // execId -> { element, stdout, stderr }
    
    // 包装取消函数，供停止按钮使用：同时 reject Promise 并清理 listener 和 timeout
    const cancelApi = (errorResult) => {
      // 如果存在流式输出元素，清理思考中占位
      if (_se()) {
        finalizeCancelledStream(_se());
      }
      cleanupCallApi();
      // 合并执行日志：优先使用本地 executionLog（后台实时推送），其次使用外部传入的
      if (!errorResult.executionLog || errorResult.executionLog.length === 0) {
        errorResult.executionLog = executionLog;
      } else if (executionLog.length > 0) {
        // 两者都有时，以本地为准（后台最新快照）
        errorResult.executionLog = executionLog;
      }
      reject(errorResult);
    };
    state.pendingCancelApi = cancelApi;
    state.pendingCallApiSessionIds.add(mySessionId);
    syncPendingSessionsToStorage();
    console.log('[SidePanel] callApi: 添加 pendingCallApiSessionIds, mySessionId =', mySessionId, ', set:', [...state.pendingCallApiSessionIds]);
    
    _timeoutCtx.timeoutId = setTimeout(() => {
      cancelApi({
        message: `请求超时（${timeoutSeconds}秒）`,
        executionLog: executionLog
      });
      // 同时通知后台取消（超时场景）
      chrome.runtime.sendMessage({
        type: 'CANCEL_REACT',
        tabId: state.currentTabId,
        sessionId: state.activeSessionId
      }).catch(err => {
        console.log('[SidePanel] 发送取消请求失败:', err.message);
      });
    }, timeoutMs);
    
    const loopStartTime = Date.now();
    let totalPausedDuration = 0;
    let pauseStartTime = null;
    
    const pauseTimeout = () => {
      if (pauseStartTime === null && _timeoutCtx.timeoutId !== null) {
        pauseStartTime = Date.now();
        clearTimeout(_timeoutCtx.timeoutId);
        _timeoutCtx.timeoutId = null;
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
          cancelApi({
            message: `请求超时（${timeoutSeconds}秒）`,
            executionLog: executionLog
          });
          return;
        }
        
        _timeoutCtx.timeoutId = setTimeout(() => {
          cancelApi({
            message: `请求超时（${timeoutSeconds}秒）`,
            executionLog: executionLog
          });
          chrome.runtime.sendMessage({
            type: 'CANCEL_REACT',
            tabId: state.currentTabId,
            sessionId: mySessionId
          }).catch(err => {
            console.log('[SidePanel] 发送取消请求失败:', err.message);
          });
        }, remainingTime);
        
        console.log('[SidePanel] 前端超时已恢复，暂停时长:', Math.round(pauseDuration / 1000), 's，剩余时间:', Math.round(remainingTime / 1000), 's');
      }
    };

    const listener = (message) => {
      // console.log('[SidePanel] 收到消息:', message);
      
      // 过滤：只处理属于本会话或没有 sessionId 的消息（兼容）
      // 使用捕获的 mySessionId 而非 state.activeSessionId，确保切换会话后仍能收到本会话的响应
      if (message.sessionId && message.sessionId !== mySessionId) {
        return false;
      }
      
      if (message.type === 'EXECUTION_STATUS_UPDATE') {
        const deltaLog = message.executionLog || [];
        if (deltaLog.length > 0) {
          deltaLog.forEach(newEntry => {
            const existingIndex = executionLog.findIndex(existing => existing.id === newEntry.id);
            if (existingIndex !== -1) {
              executionLog[existingIndex] = { ...executionLog[existingIndex], ...newEntry };
            } else {
              executionLog.push(newEntry);
            }
          });
        }
        
        // 子任务进度显示：每个子任务独立一行，并行场景下互不干扰
        if (message.subtaskTotal && message.subtaskTotal > 0) {
          const se = _se();
          if (se) {
            const contentDiv = se.querySelector('.stream-content');
            if (contentDiv) {
              const si = message.subtaskIndex ?? 0;
              const selector = `.subtask-progress[data-subtask-index="${si}"]`;
              let progressEl = contentDiv.querySelector(selector);
              if (!progressEl) {
                progressEl = document.createElement('div');
                progressEl.className = 'subtask-progress';
                progressEl.dataset.subtaskIndex = si;
                contentDiv.appendChild(progressEl);
              }
              
              // 任务图标 + 序数标识
              const taskIcon = `<svg class="subtask-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="8" y1="2" x2="8" y2="4"/><line x1="16" y1="2" x2="16" y2="4"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
              const idx = si + 1;
              const total = message.subtaskTotal;
              const name = message.subtaskName || '';
              const badge = `<span class="subtask-badge">${idx}/${total}</span>`;
              
              if (message.status === 'success') {
                progressEl.innerHTML = `${taskIcon}${badge}<span class="subtask-name">${name}</span><span class="subtask-status-done">完成</span>`;
                progressEl.classList.add('subtask-progress-done');
                progressEl.classList.remove('subtask-progress-active');
              } else if (message.status === 'failed') {
                progressEl.innerHTML = `${taskIcon}${badge}<span class="subtask-name">${name}</span><span class="subtask-status-failed">失败</span>`;
                progressEl.classList.add('subtask-progress-failed');
                progressEl.classList.remove('subtask-progress-active');
              } else {
                progressEl.innerHTML = `${taskIcon}${badge}<span class="subtask-name">${name}</span><span class="subtask-status-label"><span class="subtask-spinner"></span>执行中...</span>`;
                progressEl.classList.add('subtask-progress-active');
              }
              
              // 全部子任务完成时，为每个元素统一添加完成样式
              const allDone = message.status === 'success' && idx >= total;
              if (allDone) {
                const allEls = contentDiv.querySelectorAll('.subtask-progress');
                allEls.forEach(el => el.classList.add('subtask-progress-all-done'));
              }
            }
          }
        }
        
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
      
      // 流式输出消息处理
      if (message.type === 'STREAM_PRESELECT') {
        console.log('[SidePanel] 收到预筛选日志，条数:', message.preselectLog?.length);
        _pendingPreselectLog = message.preselectLog || null;
        // 如果流式元素已创建（STREAM_START 先于本消息到达），立即添加预筛选卡片
        if (_se() && _pendingPreselectLog && _pendingPreselectLog.length > 0) {
          const mc = _se().querySelector('.message-content');
          if (mc) {
            _pendingPreselectLog.forEach(entry => {
              const preselectCard = createPreSelectCard(entry);
              mc.insertBefore(preselectCard, mc.firstChild);
            });
            _pendingPreselectLog = null;
            console.log('[SidePanel] 预筛选卡片已追加到已有流式元素');
          }
        }
        return false;
      }
      
      if (message.type === 'STREAM_START') {
        console.log('[SidePanel] 流式输出开始');
        // 移除 loading 消息（通过 _loadingId 精确定位当前会话的 loading）
        const loadingId = apiParams._loadingId;
        const loadingDiv = loadingId ? document.getElementById(loadingId) : document.querySelector('.loading-message');
        if (loadingDiv) {
          loadingDiv.remove();
        }
        // 清理执行日志监听器
        if (state.executionLogListener) {
          chrome.runtime.onMessage.removeListener(state.executionLogListener);
          state.executionLogListener = null;
        }
        state.currentExecutionStatus = null;
        
        if (!_se()) {
          _se(addStreamingMessage());
          _processStartTime = Date.now();
          
          // 如果有待处理的预筛选日志，立即添加预筛选卡片到 message-content 最前面
          // （在 thinking-indicator 之前，确保视觉上预筛选卡片先于思考中显示）
          if (_pendingPreselectLog && _pendingPreselectLog.length > 0) {
            const mc = _se().querySelector('.message-content');
            _pendingPreselectLog.forEach(entry => {
              const preselectCard = createPreSelectCard(entry);
              mc.insertBefore(preselectCard, mc.firstChild);
            });
            _pendingPreselectLog = null;
          }
        } else {
          // 后续 ReAct 迭代：在 stream-content 末尾添加新的思考指示器
          const contentDiv = _se().querySelector('.stream-content');
          if (contentDiv) {
            const existingThinking = contentDiv.querySelector('.thinking-indicator:not(.hidden)');
            if (existingThinking) {
              console.warn('[STREAM_START] 已有可见的思考指示器，跳过创建:', existingThinking);
            }
            if (!existingThinking) {
              const newThinking = document.createElement('div');
              newThinking.className = 'thinking-indicator';
              newThinking.innerHTML = `
                <svg class="thinking-icon pulse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
                  <circle cx="8" cy="12" r="1.5"/>
                  <circle cx="16" cy="12" r="1.5"/>
                </svg>
                <div class="thinking-dots"><span></span><span></span><span></span></div>
                <span class="thinking-label">思考中...</span>
                <button class="streaming-stop-btn" title="停止生成">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  </svg>
                </button>
              `;
              const stopBtn = newThinking.querySelector('.streaming-stop-btn');
              if (stopBtn) {
                stopBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  cancelStreamingTask(stopBtn);
                });
              }
              contentDiv.appendChild(newThinking);
            }
          }
        }
        
        _streamedContent = '';
        _streamedContentMap.set(mySessionId, '');
        _thinkingStartTime = Date.now();
        _reasoningContent = '';
        return false;
      }
      
      if (message.type === 'STREAM_CHUNK') {
        if (_se()) {
          _streamedContent += message.delta;
          _streamedContentMap.set(mySessionId, _streamedContent);
          // 如果流式元素已脱离 DOM（用户切换过会话），仍然累积内容到 Map，
          // 但跳过 DOM 更新（等切回时通过 reconnectStreamingElement 恢复渲染）
          if (_se().isConnected) {
            updateStreamingMessage(_se(), _streamedContent);
          }
        }
        return false;
      }
      
      if (message.type === 'STREAM_TOOL_CALL') {
        if (!_se()) {
          // 如果流式元素还没有创建，立即创建
          _se(addStreamingMessage());
          _processStartTime = Date.now();
        }
        if (_se() && message.toolCalls?.length > 0) {
          // 添加工具调用详情卡片（含图标、名称、命令/文件/参数、可折叠详情）
          appendToolCallItems(_se(), message.toolCalls);
        }
        return false;
      }
      
      if (message.type === 'STREAM_TOOL_RESULT') {
        // 工具执行完成，在对应卡片后追加结果
        if (_se() && message.result) {
          appendToolResult(message.result, _se());
        }
        return false;
      }
      
      if (message.type === 'AGENT_STREAM') {
        // Agent 命令实时输出
        if (_se() && message.execId) {
          let agentEntry = _agentStreams[message.execId];
          if (!agentEntry) {
            // 创建新的 Agent 输出区域
            const outputDiv = document.createElement('div');
            outputDiv.className = 'agent-stream-output';
            outputDiv.innerHTML = `
              <div class="agent-stream-header">
                <span class="agent-stream-icon">🖥️</span>
                <span class="agent-stream-label">命令输出</span>
              </div>
              <pre class="agent-stream-content"><code></code></pre>
            `;
            const sc = _se().querySelector('.stream-content');
            if (sc) {
              sc.appendChild(outputDiv);
            }
            agentEntry = { element: outputDiv, stdout: '', stderr: '' };
            _agentStreams[message.execId] = agentEntry;
          }
          
          const codeEl = agentEntry.element.querySelector('code');
          if (codeEl) {
            if (message.streamType === 'stderr') {
              agentEntry.stderr += message.data;
            } else {
              agentEntry.stdout += message.data;
            }
            codeEl.textContent = agentEntry.stdout + (agentEntry.stderr ? '\n' + agentEntry.stderr : '');
            // 自动滚动到底部
            codeEl.parentElement.scrollTop = codeEl.parentElement.scrollHeight;
          }
        }
        return false;
      }
      
      if (message.type === 'AGENT_STREAM_DONE') {
        // Agent 命令执行结束
        if (message.execId) {
          const agentEntry = _agentStreams[message.execId];
          if (agentEntry) {
            const headerEl = agentEntry.element.querySelector('.agent-stream-label');
            if (headerEl) {
              const exitLabel = message.exitCode === 0 ? '完成' : `退出 (code: ${message.exitCode})`;
              headerEl.textContent = `命令输出 - ${exitLabel}`;
            }
            if (message.exitCode !== 0) {
              agentEntry.element.classList.add('agent-stream-error');
            }
          }
        }
        return false;
      }
      
      if (message.type === 'STREAM_DONE') {
        if (_se()) {
          const statusDiv = _se().querySelector('.stream-status');
          if (statusDiv) {
            if (reflectionConfig?.enabled) {
              // 反思功能启用时，显示质量评估状态，让用户知道这段时间在做什么
              statusDiv.textContent = '质量评估中...';
            } else {
              // 无反思时不需要显示冗余状态文字
              statusDiv.textContent = '';
            }
          }
          // 不在此处移除 streaming 类，由 API_COMPLETE 统一处理
        }
        return false;
      }
      
      if (message.type === 'API_COMPLETE') {
        // 流式消息：在 resolve 前添加底部工具栏
        if (_se() && message.content) {
          finalizeStreamingMessage(_se(), message.content, message.executionLog || [], message.reflectionScore, message.reasoningContent, message.wasRevised);
        }
        // 在 cleanupCallApi 之前捕获状态（cleanup 会清空 _streamingElements）
        const streamingEl = _se();
        const wasStreamed = !!streamingEl;
        const streamingHtml = streamingEl ? (streamingEl.dataset.htmlContent || streamingEl.outerHTML) : null;
        const streamingConnected = streamingEl ? streamingEl.isConnected : false;
        const streamingMsgId = streamingEl ? streamingEl.dataset.messageId : null;
        cleanupCallApi();
        resolve({ 
          content: message.content, 
          executionLog: message.executionLog || executionLog,
          reflectionScore: message.reflectionScore,
          wasStreamed,
          wasRevised: message.wasRevised,
          streamingHtml,
          streamingConnected,
          streamingMsgId
        });
        return false;
      } else if (message.type === 'API_ERROR') {
        cleanupCallApi();
        reject({
          message: message.error,
          executionLog: message.executionLog || executionLog
        });
        return false;
      }
      return false;
    };
    
    chrome.runtime.onMessage.addListener(listener);
    
    _timeoutCtx.removeListener = () => {
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
      apiParams: apiParams,
      agentId: state.activeAgentId,
      agentToolIds: state.activeAgentToolIds,
      // 图片识别独立配置（仅当启用且有图片时传递）
      imageApiBase: state.enableImageInput && state.attachedImages.length > 0 ? (state.imageApiBase || '') : '',
      imageApiKey: state.enableImageInput && state.attachedImages.length > 0 ? (state.imageApiKey || '') : ''
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
  const reflectionEntries = executionLog.filter(entry => entry.nodeType === 'reflection');
  const postReflection = reflectionEntries.find(e => e.reflectionType === 'post');
  
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
            ${postReflection ? `
            <div class="combo-stat reflection" title="质量评估: ${postReflection.overallScore}/10">
              <span class="stat-icon">🎯</span>
              <span class="stat-label">评分</span>
              <span class="stat-value">${postReflection.overallScore}/10</span>
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
    const textToCopy = messageDiv.dataset.textContent_ || messageDiv.dataset.rawContent || '';
    
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
    const rawContent = messageDiv.dataset.rawContent || '';
    const textContent_ = messageDiv.dataset.textContent_ || '';
    
    if (!textContent_ && !rawContent) {
      showToast('无法获取消息内容', 'error');
      return;
    }
    
    // 1. 恢复图片附件到 state.attachedImages 并显示在输入框上方
    state.attachedImages = [];
    if (rawContent.startsWith('[')) {
      try {
        const parsed = JSON.parse(rawContent);
        if (Array.isArray(parsed)) {
          const imageParts = parsed.filter(c => c.type === 'image_url');
          for (const imgPart of imageParts) {
            state.attachedImages.push({ 
              originalUrl: imgPart.image_url.url, 
              compressedUrl: imgPart.image_url.url 
            });
          }
        }
      } catch (e) { /* 不是 JSON 格式，跳过图片解析 */ }
    }
    renderImagePreviewsFromChat();
    
    // 2. 恢复文件附件到 state.attachedFiles 并显示在输入框上方
    state.attachedFiles = [];
    if (messageDiv.dataset.attachedFiles) {
      try {
        const storedFiles = JSON.parse(messageDiv.dataset.attachedFiles);
        for (const f of storedFiles) {
          state.attachedFiles.push({
            name: f.name,
            size: f.size,
            type: f.type,
            text: f.text || '',
            status: f.status || 'done',
            agentPath: f.agentPath || ''
          });
        }
      } catch (e) { /* 解析失败，跳过 */ }
    }
    // 导入 renderFilePreviews 来更新文件预览栏
    import('./file-extract.js').then(mod => {
      mod.renderFilePreviews();
    });
    
    // 3. 恢复网页上下文（如果消息选中了网页）
    clearPageSelection();
    const pageMatch = textContent_.match(/^\[网页上下文\]\n标题: (.+)\nURL: (.+)\ntabId: (\d+)\n/);
    if (pageMatch) {
      state.selectedPage = {
        id: parseInt(pageMatch[3]),
        title: pageMatch[1],
        url: pageMatch[2],
        favIconUrl: ''
      };
      const pageIndicator = document.getElementById('pageIndicator');
      const pageNameEl = document.getElementById('pageIndicatorName');
      if (pageIndicator && pageNameEl) {
        const restoredTitle = pageMatch[1];
        const restoredUrl = pageMatch[2];
        if (restoredTitle && restoredTitle !== '无标题' && restoredUrl) {
          pageNameEl.textContent = `${restoredTitle} · ${restoredUrl}`;
        } else {
          pageNameEl.textContent = restoredTitle || restoredUrl;
        }
        pageIndicator.style.display = 'flex';
      }
    }

    // 3a. 恢复技能上下文（如果消息使用了技能）
    clearSkillSelection();
    clearMcpService();
    const skillMatch = textContent_.match(/^\[已选技能:\s*([^\n\]]+)\]/);
    if (skillMatch) {
      const skillName = skillMatch[1].split(' - ')[0].trim();
      state.selectedSkill = { name: skillName, description: '', type: 'agent' };
      const skillIndicator = document.getElementById('skillIndicator');
      const skillNameEl = document.getElementById('skillIndicatorName');
      if (skillIndicator && skillNameEl) {
        skillNameEl.textContent = skillName;
        skillIndicator.style.display = 'flex';
      }
    }

    // 3b. 恢复 MCP 服务上下文
    const mcpMatch = textContent_.match(/^\[已选MCP服务:\s*([^\n\]]+)\]/);
    if (mcpMatch) {
      const mcpName = mcpMatch[1].split(' - ')[0].trim();
      state.selectedMcpService = { serverId: '', serverName: mcpName, toolCount: 0 };
      const mcpIndicator = document.getElementById('mcpIndicator');
      const mcpNameEl = document.getElementById('mcpIndicatorName');
      if (mcpIndicator && mcpNameEl) {
        mcpNameEl.textContent = mcpName;
        mcpIndicator.style.display = 'flex';
      }
    }

    // 4. 从文本中去掉网页/技能/MCP前缀
    let textContentClean = textContent_;
    if (pageMatch) {
      textContentClean = textContentClean.replace(/^\[网页上下文\]\n标题: .+\nURL: .+\ntabId: \d+\n/, '');
    }
    if (mcpMatch) {
      textContentClean = textContent_.replace(/^\[已选MCP服务:[^\]]+\]\n请使用「[^」]+」MCP服务来处理以下问题：\n/, '');
    }
    if (skillMatch) {
      textContentClean = textContentClean.replace(/^\[已选技能:[^\]]+\]\n请使用「[^」]+」技能来处理以下问题：\n/, '');
    }

    // 5. 恢复引用/选中上下文，显示在输入框上方
    // 保存当前已有的上下文状态（如果用户之前已经引用了消息或选中了内容）
    const existingQuotedContext = state.quotedContextText;
    const existingSelectedContext = state.selectedContextText;
    
    state.quotedContextText = '';
    state.selectedContextText = '';
    
    const quotedMatch = textContentClean.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/);
    const selectedMatch = textContentClean.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/);
    const match = quotedMatch || selectedMatch;
    
    let textToEdit = textContentClean;
    
    if (match) {
      const type = quotedMatch ? 'quoted' : 'selected';
      const contextText = match[1].trim();
      let userQuestion = match[2].trim();
      
      // 如果有文件，从编辑文本中去掉文件内容部分
      if (state.attachedFiles.length > 0) {
        const fileIdx = userQuestion.search(/\n\n\[(?:工作目录)?文件(?:内容)?:/);
        if (fileIdx !== -1) {
          userQuestion = userQuestion.substring(0, fileIdx);
        }
      }
      
      // 更新 selectionIndicator 显示
      const indicator = document.getElementById('selectionIndicator');
      const selectionTextEl = document.getElementById('selectionText');
      if (indicator && selectionTextEl) {
        let displayText;
        if (contextText.length > 100) {
          displayText = contextText.substring(0, 100) + '...';
        } else if (contextText.length > 50) {
          displayText = contextText.substring(0, 50) + '...';
        } else {
          displayText = contextText;
        }
        
        if (type === 'quoted') {
          state.quotedContextText = contextText;
          selectionTextEl.textContent = `💬 已引用: ${displayText}`;
        } else {
          state.selectedContextText = contextText;
          selectionTextEl.textContent = `📌 已选中: ${displayText}`;
        }
        indicator.classList.add('show');
      }
      
      textToEdit = userQuestion;
    } else {
      // 没有引用/选中上下文
      state.quotedContextText = existingQuotedContext;
      state.selectedContextText = existingSelectedContext;
      
      // 如果有文件，去掉文件内容
      if (state.attachedFiles.length > 0) {
        const fileIdx = textToEdit.search(/\n\n\[(?:工作目录)?文件(?:内容)?:/);
        if (fileIdx !== -1) {
          textToEdit = textToEdit.substring(0, fileIdx);
        }
      }
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
