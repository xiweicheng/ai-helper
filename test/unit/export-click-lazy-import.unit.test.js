// @vitest-environment jsdom
// PERF-05 回归守卫：导出按钮的 click 回调改 async（按需 import）后，
// 事件对象在 await 之后已不可用，按钮元素必须在 await 前捕获。
// 本文件用真 chat-manager.js 的处理器驱动，只把 chat-export.js 换成间谍桩。
import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
    onMessage: { addListener: noop, removeListener: noop },
  },
  tabs: {
    query: noop,
    sendMessage: noop,
    onActivated: { addListener: noop },
    onUpdated: { addListener: noop },
  },
  scripting: { executeScript: noop },
};

/** 按大括号配对截出 `addEventListener('click', async (e) => { ... })` 的回调体 */
function extractAsyncClickHandlers(file, src) {
  const marker = "addEventListener('click', async (e) => {";
  const out = [];
  for (let i = src.indexOf(marker); i !== -1; i = src.indexOf(marker, i + 1)) {
    let depth = 0;
    let j = i + marker.length - 1;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) break; }
    }
    const body = src.slice(i + marker.length - 1, j + 1);
    out.push({ file, body, snippet: body.slice(0, 80).replace(/\s+/g, ' ') });
  }
  return out;
}

const exportSpies = {
  exportAssistantMessageToDocx: vi.fn(),
  exportAssistantMessageToPdf: vi.fn(),
  exportAssistantMessageToMarkdown: vi.fn(),
  exportAssistantMessageToImage: vi.fn(),
};

vi.mock('../../src/side_panel/chat-export.js', () => exportSpies);

const SRC = {
  CHAT_MANAGER: readFileSync(resolve(__dirname, '../../src/side_panel/chat-manager.js'), 'utf-8'),
  CHAT_STREAMING: readFileSync(resolve(__dirname, '../../src/side_panel/chat-streaming.js'), 'utf-8'),
};

let chatManager;

beforeAll(async () => {
  chatManager = await import('../../src/side_panel/chat-manager.js');
});

beforeEach(() => {
  document.body.innerHTML = '<div id="chatContainer"></div><textarea id="userInput"></textarea>';
  Object.values(exportSpies).forEach((spy) => spy.mockClear());
});

/** 复刻面板里一条助手消息的导出菜单结构 */
function mountMessageWithExportMenu() {
  const container = document.getElementById('chatContainer');
  container.innerHTML = `
    <div class="message assistant">
      <div class="message-content"><div class="markdown-body">正文</div></div>
      <div class="message-footer">
        <div class="export-menu-container">
          <button class="export-trigger-btn" type="button">导出</button>
          <div class="export-dropdown">
            <button class="export-dropdown-item export-docx-item" type="button"><span>Word</span></button>
            <button class="export-dropdown-item export-pdf-item" type="button"><span>PDF</span></button>
            <button class="export-dropdown-item export-md-item" type="button"><span>Markdown</span></button>
            <button class="export-dropdown-item export-image-item" type="button"><span>图片</span></button>
          </div>
        </div>
      </div>
    </div>`;
  return container;
}

async function clickAndWait(selector) {
  const btn = document.querySelector(selector);
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  // 等按需 import 的微任务与后续调用落地
  await new Promise((r) => setTimeout(r, 0));
  await Promise.resolve();
  return btn;
}

describe('契约：await 之后 event.currentTarget 会被复位为 null', () => {
  test('这正是"回调转 async 后仍用 e.currentTarget"会崩的原因', async () => {
    let afterAwait = 'not-called';
    let capturedBefore = 'not-called';
    const el = document.createElement('button');
    document.body.appendChild(el);

    el.addEventListener('click', async (e) => {
      capturedBefore = e.currentTarget;
      await Promise.resolve();
      afterAwait = e.currentTarget;
    });

    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect(capturedBefore).toBe(el);
    expect(afterAwait).toBeNull();
    el.remove();
  });
});

describe('真处理器：导出菜单点击后必须把按钮元素交给导出函数', () => {
  const cases = [
    ['.export-docx-item', 'exportAssistantMessageToDocx'],
    ['.export-md-item', 'exportAssistantMessageToMarkdown'],
    ['.export-pdf-item', 'exportAssistantMessageToPdf'],
    ['.export-image-item', 'exportAssistantMessageToImage'],
  ];

  test.each(cases)('%s 点击 → %s 收到非空按钮', async (selector, fnName) => {
    const container = mountMessageWithExportMenu();
    chatManager.rebindAllMessages(container);

    const btn = await clickAndWait(selector);
    const spy = exportSpies[fnName];
    expect(spy).toHaveBeenCalledTimes(1);

    const args = spy.mock.calls[0];
    expect(args[0]).toBe(container.querySelector('.message'));
    // 曾经这里是 null：await 之后 e.currentTarget 已复位，取值即崩
    expect(args[1], `${fnName} 的 exportBtn 不得为 null（须在 await 前捕获）`).toBe(btn);
    expect(args[2]).toBe(container.querySelector('.export-dropdown'));
  });
});

describe('源码接线：按需 import 的导出回调不得在 await 后取事件对象', () => {
  const CALL_RE = /exportAssistantMessageTo(?:Docx|Pdf|Markdown|Image)\(([^)]*)\)/g;

  test('chat-manager 与 chat-streaming 的全部导出调用点都传标识符', () => {
    for (const [name, src] of Object.entries(SRC)) {
      const hits = [...src.matchAll(CALL_RE)];
      expect(hits.length, `${name} 应有导出调用点`).toBeGreaterThan(0);
      for (const hit of hits) {
        expect(hit[1], `${name} 存在 await 后取事件对象的写法: ${hit[0]}`)
          .not.toMatch(/e\.currentTarget|e\.target/);
      }
    }
  });

  test('按钮参数均来自 await 前的捕获（按大括号配对取回调体，不依赖缩进）', () => {
    const bodies = [
      ...extractAsyncClickHandlers('chat-manager', SRC.CHAT_MANAGER),
      ...extractAsyncClickHandlers('chat-streaming', SRC.CHAT_STREAMING),
    ].filter((h) => h.body.includes("await import('./chat-export.js')"));

    // chat-manager 4（addMessage）+ 4（restoreMessageFromHtml）+ 4（rebindAllMessages）、chat-streaming 4
    expect(bodies.length).toBe(16);

    for (const h of bodies) {
      const importAt = h.body.indexOf("await import('./chat-export.js')");
      const after = h.body.slice(importAt);
      expect(after, `${h.file} 的回调在 await 之后取事件对象：${h.snippet}`)
        .not.toMatch(/e\.currentTarget|e\.target/);
      if (h.body.includes('e.currentTarget')) {
        expect(h.body.indexOf('e.currentTarget')).toBeLessThan(importAt);
      }
    }
  });
});
