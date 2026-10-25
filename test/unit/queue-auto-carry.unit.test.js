// queue-auto-carry.unit.test.js - 「自动顺带」判定决策表
//
// 这一层的错误都很安静：带多了会把队列一口气倒进上下文、挤掉原任务；
// 带少了（或一次都不带）用户只会以为功能没做。所以逐格锁死。
import { describe, test, expect } from 'vitest';
import {
  AUTO_CARRY_MIN_ITERATION,
  AUTO_CARRY_MAX_PER_CALL,
  AUTO_CARRY_DEFAULT_EVERY_N,
  AUTO_CARRY_MAX_EVERY_N,
  normalizeEveryN,
  createAutoCarryTracker,
  peakIteration,
  evaluateAutoCarry,
} from '../../src/side_panel/queue-auto-carry.js';

describe('peakIteration：一轮里多条更新取最大迭代号', () => {
  test('空日志 / 非数组 → 0', () => {
    expect(peakIteration([])).toBe(0);
    expect(peakIteration(null)).toBe(0);
    expect(peakIteration(undefined)).toBe(0);
  });

  test('取最大值，坏值忽略', () => {
    expect(peakIteration([
      { iteration: 2 },
      { iteration: 5 },
      { iteration: 'x' },
      null,
      { iteration: 3 },
    ])).toBe(5);
  });

  test('没有 iteration 字段的条目（如收尾节点）→ 0，不会误判成第 0 轮可携带', () => {
    expect(peakIteration([{ nodeType: 'api_call' }])).toBe(0);
  });
});

describe('normalizeEveryN：配置越界/脏值都能落地', () => {
  test('默认值', () => {
    expect(normalizeEveryN(undefined)).toBe(AUTO_CARRY_DEFAULT_EVERY_N);
    expect(normalizeEveryN(null)).toBe(AUTO_CARRY_DEFAULT_EVERY_N);
    expect(normalizeEveryN('abc')).toBe(AUTO_CARRY_DEFAULT_EVERY_N);
  });

  test('字符串数字照收（storage 里常见）', () => {
    expect(normalizeEveryN('5')).toBe(5);
    expect(normalizeEveryN('2.6')).toBe(3);
  });

  test('0 / 负数回落默认，过大夹到上限', () => {
    expect(normalizeEveryN(0)).toBe(AUTO_CARRY_DEFAULT_EVERY_N);
    expect(normalizeEveryN(-3)).toBe(AUTO_CARRY_DEFAULT_EVERY_N);
    expect(normalizeEveryN(999)).toBe(AUTO_CARRY_MAX_EVERY_N);
  });
});

describe('evaluateAutoCarry：四条门槛', () => {
  test('第 1 轮不携带（too_early），且不吃掉配额', () => {
    const r = evaluateAutoCarry({ iteration: 1, everyN: 3 });
    expect(r.carry).toBe(false);
    expect(r.reason).toBe('too_early');
    expect(r.tracker.carried).toBe(0);
    expect(r.tracker.lastIteration).toBe(null);
  });

  test('第 2 轮首次携带', () => {
    const r = evaluateAutoCarry({ iteration: AUTO_CARRY_MIN_ITERATION, everyN: 3 });
    expect(r.carry).toBe(true);
    expect(r.tracker.carried).toBe(1);
    expect(r.tracker.lastIteration).toBe(2);
  });

  test('距上次携带不足 N 轮不携带（interval_not_reached）', () => {
    const tracker = { callId: 'c1', carried: 1, lastIteration: 2 };
    for (const iteration of [3, 4]) {
      const r = evaluateAutoCarry({ tracker, iteration, everyN: 3, callId: 'c1' });
      expect(r.carry).toBe(false);
      expect(r.reason).toBe('interval_not_reached');
      expect(r.tracker.lastIteration).toBe(2);   // 不推进，下一次仍按 2 计算
    }
    expect(evaluateAutoCarry({ tracker, iteration: 5, everyN: 3, callId: 'c1' }).carry).toBe(true);
  });

  test('每个 callId 最多 3 条（call_limit）', () => {
    const tracker = { callId: 'c1', carried: AUTO_CARRY_MAX_PER_CALL, lastIteration: 2 };
    const r = evaluateAutoCarry({ tracker, iteration: 99, everyN: 1, callId: 'c1' });
    expect(r.carry).toBe(false);
    expect(r.reason).toBe('call_limit');
  });

  test('无候选条目时不携带，也不推进记账', () => {
    const tracker = { callId: 'c1', carried: 1, lastIteration: 2 };
    const r = evaluateAutoCarry({ tracker, iteration: 8, everyN: 3, callId: 'c1', hasCandidate: false });
    expect(r.carry).toBe(false);
    expect(r.reason).toBe('no_candidate');
    expect(r.tracker).toEqual(tracker);
  });

  test('开关关闭后一条都不带（tracker 原样保留）', () => {
    const tracker = { callId: 'c1', carried: 2, lastIteration: 5 };
    const r = evaluateAutoCarry({ tracker, iteration: 50, everyN: 3, callId: 'c1', enabled: false });
    expect(r.carry).toBe(false);
    expect(r.reason).toBe('disabled');
    expect(r.tracker).toEqual(tracker);
  });

  test('非法迭代号 → invalid_iteration', () => {
    expect(evaluateAutoCarry({ iteration: 0 }).reason).toBe('invalid_iteration');
    expect(evaluateAutoCarry({ iteration: null }).reason).toBe('invalid_iteration');
    expect(evaluateAutoCarry({}).reason).toBe('invalid_iteration');
  });
});

describe('evaluateAutoCarry：换轮清零', () => {
  test('callId 变了 → 配额与上次轮次都清零，新任务第 2 轮照常携带', () => {
    const tracker = { callId: 'old', carried: AUTO_CARRY_MAX_PER_CALL, lastIteration: 40 };
    const r = evaluateAutoCarry({ tracker, iteration: 2, everyN: 3, callId: 'new' });
    expect(r.carry).toBe(true);
    expect(r.tracker).toEqual({ callId: 'new', carried: 1, lastIteration: 2 });
  });

  test('迭代号倒退（同一 callId 重新数）也当成新任务', () => {
    const tracker = { callId: 'c1', carried: 3, lastIteration: 30 };
    const r = evaluateAutoCarry({ tracker, iteration: 2, everyN: 3, callId: 'c1' });
    expect(r.carry).toBe(true);
    expect(r.tracker.carried).toBe(1);
  });

  test('消息没带 callId 时不清零（不能凭空重置配额）', () => {
    const tracker = { callId: 'c1', carried: 3, lastIteration: 30 };
    const r = evaluateAutoCarry({ tracker, iteration: 31, everyN: 3 });
    expect(r.carry).toBe(false);
    expect(r.reason).toBe('call_limit');
  });
});

describe('evaluateAutoCarry：不改入参（纯函数）', () => {
  test('传入的 tracker 对象不会被就地修改', () => {
    const tracker = createAutoCarryTracker();
    const snapshot = JSON.parse(JSON.stringify(tracker));
    evaluateAutoCarry({ tracker, iteration: 2, everyN: 3, callId: 'c1' });
    expect(tracker).toEqual(snapshot);
  });
});

describe('整段任务模拟：默认每 3 轮一条，最多 3 条', () => {
  test('12 轮里只在第 2/5/8 轮携带，之后不再带', () => {
    const carriedAt = [];
    let tracker = createAutoCarryTracker();
    for (let iteration = 1; iteration <= 12; iteration++) {
      const r = evaluateAutoCarry({ tracker, iteration, everyN: 3, callId: 'call_1' });
      tracker = r.tracker;
      if (r.carry) carriedAt.push(iteration);
    }
    expect(carriedAt).toEqual([2, 5, 8]);
    expect(carriedAt.length).toBe(AUTO_CARRY_MAX_PER_CALL);
  });
});
