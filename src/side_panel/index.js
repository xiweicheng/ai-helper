// side_panel/index.js - Side Panel 入口文件

import state from './state.js';
import { BUILTIN_TOOLS, PRESET_MODES } from './constants.js';
import { showToast, loadChatConfig, getApiParams, ensureChatConfigLoaded, getCurrentActiveTabId, getSystemPrompt } from './utils.js';
import { addToInputHistory } from './input-history.js';
import { initMessageToc } from './message-toc.js';
import { initClarifyEvents } from './clarify-dialog.js';
import { initPrototypeEvents, showPrototypeLibrary } from './ui-prototype.js';
import { renderMermaidCharts, renderMessageMermaid } from './markdown-render.js';
import {
  sendMessage, clearChatHistory, exportChatHistory,
  showModal, hideModal, loadChatHistory, saveChatHistory,
  addMessage, addContextBubble, addLoadingMessage, removeLoadingMessage,
  callApi, clearSelectedContext, triggerSelectionSearch, fillSidePanelInput, directSend,
  restorePendingSessionsFromStorage
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
  if (!tempDropdown || !customModels) {
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
    sendBtn.disabled = false;
    const userInput = document.getElementById('userInput');
    userInput.focus();
  }
}

// ==================== 主初始化 ====================

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
    userInput.style.height = Math.min(userInput.scrollHeight, 100) + 'px';
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
      refreshSelectionInterval();
    }
  });

  // 加载保存的模型选择和自定义模型
  chrome.storage.local.get(['modelName', 'customModels', 'customPrompts', 'systemPrompt', 'inputHistory'], (result) => {
    const savedModelName = result.modelName;
    if (savedModelName) {
      state.currentModel = savedModelName;
    }
    state.customPrompts = result.customPrompts || [];
    state.systemPrompt = result.systemPrompt || '';
    state.inputHistory = result.inputHistory || [];
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
        addMessage(msg.role, msg.content, false, msg.executionLog || []);
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
      exportChatHistory();
    });
  }

  // 设置按钮
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
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
      state.enabledTools = result.enabledTools;
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
document.addEventListener('DOMContentLoaded', initPrototypeEvents);
