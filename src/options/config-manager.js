// options/config-manager.js - 配置管理与状态

import { PRESET_MODELS, PRESET_IMAGE_MODELS, DEFAULT_SYSTEM_PROMPT, DEFAULT_REACT_CONFIG, DEFAULT_CHAT_CONFIG, DEFAULT_REFLECTION_CONFIG } from './constants.js';

// Re-export PRESET_MODELS so index.js can use it
export { PRESET_MODELS, PRESET_IMAGE_MODELS };

let currentModel = 'deepseek-v4-pro';
export { currentModel };
export function setCurrentModel(value) { currentModel = value; }

let currentImageModel = '';
export { currentImageModel };
export function setCurrentImageModel(value) { currentImageModel = value; }

// 已被用户删除的预设模型列表（跨页面持久化）
let deletedPresetModels = [];

/**
 * 加载已删除的预设模型列表
 */
function loadDeletedPresetModels(callback) {
  chrome.storage.local.get(['deletedPresetModels'], (result) => {
    deletedPresetModels = result.deletedPresetModels || [];
    if (typeof callback === 'function') callback();
  });
}

/**
 * 保存已删除的预设模型列表
 */
function saveDeletedPresetModels() {
  chrome.storage.local.set({ deletedPresetModels });
}

/**
 * 为所有模型选项（含预设）添加删除按钮
 */
function ensureModelDeleteButtons() {
  const modelDropdown = document.getElementById('modelDropdown');
  if (!modelDropdown) return;
  modelDropdown.querySelectorAll('.model-option:not([data-is-custom="true"])').forEach(option => {
    // 跳过已添加删除按钮的
    if (option.querySelector('.delete-model-btn')) return;
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-model-btn';
    deleteBtn.title = '删除此模型';
    deleteBtn.innerHTML = '×';
    deleteBtn.style.display = 'inline-block';
    option.appendChild(deleteBtn);
  });
}

// 添加模型到下拉列表（支持重新加回已删除的预设模型）
// modelName: 模型名称
// contextWindow: 可选的上下文窗口大小，0 或不传表示使用内置映射自动推断
/**
 * 将旧格式（文本节点直接放在 option 下）迁移为 model-option-left 包裹格式
 */
function migrateOptionLeft(option) {
  const leftSpan = document.createElement('span');
  leftSpan.className = 'model-option-left';
  const textNodes = [];
  for (const child of [...option.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) {
      textNodes.push(child);
    }
  }
  textNodes.forEach(n => {
    leftSpan.appendChild(n);
  });
  // badge 现在属于右侧容器，不放入 leftSpan
  option.insertBefore(leftSpan, option.firstChild);
}

export function addCustomModelToDropdown(modelName, contextWindow) {
  const modelDropdown = document.getElementById('modelDropdown');
  // 检查是否已存在
  const existingOption = modelDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
  if (existingOption) {
    // 如果已存在但传入了新的 contextWindow，更新右侧显示
    if (contextWindow && contextWindow > 0) {
      existingOption.dataset.contextWindow = contextWindow;
      existingOption.dataset.isCustom = 'true';

      // 确保模型名有 model-option-left 包裹
      let leftSpan = existingOption.querySelector('.model-option-left');
      if (!leftSpan) { migrateOptionLeft(existingOption); leftSpan = existingOption.querySelector('.model-option-left'); }

      // 确保有右侧容器（badge + 可选删除按钮）
      let rightSpan = existingOption.querySelector('.model-option-right');
      if (!rightSpan) {
        rightSpan = document.createElement('span');
        rightSpan.className = 'model-option-right';
        // 把旧结构中散落的 badge 移入右侧容器
        const oldBadge = existingOption.querySelector(':scope > .model-ctx-badge');
        if (oldBadge) rightSpan.appendChild(oldBadge);
        let deleteBtn = existingOption.querySelector(':scope > .delete-model-btn');
        if (!deleteBtn) {
          deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'delete-model-btn';
          deleteBtn.title = '删除此模型';
          deleteBtn.innerHTML = '×';
        }
        deleteBtn.style.display = 'inline-block';
        rightSpan.appendChild(deleteBtn);
        existingOption.appendChild(rightSpan);
      }

      // 更新 badge
      const badge = rightSpan.querySelector('.model-ctx-badge');
      if (badge) {
        badge.textContent = formatContextWindow(contextWindow);
      } else {
        const newBadge = document.createElement('span');
        newBadge.className = 'model-ctx-badge';
        newBadge.textContent = formatContextWindow(contextWindow);
        rightSpan.insertBefore(newBadge, rightSpan.firstChild);
      }

      saveCustomModels();
    }
    return;
  }
  
  // 如果是之前被删除的预设模型，从删除列表中移除
  if (PRESET_MODELS.includes(modelName) && deletedPresetModels.includes(modelName)) {
    deletedPresetModels = deletedPresetModels.filter(m => m !== modelName);
    saveDeletedPresetModels();
  }
  
  const option = document.createElement('div');
  option.className = 'model-option';
  option.dataset.value = modelName;
  // 预设模型不加 isCustom 标记（除非用户配置了上下文窗口）
  const isPreset = PRESET_MODELS.includes(modelName);
  if (!isPreset || (contextWindow && contextWindow > 0)) {
    option.dataset.isCustom = 'true';
  }
  if (contextWindow && contextWindow > 0) {
    option.dataset.contextWindow = contextWindow;
  }

  // 模型名称（左侧）
  const nameSpan = document.createElement('span');
  nameSpan.className = 'model-option-left';
  nameSpan.textContent = modelName;
  option.appendChild(nameSpan);

  // 右侧容器：badge + 删除按钮
   const rightSpan = document.createElement('span');
   rightSpan.className = 'model-option-right';
   if (contextWindow && contextWindow > 0) {
     const ctxBadge = document.createElement('span');
     ctxBadge.className = 'model-ctx-badge';
     ctxBadge.textContent = formatContextWindow(contextWindow);
     rightSpan.appendChild(ctxBadge);
   }
   const deleteBtn = document.createElement('button');
   deleteBtn.type = 'button';
   deleteBtn.className = 'delete-model-btn';
   deleteBtn.title = '删除此模型';
   deleteBtn.innerHTML = '×';
   deleteBtn.style.display = 'inline-block';
   rightSpan.appendChild(deleteBtn);
   option.appendChild(rightSpan);

  modelDropdown.appendChild(option);

  // 保存自定义模型到存储
  saveCustomModels();
}

// 从下拉列表移除模型（包括预设和自定义）
export function removeCustomModel(modelName) {
  const modelDropdown = document.getElementById('modelDropdown');
  // 移除所有匹配的选项（不再区分预设/自定义）
  const option = modelDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
  if (option) {
    option.remove();
  }

  // 如果是预设模型，记录到已删除列表
  if (PRESET_MODELS.includes(modelName) && !deletedPresetModels.includes(modelName)) {
    deletedPresetModels.push(modelName);
    saveDeletedPresetModels();
  }
  
  // 如果当前选中的是被删除的模型，恢复为第一个可用预设或空
  if (currentModel === modelName) {
    // 找到第一个未被删除的预设模型作为回退
    const fallback = PRESET_MODELS.find(m => !deletedPresetModels.includes(m));
    const newModel = fallback || '';
    setCurrentModel(newModel);
    const modelInput = document.getElementById('modelInput');
    if (modelInput) modelInput.value = newModel;
    updateModelSelection(newModel);
  }
  
  // 更新存储
  saveCustomModels();
}

/**
 * 格式化上下文窗口大小显示（如 128000 → "128K"）
 */
function formatContextWindow(tokens) {
  if (tokens >= 1000000) {
    return Math.round(tokens / 1000000 * 10) / 10 + 'M';
  }
  if (tokens >= 1000) {
    return Math.round(tokens / 1000) + 'K';
  }
  return String(tokens);
}

// 保存自定义模型到存储（新格式：对象数组）
export function saveCustomModels() {
  const modelDropdown = document.getElementById('modelDropdown');
  const customModels = [];
  modelDropdown.querySelectorAll('.model-option[data-is-custom="true"]').forEach(option => {
    customModels.push({
      name: option.dataset.value,
      contextWindow: parseInt(option.dataset.contextWindow) || 0
    });
  });
  chrome.storage.local.set({ customModels, deletedPresetModels }, () => {
    console.log('[Options] 自定义模型已保存:', customModels, '已删除预设:', deletedPresetModels);
  });
}

// 加载自定义模型到下拉列表
export function loadCustomModels(callback) {
  loadDeletedPresetModels(() => {
    // 先移除已被用户删除的预设模型
    const modelDropdown = document.getElementById('modelDropdown');
    if (modelDropdown) {
      deletedPresetModels.forEach(modelName => {
        const option = modelDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
        if (option) option.remove();
      });
      // 为剩余预设模型添加删除按钮
      ensureModelDeleteButtons();
    }

    chrome.storage.local.get(['customModels'], (result) => {
      const customModels = result.customModels || [];
      let needsMigration = false;
      
      customModels.forEach(item => {
        // 向前兼容：旧格式为字符串，新格式为对象
        let modelName, contextWindow = 0;
        if (typeof item === 'string') {
          modelName = item;
          needsMigration = true;
        } else if (item && typeof item === 'object' && item.name) {
          modelName = item.name;
          contextWindow = item.contextWindow || 0;
        } else {
          return;
        }
        
        // 检查是否已存在
        const existingOption = modelDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
        if (existingOption) {
          // 已存在的预设模型，应用其上下文窗口标签
          if (contextWindow && contextWindow > 0) {
            existingOption.dataset.contextWindow = contextWindow;
            existingOption.dataset.isCustom = 'true';

            let leftSpan = existingOption.querySelector('.model-option-left');
            if (!leftSpan) { migrateOptionLeft(existingOption); leftSpan = existingOption.querySelector('.model-option-left'); }

            // 右侧容器（badge + 删除按钮）
            let rightSpan = existingOption.querySelector('.model-option-right');
            if (!rightSpan) {
              rightSpan = document.createElement('span');
              rightSpan.className = 'model-option-right';
              const oldBadge = existingOption.querySelector(':scope > .model-ctx-badge');
              if (oldBadge) rightSpan.appendChild(oldBadge);
              const oldDelete = existingOption.querySelector(':scope > .delete-model-btn');
              if (oldDelete) rightSpan.appendChild(oldDelete);
              else {
                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'delete-model-btn';
                deleteBtn.title = '删除此模型';
                deleteBtn.innerHTML = '×';
                deleteBtn.style.display = 'inline-block';
                rightSpan.appendChild(deleteBtn);
              }
              existingOption.appendChild(rightSpan);
            }

            const badge = rightSpan.querySelector('.model-ctx-badge');
            if (badge) {
              badge.textContent = formatContextWindow(contextWindow);
            } else {
              const ctxBadge = document.createElement('span');
              ctxBadge.className = 'model-ctx-badge';
              ctxBadge.textContent = formatContextWindow(contextWindow);
              rightSpan.insertBefore(ctxBadge, rightSpan.firstChild);
            }

            // 确保有删除按钮
            if (!rightSpan.querySelector('.delete-model-btn')) {
              const deleteBtn = document.createElement('button');
              deleteBtn.type = 'button';
              deleteBtn.className = 'delete-model-btn';
              deleteBtn.title = '删除此模型';
              deleteBtn.innerHTML = '×';
              deleteBtn.style.display = 'inline-block';
              rightSpan.appendChild(deleteBtn);
            }
          }
          return;
        }
        
        const option = document.createElement('div');
        option.className = 'model-option';
        option.dataset.value = modelName;
        option.dataset.isCustom = 'true';
        if (contextWindow && contextWindow > 0) {
          option.dataset.contextWindow = contextWindow;
        }

        // 模型名称（左侧）
        const nameSpan = document.createElement('span');
        nameSpan.className = 'model-option-left';
        nameSpan.textContent = modelName;
        option.appendChild(nameSpan);

        // 右侧容器：badge + 删除按钮
        const rightSpan = document.createElement('span');
        rightSpan.className = 'model-option-right';
        if (contextWindow && contextWindow > 0) {
          const ctxBadge = document.createElement('span');
          ctxBadge.className = 'model-ctx-badge';
          ctxBadge.textContent = formatContextWindow(contextWindow);
          rightSpan.appendChild(ctxBadge);
        }
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-model-btn';
        deleteBtn.title = '删除此模型';
        deleteBtn.innerHTML = '×';
        deleteBtn.style.display = 'inline-block';
        rightSpan.appendChild(deleteBtn);
        option.appendChild(rightSpan);

        modelDropdown.appendChild(option);
      });
      
      // 如果存在旧格式数据，自动迁移为新格式
      if (needsMigration) {
        saveCustomModels();
        console.log('[Options] 自定义模型已自动迁移为新格式');
      }
      
      // 调用回调函数
      if (typeof callback === 'function') {
        callback();
      }
    });
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
  updateSelectedCtxBadge('modelInput', 'modelSelectedCtxBadge', 'modelDropdown');
}

/**
 * 更新选中模型输入框右侧的上下文窗口大小标签
 */
export function updateSelectedCtxBadge(inputId, badgeId, dropdownId) {
  const input = document.getElementById(inputId);
  const badge = document.getElementById(badgeId);
  const dropdown = document.getElementById(dropdownId);
  if (!badge || !dropdown) return;
  
  // 如果没有选中模型（输入为空），隐藏 badge
  if (input && !input.value) {
    badge.style.display = 'none';
    return;
  }
  
  const selectedOption = dropdown.querySelector('.model-option.selected') 
    || (input ? dropdown.querySelector(`.model-option[data-value="${input.value}"]`) : null);
  
  if (selectedOption) {
    const ctxWindow = parseInt(selectedOption.dataset.contextWindow);
    if (ctxWindow > 0) {
      badge.textContent = formatContextWindow(ctxWindow);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  } else {
    badge.style.display = 'none';
  }
}

// ============================================================
// 图片识别模型管理（所有模型均可删除，包括预设）
// ============================================================

// 添加图片识别模型到下拉列表
// modelName: 模型名称
// contextWindow: 可选的上下文窗口大小，0 或不传表示使用内置映射自动推断
export function addCustomImageModelToDropdown(modelName, contextWindow) {
  const modelDropdown = document.getElementById('imageModelDropdown');
  if (!modelDropdown) return;
  const existingOption = modelDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
  if (existingOption) {
    // 如果已存在但传入了新的 contextWindow，更新右侧显示
    if (contextWindow && contextWindow > 0) {
      existingOption.dataset.contextWindow = contextWindow;

      let leftSpan = existingOption.querySelector('.model-option-left');
      if (!leftSpan) { migrateOptionLeft(existingOption); leftSpan = existingOption.querySelector('.model-option-left'); }

      // 右侧容器
      let rightSpan = existingOption.querySelector('.model-option-right');
      if (!rightSpan) {
        rightSpan = document.createElement('span');
        rightSpan.className = 'model-option-right';
        const oldBadge = existingOption.querySelector(':scope > .model-ctx-badge');
        if (oldBadge) rightSpan.appendChild(oldBadge);
        // 图片模型都是自定义，保留已有删除按钮
        const oldDelete = existingOption.querySelector(':scope > .delete-model-btn');
        if (oldDelete) rightSpan.appendChild(oldDelete);
        existingOption.appendChild(rightSpan);
      }

      const badge = rightSpan.querySelector('.model-ctx-badge');
      if (badge) {
        badge.textContent = formatContextWindow(contextWindow);
      } else {
        const newBadge = document.createElement('span');
        newBadge.className = 'model-ctx-badge';
        newBadge.textContent = formatContextWindow(contextWindow);
        rightSpan.insertBefore(newBadge, rightSpan.firstChild);
      }
    }
    return;
  }

  const option = document.createElement('div');
  option.className = 'model-option';
  option.dataset.value = modelName;
  if (contextWindow && contextWindow > 0) {
    option.dataset.contextWindow = contextWindow;
  }

  const nameSpan = document.createElement('span');
  nameSpan.className = 'model-option-left';
  nameSpan.textContent = modelName;
  option.appendChild(nameSpan);

  // 右侧容器：badge + 删除按钮
  const rightSpan = document.createElement('span');
  rightSpan.className = 'model-option-right';
  if (contextWindow && contextWindow > 0) {
    const ctxBadge = document.createElement('span');
    ctxBadge.className = 'model-ctx-badge';
    ctxBadge.textContent = formatContextWindow(contextWindow);
    rightSpan.appendChild(ctxBadge);
  }
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-model-btn';
  deleteBtn.title = '删除此模型';
  deleteBtn.innerHTML = '×';
  // 图片模型删除按钮始终可见
  deleteBtn.style.display = 'inline-block';
  rightSpan.appendChild(deleteBtn);
  option.appendChild(rightSpan);

  modelDropdown.appendChild(option);
  saveImageModels();
}

// 从下拉列表移除图片识别模型（包括预设）
export function removeImageModel(modelName) {
  const modelDropdown = document.getElementById('imageModelDropdown');
  if (!modelDropdown) return;
  const option = modelDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
  if (option) {
    option.remove();
  }

  // 如果当前选中的是被删除的模型，恢复为第一个剩余模型或空
  if (currentImageModel === modelName) {
    const firstOption = modelDropdown.querySelector('.model-option');
    const newModel = firstOption ? firstOption.dataset.value : '';
    setCurrentImageModel(newModel);
    const input = document.getElementById('imageModelInput');
    if (input) input.value = newModel;
    updateImageModelSelection(newModel);
  }

  saveImageModels();
}

// 保存图片识别模型列表到存储（新格式：对象数组）
export function saveImageModels() {
  const modelDropdown = document.getElementById('imageModelDropdown');
  if (!modelDropdown) return;
  const imageModels = [];
  modelDropdown.querySelectorAll('.model-option').forEach(option => {
    imageModels.push({
      name: option.dataset.value,
      contextWindow: parseInt(option.dataset.contextWindow) || 0
    });
  });
  chrome.storage.local.set({ imageModels }, () => {
    console.log('[Options] 图片识别模型已保存:', imageModels);
  });
}

// 从存储加载图片识别模型到下拉列表
export function loadImageModels(callback) {
  chrome.storage.local.get(['imageModels'], (result) => {
    const modelDropdown = document.getElementById('imageModelDropdown');
    if (!modelDropdown) {
      if (typeof callback === 'function') callback();
      return;
    }
    const imageModels = result.imageModels || [];
    let needsMigration = false;

    // 清空现有选项
    modelDropdown.innerHTML = '';

    imageModels.forEach(item => {
      // 向前兼容：旧格式为字符串，新格式为对象
      let modelName, contextWindow = 0;
      if (typeof item === 'string') {
        modelName = item;
        needsMigration = true;
      } else if (item && typeof item === 'object' && item.name) {
        modelName = item.name;
        contextWindow = item.contextWindow || 0;
      } else {
        return;
      }

      const option = document.createElement('div');
      option.className = 'model-option';
      option.dataset.value = modelName;
      if (contextWindow && contextWindow > 0) {
        option.dataset.contextWindow = contextWindow;
      }

      // 模型名称（左侧）
      const nameSpan = document.createElement('span');
      nameSpan.className = 'model-option-left';
      nameSpan.textContent = modelName;
      option.appendChild(nameSpan);

      // 右侧容器：badge + 删除按钮
      const rightSpan = document.createElement('span');
      rightSpan.className = 'model-option-right';
      if (contextWindow && contextWindow > 0) {
        const ctxBadge = document.createElement('span');
        ctxBadge.className = 'model-ctx-badge';
        ctxBadge.textContent = formatContextWindow(contextWindow);
        rightSpan.appendChild(ctxBadge);
      }
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-model-btn';
      deleteBtn.title = '删除此模型';
      deleteBtn.innerHTML = '×';
      deleteBtn.style.display = 'inline-block';
      rightSpan.appendChild(deleteBtn);
      option.appendChild(rightSpan);

      modelDropdown.appendChild(option);
    });

    // 如果存在旧格式数据，自动迁移
    if (needsMigration) {
      saveImageModels();
      console.log('[Options] 图片识别模型已自动迁移为新格式');
    }

    if (typeof callback === 'function') {
      callback();
    }
  });
}

// 更新图片识别模型选中状态
export function updateImageModelSelection(selectedValue) {
  const modelDropdown = document.getElementById('imageModelDropdown');
  if (!modelDropdown) return;
  modelDropdown.querySelectorAll('.model-option').forEach(option => {
    if (option.dataset.value === selectedValue) {
      option.classList.add('selected');
    } else {
      option.classList.remove('selected');
    }
  });
  updateSelectedCtxBadge('imageModelInput', 'imageModelSelectedCtxBadge', 'imageModelDropdown');
}

// 加载配置
export function loadConfig() {
  chrome.storage.local.get([
    'apiBase', 'apiKey', 'modelName', 'customModels', 'systemPrompt',
    'enableImageInput', 'imageModelName', 'imageModels',
    'imageApiBase', 'imageApiKey',
    'reactMaxIterations', 'reactApiTimeout', 'reactLoopTimeout', 'reactToolTimeout', 'reactClarifyTimeout',
    'reactApiRetryCount', 'reactApiRetryBaseDelay', 'enableToolPreselect',
    'preselectMinToolCount', 'toolConfirmationEnabled',
    'chatMaxInputHistory', 'chatMaxHistoryMessages', 'chatMaxMessageLength', 'chatMaxMemoryMessages', 'enableExecutionLog', 'chatContextWindow',
    'reflectionConfig',
    'streamEnabled', 'streamChunkDelay'
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

    // 加载图片识别配置
    const enableImageInputEl = document.getElementById('enableImageInput');
    const imageModelGroup = document.getElementById('imageModelGroup');
    const imageApiGroup = document.getElementById('imageApiGroup');
    const imageApiKeyGroup = document.getElementById('imageApiKeyGroup');
    if (enableImageInputEl && imageModelGroup) {
      enableImageInputEl.checked = result.enableImageInput || false;
      imageModelGroup.style.display = enableImageInputEl.checked ? '' : 'none';
      if (imageApiGroup) {
        imageApiGroup.style.display = enableImageInputEl.checked ? '' : 'none';
      }
      if (imageApiKeyGroup) {
        imageApiKeyGroup.style.display = enableImageInputEl.checked ? '' : 'none';
      }
    }
    if (result.imageModelName) {
      setCurrentImageModel(result.imageModelName);
      const imageModelInput = document.getElementById('imageModelInput');
      if (imageModelInput) imageModelInput.value = result.imageModelName;
    }
    if (result.imageApiBase) {
      document.getElementById('imageApiBase').value = result.imageApiBase;
    }
    if (result.imageApiKey) {
      document.getElementById('imageApiKey').value = result.imageApiKey;
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
    
    // 加载工具预筛选开关
    const enableToolPreselectEl = document.getElementById('enableToolPreselect');
    enableToolPreselectEl.checked = 
      result.enableToolPreselect !== undefined ? result.enableToolPreselect : DEFAULT_REACT_CONFIG.enableToolPreselect;
    // 触发 change 事件，联动显示/隐藏预筛选最小工具数
    enableToolPreselectEl.dispatchEvent(new Event('change'));
    
    // 加载工具预筛选最小触发数量
    document.getElementById('preselectMinToolCount').value = 
      result.preselectMinToolCount !== undefined ? result.preselectMinToolCount : DEFAULT_REACT_CONFIG.preselectMinToolCount;
    
    // 加载敏感工具操作确认开关
    document.getElementById('toolConfirmationEnabled').checked = 
      result.toolConfirmationEnabled !== undefined ? result.toolConfirmationEnabled : DEFAULT_REACT_CONFIG.toolConfirmationEnabled;
    
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
    
    // 加载上下文窗口大小
    if (result.chatContextWindow !== undefined && result.chatContextWindow > 0) {
      document.getElementById('chatContextWindow').value = result.chatContextWindow;
    }
    
    // 加载执行日志配置
    document.getElementById('enableExecutionLog').checked = 
      result.enableExecutionLog || DEFAULT_CHAT_CONFIG.enableExecutionLog;
    
    // 加载反思配置
    const reflection = result.reflectionConfig || DEFAULT_REFLECTION_CONFIG;
    document.getElementById('reflectionEnabled').checked = reflection.enabled !== false;
    document.getElementById('postReflectionEnabled').checked = reflection.postReflection?.enabled !== false;
    document.getElementById('reflectionPostMaxRounds').value = reflection.postReflection?.maxRounds ?? DEFAULT_REFLECTION_CONFIG.postReflection.maxRounds;
    document.getElementById('reflectionPostQualityThreshold').value = reflection.postReflection?.qualityThreshold ?? DEFAULT_REFLECTION_CONFIG.postReflection.qualityThreshold;
    document.getElementById('reflectionPostRefineThreshold').value = reflection.postReflection?.refineThreshold ?? DEFAULT_REFLECTION_CONFIG.postReflection.refineThreshold;
    document.getElementById('reflectionPostModel').value = reflection.postReflection?.model || '';
    document.getElementById('reflectionPostTemperature').value = reflection.postReflection?.temperature ?? DEFAULT_REFLECTION_CONFIG.postReflection.temperature;
    document.getElementById('reflectionPostMaxTokens').value = reflection.postReflection?.maxTokens ?? DEFAULT_REFLECTION_CONFIG.postReflection.maxTokens;
    
    document.getElementById('toolReflectionEnabled').checked = reflection.toolReflection?.enabled !== false;
    document.getElementById('toolReflectionTriggerOnError').checked = reflection.toolReflection?.triggerOnError !== false;
    document.getElementById('toolReflectionTriggerOnEmpty').checked = reflection.toolReflection?.triggerOnEmpty !== false;
    document.getElementById('toolReflectionTriggerOnOversized').checked = reflection.toolReflection?.triggerOnOversized !== false;
    document.getElementById('toolReflectionOversizeThreshold').value = reflection.toolReflection?.oversizeThreshold ?? DEFAULT_REFLECTION_CONFIG.toolReflection.oversizeThreshold;
    document.getElementById('toolReflectionConsecutiveFails').value = reflection.toolReflection?.triggerOnConsecutiveFails ?? DEFAULT_REFLECTION_CONFIG.toolReflection.triggerOnConsecutiveFails;
    document.getElementById('toolReflectionMaxPerIteration').value = reflection.toolReflection?.maxPerIteration ?? DEFAULT_REFLECTION_CONFIG.toolReflection.maxPerIteration;
    
    document.getElementById('subtaskReflectionEnabled').checked = reflection.subtaskReflection?.enabled === true;
    document.getElementById('subtaskReflectionOnlyComplex').checked = reflection.subtaskReflection?.onlyForComplexSubtasks !== false;
    document.getElementById('subtaskReflectionMaxRounds').value = reflection.subtaskReflection?.maxRounds ?? DEFAULT_REFLECTION_CONFIG.subtaskReflection.maxRounds;
    document.getElementById('subtaskReflectionDimensions').value = (reflection.subtaskReflection?.dimensions || DEFAULT_REFLECTION_CONFIG.subtaskReflection.dimensions).join(',');
    document.getElementById('subtaskReflectionModel').value = reflection.subtaskReflection?.model || '';
    document.getElementById('subtaskReflectionTemperature').value = reflection.subtaskReflection?.temperature ?? DEFAULT_REFLECTION_CONFIG.subtaskReflection.temperature;
    document.getElementById('subtaskReflectionMaxTokens').value = reflection.subtaskReflection?.maxTokens ?? DEFAULT_REFLECTION_CONFIG.subtaskReflection.maxTokens;
    
    // 加载流式输出配置
    const streamEnabledEl = document.getElementById('streamEnabled');
    if (streamEnabledEl) {
      streamEnabledEl.checked = result.streamEnabled !== undefined ? result.streamEnabled : true;
    }
    const streamChunkDelayEl = document.getElementById('streamChunkDelay');
    if (streamChunkDelayEl) {
      streamChunkDelayEl.value = result.streamChunkDelay !== undefined ? result.streamChunkDelay : 30;
    }
    
    // 更新反思配置区域可见性
    function updateReflectionVisibility() {
      const reflectionConfig = document.getElementById('reflectionConfig');
      const reflectionEnabled = document.getElementById('reflectionEnabled');
      
      if (reflectionConfig) {
        if (!reflectionEnabled || !reflectionEnabled.checked) {
          reflectionConfig.classList.add('disabled');
        } else {
          reflectionConfig.classList.remove('disabled');
        }
      }
      
      function updateModule(moduleId, toggleId) {
        const module = document.getElementById(moduleId);
        const toggle = document.getElementById(toggleId);
        if (module && toggle) {
          if (!toggle.checked) {
            module.classList.add('disabled');
          } else {
            module.classList.remove('disabled');
          }
        }
      }
      
      updateModule('postReflectionSection', 'postReflectionEnabled');
      updateModule('toolReflectionSection', 'toolReflectionEnabled');
      updateModule('subtaskReflectionSection', 'subtaskReflectionEnabled');
    }
    
    // 先加载自定义模型到下拉列表，再更新选中状态
    loadCustomModels(() => {
      if (result.modelName) {
        updateModelSelection(result.modelName);
      }
      updateReflectionVisibility();
    });

    // 加载图片识别模型列表
    loadImageModels(() => {
      if (result.imageModelName) {
        updateImageModelSelection(result.imageModelName);
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
  const enableToolPreselect = document.getElementById('enableToolPreselect').checked;
  const preselectMinToolCount = parseInt(document.getElementById('preselectMinToolCount').value) || DEFAULT_REACT_CONFIG.preselectMinToolCount;
  const toolConfirmationEnabled = document.getElementById('toolConfirmationEnabled').checked;
  
  // 获取对话配置
  const chatMaxInputHistory = parseInt(document.getElementById('chatMaxInputHistory').value) || DEFAULT_CHAT_CONFIG.maxInputHistory;
  const chatMaxHistoryMessages = parseInt(document.getElementById('chatMaxHistoryMessages').value) || DEFAULT_CHAT_CONFIG.maxHistoryMessages;
  const chatMaxMessageLength = parseInt(document.getElementById('chatMaxMessageLength').value) || DEFAULT_CHAT_CONFIG.maxMessageLength;
  const chatMaxMemoryMessagesInput = document.getElementById('chatMaxMemoryMessages').value.trim();
  const chatMaxMemoryMessages = chatMaxMemoryMessagesInput ? parseInt(chatMaxMemoryMessagesInput) : null;
  const contextWindowInput = document.getElementById('chatContextWindow').value.trim();
  const chatContextWindow = contextWindowInput ? parseInt(contextWindowInput) : 0;
  const enableExecutionLog = document.getElementById('enableExecutionLog').checked;

  // 获取流式输出配置
  const streamEnabled = document.getElementById('streamEnabled')?.checked !== false;
  const streamChunkDelay = parseInt(document.getElementById('streamChunkDelay')?.value) || 30;
  
  // 获取图片识别配置
  const enableImageInput = document.getElementById('enableImageInput')?.checked || false;
  const imageModelName = currentImageModel || '';
  const imageApiBase = document.getElementById('imageApiBase')?.value.trim() || '';
  const imageApiKey = document.getElementById('imageApiKey')?.value.trim() || '';
  
  // 获取反思配置
  const reflectionConfig = {
    enabled: document.getElementById('reflectionEnabled').checked,
    postReflection: {
      enabled: document.getElementById('postReflectionEnabled').checked,
      maxRounds: parseInt(document.getElementById('reflectionPostMaxRounds').value) || DEFAULT_REFLECTION_CONFIG.postReflection.maxRounds,
      qualityThreshold: parseInt(document.getElementById('reflectionPostQualityThreshold').value) || DEFAULT_REFLECTION_CONFIG.postReflection.qualityThreshold,
      refineThreshold: parseInt(document.getElementById('reflectionPostRefineThreshold').value) || DEFAULT_REFLECTION_CONFIG.postReflection.refineThreshold,
      model: document.getElementById('reflectionPostModel').value.trim() || null,
      temperature: parseFloat(document.getElementById('reflectionPostTemperature').value) || DEFAULT_REFLECTION_CONFIG.postReflection.temperature,
      maxTokens: parseInt(document.getElementById('reflectionPostMaxTokens').value) || DEFAULT_REFLECTION_CONFIG.postReflection.maxTokens
    },
    toolReflection: {
      enabled: document.getElementById('toolReflectionEnabled').checked,
      triggerOnError: document.getElementById('toolReflectionTriggerOnError').checked,
      triggerOnEmpty: document.getElementById('toolReflectionTriggerOnEmpty').checked,
      triggerOnOversized: document.getElementById('toolReflectionTriggerOnOversized').checked,
      oversizeThreshold: parseInt(document.getElementById('toolReflectionOversizeThreshold').value) || DEFAULT_REFLECTION_CONFIG.toolReflection.oversizeThreshold,
      triggerOnConsecutiveFails: parseInt(document.getElementById('toolReflectionConsecutiveFails').value) || DEFAULT_REFLECTION_CONFIG.toolReflection.triggerOnConsecutiveFails,
      maxPerIteration: parseInt(document.getElementById('toolReflectionMaxPerIteration').value) || DEFAULT_REFLECTION_CONFIG.toolReflection.maxPerIteration
    },
    subtaskReflection: {
      enabled: document.getElementById('subtaskReflectionEnabled').checked,
      onlyForComplexSubtasks: document.getElementById('subtaskReflectionOnlyComplex').checked,
      maxRounds: parseInt(document.getElementById('subtaskReflectionMaxRounds').value) || DEFAULT_REFLECTION_CONFIG.subtaskReflection.maxRounds,
      dimensions: document.getElementById('subtaskReflectionDimensions').value.trim().split(',').map(d => d.trim()).filter(d => d),
      model: document.getElementById('subtaskReflectionModel').value.trim() || null,
      temperature: parseFloat(document.getElementById('subtaskReflectionTemperature').value) || DEFAULT_REFLECTION_CONFIG.subtaskReflection.temperature,
      maxTokens: parseInt(document.getElementById('subtaskReflectionMaxTokens').value) || DEFAULT_REFLECTION_CONFIG.subtaskReflection.maxTokens
    }
  };
  
  // 验证反思配置范围
  if (reflectionConfig.postReflection.maxRounds < 0 || reflectionConfig.postReflection.maxRounds > 3) {
    showToast('❌ 后置反思最大轮数必须在 0-3 之间', 'error');
    return;
  }
  if (reflectionConfig.postReflection.qualityThreshold < 1 || reflectionConfig.postReflection.qualityThreshold > 10) {
    showToast('❌ 质量评分阈值必须在 1-10 之间', 'error');
    return;
  }
  if (reflectionConfig.postReflection.refineThreshold < 1 || reflectionConfig.postReflection.refineThreshold > 10) {
    showToast('❌ 修订阈值必须在 1-10 之间', 'error');
    return;
  }
  if (reflectionConfig.postReflection.temperature < 0 || reflectionConfig.postReflection.temperature > 1) {
    showToast('❌ 反思温度系数必须在 0-1 之间', 'error');
    return;
  }
  if (reflectionConfig.postReflection.maxTokens < 256 || reflectionConfig.postReflection.maxTokens > 8192) {
    showToast('❌ 反思最大 Token 必须在 256-8192 之间', 'error');
    return;
  }
  if (reflectionConfig.toolReflection.oversizeThreshold < 1000 || reflectionConfig.toolReflection.oversizeThreshold > 200000) {
    showToast('❌ 工具反思结果大小阈值必须在 1000-200000 之间', 'error');
    return;
  }
  if (reflectionConfig.toolReflection.triggerOnConsecutiveFails < 1 || reflectionConfig.toolReflection.triggerOnConsecutiveFails > 10) {
    showToast('❌ 连续失败触发次数必须在 1-10 之间', 'error');
    return;
  }
  if (reflectionConfig.toolReflection.maxPerIteration < 1 || reflectionConfig.toolReflection.maxPerIteration > 5) {
    showToast('❌ 每轮最多触发次数必须在 1-5 之间', 'error');
    return;
  }
  
  // 验证 ReAct 配置范围
  if (reactMaxIterations < 1 || reactMaxIterations > 200) {
    showToast('❌ 最大循环次数必须在 1-200 之间', 'error');
    return;
  }
  if (reactApiTimeout < 10000 || reactApiTimeout > 600000) {
    showToast('❌ API 请求超时必须在 10-600 秒 之间', 'error');
    return;
  }
  if (reactLoopTimeout < 60000 || reactLoopTimeout > 3600000) {
    showToast('❌ 整体循环超时必须在 1-60 分钟 之间', 'error');
    return;
  }
  if (reactToolTimeout < 5000 || reactToolTimeout > 1800000) {
    showToast('❌ 工具执行超时必须在 5-1800 秒 之间', 'error');
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
    enableToolPreselect: enableToolPreselect,
    preselectMinToolCount: preselectMinToolCount,
    toolConfirmationEnabled: toolConfirmationEnabled,
    // 对话配置
    chatMaxInputHistory: chatMaxInputHistory,
    chatMaxHistoryMessages: chatMaxHistoryMessages,
    chatMaxMessageLength: chatMaxMessageLength,
    chatMaxMemoryMessages: chatMaxMemoryMessages,
    chatContextWindow: chatContextWindow,
    enableExecutionLog: enableExecutionLog,
    // 图片识别配置
    enableImageInput: enableImageInput,
    imageModelName: imageModelName,
    imageApiBase: imageApiBase,
    imageApiKey: imageApiKey,
    // 反思配置
    reflectionConfig: reflectionConfig,
    // 流式输出配置
    streamEnabled: streamEnabled,
    streamChunkDelay: streamChunkDelay
  }, async function() {
    if (chrome.runtime.lastError) {
      showToast('❌ 保存失败：' + chrome.runtime.lastError.message, 'error');
    } else {
      showToast('✅ 配置已保存成功！', 'success');
      const status = document.getElementById('status');
      status.style.display = 'none';

      // 读取 Agent 配置
      const agentResult = await chrome.storage.local.get(['agentUrl', 'agentToken']);
      let agentConfig = null;
      if (agentResult.agentUrl) {
        agentConfig = { url: agentResult.agentUrl, connected: !!agentResult.agentToken };
        // 尝试获取工作目录
        try {
          if (agentResult.agentToken) {
            const resp = await fetch(`${agentResult.agentUrl}/api/status/detail`, {
              headers: { 'Authorization': `Bearer ${agentResult.agentToken}` }
            });
            if (resp.ok) {
              const data = await resp.json();
              agentConfig.workdir = data.workdir;
              agentConfig.connected = true;
            }
          }
        } catch {}
      }

      updateConfigDetails(apiBase, currentModel, {
        maxIterations: reactMaxIterations,
        apiTimeout: reactApiTimeout,
        loopTimeout: reactLoopTimeout,
        toolTimeout: reactToolTimeout,
        clarifyTimeout: reactClarifyTimeout,
        apiRetryCount: reactApiRetryCount,
        apiRetryBaseDelay: reactApiRetryBaseDelay,
        enableToolPreselect: enableToolPreselect,
        preselectMinToolCount: preselectMinToolCount,
        toolConfirmationEnabled: toolConfirmationEnabled
      }, {
        maxInputHistory: chatMaxInputHistory,
        maxHistoryMessages: chatMaxHistoryMessages,
        maxMessageLength: chatMaxMessageLength,
        maxMemoryMessages: chatMaxMemoryMessages,
        enableExecutionLog: enableExecutionLog,
        contextWindow: chatContextWindow
      }, reflectionConfig, agentConfig, { streamEnabled, streamChunkDelay });
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
export function updateConfigDetails(apiBase, modelName, reactConfig, chatConfig, reflectionConfig, agentConfig, streamConfig) {
  const details = document.getElementById('configDetails');
  const base = apiBase || 'https://api.deepseek.com';
  const model = modelName || 'deepseek-v4-pro';
  const react = reactConfig || DEFAULT_REACT_CONFIG;
  const chat = chatConfig || DEFAULT_CHAT_CONFIG;
  const reflection = reflectionConfig || DEFAULT_REFLECTION_CONFIG;
  const stream = streamConfig || { streamEnabled: true, streamChunkDelay: 30 };
  
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
    <strong>推理配置：</strong><br>
    最大循环次数: ${react.maxIterations} 次<br>
    API 请求超时: ${formatTime(react.apiTimeout)}<br>
    整体循环超时: ${formatTime(react.loopTimeout)}<br>
    工具执行超时: ${formatTime(react.toolTimeout)}<br>
    澄清等待超时: ${formatTime(react.clarifyTimeout)}<br>
    API 重试次数: ${react.apiRetryCount} 次<br>
    API 重试基础延迟: ${react.apiRetryBaseDelay}ms<br>
    工具预筛选: ${react.enableToolPreselect ? '✅ 启用' : '❌ 关闭'}<br>
    预筛选最小工具数: ${react.preselectMinToolCount ?? 3} 个<br>
    敏感工具操作确认: ${react.toolConfirmationEnabled ? '✅ 启用' : '❌ 关闭'}<br>
    流式输出: ${stream.streamEnabled !== false ? '✅ 启用' : '❌ 关闭'}<br>
    流式渲染延迟: ${stream.streamChunkDelay ?? 30} ms<br>
    <hr style="margin: 8px 0; border: none; border-top: 1px dashed #ccc;">
    <strong>反思配置：</strong><br>
    反思功能: ${reflection.enabled ? '✅ 启用' : '❌ 关闭'}<br>
    后置反思: ${reflection.postReflection?.enabled ? '✅ 启用' : '❌ 关闭'}<br>
    &nbsp;&nbsp;最大轮数: ${reflection.postReflection?.maxRounds ?? '-'} 轮<br>
    &nbsp;&nbsp;质量阈值: ${reflection.postReflection?.qualityThreshold ?? '-'} /10<br>
    &nbsp;&nbsp;修订阈值: ${reflection.postReflection?.refineThreshold ?? '-'} /10<br>
    &nbsp;&nbsp;反思模型: ${reflection.postReflection?.model || '使用当前模型'}<br>
    &nbsp;&nbsp;温度系数: ${reflection.postReflection?.temperature ?? '-'}<br>
    &nbsp;&nbsp;最大 Token: ${reflection.postReflection?.maxTokens ?? '-'}<br>
    工具级反思: ${reflection.toolReflection?.enabled ? '✅ 启用' : '❌ 关闭'}<br>
    &nbsp;&nbsp;触发条件: 错误${reflection.toolReflection?.triggerOnError ? '✓' : '✗'} / 空${reflection.toolReflection?.triggerOnEmpty ? '✓' : '✗'} / 过大${reflection.toolReflection?.triggerOnOversized ? '✓' : '✗'}<br>
    &nbsp;&nbsp;过大阈值: ${reflection.toolReflection?.oversizeThreshold ?? '-'} 字符<br>
    &nbsp;&nbsp;连续失败触发: ${reflection.toolReflection?.triggerOnConsecutiveFails ?? '-'} 次<br>
    &nbsp;&nbsp;每轮上限: ${reflection.toolReflection?.maxPerIteration ?? '-'} 次<br>
    子任务反思: ${reflection.subtaskReflection?.enabled ? '✅ 启用' : '❌ 关闭'}<br>
    &nbsp;&nbsp;仅复杂子任务: ${reflection.subtaskReflection?.onlyForComplexSubtasks ? '✓' : '✗'}<br>
    &nbsp;&nbsp;最大轮数: ${reflection.subtaskReflection?.maxRounds ?? '-'} 轮<br>
    &nbsp;&nbsp;评估维度: ${(reflection.subtaskReflection?.dimensions || []).join(', ') || '-'}<br>
    &nbsp;&nbsp;反思模型: ${reflection.subtaskReflection?.model || '使用当前模型'}<br>
    &nbsp;&nbsp;温度系数: ${reflection.subtaskReflection?.temperature ?? '-'}<br>
    &nbsp;&nbsp;最大 Token: ${reflection.subtaskReflection?.maxTokens ?? '-'}<br>
    <hr style="margin: 8px 0; border: none; border-top: 1px dashed #ccc;">
    <strong>对话配置：</strong><br>
    输入历史记录数: ${chat.maxInputHistory} 条<br>
    最大对话轮数: ${chat.maxHistoryMessages} 轮<br>
    消息最大长度: ${chat.maxMessageLength} 字符<br>
    记忆历史限制条数: ${chat.maxMemoryMessages !== null ? chat.maxMemoryMessages + ' 条' : '不限制'}<br>
    执行日志: ${chat.enableExecutionLog ? '✅ 启用' : '❌ 关闭'}<br>
    ${agentConfig ? `<hr style="margin: 8px 0; border: none; border-top: 1px dashed #ccc;">
    <strong>代理配置：</strong><br>
    代理地址: ${agentConfig.url || '未配置'}<br>
    连接状态: ${agentConfig.connected ? '✅ 已连接' : '⚠️ 未配对'}<br>
    ${agentConfig.workdir ? `工作目录: ${agentConfig.workdir}<br>` : ''}` : ''}
    <hr style="margin: 8px 0; border: none; border-top: 1px dashed #ccc;">
    💡 <strong>提示</strong>：澄清等待时间不计入整体循环超时<br>
    ⚠️ API Key 如果过期或失效，需要重新生成并更新配置
  `;
}
