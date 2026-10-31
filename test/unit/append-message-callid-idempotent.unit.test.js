// test/unit/append-message-callid-idempotent.unit.test.js
// 终态写入的幂等键：同一 callId 只能落一条消息。
//
// 背景：MV3 下「一条任务结果」有两个可能的写者——
//   1) SW 兜底写入（发起面板不在了才写，见 panel-absent-persist.js）
//   2) 面板自己的落库（原发起实例，或 reattach 接管后的新实例）
// 两者存在毫秒级交叉窗口（面板刚打开、reattach 尚未接管时 SW 判「无端口」而写入，
// 随后面板接管也写一次）。此时若只是简单 push，会话里会出现两条重复消息。
// 因此 appendMessageToSession 对带 callId 的消息做幂等 upsert；不带 callId 的老流程
// 行为完全不变（一律追加）。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const noop = () => {};
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        if (typeof cb === 'function') { cb({}); return; }
        return Promise.resolve({});
      },
      set: noop,
      remove: () => Promise.resolve(),
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: { lastError: null, getManifest: () => ({ content_scripts: [{ js: [] }] }), getURL: (p) => p, sendMessage: (m, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); } },
};

const SESSIONS = new Map();
const putSession = vi.fn(async (s) => { SESSIONS.set(s.id, JSON.parse(JSON.stringify(s))); return true; });

vi.mock('../../src/storage/db.js', () => ({
  ensureMigration: async () => {},
  appendMessageToSession: async () => true,
  getSession: async (id) => (SESSIONS.has(id) ? JSON.parse(JSON.stringify(SESSIONS.get(id))) : null),
  putSession: (...args) => putSession(...args),
  getAllSessions: async () => Array.from(SESSIONS.values()),
  getActiveSessionId: async () => null,
  deleteSession: async () => {},
  deleteReactCheckpoint: async () => {},
}));
vi.mock('../../src/side_panel/doc-images.js', () => ({
  removeDocImageSnapshot: vi.fn(async () => {}),
}));

const { appendMessageToSession, serializeMessageHistory } = await import('../../src/storage/session-store.js');

function seed(id, history = []) {
  SESSIONS.set(id, {
    id,
    title: `t-${id}`,
    messageHistory: history,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
}

const history = (id) => SESSIONS.get(id).messageHistory;

beforeEach(() => {
  SESSIONS.clear();
  putSession.mockClear();
});

describe('appendMessageToSession 按 callId 幂等', () => {
  it('同一 callId 写入两次 → 只留一条（后写覆盖/合并，不新增重复消息）', async () => {
    seed('s1');
    await appendMessageToSession('s1', { role: 'assistant', content: '完成', callId: 'auto_1' });
    await appendMessageToSession('s1', { role: 'assistant', content: '完成', callId: 'auto_1' });

    expect(history('s1')).toHaveLength(1);
    expect(history('s1')[0].callId).toBe('auto_1');
    expect(history('s1')[0].content).toBe('完成');
  });

  it('后写补齐前写缺失的渲染快照（htmlContent / messageId / executionLog）', async () => {
    seed('s1');
    // SW 兜底写入：只有纯文本与执行日志
    await appendMessageToSession('s1', {
      role: 'assistant',
      content: '完成',
      executionLog: [{ id: 'n1' }],
      callId: 'auto_1',
      resumed: true,
    });
    // 面板接管写入：带渲染快照
    await appendMessageToSession('s1', {
      role: 'assistant',
      content: '完成',
      executionLog: [{ id: 'n1' }],
      callId: 'auto_1',
      resumed: true,
      htmlContent: '<div>完成</div>',
      messageId: 'msg_1',
    });

    expect(history('s1')).toHaveLength(1);
    expect(history('s1')[0].htmlContent).toBe('<div>完成</div>');
    expect(history('s1')[0].messageId).toBe('msg_1');
    expect(history('s1')[0].executionLog).toEqual([{ id: 'n1' }]);
  });

  it('后写缺字段时不抹掉前写已有的渲染快照（顺序反过来也安全）', async () => {
    seed('s1');
    await appendMessageToSession('s1', {
      role: 'assistant', content: '完成', callId: 'auto_1', htmlContent: '<div>完成</div>', messageId: 'msg_1',
    });
    await appendMessageToSession('s1', { role: 'assistant', content: '完成', callId: 'auto_1' });

    expect(history('s1')).toHaveLength(1);
    expect(history('s1')[0].htmlContent).toBe('<div>完成</div>');
    expect(history('s1')[0].messageId).toBe('msg_1');
  });

  it('resumable 以后写为准（面板知道真实终态：是否还能续跑）', async () => {
    seed('s1');
    await appendMessageToSession('s1', { role: 'assistant', content: '预算用完', callId: 'auto_1', resumable: false });
    await appendMessageToSession('s1', { role: 'assistant', content: '预算用完', callId: 'auto_1', resumable: 'budget' });

    expect(history('s1')).toHaveLength(1);
    expect(history('s1')[0].resumable).toBe('budget');
  });

  it('不同 callId 各写一条（互不影响）', async () => {
    seed('s1');
    await appendMessageToSession('s1', { role: 'assistant', content: 'a', callId: 'auto_1' });
    await appendMessageToSession('s1', { role: 'assistant', content: 'b', callId: 'auto_2' });

    expect(history('s1')).toHaveLength(2);
    expect(history('s1').map((m) => m.content)).toEqual(['a', 'b']);
  });

  it('不带 callId 的消息保持原行为：每次都追加（老流程零变化）', async () => {
    seed('s1');
    await appendMessageToSession('s1', { role: 'assistant', content: '同上' });
    await appendMessageToSession('s1', { role: 'assistant', content: '同上' });

    expect(history('s1')).toHaveLength(2);
  });

  it('会话不存在 → 返回 false 且不写盘', async () => {
    const ok = await appendMessageToSession('missing', { role: 'assistant', content: 'x', callId: 'auto_1' });
    expect(ok).toBe(false);
    expect(putSession).not.toHaveBeenCalled();
  });
});

// ==================== 去重键必须跟着消息落盘 ====================

// 幂等 upsert 的键是 callId，但 DB 里的 callId 是靠 saveCurrentSession 重建 history
// 时写进去的。若序列化白名单漏了它，任何一次切会话/常规保存都会把键抹掉 ——
// 此后 SW 兜底写入的查重（history.some(m => m.callId === id)）永远查不到，
// 重试/重放时会真的写出两条同源消息。

describe('serializeMessageHistory 消息落盘字段', () => {
  it('保留 callId 与 resumed（去重键不能因为一次普通保存就丢掉）', () => {
    const [msg] = serializeMessageHistory([
      { role: 'assistant', content: '续跑结果', callId: 'auto_7', resumed: true },
    ]);
    expect(msg.callId).toBe('auto_7');
    expect(msg.resumed).toBe(true);
  });

  it('普通消息不带 callId 时序列化为 undefined（不污染历史数据）', () => {
    const [msg] = serializeMessageHistory([{ role: 'user', content: '你好' }]);
    expect(msg.callId).toBeUndefined();
    expect(msg.content).toBe('你好');
  });
});
