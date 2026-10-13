// side_panel/auto-compaction.js - 会话上下文半自动压缩的决策与发送前置钩子
// 决策（纯函数）与执行（复用手动压缩内核）分离：本模块不直接调 LLM，压缩由 context-indicator 的 runCompaction 执行。
// 原则：自动压缩失败/异常一律放行本次发送，绝不阻断用户；连续失败后进入退避，避免反复花费额外调用。
import logger from '../shared/logger.js';

export const DEFAULT_AUTO_COMPACTION = {
  enabled: false,        // 默认关闭：自动压缩会额外产生一次摘要调用（用户花钱行为不默认改变）
  thresholdRatio: 0.85,  // 上下文占用达到 85% 触发（与指示器同一口径 computeContextUsage().ratio）
  minPending: 4,         // 压缩点之后少于 4 条新消息不值得压缩
  maxFailures: 2,        // 连续失败上限，达到后退避不再自动尝试（手动压缩成功后重置）
};

function normalizeRatio(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : fallback;
}

function normalizeCount(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/**
 * 是否应当自动压缩（纯函数，无副作用）
 * @param {object} input
 * @param {boolean} input.enabled - 开关（chatConfig.autoCompaction）
 * @param {number} input.ratio - 当前上下文占用比
 * @param {number} [input.thresholdRatio] - 触发阈值，越界回落默认
 * @param {number} [input.pendingCount] - 压缩点之后的新消息条数
 * @param {number} [input.minPending] - 最小待压缩条数
 * @param {boolean} input.isGenerating - 是否正在生成（生成中绝不打断）
 * @param {boolean} input.isolateChat - 记忆是否开启（关闭时无历史可压缩）
 * @returns {boolean}
 */
export function shouldAutoCompact({
  enabled,
  ratio,
  thresholdRatio,
  pendingCount,
  minPending,
  isGenerating,
  isolateChat,
} = {}) {
  if (!enabled || isGenerating || !isolateChat) return false;
  const threshold = normalizeRatio(thresholdRatio, DEFAULT_AUTO_COMPACTION.thresholdRatio);
  const min = normalizeCount(minPending, DEFAULT_AUTO_COMPACTION.minPending);
  if (!Number.isFinite(ratio) || ratio < threshold) return false;
  return normalizeCount(pendingCount, 0) >= min;
}

/** 压缩点之后的新消息条数（无压缩点或锚点失效时按全部历史计） */
export function countPendingSinceCompaction(state) {
  const history = state?.messageHistory || [];
  const upTo = state?.activeCompaction?.upToMessageId;
  if (!upTo) return history.length;
  const idx = history.findIndex(m => m.messageId === upTo);
  return idx === -1 ? history.length : history.length - idx - 1;
}

// 连续失败退避计数（面板存活期内有效；成功一次即清零）
let consecutiveFailures = 0;

/** 重置退避（手动压缩成功、或测试隔离时调用） */
export function resetAutoCompactionBackoff() {
  consecutiveFailures = 0;
}

/**
 * 发送前置钩子：达到阈值则静默压缩一次。任何失败都放行，绝不抛到发送链路。
 * @param {object} deps
 * @param {object} deps.state - 侧边栏 state（读取 chatConfig / messageHistory / activeCompaction）
 * @param {() => number} deps.getRatio - 占用比取值器（调用方传 computeCurrentUsage().usage?.ratio）
 * @param {(options: {silent: boolean}) => Promise<{success: boolean, reason?: string}>} deps.compact - 压缩内核（runCompaction）
 * @returns {Promise<{attempted: boolean, success: boolean, reason?: string}>}
 */
export async function runAutoCompactionBeforeSend({ state, getRatio, compact } = {}) {
  const chatConfig = state?.chatConfig || {};
  const enabled = chatConfig.autoCompaction === true;

  if (!enabled) return { attempted: false, success: false, reason: 'disabled' };
  if (consecutiveFailures >= DEFAULT_AUTO_COMPACTION.maxFailures) {
    return { attempted: false, success: false, reason: 'backoff' };
  }

  let ratio;
  try {
    ratio = Number(getRatio ? getRatio() : NaN);
  } catch (err) {
    logger.warn('[AutoCompaction] usage compute failed, send continues:', err?.message);
    return { attempted: false, success: false, reason: 'usage_unavailable' };
  }

  const pendingCount = countPendingSinceCompaction(state);
  if (!shouldAutoCompact({
    enabled,
    ratio,
    thresholdRatio: chatConfig.autoCompactionThreshold,
    pendingCount,
    isGenerating: !!state?.isGenerating,
    isolateChat: !!state?.isolateChat,
  })) {
    return { attempted: false, success: false, reason: 'not_needed' };
  }

  logger.debug('[AutoCompaction] triggered', { ratio, pendingCount });
  let result = null;
  try {
    result = await compact({ silent: true });
  } catch (err) {
    logger.warn('[AutoCompaction] compact threw, send continues:', err?.message);
    consecutiveFailures++;
    return { attempted: true, success: false, reason: 'exception' };
  }

  if (result?.success) {
    resetAutoCompactionBackoff();
    return { attempted: true, success: true };
  }
  consecutiveFailures++;
  logger.debug('[AutoCompaction] skipped send:', result?.reason);
  return { attempted: true, success: false, reason: result?.reason || 'failed' };
}
