// context-usage 单元测试：发送历史选择 / 占用计算 / 摘要注入（纯函数，node 环境）
import { describe, test, expect } from 'vitest';
import {
  selectHistoryForSend,
  computeContextUsage,
  appendCompactionToSystemPrompt,
  assembleCompactionMaterial,
  HISTORY_BUDGET_RATIO,
  SAFETY_MARGIN,
} from '../../src/shared/context-usage.js';

// 构造 n 条历史消息（id 从 startId 递增）
function makeHistory(n, startId = 1) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const idNum = startId + i;
    arr.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `这是第${idNum}条消息的内容，用于测试`,
      messageId: `m${idNum}`,
    });
  }
  return arr;
}

const current = { role: 'user', content: '当前输入' };
const compactionAt50 = { summary: 'S1旧摘要内容', upToMessageId: 'm50', compressedCount: 50 };

describe('selectHistoryForSend - 记忆层', () => {
  test('记忆关闭时仅返回当前消息', () => {
    const r = selectHistoryForSend(makeHistory(5), { isolateChat: false, currentMessage: current });
    expect(r.messages).toEqual([current]);
    expect(r.keptHistory).toEqual([]);
    expect(r.compactionApplied).toBe(false);
    expect(r.trimmedCount).toBe(0);
    expect(r.historySummaryText).toBeNull();
  });
});

describe('selectHistoryForSend - 窗口层', () => {
  test('无限制时全部保留', () => {
    const r = selectHistoryForSend(makeHistory(76), { isolateChat: true, currentMessage: current });
    expect(r.keptHistory.length).toBe(76);
    expect(r.keptHistory[0].messageId).toBe('m1');
  });

  test('条数限制取最近 N 条（spec 示例：76 条带 10）', () => {
    const r = selectHistoryForSend(makeHistory(76), { isolateChat: true, maxMemoryMessages: 10, currentMessage: current });
    expect(r.keptHistory.length).toBe(10);
    expect(r.keptHistory[0].messageId).toBe('m67');
    expect(r.keptHistory[9].messageId).toBe('m76');
  });
});

describe('selectHistoryForSend - 压缩层', () => {
  test('压缩生效（全部携带）：压缩点后的消息才参与发送', () => {
    const r = selectHistoryForSend(makeHistory(76), { isolateChat: true, compaction: compactionAt50, currentMessage: current });
    expect(r.compactionApplied).toBe(true);
    expect(r.keptHistory.length).toBe(26);
    expect(r.keptHistory[0].messageId).toBe('m51');
    expect(r.keptHistory[25].messageId).toBe('m76');
  });

  test('压缩生效 + 条数 10：窗口已在压缩点后（spec 示例：窗口滑过压缩点）', () => {
    const r = selectHistoryForSend(makeHistory(76), { isolateChat: true, maxMemoryMessages: 10, compaction: compactionAt50, currentMessage: current });
    expect(r.compactionApplied).toBe(true);
    expect(r.keptHistory.length).toBe(10);
    expect(r.keptHistory[0].messageId).toBe('m67');
  });

  test('压缩点失效（upToMessageId 不存在）：忽略压缩，正常返回', () => {
    const invalid = { summary: 'S', upToMessageId: 'm999', compressedCount: 50 };
    const r = selectHistoryForSend(makeHistory(76), { isolateChat: true, compaction: invalid, currentMessage: current });
    expect(r.compactionApplied).toBe(false);
    expect(r.keptHistory.length).toBe(76);
  });

  test('窗口完全位于压缩点之前：历史为空，仅当前消息', () => {
    const compactionAt76 = { summary: 'S', upToMessageId: 'm76', compressedCount: 76 };
    const r = selectHistoryForSend(makeHistory(76), { isolateChat: true, compaction: compactionAt76, currentMessage: current });
    expect(r.compactionApplied).toBe(true);
    expect(r.keptHistory.length).toBe(0);
    expect(r.messages).toEqual([current]);
  });
});

describe('selectHistoryForSend - 预算层', () => {
  test('预算不足时从后往前保留并生成规则摘要', () => {
    const r = selectHistoryForSend(makeHistory(30), {
      isolateChat: true,
      historyBudget: 120,
      currentMessage: current,
    });
    expect(r.keptHistory.length).toBeGreaterThan(0);
    expect(r.keptHistory.length).toBeLessThan(30);
    expect(r.trimmedCount).toBe(30 - r.keptHistory.length);
    expect(typeof r.historySummaryText).toBe('string');
    expect(r.historySummaryText.length).toBeGreaterThan(0);
    // 保留的必须是最近的（尾部）
    expect(r.keptHistory[r.keptHistory.length - 1].messageId).toBe('m30');
    expect(r.messages[r.messages.length - 1]).toEqual(current);
  });

  test('预算充足时不裁剪、无摘要', () => {
    const r = selectHistoryForSend(makeHistory(5), { isolateChat: true, historyBudget: 100000, currentMessage: current });
    expect(r.trimmedCount).toBe(0);
    expect(r.historySummaryText).toBeNull();
  });
});

describe('appendCompactionToSystemPrompt', () => {
  test('无压缩对象时原样返回', () => {
    expect(appendCompactionToSystemPrompt('SYS', null)).toBe('SYS');
    expect(appendCompactionToSystemPrompt('SYS', {})).toBe('SYS');
  });

  test('有效压缩时追加摘要段', () => {
    const out = appendCompactionToSystemPrompt('SYS', compactionAt50);
    expect(out.startsWith('SYS')).toBe(true);
    expect(out).toContain('S1旧摘要内容');
  });
});

describe('computeContextUsage', () => {
  test('分解字段与合计一致、安全档位', () => {
    const usage = computeContextUsage({
      model: 'test-model',
      systemPromptText: '这是一个测试系统提示词',
      toolCount: 3,
      history: makeHistory(10),
      inputText: '你好',
      maxMemoryMessages: null,
      compaction: null,
      isolateChat: true,
    });
    expect(usage.contextWindow).toBeGreaterThan(0);
    expect(usage.breakdown.tools).toBe(600);
    expect(usage.breakdown.system).toBeGreaterThan(0);
    expect(usage.breakdown.history).toBeGreaterThan(0);
    expect(usage.breakdown.input).toBeGreaterThan(0);
    expect(usage.usedTokens).toBe(
      usage.breakdown.system + usage.breakdown.tools + usage.breakdown.history + usage.breakdown.input
    );
    expect(usage.level).toBe('safe');
    expect(usage.ratio).toBeCloseTo(usage.usedTokens / usage.contextWindow, 8);
  });

  test('预算口径与发送路径一致（窗口 - system - 4096 - 2000，再 ×0.7）', () => {
    const usage = computeContextUsage({
      model: 'test-model',
      systemPromptText: 'SYS',
      toolCount: 0,
      history: [],
      inputText: '',
      isolateChat: true,
    });
    const expectedBudget = Math.floor(
      Math.max(usage.contextWindow - usage.breakdown.system - 4096 - SAFETY_MARGIN, 0) * HISTORY_BUDGET_RATIO
    );
    expect(usage.breakdown.historyBudget).toBe(expectedBudget);
  });

  test('记忆关闭时历史不计入（即使有历史）', () => {
    const usage = computeContextUsage({
      model: 'test-model',
      systemPromptText: 'SYS',
      toolCount: 0,
      history: makeHistory(50),
      inputText: 'hi',
      isolateChat: false,
    });
    expect(usage.breakdown.history).toBe(0);
    expect(usage.breakdown.selectedCount).toBe(0);
  });

  test('高占用时进入 critical 档位', () => {
    // 用一个极大 systemPromptText 撑高超限（中文约 1.5 字符/token）
    const huge = '压'.repeat(600000);
    const usage = computeContextUsage({
      model: 'test-model',
      systemPromptText: huge,
      toolCount: 0,
      history: [],
      inputText: '',
      isolateChat: true,
    });
    expect(usage.level).toBe('critical');
    expect(usage.ratio).toBeGreaterThanOrEqual(0.9);
  });

  test('压缩摘要计入 system 分解且标记 compactionApplied', () => {
    const withCompaction = computeContextUsage({
      model: 'test-model',
      systemPromptText: 'SYS',
      toolCount: 0,
      history: makeHistory(76),
      inputText: 'hi',
      compaction: compactionAt50,
      isolateChat: true,
    });
    expect(withCompaction.breakdown.compactionApplied).toBe(true);
    expect(withCompaction.breakdown.selectedCount).toBe(26);
    // system 分解包含注入段 → 大于纯提示词的估算
    const without = computeContextUsage({
      model: 'test-model',
      systemPromptText: 'SYS',
      toolCount: 0,
      history: makeHistory(76),
      inputText: 'hi',
      compaction: null,
      isolateChat: true,
    });
    expect(withCompaction.breakdown.system).toBeGreaterThan(without.breakdown.system);
  });

  test('压缩失效时标记 compactionInvalid 且不过滤历史', () => {
    const usage = computeContextUsage({
      model: 'test-model',
      systemPromptText: 'SYS',
      toolCount: 0,
      history: makeHistory(10),
      inputText: 'hi',
      compaction: { summary: 'S', upToMessageId: 'm999', compressedCount: 1 },
      isolateChat: true,
    });
    expect(usage.breakdown.compactionApplied).toBe(false);
    expect(usage.breakdown.compactionInvalid).toBe(true);
    expect(usage.breakdown.selectedCount).toBe(10);
  });

  test('空输入不计消息结构开销（当前输入为 0，与发送校验口径一致）', () => {
    const empty = computeContextUsage({
      model: 'test-model',
      systemPromptText: 'SYS',
      toolCount: 0,
      history: [],
      inputText: '',
      isolateChat: true,
    });
    expect(empty.breakdown.input).toBe(0);
    // 合计与明细一致：不含空消息的幽灵结构开销
    expect(empty.usedTokens).toBe(empty.breakdown.system + empty.breakdown.tools + empty.breakdown.history);

    // 纯空格与发送校验一致：trim 后为空同样不计
    const whitespace = computeContextUsage({
      model: 'test-model',
      systemPromptText: 'SYS',
      toolCount: 0,
      history: [],
      inputText: '   ',
      isolateChat: true,
    });
    expect(whitespace.breakdown.input).toBe(0);

    // 非空输入仍正常计入（内容 + 结构开销）
    const filled = computeContextUsage({
      model: 'test-model',
      systemPromptText: 'SYS',
      toolCount: 0,
      history: [],
      inputText: '你好',
      isolateChat: true,
    });
    expect(filled.breakdown.input).toBeGreaterThan(0);
  });
});

describe('assembleCompactionMaterial', () => {
  test('无压缩：素材为全部历史（不含当前输入的占位）', () => {
    const r = assembleCompactionMaterial(makeHistory(5), { maxMemoryMessages: null, compaction: null });
    expect(r.includedCount).toBe(5);
    expect(r.hasOldSummary).toBe(false);
    expect(r.material.length).toBe(5);
    expect(r.material[0].content).toContain('这是第1条');
  });

  test('条数限制：素材为最近 N 条', () => {
    const r = assembleCompactionMaterial(makeHistory(76), { maxMemoryMessages: 10 });
    expect(r.includedCount).toBe(10);
    expect(r.material[0].content).toContain('这是第67条');
  });

  test('已有压缩：素材含【已有摘要】+ 压缩点后消息', () => {
    const r = assembleCompactionMaterial(makeHistory(76), { maxMemoryMessages: null, compaction: compactionAt50 });
    expect(r.hasOldSummary).toBe(true);
    expect(r.material[0].content).toContain('【已有摘要】');
    expect(r.material[0].content).toContain('S1旧摘要内容');
    expect(r.includedCount).toBe(26);
    expect(r.material[1].content).toContain('这是第51条');
  });

  test('压缩点失效：忽略压缩，素材为全部历史且无已有摘要', () => {
    const r = assembleCompactionMaterial(makeHistory(76), {
      compaction: { summary: 'S', upToMessageId: 'm999' },
    });
    expect(r.hasOldSummary).toBe(false);
    expect(r.includedCount).toBe(76);
  });
});
