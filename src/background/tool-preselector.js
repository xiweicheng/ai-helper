// background/tool-preselector.js - 工具预筛选：通过前置规划调用减少工具传递

import { getStoredConfig } from './config.js';
import { fetchWithRetry } from './tool-executor.js';

/**
 * 从消息列表中提取用户问题摘要
 */
function extractUserQuestion(messages) {
  // 取最后一条 user 角色的消息
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) return '';
  const lastUserMsg = userMessages[userMessages.length - 1];
  const content = typeof lastUserMsg.content === 'string'
    ? lastUserMsg.content
    : JSON.stringify(lastUserMsg.content);
  // 截断过长的内容，保留前 2000 字
  return content.length > 2000 ? content.substring(0, 2000) + '...' : content;
}

/**
 * 构建工具预筛选的系统提示词
 */
function buildPreselectPrompt(tools) {
  const toolList = tools.map(t =>
    `- ${t.function.name}: ${t.function.description}`
  ).join('\n');

  return `你是智能助手。根据用户的问题，判断是否需要使用工具来完成。

规则：
1. 如果问题非常简单，你可以直接回答（如问候、常识问答、简单计算等），请直接给出回答内容。
2. 如果问题需要工具才能完成（如读取文件、搜索代码、执行命令、获取实时信息等），只输出一个 JSON 字符串数组，包含需要的工具名称。

可用工具列表：
${toolList}

输出格式：
- 直接回答时：直接输出回答内容
- 需要工具时：["tool_name_1", "tool_name_2"]`;
}

/**
 * 预筛选工具：通过一次轻量 API 调用让大模型判断需要哪些工具
 *
 * 对于简单问题，模型会直接回答，无需二次调用。
 *
 * @param {Array} messages - 用户消息列表
 * @param {string} model - 模型名称
 * @param {Array} tools - 全量工具列表
 * @param {Object} apiParams - API 参数（temperature 等）
 * @returns {Promise<{type: 'answer', content: string, executionLog: Array}|{type: 'tools', tools: Array, executionLog: Array}>}
 */
export async function preselectTools(messages, model, tools, apiParams = {}, callCount = 1) {
  const totalCount = tools.length;
  const preselectId = crypto.randomUUID();
  const now = new Date().toISOString();

  // 基础 entry
  const createEntry = (status, extra = {}) => ({
    id: preselectId,
    iteration: 0,
    timestamp: now,
    nodeType: 'preselect',
    nodeName: `API调用 (第${callCount}次)（🔍工具预筛选）`,
    ...extra,
    status
  });

  // 如果工具很少（<=5个），不需要筛选
  if (totalCount <= 5) {
    console.log('[ToolPreselector] 工具数量 <= 5，跳过预筛选');
    return { type: 'tools', tools, executionLog: [createEntry('success', { action: { name: 'skip', params: { reason: '工具数量少', toolCount: totalCount } }, duration: 1 })] };
  }

  const userQuestion = extractUserQuestion(messages);
  if (!userQuestion) {
    console.warn('[ToolPreselector] 无法提取用户问题，使用全量工具');
    return { type: 'tools', tools, executionLog: [createEntry('failed', { error: '无法提取用户问题' })] };
  }

  const systemPrompt = buildPreselectPrompt(tools);

  console.log(`[ToolPreselector] 开始预筛选，全量工具: ${totalCount} 个`);

  const startTime = Date.now();

  try {
    const config = await getStoredConfig();
    const apiUrl = `${config.apiBase}/chat/completions`;

    const requestBody = {
      model: model || config.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `用户问题：${userQuestion}` }
      ],
      stream: false,
      temperature: 0.1,
      max_tokens: 1024
    };

    const response = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }, config.reactConfig.apiTimeout, config.reactConfig.apiRetryCount, config.reactConfig.apiRetryBaseDelay);

    const duration = Date.now() - startTime;

    if (!response.ok) {
      console.warn('[ToolPreselector] API 请求失败，使用全量工具');
      return { type: 'tools', tools, executionLog: [createEntry('failed', { error: `API 请求失败: ${response.status}`, duration })] };
    }

    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content || '').trim();

    console.log('[ToolPreselector] 大模型返回:', content);

    // 尝试从返回内容中提取 JSON 数组
    const jsonMatch = content.match(/^\s*\[.*\]\s*$/s);
    if (jsonMatch) {
      // 内容看起来是 JSON 数组，尝试解析为工具列表
      try {
        const selectedNames = JSON.parse(content);

        if (!Array.isArray(selectedNames)) {
          console.warn('[ToolPreselector] 返回的不是数组，当作直接回答');
          return { type: 'answer', content, executionLog: [createEntry('success', { thought: content, duration })] };
        }

        if (selectedNames.length === 0) {
          console.warn('[ToolPreselector] 返回空工具数组，使用全量工具');
          return { type: 'tools', tools, executionLog: [createEntry('success', { action: { name: 'all_tools', params: { reason: '模型返回空数组' } }, duration })] };
        }

        const selectedTools = tools.filter(t =>
          selectedNames.includes(t.function.name)
        );

        if (selectedTools.length === 0) {
          console.warn('[ToolPreselector] 筛选后工具为空，使用全量工具');
          return { type: 'tools', tools, executionLog: [createEntry('success', { action: { name: 'all_tools', params: { reason: '筛选结果无匹配' } }, duration })] };
        }

        console.log(`[ToolPreselector] 预筛选完成: ${totalCount} → ${selectedTools.length} 个工具`,
          selectedTools.map(t => t.function.name));

        return {
          type: 'tools',
          tools: selectedTools,
          executionLog: [createEntry('success', {
            action: {
              name: 'preselect',
              params: { selected: selectedTools.map(t => t.function.name) }
            },
            apiRequest: { model: requestBody.model, messageCount: 2, toolCount: totalCount },
            apiResponse: { toolCountAfter: selectedTools.length },
            duration
          })]
        };
      } catch {
        console.warn('[ToolPreselector] JSON 解析失败，当作直接回答');
        return { type: 'answer', content, executionLog: [createEntry('success', { thought: content, duration })] };
      }
    }

    // 不是 JSON 数组，当作直接回答
    console.log('[ToolPreselector] 模型直接回答，无需二次调用');
    return { type: 'answer', content, executionLog: [createEntry('success', { thought: content, duration })] };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.warn('[ToolPreselector] 预筛选异常，使用全量工具:', error.message);
    return { type: 'tools', tools, executionLog: [createEntry('failed', { error: error.message, duration })] };
  }
}
