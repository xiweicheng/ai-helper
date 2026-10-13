/**
 * memory-injection.unit.test.js（agent 端）
 * 记忆分级注入策略测试（自扩展端 test/unit/memory-injection.unit.test.js 迁移，行为不变）：
 * - calcMemoryValue 价值计算（从 tool-memory.js 迁移，行为不变）
 * - selectMemoriesForInjection 三级筛选（Tier1 常驻 / Tier2 预算内 / Tier3 按需召回）
 * 注：原文件末尾的"接线守卫（源码断言）"块针对扩展端接线，已由扩展端转发层测试承接，不再随迁。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcMemoryValue,
  selectMemoriesForInjection,
  MEMORY_INJECTION_CONFIG,
} from '../../src/memory/injection.js';

const DAY = 24 * 60 * 60 * 1000;
// 固定 now 保证时间衰减计算确定性
const NOW = Date.parse('2026-10-10T12:00:00.000Z');

// vitest toBeCloseTo(expected, 5) 等价：|diff| < 0.5 × 10⁻⁵
function assertCloseTo(actual, expected, eps = 5e-6) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} ≈ ${expected}`);
}

// 预算测试用小配置，避免依赖默认可调参数
const TEST_CONFIG = {
  alwaysInjectImportance: 8,
  budgetChars: 300,
  budgetCount: 3,
  itemOverheadChars: 20,
  maxTopicTags: 3,
  maxTagLength: 6,
};

let seq = 0;
function makeMemory(overrides = {}) {
  return {
    id: overrides.id || `fact_${seq++}`,
    type: 'fact',
    category: 'custom',
    content: '默认内容',
    tags: [],
    importance: 5,
    accessCount: 0,
    lastAccessAt: null,
    createdAt: new Date(NOW - DAY).toISOString(), // 1 天前 → decay 1.0
    ...overrides,
  };
}

describe('calcMemoryValue：价值计算（迁移自 tool-memory.js，行为不变）', () => {
  it('新记忆无访问：importance × 1 × 1.0', () => {
    const m = makeMemory({ importance: 5, accessCount: 0 });
    assertCloseTo(calcMemoryValue(m, NOW), 5);
  });

  it('访问次数加成：1 + ln(access + 1)', () => {
    const m = makeMemory({ importance: 5, accessCount: 9 });
    // 5 × (1 + ln(10)) ≈ 16.5129
    assertCloseTo(calcMemoryValue(m, NOW), 16.512925, 5e-5);
  });

  it('时间衰减：>30 天 0.5，>90 天 0.2', () => {
    const m40 = makeMemory({ importance: 8, createdAt: new Date(NOW - 40 * DAY).toISOString() });
    const m100 = makeMemory({ importance: 8, createdAt: new Date(NOW - 100 * DAY).toISOString() });
    assertCloseTo(calcMemoryValue(m40, NOW), 4);
    assertCloseTo(calcMemoryValue(m100, NOW), 1.6);
  });

  it('importance 缺失时按默认 5 处理', () => {
    const m = makeMemory({ importance: undefined });
    assertCloseTo(calcMemoryValue(m, NOW), 5);
  });
});

describe('selectMemoriesForInjection：三级筛选', () => {
  it('Tier1（importance≥8）全部注入且不占预算', () => {
    // 3 条 8 分（大内容）+ 5 条 7 分小记忆；budgetChars 小到装不下任何 8 分条目
    const facts = [
      makeMemory({ id: 't1a', importance: 8, content: '甲'.repeat(100) }),
      makeMemory({ id: 't1b', importance: 8, content: '乙'.repeat(100) }),
      makeMemory({ id: 't1c', importance: 8, content: '丙'.repeat(100) }),
      makeMemory({ id: 'r1', importance: 7, content: '小1' }),
      makeMemory({ id: 'r2', importance: 7, content: '小2' }),
      makeMemory({ id: 'r3', importance: 7, content: '小3' }),
      makeMemory({ id: 'r4', importance: 7, content: '小4' }),
      makeMemory({ id: 'r5', importance: 7, content: '小5' }),
    ];
    const { injected } = selectMemoriesForInjection(facts, [], TEST_CONFIG, NOW);
    const ids = injected.map(m => m.id);
    // 8 分三条全在（若 Tier1 占预算，至少一条会被挤掉）
    assert.ok(ids.includes('t1a'));
    assert.ok(ids.includes('t1b'));
    assert.ok(ids.includes('t1c'));
    // Tier2 预算 300 字符、3 条：小记忆（cost 2+20=22）应装满 3 条
    assert.strictEqual(injected.length, 6);
  });

  it('Tier1 内部按价值降序（访问多的在前）', () => {
    const facts = [
      makeMemory({ id: 'cold', importance: 8, accessCount: 0 }),
      makeMemory({ id: 'hot', importance: 8, accessCount: 20 }),
    ];
    const { injected } = selectMemoriesForInjection(facts, [], TEST_CONFIG, NOW);
    assert.strictEqual(injected[0].id, 'hot');
  });

  it('Tier2 按价值降序：6 分高访问可排在 7 分零访问之前', () => {
    const facts = [
      makeMemory({ id: 'i7', importance: 7, accessCount: 0 }),
      makeMemory({ id: 'i6', importance: 6, accessCount: 10 }), // 6×(1+ln11)≈20.4 > 7
    ];
    const { injected } = selectMemoriesForInjection(facts, [], { ...TEST_CONFIG, budgetCount: 10 }, NOW);
    assert.deepStrictEqual(injected.map(m => m.id), ['i6', 'i7']);
  });

  it('字符预算：装不下的条目跳过，继续尝试后续小条目（continue 而非 break）', () => {
    const facts = [
      makeMemory({ id: 'big', importance: 7, content: '大'.repeat(250) }), // cost 270 > 70 跳过
      makeMemory({ id: 's1', importance: 7, content: '小1' }), // cost 2+20=22
      makeMemory({ id: 's2', importance: 7, content: '小2' }),
      makeMemory({ id: 's3', importance: 7, content: '小3' }),
      makeMemory({ id: 's4', importance: 7, content: '小4' }), // 累计 88 > 70 被拒
    ];
    const cfg = { ...TEST_CONFIG, budgetChars: 70, budgetCount: 10 };
    const { injected } = selectMemoriesForInjection(facts, [], cfg, NOW);
    const ids = injected.map(m => m.id);
    assert.ok(!ids.includes('big'));
    assert.deepStrictEqual(ids, ['s1', 's2', 's3']);
  });

  it('条数预算：超过 budgetCount 后停止', () => {
    const facts = Array.from({ length: 10 }, (_, i) =>
      makeMemory({ id: `n${i}`, importance: 5, content: '短' }));
    const { injected } = selectMemoriesForInjection(facts, [], TEST_CONFIG, NOW);
    assert.strictEqual(injected.length, TEST_CONFIG.budgetCount);
  });

  it('价值相同时保持数组原顺序（稳定排序）', () => {
    const facts = [
      makeMemory({ id: 'x1', importance: 5, content: '同' }),
      makeMemory({ id: 'x2', importance: 5, content: '同' }),
      makeMemory({ id: 'x3', importance: 5, content: '同' }),
    ];
    const { injected } = selectMemoriesForInjection(facts, [], { ...TEST_CONFIG, budgetCount: 2 }, NOW);
    assert.deepStrictEqual(injected.map(m => m.id), ['x1', 'x2']);
  });

  it('记忆少（预算内）时全量注入，无剩余', () => {
    const facts = [
      makeMemory({ id: 'a', importance: 7, content: '短' }),
      makeMemory({ id: 'b', importance: 6, content: '短' }),
    ];
    const { injected, remainingCount, remainingTags } = selectMemoriesForInjection(facts, [], TEST_CONFIG, NOW);
    assert.strictEqual(injected.length, 2);
    assert.strictEqual(remainingCount, 0);
    assert.deepStrictEqual(remainingTags, []);
  });

  it('remainingCount = 未注入 facts + summaries 总数', () => {
    const facts = Array.from({ length: 5 }, (_, i) =>
      makeMemory({ id: `f${i}`, importance: 5, content: '短' }));
    const summaries = Array.from({ length: 4 }, (_, i) =>
      makeMemory({ id: `s${i}`, type: 'summary', importance: 9, content: '摘要' }));
    const { injected, remainingCount } = selectMemoriesForInjection(facts, summaries, TEST_CONFIG, NOW);
    assert.strictEqual(injected.length, 3); // budgetCount=3
    assert.strictEqual(remainingCount, 2 + 4);
  });

  it('summaries 永不注入（只计入按需召回）', () => {
    const summaries = [makeMemory({ id: 's1', type: 'summary', importance: 10, content: '摘要内容' })];
    const { injected } = selectMemoriesForInjection([], summaries, TEST_CONFIG, NOW);
    assert.deepStrictEqual(injected, []);
  });

  it('remainingTags：去重 + 频率降序 + 同频按首现顺序 + 数量与长度截断', () => {
    // 未注入的 facts（budgetCount=0 全排除）+ summaries 共同贡献标签
    const facts = [
      makeMemory({ id: 'a', importance: 5, tags: ['超长标签超过六字', 'Vue'] }),
      makeMemory({ id: 'b', importance: 5, tags: ['超长标签超过六字', '发布流程'] }),
    ];
    const summaries = [
      makeMemory({ id: 's1', type: 'summary', tags: ['Vue', '超长标签超过六字'] }),
      makeMemory({ id: 's2', type: 'summary', tags: ['Vue'] }),
    ];
    const cfg = { ...TEST_CONFIG, budgetCount: 0 };
    const { remainingTags } = selectMemoriesForInjection(facts, summaries, cfg, NOW);
    // 频率：超长标签=3(首现0), Vue=3(首现1), 发布流程=1 → 前 3；超长标签截断为 6 字
    assert.deepStrictEqual(remainingTags, ['超长标签超过', 'Vue', '发布流程']);
  });

  it('importance 缺失按 5 处理：不进 Tier1，走 Tier2', () => {
    const facts = [makeMemory({ id: 'noimp', importance: undefined, content: '短' })];
    const { injected } = selectMemoriesForInjection(facts, [], { ...TEST_CONFIG, budgetCount: 0 }, NOW);
    assert.deepStrictEqual(injected, []);
  });

  it('不修改入参数组（排序在副本上进行）', () => {
    const facts = [
      makeMemory({ id: 'c', importance: 3 }),
      makeMemory({ id: 'a', importance: 9 }),
      makeMemory({ id: 'b', importance: 1 }),
    ];
    selectMemoriesForInjection(facts, [], TEST_CONFIG, NOW);
    assert.deepStrictEqual(facts.map(m => m.id), ['c', 'a', 'b']);
  });

  it('非数组输入防御：不抛错，返回空选择', () => {
    const result = selectMemoriesForInjection(null, undefined, TEST_CONFIG, NOW);
    assert.deepStrictEqual(result.injected, []);
    assert.strictEqual(result.remainingCount, 0);
    assert.deepStrictEqual(result.remainingTags, []);
  });

  it('默认配置符合定稿参数：常驻阈值 8 / 预算 1500 字符 + 12 条', () => {
    assert.strictEqual(MEMORY_INJECTION_CONFIG.alwaysInjectImportance, 8);
    assert.strictEqual(MEMORY_INJECTION_CONFIG.budgetChars, 1500);
    assert.strictEqual(MEMORY_INJECTION_CONFIG.budgetCount, 12);
  });
});
