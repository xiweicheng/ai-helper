// 子任务全量清单展示（含待执行 + 详情区）回归测试
// 背景：plan_task 拆分后，界面只出现"正在执行"的那一行，其余子任务对用户不可见 →
//       用户无法判断计划是否合理、要不要取消/调整；子任务 description 也完全没进 UI。
// 方案：后台在拓扑排序后推一条 nodeType='subtask_plan' 日志条目（items 带 index/id/name/description），
//       它顺着既有 delta 通道进面板、顺着 executionLog 持久化进消息记录（历史恢复零额外改造）。
//       面板按清单升序补齐所有行（缺的渲染成灰色「待执行」），展开区升级为「描述 + 产出摘要 + 节点列表」三段；
//       历史时间线把清单展开成"从未启动的子任务"行。
// @vitest-environment jsdom
import { describe, test, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// jsdom 环境下 import.meta.url 非 file 协议，源文件读取统一用项目根相对路径
const root = process.cwd();
const CHAT_MANAGER_SRC = readFileSync(resolve(root, 'src/side_panel/chat-manager.js'), 'utf8');
const LOG_RENDER_SRC = readFileSync(resolve(root, 'src/side_panel/execution-log-render.js'), 'utf8');
const REACT_LOOP_SRC = readFileSync(resolve(root, 'src/background/react-loop.js'), 'utf8');
const INDEX_SRC = readFileSync(resolve(root, 'src/background/index.js'), 'utf8');
const STYLES_SRC = readFileSync(resolve(root, 'src/side_panel/styles.css'), 'utf8');

const noop = () => {};

let extractSubtaskPlan, expandSubtaskPlanEntries, insertSubtaskRowInOrder;

beforeAll(async () => {
  const makeStore = () => ({
    get: (keys, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
    set: (obj, cb) => { if (typeof cb === 'function') cb(); return Promise.resolve(); },
  });
  globalThis.chrome = {
    storage: {
      local: makeStore(), session: makeStore(),
      onChanged: { addListener: noop },
    },
    runtime: {
      lastError: null, id: 'test-ext',
      getManifest: () => ({ version: '0.0.0', content_scripts: [{ js: [] }] }),
      getURL: (p) => p,
      sendMessage: (msg, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
      connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
      onMessage: { addListener: noop, removeListener: noop },
      getContexts: noop,
    },
    tabs: {
      query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
      remove: noop, reload: noop, goBack: noop, goForward: noop,
      captureVisibleTab: noop, onUpdated: { addListener: noop }, onActivated: { addListener: noop },
    },
    scripting: { executeScript: noop },
    bookmarks: { getTree: noop, search: noop },
    history: { search: noop },
    cookies: { get: noop, getAll: noop, set: noop, remove: noop },
    downloads: { download: noop },
    notifications: { create: noop },
    offscreen: { createDocument: noop, hasDocument: noop },
    sidePanel: { setPanelBehavior: () => Promise.resolve() },
  };
  document.body.innerHTML = '<textarea id="userInput"></textarea><div id="messageList"></div>';
  vi.resetModules();
  ({ extractSubtaskPlan, insertSubtaskRowInOrder } = await import('../../src/side_panel/chat-manager.js'));
  ({ expandSubtaskPlanEntries } = await import('../../src/side_panel/execution-log-render.js'));
});

const planEntry = (id, items, ts = '2026-10-13T00:00:00.000Z') => ({
  id, nodeType: 'subtask_plan', status: 'success', timestamp: ts,
  subtaskTotal: items.length, items,
});
const started = (index, status = 'success') => ({
  id: `st-${index}`, nodeType: 'subtask', status, subtaskIndex: index,
  timestamp: '2026-10-13T00:01:00.000Z', nodeName: `子任务 ${index + 1}`,
});

describe('extractSubtaskPlan：从执行日志解析权威清单', () => {
  test('无 subtask_plan 条目返回 null（旧消息/未拆分任务自动降级）', () => {
    expect(extractSubtaskPlan([started(0)])).toBeNull();
    expect(extractSubtaskPlan([])).toBeNull();
    expect(extractSubtaskPlan(undefined)).toBeNull();
  });
  test('解析出 total 与按 index 升序的 items（含 description）', () => {
    const plan = extractSubtaskPlan([planEntry('p1', [
      { index: 1, id: 'b', name: '第二', description: 'desc-b' },
      { index: 0, id: 'a', name: '第一', description: 'desc-a' },
    ])]);
    expect(plan.total).toBe(2);
    expect(plan.items.map((i) => i.index)).toEqual([1, 0]);
    expect(plan.items[0].description).toBe('desc-b');
  });
  test('多次 plan_task 时取最新一条（倒序扫描）', () => {
    const plan = extractSubtaskPlan([
      planEntry('old', [{ index: 0, id: 'x', name: '旧计划' }], '2026-10-13T00:00:00.000Z'),
      planEntry('new', [{ index: 0, id: 'y', name: '新计划' }], '2026-10-13T09:00:00.000Z'),
    ]);
    expect(plan.items[0].name).toBe('新计划');
  });
  test('剔除缺 index 的脏 item，subtaskTotal 缺失时按 items 长度兜底', () => {
    const plan = extractSubtaskPlan([{ nodeType: 'subtask_plan', items: [{ index: 0, name: 'a' }, { name: '脏数据' }] }]);
    expect(plan.items).toHaveLength(1);
    expect(plan.total).toBe(2);
  });
});

describe('expandSubtaskPlanEntries：推导"从未启动"的待执行行', () => {
  const items = [
    { index: 0, id: 'a', name: '勘察', description: 'd0' },
    { index: 1, id: 'b', name: '重构', description: 'd1' },
    { index: 2, id: 'c', name: '验证', description: 'd2' },
  ];

  test('已启动的 index 不重复生成，未启动的补成 pending 条目', () => {
    const out = expandSubtaskPlanEntries([planEntry('p1', items), started(0), started(2)]);
    const pending = out.filter((e) => e.status === 'pending');
    expect(pending.map((e) => e.subtaskIndex)).toEqual([1]);
    expect(pending[0].subtaskName).toBe('重构');
    expect(pending[0].description).toBe('d1');
  });
  test('subtask_plan 原始条目不进入渲染（避免时间线出现无意义行）', () => {
    const out = expandSubtaskPlanEntries([planEntry('p1', items)]);
    expect(out.some((e) => e.nodeType === 'subtask_plan')).toBe(false);
  });
  test('pending 条目带 nodeType=subtask 与 taskGroup，复用既有分组/徽标渲染', () => {
    const out = expandSubtaskPlanEntries([planEntry('p1', items)]);
    const p0 = out.find((e) => e.subtaskIndex === 0 && e.status === 'pending');
    expect(p0.nodeType).toBe('subtask');
    expect(p0.taskGroup).toBe('subtask_group_0');
    expect(p0.timestamp).toBe('2026-10-13T00:00:00.000Z');
  });
  test('待执行行排在真实日志之后（借用的清单时间戳早于已执行条目）', () => {
    const out = expandSubtaskPlanEntries([planEntry('p1', items), started(0)]);
    expect(out[0].id).toBe('st-0');
    expect(out.slice(1).every((e) => e.status === 'pending')).toBe(true);
    expect(out.slice(1).map((e) => e.subtaskIndex)).toEqual([1, 2]);
  });
  test('时间线排序把待执行行沉到末尾（compareLogEntries）', () => {
    expect(LOG_RENDER_SRC).toMatch(/status === 'pending' \? Number\.MAX_SAFE_INTEGER/);
    expect(LOG_RENDER_SRC).toMatch(/\.sort\(compareLogEntries\)/);
  });

  test('全部子任务都已启动时不新增任何行', () => {
    const out = expandSubtaskPlanEntries([planEntry('p1', items), started(0), started(1), started(2)]);
    expect(out.filter((e) => e.status === 'pending')).toHaveLength(0);
    expect(out).toHaveLength(3);
  });
  test('无清单时原样返回（旧数据零影响）', () => {
    const log = [started(0), started(1)];
    expect(expandSubtaskPlanEntries(log)).toHaveLength(2);
  });
  test('多份清单按 index 去重，后出现的清单优先', () => {
    const out = expandSubtaskPlanEntries([
      planEntry('p1', items, '2026-10-13T00:00:00.000Z'),
      planEntry('p2', [{ index: 0, id: 'n', name: '新勘察', description: 'nd' }], '2026-10-13T10:00:00.000Z'),
    ]);
    const idx0 = out.filter((e) => e.subtaskIndex === 0 && e.status === 'pending');
    expect(idx0).toHaveLength(1);
    expect(idx0[0].subtaskName).toBe('新勘察');
  });
});

describe('后台：清单产出与载荷保全', () => {
  test('executeSubtasks 推 subtask_plan 条目，items 含 index/id/name/description', () => {
    expect(REACT_LOOP_SRC).toMatch(/nodeType: 'subtask_plan'/);
    expect(REACT_LOOP_SRC).toMatch(/items: sortedSubtasks\.map\(\(st, i\) => \(\{ index: i, id: st\.id, name: st\.name, description: st\.description \|\| '' \}\)\)/);
  });
  test('清单条目不进 subtaskIndex 语义（避免误触发面板行渲染），且不带 extraFields 发送', () => {
    const idx = REACT_LOOP_SRC.indexOf("nodeType: 'subtask_plan'");
    expect(idx).toBeGreaterThan(-1);
    const block = REACT_LOOP_SRC.slice(idx - 400, idx + 600);
    expect(block).not.toMatch(/subtaskIndex: 0/);
  });
  test('内存窗口裁剪豁免 subtask_plan（长任务历史视图不丢清单）', () => {
    expect(REACT_LOOP_SRC).toMatch(/nodeType !== 'subtask_plan'/);
  });
  test('最终消息日志截断保留 subtask_plan（index.js 取尾部 N 条会丢掉最老条目）', () => {
    expect(INDEX_SRC).toMatch(/nodeType === 'subtask_plan'/);
  });
  test('子任务产出摘要由 200 字放宽到 600 字', () => {
    expect(REACT_LOOP_SRC).toMatch(/subtaskResult\.content\.substring\(0, 600\)/);
    expect(REACT_LOOP_SRC).toMatch(/subtaskResult\.content\.length > 600/);
  });
  test('子任务开始条目携带 description（已执行子任务也能看描述）', () => {
    expect(REACT_LOOP_SRC).toMatch(
      /status: 'processing',\s*nodeType: 'subtask'[\s\S]{0,400}description: subtask\.description \|\| ''/
    );
  });
});

describe('实时卡片：补齐行 + 待执行态 + 详情区', () => {
  test('按清单升序补齐缺失行，待执行行带 subtask-progress-pending 类', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/extractSubtaskPlan\(executionLog\)/);
    expect(CHAT_MANAGER_SRC).toMatch(/subtask-progress-pending/);
    expect(CHAT_MANAGER_SRC).toMatch(/renderPendingSubtaskRow/);
  });
  test('活动行晚于待执行行创建时仍按 index 升序排列', () => {
    const container = document.createElement('div');
    [2, 1].forEach((i) => {
      const row = document.createElement('div');
      row.className = 'subtask-progress subtask-progress-pending';
      row.dataset.subtaskIndex = i;
      insertSubtaskRowInOrder(container, row);
    });
    const active = document.createElement('div');
    active.className = 'subtask-progress';
    active.dataset.subtaskIndex = 0;
    insertSubtaskRowInOrder(container, active);
    expect(Array.from(container.children).map((c) => c.dataset.subtaskIndex)).toEqual(['0', '1', '2']);
  });

  test('待执行状态标签使用 subtask-status-pending + i18n', () => {

    expect(CHAT_MANAGER_SRC).toMatch(/class="subtask-status-pending"/);
    expect(CHAT_MANAGER_SRC).toMatch(/chatMsg\.subtaskPending/);
  });
  test('详情区三段：描述 + 产出摘要 + 节点列表', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/subtask-detail-desc/);
    expect(CHAT_MANAGER_SRC).toMatch(/subtask-detail-result/);
    expect(CHAT_MANAGER_SRC).toMatch(/chatMsg\.subtaskDescLabel/);
    expect(CHAT_MANAGER_SRC).toMatch(/chatMsg\.subtaskResultLabel/);
  });
  test('子任务名挂 title 悬停速览描述', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/class="subtask-name" title="\$\{escapeAttr\(/);
  });
  test('行激活时清除 pending 类（避免残留灰色样式）', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/classList\.remove\('subtask-progress-pending'\)/);
  });
  test('折叠/过滤点击绑定抽成共享函数并在两条历史恢复路径复用', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/export function bindSubtaskProgressClicks/);
    const calls = CHAT_MANAGER_SRC.match(/bindSubtaskProgressClicks\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe('历史时间线：接入清单展开 + 描述段', () => {
  test('两个渲染入口都先展开清单（实时面板 + 历史执行日志面板）', () => {
    const calls = LOG_RENDER_SRC.match(/const sortedLog = expandSubtaskPlanEntries\(executionLog\)\.sort/g) || [];
    expect(calls).toHaveLength(2);
  });
  test('时间线详情新增描述段', () => {
    expect(LOG_RENDER_SRC).toMatch(/sectionSubtaskDesc/);
    expect(LOG_RENDER_SRC).toMatch(/entry\.description/);
  });
});

describe('i18n 双语', () => {
  test('chatMsg 面板键 zh/en 齐备', () => {
    for (const key of ['subtaskPending', 'subtaskDescLabel', 'subtaskResultLabel']) {
      const hits = CHAT_MANAGER_SRC.match(new RegExp(`${key}:`, 'g')) || [];
      expect(hits.length).toBeGreaterThanOrEqual(2);
    }
  });
  test('execLog 与 reactLoop 命名空间键齐备', () => {
    for (const key of ['sectionSubtaskDesc', 'subtaskPendingNode']) {
      const hits = LOG_RENDER_SRC.match(new RegExp(`${key}:`, 'g')) || [];
      expect(hits.length).toBeGreaterThanOrEqual(2);
    }
    const hits = REACT_LOOP_SRC.match(/subtaskPlanNode:/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});

describe('样式', () => {
  test('待执行行/状态/详情段/时间线 pending 圆点样式存在', () => {
    for (const cls of ['.subtask-progress-pending', '.subtask-status-pending', '.subtask-detail-desc', '.subtask-detail-result', '.timeline-dot.pending']) {
      expect(STYLES_SRC).toContain(cls);
    }
  });
});
