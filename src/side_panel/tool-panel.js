import state from './state.js';
import { BUILTIN_TOOLS, TOOL_CATEGORY_NAMES, CATEGORY_ORDER } from './constants.js';
import { showToast, escapeHtml } from './utils.js';
import { saveCurrentSession } from './session-manager.js';

/**
 * 获取当前 Agent 限定范围内的工具列表
 * null = 没有限制（默认助手），返回全部工具
 * [] = 空数组，没有工具
 * [id1, id2] = 只返回这些 ID 对应的工具
 */
function getAgentFilteredTools() {
  const toolIds = state.activeAgentToolIds;
  if (toolIds === null || toolIds === undefined) return BUILTIN_TOOLS;
  const filterSet = new Set(toolIds);
  return BUILTIN_TOOLS.filter(t => filterSet.has(t.id));
}

function openToolsPopup() {
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
  
  // 更新标签角标数字
  updateCategoryBadges();
  
  // 更新标题中的启用工具数
  updateToolsPopupTitle();
  
  // 加载工具预筛选开关状态
  chrome.storage.local.get(['enableToolPreselect'], (result) => {
    const toggle = document.getElementById('toolsPreselectToggle');
    if (toggle) {
      const enabled = result.enableToolPreselect !== undefined ? result.enableToolPreselect : true;
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
  
  console.log('[SidePanel] 打开工具弹窗');
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
  
  console.log('[SidePanel] 关闭工具弹窗');
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
  
  // 获取该分类下的所有工具checkbox
  const categoryTools = BUILTIN_TOOLS.filter(t => t.category === category);
  const totalCount = categoryTools.length;
  
  // 计算当前选中的数量
  let enabledCount = 0;
  categoryTools.forEach(tool => {
    const checkbox = document.getElementById('tool_' + tool.id);
    if (checkbox && checkbox.checked) {
      enabledCount++;
    }
  });
  
  // 更新数字显示
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
  const validToolIds = new Set(BUILTIN_TOOLS.map(t => t.id));
  
  BUILTIN_TOOLS.forEach(tool => {
    const checkbox = document.getElementById('tool_' + tool.id);
    if (checkbox) {
      // 可见工具：根据 checkbox 状态决定
      if (checkbox.checked) {
        newEnabledTools.push(tool.id);
      }
    } else {
      // 不可见工具：保持原始状态（只保留 BUILTIN_TOOLS 中存在的 ID）
      if (state.enabledTools.includes(tool.id)) {
        newEnabledTools.push(tool.id);
      }
    }
  });
  
  state.enabledTools = newEnabledTools;
  state.useTools = state.enabledTools.length > 0;
  
  // 保存到 storage
  chrome.storage.local.set({ enabledTools: state.enabledTools }, () => {
    console.log('[SidePanel] 工具配置已保存:', state.enabledTools);
  });
  
  // 同步更新当前会话的 enabledTools，避免下次加载时被旧会话数据覆盖
  saveCurrentSession().catch(() => {});

  // 保存工具预筛选开关状态
  const preselectToggle = document.getElementById('toolsPreselectToggle');
  if (preselectToggle) {
    chrome.storage.local.set({ enableToolPreselect: preselectToggle.checked }, () => {
      console.log('[SidePanel] 工具预筛选开关已保存:', preselectToggle.checked);
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
  getAgentFilteredTools
};
