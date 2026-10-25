// config-io.js - 配置导入/导出模块

import { loadConfig } from './config-manager.js';
import { loadToolbarTools, loadBlockedDomainsUI, renderToolbarToolsList } from './toolbar-config.js';
import logger from '../shared/logger.js';
import { t, getLanguage } from '../shared/i18n.js';
import { ensureProfilesMigrated, updateActiveProfile, normalizeModels, stripProfileSecrets, mergeProfiles, getState, DEFAULT_API_BASE, DEFAULT_MODEL_NAME } from '../shared/model-profiles.js';
import { encodeSecret, decodeSecret } from '../shared/secret.js';

// 允许导出的配置项 key 白名单
const EXPORT_KEYS = [
  'apiBase', 'modelName', 'customModels', 'systemPrompt',
  'enableImageInput', 'imageModelName', 'imageModels',
  'imageApiBase',
  'reactMaxIterations', 'reactApiTimeout', 'reactLoopTimeout',
  'reactToolTimeout', 'enableToolPreselect', 'toolConfirmationEnabled',
  'reflectionConfig',
  'completionVerificationConfig',
  'enableExecutionLog',
  'toolbarTools', 'toolbarIconOnly',
  'enableSelectionToolbar', 'blockedDomains',
  'streamEnabled',
  'streamExpandTools',
  // 完成反馈（声音 + 彩带开关）
  'completionSoundEnabled', 'completionConfettiEnabled',
  // 桌面通知开关（任务完成/失败、定时任务、交互提醒）
  'completionNotificationEnabled', 'scheduledNotificationEnabled', 'interactionNotificationEnabled',
  // 消息时间戳显示开关
  'showMessageTimestamp',
  // 队列「自动顺带」（运行中任务自动带入队首一条）
  'queueAutoCarry', 'queueAutoCarryEveryNIterations',
  // 侧边栏作用域模式
  'sidePanelScope',
  // 自动分组开关
  'autoGroupTabs',
  // 新增：助手、工具、LLM参数、UI开关等配置
  'customAgents', 'activeAgentId', 'activeAssistantId',
  'temperature', 'topP', 'selectedTempIndex',
  'customPrompts',
  'pairedAgents', 'agentStreamEnabled',
  'enableTools', 'isolateChat', 'enableSelectionQuery',
  'deletedPresetModels',
  // 厂商配置（多配置记忆）与激活项
  'modelProfiles', 'activeProfileId',
  'mcpEnabled', 'skillsEnabled', 'ragEnabled',
  // 外观主题（三态偏好 + 划词浮层是否跟随扩展主题）
  'appTheme', 'selectionToolbarFollowTheme',
];

// 敏感的密钥 key（agentToken 已废弃，token 嵌入在 pairedAgents 中）
const SECRET_KEYS = ['apiKey', 'imageApiKey', 'agentToken'];

/**
 * 导入时混淆配置中的密钥字段（确保落存储的是 enc: 格式）
 */
function _encodeConfigSecrets(config) {
  for (const key of ['apiKey', 'imageApiKey']) {
    if (config[key]) config[key] = encodeSecret(decodeSecret(config[key]));
  }
  if (Array.isArray(config.modelProfiles)) {
    config.modelProfiles = config.modelProfiles.map(p =>
      p.apiKey ? { ...p, apiKey: encodeSecret(decodeSecret(p.apiKey)) } : p
    );
  }
  if (Array.isArray(config.pairedAgents)) {
    config.pairedAgents = config.pairedAgents.map(a =>
      a.token ? { ...a, token: encodeSecret(decodeSecret(a.token)) } : a
    );
  }
}

/**
 * 剥离已下线的反思配置字段（工具级反思 toolReflection 已移除）。
 * 旧用户的 storage 或旧导出文件可能仍携带 reflectionConfig.toolReflection，
 * 导出/导入时统一清理，避免死配置被长期携带与回灌。
 * @param {Object} config - 含 reflectionConfig 的配置对象（就地安全：命中时替换为新引用）
 */
function stripRetiredReflectionKeys(config) {
  const rc = config && config.reflectionConfig;
  if (rc && typeof rc === 'object' && 'toolReflection' in rc) {
    const clean = { ...rc };
    delete clean.toolReflection;
    config.reflectionConfig = clean;
  }
}

async function collectConfig(includeSecrets) {
  const allKeys = includeSecrets ? [...EXPORT_KEYS, ...SECRET_KEYS] : EXPORT_KEYS;
  
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (result) => {
      const config = {};
      for (const key of allKeys) {
        if (result[key] !== undefined) {
          config[key] = result[key];
        }
      }
      // 收集所有智能体独立的工具配置 key（常规工具勾选 + MCP 服务关闭列表）
      for (const key of Object.keys(result)) {
        if (key.startsWith('agentEnabledTools_') || key.startsWith('agentMcpClosedServers_')) {
          config[key] = result[key];
        }
      }
      // 不包含密钥时，清除 pairedAgents 中的 token
      if (!includeSecrets && config.pairedAgents) {
        config.pairedAgents = config.pairedAgents.map(a => ({ ...a, token: '' }));
      }
      // 不包含密钥时，逐厂商配置剥离 apiKey
      if (!includeSecrets && Array.isArray(config.modelProfiles)) {
        config.modelProfiles = stripProfileSecrets(config.modelProfiles);
      }
      // 剥离已下线的工具级反思配置，避免导出文件携带死字段
      stripRetiredReflectionKeys(config);
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
    showToast(t('configDialog.exportSuccess'), 'success');
  } catch (err) {
    logger.error('[Options] exportconfiguration failed:', err);
    showToast(t('configDialog.exportFailed', { error: err.message }), 'error');
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
    ? new Date(importData.exportedAt).toLocaleString(getLanguage() === 'zh' ? 'zh-CN' : 'en-US')
    : t('configDialog.unknownTime');

  const summaryEl = document.getElementById('importSummary');
  if (summaryEl) {
    summaryEl.textContent = t('configDialog.importSummary', { time: exportedAt, count });
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
    return { valid: false, error: t('configDialog.invalidFileFormat') };
  }

  let config;
  if (data.version && data.config && typeof data.config === 'object') {
    config = data.config;
  } else if (data.apiBase || data.modelName !== undefined) {
    // 兼容直接是配置对象的老格式
    config = data;
  } else {
    return { valid: false, error: t('configDialog.unrecognizedFormat') };
  }

  // 校验每个 key 都在白名单内（或为智能体工具配置动态 key）
  for (const key of Object.keys(config)) {
    if (!EXPORT_KEYS.includes(key) && !SECRET_KEYS.includes(key) && !key.startsWith('agentEnabledTools_') && !key.startsWith('agentMcpClosedServers_')) {
      return { valid: false, error: t('configDialog.unknownConfigKey', { key }) };
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
      showToast(t('configDialog.importFailed', { error: validation.error }), 'error');
      return;
    }

    showImportPreview(data);
  } catch (err) {
    logger.error('[Options] import fileparse failed:', err);
    showToast(t('configDialog.importParseFailed'), 'error');
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
    // 内网访问策略不参与导入：它属于安全闸门，不能让一个配置文件（包括手改的
    // 导出文件）静默把总闸打开并灌入内网白名单，只能在设置页当面改
    delete config.networkAccessEnabled;
    delete config.allowedNetworkHosts;
    // 清理旧导出文件中可能仍存在的已下线反思配置（工具级反思），避免回灌进 storage
    stripRetiredReflectionKeys(config);
    const strategy = document.getElementById('importStrategyReplace')?.checked ? 'replace' : 'merge';

    // 合并导入 + 新格式文件：厂商配置按 ID 对齐合并
    // （新 ID 追加；同 ID 以 updatedAt 较新的为准，老的忽略），
    // 之后统一重投影扁平键，保证“扁平键 = 激活配置”一致
    if (strategy === 'merge' && Array.isArray(config.modelProfiles)) {
      const local = await getState();
      config.modelProfiles = mergeProfiles(local.profiles, config.modelProfiles);
      const fileActive = config.activeProfileId;
      config.activeProfileId = config.modelProfiles.some(p => p.id === fileActive)
        ? fileActive
        : local.activeProfileId;
      const activeProfile = config.modelProfiles.find(p => p.id === config.activeProfileId) || config.modelProfiles[0];
      if (activeProfile) {
        config.apiBase = activeProfile.apiBase || DEFAULT_API_BASE;
        config.apiKey = activeProfile.apiKey || '';
        config.modelName = activeProfile.modelName || DEFAULT_MODEL_NAME;
        config.customModels = normalizeModels(activeProfile.models);
      }
    }

    if (strategy === 'replace') {
      // 完全替换：密钥混淆后写入
      _encodeConfigSecrets(config);
      await new Promise((resolve) => {
        chrome.storage.local.set(config, resolve);
      });
    } else {
      // 合并导入：密钥混淆后逐项写入
      _encodeConfigSecrets(config);
      await new Promise((resolve) => {
        chrome.storage.local.set(config, resolve);
      });
    }

    // 厂商配置一致性处理：
    // - 旧格式导入（无 modelProfiles）：用扁平键回写激活配置，避免数据分叉
    // - 其余情况：确保 activeProfileId 有效（导入文件可能缺失）
    await ensureProfilesMigrated();
    if (!Array.isArray(config.modelProfiles)) {
      const flat = await chrome.storage.local.get(['apiBase', 'apiKey', 'modelName', 'customModels']);
      await updateActiveProfile({
        apiBase: flat.apiBase || DEFAULT_API_BASE,
        apiKey: decodeSecret(flat.apiKey) || '',
        modelName: flat.modelName || DEFAULT_MODEL_NAME,
        models: normalizeModels(flat.customModels),
      });
    }

    hideImportDialog();
    showToast(t('configDialog.importedCount', { count: Object.keys(config).length }), 'success');

    // 刷新页面显示新值
    setTimeout(() => {
      loadConfig(() => {
        // 刷新工具栏
        loadToolbarTools().then((tools) => {
          // 导入后按新的 toolbarTools 重绘列表（原先调用的 updateToolbarUI 并不存在，等于没刷新）
          renderToolbarToolsList(tools);
        });
        loadBlockedDomainsUI();
      });
    }, 300);
  } catch (err) {
    logger.error('[Options] importconfiguration failed:', err);
    showToast(t('configDialog.importFailed', { error: err.message }), 'error');
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
