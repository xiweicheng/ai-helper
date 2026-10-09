// @vitest-environment jsdom
// insertPromptToInputByCode 签名扩展：skipTriggerStrip 保留输入框全文（菜单面板 Ctrl+点击场景）
import { describe, test, expect, beforeEach, beforeAll } from 'vitest';

const noop = () => {};

globalThis.chrome = {
  storage: {
    local: { get: (k, cb) => { if (typeof cb === 'function') cb({}); else return Promise.resolve({}); }, set: noop },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: () => Promise.resolve({}),
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

let pm;
let state;

beforeAll(async () => {
  pm = await import('../../src/side_panel/prompt-manager.js');
  state = (await import('../../src/side_panel/state.js')).default;
});

beforeEach(() => {
  document.body.innerHTML = `
    <textarea id="userInput"></textarea>
    <div id="promptSelector" style="display: block;">
      <div class="prompt-dropdown show" id="promptDropdown"></div>
    </div>`;
  state.customPrompts = [{ code: 'p1', content: '发送内容' }];
});

describe('insertPromptToInputByCode 签名扩展', () => {
  test('skipTriggerStrip:true 时输入框含 "/" 的正文全文保留并追加提示词', () => {
    const input = document.getElementById('userInput');
    input.value = '看 https://a.com/b 这个';
    pm.insertPromptToInputByCode('p1', { skipTriggerStrip: true });
    expect(input.value).toBe('看 https://a.com/b 这个\n\n发送内容');
  });

  test('默认路径回归：仍按最后一个 "/" 截断', () => {
    const input = document.getElementById('userInput');
    input.value = '前缀/过滤词';
    pm.insertPromptToInputByCode('p1');
    expect(input.value).toBe('前缀\n\n发送内容');
  });
});
