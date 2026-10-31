// shared/goal.js - 目标模式（Goal mode）的纯内核：数据模型 + 状态机 + 提示词文本
//
// 定位：把「目标」从对话历史里剥离成一份可持久化、可校验、可单测的会话级状态。
// 参照 Claude Code /goal（每轮收尾由独立评估器判定 met / unmet / impossible）与
// Codex /goal（状态机 active/paused/achieved/unmet/budget_limited，模型只能声明完成，
// pause/resume/clear 只归用户与 runtime）的共同纪律，落到本项目的三条硬约束：
//   ① 一次 ReAct 收尾 = 一「轮」（turn），不是一次 API 往返——本项目循环在模型不再发
//      tool_calls 时才收尾，因此 turnBudget 计的是「收尾尝试」次数；
//   ② 会话内后续消息是「追加约束」，绝不替换目标（用户补充指导而非换题）；
//   ③ 状态迁移全部走本文件的纯函数，任何一处判定都要可单测、可回放。
//
// 本文件零 DOM / 零 chrome / 零网络，故可脱离扩展环境测试。
import { normalizeDoneCriteria } from './completion-verdict.js';

// 目标生命周期状态。终态：achieved / unmet / cleared；可恢复态：paused / budget_limited。
export const GOAL_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  ACHIEVED: 'achieved',
  UNMET: 'unmet',
  BUDGET_LIMITED: 'budget_limited',
  CLEARED: 'cleared',
};

// 评估器三态（与 Claude Code 的判定口径一致）。
export const GOAL_VERDICTS = {
  MET: 'met',
  UNMET: 'unmet',
  IMPOSSIBLE: 'impossible',
};

// 状态机的动作出口，供 react-loop 决定「继续 / 收尾」。
export const GOAL_ACTIONS = {
  CONTINUE: 'continue',
  STOP_ACHIEVED: 'stop_achieved',
  STOP_UNMET: 'stop_unmet',
  STOP_PAUSED: 'stop_paused',
  STOP_BUDGET: 'stop_budget',
};

/**
 * 目标「停住但保留现场」时写进 checkpoint 的 interruptedReason 前缀。
 * auto-resume 必须把它们当终态：这两个原因恰恰意味「等用户点继续」，
 * 闹钟把现场接走重跑等于替用户按了他没按的按钮（还会重烧 token）。
 * 唯一器源在这里——checkpoint 写侧（react-loop）与终态集（auto-resume）都引它。
 */
export const GOAL_HALT_CHECKPOINT_REASONS = Object.freeze([
  `goal_${GOAL_STATUS.PAUSED}`,
  `goal_${GOAL_STATUS.BUDGET_LIMITED}`,
]);

/** 目标停住时的 checkpoint 原因（与被保留的 goal 状态码同源）。 */
export function goalHaltCheckpointReason(status) {
  return `goal_${status}`;
}

// 目标描述的字符上限：与 Claude Code /goal 条件上限（4000）对齐，
// 同时防超长文本把每轮锚点注入撑爆上下文。
export const MAX_OBJECTIVE_CHARS = 4000;
// 追加约束条数上限与单条长度上限：约束每轮随锚点回注，无上限会线性吃掉预算。
export const MAX_CONSTRAINTS = 20;
export const MAX_CONSTRAINT_CHARS = 500;

// 预算与停滞默认值。设置页只开放总开关与意图识别，这些数值固定取此处；
// 这是唯一兜底来源，引擎与面板都读它。
export const DEFAULT_GOAL_LIMITS = {
  turnBudget: 20,          // 收尾尝试次数上限
  maxTurnBudget: 200,      // 「继续」可以累加的硬顶（防无限续跑）
  minTurnBudget: 5,
  timeBudgetMs: 0,         // 0 = 跟随 ReAct 循环的 loopTimeout
  stagnationLimit: 3,      // 连续无工具进展的未达成轮数 → 暂停
  evaluatorFailureLimit: 2 // 评估器连续失败次数 → 暂停（不烧轮次）
};

// 目标条剩余提示的阈值：只剩这么多次时才多说一句，平时不说。
// 目的是不让用户拿一个无法决策的小数字天天盯着看得不到信息。
export const GOAL_TURNS_LEFT_HINT = 5;

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/** 目标描述裁剪：去空白 + 截断到上限（超限不报错，静默截断并在 UI 侧提示）。 */
export function truncateObjective(text) {
  const s = typeof text === 'string' ? text.trim() : '';
  return s.length > MAX_OBJECTIVE_CHARS ? s.slice(0, MAX_OBJECTIVE_CHARS) : s;
}

/** 单条约束归一：折叠空白 + 截断。空串返回 ''（调用方丢弃）。 */
function normalizeConstraint(text) {
  if (typeof text !== 'string') return '';
  const s = text.trim().replace(/\s+/g, ' ');
  return s.length > MAX_CONSTRAINT_CHARS ? s.slice(0, MAX_CONSTRAINT_CHARS) : s;
}

/**
 * 创建一个新目标。
 * @param {object} params
 * @param {string} params.objective 目标描述（用户原话）
 * @param {string[]} [params.criteria] 人类可读验收标准
 * @param {Array} [params.doneCriteria] 可机检断言（复用 completion-verdict 白名单归一）
 * @param {string[]} [params.constraints] 追加约束（一般创建时为空）
 * @param {object} [params.limits] 覆盖 DEFAULT_GOAL_LIMITS
 * @param {string} [params.sessionId]
 * @param {'toggle'|'intent'} [params.createdBy]
 * @param {number} [params.now] 注入时钟便于单测
 * @returns {object|null} objective 为空时返回 null（调用方按「普通消息」处理）
 */
export function createGoal(params = {}) {
  const objective = truncateObjective(params.objective);
  if (!objective) return null;
  const now = Number.isFinite(params.now) ? params.now : Date.now();
  const limits = { ...DEFAULT_GOAL_LIMITS, ...(params.limits || {}) };
  const criteria = Array.isArray(params.criteria)
    ? params.criteria.map((c) => String(c).trim()).filter(Boolean).slice(0, MAX_CONSTRAINTS)
    : [];
  const constraints = [];
  for (const raw of Array.isArray(params.constraints) ? params.constraints : []) {
    const c = normalizeConstraint(raw);
    if (c) constraints.push(c);
  }
  return {
    id: `goal_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: params.sessionId || null,
    objective,
    criteria,
    doneCriteria: normalizeDoneCriteria(params.doneCriteria),
    constraints: constraints.slice(0, MAX_CONSTRAINTS),
    status: GOAL_STATUS.ACTIVE,
    turnBudget: clampInt(limits.turnBudget, limits.minTurnBudget, limits.maxTurnBudget, DEFAULT_GOAL_LIMITS.turnBudget),
    turnsUsed: 0,
    timeBudgetMs: Number.isFinite(limits.timeBudgetMs) && limits.timeBudgetMs > 0 ? limits.timeBudgetMs : 0,
    startedAt: now,
    elapsedMs: 0,
    tokensUsed: 0,
    stagnationCount: 0,
    evaluatorFailures: 0,
    lastVerdict: null,
    // 撞线归因（'turns' | 'time'）：恢复时要据此决定补哪一档预算，
    // 只补轮数会让「时间耗尽 → 继续」第一轮就再次撞线。
    budgetStopReason: null,
    createdBy: params.createdBy === 'intent' ? 'intent' : 'toggle',
    // 敏感操作自动放行授权。只认面板开关这类显式 UI 授予：
    // 意图识别（一句话「按目标模式执行」）永不能授予，否则网页里一段注入文案
    // 就能替用户静默拆掉安全闸。
    autoApprove: params.createdBy !== 'intent' && params.autoApprove === true,
    updatedAt: now,
  };
}

/**
 * 把一份可能来自 storage / checkpoint 的旧数据归一成合法 goal。
 * 结构异常一律返回 null（调用方按「无目标」处理，绝不因脏数据让循环崩）。
 * 未知状态回落 paused：宁可让用户手动点「继续」，也不自动烧 token 续跑。
 * @param {unknown} raw
 * @param {number} [now]
 * @returns {object|null}
 */
export function normalizeGoal(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const objective = truncateObjective(raw.objective);
  if (!objective) return null;
  const statuses = Object.values(GOAL_STATUS);
  const status = statuses.includes(raw.status) ? raw.status : GOAL_STATUS.PAUSED;
  const limits = DEFAULT_GOAL_LIMITS;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `goal_${now.toString(36)}`,
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : null,
    objective,
    criteria: Array.isArray(raw.criteria)
      ? raw.criteria.map((c) => String(c).trim()).filter(Boolean).slice(0, MAX_CONSTRAINTS)
      : [],
    doneCriteria: normalizeDoneCriteria(raw.doneCriteria),
    constraints: Array.isArray(raw.constraints)
      ? raw.constraints.map(normalizeConstraint).filter(Boolean).slice(0, MAX_CONSTRAINTS)
      : [],
    status,
    turnBudget: clampInt(raw.turnBudget, limits.minTurnBudget, limits.maxTurnBudget, limits.turnBudget),
    turnsUsed: clampInt(raw.turnsUsed, 0, 1e6, 0),
    timeBudgetMs: Number.isFinite(raw.timeBudgetMs) && raw.timeBudgetMs > 0 ? raw.timeBudgetMs : 0,
    startedAt: Number.isFinite(raw.startedAt) ? raw.startedAt : now,
    elapsedMs: Number.isFinite(raw.elapsedMs) && raw.elapsedMs > 0 ? raw.elapsedMs : 0,
    tokensUsed: Number.isFinite(raw.tokensUsed) && raw.tokensUsed > 0 ? raw.tokensUsed : 0,
    stagnationCount: clampInt(raw.stagnationCount, 0, 999, 0),
    evaluatorFailures: clampInt(raw.evaluatorFailures, 0, 999, 0),
    lastVerdict: raw.lastVerdict && typeof raw.lastVerdict === 'object'
      ? {
        verdict: typeof raw.lastVerdict.verdict === 'string' ? raw.lastVerdict.verdict : GOAL_VERDICTS.UNMET,
        reason: typeof raw.lastVerdict.reason === 'string' ? raw.lastVerdict.reason.slice(0, 500) : '',
        missing: Array.isArray(raw.lastVerdict.missing) ? raw.lastVerdict.missing.slice(0, MAX_CONSTRAINTS) : [],
        at: Number.isFinite(raw.lastVerdict.at) ? raw.lastVerdict.at : now,
      }
      : null,
    // 旧数据没有归因字段：回落 null，恢复时按「轮数耗尽」处理（与修复前行为一致）。
    budgetStopReason: raw.budgetStopReason === 'time' || raw.budgetStopReason === 'turns'
      ? raw.budgetStopReason
      : null,
    createdBy: raw.createdBy === 'intent' ? 'intent' : 'toggle',
    // 反序列化时同样不采信 intent 目标的放行授权（老数据 / 被篡改的 storage 亦然）
    autoApprove: raw.createdBy !== 'intent' && raw.autoApprove === true,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

/** 目标是否仍在「可以自动推进」的状态（active 之外都要用户或 runtime 干预）。 */
export function goalIsRunning(goal) {
  return !!goal && goal.status === GOAL_STATUS.ACTIVE;
}

/**
 * 追加一条约束（会话内后续消息的语义）：不替换 objective，不改状态。
 * 与上一条完全相同的约束直接忽略（连续重复指导没有信息量，还会白吃锚点 token）。
 * @param {object} goal
 * @param {string} text
 * @param {number} [now]
 * @returns {object} 新的 goal 对象（不原地改，便于 React 式比对与单测断言）
 */
export function appendGoalConstraint(goal, text, now = Date.now()) {
  if (!goal) return goal;
  const c = normalizeConstraint(text);
  if (!c) return goal;
  if (goal.constraints.length > 0 && goal.constraints[goal.constraints.length - 1] === c) return goal;
  const next = goal.constraints.concat(c);
  // 超出上限时丢最早的一条：最近的指导优先级最高
  const kept = next.length > MAX_CONSTRAINTS ? next.slice(next.length - MAX_CONSTRAINTS) : next;
  return { ...goal, constraints: kept, updatedAt: now };
}

/**
 * 预算闸门判定（时间 / 轮数）。停滞闸门由 applyGoalVerdict 判（它需要本轮工具进展信息）。
 * @param {object} goal
 * @param {{now?:number, fallbackTimeBudgetMs?:number, exhaustedBy?:string}} [opts]
 * @returns {{exhausted:boolean, reason:'turns'|'time'|null}}
 */
export function checkGoalBudget(goal, opts = {}) {
  if (!goal) return { exhausted: false, reason: null };
  if (goal.turnsUsed >= goal.turnBudget) return { exhausted: true, reason: 'turns' };
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const budget = goal.timeBudgetMs > 0 ? goal.timeBudgetMs : (opts.fallbackTimeBudgetMs || 0);
  if (budget > 0) {
    const elapsed = goal.elapsedMs + Math.max(0, now - goal.startedAt);
    if (elapsed >= budget) return { exhausted: true, reason: 'time' };
  }
  return { exhausted: false, reason: null };
}

/**
 * 目标条的副行文案（纯函数，便于单测）。把内部的「轮 / turn」翻译成用户能懂的「次尝试」：
 * - 还没评估过（turnsUsed=0）就不显示——此刻的 0/20 不携带任何信息；
 * - 接近上限（剩 ≤ GOAL_TURNS_LEFT_HINT）才补一句剩余，平时不盯数字；
 * - 补充约束条数独立于轮次，始终展示。
 * @param {object|null} goal
 * @param {(key:string, vars?:object)=>string} t 注入 i18n，保持本文件零依赖
 * @returns {string[]}
 */
export function buildGoalMetaParts(goal, t) {
  if (!goal || typeof t !== 'function') return [];
  const parts = [];
  const used = Math.max(0, Math.floor(Number(goal.turnsUsed) || 0));
  const budget = Math.max(0, Math.floor(Number(goal.turnBudget) || 0));
  if (used > 0) {
    parts.push(t('goal.turnsUsed', { turns: used }));
    const left = budget - used;
    if (left > 0 && left <= GOAL_TURNS_LEFT_HINT) parts.push(t('goal.turnsLeft', { turns: left }));
  }
  const extra = Array.isArray(goal.constraints) ? goal.constraints.length : 0;
  if (extra > 0) parts.push(t('goal.constraints', { count: extra }));
  return parts;
}

/** 记录一次轮消耗（评估器 token 单独累加，不计入 turnsUsed）。 */
export function recordGoalTurn(goal, tokensUsed = 0, now = Date.now()) {
  if (!goal) return goal;
  return {
    ...goal,
    turnsUsed: goal.turnsUsed + 1,
    tokensUsed: goal.tokensUsed + (Number.isFinite(tokensUsed) && tokensUsed > 0 ? Math.round(tokensUsed) : 0),
    updatedAt: now,
  };
}

/** 结算一段执行时长到 elapsedMs，并把 startedAt 归零为「此刻」（用于暂停/恢复）。 */
export function settleGoalElapsed(goal, now = Date.now()) {
  if (!goal) return goal;
  const delta = Math.max(0, now - goal.startedAt);
  return { ...goal, elapsedMs: goal.elapsedMs + delta, startedAt: now, updatedAt: now };
}

/**
 * 消费一次评估结论，产出新状态 + 动作。这是状态机的唯一入口。
 *
 * 判定纪律（每条都对应一个红测试）：
 * - met        → achieved，终态，不再续跑；
 * - impossible → unmet，终态，如实上报（绝不说成「完成」）；
 * - unmet      → 先结算轮次与停滞；撞预算/停滞则停，否则 continue；
 * - 评估器自身失败（error/pending）→ 不烧轮次预算，只累加 evaluatorFailures，
 *   连续超过上限即暂停——防止「评估挂了还无限续跑」。
 *
 * @param {object} goal
 * @param {object} verdict { verdict, reason, missing, evaluatorError?, tokensUsed?, toolCallsSucceeded? }
 * @param {{now?:number, fallbackTimeBudgetMs?:number, limits?:object}} [opts]
 * @returns {{goal:object, action:string, stopReason:string|null}}
 */
export function applyGoalVerdict(goal, verdict = {}, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const limits = { ...DEFAULT_GOAL_LIMITS, ...(opts.limits || {}) };
  if (!goal) return { goal, action: GOAL_ACTIONS.STOP_PAUSED, stopReason: 'not_active' };
  // 终态或非 active：忽略任何迟到的评估结论（取消/暂停后不要再改状态机）。
  // 出口必须是「停」而不是「继续」——返回 CONTINUE 等于让调用方无限续跑，
  // 而这里既不计轮次也不落终态，一旦接线漏判 status 就是无上限烧钱。
  if (goal.status !== GOAL_STATUS.ACTIVE) {
    return { goal, action: GOAL_ACTIONS.STOP_PAUSED, stopReason: 'not_active' };
  }

  const tokens = Number.isFinite(verdict.tokensUsed) ? verdict.tokensUsed : 0;
  const base = settleGoalElapsed(
    { ...goal, tokensUsed: goal.tokensUsed + Math.max(0, Math.round(tokens)) },
    now
  );

  // ① 评估器失败：不消耗轮次预算，只计失败次数
  if (verdict.evaluatorError === true || verdict.verdict == null) {
    const failures = base.evaluatorFailures + 1;
    if (failures >= Math.max(1, limits.evaluatorFailureLimit)) {
      return {
        goal: { ...base, evaluatorFailures: failures, status: GOAL_STATUS.PAUSED, updatedAt: now },
        action: GOAL_ACTIONS.STOP_PAUSED,
        stopReason: 'evaluator_unavailable',
      };
    }
    return {
      goal: { ...base, evaluatorFailures: failures, updatedAt: now },
      action: GOAL_ACTIONS.CONTINUE,
      stopReason: null,
    };
  }

  const lastVerdict = {
    verdict: verdict.verdict,
    reason: typeof verdict.reason === 'string' ? verdict.reason.slice(0, 500) : '',
    missing: Array.isArray(verdict.missing) ? verdict.missing.slice(0, MAX_CONSTRAINTS) : [],
    at: now,
  };

  // ② 达成：终态
  if (verdict.verdict === GOAL_VERDICTS.MET) {
    return {
      goal: { ...base, status: GOAL_STATUS.ACHIEVED, lastVerdict, stagnationCount: 0, evaluatorFailures: 0, updatedAt: now },
      action: GOAL_ACTIONS.STOP_ACHIEVED,
      stopReason: null,
    };
  }

  // ③ 判不可能：终态，但必须如实标记 unmet（不能冒充达成）
  if (verdict.verdict === GOAL_VERDICTS.IMPOSSIBLE) {
    return {
      goal: { ...base, status: GOAL_STATUS.UNMET, lastVerdict, updatedAt: now },
      action: GOAL_ACTIONS.STOP_UNMET,
      stopReason: 'impossible',
    };
  }

  // ④ 未达成：先结算轮次与停滞，再判是否还能继续
  const withTurn = recordGoalTurn(base, 0, now);
  const progressed = Number(verdict.toolCallsSucceeded) > 0;
  const stagnationCount = progressed ? 0 : withTurn.stagnationCount + 1;
  const staged = { ...withTurn, stagnationCount, lastVerdict, evaluatorFailures: 0 };

  const budget = checkGoalBudget(staged, { now, fallbackTimeBudgetMs: opts.fallbackTimeBudgetMs });
  if (budget.exhausted) {
    return {
      goal: {
        ...staged,
        status: GOAL_STATUS.BUDGET_LIMITED,
        budgetStopReason: budget.reason,
        updatedAt: now,
      },
      action: GOAL_ACTIONS.STOP_BUDGET,
      stopReason: budget.reason,
    };
  }
  if (stagnationCount >= Math.max(1, limits.stagnationLimit)) {
    return {
      goal: { ...staged, status: GOAL_STATUS.PAUSED, updatedAt: now },
      action: GOAL_ACTIONS.STOP_PAUSED,
      stopReason: 'stagnation',
    };
  }
  return { goal: staged, action: GOAL_ACTIONS.CONTINUE, stopReason: null };
}

/** 用户手动暂停（保留现场，可 resume）。 */
export function pauseGoal(goal, now = Date.now()) {
  if (!goal || goal.status !== GOAL_STATUS.ACTIVE) return goal;
  return { ...settleGoalElapsed(goal, now), status: GOAL_STATUS.PAUSED, updatedAt: now };
}

/**
 * 用户手动恢复：只允许从 paused / budget_limited 恢复。
 * 恢复时必须把「撞到的那一档」补齐，否则用户点「继续」后一动就再次撞线，等于没恢复：
 *   - 撞轮数 → 补一档轮预算（对齐 Qoder 的 resume 语义，+20 上限 200）；
 *   - 撞时间 → 把已结算时长归零，重新计一份（timeBudgetMs=0 跟随 loopTimeout 时也适用）；
 * 反向的松绑必须避免：撞轮数时不能顺带白送一份时间，否则时间预算形同虚设。
 * 归因缺失（旧数据）按撞轮数处理，保持修复前行为。
 */
export function resumeGoal(goal, now = Date.now()) {
  if (!goal) return goal;
  if (goal.status !== GOAL_STATUS.PAUSED && goal.status !== GOAL_STATUS.BUDGET_LIMITED) return goal;
  const wasBudgetLimited = goal.status === GOAL_STATUS.BUDGET_LIMITED;
  const timeExhausted = wasBudgetLimited && goal.budgetStopReason === 'time';
  // 两条预算同时撞死时（时间先耗尽又恰好用满轮数）两档都要补，否则恢复后依然动不了
  const turnsExhausted = wasBudgetLimited
    && (!timeExhausted || goal.turnsUsed >= goal.turnBudget);
  return {
    ...goal,
    status: GOAL_STATUS.ACTIVE,
    startedAt: now,
    elapsedMs: timeExhausted ? 0 : goal.elapsedMs,
    stagnationCount: 0,
    evaluatorFailures: 0,
    turnBudget: turnsExhausted
      ? Math.min(goal.turnBudget + DEFAULT_GOAL_LIMITS.turnBudget, DEFAULT_GOAL_LIMITS.maxTurnBudget)
      : goal.turnBudget,
    budgetStopReason: null,
    updatedAt: now,
  };
}

/** 用户清除目标（终态，不再自动续跑）。 */
export function clearGoal(goal, now = Date.now()) {
  if (!goal) return null;
  return { ...settleGoalElapsed(goal, now), status: GOAL_STATUS.CLEARED, updatedAt: now };
}

/** 目标是否走完了生命周期（含终态），面板据此决定是否还显示 goal bar。 */
export function goalIsFinished(goal) {
  if (!goal) return true;
  return [GOAL_STATUS.ACHIEVED, GOAL_STATUS.UNMET, GOAL_STATUS.CLEARED].includes(goal.status);
}

/**
 * 解析评估器返回的 JSON 结论。
 * 模型常见脏输出：```json 围栏、前后夹叙、字段别名（satisfied/met/achieved/not_met/done）。
 * 解析不出合法 verdict 一律返回 null（调用方按 evaluatorError 处理，绝不默认判达成）。
 * @param {string} text
 * @returns {{verdict:string, reason:string, missing:string[]}|null}
 */
export function parseGoalVerdictJson(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  if (!body.startsWith('{')) {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    body = body.slice(start, end + 1);
  }
  let obj;
  try {
    obj = JSON.parse(body);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const raw = String(obj.verdict || obj.status || obj.result || '').trim().toLowerCase();
  let verdict = null;
  if (['met', 'satisfied', 'achieved', 'done', 'complete', 'completed', 'pass', 'passed'].includes(raw)) verdict = GOAL_VERDICTS.MET;
  else if (['impossible', 'never', 'unachievable', 'cannot', 'blocked'].includes(raw)) verdict = GOAL_VERDICTS.IMPOSSIBLE;
  else if (['unmet', 'not_met', 'not met', 'unsatisfied', 'incomplete', 'in_progress', 'pending', 'fail', 'failed'].includes(raw)) verdict = GOAL_VERDICTS.UNMET;
  if (!verdict) return null;

  const reason = typeof obj.reason === 'string'
    ? obj.reason.slice(0, 500)
    : (typeof obj.explanation === 'string' ? obj.explanation.slice(0, 500) : '');
  const rawMissing = obj.missing || obj.gaps || obj.remaining || [];
  const missing = Array.isArray(rawMissing)
    ? rawMissing.map((m) => (typeof m === 'string' ? m.slice(0, 200) : (m && typeof m === 'object' && typeof m.text === 'string' ? m.text.slice(0, 200) : ''))).filter(Boolean).slice(0, MAX_CONSTRAINTS)
    : [];
  return { verdict, reason, missing };
}

/**
 * 目标锚点文本（每轮瞬态注入，抗上下文压缩）。
 * 与 buildPlanAnchorMessage / buildNotesAnchorMessage 同构：英文 + [System Notice] 前缀，
 * 因为锚点会与既有英文系统提示词共存，混语言反而降低模型对格式的识别率。
 * @param {object} goal
 * @param {{maxCriteria?:number, unattended?:boolean}} [opts] unattended 必须与工具表摘除的
 *   同一个判据（用户亲手授予的放行），否则会出现「提示词说无人值守、弹窗闸却没开」的自相矛盾
 * @returns {string} goal 为空或已终止时返回 ''（调用方跳过注入）
 */
export function buildGoalAnchorText(goal, opts = {}) {
  if (!goal || goal.status !== GOAL_STATUS.ACTIVE) return '';
  const maxCriteria = Number.isFinite(opts.maxCriteria) ? opts.maxCriteria : 10;
  const lines = [
    '[System Notice] Active goal (system-maintained state; if earlier context was compacted, trust this as the source of truth).',
    `Objective: ${goal.objective}`,
  ];
  if (goal.criteria.length > 0) {
    lines.push('Acceptance criteria:');
    goal.criteria.slice(0, maxCriteria).forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));
  }
  if (goal.constraints.length > 0) {
    lines.push('Additional user constraints (newer wins on conflict):');
    goal.constraints.slice(-maxCriteria).forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));
  }
  lines.push(
    `Progress: attempt ${goal.turnsUsed + 1}/${goal.turnBudget}${goal.tokensUsed > 0 ? `, ~${goal.tokensUsed} tokens spent on evaluation` : ''}.`
  );
  if (goal.lastVerdict && goal.lastVerdict.reason) {
    lines.push(`Last independent verdict: ${goal.lastVerdict.verdict} — ${goal.lastVerdict.reason}`);
  }
  lines.push(
    'Work directly toward this objective. When you believe it is met, stop calling tools and state the outcome with concrete evidence; an independent evaluator will verify it. Do not declare success without evidence.'
  );
  // 无人值守文案必须与工具闸同判据（opts.unattended = 用户亲手授予的放行）：
  // 只有真正无人值守时才能剥夺提问权。未授权的目标（意图识别）照常允许提问，
  // 否则就是「prompt 叫模型别问、工具表里却还挂着 clarify_question」。
  if (opts.unattended === true) {
    lines.push(
      'You are running unattended: do NOT ask the user questions and do NOT wait for approval. When something is ambiguous, pick the most reasonable interpretation yourself, record the decision in your working notes, and keep moving. If a safety policy blocks an action, do not look for a workaround — report the limitation honestly and pursue a different path to the objective.'
    );
  } else {
    lines.push(
      'The user is present. If a decision is genuinely ambiguous or an action needs confirmation, ask with the clarification tool rather than guessing; otherwise keep working toward the objective without asking for permission at every step.'
    );
  }
  return lines.join('\n');
}

/**
 * 未达成时回灌的续跑指令（user role，追加到 currentMessages 末尾）。
 * 必须点名缺项，并要求「不要重复已完成的步骤」——与本项目 checkpoint 续跑指令的口径一致。
 * @param {object} goal 已 recordGoalTurn 的 goal
 * @param {object} verdict 评估结论
 * @returns {string}
 */
export function buildGoalContinuationText(goal, verdict = {}) {
  const missing = Array.isArray(verdict.missing) ? verdict.missing.filter(Boolean) : [];
  const parts = [
    '[Goal Mode] The independent evaluator reviewed your last attempt and judged the goal NOT yet met.',
  ];
  if (verdict.reason) parts.push(`Evaluator reason: ${verdict.reason}`);
  if (missing.length > 0) {
    parts.push('Missing items verified as not achieved:');
    missing.slice(0, MAX_CONSTRAINTS).forEach((m) => parts.push(`- ${m}`));
  }
  parts.push(
    `Continue working on the objective. Do not repeat steps already completed. Attempt ${goal ? goal.turnsUsed + 1 : '?'}/${goal ? goal.turnBudget : '?'}. Gather real evidence for the missing items before finishing again.`
  );
  if (goal && goal.constraints.length > 0) {
    parts.push(`Remember the additional user constraints: ${goal.constraints.slice(-3).join(' | ')}`);
  }
  return parts.join('\n');
}
