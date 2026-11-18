// 流式 chunk 端口镜像的发送侧契约
//
// 镜像必须满足两个条件才允许发生：
// 1) 实例走的是「真实向面板广播」的默认通道——注入了自定义 sendFn 的静默流（子任务）
//    明确不希望产生 UI 消息，镜像绕过 sendFn 会直接把内容推到面板；
// 2) 有 callId——seq 按 callId 生成，没有 callId 时 seq=0，接收端会把 0 当作
//    「无序号」放行，导致端口副本和广播副本各消费一次、正文重复。
import { describe, test, expect, vi, beforeEach } from 'vitest';

const mirrorStreamChunk = vi.fn(() => ({ delivered: 1, skipBroadcast: false }));
const nextChunkSeq = vi.fn(() => 42);

vi.mock('../../src/background/panel-bus.js', () => ({
  mirrorStreamChunk: (...args) => mirrorStreamChunk(...args),
  nextChunkSeq: (...args) => nextChunkSeq(...args),
}));

const { StreamController } = await import('../../src/background/stream-controller.js');

const flush = (controller) => {
  controller._pendingChunk = 'hello';
  controller._flushChunk();
};

beforeEach(() => {
  mirrorStreamChunk.mockReset();
  mirrorStreamChunk.mockReturnValue({ delivered: 1, skipBroadcast: false });
  nextChunkSeq.mockReset();
  nextChunkSeq.mockReturnValue(42);
  globalThis.chrome = { runtime: { sendMessage: vi.fn(() => Promise.resolve()) } };
});

const chunkBroadcasts = () => chrome.runtime.sendMessage.mock.calls
  .map(c => c[0])
  .filter(m => m && m.type === 'STREAM_CHUNK');

describe('StreamController 端口镜像', () => {
  test('默认广播通道 + 有 callId：控制消息与 chunk 都镜像，广播照旧', () => {
    const sc = new StreamController('s1', { streamChunkDelay: 0 }, { callId: 'c1' });
    flush(sc);

    // START + CHUNK 共用同一序号通道
    expect(mirrorStreamChunk).toHaveBeenCalledTimes(2);
    expect(mirrorStreamChunk.mock.calls[0][0]).toMatchObject({ type: 'STREAM_START', callId: 'c1', seq: 42 });
    const mirrored = mirrorStreamChunk.mock.calls[1][0];
    expect(mirrored).toMatchObject({ type: 'STREAM_CHUNK', callId: 'c1', delta: 'hello', seq: 42 });
    // 广播仍然发出，镜像不能替代它
    const broadcast = chrome.runtime.sendMessage.mock.calls.at(-1)[0];
    expect(broadcast).toMatchObject({ type: 'STREAM_CHUNK', delta: 'hello', seq: 42 });
  });

  test('注入自定义 sendFn（子任务静默流）时不镜像', () => {
    const sendFn = vi.fn(() => Promise.resolve());
    const sc = new StreamController('s1', { streamChunkDelay: 0 }, { callId: 'c1', sendFn });
    flush(sc);

    expect(mirrorStreamChunk).not.toHaveBeenCalled();
    expect(sendFn).toHaveBeenCalled();
  });

  test('AGENT_ 前缀（子代理流式）不镜像', () => {
    const sc = new StreamController('s1', { streamChunkDelay: 0 }, { callId: 'c1', typePrefix: 'AGENT_' });
    flush(sc);

    expect(mirrorStreamChunk).not.toHaveBeenCalled();
  });

  test('没有 callId 时不镜像（否则两份都会被消费，正文重复）', () => {
    const sc = new StreamController('s1', { streamChunkDelay: 0 }, {});
    flush(sc);

    expect(mirrorStreamChunk).not.toHaveBeenCalled();
    const broadcast = chrome.runtime.sendMessage.mock.calls.at(-1)[0];
    expect(broadcast.seq).toBeUndefined();
  });

  test('显式 mirrorToPanel: false 可关闭镜像', () => {
    const sc = new StreamController('s1', { streamChunkDelay: 0 }, { callId: 'c1', mirrorToPanel: false });
    flush(sc);

    expect(mirrorStreamChunk).not.toHaveBeenCalled();
  });

  test('START 后的第一条 chunk 强制广播（顺序栅栏），第二条才可能跳过', () => {
    mirrorStreamChunk.mockReturnValue({ delivered: 1, skipBroadcast: true });
    const sc = new StreamController('s1', { streamChunkDelay: 0 }, { callId: 'c1' });

    flush(sc); // 第一条：sendStart 设置的栅栏要求同走广播
    expect(mirrorStreamChunk).toHaveBeenCalledTimes(2); // START + CHUNK
    expect(chunkBroadcasts()).toHaveLength(1);

    sc._pendingChunk = 'again';
    sc._flushChunk(); // 第二条：栅栏已消费，skip 生效
    expect(mirrorStreamChunk).toHaveBeenCalledTimes(3);
    expect(chunkBroadcasts()).toHaveLength(1);
  });

  test('TOOL_CALL 与 DONE 也镜像，保证端口通道上顺序完整', () => {
    const sc = new StreamController('s1', { streamChunkDelay: 0 }, { callId: 'c1' });
    sc._streamStarted = true;

    sc.sendToolCallNotification();
    sc.finish();

    const types = mirrorStreamChunk.mock.calls.map(c => c[0].type);
    expect(types).toEqual(['STREAM_TOOL_CALL', 'STREAM_DONE']);
    // 控制消息本身仍广播（端口不可用时的兜底）
    const broadcastTypes = chrome.runtime.sendMessage.mock.calls.map(c => c[0].type);
    expect(broadcastTypes).toEqual(['STREAM_TOOL_CALL', 'STREAM_DONE']);
  });

  test('finish 前的最后一段强制广播，紧随其后的 DONE 同通道保序', () => {
    mirrorStreamChunk.mockReturnValue({ delivered: 1, skipBroadcast: true });
    const sc = new StreamController('s1', { streamChunkDelay: 0 }, { callId: 'c1' });
    sc._streamStarted = true; // 跳过 START 栅栏，模拟多轮之后的收尾

    sc._pendingChunk = 'tail';
    sc.finish();

    const types = chrome.runtime.sendMessage.mock.calls.map(c => c[0].type);
    expect(types).toEqual(['STREAM_CHUNK', 'STREAM_DONE']);
  });
});
