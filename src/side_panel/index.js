// side_panel/index.js - Side Panel 入口文件

import state from './state.js';
import { BUILTIN_TOOLS, PRESET_MODES } from './constants.js';
import { showToast, loadChatConfig, getApiParams, ensureChatConfigLoaded, getCurrentActiveTabId, getSystemPrompt, escapeHtml, formatDuration, updateDropdownPosition } from './utils.js';
import { estimateMessagesTokens, estimateTokens, getMessageBudget, getContextWindow, compressQuotedContext, generateMessagesSummary, normalizeCustomModels, stripImagesFromContent } from '../shared/token-counter.js';
import { addToInputHistory } from './input-history.js';
import { initMessageToc } from './message-toc.js';
import { initBookmarkPanel } from './bookmark-panel.js';
import { initSearchPanel } from './search-panel.js';
import { initWorkspacePanel, updateWorkspacePanelVisibility, resetAndRefreshWorkspace, attachFilesForQuestion } from './workspace-panel.js';
import { loadBookmarks } from './bookmark-manager.js';
import { markSessionCompleted, restoreCompletedSessions } from './session-manager.js';
import { newSession, closeCurrentSession } from './session-manager-ui.js';
import logger from '../shared/logger.js';
import { initI18n, applyI18n, subscribe, t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  sidePanel: {
    confirmAction: '确认操作',
    memoryLimitAll: '(全)',
    memoryLimitTitle: '点击设置记忆历史限制条数',
    configUpdated: '✅ 配置已更新',
    selectedPrefix: '📌 已选中',
    askBasedOnSelection: '基于选中内容提问',
    selectedContentLabel: '选中内容',
    selectedContentSummary: '摘要',
    userQuestionLabel: '用户问题',
    requestFailed: '❌ 请求失败：',
    unknownError: '未知错误',
    notConnected: '未连接',
    noPairedAgents: '暂无已配对代理',
    agentDisabled: '已停用',
    agentConnected: '已连接',
    agentChecking: '检测中...',
    agentOnline: '在线',
    agentOffline: '离线',
    enableAgent: '启用',
    disableAgent: '停用',
    disconnectAgent: '断开',
    connectAgent: '连接',
    deleteAgentBtn: '删除',
    workingDirectory: '工作目录: {path}',
    agentAddressCopied: '已复制代理地址',
    unknownAgent: '未知',
    restartAgentConfirm: '代理名称：{name}\n代理地址：{url}\n\n确定要重启代理服务吗？重启期间服务将短暂不可用。',
    restartAgentTitle: '重启代理',
    agentRestarting: '代理服务正在重启...',
    restartFailed: '重启失败: {error}',
    restartRequestFailed: '重启请求失败: {error}',
    updateAgentConfirm: '代理名称：{name}\n代理地址：{url}\n\n确定要更新代理吗？将通过 npm 安装最新版本，然后重启服务。更新期间服务不可用。',
    updateAgentTitle: '更新代理',
    agentUpdating: '正在更新代理（可能需要几分钟）...',
    agentUpdateRestarting: '代理正在更新并重启...',
    updateFailed: '更新失败: {error}',
    updateRequestFailed: '更新请求失败: {error}',
    stopAgentConfirm: '代理名称：{name}\n代理地址：{url}\n\n确定要停止代理服务吗？停止后将无法连接，需要手动重新启动。',
    stopAgentTitle: '停止代理',
    agentStopped: '代理服务已停止，代理已离线',
    stopFailed: '停止失败: {error}',
    stopRequestFailed: '停止请求失败: {error}',
    agentStatusRefreshed: '代理状态已刷新',
    deleteAgentTitle: '删除代理',
    deleteAgentConfirm: '确定要删除代理"{name}"吗？此操作不可恢复。',
    welcomeTitle: '开始对话',
    welcomeSubtitle: '输入您的问题，AI 助手将为您解答',
    sendBtnStop: '停止生成',
    sendBtnSend: '发送',
    imageNotEnabled: '未启用图片识别，图片已作为文件附件处理',
    screenshotFailed: '截图失败，请重试',
    auditCategoryAuth: '认证',
    auditCategoryFs: '文件',
    auditCategoryExec: '命令',
    auditCategorySecurity: '安全',
    auditCategorySystem: '系统',
    auditDetailSeparator: '；',
    auditQueryFailed: '查询失败: {error}',
    auditLoadFailed: '加载失败: {error}',
    auditNoMatch: '没有匹配的审计日志',
    auditEmpty: '暂无审计日志',
    clearStatsConfirm: '确定要清空所有工具使用统计吗？此操作不可撤销。',
    clearStatsTitle: '清空统计',
    toolStatsSummary: '已使用 {used} 个，未使用 {unused} 个',
    toolStatsLoadFailed: '加载失败',
    toolNameDescSeparator: '：',
  },
});

registerTranslations('en', {
  sidePanel: {
    confirmAction: 'Confirm Action',
    memoryLimitAll: '(All)',
    memoryLimitTitle: 'Click to set memory history limit',
    configUpdated: '✅ Configuration updated',
    selectedPrefix: '📌 Selected',
    askBasedOnSelection: 'Ask based on selection',
    selectedContentLabel: 'Selected content',
    selectedContentSummary: 'summary',
    userQuestionLabel: 'User question',
    requestFailed: '❌ Request failed: ',
    unknownError: 'Unknown error',
    notConnected: 'Not Connected',
    noPairedAgents: 'No paired agents',
    agentDisabled: 'Disabled',
    agentConnected: 'Connected',
    agentChecking: 'Checking...',
    agentOnline: 'Online',
    agentOffline: 'Offline',
    enableAgent: 'Enable',
    disableAgent: 'Disable',
    disconnectAgent: 'Disconnect',
    connectAgent: 'Connect',
    deleteAgentBtn: 'Delete',
    workingDirectory: 'Working directory: {path}',
    agentAddressCopied: 'Agent address copied',
    unknownAgent: 'Unknown',
    restartAgentConfirm: 'Agent name: {name}\nAgent address: {url}\n\nAre you sure you want to restart the agent service? The service will be briefly unavailable during restart.',
    restartAgentTitle: 'Restart Agent',
    agentRestarting: 'Agent service is restarting...',
    restartFailed: 'Restart failed: {error}',
    restartRequestFailed: 'Restart request failed: {error}',
    updateAgentConfirm: 'Agent name: {name}\nAgent address: {url}\n\nAre you sure you want to update the agent? It will install the latest version via npm, then restart the service. The service will be unavailable during update.',
    updateAgentTitle: 'Update Agent',
    agentUpdating: 'Updating agent (may take a few minutes)...',
    agentUpdateRestarting: 'Agent is updating and restarting...',
    updateFailed: 'Update failed: {error}',
    updateRequestFailed: 'Update request failed: {error}',
    stopAgentConfirm: 'Agent name: {name}\nAgent address: {url}\n\nAre you sure you want to stop the agent service? You will not be able to connect and will need to manually restart it.',
    stopAgentTitle: 'Stop Agent',
    agentStopped: 'Agent service stopped, agent is offline',
    stopFailed: 'Stop failed: {error}',
    stopRequestFailed: 'Stop request failed: {error}',
    agentStatusRefreshed: 'Agent status refreshed',
    deleteAgentTitle: 'Delete Agent',
    deleteAgentConfirm: 'Are you sure you want to delete agent "{name}"? This action cannot be undone.',
    welcomeTitle: 'Start a Conversation',
    welcomeSubtitle: 'Enter your question and the AI assistant will help you',
    sendBtnStop: 'Stop generating',
    sendBtnSend: 'Send',
    imageNotEnabled: 'Image recognition not enabled, image attached as file',
    screenshotFailed: 'Screenshot failed, please retry',
    auditCategoryAuth: 'Auth',
    auditCategoryFs: 'File',
    auditCategoryExec: 'Command',
    auditCategorySecurity: 'Security',
    auditCategorySystem: 'System',
    auditDetailSeparator: '; ',
    auditQueryFailed: 'Query failed: {error}',
    auditLoadFailed: 'Load failed: {error}',
    auditNoMatch: 'No matching audit logs',
    auditEmpty: 'No audit logs',
    clearStatsConfirm: 'Are you sure you want to clear all tool usage stats? This action cannot be undone.',
    clearStatsTitle: 'Clear Stats',
    toolStatsSummary: 'Used {used} tools, unused {unused} tools',
    toolStatsLoadFailed: 'Load failed',
    toolNameDescSeparator: ': ',
  },
});

window.showCustomConfirm = function(message, title = t('sidePanel.confirmAction')) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('customConfirmOverlay');
    const titleEl = document.getElementById('customConfirmTitle');
    const messageEl = document.getElementById('customConfirmMessage');
    const cancelBtn = document.getElementById('customConfirmCancelBtn');
    const okBtn = document.getElementById('customConfirmOkBtn');

    if (!overlay || !titleEl || !messageEl || !cancelBtn || !okBtn) {
      resolve(confirm(message));
      return;
    }

    const cleanup = () => {
      overlay.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeyDown);
    };

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onOverlayClick = (e) => { if (e.target === overlay) { cleanup(); resolve(false); } };
    const onKeyDown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onOk(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
    };

    titleEl.textContent = title;
    const escapedMsg = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    messageEl.innerHTML = escapedMsg.replace(/\n/g, '<br>');
    overlay.style.display = 'flex';

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeyDown);
    // 自动聚焦确认按钮，支持 Enter 确认 / Esc 取消
    requestAnimationFrame(() => okBtn.focus());
  });
};

/** 格式化上下文窗口大小：>=1M 显示 "1.2M"，>=1K 显示 "128K" */
function formatCtxWindow(tokens) {
  if (tokens >= 1000000) {
    return Math.round(tokens / 1000000 * 10) / 10 + 'M';
  }
  if (tokens >= 1000) {
    return Math.round(tokens / 1000) + 'K';
  }
  return String(tokens);
}
import { initClarifyEvents } from './clarify-dialog.js';
import { initConfirmEvents } from './confirm-dialog.js';
import { initPrototypeEvents, showPrototypeLibrary } from './ui-prototype.js';
import { renderMermaidCharts, renderMessageMermaid, addCodeCopyButtons } from './markdown-render.js';
import { initAgentManager } from './agent-manager.js';
import {
  sendMessage, clearChatHistory, showExportDialog, hideExportDialog, performExport,
  initExportDialogEvents, triggerImportDialog, handleImportFile,
  showModal, hideModal, loadChatHistory, saveChatHistory,
  addMessage, addContextBubble, addLoadingMessage, removeLoadingMessage,
  callApi, clearSelectedContext, triggerSelectionSearch, fillSidePanelInput, directSend,
  restorePendingSessionsFromStorage, restoreMessageFromHtml,
  bindExecutionLogDelegate, bindReflectionBadgeDelegate,
  rebindAllMessages, editAndResendMessage,
  compressAndAttachImage, openImagePreview, initImagePreviewOverlay,
  cancelStreamingTask, reconnectStreamingElement,
  _checkForAbandonedCheckpoint
} from './chat-manager.js';
import {
  addPromptManageButton, showPromptSelector, hidePromptSelector,
  togglePromptSelector, updatePromptList, sendPromptByCode,
  insertPromptToInputByCode, updatePromptSelection, initPromptEvents
} from './prompt-manager.js';
import {
  showAgentAtSelector, hideAgentAtSelector, updateAgentAtSelection, switchAtTab, activeAtTab
} from './agent-at-selector.js';
import {
  showFileAtSelector, hideFileAtSelector, updateFileAtSelection, isFileAtSelectorVisible
} from './file-at-selector.js';
import {
  initSkillIndicatorEvents, initSkillTabEvents, updateSkillSelection,
  switchDropdownTab, getSkillContextText, clearSkillSelection,
  updateMcpSelection, renderMcpList, selectMcpService, getMcpServices,
  initMcpIndicatorEvents
} from './skill-selector.js';
import {
  openToolsPopup, closeToolsPopup, renderToolsPopupList,
  getVisibleTools, updateAllCategoryCounts, updateCategoryBadges,
  updateToolsPopupTitle, saveToolsFromPopup, updateToolsToggleState,
  refreshToolPopupIfOpen
} from './tool-panel.js';
import { initPageIndicatorEvents, updatePageSelection } from './page-selector.js';
import { initTokenStatsPanel } from './token-stats-panel.js';
import { attachFiles, clearFiles } from './file-extract.js';
// 图片辅助函数已拆分到 image-helpers.js
import {
  updateImagePreviewVisibility, updateTextareaPadding, updateFileInputVisibility,
  renderImagePreviews, captureFullPageScreenshot, captureRegionScreenshot,
  cropImage, handlePageScreenshotResult
} from './image-helpers.js';

// ==================== 配置监听 ====================

// 监听配置变化，实时更新记忆限制标签
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.chatMaxMemoryMessages) {
    state.chatConfig.maxMemoryMessages = changes.chatMaxMemoryMessages.newValue;
    updateMemoryLimitLabel();
    logger.debug('[SidePanel] memory limitconfiguration updated:', state.chatConfig.maxMemoryMessages);
  }
});

// ==================== 记忆限制相关 ====================

function updateMemoryLimitLabel() {
  const label = document.getElementById('memoryLimitLabel');
  if (label) {
    if (state.chatConfig.maxMemoryMessages !== null && state.chatConfig.maxMemoryMessages !== undefined && state.chatConfig.maxMemoryMessages > 0) {
      label.textContent = `(${state.chatConfig.maxMemoryMessages})`;
    } else {
      label.textContent = t('sidePanel.memoryLimitAll');
    }
    label.style.display = 'inline';
    label.style.cursor = 'pointer';
    label.title = t('sidePanel.memoryLimitTitle');
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
        showToast(t('sidePanel.configUpdated'), 'success');
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
        showToast(t('sidePanel.configUpdated'), 'success');
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

/**
 * 保存模型到当前 Agent（自定义助手）或全局（默认助手）
 */
async function saveModelToAgentOrGlobal(modelName) {
  if (state.activeAgentId && state.activeAgentId !== 'default') {
    // 自定义助手：仅保存到 Agent 配置，不污染全局默认值
    try {
      const { updateAgent } = await import('./agent-store.js');
      await updateAgent(state.activeAgentId, { model: modelName });
    } catch { /* ignore */ }
  } else {
    // 默认助手：保存到全局 storage
    chrome.storage.local.set({ modelName });
  }
}

/**
 * 主动验证活跃代理的实际连通性（启动时调用，不依赖缓存）
 */
async function verifyActiveAgentConnectivity() {
  try {
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = storage.pairedAgents || [];
    const activeId = storage.activeAgentId;
    const active = agents.find(a => a.id === activeId && !a.disabled);

    if (!active) {
      state.agentPlatform = { connected: false };
      updateAgentIndicator(state.agentPlatform);
      return;
    }

    // 已配对的 Agent 有 token，直接调认证接口获取完整信息
    if (active.token) {
      try {
        const detailResp = await fetch(`${active.url}/api/status/detail`, {
          cache: 'no-cache',
          headers: { 'Authorization': `Bearer ${active.token}` }
        });
        if (detailResp.ok) {
          const data = await detailResp.json();
          if (data.success) {
            state.agentPlatform = {
              platformName: data.platformName || 'Unknown',
              platform: data.platform || 'unknown',
              arch: data.arch || 'unknown',
              shell: data.shell || '/bin/sh',
              homeDir: data.homeDir || '',
              workdir: data.workdir || '',
              connected: true
            };
            // 缓存活跃代理的版本号、工作目录、用户主目录和系统信息
            if (data.version) {
              state.agentVersions.set(activeId, data.version);
            }
            if (data.workdir) {
              state.agentWorkdirs.set(activeId, data.workdir);
            }
            if (data.homeDir) {
              state.agentHomeDirs.set(activeId, data.homeDir);
            }
            const sysInfo1 = formatSystemInfo(data.platformName || data.platform, data.arch);
            if (sysInfo1) {
              state.agentSystemInfos.set(activeId, sysInfo1);
            }
          } else {
            state.agentPlatform = { connected: false };
          }
        } else {
          state.agentPlatform = { connected: false };
        }
      } catch {
        state.agentPlatform = { connected: false };
      }
    } else {
      state.agentPlatform = { connected: false };
    }

    updateAgentIndicator(state.agentPlatform);
    updateFileInputVisibility();
  } catch {
    // 静默失败
  }
}

/**
 * 保存温度到当前 Agent（自定义助手）或全局（默认助手）
 */
async function saveTempToAgentOrGlobal(temperature, topP, selectedTempIndex) {
  if (state.activeAgentId && state.activeAgentId !== 'default') {
    // 自定义助手：仅保存到 Agent 配置，不污染全局默认值
    try {
      const { updateAgent } = await import('./agent-store.js');
      await updateAgent(state.activeAgentId, { temperature, topP });
    } catch { /* ignore */ }
  } else {
    // 默认助手：保存到全局 storage
    chrome.storage.local.set({ temperature, topP, selectedTempIndex });
  }
}

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

      if (presetModels.includes(modelName)) {
        // 预设模型若有自定义上下文窗口配置，则在已有选项中显示标签
        if (contextWindow && contextWindow > 0) {
          const existingOption = tempDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
          if (existingOption) {
            // 确保左侧包裹
            let leftSpan = existingOption.querySelector('.model-option-left');
            if (!leftSpan) {
              leftSpan = document.createElement('span');
              leftSpan.className = 'model-option-left';
              leftSpan.textContent = existingOption.textContent;
              for (const child of [...existingOption.childNodes]) {
                if (child.nodeType === Node.TEXT_NODE) {
                  existingOption.removeChild(child);
                }
              }
              existingOption.insertBefore(leftSpan, existingOption.firstChild);
            }

            // 右侧容器（只有 badge，无删除按钮）
            let rightSpan = existingOption.querySelector('.model-option-right');
            if (!rightSpan) {
              rightSpan = document.createElement('span');
              rightSpan.className = 'model-option-right';
              const oldBadge = existingOption.querySelector(':scope > .model-ctx-badge');
              if (oldBadge) rightSpan.appendChild(oldBadge);
              existingOption.appendChild(rightSpan);
            }

            const badge = rightSpan.querySelector('.model-ctx-badge');
            if (badge) {
              badge.textContent = formatCtxWindow(contextWindow);
            } else {
              const ctxBadge = document.createElement('span');
              ctxBadge.className = 'model-ctx-badge';
              ctxBadge.textContent = formatCtxWindow(contextWindow);
              rightSpan.appendChild(ctxBadge);
            }
          }
        }
        return;
      }
      const existingOption = tempDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
      if (existingOption) return;

      const option = document.createElement('div');
      option.className = 'model-option';
      option.dataset.value = modelName;
      option.innerHTML = `<span class="model-option-check"></span><span class="model-option-left">${modelName}</span>`;

      // 上下文窗口大小标签（放在右侧容器内）
      if (contextWindow && contextWindow > 0) {
        const rightSpan = document.createElement('span');
        rightSpan.className = 'model-option-right';
        const ctxBadge = document.createElement('span');
        ctxBadge.className = 'model-ctx-badge';
        ctxBadge.textContent = formatCtxWindow(contextWindow);
        rightSpan.appendChild(ctxBadge);
        option.appendChild(rightSpan);
      }

      option.addEventListener('click', (e) => {
        e.stopPropagation();
        state.currentModel = modelName;
        updateModelSelection(modelName);
        saveModelToAgentOrGlobal(modelName);
      });

      tempDropdown.querySelector('.model-section').appendChild(option);
    });

    // 如果存在旧格式数据，自动迁移
    if (needsMigration) {
      const migrated = customModels.map(item => {
        if (typeof item === 'string') return { name: item, contextWindow: 0 };
        return item;
      });
      chrome.storage.local.set({ customModels: migrated });
    }

    // 构建运行时上下文窗口映射
    state.customModelMap = normalizeCustomModels(customModels);

    if (typeof callback === 'function') {
      callback();
    }
  });
}

// ==================== 选中内容上下文 ====================

function setSelectedContext(text, prefix = t('sidePanel.selectedPrefix')) {
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

  let selectionFloatingMenu = document.getElementById('selectionFloatingMenu');
  let selectionMenuItems = document.getElementById('selectionMenuItems');

  if (!selectionFloatingMenu || !selectionMenuItems) {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) {
      return;
    }

    selectionFloatingMenu = document.createElement('div');
    selectionFloatingMenu.className = 'selection-floating-menu';
    selectionFloatingMenu.id = 'selectionFloatingMenu';
    selectionFloatingMenu.innerHTML = `
      <div class="menu-header">${t('sidePanel.askBasedOnSelection')}</div>
      <div id="selectionMenuItems"></div>
    `;
    chatContainer.appendChild(selectionFloatingMenu);
    selectionMenuItems = document.getElementById('selectionMenuItems');
  }

  const menuPrompts = state.customPrompts.filter(p => p.enabledInMenu === true);

  if (menuPrompts.length === 0) {
    logger.debug('[SidePanel] showFloatingMenu skipped: no prompts enabled in menu');
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
    logger.debug('[SidePanel] generating,please wait...');
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

  const { compressed: compressedCtx, wasCompressed } = compressQuotedContext(selectedText);
  const userMessage = `[${t('sidePanel.selectedContentLabel')}${wasCompressed ? t('sidePanel.selectedContentSummary') : ''}]\n${compressedCtx}\n\n[${t('sidePanel.userQuestionLabel')}]\n${prompt.content}`;

  const { messageId } = addMessage('user', prompt.content, true, [], null, false, userMessage);

  state.messageHistory.push({ role: 'user', content: userMessage, messageId });

  saveChatHistory();

  addToInputHistory(prompt.content);

  state.isGenerating = true;

  const loadingId = addLoadingMessage();
  const mySessionId = state.activeSessionId;

  const model = state.currentModel;

  try {
    await ensureChatConfigLoaded();

    logger.debug('[SidePanel] sendmessagedebuginfo:');
    logger.debug('  - isolateChat:', state.isolateChat);
    logger.debug('  - chatConfig:', state.chatConfig);
    logger.debug('  - messageHistory.length:', state.messageHistory.length);

    let messages = [
      {
        role: 'system',
        content: await getSystemPrompt()
      }
    ];

    if (state.isolateChat) {
      let historyToSend = state.messageHistory;
      // Token 预算驱动：使用实际系统提示词 token 数而非固定估算值
      const configuredWindow = 0;
      const actualSystemTokens = estimateTokens(messages[0]?.content || '');
      const contextWindow = getContextWindow(model, configuredWindow, state.customModelMap);
      // 消息预算 = 上下文窗口 - 实际系统提示词 - 输出预留(4096) - 安全余量(2000)
      // 非工具模式下不发送工具定义，故工具开销为 0
      const messageBudget = contextWindow - actualSystemTokens - 4096 - 2000;
      const historyBudget = Math.floor(messageBudget * 0.7);
      
      // 应用用户设置的记忆条数限制（不包含当前消息，仅限制历史消息条数）
      let historyWithoutCurrent = state.messageHistory.slice(0, -1);
      const maxMemory = state.chatConfig.maxMemoryMessages;
      if (maxMemory && maxMemory > 0 && historyWithoutCurrent.length > maxMemory) {
        historyWithoutCurrent = historyWithoutCurrent.slice(historyWithoutCurrent.length - maxMemory);
        logger.debug(`[SidePanel] memory count limit: ${state.messageHistory.length - 1} → ${maxMemory} historymessage`);
      }

      const currentMsg = state.messageHistory[state.messageHistory.length - 1];
      
      const keptHistory = [];
      let keptTokens = estimateMessagesTokens([currentMsg]);
      for (let i = historyWithoutCurrent.length - 1; i >= 0; i--) {
        const msg = historyWithoutCurrent[i];
        const msgTokens = estimateMessagesTokens([msg]);
        if (keptTokens + msgTokens <= historyBudget) {
          keptHistory.unshift(msg);
          keptTokens += msgTokens;
        } else {
          break;
        }
      }
      
      if (keptHistory.length < historyWithoutCurrent.length) {
        const trimmedCount = historyWithoutCurrent.length - keptHistory.length;
        const trimmedMsgs = historyWithoutCurrent.slice(0, trimmedCount);
        const summary = generateMessagesSummary(trimmedMsgs);
        if (summary) {
          messages[0] = { ...messages[0], content: messages[0].content + '\n\n' + summary };
        }
      }
      
      historyToSend = [...keptHistory, currentMsg];
      messages = [...messages, ...historyToSend];
      // 剥离历史消息中的旧图片数据，只保留当前最新消息的图片
      for (let i = 0; i < messages.length - 1; i++) {
        messages[i] = { ...messages[i], content: stripImagesFromContent(messages[i].content) };
      }
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

    const apiParams = await getApiParams();
    let content, executionLog;

    try {
      const result = await callApi(messages, model, state.useTools, apiParams);
      content = result.content;
      executionLog = result.executionLog || [];

      removeLoadingMessage(loadingId);

      if (result.wasStreamed) {
        if (result.streamingMsgId) {
          state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog, messageId: result.streamingMsgId });
          saveChatHistory();
        }
      } else {
        const { element: messageDiv, messageId } = addMessage('assistant', content, true, executionLog);
        await renderMessageMermaid(messageDiv);
        state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog, messageId });
        saveChatHistory();
      }
      return;
    } catch (errorResult) {
      removeLoadingMessage(loadingId);

      content = t('sidePanel.requestFailed') + (errorResult.message || t('sidePanel.unknownError'));
      executionLog = errorResult.executionLog || [];

      const { element: messageDiv, messageId } = addMessage('assistant', content, true, executionLog);

      state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog, messageId });

      saveChatHistory();

      throw errorResult;
    }

  } catch (error) {
  } finally {
    state.generatingSessionIds.delete(mySessionId);
    // 若用户已切走到其他会话，标记此会话任务已完成，等待查看
    markSessionCompleted(mySessionId);
    document.dispatchEvent(new CustomEvent('generating-state-changed'));
    const userInput = document.getElementById('userInput');
    userInput.focus();
  }
}

// ==================== 主初始化 ====================

/**
 * 更新 Side Panel 头部的 Agent 连接指示器
 */
async function updateAgentIndicator(platformInfo, skipPing = false) {
  const dot = document.getElementById('headerAgentDot');
  const nameEl = document.getElementById('headerAgentName');
  const trigger = document.getElementById('headerAgentTrigger');
  if (!dot || !nameEl) return;

  // 获取当前活跃代理信息
  let activeAgent = null;
  let allAgents = [];
  try {
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    allAgents = storage.pairedAgents || [];
    activeAgent = allAgents.find(a => a.id === storage.activeAgentId);
  } catch { /* ignore */ }

  const connected = platformInfo?.connected === true;

  if (!connected || !activeAgent) {
    dot.className = 'header-agent-dot disconnected';
    nameEl.textContent = activeAgent ? (activeAgent.name.length > 12 ? activeAgent.name.substring(0, 12) + '...' : activeAgent.name) : t('sidePanel.notConnected');
    nameEl.classList.toggle('truncated', !!activeAgent);
    trigger.title = activeAgent ? activeAgent.name : '';
  } else {
    dot.className = 'header-agent-dot connected';
    const displayName = activeAgent.name.length > 12 ? activeAgent.name.substring(0, 12) + '...' : activeAgent.name;
    nameEl.textContent = displayName;
    nameEl.classList.toggle('truncated', activeAgent.name.length > 12);
    trigger.title = activeAgent.name;
  }

  // 更新下拉列表
  updateAgentDropdown(activeAgent, allAgents, connected);

  // 如果下拉已打开且未跳过，Ping 各代理更新在线状态
  if (!skipPing) {
    const dropdown = document.getElementById('headerAgentDropdown');
    if (dropdown && dropdown.style.display !== 'none') {
      pingAllAgents();
    }
  }

  // 同步更新工作目录面板入口可见性
  updateWorkspacePanelVisibility(connected);
}

/**
 * 更新代理下拉列表内容
 */
function updateAgentDropdown(activeAgent, allAgents, connected) {
  const list = document.getElementById('agentDdList');
  const copyRow = document.getElementById('agentDdCopyRow');
  if (!list || !copyRow) return;

  // 复制行：显示活跃代理地址
  if (activeAgent?.url) {
    copyRow.style.display = '';
    copyRow.querySelector('.agent-dd-copy-label').textContent = activeAgent.url;
  } else {
    copyRow.style.display = 'none';
  }

  // 代理列表
  if (allAgents.length === 0) {
    list.innerHTML = '<div class="agent-dd-empty">' + t('sidePanel.noPairedAgents') + '</div>';
    // 禁用底部操作按钮
    const restartBtn = document.getElementById('agentDdRestartBtn');
    const updateBtn = document.getElementById('agentDdUpdateBtn');
    const stopBtn = document.getElementById('agentDdStopBtn');
    if (restartBtn) restartBtn.disabled = true;
    if (updateBtn) updateBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
    return;
  }

  list.innerHTML = allAgents.map(a => {
    const isActive = a.id === activeAgent?.id;
    const isDisabled = !!a.disabled;
    const version = state.agentVersions.get(a.id);
    let dotClass, statusLabel;
    if (isDisabled) {
      dotClass = 'disabled';
      statusLabel = t('sidePanel.agentDisabled');
    } else if (isActive) {
      dotClass = connected ? 'connected' : 'disconnected';
      statusLabel = connected ? t('sidePanel.agentConnected') : t('sidePanel.notConnected');
    } else {
      // 非活跃代理：初始显示检测中，稍后 ping 更新
      dotClass = 'checking';
      statusLabel = t('sidePanel.agentChecking');
    }

    const workdir = state.agentWorkdirs.get(a.id);
    const homeDir = state.agentHomeDirs.get(a.id);
    const displayWorkdir = formatWorkdir(workdir, homeDir);
    const sysInfo = state.agentSystemInfos.get(a.id);

    return `
      <div class="agent-dd-item${isActive ? ' active' : ''}${isDisabled ? ' disabled' : ''}" data-agent-id="${a.id}">
        <span class="agent-dd-item-dot ${dotClass}"></span>
        <div class="agent-dd-item-info">
          <div class="agent-dd-item-name"><span class="agent-dd-item-name-text" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>${version ? `<span class="agent-dd-item-version" title="v${escapeHtml(version)}">v${escapeHtml(version)}</span>` : ''}${sysInfo ? `<span class="agent-dd-item-sysinfo" title="${escapeHtml(sysInfo)}">${escapeHtml(sysInfo)}</span>` : ''}</div>
          <span class="agent-dd-item-url" title="${escapeHtml(a.url || '')}">${escapeHtml(a.url || '')}</span>
          ${displayWorkdir ? `<span class="agent-dd-item-workdir" title="${t('sidePanel.workingDirectory', { path: escapeHtml(workdir) })}">${escapeHtml(displayWorkdir)}</span>` : ''}
        </div>
        <span class="agent-dd-item-status">${statusLabel}</span>
        ${isActive ? '<span class="agent-dd-item-check">&#10003;</span>' : ''}
        <div class="agent-dd-item-toolbar">
          ${isDisabled
            ? `<button class="agent-dd-tool-btn enable" data-action="enable" data-id="${a.id}" title="${t('sidePanel.enableAgent')}">▶</button>`
            : (isActive
              ? `<button class="agent-dd-tool-btn disconnect" data-action="disconnect" data-id="${a.id}" title="${t('sidePanel.disconnectAgent')}">✕</button>
                 <button class="agent-dd-tool-btn stop" data-action="disable" data-id="${a.id}" title="${t('sidePanel.disableAgent')}">⏸</button>`
              : `<button class="agent-dd-tool-btn switch" data-action="switch" data-id="${a.id}" title="${t('sidePanel.connectAgent')}">⇄</button>
                 <button class="agent-dd-tool-btn stop" data-action="disable" data-id="${a.id}" title="${t('sidePanel.disableAgent')}">⏸</button>`
            )
          }
          <button class="agent-dd-tool-btn delete" data-action="delete" data-id="${a.id}" title="${t('sidePanel.deleteAgentBtn')}">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  // 根据活跃代理连接状态启禁底部操作按钮
  const restartBtn = document.getElementById('agentDdRestartBtn');
  const updateBtn = document.getElementById('agentDdUpdateBtn');
  const stopBtn = document.getElementById('agentDdStopBtn');
  const btnEnabled = !!(activeAgent && connected);
  if (restartBtn) restartBtn.disabled = !btnEnabled;
  if (updateBtn) updateBtn.disabled = !btnEnabled;
  if (stopBtn) stopBtn.disabled = !btnEnabled;
}

/**
 * Ping 单个代理，返回是否在线、版本号、工作目录及用户主目录
 * 优先调用认证接口 /api/status/detail 以获取 workdir/homeDir，失败回退 /api/status
 */
async function pingAgentUrl(url, token) {
  // 优先尝试 detail 接口（带 token），可同时获取 version + workdir + homeDir
  if (token) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 2000);
      const detailRes = await fetch(`${url}/api/status/detail`, {
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (detailRes.ok) {
        const data = await detailRes.json();
        if (data.success) {
          return {
            online: true,
            version: data.version || null,
            workdir: data.workdir || null,
            homeDir: data.homeDir || null,
            platformName: data.platformName || data.platform || null,
            arch: data.arch || null
          };
        }
      }
    } catch { /* 回退到 status 接口 */ }
  }
  // 回退到无认证 status 接口
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${url}/api/status`, { signal: controller.signal });
    if (!res.ok) return { online: false, version: null, workdir: null, homeDir: null, platformName: null, arch: null };
    const data = await res.json();
    return { online: true, version: data.version || null, workdir: null, homeDir: null, platformName: data.platformName || data.platform || null, arch: data.arch || null };
  } catch {
    return { online: false, version: null, workdir: null, homeDir: null, platformName: null, arch: null };
  }
}

/**
 * 格式化工作目录：将用户主目录前缀替换为 ~
 */
function formatWorkdir(workdir, homeDir) {
  if (!workdir) return '';
  if (homeDir && workdir.startsWith(homeDir)) {
    return '~' + workdir.substring(homeDir.length);
  }
  return workdir;
}

/**
 * 格式化系统信息：仅显示平台名称
 */
function formatSystemInfo(platformName, arch) {
  if (!platformName) return '';
  return platformName;
}

/**
 * 更新下拉列表中单个代理项的在线状态
 */
function updateAgentItemOnlineStatus(agentId, online) {
  const item = document.querySelector(`.agent-dd-item[data-agent-id="${agentId}"]`);
  if (!item) return;
  const dot = item.querySelector('.agent-dd-item-dot');
  const statusEl = item.querySelector('.agent-dd-item-status');
  const isActive = item.classList.contains('active');
  if (dot) {
    dot.classList.remove('checking', 'connected', 'disconnected', 'online', 'offline');
    // 活跃代理用 connected/disconnected（离线时红色更醒目），非活跃代理用 online/offline
    dot.classList.add(isActive ? (online ? 'connected' : 'disconnected') : (online ? 'online' : 'offline'));
  }
  if (statusEl) {
    if (isActive) {
      // 活跃代理：直接更新为"已连接"/"未连接"
      statusEl.textContent = online ? t('sidePanel.agentConnected') : t('sidePanel.notConnected');
    } else if (statusEl.textContent === t('sidePanel.agentChecking')) {
      // 非活跃代理：仅从"检测中..."更新
      statusEl.textContent = online ? t('sidePanel.agentOnline') : t('sidePanel.agentOffline');
    }
  }
}

/**
 * 更新下拉列表中单个代理项的工作目录显示（前缀 ~ 简化，悬停显示"工作目录: 完整路径"）
 */
function updateAgentItemWorkdir(agentId, workdir) {
  if (!workdir) return;
  const item = document.querySelector(`.agent-dd-item[data-agent-id="${agentId}"]`);
  if (!item) return;
  const info = item.querySelector('.agent-dd-item-info');
  if (!info) return;
  const homeDir = state.agentHomeDirs.get(agentId);
  const display = formatWorkdir(workdir, homeDir);
  let workdirEl = info.querySelector('.agent-dd-item-workdir');
  if (workdirEl) {
    workdirEl.textContent = display;
    workdirEl.title = t('sidePanel.workingDirectory', { path: workdir });
  } else {
    workdirEl = document.createElement('span');
    workdirEl.className = 'agent-dd-item-workdir';
    workdirEl.title = t('sidePanel.workingDirectory', { path: workdir });
    workdirEl.textContent = display;
    info.appendChild(workdirEl);
  }
}

// 供 workspace-panel 切换工作目录后同步下拉列表显示
window.updateAgentItemWorkdir = updateAgentItemWorkdir;

/**
 * Ping 所有非停用代理并更新列表状态
 */
async function pingAllAgents() {
  try {
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = storage.pairedAgents || [];
    const activeId = storage.activeAgentId;
    // 并行 ping 所有非停用代理
    await Promise.all(agents.filter(a => !a.disabled).map(async (a) => {
      const result = await pingAgentUrl(a.url, a.token);
      const online = result.online;
      // 缓存版本号、工作目录、用户主目录和系统信息
      if (result.version) {
        state.agentVersions.set(a.id, result.version);
      }
      if (result.workdir) {
        state.agentWorkdirs.set(a.id, result.workdir);
      }
      if (result.homeDir) {
        state.agentHomeDirs.set(a.id, result.homeDir);
      }
      const sysInfo = formatSystemInfo(result.platformName, result.arch);
      if (sysInfo) {
        state.agentSystemInfos.set(a.id, sysInfo);
      }
      if (result.workdir) {
        updateAgentItemWorkdir(a.id, result.workdir);
      }
      updateAgentItemOnlineStatus(a.id, online);
      // 活跃代理在线状态变化时，同步更新 Header 指示器
      if (a.id === activeId) {
        const currentConnected = state.agentPlatform?.connected === true;
        if (online !== currentConnected) {
          state.agentPlatform = { ...state.agentPlatform, connected: online };
          updateAgentIndicator(state.agentPlatform, true); // skipPing 避免递归
          // 从离线恢复为在线时，刷新完整平台信息
          if (online) {
            refreshAgentPlatformInfo(a);
          }
        }
      }
    }));
  } catch { /* ignore */ }
}

/**
 * 刷新活跃代理的完整平台信息（从离线恢复为在线时调用）
 * 优先调用 /api/status/detail（需认证）获取完整信息，回退到 /api/status（无认证），最终回退到仅标记 connected
 * @param {Object} [agent] - 代理对象 { url, token }，不传则从 storage 读取活跃代理
 */
async function refreshAgentPlatformInfo(agent) {
  try {
    let agentData = agent;
    if (!agentData) {
      const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
      const agents = storage.pairedAgents || [];
      const activeId = storage.activeAgentId;
      agentData = agents.find(a => a.id === activeId && !a.disabled);
    }
    if (!agentData || !agentData.url) {
      state.agentPlatform = { ...state.agentPlatform, connected: true };
      updateAgentIndicator(state.agentPlatform);
      updateFileInputVisibility();
      return;
    }

    // 优先：调用认证接口 /api/status/detail 获取完整信息
    if (agentData.token) {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 3000);
        const detailRes = await fetch(`${agentData.url}/api/status/detail`, {
          signal: controller.signal,
          headers: { 'Authorization': `Bearer ${agentData.token}` }
        });
        if (detailRes.ok) {
          const data = await detailRes.json();
          if (data.success) {
            state.agentPlatform = {
              platformName: data.platformName || 'Unknown',
              platform: data.platform || 'unknown',
              arch: data.arch || 'unknown',
              shell: data.shell || '/bin/sh',
              homeDir: data.homeDir || '',
              workdir: data.workdir || '',
              connected: true
            };
            if (data.version) state.agentVersions.set(agentData.id, data.version);
            if (data.workdir) {
              state.agentWorkdirs.set(agentData.id, data.workdir);
              updateAgentItemWorkdir(agentData.id, data.workdir);
            }
            if (data.homeDir) state.agentHomeDirs.set(agentData.id, data.homeDir);
            const sysInfo = formatSystemInfo(data.platformName || data.platform, data.arch);
            if (sysInfo) state.agentSystemInfos.set(agentData.id, sysInfo);
            updateAgentIndicator(state.agentPlatform);
            updateFileInputVisibility();
            return;
          }
        }
      } catch { /* 回退到无认证接口 */ }
    }

    // 回退：无认证 /api/status（已包含 platformName）
    try {
      const controller = new abortController();
      setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${agentData.url}/api/status`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        state.agentPlatform = {
          platformName: data.platformName || data.platform || 'Unknown',
          platform: data.platform || 'unknown',
          arch: data.arch || 'unknown',
          connected: true
        };
        updateAgentIndicator(state.agentPlatform);
        updateFileInputVisibility();
        return;
      }
    } catch { /* 最终回退 */ }

    // 最终回退：仅标记 connected
    state.agentPlatform = { ...state.agentPlatform, connected: true };
    updateAgentIndicator(state.agentPlatform);
    updateFileInputVisibility();
  } catch {
    state.agentPlatform = { ...state.agentPlatform, connected: true };
    updateAgentIndicator(state.agentPlatform);
    updateFileInputVisibility();
  }
}

/**
 * 重启/更新后启动恢复检测轮询
 * 每 3s 检测一次活跃代理是否恢复在线，检测到后更新 UI 并停止
 * @param {string} agentId - 活跃代理 ID
 * @param {number} maxAttempts - 最大尝试次数（默认 20 次 = 60s）
 */
let _recoveryPollingTimer = null;
function startRecoveryPolling(agentId, maxAttempts = 20) {
  if (_recoveryPollingTimer) clearInterval(_recoveryPollingTimer);
  let attempts = 0;
  _recoveryPollingTimer = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts || !agentId) {
      clearInterval(_recoveryPollingTimer);
      _recoveryPollingTimer = null;
      return;
    }
    try {
      const storage = await chrome.storage.local.get(['pairedAgents']);
      const agent = (storage.pairedAgents || []).find(a => a.id === agentId);
      if (!agent) {
        clearInterval(_recoveryPollingTimer);
        _recoveryPollingTimer = null;
        return;
      }
      const result = await pingAgentUrl(agent.url, agent.token);
      if (result.online) {
        clearInterval(_recoveryPollingTimer);
        _recoveryPollingTimer = null;
        // 缓存版本号、工作目录、用户主目录和系统信息
        if (result.version) {
          state.agentVersions.set(agentId, result.version);
        }
        if (result.workdir) {
          state.agentWorkdirs.set(agentId, result.workdir);
        }
        if (result.homeDir) {
          state.agentHomeDirs.set(agentId, result.homeDir);
        }
        const sysInfo = formatSystemInfo(result.platformName, result.arch);
        if (sysInfo) {
          state.agentSystemInfos.set(agentId, sysInfo);
        }
        if (result.workdir) {
          updateAgentItemWorkdir(agentId, result.workdir);
        }
        // 刷新完整平台信息（优先 detail 接口，回退 status 接口）
        await refreshAgentPlatformInfo(agent);
        updateAgentItemOnlineStatus(agentId, true);
      }
    } catch { /* ignore */ }
  }, 3000);
}

/**
 * 动态定位 header 代理下拉框：默认右对齐（wrapper 右侧 -20px），
 * 窄屏时 clamp 在面板边界内，保证左右两侧都不被遮挡
 */
function positionHeaderAgentDropdown() {
  const dropdown = document.getElementById('headerAgentDropdown');
  const wrapper = document.getElementById('headerAgentWrapper');
  if (!dropdown || !wrapper) return;

  const panelWidth = document.body.clientWidth;
  const wrapperRect = wrapper.getBoundingClientRect();
  const ddWidth = dropdown.offsetWidth;

  // 面板太窄时收缩下拉框宽度（覆盖 CSS min-width/max-width）
  if (panelWidth < 312) {
    dropdown.style.minWidth = (panelWidth - 16) + 'px';
    dropdown.style.maxWidth = (panelWidth - 16) + 'px';
  } else {
    dropdown.style.minWidth = '';
    dropdown.style.maxWidth = '';
  }

  // 默认位置：右边缘 = wrapper 右边缘右侧 20px（原视觉），左侧不超出边界
  let left = wrapperRect.right + 20 - ddWidth;
  const minLeft = 8;
  const maxLeft = panelWidth - ddWidth - 8;
  left = Math.max(minLeft, Math.min(maxLeft, left));

  dropdown.style.left = (left - wrapperRect.left) + 'px';
}

/**
 * 初始化代理下拉事件
 */
async function initAgentDropdown() {
  const trigger = document.getElementById('headerAgentTrigger');
  const dropdown = document.getElementById('headerAgentDropdown');
  const copyBtn = document.getElementById('agentDdCopyBtn');
  const addBtn = document.getElementById('agentDdAddBtn');
  const restartBtn = document.getElementById('agentDdRestartBtn');
  const updateBtn = document.getElementById('agentDdUpdateBtn');
  const stopBtn = document.getElementById('agentDdStopBtn');
  const refreshBtn = document.getElementById('agentDdRefreshBtn');

  if (!trigger || !dropdown) return;

  // 点击触发按钮切换下拉
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.style.display !== 'none';
    dropdown.style.display = isOpen ? 'none' : '';
    if (!isOpen) {
      // 窄屏时动态 clamp 下拉框位置，避免超出面板边界
      positionHeaderAgentDropdown();
      // 打开时刷新列表并检测各代理在线状态
      updateAgentIndicator(state.agentPlatform || {});
      pingAllAgents();
    }
  });

  // 点击外部关闭
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== trigger) {
      dropdown.style.display = 'none';
    }
  });

  // 复制地址
  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const activeAgentId = state.activeAgentId;
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = storage.pairedAgents || [];
    const active = agents.find(a => a.id === storage.activeAgentId);
    if (active?.url) {
      await navigator.clipboard.writeText(active.url);
      showToast(t('sidePanel.agentAddressCopied'), 'success');
    }
  });

  // 新增/编辑代理 → 跳转选项页，定位到代理 Tab
  addBtn.addEventListener('click', async () => {
    dropdown.style.display = 'none';
    // 设置标记，选项页加载后自动切到代理 Tab
    await chrome.storage.local.set({ optionsInitialTab: 'agent' });
    // 检查是否已有打开的选项页
    const tabs = await chrome.tabs.query({});
    const optionsUrl = chrome.runtime.getURL('options/index.html');
    const existingTab = tabs.find(t => t.url && t.url.startsWith(optionsUrl));
    if (existingTab) {
      chrome.tabs.update(existingTab.id, { active: true });
      // 发送消息切换 Tab
      try {
        chrome.tabs.sendMessage(existingTab.id, { type: 'SWITCH_TAB', tab: 'agent' });
      } catch (e) { /* content script 未就绪 */ }
    } else {
      chrome.runtime.openOptionsPage();
    }
  });

  // 重启代理
  restartBtn.addEventListener('click', async () => {
    dropdown.style.display = 'none';
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = storage.pairedAgents || [];
    const active = agents.find(a => a.id === storage.activeAgentId);
    const name = active?.name || t('sidePanel.unknownAgent');
    const url = active?.url || t('sidePanel.unknownAgent');
    const confirmed = await window.showCustomConfirm(
      t('sidePanel.restartAgentConfirm', { name, url }),
      t('sidePanel.restartAgentTitle')
    );
    if (!confirmed) return;
    try {
      // 通过 background 调用
      chrome.runtime.sendMessage({ type: 'AGENT_RESTART' }, async (response) => {
        if (response?.success) {
          showToast(t('sidePanel.agentRestarting'), 'success');
          // 重启期间立即更新 UI 为未连接状态（skipPing 避免在代理未真正 shutdown 前 ping 到它）
          state.agentPlatform = { ...state.agentPlatform, connected: false };
          await updateAgentIndicator(state.agentPlatform, true);
          if (active?.id) updateAgentItemOnlineStatus(active.id, false);
          // 启动恢复检测轮询（每 3s 检测一次，最多 60s）
          startRecoveryPolling(active?.id);
        } else {
          showToast(t('sidePanel.restartFailed', { error: response?.error || t('sidePanel.unknownError') }), 'error');
        }
      });
    } catch (err) {
      showToast(t('sidePanel.restartRequestFailed', { error: err.message }), 'error');
    }
  });

  // 更新并重启代理
  updateBtn.addEventListener('click', async () => {
    dropdown.style.display = 'none';
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = storage.pairedAgents || [];
    const active = agents.find(a => a.id === storage.activeAgentId);
    const name = active?.name || t('sidePanel.unknownAgent');
    const url = active?.url || t('sidePanel.unknownAgent');
    const confirmed = await window.showCustomConfirm(
      t('sidePanel.updateAgentConfirm', { name, url }),
      t('sidePanel.updateAgentTitle')
    );
    if (!confirmed) return;
    showToast(t('sidePanel.agentUpdating'), 'info');
    try {
      chrome.runtime.sendMessage({ type: 'AGENT_UPDATE' }, async (response) => {
        if (response?.success) {
          showToast(t('sidePanel.agentUpdateRestarting'), 'success');
          // 更新期间立即更新 UI 为未连接状态（skipPing 避免在代理未真正 shutdown 前 ping 到它）
          state.agentPlatform = { ...state.agentPlatform, connected: false };
          await updateAgentIndicator(state.agentPlatform, true);
          if (active?.id) updateAgentItemOnlineStatus(active.id, false);
          // 启动恢复检测轮询（每 3s 检测一次，最多 60s）
          startRecoveryPolling(active?.id);
        } else {
          showToast(t('sidePanel.updateFailed', { error: response?.error || t('sidePanel.unknownError') }), 'error');
        }
      });
    } catch (err) {
      showToast(t('sidePanel.updateRequestFailed', { error: err.message }), 'error');
    }
  });

  // 停止代理
  stopBtn.addEventListener('click', async () => {
    dropdown.style.display = 'none';
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = storage.pairedAgents || [];
    const active = agents.find(a => a.id === storage.activeAgentId);
    const name = active?.name || t('sidePanel.unknownAgent');
    const url = active?.url || t('sidePanel.unknownAgent');
    const confirmed = await window.showCustomConfirm(
      t('sidePanel.stopAgentConfirm', { name, url }),
      t('sidePanel.stopAgentTitle')
    );
    if (!confirmed) return;
    try {
      chrome.runtime.sendMessage({ type: 'AGENT_STOP' }, async (response) => {
        if (response?.success) {
          showToast(t('sidePanel.agentStopped'), 'success');
          // 立即更新 UI 为未连接状态，不等 30s 健康检查（skipPing 避免误恢复）
          state.agentPlatform = { ...state.agentPlatform, connected: false };
          await updateAgentIndicator(state.agentPlatform, true);
          if (active?.id) updateAgentItemOnlineStatus(active.id, false);
        } else {
          showToast(t('sidePanel.stopFailed', { error: response?.error || t('sidePanel.unknownError') }), 'error');
        }
      });
    } catch (err) {
      showToast(t('sidePanel.stopRequestFailed', { error: err.message }), 'error');
    }
  });

  // 刷新代理在线状态
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      // 将所有代理项设为"检测中..."
      document.querySelectorAll('.agent-dd-item-dot').forEach(dot => {
        dot.classList.remove('online', 'offline');
        dot.classList.add('checking');
      });
      document.querySelectorAll('.agent-dd-item-status').forEach(s => {
        s.textContent = t('sidePanel.agentChecking');
      });
      await pingAllAgents();
      showToast(t('sidePanel.agentStatusRefreshed'), 'success');
    });
  }

  // 代理列表操作（事件委托）
  document.getElementById('agentDdList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.agent-dd-tool-btn');
    const item = e.target.closest('.agent-dd-item');

    if (btn) {
      // 点击工具栏按钮
      e.stopPropagation();
      handleAgentDdAction(btn.dataset.action, btn.dataset.id);
      return;
    }

    // 点击列表项本身（非按钮区域）：非停用且非活跃代理 → 切换
    if (item && !item.classList.contains('disabled') && !item.classList.contains('active')) {
      e.stopPropagation();
      handleAgentDdAction('switch', item.dataset.agentId);
    }
  });

  /**
   * 处理代理下拉列表操作
   */
  async function handleAgentDdAction(action, agentId) {
    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    let agents = storage.pairedAgents || [];

    switch (action) {
      case 'enable': {
        // 仅启用：设置 disabled=false，不改变 activeAgentId
        agents = agents.map(a => a.id === agentId ? { ...a, disabled: false } : a);
        await chrome.storage.local.set({ pairedAgents: agents });
        break;
      }
      case 'disable': {
        // 仅停用：设置 disabled=true，不改变 activeAgentId
        agents = agents.map(a => a.id === agentId ? { ...a, disabled: true } : a);
        let newActiveId = storage.activeAgentId;
        // 如果停用的是当前活跃代理，自动切到下一个可用代理
        if (storage.activeAgentId === agentId) {
          const nextActive = agents.find(a => a.id !== agentId && !a.disabled);
          newActiveId = nextActive?.id || null;
        }
        await chrome.storage.local.set({ pairedAgents: agents, activeAgentId: newActiveId || '' });
        if (newActiveId) {
          chrome.runtime.sendMessage({ type: 'AGENT_CONNECTION_CHANGED', connected: true, agentId: newActiveId });
        } else {
          chrome.runtime.sendMessage({ type: 'AGENT_CONNECTION_CHANGED', connected: false });
        }
        break;
      }
      case 'switch': {
        await chrome.storage.local.set({ activeAgentId: agentId });
        chrome.runtime.sendMessage({ type: 'AGENT_CONNECTION_CHANGED', connected: true, agentId });
        break;
      }
      case 'disconnect': {
        // 仅取消激活，保留配对信息，下次可重新切换
        await chrome.storage.local.set({ activeAgentId: '' });
        chrome.runtime.sendMessage({ type: 'AGENT_CONNECTION_CHANGED', connected: false });
        break;
      }
      case 'delete': {
        const agent = agents.find(a => a.id === agentId);
        const confirmed = await window.showCustomConfirm(
          t('sidePanel.deleteAgentTitle'),
          t('sidePanel.deleteAgentConfirm', { name: agent?.name || agentId })
        );
        if (!confirmed) return;
        agents = agents.filter(a => a.id !== agentId);
        const newActive = storage.activeAgentId === agentId
          ? (agents.find(a => !a.disabled)?.id || null)
          : storage.activeAgentId;
        await chrome.storage.local.set({ pairedAgents: agents, activeAgentId: newActive || '' });
        if (newActive) {
          chrome.runtime.sendMessage({ type: 'AGENT_CONNECTION_CHANGED', connected: true, agentId: newActive });
        } else {
          chrome.runtime.sendMessage({ type: 'AGENT_CONNECTION_CHANGED', connected: false });
        }
        break;
      }
    }
    // 关闭下拉
    const dropdown = document.getElementById('headerAgentDropdown');
    if (dropdown) dropdown.style.display = 'none';
  }
}

// 会话 DOM 缓存：切会话时缓存静态 DOM，避免全量重建
// key: sessionId, value: innerHTML 字符串
const sessionDOMCache = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  // 初始化国际化（读取语言偏好 + 跨环境同步监听）
  await initI18n();
  applyI18n();
  subscribe(() => applyI18n());

  // 存储表格数据供工具栏按钮使用
  window.__tableBlocks = [];

  // 获取当前激活的 Tab ID
  await getCurrentActiveTabId();

  // 恢复持久化的 pendingCallApiSessionIds（Side Panel 重开后不丢失后台任务状态）
  await restorePendingSessionsFromStorage();
  // 恢复"任务已完成待查看"的会话标记，刷新后仍能提示用户
  await restoreCompletedSessions();

  // 监听选中文本 AI 搜索消息（来自 background）
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CLOSE_SIDEPANEL') {
      // 来自全局快捷键 _toggle_sidepanel：关闭 Side Panel 自身
      logger.debug('[SidePanel] recei to  CLOSE_SIDEPANEL,closesidebar');
      try { window.close(); } catch (e) { /* 忽略 */ }
      return;
    }
    if (message.type === 'SELECTION_AI_SEARCH' && message.prompt) {
      logger.debug('[SidePanel] received selectedtext AI search:', message.selectedText?.substring(0, 50));
      if (message.selectedText) {
        setSelectedContext(message.selectedText);
      }
      triggerSelectionSearch(message.prompt, message.selectedText);
      // 清除存储的待处理搜索
      chrome.storage.session.remove('pendingSelectionSearch').catch(() => {});
    }
    if (message.type === 'FILL_SIDEPANEL_INPUT' && message.text) {
      logger.debug('[SidePanel] received follow-upfill:', message.text?.substring(0, 50));
      fillSidePanelInput(message.text);
      // 清除存储的待填充文本
      chrome.storage.session.remove('pendingFillInput').catch(() => {});
    }
    if (message.type === 'DIRECT_SEND' && message.text) {
      logger.debug('[SidePanel] received directsend:', message.text?.substring(0, 50));
      if (message.selectedText) {
        setSelectedContext(message.selectedText);
      }
      directSend(message.text, message.selectedText || '');
      // 清除存储的待发送文本
      chrome.storage.session.remove('pendingDirectSend').catch(() => {});
    }
    if (message.type === 'AGENT_STATUS_CHANGE') {
      logger.debug('[SidePanel] recei to  Agent status change:', message.connected, message.status);
      // 直接使用消息中的 connected 值，不重新读 storage（storage 可能是过期状态）
      state.agentPlatform = { ...state.agentPlatform, connected: message.connected };
      updateAgentIndicator(state.agentPlatform);
      updateFileInputVisibility();
      // Agent 连接状态变化后，刷新工具弹窗（agent_/mcp_ 工具的可见性会变）
      refreshToolPopupIfOpen();
      // 从断开变为连接时，刷新完整平台信息
      if (message.connected) {
        refreshAgentPlatformInfo();
      }
    }
    if (message.type === 'AGENT_CONNECTION_CHANGED') {
      // 选项页配对/断开/切换时更新
      logger.debug('[SidePanel] recei to  Agent connection statuschanged:', message.connected, message.agentId);

      if (!message.connected) {
        state.agentPlatform = { connected: false };
        updateAgentIndicator(state.agentPlatform);
        updateFileInputVisibility();
        refreshToolPopupIfOpen();
        return;
      }

      // connected = true：不立即显示绿色，先验证连通性
      if (message.agentId) {
        (async () => {
          try {
            const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
            const agents = storage.pairedAgents || [];
            const active = agents.find(a => a.id === storage.activeAgentId && !a.disabled);

            if (!active) {
              state.agentPlatform = { connected: false };
              updateAgentIndicator(state.agentPlatform);
              updateFileInputVisibility();
              refreshToolPopupIfOpen();
              resetAndRefreshWorkspace();
              return;
            }

            // 已配对的 Agent 有 token，优先调用认证接口获取完整信息
            if (active.token) {
              try {
                const detailResp = await fetch(`${active.url}/api/status/detail`, {
                  cache: 'no-cache',
                  headers: { 'Authorization': `Bearer ${active.token}` }
                });
                if (detailResp.ok) {
                  const data = await detailResp.json();
                  if (data.success) {
                    state.agentPlatform = {
                      platformName: data.platformName || 'Unknown',
                      platform: data.platform || 'unknown',
                      arch: data.arch || 'unknown',
                      shell: data.shell || '/bin/sh',
                      homeDir: data.homeDir || '',
                      workdir: data.workdir || '',
                      connected: true
                    };
                    // 缓存活跃代理的版本号、工作目录、用户主目录和系统信息
                    if (data.version) {
                      state.agentVersions.set(storage.activeAgentId, data.version);
                    }
                    if (data.workdir) {
                      state.agentWorkdirs.set(storage.activeAgentId, data.workdir);
                    }
                    if (data.homeDir) {
                      state.agentHomeDirs.set(storage.activeAgentId, data.homeDir);
                    }
                    const sysInfo2 = formatSystemInfo(data.platformName || data.platform, data.arch);
                    if (sysInfo2) {
                      state.agentSystemInfos.set(storage.activeAgentId, sysInfo2);
                    }
                  } else {
                    state.agentPlatform = { connected: false };
                  }
                } else {
                  state.agentPlatform = { connected: false };
                }
              } catch {
                state.agentPlatform = { connected: false };
              }
            } else {
              // 无 token 时回退到无认证接口（兼容未配对场景）
              try {
                const statusResp = await fetch(`${active.url}/api/status`, { cache: 'no-cache' });
                if (statusResp.ok) {
                  const statusData = await statusResp.json();
                  state.agentPlatform = {
                    platformName: statusData.platformName || 'Unknown',
                    platform: statusData.platform || 'unknown',
                    arch: statusData.arch || 'unknown',
                    shell: statusData.shell || '/bin/sh',
                    homeDir: statusData.homeDir || '',
                    workdir: statusData.workdir || '',
                    connected: true
                  };
                  // 缓存活跃代理的版本号和系统信息
                  if (statusData.version) {
                    state.agentVersions.set(storage.activeAgentId, statusData.version);
                  }
                  const sysInfo3 = formatSystemInfo(statusData.platformName || statusData.platform, statusData.arch);
                  if (sysInfo3) {
                    state.agentSystemInfos.set(storage.activeAgentId, sysInfo3);
                  }
                } else {
                  state.agentPlatform = { connected: false };
                }
              } catch {
                state.agentPlatform = { connected: false };
              }
            }
          } catch {
            state.agentPlatform = { connected: false };
          }
          updateAgentIndicator(state.agentPlatform);
          updateFileInputVisibility();
          refreshToolPopupIfOpen();
          // 代理切换后重置并刷新工作目录
          resetAndRefreshWorkspace();
        })();
      }
    }
    if (message.type === 'SCREENSHOT_RESULT' && message.dataUrl) {
      logger.debug('[SidePanel] received pageshortcutscreenshotresult:', message.mode);
      handlePageScreenshotResult(message.dataUrl, message.mode, message.rect);
    }
  });

  // 检查是否有待处理的选中文本搜索（Side Panel 刚打开时）
  const stored = await chrome.storage.session.get('pendingSelectionSearch');
  if (stored.pendingSelectionSearch && stored.pendingSelectionSearch.selectedText) {
    const { prompt, selectedText } = stored.pendingSelectionSearch;
    logger.debug('[SidePanel] pending selected textsearch:', selectedText?.substring(0, 50));
    setSelectedContext(selectedText);
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
    logger.debug('[SidePanel] pending fill trackasktext:', text?.substring(0, 50));
    setTimeout(() => {
      fillSidePanelInput(text);
    }, 500);
    await chrome.storage.session.remove('pendingFillInput');
  }
  
  // 检查是否有待直接发送的文本（Side Panel 刚打开时）
  const sendStored = await chrome.storage.session.get('pendingDirectSend');
  if (sendStored.pendingDirectSend && sendStored.pendingDirectSend.text) {
    const { text, selectedText } = sendStored.pendingDirectSend;
    logger.debug('[SidePanel] pending directsend text:', text?.substring(0, 50));
    if (selectedText) {
      setSelectedContext(selectedText);
    }
    setTimeout(() => {
      directSend(text, selectedText || '');
    }, 500);
    await chrome.storage.session.remove('pendingDirectSend');
  }

  // 监听 Tab 切换事件,更新当前 Tab ID
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    logger.debug('[SidePanel] Tab switch, new  Tab ID:', activeInfo.tabId);
    state.currentTabId = activeInfo.tabId;
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === 'complete' && state.currentTabId === tabId) {
      logger.debug('[SidePanel] current Tab page update:', changeInfo);
    }
  });

  // 初始化 marked
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
    logger.debug('[SidePanel] Marked library loaded');
  }

  // 初始化 mermaid
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });
    logger.debug('[SidePanel] Mermaid library loaded');
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
    // 同步更新下拉弹出框定位
    updateDropdownPosition();
  }

  // 加载保存的温度设置（仅默认 Agent 使用全局存储值，自定义 Agent 由 loadChatHistory 设置）
  chrome.storage.local.get(['temperature', 'topP', 'selectedTempIndex'], (result) => {
    if (!state.activeAgentId || state.activeAgentId === 'default') {
      if (result.temperature !== undefined) state.temperature = result.temperature;
      if (result.topP !== undefined) state.topP = result.topP;
      if (result.selectedTempIndex !== undefined) state.selectedTempIndex = result.selectedTempIndex;
    }

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

  // 根据当前温度找到最匹配的预设档位
  function getClosestTempPreset() {
    let closestIndex = 0;
    let minDiff = Math.abs(PRESET_MODES[0].temp - state.temperature);
    for (let i = 1; i < PRESET_MODES.length; i++) {
      const diff = Math.abs(PRESET_MODES[i].temp - state.temperature);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    return closestIndex;
  }

  // 渲染温度预设列表
  function renderTempPresets() {
    const selectedIndex = getClosestTempPreset();
    tempPresetList.innerHTML = PRESET_MODES.map((mode, index) => `
      <div class="temp-preset-item ${index === selectedIndex ? 'selected' : ''}" data-index="${index}">
        <div class="temp-preset-radio"></div>
        <div class="temp-preset-info">
          <div class="temp-preset-name">${t(mode.labelKey)}</div>
          <div class="temp-preset-desc" title="${t(mode.tipKey)}">${t(mode.tipKey)}</div>
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

    saveTempToAgentOrGlobal(state.temperature, state.topP, state.selectedTempIndex);
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

    renderTempPresets();

    saveTempToAgentOrGlobal(state.temperature, state.topP, getClosestTempPreset());
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
    const tempIconValueEl = document.getElementById('tempIconValue');
    if (tempIconValueEl) tempIconValueEl.textContent = val.toFixed(2);

    renderTempPresets();

    saveTempToAgentOrGlobal(state.temperature, state.topP, getClosestTempPreset());
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
          state.lastSelectedText = selectedText;
          state.currentSelectionRange = selection.getRangeAt(0).cloneRange();

          setSelectedContext(selectedText);

          showFloatingMenu(selection, selectedText, state.lastMouseX, state.lastMouseY);
        }
      } else {
        if (!chatContainerEl.contains(selection.anchorNode)) {
          state.lastSelectedText = '';
          state.currentSelectionRange = null;
          window.hideFloatingMenu();
        }
      }
    }, 50);
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
              console.debug('[SidePanel] content script not loaded or unreachable:', chrome.runtime.lastError.message);
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
  chrome.storage.local.get(['modelName', 'customModels', 'customPrompts', 'systemPrompt', 'inputHistory', 'agentPlatform', 'enableImageInput', 'imageModelName', 'imageApiBase', 'imageApiKey', 'enableFileInput'], (result) => {
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
    // 触发一次实时代理健康检查，同时主动验证活跃代理连通性
    chrome.runtime.sendMessage({ type: 'TRIGGER_AGENT_HEALTH_CHECK' }).catch(() => {});
    verifyActiveAgentConnectivity();
    // 图片识别配置
    state.enableImageInput = result.enableImageInput || false;
    state.imageModelName = result.imageModelName || '';
    state.imageApiBase = result.imageApiBase || '';
    state.imageApiKey = result.imageApiKey || '';
    // 文件上传配置
    state.enableFileInput = true;
    updateImagePreviewVisibility();
    updateFileInputVisibility();
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
      if (changes.enableFileInput) {
        state.enableFileInput = changes.enableFileInput.newValue;
        updateFileInputVisibility();
      }
      if (changes.enableExecutionLog) {
        state.chatConfig.enableExecutionLog = changes.enableExecutionLog.newValue;
      }
      if (changes.systemPrompt) {
        state.systemPrompt = changes.systemPrompt.newValue || '';
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

  // 自动聚焦输入框
  const userInputEl = document.getElementById('userInput');
  if (userInputEl) userInputEl.focus();

  // 监听会话切换事件（由 session-manager-ui.js 触发）
  document.addEventListener('session-switched', (e) => {
    const { sessionId, previousSessionId } = e.detail || {};
    const chatContainerEl = document.getElementById('chatContainer');
    const userInput = document.getElementById('userInput');
    if (!chatContainerEl) return;

    // 缓存离开的会话 DOM（无流式任务时缓存，流式元素已被 detach 不在 DOM 中）
    // 如果当前会话有 resumable 消息（恢复卡片），不缓存（避免缓存中包含不完整的恢复卡片）
    const hasResumable = previousSessionId && state.messageHistory?.some(msg => msg.resumable);
    if (previousSessionId && !state.pendingCallApiSessionIds.has(previousSessionId) && !hasResumable) {
      sessionDOMCache.set(previousSessionId, chatContainerEl.innerHTML);
    }

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

    // 根据目标会话的生成状态更新按钮（停止模式或发送模式）
    updateSendBtnState();
    if (userInput) userInput.focus();

    const hasPendingTask = state.pendingCallApiSessionIds.has(sessionId) && !!state.pendingCancelApi;
    const cachedHTML = sessionDOMCache.get(sessionId);
    const hasMessages = state.messageHistory && state.messageHistory.length > 0;

    // 缓存命中：无流式任务且有消息 → 直接从缓存恢复（跳过全量 DOM 重建）
    if (cachedHTML && !hasPendingTask && hasMessages) {
      chatContainerEl.innerHTML = cachedHTML;
      rebindAllMessages(chatContainerEl);
      renderMermaidCharts();
      addCodeCopyButtons();

      // 恢复滚动位置（收藏定位时跳过，由 navigateToBookmark 自行处理）
      if (!e.detail?.skipScrollRestore) {
        const scrollKey = 'scrollPosition_' + (sessionId || 'default');
        chrome.storage.local.get([scrollKey], (result) => {
          if (result[scrollKey] !== undefined) {
            setTimeout(() => {
              const el = document.getElementById('chatContainer');
              if (el) el.scrollTop = result[scrollKey];
            }, 150);
          }
        });
      }
      // 检查被遗弃的 checkpoint
      _checkForAbandonedCheckpoint();
      return;
    }

    // 缓存未命中或不可用：走全量重建路径
    chatContainerEl.innerHTML = '';

    if (!hasMessages) {
      const welcomeDiv = document.createElement('div');
      welcomeDiv.className = 'welcome-message';
      welcomeDiv.innerHTML = `
        <div class="icon-wrapper">
          <div class="icon">💬</div>
        </div>
        <h2>${t('sidePanel.welcomeTitle')}</h2>
        <p>${t('sidePanel.welcomeSubtitle')}</p>
      `;
      chatContainerEl.appendChild(welcomeDiv);
    } else {
      state.messageHistory.forEach(msg => {
        if (msg.htmlContent) {
          restoreMessageFromHtml(msg.htmlContent, msg.messageId, msg.resumable);
        } else {
          addMessage(msg.role, msg.content, false, msg.executionLog || [], msg.reflectionScore, msg.wasRevised, null, msg.messageId);
        }
      });
      // 统一绑定事件委托（避免逐条消息重复绑定）
      bindExecutionLogDelegate();
      bindReflectionBadgeDelegate();
      renderMermaidCharts();
      addCodeCopyButtons();

      // 初次构建后缓存当前会话 DOM
      const isStreamingSession = state.pendingCallApiSessionIds.has(sessionId);
      if (!isStreamingSession) {
        sessionDOMCache.set(sessionId, chatContainerEl.innerHTML);
      }

      // 检查被遗弃的 checkpoint（页面关闭/刷新导致任务中断）
      _checkForAbandonedCheckpoint();
    }

    // 如果切回的会话有正在执行的后台流式任务，重建流式元素以恢复实时输出
    logger.debug('[SidePanel] session-switched: pendingTask?', hasPendingTask, 'pendingSessionIds:', [...state.pendingCallApiSessionIds], 'activeSessionId:', sessionId, 'hasCancelApi:', !!state.pendingCancelApi);
    if (hasPendingTask) {
      logger.debug('[SidePanel] switch back tobackground task session,rebuildstreamingoutput element');
      reconnectStreamingElement(sessionId);
    }

    // 恢复该会话的滚动位置（收藏定位时跳过，由 navigateToBookmark 自行处理）
    if (!e.detail?.skipScrollRestore) {
      const scrollKey = 'scrollPosition_' + (sessionId || 'default');
      chrome.storage.local.get([scrollKey], (result) => {
        if (result[scrollKey] !== undefined) {
          setTimeout(async () => {
            const el = document.getElementById('chatContainer');
            if (el) el.scrollTop = result[scrollKey];
            // 恢复滚动位置后更新"滚动到底部"按钮状态
            const { updateScrollButtonState } = await import('./chat-streaming.js');
            updateScrollButtonState();
          }, 150);
        }
      });
    }
  });

  // 监听后台流式任务完成事件，清除对应会话的 DOM 缓存
  document.addEventListener('session-cache-invalidate', (e) => {
    const { sessionId } = e.detail || {};
    if (sessionId) {
      sessionDOMCache.delete(sessionId);
    }
  });

  // 模型选项点击事件（现在在tempDropdown内）
  document.querySelectorAll('.model-option').forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = option.dataset.value;
      state.currentModel = value;
      updateModelSelection(value);
      saveModelToAgentOrGlobal(value);
    });
  });

  // 监听 Agent 切换后模型/温度变化，更新 UI
  document.addEventListener('agent-model-changed', () => {
    updateModelSelection(state.currentModel);
    // 温度 UI 更新
    const tempSlider = document.getElementById('tempSlider');
    const tempNumberInput = document.getElementById('tempNumberInput');
    const tempIconValueEl = document.getElementById('tempIconValue');
    if (tempSlider) tempSlider.value = state.temperature;
    if (tempNumberInput) tempNumberInput.value = state.temperature.toFixed(2);
    if (tempIconValueEl) tempIconValueEl.textContent = state.temperature.toFixed(2);
    // 刷新温度预设高亮
    renderTempPresets();
  });

  // 点击其他地方关闭下拉框和浮动菜单
  document.addEventListener('click', (e) => {
    const promptDropdown = document.getElementById('promptDropdown');
    const promptSelector = document.getElementById('promptSelector');
    const agentAtSelector = document.getElementById('agentAtSelector');
    const selectionFloatingMenu = document.getElementById('selectionFloatingMenu');

    if (!promptSelector.contains(e.target)) {
      promptDropdown.classList.remove('show');
      hidePromptSelector();
    }

    if (agentAtSelector && !agentAtSelector.contains(e.target)) {
      hideAgentAtSelector();
    }

    const fileAtSelector = document.getElementById('fileAtSelector');
    if (fileAtSelector && !fileAtSelector.contains(e.target)) {
      hideFileAtSelector();
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

  // 发送/停止按钮共用：根据生成状态切换图标和行为
  const SEND_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z"/></svg>';
  const STOP_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>';

  function updateSendBtnState() {
    if (state.isGenerating) {
      // 切换为停止按钮
      sendBtn.classList.add('stop-mode');
      sendBtn.innerHTML = STOP_ICON;
      sendBtn.title = t('sidePanel.sendBtnStop');
      sendBtn.disabled = false;
    } else {
      // 恢复为发送按钮
      sendBtn.classList.remove('stop-mode');
      sendBtn.innerHTML = SEND_ICON;
      sendBtn.title = t('sidePanel.sendBtnSend');
      sendBtn.disabled = false;
      sendBtn.style.opacity = '';
      sendBtn.style.cursor = '';
    }
  }

  // 发送/停止按钮点击事件
  sendBtn.addEventListener('click', () => {
    if (state.isGenerating) {
      // 停止模式：触发取消
      cancelStreamingTask(sendBtn);
    } else {
      // 发送模式
      sendMessage();
    }
  });

  // 监听生成状态变化，自动切换按钮
  document.addEventListener('generating-state-changed', updateSendBtnState);

  // 提示词触发按钮点击事件 - 切换显示/隐藏提示词选择器
  const promptTriggerBtn = document.getElementById('promptTriggerBtn');
  if (promptTriggerBtn) {
    promptTriggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      promptTriggerBtn.blur();
      if (e.ctrlKey || e.metaKey) {
        const input = document.getElementById('userInput');
        if (input) input.focus();
        hidePromptSelector();
        hideFileAtSelector();
        showAgentAtSelector('');
      } else {
        hideAgentAtSelector();
        hideFileAtSelector();
        togglePromptSelector();
      }
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

  // 在对话消息之间跳转：direction = 'prev' | 'next'；toEnd = true 时直接跳到第一条/最后一条
  function jumpToMessage(direction, toEnd) {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;

    const messages = chatContainer.querySelectorAll('.message.user, .message.assistant, .user-context-bubble');

    // 快速回到顶部/底部（Ctrl/Cmd+点击 或 Alt+Ctrl/Cmd+方向键）
    if (toEnd) {
      if (messages.length === 0) return;
      if (direction === 'prev') {
        messages[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        messages[messages.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    if (messages.length === 0) return;

    const containerRect = chatContainer.getBoundingClientRect();
    const viewportTop = containerRect.top;
    const threshold = 10; // 小阈值避免重复定位到同一条消息

    // 找到当前视口中第一条可见消息
    let currentIndex = -1;
    for (let i = 0; i < messages.length; i++) {
      const rect = messages[i].getBoundingClientRect();
      if (rect.bottom > viewportTop + threshold) {
        currentIndex = i;
        break;
      }
    }

    if (direction === 'prev') {
      // 如果所有消息都在视口上方，则从最后一条开始
      if (currentIndex === -1) {
        currentIndex = messages.length;
      }
      // 跳到前一条
      const targetIndex = currentIndex - 1;
      if (targetIndex >= 0) {
        messages[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      if (currentIndex === -1) return;
      // 跳到下一条
      const targetIndex = currentIndex + 1;
      if (targetIndex < messages.length) {
        messages[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  // 消息跳转按钮：上一条/下一条（Ctrl/Cmd+点击 跳到最顶端/底端，与 Alt+Ctrl/Cmd+方向键快捷键一致）
  const chatNavUp = document.getElementById('chatNavUp');
  const chatNavDown = document.getElementById('chatNavDown');
  if (chatNavUp) {
    chatNavUp.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToMessage('prev', e.ctrlKey || e.metaKey);
    });
  }
  if (chatNavDown) {
    chatNavDown.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToMessage('next', e.ctrlKey || e.metaKey);
    });
  }

  // 消息跳转按钮展开/收起：默认收起为左侧窄条，鼠标移入展开
  const chatNavHotzone = document.getElementById('chatNavHotzone');
  const chatNavButtons = document.getElementById('chatNavButtons');
  if (chatNavHotzone && chatNavButtons) {
    let navHideTimer = null;
    const showChatNav = () => {
      clearTimeout(navHideTimer);
      chatNavButtons.classList.add('expanded');
    };
    const hideChatNav = () => {
      clearTimeout(navHideTimer);
      navHideTimer = setTimeout(() => {
        chatNavButtons.classList.remove('expanded');
      }, 200);
    };
    chatNavHotzone.addEventListener('mouseenter', showChatNav);
    chatNavHotzone.addEventListener('mouseleave', hideChatNav);
    chatNavButtons.addEventListener('mouseenter', showChatNav);
    chatNavButtons.addEventListener('mouseleave', hideChatNav);
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

    // Alt+N ：新建会话
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyN') {
      e.preventDefault();
      newSession();
      return;
    }

    // Alt+W ：关闭当前会话
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyW') {
      e.preventDefault();
      closeCurrentSession();
      return;
    }

    // Alt+E ：编辑最近一条用户消息
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyE') {
      e.preventDefault();
      const userMsgs = document.querySelectorAll('#chatContainer .message.user');
      const lastUserMsg = userMsgs[userMsgs.length - 1];
      if (lastUserMsg) {
        editAndResendMessage(lastUserMsg);
        const input = document.getElementById('userInput');
        if (input) input.focus();
      }
      return;
    }

    // Alt+ArrowUp/ArrowDown 系列快捷键：在对话消息之间快速跳转
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const direction = e.key === 'ArrowUp' ? 'prev' : 'next';
      // Alt+Ctrl/Cmd+ArrowUp/ArrowDown：快速回到顶部/底部
      jumpToMessage(direction, e.ctrlKey || e.metaKey);
      return;
    }
  });

  // 输入框回车发送（Shift+Enter 换行）
  userInput.addEventListener('keydown', (e) => {
    const promptSelector = document.getElementById('promptSelector');
    const promptDropdown = document.getElementById('promptDropdown');
    const agentAtSelector = document.getElementById('agentAtSelector');
    const agentAtDropdown = document.getElementById('agentAtDropdown');

    // ========== @ Agent/网页 选择器键盘处理 ==========
    if (agentAtSelector.style.display !== 'none' && agentAtDropdown.classList.contains('show')) {
      const agentAtTabs = document.getElementById('agentAtTabs');
      const isMerged = agentAtTabs && agentAtTabs.classList.contains('merged-mode');

      // Tab 键切换标签（仅在非合并模式下）
      if (!isMerged && e.key === 'Tab') {
        e.preventDefault();
        if (activeAtTab === 'pages') {
          switchAtTab('agents');
        } else if (activeAtTab === 'agents') {
          switchAtTab('proxies');
        } else {
          switchAtTab('pages');
        }
        return;
      }

      // 获取当前列表容器
      let listContainer, selectedIndex;
      if (isMerged) {
        // 合并模式：使用 agentAtList
        listContainer = document.getElementById('agentAtList');
        selectedIndex = state.selectedAgentAtIndex;
      } else if (activeAtTab === 'pages') {
        listContainer = document.getElementById('agentPageList');
        selectedIndex = state.selectedPageIndex;
      } else if (activeAtTab === 'proxies') {
        listContainer = document.getElementById('agentProxyList');
        selectedIndex = state.selectedProxyAtIndex;
      } else {
        listContainer = document.getElementById('agentAtList');
        selectedIndex = state.selectedAgentAtIndex;
      }

      const items = listContainer ? listContainer.querySelectorAll('.prompt-item') : [];
      const visibleCount = items.length;

      if (visibleCount === 0) {
        // no items, pass through
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newIdx = selectedIndex < 0 ? 0 : (selectedIndex + 1) % visibleCount;
        if (activeAtTab === 'proxies') {
          state.selectedProxyAtIndex = newIdx;
          updateAgentAtSelection(items);
        } else if (isMerged) {
          state.selectedAgentAtIndex = newIdx;
          updateAgentAtSelection(items);
        } else if (activeAtTab === 'pages') {
          state.selectedPageIndex = newIdx;
          updatePageSelection(items);
        } else {
          state.selectedAgentAtIndex = newIdx;
          updateAgentAtSelection(items);
        }
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newIdx = selectedIndex < 0 ? visibleCount - 1 : (selectedIndex === 0 ? visibleCount - 1 : selectedIndex - 1);
        if (activeAtTab === 'proxies') {
          state.selectedProxyAtIndex = newIdx;
          updateAgentAtSelection(items);
        } else if (isMerged) {
          state.selectedAgentAtIndex = newIdx;
          updateAgentAtSelection(items);
        } else if (activeAtTab === 'pages') {
          state.selectedPageIndex = newIdx;
          updatePageSelection(items);
        } else {
          state.selectedAgentAtIndex = newIdx;
          updateAgentAtSelection(items);
        }
        return;
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        items[selectedIndex].click();
        return;
      } else if (e.key === 'Escape') {
        hideAgentAtSelector();
        return;
      }
    }

    // ========== $ 工作目录文件选择器键盘处理 ==========
    const fileAtSelector = document.getElementById('fileAtSelector');
    const fileAtDropdown = document.getElementById('fileAtDropdown');
    if (fileAtSelector && fileAtDropdown && fileAtSelector.style.display !== 'none' && fileAtDropdown.classList.contains('show')) {
      const fileAtList = document.getElementById('fileAtList');
      const fileItems = fileAtList ? fileAtList.querySelectorAll('.prompt-item') : [];
      const fileCount = fileItems.length;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // 选择器打开时方向键不落入历史输入导航
        e.preventDefault();
        if (fileCount > 0) {
          const newIdx = e.key === 'ArrowDown'
            ? (state.selectedFileAtIndex < 0 ? 0 : (state.selectedFileAtIndex + 1) % fileCount)
            : (state.selectedFileAtIndex < 0 ? fileCount - 1 : (state.selectedFileAtIndex === 0 ? fileCount - 1 : state.selectedFileAtIndex - 1));
          state.selectedFileAtIndex = newIdx;
          updateFileAtSelection(fileItems);
        }
        return;
      }

      if (e.key === 'Enter' && fileCount > 0 && state.selectedFileAtIndex >= 0) {
        e.preventDefault();
        fileItems[state.selectedFileAtIndex].click();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        hideFileAtSelector();
        return;
      }
    }

    // ========== / 提示词选择器键盘处理 ==========
    if (promptSelector.style.display !== 'none' && promptDropdown.classList.contains('show')) {
      // 合并列表模式（搜索时）
      if (state.showMergedList) {
        const mergedItems = promptDropdown.querySelectorAll('#promptList .prompt-item');
        const visibleCount = mergedItems.length;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (state.selectedPromptIndex < 0) {
            state.selectedPromptIndex = 0;
          } else {
            state.selectedPromptIndex = (state.selectedPromptIndex + 1) % visibleCount;
          }
          updatePromptSelection(mergedItems);
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
          updatePromptSelection(mergedItems);
          return;
        }

        if (e.key === 'Enter' && state.selectedPromptIndex >= 0) {
          e.preventDefault();
          const selected = mergedItems[state.selectedPromptIndex];
          if (selected.dataset.type === 'skill') {
            // 技能：触发点击选中
            selected.click();
          } else if (selected.dataset.type === 'mcp') {
            // MCP 服务：触发点击选中
            selected.click();
          } else if (e.ctrlKey || e.metaKey) {
            insertPromptToInputByCode(selected.dataset.code);
          } else {
            sendPromptByCode(selected.dataset.code);
          }
          return;
        }

        if (e.key === 'Escape') {
          hidePromptSelector();
          return;
        }
        return;
      }

      // 技能 Tab 键盘处理
      if (state.activeDropdownTab === 'skills') {
        const skillItems = promptDropdown.querySelectorAll('#skillList .skill-list-item');
        const visibleCount = skillItems.length;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (state.selectedSkillIndex < 0) {
            state.selectedSkillIndex = 0;
          } else {
            state.selectedSkillIndex = (state.selectedSkillIndex + 1) % visibleCount;
          }
          updateSkillSelection(skillItems);
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (state.selectedSkillIndex < 0) {
            state.selectedSkillIndex = visibleCount - 1;
          } else if (state.selectedSkillIndex === 0) {
            state.selectedSkillIndex = visibleCount - 1;
          } else {
            state.selectedSkillIndex = state.selectedSkillIndex - 1;
          }
          updateSkillSelection(skillItems);
          return;
        }

        if (e.key === 'Enter' && state.selectedSkillIndex >= 0) {
          e.preventDefault();
          skillItems[state.selectedSkillIndex].click();
          return;
        }

        if (e.key === 'Escape') {
          hidePromptSelector();
          return;
        }

        // Tab 键切换 Tab
        if (e.key === 'Tab') {
          e.preventDefault();
          const mcpTab = document.getElementById('mcpTab');
          if (mcpTab && mcpTab.style.display !== 'none') {
            switchDropdownTab('mcp');
          } else {
            switchDropdownTab('prompts');
          }
          return;
        }
        return; // 其他按键在技能 Tab 下不处理
      }

      // MCP Tab 键盘处理
      if (state.activeDropdownTab === 'mcp') {
        const mcpItems = promptDropdown.querySelectorAll('#mcpList .mcp-list-item');
        const visibleCount = mcpItems.length;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (state.selectedMcpServiceIndex < 0) {
            state.selectedMcpServiceIndex = 0;
          } else {
            state.selectedMcpServiceIndex = (state.selectedMcpServiceIndex + 1) % visibleCount;
          }
          updateMcpSelection(mcpItems);
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (state.selectedMcpServiceIndex < 0) {
            state.selectedMcpServiceIndex = visibleCount - 1;
          } else if (state.selectedMcpServiceIndex === 0) {
            state.selectedMcpServiceIndex = visibleCount - 1;
          } else {
            state.selectedMcpServiceIndex = state.selectedMcpServiceIndex - 1;
          }
          updateMcpSelection(mcpItems);
          return;
        }

        if (e.key === 'Enter' && state.selectedMcpServiceIndex >= 0) {
          e.preventDefault();
          mcpItems[state.selectedMcpServiceIndex].click();
          return;
        }

        if (e.key === 'Escape') {
          hidePromptSelector();
          return;
        }

        // Tab 键切换 Tab
        if (e.key === 'Tab') {
          e.preventDefault();
          switchDropdownTab('prompts');
          return;
        }
        return; // 其他按键在 MCP Tab 下不处理
      }

      // 提示词 Tab 键盘处理
      const promptItems = promptDropdown.querySelectorAll('#promptList .prompt-item');
      const visibleCount = promptItems.length;

      if (e.key === 'Tab') {
        // Tab 键切换到技能 Tab（如果可见）
        const skillsTab = document.getElementById('skillsTab');
        const mcpTab = document.getElementById('mcpTab');
        if (skillsTab && skillsTab.style.display !== 'none') {
          e.preventDefault();
          switchDropdownTab('skills');
          return;
        }
        if (mcpTab && mcpTab.style.display !== 'none') {
          e.preventDefault();
          switchDropdownTab('mcp');
          return;
        }
      }

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
    const isAgentAtSelectorVisible = agentAtSelector.style.display !== 'none' && agentAtDropdown.classList.contains('show');
    const isFileAtSelectorVisible = fileAtSelector.style.display !== 'none' && fileAtDropdown.classList.contains('show');
    if (!isPromptSelectorVisible && !isAgentAtSelectorVisible && !isFileAtSelectorVisible && !state.isGenerating) {
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
      if (state.isComposing) return;
      e.preventDefault();
      hideFileAtSelector();
      sendMessage();
    }
  });

  // IME 组合输入状态监听（语音输入、中文输入法等的草稿状态）
  userInput.addEventListener('compositionstart', () => {
    state.isComposing = true;
  });
  userInput.addEventListener('compositionend', () => {
    state.isComposing = false;
  });

  // 粘贴图片/文件处理
  userInput.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      // 优先处理图片粘贴
      if (item.type.startsWith('image/') && state.enableImageInput) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          compressAndAttachImage(blob);
        }
        break;
      }
      // 文件粘贴（当启用文件输入时）
      if (item.kind === 'file' && state.enableFileInput) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          attachFiles([file]);
        }
        break;
      }
    }
  });

  // 文件上传按钮
  const fileAttachBtn = document.getElementById('fileAttachBtn');
  const fileInput = document.getElementById('fileInput');
  if (fileAttachBtn && fileInput) {
    fileAttachBtn.addEventListener('click', () => {
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        attachFiles(Array.from(fileInput.files));
        fileInput.value = '';
      }
    });
  }

  // 拖拽上传文件
  const inputWrapper = document.querySelector('.input-wrapper');
  let dragCounter = 0;
  if (inputWrapper) {
    inputWrapper.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      inputWrapper.classList.add('drag-over');
    });
    inputWrapper.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        inputWrapper.classList.remove('drag-over');
      }
    });
    inputWrapper.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    inputWrapper.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      inputWrapper.classList.remove('drag-over');

      // 检查是否从工作目录面板拖过来的文件/目录
      const workspaceData = e.dataTransfer.getData('application/x-workspace-file');
      if (workspaceData) {
        try {
          const { path } = JSON.parse(workspaceData);
          if (path) {
            attachFilesForQuestion([path]);
            return;
          }
        } catch (err) {
          logger.warn('[SidePanel] parse workspace dragdata failed:', err);
        }
      }

      // 系统文件拖拽：图片按截图问答模式处理（缩略图），其他文件走文件问答
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        const images = files.filter(f => f.type.startsWith('image/'));
        const others = files.filter(f => !f.type.startsWith('image/'));
        if (images.length > 0) {
          if (state.enableImageInput) {
            // 与剪贴板粘图一致：压缩并附加为图片消息（缩略图），做图片识别问答
            for (const img of images) {
              await compressAndAttachImage(img);
            }
          } else {
            // 未启用图片识别：回退为文件附件，避免静默丢弃
            showToast(t('sidePanel.imageNotEnabled'));
            attachFiles(images);
          }
        }
        if (others.length > 0) {
          attachFiles(others);
        }
      }
    });
  }

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
        logger.error('[SidePanel] screenshot failed:', err);
        showToast(t('sidePanel.screenshotFailed'));
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

  // 输入框输入事件 - 检查是否需要显示提示词选择器或Agent选择器
  userInput.addEventListener('input', (e) => {
    const value = userInput.value;
    const promptSelector = document.getElementById('promptSelector');
    const promptDropdown = document.getElementById('promptDropdown');
    const agentAtSelector = document.getElementById('agentAtSelector');
    const agentAtDropdown = document.getElementById('agentAtDropdown');

    const lastSlashIndex = value.lastIndexOf('/');
    const lastAtIndex = value.lastIndexOf('@');
    const lastDollarIndex = value.lastIndexOf('$');

    // 优先级：在同一个触发区域（空格后或行首），/、@、$ 都需要在合法位置触发
    // 确定触发符是否在合法位置（且后面没有空格/换行，输入空格表示匹配结束）
    const isTriggerValid = (index) => {
      if (index === -1) return false;
      if (index !== 0 && value[index - 1] !== '\n' && value[index - 1] !== ' ') return false;
      const after = value.substring(index + 1);
      if (after.includes(' ') || after.includes('\n')) return false;
      return true;
    };

    const slashValid = isTriggerValid(lastSlashIndex);
    const atValid = isTriggerValid(lastAtIndex);
    const dollarValid = isTriggerValid(lastDollarIndex);

    // 当多个触发符同时有效时，取最后出现的一个
    let activeTrigger = null;
    if (slashValid) activeTrigger = { key: 'slash', index: lastSlashIndex };
    if (atValid && (!activeTrigger || lastAtIndex > activeTrigger.index)) activeTrigger = { key: 'at', index: lastAtIndex };
    if (dollarValid && (!activeTrigger || lastDollarIndex > activeTrigger.index)) activeTrigger = { key: 'dollar', index: lastDollarIndex };

    if (activeTrigger && activeTrigger.key === 'dollar') {
      // $ 在后面，显示工作目录文件选择器
      hidePromptSelector();
      hideAgentAtSelector();
      const filterText = value.substring(lastDollarIndex + 1);
      showFileAtSelector(filterText);
    } else if (activeTrigger && activeTrigger.key === 'at') {
      // @ 在后面，显示 Agent 选择器
      hidePromptSelector();
      hideFileAtSelector();
      const filterText = value.substring(lastAtIndex + 1);
      showAgentAtSelector(filterText);
    } else if (activeTrigger && activeTrigger.key === 'slash') {
      // / 在后面，显示提示词选择器
      hideAgentAtSelector();
      hideFileAtSelector();
      const filterText = value.substring(lastSlashIndex + 1);
      if (promptSelector.style.display !== 'none' && promptDropdown.classList.contains('show')) {
        updatePromptList(filterText);
      } else {
        showPromptSelector(filterText);
      }
    } else {
      hidePromptSelector();
      hideAgentAtSelector();
      hideFileAtSelector();
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
  
  // 原型页面库按钮
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

  // ==================== 命令执行审计 ====================
  const auditLogBtn = document.getElementById('auditLogBtn');
  const auditLogOverlay = document.getElementById('auditLogOverlay');
  const auditLogClose = document.getElementById('auditLogClose');
  const auditLogRefreshBtn = document.getElementById('auditLogRefreshBtn');
  const auditLogCategoryFilter = document.getElementById('auditLogCategoryFilter');
  const auditLogLimit = document.getElementById('auditLogLimit');
  const auditLogSearch = document.getElementById('auditLogSearch');
  const auditLogSearchClear = document.getElementById('auditLogSearchClear');
  const auditLogLoading = document.getElementById('auditLogLoading');
  const auditLogEmpty = document.getElementById('auditLogEmpty');
  const auditLogList = document.getElementById('auditLogList');

  // 缓存原始查询结果，用于前端搜索过滤
  let auditLogRawEntries = [];

  const CATEGORY_LABELS_MAP = {
    auth: t('sidePanel.auditCategoryAuth'), fs: t('sidePanel.auditCategoryFs'), exec: t('sidePanel.auditCategoryExec'), security: t('sidePanel.auditCategorySecurity'), system: t('sidePanel.auditCategorySystem')
  };
  const LEVEL_LABELS_MAP = { info: 'INFO', warn: 'WARN', error: 'ERROR' };
  const LEVEL_CLASS_MAP = { info: 'audit-level-info', warn: 'audit-level-warn', error: 'audit-level-error' };

  function formatAuditTime(timestamp) {
    if (!timestamp) return '-';
    const d = new Date(timestamp);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function formatAuditDetails(entry) {
    // 提取 action 之外的关键字段
    const skipKeys = new Set(['timestamp', 'level', 'category', 'action']);
    const parts = [];
    for (const [key, val] of Object.entries(entry)) {
      if (skipKeys.has(key)) continue;
      const str = typeof val === 'string' ? val : JSON.stringify(val);
      const display = str.length > 60 ? str.slice(0, 60) + '...' : str;
      parts.push(`${key}: ${display}`);
    }
    return parts.join(t('sidePanel.auditDetailSeparator'));
  }

  async function loadAuditLogs() {
    if (!auditLogLoading || !auditLogEmpty || !auditLogList) return;
    auditLogLoading.style.display = 'block';
    auditLogEmpty.style.display = 'none';
    auditLogList.style.display = 'none';

    const category = auditLogCategoryFilter?.value || null;
    const limit = parseInt(auditLogLimit?.value || '200', 10);

    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'QUERY_AUDIT_LOGS', category, limit }, (response) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(response);
        });
      });

      auditLogLoading.style.display = 'none';

      if (!result || !result.success) {
        auditLogEmpty.style.display = 'block';
        auditLogEmpty.textContent = t('sidePanel.auditQueryFailed', { error: result?.error || t('sidePanel.unknownError') });
        return;
      }

      auditLogRawEntries = result.entries || [];
      renderAuditLogs();
    } catch (err) {
      auditLogLoading.style.display = 'none';
      auditLogEmpty.style.display = 'block';
      auditLogEmpty.textContent = t('sidePanel.auditLoadFailed', { error: err.message });
    }
  }

  function renderAuditLogs() {
    if (!auditLogList) return;
    const keyword = (auditLogSearch?.value || '').trim().toLowerCase();
    let entries = auditLogRawEntries;

    // 前端关键词过滤：匹配 action、category、以及所有 detail 字段的值
    if (keyword) {
      entries = entries.filter((e) => {
        const searchText = [
          e.action || '',
          e.category || '',
          ...Object.entries(e).filter(([k]) => !['timestamp', 'level', 'category', 'action'].includes(k)).map(([, v]) => typeof v === 'string' ? v : JSON.stringify(v))
        ].join(' ').toLowerCase();
        return searchText.includes(keyword);
      });
    }

    // 更新搜索框清除按钮
    if (auditLogSearchClear) {
      auditLogSearchClear.style.display = keyword ? 'block' : 'none';
    }

    auditLogLoading.style.display = 'none';
    if (entries.length === 0) {
      auditLogEmpty.style.display = 'block';
      auditLogEmpty.textContent = keyword ? t('sidePanel.auditNoMatch') : t('sidePanel.auditEmpty');
      auditLogList.style.display = 'none';
      return;
    }

    auditLogEmpty.style.display = 'none';
    auditLogList.style.display = 'block';
    auditLogList.innerHTML = entries.map((entry) => {
      const cat = CATEGORY_LABELS_MAP[entry.category] || entry.category || '-';
      const level = LEVEL_LABELS_MAP[entry.level] || entry.level?.toUpperCase() || 'INFO';
      const levelClass = LEVEL_CLASS_MAP[entry.level] || 'audit-level-info';
      const time = formatAuditTime(entry.timestamp);
      const details = formatAuditDetails(entry);
      return `<div class="audit-entry">
        <div class="audit-entry-header">
          <span class="audit-time">${time}</span>
          <span class="audit-level ${levelClass}">${level}</span>
          <span class="audit-category">${cat}</span>
          <span class="audit-action">${entry.action || '-'}</span>
        </div>
        ${details ? `<div class="audit-details">${details}</div>` : ''}
      </div>`;
    }).join('');
  }

  function showAuditLog() {
    if (auditLogOverlay) {
      auditLogOverlay.style.display = 'flex';
      loadAuditLogs();
    }
  }

  function hideAuditLog() {
    if (auditLogOverlay) auditLogOverlay.style.display = 'none';
  }

  if (auditLogBtn) {
    auditLogBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      headerMoreDropdown.classList.remove('show');
      showAuditLog();
    });
  }

  if (auditLogClose) {
    auditLogClose.addEventListener('click', hideAuditLog);
  }

  if (auditLogRefreshBtn) {
    auditLogRefreshBtn.addEventListener('click', loadAuditLogs);
  }

  if (auditLogCategoryFilter) {
    auditLogCategoryFilter.addEventListener('change', loadAuditLogs);
  }

  if (auditLogLimit) {
    auditLogLimit.addEventListener('change', loadAuditLogs);
  }

  // 搜索框输入过滤（前端筛选，不重新请求后端）
  if (auditLogSearch) {
    auditLogSearch.addEventListener('input', () => {
      renderAuditLogs();
    });
  }

  // 清除搜索框
  if (auditLogSearchClear) {
    auditLogSearchClear.addEventListener('click', () => {
      if (auditLogSearch) auditLogSearch.value = '';
      renderAuditLogs();
    });
  }

  // ==================== 审计日志 END ====================

  // 初始化 Token 统计面板
  initTokenStatsPanel(() => state.activeSessionId, showCustomConfirm);

  // 隔离对话开关（记忆对话）
  const isolateChatBtn = document.getElementById('isolateChatBtn');
  const enableToolsBtn = document.getElementById('enableToolsBtn');
  const toolsConfigBtn = document.getElementById('toolsConfigBtn');

  // 加载保存的状态（每个智能体独立的已启用工具列表）
  const agentToolsKey = `agentEnabledTools_${state.activeAgentId || 'default'}`;
  chrome.storage.local.get([agentToolsKey, 'enabledTools', 'isolateChat', 'enableSelectionQuery', 'enableTools', 'mcpTools'], (result) => {
    // 优先读取 agent-specific key，降级到旧的全局 enabledTools（兼容旧数据）
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

    // 读取当前智能体的工具配置：优先 agent-specific key，降级到全局 enabledTools
    const savedAgentTools = result[agentToolsKey];
    const fallbackTools = result.enabledTools;
    if (savedAgentTools && savedAgentTools.length > 0) {
      // Agent-specific：使用用户保存的列表，仅自动添加新的 MCP 工具
      const mcpTools = result.mcpTools || [];
      const validToolIds = new Set([...BUILTIN_TOOLS.map(t => t.id), ...mcpTools.map(t => t.id)]);
      const savedTools = savedAgentTools.filter(id => validToolIds.has(id));
      const newMcpTools = mcpTools.filter(t => !savedTools.includes(t.id)).map(t => t.id);
      state.enabledTools = [...savedTools, ...newMcpTools];
      if (newMcpTools.length > 0) {
        chrome.storage.local.set({ [agentToolsKey]: state.enabledTools });
      }
    } else if (fallbackTools && fallbackTools.length > 0) {
      // 降级：迁移旧的全局 enabledTools 到当前智能体（保留自动添加新 builtin 工具的行为）
      const mcpTools = result.mcpTools || [];
      const validToolIds = new Set([...BUILTIN_TOOLS.map(t => t.id), ...mcpTools.map(t => t.id)]);
      const savedTools = fallbackTools.filter(id => validToolIds.has(id));
      const newBuiltinTools = BUILTIN_TOOLS.filter(t => t.enabled && !savedTools.includes(t.id)).map(t => t.id);
      const newMcpTools = mcpTools.filter(t => !savedTools.includes(t.id)).map(t => t.id);
      state.enabledTools = [...savedTools, ...newBuiltinTools, ...newMcpTools];
      chrome.storage.local.set({ [agentToolsKey]: state.enabledTools });
    } else {
      const mcpTools = result.mcpTools || [];
      state.enabledTools = [...BUILTIN_TOOLS.filter(t => t.enabled).map(t => t.id), ...mcpTools.map(t => t.id)];
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
    logger.debug('[SidePanel] conv memory:', state.isolateChat ? 'enabled' : 'disabled');
  });

  // 划词问答开关
  const enableSelectionQueryBtn = document.getElementById('enableSelectionQueryBtn');
  if (enableSelectionQueryBtn) {
    enableSelectionQueryBtn.addEventListener('change', () => {
      state.enableSelectionQuery = enableSelectionQueryBtn.checked;
      chrome.storage.local.set({ enableSelectionQuery: state.enableSelectionQuery });
      logger.debug('[SidePanel] text Q&A:', state.enableSelectionQuery ? 'enabled' : 'disabled');

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
        const agentToolsKey = `agentEnabledTools_${state.activeAgentId || 'default'}`;
        chrome.storage.local.set({ [agentToolsKey]: state.enabledTools });
      }

      logger.debug('[SidePanel] tool master switch:', state.useTools ? 'enabled' : 'disabled');
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
  const toolsSearchClear = document.getElementById('toolsSearchClear');

  if (toolsSearchInput) {
    toolsSearchInput.addEventListener('input', (e) => {
      state.currentSearch = e.target.value.toLowerCase();
      // 显示/隐藏清除按钮
      if (toolsSearchClear) {
        toolsSearchClear.style.display = e.target.value ? '' : 'none';
      }
      renderToolsPopupList();
    });
  }

  // 清除搜索按钮
  if (toolsSearchClear) {
    toolsSearchClear.addEventListener('click', () => {
      if (toolsSearchInput) {
        toolsSearchInput.value = '';
        toolsSearchClear.style.display = 'none';
        state.currentSearch = '';
        renderToolsPopupList();
      }
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
        logger.debug('[SidePanel] toolpre-filter toggle updated:', toolsPreselectToggle.checked);
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
      const confirmed = await showCustomConfirm(t('sidePanel.clearStatsConfirm'), t('sidePanel.clearStatsTitle'));
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
      BUILTIN_TOOLS.forEach(tool => {
        toolDescMap[tool.id] = tool.name ? `${tool.name}${t('sidePanel.toolNameDescSeparator')}${tool.description || ''}` : (tool.description || tool.id);
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
        summary.textContent = t('sidePanel.toolStatsSummary', { used: usedCount, unused: unusedCount });
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
      logger.error('[SidePanel] loadstats failed:', err);
      loading.style.display = 'none';
      empty.textContent = t('sidePanel.toolStatsLoadFailed');
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

      const avgTimeStr = formatDuration(avgDuration);

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
      logger.debug('[SidePanel] user clickcloseselected content by button');
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
document.addEventListener('DOMContentLoaded', async () => {
  await loadBookmarks();
  initBookmarkPanel();
  initSearchPanel();
  initAgentDropdown();
  initWorkspacePanel();
  // 收藏加载完成后刷新所有消息的收藏按钮状态（消息可能先于收藏加载渲染）
  const { updateBookmarkButtons, updateBookmarkBadge } = await import('./bookmark-panel.js');
  updateBookmarkButtons();
  updateBookmarkBadge();
});
document.addEventListener('DOMContentLoaded', initPromptEvents);
document.addEventListener('DOMContentLoaded', initSkillIndicatorEvents);
document.addEventListener('DOMContentLoaded', initSkillTabEvents);
document.addEventListener('DOMContentLoaded', initMcpIndicatorEvents);
document.addEventListener('DOMContentLoaded', initPageIndicatorEvents);
document.addEventListener('DOMContentLoaded', initClarifyEvents);
document.addEventListener('DOMContentLoaded', initConfirmEvents);
document.addEventListener('DOMContentLoaded', initPrototypeEvents);
document.addEventListener('DOMContentLoaded', initExportDialogEvents);
document.addEventListener('DOMContentLoaded', () => initAgentManager());
document.addEventListener('DOMContentLoaded', async () => {
  const { refreshAgentNames, initScrollToBottomBtn } = await import('./chat-streaming.js');
  refreshAgentNames();
  initScrollToBottomBtn();
});

// 图片辅助函数（updateImagePreviewVisibility / updateTextareaPadding / updateFileInputVisibility
// / renderImagePreviews / captureFullPageScreenshot / captureRegionScreenshot
// / cropImage / handlePageScreenshotResult）已拆分到 image-helpers.js

// ==================== 脱离/回归侧边栏 ====================
document.addEventListener('DOMContentLoaded', () => {
  const isPopup = new URLSearchParams(window.location.search).has('popup');
  const detachBtn = document.getElementById('detachBtn');
  const attachBtn = document.getElementById('attachBtn');
  const activeBtn = isPopup ? attachBtn : detachBtn;

  if (isPopup) {
    // 独立窗口模式：显示回归按钮
    if (attachBtn) attachBtn.style.display = 'flex';
  } else {
    // 侧边栏模式：显示脱离按钮
    if (detachBtn) detachBtn.style.display = 'flex';
  }

  // 任务执行中时禁用脱离/回归按钮，避免中断后台任务
  const updateDetachAttachState = () => {
    if (!activeBtn) return;
    const hasRunningTask = state.pendingCallApiSessionIds && state.pendingCallApiSessionIds.size > 0;
    activeBtn.disabled = hasRunningTask;
    activeBtn.style.opacity = hasRunningTask ? '0.35' : '';
    activeBtn.style.cursor = hasRunningTask ? 'not-allowed' : 'pointer';
    activeBtn.title = hasRunningTask ? t('detach.taskRunning') : (isPopup ? t('header.attachTitle') : t('header.detachTitle'));
  };

  updateDetachAttachState();
  document.addEventListener('generating-state-changed', updateDetachAttachState);

  // 点击脱离：侧边栏 → 独立窗口
  if (detachBtn) {
    detachBtn.addEventListener('click', async () => {
      if (state.pendingCallApiSessionIds && state.pendingCallApiSessionIds.size > 0) {
        showToast(t('detach.taskRunning'), 'warning');
        return;
      }
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'DETACH_SIDEPANEL' });
        if (resp?.success) {
          // 关闭侧边栏
          try { window.close(); } catch (e) { /* 忽略 */ }
        }
      } catch (e) {
        logger.warn('[SidePanel] detach failed:', e?.message);
      }
    });
  }

  // 点击回归：独立窗口 → 侧边栏
  if (attachBtn) {
    attachBtn.addEventListener('click', async () => {
      if (state.pendingCallApiSessionIds && state.pendingCallApiSessionIds.size > 0) {
        showToast(t('detach.taskRunning'), 'warning');
        return;
      }
      try {
        // 获取当前弹窗的 windowId
        const winId = (await chrome.windows.getCurrent()).id;
        await chrome.runtime.sendMessage({ type: 'ATTACH_SIDEPANEL', windowId: winId });
        // 关闭弹窗（background 会处理 remove，但以防万一）
        try { window.close(); } catch (e) { /* 忽略 */ }
      } catch (e) {
        logger.warn('[SidePanel] attach failed:', e?.message);
      }
    });
  }
});
