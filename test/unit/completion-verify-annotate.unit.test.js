// 完成度校验器 Phase 2b：子任务结果注解编排 annotateSubtaskCompletion 守卫（不重跑，仅上报）。
//
// 语义（用户拍板 1b + 最简起步）：有 doneCriteria 的子任务用真实取证判达成，
// 未达标只把"缺项"写进 completionNote 上报父模型，绝不自动重跑（gates 全 false），
// 也绝不改 st.status（避开 done/failed 计数器与 failureStrategy 回归面）。
// 无 doneCriteria 的子任务完全不动。开关由调用方(react-loop)短路，不进本层。
import { describe, test, expect } from 'vitest';
import { annotateSubtaskCompletion, annotateOneSubtaskCompletion, buildCompletionNote } from '../../src/background/completion-verifier.js';
import { VERDICTS } from '../../src/shared/completion-verdict.js';

function collectorPassing(...ids) {
  const passed = new Set(ids);
  const seen = [];
  return { seen, fn: async (c) => { seen.push(c.id); return passed.has(c.id); } };
}

describe('annotateSubtaskCompletion：客观取证 + 只上报不重跑', () => {
  test('全部达标 → verification=satisfied，note 标 ✅', async () => {
    const results = [{ subtaskId: 's1', subtaskName: '登录', success: true, result: 'ok' }];
    const subtasks = [{ id: 's1', doneCriteria: [{ id: 'a', check: 'element_exists', target: '#dash' }] }];
    const { fn, seen } = collectorPassing('a');
    await annotateSubtaskCompletion(results, subtasks, { gatherEvidence: fn, config: {} });
    expect(results[0].verification.verdict).toBe(VERDICTS.SATISFIED);
    expect(results[0].completionNote).toContain('✅');
    expect(results[0].verification.rerun).toBe(false); // 永不重跑
    expect(seen).toEqual(['a']);
  });

  test('有缺项 → unmet_permanent，note 点名缺项 id', async () => {
    const results = [{ subtaskId: 's1', subtaskName: 'n', success: true, result: 'x' }];
    const subtasks = [{ id: 's1', doneCriteria: [{ id: 'a', check: 'element_exists', target: '#go' }, { id: 'b', check: 'url_matches', target: '/done' }] }];
    const { fn } = collectorPassing('a'); // b 未通过
    await annotateSubtaskCompletion(results, subtasks, { gatherEvidence: fn, config: {} });
    expect(results[0].verification.verdict).toBe(VERDICTS.UNMET_PERMANENT);
    expect(results[0].verification.missing).toEqual(['b']);
    expect(results[0].completionNote).toContain('⚠️');
    // M4：上报用可读 [check] target，而非只列内部 id（b 的断言是 url_matches /done）
    expect(results[0].completionNote).toContain('url_matches');
    expect(results[0].completionNote).toContain('/done');
  });

  test('按 name 兜底匹配计划子任务', async () => {
    const results = [{ subtaskId: 'unknown-id', subtaskName: '搜索', success: true, result: 'x' }];
    const subtasks = [{ id: 'other', name: '搜索', doneCriteria: [{ id: 'a', check: 'element_exists', target: '#r' }] }];
    const { fn } = collectorPassing('a');
    await annotateSubtaskCompletion(results, subtasks, { gatherEvidence: fn, config: {} });
    expect(results[0].verification.verdict).toBe(VERDICTS.SATISFIED);
  });

  test('无 doneCriteria 的子任务完全不动（不取证、不加 note）', async () => {
    const results = [{ subtaskId: 's1', subtaskName: 'n', success: true, result: 'x' }];
    const subtasks = [{ id: 's1' }];
    let called = false;
    await annotateSubtaskCompletion(results, subtasks, { gatherEvidence: async () => { called = true; return true; }, config: {} });
    expect(called).toBe(false);
    expect(results[0].verification).toBeUndefined();
    expect(results[0].completionNote).toBeUndefined();
  });

  test('doneCriteria 全是未知类型 → 无合法断言 → indeterminate，note 标 ℹ️', async () => {
    const results = [{ subtaskId: 's1', subtaskName: 'n', success: true, result: 'x' }];
    const subtasks = [{ id: 's1', doneCriteria: [{ id: 'a', check: 'vague_hope', target: 'x' }] }];
    await annotateSubtaskCompletion(results, subtasks, { gatherEvidence: async () => true, config: {} });
    expect(results[0].verification.verdict).toBe(VERDICTS.INDETERMINATE);
    expect(results[0].completionNote).toContain('ℹ️');
  });

  test('取证抛错 → 不可用归 indeterminate，note 标 ℹ️ 且明说“非判定未达标”', async () => {
    const results = [{ subtaskId: 's1', subtaskName: 'n', success: true, result: 'x' }];
    const subtasks = [{ id: 's1', doneCriteria: [{ id: 'a', check: 'element_exists', target: '#x' }] }];
    await annotateSubtaskCompletion(results, subtasks, { gatherEvidence: async () => { throw new Error('boom'); }, config: {} });
    expect(results[0].verification.verdict).toBe(VERDICTS.INDETERMINATE);
    expect(results[0].verification.missing).toEqual([]);
    expect(results[0].completionNote).toContain('ℹ️');
    expect(results[0].completionNote).toContain('非判定未达标');
  });

  test('#11 shouldStop 早停：取消/超时后不再取证、不写 note', async () => {
    const results = [{ subtaskId: 's1', success: true }, { subtaskId: 's2', success: true }];
    const subtasks = [
      { id: 's1', doneCriteria: [{ id: 'a', check: 'element_exists', target: '#x' }] },
      { id: 's2', doneCriteria: [{ id: 'b', check: 'element_exists', target: '#y' }] },
    ];
    let called = 0;
    // 立即停 → 一个都不取证
    await annotateSubtaskCompletion(results, subtasks, {
      gatherEvidence: async () => { called++; return true; },
      shouldStop: () => true,
      config: {},
    });
    expect(called).toBe(0);
    expect(results[0].completionNote).toBeUndefined();
    expect(results[1].completionNote).toBeUndefined();
  });

  test('#11 shouldStop 中途置位 → 已处理项保留、后续项不再取证', async () => {
    const results = [{ subtaskId: 's1', success: true }, { subtaskId: 's2', success: true }];
    const subtasks = [
      { id: 's1', doneCriteria: [{ id: 'a', check: 'element_exists', target: '#x' }] },
      { id: 's2', doneCriteria: [{ id: 'b', check: 'element_exists', target: '#y' }] },
    ];
    let stop = false;
    const seen = [];
    await annotateSubtaskCompletion(results, subtasks, {
      gatherEvidence: async (c) => { seen.push(c.id); stop = true; return true; },
      shouldStop: () => stop,
      config: {},
    });
    expect(seen).toEqual(['a']);
    expect(results[0].completionNote).toContain('✅');
    expect(results[1].completionNote).toBeUndefined();
  });

  test('#8 buildCompletionNote：judge 未达标（missing 为空）走 ⚠️ 而非 ℹ️', () => {
    const note = buildCompletionNote({ verdict: VERDICTS.UNMET_PERMANENT, missing: [], reason: 'judge_unmet', criteria: [] });
    expect(note).toContain('⚠️');
    expect(note).toContain('评审');
  });
});

// M-new-2：取证从"整轮末尾"挪进 per-subtask onDone——验证单子任务即时取证原语。
// 关键不变式：就地写回同一个 r 引用（executeSubtasks 推入 results 的即此对象）。
describe('annotateOneSubtaskCompletion：单子任务即时取证（onDone 内调用）', () => {
  test('有 doneCriteria 且取证通过 → 就地写 verification + note，返回同一 r 引用', async () => {
    const r = { subtaskId: 's1', subtaskName: '登录', success: true, result: 'ok' };
    const subtasks = [{ id: 's1', doneCriteria: [{ id: 'a', check: 'element_exists', target: '#d' }] }];
    const out = await annotateOneSubtaskCompletion(r, subtasks, { gatherEvidence: async () => true, config: {} });
    expect(out).toBe(r);
    expect(r.verification.verdict).toBe(VERDICTS.SATISFIED);
    expect(r.completionNote).toContain('✅');
  });

  test('无 doneCriteria → 不取证、不写 note（仍返回 r）', async () => {
    let called = false;
    const r = { subtaskId: 's1', success: true };
    const out = await annotateOneSubtaskCompletion(r, [{ id: 's1' }], { gatherEvidence: async () => { called = true; return true; }, config: {} });
    expect(out).toBe(r);
    expect(called).toBe(false);
    expect(r.completionNote).toBeUndefined();
  });

  test('shouldStop 置位 → 早停不取证（#11/M-new-4 在单子任务粒度同样生效）', async () => {
    let called = false;
    const r = { subtaskId: 's1', success: true };
    await annotateOneSubtaskCompletion(r, [{ id: 's1', doneCriteria: [{ id: 'a', check: 'element_exists', target: '#x' }] }], { gatherEvidence: async () => { called = true; return true; }, shouldStop: () => true, config: {} });
    expect(called).toBe(false);
    expect(r.completionNote).toBeUndefined();
  });

  test('尽力而为：shouldStop/取证内部抛错绝不抛出到主循环（onDone 不可因校验而中断）', async () => {
    const r = { subtaskId: 's1', success: true };
    const subtasks = [{ id: 's1', doneCriteria: [{ id: 'a', check: 'element_exists', target: '#x' }] }];
    await expect(annotateOneSubtaskCompletion(r, subtasks, {
      gatherEvidence: async () => true, config: {}, shouldStop: () => { throw new Error('stop boom'); },
    })).resolves.toBe(r);
    expect(r.completionNote).toBeUndefined();
  });
});
