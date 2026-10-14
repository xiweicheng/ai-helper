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

  // M2（2026-10-14 评审）：锚点被 compact 淘汰/手动删除后，update 从此指向不存在的 id，
  // 摘要沉淀永久静默断供。agent 侧 now 回 code=not_found，扩展端据此降级为新增重建。
  test('update 锚点已失效（code=not_found）：降级为 add 重建并回传新 id', async () => {
    agentRequest
      .mockResolvedValueOnce({ httpStatus: 400, success: false, error: 'not found', code: 'not_found' })
      .mockResolvedValueOnce({ httpStatus: 200, success: true, memory: { id: 'sum_new_1' } });

    const r = await persistCompactionSummary({
      summary: 'S',
      sessionId: 's1',
      memoryId: 'sum_dead',
      revision: 4,
    });

    expect(r).toEqual({ ok: true, memoryId: 'sum_new_1' });
    expect(agentRequest).toHaveBeenCalledTimes(2);
    const [path1, body1] = agentRequest.mock.calls[0];
    expect(body1.action).toBe('update');
    expect(body1.memoryId).toBe('sum_dead');
    const [path2, body2] = agentRequest.mock.calls[1];
    expect(path2).toBe('/api/memory/store');
    expect(body2.action).toBe('add');
    expect(body2.memoryId).toBeUndefined();
    expect(body2.content).toBe(body1.content);
  });

  test('降级 add 也失败：仍静默（ok=false，保留原锚点）', async () => {
    agentRequest
      .mockResolvedValueOnce({ httpStatus: 400, success: false, code: 'not_found' })
      .mockResolvedValueOnce({ httpStatus: 503, success: false, error: 'down' });

    const r = await persistCompactionSummary({ summary: 'S', sessionId: 's1', memoryId: 'sum_dead', revision: 5 });

    expect(r).toEqual({ ok: false, memoryId: 'sum_dead' });
    expect(agentRequest).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalled();
  });

  test('其他 400 不触发降级（code 缺失时不误重建）', async () => {
    agentRequest.mockResolvedValue({ httpStatus: 400, success: false, error: 'invalid' });

    const r = await persistCompactionSummary({ summary: 'S', sessionId: 's1', memoryId: 'sum_x', revision: 1 });

    expect(r).toEqual({ ok: false, memoryId: 'sum_x' });
    expect(agentRequest).toHaveBeenCalledTimes(1);
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
