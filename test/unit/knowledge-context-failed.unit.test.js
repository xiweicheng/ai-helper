// @vitest-environment jsdom
// 验证知识库预检索的「失败」与「0 命中」区分：
// 1) RAG_SEARCH 失败（success:false / lastError）→ payload.failed=true，注入"服务暂不可用"提示（而非"未找到"）
//    避免大模型把"服务故障"误判为"知识库没内容"而重复检索
// 2) 检索成功但 0 命中 → 保持原"未找到与问题相关的内容"语义
// 3) renderKnowledgeContextBubbles：失败显示"检索失败"气泡（与"未命中"区分），三条发送/恢复链路共用
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';

const noop = () => {};

// RAG 检索桩（由各用例设置）：'success' | 'apiFail' | 'lastError'
let ragSearchMode = 'success';
let ragSearchResults = [];

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = { ragEnabled: true };
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
    sendMessage: (msg, cb) => {
      // buildKnowledgeContextText 走 callback 风格 RAG_SEARCH
      if (msg && msg.type === 'RAG_SEARCH' && typeof cb === 'function') {
        if (ragSearchMode === 'lastError') {
          chrome.runtime.lastError = { message: 'agent unreachable' };
          cb(undefined);
          chrome.runtime.lastError = null;
          return Promise.resolve({});
        }
        if (ragSearchMode === 'apiFail') {
          cb({ success: false, error: 'agent unreachable' });
          return Promise.resolve({});
        }
        cb({ success: true, results: ragSearchResults });
      }
      return Promise.resolve({});
    },
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

let chatManager;

beforeAll(async () => {
  chatManager = await import('../../src/side_panel/chat-manager.js');
});

beforeEach(() => {
  document.body.innerHTML = '<div id="chatContainer" style="height: 500px; overflow-y: auto;"></div>';
  ragSearchMode = 'success';
  ragSearchResults = [];
});

describe('buildKnowledgeContextText：检索失败与 0 命中区分', () => {
  test('RAG_SEARCH 返回失败 → failed=true，注入"暂时不可用"提示，而非"未找到"', async () => {
    ragSearchMode = 'apiFail';
    const payload = await chatManager.buildKnowledgeContextText('问题', [{ id: 'kb1', name: '库1' }]);

    expect(payload).toBeTruthy();
    expect(payload.failed).toBe(true);
    expect(payload.text).toContain('暂时不可用');
    expect(payload.text).not.toContain('未找到与问题相关的内容');
  });

  test('RAG_SEARCH 回调 lastError → failed=true', async () => {
    ragSearchMode = 'lastError';
    const payload = await chatManager.buildKnowledgeContextText('问题', [{ id: 'kb1', name: '库1' }]);

    expect(payload.failed).toBe(true);
    expect(payload.text).toContain('暂时不可用');
  });

  test('检索成功但 0 命中 → failed 非 true，仍注入"未找到"', async () => {
    ragSearchMode = 'success';
    ragSearchResults = [];
    const payload = await chatManager.buildKnowledgeContextText('问题', [{ id: 'kb1', name: '库1' }]);

    expect(payload.failed).not.toBe(true);
    expect(payload.text).toContain('未找到与问题相关的内容');
    expect(payload.text).not.toContain('暂时不可用');
  });

  test('检索成功有命中 → failed 非 true，注入命中内容', async () => {
    ragSearchMode = 'success';
    ragSearchResults = [{ collectionId: 'kb1', score: 0.9, content: '命中正文' }];
    const payload = await chatManager.buildKnowledgeContextText('问题', [{ id: 'kb1', name: '库1' }]);

    expect(payload.failed).not.toBe(true);
    expect(payload.text).toContain('命中正文');
    expect(payload.text).not.toContain('暂时不可用');
  });
});

describe('renderKnowledgeContextBubbles：失败气泡与未命中气泡区分', () => {
  test('failed=true → 渲染"检索失败"气泡（非"未命中"）', () => {
    chatManager.renderKnowledgeContextBubbles([{ id: 'kb1', name: '库1', hitCount: 0, hits: [] }], true);
    const container = document.getElementById('chatContainer');
    const bubbles = container.querySelectorAll('.user-context-bubble');
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].textContent).toContain('检索失败');
    expect(bubbles[0].textContent).not.toContain('未命中');
  });

  test('failed=false 且 0 命中 → 渲染"未命中"气泡', () => {
    chatManager.renderKnowledgeContextBubbles([{ id: 'kb1', name: '库1', hitCount: 0, hits: [] }], false);
    const container = document.getElementById('chatContainer');
    const bubbles = container.querySelectorAll('.user-context-bubble');
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].textContent).toContain('未命中');
  });

  test('failed=false 且有命中 → 逐库渲染命中气泡', () => {
    chatManager.renderKnowledgeContextBubbles([
      { id: 'kb1', name: '库1', hitCount: 2, hits: [{ score: 0.9, content: '内容', truncated: false, fullLength: 2 }] },
      { id: 'kb2', name: '库2', hitCount: 0, hits: [] }
    ], false);
    const container = document.getElementById('chatContainer');
    const bubbles = container.querySelectorAll('.user-context-bubble');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0].textContent).toContain('命中 2 条');
    expect(bubbles[1].textContent).toContain('未命中');
  });
});
