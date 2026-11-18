// 面板端口流式通道（镜像 + 广播收敛）的单元测试
//
// 这层的核心契约是「宁可多广播，不可丢字」：
// 1) 同一个 callId 内 seq 严格单调（接收端去重与 ACK 判定都依赖它）；
// 2) 端口不存在/投递失败时静默退化，返回 skipBroadcast=false（调用方继续广播）；
// 3) 只有「上一条」在所有端口都确认过，当前条才允许跳过广播；
// 4) 任一端口没确认（旧版前端不回 ACK、端口刚断）都保持广播。
import { describe, test, expect, vi, beforeEach } from 'vitest';

let ports = [];

vi.mock('../../src/background/state.js', () => ({
  getStreamPorts: () => ports,
}));

const {
  nextChunkSeq,
  mirrorStreamChunk,
  __getPanelBusStatsForTest,
  __resetPanelBusForTest,
} = await import('../../src/background/panel-bus.js');

const makePort = () => {
  const listeners = [];
  return {
    postMessage: vi.fn(),
    onMessage: { addListener: vi.fn((fn) => listeners.push(fn)) },
    // 模拟接收端回 ACK
    ack(seq, callId = 'c1') {
      listeners.forEach(fn => fn({ type: 'STREAM_CHUNK_ACK', callId, seq }));
    },
  };
};

const chunk = (seq) => ({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'c1', delta: 'x', seq });

beforeEach(() => {
  __resetPanelBusForTest();
  ports = [];
});

describe('panel-bus 序号', () => {
  test('同一 callId 内严格递增，不同 callId 互不干扰', () => {
    expect(nextChunkSeq('call-a')).toBe(1);
    expect(nextChunkSeq('call-a')).toBe(2);
    expect(nextChunkSeq('call-b')).toBe(1);
  });

  test('缺失 callId 返回 0', () => {
    expect(nextChunkSeq(undefined)).toBe(0);
  });
});

describe('panel-bus 镜像投递', () => {
  test('多个端口（多面板实例）各投递一份', () => {
    const p1 = makePort();
    const p2 = makePort();
    ports = [p1, p2];

    const { delivered, skipBroadcast } = mirrorStreamChunk(chunk(1));

    expect(p1.postMessage).toHaveBeenCalledWith(chunk(1));
    expect(p2.postMessage).toHaveBeenCalledWith(chunk(1));
    expect(delivered).toBe(2);
    expect(skipBroadcast).toBe(false);
    expect(__getPanelBusStatsForTest()).toMatchObject({ sent: 1, delivered: 1, missed: 0 });
  });

  test('没有端口时静默退化并保持广播', () => {
    const { delivered, skipBroadcast } = mirrorStreamChunk(chunk(1));
    expect(delivered).toBe(0);
    expect(skipBroadcast).toBe(false);
    expect(__getPanelBusStatsForTest()).toMatchObject({ sent: 1, missed: 1 });
  });

  test('单个端口投递失败不影响其他端口', () => {
    const dead = { postMessage: vi.fn(() => { throw new Error('disconnected'); }), onMessage: { addListener: vi.fn() } };
    const alive = makePort();
    ports = [dead, alive];

    const { delivered } = mirrorStreamChunk(chunk(1));
    expect(delivered).toBe(1);
    expect(alive.postMessage).toHaveBeenCalled();
  });

  test('缺 sessionId 或 seq 时不投递、不跳过广播', () => {
    const p = makePort();
    ports = [p];
    expect(mirrorStreamChunk({ type: 'STREAM_CHUNK', sessionId: 's1', delta: 'x' }))
      .toEqual({ delivered: 0, skipBroadcast: false });
    expect(p.postMessage).not.toHaveBeenCalled();
  });
});

describe('panel-bus 广播收敛', () => {
  test('上一条在所有端口确认后，当前条跳过广播', () => {
    const p1 = makePort();
    const p2 = makePort();
    ports = [p1, p2];

    // seq=1 必然广播；接收端确认后，seq=2 可收敛
    expect(mirrorStreamChunk(chunk(1)).skipBroadcast).toBe(false);
    p1.ack(1);
    p2.ack(1);

    const result = mirrorStreamChunk(chunk(2));
    expect(result.skipBroadcast).toBe(true);
    expect(__getPanelBusStatsForTest().skipped).toBe(1);
  });

  test('任一端口未确认就继续广播（旧版前端/端口刚断）', () => {
    const p1 = makePort();
    const p2 = makePort();
    ports = [p1, p2];

    mirrorStreamChunk(chunk(1));
    p1.ack(1); // p2 未确认

    expect(mirrorStreamChunk(chunk(2)).skipBroadcast).toBe(false);
  });

  test('确认回退（端口不再回 ACK）后自动恢复广播', () => {
    const p1 = makePort();
    ports = [p1];

    mirrorStreamChunk(chunk(1));
    p1.ack(1);
    expect(mirrorStreamChunk(chunk(2)).skipBroadcast).toBe(true);

    // 端口 2 没有回 ACK：seq=3 必须恢复广播
    expect(mirrorStreamChunk(chunk(3)).skipBroadcast).toBe(false);
  });
});
