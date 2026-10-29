// @vitest-environment jsdom
// test/unit/todo-manager.unit.test.js - 待办编排层
//
// 只盯四件在真实扩展里才会咬人、而纯逻辑单测看不见的事：
//   1. 落库串行 —— 并发写各自抓「整表快照」会互踩；
//   2. 失败只撤销本条 —— 不能把期间别人已经落库成功的变更一起抹掉；
//   3. 回滚必须广播 —— 乐观值已经渲染给用户了，不广播就是界面和数据各说各话；
//   4. 状态/优先级/链接这三个新动作的「先校验后落库」与智能恢复原位。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ctl = vi.hoisted(() => ({
  store: new Map(),
  order: [],        // 落库调用顺序（验证串行）
  failIds: new Set(),
  failTitles: new Set(),  // 按标题判失败：新增前拿不到 id
  failBulk: false,  // 只让批量写失败（重排/清除），不连累同条的单条写
  holdId: null,     // 让某一次落库挂起，制造并发窗口
  holdGate: Promise.resolve(),
  holdBulk: false,
  holdBulkGate: Promise.resolve(),
}));

vi.mock('../../src/storage/db.js', () => ({
  getAllTodos: async () => Array.from(ctl.store.values()),
  putTodo: async (todo) => {
    ctl.order.push('put:' + todo.id);
    if (ctl.holdId === todo.id) await ctl.holdGate;
    if (ctl.failIds.has(todo.id) || ctl.failTitles.has(todo.title)) return false;
    ctl.store.set(todo.id, { ...todo });
    return true;
  },
  putTodos: async (list) => {
    ctl.order.push('puts:' + list.map(i => i.id).join(','));
    if (ctl.holdBulk) await ctl.holdBulkGate;
    if (ctl.failBulk || list.some(i => ctl.failIds.has(i.id) || ctl.failTitles.has(i.title))) return false;
    list.forEach(i => ctl.store.set(i.id, { ...i }));
    return true;
  },
  deleteTodo: async (id) => {
    ctl.order.push('del:' + id);
    if (ctl.failIds.has('del:' + id)) return false;
    ctl.store.delete(id);
    return true;
  },
  deleteTodos: async (ids) => {
    ctl.order.push('bulkdel:' + ids.join(','));
    if (ctl.holdBulk) await ctl.holdBulkGate;
    if (ctl.failBulk || ids.some(id => ctl.failIds.has('del:' + id))) return false;
    ids.forEach(id => ctl.store.delete(id));
    return true;
  },
}));

import state from '../../src/side_panel/state.js';
import { TODO_STATUS, TODO_PRIORITY } from '../../src/side_panel/todo-model.js';
import {
  loadTodos,
  addTodo,
  updateTodo,
  setTodoStatus,
  cycleTodoStatus,
  restoreTodo,
  setTodoPriority,
  setTodoLink,
  removeTodo,
  reorderActiveTodos,
  clearCompletedTodos,
  subscribeTodos,
  getTodoGroups,
} from '../../src/side_panel/todo-manager.js';

/** 取内存里的那一条（乐观值/回滚都体现在这里） */
function pick(id) {
  return state.todos.find(t => t.id === id);
}

/** 订阅广播并计数（用例结束务必 off()） */
function watch() {
  let n = 0;
  const off = subscribeTodos(() => { n += 1; });
  return { count: () => n, off };
}

beforeEach(() => {
  ctl.store.clear();
  ctl.order.length = 0;
  ctl.failIds.clear();
  ctl.failTitles.clear();
  ctl.failBulk = false;
  ctl.holdId = null;
  ctl.holdGate = Promise.resolve();
  ctl.holdBulk = false;
  ctl.holdBulkGate = Promise.resolve();
  state.todos = [];
});

describe('成功路径', () => {
  it('新增落库并广播一次', async () => {
    const w = watch();
    const created = await addTodo('写周报');
    expect(created).toBeTruthy();
    expect(state.todos).toHaveLength(1);
    expect(ctl.store.has(created.id)).toBe(true);
    expect(w.count()).toBe(1);
    w.off();
  });

  it('空白标题不产生任何写入', async () => {
    const w = watch();
    expect(await addTodo('   ')).toBeNull();
    expect(ctl.order).toEqual([]);
    expect(w.count()).toBe(0);
    w.off();
  });

  it('载入时补齐缺字段并以库为准', async () => {
    ctl.store.set('a', { id: 'a', title: 'A', createdAt: 10, status: TODO_STATUS.PENDING, order: 0 });
    ctl.store.set('b', { id: 'b', title: 'B', createdAt: 20 });
    ctl.store.set('bad', { id: '', title: '脏数据' });
    await loadTodos();
    expect(state.todos.map(t => t.id)).toEqual(['a', 'b']);
    expect(state.todos[1].status).toBe(TODO_STATUS.PENDING);
  });
});

describe('失败路径：只撤销本条，且必须广播', () => {
  it('新增失败 → 列表里没有它，已有条目不受影响，并广播了回滚', async () => {
    await addTodo('第一条');
    ctl.failTitles.add('第二条会失败');
    const w = watch();
    const created = await addTodo('第二条会失败');
    expect(created).toBeNull();
    expect(state.todos).toHaveLength(1);
    expect(state.todos[0].title).toBe('第一条');
    expect(w.count()).toBe(1);
    w.off();
  });

  it('更新失败 → 只有本条还原，其它条目不动，并广播', async () => {
    const a = await addTodo('A');
    const b = await addTodo('B');
    ctl.failIds.add(a.id);
    const w = watch();
    const ok = await updateTodo(a.id, { title: 'A 改名' });
    expect(ok).toBe(false);
    expect(state.todos.find(t => t.id === a.id).title).toBe('A');
    expect(state.todos.find(t => t.id === b.id).title).toBe('B');
    expect(w.count()).toBe(1);
    w.off();
  });

  it('状态流转失败 → 状态还原并广播', async () => {
    const a = await addTodo('A');
    ctl.failIds.add(a.id);
    const w = watch();
    const ok = await setTodoStatus(a.id, TODO_STATUS.DONE);
    expect(ok).toBe(false);
    expect(state.todos[0].status).toBe(TODO_STATUS.PENDING);
    expect(w.count()).toBe(1);
    w.off();
  });

  it('删除失败 → 条目补回并广播', async () => {
    const a = await addTodo('A');
    const b = await addTodo('B');
    ctl.failIds.add('del:' + a.id);
    const w = watch();
    const ok = await removeTodo(a.id);
    expect(ok).toBe(false);
    expect(state.todos.map(t => t.id).sort()).toEqual([a.id, b.id].sort());
    expect(ctl.store.has(a.id)).toBe(true);
    expect(w.count()).toBe(1);
    w.off();
  });

  it('重排失败 → order 还原并广播', async () => {
    const a = await addTodo('A');
    await addTodo('B');
    ctl.failBulk = true;
    const before = state.todos.map(t => t.order).join(',');
    const w = watch();
    const ok = await reorderActiveTodos(0, 1);
    expect(ok).toBe(false);
    expect(state.todos.map(t => t.order).join(',')).toBe(before);
    expect(w.count()).toBe(1);
    w.off();
  });

  it('清除已完成失败 → 已完成条目补回并广播', async () => {
    const a = await addTodo('A');
    await setTodoStatus(a.id, TODO_STATUS.DONE);
    ctl.failIds.add('del:' + a.id);
    const w = watch();
    const ok = await clearCompletedTodos();
    expect(ok).toBe(false);
    expect(getTodoGroups().done).toHaveLength(1);
    expect(w.count()).toBe(1);
    w.off();
  });

  it('重排失败只还原 order，不抹掉期间改好的其它字段', async () => {
    const a = await addTodo('A');
    const b = await addTodo('B');
    ctl.failBulk = true;
    ctl.holdBulk = true;
    let releaseBulk;
    ctl.holdBulkGate = new Promise(resolve => { releaseBulk = resolve; });

    const pReorder = reorderActiveTodos(0, 1);
    await Promise.resolve();
    // 重排的乐观值此刻已在内存：B 被排到了首位
    expect(state.todos.find(t => t.id === b.id).order).toBe(0);
    const pRename = updateTodo(b.id, { title: 'B 改名' });
    releaseBulk();

    expect(await pReorder).toBe(false);
    expect(await pRename).toBe(true);
    const bNow = state.todos.find(t => t.id === b.id);
    expect(bNow.title).toBe('B 改名');            // 一次失败的重排不能牵连它
    expect(bNow.order).toBe(1);                   // order 已还原
    expect(state.todos.find(t => t.id === a.id).order).toBe(0);
    expect(ctl.store.get(b.id).title).toBe('B 改名');
  });

  it('清除已完成失败只补回被清条目，不影响期间新增的条目', async () => {
    const a = await addTodo('A');
    await setTodoStatus(a.id, TODO_STATUS.DONE);
    ctl.failBulk = true;
    ctl.holdBulk = true;
    let releaseBulk;
    ctl.holdBulkGate = new Promise(resolve => { releaseBulk = resolve; });

    const pClear = clearCompletedTodos();
    await Promise.resolve();
    expect(getTodoGroups().done).toHaveLength(0);  // 乐观值已移出
    const pAdd = addTodo('期间新增');
    releaseBulk();

    expect(await pClear).toBe(false);
    const created = await pAdd;
    expect(state.todos.map(t => t.id).sort()).toEqual([a.id, created.id].sort());
    expect(state.todos.find(t => t.id === a.id).status).toBe(TODO_STATUS.DONE);
    expect(state.todos.find(t => t.id === created.id).title).toBe('期间新增');
  });

  it('没有已完成时短路：不写库也不广播', async () => {
    await addTodo('A');
    const baseOrder = ctl.order.length;
    const w = watch();
    expect(await clearCompletedTodos()).toBe(true);
    expect(ctl.order.slice(baseOrder)).toEqual([]);
    expect(w.count()).toBe(0);
    w.off();
  });

  it('对不存在的 id 增删改一律拒绝，不碰存储', async () => {
    const w = watch();
    expect(await updateTodo('ghost', { title: 'x' })).toBe(false);
    expect(await setTodoStatus('ghost', TODO_STATUS.DONE)).toBe(false);
    expect(await removeTodo('ghost')).toBe(false);
    expect(await cycleTodoStatus('ghost')).toBe(false);
    expect(ctl.order).toEqual([]);
    expect(w.count()).toBe(0);
    w.off();
  });
});

describe('完成与恢复：记住完成前的状态，且回到原位', () => {
  it('从处理中进入已完成记下 prevStatus，恢复后回处理中并清空痕迹', async () => {
    const a = await addTodo('A');
    await setTodoStatus(a.id, TODO_STATUS.DOING);
    await setTodoStatus(a.id, TODO_STATUS.DONE);
    expect(pick(a.id).prevStatus).toBe(TODO_STATUS.DOING);
    expect(pick(a.id).completedAt).toBeGreaterThan(0);

    expect(await restoreTodo(a.id)).toBe(true);
    expect(pick(a.id).status).toBe(TODO_STATUS.DOING);
    expect(pick(a.id).prevStatus).toBeNull();
    expect(pick(a.id).completedAt).toBeNull();
    expect(ctl.store.get(a.id).status).toBe(TODO_STATUS.DOING);
  });

  it('待处理直接完成的恢复到待处理', async () => {
    const a = await addTodo('A');
    await setTodoStatus(a.id, TODO_STATUS.DONE);
    expect(pick(a.id).prevStatus).toBe(TODO_STATUS.PENDING);
    expect(await restoreTodo(a.id)).toBe(true);
    expect(pick(a.id).status).toBe(TODO_STATUS.PENDING);
  });

  it('恢复不动 order：撤销一次完成不会让条目跳到末尾', async () => {
    const a = await addTodo('A');
    await addTodo('B');
    await addTodo('C');
    await setTodoStatus(a.id, TODO_STATUS.DONE);
    expect(getTodoGroups().active.map(t => t.order)).toEqual([1, 2]);

    await restoreTodo(a.id);
    const { active } = getTodoGroups();
    expect(active.map(t => t.order)).toEqual([0, 1, 2]);
    expect(active[0].id).toBe(a.id);
  });

  it('已完成期间不重排别人的 order，恢复也就不需要插回', async () => {
    const a = await addTodo('A');
    const b = await addTodo('B');
    await setTodoStatus(a.id, TODO_STATUS.DONE);
    expect(pick(b.id).order).toBe(1);
    await restoreTodo(a.id);
    expect(pick(a.id).order).toBe(0);
    expect(pick(b.id).order).toBe(1);
  });

  it('非已完成条目不做恢复：不写库也不广播', async () => {
    const a = await addTodo('A');
    const baseOrder = ctl.order.length;
    const w = watch();
    expect(await restoreTodo(a.id)).toBe(false);
    expect(ctl.order.length).toBe(baseOrder);
    expect(w.count()).toBe(0);
    w.off();
  });

  it('状态没变则短路成功不重复写库；非法状态直接拒', async () => {
    const a = await addTodo('A');
    const baseOrder = ctl.order.length;
    const w = watch();
    expect(await setTodoStatus(a.id, TODO_STATUS.PENDING)).toBe(true);
    expect(ctl.order.length).toBe(baseOrder);
    expect(await setTodoStatus(a.id, 'archived')).toBe(false);
    expect(ctl.order.length).toBe(baseOrder);
    expect(pick(a.id).status).toBe(TODO_STATUS.PENDING);
    expect(w.count()).toBe(0);
    w.off();
  });

  it('非法状态不留乐观值也不落库', async () => {
    const a = await addTodo('A');
    expect(await setTodoStatus(a.id, undefined)).toBe(false);
    expect(pick(a.id).status).toBe(TODO_STATUS.PENDING);
    expect(ctl.store.get(a.id).status).toBe(TODO_STATUS.PENDING);
  });
});

describe('优先级', () => {
  it('合法档位落库，非法值等于取消并落 null', async () => {
    const a = await addTodo('A');
    expect(await setTodoPriority(a.id, TODO_PRIORITY.HIGH)).toBe(true);
    expect(pick(a.id).priority).toBe('high');
    expect(ctl.store.get(a.id).priority).toBe('high');

    expect(await setTodoPriority(a.id, 'urgent')).toBe(true);
    expect(pick(a.id).priority).toBeNull();
    expect(ctl.store.get(a.id).priority).toBeNull();
  });

  it('落库失败 → 优先级还原并广播', async () => {
    const a = await addTodo('A');
    ctl.failIds.add(a.id);
    const w = watch();
    expect(await setTodoPriority(a.id, TODO_PRIORITY.LOW)).toBe(false);
    expect(pick(a.id).priority).toBeNull();
    expect(w.count()).toBe(1);
    w.off();
  });
});

describe('外部链接：校验先于乐观更新', () => {
  it('不带协议的输入补全后落库', async () => {
    const a = await addTodo('A');
    expect(await setTodoLink(a.id, 'example.com/doc')).toEqual({ ok: true, reason: '' });
    expect(pick(a.id).link).toBe('https://example.com/doc');
    expect(ctl.store.get(a.id).link).toBe('https://example.com/doc');
  });

  it('非法链接拒于库外：不写库、不改内存、不广播', async () => {
    const a = await addTodo('A');
    await setTodoLink(a.id, 'https://example.com');
    const baseOrder = ctl.order.length;
    const w = watch();
    expect(await setTodoLink(a.id, 'javascript:alert(1)')).toEqual({ ok: false, reason: 'invalid' });
    expect(ctl.order.length).toBe(baseOrder);
    expect(pick(a.id).link).toBe('https://example.com/');
    expect(w.count()).toBe(0);
    w.off();
  });

  it('空串 = 移除链接', async () => {
    const a = await addTodo('A');
    await setTodoLink(a.id, 'https://example.com');
    expect(await setTodoLink(a.id, '')).toEqual({ ok: true, reason: '' });
    expect(pick(a.id).link).toBe('');
    expect(ctl.store.get(a.id).link).toBe('');
  });

  it('落库失败 → reason 是 save，内存还原成旧链接', async () => {
    const a = await addTodo('A');
    await setTodoLink(a.id, 'https://example.com');
    ctl.failIds.add(a.id);
    expect(await setTodoLink(a.id, 'https://other.com')).toEqual({ ok: false, reason: 'save' });
    expect(pick(a.id).link).toBe('https://example.com/');
  });

  it('条目不存在 → missing，不碰存储', async () => {
    expect(await setTodoLink('ghost', 'https://example.com')).toEqual({ ok: false, reason: 'missing' });
    expect(ctl.order).toEqual([]);
  });

  it('新增时带的非法链接不会进库（createTodo 兼一道）', async () => {
    const created = await addTodo('A', { link: 'javascript:alert(1)', priority: 'urgent' });
    expect(created.link).toBe('');
    expect(created.priority).toBeNull();
    expect(ctl.store.get(created.id).link).toBe('');
  });
});

describe('并发写：串行落库，失败的回滚不许牵连成功的写', () => {
  it('A 挂起期间 B 的落库必须排队；A 失败只撤销 A', async () => {
    const a = await addTodo('A');
    const b = await addTodo('B');
    const baseOrder = ctl.order.length;

    let release;
    ctl.holdGate = new Promise(resolve => { release = resolve; });
    ctl.holdId = a.id;
    ctl.failIds.add(a.id);

    const w = watch();
    const pA = updateTodo(a.id, { title: 'A 改名' });
    await Promise.resolve();
    // A 的乐观值此刻已在内存里
    expect(state.todos.find(t => t.id === a.id).title).toBe('A 改名');

    const pB = setTodoStatus(b.id, TODO_STATUS.DONE);
    await new Promise(resolve => setTimeout(resolve, 0));
    // 串行链：B 还没轮到落库，调用序列里只应有 A
    expect(ctl.order.slice(baseOrder)).toEqual(['put:' + a.id]);

    release();
    const [okA, okB] = await Promise.all([pA, pB]);
    expect(okA).toBe(false);
    expect(okB).toBe(true);
    expect(ctl.order.slice(baseOrder)).toEqual(['put:' + a.id, 'put:' + b.id]);

    // A 回滚不牵连 B：B 的已完成必须还在内存里
    expect(state.todos.find(t => t.id === a.id).title).toBe('A');
    expect(state.todos.find(t => t.id === b.id).status).toBe(TODO_STATUS.DONE);
    expect(ctl.store.get(b.id).status).toBe(TODO_STATUS.DONE);
    expect(ctl.store.has(a.id) && ctl.store.get(a.id).title).toBe('A');
    // A 失败回滚 + B 成功各广播一次
    expect(w.count()).toBe(2);
    w.off();
  });
});
