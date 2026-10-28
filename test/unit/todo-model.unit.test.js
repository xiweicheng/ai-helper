// 待办纯逻辑单测：分组 / 排序 / 状态流转 / 重排 / 时间文案 / Markdown 导出
import { describe, test, expect } from 'vitest';
import {
  TODO_STATUS,
  nextStatus,
  createTodo,
  normalizeTodo,
  groupTodos,
  reorderList,
  withOrder,
  nextOrder,
  formatTodoDate,
  formatRelativeTime,
  formatDueAt,
  formatDoneStamp,
  isOverdue,
  buildTodoDigest,
} from '../../src/side_panel/todo-model.js';

const DAY = 24 * 60 * 60 * 1000;
// 2026-10-29 12:00 本地时间，测试固定 now，避免跨时区/跨天抖动
const NOW = new Date(2026, 9, 29, 12, 0, 0).getTime();

function todo(overrides = {}) {
  return normalizeTodo({ id: 't' + Math.random().toString(36).slice(2, 7), title: '任务', createdAt: NOW, ...overrides });
}

describe('状态流转', () => {
  test('待处理 → 处理中 → 已完成 → 待处理', () => {
    expect(nextStatus(TODO_STATUS.PENDING)).toBe(TODO_STATUS.DOING);
    expect(nextStatus(TODO_STATUS.DOING)).toBe(TODO_STATUS.DONE);
    expect(nextStatus(TODO_STATUS.DONE)).toBe(TODO_STATUS.PENDING);
  });

  test('非法状态按待处理继续循环，不产生 undefined', () => {
    expect(nextStatus('weird')).toBe(TODO_STATUS.PENDING);
    expect(nextStatus(undefined)).toBe(TODO_STATUS.PENDING);
  });

  test('createTodo 默认落在待处理、order 占位、标题去空白', () => {
    const item = createTodo('  写周报  ', {}, NOW);
    expect(item.title).toBe('写周报');
    expect(item.status).toBe(TODO_STATUS.PENDING);
    expect(item.order).toBe(0);
    expect(item.createdAt).toBe(NOW);
    expect(item.completedAt).toBeNull();
    expect(item.id.startsWith('todo_')).toBe(true);
  });
});

describe('两段式分组', () => {
  test('待处理与处理中同属「进行中」，已完成独立成组', () => {
    const { active, done, stats } = groupTodos([
      todo({ id: 'a', status: TODO_STATUS.PENDING, order: 1 }),
      todo({ id: 'b', status: TODO_STATUS.DOING, order: 0 }),
      todo({ id: 'c', status: TODO_STATUS.DONE, order: 2, completedAt: NOW - DAY }),
    ]);
    expect(active.map(x => x.id)).toEqual(['b', 'a']);
    expect(done.map(x => x.id)).toEqual(['c']);
    expect(stats).toEqual({ total: 3, done: 1, active: 2 });
  });

  test('order 缺失时回退创建时间，不与其他条目乱序', () => {
    const { active } = groupTodos([
      todo({ id: 'late', createdAt: NOW - 1000 }),
      todo({ id: 'early', createdAt: NOW - 9000 }),
    ]);
    expect(active.map(x => x.id)).toEqual(['early', 'late']);
  });

  test('已完成组按完成时间倒序（最近完成的在前）', () => {
    const { done } = groupTodos([
      todo({ id: 'old', status: TODO_STATUS.DONE, completedAt: NOW - 5 * DAY }),
      todo({ id: 'new', status: TODO_STATUS.DONE, completedAt: NOW - DAY }),
    ]);
    expect(done.map(x => x.id)).toEqual(['new', 'old']);
  });

  test('空表与非法入参不抛错', () => {
    expect(groupTodos([]).stats).toEqual({ total: 0, done: 0, active: 0 });
    expect(groupTodos(null).active).toEqual([]);
  });

  test('已完成条目不会残留在进行中组', () => {
    const { active } = groupTodos([todo({ status: TODO_STATUS.DONE, completedAt: NOW })]);
    expect(active).toHaveLength(0);
  });
});

describe('拖拽重排', () => {
  const list = ['a', 'b', 'c', 'd'];

  test('向下移动', () => {
    expect(reorderList(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  test('向上移动', () => {
    expect(reorderList(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  test('越界下标不破坏原数组', () => {
    expect(reorderList(list, -1, 0)).toEqual(list);
    expect(reorderList(list, 9, 0)).toEqual(list);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });

  test('withOrder 重写 0..n-1 且不改动入参', () => {
    const source = [todo({ id: 'a', order: 7 }), todo({ id: 'b', order: 3 })];
    const result = withOrder(source, NOW + 1000);
    expect(result.map(x => x.order)).toEqual([0, 1]);
    expect(source.map(x => x.order)).toEqual([7, 3]);
    expect(result[0].updatedAt).toBe(NOW + 1000);
  });

  test('nextOrder 追加到进行中组末尾（已完成不占位）', () => {
    expect(nextOrder([
      todo({ order: 0 }),
      todo({ order: 5 }),
      todo({ status: TODO_STATUS.DONE, order: 9, completedAt: NOW }),
    ])).toBe(6);
    expect(nextOrder([])).toBe(0);
  });
});

describe('时间文案', () => {
  test('相对时间分档', () => {
    expect(formatRelativeTime(NOW - 30 * 1000, NOW)).toBe('刚刚');
    expect(formatRelativeTime(NOW - 5 * 60 * 1000, NOW)).toBe('5 分钟前');
    expect(formatRelativeTime(NOW - 3 * 60 * 60 * 1000, NOW)).toBe('3 小时前');
    expect(formatRelativeTime(NOW - 2 * DAY, NOW)).toBe('2 天前');
    expect(formatRelativeTime(new Date(2026, 8, 1).getTime(), NOW)).toBe('9月1日');
  });

  test('未来时间（时钟偏差）显示刚刚而不是负数', () => {
    expect(formatRelativeTime(NOW + 5000, NOW)).toBe('刚刚');
  });

  test('截止文案：今天 / 明天 / 逾期前一天 / 具体日期', () => {
    expect(formatDueAt(new Date(2026, 9, 29).getTime(), NOW)).toBe('今天');
    expect(formatDueAt(new Date(2026, 9, 30).getTime(), NOW)).toBe('明天');
    expect(formatDueAt(new Date(2026, 9, 28).getTime(), NOW)).toBe('昨天');
    expect(formatDueAt(new Date(2026, 10, 5).getTime(), NOW)).toBe('11月5日');
    expect(formatDueAt(new Date(2027, 0, 3).getTime(), NOW)).toBe('2027年1月3日');
  });

  test('完成时间文案带「完成」后缀', () => {
    expect(formatDoneStamp(todo({ completedAt: NOW }), NOW)).toBe('10月29日 完成');
  });

  test('截止日按天比较：今天不算逾期，已完成不判逾期', () => {
    expect(isOverdue(todo({ dueAt: new Date(2026, 9, 29).getTime() }), NOW)).toBe(false);
    expect(isOverdue(todo({ dueAt: new Date(2026, 9, 28).getTime() }), NOW)).toBe(true);
    expect(isOverdue(todo({ dueAt: new Date(2026, 9, 20).getTime(), status: TODO_STATUS.DONE, completedAt: NOW }), NOW)).toBe(false);
    expect(isOverdue(todo({}), NOW)).toBe(false);
  });

  test('跨年日期带年份', () => {
    expect(formatTodoDate(new Date(2025, 11, 31).getTime(), NOW)).toBe('2025年12月31日');
  });
});

describe('Markdown 导出', () => {
  test('进行中在前、已完成在后，处理中带 ⏳，备注缩进', () => {
    const md = buildTodoDigest([
      todo({ title: '写方案', status: TODO_STATUS.DOING, order: 0, note: '先列大纲' }),
      todo({ title: '对需求', order: 1 }),
      todo({ title: '搭环境', status: TODO_STATUS.DONE, completedAt: new Date(2026, 9, 28).getTime(), order: 2 }),
    ], { now: NOW });

    expect(md).toBe([
      '**进行中**',
      '- [ ] ⏳ 写方案',
      '  - 备注：先列大纲',
      '- [ ] 对需求',
      '',
      '**已完成**',
      '- [x] 搭环境（10月28日 完成）',
    ].join('\n'));
  });

  test('带截止时间的条目补「截止」括注', () => {
    const md = buildTodoDigest([
      todo({ title: '发布', order: 0, dueAt: new Date(2026, 9, 30).getTime() }),
    ], { now: NOW });
    expect(md).toContain('- [ ] 发布（截止 明天）');
  });

  test('withPrompt 追加提问模板', () => {
    const md = buildTodoDigest([todo({ title: 'A', order: 0 })], { now: NOW, withPrompt: true });
    expect(md.endsWith('请基于以上待办，给出实施顺序与风险提示。')).toBe(true);
  });

  test('空清单返回空串（不产出空标题）', () => {
    expect(buildTodoDigest([], { now: NOW })).toBe('');
    expect(buildTodoDigest(null, { now: NOW })).toBe('');
  });

  test('标题/备注里的换行折叠成单行，避免破坏清单结构', () => {
    const md = buildTodoDigest([
      todo({ title: '第一行\n第二行', order: 0, note: 'a\nb' }),
    ], { now: NOW });
    expect(md).toContain('- [ ] 第一行 第二行');
    expect(md).toContain('  - 备注：a b');
  });
});
