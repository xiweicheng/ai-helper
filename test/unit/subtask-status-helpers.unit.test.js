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

beforeAll(async () => {
  document.body.innerHTML = '<div id="messageList"></div>';
  ({ shouldSendSubtaskStatusUpdate } = await import('../../src/background/react-loop.js'));
  ({ resolveRunningNodeLabel } = await import('../../src/side_panel/chat-manager.js'));
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
