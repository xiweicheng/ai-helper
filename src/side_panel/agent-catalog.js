// agent-catalog.js - 助手能力目录（编辑器勾选与 AI 创建向导共用同一份口径）
//
// 背景：工具/技能目录原先在 agent-manager 渲染编辑器时临时拼装。AI 创建向导需要
// 同一份「可用工具 + 可用技能」，若各自实现，会出现向导能选到、编辑器却过滤掉
// （或反之）的口径漂移。这里收口为单一数据源：
// - 常规工具 = 内置工具 + 已注册知识库工具（不含 MCP，MCP 走服务级开关）
// - Agent 未连接时隐藏依赖代理的 agent_* / knowledge_* 工具
// - 技能总开关关闭时隐藏 agent_skill
import state from './state.js';
import { BUILTIN_TOOLS } from './constants.js';
import { getToolDesc } from './tool-panel.js';
import { getEnabledSkills } from './skill-selector.js';

/**
 * 按编辑器同样的可见性规则构建常规工具列表
 * @param {{ builtinTools?: Array, ragTools?: Array, agentConnected?: boolean, skillsEnabled?: boolean }} opts
 * @returns {Array}
 */
export function buildToolCatalog({ builtinTools = [], ragTools = [], agentConnected = false, skillsEnabled = true } = {}) {
  let tools = [...builtinTools, ...(ragTools || [])];
  if (!agentConnected) {
    tools = tools.filter(t => !t.id.startsWith('agent_') && !t.id.startsWith('knowledge_'));
  }
  if (skillsEnabled === false) {
    tools = tools.filter(t => t.id !== 'agent_skill');
  }
  return tools;
}

/**
 * 按服务归并 MCP 工具（仅用于服务级开放/排除，不作为工具级勾选项）
 * @param {Array} mcpTools
 * @returns {Array<{serverId: string, serverName: string, tools: Array}>}
 */
export function groupMcpServices(mcpTools = []) {
  const serverMap = new Map();
  for (const tool of mcpTools) {
    const sid = tool.serverId || 'unknown';
    if (!serverMap.has(sid)) {
      serverMap.set(sid, { serverId: sid, serverName: tool.serverName || sid, tools: [] });
    }
    serverMap.get(sid).tools.push(tool);
  }
  return Array.from(serverMap.values());
}

/**
 * 读取当前可用的完整能力目录
 * @returns {Promise<{
 *   tools: Array<{id: string, name: string, description: string, category: string}>,
 *   skills: Array<{name: string, description: string}>,
 *   mcpServices: Array,
 *   meta: {agentConnected: boolean, skillsEnabled: boolean, mcpEnabled: boolean}
 * }>}
 */
export async function loadAgentCatalog() {
  let mcpTools = [];
  try {
    const result = await chrome.storage.local.get(['mcpTools']);
    mcpTools = result.mcpTools || [];
  } catch { /* storage 不可用时按空目录处理 */ }

  let mcpEnabled = false;
  let skillsEnabled = true;
  let ragTools = [];
  try {
    const result = await chrome.storage.local.get(['mcpEnabled', 'skillsEnabled', 'ragTools']);
    mcpEnabled = result.mcpEnabled === true;
    skillsEnabled = result.skillsEnabled !== false;
    ragTools = result.ragTools || [];
  } catch { /* ignore */ }

  const agentConnected = state.agentPlatform?.connected === true;
  const tools = buildToolCatalog({ builtinTools: BUILTIN_TOOLS, ragTools, agentConnected, skillsEnabled });

  // 全局技能开关关闭时，向导不应再推荐技能：绑定后运行期也不会生效
  let skills = [];
  if (skillsEnabled !== false) {
    try {
      skills = await getEnabledSkills();
    } catch { /* 技能列表拉取失败不影响工具目录 */ }
  }

  return {
    tools: tools.map(t => ({
      id: t.id,
      name: t.name || t.id,
      description: getToolDesc(t),
      category: t.category || 'other',
    })),
    skills: skills.map(s => ({ name: s.name, description: s.description || '' })),
    mcpServices: (mcpEnabled && agentConnected) ? groupMcpServices(mcpTools) : [],
    meta: { agentConnected, skillsEnabled, mcpEnabled },
  };
}
