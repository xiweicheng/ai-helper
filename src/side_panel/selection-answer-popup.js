// side_panel/selection-answer-popup.js - 划词浮层解答面板
// 点击菜单项浮层图标后，弹出独立浮层展示 AI 回答，不进入对话流。

import state from './state.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';
import { estimateTokens } from '../shared/token-counter.js';
import { formatMessageContent } from './markdown-render.js';
import { isFullscreenActive, closeMessageFullscreen } from './message-fullscreen.js';
import { escapeHtml, showToast } from './utils.js';

// 浮层自有文案：模块自注册，保证独立可测（不依赖 index.js 的注册时机）
registerTranslations('zh', {
  sidePanel: {
    popupTitle: '浮层解答',
    popupTooltip: '浮层解答（不进入对话）',
    popupLoading: '思考中...',
    popupCopy: '复制',
    popupCopied: '已复制到剪贴板',
    popupTransfer: '转入对话',
    popupTransferred: '已转入对话',
    popupRegenerate: '重新生成',
    popupClose: '关闭',
    popupLock: '锁定（不随点击外部关闭）',
    popupUnlock: '解锁（可点击外部关闭）',
    popupRequestFailed: '请求失败',
    popupContextLabel: '上下文',
    popupContextTruncated: '（已截断）',
    popupSystemPrompt: '用户在阅读 AI 回答时选中了其中的片段，希望理解选中内容。请结合上下文，只针对选中片段回答，简洁清楚，不要展开与选中内容无关的长论述。',
  },
});

registerTranslations('en', {
  sidePanel: {
    popupTitle: 'Popup Answer',
    popupTooltip: 'Answer in popup (not in conversation)',
    popupLoading: 'Thinking...',
    popupCopy: 'Copy',
    popupCopied: 'Copied to clipboard',
    popupTransfer: 'Move to chat',
    popupTransferred: 'Moved to chat',
    popupRegenerate: 'Regenerate',
    popupClose: 'Close',
    popupLock: 'Lock (keep open on outside click)',
    popupUnlock: 'Unlock (close on outside click)',
    popupRequestFailed: 'Request failed',
    popupContextLabel: 'Context',
    popupContextTruncated: '(truncated)',
    popupSystemPrompt: 'The user selected a fragment while reading an AI answer and wants to understand it. Using the surrounding context, answer only about the selected fragment, concisely and clearly, without expanding into unrelated long discussion.',
  },
});

// 上下文 token 预算（超出时以选中点为中心截断）
const CONTEXT_TOKEN_BUDGET = 1500;

// 浮层单例 DOM + 状态
let popupEl = null;
let currentSessionId = null;
let currentResult = '';
let currentPrompt = null;
let currentSelectedText = '';
let currentContextText = '';
let currentTruncated = false;
let isStreaming = false;
let isLocked = false;

// ==================== 上下文提取 ====================

/**
 * 归一化渲染后消息的空白：已渲染的 Markdown（表格/代码块等）其 textContent 会带大量
 * 连续换行与缩进空格，直接拼进对话消息会撑出整屏空白行。
 * 规则：行内连续空白压成单个空格；换行符两侧空白去掉；3+ 连续换行压成一个空行。
 */
function normalizeContextWhitespace(text) {
  return (text || '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 从选中位置提取上下文（所在整条消息文本 + 预算截断）
 * @param {Range} range - 选中的 Range
 * @param {string} selectedText - 选中文本
 * @returns {{ context: string, truncated: boolean }}
 */
export function extractSelectionContext(range, selectedText) {
  if (!range) return { context: '', truncated: false };

  // 反查选中节点所属的消息元素
  const anchorNode = range.startContainer;
  const messageEl = anchorNode?.parentElement?.closest?.('.message');
  if (!messageEl) return { context: '', truncated: false };

  const fullText = normalizeContextWhitespace(messageEl.textContent);
  if (!fullText) return { context: '', truncated: false };

  // 预算内直接返回整条消息
  const tokens = estimateTokens(fullText);
  if (tokens <= CONTEXT_TOKEN_BUDGET) {
    return { context: fullText, truncated: false };
  }

  // 超预算：以选中点在消息中的偏移位置为中心，向两侧扩展截取
  const selOffset = fullText.indexOf(selectedText);
  const centerPos = selOffset >= 0 ? selOffset + selectedText.length / 2 : fullText.length / 2;

  // 二分搜索合适的窗口大小
  const halfBudget = CONTEXT_TOKEN_BUDGET / 2;
  let windowSize = Math.floor(fullText.length * CONTEXT_TOKEN_BUDGET / Math.max(tokens, 1));
  // 确保选中内容在窗口内
  let start = Math.max(0, Math.floor(centerPos - windowSize / 2));
  let end = Math.min(fullText.length, start + windowSize);
  // 如果选中内容被截掉，调整窗口
  if (selOffset >= 0) {
    const selEnd = selOffset + selectedText.length;
    if (selOffset < start) start = Math.max(0, selOffset - 50);
    if (selEnd > end) end = Math.min(fullText.length, selEnd + 50);
  }

  let context = fullText.slice(start, end).trim();
  // 最终校验 token 预算
  if (estimateTokens(context) > CONTEXT_TOKEN_BUDGET) {
    const ratio = CONTEXT_TOKEN_BUDGET / estimateTokens(context);
    context = context.slice(0, Math.floor(context.length * ratio));
  }

  return { context, truncated: true };
}

// ==================== 消息构建 ====================

export function buildPopupMessages(selectedText, contextText, promptContent, truncated) {
  const systemContent = t('sidePanel.popupSystemPrompt');

  let userContent = '';
  if (contextText) {
    userContent += `[${t('sidePanel.popupContextLabel')}${truncated ? t('sidePanel.popupContextTruncated') : ''}]\n${contextText}\n\n`;
  }
  userContent += `[${t('sidePanel.selectedContentLabel')}]\n${selectedText}\n\n`;
  userContent += `[${t('sidePanel.userQuestionLabel')}]\n${promptContent}`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

// ==================== 浮层 UI ====================

function ensurePopupEl() {
  if (popupEl && document.body.contains(popupEl)) return popupEl;

  popupEl = document.createElement('div');
  popupEl.className = 'selection-answer-popup';
  popupEl.id = 'selectionAnswerPopup';
  popupEl.innerHTML = `
    <div class="sap-header">
      <span class="sap-title"></span>
      <div class="sap-header-actions">
        <button class="sap-lock" title=""></button>
        <button class="sap-close" title="">&times;</button>
      </div>
    </div>
    <div class="sap-body"></div>
    <div class="sap-actions">
      <button class="sap-btn sap-copy"></button>
      <button class="sap-btn sap-transfer"></button>
      <button class="sap-btn sap-regen"></button>
    </div>
  `;
  document.body.appendChild(popupEl);

  // 关闭（叉号始终可关，不受锁定影响）
  popupEl.querySelector('.sap-close').addEventListener('click', closePopup);
  // 锁定切换
  popupEl.querySelector('.sap-lock').addEventListener('click', toggleLock);
  // 复制
  popupEl.querySelector('.sap-copy').addEventListener('click', handleCopy);
  // 转入对话
  popupEl.querySelector('.sap-transfer').addEventListener('click', handleTransferToChat);
  // 重新生成（复用已提取的上下文，因为选区在打开时已被清除）
  popupEl.querySelector('.sap-regen').addEventListener('click', () => {
    if (currentPrompt && currentSelectedText) {
      sendRequest();
    }
  });

  // 拖拽
  initDrag(popupEl.querySelector('.sap-header'));

  return popupEl;
}

// 每次打开时刷新静态文案（支持 i18n 热切换，不缓存翻译结果）
function applyPopupLabels() {
  if (!popupEl) return;
  popupEl.querySelector('.sap-close').title = t('sidePanel.popupClose');
  const copyBtn = popupEl.querySelector('.sap-copy');
  copyBtn.textContent = t('sidePanel.popupCopy');
  copyBtn.title = t('sidePanel.popupCopy');
  const transferBtn = popupEl.querySelector('.sap-transfer');
  transferBtn.textContent = t('sidePanel.popupTransfer');
  transferBtn.title = t('sidePanel.popupTransfer');
  const regenBtn = popupEl.querySelector('.sap-regen');
  regenBtn.textContent = t('sidePanel.popupRegenerate');
  regenBtn.title = t('sidePanel.popupRegenerate');
  updateLockUI();
}

// 锁定图标：锁上/打开两态，图标随状态切换，title 动态取词
function updateLockUI() {
  if (!popupEl) return;
  const lockBtn = popupEl.querySelector('.sap-lock');
  if (!lockBtn) return;
  lockBtn.classList.toggle('locked', isLocked);
  lockBtn.title = isLocked ? t('sidePanel.popupUnlock') : t('sidePanel.popupLock');
  lockBtn.innerHTML = isLocked
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
}

function toggleLock() {
  isLocked = !isLocked;
  updateLockUI();
}

function positionPopup(mouseX, mouseY) {
  const el = ensurePopupEl();
  // 浮层采用 fixed 定位，mouseX/mouseY 为视口坐标，直接 clamp 到视口内
  const w = 320;
  const h = 280;
  const offset = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = mouseY + offset;
  let left = mouseX - w / 2;

  if (left < 8) left = 8;
  if (left + w > vw - 8) left = vw - w - 8;
  if (top + h > vh - 8) top = mouseY - h - offset;
  if (top < 8) top = 8;

  el.style.position = 'fixed';
  el.style.top = top + 'px';
  el.style.left = left + 'px';
}

function showPopup(title) {
  const el = ensurePopupEl();
  applyPopupLabels();
  el.querySelector('.sap-title').textContent = title || t('sidePanel.popupTitle');
  el.querySelector('.sap-body').innerHTML = `<div class="sap-loading">${escapeHtml(t('sidePanel.popupLoading'))}</div>`;
  el.classList.add('show');
  popupEl.style.display = 'block';
}

function isPopupVisible() {
  return !!popupEl && popupEl.classList.contains('show');
}

function updatePopupContent(html, scrollToEnd = true) {
  const body = popupEl?.querySelector('.sap-body');
  if (!body) return;
  body.innerHTML = `<div class="sap-content markdown-body">${html}</div>`;
  if (scrollToEnd) body.scrollTop = body.scrollHeight;
}

function showPopupError(msg) {
  const body = popupEl?.querySelector('.sap-body');
  if (!body) return;
  body.innerHTML = `<div class="sap-error">${escapeHtml(msg)}</div>`;
}

function closePopup() {
  if (isStreaming && currentSessionId) {
    // 中断在途请求
    chrome.runtime.sendMessage({ type: 'CANCEL_REACT', sessionId: currentSessionId }).catch(() => {});
  }
  if (popupEl) {
    popupEl.classList.remove('show');
    popupEl.style.display = 'none';
  }
  currentSessionId = null;
  currentResult = '';
  isStreaming = false;
  isLocked = false;
}

// 点击浮层外部：未锁定时关闭（锁定后只能由叉号或解锁关闭）
function handleOutsidePointerDown(e) {
  if (!isPopupVisible() || isLocked) return;
  if (popupEl.contains(e.target)) return;
  // 点击划词菜单自身不关闭（留给菜单逻辑处理）
  const menu = document.getElementById('selectionFloatingMenu');
  if (menu && menu.contains(e.target)) return;
  closePopup();
}

// Esc 关闭：与点击外部同语义，锁定时不响应
function handleEscapeKey(e) {
  if (e.key !== 'Escape') return;
  if (!isPopupVisible() || isLocked) return;
  closePopup();
}

// ==================== 拖拽 ====================

function initDrag(handle) {
  let dragging = false;
  let startX, startY, origTop, origLeft;

  handle.addEventListener('mousedown', (e) => {
    // 标题栏上的锁定/关闭按钮不参与拖拽
    if (e.target.closest('.sap-close, .sap-lock')) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = popupEl.getBoundingClientRect();
    origTop = rect.top;
    origLeft = rect.left;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    popupEl.style.position = 'fixed';
    popupEl.style.top = (origTop + dy) + 'px';
    popupEl.style.left = (origLeft + dx) + 'px';
  });

  document.addEventListener('mouseup', () => { dragging = false; });
}

// ==================== 操作按钮 ====================

function handleCopy() {
  if (!currentResult) return;
  navigator.clipboard.writeText(currentResult).then(() => {
    showToast(t('sidePanel.popupCopied'));
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = currentResult;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(t('sidePanel.popupCopied'));
  });
}

function handleTransferToChat() {
  if (!currentResult || !currentPrompt) return;

  // 「转入对话」的产物是写进 #chatContainer 的两条消息，而全屏阅读时对话流就在覆盖层
  // 之下（且正在阅读的那条被迁出了容器）——先退出全屏，才能与非全屏模式下一致：
  // 消息落在列表里、滚到底部、Toast 可见。必须在上面的早退之后，避免中途失败白退全屏。
  if (isFullscreenActive()) {
    closeMessageFullscreen();
  }

  // 快照当前结果：closePopup() 会同步清空模块级 currentResult/currentPrompt，
  // 而下面写入对话流走的是异步回调，若直接引用模块变量会读到空值（助手气泡变空白）。
  const assistantContent = currentResult;
  const promptContent = currentPrompt.content;

  // 构造与对话流一致的消息格式，写入会话
  const compressedCtx = currentContextText
    ? `[${t('sidePanel.popupContextLabel')}]\n${currentContextText}\n\n`
    : '';
  const userMessage = `${compressedCtx}[${t('sidePanel.selectedContentLabel')}]\n${currentSelectedText}\n\n[${t('sidePanel.userQuestionLabel')}]\n${currentPrompt.content}`;

  // 动态导入避免循环依赖
  import('./chat-manager.js').then(({ addMessage }) => {
    addMessage('user', promptContent, true, [], null, false, userMessage);
    state.messageHistory.push({ role: 'user', content: userMessage, timestamp: new Date().toISOString() });
    addMessage('assistant', assistantContent, true);
    state.messageHistory.push({ role: 'assistant', content: assistantContent });
    import('./session-manager.js').then(({ saveCurrentSession }) => {
      saveCurrentSession();
    });

    // 显式「转入对话」是用户主动把注意力移回对话流的动作，因此无视"用户已上滚"状态强制滚到底部，
    // 并给出 Toast 反馈——否则不在底部时看不到任何效果，误以为没反应。
    Promise.all([
      import('./chat-streaming.js'),
      new Promise((resolve) => requestAnimationFrame(resolve)),
    ]).then(([{ autoScrollToBottom }]) => {
      const chatContainer = document.getElementById('chatContainer');
      autoScrollToBottom(chatContainer, { force: true, smooth: true });
      showToast(t('sidePanel.popupTransferred'));
    });
  });

  closePopup();
}

// ==================== 请求发送 ====================

function doRequest(prompt, selectedText, range) {
  const { context: contextText, truncated } = extractSelectionContext(range, selectedText);

  currentPrompt = prompt;
  currentSelectedText = selectedText;
  currentContextText = contextText;
  currentTruncated = truncated;

  sendRequest();
}

// 用已存快照（提示词/选中/上下文）发起一次请求；重新生成复用同一份上下文
function sendRequest() {
  currentResult = '';
  isStreaming = true;

  showPopup(currentPrompt?.content);

  const messages = buildPopupMessages(currentSelectedText, currentContextText, currentPrompt.content, currentTruncated);

  currentSessionId = `popup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  chrome.runtime.sendMessage({
    type: 'SIDEPANEL_POPUP_ASK',
    sessionId: currentSessionId,
    messages,
  }).catch(err => {
    logger.error('[SelectionPopup] sendMessage failed:', err);
    showPopupError(t('sidePanel.popupRequestFailed'));
    isStreaming = false;
  });
}

// ==================== 流式消息监听 ====================

let listenerRegistered = false;

function ensureStreamListener() {
  if (listenerRegistered) return;
  listenerRegistered = true;

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return;

    // 只处理 popup_ 前缀的流式消息
    if (!message.type.startsWith('SIDEPANEL_POPUP_')) return;
    if (message.sessionId !== currentSessionId) return;

    if (message.type === 'SIDEPANEL_POPUP_STREAM_CHUNK') {
      if (message.delta) {
        currentResult += message.delta;
        updatePopupContent(formatMessageContent(currentResult));
      }
    } else if (message.type === 'SIDEPANEL_POPUP_STREAM_DONE') {
      isStreaming = false;
      // 使用 finalContent（可能比累积的 currentResult 更完整）
      if (message.finalContent) {
        currentResult = message.finalContent;
      }
      updatePopupContent(formatMessageContent(currentResult));
    } else if (message.type === 'SIDEPANEL_POPUP_STREAM_ERROR') {
      // DONE 与 ERROR 竞争防护：流已结束（或浮层已关）时后到的 ERROR 不再覆盖已展示结果
      if (!isStreaming) return;
      isStreaming = false;
      showPopupError(message.error || t('sidePanel.popupRequestFailed'));
    }
  });
}

// ==================== 公开 API ====================

/**
 * 初始化浮层模块（注册流式消息监听 + 点击外部/Esc 关闭）
 */
export function initSelectionAnswerPopup() {
  ensureStreamListener();
  document.addEventListener('mousedown', handleOutsidePointerDown);
  document.addEventListener('keydown', handleEscapeKey);
}

/**
 * 打开浮层解答（由划词菜单图标按钮触发）
 * @param {Object} prompt - 提示词对象 { content, code, ... }
 * @param {string} selectedText - 选中的文本
 * @param {number} mouseX - 鼠标 x 坐标（视口坐标，用于定位浮层）
 * @param {number} mouseY - 鼠标 y 坐标
 * @param {Range} [range] - 选区 Range 快照（调用方需在清除选区前先 cloneRange 传入）
 */
export function openSelectionAnswerPopup(prompt, selectedText, mouseX, mouseY, range) {
  if (!selectedText || !prompt) return;

  ensureStreamListener();
  positionPopup(mouseX, mouseY);
  // 新打开重置锁定态（先于 showPopup，applyPopupLabels 会刷出图标）
  isLocked = false;
  doRequest(prompt, selectedText, range || state.currentSelectionRange);
}
