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
 * 单元身份是**查询单元**（拉丁词 / 中文连续段），其单元数取它在任一字段里达到的最强值；
 * 不得按字段累加——同一个 2 字片段在正文和标签各命中一次就凑出 2，会把这个门槛旁路掉（实测缺陷）。
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

/**
 * 单字段内的逐查询单元命中明细：词边界拉丁命中 + 中文最长片段。
 * unit 是稳定的单元身份（拉丁按词、中文按连续段），前缀 l:/c: 防止两种形态互相撞车；
 * 它是**查询单元**而不是命中片段——按片段计会把「检索」「方案」两个随机 2 字块当成两个单元，
 * 正是 2026-10-13 碎块噪声要消除的东西，所以这里不能改。
 */
function fieldUnitHits(text, terms, dfFilter) {
  if (!text) return [];
  const out = [];
  for (const term of matchLatin(text, terms.latin)) {
    if (!dfFilter(term)) continue;
    // 拉丁命中本身就是整词命中（词边界已保证），不是碎块
    out.push({ unit: 'l:' + term, units: 1, full: true });
  }
  for (const seg of terms.cjk) {
    const hit = matchCjk(text, seg);
    if (!hit || !hit.keys.some(k => dfFilter(k))) continue;
    out.push({ unit: 'c:' + seg, units: hit.units, full: seg.length === hit.keys[0].length });
  }
  return out;
}

/**
 * 构建文档频率过滤器：统计每个命中单元出现在多少条候选里，过半者判为无区分度。
 * 必须在计分前对全候选扫一遍——单条记忆自身无法判断某词是否常见。
 * @param {Array} candidates 本次召回的候选记忆
 * @param {{latin: string[], cjk: string[]}} terms
 * @returns {{keep: (key: string) => boolean, hasDiscriminative: boolean}}
 *   keep 该单元是否具备区分度；hasDiscriminative 是否**至少有一个**单元具备区分度
 *   （全塌信号：整个查询的词形区分度都不成立，调用方据此决定是否忽略 df）
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
  const keep = (key) => {
    const d = df.get(key);
    return d > 0 && d <= limit;
  };
  // 全塌判定：df 表里一个幸存单元都没有。df 的键只会在被某条候选碰到时才写入，所以 d > 0 恒成立，
  // 这里等价于「有没有任何一个键没过 limit」。注意「查询词全库无人碰」也算全塌——那个词本来就不具备区分度。
  let hasDiscriminative = false;
  for (const d of df.values()) {
    if (d <= limit) { hasDiscriminative = true; break; }
  }
  return { keep, hasDiscriminative };
}

/**
 * 记忆关键词分：字段内命中单元和（封顶 KEYWORD_MAX_HITS）× 字段权重，跨字段累加；
 * 另加整句原样命中分。
 * 与旧实现的差别即本次变更的目的——碎块不再与整词等价，长命中不再被拆成多次加分。
 * full 标识「命中了某个完整单元」（整个拉丁词或整个中文连续段），供调用方区分
 * 「整词命中」与「只碰了 2 字碎块」——后者的分数必须过 KEYWORD_MIN_UNITS 门槛才能算命中。
 * @param {object} m 记忆条目
 * @param {{latin: string[], cjk: string[]}} terms extractMemoryTerms 的结果
 * @param {string} originalQuery 原始查询（小写 trim 后传入）
 * @param {(key: string) => boolean} [dfFilter] buildDocFreqFilter 的结果，默认全通过
 * @returns {{score: number, units: number, full: boolean, best: number}}
 *   units 命中强度（跨单元累加，同单元跨字段取最强），0 表示词面不沾；
 *   best 单个查询单元自己达到的最强单元数——区分「一次深命中」与「多次浅碎块」，
 *   score 只反映出现在几个字段，判名次时必须有这根深度轴。
 */
export function keywordScore(m, terms, originalQuery, dfFilter = () => true) {
  const texts = fieldTexts(m);
  const perUnit = new Map();   // 单元身份 -> 各字段里的最强单元数
  let score = 0;
  let full = false;
  for (const field of Object.keys(FIELD_WEIGHT)) {
    // 字段级封顶（与原实现一致）：同一字段内的命中单元和先封顶再乘权重——不封顶的话，
    // 长文档碰多个碎块会被按单元线性放大，正是本轮要压制的噪声形态。
    // 跨字段仍各自累加：一个词既在正文又在标签出现，本来就是更强的排序信号。
    let fieldUnits = 0;
    for (const h of fieldUnitHits(texts[field], terms, dfFilter)) {
      fieldUnits += h.units;
      const prev = perUnit.get(h.unit);
      if (prev === undefined || h.units > prev) perUnit.set(h.unit, h.units);
      if (h.full) full = true;
    }
    score += FIELD_WEIGHT[field] * Math.min(fieldUnits, KEYWORD_MAX_HITS);
  }
  let units = 0;
  let best = 0;
  for (const u of perUnit.values()) {
    units += u;
    if (u > best) best = u;
  }
  units = Math.min(units, KEYWORD_MAX_HITS);   // 门槛轴同样封顶：去重后的单元和也不得超过 KEYWORD_MAX_HITS
  const query = String(originalQuery || '');
  if (query.length >= ORIGINAL_QUERY_MIN_LENGTH) {
    if (texts.content.includes(query)) score += ORIGINAL_QUERY_CONTENT_BONUS;
    if (texts.title.includes(query)) score += ORIGINAL_QUERY_TITLE_BONUS;
  }
  return { score, units, full, best };
}
