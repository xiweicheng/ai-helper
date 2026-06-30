// background/token-recorder.js - Token 使用统计记录模块
// 在 API 调用完成后被调用，将 token 数据持久化到 IndexedDB

import { recordTokenCall } from '../storage/token-store.js';
import { getContextWindow } from '../shared/token-counter.js';

/**
 * 记录单次 API 调用的 token 使用
 * @param {Object} params
 * @param {string} params.sessionId - 会话 ID
 * @param {string} params.model - 模型名称
 * @param {Object} params.usage - API 返回的 usage 对象 { prompt_tokens, completion_tokens, total_tokens }
 * @param {string} params.callType - 调用类型
 */
export async function recordTokenUsage({ sessionId, model, usage, callType }) {
  if (!usage || (!usage.prompt_tokens && !usage.total_tokens)) return;

  const contextWindow = getContextWindow(model);

  try {
    await recordTokenCall({
      sessionId: sessionId || 'unknown',
      model: model || 'unknown',
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      contextWindow,
      callType: callType || 'unknown'
    });
  } catch (err) {
    // 静默失败，不影响主流程
    console.warn('[TokenRecorder] 记录 token 统计失败:', err.message);
  }
}
