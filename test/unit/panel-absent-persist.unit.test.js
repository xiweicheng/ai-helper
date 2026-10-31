// ③ 后台落库兜底：任务终态时若「发起面板不在场」，结果必须由 SW 写回会话
//
// 背景：普通聊天任务的助手消息只在面板侧落库（chat-manager / chat-resume 收到
// API_COMPLETE 后 appendMessageToSession）。SW 被回收 → 自动续跑在冷启动上下文
// 完成时，广播的 API_COMPLETE 没有任何活着的 listener 接收（旧实例已卸载、新实例
// callId 不匹配）→ 结果只进了随后被清理的 checkpoint，等于任务白跑。
//
// 修法：终态（成功/失败）时用 hasKeepalivePort 做「面板是否在场」门控：
// - 面板在场（keepalive 端口还在，正常流程 100% 命中）→ 一律不写，行为零变化；
// - 面板不在场 → SW 写回，并给消息打 callId 标记；写前按 callId 查重，
//   与面板 reattach 的写入方向互斥（谁先写谁生效）。
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const INDEX_SRC = readFileSync(
  new URL('../../src/background/index.js', import.meta.url), 'utf8'
);
const SESSION_STORE_SRC = readFileSync(
  new URL('../../src/storage/session-store.js', import.meta.url), 'utf8'
);

function makeIo({ panelPresent = false, session = { messageHistory: [] } } = {}) {
  return {
    hasPanel: vi.fn(() => panelPresent),
    getSession: vi.fn(async () => session),
    appendMessageToSession: vi.fn(async () => true),
  };
}

describe('persistCompletionWithoutPanel 面板不在场时后台落库', () => {
  let persistCompletionWithoutPanel;

  beforeEach(async () => {
    vi.resetModules();
    ({ persistCompletionWithoutPanel } = await import('../../src/background/panel-absent-persist.js'));
  });

  test('面板在场（keepalive 端口存活）→ 不写库（正常流程行为零变化）', async () => {
    const io = makeIo({ panelPresent: true });
    const res = await persistCompletionWithoutPanel(
      { sessionId: 's1', callId: 'call_a', content: '结果' }, io
    );
    expect(res).toEqual({ written: false, reason: 'panel_present' });
    expect(io.appendMessageToSession).not.toHaveBeenCalled();
  });

  test('面板不在场 → 写回成功结果，并打 callId 标记（供对侧查重）', async () => {
    const io = makeIo({ panelPresent: false });
    const res = await persistCompletionWithoutPanel({
      sessionId: 's1',
      callId: 'auto_1',
      content: '任务完成',
      executionLog: [{ id: 'n1' }],
      reflectionScore: 0.8,
      wasRevised: true,
    }, io);
    expect(res).toEqual({ written: true });
    expect(io.appendMessageToSession).toHaveBeenCalledTimes(1);
    const [sid, msg] = io.appendMessageToSession.mock.calls[0];
    expect(sid).toBe('s1');
    expect(msg).toMatchObject({
      role: 'assistant',
      content: '任务完成',
      callId: 'auto_1',
      resumed: true,
      resumable: false,
    });
    expect(msg.executionLog).toEqual([{ id: 'n1' }]);
    expect(msg.reflectionScore).toBe(0.8);
    expect(msg.wasRevised).toBe(true);
  });

  test('预算撞线软着陆 → 落库消息保留「可续跑」语义（resumable=budget）', async () => {
    const io = makeIo();
    await persistCompletionWithoutPanel({
      sessionId: 's1', callId: 'auto_2', content: '部分完成', budgetEnded: true,
    }, io);
    expect(io.appendMessageToSession.mock.calls[0][1].resumable).toBe('budget');
  });

  test('失败终态 → 落库失败说明（resumable 由调用方语义决定，默认 false）', async () => {
    const io = makeIo();
    await persistCompletionWithoutPanel({
      sessionId: 's1', callId: 'auto_3', error: '模型网关 502',
    }, io);
    const msg = io.appendMessageToSession.mock.calls[0][1];
    expect(msg.content).toBe('模型网关 502');
    expect(msg.callId).toBe('auto_3');
    expect(msg.resumable).toBe(false);
  });

  test('同 callId 已入库（面板先写了）→ 跳过，防双写', async () => {
    const io = makeIo({
      session: { messageHistory: [{ role: 'assistant', content: '已写', callId: 'auto_4' }] },
    });
    const res = await persistCompletionWithoutPanel(
      { sessionId: 's1', callId: 'auto_4', content: '重复' }, io
    );
    expect(res).toEqual({ written: false, reason: 'duplicate' });
    expect(io.appendMessageToSession).not.toHaveBeenCalled();
  });

  test('会话不存在（已删除/未建）→ 静默跳过，不抛错', async () => {
    const io = makeIo({ session: null });
    const res = await persistCompletionWithoutPanel(
      { sessionId: 's1', callId: 'auto_5', content: 'x' }, io
    );
    expect(res).toEqual({ written: false, reason: 'session_missing' });
    expect(io.appendMessageToSession).not.toHaveBeenCalled();
  });

  test('缺 sessionId 或内容全空 → 不写库', async () => {
    const io = makeIo();
    expect(await persistCompletionWithoutPanel({ callId: 'c', content: 'x' }, io))
      .toEqual({ written: false, reason: 'missing_session' });
    expect(io.appendMessageToSession).not.toHaveBeenCalled();
  });

  test('IO 抛错时吞掉异常（落库兜底绝不能影响主链路的结果广播）', async () => {
    const io = makeIo();
    io.appendMessageToSession.mockRejectedValueOnce(new Error('IDB 写入失败'));
    await expect(persistCompletionWithoutPanel(
      { sessionId: 's1', callId: 'auto_6', content: 'x' }, io
    )).resolves.toMatchObject({ written: false });
  });
});

// ==================== 存储层：callId 标记必须能落盘 ====================

describe('appendMessageToSession 保留 callId / resumed / resumable 标记', () => {
  test('三个新字段原样写入（旧调用方不传时为 undefined，行为不变）', () => {
    const start = SESSION_STORE_SRC.indexOf('export async function appendMessageToSession');
    expect(start).toBeGreaterThan(-1);
    const block = SESSION_STORE_SRC.slice(start, start + 1200);
    expect(block).toContain('callId: message.callId');
    expect(block).toContain('resumed: message.resumed');
    expect(block).toContain('resumable: message.resumable');
  });
});

// ==================== 接线守卫 ====================

describe('接线：两条终态广播路径都在广播前做后台落库兜底', () => {
  test('RESUME_REACT 完成/失败路径调用兜底助手', () => {
    const start = INDEX_SRC.indexOf("message.type === 'RESUME_REACT'");
    const end = INDEX_SRC.indexOf("message.type === 'TERMINATE_COMMAND'");
    const block = INDEX_SRC.slice(start, end);
    expect(block).toContain('persistCompletionWithoutPanel');
    // 先落库再广播：保证面板 reattach 收到终态时查重一定能查到
    expect(block.indexOf('persistCompletionWithoutPanel')).toBeLessThan(
      block.indexOf("type: 'API_COMPLETE'")
    );
  });

  test('CALL_API 完成/失败路径调用兜底助手', () => {
    const start = INDEX_SRC.indexOf("message.type === 'CALL_API'");
    const end = INDEX_SRC.indexOf("message.type === 'GET_SESSION'");
    const block = INDEX_SRC.slice(start, end);
    expect(block).toContain('persistCompletionWithoutPanel');
  });
});
