// config-io.js - 配置导入/导出模块

import { loadConfig } from './config-manager.js';
import { loadToolbarTools, loadBlockedDomainsUI } from './toolbar-config.js';

// 允许导出的配置项 key 白名单
const EXPORT_KEYS = [
  'apiBase', 'modelName', 'customModels', 'systemPrompt',
  'enableImageInput', 'imageModelName', 'imageModels',
  'imageApiBase', 'enableFileInput',
  'reactMaxIterations', 'reactApiTimeout', 'reactLoopTimeout',
  'reactToolTimeout', 'reactClarifyTimeout', 'reactApiRetryCount',
  'reactApiRetryBaseDelay', 'enableToolPreselect', 'preselectMinToolCount',
  'toolConfirmationEnabled',
  'reflectionConfig',
  'chatMaxInputHistory', 'chatMaxHistoryMessages',
  'chatMaxMessageLength', 'chatMaxMemoryMessages', 'enableExecutionLog', 'chatContextWindow',
  'toolbarTools', 'toolbarMaxVisible', 'toolbarIconOnly',
  'enableSelectionToolbar', 'blockedDomains',
  'streamEnabled', 'streamChunkDelay',
  // 新增：助手、工具、LLM参数、UI开关等配置
  'customAgents', 'activeAgentId',
  'temperature', 'topP', 'selectedTempIndex',
  'customPrompts',
  'agentUrl', 'agentPlatform', 'agentStreamEnabled',
  'enableTools', 'isolateChat', 'enableSelectionQuery',
  'deletedPresetModels',
  'mcpEnabled', 'skillsEnabled',
];

// 敏感的密钥 key
const SECRET_KEYS = ['apiKey', 'imageApiKey', 'agentToken'];

/**
 * 从 chrome.storage.local 收集当前配置
 * @param {boolean} includeSecrets - 是否包含 API 密钥
 * @returns {Promise<Object>} 配置对象
 */
async function collectConfig(includeSecrets) {
  const allKeys = includeSecrets ? [...EXPORT_KEYS, ...SECRET_KEYS] : EXPORT_KEYS;
  
  return new Promise((resolve) => {
    // 获取所有 storage 数据，以便收集动态 key（如 agentEnabledTools_*）
    chrome.storage.local.get(null, (result) => {
      const config = {};
      // 静态白名单 key
      for (const key of allKeys) {
        if (result[key] !== undefined) {
          config[key] = result[key];
        }
      }
      // 收集所有智能体独立的工具配置 key
      for (const key of Object.keys(result)) {
        if (key.startsWith('agentEnabledTools_')) {
          config[key] = result[key];
        }
      }
      resolve(config);
    });
  });
}

/**
 * 导出配置到 JSON 文件
 */
export async function exportConfig() {
  const includeSecrets = document.getElementById('exportIncludeSecrets')?.checked || false;

  try {
    const config = await collectConfig(includeSecrets);

    const exportData = {
      version: 1,
      app: 'ai-helper',
      exportedAt: new Date().toISOString(),
      includeSecrets,
      config,
    };

    const now = new Date();
    const ts = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '-' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    const fileName = `ai-helper-config-${ts}.json`;
    const jsonData = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    hideExportDialog();
    showToast('配置已导出', 'success');
  } catch (err) {
    console.error('[Options] 导出配置失败:', err);
    showToast('导出失败: ' + err.message, 'error');
  }
}

/**
 * 显示导出选项弹窗
 */
export function showExportDialog() {
  const modal = document.getElementById('exportConfigModal');
  if (modal) modal.style.display = 'flex';
}

/**
 * 隐藏导出选项弹窗
 */
function hideExportDialog() {
  const modal = document.getElementById('exportConfigModal');
  if (modal) modal.style.display = 'none';
}

/**
 * 显示导入预览弹窗
 * @param {Object} importData - 解析后的导入数据
 */
function showImportPreview(importData) {
  const config = importData.config || importData;
  const count = Object.keys(config).length;
  const exportedAt = importData.exportedAt 
    ? new Date(importData.exportedAt).toLocaleString('zh-CN')
    : '未知';

  const summaryEl = document.getElementById('importSummary');
  if (summaryEl) {
    summaryEl.textContent = `导出时间: ${exportedAt}，包含 ${count} 项配置`;
  }

  const modal = document.getElementById('importConfigModal');
  if (modal) {
    modal.dataset.importData = JSON.stringify(importData);
    modal.style.display = 'flex';
  }
}

/**
 * 隐藏导入预览弹窗
 */
function hideImportDialog() {
  const modal = document.getElementById('importConfigModal');
  if (modal) modal.style.display = 'none';
}

/**
 * 触发导入 - 打开文件选择器
 */
export function triggerImport() {
  const fileInput = document.getElementById('importConfigFile');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

/**
 * 校验导入数据
 * @param {Object} data
 * @returns {{ valid: boolean, error?: string }}
 */
function validateImportData(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: '无效的文件格式' };
  }

  let config;
  if (data.version && data.config && typeof data.config === 'object') {
    config = data.config;
  } else if (data.apiBase || data.modelName !== undefined) {
    // 兼容直接是配置对象的老格式
    config = data;
  } else {
    return { valid: false, error: '无法识别的配置格式' };
  }

  // 校验每个 key 都在白名单内（或为智能体工具配置动态 key）
  for (const key of Object.keys(config)) {
    if (!EXPORT_KEYS.includes(key) && !SECRET_KEYS.includes(key) && !key.startsWith('agentEnabledTools_')) {
      return { valid: false, error: `未知的配置项: ${key}` };
    }
  }

  return { valid: true };
}

/**
 * 处理导入文件
 * @param {File} file
 */
export async function handleImportFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const validation = validateImportData(data);

    if (!validation.valid) {
      showToast('导入失败: ' + validation.error, 'error');
      return;
    }

    showImportPreview(data);
  } catch (err) {
    console.error('[Options] 导入文件解析失败:', err);
    showToast('导入失败: 无法解析文件格式', 'error');
  }
}

/**
 * 确认导入配置
 */
export async function confirmImport() {
  const modal = document.getElementById('importConfigModal');
  if (!modal) return;

  const importDataStr = modal.dataset.importData;
  if (!importDataStr) return;

  try {
    const importData = JSON.parse(importDataStr);
    const config = importData.config || importData;
    const strategy = document.getElementById('importStrategyReplace')?.checked ? 'replace' : 'merge';

    if (strategy === 'replace') {
      // 完全替换：直接写入所有配置
      await new Promise((resolve) => {
        chrome.storage.local.set(config, resolve);
      });
    } else {
      // 合并导入：逐项写入
      await new Promise((resolve) => {
        chrome.storage.local.set(config, resolve);
      });
    }

    hideImportDialog();
    showToast(`已导入 ${Object.keys(config).length} 项配置`, 'success');

    // 刷新页面显示新值
    setTimeout(() => {
      loadConfig(() => {
        // 刷新工具栏
        loadToolbarTools().then(() => {
          // 如果有 renderToolbarToolsList 函数，调用它
          if (typeof updateToolbarUI === 'function') {
            updateToolbarUI();
          }
        });
        loadBlockedDomainsUI();
      });
    }, 300);
  } catch (err) {
    console.error('[Options] 导入配置失败:', err);
    showToast('导入失败: ' + err.message, 'error');
  }
}

/**
 * 初始化导入/导出弹窗事件
 */
export function initConfigIOEvents() {
  // 导出弹窗
  const exportCloseBtn = document.getElementById('exportConfigCloseBtn');
  const exportCancelBtn = document.getElementById('exportConfigCancelBtn');
  const exportOkBtn = document.getElementById('exportConfigOkBtn');
  const exportModal = document.getElementById('exportConfigModal');

  if (exportCloseBtn) exportCloseBtn.addEventListener('click', hideExportDialog);
  if (exportCancelBtn) exportCancelBtn.addEventListener('click', hideExportDialog);
  if (exportOkBtn) exportOkBtn.addEventListener('click', exportConfig);
  if (exportModal) {
    exportModal.addEventListener('click', (e) => {
      if (e.target === exportModal) hideExportDialog();
    });
  }

  // 导入弹窗
  const importCloseBtn = document.getElementById('importConfigCloseBtn');
  const importCancelBtn = document.getElementById('importConfigCancelBtn');
  const importOkBtn = document.getElementById('importConfigOkBtn');
  const importModal = document.getElementById('importConfigModal');

  if (importCloseBtn) importCloseBtn.addEventListener('click', hideImportDialog);
  if (importCancelBtn) importCancelBtn.addEventListener('click', hideImportDialog);
  if (importOkBtn) importOkBtn.addEventListener('click', confirmImport);
  if (importModal) {
    importModal.addEventListener('click', (e) => {
      if (e.target === importModal) hideImportDialog();
    });
  }
}

// 简单的 toast 提示（不依赖外部模块）
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-show'));

  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3000);
}
