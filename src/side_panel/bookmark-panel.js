// ========== 消息收藏面板 ==========

import state from './state.js';
import { getSortedBookmarks, removeBookmarkById, toggleBookmarkPin, isBookmarked } from './bookmark-manager.js';
import { switchToSession } from './session-manager.js';
import { escapeHtml } from './utils.js';
import logger from '../shared/logger.js';

/**
 * 初始化收藏面板：创建固定入口按钮和面板 DOM
 */
export function initBookmarkPanel() {
  // 创建容器
  const container = document.createElement('div');
  container.className = 'bookmark-panel-container';
  container.id = 'bookmarkPanelContainer';
  container.innerHTML = `
    <button class="bookmark-panel-toggle" id="bookmarkPanelToggle" title="收藏列表">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="bookmark-badge" id="bookmarkBadge" style="display:none;"></span>
    </button>
    <div class="bookmark-panel" id="bookmarkPanel">
      <div class="bookmark-panel-header">
        <span>📑 收藏</span>
        <span class="bookmark-panel-count" id="bookmarkPanelCount"></span>
      </div>
      <div class="bookmark-panel-content" id="bookmarkPanelContent">
        <div class="bookmark-panel-empty">暂无收藏</div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // 绑定事件
  const toggle = document.getElementById('bookmarkPanelToggle');
  const panel = document.getElementById('bookmarkPanel');

  toggle.addEventListener('click', () => {
    const isOpen = panel.classList.contains('expanded');
    if (isOpen) {
      panel.classList.remove('expanded');
    } else {
      refreshBookmarkPanel();
      panel.classList.add('expanded');
    }
  });

  // 点击面板外部关闭
  document.addEventListener('click', (e) => {
    if (panel.classList.contains('expanded')) {
      if (!container.contains(e.target)) {
        panel.classList.remove('expanded');
      }
    }
  });

  // 使用事件委托处理面板内的点击
  document.getElementById('bookmarkPanelContent').addEventListener('click', async (e) => {
    const item = e.target.closest('.bookmark-item');
    if (!item) return;

    const bookmarkId = item.dataset.bookmarkId;
    const sessionId = item.dataset.sessionId;
    const messageId = item.dataset.messageId;

    // 取消收藏按钮
    if (e.target.closest('.bookmark-item-remove')) {
      e.stopPropagation();
      await removeBookmarkById(bookmarkId);
      refreshBookmarkPanel();
      updateBookmarkButtons();
      return;
    }

    // 置顶按钮
    if (e.target.closest('.bookmark-item-pin')) {
      e.stopPropagation();
      const bm = state.bookmarks.find(b => b.id === bookmarkId);
      if (bm) {
        await toggleBookmarkPin(bookmarkId, !bm.pinned);
        refreshBookmarkPanel();
      }
      return;
    }

    // 点击条目：导航到消息
    await navigateToBookmark(sessionId, messageId);
    panel.classList.remove('expanded');
  });

  logger.debug('[BookmarkPanel] 收藏面板已初始化');
}

/**
 * 刷新收藏面板内容
 */
export function refreshBookmarkPanel() {
  const content = document.getElementById('bookmarkPanelContent');
  const count = document.getElementById('bookmarkPanelCount');
  if (!content || !count) return;

  const currentSessionId = state.activeSessionId;
  const currentBookmarks = getSortedBookmarks(currentSessionId);
  const otherBookmarks = currentSessionId
    ? state.bookmarks.filter(b => b.sessionId !== currentSessionId).sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.createdAt - a.createdAt;
      })
    : [];

  const total = state.bookmarks.length;
  count.textContent = total > 0 ? `${total} 条` : '';

  if (total === 0) {
    content.innerHTML = '<div class="bookmark-panel-empty">暂无收藏</div>';
    updateBookmarkBadge();
    return;
  }

  let html = '';

  // 当前会话收藏
  if (currentBookmarks.length > 0) {
    html += `<div class="bookmark-section">
      <div class="bookmark-section-title">当前会话</div>
      ${renderBookmarkItems(currentBookmarks)}
    </div>`;
  }

  // 其他会话收藏
  if (otherBookmarks.length > 0) {
    html += `<div class="bookmark-section">
      <div class="bookmark-section-title">其他会话</div>
      ${renderBookmarkItems(otherBookmarks)}
    </div>`;
  }

  content.innerHTML = html;
  updateBookmarkBadge();
}

/**
 * 渲染收藏条目列表
 */
function renderBookmarkItems(bookmarks) {
  return bookmarks.map(bm => {
    const displayContent = bm.content
      ? (bm.content.length > 60 ? bm.content.substring(0, 60) + '...' : bm.content)
      : '(无文本内容)';
    const pinnedClass = bm.pinned ? 'pinned' : '';
    const sessionTitle = bm.sessionTitle || '未知会话';
    const time = new Date(bm.createdAt).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });

    return `
      <div class="bookmark-item ${pinnedClass}" data-bookmark-id="${bm.id}" data-session-id="${bm.sessionId}" data-message-id="${bm.messageId}">
        <div class="bookmark-item-header">
          <span class="bookmark-item-session" title="${escapeHtml(sessionTitle)}">${escapeHtml(sessionTitle)}</span>
          <span class="bookmark-item-time">${time}</span>
        </div>
        <div class="bookmark-item-content" title="${escapeHtml(bm.content || '')}">${escapeHtml(displayContent)}</div>
        <div class="bookmark-item-actions">
          <button class="bookmark-item-pin" title="${bm.pinned ? '取消置顶' : '置顶'}">
            <svg viewBox="0 0 24 24" fill="${bm.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="17" x2="12" y2="22"/>
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
            </svg>
          </button>
          <button class="bookmark-item-remove" title="取消收藏">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 导航到收藏的消息
 */
async function navigateToBookmark(sessionId, messageId) {
  if (!sessionId || !messageId) return;

  // 如果不在目标会话，先切换
  if (state.activeSessionId !== sessionId) {
    try {
      const previousSessionId = state.activeSessionId;
      await switchToSession(sessionId);
      // 触发 DOM 更新（session-switched 事件会重建 chatContainer）
      document.dispatchEvent(new CustomEvent('session-switched', {
        detail: { sessionId, previousSessionId, skipScrollRestore: true }
      }));
      // 刷新会话 Tab 选中状态
      try {
        const { renderSessionTabs } = await import('./session-manager-ui.js');
        renderSessionTabs();
      } catch (e) {
        logger.warn('[BookmarkPanel] 刷新会话Tab失败:', e);
      }
    } catch (e) {
      logger.error('[BookmarkPanel] 切换会话失败:', e);
      return;
    }
  }

  // 定位到消息（等待 DOM 重建完成）
  setTimeout(() => {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;
    const messageEl = chatContainer.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageEl) {
      messageEl.scrollIntoView({ behavior: 'instant', block: 'nearest' });
      // 高亮效果
      messageEl.classList.add('bookmark-highlight');
      setTimeout(() => {
        messageEl.classList.remove('bookmark-highlight');
      }, 2000);
    }
  }, 500);
}

/**
 * 更新收藏入口按钮的徽标
 */
export function updateBookmarkBadge() {
  const badge = document.getElementById('bookmarkBadge');
  const container = document.getElementById('bookmarkPanelContainer');
  const count = state.bookmarks.length;
  
  // 无收藏时隐藏整个入口
  if (container) {
    container.style.display = count > 0 ? '' : 'none';
  }
  
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

/**
 * 更新所有消息底部的收藏按钮状态
 */
export function updateBookmarkButtons() {
  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer) return;
  chatContainer.querySelectorAll('.message.assistant').forEach(msgEl => {
    const bookmarkBtn = msgEl.querySelector('.bookmark-btn');
    if (!bookmarkBtn) return;
    const messageId = msgEl.dataset.messageId;
    const sessionId = state.activeSessionId;
    updateBookmarkBtnState(bookmarkBtn, sessionId, messageId);
  });
}

/**
 * 更新单个收藏按钮的状态
 */
export function updateBookmarkBtnState(btn, sessionId, messageId) {
  const bm = isBookmarked(sessionId, messageId);
  if (bm) {
    btn.classList.add('bookmarked');
    btn.title = '取消收藏';
    btn.querySelector('svg').setAttribute('fill', 'currentColor');
  } else {
    btn.classList.remove('bookmarked');
    btn.title = '收藏消息';
    btn.querySelector('svg').setAttribute('fill', 'none');
  }
}