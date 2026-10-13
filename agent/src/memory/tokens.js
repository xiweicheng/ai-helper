// agent/src/memory/tokens.js - 记忆关键词通道的分词与计分（单一来源）
//
// 2026-10-13 口径变更：从「把 query 炸成最多 30 个碎 bigram、每个命中 +3」改为
// 「最长命中片段的单元制」，并与知识库共用同一份匹配实现（rag/keyword-match.js）。
// 变更动机（实测于真实记忆库，见 2026-10-13-memory-keyword-parity.md）：
//   碎 bigram 下「写网」「个国」「我查」这类随机 2 字块几乎必然命中某些长条目，
//   于是任何 query 都能捞回一堆无关记忆；且命中 4 个随机碎块（+12）高于命中一个
//   4 字整词（+3），排序方向是反的。知识库侧 2026-09 已修掉这两点。
// 停用词表随之删除：单元数按命中长度分层后，虚词无法单独构成足够长的片段，
// 而两侧共用一份切段口径比记忆侧再叠一层词表更不容易漂移。

import { extractQueryTerms, matchLatin, matchCjk, KEYWORD_MAX_HITS } from '../rag/keyword-match.js';

/** 字段权重：正文 > 标题 = 标签（整数刻度，与向量分融合时同为「分」这一单位） */
export const FIELD_WEIGHT = { content: 3, title: 2, tags: 2 };

/** 整句原样命中的额外加分：正文 +5、标题 +3（沿用迁移前的权重） */
export const ORIGINAL_QUERY_CONTENT_BONUS = 5;
export const ORIGINAL_QUERY_TITLE_BONUS = 3;
export const ORIGINAL_QUERY_MIN_LENGTH = 2;

/** 高频单元剔除：与知识库同参数——命中过半条目的单元无区分度，df ≤ 2 恒保留 */
export const KEYWORD_MAX_DF_RATIO = 0.5;
export const KEYWORD_DF_EXEMPT = 2;

/**
 * 命中门槛：单元数 ≥ 2，或存在一个「完整单元」命中。
 * 实测于 Task 2 评测集（计划 Task 3 Step 3）：只看 score > 0 时 3 条零重叠查询仍会
 * 捣回仅命中 2 字碎块的长条目；纯要求 units ≥ 2 能抹平噪声，但会把「单个英文词」
 * 「单个 2 字中文词」这类短查询误杀。加 full 分支后两者兼得，10/10 全绿。
 */
export const KEYWORD_MIN_UNITS = 2;

/** 参与词面匹配的字段面（也是参与 embedding 的字段面，两侧口径必须一致） */
export function memorySearchText(m) {
  return [m?.content, m?.title, (m?.tags || []).join(' ')].filter(Boolean).join('\n');
}

/** 逐字段文本（小写）：字段权重按此分别计算 */
function fieldTexts(m) {
  return {
    content: String(m?.content || '').toLowerCase(),
    title: String(m?.title || '').toLowerCase(),
    tags: (m?.tags || []).join(' ').toLowerCase()
  };
}

/** 查询拆段：拉丁整词 + 中文连续段（与知识库同一实现） */
export function extractMemoryTerms(query) {
  return extractQueryTerms(query);
}

/** 单字段内的命中单元数：词边界拉丁命中 + 中文最长片段，按 KEYWORD_MAX_HITS 封顶 */
function fieldUnits(text, terms, dfFilter) {
  if (!text) return { units: 0, full: false };
  let units = 0;
  let full = false;
  for (const term of matchLatin(text, terms.latin)) {
    if (!dfFilter(term)) continue;
    units += 1;
    // 拉丁命中本身就是整词命中（词边界已保证），不是碎块
    full = true;
  }
  for (const seg of terms.cjk) {
    const hit = matchCjk(text, seg);
    if (!hit || !hit.keys.some(k => dfFilter(k))) continue;
    units += hit.units;
    if (seg.length === hit.keys[0].length) full = true;
  }
  return { units: Math.min(units, KEYWORD_MAX_HITS), full };
}

/**
 * 构建文档频率过滤器：统计每个命中单元出现在多少条候选里，过半者判为无区分度。
 * 必须在计分前对全候选扫一遍——单条记忆自身无法判断某词是否常见。
 * @param {Array} candidates 本次召回的候选记忆
 * @param {{latin: string[], cjk: string[]}} terms
 * @returns {(key: string) => boolean} 该单元是否具备区分度
 */
export function buildDocFreqFilter(candidates = [], terms = { latin: [], cjk: [] }) {
  const df = new Map();
  for (const m of candidates) {
    const hay = memorySearchText(m).toLowerCase();
    if (!hay) continue;
    for (const term of matchLatin(hay, terms.latin)) df.set(term, (df.get(term) || 0) + 1);
    for (const seg of terms.cjk) {
      const hit = matchCjk(hay, seg);
      if (hit) for (const k of hit.keys) df.set(k, (df.get(k) || 0) + 1);
    }
  }
  const limit = Math.max(KEYWORD_DF_EXEMPT, candidates.length * KEYWORD_MAX_DF_RATIO);
  // d > 0：未被任何候选碰过的单元不参与判定；d ≤ limit：过半者剔除
  return (key) => {
    const d = df.get(key);
    return d > 0 && d <= limit;
  };
}

/**
 * 记忆关键词分：单元数 × 字段权重，另加整句原样命中分。
 * 与旧实现的差别即本次变更的目的——碎块不再与整词等价，长命中不再被拆成多次加分。
 * full 标识「命中了某个完整单元」（整个拉丁词或整个中文连续段），供调用方区分
 * 「整词命中」与「只碰了 2 字碎块」——后者的分数必须过 KEYWORD_MIN_UNITS 门槛才能算命中。
 * @param {object} m 记忆条目
 * @param {{latin: string[], cjk: string[]}} terms extractMemoryTerms 的结果
 * @param {string} originalQuery 原始查询（小写 trim 后传入）
 * @param {(key: string) => boolean} [dfFilter] buildDocFreqFilter 的结果，默认全通过
 * @returns {{score: number, units: number, full: boolean}} units 为命中强度，0 表示词面不沾
 */
export function keywordScore(m, terms, originalQuery, dfFilter = () => true) {
  const texts = fieldTexts(m);
  let score = 0;
  let units = 0;
  let full = false;
  for (const field of Object.keys(FIELD_WEIGHT)) {
    const hit = fieldUnits(texts[field], terms, dfFilter);
    units += hit.units;
    full = full || hit.full;
    score += FIELD_WEIGHT[field] * hit.units;
  }
  const query = String(originalQuery || '');
  if (query.length >= ORIGINAL_QUERY_MIN_LENGTH) {
    if (texts.content.includes(query)) score += ORIGINAL_QUERY_CONTENT_BONUS;
    if (texts.title.includes(query)) score += ORIGINAL_QUERY_TITLE_BONUS;
  }
  return { score, units, full };
}
