// side_panel/agent-at-selector.js - @ 选择器（输入 @ 快速切换 Agent / 选择网页 / 选择代理）
import state from './state.js';
import { getAllAgents } from './agent-store.js';
import { switchAgent, openAgentEditor, deleteAgentWithConfirm } from './agent-manager.js';
import { escapeHtml } from './utils.js';
import { adjustInputHeight } from './utils.js';
import { getOpenTabs, renderPageList, updatePageSelection, selectPage } from './page-selector.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  promptSelector: {
    noMatchAgent: '没有匹配的 Agent',
    inheritGlobal: '继承全局设置',
    editAgentTitle: '编辑此 Agent',
    deleteAgentTitle: '删除此 Agent',
    noMatchProxy: '没有匹配的代理',
    unnamedProxy: '未命名代理',
    enableTitle: '启用此代理',
    disableTitle: '禁用此代理',
    noMatchAll: '没有匹配的 Agent、网页或代理',
    noTitle: '无标题',
    proxyAddress: '代理地址',
    deleteProxyTitle: '删除此代理',
    confirmDeleteProxy: '确定要删除此代理吗？',
  },
});
registerTranslations('en', {
  promptSelector: {
    noMatchAgent: 'No matching agent',
    inheritGlobal: 'Inherit global settings',
    editAgentTitle: 'Edit this agent',
    deleteAgentTitle: 'Delete this agent',
    noMatchProxy: 'No matching proxy',
    unnamedProxy: 'Unnamed proxy',
    enableTitle: 'Enable this proxy',
    disableTitle: 'Disable this proxy',
    noMatchAll: 'No matching agent, page or proxy',
    noTitle: 'Untitled',
    proxyAddress: 'Proxy address',
    deleteProxyTitle: 'Delete this proxy',
    confirmDeleteProxy: 'Are you sure you want to delete this proxy?',
  },
});

// 当前 @ 弹出框激活的 Tab：'pages' | 'agents' | 'proxies'
export let activeAtTab = 'pages';

async function getPairedAgents() {
  try {
    const result = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = result.pairedAgents || [];
    return agents.map(a => ({
      ...a,
      isActive: a.id === result.activeAgentId,
      isDisabled: !!a.disabled
    }));
  } catch {
    return [];
  }
}

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

  // 异步更新 Tab 标题的选项数量（不阻塞弹窗显示）
  updateAtTabCounts();
}

/**
 * 更新 @ 选择器 Tab 标题的选项数量
 */
async function updateAtTabCounts() {
  try {
    const [allAgents, allTabs, allProxies] = await Promise.all([getAllAgents(), getOpenTabs(), getPairedAgents()]);
    const agentsTab = document.querySelector('#agentAtTabs .prompt-tab[data-tab="agents"]');
    const pagesTab = document.querySelector('#agentAtTabs .prompt-tab[data-tab="pages"]');
    const proxiesTab = document.querySelector('#agentAtTabs .prompt-tab[data-tab="proxies"]');
    if (agentsTab) agentsTab.textContent = t('promptSelector.agentsCount', { count: allAgents.length });
    if (pagesTab) pagesTab.textContent = t('promptSelector.pagesCount', { count: allTabs.length });
    if (proxiesTab) {
      proxiesTab.textContent = t('promptSelector.proxiesCount', { count: allProxies.length });
      proxiesTab.style.display = allProxies.length > 0 ? '' : 'none';
    }
  } catch {
    // 获取失败则保持默认标题
  }
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
  state.selectedProxyAtIndex = -1;
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

  // ✚ 按钮、编辑按钮和删除按钮：通过事件委托绑定在 dropdown 上
  dropdown.addEventListener('click', async (e) => {
    const addBtn = e.target.closest('#agentAddBtn');
    if (addBtn) {
      e.stopPropagation();
      hideAgentAtSelector();
      openAgentEditor(null);
      return;
    }

    const proxyAddBtn = e.target.closest('#proxyAddBtn');
    if (proxyAddBtn) {
      e.stopPropagation();
      hideAgentAtSelector();
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE', hash: 'agent' });
      return;
    }

    const editBtn = e.target.closest('.agent-edit-btn');
    if (editBtn) {
      e.stopPropagation();
      const agentId = editBtn.dataset.agentId;
      hideAgentAtSelector();
      openAgentEditor(agentId);
      return;
    }

    const deleteBtn = e.target.closest('.agent-delete-btn');
    if (deleteBtn) {
      e.stopPropagation();
      const agentId = deleteBtn.dataset.agentId;
      const deleted = await deleteAgentWithConfirm(agentId);
      if (deleted) {
        // 删除成功后刷新当前 @ 列表
        const userInput = document.getElementById('userInput');
        const filterText = userInput ? getAtFilterText(userInput.value) : '';
        await renderActiveAtList(filterText);
      }
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
  const agentProxyList = document.getElementById('agentProxyList');
  if (agentAtList) agentAtList.style.display = tab === 'agents' ? '' : 'none';
  if (agentPageList) agentPageList.style.display = tab === 'pages' ? '' : 'none';
  if (agentProxyList) agentProxyList.style.display = tab === 'proxies' ? '' : 'none';

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
  const agentProxyList = document.getElementById('agentProxyList');

  if (filterText) {
    // 搜索模式：隐藏 Tab，合并展示
    isMergedMode = true;
    if (tabsContainer) tabsContainer.style.display = 'none';
    if (agentPageList) agentPageList.style.display = 'none';
    if (agentProxyList) agentProxyList.style.display = 'none';
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
    if (agentProxyList) agentProxyList.style.display = activeAtTab === 'proxies' ? '' : 'none';

    const dropdown = document.getElementById('agentAtDropdown');
    if (dropdown) dropdown.setAttribute('data-active-tab', activeAtTab);

    if (activeAtTab === 'pages') {
      await renderPageList('');
    } else if (activeAtTab === 'proxies') {
      await renderProxyAtList('');
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
    agentAtList.innerHTML = `<div class="prompt-empty">${t('promptSelector.noMatchAgent')}</div>`;
    state.selectedAgentAtIndex = -1;
    return;
  }

  state.selectedAgentAtIndex = 0;

  agentAtList.innerHTML = filteredAgents.map((agent, index) => {
    const isActive = agent.id === state.activeAgentId || (!state.activeAgentId && agent.id === 'default');
    const toolCount = agent.toolIds ? agent.toolIds.length : (agent.toolIds === null ? null : 0);
    const toolLabel = toolCount === null ? t('promptSelector.inheritGlobal') : t('promptSelector.toolCount', { count: toolCount });
    return `
      <div class="prompt-item ${index === 0 ? 'selected' : ''} ${isActive ? 'agent-at-active' : ''}"
           data-index="${index}" data-agent-id="${escapeHtml(agent.id)}">
        <span class="prompt-item-index">${index + 1}</span>
        <span class="agent-at-icon">${escapeHtml(agent.icon)}</span>
        <span class="prompt-item-content">${escapeHtml(agent.name)}</span>
        <span class="prompt-item-code">${escapeHtml(agent.description || toolLabel)}</span>
        <span class="agent-item-actions">
          <span class="agent-active-mark" style="${isActive ? '' : 'display:none'}">✓</span>
          <span class="agent-edit-btn" data-agent-id="${escapeHtml(agent.id)}" title="${t('promptSelector.editAgentTitle')}">✎</span>
          ${!agent.isBuiltin ? `<span class="agent-delete-btn" data-agent-id="${escapeHtml(agent.id)}" title="${t('promptSelector.deleteAgentTitle')}">✕</span>` : ''}
        </span>
      </div>
    `;
  }).join('');

  agentAtList.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (e.target.closest('.agent-edit-btn')) return;
      if (e.target.closest('.agent-delete-btn')) return;
      await selectAgentByAt(item.dataset.agentId);
    });
  });
}

/**
 * Ping 代理检查在线状态
 */
async function pingAgent(proxy) {
  if (!proxy?.url) return { online: false };
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${proxy.url}/api/status`, { signal: controller.signal });
    if (!res.ok) return { online: false };
    const data = await res.json();
    return {
      online: true,
      version: data.version || null,
      platformName: data.platformName || data.platform || null,
      arch: data.arch || null
    };
  } catch {
    return { online: false };
  }
}

/**
 * 渲染代理列表（单独 Tab）
 */
async function renderProxyAtList(filterText = '') {
  const agentProxyList = document.getElementById('agentProxyList');
  if (!agentProxyList) return;

  const allProxies = await getPairedAgents();
  const filterLower = (filterText || '').toLowerCase();

  const filteredProxies = allProxies.filter(proxy => {
    if (!filterText) return true;
    return proxy.name.toLowerCase().includes(filterLower) ||
           (proxy.url && proxy.url.toLowerCase().includes(filterLower));
  });

  if (filteredProxies.length === 0) {
    agentProxyList.innerHTML = `<div class="prompt-empty">${t('promptSelector.noMatchProxy')}</div>`;
    state.selectedProxyAtIndex = -1;
    return;
  }

  state.selectedProxyAtIndex = 0;

  const proxiesWithStatus = await Promise.all(
    filteredProxies.map(async (proxy) => {
      const pingResult = await pingAgent(proxy);
      const version = pingResult.version || state.agentVersions.get(proxy.id);
      const sysInfo = pingResult.platformName || state.agentSystemInfos.get(proxy.id);
      return { ...proxy, online: pingResult.online, version, sysInfo };
    })
  );

  agentProxyList.innerHTML = proxiesWithStatus.map((proxy, index) => {
    const isActive = proxy.isActive;
    const isDisabled = proxy.isDisabled;
    const isOnline = proxy.online;

    let dotClass;
    if (isDisabled) {
      dotClass = 'disabled';
    } else if (isActive) {
      dotClass = isOnline ? 'connected' : 'disconnected';
    } else {
      dotClass = isOnline ? 'online' : 'offline';
    }

    const displayName = proxy.name || t('promptSelector.unnamedProxy');

    return `
      <div class="prompt-item ${index === 0 ? 'selected' : ''} ${isActive ? 'agent-at-active' : ''} ${isDisabled ? 'agent-disabled' : ''} prompt-item-proxy"
           data-index="${index}" data-proxy-id="${escapeHtml(proxy.id)}">
        <span class="prompt-item-index">${index + 1}</span>
        <span class="agent-at-dot agent-at-dot-${dotClass}"></span>
        <span class="prompt-item-content">${escapeHtml(displayName)}</span>
        <span class="prompt-item-code" title="${escapeHtml(proxy.url || '')}">${escapeHtml(proxy.url || '')}</span>
        <span class="agent-item-actions">
          ${isActive ? '<span class="agent-active-mark">✓</span>' : ''}
        </span>
        ${isDisabled
          ? `<span class="proxy-enable-btn" data-action="enable" data-id="${escapeHtml(proxy.id)}" title="${t('promptSelector.enableTitle')}">▶</span>`
          : `<span class="proxy-disable-btn" data-action="disable" data-id="${escapeHtml(proxy.id)}" title="${t('promptSelector.disableTitle')}">⏸</span>`
        }
        <span class="proxy-delete-btn" data-action="delete" data-id="${escapeHtml(proxy.id)}" title="${t('common.delete')}">✕</span>
      </div>
    `;
  }).join('');

  agentProxyList.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      const toolbarBtn = e.target.closest('.proxy-disable-btn, .proxy-delete-btn, .proxy-enable-btn');
      if (toolbarBtn) {
        e.stopPropagation();
        await handleProxyToolbarAction(toolbarBtn.dataset.action, toolbarBtn.dataset.id);
        return;
      }
      await selectProxyByAt(item.dataset.proxyId);
    });
  });
}

/**
 * 渲染合并列表（助手 + 网页 + 代理，搜索模式下使用）
 */
async function renderMergedAtList(filterText = '') {
  const agentAtList = document.getElementById('agentAtList');
  if (!agentAtList) return;

  const filterLower = filterText.toLowerCase();

  const [allAgents, allTabs, allProxies] = await Promise.all([getAllAgents(), getOpenTabs(), getPairedAgents()]);

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

  const filteredProxies = allProxies.filter(proxy => {
    return proxy.name.toLowerCase().includes(filterLower) ||
           (proxy.url && proxy.url.toLowerCase().includes(filterLower));
  });

  const totalCount = filteredAgents.length + filteredTabs.length + filteredProxies.length;

  if (totalCount === 0) {
    agentAtList.innerHTML = `<div class="prompt-empty">${t('promptSelector.noMatchAll')}</div>`;
    state.selectedAgentAtIndex = -1;
    return;
  }

  state.selectedAgentAtIndex = 0;

  let html = '';
  let globalIndex = 0;

  filteredAgents.forEach((agent) => {
    const isActive = agent.id === state.activeAgentId || (!state.activeAgentId && agent.id === 'default');
    const toolCount = agent.toolIds ? agent.toolIds.length : (agent.toolIds === null ? null : 0);
    const toolLabel = toolCount === null ? t('promptSelector.inheritGlobal') : t('promptSelector.toolCount', { count: toolCount });
    html += `
      <div class="prompt-item${globalIndex === 0 ? ' selected' : ''}${isActive ? ' agent-at-active' : ''}"
           data-index="${globalIndex}" data-type="agent" data-agent-id="${escapeHtml(agent.id)}">
        <span class="prompt-item-index">${globalIndex + 1}</span>
        <span class="agent-at-icon">${escapeHtml(agent.icon)}</span>
        <span class="prompt-item-content">${escapeHtml(agent.name)}</span>
        <span class="prompt-item-code">${escapeHtml(agent.description || toolLabel)}</span>
        <span class="agent-item-actions">
          <span class="agent-active-mark" style="${isActive ? '' : 'display:none'}">✓</span>
          <span class="agent-edit-btn" data-agent-id="${escapeHtml(agent.id)}" title="${t('promptSelector.editAgentTitle')}">✎</span>
          ${!agent.isBuiltin ? `<span class="agent-delete-btn" data-agent-id="${escapeHtml(agent.id)}" title="${t('promptSelector.deleteAgentTitle')}">✕</span>` : ''}
        </span>
      </div>`;
    globalIndex++;
  });

  const currentSelectedPageId = state.selectedPage ? state.selectedPage.id : null;

  filteredTabs.forEach((tab) => {
    const title = tab.title || t('promptSelector.noTitle');
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

  const proxiesWithStatus = await Promise.all(
    filteredProxies.map(async (proxy) => {
      const pingResult = await pingAgent(proxy);
      return { ...proxy, online: pingResult.online };
    })
  );

  proxiesWithStatus.forEach((proxy) => {
    const isActive = proxy.isActive;
    const isDisabled = proxy.isDisabled;
    const isOnline = proxy.online;

    let dotClass;
    if (isDisabled) {
      dotClass = 'disabled';
    } else if (isActive) {
      dotClass = isOnline ? 'connected' : 'disconnected';
    } else {
      dotClass = isOnline ? 'online' : 'offline';
    }

    const displayName = proxy.name || t('promptSelector.unnamedProxy');

    html += `
      <div class="prompt-item${globalIndex === 0 && filteredAgents.length === 0 && filteredTabs.length === 0 ? ' selected' : ''}${isActive ? ' agent-at-active' : ''}${isDisabled ? ' agent-disabled' : ''} prompt-item-proxy"
           data-index="${globalIndex}" data-type="proxy" data-proxy-id="${escapeHtml(proxy.id)}">
        <span class="prompt-item-index">${globalIndex + 1}</span>
        <span class="agent-at-dot agent-at-dot-${dotClass}"></span>
        <span class="prompt-item-content">${escapeHtml(displayName)}</span>
        <span class="prompt-item-code" title="${escapeHtml(proxy.url || '')}">${escapeHtml(proxy.url || '')}</span>
        ${isActive ? '<span class="agent-item-actions"><span class="agent-active-mark">✓</span></span>' : ''}
        ${isDisabled
          ? `<span class="proxy-enable-btn" data-action="enable" data-id="${escapeHtml(proxy.id)}" title="${t('promptSelector.enableTitle')}">▶</span>`
          : `<span class="proxy-disable-btn" data-action="disable" data-id="${escapeHtml(proxy.id)}" title="${t('promptSelector.disableTitle')}">⏸</span>`
        }
        <span class="proxy-delete-btn" data-action="delete" data-id="${escapeHtml(proxy.id)}" title="${t('common.delete')}">✕</span>
      </div>`;
    globalIndex++;
  });

  agentAtList.innerHTML = html;

  agentAtList.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      const toolbarBtn = e.target.closest('.proxy-disable-btn, .proxy-delete-btn, .proxy-enable-btn');
      if (toolbarBtn) {
        e.stopPropagation();
        await handleProxyToolbarAction(toolbarBtn.dataset.action, toolbarBtn.dataset.id);
        return;
      }
      if (e.target.closest('.agent-edit-btn')) return;
      if (e.target.closest('.agent-delete-btn')) return;
      const type = item.dataset.type;
      if (type === 'agent') {
        await selectAgentByAt(item.dataset.agentId);
      } else if (type === 'page') {
        selectPageByAt(parseInt(item.dataset.tabId));
      } else if (type === 'proxy') {
        await selectProxyByAt(item.dataset.proxyId);
      }
    });
  });
}

/**
 * 更新 @列表选中状态
 */
export function updateAgentAtSelection(items) {
  let selectedIndex;
  if (activeAtTab === 'proxies') {
    selectedIndex = state.selectedProxyAtIndex;
  } else {
    selectedIndex = state.selectedAgentAtIndex;
  }
  items.forEach((item, index) => {
    if (index === selectedIndex) {
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
      logger.error('[AgentAtSelector] getlabelpageinfo failed:', chrome.runtime.lastError);
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

/**
 * 通过 @ 选择代理
 */
async function selectProxyByAt(proxyId) {
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

  try {
    await chrome.storage.local.set({ activeAgentId: proxyId });
    chrome.runtime.sendMessage({ type: 'AGENT_CONNECTION_CHANGED', connected: true, agentId: proxyId });
    logger.debug('[AgentAtSelector] switched to agent:', proxyId);
  } catch (err) {
    logger.error('[AgentAtSelector] switchagent failed:', err);
  }

  adjustInputHeight();
}

/**
 * 处理代理工具栏操作（停用/启用/删除）
 */
async function handleProxyToolbarAction(action, agentId) {
  const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
  let agents = storage.pairedAgents || [];

  switch (action) {
    case 'enable': {
      agents = agents.map(a => a.id === agentId ? { ...a, disabled: false } : a);
      await chrome.storage.local.set({ pairedAgents: agents });
      break;
    }
    case 'disable': {
      agents = agents.map(a => a.id === agentId ? { ...a, disabled: true } : a);
      let newActiveId = storage.activeAgentId;
      if (storage.activeAgentId === agentId) {
        const nextActive = agents.find(a => a.id !== agentId && !a.disabled);
        newActiveId = nextActive?.id || null;
      }
      await chrome.storage.local.set({ pairedAgents: agents, activeAgentId: newActiveId || '' });
      if (newActiveId) {
        chrome.runtime.sendMessage({ type: 'AGENT_CONNECTION_CHANGED', connected: true, agentId: newActiveId });
      } else {
        chrome.runtime.sendMessage({ type: 'AGENT_CONNECTION_CHANGED', connected: false });
      }
      break;
    }
    case 'delete': {
      const agent = agents.find(a => a.id === agentId);
      const urlInfo = agent?.url ? `\n${t('promptSelector.proxyAddress')}: ${agent.url}` : '';
      const confirmed = await window.showCustomConfirm(
        t('promptSelector.deleteProxyTitle'),
        t('promptSelector.confirmDeleteProxy', { name: agent?.name || agentId, urlInfo })
      );
      if (!confirmed) return;
      agents = agents.filter(a => a.id !== agentId);
      const newActive = storage.activeAgentId === agentId
        ? (agents.find(a => !a.disabled)?.id || null)
        : storage.activeAgentId;
      await chrome.storage.local.set({ pairedAgents: agents, activeAgentId: newActive || '' });
      if (newActive) {
        chrome.runtime.sendMessage({ type: 'AGENT_CONNECTION_CHANGED', connected: true, agentId: newActive });
      } else {
        chrome.runtime.sendMessage({ type: 'AGENT_CONNECTION_CHANGED', connected: false });
      }
      break;
    }
  }

  // 刷新列表并重置选中索引
  const userInput = document.getElementById('userInput');
  const filterText = userInput ? getAtFilterText(userInput.value) : '';
  await renderActiveAtList(filterText);
}
