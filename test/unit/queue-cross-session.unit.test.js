// @vitest-environment jsdom
// queue-cross-session.unit.test.js - Phase 2：跨会话接力
//
// 核心保证：
//   - 队列是会话维度的，面板停在 B 时 A 的队列也要能跑完
//   - 非激活会话派发：上下文与会话态随载荷传入，绝不读写面板 state
//   - 目标会话已被删除：队列随会话清掉，不留看不见的僵尸
import { describe, test, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/side_panel/session-manager.js', () => ({
  loadSessions: vi.fn(async () => ({ list: [], activeSessionId: 's1' })),
}));

import state from '../../src/side_panel/state.js';
import * as store from '../../src/side_panel/queue-store.js';
import * as runner from '../../src/side_panel/queue-runner.js';
import { loadSessions } from '../../src/side_panel/session-manager.js';

function makeMemoryAdapter() {
  const disk = {};
  return {
    disk,
    async get(key) {
      return disk[key] ? JSON.parse(JSON.stringify(disk[key])) : undefined;
    },
    async set(obj) {
      for (const [k, v] of Object.entries(obj)) disk[k] = JSON.parse(JSON.stringify(v));
    },
  };
}

let adapter;

beforeEach(async () => {
  store.__resetStoreForTest();
  runner.__resetRunnerForTest();
  adapter = makeMemoryAdapter();
  store.__setStorageAdapter(adapter);
  state.activeSessionId = 's1';
  state.generatingSessionIds.clear();
  state.quotedContextText = '';
  state.selectedContextText = '';
  state.selectedSkills = [];
  state.selectedMcpServices = [];
  state.knowledgeRefs = [];
  state.selectedPage = null;
  state.attachedFiles = [];
  state.attachedImages = [];
  await store.init();
  loadSessions.mockClear();
  loadSessions.mockResolvedValue({ list: [], activeSessionId: 's1' });
});

describe('非激活会话派发', () => {
  test('上下文与会话态随载荷传入，面板 state 一根毛都不动', async () => {
    // 面板当前会话（s1）自己挂着上下文：这正是最容易被串味的干扰项
    state.quotedContextText = '面板的引用';
    state.selectedSkills = [{ name: 'panel-skill' }];

    await store.enqueue({
      sessionId: 's2',
      text: '后台任务',
      contextSnapshot: { quotedContextText: '队列的引用', selectedSkills: [{ name: 'queue-skill' }] },
    });

    loadSessions.mockResolvedValue({
      list: [{
        id: 's2',
        messageHistory: [{ role: 'user', content: '旧消息' }],
        model: 'model-s2',
        useTools: false,
        enabledTools: ['tool-a'],
        agentId: 'agent-a',
        temperature: 0.3,
        topP: 0.8,
      }],
      activeSessionId: 's1',
    });

    const seen = [];
    runner.bindDispatcher(async (opts) => { seen.push(opts); return { ok: true }; });

    await runner.drainQueue('s2');

    expect(seen).toHaveLength(1);
    expect(seen[0].sessionId).toBe('s2');
    // 上下文来自队列条目，而不是 panels1 的输入区
    expect(seen[0].context.quotedContextText).toBe('队列的引用');
    expect(seen[0].context.selectedSkills).toEqual([{ name: 'queue-skill' }]);
    expect(seen[0].context.attachedImages).toEqual([]);
    // 会话态来自目标会话记录
    expect(seen[0].sessionState.model).toBe('model-s2');
    expect(seen[0].sessionState.useTools).toBe(false);
    expect(seen[0].sessionState.enabledTools).toEqual(['tool-a']);
    expect(seen[0].sessionState.temperature).toBe(0.3);
    expect(seen[0].sessionState.messageHistory).toHaveLength(1);

    // 面板输入区没被清空/覆盖
    expect(state.quotedContextText).toBe('面板的引用');
    expect(state.selectedSkills).toEqual([{ name: 'panel-skill' }]);
    expect(store.getItems('s2')).toHaveLength(0);
    expect(store.getRecent('s2')[0].status).toBe('done');
  });

  test('激活会话派发：上下文同样随载荷传入（不再借用输入区 state）', async () => {
    await store.enqueue({ sessionId: 's1', text: '前台任务' });
    const seen = [];
    runner.bindDispatcher(async (opts) => { seen.push(opts); return { ok: true }; });

    await runner.drainQueue('s1');

    expect(seen).toHaveLength(1);
    // 载荷缺省补空：8 类字段齐备，sendMessage 不会回落到面板 state
    expect(seen[0].context).toBeDefined();
    expect(seen[0].context.quotedContextText).toBe('');
    expect(seen[0].context.attachedImages).toEqual([]);
    expect(seen[0].sessionState).toBeUndefined();
    // 不该为了前台派发去读会话库
    expect(loadSessions).not.toHaveBeenCalled();
  });

  test('目标会话已被删除：队列随会话清掉，不留在存储里当僵尸', async () => {
    await store.enqueue({ sessionId: 's9', text: '老会话的任务' });
    loadSessions.mockResolvedValue({ list: [], activeSessionId: 's1' });

    let called = 0;
    runner.bindDispatcher(async () => { called += 1; return { ok: true }; });

    await runner.drainQueue('s9');

    expect(called).toBe(0);
    expect(store.getItems('s9')).toHaveLength(0);
    expect(store.getRecent('s9')).toHaveLength(0);
    // 关键：旧实现把条目倒进 orphans。面板没有任何孤儿入口 —— 那等于永久留在存储里。
    // 因此断言"存储里不该再出现这条文本"，而不是只看内存查询结果。
    expect(JSON.stringify(adapter.disk.promptQueues || {})).not.toContain('老会话的任务');
  });

  test('非激活派发失败：回队置顶，不误清面板输入区', async () => {
    state.quotedContextText = '面板的引用';
    await store.enqueue({ sessionId: 's2', text: '会失败的任务' });
    loadSessions.mockResolvedValue({ list: [{ id: 's2', messageHistory: [] }], activeSessionId: 's1' });

    runner.bindDispatcher(async () => ({ ok: false, reason: 'generating' }));

    await runner.drainQueue('s2');

    expect(store.getItems('s2')).toHaveLength(1);
    expect(store.getItems('s2')[0].status).toBe('queued');
    expect(state.quotedContextText).toBe('面板的引用');
  });
});

describe('跨会话自动接力', () => {
  function mockSendMessage(running) {
    chrome.runtime.sendMessage = (msg, cb) => { if (cb) cb({ running }); };
  }

  test('面板停在 s1，s2 的队列也会被自动拉起', async () => {
    mockSendMessage(false);
    await store.enqueue({ sessionId: 's2', text: 's2 的任务' });
    loadSessions.mockResolvedValue({ list: [{ id: 's2', messageHistory: [] }], activeSessionId: 's1' });

    const seen = [];
    runner.bindDispatcher(async (opts) => { seen.push(opts); return { ok: true }; });

    await runner.initQueueRunner({ autoResume: true });
    await new Promise((r) => setTimeout(r, 600));

    expect(seen).toHaveLength(1);
    expect(seen[0].sessionId).toBe('s2');
    expect(state.quotedContextText).toBe('');
  });

  test('后台确实在跑的会话不抢跑，空闲的那个照跑', async () => {
    // s2 在后台跑着，s3 空闲
    chrome.runtime.sendMessage = (msg, cb) => {
      if (cb) cb({ running: msg.sessionId === 's2' });
    };
    await store.enqueue({ sessionId: 's2', text: 's2 在跑' });
    await store.enqueue({ sessionId: 's3', text: 's3 该跑' });
    loadSessions.mockResolvedValue({
      list: [{ id: 's2', messageHistory: [] }, { id: 's3', messageHistory: [] }],
      activeSessionId: 's1',
    });

    const seen = [];
    runner.bindDispatcher(async (opts) => { seen.push(opts); return { ok: true }; });

    await runner.initQueueRunner({ autoResume: true });
    await new Promise((r) => setTimeout(r, 600));

    expect(seen).toHaveLength(1);
    expect(seen[0].sessionId).toBe('s3');
    expect(store.getItems('s2')).toHaveLength(1);
  });

  test('暂停的会话不被自动接力', async () => {
    mockSendMessage(false);
    await store.enqueue({ sessionId: 's2', text: '停过的会话' });
    await store.pauseSession('s2', 'user_stopped');
    loadSessions.mockResolvedValue({ list: [{ id: 's2', messageHistory: [] }], activeSessionId: 's1' });

    const seen = [];
    runner.bindDispatcher(async (opts) => { seen.push(opts); return { ok: true }; });

    await runner.initQueueRunner({ autoResume: true });
    await new Promise((r) => setTimeout(r, 600));

    expect(seen).toHaveLength(0);
    expect(store.getItems('s2')).toHaveLength(1);
  });
});
