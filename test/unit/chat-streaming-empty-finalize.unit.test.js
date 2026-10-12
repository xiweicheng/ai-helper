// @vitest-environment jsdom
// 回归：模型返回空内容（如给非视觉模型发图片）时，"思考中"占位必须被清除。
//
// Bug 背景：callApi 的 API_COMPLETE 处理此前写成 `if (_se() && message.content) finalize(...)`，
// 空内容时 finalize 被跳过，而 cleanupCallApi 只清 Map 引用不删 DOM，导致带"思考中"的流式元素
// 永久卡在页面上（任务已结束却仍显示"思考中"）。
// 修复：API_COMPLETE 无条件 finalize；content 为空时用兜底文案（chatMsg.emptyModelReply）填充。
//
// 覆盖两层：
//   1) 行为——finalizeStreamingMessage(el, '') 仍隐藏/移除所有思考指示器并清除 streaming 态；
//   2) 接线——chat-manager.js 不再以 message.content 门控 finalize，且使用 finalContent 兜底。
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

// jsdom 环境下 import.meta.url 非 file scheme，改用相对 cwd（项目根）解析
const CHAT_MANAGER_SRC = readFileSync(
  path.resolve(process.cwd(), 'src/side_panel/chat-manager.js'),
  'utf8'
);

let finalizeStreamingMessage;

beforeAll(async () => {
  ({ finalizeStreamingMessage } = await import('../../src/side_panel/chat-streaming.js'));
});

/** 构建带"思考中"指示器的流式消息元素（ReAct 轮内：指示器在 stream-content 内） */
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

describe('空内容 finalize 仍清除"思考中"占位', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('finalizeStreamingMessage(el, "") 隐藏所有思考指示器并清除 streaming 态', () => {
    const el = buildStreamingEl();
    // 前置：存在可见的思考指示器
    expect(el.querySelector('.thinking-indicator:not(.hidden)')).not.toBeNull();

    finalizeStreamingMessage(el, '', [], null, null, false);

    // 核心断言：不再有任何"可见"的思考指示器（全部被 hidden/移除）
    expect(el.querySelector('.thinking-indicator:not(.hidden)')).toBeNull();
    // 元素脱离流式态
    expect(el.classList.contains('streaming')).toBe(false);
  });

  test('finalizeStreamingMessage(el, "正常内容") 同样清除指示器（回归不变）', () => {
    const el = buildStreamingEl();
    finalizeStreamingMessage(el, '这是正常回答', [], null, null, false);
    expect(el.querySelector('.thinking-indicator:not(.hidden)')).toBeNull();
    expect(el.textContent).toContain('这是正常回答');
  });
});

describe('API_COMPLETE 空内容兜底接线（源码守卫）', () => {
  test('不再以 message.content 门控 finalizeStreamingMessage', () => {
    // 旧的错误形态：`if (_se() && message.content) {` 紧跟 finalize —— 必须已移除
    expect(CHAT_MANAGER_SRC).not.toMatch(/if \(_se\(\) && message\.content\) \{\s*\n\s*finalizeStreamingMessage/);
  });

  test('引入 finalContent 兜底并以其调用 finalize 与 resolve', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/const finalContent = \(message\.content && String\(message\.content\)\.trim\(\)\)/);
    expect(CHAT_MANAGER_SRC).toMatch(/: t\('chatMsg\.emptyModelReply'\);/);
    expect(CHAT_MANAGER_SRC).toMatch(/finalizeStreamingMessage\(_se\(\), finalContent,/);
    // resolve 携带兜底后的 content
    expect(CHAT_MANAGER_SRC).toMatch(/content: finalContent,/);
  });

  test('emptyModelReply 中英文案均已注册', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/emptyModelReply: '[^']*'/);
    // zh + en 各一处
    const zh = CHAT_MANAGER_SRC.indexOf("registerTranslations('zh'");
    const en = CHAT_MANAGER_SRC.indexOf("registerTranslations('en'");
    expect(CHAT_MANAGER_SRC.slice(zh, en).includes('emptyModelReply')).toBe(true);
    expect(CHAT_MANAGER_SRC.slice(en).includes('emptyModelReply')).toBe(true);
  });
});
