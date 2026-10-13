/**
 * compaction-memory-persist.unit.test.js
 * 会话压缩摘要沉淀为长期记忆的转发层测试：
 * - 只测"整形 + 参数映射 + 失败静默降级"，存储业务逻辑由 agent 端 memory-service 测试覆盖
 * - agentRequest 全量 mock，不发真实网络请求
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/background/local-agent-client.js', () => ({ agentRequest: vi.fn() }));
vi.mock('../../src/shared/logger.js', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { agentRequest } from '../../src/background/local-agent-client.js';
import logger from '../../src/shared/logger.js';
import { persistCompactionSummary } from '../../src/background/compaction-memory.js';

beforeEach(() => {
  agentRequest.mockReset();
  logger.warn.mockReset();
});

describe('persistCompactionSummary', () => {
  test('首次沉淀走 add，并回传新 memoryId', async () => {
    agentRequest.mockResolvedValue({ success: true, memory: { id: 'fact_a_1' } });

    const r = await persistCompactionSummary({
      summary: 'S',
      sessionId: 's1',
      memoryId: null,
      compressedCount: 12,
      revision: 1,
    });

    expect(r).toEqual({ ok: true, memoryId: 'fact_a_1' });
    const [path, body, method] = agentRequest.mock.calls[0];
    expect(path).toBe('/api/memory/store');
    expect(method).toBe('POST');
    expect(body.action).toBe('add');
    expect(body.type).toBe('summary');
    expect(body.category).toBe('decision');
    expect(body.importance).toBe(6);
    expect(body.sourceSessionId).toBe('s1');
    expect(body.tags).toEqual(expect.arrayContaining(['compaction', 'session:s1']));
    expect(body.content).toContain('S');
    expect(body.content).toContain('r1');
    expect(body.memoryId).toBeUndefined();
  });

  test('重复压缩走 update（同 memoryId，不堆积条目）', async () => {
    agentRequest.mockResolvedValue({ success: true, memory: { id: 'fact_a_1' } });

    const r = await persistCompactionSummary({
      summary: 'S2',
      sessionId: 's1',
      memoryId: 'fact_a_1',
      compressedCount: 20,
      revision: 2,
    });

    expect(agentRequest.mock.calls[0][1].action).toBe('update');
    expect(agentRequest.mock.calls[0][1].memoryId).toBe('fact_a_1');
    expect(r.memoryId).toBe('fact_a_1');
  });

  test('无 sessionId 时不产生 session:null 标签', async () => {
    agentRequest.mockResolvedValue({ success: true, memory: { id: 'fact_b_1' } });

    await persistCompactionSummary({ summary: 'S', sessionId: null, revision: 1 });

    const body = agentRequest.mock.calls[0][1];
    expect(body.tags).toEqual(['compaction']);
    expect(body.sourceSessionId).toBeNull();
  });

  test('Agent 未连接时静默失败（不抛、ok=false、memoryId 保留原值）', async () => {
    agentRequest.mockRejectedValue(new Error('agent offline'));

    const r = await persistCompactionSummary({
      summary: 'S',
      sessionId: 's1',
      memoryId: 'fact_old',
      revision: 3,
    });

    expect(r).toEqual({ ok: false, memoryId: 'fact_old' });
    expect(logger.warn).toHaveBeenCalled();
  });

  test('Agent 返回 404（旧版本缺端点）时不抛错', async () => {
    agentRequest.mockResolvedValue({ httpStatus: 404, success: false, error: 'unknown' });

    const r = await persistCompactionSummary({ summary: 'S', sessionId: 's1', memoryId: null, revision: 1 });

    expect(r).toEqual({ ok: false, memoryId: null });
  });

  test('空摘要不发起请求', async () => {
    const r = await persistCompactionSummary({ summary: '   ', sessionId: 's1', revision: 1 });

    expect(r).toEqual({ ok: false, memoryId: null });
    expect(agentRequest).not.toHaveBeenCalled();
  });
});
