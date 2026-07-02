// side_panel/index.js - Side Panel 入口文件

import state from './state.js';
import { BUILTIN_TOOLS, PRESET_MODES } from './constants.js';
import { showToast, loadChatConfig, getApiParams, ensureChatConfigLoaded, getCurrentActiveTabId, getSystemPrompt, escapeHtml } from './utils.js';
import { addToInputHistory } from './input-history.js';
import { initMessageToc } from './message-toc.js';
import { initClarifyEvents } from './clarify-dialog.js';
import { initConfirmEvents } from './confirm-dialog.js';
import { initPrototypeEvents, showPrototypeLibrary } from './ui-prototype.js';
import { renderMermaidCharts, renderMessageMermaid } from './markdown-render.js';
import {
  sendMessage, clearChatHistory, showExportDialog, hideExportDialog, performExport,
  initExportDialogEvents, triggerImportDialog, handleImportFile,
  showModal, hideModal, loadChatHistory, saveChatHistory,
  addMessage, addContextBubble, addLoadingMessage, removeLoadingMessage,
  callApi, clearSelectedContext, triggerSelectionSearch, fillSidePanelInput, directSend,
  restorePendingSessionsFromStorage, restoreMessageFromHtml,
  compressAndAttachImage, openImagePreview, initImagePreviewOverlay
} from './chat-manager.js';
import {
  addPromptManageButton, showPromptSelector, hidePromptSelector,
  togglePromptSelector, updatePromptList, sendPromptByCode,
  insertPromptToInputByCode, updatePromptSelection, initPromptEvents
} from './prompt-manager.js';
import {
  openToolsPopup, closeToolsPopup, renderToolsPopupList,
  getVisibleTools, updateAllCategoryCounts, updateCategoryBadges,
  updateToolsPopupTitle, saveToolsFromPopup, updateToolsToggleState
} from './tool-panel.js';
import { initTokenStatsPanel } from './token-stats-panel.js';

// ==================== 配置监听 ====================

// 监听配置变化，实时更新记忆限制标签
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.chatMaxMemoryMessages) {
    state.chatConfig.maxMemoryMessages = changes.chatMaxMemoryMessages.newValue;
    updateMemoryLimitLabel();
    console.log('[SidePanel] 记忆限制配置已更新:', state.chatConfig.maxMemoryMessages);
  }
});

// ==================== 记忆限制相关 ====================

function updateMemoryLimitLabel() {
  const label = document.getElementById('memoryLimitLabel');
  if (label) {
    if (state.chatConfig.maxMemoryMessages !== null && state.chatConfig.maxMemoryMessages !== undefined && state.chatConfig.maxMemoryMessages > 0) {
      label.textContent = `(${state.chatConfig.maxMemoryMessages})`;
    } else {
      label.textContent = '(全)';
    }
    label.style.display = 'inline';
    label.style.cursor = 'pointer';
    label.title = '点击设置记忆历史限制条数';
  }
}

function toggleMemoryLimitDropdown(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropdown = document.getElementById('memoryLimitDropdown');
  dropdown.classList.toggle('show');

  if (dropdown.classList.contains('show')) {
    const currentValue = state.chatConfig.maxMemoryMessages;
    const options = dropdown.querySelectorAll('.memory-limit-option');
    options.forEach(opt => {
      opt.classList.remove('selected');
      const optValue = parseInt(opt.dataset.value);
      if ((currentValue === null && optValue === 0) ||
          (currentValue !== null && currentValue > 0 && optValue === currentValue)) {
        opt.classList.add('selected');
      }
    });

    const input = dropdown.querySelector('#memoryLimitInput');
    if (currentValue !== null && currentValue > 0) {
      input.value = currentValue;
    } else {
      input.value = '';
    }
  }
}

function initMemoryLimitDropdown() {
  const dropdown = document.getElementById('memoryLimitDropdown');
  const label = document.getElementById('memoryLimitLabel');
  const input = dropdown?.querySelector('#memoryLimitInput');

  if (!dropdown || !label) return;

  // 立即用当前状态刷新标签（避免 loadChatConfig 完成前显示空值）
  updateMemoryLimitLabel();

  label.addEventListener('click', toggleMemoryLimitDropdown);

  const options = dropdown.querySelectorAll('.memory-limit-option');
  options.forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = parseInt(opt.dataset.value);
      const maxMemoryMessages = value === 0 ? null : value;

      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');

      if (input) {
        input.value = value === 0 ? '' : value;
      }

      chrome.storage.local.set({ chatMaxMemoryMessages: maxMemoryMessages }, () => {
        state.chatConfig.maxMemoryMessages = maxMemoryMessages;
        updateMemoryLimitLabel();
        showToast('✅ 配置已更新', 'success');
      });
    });
  });

  if (input) {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('change', (e) => {
      e.stopPropagation();
      const value = e.target.value.trim();
      const maxMemoryMessages = value && parseInt(value) > 0 ? parseInt(value) : null;

      options.forEach(o => o.classList.remove('selected'));

      chrome.storage.local.set({ chatMaxMemoryMessages: maxMemoryMessages }, () => {
        state.chatConfig.maxMemoryMessages = maxMemoryMessages;
        updateMemoryLimitLabel();
        showToast('✅ 配置已更新', 'success');
      });
    });
  }

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== label) {
      dropdown.classList.remove('show');
    }
  });
}

// ==================== 模型选择相关 ====================

function updateModelSelection(selectedValue) {
  document.querySelectorAll('.model-option').forEach(option => {
    if (option.dataset.value === selectedValue) {
      option.classList.add('selected');
      option.querySelector('.model-option-check').textContent = '✓';
    } else {
      option.classList.remove('selected');
      option.querySelector('.model-option-check').textContent = '';
    }
  });
}

function loadCustomModelsToDropdown(customModels, callback) {
  const tempDropdown = document.getElementById('tempDropdown');
  if (!tempDropdown) {
    if (typeof callback === 'function') callback();
    return;
  }

  // 先加载已删除的预设模型列表并移除对应选项
  chrome.storage.local.get(['deletedPresetModels'], (result) => {
    const deletedPresetModels = result.deletedPresetModels || [];
    deletedPresetModels.forEach(modelName => {
      const option = tempDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
      if (option) option.remove();
    });

    if (!customModels || customModels.length === 0) {
      if (typeof callback === 'function') callback();
      return;
    }

    const presetModels = ['deepseek-v4-pro', 'deepseek-v4-flash'];

    customModels.forEach(modelName => {
      if (presetModels.includes(modelName)) return;
      const existingOption = tempDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
      if (existingOption) return;

      const option = document.createElement('div');
      option.className = 'model-option';
      option.dataset.value = modelName;
      option.innerHTML = `<span class="model-option-check"></span>${modelName}`;

      option.addEventListener('click', (e) => {
        e.stopPropagation();
        state.currentModel = modelName;
        updateModelSelection(modelName);
        chrome.storage.local.set({ modelName: modelName });
      });

      tempDropdown.querySelector('.model-section').appendChild(option);
    });

    if (typeof callback === 'function') {
      callback();
    }
  });
}

// ==================== 选中内容上下文 ====================

function setSelectedContext(text, prefix = '📌 已选中') {
  if (!state.enableSelectionQuery) {
    return;
  }
  state.quotedContextText = '';
  state.selectedContextText = text;
  const indicator = document.getElementById('selectionIndicator');
  const selectionText = document.getElementById('selectionText');
  const userInput = document.getElementById('userInput');

  if (indicator && selectionText && userInput) {
    let displayText;
    if (text.length > 100) {
      displayText = text.substring(0, 100) + '...';
    } else if (text.length > 50) {
      displayText = text.substring(0, 50) + '...';
    } else {
      displayText = text;
    }
    selectionText.textContent = `${prefix}: ${displayText}`;
    indicator.classList.add('show');
  }
}

// ==================== 划词问答 - 浮动菜单 ====================

function showFloatingMenu(selection, text, mouseX = 0, mouseY = 0) {
  if (!state.enableSelectionQuery) {
    return;
  }

  const selectionFloatingMenu = document.getElementById('selectionFloatingMenu');
  const selectionMenuItems = document.getElementById('selectionMenuItems');

  if (!selectionFloatingMenu || !selectionMenuItems) {
    return;
  }

  const menuPrompts = state.customPrompts.filter(p => p.enabledInMenu === true);

  if (menuPrompts.length === 0) {
    return;
  }

  selectionMenuItems.innerHTML = '';

  menuPrompts.forEach(prompt => {
    const displayContent = prompt.content.length > 10 ? prompt.content.substring(0, 10) + '...' : prompt.content;
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.innerHTML = `
      <span>${displayContent}</span>
      <span class="menu-item-code">/${prompt.code}</span>
    `;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSelectionPromptClick(prompt, text);
    });
    selectionMenuItems.appendChild(item);
  });

  const sidePanelBody = document.body;
  const bodyRect = sidePanelBody.getBoundingClientRect();

  const estimatedMenuHeight = 40 + menuPrompts.length * 36;
  const estimatedMenuWidth = 180;
  const menuOffset = 30;

  let top = mouseY - bodyRect.top - estimatedMenuHeight - menuOffset;
  let left = mouseX - bodyRect.left - 20;

  if (top < bodyRect.top + 10) {
    top = mouseY - bodyRect.top + menuOffset;
  }

  if (left < bodyRect.left + 10) {
    left = mouseX - bodyRect.left + 20;
  }

  if (left + estimatedMenuWidth > bodyRect.right - 10) {
    left = mouseX - bodyRect.left - estimatedMenuWidth - menuOffset;
    if (left < bodyRect.left + 10) {
      left = mouseX - bodyRect.left + 20;
    }
  }

  if (top + estimatedMenuHeight > bodyRect.bottom - 10) {
    top = mouseY - bodyRect.top - estimatedMenuHeight - menuOffset;
    if (top < bodyRect.top + 10) {
      top = mouseY - bodyRect.top + menuOffset;
    }
  }

  selectionFloatingMenu.style.top = top + 'px';
  selectionFloatingMenu.style.left = left + 'px';
  selectionFloatingMenu.style.maxHeight = (bodyRect.bottom - top - 20) + 'px';
  selectionFloatingMenu.classList.add('show');
}

window.hideFloatingMenu = function() {
  const selectionFloatingMenu = document.getElementById('selectionFloatingMenu');
  if (selectionFloatingMenu) {
    selectionFloatingMenu.classList.remove('show');
  }
  
  state.lastSelectedText = '';
  state.currentSelectionRange = null;
};

// ==================== 划词问答 - 点击处理 ====================

async function handleSelectionPromptClick(prompt, selectedText) {
  if (!state.enableSelectionQuery) {
    return;
  }

  window.hideFloatingMenu();

  if (state.isGenerating) {
    console.log('[SidePanel] 正在生成中，请稍候...');
    return;
  }

  state.selectedContextText = selectedText;

  clearSelectedContext();

  const chatContainer = document.getElementById('chatContainer');
  const welcomeMessage = chatContainer.querySelector('.welcome-message');
  if (welcomeMessage) {
    welcomeMessage.remove();
  }

  addContextBubble('selected', selectedText, false);

  const userMessage = `[选中内容]\n${selectedText}\n\n[用户问题]\n${prompt.content}`;

  addMessage('user', prompt.content);

  state.messageHistory.push({ role: 'user', content: userMessage });

  saveChatHistory();

  addToInputHistory(prompt.content);

  state.isGenerating = true;
  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;

  const loadingId = addLoadingMessage();
  const mySessionId = state.activeSessionId;

  const model = state.currentModel;

  try {
    await ensureChatConfigLoaded();

    console.log('[SidePanel] 发送消息调试信息:');
    console.log('  - isolateChat:', state.isolateChat);
    console.log('  - chatConfig:', state.chatConfig);
    console.log('  - messageHistory.length:', state.messageHistory.length);

    let messages = [
      {
        role: 'system',
        content: getSystemPrompt()
      }
    ];

    if (state.isolateChat) {
      let historyToSend = state.messageHistory;
      if (state.chatConfig.maxMemoryMessages !== null && state.chatConfig.maxMemoryMessages !== undefined && state.chatConfig.maxMemoryMessages > 0) {
        const historyWithoutCurrent = state.messageHistory.slice(0, -1);
        const limitedHistory = historyWithoutCurrent.slice(-state.chatConfig.maxMemoryMessages);
        historyToSend = [...limitedHistory, state.messageHistory[state.messageHistory.length - 1]];
        console.log('[SidePanel] 记忆历史限制生效:', state.chatConfig.maxMemoryMessages, '条（不含当前消息），实际发送:', historyToSend.length, '条');
      } else {
        console.log('[SidePanel] 记忆历史限制未生效:', state.chatConfig.maxMemoryMessages);
      }
      messages = [...messages, ...historyToSend];
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

    const apiParams = await getApiParams();
    let content, executionLog;

    try {
      const result = await callApi(messages, model, state.useTools, apiParams);
      content = result.content;
      executionLog = result.executionLog || [];
    } catch (errorResult) {
      removeLoadingMessage(loadingId);

      content = '❌ 请求失败：' + (errorResult.message || '未知错误');
      executionLog = errorResult.executionLog || [];

      const messageDiv = addMessage('assistant', content, true, executionLog);

      state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog });

      saveChatHistory();

      throw errorResult;
    }

    removeLoadingMessage(loadingId);

    const messageDiv = addMessage('assistant', content, true, executionLog);

    await renderMessageMermaid(messageDiv);

    state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog });

    saveChatHistory();

  } catch (error) {
  } finally {
    state.generatingSessionIds.delete(mySessionId);
    document.dispatchEvent(new CustomEvent('generating-state-changed'));
    sendBtn.disabled = false;
    const userInput = document.getElementById('userInput');
    userInput.focus();
  }
}

// ==================== 主初始化 ====================

/**
 * 更新 Side Panel 头部的 Agent 连接指示器
 */
function updateAgentIndicator(platformInfo) {
  const dot = document.getElementById('headerAgentDot');
  const btn = document.getElementById('headerAgentIndicator');
  if (!dot || !btn) return;

  if (!platformInfo || !platformInfo.connected) {
    dot.className = 'header-agent-dot disconnected';
    btn.title = 'Agent 未连接 - 点击前往设置';
  } else {
    dot.className = 'header-agent-dot connected';
    const parts = ['Agent 已连接'];
    if (platformInfo.platformName) parts.push(platformInfo.platformName);
    if (platformInfo.arch) parts.push(platformInfo.arch);
    btn.title = parts.join(' | ') + ' - 点击前往设置';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // 存储表格数据供工具栏按钮使用
  window.__tableBlocks = [];

  // 获取当前激活的 Tab ID
  await getCurrentActiveTabId();

  // 恢复持久化的 pendingCallApiSessionIds（Side Panel 重开后不丢失后台任务状态）
  await restorePendingSessionsFromStorage();

  // 监听选中文本 AI 搜索消息（来自 background）
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SELECTION_AI_SEARCH' && message.prompt) {
      console.log('[SidePanel] 收到选中文本 AI 搜索:', message.selectedText?.substring(0, 50));
      triggerSelectionSearch(message.prompt, message.selectedText);
      // 清除存储的待处理搜索
      chrome.storage.session.remove('pendingSelectionSearch').catch(() => {});
    }
    if (message.type === 'FILL_SIDEPANEL_INPUT' && message.text) {
      console.log('[SidePanel] 收到追问填充:', message.text?.substring(0, 50));
      fillSidePanelInput(message.text);
      // 清除存储的待填充文本
      chrome.storage.session.remove('pendingFillInput').catch(() => {});
    }
    if (message.type === 'DIRECT_SEND' && message.text) {
      console.log('[SidePanel] 收到直接发送:', message.text?.substring(0, 50));
      directSend(message.text, message.selectedText || '');
      // 清除存储的待发送文本
      chrome.storage.session.remove('pendingDirectSend').catch(() => {});
    }
    if (message.type === 'AGENT_STATUS_CHANGE') {
      console.log('[SidePanel] 收到 Agent 状态变化:', message.connected, message.status);
      // 重新从 storage 读取最新的 agentPlatform
      chrome.storage.local.get('agentPlatform', (result) => {
        state.agentPlatform = result.agentPlatform || { connected: false };
        updateAgentIndicator(state.agentPlatform);
      });
    }
    if (message.type === 'AGENT_CONNECTION_CHANGED') {
      // 直接从选项页通知更新，不依赖 storage 读取
      console.log('[SidePanel] 收到 Agent 连接状态变更:', message.connected);
      state.agentPlatform = { ...state.agentPlatform, connected: message.connected };
      updateAgentIndicator(state.agentPlatform);
    }
  });

  // 检查是否有待处理的选中文本搜索（Side Panel 刚打开时）
  const stored = await chrome.storage.session.get('pendingSelectionSearch');
  if (stored.pendingSelectionSearch && stored.pendingSelectionSearch.selectedText) {
    const { prompt, selectedText } = stored.pendingSelectionSearch;
    console.log('[SidePanel] 有待处理的选中文本搜索:', selectedText?.substring(0, 50));
    // 延迟执行，确保 UI 已完全初始化
    setTimeout(() => {
      triggerSelectionSearch(prompt, selectedText);
    }, 500);
    await chrome.storage.session.remove('pendingSelectionSearch');
  }

  // 检查是否有待填充的追问文本（Side Panel 刚打开时）
  const fillStored = await chrome.storage.session.get('pendingFillInput');
  if (fillStored.pendingFillInput && fillStored.pendingFillInput.text) {
    const { text } = fillStored.pendingFillInput;
    console.log('[SidePanel] 有待填充的追问文本:', text?.substring(0, 50));
    setTimeout(() => {
      fillSidePanelInput(text);
    }, 500);
    await chrome.storage.session.remove('pendingFillInput');
  }
  
  // 检查是否有待直接发送的文本（Side Panel 刚打开时）
  const sendStored = await chrome.storage.session.get('pendingDirectSend');
  if (sendStored.pendingDirectSend && sendStored.pendingDirectSend.text) {
    const { text, selectedText } = sendStored.pendingDirectSend;
    console.log('[SidePanel] 有待直接发送的文本:', text?.substring(0, 50));
    setTimeout(() => {
      directSend(text, selectedText || '');
    }, 500);
    await chrome.storage.session.remove('pendingDirectSend');
  }

  // 监听 Tab 切换事件,更新当前 Tab ID
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log('[SidePanel] Tab 切换, 新 Tab ID:', activeInfo.tabId);
    state.currentTabId = activeInfo.tabId;
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === 'complete' && state.currentTabId === tabId) {
      console.log('[SidePanel] 当前 Tab 页面更新:', changeInfo);
    }
  });

  // 初始化 marked
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
    console.log('[SidePanel] Marked 库已加载');
  }

  // 初始化 mermaid
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });
    console.log('[SidePanel] Mermaid 库已加载');
  }

  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const exportChatBtn = document.getElementById('exportChatBtn');
  const chatContainerEl = document.getElementById('chatContainer');

  // ==================== 温度设置初始化 ====================
  const tempDisplay = document.getElementById('tempDisplay');
  const tempDropdown = document.getElementById('tempDropdown');
  const tempPresetList = document.getElementById('tempPresetList');
  const tempSlider = document.getElementById('tempSlider');
  const tempNumberInput = document.getElementById('tempNumberInput');

  // 调整输入框高度（滚动时不调整）
  function adjustInputHeight() {
    if (!userInput || state.isScrolling) return;
    userInput.style.height = 'auto';
    const scrollH = userInput.scrollHeight;
    // 单行内容时移除 inline height，让 CSS min-height 统一处理，避免中英文 scrollHeight 差异导致抖动
    if (scrollH <= 50) {
      userInput.style.height = '';
    } else {
      userInput.style.height = Math.min(scrollH, 100) + 'px';
    }
  }

  // 加载保存的温度设置
  chrome.storage.local.get(['temperature', 'topP', 'selectedTempIndex'], (result) => {
    if (result.temperature !== undefined) state.temperature = result.temperature;
    if (result.topP !== undefined) state.topP = result.topP;
    if (result.selectedTempIndex !== undefined) state.selectedTempIndex = result.selectedTempIndex;

    updateTempUI();
  });

  // 更新温度UI显示
  function updateTempUI() {
    if (tempSlider) tempSlider.value = state.temperature;
    if (tempNumberInput) tempNumberInput.value = state.temperature.toFixed(2);
    const tempIconValueEl = document.getElementById('tempIconValue');
    if (tempIconValueEl) tempIconValueEl.textContent = state.temperature.toFixed(2);

    renderTempPresets();
  }

  // 渲染温度预设列表
  function renderTempPresets() {
    tempPresetList.innerHTML = PRESET_MODES.map((mode, index) => `
      <div class="temp-preset-item ${index === state.selectedTempIndex ? 'selected' : ''}" data-index="${index}">
        <div class="temp-preset-radio"></div>
        <div class="temp-preset-info">
          <div class="temp-preset-name">${mode.label}</div>
          <div class="temp-preset-desc" title="${mode.tip}">${mode.tip}</div>
        </div>
        <div class="temp-preset-value">${mode.temp.toFixed(2)}</div>
      </div>
    `).join('');

    tempPresetList.querySelectorAll('.temp-preset-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(item.dataset.index);
        selectTempPreset(index);
      });
    });
  }

  // 选择温度档位
  function selectTempPreset(index) {
    const mode = PRESET_MODES[index];
    if (!mode) return;

    state.selectedTempIndex = index;
    state.temperature = mode.temp;

    updateTempUI();

    chrome.storage.local.set({ temperature: state.temperature, topP: state.topP, selectedTempIndex: state.selectedTempIndex });
  }

  // 温度滑块事件
  tempSlider.addEventListener('input', (e) => {
    e.stopPropagation();
    let val = parseFloat(e.target.value);
    if (isNaN(val)) val = 0;
    val = Math.max(0, Math.min(1, val));
    state.temperature = val;
    tempNumberInput.value = val.toFixed(2);
    const tempIconValueEl = document.getElementById('tempIconValue');
    if (tempIconValueEl) tempIconValueEl.textContent = val.toFixed(2);

    let closestIndex = 0;
    let minDiff = Math.abs(PRESET_MODES[0].temp - val);
    for (let i = 1; i < PRESET_MODES.length; i++) {
      const diff = Math.abs(PRESET_MODES[i].temp - val);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    state.selectedTempIndex = closestIndex;
    renderTempPresets();

    chrome.storage.local.set({ temperature: state.temperature, topP: state.topP, selectedTempIndex: state.selectedTempIndex });
  });

  // 温度数字输入事件
  tempNumberInput.addEventListener('change', (e) => {
    e.stopPropagation();
    let val = parseFloat(e.target.value);
    if (isNaN(val)) val = 0;
    val = Math.max(0, Math.min(1, val));
    state.temperature = val;
    tempSlider.value = val;
    tempNumberInput.value = val.toFixed(2);

    let closestIndex = 0;
    let minDiff = Math.abs(PRESET_MODES[0].temp - val);
    for (let i = 1; i < PRESET_MODES.length; i++) {
      const diff = Math.abs(PRESET_MODES[i].temp - val);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    state.selectedTempIndex = closestIndex;
    renderTempPresets();

    chrome.storage.local.set({ temperature: state.temperature, topP: state.topP, selectedTempIndex: state.selectedTempIndex });
  });

  // 温度选择器点击事件
  if (tempDisplay && tempDropdown) {
    tempDisplay.addEventListener('click', (e) => {
      e.stopPropagation();
      tempDropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      const tempSelector = document.querySelector('.temp-selector');
      if (tempSelector && !tempSelector.contains(e.target)) {
        tempDropdown.classList.remove('show');
      }
    });
  }

  // ==================== 划词问答相关 ====================

  chatContainerEl.addEventListener('mousedown', (e) => {
    state.lastMouseX = e.clientX;
    state.lastMouseY = e.clientY;
  });

  chatContainerEl.addEventListener('mouseup', (e) => {
    state.lastMouseX = e.clientX;
    state.lastMouseY = e.clientY;

    if (!state.enableSelectionQuery) {
      return;
    }

    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) {
        const selectedText = selection.toString().trim();
        if (chatContainerEl.contains(selection.anchorNode)) {
          if (selectedText !== state.lastSelectedText) {
            state.lastSelectedText = selectedText;
            state.currentSelectionRange = selection.getRangeAt(0).cloneRange();

            setSelectedContext(selectedText);

            showFloatingMenu(selection, selectedText, state.lastMouseX, state.lastMouseY);
          }
        }
      } else {
        if (!chatContainerEl.contains(selection.anchorNode)) {
          state.lastSelectedText = '';
          state.currentSelectionRange = null;
          window.hideFloatingMenu();
        }
      }
    }, 10);
  });

  // 定时检查页面选中内容（仅在 enableSelectionQuery 开启时生效）
  let pageLastSelectedText = '';
  let selectionCheckInterval = null;

  async function performSelectionCheck() {
    try {
      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs));
      });
      if (tabs && tabs.length > 0) {
        const response = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'getSelectedText' }, (res) => {
            if (chrome.runtime.lastError) {
              console.debug('[SidePanel] content script 未加载或无法通信:', chrome.runtime.lastError.message);
              resolve(null);
            } else {
              resolve(res);
            }
          });
        });

        if (!response) {
          return;
        }

        const selectedText = response?.text || '';

        if (selectedText && selectedText.trim()) {
          if (selectedText !== pageLastSelectedText) {
            pageLastSelectedText = selectedText;
            setSelectedContext(selectedText.trim());
          }
        } else {
          pageLastSelectedText = '';
        }
      }
    } catch (e) {
    }
  }

  function refreshSelectionInterval() {
    if (selectionCheckInterval) {
      clearInterval(selectionCheckInterval);
      selectionCheckInterval = null;
    }
    if (state.enableSelectionQuery) {
      selectionCheckInterval = setInterval(performSelectionCheck, 500);
    }
  }

  // 初始启动
  refreshSelectionInterval();

  // 监听配置变化：enableSelectionQuery 改变时动态启停轮询
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && 'enableSelectionQuery' in changes) {
      state.enableSelectionQuery = changes.enableSelectionQuery.newValue;
      // 同步 checkbox UI
      const checkbox = document.getElementById('enableSelectionQueryBtn');
      if (checkbox) checkbox.checked = state.enableSelectionQuery;
      refreshSelectionInterval();
    }
  });

  // 加载保存的模型选择和自定义模型
  chrome.storage.local.get(['modelName', 'customModels', 'customPrompts', 'systemPrompt', 'inputHistory', 'agentPlatform', 'enableImageInput', 'imageModelName', 'imageApiBase', 'imageApiKey'], (result) => {
    const savedModelName = result.modelName;
    if (savedModelName) {
      state.currentModel = savedModelName;
    }
    state.customPrompts = result.customPrompts || [];
    state.systemPrompt = result.systemPrompt || '';
    state.inputHistory = result.inputHistory || [];
    if (result.agentPlatform) {
      state.agentPlatform = result.agentPlatform;
    }
    updateAgentIndicator(state.agentPlatform);
    // 图片识别配置
    state.enableImageInput = result.enableImageInput || false;
    state.imageModelName = result.imageModelName || '';
    state.imageApiBase = result.imageApiBase || '';
    state.imageApiKey = result.imageApiKey || '';
    updateImagePreviewVisibility();
    addPromptManageButton();

    loadCustomModelsToDropdown(result.customModels, () => {
      if (savedModelName) {
        updateModelSelection(savedModelName);
      }
    });
  });

  // 监听 storage 变化以更新自定义模型列表和模型选中状态
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.customModels) {
        const newCustomModels = changes.customModels.newValue || [];
        const modelSection = tempDropdown.querySelector('.model-section');
        if (modelSection) {
          const existingOptions = modelSection.querySelectorAll('.model-option');
          existingOptions.forEach(opt => {
            const value = opt.dataset.value;
            if (value !== 'deepseek-v4-pro' && value !== 'deepseek-v4-flash') {
              opt.remove();
            }
          });
        }
        loadCustomModelsToDropdown(newCustomModels);
      }
      if (changes.modelName) {
        const newModelName = changes.modelName.newValue;
        if (newModelName) {
          state.currentModel = newModelName;
          updateModelSelection(newModelName);
        }
      }
      if (changes.enableImageInput) {
        state.enableImageInput = changes.enableImageInput.newValue;
        updateImagePreviewVisibility();
      }
      if (changes.imageModelName) {
        state.imageModelName = changes.imageModelName.newValue || '';
      }
      if (changes.imageApiBase) {
        state.imageApiBase = changes.imageApiBase.newValue || '';
      }
      if (changes.imageApiKey) {
        state.imageApiKey = changes.imageApiKey.newValue || '';
      }
      if (changes.deletedPresetModels) {
        const deletedModels = changes.deletedPresetModels.newValue || [];
        // 移除被删除的预设模型选项
        deletedModels.forEach(modelName => {
          const option = tempDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
          if (option) option.remove();
        });
      }
    }
  });

  // 加载保存的对话历史
  loadChatHistory();

  // 监听会话切换事件（由 session-manager-ui.js 触发）
  document.addEventListener('session-switched', () => {
    const chatContainerEl = document.getElementById('chatContainer');
    const sendBtn = document.getElementById('sendBtn');
    const userInput = document.getElementById('userInput');
    if (!chatContainerEl) return;

    // 如果图片已被上一会话消费（预览栏已隐藏），切换会话时清空图片附件
    const previewBar = document.getElementById('imagePreviewBar');
    if (state.attachedImages.length > 0 && previewBar && previewBar.style.display === 'none') {
      state.attachedImages = [];
    }

    // 清理旧会话的 executionLogListener，防止 listener 累积
    if (state.executionLogListener) {
      chrome.runtime.onMessage.removeListener(state.executionLogListener);
      state.executionLogListener = null;
    }

    // 根据目标会话的生成状态决定发送按钮是否禁用
    if (sendBtn) sendBtn.disabled = state.isGenerating;
    if (userInput) userInput.focus();

    chatContainerEl.innerHTML = '';

    if (!state.messageHistory || state.messageHistory.length === 0) {
      const welcomeDiv = document.createElement('div');
      welcomeDiv.className = 'welcome-message';
      welcomeDiv.innerHTML = `
        <div class="icon-wrapper">
          <div class="icon">💬</div>
        </div>
        <h2>开始对话</h2>
        <p>输入您的问题，AI 助手将为您解答</p>
      `;
      chatContainerEl.appendChild(welcomeDiv);
    } else {
      state.messageHistory.forEach(msg => {
        if (msg.htmlContent) {
          restoreMessageFromHtml(msg.htmlContent);
        } else {
          addMessage(msg.role, msg.content, false, msg.executionLog || [], msg.reflectionScore, msg.wasRevised);
        }
      });
      renderMermaidCharts();
    }

    // 如果切回的会话有正在执行的后台任务，显示加载状态
    const hasPendingTask = state.pendingCallApiSessionIds.has(state.activeSessionId) && !!state.pendingCancelApi;
    console.log('[SidePanel] session-switched: pendingTask?', hasPendingTask, 'pendingSessionIds:', [...state.pendingCallApiSessionIds], 'activeSessionId:', state.activeSessionId, 'hasCancelApi:', !!state.pendingCancelApi);
    if (hasPendingTask) {
      console.log('[SidePanel] 切回有后台任务的会话，显示加载状态');
      const loadingId = addLoadingMessage();
      state.substituteLoadingIds.set(state.activeSessionId, loadingId);
    }

    // 恢复该会话的滚动位置
    const scrollKey = 'scrollPosition_' + (state.activeSessionId || 'default');
    chrome.storage.local.get([scrollKey], (result) => {
      if (result[scrollKey] !== undefined) {
        setTimeout(() => {
          const el = document.getElementById('chatContainer');
          if (el) el.scrollTop = result[scrollKey];
        }, 150);
      }
    });
  });

  // 模型选项点击事件（现在在tempDropdown内）
  document.querySelectorAll('.model-option').forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = option.dataset.value;
      state.currentModel = value;
      updateModelSelection(value);
      chrome.storage.local.set({ modelName: value });
    });
  });

  // 点击其他地方关闭下拉框和浮动菜单
  document.addEventListener('click', (e) => {
    const promptDropdown = document.getElementById('promptDropdown');
    const promptSelector = document.getElementById('promptSelector');
    const selectionFloatingMenu = document.getElementById('selectionFloatingMenu');

    if (!promptSelector.contains(e.target)) {
      promptDropdown.classList.remove('show');
      hidePromptSelector();
    }
    
    if (selectionFloatingMenu && !selectionFloatingMenu.contains(e.target)) {
      const selection = window.getSelection();
      const isClickInsideChat = chatContainerEl.contains(e.target);
      const isSelectionInsideChat = selection && !selection.isCollapsed && chatContainerEl.contains(selection.anchorNode);
      
      if (!isClickInsideChat || !isSelectionInsideChat) {
        window.hideFloatingMenu();
      }
    }
  });

  // 发送按钮点击事件
  sendBtn.addEventListener('click', sendMessage);

  // 提示词触发按钮点击事件 - 切换显示/隐藏提示词选择器
  const promptTriggerBtn = document.getElementById('promptTriggerBtn');
  if (promptTriggerBtn) {
    promptTriggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      promptTriggerBtn.blur();
      togglePromptSelector();
    });
  }

  // 快捷键查看按钮
  const shortcutsBtn = document.getElementById('shortcutsBtn');
  const shortcutsModal = document.getElementById('shortcutsModal');
  const shortcutsCloseBtn = document.getElementById('shortcutsCloseBtn');

  function showShortcuts() {
    if (shortcutsModal) shortcutsModal.style.display = 'flex';
  }

  function hideShortcuts() {
    if (shortcutsModal) shortcutsModal.style.display = 'none';
  }

  if (shortcutsBtn) {
    shortcutsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showShortcuts();
      // 关闭更多操作下拉
      const dropdown = document.getElementById('headerMoreDropdown');
      if (dropdown) dropdown.classList.remove('show');
    });
  }

  if (shortcutsCloseBtn) {
    shortcutsCloseBtn.addEventListener('click', hideShortcuts);
  }

  if (shortcutsModal) {
    shortcutsModal.addEventListener('click', (e) => {
      if (e.target === shortcutsModal) hideShortcuts();
    });
  }

  // 全局键盘快捷键
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
      e.preventDefault();
      const toolsPopup = document.getElementById('toolsPopup');
      if (toolsPopup && toolsPopup.style.display !== 'none') {
        closeToolsPopup();
      } else {
        openToolsPopup();
      }
    }

    // Esc 关闭快捷键面板
    if (e.key === 'Escape' && shortcutsModal && shortcutsModal.style.display !== 'none') {
      hideShortcuts();
      return;
    }

    // Alt+/ ：打开快捷键面板
    if (e.altKey && e.code === 'Slash') {
      e.preventDefault();
      showShortcuts();
      return;
    }

    // Alt+S ：全页面截图
    if (e.altKey && !e.shiftKey && e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      captureFullPageScreenshot();
      return;
    }

    // Alt+Shift+S ：区域截图
    if (e.altKey && e.shiftKey && e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      captureRegionScreenshot();
      return;
    }

    // Alt+ArrowUp/ArrowDown 系列快捷键：在对话消息之间快速跳转
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const chatContainer = document.getElementById('chatContainer');
      if (!chatContainer) return;

      const messages = chatContainer.querySelectorAll('.message.user, .message.assistant, .user-context-bubble');

      // Alt+Shift+ArrowUp/ArrowDown：快速回到顶部/底部
      if (e.shiftKey) {
        e.preventDefault();
        if (e.key === 'ArrowUp' && messages.length > 0) {
          messages[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (e.key === 'ArrowDown' && messages.length > 0) {
          messages[messages.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      if (messages.length === 0) return;

      const containerRect = chatContainer.getBoundingClientRect();
      const viewportTop = containerRect.top;
      const threshold = 10; // 小阈值避免重复定位到同一条消息

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        // 找到当前视口中第一条可见消息，然后跳转到它前面的那条
        let currentIndex = -1;
        for (let i = 0; i < messages.length; i++) {
          const rect = messages[i].getBoundingClientRect();
          if (rect.bottom > viewportTop + threshold) {
            currentIndex = i;
            break;
          }
        }
        // 如果所有消息都在视口上方，则从最后一条开始
        if (currentIndex === -1) {
          currentIndex = messages.length;
        }
        // 跳到前一条
        const targetIndex = currentIndex - 1;
        if (targetIndex >= 0) {
          messages[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        // 找到当前视口中第一条消息，然后跳转到它后面的那条
        let currentIndex = -1;
        for (let i = 0; i < messages.length; i++) {
          const rect = messages[i].getBoundingClientRect();
          if (rect.bottom > viewportTop + threshold) {
            currentIndex = i;
            break;
          }
        }
        if (currentIndex === -1) return;
        // 跳到下一条
        const targetIndex = currentIndex + 1;
        if (targetIndex < messages.length) {
          messages[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
  });

  // 输入框回车发送（Shift+Enter 换行）
  userInput.addEventListener('keydown', (e) => {
    const promptSelector = document.getElementById('promptSelector');
    const promptDropdown = document.getElementById('promptDropdown');

    if (promptSelector.style.display !== 'none' && promptDropdown.classList.contains('show')) {
      const promptItems = promptDropdown.querySelectorAll('.prompt-item');
      const visibleCount = promptItems.length;

      if (visibleCount === 0) {
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (state.selectedPromptIndex < 0) {
          state.selectedPromptIndex = 0;
        } else {
          state.selectedPromptIndex = (state.selectedPromptIndex + 1) % visibleCount;
        }
        updatePromptSelection(promptItems);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (state.selectedPromptIndex < 0) {
          state.selectedPromptIndex = visibleCount - 1;
        } else if (state.selectedPromptIndex === 0) {
          state.selectedPromptIndex = visibleCount - 1;
        } else {
          state.selectedPromptIndex = state.selectedPromptIndex - 1;
        }
        updatePromptSelection(promptItems);
        return;
      }

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && state.selectedPromptIndex >= 0) {
        e.preventDefault();
        const selectedCode = promptItems[state.selectedPromptIndex].dataset.code;
        insertPromptToInputByCode(selectedCode);
        return;
      }

      if (e.key === 'Enter' && state.selectedPromptIndex >= 0) {
        e.preventDefault();
        const selectedCode = promptItems[state.selectedPromptIndex].dataset.code;
        sendPromptByCode(selectedCode);
        return;
      }

      if (e.key === 'Escape') {
        hidePromptSelector();
        return;
      }
    }

    if (e.key === 'Escape') {
      if (state.inputHistoryIndex >= 0) {
        state.inputHistoryIndex = -1;
      }
      if (userInput.value) {
        userInput.value = '';
        userInput.style.height = 'auto';
        userInput.dispatchEvent(new Event('input'));
      }
      e.preventDefault();
      return;
    }

    const isPromptSelectorVisible = promptSelector.style.display !== 'none' && promptDropdown.classList.contains('show');
    if (!isPromptSelectorVisible && !state.isGenerating) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (state.inputHistoryIndex === -1) {
          state.inputHistoryIndex = state.inputHistory.length - 1;
        } else if (state.inputHistoryIndex > 0) {
          state.inputHistoryIndex--;
        }
        if (state.inputHistoryIndex < 0) {
          state.inputHistoryIndex = 0;
        }
        if (state.inputHistoryIndex >= 0 && state.inputHistory.length > 0) {
          userInput.value = state.inputHistory[state.inputHistoryIndex];
          userInput.dispatchEvent(new Event('input'));
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (state.inputHistoryIndex >= 0 && state.inputHistoryIndex < state.inputHistory.length - 1) {
          state.inputHistoryIndex++;
          userInput.value = state.inputHistory[state.inputHistoryIndex];
          userInput.dispatchEvent(new Event('input'));
        } else {
          state.inputHistoryIndex = -1;
          userInput.value = '';
          userInput.dispatchEvent(new Event('input'));
        }
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 粘贴图片处理
  userInput.addEventListener('paste', (e) => {
    if (!state.enableImageInput) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          compressAndAttachImage(blob);
        }
        break;
      }
    }
  });

  // 截图按钮
  const screenshotBtn = document.getElementById('screenshotBtn');
  if (screenshotBtn) {
    screenshotBtn.addEventListener('click', async (e) => {
      if (!state.enableImageInput) return;

      // Ctrl/Shift/Meta + 点击 → 区域截图
      const isRegionMode = e.ctrlKey || e.shiftKey || e.metaKey;

      try {
        if (isRegionMode) {
          await captureRegionScreenshot();
        } else {
          await captureFullPageScreenshot();
        }
      } catch (err) {
        console.error('[SidePanel] 截图失败:', err);
        showToast('截图失败，请重试');
      }
    });
  }

  // 初始化图片预览弹窗事件
  initImagePreviewOverlay();

  // 控制输入框滚轮事件：锁定高度防止跳动
  userInput.addEventListener('wheel', (e) => {
    state.isScrolling = true;

    const currentHeight = userInput.style.height || userInput.offsetHeight + 'px';
    userInput.style.height = currentHeight;

    if (userInput.scrollHeight <= userInput.clientHeight + 10) {
      e.preventDefault();
      e.stopPropagation();
    }

    setTimeout(() => {
      state.isScrolling = false;
    }, 100);
  }, { passive: false });

  // 输入框输入事件 - 检查是否需要显示提示词选择器
  userInput.addEventListener('input', (e) => {
    const value = userInput.value;
    const promptSelector = document.getElementById('promptSelector');
    const promptDropdown = document.getElementById('promptDropdown');

    const lastSlashIndex = value.lastIndexOf('/');

    if (lastSlashIndex !== -1) {
      const filterText = value.substring(lastSlashIndex + 1);

      if (lastSlashIndex === 0 || value[lastSlashIndex - 1] === '\n' || value[lastSlashIndex - 1] === ' ') {
        showPromptSelector(filterText);
      } else {
        updatePromptList(filterText);
      }
    } else {
      hidePromptSelector();
    }

    adjustInputHeight();
  });

  chatContainerEl.addEventListener('scroll', () => {
    const key = 'scrollPosition_' + (state.activeSessionId || 'default');
    chrome.storage.local.set({ [key]: chatContainerEl.scrollTop });
  });

  // 更多操作下拉菜单
  const headerMoreBtn = document.getElementById('headerMoreBtn');
  const headerMoreDropdown = document.getElementById('headerMoreDropdown');
  if (headerMoreBtn && headerMoreDropdown) {
    headerMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      headerMoreDropdown.classList.toggle('show');
    });
    // 点击外部关闭下拉菜单
    document.addEventListener('click', (e) => {
      if (!headerMoreDropdown.contains(e.target) && e.target !== headerMoreBtn) {
        headerMoreDropdown.classList.remove('show');
      }
    });
  }

  // 清除对话历史按钮
  clearChatBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    headerMoreDropdown.classList.remove('show');
    showModal();
  });

  // 导出对话历史按钮
  if (exportChatBtn) {
    exportChatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      headerMoreDropdown.classList.remove('show');
      showExportDialog();
    });
  }

  // 导入对话按钮
  const importChatBtn = document.getElementById('importChatBtn');
  if (importChatBtn) {
    importChatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      headerMoreDropdown.classList.remove('show');
      triggerImportDialog();
    });
  }

  // 导入文件选择器 change 事件
  const importSessionsFile = document.getElementById('importSessionsFile');
  if (importSessionsFile) {
    importSessionsFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleImportFile(file);
      }
    });
  }

  // 设置按钮
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // Agent 状态指示器 - 点击跳转到设置页的 Agent 标签
  const agentIndicator = document.getElementById('headerAgentIndicator');
  if (agentIndicator) {
    agentIndicator.addEventListener('click', async () => {
      const url = chrome.runtime.getURL('options.html#agent');
      const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('options.html') });
      if (tabs.length > 0) {
        await chrome.tabs.update(tabs[0].id, { active: true, url });
      } else {
        await chrome.tabs.create({ url });
      }
    });
  }
  
  // 原型库按钮
  const prototypeLibraryBtn = document.getElementById('prototypeLibraryBtn');
  if (prototypeLibraryBtn) {
    prototypeLibraryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      headerMoreDropdown.classList.remove('show');
      showPrototypeLibrary();
    });
  }

  // Token 统计按钮（header 下拉菜单）
  const tokenStatsHeaderBtn = document.getElementById('tokenStatsHeaderBtn');
  if (tokenStatsHeaderBtn) {
    tokenStatsHeaderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      headerMoreDropdown.classList.remove('show');
      if (window.openTokenStats) window.openTokenStats();
    });
  }

  // 初始化 Token 统计面板
  initTokenStatsPanel(() => state.activeSessionId, showCustomConfirm);

  // 隔离对话开关（记忆对话）
  const isolateChatBtn = document.getElementById('isolateChatBtn');
  const enableToolsBtn = document.getElementById('enableToolsBtn');
  const toolsConfigBtn = document.getElementById('toolsConfigBtn');

  // 加载保存的状态
  chrome.storage.local.get(['isolateChat', 'enableSelectionQuery', 'enableTools', 'enabledTools'], (result) => {
    if (result.isolateChat !== undefined) {
      state.isolateChat = result.isolateChat;
    }
    isolateChatBtn.checked = state.isolateChat;

    if (result.enableSelectionQuery !== undefined) {
      state.enableSelectionQuery = result.enableSelectionQuery;
    }
    const enableSelectionQueryBtn = document.getElementById('enableSelectionQueryBtn');
    if (enableSelectionQueryBtn) {
      enableSelectionQueryBtn.checked = state.enableSelectionQuery;
    }

    if (result.enableTools !== undefined) {
      state.useTools = result.enableTools;
    }

    if (result.enabledTools && result.enabledTools.length > 0) {
      // 合并：过滤掉 BUILTIN_TOOLS 中不存在的 ID，添加默认启用的新工具
      const validToolIds = new Set(BUILTIN_TOOLS.map(t => t.id));
      const savedTools = result.enabledTools.filter(id => validToolIds.has(id));
      // 添加新工具（BUILTIN_TOOLS 中有但 savedTools 中没有的，默认启用）
      const newTools = BUILTIN_TOOLS.filter(t => t.enabled && !savedTools.includes(t.id)).map(t => t.id);
      state.enabledTools = [...savedTools, ...newTools];
      if (newTools.length > 0) {
        // 有新增工具，自动保存合并后的列表
        chrome.storage.local.set({ enabledTools: state.enabledTools });
      }
    } else {
      state.enabledTools = BUILTIN_TOOLS.filter(t => t.enabled).map(t => t.id);
    }

    if (state.enabledTools.length === 0) {
      state.useTools = false;
    }

    if (enableToolsBtn) {
      enableToolsBtn.checked = state.useTools;
    }

    refreshSelectionInterval();
  });

  isolateChatBtn.addEventListener('change', () => {
    state.isolateChat = isolateChatBtn.checked;
    chrome.storage.local.set({ isolateChat: state.isolateChat });
    console.log('[SidePanel] 记忆对话:', state.isolateChat ? '已启用' : '已禁用');
  });

  // 划词问答开关
  const enableSelectionQueryBtn = document.getElementById('enableSelectionQueryBtn');
  if (enableSelectionQueryBtn) {
    enableSelectionQueryBtn.addEventListener('change', () => {
      state.enableSelectionQuery = enableSelectionQueryBtn.checked;
      chrome.storage.local.set({ enableSelectionQuery: state.enableSelectionQuery });
      console.log('[SidePanel] 划词问答:', state.enableSelectionQuery ? '已启用' : '已禁用');

      if (!state.enableSelectionQuery && state.selectedContextText) {
        clearSelectedContext();
      }
    });
  }

  // 工具总开关 - 勾选/取消勾选时直接启用/禁用所有工具
  if (enableToolsBtn) {
    enableToolsBtn.addEventListener('change', () => {
      state.useTools = enableToolsBtn.checked;
      chrome.storage.local.set({ enableTools: state.useTools });

      if (state.useTools && state.enabledTools.length === 0) {
        state.enabledTools = BUILTIN_TOOLS.filter(t => t.enabled).map(t => t.id);
        chrome.storage.local.set({ enabledTools: state.enabledTools });
      }

      console.log('[SidePanel] 工具总开关:', state.useTools ? '已启用' : '已禁用');
    });
  }

  // 工具配置按钮 - 点击打开工具配置弹窗
  if (toolsConfigBtn) {
    toolsConfigBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openToolsPopup();
    });
  }

  // 工具弹窗相关元素
  const toolsPopupOverlay = document.getElementById('toolsPopupOverlay');
  const toolsPopupClose = document.getElementById('toolsPopupClose');
  const toolsPopupContainer = toolsPopupOverlay ? toolsPopupOverlay.querySelector('.modal-container') : null;

  if (toolsPopupClose) {
    toolsPopupClose.addEventListener('click', closeToolsPopup);
  }

  if (toolsPopupContainer) {
    toolsPopupContainer.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // 工具搜索功能
  const toolsSearchInput = document.getElementById('toolsSearchInput');

  if (toolsSearchInput) {
    toolsSearchInput.addEventListener('input', (e) => {
      state.currentSearch = e.target.value.toLowerCase();
      renderToolsPopupList();
    });
  }

  // 分类按钮点击事件
  const categoryBtns = document.querySelectorAll('.category-btn');
  categoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      categoryBtns.forEach(b => {
        b.classList.remove('active');
        if (b.classList.contains('category-all')) {
          b.style.background = '#f5f3ff';
          b.style.color = '#667eea';
          b.style.borderColor = '#d4cfff';
        } else {
          b.style.background = 'white';
          b.style.color = '#555';
          b.style.borderColor = '#ececec';
        }
      });
      btn.classList.add('active');
      btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      btn.style.color = 'white';
      btn.style.borderColor = 'transparent';
      state.currentCategory = btn.dataset.category;
      renderToolsPopupList();
    });
  });

  // 标签区域滚轮滚动支持
  const toolsCategories = document.getElementById('toolsCategories');
  if (toolsCategories) {
    toolsCategories.addEventListener('wheel', (e) => {
      e.preventDefault();
      toolsCategories.scrollLeft += e.deltaY * 2;
    }, { passive: false });
  }

  // 工具弹窗全选/取消全选（只作用于当前可见的工具）
  const toolsSelectAllBtn = document.getElementById('toolsSelectAll');
  const toolsSelectNoneBtn = document.getElementById('toolsSelectNone');

  if (toolsSelectAllBtn) {
    toolsSelectAllBtn.addEventListener('click', () => {
      const visibleTools = getVisibleTools();
      visibleTools.forEach(tool => {
        const checkbox = document.getElementById('tool_' + tool.id);
        if (checkbox) checkbox.checked = true;
        if (!state.enabledTools.includes(tool.id)) {
          state.enabledTools.push(tool.id);
        }
      });
      updateAllCategoryCounts();
      updateCategoryBadges();
      updateToolsPopupTitle();
    });
  }

  if (toolsSelectNoneBtn) {
    toolsSelectNoneBtn.addEventListener('click', () => {
      const visibleTools = getVisibleTools();
      visibleTools.forEach(tool => {
        const checkbox = document.getElementById('tool_' + tool.id);
        if (checkbox) checkbox.checked = false;
        const index = state.enabledTools.indexOf(tool.id);
        if (index > -1) {
          state.enabledTools.splice(index, 1);
        }
      });
      updateAllCategoryCounts();
      updateCategoryBadges();
      updateToolsPopupTitle();
    });
  }

  // 工具弹窗保存按钮（保存但不关闭窗口）
  const toolsPopupSave = document.getElementById('toolsPopupSave');
  if (toolsPopupSave) {
    toolsPopupSave.addEventListener('click', () => {
      saveToolsFromPopup();
      updateToolsPopupTitle();
    });
  }

  // 工具预筛选开关变化时自动保存
  const toolsPreselectToggle = document.getElementById('toolsPreselectToggle');
  if (toolsPreselectToggle) {
    toolsPreselectToggle.addEventListener('change', () => {
      chrome.storage.local.set({ enableToolPreselect: toolsPreselectToggle.checked }, () => {
        console.log('[SidePanel] 工具预筛选开关已更新:', toolsPreselectToggle.checked);
      });
    });
  }

  // 工具弹窗取消按钮
  const toolsPopupCancel = document.getElementById('toolsPopupCancel');
  if (toolsPopupCancel) {
    toolsPopupCancel.addEventListener('click', () => {
      closeToolsPopup();
    });
  }

  // 模态框按钮事件
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalConfirmBtn = document.getElementById('modalConfirmBtn');

  // ==================== 自定义确认弹窗 ====================

  /**
   * 显示自定义确认弹窗，返回 Promise<boolean>
   * @param {string} message - 提示信息
   * @param {string} title - 标题（可选）
   */
  function showCustomConfirm(message, title = '确认操作') {
    return new Promise((resolve) => {
      const overlay = document.getElementById('customConfirmOverlay');
      const titleEl = document.getElementById('customConfirmTitle');
      const messageEl = document.getElementById('customConfirmMessage');
      const cancelBtn = document.getElementById('customConfirmCancelBtn');
      const okBtn = document.getElementById('customConfirmOkBtn');

      if (!overlay || !titleEl || !messageEl || !cancelBtn || !okBtn) {
        resolve(confirm(message)); // fallback
        return;
      }

      const cleanup = () => {
        overlay.style.display = 'none';
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onOverlayClick);
      };

      const onOk = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };
      const onOverlayClick = (e) => { if (e.target === overlay) { cleanup(); resolve(false); } };

      titleEl.textContent = title;
      messageEl.textContent = message;
      overlay.style.display = 'flex';

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onOverlayClick);
    });
  }

  // ==================== 工具使用统计子弹窗 ====================

  const toolStatsOverlay = document.getElementById('toolStatsOverlay');
  const toolStatsClose = document.getElementById('toolStatsClose');
  const toolStatsBtn = document.getElementById('toolStatsBtn');

  function openToolStats() {
    if (toolStatsOverlay) {
      toolStatsOverlay.style.display = 'flex';
      loadToolStats();
    }
  }

  function closeToolStats() {
    if (toolStatsOverlay) toolStatsOverlay.style.display = 'none';
  }

  if (toolStatsBtn) {
    toolStatsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openToolStats();
    });
  }

  if (toolStatsClose) {
    toolStatsClose.addEventListener('click', closeToolStats);
  }

  if (toolStatsOverlay) {
    toolStatsOverlay.addEventListener('click', (e) => {
      if (e.target === toolStatsOverlay) closeToolStats();
    });
  }

  const toolStatsRefreshBtn = document.getElementById('toolStatsRefreshBtn');
  if (toolStatsRefreshBtn) {
    toolStatsRefreshBtn.addEventListener('click', loadToolStats);
  }

  const toolStatsClearBtn = document.getElementById('toolStatsClearBtn');
  if (toolStatsClearBtn) {
    toolStatsClearBtn.addEventListener('click', async () => {
      const confirmed = await showCustomConfirm('确定要清空所有工具使用统计吗？此操作不可撤销。', '清空统计');
      if (!confirmed) return;
      await chrome.storage.local.remove(['toolUsageStats']);
      loadToolStats();
    });
  }

  // 工具统计排序状态 { column, asc }
  let toolStatsSort = { column: 'callCount', asc: false };

  async function loadToolStats() {
    const table = document.getElementById('toolStatsTable');
    const tbody = document.getElementById('toolStatsTableBody');
    const loading = document.getElementById('toolStatsLoading');
    const empty = document.getElementById('toolStatsEmpty');
    const summary = document.getElementById('toolStatsSummary');
    const unusedSection = document.getElementById('toolStatsUnusedSection');
    const unusedList = document.getElementById('toolStatsUnusedList');

    if (!table || !tbody || !loading || !empty) return;

    table.style.display = 'none';
    empty.style.display = 'none';
    if (unusedSection) unusedSection.style.display = 'none';
    if (summary) summary.textContent = '';
    loading.style.display = '';

    try {
      const result = await chrome.storage.local.get(['toolUsageStats']);
      const toolStats = result.toolUsageStats || {};
      const entries = Object.entries(toolStats);

      if (entries.length === 0) {
        loading.style.display = 'none';
        empty.style.display = '';
        return;
      }

      // 构建工具 ID → 描述映射
      const toolDescMap = {};
      BUILTIN_TOOLS.forEach(t => {
        toolDescMap[t.id] = t.name ? `${t.name}：${t.description || ''}` : (t.description || t.id);
      });

      renderToolStatsTable(entries, toolDescMap);

      // 计算未使用工具
      const allToolIds = BUILTIN_TOOLS.map(t => t.id);
      const usedToolIds = new Set(entries.map(([name]) => name));
      const unusedToolIds = allToolIds.filter(id => !usedToolIds.has(id));

      const usedCount = entries.length;
      const unusedCount = unusedToolIds.length;

      // 汇总信息
      if (summary) {
        summary.textContent = `已使用 ${usedCount} 个，未使用 ${unusedCount} 个`;
      }

      // 未使用工具列表（按字母排序）
      if (unusedSection && unusedList && unusedCount > 0) {
        unusedList.innerHTML = unusedToolIds.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map(id => {
          const desc = toolDescMap[id] || id;
          return `<code title="${escapeHtml(desc)}" style="padding: 3px 10px; background: #f5f5f5; color: #aaa; border: 1px solid #eee; border-radius: 4px; font-size: 11px;">${id}</code>`;
        }).join('');
        unusedSection.style.display = '';
      }

      loading.style.display = 'none';
      table.style.display = '';
    } catch (err) {
      console.error('[SidePanel] 加载统计失败:', err);
      loading.style.display = 'none';
      empty.textContent = '加载失败';
      empty.style.display = '';
    }
  }

  function renderToolStatsTable(entries, toolDescMap) {
    const tbody = document.getElementById('toolStatsTableBody');
    if (!tbody) return;

    const { column, asc } = toolStatsSort;

    const sortedEntries = [...entries].sort((a, b) => {
      const [nameA, statA] = a;
      const [nameB, statB] = b;
      const successRateA = statA.callCount > 0 ? (statA.successCount / statA.callCount * 100) : 0;
      const successRateB = statB.callCount > 0 ? (statB.successCount / statB.callCount * 100) : 0;
      const durationA = statA.callCount > 0 ? (statA.totalDuration / statA.callCount) : 0;
      const durationB = statB.callCount > 0 ? (statB.totalDuration / statB.callCount) : 0;

      let cmp = 0;
      switch (column) {
        case 'name': cmp = nameA.toLowerCase().localeCompare(nameB.toLowerCase()); break;
        case 'callCount': cmp = statA.callCount - statB.callCount; break;
        case 'successCount': cmp = statA.successCount - statB.successCount; break;
        case 'successRate': cmp = successRateA - successRateB; break;
        case 'duration': cmp = durationA - durationB; break;
      }
      return asc ? cmp : -cmp;
    });

    tbody.innerHTML = sortedEntries.map(([name, stat]) => {
      const successRate = stat.callCount > 0 ? (stat.successCount / stat.callCount * 100) : 0;
      const avgDuration = stat.callCount > 0 ? (stat.totalDuration / stat.callCount) : 0;
      const tooltip = toolDescMap[name] || name;

      let rateColor = '#38a169';
      if (successRate < 60) rateColor = '#e53e3e';
      else if (successRate < 85) rateColor = '#d69e2e';

      const avgTimeStr = avgDuration < 1000
        ? `${Math.round(avgDuration)}ms`
        : `${(avgDuration / 1000).toFixed(1)}s`;

      return `<tr>
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee; color: #333;"><code title="${escapeHtml(tooltip)}">${name}</code></td>
        <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #eee; color: #666;">${stat.callCount}</td>
        <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #eee; color: #666;">${stat.successCount}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">
          <span style="display: inline-block; width: 50px; height: 5px; border-radius: 3px; background: #e0e0e0; vertical-align: middle; margin-right: 6px;">
            <span style="display: inline-block; width: ${successRate * 0.5}px; height: 5px; border-radius: 3px; background: ${rateColor}; vertical-align: top;"></span>
          </span>
          <span style="font-size: 12px; color: ${rateColor}; font-weight: 500;">${successRate.toFixed(0)}%</span>
        </td>
        <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #eee; color: #888; font-size: 12px;">${avgTimeStr}</td>
      </tr>`;
    }).join('');

    updateSortIndicators();
  }

  function updateSortIndicators() {
    const { column, asc } = toolStatsSort;
    const sortKeys = ['name', 'callCount', 'successCount', 'successRate', 'duration'];
    const idMap = { name: 'sortByName', callCount: 'sortByCallCount', successCount: 'sortBySuccessCount', successRate: 'sortBySuccessRate', duration: 'sortByDuration' };

    sortKeys.forEach(key => {
      const th = document.getElementById(idMap[key]);
      if (!th) return;
      const indicator = th.querySelector('.sort-indicator');
      if (!indicator) return;
      if (key === column) {
        indicator.textContent = asc ? '▲' : '▼';
        indicator.style.color = '#667eea';
      } else {
        indicator.textContent = '';
        indicator.style.color = '';
      }
    });
  }

  // 排序表头点击事件
  document.querySelectorAll('#toolStatsTable th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const sortKey = th.dataset.sort;
      if (toolStatsSort.column === sortKey) {
        toolStatsSort.asc = !toolStatsSort.asc;
      } else {
        toolStatsSort.column = sortKey;
        toolStatsSort.asc = false;
      }
      // 重新渲染（需要从 storage 重新读取数据）
      loadToolStats();
    });
  });

  modalCancelBtn.addEventListener('click', () => {
    hideModal();
  });

  modalConfirmBtn.addEventListener('click', () => {
    hideModal();
    clearChatHistory();
  });

  // 点击模态框外部关闭
  const confirmModal = document.getElementById('confirmModal');
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      hideModal();
    }
  });

  // 关闭选中内容提示条
  const selectionCloseBtn = document.getElementById('selectionClose');
  if (selectionCloseBtn) {
    selectionCloseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[SidePanel] 用户点击关闭选中内容按钮');
      clearSelectedContext();
      window.hideFloatingMenu();
      state.lastSelectedText = '';
      state.currentSelectionRange = null;
    });
  }

  // 输入框输入时清除选中上下文
  userInput.addEventListener('input', () => {
  });
});

// ==================== 模块初始化 ====================

// 页面加载时获取配置，加载后刷新记忆限制标签
loadChatConfig().then(() => updateMemoryLimitLabel());

// 初始化记忆限制标签点击事件
document.addEventListener('DOMContentLoaded', () => {
  initMemoryLimitDropdown();
});

document.addEventListener('DOMContentLoaded', initMessageToc);
document.addEventListener('DOMContentLoaded', initPromptEvents);
document.addEventListener('DOMContentLoaded', initClarifyEvents);
document.addEventListener('DOMContentLoaded', initConfirmEvents);
document.addEventListener('DOMContentLoaded', initPrototypeEvents);
document.addEventListener('DOMContentLoaded', initExportDialogEvents);

// ==================== 图片辅助函数 ====================

/**
 * 更新图片预览区可见性
 */
function updateImagePreviewVisibility() {
  const previewBar = document.getElementById('imagePreviewBar');
  const screenshotBtn = document.getElementById('screenshotBtn');
  // 预览区仅在有图片时显示
  if (previewBar) {
    previewBar.style.display = state.attachedImages.length > 0 ? '' : 'none';
  }
  if (screenshotBtn) {
    if (state.enableImageInput) {
      screenshotBtn.style.removeProperty('display');
    } else {
      screenshotBtn.style.display = 'none';
    }
  }
  // 根据截图按钮是否可见，调整 textarea 右侧内边距，防止文字与按钮重叠
  if (userInput) {
    if (state.enableImageInput) {
      userInput.style.paddingRight = '84px';
    } else {
      userInput.style.paddingRight = '';
    }
  }
  // 如果关闭了图片功能，清空已附加的图片
  if (!state.enableImageInput) {
    state.attachedImages = [];
  }
  renderImagePreviews();
}

/**
 * 渲染图片预览缩略图
 */
function renderImagePreviews() {
  const previewBar = document.getElementById('imagePreviewBar');
  if (!previewBar) return;

  previewBar.innerHTML = '';

  if (state.attachedImages.length === 0) {
    previewBar.style.display = 'none';
    return;
  }
  previewBar.style.display = '';

  state.attachedImages.forEach((img, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'image-preview-item';

    const thumb = document.createElement('img');
    thumb.src = img.dataUrl;
    thumb.className = 'image-preview-thumb';
    thumb.title = '点击查看大图';
    thumb.style.cursor = 'zoom-in';
    thumb.addEventListener('click', () => {
      openImagePreview(img.dataUrl, thumb);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'image-preview-remove';
    removeBtn.innerHTML = '×';
    removeBtn.title = '移除图片';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.attachedImages.splice(index, 1);
      renderImagePreviews();
    });

    wrapper.appendChild(thumb);
    wrapper.appendChild(removeBtn);
    previewBar.appendChild(wrapper);
  });
}

/**
 * 全页面截图：截取整个可见标签页
 */
async function captureFullPageScreenshot() {
  if (!state.enableImageInput) {
    showToast('请先开启图片输入功能');
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' });
    if (response?.dataUrl) {
      const res = await fetch(response.dataUrl);
      const blob = await res.blob();
      compressAndAttachImage(blob);
      showToast('截图成功');
    }
  } catch (err) {
    console.error('[SidePanel] 全页面截图失败:', err);
    showToast('截图失败，请重试');
  }
}

/**
 * 区域截图：先让用户在活跃标签页上拖拽选择区域，再截取并裁剪
 */
async function captureRegionScreenshot() {
  const tabId = await getCurrentActiveTabId();
  if (!tabId) {
    showToast('无法获取当前标签页');
    return;
  }

  try {
    // 向 content script 发送消息，启动区域选择
    const rect = await chrome.tabs.sendMessage(tabId, { type: 'START_REGION_SELECTION' });

    if (!rect) {
      // 用户取消或区域太小
      return;
    }

    console.log('[SidePanel] 区域选择结果:', rect);

    // 先截取整个可见区域
    const capResponse = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' });
    if (!capResponse?.dataUrl) {
      showToast('截图失败，请重试');
      return;
    }

    // 裁剪图片
    const croppedDataUrl = await cropImage(capResponse.dataUrl, rect);
    if (!croppedDataUrl) {
      showToast('裁剪失败，请重试');
      return;
    }

    // 转为 blob 并附加
    const res = await fetch(croppedDataUrl);
    const blob = await res.blob();
    compressAndAttachImage(blob);
  } catch (err) {
    console.error('[SidePanel] 区域截图失败:', err);
    showToast('区域截图失败，请确保页面已加载且未被浏览器限制');
  }
}

/**
 * 使用 Canvas 裁剪图片
 * @param {string} dataUrl - 原始图片 data URL
 * @param {{x, y, width, height}} rect - 裁剪区域（视口坐标）
 * @returns {Promise<string>} 裁剪后的 data URL
 */
function cropImage(dataUrl, rect) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // 考虑 devicePixelRatio
      const dpr = window.devicePixelRatio || 1;
      const sx = rect.x * dpr;
      const sy = rect.y * dpr;
      const sw = rect.width * dpr;
      const sh = rect.height * dpr;

      canvas.width = sw;
      canvas.height = sh;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}
