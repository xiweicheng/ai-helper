// side_panel/todo-manager.js - 待办状态编排（state 缓存 + IndexedDB 持久化）
//
// 写操作统一「先改 state，再落库，失败回滚」，落库失败由调用方决定如何提示；
// 视图层通过 subscribe() 订阅变更，不直接操作 state.todos。
//
// 两条约束（都是踩过的坑，见 CHANGELOG）：
// 1. 落库走 queueWrite 串行：并发写各自抓的「整表快照」会互踩 —— A 失败时若整表
//    还原，会把期间 B 已经落库成功的变更也从内存里抹掉，内存/视图/IndexedDB 三方分叉。
//    因此所有写操作失败时都只撤销自己涉入的那几条（单条直接还原本条，重排只还原
//    order 字段，清除只补回被清条目）。
// 2. 回滚必须 emitChange：乐观值已经渲染给用户了，回滚不广播就等于「界面说删掉了，
//    库里其实没动」。

import state from './state.js';
import { getAllTodos, putTodo, putTodos, deleteTodo, deleteTodos } from '../storage/db.js';
import {
  TODO_STATUS,
  createTodo,
  normalizeTodo,
  normalizePriority,
  normalizeLink,
  restoreTarget,
  groupTodos,
  reorderList,
  withOrder,
  nextOrder,
  nextStatus,
  isTodoStatus,
  mergeTodoImport,
} from './todo-model.js';
import logger from '../shared/logger.js';
import { recordTodoStat } from './todo-stats.js';

const listeners = new Set();

let writeChain = Promise.resolve();

/**
 * 把一次落库动作排到串行链尾部，避免并发写互相覆盖快照
 * @param {Function} task 返回 Promise 的落库动作
 * @returns {Promise<*>} task 的结果；链本身不因前一次失败而中断
 */
function queueWrite(task) {
  const run = writeChain.then(task);
  writeChain = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * 订阅待办变更（新增/删除/更新/重排后触发）
 * @param {Function} fn
 * @returns {Function} 取消订阅
 */
export function subscribeTodos(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitChange() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (e) {
      logger.warn('[Todo] listener failed:', e);
    }
  }
}

/** 从 IndexedDB 载入全部待办到 state */
export async function loadTodos() {
  try {
    const all = await getAllTodos();
    state.todos = (all || []).map(normalizeTodo).filter(item => item.id && item.title);
    logger.debug('[Todo] loaded todos:', state.todos.length);
  } catch (e) {
    logger.error('[Todo] load todos failed:', e);
    state.todos = [];
  }
}

/** 两段式分组结果（待办 / 已完成） */
export function getTodoGroups() {
  return groupTodos(state.todos);
}

function findTodo(id) {
  return state.todos.find(item => item.id === id) || null;
}

function replaceTodo(updated) {
  state.todos = state.todos.map(item => (item.id === updated.id ? updated : item));
}

/**
 * 新增一条待办（落在待办列表末尾）
 * @param {string} title
 * @param {{note?: string, dueAt?: number|null, priority?: string|null, link?: string}} [extra]
 * @returns {Promise<Object|null>} 落库失败返回 null
 */
export async function addTodo(title, extra = {}) {
  const trimmed = String(title || '').trim();
  if (!trimmed) return null;

  const todo = createTodo(trimmed, extra);
  todo.order = nextOrder(state.todos);
  state.todos = [...state.todos, todo];

  const ok = await queueWrite(() => putTodo(todo)).catch(e => {
    logger.error('[Todo] add failed:', e);
    return false;
  });
  if (!ok) {
    // 只摘掉本条，不还原整表
    state.todos = state.todos.filter(item => item.id !== todo.id);
    emitChange();
    return null;
  }
  emitChange();
  // 流水失败不拖累新增：recordTodoStat 自己吞异常
  await recordTodoStat('added', 1, todo.createdAt);
  return todo;
}

/**
 * 更新标题 / 备注 / 截止时间 / 优先级 / 链接
 * @param {string} id
 * @param {{title?: string, note?: string, dueAt?: number|null, priority?: string|null, link?: string}} patch
 * @returns {Promise<boolean>}
 */
export async function updateTodo(id, patch = {}) {
  const current = findTodo(id);
  if (!current) return false;

  const next = { ...current, updatedAt: Date.now() };
  if (patch.title !== undefined) {
    const title = String(patch.title).trim();
    if (!title) return false;
    next.title = title;
  }
  if (patch.note !== undefined) next.note = String(patch.note || '').trim();
  if (patch.dueAt !== undefined) next.dueAt = Number.isFinite(patch.dueAt) ? patch.dueAt : null;
  if (patch.priority !== undefined) next.priority = normalizePriority(patch.priority);
  if (patch.link !== undefined) next.link = normalizeLink(patch.link).url;

  replaceTodo(next);
  const ok = await queueWrite(() => putTodo(next)).catch(e => {
    logger.error('[Todo] update failed:', e);
    return false;
  });
  if (!ok) {
    replaceTodo(current);
    emitChange();
    return false;
  }
  emitChange();
  return true;
}

/**
 * 切到指定状态；进入已完成时记下「完成前是什么状态」供智能恢复，离开已完成时清空
 * @param {string} id
 * @param {string} status
 * @returns {Promise<boolean>}
 */
export async function setTodoStatus(id, status) {
  const current = findTodo(id);
  if (!current) return false;
  // 非法状态直接拒：乐观更新一个不存在的状态，回滚时没有可比对的基准
  if (!isTodoStatus(status)) return false;
  if (current.status === status) return true;

  const now = Date.now();
  const next = { ...current, status, updatedAt: now };

  if (status === TODO_STATUS.DONE) {
    next.completedAt = now;
    // 只有从待处理/处理中进入已完成才记，已完成自身不覆盖已有记录
    if (current.status !== TODO_STATUS.DONE) next.prevStatus = current.status;
  } else if (current.status === TODO_STATUS.DONE) {
    next.completedAt = null;
    next.prevStatus = null;
    // 不动 order：已完成期间其它条目的 order 并未重排，保留原值恰好回到原位
    //（以前在这里补 nextOrder 把它挤到末尾，撤销一次完成就会跳位置）
  }

  replaceTodo(next);
  const ok = await queueWrite(() => putTodo(next)).catch(e => {
    logger.error('[Todo] set status failed:', e);
    return false;
  });
  if (!ok) {
    replaceTodo(current);
    emitChange();
    return false;
  }
  emitChange();
  // 完成流水：进入已完成记 +1；离开已完成把「完成那天」的 +1 撤回去（可能已跨天）
  if (status === TODO_STATUS.DONE && current.status !== TODO_STATUS.DONE) {
    await recordTodoStat('done', 1, next.completedAt);
  } else if (current.status === TODO_STATUS.DONE && status !== TODO_STATUS.DONE) {
    await recordTodoStat('done', -1, current.completedAt);
  }
  return true;
}

/** 状态圈点击：待处理 → 处理中 → 已完成 → 待处理 */
export function cycleTodoStatus(id) {
  const current = findTodo(id);
  if (!current) return Promise.resolve(false);
  return setTodoStatus(id, nextStatus(current.status));
}

/**
 * 把已完成条目恢复到它完成前的状态（没记到则回待办）
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export function restoreTodo(id) {
  const current = findTodo(id);
  if (!current) return Promise.resolve(false);
  if (current.status !== TODO_STATUS.DONE) return Promise.resolve(false);
  return setTodoStatus(id, restoreTarget(current));
}

/**
 * 设置优先级（null 为取消）
 * @param {string} id
 * @param {string|null} priority
 * @returns {Promise<boolean>}
 */
export function setTodoPriority(id, priority) {
  return updateTodo(id, { priority: normalizePriority(priority) });
}

/**
 * 关联外部链接。校验先于乐观更新：非法链接不能先渲染再回滚。
 * @param {string} id
 * @param {string} raw 用户原始输入（可不带协议；空串 = 移除链接）
 * @returns {Promise<{ok: boolean, reason: string}>}
 */
export async function setTodoLink(id, raw) {
  const current = findTodo(id);
  if (!current) return { ok: false, reason: 'missing' };
  const parsed = normalizeLink(raw);
  if (!parsed.valid) return { ok: false, reason: 'invalid' };
  const ok = await updateTodo(id, { link: parsed.url });
  return { ok, reason: ok ? '' : 'save' };
}

/**
 * 删除单条
 * @returns {Promise<boolean>}
 */
export async function removeTodo(id) {
  const current = findTodo(id);
  if (!current) return false;

  state.todos = state.todos.filter(item => item.id !== id);
  const ok = await queueWrite(() => deleteTodo(id)).catch(e => {
    logger.error('[Todo] delete failed:', e);
    return false;
  });
  if (!ok) {
    // 补回本条（顺序回到删除前的位置无关紧要：落库没成，重载即以库为准）
    state.todos = [...state.todos, current];
    emitChange();
    return false;
  }
  emitChange();
  return true;
}

/**
 * 待办列表内拖拽重排
 * @param {number} fromIndex
 * @param {number} toIndex
 * @returns {Promise<boolean>}
 */
export async function reorderActiveTodos(fromIndex, toIndex) {
  const { active } = getTodoGroups();
  if (fromIndex === toIndex) return true;
  if (fromIndex < 0 || fromIndex >= active.length) return false;

  const ordered = withOrder(reorderList(active, fromIndex, toIndex));
  const byId = new Map(ordered.map(item => [item.id, item]));
  const previous = state.todos;
  state.todos = state.todos.map(item => byId.get(item.id) || item);

  const ok = await queueWrite(() => putTodos(ordered)).catch(e => {
    logger.error('[Todo] reorder failed:', e);
    return false;
  });
  if (!ok) {
    // 重排只动 order 这一个字段 → 回滚也只还原 order，不把重排前抓的整份对象盖回去
    //（否则期间别人改过的标题/备注会被一次失败的重排抹掉）
    const orderById = new Map(previous.map(item => [item.id, item.order]));
    state.todos = state.todos.map(item => (
      orderById.has(item.id) ? { ...item, order: orderById.get(item.id) } : item
    ));
    emitChange();
    return false;
  }
  emitChange();
  return true;
}

/** 清除全部已完成 */
export async function clearCompletedTodos() {
  const { done } = getTodoGroups();
  if (done.length === 0) return true;
  const ids = done.map(item => item.id);
  const previous = state.todos;
  state.todos = state.todos.filter(item => !ids.includes(item.id));
  const ok = await queueWrite(() => deleteTodos(ids)).catch(e => {
    logger.error('[Todo] clear completed failed:', e);
    return false;
  });
  if (!ok) {
    // 只补回本次清掉的已完成条目，不连带抹掉期间新增或改动的条目
    const present = new Set(state.todos.map(item => item.id));
    const restored = previous.filter(item => ids.includes(item.id) && !present.has(item.id));
    state.todos = [...state.todos, ...restored];
    emitChange();
    return false;
  }
  emitChange();
  return true;
}

/** 未完成计数（入口徽标） */
export function countActiveTodos() {
  return getTodoGroups().active.length;
}

/**
 * 导入待办
 * - merge：只把新增条目追加到末尾，同 id 跳过，不动已有条目；
 * - replace：先整表删除再写入（调用方必须已做二次确认），写失败时把旧数据写回。
 * @param {Array<Object>} incoming - 文件里的条目（未规范化）
 * @param {'merge'|'replace'} [mode]
 * @returns {Promise<{ok: boolean, added: number, skipped: number, reason?: string}>}
 */
export async function importTodos(incoming, mode = 'merge') {
  if (mode === 'replace') return replaceAllTodos(incoming);

  const merged = mergeTodoImport(state.todos, incoming);
  if (merged.addedItems.length === 0) {
    return { ok: true, added: 0, skipped: merged.skipped };
  }

  const previous = state.todos;
  state.todos = merged.todos;
  const addedIds = new Set(merged.addedItems.map(item => item.id));
  const ok = await queueWrite(() => putTodos(merged.addedItems)).catch(e => {
    logger.error('[Todo] import merge failed:', e);
    return false;
  });
  if (!ok) {
    // 只摘掉本次新加的，期间别人改过的条目不连带回滚
    state.todos = previous.filter(item => !addedIds.has(item.id));
    emitChange();
    return { ok: false, added: 0, skipped: merged.skipped };
  }
  emitChange();
  return { ok: true, added: merged.addedItems.length, skipped: merged.skipped };
}

/** 替换：旧数据全删 + 新数据写入，两步都成才算成功 */
async function replaceAllTodos(incoming) {
  const { addedItems, skipped } = mergeTodoImport([], incoming);
  if (addedItems.length === 0) {
    // 没有可用条目不等于「清空」：宁可拒导，也不能把用户现有清单换没了
    return { ok: false, added: 0, skipped, reason: 'empty' };
  }

  const previous = state.todos;
  const previousIds = previous.map(item => item.id);
  state.todos = addedItems;

  const ok = await queueWrite(async () => {
    if (previousIds.length > 0) {
      const removed = await deleteTodos(previousIds).catch(e => {
        logger.error('[Todo] replace delete failed:', e);
        return false;
      });
      if (!removed) return false;
    }
    const written = await putTodos(addedItems).catch(e => {
      logger.error('[Todo] replace write failed:', e);
      return false;
    });
    if (!written) {
      // 旧数据已经删掉了：不写回去，一次失败的替换就会真的把库清空
      if (previousIds.length > 0) await putTodos(previous).catch(() => false);
      return false;
    }
    return true;
  }).catch(e => {
    logger.error('[Todo] replace failed:', e);
    return false;
  });

  if (!ok) {
    state.todos = previous;
    emitChange();
    return { ok: false, added: 0, skipped };
  }
  emitChange();
  return { ok: true, added: addedItems.length, skipped };
}
