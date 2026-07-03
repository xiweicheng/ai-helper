// shared/token-counter.js - Token 估算工具
// 使用字符数估算 token 数，无需引入 tiktoken 等重量级依赖

// 估算常量：中文约 1.5 字符/token，英文约 4 字符/token
// 参考 DeepSeek tokenizer 的行为特征
const CHINESE_CHAR_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
const CHARS_PER_TOKEN_CN = 1.5;
const CHARS_PER_TOKEN_EN = 4;

// 每条消息的 role + 结构开销（约 4 tokens）
const MESSAGE_OVERHEAD = 4;

/**
 * 估算单段文本的 token 数量
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  const chineseMatches = text.match(CHINESE_CHAR_REGEX);
  const chineseChars = chineseMatches ? chineseMatches.length : 0;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / CHARS_PER_TOKEN_CN + otherChars / CHARS_PER_TOKEN_EN);
}

/**
 * 估算消息数组的总 token 数
 * @param {Array<{role: string, content: string, tool_calls?: Array, tool_call_id?: string}>} messages
 * @returns {number}
 */
export function estimateMessagesTokens(messages) {
  if (!messages || messages.length === 0) return 0;
  return messages.reduce((sum, m) => {
    let content = '';
    if (typeof m.content === 'string') {
      content = m.content;
    } else if (m.content) {
      content = JSON.stringify(m.content);
    }
    // tool_calls 也消耗 token
    if (m.tool_calls) {
      content += JSON.stringify(m.tool_calls);
    }
    // tool_call_id 也消耗少量 token
    if (m.tool_call_id) {
      content += m.tool_call_id;
    }
    return sum + estimateTokens(content) + MESSAGE_OVERHEAD;
  }, 0);
}

/**
 * 按 token 上限截断文本，保留头部和尾部
 * @param {string} content - 原始文本
 * @param {number} maxTokens - 最大 token 数
 * @returns {string}
 */
export function truncateByTokens(content, maxTokens) {
  if (!content || typeof content !== 'string') return content;
  const currentTokens = estimateTokens(content);
  if (currentTokens <= maxTokens) return content;

  // 保留头部 70%，尾部 30%
  const headTokens = Math.floor(maxTokens * 0.7);
  const tailTokens = maxTokens - headTokens;

  const headChars = Math.floor(headTokens * CHARS_PER_TOKEN_EN);
  const tailChars = Math.floor(tailTokens * CHARS_PER_TOKEN_EN);

  const head = content.slice(0, headChars);
  const tail = content.slice(-tailChars);

  const truncatedTokens = currentTokens - maxTokens;
  return head + `\n\n... [中间 ${truncatedTokens} tokens 已截断] ...\n\n` + tail;
}

/**
 * 智能工具结果截断：根据内容类型采用不同的保留策略
 * - HTML: 优先保留 <body> 内容
 * - JSON: 保留顶层 key 结构，值摘要
 * - 代码: 保留头部 + 关键结构 + 尾部
 * - 纯文本: 固定 60% / 20% 头尾截断
 * @param {string} content - 原始内容
 * @param {number} maxTokens - 最大 token 数
 * @param {string} [contentType] - 内容类型提示: 'html' | 'json' | 'code' | 'text'
 * @returns {string}
 */
export function truncateContentSmart(content, maxTokens, contentType) {
  if (!content || typeof content !== 'string') return content;
  if (estimateTokens(content) <= maxTokens) return content;

  // 自动检测类型
  if (!contentType) {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      contentType = 'json';
    } else if (/<(!DOCTYPE|html|head|body)[\s>]/i.test(trimmed.substring(0, 200))) {
      contentType = 'html';
    } else {
      contentType = 'text';
    }
  }

  if (contentType === 'html') {
    return truncateHtmlSmart(content, maxTokens);
  } else if (contentType === 'json') {
    return truncateJsonSmart(content, maxTokens);
  }
  // text/code: 保留前 60% 字符 + 后 20% 字符
  const headChars = Math.floor(maxTokens * 0.6 * CHARS_PER_TOKEN_EN);
  const tailChars = Math.floor(maxTokens * 0.2 * CHARS_PER_TOKEN_EN);
  const head = content.slice(0, headChars);
  const tail = content.slice(-tailChars);
  return head + `\n\n... [省略 ${estimateTokens(content) - maxTokens} tokens] ...\n\n` + tail;
}

/**
 * HTML 智能截断：优先保留 <body> 内容
 */
function truncateHtmlSmart(content, maxTokens) {
  const bodyMatch = content.match(/<body[\s>][\s\S]*<\/body>/i);
  if (bodyMatch) {
    const bodyContent = bodyMatch[0];
    const headContent = content.substring(0, content.indexOf(bodyContent));
    // body 内容占 80%，头部占 20%
    const bodyBudget = Math.floor(maxTokens * 0.8);
    const headBudget = maxTokens - bodyBudget;
    const headChars = Math.floor(headBudget * CHARS_PER_TOKEN_EN);
    const bodyChars = Math.floor(bodyBudget * CHARS_PER_TOKEN_EN);
    return content.slice(0, headChars) +
      bodyContent.slice(0, bodyChars) +
      '\n<!-- 省略中间内容 -->\n' +
      bodyContent.slice(-Math.floor(bodyChars * 0.3)) +
      content.slice(-Math.floor(headChars * 0.3));
  }
  // 无 body 标签，fallback 到通用截断
  return truncateByTokens(content, maxTokens);
}

/**
 * JSON 智能截断：保留顶层 key 结构，值摘要
 */
function truncateJsonSmart(content, maxTokens) {
  try {
    const obj = JSON.parse(content);
    if (typeof obj !== 'object' || obj === null) {
      return truncateByTokens(content, maxTokens);
    }

    const summarized = {};
    const keys = Object.keys(obj);
    const maxKeys = Math.min(keys.length, 30);

    for (let i = 0; i < maxKeys; i++) {
      const key = keys[i];
      const val = obj[key];
      if (typeof val === 'string' && val.length > 200) {
        summarized[key] = val.substring(0, 200) + '...[截断]';
      } else if (typeof val === 'object' && val !== null) {
        summarized[key] = `[${Array.isArray(val) ? `Array(${val.length})` : `Object(${Object.keys(val).length} keys)`}]`;
      } else {
        summarized[key] = val;
      }
    }

    if (keys.length > maxKeys) {
      summarized['...[省略]'] = `还有 ${keys.length - maxKeys} 个字段`;
    }

    let result = JSON.stringify(summarized, null, 2);
    // 如果摘要后仍超预算，做最终字符截断
    if (estimateTokens(result) > maxTokens) {
      result = result.substring(0, Math.floor(maxTokens * CHARS_PER_TOKEN_EN));
    }
    return result;
  } catch {
    return truncateByTokens(content, maxTokens);
  }
}

/**
 * 模型上下文窗口配置（单位：tokens）
 * 作为内置默认值，用户可通过 chatConfig.contextWindow 覆盖
 */
export const MODEL_CONTEXT_WINDOWS = {
  'deepseek-v4-pro': 128000,
  'deepseek-v3': 128000,
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  'claude-3.5-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3-haiku': 200000,
  'claude-3-sonnet': 200000,
  default: 64000
};

/**
 * 获取模型上下文窗口大小
 * 优先级：用户配置 > 内置映射 > default
 * @param {string} modelName
 * @param {number} [userConfiguredWindow] - 用户手动配置的上下文窗口
 * @returns {number}
 */
export function getContextWindow(modelName, userConfiguredWindow) {
  if (userConfiguredWindow && userConfiguredWindow > 0) return userConfiguredWindow;
  return MODEL_CONTEXT_WINDOWS[modelName] || MODEL_CONTEXT_WINDOWS.default;
}

// ============================================================
// 上下文预算分配
// ============================================================

// 系统提示词预留 token 数
export const SYSTEM_PROMPT_BUDGET = 2000;

// 工具定义预留 token 数（工具数量 * 平均每个工具定义 ~200 tokens）
export function estimateToolsTokens(toolCount) {
  return toolCount * 200;
}

// 输出预留 token 数（给模型生成回答的空间）
export const OUTPUT_BUDGET = 4096;

/**
 * 计算可用于消息历史的 token 预算
 * @param {string} modelName
 * @param {number} toolCount
 * @param {number} [userConfiguredWindow]
 * @returns {number}
 */
export function getMessageBudget(modelName, toolCount = 0, userConfiguredWindow) {
  const contextWindow = getContextWindow(modelName, userConfiguredWindow);
  return contextWindow - SYSTEM_PROMPT_BUDGET - estimateToolsTokens(toolCount) - OUTPUT_BUDGET;
}

/**
 * 评估上下文压力等级
 * @param {number} usedTokens
 * @param {number} budget
 * @returns {{ level: 'safe'|'warning'|'critical', ratio: number }}
 */
export function assessContextPressure(usedTokens, budget) {
  const ratio = usedTokens / budget;
  if (ratio < 0.7) return { level: 'safe', ratio };
  if (ratio < 0.9) return { level: 'warning', ratio };
  return { level: 'critical', ratio };
}

/**
 * 基于 token 预算裁剪历史消息（从旧到新移除，确保 tool_calls/tool 配对）
 * 返回裁剪后的消息数组 + 被裁剪掉的消息摘要信息
 * @param {Array} messages - 包含 system message 的完整消息数组
 * @param {number} budget - token 预算上限
 * @param {Object} [options]
 * @param {boolean} [options.preserveSystem=true] - 是否保留 system message
 * @param {boolean} [options.generateSummary=true] - 是否生成被裁剪消息的摘要
 * @returns {{ messages: Array, trimmedCount: number, summary: string|null }}
 */
export function trimMessagesByBudget(messages, budget, options = {}) {
  const { preserveSystem = true, generateSummary = true } = options;
  const originalLen = messages.length;

  if (estimateMessagesTokens(messages) <= budget) {
    return { messages: [...messages], trimmedCount: 0, summary: null };
  }

  const systemMsg = preserveSystem && messages[0]?.role === 'system' ? [messages[0]] : [];
  const rest = systemMsg.length ? [...messages.slice(1)] : [...messages];

  const trimmedMessages = [];

  while (rest.length > 0) {
    const currentTokens = estimateMessagesTokens([...systemMsg, ...rest]);
    if (currentTokens <= budget) break;

    const removed = rest.shift();
    trimmedMessages.push(removed);

    // 如果移除的是 assistant(tool_calls)，则后续的 tool 消息也要一并移除
    if (removed?.role === 'assistant' && removed.tool_calls) {
      while (rest.length > 0 && rest[0]?.role === 'tool') {
        trimmedMessages.push(rest.shift());
      }
    }
  }

  const result = [...systemMsg, ...rest];
  const summary = generateSummary ? generateMessagesSummary(trimmedMessages) : null;

  return {
    messages: result,
    trimmedCount: originalLen - result.length,
    summary
  };
}

/**
 * 从被裁剪的消息中生成规则式结构化摘要
 * @param {Array} trimmedMessages - 被裁剪的消息
 * @returns {string|null}
 */
export function generateMessagesSummary(trimmedMessages) {
  if (!trimmedMessages || trimmedMessages.length === 0) return null;

  const summaryParts = [];
  let userQuestions = [];
  const toolCalls = [];
  const keyActions = [];

  for (const msg of trimmedMessages) {
    if (msg.role === 'user') {
      const text = typeof msg.content === 'string'
        ? msg.content
        : (Array.isArray(msg.content)
          ? msg.content.filter(c => c.type === 'text').map(c => c.text).join('')
          : '');
      // 提取用户问题的关键句（取前 80 字符）
      if (text && text.trim()) {
        const question = text.replace(/\[选中内容\]\n[\s\S]*?\n\n\[用户问题\]\n/, '')
          .replace(/\[引用内容\]\n[\s\S]*?\n\n\[用户问题\]\n/, '')
          .trim()
          .substring(0, 80);
        if (question) userQuestions.push(question);
      }
    } else if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        const name = tc.function?.name || tc.name || '未知工具';
        toolCalls.push(name);
      }
    } else if (msg.role === 'tool') {
      // 从 tool 结果中提取关键信息
      const content = typeof msg.content === 'string' ? msg.content : '';
      if (content.includes('success') || content.includes('result')) {
        // 尝试提取简短的状态信息
        const shortContent = content.substring(0, 100);
        if (shortContent) keyActions.push(shortContent.replace(/\n/g, ' ').substring(0, 60));
      }
    }
  }

  if (userQuestions.length > 0) {
    summaryParts.push(`- 用户问题：${userQuestions[userQuestions.length - 1]}`);
  }
  if (toolCalls.length > 0) {
    // 去重并限制数量
    const uniqueTools = [...new Set(toolCalls)].slice(0, 10);
    summaryParts.push(`- 使用的工具：${uniqueTools.join('、')}`);
  }

  if (summaryParts.length === 0) return null;
  return '[历史摘要]\n' + summaryParts.join('\n');
}

/**
 * 过滤消息中的内部字段，确保消息格式符合 API 要求
 * 同时扫描并修复 assistant(tool_calls) 与 tool 消息的配对关系
 * @param {Array} messages - 原始消息数组
 * @returns {Array} 过滤后的消息数组
 */
export function filterApiMessages(messages) {
  const filtered = messages.map((msg, index) => {
    const { executionLog, subtaskId, subtaskName, subtaskIndex, refusal, _reflection, _summary, ...rest } = msg;

    if (rest.role === 'tool') {
      if (!rest.tool_call_id) {
        console.warn(`[Background] 发现消息 ${index} 缺少 tool_call_id，已跳过`, msg);
        return null;
      }
      return {
        role: rest.role,
        content: rest.content,
        tool_call_id: rest.tool_call_id
      };
    }

    if (rest.role === 'assistant' && Array.isArray(rest.tool_calls)) {
      rest.tool_calls = rest.tool_calls.map(tc => ({
        id: tc.id,
        type: tc.type,
        function: tc.function
      }));
    }

    return rest;
  }).filter(msg => msg !== null);

  // 扫描并修复 tool_calls/tool 配对：如果 assistant(tool_calls) 后无 tool 消息，清除 tool_calls
  for (let i = 0; i < filtered.length; i++) {
    const msg = filtered[i];
    if (msg?.role === 'assistant' && msg.tool_calls) {
      let hasToolMsg = false;
      for (let j = i + 1; j < filtered.length; j++) {
        if (filtered[j].role === 'tool') {
          hasToolMsg = true;
        } else {
          break;
        }
      }
      if (!hasToolMsg) {
        console.warn('[Background] filterApiMessages: 第', i, '条 assistant 消息包含 tool_calls 但无对应 tool 消息，已清除');
        delete msg.tool_calls;
        if (!msg.content) {
          filtered.splice(i, 1);
          i--;
        }
      }
    }
  }

  return filtered;
}

// ============================================================
// 引用内容压缩
// ============================================================

// 引用内容保留的最大 token 数（超过此值的引用将压缩）
const MAX_QUOTED_CONTEXT_TOKENS = 2000;

/**
 * 压缩引用/选中内容，防止大段内容永久占据上下文
 * @param {string} ctx - 原始引用内容
 * @returns {{ compressed: string, wasCompressed: boolean }}
 */
export function compressQuotedContext(ctx) {
  if (!ctx) return { compressed: ctx, wasCompressed: false };
  const tokens = estimateTokens(ctx);
  if (tokens <= MAX_QUOTED_CONTEXT_TOKENS) {
    return { compressed: ctx, wasCompressed: false };
  }
  const truncated = truncateByTokens(ctx, MAX_QUOTED_CONTEXT_TOKENS);
  console.log(`[TokenCounter] 引用内容压缩: ${tokens} → ${estimateTokens(truncated)} tokens`);
  return { compressed: truncated, wasCompressed: true };
}
