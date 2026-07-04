// side_panel/agent-at-selector.js - @ Agent 选择器（输入框中输入 @ 快速切换 Agent）
import state from './state.js';
import { getAllAgents } from './agent-store.js';
import { switchAgent } from './agent-manager.js';
import { escapeHtml } from './utils.js';
import { adjustInputHeight } from './utils.js';

/**
 * 显示 Agent @选择器
 */
export async function showAgentAtSelector(filterText = '') {
  const agentAtSelector = document.getElementById('agentAtSelector');
  const agentAtDropdown = document.getElementById('agentAtDropdown');

  agentAtSelector.style.display = 'block';
  agentAtDropdown.classList.add('show');

  await renderAgentAtList(filterText);
}

/**
 * 隐藏 Agent @选择器
 */
export function hideAgentAtSelector() {
  const agentAtSelector = document.getElementById('agentAtSelector');
  const agentAtDropdown = document.getElementById('agentAtDropdown');

  agentAtSelector.style.display = 'none';
  agentAtDropdown.classList.remove('show');
  state.selectedAgentAtIndex = -1;
}

/**
 * 渲染 Agent @列表
 */
async function renderAgentAtList(filterText = '') {
  const agentAtList = document.getElementById('agentAtList');
  const allAgents = await getAllAgents();
  const filterLower = filterText.toLowerCase();

  const filteredAgents = allAgents.filter(agent => {
    if (!filterText) return true;
    return agent.name.toLowerCase().includes(filterLower) ||
           (agent.description && agent.description.toLowerCase().includes(filterLower));
  });

  if (filteredAgents.length === 0) {
    agentAtList.innerHTML = '<div class="prompt-empty">暂无匹配的 Agent</div>';
    state.selectedAgentAtIndex = -1;
    return;
  }

  state.selectedAgentAtIndex = 0;

  agentAtList.innerHTML = filteredAgents.map((agent, index) => {
    const isActive = agent.id === state.activeAgentId || (!state.activeAgentId && agent.id === 'default');
    const toolCount = agent.toolIds ? agent.toolIds.length : (agent.toolIds === null ? '全局' : 0);
    const toolLabel = typeof toolCount === 'number' ? `${toolCount} 个工具` : '继承全局工具';
    return `
      <div class="prompt-item ${index === 0 ? 'selected' : ''} ${isActive ? 'agent-at-active' : ''}"
           data-index="${index}" data-agent-id="${escapeHtml(agent.id)}">
        <span class="agent-at-icon">${escapeHtml(agent.icon)}</span>
        <span class="prompt-item-content">${escapeHtml(agent.name)}</span>
        <span class="prompt-item-code">${escapeHtml(agent.description || toolLabel)}${isActive ? ' ✓' : ''}</span>
      </div>
    `;
  }).join('');

  // 绑定点击事件
  agentAtList.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      const agentId = item.dataset.agentId;
      await selectAgentByAt(agentId);
    });
  });
}

/**
 * 更新 @列表选中状态
 */
export function updateAgentAtSelection(items) {
  items.forEach((item, index) => {
    if (index === state.selectedAgentAtIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

/**
 * 通过 @选择 Agent
 */
async function selectAgentByAt(agentId) {
  const userInput = document.getElementById('userInput');
  const value = userInput.value;

  // 找到最后一个 @ 的位置
  const lastAtIndex = value.lastIndexOf('@');

  if (lastAtIndex !== -1) {
    // 移除 @ 及其后面的过滤文本
    const newValue = value.substring(0, lastAtIndex);
    userInput.value = newValue;
    userInput.focus();
    userInput.selectionStart = userInput.selectionEnd = newValue.length;
  }

  // 隐藏选择器
  hideAgentAtSelector();

  // 切换 Agent
  await switchAgent(agentId);

  // 自动调整输入框高度
  adjustInputHeight();
}
