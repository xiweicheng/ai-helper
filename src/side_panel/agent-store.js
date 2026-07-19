// side_panel/agent-store.js - Agent 数据持久化
import { BUILTIN_AGENTS, generateAgentId } from '../shared/agent-defaults.js';

const STORAGE_KEY = 'customAgents';
const ACTIVE_KEY = 'activeAgentId';

/**
 * 获取所有 Agent（内置 + 用户自定义）
 * @returns {Promise<Array>}
 */
export async function getAllAgents() {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const customAgents = result[STORAGE_KEY] || [];
  return [...BUILTIN_AGENTS, ...customAgents];
}

/**
 * 仅获取用户自定义的 Agent
 * @returns {Promise<Array>}
 */
export async function getCustomAgents() {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return result[STORAGE_KEY] || [];
}

/**
 * 根据 ID 获取单个 Agent
 * @param {string} agentId
 * @returns {Promise<Object|null>}
 */
export async function getAgent(agentId) {
  if (!agentId) return null;
  const all = await getAllAgents();
  return all.find(a => a.id === agentId) || null;
}

/**
 * 创建新的自定义 Agent
 * @param {Object} agentData - 不含 id 的 Agent 数据
 * @returns {Promise<Object>}
 */
export async function createAgent(agentData) {
  const agents = await getCustomAgents();
  const newAgent = {
    id: generateAgentId(),
    name: agentData.name || '未命名Agent',
    description: agentData.description || '',
    icon: agentData.icon || '🤖',
    systemPrompt: agentData.systemPrompt || '',
    toolIds: agentData.toolIds || null,  // null = 继承全局
    skillIds: agentData.skillIds || null, // null = 继承全部启用技能
    isBuiltin: false,
    allowSubDispatch: agentData.allowSubDispatch !== undefined ? agentData.allowSubDispatch : false,
    model: agentData.model || null,
    temperature: agentData.temperature !== undefined ? agentData.temperature : null,
    topP: agentData.topP !== undefined ? agentData.topP : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  agents.push(newAgent);
  await chrome.storage.local.set({ [STORAGE_KEY]: agents });
  return newAgent;
}

/**
 * 更新已有的自定义 Agent
 * @param {string} agentId
 * @param {Object} updates
 * @returns {Promise<Object|null>}
 */
export async function updateAgent(agentId, updates) {
  const agents = await getCustomAgents();
  const idx = agents.findIndex(a => a.id === agentId);
  if (idx === -1) return null;
  
  agents[idx] = {
    ...agents[idx],
    ...updates,
    id: agentId,  // id 不可变
    isBuiltin: false,  // 不可变
    updatedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: agents });
  return agents[idx];
}

/**
 * 删除自定义 Agent
 * @param {string} agentId
 * @returns {Promise<boolean>}
 */
export async function deleteAgent(agentId) {
  const agents = await getCustomAgents();
  const idx = agents.findIndex(a => a.id === agentId);
  if (idx === -1) return false;
  
  agents.splice(idx, 1);
  await chrome.storage.local.set({ [STORAGE_KEY]: agents });

  // 如果删除的 Agent 是当前选中的，重置为默认
  const result = await chrome.storage.local.get([ACTIVE_KEY]);
  if (result[ACTIVE_KEY] === agentId) {
    await chrome.storage.local.remove(ACTIVE_KEY);
  }
  
  return true;
}

/**
 * 获取当前选中的 Agent ID
 * @returns {Promise<string|null>}
 */
export async function getActiveAgentId() {
  const result = await chrome.storage.local.get([ACTIVE_KEY]);
  return result[ACTIVE_KEY] || null;
}

/**
 * 设置当前选中的 Agent ID
 * @param {string|null} agentId
 */
export async function setActiveAgentId(agentId) {
  if (agentId) {
    await chrome.storage.local.set({ [ACTIVE_KEY]: agentId });
  } else {
    await chrome.storage.local.remove(ACTIVE_KEY);
  }
}

/**
 * 从模板创建 Agent
 * @param {Object} template
 * @returns {Promise<Object>}
 */
export async function createAgentFromTemplate(template) {
  return createAgent({
    name: template.name,
    icon: template.icon,
    description: template.description,
    systemPrompt: template.systemPrompt,
    toolIds: template.toolIds ? [...template.toolIds] : null,
    allowSubDispatch: template.allowSubDispatch || false,
  });
}
