// @vitest-environment jsdom
// AI 回答「全屏阅读」下的划词作用域回归测试。
//
// 原始缺陷：全屏阅读把消息真实节点从 #chatContainer 迁到覆盖层 body
// （message-fullscreen.js 的节点迁移方案），而划词的三处判定都写死在 #chatContainer 上
// （mouseup 委托容器、选区归属判断、菜单浮层父节点），导致全屏里选中文本既不弹菜单，
// 弹出的菜单也被覆盖层遮住。这里用真实迁移后的 DOM 断言作用域判定，并对 index.js 的
// 接线与样式层级做源码守卫（沿用仓库对 side_panel/index.js 的守卫写法）。
import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const noop = () => {};
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => { if (typeof cb === 'function') cb({}); else return Promise.resolve({}); },
      set: noop,
    },
    onChanged: { addListener: noop },
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    sendMessage: () => Promise.resolve({}),
    onMessage: { addListener: noop, removeListener: noop },
  },
};

const { isInSelectionScope, SELECTION_HOST_SELECTOR } = await import(
  '../../src/side_panel/selection-scope.js'
);
const fullscreen = await import('../../src/side_panel/message-fullscreen.js');

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

function buildPanel() {
  document.body.innerHTML = `
    <div class="chat-container" id="chatContainer">
      <div class="message assistant" id="msgA">
        <div class="message-content"><div class="markdown-body" id="answerA">回答内容片段</div></div>
      </div>
    </div>
    <textarea id="userInput"></textarea>
    <div id="messageFullscreenOverlay" class="message-fullscreen-overlay" style="display:none">
      <div class="message-fullscreen-header"><button id="messageFullscreenCloseBtn"></button></div>
      <div class="message-fullscreen-body" id="messageFullscreenBody"></div>
      <div class="message-fullscreen-rail" id="messageFullscreenRail"></div>
    </div>`;
}

let textTarget;

beforeAll(() => {
  fullscreen.initMessageFullscreen();
});

beforeEach(() => {
  buildPanel();
  textTarget = document.querySelector('#answerA');
});

afterEach(() => {
  if (fullscreen.isFullscreenActive()) fullscreen.closeMessageFullscreen();
  document.body.innerHTML = '';
});

describe('划词作用域判定覆盖聊天区与全屏覆盖层', () => {
  test('基线：普通聊天区内选区在作用域内', () => {
    expect(isInSelectionScope(textTarget)).toBe(true);
    expect(isInSelectionScope(textTarget.firstChild)).toBe(true);
  });

  test('全屏迁移后旧口径（#chatContainer.contains）确实失效——这正是缺陷根因', () => {
    fullscreen.openMessageFullscreen(document.getElementById('msgA'));
    const container = document.getElementById('chatContainer');
    const migrated = document.querySelector('#messageFullscreenBody #answerA');
    expect(container.contains(migrated)).toBe(false);
  });

  test('全屏阅读中选中的文本节点仍在作用域内（元素与文本节点两种入参）', () => {
    fullscreen.openMessageFullscreen(document.getElementById('msgA'));
    const migrated = document.querySelector('#messageFullscreenBody #answerA');
    expect(isInSelectionScope(migrated)).toBe(true);
    expect(isInSelectionScope(migrated.firstChild)).toBe(true);
  });

  test('作用域外（输入框、空节点、覆盖层外壳）不误判为可划词区域', () => {
    expect(isInSelectionScope(document.getElementById('userInput'))).toBe(false);
    expect(isInSelectionScope(null)).toBe(false);
    expect(isInSelectionScope(document.getElementById('messageFullscreenOverlay'))).toBe(false);
  });

  test('作用域选择器与 markdown-render 的 Ctrl+单击口径保持一致', () => {
    expect(SELECTION_HOST_SELECTOR).toBe('#chatContainer, .message-fullscreen-body');
    expect(read('src/side_panel/markdown-render.js')).toContain("'#chatContainer, .message-fullscreen-body'");
  });
});

describe('划词链路的接线守卫（全屏失效的三层成因都要被堵住）', () => {
  const indexSrc = () => read('src/side_panel/index.js');

  test('mousedown/mouseup 绑在 document 上并按作用域收口，不再绑死 #chatContainer', () => {
    const src = indexSrc();
    expect(src).toContain("import { isInSelectionScope } from './selection-scope.js';");
    expect(src).toContain("document.addEventListener('mousedown', (e) => {\n    if (!isInSelectionScope(e.target)) return;");
    expect(src).toContain("document.addEventListener('mouseup', (e) => {\n    if (!isInSelectionScope(e.target)) return;");
    expect(src).toContain('isInSelectionScope(selection.anchorNode)');
    expect(src).not.toContain("chatContainerEl.addEventListener('mouseup'");
    expect(src).not.toContain('chatContainerEl.contains(selection.anchorNode)');
  });

  test('菜单浮层是挂在 body 上的单例，不再声明在 #chatContainer 内', () => {
    expect(indexSrc()).toContain('document.body.appendChild(selectionMenuEl);');
    expect(indexSrc()).toContain("if (selectionMenuEl && selectionMenuEl.isConnected) return selectionMenuEl;");
    expect(read('side_panel.html')).not.toContain('id="selectionFloatingMenu"');
  });

  test('菜单与浮层解答的层级高于全屏覆盖层，否则全屏里弹出也看不见', () => {
    const css = read('src/side_panel/styles.css');
    const zOf = (selector) => {
      const block = css.slice(css.indexOf(selector + ' {'));
      return Number(block.slice(0, block.indexOf('}')).match(/z-index:\s*(\d+)/)[1]);
    };
    const overlayZ = zOf('.message-fullscreen-overlay');
    expect(css.slice(css.indexOf('.selection-floating-menu {'), css.indexOf('.selection-floating-menu {') + 400))
      .toContain('position: fixed');
    expect(zOf('.selection-floating-menu')).toBeGreaterThan(overlayZ);
    expect(zOf('.selection-answer-popup')).toBeGreaterThan(overlayZ);
  });

  test('全屏内点菜单项发送前先退出全屏（对话流在覆盖层之下）', () => {
    const src = indexSrc();
    expect(src).toContain('isFullscreenActive, closeMessageFullscreen');
    const handler = src.slice(src.indexOf('async function handleSelectionPromptClick'));
    const body = handler.slice(0, handler.indexOf('\n}\n'));
    // 顺序契约：生成中早退 → 退出全屏 → 压缩与发送（不能把用户挡在生成提示里却已退出全屏）
    expect(body).toContain('if (isFullscreenActive()) {');
    expect(body.indexOf('if (state.isGenerating)')).toBeLessThan(body.indexOf('if (isFullscreenActive())'));
    expect(body.indexOf('if (isFullscreenActive())')).toBeLessThan(body.indexOf('runAutoCompactionBeforeSend'));
  });
});
