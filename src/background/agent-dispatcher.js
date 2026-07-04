// background/agent-dispatcher.js - Sub-Agent 调度执行器
import { callApiNonStream, reactLoop } from './react-loop.js';
import { getTools } from './tool-executor.js';
import { getStoredConfig } from './config.js';
import { incrementDialogApiCallCount, getDialogApiCallCount } from './state.js';
import { BUILTIN_AGENTS } from '../shared/agent-defaults.js';

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
 * 构建子 Agent 的系统提示词
 */
function buildSubAgentPrompt(agent, task) {
  let prompt = agent.systemPrompt || '';
  if (!prompt.trim()) {
    prompt = `你是AI智能助手，请完成以下任务。`;
  }
  return `${prompt}

## 当前任务
${task}

## 注意事项
- 你是一个子 Agent，只需完成分配给你的任务
- 使用你可用的工具高效完成任务
- 完成后直接返回结果，不需要额外的确认
- 当前时间：${new Date().toLocaleString('zh-CN')}`;
}

/**
 * 执行 dispatch_sub_agent 工具
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
  // 兼容 AI 模型可能使用的不同参数名
  const subAgentId = args.subAgentId || args.agent_id || args.sub_agent_id;
  const task = args.task;

  if (!subAgentId || !task) {
    return {
      success: false,
      error: '缺少参数：subAgentId/sub_agent_id 和 task 都是必填的',
      tool_call_id: toolCallId,
    };
  }

  console.log('[AgentDispatcher] 调度子 Agent:', subAgentId, '任务:', task.substring(0, 100));

  // 1. 加载子 Agent 定义
  const agent = await loadAgent(subAgentId);
  if (!agent) {
    return {
      success: false,
      error: `未找到子 Agent: ${subAgentId}`,
      tool_call_id: toolCallId,
    };
  }

  console.log('[AgentDispatcher] 子 Agent:', agent.name);

  // 2. 获取子 Agent 的工具列表
  const agentTools = await getTools(agent.toolIds);
  console.log('[AgentDispatcher] 子 Agent 工具数:', agentTools.length);

  // 3. 构建子 Agent 消息
  const systemPrompt = buildSubAgentPrompt(agent, task);
  const messages = [{ role: 'system', content: systemPrompt }];

  // 4. 获取配置
  const config = await getStoredConfig();

  // 5. 派生 sessionId：确保子 Agent 的所有信令与主 Agent 隔离
  const subSessionId = sessionId ? `${sessionId}_sub_${subAgentId}` : `sub_${subAgentId}`;

  const apiParams = {
    temperature: agent.temperature !== null ? agent.temperature : config.temperature,
    top_p: agent.topP !== null ? agent.topP : config.topP,
  };

  const model = agent.model || config.model || 'deepseek-v4-pro';

  try {
    let result;

    if (agentTools.length > 0) {
      // 有工具可用，走 ReAct 循环（使用派生 sessionId 隔离信令）
      console.log('[AgentDispatcher] 子 Agent 使用 ReAct 模式，工具数:', agentTools.length, 'subSessionId:', subSessionId);
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
      console.log('[AgentDispatcher] 子 Agent 使用非流式模式（无工具）, subSessionId:', subSessionId);
      const apiResult = await callApiNonStream(messages, model, apiParams, subSessionId);
      result = apiResult.content !== undefined ? apiResult.content : apiResult;
    }

    // 限制返回结果长度
    const maxResultLen = 4000;
    const trimmedResult = typeof result === 'string' && result.length > maxResultLen
      ? result.substring(0, maxResultLen) + '\n\n... (结果已截断)'
      : result;

    console.log('[AgentDispatcher] 子 Agent 执行完成:', agent.name, '结果长度:', typeof trimmedResult === 'string' ? trimmedResult.length : 'N/A');

    return {
      success: true,
      content: `## 子 Agent [${agent.name}] 执行结果\n\n${trimmedResult}`,
      tool_call_id: toolCallId,
    };
  } catch (error) {
    console.error('[AgentDispatcher] 子 Agent 执行失败:', error);
    return {
      success: false,
      error: `子 Agent [${agent.name}] 执行失败: ${error.message || error}`,
      tool_call_id: toolCallId,
    };
  }
}
