// auto-compaction 单元测试：触发决策 / 待压缩条数 / 发送前置钩子的失败退避（node 环境）
import { describe, test, expect, vi } from 'vitest';
import {
  DEFAULT_AUTO_COMPACTION,
  shouldAutoCompact,
  countPendingSinceCompaction,
  runAutoCompactionBeforeSend,
  resetAutoCompactionBackoff,
} from '../../src/side_panel/auto-compaction.js';

const base = {
  enabled: true,
  ratio: 0.9,
  thresholdRatio: DEFAULT_AUTO_COMPACTION.thresholdRatio,
  pendingCount: 10,
  isGenerating: false,
  isolateChat: true,
};

describe('shouldAutoCompact', () => {
  test('开关关闭时永不触发', () => {
    expect(shouldAutoCompact({ ...base, enabled: false })).toBe(false);
  });

  test('阈值边界：等于阈值触发，低于不触发', () => {
    expect(shouldAutoCompact({ ...base, ratio: 0.84 })).toBe(false);
    expect(shouldAutoCompact({ ...base, ratio: 0.85 })).toBe(true);
  });

  test('待压缩消息不足 minPending 时不触发', () => {
    expect(shouldAutoCompact({ ...base, pendingCount: DEFAULT_AUTO_COMPACTION.minPending - 1 })).toBe(false);
    expect(shouldAutoCompact({ ...base, pendingCount: DEFAULT_AUTO_COMPACTION.minPending })).toBe(true);
  });

  test('正在生成 / 记忆关闭时不触发', () => {
    expect(shouldAutoCompact({ ...base, isGenerating: true })).toBe(false);
    expect(shouldAutoCompact({ ...base, isolateChat: false })).toBe(false);
  });

  test('阈值越界时回落默认值', () => {
    // 回落 0.85，ratio 0.9 仍触发
    expect(shouldAutoCompact({ ...base, thresholdRatio: 3 })).toBe(true);
    expect(shouldAutoCompact({ ...base, ratio: 0.5, thresholdRatio: NaN })).toBe(false);
  });

  test('ratio 缺失或非法时不触发', () => {
    expect(shouldAutoCompact({ ...base, ratio: undefined })).toBe(false);
    expect(shouldAutoCompact({ ...base, ratio: null })).toBe(false);
  });

  test('不传参数时不抛异常且返回 false', () => {
    expect(shouldAutoCompact()).toBe(false);
  });
});

describe('countPendingSinceCompaction', () => {
  const history = [{ messageId: 'm1' }, { messageId: 'm2' }, { messageId: 'm3' }];

  test('无压缩点时返回全部历史条数', () => {
    expect(countPendingSinceCompaction({ messageHistory: history, activeCompaction: null })).toBe(3);
  });

  test('有压缩点时只统计其后的新消息', () => {
    expect(countPendingSinceCompaction({
      messageHistory: history,
      activeCompaction: { upToMessageId: 'm1' },
    })).toBe(2);
  });

  test('压缩点失效（找不到锚点）时按全部历史处理', () => {
    expect(countPendingSinceCompaction({
      messageHistory: history,
      activeCompaction: { upToMessageId: 'm999' },
    })).toBe(3);
  });

  test('历史为空返回 0', () => {
    expect(countPendingSinceCompaction({ messageHistory: [] })).toBe(0);
    expect(countPendingSinceCompaction({})).toBe(0);
  });
});

describe('runAutoCompactionBeforeSend', () => {
  const mkState = () => ({
    isolateChat: true,
    isGenerating: false,
    chatConfig: { autoCompaction: true, autoCompactionThreshold: 0.85 },
    messageHistory: Array.from({ length: 10 }, (_, i) => ({ messageId: `m${i + 1}` })),
    activeCompaction: null,
  });

  test('未达阈值时不调用压缩', async () => {
    resetAutoCompactionBackoff();
    const compact = vi.fn();
    const r = await runAutoCompactionBeforeSend({ state: mkState(), getRatio: () => 0.5, compact });
    expect(r.attempted).toBe(false);
    expect(compact).not.toHaveBeenCalled();
  });

  test('开关关闭时不调用压缩', async () => {
    resetAutoCompactionBackoff();
    const compact = vi.fn();
    const state = mkState();
    state.chatConfig.autoCompaction = false;
    const r = await runAutoCompactionBeforeSend({ state, getRatio: () => 0.95, compact });
    expect(r.attempted).toBe(false);
    expect(compact).not.toHaveBeenCalled();
  });

  test('达阈值时以 silent 模式压缩一次', async () => {
    resetAutoCompactionBackoff();
    const compact = vi.fn().mockResolvedValue({ success: true, savedTokens: 100 });
    const r = await runAutoCompactionBeforeSend({ state: mkState(), getRatio: () => 0.95, compact });
    expect(compact).toHaveBeenCalledWith({ silent: true });
    expect(r).toMatchObject({ attempted: true, success: true });
  });

  test('占用比计算报异常时放行（不弹压缩、不上抛）', async () => {
    resetAutoCompactionBackoff();
    const compact = vi.fn();
    const r = await runAutoCompactionBeforeSend({
      state: mkState(),
      getRatio: () => { throw new Error('usage boom'); },
      compact,
    });
    expect(r).toEqual({ attempted: false, success: false, reason: 'usage_unavailable' });
    expect(compact).not.toHaveBeenCalled();
  });

  test('压缩失败不抛异常，且连续失败达上限后本轮退避不再尝试', async () => {
    resetAutoCompactionBackoff();
    const fail = vi.fn().mockResolvedValue({ success: false, reason: 'http_500' });
    const state = mkState();
    for (let i = 0; i < DEFAULT_AUTO_COMPACTION.maxFailures; i++) {
      const r = await runAutoCompactionBeforeSend({ state, getRatio: () => 0.95, compact: fail });
      expect(r.attempted).toBe(true);
      expect(r.success).toBe(false);
    }
    const skipped = await runAutoCompactionBeforeSend({ state, getRatio: () => 0.95, compact: fail });
    expect(skipped.attempted).toBe(false);
    expect(skipped.reason).toBe('backoff');
    expect(fail).toHaveBeenCalledTimes(DEFAULT_AUTO_COMPACTION.maxFailures);
  });

  test('压缩抛异常时一律放行（不冒泡）', async () => {
    resetAutoCompactionBackoff();
    const boom = vi.fn().mockRejectedValue(new Error('bug'));
    const r = await runAutoCompactionBeforeSend({ state: mkState(), getRatio: () => 0.95, compact: boom });
    expect(r.attempted).toBe(true);
    expect(r.success).toBe(false);
  });

  test('成功后重置退避，可再次触发', async () => {
    resetAutoCompactionBackoff();
    const state = mkState();
    const fail = vi.fn().mockResolvedValue({ success: false, reason: 'x' });
    const ok = vi.fn().mockResolvedValue({ success: true, savedTokens: 1 });
    await runAutoCompactionBeforeSend({ state, getRatio: () => 0.95, compact: fail });
    await runAutoCompactionBeforeSend({ state, getRatio: () => 0.95, compact: ok });
    const after = await runAutoCompactionBeforeSend({ state, getRatio: () => 0.95, compact: fail });
    expect(after.attempted).toBe(true);
  });
});
