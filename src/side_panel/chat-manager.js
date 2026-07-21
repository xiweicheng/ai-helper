// chat-manager.js - 聊天管理模块
// 从 index.js 提取的聊天相关函数

import state from './state.js';
import { showToast, adjustInputHeight, getSystemPrompt, getApiParams, ensureChatConfigLoaded, copyToClipboard, escapeHtml, formatDuration, getReactConfig } from './utils.js';
import { getCurrentAgentPrompt, getCurrentAgentToolIds } from './agent-manager.js';
import { addToInputHistory } from './input-history.js';
import { formatMessageContent, addCodeCopyButtons, renderMessageMermaid, renderMermaidCharts, addTableToolbarEvents } from './markdown-render.js';
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
import { addBookmark, removeBookmark, isBookmarked } from './bookmark-manager.js';
import { updateBookmarkBtnState } from './bookmark-panel.js';
import { clearPageSelection } from './page-selector.js';
import logger from '../shared/logger.js';

// 从拆分子模块导入复制与导出相关函数
import { copyMessage, copyAssistantMessage, quoteAndAsk, setQuoteContextInjector } from './chat-copy.js';
import {
  exportAssistantMessageToDocx, exportAssistantMessageToPdf,
  exportAssistantMessageToMarkdown, exportAssistantMessageToImage
} from './chat-export.js';
// 执行日志面板与反思信息面板渲染函数已拆分到 chat-panels.js
import { showReflectionInfo, showExecutionLog } from './chat-panels.js';
// 任务恢复相关函数已拆分到 chat-resume.js
import {
  showResumeDialog,
  _clearResumableFlagsForSession,
  _verifyCheckpointAndHideButton,
  _checkForAbandonedCheckpoint,
  resumeTask
} from './chat-resume.js';
// 重导出 _checkForAbandonedCheckpoint 保持对外接口不变（index.js 仍从本模块导入）
export { _checkForAbandonedCheckpoint };

// 流式输出相关函数已拆分到 chat-streaming.js
import {
  addStreamingMessage,
  reconnectStreamingElement,
  updateStreamingMessage,
  updateStreamingStatus,
  appendToolCallItems,
  createCodeBlockHtml,
  appendToolResult,
  createPreSelectCard,
  finalizeStreamingMessage,
  cancelStreamingTask,
  finalizeCancelledStream,
  createStreamingElementAccessor,
  deleteStreamingState,
  setStreamedContent,
  getPendingPreselectLog,
  setPendingPreselectLog,
  setThinkingStartTime,
  setProcessStartTime,
  setReasoningContent,
} from './chat-streaming.js';
// 重导出保持对外接口不变（其他模块可能通过 chat-manager 导入）
export { reconnectStreamingElement, cancelStreamingTask };
// chat-streaming.js 需要使用本模块的 extractTextContent / showCommandTerminateDialog
export { extractTextContent, showCommandTerminateDialog };

// 注入 setQuoteContext 实现到 chat-copy.js，打破循环依赖
setQuoteContextInjector(setQuoteContext);

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
  logger.debug('[SidePanel] 清除选中内容上下文');
  state.selectedContextText = '';
  state.quotedContextText = '';
  const indicator = document.getElementById('selectionIndicator');
  const userInput = document.getElementById('userInput');
  
  if (indicator) {
    indicator.classList.remove('show');
    logger.debug('[SidePanel] 已隐藏选中内容提示条');
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

      // 如果会话绑定了自定义 Agent，优先使用 Agent 配置的模型/温度
      // 注意：自定义 Agent 的参数只更新 state，不写入 chrome.storage.local 全局键，
      // 避免覆盖默认 Agent 的全局模型/温度值
      if (state.activeAgentId && state.activeAgentId !== 'default') {
        try {
          const { getAgent } = await import('./agent-store.js');
          const agent = await getAgent(state.activeAgentId);
          if (agent) {
            if (agent.model) {
              state.currentModel = agent.model;
            }
            if (agent.temperature !== null && agent.temperature !== undefined) {
              state.temperature = agent.temperature;
              state.topP = agent.topP !== null && agent.topP !== undefined ? agent.topP : 1.0;
            }
            // 触发 UI 更新
            document.dispatchEvent(new CustomEvent('agent-model-changed'));
          }
        } catch { /* Agent 加载失败，使用会话存储值 */ }
      } else {
        // 默认 Agent：从 chrome.storage.local 读取全局模型/温度（所有默认 Agent 会话共享）
        try {
          const global = await chrome.storage.local.get(['modelName', 'temperature', 'topP']);
          if (global.modelName) state.currentModel = global.modelName;
          if (global.temperature !== undefined) state.temperature = global.temperature;
          if (global.topP !== undefined) state.topP = global.topP;
        } catch { /* 读取失败，使用会话存储值 */ }
        // 触发 UI 更新，确保弹窗 slider/输入框与图标一致
        document.dispatchEvent(new CustomEvent('agent-model-changed'));
      }
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
        restoreMessageFromHtml(msg.htmlContent, msg.messageId, msg.resumable);
      } else {
        addMessage(msg.role, msg.content, false, msg.executionLog || [], msg.reflectionScore, wasRevised, null, msg.messageId, [], msg.resumable);
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
    
    // 检查是否存在未清理的 checkpoint（页面关闭/刷新导致任务中断，没有创建恢复入口卡片）
    // 如果存在，自动添加一个"继续执行"提示卡片
    await _checkForAbandonedCheckpoint();
    
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
      logger.error('[SidePanel] 保存当前会话失败:', err);
    });
  } catch (e) {
    logger.error('[SidePanel] 保存对话历史异常:', e);
  }
}

export async function saveChatHistoryAsync() {
  try {
    await saveCurrentSession();
  } catch (e) {
    logger.error('[SidePanel] 保存对话历史异常:', e);
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
// 任务恢复相关函数（showResumeDialog / _clearResumableFlagsForSession /
// _verifyCheckpointAndHideButton / _checkForAbandonedCheckpoint / resumeTask）
// 已拆分到 chat-resume.js，顶部 import 引入

export async function sendMessage() {
  const userInput = document.getElementById('userInput');
  const chatContainer = document.getElementById('chatContainer');
  
  const text = userInput.value.trim();
  if (!text || state.isGenerating) return;
  
  // 清除旧的恢复卡片和后台 checkpoint
  // 新任务开始意味着用户放弃之前的中断恢复
  _clearResumableFlagsForSession(state.activeSessionId);
  // 同时删除后台存储的 checkpoint（IndexedDB + chrome.storage.local）
  chrome.runtime.sendMessage({ type: 'DELETE_CHECKPOINT', sessionId: state.activeSessionId });
  
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
    
    // 获取当前 Agent 及其工具/技能配置
    const currentAgent = await getCurrentAgentPrompt();
    const agentToolIds = getCurrentAgentToolIds(currentAgent);
    const agentSkillIds = currentAgent?.skillIds ?? null;
    state.activeAgentToolIds = agentToolIds;
    state.activeAgentSkillIds = agentSkillIds;
    
    logger.debug('[SidePanel] 发送消息调试信息:');
    logger.debug('  - agent:', currentAgent ? currentAgent.name : '默认助手');
    logger.debug('  - agentToolIds:', agentToolIds);
    logger.debug('  - isolateChat:', state.isolateChat);
    logger.debug('  - chatConfig:', state.chatConfig);
    logger.debug('  - messageHistory.length:', state.messageHistory.length);
    
    let messages = [
      {
        role: 'system',
        content: await getSystemPrompt(currentAgent)
      }
    ];
    
    if (state.isolateChat) {
      let historyToSend = state.messageHistory;
      // Token 预算驱动：使用实际系统提示词 token 数而非固定估算值
      const configuredWindow = 0;
      const actualSystemTokens = estimateTokens(messages[0]?.content || '');
      const contextWindow = getContextWindow(model, configuredWindow, state.customModelMap);
      // 消息预算 = 上下文窗口 - 实际系统提示词 - 输出预留(4096) - 安全余量(2000)
      const messageBudget = contextWindow - actualSystemTokens - 4096 - 2000;
      // 历史消息占用预算的 70%（预留给工具结果和模型输出）
      const historyBudget = Math.floor(messageBudget * 0.7);
      
      // 应用用户设置的记忆条数限制（不包含当前消息，仅限制历史消息条数）
      let historyWithoutCurrent = state.messageHistory.slice(0, -1);
      const maxMemory = state.chatConfig.maxMemoryMessages;
      if (maxMemory && maxMemory > 0 && historyWithoutCurrent.length > maxMemory) {
        historyWithoutCurrent = historyWithoutCurrent.slice(historyWithoutCurrent.length - maxMemory);
        logger.debug(`[SidePanel] 记忆条数限制: ${state.messageHistory.length - 1} → ${maxMemory} 条历史消息`);
      }

      const currentMsg = state.messageHistory[state.messageHistory.length - 1];
      
      // 从后往前保留历史消息，直到 token 量在预算内
      let keptHistory = [];
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
        logger.debug(`[SidePanel] Token 预算裁剪: 保留 ${keptHistory.length} 条历史消息, 裁剪 ${trimmedCount} 条 (预算: ${historyBudget} tokens)`);
      } else {
        logger.debug(`[SidePanel] Token 预算内: ${keptHistory.length} 条历史消息 (预算: ${historyBudget} tokens)`);
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
    logger.debug(`[SidePanel] 发送上下文: ${msgTokens} tokens (消息: ${messages.length} 条), 压力: ${pressure.level}(${Math.round(pressure.ratio * 100)}%)`);
    
    if (pressure.level === 'critical') {
      logger.warn('[SidePanel] 上下文压力过高，主动裁剪...');
      const budget = getMessageBudget(model, state.enabledTools.length, configuredWindow, state.customModelMap);
      const trimResult = trimMessagesByBudget(messages, budget, { generateSummary: false });
      messages = trimResult.messages;
      logger.warn(`[SidePanel] 已主动裁剪: ${msgTokens} → ${estimateMessagesTokens(messages)} tokens (${trimResult.trimmedCount} 条)`);
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
        // 中断的任务标记 resumable，供切回时显示"继续执行"按钮
        const resumable = !!errorResult.checkpoint || errorResult.swRestarted ||
                          errorResult.message === '任务已被用户停止';
        if (errorResult.message === '任务已被用户停止') {
          appendMessageToSession(mySessionId, { role: 'assistant', content: '任务已取消', executionLog: errorResult.executionLog || [], resumable });
        } else if (errorResult.swRestarted) {
          appendMessageToSession(mySessionId, { role: 'assistant', content: '⚠️ 后台服务重启，任务中断', executionLog: errorResult.executionLog || [], resumable });
        } else {
          appendMessageToSession(mySessionId, { role: 'assistant', content: '❌ 请求失败：' + (errorResult.message || '未知错误'), executionLog: errorResult.executionLog || [], resumable });
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
        const { messageId } = addMessage('assistant', '任务已取消', false, errorResult.executionLog || [], null, false, null, null, [], true);
        state.messageHistory.push({ role: 'assistant', content: '任务已取消', executionLog: errorResult.executionLog || [], messageId, resumable: true });
        saveChatHistory();
        return;
      }

      // SW 重启：后台服务异常，但 checkpoint 可能存在
      if (errorResult.swRestarted) {
        removeLoadingMessage(loadingId);
        state.substituteLoadingIds.delete(mySessionId);
        const resumable = !!errorResult.checkpoint;
        const { messageId } = addMessage('assistant', '⚠️ 后台服务重启，任务中断', false, errorResult.executionLog || [], null, false, null, null, [], resumable);
        state.messageHistory.push({ role: 'assistant', content: '⚠️ 后台服务重启，任务中断', executionLog: errorResult.executionLog || [], messageId, resumable });
        saveChatHistory();
        return;
      }

      removeLoadingMessage(loadingId);
      state.substituteLoadingIds.delete(mySessionId);

      content = '❌ 请求失败：' + (errorResult.message || '未知错误');
      executionLog = errorResult.executionLog || [];

      // 普通错误也可能存在 checkpoint（reactLoop catch 块会保存）
      const { element: messageDiv, messageId } = addMessage('assistant', content, true, executionLog, reflectionScore, false, null, null, [], true);

      state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog, reflectionScore: reflectionScore, messageId, resumable: true });

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
    logger.error('[SidePanel] sendMessage 异常:', error?.message || error);
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
    logger.debug('[SidePanel] triggerSelectionSearch 跳过:', { hasText: !!selectedText, isGenerating: state.isGenerating });
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

export function addMessage(role, content, scroll = true, executionLog = [], reflectionScore = null, wasRevised = false, rawTextContent = null, existingMessageId = null, attachedFiles = [], resumable = false) {
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
    footerCopyBtn.title = '复制 Markdown 内容 (Ctrl/Cmd + 点击复制富文本)';
    footerCopyBtn.innerHTML = [
      '<svg viewBox="0 0 16 16" fill="currentColor">',
      '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>',
      '</svg>',
      '<span>复制</span>'
    ].join('');
    footerCopyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyAssistantMessage(messageDiv, footerCopyBtn, e);
    });
    
    footer.appendChild(footerCopyBtn);
    
    const quoteBtn = document.createElement('button');
    quoteBtn.className = 'quote-btn';
    quoteBtn.title = '引用该内容问答';
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
      '<button class="export-dropdown-item export-docx-item" type="button">',
      '<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>',
      '<span>导出 Word</span>',
      '</button>',
      '<button class="export-dropdown-item export-pdf-item" type="button">',
      '<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>',
      '<span>导出 PDF</span>',
      '</button>',
      '<button class="export-dropdown-item export-image-item" type="button">',
      '<svg t="1784207887308" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5993" width="32" height="32"><path d="M400.696 268.795c-17.249 0-31.233 13.986-31.233 31.233v30.471c0 17.249 13.986 31.233 31.233 31.233s31.233-13.986 31.233-31.233v-30.471c0-17.249-13.985-31.233-31.233-31.233z" fill="#8a8a8a" p-id="5994"></path><path d="M623.649 361.734c17.249 0 31.234-13.986 31.234-31.233v-30.471c0-17.249-13.986-31.233-31.234-31.233s-31.233 13.986-31.233 31.233v30.471c-0.001 17.248 13.985 31.233 31.233 31.233z" fill="#8a8a8a" p-id="5995"></path><path d="M438.295 388.804c-14.656 9.104-19.155 28.362-10.050 43.013 11.209 18.047 41.976 48.59 86.157 48.59 43.958 0 75.1-30.313 86.574-48.223 9.303-14.529 5.068-33.847-9.455-43.15-14.539-9.298-33.852-5.068-43.15 9.455-0.122 0.199-13.38 19.45-33.969 19.45-20.009 0-32.444-18.128-33.278-19.373-9.166-14.423-28.28-18.805-42.829-9.761z" fill="#8a8a8a" p-id="5996"></path><path d="M824.508503 116.690676 571.592236 116.690676c-17.248849 0-31.233352 13.985526-31.233352 31.233352s13.985526 31.233352 31.233352 31.233352l252.916267 0c40.181141 0 72.878844 32.692586 72.878844 72.878844l0 396.966057-189.334159-165.29465c-12.20088-10.655687-30.517037-10.207479-42.173518 0.9967L468.578048 674.16231 309.521472 517.519714c-11.895935-11.70253-30.903847-12.002358-43.154869-0.645706L126.957507 646.163629l0-394.126382c0-40.186258 32.692586-72.878844 72.878844-72.878844l252.916267 0c17.248849 0 31.233352-13.985526 31.233352-31.233352S470.000444 116.690676 452.751594 116.690676L199.836351 116.690676c-74.632791 0-135.346571 60.71378-135.346571 135.346571l0 520.56405c0 74.632791 60.71378 135.346571 135.346571 135.346571l252.916267 0c17.248849 0 31.233352-13.985526 31.233352-31.233352s-13.985526-31.233352-31.233352-31.233352L199.836351 845.481164c-40.186258 0-72.878844-32.692586-72.878844-72.878844l0-41.23924 160.003134-148.385539 159.428036 157.007917c12.048407 11.865235 31.361265 11.981892 43.546795 0.274246l198.576661-190.68697 208.876238 182.346001 0 40.683585c0 40.186258-32.697703 72.878844-72.878844 72.878844L571.592236 845.481164c-17.248849 0-31.233352 13.985526-31.233352 31.233352s13.985526 31.233352 31.233352 31.233352l252.916267 0c74.627674 0 135.346571-60.71378 135.346571-135.346571L959.855074 252.037247C959.855074 177.404456 899.136178 116.690676 824.508503 116.690676z" fill="#8a8a8a" p-id="5997"></path></svg>',
      '<span>导出图片</span>',
      '</button>',
      '<button class="export-dropdown-item export-md-item" type="button">',
      '<svg t="1784038824502" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1666" width="32" height="32"><path d="M601.216 85.333333a42.666667 42.666667 0 0 1 30.485333 12.821334l209.450667 213.973333a42.666667 42.666667 0 0 1 12.181333 29.866667V853.333333a85.333333 85.333333 0 0 1-85.333333 85.333334H256a85.333333 85.333333 0 0 1-85.333333-85.333334V170.666667a85.333333 85.333333 0 0 1 85.333333-85.333334h345.216z m-35.584 64H256a21.333333 21.333333 0 0 0-21.333333 21.333334v682.666666a21.333333 21.333333 0 0 0 21.333333 21.333334h512a21.333333 21.333333 0 0 0 21.333333-21.333334V395.413333h-191.68a32 32 0 0 1-32-32L565.632 149.333333z m64 38.186667v143.893333h140.821333L629.632 187.52z" fill="#8a8a8a" p-id="1667"></path><path d="M384.341333 800l-3.072-0.106667a32 32 0 0 1-29.162666-34.624l21.973333-256c2.752-32.256 46.165333-40.490667 60.544-11.477333l77.290667 156.010667 78.805333-156.224c14.08-27.925333 55.082667-20.906667 60.074667 8.789333l0.384 3.050667 20.714666 256a32 32 0 0 1-63.786666 5.162666l-11.541334-142.549333-56.341333 111.722667c-11.413333 22.613333-42.88 23.381333-55.744 2.517333l-1.493333-2.730667-54.912-110.826666-12.181334 142.016a32 32 0 0 1-31.552 29.269333z" fill="#8a8a8a" p-id="1668"></path></svg>',
      '<span>导出 Markdown</span>',
      '</button>'
    ].join('');
    
    const docxBtn = exportDropdown.querySelector('.export-docx-item');
    docxBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportAssistantMessageToDocx(messageDiv, docxBtn, exportDropdown);
    });
    
    const mdBtn = exportDropdown.querySelector('.export-md-item');
    mdBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportAssistantMessageToMarkdown(messageDiv, mdBtn, exportDropdown);
    });
    
    const pdfBtn = exportDropdown.querySelector('.export-pdf-item');
    pdfBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportAssistantMessageToPdf(messageDiv, pdfBtn, exportDropdown);
    });
    
    const imageBtn = exportDropdown.querySelector('.export-image-item');
    imageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportAssistantMessageToImage(messageDiv, imageBtn, exportDropdown);
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
    
    const rightActionsContainer = document.createElement('div');
    rightActionsContainer.className = 'footer-right-actions';
    rightActionsContainer.style.marginLeft = 'auto';
    rightActionsContainer.style.display = 'flex';
    rightActionsContainer.style.alignItems = 'center';
    rightActionsContainer.style.gap = '8px';

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
      rightActionsContainer.appendChild(logBtn);
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

      rightActionsContainer.appendChild(scoreBadge);
    } else if (!hasReflection && postReflection && postReflection.status === 'failed' && state.chatConfig?.enableExecutionLog) {
    // 仅当存在 post 反思节点且状态为 failed 时才显示警告（不包括工具级反思失败）
      const warnBadge = document.createElement('button');
      warnBadge.className = 'reflection-score-btn';
      warnBadge.type = 'button';
      warnBadge.title = '反思评估失败（点击查看执行日志）';
      warnBadge.innerHTML = `<span class="reflection-badge score-low">⚠️ 反思失败</span>`;
      rightActionsContainer.appendChild(warnBadge);
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
          logger.error('[SidePanel] 未找到 prototypeId，entry keys:', Object.keys(prototypeCall), 'observation:', prototypeCall.observation);
        }
      });
      rightActionsContainer.appendChild(prototypeBtn);
    }
    
    // 收藏按钮
    const bookmarkBtn = document.createElement('button');
    bookmarkBtn.className = 'bookmark-btn';
    bookmarkBtn.title = '收藏消息';
    bookmarkBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
    `;
    // 检查是否已收藏，设置初始状态
    if (isBookmarked(state.activeSessionId, messageId)) {
      bookmarkBtn.classList.add('bookmarked');
      bookmarkBtn.title = '取消收藏';
      bookmarkBtn.querySelector('svg').setAttribute('fill', 'currentColor');
    }
    bookmarkBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sid = state.activeSessionId;
      const mid = messageDiv.dataset.messageId;
      if (bookmarkBtn.classList.contains('bookmarked')) {
        await removeBookmark(sid, mid);
        updateBookmarkBtnState(bookmarkBtn, sid, mid);
        // 刷新面板
        const { refreshBookmarkPanel } = await import('./bookmark-panel.js');
        refreshBookmarkPanel();
      } else {
        const textContent = messageDiv.dataset.textContent_ || '';
        const sessionTitle = state.sessions.find(s => s.id === sid)?.title || '';
        await addBookmark(sid, mid, textContent, sessionTitle);
        updateBookmarkBtnState(bookmarkBtn, sid, mid);
        const { refreshBookmarkPanel } = await import('./bookmark-panel.js');
        refreshBookmarkPanel();
      }
    });
    rightActionsContainer.appendChild(bookmarkBtn);
    
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
    rightActionsContainer.appendChild(deleteBtn);

    footer.appendChild(rightActionsContainer);

    // "继续执行"按钮：仅当消息标记为 resumable 时显示
    // 用于从中断的 checkpoint 恢复 ReAct 任务
    if (resumable) {
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'resume-task-btn';
      resumeBtn.type = 'button';
      resumeBtn.title = '从上次中断处继续执行任务';
      resumeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>继续执行</span>
      `;
      resumeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (resumeBtn.disabled) return;
        // 先弹出对话框，让用户可选地追加任务描述
        const guidance = await showResumeDialog();
        if (guidance === null) return;  // 用户取消
        resumeBtn.disabled = true;
        resumeBtn.style.opacity = '0.6';
        resumeBtn.style.cursor = 'not-allowed';
        resumeTask(state.activeSessionId, guidance).finally(() => {
          resumeBtn.disabled = false;
          resumeBtn.style.opacity = '';
          resumeBtn.style.cursor = '';
        });
      });
      footer.appendChild(resumeBtn);
      // 在 messageDiv 上标记，便于恢复时识别
      messageDiv.dataset.resumable = 'true';
      // 异步验证 checkpoint 是否存在，不存在则隐藏按钮（避免刷新后按钮失效）
      _verifyCheckpointAndHideButton(messageDiv, state.activeSessionId);
    }

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
    copyBtn.title = '复制消息内容';
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
      logger.debug('[chat-manager] 执行日志按钮点击(委托), entries:', log.length);
      showExecutionLog(log);
    } catch (err) {
      logger.error('[chat-manager] 解析 executionLog 失败:', err);
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
      logger.error('[chat-manager] 解析 reflectionData 失败:', err);
    }
  });

  reflectionBadgeDelegateBound = true;
}

// showReflectionInfo 已拆分到 chat-panels.js（通过顶部 import 引入）

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
      logger.debug('[SidePanel] 收到执行状态更新:', message.nodeName, message.status, '日志数量:', message.executionLog?.length);
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
// 流式输出 UI 辅助函数（已拆分到 chat-streaming.js）
// ============================================================

/**
 * 从保存的 HTML 恢复消息（用于流式消息的持久化恢复）
 * @param {string} htmlContent - 消息的 outerHTML
 */
export function restoreMessageFromHtml(htmlContent, messageId = null, resumable = false) {
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

  // 如果标记为可恢复，在 footer 中添加"继续执行"按钮（HTML 中可能不存在）
  if (resumable) {
    messageEl.dataset.resumable = 'true';
    const footer = messageEl.querySelector(':scope > .message-footer');
    if (footer && !footer.querySelector('.resume-task-btn')) {
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'resume-task-btn';
      resumeBtn.type = 'button';
      resumeBtn.title = '从上次中断处继续执行任务';
      resumeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>继续执行</span>
      `;
      resumeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (resumeBtn.disabled) return;
        const guidance = await showResumeDialog();
        if (guidance === null) return;
        resumeBtn.disabled = true;
        resumeBtn.style.opacity = '0.6';
        resumeBtn.style.cursor = 'not-allowed';
        resumeTask(state.activeSessionId, guidance).finally(() => {
          resumeBtn.disabled = false;
          resumeBtn.style.opacity = '';
          resumeBtn.style.cursor = '';
        });
      });
      footer.appendChild(resumeBtn);
      // 异步验证 checkpoint 是否存在，不存在则隐藏按钮（避免刷新后按钮失效）
      _verifyCheckpointAndHideButton(messageEl, state.activeSessionId);
    }
  }
  
  // 移除 streaming 类（持久化后不再是流式状态）
  messageEl.classList.remove('streaming');
  
  // 重新绑定事件：折叠/展开思考过程
  const processHeader = messageEl.querySelector('.thinking-process-header');
  if (processHeader) {
    const processHistory = processHeader.closest('.thinking-process');
    processHeader.addEventListener('click', (e) => {
      // Ctrl/Meta + Click 用于复制，不触发展开/折叠
      if (e.ctrlKey || e.metaKey) return;
      processHistory.classList.toggle('collapsed');
    });
  }
  
  // 重新绑定工具卡片展开/折叠
  messageEl.querySelectorAll('.tool-call-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Ctrl/Meta + Click 用于复制，不触发展开/折叠
      if (e.ctrlKey || e.metaKey) return;
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
      // Ctrl/Meta + Click 用于复制，不触发展开/折叠
      if (e.ctrlKey || e.metaKey) return;
      e.stopPropagation();
      isExpanded = !isExpanded;
      codeBlock.textContent = isExpanded ? fullContent : currentText;
    });
  });
  
  // 向后兼容：为历史消息中未包裹的裸代码块添加复制按钮
  // 旧版保存的 HTML 中代码块是裸 <pre><code>，缺少 .code-block-container 包裹
  messageEl.querySelectorAll('.tool-call-body > pre, .tool-result-content > pre, .agent-stream-output > pre').forEach(preEl => {
    if (preEl.parentElement.classList.contains('code-block-container')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-container';
    wrapper.style.position = 'relative';
    wrapper.innerHTML = `<button class="code-copy-btn" title="复制代码">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    </button>`;
    preEl.parentElement.insertBefore(wrapper, preEl);
    wrapper.appendChild(preEl);
  });
  
  // 重新绑定子任务进度折叠/展开（事件委托）
  messageEl.querySelectorAll('.subtask-progress').forEach(progressEl => {
    progressEl.addEventListener('click', (e) => {
      const header = e.target.closest('.subtask-header');
      if (header) {
        progressEl.classList.toggle('subtask-expanded');
      }
    });
  });
  
  // 重新绑定命令终止按钮（事件委托）
  messageEl.querySelectorAll('.tool-call-terminate-btn, .agent-stream-terminate-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showCommandTerminateDialog(state.activeSessionId);
    });
  });

  // 重新绑定终止等待按钮（事件委托）
  messageEl.querySelectorAll('.tool-call-abort-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'ABORT_CURRENT_TOOL', sessionId: state.activeSessionId });
      btn.disabled = true;
      btn.title = '正在终止...';
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
          copyAssistantMessage(messageEl, copyBtn, e);
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
        exportAssistantMessageToDocx(messageEl, e.currentTarget, exportDropdown);
      });
      exportDropdown.querySelector('.export-md-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        exportAssistantMessageToMarkdown(messageEl, e.currentTarget, exportDropdown);
      });
      exportDropdown.querySelector('.export-pdf-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        exportAssistantMessageToPdf(messageEl, e.currentTarget, exportDropdown);
      });
      exportDropdown.querySelector('.export-image-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        exportAssistantMessageToImage(messageEl, e.currentTarget, exportDropdown);
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
            logger.error('[SidePanel] 未找到 prototypeId，entry keys:', Object.keys(prototypeCall), 'observation:', prototypeCall.observation);
          }
        });
      }
    }

    // 重新绑定收藏按钮事件
    const bookmarkBtn = footer.querySelector('.bookmark-btn');
    if (bookmarkBtn) {
      // 先恢复正确的视觉状态
      updateBookmarkBtnState(bookmarkBtn, state.activeSessionId, messageEl.dataset.messageId);
      bookmarkBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const sid = state.activeSessionId;
        const mid = messageEl.dataset.messageId;
        if (bookmarkBtn.classList.contains('bookmarked')) {
          await removeBookmark(sid, mid);
          updateBookmarkBtnState(bookmarkBtn, sid, mid);
          const { refreshBookmarkPanel } = await import('./bookmark-panel.js');
          refreshBookmarkPanel();
        } else {
          const textContent = messageEl.dataset.textContent_ || '';
          const sessionTitle = state.sessions.find(s => s.id === sid)?.title || '';
          await addBookmark(sid, mid, textContent, sessionTitle);
          updateBookmarkBtnState(bookmarkBtn, sid, mid);
          const { refreshBookmarkPanel } = await import('./bookmark-panel.js');
          refreshBookmarkPanel();
        }
      });
    }

    // 重新绑定删除按钮事件
    const deleteBtn = footer.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMessage(messageEl);
      });
    }

    // 重新绑定"继续执行"按钮事件（HTML 中已存在的情况）
    const existingResumeBtn = footer.querySelector('.resume-task-btn');
    if (existingResumeBtn) {
      existingResumeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (existingResumeBtn.disabled) return;
        const guidance = await showResumeDialog();
        if (guidance === null) return;
        existingResumeBtn.disabled = true;
        existingResumeBtn.style.opacity = '0.6';
        existingResumeBtn.style.cursor = 'not-allowed';
        resumeTask(state.activeSessionId, guidance).finally(() => {
          existingResumeBtn.disabled = false;
          existingResumeBtn.style.opacity = '';
          existingResumeBtn.style.cursor = '';
        });
      });
    }
  }

  // 清除按钮的 data-bound 标记（HTML 恢复后按钮上已有旧标记，需重置才能重新绑定事件）
  messageEl.querySelectorAll('.code-copy-btn, .copy-md-btn, .download-excel-btn, .export-table-img-btn').forEach(btn => {
    delete btn.dataset.bound;
    delete btn.dataset.boundMd;
    delete btn.dataset.boundExcel;
    delete btn.dataset.boundImg;
  });
  
  chatContainer.appendChild(messageEl);
}

/**
 * 批量重新绑定缓存恢复后的消息交互事件
 * 用于从 sessionDOMCache 恢复时，一次性绑定所有事件，避免逐条 rebuild 的开销
 * @param {HTMLElement} container - chatContainer 元素
 */
export function rebindAllMessages(container) {
  // 向后兼容：为缓存恢复的旧版消息中未包裹的裸代码块添加复制按钮
  container.querySelectorAll('.tool-call-body > pre, .tool-result-content > pre, .agent-stream-output > pre').forEach(preEl => {
    if (preEl.parentElement.classList.contains('code-block-container')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-container';
    wrapper.style.position = 'relative';
    wrapper.innerHTML = `<button class="code-copy-btn" title="复制代码">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    </button>`;
    preEl.parentElement.insertBefore(wrapper, preEl);
    wrapper.appendChild(preEl);
  });

  // 思考过程折叠/展开
  container.querySelectorAll('.thinking-process-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Ctrl/Meta + Click 用于复制，不触发展开/折叠
      if (e.ctrlKey || e.metaKey) return;
      const processEl = header.closest('.thinking-process');
      if (processEl) processEl.classList.toggle('collapsed');
    });
  });

  // 工具卡片展开/折叠
  container.querySelectorAll('.tool-call-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Ctrl/Meta + Click 用于复制，不触发展开/折叠
      if (e.ctrlKey || e.metaKey) return;
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
        copyAssistantMessage(messageEl, copyBtn, e);
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
        exportAssistantMessageToDocx(messageEl, e.currentTarget, exportDropdown);
      });
      exportDropdown.querySelector('.export-md-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        exportAssistantMessageToMarkdown(messageEl, e.currentTarget, exportDropdown);
      });
      exportDropdown.querySelector('.export-pdf-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        exportAssistantMessageToPdf(messageEl, e.currentTarget, exportDropdown);
      });
      exportDropdown.querySelector('.export-image-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        exportAssistantMessageToImage(messageEl, e.currentTarget, exportDropdown);
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

    // 重新绑定收藏按钮事件
    const bookmarkBtn = footer.querySelector('.bookmark-btn');
    if (bookmarkBtn) {
      // 先恢复正确的视觉状态
      updateBookmarkBtnState(bookmarkBtn, state.activeSessionId, messageEl.dataset.messageId);
      bookmarkBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const sid = state.activeSessionId;
        const mid = messageEl.dataset.messageId;
        if (bookmarkBtn.classList.contains('bookmarked')) {
          await removeBookmark(sid, mid);
          updateBookmarkBtnState(bookmarkBtn, sid, mid);
          const { refreshBookmarkPanel } = await import('./bookmark-panel.js');
          refreshBookmarkPanel();
        } else {
          const textContent = messageEl.dataset.textContent_ || '';
          const sessionTitle = state.sessions.find(s => s.id === sid)?.title || '';
          await addBookmark(sid, mid, textContent, sessionTitle);
          updateBookmarkBtnState(bookmarkBtn, sid, mid);
          const { refreshBookmarkPanel } = await import('./bookmark-panel.js');
          refreshBookmarkPanel();
        }
      });
    }

    const deleteBtn = footer.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMessage(messageEl);
      });
    }

    // 重新绑定"继续执行"按钮事件
    const resumeBtn = footer.querySelector('.resume-task-btn');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (resumeBtn.disabled) return;
        const guidance = await showResumeDialog();
        if (guidance === null) return;
        resumeBtn.disabled = true;
        resumeBtn.style.opacity = '0.6';
        resumeBtn.style.cursor = 'not-allowed';
        resumeTask(state.activeSessionId, guidance).finally(() => {
          resumeBtn.disabled = false;
          resumeBtn.style.opacity = '';
          resumeBtn.style.cursor = '';
        });
      });
    }
  });

  // 移除旧的 mermaid 工具栏（缓存恢复后需重建以绑定事件）
  container.querySelectorAll('.mermaid-controls').forEach(c => c.remove());

  // 清除代码块和表格工具栏按钮的 data-bound 标记，并重新绑定表格工具栏事件
  container.querySelectorAll('.code-copy-btn, .copy-md-btn, .download-excel-btn, .export-table-img-btn').forEach(btn => {
    delete btn.dataset.bound;
    delete btn.dataset.boundMd;
    delete btn.dataset.boundExcel;
    delete btn.dataset.boundImg;
  });
  addTableToolbarEvents();

  // 重新绑定事件委托
  bindExecutionLogDelegate();
  bindReflectionBadgeDelegate();
}

// reconnectStreamingElement 已拆分到 chat-streaming.js

// updateStreamingMessage / updateStreamingStatus 已拆分到 chat-streaming.js
// appendToolCallItems / createCodeBlockHtml / appendToolResult / createPreSelectCard
// finalizeStreamingMessage / cancelStreamingTask / finalizeCancelledStream
// 以上 7 个流式输出相关函数均已拆分到 chat-streaming.js

// ============================================================
// 命令终止对话框（仍保留在本模块）
// ============================================================

/**
 * 显示命令终止确认对话框
 * @param {string} sessionId - 会话 ID
 * @returns {Promise<string|null>} 'wait' | 'kill' | null（取消）
 */
function showCommandTerminateDialog(sessionId) {
  return new Promise((resolve) => {
    const existing = document.querySelector('.command-terminate-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'command-terminate-overlay';
    
    overlay.innerHTML = `
      <div class="command-terminate-modal">
        <div class="command-terminate-header">
          <div class="command-terminate-icon">⏹</div>
          <div class="command-terminate-title">终止命令执行</div>
        </div>
        <div class="command-terminate-body">
          <p>请选择终止方式：</p>
          <div class="command-terminate-options">
            <button class="command-terminate-option wait-btn">
              <div class="option-icon">🔌</div>
              <div class="option-text">
                <div class="option-title">终止等待</div>
                <div class="option-desc">仅停止等待命令输出，后台进程继续运行。<br/>适用于挂起型服务（如 npm run dev）。</div>
              </div>
            </button>
            <button class="command-terminate-option kill-btn">
              <div class="option-icon">💀</div>
              <div class="option-text">
                <div class="option-title">终止命令</div>
                <div class="option-desc">直接终止后台命令进程，释放资源。</div>
              </div>
            </button>
          </div>
        </div>
        <div class="command-terminate-footer">
          <button class="command-terminate-cancel">取消</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    const cleanup = () => {
      overlay.remove();
    };
    
    overlay.querySelector('.command-terminate-cancel').addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
    
    overlay.querySelector('.wait-btn').addEventListener('click', () => {
      cleanup();
      chrome.runtime.sendMessage({ type: 'TERMINATE_COMMAND', sessionId, mode: 'wait' });
      resolve('wait');
    });
    
    overlay.querySelector('.kill-btn').addEventListener('click', () => {
      cleanup();
      chrome.runtime.sendMessage({ type: 'TERMINATE_COMMAND', sessionId, mode: 'kill' });
      resolve('kill');
    });
    
    // 点击遮罩层不关闭（符合规范：仅通过弹窗自身按钮关闭）
  });
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

  logger.debug(`[SidePanel] 已删除消息: ${role}, messageId: ${messageId}`);
}

export async function callApi(messages, model, useTools = false, apiParams = {}, options = {}) {
  // options.resumeFromCheckpoint: 是否为从 checkpoint 恢复任务
  //   - true 时忽略 messages/model/useTools，发送 RESUME_REACT 而非 CALL_API
  //   - 由 resumeTask 调用，复用 callApi 的流式输出基础设施
  // options.userGuidance: 恢复时用户追加的任务描述（可选）
  // options.loadingId: 外部传入的 loading 消息 ID（resumeTask 复用 callApi 时使用）
  const { resumeFromCheckpoint = false, userGuidance = '', loadingId: externalLoadingId = null } = options;

  const reactConfig = await getReactConfig();
  const timeoutMs = reactConfig.loopTimeout;
  
  const reflectionConfig = await new Promise((resolve) => {
    chrome.storage.local.get('reflectionConfig', (result) => {
      resolve(result.reflectionConfig || { enabled: false });
    });
  });
  
  // 捕获当前会话 ID，切换会话后仍能正确过滤本会话的响应
  const mySessionId = state.activeSessionId;

  // 生成唯一的请求 ID，用于隔离新旧请求的流式消息，防止旧任务残留输出
  // 恢复模式使用 resume_ 前缀，便于日志区分
  const myCallId = resumeFromCheckpoint
    ? `resume_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    : `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  logger.debug(`[SidePanel] callApi: 生成 callId: ${myCallId}${resumeFromCheckpoint ? ' (恢复模式)' : ''}`);

  // 恢复模式：将外部传入的 loadingId 注入到 apiParams._loadingId，
  // 让 STREAM_START 处理逻辑能正确移除 resumeTask 创建的 loading 消息
  if (resumeFromCheckpoint && externalLoadingId) {
    apiParams = { ...apiParams, _loadingId: externalLoadingId };
  }

  // 如果当前会话有正在进行的 API 调用，先取消旧的，防止旧任务残留输出
  if (state.pendingCancelApiMap && state.pendingCancelApiMap.has(mySessionId)) {
    logger.debug('[SidePanel] callApi: 检测到会话已有进行中的 API 调用，先取消旧的');
    const oldCancel = state.pendingCancelApiMap.get(mySessionId);
    if (oldCancel) {
      oldCancel({ message: '任务已被新请求替代', executionLog: [] });
    }
  }
  if (state.pendingCallApiSessionIds && state.pendingCallApiSessionIds.has(mySessionId)) {
    state.pendingCallApiSessionIds.delete(mySessionId);
    syncPendingSessionsToStorage();
  }

  // 按 sessionId 隔离的流式元素访问器（防止多会话并行时串台）
  // 实现已拆分到 chat-streaming.js 的 createStreamingElementAccessor
  const _se = createStreamingElementAccessor(mySessionId);

  // 建立长连接端口以保持 Service Worker 存活，
  // 防止 API 调用耗时较长时 Chrome 判定 SW 空闲而将其杀死
  const keepalivePort = chrome.runtime.connect({ name: 'keepalive-' + mySessionId });
  logger.debug('[SidePanel] keepalive 端口已连接, sessionId:', mySessionId);

  // 监听 SW 静默重启通知：如果后台检测到 SW 曾崩溃重启，会通过 port 发送 SW_RESTARTED
  // 使用 _swRestartCtx 对象桥接异步的 onMessage 和同步的 Promise executor
  const _swRestartCtx = { restarted: false, rejectFn: null, cleanup: null, checkpoint: null };
  keepalivePort.onMessage.addListener((msg) => {
    if (msg.type === 'SW_RESTARTED' && msg.sessionId === mySessionId) {
      logger.warn('[SidePanel] ⚠️ 收到 SW_RESTARTED 通知，后台已重启，API 调用已丢失');
      _swRestartCtx.restarted = true;
      _swRestartCtx.checkpoint = msg.checkpoint || null;
      // 如果 Promise executor 已经初始化（rejectFn 已设置），直接触发清理和拒绝
      if (_swRestartCtx.rejectFn && _swRestartCtx.cleanup) {
        _swRestartCtx.cleanup();
        _swRestartCtx.rejectFn({
          message: '后台服务异常重启，API 调用已中断',
          executionLog: [],
          checkpoint: _swRestartCtx.checkpoint,
          swRestarted: true,
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
    deleteStreamingState(mySessionId);  // 清理本会话的流式元素引用和累积内容
    syncPendingSessionsToStorage();
  };
  
  return new Promise((resolve, reject) => {
    // 桥接 SW 重启检测到 Promise executor
    _swRestartCtx.cleanup = cleanupCallApi;
    _swRestartCtx.rejectFn = reject;

    // SW 重启检测：如果在 Promise 执行前已经收到 SW_RESTARTED 通知，立即 reject
    if (_swRestartCtx.restarted) {
      cleanupCallApi();
      reject({
        message: '后台服务异常重启，API 调用已中断',
        executionLog: [],
        checkpoint: _swRestartCtx.checkpoint,
        swRestarted: true,
      });
      return;
    }

    let executionLog = [];
    const timeoutSeconds = Math.round(timeoutMs / 1000);
    
    // 流式输出状态
    _se(null);
    setPendingPreselectLog(null);
    setProcessStartTime(0);
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
    logger.debug('[SidePanel] callApi: 添加 pendingCallApiSessionIds, mySessionId =', mySessionId, ', set:', [...state.pendingCallApiSessionIds]);
    
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
        logger.debug('[SidePanel] 发送取消请求失败:', err.message);
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
        logger.debug('[SidePanel] 前端超时已暂停（等待用户响应：澄清/敏感工具确认）');
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
            logger.debug('[SidePanel] 发送取消请求失败:', err.message);
          });
        }, remainingTime);
        
        logger.debug('[SidePanel] 前端超时已恢复，暂停时长:', Math.round(pauseDuration / 1000), 's，剩余时间:', Math.round(remainingTime / 1000), 's');
      }
    };

    const listener = (message) => {
      // logger.debug('[SidePanel] 收到消息:', message);
      
      // 过滤：只处理属于本会话或没有 sessionId 的消息（兼容）
      // 使用捕获的 mySessionId 而非 state.activeSessionId，确保切换会话后仍能收到本会话的响应
      if (message.sessionId && message.sessionId !== mySessionId) {
        return false;
      }
      
      // 过滤：只处理属于当前请求的流式消息，防止旧任务残留输出
      if (message.callId && message.callId !== myCallId) {
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
        
        // 子任务进度显示：每个子任务独立一行，可折叠展开查看执行节点
        if (message.subtaskTotal && message.subtaskTotal > 0) {
          const se = _se();
          if (se) {
            const contentDiv = se.querySelector('.stream-content');
            if (contentDiv) {
              const si = message.subtaskIndex ?? 0;
              const selector = `.subtask-progress[data-subtask-index="${si}"]`;
              let progressEl = contentDiv.querySelector(selector);
              const wasExpanded = progressEl ? progressEl.classList.contains('subtask-expanded') : false;
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
              const chevron = `<svg class="subtask-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
              
              let statusHtml = '';
              if (message.status === 'success') {
                statusHtml = `<span class="subtask-status-done">完成</span>`;
                progressEl.classList.add('subtask-progress-done');
                progressEl.classList.remove('subtask-progress-active');
              } else if (message.status === 'failed') {
                statusHtml = `<span class="subtask-status-failed">失败</span>`;
                progressEl.classList.add('subtask-progress-failed');
                progressEl.classList.remove('subtask-progress-active');
              } else {
                statusHtml = `<span class="subtask-status-label"><span class="subtask-spinner"></span>执行中...</span>`;
                progressEl.classList.add('subtask-progress-active');
              }
              
              // 渲染折叠头部
              progressEl.innerHTML = `
                <div class="subtask-header">
                  ${chevron}${taskIcon}${badge}<span class="subtask-name">${name}</span>${statusHtml}
                </div>
                <div class="subtask-detail-body"></div>
              `;
              
              // 恢复展开状态
              if (wasExpanded) {
                progressEl.classList.add('subtask-expanded');
              }
              
              // 填充执行节点详情
              const detailBody = progressEl.querySelector('.subtask-detail-body');
              if (detailBody) {
                const subtaskNodes = executionLog.filter(e => e.subtaskIndex === si && e.nodeType !== 'subtask');
                if (subtaskNodes.length > 0) {
                  detailBody.innerHTML = subtaskNodes.map(node => {
                    const icon = node.nodeType === 'tool_exec' ? '🔧' : node.nodeType === 'api_call' ? '📡' : node.nodeType === 'reflection' ? '🎯' : node.nodeType === 'preselect' ? '🔍' : '○';
                    const stIcon = node.status === 'success' ? '✓' : node.status === 'failed' ? '✗' : '○';
                    const stClass = node.status === 'success' ? 'done' : node.status === 'failed' ? 'failed' : 'processing';
                    const dur = node.duration ? formatDuration(node.duration) : '';
                    const name = escapeHtml(node.nodeName || '未知');
                    return `<div class="subtask-node ${stClass}">
                      <span class="subtask-node-icon">${icon}</span>
                      <span class="subtask-node-status">${stIcon}</span>
                      <span class="subtask-node-name">${name}</span>
                      ${dur ? `<span class="subtask-node-dur">${dur}</span>` : ''}
                    </div>`;
                  }).join('');
                }
              }
              
              // 绑定折叠头部点击事件（事件委托，避免 innerHTML 重建丢失）
              if (!progressEl._clickDelegated) {
                progressEl._clickDelegated = true;
                progressEl.addEventListener('click', (e) => {
                  const header = e.target.closest('.subtask-header');
                  if (header) {
                    progressEl.classList.toggle('subtask-expanded');
                  }
                });
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

      // 敏感工具确认期间暂停单次请求超时（与澄清行为一致）
      if (message.type === 'TOOL_CONFIRM_START') {
        pauseTimeout();
        return false;
      }

      if (message.type === 'TOOL_CONFIRM_END') {
        resumeTimeout();
        return false;
      }
      
      // 流式输出消息处理
      if (message.type === 'STREAM_PRESELECT') {
        logger.debug('[SidePanel] 收到预筛选日志，条数:', message.preselectLog?.length);
        setPendingPreselectLog(message.preselectLog || null);
        // 如果流式元素已创建（STREAM_START 先于本消息到达），立即添加预筛选卡片
        if (_se() && getPendingPreselectLog() && getPendingPreselectLog().length > 0) {
          const mc = _se().querySelector('.message-content');
          if (mc) {
            getPendingPreselectLog().forEach(entry => {
              const preselectCard = createPreSelectCard(entry);
              mc.insertBefore(preselectCard, mc.firstChild);
            });
            setPendingPreselectLog(null);
            logger.debug('[SidePanel] 预筛选卡片已追加到已有流式元素');
          }
        }
        return false;
      }
      
      if (message.type === 'STREAM_START') {
        logger.debug('[SidePanel] 流式输出开始');
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
          setProcessStartTime(Date.now());

          // 如果有待处理的预筛选日志，立即添加预筛选卡片到 message-content 最前面
          // （在 thinking-indicator 之前，确保视觉上预筛选卡片先于思考中显示）
          if (getPendingPreselectLog() && getPendingPreselectLog().length > 0) {
            const mc = _se().querySelector('.message-content');
            getPendingPreselectLog().forEach(entry => {
              const preselectCard = createPreSelectCard(entry);
              mc.insertBefore(preselectCard, mc.firstChild);
            });
            setPendingPreselectLog(null);
          }
        } else {
          // 后续 ReAct 迭代：在 stream-content 末尾添加新的思考指示器
          const contentDiv = _se().querySelector('.stream-content');
          if (contentDiv) {
            const existingThinking = contentDiv.querySelector('.thinking-indicator:not(.hidden)');
            if (existingThinking) {
              logger.warn('[STREAM_START] 已有可见的思考指示器，跳过创建:', existingThinking);
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
        setStreamedContent(mySessionId, '');
        setThinkingStartTime(Date.now());
        setReasoningContent('');
        return false;
      }

      if (message.type === 'STREAM_CHUNK') {
        if (_se()) {
          _streamedContent += message.delta;
          setStreamedContent(mySessionId, _streamedContent);
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
          setProcessStartTime(Date.now());
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
        // Agent 命令实时输出 - 嵌入到对应的工具调用卡片内
        if (_se() && message.execId) {
          let agentEntry = _agentStreams[message.execId];
          if (!agentEntry) {
            // 创建新的 Agent 输出区域
            const outputDiv = document.createElement('div');
            outputDiv.className = 'agent-stream-output';
            outputDiv.innerHTML = createCodeBlockHtml('', 'agent-stream-content');
            // 通过 toolCallId 找到对应的工具卡片，将输出嵌入卡片内部（与非命令工具的 .tool-call-result 展示形式一致）
            if (message.toolCallId) {
              const card = _se().querySelector(`.tool-call-item[data-tool-call-id="${message.toolCallId}"]`);
              if (card) {
                // 插入到卡片内部末尾，与非命令工具的 .tool-call-result 位置一致
                card.appendChild(outputDiv);
              }
            }
            // 降级：如果没有找到对应卡片，追加到 stream-content（兼容旧版）
            if (!outputDiv.isConnected) {
              const sc = _se().querySelector('.stream-content');
              if (sc) {
                sc.appendChild(outputDiv);
              }
            }
            agentEntry = { element: outputDiv, stdout: '', stderr: '' };
            _agentStreams[message.execId] = agentEntry;
            // 绑定代码块复制按钮
            addCodeCopyButtons();
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
          if (agentEntry && message.exitCode !== 0) {
            agentEntry.element.classList.add('agent-stream-error');
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

    if (resumeFromCheckpoint) {
      // 恢复模式：发送 RESUME_REACT，由 background 读取 checkpoint 并恢复 ReAct 循环
      // 流式消息（STREAM_START/STREAM_CHUNK/STREAM_DONE/API_COMPLETE/API_ERROR）的处理
      // 与 CALL_API 完全一致，复用上面的 listener
      logger.debug('[SidePanel] 发送 RESUME_REACT 消息，sessionId:', state.activeSessionId, 'userGuidance:', userGuidance ? `"${userGuidance.substring(0, 50)}..."` : '(无)', 'timeout:', timeoutMs);
      chrome.runtime.sendMessage({
        type: 'RESUME_REACT',
        sessionId: state.activeSessionId,
        callId: myCallId,
        userGuidance: userGuidance || '',
      });
    } else {
      logger.debug('[SidePanel] 发送 CALL_API 消息，useTools:', useTools, 'tabId:', state.currentTabId, 'sessionId:', state.activeSessionId, 'apiParams:', apiParams, 'timeout:', timeoutMs);
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
        agentSkillIds: state.activeAgentSkillIds,
        callId: myCallId,
        // 图片识别独立配置（仅当启用且有图片时传递）
        imageApiBase: state.enableImageInput && state.attachedImages.length > 0 ? (state.imageApiBase || '') : '',
        imageApiKey: state.enableImageInput && state.attachedImages.length > 0 ? (state.imageApiKey || '') : ''
      });
    }
  });
}

// showExecutionLog 已拆分到 chat-panels.js（通过顶部 import 引入）

// ============================================================
// 消息操作（复制、编辑、引用、导出）
// ============================================================

// copyMessage 已拆分到 chat-copy.js

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
    
    logger.debug('[SidePanel] 已加载消息内容到输入框，等待用户编辑后发送');
  } catch (error) {
    logger.error('[SidePanel] 编辑消息失败:', error);
    showToast('编辑失败: ' + error.message, 'error');
  }
}

// copyAssistantMessage / showCopySuccess / fallbackCopyText / copyRichText / wrapHtmlWithStyles
// 已拆分到 chat-copy.js

// renderMermaidInContainer / convertSvgsToImages / exportInProgressMap /
// setExportButtonLoading / setExportButtonSuccess / resetExportButton 已拆分到 chat-export.js

// fallbackCopyRichText 已拆分到 chat-copy.js
// exportAssistantMessageToDocx/Pdf/Markdown/Image 已拆分到 chat-export.js
// quoteAndAsk 已拆分到 chat-copy.js
