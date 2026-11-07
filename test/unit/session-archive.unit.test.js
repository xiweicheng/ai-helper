// @vitest-environment jsdom
// test/unit/session-archive.unit.test.js - 会话归档区
// 归档 = 在会话对象上打 archivedAt（移出视野），而不是搬数据/删数据。
// 数据层行为用内存版 IndexedDB 桩验证；语义层与 UI 接线用源码守卫。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const noop = () => {};
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        if (typeof cb === 'function') { cb({}); return; }
        return Promise.resolve({});
      },
      set: noop,
      remove: () => Promise.resolve(),
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: (m, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
  },
};

// 内存版 IndexedDB 桩：只实现归档链路涉及的接口
const SESSIONS = new Map();
const ACTIVE = { id: 's1' };
const putSession = vi.fn(async (s) => {
  SESSIONS.set(s.id, JSON.parse(JSON.stringify(s)));
  return true;
});

vi.mock('../../src/storage/db.js', () => ({
  ensureMigration: async () => {},
  getSession: async (id) => (SESSIONS.has(id) ? JSON.parse(JSON.stringify(SESSIONS.get(id))) : null),
  putSession: (...args) => putSession(...args),
  getAllSessions: async () => Array.from(SESSIONS.values()).map((s) => JSON.parse(JSON.stringify(s))),
  // 会话列表现在只读摘要：与生产实现一致地去掉 messageHistory、补 messageCount
  getAllSessionSummaries: async () => Array.from(SESSIONS.values()).map((s) => {
    const { messageHistory, ...rest } = JSON.parse(JSON.stringify(s));
    return { ...rest, messageCount: Array.isArray(messageHistory) ? messageHistory.length : 0 };
  }),
  getActiveSessionId: async () => ACTIVE.id,
  setActiveSessionId: async (id) => { ACTIVE.id = id; },
  deleteSession: async () => {},
  deleteReactCheckpoint: async () => {},
}));
vi.mock('../../src/side_panel/doc-images.js', () => ({
  removeDocImageSnapshot: vi.fn(async () => {}),
}));

const {
  loadSessions,
  archiveSession,
  unarchiveSession,
  listArchivedSessions,
} = await import('../../src/storage/session-store.js');

function seed(id, extra = {}) {
  SESSIONS.set(id, {
    id,
    title: `t-${id}`,
    messageHistory: [{ role: 'user', content: `hello-${id}` }],
    workdir: '/repo',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  });
  return SESSIONS.get(id);
}

describe('归档数据层', () => {
  beforeEach(() => {
    SESSIONS.clear();
    putSession.mockClear();
  });

  it('loadSessions 默认不返回归档会话', async () => {
    seed('s1', { order: 0 });
    seed('s2', { order: 1, archivedAt: '2026-10-01T00:00:00.000Z' });

    const { list } = await loadSessions();
    expect(list.map((s) => s.id)).toEqual(['s1']);
  });

  it('includeArchived 时归档会话回到同一份列表里', async () => {
    seed('s1', { order: 0 });
    seed('s2', { order: 1, archivedAt: '2026-10-01T00:00:00.000Z' });

    const { list } = await loadSessions({ includeArchived: true });
    expect(list.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('归档只写 archivedAt，消息与目录绑定原样保留', async () => {
    seed('s1', { order: 3 });

    expect(await archiveSession('s1')).toBe(true);

    const written = SESSIONS.get('s1');
    expect(written.archivedAt).toBeTruthy();
    expect(written.messageHistory).toEqual([{ role: 'user', content: 'hello-s1' }]);
    expect(written.workdir).toBe('/repo');
    // 归档不等于重置：order 保持原值，恢复时再统一落位
    expect(written.order).toBe(3);
  });

  it('归档顺手清掉残留的 isGenerating，恢复后不会显示成生成中', async () => {
    seed('s1', { isGenerating: true });
    await archiveSession('s1');
    expect(SESSIONS.get('s1').isGenerating).toBe(false);
  });

  it('重复归档幂等，不重复写盘、不刷新 archivedAt', async () => {
    seed('s1');
    await archiveSession('s1');
    const first = SESSIONS.get('s1').archivedAt;
    putSession.mockClear();

    expect(await archiveSession('s1')).toBe(true);
    expect(putSession).not.toHaveBeenCalled();
    expect(SESSIONS.get('s1').archivedAt).toBe(first);
  });

  it('归档不存在的会话返回 false 且不写盘', async () => {
    expect(await archiveSession('missing')).toBe(false);
    expect(await archiveSession('')).toBe(false);
    expect(putSession).not.toHaveBeenCalled();
  });

  it('恢复时删掉 archivedAt，并落到未归档会话的末尾', async () => {
    seed('s1', { order: 0 });
    seed('s3', { order: 7 });
    seed('s2', { order: 1, archivedAt: '2026-10-01T00:00:00.000Z' });

    expect(await unarchiveSession('s2')).toBe(true);

    const restored = SESSIONS.get('s2');
    expect(restored).not.toHaveProperty('archivedAt');
    // 未归档会话的最大 order 是 7 → 落到 8，不与既有 order 撞号
    expect(restored.order).toBe(8);
  });

  it('恢复非归档会话返回 false（不能把普通会话误当归档操作）', async () => {
    seed('s1', { order: 0 });
    expect(await unarchiveSession('s1')).toBe(false);
    expect(await unarchiveSession('missing')).toBe(false);
    expect(putSession).not.toHaveBeenCalled();
  });

  it('归档列表按归档时间倒序（最近归档的在最前）', async () => {
    seed('a', { archivedAt: '2026-10-01T00:00:00.000Z' });
    seed('b', { archivedAt: '2026-10-20T00:00:00.000Z' });
    seed('c', { archivedAt: '2026-09-01T00:00:00.000Z' });
    seed('live', { order: 0 });

    const list = await listArchivedSessions();
    expect(list.map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('归档后恢复，会话重新出现在普通列表里', async () => {
    seed('s1', { order: 0 });
    await archiveSession('s1');
    expect((await loadSessions()).list).toEqual([]);

    await unarchiveSession('s1');
    expect((await loadSessions()).list.map((s) => s.id)).toEqual(['s1']);
  });
});

// ---------------- 源码守卫 ----------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('归档语义层（源码守卫）', () => {
  it('执行中 / 有排队任务的会话不允许归档', () => {
    const src = read('src/side_panel/session-manager.js');
    expect(src).toContain('export function isSessionArchivable');
    expect(src).toContain("reason: 'running'");
    expect(src).toContain("reason: 'queued'");
    // 归档成功要顺手清掉「完成待查看」标记，否则恢复后凭空多出一个完成红点
    expect(src).toContain('state.completedSessionIds.delete(sessionId)');
  });

  it('切到归档会话时自动解档，避免切进一个列表里看不见的会话', () => {
    const src = read('src/storage/session-store.js');
    const idx = src.indexOf('export async function switchToSession');
    expect(idx).toBeGreaterThan(0);
    const body = src.slice(idx, idx + 1600);
    expect(body).toContain('targetSession.archivedAt');
    expect(body).toContain('delete targetSession.archivedAt');
  });

  it('全局搜索与「全部会话」都不返回归档会话', () => {
    expect(read('src/storage/db.js')).toContain('all.filter((s) => !s.archivedAt)');
    expect(read('src/side_panel/search-panel.js')).toContain('!s.archivedAt');
  });
});

describe('会话摘要索引（列表读库不随消息总量增长）', () => {
  it('列表只读 sessionIndex：摘要在同一事务里与正文双写，删除也同步', () => {
    const db = read('src/storage/db.js');
    expect(db).toContain("db.createObjectStore('sessionIndex'");
    expect(db).toContain('export function getAllSessionSummaries()');
    expect(db).toContain("db.transaction(['sessions', 'sessionIndex'], 'readwrite')");
    // 漏删摘要会出现点不开的幽灵会话，必须同事务删
    expect(db).toContain('index.delete(id)');
  });

  it('摘要只丢 messageHistory，其余字段原样保留（未来新增标量字段不会漏）', () => {
    const db = read('src/storage/db.js');
    expect(db).toContain('const { messageHistory, ...rest } = session;');
    expect(db).toContain('messageCount: Array.isArray(messageHistory) ? messageHistory.length : 0');
    // 老库升级时用游标逐条回填，不允许 getAll 一次性把历史读进内存
    expect(db).toContain('if (event.oldVersion < 8)');
    expect(db).toContain('openCursor().onsuccess');
  });

  it('loadSessions 不再全量读正文；激活会话的完整记录按需单独读', () => {
    const store = read('src/storage/session-store.js');
    const load = store.slice(
      store.indexOf('export async function loadSessions'),
      store.indexOf('export async function saveSessions')
    );
    expect(load).toContain('idb.getAllSessionSummaries()');
    // 只有摘要不可用时才退回全量读（宁可慢一次，也不能列表变空）
    expect(load).toContain('if (!summaries)');
    expect(load).toContain('withActiveHistory');
    expect(load).toContain('const full = await idb.getSession(activeId);');
    // 高频列表刷新不带历史，避免反复读大记录
    expect(read('src/side_panel/session-manager-ui.js'))
      .toContain('await loadSessions({ withActiveHistory: false })');
  });
});

describe('摘要索引的完整覆盖（归档 / 拖拽 / 写入失败）', () => {
  it('归档列表与归档计数只读摘要，不再每次重绘反序列化全部历史', () => {
    const store = read('src/storage/session-store.js');
    const idx = store.indexOf('export async function listArchivedSessions');
    expect(idx).toBeGreaterThan(0);
    const body = store.slice(idx, idx + 900);
    expect(body).toContain('idb.getAllSessionSummaries()');
    // 只有摘要不可用才兜底全量读
    expect(body).toContain('summaries ?? await idb.getAllSessions()');
    // 标签栏每次重绘都会补查归档计数，这条路径必须保持轻量
    expect(read('src/side_panel/session-manager-ui.js')).toContain('refreshMoreBtnArchivedState(scrollContainer)');
  });

  it('拖拽排序只更新位置变化的会话，并合并为一次事务', () => {
    const store = read('src/storage/session-store.js');
    const idx = store.indexOf('export async function reorderSessions');
    expect(idx).toBeGreaterThan(0);
    const body = store.slice(idx, idx + 1400);
    expect(body).toContain('const changedIds');
    // 只对变化项单读完整记录，避免把整库历史反序列化一遍
    expect(body).toContain('const full = await idb.getSession(id);');
    expect(body).toContain('return idb.putSessions(updates);');
  });

  it('会话写事务失败会重置重试，mutator 异常会 abort（正文与摘要不分叉）', () => {
    const db = read('src/storage/db.js');
    const idx = db.indexOf('function withSessionWrite');
    expect(idx).toBeGreaterThan(0);
    const body = db.slice(idx, idx + 900);
    expect(body).toContain('try { tx.abort(); } catch (e2) {}');
    expect(body).toContain('withSessionWrite(mutator, true)');
    expect(body).toContain('resetDBConnection()');
    // 兜底投影复用统一实现，避免两处字段语义漂移
    expect(read('src/storage/session-store.js')).toContain('idb.buildSessionSummary(s)');
  });
});

describe('归档面板接线（源码守卫）', () => {
  it('会话列表底部有归档区入口，页面里有一层独立面板', () => {
    const html = read('side_panel.html');
    expect(html).toContain('id="sessionArchiveEntry"');
    expect(html).toContain('id="sessionArchiveEntryLabel"');
    expect(html).toContain('id="sessionArchivePanel"');
    expect(html).toContain('id="sessionArchiveList"');
    expect(html).toContain('id="sessionArchiveBackBtn"');
  });

  it('三个入口都接到同一个归档流程：列表行按钮、右键菜单、归档区入口', () => {
    const src = read('src/side_panel/session-manager-ui.js');
    expect(src).toContain('archiveSessionFlow');
    expect(src).toContain('session-dropdown-item-archive');
    expect(src).toContain("t('session.archive')");
    expect(src).toContain('initArchivePanel()');
  });

  it('彻底删除必须二次确认，且复用普通删除的清理路径', () => {
    const src = read('src/side_panel/session-manager-ui.js');
    const idx = src.indexOf('async function deleteArchivedFlow');
    expect(idx).toBeGreaterThan(0);
    const body = src.slice(idx, idx + 900);
    expect(body).toContain('showCustomConfirm');
    expect(body).toContain('deleteArchivedSession');
    expect(read('src/side_panel/session-manager.js'))
      .toMatch(/export async function deleteArchivedSession\(sessionId\) \{\s*return deleteSession\(sessionId\);/);
  });

  it('归档掉当前会话后必须切走（否则用户停在看不见的会话上）', () => {
    const src = read('src/side_panel/session-manager-ui.js');
    expect(src).toContain('switchAwayFromArchived');
    expect(src).toContain('wasActive');
  });

  it('归档面板与停靠条共用归档 / 删除事件', () => {
    const src = read('src/side_panel/session-manager-ui.js');
    expect(src).toContain("new CustomEvent('session-archived'");
    expect(src).toContain("new CustomEvent('session-deleted'");
  });

  it('三点按钮显隐条件是「溢出 ∥ 有归档」，不能只看溢出', () => {
    // 归档区只挂在三点按钮的下拉面板里；若只看溢出，「标签全部放得下 + 有归档」
    // 的组合就没有任何入口能看到归档会话
    const src = read('src/side_panel/session-manager-ui.js');
    const idx = src.indexOf('function checkOverflow');
    expect(idx).toBeGreaterThan(0);
    const body = src.slice(idx, idx + 500);
    expect(body).toContain('archivedCountForMoreBtn > 0');
    expect(body).toContain('scrollWidth > scrollContainer.clientWidth');
  });

  it('三点按钮的归档计数在渲染与徽标刷新两处都会更新', () => {
    const src = read('src/side_panel/session-manager-ui.js');
    // 渲染尾部异步补查（带令牌防竞态）
    expect(src).toContain('void refreshMoreBtnArchivedState(scrollContainer)');
    expect(src).toContain('token !== archivedCountToken');
    // 归档/恢复/彻底删除走的 refreshArchiveEntryCount 必须同步计数并重算显隐，
    // 否则归档后按钮消失 / 清空归档后残留
    const entryIdx = src.indexOf('async function refreshArchiveEntryCount');
    const entryBody = src.slice(entryIdx, entryIdx + 900);
    expect(entryBody).toContain('archivedCountForMoreBtn = list.length');
    expect(entryBody).toContain('checkOverflow(scrollContainer)');
  });
});

describe('定时任务与归档的边界（源码守卫）', () => {
  it('宿主会话被归档时视为不可用，重建专属会话而不是往看不见的会话里写结果', () => {
    const src = read('src/background/scheduler.js');
    const idx = src.indexOf('async function resolveHostSession');
    expect(idx).toBeGreaterThan(0);
    expect(src.slice(idx, idx + 600)).toContain('!s.archivedAt');
  });

  it('运行状态广播带上 sessionId（停靠条按会话维度展示）', () => {
    const src = read('src/background/scheduler.js');
    expect(src).toContain('sessionId: hostSession.id');
    expect(src).toContain('sessionId: task.sessionId');
  });
});
