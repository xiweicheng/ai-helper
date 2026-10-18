// 完成度校验器 Phase 1：纯判定模块守卫（零 DOM、零工具调用）
// 锁住三态判定、回炉三门（有进展∧有预算∧未超次）AND 语义、无断言→critic 兜底、
// 以及 doneCriteria 归一对未知断言类型 fail-closed（不认识的断言绝不放行）。
import { describe, test, expect } from 'vitest';
import {
  OBJECTIVE_CHECK_TYPES,
  VERDICTS,
  normalizeDoneCriteria,
  evalObjectiveChecks,
  classifyVerdict,
} from '../../src/shared/completion-verdict.js';

describe('normalizeDoneCriteria：归一 + 未知类型 fail-closed', () => {
  test('保留合法断言并补默认 id', () => {
    const out = normalizeDoneCriteria([{ check: 'element_exists', target: '#submit' }]);
    expect(out).toHaveLength(1);
    expect(out[0].check).toBe('element_exists');
    expect(out[0].target).toBe('#submit');
    expect(out[0].id).toBeTruthy();
  });

  test('丢弃未知 check 类型（fail-closed）', () => {
    const out = normalizeDoneCriteria([
      { check: 'element_exists', target: 'a' },
      { check: 'vague_hope', target: 'b' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].check).toBe('element_exists');
  });

  test('非数组 / null 项 / 非对象项一律安全丢弃', () => {
    expect(normalizeDoneCriteria(undefined)).toEqual([]);
    expect(normalizeDoneCriteria('nope')).toEqual([]);
    expect(normalizeDoneCriteria([null, 3, {}, { check: '' }])).toEqual([]);
  });

  test('check 类型全在声明集合内', () => {
    expect(OBJECTIVE_CHECK_TYPES).toContain('element_exists');
    expect(OBJECTIVE_CHECK_TYPES).toContain('url_matches');
  });

  test('#7 超长 id/target/expected 被截断到上限（防注入撑爆上下文）', () => {
    const long = 'x'.repeat(500);
    const out = normalizeDoneCriteria([{ check: 'element_exists', id: long, target: long, expected: long }]);
    expect(out[0].id.length).toBeLessThanOrEqual(200);
    expect(out[0].target.length).toBe(200);
    expect(out[0].expected.length).toBe(200);
  });
});

describe('evalObjectiveChecks：注入取证器，纯归约', () => {
  test('按注入的 evaluate 结果给每条打 pass', () => {
    const crit = normalizeDoneCriteria([
      { id: 'c1', check: 'element_exists', target: 'a' },
      { id: 'c2', check: 'element_exists', target: 'b' },
    ]);
    const results = evalObjectiveChecks(crit, (c) => c.target === 'a');
    expect(results.find(r => r.id === 'c1').pass).toBe(true);
    expect(results.find(r => r.id === 'c2').pass).toBe(false);
  });
});

describe('classifyVerdict：有客观断言时的判定', () => {
  test('全部 pass → satisfied', () => {
    const v = classifyVerdict({ checkResults: [{ id: 'a', pass: true }, { id: 'b', pass: true }] });
    expect(v.verdict).toBe(VERDICTS.SATISFIED);
    expect(v.missing).toEqual([]);
  });

  test('有 fail 且三门全过 → unmet_retryable 且带缺项', () => {
    const v = classifyVerdict({
      checkResults: [{ id: 'a', pass: true }, { id: 'b', pass: false }],
      failureRetryable: true, progressMade: true, budgetLeft: true, attemptsUnderLimit: true,
    });
    expect(v.verdict).toBe(VERDICTS.UNMET_RETRYABLE);
    expect(v.missing).toEqual(['b']);
  });

  // 负向对照：三门缺一即不得重跑（防无限回炉的核心闸门）
  test.each([
    ['不可重试', { failureRetryable: false, progressMade: true, budgetLeft: true, attemptsUnderLimit: true }],
    ['无进展', { failureRetryable: true, progressMade: false, budgetLeft: true, attemptsUnderLimit: true }],
    ['超预算', { failureRetryable: true, progressMade: true, budgetLeft: false, attemptsUnderLimit: true }],
    ['超次数', { failureRetryable: true, progressMade: true, budgetLeft: true, attemptsUnderLimit: false }],
  ])('有 fail 但 %s → unmet_permanent（不重跑）', (_label, gates) => {
    const v = classifyVerdict({ checkResults: [{ id: 'b', pass: false }], ...gates });
    expect(v.verdict).toBe(VERDICTS.UNMET_PERMANENT);
  });

  // M3 三态：available===false 表示取不到证，既不计缺项也不盖 satisfied
  test('全部不可用 → indeterminate(evidence_unavailable)，不谎报未达标', () => {
    const v = classifyVerdict({ checkResults: [{ id: 'a', pass: false, available: false }] });
    expect(v.verdict).toBe(VERDICTS.INDETERMINATE);
    expect(v.reason).toBe('evidence_unavailable');
    expect(v.missing).toEqual([]);
  });

  test('可用项全过但尚有不可用项 → indeterminate(evidence_partial)，不误盖 satisfied', () => {
    const v = classifyVerdict({
      checkResults: [{ id: 'a', pass: true, available: true }, { id: 'b', pass: false, available: false }],
    });
    expect(v.verdict).toBe(VERDICTS.INDETERMINATE);
    expect(v.reason).toBe('evidence_partial');
  });

  test('可用项有真未达标 → 仍按缺项判 unmet（available=false 项不混入 missing）', () => {
    const v = classifyVerdict({
      checkResults: [
        { id: 'x', pass: false, available: true },
        { id: 'y', pass: false, available: false },
      ],
    });
    expect(v.missing).toEqual(['x']);
  });
});

describe('classifyVerdict：无客观断言（开放任务）走 critic 兜底', () => {
  test('无断言且无 judge → indeterminate', () => {
    expect(classifyVerdict({ checkResults: [] }).verdict).toBe(VERDICTS.INDETERMINATE);
  });

  test('judge goalMet 且置信达标 → satisfied', () => {
    const v = classifyVerdict({ checkResults: [], judge: { goalMet: true, confidence: 0.8 } });
    expect(v.verdict).toBe(VERDICTS.SATISFIED);
  });

  test('judge 低置信 → indeterminate 且 reason 标记应转用户', () => {
    const v = classifyVerdict({ checkResults: [], judge: { goalMet: false, confidence: 0.2 }, lowConfidence: 0.5 });
    expect(v.verdict).toBe(VERDICTS.INDETERMINATE);
    expect(v.reason).toBe('judge_low_conf');
  });

  // m-new-1：goalMet 缺失（典型于模型 JSON 解析不全）不能当成"确证未达标"，须归无法判定
  test('m-new-1 judge 只给置信、缺 goalMet → indeterminate judge_no_signal（不把"没评"当"确证未达"）', () => {
    const v = classifyVerdict({ checkResults: [], judge: { confidence: 0.9 } });
    expect(v.verdict).toBe(VERDICTS.INDETERMINATE);
    expect(v.reason).toBe('judge_no_signal');
  });

  test('judge 未达标但置信够 → unmet（不再降级为 indeterminate），高置信无闸门→permanent', () => {
    const v = classifyVerdict({ checkResults: [], judge: { goalMet: false, confidence: 0.9 } });
    expect(v.verdict).toBe(VERDICTS.UNMET_PERMANENT);
    expect(v.reason).toBe('judge_unmet');
  });

  test('judge 未达标高置信且四闸门全过 → unmet_retryable', () => {
    const v = classifyVerdict({
      checkResults: [],
      judge: { goalMet: false, confidence: 0.9 },
      failureRetryable: true, progressMade: true, budgetLeft: true, attemptsUnderLimit: true,
    });
    expect(v.verdict).toBe(VERDICTS.UNMET_RETRYABLE);
    expect(v.reason).toBe('judge_unmet');
  });
});
