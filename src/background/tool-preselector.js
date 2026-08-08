// background/tool-preselector.js - 工具预筛选：通过前置规划调用减少工具传递

import { getStoredConfig } from './config.js';
import { fetchWithRetry } from './tool-executor.js';
import { extractTextFromContent } from '../shared/token-counter.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  preselector: {
    nodeName: '工具预筛选',
    reasonFewTools: '工具数量少',
    reasonExtractFailed: '无法提取用户问题',
    reasonApiFailed: 'API 请求失败: {status}',
    reasonEmptyResult: '模型返回空数组',
    reasonNoMatch: '筛选结果无匹配',
  },
});

registerTranslations('en', {
  preselector: {
    nodeName: 'Tool Pre-filter',
    reasonFewTools: 'Too few tools',
    reasonExtractFailed: 'Unable to extract user question',
    reasonApiFailed: 'API request failed: {status}',
    reasonEmptyResult: 'Model returned empty array',
    reasonNoMatch: 'No matching results after filtering',
  },
});

/**
 * 截断过长内容（仅保留文本部分，避免 Base64 图片污染）
 */
function truncateContent(content, maxLen = 2000) {
  const str = extractTextFromContent(content);
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
    const paramInfo = paramNames.length > 0 ? ` (params: ${paramNames.join(', ')})` : '';
    return `- ${t.function.name}${paramInfo}: ${t.function.description}`;
  }).join('\n');

  return `You are an intelligent assistant. Based on the user's question, determine whether tools are needed to complete the task.

Rules:
1. If the question is very simple and you can answer directly (e.g., greetings, general knowledge, simple calculations), provide the answer directly.
2. If the question requires tools to complete (e.g., reading files, searching code, executing commands, fetching real-time information), select the needed tools.

Available tools:
${toolList}

Output in JSON format:
- For direct answers: {"type": "answer", "data": "your answer text"}
- When tools are needed: {"type": "tools", "data": ["tool_name_1", "tool_name_2"]}`;
}

/**
 * 解析工具预筛选的模型返回结果
 *
 * 优先解析新 JSON 格式（response_format: json_object 模式）：
 *   {"type": "answer", "data": "直接回答文本"}
 *   {"type": "tools", "data": ["tool1", "tool2"]}
 *
 * 兜底：若模型不支持 response_format，退回到旧格式提取逻辑
 *
 * @param {string} text - 模型返回的原始文本
 * @returns {{type: 'answer', content: string}|{type: 'tools', tools: Array}|null}
 */
function parsePreselectResponse(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  // 尝试解析为新 JSON 格式 { type, data }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && parsed.type && 'data' in parsed) {
      if (parsed.type === 'answer' && typeof parsed.data === 'string') {
        return { type: 'answer', content: parsed.data };
      }
      if (parsed.type === 'tools' && Array.isArray(parsed.data)) {
        return { type: 'tools', tools: parsed.data };
      }
    }
  } catch {
    // 非 JSON 或新格式，退到旧逻辑
  }

  // 兜底：旧格式提取（兼容不支持 response_format 的模型）
  const extracted = extractToolListFromResponse(trimmed);
  if (extracted) {
    return { type: 'tools', tools: extracted };
  }

  return null;
}

/**
 * 从模型返回的文本中健壮地提取工具名称 JSON 数组（兜底逻辑）
 *
 * 当模型不支持 response_format 时，可能返回混合格式（文本中夹带 JSON），
 * 此函数通过多种策略尝试提取：
 * 1. 提取 ```json ... ``` 或 ``` ... ``` 代码块中的 JSON
 * 2. 查找文本中的 JSON 数组（以 [ 开头、] 结尾的最大匹配）
 * 3. 正则匹配 JSON 数组
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
      logger.debug('[ToolPreselector]  from code blockmentionedfetch JSON successful');
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
        logger.debug('[ToolPreselector] from textmentionedfetch JSON group successful');
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
        logger.debug('[ToolPreselector] via regexmentionedfetch JSON group successful');
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
    nodeName: t('preselector.nodeName'),
    ...extra,
    status
  });

  // 获取可配置的预筛选阈值
  const config = await getStoredConfig();
  const preselectMinToolCount = config.reactConfig?.preselectMinToolCount ?? 3;

  // 如果工具数量未超过阈值，不需要筛选
  if (totalCount <= preselectMinToolCount) {
    logger.debug(`[ToolPreselector] tool count  count  ${totalCount} <= ${preselectMinToolCount},skip pre-filter`);
    return { type: 'tools', tools, executionLog: [createEntry('success', { action: { name: 'skip', params: { reason: t('preselector.reasonFewTools'), toolCount: totalCount } }, duration: 1 })] };
  }

  const userQuestion = extractLastUserQuestion(messages);
  if (!userQuestion) {
    logger.warn('[ToolPreselector] cannot extractuseraskquestion,using alltool');
    return { type: 'tools', tools, executionLog: [createEntry('failed', { error: t('preselector.reasonExtractFailed') })] };
  }

  const historyContext = extractHistoryContext(messages);
  const systemPrompt = buildPreselectPrompt(tools);

  logger.debug(`[ToolPreselector] start pre-filter,full count tool: ${totalCount} ,with historymessage: ${historyContext.length} `);

  const startTime = Date.now();

  try {
    const preselectConfig = config; // 复用上面已获取的 config
    const apiUrl = `${preselectConfig.apiBase}/chat/completions`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...historyContext,
      { role: 'user', content: `User question: ${userQuestion}` }
    ];

    const requestBody = {
      model: model || preselectConfig.modelName,
      messages: apiMessages,
      stream: false,
      temperature: 0.1,
      max_tokens: Math.min(4096, Math.max(1024, totalCount * 30)),
      response_format: { type: 'json_object' }
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
      logger.warn('[ToolPreselector] API request failed,using alltool');
      return { type: 'tools', tools, executionLog: [createEntry('failed', { error: t('preselector.reasonApiFailed', { status: response.status }), duration })] };
    }

    const data = await response.json();
    const rawContent = (data.choices?.[0]?.message?.content || '').trim();

    logger.debug('[ToolPreselector] largemodelreturn:', rawContent);

    // 解析模型返回结果（优先新 JSON 格式，兜底旧格式提取）
    const parsed = parsePreselectResponse(rawContent);

    if (parsed) {
      // 新格式直接判定为直接回答
      if (parsed.type === 'answer') {
        logger.debug('[ToolPreselector] modeldirect answer (newformat),no secondarycall with ');
        return { type: 'answer', content: parsed.content, executionLog: [createEntry('success', { thought: parsed.content, duration })] };
      }

      // parsed.type === 'tools'
      const selectedNames = parsed.tools;

      if (selectedNames.length === 0) {
        logger.warn('[ToolPreselector] returned empty toolgroup,using alltool');
        return { type: 'tools', tools, executionLog: [createEntry('success', { action: { name: 'all_tools', params: { reason: t('preselector.reasonEmptyResult') } }, duration })] };
      }

      // 使用 case-insensitive 匹配，防止模型返回大小写不一致的工具名
      const selectedNamesLower = new Set(selectedNames.map(n => String(n).toLowerCase()));
      const selectedTools = tools.filter(t =>
        selectedNamesLower.has(t.function.name.toLowerCase())
      );

      // 兜底：如果用户消息中包含 proto_（原型ID），确保 UI 原型工具被包含
      if (userQuestion.includes('proto_')) {
        const protoTools = ['preview_ui'];
        for (const toolName of protoTools) {
          if (!selectedTools.some(t => t.function.name === toolName)) {
            const tool = tools.find(t => t.function.name === toolName);
            if (tool) {
              selectedTools.push(tool);
              logger.debug(`[ToolPreselector] fallback appendprototypetool: ${toolName}`);
            }
          }
        }
      }

      if (selectedTools.length === 0) {
        logger.warn('[ToolPreselector] filter after toolempty,using alltool');
        return { type: 'tools', tools, executionLog: [createEntry('success', { action: { name: 'all_tools', params: { reason: t('preselector.reasonNoMatch') } }, duration })] };
      }

      logger.debug(`[ToolPreselector] pre-filter complete: ${totalCount} → ${selectedTools.length} tool`,
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
    logger.debug('[ToolPreselector] modeldirect answer,no secondarycall with ');
    return { type: 'answer', content: rawContent, executionLog: [createEntry('success', { thought: rawContent, duration })] };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.warn('[ToolPreselector] pre-filter exception,using alltool:', error.message);
    return { type: 'tools', tools, executionLog: [createEntry('failed', { error: error.message, duration })] };
  }
}
