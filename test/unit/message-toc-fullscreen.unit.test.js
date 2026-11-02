// @vitest-environment jsdom
// 全屏模式下目录导航的挂载路由：
// - 全屏中的消息 hover 时，目录容器应挂到覆盖层内的 .message-fullscreen-rail（覆盖层盖住 side-rail，
//   挂 side-rail 会被遮挡而"消失"）；
// - 工作目录预览全屏时挂覆盖层内的 .workspace-preview-rail（同理由）；
// - 普通列表与工作目录浮窗预览仍挂到入口轨道的 toc 槽位（保持既有行为）。
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
    </div>
    <div class="workspace-preview-overlay" id="workspacePreviewArea">
      <div class="workspace-preview-content" id="workspacePreviewContent">
        <div class="markdown-body workspace-preview-markdown" id="wsMd">
          <h2 id="wh1">工作目录篇</h2>
          <h3 id="wh2">小节 W.1</h3>
        </div>
      </div>
      <div class="workspace-preview-rail" id="workspacePreviewRail"></div>
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

  test('工作目录预览全屏时，目录挂到预览覆盖层内的 rail', () => {
    const previewArea = document.getElementById('workspacePreviewArea');
    const rail = document.getElementById('workspacePreviewRail');
    const md = document.getElementById('wsMd');
    previewArea.classList.add('fullscreen');

    const headings = md.querySelectorAll('.markdown-body h2, .markdown-body h3');
    toc.showMessageToc(md, headings);

    const container = document.querySelector('.message-toc-container');
    expect(container).toBeTruthy();
    expect(rail.contains(container)).toBe(true);
    expect(getSideRailSlot('toc').contains(container)).toBe(false);
  });

  test('工作目录浮窗预览（非全屏）时，目录挂入口轨道 toc 槽位', () => {
    const md = document.getElementById('wsMd');

    const headings = md.querySelectorAll('.markdown-body h2, .markdown-body h3');
    toc.showMessageToc(md, headings);

    const slot = getSideRailSlot('toc');
    expect(slot.querySelector('.message-toc-container')).toBeTruthy();
    const rail = document.getElementById('workspacePreviewRail');
    expect(rail.contains(slot.querySelector('.message-toc-container'))).toBe(false);
  });
});

describe('目录面板锁定与关闭', () => {
  // 普通消息/浮窗预览的目录挂在 side-rail 的 toc 槽；buildPanel 重置 body 会使缓存
  // 轨道游离于 document 之外，故统一通过槽位引用定位容器，不用 document.querySelector
  const containerOf = () =>
    getSideRailSlot('toc').querySelector('.message-toc-container')
    || document.querySelector('.message-toc-container');

  // 防御性复位：确保用例之间不残留锁定态
  afterEach(() => {
    const lockedBtn = document.querySelector('.message-toc-lock.locked') || getSideRailSlot('toc').querySelector('.message-toc-lock.locked');
    if (lockedBtn) lockedBtn.click();
    toc.hideMessageToc();
    vi.useRealTimers();
  });

  function openTocOnMessage() {
    const msg = document.getElementById('msgA');
    const headings = msg.querySelectorAll('.markdown-body h2, .markdown-body h3');
    toc.showMessageToc(msg, headings);
    return msg;
  }

  test('目录 header 渲染出锁定与关闭按钮，默认未锁定', () => {
    openTocOnMessage();
    const container = containerOf();
    expect(container).toBeTruthy();
    expect(container.querySelector('.message-toc-lock')).toBeTruthy();
    expect(container.querySelector('.message-toc-close')).toBeTruthy();
    expect(container.querySelector('.message-toc-lock').classList.contains('locked')).toBe(false);
    expect(container.querySelector('.message-toc-panel').classList.contains('expanded')).toBe(false);
  });

  test('锁定后目录常驻展开，鼠标移出消息区不自动收起', () => {
    vi.useFakeTimers();
    const msg = openTocOnMessage();
    containerOf().querySelector('.message-toc-lock').click();

    const panel = containerOf().querySelector('.message-toc-panel');
    expect(panel.classList.contains('expanded')).toBe(true);
    expect(panel.classList.contains('locked')).toBe(true);

    // 鼠标移到消息区之外
    toc.handleMouseOut({ target: msg, relatedTarget: document.body });
    vi.advanceTimersByTime(2000);

    expect(containerOf()).toBeTruthy();
  });

  test('未锁定时鼠标移出消息区目录会延时自动收起', () => {
    vi.useFakeTimers();
    const msg = openTocOnMessage();
    expect(containerOf()).toBeTruthy();

    toc.handleMouseOut({ target: msg, relatedTarget: document.body });
    vi.advanceTimersByTime(2000);

    expect(containerOf()).toBeFalsy();
  });

  test('点关闭叉：锁定态下收起目录并自动解锁', () => {
    openTocOnMessage();
    containerOf().querySelector('.message-toc-lock').click();
    containerOf().querySelector('.message-toc-close').click();

    expect(containerOf()).toBeFalsy();

    // 再次生成：已恢复未锁定，不再自动展开
    openTocOnMessage();
    const panel = containerOf().querySelector('.message-toc-panel');
    expect(panel.classList.contains('locked')).toBe(false);
    expect(panel.classList.contains('expanded')).toBe(false);
  });

  test('锁定态跨场景保持：切到工作目录预览重建后目录依旧展开', () => {
    openTocOnMessage();
    containerOf().querySelector('.message-toc-lock').click();
    toc.hideMessageToc();

    const md = document.getElementById('wsMd');
    const wsHeadings = md.querySelectorAll('.markdown-body h2, .markdown-body h3');
    toc.showMessageToc(md, wsHeadings);

    const panel = containerOf().querySelector('.message-toc-panel');
    expect(panel.classList.contains('expanded')).toBe(true);
    expect(panel.classList.contains('locked')).toBe(true);
  });
});
