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
import { showCustomConfirm } from './toolbox-shared.js';
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
  const agentNameInput = document.getElementById('agentName');
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
  const pairedAgentsSection = document.getElementById('pairedAgentsSection');
  const pairedAgentsList = document.getElementById('pairedAgentsList');
  const addAgentTitle = document.getElementById('addAgentTitle');

  if (!agentUrlInput || !connectBtn) return;

  let lastDetailData = null;

  // ========== 多代理列表渲染 ==========

  /** ping 代理检查在线状态 */
  async function pingAgent(url) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 2000);
      const resp = await fetch(`${url}/api/status`, { signal: controller.signal, cache: 'no-cache' });
      clearTimeout(tid);
      return resp.ok;
    } catch { return false; }
  }

  /** 渲染已配对代理列表 */
  async function renderPairedAgents() {
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = storage.pairedAgents || [];
    const activeId = storage.activeAgentId;

    if (agents.length === 0) {
      pairedAgentsSection.style.display = 'none';
      addAgentTitle.textContent = '添加新代理';
      return;
    }

    pairedAgentsSection.style.display = '';
    addAgentTitle.textContent = '再添加一个代理';

    // 先渲染列表，状态统一显示"检测中"，停用的显示"已停用"
    pairedAgentsList.innerHTML = agents.map((a) => {
      const isActive = a.id === activeId;
      const isDisabled = !!a.disabled;
      let dotClass, statusLabel, statusClass;

      if (isDisabled) {
        dotClass = isActive ? 'active-disabled' : 'disabled';
        statusLabel = '已停用';
        statusClass = 'disabled';
      } else {
        dotClass = isActive ? 'active-checking' : 'checking';
        statusLabel = '检测中';
        statusClass = 'checking';
      }

      return `
        <div class="paired-agent-item${isActive ? ' active' : ''}${isDisabled ? ' disabled' : ''}" data-agent-id="${a.id}">
          <span class="paired-agent-dot ${dotClass}" title="${statusLabel}"></span>
          <span class="paired-agent-name" data-agent-id="${a.id}" data-original="${escHtml(a.name)}" title="点击编辑名称">${escHtml(a.name)}</span>
          <span class="paired-agent-url">${escHtml(a.url)}</span>
          <span class="paired-agent-status-text ${statusClass}">${statusLabel}</span>
          <div class="paired-agent-actions">
            ${isDisabled
              ? `<button class="paired-agent-btn enable-btn" data-action="enable" data-id="${a.id}">启用</button>`
              : (isActive
                ? '<button class="paired-agent-btn switch-btn active-hint" disabled>当前</button>'
                : `<button class="paired-agent-btn switch-btn" data-action="switch" data-id="${a.id}">切换</button>`
              )
            }
            ${isDisabled ? '' : `<button class="paired-agent-btn disable-btn" data-action="disable" data-id="${a.id}">停用</button>`}
            <button class="paired-agent-btn delete-btn" data-action="delete" data-id="${a.id}">删除</button>
          </div>
        </div>`;
    }).join('');

    bindPairedAgentEvents(agents);

    // 异步 ping 所有非停用代理，逐个回填状态
    agents.forEach((a) => {
      if (a.disabled) return; // 停用的代理跳过 ping
      pingAgent(a.url).then((online) => {
        _updateAgentItemStatus(a.id, online);
      });
    });
  }

  /** 更新单个代理列表项的状态 */
  function _updateAgentItemStatus(agentId, online) {
    const item = pairedAgentsList.querySelector(`[data-agent-id="${agentId}"]`);
    if (!item) return;

    const dotEl = item.querySelector('.paired-agent-dot');
    const statusEl = item.querySelector('.paired-agent-status-text');
    const isActive = item.classList.contains('active');

    const dotClass = isActive
      ? (online ? 'active-online' : 'active-offline')
      : (online ? 'online' : 'offline');
    const statusLabel = online ? '在线' : '离线';

    if (dotEl) {
      dotEl.className = `paired-agent-dot ${dotClass}`;
      dotEl.title = `${isActive ? '当前使用 · ' : ''}${statusLabel}`;
    }
    if (statusEl) {
      statusEl.className = `paired-agent-status-text ${online ? 'online' : 'offline'}`;
      statusEl.textContent = statusLabel;
    }
  }

  /** 绑定代理列表事件（名称编辑 + 切换 + 删除） */
  function bindPairedAgentEvents(agents) {
    // 名称点击编辑
    pairedAgentsList.querySelectorAll('.paired-agent-name').forEach(nameEl => {
      nameEl.addEventListener('click', () => {
        if (nameEl.querySelector('input')) return; // 已在编辑中
        const agentId = nameEl.dataset.agentId;
        const original = nameEl.dataset.original;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = original;
        input.className = 'paired-agent-name-input';
        input.style.cssText = 'flex:1;font-size:14px;font-weight:500;border:1px solid #667eea;border-radius:4px;padding:2px 6px;outline:none;color:#2d3748;';
        nameEl.innerHTML = '';
        nameEl.appendChild(input);
        input.focus();
        input.select();

        const finishEdit = async () => {
          const newName = input.value.trim() || original;
          input.remove();
          nameEl.textContent = newName;
          nameEl.dataset.original = newName;

          const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
          const currentAgents = storage.pairedAgents || [];
          const idx = currentAgents.findIndex(a => a.id === agentId);
          if (idx !== -1) {
            currentAgents[idx].name = newName;
            await chrome.storage.local.set({ pairedAgents: currentAgents });
          }
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { input.blur(); }
          if (e.key === 'Escape') {
            input.value = original;
            input.blur();
          }
        });
      });
    });

    // 事件委托：切换 + 停用/启用 + 删除
    pairedAgentsList.querySelectorAll('.paired-agent-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const agentId = btn.dataset.id;
        if (action === 'switch') {
          await switchToAgent(agentId);
        } else if (action === 'disable') {
          await disableAgent(agentId);
        } else if (action === 'enable') {
          await enableAgent(agentId);
        } else if (action === 'delete') {
          await deletePairedAgent(agentId);
        }
      });
    });
  }

  /** 切换到指定代理 */
  async function switchToAgent(agentId) {
    const agents = await chrome.storage.local.get('pairedAgents');
    const agent = (agents.pairedAgents || []).find(a => a.id === agentId);
    if (!agent) return;

    // 写入 storage 设为活跃
    await chrome.storage.local.set({ activeAgentId: agentId });
    agentUrlInput.value = agent.url;

    // 获取代理详情并展示
    await fetchAndShowAgentDetail(agent.url, agent.token);

    // 通知 background + Side Panel
    chrome.runtime.sendMessage({
      type: 'AGENT_CONNECTION_CHANGED',
      connected: true,
      agentId
    }).catch(() => {});

    showToast(`已切换到: ${agent.name}`, 'success');

    // 重新渲染列表
    await renderPairedAgents();
  }

  /** 删除已配对代理 */
  async function deletePairedAgent(agentId) {
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = storage.pairedAgents || [];
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    // 自定义确认弹窗
    const confirmed = await showCustomConfirm(
      `确定要删除代理 "${agent.name}" (${agent.url}) 吗？\n删除后需重新配对才能使用。`,
      '删除代理'
    );
    if (!confirmed) return;

    const newAgents = agents.filter(a => a.id !== agentId);
    let newActiveId = storage.activeAgentId;

    if (storage.activeAgentId === agentId) {
      newActiveId = newAgents.length > 0 ? newAgents[0].id : null;
    }

    await chrome.storage.local.set({
      pairedAgents: newAgents,
      activeAgentId: newActiveId
    });

    // 如果删的是活跃代理，切换到第一个
    if (newActiveId && newActiveId !== storage.activeAgentId) {
      const newActive = newAgents.find(a => a.id === newActiveId);
      chrome.runtime.sendMessage({
        type: 'AGENT_CONNECTION_CHANGED',
        connected: true,
        agentId: newActiveId
      }).catch(() => {});
    } else if (!newActiveId) {
      chrome.runtime.sendMessage({
        type: 'AGENT_CONNECTION_CHANGED',
        connected: false
      }).catch(() => {});
    }

    showToast(`已删除代理: ${agent.name}`, 'info');
    await renderPairedAgents();
    await refreshActiveAgentUI();
  }

  /** 停用指定代理 */
  async function disableAgent(agentId) {
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = storage.pairedAgents || [];
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    // 如果停用的是当前活跃代理，先切换到其他可用代理（或断开）
    if (storage.activeAgentId === agentId) {
      const next = agents.find(a => a.id !== agentId && !a.disabled);
      if (next) {
        await chrome.storage.local.set({ activeAgentId: next.id });
        chrome.runtime.sendMessage({
          type: 'AGENT_CONNECTION_CHANGED', connected: true, agentId: next.id
        }).catch(() => {});
      } else {
        // 没有其他可用代理，断开连接
        await chrome.storage.local.set({ activeAgentId: null });
        chrome.runtime.sendMessage({
          type: 'AGENT_CONNECTION_CHANGED', connected: false
        }).catch(() => {});
      }
    }

    const idx = agents.findIndex(a => a.id === agentId);
    agents[idx].disabled = true;
    await chrome.storage.local.set({ pairedAgents: agents });

    showToast(`已停用代理: ${agent.name}`, 'info');
    await renderPairedAgents();
    await refreshActiveAgentUI();
  }

  /** 启用指定代理 */
  async function enableAgent(agentId) {
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = storage.pairedAgents || [];
    const idx = agents.findIndex(a => a.id === agentId);
    if (idx === -1) return;

    agents[idx].disabled = false;
    await chrome.storage.local.set({ pairedAgents: agents });

    showToast(`已启用代理: ${agents[idx].name}`, 'success');
    await renderPairedAgents();
  }

  /** 获取活跃代理详情并更新状态 UI */
  async function fetchAndShowAgentDetail(url, token) {
    updateStatusUI('checking', '正在获取代理信息...');

    try {
      const statusResp = await fetch(`${url}/api/status`, { cache: 'no-cache' });
      if (!statusResp.ok) {
        updateStatusUI('disconnected', '代理服务不可达');
        return;
      }
      const statusData = await statusResp.json();

      // 获取详细信息
      try {
        const detailResp = await fetch(`${url}/api/status/detail`, {
          cache: 'no-cache',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (detailResp.ok) {
          const detailData = await detailResp.json();
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
    } catch {
      updateStatusUI('disconnected', '无法连接到代理 - 请确认代理服务已启动');
    }
  }

  /** 刷新活跃代理的 UI（状态 + 详情） */
  async function refreshActiveAgentUI() {
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = storage.pairedAgents || [];
    const activeId = storage.activeAgentId;

    if (!activeId || agents.length === 0) {
      const hasAgents = agents.length > 0;
      updateStatusUI('disconnected', hasAgents ? '未连接 - 请从列表中选择代理切换' : '未连接 - 请添加代理配对');
      return;
    }

    const active = agents.find(a => a.id === activeId);
    if (active) {
      agentUrlInput.value = active.url;
      await fetchAndShowAgentDetail(active.url, active.token);
    }
  }

  // ========== 原有详情渲染辅助函数 ==========

  function formatBytes(bytes) {
    if (bytes == null || bytes === 0) return '无限制';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return (Math.round(val * 10) / 10) + ' ' + units[i];
  }

  function formatDuration(ms) {
    if (ms == null || ms === 0) return '无限制';
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(0) + 's';
    return (ms / 60000).toFixed(1) + ' min';
  }

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

  function updateStatusUI(status, message, detailData) {
    agentStatus.className = 'agent-status ' + status;
    statusText.textContent = message;

    // 配对表单始终可见，方便随时添加新代理
    pairCodeGroup.style.display = '';

    if (status === 'connected') {
      // 有活跃代理时显示断开按钮
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
      disconnectGroup.style.display = 'none';
      agentStatus.className = 'agent-status checking';
    } else {
      disconnectGroup.style.display = 'none';
      agentInfo.style.display = 'none';
      agentStatus.className = 'agent-status disconnected';
      if (agentDetailToggle) agentDetailToggle.style.display = 'none';
      if (agentDetailPanel) agentDetailPanel.innerHTML = '';
      lastDetailData = null;
    }
  }

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

  // ========== 连接 / 断开 ==========

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
        // 使用自定义名称，留空则自动获取
        const customName = agentNameInput?.value.trim();
        let name = customName || null;
        if (!name) {
          try {
            const statusResp = await fetch(`${url}/api/status`);
            if (statusResp.ok) {
              const statusData = await statusResp.json();
              const parts = [];
              if (statusData.platformName) parts.push(statusData.platformName);
              if (statusData.arch) parts.push(statusData.arch);
              name = parts.length > 0 ? parts.join(' ') : new URL(url).hostname;
            }
          } catch { name = new URL(url).hostname; }
          if (!name) name = '未命名代理';
        }

        // 生成 ID 并加入列表
        const id = `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const newAgent = { id, name, url, token: data.token, pairedAt: new Date().toISOString() };

        const storage = await chrome.storage.local.get('pairedAgents');
        const agents = storage.pairedAgents || [];
        agents.push(newAgent);
        await chrome.storage.local.set({ pairedAgents: agents, activeAgentId: id });

        pairCodeInput.value = '';
        if (agentNameInput) agentNameInput.value = '';
        showToast(`配对成功！已添加: ${name}`, 'success');

        // 展示详情
        try {
          const [statusResp2, detailResp2] = await Promise.all([
            fetch(`${url}/api/status`),
            fetch(`${url}/api/status/detail`, { headers: { 'Authorization': `Bearer ${data.token}` } })
          ]);
          if (statusResp2.ok && detailResp2.ok) {
            const merged = mergeDetail(await statusResp2.json(), await detailResp2.json());
            const labelParts = [`Agent v${merged.version}`];
            if (merged.platformName && merged.arch) labelParts.push(`${merged.platformName} ${merged.arch}`);
            if (merged.nodeVersion) labelParts.push(`Node ${merged.nodeVersion}`);
            updateStatusUI('connected', labelParts.join(' | '), merged);
          }
        } catch { /* ignore */ }

        // 重新渲染列表
        await renderPairedAgents();

        chrome.runtime.sendMessage({
          type: 'AGENT_CONNECTION_CHANGED',
          connected: true,
          agentId: id
        }).catch(() => {});
      } else {
        updateStatusUI('disconnected', '配对失败：' + (data.error || '未知错误'));
        showToast(data.error || '配对失败', 'error');
      }
    } catch (err) {
      updateStatusUI('disconnected', '连接失败 - 请确认代理服务已启动');
      showToast('无法连接到 Agent: ' + err.message, 'error');
    } finally {
      connectBtn.disabled = false;
      connectBtn.textContent = '连接';
    }
  }

  async function disconnectAgent() {
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const activeId = storage.activeAgentId;
    if (!activeId) return;

    const agents = storage.pairedAgents || [];
    const active = agents.find(a => a.id === activeId);
    if (!active) return;

    // 确认弹框：显示代理名称和地址
    const confirmed = await showCustomConfirm(
      `断开后将移出代理列表，需重新配对才能恢复。\n\n代理名称：${active.name}\n代理地址：${active.url}`,
      '断开代理连接'
    );
    if (!confirmed) return;

    const newAgents = agents.filter(a => a.id !== activeId);
    const newActiveId = newAgents.length > 0 ? newAgents[0].id : null;

    await chrome.storage.local.set({
      pairedAgents: newAgents,
      activeAgentId: newActiveId
    });

    pairCodeInput.value = '';
    showToast('已断开当前代理', 'info');

    if (newActiveId) {
      const newActive = newAgents.find(a => a.id === newActiveId);
      if (newActive) {
        agentUrlInput.value = newActive.url;
        await fetchAndShowAgentDetail(newActive.url, newActive.token);
      }
    } else {
      updateStatusUI('disconnected', '未连接 - 请添加代理配对');
    }

    await renderPairedAgents();

    chrome.runtime.sendMessage({
      type: 'AGENT_CONNECTION_CHANGED',
      connected: !!newActiveId,
      agentId: newActiveId
    }).catch(() => {});
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

  pairCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connectToAgent();
  });

  // 启动时：渲染列表 + 展示活跃代理状态
  (async () => {
    await renderPairedAgents();
    await refreshActiveAgentUI();
  })();

  // 通知 background：配置页面已打开，触发全量心跳
  chrome.runtime.sendMessage({ type: 'OPTIONS_PAGE_OPEN' }).catch(() => {});

  // 页面关闭时通知 background 停止全量心跳
  window.addEventListener('beforeunload', () => {
    chrome.runtime.sendMessage({ type: 'OPTIONS_PAGE_CLOSED' }).catch(() => {});
  });
}