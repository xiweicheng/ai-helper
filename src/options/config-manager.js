// options/config-manager.js - 配置管理与状态

import { PRESET_MODELS, DEFAULT_SYSTEM_PROMPT, DEFAULT_REACT_CONFIG, DEFAULT_CHAT_CONFIG } from './constants.js';

// Re-export PRESET_MODELS so index.js can use it
export { PRESET_MODELS };

let currentModel = 'deepseek-v4-pro';
export { currentModel };
export function setCurrentModel(value) { currentModel = value; }

// 添加自定义模型到下拉列表
export function addCustomModelToDropdown(modelName) {
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
export function removeCustomModel(modelName) {
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
export function saveCustomModels() {
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
export function loadCustomModels(callback) {
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
export function updateModelSelection(selectedValue) {
  document.querySelectorAll('.model-option').forEach(option => {
    if (option.dataset.value === selectedValue) {
      option.classList.add('selected');
    } else {
      option.classList.remove('selected');
    }
  });
}

// 加载配置
export function loadConfig() {
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
export function saveConfig() {
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
  if (chatMaxMessageLength < 1000 || chatMaxMessageLength > 200000) {
    showToast('❌ 单条消息最大字符数必须在 1000-200000 之间', 'error');
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

// 显示状态信息（保留原有逻辑，兼容）
export function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status ' + type;
  status.style.display = 'block';
  
  if (type === 'success') {
    setTimeout(function() {
      status.style.display = 'none';
    }, 3000);
  }
}

// 显示 Toast 提示
export function showToast(message, type = 'info', duration = 3000) {
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
export function initStatus() {
  const details = document.getElementById('configDetails');
  details.textContent = '💡 提示：保存配置后，新配置将立即生效';
}

// 更新配置详情显示
export function updateConfigDetails(apiBase, modelName, reactConfig, chatConfig) {
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
