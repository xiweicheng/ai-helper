// side_panel/todo-stats.js - 待办统计：完成流水 + 统计视图口径
//
// 两条数据来源：
// 1. 当前清单（state.todos）→ 总量 / 四态 / 逾期 / 高优先级 / 完成率；
// 2. 完成流水（chrome.storage.local 的 todoStatsLog）→ 今日与近 7 天的新增、完成，
//    以及连续完成天数。流水只按天存计数（{ 'YYYY-MM-DD': { added, done } }），不存明细，
//    90 天后自动过期 —— 统计要的是趋势，不需要留一份第二套待办数据。
//
// 写流水走串行队列：读-改-写若并发，后一次读到旧值就会把前一次覆盖掉。

import { normalizeTodo, isOverdue, groupTodos, TODO_STATUS, TODO_PRIORITY } from './todo-model.js';
import logger from '../shared/logger.js';

/** 流水在 chrome.storage.local 里的键 */
export const STATS_LOG_KEY = 'todoStatsLog';

/** 流水保留天数：够看一个季度的趋势，又不会无限长 */
export const STATS_RETENTION_DAYS = 90;

const WEEK_DAYS = 7;

/** 空流水 */
export function emptyStatsLog() {
  return {};
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 本地日期键：YYYY-MM-DD（按本地时区，跨时区不会把昨晚的完成记到今天） */
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 按「天」位移，走 Date 运算而不是减 24h，夏令时也不会错位一天 */
function shiftDay(ts, days) {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/**
 * 累加某天某个计数（返回新对象，不改入参）
 * @param {Object} log
 * @param {string} day - YYYY-MM-DD
 * @param {'added'|'done'} field
 * @param {number} delta
 */
export function bumpStatsLog(log, day, field, delta) {
  const base = log && typeof log === 'object' ? log : {};
  const current = base[day] && typeof base[day] === 'object' ? base[day] : {};
  const value = (Number.isFinite(current[field]) ? current[field] : 0) + (Number.isFinite(delta) ? delta : 0);
  return {
    ...base,
    [day]: { ...current, [field]: Math.max(0, value) },
  };
}

/**
 * 丢掉超过保留期的天（撤销很久以前的完成时，旧日期也不会复活）
 * @param {Object} log
 * @param {number} [now]
 */
export function pruneStatsLog(log, now = Date.now()) {
  const cutoff = dayKey(shiftDay(now, -STATS_RETENTION_DAYS));
  const out = {};
  for (const [day, value] of Object.entries(log && typeof log === 'object' ? log : {})) {
    // YYYY-MM-DD 字典序即时间序，直接比字符串
    if (day >= cutoff) out[day] = value;
  }
  return out;
}

function readDay(log, key) {
  const entry = log && log[key];
  return {
    added: Number.isFinite(entry && entry.added) ? entry.added : 0,
    done: Number.isFinite(entry && entry.done) ? entry.done : 0,
  };
}

/**
 * 连续完成天数：从今天往回数「完成 > 0」的天数；
 * 今天还没完成不算断，从昨天起算（上午打开统计不该看到 0）
 */
function countStreak(log, now) {
  const today = readDay(log, dayKey(now));
  let cursor = today.done > 0 ? now : shiftDay(now, -1);
  let streak = 0;
  // 上限只是防脏数据死循环，比保留期长即可
  while (streak <= STATS_RETENTION_DAYS) {
    if (readDay(log, dayKey(cursor)).done <= 0) break;
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/**
 * 统计视图的全部数字
 * @param {Array<Object>} todos
 * @param {Object} log - 完成流水
 * @param {number} [now]
 */
export function summarizeStats(todos, log, now = Date.now()) {
  const list = Array.isArray(todos) ? todos.map(normalizeTodo) : [];
  const { stats } = groupTodos(list);
  const safeLog = log && typeof log === 'object' ? log : {};

  const week = [];
  for (let i = WEEK_DAYS - 1; i >= 0; i -= 1) {
    const day = dayKey(shiftDay(now, -i));
    week.push({ date: day, ...readDay(safeLog, day) });
  }

  return {
    total: stats.total,
    done: stats.done,
    doing: stats.doing,
    pending: stats.pending,
    // 逾期 / 高优先级都只看没做完的：做完的条不该继续顶着提醒
    overdue: list.filter(item => isOverdue(item, now)).length,
    high: list.filter(item => item.status !== TODO_STATUS.DONE && item.priority === TODO_PRIORITY.HIGH).length,
    doneRate: stats.total ? Math.round((stats.done / stats.total) * 100) : 0,
    today: readDay(safeLog, dayKey(now)),
    week,
    streak: countStreak(safeLog, now),
  };
}

// ==================== 落盘 ====================

let writeChain = Promise.resolve();

/** 读流水；没有 chrome.storage（单测/降级环境）时返回空流水 */
export async function loadStatsLog() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return {};
    const result = await chrome.storage.local.get([STATS_LOG_KEY]);
    const log = result && result[STATS_LOG_KEY];
    return log && typeof log === 'object' ? log : {};
  } catch (e) {
    logger.warn('[Todo] load stats log failed:', e);
    return {};
  }
}

async function saveStatsLog(log) {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.set) return;
  await chrome.storage.local.set({ [STATS_LOG_KEY]: log });
}

/**
 * 记一笔流水（新增 +1 / 完成 +1 / 撤销 -1）
 * 失败只吞掉：统计是附加信息，不能拖累待办本身的落库与回滚。
 * @param {'added'|'done'} field
 * @param {number} delta
 * @param {number} [ts] - 计入哪一天（撤销时传原完成时间）
 * @returns {Promise<Object|null>} 新流水；失败返回 null
 */
export function recordTodoStat(field, delta, ts = Date.now()) {
  const run = writeChain.then(async () => {
    const current = await loadStatsLog();
    const next = pruneStatsLog(bumpStatsLog(current, dayKey(ts), field, delta));
    await saveStatsLog(next);
    return next;
  });
  // 串行链本身不能因某次失败而中断
  writeChain = run.then(() => undefined, () => undefined);
  return run.catch(e => {
    logger.warn('[Todo] record stat failed:', e);
    return null;
  });
}
