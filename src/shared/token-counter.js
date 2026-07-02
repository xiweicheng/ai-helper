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
 * 模型上下文窗口配置（单位：tokens）
 * 根据实际使用的模型设置
 */
export const MODEL_CONTEXT_WINDOWS = {
  'deepseek-v4-pro': 128000,
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
  default: 64000
};

/**
 * 获取模型上下文窗口大小
 * @param {string} modelName
 * @returns {number}
 */
export function getContextWindow(modelName) {
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
 * @returns {number}
 */
export function getMessageBudget(modelName, toolCount = 0) {
  const contextWindow = getContextWindow(modelName);
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
 * 过滤消息中的内部字段，确保消息格式符合 API 要求
 * 同时扫描并修复 assistant(tool_calls) 与 tool 消息的配对关系
 * @param {Array} messages - 原始消息数组
 * @returns {Array} 过滤后的消息数组
 */
export function filterApiMessages(messages) {
  const filtered = messages.map((msg, index) => {
    const { executionLog, subtaskId, subtaskName, subtaskIndex, refusal, ...rest } = msg;

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