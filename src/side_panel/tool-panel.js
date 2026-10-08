import state from './state.js';
import { BUILTIN_TOOLS, CATEGORY_ORDER } from './constants.js';
import { showToast, escapeHtml, escapeAttr } from './utils.js';
import { saveCurrentSession } from './session-manager.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  toolPanel: {
    agentRestrictedBanner: '当前 Agent 限制了可用工具，部分工具已禁用',
    noMatch: '没有匹配的工具',
    enabledCount: '已启用 {enabled}/{total} 个工具',
    toolsEnabled: '工具已启用',
    allToolsDisabled: '所有工具已禁用',
    toggleBtnEnabled: '禁用所有工具',
    toggleBtnDisabled: '启用所有工具',
    mcpServiceToolCount: '{count} 个工具',
    mcpServiceExpand: '展开/收起工具列表',
    mcpExcludedByAgent: '已被当前助手排除，可在助手编辑中调整',
    categorySelectAllHint: '对该分类下可见项全选/取消全选',
  },
});
registerTranslations('en', {
  toolPanel: {
    agentRestrictedBanner: 'Current agent has restricted available tools, some tools are disabled',
    noMatch: 'No matching tools',
    enabledCount: '{enabled}/{total} tools enabled',
    toolsEnabled: 'Tools enabled',
    allToolsDisabled: 'All tools disabled',
    toggleBtnEnabled: 'Disable all tools',
    toggleBtnDisabled: 'Enable all tools',
    mcpServiceToolCount: '{count} tools',
    mcpServiceExpand: 'Show/hide tool list',
    mcpExcludedByAgent: 'Excluded by current assistant; adjust in assistant editor',
    categorySelectAllHint: 'Select/deselect all visible items in this category',
  },
});

// MCP 工具缓存（从 chrome.storage.local 读取）
let mcpToolsCache = [];

// RAG 知识库工具缓存（Background 注册/卸载时同步到 storage.local.ragTools）
let ragToolsCache = [];

/**
 * 获取工具的本地化描述
 * 内置工具走 i18n（t('tool.<id>')）；MCP 工具或缺失 key 时回退到原始 description
 * @param {{id: string, description?: string}} tool
 * @returns {string}
 */
export function getToolDesc(tool) {
  if (!tool) return '';
  const key = `tool.${tool.id}`;
  const val = t(key);
  // t() 在找不到 key 时返回 key 本身，此时回退到原始 description（MCP 工具等）
  return val === key ? (tool.description || '') : val;
}

/**
 * MCP 工具的展示描述：去掉后台写入的 [MCP:serverName] 前缀（服务已分组展示，前缀冗余）；
 * 无独立描述（后台回退为工具名）时返回空串，避免与工具名重复展示
 * @param {{name?: string, description?: string}} tool
 * @returns {string}
 */
export function getMcpToolDisplayDesc(tool) {
  if (!tool) return '';
  let desc = tool.description || '';
  if (desc.startsWith('[MCP:')) {
    const idx = desc.indexOf(']');
    if (idx !== -1) desc = desc.slice(idx + 1).trim();
  }
  return desc === (tool.name || '') ? '' : desc;
}

/**
 * 从 chrome.storage.local 加载 MCP 工具
 */
async function loadMcpToolsFromStorage() {
  try {
    // 优先直接从 Background 获取（避免 storage 竞态）
    const response = await chrome.runtime.sendMessage({ type: 'GET_MCP_TOOLS' });
    if (response?.success && response.tools) {
      mcpToolsCache = response.tools;
      return mcpToolsCache;
    }
  } catch { /* Background 可能未就绪，回退到 storage */ }
  
  try {
    const result = await chrome.storage.local.get(['mcpTools']);
    mcpToolsCache = result.mcpTools || [];
    return mcpToolsCache;
  } catch {
    mcpToolsCache = [];
    return [];
  }
}

/**
 * 从 chrome.storage.local 加载 RAG 知识库工具（由 Background 在注册/卸载时同步）
 */
async function loadRagToolsFromStorage() {
  try {
    const result = await chrome.storage.local.get(['ragTools']);
    ragToolsCache = result.ragTools || [];
  } catch {
    ragToolsCache = [];
  }
  return ragToolsCache;
}

/**
 * 从 storage / 助手配置加载 MCP 服务级开关状态
 * - mcpClosedServers：当前 Agent 的关闭列表（deny-list）
 * - activeAgentMcpExcludedServerIds：当前助手编辑器排除列表
 * 弹窗打开时刷新，确保与最新的助手配置/保存状态一致
 */
async function loadMcpServiceStateFromStorage() {
  const agentKey = `agentMcpClosedServers_${state.activeAgentId || 'default'}`;
  try {
    const result = await chrome.storage.local.get([agentKey]);
    state.mcpClosedServers = result[agentKey] || [];
  } catch {
    state.mcpClosedServers = [];
  }
  // 助手编辑器排除列表（从助手配置读取；默认助手无排除）
  try {
    const { getAgent } = await import('./agent-store.js');
    const agent = state.activeAgentId ? await getAgent(state.activeAgentId) : null;
    state.activeAgentMcpExcludedServerIds = agent ? (agent.mcpExcludedServerIds ?? null) : null;
  } catch { /* ignore */ }
}

// 监听 MCP 工具更新和全局开关变化，实时同步
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let needsRefresh = false;

  if (changes.mcpTools) {
    mcpToolsCache = changes.mcpTools.newValue || [];
    logger.debug('[SidePanel] MCP toolcache updated:', mcpToolsCache.length, '');
    needsRefresh = true;
  }
  if (changes.ragTools) {
    ragToolsCache = changes.ragTools.newValue || [];
    logger.debug('[SidePanel] RAG toolcache updated:', ragToolsCache.length);
    needsRefresh = true;
  }
  if (changes.mcpEnabled) {
    globalMcpEnabled = changes.mcpEnabled.newValue === true;
    logger.debug('[SidePanel] MCP globaltoggle changed:', globalMcpEnabled);
    needsRefresh = true;
  }
  if (changes.skillsEnabled) {
    globalSkillsEnabled = changes.skillsEnabled.newValue !== false;
    logger.debug('[SidePanel] Skill global toggle changed:', globalSkillsEnabled);
    needsRefresh = true;
  }

  // 如果工具弹窗当前是打开状态，实时刷新列表
  if (needsRefresh) {
    const overlay = document.getElementById('toolsPopupOverlay');
    if (overlay?.classList.contains('show')) {
      updateCategoryBadges();
      updateToolsPopupTitle();
      renderToolsPopupList();
    }
    // 弹窗未打开时也刷新工具栏按钮数字（MCP/RAG 缓存或全局开关变化）
    updateToolsToggleState();
  }
});

// 模块初始化时预加载 MCP 工具缓存（加载完成后刷新工具栏按钮数字）
loadMcpToolsFromStorage().then(() => updateToolsToggleState());
// 预加载 RAG 知识库工具缓存（同上）
loadRagToolsFromStorage().then(() => updateToolsToggleState());

// 全局开关状态（从 chrome.storage 加载，通过 onChanged 实时更新）
let globalMcpEnabled = false;
let globalSkillsEnabled = true;

// 加载全局开关初始状态
chrome.storage.local.get(['mcpEnabled', 'skillsEnabled'], (result) => {
  globalMcpEnabled = result.mcpEnabled === true;
  globalSkillsEnabled = result.skillsEnabled !== false;
  updateToolsToggleState();
});

/**
 * 获取当前 Agent 限定范围内的「常规工具」列表（内置 + RAG，不含 MCP）
 * MCP 工具已改为服务级开关（见 getMcpServicesForUI），不参与工具级勾选过滤
 * null = 没有限制（默认助手），返回全部工具
 * [] = 空数组，没有工具
 * [id1, id2] = 只返回这些 ID 对应的工具
 */
function getAgentFilteredTools() {
  const allTools = [...BUILTIN_TOOLS, ...ragToolsCache];
  const toolIds = state.activeAgentToolIds;
  let filtered = allTools;
  if (toolIds !== null && toolIds !== undefined) {
    const filterSet = new Set(toolIds);
    filtered = allTools.filter(t => filterSet.has(t.id));
  }
  // Skill 全局开关关闭时，过滤掉 Skill 相关工具
  if (!globalSkillsEnabled) {
    filtered = filtered.filter(t => t.id !== 'agent_skill');
  }
  // Agent 未连接时，隐藏依赖代理服务的工具
  const agentConnected = state.agentPlatform?.connected === true;
  if (!agentConnected) {
    filtered = filtered.filter(t => !t.id.startsWith('agent_') && !t.id.startsWith('knowledge_'));
  }
  return filtered;
}

// ==================== MCP 服务级开关（deny-list 模型） ====================
// MCP 工具不参与工具级勾选：用户按「服务」整体开放/关闭。
// 不在关闭列表（state.mcpClosedServers）中 = 开放；被助手编辑器排除的服务同样不下发。

/**
 * 将 MCP 工具缓存按服务分组（受全局开关与 Agent 连接状态约束）
 * @returns {Array<{serverId: string, serverName: string, tools: Array, toolCount: number}>}
 */
function getMcpServicesForUI() {
  if (!globalMcpEnabled) return [];
  const agentConnected = state.agentPlatform?.connected === true;
  if (!agentConnected) return [];
  const serverMap = new Map();
  mcpToolsCache.forEach(t => {
    const sid = t.serverId || 'unknown';
    if (!serverMap.has(sid)) {
      serverMap.set(sid, { serverId: sid, serverName: t.serverName || sid, tools: [], toolCount: 0 });
    }
    const entry = serverMap.get(sid);
    entry.tools.push(t);
    entry.toolCount++;
  });
  return Array.from(serverMap.values());
}

/** 服务是否被用户关闭（弹窗层 deny-list） */
function isMcpServiceClosed(serverId) {
  return Array.isArray(state.mcpClosedServers) && state.mcpClosedServers.includes(serverId);
}

/** 服务是否被当前助手排除（助手编辑器层 deny-list） */
function isMcpServiceExcludedByAgent(serverId) {
  return Array.isArray(state.activeAgentMcpExcludedServerIds) && state.activeAgentMcpExcludedServerIds.includes(serverId);
}

/** 服务的最终开放状态（会随请求下发） */
function isMcpServiceEffectiveOpen(serverId) {
  return !isMcpServiceClosed(serverId) && !isMcpServiceExcludedByAgent(serverId);
}

/** 当前搜索/分类条件下可见的 MCP 服务 */
function getFilteredMcpServices() {
  if (state.currentCategory !== 'all' && state.currentCategory !== 'mcp') return [];
  let services = getMcpServicesForUI();
  if (state.currentSearch) {
    const q = state.currentSearch;
    services = services.filter(svc =>
      (svc.serverName || '').toLowerCase().includes(q) ||
      (svc.serverId || '').toLowerCase().includes(q) ||
      svc.tools.some(tool => (tool.name || '').toLowerCase().includes(q) || getToolDesc(tool).toLowerCase().includes(q))
    );
  }
  return services;
}

/** 服务 checkbox 变更后同步 state.mcpClosedServers */
function toggleMcpService(serverId, open) {
  if (!Array.isArray(state.mcpClosedServers)) state.mcpClosedServers = [];
  const idx = state.mcpClosedServers.indexOf(serverId);
  if (open) {
    if (idx > -1) state.mcpClosedServers.splice(idx, 1);
  } else if (idx === -1) {
    state.mcpClosedServers.push(serverId);
  }
}

async function openToolsPopup() {
  const toolsPopupOverlay = document.getElementById('toolsPopupOverlay');
  if (!toolsPopupOverlay) return;
  
  // 重置筛选条件
  state.currentCategory = 'all';
  state.currentSearch = '';
  
  // 清空搜索框
  const searchInput = document.getElementById('toolsSearchInput');
  if (searchInput) {
    searchInput.value = '';
  }
  
  // 先从 storage 加载 MCP 工具与 RAG 知识库工具
  await loadMcpToolsFromStorage();
  await loadRagToolsFromStorage();
  // 加载 MCP 服务级开关状态（关闭列表 + 助手排除列表）
  await loadMcpServiceStateFromStorage();
  
  // 更新标签角标数字
  updateCategoryBadges();
  
  // 更新标题中的启用工具数
  updateToolsPopupTitle();
  
  // 加载工具预筛选 / 敏感操作确认开关状态
  chrome.storage.local.get(['enableToolPreselect', 'toolConfirmationEnabled'], (result) => {
    const toggle = document.getElementById('toolsPreselectToggle');
    if (toggle) {
      const enabled = result.enableToolPreselect !== undefined ? result.enableToolPreselect : false;
      toggle.checked = enabled;
    }
    const confirmToggle = document.getElementById('toolConfirmToggle');
    if (confirmToggle) {
      const confirmEnabled = result.toolConfirmationEnabled !== undefined ? result.toolConfirmationEnabled : true;
      confirmToggle.checked = confirmEnabled;
    }
  });
  
  // 初始化所有标签的样式
  const categoryBtns = document.querySelectorAll('.category-btn');
  categoryBtns.forEach(btn => {
    btn.classList.remove('active');
    if (btn.classList.contains('category-all')) {
      // "全部"标签设置为选中状态
      btn.classList.add('active');
      btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      btn.style.color = 'white';
      btn.style.borderColor = 'transparent';
    } else {
      // 其他标签设置为默认样式
      btn.style.background = 'white';
      btn.style.color = '#555';
      btn.style.borderColor = '#ececec';
    }
  });
  
  // 渲染工具列表
  renderToolsPopupList();
  
  // 显示弹窗（使用 modal-overlay 的 show 类）
  toolsPopupOverlay.classList.add('show');
  
  logger.debug('[SidePanel] opentool popup');
}

function closeToolsPopup() {
  const toolsPopupOverlay = document.getElementById('toolsPopupOverlay');
  if (!toolsPopupOverlay) return;
  
  // 清除所有标签的选中状态
  const categoryBtns = document.querySelectorAll('.category-btn');
  categoryBtns.forEach(btn => {
    btn.classList.remove('active');
    btn.style.background = '';
    btn.style.color = '';
    btn.style.borderColor = '';
  });
  
  // 隐藏弹窗
  toolsPopupOverlay.classList.remove('show');
  
  logger.debug('[SidePanel] closetool popup');
}

function renderToolsPopupList() {
  const toolsList = document.getElementById('toolsPopupList');
  if (!toolsList) return;
  
  toolsList.innerHTML = '';

  const filteredTools = getAgentFilteredTools();
  const isAgentRestricted = state.activeAgentToolIds !== null && state.activeAgentToolIds !== undefined;

  // 如果 Agent 限定了工具范围，显示提示条
  if (isAgentRestricted) {
    const banner = document.createElement('div');
    banner.className = 'popup-tool-agent-banner';
    banner.innerHTML = `<span>${t('toolPanel.agentRestrictedBanner')}</span>`;
    toolsList.appendChild(banner);
  }
  
  // 按分类分组显示
  const groupedTools = {};
  
  filteredTools.forEach(tool => {
    // 过滤：分类
    if (state.currentCategory !== 'all' && tool.category !== state.currentCategory) {
      return;
    }
    
    // 过滤：搜索
    if (state.currentSearch) {
      const nameMatch = tool.name.toLowerCase().includes(state.currentSearch);
      const descMatch = getToolDesc(tool).toLowerCase().includes(state.currentSearch);
      if (!nameMatch && !descMatch) {
        return;
      }
    }
    
    const category = tool.category || 'other';
    if (!groupedTools[category]) {
      groupedTools[category] = [];
    }
    groupedTools[category].push(tool);
  });
  
  // MCP 服务级行（独立于工具级勾选；搜索/分类过滤在 getFilteredMcpServices 内部完成）
  const visibleMcpServices = getFilteredMcpServices();

  // 分类名称映射（用于显示）：统一走 i18n
  // 优化后的分类排序（按使用频率和逻辑顺序）
  const categoryOrder = CATEGORY_ORDER;

  categoryOrder.forEach(category => {
    const isMcpCategory = category === 'mcp';
    const tools = groupedTools[category] || [];
    const mcpServices = isMcpCategory ? visibleMcpServices : [];
    // MCP 分类按服务数判空，其余分类按工具数判空
    if (isMcpCategory ? mcpServices.length === 0 : tools.length === 0) return;

    // 分类标题计数：MCP 分类按「生效开放/总服务数」，其余按「已启用/总工具数」
    let countText;
    if (isMcpCategory) {
      const openCount = mcpServices.filter(svc => isMcpServiceEffectiveOpen(svc.serverId)).length;
      countText = `${openCount}/${mcpServices.length}`;
    } else {
      const categoryTools = filteredTools.filter(t => t.category === category);
      const enabledCount = categoryTools.filter(t => state.enabledTools.includes(t.id)).length;
      countText = `${enabledCount}/${categoryTools.length}`;
    }

    // 创建分类容器
    const categoryContainer = document.createElement('div');
    categoryContainer.className = 'popup-tool-category-group';
    categoryContainer.dataset.category = category;

    // 添加分类标题（带折叠按钮）
    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'popup-tool-category';
    categoryHeader.dataset.category = category;

    const isCollapsed = state.collapsedCategories[category] || false;

    categoryHeader.innerHTML = `
      <span class="category-expand-icon">${isCollapsed ? '▶' : '▼'}</span>
      <span class="category-name">${t('toolCategory.' + category)}</span>
      <span class="category-count">${countText}</span>
      <button type="button" class="category-select-all" title="${escapeAttr(t('toolPanel.categorySelectAllHint'))}"></button>
    `;
    
    // 折叠/全选点击事件：点击「全选」按钮时对该分类可见项全选/取消全选（不折叠）
    categoryHeader.addEventListener('click', (e) => {
      if (e.target.closest('.category-select-all')) {
        e.stopPropagation();
        toggleCategorySelectAll(category);
        return;
      }
      toggleCategoryCollapse(category);
    });
    
    categoryContainer.appendChild(categoryHeader);
    
    // 创建工具列表容器
    const toolsContainer = document.createElement('div');
    toolsContainer.className = `popup-tool-items ${isCollapsed ? 'collapsed' : ''}`;
    
    // 添加该分类下的行项：MCP 分类渲染服务级行，其余渲染普通工具行
    (isMcpCategory ? mcpServices : tools).forEach(tool => {
      if (isMcpCategory) {
        toolsContainer.appendChild(createMcpServiceItem(tool, category));
        return;
      }
      const isChecked = state.enabledTools.includes(tool.id);
      
      const toolItem = document.createElement('div');
      toolItem.className = 'popup-tool-item';
      toolItem.dataset.category = category;
      const toolDesc = getToolDesc(tool);
      toolItem.innerHTML = `
        <input type="checkbox" id="tool_${tool.id}" ${isChecked ? 'checked' : ''}>
        <div class="popup-tool-content">
          <div class="popup-tool-name" title="${escapeAttr(tool.name)}">${escapeHtml(tool.name)}</div>
          <div class="popup-tool-desc" title="${escapeAttr(toolDesc)}">${escapeHtml(toolDesc)}</div>
        </div>
      `;
      
      // 为checkbox添加change事件监听器，实时更新分类标题的启用数量和enabledTools数组
      const checkbox = toolItem.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          // 阻止事件冒泡，避免触发分类折叠
          e.stopPropagation();
          // 更新enabledTools数组
          if (e.target.checked) {
            if (!state.enabledTools.includes(tool.id)) {
              state.enabledTools.push(tool.id);
            }
          } else {
            const index = state.enabledTools.indexOf(tool.id);
            if (index > -1) {
              state.enabledTools.splice(index, 1);
            }
          }
          // 更新分类标题的启用数量显示
          updateCategoryCount(category);
          // 更新标签角标
          updateCategoryBadges();
          // 更新弹窗标题中的启用工具数
          updateToolsPopupTitle();
          // 更新分类「全选/取消全选」按钮文案
          updateCategorySelectAllState(category);
        });
      }
      
      toolsContainer.appendChild(toolItem);
    });
    
    categoryContainer.appendChild(toolsContainer);
    toolsList.appendChild(categoryContainer);
    // 初始化「全选/取消全选」按钮文案（依据渲染后的可见项状态）
    updateCategorySelectAllState(category);
  });
  
  // 如果没有结果
  if (toolsList.children.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'popup-tool-empty';
    emptyMsg.textContent = t('toolPanel.noMatch');
    toolsList.appendChild(emptyMsg);
  }
}

/**
 * 创建 MCP 服务行（服务级开关：checkbox + 服务名 + 工具数 + 展开只读工具列表）
 * checkbox 反映弹窗层（mcpClosedServers）状态；被助手编辑器排除的服务禁用并显示提示
 * @param {{serverId: string, serverName: string, tools: Array, toolCount: number}} service
 * @param {string} category - 所属分类（当前固定为 'mcp'）
 * @returns {HTMLElement}
 */
function createMcpServiceItem(service, category) {
  const excludedByAgent = isMcpServiceExcludedByAgent(service.serverId);
  const isOpen = !isMcpServiceClosed(service.serverId);

  const block = document.createElement('div');
  block.className = 'popup-mcp-service-block';
  block.dataset.category = category;
  block.dataset.serverId = service.serverId;

  // 服务行（复用普通工具行布局）：服务名 + 工具数 + ID 标识 + 展开指示按钮
  const item = document.createElement('div');
  item.className = 'popup-tool-item popup-mcp-service-item';
  item.innerHTML = `
    <input type="checkbox" id="mcpsvc_${escapeAttr(service.serverId)}" ${isOpen ? 'checked' : ''} ${excludedByAgent ? 'disabled' : ''}>
    <div class="popup-tool-content">
      <div class="popup-tool-name" title="${escapeAttr(service.serverName)}">
        <span class="popup-mcp-service-name">${escapeHtml(service.serverName)}</span>
        <span class="popup-mcp-service-count">${t('toolPanel.mcpServiceToolCount', { count: service.toolCount })}</span>
      </div>
      <div class="popup-tool-desc popup-mcp-service-meta">
        <span class="popup-mcp-service-id" title="ID: ${escapeAttr(service.serverId)}">ID: ${escapeHtml(service.serverId)}</span>
      </div>
      ${excludedByAgent ? `<div class="popup-tool-desc popup-mcp-service-hint">${t('toolPanel.mcpExcludedByAgent')}</div>` : ''}
    </div>
    <button type="button" class="popup-mcp-expand-btn" title="${t('toolPanel.mcpServiceExpand')}">▶</button>
  `;
  block.appendChild(item);

  // 只读工具列表（默认收起）：工具名 + 工具描述
  const toolList = document.createElement('div');
  toolList.className = 'popup-mcp-tool-list collapsed';
  service.tools.forEach(tool => {
    const toolName = tool.name || '';
    const desc = getMcpToolDisplayDesc(tool);
    const row = document.createElement('div');
    row.className = 'popup-mcp-tool-row';
    row.title = desc ? `${toolName}：${desc}` : toolName;
    row.innerHTML = `<span class="popup-mcp-tool-name">${escapeHtml(toolName)}</span>`
      + (desc ? `<span class="popup-mcp-tool-desc">${escapeHtml(desc)}</span>` : '');
    toolList.appendChild(row);
  });
  block.appendChild(toolList);

  // 展开/收起工具列表：点击服务行任意处或展开按钮均可
  const expandBtn = item.querySelector('.popup-mcp-expand-btn');
  const toggleToolList = () => {
    const collapsed = toolList.classList.toggle('collapsed');
    if (expandBtn) expandBtn.textContent = collapsed ? '▶' : '▼';
  };
  if (expandBtn) {
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleToolList();
    });
  }
  item.addEventListener('click', (e) => {
    // checkbox 点击只切换服务开关；展开按钮由自身处理器处理
    if (e.target.closest('input[type="checkbox"]') || e.target.closest('.popup-mcp-expand-btn')) return;
    toggleToolList();
  });

  // checkbox 变更：同步 state 并实时刷新计数
  const checkbox = item.querySelector('input[type="checkbox"]');
  if (checkbox) {
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleMcpService(service.serverId, e.target.checked);
      updateCategoryCount('mcp');
      updateCategoryBadges();
      updateToolsPopupTitle();
      updateCategorySelectAllState('mcp');
    });
  }

  return block;
}

function toggleCategoryCollapse(category) {
  state.collapsedCategories[category] = !state.collapsedCategories[category];
  
  const container = document.querySelector(`.popup-tool-category-group[data-category="${category}"]`);
  if (!container) return;
  
  const header = container.querySelector('.popup-tool-category');
  const icon = header.querySelector('.category-expand-icon');
  const items = container.querySelector('.popup-tool-items');
  
  if (state.collapsedCategories[category]) {
    icon.textContent = '▶';
    items.classList.add('collapsed');
  } else {
    icon.textContent = '▼';
    items.classList.remove('collapsed');
  }
}

/**
 * 分类级「全选/取消全选」：仅作用于该分类下当前可见（过滤后、未被禁用）的项
 * 未全选 → 全部选中/开放；已全选 → 全部取消/关闭。复用行内 change 事件同步 state 与计数
 * @param {string} category
 */
function toggleCategorySelectAll(category) {
  const container = document.querySelector(`.popup-tool-category-group[data-category="${category}"]`);
  if (!container) return;
  const checkboxes = Array.from(container.querySelectorAll('.popup-tool-items input[type="checkbox"]:not(:disabled)'));
  if (checkboxes.length === 0) return;
  const target = !checkboxes.every(cb => cb.checked);
  checkboxes.forEach(cb => {
    if (cb.checked === target) return;
    cb.checked = target;
    cb.dispatchEvent(new Event('change'));
  });
  updateCategorySelectAllState(category);
}

/**
 * 刷新分类头部「全选/取消全选」按钮文案：全部已选 →「取消全选」，否则 →「全选」
 * 无可操作项（如服务全被助手排除）时隐藏按钮
 * @param {string} category
 */
function updateCategorySelectAllState(category) {
  const container = document.querySelector(`.popup-tool-category-group[data-category="${category}"]`);
  const btn = container ? container.querySelector('.category-select-all') : null;
  if (!btn) return;
  const checkboxes = Array.from(container.querySelectorAll('.popup-tool-items input[type="checkbox"]:not(:disabled)'));
  if (checkboxes.length === 0) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  btn.textContent = checkboxes.every(cb => cb.checked) ? t('common.deselectAll') : t('common.selectAll');
}

function updateCategoryCount(category) {
  const categoryHeader = document.querySelector(`.popup-tool-category[data-category="${category}"]`);
  if (!categoryHeader) return;
  
  const countSpan = categoryHeader.querySelector('.category-count');
  if (!countSpan) return;
  
  let enabledCount = 0;
  let totalCount = 0;

  if (category === 'mcp') {
    // MCP 分类按服务数统计（与行粒度一致；只统计当前视图可见的服务）
    const services = getFilteredMcpServices();
    totalCount = services.length;
    services.forEach(svc => {
      // 被助手排除的服务为禁用行，不计入开放数
      if (isMcpServiceExcludedByAgent(svc.serverId)) return;
      const checkbox = document.getElementById('mcpsvc_' + svc.serverId);
      if (checkbox ? checkbox.checked : !isMcpServiceClosed(svc.serverId)) enabledCount++;
    });
  } else {
    // 知识库分类需要额外统计动态工具缓存中的工具
    const categoryTools = category === 'knowledge'
      ? ragToolsCache
      : BUILTIN_TOOLS.filter(t => t.category === category);
    totalCount = categoryTools.length;
    categoryTools.forEach(tool => {
      const checkbox = document.getElementById('tool_' + tool.id);
      if (checkbox && checkbox.checked) {
        enabledCount++;
      }
    });
  }
  
  countSpan.textContent = `${enabledCount}/${totalCount}`;
}

function getVisibleTools() {
  const filteredTools = getAgentFilteredTools();
  return filteredTools.filter(tool => {
    // 分类筛选
    if (state.currentCategory !== 'all' && tool.category !== state.currentCategory) {
      return false;
    }
    // 搜索筛选
    if (state.currentSearch) {
      const nameMatch = tool.name.toLowerCase().includes(state.currentSearch.toLowerCase());
      const descMatch = getToolDesc(tool).toLowerCase().includes(state.currentSearch.toLowerCase());
      if (!nameMatch && !descMatch) {
        return false;
      }
    }
    return true;
  });
}

function updateAllCategoryCounts() {
  const categories = CATEGORY_ORDER;
  categories.forEach(category => {
    updateCategoryCount(category);
    // 同步分类「全选/取消全选」按钮文案（全局全选/全不选后需要）
    updateCategorySelectAllState(category);
  });
}

function updateCategoryBadges() {
  const categories = ['all', ...CATEGORY_ORDER];
  const filteredTools = getAgentFilteredTools();
  const services = getMcpServicesForUI();
  const openServiceCount = services.filter(svc => isMcpServiceEffectiveOpen(svc.serverId)).length;
  const validToolIds = new Set(filteredTools.map(t => t.id));
  // 只统计当前可见工具中启用的数量
  const validEnabledCount = state.enabledTools.filter(id => validToolIds.has(id)).length;
  
  categories.forEach(category => {
    const badge = document.getElementById('badge-' + category);
    if (!badge) return;
    
    let totalCount = 0;
    let enabledCount = 0;
    
    if (category === 'all') {
      // 工具 + MCP 服务（MCP 按服务粒度计数：一个服务算一个，不按服务内工具数）
      totalCount = filteredTools.length + services.length;
      enabledCount = validEnabledCount + openServiceCount;
    } else if (category === 'mcp') {
      // MCP 分类按服务数展示（与行粒度一致）
      totalCount = services.length;
      enabledCount = openServiceCount;
    } else {
      const categoryTools = filteredTools.filter(tool => tool.category === category);
      totalCount = categoryTools.length;
      enabledCount = categoryTools.filter(t => state.enabledTools.includes(t.id)).length;
    }
    
    badge.textContent = `${enabledCount}/${totalCount}`;
    
    // 隐藏工具数为 0 的分类标签（保留"全部"标签不隐藏）
    if (category !== 'all' && badge.parentElement) {
      badge.parentElement.style.display = totalCount === 0 ? 'none' : '';
    }
  });
}

function updateToolsPopupTitle() {
  const countSpan = document.getElementById('toolsEnabledCount');
  if (!countSpan) return;
  
  const filteredTools = getAgentFilteredTools();
  const validToolIds = new Set(filteredTools.map(t => t.id));
  const enabledToolCount = state.enabledTools.filter(id => validToolIds.has(id)).length;
  // MCP 按服务粒度计数：一个服务算一个
  const services = getMcpServicesForUI();
  const openServiceCount = services.filter(svc => isMcpServiceEffectiveOpen(svc.serverId)).length;
  
  countSpan.textContent = t('toolPanel.enabledCount', { enabled: enabledToolCount + openServiceCount, total: filteredTools.length + services.length });
}

function saveToolsFromPopup() {
  const newEnabledTools = [];
  // MCP 工具不参与工具级勾选（服务级开关单独保存）
  const allTools = [...BUILTIN_TOOLS, ...ragToolsCache];
  
  allTools.forEach(tool => {
    const checkbox = document.getElementById('tool_' + tool.id);
    if (checkbox) {
      // 可见工具：根据 checkbox 状态决定
      if (checkbox.checked) {
        newEnabledTools.push(tool.id);
      }
    } else {
      // 不可见工具：保持原始状态
      if (state.enabledTools.includes(tool.id)) {
        newEnabledTools.push(tool.id);
      }
    }
  });
  
  state.enabledTools = newEnabledTools;
  
  // MCP 服务级开关：汇总为关闭列表（deny-list）
  // - 可见服务：checkbox 存在用勾选状态，否则保持原有状态
  // - 被助手排除的服务：不下发，保留其弹窗层原状态（不因编辑器排除而丢失）
  // - 当前不可见的服务（如 Agent 断连）：保留既有记录
  const services = getMcpServicesForUI();
  const visibleServerIds = new Set(services.map(svc => svc.serverId));
  const newClosedServers = (state.mcpClosedServers || []).filter(id => !visibleServerIds.has(id));
  // MCP 按服务粒度计数：一个服务算一个（用于保存提示数量）
  let openServiceCount = 0;
  services.forEach(svc => {
    if (isMcpServiceExcludedByAgent(svc.serverId)) {
      if (isMcpServiceClosed(svc.serverId)) newClosedServers.push(svc.serverId);
      return;
    }
    const checkbox = document.getElementById('mcpsvc_' + svc.serverId);
    const isOpen = checkbox ? checkbox.checked : !isMcpServiceClosed(svc.serverId);
    if (isOpen) {
      openServiceCount++;
    } else {
      newClosedServers.push(svc.serverId);
    }
  });
  state.mcpClosedServers = newClosedServers;
  // 工具勾选与总开关（useTools）各自独立：保存选择不改写总开关状态
  
  // 保存到当前智能体独立的 storage key（工具勾选 + MCP 服务关闭列表）
  const agentToolsKey = `agentEnabledTools_${state.activeAgentId || 'default'}`;
  const agentMcpClosedKey = `agentMcpClosedServers_${state.activeAgentId || 'default'}`;
  chrome.storage.local.set({
    [agentToolsKey]: state.enabledTools,
    [agentMcpClosedKey]: state.mcpClosedServers
  }, () => {
    logger.debug('[SidePanel] tool configurationsavedto agent:', agentToolsKey, state.enabledTools, agentMcpClosedKey, state.mcpClosedServers);
  });
  
  // 同步更新当前会话的 enabledTools，避免下次加载时被旧会话数据覆盖
  saveCurrentSession().catch(() => {});

  // 保存工具预筛选开关状态
  const preselectToggle = document.getElementById('toolsPreselectToggle');
  if (preselectToggle) {
    chrome.storage.local.set({ enableToolPreselect: preselectToggle.checked }, () => {
      logger.debug('[SidePanel] toolpre-filter toggle saved:', preselectToggle.checked);
    });
  }

  // 保存敏感操作确认开关状态
  const confirmToggle = document.getElementById('toolConfirmToggle');
  if (confirmToggle) {
    chrome.storage.local.set({ toolConfirmationEnabled: confirmToggle.checked }, () => {
      logger.debug('[SidePanel] sensitive-operation confirmation toggle saved:', confirmToggle.checked);
    });
  }
  
  // 更新按钮状态
  updateToolsToggleState();
  
  const filteredTools = getAgentFilteredTools();
  const filteredIds = new Set(filteredTools.map(t => t.id));
  const effectiveCount = state.enabledTools.filter(id => filteredIds.has(id)).length + openServiceCount;
  showToast(effectiveCount > 0 ? t('toolPanel.toolsEnabled', { count: effectiveCount }) : t('toolPanel.allToolsDisabled'), 'success');
}

/**
 * 全选/全不选当前视图可见的 MCP 服务（供弹窗「全选/全不选」按钮调用）
 * 仅同步 state 与 checkbox，计数刷新由调用方统一处理；被助手排除的服务跳过
 * @param {boolean} checked - true=全部开放，false=全部关闭
 */
function setVisibleMcpServicesOpen(checked) {
  const services = getFilteredMcpServices();
  services.forEach(svc => {
    if (isMcpServiceExcludedByAgent(svc.serverId)) return;
    const checkbox = document.getElementById('mcpsvc_' + svc.serverId);
    if (checkbox) checkbox.checked = checked;
    toggleMcpService(svc.serverId, checked);
  });
}

function updateToolsToggleState() {
  const toolsToggleBtn = document.getElementById('toolsToggleBtn');
  const toolsBadge = document.getElementById('toolsBadge');
  const filteredTools = getAgentFilteredTools();
  const validToolIds = new Set(filteredTools.map(t => t.id));
  const validEnabledCount = state.enabledTools.filter(id => validToolIds.has(id)).length;
  // MCP 按开放服务数计入工具按钮角标（一个服务算一个）
  const services = getMcpServicesForUI();
  const openServiceCount = services.filter(svc => isMcpServiceEffectiveOpen(svc.serverId)).length;
  const effectiveEnabledCount = validEnabledCount + openServiceCount;
  
  if (toolsToggleBtn) {
    if (state.useTools && effectiveEnabledCount > 0) {
      toolsToggleBtn.classList.add('active');
      toolsToggleBtn.title = t('toolPanel.toggleBtnEnabled', { count: effectiveEnabledCount });
    } else {
      toolsToggleBtn.classList.remove('active');
      toolsToggleBtn.title = t('toolPanel.toggleBtnDisabled');
    }
  }
  
  if (toolsBadge) {
    if (effectiveEnabledCount > 0) {
      toolsBadge.textContent = effectiveEnabledCount;
      toolsBadge.style.display = 'inline';
    } else {
      toolsBadge.style.display = 'none';
    }
  }

  // 工具栏工具配置按钮：动态数字显示已启用工具数（点击仍打开配置弹窗）
  const toolsConfigCount = document.getElementById('toolsConfigCount');
  if (toolsConfigCount) {
    toolsConfigCount.textContent = effectiveEnabledCount;
  }
  const toolsConfigBtn = document.getElementById('toolsConfigBtn');
  if (toolsConfigBtn) {
    // 总开关关闭或数量为 0 时置灰（表示当前未生效）
    toolsConfigBtn.classList.toggle('active', state.useTools && effectiveEnabledCount > 0);
  }
}

export {
  openToolsPopup,
  closeToolsPopup,
  renderToolsPopupList,
  toggleCategoryCollapse,
  updateCategoryCount,
  getVisibleTools,
  updateAllCategoryCounts,
  updateCategoryBadges,
  updateToolsPopupTitle,
  saveToolsFromPopup,
  updateToolsToggleState,
  getAgentFilteredTools,
  setVisibleMcpServicesOpen,
  refreshToolPopupIfOpen,
  applyRagToolIntroduction,
  getRagToolIds
};

/**
 * RAG 工具一次性引入：首次（ragToolsIntroduced !== true）将已注册的知识库工具
 * 默认并入启用列表并标记已引入；此后完全跟随用户勾选（取消勾选持久生效）
 * @param {string[]} savedTools 已保存的启用工具 ID 列表
 * @param {Array<{id: string}>} ragTools 已注册的 RAG 工具
 * @param {boolean|undefined} introduced 是否已完成引入
 * @returns {{tools: string[], migrated: boolean}} 合并后的列表与是否需要持久化引入标记
 */
function applyRagToolIntroduction(savedTools, ragTools, introduced) {
  const base = Array.isArray(savedTools) ? savedTools : [];
  if (introduced === true || !Array.isArray(ragTools) || ragTools.length === 0) {
    return { tools: base, migrated: false };
  }
  const merged = [...base];
  for (const t of ragTools) {
    if (!merged.includes(t.id)) merged.push(t.id);
  }
  return { tools: merged, migrated: merged.length !== base.length };
}

/**
 * 当前已注册的 RAG 知识库工具 ID 列表（供侧边栏默认启用逻辑使用）
 */
function getRagToolIds() {
  return ragToolsCache.map(t => t.id);
}

/**
 * 如果工具弹窗当前打开，刷新列表、标签、标题和按钮状态
 * 用于 Agent 连接状态变化等场景
 */
function refreshToolPopupIfOpen() {
  const overlay = document.getElementById('toolsPopupOverlay');
  if (overlay?.classList.contains('show')) {
    updateCategoryBadges();
    updateToolsPopupTitle();
    renderToolsPopupList();
  }
  // 工具栏按钮数字始终刷新（Agent 连接状态变化会影响 MCP 服务可见性）
  updateToolsToggleState();
}
