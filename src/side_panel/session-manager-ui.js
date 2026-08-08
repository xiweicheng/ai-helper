// session-manager-ui.js - 会话标签栏 UI 组件
// 本模块不与 chat-manager.js 产生循环依赖，通过 DOM 事件通知上层

import state from './state.js';
import { BUILTIN_TOOLS } from './constants.js';
import { renderAgentSelector } from './agent-manager.js';
import { getAgent } from './agent-store.js';
import { renderToolsPopupList, updateCategoryBadges, updateToolsPopupTitle, updateToolsToggleState } from './tool-panel.js';
import { showToast } from './utils.js';
import {
  createSession,
  switchToSession,
  deleteSession,
  renameSession,
  loadSessions,
  saveCurrentSession,
  reorderSessions,
  duplicateSession,
  clearSessionCompleted
} from './session-manager.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  session: {
    newSession: '新会话',
    closeSession: '关闭会话',
    taskCompleted: '任务已完成',
    closeAllCount: '关闭全部({count})',
    noMatch: '未找到匹配的会话',
    rename: '重命名',
    duplicate: '复制会话',
    confirmCloseMessageWithTitle: '确定要关闭会话 "{title}" 吗？',
    confirmCloseAllMessage: '确定要关闭所有 {count} 个会话吗？',
    confirmCloseAllTitle: '关闭全部会话',
    forkedFrom: '已从 "{title}" 分叉',
    forkedSession: '已复制会话 "{title}"',
    operationFailed: '操作失败：{message}',
    sessionListTitle: '会话列表',
    closeGroupAll: '全部关闭',
    confirmCloseGroupMessage: '确定要关闭“{group}”下的 {count} 个会话吗？',
    today: '今天',
    yesterday: '昨天',
    last7Days: '近 7 天',
    earlier: '更早',
    todayFormat: '今天 {hour}:{minute}',
    yesterdayFormat: '昨天 {hour}:{minute}',
    daysAgo: '{count} 天前',
  },
});
registerTranslations('en', {
  session: {
    newSession: 'New Session',
    closeSession: 'Close Session',
    taskCompleted: 'Task completed',
    closeAllCount: 'Close All ({count})',
    noMatch: 'No matching sessions found',
    rename: 'Rename',
    duplicate: 'Duplicate',
    confirmCloseMessageWithTitle: 'Are you sure you want to close session "{title}"?',
    confirmCloseAllMessage: 'Are you sure you want to close all {count} sessions?',
    confirmCloseAllTitle: 'Close All Sessions',
    forkedFrom: 'Forked from "{title}"',
    forkedSession: 'Duplicated session "{title}"',
    operationFailed: 'Operation failed: {message}',
    sessionListTitle: 'Sessions',
    closeGroupAll: 'Close all',
    confirmCloseGroupMessage: 'Are you sure you want to close {count} sessions in "{group}"?',
    today: 'Today',
    yesterday: 'Yesterday',
    last7Days: 'Last 7 days',
    earlier: 'Earlier',
    todayFormat: 'Today {hour}:{minute}',
    yesterdayFormat: 'Yesterday {hour}:{minute}',
    daysAgo: '{count}d ago',
  },
});

// ==================== 下拉面板状态 ====================
let dropdownState = {
  visible: false,
  highlightIndex: -1,
  filteredSessions: [],
};

// ==================== 拖拽状态 ====================
let dragState = {
  draggedId: null,
  sourceType: null, // 'tab' | 'dropdown'
};

/**
 * 将会话 updatedAt 格式化为友好的时间标签
 * 今天 → "今天 HH:mm"，昨天 → "昨天 HH:mm"，7天内 → "X天前"，更早 → 日期
 */
function formatSessionTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const timestamp = date.getTime();

  if (timestamp >= todayStart) {
    return t('session.todayFormat', {
      hour: String(date.getHours()).padStart(2, '0'),
      minute: String(date.getMinutes()).padStart(2, '0'),
    });
  }

  const yesterdayStart = todayStart - 86400000;
  if (timestamp >= yesterdayStart) {
    return t('session.yesterdayFormat', {
      hour: String(date.getHours()).padStart(2, '0'),
      minute: String(date.getMinutes()).padStart(2, '0'),
    });
  }

  const daysAgo = Math.floor((todayStart - timestamp) / 86400000);
  if (daysAgo <= 7) {
    return t('session.daysAgo', { count: daysAgo });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 按 updatedAt 降序排序会话列表（最新的在前）
 */
function sortByUpdatedAt(sessions) {
  return sessions.sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });
}

/**
 * 获取会话所属的时间分组键
 */
function getTimeGroupKey(isoString) {
  if (!isoString) return 'earlier';
  const date = new Date(isoString);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const timestamp = date.getTime();

  if (timestamp >= todayStart) return 'today';
  if (timestamp >= todayStart - 86400000) return 'yesterday';
  if (Math.floor((todayStart - timestamp) / 86400000) <= 7) return 'last7Days';
  return 'earlier';
}

/**
 * 渲染会话标签栏（纯标签栏，不涉及消息区域）
 */
export async function renderSessionTabs() {
  const sessionsData = await loadSessions();
  state.sessions = sessionsData.list;
  state.activeSessionId = sessionsData.activeSessionId;

  const tabsContainer = document.getElementById('sessionTabs');
  const scrollContainer = document.getElementById('sessionTabsScroll');
  const actionsContainer = document.getElementById('sessionTabsActions');
  if (!tabsContainer || !scrollContainer || !actionsContainer) return;

  scrollContainer.innerHTML = '';

  sessionsData.list.forEach(session => {
    const tab = document.createElement('div');
    tab.className = 'session-tab';
    tab.dataset.sessionId = session.id;

    if (session.id === state.activeSessionId) {
      tab.classList.add('active');
    }

    tab.title = session.title;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'session-tab-title';
    titleSpan.textContent = session.title || t('session.newSession');
    tab.appendChild(titleSpan);

    // 关闭按钮（hover 时显示）
    const closeBtn = document.createElement('span');
    closeBtn.className = 'session-tab-close';
    closeBtn.innerHTML = '&#10005;';
    closeBtn.title = t('session.closeSession');
    closeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      // 判断会话是否有对话记录：当前会话用 state.messageHistory，其它用 session.messageHistory
      const msgCount = session.id === state.activeSessionId
        ? (state.messageHistory?.length || 0)
        : (session.messageHistory?.length || 0);
      // 空会话直接关闭，无需弹框确认
      if (msgCount === 0) {
        await deleteSession(session.id);
        await reloadAfterDelete();
        return;
      }
      showDeleteModal(session, async () => {
        await reloadAfterDelete();
      });
    });
    tab.appendChild(closeBtn);

    if (session.isGenerating || state.generatingSessionIds.has(session.id)) {
      const indicator = document.createElement('span');
      indicator.className = 'session-tab-indicator';
      tab.appendChild(indicator);
    } else if (state.completedSessionIds.has(session.id) && session.id !== state.activeSessionId) {
      // 后台任务已完成、等待用户查看的会话：显示静态完成标记（区别于生成中的脉动圆点）
      const completedIndicator = document.createElement('span');
      completedIndicator.className = 'session-tab-completed-indicator';
      completedIndicator.title = t('session.taskCompleted');
      tab.appendChild(completedIndicator);
    }

    tab.addEventListener('click', async (e) => {
      e.preventDefault();
      if (session.id === state.activeSessionId) return;
      await handleSessionSwitch(session.id);
    });

    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showTabContextMenu(e, session);
    });

    // 中键点击直接关闭会话
    tab.addEventListener('mousedown', async (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      await deleteSession(session.id);
      await reloadAfterDelete();
    });

    // 拖拽排序支持
    tab.draggable = true;
    tab.addEventListener('dragstart', (e) => handleTabDragStart(e, session.id));
    tab.addEventListener('dragover', (e) => handleTabDragOver(e));
    tab.addEventListener('dragleave', (e) => handleTabDragLeave(e));
    tab.addEventListener('drop', (e) => handleTabDrop(e, session.id));
    tab.addEventListener('dragend', (e) => handleTabDragEnd(e));

    scrollContainer.appendChild(tab);
  });

  // 绑定更多按钮事件
  bindMoreButton();
  // 绑定新建按钮（+ 已在 HTML 中）
  bindAddButton();
  // 绑定下拉面板事件
  bindDropdownEvents();

  // 鼠标滚轮水平滚动支持
  bindWheelScroll(scrollContainer);

  // 检测溢出并显示/隐藏更多按钮
  checkOverflow(scrollContainer);
  // 滚动到当前活跃标签
  scrollToActiveTab(scrollContainer);
}

// ==================== 更多按钮 ====================

function bindMoreButton() {
  const moreBtn = document.getElementById('sessionTabsMore');
  if (!moreBtn) return;
  // 移除旧监听器（防止重复绑定）
  const newMoreBtn = moreBtn.cloneNode(true);
  moreBtn.parentNode.replaceChild(newMoreBtn, moreBtn);
  newMoreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });
}

// ==================== 新建按钮 ====================

/** 新建会话（高层：保存当前 → 创建 → 切换 → 刷新 Tab） */
export async function newSession() {
  const previousSessionId = state.activeSessionId;
  await saveCurrentSession();
  const newSession = await createSession();
  state.activeSessionId = newSession.id;
  state.messageHistory = [];
  document.dispatchEvent(new CustomEvent('session-switched', {
    detail: { sessionId: newSession.id, previousSessionId }
  }));
  renderSessionTabs();
}

function bindAddButton() {
  const addBtn = document.getElementById('sessionTabsAdd');
  if (!addBtn) return;
  const newAddBtn = addBtn.cloneNode(true);
  addBtn.parentNode.replaceChild(newAddBtn, addBtn);
  newAddBtn.addEventListener('click', () => newSession());
}

// ==================== 溢出检测 ====================

function checkOverflow(scrollContainer) {
  const moreBtn = document.getElementById('sessionTabsMore');
  if (!moreBtn) return;
  if (scrollContainer.scrollWidth > scrollContainer.clientWidth) {
    moreBtn.style.display = 'flex';
  } else {
    moreBtn.style.display = 'none';
  }
}

// ResizeObserver 监听滚动容器尺寸变化
let overflowObserver = null;

function setupOverflowObserver() {
  if (overflowObserver) return;
  const scrollContainer = document.getElementById('sessionTabsScroll');
  if (!scrollContainer) return;
  overflowObserver = new ResizeObserver(() => {
    // 使用 requestAnimationFrame 避免 ResizeObserver loop 错误
    requestAnimationFrame(() => {
      checkOverflow(scrollContainer);
    });
  });
  overflowObserver.observe(scrollContainer);
}

// ==================== 活跃标签滚动 ====================

function scrollToActiveTab(scrollContainer) {
  setTimeout(() => {
    const activeTab = scrollContainer.querySelector('.session-tab.active');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, 50);
}

// ==================== 标签栏拖拽排序 ====================

function handleTabDragStart(e, sessionId) {
  dragState.draggedId = sessionId;
  dragState.sourceType = 'tab';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', sessionId);
  e.currentTarget.classList.add('dragging');
}

function handleTabDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function handleTabDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function handleTabDrop(e, targetId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const draggedId = dragState.draggedId;
  if (!draggedId || draggedId === targetId) return;

  const sessions = state.sessions || [];
  const draggedIndex = sessions.findIndex(s => s.id === draggedId);
  const targetIndex = sessions.findIndex(s => s.id === targetId);
  if (draggedIndex === -1 || targetIndex === -1) return;

  // 移动并持久化
  const reordered = [...sessions];
  const [moved] = reordered.splice(draggedIndex, 1);
  reordered.splice(targetIndex, 0, moved);

  state.sessions = reordered;
  await reorderSessions(reordered.map(s => s.id));
  renderSessionTabs();
}

function handleTabDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.session-tab.drag-over').forEach(el => el.classList.remove('drag-over'));
  dragState.draggedId = null;
  dragState.sourceType = null;
}

// ==================== 下拉面板 ====================

function toggleDropdown() {
  if (dropdownState.visible) {
    closeDropdown();
  } else {
    openDropdown();
  }
}

async function openDropdown() {
  const moreBtn = document.getElementById('sessionTabsMore');
  const dropdown = document.getElementById('sessionDropdown');
  if (!moreBtn || !dropdown) return;

  // 重新加载最新会话列表
  const sessionsData = await loadSessions();
  state.sessions = sessionsData.list;
  state.activeSessionId = sessionsData.activeSessionId;

  dropdownState.filteredSessions = sortByUpdatedAt([...sessionsData.list]);
  dropdownState.highlightIndex = -1;
  dropdownState.visible = true;

  renderDropdownList();
  dropdown.classList.add('show');

  // 绑定关闭按钮
  const closeBtn = document.getElementById('sessionDropdownCloseBtn');
  if (closeBtn) {
    closeBtn.onclick = () => closeDropdown();
  }

  // 恢复搜索文本 + 绑定搜索框事件
  const searchInput = document.getElementById('sessionDropdownSearch');
  const clearBtn = document.getElementById('sessionDropdownSearchClear');
  if (searchInput) {
    searchInput.value = dropdownState.lastSearchText || '';
    updateSearchClearVisibility();
    // 恢复搜索过滤状态
    if (dropdownState.lastSearchText) {
      filterDropdownSessions(dropdownState.lastSearchText);
    }
    setTimeout(() => searchInput.focus(), 50);

    // 搜索输入事件：实时过滤
    searchInput.oninput = () => {
      dropdownState.lastSearchText = searchInput.value;
      updateSearchClearVisibility();
      filterDropdownSessions(searchInput.value);
    };

    // 搜索框键盘事件：上下键导航列表，Enter 选中，Escape 关闭
    searchInput.onkeydown = (e) => {
      handleDropdownKeydown(e);
    };
  }

  // 清理按钮
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (searchInput) {
        searchInput.value = '';
        dropdownState.lastSearchText = '';
        updateSearchClearVisibility();
        filterDropdownSessions('');
        searchInput.focus();
      }
    };
  }

  // 更新更多按钮样式
  moreBtn.classList.add('active');
}

function closeDropdown() {
  const moreBtn = document.getElementById('sessionTabsMore');
  const dropdown = document.getElementById('sessionDropdown');
  if (dropdown) {
    dropdown.classList.remove('show');
  }
  if (moreBtn) {
    moreBtn.classList.remove('active');
  }
  // 保留搜索文本，下次打开时恢复
  const searchInput = document.getElementById('sessionDropdownSearch');
  if (searchInput) {
    dropdownState.lastSearchText = searchInput.value;
    searchInput.oninput = null;
    searchInput.onkeydown = null;
  }
  const clearBtn = document.getElementById('sessionDropdownSearchClear');
  if (clearBtn) clearBtn.onclick = null;
  dropdownState.visible = false;
  dropdownState.highlightIndex = -1;
  dropdownState.filteredSessions = [];
}

/** 更新搜索清理按钮的可见性 */
function updateSearchClearVisibility() {
  const searchInput = document.getElementById('sessionDropdownSearch');
  const clearBtn = document.getElementById('sessionDropdownSearchClear');
  if (clearBtn && searchInput) {
    clearBtn.style.display = searchInput.value ? 'flex' : 'none';
  }
}

function renderDropdownList() {
  const listEl = document.getElementById('sessionDropdownList');
  if (!listEl) return;

  listEl.innerHTML = '';

  // 更新"关闭全部"按钮的会话数量
  const closeAllBtn = document.getElementById('sessionDropdownCloseAll');
  if (closeAllBtn) {
    const total = (state.sessions || []).length;
    closeAllBtn.textContent = t('session.closeAllCount', { count: total });
  }

  if (dropdownState.filteredSessions.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'session-dropdown-empty';
    emptyEl.textContent = t('session.noMatch');
    listEl.appendChild(emptyEl);
    return;
  }

  const groupLabels = {
    today: t('session.today'),
    yesterday: t('session.yesterday'),
    last7Days: t('session.last7Days'),
    earlier: t('session.earlier'),
  };

  // 预计算每个分组的会话数量
  const groupCounts = {};
  dropdownState.filteredSessions.forEach(s => {
    const g = getTimeGroupKey(s.updatedAt);
    groupCounts[g] = (groupCounts[g] || 0) + 1;
  });

  let lastGroup = null;

  dropdownState.filteredSessions.forEach((session, index) => {
    // 时间分组标题 + 分组关闭按钮
    const group = getTimeGroupKey(session.updatedAt);
    if (group !== lastGroup) {
      lastGroup = group;
      const header = document.createElement('div');
      header.className = 'session-dropdown-group-header';

      const label = document.createElement('span');
      label.textContent = groupLabels[group] || group;
      header.appendChild(label);

      const count = groupCounts[group] || 0;
      if (count > 0) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'session-dropdown-group-close';
        closeBtn.textContent = t('session.closeGroupAll');
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          handleGroupCloseAll(group, groupLabels[group] || group);
        };
        header.appendChild(closeBtn);
      }

      listEl.appendChild(header);
    }

    const item = document.createElement('div');
    item.className = 'session-dropdown-item';
    item.dataset.sessionId = session.id;
    item.dataset.index = index;

    if (session.id === state.activeSessionId) {
      item.classList.add('active');
    }
    if (index === dropdownState.highlightIndex) {
      item.classList.add('highlighted');
    }

    // 后台任务已完成、等待查看的会话：在标题前显示静态完成标记
    const isCompletedPending = state.completedSessionIds.has(session.id) && session.id !== state.activeSessionId
      && !session.isGenerating && !state.generatingSessionIds.has(session.id);
    if (isCompletedPending) {
      const completedDot = document.createElement('span');
      completedDot.className = 'session-dropdown-item-completed';
      completedDot.title = t('session.taskCompleted');
      item.appendChild(completedDot);
    }

    // 会话图标（聊天气泡）
    const iconSpan = document.createElement('span');
    iconSpan.className = 'session-dropdown-item-icon';
    iconSpan.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    item.appendChild(iconSpan);

    // 标题
    const titleSpan = document.createElement('span');
    titleSpan.className = 'session-dropdown-item-title';
    titleSpan.textContent = session.title || t('session.newSession');
    titleSpan.title = session.title || t('session.newSession');
    item.appendChild(titleSpan);

    // 当前会话打勾标记
    if (session.id === state.activeSessionId) {
      const checkSpan = document.createElement('span');
      checkSpan.className = 'session-dropdown-item-check';
      checkSpan.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      item.appendChild(checkSpan);
    }

    // 时间标签（绝对定位右侧，hover 时淡出让位给操作按钮）
    const timeSpan = document.createElement('span');
    timeSpan.className = 'session-dropdown-item-time';
    timeSpan.textContent = formatSessionTime(session.updatedAt);
    item.appendChild(timeSpan);

    // 操作按钮容器（重命名 + 分叉 + 关闭）
    const actionsWrapper = document.createElement('span');
    actionsWrapper.className = 'session-dropdown-item-actions';

    // 重命名按钮
    const renameBtn = document.createElement('span');
    renameBtn.className = 'session-dropdown-item-rename';
    renameBtn.title = t('session.rename');
    renameBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      showRenameModal(session);
    });
    actionsWrapper.appendChild(renameBtn);

    // 会话分叉按钮
    const duplicateBtn = document.createElement('span');
    duplicateBtn.className = 'session-dropdown-item-duplicate';
    duplicateBtn.title = t('session.duplicate');
    duplicateBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M6 8.5v7"/><path d="M18 8.5c0 4-6 3.5-6 3.5"/></svg>`;
    duplicateBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await handleDuplicateSession(session.id);
      // 刷新列表
      const sessionsData = await loadSessions();
      state.sessions = sessionsData.list;
      state.activeSessionId = sessionsData.activeSessionId;
      filterDropdownSessions(document.getElementById('sessionDropdownSearch')?.value || '');
    });
    actionsWrapper.appendChild(duplicateBtn);

    // 关闭按钮
    const closeBtn = document.createElement('span');
    closeBtn.className = 'session-dropdown-item-close';
    closeBtn.innerHTML = '&#10005;';
    closeBtn.title = t('session.closeSession');
    closeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await handleDropdownCloseSession(session.id);
    });
    actionsWrapper.appendChild(closeBtn);

    item.appendChild(actionsWrapper);

    // 点击切换会话
    item.addEventListener('click', async (e) => {
      e.preventDefault();
      await handleDropdownSelectSession(session.id);
    });

    listEl.appendChild(item);
  });
}

function filterDropdownSessions(searchText) {
  const allSessions = state.sessions || [];
  let filtered;
  if (!searchText.trim()) {
    filtered = [...allSessions];
  } else {
    const lower = searchText.trim().toLowerCase();
    filtered = allSessions.filter(s =>
      (s.title || t('session.newSession')).toLowerCase().includes(lower)
    );
  }
  dropdownState.filteredSessions = sortByUpdatedAt(filtered);
  dropdownState.highlightIndex = -1;
  renderDropdownList();
}

async function handleDropdownSelectSession(sessionId) {
  closeDropdown();
  if (sessionId === state.activeSessionId) return;
  await handleSessionSwitch(sessionId);
}

async function handleDropdownCloseSession(sessionId) {
  // 找到会话标题用于确认弹窗
  const allSessions = state.sessions || [];
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return;

  // 判断会话是否有对话记录：当前会话用 state.messageHistory，其它用 session.messageHistory
  const msgCount = sessionId === state.activeSessionId
    ? (state.messageHistory?.length || 0)
    : (session.messageHistory?.length || 0);
  // 空会话直接关闭，无需弹框确认
  if (msgCount > 0) {
    const confirmed = await showCustomConfirm(
      t('session.confirmCloseMessageWithTitle', { title: session.title }),
      t('session.closeSession')
    );
    if (!confirmed) return;
  }

  await deleteSession(sessionId);
  await reloadAfterDelete();
  // 刷新下拉列表（重新过滤 + 排序）
  filterDropdownSessions(document.getElementById('sessionDropdownSearch')?.value || '');
}

async function handleCloseAllSessions() {
  const sessions = state.sessions || [];
  if (sessions.length === 0) return;

  const confirmed = await showCustomConfirm(
    t('session.confirmCloseAllMessage', { count: sessions.length }),
    t('session.confirmCloseAllTitle')
  );
  if (!confirmed) return;

  // 逐个删除所有会话
  for (const session of sessions) {
    await deleteSession(session.id);
  }
  await reloadAfterDelete();
  // 刷新下拉列表
  filterDropdownSessions(document.getElementById('sessionDropdownSearch')?.value || '');
}

/** 关闭指定分组的会话 */
async function handleGroupCloseAll(groupKey, groupLabel) {
  const allSessions = state.sessions || [];
  const groupSessions = allSessions.filter(s => getTimeGroupKey(s.updatedAt) === groupKey);
  if (groupSessions.length === 0) return;

  const confirmed = await showCustomConfirm(
    t('session.confirmCloseGroupMessage', { group: groupLabel, count: groupSessions.length }),
    t('session.closeSession')
  );
  if (!confirmed) return;

  for (const session of groupSessions) {
    await deleteSession(session.id);
  }
  await reloadAfterDelete();
  // 刷新下拉列表
  filterDropdownSessions(document.getElementById('sessionDropdownSearch')?.value || '');
}

function bindDropdownEvents() {
  const closeAllBtn = document.getElementById('sessionDropdownCloseAll');
  const dropdown = document.getElementById('sessionDropdown');

  if (!dropdown) return;

  // 搜索框事件在 openDropdown 中动态绑定（支持历史导航和清理按钮）

  // 关闭全部按钮
  if (closeAllBtn) {
    const newCloseAll = closeAllBtn.cloneNode(true);
    closeAllBtn.parentNode.replaceChild(newCloseAll, closeAllBtn);
    newCloseAll.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleCloseAllSessions();
    });
  }

  // 防止面板内部点击关闭
  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

function handleDropdownKeydown(e) {
  if (!dropdownState.visible) return;

  const list = dropdownState.filteredSessions;
  const len = list.length;
  if (len === 0) {
    if (e.key === 'Escape') closeDropdown();
    return;
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      dropdownState.highlightIndex = Math.min(dropdownState.highlightIndex + 1, len - 1);
      renderDropdownList();
      scrollHighlightedIntoView();
      break;
    case 'ArrowUp':
      e.preventDefault();
      dropdownState.highlightIndex = Math.max(dropdownState.highlightIndex - 1, 0);
      renderDropdownList();
      scrollHighlightedIntoView();
      break;
    case 'Enter':
      e.preventDefault();
      if (dropdownState.highlightIndex >= 0 && dropdownState.highlightIndex < len) {
        const session = dropdownState.filteredSessions[dropdownState.highlightIndex];
        handleDropdownSelectSession(session.id);
      }
      break;
    case 'Escape':
      e.preventDefault();
      closeDropdown();
      break;
  }
}

function scrollHighlightedIntoView() {
  const highlighted = document.querySelector('.session-dropdown-item.highlighted');
  if (highlighted) {
    highlighted.scrollIntoView({ block: 'nearest' });
  }
}

// ==================== 自定义确认弹窗 ====================

function showCustomConfirm(message, title) {
  return new Promise((resolve) => {
    const modal = document.getElementById('sessionDeleteModal');
    const messageEl = document.getElementById('sessionDeleteMessage');
    const confirmBtn = document.getElementById('sessionDeleteConfirmBtn');
    const cancelBtn = document.getElementById('sessionDeleteCancelBtn');
    const closeBtn = document.getElementById('sessionDeleteCloseBtn');

    if (!modal || !messageEl) {
      resolve(false);
      return;
    }

    messageEl.textContent = message;

    const cleanup = () => {
      modal.classList.remove('show');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);

    modal.classList.add('show');
  });
}

// ==================== 会话切换 ====================

/**
 * 处理会话切换
 */
async function handleSessionSwitch(sessionId) {
  // saveCurrentSession() 已在 switchToSession 内部调用，此处无需重复
  const previousSessionId = state.activeSessionId;
  const result = await switchToSession(sessionId);
  if (!result) return;

  // 并行化：loadSessions + chrome.storage.local 读取 + getAgent 彼此独立
  const agentToolsKey = `agentEnabledTools_${state.activeAgentId || 'default'}`;
  const [sessionsData, mcpToolsResult, savedResult, agent] = await Promise.all([
    loadSessions(),
    chrome.storage.local.get(['mcpTools']),
    chrome.storage.local.get([agentToolsKey, 'enabledTools']),
    state.activeAgentId ? getAgent(state.activeAgentId) : Promise.resolve(null),
  ]);

  state.sessions = sessionsData.list;
  state.activeSessionId = sessionId;

  // switchToSession 已设置 messageHistory/model/useTools/temperature/topP/activeAgentId
  // 此处只需处理 enabledTools（依赖 chrome.storage）
  const mcpTools = mcpToolsResult.mcpTools || [];
  const isAgentSpecific = !!savedResult[agentToolsKey];
  const savedTools = savedResult[agentToolsKey] || savedResult.enabledTools;
  if (savedTools && savedTools.length > 0) {
    const validIds = new Set([...BUILTIN_TOOLS.map(t => t.id), ...mcpTools.map(t => t.id)]);
    const existing = savedTools.filter(id => validIds.has(id));
    if (isAgentSpecific) {
      const addedMcp = mcpTools.filter(t => !existing.includes(t.id)).map(t => t.id);
      state.enabledTools = [...existing, ...addedMcp];
    } else {
      const added = BUILTIN_TOOLS.filter(t => t.enabled && !existing.includes(t.id)).map(t => t.id);
      const addedMcp = mcpTools.filter(t => !existing.includes(t.id)).map(t => t.id);
      state.enabledTools = [...existing, ...added, ...addedMcp];
    }
    if (state.enabledTools.length !== savedTools.length) {
      chrome.storage.local.set({ [agentToolsKey]: state.enabledTools });
    }
  } else {
    state.enabledTools = [...BUILTIN_TOOLS.filter(t => t.enabled).map(t => t.id), ...mcpTools.map(t => t.id)];
  }

  // 恢复当前 Agent 的工具限定列表
  state.activeAgentToolIds = agent ? agent.toolIds : null;

  document.dispatchEvent(new CustomEvent('session-switched', {
    detail: { sessionId, previousSessionId }
  }));

  // 用户已切回该会话查看，清除"完成待查看"标记
  clearSessionCompleted(sessionId);

  renderSessionTabs();
  updateUIControls();
  renderAgentSelector();
  
  // 刷新收藏面板（会话切换后更新收藏列表和按钮状态）
  try {
    const { refreshBookmarkPanel, updateBookmarkButtons } = await import('./bookmark-panel.js');
    refreshBookmarkPanel();
    // 延迟更新按钮状态，确保 DOM 已渲染
    setTimeout(() => updateBookmarkButtons(), 100);
  } catch (e) {}
  
  // 如果工具弹窗打开，联动刷新
  const toolsPopupOverlay = document.getElementById('toolsPopupOverlay');
  if (toolsPopupOverlay && toolsPopupOverlay.classList.contains('show')) {
    renderToolsPopupList();
    updateCategoryBadges();
    updateToolsPopupTitle();
  }
  // 始终更新工具栏按钮
  updateToolsToggleState();
}

// ==================== 会话复制（对话分支） ====================

/**
 * 复制指定会话并切换到新会话
 * 用于两个入口：右键菜单、下拉列表项的复制按钮
 * @param {string} sourceSessionId - 源会话 ID
 * @param {string|null} [upToMessageId=null] - 消息级分叉点（含该消息），不传则完整复制
 */
export async function handleDuplicateSession(sourceSessionId, upToMessageId = null) {
  if (!sourceSessionId) return;
  try {
    const newSession = await duplicateSession(sourceSessionId, upToMessageId);
    // 复制完成后切换到新会话（handleSessionSwitch 会处理 state 更新、事件派发、UI 重新渲染）
    await handleSessionSwitch(newSession.id);
    showToast(upToMessageId ? t('session.forkedFrom', { title: newSession.title }) : t('session.forkedSession', { title: newSession.title }), 'success');
  } catch (err) {
    logger.error('[SessionUI] copy/forksession failed:', err);
    showToast(t('session.operationFailed', { message: err.message }), 'error');
  }
}

// ==================== UI 控件更新 ====================

/**
 * 更新 UI 控件（模型选择器等）
 */
function updateUIControls() {
  const modelDisplay = document.querySelector('.model-display');
  if (modelDisplay && state.currentModel) {
    modelDisplay.textContent = state.currentModel;
  }

  const toolsCheckbox = document.getElementById('enableToolsBtn');
  if (toolsCheckbox) {
    toolsCheckbox.checked = state.useTools;
  }

  const tempDisplay = document.getElementById('tempIconValue');
  if (tempDisplay && state.temperature !== undefined) {
    tempDisplay.textContent = state.temperature.toFixed(2);
  }
}

// ==================== 滚轮水平滚动 ====================

const wheelScrollBindings = new WeakSet();

function bindWheelScroll(el) {
  if (wheelScrollBindings.has(el)) return;
  wheelScrollBindings.add(el);

  el.addEventListener('wheel', (e) => {
    // 如果已经可以垂直滚动（内容没溢出），不做处理
    if (el.scrollWidth <= el.clientWidth) return;

    // 将垂直滚轮转换为水平滚动
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, { passive: false });
}

// ==================== 自定义弹窗 ====================

/**
 * 显示会话重命名弹窗
 */
function showRenameModal(session) {
  const modal = document.getElementById('sessionRenameModal');
  const input = document.getElementById('sessionRenameInput');
  const confirmBtn = document.getElementById('sessionRenameConfirmBtn');
  const cancelBtn = document.getElementById('sessionRenameCancelBtn');
  const closeBtn = document.getElementById('sessionRenameCloseBtn');

  if (!modal || !input) return;

  input.value = session.title;

  const cleanup = () => {
    modal.classList.remove('show');
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
    closeBtn.removeEventListener('click', onCancel);
  };

  const onConfirm = async () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== session.title) {
      await renameSession(session.id, newTitle);
      renderSessionTabs();
      // 刷新下拉列表
      const sessionsData = await loadSessions();
      state.sessions = sessionsData.list;
      state.activeSessionId = sessionsData.activeSessionId;
      filterDropdownSessions(document.getElementById('sessionDropdownSearch')?.value || '');
    }
    cleanup();
  };

  const onCancel = () => {
    cleanup();
  };

  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
  closeBtn.addEventListener('click', onCancel);

  // 回车键确认
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      onConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  modal.classList.add('show');
  // 模态框显示后再聚焦
  setTimeout(() => {
    input.focus();
    input.select();
  }, 50);
}

/**
 * 显示会话删除确认弹窗
 */
function showDeleteModal(session, onDeleted) {
  const modal = document.getElementById('sessionDeleteModal');
  const messageEl = document.getElementById('sessionDeleteMessage');
  const confirmBtn = document.getElementById('sessionDeleteConfirmBtn');
  const cancelBtn = document.getElementById('sessionDeleteCancelBtn');
  const closeBtn = document.getElementById('sessionDeleteCloseBtn');

  if (!modal || !messageEl) return;

  messageEl.textContent = t('session.confirmCloseMessageWithTitle', { title: session.title });

  const cleanup = () => {
    modal.classList.remove('show');
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
    closeBtn.removeEventListener('click', onCancel);
  };

  const onConfirm = async () => {
    await deleteSession(session.id);
    if (onDeleted) await onDeleted();
    cleanup();
  };

  const onCancel = () => {
    cleanup();
  };

  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
  closeBtn.addEventListener('click', onCancel);

  modal.classList.add('show');
  // 自动聚焦确认按钮，支持 Enter 键直接确认
  requestAnimationFrame(() => confirmBtn.focus());
}

/**
 * 显示右键菜单
 */
function showTabContextMenu(event, session) {
  const existingMenu = document.querySelector('.session-context-menu');
  if (existingMenu) existingMenu.remove();

  const menu = document.createElement('div');
  menu.className = 'session-context-menu';
  menu.style.left = event.clientX + 'px';
  menu.style.top = event.clientY + 'px';

  // 重命名
  const renameItem = createMenuItem(t('session.rename'), '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>', () => {
    menu.remove();
    showRenameModal(session);
  });
  menu.appendChild(renameItem);

  // 会话分叉（完整复制为分支）
  const duplicateItem = createMenuItem(t('session.duplicate'), '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M6 8.5v7"/><path d="M18 8.5c0 4-6 3.5-6 3.5"/></svg>', () => {
    menu.remove();
    handleDuplicateSession(session.id);
  });
  menu.appendChild(duplicateItem);

  // 关闭会话（原"删除"，统一命名为"关闭会话"；空会话无需确认）
  const deleteItem = createMenuItem(t('session.closeSession'), '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>', async () => {
    menu.remove();
    // 判断会话是否有对话记录：当前会话用 state.messageHistory，其它用 session.messageHistory
    const msgCount = session.id === state.activeSessionId
      ? (state.messageHistory?.length || 0)
      : (session.messageHistory?.length || 0);
    // 空会话直接关闭，无需弹框确认
    if (msgCount === 0) {
      await deleteSession(session.id);
      await reloadAfterDelete();
      return;
    }
    showDeleteModal(session, async () => {
      await reloadAfterDelete();
    });
  }, 'danger');
  menu.appendChild(deleteItem);

  document.body.appendChild(menu);

  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

function createMenuItem(label, iconSvg = '', onClick, className = '') {
  const item = document.createElement('div');
  item.className = 'session-context-menu-item ' + className;
  if (iconSvg) {
    item.innerHTML = `${iconSvg}<span>${label}</span>`;
  } else {
    item.textContent = label;
  }
  item.addEventListener('click', onClick);
  return item;
}

// ==================== 删除后状态重载（自动创建新会话） ====================

/**
 * 删除会话后重新加载状态，如果没有活跃会话则自动创建
 */
async function reloadAfterDelete() {
  const previousSessionId = state.activeSessionId;
  let sessionsData = await loadSessions();
  // 如果没有活跃会话了，自动创建一个新会话
  if (!sessionsData.activeSessionId) {
    await createSession();
    sessionsData = await loadSessions();
  }
  state.activeSessionId = sessionsData.activeSessionId;
  state.sessions = sessionsData.list;
  const active = sessionsData.list.find(s => s.id === sessionsData.activeSessionId);
  state.messageHistory = active ? (active.messageHistory || []) : [];

  // 恢复新活跃会话的 Agent 绑定，避免被关闭会话的 Agent 覆盖
  state.activeAgentId = active ? (active.agentId || null) : null;
  if (state.activeAgentId) {
    const agent = await getAgent(state.activeAgentId);
    state.activeAgentToolIds = agent ? agent.toolIds : null;
  } else {
    state.activeAgentToolIds = null;
  }

  document.dispatchEvent(new CustomEvent('session-switched', {
    detail: { sessionId: state.activeSessionId, previousSessionId }
  }));
  renderSessionTabs();
  await renderAgentSelector();
}

/**
 * 关闭当前会话（高层：删除 → 重新加载，无活跃会话则自动新建）
 * 供快捷键调用，无需手动刷新 UI。
 */
export async function closeCurrentSession() {
  const sid = state.activeSessionId;
  if (!sid) return;
  const session = state.sessions?.find(s => s.id === sid);
  if (!session) return;
  // 与 Tab 关闭按钮一致：空会话直接关闭，非空会话弹确认
  const msgCount = state.messageHistory?.length || 0;
  if (msgCount === 0) {
    await deleteSession(sid);
    await reloadAfterDelete();
    return;
  }
  showDeleteModal(session, async () => {
    await reloadAfterDelete();
  });
}

// ==================== 初始化 ====================

// 监听生成状态变更，实时更新 Tab 栏指示器
document.addEventListener('generating-state-changed', () => {
  renderSessionTabs();
});

// 在模块加载时设置 ResizeObserver
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupOverflowObserver);
} else {
  setupOverflowObserver();
}
