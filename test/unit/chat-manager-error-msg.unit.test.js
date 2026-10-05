// @vitest-environment jsdom
// 验证 API 错误消息 → 用户友好文案的映射：
// 浏览器 fetch 网络失败的标准文案各不相同（Chrome "Failed to fetch" / Safari "Load failed" /
// Firefox "NetworkError when attempting to fetch resource."），均须映射为统一的「网络错误」提示，
// 避免用户看到英文原文；超时错误映射为超时提示并携带原始信息；其余错误保持「请求失败」包装。
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

let mapApiErrorToUserMessage;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <textarea id="userInput"></textarea>
    <div id="messageList"></div>
  `;
  ({ mapApiErrorToUserMessage } = await import('../../src/side_panel/chat-manager.js'));
});

describe('API 错误消息 → 用户友好文案映射', () => {
  test('Chrome 网络错误 "Failed to fetch" 映射为网络错误提示', () => {
    expect(mapApiErrorToUserMessage('Failed to fetch')).toBe('网络错误，请检查网络连接后重试');
  });

  test('Safari 网络错误 "Load failed" 映射为网络错误提示', () => {
    expect(mapApiErrorToUserMessage('Load failed')).toBe('网络错误，请检查网络连接后重试');
  });

  test('Firefox "NetworkError when attempting to fetch resource." 映射为网络错误提示', () => {
    expect(mapApiErrorToUserMessage('NetworkError when attempting to fetch resource.')).toBe('网络错误，请检查网络连接后重试');
  });

  test('超时错误映射为超时提示且携带原始信息', () => {
    expect(mapApiErrorToUserMessage('请求超时 (300000ms)')).toBe('请求超时: 请求超时 (300000ms)');
  });

  test('非网络/超时错误保持"请求失败"包装（携带原始信息）', () => {
    expect(mapApiErrorToUserMessage('HTTP error! status: 400, message: bad request'))
      .toBe('请求失败: HTTP error! status: 400, message: bad request');
  });

  test('空消息回退为"未知错误"包装', () => {
    expect(mapApiErrorToUserMessage('')).toBe('请求失败: 未知错误');
    expect(mapApiErrorToUserMessage(undefined)).toBe('请求失败: 未知错误');
  });
});
