// ========== 消息收藏面板 ==========

import state from './state.js';
import { getSortedBookmarks, removeBookmarkById, removeBookmark, toggleBookmarkPin, isBookmarked } from './bookmark-manager.js';
import { switchToSession } from './session-manager.js';
import { escapeHtml, showToast } from './utils.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  bookmark: {
    toggleTitle: '收藏列表',
    title: '消息收藏',
    searchPlaceholder: '搜索收藏内容（支持 & | 组合搜索）...',
    clearSearchTitle: '清除搜索',
    empty: '暂无收藏',
    searchCount: '搜索 {filtered}/{total}',
    countResult: '{count} 条',
    noMatch: '无匹配结果',
    otherSessions: '其他会话',
    noTextContent: '(无文本内容)',
    unpinTitle: '取消置顶',
    pinTitle: '置顶',
    removeBookmarkTitle: '取消收藏',
    addBookmarkTitle: '收藏消息',
    sessionNotExistToast: '会话已不存在，收藏已自动移除',
    messageNotExistToast: '消息已不存在，收藏已自动移除',
  },
});

registerTranslations('en', {
  bookmark: {
    toggleTitle: 'Bookmarks',
    title: 'Message bookmarks',
    searchPlaceholder: 'Search bookmarks (supports & | combined search)...',
    clearSearchTitle: 'Clear search',
    empty: 'No bookmarks',
    searchCount: 'Search {filtered}/{total}',
    countResult: '{count} items',
    noMatch: 'No matching results',
    otherSessions: 'Other sessions',
    noTextContent: '(No text content)',
    unpinTitle: 'Unpin',
    pinTitle: 'Pin',
    removeBookmarkTitle: 'Remove bookmark',
    addBookmarkTitle: 'Bookmark message',
    sessionNotExistToast: 'Session no longer exists, bookmark automatically removed',
    messageNotExistToast: 'Message no longer exists, bookmark automatically removed',
  },
});

/**
 * 初始化收藏面板：创建固定入口按钮和面板 DOM
 */
export function initBookmarkPanel() {

  /**
   * 搜索匹配（支持 & AND / | OR 高级语法）
   */
  function matchSearch(text, query) {
    if (!query) return true;
    const lowerText = text.toLowerCase();
    if (query.includes('&') || query.includes('|')) {
      const orGroups = query.split('|').map(g => g.trim()).filter(Boolean);
      for (const group of orGroups) {
        const andTerms = group.split('&').map(t => t.trim()).filter(Boolean);
        if (andTerms.length === 0) continue;
        if (andTerms.every(term => lowerText.includes(term))) return true;
      }
      return false;
    }
    return lowerText.includes(query);
  }

  // 创建容器
  const container = document.createElement('div');
  container.className = 'bookmark-panel-container';
  container.id = 'bookmarkPanelContainer';
  container.innerHTML = `
    <button class="bookmark-panel-toggle" id="bookmarkPanelToggle" title="${t('bookmark.toggleTitle')}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>

    </button>
    <div class="bookmark-panel" id="bookmarkPanel">
      <div class="bookmark-panel-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:#f0a500;">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <span>${t('bookmark.title')}</span>
        <span class="bookmark-panel-count" id="bookmarkPanelCount"></span>
        <button class="bookmark-panel-close-btn" id="bookmarkPanelClose" title="${t('common.close')}">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
        </button>
      </div>
      <div class="bookmark-search">
        <div class="bookmark-search-input-wrapper">
          <input type="text" class="bookmark-search-input" id="bookmarkSearchInput" placeholder="${t('bookmark.searchPlaceholder')}" />
          <button class="bookmark-search-clear" id="bookmarkSearchClear" title="${t('bookmark.clearSearchTitle')}" style="display:none;">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
          </button>
        </div>
      </div>
      <div class="bookmark-panel-content" id="bookmarkPanelContent">
        <div class="bookmark-panel-empty">${t('bookmark.empty')}</div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // 绑定事件
  const toggle = document.getElementById('bookmarkPanelToggle');
  const panel = document.getElementById('bookmarkPanel');
  const searchInput = document.getElementById('bookmarkSearchInput');
  const closeBtn = document.getElementById('bookmarkPanelClose');

  // 初始化收藏搜索历史
  state.bookmarkSearchHistory = [];
  state.bookmarkSearchHistoryIndex = -1;
  try {
    chrome.storage.local.get(['bookmarkSearchHistory'], (result) => {
      if (result.bookmarkSearchHistory) {
        state.bookmarkSearchHistory = result.bookmarkSearchHistory;
      }
    });
  } catch (e) { /* 非扩展上下文 */ }

  /**
   * 添加到收藏搜索历史
   */
  function addToBookmarkSearchHistory(text) {
    if (!text || !text.trim()) return;
    const trimmed = text.trim();
    const history = state.bookmarkSearchHistory;
    const idx = history.indexOf(trimmed);
    if (idx !== -1) history.splice(idx, 1);
    history.push(trimmed);
    if (history.length > 20) history.shift();
    state.bookmarkSearchHistoryIndex = -1;
    try {
      chrome.storage.local.set({ bookmarkSearchHistory: history });
    } catch (e) { /* 非扩展上下文 */ }
  }

  toggle.addEventListener('click', () => {
    const isOpen = panel.classList.contains('expanded');
    if (isOpen) {
      panel.classList.remove('expanded');
    } else {
      refreshBookmarkPanel(searchInput.value);
      panel.classList.add('expanded');
    }
  });

  // 关闭按钮
  closeBtn.addEventListener('click', () => {
    panel.classList.remove('expanded');
  });

  // 搜索过滤
  const searchClear = document.getElementById('bookmarkSearchClear');
  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim();
    refreshBookmarkPanel(val);
    searchClear.style.display = val ? '' : 'none';
  });

  // 清除搜索按钮
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    state.bookmarkSearchHistoryIndex = -1;
    refreshBookmarkPanel();
  });

  // 键盘事件
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (query) {
        addToBookmarkSearchHistory(query);
        refreshBookmarkPanel(query);
      }
    } else if (e.key === 'Escape') {
      if (state.bookmarkSearchHistoryIndex >= 0) {
        state.bookmarkSearchHistoryIndex = -1;
        searchInput.value = '';
        refreshBookmarkPanel();
        searchClear.style.display = 'none';
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const history = state.bookmarkSearchHistory;
      if (history.length === 0) return;
      if (state.bookmarkSearchHistoryIndex === -1) {
        state.bookmarkSearchHistoryIndex = history.length - 1;
      } else if (state.bookmarkSearchHistoryIndex > 0) {
        state.bookmarkSearchHistoryIndex--;
      }
      searchInput.value = history[state.bookmarkSearchHistoryIndex] || '';
      searchClear.style.display = searchInput.value ? '' : 'none';
      refreshBookmarkPanel(searchInput.value);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const history = state.bookmarkSearchHistory;
      if (state.bookmarkSearchHistoryIndex >= 0 && state.bookmarkSearchHistoryIndex < history.length - 1) {
        state.bookmarkSearchHistoryIndex++;
        searchInput.value = history[state.bookmarkSearchHistoryIndex] || '';
      } else {
        state.bookmarkSearchHistoryIndex = -1;
        searchInput.value = '';
      }
      searchClear.style.display = searchInput.value ? '' : 'none';
      refreshBookmarkPanel(searchInput.value);
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

    // 点击条目：导航到消息（面板保持打开，方便多次定位）
    await navigateToBookmark(sessionId, messageId);
  });

  logger.debug('[BookmarkPanel] 收藏面板已初始化');
}

/**
 * 刷新收藏面板内容
 * @param {string} [searchQuery] - 搜索关键词
 */
export function refreshBookmarkPanel(searchQuery) {
  const content = document.getElementById('bookmarkPanelContent');
  const count = document.getElementById('bookmarkPanelCount');
  if (!content || !count) return;

  const currentSessionId = state.activeSessionId;
  let currentBookmarks = getSortedBookmarks(currentSessionId);
  let otherBookmarks = currentSessionId
    ? state.bookmarks.filter(b => b.sessionId !== currentSessionId).sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.createdAt - a.createdAt;
      })
    : [];

  // 搜索过滤（支持 & AND / | OR 高级语法）
  const rawQuery = (searchQuery || '').trim();
  const query = rawQuery.toLowerCase();
  const isAdvanced = query.includes('&') || query.includes('|');
  if (rawQuery) {
    const filterFn = (b) => {
      const text = ((b.content || '') + ' ' + (b.sessionTitle || '')).toLowerCase();
      if (isAdvanced) {
        const orGroups = query.split('|').map(g => g.trim()).filter(Boolean);
        for (const group of orGroups) {
          const andTerms = group.split('&').map(t => t.trim()).filter(Boolean);
          if (andTerms.length === 0) continue;
          if (andTerms.every(term => text.includes(term))) return true;
        }
        return false;
      }
      return text.includes(query);
    };
    currentBookmarks = currentBookmarks.filter(filterFn);
    otherBookmarks = otherBookmarks.filter(filterFn);
  }

  const total = state.bookmarks.length;
  const filteredTotal = currentBookmarks.length + otherBookmarks.length;
  if (query) {
    count.textContent = t('bookmark.searchCount', { filtered: filteredTotal, total });
  } else {
    count.textContent = total > 0 ? t('bookmark.countResult', { count: total }) : '';
  }

  if (total === 0) {
    content.innerHTML = `<div class="bookmark-panel-empty">${t('bookmark.empty')}</div>`;
    updateBookmarkBadge();
    return;
  }

  if (query && filteredTotal === 0) {
    content.innerHTML = `<div class="bookmark-panel-empty">${t('bookmark.noMatch')}</div>`;
    updateBookmarkBadge();
    return;
  }

  let html = '';

  // 当前会话收藏
  if (currentBookmarks.length > 0) {
    html += `<div class="bookmark-section">
      <div class="bookmark-section-title">${t('searchPanel.currentSession')}</div>
      ${renderBookmarkItems(currentBookmarks, query)}
    </div>`;
  }

  // 其他会话收藏
  if (otherBookmarks.length > 0) {
    html += `<div class="bookmark-section">
      <div class="bookmark-section-title">${t('bookmark.otherSessions')}</div>
      ${renderBookmarkItems(otherBookmarks, query)}
    </div>`;
  }

  content.innerHTML = html;
  updateBookmarkBadge();
}

/**
 * 渲染收藏条目列表
 * @param {Array} bookmarks
 * @param {string} [searchQuery] - 搜索关键词，用于高亮
 */
function renderBookmarkItems(bookmarks, searchQuery) {
  const query = (searchQuery || '').trim().toLowerCase();
  return bookmarks.map(bm => {
    const rawContent = bm.content || '';
    const rawTitle = bm.sessionTitle || t('searchPanel.unknownSession');
    let displayContent = rawContent.length > 60 ? rawContent.substring(0, 60) + '...' : rawContent;
    let sessionTitle = rawTitle;

    // 搜索高亮
    if (query) {
      displayContent = highlightText(displayContent, query);
      sessionTitle = highlightText(sessionTitle, query);
    }

    if (!displayContent) displayContent = t('bookmark.noTextContent');
    const pinnedClass = bm.pinned ? 'pinned' : '';
    const time = new Date(bm.createdAt).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });

    return `
      <div class="bookmark-item ${pinnedClass}" data-bookmark-id="${bm.id}" data-session-id="${bm.sessionId}" data-message-id="${bm.messageId}">
        <div class="bookmark-item-header">
          <span class="bookmark-item-session" title="${escapeHtml(rawTitle)}">${sessionTitle}</span>
          <span class="bookmark-item-time">${time}</span>
        </div>
        <div class="bookmark-item-content" title="${escapeHtml(rawContent)}">${displayContent}</div>
        <div class="bookmark-item-actions">
          <button class="bookmark-item-pin" title="${bm.pinned ? t('bookmark.unpinTitle') : t('bookmark.pinTitle')}">
            <svg viewBox="0 0 24 24" fill="${bm.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="17" x2="12" y2="22"/>
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
            </svg>
          </button>
          <button class="bookmark-item-remove" title="${t('bookmark.removeBookmarkTitle')}">
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
 * 文本高亮：将匹配部分包裹在 <mark> 标签中
 */
function highlightText(text, query) {
  if (!query) return text;
  // 先转义 HTML，再做高亮
  const escaped = escapeHtml(text);
  // 支持 & / | 多词高亮
  const terms = query.split(/[&|]/).map(t => t.trim()).filter(Boolean);
  if (terms.length === 0) return escaped;
  const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
  return escaped.replace(regex, '<mark class="bookmark-highlight-match">$1</mark>');
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
      const switched = await switchToSession(sessionId);
      // 切换失败说明会话已不存在，移除孤儿收藏
      if (switched === false || state.activeSessionId !== sessionId) {
        await removeBookmark(sessionId, messageId);
        refreshBookmarkPanel();
        showToast(t('bookmark.sessionNotExistToast'), 'warning');
        return;
      }
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
    } else {
      // 消息已不存在，移除孤儿收藏
      removeBookmark(sessionId, messageId).then(() => {
        refreshBookmarkPanel();
        showToast(t('bookmark.messageNotExistToast'), 'warning');
      });
    }
  }, 500);
}

/**
 * 更新收藏入口按钮的徽标
 */
export function updateBookmarkBadge() {
  const container = document.getElementById('bookmarkPanelContainer');
  const count = state.bookmarks.length;
  
  // 无收藏时隐藏整个入口
  if (container) {
    container.style.display = count > 0 ? '' : 'none';
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
    btn.title = t('bookmark.removeBookmarkTitle');
    btn.querySelector('svg').setAttribute('fill', 'currentColor');
  } else {
    btn.classList.remove('bookmarked');
    btn.title = t('bookmark.addBookmarkTitle');
    btn.querySelector('svg').setAttribute('fill', 'none');
  }
}