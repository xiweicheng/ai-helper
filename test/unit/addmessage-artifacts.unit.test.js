// @vitest-environment jsdom
// 验证 addMessage 在传入含 agent_file 的 executionLog 时创建产物按钮
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';

const noop = () => {};

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = { reactConfig: { streamEnabled: false }, reflectionConfig: { enabled: false } };
        if (typeof cb === 'function') cb(result);
        else return Promise.resolve(result);
      },
      set: noop,
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: (m) => Promise.resolve({}),
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
};

let chatManager;
let state;

beforeAll(async () => {
  chatManager = await import('../../src/side_panel/chat-manager.js');
  state = (await import('../../src/side_panel/state.js')).default;
});

beforeEach(() => {
  document.body.innerHTML = `
    <div id="chatContainer" style="height: 500px; overflow-y: auto;"></div>
    <textarea id="userInput"></textarea>
  `;
  state.activeSessionId = 'test-session-artifacts';
});

function makeAgentFileEntry(overrides = {}) {
  return {
    id: 'log_tool_1',
    iteration: 1,
    timestamp: new Date().toISOString(),
    status: 'success',
    nodeType: 'tool_exec',
    nodeName: '工具执行: agent_file',
    action: {
      name: 'agent_file',
      params: { action: 'write', path: '/workspace/output/report.md', content: '# report' },
    },
    observation: JSON.stringify({ path: '/workspace/output/report.md', size: 42 }),
    duration: 50,
    ...overrides,
  };
}

describe('addMessage 非流式消息产物按钮', () => {
  test('传入含 agent_file 的 executionLog 时创建产物按钮', () => {
    const log = [makeAgentFileEntry()];
    const { element } = chatManager.addMessage('assistant', '任务完成', true, log);
    const btn = element.querySelector('.artifacts-btn');
    expect(btn).toBeTruthy();
  });

  test('空 executionLog 时不创建产物按钮', () => {
    const { element } = chatManager.addMessage('assistant', '任务完成', true, []);
    const btn = element.querySelector('.artifacts-btn');
    expect(btn).toBeNull();
  });

  test('日志含多个文件时按钮计数正确', () => {
    const log = [
      makeAgentFileEntry(),
      makeAgentFileEntry({
        id: 'log_tool_2',
        action: { name: 'agent_file', params: { action: 'write', path: '/workspace/output/data.csv' } },
        observation: JSON.stringify({ path: '/workspace/output/data.csv', size: 100 }),
      }),
    ];
    const { element } = chatManager.addMessage('assistant', '完成', true, log);
    const btn = element.querySelector('.artifacts-btn');
    expect(btn).toBeTruthy();
    expect(element.querySelector('.artifacts-btn-count').textContent).toBe('2');
  });
});
