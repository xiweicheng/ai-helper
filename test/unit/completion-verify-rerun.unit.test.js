// 完成度校验 Phase B B3：子任务内即时重跑回路与四闸门真值矩阵。
//
// 锁事：annotateOneSubtaskCompletion 在 config.rerunEnabled=true 且注入 rerun 回调时才进重跑回路，
// 四闸门（可重试∧有进展∧有预算∧未超次）任一为假即停，防振荡靠缺项集严格收缩 + maxRetryAttempts；
// rerunEnabled=false（缺省）走单趟 Phase A 分支——四闸门全 false、永不重跑、逐字节=Phase A。
// 每个闸门都要有 load-bearing 负向对照：关掉它就不重跑。
import { describe, test, expect } from 'vitest';
import { annotateOneSubtaskCompletion } from '../../src/background/completion-verifier.js';
import { VERDICTS } from '../../src/shared/completion-verdict.js';

// 逐轮消费 rounds 里的缺项集合模拟"取证现场随重跑变化"；rerun 回调推进轮次。
function harness(rounds, opts = {}) {
  const state = { passIndex: 0, rerunCalls: [] };
  const gatherEvidence = async (c) => {
    const miss = new Set(rounds[state.passIndex] || []);
    return { available: true, pass: !miss.has(c.id) };
  };
  const rerun = opts.rerunThrows
    ? async () => { throw new Error('rerun boom'); }
    : async (directive, verdict) => {
      state.rerunCalls.push({ directive, missing: (verdict.missing || []).slice().sort() });
      state.passIndex++;
    };
  const subtasks = [{ id: 's1', name: 'n', doneCriteria: [
    { id: 'a', check: 'element_exists', target: '#a' },
    { id: 'b', check: 'url_matches', target: '/b' },
  ] }];
  const r = { subtaskId: 's1', subtaskName: 'n', success: true, result: 'x' };
  return { state, r, subtasks, gatherEvidence, rerun };
}

describe('完成度校验 Phase B B3：重跑回路与四闸门真值矩阵', () => {
  test('rerunEnabled=false → 单趟标注、永不重跑（=Phase A）', async () => {
    const h = harness([['a', 'b'], ['a'], []]);
    await annotateOneSubtaskCompletion(h.r, h.subtasks, {
      gatherEvidence: h.gatherEvidence,
      config: { rerunEnabled: false, maxRetryAttempts: 5 },
      rerun: h.rerun,
    });
    expect(h.state.rerunCalls).toEqual([]);
    expect(h.state.passIndex).toBe(0); // 只取证一轮
    expect(h.r.verification.verdict).toBe(VERDICTS.UNMET_PERMANENT);
    expect(h.r.verification.rerun).toBe(false);
  });

  test('未注入 rerun 回调 → 即便 rerunEnabled=true 也不进回路（缺省=Phase A）', async () => {
    const h = harness([['a', 'b'], []]);
    await annotateOneSubtaskCompletion(h.r, h.subtasks, {
      gatherEvidence: h.gatherEvidence,
      config: { rerunEnabled: true, maxRetryAttempts: 5 },
    });
    expect(h.state.passIndex).toBe(0);
    expect(h.r.verification.verdict).toBe(VERDICTS.UNMET_PERMANENT);
  });

  test('缺项逐轮严格收缩 → 回灌 directive 重跑直至达标（闸门全过）', async () => {
    const h = harness([['a', 'b'], ['a'], []]);
    await annotateOneSubtaskCompletion(h.r, h.subtasks, {
      gatherEvidence: h.gatherEvidence,
      config: { rerunEnabled: true, maxRetryAttempts: 5 },
      rerun: h.rerun,
    });
    expect(h.state.rerunCalls.length).toBe(2);
    expect(h.state.rerunCalls[0].directive).toBeTruthy();
    expect(h.state.rerunCalls[0].missing).toEqual(['a', 'b']);
    expect(h.state.rerunCalls[1].missing).toEqual(['a']);
    expect(h.r.verification.verdict).toBe(VERDICTS.SATISFIED);
    expect(h.r.completionNote).toContain('✅');
  });

  test('缺项未严格收缩 → 停并把乐观 retryable 降级为永久未达标（防振荡）', async () => {
    const h = harness([['a', 'b'], ['a', 'b'], []]);
    await annotateOneSubtaskCompletion(h.r, h.subtasks, {
      gatherEvidence: h.gatherEvidence,
      config: { rerunEnabled: true, maxRetryAttempts: 5 }, // 次数仍宽裕，仅进度闸门应阻断
      rerun: h.rerun,
    });
    expect(h.state.rerunCalls.length).toBe(1); // 首轮允许一次重跑，二轮同集即停
    expect(h.r.verification.verdict).toBe(VERDICTS.UNMET_PERMANENT);
    expect(h.r.verification.reason).toBe('objective_no_progress');
  });

  test('闸门4：maxRetryAttempts=0 → 首次即永久未达标、从不重跑', async () => {
    const h = harness([['a', 'b'], []]);
    await annotateOneSubtaskCompletion(h.r, h.subtasks, {
      gatherEvidence: h.gatherEvidence,
      config: { rerunEnabled: true, maxRetryAttempts: 0 },
      rerun: h.rerun,
    });
    expect(h.state.rerunCalls).toEqual([]);
    expect(h.r.verification.verdict).toBe(VERDICTS.UNMET_PERMANENT);
  });

  test('闸门3：budgetLeft=false → 不重跑（load-bearing）', async () => {
    const h = harness([['a', 'b'], ['a'], []]);
    await annotateOneSubtaskCompletion(h.r, h.subtasks, {
      gatherEvidence: h.gatherEvidence,
      config: { rerunEnabled: true, maxRetryAttempts: 5 },
      budgetLeft: () => false,
      rerun: h.rerun,
    });
    expect(h.state.rerunCalls).toEqual([]);
    expect(h.r.verification.verdict).toBe(VERDICTS.UNMET_PERMANENT);
  });

  test('shouldStop 首轮前命中 → 完全不取证、不写 verification', async () => {
    const h = harness([['a', 'b']]);
    await annotateOneSubtaskCompletion(h.r, h.subtasks, {
      gatherEvidence: h.gatherEvidence,
      config: { rerunEnabled: true, maxRetryAttempts: 5 },
      shouldStop: () => true,
      rerun: h.rerun,
    });
    expect(h.state.passIndex).toBe(0);
    expect(h.r.verification).toBeUndefined();
  });

  test('rerun 回调抛异常 → fail-safe 吞掉、绝不让主循环 reject（保留上一轮 retryable 标注）', async () => {
    const h = harness([['a', 'b']], { rerunThrows: true });
    await expect(annotateOneSubtaskCompletion(h.r, h.subtasks, {
      gatherEvidence: h.gatherEvidence,
      config: { rerunEnabled: true, maxRetryAttempts: 5 },
      rerun: h.rerun,
    })).resolves.toBe(h.r);
    expect(h.r.verification.verdict).toBe(VERDICTS.UNMET_RETRYABLE); // pass0 已写回，异常不外溢
  });

  test('首轮即达标 → 不重跑', async () => {
    const h = harness([[]]);
    await annotateOneSubtaskCompletion(h.r, h.subtasks, {
      gatherEvidence: h.gatherEvidence,
      config: { rerunEnabled: true, maxRetryAttempts: 5 },
      rerun: h.rerun,
    });
    expect(h.state.rerunCalls).toEqual([]);
    expect(h.r.verification.verdict).toBe(VERDICTS.SATISFIED);
  });
});
