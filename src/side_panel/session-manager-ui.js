// session-manager-ui.js - 会话标签栏 UI 组件
// 本模块不与 chat-manager.js 产生循环依赖，通过 DOM 事件通知上层

import state from './state.js';
import {
  createSession,
  switchToSession,
  deleteSession,
  renameSession,
  loadSessions,
  saveCurrentSession
} from './session-manager.js';

/**
 * 渲染会话标签栏（纯标签栏，不涉及消息区域）
 */
export async function renderSessionTabs() {
  const sessionsData = await loadSessions();
  state.sessions = sessionsData.list;
  state.activeSessionId = sessionsData.activeSessionId;

  const tabsContainer = document.getElementById('sessionTabs');
  const scrollContainer = document.getElementById('sessionTabsScroll');
  const addWrapper = document.getElementById('sessionTabsAddWrapper');
  if (!tabsContainer || !scrollContainer || !addWrapper) return;

  scrollContainer.innerHTML = '';
  addWrapper.innerHTML = '';

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
        const sessionsData = await loadSessions();
        state.activeSessionId = sessionsData.activeSessionId;
        state.sessions = sessionsData.list;
        const active = sessionsData.list.find(s => s.id === sessionsData.activeSessionId);
        if (active) {
          state.messageHistory = active.messageHistory || [];
        } else {
          state.messageHistory = [];
        }
        document.dispatchEvent(new CustomEvent('session-switched'));
        renderSessionTabs();
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

    scrollContainer.appendChild(tab);
  });

  // 新建按钮（固定在右侧）
  const addBtn = document.createElement('div');
  addBtn.className = 'session-tab-add';
  addBtn.title = '新建会话';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', async () => {
    await saveCurrentSession();
    const newSession = await createSession();
    state.activeSessionId = newSession.id;
    state.messageHistory = [];
    document.dispatchEvent(new CustomEvent('session-switched', {
      detail: { sessionId: newSession.id }
    }));
    renderSessionTabs();
  });
  addWrapper.appendChild(addBtn);

  // 鼠标滚轮水平滚动支持
  bindWheelScroll(scrollContainer);
}

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
    state.enabledTools = activeSession.enabledTools || state.enabledTools;
    state.temperature = activeSession.temperature !== undefined ? activeSession.temperature : state.temperature;
    state.topP = activeSession.topP !== undefined ? activeSession.topP : state.topP;
  }

  document.dispatchEvent(new CustomEvent('session-switched', {
    detail: { sessionId }
  }));

  renderSessionTabs();
  updateUIControls();

  // 滚动到当前活跃标签
  setTimeout(() => {
    const activeTab = document.querySelector('.session-tab.active');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, 50);
}

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

// 鼠标滚轮水平滚动支持
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
      } else {
        state.messageHistory = [];
      }
      document.dispatchEvent(new CustomEvent('session-switched'));
      renderSessionTabs();
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
