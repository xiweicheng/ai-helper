// background/context-summarizer.js - 增量对话摘要
// 当 ReAct 循环上下文 token 超标时，将旧轮次的工具调用及结果压缩为一句话摘要，
// 注入回对话中（role: 'user'），避免直接删除导致上下文信息丢失。

import { fetchWithRetry } from './tool-executor.js';
import logger from '../shared/logger.js';

// 摘要请求的最大输出 token 数（一句话摘要，通常 50-150 字即可）
const SUMMARY_MAX_TOKENS = 200;

// 每轮工具结果在摘要 prompt 中保留的最大字符数
const TOOL_RESULT_MAX_CHARS = 500;

// 参数摘要中保留的最大字符数
const PARAMS_MAX_CHARS = 150;

/**
 * 从当前消息数组中提取最旧的一轮"完整对话轮次"
 *
 * 一轮的定义：
 *   从一条 assistant(tool_calls) 消息开始，
 *   包括其后所有连着的 tool 消息，
 *   直到遇到下一条 assistant、user 或消息数组末尾。
 *
 * @param {Array} messages - 当前消息数组（不含 system 和摘要消息）
 * @param {number} startIdx - 从此下标开始查找
 * @returns {{ roundMessages: Array, endIdx: number }|null}
 *   roundMessages - 本轮所有消息，endIdx - 本轮结束后的下标（即下一轮起始位置）
 */
function extractOldestRound(messages, startIdx = 0) {
  for (let i = startIdx; i < messages.length; i++) {
    const msg = messages[i];
    // 找到第一条 assistant(tool_calls)
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const roundMessages = [msg];
      let j = i + 1;
      // 收集后续所有 tool 消息
      while (j < messages.length && messages[j].role === 'tool') {
        roundMessages.push(messages[j]);
        j++;
      }
      return { roundMessages, endIdx: j, startIdx: i };
    }
  }
  return null;
}

/**
 * 提取工具调用的关键参数摘要
 * @param {Object} args - 工具调用参数
 * @returns {string}
 */
function extractKeyParams(args) {
  if (!args || typeof args !== 'object' || Object.keys(args).length === 0) {
    return '';
  }
  const keys = Object.keys(args);
  if (keys.length === 0) return '';

  // 最多展示 2 个关键参数，截断值内容
  const keyNames = ['path', 'query', 'url', 'command', 'name', 'pattern', 'filePath', 'content'];
  const displayKeys = keys.filter(k => keyNames.includes(k)).slice(0, 2);
  if (displayKeys.length === 0) {
    // 没有预设关键参数名，取前 1 个非空参数
    const firstKey = keys.find(k => args[k] != null && args[k] !== '');
    if (!firstKey) return '';
    displayKeys.push(firstKey);
  }

  return displayKeys.map(k => {
    const val = typeof args[k] === 'string' ? args[k] : JSON.stringify(args[k]);
    return `${k}=${val.substring(0, PARAMS_MAX_CHARS)}`;
  }).join(', ');
}

/**
 * 将一轮对话（assistant tool_calls + tool 结果）压缩为一句话摘要
 *
 * @param {Array} roundMessages - 一轮完整对话的原始消息
 *   格式：[assistant(tool_calls), tool, tool, ...]
 * @param {Object} config - API 配置（含 apiBase、apiKey、modelName）
 * @param {string} model - 模型名称
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal] - 取消信号
 * @param {number} [options.timeout=15000] - 超时毫秒
 * @returns {Promise<string|null>} 摘要文本，失败返回 null（调用方降级到直接删除）
 */
export async function summarizeRound(roundMessages, config, model, options = {}) {
  if (!roundMessages || roundMessages.length < 2) {
    logger.debug('[ContextSummarizer] 轮次消息不足，跳过摘要');
    return null;
  }

  const assistantMsg = roundMessages.find(m => m.role === 'assistant' && m.tool_calls);
  if (!assistantMsg) {
    logger.debug('[ContextSummarizer] 未找到 assistant(tool_calls)，跳过摘要');
    return null;
  }

  // 提取每个工具调用的名称 + 参数 + 结果摘要
  const toolCallInfos = assistantMsg.tool_calls.map((tc, idx) => {
    const name = tc.function?.name || tc.name || 'unknown';
    const argsStr = extractKeyParams(
      typeof tc.function?.arguments === 'string'
        ? (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })()
        : (tc.function?.arguments || {})
    );

    // 对应的 tool 结果消息
    const toolMsg = roundMessages.find(m =>
      m.role === 'tool' && m.tool_call_id === (tc.id || assistantMsg.tool_calls[idx]?.id)
    );
    const resultStr = toolMsg
      ? (typeof toolMsg.content === 'string' ? toolMsg.content : JSON.stringify(toolMsg.content))
      : '(无返回)';
    const resultSnippet = resultStr.substring(0, TOOL_RESULT_MAX_CHARS);

    return `工具: ${name}${argsStr ? ` (${argsStr})` : ''}\n结果: ${resultSnippet}`;
  });

  const summaryPrompt = `请用一句话概括以下工具调用的执行情况，提取关键发现：

${toolCallInfos.join('\n\n')}

输出要求：用中文一句话概括本轮操作做了什么、发现了什么关键信息。不超过150字。`;

  try {
    const apiUrl = `${config.apiBase}/chat/completions`;

    const response = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || config.modelName,
        messages: [{ role: 'user', content: summaryPrompt }],
        stream: false,
        max_tokens: SUMMARY_MAX_TOKENS,
        temperature: 0.1
      }),
      signal: options.signal
    }, options.timeout || 15000, 1, 500); // 摘要只重试 1 次，快速失败

    if (!response.ok) {
      logger.warn(`[ContextSummarizer] API 请求失败: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const summary = (data.choices?.[0]?.message?.content || '').trim();

    if (!summary) {
      logger.warn('[ContextSummarizer] 摘要返回为空');
      return null;
    }

    logger.debug(`[ContextSummarizer] 摘要完成: ${summary.substring(0, 100)}`);
    return summary;
  } catch (error) {
    logger.warn('[ContextSummarizer] 摘要请求异常:', error.message);
    return null;
  }
}

/**
 * 从消息数组中找出所有可摘要的轮次并按顺序返回
 * 用于在一个 token 超标周期内批量摘要多轮
 *
 * @param {Array} messages - 不包括 system 和已摘要消息的数组
 * @returns {Array<{ roundMessages: Array, startIdx: number, endIdx: number }>}
 */
export function extractAllRounds(messages) {
  const rounds = [];
  let currentIdx = 0;

  while (currentIdx < messages.length) {
    const result = extractOldestRound(messages, currentIdx);
    if (!result) break;
    rounds.push({
      roundMessages: result.roundMessages,
      startIdx: result.startIdx,
      endIdx: result.endIdx
    });
    currentIdx = result.endIdx;
  }

  return rounds;
}
