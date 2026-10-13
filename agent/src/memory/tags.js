// agent/src/memory/tags.js - 标签在记忆检索里的角色（单一来源）
//
// 2026-10-14 口径变更（用户定的检索取向）：tags 从「打分前的硬过滤」降为「名次加成」。
// 原缺陷：标签过滤发生在任何打分之前，于是它与「词面命中门槛」「语义地板」构成三个硬门槛的
// AND 叠加——一条内容正确、语义也正确的记忆，只因为没打上请求里的标签就被整条抹掉。
// 现在的分工：
//   1) 有 query 时标签不再剔除候选，只按重叠比例把条目往上抬有限几名（见 applyTagRankLift）；
//   2) 无 query 时标签是唯一选择器，属枚举语义，保持硬过滤（见 filterByTags 的调用方）；
//   3) 本模块不得参与词面通道的 df 统计池：df 的判据是 `d > 0 && d <= limit`，一个只出现在
//      非标签条目里的词在标签子集上 d 为 undefined 会被直接拒——那等于新方案想捞回的条目
//      只能靠与标签子集共享的词才能命中，跟硬过滤差不了多少。df 继续走全候选池（已标定口径）。

/**
 * 全量标签命中最多上抬的名次数。
 * 1 位太弱（几乎抬不动），3 位以上接近「标签命中一律排前」——那正是本次要避免的形态。
 */
export const TAG_RANK_LIFT = 2;

/** 标签大小写/空白不敏感，与迁移前的比较口径保持一致 */
function normalizeTag(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** 调用方是否提出了标签请求（非数组、空数组都视为没有） */
export function hasTagRequest(requestedTags) {
  return Array.isArray(requestedTags) && requestedTags.length > 0;
}

/**
 * 重叠比例：命中的请求标签数 / 请求标签总数，值域 [0,1]。
 * 分母取请求数而不是命中数，这样「请求三个只中一个」弱于「请求三个中三个」。
 */
export function tagOverlapRatio(memoryTags, requestedTags) {
  const requested = (Array.isArray(requestedTags) ? requestedTags : []).map(normalizeTag).filter(Boolean);
  const owned = new Set((Array.isArray(memoryTags) ? memoryTags : []).map(normalizeTag).filter(Boolean));
  if (requested.length === 0 || owned.size === 0) return 0;
  let hits = 0;
  for (const tag of requested) if (owned.has(tag)) hits += 1;
  return hits / requested.length;
}

/** 标签至少沾一个才算命中（与迁移前的 some() 语义逐字等价） */
export function filterByTags(candidates = [], requestedTags) {
  // 无标签请求时返回全量而不是空集：调用方一旦漏了前置判断，也不能把整个结果集抹掉
  if (!hasTagRequest(requestedTags)) return candidates.slice();
  return candidates.filter(m => tagOverlapRatio(m?.tags, requestedTags) > 0);
}

/**
 * 按标签重叠比例上抬名次。输入必须是已经排好名的列表（词面单通道序或 RRF 融合序）。
 * 不修改入参：调用方还要用原名次做别的判定。
 */
export function applyTagRankLift(ranked = [], requestedTags) {
  if (!hasTagRequest(requestedTags)) return ranked.slice();
  const moved = ranked.map((memory, index) => {
    const lift = Math.round(TAG_RANK_LIFT * tagOverlapRatio(memory?.tags, requestedTags));
    return { memory, index, lift, key: index - lift };
  });
  // 同 key 时优先被抬上来的那条：否则抬 1 位会与它让开的那条并列，按稳定序纹丝不动，加成等于没生效
  moved.sort((a, b) => (a.key - b.key) || (b.lift - a.lift) || (a.index - b.index));
  return moved.map(m => m.memory);
}
