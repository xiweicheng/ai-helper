// background/agent-dispatcher.js - Sub-Agent 调度执行器
import { callApiNonStream, reactLoop } from './react-loop.js';
import { getTools } from './tool-executor.js';
import { getStoredConfig } from './config.js';
import { incrementDialogApiCallCount, getDialogApiCallCount } from './state.js';
import { BUILTIN_AGENTS } from '../shared/agent-defaults.js';
import * as AgentClient from './local-agent-client.js';
import logger from '../shared/logger.js';

/**
 * dispatch_task 子代理嵌套深度上限
 * 0 = 主任务，1 = 一级子代理，2 = 二级子代理（到此为止，不能再 dispatch）
 * 防止子代理内部又 dispatch_task 导致递归 ReAct，token/超时爆炸
 */
const MAX_DISPATCH_DEPTH = 2;

/**
 * 从 sessionId 推算当前 dispatch 深度
 * 派生规则：`${parentSessionId}_sub_${subAgentId}`（见 executeDispatchSubAgent）
 * 因此 sessionId 中 "_sub_" 出现的次数即为当前深度
 *   "abc"                          → 0（主任务）
 *   "abc_sub_agent1"               → 1（一级子代理）
 *   "abc_sub_agent1_sub_agent2"    → 2（二级子代理）
 */
function getDispatchDepth(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return 0;
  const matches = sessionId.match(/_sub_/g);
  return matches ? matches.length : 0;
}

/**
 * 从浏览器存储中读取 Agent 定义
 * @param {string} agentId
 * @returns {Promise<Object|null>}
 */
async function loadAgent(agentId) {
  const builtin = BUILTIN_AGENTS.find(a => a.id === agentId);
  if (builtin) return builtin;

  // 用户自定义 Agent
  const result = await chrome.storage.local.get(['customAgents']);
  const customAgents = result.customAgents || [];
  return customAgents.find(a => a.id === agentId) || null;
}

/**
 * 构建子 Agent 的系统提示词（含技能过滤）
 */
async function buildSubAgentPrompt(agent, task) {
  let prompt = agent.systemPrompt || '';
  if (!prompt.trim()) {
    prompt = `You are an AI assistant. Please complete the following task.`;
  }

  // 注入 Skill Prompts（如果有绑定的技能）
  try {
    let skillPrompts = '';
    if (agent.skillIds != null && Array.isArray(agent.skillIds) && agent.skillIds.length > 0) {
      // 只注入指定技能的 Prompts
      const result = await AgentClient.getAgentSkillPromptsFiltered(agent.skillIds);
      skillPrompts = result.prompts || '';
    } else if (agent.skillIds == null) {
      // 未指定 skillIds，注入全部启用技能
      const result = await AgentClient.getAgentSkillPrompts();
      skillPrompts = result.prompts || '';
    }
    // agent.skillIds 为 [] 时不注入任何技能
    if (skillPrompts) {
      prompt += '\n\n' + skillPrompts;
    }
  } catch { /* 获取失败不影响主流程 */ }

  return `${prompt}

## Current Task
${task}

## Notes
- You are a sub-agent; only complete the task assigned to you
- Use your available tools to complete the task efficiently
- Return the result directly after completion; no extra confirmation is needed
- Current time: ${new Date().toLocaleString('zh-CN')}`;
}

/**
 * 执行 dispatch_task 工具
 * 
 * 关键设计：子 Agent 使用派生 sessionId（`主sessionId + '_sub_agentId'`），
 * 确保子 Agent 的流式消息（STREAM_*）和执行日志（EXECUTION_STATUS_UPDATE）
 * 不会干扰主 Agent 的 UI 状态：
 *   - 主 Agent 的 listener 通过 `message.sessionId !== mySessionId` 过滤
 *   - 主 Agent 的 _se() 按 sessionId 隔离
 *   - 子 Agent 的 AbortController 也独立隔离
 * 
 * @param {Object} args - { subAgentId, task }
 * @param {string} toolCallId
 * @param {string} sessionId - 主会话的 sessionId
 * @returns {Promise<Object>}
 */
export async function executeDispatchSubAgent(args, toolCallId, sessionId) {
  // 嵌套深度检查：防止子代理内部又 dispatch_task 导致递归 ReAct 爆炸
  const currentDepth = getDispatchDepth(sessionId);
  if (currentDepth >= MAX_DISPATCH_DEPTH) {
    logger.warn(`[AgentDispatcher] dispatch depth limit reached: depth=${currentDepth}, max=${MAX_DISPATCH_DEPTH}, sessionId=${sessionId}`);
    return {
      success: false,
      error: `Sub-agent nesting depth limit reached (max ${MAX_DISPATCH_DEPTH}, current ${currentDepth}). Please complete the task directly using your own tools instead of dispatching to another sub-agent.`,
      tool_call_id: toolCallId,
    };
  }

  // 兼容 AI 模型可能使用的不同参数名
  const subAgentId = args.subAgentId || args.agent_id || args.sub_agent_id;
  const task = args.task;

  if (!subAgentId || !task) {
    return {
      success: false,
      error: 'Missing parameters: subAgentId/sub_agent_id and task are both required',
      tool_call_id: toolCallId,
    };
  }

  logger.debug('[AgentDispatcher] dispatchsub Agent:', subAgentId, 'task:', task.substring(0, 100));

  // 1. 加载子 Agent 定义
  const agent = await loadAgent(subAgentId);
  if (!agent) {
    return {
      success: false,
      error: `Sub-agent not found: ${subAgentId}`,
      tool_call_id: toolCallId,
    };
  }

  logger.debug('[AgentDispatcher] sub Agent:', agent.name);

  // 2. 获取子 Agent 的工具列表
  const agentTools = await getTools(agent.toolIds, agent.id, agent.skillIds);
  logger.debug('[AgentDispatcher] sub Agent tool count :', agentTools.length);

  // 3. 构建子 Agent 消息
  const systemPrompt = await buildSubAgentPrompt(agent, task);
  const messages = [{ role: 'system', content: systemPrompt }];

  // 4. 获取配置
  const config = await getStoredConfig();

  // 5. 派生 sessionId：确保子 Agent 的所有信令与主 Agent 隔离
  const subSessionId = sessionId ? `${sessionId}_sub_${subAgentId}` : `sub_${subAgentId}`;

  const apiParams = {
    temperature: agent.temperature !== null && agent.temperature !== undefined
      ? agent.temperature
      : (config.temperature !== undefined ? config.temperature : 0.2),
    top_p: agent.topP !== null && agent.topP !== undefined
      ? agent.topP
      : (config.topP !== undefined ? config.topP : 1.0),
  };

  const model = agent.model || config.modelName || 'deepseek-v4-pro';

  try {
    let result;

    if (agentTools.length > 0) {
      // 有工具可用，走 ReAct 循环（使用派生 sessionId 隔离信令）
      logger.debug('[AgentDispatcher] sub Agent using ReAct mode,tool count :', agentTools.length, 'subSessionId:', subSessionId);
      const reactResult = await reactLoop(
        messages, model, agentTools,
        null,  // tabId - sub-agent 不需要 tab 访问
        apiParams, subSessionId,
        { type: 'subagent', agentId: subAgentId },  // taskContext
        null,  // onLogUpdate - sub-agent 不需要回调
        { value: 0 }  // globalIteration
      );
      result = reactResult.content !== undefined ? reactResult.content : reactResult;
    } else {
      // 无工具，直接调用非流式 API（使用派生 sessionId 隔离信令）
      logger.debug('[AgentDispatcher] sub Agent using non-streamingmode ( no tool), subSessionId:', subSessionId);
      const apiResult = await callApiNonStream(messages, model, apiParams, subSessionId);
      result = apiResult.content !== undefined ? apiResult.content : apiResult;
    }

    // 限制返回结果长度
    const maxResultLen = 4000;
    const trimmedResult = typeof result === 'string' && result.length > maxResultLen
      ? result.substring(0, maxResultLen) + '\n\n... (result truncated)'
      : result;

    logger.debug('[AgentDispatcher] sub Agent execution complete:', agent.name, 'result length:', typeof trimmedResult === 'string' ? trimmedResult.length : 'N/A');

    return {
      success: true,
      content: `## Sub-agent [${agent.name}] Execution Result\n\n${trimmedResult}`,
      tool_call_id: toolCallId,
    };
  } catch (error) {
    logger.error('[AgentDispatcher] sub Agent execution failed:', error);
    return {
      success: false,
      error: `Sub-agent [${agent.name}] execution failed: ${error.message || error}`,
      tool_call_id: toolCallId,
    };
  }
}
