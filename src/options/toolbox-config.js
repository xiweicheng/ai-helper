// options/toolbox-config.js - 工具箱配置（MCP 服务器 & Skill 管理）
// 依赖 Agent 连接，未连接时禁用所有操作

let agentBaseUrl = null;
let agentToken = null;
let agentConnected = false;
let cachedMcpServers = [];
let editingMcpId = null;

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
        <div class="toolbox-empty-title">Agent 未连接</div>
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
      </div>`;
  }).join('');
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
  if (result.success) return true;
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
 * 渲染 Skill 列表
 */
function renderSkills(skills) {
  const container = document.getElementById('skillList');
  if (!container) return;

  if (!agentConnected) {
    container.innerHTML = `
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">🔌</div>
        <div class="toolbox-empty-title">Agent 未连接</div>
        <div class="toolbox-empty-desc">请先在「代理」Tab 中连接 Agent 服务后，再管理 Skill</div>
      </div>`;
    return;
  }

  if (!skills || skills.length === 0) {
    container.innerHTML = `
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">🧩</div>
        <div class="toolbox-empty-title">暂无 Skill</div>
        <div class="toolbox-empty-desc">点击下方按钮导入 Skill 定义文件（JSON 格式）</div>
      </div>`;
    return;
  }

  container.innerHTML = skills.map(s => `
    <div class="skill-card">
      <div class="skill-card-header">
        <div class="skill-card-info">
          <span class="skill-card-icon">📦</span>
          <span class="skill-card-name">${escapeHtml(s.name)}</span>
          <span class="skill-card-version">v${escapeHtml(s.version || '1.0')}</span>
          <span class="skill-card-step-count">${s.stepCount || 0} 步骤</span>
        </div>
      </div>
      <div class="skill-card-desc">${escapeHtml(s.description || '')}</div>
      <div class="skill-card-params">
        ${renderSkillParams(s.parameters)}
      </div>
      <div class="skill-card-actions">
        <button class="toolbox-btn toolbox-btn-primary" data-skill-name="${escapeHtml(s.name)}" data-action="run-skill">运行</button>
        <button class="toolbox-btn toolbox-btn-danger" data-skill-name="${escapeHtml(s.name)}" data-action="delete-skill">删除</button>
      </div>
    </div>
  `).join('');
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
 * 导入 Skill
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
 * 运行 Skill
 */
async function runSkill(name) {
  const result = await agentApi('POST', '/api/skill/run', { name, params: {} });
  return result;
}

/**
 * 重新加载 Skill
 */
async function reloadSkills() {
  const result = await agentApi('POST', '/api/skill/reload');
  return result;
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
      statusEl.innerHTML = `<span class="toolbox-status-dot connected"></span> Agent 已连接`;
      statusEl.className = 'toolbox-agent-status connected';
    } else {
      statusEl.innerHTML = `<span class="toolbox-status-dot disconnected"></span> Agent 未连接 — 请在「代理」Tab 中连接`;
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
 * 初始化工具箱 Tab
 */
function initToolbox() {
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

        const serverData = {
          id,
          name: name || id,
          command,
          args: argsRaw ? argsRaw.split(/\s+/) : [],
          enabled: true
        };

        try {
          await addMcpServer(serverData);
          showToolboxToast('MCP 服务器添加成功', 'success');
          hideAddMcpForm();
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
          if (!confirm('确定要删除该 MCP 服务器吗？')) return;
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

      if (!action || !skillName) return;

      try {
        if (action === 'delete-skill') {
          if (!confirm(`确定要删除 Skill "${skillName}" 吗？`)) return;
          await deleteSkill(skillName);
          showToolboxToast('删除成功', 'success');
          await refreshToolbox();
        } else if (action === 'run-skill') {
          showToolboxToast(`正在运行 Skill "${skillName}"...`, 'info');
          const result = await runSkill(skillName);
          if (result.success) {
            showToolboxToast(`Skill "${skillName}" 执行成功`, 'success');
          } else {
            showToolboxToast(`执行失败: ${result.error || '未知错误'}`, 'error');
          }
        }
      } catch (err) {
        showToolboxToast(`操作失败: ${err.message}`, 'error');
      }
    });
  }

  // 导入 Skill
  const importBtn = document.getElementById('importSkillBtn');
  const importFile = document.getElementById('importSkillFile');
  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());

    importFile.addEventListener('change', async () => {
      const file = importFile.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const skillDef = JSON.parse(text);
        if (!skillDef.name || !skillDef.steps) {
          showToolboxToast('Skill 文件格式错误：缺少 name 或 steps', 'error');
          return;
        }
        await importSkill(skillDef);
        showToolboxToast(`Skill "${skillDef.name}" 导入成功`, 'success');
        await refreshToolbox();
      } catch (err) {
        showToolboxToast(`导入失败: ${err.message}`, 'error');
      } finally {
        importFile.value = '';
      }
    });
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
