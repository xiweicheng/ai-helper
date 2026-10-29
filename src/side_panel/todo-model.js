// side_panel/todo-model.js - 待办纯逻辑（不触碰 DOM，便于单测）
//
// 面板只负责渲染与事件，分组/排序/状态流转/优先级与链接校验/时间文案/Markdown 导出都在这里，
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
    active: '待办',
    done: '已完成',
    note: '备注',
    due: '截止',
    highPriority: '高优先级',
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
    active: 'To do',
    done: 'Done',
    note: 'Note',
    due: 'Due',
    highPriority: 'high priority',
    prompt: 'Based on the todos above, propose an implementation order and call out risks.',
  },
});

export const TODO_STATUS = { PENDING: 'pending', DOING: 'doing', DONE: 'done' };

/** 优先级：只三档 + 未设置，不做自定义权重（用户要的是「哪条先做」，不是甘特图） */
export const TODO_PRIORITY = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

const STATUS_CYCLE = [TODO_STATUS.PENDING, TODO_STATUS.DOING, TODO_STATUS.DONE];

const PRIORITY_LEVELS = [TODO_PRIORITY.HIGH, TODO_PRIORITY.MEDIUM, TODO_PRIORITY.LOW];

/** 外部链接只放行这两种协议：链接是用户手输内容，javascript:/data: 进 href 就是自伤 XSS */
const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:'];

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

/** 优先级白名单；非法值一律归为「未设置」，不报错也不丢数据 */
export function normalizePriority(priority) {
  return PRIORITY_LEVELS.includes(priority) ? priority : null;
}

/**
 * 解析用户手输入的链接。
 * 不带协议时补 https://（粘一条 example.com/x 也要能直接用）；补完仍解析失败
 * 或协议不在白名单内 → valid:false，调用方不得落库。
 * @param {string|number|null} raw
 * @returns {{url: string, host: string, valid: boolean}}
 */
export function normalizeLink(raw) {
  // 先剔前导斜杠，否则 //example.com 补完协议会变成四个斜杠的怪地址
  const text = String(raw ?? '').trim().replace(/^\/+/, '');
  if (!text) return { url: '', host: '', valid: true };
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let parsed = null;
  try {
    parsed = new URL(candidate);
  } catch (e) {
    return { url: '', host: '', valid: false };
  }
  if (!ALLOWED_LINK_PROTOCOLS.includes(parsed.protocol)) return { url: '', host: '', valid: false };
  return { url: parsed.href, host: linkHost(parsed.hostname), valid: true };
}

/** 展示用域名：去 www 前缀，过长截断 */
function linkHost(hostname, max = 22) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  return host.length > max ? `${host.slice(0, max - 1)}…` : host;
}

/** 已存链接的展示文案；无链接返回空串 */
export function linkLabel(todo) {
  const { url, host } = normalizeLink(todo && todo.link);
  return url ? host : '';
}

/** 链接是否可打开（库里的旧值可能被手改坏，点击前再校一次） */
export function isLinkOpenable(link) {
  const { url, valid } = normalizeLink(link);
  return valid && !!url;
}

/**
 * 已完成条目「恢复到哪里」：优先回到完成前的状态，没记到就回待办
 * @param {{prevStatus?: string|null}} todo
 */
export function restoreTarget(todo) {
  const prev = todo && todo.prevStatus;
  return prev === TODO_STATUS.DOING ? TODO_STATUS.DOING : TODO_STATUS.PENDING;
}

/**
 * 生成一条待办
 * @param {string} title
 * @param {{note?: string, dueAt?: number|null, priority?: string|null, link?: string}} [extra]
 * @param {number} [now]
 */
export function createTodo(title, extra = {}, now = Date.now()) {
  return {
    id: 'todo_' + now.toString(36) + '_' + Math.random().toString(36).substring(2, 6),
    title: String(title || '').trim(),
    note: String(extra.note || '').trim(),
    status: TODO_STATUS.PENDING,
    // 新条目只会是待处理，不存在「完成前状态」
    prevStatus: null,
    priority: normalizePriority(extra.priority),
    link: normalizeLink(extra.link).url,
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
  const status = isTodoStatus(todo.status) ? todo.status : TODO_STATUS.PENDING;
  return {
    id: String(todo.id || ''),
    title: String(todo.title || '').trim(),
    note: String(todo.note || ''),
    status,
    // prevStatus 只在「已完成」身上有意义，其余情况一律丢掉脏值
    prevStatus: status === TODO_STATUS.DONE
      && isTodoStatus(todo.prevStatus)
      && todo.prevStatus !== TODO_STATUS.DONE
      ? todo.prevStatus
      : null,
    priority: normalizePriority(todo.priority),
    // 库里存量的非法链接（手改/旧版本写入）读进来就当没链接，不渲染成可点元素
    link: normalizeLink(todo.link).url,
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
      // 只标高优先级：三档都标会让清单变成噪声，而「先做哪条」只需要顶部几条亮出来
      const prio = todo.priority === TODO_PRIORITY.HIGH
        ? `（${t('todoDigest.highPriority')}）`
        : '';
      const link = normalizeLink(todo.link).url
        ? ` [${linkLabel(todo)}](${normalizeLink(todo.link).url})`
        : '';
      lines.push(`- [ ] ${flag}${oneLine(todo.title)}${prio}${due}${link}`);
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
      const url = normalizeLink(todo.link).url;
      const link = url ? ` [${linkLabel(todo)}](${url})` : '';
      lines.push(`- [x] ${oneLine(todo.title)}${stamp}${link}`);
    }
  }

  if (options.withPrompt) {
    lines.push('');
    lines.push(t('todoDigest.prompt'));
  }

  return lines.join('\n');
}
