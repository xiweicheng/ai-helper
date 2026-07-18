// options/index.js - 选项页面入口

import { currentModel, setCurrentModel, PRESET_MODELS, loadConfig, saveConfig, addCustomModelToDropdown, removeCustomModel, saveCustomModels, loadCustomModels, updateModelSelection, showStatus, showToast } from './config-manager.js';
import { currentImageModel, setCurrentImageModel, addCustomImageModelToDropdown, removeImageModel, loadImageModels, updateImageModelSelection } from './config-manager.js';
import { addCustomApiBase, removeApiBase, saveApiBases, loadApiBases, updateApiBaseSelection } from './config-manager.js';
import { addCustomImageApiBase, removeImageApiBase, saveImageApiBases, loadImageApiBases, updateImageApiBaseSelection } from './config-manager.js';
import { DEFAULT_SYSTEM_PROMPT } from './constants.js';
import {
  loadToolbarTools,
  renderToolbarToolsList,
  saveToolbarConfig,
  moveTool,
  deleteTool,
  openToolEditModal,
  closeToolEditModal,
  saveToolEdit,
  loadBlockedDomainsUI,
  addBlockedDomain,
  removeBlockedDomain
} from './toolbar-config.js';
import { showExportDialog, triggerImport, handleImportFile, initConfigIOEvents } from './config-io.js';
import { initToolbox, refreshToolbox } from './toolbox-config.js';
import logger from '../shared/logger.js';

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
  const validTabs = ['basic', 'toolbar', 'react', 'reflection', 'chat', 'agent', 'toolbox'];
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
  
  // 初始化工具栏总开关状态
  const enableSelToolbarCheckbox = document.getElementById('enableSelectionToolbar');
  const toolbarConfigEl = document.getElementById('toolbarConfig');
  const toolbarToggleLabelEl = document.getElementById('toolbarToggleLabel');
  if (toolbarConfigEl && enableSelToolbarCheckbox) {
    if (enableSelToolbarCheckbox.checked) {
      toolbarConfigEl.classList.remove('disabled');
    } else {
      toolbarConfigEl.classList.add('disabled');
    }
    if (toolbarToggleLabelEl) {
      toolbarToggleLabelEl.textContent = enableSelToolbarCheckbox.checked ? '已启用' : '已停用';
    }
  }
  
  // 保存按钮事件
  document.getElementById('saveBtn').addEventListener('click', saveConfig);
  
  // 模型选择器事件
  const modelInput = document.getElementById('modelInput');
  const modelDropdown = document.getElementById('modelDropdown');
  
  modelInput.addEventListener('click', function(e) {
    e.stopPropagation();
    modelDropdown.classList.toggle('show');
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

  // ==================== 添加自定义模型表单事件 ====================

  const addModelToggleBtn = document.getElementById('addModelToggleBtn');
  const addModelForm = document.getElementById('addModelForm');
  const addModelName = document.getElementById('addModelName');
  const addModelContextWindow = document.getElementById('addModelContextWindow');
  const confirmAddModelBtn = document.getElementById('confirmAddModelBtn');
  const cancelAddModelBtn = document.getElementById('cancelAddModelBtn');

  if (addModelToggleBtn && addModelForm) {
    addModelToggleBtn.addEventListener('click', function() {
      const isVisible = addModelForm.style.display !== 'none';
      addModelForm.style.display = isVisible ? 'none' : '';
      addModelToggleBtn.textContent = isVisible ? '+ 添加模型' : '− 收起';
      if (!isVisible) {
        addModelName.value = '';
        addModelContextWindow.value = '';
        addModelName.focus();
      }
    });

    cancelAddModelBtn.addEventListener('click', function() {
      addModelForm.style.display = 'none';
      addModelToggleBtn.textContent = '+ 添加模型';
      addModelName.value = '';
      addModelContextWindow.value = '';
    });

    confirmAddModelBtn.addEventListener('click', function() {
      const name = addModelName.value.trim();
      const ctxWindow = parseInt(addModelContextWindow.value) || 0;
      if (!name) {
        showToast('❌ 请输入模型名称', 'error');
        return;
      }
      addCustomModelToDropdown(name, ctxWindow);
      modelInput.value = name;
      setCurrentModel(name);
      updateModelSelection(name);
      chrome.storage.local.set({ modelName: name });
      addModelForm.style.display = 'none';
      addModelToggleBtn.textContent = '+ 添加模型';
      addModelName.value = '';
      addModelContextWindow.value = '';
      showToast('✅ 模型已添加', 'success');
    });

    // 回车键确认添加
    addModelName.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        confirmAddModelBtn.click();
      }
    });
    addModelContextWindow.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        confirmAddModelBtn.click();
      }
    });
  }

  // ==================== 图片识别模型选择器事件 ====================

  const enableImageInputEl = document.getElementById('enableImageInput');
  const imageModelGroup = document.getElementById('imageModelGroup');
  const imageApiGroup = document.getElementById('imageApiGroup');
  const imageApiKeyGroup = document.getElementById('imageApiKeyGroup');
  if (enableImageInputEl && imageModelGroup) {
    enableImageInputEl.addEventListener('change', function() {
      imageModelGroup.style.display = this.checked ? '' : 'none';
      if (imageApiGroup) {
        imageApiGroup.style.display = this.checked ? '' : 'none';
      }
      if (imageApiKeyGroup) {
        imageApiKeyGroup.style.display = this.checked ? '' : 'none';
      }
      // 立即持久化开关状态
      chrome.storage.local.set({ enableImageInput: this.checked });
    });
  }

  const imageModelInput = document.getElementById('imageModelInput');
  const imageModelDropdown = document.getElementById('imageModelDropdown');

  if (imageModelInput && imageModelDropdown) {
    imageModelInput.addEventListener('click', function(e) {
      e.stopPropagation();
      imageModelDropdown.classList.toggle('show');
    });

    imageModelDropdown.addEventListener('click', function(e) {
      if (e.target.classList.contains('delete-model-btn')) {
        e.stopPropagation();
        const option = e.target.closest('.model-option');
        const value = option.dataset.value;
        removeImageModel(value);
        return;
      }
      const option = e.target.closest('.model-option');
      if (option) {
        e.stopPropagation();
        const value = option.dataset.value;
        setCurrentImageModel(value);
        imageModelInput.value = value;
        updateImageModelSelection(value);
        imageModelDropdown.classList.remove('show');
      }
    });

    document.addEventListener('click', function(e) {
      if (!imageModelDropdown.contains(e.target) && e.target !== imageModelInput) {
        imageModelDropdown.classList.remove('show');
      }
    });
  }

  // ==================== 图片模型添加表单事件 ====================

  const addImageModelToggleBtn = document.getElementById('addImageModelToggleBtn');
  const addImageModelForm = document.getElementById('addImageModelForm');
  const addImageModelName = document.getElementById('addImageModelName');
  const addImageModelContextWindow = document.getElementById('addImageModelContextWindow');
  const confirmAddImageModelBtn = document.getElementById('confirmAddImageModelBtn');
  const cancelAddImageModelBtn = document.getElementById('cancelAddImageModelBtn');

  if (addImageModelToggleBtn && addImageModelForm) {
    addImageModelToggleBtn.addEventListener('click', function() {
      const isVisible = addImageModelForm.style.display !== 'none';
      addImageModelForm.style.display = isVisible ? 'none' : '';
      addImageModelToggleBtn.textContent = isVisible ? '+ 添加模型' : '− 收起';
      if (!isVisible) {
        addImageModelName.value = '';
        addImageModelContextWindow.value = '';
        addImageModelName.focus();
      }
    });

    cancelAddImageModelBtn.addEventListener('click', function() {
      addImageModelForm.style.display = 'none';
      addImageModelToggleBtn.textContent = '+ 添加模型';
      addImageModelName.value = '';
      addImageModelContextWindow.value = '';
    });

    confirmAddImageModelBtn.addEventListener('click', function() {
      const name = addImageModelName.value.trim();
      const ctxWindow = parseInt(addImageModelContextWindow.value) || 0;
      if (!name) {
        showToast('❌ 请输入模型名称', 'error');
        return;
      }
      addCustomImageModelToDropdown(name, ctxWindow);
      imageModelInput.value = name;
      setCurrentImageModel(name);
      updateImageModelSelection(name);
      chrome.storage.local.set({ imageModelName: name });
      addImageModelForm.style.display = 'none';
      addImageModelToggleBtn.textContent = '+ 添加模型';
      addImageModelName.value = '';
      addImageModelContextWindow.value = '';
      showToast('✅ 图片模型已添加', 'success');
    });

    // 回车键确认添加
    addImageModelName.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        confirmAddImageModelBtn.click();
      }
    });
    addImageModelContextWindow.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        confirmAddImageModelBtn.click();
      }
    });
  }

  // ==================== API Base URL 选择器事件 ====================

  const apiBaseInput = document.getElementById('apiBase');
  const apiBaseDropdown = document.getElementById('apiBaseDropdown');

  if (apiBaseInput && apiBaseDropdown) {
    apiBaseInput.addEventListener('click', function(e) {
      e.stopPropagation();
      // 点击时重置过滤状态，显示全部选项
      apiBaseDropdown.querySelectorAll('.model-option').forEach(opt => { opt.style.display = ''; });
      apiBaseDropdown.classList.toggle('show');
      // 高亮当前值匹配的选项
      const currentVal = apiBaseInput.value.trim();
      updateApiBaseSelection(currentVal);
    });

    apiBaseDropdown.addEventListener('click', function(e) {
      if (e.target.classList.contains('delete-model-btn')) {
        e.stopPropagation();
        const option = e.target.closest('.model-option');
        const value = option.dataset.value;
        removeApiBase(value);
        return;
      }
      const option = e.target.closest('.model-option');
      if (option) {
        e.stopPropagation();
        const value = option.dataset.value;
        apiBaseInput.value = value;
        updateApiBaseSelection(value);
        apiBaseDropdown.classList.remove('show');
        // 自动保存
        chrome.storage.local.set({ apiBase: value });
        showToast('✅ API Base URL 已切换，请确保 API Key 对应有效', 'info');
      }
    });

    document.addEventListener('click', function(e) {
      if (!apiBaseDropdown.contains(e.target) && e.target !== apiBaseInput) {
        apiBaseDropdown.classList.remove('show');
      }
    });

    // 手动输入后失去焦点时自动保存并添加到下拉
    apiBaseInput.addEventListener('blur', function() {
      const val = this.value.trim();
      if (val) {
        chrome.storage.local.set({ apiBase: val });
        addCustomApiBase(val);
        updateApiBaseSelection(val);
      }
    });

    // 输入时实时过滤下拉选项
    apiBaseInput.addEventListener('input', function() {
      const searchText = this.value.trim().toLowerCase();
      apiBaseDropdown.classList.add('show');
      const options = apiBaseDropdown.querySelectorAll('.model-option');
      let hasMatch = false;
      options.forEach(opt => {
        const url = (opt.dataset.value || '').toLowerCase();
        const label = (opt.dataset.label || '').toLowerCase();
        if (!searchText || url.includes(searchText) || label.includes(searchText)) {
          opt.style.display = '';
          hasMatch = true;
        } else {
          opt.style.display = 'none';
        }
      });
      // 如果输入内容无匹配且非空，显示所有（方便手动输入新地址）
      if (!hasMatch && searchText) {
        options.forEach(opt => { opt.style.display = ''; });
      }
    });
  }

  // ==================== API Base 添加表单事件 ====================

  const addApiBaseToggleBtn = document.getElementById('addApiBaseToggleBtn');
  const addApiBaseForm = document.getElementById('addApiBaseForm');
  const addApiBaseUrl = document.getElementById('addApiBaseUrl');
  const addApiBaseLabel = document.getElementById('addApiBaseLabel');
  const confirmAddApiBaseBtn = document.getElementById('confirmAddApiBaseBtn');
  const cancelAddApiBaseBtn = document.getElementById('cancelAddApiBaseBtn');

  if (addApiBaseToggleBtn && addApiBaseForm) {
    addApiBaseToggleBtn.addEventListener('click', function() {
      const isVisible = addApiBaseForm.style.display !== 'none';
      addApiBaseForm.style.display = isVisible ? 'none' : '';
      addApiBaseToggleBtn.textContent = isVisible ? '+ 添加地址' : '− 收起';
      if (!isVisible) {
        addApiBaseUrl.value = '';
        addApiBaseLabel.value = '';
        addApiBaseUrl.focus();
      }
    });

    cancelAddApiBaseBtn.addEventListener('click', function() {
      addApiBaseForm.style.display = 'none';
      addApiBaseToggleBtn.textContent = '+ 添加地址';
      addApiBaseUrl.value = '';
      addApiBaseLabel.value = '';
    });

    confirmAddApiBaseBtn.addEventListener('click', function() {
      const url = addApiBaseUrl.value.trim();
      const label = addApiBaseLabel.value.trim();
      if (!url) {
        showToast('❌ 请输入 API Base URL', 'error');
        return;
      }
      // 简单校验 URL 格式
      try {
        new URL(url);
      } catch {
        showToast('❌ URL 格式不正确', 'error');
        return;
      }
      addCustomApiBase(url, label);
      apiBaseInput.value = url;
      updateApiBaseSelection(url);
      chrome.storage.local.set({ apiBase: url });
      addApiBaseForm.style.display = 'none';
      addApiBaseToggleBtn.textContent = '+ 添加地址';
      addApiBaseUrl.value = '';
      addApiBaseLabel.value = '';
      showToast('✅ API Base URL 已添加', 'success');
    });

    // 回车键确认添加
    addApiBaseUrl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') confirmAddApiBaseBtn.click();
    });
    addApiBaseLabel.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') confirmAddApiBaseBtn.click();
    });
  }

  // ==================== 图片 API Base URL 选择器事件 ====================

  const imageApiBaseInput = document.getElementById('imageApiBase');
  const imageApiBaseDropdown = document.getElementById('imageApiBaseDropdown');

  if (imageApiBaseInput && imageApiBaseDropdown) {
    imageApiBaseInput.addEventListener('click', function(e) {
      e.stopPropagation();
      // 点击时重置过滤状态，显示全部选项
      imageApiBaseDropdown.querySelectorAll('.model-option').forEach(opt => { opt.style.display = ''; });
      imageApiBaseDropdown.classList.toggle('show');
      const currentVal = imageApiBaseInput.value.trim();
      updateImageApiBaseSelection(currentVal);
    });

    imageApiBaseDropdown.addEventListener('click', function(e) {
      if (e.target.classList.contains('delete-model-btn')) {
        e.stopPropagation();
        const option = e.target.closest('.model-option');
        const value = option.dataset.value;
        removeImageApiBase(value);
        return;
      }
      const option = e.target.closest('.model-option');
      if (option) {
        e.stopPropagation();
        const value = option.dataset.value;
        imageApiBaseInput.value = value;
        updateImageApiBaseSelection(value);
        imageApiBaseDropdown.classList.remove('show');
        chrome.storage.local.set({ imageApiBase: value });
        showToast('✅ 图片 API Base URL 已切换', 'info');
      }
    });

    document.addEventListener('click', function(e) {
      if (!imageApiBaseDropdown.contains(e.target) && e.target !== imageApiBaseInput) {
        imageApiBaseDropdown.classList.remove('show');
      }
    });

    imageApiBaseInput.addEventListener('blur', function() {
      const val = this.value.trim();
      if (val) {
        chrome.storage.local.set({ imageApiBase: val });
        addCustomImageApiBase(val);
        updateImageApiBaseSelection(val);
      }
    });

    // 输入时实时过滤下拉选项
    imageApiBaseInput.addEventListener('input', function() {
      const searchText = this.value.trim().toLowerCase();
      imageApiBaseDropdown.classList.add('show');
      const options = imageApiBaseDropdown.querySelectorAll('.model-option');
      let hasMatch = false;
      options.forEach(opt => {
        const url = (opt.dataset.value || '').toLowerCase();
        const label = (opt.dataset.label || '').toLowerCase();
        if (!searchText || url.includes(searchText) || label.includes(searchText)) {
          opt.style.display = '';
          hasMatch = true;
        } else {
          opt.style.display = 'none';
        }
      });
      if (!hasMatch && searchText) {
        options.forEach(opt => { opt.style.display = ''; });
      }
    });
  }

  // ==================== 图片 API Base 添加表单事件 ====================

  const addImageApiBaseToggleBtn = document.getElementById('addImageApiBaseToggleBtn');
  const addImageApiBaseForm = document.getElementById('addImageApiBaseForm');
  const addImageApiBaseUrl = document.getElementById('addImageApiBaseUrl');
  const addImageApiBaseLabel = document.getElementById('addImageApiBaseLabel');
  const confirmAddImageApiBaseBtn = document.getElementById('confirmAddImageApiBaseBtn');
  const cancelAddImageApiBaseBtn = document.getElementById('cancelAddImageApiBaseBtn');

  if (addImageApiBaseToggleBtn && addImageApiBaseForm) {
    addImageApiBaseToggleBtn.addEventListener('click', function() {
      const isVisible = addImageApiBaseForm.style.display !== 'none';
      addImageApiBaseForm.style.display = isVisible ? 'none' : '';
      addImageApiBaseToggleBtn.textContent = isVisible ? '+ 添加地址' : '− 收起';
      if (!isVisible) {
        addImageApiBaseUrl.value = '';
        addImageApiBaseLabel.value = '';
        addImageApiBaseUrl.focus();
      }
    });

    cancelAddImageApiBaseBtn.addEventListener('click', function() {
      addImageApiBaseForm.style.display = 'none';
      addImageApiBaseToggleBtn.textContent = '+ 添加地址';
      addImageApiBaseUrl.value = '';
      addImageApiBaseLabel.value = '';
    });

    confirmAddImageApiBaseBtn.addEventListener('click', function() {
      const url = addImageApiBaseUrl.value.trim();
      const label = addImageApiBaseLabel.value.trim();
      if (!url) {
        showToast('❌ 请输入 API Base URL', 'error');
        return;
      }
      try {
        new URL(url);
      } catch {
        showToast('❌ URL 格式不正确', 'error');
        return;
      }
      addCustomImageApiBase(url, label);
      imageApiBaseInput.value = url;
      updateImageApiBaseSelection(url);
      chrome.storage.local.set({ imageApiBase: url });
      addImageApiBaseForm.style.display = 'none';
      addImageApiBaseToggleBtn.textContent = '+ 添加地址';
      addImageApiBaseUrl.value = '';
      addImageApiBaseLabel.value = '';
      showToast('✅ 图片 API Base URL 已添加', 'success');
    });

    addImageApiBaseUrl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') confirmAddImageApiBaseBtn.click();
    });
    addImageApiBaseLabel.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') confirmAddImageApiBaseBtn.click();
    });
  }

  // 图片识别 API Key 自动保存
  const imageApiKeyEl = document.getElementById('imageApiKey');
  const toggleImageApiKeyBtn = document.getElementById('toggleImageApiKeyBtn');
  if (imageApiKeyEl) {
    imageApiKeyEl.addEventListener('blur', function() {
      chrome.storage.local.set({ imageApiKey: this.value.trim() });
    });
  }
  if (imageApiKeyEl && toggleImageApiKeyBtn) {
    const imgIconEyeOpen = toggleImageApiKeyBtn.querySelector('.icon-eye-open');
    const imgIconEyeClosed = toggleImageApiKeyBtn.querySelector('.icon-eye-closed');
    toggleImageApiKeyBtn.addEventListener('click', function() {
      if (imageApiKeyEl.type === 'password') {
        imageApiKeyEl.type = 'text';
        imgIconEyeOpen.style.display = 'none';
        imgIconEyeClosed.style.display = 'block';
      } else {
        imageApiKeyEl.type = 'password';
        imgIconEyeOpen.style.display = 'block';
        imgIconEyeClosed.style.display = 'none';
      }
    });
  }
  
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
  
  // 重置系统提示词按钮事件
  const resetSystemPromptBtn = document.getElementById('resetSystemPromptBtn');
  if (resetSystemPromptBtn) {
    resetSystemPromptBtn.addEventListener('click', function() {
      document.getElementById('systemPrompt').value = DEFAULT_SYSTEM_PROMPT;
    });
  }
  
  // ==================== 工具栏配置事件 ====================
  
  // 工具栏图标精简模式变更
  const iconOnlyCheckbox = document.getElementById('toolbarIconOnly');
  if (iconOnlyCheckbox) {
    iconOnlyCheckbox.addEventListener('change', function() {
      saveToolbarConfig();
    });
  }
  
  // 选中内容工具栏开关变更
  const enableSelectionToolbarCheckbox = document.getElementById('enableSelectionToolbar');
  const toolbarConfig = document.getElementById('toolbarConfig');
  const toolbarToggleLabel = document.getElementById('toolbarToggleLabel');
  
  function updateToolbarToggleState() {
    const enabled = enableSelectionToolbarCheckbox && enableSelectionToolbarCheckbox.checked;
    if (toolbarConfig) {
      if (enabled) {
        toolbarConfig.classList.remove('disabled');
      } else {
        toolbarConfig.classList.add('disabled');
      }
    }
    if (toolbarToggleLabel) {
      toolbarToggleLabel.textContent = enabled ? '已启用' : '已停用';
    }
  }
  
  if (enableSelectionToolbarCheckbox) {
    enableSelectionToolbarCheckbox.addEventListener('change', function() {
      updateToolbarToggleState();
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
  
  // 反思总开关控制
  const reflectionEnabled = document.getElementById('reflectionEnabled');
  const reflectionConfig = document.getElementById('reflectionConfig');
  const reflectionToggleLabel = document.getElementById('reflectionToggleLabel');
  
  function updateReflectionSectionVisibility() {
    if (!reflectionConfig) return;
    
    const enabled = reflectionEnabled && reflectionEnabled.checked;
    if (!enabled) {
      reflectionConfig.classList.add('disabled');
    } else {
      reflectionConfig.classList.remove('disabled');
    }
    
    if (reflectionToggleLabel) {
      reflectionToggleLabel.textContent = enabled ? '已启用' : '已停用';
    }
  }
  
  function updateReflectionModuleVisibility(moduleId, toggleId) {
    const module = document.getElementById(moduleId);
    const toggle = document.getElementById(toggleId);
    
    if (!module || !toggle) return;
    
    if (!toggle.checked) {
      module.classList.add('disabled');
    } else {
      module.classList.remove('disabled');
    }
  }
  
  if (reflectionEnabled) {
    reflectionEnabled.addEventListener('change', updateReflectionSectionVisibility);
    // 初始化反思总开关状态
    updateReflectionSectionVisibility();
  }
  
  // 后置反思开关控制
  const postReflectionEnabled = document.getElementById('postReflectionEnabled');
  if (postReflectionEnabled) {
    postReflectionEnabled.addEventListener('change', function() {
      updateReflectionModuleVisibility('postReflectionSection', 'postReflectionEnabled');
    });
  }
  
  // 工具级反思开关控制
  const toolReflectionEnabled = document.getElementById('toolReflectionEnabled');
  if (toolReflectionEnabled) {
    toolReflectionEnabled.addEventListener('change', function() {
      updateReflectionModuleVisibility('toolReflectionSection', 'toolReflectionEnabled');
    });
  }
  
  // 子任务反思开关控制
  const subtaskReflectionEnabled = document.getElementById('subtaskReflectionEnabled');
  if (subtaskReflectionEnabled) {
    subtaskReflectionEnabled.addEventListener('change', function() {
      updateReflectionModuleVisibility('subtaskReflectionSection', 'subtaskReflectionEnabled');
    });
  }
  
  // 初始化时更新可见性
  updateReflectionSectionVisibility();
  updateReflectionModuleVisibility('postReflectionSection', 'postReflectionEnabled');
  updateReflectionModuleVisibility('toolReflectionSection', 'toolReflectionEnabled');
  updateReflectionModuleVisibility('subtaskReflectionSection', 'subtaskReflectionEnabled');

  // ==================== 流式输出配置 ====================
  const streamEnabledEl = document.getElementById('streamEnabled');
  const streamEnabledLabel = document.getElementById('streamEnabledLabel');
  if (streamEnabledEl && streamEnabledLabel) {
    streamEnabledEl.addEventListener('change', function() {
      if (streamEnabledLabel) {
        streamEnabledLabel.textContent = streamEnabledEl.checked ? '已启用' : '已停用';
      }
    });
    if (streamEnabledLabel) {
      streamEnabledLabel.textContent = streamEnabledEl.checked ? '已启用' : '已停用';
    }
  }

  // 敏感操作确认开关状态标签
  const toolConfirmationEnabledEl = document.getElementById('toolConfirmationEnabled');
  const toolConfirmationEnabledLabel = document.getElementById('toolConfirmationEnabledLabel');
  if (toolConfirmationEnabledEl && toolConfirmationEnabledLabel) {
    toolConfirmationEnabledEl.addEventListener('change', function() {
      toolConfirmationEnabledLabel.textContent = this.checked ? '已启用' : '已停用';
    });
    // 初始化同步（覆盖 HTML 默认值，防止 loadConfig 异步更新前的闪现）
    toolConfirmationEnabledLabel.textContent = toolConfirmationEnabledEl.checked ? '已启用' : '已停用';
  }

  // 启用执行日志开关状态标签
  const enableExecutionLogEl = document.getElementById('enableExecutionLog');
  const enableExecutionLogLabel = document.getElementById('enableExecutionLogLabel');
  if (enableExecutionLogEl && enableExecutionLogLabel) {
    enableExecutionLogEl.addEventListener('change', function() {
      enableExecutionLogLabel.textContent = this.checked ? '已启用' : '已停用';
    });
    enableExecutionLogLabel.textContent = enableExecutionLogEl.checked ? '已启用' : '已停用';
  }

  // ==================== Agent 配置 ====================
  initAgentConfig();

  // ==================== 配置导入/导出 ====================
  document.getElementById('exportConfigBtn').addEventListener('click', showExportDialog);
  document.getElementById('importConfigBtn').addEventListener('click', triggerImport);
  document.getElementById('importConfigFile').addEventListener('change', function(e) {
    if (e.target.files && e.target.files.length > 0) {
      handleImportFile(e.target.files[0]);
    }
  });
  initConfigIOEvents();

  // 初始化工具箱 Tab（延迟加载，页面对 Agent 连接状态有依赖）
  initToolbox();

  // 切换到工具箱 Tab 时刷新数据（因为 Agent 可能在其他 Tab 连接后变可用）
  document.querySelector('[data-tab="toolbox"]')?.addEventListener('click', () => {
    refreshToolbox();
  });
});

// 持久化并重新渲染
function persistAndRender() {
  chrome.storage.local.set({ toolbarTools: currentTools }, () => {
    renderToolbarToolsList(currentTools);
    saveToolbarConfig();
  });
}

// ==================== Agent 配置函数 ====================

/**
 * 初始化 Agent 配置界面
 */
function initAgentConfig() {
  const agentUrlInput = document.getElementById('agentUrl');
  const pairCodeInput = document.getElementById('agentPairCode');
  const connectBtn = document.getElementById('agentConnectBtn');
  const disconnectBtn = document.getElementById('agentDisconnectBtn');
  const statusDot = document.getElementById('agentStatusDot');
  const statusText = document.getElementById('agentStatusText');
  const agentStatus = document.getElementById('agentStatus');
  const pairCodeGroup = document.getElementById('pairCodeGroup');
  const disconnectGroup = document.getElementById('disconnectGroup');
  const agentInfo = document.getElementById('agentInfo');
  const agentWorkdirEl = document.getElementById('agentWorkdir');
  const agentDetailToggle = document.getElementById('agentDetailToggle');
  const agentDetailPanel = document.getElementById('agentDetailPanel');

  if (!agentUrlInput || !connectBtn) return;

  // 缓存最新的详情数据
  let lastDetailData = null;

  /**
   * 格式化字节大小
   */
  function formatBytes(bytes) {
    if (bytes == null || bytes === 0) return '无限制';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return (Math.round(val * 10) / 10) + ' ' + units[i];
  }

  /**
   * 格式化毫秒时长
   */
  function formatDuration(ms) {
    if (ms == null || ms === 0) return '无限制';
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(0) + 's';
    return (ms / 60000).toFixed(1) + ' min';
  }

  /**
   * 渲染 Agent 详情面板
   */
  function renderAgentDetail(data) {
    lastDetailData = data;
    if (!agentDetailPanel) return;

    const rows = [];

    if (data.searchTools) {
      const fdOk = data.searchTools.fd ? '✅' : '❌';
      const rgOk = data.searchTools.rg ? '✅' : '❌';
      rows.push(`<div class="detail-row"><span class="detail-label">搜索引擎</span><span class="detail-value">fd ${fdOk} &nbsp; rg ${rgOk}</span></div>`);
    }
    if (data.hostname) {
      rows.push(`<div class="detail-row"><span class="detail-label">主机名</span><span class="detail-value">${escHtml(data.hostname)}</span></div>`);
    }
    if (data.shell) {
      rows.push(`<div class="detail-row"><span class="detail-label">Shell</span><span class="detail-value">${escHtml(data.shell)}</span></div>`);
    }
    if (data.homeDir) {
      rows.push(`<div class="detail-row"><span class="detail-label">用户目录</span><span class="detail-value">${escHtml(data.homeDir)}</span></div>`);
    }
    if (data.nodeVersion) {
      rows.push(`<div class="detail-row"><span class="detail-label">Node.js</span><span class="detail-value">${escHtml(data.nodeVersion)}</span></div>`);
    }
    if (data.commandTimeout != null) {
      rows.push(`<div class="detail-row"><span class="detail-label">命令超时</span><span class="detail-value">${formatDuration(data.commandTimeout)}</span></div>`);
    }
    if (data.fileMaxSize != null) {
      rows.push(`<div class="detail-row"><span class="detail-label">文件大小限制</span><span class="detail-value">${formatBytes(data.fileMaxSize)}</span></div>`);
    }
    if (data.allowedPaths && data.allowedPaths.length > 0) {
      const pathsHtml = data.allowedPaths.map(p => `<code>${escHtml(p)}</code>`).join('<br>');
      rows.push(`<div class="detail-row"><span class="detail-label">允许访问的目录</span><span class="detail-value">${pathsHtml}</span></div>`);
    }
    if (data.pairCodeTTL != null) {
      rows.push(`<div class="detail-row"><span class="detail-label">配对码有效期</span><span class="detail-value">${data.pairCodeTTL}s</span></div>`);
    }

    agentDetailPanel.innerHTML = rows.join('');
    agentDetailToggle.style.display = 'block';
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * 更新连接状态 UI
   */
  function updateStatusUI(status, message, detailData) {
    agentStatus.className = 'agent-status ' + status;
    statusText.textContent = message;

    if (status === 'connected') {
      pairCodeGroup.style.display = 'none';
      disconnectGroup.style.display = '';
      agentStatus.className = 'agent-status connected';

      if (detailData) {
        agentInfo.style.display = '';
        if (detailData.workdir) {
          agentWorkdirEl.innerHTML = `📁 工作目录: ${detailData.workdir}`;
        }
        renderAgentDetail(detailData);
      }
    } else if (status === 'checking') {
      agentStatus.className = 'agent-status checking';
    } else {
      pairCodeGroup.style.display = '';
      disconnectGroup.style.display = 'none';
      agentInfo.style.display = 'none';
      agentStatus.className = 'agent-status disconnected';
      if (agentDetailToggle) agentDetailToggle.style.display = 'none';
      if (agentDetailPanel) agentDetailPanel.innerHTML = '';
      lastDetailData = null;
    }
  }

  /**
   * 合并公开状态和认证详情为统一数据结构
   */
  function mergeDetail(statusData, detailData) {
    return {
      version: detailData?.version || statusData?.version,
      platformName: statusData?.platformName,
      platform: statusData?.platform,
      arch: statusData?.arch,
      hostname: statusData?.hostname,
      shell: statusData?.shell,
      homeDir: statusData?.homeDir,
      nodeVersion: statusData?.nodeVersion,
      searchTools: statusData?.searchTools,
      workdir: detailData?.workdir || statusData?.workdir || '',
      allowedPaths: detailData?.allowedPaths || [],
      commandTimeout: detailData?.commandTimeout,
      fileMaxSize: detailData?.fileMaxSize,
      pairCodeTTL: detailData?.pairCodeTTL
    };
  }

  /**
   * 检查 Agent 连接状态
   */
  async function checkAgentStatus() {
    updateStatusUI('checking', '正在检查连接...');

    const result = await chrome.storage.local.get(['agentUrl', 'agentToken']);
    const storedUrl = result.agentUrl;
    const storedToken = result.agentToken;

    if (!storedUrl) {
      updateStatusUI('disconnected', '未连接 - 请填入配对码完成配对');
      agentUrlInput.value = 'http://127.0.0.1:18910';
      return;
    }

    agentUrlInput.value = storedUrl;

    try {
      const response = await fetch(`${storedUrl}/api/status`);
      if (response.ok) {
        const statusData = await response.json();
        // 更新平台信息
        const platformInfo = {
          platformName: statusData.platformName || 'Unknown',
          platform: statusData.platform || 'unknown',
          arch: statusData.arch || 'unknown',
          shell: statusData.shell || '/bin/sh',
          homeDir: statusData.homeDir || '',
          workdir: '',
          connected: true
        };
        await chrome.storage.local.set({ agentPlatform: platformInfo });

        if (!storedToken) {
          updateStatusUI('disconnected', 'Agent 在线 - 请填入配对码完成配对');
          return;
        }
        // 获取详细信息（含工作目录和配置）
        try {
          const detailResp = await fetch(`${storedUrl}/api/status/detail`, {
            headers: { 'Authorization': `Bearer ${storedToken}` }
          });
          if (detailResp.ok) {
            const detailData = await detailResp.json();
            platformInfo.workdir = detailData.workdir || '';
            await chrome.storage.local.set({ agentPlatform: platformInfo });

            const merged = mergeDetail(statusData, detailData);
            const labelParts = [`Agent v${merged.version}`];
            if (merged.platformName && merged.arch) labelParts.push(`${merged.platformName} ${merged.arch}`);
            if (merged.nodeVersion) labelParts.push(`Node ${merged.nodeVersion}`);
            updateStatusUI('connected', labelParts.join(' | '), merged);
          } else {
            updateStatusUI('disconnected', 'Token 已失效 - 请重新配对');
          }
        } catch {
          updateStatusUI('disconnected', 'Token 已失效 - 请重新配对');
        }
      } else {
        updateStatusUI('disconnected', '连接失败 - Token 已失效，请重新配对');
      }
    } catch {
      await chrome.storage.local.remove('agentPlatform');
      updateStatusUI('disconnected', '无法连接到代理 - 请确认代理服务已启动');
    }
  }

  /**
   * 连接 Agent
   */
  async function connectToAgent() {
    const url = agentUrlInput.value.trim() || 'http://127.0.0.1:18910';
    const code = pairCodeInput.value.trim();

    if (!code || code.length !== 4) {
      showToast('请输入4位配对码', 'warning');
      return;
    }

    updateStatusUI('checking', '正在配对...');
    connectBtn.disabled = true;
    connectBtn.textContent = '配对中...';

    try {
      const response = await fetch(`${url}/api/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, extensionId: chrome.runtime.id })
      });
      const data = await response.json();

      if (data.success && data.token) {
        await chrome.storage.local.set({ agentUrl: url, agentToken: data.token });
        pairCodeInput.value = '';
        updateStatusUI('connected', '配对成功');
        showToast('✅ 配对成功！Agent 已连接', 'success');

        // 获取 Agent 平台信息并存储
        try {
          const statusResp = await fetch(`${url}/api/status`);
          if (statusResp.ok) {
            const statusData = await statusResp.json();
            const platformInfo = {
              platformName: statusData.platformName || 'Unknown',
              platform: statusData.platform || 'unknown',
              arch: statusData.arch || 'unknown',
              shell: statusData.shell || '/bin/sh',
              homeDir: statusData.homeDir || '',
              workdir: statusData.workdir || '',
              connected: true
            };
            await chrome.storage.local.set({ agentPlatform: platformInfo });
            logger.debug('[Options] Agent 平台信息已保存:', platformInfo);
          }
        } catch (e) {
          logger.warn('[Options] 获取 Agent 平台信息失败:', e);
        }

        // 获取完整状态和配置
        try {
          const [statusResp2, detailResp2] = await Promise.all([
            fetch(`${url}/api/status`),
            fetch(`${url}/api/status/detail`, { headers: { 'Authorization': `Bearer ${data.token}` } })
          ]);
          if (statusResp2.ok && detailResp2.ok) {
            const statusData2 = await statusResp2.json();
            const detailData2 = await detailResp2.json();
            // 更新 workdir 到平台信息
            const platformInfo = (await chrome.storage.local.get('agentPlatform')).agentPlatform || {};
            platformInfo.workdir = detailData2.workdir || '';
            await chrome.storage.local.set({ agentPlatform: platformInfo });

            const merged = mergeDetail(statusData2, detailData2);
            const labelParts = [`Agent v${merged.version}`];
            if (merged.platformName && merged.arch) labelParts.push(`${merged.platformName} ${merged.arch}`);
            if (merged.nodeVersion) labelParts.push(`Node ${merged.nodeVersion}`);
            updateStatusUI('connected', labelParts.join(' | '), merged);
          }
        } catch (e) {
          logger.warn('[Options] 获取 Agent 详情失败:', e);
        }

        // 通知 Side Panel 状态变化（直接在 storage 写入完成后即时通知）
        chrome.runtime.sendMessage({ type: 'AGENT_CONNECTION_CHANGED', connected: true }).catch(() => {});
      } else {
        updateStatusUI('disconnected', '配对失败：' + (data.error || '未知错误'));
        showToast('❌ ' + (data.error || '配对失败'), 'error');
      }
    } catch (err) {
      updateStatusUI('disconnected', '连接失败 - 请确认代理服务已启动');
      showToast('❌ 无法连接到 Agent: ' + err.message, 'error');
    } finally {
      connectBtn.disabled = false;
      connectBtn.textContent = '连接';
    }
  }

  /**
   * 断开 Agent 连接
   */
  async function disconnectAgent() {
    await chrome.storage.local.remove(['agentUrl', 'agentToken', 'agentPlatform']);
    pairCodeInput.value = '';
    updateStatusUI('disconnected', '已断开连接');
    showToast('已断开 Agent 连接', 'info');
    // 通知 Side Panel 状态变化
    chrome.runtime.sendMessage({ type: 'AGENT_CONNECTION_CHANGED', connected: false }).catch(() => {});
  }

  // 详情面板折叠切换
  if (agentDetailToggle && agentDetailPanel) {
    agentDetailToggle.addEventListener('click', () => {
      const isOpen = getComputedStyle(agentDetailPanel).display !== 'none';
      agentDetailPanel.style.display = isOpen ? 'none' : 'block';
      agentDetailToggle.textContent = isOpen ? '▶ 详细信息' : '▼ 详细信息';
      agentDetailToggle.classList.toggle('open', !isOpen);
    });
  }

  // 绑定事件
  connectBtn.addEventListener('click', connectToAgent);
  disconnectBtn.addEventListener('click', disconnectAgent);

  // 回车键快速配对
  pairCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connectToAgent();
  });

  // 启动时检查状态
  checkAgentStatus();
}