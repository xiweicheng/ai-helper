// agent/src/memory/fusion.js - 语义采信门与排名融合（纯函数，无 IO）
//
// 【为什么绝对 cos 阈值在这里又出现了，而计划开头说它不可用】
// 关键在于**两个层级不能混用**（真实记忆库 41 条实测，证据见
// docs/superpowers/plans/2026-10-13-memory-rank-fusion.md 前置实测 §2 与 Task 2 执行结果）：
//  • 条目级（问「这条记忆算不算命中」）：绝对值**不可用**。≥ 0.3 放过 40/41 条，≥ 0.45 仍放过 20/41。
//  • 查询级（问「本库对该查询有无落点」）：绝对值**可用且必要**。无关查询 top1 区间
//    0.3340~0.4506，相关查询 top1 区间 0.5467~0.6353，间隙 0.096。旧公式把尺子用在了条目级，
//    这是噪声泛滥的根；纯相对门槛则表达不了「本库无答案」。
// 分离度（top1-top2）曾是本模块的原设计主门，已被实测否定：它不可跨库规模外推（库越大，
// 无关查询的 top1-top2 越可能偶然变大），且真实库目标查询 Q1 的 gap 0.0214 低于两条无关查询的
// 0.0361/0.0397——在 gap 轴上两者分不开。**不要把它加回来。**
//
// SEMANTIC_QUERY_FLOOR 的实测可用窗口是 (0.4506, 0.5163]，取中点 0.48（上下余量各约 0.03）。
// 它**不可跨模型平移**：在 BAAI/bge-m3 上标定；换 embedding 模型或改变记忆文本拼接方式后，
// 必须重跑计划 Task 2 的网格重新标定，不能直接沿用。

export const SEMANTIC_QUERY_FLOOR = 0.48;  // 查询级落点地板：top1 低于此值则整通道不采信
export const SEMANTIC_MARGIN = 0.05;       // 条目级相对落差：只采信距 top1 不超过此值的头部
export const SEMANTIC_MAX_TAKE = 2;        // 每次查询最多采信几条语义命中
export const RRF_K = 60;                   // 排名融合的平滑常数（业界默认值，本计划不重调）

/**
 * 语义通道采信哪些条目。三道门依次为：
 * ① 查询级地板：top1 < floor → 本库对该查询没有落点，整通道否决（宁可不给）。
 *    记忆召回结果直接注入提示词，「全都勉强相关」等于「没有相关」。
 * ② 条目级相对落差：只采信 cos ≥ top1 - margin 的头部，砍掉高分查询的长尾。
 * ③ 条数封顶 maxTake：防止一次语义命中填满 limit。
 * 注意：**不看 top1-top2 分离度**（理由见文件头）。
 * @param {Array<[string, number]>} pairs [id, cos]，顺序任意
 * @param {{floor:number, margin:number, maxTake:number}} gate
 * @returns {Array<[string, number]>} 按 cos 降序的采信结果（可为空）
 */
export function selectSemanticHits(pairs = [], gate = { floor: SEMANTIC_QUERY_FLOOR, margin: SEMANTIC_MARGIN, maxTake: SEMANTIC_MAX_TAKE }) {
  const ranked = [...pairs].filter(([, c]) => Number.isFinite(c)).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return [];
  const top = ranked[0][1];
  if (top < gate.floor) return [];
  const floor = top - gate.margin;
  return ranked.filter(([, c]) => c >= floor).slice(0, gate.maxTake);
}

/**
 * Reciprocal Rank Fusion：只消费名次，不消费分数，因此两路刻度不可比也不再是问题。
 * @param {Array<Array<[string, number]>>} lists 每路的 [id, rank]（rank 从 1 起）
 * @param {number} k
 * @returns {Array<[string, number]>} [id, 融合分] 降序
 */
export function rrfFuse(lists = [], k = RRF_K) {
  const acc = new Map();
  for (const list of lists) {
    for (const [id, rank] of list || []) {
      if (!id || !(rank >= 1)) continue;
      acc.set(id, (acc.get(id) || 0) + 1 / (k + rank));
    }
  }
  return [...acc.entries()].sort((a, b) => b[1] - a[1]);
}
