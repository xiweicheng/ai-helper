// confirm-dialog.js - 敏感操作确认对话框
//
// 并发确认队列：多个子任务 / 会话可能同时请求敏感操作确认。
// 旧实现是单槽位（state.currentConfirmToolCallId 被后续请求直接覆盖），
// 后果是：用户只看到一条弹窗并点了「本次放行」，其余挂起确认在界面上不可见，
// 且后台按工具名匹配响应把它们一并放行（串扰）。
// 现在改为逐条排队展示，每条各自应答，并在文案中告知还有多少条待确认。

import state from './state.js';
import logger from '../shared/logger.js';
import { t } from '../shared/i18n.js';

// 当前正在展示的确认请求 { toolCallId, sessionId, ...原始 data }
let activeConfirm = null;
// 其后排队中的确认请求
const confirmQueue = [];
// toolCallId -> 面板侧 Promise 的 resolve（队列项被展示/响应时才结算）
const confirmResolvers = new Map();

let activeResolve = null;
let countdownTimer = null;
let autoTimeoutId = null;

/**
 * 格式化倒计时时间
 * @param {number} seconds
 * @returns {string}
 */
function formatCountdown(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** 停止当前弹窗的倒计时与自动拒绝计时 */
function clearActiveTimers() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (autoTimeoutId) {
    clearTimeout(autoTimeoutId);
    autoTimeoutId = null;
  }
}

/**
 * 渲染一条确认请求到 DOM 并启动倒计时
 * @param {Object} data - { toolName, toolLabel, args, message, toolCallId, sessionId, timeout }
 */
function renderActiveConfirm(data) {
  const { toolName, toolLabel, args, message, timeout = 300000 } = data;

  state.currentConfirmToolCallId = data.toolCallId;
  state.currentConfirmSessionId = data.sessionId || null;

  const overlay = document.getElementById('confirmOverlay');
  if (!overlay) return false;

  // 更新显示
  document.getElementById('confirmToolName').textContent = toolLabel || toolName;

  // 显示参数摘要
  const argsSummary = document.getElementById('confirmArgsSummary');
  if (argsSummary && args) {
    const relevantArgs = Object.entries(args)
      .filter(([k, v]) => v !== undefined && v !== null && v !== '')
      .slice(0, 5);
    if (relevantArgs.length > 0) {
      argsSummary.innerHTML = relevantArgs
        .map(([k, v]) => {
          const rawValue = typeof v === 'string' ? v : JSON.stringify(v);
          const displayValue = rawValue.length > 80 ? rawValue.substring(0, 80) + '...' : rawValue;
          const titleAttr = rawValue.length > 80 ? ` title="${rawValue.replace(/"/g, '&quot;')}"` : '';
          return `<span class="confirm-arg" style="margin-right: 8px;"${titleAttr}><strong>${k}:</strong> ${displayValue}</span>`;
        })
        .join('、 ');
      argsSummary.style.display = 'block';
    } else {
      argsSummary.style.display = 'none';
    }
  }

  // 显示说明消息：排队中还有别的确认时明确告知，避免用户以为已经全部处理完
  const messageEl = document.getElementById('confirmMessage');
  if (messageEl) {
    const base = message || t('dialog.confirmAction', { name: toolLabel || toolName });
    const pending = confirmQueue.length;
    messageEl.textContent = pending > 0
      ? `${base} ${t('dialog.pendingQueue', { count: pending })}`
      : base;
  }

  clearActiveTimers();

  // 启动倒计时
  const totalSeconds = Math.floor(timeout / 1000);
  let remainingSeconds = totalSeconds;
  const countdownEl = document.getElementById('confirmCountdownText');
  const countdownContainer = document.getElementById('confirmCountdown');

  if (countdownEl && countdownContainer) {
    countdownContainer.classList.remove('warning');
    countdownContainer.style.display = 'flex';
    countdownEl.textContent = t('dialog.remainingTime', { time: formatCountdown(remainingSeconds) });

    countdownTimer = setInterval(() => {
      remainingSeconds--;
      if (remainingSeconds <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        countdownEl.textContent = t('dialog.remainingTime', { time: '0:00' });
        return;
      }
      countdownEl.textContent = t('dialog.remainingTime', { time: formatCountdown(remainingSeconds) });

      // 最后30秒变红闪烁
      if (remainingSeconds <= 30) {
        countdownContainer.classList.add('warning');
      }
    }, 1000);
  }

  overlay.style.display = 'flex';

  // 自动超时处理：默认拒绝，并推进到下一条
  autoTimeoutId = setTimeout(() => {
    logger.debug('[SidePanel] confirm dialogtimeout,autodeny');
    handleConfirmResponse(false, 'single');
  }, timeout);

  return true;
}

/** 结算当前项并推进队列：展示下一条，队列空则关闭弹层 */
function settleActive(result) {
  const resolve = activeResolve;
  activeConfirm = null;
  activeResolve = null;
  if (resolve) resolve(result);

  clearActiveTimers();

  if (confirmQueue.length > 0) {
    const next = confirmQueue.shift();
    const nextResolve = confirmResolvers.get(next.toolCallId);
    confirmResolvers.delete(next.toolCallId);
    activeConfirm = next;
    activeResolve = nextResolve;
    if (!renderActiveConfirm(next)) {
      // 渲染失败（DOM 缺失）：直接按拒绝结算该条并继续推进，避免后台白等 5 分钟
      settleActive(false);
    }
    return;
  }

  const overlay = document.getElementById('confirmOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  const countdownContainer = document.getElementById('confirmCountdown');
  if (countdownContainer) {
    countdownContainer.classList.remove('warning');
    countdownContainer.style.display = 'none';
  }
  state.currentConfirmToolCallId = null;
  state.currentConfirmSessionId = null;
}

/**
 * 显示工具操作确认对话框（并发请求自动排队，不互相覆盖）
 * @param {Object} data - { toolName, toolLabel, args, message, toolCallId, sessionId, timeout }
 * @returns {Promise<boolean>} 面板侧结果（后台真正采信的是回发的 TOOL_CONFIRMATION_RESPONSE）
 */
export function showConfirmDialog(data) {
  const item = { ...data, sessionId: data.sessionId || null };

  logger.debug('[SidePanel] showconfirm dialog:', item.toolName, data);

  // 去重：同一确认请求可能经 port 与广播两条通道重复投递
  if (activeConfirm && activeConfirm.toolCallId === item.toolCallId) {
    logger.debug('[SidePanel] duplicate confirm request, ignored:', item.toolCallId);
    return Promise.resolve(false);
  }
  if (confirmQueue.some((q) => q.toolCallId === item.toolCallId)) {
    logger.debug('[SidePanel] queued duplicate confirm, ignored:', item.toolCallId);
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    if (!activeConfirm) {
      activeConfirm = item;
      if (renderActiveConfirm(item)) {
        activeResolve = resolve;
      } else {
        // DOM 缺失，无法呈现：按拒绝结算，后台会收到拒用而 fail-closed
        activeConfirm = null;
        resolve(false);
      }
    } else {
      confirmQueue.push(item);
      confirmResolvers.set(item.toolCallId, resolve);
      // 更新当前弹窗上的「仍有 N 条待确认」提示
      refreshPendingHint();
    }
  });
}

/**
 * 处理用户确认/拒绝（只作用于当前正在展示的那一条）
 * @param {boolean} confirmed
 * @param {string} scope - 'single' | 'loop'
 */
function handleConfirmResponse(confirmed, scope = 'single') {
  // 没有正在展示的确认：忽略陈旧点击（例如队列已推进完毕）
  if (!activeConfirm) return;

  const respondedToolCallId = activeConfirm.toolCallId;
  const respondedSessionId = activeConfirm.sessionId;

  clearActiveTimers();

  // 发送确认结果回 background：必须带回本条的关联 ID 与会话，后台据此只结算这一条
  chrome.runtime.sendMessage({
    type: 'TOOL_CONFIRMATION_RESPONSE',
    toolCallId: respondedToolCallId,
    confirmed,
    scope,
    sessionId: respondedSessionId
  }).catch(err => {
    logger.debug('[SidePanel] send confirmationresponse failed:', err.message);
  });

  settleActive(confirmed);
}

/** 刷新当前弹窗上的"仍有 N 条待确认"提示 */
function refreshPendingHint() {
  if (!activeConfirm) return;
  const messageEl = document.getElementById('confirmMessage');
  if (!messageEl) return;
  const base = activeConfirm.message
    || t('dialog.confirmAction', { name: activeConfirm.toolLabel || activeConfirm.toolName });
  const pending = confirmQueue.length;
  messageEl.textContent = pending > 0
    ? `${base} ${t('dialog.pendingQueue', { count: pending })}`
    : base;
}

/**
 * 撤销一条确认请求（后台已自行结算：超时 / 送达失败 / 任务级放行扩散）。
 * 不得回发 TOOL_CONFIRMATION_RESPONSE：后台已经处理过这一条，重发只会误伤后续请求。
 * @param {Object} data - { toolCallId, sessionId }
 */
export function dismissConfirmDialog(data) {
  const toolCallId = data?.toolCallId;
  if (!toolCallId) return;

  if (activeConfirm && activeConfirm.toolCallId === toolCallId) {
    logger.debug('[SidePanel] dismiss active confirm dialog (already settled by background):', toolCallId);
    clearActiveTimers();
    settleActive(false);
    return;
  }

  const idx = confirmQueue.findIndex((q) => q.toolCallId === toolCallId);
  if (idx >= 0) {
    logger.debug('[SidePanel] drop queued confirm dialog (already settled by background):', toolCallId);
    const [item] = confirmQueue.splice(idx, 1);
    const resolve = confirmResolvers.get(item.toolCallId);
    confirmResolvers.delete(item.toolCallId);
    if (resolve) resolve(false);
    refreshPendingHint();
  }
}

/**
 * 初始化确认对话框事件
 */
export function initConfirmEvents() {
  const approveOnceBtn = document.getElementById('confirmApproveOnceBtn');
  const approveLoopBtn = document.getElementById('confirmApproveLoopBtn');
  const denyBtn = document.getElementById('confirmDenyBtn');

  if (approveOnceBtn) {
    approveOnceBtn.addEventListener('click', () => handleConfirmResponse(true, 'single'));
  }
  if (approveLoopBtn) {
    approveLoopBtn.addEventListener('click', () => handleConfirmResponse(true, 'loop'));
  }
  if (denyBtn) {
    denyBtn.addEventListener('click', () => handleConfirmResponse(false, 'single'));
  }

  // 监听来自 background 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SHOW_CONFIRM_DIALOG') {
      showConfirmDialog(message.data);
      sendResponse({ received: true });
      return false;
    }
    if (message.type === 'DISMISS_CONFIRM_DIALOG') {
      dismissConfirmDialog(message.data);
      sendResponse({ received: true });
      return false;
    }
    return false;
  });
}
