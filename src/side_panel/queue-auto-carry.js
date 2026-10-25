// queue-auto-carry.js - 「自动顺带」的判定（纯函数，零依赖、零 DOM）
//
// 自动顺带 = 运行中的任务在自然断点（迭代边界）自动把队首一条并入本轮，
// 不必等它跑完。它是「见缝插针」的自动触发版，判定本身很容易写错，
// 所以整段抽成纯函数，靠决策表逐格锁死。
//
// 四条门槛（缺一条就会变成"把队列搬空进上下文"或"一条都不带"）：
//   1. 迭代号 >= 2：第 1 轮还在准备请求，此时塞话等于插在开场白里；
//   2. 距上次携带已过 N 轮（N 可配，默认 3）：带得太密会把队列一口气倒进上下文；
//   3. 同一个 callId 最多 3 条：长任务里次数再多也只会挤掉原任务；
//   4. 必须真的有条目可带（且不是带附件的——插话只能插文本）。
//
// 换轮清零靠两条信号：callId 变了，或迭代号倒退（新任务从 1 重新数）。

/** 最早可携带的迭代号：第 1 轮不携带 */
export const AUTO_CARRY_MIN_ITERATION = 2;
/** 同一个 callId 最多携带几条（防止长任务把队列搬空进上下文） */
export const AUTO_CARRY_MAX_PER_CALL = 3;
/** 默认间隔轮数 */
export const AUTO_CARRY_DEFAULT_EVERY_N = 3;
/** 间隔轮数的合法区间（1 = 每轮都带，20 = 极少带） */
export const AUTO_CARRY_MIN_EVERY_N = 1;
export const AUTO_CARRY_MAX_EVERY_N = 20;

/** 间隔轮数归一：非法值回落默认，越界夹取（storage 里可能是字符串） */
export function normalizeEveryN(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return AUTO_CARRY_DEFAULT_EVERY_N;
  return Math.min(AUTO_CARRY_MAX_EVERY_N, Math.max(AUTO_CARRY_MIN_EVERY_N, Math.round(n)));
}

/** 每个会话一份的携带记账 */
export function createAutoCarryTracker() {
  return { callId: null, carried: 0, lastIteration: null };
}

/**
 * 从执行日志增量里取当前迭代号。
 * 一轮里会收到多条 EXECUTION_STATUS_UPDATE（节点开始 / 成功各一次），取最大值即可。
 * @param {Array<{iteration?: number}>} executionLog
 * @returns {number} 0 表示这批条目里没有迭代信息
 */
export function peakIteration(executionLog) {
  let max = 0;
  for (const entry of executionLog || []) {
    const n = Number(entry && entry.iteration);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * 判定这一次更新要不要自动携带队首一条。
 *
 * @param {Object} input
 * @param {{callId: string|null, carried: number, lastIteration: number|null}} [input.tracker] 该会话的记账
 * @param {string|null} [input.callId] 本条消息的 callId（换轮信号）
 * @param {number} input.iteration 当前迭代号
 * @param {number} [input.everyN] 间隔轮数（chatConfig.queueAutoCarryEveryNIterations）
 * @param {boolean} [input.enabled] 总开关（chatConfig.queueAutoCarry）
 * @param {boolean} [input.hasCandidate] 队首是否真有一条可携带的条目
 * @returns {{carry: boolean, reason: string, tracker: {callId: string|null, carried: number, lastIteration: number|null}}}
 *   reason: carry / disabled / invalid_iteration / too_early / no_candidate / call_limit / interval_not_reached
 */
export function evaluateAutoCarry(input) {
  const {
    tracker,
    callId = null,
    iteration,
    everyN,
    enabled = true,
    hasCandidate = true,
  } = input || {};

  let next = tracker && typeof tracker === 'object'
    ? {
      callId: tracker.callId ?? null,
      carried: Number(tracker.carried) || 0,
      lastIteration: tracker.lastIteration ?? null,
    }
    : createAutoCarryTracker();

  const iter = Number(iteration);
  if (!Number.isFinite(iter) || iter <= 0) {
    return { carry: false, reason: 'invalid_iteration', tracker: next };
  }

  // 换轮清零：callId 变了（新的一轮任务），或迭代号倒退（同一 callId 重新开始数）
  const callChanged = !!callId && !!next.callId && callId !== next.callId;
  const iterRewound = next.lastIteration != null && iter < next.lastIteration;
  if (callChanged || iterRewound) {
    next = createAutoCarryTracker();
  }
  if (callId && !next.callId) next = { ...next, callId };

  if (!enabled) return { carry: false, reason: 'disabled', tracker: next };
  if (iter < AUTO_CARRY_MIN_ITERATION) return { carry: false, reason: 'too_early', tracker: next };
  if (!hasCandidate) return { carry: false, reason: 'no_candidate', tracker: next };
  if (next.carried >= AUTO_CARRY_MAX_PER_CALL) return { carry: false, reason: 'call_limit', tracker: next };

  const step = normalizeEveryN(everyN);
  if (next.lastIteration != null && iter - next.lastIteration < step) {
    return { carry: false, reason: 'interval_not_reached', tracker: next };
  }

  return {
    carry: true,
    reason: 'carry',
    tracker: {
      callId: next.callId || callId || null,
      carried: next.carried + 1,
      lastIteration: iter,
    },
  };
}
