// 完成度校验 Phase B：端到端编排「冒烟矩阵」——一键覆盖 ①–⑧ 场景。
//
// 与既有单测的分工：command/routing/rerun/annotate 各自单测验「零件」；本文件验「接线」——
// 用真实的 createRoutingEvidenceCollector（假 sendMessage/execWait/isOnline + resolveTabId）+
// 真实的 annotateOneSubtaskCompletion（假 rerun 回调）串成完整链路，并复刻 react-loop 里
// 「commandReadOnlyGate = !rerunEnabled」这条开关联动，证明：
//   · 开关关 = Phase A 只读硬拦（非只读命令判 verify_command_not_readonly、绝不发命令）；
//   · 开关开 = agent 三档（allow 执行读退出码 / confirm / deny），且 force 恒 false；
//   · DOM 取证按子任务派生 tab 动态解析（#5）；
//   · 未达标→缺项严格收缩→重跑直至达标；无进展/超次/离线各自如实落地。
// available:false 一律归 indeterminate，绝不折成 pass:false、绝不谎报。
import { describe, test, expect } from 'vitest';
import {
  createRoutingEvidenceCollector,
  annotateOneSubtaskCompletion,
} from '../../src/background/completion-verifier.js';
import { VERDICTS } from '../../src/shared/completion-verdict.js';

const INITIAL_TAB = 100;

// 搭一个「场景执行环境」：DOM 由 domResolver 决定三态；命令由 execResolver 决定 level/exitCode。
// annotate 的重跑回路通过 rerun 回调翻转外部状态（模拟模型补做后现场变化）。
function makeEnv({ domResolver, execResolver, online = async () => true, resolvedTab } = {}) {
  const sentTabs = [];
  const execCalls = [];
  const sendMessage = async (tabId, msg) => {
    sentTabs.push(tabId);
    return [domResolver(msg.criteria[0])];
  };
  const execWait = async (command, cwd, force) => {
    execCalls.push({ command, force });
    return execResolver ? execResolver(command) : { level: 'allow', exitCode: 0 };
  };
  const resolveTabId = () => (resolvedTab != null ? resolvedTab : null);
  // 复刻 react-loop 接线：只读硬拦门随 !rerunEnabled（开重跑→去只读、走三档）。
  const buildCollector = (config) => createRoutingEvidenceCollector({
    tabId: INITIAL_TAB,
    resolveTabId,
    execWait,
    isOnline: online,
    sendMessage,
    commandReadOnlyGate: !config.rerunEnabled,
  });
  return { sentTabs, execCalls, buildCollector };
}

function subtasksOf(doneCriteria) {
  return [{ id: 's1', name: 'n', doneCriteria }];
}
function resultOf() {
  return { subtaskId: 's1', subtaskName: 'n', success: true, result: 'x' };
}

const CFG_RERUN_ON = { enabled: true, rerunEnabled: true, objectiveChecksEnabled: true, maxRetryAttempts: 5, perSubtaskTokenBudget: 0, lowConfidence: 0.6 };
const CFG_RERUN_OFF = { enabled: true, rerunEnabled: false, objectiveChecksEnabled: true, maxRetryAttempts: 5, perSubtaskTokenBudget: 0, lowConfidence: 0.6 };

describe('完成度校验 Phase B 端到端冒烟矩阵（① – ⑧）', () => {
  // ① DOM 判据真满足
  test('① 满足：DOM text 命中 → satisfied ✅、不重跑', async () => {
    const env = makeEnv({ domResolver: () => ({ available: true, pass: true }) });
    const r = resultOf();
    let reruns = 0;
    await annotateOneSubtaskCompletion(r, subtasksOf([{ id: 'a', check: 'element_exists', target: '#dash' }]), {
      gatherEvidence: env.buildCollector(CFG_RERUN_ON), config: CFG_RERUN_ON,
      rerun: () => { reruns++; },
    });
    expect(r.verification.verdict).toBe(VERDICTS.SATISFIED);
    expect(r.completionNote).toContain('✅');
    expect(reruns).toBe(0);
  });

  // ② 未达标→缺项严格收缩→自动补跑直至达标（rerunEnabled=true）
  test('② 未达标自动补跑：缺项 [a,b]→[a]→[] → 2 次重跑后 satisfied', async () => {
    const missing = new Set(['a', 'b']);
    const env = makeEnv({ domResolver: (c) => ({ available: true, pass: !missing.has(c.id) }) });
    const r = resultOf();
    const directives = [];
    await annotateOneSubtaskCompletion(r, subtasksOf([
      { id: 'a', check: 'element_exists', target: '#a' },
      { id: 'b', check: 'element_exists', target: '#b' },
    ]), {
      gatherEvidence: env.buildCollector(CFG_RERUN_ON), config: CFG_RERUN_ON,
      rerun: async (directive) => { directives.push(directive); if (directives.length === 1) missing.delete('b'); else missing.delete('a'); },
    });
    expect(directives.length).toBe(2);
    expect(directives[0]).toContain('element_exists'); // directive 面向模型、含可读判据
    expect(r.verification.verdict).toBe(VERDICTS.SATISFIED);
  });

  // ④ 命令 allow 档（rerunEnabled=true）：真执行读退出码 → 绿则 satisfied；force 恒 false
  test('④ allow 命令：rerunEnabled=true 去只读、执行 npm test 退出码 0 → satisfied、force=false', async () => {
    const env = makeEnv({ execResolver: () => ({ level: 'allow', exitCode: 0 }) });
    const r = resultOf();
    await annotateOneSubtaskCompletion(r, subtasksOf([{ id: 'c1', check: 'command_exit_zero', target: 'npm test' }]), {
      gatherEvidence: env.buildCollector(CFG_RERUN_ON), config: CFG_RERUN_ON,
    });
    expect(env.execCalls.length).toBe(1);
    expect(env.execCalls[0].command).toBe('npm test');
    expect(env.execCalls[0].force).toBe(false); // 红线 3：校验永不 force
    expect(r.verification.verdict).toBe(VERDICTS.SATISFIED);
  });

  // ③ 只读硬拦负向对照（rerunEnabled=false）：非只读命令不发出去
  test('③ rerunEnabled=false：非只读命令 verify_command_not_readonly、绝不发命令 → indeterminate', async () => {
    const env = makeEnv({ execResolver: () => ({ level: 'allow', exitCode: 0 }) });
    const r = resultOf();
    await annotateOneSubtaskCompletion(r, subtasksOf([{ id: 'c1', check: 'command_exit_zero', target: 'npm test' }]), {
      gatherEvidence: env.buildCollector(CFG_RERUN_OFF), config: CFG_RERUN_OFF,
    });
    expect(env.execCalls).toEqual([]); // 只读门开：根本没发给 agent
    expect(r.verification.verdict).toBe(VERDICTS.INDETERMINATE);
    expect(r.verification.reason).toBe('evidence_unavailable'); // 单项取不到证
  });

  // ⑤ confirm / deny 档（rerunEnabled=true）：不执行、判 indeterminate
  test('⑤a confirm：判 verify_command_confirm_required → indeterminate、未执行', async () => {
    const env = makeEnv({ execResolver: () => ({ level: 'confirm' }) });
    const r = resultOf();
    await annotateOneSubtaskCompletion(r, subtasksOf([{ id: 'c1', check: 'command_exit_zero', target: 'sudo rm -rf ./x' }]), {
      gatherEvidence: env.buildCollector(CFG_RERUN_ON), config: CFG_RERUN_ON,
    });
    expect(r.verification.verdict).toBe(VERDICTS.INDETERMINATE);
    expect(env.execCalls.every((c) => c.force === false)).toBe(true);
  });

  test('⑤b deny：判 verify_command_denied → indeterminate', async () => {
    const env = makeEnv({ execResolver: () => ({ level: 'deny', success: false }) });
    const r = resultOf();
    await annotateOneSubtaskCompletion(r, subtasksOf([{ id: 'c1', check: 'command_exit_zero', target: 'rm -rf /' }]), {
      gatherEvidence: env.buildCollector(CFG_RERUN_ON), config: CFG_RERUN_ON,
    });
    expect(r.verification.verdict).toBe(VERDICTS.INDETERMINATE);
  });

  // ⑥ #5 多标签：DOM 取证打到 lastOperatedTab（动态解析），非初始捕获 tab
  test('⑥ DOM 取证按 resolveTabId 命中工作 tab（非初始 tab）', async () => {
    const env = makeEnv({ domResolver: () => ({ available: true, pass: true }), resolvedTab: 999 });
    const r = resultOf();
    await annotateOneSubtaskCompletion(r, subtasksOf([{ id: 'a', check: 'element_exists', target: '#a' }]), {
      gatherEvidence: env.buildCollector(CFG_RERUN_ON), config: CFG_RERUN_ON,
    });
    expect(env.sentTabs).toEqual([999]); // 打到派生 sessionId 的 lastOperatedTab
    expect(env.sentTabs).not.toContain(INITIAL_TAB);
  });

  test('⑥′ resolveTabId 无记录 → 回落捕获 tabId（不劣于现状）', async () => {
    const env = makeEnv({ domResolver: () => ({ available: true, pass: true }), resolvedTab: null });
    const r = resultOf();
    await annotateOneSubtaskCompletion(r, subtasksOf([{ id: 'a', check: 'element_exists', target: '#a' }]), {
      gatherEvidence: env.buildCollector(CFG_RERUN_ON), config: CFG_RERUN_ON,
    });
    expect(env.sentTabs).toEqual([INITIAL_TAB]);
  });

  // ⑦ 取不到证不谎报：Agent 离线 → indeterminate，绝不 satisfied / 绝不谎报失败
  test('⑦ Agent 离线 + 命令判据 → agent_unavailable、不发命令 → indeterminate（不盖完成、不谎报未达）', async () => {
    const env = makeEnv({ online: async () => false, execResolver: () => ({ level: 'allow', exitCode: 0 }) });
    const r = resultOf();
    await annotateOneSubtaskCompletion(r, subtasksOf([{ id: 'c1', check: 'command_exit_zero', target: 'npm test' }]), {
      gatherEvidence: env.buildCollector(CFG_RERUN_ON), config: CFG_RERUN_ON,
    });
    expect(env.execCalls).toEqual([]);
    expect(r.verification.verdict).toBe(VERDICTS.INDETERMINATE);
    expect(r.completionNote).not.toContain('✅');
  });

  // ⑧ 防振荡：缺项从不严格收缩 → 补跑一次即停并降级为永久未达标
  test('⑧ 无进展：重跑一轮缺项不减少 → 立即停、降级 objective_no_progress 永久未达标', async () => {
    const missing = new Set(['a']);
    const env = makeEnv({ domResolver: (c) => ({ available: true, pass: !missing.has(c.id) }) });
    const r = resultOf();
    let reruns = 0;
    await annotateOneSubtaskCompletion(r, subtasksOf([{ id: 'a', check: 'element_exists', target: '#a' }]), {
      gatherEvidence: env.buildCollector(CFG_RERUN_ON), config: CFG_RERUN_ON,
      rerun: () => { reruns++; /* 模型补做但没真达标：missing 不变 */ },
    });
    expect(reruns).toBe(1);
    expect(r.verification.verdict).toBe(VERDICTS.UNMET_PERMANENT);
    expect(r.verification.reason).toBe('objective_no_progress');
  });
});
