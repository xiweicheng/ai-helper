// shared/completion-verdict.js - 完成度校验器的纯判定内核（Phase 1，零 DOM / 零工具调用）
//
// 定位（docs/AUDIT_STATUS.md 第四节 line 85 长线项）：现在"任务算不算完成"只靠模型
// 不再发 tool_calls 自我宣告（react-loop.js:1660 → :2322），子任务 done 只等于"跑完
// 没报错"，均无独立达成校验。本模块把业界共识的判定纪律固化为可测的纯函数：
//   ① 能取证就用确定性客观断言（objective checks），不认识的断言类型一律 fail-closed 丢弃；
//   ② 取不到证（开放任务）才退回独立 critic（judge）评分，且低置信一律不轻信；
//   ③ 任何"未达标可重跑"必须同时过四道闸门（可重试 ∧ 有进展 ∧ 有预算 ∧ 未超次），
//      缺一即判永久未达标——这是防无限回炉的核心护栏。
// 本文件只做纯归约，取证器(evaluate)与 critic(judge) 由调用方（Phase 2）注入，故可单测。

// 支持的客观断言类型白名单。归一时只认这些，未知类型 fail-closed（绝不放行陌生断言）。
// 前 5 项为浏览器 DOM 取证（发往内容脚本）；后 5 项为非 DOM 取证（命令/文件，走本地 Agent）。
export const OBJECTIVE_CHECK_TYPES = [
  // —— 浏览器 DOM 类 ——
  'element_exists',   // 目标选择器在页面存在
  'element_absent',   // 目标选择器已消失
  'text_contains',    // 页面正文包含期望文本
  'url_matches',      // 当前 URL 命中期望模式
  'attribute_equals', // 元素属性等于期望值
  // —— 非 DOM：命令 / 文件类（Phase A，仅只读命令可自动取证）——
  'command_exit_zero',     // target 为 shell 命令，退出码 0 即达成
  'command_output_matches',// target 命令的 stdout+stderr 含 expected 即达成
  'file_exists',           // target 路径存在
  'file_absent',           // target 路径不存在
  'file_contains',         // target 文件内容含 expected 子串
];

// 判定三态 + 无法判定（开放任务 critic 拿不准时回落，交上层转 HITL）。
export const VERDICTS = {
  SATISFIED: 'satisfied',               // 目标达成
  UNMET_RETRYABLE: 'unmet_retryable',   // 未达标但四闸门全过 → 允许回炉
  UNMET_PERMANENT: 'unmet_permanent',   // 未达标且闸门不全 → 不再重跑
  INDETERMINATE: 'indeterminate',       // 无客观断言且 critic 不足信 → 无法判定
};

// critic 置信低于此阈值即视为"拿不准"，回落 indeterminate 并标记转用户（除非调用方覆盖）。
const DEFAULT_LOW_CONFIDENCE = 0.6;

// 单条断言字段的长度上限：doneCriteria 来自模型（或被诱导的模型），
// 不限长会让恶意/异常超长 id|target|expected 注入汇总消息撑爆上下文。
const MAX_CRITERION_FIELD_LEN = 200;
function capField(v) {
  return typeof v === 'string' && v.length > MAX_CRITERION_FIELD_LEN ? v.slice(0, MAX_CRITERION_FIELD_LEN) : v;
}

/**
 * 归一 plan_task 子任务带来的 doneCriteria：
 * 只保留 check 类型在白名单内、且为非空字符串的合法断言，补默认 id，
 * 其余（非数组 / null / 非对象 / 空 check / 未知类型）一律安全丢弃（fail-closed）。
 * @param {unknown} raw 原始断言数组（可能来自模型，不可信）
 * @returns {Array<{id:string, check:string, target:*, expected:*}>}
 */
export function normalizeDoneCriteria(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const check = item.check;
    if (typeof check !== 'string' || !check) continue;
    // 未知断言类型直接丢弃：不认识的判据绝不参与"完成"结论
    if (!OBJECTIVE_CHECK_TYPES.includes(check)) continue;
    out.push({
      id: typeof item.id === 'string' && item.id ? item.id.slice(0, MAX_CRITERION_FIELD_LEN) : `${check}-${out.length}`,
      check,
      target: capField(item.target),
      expected: capField(item.expected),
    });
  }
  return out;
}

/**
 * 对已归一的断言逐条取证，纯归约：取证器 evaluate 由调用方注入（Phase 2 用真实工具查证据）。
 * evaluate 抛错视为该条未通过（fail-safe，不因取证异常误判完成）。
 * 注（#12）：当前生产取证走 completion-verifier.js 的异步 gatherEvidence，本同步版暂无生产消费点，
 * 仅作为纯内核 API 与单测/后续复用保留，勿误读为已生效路径。
 * @param {Array} criteria normalizeDoneCriteria 的输出
 * @param {(c: object) => boolean} evaluate 单条断言取证器
 * @returns {Array<{id:string, check:string, pass:boolean}>}
 */
export function evalObjectiveChecks(criteria, evaluate) {
  if (!Array.isArray(criteria)) return [];
  return criteria.map((c) => {
    let pass = false;
    try {
      pass = !!evaluate(c);
    } catch {
      pass = false;
    }
    return { id: c.id, check: c.check, pass };
  });
}

/**
 * 核心判定：优先用客观断言；无断言时退回 critic。
 * @param {object} opts
 * @param {Array<{id:string, pass:boolean}>} [opts.checkResults] 客观断言取证结果（非空即优先）
 * @param {boolean} [opts.failureRetryable] 本次失败是否可重试（闸门 1）
 * @param {boolean} [opts.progressMade] 相比上次是否有进展（闸门 2）
 * @param {boolean} [opts.budgetLeft] 是否还有 token 预算（闸门 3）
 * @param {boolean} [opts.attemptsUnderLimit] 回炉次数是否未超限（闸门 4）
 * @param {{goalMet?:boolean, confidence?:number}} [opts.judge] 开放任务的 critic 评分
 * @param {number} [opts.lowConfidence] critic 置信下限，低于则不轻信
 * @returns {{verdict:string, missing:string[], reason:string}}
 */
export function classifyVerdict(opts = {}) {
  const {
    checkResults = [],
    failureRetryable = false,
    progressMade = false,
    budgetLeft = false,
    attemptsUnderLimit = false,
    judge = null,
    lowConfidence = DEFAULT_LOW_CONFIDENCE,
  } = opts;

  // ① 有客观断言：以取证为准。available===false 表示"取不到证"（通道不可用），
  //    既不计入达标也不计入缺项——绝不把"取不到证"谎报成"未达标"，也不据此盖 satisfied。
  if (checkResults.length > 0) {
    const available = checkResults.filter((r) => r.available !== false);
    if (available.length === 0) {
      // 全部取不到证 → 无法判定（保守：不谎报未达标、不误判完成）
      return { verdict: VERDICTS.INDETERMINATE, missing: [], reason: 'evidence_unavailable' };
    }
    const missing = available.filter((r) => !r.pass).map((r) => r.id);
    if (missing.length === 0) {
      // 可用项全过，但仍有取不到证的项 → 不能盖章全部达标（对"完成"结论 fail-closed）
      if (available.length < checkResults.length) {
        return { verdict: VERDICTS.INDETERMINATE, missing: [], reason: 'evidence_partial' };
      }
      return { verdict: VERDICTS.SATISFIED, missing: [], reason: 'objective_all_pass' };
    }
    // 回炉四闸门：缺一即永久未达标（防无限回炉）
    const allGatesPass = failureRetryable && progressMade && budgetLeft && attemptsUnderLimit;
    return {
      verdict: allGatesPass ? VERDICTS.UNMET_RETRYABLE : VERDICTS.UNMET_PERMANENT,
      missing,
      reason: allGatesPass ? 'objective_retryable' : 'objective_gates_blocked',
    };
  }

  // ② 无客观断言（开放任务）：退回 critic，但低置信不轻信
  if (!judge || typeof judge.confidence !== 'number') {
    return { verdict: VERDICTS.INDETERMINATE, missing: [], reason: 'no_evidence' };
  }
  if (judge.confidence < lowConfidence) {
    return { verdict: VERDICTS.INDETERMINATE, missing: [], reason: 'judge_low_conf' };
  }
  // m-new-1：goalMet 非布尔（典型于 critic JSON 解析不全的残块）属"没给出可用判定"，
  // 绝不能顺着 if(judge.goalMet) 为假直落未达标分支把"没评"说成"确证未达"——归无法判定。
  if (typeof judge.goalMet !== 'boolean') {
    return { verdict: VERDICTS.INDETERMINATE, missing: [], reason: 'judge_no_signal' };
  }
  if (judge.goalMet) {
    return { verdict: VERDICTS.SATISFIED, missing: [], reason: 'judge_met' };
  }
  // 高置信 critic 明确判未达标：这是确证的失败，应走未达标判定（四闸门决定是否可重跑），
  // 而非降级为"无法判定"——否则会把确知的失败说成不确定，违背"如实上报"。
  const judgeAllGatesPass = failureRetryable && progressMade && budgetLeft && attemptsUnderLimit;
  return {
    verdict: judgeAllGatesPass ? VERDICTS.UNMET_RETRYABLE : VERDICTS.UNMET_PERMANENT,
    missing: [],
    reason: 'judge_unmet',
  };
}
