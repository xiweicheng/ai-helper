// ========== 消息收藏管理 ==========

import state from './state.js';
import { getAllBookmarks, putBookmark, deleteBookmark, updateBookmarkPin } from '../storage/db.js';
import logger from '../shared/logger.js';

/**
 * 加载所有收藏到 state
 */
export async function loadBookmarks() {
  try {
    const all = await getAllBookmarks();
    state.bookmarks = all || [];
    logger.debug('[Bookmark] 已加载收藏:', state.bookmarks.length, '条');
  } catch (e) {
    logger.error('[Bookmark] 加载收藏失败:', e);
    state.bookmarks = [];
  }
}

/**
 * 检查某条消息是否已收藏
 * @param {string} sessionId
 * @param {string} messageId
 * @returns {Object|null} 已收藏返回 bookmark 对象，否则 null
 */
export function isBookmarked(sessionId, messageId) {
  return state.bookmarks.find(b => b.sessionId === sessionId && b.messageId === messageId) || null;
}

/**
 * 添加收藏
 * @param {string} sessionId
 * @param {string} messageId
 * @param {string} content - 纯文本内容（截取前100字符）
 * @param {string} sessionTitle - 会话标题
 * @returns {Promise<Object|null>} 返回新收藏对象
 */
export async function addBookmark(sessionId, messageId, content, sessionTitle) {
  if (!sessionId || !messageId) return null;

  const existing = isBookmarked(sessionId, messageId);
  if (existing) return existing;

  const bookmark = {
    id: 'bmk_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
    sessionId,
    messageId,
    content: content || '',
    sessionTitle: sessionTitle || '',
    createdAt: Date.now(),
    pinned: false,
  };

  try {
    const ok = await putBookmark(bookmark);
    if (ok) {
      state.bookmarks.push(bookmark);
      logger.debug('[Bookmark] 收藏成功:', bookmark.id);
      return bookmark;
    }
  } catch (e) {
    logger.error('[Bookmark] 收藏失败:', e);
  }
  return null;
}

/**
 * 移除收藏
 * @param {string} sessionId
 * @param {string} messageId
 * @returns {Promise<boolean>}
 */
export async function removeBookmark(sessionId, messageId) {
  const existing = isBookmarked(sessionId, messageId);
  if (!existing) return false;

  try {
    const ok = await deleteBookmark(existing.id);
    if (ok) {
      state.bookmarks = state.bookmarks.filter(b => b.id !== existing.id);
      logger.debug('[Bookmark] 取消收藏:', existing.id);
      return true;
    }
  } catch (e) {
    logger.error('[Bookmark] 取消收藏失败:', e);
  }
  return false;
}

/**
 * 通过 bookmark id 移除收藏
 */
export async function removeBookmarkById(bookmarkId) {
  try {
    const ok = await deleteBookmark(bookmarkId);
    if (ok) {
      state.bookmarks = state.bookmarks.filter(b => b.id !== bookmarkId);
      return true;
    }
  } catch (e) {
    logger.error('[Bookmark] 取消收藏失败:', e);
  }
  return false;
}

/**
 * 切换置顶状态
 * @param {string} bookmarkId
 * @param {boolean} pinned
 * @returns {Promise<boolean>}
 */
export async function toggleBookmarkPin(bookmarkId, pinned) {
  try {
    const ok = await updateBookmarkPin(bookmarkId, pinned);
    if (ok) {
      const bm = state.bookmarks.find(b => b.id === bookmarkId);
      if (bm) bm.pinned = pinned;
      return true;
    }
  } catch (e) {
    logger.error('[Bookmark] 置顶操作失败:', e);
  }
  return false;
}

/**
 * 获取排序后的收藏列表
 * 置顶的在前，按收藏时间倒序
 * @param {string|null} sessionId - 限定会话，null 则返回全部
 * @returns {Array}
 */
export function getSortedBookmarks(sessionId = null) {
  let list = state.bookmarks;
  if (sessionId) {
    list = list.filter(b => b.sessionId === sessionId);
  }
  return [...list].sort((a, b) => {
    // 置顶优先
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    // 按收藏时间倒序
    return b.createdAt - a.createdAt;
  });
}

/**
 * 更新收藏的会话标题（会话重命名时调用）
 */
export async function updateBookmarkSessionTitle(sessionId, newTitle) {
  const toUpdate = state.bookmarks.filter(b => b.sessionId === sessionId);
  for (const bm of toUpdate) {
    bm.sessionTitle = newTitle;
    try {
      await putBookmark(bm);
    } catch (e) {
      logger.warn('[Bookmark] 更新会话标题失败:', e);
    }
  }
}