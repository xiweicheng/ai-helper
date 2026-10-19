// background/completion-verifier.js - 完成度校验编排层（Phase 2，纯编排、不碰 react-loop）
//
// 定位（AUDIT_STATUS 第四节 line 85 长线项）：把纯判定内核 completion-verdict.js 与
// "异步取证 / critic 评审 / 缺项纠正指令"串起来，产出一个 react-loop 可直接消费的决策对象
// { verdict, missing, rerun, directive, reason }。取证器 gatherEvidence 与评审器 judge
// 均由调用方注入（react-loop 用真实内容脚本查询与模型调用），故本层可脱离主循环单测。
//
// 重要：本层不含总开关判断——开关(completionVerification.enabled)默认关，关闭时调用方
// 根本不会进入这里，现有循环行为逐字节不变。四道回炉闸门(可重试∧有进展∧有预算∧未超次)
// 由调用方算好布尔传入，本层只做门控后的判定与指令构造。
import {
  normalizeDoneCriteria,
  classifyVerdict,
  VERDICTS,
} from '../shared/completion-verdict.js';
import { t, registerTranslations } from '../shared/i18n.js';
import logger from '../shared/logger.js';

// #9：上报文案进命名空间（而非硬编码中文），与 react-loop 英文模板保持语言一致。
registerTranslations('zh', {
  completionVerifier: {
    satisfied: '✅ [完成度校验] 全部达标条件已独立取证确认达成。',
    unmet: '⚠️ [完成度校验] 以下达标条件经独立取证确认未达成: {missing}。请勿视为已完成，评估是否需要继续处理。',
    judgeUnmet: '⚠️ [完成度校验] 独立评审判定该子任务未达标（{reason}）。请勿视为已完成。',
    noCriteria: 'ℹ️ [完成度校验] 无可机检的达标断言（未提供，或 check 类型不受支持/写法非法者已被忽略）（{reason}），未做完成度判定。',
    evidenceUnavailable: 'ℹ️ [完成度校验] 所有达标判据均未能求值（{detail}），非判定未达标，未做完成度判定。',
    evidencePartial: 'ℹ️ [完成度校验] 部分判据已确证达成，但另有判据未能求值（{detail}），故不盖章“全部达成”。',
    detailCriteria: '多因判据写法不合法，需修正',
    detailChannel: '目标页不可达或取证通道异常',
    detailMixed: '部分判据写法需修正、部分目标页不可达',
    detailUnknown: '未能取得有效取证',
  },
});
registerTranslations('en', {
  completionVerifier: {
    satisfied: '✅ [Completion check] All done-criteria were independently verified as achieved.',
    unmet: '⚠️ [Completion check] These done-criteria were independently verified as NOT achieved: {missing}. Do not treat as complete; consider whether further work is needed.',
    judgeUnmet: '⚠️ [Completion check] Independent review judged this subtask NOT achieved ({reason}). Do not treat as complete.',
    noCriteria: 'ℹ️ [Completion check] No machine-checkable criteria (none provided, or unsupported/invalid check types were ignored) ({reason}); no completion verdict made.',
    evidenceUnavailable: 'ℹ️ [Completion check] None of the done-criteria could be evaluated ({detail}) - this is NOT a judgment of failure; no completion verdict made.',
    evidencePartial: 'ℹ️ [Completion check] Some criteria were confirmed met, but others could not be evaluated ({detail}), so full completion is not stamped.',
    detailCriteria: 'usually malformed criteria that need fixing',
    detailChannel: 'the target page was unreachable or the evidence channel errored',
    detailMixed: 'some criteria malformed, some target page unreachable',
    detailUnknown: 'no valid evidence could be gathered',
  },
});

/**
 * 构造"还缺什么"的纠正指令（user-role，回灌主循环驱动再来一轮）。
 * 只点名取证未通过的缺项，已通过项不出现，避免模型重复已完成动作。
 * @param {Array} criteria normalizeDoneCriteria 的输出
 * @param {Array<{id:string, pass:boolean}>} checkResults 取证结果
 * @returns {string}
 */
export function buildMissingCriteriaDirective(criteria, checkResults) {
  const failedIds = new Set(checkResults.filter((r) => !r.pass).map((r) => r.id));
  const lines = criteria
    .filter((c) => failedIds.has(c.id))
    .map((c) => `- ${describeCriterion(c)}`);
  return [
    'The following done-criteria were independently verified as NOT achieved.',
    'Actually satisfy each one and re-verify before finishing. Do not repeat steps already done:',
    lines.join('\n'),
  ].join('\n');
}

/**
 * 校验单个子任务是否真正达标：归一断言 → 异步取证 → 纯判定 → 决定是否重跑并造指令。
 * 无合法客观断言（开放任务）时才退回注入的 critic(judge)，且低置信不轻信。
 * @param {object} params
 * @param {Array} params.doneCriteria 子任务原始达标断言（可能来自模型，不可信）
 * @param {(c: object) => boolean | Promise<boolean>} params.gatherEvidence 单条断言取证器（真实工具查证据）
 * @param {() => Promise<{goalMet?:boolean, confidence?:number}>} [params.judge] 开放任务 critic
 * @param {{failureRetryable:boolean, progressMade:boolean, budgetLeft:boolean, attemptsUnderLimit:boolean}} params.gates 回炉四闸门
 * @param {object} [params.config] completionVerification 配置（objectiveChecksEnabled / lowConfidence）
 * @returns {Promise<{verdict:string, missing:string[], reason:string, rerun:boolean, directive:string|null}>}
 */
export async function verifySubtaskCompletion(params = {}) {
  const { doneCriteria, gatherEvidence, judge, gates = {}, config = {} } = params;

  const criteria = normalizeDoneCriteria(doneCriteria);
  const checkResults = [];

  // ① 有客观断言且未禁用 → 逐条异步取证（抛错即 fail-safe 记未通过）
  if (config.objectiveChecksEnabled !== false && criteria.length > 0 && typeof gatherEvidence === 'function') {
    for (const c of criteria) {
      let ev;
      try {
        ev = await gatherEvidence(c);
      } catch {
        ev = null;
      }
      // #1/#3：取证器新契约为对象 {available,pass,reason}；同时兼容遗留布尔/null 契约（注入的测试取证器）。
      let available;
      let passVal;
      let reason;
      if (ev && typeof ev === 'object') {
        available = ev.available === true;
        passVal = !!ev.pass;
        reason = ev.reason;
      } else {
        available = ev !== null && ev !== undefined;
        passVal = !!ev;
        reason = available ? undefined : 'content_unavailable';
      }
      checkResults.push({ id: c.id, check: c.check, pass: available ? passVal : false, available, ...(reason ? { reason } : {}) });
    }
  }

  // ② 无客观取证结果（开放任务或已禁用）→ 退回注入的 critic
  let judgeRes = null;
  if (checkResults.length === 0 && typeof judge === 'function') {
    try {
      judgeRes = await judge();
    } catch {
      judgeRes = null;
    }
  }

  const result = classifyVerdict({
    checkResults,
    judge: judgeRes,
    lowConfidence: config.lowConfidence,
    failureRetryable: gates.failureRetryable,
    progressMade: gates.progressMade,
    budgetLeft: gates.budgetLeft,
    attemptsUnderLimit: gates.attemptsUnderLimit,
  });

  // 仅"未达标可重跑"才驱动回炉；其余（达标/永久未达标/无法判定）一律不重跑
  // 注（#12）：当前 Phase 2b 的 annotate 固定传四闸门全 false（1b 不重跑），故生产路径上
  // rerun 恒 false、directive 恒 null；四闸门与 directive 仅 Phase 5 接线后才会真正生效。
  const rerun = result.verdict === VERDICTS.UNMET_RETRYABLE;
  return {
    ...result,
    criteria, // 归一后的断言，供调用方（annotate）把缺项 id 还原成可读 [check] target
    checkResults, // #2/#3：逐条取证结果（含 reason），供 annotate→buildCompletionNote 分桶渲染文案
    rerun,
    directive: rerun ? buildMissingCriteriaDirective(criteria, checkResults) : null,
  };
}


/**
 * 构造一个把单条 doneCriteria 发往内容脚本、在真实 DOM 上取证的异步取证器。
 * 供 react-loop（Phase 2b）注入 verifySubtaskCompletion 的 gatherEvidence。
 * #1/#3：返回结构化三态 { available, pass, reason }：available:true+pass=真实 DOM 结论（无 reason）；
 * available:false+reason=取不到证（判据不可评估的 content reason / 通道·页·超时的 channel reason）。
 * available:false 绝不等于 pass:false——交由 classifyVerdict 归 indeterminate，不谎报未达标。
 * @param {number} tabId 目标标签页
 * @param {(tabId:number, msg:object)=>Promise<any>} [sendMessage] 注入以脱离 chrome 单测
 * @param {number} [timeoutMs] 单条取证超时（#M-new-4：防渲染进程阻塞时无界挂起），<=0 不启用
 * @returns {(criterion: object) => Promise<{available:boolean, pass:boolean, reason?:string}>}
 */
export const EVIDENCE_TIMEOUT_MS = 3000;

export function createContentEvidenceCollector(tabId, sendMessage, timeoutMs = EVIDENCE_TIMEOUT_MS) {
  const send = sendMessage
    || ((id, msg) => chrome.tabs.sendMessage(id, msg));
  // #3：不可用出口的 reason 分类以 debug 级留痕（判据不可评估 vs 通道/页问题），不进用户文案、不改变返回语义。
  const noteMiss = (reason, criterion, extra) => {
    try {
      logger.debug('[completion-verifier] evidence unavailable', {
        reason, tabId, check: criterion && criterion.check,
        target: criterion && criterion.target, ...(extra || {}),
      });
    } catch { /* 诊断绝不影响取证 */ }
  };
  const unavailable = (reason, criterion, extra) => { noteMiss(reason, criterion, extra); return { available: false, pass: false, reason }; };
  return async (criterion) => {
    let timer;
    try {
      const p = send(tabId, { type: 'EVALUATE_DONE_CRITERIA', criteria: [criterion] });
      p.catch(() => {}); // 超时后落败的 send 若 reject 也不至成未处理拒绝
      const resp = timeoutMs > 0
        ? await Promise.race([p, new Promise((_res, rej) => { timer = setTimeout(() => rej(new Error('evidence timeout')), timeoutMs); })])
        : await p;
      const arr = Array.isArray(resp) ? resp : (resp && Array.isArray(resp.results) ? resp.results : null);
      if (!arr || arr.length === 0) return unavailable('response_shape', criterion); // 无有效结论 → 取证不可用（≠ 未达标）
      const r = arr[0];
      if (r && r.available === false) return unavailable(r.reason || 'content_unavailable', criterion); // #1：透传 content reason（老脚本无则回落 content_unavailable）
      return { available: true, pass: !!r.pass }; // 明确 true/false：真实 DOM 结论
    } catch (e) {
      const msg = e && e.message ? String(e.message) : '';
      const reason = msg === 'evidence timeout' ? 'channel_timeout'
        : /Receiving end|Could not establish connection/i.test(msg) ? 'channel_no_receiver'
        : /Cannot access|chrome-extension|No tab|Invalid value|error page|access chrome/i.test(msg) ? 'page_unreachable'
        : 'channel_error';
      return unavailable(reason, criterion, { err: msg }); // 通道不可用/超时 ≠ 未达标；交由 classifyVerdict 归 indeterminate
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

/**
 * 把一条判据渲染成面向父模型的可读描述：按 check 类型决定展示 target 还是 expected，
 * 避免 text_contains/attribute_equals/url_matches 因只看 target 而显示 "(no target)" 丢掉关键值（#1）。
 * @param {{check:string, target:*, expected:*}} c
 * @returns {string}
 */
function describeCriterion(c) {
  const tgt = (c.target != null && c.target !== '') ? String(c.target) : '';
  const exp = (c.expected != null && c.expected !== '') ? String(c.expected) : '';
  switch (c.check) {
    case 'text_contains': return `[text_contains] ${exp || tgt || '(no text)'}`;
    case 'attribute_equals': return `[attribute_equals] ${tgt}${exp ? ' = ' + exp : ''}`;
    case 'url_matches': return `[url_matches] ${tgt || exp || '(no pattern)'}`;
    default: return `[${c.check}] ${tgt || '(no target)'}`;
  }
}

// #3：把逐条不可用 reason 分桶为一句面向父模型的提示：判据写法错（可修正）vs 目标页/通道 vs 混合。
// 无 checkResults / 未知 reason → 回落泛化文案（向后兼容）。
const CRITERIA_REASON_SET = new Set(['invalid_selector', 'empty_target', 'missing_expected', 'unknown_check', 'no_href', 'eval_error']);
const CHANNEL_REASON_SET = new Set(['channel_timeout', 'channel_no_receiver', 'page_unreachable', 'response_shape', 'channel_error']);
function summarizeEvidenceDetail(checkResults) {
  const un = Array.isArray(checkResults) ? checkResults.filter((r) => r.available === false) : [];
  const reasons = [];
  for (const r of un) { if (r.reason && reasons.indexOf(r.reason) === -1) reasons.push(r.reason); }
  const hasC = reasons.some((x) => CRITERIA_REASON_SET.has(x));
  const hasCh = reasons.some((x) => CHANNEL_REASON_SET.has(x));
  let phrase;
  if (hasC && hasCh) phrase = t('completionVerifier.detailMixed');
  else if (hasC) phrase = t('completionVerifier.detailCriteria');
  else if (hasCh) phrase = t('completionVerifier.detailChannel');
  else phrase = t('completionVerifier.detailUnknown');
  const codes = (hasC || hasCh) ? reasons.join(', ') : '';
  return codes ? `${phrase}: ${codes}` : phrase;
}

/**
 * 把一个判定结果渲染成面向父模型的上报文案（走 i18n，按 verdict 分支）。
 * #8：unmet 无论有无缺项（judge 未达标时 missing 为空）一律走 ⚠️；
 * #9：文案由 t() 取，不再硬编码中文。
 * @param {{verdict:string, missing:string[], reason:string, criteria?:Array}} verdict
 * @returns {string}
 */
export function buildCompletionNote(verdict) {
  const v = verdict.verdict;
  if (v === VERDICTS.SATISFIED) return t('completionVerifier.satisfied');
  if (v === VERDICTS.UNMET_RETRYABLE || v === VERDICTS.UNMET_PERMANENT) {
    if (verdict.missing && verdict.missing.length > 0) {
      // M4/#1：用可读的 [check] + 关键值（含 expected）而非内部 id，让父模型能据此行动
      const crits = verdict.criteria || [];
      const missingText = verdict.missing.map((id) => {
        const c = crits.find((x) => x.id === id);
        return c ? describeCriterion(c) : id;
      }).join('; ');
      return t('completionVerifier.unmet', { missing: missingText });
    }
    return t('completionVerifier.judgeUnmet', { reason: verdict.reason });
  }
  // INDETERMINATE：如实说明未能求值，绝不谎报未达标；#4 拆分“全部不可评估”与“部分不可评估”
  if (verdict.reason === 'evidence_partial') {
    return t('completionVerifier.evidencePartial', { detail: summarizeEvidenceDetail(verdict.checkResults) });
  }
  if (verdict.reason === 'evidence_unavailable') {
    return t('completionVerifier.evidenceUnavailable', { detail: summarizeEvidenceDetail(verdict.checkResults) });
  }
  return t('completionVerifier.noCriteria', { reason: verdict.reason });
}

/**
 * 对单个子任务结果就地取证并写回 completionNote/verification。返回同一个 r 引用。
 *
 * M-new-2：这是取证时机的正确粒度——react-loop 在子任务成功的 onDone 钩子里即时调用，
 * 此时该子任务的达标现场（toast/表单值/URL）尚未被后续子任务的导航抹掉；旧的"整轮末尾
 * 统一取证"会对早期子任务取到陈旧/缺失的现场，得出假未达或假达成。
 * 严格遵循 1b：四闸门全 false → 永不重跑；只追写 note，绝不改 st.status。
 * 尽力而为：shouldStop/取证/写回任何异常均吞掉，绝不让 onDone 因校验而中断主循环。
 * @param {object} r 单子任务结果（会被就地补充 verification/completionNote）
 * @param {Array} subtasks 计划子任务（携带 doneCriteria）
 * @param {{gatherEvidence:Function, config?:object, shouldStop?:()=>boolean}} deps
 * @returns {Promise<object>} 同一个 r
 */
export async function annotateOneSubtaskCompletion(r, subtasks, deps = {}) {
  if (!r) return r;
  const { gatherEvidence, config = {}, shouldStop } = deps;
  try {
    if (typeof shouldStop === 'function' && shouldStop()) return r; // #11/M-new-4：取消/超时早停，不取证
    const planned = Array.isArray(subtasks)
      ? subtasks.find((s) => s.id === r.subtaskId || s.name === r.subtaskName)
      : null;
    const raw = planned && planned.doneCriteria;
    if (!Array.isArray(raw) || raw.length === 0) return r; // 最简起步：无客观断言不动
    const verdict = await verifySubtaskCompletion({
      doneCriteria: raw,
      gatherEvidence,
      // 1b：不重跑 —— 四闸门全 false，任何未达标一律落 unmet_permanent，仅用于如实上报
      gates: { failureRetryable: false, progressMade: false, budgetLeft: false, attemptsUnderLimit: false },
      config,
    });
    r.verification = verdict;
    r.completionNote = buildCompletionNote(verdict);
  } catch {
    // 尽力而为：校验环节的异常绝不影响子任务结果与主循环执行序
  }
  return r;
}

/**
 * Phase 2b 编排（批量包装）：对一批子任务结果逐个即时取证。保留为可复用 API 与单测入口；
 * 生产接线走 per-subtask 的 annotateOneSubtaskCompletion（onDone 内）。
 * @param {Array} subtaskResults executeSubtasks 的返回
 * @param {Array} subtasks plan_task 计划子任务（携带 doneCriteria）
 * @param {{gatherEvidence:Function, config?:object, shouldStop?:()=>boolean}} deps
 * @returns {Promise<Array>} 同 subtaskResults
 */
export async function annotateSubtaskCompletion(subtaskResults, subtasks, deps = {}) {
  if (!Array.isArray(subtaskResults) || !Array.isArray(subtasks)) return subtaskResults;
  for (const r of subtaskResults) {
    if (typeof deps.shouldStop === 'function' && deps.shouldStop()) break; // #11：取消/超时即停整批取证
    await annotateOneSubtaskCompletion(r, subtasks, deps);
  }
  return subtaskResults;
}
