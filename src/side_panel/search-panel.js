// ========== 消息搜索面板 ==========

import state from './state.js';
import { switchToSession } from './session-manager.js';
import { escapeHtml, showToast } from './utils.js';
import { getAllSessions, getSession, deleteMessageFromSession } from '../storage/db.js';
import logger from '../shared/logger.js';

// 搜索状态
let isSearching = false;
let cancelSearch = false;
let searchResults = [];
let lastSearchQuery = '';

/**
 * 初始化搜索面板：创建固定入口按钮和面板 DOM
 */
export function initSearchPanel() {
  // 初始化搜索输入历史
  state.searchInputHistory = [];
  state.searchInputHistoryIndex = -1;
  try {
    chrome.storage.local.get(['searchInputHistory'], (result) => {
      if (result.searchInputHistory) {
        state.searchInputHistory = result.searchInputHistory;
      }
    });
  } catch (e) {
    // 非扩展上下文，忽略
  }

  const container = document.createElement('div');
  container.className = 'search-panel-container';
  container.id = 'searchPanelContainer';
  container.innerHTML = `
    <button class="search-panel-toggle" id="searchPanelToggle" title="消息搜索">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    </button>
    <div class="search-panel" id="searchPanel">
      <div class="search-panel-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:#4a90d9;">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span>消息搜索</span>
        <span class="search-panel-count" id="searchPanelCount"></span>
        <button class="search-panel-close-btn" id="searchPanelClose" title="关闭">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
        </button>
      </div>
      <div class="search-panel-input-area">
        <div class="search-panel-input-wrapper">
          <input type="text" class="search-panel-input" id="searchPanelInput" placeholder="搜索消息（支持 & | 组合搜索）..." />
          <button class="search-panel-clear" id="searchPanelClear" title="清除" style="display:none;">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
          </button>
        </div>
        <div class="search-panel-mode-btns">
          <button class="search-mode-btn active" id="searchModeGlobal" title="在所有会话中搜索">全局搜索</button>
          <button class="search-mode-btn" id="searchModeCurrent" title="仅在当前会话中搜索">当前会话</button>
        </div>
      </div>
      <div class="search-panel-content" id="searchPanelContent">
        <div class="search-panel-empty">输入关键词开始搜索</div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  bindSearchPanelEvents();
  logger.debug('[SearchPanel] 搜索面板已初始化');
}

/**
 * 绑定搜索面板事件
 */
function bindSearchPanelEvents() {
  const container = document.getElementById('searchPanelContainer');
  const panel = document.getElementById('searchPanel');
  const toggle = document.getElementById('searchPanelToggle');
  const searchInput = document.getElementById('searchPanelInput');
  const searchClear = document.getElementById('searchPanelClear');
  const searchClose = document.getElementById('searchPanelClose');
  const modeGlobal = document.getElementById('searchModeGlobal');
  const modeCurrent = document.getElementById('searchModeCurrent');

  toggle.addEventListener('click', () => {
    const isOpen = panel.classList.contains('expanded');
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  });

  // 关闭按钮
  searchClose.addEventListener('click', () => {
    closePanel();
  });

  // 清除按钮
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    resetSearch();
    searchInput.focus();
  });

  // 输入事件
  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim();
    searchClear.style.display = val ? '' : 'none';
    if (!val) {
      resetSearch();
    }
  });

  // 键盘事件：回车搜索、上下键历史、ESC关闭
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      const query = searchInput.value.trim();
      if (query) {
        addToSearchHistory(query);
        performSearch(query);
      }
    } else if (e.key === 'Escape') {
      if (state.searchInputHistoryIndex >= 0) {
        state.searchInputHistoryIndex = -1;
        searchInput.value = '';
      } else {
        e.stopPropagation();
        closePanel();
      }
    } else if (e.key === 'ArrowUp') {
      e.stopPropagation();
      const history = state.searchInputHistory;
      if (history.length === 0) return;
      if (state.searchInputHistoryIndex === -1) {
        state.searchInputHistoryIndex = history.length - 1;
      } else if (state.searchInputHistoryIndex > 0) {
        state.searchInputHistoryIndex--;
      }
      searchInput.value = history[state.searchInputHistoryIndex] || '';
      searchClear.style.display = searchInput.value ? '' : 'none';
    } else if (e.key === 'ArrowDown') {
      e.stopPropagation();
      const history = state.searchInputHistory;
      if (state.searchInputHistoryIndex >= 0 && state.searchInputHistoryIndex < history.length - 1) {
        state.searchInputHistoryIndex++;
        searchInput.value = history[state.searchInputHistoryIndex] || '';
      } else {
        state.searchInputHistoryIndex = -1;
        searchInput.value = '';
      }
      searchClear.style.display = searchInput.value ? '' : 'none';
    }
  });

  /**
   * 添加到搜索输入历史
   */
  function addToSearchHistory(text) {
    if (!text || !text.trim()) return;
    const trimmed = text.trim();
    const history = state.searchInputHistory;
    const idx = history.indexOf(trimmed);
    if (idx !== -1) history.splice(idx, 1);
    history.push(trimmed);
    if (history.length > 20) history.shift();
    state.searchInputHistoryIndex = -1;
    try {
      chrome.storage.local.set({ searchInputHistory: history });
    } catch (e) {
      // 非扩展上下文，忽略
    }
  }

  // 搜索模式切换（已选中状态再次点击也会触发搜索，应对新消息/切会话场景）
  modeGlobal.addEventListener('click', () => {
    if (!modeGlobal.classList.contains('active')) {
      modeGlobal.classList.add('active');
      modeCurrent.classList.remove('active');
    }
    const query = searchInput.value.trim();
    if (query) {
      performSearch(query);
    }
  });

  modeCurrent.addEventListener('click', () => {
    if (!modeCurrent.classList.contains('active')) {
      modeCurrent.classList.add('active');
      modeGlobal.classList.remove('active');
    }
    const query = searchInput.value.trim();
    if (query) {
      performSearch(query);
    }
  });

  // 面板内容区点击（结果导航，不关闭面板，方便多次定位）
  document.getElementById('searchPanelContent').addEventListener('click', async (e) => {
    const item = e.target.closest('.search-result-item');
    if (!item) return;

    const sessionId = item.dataset.sessionId;
    const messageId = item.dataset.messageId;
    await navigateToSearchResult(sessionId, messageId);
    // 不关闭面板，保留搜索结果，方便继续点击其他结果
  });
}

/**
 * 打开面板
 */
function openPanel() {
  const panel = document.getElementById('searchPanel');
  const searchInput = document.getElementById('searchPanelInput');
  panel.classList.add('expanded');
  // 如果已有搜索词且结果为空，重新搜索
  if (searchInput.value.trim() && searchResults.length === 0) {
    performSearch(searchInput.value.trim());
  }
  setTimeout(() => searchInput.focus(), 100);
}

/**
 * 关闭面板（仅隐藏，不清空搜索结果）
 */
function closePanel() {
  const panel = document.getElementById('searchPanel');
  panel.classList.remove('expanded');
  // 关闭时取消正在进行的搜索
  cancelSearch = true;
  isSearching = false;
}

/**
 * 重置搜索状态
 */
function resetSearch() {
  cancelSearch = true;
  isSearching = false;
  searchResults = [];
  lastSearchQuery = '';
  const content = document.getElementById('searchPanelContent');
  const count = document.getElementById('searchPanelCount');
  if (content) content.innerHTML = '<div class="search-panel-empty">输入关键词开始搜索</div>';
  if (count) count.textContent = '';
}

/**
 * 执行搜索（异步增量式）
 */
async function performSearch(query) {
  if (!query || !query.trim()) return;
  query = query.trim().toLowerCase();
  
  // 如果已在搜索同一词，跳过
  if (isSearching && lastSearchQuery === query) return;

  // 取消之前的搜索
  cancelSearch = true;
  // 等待之前的搜索完全停止
  await new Promise(r => setTimeout(r, 50));

  isSearching = true;
  cancelSearch = false;
  searchResults = [];
  lastSearchQuery = query;

  const content = document.getElementById('searchPanelContent');
  const count = document.getElementById('searchPanelCount');
  content.innerHTML = '<div class="search-panel-loading">搜索中...</div>';
  count.textContent = '';

  const modeGlobal = document.getElementById('searchModeGlobal');
  const isGlobal = modeGlobal.classList.contains('active');

  try {
    if (isGlobal) {
      await searchAllSessions(query, content, count);
    } else {
      await searchCurrentSession(query, content, count);
    }
  } catch (err) {
    logger.error('[SearchPanel] 搜索出错:', err);
    if (!cancelSearch) {
      content.innerHTML = '<div class="search-panel-empty">搜索出错</div>';
    }
  }

  if (!cancelSearch) {
    isSearching = false;
  }
}

/**
 * 搜索当前会话（从 state.messageHistory）
 */
async function searchCurrentSession(query, content, count) {
  const currentSessionId = state.activeSessionId;
  if (!currentSessionId) {
    content.innerHTML = '<div class="search-panel-empty">没有活跃会话</div>';
    return;
  }

  const messages = state.messageHistory || [];
  const results = searchInMessages(messages, query, currentSessionId);
  
  if (cancelSearch) return;

  searchResults = results;
  count.textContent = results.length > 0 ? `${results.length} 条` : '无结果';
  
  if (results.length === 0) {
    content.innerHTML = '<div class="search-panel-empty">未找到匹配消息</div>';
    return;
  }

  renderSearchResults(results, query, content);
}

/**
 * 全局搜索所有会话
 */
async function searchAllSessions(query, content, count) {
  const currentSessionId = state.activeSessionId;
  const allSessions = await getAllSessions();
  
  if (cancelSearch) return;

  if (!allSessions || allSessions.length === 0) {
    content.innerHTML = '<div class="search-panel-empty">没有会话数据</div>';
    return;
  }

  const currentResults = [];
  const otherResults = [];

  // 先搜索当前会话（从 state 中取，更快）
  if (currentSessionId) {
    const messages = state.messageHistory || [];
    const results = searchInMessages(messages, query, currentSessionId);
    
    if (cancelSearch) return;
    
    // 获取当前会话标题
    const currentSession = allSessions.find(s => s.id === currentSessionId);
    const currentTitle = currentSession?.title || '当前会话';
    
    for (const r of results) {
      currentResults.push({ ...r, sessionTitle: currentTitle });
    }
    
    // 立即渲染第一批结果
    searchResults = [...currentResults];
    count.textContent = `搜索中... ${currentResults.length} 条`;
    renderSearchResults(searchResults, query, content, true);
  }

  // 逐个搜索其他会话
  const otherSessions = allSessions.filter(s => s.id !== currentSessionId);
  
  for (const session of otherSessions) {
    if (cancelSearch) return;

    try {
      // 从 IndexedDB 加载完整会话数据
      const fullSession = await getSession(session.id);
      if (!fullSession || !fullSession.messageHistory) continue;

      const messages = fullSession.messageHistory || [];
      const results = searchInMessages(messages, query, session.id);

      if (results.length > 0) {
        for (const r of results) {
          otherResults.push({ ...r, sessionTitle: session.title || '未知会话' });
        }
        
        searchResults = [...currentResults, ...otherResults];
        const totalCount = currentResults.length + otherResults.length;
        count.textContent = totalCount > 0 ? `${totalCount} 条` : '无结果';
        renderSearchResults(searchResults, query, content);
      }
    } catch (err) {
      logger.warn('[SearchPanel] 搜索会话失败:', session.id, err);
    }

    // 每搜索一个会话后短暂暂停，让 UI 更新
    await new Promise(r => setTimeout(r, 10));
  }

  if (cancelSearch) return;

  const totalCount = searchResults.length;
  count.textContent = totalCount > 0 ? `${totalCount} 条` : '无结果';
  
  if (totalCount === 0) {
    content.innerHTML = '<div class="search-panel-empty">未找到匹配消息</div>';
    return;
  }

  renderSearchResults(searchResults, query, content);
}

/**
 * 在消息列表中搜索
 * @returns {Array<{messageId, content, role, sessionId, matchPreview}>}
 */
function searchInMessages(messages, query, sessionId) {
  const results = [];
  if (!messages || messages.length === 0) return results;

  const isAdvanced = query.includes('&') || query.includes('|');

  for (const msg of messages) {
    // 只搜索 assistant 和 user 消息
    if (msg.role !== 'assistant' && msg.role !== 'user') continue;
    
    // 提取纯文本内容
    const textContent = extractTextContent(msg.content);
    if (!textContent) continue;

    const lowerContent = textContent.toLowerCase();
    let matchIdx = -1;
    let matchTerm = query;

    if (isAdvanced) {
      // 高级搜索: & = AND, | = OR, & 优先级高于 |
      const orGroups = query.split('|').map(g => g.trim()).filter(Boolean);
      let matched = false;
      for (const group of orGroups) {
        const andTerms = group.split('&').map(t => t.trim()).filter(Boolean);
        if (andTerms.length === 0) continue;
        const allMatch = andTerms.every(term => lowerContent.includes(term));
        if (allMatch) {
          matched = true;
          matchTerm = andTerms[0]; // 用于预览定位
          matchIdx = lowerContent.indexOf(matchTerm);
          break;
        }
      }
      if (!matched) continue;
    } else {
      if (!lowerContent.includes(query)) continue;
      matchIdx = lowerContent.indexOf(query);
    }

    // 生成匹配预览
    const queryLen = matchTerm.length;
    const start = Math.max(0, matchIdx - 30);
    const end = Math.min(textContent.length, matchIdx + queryLen + 30);
    let preview = textContent.substring(start, end);
    if (start > 0) preview = '...' + preview;
    if (end < textContent.length) preview = preview + '...';

    results.push({
      messageId: msg.messageId || msg.id,
      content: textContent.substring(0, 200),
      role: msg.role,
      sessionId,
      matchPreview: preview,
      query
    });
  }

  return results;
}

/**
 * 从消息内容中提取纯文本
 */
function extractTextContent(content) {
  if (!content) return '';
  if (typeof content === 'string') {
    // 移除 HTML 标签
    return content.replace(/<[^>]*>/g, '');
  }
  if (Array.isArray(content)) {
    return content
      .filter(c => c.type === 'text')
      .map(c => c.text || '')
      .join(' ');
  }
  return String(content);
}

/**
 * 渲染搜索结果
 * @param {boolean} isIncremental - 是否增量模式（搜索进行中）
 */
function renderSearchResults(results, query, contentEl, isIncremental) {
  if (!contentEl) {
    contentEl = document.getElementById('searchPanelContent');
  }
  if (!contentEl) return;

  if (results.length === 0) {
    contentEl.innerHTML = '<div class="search-panel-empty">未找到匹配消息</div>';
    return;
  }

  const currentSessionId = state.activeSessionId;
  const currentResults = results.filter(r => r.sessionId === currentSessionId);
  const otherResults = results.filter(r => r.sessionId !== currentSessionId);

  let html = '';
  const searchLabel = isIncremental ? ' (搜索中...)' : '';

  // 当前会话结果
  if (currentResults.length > 0) {
    html += `<div class="search-section">
      <div class="search-section-title">当前会话${searchLabel} · ${currentResults.length} 条</div>
      ${renderResultItems(currentResults, query)}
    </div>`;
  }

  // 其他会话结果
  if (otherResults.length > 0) {
    html += `<div class="search-section">
      <div class="search-section-title">其他会话 · ${otherResults.length} 条</div>
      ${renderResultItems(otherResults, query)}
    </div>`;
  }

  contentEl.innerHTML = html;
}

/**
 * 渲染结果条目
 */
function renderResultItems(results, query) {
  return results.map((r, idx) => {
    const roleIcon = r.role === 'user' ? '👤' : '🤖';
    const roleLabel = r.role === 'user' ? '你' : '助手';
    const sessionTitle = r.sessionTitle || '';
    const isCurrentSession = r.sessionId === state.activeSessionId;

    // 高亮匹配文本
    const highlightedPreview = highlightText(escapeHtml(r.matchPreview), query);

    return `
      <div class="search-result-item" data-session-id="${r.sessionId}" data-message-id="${r.messageId}" title="${escapeHtml(r.content)}">
        <div class="search-result-header">
          <span class="search-result-role">${roleIcon} ${roleLabel}</span>
          ${!isCurrentSession ? `<span class="search-result-session" title="${escapeHtml(sessionTitle)}">${escapeHtml(sessionTitle.length > 20 ? sessionTitle.substring(0, 20) + '...' : sessionTitle)}</span>` : ''}
        </div>
        <div class="search-result-preview">${highlightedPreview}</div>
      </div>
    `;
  }).join('');
}

/**
 * 文本高亮（支持 & / | 多词高亮）
 */
function highlightText(text, query) {
  if (!query) return text;
  // 提取所有搜索词（含 & / | 分隔）
  const terms = query.split(/[&|]/).map(t => t.trim()).filter(Boolean);
  if (terms.length === 0) return text;
  const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
  return text.replace(regex, '<mark class="search-highlight-match">$1</mark>');
}

/**
 * 导航到搜索结果
 */
async function navigateToSearchResult(sessionId, messageId) {
  if (!sessionId || !messageId) return;

  // 如果不在目标会话，先切换
  if (state.activeSessionId !== sessionId) {
    try {
      const previousSessionId = state.activeSessionId;
      const switched = await switchToSession(sessionId);
      // 切换失败说明会话已不存在
      if (switched === false || state.activeSessionId !== sessionId) {
        showToast('会话已不存在', 'warning');
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
        logger.warn('[SearchPanel] 刷新会话Tab失败:', e);
      }
    } catch (e) {
      logger.error('[SearchPanel] 切换会话失败:', e);
      return;
    }
  }

  // 定位到消息（等待 DOM 重建完成）
  setTimeout(async () => {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;
    const messageEl = chatContainer.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageEl) {
      messageEl.scrollIntoView({ behavior: 'instant', block: 'nearest' });
      // 高亮效果（与收藏定位一致）
      messageEl.classList.add('bookmark-highlight');
      setTimeout(() => {
        messageEl.classList.remove('bookmark-highlight');
      }, 2000);
    } else {
      showToast('消息已被删除', 'warning');
      // 消息在 DOM 中找不到，说明是 IndexedDB 中的脏数据（之前删除未成功清理）
      // 自动从 IndexedDB 中移除，下次搜索不会再命中
      try {
        const cleaned = await deleteMessageFromSession(sessionId, messageId);
        if (cleaned) {
          // 也从当前搜索结果中移除，避免重复点击
          searchResults = searchResults.filter(r => !(r.sessionId === sessionId && r.messageId === messageId));
          // 刷新搜索结果面板
          const content = document.getElementById('searchPanelContent');
          const count = document.getElementById('searchPanelCount');
          if (content && searchResults.length > 0) {
            renderSearchResults(searchResults, lastSearchQuery, content);
            count.textContent = `${searchResults.length} 条`;
          } else if (content && searchResults.length === 0) {
            content.innerHTML = '<div class="search-panel-empty">未找到匹配消息</div>';
            if (count) count.textContent = '无结果';
          }
          logger.debug('[SearchPanel] 已清理 IndexedDB 脏数据:', sessionId, messageId);
        }
      } catch (e) {
        logger.warn('[SearchPanel] 清理脏数据失败:', e);
      }
    }
  }, 500);
}
