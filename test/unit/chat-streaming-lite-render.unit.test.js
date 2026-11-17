// @vitest-environment jsdom
// 回归：流式增量渲染（稳定前缀 + 尾部重渲）的结构正确性。
//
// 背景：updateStreamingMessage 原本每个 chunk 都对全文做一次 Markdown 解析 + sanitize +
// innerHTML，长回答是平方级开销。改成「已完成的段落只渲染一次，每个 chunk 只重渲最后一个
// 未完成段落」后，必须保证 DOM 结构与整段渲染等价，否则用户会看到：
//   1) 首帧恰好停在未闭合的代码围栏里 → 后续代码被当成普通段落另起一段（代码块空白/错乱）；
//   2) 首帧停在句中 → 同一个段落被拆成两段；
//   3) 快照回填过 innerHTML 后继续增量 → 同一段文字重复出现；
//   4) 一个轮次出现多个 .markdown-body 包裹层（旧实现每轮只有一个）。
import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'vitest';

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

// 生产环境用全局 marked（libs-loader 注入），单测里给一个最小实现，
// 只覆盖本用例关心的一层：未闭合围栏 → <pre><code>，其余按空行分段。
const ESC = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
globalThis.marked = {
  setOptions: noop,
  parse(text) {
    return text
      .split(/\n{2,}/)
      .filter((chunk) => chunk.trim())
      .map((chunk) => {
        const fence = chunk.match(/^```(\w*)\n?([\s\S]*?)```$/);
        if (fence) {
          return `<pre><code class="language-${fence[1]}">${ESC(fence[2].replace(/\n$/, ''))}</code></pre>`;
        }
        const openFence = chunk.match(/^```(\w*)\n?([\s\S]*)$/);
        if (openFence) {
          return `<pre><code class="language-${openFence[1]}">${ESC(openFence[2])}</code></pre>`;
        }
        return `<p>${ESC(chunk).replace(/\n/g, '<br>')}</p>`;
      })
      .join('');
  },
};

let updateStreamingMessage;
let renderStreamingContentFull;

beforeAll(async () => {
  ({ updateStreamingMessage, renderStreamingContentFull } = await import('../../src/side_panel/chat-streaming.js'));
});

/** 复刻 addStreamingMessage 产出的最小结构：本轮指示器在 stream-content 内 */
function buildStreamingEl() {
  const el = document.createElement('div');
  el.className = 'message assistant streaming';
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

const countOccurrences = (text, needle) => text.split(needle).length - 1;

describe('流式增量渲染：结构与整段渲染等价', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('多段内容逐块到达：一个轮次只有一个 .markdown-body，正文不重复不丢失', () => {
    const el = buildStreamingEl();
    const p1 = '第一段内容，用来验证稳定前缀。';
    const p2 = '第二段内容，用来验证尾部重渲。';
    const p3 = '第三段内容，用来验证增量追加。';

    updateStreamingMessage(el, p1);
    updateStreamingMessage(el, `${p1}\n\n${p2}`);
    updateStreamingMessage(el, `${p1}\n\n${p2}\n\n${p3}`);

    expect(el.querySelectorAll('.thinking-content').length).toBe(1);
    expect(el.querySelectorAll('.thinking-content > .markdown-body').length).toBe(1);

    const text = el.querySelector('.thinking-content > .markdown-body').textContent;
    expect(countOccurrences(text, p1)).toBe(1);
    expect(countOccurrences(text, p2)).toBe(1);
    expect(countOccurrences(text, p3)).toBe(1);
  });

  test('首帧停在未闭合代码围栏内：后续代码仍留在 <pre><code> 里，不会被拆成普通段落', () => {
    const el = buildStreamingEl();
    const first = '```js\nconsole.log(1';
    const full = '```js\nconsole.log(1)\nconsole.log(2)\n```';

    updateStreamingMessage(el, first);
    updateStreamingMessage(el, full);

    const body = el.querySelector('.thinking-content > .markdown-body');
    const code = body.querySelector('pre code');
    expect(code).not.toBeNull();
    expect(code.textContent).toContain('console.log(1)');
    expect(code.textContent).toContain('console.log(2)');

    // 代码不能以“普通段落”的形式在代码块外面再出现一份
    const paragraphText = Array.from(body.querySelectorAll('p')).map((p) => p.textContent).join('|');
    expect(paragraphText).not.toContain('console.log');
  });

  test('首帧停在句中：后续延续不会被拆成两个段落', () => {
    const el = buildStreamingEl();
    updateStreamingMessage(el, '这是一句话的开头');
    updateStreamingMessage(el, '这是一句话的开头，后面还有内容。');

    const body = el.querySelector('.thinking-content > .markdown-body');
    expect(body.querySelectorAll('p').length).toBe(1);
    expect(body.textContent).toContain('这是一句话的开头，后面还有内容。');
    expect(countOccurrences(body.textContent, '这是一句话的开头')).toBe(1);
  });

  test('快照回填（innerHTML 被整体替换）后继续更新：正文只出现一次', () => {
    const el = buildStreamingEl();
    const content = '快照里已有的内容，回填后继续增量。';
    updateStreamingMessage(el, content);

    // 模拟 applyStreamSnapshot：同一容器换掉 childNodes，WeakMap 里的尾部节点全部脱离文档
    const container = el.querySelector('.thinking-content');
    container.innerHTML = container.innerHTML;

    updateStreamingMessage(el, content);
    updateStreamingMessage(el, `${content}\n\n新到达的一段。`);

    expect(countOccurrences(container.textContent, content)).toBe(1);
    expect(countOccurrences(container.textContent, '新到达的一段。')).toBe(1);
    expect(container.querySelectorAll(':scope > .markdown-body').length).toBe(1);
  });

  test('renderStreamingContentFull 边界兜底：内容完整、单包裹层、可继续增量', () => {
    const el = buildStreamingEl();
    const a = '边界前的正文。';
    const b = '边界后的正文。';

    updateStreamingMessage(el, a);
    renderStreamingContentFull(el, a);
    updateStreamingMessage(el, `${a}\n\n${b}`);

    const container = el.querySelector('.thinking-content');
    expect(container.querySelectorAll(':scope > .markdown-body').length).toBe(1);
    expect(countOccurrences(container.textContent, a)).toBe(1);
    expect(countOccurrences(container.textContent, b)).toBe(1);
  });
});
