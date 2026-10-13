// agent/src/memory/tier.js - 记忆召回通道分级决策（纯函数，无 IO）
// none = 只走关键词通道（与下推完成后的历史行为逐字一致，默认档）；
// remote/local = 在关键词之上叠加向量通道。判定只看配置 + RAG 依赖是否就位。

import { DEFAULT_SEARCH_CONFIG } from '../rag/config.js';

// 与 RAG 默认检索阈值同口径：直接引用同一常量，不复制数值（否则两处调参会静默漂移）
export const MEMORY_VECTOR_THRESHOLD = DEFAULT_SEARCH_CONFIG.threshold;

/**
 * 决定当前配置能用到哪一档召回通道。
 * @param {object} cfg memoryEmbedding 配置（getMemoryEmbeddingConfig() 的形态）
 * @param {boolean} ragAvailable 本地模型依赖（transformers/vectra）是否已安装
 * @returns {'none'|'remote'|'local'}
 */
export function resolveMemoryTier(cfg = null, ragAvailable = false) {
  const c = cfg || {};
  // enabled 只认真 true：saveMemoryEmbeddingConfig 也按同一口径落盘
  if (c.enabled !== true) return 'none';

  if (c.mode === 'openai-compat') {
    const hasKey = String(c.apiKey || '').trim().length > 0;
    const hasModel = String(c.modelName || '').trim().length > 0;
    // 远端模式不依赖 RAG 包，只要有端点配置就能开向量通道
    return hasKey && hasModel ? 'remote' : 'none';
  }

  if (c.mode === 'local') {
    // 本地模型需要 RAG 依赖；依赖缺失时静默降级，不报错、不提示（UI 侧自行展示当前档位）
    // 取“真值”而非 === true：调用方是 isRagAvailable()（布尔），但允许包装层传回其它真值而不被误降级
    return ragAvailable ? 'local' : 'none';
  }

  return 'none';
}

/** 是否需要计算/使用向量 */
export function isVectorTier(tier) {
  return tier === 'remote' || tier === 'local';
}
