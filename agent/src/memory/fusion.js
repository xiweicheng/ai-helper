// agent/src/memory/fusion.js - 语义采信门与排名融合（纯函数，无 IO）
//
// 【2026-10-14 计划五：记忆语义档转「纯 top-K」，删掉查询级绝对地板】
// 本模块原有三道采信门，现只剩后两道（都是**相对量**，随模型自动平移，无需标定）：
//  ② 条目级相对落差：cos ≥ top1 - margin，砍高分查询的长尾。
//  ③ 条数封顶 maxTake：防止一次语义命中填满 limit。
// 第①道「查询级绝对地板」（原 SEMANTIC_QUERY_FLOOR=0.48，top1<floor 整通道否决）**已移除**。
// 移除理由：那个地板是在 BAAI/bge-m3 上标定的绝对值，不可跨模型平移；而记忆向量允许用户任选
// 远端/本地任意模型，套同一个 0.48 会在别的模型上失配（本地档实测：噪声 top1=0.5599 逃过地板
// 被误返、真相关 top1=0.4888 被地板绞杀）。绝对值判「本库有无答案」这件事绕不开按模型标定，与
// 「用户不必懂向量、开箱即用」根本冲突 —— 故放弃「无匹配空返」能力，换取任意模型开箱可用。
// 代价（已知并被接受）：与全库无关的查询也会返回至多 maxTake 条语义头部。护栏随之从「空返」
// 降级为「至多 maxTake 条、不填满 limit」，由评测集守住。
//
// 【两个仍然成立的结论，不要回退】
//  • 条目级绝对值不可用：问「这条记忆算不算命中」用绝对阈值放过的太多（≥0.45 仍放过 20/41），
//    所以条目级只看相对落差。
//  • 分离度（top1-top2）不可加回：它不可跨库规模外推（库越大无关查询 top1-top2 越可能偶然变大），
//    且真实库目标查询 Q1 的 gap 0.0214 低于无关查询的 0.0361/0.0397，在 gap 轴上分不开。
//
// SEMANTIC_QUERY_FLOOR 常量保留仅供离线标定/参考（换模型时可用 test/eval/recalibrate-semantic-floor.mjs
// 量一个地板），**但线上 selectSemanticHits 不再施加它**——本文件的采信门里没有绝对值。

export const SEMANTIC_QUERY_FLOOR = 0.48;  // 【离线参考】仅供标定脚本；线上 selectSemanticHits 不施加
export const SEMANTIC_MARGIN = 0.05;       // 条目级相对落差：只采信距 top1 不超过此值的头部
export const SEMANTIC_MAX_TAKE = 2;        // 每次查询最多采信几条语义命中
export const RRF_K = 60;                   // 排名融合的平滑常数（业界默认值，本计划不重调）

/**
 * 语义通道采信哪些条目（纯 top-K：只按相对远近取头部，不含任何随模型漂移的绝对值）。
 * 两道门：① 条目级相对落差 cos ≥ top1 - margin（砍高分查询的长尾）；② 条数封顶 maxTake。
 * 与全库无关的查询也会返回至多 maxTake 条头部 —— 这是「纯 top-K 换任意模型开箱即用」的已知代价。
 * 注意：**既不看绝对地板、也不看 top1-top2 分离度**（理由见文件头）。
 * @param {Array<[string, number]>} pairs [id, cos]，顺序任意
 * @param {{margin:number, maxTake:number}} gate
 * @returns {Array<[string, number]>} 按 cos 降序的采信结果（候选为空时返回空表）
 */
export function selectSemanticHits(pairs = [], gate = { margin: SEMANTIC_MARGIN, maxTake: SEMANTIC_MAX_TAKE }) {
  const ranked = [...pairs].filter(([, c]) => Number.isFinite(c)).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return [];
  const floor = ranked[0][1] - gate.margin;
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
