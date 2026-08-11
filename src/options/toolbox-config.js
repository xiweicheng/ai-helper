// options/toolbox-config.js - 工具箱配置主入口（MCP 服务器 & Skill 管理）
// 依赖 Agent 连接，未连接时禁用所有操作
// MCP 管理、Skill 管理、共享辅助函数已分别拆分到：
//   toolbox-mcp.js / toolbox-skills.js / toolbox-shared.js

import { state, showCustomConfirm, showAgentSkillViewer, agentApi, getAgentConnection, escapeHtml, showToast } from './toolbox-shared.js';
import {
  loadMcpServers, renderMcpServers, addMcpServer, removeMcpServer,
  connectMcpServer, disconnectMcpServer, toggleMcpServer,
  showAddMcpForm, hideAddMcpForm, handleEnvAction, handleTransportChange,
  getTransportValue, parseEnvVars, parseHeaders,
  initMcpFilter
} from './toolbox-mcp.js';
import {
  loadSkills, renderSkills, deleteSkill, toggleSkill, runSkill,
  parseSkillParams, showSkillParamsDialog, showSkillRunResult,
  reloadSkills, showAgentSkillEditor, getAgentSkillMarkdown, showImportDialog,
  initSkillFilter
} from './toolbox-skills.js';
import logger from '../shared/logger.js';
import { t } from '../shared/i18n.js';

// 注册刷新回调（refreshToolbox 是函数声明，会被 hoist，可安全引用）
// 供 toolbox-skills.js 调用，避免循环依赖
state.refreshCallback = refreshToolbox;

// ==================== 主入口 ====================

/**
 * 通知 Extension Background 重新加载 MCP 工具
 */
function notifyMcpChange() {
  try {
    chrome.runtime.sendMessage({ type: 'RELOAD_MCP_TOOLS' }, (resp) => {
      if (resp?.success) {
        logger.debug(`[Toolbox] Background re loaded ${resp.count}  MCP tool`);
      }
    });
  } catch (_) { /* 忽略错误，background 可能未运行 */ }
}

/**
 * 更新 MCP 服务数量统计（显示在 section 标题旁）
 */
function updateMcpToolCount(servers) {
  const mcpSection = document.getElementById('mcpSection');
  if (!mcpSection) return;
  let countEl = mcpSection.querySelector('.toolbox-tool-count');
  if (!countEl) {
    countEl = document.createElement('span');
    countEl.className = 'toolbox-tool-count';
    // 插入到标题 h2 之后（toggle 按钮保持在最右边不动）
    const titleEl = mcpSection.querySelector('.toolbox-section-title');
    if (titleEl) {
      titleEl.insertAdjacentElement('afterend', countEl);
    }
  }
  const enabled = servers.filter(s => s.enabled !== false).length;
  const total = servers.length;
  if (total === 0) {
    countEl.style.display = 'none';
  } else {
    countEl.textContent = t('toolbox.enabledCountTotal', { enabled, total });
    countEl.style.display = '';
  }
}

/**
 * 更新 Skill 启用/总数统计（显示在 section 标题旁）
 */
function updateSkillCount(skills) {
  const skillSection = document.getElementById('skillSection');
  if (!skillSection) return;
  let countEl = skillSection.querySelector('.toolbox-tool-count');
  if (!countEl) {
    countEl = document.createElement('span');
    countEl.className = 'toolbox-tool-count';
    // 插入到标题 h2 之后（toggle 按钮保持在最右边不动）
    const titleEl = skillSection.querySelector('.toolbox-section-title');
    if (titleEl) {
      titleEl.insertAdjacentElement('afterend', countEl);
    }
  }
  const enabled = skills.filter(s => s.enabled !== false).length;
  const total = skills.length;
  if (total === 0) {
    countEl.style.display = 'none';
  } else {
    countEl.textContent = t('toolbox.enabledCountTotal', { enabled, total });
    countEl.style.display = '';
  }
}

/**
 * 刷新整个工具箱面板
 */
export async function refreshToolbox() {
  const [mcpResult, skillResult] = await Promise.all([
    loadMcpServers(),
    loadSkills()
  ]);

  const mcpServers = mcpResult.servers || [];
  const skills = skillResult.skills || [];

  renderMcpServers(mcpServers);
  renderSkills(skills);

  // 更新 MCP 工具数量统计
  updateMcpToolCount(mcpServers);
  // 更新 Skill 启用/停用数量统计
  updateSkillCount(skills);

  // 更新顶部连接状态提示
  const statusEl = document.getElementById('toolboxAgentStatus');
  if (statusEl) {
    if (state.agentConnected) {
      const agentName = state.agentName || t('toolbox.unknownAgent');
      statusEl.innerHTML = `<span class="toolbox-status-dot connected"></span> ${t('toolbox.currentAgentSupports', { name: escapeHtml(agentName) })}`;
      statusEl.className = 'toolbox-agent-status connected';
    } else {
      statusEl.innerHTML = `<span class="toolbox-status-dot disconnected"></span> ${t('toolbox.agentNotConnectedHint')}`;
      statusEl.className = 'toolbox-agent-status disconnected';
    }
  }

  // 禁用/启用操作按钮
  const disabled = !state.agentConnected;
  const addBtn = document.getElementById('addMcpServerBtn');
  const importBtn = document.getElementById('importSkillBtn');
  const reloadBtn = document.getElementById('reloadSkillsBtn');
  if (addBtn) addBtn.disabled = disabled;
  if (importBtn) importBtn.disabled = disabled;
  if (reloadBtn) reloadBtn.disabled = disabled;
}

/**
 * 开始编辑 MCP 服务器（卡片内替换为编辑表单）
 */
function startEditMcpServer(serverId) {
  const server = state.cachedMcpServers.find(s => s.id === serverId);
  if (!server) return;

  state.editingMcpId = serverId;
  const container = document.getElementById('mcpServerList');
  if (!container) return;

  // 重新渲染，编辑中的卡片替换为表单
  renderMcpServers(state.cachedMcpServers);
}

/**
 * 取消编辑
 */
function cancelEditMcp() {
  state.editingMcpId = null;
  renderMcpServers(state.cachedMcpServers);
}

/**
 * 保存编辑
 */
async function saveMcpEdit() {
  const idInput = document.getElementById('mcpEditId');
  const nameInput = document.getElementById('mcpEditName');
  const cmdInput = document.getElementById('mcpEditCommand');
  const argsInput = document.getElementById('mcpEditArgs');
  const urlInput = document.getElementById('mcpEditUrl');

  const id = idInput?.value.trim();
  const name = nameInput?.value.trim();
  const transport = getTransportValue('mcpEdit');
  const command = cmdInput?.value.trim();
  const argsRaw = argsInput?.value.trim();
  const url = urlInput?.value.trim();

  const isHttp = transport === 'sse' || transport === 'streamableHttp' || transport === 'websocket';

  if (!id) {
    showToolboxToast(t('toolbox.mcpIdRequired'), 'warning');
    return;
  }

  if (isHttp) {
    if (!url) {
      showToolboxToast(t('toolbox.mcpUrlRequired'), 'warning');
      return;
    }
  } else {
    if (!command) {
      showToolboxToast(t('toolbox.mcpCommandRequired'), 'warning');
      return;
    }
  }

  const serverData = {
    id,
    name: name || id,
    transport,
    command,
    args: argsRaw ? argsRaw.split(/\s+/) : [],
    url,
    env: parseEnvVars(document.getElementById('mcpEditEnvRows')),
    headers: parseHeaders(document.getElementById('mcpEditHeaderRows')),
    enabled: state.cachedMcpServers.find(s => s.id === state.editingMcpId)?.enabled !== false
  };

  try {
    await addMcpServer(serverData);

    // 如果编辑前处于连接状态，断开旧连接并使用新配置重连
    const wasConnected = state.cachedMcpServers.find(s => s.id === state.editingMcpId)?.connected;
    if (wasConnected) {
      showToolboxToast(t('toolbox.mcpReconnecting'), 'info');
      // 用旧 ID 断开，用新 ID 重连（防止 ID 被修改的情况）
      await disconnectMcpServer(state.editingMcpId);
      // 短暂等待确保旧进程完全退出
      await new Promise(r => setTimeout(r, 500));
      const connectResult = await connectMcpServer(id);
      if (connectResult.success) {
        showToolboxToast(t('toolbox.mcpUpdateReconnected', { count: connectResult.toolCount || 0 }), 'success');
      } else {
        const errMsg = connectResult.error || t('toolbox.mcpUnknownError');
        showToolboxToast(t('toolbox.mcpUpdatedReconnectFailed', { error: errMsg }), 'warning');
      }
    } else {
      showToolboxToast(t('toolbox.mcpUpdateSuccess'), 'success');
    }

    state.editingMcpId = null;
    notifyMcpChange();
    await refreshToolbox();
  } catch (err) {
    showToolboxToast(t('toolbox.mcpUpdateFailed', { error: err.message }), 'error');
  }
}

/**
 * 更新全局开关的 UI 状态
 */
function updateGlobalToggleUI(type, enabled) {
  const label = document.getElementById(type === 'mcp' ? 'mcpToggleLabel' : 'skillToggleLabel');
  const section = document.getElementById(type === 'mcp' ? 'mcpSection' : 'skillSection');
  if (label) {
    label.textContent = enabled ? t('common.enabled') : t('common.disabled');
    label.style.color = enabled ? '#666' : '#999';
  }
  if (section) {
    if (enabled) {
      section.classList.remove('disabled-section');
    } else {
      section.classList.add('disabled-section');
    }
  }
}

/**
 * 初始化工具箱 Tab
 */
export function initToolbox() {
  // 全局开关：MCP 服务
  const mcpToggle = document.getElementById('mcpGlobalToggle');
  const skillToggle = document.getElementById('skillGlobalToggle');
  const mcpToggleLabel = document.getElementById('mcpToggleLabel');
  const skillToggleLabel = document.getElementById('skillToggleLabel');
  const mcpSection = document.getElementById('mcpSection');
  const skillSection = document.getElementById('skillSection');

  // 加载全局开关状态
  chrome.storage.local.get(['mcpEnabled', 'skillsEnabled'], (result) => {
    const mcpEnabled = result.mcpEnabled === true;
    const skillsEnabled = result.skillsEnabled !== false;
    if (mcpToggle) mcpToggle.checked = mcpEnabled;
    if (skillToggle) skillToggle.checked = skillsEnabled;
    updateGlobalToggleUI('mcp', mcpEnabled);
    updateGlobalToggleUI('skill', skillsEnabled);
  });

  // MCP 全局开关
  if (mcpToggle) {
    mcpToggle.addEventListener('change', () => {
      const enabled = mcpToggle.checked;
      chrome.storage.local.set({ mcpEnabled: enabled });
      updateGlobalToggleUI('mcp', enabled);
      showToolboxToast(enabled ? t('toolbox.mcpServiceEnabled') : t('toolbox.mcpServiceDisabled'), 'info');
    });
  }

  // Skill 全局开关
  if (skillToggle) {
    skillToggle.addEventListener('change', () => {
      const enabled = skillToggle.checked;
      chrome.storage.local.set({ skillsEnabled: enabled });
      updateGlobalToggleUI('skill', enabled);
      showToolboxToast(enabled ? t('toolbox.skillServiceEnabled') : t('toolbox.skillServiceDisabled'), 'info');
    });
  }

  // MCP 添加按钮
  const addMcpBtn = document.getElementById('addMcpServerBtn');
  if (addMcpBtn) {
    addMcpBtn.addEventListener('click', () => {
      const formContainer = document.getElementById('mcpAddForm');
      if (formContainer && formContainer.innerHTML.trim()) {
        hideAddMcpForm();
      } else {
        showAddMcpForm();
      }
    });
  }

  // MCP 添加表单事件（事件委托）
  const mcpAddForm = document.getElementById('mcpAddForm');
  if (mcpAddForm) {
    mcpAddForm.addEventListener('click', async (e) => {
      // 传输方式切换（按钮点击）
      if (e.target.dataset.action === 'transport-change') {
        handleTransportChange(e.target);
        return;
      }

      // 环境变量操作
      if (handleEnvAction(e)) return;

      if (e.target.id === 'mcpAddCancel') {
        hideAddMcpForm();
      }
      if (e.target.id === 'mcpAddConfirm') {
        const id = document.getElementById('mcpAddId')?.value.trim();
        const name = document.getElementById('mcpAddName')?.value.trim();
        const transport = getTransportValue('mcpAdd');
        const command = document.getElementById('mcpAddCommand')?.value.trim();
        const argsRaw = document.getElementById('mcpAddArgs')?.value.trim();
        const url = document.getElementById('mcpAddUrl')?.value.trim();

        const isHttp = transport === 'sse' || transport === 'streamableHttp' || transport === 'websocket';

        if (!id) {
          showToolboxToast(t('toolbox.mcpIdRequired'), 'warning');
          return;
        }

        if (isHttp) {
          if (!url) {
            showToolboxToast(t('toolbox.mcpUrlRequired'), 'warning');
            return;
          }
        } else {
          if (!command) {
            showToolboxToast(t('toolbox.mcpCommandRequired'), 'warning');
            return;
          }
        }

        const envRows = document.getElementById('mcpAddEnvRows');
        const headerRows = document.getElementById('mcpAddHeaderRows');
        const serverData = {
          id,
          name: name || id,
          transport,
          command,
          args: argsRaw ? argsRaw.split(/\s+/) : [],
          url,
          env: envRows ? parseEnvVars(envRows) : {},
          headers: headerRows ? parseHeaders(headerRows) : {},
          enabled: true
        };

        try {
          await addMcpServer(serverData);
          showToolboxToast(t('toolbox.mcpAddSuccess'), 'success');
          hideAddMcpForm();
          notifyMcpChange();
          await refreshToolbox();
        } catch (err) {
          showToolboxToast(t('toolbox.mcpAddFailed', { error: err.message }), 'error');
        }
      }
    });
  }

  // MCP 服务器列表事件委托
  const mcpList = document.getElementById('mcpServerList');
  if (mcpList) {
    mcpList.addEventListener('click', async (e) => {
      // 传输方式切换（按钮点击）
      if (e.target.dataset.action === 'transport-change') {
        handleTransportChange(e.target);
        return;
      }

      // 环境变量操作（不需要 serverId）
      if (handleEnvAction(e)) return;

      const btn = e.target.closest('button, input');
      if (!btn) return;

      const action = btn.dataset.action;
      const serverId = btn.dataset.mcpId;

      if (!action || !serverId) return;

      try {
        if (action === 'connect') {
          showToolboxToast(t('toolbox.mcpConnecting'), 'info');
          await connectMcpServer(serverId);
          showToolboxToast(t('toolbox.mcpConnectSuccess'), 'success');
          notifyMcpChange();
          await refreshToolbox();
        } else if (action === 'disconnect') {
          await disconnectMcpServer(serverId);
          showToolboxToast(t('toolbox.mcpDisconnectSuccess'), 'success');
          notifyMcpChange();
          await refreshToolbox();
        } else if (action === 'toggle') {
          const enabled = btn.checked;
          await toggleMcpServer(serverId, enabled);
          showToolboxToast(enabled ? t('toolbox.mcpEnabledToast') : t('toolbox.mcpDisabledToast'), 'success');
          notifyMcpChange();
          await refreshToolbox();
        } else if (action === 'delete') {
          const confirmed = await showCustomConfirm(t('toolbox.mcpConfirmDelete'), t('toolbox.deleteConfirmTitle'));
          if (!confirmed) return;
          await removeMcpServer(serverId);
          showToolboxToast(t('toolbox.deleteSuccess'), 'success');
          notifyMcpChange();
          await refreshToolbox();
        } else if (action === 'edit') {
          startEditMcpServer(serverId);
        } else if (action === 'cancel-edit') {
          cancelEditMcp();
        } else if (action === 'save-edit') {
          await saveMcpEdit();
        } else if (action === 'toggle-tools') {
          const toolsList = document.getElementById(`mcp-tools-${serverId}`);
          const toggleBtn = btn;
          if (toolsList) {
            const isHidden = toolsList.style.display === 'none';
            toolsList.style.display = isHidden ? 'block' : 'none';
            toggleBtn.innerHTML = isHidden
              ? `&#9660; ${t('toolbox.collapseTools', { count: toolsList.children.length })}`
              : `&#9654; ${t('toolbox.viewTools', { count: toolsList.children.length })}`;
          }
        }
      } catch (err) {
        showToolboxToast(t('toolbox.operationFailed', { error: err.message }), 'error');
      }
    });
  }

  // Skill 列表事件委托
  const skillList = document.getElementById('skillList');
  if (skillList) {
    skillList.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      const action = btn.dataset.action;
      const skillName = btn.dataset.skillName;

      if (btn.classList.contains('skill-expand-btn')) {
        const target = btn.dataset.target;
        if (target === 'desc') {
          const descEl = btn.previousElementSibling;
          if (descEl && descEl.classList.contains('skill-card-desc')) {
            const fullText = decodeURIComponent(btn.dataset.full || '');
            descEl.textContent = fullText;
            btn.remove();
          }
        } else if (target === 'resources') {
          try {
            const resources = JSON.parse(decodeURIComponent(btn.dataset.full || '[]'));
            const paramsContainer = btn.parentElement;
            if (paramsContainer && paramsContainer.classList.contains('skill-card-params')) {
              const allTags = resources.map(r => `<span class="skill-param-tag" title="${t('toolbox.sizeBytes', { size: r.size })}">📄 ${escapeHtml(r.name)}</span>`).join('');
              paramsContainer.innerHTML = allTags;
            }
          } catch (e) {
            logger.error('Failed to expand resources:', e);
          }
        }
        return;
      }

      if (!action || !skillName) return;

      try {
        if (action === 'delete-skill') {
          const confirmed = await showCustomConfirm(t('toolbox.skillConfirmDelete', { name: skillName }), t('toolbox.deleteConfirmTitle'));
          if (!confirmed) return;
          await deleteSkill(skillName);
          showToolboxToast(t('toolbox.deleteSuccess'), 'success');
          await refreshToolbox();
        } else if (action === 'toggle-skill') {
          const enabled = await toggleSkill(skillName);
          showToolboxToast(enabled ? t('toolbox.skillEnabledToast', { name: skillName }) : t('toolbox.skillDisabledToast', { name: skillName }), 'success');
          await refreshToolbox();
        } else if (action === 'run-skill') {
          const skillInfo = await agentApi('GET', `/api/skill/detail?name=${encodeURIComponent(skillName)}`);
          if (!skillInfo?.success || !skillInfo.skill) {
            showToolboxToast(t('toolbox.skillInfoFailed', { error: skillInfo?.error || t('agentConfig.unknownError') }), 'error');
            return;
          }
          // 解析参数定义
          const paramsDef = parseSkillParams(skillInfo.skill);
          if (paramsDef.hasRequired) {
            // 有参数需要填写，弹窗收集
            const userParams = await showSkillParamsDialog(skillName, paramsDef);
            if (userParams === null) return; // 用户取消
            showToolboxToast(t('toolbox.skillRunning', { name: skillName }), 'info');
            const result = await runSkill(skillName, userParams);
            showSkillRunResult(skillName, skillInfo, result);
          } else {
            // 无必填参数，直接执行
            showToolboxToast(t('toolbox.skillRunning', { name: skillName }), 'info');
            const result = await runSkill(skillName);
            showSkillRunResult(skillName, skillInfo, result);
          }
        } else if (action === 'edit-agent-skill') {
          try {
            const data = await getAgentSkillMarkdown(skillName);
            if (data.success) {
              showAgentSkillEditor(skillName, data);
            } else {
              showToolboxToast(data.error || t('toolbox.skillContentFailed'), 'error');
            }
          } catch (err) {
            showToolboxToast(t('toolbox.skillGetFailed', { error: err.message }), 'error');
          }
        } else if (action === 'view-agent-skill') {
          try {
            const data = await getAgentSkillMarkdown(skillName);
            if (data.success) {
              showAgentSkillViewer(skillName, data);
            } else {
              showToolboxToast(data.error || t('toolbox.skillContentFailed'), 'error');
            }
          } catch (err) {
            showToolboxToast(t('toolbox.skillGetFailed', { error: err.message }), 'error');
          }
        }
      } catch (err) {
        showToolboxToast(t('toolbox.operationFailed', { error: err.message }), 'error');
      }
    });
  }

  // 导入 Skill（使用统一的导入弹窗）
  const importBtn = document.getElementById('importSkillBtn');
  if (importBtn) {
    importBtn.addEventListener('click', () => showImportDialog());
  }

  // 重新加载 Skill
  const reloadBtn = document.getElementById('reloadSkillsBtn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      try {
        const result = await reloadSkills();
        showToolboxToast(t('toolbox.skillsReloaded', { count: result.count || 0 }), 'success');
        await refreshToolbox();
      } catch (err) {
        showToolboxToast(t('toolbox.skillsReloadFailed', { error: err.message }), 'error');
      }
    });
  }

  // 初始化搜索 + 筛选事件
  initMcpFilter();
  initSkillFilter();

  // 初始加载数据
  refreshToolbox();
}

/**
 * 简易 Toast 提示
 */
function showToolboxToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-show'));

  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// escapeHtml 已拆分到 toolbox-shared.js（通过顶部 import 引入）


