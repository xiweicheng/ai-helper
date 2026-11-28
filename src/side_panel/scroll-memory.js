// scroll-memory.js - 会话滚动位置记忆
//
import state from './state.js';
// 为什么不能只存 scrollTop：助手正文用了 content-visibility: auto（屏幕外按
// contain-intrinsic-size 占位），切回会话时滚动高度先按占位值算，随后随着真实布局
// 参与计算而变大/变小，绝对 scrollTop 就会落到别的消息上。
// 这里改成「消息锚点 + 偏移」：记住离开时视野顶部是哪条消息、它相对容器顶部的偏移，
// 恢复时连续几帧校正，直到锚点回到原偏移；纯数字 scrollTop 作为兜底，
// 同时兼容历史版本存下的数字。

const MIN_BOTTOM_GAP = 48;    // 距底部小于该值视为「停在底部」
const RESTORE_ATTEMPTS = 6;   // 校正次数上限（content-visibility 替换高度需要几帧）
const ANCHOR_WAIT_ROUNDS = 8; // 等消息渲染出来的轮数
const ANCHOR_WAIT_MS = 50;

export function scrollStorageKey(sessionId) {
  return 'scrollPosition_' + (sessionId || 'default');
}

/**
 * 采集当前滚动快照：位置数值 + 是否停在底部 + 视野顶部那条消息的锚点
 * @param {HTMLElement} container
 * @returns {{ top: number, atBottom: boolean, anchor: { id: string, offset: number } | null }}
 */
export function captureScrollSnapshot(container) {
  const top = container.scrollTop;
  const atBottom = container.scrollHeight - container.clientHeight - top < MIN_BOTTOM_GAP;
  let anchor = null;
  if (!atBottom) {
    const boxTop = container.getBoundingClientRect().top;
    for (const el of container.querySelectorAll('[data-message-id]')) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > boxTop) {
        anchor = { id: el.dataset.messageId, offset: rect.top - boxTop };
        break;
      }
    }
  }
  return { top, atBottom, anchor };
}

/** 立即落盘当前会话的滚动快照（调用方负责会话仍是当前会话） */
export function saveChatScroll(sessionId) {
  const container = document.getElementById('chatContainer');
  if (!container) return;
  chrome.storage.local
    .set({ [scrollStorageKey(sessionId)]: captureScrollSnapshot(container) })
    .catch(() => {});
}

function nextFrames() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function findAnchorMessage(container, id) {
  if (!id) return null;
  for (const el of container.querySelectorAll('[data-message-id]')) {
    if (el.dataset.messageId === id) return el;
  }
  return null;
}

/**
 * 恢复会话滚动位置
 * @param {string} sessionId
 * @returns {Promise<boolean>} 是否完成定位
 */
export async function restoreChatScroll(sessionId) {
  const container = document.getElementById('chatContainer');
  if (!container) return false;
  // 会话切换是全量重建：如果 150ms 内又切走了，这里恢复的是上一个会话的位置，
  // 会套到新会话的 DOM 上。当前会话不再是它就直接放弃。
  const currentSession = () => state.activeSessionId || 'default';
  const expected = sessionId || 'default';
  if (currentSession() !== expected) return false;

  const key = scrollStorageKey(sessionId);
  let saved;
  try {
    saved = (await chrome.storage.local.get([key]))[key];
  } catch (e) {
    return false;
  }
  // 读存储期间可能又切了会话
  if (currentSession() !== expected) return false;
  if (saved === undefined || saved === null) return false;
  const snap = typeof saved === 'number' ? { top: saved } : saved;

  // 切换会话是全量重建，消息可能还没插入完：等锚点消息出现再定位
  for (let i = 0; i < ANCHOR_WAIT_ROUNDS; i += 1) {
    if (snap.atBottom || !snap.anchor || findAnchorMessage(container, snap.anchor.id)) break;
    await new Promise((resolve) => setTimeout(resolve, ANCHOR_WAIT_MS));
    if (currentSession() !== expected) return false;
  }

  let bottomPasses = 0;
  const settle = () => {
    if (snap.atBottom) {
      container.scrollTop = container.scrollHeight;
      bottomPasses += 1;
      // 占位高度换成真实高度后总高度会变大，只贴一次会停在半路：连补几帧
      return bottomPasses >= 3;
    }
    if (snap.anchor) {
      const target = findAnchorMessage(container, snap.anchor.id);
      if (target) {
        const delta = target.getBoundingClientRect().top
          - container.getBoundingClientRect().top
          - snap.anchor.offset;
        if (Math.abs(delta) <= 0.5) return true;
        // 先滚到位，下一帧重新测量：屏幕外正文换成真实高度后偏移会变
        container.scrollTop += delta;
        return false;
      }
    }
    container.scrollTop = snap.top ?? 0;
    return true;
  };

  for (let i = 0; i < RESTORE_ATTEMPTS; i += 1) {
    if (currentSession() !== expected) return false;
    if (settle()) return true;
    await nextFrames();
  }
  return false;
}
