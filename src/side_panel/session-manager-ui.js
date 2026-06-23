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
  if (!tabsContainer) return;

  tabsContainer.innerHTML = '';

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

    if (session.isGenerating) {
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

    tabsContainer.appendChild(tab);
  });

  // 新建按钮
  const addBtn = document.createElement('div');
  addBtn.className = 'session-tab-add';
  addBtn.title = '新建会话';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', async () => {
    await saveCurrentSession();
    const newSession = await createSession();
    state.activeSessionId = newSession.id;
    state.messageHistory = [];
    // 通知上层重建消息区域
    document.dispatchEvent(new CustomEvent('session-switched', {
      detail: { sessionId: newSession.id }
    }));
    renderSessionTabs();
  });
  tabsContainer.appendChild(addBtn);
}

/**
 * 处理会话切换
 */
async function handleSessionSwitch(sessionId) {
  await saveCurrentSession();
  const result = await switchToSession(sessionId);
  if (!result) return;

  // 更新内存中的状态
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

  // 通知上层重建消息区域
  document.dispatchEvent(new CustomEvent('session-switched', {
    detail: { sessionId }
  }));

  renderSessionTabs();
  updateUIControls();
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

  const renameItem = createMenuItem('重命名', () => {
    const newTitle = prompt('请输入新名称:', session.title);
    if (newTitle && newTitle.trim()) {
      renameSession(session.id, newTitle.trim()).then(() => {
        renderSessionTabs();
      });
    }
    menu.remove();
  });
  menu.appendChild(renameItem);

  if (session.id !== state.activeSessionId) {
    const deleteItem = createMenuItem('删除', () => {
      if (confirm('确定要删除会话 "' + session.title + '" 吗？此操作不可撤销。')) {
        deleteSession(session.id).then(async () => {
          if (session.id === state.activeSessionId) {
            // 不会发生此情况，因为当前活跃会话不能删除
          }
          // 重新加载以获取最新的 activeSessionId
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
      }
      menu.remove();
    }, 'danger');
    menu.appendChild(deleteItem);
  }

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
