// confirm-dialog.js - 敏感操作确认对话框
//
// 并发确认队列 + 单模态闸门：
// 1) 多个子任务 / 会话可能同时请求敏感操作确认。旧实现是单槽位（state.currentConfirmToolCallId
//    被后续请求直接覆盖），后果是：用户只看到一条弹窗并点了「本次放行」，其余挂起确认在界面上
//    不可见，且后台按工具名匹配响应把它们一并放行（串扰）。现在改为逐条排队展示、各自应答。
// 2) 确认与澄清都是全屏遮罩且 z-index 相同，旧实现各自直接显示会互相压住：澄清压住确认时
//    用户点不到确认按钮，而后台确认倒计时照常消耗。现在统一向 interaction-gate 申请呈现权，
//    同一时刻只呈现一个，并在真正呈现的那一刻上报回执，后台据此才开始计时——
//    排队未被看到的确认不消耗用户的应答窗口。

import state from './state.js';
import logger from '../shared/logger.js';
import { t } from '../shared/i18n.js';
import {
  INTERACTION_KIND,
  registerInteractionPresenter,
  requestDisplay,
  releaseDisplay,
  notifyPendingChanged,
  getOtherPendingCount,
  reportInteractionDisplayed,
} from './interaction-gate.js';

const CONFIRM = INTERACTION_KIND.CONFIRM;

// 待呈现的确认请求（队头为下一条要显示的），每项自带自己的 resolve
const confirmQueue = [];
// 正在呈现的确认请求（无则为 null）
let visibleConfirm = null;

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
 * 是否同一请求的重复投递（同一条后台请求可能经 port 与广播各送一次）。
 * 必须关联 ID + 会话 + 参数全同：只比 ID 会把另一条真实请求当成副本吞掉 ——
 * 部分提供方对一轮内多个并行 tool_calls 复用同一个 id（甚至都留空），
 * 被吞掉的那条在后台等着却永远弹不出来，用户看不到也拒绝不了。
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
function isSameConfirmRequest(a, b) {
  return !!a.toolCallId
    && a.toolCallId === b.toolCallId
    && (a.sessionId || null) === (b.sessionId || null)
    && JSON.stringify(a.args ?? null) === JSON.stringify(b.args ?? null);
}

/**
 * 组装弹窗说明文案：本条描述 + 自己后面还排几条 + 另一类被闸门挡住几条
 * @param {Object} data
 * @returns {string}
 */
function buildConfirmMessage(data) {
  const base = data.message
    || t('dialog.confirmAction', { name: data.toolLabel || data.toolName });
  const mine = confirmQueue.length;
  const others = getOtherPendingCount(CONFIRM);
  let text = base;
  if (mine > 0) text += ` ${t('dialog.pendingQueue', { count: mine })}`;
  if (others > 0) text += ` ${t('dialog.otherPending', { count: others })}`;
  return text;
}

/**
 * 渲染一条确认请求到 DOM 并启动面板侧倒计时
 * @param {Object} data - { toolName, toolLabel, args, message, toolCallId, sessionId, timeout }
 * @returns {boolean} 是否渲染成功（DOM 缺失时返回 false，由调用方按拒绝结算）
 */
function renderActiveConfirm(data) {
  const { toolName, toolLabel, args, timeout = 300000 } = data;

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

  // 显示说明消息：排队中还有别的请求时明确告知，避免用户以为已经全部处理完
  const messageEl = document.getElementById('confirmMessage');
  if (messageEl) {
    messageEl.textContent = buildConfirmMessage(data);
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

/**
 * 闸门授权后的呈现：呈现队头，已在呈现则保持，无内容则返回 false（交还闸门）
 * @returns {boolean}
 */
function presentConfirm() {
  if (visibleConfirm) return true;
  if (confirmQueue.length === 0) return false;

  const item = confirmQueue.shift();

  if (!renderActiveConfirm(item)) {
    // DOM 缺失，无法呈现：按拒绝结算这一条，后台会 fail-closed 拒用，不让它占位
    if (item.resolve) item.resolve(false);
    return false;
  }

  visibleConfirm = item;
  // 上报呈现回执：后台此刻才开始倒计时
  reportInteractionDisplayed(CONFIRM, item);
  return true;
}

/** 关闭弹层并清空面板侧当前态 */
function hideOverlayAndState() {
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
 * 当前项结算后推进：还有排队项就再次申请呈现（持有闸门时立即呈现下一条，
 * 被另一类占着则排队等交接），队列空则关闭弹层并交还闸门。
 */
function tryAdvanceDisplay() {
  if (confirmQueue.length > 0) {
    requestDisplay(CONFIRM);
    return;
  }
  hideOverlayAndState();
  releaseDisplay(CONFIRM);
}

/** 结算正在呈现的那一条并推进队列（不回发后台，用于非用户应答路径） */
function settleVisible(result) {
  const resolve = visibleConfirm?.resolve;
  visibleConfirm = null;
  clearActiveTimers();
  if (resolve) resolve(result);

  tryAdvanceDisplay();
}

/**
 * 显示工具操作确认对话框（并发请求自动排队，不互相覆盖，且不遮挡其他弹窗）
 * @param {Object} data - { toolName, toolLabel, args, message, toolCallId, sessionId, timeout }
 * @returns {Promise<boolean>} 面板侧结果（后台真正采信的是回发的 TOOL_CONFIRMATION_RESPONSE）
 */
export function showConfirmDialog(data) {
  const item = { ...data, sessionId: data.sessionId || null };

  logger.debug('[SidePanel] showconfirm dialog:', item.toolName, data);

  // 去重：同一条请求可能经 port 与广播两条通道重复投递（见 isSameConfirmRequest）
  if (visibleConfirm && isSameConfirmRequest(visibleConfirm, item)) {
    logger.debug('[SidePanel] duplicate confirm request, ignored:', item.toolCallId);
    return Promise.resolve(false);
  }
  if (confirmQueue.some((q) => isSameConfirmRequest(q, item))) {
    logger.debug('[SidePanel] queued duplicate confirm, ignored:', item.toolCallId);
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    confirmQueue.push({ ...item, resolve });
    // 向闸门申请呈现：空闲（或本就持有）时立即呈现队头，否则排队等待交接
    requestDisplay(CONFIRM);
    // 排队条数变化：自己持有闸门时刷新自己的提示，被另一类挡住时由对方代为刷新
    if (visibleConfirm) refreshPendingHint();
    notifyPendingChanged(CONFIRM);
  });
}

/**
 * 处理用户确认/拒绝（只作用于当前正在展示的那一条）
 * @param {boolean} confirmed
 * @param {string} scope - 'single' | 'loop'
 */
function handleConfirmResponse(confirmed, scope = 'single') {
  // 没有正在展示的确认：忽略陈旧点击（例如队列已推进完毕）
  if (!visibleConfirm) return;

  const respondedToolCallId = visibleConfirm.toolCallId;
  const respondedSessionId = visibleConfirm.sessionId;

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

  settleVisible(confirmed);
}

/** 刷新当前弹窗上的排队提示（自己后面还有几条 + 另一类还有几条） */
function refreshPendingHint() {
  if (!visibleConfirm) return;
  const messageEl = document.getElementById('confirmMessage');
  if (!messageEl) return;
  messageEl.textContent = buildConfirmMessage(visibleConfirm);
}

/**
 * 撤销一条确认请求（后台已自行结算：超时 / 送达失败 / 任务级放行扩散 / 面板已关闭）。
 * 不得回发 TOOL_CONFIRMATION_RESPONSE：后台已经处理过这一条，重发只会误伤后续请求。
 * @param {Object} data - { toolCallId, sessionId }
 */
export function dismissConfirmDialog(data) {
  const toolCallId = data?.toolCallId;
  if (!toolCallId) return;

  if (visibleConfirm && visibleConfirm.toolCallId === toolCallId) {
    logger.debug('[SidePanel] dismiss active confirm dialog (already settled by background):', toolCallId);
    settleVisible(false);
    return;
  }

  const idx = confirmQueue.findIndex((q) => q.toolCallId === toolCallId);
  if (idx >= 0) {
    logger.debug('[SidePanel] drop queued confirm dialog (already settled by background):', toolCallId);
    const [item] = confirmQueue.splice(idx, 1);
    if (item.resolve) item.resolve(false);
    refreshPendingHint();
    notifyPendingChanged(CONFIRM);
  }
}

// 注册呈现器到单模态闸门：模块加载即注册，保证任何投递路径都走同一调度
registerInteractionPresenter(CONFIRM, {
  present: presentConfirm,
  // 未呈现的条数：供另一类弹窗告知用户「还有 N 条其他请求在排队」
  pendingCount: () => confirmQueue.length,
  refresh: () => { if (visibleConfirm) refreshPendingHint(); },
});

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
