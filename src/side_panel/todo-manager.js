// side_panel/todo-manager.js - 待办状态编排（state 缓存 + IndexedDB 持久化）
//
// 写操作统一「先改 state，再落库，失败回滚」，落库失败由调用方决定如何提示；
// 视图层通过 subscribe() 订阅变更，不直接操作 state.todos。
//
// 两条约束（都是踩过的坑，见 CHANGELOG）：
// 1. 落库走 queueWrite 串行：并发写各自抓的「整表快照」会互踩 —— A 失败时若整表
//    还原，会把期间 B 已经落库成功的变更也从内存里抹掉，内存/视图/IndexedDB 三方分叉。
//    因此六个写操作失败时都只撤销自己涉入的那几条（单条直接还原本条，重排只还原
//    order 字段，清除只补回被清条目）。
// 2. 回滚必须 emitChange：乐观值已经渲染给用户了，回滚不广播就等于「界面说删掉了，
//    库里其实没动」。

import state from './state.js';
import { getAllTodos, putTodo, putTodos, deleteTodo, deleteTodos } from '../storage/db.js';
import {
  TODO_STATUS,
  createTodo,
  normalizeTodo,
  groupTodos,
  reorderList,
  withOrder,
  nextOrder,
  nextStatus,
} from './todo-model.js';
import logger from '../shared/logger.js';

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

/** 两段式分组结果（进行中 / 已完成） */
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
 * 新增一条待办（落在进行中组末尾）
 * @param {string} title
 * @param {{note?: string, dueAt?: number|null}} [extra]
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
  return todo;
}

/**
 * 更新标题 / 备注 / 截止时间
 * @param {string} id
 * @param {{title?: string, note?: string, dueAt?: number|null}} patch
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
 * 指定的状态切换；进入已完成记录 completedAt，离开已完成则清空并排到末尾
 * @param {string} id
 * @param {string} status
 * @returns {Promise<boolean>}
 */
export async function setTodoStatus(id, status) {
  const current = findTodo(id);
  if (!current) return false;

  const now = Date.now();
  const next = { ...current, status, updatedAt: now };

  if (status === TODO_STATUS.DONE) {
    next.completedAt = now;
  } else if (current.status === TODO_STATUS.DONE) {
    // 从已完成捞回进行中：排到末尾，避免插回旧位置造成错乱
    next.completedAt = null;
    next.order = nextOrder(state.todos.filter(item => item.id !== id));
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
  return true;
}

/** 状态圈点击：待处理 → 处理中 → 已完成 → 待处理 */
export function cycleTodoStatus(id) {
  const current = findTodo(id);
  if (!current) return Promise.resolve(false);
  return setTodoStatus(id, nextStatus(current.status));
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
 * 进行中组内拖拽重排
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
