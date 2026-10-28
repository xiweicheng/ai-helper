// @vitest-environment jsdom
// test/unit/session-dock.unit.test.js - 执行中会话停靠条
// buildDockEntries 是纯函数：把「哪些会话在跑 / 在排队 / 刚完成」整理成停靠条目。
// 副作用模块（会话切换、队列、索引库）全部打桩，只验证条目推导与优先级规则。
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../src/side_panel/session-manager-ui.js', () => ({
  handleSessionSwitch: vi.fn(async () => {}),
}));
vi.mock('../../src/side_panel/queue-store.js', () => ({
  subscribe: vi.fn(),
  listSessionIdsWithItems: () => [],
  getQueuedCount: () => 0,
}));
vi.mock('../../src/storage/db.js', () => ({
  getSession: vi.fn(async () => null),
}));

const { buildDockEntries, renderDock, initSessionDock, __resetSessionDockForTest } =
  await import('../../src/side_panel/session-dock.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('buildDockEntries', () => {
  it('空输入返回空数组', () => {
    expect(buildDockEntries()).toEqual([]);
    expect(buildDockEntries({})).toEqual([]);
  });

  it('当前会话永不出现（用户正看着它，提示就是干扰）', () => {
    const entries = buildDockEntries({
      activeSessionId: 'current',
      generatingIds: ['current'],
      queuedCounts: { current: 3 },
      completedIds: ['current'],
    });
    expect(entries).toEqual([]);
  });

  it('同时命中多个信号时，执行中优先级最高', () => {
    const entries = buildDockEntries({
      activeSessionId: 'current',
      generatingIds: ['s1'],
      completedIds: ['s1'],
      queuedCounts: { s1: 2 },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ sessionId: 's1', phase: 'running', queuedCount: 2 });
  });

  it('后台回执的运行集合也算执行中（面板本地集合可能是空的）', () => {
    const entries = buildDockEntries({ runningIds: ['bg1'] });
    expect(entries.map((e) => e.phase)).toEqual(['running']);
  });

  it('只排队还没开跑的会话也要出现，阶段为 queued 并带条数', () => {
    const entries = buildDockEntries({ queuedCounts: { q1: 4 } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ sessionId: 'q1', phase: 'queued', queuedCount: 4 });
  });

  it('排队条数为 0 的会话不占位', () => {
    expect(buildDockEntries({ queuedCounts: { q1: 0 } })).toEqual([]);
  });

  it('完成态可被 × 掉，执行态不受 × 影响', () => {
    const entries = buildDockEntries({
      generatingIds: ['run1'],
      completedIds: ['done1', 'done2'],
      dismissedIds: ['run1', 'done1'],
    });
    expect(entries.map((e) => `${e.sessionId}:${e.phase}`)).toEqual(['run1:running', 'done2:done']);
  });

  it('定时任务发起的会话标记 source=scheduled', () => {
    const entries = buildDockEntries({
      runningIds: ['t1', 't2'],
      scheduledIds: ['t1'],
    });
    const byId = Object.fromEntries(entries.map((e) => [e.sessionId, e]));
    expect(byId.t1.source).toBe('scheduled');
    expect(byId.t2.source).toBe('chat');
  });

  it('排序：执行中 → 排队中 → 已完成，同阶段按开始时间先后', () => {
    const entries = buildDockEntries({
      generatingIds: ['r2', 'r1'],
      queuedCounts: { q1: 1 },
      completedIds: ['d1'],
      startedAt: { r1: 100, r2: 200 },
      doneAt: { d1: 50 },
    });
    expect(entries.map((e) => e.sessionId)).toEqual(['r1', 'r2', 'q1', 'd1']);
  });

  it('标题、当前节点与子任务进度原样透传给条目', () => {
    const entries = buildDockEntries({
      generatingIds: ['s1'],
      titles: { s1: '重构登录流程' },
      nodeInfo: { s1: { nodeName: 'Write', subtaskIndex: 2, subtaskTotal: 3 } },
    });
    expect(entries[0]).toMatchObject({
      title: '重构登录流程',
      nodeName: 'Write',
      subtaskIndex: 2,
      subtaskTotal: 3,
    });
  });

  it('标题缺失时退回空串，由渲染层决定占位文案', () => {
    const entries = buildDockEntries({ generatingIds: ['s1'] });
    expect(entries[0]).toMatchObject({ title: '', nodeName: '', subtaskTotal: 0 });
  });

  it('Set 与数组两种入参都能接受（生成集合在面板里是 Set）', () => {
    const entries = buildDockEntries({
      generatingIds: new Set(['s1']),
      completedIds: new Set(['s2']),
      scheduledIds: new Set(['s1']),
    });
    expect(entries.map((e) => e.sessionId)).toEqual(['s1', 's2']);
  });
});

describe('停靠条接线（源码守卫）', () => {
  it('面板入口初始化停靠条', () => {
    const src = read('src/side_panel/index.js');
    expect(src).toContain("import { initSessionDock } from './session-dock.js';");
    expect(src).toContain('initSessionDock();');
  });

  it('停靠条只消费既有执行信号，不自建运行状态', () => {
    const src = read('src/side_panel/session-dock.js');
    expect(src).toContain('QUERY_SESSION_RUNNING');
    expect(src).toContain('EXECUTION_STATUS_UPDATE');
    expect(src).toContain('SCHEDULED_TASK_RUN_STATE');
    // 归档 / 彻底删除后条目必须立即消失
    expect(src).toContain("document.addEventListener('session-archived'");
    expect(src).toContain("document.addEventListener('session-deleted'");
  });

  it('× 只出现在完成态（执行中点掉会被误读成取消任务）', () => {
    const src = read('src/side_panel/session-dock.js');
    const chipBody = src.slice(src.indexOf('function buildChip'), src.indexOf('function showTip'));
    const doneGuard = chipBody.lastIndexOf("entry.phase === 'done'");
    expect(doneGuard).toBeGreaterThan(0);
    // 完成态分支后面的代码才允许出现 dismiss 按钮
    expect(chipBody.slice(doneGuard)).toContain('session-dock-dismiss');
    // 执行态分支（chip 字面）里不允许有 dismiss
    expect(chipBody.slice(0, doneGuard)).not.toContain('session-dock-dismiss');
  });

  it('停靠条与聊天区走廊样式齐备', () => {
    const css = read('src/side_panel/styles.css');
    expect(css).toContain('.session-dock {');
    expect(css).toContain('.session-dock-chip {');
    expect(css).toContain('.session-dock-item[data-phase="running"]');
    expect(css).toContain('.session-dock-item[data-phase="queued"]');
    expect(css).toContain('.session-dock-item[data-phase="done"]');
    expect(css).toContain('.session-dock-tip {');
    expect(css).toContain('body.has-session-dock .chat-container');
  });

  it('尊重系统「减少动态效果」偏好', () => {
    const css = read('src/side_panel/styles.css');
    const idx = css.lastIndexOf('@media (prefers-reduced-motion: reduce)');
    expect(idx).toBeGreaterThan(0);
    expect(css.slice(idx)).toContain('.session-dock-item.is-flash .session-dock-chip');
  });
});

describe('渲染与初始化接口', () => {
  it('导出渲染、初始化与测试重置三个入口', () => {
    expect(typeof renderDock).toBe('function');
    expect(typeof initSessionDock).toBe('function');
    expect(typeof __resetSessionDockForTest).toBe('function');
  });

  it('初始化幂等：重复调用不重复挂 DOM', () => {
    __resetSessionDockForTest();
    initSessionDock();
    const count = document.querySelectorAll('.session-dock').length;
    initSessionDock();
    expect(document.querySelectorAll('.session-dock').length).toBe(count);
  });

  it('无条目时移除 show 与聊天区走廊类', () => {
    __resetSessionDockForTest();
    document.body.classList.add('has-session-dock');
    renderDock();
    expect(document.body.classList.contains('has-session-dock')).toBe(false);
    const dock = document.querySelector('.session-dock');
    expect(dock.classList.contains('show')).toBe(false);
  });
});
