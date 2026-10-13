// agent/src/memory/embedding-config.js - 记忆语义召回的 embedding 配置读写与脱敏
// 单一配置出口：只读写 agent config.json 的 memoryEmbedding 字段，请求体永不回显明文 key。
// 缺省 enabled=false：recall 只走关键词通道（Tier A），不新增任何默认网络调用。

import { loadConfig, updateConfigField } from '../config.js';

export const DEFAULT_MEMORY_EMBEDDING_CONFIG = {
  enabled: false,
  mode: 'openai-compat',
  baseUrl: '',
  modelName: '',
  apiKey: '',
  dimensions: 0,
  queryPrefix: ''
};

// mode 白名单：远端 OpenAI 兼容端点（零依赖）与本地 transformers 模型（需 RAG 依赖）
export const MEMORY_EMBEDDING_MODES = ['openai-compat', 'local'];

/** 原始配置（含 apiKey 明文，仅进程内使用，绝不出响应体） */
export function getMemoryEmbeddingConfig() {
  const cfg = loadConfig().memoryEmbedding || {};
  return { ...DEFAULT_MEMORY_EMBEDDING_CONFIG, ...cfg };
}

/** 对外响应形态：隐藏明文 key，附 hasApiKey 供前端「已配置」提示（沿用 rag/routes.js 约定） */
export function maskMemoryEmbeddingConfig(cfg = getMemoryEmbeddingConfig()) {
  const { apiKey, ...rest } = cfg;
  return { ...rest, apiKey: '', hasApiKey: Boolean(apiKey) };
}

/**
 * 保存配置：mode 白名单校验；空白 apiKey 表示不修改（前端表单不回填明文时不能抹掉已存 key）；
 * dimensions 规整为非负整数；enabled 只认真 true（字符串/数字一律视为关闭）。
 * @param {object} input
 * @returns {Promise<object>} 脱敏后的最新配置
 * @throws {Error} message = 'invalid_embedding_mode'
 */
export async function saveMemoryEmbeddingConfig(input = {}) {
  const current = getMemoryEmbeddingConfig();
  const next = { ...current };

  if (input.mode !== undefined) {
    if (!MEMORY_EMBEDDING_MODES.includes(input.mode)) {
      throw new Error('invalid_embedding_mode');
    }
    next.mode = input.mode;
  }
  if (input.enabled !== undefined) next.enabled = input.enabled === true;
  if (typeof input.baseUrl === 'string') next.baseUrl = input.baseUrl.trim();
  if (typeof input.modelName === 'string') next.modelName = input.modelName.trim();
  if (typeof input.queryPrefix === 'string') next.queryPrefix = input.queryPrefix;
  if (typeof input.apiKey === 'string' && input.apiKey.trim()) next.apiKey = input.apiKey.trim();
  if (input.dimensions !== undefined) {
    const n = Number(input.dimensions);
    next.dimensions = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  await updateConfigField('memoryEmbedding', next);
  return maskMemoryEmbeddingConfig(next);
}

/**
 * 探活/向量派生用的 provider 配置：请求体可覆盖尚未保存的草稿值，
 * 但明文 key 缺省时回落到已保存的 key（前端不会回传明文）。
 * @param {object} [override]
 */
export function resolveMemoryEmbeddingConfig(override = {}) {
  const saved = getMemoryEmbeddingConfig();
  const merged = { ...saved, ...(override || {}) };
  if (!merged.apiKey) merged.apiKey = saved.apiKey;
  return merged;
}

/**
 * 转成 rag/embedding provider 需要的形态：配置面统一叫 baseUrl（与扩展端表单一致），
 * 而 OpenAI 兼容后端读的是 endpoint。缺这一映射会让远端档永远 fetch('/embeddings')。
 * 单一出口：所有把记忆 embedding 配置交给 provider 的地方都必须过这里。
 * @param {object} [cfg]
 */
export function toEmbeddingProviderConfig(cfg = {}) {
  const baseUrl = cfg.baseUrl || '';
  const endpoint = cfg.endpoint || '';
  return { ...cfg, endpoint: endpoint || baseUrl, baseUrl: baseUrl || endpoint };
}
