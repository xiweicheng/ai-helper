// side_panel/agent-manager.js - Agent 管理 UI
import state from './state.js';
import { getAllAgents, createAgent, updateAgent, deleteAgent, getAgent, setActiveAgentId, getActiveAgentId, createAgentFromTemplate } from './agent-store.js';
import { AGENT_TEMPLATES } from '../shared/agent-defaults.js';
import { BUILTIN_TOOLS } from './constants.js';
import { showToast } from './utils.js';

/**
 * 初始化 Agent 管理
 */
export async function initAgentManager() {
  await loadAgentState();
  await renderAgentSelector();
  initAgentSelectorEvents();
  initAgentModalEvents();
  console.log('[AgentMgr] Agent 管理器初始化完成, activeAgentId:', state.activeAgentId);
}

/**
 * 加载 Agent 状态
 */
async function loadAgentState() {
  const [activeId, allAgents] = await Promise.all([
    getActiveAgentId(),
    getAllAgents(),
  ]);
  state.activeAgentId = activeId;
  state.customAgents = allAgents.filter(a => !a.isBuiltin);
  console.log('[AgentMgr] Agent 状态已加载, activeAgentId:', activeId, 'total:', allAgents.length);
}

/**
 * 渲染 Agent 选择器
 */
export async function renderAgentSelector() {
  const selector = document.getElementById('agentSelectorDropdown');
  if (!selector) return;

  const allAgents = await getAllAgents();
  const activeId = state.activeAgentId;

  let html = '';
  for (const agent of allAgents) {
    const isActive = agent.id === activeId || (!activeId && agent.id === 'default');
    const toolCount = agent.toolIds ? agent.toolIds.length : '全部';
    html += `
      <div class="agent-item ${isActive ? 'active' : ''}" data-agent-id="${escapeAttr(agent.id)}">
        <span class="agent-item-icon">${escapeHtml(agent.icon)}</span>
        <div class="agent-item-info">
          <span class="agent-item-name">${escapeHtml(agent.name)}</span>
          <span class="agent-item-desc">${escapeHtml(agent.description || `${toolCount} 个工具`)}</span>
        </div>
        ${!agent.isBuiltin ? `<button class="agent-item-edit" data-action="edit" data-agent-id="${escapeAttr(agent.id)}" title="编辑">✎</button>` : ''}
      </div>`;
  }

  html += `
    <div class="agent-item agent-item-add" id="agentAddBtn">
      <span class="agent-item-icon">＋</span>
      <span class="agent-item-name">创建新 Agent</span>
    </div>`;

  selector.innerHTML = html;

  // 更新选择器按钮上的显示
  updateAgentSelectorButton(allAgents, activeId);
}

/**
 * 更新 Agent 选择器按钮显示
 */
function updateAgentSelectorButton(allAgents, activeId) {
  const btn = document.getElementById('agentSelectorBtn');
  const text = document.getElementById('agentSelectorText');
  if (!btn || !text) return;

  const activeAgent = allAgents.find(a => a.id === activeId) 
    || allAgents.find(a => a.id === 'default');
  
  if (activeAgent) {
    text.textContent = `${activeAgent.icon} ${activeAgent.name}`;
  } else {
    text.textContent = '🤖 默认助手';
  }
}

/**
 * 初始化 Agent 选择器事件
 */
function initAgentSelectorEvents() {
  const btn = document.getElementById('agentSelectorBtn');
  const dropdown = document.getElementById('agentSelectorDropdown');

  if (!btn || !dropdown) return;

  // 点击按钮切换下拉
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.style.display === 'block';
    dropdown.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) renderAgentSelector();
  });

  // 点击外部关闭
  document.addEventListener('click', () => {
    dropdown.style.display = 'none';
  });

  // 选择 Agent
  dropdown.addEventListener('click', async (e) => {
    const item = e.target.closest('.agent-item');
    if (!item) return;

    const action = e.target.closest('[data-action]');
    if (action && action.dataset.action === 'edit') {
      e.stopPropagation();
      const agentId = action.dataset.agentId;
      openAgentEditor(agentId);
      return;
    }

    if (item.id === 'agentAddBtn') {
      openAgentEditor(null);
      return;
    }

    const agentId = item.dataset.agentId;
    if (agentId) {
      await switchAgent(agentId);
      dropdown.style.display = 'none';
    }
  });
}

/**
 * 切换 Agent
 */
export async function switchAgent(agentId) {
  const agent = agentId ? await getAgent(agentId) : null;
  state.activeAgentId = agentId;
  await setActiveAgentId(agentId);
  await renderAgentSelector();
  
  const agentName = agent ? agent.name : '默认助手';
  showToast(`已切换到：${agentName}`, 'info', 2000);
  
  console.log('[AgentMgr] 已切换 Agent:', agentId, agentName);
}

/**
 * 初始化 Agent 编辑模态框事件
 */
function initAgentModalEvents() {
  const modal = document.getElementById('agentEditModal');
  if (!modal) return;

  // 关闭按钮
  modal.querySelector('#agentModalCloseBtn')?.addEventListener('click', closeAgentEditor);
  
  // 点击遮罩关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeAgentEditor();
  });

  // 保存按钮
  modal.querySelector('#agentSaveBtn')?.addEventListener('click', saveAgent);

  // 删除按钮
  modal.querySelector('#agentDeleteBtn')?.addEventListener('click', deleteCurrentAgent);

  // 模板选择
  modal.querySelector('#agentTemplateSelect')?.addEventListener('change', onTemplateSelect);
}

/**
 * 打开 Agent 编辑器
 * @param {string|null} agentId - null 表示新建
 */
export async function openAgentEditor(agentId) {
  const modal = document.getElementById('agentEditModal');
  if (!modal) return;

  // 重置表单
  modal.querySelector('#agentEditId').value = '';
  modal.querySelector('#agentEditName').value = '';
  modal.querySelector('#agentEditIcon').value = '🤖';
  modal.querySelector('#agentEditDesc').value = '';
  modal.querySelector('#agentEditPrompt').value = '';
  modal.querySelector('#agentEditAllowSub').checked = false;
  modal.querySelector('#agentTemplateSelect').value = '';

  const deleteBtn = modal.querySelector('#agentDeleteBtn');
  const titleEl = modal.querySelector('#agentEditTitle');

  if (agentId) {
    // 编辑模式
    const agent = await getAgent(agentId);
    if (!agent || agent.isBuiltin) return;  // 内置不可编辑

    titleEl.textContent = '编辑 Agent';
    modal.querySelector('#agentEditId').value = agent.id;
    modal.querySelector('#agentEditName').value = agent.name;
    modal.querySelector('#agentEditIcon').value = agent.icon || '🤖';
    modal.querySelector('#agentEditDesc').value = agent.description || '';
    modal.querySelector('#agentEditPrompt').value = agent.systemPrompt || '';
    modal.querySelector('#agentEditAllowSub').checked = agent.allowSubDispatch || false;
    deleteBtn.style.display = 'block';

    // 渲染工具选择
    renderAgentToolSelector(agent.toolIds);
  } else {
    // 新建模式
    titleEl.textContent = '创建新 Agent';
    deleteBtn.style.display = 'none';
    
    // 渲染空工具选择
    renderAgentToolSelector(null);

    // 渲染模板选项
    renderTemplateOptions();
  }

  modal.style.display = 'flex';
}

/**
 * 关闭 Agent 编辑器
 */
function closeAgentEditor() {
  const modal = document.getElementById('agentEditModal');
  if (modal) modal.style.display = 'none';
}

/**
 * 渲染模板下拉选项
 */
function renderTemplateOptions() {
  const select = document.getElementById('agentTemplateSelect');
  if (!select) return;

  let html = '<option value="">-- 选择模板（可选） --</option>';
  for (let i = 0; i < AGENT_TEMPLATES.length; i++) {
    const t = AGENT_TEMPLATES[i];
    html += `<option value="${i}">${t.icon} ${t.name}</option>`;
  }
  select.innerHTML = html;
}

/**
 * 模板选择回调
 */
function onTemplateSelect(e) {
  const idx = parseInt(e.target.value);
  if (isNaN(idx) || idx < 0 || idx >= AGENT_TEMPLATES.length) return;

  const template = AGENT_TEMPLATES[idx];
  const modal = document.getElementById('agentEditModal');
  if (!modal) return;

  modal.querySelector('#agentEditName').value = template.name;
  modal.querySelector('#agentEditIcon').value = template.icon;
  modal.querySelector('#agentEditDesc').value = template.description;
  modal.querySelector('#agentEditPrompt').value = template.systemPrompt;
  modal.querySelector('#agentEditAllowSub').checked = template.allowSubDispatch || false;
  
  // 渲染工具选择
  renderAgentToolSelector(template.toolIds);

  showToast(`已加载模板：${template.name}`, 'info', 2000);
}

/**
 * 渲染工具选择列表
 */
function renderAgentToolSelector(selectedToolIds) {
  const container = document.getElementById('agentToolList');
  if (!container) return;

  const selectedSet = new Set(selectedToolIds || []);
  const categoryNames = {
    'page_interaction': '🖱️ 页面交互',
    'form_operation': '📝 表单操作',
    'content_extraction': '📄 内容提取',
    'tab_management': '📑 标签页管理',
    'bookmark_history': '🔖 书签历史',
    'storage_management': '💾 存储管理',
    'network_request': '🌐 网络请求',
    'media_output': '📷 媒体与输出',
    'debug_dev': '🔧 调试开发',
    'ai_collaboration': '🤖 AI协作',
    'local_agent': '🖥️ 本地Agent',
  };

  // 按类别分组
  const grouped = {};
  for (const tool of BUILTIN_TOOLS) {
    const cat = tool.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(tool);
  }

  let html = '';
  for (const [cat, tools] of Object.entries(grouped)) {
    const catName = categoryNames[cat] || cat;
    html += `<div class="agent-tool-category">${catName}</div>`;
    for (const tool of tools) {
      const checked = selectedSet.has(tool.id) ? 'checked' : '';
      html += `
        <label class="agent-tool-item">
          <input type="checkbox" value="${escapeAttr(tool.id)}" ${checked} data-tool-id="${escapeAttr(tool.id)}">
          <span class="agent-tool-name">${escapeHtml(tool.name)}</span>
          <span class="agent-tool-desc">${escapeHtml(tool.description.substring(0, 40))}${tool.description.length > 40 ? '...' : ''}</span>
        </label>`;
    }
  }
  container.innerHTML = html;
}

/**
 * 获取当前选中的工具 ID 列表
 */
function getSelectedToolIds() {
  const container = document.getElementById('agentToolList');
  if (!container) return null;
  const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
  const ids = [];
  checkboxes.forEach(cb => ids.push(cb.value));
  return ids.length > 0 ? ids : null;
}

/**
 * 保存 Agent
 */
async function saveAgent() {
  const modal = document.getElementById('agentEditModal');
  if (!modal) return;

  const agentId = modal.querySelector('#agentEditId').value;
  const name = modal.querySelector('#agentEditName').value.trim();
  const icon = modal.querySelector('#agentEditIcon').value.trim() || '🤖';
  const description = modal.querySelector('#agentEditDesc').value.trim();
  const systemPrompt = modal.querySelector('#agentEditPrompt').value.trim();
  const allowSubDispatch = modal.querySelector('#agentEditAllowSub').checked;
  const toolIds = getSelectedToolIds();

  if (!name) {
    showToast('请输入 Agent 名称', 'warning');
    return;
  }

  const data = { name, icon, description, systemPrompt, allowSubDispatch, toolIds };

  try {
    if (agentId) {
      await updateAgent(agentId, data);
      showToast('Agent 已更新', 'success');
    } else {
      const newAgent = await createAgent(data);
      showToast(`Agent "${newAgent.name}" 已创建`, 'success');
    }

    // 刷新状态
    await loadAgentState();
    await renderAgentSelector();
    closeAgentEditor();
  } catch (err) {
    console.error('[AgentMgr] 保存 Agent 失败:', err);
    showToast('保存失败：' + err.message, 'error');
  }
}

/**
 * 删除当前编辑的 Agent
 */
async function deleteCurrentAgent() {
  const modal = document.getElementById('agentEditModal');
  if (!modal) return;

  const agentId = modal.querySelector('#agentEditId')?.value;
  if (!agentId) return;

  const confirmed = await showCustomConfirm(
    `确定要删除这个 Agent 吗？正在使用该 Agent 的会话将恢复为默认助手。`,
    '删除 Agent'
  );
  if (!confirmed) return;

  try {
    await deleteAgent(agentId);
    showToast('Agent 已删除', 'success');
    await loadAgentState();
    await renderAgentSelector();
    closeAgentEditor();
  } catch (err) {
    console.error('[AgentMgr] 删除 Agent 失败:', err);
    showToast('删除失败：' + err.message, 'error');
  }
}

/**
 * 获取当前 Agent 的提示词（供 chat-manager 使用）
 * 返回 { agent, systemPrompt }
 */
export async function getCurrentAgentPrompt() {
  const agent = state.activeAgentId ? await getAgent(state.activeAgentId) : null;
  // getSystemPrompt 现在在 utils.js 中，不再需要重复 import
  return agent;
}

/**
 * 获取当前 Agent 的工具 ID 列表
 * 返回 null = 使用全局 enabledTools，返回 [] = 不使用工具
 */
export function getCurrentAgentToolIds(agent) {
  if (!agent) return null;
  return agent.toolIds;  // null = 继承全局，[] = 无工具
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/["&<>]/g, (c) => ({
    '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;',
  })[c]);
}

/**
 * 自定义确认弹窗（如果全局有 showCustomConfirm 则使用，否则用 confirm）
 */
async function showCustomConfirm(message, title) {
  // 检查是否有全局的自定义确认函数
  if (typeof window.showCustomConfirm === 'function') {
    return window.showCustomConfirm(message, title);
  }
  // 降级方案
  return new Promise((resolve) => {
    const modal = document.getElementById('agentConfirmModal');
    if (!modal) {
      resolve(confirm(message));
      return;
    }
    
    modal.querySelector('#agentConfirmMessage').textContent = message;
    modal.querySelector('#agentConfirmTitle').textContent = title || '确认';
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      modal.querySelector('#agentConfirmOk').removeEventListener('click', onOk);
      modal.querySelector('#agentConfirmCancel').removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlay);
    };

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onOverlay = (e) => { if (e.target === modal) { cleanup(); resolve(false); } };

    modal.querySelector('#agentConfirmOk').addEventListener('click', onOk);
    modal.querySelector('#agentConfirmCancel').addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlay);
  });
}
