// background/context-summarizer.js - 增量对话摘要
// 当 ReAct 循环上下文 token 超阈值时，将旧轮次的工具调用及结果批量压缩为结构化摘要，
// 注入回对话中（role: 'user'），避免直接删除导致上下文信息丢失。
// 支持批量压缩（summarizeRoundsBatch，一次 LLM 调用压缩多轮）。
// 旧单轮摘要 summarizeRound 已随 P1-6 批量压缩接入后无调用方而移除。

import { fetchWithRetry } from './tool-executor.js';
import logger from '../shared/logger.js';
import { truncateByTokens } from '../shared/token-counter.js';

// 批量压缩 transcript 输入上限（token）：防止超长会话下压缩请求自身超出模型窗口，
// 白烧一次 30s 调用后降级（#10）；可经 options.transcriptMaxTokens 按模型窗口覆盖
const BATCH_TRANSCRIPT_MAX_TOKENS = 30000;

// 批量压缩请求的最大输出 token 数（结构化模板，需更长的输出）
const BATCH_SUMMARY_MAX_TOKENS = 800;

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
 * 提取单个工具调用的名称 + 关键参数 + 对应结果的转写文本
 * @param {Object} tc - tool_call 对象
 * @param {Array} roundMessages - 包含对应 tool 结果消息的数组
 * @returns {string}
 */
function buildToolCallInfo(tc, roundMessages) {
  const name = tc.function?.name || tc.name || 'unknown';
  const argsStr = extractKeyParams(
    typeof tc.function?.arguments === 'string'
      ? (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })()
      : (tc.function?.arguments || {})
  );

  // 对应的 tool 结果消息
  const toolMsg = roundMessages.find(m =>
    m.role === 'tool' && m.tool_call_id === tc.id
  );
  const resultStr = toolMsg
    ? (typeof toolMsg.content === 'string' ? toolMsg.content : JSON.stringify(toolMsg.content))
    : '(no return)';
  const resultSnippet = resultStr.substring(0, TOOL_RESULT_MAX_CHARS);

  return `Tool: ${name}${argsStr ? ` (${argsStr})` : ''}\nResult: ${resultSnippet}`;
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

/**
 * 构建批量压缩 transcript prompt 片段：把一组待压缩消息转为紧凑文本
 * @param {Array} messages - 待压缩的原始消息（保留顺序）
 * @param {string} priorSummary - 已有的历史摘要文本（作为上下文前缀）
 * @returns {string}
 */
function buildBatchTranscript(messages, priorSummary) {
  const parts = [];
  if (priorSummary) {
    parts.push(`[Earlier summary]\n${priorSummary}`);
  }
  let roundNum = 0;
  for (const msg of messages) {
    if (msg._isSummary) continue; // 旧摘要消息已由 priorSummary 承载
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      roundNum++;
      const lines = [`[Round ${roundNum}]`];
      if (typeof msg.content === 'string' && msg.content.trim()) {
        lines.push(`Assistant thought: ${msg.content.trim().substring(0, TOOL_RESULT_MAX_CHARS)}`);
      }
      for (const tc of msg.tool_calls) {
        lines.push(buildToolCallInfo(tc, messages));
      }
      parts.push(lines.join('\n'));
    } else if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.trim()) {
      parts.push(`[Assistant reply] ${msg.content.trim().substring(0, TOOL_RESULT_MAX_CHARS)}`);
    } else if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.trim()) {
      parts.push(`[User] ${msg.content.trim().substring(0, TOOL_RESULT_MAX_CHARS)}`);
    }
  }
  return parts.join('\n\n');
}

/**
 * 批量压缩：一次 LLM 调用将多轮旧对话压缩为结构化摘要
 * 模板：任务目标 / 已完成事项 / 关键事实 / 未决问题（业界 compaction 结构化实践）
 *
 * @param {Array} messages - 待压缩的原始消息（完整轮次，保证 assistant(tool_calls)+tool 配对）
 * @param {string} priorSummary - 之前已累积的摘要文本（合并进新摘要），可为空
 * @param {Object} config - API 配置
 * @param {string} model - 模型名称
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.timeout=30000] - 批量压缩输出更长，超时放宽到 30s
 * @param {number} [options.transcriptMaxTokens] - transcript 输入上限，默认 30000
 * @returns {Promise<string|null>} 结构化摘要文本，失败返回 null（调用方降级到权重裁剪）
 */
export async function summarizeRoundsBatch(messages, priorSummary, config, model, options = {}) {
  if (!messages || messages.length === 0) return null;

  let transcript = buildBatchTranscript(messages, priorSummary);
  if (!transcript.trim()) return null;

  // 输入封顶（#10）：超出上限时保留头部 70%（含早期摘要与任务目标）+ 尾部 30%（最近的可压轮次），
  // 只丢弃中段过老细节，避免压缩请求自身膨胀到报错
  const transcriptCap = options.transcriptMaxTokens || BATCH_TRANSCRIPT_MAX_TOKENS;
  transcript = truncateByTokens(transcript, transcriptCap);

  const summaryPrompt = `You are compressing the older part of an agent conversation into a structured summary. The recent messages will be kept verbatim; everything below must be distilled.

${transcript}

Output requirements: Reply with EXACTLY these sections (omit a section only if truly empty):
## Task goal
(the user's original request and what the agent is working toward)
## Completed
(concise bullet list of actions already done and their outcomes)
## Key facts
(important data, findings, IDs, URLs, decisions that later steps must rely on)
## Open issues
(things that failed, are unresolved, or still pending)
Total length under 500 words. Do not invent information not present above.`;

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
        max_tokens: BATCH_SUMMARY_MAX_TOKENS,
        temperature: 0.1
      }),
      signal: options.signal
    }, options.timeout || 30000, 1, 500); // 压缩只重试 1 次，快速失败降级

    if (!response.ok) {
      logger.warn(`[ContextSummarizer] batch summary API request failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const summary = (data.choices?.[0]?.message?.content || '').trim();

    if (!summary) {
      logger.warn('[ContextSummarizer] batch summary returned empty');
      return null;
    }

    logger.debug(`[ContextSummarizer] batch summary complete: ${messages.length} messages compressed, ${summary.length} chars`);
    return summary;
  } catch (error) {
    logger.warn('[ContextSummarizer] batch summary request exception:', error.message);
    return null;
  }
}
