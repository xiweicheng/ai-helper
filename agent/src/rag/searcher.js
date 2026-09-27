// agent/src/rag/searcher.js - 检索器：向量检索 + 结果归一化 + 阈值过滤 + 旁路探测
// 关键语义（见设计文档 5.7）：
//   - 查询侧必须走 embedQuery（自动附加 BGE 查询前缀，与导入侧同一模型）
//   - score 为原始余弦相似度（[-1,1]，不截断）；归一化模型下低于正阈值即无关
//   - 过滤后为空时旁路探测（放宽阈值），区分"无数据"与"被过滤"

import { DEFAULT_SEARCH_CONFIG } from './config.js';

export class Searcher {
  /**
   * @param {import('./store/vectra.js').VectraStore} store
   * @param {import('./embedding/index.js').EmbeddingProvider} embeddingProvider
   * @param {{threshold?: number, topK?: number}} [config]
   */
  constructor(store, embeddingProvider, config = {}) {
    this.store = store;
    this.embedding = embeddingProvider;
    this.threshold = config.threshold ?? DEFAULT_SEARCH_CONFIG.threshold;
    this.topK = config.topK ?? DEFAULT_SEARCH_CONFIG.topK;
  }

  /**
   * 执行检索
   * @param {string} query
   * @param {{topK?: number, threshold?: number}} [options]
   * @returns {Promise<{query: string, total: number, hasContext: boolean, fallback: boolean, results: Array<{id: string, content: string, metadata: object, score: number}>}>}
   */
  async search(query, options = {}) {
    const topK = options.topK || this.topK;
    const threshold = options.threshold ?? this.threshold;

    const queryVec = await this.embedding.embedQuery(query);
    let results = await this.store.search(queryVec, query, { topK: topK * 2 });
    results = results.filter(r => r.score >= threshold);

    // 旁路探测：过滤后为空时放宽阈值，区分"无数据"与"被过滤"（阈值-0.2，最多 3 条）
    let fallback = false;
    if (results.length === 0) {
      const relaxed = await this.store.search(queryVec, query, { topK: 3 });
      results = relaxed.filter(r => r.score >= threshold - 0.2);
      fallback = results.length > 0;
    }

    return {
      query,
      total: results.length,
      hasContext: results.length > 0,
      fallback,
      results: results.slice(0, topK),
    };
  }
}
