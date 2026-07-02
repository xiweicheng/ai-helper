// background/tool-preselector.js - 工具预筛选：通过前置规划调用减少工具传递

import { getStoredConfig } from './config.js';
import { fetchWithRetry } from './tool-executor.js';

/**
 * 截断过长内容
 */
function truncateContent(content, maxLen = 2000) {
  const str = typeof content === 'string' ? content : JSON.stringify(content);
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

/**
 * 从消息列表中提取最后一条用户消息（当前问题）
 */
function extractLastUserQuestion(messages) {
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) return '';
  return truncateContent(userMessages[userMessages.length - 1].content);
}

/**
 * 提取最近对话历史（排除 system/tool 消息），用于工具预筛选时提供上下文
 * 最多保留最近 HISTORY_COUNT 条 user+assistant 交替消息
 */
const HISTORY_COUNT = 4;

function extractHistoryContext(messages) {
  // 排除 system、tool 角色，只保留 user 和 assistant
  const dialogMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  if (dialogMessages.length === 0) return [];

  // 最后一条 user 消息是当前问题，不包含在历史中
  const lastUserIdx = dialogMessages.map((m, i) => ({ m, i })).filter(x => x.m.role === 'user').pop()?.i;
  if (lastUserIdx === undefined) return [];

  // 取最后一条 user 消息之前的最近 HISTORY_COUNT 条消息作为历史上下文
  const historyBefore = dialogMessages.slice(0, lastUserIdx);
  const recentHistory = historyBefore.slice(-HISTORY_COUNT);

  // 截断每条历史消息的内容，防止 token 过多
  return recentHistory.map(m => ({
    role: m.role,
    content: truncateContent(m.content, 1000)
  }));
}

/**
 * 构建工具预筛选的系统提示词
 */
function buildPreselectPrompt(tools) {
  const toolList = tools.map(t => {
    const params = t.function.parameters?.properties;
    const paramNames = params ? Object.keys(params).slice(0, 3) : []; // 最多展示 3 个参数名
    const paramInfo = paramNames.length > 0 ? ` (参数: ${paramNames.join(', ')})` : '';
    return `- ${t.function.name}${paramInfo}: ${t.function.description}`;
  }).join('\n');

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
 * 从模型返回的文本中健壮地提取工具名称 JSON 数组
 *
 * 支持的格式：
 * 1. 纯 JSON 数组：["tool1", "tool2"]
 * 2. JSON 代码块：```json\n["tool1"]\n```
 * 3. 无标记代码块：```\n["tool1"]\n```
 * 4. 文本中夹带 JSON：需要 ["tool1", "tool2"] 来完成
 * 5. 首尾有空白字符的情况
 *
 * @param {string} text - 模型返回的原始文本
 * @returns {Array|null} 解析成功的工具名称数组，失败返回 null
 */
function extractToolListFromResponse(text) {
  if (!text || typeof text !== 'string') return null;

  // 策略1: 提取 ```json ... ``` 或 ``` ... ``` 代码块中的 JSON
  const fencedMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fencedMatch) {
    const inner = fencedMatch[1].trim();
    const result = tryParseJson(inner);
    if (result) {
      console.log('[ToolPreselector] 从代码块中提取 JSON 成功');
      return result;
    }
  }

  // 策略2: 查找文本中的 JSON 数组（以 [ 开头、] 结尾的最大匹配）
  // 从第一个 [ 开始，找到对应的 ]
  const firstBracket = text.indexOf('[');
  if (firstBracket !== -1) {
    // 从第一个 [ 开始，尝试找到配对的 ]
    let depth = 0;
    let lastBracket = -1;
    for (let i = firstBracket; i < text.length; i++) {
      if (text[i] === '[') depth++;
      if (text[i] === ']') {
        depth--;
        if (depth === 0) {
          lastBracket = i;
          break;
        }
      }
    }

    if (lastBracket !== -1) {
      const jsonCandidate = text.substring(firstBracket, lastBracket + 1);
      const result = tryParseJson(jsonCandidate);
      if (result) {
        console.log('[ToolPreselector] 从文本中提取 JSON 数组成功');
        return result;
      }
    }
  }

  // 策略3: 正则匹配 JSON 数组（作为兜底，也尝试用 /\[[\s\S]*?\]/ 在多次 [... 出现时能更保守地提取）
  const arrayMatches = text.match(/\[[\s\S]*?\]/g);
  if (arrayMatches) {
    for (const candidate of arrayMatches) {
      const result = tryParseJson(candidate);
      if (result) {
        console.log('[ToolPreselector] 通过正则提取 JSON 数组成功');
        return result;
      }
    }
  }

  return null;
}

/**
 * 尝试解析 JSON，支持常见的格式错误修复
 *
 * @param {string} jsonStr - JSON 字符串
 * @returns {Array|null} 解析成功的数组，失败返回 null
 */
function tryParseJson(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') return null;

  const trimmed = jsonStr.trim();

  // 首先尝试直接解析
  try {
    const result = JSON.parse(trimmed);
    if (Array.isArray(result)) return result;
  } catch {
    // 直接解析失败，尝试修复常见问题
  }

  // 修复1: 移除尾部多余逗号 (如 ["a", "b",])
  try {
    const fixed = trimmed.replace(/,\s*\]/g, ']');
    const result = JSON.parse(fixed);
    if (Array.isArray(result)) return result;
  } catch {
    // 继续尝试其他修复
  }

  // 修复2: 确保所有元素都是字符串，给非字符串元素加引号
  try {
    const fixed = trimmed.replace(/\[([\s\S]*)\]/g, (_, inner) => {
      const items = inner.split(',').map(item => {
        const t = item.trim();
        // 如果已经有引号（单引号或双引号），保持不变
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
          return t;
        }
        // 否则加上双引号
        return `"${t}"`;
      });
      return `[${items.join(', ')}]`;
    });
    const result = JSON.parse(fixed);
    if (Array.isArray(result)) return result;
  } catch {
    // 所有修复都失败
  }

  return null;
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
    nodeName: '工具预筛选',
    ...extra,
    status
  });

  // 获取可配置的预筛选阈值
  const config = await getStoredConfig();
  const preselectMinToolCount = config.reactConfig?.preselectMinToolCount ?? 3;

  // 如果工具数量未超过阈值，不需要筛选
  if (totalCount <= preselectMinToolCount) {
    console.log(`[ToolPreselector] 工具数量 ${totalCount} <= ${preselectMinToolCount}，跳过预筛选`);
    return { type: 'tools', tools, executionLog: [createEntry('success', { action: { name: 'skip', params: { reason: '工具数量少', toolCount: totalCount } }, duration: 1 })] };
  }

  const userQuestion = extractLastUserQuestion(messages);
  if (!userQuestion) {
    console.warn('[ToolPreselector] 无法提取用户问题，使用全量工具');
    return { type: 'tools', tools, executionLog: [createEntry('failed', { error: '无法提取用户问题' })] };
  }

  const historyContext = extractHistoryContext(messages);
  const systemPrompt = buildPreselectPrompt(tools);

  console.log(`[ToolPreselector] 开始预筛选，全量工具: ${totalCount} 个，携带历史消息: ${historyContext.length} 条`);

  const startTime = Date.now();

  try {
    const preselectConfig = config; // 复用上面已获取的 config
    const apiUrl = `${preselectConfig.apiBase}/chat/completions`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...historyContext,
      { role: 'user', content: `用户问题：${userQuestion}` }
    ];

    const requestBody = {
      model: model || preselectConfig.modelName,
      messages: apiMessages,
      stream: false,
      temperature: 0.1,
      max_tokens: Math.min(4096, Math.max(1024, totalCount * 30))
    };

    const response = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${preselectConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }, preselectConfig.reactConfig.apiTimeout, preselectConfig.reactConfig.apiRetryCount, preselectConfig.reactConfig.apiRetryBaseDelay);

    const duration = Date.now() - startTime;

    if (!response.ok) {
      console.warn('[ToolPreselector] API 请求失败，使用全量工具');
      return { type: 'tools', tools, executionLog: [createEntry('failed', { error: `API 请求失败: ${response.status}`, duration })] };
    }

    const data = await response.json();
    const rawContent = (data.choices?.[0]?.message?.content || '').trim();

    console.log('[ToolPreselector] 大模型返回:', rawContent);

    // 健壮的 JSON 提取，支持多种格式
    const extractedJson = extractToolListFromResponse(rawContent);

    if (extractedJson) {
      const selectedNames = extractedJson;

      if (!Array.isArray(selectedNames)) {
        console.warn('[ToolPreselector] 提取的结果不是数组，当作直接回答');
        return { type: 'answer', content: rawContent, executionLog: [createEntry('success', { thought: rawContent, duration })] };
      }

      if (selectedNames.length === 0) {
        console.warn('[ToolPreselector] 返回空工具数组，使用全量工具');
        return { type: 'tools', tools, executionLog: [createEntry('success', { action: { name: 'all_tools', params: { reason: '模型返回空数组' } }, duration })] };
      }

      // 使用 case-insensitive 匹配，防止模型返回大小写不一致的工具名
      const selectedNamesLower = new Set(selectedNames.map(n => String(n).toLowerCase()));
      const selectedTools = tools.filter(t =>
        selectedNamesLower.has(t.function.name.toLowerCase())
      );

      // 兜底：如果用户消息中包含 proto_（原型ID），确保 UI 原型工具被包含
      if (userQuestion.includes('proto_')) {
        const protoTools = ['get_ui_prototype', 'preview_ui_prototype'];
        for (const toolName of protoTools) {
          if (!selectedTools.some(t => t.function.name === toolName)) {
            const tool = tools.find(t => t.function.name === toolName);
            if (tool) {
              selectedTools.push(tool);
              console.log(`[ToolPreselector] 兜底追加原型工具: ${toolName}`);
            }
          }
        }
      }

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
          apiRequest: { model: requestBody.model, messageCount: apiMessages.length, toolCount: totalCount },
          apiResponse: { toolCountAfter: selectedTools.length },
          duration
        })]
      };
    }

    // 无法提取 JSON 数组，当作直接回答
    console.log('[ToolPreselector] 模型直接回答，无需二次调用');
    return { type: 'answer', content: rawContent, executionLog: [createEntry('success', { thought: rawContent, duration })] };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.warn('[ToolPreselector] 预筛选异常，使用全量工具:', error.message);
    return { type: 'tools', tools, executionLog: [createEntry('failed', { error: error.message, duration })] };
  }
}
