// options/toolbox-config.js - 工具箱配置（MCP 服务器 & Skill 管理）
// 依赖 Agent 连接，未连接时禁用所有操作

import { showToast } from './config-manager.js';

let agentBaseUrl = null;
let agentToken = null;
let agentConnected = false;
let cachedMcpServers = [];
let editingMcpId = null;

/**
 * 自定义确认弹窗（返回 Promise<boolean>）
 */
function showCustomConfirm(message, title = '确认操作') {
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
function showAgentSkillViewer(skillName, data) {
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
        <label>SKILL.md 内容（只读）</label>
        <textarea readonly style="min-height: 350px; font-family: monospace; background:#f5f5f5; color:#666; resize: vertical;">${escapeHtml(data.markdown || '')}</textarea>
      </div>
      ${data.resources && data.resources.length > 0 ? `
      <div class="form-group">
        <label>资源文件</label>
        <div class="skill-resource-list">
          ${data.resources.map(r => `<span class="skill-resource-tag">📄 ${escapeHtml(r.name || r)}</span>`).join('')}
        </div>
      </div>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="closeAgentSkillViewerBtn" style="width: auto;">关闭</button>
    </div>
  `;

  modalOverlay.appendChild(modalContainer);
  document.body.appendChild(modalOverlay);

  const closeModal = () => modalOverlay.remove();
  modalOverlay.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modalOverlay.querySelector('#closeAgentSkillViewerBtn').addEventListener('click', closeModal);
}

/**
 * 获取 Agent 连接信息
 */
async function getAgentConnection() {
  const result = await chrome.storage.local.get(['agentUrl', 'agentToken']);
  agentBaseUrl = result.agentUrl || null;
  agentToken = result.agentToken || null;
  agentConnected = !!(agentBaseUrl && agentToken);
  return { url: agentBaseUrl, token: agentToken, connected: agentConnected };
}

/**
 * 通用 Agent API 请求
 */
async function agentApi(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${agentToken}`
    }
  };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(`${agentBaseUrl}${path}`, opts);
  return resp.json();
}

// ==================== MCP 服务器管理 ====================

/**
 * 获取 MCP 服务器列表
 */
async function loadMcpServers() {
  await getAgentConnection();
  if (!agentConnected) return { servers: [] };
  try {
    return await agentApi('GET', '/api/mcp/servers');
  } catch {
    return { servers: [] };
  }
}

/**
 * 渲染 MCP 服务器列表
 */
function renderMcpServers(servers) {
  const container = document.getElementById('mcpServerList');
  if (!container) return;

  cachedMcpServers = servers || [];

  if (!agentConnected) {
    container.innerHTML = `
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">🔌</div>
        <div class="toolbox-empty-title">代理未连接</div>
        <div class="toolbox-empty-desc">请先在「代理」Tab 中连接 Agent 服务后，再配置 MCP 服务器</div>
      </div>`;
    return;
  }

  if (!servers || servers.length === 0) {
    container.innerHTML = `
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">📦</div>
        <div class="toolbox-empty-title">暂无 MCP 服务器</div>
        <div class="toolbox-empty-desc">点击下方按钮添加 MCP 服务器，扩展 AI 助手的工具能力</div>
      </div>`;
    return;
  }

  container.innerHTML = servers.map(s => {
    // 编辑中的服务器显示编辑表单
    if (s.id === editingMcpId) {
      return `
        <div class="mcp-server-card editing">
          <div class="mcp-add-form">
            <div class="mcp-add-form-row">
              <input type="text" id="mcpEditId" value="${escapeHtml(s.id)}" placeholder="服务器 ID" class="toolbox-input">
              <input type="text" id="mcpEditName" value="${escapeHtml(s.name || '')}" placeholder="显示名称" class="toolbox-input">
            </div>
            <div class="mcp-add-form-row">
              <input type="text" id="mcpEditCommand" value="${escapeHtml(s.command || '')}" placeholder="命令路径" class="toolbox-input" style="flex: 2;">
              <input type="text" id="mcpEditArgs" value="${escapeHtml((s.args || []).join(' '))}" placeholder="参数，空格分隔" class="toolbox-input" style="flex: 3;">
            </div>
            <div class="mcp-env-section">
              <div class="mcp-env-header">
                <span class="mcp-env-title">环境变量</span>
                <span class="mcp-env-hint">（敏感值优先在宿主机 shell 配置中 export，此处仅用于 MCP 专用变量）</span>
              </div>
              <div class="mcp-env-rows" id="mcpEditEnvRows">
                ${renderEnvVarRows(s.env || {})}
              </div>
              <button type="button" class="toolbox-btn mcp-env-add-row" data-action="add-env-row" data-target="mcpEditEnvRows" style="font-size: 12px; padding: 2px 10px;">+ 添加变量</button>
            </div>
            <div class="mcp-add-form-actions">
              <button class="toolbox-btn toolbox-btn-cancel" data-mcp-id="${escapeHtml(s.id)}" data-action="cancel-edit">取消</button>
              <button class="toolbox-btn toolbox-btn-primary" data-mcp-id="${escapeHtml(s.id)}" data-action="save-edit">保存</button>
            </div>
          </div>
        </div>`;
    }

    const statusClass = s.connected ? 'connected' : 'disconnected';
    const statusText = s.connected ? '已连接' : '未连接';
    const statusDot = s.connected ? '🟢' : '🔴';
    const toolCount = s.toolCount || 0;
    const enabledClass = s.enabled !== false ? 'enabled' : 'disabled';

    return `
      <div class="mcp-server-card ${enabledClass}">
        <div class="mcp-server-header">
          <div class="mcp-server-info">
            <span class="mcp-server-status ${statusClass}" title="${statusText}">${statusDot}</span>
            <span class="mcp-server-name">${escapeHtml(s.name || s.id)}</span>
            <span class="mcp-server-badge">${escapeHtml(s.transport || 'stdio')}</span>
          </div>
          <div class="mcp-server-tools-count">${toolCount} 工具</div>
        </div>
        <div class="mcp-card-body${s.enabled === false ? ' disabled' : ''}">
          <div class="mcp-server-command">
            <code>${escapeHtml(s.command || '')} ${(s.args || []).map(escapeHtml).join(' ')}</code>
          </div>
          ${s.tools && s.tools.length > 0 ? `
          <div class="mcp-tools-section">
            <button class="mcp-tools-toggle" data-mcp-id="${escapeHtml(s.id)}" data-action="toggle-tools">
              &#9654; 查看 ${s.tools.length} 个工具
            </button>
            <div class="mcp-tools-list" id="mcp-tools-${escapeHtml(s.id)}" style="display:none;">
              ${s.tools.map(t => `
                <div class="mcp-tool-item">
                  <div class="mcp-tool-name">${escapeHtml(t.name)}</div>
                  <div class="mcp-tool-desc">${escapeHtml(t.description || '')}</div>
                </div>
              `).join('')}
            </div>
          </div>` : ''}
          <div class="mcp-server-actions">
          <label class="toolbox-toggle" title="${s.enabled !== false ? '启用中，点击禁用' : '已禁用，点击启用'}">
            <input type="checkbox" ${s.enabled !== false ? 'checked' : ''} data-mcp-id="${escapeHtml(s.id)}" data-action="toggle">
            <span class="toolbox-toggle-slider"></span>
          </label>
          ${s.connected
            ? `<button class="toolbox-btn toolbox-btn-warn" data-mcp-id="${escapeHtml(s.id)}" data-action="disconnect">断开</button>`
            : `<button class="toolbox-btn toolbox-btn-primary" data-mcp-id="${escapeHtml(s.id)}" data-action="connect">连接</button>`
          }
          <button class="toolbox-btn toolbox-btn-edit" data-mcp-id="${escapeHtml(s.id)}" data-action="edit">编辑</button>
          <button class="toolbox-btn toolbox-btn-danger" data-mcp-id="${escapeHtml(s.id)}" data-action="delete">删除</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

/**
 * 渲染环境变量输入行
 * @param {Object} envObj - { KEY: 'value', ... }
 * @returns {string} HTML
 */
function renderEnvVarRows(envObj = {}) {
  const entries = Object.entries(envObj);
  // 至少显示一个空行
  if (entries.length === 0) {
    entries.push(['', '']);
  }
  return entries.map(([key, value]) => `
    <div class="mcp-env-row">
      <input type="text" class="mcp-env-key toolbox-input" placeholder="变量名" value="${escapeHtml(key)}" style="flex: 1;">
      <div class="mcp-env-value-wrap token-input-wrapper" style="flex: 2;">
        <input type="password" class="mcp-env-value token-input" placeholder="值" value="${escapeHtml(value)}">
        <button type="button" class="mcp-env-eye toggle-token-btn" title="显示/隐藏" data-action="toggle-env-eye">
          <svg class="icon-eye-open" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <svg class="icon-eye-closed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        </button>
      </div>
      <button type="button" class="mcp-env-remove toolbox-btn toolbox-btn-danger" title="删除此行" data-action="remove-env-row" style="flex-shrink: 0;">×</button>
    </div>
  `).join('');
}

/**
 * 从容器中解析环境变量
 * @param {HTMLElement} container - 包含 .mcp-env-row 的容器
 * @returns {Object} env 对象
 */
function parseEnvVars(container) {
  const env = {};
  container.querySelectorAll('.mcp-env-row').forEach(row => {
    const key = row.querySelector('.mcp-env-key')?.value.trim();
    const value = row.querySelector('.mcp-env-value')?.value;
    if (key && value !== undefined) {
      env[key] = value;
    }
  });
  return Object.keys(env).length > 0 ? env : {};
}

/**
 * 处理环境变量 UI 操作（事件委托）
 * @param {Event} e - 点击事件
 * @returns {boolean} 是否已处理（true 表示已消费该事件）
 */
function handleEnvAction(e) {
  const actionBtn = e.target.closest('[data-action]');
  if (!actionBtn) return false;

  const action = actionBtn.dataset.action;

  if (action === 'toggle-env-eye') {
    const wrap = actionBtn.closest('.mcp-env-value-wrap');
    const input = wrap?.querySelector('.mcp-env-value');
    const iconOpen = wrap?.querySelector('.icon-eye-open');
    const iconClosed = wrap?.querySelector('.icon-eye-closed');
    if (input) {
      if (input.type === 'password') {
        input.type = 'text';
        if (iconOpen) iconOpen.style.display = 'none';
        if (iconClosed) iconClosed.style.display = 'block';
      } else {
        input.type = 'password';
        if (iconOpen) iconOpen.style.display = 'block';
        if (iconClosed) iconClosed.style.display = 'none';
      }
    }
    return true;
  }

  if (action === 'remove-env-row') {
    const row = actionBtn.closest('.mcp-env-row');
    row?.remove();
    return true;
  }

  if (action === 'add-env-row') {
    const targetId = actionBtn.dataset.target;
    const target = targetId ? document.getElementById(targetId) : null;
    if (target) {
      const newRow = document.createElement('div');
      newRow.className = 'mcp-env-row';
      newRow.innerHTML = `
        <input type="text" class="mcp-env-key toolbox-input" placeholder="变量名" style="flex: 1;">
        <div class="mcp-env-value-wrap token-input-wrapper" style="flex: 2;">
          <input type="password" class="mcp-env-value token-input" placeholder="值">
          <button type="button" class="mcp-env-eye toggle-token-btn" title="显示/隐藏" data-action="toggle-env-eye">
            <svg class="icon-eye-open" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <svg class="icon-eye-closed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          </button>
        </div>
        <button type="button" class="mcp-env-remove toolbox-btn toolbox-btn-danger" title="删除此行" data-action="remove-env-row" style="flex-shrink: 0;">×</button>
      `;
      target.appendChild(newRow);
      // 聚焦新行的变量名输入框
      const keyInput = newRow.querySelector('.mcp-env-key');
      if (keyInput) setTimeout(() => keyInput.focus(), 0);
    }
    return true;
  }

  return false;
}

/**
 * 显示添加 MCP 服务器表单
 */
function showAddMcpForm() {
  const container = document.getElementById('mcpAddForm');
  if (!container) return;

  container.innerHTML = `
    <div class="mcp-add-form">
      <div class="mcp-add-form-row">
        <input type="text" id="mcpAddId" placeholder="服务器 ID（唯一标识）" class="toolbox-input">
        <input type="text" id="mcpAddName" placeholder="显示名称" class="toolbox-input">
      </div>
      <div class="mcp-add-form-row">
        <input type="text" id="mcpAddCommand" placeholder="命令路径，如 npx、python" class="toolbox-input" style="flex: 2;">
        <input type="text" id="mcpAddArgs" placeholder="参数，空格分隔" class="toolbox-input" style="flex: 3;">
      </div>
      <div class="mcp-env-section">
        <div class="mcp-env-header">
          <span class="mcp-env-title">环境变量</span>
          <span class="mcp-env-hint">（敏感值优先在宿主机 shell 配置中 export，此处仅用于 MCP 专用变量）</span>
        </div>
        <div class="mcp-env-rows" id="mcpAddEnvRows">
          ${renderEnvVarRows()}
        </div>
        <button type="button" class="toolbox-btn mcp-env-add-row" data-action="add-env-row" data-target="mcpAddEnvRows" style="font-size: 12px; padding: 2px 10px;">+ 添加变量</button>
      </div>
      <div class="mcp-add-form-actions">
        <button class="toolbox-btn toolbox-btn-cancel" id="mcpAddCancel">取消</button>
        <button class="toolbox-btn toolbox-btn-primary" id="mcpAddConfirm">添加</button>
      </div>
    </div>`;
}

/**
 * 隐藏添加表单
 */
function hideAddMcpForm() {
  const container = document.getElementById('mcpAddForm');
  if (container) container.innerHTML = '';
}

/**
 * 添加 MCP 服务器
 */
async function addMcpServer(serverData) {
  try {
    const result = await agentApi('POST', '/api/mcp/servers', serverData);
    if (result.success) {
      return true;
    }
    throw new Error(result.error || '添加失败');
  } catch (err) {
    throw err;
  }
}

/**
 * 删除 MCP 服务器
 */
async function removeMcpServer(serverId) {
  try {
    const result = await agentApi('DELETE', '/api/mcp/servers', { id: serverId });
    if (result.success) return true;
    throw new Error(result.error || '删除失败');
  } catch (err) {
    throw err;
  }
}

/**
 * 连接 MCP 服务器
 */
async function connectMcpServer(serverId) {
  const result = await agentApi('POST', '/api/mcp/servers/connect', { id: serverId });
  if (result.success) return result;
  throw new Error(result.error || '连接失败');
}

/**
 * 断开 MCP 服务器
 */
async function disconnectMcpServer(serverId) {
  const result = await agentApi('POST', '/api/mcp/servers/disconnect', { id: serverId });
  if (result.success) return true;
  throw new Error(result.error || '断开失败');
}

/**
 * 切换 MCP 服务器启用状态
 */
async function toggleMcpServer(serverId, enabled) {
  const result = await agentApi('PUT', '/api/mcp/servers/toggle', { id: serverId, enabled });
  if (result.success) return true;
  throw new Error(result.error || '操作失败');
}

// ==================== Skill 管理 ====================

/**
 * 获取 Skill 列表
 */
async function loadSkills() {
  await getAgentConnection();
  if (!agentConnected) return { skills: [] };
  try {
    return await agentApi('GET', '/api/skill/list');
  } catch {
    return { skills: [] };
  }
}

/**
 * 渲染 Skill 列表（区分 Workflow 和 Agent 类型）
 */
function renderSkills(skills) {
  const container = document.getElementById('skillList');
  if (!container) return;

  if (!agentConnected) {
    container.innerHTML = `
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">🔌</div>
        <div class="toolbox-empty-title">代理未连接</div>
        <div class="toolbox-empty-desc">请先在「代理」Tab 中连接 Agent 服务后，再管理 Skill</div>
      </div>`;
    return;
  }

  if (!skills || skills.length === 0) {
    container.innerHTML = `
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">🧩</div>
        <div class="toolbox-empty-title">暂无 Skill</div>
        <div class="toolbox-empty-desc">
          支持两种 Skill 类型：<br>
          <strong>Workflow Skill</strong>：导入 JSON 文件（确定性自动化流程）<br>
          <strong>Agent Skill</strong>：导入 SKILL.md 目录/Zip/URL（AI 能力扩展）
        </div>
      </div>`;
    return;
  }

  const workflowSkills = skills.filter(s => s.type !== 'agent');
  const agentSkills = skills.filter(s => s.type === 'agent');

  let html = '';

  function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return { content: text, truncated: false };
  return {
    content: text.substring(0, maxLength) + '...',
    truncated: true,
    full: text
  };
}

// Workflow Skills
  if (workflowSkills.length > 0) {
    html += '<div class="skill-section-title">Workflow Skills（自动化流程）</div>';
    html += workflowSkills.map(s => {
      const desc = truncateText(s.description || '', 120);
      const hasParams = s.parameters && s.parameters.properties && Object.keys(s.parameters.properties).length > 0;
      return `
      <div class="skill-card skill-card-workflow${s.enabled === false ? ' skill-disabled' : ''}">
        <div class="skill-card-header">
          <div class="skill-card-info">
            <span class="skill-card-icon">⚙️</span>
            <span class="skill-card-name">${escapeHtml(s.name)}</span>
            <span class="skill-card-version">v${escapeHtml(s.version || '1.0')}</span>
            <span class="skill-card-badge badge-workflow">Workflow</span>
            ${s.enabled === false ? '<span class="skill-card-badge badge-disabled">已停用</span>' : ''}
            <span class="skill-card-step-count">${s.stepCount || 0} 步骤</span>
          </div>
        </div>
        <div class="skill-card-body${s.enabled === false ? ' disabled' : ''}">
          <div class="skill-card-desc">${escapeHtml(desc.content)}</div>
          ${desc.truncated ? `<button class="skill-expand-btn" data-skill-name="${escapeHtml(s.name)}" data-target="desc" data-full="${encodeURIComponent(s.description || '')}">展开</button>` : ''}
          ${hasParams ? `
          <div class="skill-card-params">
            ${renderSkillParams(s.parameters)}
          </div>` : ''}
          <div class="skill-card-actions">
            ${s.enabled !== false ? `<button class="toolbox-btn toolbox-btn-primary" data-skill-name="${escapeHtml(s.name)}" data-action="run-skill">运行</button>` : ''}
            <button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${escapeHtml(s.name)}" data-action="toggle-skill">${s.enabled === false ? '启用' : '停用'}</button>
            <button class="toolbox-btn toolbox-btn-danger" data-skill-name="${escapeHtml(s.name)}" data-action="delete-skill">删除</button>
          </div>
        </div>
      </div>
    `}).join('');
  }

  // Agent Skills
  if (agentSkills.length > 0) {
    html += '<div class="skill-section-title">Agent Skills（AI 能力扩展）</div>';
    html += agentSkills.map(s => {
      const isBuiltin = s.builtin === true;
      const canEdit = s.editable !== false;
      const canDelete = s.deletable !== false;
      const desc = truncateText(s.description || '', 120);
      const hasResources = s.resources && s.resources.length > 0;
      const showResourcesInFull = !hasResources || s.resources.length <= 5;
      return `
      <div class="skill-card skill-card-agent${s.enabled === false ? ' skill-disabled' : ''}">
        <div class="skill-card-header">
          <div class="skill-card-info">
            <span class="skill-card-icon">🤖</span>
            <span class="skill-card-name">${escapeHtml(s.name)}</span>
            <span class="skill-card-version">v${escapeHtml(s.version || '1.0')}</span>
            <span class="skill-card-badge badge-agent">Agent</span>
            ${isBuiltin ? '<span class="skill-card-badge badge-builtin">内置</span>' : ''}
            ${s.enabled === false ? '<span class="skill-card-badge badge-disabled">已停用</span>' : ''}
            <span class="skill-card-step-count">${s.resourceCount || 0} 资源</span>
          </div>
        </div>
        <div class="skill-card-body${s.enabled === false ? ' disabled' : ''}">
          <div class="skill-card-desc">${escapeHtml(desc.content)}</div>
          ${desc.truncated ? `<button class="skill-expand-btn" data-skill-name="${escapeHtml(s.name)}" data-target="desc" data-full="${encodeURIComponent(s.description || '')}">展开</button>` : ''}
          ${hasResources ? `
          <div class="skill-card-params">
            ${showResourcesInFull 
              ? s.resources.map(r => `<span class="skill-param-tag" title="大小: ${r.size} 字节">📄 ${escapeHtml(r.name)}</span>`).join('')
              : s.resources.slice(0, 5).map(r => `<span class="skill-param-tag" title="大小: ${r.size} 字节">📄 ${escapeHtml(r.name)}</span>`).join('') + `<button class="skill-expand-btn skill-expand-resources" data-skill-name="${escapeHtml(s.name)}" data-target="resources" data-full="${encodeURIComponent(JSON.stringify(s.resources))}">+${s.resources.length - 5} 更多</button>`
            }
          </div>` : ''}
          <div class="skill-card-actions">
            ${canEdit ? `<button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${escapeHtml(s.name)}" data-action="edit-agent-skill">编辑 SKILL.md</button>` : `<button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${escapeHtml(s.name)}" data-action="view-agent-skill">查看详情</button>`}
            <button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${escapeHtml(s.name)}" data-action="toggle-skill">${s.enabled === false ? '启用' : '停用'}</button>
            ${canDelete ? `<button class="toolbox-btn toolbox-btn-danger" data-skill-name="${escapeHtml(s.name)}" data-action="delete-skill">删除</button>` : ''}
          </div>
        </div>
      </div>
    `}).join('');
  }

  container.innerHTML = html;
}

/**
 * 渲染 Skill 参数
 */
function renderSkillParams(parameters) {
  if (!parameters || !parameters.properties) return '';
  const props = parameters.properties;
  const required = parameters.required || [];

  return Object.entries(props).map(([key, prop]) => {
    const isRequired = required.includes(key);
    return `<span class="skill-param-tag ${isRequired ? 'required' : ''}" title="${escapeHtml(prop.description || '')}">${escapeHtml(key)}${isRequired ? '*' : ''}</span>`;
  }).join('');
}

/**
 * 导入 Workflow Skill
 */
async function importSkill(skillDef) {
  const result = await agentApi('POST', '/api/skill/import', skillDef);
  if (result.success) return true;
  throw new Error(result.error || '导入失败');
}

/**
 * 删除 Skill
 */
async function deleteSkill(name) {
  const result = await agentApi('DELETE', '/api/skill/delete', { name });
  if (result.success) return true;
  throw new Error(result.error || '删除失败');
}

/**
 * 切换 Skill 启用/停用状态
 */
async function toggleSkill(name) {
  const result = await agentApi('POST', '/api/skill/toggle', { name });
  if (result.success) return result.enabled !== false;
  throw new Error(result.error || '操作失败');
}

/**
 * 运行 Workflow Skill
 */
async function runSkill(name, params = {}) {
  const result = await agentApi('POST', '/api/skill/run', { name, params });
  return result;
}

/**
 * 解析 Skill 的参数定义（兼容 JSON Schema 格式）
 */
function parseSkillParams(skill) {
  const params = skill.parameters || {};
  // 兼容 JSON Schema 格式: { type: "object", properties: {...}, required: [...] }
  const props = params.properties || {};
  const requiredList = Array.isArray(params.required) ? params.required : [];
  const entries = Object.entries(props);
  return {
    hasRequired: entries.length > 0,
    required: entries.filter(([key]) => requiredList.includes(key)),
    optional: entries.filter(([key]) => !requiredList.includes(key)),
    all: entries
  };
}

/**
 * 显示 Skill 参数输入弹窗
 * @returns {Promise<Object|null>} - 用户填写的参数，取消则返回 null
 */
function showSkillParamsDialog(skillName, paramsDef) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    // 生成参数输入字段
    const requiredFields = paramsDef.required.map(([key, def]) => `
      <div class="form-group">
        <label for="skill-param-${key}">${escapeHtml(def.description || key)} <span class="param-required">*必填</span></label>
        <input type="text" id="skill-param-${key}" class="form-input"
               placeholder="${escapeHtml(def.type || 'string')}${def.default !== undefined ? ' (默认: ' + def.default + ')' : ''}" />
      </div>
    `).join('');

    const optionalFields = paramsDef.optional.map(([key, def]) => `
      <div class="form-group">
        <label for="skill-param-${key}">${escapeHtml(def.description || key)} <span class="param-optional">选填</span></label>
        <input type="text" id="skill-param-${key}" class="form-input"
               placeholder="${escapeHtml(def.type || 'string')}${def.default !== undefined ? ' (默认: ' + def.default + ')' : ''}" />
      </div>
    `).join('');

    overlay.innerHTML = `
      <div class="modal-content" style="max-width:500px;">
        <div class="modal-header">
          <h2>运行 Skill "${escapeHtml(skillName)}"</h2>
          <button class="modal-close-btn" id="skillParamsCancel">×</button>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 16px;color:#666;font-size:13px;">请填写以下参数后运行：</p>
          ${requiredFields}
          ${paramsDef.required.length > 0 && paramsDef.optional.length > 0 ? '<div style="border-top:1px dashed #e0e0e0;margin:12px 0;"></div>' : ''}
          ${optionalFields}
        </div>
        <div class="modal-actions">
          <button class="btn btn-cancel" id="skillParamsCancel">取消</button>
          <button class="btn btn-primary" id="skillParamsSubmit">运行</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); resolve(null); };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelectorAll('#skillParamsCancel').forEach(btn => {
      btn.addEventListener('click', close);
    });

    overlay.querySelector('#skillParamsSubmit').addEventListener('click', () => {
      const values = {};
      let allRequiredFilled = true;
      for (const [key, def] of paramsDef.required) {
        const input = overlay.querySelector(`#skill-param-${key}`);
        const val = input?.value?.trim();
        if (!val) {
          allRequiredFilled = false;
          if (input) input.style.borderColor = '#e53e3e';
        } else {
          values[key] = val;
          if (input) input.style.borderColor = '';
        }
      }
      for (const [key] of paramsDef.optional) {
        const input = overlay.querySelector(`#skill-param-${key}`);
        if (input) {
          values[key] = input.value;
        }
      }
      if (!allRequiredFilled) return;
      overlay.remove();
      resolve(values);
    });

    // 回车提交
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        overlay.querySelector('#skillParamsSubmit').click();
      }
    });

    // 自动聚焦第一个输入框
    const firstInput = overlay.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  });
}
function showSkillRunResult(name, skillInfo, result) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'skillResultModal';

  const steps = skillInfo?.success ? (skillInfo.skill?.steps || []) : [];
  const stepMap = {};
  steps.forEach(s => { stepMap[s.id] = s; });

  const results = result.results || {};
  const stepIds = Object.keys(results);

  let stepsHtml = '';
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  if (stepIds.length === 0) {
    stepsHtml = `<div style="padding:16px;text-align:center;color:#999;">${result.error || '无执行结果'}</div>`;
  } else {
    stepsHtml = stepIds.map((stepId, idx) => {
      const stepRes = results[stepId];
      const stepDef = stepMap[stepId] || {};
      const stepName = stepDef.name || stepDef.description || stepId;
      const tool = stepDef.tool || '';
      const isSuccess = stepRes?.success;
      const isSkipped = stepRes?.skipped;

      if (isSkipped) skipCount++;
      else if (isSuccess) successCount++;
      else failCount++;

      const statusIcon = isSkipped ? '⊘' : (isSuccess ? '✓' : '✗');
      const statusClass = isSkipped ? 'step-skipped' : (isSuccess ? 'step-success' : 'step-error');
      const outputText = isSkipped
        ? (stepRes.message || '条件不满足，已跳过')
        : (isSuccess
          ? (stepRes.content || stepRes.stdout || stepRes.message || '执行成功')
          : (stepRes.error || '执行失败'));

      // 截断过长输出
      const truncated = outputText.length > 500
        ? outputText.substring(0, 500) + `\n... (共 ${outputText.length} 字符，已截断)`
        : outputText;

      return `
        <div class="skill-run-step ${statusClass}">
          <div class="step-header">
            <span class="step-status-icon">${statusIcon}</span>
            <span class="step-title">${escapeHtml(stepName)}</span>
            ${tool ? `<span class="step-tool-tag">${escapeHtml(tool)}</span>` : ''}
          </div>
          <pre class="step-output">${escapeHtml(truncated)}</pre>
        </div>
      `;
    }).join('');
  }

  const icon = result.success ? '✓' : '✗';
  const statusText = result.success ? '执行完成' : '执行失败';
  const summaryText = result.success
    ? `${successCount} 成功, ${failCount} 失败, ${skipCount} 跳过`
    : (result.error || '未知错误');

  overlay.innerHTML = `
    <div class="modal-content" style="max-width:700px;max-height:85vh;">
      <div class="modal-header">
        <h2>${icon} Skill "${escapeHtml(name)}" ${statusText}</h2>
        <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body" style="max-height:calc(85vh - 120px);overflow-y:auto;">
        <div class="skill-run-summary">${escapeHtml(summaryText)}</div>
        ${stepsHtml}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary modal-close-btn">关闭</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('modal-close-btn')) {
      overlay.remove();
    }
  });
}

/**
 * 重新加载 Skill
 */
async function reloadSkills() {
  const result = await agentApi('POST', '/api/skill/reload');
  return result;
}

/**
 * 导入 Agent Skill（从 JSON/Markdown/Zip/URL）
 */
async function importAgentSkill(skillData) {
  // 判断导入方式
  if (skillData.markdown || skillData.prompt) {
    // Markdown 内容直接保存
    return await agentApi('POST', '/api/skill/save-markdown', skillData);
  } else if (skillData.zipData) {
    // Base64 Zip 导入
    return await agentApi('POST', '/api/skill/import-zip', skillData);
  } else if (skillData.url) {
    // URL 导入
    return await agentApi('POST', '/api/skill/import-url', skillData);
  }
  throw new Error('无效的 Skill 数据格式');
}

/**
 * 获取 Agent Skill 的 SKILL.md 内容
 */
async function getAgentSkillMarkdown(name) {
  return await agentApi('GET', `/api/skill/markdown?name=${encodeURIComponent(name)}`);
}

/**
 * 显示 Agent Skill 编辑器弹窗
 */
function showAgentSkillEditor(skillName, existingData = null) {
  const existingModal = document.getElementById('agentSkillEditorModal');
  if (existingModal) existingModal.remove();

  const isEdit = !!existingData;

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.id = 'agentSkillEditorModal';

  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal-content agent-skill-editor-container';
  modalContainer.style.width = '700px';
  modalContainer.style.maxHeight = '85vh';

  modalContainer.innerHTML = `
    <div class="modal-header">
      <h3>${isEdit ? '编辑 Agent Skill' : '新建 Agent Skill'}</h3>
      <button class="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Skill 名称</label>
        <input type="text" id="agentSkillName" placeholder="e.g. code-review" value="${escapeHtml(isEdit ? existingData.name : '')}" ${isEdit ? 'readonly' : ''}>
      </div>
      <div class="form-group">
        <label>描述</label>
        <input type="text" id="agentSkillDesc" placeholder="简要描述此 Skill 的功能" value="${escapeHtml(isEdit ? (existingData.frontmatter?.description || '') : '')}">
      </div>
      <div class="form-group">
        <label>版本</label>
        <input type="text" id="agentSkillVersion" placeholder="1.0" value="${escapeHtml(isEdit ? (existingData.frontmatter?.version || '1.0') : '1.0')}">
      </div>
      <div class="form-group">
        <label>SKILL.md 内容（Markdown）</label>
        <textarea id="agentSkillMarkdown" style="min-height: 300px; font-family: monospace;" placeholder="# Skill 名称&#10;&#10;## 何时使用&#10;- 条件1&#10;- 条件2&#10;&#10;## 执行步骤&#10;1. 步骤1&#10;2. 步骤2">${escapeHtml(isEdit ? (existingData.markdown || '') : '')}</textarea>
      </div>
      ${isEdit && existingData.resources && existingData.resources.length > 0 ? `
      <div class="form-group">
        <label>已有资源文件</label>
        <div class="skill-resource-list">
          ${existingData.resources.map(r => `<span class="skill-resource-tag">📄 ${escapeHtml(r.name)} (${r.size} 字节)</span>`).join('')}
        </div>
      </div>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="cancelAgentSkillBtn">取消</button>
      <button class="btn btn-primary" id="saveAgentSkillBtn" style="width: auto;">保存</button>
    </div>
  `;

  modalOverlay.appendChild(modalContainer);
  document.body.appendChild(modalOverlay);

  // 关闭
  const closeModal = () => modalOverlay.remove();
  modalOverlay.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modalOverlay.querySelector('#cancelAgentSkillBtn').addEventListener('click', closeModal);

  // 保存
  modalOverlay.querySelector('#saveAgentSkillBtn').addEventListener('click', async () => {
    const name = modalOverlay.querySelector('#agentSkillName').value.trim();
    const description = modalOverlay.querySelector('#agentSkillDesc').value.trim();
    const version = modalOverlay.querySelector('#agentSkillVersion').value.trim() || '1.0';
    const markdown = modalOverlay.querySelector('#agentSkillMarkdown').value.trim();
    const enabled = isEdit ? (existingData.frontmatter?.enabled !== false) : true;

    if (!name) return showToast('请输入 Skill 名称', 'error');
    if (!markdown) return showToast('请输入 SKILL.md 内容', 'error');

    try {
      const result = await agentApi('POST', '/api/skill/save-markdown', {
        name, description, version, markdown, enabled
      });
      if (result.success) {
        showToast(`Agent Skill "${name}" 保存成功`, 'success');
        closeModal();
        refreshToolbox();
      } else {
        showToast(result.error || '保存失败', 'error');
      }
    } catch (err) {
      showToast('保存失败: ' + err.message, 'error');
    }
  });
}

/**
 * 显示 Zip/URL 导入弹窗
 */
function showImportDialog() {
  const existingModal = document.getElementById('skillImportModal');
  if (existingModal) existingModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.id = 'skillImportModal';

  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal-content';
  modalContainer.style.width = '640px';

  modalContainer.innerHTML = `
    <div class="modal-header">
      <h3>导入 Skill</h3>
      <button class="modal-close-btn">&times;</button>
    </div>
    <div style="padding: 0 24px 8px 24px;">
      <div class="import-tabs">
        <button class="import-tab active" data-tab="json">JSON 导入</button>
        <button class="import-tab" data-tab="markdown">新建编写</button>
        <button class="import-tab" data-tab="zip">Zip 包</button>
        <button class="import-tab" data-tab="url">URL 导入</button>
      </div>

      <!-- JSON Import -->
      <div class="import-panel active" data-panel="json">
        <div class="import-panel-desc">导入 JSON 格式的 Workflow Skill（确定性自动化流程）</div>
        <div class="upload-drop-zone" id="jsonDropZone">
          <span class="upload-icon">📄</span>
          <span class="upload-text">点击选择 JSON 文件或拖拽到此处</span>
          <span class="upload-hint">支持 .json 格式的 Workflow Skill 定义文件</span>
          <input type="file" id="skillJsonFile" accept=".json">
        </div>
      </div>

      <!-- Agent Skill Markdown -->
      <div class="import-panel" data-panel="markdown">
        <div class="import-panel-desc">直接编写 SKILL.md 内容，创建 Agent Skill（AI 能力扩展）</div>
        <div class="form-group">
          <label>Skill 名称</label>
          <input type="text" id="quickAgentName" placeholder="e.g. code-review 或 deploy-to-server">
        </div>
        <div class="form-group">
          <label>描述</label>
          <input type="text" id="quickAgentDesc" placeholder="简要描述此 Skill 的功能和适用场景">
        </div>
        <div class="form-group">
          <label>SKILL.md 内容（Markdown）</label>
          <textarea id="quickAgentMarkdown" style="min-height: 180px; font-family: 'SF Mono', 'Monaco', 'Menlo', monospace; font-size: 13px; line-height: 1.6;" placeholder="## 何时使用&#10;- 条件1&#10;- 条件2&#10;&#10;## 执行步骤&#10;1. 步骤1&#10;2. 步骤2"></textarea>
        </div>
      </div>

      <!-- Zip Import -->
      <div class="import-panel" data-panel="zip">
        <div class="import-panel-desc">导入包含 SKILL.md 的 Zip 压缩包，可附带 scripts/templates/assets 等辅助资源</div>
        <div class="upload-drop-zone" id="zipDropZone">
          <span class="upload-icon">📦</span>
          <span class="upload-text">点击选择 Zip 文件或拖拽到此处</span>
          <span class="upload-hint">Zip 包内需包含 SKILL.md 文件，可选的 scripts/ templates/ assets/ 子目录</span>
          <input type="file" id="skillZipFile" accept=".zip">
        </div>
      </div>

      <!-- URL Import -->
      <div class="import-panel" data-panel="url">
        <div class="import-panel-desc">从远程 URL 下载 Skill 的 Zip 包并自动导入</div>
        <div class="form-group">
          <label>下载地址</label>
          <div class="url-input-wrapper">
            <span class="url-input-icon">🔗</span>
            <input type="url" id="skillUrl" placeholder="https://example.com/skills/my-skill.zip">
          </div>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="cancelImportBtn">取消</button>
      <button class="btn btn-primary" id="confirmImportBtn" style="width: auto;">导入</button>
    </div>
  `;

  modalOverlay.appendChild(modalContainer);
  document.body.appendChild(modalOverlay);

  const closeModal = () => modalOverlay.remove();
  modalOverlay.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modalOverlay.querySelector('#cancelImportBtn').addEventListener('click', closeModal);

  // Tab 切换
  modalOverlay.querySelectorAll('.import-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modalOverlay.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      modalOverlay.querySelectorAll('.import-panel').forEach(p => p.classList.remove('active'));
      modalOverlay.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');
    });
  });

  // Drop Zone 点击触发 file input
  const setupDropZone = (zoneId, fileInputId) => {
    const zone = modalOverlay.querySelector(zoneId);
    const input = modalOverlay.querySelector(fileInputId);
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = '#667eea'; zone.style.background = '#f5f7ff'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = '#d0d5dd'; zone.style.background = '#fafbfc'; });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.style.borderColor = '#d0d5dd';
      zone.style.background = '#fafbfc';
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        input.files = files;
        showDropFileName(zone, files[0].name);
      }
    });

    input.addEventListener('change', () => {
      if (input.files && input.files[0]) {
        showDropFileName(zone, input.files[0].name);
      }
    });
  };

  const showDropFileName = (zone, name) => {
    zone.classList.add('has-file');
    const existing = zone.querySelector('.file-name');
    if (existing) existing.remove();
    const nameEl = document.createElement('span');
    nameEl.className = 'file-name';
    nameEl.textContent = `✓ ${name}`;
    zone.appendChild(nameEl);
  };

  setupDropZone('#jsonDropZone', '#skillJsonFile');
  setupDropZone('#zipDropZone', '#skillZipFile');

  // 确认导入
  modalOverlay.querySelector('#confirmImportBtn').addEventListener('click', async () => {
    const activeTab = modalOverlay.querySelector('.import-tab.active')?.dataset.tab;

    try {
      if (activeTab === 'json') {
        const fileInput = modalOverlay.querySelector('#skillJsonFile');
        const file = fileInput.files[0];
        if (!file) return showToast('请选择 JSON 文件', 'warning');

        const text = await file.text();
        const skillDef = JSON.parse(text);
        await importSkill(skillDef);
        showToast(`Workflow Skill "${skillDef.name}" 导入成功`, 'success');
      } else if (activeTab === 'markdown') {
        const name = modalOverlay.querySelector('#quickAgentName').value.trim();
        const description = modalOverlay.querySelector('#quickAgentDesc').value.trim();
        const markdown = modalOverlay.querySelector('#quickAgentMarkdown').value.trim();
        if (!name) return showToast('请输入 Skill 名称', 'warning');
        if (!markdown) return showToast('请输入 SKILL.md 内容', 'warning');

        const result = await agentApi('POST', '/api/skill/save-markdown', {
          name, description, version: '1.0', markdown
        });
        if (result.success) {
          showToast(`Agent Skill "${name}" 创建成功`, 'success');
        } else {
          return showToast(result.error || '创建失败', 'error');
        }
      } else if (activeTab === 'zip') {
        const fileInput = modalOverlay.querySelector('#skillZipFile');
        const file = fileInput.files[0];
        if (!file) return showToast('请选择 Zip 文件', 'warning');

        // 文件大小限制：50MB
        const MAX_ZIP_SIZE = 50 * 1024 * 1024;
        if (file.size > MAX_ZIP_SIZE) {
          return showToast('文件过大，最大支持 50MB', 'warning');
        }

        // 使用 FileReader 安全地将文件转为 base64
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = () => reject(new Error('文件读取失败'));
          reader.readAsDataURL(file);
        });
        const result = await agentApi('POST', '/api/skill/import-zip', { zipData: base64 });
        if (result.success) {
          showToast(`Agent Skill "${result.skill?.name || 'unknown'}" 导入成功`, 'success');
        } else {
          return showToast(result.error || '导入失败', 'error');
        }
      } else if (activeTab === 'url') {
        const url = modalOverlay.querySelector('#skillUrl').value.trim();
        if (!url) return showToast('请输入 URL', 'warning');

        const result = await agentApi('POST', '/api/skill/import-url', { url });
        if (result.success) {
          showToast(`Agent Skill "${result.skill?.name || 'unknown'}" 导入成功`, 'success');
        } else {
          return showToast(result.error || '导入失败', 'error');
        }
      }

      closeModal();
      refreshToolbox();
    } catch (err) {
      showToast('导入失败: ' + err.message, 'error');
    }
  });
}

// ==================== 主入口 ====================

/**
 * 通知 Extension Background 重新加载 MCP 工具
 */
function notifyMcpChange() {
  try {
    chrome.runtime.sendMessage({ type: 'RELOAD_MCP_TOOLS' }, (resp) => {
      if (resp?.success) {
        console.log(`[Toolbox] Background 已重载 ${resp.count} 个 MCP 工具`);
      }
    });
  } catch (_) { /* 忽略错误，background 可能未运行 */ }
}

/**
 * 刷新整个工具箱面板
 */
async function refreshToolbox() {
  const [mcpResult, skillResult] = await Promise.all([
    loadMcpServers(),
    loadSkills()
  ]);

  renderMcpServers(mcpResult.servers || []);
  renderSkills(skillResult.skills || []);

  // 更新顶部连接状态提示
  const statusEl = document.getElementById('toolboxAgentStatus');
  if (statusEl) {
    if (agentConnected) {
      statusEl.innerHTML = `<span class="toolbox-status-dot connected"></span> 代理已连接 - 支持MCP和Skill`;
      statusEl.className = 'toolbox-agent-status connected';
    } else {
      statusEl.innerHTML = `<span class="toolbox-status-dot disconnected"></span> 代理未连接 — 请在「代理」Tab 中连接`;
      statusEl.className = 'toolbox-agent-status disconnected';
    }
  }

  // 禁用/启用操作按钮
  const disabled = !agentConnected;
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
  const server = cachedMcpServers.find(s => s.id === serverId);
  if (!server) return;

  editingMcpId = serverId;
  const container = document.getElementById('mcpServerList');
  if (!container) return;

  // 重新渲染，编辑中的卡片替换为表单
  renderMcpServers(cachedMcpServers);
}

/**
 * 取消编辑
 */
function cancelEditMcp() {
  editingMcpId = null;
  renderMcpServers(cachedMcpServers);
}

/**
 * 保存编辑
 */
async function saveMcpEdit() {
  const idInput = document.getElementById('mcpEditId');
  const nameInput = document.getElementById('mcpEditName');
  const cmdInput = document.getElementById('mcpEditCommand');
  const argsInput = document.getElementById('mcpEditArgs');

  const id = idInput?.value.trim();
  const name = nameInput?.value.trim();
  const command = cmdInput?.value.trim();
  const argsRaw = argsInput?.value.trim();

  if (!id || !command) {
    showToolboxToast('请填写服务器 ID 和命令路径', 'warning');
    return;
  }

  const serverData = {
    id,
    name: name || id,
    command,
    args: argsRaw ? argsRaw.split(/\s+/) : [],
    env: parseEnvVars(document.getElementById('mcpEditEnvRows')),
    enabled: cachedMcpServers.find(s => s.id === editingMcpId)?.enabled !== false
  };

  try {
    await addMcpServer(serverData);

    // 如果编辑前处于连接状态，断开旧连接并使用新配置重连
    const wasConnected = cachedMcpServers.find(s => s.id === editingMcpId)?.connected;
    if (wasConnected) {
      showToolboxToast('正在重新连接...', 'info');
      // 用旧 ID 断开，用新 ID 重连（防止 ID 被修改的情况）
      await disconnectMcpServer(editingMcpId);
      // 短暂等待确保旧进程完全退出
      await new Promise(r => setTimeout(r, 500));
      const connectResult = await connectMcpServer(id);
      if (connectResult.success) {
        showToolboxToast(`MCP 服务器更新成功，已重连（${connectResult.toolCount || 0} 工具）`, 'success');
      } else {
        const errMsg = connectResult.error || '未知错误，请检查命令与参数是否正确';
        showToolboxToast(`配置已更新，但重连失败: ${errMsg}`, 'warning');
      }
    } else {
      showToolboxToast('MCP 服务器更新成功', 'success');
    }

    editingMcpId = null;
    notifyMcpChange();
    await refreshToolbox();
  } catch (err) {
    showToolboxToast(`更新失败: ${err.message}`, 'error');
  }
}

/**
 * 更新全局开关的 UI 状态
 */
function updateGlobalToggleUI(type, enabled) {
  const label = document.getElementById(type === 'mcp' ? 'mcpToggleLabel' : 'skillToggleLabel');
  const section = document.getElementById(type === 'mcp' ? 'mcpSection' : 'skillSection');
  if (label) {
    label.textContent = enabled ? '已启用' : '已停用';
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
function initToolbox() {
  // 全局开关：MCP 服务
  const mcpToggle = document.getElementById('mcpGlobalToggle');
  const skillToggle = document.getElementById('skillGlobalToggle');
  const mcpToggleLabel = document.getElementById('mcpToggleLabel');
  const skillToggleLabel = document.getElementById('skillToggleLabel');
  const mcpSection = document.getElementById('mcpSection');
  const skillSection = document.getElementById('skillSection');

  // 加载全局开关状态
  chrome.storage.local.get(['mcpEnabled', 'skillsEnabled'], (result) => {
    const mcpEnabled = result.mcpEnabled !== false;
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
      showToolboxToast(`MCP 服务已${enabled ? '启用' : '停用'}`, 'info');
    });
  }

  // Skill 全局开关
  if (skillToggle) {
    skillToggle.addEventListener('change', () => {
      const enabled = skillToggle.checked;
      chrome.storage.local.set({ skillsEnabled: enabled });
      updateGlobalToggleUI('skill', enabled);
      showToolboxToast(`Skill 服务已${enabled ? '启用' : '停用'}`, 'info');
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
      // 环境变量操作
      if (handleEnvAction(e)) return;

      if (e.target.id === 'mcpAddCancel') {
        hideAddMcpForm();
      }
      if (e.target.id === 'mcpAddConfirm') {
        const id = document.getElementById('mcpAddId')?.value.trim();
        const name = document.getElementById('mcpAddName')?.value.trim();
        const command = document.getElementById('mcpAddCommand')?.value.trim();
        const argsRaw = document.getElementById('mcpAddArgs')?.value.trim();

        if (!id || !command) {
          showToolboxToast('请填写服务器 ID 和命令路径', 'warning');
          return;
        }

        const envRows = document.getElementById('mcpAddEnvRows');
        const serverData = {
          id,
          name: name || id,
          command,
          args: argsRaw ? argsRaw.split(/\s+/) : [],
          env: envRows ? parseEnvVars(envRows) : {},
          enabled: true
        };

        try {
          await addMcpServer(serverData);
          showToolboxToast('MCP 服务器添加成功', 'success');
          hideAddMcpForm();
          notifyMcpChange();
          await refreshToolbox();
        } catch (err) {
          showToolboxToast(`添加失败: ${err.message}`, 'error');
        }
      }
    });
  }

  // MCP 服务器列表事件委托
  const mcpList = document.getElementById('mcpServerList');
  if (mcpList) {
    mcpList.addEventListener('click', async (e) => {
      // 环境变量操作（不需要 serverId）
      if (handleEnvAction(e)) return;

      const btn = e.target.closest('button, input');
      if (!btn) return;

      const action = btn.dataset.action;
      const serverId = btn.dataset.mcpId;

      if (!action || !serverId) return;

      try {
        if (action === 'connect') {
          showToolboxToast('正在连接...', 'info');
          await connectMcpServer(serverId);
          showToolboxToast('连接成功', 'success');
          notifyMcpChange();
          await refreshToolbox();
        } else if (action === 'disconnect') {
          await disconnectMcpServer(serverId);
          showToolboxToast('已断开连接', 'success');
          notifyMcpChange();
          await refreshToolbox();
        } else if (action === 'toggle') {
          const enabled = btn.checked;
          await toggleMcpServer(serverId, enabled);
          showToolboxToast(enabled ? '已启用' : '已禁用', 'success');
          notifyMcpChange();
          await refreshToolbox();
        } else if (action === 'delete') {
          const confirmed = await showCustomConfirm('确定要删除该 MCP 服务器吗？', '删除确认');
          if (!confirmed) return;
          await removeMcpServer(serverId);
          showToolboxToast('删除成功', 'success');
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
              ? `&#9660; 收起 ${toolsList.children.length} 个工具`
              : `&#9654; 查看 ${toolsList.children.length} 个工具`;
          }
        }
      } catch (err) {
        showToolboxToast(`操作失败: ${err.message}`, 'error');
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
              const allTags = resources.map(r => `<span class="skill-param-tag" title="大小: ${r.size} 字节">📄 ${escapeHtml(r.name)}</span>`).join('');
              paramsContainer.innerHTML = allTags;
            }
          } catch (e) {
            console.error('Failed to expand resources:', e);
          }
        }
        return;
      }

      if (!action || !skillName) return;

      try {
        if (action === 'delete-skill') {
          const confirmed = await showCustomConfirm(`确定要删除 Skill "${skillName}" 吗？`, '删除确认');
          if (!confirmed) return;
          await deleteSkill(skillName);
          showToolboxToast('删除成功', 'success');
          await refreshToolbox();
        } else if (action === 'toggle-skill') {
          const enabled = await toggleSkill(skillName);
          showToolboxToast(`已${enabled ? '启用' : '停用'} Skill "${skillName}"`, 'success');
          await refreshToolbox();
        } else if (action === 'run-skill') {
          const skillInfo = await agentApi('GET', `/api/skill/detail?name=${encodeURIComponent(skillName)}`);
          if (!skillInfo?.success || !skillInfo.skill) {
            showToolboxToast(`获取 Skill 信息失败: ${skillInfo?.error || '未知错误'}`, 'error');
            return;
          }
          // 解析参数定义
          const paramsDef = parseSkillParams(skillInfo.skill);
          if (paramsDef.hasRequired) {
            // 有参数需要填写，弹窗收集
            const userParams = await showSkillParamsDialog(skillName, paramsDef);
            if (userParams === null) return; // 用户取消
            showToolboxToast(`正在运行 Skill "${skillName}"...`, 'info');
            const result = await runSkill(skillName, userParams);
            showSkillRunResult(skillName, skillInfo, result);
          } else {
            // 无必填参数，直接执行
            showToolboxToast(`正在运行 Skill "${skillName}"...`, 'info');
            const result = await runSkill(skillName);
            showSkillRunResult(skillName, skillInfo, result);
          }
        } else if (action === 'edit-agent-skill') {
          try {
            const data = await getAgentSkillMarkdown(skillName);
            if (data.success) {
              showAgentSkillEditor(skillName, data);
            } else {
              showToolboxToast(data.error || '获取 Skill 内容失败', 'error');
            }
          } catch (err) {
            showToolboxToast(`获取失败: ${err.message}`, 'error');
          }
        } else if (action === 'view-agent-skill') {
          try {
            const data = await getAgentSkillMarkdown(skillName);
            if (data.success) {
              showAgentSkillViewer(skillName, data);
            } else {
              showToolboxToast(data.error || '获取 Skill 内容失败', 'error');
            }
          } catch (err) {
            showToolboxToast(`获取失败: ${err.message}`, 'error');
          }
        }
      } catch (err) {
        showToolboxToast(`操作失败: ${err.message}`, 'error');
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
        showToolboxToast(`已重新加载 ${result.count || 0} 个 Skill`, 'success');
        await refreshToolbox();
      } catch (err) {
        showToolboxToast(`重新加载失败: ${err.message}`, 'error');
      }
    });
  }

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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { initToolbox, refreshToolbox };
