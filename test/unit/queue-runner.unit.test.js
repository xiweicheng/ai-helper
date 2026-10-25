// @vitest-environment jsdom
// queue-runner.unit.test.js - 会话空闲后的 FIFO 接力
//
// 核心保证：
//   - 会话空闲 → 派发队首；生成中 / 暂停时绝不派发
//   - 派发失败（例如会话刚好又开始生成）→ 条目回队置顶，不静默丢弃
//   - 一次派发结束（generation-ended）→ 自动接力下一条，严格串行
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import state from '../../src/side_panel/state.js';
import * as store from '../../src/side_panel/queue-store.js';
import { QUEUE_STATUS, MAX_DISPATCH_ATTEMPTS, INJECT_DEADLINE_MS } from '../../src/side_panel/queue-store.js';
import * as runner from '../../src/side_panel/queue-runner.js';
import { notifyGenerationEnded, __resetLifecycleForTest } from '../../src/side_panel/generation-lifecycle.js';

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
  __resetLifecycleForTest();
  adapter = makeMemoryAdapter();
  store.__setStorageAdapter(adapter);
  state.activeSessionId = 's1';
  state.generatingSessionIds.clear();
  await store.init();
});

describe('queue-runner 接力', () => {
  test('会话空闲时派发队首并结算到 recent', async () => {
    await store.enqueue({ sessionId: 's1', text: '第一条' });
    const seen = [];
    runner.bindDispatcher(async (opts) => {
      seen.push(opts);
      return { ok: true };
    });

    await runner.drainQueue('s1');

    expect(seen).toHaveLength(1);
    expect(seen[0].text).toBe('第一条');
    expect(seen[0].fromQueue).toBe(true);
    expect(store.getItems('s1')).toHaveLength(0);
    expect(store.getRecent('s1')[0].text).toBe('第一条');
    expect(store.getRecent('s1')[0].status).toBe(QUEUE_STATUS.DONE);
  });

  test('会话生成中完全不派发', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    state.generatingSessionIds.add('s1');
    const dispatcher = vi.fn(async () => ({ ok: true }));
    runner.bindDispatcher(dispatcher);

    await runner.drainQueue('s1');

    expect(dispatcher).not.toHaveBeenCalled();
    expect(store.getItems('s1')).toHaveLength(1);
    state.generatingSessionIds.clear();
  });

  test('暂停（用户点过停止）时不派发', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    await store.pauseSession('s1', 'user_stopped');
    const dispatcher = vi.fn(async () => ({ ok: true }));
    runner.bindDispatcher(dispatcher);

    await runner.drainQueue('s1');

    expect(dispatcher).not.toHaveBeenCalled();
    expect(store.getItems('s1')).toHaveLength(1);
  });

  test('派发被拒绝时条目回队并置顶，绝不丢失', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    await store.enqueue({ sessionId: 's1', text: 't2' });
    const first = store.getItems('s1')[0];

    runner.bindDispatcher(async () => ({ ok: false, reason: 'generating' }));

    await runner.drainQueue('s1');

    const items = store.getItems('s1');
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe(first.id); // 置顶：用户最关心"刚才那条没发出去"
    expect(items[0].status).toBe(QUEUE_STATUS.QUEUED);
    expect(items[0].lastError).toBe('generating');
    // 另一条不受影响，仍在队列里等下一轮
    expect(items[1].text).toBe('t2');
  });

  test('派发抛异常同样回队，不会丢条目', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    runner.bindDispatcher(async () => {
      throw new Error('boom');
    });

    await runner.drainQueue('s1');

    expect(store.getItems('s1')).toHaveLength(1);
    expect(store.getItems('s1')[0].status).toBe(QUEUE_STATUS.QUEUED);
    expect(store.getRecent('s1')).toHaveLength(0);
  });

  test('串行接力：一次结束后才派发下一条（FIFO）', async () => {
    await runner.initQueueRunner({ autoResume: false });
    await store.enqueue({ sessionId: 's1', text: 't1' });
    await store.enqueue({ sessionId: 's1', text: 't2' });

    const order = [];
    const seen = [];
    runner.bindDispatcher(async (opts) => {
      seen.push(opts.text);
      // 模拟一次真实生成：过程中该会话处于"生成中"
      state.generatingSessionIds.add('s1');
      order.push('start:' + opts.text);
      await new Promise((r) => setTimeout(r, 0));
      order.push('end:' + opts.text);
      notifyGenerationEnded('s1');
      return { ok: true };
    });

    await runner.drainQueue('s1');

    expect(seen).toEqual(['t1', 't2']);
    expect(order).toEqual(['start:t1', 'end:t1', 'start:t2', 'end:t2']);
    expect(store.getItems('s1')).toHaveLength(0);
    expect(store.getRecent('s1').map((i) => i.text)).toEqual(['t2', 't1']);
  });

  test('generation-ended 事件触发时自动接力（收尾收敛后只挂一处）', async () => {
    await runner.initQueueRunner({ autoResume: false });
    await store.enqueue({ sessionId: 's1', text: 't1' });

    const dispatcher = vi.fn(async () => ({ ok: true }));
    runner.bindDispatcher(dispatcher);

    // 一次生成刚结束 → 生命周期回调应把队首派出去
    notifyGenerationEnded('s1');
    await new Promise((r) => setTimeout(r, 0));

    expect(dispatcher).toHaveBeenCalledTimes(1);
  });

  test('用户点停止后暂停，之后 generation-ended 不再自动接力', async () => {
    await runner.initQueueRunner({ autoResume: false });
    await store.enqueue({ sessionId: 's1', text: 't1' });

    const dispatcher = vi.fn(async () => ({ ok: true }));
    runner.bindDispatcher(dispatcher);

    document.dispatchEvent(new CustomEvent('task-stop-requested', { detail: { sessionId: 's1' } }));
    await new Promise((r) => setTimeout(r, 0));
    expect(store.isPaused('s1')).toBe(true);

    notifyGenerationEnded('s1');
    await new Promise((r) => setTimeout(r, 0));

    expect(dispatcher).not.toHaveBeenCalled();
    expect(store.getItems('s1')).toHaveLength(1);
  });
});

describe('无限重跑与删不掉（阶段一实测问题）', () => {
  test('派发期间状态被外部改成 queued，仍然必须出队（不能原地再来一遍）', async () => {
    await store.enqueue({ sessionId: 's1', text: '只该跑一次' });
    const id = store.getItems('s1')[0].id;
    let calls = 0;

    runner.bindDispatcher(async () => {
      calls += 1;
      // 模拟旧 bug：外部同步把 dispatching 打回了 queued
      await store.setStatus('s1', id, QUEUE_STATUS.QUEUED);
      return { ok: true };
    });

    await runner.drainQueue('s1');

    // 修复前：既不 settle 也不 rollback → 条目留在 queued，下次又被派发（无限重跑）
    expect(store.getItems('s1')).toHaveLength(0);
    expect(store.getRecent('s1')).toHaveLength(1);
    expect(calls).toBe(1);
  });

  test('同一会话重复触发接力，同一条不会被派发第二次', async () => {
    await runner.initQueueRunner({ autoResume: false });
    await store.enqueue({ sessionId: 's1', text: '一次就好' });

    let calls = 0;
    runner.bindDispatcher(async () => {
      calls += 1;
      // 真实链路里 sendMessage 会广播 generation-ended，这里主动补上
      notifyGenerationEnded('s1');
      return { ok: true };
    });

    await runner.drainQueue('s1');
    await runner.drainQueue('s1');
    await new Promise((r) => setTimeout(r, 0));

    expect(calls).toBe(1);
    expect(store.getItems('s1')).toHaveLength(0);
  });

  test('尝试次数到顶：停止重试并移入归档，不再默循环', async () => {
    await store.enqueue({ sessionId: 's1', text: '老是失败的一条' });
    const id = store.getItems('s1')[0].id;
    // 把它推到上限
    await store.setStatus('s1', id, QUEUE_STATUS.QUEUED, { attempts: MAX_DISPATCH_ATTEMPTS });

    const dispatcher = vi.fn(async () => ({ ok: true }));
    runner.bindDispatcher(dispatcher);

    await runner.drainQueue('s1');

    expect(dispatcher).not.toHaveBeenCalled();
    expect(store.getItems('s1')).toHaveLength(0);
    const archived = store.getRecent('s1')[0];
    expect(archived.status).toBe(QUEUE_STATUS.FAILED);
    expect(archived.settleNote).toBe('too_many_attempts');
  });

  test('派发期间被用户删除：结果丢弃，绝不复活', async () => {
    await store.enqueue({ sessionId: 's1', text: '派发中被删' });
    const id = store.getItems('s1')[0].id;

    runner.bindDispatcher(async () => {
      await store.removeItem('s1', id);
      return { ok: true };
    });

    await runner.drainQueue('s1');

    expect(store.getItems('s1')).toHaveLength(0);
    // 用户亲自删的，不进归档
    expect(store.getRecent('s1')).toHaveLength(0);
  });
});

describe('刷新后队列能重新接力（阶段一实测问题）', () => {
  function mockSendMessage(running) {
    chrome.runtime.sendMessage = (msg, cb) => { if (cb) cb({ running }); };
  }

  test('首轮轮询已结束，切回该会话仍会把队列拉起来', async () => {
    mockSendMessage(false);
    await store.enqueue({ sessionId: 's1', text: '刷新后该跑的一条' });
    // autoResume: false 模拟「面板启动时那轮轮询已经耗尽」
    await runner.initQueueRunner({ autoResume: false });
    const dispatcher = vi.fn(async () => ({ ok: true }));
    runner.bindDispatcher(dispatcher);

    document.dispatchEvent(new CustomEvent('session-switched', { detail: { sessionId: 's1' } }));
    await new Promise((r) => setTimeout(r, 500));

    expect(dispatcher).toHaveBeenCalledTimes(1);
    expect(store.getItems('s1')).toHaveLength(0);
  });

  test('面板重新可见时同样会把队列拉起来', async () => {
    mockSendMessage(false);
    await store.enqueue({ sessionId: 's1', text: '可见时该跑的一条' });
    await runner.initQueueRunner({ autoResume: false });
    const dispatcher = vi.fn(async () => ({ ok: true }));
    runner.bindDispatcher(dispatcher);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 500));

    expect(dispatcher).toHaveBeenCalledTimes(1);
  });

  test('后台确实在跑时不抢跑（只等 generation-ended）', async () => {
    mockSendMessage(true);
    await store.enqueue({ sessionId: 's1', text: '后台在跑' });
    await runner.initQueueRunner({ autoResume: false });
    const dispatcher = vi.fn(async () => ({ ok: true }));
    runner.bindDispatcher(dispatcher);

    document.dispatchEvent(new CustomEvent('session-switched', { detail: { sessionId: 's1' } }));
    await new Promise((r) => setTimeout(r, 500));

    expect(dispatcher).not.toHaveBeenCalled();
    expect(store.getItems('s1')).toHaveLength(1);
  });
});

describe('见缝插针：两段式提交（不确认 = 不丢）', () => {
  let sentMessages;
  let messageListeners;

  /** 换掉 chrome.runtime：reply 决定后台怎么答（函数 / 固定值 / null=永不回调） */
  function installChrome(reply) {
    sentMessages = [];
    messageListeners = [];
    chrome.runtime.lastError = null;
    chrome.runtime.onMessage = {
      addListener: (fn) => messageListeners.push(fn),
      removeListener: (fn) => {
        const i = messageListeners.indexOf(fn);
        if (i >= 0) messageListeners.splice(i, 1);
      },
    };
    chrome.runtime.sendMessage = (msg, cb) => {
      sentMessages.push(msg);
      if (!cb) return;
      const value = typeof reply === 'function' ? reply(msg) : reply;
      // 真实通道是异步回调：同步回调会把“等回执期间”的中间态盖掉
      queueMicrotask(() => cb(value));
    };
  }

  function emitToPanel(message) {
    for (const fn of messageListeners) fn(message);
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));

  async function seed(text = '补一句') {
    await store.enqueue({ sessionId: 's1', text });
    const id = store.getItems('s1')[0].id;
    await runner.initQueueRunner({ autoResume: false });
    return id;
  }

  test('已投递但没确认 → 条目仍留在队列里（injecting），点一下不会凭空消失', async () => {
    installChrome({ accepted: true });
    const id = await seed();

    const res = await runner.injectQueueItem(id, 's1');

    expect(res).toEqual({ ok: true, pending: true });
    expect(sentMessages[0]).toMatchObject({
      type: 'INJECT_MESSAGE', sessionId: 's1', itemId: id, text: '补一句',
    });
    const still = store.getItems('s1')[0];
    expect(still.id).toBe(id);
    expect(still.status).toBe(QUEUE_STATUS.INJECTING);
  });

  test('收到 INJECT_ABSORBED 才出队并归档为 injected', async () => {
    installChrome({ accepted: true });
    const id = await seed();
    await runner.injectQueueItem(id, 's1');

    emitToPanel({ type: 'INJECT_ABSORBED', sessionId: 's1', items: [id], iteration: 3, callId: 'call_9' });
    await flush();

    expect(store.getItems('s1')).toHaveLength(0);
    const archived = store.getRecent('s1')[0];
    expect(archived.id).toBe(id);
    expect(archived.status).toBe(QUEUE_STATUS.INJECTED);
    expect(archived.injectedIntoCallId).toBe('call_9');
    expect(archived.absorbedIteration).toBe(3);
  });

  test('后台当场拒绝（任务刚好结束）→ 回退队首，不干等超时', async () => {
    installChrome({ accepted: false, reason: 'no_running_task' });
    const id = await seed();

    const res = await runner.injectQueueItem(id, 's1');

    expect(res).toEqual({ ok: false, error: 'no_running_task' });
    const items = store.getItems('s1');
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe(QUEUE_STATUS.QUEUED);
    expect(items[0].rollbackReason).toBe('no_running_task');
  });

  test('后台 INJECT_REJECTED（缓冲里没来得及注入）→ 同样回退队首', async () => {
    installChrome({ accepted: true });
    const id = await seed();
    await runner.injectQueueItem(id, 's1');

    emitToPanel({ type: 'INJECT_REJECTED', sessionId: 's1', reason: 'task_ended', items: [id] });
    await flush();

    const item = store.getItems('s1')[0];
    expect(item.status).toBe(QUEUE_STATUS.QUEUED);
    expect(item.rollbackReason).toBe('task_ended');
  });

  test('15s 没等到吸收回执 → 回退队列，绝不挂在 injecting', async () => {
    vi.useFakeTimers();
    try {
      installChrome(null); // 回调永远不来（SW 未就醒）
      await store.enqueue({ sessionId: 's1', text: '补一句' });
      const id = store.getItems('s1')[0].id;
      await runner.initQueueRunner({ autoResume: false });

      const pending = runner.injectQueueItem(id, 's1');
      await vi.advanceTimersByTimeAsync(2100); // 2s 回执守卫先放弃
      expect(await pending).toEqual({ ok: true, pending: true });
      expect(store.getItems('s1')[0].status).toBe(QUEUE_STATUS.INJECTING);

      await vi.advanceTimersByTimeAsync(INJECT_DEADLINE_MS);
      const item = store.getItems('s1')[0];
      expect(item.status).toBe(QUEUE_STATUS.QUEUED);
      expect(item.rollbackReason).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  test('带图片/文件的条目直接拒插（插进去就是静默丢图）', async () => {
    installChrome({ accepted: true });
    await store.enqueue({
      sessionId: 's1',
      text: '带图的一条',
      attachmentSummary: { imageCount: 1, fileCount: 0, fileNames: [] },
    });
    const id = store.getItems('s1')[0].id;
    await runner.initQueueRunner({ autoResume: false });

    const res = await runner.injectQueueItem(id, 's1');

    expect(res).toEqual({ ok: false, error: 'has_attachments' });
    expect(sentMessages).toHaveLength(0);
    expect(store.getItems('s1')[0].status).toBe(QUEUE_STATUS.QUEUED);
  });

  test('Alt+Enter：输入框内容要等确认吸收才清空', async () => {
    installChrome({ accepted: true });
    document.body.innerHTML = '<textarea id="userInput"></textarea>';
    const input = document.getElementById('userInput');
    input.value = '顺便把标题改掉';
    state.generatingSessionIds.add('s1');
    await runner.initQueueRunner({ autoResume: false });

    await runner.injectAdHocText('顺便把标题改掉');
    const adhocId = sentMessages[0].itemId;
    expect(adhocId.startsWith('adhoc_')).toBe(true);
    // 投递成功 ≠ 已生效：没确认前一个字都不能动用户的输入
    expect(input.value).toBe('顺便把标题改掉');

    emitToPanel({ type: 'INJECT_ABSORBED', sessionId: 's1', items: [adhocId], iteration: 1 });
    await flush();
    expect(input.value).toBe('');
  });
});

describe('自动顺带：运行中的任务自动带入队首一条', () => {
  let sentMessages;
  let messageListeners;
  const originalChatConfig = { ...state.chatConfig };

  function installChrome(reply = { accepted: true }) {
    sentMessages = [];
    messageListeners = [];
    chrome.runtime.lastError = null;
    chrome.runtime.onMessage = {
      addListener: (fn) => messageListeners.push(fn),
      removeListener: (fn) => {
        const i = messageListeners.indexOf(fn);
        if (i >= 0) messageListeners.splice(i, 1);
      },
    };
    chrome.runtime.sendMessage = (msg, cb) => {
      sentMessages.push(msg);
      if (!cb) return;
      const value = typeof reply === 'function' ? reply(msg) : reply;
      queueMicrotask(() => cb(value));
    };
  }

  function emitToPanel(message) {
    for (const fn of messageListeners) fn(message);
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));

  async function seedItems(texts = ['顺便把标题改掉']) {
    for (const text of texts) await store.enqueue({ sessionId: 's1', text });
    await runner.initQueueRunner({ autoResume: false });
    return store.getItems('s1');
  }

  /** 模拟后台一轮的执行日志更新 */
  function update(iteration, callId = 'call_1', extra = {}) {
    emitToPanel({
      type: 'EXECUTION_STATUS_UPDATE',
      sessionId: 's1',
      callId,
      executionLog: [{ id: 'log_' + iteration, iteration }],
      ...extra,
    });
  }

  afterEach(() => {
    state.chatConfig = { ...originalChatConfig };
  });

  test('第 2 轮自动携带队首一条并投递插话', async () => {
    installChrome();
    const [first] = await seedItems(['顺便把标题改掉', '再把按钮颜色调深']);

    update(2);
    await flush();

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toMatchObject({
      type: 'INJECT_MESSAGE', sessionId: 's1', itemId: first.id, text: '顺便把标题改掉',
    });
    // 两段式提交不变：只是投递，条目仍在队列里等确认
    expect(store.getItems('s1')[0].status).toBe(QUEUE_STATUS.INJECTING);
  });

  test('第 1 轮不携带（开场白里不塞话）', async () => {
    installChrome();
    await seedItems();

    update(1);
    await flush();

    expect(sentMessages).toHaveLength(0);
    expect(store.getItems('s1')[0].status).toBe(QUEUE_STATUS.QUEUED);
  });

  test('默认每 3 轮一条：第 3/4 轮不动，第 5 轮再带', async () => {
    installChrome();
    await seedItems(['第一条', '第二条', '第三条']);

    update(2);
    await flush();
    expect(sentMessages).toHaveLength(1);

    update(3);
    update(4);
    await flush();
    expect(sentMessages).toHaveLength(1);   // 间隔未到

    update(5);
    await flush();
    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[1].text).toBe('第二条');
  });

  test('同一个 callId 最多带 3 条（不把队列搬空进上下文）', async () => {
    installChrome();
    await seedItems(['一', '二', '三', '四', '五']);

    for (const iteration of [2, 5, 8, 11, 14]) {
      update(iteration);
      await flush();
      // 吸收后条目才会出队，否则第二轮取的还是同一条
      const pending = sentMessages[sentMessages.length - 1];
      if (pending) emitToPanel({ type: 'INJECT_ABSORBED', sessionId: 's1', items: [pending.itemId], iteration });
      await flush();
    }

    expect(sentMessages).toHaveLength(3);
    expect(store.getItems('s1').map((it) => it.text)).toEqual(['四', '五']);
  });

  test('换 callId（新一轮任务）后配额清零', async () => {
    installChrome();
    await seedItems(['一', '二', '三', '四']);

    for (const iteration of [2, 5, 8]) {
      update(iteration, 'call_a');
      await flush();
      const last = sentMessages[sentMessages.length - 1];
      emitToPanel({ type: 'INJECT_ABSORBED', sessionId: 's1', items: [last.itemId], iteration });
      await flush();
    }
    expect(sentMessages).toHaveLength(3);

    update(2, 'call_b');
    await flush();
    expect(sentMessages).toHaveLength(4);
  });

  test('子任务期间的轮次更新不触发（插话只有顶层循环会取走）', async () => {
    installChrome();
    await seedItems();

    update(2, 'call_1', { isSubtask: true });
    await flush();

    expect(sentMessages).toHaveLength(0);
  });

  test('开关关掉后只剩手动 ⚡', async () => {
    installChrome();
    await seedItems();
    state.chatConfig = { ...originalChatConfig, queueAutoCarry: false };

    update(2);
    update(5);
    await flush();

    expect(sentMessages).toHaveLength(0);
  });

  test('队首带附件时整轮跳过（插话只能插文本），条目留在队首', async () => {
    installChrome();
    await store.enqueue({
      sessionId: 's1',
      text: '带图的这条',
      attachmentSummary: { imageCount: 1, fileCount: 0 },
    });
    await store.enqueue({ sessionId: 's1', text: '纯文本这条' });
    await runner.initQueueRunner({ autoResume: false });

    update(2);
    await flush();

    // 顺序就是优先级：不跳过队首去带第二条
    expect(sentMessages).toHaveLength(0);
    expect(store.getItems('s1')).toHaveLength(2);
  });
});
