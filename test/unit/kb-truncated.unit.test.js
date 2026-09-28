// @vitest-environment jsdom
// 验证知识库气泡截断提示：
// 1) buildKnowledgeContextText 产出 truncated/fullLength 标记，气泡明细与注入文本同源同截断
// 2) addContextBubble 渲染条目级截断提示与摘要行计数徽章（含旧数据兼容）
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';

const noop = () => {};

// RAG 检索桩数据（由各用例设置）
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
  ragSearchResults = [];
});

describe('buildKnowledgeContextText 截断标记', () => {
  test('超长内容标记 truncated 且 fullLength 为原文长度，明细截断 1500 字', async () => {
    // 2000 字：第 1500 字是乙，第 1501 字起是丙
    const longContent = '甲'.repeat(1499) + '乙' + '丙'.repeat(500);
    ragSearchResults = [
      { collectionId: 'kb1', score: 0.9, content: longContent },
      { collectionId: 'kb2', score: 0.5, content: '短内容' }
    ];
    const refs = [
      { id: 'kb1', name: '库1' },
      { id: 'kb2', name: '库2' }
    ];
    const payload = await chatManager.buildKnowledgeContextText('问题', refs);

    expect(payload).toBeTruthy();
    expect(payload.refs).toHaveLength(2);

    const b1 = payload.refs.find(r => r.id === 'kb1');
    expect(b1.hitCount).toBe(1);
    expect(b1.hits[0].truncated).toBe(true);
    expect(b1.hits[0].fullLength).toBe(2000);
    expect(b1.hits[0].content).toHaveLength(1500);
    expect(b1.hits[0].content.endsWith('乙')).toBe(true);

    const b2 = payload.refs.find(r => r.id === 'kb2');
    expect(b2.hits[0].truncated).toBe(false);
    expect(b2.hits[0].fullLength).toBe(3);

    // 注入文本与气泡明细同源：包含每库分节与截断后内容，不含被截掉的字符
    expect(payload.text).toContain('【库1】');
    expect(payload.text).toContain('【库2】');
    expect(payload.text).toContain(b1.hits[0].content);
    expect(payload.text).not.toContain('丙');
  });

  test('恰好 1500 字不标记截断，1501 字标记', async () => {
    ragSearchResults = [
      { collectionId: 'kb1', score: 0.9, content: '甲'.repeat(1500) },
      { collectionId: 'kb2', score: 0.8, content: '乙'.repeat(1501) }
    ];
    const payload = await chatManager.buildKnowledgeContextText('问题', [
      { id: 'kb1', name: '库1' },
      { id: 'kb2', name: '库2' }
    ]);

    const b1 = payload.refs.find(r => r.id === 'kb1');
    const b2 = payload.refs.find(r => r.id === 'kb2');
    expect(b1.hits[0].truncated).toBe(false);
    expect(b1.hits[0].fullLength).toBe(1500);
    expect(b2.hits[0].truncated).toBe(true);
    expect(b2.hits[0].fullLength).toBe(1501);
  });
});

describe('addContextBubble 截断提示渲染', () => {
  test('含截断条目时渲染条目徽章与摘要计数徽章', () => {
    const hits = [
      { score: 0.9, content: '长内容', truncated: true, fullLength: 2300 },
      { score: 0.5, content: '短内容', truncated: false, fullLength: 3 }
    ];
    chatManager.addContextBubble('knowledge', '库1 📚 · 命中 2 条', false, hits);
    const container = document.getElementById('chatContainer');

    const itemBadges = container.querySelectorAll('.kb-bubble-hit-truncated');
    expect(itemBadges).toHaveLength(1);
    expect(itemBadges[0].textContent).toContain('2300');
    expect(itemBadges[0].textContent).toContain('1500');

    const summaryBadge = container.querySelector('.kb-bubble-truncated-badge');
    expect(summaryBadge).toBeTruthy();
    expect(summaryBadge.textContent).toContain('1');

    expect(container.querySelectorAll('.kb-bubble-hit')).toHaveLength(2);
  });

  test('无截断条目时不渲染任何截断提示', () => {
    const hits = [{ score: 0.5, content: '短内容', truncated: false, fullLength: 3 }];
    chatManager.addContextBubble('knowledge', '库1 📚 · 命中 1 条', false, hits);
    const container = document.getElementById('chatContainer');

    expect(container.querySelectorAll('.kb-bubble-hit-truncated')).toHaveLength(0);
    expect(container.querySelector('.kb-bubble-truncated-badge')).toBeNull();
  });

  test('旧数据缺少 truncated 字段时兼容（不渲染提示）', () => {
    const hits = [{ score: 0.5, content: '旧数据' }];
    chatManager.addContextBubble('knowledge', '库1 📚 · 命中 1 条', false, hits);
    const container = document.getElementById('chatContainer');

    expect(container.querySelectorAll('.kb-bubble-hit-truncated')).toHaveLength(0);
    expect(container.querySelector('.kb-bubble-truncated-badge')).toBeNull();
  });
});
