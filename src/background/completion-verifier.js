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
import { isReadOnlyVerifyCommand, shQuoteArg } from '../shared/verify-command-safety.js';

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
    detailChannel: '目标页/本地 Agent 不可达或取证通道异常',
    detailCommandPolicy: '命令需人工确认或被安全策略拒绝，无法自动取证',
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
    detailChannel: 'the target page or local agent was unreachable, or the evidence channel errored',
    detailCommandPolicy: 'the command requires manual confirmation or was refused by the security policy, so it was not auto-verified',
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

// 非 DOM 取证（Phase A）：命令/文件类判据集合，与 DOM 类一一对应路由。
const COMMAND_CHECKS = new Set(['command_exit_zero', 'command_output_matches', 'file_exists', 'file_absent', 'file_contains']);
const DOM_CHECKS = new Set(['element_exists', 'element_absent', 'text_contains', 'url_matches', 'attribute_equals']);

// 命令取证超时：比 DOM 慢（本地进程起停），给更宽上限。
export const COMMAND_EVIDENCE_TIMEOUT_MS = 15000;

/**
 * 把一条命令/文件判据编译成待执行的 shell 命令。文件类走只读模板 + shQuoteArg 转义，
 * 命令类直接取 target。构建期即可判定的非法（空 target / 缺 expected / 含控制字符路径）
 * 返回 { reason }，由调用方归取证不可用，绝不拼接执行。
 * @param {{check:string, target:*, expected:*}} criterion
 * @returns {{command:string} | {reason:string}}
 */
export function buildVerifyCommand(criterion) {
  const target = criterion.target != null ? String(criterion.target) : '';
  const expected = criterion.expected != null ? String(criterion.expected) : '';
  switch (criterion.check) {
    case 'command_exit_zero':
      return target ? { command: target } : { reason: 'empty_target' };
    case 'command_output_matches':
      if (!target) return { reason: 'empty_target' };
      if (!expected) return { reason: 'missing_expected' };
      return { command: target };
    case 'file_exists': {
      if (!target) return { reason: 'empty_target' };
      const q = shQuoteArg(target);
      return q === null ? { reason: 'bad_path' } : { command: `test -e ${q}` };
    }
    case 'file_absent': {
      if (!target) return { reason: 'empty_target' };
      const q = shQuoteArg(target);
      return q === null ? { reason: 'bad_path' } : { command: `test ! -e ${q}` };
    }
    case 'file_contains': {
      if (!target) return { reason: 'empty_target' };
      if (!expected) return { reason: 'missing_expected' };
      const q = shQuoteArg(target);
      const qe = shQuoteArg(expected);
      if (q === null || qe === null) return { reason: 'bad_path' };
      return { command: `grep -qF -- ${qe} ${q}` };
    }
    default:
      return { reason: 'unknown_check' };
  }
}

/**
 * 构造一个把命令/文件判据落到本地 Agent 执行、以退出码/输出取证的异步取证器。
 * 返回契约与内容取证器一致：{ available, pass, reason }。
 * 安全：
 * - readOnlyGate=true（默认，重跑关=Phase A）：执行前先过 isReadOnlyVerifyCommand，非只读命令一律拒（不发不执行）。
 * - readOnlyGate=false（重推开=Phase B）：去本地只读硬拦，一律交 agent /api/exec 三档门控——
 *   allow(含 pytest/build) 才执行读退出码；confirm/deny 由 agent 不执行→各自 reason 归 indeterminate。
 * 两档均：永不传 force=true；agent 离线/超时/执行错→ available:false（indeterminate），绝不折成 pass:false。
 * @param {{execWait:(command:string, cwd?:string, force?:boolean, timeoutMs?:number)=>Promise<any>, isOnline?:()=>boolean|Promise<boolean>, timeoutMs?:number, readOnlyGate?:boolean}} deps
 * @returns {(criterion: object) => Promise<{available:boolean, pass:boolean, reason?:string}>}
 */
export function createCommandEvidenceCollector(deps = {}) {
  const { execWait, isOnline, timeoutMs = COMMAND_EVIDENCE_TIMEOUT_MS, readOnlyGate = true } = deps;
  const unavailable = (reason, criterion, extra) => {
    try {
      logger.debug('[completion-verifier] command evidence unavailable', {
        reason, check: criterion && criterion.check, target: criterion && criterion.target, ...(extra || {}),
      });
    } catch { /* 诊断绝不影响取证 */ }
    return { available: false, pass: false, reason };
  };
  return async (criterion) => {
    if (typeof execWait !== 'function') return unavailable('agent_unavailable', criterion);
    const built = buildVerifyCommand(criterion);
    if (built.reason) return unavailable(built.reason, criterion);
    // 只读安全门：仅 readOnlyGate=true（重跑关=Phase A）时本地硬拦，证明不了只读→拒、绝不执行。
    // 开重跑时此门关闭，改由 agent 三档门控在下文按 res.level 解释（allow 才执行）。
    if (readOnlyGate && !isReadOnlyVerifyCommand(built.command)) return unavailable('verify_command_not_readonly', criterion, { command: built.command });
    // agent 在线探测（可选注入）：离线归 agent_unavailable。
    if (typeof isOnline === 'function') {
      let ok = true;
      try { ok = await isOnline(); } catch { ok = false; }
      if (!ok) return unavailable('agent_unavailable', criterion);
    }
    let timer;
    try {
      const p = execWait(built.command, undefined, false, timeoutMs); // force 恒 false（红线 3）
      p.catch(() => {});
      const res = timeoutMs > 0
        ? await Promise.race([p, new Promise((_r, rej) => { timer = setTimeout(() => rej(new Error('command timeout')), timeoutMs); })])
        : await p;
      if (!res || typeof res !== 'object') return unavailable('command_error', criterion);
      if (res.killed) return unavailable('command_timeout', criterion);
      // agent 三档门控：confirm/deny 均不执行（无 exitCode）→ 归 indeterminate，绝不当未达标。
      if (res.level === 'confirm') return unavailable('verify_command_confirm_required', criterion, { command: built.command });
      if (res.level === 'deny') return unavailable('verify_command_denied', criterion, { command: built.command });
      if (typeof res.exitCode === 'number') {
        if (criterion.check === 'command_output_matches') {
          const out = `${res.stdout || ''}${res.stderr || ''}`;
          return { available: true, pass: out.includes(String(criterion.expected)) };
        }
        // exit 0=达成；exit 1（test/grep 未命中）=真实未达成（available+pass:false），非取不到证。
        return { available: true, pass: res.exitCode === 0 };
      }
      const errStr = res.error ? String(res.error) : '';
      return unavailable(/not paired|connect|offline|econnrefused|unavailable|agent/i.test(errStr) ? 'agent_unavailable' : 'command_error', criterion, { err: errStr });
    } catch (e) {
      const msg = e && e.message ? String(e.message) : '';
      return unavailable(/timeout/i.test(msg) ? 'command_timeout' : 'command_error', criterion, { err: msg });
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

/**
 * 构造按 check 类型路由的取证器：DOM 类→内容取证器，命令/文件类→命令取证器。
 * 取代 react-loop 直接注入的 createContentEvidenceCollector；verifySubtaskCompletion 仍按条调 gatherEvidence，内核零改动。
 * #5：DOM 类可按调用时 resolveTabId() 动态解析工作 tab（子任务 open/switch_tab 记在派生 sessionId 名下），
 * 未提供或解析为空则回落构造时捕获的 tabId（不劣于 Phase A）；解析结果按 tab 缓存内容取证器，逐调用重解析。
 * @param {{tabId:number, resolveTabId?:()=>number|null, execWait?:Function, isOnline?:Function, sendMessage?:Function, contentTimeoutMs?:number, commandTimeoutMs?:number, commandReadOnlyGate?:boolean}} deps
 * @returns {(criterion: object) => Promise<{available:boolean, pass:boolean, reason?:string}>}
 */
export function createRoutingEvidenceCollector(deps = {}) {
  const { tabId, resolveTabId, execWait, isOnline, sendMessage, contentTimeoutMs, commandTimeoutMs, commandReadOnlyGate } = deps;
  const collectCommand = createCommandEvidenceCollector({ execWait, isOnline, timeoutMs: commandTimeoutMs, readOnlyGate: commandReadOnlyGate });
  const domCache = new Map();
  const domFor = (tid) => {
    let c = domCache.get(tid);
    if (!c) { c = createContentEvidenceCollector(tid, sendMessage, contentTimeoutMs); domCache.set(tid, c); }
    return c;
  };
  const resolveDomTab = () => {
    if (typeof resolveTabId === 'function') {
      try { const t = resolveTabId(); if (t != null) return t; } catch { /* 解析异常回落捕获 tabId */ }
    }
    return tabId;
  };
  return async (criterion) => {
    const check = criterion && criterion.check;
    if (COMMAND_CHECKS.has(check)) return collectCommand(criterion);
    if (DOM_CHECKS.has(check)) return domFor(resolveDomTab())(criterion);
    // 未知 check（正常已被 normalize 过滤）：保守取不到证，不派发。
    return { available: false, pass: false, reason: 'unknown_check' };
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
    case 'command_output_matches':
    case 'file_contains': return `[${c.check}] ${tgt}${exp ? ' = ' + exp : ''}`;
    default: return `[${c.check}] ${tgt || '(no target)'}`;
  }
}

// #3：把逐条不可用 reason 分桶为一句面向父模型的提示：判据写法错（可修正）vs 目标页/通道 vs 混合。
// 无 checkResults / 未知 reason → 回落泛化文案（向后兼容）。
const CRITERIA_REASON_SET = new Set(['invalid_selector', 'empty_target', 'missing_expected', 'unknown_check', 'no_href', 'eval_error', 'bad_path', 'verify_command_not_readonly']);
const CHANNEL_REASON_SET = new Set(['channel_timeout', 'channel_no_receiver', 'page_unreachable', 'response_shape', 'channel_error', 'agent_unavailable', 'command_timeout', 'command_error']);
// B2：命令三档门控策略性不可评估（需人工确认/被安全策略拒绝）单独成桶——
// 既非判据写法错（不可由模型修正写法解决），也非通道异常（通道其实可达），避免误导上报文案。
const COMMAND_POLICY_REASON_SET = new Set(['verify_command_confirm_required', 'verify_command_denied']);
function summarizeEvidenceDetail(checkResults) {
  const un = Array.isArray(checkResults) ? checkResults.filter((r) => r.available === false) : [];
  const reasons = [];
  for (const r of un) { if (r.reason && reasons.indexOf(r.reason) === -1) reasons.push(r.reason); }
  const hasC = reasons.some((x) => CRITERIA_REASON_SET.has(x));
  const hasCh = reasons.some((x) => CHANNEL_REASON_SET.has(x));
  const hasP = reasons.some((x) => COMMAND_POLICY_REASON_SET.has(x));
  const phrases = [];
  if (hasC && hasCh) phrases.push(t('completionVerifier.detailMixed'));
  else {
    if (hasC) phrases.push(t('completionVerifier.detailCriteria'));
    if (hasCh) phrases.push(t('completionVerifier.detailChannel'));
  }
  if (hasP) phrases.push(t('completionVerifier.detailCommandPolicy'));
  const phrase = phrases.length ? phrases.join('；') : t('completionVerifier.detailUnknown');
  const codes = (hasC || hasCh || hasP) ? reasons.join(', ') : '';
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
 * 严格真子集判定（防无限回炉的进闸门）：cur 必须完全包含于 prev 且尺寸严格更小。
 * 缺项集单调收缩才认定“有进展”，否则（同集/变大）停——避免振荡。
 * @param {Set} cur 本轮缺项 id 集
 * @param {Set} prev 上轮缺项 id 集
 * @returns {boolean}
 */
function isStrictSubset(cur, prev) {
  if (!(cur instanceof Set) || !(prev instanceof Set)) return false;
  if (cur.size >= prev.size) return false;
  for (const x of cur) { if (!prev.has(x)) return false; }
  return true;
}

/**
 * 对单个子任务结果就地取证并写回 completionNote/verification。返回同一个 r 引用。
 *
 * M-new-2：这是取证时机的正确粒度——react-loop 在子任务成功的 onDone 钩子里即时调用，
 * 此时该子任务的达标现场（toast/表单值/URL）尚未被后续子任务的导航抹掉；旧的"整轮末尾
 * 统一取证"会对早期子任务取到陈旧/缺失的现场，得出假未达或假达成。
 * 严格遵循 1b：rerunEnabled=false（缺省）时四闸门全 false → 永不重跑，任何未达标一律落
 * unmet_permanent，仅用于如实上报——输出与 Phase A 逐字节一致；只追写 note，绝不改 st.status。
 * rerunEnabled=true 且注入 rerun 回调时才进重跑回路：四闸门真实（可重试∧有进展∧有预算∧未超次）
 * 全过才回炉，防振荡靠缺项集严格收缩 + maxRetryAttempts。
 * 尽力而为：shouldStop/取证/重跑/写回任何异常均吞掉，绝不让 onDone 因校验而中断主循环。
 * @param {object} r 单子任务结果（会被就地补充 verification/completionNote）
 * @param {Array} subtasks 计划子任务（携带 doneCriteria）
 * @param {{gatherEvidence:Function, config?:object, shouldStop?:()=>boolean, rerun?:(directive:string, verdict:object)=>Promise<void>, budgetLeft?:()=>boolean}} deps
 *   rerun/budgetLeft 仅在 config.rerunEnabled=true 时生效；budgetLeft 缺省视为有预算。
 * @returns {Promise<object>} 同一个 r
 */
export async function annotateOneSubtaskCompletion(r, subtasks, deps = {}) {
  if (!r) return r;
  const { gatherEvidence, config = {}, shouldStop, rerun, budgetLeft } = deps;
  try {
    if (typeof shouldStop === 'function' && shouldStop()) return r; // #11/M-new-4：取消/超时早停，不取证
    const planned = Array.isArray(subtasks)
      ? subtasks.find((s) => s.id === r.subtaskId || s.name === r.subtaskName)
      : null;
    const raw = planned && planned.doneCriteria;
    if (!Array.isArray(raw) || raw.length === 0) return r; // 最简起步：无客观断言不动

    // Phase A / 重跑未启用：四闸门全 false，仅标注，输出逐字节不变。
    if (!(config.rerunEnabled === true && typeof rerun === 'function')) {
      const verdict = await verifySubtaskCompletion({
        doneCriteria: raw,
        gatherEvidence,
        // 1b：不重跑 —— 四闸门全 false，任何未达标一律落 unmet_permanent，仅用于如实上报
        gates: { failureRetryable: false, progressMade: false, budgetLeft: false, attemptsUnderLimit: false },
        config,
      });
      r.verification = verdict;
      r.completionNote = buildCompletionNote(verdict);
      return r;
    }

    // Phase B 重跑回路：逐轮取证→四闸门真实计算→未达标且可重跑则回灌 directive 再跑一轮。
    const maxAttempts = Number.isFinite(config.maxRetryAttempts) ? config.maxRetryAttempts : 1;
    let verifyAttempt = 0; // 与异常重试 retry 正交，独立计数
    let prevMissing = null; // 上轮缺项 id 集（null=首轮）
    while (true) {
      if (typeof shouldStop === 'function' && shouldStop()) return r; // 每轮回炉前复查取消/超时
      const attemptsUnderLimit = verifyAttempt < maxAttempts; // 闸门 4
      const bl = typeof budgetLeft === 'function' ? !!budgetLeft() : true; // 闸门 3（时间+token，由调用方注入）
      const verdict = await verifySubtaskCompletion({
        doneCriteria: raw,
        gatherEvidence,
        // progressMade 乐观传 true：真子集判定需本轮 missing（取证后才知道），进度闸门由下方 realProgress 兜住。
        // failureRetryable=true：客观缺项属可重试类（能否真回炉另由 attempts/budget/progress 决定）。
        gates: { failureRetryable: true, progressMade: true, budgetLeft: bl, attemptsUnderLimit },
        config,
      });
      r.verification = verdict;
      r.completionNote = buildCompletionNote(verdict);

      const curMissing = new Set(verdict.missing || []);
      const realProgress = prevMissing === null ? true : isStrictSubset(curMissing, prevMissing); // 闸门 2
      const wantRerun = verdict.rerun === true && realProgress;
      if (!wantRerun) {
        // 若 classify 因乐观 progressMade=true 判成 retryable，但真实无严格收缩→据实降级为永久未达标，避免谎报"可继续"。
        if (verdict.verdict === VERDICTS.UNMET_RETRYABLE && !realProgress) {
          const downgraded = { ...verdict, verdict: VERDICTS.UNMET_PERMANENT, reason: 'objective_no_progress', rerun: false, directive: null };
          r.verification = downgraded;
          r.completionNote = buildCompletionNote(downgraded);
        }
        return r;
      }
      verifyAttempt++;
      prevMissing = curMissing;
      await rerun(verdict.directive, verdict); // react-loop 追加指令并再跑一轮 reactLoop，就地更新 r.result/executionLog
    }
  } catch {
    // 尽力而为：校验/重跑环节的异常绝不影响子任务结果与主循环执行序（保留上一轮已写回的 verification/note）
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
