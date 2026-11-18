// @vitest-environment jsdom
// 回归：命令实时输出（AGENT_STREAM）必须挂在对应工具卡片内。
//
// 背景：旧实现只在当前流式气泡里查卡片，查不到就退回 .stream-content，
// 于是迟到/乱序/气泡重建后的命令输出会在对话流底部堆出一串孤立的「执行结果」块。
// 现在卡片暂不可得时先暂存（pending），等 appendToolCallItems 把卡片渲染出来再回填。
import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'vitest';

const noop = () => {};

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        if (typeof cb === 'function') cb({});
        else return Promise.resolve({});
      },
      set: (obj, cb) => {
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      },
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

let attachAgentStreamChunk;
let registerAgentStreamStore;
let appendToolCallItems;
let flushPendingAgentStreams;
let appendToolResult;

beforeAll(async () => {
  ({ attachAgentStreamChunk, registerAgentStreamStore, appendToolCallItems, flushPendingAgentStreams, appendToolResult } = await import('../../src/side_panel/chat-streaming.js'));
});

function buildStreamingEl() {
  const el = document.createElement('div');
  el.className = 'message assistant streaming';
  el.innerHTML = `
    <div class="message-content">
      <div class="stream-content"></div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function buildCard(el, toolCallId) {
  const card = document.createElement('div');
  card.className = 'tool-call-item';
  card.setAttribute('data-tool-call-id', toolCallId);
  card.setAttribute('data-meta-type', 'exec');
  card.innerHTML = '<div class="tool-call-header"></div><div class="tool-call-body"></div>';
  el.querySelector('.stream-content').appendChild(card);
  return card;
}

const execMessage = (execId, toolCallId, streamType, data) => ({
  type: 'AGENT_STREAM',
  execId,
  toolCallId,
  streamType,
  data,
});

describe('AGENT_STREAM 输出归位', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('卡片已存在：输出写进卡片 body，stream-content 下没有游离「执行结果」块', () => {
    const el = buildStreamingEl();
    const card = buildCard(el, 'tc-1');
    const store = new Map();

    attachAgentStreamChunk(store, el, execMessage('exec-1', 'tc-1', 'stdout', 'hello '));
    attachAgentStreamChunk(store, el, execMessage('exec-1', 'tc-1', 'stdout', 'world'));

    const code = card.querySelector('.tool-call-body .agent-stream-output code');
    expect(code).not.toBeNull();
    expect(code.textContent).toBe('hello world');
    expect(el.querySelectorAll('.stream-content > .agent-stream-output').length).toBe(0);
    expect(el.querySelectorAll('.agent-stream-output').length).toBe(1);
  });

  test('卡片后到：输出先暂存，卡片渲染后回填，内容完整且只有一块', () => {
    const el = buildStreamingEl();
    const store = new Map();
    registerAgentStreamStore(el, store);

    // 乱序：AGENT_STREAM 先于 STREAM_TOOL_CALL
    attachAgentStreamChunk(store, el, execMessage('exec-2', 'tc-2', 'stdout', 'line1\n'));
    attachAgentStreamChunk(store, el, execMessage('exec-2', 'tc-2', 'stdout', 'line2'));
    expect(el.querySelectorAll('.agent-stream-output').length).toBe(0);

    appendToolCallItems(el, [{
      id: 'tc-2',
      type: 'function',
      function: { name: 'agent_exec', arguments: JSON.stringify({ command: 'python app.py' }) },
    }]);

    const card = el.querySelector('.tool-call-item[data-tool-call-id="tc-2"]');
    expect(card).not.toBeNull();
    const outputs = card.querySelectorAll('.tool-call-body .agent-stream-output');
    expect(outputs.length).toBe(1);
    expect(outputs[0].querySelector('code').textContent).toBe('line1\nline2');
    expect(el.querySelectorAll('.stream-content > .agent-stream-output').length).toBe(0);

    // 回填后继续增量：仍写在同一块里
    attachAgentStreamChunk(store, el, execMessage('exec-2', 'tc-2', 'stdout', '!'));
    expect(card.querySelectorAll('.agent-stream-output').length).toBe(1);
    expect(card.querySelector('.agent-stream-output code').textContent).toBe('line1\nline2!');
  });

  test('stderr 始终排在 stdout 之后：等价 stdout + "\\n" + stderr', () => {
    const el = buildStreamingEl();
    const card = buildCard(el, 'tc-3');
    const store = new Map();

    attachAgentStreamChunk(store, el, execMessage('exec-3', 'tc-3', 'stdout', 'out-a'));
    attachAgentStreamChunk(store, el, execMessage('exec-3', 'tc-3', 'stderr', 'err'));
    attachAgentStreamChunk(store, el, execMessage('exec-3', 'tc-3', 'stdout', 'out-b'));

    expect(card.querySelector('.agent-stream-output code').textContent).toBe('out-aout-b\nerr');
  });

  test('卡片已有输出块（快照回填场景）：复用同一块续写，不会出现两个「执行结果」', () => {
    const el = buildStreamingEl();
    const card = buildCard(el, 'tc-5');
    card.querySelector('.tool-call-body').innerHTML = `
      <div class="agent-stream-output">
        <div class="tool-result-title">执行结果</div>
        <pre><code class="agent-stream-content">hello</code></pre>
      </div>
    `;
    const store = new Map();

    attachAgentStreamChunk(store, el, execMessage('exec-5', 'tc-5', 'stdout', ' world'));

    expect(card.querySelectorAll('.agent-stream-output').length).toBe(1);
    expect(card.querySelector('.agent-stream-output code').textContent).toBe('hello world');
  });

  test('卡片在另一个（已挂载的）气泡里：文档兜底归位，不在当前气泡产生游离块', () => {
    const oldEl = buildStreamingEl();
    const oldCard = buildCard(oldEl, 'tc-6');
    const currentEl = buildStreamingEl();
    const store = new Map();

    attachAgentStreamChunk(store, currentEl, execMessage('exec-6', 'tc-6', 'stdout', 'late'));

    expect(oldCard.querySelector('.agent-stream-output code').textContent).toBe('late');
    expect(currentEl.querySelectorAll('.agent-stream-output').length).toBe(0);
  });

  test('回填时复用卡片已有输出块：内容按顺序拼接且只有一块', () => {
    const el = buildStreamingEl();
    const store = new Map();
    registerAgentStreamStore(el, store);

    // 卡片缺失阶段先暂存
    attachAgentStreamChunk(store, el, execMessage('exec-7', 'tc-7', 'stdout', 'def'));
    // 快照回填：卡片带着之前的输出出现
    const card = buildCard(el, 'tc-7');
    card.querySelector('.tool-call-body').innerHTML = `
      <div class="agent-stream-output">
        <div class="tool-result-title">执行结果</div>
        <pre><code class="agent-stream-content">abc</code></pre>
      </div>
    `;

    flushPendingAgentStreams(store, el);

    const outputs = card.querySelectorAll('.tool-call-body .agent-stream-output');
    expect(outputs.length).toBe(1);
    expect(outputs[0].querySelector('code').textContent).toBe('abcdef');
  });

  test('exec 失败但已有实时输出：不再追加第二块「执行结果」', async () => {
    const el = buildStreamingEl();
    const card = buildCard(el, 'tc-8');
    card.querySelector('.tool-call-body').innerHTML = `
      <div class="agent-stream-output">
        <div class="tool-result-title">执行结果</div>
        <pre><code class="agent-stream-content">Traceback (most recent call last)</code></pre>
      </div>
    `;

    appendToolResult({ toolCallId: 'tc-8', success: false, content: 'Traceback (most recent call last)', duration: 12 }, el);
    await new Promise((r) => setTimeout(r, 20));

    expect(card.querySelectorAll('.tool-call-result').length).toBe(0);
    expect(card.querySelectorAll('.agent-stream-output').length).toBe(1);
    expect(card.dataset.status).toBe('failed');
  });

  test('exec 失败且没有实时输出：仍补一块错误信息（安全拦截等场景）', async () => {
    const el = buildStreamingEl();
    const card = buildCard(el, 'tc-9');

    appendToolResult({ toolCallId: 'tc-9', success: false, content: 'Blocked by safety rule', duration: 5 }, el);
    await new Promise((r) => setTimeout(r, 20));

    const results = card.querySelectorAll('.tool-call-result');
    expect(results.length).toBe(1);
    expect(results[0].querySelector('.tool-result-title').textContent).toBe('执行结果');
  });

  test('无 toolCallId 时保留 stream-content 兜底（兼容旧后台）', () => {
    const el = buildStreamingEl();
    const store = new Map();

    attachAgentStreamChunk(store, el, { type: 'AGENT_STREAM', execId: 'exec-4', data: 'raw' });

    const fallback = el.querySelectorAll('.stream-content > .agent-stream-output');
    expect(fallback.length).toBe(1);
    expect(fallback[0].querySelector('code').textContent).toBe('raw');
  });
});
