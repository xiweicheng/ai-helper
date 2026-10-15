// @vitest-environment jsdom
// 记忆条目管理区行为钉：列表源必须走 manage(review) 而非 recall（recall 会更新访问统计并做
// 会话去重，管理端调用会污染召回数据）；筛选纯客户端；编辑/删除的 store 参数形状；
// 删除只需 memoryId；compact 走确认；404/失败/离线三态如实展示（不许停在「读取中」）。
// 另钉 zh/en memoryEntries 键与占位符对齐 + 真实 t() 渲染无占位符残留。
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { t } from '../../src/shared/i18n.js';

const { apiCalls, toastCalls, confirmCalls, confirmState } = vi.hoisted(() => ({
  apiCalls: [], toastCalls: [], confirmCalls: [], confirmState: { result: true }
}));

const FACT1 = {
  id: 'fact_1', type: 'fact', category: 'custom', content: '使用 macOS 15，Node v22',
  tags: ['环境'], importance: 9, accessCount: 3,
  lastAccessAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', value: '42.10'
};
const FACT2 = {
  id: 'fact_2', type: 'fact', category: 'custom', content: '偏好 pnpm 而非 npm',
  tags: ['偏好', '工具链'], importance: 6, accessCount: 0,
  lastAccessAt: null, createdAt: '2026-09-05T00:00:00.000Z', value: '18.20'
};
const SUM1 = {
  id: 'sum_1', type: 'summary', category: 'auto', title: '记忆下推会话摘要',
  content: '本次会话完成了记忆逻辑下推 agent 端的联调', tags: [], importance: 5, accessCount: 1,
  lastAccessAt: '2026-09-20T00:00:00.000Z', createdAt: '2026-09-10T00:00:00.000Z', value: '8.90'
};

let REVIEW = { success: true, scored: [FACT1, FACT2, SUM1], candidates: [SUM1], stats: {} };
let nextStore = null;      // 非 null 时接管 store 响应
let nextCompact = null;    // 非 null 时接管 compact 响应
let storeDeferred = null;  // {promise, resolve}：测写在途锁
let agentConnected = true;

vi.mock('../../src/options/toolbox-shared.js', () => ({
  getAgentConnection: vi.fn(async () => ({ url: 'http://127.0.0.1:18910', token: 't', connected: agentConnected })),
  agentApi: vi.fn(async (method, path, body) => {
    apiCalls.push({ method, path, body });
    if (method === 'POST' && path === '/api/memory/manage') {
      if (body?.action === 'review') return REVIEW;
      if (body?.action === 'compact') return nextCompact || { success: true, removedFacts: 0, removedSummaries: 1 };
    }
    if (method === 'POST' && path === '/api/memory/store') {
      if (storeDeferred) return storeDeferred.promise;
      return nextStore || { success: true, message: 'ok' };
    }
    return { success: false, error: 'unexpected api call' };
  }),
  escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  showToast: (m, k) => toastCalls.push([m, k]),
  showCustomConfirm: vi.fn(async (m) => { confirmCalls.push(m); return confirmState.result; })
}));

globalThis.chrome = {
  storage: { local: { get: (k, cb) => { cb({}); }, set: async () => {} }, onChanged: { addListener: () => {} } }
};

const DOM = `
<button id="memoryEntriesRefreshBtn" type="button"></button>
<input type="text" id="memoryEntriesSearch">
<select id="memoryEntriesTypeFilter"><option value="all"></option><option value="fact"></option><option value="summary"></option></select>
<select id="memoryEntriesSort"><option value="createdDesc"></option><option value="importanceDesc"></option><option value="valueDesc"></option><option value="valueAsc"></option></select>
<span id="memoryEntriesCount"></span>
<div id="memoryEntriesCandidates" style="display:none;"></div>
<div id="memoryEntriesStatus" style="display:none;"></div>
<div id="memoryEntriesList"></div>`;

const $id = (id) => document.getElementById(id);
const statusText = () => $id('memoryEntriesStatus').textContent;
const rows = () => [...document.querySelectorAll('#memoryEntriesList .memory-entry-item')];
const manageCalls = () => apiCalls.filter(c => c.method === 'POST' && c.path === '/api/memory/manage');
const storeCalls = () => apiCalls.filter(c => c.method === 'POST' && c.path === '/api/memory/store');

let mod;
beforeEach(async () => {
  vi.resetModules();
  apiCalls.length = 0; toastCalls.length = 0; confirmCalls.length = 0;
  confirmState.result = true;
  REVIEW = { success: true, scored: [FACT1, FACT2, SUM1], candidates: [SUM1], stats: {} };
  nextStore = null; nextCompact = null; storeDeferred = null;
  agentConnected = true;
  document.body.innerHTML = DOM;
  mod = await import('../../src/options/memory-entries.js');
  mod.initMemoryEntries();
  await mod.refreshMemoryEntries();
  await vi.waitFor(() => expect(manageCalls().some(c => c.body?.action === 'review')).toBe(true));
});

describe('记忆条目区：列表数据源', () => {
  test('刷新走 manage(review)，绝不调 recall（召回统计与会话去重不许被管理端污染）', async () => {
    expect(manageCalls().some(c => c.body?.action === 'review')).toBe(true);
    expect(apiCalls.some(c => c.path === '/api/memory/recall')).toBe(false);
    expect($id('memoryEntriesStatus').style.display).toBe('none');
  });

  test('渲染全部条目：内容/类型徽标/重要度/价值分/标签齐备，计数为「显示 / 总数」', async () => {
    expect(rows()).toHaveLength(3);
    const first = rows().find(r => r.dataset.id === 'fact_1');
    expect(first.querySelector('.memory-entry-content').textContent).toContain('macOS');
    expect(first.querySelector('.memory-entry-badge').textContent).toBe(t('memoryEntries.filterFact'));
    expect(first.textContent).toContain(t('memoryEntries.importanceShort'));
    expect(first.textContent).toContain('42.10');
    expect($id('memoryEntriesCount').textContent).toBe(t('memoryEntries.count', { shown: 3, total: 3 }));
  });

  test('低价值候选：淘汰提示条显示条数且无占位符残留，候选行带 low-value 高亮', async () => {
    const box = $id('memoryEntriesCandidates');
    expect(box.style.display).toBe('');
    expect(box.textContent).toContain(String(REVIEW.candidates.length));
    expect(box.textContent).not.toMatch(/\{\w+\}/);
    expect(document.querySelector('.memory-entry-item[data-id="sum_1"].low-value')).toBeTruthy();
  });

  test('404（旧代理无 manage 端点）提示升级重启，不得停在「读取中」', async () => {
    REVIEW = { success: false, httpStatus: 404, error: 'unknown' };
    await mod.refreshMemoryEntries();
    expect(statusText()).toContain(t('memoryEntries.unsupported'));
    expect(statusText()).not.toContain(t('memoryEntries.loading'));
  });

  test('业务失败把 agent 返回的真实错误显示出来', async () => {
    REVIEW = { success: false, httpStatus: 400, error: 'memory_read_failed' };
    await mod.refreshMemoryEntries();
    expect(statusText()).toContain('memory_read_failed');
    expect(statusText()).toContain(t('memoryEntries.loadFail').slice(0, 4));
  });

  test('代理未连接：一个请求都不发，如实展示离线态', async () => {
    agentConnected = false;
    apiCalls.length = 0;
    await mod.refreshMemoryEntries();
    expect(apiCalls).toHaveLength(0);
    expect(statusText()).toContain(t('memoryEntries.offline'));
  });
});

describe('记忆条目区：筛选（纯客户端，不额外发请求）', () => {
  test('关键词命中内容与标签；不命中时给「无匹配」而不是「空列表」文案', async () => {
    $id('memoryEntriesSearch').value = 'pnpm';
    $id('memoryEntriesSearch').dispatchEvent(new Event('input'));
    expect(rows()).toHaveLength(1);
    expect(storeCalls()).toHaveLength(0);

    $id('memoryEntriesSearch').value = '环境';   // 命中标签
    $id('memoryEntriesSearch').dispatchEvent(new Event('input'));
    expect(rows().map(r => r.dataset.id)).toEqual(['fact_1']);

    $id('memoryEntriesSearch').value = '查无此词';
    $id('memoryEntriesSearch').dispatchEvent(new Event('input'));
    expect($id('memoryEntriesList').textContent).toContain(t('memoryEntries.noMatch'));
  });

  test('类型筛选 fact/summary 与关键词叠加生效', async () => {
    $id('memoryEntriesTypeFilter').value = 'summary';
    $id('memoryEntriesTypeFilter').dispatchEvent(new Event('change'));
    expect(rows().map(r => r.dataset.id)).toEqual(['sum_1']);
  });
});

// 排序规则对用户可见（下拉选项文案即规则）；默认创建时间倒序是旧隐式行为的回归钩。
describe('记忆条目区：排序', () => {
  const setSort = (v) => {
    $id('memoryEntriesSort').value = v;
    $id('memoryEntriesSort').dispatchEvent(new Event('change'));
  };

  test('默认按创建时间倒序（新→旧），且切排序不重发请求（纯前端重排）', async () => {
    // 夹具 createdAt：sum_1(09-10) > fact_2(09-05) > fact_1(09-01)
    expect(rows().map(r => r.dataset.id)).toEqual(['sum_1', 'fact_2', 'fact_1']);
    const reviews = manageCalls().filter(c => c.body?.action === 'review').length;
    setSort('valueAsc');
    expect(rows().map(r => r.dataset.id)).toEqual(['sum_1', 'fact_2', 'fact_1']);
    expect(manageCalls().filter(c => c.body?.action === 'review')).toHaveLength(reviews);
  });

  test('重要度降序 / 价值分升降序各自生效', async () => {
    setSort('importanceDesc');   // 9 / 6 / 5
    expect(rows().map(r => r.dataset.id)).toEqual(['fact_1', 'fact_2', 'sum_1']);
    setSort('valueDesc');        // 42.10 / 18.20 / 8.90
    expect(rows().map(r => r.dataset.id)).toEqual(['fact_1', 'fact_2', 'sum_1']);
    setSort('valueAsc');
    expect(rows().map(r => r.dataset.id)).toEqual(['sum_1', 'fact_2', 'fact_1']);
  });

  test('同分回落创建时间倒序，不依赖引擎对相等元素的稳定约定', async () => {
    const tieA = { ...FACT1, id: 'fact_a', importance: 6, createdAt: '2026-09-20T00:00:00.000Z' };
    const tieB = { ...FACT2, id: 'fact_b', importance: 6, createdAt: '2026-09-02T00:00:00.000Z' };
    REVIEW = { success: true, scored: [tieB, tieA], candidates: [], stats: {} };
    await mod.refreshMemoryEntries();
    setSort('importanceDesc');
    expect(rows().map(r => r.dataset.id)).toEqual(['fact_a', 'fact_b']);
  });

  test('排序与类型筛选正交叠加', async () => {
    $id('memoryEntriesTypeFilter').value = 'fact';
    $id('memoryEntriesTypeFilter').dispatchEvent(new Event('change'));
    setSort('importanceDesc');
    expect(rows().map(r => r.dataset.id)).toEqual(['fact_1', 'fact_2']);
  });
});

describe('记忆条目区：编辑', () => {
  const openEdit = (id) => {
    const row = document.querySelector(`.memory-entry-item[data-id="${id}"]`);
    row.querySelector('[data-act="edit"]').click();
    return document.getElementById('memoryEntryEditModal');
  };

  test('弹窗预填当前内容/重要度/标签', async () => {
    const modal = openEdit('fact_1');
    expect(modal).toBeTruthy();
    expect(modal.querySelector('#memoryEntryEditContent').value).toContain('macOS');
    expect(modal.querySelector('#memoryEntryEditImportance').value).toBe('9');
    expect(modal.querySelector('#memoryEntryEditTags').value).toBe('环境');
  });

  test('保存 → store update 恰好一发，body 带 memoryId/type/content/importance/tags，成功后关弹窗并重拉列表', async () => {
    const modal = openEdit('fact_1');
    modal.querySelector('#memoryEntryEditContent').value = '  使用 macOS 15，Node v24  ';
    modal.querySelector('#memoryEntryEditTags').value = '环境，工具链、升级';
    modal.querySelector('#memoryEntryEditSave').click();
    await vi.waitFor(() => expect(storeCalls()).toHaveLength(1));
    expect(storeCalls()[0].body).toEqual({
      action: 'update', memoryId: 'fact_1', type: 'fact',
      content: '使用 macOS 15，Node v24', importance: 9,
      tags: ['环境', '工具链', '升级']
    });
    await vi.waitFor(() => expect(document.getElementById('memoryEntryEditModal')).toBeNull());
    expect(manageCalls().filter(c => c.body?.action === 'review')).toHaveLength(2);
  });

  test('内容清空保存：拒绝并发 error toast，不发 store 请求', async () => {
    const modal = openEdit('fact_1');
    modal.querySelector('#memoryEntryEditContent').value = '   ';
    modal.querySelector('#memoryEntryEditSave').click();
    await vi.waitFor(() => expect(toastCalls.some(([m, k]) => k === 'error' && m === t('memoryEntries.contentEmpty'))).toBe(true));
    expect(storeCalls()).toHaveLength(0);
    modal.querySelector('#memoryEntryEditCancel').click();
  });

  test('取消编辑：不发 store 请求', async () => {
    const modal = openEdit('fact_1');
    modal.querySelector('#memoryEntryEditCancel').click();
    expect(storeCalls()).toHaveLength(0);
    expect(document.getElementById('memoryEntryEditModal')).toBeNull();
  });

  test('接口失败：error toast 带真实原因，弹窗保持（可改完再试）', async () => {
    nextStore = { success: false, error: 'memory_not_found' };
    const modal = openEdit('fact_1');
    modal.querySelector('#memoryEntryEditSave').click();
    await vi.waitFor(() => expect(toastCalls.some(([m, k]) => k === 'error' && m.includes('memory_not_found'))).toBe(true));
    expect(document.getElementById('memoryEntryEditModal')).toBeTruthy();
    modal.remove();
  });
});

describe('记忆条目区：删除与压缩', () => {
  const clickDelete = (id) => {
    document.querySelector(`.memory-entry-item[data-id="${id}"] [data-act="delete"]`).click();
  };

  test('删除只需 memoryId（body 恰好两个字段，不带 type/content）', async () => {
    clickDelete('fact_2');
    await vi.waitFor(() => expect(confirmCalls).toHaveLength(1));
    await vi.waitFor(() => expect(storeCalls()).toHaveLength(1));
    expect(storeCalls()[0].body).toEqual({ action: 'delete', memoryId: 'fact_2' });
    await vi.waitFor(() => expect(toastCalls.some(([m]) => m === t('memoryEntries.deleted'))).toBe(true));
  });

  test('确认取消：不发 store 请求', async () => {
    confirmState.result = false;
    clickDelete('fact_2');
    await vi.waitFor(() => expect(confirmCalls).toHaveLength(1));
    expect(storeCalls()).toHaveLength(0);
  });

  test('写在途锁：store 未回时刷新按钮禁用且第二次点击不再发请求', async () => {
    let resolveStore;
    storeDeferred = { promise: new Promise((r) => { resolveStore = r; }), resolve: null };
    storeDeferred.resolve = resolveStore;
    clickDelete('fact_2');
    await vi.waitFor(() => expect(storeCalls()).toHaveLength(1));
    expect($id('memoryEntriesRefreshBtn').disabled).toBe(true);
    clickDelete('fact_2');   // 在途再点一次
    expect(storeCalls()).toHaveLength(1);
    storeDeferred.resolve({ success: true, message: 'ok' });
    await vi.waitFor(() => expect($id('memoryEntriesRefreshBtn').disabled).toBe(false));
  });

  test('一键压缩：确认文案带条数与阈值，走 manage(compact)，toast 如实报删除数并重拉列表', async () => {
    nextCompact = { success: true, removedFacts: 1, removedSummaries: 2 };
    document.querySelector('.memory-entries-compact-btn').click();
    await vi.waitFor(() => expect(confirmCalls).toHaveLength(1));
    expect(confirmCalls[0]).toContain('1');    // 候选条数写进确认文案
    expect(confirmCalls[0]).toContain('10');   // 淘汰阈值
    await vi.waitFor(() => expect(manageCalls().some(c => c.body?.action === 'compact')).toBe(true));
    await vi.waitFor(() => expect(toastCalls.some(([m]) => m.includes('1') && m.includes('2'))).toBe(true));
    expect(manageCalls().filter(c => c.body?.action === 'review')).toHaveLength(2);
  });

  test('压缩取消：不发 compact 请求', async () => {
    confirmState.result = false;
    document.querySelector('.memory-entries-compact-btn').click();
    await vi.waitFor(() => expect(confirmCalls).toHaveLength(1));
    expect(manageCalls().some(c => c.body?.action === 'compact')).toBe(false);
  });
});

describe('记忆条目区：点击展开长文案', () => {
  test('点内容切换 expanded，点按钮不误触展开', async () => {
    const row = document.querySelector('.memory-entry-item[data-id="fact_1"]');
    row.querySelector('.memory-entry-content').click();
    expect(row.classList.contains('expanded')).toBe(true);
    row.querySelector('.memory-entry-content').click();
    expect(row.classList.contains('expanded')).toBe(false);
  });
});

// 探针实测缺口：静态标签由 applyI18n 刷，而本区文案全是 JS 拼的——不订阅语言变更，
// 热切换后会出现「英文页面里夹中文徽标」的混排态。
describe('记忆条目区：语言热切换', () => {
  test('切到 en 后动态文案重渲染（徽标/候选条/计数），切回 zh 恢复', async () => {
    const { setLanguage } = await import('../../src/shared/i18n.js');
    setLanguage('en', false);
    // 锁定 fact_1 行的徽标：列表按 createdAt 倒序，全局首个徽标属于 summary 行
    await vi.waitFor(() => expect(
      document.querySelector('.memory-entry-item[data-id="fact_1"] .memory-entry-badge').textContent).toBe('Facts'));
    expect(document.getElementById('memoryEntriesCandidates').textContent).toContain('low-value');
    expect(document.getElementById('memoryEntriesCount').textContent).toBe('3 of 3');
    setLanguage('zh', false);
    await vi.waitFor(() => expect(
      document.querySelector('.memory-entry-item[data-id="fact_1"] .memory-entry-badge').textContent).toBe('事实'));
  });
});

// 结构钉（对齐 memory-panel-structure 的惯例）：真实页面 id 齐备 + 中英键与占位符对齐。
// jsdom 下 import.meta.url 是 http scheme，readFileSync 只认 file，改走 cwd 相对路径（vitest 在工作区根目录跑）。
describe('记忆条目区：结构与文案', () => {
  const read = (p) => readFileSync(p, 'utf8');
  const html = read('options.html');

  test('options.html 条目区所需 id 逐个存在', () => {
    for (const id of ['memoryEntriesRefreshBtn', 'memoryEntriesSearch', 'memoryEntriesTypeFilter',
      'memoryEntriesSort', 'memoryEntriesCount', 'memoryEntriesCandidates', 'memoryEntriesStatus', 'memoryEntriesList']) {
      expect(html, `options.html 缺 id=${id}`).toContain(`id="${id}"`);
    }
  });

  test('memoryEntries 命名空间中英键完全对齐', () => {
    const src = (label) => read(`src/shared/locales/${label}.js`);
    const block = (s) => {
      const m = s.match(/\n  memoryEntries: \{([\s\S]*?)\n  \},/);
      expect(m, '缺 memoryEntries 命名空间').toBeTruthy();
      return m[1];
    };
    const keys = (b) => [...b.matchAll(/^\s{4}(\w+):/gm)].map((x) => x[1]).sort();
    const placeholders = (b) => [...b.matchAll(/\{\w+\}/g)].map((x) => x[0]).sort();
    const zhBlock = block(src('zh')); const enBlock = block(src('en'));
    expect(keys(zhBlock).length).toBeGreaterThan(20);
    expect(keys(enBlock)).toEqual(keys(zhBlock));
    expect(placeholders(enBlock)).toEqual(placeholders(zhBlock));
  });

  // jsdom 无布局，内滚只能钉 CSS 文本与 DOM 结构；真实高度约束与滚动行为归探针。
  test('列表容器限高内滚，且筛选/排序/候选条不在滚动区内', () => {
    const css = read('src/options/styles.css');
    const m = css.match(/\.memory-entries-list \{([^}]*)\}/);
    expect(m, '缺 .memory-entries-list 规则').toBeTruthy();
    expect(m[1]).toMatch(/max-height:\s*min\(\s*\d+px\s*,\s*\d+vh\s*\)/); // 必须有 vh 档，否则矮视口仍撑页
    expect(m[1]).toMatch(/overflow-y:\s*auto/);
    // 滚动容器必须是空壳：筛选行/排序下拉/候选条一旦成为其后代，往下翻就找不到控件
    expect(html).toMatch(/<div id="memoryEntriesList"[^>]*><\/div>/);
    expect(html.indexOf('id="memoryEntriesSort"')).toBeLessThan(html.indexOf('id="memoryEntriesList"'));
  });
});
