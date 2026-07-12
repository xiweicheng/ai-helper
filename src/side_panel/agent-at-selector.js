// side_panel/agent-at-selector.js - @ 选择器（输入 @ 快速切换 Agent / 选择网页）
import state from './state.js';
import { getAllAgents } from './agent-store.js';
import { switchAgent, openAgentEditor } from './agent-manager.js';
import { escapeHtml } from './utils.js';
import { adjustInputHeight } from './utils.js';
import { getOpenTabs, renderPageList, updatePageSelection, selectPage } from './page-selector.js';

// 当前 @ 弹出框激活的 Tab：'agents' | 'pages'
export let activeAtTab = 'agents';

// 当前是否处于搜索合并模式
let isMergedMode = false;

/**
 * 显示 Agent/网页 @选择器
 */
export async function showAgentAtSelector(filterText = '') {
  const agentAtSelector = document.getElementById('agentAtSelector');
  const agentAtDropdown = document.getElementById('agentAtDropdown');

  agentAtSelector.style.display = 'block';
  agentAtDropdown.classList.add('show');

  // 初始化事件（Tab 切换 + ✚ 按钮 + 编辑按钮）
  initAtEvents();

  // 根据是否有过滤文本决定展示模式
  await renderActiveAtList(filterText);
}

/**
 * 隐藏 @选择器
 */
export function hideAgentAtSelector() {
  const agentAtSelector = document.getElementById('agentAtSelector');
  const agentAtDropdown = document.getElementById('agentAtDropdown');

  agentAtSelector.style.display = 'none';
  agentAtDropdown.classList.remove('show');
  state.selectedAgentAtIndex = -1;
  state.selectedPageIndex = -1;
}

/**
 * 初始化 @ 弹出框事件（仅首次）
 */
function initAtEvents() {
  const dropdown = document.getElementById('agentAtDropdown');
  if (!dropdown || dropdown.dataset.initialized) return;
  dropdown.dataset.initialized = '1';

  // Tab 切换事件
  const tabsContainer = document.getElementById('agentAtTabs');
  if (tabsContainer) {
    tabsContainer.querySelectorAll('.prompt-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        switchAtTab(tab.dataset.tab);
      });
    });
  }

  // ✚ 按钮和编辑按钮：通过事件委托绑定在 dropdown 上
  dropdown.addEventListener('click', (e) => {
    const addBtn = e.target.closest('#agentAddBtn');
    if (addBtn) {
      e.stopPropagation();
      hideAgentAtSelector();
      openAgentEditor(null);
      return;
    }

    const editBtn = e.target.closest('.agent-edit-btn');
    if (editBtn) {
      e.stopPropagation();
      const agentId = editBtn.dataset.agentId;
      hideAgentAtSelector();
      openAgentEditor(agentId);
    }
  });
}

/**
 * 切换 Tab（仅在非搜索模式下有效）
 */
export async function switchAtTab(tab) {
  activeAtTab = tab;

  const tabsContainer = document.getElementById('agentAtTabs');
  if (tabsContainer) {
    tabsContainer.querySelectorAll('.prompt-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
  }

  const agentAtList = document.getElementById('agentAtList');
  const agentPageList = document.getElementById('agentPageList');
  if (agentAtList) agentAtList.style.display = tab === 'agents' ? '' : 'none';
  if (agentPageList) agentPageList.style.display = tab === 'pages' ? '' : 'none';

  // 通过 CSS 类控制 ✚ 按钮显示（仅在助手 Tab 显示）
  const dropdown = document.getElementById('agentAtDropdown');
  if (dropdown) dropdown.setAttribute('data-active-tab', tab);

  // 保持焦点在输入框
  const userInput = document.getElementById('userInput');
  if (userInput) userInput.focus();

  const filterText = userInput ? getAtFilterText(userInput.value) : '';
  await renderActiveAtList(filterText);
}

/**
 * 根据是否有搜索文本决定渲染模式
 */
async function renderActiveAtList(filterText = '') {
  const tabsContainer = document.getElementById('agentAtTabs');
  const agentPageList = document.getElementById('agentPageList');
  const agentAtList = document.getElementById('agentAtList');

  if (filterText) {
    // 搜索模式：隐藏 Tab，合并展示
    isMergedMode = true;
    if (tabsContainer) tabsContainer.style.display = 'none';
    if (agentPageList) agentPageList.style.display = 'none';
    if (agentAtList) agentAtList.style.display = '';
    await renderMergedAtList(filterText);
    // ✚ 按钮在搜索模式下也隐藏
    const dropdown = document.getElementById('agentAtDropdown');
    if (dropdown) dropdown.setAttribute('data-active-tab', 'merged');
  } else {
    // 默认 Tab 模式
    isMergedMode = false;
    if (tabsContainer) tabsContainer.style.display = '';
    // 恢复 Tab 激活状态
    if (tabsContainer) {
      tabsContainer.querySelectorAll('.prompt-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === activeAtTab);
      });
    }
    if (agentPageList) agentPageList.style.display = activeAtTab === 'pages' ? '' : 'none';
    if (agentAtList) agentAtList.style.display = activeAtTab === 'agents' ? '' : 'none';

    const dropdown = document.getElementById('agentAtDropdown');
    if (dropdown) dropdown.setAttribute('data-active-tab', activeAtTab);

    if (activeAtTab === 'pages') {
      await renderPageList('');
    } else {
      await renderAgentAtList('');
    }
  }
}

/**
 * 获取 @ 后面的过滤文本
 */
function getAtFilterText(value) {
  const lastAtIndex = value.lastIndexOf('@');
  if (lastAtIndex === -1) return '';
  return value.substring(lastAtIndex + 1);
}

/**
 * 渲染 Agent 列表（单独 Tab）
 */
async function renderAgentAtList(filterText = '') {
  const agentAtList = document.getElementById('agentAtList');
  if (!agentAtList) return;

  const allAgents = await getAllAgents();
  const filterLower = (filterText || '').toLowerCase();

  const filteredAgents = allAgents.filter(agent => {
    if (!filterText) return true;
    return agent.name.toLowerCase().includes(filterLower) ||
           (agent.description && agent.description.toLowerCase().includes(filterLower));
  });

  if (filteredAgents.length === 0) {
    agentAtList.innerHTML = '<div class="prompt-empty">暂无匹配的助手</div>';
    state.selectedAgentAtIndex = -1;
    return;
  }

  state.selectedAgentAtIndex = 0;

  agentAtList.innerHTML = filteredAgents.map((agent, index) => {
    const isActive = agent.id === state.activeAgentId || (!state.activeAgentId && agent.id === 'default');
    const toolCount = agent.toolIds ? agent.toolIds.length : (agent.toolIds === null ? '全局' : 0);
    const toolLabel = typeof toolCount === 'number' ? `${toolCount} 个工具` : '继承全局工具';
    return `
      <div class="prompt-item ${index === 0 ? 'selected' : ''} ${isActive ? 'agent-at-active' : ''}"
           data-index="${index}" data-agent-id="${escapeHtml(agent.id)}">
        <span class="prompt-item-index">${index + 1}</span>
        <span class="agent-at-icon">${escapeHtml(agent.icon)}</span>
        <span class="prompt-item-content">${escapeHtml(agent.name)}</span>
        <span class="prompt-item-code">${escapeHtml(agent.description || toolLabel)}</span>
        <span class="agent-item-actions">
          <span class="agent-active-mark" style="${isActive ? '' : 'display:none'}">✓</span>
          <span class="agent-edit-btn" data-agent-id="${escapeHtml(agent.id)}" title="编辑助手">✎</span>
        </span>
      </div>
    `;
  }).join('');

  agentAtList.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (e.target.closest('.agent-edit-btn')) return;
      await selectAgentByAt(item.dataset.agentId);
    });
  });
}

/**
 * 渲染合并列表（助手 + 网页，搜索模式下使用）
 */
async function renderMergedAtList(filterText = '') {
  const agentAtList = document.getElementById('agentAtList');
  if (!agentAtList) return;

  const filterLower = filterText.toLowerCase();

  const [allAgents, allTabs] = await Promise.all([getAllAgents(), getOpenTabs()]);

  const filteredAgents = allAgents.filter(agent => {
    return agent.name.toLowerCase().includes(filterLower) ||
           (agent.description && agent.description.toLowerCase().includes(filterLower));
  });

  const filteredTabs = allTabs.filter(tab => {
    if (!tab.url) return false;
    const titleMatch = (tab.title || '').toLowerCase().includes(filterLower);
    const urlMatch = tab.url.toLowerCase().includes(filterLower);
    return titleMatch || urlMatch;
  });

  const totalCount = filteredAgents.length + filteredTabs.length;

  if (totalCount === 0) {
    agentAtList.innerHTML = '<div class="prompt-empty">暂无匹配的助手或网页</div>';
    state.selectedAgentAtIndex = -1;
    return;
  }

  state.selectedAgentAtIndex = 0;

  let html = '';
  let globalIndex = 0;

  filteredAgents.forEach((agent) => {
    const isActive = agent.id === state.activeAgentId || (!state.activeAgentId && agent.id === 'default');
    const toolCount = agent.toolIds ? agent.toolIds.length : (agent.toolIds === null ? '全局' : 0);
    const toolLabel = typeof toolCount === 'number' ? `${toolCount} 个工具` : '继承全局工具';
    html += `
      <div class="prompt-item${globalIndex === 0 ? ' selected' : ''}${isActive ? ' agent-at-active' : ''}"
           data-index="${globalIndex}" data-type="agent" data-agent-id="${escapeHtml(agent.id)}">
        <span class="prompt-item-index">${globalIndex + 1}</span>
        <span class="agent-at-icon">${escapeHtml(agent.icon)}</span>
        <span class="prompt-item-content">${escapeHtml(agent.name)}</span>
        <span class="prompt-item-code">${escapeHtml(agent.description || toolLabel)}</span>
        <span class="agent-item-actions">
          <span class="agent-active-mark" style="${isActive ? '' : 'display:none'}">✓</span>
          <span class="agent-edit-btn" data-agent-id="${escapeHtml(agent.id)}" title="编辑助手">✎</span>
        </span>
      </div>`;
    globalIndex++;
  });

  const currentSelectedPageId = state.selectedPage ? state.selectedPage.id : null;

  filteredTabs.forEach((tab) => {
    const title = tab.title || '无标题';
    const url = tab.url || '';
    const favIcon = tab.favIconUrl
      ? `<img src="${escapeHtml(tab.favIconUrl)}" width="16" height="16" style="flex-shrink:0;" onerror="this.style.display='none'">`
      : '<span style="font-size:14px;flex-shrink:0;">🌐</span>';
    const isPageSelected = tab.id === currentSelectedPageId;

    html += `
      <div class="prompt-item"
           data-index="${globalIndex}" data-type="page" data-tab-id="${tab.id}">
        <span class="prompt-item-index">${globalIndex + 1}</span>
        ${favIcon}
        <span class="prompt-item-content" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        <span class="prompt-item-code" title="${escapeHtml(url)}">${escapeHtml(url)}</span>
        ${isPageSelected ? `<span class="page-item-actions"><span class="page-selected-mark">✓</span></span>` : ''}
      </div>`;
    globalIndex++;
  });

  agentAtList.innerHTML = html;

  agentAtList.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (e.target.closest('.agent-edit-btn')) return;
      const type = item.dataset.type;
      if (type === 'agent') {
        await selectAgentByAt(item.dataset.agentId);
      } else if (type === 'page') {
        selectPageByAt(parseInt(item.dataset.tabId));
      }
    });
  });
}

/**
 * 更新 @列表选中状态
 */
export function updateAgentAtSelection(items) {
  items.forEach((item, index) => {
    if (index === state.selectedAgentAtIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

/**
 * 通过 @ 选择 Agent
 */
async function selectAgentByAt(agentId) {
  const userInput = document.getElementById('userInput');
  const value = userInput.value;
  const lastAtIndex = value.lastIndexOf('@');

  if (lastAtIndex !== -1) {
    const newValue = value.substring(0, lastAtIndex);
    userInput.value = newValue;
    userInput.focus();
    userInput.selectionStart = userInput.selectionEnd = newValue.length;
  }

  hideAgentAtSelector();
  await switchAgent(agentId);
  adjustInputHeight();
}

/**
 * 通过 @ 选择网页
 */
function selectPageByAt(tabId) {
  const userInput = document.getElementById('userInput');
  const value = userInput ? userInput.value : '';
  const lastAtIndex = value.lastIndexOf('@');

  if (lastAtIndex !== -1) {
    const newValue = value.substring(0, lastAtIndex);
    userInput.value = newValue;
    userInput.focus();
    userInput.selectionStart = userInput.selectionEnd = newValue.length;
  }

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      console.error('[AgentAtSelector] 获取标签页信息失败:', chrome.runtime.lastError);
      return;
    }
    selectPage(tab);
    hideAgentAtSelector();
    const input = document.getElementById('userInput');
    if (input) {
      input.focus();
      adjustInputHeight();
    }
  });
}
