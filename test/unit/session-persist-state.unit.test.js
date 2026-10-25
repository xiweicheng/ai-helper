// @vitest-environment jsdom
// test/unit/session-persist-state.unit.test.js - 跨会话写盘（persistSessionState）行为测试
// 队列跨会话接力时目标会话不在面板上，写回必须走显式 sessionId，且只覆盖显式传入的字段
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

// 内存版 IndexedDB 桩：只实现本用例覆盖的接口
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

const { persistSessionState, serializeMessageHistory } = await import('../../src/storage/session-store.js');
const state = (await import('../../src/side_panel/state.js')).default;

function seed(id, extra = {}) {
  SESSIONS.set(id, {
    id,
    title: `t-${id}`,
    model: 'disk-model',
    useTools: false,
    enabledTools: ['disk_tool'],
    agentId: 'disk-agent',
    temperature: 0.1,
    topP: 0.2,
    messageHistory: [{ role: 'user', content: 'old' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  });
  return SESSIONS.get(id);
}

describe('persistSessionState', () => {
  beforeEach(() => {
    SESSIONS.clear();
    putSession.mockClear();
    // 面板停在其他会话：写盘不得借用 state.activeSessionId
    state.activeSessionId = 'panel-session';
    state.currentModel = 'panel-model';
    state.messageHistory = [{ role: 'user', content: 'panel' }];
  });

  it('只覆盖显式传入的字段，其余保持磁盘原值', async () => {
    seed('s2');
    const ok = await persistSessionState('s2', { model: 'new-model', messageHistory: [{ role: 'user', content: 'hi' }] });

    expect(ok).toBe(true);
    const written = SESSIONS.get('s2');
    expect(written.model).toBe('new-model');
    expect(written.messageHistory).toEqual([expect.objectContaining({ role: 'user', content: 'hi' })]);
    // 未传入的会话态不被打扰（尤其不能串成面板当前会话的值）
    expect(written.title).toBe('t-s2');
    expect(written.useTools).toBe(false);
    expect(written.enabledTools).toEqual(['disk_tool']);
    expect(written.agentId).toBe('disk-agent');
    expect(written.temperature).toBe(0.1);
    expect(written.topP).toBe(0.2);
    expect(written.model).not.toBe(state.currentModel);
  });

  it('写入目标是入参 sessionId，与 state.activeSessionId 无关', async () => {
    seed('s2');
    seed('panel-session');
    await persistSessionState('s2', { useTools: true });

    expect(putSession).toHaveBeenCalledTimes(1);
    expect(putSession.mock.calls[0][0].id).toBe('s2');
    expect(SESSIONS.get('panel-session').useTools).toBe(false);
  });

  it('显式传入的采样参数与帮手生效（agentId 清空落 null）', async () => {
    seed('s2');
    await persistSessionState('s2', { temperature: 1.7, topP: 0.9, agentId: null, enabledTools: ['a', 'b'] });

    const written = SESSIONS.get('s2');
    expect(written.temperature).toBe(1.7);
    expect(written.topP).toBe(0.9);
    expect(written.agentId).toBeNull();
    expect(written.enabledTools).toEqual(['a', 'b']);
  });

  it('enabledTools 写入的是副本，外部数组后续变更不污染磁盘对象', async () => {
    seed('s2');
    const tools = ['x'];
    await persistSessionState('s2', { enabledTools: tools });
    tools.push('injected');
    expect(SESSIONS.get('s2').enabledTools).toEqual(['x']);
  });

  it('messageHistory 走白名单序列化，剥离运行时字段', async () => {
    seed('s2');
    await persistSessionState('s2', {
      messageHistory: [{
        role: 'assistant',
        content: 'ok',
        executionLog: [{ name: 'tool' }],
        messageId: 'm1',
        timestamp: '2026-10-25T00:00:00.000Z',
        contextBubbles: [{ type: 'file', name: 'a.txt' }],
        // 以下字段不应落盘
        streaming: true,
        el: {},
        rawHtml: '<p>x</p>',
      }],
    });

    const [saved] = SESSIONS.get('s2').messageHistory;
    expect(saved).toEqual({
      role: 'assistant',
      content: 'ok',
      executionLog: [{ name: 'tool' }],
      reflectionScore: undefined,
      wasRevised: false,
      htmlContent: undefined,
      messageId: 'm1',
      timestamp: '2026-10-25T00:00:00.000Z',
      contextBubbles: [{ type: 'file', name: 'a.txt' }],
      resumable: false,
    });
    expect(saved).not.toHaveProperty('streaming');
    expect(saved).not.toHaveProperty('el');
    expect(saved).not.toHaveProperty('rawHtml');
  });

  it('生成期间被其他路径追加的消息不被吞掉（磁盘独有段保留在本轮新段之前）', async () => {
    seed('s2', {
      messageHistory: [
        { role: 'user', content: 'm1', messageId: 'm1' },
        { role: 'assistant', content: 'm2', messageId: 'm2' },
      ],
    });
    // 快照 = dispatch 时读到的版本 + 本轮新增（u3 / a3）
    const snapshot = [
      { role: 'user', content: 'm1', messageId: 'm1' },
      { role: 'assistant', content: 'm2', messageId: 'm2' },
      { role: 'user', content: 'u3', messageId: 'u3' },
      { role: 'assistant', content: 'a3', messageId: 'a3' },
    ];
    // 模拟并发：生成期间另一条路径（任务恢复结果回写）往该会话追加了一条
    SESSIONS.get('s2').messageHistory = [...SESSIONS.get('s2').messageHistory, { role: 'assistant', content: 'resume-x' }];

    await persistSessionState('s2', { messageHistory: snapshot });

    expect(SESSIONS.get('s2').messageHistory.map((m) => m.content))
      .toEqual(['m1', 'm2', 'resume-x', 'u3', 'a3']);
  });

  it('无并发时快照尾部新段照常落盘（不因合并而重复旧消息）', async () => {
    seed('s2', {
      messageHistory: [
        { role: 'user', content: 'm1', messageId: 'm1' },
        { role: 'assistant', content: 'm2', messageId: 'm2' },
      ],
    });
    await persistSessionState('s2', {
      messageHistory: [
        { role: 'user', content: 'm1', messageId: 'm1' },
        { role: 'assistant', content: 'm2', messageId: 'm2' },
        { role: 'user', content: 'u3', messageId: 'u3' },
      ],
    });

    expect(SESSIONS.get('s2').messageHistory.map((m) => m.content)).toEqual(['m1', 'm2', 'u3']);
  });

  it('历史被整体替换时退回以快照为准（首条就对不上，不保留旧段）', async () => {
    seed('s2', { messageHistory: [{ role: 'user', content: 'legacy', messageId: 'old1' }] });
    await persistSessionState('s2', {
      messageHistory: [{ role: 'user', content: 'brand-new', messageId: 'n1' }],
    });

    expect(SESSIONS.get('s2').messageHistory.map((m) => m.content)).toEqual(['brand-new']);
  });

  it('目标会话不存在时返回 false 且不写盘', async () => {
    const ok = await persistSessionState('missing', { model: 'x' });
    expect(ok).toBe(false);
    expect(putSession).not.toHaveBeenCalled();
  });

  it('sessionId 为空时直接返回 false', async () => {
    expect(await persistSessionState('', { model: 'x' })).toBe(false);
    expect(await persistSessionState(null, { model: 'x' })).toBe(false);
    expect(putSession).not.toHaveBeenCalled();
  });

  it('刷新 updatedAt，便于会话列表按时序重排', async () => {
    seed('s2');
    await persistSessionState('s2', { model: 'm' });
    expect(SESSIONS.get('s2').updatedAt).toBeTruthy();
    expect(SESSIONS.get('s2').updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('serializeMessageHistory', () => {
  it('空值安全，返回空数组', () => {
    expect(serializeMessageHistory()).toEqual([]);
    expect(serializeMessageHistory(null)).toEqual([]);
  });

  it('content 缺失落空串，executionLog 缺失落空数组', () => {
    const [msg] = serializeMessageHistory([{ role: 'user' }]);
    expect(msg.content).toBe('');
    expect(msg.executionLog).toEqual([]);
  });
});
