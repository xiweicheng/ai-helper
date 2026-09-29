// @vitest-environment jsdom
// 验证「编辑并重发」历史恢复时，知识库引用快照携带当前启用状态：
// 恢复的引用在异步补全 ID 时同步补全 enabled —— 停用库引用显示为"手动引用"
// （重发走显式 IDs 链路，停用库照常检索，符合 @ 手动引用红线）
import { describe, test, expect, beforeEach, vi } from 'vitest';

const noop = () => {};

// 仅替换 fetchKnowledgeCollections（返回含停用库的列表），其余保持真实行为
vi.mock('../../src/side_panel/agent-at-selector.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchKnowledgeCollections: vi.fn(async () => ({
      ok: true,
      ts: Date.now(),
      collections: [
        { id: 'kb-1', name: '知识库一', documentCount: 2, chunkCount: 10 },
        { id: 'kb-3', name: '知识库三', documentCount: 1, chunkCount: 3, enabled: false }
      ]
    }))
  };
});

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        if (typeof cb === 'function') {
          cb(result);
          return;
        }
        return Promise.resolve(result);
      },
      set: noop
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() }
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: (msg, cb) => {
      if (typeof cb === 'function') cb({});
      return Promise.resolve({});
    },
    connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
    onMessage: { addListener: noop, removeListener: noop },
    getContexts: noop
  },
  tabs: {
    query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
    remove: noop, reload: noop, goBack: noop, goForward: noop,
    captureVisibleTab: noop, onUpdated: { addListener: noop }, onActivated: { addListener: noop }
  },
  scripting: { executeScript: noop },
  bookmarks: { getTree: noop, search: noop },
  history: { search: noop },
  cookies: { get: noop, getAll: noop, set: noop, remove: noop },
  downloads: { download: noop },
  notifications: { create: noop },
  offscreen: { createDocument: noop, hasDocument: noop }
};

let chatManager;
let state;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <textarea id="userInput"></textarea>
    <div class="knowledge-indicator" id="knowledgeIndicator" style="display: none;"></div>
    <div id="pageIndicator" style="display: none;"><span id="pageIndicatorName"></span></div>
    <div id="selectionIndicator"><span id="selectionText"></span></div>
    <div id="imagePreviewContainer"></div>
    <div id="filePreviewContainer"></div>
    <div id="messageList"></div>
  `;
  chatManager = await import('../../src/side_panel/chat-manager.js');
  state = (await import('../../src/side_panel/state.js')).default;
  state.knowledgeRefs = [];
});

describe('编辑并重发：知识库引用恢复携带启用状态', () => {
  test('停用库引用补全 ID 时携带 enabled=false（chip 可显示"手动引用"）', async () => {
    const messageDiv = document.createElement('div');
    messageDiv.dataset.textContent_ = '[知识库检索结果]（引用: 知识库三）\n正文\n[/知识库检索结果]\n\n用户问题';
    document.getElementById('messageList').appendChild(messageDiv);

    chatManager.editAndResendMessage(messageDiv);

    await vi.waitFor(() => {
      expect(state.knowledgeRefs.some(r => r.id === 'kb-3')).toBe(true);
    });
    const ref = state.knowledgeRefs.find(r => r.id === 'kb-3');
    expect(ref.name).toBe('知识库三');
    expect(ref.enabled).toBe(false);
  });

  test('启用库引用补全 ID 时携带 enabled=true', async () => {
    const messageDiv = document.createElement('div');
    messageDiv.dataset.textContent_ = '[知识库检索结果]（引用: 知识库一）\n正文\n[/知识库检索结果]\n\n用户问题';
    document.getElementById('messageList').appendChild(messageDiv);

    chatManager.editAndResendMessage(messageDiv);

    await vi.waitFor(() => {
      expect(state.knowledgeRefs.some(r => r.id === 'kb-1')).toBe(true);
    });
    const ref = state.knowledgeRefs.find(r => r.id === 'kb-1');
    expect(ref.enabled).toBe(true);
  });
});
