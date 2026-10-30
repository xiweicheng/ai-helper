// 待办纯逻辑单测：分组 / 排序 / 状态流转 / 重排 / 时间文案 / Markdown 导出
import { describe, test, expect } from 'vitest';
import {
  TODO_STATUS,
  TODO_PRIORITY,
  nextStatus,
  createTodo,
  normalizeTodo,
  normalizePriority,
  normalizeLink,
  linkLabel,
  isLinkOpenable,
  restoreTarget,
  groupTodos,
  reorderList,
  withOrder,
  nextOrder,
  formatTodoDate,
  formatRelativeTime,
  formatDueAt,
  formatDoneStamp,
  isOverdue,
  nextPriority,
  buildTodoDigest,
  buildItemDigest,
  TODO_EXPORT_VERSION,
  selectTodosForExport,
  buildTodoExportPayload,
  buildTodoMarkdownExport,
  parseTodoImport,
  mergeTodoImport,
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
  test('待处理与处理中同属待办组，已完成独立成组', () => {
    const { active, done, stats } = groupTodos([
      todo({ id: 'a', status: TODO_STATUS.PENDING, order: 1 }),
      todo({ id: 'b', status: TODO_STATUS.DOING, order: 0 }),
      todo({ id: 'c', status: TODO_STATUS.DONE, order: 2, completedAt: NOW - DAY }),
    ]);
    expect(active.map(x => x.id)).toEqual(['b', 'a']);
    expect(done.map(x => x.id)).toEqual(['c']);
    expect(stats).toEqual({ total: 3, done: 1, active: 2, pending: 1, doing: 1 });
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
    expect(groupTodos([]).stats).toEqual({ total: 0, done: 0, active: 0, pending: 0, doing: 0 });
    expect(groupTodos(null).active).toEqual([]);
  });

  test('处理中单独计数（面板进度要显示它，不能只剩「完成 / 总数」）', () => {
    const { stats } = groupTodos([
      todo({ id: 'p1', status: TODO_STATUS.PENDING }),
      todo({ id: 'd1', status: TODO_STATUS.DOING }),
      todo({ id: 'd2', status: TODO_STATUS.DOING }),
      todo({ id: 'x1', status: TODO_STATUS.DONE, completedAt: NOW }),
    ]);
    expect(stats.pending).toBe(1);
    expect(stats.doing).toBe(2);
    expect(stats.pending + stats.doing).toBe(stats.active);
  });

  test('已完成条目不会残留在待办组', () => {
    const { active } = groupTodos([todo({ status: TODO_STATUS.DONE, completedAt: NOW })]);
    expect(active).toHaveLength(0);
  });
});

describe('优先级白名单', () => {
  test('三档原样保留，其它值归为未设置（不报错也不丢数据）', () => {
    expect(normalizePriority(TODO_PRIORITY.HIGH)).toBe('high');
    expect(normalizePriority('medium')).toBe('medium');
    expect(normalizePriority('low')).toBe('low');
    expect(normalizePriority('HIGH')).toBeNull();
    expect(normalizePriority('urgent')).toBeNull();
    expect(normalizePriority('')).toBeNull();
    expect(normalizePriority(null)).toBeNull();
    expect(normalizePriority(undefined)).toBeNull();
  });

  test('新建与读取都过白名单，历史脏值不会渲染出色条', () => {
    expect(createTodo('A', { priority: 'highest' }, NOW).priority).toBeNull();
    expect(createTodo('A', { priority: 'high' }, NOW).priority).toBe('high');
    expect(normalizeTodo({ id: 'a', priority: 3 }).priority).toBeNull();
    expect(normalizeTodo({ id: 'a', priority: 'low' }).priority).toBe('low');
  });
});

describe('外部链接校验', () => {
  test('空值 = 没有链接且算合法（移除链接走这条路）', () => {
    expect(normalizeLink('')).toEqual({ url: '', host: '', valid: true });
    expect(normalizeLink(null).valid).toBe(true);
    expect(normalizeLink(undefined).url).toBe('');
    expect(normalizeLink('   ').url).toBe('');
  });

  test('不带协议时补 https，粘一条纯域名也要能直接用', () => {
    expect(normalizeLink('example.com').url).toBe('https://example.com/');
    expect(normalizeLink('  example.com/x  ').url).toBe('https://example.com/x');
    expect(normalizeLink('http://example.com').url).toBe('http://example.com/');
    expect(normalizeLink('https://example.com/a?b=1#c').valid).toBe(true);
  });

  test('只放行 http/https：javascript:/data:/file: 进 href 就是自伤 XSS', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<h1>x</h1>', 'file:///etc/passwd']) {
      expect(normalizeLink(bad).valid, bad).toBe(false);
      expect(normalizeLink(bad).url, bad).toBe('');
    }
  });

  test('补完协议仍然解析不出来的，判非法而不是硬拼一个怪地址', () => {
    expect(normalizeLink('https://').valid).toBe(false);
    expect(normalizeLink('http://').valid).toBe(false);
  });

  test('前导斜杠先剔掉，否则 //example.com 补完协议会留下四个斜杠', () => {
    const parsed = normalizeLink('//example.com/x');
    expect(parsed.valid).toBe(true);
    expect(parsed.url).toBe('https://example.com/x');
    expect(parsed.url).not.toContain('///');
  });

  test('展示域名去 www、过长截断，胶囊不会被域名撑爆', () => {
    expect(normalizeLink('https://www.example.com/docs').host).toBe('example.com');
    const long = normalizeLink('https://some-very-long-subdomain-name.example.com/a/b');
    expect(long.host).toHaveLength(22);
    expect(long.host.endsWith('…')).toBe(true);
  });

  test('linkLabel 只给已存且合法的链接出文案', () => {
    expect(linkLabel({ link: 'https://example.com/x' })).toBe('example.com');
    expect(linkLabel({ link: 'javascript:alert(1)' })).toBe('');
    expect(linkLabel({ link: '' })).toBe('');
    expect(linkLabel({})).toBe('');
    expect(linkLabel(null)).toBe('');
  });

  test('点击前再校一次：库里被手改坏的链接不打开', () => {
    expect(isLinkOpenable('https://example.com')).toBe(true);
    expect(isLinkOpenable('javascript:alert(1)')).toBe(false);
    expect(isLinkOpenable('')).toBe(false);
    expect(isLinkOpenable(undefined)).toBe(false);
  });

  test('normalizeTodo：存量非法链接当没链接，缺协议的补全后入库形态一致', () => {
    expect(normalizeTodo({ id: 'a', link: 'javascript:alert(1)' }).link).toBe('');
    expect(normalizeTodo({ id: 'a', link: 'example.com' }).link).toBe('https://example.com/');
    expect(normalizeTodo({ id: 'a' }).link).toBe('');
  });
});

describe('完成后的智能恢复目标', () => {
  test('记到「处理中」就回处理中，其余一律回待办', () => {
    expect(restoreTarget({ prevStatus: TODO_STATUS.DOING })).toBe(TODO_STATUS.DOING);
    expect(restoreTarget({ prevStatus: TODO_STATUS.PENDING })).toBe(TODO_STATUS.PENDING);
    expect(restoreTarget({ prevStatus: TODO_STATUS.DONE })).toBe(TODO_STATUS.PENDING);
    expect(restoreTarget({ prevStatus: 'bogus' })).toBe(TODO_STATUS.PENDING);
    expect(restoreTarget({ prevStatus: null })).toBe(TODO_STATUS.PENDING);
    expect(restoreTarget({})).toBe(TODO_STATUS.PENDING);
    expect(restoreTarget(null)).toBe(TODO_STATUS.PENDING);
  });

  test('prevStatus 只贴在已完成条目身上，其余情况一律丢脏值', () => {
    expect(normalizeTodo({ id: 'a', status: TODO_STATUS.DONE, prevStatus: TODO_STATUS.DOING }).prevStatus)
      .toBe(TODO_STATUS.DOING);
    expect(normalizeTodo({ id: 'a', status: TODO_STATUS.PENDING, prevStatus: TODO_STATUS.DOING }).prevStatus).toBeNull();
    expect(normalizeTodo({ id: 'a', status: TODO_STATUS.DONE, prevStatus: TODO_STATUS.DONE }).prevStatus).toBeNull();
    expect(normalizeTodo({ id: 'a', status: TODO_STATUS.DONE, prevStatus: 'archived' }).prevStatus).toBeNull();
    expect(createTodo('A', {}, NOW).prevStatus).toBeNull();
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
  test('待办在前、已完成在后，处理中带 ⏳，备注缩进', () => {
    const md = buildTodoDigest([
      todo({ title: '写方案', status: TODO_STATUS.DOING, order: 0, note: '先列大纲' }),
      todo({ title: '对需求', order: 1 }),
      todo({ title: '搭环境', status: TODO_STATUS.DONE, completedAt: new Date(2026, 9, 28).getTime(), order: 2 }),
    ], { now: NOW });

    expect(md).toBe([
      // 分组标题与面板 Tab 同名：写「进行中」会让人以为下面全是执行中的任务
      '**待办**',
      '- [ ] ⏳ 写方案',
      '  - 备注：先列大纲',
      '- [ ] 对需求',
      '',
      '**已完成**',
      '- [x] 搭环境（10月28日 完成）',
    ].join('\n'));
  });

  test('只标高优先级，链接以 Markdown 链接跟在条目末尾', () => {
    const md = buildTodoDigest([
      todo({ title: '修 P0', order: 0, priority: TODO_PRIORITY.HIGH, link: 'https://bug.example.com/1' }),
      todo({ title: '整理', order: 1, priority: TODO_PRIORITY.LOW, link: 'https://example.com/doc' }),
      todo({
        title: '发布',
        order: 2,
        status: TODO_STATUS.DONE,
        completedAt: NOW,
        link: 'https://example.com/rel',
      }),
    ], { now: NOW });
    expect(md).toContain('- [ ] 修 P0（高优先级） [bug.example.com](https://bug.example.com/1)');
    expect(md).toContain('- [ ] 整理 [example.com](https://example.com/doc)');
    expect(md).not.toContain('（低优先级）');
    expect(md).toContain('- [x] 发布（10月29日 完成） [example.com](https://example.com/rel)');
  });

  test('非法链接不进摘要，免得把 javascript: 递给模型', () => {
    const md = buildTodoDigest([todo({ title: 'A', order: 0, link: 'javascript:alert(1)' })], { now: NOW });
    expect(md).toBe(['**待办**', '- [ ] A'].join('\n'));
  });

  test('带截止时间的条目补「截止」括注', () => {
    const md = buildTodoDigest([
      todo({ title: '发布', order: 0, dueAt: new Date(2026, 9, 30).getTime() }),
    ], { now: NOW });
    expect(md).toContain('- [ ] 发布（截止 明天）');
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

describe('优先级循环（快捷键 Alt+P）', () => {
  test('高 → 中 → 低 → 未设置 → 高', () => {
    expect(nextPriority(TODO_PRIORITY.HIGH)).toBe(TODO_PRIORITY.MEDIUM);
    expect(nextPriority(TODO_PRIORITY.MEDIUM)).toBe(TODO_PRIORITY.LOW);
    expect(nextPriority(TODO_PRIORITY.LOW)).toBe(null);
    expect(nextPriority(null)).toBe(TODO_PRIORITY.HIGH);
  });

  test('脏值当作未设置，不把非法值写进库', () => {
    expect(nextPriority('urgent')).toBe(TODO_PRIORITY.HIGH);
    expect(nextPriority(undefined)).toBe(TODO_PRIORITY.HIGH);
  });
});

describe('导入导出', () => {
  const mkPending = () => todo({ id: 'a', title: '写方案', order: 0 });
  const mkDoing = () => todo({ id: 'b', title: '对需求', status: TODO_STATUS.DOING, order: 1 });
  const mkDone = () => todo({ id: 'c', title: '搭环境', status: TODO_STATUS.DONE, completedAt: NOW, order: 2 });

  test('范围三选一：全部 / 仅待办 / 仅已完成', () => {
    const all = [mkPending(), mkDoing(), mkDone()];
    expect(selectTodosForExport(all, 'all').map(t => t.id)).toEqual(['a', 'b', 'c']);
    expect(selectTodosForExport(all, 'active').map(t => t.id)).toEqual(['a', 'b']);
    expect(selectTodosForExport(all, 'done').map(t => t.id)).toEqual(['c']);
    expect(selectTodosForExport(null, 'all')).toEqual([]);
  });

  test('JSON 载荷带版本与范围，字段只留白名单（不把内部脏字段带出去）', () => {
    const payload = buildTodoExportPayload([{ ...mkPending(), junk: 1 }], { scope: 'active', now: NOW });
    expect(payload.kind).toBe('todos');
    expect(payload.version).toBe(TODO_EXPORT_VERSION);
    expect(payload.scope).toBe('active');
    expect(payload.exportedAt).toBe(NOW);
    expect(payload.todos).toHaveLength(1);
    expect(payload.todos[0]).toEqual({
      id: 'a',
      title: '写方案',
      note: '',
      status: 'pending',
      prevStatus: null,
      priority: null,
      link: '',
      order: 0,
      dueAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
    });
  });

  test('Markdown 导出：带头部说明，条目走与清单同一套格式', () => {
    const md = buildTodoMarkdownExport([mkPending(), mkDone()], { scope: 'all', now: NOW });
    expect(md.startsWith('# ')).toBe(true);
    expect(md).toContain('- [ ] 写方案');
    expect(md).toContain('- [x] 搭环境（10月29日 完成）');
  });

  test('Markdown 导出也受范围约束（仅待办不出现已完成）', () => {
    const md = buildTodoMarkdownExport([mkPending(), mkDone()], { scope: 'active', now: NOW });
    expect(md).toContain('写方案');
    expect(md).not.toContain('搭环境');
  });

  test('解析：接受 {todos:[]} 与裸数组，坏结构判 format', () => {
    expect(parseTodoImport({ todos: [{ id: 'x', title: 'A' }] })).toEqual({
      ok: true,
      todos: [{ id: 'x', title: 'A' }],
    });
    expect(parseTodoImport([{ title: 'A' }]).ok).toBe(true);
    expect(parseTodoImport({})).toEqual({ ok: false, reason: 'format' });
    expect(parseTodoImport('nope')).toEqual({ ok: false, reason: 'format' });
    expect(parseTodoImport({ todos: 'x' })).toEqual({ ok: false, reason: 'format' });
  });

  test('合并：同 id 跳过不覆盖，新条目 order 顺延', () => {
    const base = [todo({ id: 'a', title: 'A', order: 0 })];
    const incoming = [
      { id: 'a', title: 'A 改过的标题' },
      { id: 'b', title: 'B' },
      { title: 'C 没 id' },
    ];
    const r = mergeTodoImport(base, incoming, NOW);

    expect(r.added).toBe(2);
    expect(r.skipped).toBe(1);
    expect(r.todos.map(t => t.title)).toEqual(['A', 'B', 'C 没 id']);
    expect(r.addedItems.map(t => t.order)).toEqual([1, 2]);
    expect(r.addedItems.every(t => !!t.id)).toBe(true);
  });

  test('无标题条目计入跳过，不入库', () => {
    const r = mergeTodoImport([], [{ title: '  ' }, { title: 'B' }], NOW);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(1);
  });

  test('一个文件里重复 id 只导第一条', () => {
    const r = mergeTodoImport([], [
      { id: 'x', title: '第一条' },
      { id: 'x', title: '第二条' },
    ], NOW);
    expect(r.added).toBe(1);
    expect(r.todos[0].title).toBe('第一条');
  });
});

describe('单条组合文本（填入输入框 / 拖拽 / 复制共用）', () => {
  test('标题、状态、优先级、截止、备注、链接一行内组合好', () => {
    const md = buildItemDigest(todo({
      title: '写方案',
      status: TODO_STATUS.DOING,
      priority: TODO_PRIORITY.HIGH,
      dueAt: new Date(2026, 9, 30).getTime(),
      note: '先列大纲',
      link: 'https://example.com/doc',
    }), { now: NOW });

    expect(md).toBe([
      '- [ ] ⏳ 写方案（高优先级）（截止 明天） [example.com](https://example.com/doc)',
      '  - 备注：先列大纲',
    ].join('\n'));
  });

  test('已完成条目带完成时间，备注照样带出（描述不能只留在面板里）', () => {
    const md = buildItemDigest(todo({
      title: '搭环境',
      status: TODO_STATUS.DONE,
      completedAt: new Date(2026, 9, 28).getTime(),
      note: '装了 Node 20',
    }), { now: NOW });

    expect(md).toBe([
      '- [x] 搭环境（10月28日 完成）',
      '  - 备注：装了 Node 20',
    ].join('\n'));
  });

  test('空标题返回空串，不产出只有符号的脏行', () => {
    expect(buildItemDigest(todo({ title: '   ' }), { now: NOW })).toBe('');
    expect(buildItemDigest(null, { now: NOW })).toBe('');
  });

  test('与批量清单首行口径一致：两处格式不许漂移', () => {
    const pending = todo({ title: '写方案', status: TODO_STATUS.DOING, priority: TODO_PRIORITY.HIGH, order: 0 });
    const done = todo({ title: '搭环境', status: TODO_STATUS.DONE, completedAt: NOW, order: 1 });

    expect(buildItemDigest(pending, { now: NOW }).split('\n')[0])
      .toBe(buildTodoDigest([pending], { now: NOW }).split('\n')[1]);
    expect(buildItemDigest(done, { now: NOW }).split('\n')[0])
      .toBe(buildTodoDigest([done], { now: NOW }).split('\n')[1]);
  });
});
