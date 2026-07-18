import state from './state.js';
import { BUILTIN_TOOLS, TOOL_CATEGORY_NAMES, CATEGORY_ORDER } from './constants.js';
import { showToast, escapeHtml } from './utils.js';
import { saveCurrentSession } from './session-manager.js';
import logger from '../shared/logger.js';

// MCP 工具缓存（从 chrome.storage.local 读取）
let mcpToolsCache = [];

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

// 监听 MCP 工具更新和全局开关变化，实时同步
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let needsRefresh = false;

  if (changes.mcpTools) {
    mcpToolsCache = changes.mcpTools.newValue || [];
    logger.debug('[SidePanel] MCP 工具缓存已更新:', mcpToolsCache.length, '个');
    needsRefresh = true;
  }
  if (changes.mcpEnabled) {
    globalMcpEnabled = changes.mcpEnabled.newValue === true;
    logger.debug('[SidePanel] MCP 全局开关变更:', globalMcpEnabled);
    needsRefresh = true;
  }
  if (changes.skillsEnabled) {
    globalSkillsEnabled = changes.skillsEnabled.newValue !== false;
    logger.debug('[SidePanel] Skill 全局开关变更:', globalSkillsEnabled);
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
  }
});

// 模块初始化时预加载 MCP 工具缓存
loadMcpToolsFromStorage();

// 全局开关状态（从 chrome.storage 加载，通过 onChanged 实时更新）
let globalMcpEnabled = false;
let globalSkillsEnabled = true;

// 加载全局开关初始状态
chrome.storage.local.get(['mcpEnabled', 'skillsEnabled'], (result) => {
  globalMcpEnabled = result.mcpEnabled === true;
  globalSkillsEnabled = result.skillsEnabled !== false;
});

/**
 * 获取当前 Agent 限定范围内的工具列表（含 MCP 工具）
 * null = 没有限制（默认助手），返回全部工具
 * [] = 空数组，没有工具
 * [id1, id2] = 只返回这些 ID 对应的工具
 */
function getAgentFilteredTools() {
  // 根据全局开关决定是否包含 MCP 工具
  const mcpTools = globalMcpEnabled ? mcpToolsCache : [];
  const allTools = [...BUILTIN_TOOLS, ...mcpTools];
  const toolIds = state.activeAgentToolIds;
  let filtered = allTools;
  if (toolIds !== null && toolIds !== undefined) {
    // MCP 工具是动态注册的，不参与 Agent 白名单过滤
    const filterSet = new Set(toolIds);
    filtered = allTools.filter(t => t.id.startsWith('mcp_') || filterSet.has(t.id));
  }
  // Skill 全局开关关闭时，过滤掉 Skill 相关工具
  if (!globalSkillsEnabled) {
    filtered = filtered.filter(t => t.id !== 'agent_workflow_run' && t.id !== 'agent_skill_load');
  }
  // Agent 未连接时，隐藏所有 agent_* 和 mcp_* 工具（依赖代理服务的工具）
  const agentConnected = state.agentPlatform?.connected === true;
  if (!agentConnected) {
    filtered = filtered.filter(t => !t.id.startsWith('agent_') && !t.id.startsWith('mcp_'));
  }
  return filtered;
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
  
  // 先从 storage 加载 MCP 工具
  await loadMcpToolsFromStorage();
  
  // 更新标签角标数字
  updateCategoryBadges();
  
  // 更新标题中的启用工具数
  updateToolsPopupTitle();
  
  // 加载工具预筛选开关状态
  chrome.storage.local.get(['enableToolPreselect'], (result) => {
    const toggle = document.getElementById('toolsPreselectToggle');
    if (toggle) {
      const enabled = result.enableToolPreselect !== undefined ? result.enableToolPreselect : false;
      toggle.checked = enabled;
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
  
  logger.debug('[SidePanel] 打开工具弹窗');
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
  
  logger.debug('[SidePanel] 关闭工具弹窗');
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
    banner.innerHTML = `<span>🔒 当前助手已限定工具范围，以下仅展示该助手绑定的工具（范围内可自由调整）</span>`;
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
      const descMatch = tool.description.toLowerCase().includes(state.currentSearch);
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
  
  // 分类名称映射（用于显示）
  const categoryNames = TOOL_CATEGORY_NAMES;
  
  // 优化后的分类排序（按使用频率和逻辑顺序）
  const categoryOrder = CATEGORY_ORDER;
  
  categoryOrder.forEach(category => {
    const tools = groupedTools[category];
    if (!tools || tools.length === 0) return;
    
    // 计算该分类下的工具总数和已启用数（使用过滤后的工具列表）
    const categoryTools = filteredTools.filter(t => t.category === category);
    const totalCount = categoryTools.length;
    const enabledCount = categoryTools.filter(t => state.enabledTools.includes(t.id)).length;
    
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
      <span class="category-name">${categoryNames[category] || category}</span>
      <span class="category-count">${enabledCount}/${totalCount}</span>
    `;
    
    // 添加折叠点击事件
    categoryHeader.addEventListener('click', () => {
      toggleCategoryCollapse(category);
    });
    
    categoryContainer.appendChild(categoryHeader);
    
    // 创建工具列表容器
    const toolsContainer = document.createElement('div');
    toolsContainer.className = `popup-tool-items ${isCollapsed ? 'collapsed' : ''}`;
    
    // 添加该分类下的工具
    tools.forEach(tool => {
      const isChecked = state.enabledTools.includes(tool.id);
      
      const toolItem = document.createElement('div');
      toolItem.className = 'popup-tool-item';
      toolItem.dataset.category = category;
      toolItem.innerHTML = `
        <input type="checkbox" id="tool_${tool.id}" ${isChecked ? 'checked' : ''}>
        <div class="popup-tool-content">
          <div class="popup-tool-name">${escapeHtml(tool.name)}</div>
          <div class="popup-tool-desc">${escapeHtml(tool.description)}</div>
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
        });
      }
      
      toolsContainer.appendChild(toolItem);
    });
    
    categoryContainer.appendChild(toolsContainer);
    toolsList.appendChild(categoryContainer);
  });
  
  // 如果没有结果
  if (toolsList.children.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'popup-tool-empty';
    emptyMsg.textContent = '没有找到匹配的工具';
    toolsList.appendChild(emptyMsg);
  }
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

function updateCategoryCount(category) {
  const categoryHeader = document.querySelector(`.popup-tool-category[data-category="${category}"]`);
  if (!categoryHeader) return;
  
  const countSpan = categoryHeader.querySelector('.category-count');
  if (!countSpan) return;
  
  // MCP 分类需要额外统计 mcpToolsCache 中的工具
  const categoryTools = category === 'mcp'
    ? [...BUILTIN_TOOLS.filter(t => t.category === category), ...mcpToolsCache.filter(t => t.category === category)]
    : BUILTIN_TOOLS.filter(t => t.category === category);
  const totalCount = categoryTools.length;
  
  let enabledCount = 0;
  categoryTools.forEach(tool => {
    const checkbox = document.getElementById('tool_' + tool.id);
    if (checkbox && checkbox.checked) {
      enabledCount++;
    }
  });
  
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
      const descMatch = tool.description.toLowerCase().includes(state.currentSearch.toLowerCase());
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
  });
}

function updateCategoryBadges() {
  const categories = ['all', ...CATEGORY_ORDER];
  const filteredTools = getAgentFilteredTools();
  const validToolIds = new Set(filteredTools.map(t => t.id));
  // 只统计当前可见工具中启用的数量
  const validEnabledCount = state.enabledTools.filter(id => validToolIds.has(id)).length;
  
  categories.forEach(category => {
    const badge = document.getElementById('badge-' + category);
    if (!badge) return;
    
    let totalCount = 0;
    let enabledCount = 0;
    
    if (category === 'all') {
      totalCount = filteredTools.length;
      enabledCount = validEnabledCount;
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
  const totalCount = filteredTools.length;
  const validToolIds = new Set(filteredTools.map(t => t.id));
  const enabledCount = state.enabledTools.filter(id => validToolIds.has(id)).length;
  
  countSpan.textContent = `(已启用 ${enabledCount}/${totalCount})`;
}

function saveToolsFromPopup() {
  const newEnabledTools = [];
  const allTools = [...BUILTIN_TOOLS, ...mcpToolsCache];
  const validToolIds = new Set(allTools.map(t => t.id));
  
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
  state.useTools = state.enabledTools.length > 0;
  
  // 保存到当前智能体独立的 storage key
  const agentToolsKey = `agentEnabledTools_${state.activeAgentId || 'default'}`;
  chrome.storage.local.set({ [agentToolsKey]: state.enabledTools }, () => {
    logger.debug('[SidePanel] 工具配置已保存到智能体:', agentToolsKey, state.enabledTools);
  });
  
  // 同步更新当前会话的 enabledTools，避免下次加载时被旧会话数据覆盖
  saveCurrentSession().catch(() => {});

  // 保存工具预筛选开关状态
  const preselectToggle = document.getElementById('toolsPreselectToggle');
  if (preselectToggle) {
    chrome.storage.local.set({ enableToolPreselect: preselectToggle.checked }, () => {
      logger.debug('[SidePanel] 工具预筛选开关已保存:', preselectToggle.checked);
    });
  }
  
  // 更新按钮状态
  updateToolsToggleState();
  
  const filteredTools = getAgentFilteredTools();
  const filteredIds = new Set(filteredTools.map(t => t.id));
  const effectiveCount = state.enabledTools.filter(id => filteredIds.has(id)).length;
  showToast(state.useTools ? `已启用 ${effectiveCount} 个工具` : '工具已全部禁用', 'success');
}

function updateToolsToggleState() {
  const toolsToggleBtn = document.getElementById('toolsToggleBtn');
  const toolsBadge = document.getElementById('toolsBadge');
  const filteredTools = getAgentFilteredTools();
  const validToolIds = new Set(filteredTools.map(t => t.id));
  const validEnabledCount = state.enabledTools.filter(id => validToolIds.has(id)).length;
  
  if (toolsToggleBtn) {
    if (state.useTools && validEnabledCount > 0) {
      toolsToggleBtn.classList.add('active');
      toolsToggleBtn.title = `工具 (${validEnabledCount}个启用)`;
    } else {
      toolsToggleBtn.classList.remove('active');
      toolsToggleBtn.title = '工具 (未启用)';
    }
  }
  
  if (toolsBadge) {
    if (validEnabledCount > 0) {
      toolsBadge.textContent = validEnabledCount;
      toolsBadge.style.display = 'inline';
    } else {
      toolsBadge.style.display = 'none';
    }
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
  refreshToolPopupIfOpen
};

/**
 * 如果工具弹窗当前打开，刷新列表、标签、标题和按钮状态
 * 用于 Agent 连接状态变化等场景
 */
function refreshToolPopupIfOpen() {
  const overlay = document.getElementById('toolsPopupOverlay');
  if (overlay?.classList.contains('show')) {
    updateCategoryBadges();
    updateToolsPopupTitle();
    updateToolsToggleState();
    renderToolsPopupList();
  }
}
