// side_panel/selection-answer-popup.js - 划词浮层解答面板
// 点击菜单项浮层图标后，弹出独立浮层展示 AI 回答，不进入对话流。

import state from './state.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';
import { estimateTokens } from '../shared/token-counter.js';
import { formatMessageContent } from './markdown-render.js';
import { isFullscreenActive, closeMessageFullscreen } from './message-fullscreen.js';
import { escapeHtml, showToast, getApiParams } from './utils.js';
import { isEphemeralSessionId } from '../shared/session-id.js';

// 浮层自有文案：模块自注册，保证独立可测（不依赖 index.js 的注册时机）
registerTranslations('zh', {
  sidePanel: {
    popupTitle: '浮层解答',
    popupCustomTitle: '自定义问答',
    popupCustomPlaceholder: '想知道这段内容的什么？',
    popupFollowupPlaceholder: '继续追问...',
    popupSend: '发送',
    popupSendHint: 'Enter 发送，Shift+Enter 换行',
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
    popupUseTools: '允许使用工具',
    popupUseToolsHint: '开启后由 AI 调用工具完成任务，浮层只显示执行中与最终结果',
    popupExecuting: '执行中...',
  },
});

registerTranslations('en', {
  sidePanel: {
    popupTitle: 'Popup Answer',
    popupCustomTitle: 'Custom Question',
    popupCustomPlaceholder: 'What would you like to know about this?',
    popupFollowupPlaceholder: 'Ask a follow-up...',
    popupSend: 'Send',
    popupSendHint: 'Enter to send, Shift+Enter for a new line',
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
    popupUseTools: 'Allow tools',
    popupUseToolsHint: 'Let the AI call tools. Only the running state and final result are shown.',
    popupExecuting: 'Running...',
  },
});

// 上下文 token 预算（超出时以选中点为中心截断）
const CONTEXT_TOKEN_BUDGET = 1500;

// 浮层单例 DOM + 状态
let popupEl = null;
let currentSessionId = null;
let currentResult = '';
// 当前问题文案：预置提示词取其 content，自定义问答取用户输入。两种模式共用一条请求链路。
let currentQuestion = '';
// 自定义问答模式：打开时先展示输入框，用户输入后才发请求
let isCustomMode = false;
let currentSelectedText = '';
let currentContextText = '';
let currentTruncated = false;
let isStreaming = false;
let isLocked = false;
// 自定义问答是否允许调用工具：默认关闭，仅自定义模式生效
let useTools = false;
// 本轮已发送的用户消息（DONE 时与答案一起写入多轮历史）
let pendingUserContent = '';
// 当前浮层内的多轮问答历史：关闭/重新打开浮层即清空
let popupHistory = [];
// 历史条数上限（user/assistant 成对追加，偶数裁剪不会拆散问答对）
const POPUP_HISTORY_LIMIT = 8;

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
    <div class="sap-tools-row">
      <label class="sap-tools">
        <input type="checkbox" class="sap-tools-checkbox" />
        <span class="sap-tools-label"></span>
      </label>
    </div>
    <div class="sap-input-area">
      <textarea class="sap-input" rows="1"></textarea>
      <button class="sap-send" type="button"></button>
    </div>
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
  // 自定义提问/连续追问：输入后 Enter 或点发送
  initAskInput();
  // 工具开关：仅自定义模式可见，控制本轮是否带工具执行
  initToolsToggle();
  // 重新生成（复用已提取的上下文，因为选区在打开时已被清除）
  popupEl.querySelector('.sap-regen').addEventListener('click', () => {
    if (currentQuestion && currentSelectedText) {
      sendRequest({ regenerate: true });
    }
  });

  // 拖拽
  initDrag(popupEl.querySelector('.sap-header'));

  return popupEl;
}

// ==================== 自定义提问输入 ====================

// 输入区：中文输入法组词时按 Enter 选词不能误发送，用 composition 状态兜底
function initAskInput() {
  const input = popupEl.querySelector('.sap-input');
  const sendBtn = popupEl.querySelector('.sap-send');
  let composing = false;

  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => {
    composing = false;
    updateSendState();
  });
  input.addEventListener('input', () => {
    autoResizeInput();
    updateSendState();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (composing || e.isComposing) return;
    e.preventDefault();
    submitQuestion();
  });
  sendBtn.addEventListener('click', submitQuestion);
}

// 工具开关：勾选后本轮自定义问答走带工具的 ReAct 执行
function initToolsToggle() {
  const checkbox = popupEl?.querySelector('.sap-tools-checkbox');
  if (!checkbox) return;
  checkbox.addEventListener('change', () => {
    useTools = checkbox.checked;
  });
}

function autoResizeInput() {
  const input = popupEl?.querySelector('.sap-input');
  if (!input) return;
  // 浮层不可见时不量高：display:none 下 scrollHeight 为 0，会把高度写死成一条线
  if (!popupEl.classList.contains('show')) return;
  input.style.height = 'auto';
  // border-box 下 scrollHeight 不含边框，补上边框再判定，否则单行也会因 2px 溢出冒出滚动条
  const border = input.offsetHeight - input.clientHeight;
  const contentHeight = input.scrollHeight + border;
  input.style.height = Math.min(contentHeight, 96) + 'px';
  // 超过上限才允许滚动；删回单行时立刻关掉，滚动条不会残留
  input.style.overflowY = contentHeight > 96 ? 'auto' : 'hidden';
}

function updateSendState() {
  if (!popupEl) return;
  const input = popupEl.querySelector('.sap-input');
  const sendBtn = popupEl.querySelector('.sap-send');
  const checkbox = popupEl.querySelector('.sap-tools-checkbox');
  if (!input || !sendBtn) return;
  sendBtn.disabled = isStreaming || !input.value.trim();
  if (checkbox) checkbox.disabled = isStreaming;
}

// 提交输入框里的问题：一次提交即一轮独立问答，沿用同一份选中内容与原文上下文
function submitQuestion() {
  if (isStreaming) return;
  const input = popupEl?.querySelector('.sap-input');
  const question = (input?.value || '').trim();
  if (!question) return;
  input.value = '';
  autoResizeInput();
  currentQuestion = question;
  sendRequest();
}

function syncInputPlaceholder() {
  const input = popupEl?.querySelector('.sap-input');
  if (!input) return;
  // 自定义模式下首次提问前提示“问什么”，出过结果后就变成追问语义
  const firstAsk = isCustomMode && !popupEl.classList.contains('has-result');
  input.placeholder = firstAsk
    ? t('sidePanel.popupCustomPlaceholder')
    : t('sidePanel.popupFollowupPlaceholder');
}

function focusInput() {
  const input = popupEl?.querySelector('.sap-input');
  if (!input) return;
  // 等浮层显示完成后再聚焦/量高，否则 display:none 阶段两者都无效
  requestAnimationFrame(() => {
    autoResizeInput();
    input.focus();
  });
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
  const sendBtn = popupEl.querySelector('.sap-send');
  sendBtn.textContent = t('sidePanel.popupSend');
  sendBtn.title = t('sidePanel.popupSendHint');
  const toolsLabel = popupEl.querySelector('.sap-tools-label');
  if (toolsLabel) {
    toolsLabel.textContent = t('sidePanel.popupUseTools');
    toolsLabel.title = t('sidePanel.popupUseToolsHint');
  }
  const toolsCheckbox = popupEl.querySelector('.sap-tools-checkbox');
  if (toolsCheckbox) toolsCheckbox.checked = useTools;
  syncInputPlaceholder();
  updateSendState();
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

function showPopup(title, loadingText) {
  const el = ensurePopupEl();
  applyPopupLabels();
  el.querySelector('.sap-title').textContent = title || t('sidePanel.popupTitle');
  el.querySelector('.sap-body').innerHTML = `<div class="sap-loading">${escapeHtml(loadingText || t('sidePanel.popupLoading'))}</div>`;
  // 新一轮问答：结果区与操作区回到初始态（自定义模式下操作区随结果出现）
  el.classList.remove('has-result');
  el.classList.add('show');
  el.style.display = 'block';
  updateSendState();
}

function isPopupVisible() {
  return !!popupEl && popupEl.classList.contains('show');
}

function updatePopupContent(html, scrollToEnd = true) {
  const body = popupEl?.querySelector('.sap-body');
  if (!body) return;
  body.innerHTML = `<div class="sap-content markdown-body">${html}</div>`;
  if (scrollToEnd) body.scrollTop = body.scrollHeight;
  popupEl.classList.add('has-result');
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
    const input = popupEl.querySelector('.sap-input');
    if (input) {
      input.value = '';
      // 关闭时清掉内联高度：隐藏态量不出高度，留着会让下次打开变成一条细线
      input.style.height = '';
      input.style.overflowY = '';
    }
  }
  currentSessionId = null;
  currentResult = '';
  currentQuestion = '';
  isCustomMode = false;
  isStreaming = false;
  isLocked = false;
  useTools = false;
  resetPopupHistory();
}

// 与浮层并存、且可能属于同一轮工具执行的模态弹窗（澄清/风险确认/自定义确认等）。
// 点选它们或在它们之上按 Esc 都不应关闭浮层 —— 否则会连带取消后台正在跑的任务。
const MODAL_OVERLAY_SELECTOR = '.clarify-overlay, .modal-overlay, .delete-confirm-overlay, .artifacts-modal-overlay, .sched-modal-overlay, .todo-stats-overlay, .todo-io-overlay';

function isModalOverlayOpen() {
  return Array.from(document.querySelectorAll(MODAL_OVERLAY_SELECTOR))
    .some((el) => getComputedStyle(el).display !== 'none');
}

// 点击浮层外部：未锁定时关闭（锁定后只能由叉号或解锁关闭）
function handleOutsidePointerDown(e) {
  if (!isPopupVisible() || isLocked) return;
  if (popupEl.contains(e.target)) return;
  // 点在其他弹层上不是“关闭浮层”的语义（clarify/confirm 共用 .clarify-overlay）
  if (e.target.closest?.(MODAL_OVERLAY_SELECTOR)) return;
  // 点击划词菜单自身不关闭（留给菜单逻辑处理）
  const menu = document.getElementById('selectionFloatingMenu');
  if (menu && menu.contains(e.target)) return;
  closePopup();
}

// Esc 关闭：与点击外部同语义，锁定时不响应
function handleEscapeKey(e) {
  if (e.key !== 'Escape') return;
  if (!isPopupVisible() || isLocked) return;
  // 有其他模态弹窗压在上面时不响应，避免把等待用户作答的任务取消掉
  if (isModalOverlayOpen()) return;
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
  if (!currentResult || !currentQuestion) return;

  // 「转入对话」的产物是写进 #chatContainer 的两条消息，而全屏阅读时对话流就在覆盖层
  // 之下（且正在阅读的那条被迁出了容器）——先退出全屏，才能与非全屏模式下一致：
  // 消息落在列表里、滚到底部、Toast 可见。必须在上面的早退之后，避免中途失败白退全屏。
  if (isFullscreenActive()) {
    closeMessageFullscreen();
  }

  // 快照当前结果：closePopup() 会同步清空模块级 currentResult/currentQuestion，
  // 而下面写入对话流走的是异步回调，若直接引用模块变量会读到空值（助手气泡变空白）。
  const assistantContent = currentResult;
  const questionContent = currentQuestion;

  // 构造与对话流一致的消息格式，写入会话
  const compressedCtx = currentContextText
    ? `[${t('sidePanel.popupContextLabel')}]\n${currentContextText}\n\n`
    : '';
  const userMessage = `${compressedCtx}[${t('sidePanel.selectedContentLabel')}]\n${currentSelectedText}\n\n[${t('sidePanel.userQuestionLabel')}]\n${questionContent}`;

  // 动态导入避免循环依赖
  import('./chat-manager.js').then(({ addMessage }) => {
    addMessage('user', questionContent, true, [], null, false, userMessage);
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

// 预置提示词：直接带着问题发请求
function doRequest(prompt, selectedText, range) {
  const { context: contextText, truncated } = extractSelectionContext(range, selectedText);

  currentQuestion = prompt.content;
  currentSelectedText = selectedText;
  currentContextText = contextText;
  currentTruncated = truncated;

  sendRequest();
}

// 自定义问答：先打开输入框，用户输入后再发请求
function openCustomAsk(selectedText, range) {
  const { context: contextText, truncated } = extractSelectionContext(range, selectedText);

  currentQuestion = '';
  currentSelectedText = selectedText;
  currentContextText = contextText;
  currentTruncated = truncated;
  currentResult = '';
  isStreaming = false;
  useTools = false;
  resetPopupHistory();

  const el = ensurePopupEl();
  el.querySelector('.sap-title').textContent = t('sidePanel.popupCustomTitle');
  el.querySelector('.sap-body').innerHTML = '';
  // 重置输入框：清掉上一次残留的内联高度/滚动状态，避免打开时就是一条线或带滚动条
  const input = el.querySelector('.sap-input');
  if (input) {
    input.value = '';
    input.style.height = '';
    input.style.overflowY = '';
  }
  // 还没提问：结果区与操作区都收起，只留输入框
  el.classList.remove('has-result');
  el.classList.add('sap-custom', 'show-input', 'show');
  el.style.display = 'block';
  applyPopupLabels();
  focusInput();
}

// 去掉上一轮已完成的问答对：重新生成时不能把同一个问题再叠加一遍
function dropLastPopupTurn() {
  if (popupHistory.length < 2) return;
  const last = popupHistory[popupHistory.length - 1];
  const prev = popupHistory[popupHistory.length - 2];
  if (last.role === 'assistant' && prev.role === 'user') {
    popupHistory.splice(-2, 2);
  }
}

// 浮层重新打开/关闭时清空多轮上下文，避免把上一次选区的问答带进来
function resetPopupHistory() {
  popupHistory = [];
  pendingUserContent = '';
}

// 用已存快照（问题/选中/上下文）发起一次请求；重新生成、追问复用同一份上下文
async function sendRequest({ regenerate = false } = {}) {
  currentResult = '';
  isStreaming = true;

  // 工具开关对追问同样生效：预置提示词的首次提问保持原来的轻量问答，
  // 答案出来后的追问可以按用户勾选决定是否带工具。
  const withTools = useTools;
  showPopup(
    isCustomMode ? t('sidePanel.popupCustomTitle') : currentQuestion,
    withTools ? t('sidePanel.popupExecuting') : null
  );

  // 重新生成替换上一轮答案，而不是把它当作新的一轮追问
  if (regenerate) dropLastPopupTurn();

  const messages = buildPopupMessages(currentSelectedText, currentContextText, currentQuestion, currentTruncated);
  // 带上本浮层内的历史问答，让“继续追问”能记住上文
  if (popupHistory.length > 0) {
    messages.splice(1, 0, ...popupHistory.map((m) => ({ ...m })));
  }
  // 记录本轮用户消息，DONE 时与答案成对写入历史
  pendingUserContent = messages[messages.length - 1].content;

  const sessionId = `${withTools ? 'popup_tools' : 'popup'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const payload = {
    type: withTools ? 'SIDEPANEL_POPUP_TOOL_ASK' : 'SIDEPANEL_POPUP_ASK',
    sessionId,
    messages,
  };
  if (withTools) {
    const apiParams = await getApiParams();
    // 等待参数期间用户可能已关闭浮层：不再发起请求
    if (!isStreaming) return;
    payload.apiParams = apiParams;
    payload.model = state.currentModel || undefined;
    payload.tabId = state.currentTabId || undefined;
    payload.agentId = state.activeAgentId || null;
    payload.agentToolIds = state.activeAgentToolIds ?? null;
    payload.agentSkillIds = state.activeAgentSkillIds ?? null;
    payload.agentMcpExcludedServerIds = state.activeAgentMcpExcludedServerIds ?? null;
  }

  currentSessionId = sessionId;

  chrome.runtime.sendMessage(payload).catch(err => {
    logger.error('[SelectionPopup] sendMessage failed:', err);
    pendingUserContent = '';
    showPopupError(t('sidePanel.popupRequestFailed'));
    isStreaming = false;
    updateSendState();
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
      // 记录本轮问答，供同浮层继续追问；迟到/重复的 DONE 不会重复写入
      if (pendingUserContent) {
        if (currentResult) {
          popupHistory.push({ role: 'user', content: pendingUserContent });
          popupHistory.push({ role: 'assistant', content: currentResult });
          if (popupHistory.length > POPUP_HISTORY_LIMIT) {
            popupHistory = popupHistory.slice(-POPUP_HISTORY_LIMIT);
          }
        }
        pendingUserContent = '';
      }
      updatePopupContent(formatMessageContent(currentResult));
      // 预置提问的浮层在答案出来后露出输入框，可继续追问；自定义模式本来就常显
      if (!isCustomMode) popupEl.classList.add('show-input');
      syncInputPlaceholder();
      updateSendState();
    } else if (message.type === 'SIDEPANEL_POPUP_STREAM_ERROR') {
      // DONE 与 ERROR 竞争防护：流已结束（或浮层已关）时后到的 ERROR 不再覆盖已展示结果
      if (!isStreaming) return;
      isStreaming = false;
      // 失败的一轮不写入历史，避免把半截问答带进后续上下文
      pendingUserContent = '';
      showPopupError(message.error || t('sidePanel.popupRequestFailed'));
      updateSendState();
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
  // 面板关闭/刷新会销毁浮层：仍在跑的旁支任务没有可接收结果的 UI，
  // 这里取消掉，避免它在后台悄悄继续执行工具（重开浮层也接不上这次运行）
  window.addEventListener('pagehide', () => {
    if (!isStreaming || !currentSessionId || !isEphemeralSessionId(currentSessionId)) return;
    try {
      chrome.runtime.sendMessage({ type: 'CANCEL_REACT', sessionId: currentSessionId }).catch(() => {});
    } catch {
      // 扩展卸载/重载时 context 已失效，忽略即可
    }
  });
}

/**
 * 打开浮层解答（由划词菜单项点击触发）
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
  isCustomMode = false;
  useTools = false;
  // 新的选区是新的对话：不继承上一次浮层的问答历史
  resetPopupHistory();
  popupEl.classList.remove('sap-custom', 'show-input', 'has-result');
  doRequest(prompt, selectedText, range || state.currentSelectionRange);
}

/**
 * 打开自定义问答浮层（由划词菜单「自定义问答」触发）：先输入问题，提交后才发起请求
 * @param {string} selectedText - 选中的文本
 * @param {number} mouseX - 鼠标 x 坐标（视口坐标，用于定位浮层）
 * @param {number} mouseY - 鼠标 y 坐标
 * @param {Range} [range] - 选区 Range 快照（调用方需在清除选区前先 cloneRange 传入）
 */
export function openSelectionCustomAskPopup(selectedText, mouseX, mouseY, range) {
  if (!selectedText) return;

  ensureStreamListener();
  positionPopup(mouseX, mouseY);
  isLocked = false;
  isCustomMode = true;
  openCustomAsk(selectedText, range || state.currentSelectionRange);
}
