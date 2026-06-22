// options/constants.js - 常量定义

// 预设模型列表
const PRESET_MODELS = [
  'deepseek-v4-pro',
  'deepseek-v4-flash'
];

// 默认系统提示词
const DEFAULT_SYSTEM_PROMPT = `你是AI智能助手(AI Helper)，专为IT从业者（产品经理、架构师、开发工程师、测试工程师等）打造的AI技术助手。

## 你的能力
- **编程开发**：精通主流编程语言（Java/Python/JavaScript/Go/C++等）及框架，能编写、调试、优化代码
- **技术问题解答**：擅长解答架构设计、算法优化、性能调优、Bug排查等技术问题
- **代码审查**：能提供代码质量评估、最佳实践建议、潜在风险识别
- **文档编写**：协助撰写技术文档、API说明、测试用例等
- **工具使用**：可调用浏览器工具获取当前网页内容或选中文本，辅助解答与网页相关的问题

## 回答原则
1. **精准专业**：使用准确的技术术语，回答直击要点
2. **代码优先**：涉及代码时，优先给出可运行的代码示例，并添加必要注释
3. **结构清晰**：善用Markdown格式（标题、列表、代码块、表格等）组织内容
4. **实用导向**：提供可落地的解决方案，避免空泛的理论
5. **安全合规**：不生成违反安全规范的代码，不涉及敏感信息处理`;

// ReAct 配置默认值
const DEFAULT_REACT_CONFIG = {
  maxIterations: 5,
  apiTimeout: 60000,
  loopTimeout: 300000,
  toolTimeout: 30000,
  clarifyTimeout: 180000,
  apiRetryCount: 3,
  apiRetryBaseDelay: 1000
};

// 默认工具栏工具配置
const DEFAULT_TOOLBAR_TOOLS = [
  { id: 'ai-search',  name: 'AI搜索', systemPrompt: '使用ReAct Agent模式，通过多轮思考、搜索和推理来回答选中的问题。', builtin: true, order: 0 },
  { id: 'explain',   name: '解释',   systemPrompt: '对选中的内容进行解释说明，帮助理解其含义。', builtin: true, order: 1 },
  { id: 'translate', name: '翻译',   systemPrompt: '将选中的内容翻译成中文。', builtin: true, order: 2 },
  { id: 'summary',   name: '总结',   systemPrompt: '对选中的内容进行归纳总结，提炼关键要点。', builtin: true, order: 3 },
  { id: 'copy',      name: '复制',   systemPrompt: '将选中内容复制到剪贴板。', builtin: true, order: 99 }
];

// 工具栏默认直接显示数量
const DEFAULT_TOOLBAR_MAX_VISIBLE = 4;
const DEFAULT_TOOLBAR_ICON_ONLY = false;

// 对话配置默认值
const DEFAULT_CHAT_CONFIG = {
  maxInputHistory: 20,
  maxHistoryMessages: 50,
  maxMessageLength: 5000,
  maxMemoryMessages: null,   // 记忆历史限制条数，null表示不限制
  enableExecutionLog: false  // 默认关闭执行日志
};

// options/config-manager.js - 配置管理与状态

let currentModel = 'deepseek-v4-pro';
function setCurrentModel(value) { currentModel = value; }

// 添加自定义模型到下拉列表
function addCustomModelToDropdown(modelName) {
  const modelDropdown = document.getElementById('modelDropdown');
  // 检查是否已存在
  const existingOption = modelDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
  if (existingOption) return;
  
  const option = document.createElement('div');
  option.className = 'model-option';
  option.dataset.value = modelName;
  option.dataset.isCustom = 'true';
  option.textContent = modelName;
  
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-model-btn';
  deleteBtn.title = '删除此模型';
  deleteBtn.innerHTML = '×';
  option.appendChild(deleteBtn);
  
  modelDropdown.appendChild(option);
  
  // 保存自定义模型到存储
  saveCustomModels();
}

// 从下拉列表移除自定义模型
function removeCustomModel(modelName) {
  const modelDropdown = document.getElementById('modelDropdown');
  const option = modelDropdown.querySelector(`.model-option[data-value="${modelName}"][data-is-custom="true"]`);
  if (option) {
    option.remove();
  }
  
  // 如果当前选中的是被删除的模型，恢复为默认
  if (currentModel === modelName) {
    setCurrentModel('deepseek-v4-pro');
    document.getElementById('modelInput').value = currentModel;
    updateModelSelection(currentModel);
  }
  
  // 更新存储
  saveCustomModels();
}

// 保存自定义模型到存储
function saveCustomModels() {
  const modelDropdown = document.getElementById('modelDropdown');
  const customModels = [];
  modelDropdown.querySelectorAll('.model-option[data-is-custom="true"]').forEach(option => {
    customModels.push(option.dataset.value);
  });
  chrome.storage.local.set({ customModels }, () => {
    console.log('[Options] 自定义模型已保存:', customModels);
  });
}

// 加载自定义模型到下拉列表
function loadCustomModels(callback) {
  chrome.storage.local.get(['customModels'], (result) => {
    const modelDropdown = document.getElementById('modelDropdown');
    const customModels = result.customModels || [];
    
    customModels.forEach(modelName => {
      // 检查是否已存在
      const existingOption = modelDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
      if (existingOption) return;
      
      const option = document.createElement('div');
      option.className = 'model-option';
      option.dataset.value = modelName;
      option.dataset.isCustom = 'true';
      option.textContent = modelName;
      
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-model-btn';
      deleteBtn.title = '删除此模型';
      deleteBtn.innerHTML = '×';
      option.appendChild(deleteBtn);
      
      modelDropdown.appendChild(option);
    });
    
    // 调用回调函数
    if (typeof callback === 'function') {
      callback();
    }
  });
}

// 更新模型选中状态
function updateModelSelection(selectedValue) {
  document.querySelectorAll('.model-option').forEach(option => {
    if (option.dataset.value === selectedValue) {
      option.classList.add('selected');
    } else {
      option.classList.remove('selected');
    }
  });
}

// 加载配置
function loadConfig() {
  chrome.storage.local.get([
    'apiBase', 'apiKey', 'modelName', 'customModels', 'systemPrompt',
    'reactMaxIterations', 'reactApiTimeout', 'reactLoopTimeout', 'reactToolTimeout', 'reactClarifyTimeout',
    'reactApiRetryCount', 'reactApiRetryBaseDelay',
    'chatMaxInputHistory', 'chatMaxHistoryMessages', 'chatMaxMessageLength', 'chatMaxMemoryMessages', 'enableExecutionLog'
  ], function(result) {
    if (result.apiBase) {
      document.getElementById('apiBase').value = result.apiBase;
    }
    if (result.apiKey) {
      document.getElementById('apiKey').value = result.apiKey;
    }
    if (result.modelName) {
      setCurrentModel(result.modelName);
      document.getElementById('modelInput').value = result.modelName;
    }
    if (result.systemPrompt) {
      document.getElementById('systemPrompt').value = result.systemPrompt;
    }
    
    // 加载 ReAct 配置（时间单位转换）
    document.getElementById('reactMaxIterations').value = 
      result.reactMaxIterations || DEFAULT_REACT_CONFIG.maxIterations;
    document.getElementById('reactApiTimeout').value = 
      (result.reactApiTimeout || DEFAULT_REACT_CONFIG.apiTimeout) / 1000;
    document.getElementById('reactLoopTimeout').value = 
      Math.round((result.reactLoopTimeout || DEFAULT_REACT_CONFIG.loopTimeout) / 60000);
    document.getElementById('reactToolTimeout').value = 
      (result.reactToolTimeout || DEFAULT_REACT_CONFIG.toolTimeout) / 1000;
    document.getElementById('reactClarifyTimeout').value = 
      Math.round((result.reactClarifyTimeout || DEFAULT_REACT_CONFIG.clarifyTimeout) / 60000);
    document.getElementById('reactApiRetryCount').value = 
      result.reactApiRetryCount !== undefined ? result.reactApiRetryCount : DEFAULT_REACT_CONFIG.apiRetryCount;
    document.getElementById('reactApiRetryBaseDelay').value = 
      result.reactApiRetryBaseDelay !== undefined ? result.reactApiRetryBaseDelay : DEFAULT_REACT_CONFIG.apiRetryBaseDelay;
    
    // 加载对话配置
    document.getElementById('chatMaxInputHistory').value = 
      result.chatMaxInputHistory || DEFAULT_CHAT_CONFIG.maxInputHistory;
    document.getElementById('chatMaxHistoryMessages').value = 
      result.chatMaxHistoryMessages || DEFAULT_CHAT_CONFIG.maxHistoryMessages;
    document.getElementById('chatMaxMessageLength').value = 
      result.chatMaxMessageLength || DEFAULT_CHAT_CONFIG.maxMessageLength;
    if (result.chatMaxMemoryMessages !== undefined && result.chatMaxMemoryMessages !== null) {
      document.getElementById('chatMaxMemoryMessages').value = result.chatMaxMemoryMessages;
    }
    
    // 加载执行日志配置
    document.getElementById('enableExecutionLog').checked = 
      result.enableExecutionLog || DEFAULT_CHAT_CONFIG.enableExecutionLog;
    
    // 先加载自定义模型到下拉列表，再更新选中状态
    loadCustomModels(() => {
      if (result.modelName) {
        updateModelSelection(result.modelName);
      }
    });
  });
}

// 保存配置
function saveConfig() {
  let apiBase = document.getElementById('apiBase').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  const systemPrompt = document.getElementById('systemPrompt').value.trim();
  
  // 获取 ReAct 配置（时间单位转换）
  const reactMaxIterations = parseInt(document.getElementById('reactMaxIterations').value) || DEFAULT_REACT_CONFIG.maxIterations;
  const reactApiTimeout = (parseInt(document.getElementById('reactApiTimeout').value) || 60) * 1000;
  const reactLoopTimeout = (parseInt(document.getElementById('reactLoopTimeout').value) || 5) * 60000;
  const reactToolTimeout = (parseInt(document.getElementById('reactToolTimeout').value) || 30) * 1000;
  const reactClarifyTimeout = (parseInt(document.getElementById('reactClarifyTimeout').value) || 3) * 60000;
  const reactApiRetryCount = parseInt(document.getElementById('reactApiRetryCount').value) ?? DEFAULT_REACT_CONFIG.apiRetryCount;
  const reactApiRetryBaseDelay = parseInt(document.getElementById('reactApiRetryBaseDelay').value) || DEFAULT_REACT_CONFIG.apiRetryBaseDelay;
  
  // 获取对话配置
  const chatMaxInputHistory = parseInt(document.getElementById('chatMaxInputHistory').value) || DEFAULT_CHAT_CONFIG.maxInputHistory;
  const chatMaxHistoryMessages = parseInt(document.getElementById('chatMaxHistoryMessages').value) || DEFAULT_CHAT_CONFIG.maxHistoryMessages;
  const chatMaxMessageLength = parseInt(document.getElementById('chatMaxMessageLength').value) || DEFAULT_CHAT_CONFIG.maxMessageLength;
  const chatMaxMemoryMessagesInput = document.getElementById('chatMaxMemoryMessages').value.trim();
  const chatMaxMemoryMessages = chatMaxMemoryMessagesInput ? parseInt(chatMaxMemoryMessagesInput) : null;
  const enableExecutionLog = document.getElementById('enableExecutionLog').checked;
  
  // 验证 ReAct 配置范围
  if (reactMaxIterations < 1 || reactMaxIterations > 100) {
    showToast('❌ 最大循环次数必须在 1-100 之间', 'error');
    return;
  }
  if (reactApiTimeout < 10000 || reactApiTimeout > 600000) {
    showToast('❌ API 请求超时必须在 10-600 秒 之间', 'error');
    return;
  }
  if (reactLoopTimeout < 60000 || reactLoopTimeout > 1800000) {
    showToast('❌ 整体循环超时必须在 1-30 分钟 之间', 'error');
    return;
  }
  if (reactToolTimeout < 5000 || reactToolTimeout > 600000) {
    showToast('❌ 工具执行超时必须在 5-600 秒 之间', 'error');
    return;
  }
  if (reactClarifyTimeout < 60000 || reactClarifyTimeout > 600000) {
    showToast('❌ 澄清等待超时必须在 1-10 分钟 之间', 'error');
    return;
  }
  if (reactApiRetryCount < 0 || reactApiRetryCount > 10) {
    showToast('❌ API 重试次数必须在 0-10 之间', 'error');
    return;
  }
  if (reactApiRetryBaseDelay < 500 || reactApiRetryBaseDelay > 30000) {
    showToast('❌ API 重试基础延迟必须在 500-30000ms 之间', 'error');
    return;
  }
  
  // 验证对话配置范围
  if (chatMaxInputHistory < 10 || chatMaxInputHistory > 100) {
    showToast('❌ 最大输入历史记录数必须在 10-100 之间', 'error');
    return;
  }
  if (chatMaxHistoryMessages < 10 || chatMaxHistoryMessages > 200) {
    showToast('❌ 最大保留对话轮数必须在 10-200 之间', 'error');
    return;
  }
  if (chatMaxMessageLength < 1000 || chatMaxMessageLength > 50000) {
    showToast('❌ 单条消息最大字符数必须在 1000-50000 之间', 'error');
    return;
  }
  if (chatMaxMemoryMessages !== null && (chatMaxMemoryMessages < 1 || chatMaxMemoryMessages > 400)) {
    showToast('❌ 记忆历史限制条数必须在 1-400 之间或置空', 'error');
    return;
  }
  
  // API Base URL 有默认值
  if (!apiBase) {
    apiBase = 'https://api.deepseek.com';
  }
  
  // 验证必填字段
  if (!apiKey) {
    showToast('❌ API Key 不能为空', 'error');
    return;
  }
  
  // 保存配置
  chrome.storage.local.set({ 
    apiBase: apiBase,
    apiKey: apiKey,
    modelName: currentModel || 'deepseek-v4-pro',
    systemPrompt: systemPrompt,
    // ReAct 配置
    reactMaxIterations: reactMaxIterations,
    reactApiTimeout: reactApiTimeout,
    reactLoopTimeout: reactLoopTimeout,
    reactToolTimeout: reactToolTimeout,
    reactClarifyTimeout: reactClarifyTimeout,
    reactApiRetryCount: reactApiRetryCount,
    reactApiRetryBaseDelay: reactApiRetryBaseDelay,
    // 对话配置
    chatMaxInputHistory: chatMaxInputHistory,
    chatMaxHistoryMessages: chatMaxHistoryMessages,
    chatMaxMessageLength: chatMaxMessageLength,
    chatMaxMemoryMessages: chatMaxMemoryMessages,
    enableExecutionLog: enableExecutionLog
  }, function() {
    if (chrome.runtime.lastError) {
      showToast('❌ 保存失败：' + chrome.runtime.lastError.message, 'error');
    } else {
      showToast('✅ 配置已保存成功！', 'success');
      const status = document.getElementById('status');
      status.style.display = 'none';
      updateConfigDetails(apiBase, currentModel, {
        maxIterations: reactMaxIterations,
        apiTimeout: reactApiTimeout,
        loopTimeout: reactLoopTimeout,
        toolTimeout: reactToolTimeout,
        clarifyTimeout: reactClarifyTimeout,
        apiRetryCount: reactApiRetryCount,
        apiRetryBaseDelay: reactApiRetryBaseDelay
      }, {
        maxInputHistory: chatMaxInputHistory,
        maxHistoryMessages: chatMaxHistoryMessages,
        maxMessageLength: chatMaxMessageLength,
        maxMemoryMessages: chatMaxMemoryMessages,
        enableExecutionLog: enableExecutionLog
      });
    }
  });
}

// 显示 Toast 提示
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  // 触发动画
  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });
  
  // 自动移除
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}

// 初始化状态显示
function initStatus() {
  const details = document.getElementById('configDetails');
  details.textContent = '💡 提示：保存配置后，新配置将立即生效';
}

// 更新配置详情显示
function updateConfigDetails(apiBase, modelName, reactConfig, chatConfig) {
  const details = document.getElementById('configDetails');
  const base = apiBase || 'https://api.deepseek.com';
  const model = modelName || 'deepseek-v4-pro';
  const react = reactConfig || DEFAULT_REACT_CONFIG;
  const chat = chatConfig || DEFAULT_CHAT_CONFIG;
  
  const formatTime = (ms) => {
    if (ms >= 60000) {
      return `${Math.round(ms / 60000)}分钟`;
    }
    return `${Math.round(ms / 1000)}秒`;
  };
  
  details.innerHTML = `
    <strong>当前配置：</strong><br>
    API Base: ${base}<br>
    模型名称: ${model}<br>
    <hr style="margin: 8px 0; border: none; border-top: 1px dashed #ccc;">
    <strong>ReAct 配置：</strong><br>
    最大循环次数: ${react.maxIterations} 次<br>
    API 请求超时: ${formatTime(react.apiTimeout)}<br>
    整体循环超时: ${formatTime(react.loopTimeout)}<br>
    工具执行超时: ${formatTime(react.toolTimeout)}<br>
    澄清等待超时: ${formatTime(react.clarifyTimeout)}<br>
    API 重试次数: ${react.apiRetryCount} 次<br>
    API 重试基础延迟: ${react.apiRetryBaseDelay}ms<br>
    <hr style="margin: 8px 0; border: none; border-top: 1px dashed #ccc;">
    <strong>对话配置：</strong><br>
    输入历史记录数: ${chat.maxInputHistory} 条<br>
    最大对话轮数: ${chat.maxHistoryMessages} 轮<br>
    消息最大长度: ${chat.maxMessageLength} 字符<br>
    记忆历史限制条数: ${chat.maxMemoryMessages !== null ? chat.maxMemoryMessages + ' 条' : '不限制'}<br>
    执行日志: ${chat.enableExecutionLog ? '✅ 启用' : '❌ 关闭'}<br>
    <hr style="margin: 8px 0; border: none; border-top: 1px dashed #ccc;">
    💡 <strong>提示</strong>：澄清等待时间不计入整体循环超时<br>
    ⚠️ API Key 如果过期或失效，需要重新生成并更新配置
  `;
}

// options/toolbar-config.js - 工具栏配置管理

let editingToolIndex = -1; // -1 表示新增，>=0 表示编辑

// 加载工具栏工具列表
function loadToolbarTools() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['toolbarTools', 'toolbarMaxVisible', 'toolbarIconOnly'], (result) => {
      const rawTools = (result.toolbarTools && result.toolbarTools.length > 0)
        ? result.toolbarTools
        : [...DEFAULT_TOOLBAR_TOOLS];
      const maxVisible = result.toolbarMaxVisible || DEFAULT_TOOLBAR_MAX_VISIBLE;
      const iconOnly = result.toolbarIconOnly !== undefined ? result.toolbarIconOnly : DEFAULT_TOOLBAR_ICON_ONLY;
      
      // 内置工具始终使用默认的 systemPrompt（防止旧数据缺失）
      const defaultMap = new Map(DEFAULT_TOOLBAR_TOOLS.map(t => [t.id, t]));
      const tools = rawTools.map(t => {
        if (t.builtin && defaultMap.has(t.id)) {
          return { ...t, systemPrompt: defaultMap.get(t.id).systemPrompt };
        }
        return t;
      });
      
      document.getElementById('toolbarMaxVisible').value = maxVisible;
      const iconOnlyCheckbox = document.getElementById('toolbarIconOnly');
      if (iconOnlyCheckbox) iconOnlyCheckbox.checked = iconOnly;
      resolve(tools);
    });
  });
}

// 渲染工具栏工具列表
function renderToolbarToolsList(tools) {
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
function saveToolbarConfig() {
  const maxVisible = parseInt(document.getElementById('toolbarMaxVisible').value) || DEFAULT_TOOLBAR_MAX_VISIBLE;
  const iconOnly = document.getElementById('toolbarIconOnly')?.checked || false;
  
  chrome.storage.local.get(['toolbarTools'], (result) => {
    const tools = result.toolbarTools || [...DEFAULT_TOOLBAR_TOOLS];
    
    chrome.storage.local.set({
      toolbarTools: tools,
      toolbarMaxVisible: Math.max(1, Math.min(5, maxVisible)),
      toolbarIconOnly: iconOnly
    }, () => {
      console.log('[Options] 工具栏配置已保存');
    });
  });
}

// 移动工具顺序
function moveTool(tools, index, direction) {
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
function deleteTool(tools, index) {
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
function openToolEditModal(tools, index = -1) {
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
function closeToolEditModal() {
  document.getElementById('toolEditModal').style.display = 'none';
  editingToolIndex = -1;
}

// 保存工具编辑
function saveToolEdit(tools) {
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
function loadBlockedDomainsUI() {
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
function addBlockedDomain(domain, callback) {
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
function removeBlockedDomain(domain) {
  chrome.storage.local.get(['blockedDomains'], (result) => {
    const list = (result.blockedDomains || []).filter(d => d !== domain);
    chrome.storage.local.set({ blockedDomains: list }, () => {
      renderBlockedDomainsList(list);
    });
  });
}

// options/index.js - 选项页面入口

let currentTools = [];

// Tab 切换函数
function switchTab(tabName) {
  document.querySelectorAll('.tab-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  
  const btn = document.querySelector(`.tab-nav-btn[data-tab="${tabName}"]`);
  const panel = document.querySelector(`.tab-panel[data-tab="${tabName}"]`);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');
  
  // 更新 hash（不触发 hashchange）
  if (window.location.hash !== '#' + tabName) {
    history.replaceState(null, '', '#' + tabName);
  }
}

// 根据 hash 激活对应 tab
function activateByHash() {
  const hash = window.location.hash.replace('#', '');
  const validTabs = ['basic', 'toolbar', 'react', 'chat'];
  if (validTabs.includes(hash)) {
    switchTab(hash);
  }
}

// 页面加载时获取已保存的配置
document.addEventListener('DOMContentLoaded', async function() {
  // Tab 切换事件
  document.querySelectorAll('.tab-nav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      switchTab(this.dataset.tab);
    });
  });
  
  // 根据 hash 激活对应 tab
  activateByHash();
  window.addEventListener('hashchange', activateByHash);
  
  loadConfig();
  
  // 加载工具栏配置
  currentTools = await loadToolbarTools();
  renderToolbarToolsList(currentTools);
  
  // 保存按钮事件
  document.getElementById('saveBtn').addEventListener('click', saveConfig);
  
  // 模型选择器事件
  const modelInput = document.getElementById('modelInput');
  const modelDropdown = document.getElementById('modelDropdown');
  
  modelInput.addEventListener('click', function(e) {
    e.stopPropagation();
    modelDropdown.classList.toggle('show');
  });
  
  modelInput.addEventListener('input', function() {
    const value = modelInput.value.trim();
    setCurrentModel(value);
  });
  
  let blurTimeout;
  modelInput.addEventListener('blur', function() {
    blurTimeout = setTimeout(function() {
      const value = modelInput.value.trim();
      if (value && !PRESET_MODELS.includes(value)) {
        addCustomModelToDropdown(value);
      }
      if (!value) {
        modelInput.value = currentModel || 'deepseek-v4-pro';
      }
    }, 200);
  });
  
  modelInput.addEventListener('focus', function() {
    if (blurTimeout) {
      clearTimeout(blurTimeout);
      blurTimeout = null;
    }
  });
  
  modelDropdown.addEventListener('click', function(e) {
    if (e.target.classList.contains('delete-model-btn')) {
      e.stopPropagation();
      const option = e.target.closest('.model-option');
      const value = option.dataset.value;
      removeCustomModel(value);
      return;
    }
    const option = e.target.closest('.model-option');
    if (option) {
      e.stopPropagation();
      const value = option.dataset.value;
      setCurrentModel(value);
      modelInput.value = value;
      updateModelSelection(value);
      modelDropdown.classList.remove('show');
    }
  });
  
  document.addEventListener('click', function(e) {
    if (!modelDropdown.contains(e.target) && e.target !== modelInput) {
      modelDropdown.classList.remove('show');
    }
  });
  
  // 显示/隐藏 Token 切换
  const toggleToken = document.getElementById('toggleToken');
  const apiKeyInput = document.getElementById('apiKey');
  const iconEyeOpen = toggleToken.querySelector('.icon-eye-open');
  const iconEyeClosed = toggleToken.querySelector('.icon-eye-closed');
  
  toggleToken.addEventListener('click', function() {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      iconEyeOpen.style.display = 'none';
      iconEyeClosed.style.display = 'block';
    } else {
      apiKeyInput.type = 'password';
      iconEyeOpen.style.display = 'block';
      iconEyeClosed.style.display = 'none';
    }
  });
  
  // 初始化状态显示
  initStatus();
  
  // 重置系统提示词按钮事件
  const resetSystemPromptBtn = document.getElementById('resetSystemPromptBtn');
  if (resetSystemPromptBtn) {
    resetSystemPromptBtn.addEventListener('click', function() {
      document.getElementById('systemPrompt').value = DEFAULT_SYSTEM_PROMPT;
    });
  }
  
  // ==================== 工具栏配置事件 ====================
  
  // 工具栏直接显示数量变更
  document.getElementById('toolbarMaxVisible').addEventListener('change', function() {
    saveToolbarConfig();
  });
  
  // 工具栏图标精简模式变更
  const iconOnlyCheckbox = document.getElementById('toolbarIconOnly');
  if (iconOnlyCheckbox) {
    iconOnlyCheckbox.addEventListener('change', function() {
      saveToolbarConfig();
    });
  }
  
  // 工具栏工具列表事件委托
  document.getElementById('toolbarToolsList').addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    
    const action = btn.dataset.action;
    const index = parseInt(btn.dataset.index);
    
    switch (action) {
      case 'moveUp':
        currentTools = moveTool(currentTools, index, -1);
        persistAndRender();
        break;
      case 'moveDown':
        currentTools = moveTool(currentTools, index, 1);
        persistAndRender();
        break;
      case 'edit':
        openToolEditModal(currentTools, index);
        break;
      case 'delete':
        currentTools = deleteTool(currentTools, index);
        persistAndRender();
        break;
    }
  });
  
  // 添加自定义工具按钮
  document.getElementById('addCustomToolBtn').addEventListener('click', function() {
    openToolEditModal(currentTools, -1);
  });
  
  // 域名屏蔽 - 添加
  document.getElementById('domainAddBtn').addEventListener('click', function() {
    const input = document.getElementById('domainAddInput');
    addBlockedDomain(input.value, (result) => {
      if (result.error) {
        showToast('❌ ' + result.error, 'error');
      } else {
        input.value = '';
      }
    });
  });
  
  // 域名屏蔽 - 回车添加
  document.getElementById('domainAddInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      addBlockedDomain(this.value, (result) => {
        if (result.error) {
          showToast('❌ ' + result.error, 'error');
        } else {
          this.value = '';
        }
      });
    }
  });
  
  // 域名屏蔽 - 移除（事件委托）
  document.getElementById('domainBlocklistList').addEventListener('click', function(e) {
    const removeBtn = e.target.closest('.domain-blocklist-item-remove');
    if (removeBtn) {
      removeBlockedDomain(removeBtn.dataset.domain);
    }
  });
  
  // 加载域名屏蔽列表
  loadBlockedDomainsUI();
  
  // 监听域名屏蔽列表变化
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.blockedDomains) {
      loadBlockedDomainsUI();
    }
  });
  
  // 编辑弹窗取消
  document.getElementById('toolEditCancel').addEventListener('click', function() {
    closeToolEditModal();
  });
  
  // 编辑弹窗右上角关闭按钮
  document.getElementById('toolEditClose').addEventListener('click', function() {
    closeToolEditModal();
  });
  
  // 编辑弹窗保存
  document.getElementById('toolEditSave').addEventListener('click', function() {
    const result = saveToolEdit(currentTools);
    if (result.error) {
      showToast('❌ ' + result.error, 'error');
      return;
    }
    currentTools = result.tools;
    persistAndRender();
  });
});

// 持久化并重新渲染
function persistAndRender() {
  chrome.storage.local.set({ toolbarTools: currentTools }, () => {
    renderToolbarToolsList(currentTools);
    saveToolbarConfig();
  });
}
