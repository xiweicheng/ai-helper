// agent/src/rag/searcher.js - 检索器：向量检索 + 关键词命中增强 + 结果归一化 + 阈值过滤 + 旁路探测
// 关键语义（见设计文档 5.7 / Phase 3 混合检索）：
//   - 查询侧必须走 embedQuery（自动附加 BGE 查询前缀，与导入侧同一模型）
//   - score 为原始余弦相似度（[-1,1]，不截断）+ 关键词命中加分；归一化模型下低于正阈值即无关
//   - 关键词通道（自建，未用 Vectra 内置 BM25）：小模型（bge-small-zh-v1.5）对短英文专有名词
//     （如 RocketMQ）区分度不足，实测相关 chunk 排名 20+ 而被无关 chunk 挤占 top-K；
//     Vectra 内置 BM25 分词器为英文模型（中文 token 全丢），中文场景不可用
//   - 过滤后为空时旁路探测（放宽阈值），区分"无数据"与"被过滤"

import { DEFAULT_SEARCH_CONFIG } from './config.js';
import { RagError } from './errors.js';

// ---- 关键词通道参数 ----
const KEYWORD_MIN_LEN = 2;          // 关键词最小长度（单字符匹配噪声过大）
const KEYWORD_BOOST_PER_HIT = 0.1;  // 每命中一个关键词的加分
const KEYWORD_MAX_HITS = 3;         // 计分命中数上限（防止长查询过度加分）
const KEYWORD_MIN_SCORE = 0.5;      // 命中 chunk 的保底分（高于默认阈值 0.3，确保能召回展示）
const KEYWORD_MAX_DF_RATIO = 0.5;   // 命中超过半数 chunk 的词视为高频词不参与（如"项目"这类常见词）
const KEYWORD_SCAN_LIMIT = 20000;   // 全量扫描 chunk 数上限（超过则跳过关键词通道，防止大库检索卡顿）
const SCORE_MAX = 0.99;             // 分数封顶

/**
 * 从查询中提取关键词（英文/数字按分隔符成段；中文取连续段）
 * 说明：不引入分词依赖——"从文档里抠关键词"场景下，原始子串匹配最直接；
 * 长句中的长中文段几乎不会整段命中，天然只对真正的短关键词生效
 * @param {string} query
 * @returns {string[]} 小写去重后的关键词
 */
export function extractKeywords(query) {
  const parts = String(query || '').toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/);
  const seen = new Set();
  const keywords = [];
  for (const p of parts) {
    if (p.length >= KEYWORD_MIN_LEN && !seen.has(p)) {
      seen.add(p);
      keywords.push(p);
    }
  }
  return keywords;
}

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
    // 维度校验：实际输出与配置维度不一致（模型/配置变更未重建索引）时立即报错，
    // 避免 Vectra 对维度不匹配的向量给出无意义结果
    if (this.embedding.dimensions && Array.isArray(queryVec) && queryVec.length !== this.embedding.dimensions) {
      throw new RagError('embeddingDimensionMismatch', { expected: this.embedding.dimensions, actual: queryVec.length });
    }
    const candidates = await this.store.search(queryVec, query, { topK: topK * 2 });

    // 关键词命中增强（只抬分不压分），合并后再统一做阈值过滤
    let results = await this._boostByKeywords(query, candidates);
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

  /**
   * 关键词命中增强（混合检索的精确匹配通道）
   * 对全量 chunk 做子串命中检测：命中者按 max(向量分, 保底) + 每词加分重排；
   * 命中但未进向量候选的 chunk 一并纳入（保底 + 加分）；未命中者分数不变
   * @param {string} query
   * @param {Array<{id: string, content: string, metadata: object, score: number}>} candidates 向量候选
   * @returns {Promise<Array>} 合并重排后的结果
   */
  async _boostByKeywords(query, candidates) {
    const keywords = extractKeywords(query);
    if (keywords.length === 0) return candidates;

    let items;
    try {
      items = await this.store.listAllItems();
    } catch {
      return candidates; // 扫描失败不影响向量主路径
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > KEYWORD_SCAN_LIMIT) {
      return candidates;
    }

    // 单次扫描：统计每个词的文档频率（df）与每个 chunk 命中的词集合
    const total = items.length;
    const df = new Map(keywords.map(k => [k, 0]));
    const hitsById = new Map(); // id -> { matched: Set<string>, metadata }
    for (const item of items) {
      const text = String(item.metadata?.text || '').toLowerCase();
      if (!text) continue;
      const matched = new Set();
      for (const k of keywords) {
        if (text.includes(k)) {
          matched.add(k);
          df.set(k, df.get(k) + 1);
        }
      }
      if (matched.size > 0) hitsById.set(item.id, { matched, metadata: item.metadata });
    }

    // 高频词剔除：命中过半 chunk 的词没有区分度（如"项目""文档"）；
    // 低频豁免：df <= 2 的命中绝对稀缺，恒有效（小库中相关词比例天然偏高，避免误伤）
    const effective = new Set(
      keywords.filter(k => {
        const d = df.get(k);
        return d > 0 && d <= Math.max(2, total * KEYWORD_MAX_DF_RATIO);
      })
    );
    if (effective.size === 0) return candidates;

    // 合并：命中 chunk 抬分（同一关键词只计一次）
    const resultMap = new Map(candidates.map(r => [r.id, r]));
    for (const [id, { matched, metadata }] of hitsById) {
      let hits = 0;
      for (const k of matched) {
        if (effective.has(k)) hits++;
      }
      if (hits === 0) continue;
      const existing = resultMap.get(id);
      const base = Math.max(existing?.score ?? 0, KEYWORD_MIN_SCORE);
      const boosted = Math.min(SCORE_MAX, base + KEYWORD_BOOST_PER_HIT * Math.min(hits, KEYWORD_MAX_HITS));
      if (existing) {
        existing.score = boosted;
      } else {
        resultMap.set(id, {
          id,
          content: String(metadata?.text || ''),
          metadata: metadata || {},
          score: boosted,
        });
      }
    }
    return [...resultMap.values()].sort((a, b) => b.score - a.score);
  }
}
