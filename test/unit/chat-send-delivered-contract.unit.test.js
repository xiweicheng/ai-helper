// @vitest-environment jsdom
// chat-send-delivered-contract.unit.test.js - 派发契约：谁算"已投递"
//
// 队列接力靠 sendMessage 的返回值区分两种失败：
//   - 未投递（empty / generating）：条目回队置顶，内容不会重复
//   - 已投递但失败（API 错误 / 用户取消 / SW 重启）：用户消息已落进会话历史，
//     再回队重发就会在会话里出现两条一模一样的消息 —— 必须结算为 failed 进归档
// 因此 delivered 字段是硬契约：
//   - 早退分支（根本没发出去）绝不能带它，否则派发方会把条目当"已投递"结算掉
//     ——用户排在队列里的任务会凭空消失
//   - 用户消息落地之后的所有失败路径必须带它
import { describe, test, expect, beforeEach, vi } from 'vitest';

const noop = () => {};

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        if (typeof cb === 'function') {
          cb(result);
          return;
        }
        return Promise.resolve(result);
      },
      set: noop
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() }
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: (msg, cb) => {
      if (typeof cb === 'function') cb({});
      return Promise.resolve({});
    },
    connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
    onMessage: { addListener: noop, removeListener: noop },
    getContexts: noop
  },
  tabs: {
    query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
    remove: noop, reload: noop, goBack: noop, goForward: noop,
    captureVisibleTab: noop, onUpdated: { addListener: noop }, onActivated: { addListener: noop }
  },
  scripting: { executeScript: noop },
  bookmarks: { getTree: noop, search: noop },
  history: { search: noop },
  cookies: { get: noop, getAll: noop, set: noop, remove: noop },
  downloads: { download: noop },
  notifications: { create: noop },
  offscreen: { createDocument: noop, hasDocument: noop }
};

let state;
let cm;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <textarea id="userInput"></textarea>
    <div id="messageList"></div>
    <div id="chatContainer"></div>
  `;
  state = (await import('../../src/side_panel/state.js')).default;
  cm = await import('../../src/side_panel/chat-manager.js');
  // 发送链路会 await 历史加载信号；失败也 resolve，不会阻塞
  await cm.loadChatHistory().catch(() => {});
  state.activeSessionId = 's1';
  state.generatingSessionIds.clear();
});

describe('sendMessage 的 delivered 契约', () => {
  test('生成中早退：不带 delivered（派发方据此回队，条目不能消失）', async () => {
    state.generatingSessionIds.add('s2');

    const res = await cm.sendMessage({ text: '排队任务', sessionId: 's2', fromQueue: true });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe('generating');
    expect(res.delivered).toBeUndefined();
  });

  test('空文本早退：不带 delivered', async () => {
    const res = await cm.sendMessage({ text: '   ', sessionId: 's2', fromQueue: true });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe('empty');
    expect(res.delivered).toBeUndefined();
  });
});