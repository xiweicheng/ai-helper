// options/toolbar-config.js - 工具栏配置管理

import { DEFAULT_TOOLBAR_TOOLS, DEFAULT_TOOLBAR_ICON_ONLY, DEFAULT_ENABLE_SELECTION_TOOLBAR } from './constants.js';

let editingToolIndex = -1; // -1 表示新增，>=0 表示编辑

// 加载工具栏工具列表
export function loadToolbarTools() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['toolbarTools', 'toolbarIconOnly', 'enableSelectionToolbar'], (result) => {
      const rawTools = (result.toolbarTools && result.toolbarTools.length > 0)
        ? result.toolbarTools
        : [...DEFAULT_TOOLBAR_TOOLS];
      const iconOnly = result.toolbarIconOnly !== undefined ? result.toolbarIconOnly : DEFAULT_TOOLBAR_ICON_ONLY;
      const enableSelectionToolbar = result.enableSelectionToolbar !== undefined ? result.enableSelectionToolbar : DEFAULT_ENABLE_SELECTION_TOOLBAR;
      
      // 内置工具始终使用默认的 systemPrompt（防止旧数据缺失）
      const defaultMap = new Map(DEFAULT_TOOLBAR_TOOLS.map(t => [t.id, t]));
      const tools = rawTools.map(t => {
        if (t.builtin && defaultMap.has(t.id)) {
          return { ...t, systemPrompt: defaultMap.get(t.id).systemPrompt };
        }
        return t;
      });
      
      const iconOnlyCheckbox = document.getElementById('toolbarIconOnly');
      if (iconOnlyCheckbox) iconOnlyCheckbox.checked = iconOnly;
      const enableToolbarCheckbox = document.getElementById('enableSelectionToolbar');
      if (enableToolbarCheckbox) enableToolbarCheckbox.checked = enableSelectionToolbar;
      resolve(tools);
    });
  });
}

// 渲染工具栏工具列表
export function renderToolbarToolsList(tools) {
  const listEl = document.getElementById('toolbarToolsList');
  if (!listEl) return;
  
  const sorted = [...tools].filter(t => t.id !== 'ai-search' && t.id !== 'copy').sort((a, b) => a.order - b.order);
  
  listEl.innerHTML = sorted.map((tool, index) => {
    const isBuiltin = tool.builtin;
    const badge = isBuiltin
      ? '<span class="tool-badge builtin">内置</span>'
      : '<span class="tool-badge custom">自定义</span>';
    const promptPreview = tool.systemPrompt
      ? `<div class="tool-prompt-preview" title="${escapeHtml(tool.systemPrompt)}">${escapeHtml(tool.systemPrompt)}</div>`
      : '';
    
    const isFirst = index === 0;
    const isLast = index === sorted.length - 1;
    
    let actionsHtml = '';
    if (!isBuiltin) {
      actionsHtml += `<button class="tool-action-btn" data-action="edit" data-index="${index}">编辑</button>`;
      actionsHtml += `<button class="tool-action-btn danger" data-action="delete" data-index="${index}">删除</button>`;
    }
    
    return `
      <div class="tool-item" data-tool-id="${tool.id}" draggable="true" data-sorted-index="${index}">
        <div class="tool-drag-handle" title="拖拽排序">⋮⋮</div>
        <div class="tool-order-btns">
          <button class="tool-order-btn" data-action="moveUp" data-index="${index}" ${isFirst ? 'disabled' : ''} title="上移">▲</button>
          <button class="tool-order-btn" data-action="moveDown" data-index="${index}" ${isLast ? 'disabled' : ''} title="下移">▼</button>
        </div>
        <div class="tool-info">
          <div class="tool-name">${escapeHtml(tool.name)}${badge}</div>
          ${promptPreview}
        </div>
        <div class="tool-actions">
          ${actionsHtml}
        </div>
      </div>
    `;
  }).join('');
  
  initToolDragAndDrop();
}

// 初始化拖拽排序
function initToolDragAndDrop() {
  const list = document.getElementById('toolbarToolsList');
  if (!list) return;
  const items = list.querySelectorAll('.tool-item');
  
  items.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.dataset.sortedIndex);
    });
    
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      items.forEach(i => i.classList.remove('drag-over'));
    });
    
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over');
    });
    
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });
    
    item.addEventListener('drop', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
      const targetIndex = parseInt(item.dataset.sortedIndex);
      
      if (isNaN(draggedIndex) || isNaN(targetIndex) || draggedIndex === targetIndex) return;
      
      // 交换 order
      chrome.storage.local.get(['toolbarTools'], (result) => {
        const tools = (result.toolbarTools && result.toolbarTools.length > 0)
          ? result.toolbarTools
          : [...DEFAULT_TOOLBAR_TOOLS];
        const sorted = [...tools].filter(t => t.id !== 'ai-search' && t.id !== 'copy').sort((a, b) => a.order - b.order);
        
        if (draggedIndex >= sorted.length || targetIndex >= sorted.length) return;
        
        const temp = sorted[draggedIndex].order;
        sorted[draggedIndex].order = sorted[targetIndex].order;
        sorted[targetIndex].order = temp;
        
        // 合并回完整列表
        const fixedTools = tools.filter(t => t.id === 'ai-search' || t.id === 'copy');
        const fullTools = [...sorted, ...fixedTools];
        
        chrome.storage.local.set({ toolbarTools: fullTools }, () => {
          renderToolbarToolsList(fullTools);
        });
      });
      
      item.classList.remove('drag-over');
    });
  });
}

// 保存工具栏配置
export function saveToolbarConfig() {
  const iconOnly = document.getElementById('toolbarIconOnly')?.checked || false;
  const enableSelectionToolbar = document.getElementById('enableSelectionToolbar')?.checked !== false;
  
  chrome.storage.local.get(['toolbarTools'], (result) => {
    const tools = result.toolbarTools || [...DEFAULT_TOOLBAR_TOOLS];
    
    chrome.storage.local.set({
      toolbarTools: tools,
      toolbarIconOnly: iconOnly,
      enableSelectionToolbar: enableSelectionToolbar
    }, () => {
      console.log('[Options] 工具栏配置已保存');
    });
  });
}

// 移动工具顺序
export function moveTool(tools, index, direction) {
  // AI搜索和复制固定位置，不参与排序，先排除
  const fixedTools = tools.filter(t => t.id === 'ai-search' || t.id === 'copy');
  const nonFixedTools = [...tools].filter(t => t.id !== 'ai-search' && t.id !== 'copy').sort((a, b) => a.order - b.order);
  const targetIndex = index + direction;
  
  if (targetIndex < 0 || targetIndex >= nonFixedTools.length) return tools;
  
  const temp = nonFixedTools[index].order;
  nonFixedTools[index].order = nonFixedTools[targetIndex].order;
  nonFixedTools[targetIndex].order = temp;
  
  return [...nonFixedTools, ...fixedTools];
}

// 删除自定义工具
export function deleteTool(tools, index) {
  const fixedTools = tools.filter(t => t.id === 'ai-search' || t.id === 'copy');
  const sorted = [...tools].filter(t => t.id !== 'ai-search' && t.id !== 'copy').sort((a, b) => a.order - b.order);
  const tool = sorted[index];
  
  if (tool.builtin) {
    console.warn('[Options] 不能删除内置工具');
    return tools;
  }
  
  sorted.splice(index, 1);
  return [...sorted, ...fixedTools];
}
// 打开编辑弹窗
export function openToolEditModal(tools, index = -1) {
  editingToolIndex = index;
  const modal = document.getElementById('toolEditModal');
  const title = document.getElementById('toolEditModalTitle');
  const nameInput = document.getElementById('toolEditName');
  const promptInput = document.getElementById('toolEditPrompt');
  
  if (index >= 0) {
    const sorted = [...tools].filter(t => t.id !== 'ai-search' && t.id !== 'copy').sort((a, b) => a.order - b.order);
    const tool = sorted[index];
    title.textContent = '编辑自定义工具';
    nameInput.value = tool.name;
    promptInput.value = tool.systemPrompt || '';
  } else {
    title.textContent = '添加自定义工具';
    nameInput.value = '';
    promptInput.value = '';
  }
  
  modal.style.display = 'flex';
}

// 关闭编辑弹窗
export function closeToolEditModal() {
  document.getElementById('toolEditModal').style.display = 'none';
  editingToolIndex = -1;
}

// 保存工具编辑
export function saveToolEdit(tools) {
  const name = document.getElementById('toolEditName').value.trim();
  const prompt = document.getElementById('toolEditPrompt').value.trim();
  
  if (!name) return { error: '工具名称不能为空' };
  if (!prompt) return { error: '系统提示词不能为空' };
  
  const newTools = [...tools].sort((a, b) => a.order - b.order);
  
  if (editingToolIndex >= 0) {
    // 编辑时索引基于过滤后的列表（不含AI搜索和复制），先过滤再查找
    const filtered = newTools.filter(t => t.id !== 'ai-search' && t.id !== 'copy');
    const tool = filtered[editingToolIndex];
    if (!tool) return { error: '未找到该工具' };
    if (tool.builtin) return { error: '不能编辑内置工具' };
    tool.name = name;
    tool.systemPrompt = prompt;
  } else {
    const maxOrder = newTools.length > 0
      ? Math.max(...newTools.map(t => t.order))
      : 0;
    newTools.push({
      id: 'custom_' + Date.now(),
      name: name,
      systemPrompt: prompt,
      builtin: false,
      order: maxOrder + 1
    });
  }
  
  closeToolEditModal();
  // 保留固定工具（AI搜索、复制）在最后
  const fixedTools = tools.filter(t => t.id === 'ai-search' || t.id === 'copy');
  fixedTools.forEach(ft => {
    if (!newTools.find(t => t.id === ft.id)) {
      newTools.push(ft);
    }
  });
  return { tools: newTools };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== 域名屏蔽列表管理 ====================

// 加载并渲染屏蔽域名列表
export function loadBlockedDomainsUI() {
  chrome.storage.local.get(['blockedDomains'], (result) => {
    const list = result.blockedDomains || [];
    renderBlockedDomainsList(list);
  });
}

// 渲染屏蔽域名列表
function renderBlockedDomainsList(list) {
  const listEl = document.getElementById('domainBlocklistList');
  if (!listEl) return;
  
  if (list.length === 0) {
    listEl.innerHTML = '<div class="domain-blocklist-empty">暂无屏蔽域名，在上方输入域名添加</div>';
  } else {
    listEl.innerHTML = list.map(domain => `
      <div class="domain-blocklist-item">
        <span class="domain-blocklist-item-name" title="${escapeHtml(domain)}">${escapeHtml(domain)}</span>
        <button class="domain-blocklist-item-remove" data-domain="${escapeHtml(domain)}" title="取消屏蔽">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
    `).join('');
  }
}

// 添加域名到屏蔽列表
export function addBlockedDomain(domain, callback) {
  domain = domain.trim().toLowerCase();
  if (!domain) {
    if (callback) callback({ error: '域名不能为空' });
    return;
  }
  if (!domain.includes('.')) {
    if (callback) callback({ error: '请输入有效的域名，例如 example.com' });
    return;
  }
  
  chrome.storage.local.get(['blockedDomains'], (result) => {
    const list = result.blockedDomains || [];
    if (list.includes(domain)) {
      if (callback) callback({ error: '该域名已存在' });
      return;
    }
    list.push(domain);
    chrome.storage.local.set({ blockedDomains: list }, () => {
      renderBlockedDomainsList(list);
      if (callback) callback({});
    });
  });
}

// 移除域名
export function removeBlockedDomain(domain) {
  chrome.storage.local.get(['blockedDomains'], (result) => {
    const list = (result.blockedDomains || []).filter(d => d !== domain);
    chrome.storage.local.set({ blockedDomains: list }, () => {
      renderBlockedDomainsList(list);
    });
  });
}