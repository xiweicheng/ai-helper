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
  },
  todoExport: {
    title: '待办清单',
    count: '共 {n} 条',
    scopeAll: '全部',
    scopeActive: '仅待办',
    scopeDone: '仅已完成',
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
  },
  todoExport: {
    title: 'Todo list',
    count: '{n} items',
    scopeAll: 'All',
    scopeActive: 'To do only',
    scopeDone: 'Done only',
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

/** 导出文件格式版本：导入端靠它判断能不能认，字段只增不改语义 */
export const TODO_EXPORT_VERSION = 1;

const EXPORT_SCOPES = ['all', 'active', 'done'];

/** 导出字段白名单：只带这些出去，内部临时字段不写进文件 */
const EXPORT_FIELDS = [
  'id', 'title', 'note', 'status', 'prevStatus', 'priority',
  'link', 'order', 'dueAt', 'createdAt', 'updatedAt', 'completedAt',
];

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
 * 优先级循环：高 → 中 → 低 → 未设置 → 高（快捷键 Alt+P）
 * 脏值先归为未设置，不把非法值写进库
 * @param {string|null} priority
 * @returns {string|null}
 */
export function nextPriority(priority) {
  const current = normalizePriority(priority);
  if (!current) return PRIORITY_LEVELS[0];
  const idx = PRIORITY_LEVELS.indexOf(current);
  return idx === PRIORITY_LEVELS.length - 1 ? null : PRIORITY_LEVELS[idx + 1];
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

/** 生成新 id：时间戳 + 随机尾，同一毫秒里连建多条也不会撞 */
function makeTodoId(now) {
  return 'todo_' + now.toString(36) + '_' + Math.random().toString(36).substring(2, 6);
}

/**
 * 生成一条待办
 * @param {string} title
 * @param {{note?: string, dueAt?: number|null, priority?: string|null, link?: string}} [extra]
 * @param {number} [now]
 */
export function createTodo(title, extra = {}, now = Date.now()) {
  return {
    id: makeTodoId(now),
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
    // pending/doing 分开数：进度行要能说「处理中还有几条」，只看 active 总数看不出来
    stats: {
      total: list.length,
      done: done.length,
      active: active.length,
      pending: active.filter(todo => todo.status === TODO_STATUS.PENDING).length,
      doing: active.filter(todo => todo.status === TODO_STATUS.DOING).length,
    },
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
 * 单条目那一行：批量清单与单条组合文本共用，避免两处格式漂移
 * 已完成 → [x]；待处理 / 处理中 → [ ]（处理中加 ⏳）
 */
function itemLine(todo, now) {
  const url = normalizeLink(todo.link).url;
  const link = url ? ` [${linkLabel(todo)}](${url})` : '';
  if (todo.status === TODO_STATUS.DONE) {
    const stamp = Number.isFinite(todo.completedAt)
      ? `（${t('todoTime.doneStamp', { date: formatTodoDate(todo.completedAt, now) })}）`
      : '';
    return `- [x] ${oneLine(todo.title)}${stamp}${link}`;
  }
  const flag = todo.status === TODO_STATUS.DOING ? '⏳ ' : '';
  const due = Number.isFinite(todo.dueAt)
    ? `（${t('todoDigest.due')} ${formatDueAt(todo.dueAt, now)}）`
    : '';
  // 只标高优先级：三档都标会让清单变成噪声，而「先做哪条」只需要顶部几条亮出来
  const prio = todo.priority === TODO_PRIORITY.HIGH
    ? `（${t('todoDigest.highPriority')}）`
    : '';
  return `- [ ] ${flag}${oneLine(todo.title)}${prio}${due}${link}`;
}

/** 备注行：缩进挂在条目下（没有备注返回空串） */
function noteLine(todo) {
  if (!todo.note || !todo.note.trim()) return '';
  return `  - ${t('todoDigest.note')}：${oneLine(todo.note)}`;
}

/**
 * 单条待办的组合文本：填入输入框 / 复制 / 拖拽三处共用
 *
 * 标题、状态、优先级、截止、备注、链接一次带全：拖到输入框后能直接追问 AI
 * 做规划，不用再回面板里把信息找一遍。
 * @param {Object} todo
 * @param {{now?: number}} [options]
 * @returns {string} 无标题时返回空串
 */
export function buildItemDigest(todo, options = {}) {
  const item = normalizeTodo(todo);
  if (!item.title) return '';
  const now = options.now || Date.now();
  const lines = [itemLine(item, now)];
  const note = noteLine(item);
  if (note) lines.push(note);
  return lines.join('\n');
}

/**
 * 生成填入输入框的 Markdown 清单
 * @param {Array<Object>} todos
 * @param {{now?: number}} [options]
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
      lines.push(itemLine(todo, now));
      const note = noteLine(todo);
      if (note) lines.push(note);
    }
  }

  if (done.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`**${t('todoDigest.done')}**`);
    for (const todo of done) {
      lines.push(itemLine(todo, now));
    }
  }

  return lines.join('\n');
}

// ==================== 导入导出 ====================

function resolveScope(scope) {
  return EXPORT_SCOPES.includes(scope) ? scope : 'all';
}

/**
 * 按导出范围挑条目：全部 / 仅待办 / 仅已完成
 * 顺序沿用面板里的分组顺序（待办在前按手写序，已完成在后按完成时间倒序），
 * 导出的文件打开后与用户眼前看到的一致
 * @param {Array<Object>} todos
 * @param {'all'|'active'|'done'} [scope]
 */
export function selectTodosForExport(todos, scope = 'all') {
  const { active, done } = groupTodos(todos);
  const picked = resolveScope(scope);
  if (picked === 'active') return active;
  if (picked === 'done') return done;
  return [...active, ...done];
}

/** 只输出白名单字段，保证导出文件干净且可回导 */
function exportableTodo(todo) {
  const item = normalizeTodo(todo);
  const out = {};
  for (const key of EXPORT_FIELDS) out[key] = item[key];
  return out;
}

/**
 * JSON 导出载荷：带 kind/version/scope/exportedAt，导入端据此校验
 * @param {Array<Object>} todos
 * @param {{scope?: string, now?: number}} [options]
 */
export function buildTodoExportPayload(todos, options = {}) {
  const scope = resolveScope(options.scope);
  return {
    kind: 'todos',
    version: TODO_EXPORT_VERSION,
    scope,
    exportedAt: options.now || Date.now(),
    todos: selectTodosForExport(todos, scope).map(exportableTodo),
  };
}

/**
 * Markdown 导出：头部写清范围与条数，条目复用清单格式（与填入输入框一致）
 * @param {Array<Object>} todos
 * @param {{scope?: string, now?: number}} [options]
 */
export function buildTodoMarkdownExport(todos, options = {}) {
  const scope = resolveScope(options.scope);
  const now = options.now || Date.now();
  const list = selectTodosForExport(todos, scope);
  const scopeLabel = t(`todoExport.scope${scope === 'active' ? 'Active' : scope === 'done' ? 'Done' : 'All'}`);
  const lines = [
    `# ${t('todoExport.title')}（${scopeLabel} · ${t('todoExport.count', { n: list.length })}）`,
    '',
  ];
  for (const todo of list) {
    lines.push(itemLine(todo, now));
    // 导出要保真：已完成条目的备注也带上，回导后不丢信息
    const note = noteLine(todo);
    if (note) lines.push(note);
  }
  return lines.join('\n');
}

/**
 * 解析导入内容：接受导出文件（{todos:[]}）与裸数组，其余一律判格式错
 * 非对象条目直接剔除，由合并阶段计入跳过
 * @param {*} raw - 已 JSON.parse 的内容
 * @returns {{ok: true, todos: Array<Object>} | {ok: false, reason: string}}
 */
export function parseTodoImport(raw) {
  let list = null;
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object' && Array.isArray(raw.todos)) list = raw.todos;
  if (!list) return { ok: false, reason: 'format' };
  return { ok: true, todos: list.filter(item => item && typeof item === 'object' && !Array.isArray(item)) };
}

/**
 * 合并导入：只往后追加，同 id 跳过不覆盖（合并是安全项，覆盖留给「替换」二次确认）
 * @param {Array<Object>} base - 库里现有条目
 * @param {Array<Object>} incoming - 文件里的条目（原始对象，未规范化）
 * @param {number} [now]
 * @returns {{todos: Array<Object>, addedItems: Array<Object>, added: number, skipped: number}}
 */
export function mergeTodoImport(base, incoming, now = Date.now()) {
  const existing = (Array.isArray(base) ? base : []).map(normalizeTodo);
  const seen = new Set(existing.map(item => item.id).filter(Boolean));
  let order = existing.reduce((acc, item) => (
    Number.isFinite(item.order) && item.order < Number.MAX_SAFE_INTEGER
      ? Math.max(acc, item.order)
      : acc
  ), -1) + 1;

  const addedItems = [];
  let skipped = 0;
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const title = String((raw && raw.title) || '').trim();
    if (!title) {
      skipped += 1;
      continue;
    }
    let id = String((raw && raw.id) || '').trim();
    if (id && seen.has(id)) {
      skipped += 1;
      continue;
    }
    if (!id) id = makeTodoId(now);
    seen.add(id);
    // order 由合并端重排：文件里的旧序号跟当前库无关，照抄会和现有条目撞位
    addedItems.push({ ...normalizeTodo({ ...raw, id, title }), order: order++ });
  }

  return { todos: [...existing, ...addedItems], addedItems, added: addedItems.length, skipped };
}
