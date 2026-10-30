// 待办统计：完成流水（每日新增 / 完成计数）与统计视图要的数字。
// 流水只记「哪一天发生了多少」，不记是谁；90 天后自然过期，避免无限增长。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  STATS_LOG_KEY,
  STATS_RETENTION_DAYS,
  emptyStatsLog,
  dayKey,
  bumpStatsLog,
  pruneStatsLog,
  summarizeStats,
  recordTodoStat,
} from '../../src/side_panel/todo-stats.js';
import { TODO_STATUS, TODO_PRIORITY, normalizeTodo } from '../../src/side_panel/todo-model.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 29, 12, 0, 0).getTime();

function todo(overrides = {}) {
  return normalizeTodo({ id: 't' + Math.random().toString(36).slice(2, 7), title: '任务', createdAt: NOW, ...overrides });
}

let stored = null;

beforeEach(() => {
  stored = null;
  chrome.storage.local.get = async () => (
    stored === null ? {} : { [STATS_LOG_KEY]: stored }
  );
  chrome.storage.local.set = async (obj) => {
    if (obj && obj[STATS_LOG_KEY] !== undefined) stored = obj[STATS_LOG_KEY];
  };
});

afterEach(() => {
  chrome.storage.local.get = () => {};
  chrome.storage.local.set = () => {};
});

describe('流水日期', () => {
  it('按本地日期切成 YYYY-MM-DD（跨时区不能把昨晚的完成记到今天）', () => {
    expect(dayKey(NOW)).toBe('2026-10-29');
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });
});

describe('累加与保留', () => {
  it('同一天同一项累加，负数不把计数压成负值', () => {
    let log = emptyStatsLog();
    log = bumpStatsLog(log, '2026-10-29', 'done', 1);
    log = bumpStatsLog(log, '2026-10-29', 'done', 1);
    log = bumpStatsLog(log, '2026-10-29', 'added', 2);
    expect(log['2026-10-29']).toEqual({ done: 2, added: 2 });

    log = bumpStatsLog(log, '2026-10-29', 'done', -5);
    expect(log['2026-10-29'].done).toBe(0);
  });

  it('不修改入参（面板拿着旧值对比时不能被悄悄改掉）', () => {
    const base = { '2026-10-29': { added: 1, done: 0 } };
    const next = bumpStatsLog(base, '2026-10-29', 'added', 1);
    expect(base['2026-10-29'].added).toBe(1);
    expect(next['2026-10-29'].added).toBe(2);
  });

  it('只保留最近 90 天，更早的丢掉', () => {
    const log = {
      [dayKey(NOW - (STATS_RETENTION_DAYS + 1) * DAY)]: { added: 1, done: 1 },
      [dayKey(NOW - STATS_RETENTION_DAYS * DAY)]: { added: 2, done: 0 },
      [dayKey(NOW)]: { added: 3, done: 1 },
    };
    const pruned = pruneStatsLog(log, NOW);
    expect(Object.keys(pruned)).toHaveLength(2);
    expect(pruned[dayKey(NOW - (STATS_RETENTION_DAYS + 1) * DAY)]).toBeUndefined();
    expect(pruned[dayKey(NOW)].added).toBe(3);
  });
});

describe('统计口径', () => {
  const log = {
    [dayKey(NOW - 2 * DAY)]: { added: 4, done: 2 },
    [dayKey(NOW - DAY)]: { added: 1, done: 1 },
    [dayKey(NOW)]: { added: 2, done: 1 },
  };

  it('四个状态、逾期、高优先级与完成率', () => {
    const s = summarizeStats([
      todo({ status: TODO_STATUS.PENDING }),
      todo({ status: TODO_STATUS.DOING }),
      todo({ status: TODO_STATUS.DOING, priority: TODO_PRIORITY.HIGH }),
      todo({ status: TODO_STATUS.DONE, completedAt: NOW }),
      todo({ status: TODO_STATUS.PENDING, dueAt: NOW - 2 * DAY, priority: TODO_PRIORITY.HIGH }),
    ], log, NOW);

    expect(s.total).toBe(5);
    expect(s.done).toBe(1);
    expect(s.doing).toBe(2);
    expect(s.pending).toBe(2);
    expect(s.overdue).toBe(1);
    // 高优先级只数还没做完的：做完的条不占「接下来先做哪条」
    expect(s.high).toBe(2);
    expect(s.doneRate).toBe(20);
    expect(s.today).toEqual({ added: 2, done: 1 });
  });

  it('近 7 天按时间正序，最后一项一定是今天', () => {
    const s = summarizeStats([], log, NOW);
    expect(s.week).toHaveLength(7);
    expect(s.week[6]).toEqual({ date: '2026-10-29', added: 2, done: 1 });
    expect(s.week[5]).toEqual({ date: '2026-10-28', added: 1, done: 1 });
    expect(s.week[4]).toEqual({ date: '2026-10-27', added: 4, done: 2 });
    expect(s.week[0]).toEqual({ date: '2026-10-23', added: 0, done: 0 });
  });

  it('连续完成天数：今天还没完成时从昨天起算，不打断记录', () => {
    const lazyToday = {
      [dayKey(NOW - 2 * DAY)]: { done: 1 },
      [dayKey(NOW - DAY)]: { done: 3 },
    };
    expect(summarizeStats([], lazyToday, NOW).streak).toBe(2);

    const withToday = { ...lazyToday, [dayKey(NOW)]: { done: 1 } };
    expect(summarizeStats([], withToday, NOW).streak).toBe(3);
    expect(summarizeStats([], {}, NOW).streak).toBe(0);
  });

  it('空数据不除零、不抛错', () => {
    const s = summarizeStats(null, null, NOW);
    expect(s.total).toBe(0);
    expect(s.doneRate).toBe(0);
    expect(s.week).toHaveLength(7);
    expect(s.week.every(d => d.added === 0 && d.done === 0)).toBe(true);
  });
});

describe('落盘', () => {
  it('连续两次记录都累加（不许后写覆盖前写）', async () => {
    await recordTodoStat('added', 1, NOW);
    await recordTodoStat('added', 2, NOW);
    const log = await import('../../src/side_panel/todo-stats.js').then(m => m.loadStatsLog());
    expect(log[dayKey(NOW)].added).toBe(3);
  });

  it('存储报错不把异常甩给待办主流程', async () => {
    chrome.storage.local.set = async () => { throw new Error('quota'); };
    await expect(recordTodoStat('done', 1, NOW)).resolves.toBeNull();
  });
});
