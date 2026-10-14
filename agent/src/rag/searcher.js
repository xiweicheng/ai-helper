// agent/src/rag/searcher.js - 检索器：向量检索 + 关键词命中增强 + 结果归一化 + 阈值过滤 + 旁路探测
// 关键语义（见设计文档 5.7 / Phase 3 混合检索）：
//   - 查询侧必须走 embedQuery（自动附加 BGE 查询前缀，与导入侧同一模型）
//   - score 为原始余弦相似度（[-1,1]，不截断）+ 关键词命中加分；归一化模型下低于正阈值即无关
//   - 关键词通道（自建，未用 Vectra 内置 BM25）：小模型（bge-small-zh-v1.5）对短英文专有名词
//     （如 RocketMQ）区分度不足，实测相关 chunk 排名 20+ 而被无关 chunk 挤占 top-K；
//     Vectra 内置 BM25 分词器为英文模型（中文 token 全丢），中文场景不可用；
//     匹配策略：英文/数字按词边界（防子串误伤，如 rag 命中 storage），中文取最长命中片段（长句目标词不失配）
//   - 过滤后为空时旁路探测（放宽阈值），区分"无数据"与"被过滤"

import { DEFAULT_SEARCH_CONFIG } from './config.js';
import { RagError } from './errors.js';
import { extractQueryTerms, matchLatin, matchCjk, KEYWORD_MAX_HITS } from './keyword-match.js';

// 匹配语义（切段/词边界/最长片段）已抽到 keyword-match.js 与长期记忆共用，
// 这里只保留与 [0,1] 余弦刻度绑定的抬分参数。
const KEYWORD_BOOST_PER_HIT = 0.1;  // 每命中单元加分
const KEYWORD_MIN_SCORE = 0.5;      // 命中 chunk 的保底分（高于默认阈值 0.3，确保能召回展示）
const KEYWORD_MAX_DF_RATIO = 0.5;   // 命中超过半数 chunk 的单元视为高频不参与（如"项目"这类常见词）
const KEYWORD_SCAN_LIMIT = 20000;   // 全量扫描 chunk 数上限（超过则跳过关键 词通道，防止大库检索卡顿）
const SCORE_MAX = 0.99;             // 分数封顶

// 纯匹配函数由 keyword-match.js 提供；保留同名再导出以免破坏既有引用方
export { extractKeywords } from './keyword-match.js';
export { extractQueryTerms };

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
   * 英文/数字按词边界匹配（避免 rag 误命中 storage 这类子串误伤）；
   * 中文取「最长命中片段」并按长度加权计分单元（长句中的目标词不再因整段失配而漏召回）；
   * 命中者按 max(向量分, 保底) + 单元加分重排，命中但未进向量候选的 chunk 一并纳入；
   * 未命中者分数不变
   * @param {string} query
   * @param {Array<{id: string, content: string, metadata: object, score: number}>} candidates 向量候选
   * @returns {Promise<Array>} 合并重排后的结果
   */
  async _boostByKeywords(query, candidates) {
    const { latin, cjk } = extractQueryTerms(query);
    if (latin.length === 0 && cjk.length === 0) return candidates;

    let items;
    try {
      items = await this.store.listAllItems();
    } catch {
      return candidates; // 扫描失败不影响向量主路径
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > KEYWORD_SCAN_LIMIT) {
      return candidates;
    }

    // 单次扫描：统计每个命中单元的文档频率（df），并记录每个 chunk 的命中单元（含计分权重）
    const total = items.length;
    const df = new Map();
    const hitsById = new Map(); // id -> { entries: [{ keys, units }], metadata }
    for (const item of items) {
      const text = String(item.metadata?.text || '').toLowerCase();
      if (!text) continue;
      const entries = [];

      // 英文/数字：词边界匹配（前后须为非字母数字；CJK 相邻视为边界）
      for (const term of matchLatin(text, latin)) {
        entries.push({ keys: [term], units: 1 });
        df.set(term, (df.get(term) || 0) + 1);
      }

      // 中文：取该 chunk 内此段的最长命中片段，命中越长计分单元越多（L=2 → 1；L≥4 顶格 3）
      for (const seg of cjk) {
        const hit = matchCjk(text, seg);
        if (!hit) continue;
        for (const k of hit.keys) df.set(k, (df.get(k) || 0) + 1);
        entries.push({ keys: hit.keys, units: hit.units });
      }

      if (entries.length > 0) hitsById.set(item.id, { entries, metadata: item.metadata });
    }

    // 高频词剔除：命中过半 chunk 的单元没有区分度（如"项目""文档"）；
    // 低频豁免：df <= 2 的命中绝对稀缺，恒有效（小库中相关词比例天然偏高，避免误伤）
    const dfLimit = Math.max(2, total * KEYWORD_MAX_DF_RATIO);
    const effective = k => {
      const d = df.get(k);
      return d > 0 && d <= dfLimit;
    };

    // 合并：命中 chunk 抬分（同一段内的候选片段只计一次）
    const resultMap = new Map(candidates.map(r => [r.id, r]));
    for (const [id, { entries, metadata }] of hitsById) {
      let units = 0;
      for (const entry of entries) {
        if (entry.keys.some(effective)) units += entry.units;
      }
      if (units === 0) continue;
      const existing = resultMap.get(id);
      const base = Math.max(existing?.score ?? 0, KEYWORD_MIN_SCORE);
      const boosted = Math.min(SCORE_MAX, base + KEYWORD_BOOST_PER_HIT * Math.min(units, KEYWORD_MAX_HITS));
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
