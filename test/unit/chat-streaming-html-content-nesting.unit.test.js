// @vitest-environment jsdom
// PERF-11 窄修守卫：流式收尾不再把整段 outerHTML 自我嵌套写进 dataset.htmlContent。
//
// 背景：finalizeStreamingMessage 曾在结尾执行两次
//   element.dataset.htmlContent = element.outerHTML;
// 一次同步（先存当前 HTML）、一次在 renderMessageMermaid().then() 里（异步"补渲染"）。
// 而 dataset.htmlContent 全仓唯一消费点是 chat-manager.js 的持久化捕获
//   const streamingHtml = streamingEl ? (streamingEl.dataset.htmlContent || streamingEl.outerHTML) : null;
// —— 该捕获在 finalize 返回后“同步”执行，早于 .then() 的微任务。于是：
//   · 异步那次写对持久化从不生效，只把“已含 data-html-content 的整段 HTML”再塞回活元素属性 → 活 DOM ~2× 自我嵌套膨胀；
//   · 同步那次写与 `|| outerHTML` 兜底给出的是同一时刻、同样不含该属性的 HTML → 对持久化逐字节等价、纯冗余。
// 修复：删掉这两处写入，靠既有 `|| outerHTML` 兜底。承重 dataset（rawContent / textContent_ / executionLog）不动。
//
// 覆盖两层：
//   1) 行为——真跑 finalizeStreamingMessage，断言收尾后活元素不带 data-html-content、兜底捕获往返不丢正文；
//   2) 接线——源码守卫：写入已移除、消费端兜底仍在、承重 dataset 未被误删。
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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
  bookmarks: { getTree: noop, search: noop },
  history: { search: noop },
  cookies: { get: noop, getAll: noop, set: noop, remove: noop },
  downloads: { download: noop },
  notifications: { create: noop },
  offscreen: { createDocument: noop, hasDocument: noop },
};

const CHAT_STREAMING_SRC = readFileSync(
  path.resolve(process.cwd(), 'src/side_panel/chat-streaming.js'),
  'utf8'
);
const CHAT_MANAGER_SRC = readFileSync(
  path.resolve(process.cwd(), 'src/side_panel/chat-manager.js'),
  'utf8'
);

let finalizeStreamingMessage;

beforeAll(async () => {
  ({ finalizeStreamingMessage } = await import('../../src/side_panel/chat-streaming.js'));
});

/** 构建带"思考中"指示器与正文的流式消息元素（ReAct 轮内：指示器在 stream-content 内） */
function buildStreamingEl() {
  const el = document.createElement('div');
  el.className = 'message assistant streaming';
  el.dataset.messageId = 'msg_p11';
  el.innerHTML = `
    <div class="message-content">
      <div class="stream-content">
        <div class="thinking-indicator">
          <span class="thinking-label">思考中...</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

describe('PERF-11 行为：finalize 收尾不再把 outerHTML 自我嵌套写入 dataset.htmlContent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('收尾后活元素不带 data-html-content 属性（消除 ~2× 自我嵌套膨胀）', () => {
    const el = buildStreamingEl();
    finalizeStreamingMessage(el, '最终回答内容', [{ nodeType: 'tool_exec', action: { name: 'x' } }], null, null, false);

    // 旧写法：同步 :2075 那次写入会让此处 el.outerHTML 含 data-html-content="..." → 断言其不存在（旧代码会转红）
    expect(el.dataset.htmlContent).toBeUndefined();
    expect(el.outerHTML).not.toMatch(/data-html-content=/);
  });

  test('持久化捕获表达式 dataset.htmlContent || outerHTML 走兜底、取到含正文的真实 HTML 且往返不丢', () => {
    const el = buildStreamingEl();
    finalizeStreamingMessage(el, '最终回答内容ABC', [], null, null, false);

    // 复刻 chat-manager 的捕获逻辑（唯一消费点）
    const captured = el.dataset.htmlContent || el.outerHTML;
    expect(captured).toBe(el.outerHTML); // dataset 未写 → 走 outerHTML 兜底
    expect(captured).toContain('最终回答内容ABC');
    expect(captured).not.toMatch(/data-html-content=/); // 持久化字符串无嵌套

    // 复刻 restoreMessageFromHtml 的 tempDiv.innerHTML 往返：正文与结构都在
    const temp = document.createElement('div');
    temp.innerHTML = captured;
    expect(temp.textContent).toContain('最终回答内容ABC');
    expect(temp.querySelector('.message-content')).not.toBeNull();
    expect(temp.querySelector('[data-message-id="msg_p11"]')).not.toBeNull();
  });

  test('承重的 dataset（rawContent / textContent_ / executionLog）仍照常写入（不得被一并删掉）', () => {
    const el = buildStreamingEl();
    finalizeStreamingMessage(el, '最终回答内容', [{ a: 1 }], 42, null, false);

    expect(el.dataset.rawContent).toBe('最终回答内容');
    expect(el.dataset.textContent_).toBeDefined();
    expect(el.dataset.executionLog).toBe(JSON.stringify([{ a: 1 }]));
  });
});

describe('PERF-11 接线：嵌套写已移除、消费端兜底仍在、承重 dataset 未误删（源码守卫）', () => {
  test('chat-streaming.js 不再出现 dataset.htmlContent = ... 的任何写入', () => {
    expect(CHAT_STREAMING_SRC).not.toMatch(/dataset\.htmlContent\s*=/);
  });

  test('chat-manager.js 持久化捕获仍保留 `|| outerHTML` 兜底（否则删写会丢历史恢复）', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/dataset\.htmlContent\s*\|\|\s*\w+\.outerHTML/);
  });

  test('chat-streaming.js 仍保留 rawContent / textContent_ / executionLog 的 dataset 写（承重，不得删）', () => {
    expect(CHAT_STREAMING_SRC).toMatch(/dataset\.rawContent\s*=/);
    expect(CHAT_STREAMING_SRC).toMatch(/dataset\.textContent_\s*=/);
    expect(CHAT_STREAMING_SRC).toMatch(/dataset\.executionLog\s*=/);
  });
});
