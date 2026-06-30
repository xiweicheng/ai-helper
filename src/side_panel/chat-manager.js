// chat-manager.js - 聊天管理模块
// 从 index.js 提取的聊天相关函数

import state from './state.js';
import { showToast, adjustInputHeight, getSystemPrompt, getApiParams, ensureChatConfigLoaded, copyToClipboard, escapeHtml, formatDuration, getReactConfig } from './utils.js';
import { addToInputHistory } from './input-history.js';
import { formatMessageContent, addCodeCopyButtons, renderMessageMermaid, formatMarkdown, renderMermaidCharts } from './markdown-render.js';
import { loadSessions, saveCurrentSession, createSession, archiveCurrentSession, appendMessageToSession } from './session-manager.js';
import { renderSessionTabs } from './session-manager-ui.js';
import { loadAndShowPrototype } from './ui-prototype.js';
import { estimateMessagesTokens, assessContextPressure, getContextWindow } from '../shared/token-counter.js';
import { BUILTIN_TOOLS } from './constants.js';

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
      // 合并会话的 enabledTools：保留已有选择，自动添加新工具
      if (activeSession.enabledTools && activeSession.enabledTools.length > 0) {
        const validIds = new Set(BUILTIN_TOOLS.map(t => t.id));
        const saved = activeSession.enabledTools.filter(id => validIds.has(id));
        const added = BUILTIN_TOOLS.filter(t => t.enabled && !saved.includes(t.id)).map(t => t.id);
        state.enabledTools = [...saved, ...added];
      } else {
        state.enabledTools = activeSession.enabledTools || state.enabledTools;
      }
      state.temperature = activeSession.temperature !== undefined ? activeSession.temperature : state.temperature;
      state.topP = activeSession.topP !== undefined ? activeSession.topP : state.topP;
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
      addMessage(msg.role, msg.content, false, msg.executionLog || [], msg.reflectionScore, wasRevised);
    });
    
    const welcomeMessage = document.querySelector('.welcome-message');
    if (welcomeMessage && state.messageHistory.length > 0) {
      welcomeMessage.remove();
    }
    
    renderMermaidCharts();
    
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

/**
 * 打开图片预览弹窗
 * @param {string} dataUrl - 图片 Base64 dataUrl
 */
// 图片预览缩放/拖拽状态
let previewScale = 1;
let previewTranslateX = 0;
let previewTranslateY = 0;
let previewIsDragging = false;
let previewDragStartX = 0;
let previewDragStartY = 0;
let previewDragStartTX = 0;
let previewDragStartTY = 0;

// 图片预览多图切换状态
let previewImageList = [];
let previewImageIndex = 0;

function updatePreviewTransform() {
  const img = document.getElementById('imagePreviewLarge');
  if (!img) return;
  img.style.transform = `translate(${previewTranslateX}px, ${previewTranslateY}px) scale(${previewScale})`;
  if (previewScale > 1) {
    img.classList.add('zoomable');
    if (previewIsDragging) {
      img.classList.add('dragging');
    } else {
      img.classList.remove('dragging');
    }
  } else {
    img.classList.remove('zoomable', 'dragging');
  }
}

function resetPreviewTransform() {
  previewScale = 1;
  previewTranslateX = 0;
  previewTranslateY = 0;
  previewIsDragging = false;
  updatePreviewTransform();
}

export function openImagePreview(dataUrl, sourceElement) {
  const overlay = document.getElementById('imagePreviewOverlay');
  const img = document.getElementById('imagePreviewLarge');
  if (!overlay || !img) return;

  // 根据来源分组收集图片
  collectPreviewImages(dataUrl, sourceElement);

  // 如果只有一张图，隐藏导航
  updatePreviewNavVisibility();
  showPreviewImage(dataUrl);
  overlay.classList.add('show');
}

/**
 * 收集同组图片的 dataUrl，构建预览列表
 * @param {string} currentDataUrl - 当前图片 dataUrl
 * @param {Element} [sourceElement] - 触发预览的元素，用于判断分组
 */
function collectPreviewImages(currentDataUrl, sourceElement) {
  previewImageList = [];

  if (sourceElement) {
    // 输入框缩略图：仅收集输入框预览区的图片
    if (sourceElement.closest('.image-preview-bar') || sourceElement.classList.contains('image-preview-thumb')) {
      document.querySelectorAll('.image-preview-thumb').forEach((thumb) => {
        if (thumb.src) previewImageList.push(thumb.src);
      });
    }
    // 消息图片：仅收集同一消息容器内的图片
    else if (sourceElement.closest('.user-message-images')) {
      const container = sourceElement.closest('.user-message-images');
      container.querySelectorAll('.user-message-image').forEach((img) => {
        if (img.src) previewImageList.push(img.src);
      });
    }
  }

  // 如果未匹配到分组，收集所有图片（兜底）
  if (previewImageList.length === 0) {
    document.querySelectorAll('.image-preview-thumb, .user-message-image').forEach((img) => {
      if (img.src) previewImageList.push(img.src);
    });
  }

  // 找到当前图片的索引
  previewImageIndex = previewImageList.indexOf(currentDataUrl);
  if (previewImageIndex === -1) {
    previewImageList.push(currentDataUrl);
    previewImageIndex = previewImageList.length - 1;
  }
}

/**
 * 更新预览导航按钮可见性
 */
function updatePreviewNavVisibility() {
  const prevBtn = document.getElementById('imagePreviewPrev');
  const nextBtn = document.getElementById('imagePreviewNext');
  const counter = document.getElementById('imagePreviewCounter');

  if (previewImageList.length <= 1) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    if (counter) counter.style.display = 'none';
  } else {
    if (prevBtn) prevBtn.style.display = '';
    if (nextBtn) nextBtn.style.display = '';
    if (counter) counter.style.display = '';
    updatePreviewNavButtons();
  }
}

/**
 * 更新预览导航按钮状态和计数
 */
function updatePreviewNavButtons() {
  const prevBtn = document.getElementById('imagePreviewPrev');
  const nextBtn = document.getElementById('imagePreviewNext');
  const counter = document.getElementById('imagePreviewCounter');

  // 首尾循环，按钮始终可用
  if (prevBtn) prevBtn.disabled = false;
  if (nextBtn) nextBtn.disabled = false;
  if (counter) {
    counter.textContent = `${previewImageIndex + 1} / ${previewImageList.length}`;
  }
}

/**
 * 显示指定索引的图片
 */
function showPreviewImage(dataUrl) {
  const img = document.getElementById('imagePreviewLarge');
  if (!img) return;
  resetPreviewTransform();
  img.src = dataUrl;
}

/**
 * 切换到上一张/下一张（首尾循环）
 */
function navigatePreview(direction) {
  const total = previewImageList.length;
  if (total === 0) return;
  previewImageIndex = (previewImageIndex + direction + total) % total;
  showPreviewImage(previewImageList[previewImageIndex]);
  updatePreviewNavButtons();
}

/**
 * 初始化图片预览弹窗事件（一次性设置）
 */
export function initImagePreviewOverlay() {
  const overlay = document.getElementById('imagePreviewOverlay');
  if (!overlay || overlay.dataset.initialized) return;
  overlay.dataset.initialized = 'true';

  const img = document.getElementById('imagePreviewLarge');
  const closePreview = () => {
    overlay.classList.remove('show');
    resetPreviewTransform();
  };

  // 点击遮罩关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closePreview();
    }
  });

  // 关闭按钮
  const closeBtn = overlay.querySelector('.image-preview-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closePreview);
  }

  // 上一张/下一张按钮
  const prevBtn = document.getElementById('imagePreviewPrev');
  const nextBtn = document.getElementById('imagePreviewNext');
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigatePreview(-1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigatePreview(1);
    });
  }

  // 键盘导航
  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('show')) return;
    if (e.key === 'Escape') {
      closePreview();
    } else if (e.key === 'ArrowLeft') {
      navigatePreview(-1);
    } else if (e.key === 'ArrowRight') {
      navigatePreview(1);
    }
  });

  // 滚轮缩放
  overlay.addEventListener('wheel', (e) => {
    if (!overlay.classList.contains('show')) return;
    e.preventDefault();
    const rect = img.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    const oldScale = previewScale;
    const newScale = Math.max(0.3, Math.min(5, previewScale + delta));

    // 以鼠标位置为中心缩放
    const scaleRatio = newScale / oldScale;
    previewScale = newScale;
    previewTranslateX = mouseX - scaleRatio * (mouseX - previewTranslateX);
    previewTranslateY = mouseY - scaleRatio * (mouseY - previewTranslateY);
    updatePreviewTransform();
  }, { passive: false });

  // 拖拽平移
  img.addEventListener('mousedown', (e) => {
    if (!overlay.classList.contains('show') || previewScale <= 1) return;
    e.preventDefault();
    previewIsDragging = true;
    previewDragStartX = e.clientX;
    previewDragStartY = e.clientY;
    previewDragStartTX = previewTranslateX;
    previewDragStartTY = previewTranslateY;
    updatePreviewTransform();
  });

  document.addEventListener('mousemove', (e) => {
    if (!previewIsDragging) return;
    previewTranslateX = previewDragStartTX + (e.clientX - previewDragStartX);
    previewTranslateY = previewDragStartTY + (e.clientY - previewDragStartY);
    updatePreviewTransform();
  });

  document.addEventListener('mouseup', () => {
    if (!previewIsDragging) return;
    previewIsDragging = false;
    updatePreviewTransform();
  });

  // 双击切换 1x / 2x
  img.addEventListener('dblclick', () => {
    if (!overlay.classList.contains('show')) return;
    if (previewScale > 1) {
      resetPreviewTransform();
    } else {
      previewScale = 2;
      previewTranslateX = 0;
      previewTranslateY = 0;
      updatePreviewTransform();
    }
  });
}

/**
 * 压缩图片并通过 canvas 转为 Base64，然后附加到 state.attachedImages
 * @param {Blob} blob - 原始图片 Blob
 */
export function compressAndAttachImage(blob) {
  const img = new Image();
  const url = URL.createObjectURL(blob);

  img.onload = () => {
    URL.revokeObjectURL(url);

    // 计算缩放尺寸（最大 1024px）
    let { width, height } = img;
    const maxDim = 1024;
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round(height * (maxDim / width));
        width = maxDim;
      } else {
        width = Math.round(width * (maxDim / height));
        height = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.65);

    state.attachedImages.push({ dataUrl });

    // 更新预览
    const previewBar = document.getElementById('imagePreviewBar');
    const userInput = document.getElementById('userInput');
    if (previewBar) previewBar.style.display = '';

    // 重新渲染预览
    renderImagePreviewsFromChat();

    // 聚焦输入框
    if (userInput) userInput.focus();
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    console.error('[ChatManager] 图片加载失败');
  };

  img.src = url;
}

/**
 * 从 chat-manager 上下文渲染图片预览
 */
function renderImagePreviewsFromChat() {
  const previewBar = document.getElementById('imagePreviewBar');
  if (!previewBar) return;

  previewBar.innerHTML = '';

  if (state.attachedImages.length === 0) {
    previewBar.style.display = 'none';
    return;
  }
  previewBar.style.display = '';

  state.attachedImages.forEach((img, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'image-preview-item';

    const thumb = document.createElement('img');
    thumb.src = img.dataUrl;
    thumb.className = 'image-preview-thumb';
    thumb.title = '点击查看大图';
    thumb.style.cursor = 'zoom-in';
    thumb.addEventListener('click', () => {
      openImagePreview(img.dataUrl, thumb);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'image-preview-remove';
    removeBtn.innerHTML = '×';
    removeBtn.title = '移除图片';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.attachedImages.splice(index, 1);
      renderImagePreviewsFromChat();
    });

    wrapper.appendChild(thumb);
    wrapper.appendChild(removeBtn);
    previewBar.appendChild(wrapper);
  });
}

/**
 * 构建用户消息 content，当有图片附件时返回数组格式
 * @param {string} text - 纯文本内容
 * @returns {string|Array} content 字段值
 */
export function buildUserContent(text) {
  if (!state.enableImageInput || state.attachedImages.length === 0) {
    return text;
  }

  const parts = [{ type: 'text', text: text }];
  for (const img of state.attachedImages) {
    parts.push({
      type: 'image_url',
      image_url: { url: img.dataUrl }
    });
  }

  return parts;
}

/**
 * 从消息 content 中移除图片数据，仅保留文本部分
 * 用于发送历史消息时避免携带已无用的 Base64 图片
 * @param {string|Array} content - 消息内容
 * @returns {string|Array} 仅含文本的内容
 */
export function stripImagesFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textParts = content.filter(c => c.type === 'text');
    return textParts.length === 1 ? textParts[0].text : textParts;
  }
  return content;
}

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
    state.quotedContextText = '';
  } else if (hasSelectedContext) {
    const ctx = state.selectedContextText.trim();
    finalText = `[选中内容]\n${ctx}\n\n[用户问题]\n${text}`;
    state.selectedContextText = '';
  }
  

  const userContent = buildUserContent(finalText);
  // 显示用户消息（含图片）
  addMessage('user', userContent);
  
  state.messageHistory.push({ role: 'user', content: userContent });
  
  saveChatHistory();
  
  addToInputHistory(text);
  state.inputHistoryIndex = -1;

  userInput.value = '';
  userInput.style.height = 'auto';
  
  if (hasSelectedContext || hasQuotedContext) {
    clearSelectedContext();
  }

  state.isGenerating = true;
  sendBtn.disabled = true;

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

    // 上下文压力评估：发送前检查消息总量
    const msgTokens = estimateMessagesTokens(messages);
    const sysPromptTokens = estimateMessagesTokens([messages[0]]); // system prompt
    const historyTokens = msgTokens - sysPromptTokens;
    const contextWindow = getContextWindow(model);
    const pressure = assessContextPressure(msgTokens, contextWindow);
    console.log(`[SidePanel] 发送上下文: ${msgTokens} tokens (系统提示词: ${sysPromptTokens}, 历史: ${historyTokens}), 压力: ${pressure.level}(${Math.round(pressure.ratio * 100)}%), 消息: ${messages.length} 条`);
    if (pressure.level === 'critical') {
      console.warn('[SidePanel] 上下文压力过高，可能触发 API 错误');
    }

    let content, executionLog, reflectionScore, wasRevised = false;
    
    try {
      const result = await callApi(messages, model, state.useTools, apiParams);
      content = result.content;
      executionLog = result.executionLog || [];
      reflectionScore = result.reflectionScore;
      wasRevised = result.wasRevised || false;
    } catch (errorResult) {
      // 检查是否已切换到其他会话
      if (state.activeSessionId !== mySessionId) {
        // 保存结果到原会话的历史中，不修改当前 DOM
        if (errorResult.message === '任务已被用户停止') {
          appendMessageToSession(mySessionId, { role: 'assistant', content: '任务已取消', executionLog: errorResult.executionLog || [] });
        } else {
          appendMessageToSession(mySessionId, { role: 'assistant', content: '❌ 请求失败：' + (errorResult.message || '未知错误'), executionLog: errorResult.executionLog || [] });
        }
        removeLoadingMessage(loadingId);
        state.substituteLoadingIds.delete(mySessionId);
        return;
      }
      
      // 用户主动取消：显示取消记录，但不作为错误
      if (errorResult.message === '任务已被用户停止') {
        removeLoadingMessage(loadingId);
        state.substituteLoadingIds.delete(mySessionId);
        addMessage('assistant', '任务已取消', false, errorResult.executionLog || []);
        state.messageHistory.push({ role: 'assistant', content: '任务已取消', executionLog: errorResult.executionLog || [] });
        saveChatHistory();
        return;
      }
      
      removeLoadingMessage(loadingId);
      state.substituteLoadingIds.delete(mySessionId);
      
      content = '❌ 请求失败：' + (errorResult.message || '未知错误');
      executionLog = errorResult.executionLog || [];
      
      const messageDiv = addMessage('assistant', content, true, executionLog, reflectionScore);
      
      state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog, reflectionScore: reflectionScore });
      
      throw errorResult;
    }
    
    // 检查是否已切换到其他会话（成功路径）
    if (state.activeSessionId !== mySessionId) {
      appendMessageToSession(mySessionId, { role: 'assistant', content: content, executionLog: executionLog, reflectionScore: reflectionScore, wasRevised: wasRevised });
      removeLoadingMessage(loadingId);
      state.substituteLoadingIds.delete(mySessionId);
      return;
    }
    
    removeLoadingMessage(loadingId);
    
    // 清理切回会话时创建的替代加载指示器
    if (state.substituteLoadingIds.has(mySessionId)) {
      removeLoadingMessage(state.substituteLoadingIds.get(mySessionId));
      state.substituteLoadingIds.delete(mySessionId);
    }
    
    const messageDiv = addMessage('assistant', content, true, executionLog, reflectionScore, wasRevised);
    
    await renderMessageMermaid(messageDiv);
    
    state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog, reflectionScore: reflectionScore, wasRevised: wasRevised });
    
  } catch (error) {
    console.error('[SidePanel] sendMessage 异常:', error?.message || error);
  } finally {
    // 合并在此处统一保存，减少 IndexedDB 写入次数
    saveChatHistory();
    state.generatingSessionIds.delete(mySessionId);
    sendBtn.disabled = false;
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

export function addMessage(role, content, scroll = true, executionLog = [], reflectionScore = null, wasRevised = false) {
  const chatContainer = document.getElementById('chatContainer');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  
  const timestamp = new Date().toISOString();
  messageDiv.dataset.timestamp = timestamp;

  // 提取纯文本内容用于显示（content 可能是数组格式，当包含图片时）
  const textContent = Array.isArray(content)
    ? content.filter(c => c.type === 'text').map(c => c.text).join('')
    : content;
  const hasImages = Array.isArray(content) && content.some(c => c.type === 'image_url');

  // 存储原始内容：数组格式需要序列化，字符串直接存
  messageDiv.dataset.rawContent = Array.isArray(content) ? JSON.stringify(content) : content;
  // 额外存储纯文本版本，供复制/编辑/引用使用
  messageDiv.dataset.textContent_ = textContent;
  
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
    } else if (!hasReflection && executionLog && executionLog.some(e => e.nodeType === 'reflection' && e.status === 'failed') && state.chatConfig.enableExecutionLog) {
      // 反思 API 失败：显示警告提示（仅在无评分时显示）
      const warnBadge = document.createElement('button');
      warnBadge.className = 'reflection-score-btn';
      warnBadge.type = 'button';
      warnBadge.title = '反思评估失败（点击查看执行日志）';
      warnBadge.innerHTML = `<span class="reflection-badge score-low">⚠️ 反思失败</span>`;
      footer.appendChild(warnBadge);
    }
    
    const prototypeCall = executionLog?.find(e => e.nodeType === 'tool_exec' && e.action?.name === 'preview_ui_prototype' && e.status === 'success');
    if (prototypeCall) {
      const prototypeBtn = document.createElement('button');
      prototypeBtn.className = 'prototype-btn-small';
      prototypeBtn.type = 'button';
      prototypeBtn.title = '查看 UI 原型';
      prototypeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
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
    
    messageDiv.appendChild(footer);
  } else {
    const quotedMatch = textContent.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/);
    const selectedMatch = textContent.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/);
    const match = quotedMatch || selectedMatch;
    
    if (match) {
      const type = quotedMatch ? 'quoted' : 'selected';
      const contextText = match[1].trim();
      const userQuestion = match[2].trim();
      messageDiv._pendingContext = { type, contextText, userQuestion };
      messageDiv.textContent = userQuestion;
    } else {
      messageDiv.textContent = textContent;
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
// 事件委托：执行日志按钮点击
// ============================================================
let executionLogDelegateBound = false;

function bindExecutionLogDelegate() {
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

function bindReflectionBadgeDelegate() {
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
    const isReflection = entry.nodeType === 'reflection';
    const isPlanTask = isToolExec && entry.action?.name === 'plan_task';
    
    if (isSubtask) {
      currentSubtaskIndex = entry.subtaskIndex;
    }
    
    let indentClass = '';
    let nodeIcon = '';
    
    if (isReflection) {
      nodeIcon = '🎯';
    } else if (isPreselect) {
      nodeIcon = '🔍';
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
    if (isReflection) {
      statusClass = `reflection ${statusClass}`;
    }
    
    let nodeName = escapeHtml(entry.nodeName || '未知节点');
    
    if (entry.subtaskIndex !== null && entry.subtaskIndex >= 0) {
      nodeName = `<span class="subtask-badge">${entry.subtaskIndex + 1}</span> ${nodeName}`;
    }
    
    if (entry.subtaskCount) {
      nodeName += ` <span class="plan-badge">(${entry.subtaskCount}个子任务, ${entry.strategy === 'sequential' ? '顺序执行' : '并行执行'})</span>`;
    }
    
    if ((isApiCall || isPreselect || isReflection) && entry.apiRequest) {
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
            
            ${isReflection ? `
            <div class="timeline-section reflection-details">
              ${entry.prompt ? `
              <div class="timeline-section">
                <div class="section-title">📊 评估提示词</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;">${escapeHtml(entry.prompt)}</pre></div>
              </div>
              ` : ''}
              ${entry.rawContent ? `
              <div class="timeline-section">
                <div class="section-title">📤 评估结果（原始响应）</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;">${escapeHtml(entry.rawContent)}</pre></div>
              </div>
              ` : ''}
              ${entry.apiResponse?.tokenUsage ? `
              <div class="timeline-section">
                <div class="section-title">📊 Token 使用</div>
                <div class="section-content">
                  - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                  - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                  - Total: ${entry.apiResponse.tokenUsage.total_tokens || 0}
                </div>
              </div>
              ` : ''}
              ${entry.overallScore !== undefined && entry.overallScore !== null ? `
              <div class="section-title">⭐ 综合评分: ${entry.overallScore}/10</div>
              ` : ''}
              ${entry.dimensions && Object.keys(entry.dimensions).length > 0 ? `
              <div class="reflection-dimensions">
                ${Object.entries(entry.dimensions).map(([key, val]) => `
                  <div class="dimension-item">
                    <span class="dim-label">${key}</span>
                    <span class="dim-bar"><span class="dim-fill" style="width:${val * 10}%"></span></span>
                    <span class="dim-score">${val}/10</span>
                  </div>
                `).join('')}
              </div>
              ` : ''}
              ${entry.issues && entry.issues.length > 0 ? `
              <div class="section-title">📋 发现的问题</div>
              <div class="section-content"><ul>${entry.issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>
              ` : ''}
              ${entry.suggestions && entry.suggestions.length > 0 ? `
              <div class="section-title">💡 改进建议</div>
              <div class="section-content"><ul>${entry.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>
              ` : ''}
              ${entry.action?.decision ? `
              <div class="section-title">🎯 决策: ${escapeHtml(entry.action.decision === 'passed' ? '✅ 通过' : entry.action.decision === 'revised' ? '🔧 已修订' : entry.action.decision === 'needs_improvement' ? '⚠️ 需改进' : entry.action.decision)}</div>
              ` : ''}
              ${entry.useful !== undefined ? `
              <div class="section-title">${entry.useful ? '✅ 结果有用' : '⚠️ 结果无效'}</div>
              ${entry.reasoning ? `<div class="section-content">${escapeHtml(entry.reasoning)}</div>` : ''}
              ${entry.suggestion ? `<div class="section-content">建议: ${escapeHtml(entry.suggestion)}</div>` : ''}
              ` : ''}
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
  const isReflection = entry.nodeType === 'reflection';
  const isPlanTask = isToolExec && entry.action?.name === 'plan_task';
  
  let indentClass = '';
  let nodeIcon = '';
  
  if (isReflection) {
    indentClass = 'reflection-level';
    nodeIcon = '🎯';
  } else if (isPreselect) {
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
  if (isReflection) {
    statusClass = `reflection ${statusClass}`;
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
          
          ${isReflection ? `
          <div class="timeline-section reflection-details">
            ${entry.overallScore !== undefined && entry.overallScore !== null ? `
            <div class="section-title">⭐ 综合评分: ${entry.overallScore}/10</div>
            ` : ''}
            ${entry.dimensions && Object.keys(entry.dimensions).length > 0 ? `
            <div class="reflection-dimensions">
              ${Object.entries(entry.dimensions).map(([key, val]) => `
                <div class="dimension-item">
                  <span class="dim-label">${key}</span>
                  <span class="dim-bar"><span class="dim-fill" style="width:${val * 10}%"></span></span>
                  <span class="dim-score">${val}/10</span>
                </div>
              `).join('')}
            </div>
            ` : ''}
            ${entry.issues && entry.issues.length > 0 ? `
            <div class="section-title">📋 发现的问题</div>
            <div class="section-content"><ul>${entry.issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>
            ` : ''}
            ${entry.suggestions && entry.suggestions.length > 0 ? `
            <div class="section-title">💡 改进建议</div>
            <div class="section-content"><ul>${entry.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>
            ` : ''}
            ${entry.action?.decision ? `
            <div class="section-title">🎯 决策: ${escapeHtml(entry.action.decision === 'passed' ? '✅ 通过' : entry.action.decision === 'revised' ? '🔧 已修订' : entry.action.decision === 'needs_improvement' ? '⚠️ 需改进' : entry.action.decision)}</div>
            ` : ''}
            ${entry.useful !== undefined ? `
            <div class="section-title">${entry.useful ? '✅ 结果有用' : '⚠️ 结果无效'}</div>
            ${entry.reasoning ? `<div class="section-content">${escapeHtml(entry.reasoning)}</div>` : ''}
            ${entry.suggestion ? `<div class="section-content">建议: ${escapeHtml(entry.suggestion)}</div>` : ''}
            ` : ''}
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
    const isReflection = entry.nodeType === 'reflection';
    const isPlanTask = isToolExec && entry.action?.name === 'plan_task';
    
    if (isSubtask) {
      currentSubtaskIndex = entry.subtaskIndex;
    }
    
    let indentClass = '';
    let nodeIcon = '';
    
    if (isReflection) {
      nodeIcon = '🎯';
    } else if (isPreselect) {
      nodeIcon = '🔍';
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
    
    if ((isApiCall || isPreselect || isReflection) && entry.apiRequest) {
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
            
            ${isReflection ? `
            <div class="timeline-section reflection-details">
              ${entry.prompt ? `
              <div class="timeline-section">
                <div class="section-title">📊 评估提示词</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;">${escapeHtml(entry.prompt)}</pre></div>
              </div>
              ` : ''}
              ${entry.rawContent ? `
              <div class="timeline-section">
                <div class="section-title">📤 评估结果（原始响应）</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;">${escapeHtml(entry.rawContent)}</pre></div>
              </div>
              ` : ''}
              ${entry.apiResponse?.tokenUsage ? `
              <div class="timeline-section">
                <div class="section-title">📊 Token 使用</div>
                <div class="section-content">
                  - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                  - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                  - Total: ${entry.apiResponse.tokenUsage.total_tokens || 0}
                </div>
              </div>
              ` : ''}
              ${entry.overallScore !== undefined && entry.overallScore !== null ? `
              <div class="section-title">⭐ 综合评分: ${entry.overallScore}/10</div>
              ` : ''}
              ${entry.dimensions && Object.keys(entry.dimensions).length > 0 ? `
              <div class="reflection-dimensions">
                ${Object.entries(entry.dimensions).map(([key, val]) => `
                  <div class="dimension-item">
                    <span class="dim-label">${key}</span>
                    <span class="dim-bar"><span class="dim-fill" style="width:${val * 10}%"></span></span>
                    <span class="dim-score">${val}/10</span>
                  </div>
                `).join('')}
              </div>
              ` : ''}
              ${entry.issues && entry.issues.length > 0 ? `
              <div class="section-title">📋 发现的问题</div>
              <div class="section-content"><ul>${entry.issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>
              ` : ''}
              ${entry.suggestions && entry.suggestions.length > 0 ? `
              <div class="section-title">💡 改进建议</div>
              <div class="section-content"><ul>${entry.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>
              ` : ''}
              ${entry.action?.decision ? `
              <div class="section-title">🎯 决策: ${escapeHtml(entry.action.decision === 'passed' ? '✅ 通过' : entry.action.decision === 'revised' ? '🔧 已修订' : entry.action.decision === 'needs_improvement' ? '⚠️ 需改进' : entry.action.decision)}</div>
              ` : ''}
              ${entry.useful !== undefined ? `
              <div class="section-title">${entry.useful ? '✅ 结果有用' : '⚠️ 结果无效'}</div>
              ${entry.reasoning ? `<div class="section-content">${escapeHtml(entry.reasoning)}</div>` : ''}
              ${entry.suggestion ? `<div class="section-content">建议: ${escapeHtml(entry.suggestion)}</div>` : ''}
              ` : ''}
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

export async function callApi(messages, model, useTools = false, apiParams = {}) {
  const reactConfig = await getReactConfig();
  const timeoutMs = reactConfig.loopTimeout;
  
  // 捕获当前会话 ID，切换会话后仍能正确过滤本会话的响应
  const mySessionId = state.activeSessionId;

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
    
    // 包装取消函数，供停止按钮使用：同时 reject Promise 并清理 listener 和 timeout
    const cancelApi = (errorResult) => {
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
      console.log('[SidePanel] 收到消息:', message);
      
      // 过滤：只处理属于本会话或没有 sessionId 的消息（兼容）
      // 使用捕获的 mySessionId 而非 state.activeSessionId，确保切换会话后仍能收到本会话的响应
      if (message.sessionId && message.sessionId !== mySessionId) {
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
        cleanupCallApi();
        resolve({ 
          content: message.content, 
          executionLog: message.executionLog || executionLog,
          reflectionScore: message.reflectionScore
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
            state.attachedImages.push({ dataUrl: imgPart.image_url.url });
          }
        }
      } catch (e) { /* 不是 JSON 格式，跳过图片解析 */ }
    }
    renderImagePreviewsFromChat();
    
    // 2. 恢复引用/选中上下文，显示在输入框上方
    state.quotedContextText = '';
    state.selectedContextText = '';
    
    const quotedMatch = textContent_.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/);
    const selectedMatch = textContent_.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/);
    const match = quotedMatch || selectedMatch;
    
    let textToEdit = textContent_;
    
    if (match) {
      const type = quotedMatch ? 'quoted' : 'selected';
      const contextText = match[1].trim();
      const userQuestion = match[2].trim();
      
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
