// background/loop-budget-phase.js - 推理循环预算撞线的「软着陆」阶段决策（纯逻辑模块）
//
// 设计意图：时间上限与轮数上限的职责是**病态兜底的保险丝**，不是任务节奏的控制手段。
// 旧实现在撞线处直接 throw（loopTimeout / maxIterationsExceeded），用户体感即
// “长任务被中途杀死、成果全废”。本模块把撞线改造成三段式：
//   预警（warn）    → 提前注入强制性收尾协议，让模型主动收敛（正常任务感知不到）
//   宽限（grace）   → 禁用工具、只允许文本总结的有界尾轮（允许极小尾部超出，换成果不报废）
//   本地兜底（final）→ 宽限轮仍拿不到答案时，用执行日志本地拼「部分完成 + 缺项」报告
// 开关（reactConfig.gracefulConverge）关闭时 evaluateBudgetStep 返回 hard_stop，
// 由调用方保持原抛错语义 —— 逐字节回退，不做半套。
//
// 本模块不依赖任何浏览器 API 与 i18n（文案为模型可见的英文；用户可见文案由调用方
// 传入 labels），可在 Node 环境直接单测，与 loop-detector.js / trim-fallback.js 同约定。
// 设计文档：docs/superpowers/specs/2026-10-30-loop-budget-soft-landing-design.md

export const BUDGET_PHASE_CONFIG = {
  // 轮数维度：80% 起提醒、每 10 轮重申 —— 与旧实现 convergeAt 完全一致，撤开关时零行为差异
  warnIterationRatio: 0.8,
  warnRepeatEvery: 10,
  // 时间维度：85% 起提醒，按预算十分位推进（跨档才重申，同档内不刷屏）
  warnTimeRatio: 0.85,
  warnTimeDeciles: 10,
  // 宽限尾轮上限：1 轮收尾 + 1 轮补答（模型违规调工具时）。必须有界，
  // 否则“软着陆”会退化成“无限延长的第二个预算”，保险丝名存实亡。
  graceMaxRounds: 2,
};

/** 时长人话化（模型可见文案用，避免裸毫秒不可读） */
function humanizeMs(ms) {
  const safe = Math.max(0, Number.isFinite(ms) ? ms : 0);
  if (safe < 60000) return `${Math.round(safe / 1000)} seconds`;
  if (safe < 3600000) return `${Math.round(safe / 60000)} minutes`;
  const hours = safe / 3600000;
  return `${hours.toFixed(1).replace(/\.0$/, '')} hours`;
}

/**
 * 撞线阶段决策（纯函数）
 * @param {Object} s
 * @param {boolean} s.enabled           软着陆开关（reactConfig.gracefulConverge）
 * @param {number} s.iteration          当前轮次（已递增前的值）
 * @param {number} s.maxIterations      轮数上限
 * @param {number} s.usedMs             本循环已用时长（剔除澄清等待）
 * @param {number} s.budgetMs           总时长预算（0/NaN 视为无时间约束）
 * @param {boolean} [s.graceEntered]    是否已进入宽限期
 * @param {number} [s.graceRoundsUsed]  已消耗的宽限轮数
 * @param {('time'|'rounds'|null)} [s.exhaustedBy] 已进入宽限时的归因（透传）
 * @param {Object} [s.cfg]
 * @returns {{step: 'iterate'|'enter_grace'|'grace_iterate'|'finalize_local'|'hard_stop', exhaustedBy: ('time'|'rounds'|null)}}
 */
export function evaluateBudgetStep({
  enabled, iteration, maxIterations, usedMs, budgetMs,
  graceEntered = false, graceRoundsUsed = 0, exhaustedBy = null, cfg = BUDGET_PHASE_CONFIG,
} = {}) {
  const hasTimeBudget = Number.isFinite(budgetMs) && budgetMs > 0;
  const timeExceeded = hasTimeBudget && (Number.isFinite(usedMs) ? usedMs : 0) > budgetMs;
  const roundsExhausted = iteration >= maxIterations;

  // 宽限期内的优先级最高：先判有界，再判继续
  if (graceEntered) {
    if (graceRoundsUsed >= cfg.graceMaxRounds) return { step: 'finalize_local', exhaustedBy };
    return { step: 'grace_iterate', exhaustedBy };
  }

  // 时间优先于轮数归因：两者同时耗尽时，对用户而言“跑了多久被停”比“跑了几轮”更可解释
  const cause = timeExceeded ? 'time' : (roundsExhausted ? 'rounds' : null);
  if (!cause) return { step: 'iterate', exhaustedBy: null };
  return { step: enabled ? 'enter_grace' : 'hard_stop', exhaustedBy: cause };
}

/**
 * 构造本轮该注入的收敛预警（纯函数）
 * @param {Object} s
 * @param {number} s.iteration
 * @param {number} s.maxIterations
 * @param {number} s.usedMs
 * @param {number} s.budgetMs
 * @param {number} [s.lastTimeWarnDecile] 上次时间提醒所处的十分位（-1 = 未提醒过）
 * @param {boolean} [s.timeWarnEnabled]   时间维度提醒是否启用（关 = 旧行为只有轮数提醒）
 * @param {Object} [s.cfg]
 * @returns {{notices: string[], timeWarnDecile: number}}
 */
export function buildBudgetNotices({
  iteration, maxIterations, usedMs, budgetMs,
  lastTimeWarnDecile = -1, timeWarnEnabled = true, cfg = BUDGET_PHASE_CONFIG,
} = {}) {
  const notices = [];
  let timeWarnDecile = lastTimeWarnDecile;

  const warnAt = Math.ceil(maxIterations * cfg.warnIterationRatio);
  if (iteration >= warnAt && (iteration - warnAt) % cfg.warnRepeatEvery === 0) {
    notices.push(
      `[System Notice] Iteration budget warning: ${iteration}/${maxIterations} rounds used. Start converging now: stop exploratory tool calls and produce the best possible final answer based on the information already gathered. If the goal cannot be fully reached, summarize the completed parts and clearly state what remains.`
    );
  }

  if (timeWarnEnabled && Number.isFinite(budgetMs) && budgetMs > 0) {
    const ratio = (Number.isFinite(usedMs) ? usedMs : 0) / budgetMs;
    const decile = Math.floor(ratio * cfg.warnTimeDeciles);
    if (ratio >= cfg.warnTimeRatio && decile > lastTimeWarnDecile) {
      timeWarnDecile = decile;
      notices.push(
        `[System Notice] Time budget warning: ${humanizeMs(usedMs)} of ${humanizeMs(budgetMs)} used (${Math.round(ratio * 100)}%). The execution budget is about to be exhausted and tool calls will be blocked soon. Converge now: stop starting new work, finish the in-flight step, and prepare a final report that lists what is completed and what remains.`
      );
    }
  }

  return { notices, timeWarnDecile };
}

/**
 * 构造宽限轮的收尾指令（纯函数；模型可见英文）
 * @param {Object} s
 * @param {('time'|'rounds')} s.exhaustedBy
 * @param {number} s.iteration
 * @param {number} s.maxIterations
 * @param {number} s.usedMs
 * @param {number} s.budgetMs
 * @param {number} s.round 宽限轮序号（1 起）
 * @returns {string}
 */
export function buildGraceNotice({ exhaustedBy, iteration, maxIterations, usedMs, budgetMs, round = 1 } = {}) {
  const causeText = exhaustedBy === 'rounds'
    ? `the round limit of ${maxIterations} rounds was reached (${iteration} used)`
    : `the time budget of ${humanizeMs(budgetMs)} was used up (${humanizeMs(usedMs)} elapsed)`;

  if (round > 1) {
    return `[System Notice] Final round, no exceptions: tools are no longer available and any tool call you emit will be discarded unanswered. Answer with text only, right now, as a task report with exactly these sections: 1) Completed — concrete results/artifacts produced so far; 2) Remaining — what is still not done and why; 3) Next step — what the user should do to continue (e.g. press Continue, or narrow the goal). Do not ask questions and do not describe further plans that require tools.`;
  }

  return `[System Notice] Execution budget exhausted: ${causeText}. Tools are no longer available from this round on — do NOT call any tools; the next round will not execute them. Produce a final task report with these sections: 1) Completed — concrete results/artifacts produced so far (name files, pages, data you actually produced); 2) Remaining — what is still unfinished and the reason; 3) Next step — how the user can continue (press Continue to resume with a fresh budget, or narrow the goal). Base the report on real evidence from the steps above, not on intentions.`;
}

/**
 * 从执行日志 + 任务锚点归纳进度计数（纯函数）
 * 口径与 chat-manager 的子任务统计对齐：只有 tool_exec 算“做过的工作”，
 * api_call/reflection 是模型自述与评价，不计入，否则计数虚高。
 * @param {Array} executionLog
 * @param {Object|null} taskState plan_task 锚点（可为 null）
 * @returns {{successNodes:number, failedNodes:number, cancelledNodes:number, inflightNodes:number, plannedSubtasks:number, pendingSubtaskNames:string[], failedSubtaskNames:string[], doneSubtaskNames:string[]}}
 */
export function summarizeBudgetProgress(executionLog, taskState) {
  const log = Array.isArray(executionLog) ? executionLog : [];
  let successNodes = 0, failedNodes = 0, cancelledNodes = 0, inflightNodes = 0, plannedSubtasks = 0;
  for (const e of log) {
    if (!e) continue;
    if (e.nodeType === 'subtask_plan') {
      if (Number.isFinite(e.subtaskCount)) plannedSubtasks = Math.max(plannedSubtasks, e.subtaskCount);
      continue;
    }
    if (e.nodeType !== 'tool_exec') continue;
    if (e.status === 'success') successNodes++;
    else if (e.status === 'failed') failedNodes++;
    else if (e.status === 'cancelled') cancelledNodes++;
    else inflightNodes++; // processing / pending / rolledback：既非成功也非失败，单列避免误导
  }

  const subtasks = (taskState && Array.isArray(taskState.subtasks)) ? taskState.subtasks : [];
  const pick = (statuses) => subtasks.filter(s => s && statuses.includes(s.status)).map(s => s.name).filter(Boolean);
  return {
    successNodes, failedNodes, cancelledNodes, inflightNodes,
    plannedSubtasks: plannedSubtasks || subtasks.length,
    pendingSubtaskNames: pick(['pending', 'processing', 'rolledback']),
    failedSubtaskNames: pick(['failed']),
    doneSubtaskNames: pick(['done', 'complete']),
  };
}

/**
 * 宽限轮拿不到答案时的本地兜底报告（纯函数；labels 由调用方从 i18n 取）
 * @param {Object} s
 * @param {('time'|'rounds')} s.exhaustedBy
 * @param {ReturnType<typeof summarizeBudgetProgress>} s.progress
 * @param {{usedMs:number, budgetMs:number, iteration:number, maxIterations:number}} s.budget
 * @param {{title:string, completed:string, remaining:string, resume:string, none:string, timeCause:string, roundsCause:string}} s.labels
 * @returns {string}
 */
export function buildBudgetFallbackReport({ exhaustedBy, progress, budget, labels } = {}) {
  const p = progress || summarizeBudgetProgress([], null);
  const b = budget || {};
  const l = labels || {};
  const cause = exhaustedBy === 'rounds'
    ? (l.roundsCause || '')
    : (l.timeCause || '');

  const doneLines = [];
  if (Number.isFinite(p.successNodes) && p.successNodes > 0) {
    doneLines.push(`- ${l.stepsDone || ''}${p.successNodes}`);
  }
  if (Array.isArray(p.doneSubtaskNames) && p.doneSubtaskNames.length > 0) {
    doneLines.push(`- ${l.subtasksDone || ''}${p.doneSubtaskNames.join('、')}`);
  }
  const remainLines = [];
  if (Array.isArray(p.pendingSubtaskNames) && p.pendingSubtaskNames.length > 0) {
    remainLines.push(`- ${l.subtasksPending || ''}${p.pendingSubtaskNames.join('、')}`);
  }
  if (Array.isArray(p.failedSubtaskNames) && p.failedSubtaskNames.length > 0) {
    remainLines.push(`- ${l.subtasksFailed || ''}${p.failedSubtaskNames.join('、')}`);
  }
  if (Number.isFinite(p.failedNodes) && p.failedNodes > 0) {
    remainLines.push(`- ${l.stepsFailed || ''}${p.failedNodes}`);
  }

  const lines = [
    `## ${l.title || ''}`,
    '',
    cause,
    '',
    `### ${l.completed || ''}`,
    doneLines.length > 0 ? doneLines.join('\n') : (l.none || ''),
    '',
    `### ${l.remaining || ''}`,
    remainLines.length > 0 ? remainLines.join('\n') : (l.none || ''),
    '',
    l.resume || '',
  ];
  return lines.filter(line => line !== undefined).join('\n');
}
