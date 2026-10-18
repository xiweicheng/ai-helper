// 完成度校验器 Phase 2：background 编排层守卫（注入取证器/评审器，不碰 react-loop）
// 锁住：normalize→async 取证→classifyVerdict 的串接、rerun 只在 unmet_retryable 为真、
// 纠正指令只在需要重跑时产出且点名缺项、取证器抛错 fail-safe、未知断言先被丢弃、
// objectiveChecksEnabled:false 时跳过客观断言退回 critic。开关关闭由调用方短路，不进本层。
import { describe, test, expect } from 'vitest';
import {
  verifySubtaskCompletion,
  buildMissingCriteriaDirective,
} from '../../src/background/completion-verifier.js';
import { VERDICTS } from '../../src/shared/completion-verdict.js';

const ALL_GATES = { failureRetryable: true, progressMade: true, budgetLeft: true, attemptsUnderLimit: true };

describe('verifySubtaskCompletion：客观断言路径', () => {
  test('全部取证 pass → satisfied，不重跑、无指令', async () => {
    const r = await verifySubtaskCompletion({
      doneCriteria: [{ check: 'element_exists', target: '#a' }, { check: 'url_matches', target: 'x' }],
      gatherEvidence: async () => true,
      gates: ALL_GATES,
      config: {},
    });
    expect(r.verdict).toBe(VERDICTS.SATISFIED);
    expect(r.rerun).toBe(false);
    expect(r.directive).toBeNull();
  });

  test('有缺项且四门全过 → unmet_retryable，rerun=true，指令只点名缺项', async () => {
    const r = await verifySubtaskCompletion({
      doneCriteria: [
        { id: 'c1', check: 'element_exists', target: '#submit' },
        { id: 'c2', check: 'element_exists', target: '#ok' },
      ],
      gatherEvidence: async (c) => c.id === 'c1',
      gates: ALL_GATES,
      config: {},
    });
    expect(r.verdict).toBe(VERDICTS.UNMET_RETRYABLE);
    expect(r.rerun).toBe(true);
    expect(r.missing).toEqual(['c2']);
    expect(r.directive).toContain('#ok');
    expect(r.directive).not.toContain('#submit'); // 已通过项不应被列入待补齐
  });

  test('有缺项但某门不过 → unmet_permanent，不重跑', async () => {
    const r = await verifySubtaskCompletion({
      doneCriteria: [{ id: 'c1', check: 'element_exists', target: '#a' }],
      gatherEvidence: async () => false,
      gates: { ...ALL_GATES, attemptsUnderLimit: false },
      config: {},
    });
    expect(r.verdict).toBe(VERDICTS.UNMET_PERMANENT);
    expect(r.rerun).toBe(false);
    expect(r.directive).toBeNull();
  });

  test('取证抛错 → 归取证不可用（indeterminate），不谎报未达标、不误判完成', async () => {
    const r = await verifySubtaskCompletion({
      doneCriteria: [{ id: 'c1', check: 'element_exists', target: '#a' }],
      gatherEvidence: async () => { throw new Error('工具不可用'); },
      gates: ALL_GATES,
      config: {},
    });
    expect(r.verdict).toBe(VERDICTS.INDETERMINATE);
    expect(r.reason).toBe('evidence_unavailable');
    expect(r.missing).toEqual([]);
    expect(r.rerun).toBe(false);
  });

  test('取证部分不可用（可用项全过）→ evidence_partial indeterminate，不盖 satisfied', async () => {
    const r = await verifySubtaskCompletion({
      doneCriteria: [
        { id: 'ok', check: 'element_exists', target: '#a' },
        { id: 'na', check: 'element_exists', target: '#b' },
      ],
      gatherEvidence: async (c) => (c.id === 'na' ? null : true),
      gates: ALL_GATES,
      config: {},
    });
    expect(r.verdict).toBe(VERDICTS.INDETERMINATE);
    expect(r.reason).toBe('evidence_partial');
  });

  test('未知断言类型在取证前被丢弃（fail-closed），取证器只收到合法项', async () => {
    const seen = [];
    const r = await verifySubtaskCompletion({
      doneCriteria: [
        { id: 'v', check: 'element_exists', target: '#a' },
        { id: 'x', check: 'vague_hope', target: 'b' },
      ],
      gatherEvidence: async (c) => { seen.push(c.id); return true; },
      gates: ALL_GATES,
      config: {},
    });
    expect(seen).toEqual(['v']);
    expect(r.verdict).toBe(VERDICTS.SATISFIED);
  });
});

describe('verifySubtaskCompletion：开放任务 critic 路径', () => {
  test('无合法断言 + judge 达标高置信 → satisfied，不取证', async () => {
    let evidenceCalled = false;
    const r = await verifySubtaskCompletion({
      doneCriteria: [],
      gatherEvidence: async () => { evidenceCalled = true; return false; },
      judge: async () => ({ goalMet: true, confidence: 0.9 }),
      gates: ALL_GATES,
      config: {},
    });
    expect(evidenceCalled).toBe(false);
    expect(r.verdict).toBe(VERDICTS.SATISFIED);
  });

  test('无断言 + judge 低置信 → indeterminate 且标记转用户，不自动重跑', async () => {
    const r = await verifySubtaskCompletion({
      doneCriteria: [],
      judge: async () => ({ goalMet: true, confidence: 0.3 }),
      gates: ALL_GATES,
      config: { lowConfidence: 0.6 },
    });
    expect(r.verdict).toBe(VERDICTS.INDETERMINATE);
    expect(r.reason).toBe('judge_low_conf');
    expect(r.rerun).toBe(false);
  });

  test('objectiveChecksEnabled:false → 跳过客观断言，即便有断言也走 critic', async () => {
    let evidenceCalled = false;
    const r = await verifySubtaskCompletion({
      doneCriteria: [{ id: 'c1', check: 'element_exists', target: '#a' }],
      gatherEvidence: async () => { evidenceCalled = true; return true; },
      judge: async () => ({ goalMet: true, confidence: 0.9 }),
      gates: ALL_GATES,
      config: { objectiveChecksEnabled: false },
    });
    expect(evidenceCalled).toBe(false);
    expect(r.verdict).toBe(VERDICTS.SATISFIED);
    expect(r.reason).toBe('judge_met');
  });
});

describe('buildMissingCriteriaDirective：纯文本纠正指令', () => {
  test('只点名未通过的缺项，含 check 与 target', () => {
    const criteria = [
      { id: 'a', check: 'element_exists', target: '#go' },
      { id: 'b', check: 'url_matches', target: 'home' },
    ];
    const checkResults = [{ id: 'a', pass: true }, { id: 'b', pass: false }];
    const d = buildMissingCriteriaDirective(criteria, checkResults);
    expect(d).toContain('url_matches');
    expect(d).toContain('home');
    expect(d).not.toContain('#go'); // 已通过项不应被列入待补齐
  });
});
