// agent/src/rag/embedding/index.js - EmbeddingProvider 工厂与统一接口
// 统一接口的关键语义（非对称检索，见设计文档 5.3）：
//   embedQuery    → 查询侧：自动附加 queryPrefix（BGE 中文模型必须，漏加显著降低召回）
//   embedDocuments → 文档侧：不加前缀
// 链路一致性：导入与检索必须用同一模型；模型变更需重新索引（由 manager 校验）

import { LocalEmbedding } from './local.js';
import { OpenAICompatEmbedding } from './openai-compat.js';

export class EmbeddingProvider {
  /**
   * @param {object} config - embedding 配置（见 config.js DEFAULT_EMBEDDING_CONFIG）
   */
  constructor(config = {}) {
    const resolved = { ...config };
    // 显式判定模式，避免静默降级（设计文档：配置只从一个出口读）
    this.mode = resolved.mode || (resolved.apiKey ? 'openai-compat' : 'local');
    this.modelName = resolved.modelName || (this.mode === 'openai-compat' ? 'text-embedding-3-small' : 'Xenova/bge-small-zh-v1.5');
    // 0 表示未显式指定（远端跟随平台默认维度；检索侧维度校验随之跳过）
    this.dimensions = Number(resolved.dimensions) > 0
      ? Number(resolved.dimensions)
      : (this.mode === 'openai-compat' ? 0 : 512);
    // BGE 中文模型默认查询前缀；非 BGE 模型 / 远端端点置空
    this.queryPrefix = resolved.queryPrefix ?? (this.mode === 'local' ? '为这个句子生成表示以用于检索相关文章：' : '');

    this.backend = this.mode === 'openai-compat'
      ? new OpenAICompatEmbedding(resolved)
      : new LocalEmbedding(resolved);

    console.log(`[RAG] embedding mode: ${this.mode}, model: ${this.modelName}, queryPrefix: ${this.queryPrefix ? 'on' : 'off'}`);
  }

  /**
   * 查询侧：带前缀（非对称检索）
   * @param {string} query
   * @returns {Promise<number[]>}
   */
  async embedQuery(query) {
    const [vec] = await this.backend.embed([this.queryPrefix + query]);
    return vec;
  }

  /**
   * 文档侧：不带前缀
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async embedDocuments(texts) {
    return this.backend.embed(texts);
  }
}

/**
 * 从知识库的 embeddingConfig 创建 provider
 * @param {object} embeddingConfig
 * @returns {EmbeddingProvider}
 */
export function createEmbeddingProvider(embeddingConfig) {
  return new EmbeddingProvider(embeddingConfig || {});
}
