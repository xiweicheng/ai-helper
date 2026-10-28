// side_panel/todo-model.js - 待办纯逻辑（不触碰 DOM，便于单测）
//
// 面板只负责渲染与事件，分组/排序/状态流转/时间文案/Markdown 导出都在这里，
// 这样这些规则可以脱离浏览器环境直接跑单测。

import { t, registerTranslations, getLanguage } from '../shared/i18n.js';

registerTranslations('zh', {
  todoTime: {
    justNow: '刚刚',
    minutesAgo: '{n} 分钟前',
    hoursAgo: '{n} 小时前',
    daysAgo: '{n} 天前',
    today: '今天',
    tomorrow: '明天',
    yesterday: '昨天',
    doneStamp: '{date} 完成',
    overdueStamp: '已逾期 {date}',
  },
  todoDigest: {
    active: '进行中',
    done: '已完成',
    note: '备注',
    due: '截止',
    prompt: '请基于以上待办，给出实施顺序与风险提示。',
  },
});

registerTranslations('en', {
  todoTime: {
    justNow: 'just now',
    minutesAgo: '{n} min ago',
    hoursAgo: '{n} h ago',
    daysAgo: '{n} d ago',
    today: 'Today',
    tomorrow: 'Tomorrow',
    yesterday: 'Yesterday',
    doneStamp: 'done {date}',
    overdueStamp: 'overdue {date}',
  },
  todoDigest: {
    active: 'In progress',
    done: 'Done',
    note: 'Note',
    due: 'Due',
    prompt: 'Based on the todos above, propose an implementation order and call out risks.',
  },
});

export const TODO_STATUS = { PENDING: 'pending', DOING: 'doing', DONE: 'done' };

const STATUS_CYCLE = [TODO_STATUS.PENDING, TODO_STATUS.DOING, TODO_STATUS.DONE];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 状态圈点击循环：待处理 → 处理中 → 已完成 → 待处理
 * @param {string} status
 * @returns {string}
 */
export function nextStatus(status) {
  const idx = STATUS_CYCLE.indexOf(status);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

/** 某一状态是否可以切换（非法状态按待处理处理） */
export function isTodoStatus(status) {
  return STATUS_CYCLE.includes(status);
}

/**
 * 生成一条待办
 * @param {string} title
 * @param {{note?: string, dueAt?: number|null}} [extra]
 * @param {number} [now]
 */
export function createTodo(title, extra = {}, now = Date.now()) {
  return {
    id: 'todo_' + now.toString(36) + '_' + Math.random().toString(36).substring(2, 6),
    title: String(title || '').trim(),
    note: String(extra.note || '').trim(),
    status: TODO_STATUS.PENDING,
    order: 0,
    dueAt: Number.isFinite(extra.dueAt) ? extra.dueAt : null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

/**
 * 兜底规范化：历史数据/异常数据缺失字段时补默认值
 */
export function normalizeTodo(raw) {
  const todo = raw && typeof raw === 'object' ? raw : {};
  const createdAt = Number.isFinite(todo.createdAt) ? todo.createdAt : Date.now();
  return {
    id: String(todo.id || ''),
    title: String(todo.title || '').trim(),
    note: String(todo.note || ''),
    status: isTodoStatus(todo.status) ? todo.status : TODO_STATUS.PENDING,
    order: Number.isFinite(todo.order) ? todo.order : Number.MAX_SAFE_INTEGER,
    dueAt: Number.isFinite(todo.dueAt) ? todo.dueAt : null,
    createdAt,
    updatedAt: Number.isFinite(todo.updatedAt) ? todo.updatedAt : createdAt,
    completedAt: Number.isFinite(todo.completedAt) ? todo.completedAt : null,
  };
}

/** 进行中组排序：手写 order 优先，缺失回退创建时间 */
function compareActive(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return a.createdAt - b.createdAt;
}

/** 已完成组排序：最近完成的在前 */
function compareDone(a, b) {
  return (b.completedAt || b.updatedAt || 0) - (a.completedAt || a.updatedAt || 0);
}

/**
 * 两段式分组
 * @param {Array<Object>} todos
 * @returns {{active: Array<Object>, done: Array<Object>, stats: {total: number, done: number, active: number}}}
 */
export function groupTodos(todos) {
  const list = Array.isArray(todos) ? todos.map(normalizeTodo) : [];
  const active = [];
  const done = [];
  for (const todo of list) {
    if (todo.status === TODO_STATUS.DONE) done.push(todo);
    else active.push(todo);
  }
  active.sort(compareActive);
  done.sort(compareDone);
  return {
    active,
    done,
    stats: { total: list.length, done: done.length, active: active.length },
  };
}

/**
 * 数组内移动一项（拖拽排序的纯计算部分）
 * @param {Array} list
 * @param {number} fromIndex
 * @param {number} toIndex - 目标位置（以移除源项后的下标计）
 * @returns {Array} 新数组
 */
export function reorderList(list, fromIndex, toIndex) {
  const next = Array.isArray(list) ? list.slice() : [];
  if (fromIndex < 0 || fromIndex >= next.length) return next;
  const [moved] = next.splice(fromIndex, 1);
  const target = Math.max(0, Math.min(toIndex, next.length));
  next.splice(target, 0, moved);
  return next;
}

/**
 * 按数组下标重写 order（0..n-1），返回新对象数组；不修改入参
 * @param {Array<Object>} list - 已排好序的列表
 * @param {number} [now]
 */
export function withOrder(list, now = Date.now()) {
  return (Array.isArray(list) ? list : []).map((todo, index) => (
    todo.order === index ? todo : { ...todo, order: index, updatedAt: now }
  ));
}

/** 新条目应落在进行中组的末尾 */
export function nextOrder(todos) {
  const { active } = groupTodos(todos);
  const max = active.reduce((acc, todo) => (
    Number.isFinite(todo.order) && todo.order < Number.MAX_SAFE_INTEGER
      ? Math.max(acc, todo.order)
      : acc
  ), -1);
  return max + 1;
}

// ==================== 时间文案 ====================

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 日期文案：本年只给月日，跨年带年份 */
export function formatTodoDate(ts, now = Date.now()) {
  const d = new Date(ts);
  const n = new Date(now);
  if (isNaN(d.getTime())) return '';
  if (getLanguage() === 'en') {
    const month = d.toLocaleString('en-US', { month: 'short' });
    return d.getFullYear() === n.getFullYear()
      ? `${month} ${d.getDate()}`
      : `${month} ${d.getDate()}, ${d.getFullYear()}`;
  }
  return d.getFullYear() === n.getFullYear()
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 创建时间的相对文案：刚刚 / n 分钟前 / n 小时前 / n 天前 / 具体日期
 */
export function formatRelativeTime(ts, now = Date.now()) {
  if (!Number.isFinite(ts)) return '';
  const diff = now - ts;
  if (diff < MINUTE) return t('todoTime.justNow');
  if (diff < HOUR) return t('todoTime.minutesAgo', { n: Math.floor(diff / MINUTE) });
  if (diff < DAY) return t('todoTime.hoursAgo', { n: Math.floor(diff / HOUR) });
  if (diff < 7 * DAY) return t('todoTime.daysAgo', { n: Math.floor(diff / DAY) });
  return formatTodoDate(ts, now);
}

/**
 * 截止时间文案：今天 / 明天 / 昨天 / 具体日期
 */
export function formatDueAt(dueAt, now = Date.now()) {
  if (!Number.isFinite(dueAt)) return '';
  const due = new Date(dueAt);
  const today = new Date(now);
  if (isNaN(due.getTime())) return '';
  if (sameDay(due, today)) return t('todoTime.today');
  const dayDiff = Math.round((startOfDay(due) - startOfDay(today)) / DAY);
  if (dayDiff === 1) return t('todoTime.tomorrow');
  if (dayDiff === -1) return t('todoTime.yesterday');
  return formatTodoDate(dueAt, now);
}

/** 已完成条目的完成时间文案 */
export function formatDoneStamp(todo, now = Date.now()) {
  const ts = todo && Number.isFinite(todo.completedAt) ? todo.completedAt : todo && todo.updatedAt;
  if (!Number.isFinite(ts)) return '';
  return t('todoTime.doneStamp', { date: formatTodoDate(ts, now) });
}

/** 截止日是否已过（按天比较，今天不算逾期） */
export function isOverdue(todo, now = Date.now()) {
  if (!todo || !Number.isFinite(todo.dueAt)) return false;
  if (todo.status === TODO_STATUS.DONE) return false;
  const todayStart = startOfDay(new Date(now));
  return startOfDay(new Date(todo.dueAt)) < todayStart;
}

// ==================== Markdown 导出 ====================

function oneLine(text) {
  return String(text || '').replace(/\s*\n+\s*/g, ' ').trim();
}

/**
 * 生成填入输入框的 Markdown 清单
 * @param {Array<Object>} todos
 * @param {{withPrompt?: boolean, now?: number}} [options]
 * @returns {string} 无待办时返回空串
 */
export function buildTodoDigest(todos, options = {}) {
  const now = options.now || Date.now();
  const { active, done } = groupTodos(todos);
  if (active.length === 0 && done.length === 0) return '';

  const lines = [];

  if (active.length > 0) {
    lines.push(`**${t('todoDigest.active')}**`);
    for (const todo of active) {
      const flag = todo.status === TODO_STATUS.DOING ? '⏳ ' : '';
      const due = Number.isFinite(todo.dueAt)
        ? `（${t('todoDigest.due')} ${formatDueAt(todo.dueAt, now)}）`
        : '';
      lines.push(`- [ ] ${flag}${oneLine(todo.title)}${due}`);
      if (todo.note && todo.note.trim()) {
        lines.push(`  - ${t('todoDigest.note')}：${oneLine(todo.note)}`);
      }
    }
  }

  if (done.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`**${t('todoDigest.done')}**`);
    for (const todo of done) {
      const stamp = Number.isFinite(todo.completedAt)
        ? `（${t('todoTime.doneStamp', { date: formatTodoDate(todo.completedAt, now) })}）`
        : '';
      lines.push(`- [x] ${oneLine(todo.title)}${stamp}`);
    }
  }

  if (options.withPrompt) {
    lines.push('');
    lines.push(t('todoDigest.prompt'));
  }

  return lines.join('\n');
}
