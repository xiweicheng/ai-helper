// @vitest-environment jsdom
// confirm-routing.unit.test.js - 工具确认弹框定向路由回归测试
//
// 回归背景：与澄清弹框同源的串台问题——多 Tab 各开一个 Side Panel 时，
// 任一实例触发敏感工具确认后，SHOW_CONFIRM_DIALOG 通过 chrome.runtime.sendMessage
// 广播到所有 Side Panel 实例，导致其他 Tab 的侧边栏也弹出确认弹框。
//
// 修复后的约定：与澄清一致——优先通过发起实例的 keepalive 长连接点对点发送；
// port 不存在（定时任务发起、实例已关闭/刷新）或 postMessage 失败时回退广播兜底。
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

let requestToolConfirmation;
let bgState;

beforeAll(async () => {
  const rl = await import('../../src/background/react-loop.js');
  requestToolConfirmation = rl.requestToolConfirmation;
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

/** 推进到确认超时（默认 300000ms），确保被测 Promise 收敛、监听器清理 */
async function drainToTimeout() {
  await vi.advanceTimersByTimeAsync(300000 + 1000);
}

describe('工具确认弹框定向路由（多 Tab 侧边栏防串台）', () => {
  test('已注册发起实例 port：SHOW_CONFIRM_DIALOG 只走 port 点对点，不广播', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('cs-port', port);

    const p = requestToolConfirmation('debug_page', { action: 'attach' }, 1, 'cs-port');
    await vi.advanceTimersByTimeAsync(0);

    expect(port.postMessage).toHaveBeenCalledTimes(1);
    const sent = port.postMessage.mock.calls[0][0];
    expect(sent.type).toBe('SHOW_CONFIRM_DIALOG');
    expect(sent.data.sessionId).toBe('cs-port');
    expect(sent.data.toolName).toBe('debug_page');
    expect(sent.data.toolCallId).toBe('debug_page');
    // 广播通道不应出现确认消息（这正是串台的根因路径）
    expect(sentMessages.some((m) => m.type === 'SHOW_CONFIRM_DIALOG')).toBe(false);

    // 收敛：确认超时默认拒绝
    await drainToTimeout();
    const result = await p;
    expect(result).toBe(false);

    bgState.unregisterKeepalivePort('cs-port', port);
  });

  test('无 port（如定时任务发起）：回退广播兜底', async () => {
    const p = requestToolConfirmation('debug_page', { action: 'attach' }, 1, 'cs-bg');
    await vi.advanceTimersByTimeAsync(0);

    expect(sentMessages.some((m) => m.type === 'SHOW_CONFIRM_DIALOG' && m.data?.sessionId === 'cs-bg')).toBe(true);

    await drainToTimeout();
    await p;
  });

  test('port 已失效（postMessage 抛错）：回退广播兜底', async () => {
    const port = makePort();
    port.postMessage.mockImplementation(() => { throw new Error('Attempting to use a disconnected port object'); });
    bgState.registerKeepalivePort('cs-dead', port);

    const p = requestToolConfirmation('debug_page', { action: 'attach' }, 1, 'cs-dead');
    await vi.advanceTimersByTimeAsync(0);

    expect(sentMessages.some((m) => m.type === 'SHOW_CONFIRM_DIALOG' && m.data?.sessionId === 'cs-dead')).toBe(true);

    await drainToTimeout();
    await p;
    bgState.unregisterKeepalivePort('cs-dead', port);
  });

  test('定向发送后，用户确认（广播回程）按 toolCallId 正常 resolve', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('cs-resp', port);

    const p = requestToolConfirmation('debug_page', { action: 'attach' }, 1, 'cs-resp');
    await vi.advanceTimersByTimeAsync(0);
    expect(port.postMessage).toHaveBeenCalledTimes(1);

    // 模拟发起实例提交确认结果（响应回程仍为 runtime.sendMessage 广播）
    for (const l of [...messageListeners]) {
      l({ type: 'TOOL_CONFIRMATION_RESPONSE', toolCallId: 'debug_page', confirmed: true, scope: 'single', sessionId: 'cs-resp' }, {}, noop);
    }

    const result = await p;
    expect(result).toBe(true);

    bgState.unregisterKeepalivePort('cs-resp', port);
  });
});

describe('keepalive port 注册表：断开清理防误删', () => {
  test('旧 port 的 disconnect 不删除已被新 port 覆盖的注册', () => {
    const oldPort = makePort();
    const newPort = makePort();
    bgState.registerKeepalivePort('swap-sess', oldPort);
    bgState.registerKeepalivePort('swap-sess', newPort); // 同会话新连接覆盖

    bgState.unregisterKeepalivePort('swap-sess', oldPort); // 旧连接的 onDisconnect 迟到
    expect(bgState.getKeepalivePort('swap-sess')).toBe(newPort); // 新连接不受影响

    bgState.unregisterKeepalivePort('swap-sess', newPort);
    expect(bgState.getKeepalivePort('swap-sess')).toBeNull();
  });

  test('不传 port 的 unregister 保持原有语义（直接删除）', () => {
    const port = makePort();
    bgState.registerKeepalivePort('legacy-sess', port);
    bgState.unregisterKeepalivePort('legacy-sess');
    expect(bgState.getKeepalivePort('legacy-sess')).toBeNull();
  });
});
