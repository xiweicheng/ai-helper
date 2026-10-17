// agent/test/unit/executor-timeout-policy.unit.test.js
// 命令超时策略纯函数：静默即杀 / 期内有输出才延长 / 总预算封顶 600s
// 运行：node --test agent/test/unit/executor-timeout-policy.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideTimeoutAction, MAX_TIMEOUT_EXTENSIONS, TOTAL_BUDGET_CAP_MS,
} from '../../src/executor.js';

describe('decideTimeoutAction', () => {
  test('静默命令（本预算期无输出）到期 → 直接杀，不延长', () => {
    const r = decideTimeoutAction({ outputInPeriod: false, extensions: 0, elapsedMs: 5000, baseTimeout: 5000 });
    assert.equal(r.action, 'kill');
  });

  test('期内有输出 → 延长一期，nextTimeoutMs = 剩余预算', () => {
    const r = decideTimeoutAction({ outputInPeriod: true, extensions: 0, elapsedMs: 5000, baseTimeout: 5000 });
    assert.equal(r.action, 'extend');
    assert.equal(r.extensions, 1);
    assert.equal(r.nextTimeoutMs, 5000); // 预算 10000 - 已用 5000
  });

  test(`延长次数达到上限 ${MAX_TIMEOUT_EXTENSIONS} → 即使活跃也终止`, () => {
    const r = decideTimeoutAction({ outputInPeriod: true, extensions: MAX_TIMEOUT_EXTENSIONS, elapsedMs: 30000, baseTimeout: 5000 });
    assert.equal(r.action, 'kill');
  });

  test('总预算触及 600s 封顶 → 不再延长（nextBudget 无法增长）', () => {
    const r = decideTimeoutAction({ outputInPeriod: true, extensions: 3, elapsedMs: TOTAL_BUDGET_CAP_MS, baseTimeout: 300000 });
    assert.equal(r.action, 'kill');
  });

  test('封顶边界：base=120000 第 4 次延长截到 600000，第 5 次增长为 0 → kill', () => {
    const extend4 = decideTimeoutAction({ outputInPeriod: true, extensions: 3, elapsedMs: 480000, baseTimeout: 120000 });
    assert.equal(extend4.action, 'extend');
    assert.equal(extend4.nextTimeoutMs, TOTAL_BUDGET_CAP_MS - 480000);
    const kill5 = decideTimeoutAction({ outputInPeriod: true, extensions: 4, elapsedMs: TOTAL_BUDGET_CAP_MS, baseTimeout: 120000 });
    assert.equal(kill5.action, 'kill');
  });
});
