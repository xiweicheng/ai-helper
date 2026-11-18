// 流式 chunk 双通道去重的单元测试
//
// background 会为同一条 chunk 发两份（端口镜像 + runtime 广播），到达顺序不保证。
// 契约：
// - 同一个 (消费方 scope, seq) 只接受一次，防止正文被追加两遍；
// - 不同消费方 / 不同 callId 各自计数，不能互相吃掉消息（队列并行、接管实例场景）；
// - 没有 seq 的消息一律放行（旧后台、其他通道），保证兼容性。
import { describe, test, expect, beforeEach } from 'vitest';
import { acceptStreamChunk, __resetStreamDedupForTest } from '../../src/side_panel/stream-dedup.js';

beforeEach(() => {
  __resetStreamDedupForTest();
});

describe('acceptStreamChunk', () => {
  test('同一消费方的重复 seq 被丢弃（端口先到、广播后到）', () => {
    const scope = 'callapi:s1:c1';
    expect(acceptStreamChunk(scope, 1)).toBe(true);
    expect(acceptStreamChunk(scope, 1)).toBe(false);
  });

  test('乱序到达时只接受更新的序号，回退的旧副本丢弃', () => {
    const scope = 'callapi:s1:c1';
    expect(acceptStreamChunk(scope, 5)).toBe(true);
    expect(acceptStreamChunk(scope, 4)).toBe(false);
    expect(acceptStreamChunk(scope, 6)).toBe(true);
  });

  test('不同消费方（发起实例 vs 接管实例）互不吃消息', () => {
    expect(acceptStreamChunk('callapi:s1:c1', 1)).toBe(true);
    expect(acceptStreamChunk('reattach:s1:c1', 1)).toBe(true);
    // 同一份广播，各自都还能继续消费后续 seq
    expect(acceptStreamChunk('callapi:s1:c1', 2)).toBe(true);
    expect(acceptStreamChunk('reattach:s1:c1', 2)).toBe(true);
  });

  test('不同 callId 互不影响', () => {
    expect(acceptStreamChunk('callapi:s1:a', 1)).toBe(true);
    expect(acceptStreamChunk('callapi:s1:b', 1)).toBe(true);
  });

  test('没有 scope 或 seq 的消息一律放行（兼容旧路径）', () => {
    expect(acceptStreamChunk(undefined, 3)).toBe(true);
    expect(acceptStreamChunk('callapi:s1:c1', 0)).toBe(true);
    expect(acceptStreamChunk('callapi:s1:c1', undefined)).toBe(true);
  });
});
