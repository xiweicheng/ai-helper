// options/toolbox-shared.js - 工具箱共享状态与辅助函数
// 从 toolbox-config.js 拆分，提供 MCP/Skills/主入口共享的状态对象与工具函数

import { showToast } from './config-manager.js';
import logger from '../shared/logger.js';

// ==================== 共享状态 ====================
// 所有模块通过此对象读写共享状态，确保 live binding 一致性
export const state = {
  agentBaseUrl: null,
  agentToken: null,
  agentConnected: false,
  cachedMcpServers: [],
  editingMcpId: null,
  // 刷新回调：由主入口注册，避免循环依赖
  refreshCallback: null,
};

/**
 * 触发刷新整个工具箱面板
 * 由 toolbox-config.js 的 refreshToolbox 注册
 */
export async function triggerRefresh() {
  if (typeof state.refreshCallback === 'function') {
    await state.refreshCallback();
  }
}

// ==================== 通用 UI 辅助 ====================

/**
 * 自定义确认弹窗（返回 Promise<boolean>）
 */
export function showCustomConfirm(message, title = '确认操作') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
        </div>
        <div class="modal-body">
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-cancel" id="confirmCancelBtn">取消</button>
          <button class="btn btn-primary" id="confirmOkBtn" style="width: auto;">确定</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector('#confirmCancelBtn').addEventListener('click', () => close(false));
    overlay.querySelector('#confirmOkBtn').addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
  });
}

/**
 * 显示 Agent Skill 只读查看弹窗（用于内置技能）
 */
export function showAgentSkillViewer(skillName, data) {
  const existingModal = document.getElementById('agentSkillViewerModal');
  if (existingModal) existingModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.id = 'agentSkillViewerModal';

  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal-content agent-skill-editor-container';
  modalContainer.style.width = '700px';
  modalContainer.style.maxHeight = '85vh';

  modalContainer.innerHTML = `
    <div class="modal-header">
      <h3>查看 Skill: ${escapeHtml(skillName)}</h3>
      <button class="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>名称</label>
        <input type="text" value="${escapeHtml(data.frontmatter?.name || data.name || '')}" readonly style="background:#f5f5f5;color:#666;">
      </div>
      <div class="form-group">
        <label>描述</label>
        <input type="text" value="${escapeHtml(data.frontmatter?.description || '')}" readonly style="background:#f5f5f5;color:#666;">
      </div>
      <div class="form-group">
        <label>版本</label>
        <input type="text" value="${escapeHtml(data.frontmatter?.version || '1.0')}" readonly style="background:#f5f5f5;color:#666;">
      </div>
      <div class="form-group">
        <label>SKILL.md 内容</label>
        <textarea readonly style="min-height: 350px; font-family: monospace; background:#f5f5f5; color:#666; resize: vertical;">${escapeHtml(data.markdown || '')}</textarea>
      </div>
      ${data.resources && data.resources.length > 0 ? `
      <div class="form-group">
        <label>资源文件 (${data.resources.length})</label>
        <div class="skill-resources-preview">
          ${data.resources.map(r => `<span class="skill-resource-tag">📄 ${escapeHtml(r.name || r)}</span>`).join('')}
        </div>
      </div>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel">关闭</button>
    </div>
  `;

  modalOverlay.appendChild(modalContainer);
  document.body.appendChild(modalOverlay);

  const closeModal = () => modalOverlay.remove();
  modalContainer.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modalContainer.querySelector('.btn-cancel').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
}

// ==================== Agent 连接与 API ====================

/**
 * 获取 Agent 连接信息
 */
export async function getAgentConnection() {
  const result = await chrome.storage.local.get(['agentUrl', 'agentToken']);
  state.agentBaseUrl = result.agentUrl || null;
  state.agentToken = result.agentToken || null;
  state.agentConnected = !!(state.agentBaseUrl && state.agentToken);
  return { url: state.agentBaseUrl, token: state.agentToken, connected: state.agentConnected };
}

/**
 * 通用 Agent API 请求
 */
export async function agentApi(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.agentToken}`
    }
  };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(`${state.agentBaseUrl}${path}`, opts);
  return resp.json();
}

// ==================== 通用工具函数 ====================

/**
 * HTML 转义
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 重新导出 showToast 供其他模块使用
export { showToast };
