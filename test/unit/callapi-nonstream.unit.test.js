// @vitest-environment jsdom
// 验证非流式模式下 callApi 的 executionLog 传递链（关闭流式输出后产物入口问题的核心）
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';

const noop = () => {};
let messageListeners = [];
let sentMessages = [];

// chrome 消息总线 mock
const sendMessageMock = (msg) => {
  sentMessages.push(msg);
  return Promise.resolve({});
};

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {
          reactConfig: {
            loopTimeout: 300000,
            maxIterations: 15,
            maxAgentIterations: 15,
            model: 'deepseek-v4-pro',
            enableReflection: true,
            streamEnabled: false, // 非流式模式
          },
          reflectionConfig: { enabled: false },
        };
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
    sendMessage: sendMessageMock,
    connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
    onMessage: {
      addListener: (fn) => messageListeners.push(fn),
      removeListener: (fn) => { messageListeners = messageListeners.filter((l) => l !== fn); },
    },
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

function makeAgentFileEntry() {
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
  };
}

// 触发后台消息到前端 listener
function dispatchMessage(msg) {
  for (const l of [...messageListeners]) {
    l(msg, {}, () => {});
  }
}

let chatManager;
let state;

beforeAll(async () => {
  chatManager = await import('../../src/side_panel/chat-manager.js');
  state = (await import('../../src/side_panel/state.js')).default;
});

beforeEach(() => {
  messageListeners = [];
  sentMessages = [];
  state.activeSessionId = 'test-session-nonstream';
});

describe('非流式模式下 callApi 的 executionLog 传递', () => {
  test('非流式模式（无 STREAM_START）API_COMPLETE 返回完整 executionLog', async () => {
    const callApiPromise = chatManager.callApi(
      [{ role: 'user', content: '写一个文件' }],
      'deepseek-v4-pro',
      true,
      {}
    );

    // 等待 CALL_API 发出
    await new Promise((r) => setTimeout(r, 20));
    const callApiMsg = sentMessages.find((m) => m.type === 'CALL_API');
    expect(callApiMsg).toBeTruthy();
    const callId = callApiMsg.callId;

    const agentFileEntry = makeAgentFileEntry();

    // 后台先推送增量执行日志
    dispatchMessage({
      type: 'EXECUTION_STATUS_UPDATE',
      callId,
      executionLog: [agentFileEntry],
      deltaLog: [agentFileEntry],
    });

    // 后台发送 API_COMPLETE（携带完整日志）
    dispatchMessage({
      type: 'API_COMPLETE',
      callId,
      content: '任务完成，已写入文件',
      executionLog: [agentFileEntry],
      reflectionScore: null,
      reasoningContent: '',
      wasRevised: false,
    });

    const result = await callApiPromise;
    expect(result.content).toBe('任务完成，已写入文件');
    expect(result.executionLog).toBeTruthy();
    expect(Array.isArray(result.executionLog)).toBe(true);
    expect(result.executionLog.length).toBe(1);
    expect(result.executionLog[0].action.name).toBe('agent_file');
    expect(result.executionLog[0].action.params.action).toBe('write');
  });

  test('非流式模式下即使没有 EXECUTION_STATUS_UPDATE，API_COMPLETE 也携带日志', async () => {
    const callApiPromise = chatManager.callApi(
      [{ role: 'user', content: 'hi' }],
      'deepseek-v4-pro',
      true,
      {}
    );
    await new Promise((r) => setTimeout(r, 20));
    const callApiMsg = sentMessages.find((m) => m.type === 'CALL_API');
    const callId = callApiMsg.callId;

    const agentFileEntry = makeAgentFileEntry();
    dispatchMessage({
      type: 'API_COMPLETE',
      callId,
      content: '完成',
      executionLog: [agentFileEntry],
    });

    const result = await callApiPromise;
    expect(result.executionLog.length).toBe(1);
    expect(result.executionLog[0].action.name).toBe('agent_file');
  });
});
