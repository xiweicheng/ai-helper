// options/config-manager.js - 配置管理与状态

import { PRESET_MODELS, PRESET_IMAGE_MODELS, PRESET_API_BASES, DEFAULT_SYSTEM_PROMPT, DEFAULT_REACT_CONFIG, DEFAULT_CHAT_CONFIG, DEFAULT_REFLECTION_CONFIG } from './constants.js';


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

// ============================================================
// API Base URL 管理（预设 + 用户自定义，支持增删改）
// ============================================================

// 已被用户删除的预设 API Base URL 列表
let deletedPresetApiBases = [];

/**
 * 构建单个 API Base 选项 DOM 元素
 */
function buildApiBaseOption(url, label, isCustom) {
  const option = document.createElement('div');
  option.className = 'model-option';
  option.dataset.value = url;
  if (label) option.dataset.label = label;
  if (isCustom) option.dataset.isCustom = 'true';

  const leftSpan = document.createElement('span');
  leftSpan.className = 'model-option-left';
  leftSpan.textContent = label || url;
  option.appendChild(leftSpan);

  const rightSpan = document.createElement('span');
  rightSpan.className = 'model-option-right';

  // 如果有标签，显示简短 URL 作为辅助信息
  if (label) {
    const urlHint = document.createElement('span');
    urlHint.className = 'api-base-url-hint';
    urlHint.textContent = url.length > 50 ? url.substring(0, 47) + '...' : url;
    rightSpan.appendChild(urlHint);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-model-btn';
  deleteBtn.title = '删除此地址';
  deleteBtn.innerHTML = '×';
  deleteBtn.style.display = 'inline-block';
  rightSpan.appendChild(deleteBtn);
  option.appendChild(rightSpan);

  return option;
}

/**
 * 添加 API Base URL 到下拉列表
 */
export function addCustomApiBase(url, label) {
  const dropdown = document.getElementById('apiBaseDropdown');
  if (!dropdown) return;

  // 检查是否已存在
  const existing = dropdown.querySelector(`.model-option[data-value="${CSS.escape(url)}"]`);
  if (existing) {
    // 更新 label
    if (label) {
      existing.dataset.label = label;
      const leftSpan = existing.querySelector('.model-option-left');
      if (leftSpan) leftSpan.textContent = label;
    }
    saveApiBases();
    return;
  }

  // 如果之前被删过，从删除列表移除
  if (PRESET_API_BASES.includes(url) && deletedPresetApiBases.includes(url)) {
    deletedPresetApiBases = deletedPresetApiBases.filter(u => u !== url);
  }

  const isCustom = !PRESET_API_BASES.includes(url);
  const option = buildApiBaseOption(url, label, isCustom);
  dropdown.appendChild(option);

  saveApiBases();
}

/**
 * 从下拉列表移除 API Base URL
 */
export function removeApiBase(url) {
  const dropdown = document.getElementById('apiBaseDropdown');
  if (!dropdown) return;

  const option = dropdown.querySelector(`.model-option[data-value="${CSS.escape(url)}"]`);
  if (option) option.remove();

  // 如果是预设，记录到删除列表
  if (PRESET_API_BASES.includes(url) && !deletedPresetApiBases.includes(url)) {
    deletedPresetApiBases.push(url);
  }

  // 如果当前选中的是被删除的 URL，清空输入框
  const apiBaseInput = document.getElementById('apiBase');
  if (apiBaseInput && apiBaseInput.value.trim() === url) {
    apiBaseInput.value = '';
  }

  saveApiBases();
}

/**
 * 保存 API Base URL 列表到存储
 */
export function saveApiBases() {
  const dropdown = document.getElementById('apiBaseDropdown');
  if (!dropdown) return;

  const customBases = [];
  dropdown.querySelectorAll('.model-option[data-is-custom="true"]').forEach(opt => {
    customBases.push({
      url: opt.dataset.value,
      label: opt.dataset.label || ''
    });
  });

  chrome.storage.local.set({
    customApiBases: customBases,
    deletedPresetApiBases
  }, () => {
    console.log('[Options] API Base URL 列表已保存:', customBases, '已删除预设:', deletedPresetApiBases);
  });
}

/**
 * 从存储加载 API Base URL 列表到下拉
 */
export function loadApiBases(callback) {
  chrome.storage.local.get(['customApiBases', 'deletedPresetApiBases'], (result) => {
    const dropdown = document.getElementById('apiBaseDropdown');
    if (!dropdown) {
      if (typeof callback === 'function') callback();
      return;
    }

    deletedPresetApiBases = result.deletedPresetApiBases || [];
    const customBases = result.customApiBases || [];

    // 清空现有选项
    dropdown.innerHTML = '';

    // 先渲染预设（未被删除的）
    PRESET_API_BASES.forEach(url => {
      if (!deletedPresetApiBases.includes(url)) {
        const option = buildApiBaseOption(url, null, false);
        dropdown.appendChild(option);
      }
    });

    // 再渲染用户自定义
    customBases.forEach(item => {
      if (typeof item === 'string') {
        // 旧格式兼容
        if (!PRESET_API_BASES.includes(item)) {
          const option = buildApiBaseOption(item, null, true);
          dropdown.appendChild(option);
        }
      } else if (item && item.url) {
        const option = buildApiBaseOption(item.url, item.label || null, true);
        dropdown.appendChild(option);
      }
    });

    if (typeof callback === 'function') callback();
  });
}

/**
 * 更新 API Base 下拉选中状态
 */
export function updateApiBaseSelection(url) {
  const dropdown = document.getElementById('apiBaseDropdown');
  if (!dropdown) return;
  dropdown.querySelectorAll('.model-option').forEach(opt => {
    if (opt.dataset.value === url) {
      opt.classList.add('selected');
    } else {
      opt.classList.remove('selected');
    }
  });
}

// ============================================================
// 图片识别 API Base URL 管理（复用 PRESET_API_BASES，独立存储）
// ============================================================

let deletedPresetImageApiBases = [];

function buildImageApiBaseOption(url, label, isCustom) {
  const option = document.createElement('div');
  option.className = 'model-option';
  option.dataset.value = url;
  if (label) option.dataset.label = label;
  if (isCustom) option.dataset.isCustom = 'true';

  const leftSpan = document.createElement('span');
  leftSpan.className = 'model-option-left';
  leftSpan.textContent = label || url;
  option.appendChild(leftSpan);

  const rightSpan = document.createElement('span');
  rightSpan.className = 'model-option-right';

  if (label) {
    const urlHint = document.createElement('span');
    urlHint.className = 'api-base-url-hint';
    urlHint.textContent = url.length > 50 ? url.substring(0, 47) + '...' : url;
    rightSpan.appendChild(urlHint);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-model-btn';
  deleteBtn.title = '删除此地址';
  deleteBtn.innerHTML = '×';
  deleteBtn.style.display = 'inline-block';
  rightSpan.appendChild(deleteBtn);
  option.appendChild(rightSpan);

  return option;
}

export function addCustomImageApiBase(url, label) {
  const dropdown = document.getElementById('imageApiBaseDropdown');
  if (!dropdown) return;

  const existing = dropdown.querySelector(`.model-option[data-value="${CSS.escape(url)}"]`);
  if (existing) {
    if (label) {
      existing.dataset.label = label;
      const leftSpan = existing.querySelector('.model-option-left');
      if (leftSpan) leftSpan.textContent = label;
    }
    saveImageApiBases();
    return;
  }

  if (PRESET_API_BASES.includes(url) && deletedPresetImageApiBases.includes(url)) {
    deletedPresetImageApiBases = deletedPresetImageApiBases.filter(u => u !== url);
  }

  const isCustom = !PRESET_API_BASES.includes(url);
  const option = buildImageApiBaseOption(url, label, isCustom);
  dropdown.appendChild(option);

  saveImageApiBases();
}

export function removeImageApiBase(url) {
  const dropdown = document.getElementById('imageApiBaseDropdown');
  if (!dropdown) return;

  const option = dropdown.querySelector(`.model-option[data-value="${CSS.escape(url)}"]`);
  if (option) option.remove();

  if (PRESET_API_BASES.includes(url) && !deletedPresetImageApiBases.includes(url)) {
    deletedPresetImageApiBases.push(url);
  }

  const input = document.getElementById('imageApiBase');
  if (input && input.value.trim() === url) {
    input.value = '';
  }

  saveImageApiBases();
}

export function saveImageApiBases() {
  const dropdown = document.getElementById('imageApiBaseDropdown');
  if (!dropdown) return;

  const customBases = [];
  dropdown.querySelectorAll('.model-option[data-is-custom="true"]').forEach(opt => {
    customBases.push({
      url: opt.dataset.value,
      label: opt.dataset.label || ''
    });
  });

  chrome.storage.local.set({
    customImageApiBases: customBases,
    deletedPresetImageApiBases
  }, () => {
    console.log('[Options] 图片 API Base URL 列表已保存:', customBases);
  });
}

export function loadImageApiBases(callback) {
  chrome.storage.local.get(['customImageApiBases', 'deletedPresetImageApiBases'], (result) => {
    const dropdown = document.getElementById('imageApiBaseDropdown');
    if (!dropdown) {
      if (typeof callback === 'function') callback();
      return;
    }

    deletedPresetImageApiBases = result.deletedPresetImageApiBases || [];
    const customBases = result.customImageApiBases || [];

    dropdown.innerHTML = '';

    PRESET_API_BASES.forEach(url => {
      if (!deletedPresetImageApiBases.includes(url)) {
        const option = buildImageApiBaseOption(url, null, false);
        dropdown.appendChild(option);
      }
    });

    customBases.forEach(item => {
      if (typeof item === 'string') {
        if (!PRESET_API_BASES.includes(item)) {
          const option = buildImageApiBaseOption(item, null, true);
          dropdown.appendChild(option);
        }
      } else if (item && item.url) {
        const option = buildImageApiBaseOption(item.url, item.label || null, true);
        dropdown.appendChild(option);
      }
    });

    if (typeof callback === 'function') callback();
  });
}

export function updateImageApiBaseSelection(url) {
  const dropdown = document.getElementById('imageApiBaseDropdown');
  if (!dropdown) return;
  dropdown.querySelectorAll('.model-option').forEach(opt => {
    if (opt.dataset.value === url) {
      opt.classList.add('selected');
    } else {
      opt.classList.remove('selected');
    }
  });
}

// 加载配置
export function loadConfig() {
  chrome.storage.local.get([
    'apiBase', 'apiKey', 'modelName', 'customModels', 'systemPrompt',
    'enableImageInput', 'imageModelName', 'imageModels',
    'imageApiBase', 'imageApiKey', 'enableFileInput',
    'reactMaxIterations', 'reactApiTimeout', 'reactLoopTimeout', 'reactToolTimeout',
    'preselectMinToolCount', 'toolConfirmationEnabled',
    'enableExecutionLog',
    'reflectionConfig',
    'streamEnabled'
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
      Math.round((result.reactApiTimeout || DEFAULT_REACT_CONFIG.apiTimeout) / 60000);
    document.getElementById('reactLoopTimeout').value = 
      Math.round((result.reactLoopTimeout || DEFAULT_REACT_CONFIG.loopTimeout) / 60000);
    document.getElementById('reactToolTimeout').value = 
      Math.round((result.reactToolTimeout || DEFAULT_REACT_CONFIG.toolTimeout) / 60000);
    const preselectEl = document.getElementById('enableToolPreselect');
    if (preselectEl) {
      preselectEl.checked = 
        result.enableToolPreselect !== undefined ? result.enableToolPreselect : DEFAULT_REACT_CONFIG.enableToolPreselect;
      // 触发 change 事件，联动显示/隐藏预筛选最小工具数
      preselectEl.dispatchEvent(new Event('change'));
    }
    
    // 加载工具预筛选最小触发数量
    const preselectMinEl = document.getElementById('preselectMinToolCount');
    if (preselectMinEl) {
      preselectMinEl.value = 
        result.preselectMinToolCount !== undefined ? result.preselectMinToolCount : DEFAULT_REACT_CONFIG.preselectMinToolCount;
    }
    
    // 加载敏感操作确认开关
    document.getElementById('toolConfirmationEnabled').checked = 
      result.toolConfirmationEnabled !== undefined ? result.toolConfirmationEnabled : DEFAULT_REACT_CONFIG.toolConfirmationEnabled;
    document.getElementById('toolConfirmationEnabled').dispatchEvent(new Event('change'));

    // 加载对话配置

    
    // 加载执行日志配置
    document.getElementById('enableExecutionLog').checked = 
      result.enableExecutionLog || DEFAULT_CHAT_CONFIG.enableExecutionLog;
    document.getElementById('enableExecutionLog').dispatchEvent(new Event('change'));
    
    // 加载反思配置
    const reflection = result.reflectionConfig || DEFAULT_REFLECTION_CONFIG;
    document.getElementById('reflectionEnabled').checked = reflection.enabled !== false;
    document.getElementById('postReflectionEnabled').checked = reflection.postReflection?.enabled !== false;
    document.getElementById('toolReflectionEnabled').checked = reflection.toolReflection?.enabled !== false;
    document.getElementById('subtaskReflectionEnabled').checked = reflection.subtaskReflection?.enabled === true;
    
    document.getElementById('streamEnabled').checked = 
      result.streamEnabled !== undefined ? result.streamEnabled : true;
    
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

    // 加载 API Base URL 列表
    loadApiBases(() => {
      if (result.apiBase) {
        updateApiBaseSelection(result.apiBase);
      }
    });

    // 加载图片识别 API Base URL 列表
    loadImageApiBases(() => {
      if (result.imageApiBase) {
        updateImageApiBaseSelection(result.imageApiBase);
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
  const reactApiTimeout = (parseInt(document.getElementById('reactApiTimeout').value) || 5) * 60000;
  const reactLoopTimeout = (parseInt(document.getElementById('reactLoopTimeout').value) || 5) * 60000;
  const reactToolTimeout = (parseInt(document.getElementById('reactToolTimeout').value) || 5) * 60000;
  // clarifyTimeout / apiRetryCount / apiRetryBaseDelay / enableToolPreselect / preselectMinToolCount 不再配置，使用默认值
  const toolConfirmationEnabled = document.getElementById('toolConfirmationEnabled').checked;
  
  const enableExecutionLog = document.getElementById('enableExecutionLog').checked;

  // 获取流式输出配置
  const streamEnabled = document.getElementById('streamEnabled')?.checked !== false;
  
  // 获取图片识别配置
  const enableImageInput = document.getElementById('enableImageInput')?.checked || false;
  const imageModelName = currentImageModel || '';
  const imageApiBase = document.getElementById('imageApiBase')?.value.trim() || '';
  const imageApiKey = document.getElementById('imageApiKey')?.value.trim() || '';
  
  // 获取反思配置
  const reflectionConfig = {
    enabled: document.getElementById('reflectionEnabled').checked,
    postReflection: {
      ...DEFAULT_REFLECTION_CONFIG.postReflection,
      enabled: document.getElementById('postReflectionEnabled').checked
    },
    toolReflection: {
      ...DEFAULT_REFLECTION_CONFIG.toolReflection,
      enabled: document.getElementById('toolReflectionEnabled').checked
    },
    subtaskReflection: {
      ...DEFAULT_REFLECTION_CONFIG.subtaskReflection,
      enabled: document.getElementById('subtaskReflectionEnabled').checked
    }
  };
  
  // 验证 ReAct 配置范围
  if (reactMaxIterations < 10 || reactMaxIterations > 1000) {
    showToast('❌ 最大循环次数必须在 10-1000 之间', 'error');
    return;
  }
  if (reactApiTimeout < 60000 || reactApiTimeout > 600000) {
    showToast('❌ API 请求超时必须在 1-10 分钟 之间', 'error');
    return;
  }
  if (reactLoopTimeout < 60000 || reactLoopTimeout > 7200000) {
    showToast('❌ 整体循环超时必须在 1-120 分钟 之间', 'error');
    return;
  }
  if (reactToolTimeout < 60000 || reactToolTimeout > 1800000) {
    showToast('❌ 工具执行超时必须在 1-30 分钟 之间', 'error');
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
    // clarifyTimeout / apiRetryCount / apiRetryBaseDelay / enableToolPreselect / preselectMinToolCount 不再配置，使用默认值
    toolConfirmationEnabled: toolConfirmationEnabled,
    enableExecutionLog: enableExecutionLog,
    // 图片识别配置
    enableImageInput: enableImageInput,
    imageModelName: imageModelName,
    imageApiBase: imageApiBase,
    imageApiKey: imageApiKey,
    // 反思配置
    reflectionConfig: reflectionConfig,
    // 流式输出配置
    streamEnabled: streamEnabled
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


