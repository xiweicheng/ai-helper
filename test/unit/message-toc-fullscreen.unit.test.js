// @vitest-environment jsdom
// 全屏模式下目录导航的挂载路由：
// - 全屏中的消息 hover 时，目录容器应挂到覆盖层内的 .message-fullscreen-rail（覆盖层盖住 side-rail，
//   挂 side-rail 会被遮挡而"消失"）；
// - 普通列表中的消息仍挂到入口轨道的 toc 槽位（保持既有行为）。
import { describe, test, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

const noop = () => {};

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
};

let toc;
let getSideRailSlot;

beforeAll(async () => {
  toc = await import('../../src/side_panel/message-toc.js');
  ({ getSideRailSlot } = await import('../../src/side_panel/side-rail.js'));
});

function buildPanel() {
  document.body.innerHTML = `
    <div class="chat-container" id="chatContainer">
      <div class="message assistant" id="msgA" data-message-id="a1">
        <div class="message-content"><div class="final-answer"><div class="markdown-body">
          <h2 id="h1">第一章</h2>
          <h3 id="h2">小节 1.1</h3>
        </div></div></div>
      </div>
    </div>
    <div id="messageFullscreenOverlay" class="message-fullscreen-overlay" style="display:none">
      <div class="message-fullscreen-header">
        <span id="messageFullscreenTitle">全屏阅读</span>
        <button id="messageFullscreenCloseBtn"></button>
      </div>
      <div class="message-fullscreen-body" id="messageFullscreenBody"></div>
      <div class="message-fullscreen-rail" id="messageFullscreenRail"></div>
    </div>`;
}

beforeEach(() => {
  buildPanel();
  toc.hideMessageToc();
});

afterEach(() => {
  toc.hideMessageToc();
});

describe('showMessageToc 挂载路由', () => {
  test('消息在全屏覆盖层内时，目录挂到覆盖层内的 rail', () => {
    const overlay = document.getElementById('messageFullscreenOverlay');
    const body = document.getElementById('messageFullscreenBody');
    const rail = document.getElementById('messageFullscreenRail');
    const msg = document.getElementById('msgA');
    // 模拟全屏：把消息移入覆盖层 body
    body.appendChild(msg);

    const headings = msg.querySelectorAll('.markdown-body h2, .markdown-body h3');
    toc.showMessageToc(msg, headings);

    const container = document.querySelector('.message-toc-container');
    expect(container).toBeTruthy();
    expect(rail.contains(container)).toBe(true);
    // 不应挂到入口轨道（side-rail 会缓存节点，直接取槽位引用判断）
    expect(getSideRailSlot('toc').contains(container)).toBe(false);
    expect(overlay).toBeTruthy();
  });

  test('消息在普通列表时，目录仍挂到入口轨道 toc 槽位', () => {
    const msg = document.getElementById('msgA');
    const headings = msg.querySelectorAll('.markdown-body h2, .markdown-body h3');
    toc.showMessageToc(msg, headings);

    const slot = getSideRailSlot('toc');
    const container = slot.querySelector('.message-toc-container');
    expect(container).toBeTruthy();
    const rail = document.getElementById('messageFullscreenRail');
    expect(rail.contains(container)).toBe(false);
  });
});
