// queue-store.unit.test.js - 会话维度排队队列的存储层
//
// 重点覆盖"条目绝不能凭空消失"这条硬要求：
//   - 会话严格隔离（sessionId 即队列主键）
//   - dispatching / injecting 在重载后降级回 queued 并置顶
//   - 任何终态都进 recent 归档、可重新入队
//   - 会话删除后条目转 orphans，不级联丢弃
import { describe, test, expect, beforeEach } from 'vitest';
import * as store from '../../src/side_panel/queue-store.js';
import { QUEUE_STATUS, MAX_ITEMS_PER_SESSION } from '../../src/side_panel/queue-store.js';

/** 内存存储适配器：模拟 chrome.storage.local 并保留一份"磁盘"副本 */
function makeMemoryAdapter() {
  const disk = {};
  return {
    disk,
    async get(key) {
      return disk[key] ? JSON.parse(JSON.stringify(disk[key])) : undefined;
    },
    async set(obj) {
      for (const [k, v] of Object.entries(obj)) {
        disk[k] = JSON.parse(JSON.stringify(v));
      }
    },
  };
}

let adapter;

beforeEach(() => {
  store.__resetStoreForTest();
  adapter = makeMemoryAdapter();
  store.__setStorageAdapter(adapter);
});

describe('queue-store 入队', () => {
  test('入队成功并返回位置', async () => {
    const res = await store.enqueue({ sessionId: 's1', text: '第一条' });
    expect(res.ok).toBe(true);
    expect(res.position).toBe(1);
    expect(store.getItems('s1')).toHaveLength(1);
    expect(store.getItems('s1')[0].status).toBe(QUEUE_STATUS.QUEUED);
  });

  test('空白内容与缺会话被拒绝', async () => {
    expect((await store.enqueue({ sessionId: 's1', text: '   ' })).error).toBe('empty');
    expect((await store.enqueue({ sessionId: '', text: 'x' })).error).toBe('missing_session');
  });

  test('超过上限拒绝入队并返回 queue_full', async () => {
    for (let i = 0; i < MAX_ITEMS_PER_SESSION; i++) {
      expect((await store.enqueue({ sessionId: 's1', text: 't' + i })).ok).toBe(true);
    }
    const res = await store.enqueue({ sessionId: 's1', text: 'overflow' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('queue_full');
    expect(store.getItems('s1')).toHaveLength(MAX_ITEMS_PER_SESSION);
  });
});

describe('queue-store 会话隔离', () => {
  test('A 会话的条目不会出现在 B 会话', async () => {
    await store.enqueue({ sessionId: 'A', text: 'a1' });
    await store.enqueue({ sessionId: 'B', text: 'b1' });

    expect(store.getItems('A').map((i) => i.text)).toEqual(['a1']);
    expect(store.getItems('B').map((i) => i.text)).toEqual(['b1']);
    expect(store.listSessionIdsWithItems().sort()).toEqual(['A', 'B']);
  });

  test('会话删除后队列与归档一并清掉（不留看不见的僵尸）', async () => {
    await store.enqueue({ sessionId: 'A', text: 'a1' });
    await store.enqueue({ sessionId: 'A', text: 'a2' });

    const dropped = await store.dropSession('A');
    expect(dropped).toBe(2);
    expect(store.getItems('A')).toHaveLength(0);
    expect(store.getRecent('A')).toHaveLength(0);
    expect(store.listSessionIdsWithItems()).toEqual([]);
    // 磁盘上也不能残留：面板只渲染激活会话，留下来的条目用户再也看不见、删不掉
    expect(adapter.disk.promptQueues.sessions.A).toBeUndefined();
  });
});

describe('queue-store 排序', () => {
  test('reorder 采用给定顺序，未列出的条目追加到末尾', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    await store.enqueue({ sessionId: 's1', text: 't2' });
    await store.enqueue({ sessionId: 's1', text: 't3' });
    const ids = store.getItems('s1').map((i) => i.id);

    await store.reorder('s1', [ids[2], ids[0]]);
    expect(store.getItems('s1').map((i) => i.text)).toEqual(['t3', 't1', 't2']);
  });

  test('已移除按钮排序接口（只留拖拽用的 reorder）', async () => {
    // 上移/下移/置顶因与拖拽重复且占按钮位而删除，防止死灰复燃
    expect(store.moveItem).toBeUndefined();
    expect(store.moveToTop).toBeUndefined();
  });

  test('顺序在持久化后仍然保持', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    await store.enqueue({ sessionId: 's1', text: 't2' });
    const ids = store.getItems('s1').map((i) => i.id);
    await store.reorder('s1', [ids[1], ids[0]]);

    store.__resetStoreForTest();
    store.__setStorageAdapter(adapter);
    await store.init();
    expect(store.getItems('s1').map((i) => i.text)).toEqual(['t2', 't1']);
  });
});

describe('queue-store 状态流转与归档', () => {
  test('插入中不删除条目，回退后置顶保留', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    await store.enqueue({ sessionId: 's1', text: 't2' });
    const second = store.getItems('s1')[1];

    await store.markInjecting('s1', second.id);
    // 关键：点"插入"后条目仍在队列里可见
    expect(store.getItems('s1')).toHaveLength(2);
    expect(store.findItem('s1', second.id).status).toBe(QUEUE_STATUS.INJECTING);

    await store.rollbackInjecting('s1', second.id, 'rejected');
    const items = store.getItems('s1');
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe(second.id);
    expect(items[0].status).toBe(QUEUE_STATUS.QUEUED);
    expect(items[0].rollbackReason).toBe('rejected');
  });

  test('settle 把条目移入 recent 并可重新入队', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    const item = store.getItems('s1')[0];

    await store.settle('s1', item.id, { status: QUEUE_STATUS.DONE, note: 'relayed' });
    expect(store.getItems('s1')).toHaveLength(0);
    expect(store.getRecent('s1')).toHaveLength(1);
    expect(store.getRecent('s1')[0].text).toBe('t1');

    const res = await store.requeueFromRecent('s1', item.id);
    expect(res.ok).toBe(true);
    expect(store.getItems('s1')).toHaveLength(1);
    expect(store.getItems('s1')[0].status).toBe(QUEUE_STATUS.QUEUED);
    expect(store.getRecent('s1')).toHaveLength(0);
  });

  test('recent 归档不保留大体积上下文快照', async () => {
    const snapshot = { quotedContextText: 'x'.repeat(500), selectedSkills: [], selectedMcpServices: [], knowledgeRefs: [] };
    await store.enqueue({ sessionId: 's1', text: 't1', contextSnapshot: snapshot, hasContext: true });
    const item = store.getItems('s1')[0];
    await store.settle('s1', item.id, { status: QUEUE_STATUS.DONE });

    const archived = store.getRecent('s1')[0];
    expect(archived.contextSnapshot).toBeUndefined();
    expect(archived.contextDropped).toBe(true);
    expect(archived.hasContext).toBe(true);
  });

  test('removeFromRecent 彻底删掉归档条目（用户主动放弃失败任务）', async () => {
    await store.enqueue({ sessionId: 's1', text: '失败的一条' });
    const item = store.getItems('s1')[0];
    await store.settle('s1', item.id, { status: QUEUE_STATUS.FAILED });
    expect(store.getRecent('s1')).toHaveLength(1);

    expect(await store.removeFromRecent('s1', item.id)).toBe(true);
    expect(store.getRecent('s1')).toHaveLength(0);
    // 删除也要落盘：重载后不能又冒出来
    store.__resetStoreForTest();
    store.__setStorageAdapter(adapter);
    await store.init();
    expect(store.getRecent('s1')).toHaveLength(0);
  });

  test('removeFromRecent 对不存在的条目返回 false', async () => {
    expect(await store.removeFromRecent('s1', 'nope')).toBe(false);
    expect(await store.removeFromRecent('missing', 'nope')).toBe(false);
  });
});

describe('queue-store 派发租约', () => {
  test('第二个实例抢不到未过期的租约', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    const item = store.getItems('s1')[0];

    expect(await store.acquireLease('s1', item.id, 'panel-1')).toBe(true);
    expect(await store.acquireLease('s1', item.id, 'panel-2')).toBe(false);
    // 自己可以续租
    expect(await store.acquireLease('s1', item.id, 'panel-1')).toBe(true);

    await store.releaseLease('s1', item.id, 'panel-1');
    expect(await store.acquireLease('s1', item.id, 'panel-2')).toBe(true);
  });
});

describe('queue-store 恢复治理', () => {
  test('重载时 dispatching / injecting 降级回 queued 并置顶', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    await store.enqueue({ sessionId: 's1', text: 't2' });
    await store.enqueue({ sessionId: 's1', text: 't3' });
    const items = store.getItems('s1');
    await store.setStatus('s1', items[2].id, QUEUE_STATUS.DISPATCHING);
    await store.markInjecting('s1', items[1].id);

    // 模拟面板崩溃后重新加载
    store.__resetStoreForTest();
    store.__setStorageAdapter(adapter);
    await store.init();

    const restored = store.getItems('s1');
    expect(restored).toHaveLength(3);
    expect(restored.every((i) => i.status === QUEUE_STATUS.QUEUED)).toBe(true);
    // 被中断的两条被置顶，且打上"上次未完成"标记，用户一眼能看到
    expect(restored.slice(0, 2).every((i) => i.interrupted === true)).toBe(true);
    expect(restored[2].text).toBe('t1');
  });

  test('暂停标志随队列一起持久化', async () => {
    await store.enqueue({ sessionId: 's1', text: 't1' });
    await store.pauseSession('s1', 'user_stopped');
    expect(store.isPaused('s1')).toBe(true);

    store.__resetStoreForTest();
    store.__setStorageAdapter(adapter);
    await store.init();
    expect(store.isPaused('s1')).toBe(true);

    await store.resumeSession('s1');
    expect(store.isPaused('s1')).toBe(false);
  });
});

describe('queue-store 已移除的死接口', () => {
  test('导入 / 导出 / 孤儿迁移没有任何调用方，界面也不提供入口', () => {
    // 这些接口曾导出过但产品代码零调用。留着最坏的影响是误导：
    // 读代码的人会以为"孤儿条目有地方能看到、能迁回"，于是放心地把条目倒进 orphans。
    expect(store.exportJSON).toBeUndefined();
    expect(store.importJSON).toBeUndefined();
    expect(store.getOrphans).toBeUndefined();
    expect(store.migrateOrphansTo).toBeUndefined();
    expect(store.discardOrphans).toBeUndefined();
    expect(store.moveSessionToOrphans).toBeUndefined();
  });
});

describe('queue-store 编辑队尾（↑ 的取值口径）', () => {
  test('空队列 / 未知会话 → null', () => {
    expect(store.peekTailForEdit('s1')).toBeNull();
    expect(store.peekTailForEdit('nope')).toBeNull();
  });

  test('全是排队中 → 取最后一条（队尾）', async () => {
    await store.enqueue({ sessionId: 's1', text: '一' });
    await store.enqueue({ sessionId: 's1', text: '二' });
    const third = await store.enqueue({ sessionId: 's1', text: '三' });
    expect(store.peekTailForEdit('s1').id).toBe(third.item.id);
  });

  test('队尾已交给后台 → 跳过它往前找，绝不取回正在执行的那条', async () => {
    const a = await store.enqueue({ sessionId: 's1', text: '一' });
    const b = await store.enqueue({ sessionId: 's1', text: '二' });
    await store.setStatus('s1', b.item.id, QUEUE_STATUS.DISPATCHING);
    expect(store.peekTailForEdit('s1').id).toBe(a.item.id);
  });

  test('一条可编辑的都没有 → null（按键要让给历史导航）', async () => {
    const a = await store.enqueue({ sessionId: 's1', text: '一' });
    await store.markInjecting('s1', a.item.id);
    expect(store.peekTailForEdit('s1')).toBeNull();
  });

  test('只看本会话：别的会话的队尾不出现在这里', async () => {
    const a = await store.enqueue({ sessionId: 's1', text: '一' });
    await store.enqueue({ sessionId: 's2', text: '二' });
    expect(store.peekTailForEdit('s1').id).toBe(a.item.id);
  });
});
