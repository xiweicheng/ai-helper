// @vitest-environment jsdom
// clarify-routing.unit.test.js - 澄清消息定向路由回归测试
//
// 回归背景：多 Tab 各开一个 Side Panel（标签页绑定模式）时，任一实例触发
// 需求澄清后，SHOW_CLARIFY_DIALOG 通过 chrome.runtime.sendMessage 广播到
// 所有 Side Panel 实例，导致其他 Tab 的侧边栏也弹出澄清弹框。
//
// 修复后的约定：
// - 澄清消息（SHOW_CLARIFY_DIALOG / CLARIFY_TIMEOUT）优先通过发起实例的
//   keepalive 长连接（sessionId → Port）点对点发送，只有发起实例弹框；
// - port 不存在（定时任务发起、实例已关闭/刷新）或 postMessage 失败时，
//   回退 chrome.runtime.sendMessage 广播兜底（保持原行为）。
import { describe, test, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';

const noop = () => {};
let messageListeners = [];
let sentMessages = [];

const sendMessageMock = (msg, cb) => {
  sentMessages.push(msg);
  if (typeof cb === 'function') cb({});
  return Promise.resolve({});
};

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
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
    // 返回非空面板列表：避免 executeClarifyQuestion 的 sidePanelCheck 提前终止等待
    getContexts: () => Promise.resolve([{ contextType: 'SIDE_PANEL' }]),
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

let executeClarifyQuestion;
let bgState;

beforeAll(async () => {
  const te = await import('../../src/background/tool-executor.js');
  executeClarifyQuestion = te.executeClarifyQuestion;
  bgState = await import('../../src/background/state.js');
});

beforeEach(() => {
  vi.useFakeTimers();
  messageListeners = [];
  sentMessages = [];
});

afterEach(() => {
  vi.useRealTimers();
});

function makePort() {
  return {
    postMessage: vi.fn(),
    onDisconnect: { addListener: noop },
  };
}

/** 推进到澄清超时（默认 300000ms），确保被测 Promise 收敛、定时器清理 */
async function drainToTimeout() {
  await vi.advanceTimersByTimeAsync(300000 + 1000);
}

describe('keepalive port 注册表（定向路由基础设施）', () => {
  test('register → get/has 返回注册的 port；unregister 后失效', () => {
    const port = makePort();
    bgState.registerKeepalivePort('reg-sess', port);
    expect(bgState.getKeepalivePort('reg-sess')).toBe(port);
    expect(bgState.hasKeepalivePort('reg-sess')).toBe(true);

    bgState.unregisterKeepalivePort('reg-sess');
    expect(bgState.getKeepalivePort('reg-sess')).toBeNull();
    expect(bgState.hasKeepalivePort('reg-sess')).toBe(false);
  });

  test('空 sessionId / 空 port 安全返回，不抛错', () => {
    expect(bgState.getKeepalivePort(null)).toBeNull();
    expect(bgState.hasKeepalivePort(undefined)).toBe(false);
    bgState.registerKeepalivePort(null, makePort());
    bgState.registerKeepalivePort('reg-empty', null);
    expect(bgState.getKeepalivePort('reg-empty')).toBeNull();
    bgState.unregisterKeepalivePort(null);
  });
});

describe('澄清消息定向路由（多 Tab 侧边栏防串台）', () => {
  test('已注册发起实例 port：SHOW_CLARIFY_DIALOG 只走 port 点对点，不广播', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('sess-port', port);

    const p = executeClarifyQuestion({ question: '要不要发布？', options: ['发布', '跳过'] }, 'tc-port', 'sess-port');
    await vi.advanceTimersByTimeAsync(0);

    // 只通过 port 发送，且内容为澄清请求
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    const sent = port.postMessage.mock.calls[0][0];
    expect(sent.type).toBe('SHOW_CLARIFY_DIALOG');
    expect(sent.sessionId).toBe('sess-port');
    expect(sent.data.question).toBe('要不要发布？');
    // 广播通道不应出现澄清消息（这正是串台的根因路径）
    expect(sentMessages.some((m) => m.type === 'SHOW_CLARIFY_DIALOG')).toBe(false);

    // 超时通知同样走 port 定向（不打扰其他实例）
    await drainToTimeout();
    const result = await p;
    expect(result.success).toBe(false);
    expect(port.postMessage.mock.calls.some((c) => c[0].type === 'CLARIFY_TIMEOUT')).toBe(true);

    bgState.unregisterKeepalivePort('sess-port');
  });

  test('无 port（如定时任务发起）：回退广播兜底', async () => {
    const p = executeClarifyQuestion({ question: 'q?', options: ['a'] }, 'tc-bg', 'sess-bg');
    await vi.advanceTimersByTimeAsync(0);

    expect(sentMessages.some((m) => m.type === 'SHOW_CLARIFY_DIALOG' && m.sessionId === 'sess-bg')).toBe(true);

    await drainToTimeout();
    await p;
  });

  test('port 已失效（postMessage 抛错）：回退广播兜底', async () => {
    const port = makePort();
    port.postMessage.mockImplementation(() => { throw new Error('Attempting to use a disconnected port object'); });
    bgState.registerKeepalivePort('sess-dead', port);

    const p = executeClarifyQuestion({ question: 'q?', options: ['a'] }, 'tc-dead', 'sess-dead');
    await vi.advanceTimersByTimeAsync(0);

    expect(sentMessages.some((m) => m.type === 'SHOW_CLARIFY_DIALOG' && m.sessionId === 'sess-dead')).toBe(true);

    await drainToTimeout();
    await p;
    bgState.unregisterKeepalivePort('sess-dead');
  });

  test('定向发送后，用户响应（广播回程）按 toolCallId 正常 resolve', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('sess-resp', port);

    const p = executeClarifyQuestion({ question: 'q?', options: ['选项甲', '选项乙'] }, 'tc-resp', 'sess-resp');
    await vi.advanceTimersByTimeAsync(0);
    expect(port.postMessage).toHaveBeenCalledTimes(1);

    // 模拟发起实例提交澄清响应（响应回程仍为 runtime.sendMessage 广播，
    // background 按 toolCallId 匹配，天然不会串台）
    for (const l of [...messageListeners]) {
      l({ type: 'CLARIFY_RESPONSE', toolCallId: 'tc-resp', selectedOption: 1, customInput: '', additionalInfo: '' }, {}, noop);
    }

    const result = await p;
    expect(result.success).toBe(true);
    expect(result.content).toContain('选项乙');

    bgState.unregisterKeepalivePort('sess-resp');
  });
});
