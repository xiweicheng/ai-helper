// side_panel/agent-at-selector.js - @ 选择器（输入 @ 快速切换 Agent / 选择网页 / 选择代理）
import state from './state.js';
import { getAllAgents } from './agent-store.js';
import { switchAgent, openAgentEditor, deleteAgentWithConfirm } from './agent-manager.js';
import { escapeHtml, updateDropdownPosition } from './utils.js';
import { adjustInputHeight } from './utils.js';
import { getOpenTabs, renderPageList, updatePageSelection, selectPage, handlePageAction } from './page-selector.js';
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
  knowledgeSelector: {
    disabled: '知识库检索已关闭（可在设置页「知识库」中开启）',
    notAvailable: '知识库不可用（请确认代理已连接、检索依赖已安装）',
    noCollections: '暂无知识库（可在设置页「知识库」中创建）',
    docChunk: '{docs} 文档 · {chunks} 分块',
    disabledBadge: '已停用',
    disabledTooltip: '已停用（大模型不会自主检索该库），仍可手动 @ 引用',
    manualSuffix: '手动引用',
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
  knowledgeSelector: {
    disabled: 'Knowledge retrieval is turned off (you can enable it in Settings - Knowledge)',
    notAvailable: 'Knowledge base unavailable (check the agent connection and installed retrieval dependencies)',
    noCollections: 'No knowledge base yet (create one in Settings - Knowledge)',
    docChunk: '{docs} docs · {chunks} chunks',
    disabledBadge: 'Disabled',
    disabledTooltip: 'Disabled (the model won\'t search this knowledge base autonomously); you can still reference it manually via @',
    manualSuffix: 'manual',
  },
});

// 当前 @ 弹出框激活的 Tab：'pages' | 'knowledge' | 'agents' | 'proxies'
export let activeAtTab = 'pages';

export async function getPairedAgents() {
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
 * @param {string} filterText - 预填过滤文本
 * @param {string|null} targetTab - 指定打开的 Tab（菜单直达）；null 时保持原有渲染行为
 */
export async function showAgentAtSelector(filterText = '', targetTab = null) {
  const agentAtSelector = document.getElementById('agentAtSelector');
  const agentAtDropdown = document.getElementById('agentAtDropdown');

  // 动态计算下拉框位置，确保紧贴在输入框上方
  updateDropdownPosition();

  agentAtSelector.style.display = 'block';
  agentAtDropdown.classList.add('show');

  // 初始化事件（Tab 切换 + ✚ 按钮 + 编辑按钮）
  initAtEvents();

  if (targetTab) {
    // 菜单直达指定 Tab：switchAtTab 内部完成高亮/列表切换/渲染与回焦
    await switchAtTab(targetTab);
  } else {
    // 根据是否有过滤文本决定展示模式
    await renderActiveAtList(filterText);
  }

  // 异步更新 Tab 标题的选项数量（不阻塞弹窗显示）
  updateAtTabCounts();
}

/**
 * 更新 @ 选择器 Tab 标题的选项数量
 */
async function updateAtTabCounts() {
  try {
    const [allAgents, allTabs, allProxies, kbState] = await Promise.all([getAllAgents(), getOpenTabs(), getPairedAgents(), fetchKnowledgeCollections()]);
    const agentsTab = document.querySelector('#agentAtTabs .prompt-tab[data-tab="agents"]');
    const pagesTab = document.querySelector('#agentAtTabs .prompt-tab[data-tab="pages"]');
    const proxiesTab = document.querySelector('#agentAtTabs .prompt-tab[data-tab="proxies"]');
    const knowledgeTab = document.querySelector('#agentAtTabs .prompt-tab[data-tab="knowledge"]');
    if (agentsTab) agentsTab.textContent = t('promptSelector.agentsCount', { count: allAgents.length });
    if (pagesTab) pagesTab.textContent = t('promptSelector.pagesCount', { count: allTabs.length });
    if (proxiesTab) {
      proxiesTab.textContent = t('promptSelector.proxiesCount', { count: allProxies.length });
      proxiesTab.style.display = allProxies.length > 0 ? '' : 'none';
    }
    if (knowledgeTab) {
      // 总开关未开启或 RAG 不可用时隐藏知识库 Tab
      knowledgeTab.textContent = t('promptSelector.knowledgeCount', { count: kbState.collections.length });
      knowledgeTab.style.display = kbState.ok ? '' : 'none';
      // 当前停留在已隐藏的知识库 Tab 时，回退到默认「网页」Tab（避免无 Tab 可依的悬空状态）
      if (!kbState.ok && activeAtTab === 'knowledge') {
        switchAtTab('pages');
      }
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
  state.selectedKnowledgeAtIndex = -1;
}

/**
 * 初始化 @ 弹出框事件（仅首次）
 */
function initAtEvents() {
  const dropdown = document.getElementById('agentAtDropdown');
  if (!dropdown || dropdown.dataset.initialized) return;
  dropdown.dataset.initialized = '1';

  // 下拉层 mousedown 保焦：点击列表项/标签时焦点不离开输入框，选中后可直接继续输入
  dropdown.addEventListener('mousedown', (e) => {
    if (e.target.closest('.prompt-item, .prompt-tab, .skill-list-item, .mcp-list-item')) {
      e.preventDefault();
    }
  });

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

    const knowledgeAddBtn = e.target.closest('#knowledgeAddBtn');
    if (knowledgeAddBtn) {
      e.stopPropagation();
      hideAgentAtSelector();
      // 跳转到设置页「知识库」Tab（新建/管理知识库）
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE', hash: 'knowledge' });
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
  const agentKnowledgeList = document.getElementById('agentKnowledgeList');
  if (agentAtList) agentAtList.style.display = tab === 'agents' ? '' : 'none';
  if (agentPageList) agentPageList.style.display = tab === 'pages' ? '' : 'none';
  if (agentProxyList) agentProxyList.style.display = tab === 'proxies' ? '' : 'none';
  if (agentKnowledgeList) agentKnowledgeList.style.display = tab === 'knowledge' ? '' : 'none';

  // 通过 CSS 类控制 ✚ 按钮显示（各 Tab 显示对应的 ✚ 按钮）
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
  const agentKnowledgeList = document.getElementById('agentKnowledgeList');

  if (filterText) {
    // 搜索模式：隐藏 Tab 按钮（显示聚合搜索标题），合并展示
    isMergedMode = true;
    if (tabsContainer) tabsContainer.classList.add('merged-mode');
    if (agentPageList) agentPageList.style.display = 'none';
    if (agentProxyList) agentProxyList.style.display = 'none';
    if (agentKnowledgeList) agentKnowledgeList.style.display = 'none';
    if (agentAtList) agentAtList.style.display = '';
    await renderMergedAtList(filterText);
    // ✚ 按钮在搜索模式下也隐藏
    const dropdown = document.getElementById('agentAtDropdown');
    if (dropdown) dropdown.setAttribute('data-active-tab', 'merged');
  } else {
    // 默认 Tab 模式
    isMergedMode = false;
    if (tabsContainer) tabsContainer.classList.remove('merged-mode');
    // 恢复 Tab 激活状态
    if (tabsContainer) {
      tabsContainer.querySelectorAll('.prompt-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === activeAtTab);
      });
    }
    if (agentPageList) agentPageList.style.display = activeAtTab === 'pages' ? '' : 'none';
    if (agentAtList) agentAtList.style.display = activeAtTab === 'agents' ? '' : 'none';
    if (agentProxyList) agentProxyList.style.display = activeAtTab === 'proxies' ? '' : 'none';
    if (agentKnowledgeList) agentKnowledgeList.style.display = activeAtTab === 'knowledge' ? '' : 'none';

    const dropdown = document.getElementById('agentAtDropdown');
    if (dropdown) dropdown.setAttribute('data-active-tab', activeAtTab);

    if (activeAtTab === 'pages') {
      await renderPageList('');
    } else if (activeAtTab === 'proxies') {
      await renderProxyAtList('');
    } else if (activeAtTab === 'knowledge') {
      await renderKnowledgeAtList('');
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
 * 解析 Agent 展示名称：内置默认 Agent 使用 i18n 翻译，其余使用原始 name。
 * 每次渲染实时查询，避免语言切换后仍显示旧语言（与 agent-manager.js 保持一致）。
 */
function getAgentDisplayName(agent) {
  return agent.id === 'default' ? t('agentMgr.defaultAgentName') : agent.name;
}

/**
 * 解析 Agent 展示描述：内置默认 Agent 使用 i18n 翻译，其余使用原始 description。
 */
function getAgentDisplayDesc(agent) {
  return agent.id === 'default' ? t('agentMgr.defaultAgentDesc') : agent.description;
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
    const name = getAgentDisplayName(agent);
    const desc = getAgentDisplayDesc(agent);
    return (name && name.toLowerCase().includes(filterLower)) ||
           (desc && desc.toLowerCase().includes(filterLower));
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
    const displayName = getAgentDisplayName(agent);
    const displayDesc = getAgentDisplayDesc(agent);
    return `
      <div class="prompt-item ${index === 0 ? 'selected' : ''} ${isActive ? 'agent-at-active' : ''}"
           data-index="${index}" data-agent-id="${escapeHtml(agent.id)}">
        <span class="prompt-item-index">${index + 1}</span>
        <span class="agent-at-icon">${escapeHtml(agent.icon)}</span>
        <span class="prompt-item-content">${escapeHtml(displayName)}</span>
        <span class="prompt-item-code">${escapeHtml(displayDesc || toolLabel)}</span>
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

// 代理在线状态缓存：避免渲染时阻塞等待网络 ping（TTL 内不重复请求）
const proxyStatusCache = new Map();
const PROXY_STATUS_TTL = 10000;

/**
 * 获取代理状态缓存（过期返回 null）
 */
function getCachedProxyStatus(proxy) {
  const cached = proxyStatusCache.get(proxy.id);
  if (cached && Date.now() - cached.ts < PROXY_STATUS_TTL) return cached;
  return null;
}

/**
 * 计算代理状态圆点的 class
 */
function getProxyDotClass(proxy, online) {
  if (proxy.isDisabled) return 'disabled';
  if (proxy.isActive) return online ? 'connected' : 'disconnected';
  return online ? 'online' : 'offline';
}

/**
 * 异步刷新代理在线状态：ping 完成后仅更新对应项的圆点，不重渲染列表
 */
async function refreshProxyStatus(proxy) {
  // TTL 内已有缓存则跳过，避免输入过程中重复请求
  if (getCachedProxyStatus(proxy)) return;
  const pingResult = await pingAgent(proxy);
  proxyStatusCache.set(proxy.id, {
    online: pingResult.online,
    version: pingResult.version || null,
    platformName: pingResult.platformName || null,
    ts: Date.now()
  });
  document.querySelectorAll('.prompt-item-proxy').forEach(item => {
    if (item.dataset.proxyId === proxy.id) {
      const dotEl = item.querySelector('.agent-at-dot');
      if (dotEl) {
        dotEl.className = `agent-at-dot agent-at-dot-${getProxyDotClass(proxy, pingResult.online)}`;
      }
    }
  });
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

  // 立即用缓存状态渲染（不阻塞等待网络 ping），ping 完成后异步更新圆点
  agentProxyList.innerHTML = filteredProxies.map((proxy, index) => {
    const cached = getCachedProxyStatus(proxy);
    const isActive = proxy.isActive;
    const isDisabled = proxy.isDisabled;
    const isOnline = cached ? cached.online : false;
    const dotClass = getProxyDotClass(proxy, isOnline);

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

  // 异步刷新在线状态，不阻塞列表显示
  filteredProxies.forEach(proxy => refreshProxyStatus(proxy));
}

/**
 * 渲染合并列表（助手 + 网页 + 代理 + 知识库，搜索模式下使用）
 */
async function renderMergedAtList(filterText = '') {
  const agentAtList = document.getElementById('agentAtList');
  if (!agentAtList) return;

  const filterLower = filterText.toLowerCase();

  const [allAgents, allTabs, allProxies, kbState] = await Promise.all([getAllAgents(), getOpenTabs(), getPairedAgents(), fetchKnowledgeCollections()]);

  const filteredAgents = allAgents.filter(agent => {
    const name = getAgentDisplayName(agent);
    const desc = getAgentDisplayDesc(agent);
    return (name && name.toLowerCase().includes(filterLower)) ||
           (desc && desc.toLowerCase().includes(filterLower));
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

  const filteredKbs = kbState.ok ? kbState.collections.filter(kb => {
    return (kb.name && kb.name.toLowerCase().includes(filterLower)) ||
           (kb.description && kb.description.toLowerCase().includes(filterLower));
  }) : [];

  const totalCount = filteredAgents.length + filteredTabs.length + filteredProxies.length + filteredKbs.length;
  // 更新聚合搜索标题，附上结果数量
  const mergedTitle = document.getElementById('agentAtMergedTitle');
  if (mergedTitle) mergedTitle.textContent = t('promptSelector.mergedTitleCount', { count: totalCount });

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
    const displayName = getAgentDisplayName(agent);
    const displayDesc = getAgentDisplayDesc(agent);
    html += `
      <div class="prompt-item${globalIndex === 0 ? ' selected' : ''}${isActive ? ' agent-at-active' : ''}"
           data-index="${globalIndex}" data-type="agent" data-agent-id="${escapeHtml(agent.id)}">
        <span class="prompt-item-index">${globalIndex + 1}</span>
        <span class="agent-at-icon">${escapeHtml(agent.icon)}</span>
        <span class="prompt-item-content">${escapeHtml(displayName)}</span>
        <span class="prompt-item-code">${escapeHtml(displayDesc || toolLabel)}</span>
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
      ? `<img src="${escapeHtml(tab.favIconUrl)}" width="16" height="16" style="flex-shrink:0;" class="favicon-img">`
      : '<span style="font-size:14px;flex-shrink:0;">🌐</span>';
    const isPageSelected = tab.id === currentSelectedPageId;

    html += `
      <div class="prompt-item prompt-item-page"
           data-index="${globalIndex}" data-type="page" data-tab-id="${tab.id}">
        <span class="prompt-item-index">${globalIndex + 1}</span>
        ${favIcon}
        <span class="prompt-item-content" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        <span class="prompt-item-code" title="${escapeHtml(url)}">${escapeHtml(url)}</span>
        ${isPageSelected ? `<span class="page-item-actions"><span class="page-selected-mark">✓</span></span>` : ''}
        <span class="page-action-toolbar">
          <span class="page-action-btn" data-action="interpret" data-tab-id="${tab.id}" title="${t('pageSelector.interpretPage')}">${t('pageSelector.interpretPage')}</span>
          <span class="page-action-btn" data-action="summarize" data-tab-id="${tab.id}" title="${t('pageSelector.summarizePage')}">${t('pageSelector.summarizePage')}</span>
          <span class="page-action-btn" data-action="translate" data-tab-id="${tab.id}" title="${t('pageSelector.translatePage')}">${t('pageSelector.translatePage')}</span>
        </span>
      </div>`;
    globalIndex++;
  });

  filteredKbs.forEach((kb) => {
    const isRef = state.knowledgeRefs.some(r => r.id === kb.id);
    const stats = t('knowledgeSelector.docChunk', { docs: kb.documentCount || 0, chunks: kb.chunkCount || 0 });
    // 停用库：仅提示"已停用"，仍可手动 @ 引用（与技能"未启用仍可手动使用"一致）
    const isDisabled = kb.enabled === false;

    html += `
      <div class="prompt-item${isRef ? ' agent-at-active picked' : ''}${isDisabled ? ' knowledge-item-disabled' : ''} prompt-item-knowledge"
           data-index="${globalIndex}" data-type="knowledge" data-kb-id="${escapeHtml(kb.id)}" data-kb-name="${escapeHtml(kb.name || '')}"
           data-kb-disabled="${isDisabled ? '1' : '0'}"${isDisabled ? ` title="${escapeHtml(t('knowledgeSelector.disabledTooltip'))}"` : ''}>
        <span class="prompt-item-index">${globalIndex + 1}</span>
        <span class="agent-at-icon">📚</span>
        <span class="prompt-item-content">${escapeHtml(kb.name || '')}</span>
        ${isDisabled ? `<span class="knowledge-item-badge badge-disabled">${t('knowledgeSelector.disabledBadge')}</span>` : ''}
        <span class="prompt-item-code">${escapeHtml(stats)}</span>
      </div>`;
    globalIndex++;
  });

  filteredProxies.forEach((proxy) => {
    const isActive = proxy.isActive;
    const isDisabled = proxy.isDisabled;
    const cached = getCachedProxyStatus(proxy);
    const isOnline = cached ? cached.online : false;
    const dotClass = getProxyDotClass(proxy, isOnline);

    const displayName = proxy.name || t('promptSelector.unnamedProxy');

    html += `
      <div class="prompt-item${globalIndex === 0 && filteredAgents.length === 0 && filteredTabs.length === 0 && filteredKbs.length === 0 ? ' selected' : ''}${isActive ? ' agent-at-active' : ''}${isDisabled ? ' agent-disabled' : ''} prompt-item-proxy"
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

  // favicon 加载失败时隐藏（替代内联 onerror，避免 MV3 CSP 拦截）
  agentAtList.querySelectorAll('img.favicon-img').forEach(img => {
    img.addEventListener('error', () => { img.style.display = 'none'; });
  });

  // 异步刷新代理在线状态，完成后仅更新圆点
  filteredProxies.forEach(proxy => refreshProxyStatus(proxy));

  agentAtList.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      // 网页快捷操作按钮
      const pageActionBtn = e.target.closest('.page-action-btn');
      if (pageActionBtn) {
        e.stopPropagation();
        handlePageAction(parseInt(pageActionBtn.dataset.tabId), pageActionBtn.dataset.action);
        return;
      }
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
      } else if (type === 'knowledge') {
        selectKnowledgeByAt({ id: item.dataset.kbId, name: item.dataset.kbName, enabled: item.dataset.kbDisabled !== '1' });
        // Ctrl/Cmd+点击：选中后关闭弹窗（多选场景的单选快捷方式）
        if (e.ctrlKey || e.metaKey) hideAgentAtSelector();
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
  if (isMergedMode) {
    selectedIndex = state.selectedAgentAtIndex;
  } else if (activeAtTab === 'proxies') {
    selectedIndex = state.selectedProxyAtIndex;
  } else if (activeAtTab === 'knowledge') {
    selectedIndex = state.selectedKnowledgeAtIndex;
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
 * 选中项后把焦点与光标交还输入框：移除 @ 触发文本（含过滤词）；
 * @ 已不在时仅把光标定位到当前文本末尾（无条件回焦，保证可继续输入）
 */
function focusUserInputAfterSelect() {
  const userInput = document.getElementById('userInput');
  if (!userInput) return;
  const value = userInput.value;
  const lastAtIndex = value.lastIndexOf('@');
  if (lastAtIndex !== -1) {
    userInput.value = value.substring(0, lastAtIndex);
  }
  userInput.focus();
  userInput.selectionStart = userInput.selectionEnd = userInput.value.length;
}

/**
 * 通过 @ 选择 Agent
 */
async function selectAgentByAt(agentId) {
  focusUserInputAfterSelect();
  hideAgentAtSelector();
  await switchAgent(agentId);
  adjustInputHeight();
}

/**
 * 通过 @ 选择网页
 */
function selectPageByAt(tabId) {
  focusUserInputAfterSelect();

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
 * 更新知识库列表（合并视图与单独 Tab 视图）中已选知识库的标记
 * 多选时弹窗保持打开，选择后需手动刷新列表项标记（.picked 紫条+✓ 与 .agent-at-active 高亮）
 */
function refreshKnowledgePickedState() {
  const refIds = new Set(state.knowledgeRefs.map(r => r.id));
  document.querySelectorAll('.prompt-item-knowledge').forEach(item => {
    const isRef = refIds.has(item.dataset.kbId);
    item.classList.toggle('agent-at-active', isRef);
    item.classList.toggle('picked', isRef);
  });
}

/**
 * 通过 @ 选择/取消选择知识库（支持多选，再次选同一库为移除）
 * 多选时保持弹窗打开，便于连续勾选；点击外部或开始输入时由既有逻辑关闭
 */
export function selectKnowledgeByAt(kb) {
  focusUserInputAfterSelect();

  const existsIndex = state.knowledgeRefs.findIndex(r => r.id === kb.id);
  if (existsIndex >= 0) {
    state.knowledgeRefs.splice(existsIndex, 1);
  } else {
    // 记录选择时的启用状态快照：停用库引用在 chip 上以"手动引用"提示（与技能快照一致）
    state.knowledgeRefs.push({ id: kb.id, name: kb.name || kb.id, enabled: kb.enabled !== false });
  }

  // 保持弹窗打开（与技能/MCP 多选一致），仅刷新列表标记与 chips 指示器
  refreshKnowledgePickedState();
  renderKnowledgeIndicator();
  adjustInputHeight();
}

/**
 * 移除一个知识库引用
 */
export function removeKnowledgeRef(id) {
  state.knowledgeRefs = state.knowledgeRefs.filter(r => r.id !== id);
  refreshKnowledgePickedState();
  renderKnowledgeIndicator();
}

/**
 * 清空所有知识库引用
 */
export function clearKnowledgeRefs() {
  state.knowledgeRefs = [];
  refreshKnowledgePickedState();
  renderKnowledgeIndicator();
}

/**
 * 渲染知识库引用指示器（多库 chips）
 */
export function renderKnowledgeIndicator() {
  const indicator = document.getElementById('knowledgeIndicator');
  if (!indicator) return;
  if (state.knowledgeRefs.length === 0) {
    indicator.style.display = 'none';
    indicator.innerHTML = '';
    return;
  }
  // 停用库引用：chip 橙色 + "手动引用"后缀（与技能"手动使用"一致）
  indicator.innerHTML = state.knowledgeRefs.map(ref => {
    const isManual = ref.enabled === false;
    const label = isManual
      ? `${ref.name} (${t('knowledgeSelector.manualSuffix')})`
      : ref.name;
    return `
    <span class="knowledge-chip${isManual ? ' knowledge-chip-manual' : ''}">
      <span class="knowledge-chip-name" title="${escapeHtml(isManual ? t('knowledgeSelector.disabledTooltip') : ref.name)}">📚 ${escapeHtml(label)}</span>
      <button class="knowledge-chip-close" data-kb-id="${escapeHtml(ref.id)}" title="${t('common.delete')}">✕</button>
    </span>
  `;
  }).join('');
  indicator.querySelectorAll('.knowledge-chip-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeKnowledgeRef(btn.dataset.kbId);
    });
  });
  indicator.style.display = 'flex';
}

// 知识库列表缓存：避免每次打开 @ 面板都请求 background（TTL 内复用；force=true 强制刷新）
let knowledgeCache = { ok: false, collections: [], ts: 0 };
let knowledgeFetchPromise = null;
const KNOWLEDGE_CACHE_TTL = 15000;

/**
 * 获取知识库列表（经 background 转发 Agent RAG API）
 * 总开关（ragEnabled）关闭或 RAG 不可用时 ok=false
 * @param {boolean} [force] 是否强制刷新缓存
 * @returns {Promise<{ok: boolean, disabled?: boolean, collections: Array, ts: number}>}
 */
export async function fetchKnowledgeCollections(force = false) {
  const now = Date.now();
  // 总开关关闭：实时读取（不走缓存），保证开关切换立即生效
  const { ragEnabled } = await chrome.storage.local.get('ragEnabled');
  if (ragEnabled !== true) {
    return { ok: false, disabled: true, collections: [], ts: Date.now() };
  }
  if (!force && knowledgeCache.ts && (now - knowledgeCache.ts) < KNOWLEDGE_CACHE_TTL) {
    return knowledgeCache;
  }
  if (knowledgeFetchPromise) return knowledgeFetchPromise;
  knowledgeFetchPromise = new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'RAG_LIST_COLLECTIONS' }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.success) {
          knowledgeCache = { ok: false, collections: [], ts: Date.now() };
        } else {
          // @ 列表展示序：启用库在前、停用库在后（稳定排序，组内保持接口原顺序）
          const sorted = [...(resp.collections || [])].sort((a, b) => (a.enabled === false ? 1 : 0) - (b.enabled === false ? 1 : 0));
          knowledgeCache = { ok: true, collections: sorted, ts: Date.now() };
        }
        resolve(knowledgeCache);
      });
    } catch {
      knowledgeCache = { ok: false, collections: [], ts: Date.now() };
      resolve(knowledgeCache);
    }
  }).finally(() => {
    knowledgeFetchPromise = null;
  });
  return knowledgeFetchPromise;
}

/**
 * 渲染知识库列表（单独 Tab）
 */
async function renderKnowledgeAtList(filterText = '') {
  const listEl = document.getElementById('agentKnowledgeList');
  if (!listEl) return;

  const kbState = await fetchKnowledgeCollections();
  if (!kbState.ok) {
    // 总开关关闭与代理端不可用给出不同的引导文案
    const msgKey = kbState.disabled ? 'knowledgeSelector.disabled' : 'knowledgeSelector.notAvailable';
    listEl.innerHTML = `<div class="prompt-empty">${t(msgKey)}</div>`;
    state.selectedKnowledgeAtIndex = -1;
    return;
  }

  const filterLower = (filterText || '').toLowerCase();
  const collections = kbState.collections.filter(kb => {
    if (!filterText) return true;
    return (kb.name && kb.name.toLowerCase().includes(filterLower)) ||
           (kb.description && kb.description.toLowerCase().includes(filterLower));
  });

  if (collections.length === 0) {
    listEl.innerHTML = `<div class="prompt-empty">${t('knowledgeSelector.noCollections')}</div>`;
    state.selectedKnowledgeAtIndex = -1;
    return;
  }

  state.selectedKnowledgeAtIndex = 0;

  listEl.innerHTML = collections.map((kb, index) => {
    const isRef = state.knowledgeRefs.some(r => r.id === kb.id);
    const stats = t('knowledgeSelector.docChunk', { docs: kb.documentCount || 0, chunks: kb.chunkCount || 0 });
    // 停用库：仅提示"已停用"，仍可手动 @ 引用（与技能"未启用仍可手动使用"一致）
    const isDisabled = kb.enabled === false;
    return `
      <div class="prompt-item ${index === 0 ? 'selected' : ''} ${isRef ? 'agent-at-active picked' : ''} ${isDisabled ? 'knowledge-item-disabled' : ''} prompt-item-knowledge"
           data-index="${index}" data-kb-id="${escapeHtml(kb.id)}" data-kb-name="${escapeHtml(kb.name || '')}"
           data-kb-disabled="${isDisabled ? '1' : '0'}"${isDisabled ? ` title="${escapeHtml(t('knowledgeSelector.disabledTooltip'))}"` : ''}>
        <span class="prompt-item-index">${index + 1}</span>
        <span class="agent-at-icon">📚</span>
        <span class="prompt-item-content">${escapeHtml(kb.name || '')}</span>
        ${isDisabled ? `<span class="knowledge-item-badge badge-disabled">${t('knowledgeSelector.disabledBadge')}</span>` : ''}
        <span class="prompt-item-code">${escapeHtml(stats)}</span>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', (e) => {
      selectKnowledgeByAt({ id: item.dataset.kbId, name: item.dataset.kbName, enabled: item.dataset.kbDisabled !== '1' });
      // Ctrl/Cmd+点击：选中后关闭弹窗（多选场景的单选快捷方式）
      if (e.ctrlKey || e.metaKey) hideAgentAtSelector();
    });
  });
}

/**
 * 通过 @ 选择代理
 */
async function selectProxyByAt(proxyId) {
  focusUserInputAfterSelect();

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

let tabActivationListenerInited = false;

/**
 * 监听浏览器 Tab 切换：当 @ 选择器展开时实时刷新网页列表，
 * 使「当前网页」置顶与默认选中态跟随用户切换的标签页自动更新
 */
function initTabActivationListener() {
  if (tabActivationListenerInited) return;
  tabActivationListenerInited = true;

  chrome.tabs.onActivated.addListener(() => {
    const agentAtSelector = document.getElementById('agentAtSelector');
    if (!agentAtSelector || agentAtSelector.style.display !== 'block') return;
    // 仅网页相关模式（网页 Tab / 搜索合并模式）需要跟随 Tab 切换刷新
    if (activeAtTab !== 'pages' && !isMergedMode) return;
    const userInput = document.getElementById('userInput');
    const filterText = userInput ? getAtFilterText(userInput.value) : '';
    renderActiveAtList(filterText);
  });
}
initTabActivationListener();

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
