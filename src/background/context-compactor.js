// background/context-compactor.js - 会话上下文压缩摘要生成
// 用户手动触发"压缩上下文"时，将由侧边栏清洗后的对话素材交给当前模型生成结构化摘要；
// 失败不静默降级（用户显式操作，需明确反馈）。
import { fetchWithRetry } from './tool-executor.js';
import { getStoredConfig } from './config.js';
import { recordTokenUsage } from './token-recorder.js';
import { buildCompactionPrompt } from '../shared/compaction-prompt.js';
import logger from '../shared/logger.js';

// 摘要生成的最大输出 token 数（结构化摘要通常数百字）
const COMPACT_MAX_TOKENS = 2048;
// 超时（用户手动触发，允许比 ReAct 摘要更长）
const COMPACT_TIMEOUT_MS = 60000;

/**
 * 生成压缩摘要
 * @param {Object} params
 * @param {Array<{role: string, content: string}>} params.material - 已清洗素材
 * @param {string} [params.model] - 模型名（默认取配置）
 * @param {string} [params.sessionId] - 会话 ID（token 统计用）
 * @returns {Promise<{ success: boolean, summary?: string, error?: string }>}
 */
export async function generateCompactionSummary({ material, model, sessionId } = {}) {
  if (!Array.isArray(material) || material.length === 0) {
    return { success: false, error: 'material_empty' };
  }
  const config = await getStoredConfig();
  if (!config?.apiBase || !config?.apiKey) {
    return { success: false, error: 'config_missing' };
  }

  const prompt = buildCompactionPrompt(material);
  const apiUrl = `${config.apiBase}/chat/completions`;
  const useModel = model || config.modelName;

  try {
    const response = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: useModel,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        max_tokens: COMPACT_MAX_TOKENS,
        temperature: 0.2
      })
    }, COMPACT_TIMEOUT_MS, 1, 1000); // 用户手动触发，快速失败并明确报错

    if (!response.ok) {
      logger.warn(`[ContextCompactor] request failed: ${response.status}`);
      return { success: false, error: `http_${response.status}` };
    }
    const data = await response.json();
    const summary = (data.choices?.[0]?.message?.content || '').trim();
    if (!summary) {
      return { success: false, error: 'empty_summary' };
    }

    // token 统计（内部静默失败）
    recordTokenUsage({ sessionId, model: useModel, usage: data.usage, callType: 'context_compaction' }).catch(() => {});

    logger.debug(`[ContextCompactor] summary done, ${summary.length} chars`);
    return { success: true, summary };
  } catch (error) {
    logger.warn('[ContextCompactor] exception:', error.message);
    return { success: false, error: error.message || 'request_failed' };
  }
}
