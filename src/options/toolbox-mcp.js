// options/toolbox-mcp.js - MCP 服务器管理
// 从 toolbox-config.js 拆分，包含 MCP 服务器的增删改查与连接管理

import { state, agentApi, escapeHtml, getAgentConnection } from './toolbox-shared.js';

// ==================== MCP 服务器管理 ====================

/**
 * 获取 MCP 服务器列表
 */
export async function loadMcpServers() {
  await getAgentConnection();
  if (!state.agentConnected) return { servers: [] };
  try {
    return await agentApi('GET', '/api/mcp/servers');
  } catch {
    return { servers: [] };
  }
}

/**
 * 渲染 MCP 服务器列表
 */
export function renderMcpServers(servers) {
  const container = document.getElementById('mcpServerList');
  if (!container) return;

  state.cachedMcpServers = servers || [];

  if (!state.agentConnected) {
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
    if (s.id === state.editingMcpId) {
      const transport = s.transport || 'stdio';
      return `
        <div class="mcp-server-card editing">
          <div class="mcp-add-form">
            <div class="mcp-add-form-row">
              <input type="text" id="mcpEditId" value="${escapeHtml(s.id)}" placeholder="服务器 ID" class="toolbox-input">
              <input type="text" id="mcpEditName" value="${escapeHtml(s.name || '')}" placeholder="显示名称" class="toolbox-input">
            </div>
            ${renderTransportSelector('mcpEdit', transport)}
            ${renderTransportFields('mcpEdit', transport, s.url || '', s.command || '', (s.args || []).join(' '))}
            <div class="mcp-env-section" id="mcpEditEnvSection" style="display:${transport === 'stdio' ? '' : 'none'};">
              <div class="mcp-env-header">
                <span class="mcp-env-title">环境变量</span>
                <span class="mcp-env-hint">（仅 stdio 传输需要，敏感值优先在 shell 配置中 export）</span>
              </div>
              <div class="mcp-env-rows" id="mcpEditEnvRows">
                ${renderEnvVarRows(s.env || {})}
              </div>
              <button type="button" class="toolbox-btn mcp-env-add-row" data-action="add-env-row" data-target="mcpEditEnvRows" style="font-size: 12px; padding: 2px 10px;">+ 添加变量</button>
            </div>
            ${renderHeadersSection('mcpEdit', s.headers || {}, transport)}
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
          <div class="mcp-server-header-right">
            <label class="toolbox-toggle" title="${s.enabled !== false ? '启用中，点击停用' : '已停用，点击启用'}">
              <input type="checkbox" ${s.enabled !== false ? 'checked' : ''} data-mcp-id="${escapeHtml(s.id)}" data-action="toggle">
              <span class="toolbox-toggle-slider"></span>
            </label>
            </div>
        </div>
        <div class="mcp-card-body${s.enabled === false ? ' disabled' : ''}">
          <div class="mcp-server-command">
            <code>${escapeHtml(renderMcpServerAddress(s))}</code>
          </div>
          ${renderMcpMetaInfo(s)}
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
export function renderEnvVarRows(envObj = {}) {
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
export function parseEnvVars(container) {
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
 * 渲染请求头输入行
 * @param {Object} headersObj - { 'Header-Name': 'value', ... }
 * @returns {string} HTML
 */
export function renderHeaderRows(headersObj = {}) {
  const entries = Object.entries(headersObj);
  if (entries.length === 0) {
    entries.push(['', '']);
  }
  return entries.map(([key, value]) => `
    <div class="mcp-env-row">
      <input type="text" class="mcp-env-key toolbox-input" placeholder="Header 名" value="${escapeHtml(key)}" style="flex: 1;">
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
 * 从容器中解析请求头
 * @param {HTMLElement} container - 包含 .mcp-env-row 的容器
 * @returns {Object} headers 对象
 */
export function parseHeaders(container) {
  const headers = {};
  container.querySelectorAll('.mcp-env-row').forEach(row => {
    const key = row.querySelector('.mcp-env-key')?.value.trim();
    const value = row.querySelector('.mcp-env-value')?.value;
    if (key && value !== undefined) {
      headers[key] = value;
    }
  });
  return Object.keys(headers).length > 0 ? headers : {};
}

/**
 * 渲染请求头配置区域 HTML
 * @param {string} idPrefix - 元素 ID 前缀（"mcpAdd" 或 "mcpEdit"）
 * @param {Object} headers - 当前 headers
 * @returns {string} HTML
 */
export function renderHeadersSection(idPrefix, headers = {}, transport = 'stdio') {
  const isHttp = transport === 'sse' || transport === 'streamableHttp' || transport === 'websocket';
  return `
    <div class="mcp-env-section" id="${idPrefix}HeadersSection" style="display:${isHttp ? '' : 'none'};">
      <div class="mcp-env-header">
        <span class="mcp-env-title">请求头 (Headers)</span>
        <span class="mcp-env-hint">（HTTP 传输时附加的请求头，如 Authorization、X-API-Key 等）</span>
      </div>
      <div class="mcp-env-rows" id="${idPrefix}HeaderRows">
        ${renderHeaderRows(headers)}
      </div>
      <button type="button" class="toolbox-btn mcp-env-add-row" data-action="add-env-row" data-target="${idPrefix}HeaderRows" style="font-size: 12px; padding: 2px 10px;">+ 添加请求头</button>
    </div>`;
}

/**
 * 处理环境变量 UI 操作（事件委托）
 * @param {Event} e - 点击事件
 * @returns {boolean} 是否已处理（true 表示已消费该事件）
 */
export function handleEnvAction(e) {
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
/**
 * 渲染传输方式选择器（自定义按钮组，替代原生 select）
 * @param {string} idPrefix - 元素 ID 前缀
 * @param {string} transport - 当前传输类型
 * @returns {string} HTML
 */
export function renderTransportSelector(idPrefix, transport = 'stdio') {
  const options = [
    { value: 'stdio', label: 'stdio', title: '子进程通信 (npx/python 等)' },
    { value: 'sse', label: 'SSE', title: 'Server-Sent Events (HTTP GET 长连接 + POST 发消息)' },
    { value: 'streamableHttp', label: 'Streamable HTTP', title: 'MCP 官方推荐 HTTP 传输 (POST + GET SSE)' },
    { value: 'websocket', label: 'WebSocket', title: 'WebSocket 双向通信' }
  ];

  return `
    <div class="mcp-transport-group" id="${idPrefix}TransportGroup" data-prefix="${idPrefix}">
      ${options.map(o => `
        <button type="button"
          class="mcp-transport-btn${o.value === transport ? ' active' : ''}"
          data-value="${o.value}"
          data-action="transport-change"
          data-prefix="${idPrefix}"
          title="${o.title}">${o.label}</button>
      `).join('')}
    </div>`;
}

/**
 * 渲染传输方式配置字段（命令/URL 行，根据传输类型切换显示）
 * @param {string} idPrefix - 元素 ID 前缀
 * @param {string} transport - 当前传输类型
 * @param {string} url - 当前 URL
 * @param {string} command - 当前命令
 * @param {string} args - 当前参数
 * @returns {string} HTML
 */
export function renderTransportFields(idPrefix, transport = 'stdio', url = '', command = '', args = '') {
  const isHttp = transport === 'sse' || transport === 'streamableHttp' || transport === 'websocket';
  return `
    <div class="mcp-add-form-row" id="${idPrefix}StdioRow" style="display:${isHttp ? 'none' : 'flex'};">
      <input type="text" id="${idPrefix}Command" value="${escapeHtml(command)}" placeholder="命令路径，如 npx、python" class="toolbox-input" style="flex: 2;">
      <input type="text" id="${idPrefix}Args" value="${escapeHtml(args)}" placeholder="参数，空格分隔" class="toolbox-input" style="flex: 3;">
    </div>
    <div class="mcp-add-form-row" id="${idPrefix}UrlRow" style="display:${isHttp ? 'flex' : 'none'};">
      <input type="text" id="${idPrefix}Url" value="${escapeHtml(url)}" placeholder="http://localhost:3000/mcp" class="toolbox-input" style="flex: 1;">
    </div>`;
}

/**
 * 渲染 MCP 服务器连接地址文本
 * @param {Object} server
 * @returns {string}
 */
export function renderMcpServerAddress(server) {
  const transport = server.transport || 'stdio';
  if (transport === 'stdio' || !transport) {
    return `${server.command || ''} ${(server.args || []).join(' ')}`;
  }
  return server.url || '';
}

/**
 * 渲染 MCP 服务器附加信息（headers 数量等）
 * @param {Object} server
 * @returns {string}
 */
export function renderMcpMetaInfo(server) {
  const headerCount = Object.keys(server.headers || {}).length;
  if (headerCount > 0) {
    return `<div class="mcp-server-meta">${headerCount} 个自定义请求头</div>`;
  }
  return '';
}

/**
 * 获取当前选中的传输方式
 * @param {string} idPrefix - 元素 ID 前缀
 * @returns {string}
 */
export function getTransportValue(idPrefix) {
  const activeBtn = document.querySelector(`#${idPrefix}TransportGroup .mcp-transport-btn.active`);
  return activeBtn?.dataset.value || 'stdio';
}

/**
 * 处理传输方式切换 - 显示/隐藏对应的配置行
 * @param {HTMLSelectElement} selectEl
 */
export function handleTransportChange(btn) {
  const prefix = btn.dataset.prefix;
  const value = btn.dataset.value;

  // 更新按钮激活状态
  const group = document.getElementById(`${prefix}TransportGroup`);
  if (group) {
    group.querySelectorAll('.mcp-transport-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  const isStdio = value === 'stdio';
  const isHttp = value === 'sse' || value === 'streamableHttp' || value === 'websocket';
  const isHttpWithHeaders = value === 'sse' || value === 'streamableHttp';

  const stdioRow = document.getElementById(`${prefix}StdioRow`);
  const urlRow = document.getElementById(`${prefix}UrlRow`);
  const envSection = document.getElementById(`${prefix}EnvSection`);
  const headersSection = document.getElementById(`${prefix}HeadersSection`);

  if (stdioRow) stdioRow.style.display = isStdio ? 'flex' : 'none';
  if (urlRow) urlRow.style.display = isHttp ? 'flex' : 'none';
  if (envSection) envSection.style.display = isStdio ? '' : 'none';
  if (headersSection) headersSection.style.display = isHttpWithHeaders ? '' : 'none';
}

export function showAddMcpForm() {
  const container = document.getElementById('mcpAddForm');
  if (!container) return;

  container.innerHTML = `
    <div class="mcp-add-form">
      <div class="mcp-add-form-row">
        <input type="text" id="mcpAddId" placeholder="服务器 ID（唯一标识）" class="toolbox-input">
        <input type="text" id="mcpAddName" placeholder="显示名称" class="toolbox-input">
      </div>
      ${renderTransportSelector('mcpAdd')}
      ${renderTransportFields('mcpAdd')}
      <div class="mcp-env-section" id="mcpAddEnvSection">
        <div class="mcp-env-header">
          <span class="mcp-env-title">环境变量</span>
          <span class="mcp-env-hint">（仅 stdio 传输需要，敏感值优先在 shell 配置中 export）</span>
        </div>
        <div class="mcp-env-rows" id="mcpAddEnvRows">
          ${renderEnvVarRows()}
        </div>
        <button type="button" class="toolbox-btn mcp-env-add-row" data-action="add-env-row" data-target="mcpAddEnvRows" style="font-size: 12px; padding: 2px 10px;">+ 添加变量</button>
      </div>
      ${renderHeadersSection('mcpAdd', {}, 'stdio')}
      <div class="mcp-add-form-actions">
        <button class="toolbox-btn toolbox-btn-cancel" id="mcpAddCancel">取消</button>
        <button class="toolbox-btn toolbox-btn-primary" id="mcpAddConfirm">添加</button>
      </div>
    </div>`;
}

/**
 * 隐藏添加表单
 */
export function hideAddMcpForm() {
  const container = document.getElementById('mcpAddForm');
  if (container) container.innerHTML = '';
}

/**
 * 添加 MCP 服务器
 */
export async function addMcpServer(serverData) {
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
export async function removeMcpServer(serverId) {
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
export async function connectMcpServer(serverId) {
  const result = await agentApi('POST', '/api/mcp/servers/connect', { id: serverId });
  if (result.success) return result;
  throw new Error(result.error || '连接失败');
}

/**
 * 断开 MCP 服务器
 */
export async function disconnectMcpServer(serverId) {
  const result = await agentApi('POST', '/api/mcp/servers/disconnect', { id: serverId });
  if (result.success) return true;
  throw new Error(result.error || '断开失败');
}

/**
 * 切换 MCP 服务器启用状态
 */
export async function toggleMcpServer(serverId, enabled) {
  const result = await agentApi('PUT', '/api/mcp/servers/toggle', { id: serverId, enabled });
  if (result.success) return true;
  throw new Error(result.error || '操作失败');
}

// MCP 服务器管理函数已通过 export 暴露给 toolbox-config.js
