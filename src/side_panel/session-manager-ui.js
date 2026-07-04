// session-manager-ui.js - 会话标签栏 UI 组件
// 本模块不与 chat-manager.js 产生循环依赖，通过 DOM 事件通知上层

import state from './state.js';
import { BUILTIN_TOOLS } from './constants.js';
import { renderAgentSelector } from './agent-manager.js';
import { getAgent } from './agent-store.js';
import { renderToolsPopupList, updateCategoryBadges, updateToolsPopupTitle, updateToolsToggleState } from './tool-panel.js';
import {
  createSession,
  switchToSession,
  deleteSession,
  renameSession,
  loadSessions,
  saveCurrentSession,
  reorderSessions
} from './session-manager.js';

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
    titleSpan.textContent = session.title || '新会话';
    tab.appendChild(titleSpan);

    // 关闭按钮（hover 时显示）
    const closeBtn = document.createElement('span');
    closeBtn.className = 'session-tab-close';
    closeBtn.innerHTML = '&#10005;';
    closeBtn.title = '关闭会话';
    closeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      showDeleteModal(session, async () => {
        await reloadAfterDelete();
      });
    });
    tab.appendChild(closeBtn);

    if (session.isGenerating || state.generatingSessionIds.has(session.id)) {
      const indicator = document.createElement('span');
      indicator.className = 'session-tab-indicator';
      tab.appendChild(indicator);
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

function bindAddButton() {
  const addBtn = document.getElementById('sessionTabsAdd');
  if (!addBtn) return;
  const newAddBtn = addBtn.cloneNode(true);
  addBtn.parentNode.replaceChild(newAddBtn, addBtn);
  newAddBtn.addEventListener('click', async () => {
    await saveCurrentSession();
    const newSession = await createSession();
    state.activeSessionId = newSession.id;
    state.messageHistory = [];
    document.dispatchEvent(new CustomEvent('session-switched', {
      detail: { sessionId: newSession.id }
    }));
    renderSessionTabs();
  });
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

// ==================== 下拉列表拖拽排序 ====================

function handleDropdownDragStart(e, sessionId) {
  dragState.draggedId = sessionId;
  dragState.sourceType = 'dropdown';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', sessionId);
  e.currentTarget.classList.add('dragging');
}

function handleDropdownDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function handleDropdownDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function handleDropdownDrop(e, targetId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const draggedId = dragState.draggedId;
  if (!draggedId || draggedId === targetId) return;

  // 使用过滤后的列表做排序（下拉列表可能是搜索过滤后的子集）
  const filtered = dropdownState.filteredSessions;
  const draggedIndex = filtered.findIndex(s => s.id === draggedId);
  const targetIndex = filtered.findIndex(s => s.id === targetId);
  if (draggedIndex === -1 || targetIndex === -1) return;

  const reorderedFiltered = [...filtered];
  const [moved] = reorderedFiltered.splice(draggedIndex, 1);
  reorderedFiltered.splice(targetIndex, 0, moved);

  // 更新 filteredSessions
  dropdownState.filteredSessions = reorderedFiltered;

  // 映射回完整 sessions 列表
  const allSessions = state.sessions || [];
  const fullIds = allSessions.map(s => s.id);
  const filteredIds = new Set(reorderedFiltered.map(s => s.id));
  const nonFilteredIds = fullIds.filter(id => !filteredIds.has(id));

  // 将过滤后重排的顺序与非过滤部分拼接
  const newOrderedIds = [...reorderedFiltered.map(s => s.id), ...nonFilteredIds];

  state.sessions = newOrderedIds.map(id => allSessions.find(s => s.id === id)).filter(Boolean);
  await reorderSessions(newOrderedIds);
  renderDropdownList();
  renderSessionTabs();
}

function handleDropdownDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.session-dropdown-item.drag-over').forEach(el => el.classList.remove('drag-over'));
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

  dropdownState.filteredSessions = [...sessionsData.list];
  dropdownState.highlightIndex = -1;
  dropdownState.visible = true;

  renderDropdownList();
  positionDropdown(moreBtn, dropdown);

  // 聚焦搜索框
  const searchInput = document.getElementById('sessionDropdownSearch');
  if (searchInput) {
    searchInput.value = '';
    setTimeout(() => searchInput.focus(), 50);
  }

  // 更新更多按钮样式
  moreBtn.classList.add('active');

  // 外部点击关闭
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 0);
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
  dropdownState.visible = false;
  dropdownState.highlightIndex = -1;
  dropdownState.filteredSessions = [];
  document.removeEventListener('click', handleOutsideClick);
}

function handleOutsideClick(e) {
  const dropdown = document.getElementById('sessionDropdown');
  const moreBtn = document.getElementById('sessionTabsMore');
  if (!dropdown || !moreBtn) return;
  if (!dropdown.contains(e.target) && e.target !== moreBtn && !moreBtn.contains(e.target)) {
    closeDropdown();
  }
}

function positionDropdown(moreBtn, dropdown) {
  dropdown.classList.add('show');
  const rect = moreBtn.getBoundingClientRect();
  const dropdownHeight = 360; // max-height

  let top = rect.bottom + 4;
  let left = rect.right - 240; // 右对齐

  // 底部超出时向上翻转
  if (top + dropdownHeight > window.innerHeight - 8) {
    top = rect.top - dropdownHeight - 4;
    if (top < 8) top = 8;
  }

  // 左侧超出修正
  if (left < 8) left = 8;

  dropdown.style.top = top + 'px';
  dropdown.style.left = left + 'px';
}

function renderDropdownList() {
  const listEl = document.getElementById('sessionDropdownList');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (dropdownState.filteredSessions.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'session-dropdown-empty';
    emptyEl.textContent = '无匹配会话';
    listEl.appendChild(emptyEl);
    return;
  }

  dropdownState.filteredSessions.forEach((session, index) => {
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

    // 标题
    const titleSpan = document.createElement('span');
    titleSpan.className = 'session-dropdown-item-title';
    titleSpan.textContent = session.title || '新会话';
    item.appendChild(titleSpan);

    // 关闭按钮
    const closeBtn = document.createElement('span');
    closeBtn.className = 'session-dropdown-item-close';
    closeBtn.innerHTML = '&#10005;';
    closeBtn.title = '关闭会话';
    closeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await handleDropdownCloseSession(session.id);
    });
    item.appendChild(closeBtn);

    // 点击切换会话
    item.addEventListener('click', async (e) => {
      e.preventDefault();
      await handleDropdownSelectSession(session.id);
    });

    // 拖拽排序支持
    item.draggable = true;
    item.addEventListener('dragstart', (e) => handleDropdownDragStart(e, session.id));
    item.addEventListener('dragover', (e) => handleDropdownDragOver(e));
    item.addEventListener('dragleave', (e) => handleDropdownDragLeave(e));
    item.addEventListener('drop', (e) => handleDropdownDrop(e, session.id));
    item.addEventListener('dragend', (e) => handleDropdownDragEnd(e));

    listEl.appendChild(item);
  });
}

function filterDropdownSessions(searchText) {
  const allSessions = state.sessions || [];
  if (!searchText.trim()) {
    dropdownState.filteredSessions = [...allSessions];
  } else {
    const lower = searchText.trim().toLowerCase();
    dropdownState.filteredSessions = allSessions.filter(s =>
      (s.title || '新会话').toLowerCase().includes(lower)
    );
  }
  dropdownState.highlightIndex = -1;
  renderDropdownList();
}

async function handleDropdownSelectSession(sessionId) {
  closeDropdown();
  if (sessionId === state.activeSessionId) return;
  await handleSessionSwitch(sessionId);
}

async function handleDropdownCloseSession(sessionId) {
  await deleteSession(sessionId);
  await reloadAfterDelete();
  // 更新下拉过滤列表
  const searchInput = document.getElementById('sessionDropdownSearch');
  const searchText = searchInput ? searchInput.value : '';
  const allSessions = state.sessions || [];
  if (!searchText.trim()) {
    dropdownState.filteredSessions = [...allSessions];
  } else {
    const lower = searchText.trim().toLowerCase();
    dropdownState.filteredSessions = allSessions.filter(s =>
      (s.title || '新会话').toLowerCase().includes(lower)
    );
  }
  dropdownState.highlightIndex = Math.min(dropdownState.highlightIndex, dropdownState.filteredSessions.length - 1);
  renderDropdownList();
}

async function handleCloseAllSessions() {
  const sessions = state.sessions || [];
  if (sessions.length === 0) return;

  // 先关闭下拉面板，避免遮挡确认弹窗
  closeDropdown();

  const confirmed = await showCustomConfirm(
    `确定要关闭全部 ${sessions.length} 个会话吗？此操作不可撤销。`,
    '关闭全部会话'
  );
  if (!confirmed) {
    // 用户取消，重新打开下拉
    openDropdown();
    return;
  }

  // 逐个删除所有会话
  for (const session of sessions) {
    await deleteSession(session.id);
  }
  await reloadAfterDelete();
}

function bindDropdownEvents() {
  const searchInput = document.getElementById('sessionDropdownSearch');
  const closeAllBtn = document.getElementById('sessionDropdownCloseAll');
  const dropdown = document.getElementById('sessionDropdown');

  if (!dropdown) return;

  // 搜索输入
  if (searchInput) {
    const newSearch = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearch, searchInput);
    newSearch.addEventListener('input', (e) => {
      filterDropdownSessions(e.target.value);
    });
    newSearch.addEventListener('keydown', (e) => {
      handleDropdownKeydown(e);
    });
  }

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
  await saveCurrentSession();
  const result = await switchToSession(sessionId);
  if (!result) return;

  const sessionsData = await loadSessions();
  state.sessions = sessionsData.list;
  state.activeSessionId = sessionId;

  const activeSession = sessionsData.list.find(s => s.id === sessionId);
  if (activeSession) {
    state.messageHistory = activeSession.messageHistory || [];
    state.currentModel = activeSession.model || state.currentModel;
    state.useTools = activeSession.useTools !== undefined ? activeSession.useTools : state.useTools;
    // 合并会话的 enabledTools：保留已有选择，自动添加新工具
    if (activeSession.enabledTools && activeSession.enabledTools.length > 0) {
      const validIds = new Set(BUILTIN_TOOLS.map(t => t.id));
      const saved = activeSession.enabledTools.filter(id => validIds.has(id) || id.startsWith('mcp_'));
      const added = BUILTIN_TOOLS.filter(t => t.enabled && !saved.includes(t.id)).map(t => t.id);
      state.enabledTools = [...saved, ...added];
    } else {
      state.enabledTools = activeSession.enabledTools || state.enabledTools;
    }
    state.temperature = activeSession.temperature !== undefined ? activeSession.temperature : state.temperature;
    state.topP = activeSession.topP !== undefined ? activeSession.topP : state.topP;
  }

  // 恢复当前 Agent 的工具限定列表
  if (state.activeAgentId) {
    const agent = await getAgent(state.activeAgentId);
    state.activeAgentToolIds = agent ? agent.toolIds : null;
  } else {
    state.activeAgentToolIds = null;
  }

  document.dispatchEvent(new CustomEvent('session-switched', {
    detail: { sessionId }
  }));

  renderSessionTabs();
  updateUIControls();
  renderAgentSelector();
  
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
  input.focus();
  input.select();

  const cleanup = () => {
    modal.classList.remove('show');
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
    closeBtn.removeEventListener('click', onCancel);
  };

  const onConfirm = () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== session.title) {
      renameSession(session.id, newTitle).then(() => {
        renderSessionTabs();
      });
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

  messageEl.textContent = `确定要删除会话"${session.title}"吗？此操作不可撤销。`;

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
  const renameItem = createMenuItem('重命名', () => {
    menu.remove();
    showRenameModal(session);
  });
  menu.appendChild(renameItem);

  // 删除
  const deleteItem = createMenuItem('删除', () => {
    menu.remove();
    showDeleteModal(session, async () => {
      const sessionsData = await loadSessions();
      state.activeSessionId = sessionsData.activeSessionId;
      state.sessions = sessionsData.list;
      const active = sessionsData.list.find(s => s.id === sessionsData.activeSessionId);
      if (active) {
        state.messageHistory = active.messageHistory || [];
        // 恢复新活跃会话的 Agent 绑定
        state.activeAgentId = active.agentId || null;
      } else {
        state.messageHistory = [];
        state.activeAgentId = null;
      }
      if (state.activeAgentId) {
        const agent = await getAgent(state.activeAgentId);
        state.activeAgentToolIds = agent ? agent.toolIds : null;
      } else {
        state.activeAgentToolIds = null;
      }
      document.dispatchEvent(new CustomEvent('session-switched'));
      renderSessionTabs();
      await renderAgentSelector();
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

function createMenuItem(label, onClick, className = '') {
  const item = document.createElement('div');
  item.className = 'session-context-menu-item ' + className;
  item.textContent = label;
  item.addEventListener('click', onClick);
  return item;
}

// ==================== 删除后状态重载（自动创建新会话） ====================

/**
 * 删除会话后重新加载状态，如果没有活跃会话则自动创建
 */
async function reloadAfterDelete() {
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

  document.dispatchEvent(new CustomEvent('session-switched'));
  renderSessionTabs();
  await renderAgentSelector();
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
