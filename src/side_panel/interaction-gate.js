// interaction-gate.js - 用户交互弹窗的单模态闸门 + 呈现回执
//
// 背景：确认弹窗（#confirmOverlay）与澄清弹窗（#clarifyOverlay）都用
// .clarify-overlay 样式、z-index 同为 5000，且 HTML 里 confirm 在前、clarify 在后，
// 于是同层级下后出现的澄清会压住确认：两个都是全屏遮罩且澄清不响应遮罩点击关闭，
// 用户看不见也点不到确认的三条按钮，而后台的确认倒计时照常消耗
// —— 表现为「没机会拒绝就被判拒」。
//
// 现在的约定：
// 1. 两类弹窗都必须先向本闸门申请呈现权，同一时刻只呈现一个（FIFO 交接），
//    被挡住的一方在队列里等待，不显示、也不可被误答；
// 2. 只有在真正呈现给用户的那一刻才上行 INTERACTION_DISPLAYED，
//    后台据此才启动超时倒计时 —— 排队期间不消耗任何用户时间。

import logger from '../shared/logger.js';

export const INTERACTION_KIND = {
  CONFIRM: 'confirm',
  CLARIFY: 'clarify',
};

// kind -> { present: () => boolean, pendingCount: () => number, refresh?: () => void }
const presenters = new Map();

// 当前持有闸门的类别（null 表示空闲）
let ownerKind = null;

// 排队等待交接的类别（FIFO，去重）
const waitingKinds = [];

/** 注册某类交互的呈现器：present 返回是否真的呈现出了内容 */
export function registerInteractionPresenter(kind, presenter) {
  presenters.set(kind, presenter);
}

/**
 * 申请呈现：已持有闸门则立即刷新呈现；闸门空闲则占用并呈现；否则排队。
 * @param {string} kind - INTERACTION_KIND 之一
 */
export function requestDisplay(kind) {
  if (ownerKind === kind) {
    // 仍持有闸门：呈现下一条；没内容了则交还，避免占着闸门不放
    if (!presentKind(kind)) {
      ownerKind = null;
      handOff();
    }
    return;
  }

  if (ownerKind === null) {
    ownerKind = kind;
    if (!presentKind(kind)) {
      ownerKind = null;
      handOff();
    }
    return;
  }

  if (!waitingKinds.includes(kind)) waitingKinds.push(kind);
  logger.debug(`[SidePanel] interaction ${kind} queued behind ${ownerKind}`);
}

/**
 * 交还闸门：持有者已无可呈现内容时调用，随即把闸门交给下一个等待者。
 * @param {string} kind
 */
export function releaseDisplay(kind) {
  if (ownerKind !== kind) return;
  ownerKind = null;
  handOff();
}

/** 闸门空闲时按 FIFO 把呈现权交给下一个仍有内容的类别 */
function handOff() {
  while (waitingKinds.length > 0) {
    const next = waitingKinds.shift();
    ownerKind = next;
    if (presentKind(next)) return;
    // 该类别此刻已无内容（后台已撤销 / DOM 缺失）：交还后继续找下一个
    ownerKind = null;
  }
}

function presentKind(kind) {
  const presenter = presenters.get(kind);
  if (!presenter || typeof presenter.present !== 'function') return false;
  try {
    return presenter.present() === true;
  } catch (err) {
    logger.error(`[SidePanel] present ${kind} failed:`, err?.message);
    return false;
  }
}

/** 当前正在呈现的类别（空闲为 null），供调用方判断自己是否被挡在门外 */
export function getDisplayOwner() {
  return ownerKind;
}

/**
 * 本类排队条数发生变化时调用：自己没持有闸门时，条数是由另一类弹窗「代告」的，
 * 需要通知持有方刷新提示，否则对方看到的待办数会停在旧值。
 * @param {string} kind - 发生了变化的一方
 */
export function notifyPendingChanged(kind) {
  if (!ownerKind || ownerKind === kind) return;
  const presenter = presenters.get(ownerKind);
  if (!presenter || typeof presenter.refresh !== 'function') return;
  try {
    presenter.refresh();
  } catch (err) {
    logger.error(`[SidePanel] refresh ${ownerKind} hint for ${kind} change failed:`, err?.message);
  }
}

/**
 * 另一类交互还有多少条在排队，用于在弹窗文案上给出总待办的可见性
 * （被闸门挡住的一方自己无法显示任何提示，只能由当前弹窗代告）。
 * @param {string} kind - 自己
 * @returns {number}
 */
export function getOtherPendingCount(kind) {
  let total = 0;
  for (const [other, presenter] of presenters) {
    if (other === kind) continue;
    const count = typeof presenter.pendingCount === 'function' ? presenter.pendingCount() : 0;
    total += Number.isFinite(count) && count > 0 ? count : 0;
  }
  return total;
}

/**
 * 上报「这一条已真正呈现给用户」：后台据此启动超时倒计时。
 * 仅在弹窗实际渲染可见后调用，排队中的项不得上报。
 * @param {string} kind
 * @param {{ toolCallId: string, sessionId?: string|null }} item
 */
export function reportInteractionDisplayed(kind, item) {
  if (!item || !item.toolCallId) return;
  const msg = {
    type: 'INTERACTION_DISPLAYED',
    data: {
      kind,
      toolCallId: item.toolCallId,
      sessionId: item.sessionId || null,
    },
  };
  Promise.resolve(chrome.runtime.sendMessage(msg)).catch((err) => {
    // 上行失败不影响交互本身：后台收不到回执时会走面板存活轮询 / 既有兜底
    logger.debug(`[SidePanel] report ${kind} displayed failed:`, err?.message);
  });
}
