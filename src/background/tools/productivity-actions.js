// background/tools/productivity-actions.js - AI 对话直接操作待办 / 定时任务
//
// 待办与定时任务的写入口原本只在侧边栏面板（todo-manager / schedule-panel）。
// AI 工具跑在 background，拿不到侧边栏的内存缓存，因此这里直接写 IndexedDB：
// - 待办：复用 todo-model 的纯逻辑生成对象，落库后广播 TODO_CHANGED 让面板回读；
// - 定时任务：复用 scheduler.handleScheduledTaskCommand（校验 + alarms 注册的单一来源），
//   用动态 import 引入，避免 tool-executor ↔ scheduler 的模块初始化环。

import {
  getAllTodos,
  putTodo,
  deleteTodo,
  getAllScheduledTasks,
  getScheduledTask,
} from '../../storage/db.js';
import {
  TODO_STATUS,
  isTodoStatus,
  createTodo,
  normalizeTodo,
  normalizePriority,
  normalizeLink,
  groupTodos,
  nextOrder,
} from '../../side_panel/todo-model.js';
import logger from '../../shared/logger.js';
import { t, registerTranslations } from '../../shared/i18n.js';

registerTranslations('zh', {
  productivityTools: {
    unsupportedTodoAction: '不支持的 action: "{action}"，可用值：create / list / update / delete',
    todoFailed: '待办操作失败: {error}',
    missingTitle: '缺少待办标题（title）',
    emptyTitle: '标题不能为空',
    saveFailed: '待办保存失败',
    deleteFailed: '待办删除失败',
    needsId: '需要 id（可先调用 action=list 查询）',
    todoNotFound: '未找到 id 为 "{id}" 的待办，可先调用 action=list 查询',
    invalidStatus: 'status 只能是 pending / doing / done',
    invalidDueAt: '截止时间无法解析，请传绝对时间，如 2026-11-12 18:00',
    invalidLink: '链接格式无效，需要 http/https 地址',
    unsupportedScheduleAction: '不支持的 action: "{action}"，可用值：create / list / update / toggle / delete / run',
    scheduleFailed: '定时任务操作失败',
    missingSchedule: '缺少 schedule（type 与 value）',
    invalidScheduleType: 'schedule.type 只能是 once / interval / cron',
    emptyScheduleValue: 'schedule.value 不能为空',
    onceNeedsAbsolute: 'once 的 schedule.value 需要绝对时间，如 2026-11-12 18:00',
    schedulerTimeout: '定时任务操作超时',
    unsupportedSchedulerOp: '不支持的定时任务操作: {type}',
    schedulerLoadFailed: '定时任务模块加载失败: {error}',
    taskNotFound: '未找到 id 为 "{id}" 的定时任务',
    toggleNeedsEnabled: 'toggle 需要 enabled（true 启用 / false 停用）',
    runStarted: '任务已开始执行，结果会写入对应会话',
  },
});

registerTranslations('en', {
  productivityTools: {
    unsupportedTodoAction: 'Unsupported action: "{action}". Allowed: create / list / update / delete',
    todoFailed: 'Todo operation failed: {error}',
    missingTitle: 'Missing todo title',
    emptyTitle: 'Title cannot be empty',
    saveFailed: 'Failed to save todo',
    deleteFailed: 'Failed to delete todo',
    needsId: 'id is required (call action=list to look it up)',
    todoNotFound: 'Todo "{id}" not found (call action=list to look it up)',
    invalidStatus: 'status must be pending / doing / done',
    invalidDueAt: 'Cannot parse dueAt. Pass an absolute time such as 2026-11-12 18:00',
    invalidLink: 'Invalid link. An http/https URL is required',
    unsupportedScheduleAction: 'Unsupported action: "{action}". Allowed: create / list / update / toggle / delete / run',
    scheduleFailed: 'Scheduled task operation failed',
    missingSchedule: 'Missing schedule (type and value)',
    invalidScheduleType: 'schedule.type must be once / interval / cron',
    emptyScheduleValue: 'schedule.value cannot be empty',
    onceNeedsAbsolute: 'For once, schedule.value must be an absolute time such as 2026-11-12 18:00',
    schedulerTimeout: 'Scheduled task operation timed out',
    unsupportedSchedulerOp: 'Unsupported scheduled task command: {type}',
    schedulerLoadFailed: 'Failed to load scheduler: {error}',
    taskNotFound: 'Scheduled task "{id}" not found',
    toggleNeedsEnabled: 'toggle requires enabled (true/false)',
    runStarted: 'Task started; the result will be written to its session',
  },
});

const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 200;
const SCHEDULER_RESPONSE_TIMEOUT_MS = 20000;

function ok(payload) {
  return { success: true, content: JSON.stringify(payload) };
}

function fail(error) {
  return { success: false, error, content: error };
}

/** 侧边栏可能没打开：没有接收方时 sendMessage 会 reject，忽略即可 */
function broadcast(type, payload = {}) {
  try {
    chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
  } catch { /* 忽略广播失败 */ }
}

function toIso(ts) {
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

/**
 * 把模型给的截止/执行时间统一成时间戳。
 * 支持 epoch 毫秒、ISO 字符串、以及 "2026-11-12 18:00" 这类本地时间写法；
 * 相对时间（"明天下午三点"）无法在后台可靠解析，一律返回 null 由调用方拒绝。
 */
function toTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{10,}$/.test(text)) return Number(text);
  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/** 面板编辑用的是 datetime-local，只接受本地 "YYYY-MM-DDTHH:mm"，不能存 UTC ISO */
function toLocalDatetime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 截止时间：空值表示清除；无法解析直接报错，避免静默丢掉用户说的时间 */
function parseDueAt(value) {
  if (value === null || value === undefined || String(value).trim() === '') return { ts: null };
  const ts = toTimestamp(value);
  if (!Number.isFinite(ts)) return { error: t('productivityTools.invalidDueAt') };
  return { ts };
}

function summarizeTodo(todo) {
  return {
    id: todo.id,
    title: todo.title,
    status: todo.status,
    priority: todo.priority,
    note: todo.note || '',
    link: todo.link || '',
    dueAt: toIso(todo.dueAt),
    createdAt: toIso(todo.createdAt),
    completedAt: toIso(todo.completedAt),
  };
}

/**
 * manage_todo 执行入口
 * @param {{action: string, id?: string, title?: string, note?: string, priority?: string,
 *   dueAt?: string|number, link?: string, status?: string, scope?: string, limit?: number}} args
 */
export async function executeManageTodo(args = {}) {
  const action = String(args.action || '').trim().toLowerCase();

  try {
    if (action === 'create') return await createTodoItem(args);
    if (action === 'list') return await listTodoItems(args);
    if (action === 'update') return await updateTodoItem(args);
    if (action === 'delete') return await deleteTodoItem(args);
    return fail(t('productivityTools.unsupportedTodoAction', { action }));
  } catch (e) {
    logger.error('[Productivity] manage_todo failed:', e);
    return fail(t('productivityTools.todoFailed', { error: e?.message || e }));
  }
}

async function createTodoItem(args) {
  const title = String(args.title || '').trim();
  if (!title) return fail(t('productivityTools.missingTitle'));

  const link = normalizeLink(args.link);
  if (!link.valid) return fail(t('productivityTools.invalidLink'));
  const due = parseDueAt(args.dueAt);
  if (due.error) return fail(due.error);

  const all = await getAllTodos();
  const todo = createTodo(title, {
    note: args.note,
    priority: args.priority,
    link: link.url,
    dueAt: due.ts,
  });
  todo.order = nextOrder(all);

  const saved = await putTodo(todo);
  if (!saved) return fail(t('productivityTools.saveFailed'));
  broadcast('TODO_CHANGED');
  return ok({ created: summarizeTodo(todo) });
}

async function listTodoItems(args) {
  const all = (await getAllTodos()).map(normalizeTodo).filter(item => item.id && item.title);
  const { active, done, stats } = groupTodos(all);
  const scope = String(args.scope || 'active').toLowerCase();

  let picked;
  if (scope === 'done') picked = done;
  else if (scope === 'all') picked = [...active, ...done];
  else if (isTodoStatus(scope)) picked = all.filter(item => item.status === scope);
  else picked = active;

  const limit = Math.min(
    Math.max(Number(args.limit) || LIST_LIMIT_DEFAULT, 1),
    LIST_LIMIT_MAX,
  );

  return ok({
    total: stats.total,
    active: stats.active,
    done: stats.done,
    scope,
    returned: Math.min(picked.length, limit),
    todos: picked.slice(0, limit).map(summarizeTodo),
  });
}

async function updateTodoItem(args) {
  const id = String(args.id || '').trim();
  if (!id) return fail(t('productivityTools.needsId'));

  const all = (await getAllTodos()).map(normalizeTodo);
  const current = all.find(item => item.id === id);
  if (!current) return fail(t('productivityTools.todoNotFound', { id }));

  const now = Date.now();
  const next = { ...current, updatedAt: now };

  if (args.title !== undefined) {
    const title = String(args.title).trim();
    if (!title) return fail(t('productivityTools.emptyTitle'));
    next.title = title;
  }
  if (args.note !== undefined) next.note = String(args.note || '').trim();
  if (args.priority !== undefined) next.priority = normalizePriority(args.priority);
  if (args.link !== undefined) {
    const link = normalizeLink(args.link);
    if (!link.valid) return fail(t('productivityTools.invalidLink'));
    next.link = link.url;
  }
  if (args.dueAt !== undefined) {
    const due = parseDueAt(args.dueAt);
    if (due.error) return fail(due.error);
    next.dueAt = due.ts;
  }
  if (args.status !== undefined) {
    const status = String(args.status).toLowerCase();
    if (!isTodoStatus(status)) return fail(t('productivityTools.invalidStatus'));
    next.status = status;
    if (status === TODO_STATUS.DONE && current.status !== TODO_STATUS.DONE) {
      next.completedAt = now;
      next.prevStatus = current.status;
    } else if (current.status === TODO_STATUS.DONE && status !== TODO_STATUS.DONE) {
      next.completedAt = null;
      next.prevStatus = null;
    }
  }

  const saved = await putTodo(next);
  if (!saved) return fail(t('productivityTools.saveFailed'));
  broadcast('TODO_CHANGED');
  return ok({ updated: summarizeTodo(next) });
}

async function deleteTodoItem(args) {
  const id = String(args.id || '').trim();
  if (!id) return fail(t('productivityTools.needsId'));

  const all = await getAllTodos();
  const target = all.find(item => item.id === id);
  if (!target) return fail(t('productivityTools.todoNotFound', { id }));

  const removed = await deleteTodo(id);
  if (!removed) return fail(t('productivityTools.deleteFailed'));
  broadcast('TODO_CHANGED');
  return ok({ deleted: { id, title: target.title } });
}

// ==================== 定时任务 ====================

function summarizeTask(task) {
  return {
    id: task.id,
    name: task.name,
    prompt: task.prompt,
    schedule: task.schedule,
    enabled: task.enabled !== false,
    contextUrl: task.contextUrl || null,
    nextRunAt: toIso(task.nextRunAt),
    lastStatus: task.lastStatus || null,
    lastRunAt: toIso(task.lastRunAt),
    sessionId: task.sessionId || null,
  };
}

/** 定时规则：类型/值必须齐全，一次性任务未指定模式时按绝对时间处理 */
function normalizeSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') return { error: t('productivityTools.missingSchedule') };
  const type = String(schedule.type || '').toLowerCase();
  if (!['once', 'interval', 'cron'].includes(type)) {
    return { error: t('productivityTools.invalidScheduleType') };
  }
  let value = schedule.value;
  if (value === null || value === undefined || String(value).trim() === '') {
    return { error: t('productivityTools.emptyScheduleValue') };
  }
  value = String(value).trim();
  if (type === 'once') {
    const onceMode = schedule.onceMode === 'relative' ? 'relative' : 'absolute';
    if (onceMode === 'absolute') {
      const ts = toTimestamp(value);
      if (!Number.isFinite(ts)) return { error: t('productivityTools.onceNeedsAbsolute') };
      // 面板编辑用 datetime-local，必须存本地时间格式，UTC ISO 会被输入框清空
      value = toLocalDatetime(ts);
    }
    return { schedule: { type, value, onceMode } };
  }
  return { schedule: { type, value } };
}

function sendSchedulerCommand(message) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    };
    const timer = setTimeout(
      () => finish({ success: false, error: t('productivityTools.schedulerTimeout') }),
      SCHEDULER_RESPONSE_TIMEOUT_MS,
    );
    // 动态引入：scheduler 依赖 react-loop，而 tool-executor 又被 scheduler 引用
    import('../scheduler.js')
      .then((sched) => {
        const handled = sched.handleScheduledTaskCommand(message, finish);
        if (!handled) finish({ success: false, error: t('productivityTools.unsupportedSchedulerOp', { type: message.type }) });
      })
      .catch((e) => finish({ success: false, error: t('productivityTools.schedulerLoadFailed', { error: e?.message || e }) }));
  });
}

/**
 * manage_schedule 执行入口
 * @param {{action: string, id?: string, name?: string, prompt?: string,
 *   schedule?: {type: string, value: string, onceMode?: string}, description?: string,
 *   contextUrl?: string, contextMode?: string, sessionId?: string,
 *   maxRuns?: number, endAt?: string|number, enabled?: boolean}} args
 */
export async function executeManageSchedule(args = {}) {
  const action = String(args.action || '').trim().toLowerCase();
  const id = String(args.id || '').trim();

  try {
    if (action === 'list') return await listScheduledTasks();

    if (action === 'create') {
      const normalized = normalizeSchedule(args.schedule);
      if (normalized.error) return fail(normalized.error);
      const task = {
        name: String(args.name || '').trim(),
        description: String(args.description || '').trim(),
        prompt: String(args.prompt || '').trim(),
        schedule: normalized.schedule,
        contextUrl: args.contextUrl ? String(args.contextUrl) : null,
        contextMode: args.contextMode === 'url_only' ? 'url_only' : 'fetch',
        sessionId: args.sessionId ? String(args.sessionId) : null,
        maxRuns: args.maxRuns,
        endAt: toTimestamp(args.endAt),
        enabled: args.enabled !== false,
      };
      const res = await sendSchedulerCommand({ type: 'SCHEDULED_TASK_CREATE', task });
      if (!res?.success) return fail(res?.error || t('productivityTools.scheduleFailed'));
      broadcast('SCHEDULED_TASKS_CHANGED');
      return ok({ created: summarizeTask(res.task) });
    }

    if (action === 'update') {
      if (!id) return fail(t('productivityTools.needsId'));
      const existing = await getScheduledTask(id);
      if (!existing) return fail(t('productivityTools.taskNotFound', { id }));
      const normalized = args.schedule ? normalizeSchedule(args.schedule) : { schedule: existing.schedule };
      if (normalized.error) return fail(normalized.error);
      // handleScheduledTaskCommand 的 update 是整表覆盖，必须先与现有值合并再提交
      const task = {
        id,
        name: args.name !== undefined ? String(args.name).trim() : existing.name,
        description: args.description !== undefined ? String(args.description) : existing.description,
        prompt: args.prompt !== undefined ? String(args.prompt).trim() : existing.prompt,
        schedule: normalized.schedule,
        contextUrl: args.contextUrl !== undefined ? (args.contextUrl ? String(args.contextUrl) : null) : existing.contextUrl,
        contextMode: args.contextMode || existing.contextMode || 'fetch',
        sessionId: args.sessionId !== undefined ? (args.sessionId ? String(args.sessionId) : null) : existing.sessionId,
        maxRuns: args.maxRuns !== undefined ? args.maxRuns : existing.maxRuns,
        endAt: args.endAt !== undefined ? toTimestamp(args.endAt) : existing.endAt,
        enabled: args.enabled !== undefined ? args.enabled !== false : existing.enabled !== false,
      };
      const res = await sendSchedulerCommand({ type: 'SCHEDULED_TASK_UPDATE', task });
      if (!res?.success) return fail(res?.error || t('productivityTools.scheduleFailed'));
      broadcast('SCHEDULED_TASKS_CHANGED');
      return ok({ updated: summarizeTask(res.task) });
    }

    if (action === 'toggle') {
      if (!id) return fail(t('productivityTools.needsId'));
      if (typeof args.enabled !== 'boolean') return fail(t('productivityTools.toggleNeedsEnabled'));
      const res = await sendSchedulerCommand({ type: 'SCHEDULED_TASK_TOGGLE', id, enabled: args.enabled });
      if (!res?.success) return fail(res?.error || t('productivityTools.scheduleFailed'));
      broadcast('SCHEDULED_TASKS_CHANGED');
      return ok({ updated: summarizeTask(res.task) });
    }

    if (action === 'delete') {
      if (!id) return fail(t('productivityTools.needsId'));
      const res = await sendSchedulerCommand({ type: 'SCHEDULED_TASK_DELETE', id });
      if (!res?.success) return fail(res?.error || t('productivityTools.scheduleFailed'));
      broadcast('SCHEDULED_TASKS_CHANGED');
      return ok({ deleted: { id } });
    }

    if (action === 'run') {
      if (!id) return fail(t('productivityTools.needsId'));
      const res = await sendSchedulerCommand({ type: 'SCHEDULED_TASK_RUN_NOW', id });
      if (!res?.success) return fail(res?.error || t('productivityTools.scheduleFailed'));
      return ok({ started: { id, sessionId: res.sessionId || null }, message: t('productivityTools.runStarted') });
    }

    return fail(t('productivityTools.unsupportedScheduleAction', { action }));
  } catch (e) {
    logger.error('[Productivity] manage_schedule failed:', e);
    return fail(t('productivityTools.scheduleFailed'));
  }
}

async function listScheduledTasks() {
  const tasks = (await getAllScheduledTasks())
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return ok({ total: tasks.length, tasks: tasks.map(summarizeTask) });
}
