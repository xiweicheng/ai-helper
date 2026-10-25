// queue-persistence.unit.test.js - 排队条目的持久化加固
//
// 用户最怕的场景：辛苦记下的想法因为插件崩溃 / 面板刷新而消失。
// 因此这里断言的是"写入时序"而不是功能：
//   1. 状态转换（入队 / 出队 / 暂停 / 排序）必须同步落盘，不依赖任何去抖定时器
//   2. 只有纯文本编辑才允许合并写入
//   3. 任何终态都进 recent 归档，容量受控但条目可找回
import { describe, test, expect, beforeEach, vi } from 'vitest';
import * as store from '../../src/side_panel/queue-store.js';
import { QUEUE_STATUS, MAX_RECENT } from '../../src/side_panel/queue-store.js';

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

const persisted = () => adapter.disk.promptQueues;

beforeEach(() => {
  store.__resetStoreForTest();
  adapter = makeMemoryAdapter();
  store.__setStorageAdapter(adapter);
});

describe('queue 写入时序', () => {
  test('入队后立刻落盘（不等任何定时器）', async () => {
    await store.enqueue({ sessionId: 's1', text: '想法 A' });
    expect(persisted()).toBeTruthy();
    expect(persisted().sessions.s1.items).toHaveLength(1);
    expect(persisted().sessions.s1.items[0].text).toBe('想法 A');
  });

  test('派出 / 结算 / 暂停 / 排序都立即落盘', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    await store.enqueue({ sessionId: 's1', text: 't2' });
    const ids = store.getItems('s1').map((i) => i.id);

    await store.setStatus('s1', ids[0], QUEUE_STATUS.DISPATCHING);
    expect(persisted().sessions.s1.items.find((i) => i.id === ids[0]).status).toBe(QUEUE_STATUS.DISPATCHING);

    await store.markInjecting('s1', ids[1]);
    expect(persisted().sessions.s1.items.find((i) => i.id === ids[1]).status).toBe(QUEUE_STATUS.INJECTING);

    await store.reorder('s1', [ids[1], ids[0]]);
    expect(persisted().sessions.s1.items[0].id).toBe(ids[1]);

    await store.pauseSession('s1', 'user_stopped');
    expect(persisted().sessions.s1.paused).toBe(true);

    await store.settle('s1', ids[0], { status: QUEUE_STATUS.DONE });
    expect(persisted().sessions.s1.items.find((i) => i.id === ids[0])).toBeUndefined();
    expect(persisted().sessions.s1.recent[0].id).toBe(ids[0]);
  });

  test('纯文本编辑合并写入：延迟窗口内不落盘，窗口结束后落盘', async () => {
    vi.useFakeTimers();
    try {
      await store.enqueue({ sessionId: 's1', text: 'old' });
      const id = store.getItems('s1')[0].id;

      store.updateText('s1', id, 'new text');
      // 合并窗口内：内存已改，磁盘还是旧的（崩溃最多丢掉"正在改的措辞"）
      expect(store.findItem('s1', id).text).toBe('new text');
      expect(persisted().sessions.s1.items[0].text).toBe('old');

      vi.advanceTimersByTime(250);
      await Promise.resolve();
      expect(persisted().sessions.s1.items[0].text).toBe('new text');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('queue 崩溃恢复', () => {
  test('重新 init 后条目、顺序、暂停标志全部还在', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    await store.enqueue({ sessionId: 's1', text: 't2' });
    const ids = store.getItems('s1').map((i) => i.id);
    await store.reorder('s1', [ids[1], ids[0]]);
    await store.pauseSession('s1', 'user_stopped');

    // 模拟面板崩溃后重启：内存全丢，只剩存储
    store.__resetStoreForTest();
    store.__setStorageAdapter(adapter);
    await store.init();

    expect(store.getItems('s1').map((i) => i.text)).toEqual(['t2', 't1']);
    expect(store.isPaused('s1')).toBe(true);
  });

  test('存储不可读时不应该抛错崩掉面板', async () => {
    store.__setStorageAdapter({
      async get() { throw new Error('storage broken'); },
      async set() {},
    });
    await expect(store.init()).resolves.toBeTruthy();
    expect(store.getItems('s1')).toHaveLength(0);
  });
});

describe('queue 归档容量', () => {
  test('recent 超过上限时淘汰最老，但最新始终可查', async () => {
    for (let i = 0; i < MAX_RECENT + 5; i++) {
      await store.enqueue({ sessionId: 's1', text: 't' + i });
      const item = store.getItems('s1').find((it) => it.text === 't' + i);
      await store.settle('s1', item.id, { status: QUEUE_STATUS.DONE });
    }
    const recent = store.getRecent('s1', MAX_RECENT * 2);
    expect(recent).toHaveLength(MAX_RECENT);
    expect(recent[0].text).toBe('t' + (MAX_RECENT + 4));
  });

  test('清空队列不丢内容：全部进 recent 归档', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    await store.enqueue({ sessionId: 's1', text: 't2' });

    const count = await store.clearSession('s1');
    expect(count).toBe(2);
    expect(store.getItems('s1')).toHaveLength(0);
    expect(store.getRecent('s1').map((i) => i.text)).toEqual(['t2', 't1']);
  });
});

describe('回声回灌防护（任务不会无限重跑、删掉的不会复活）', () => {
  let changeListeners;

  beforeEach(() => {
    changeListeners = [];
    // 接管 onChanged，拿到 store 注册的监听器
    chrome.storage.onChanged.addListener = (fn) => { changeListeners.push(fn); };
  });

  test('迟到的旧回声不回灌：刚删掉的条目不会复活', async () => {
    await store.enqueue({ sessionId: 's1', text: '删掉就不该回来' });
    const id = store.getItems('s1')[0].id;
    // 删除**之前**的磁盘快照（它就是一次本地写入，回声会迟到）
    const staleSnapshot = JSON.parse(JSON.stringify(adapter.disk.promptQueues));
    store.watchExternalChanges();

    await store.removeItem('s1', id);
    expect(store.getItems('s1')).toHaveLength(0);

    // 迟到的 onChanged 带着旧快照到达
    changeListeners[0]({ promptQueues: { newValue: staleSnapshot } }, 'local');

    // 修复前：内存被回滚 → 条目复活（用户看到“删不掉”）
    expect(store.getItems('s1')).toHaveLength(0);
  });

  test('外部同步不把 dispatching 打回 queued（否则同一条会反复重跑）', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    const id = store.getItems('s1')[0].id;
    await store.setStatus('s1', id, QUEUE_STATUS.DISPATCHING);
    store.watchExternalChanges();

    // 另一个面板实例写入了自己的快照（与本实例写入不同 → 走外部分支）
    const fromOtherPanel = JSON.parse(JSON.stringify(adapter.disk.promptQueues));
    fromOtherPanel.sessions.s1.items[0].text = 't1 (别处改过)';
    fromOtherPanel.sessions.s1.recent = [{ id: 'other_1', text: '别处的归档' }];
    changeListeners[0]({ promptQueues: { newValue: fromOtherPanel } }, 'local');

    // 修复前：normalizeLoaded 无条件降级 → queued，派发方归来后发现状态不对就既不结算也不回滚
    expect(store.findItem('s1', id).status).toBe(QUEUE_STATUS.DISPATCHING);
    // 外部内容仍然生效（不能被不同步）
    expect(store.findItem('s1', id).text).toBe('t1 (别处改过)');
  });

  test('真正的页面重载仍然会把中断的 dispatching 找回为 queued 并置顶', async () => {
    await store.enqueue({ sessionId: 's1', text: 'a' });
    await store.enqueue({ sessionId: 's1', text: 'b' });
    const id = store.getItems('s1')[1].id;
    await store.setStatus('s1', id, QUEUE_STATUS.DISPATCHING);

    // 模拟刷新：内存全丢，从磁盘重新加载
    store.__resetStoreForTest();
    store.__setStorageAdapter(adapter);
    await store.init();

    const recovered = store.getItems('s1')[0];
    expect(recovered.id).toBe(id);
    expect(recovered.status).toBe(QUEUE_STATUS.QUEUED);
    expect(recovered.interrupted).toBe(true);
  });
});
