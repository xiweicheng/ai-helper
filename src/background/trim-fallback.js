// background/trim-fallback.js - ReAct 兜底权重裁剪（react-loop.js trimMessages 阶段二的纯逻辑）
// 从闭包中抽出以便单元测试；行为与旧内联算法逐项一致（docs/AUDIT_STATUS.md NEW-08）。
//
// 旧实现的性能缺陷：while 内每丢一条即对全量消息 est()——map + stripImages 重建
// 所有消息对象再估算，丢 N 条 = N 次整数组重建，O(n²) 且常数大（内容多为大工具输出）。
// 新实现：逐条贡献（剥离图片后的单条估算 + MESSAGE_OVERHEAD）只预估算一次，
// 维护 raw 累计值增量扣减；每个决策点对 raw 累计值应用校准。
// 等价前提（已核实）：
//   - estimateMessagesTokens 纯按消息可加，无跨消息耦合项；
//   - getCalibratedTokens = ceil(raw × factor)，对 raw 严格单调，且 factor 只在
//     API 完成后更新（本同步循环内恒定），逐点校准与全量校准判定一致。
// 特殊语义（必须保持，勿"顺手修复"）：
//   1. assistant(tool_calls) 被删后，其**紧邻**的连续 tool 消息无条件连坐删除；
//   2. tool 被删后向前做孤立 assistant 检查，命中即原地 delete tool_calls——
//      该突变会改变那条消息的贡献，必须就地重算那一条并修正累计值（O(单条)）；
//   3. 权重扫描、起始索引、连坐检查均基于删除后的 rest 实时状态，与旧版一致。
// 注意：与旧版相同，本函数**原地变更** rest 与共享消息对象（delete tool_calls），
// 调用方须继续持有同一数组引用（react-loop 以 currentMessages.splice 原地回写，勿改绑定）。

import { estimateMessagesTokens, stripImagesFromContent, getCalibratedTokens } from '../shared/token-counter.js';

// 单条消息的 token 贡献：先剥离图片再估算（与原 est 的 stripped 全量估算逐项对应，
// 避免图片 Base64 高估导致过度裁剪）
export function strippedContribution(m) {
  return estimateMessagesTokens([{ ...m, content: stripImagesFromContent(m.content) }]);
}

// 消息权重：反思消息 > 工具结果 > 普通消息（权重越高，越优先被裁剪）
function getWeight(msg) {
  if (msg._reflection) return 3;
  if (msg.role === 'tool') return 2;
  return 1;
}

/**
 * 兜底权重裁剪：反复删除高权重消息直到校准后总量 ≤ budget（原地变更 rest）
 * @param {{ systemMsg: Array, rest: Array, budget: number }} params
 *   systemMsg 永不参与删除；rest 为目标数组；budget 为硬预算（校准后口径）
 */
export function weightTrimFallback({ systemMsg, rest, budget }) {
  // contributions 与 [...systemMsg, ...rest] 逐项平行；rest[k] ↔ contributions[offset+k]
  const offset = systemMsg.length;
  const contributions = [...systemMsg, ...rest].map(strippedContribution);
  let rawTotal = 0;
  for (const c of contributions) rawTotal += c;

  while (rest.length > 0) {
    if (getCalibratedTokens(rawTotal) <= budget) break;

    // 从开头找到第一条可裁剪的消息（优先高权重）
    let removeIdx = -1;
    let bestWeight = 0;
    for (let i = 0; i < rest.length; i++) {
      const w = getWeight(rest[i]);
      if (w > bestWeight) {
        bestWeight = w;
        removeIdx = i;
      }
      if (bestWeight >= 3) break;
    }
    if (removeIdx < 0 || bestWeight === 0) removeIdx = 0;

    const removed = rest.splice(removeIdx, 1)[0];
    rawTotal -= contributions.splice(offset + removeIdx, 1)[0];

    // 如果移除的是 assistant(tool_calls)，则后续的 tool 消息也要一并移除（无条件连丢）
    if (removed?.role === 'assistant' && removed.tool_calls) {
      while (rest.length > 0 && rest[removeIdx]?.role === 'tool') {
        rest.splice(removeIdx, 1);
        rawTotal -= contributions.splice(offset + removeIdx, 1)[0];
      }
    } else if (removed?.role === 'tool') {
      // 如果移除了 tool 消息，检查前面的 assistant 是否因此孤立
      for (let j = removeIdx - 1; j >= 0; j--) {
        if (rest[j]?.role === 'assistant' && rest[j]?.tool_calls) {
          const nextMsg = rest[j + 1];
          if (!nextMsg || nextMsg.role !== 'tool') {
            delete rest[j].tool_calls;
            // 突变后该条贡献变小：只重算这一条并修正累计值（保持整体 O(n)）
            const next = strippedContribution(rest[j]);
            rawTotal += next - contributions[offset + j];
            contributions[offset + j] = next;
          }
        } else {
          break;
        }
      }
    }
  }
}
