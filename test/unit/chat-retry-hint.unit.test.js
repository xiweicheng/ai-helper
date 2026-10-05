// @vitest-environment jsdom
// 验证请求重试提示的恢复机制：
// 思考指示器 label 处于"重试中"状态（dataset.retrying='1'，由 API_RETRYING 消息写入）时，
// 首个数据块到达（updateStreamingMessage）应立即转为"输出中..."并清除重试标记，
// 避免重试成功后状态行残留"正在重试"文案；非重试态行为保持回归不变。
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';

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

let updateStreamingMessage;

beforeAll(async () => {
  ({ updateStreamingMessage } = await import('../../src/side_panel/chat-streaming.js'));
});

/** 构建流式消息元素：思考指示器 label 按场景给初始文案 */
function buildStreamingEl({ labelText, retrying = false } = {}) {
  const el = document.createElement('div');
  el.className = 'message assistant';
  el.innerHTML = `
    <div class="message-content">
      <div class="stream-content">
        <div class="thinking-indicator">
          <span class="thinking-label">${labelText}</span>
        </div>
      </div>
    </div>
  `;
  const label = el.querySelector('.thinking-label');
  if (retrying) label.dataset.retrying = '1';
  document.body.appendChild(el);
  return el;
}

describe('重试提示的思考指示器恢复', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('重试态 label：首个数据块到达即转为"输出中..."并清除重试标记', () => {
    const el = buildStreamingEl({ labelText: '连接异常，正在重试 (1/3)...', retrying: true });
    const label = el.querySelector('.thinking-label');
    expect(label.dataset.retrying).toBe('1');

    updateStreamingMessage(el, '重试成功后的首段内容');

    expect(label.textContent).toBe('输出中...');
    expect(label.dataset.retrying).toBeUndefined();
  });

  test('普通"思考中..."label：首块内容到达转"输出中..."（回归不变）', () => {
    const el = buildStreamingEl({ labelText: '思考中...' });
    const label = el.querySelector('.thinking-label');

    updateStreamingMessage(el, '首段内容');

    expect(label.textContent).toBe('输出中...');
    expect(label.dataset.retrying).toBeUndefined();
  });

  test('已处于"输出中..."的 label：重复调用不改变状态', () => {
    const el = buildStreamingEl({ labelText: '输出中...' });
    const label = el.querySelector('.thinking-label');

    updateStreamingMessage(el, '追加内容');

    expect(label.textContent).toBe('输出中...');
    expect(label.dataset.retrying).toBeUndefined();
  });
});
