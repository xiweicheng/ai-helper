// @vitest-environment jsdom
// 回归：子任务状态「准备中...」卡死的两个纯函数。
//
// 1) shouldSendSubtaskStatusUpdate：后台曾因 deltaLog 为空直接丢弃状态更新，
//    导致子任务终态（success/failed/rolledback）永远到不了前端，行一直停在「执行中 / 准备中」。
// 2) resolveRunningNodeLabel：运行中但暂无 processing 节点时，应显示「执行中...」而不是「准备中...」。
import { describe, test, expect, beforeAll } from 'vitest';

const noop = () => {};

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        if (typeof cb === 'function') cb({});
        else return Promise.resolve({});
      },
      set: (obj, cb) => {
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      },
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: {
    lastError: null,
    id: 'test-ext',
    getManifest: () => ({ version: '0.0.0', content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: (msg, cb) => {
      if (typeof cb === 'function') cb({});
      return Promise.resolve({});
    },
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

let shouldSendSubtaskStatusUpdate;
let resolveRunningNodeLabel;
let reconcileSubtaskRowStates;
let extractSubtaskPlan;

beforeAll(async () => {
  document.body.innerHTML = '<div id="messageList"></div>';
  ({ shouldSendSubtaskStatusUpdate } = await import('../../src/background/react-loop.js'));
  ({ resolveRunningNodeLabel, reconcileSubtaskRowStates, extractSubtaskPlan } = await import('../../src/side_panel/chat-manager.js'));
});

describe('shouldSendSubtaskStatusUpdate', () => {
  test('空 delta + 状态变化 → 必须发送（终态不能被吞）', () => {
    expect(shouldSendSubtaskStatusUpdate('processing', 'success', 0)).toBe(true);
    expect(shouldSendSubtaskStatusUpdate('processing', 'failed', 0)).toBe(true);
    expect(shouldSendSubtaskStatusUpdate(undefined, 'processing', 0)).toBe(true);
  });

  test('空 delta + 同状态 → 跳过（保持节流）', () => {
    expect(shouldSendSubtaskStatusUpdate('processing', 'processing', 0)).toBe(false);
    expect(shouldSendSubtaskStatusUpdate('success', 'success', 0)).toBe(false);
  });

  test('有 delta → 一律发送', () => {
    expect(shouldSendSubtaskStatusUpdate('processing', 'processing', 3)).toBe(true);
    expect(shouldSendSubtaskStatusUpdate(undefined, undefined, 1)).toBe(true);
  });
});

describe('resolveRunningNodeLabel', () => {
  test('有 processing 节点 → 展示节点名', () => {
    expect(resolveRunningNodeLabel({ nodeName: 'API调用 (第40次)' })).toBe('API调用 (第40次)');
  });

  test('运行中但暂无 processing 节点 → 展示「执行中...」而不是「准备中...」', () => {
    expect(resolveRunningNodeLabel(null)).toBe('执行中...');
    expect(resolveRunningNodeLabel({})).toBe('执行中...');
  });

  test('节点名做 HTML 转义', () => {
    expect(resolveRunningNodeLabel({ nodeName: '<img onerror=x>' })).toBe('&lt;img onerror=x&gt;');
  });
});

// 回归：终态消息丢失时子任务行永久卡在「执行中」。failureStrategy=continue 下后台
// 已前移执行指针（子任务 2 已完成、子任务 3 执行中），子任务 1 的行却仍转圈——
// reconcileSubtaskRowStates 以权威 executionLog 就地把这类行改写为终态。
describe('reconcileSubtaskRowStates（终态消息丢失后的行状态对账）', () => {
  const planEntry = {
    id: 'plan', iteration: 0, timestamp: '2026-11-21T00:00:00.000Z', status: 'success',
    nodeType: 'subtask_plan', subtaskTotal: 3,
    items: [
      { index: 0, id: 's0', name: '素材盘点与账号状态检查', description: 'desc-0' },
      { index: 1, id: 's1', name: '撰写文章', description: 'desc-1' },
      { index: 2, id: 's2', name: '四平台分发', description: 'desc-2' },
    ],
  };
  const node = (i, status) => ({ id: `n${i}-${status}`, nodeType: 'api_call', subtaskIndex: i, status });

  const makeLog = ({ withMainLog, mainStatus } = {}) => {
    const log = [planEntry];
    // 子任务 0：98 成功 + 6 失败，全部落定（无 processing）
    for (let k = 0; k < 98; k++) log.push(node(0, 'success'));
    for (let k = 0; k < 6; k++) log.push(node(0, 'failed'));
    // 子任务 1：已完成
    for (let k = 0; k < 3; k++) log.push(node(1, 'success'));
    if (withMainLog) {
      log.push({ id: 'main-0', nodeType: 'subtask', subtaskIndex: 0, status: mainStatus, nodeName: '子任务 1', error: 'boom', result: '产出摘要' });
    }
    return log;
  };

  const makeRow = (index, className) => {
    const el = document.createElement('div');
    el.className = className;
    el.dataset.subtaskIndex = String(index);
    return el;
  };

  test('主日志无终态 + 节点全部落定 → 按统计推断改写为「部分完成」', () => {
    document.body.innerHTML = '<div id="content"></div>';
    const contentDiv = document.getElementById('content');
    contentDiv.appendChild(makeRow(0, 'subtask-progress subtask-progress-active'));
    contentDiv.appendChild(makeRow(1, 'subtask-progress subtask-progress-done'));

    reconcileSubtaskRowStates(contentDiv, makeLog(), 1);

    const row = contentDiv.querySelector('[data-subtask-index="0"]');
    expect(row.dataset.terminal).toBe('1');
    expect(row.classList.contains('subtask-progress-active')).toBe(false);
    expect(row.classList.contains('subtask-progress-failed')).toBe(true);
    expect(row.querySelector('.subtask-status-partial')).not.toBeNull();
    expect(row.textContent).toContain('98');
    // 折叠详情可展开：任务描述 + 节点列表（✓N 过滤口径与主渲染路径一致）
    row.querySelector('.subtask-header').click();
    expect(row._renderNodes).toBeTypeOf('function');
    row._renderNodes();
    expect(row.querySelectorAll('.subtask-node').length).toBe(104);
  });

  test('主日志已有终态 → 以显式状态为准（success → 完成）', () => {
    document.body.innerHTML = '<div id="content"></div>';
    const contentDiv = document.getElementById('content');
    contentDiv.appendChild(makeRow(0, 'subtask-progress subtask-progress-active'));

    reconcileSubtaskRowStates(contentDiv, makeLog({ withMainLog: true, mainStatus: 'success' }), 1);

    const row = contentDiv.querySelector('[data-subtask-index="0"]');
    expect(row.dataset.terminal).toBe('1');
    expect(row.classList.contains('subtask-progress-done')).toBe(true);
    expect(row.querySelector('.subtask-status-done')).not.toBeNull();
  });

  test('节点成功率低于阈值 → 失败而非部分完成', () => {
    document.body.innerHTML = '<div id="content"></div>';
    const contentDiv = document.getElementById('content');
    const row = makeRow(0, 'subtask-progress subtask-progress-active');
    contentDiv.appendChild(row);

    const log = [planEntry];
    for (let k = 0; k < 2; k++) log.push(node(0, 'success'));
    for (let k = 0; k < 9; k++) log.push(node(0, 'failed'));

    reconcileSubtaskRowStates(contentDiv, log, 1);

    expect(row.dataset.terminal).toBe('1');
    expect(row.querySelector('.subtask-status-failed')).not.toBeNull();
    expect(row.querySelector('.subtask-status-partial')).toBeNull();
  });

  test('当前行跳过；仍有 processing 节点且主日志无终态的行不动', () => {
    document.body.innerHTML = '<div id="content"></div>';
    const contentDiv = document.getElementById('content');
    const currentRow = makeRow(1, 'subtask-progress subtask-progress-active');
    const runningRow = makeRow(2, 'subtask-progress subtask-progress-active');
    contentDiv.appendChild(currentRow);
    contentDiv.appendChild(runningRow);

    const log = [planEntry];
    for (let k = 0; k < 3; k++) log.push(node(1, 'success'));
    log.push(node(2, 'success'));
    log.push(node(2, 'processing'));

    reconcileSubtaskRowStates(contentDiv, log, 1);

    // 当前行由主渲染路径负责，对账不碰
    expect(currentRow.dataset.terminal).toBeUndefined();
    // 子任务 2 还有 processing 节点 → 真在跑，不改写
    expect(runningRow.dataset.terminal).toBeUndefined();
    expect(runningRow.classList.contains('subtask-progress-active')).toBe(true);
  });

  test('二次计划：上一轮节点不计入新一轮统计（按 logIndex 截断）', () => {
    document.body.innerHTML = '<div id="content"></div>';
    const contentDiv = document.getElementById('content');
    const row = makeRow(0, 'subtask-progress subtask-progress-active');
    contentDiv.appendChild(row);

    const replan = { ...planEntry, id: 'plan-2', timestamp: '2026-11-21T01:00:00.000Z', subtaskTotal: 1,
      items: [{ index: 0, id: 'n0', name: '新计划唯一子任务', description: 'nd' }] };
    const log = [
      planEntry,
      ...Array.from({ length: 50 }, () => node(0, 'success')), // 上一轮 50 个节点
      replan,
      node(0, 'success'), // 新一轮仅 1 个节点
    ];

    const plan = extractSubtaskPlan(log);
    expect(plan.logIndex).toBe(51);
    reconcileSubtaskRowStates(contentDiv, log.slice(plan.logIndex), 1, plan);

    expect(row.dataset.terminal).toBe('1');
    expect(row.textContent).toContain('1');
    expect(row.textContent).not.toContain('50');
  });

  test('已终态的行幂等：重复对账不重复改写', () => {
    document.body.innerHTML = '<div id="content"></div>';
    const contentDiv = document.getElementById('content');
    contentDiv.appendChild(makeRow(0, 'subtask-progress subtask-progress-active'));
    const log = makeLog();

    reconcileSubtaskRowStates(contentDiv, log, 1);
    const htmlAfterFirst = contentDiv.querySelector('[data-subtask-index="0"]').innerHTML;
    reconcileSubtaskRowStates(contentDiv, log, 1);
    expect(contentDiv.querySelector('[data-subtask-index="0"]').innerHTML).toBe(htmlAfterFirst);
  });
});
