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

describe('编辑并重发：不得静默清空用户正在为下一条挂的上下文', () => {
  const IMAGE = { originalUrl: 'data:image/png;base64,AAAA', compressedUrl: 'data:image/png;base64,AA' };
  const FILE = { name: '需求.md', size: 10, type: 'text/markdown', status: 'done', text: '# 正文' };

  test('编辑纯文本旧消息：用户已挂的图片/文件/网页/技能原封不动', () => {
    // ✎ 编辑的是**旧消息**，但输入区里挂的是**下一条消息**的上下文。
    // 旧实现无条件 state.attachedImages = [] / clearPageSelection() / clearSkillSelection()，
    // 用户为下一条准备的图、文件、网页、技能全部被静默清掉——与"任务结束清图"同一类 bug。
    state.attachedImages = [{ ...IMAGE }];
    state.attachedFiles = [{ ...FILE }];
    state.selectedPage = { id: 7, title: '当前页面', url: 'https://example.com/cur' };
    state.selectedSkills = [{ name: 'skill-a', description: '' }];

    const messageDiv = document.createElement('div');
    messageDiv.dataset.textContent_ = '旧消息正文';
    document.getElementById('messageList').appendChild(messageDiv);

    chatManager.editAndResendMessage(messageDiv);

    expect(state.attachedImages).toHaveLength(1);
    expect(state.attachedFiles).toHaveLength(1);
    expect(state.selectedPage.url).toBe('https://example.com/cur');
    expect(state.selectedSkills).toHaveLength(1);
  });

  test('编辑带图片的旧消息：仍按该消息恢复图片（整条替换，不叠加）', () => {
    state.attachedImages = [{ ...IMAGE }];
    const messageDiv = document.createElement('div');
    messageDiv.dataset.rawContent = JSON.stringify([
      { type: 'text', text: '看图' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,BB', original_url: 'data:image/png;base64,BBBB' } },
    ]);
    messageDiv.dataset.textContent_ = '看图';
    document.getElementById('messageList').appendChild(messageDiv);

    chatManager.editAndResendMessage(messageDiv);

    expect(state.attachedImages).toHaveLength(1);
    expect(state.attachedImages[0].originalUrl).toBe('data:image/png;base64,BBBB');
  });
});

describe('引用/选中同时挂载：指示器按“还剩什么”重绘', () => {
  test('引用被本条消费后，指示器切到仍然挂着的选中内容', () => {
    state.quotedContextText = '';
    state.selectedContextText = '还挂着的选中内容';

    chatManager.refreshSelectionIndicatorFromState();

    const indicator = document.getElementById('selectionIndicator');
    const text = document.getElementById('selectionText');
    expect(indicator.classList.contains('show')).toBe(true);
    expect(text.textContent).toContain('还挂着的选中内容');
  });

  test('两份都空了：指示器收起', () => {
    state.quotedContextText = '';
    state.selectedContextText = '';
    document.getElementById('selectionIndicator').classList.add('show');

    chatManager.refreshSelectionIndicatorFromState();

    expect(document.getElementById('selectionIndicator').classList.contains('show')).toBe(false);
  });
});
