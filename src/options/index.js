// options/index.js - 选项页面入口

import { currentModel, setCurrentModel, PRESET_MODELS, loadConfig, saveConfig, addCustomModelToDropdown, removeCustomModel, saveCustomModels, loadCustomModels, updateModelSelection, showStatus, showToast, initStatus, updateConfigDetails } from './config-manager.js';
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
  const validTabs = ['basic', 'toolbar', 'react', 'reflection', 'chat', 'agent'];
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
  
  // 工具预筛选开关控制预筛选最小工具数显示
  const enableToolPreselectCheckbox = document.getElementById('enableToolPreselect');
  const preselectMinToolCountSection = document.getElementById('preselectMinToolCountSection');
  if (enableToolPreselectCheckbox && preselectMinToolCountSection) {
    const togglePreselectSection = () => {
      preselectMinToolCountSection.style.display = enableToolPreselectCheckbox.checked ? '' : 'none';
    };
    enableToolPreselectCheckbox.addEventListener('change', togglePreselectSection);
    // 初始状态（注意：loadConfig 会在 DOMContentLoaded 之后异步执行 set checked）
    // 这里先根据 checkbox 初始状态设置，loadConfig 加载后再触发 change 事件
    togglePreselectSection();
  }
  
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
  
  // 选中内容工具栏开关变更
  const enableSelectionToolbarCheckbox = document.getElementById('enableSelectionToolbar');
  if (enableSelectionToolbarCheckbox) {
    enableSelectionToolbarCheckbox.addEventListener('change', function() {
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
  
  // 子任务反思区域折叠/展开
  const subtaskReflectionSection = document.getElementById('subtaskReflectionSection');
  if (subtaskReflectionSection) {
    subtaskReflectionSection.addEventListener('click', function(e) {
      if (e.target.closest('.reflection-section-toggle') || e.target.closest('.reflection-config-item')) return;
      this.classList.toggle('collapsed');
    });
  }
  
  // 反思总开关控制
  const reflectionEnabled = document.getElementById('reflectionEnabled');
  const reflectionConfig = document.getElementById('reflectionConfig');
  
  function updateReflectionSectionVisibility() {
    if (!reflectionConfig) return;
    
    if (!reflectionEnabled || !reflectionEnabled.checked) {
      reflectionConfig.classList.add('disabled');
    } else {
      reflectionConfig.classList.remove('disabled');
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

  // ==================== Agent 配置 ====================
  initAgentConfig();
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

  if (!agentUrlInput || !connectBtn) return;

  /**
   * 更新连接状态 UI
   */
  function updateStatusUI(status, message, workdir) {
    agentStatus.className = 'agent-status ' + status;
    statusText.textContent = message;
    
    if (status === 'connected') {
      pairCodeGroup.style.display = 'none';
      disconnectGroup.style.display = '';
      agentStatus.className = 'agent-status connected';
      
      if (workdir) {
        agentInfo.style.display = '';
        agentWorkdirEl.textContent = '工作目录: ' + workdir;
      }
    } else if (status === 'checking') {
      agentStatus.className = 'agent-status checking';
    } else {
      pairCodeGroup.style.display = '';
      disconnectGroup.style.display = 'none';
      agentInfo.style.display = 'none';
      agentStatus.className = 'agent-status disconnected';
    }
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
        const data = await response.json();
        if (!storedToken) {
          updateStatusUI('disconnected', 'Agent 在线 - 请填入配对码完成配对');
          return;
        }
        // 获取详细信息（含工作目录）
        try {
          const detailResp = await fetch(`${storedUrl}/api/status/detail`, {
            headers: { 'Authorization': `Bearer ${storedToken}` }
          });
          if (detailResp.ok) {
            const detailData = await detailResp.json();
            updateStatusUI('connected', `已连接 - Agent v${data.version}`, detailData.workdir);
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
      updateStatusUI('disconnected', '无法连接到 Agent - 请确认 Agent 服务已启动');
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
        
        // 获取完整状态
        const statusResp = await fetch(`${url}/api/status/detail`, {
          headers: { 'Authorization': `Bearer ${data.token}` }
        });
        if (statusResp.ok) {
          const statusData = await statusResp.json();
          updateStatusUI('connected', `已连接 - Agent v${statusData.version}`, statusData.workdir);
        }
      } else {
        updateStatusUI('disconnected', '配对失败：' + (data.error || '未知错误'));
        showToast('❌ ' + (data.error || '配对失败'), 'error');
      }
    } catch (err) {
      updateStatusUI('disconnected', '连接失败 - 请确认 Agent 服务已启动');
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
    await chrome.storage.local.remove(['agentUrl', 'agentToken']);
    pairCodeInput.value = '';
    updateStatusUI('disconnected', '已断开连接');
    showToast('已断开 Agent 连接', 'info');
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