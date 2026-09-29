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

// ---- 关键词通道参数 ----
const KEYWORD_MIN_LEN = 2;          // 命中单元最小长度（单字符匹配噪声过大）
const KEYWORD_MAX_FRAGMENT_LEN = 4; // 中文最长匹配窗口（≥4 字命中已顶格 3 单元，无需更长窗口）
const KEYWORD_BOOST_PER_HIT = 0.1;  // 每命中单元加分
const KEYWORD_MAX_HITS = 3;         // 计分单元总数上限（防止长查询过度加分）
const KEYWORD_MIN_SCORE = 0.5;      // 命中 chunk 的保底分（高于默认阈值 0.3，确保能召回展示）
const KEYWORD_MAX_DF_RATIO = 0.5;   // 命中超过半数 chunk 的单元视为高频不参与（如"项目"这类常见词）
const KEYWORD_SCAN_LIMIT = 20000;   // 全量扫描 chunk 数上限（超过则跳过关键词通道，防止大库检索卡顿）
const SCORE_MAX = 0.99;             // 分数封顶

/**
 * 从查询中提取关键词（英文/数字按分隔符成段；中文取连续段）
 * 说明：不引入分词依赖——中文长段由 _boostByKeywords 按最长命中片段降级匹配，
 * 本函数只负责切段与小写去重
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

/**
 * 将关键词段拆分为带类型的命中单元：英文/数字段与中文段分开处理
 * 段内非 [a-z0-9] 的字符必为汉字（切分阶段已剔除其他字符），无需引入 Unicode 转义
 * @param {string} query
 * @returns {{latin: string[], cjk: string[]}} 小写去重后的单元列表
 */
export function extractQueryTerms(query) {
  const latin = [];
  const cjk = [];
  const seenLatin = new Set();
  const seenCjk = new Set();
  for (const seg of extractKeywords(query)) {
    for (const run of seg.match(/[a-z0-9]+|[^a-z0-9]+/g) || []) {
      if (run.length < KEYWORD_MIN_LEN) continue;
      if (/^[a-z0-9]+$/.test(run)) {
        if (!seenLatin.has(run)) {
          seenLatin.add(run);
          latin.push(run);
        }
      } else if (!seenCjk.has(run)) {
        seenCjk.add(run);
        cjk.push(run);
      }
    }
  }
  return { latin, cjk };
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
      if (latin.length > 0) {
        const bounded = ' ' + text.replace(/[^a-z0-9]+/g, ' ') + ' ';
        for (const term of latin) {
          if (bounded.includes(' ' + term + ' ')) {
            entries.push({ keys: [term], units: 1 });
            df.set(term, (df.get(term) || 0) + 1);
          }
        }
      }

      // 中文：从最长窗口向下找命中片段（该 chunk 内该段的最长连续命中）
      for (const seg of cjk) {
        // 2 字片段预检：更长片段的命中必蕴含其 2 字子串命中，全未命中即可跳过该 chunk
        const keys2 = new Set();
        for (let i = 0; i + 2 <= seg.length; i++) {
          const frag = seg.slice(i, i + 2);
          if (text.includes(frag)) keys2.add(frag);
        }
        if (keys2.size === 0) continue;
        const maxLen = Math.min(seg.length, KEYWORD_MAX_FRAGMENT_LEN);
        let bestKeys = keys2;
        let bestLen = 2;
        for (let len = maxLen; len >= 3; len--) {
          const keys = new Set();
          for (let i = 0; i + len <= seg.length; i++) {
            const frag = seg.slice(i, i + len);
            if (text.includes(frag)) keys.add(frag);
          }
          if (keys.size > 0) {
            bestKeys = keys;
            bestLen = len;
            break;
          }
        }
        // 命中越长计分单元越多（L=2 → 1 单元；L≥4 顶格 3 单元）
        const keyList = [...bestKeys];
        for (const k of keyList) df.set(k, (df.get(k) || 0) + 1);
        entries.push({ keys: keyList, units: Math.min(bestLen - 1, KEYWORD_MAX_HITS) });
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
