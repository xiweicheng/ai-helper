// @vitest-environment jsdom
// 验证知识库文档列表的原件溯源 UI：
// 1) 来源徽标（文件 / 网页 / 文本）+ 原件大小 + 无原件时的禁用与说明
// 2) 查看原文弹窗：GET 详情 → 只读文本 + 截断提示 + 复制
// 3) 下载原件：原生 fetch（带 Authorization）→ Content-Disposition 中文文件名 → <a download>
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { t } from '../../src/shared/i18n.js';

// options.html 用 <script> 加载 libs/marked.min.js；jsdom 测试里没有这个标签，
// 直接把同一份文件灌进全局，保证预览走真实解析而不是 mock
new Function(readFileSync('libs/marked.min.js', 'utf8'))();

const noop = () => {};

const { apiCalls, toastCalls, fetchCalls } = vi.hoisted(() => ({
  apiCalls: [],
  toastCalls: [],
  fetchCalls: [],
}));

const MD_TEXT = '# 使用说明\n\n这是 **Markdown** 正文。\n\n```js\nconsole.log(1)\n```';

const DOCS = [
  {
    id: 'doc_file', name: '季度报告.pdf', source: 'file', chunkCount: 12,
    createdAt: '2026-11-01T02:00:00.000Z',
    original: { name: '季度报告.pdf', ext: '.pdf', size: 2 * 1024 * 1024, mime: 'application/pdf' },
  },
  {
    id: 'doc_url', name: '某网页标题', source: 'url', chunkCount: 3,
    createdAt: '2026-11-01T03:00:00.000Z',
    original: { name: 'example.com-report.html', ext: '.html', size: 4096, mime: 'text/html; charset=utf-8' },
    originUrl: 'https://example.com/report',
  },
  {
    id: 'doc_text', name: '手输文本', source: 'text', chunkCount: 1,
    createdAt: '2026-11-01T04:00:00.000Z', original: null,
  },
  {
    id: 'doc_md', name: '使用说明.md', source: 'file', chunkCount: 2,
    createdAt: '2026-11-01T05:00:00.000Z',
    original: { name: '使用说明.md', ext: '.md', size: 1024, mime: 'text/markdown' },
  },
  {
    // 大模型通过工具写入的知识：没有 .md 后缀，但正文是 Markdown
    id: 'doc_llm', name: '会议纪要', source: 'text', chunkCount: 2,
    createdAt: '2026-11-01T06:00:00.000Z', original: null,
  },
];

const LLM_TEXT = '## 会议要点\n\n- 确认发布节奏\n- 补充测试用例\n\n详见 [周报](https://example.com/weekly)';

vi.mock('../../src/options/toolbox-shared.js', () => ({
  // 下载走原生 fetch，需要从 state 取代理地址与 token
  state: { agentBaseUrl: 'http://127.0.0.1:6767', agentToken: 'test-token' },
  agentApi: vi.fn(async (method, path) => {
    apiCalls.push({ method, path });
    if (method === 'GET' && path === '/api/rag/collections') {
      return { success: true, collections: [{ id: 'kb-1', name: '知识库一', documentCount: 3, chunkCount: 16 }] };
    }
    if (method === 'GET' && path === '/api/rag/collections/kb-1/documents') {
      return { success: true, documents: DOCS };
    }
    if (method === 'GET' && path === '/api/rag/collections/kb-1/documents/doc_file') {
      return {
        success: true,
        document: {
          ...DOCS[0], text: '报告正文前 200000 字', totalChars: 300000,
          viewLimit: 200000, truncated: true,
        },
      };
    }
    if (method === 'GET' && path === '/api/rag/collections/kb-1/documents/doc_text') {
      return {
        success: true,
        document: { ...DOCS[2], text: '手输的正文内容', totalChars: 7, viewLimit: 200000, truncated: false },
      };
    }
    if (method === 'GET' && path === '/api/rag/collections/kb-1/documents/doc_md') {
      return {
        success: true,
        document: { ...DOCS[3], text: MD_TEXT, totalChars: MD_TEXT.length, viewLimit: 200000, truncated: false },
      };
    }
    if (method === 'GET' && path === '/api/rag/collections/kb-1/documents/doc_llm') {
      return {
        success: true,
        document: { ...DOCS[4], text: LLM_TEXT, totalChars: LLM_TEXT.length, viewLimit: 200000, truncated: false },
      };
    }
    return { success: false, error: 'unexpected api call' };
  }),
  escapeHtml: (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
  showToast: (...args) => { toastCalls.push(args); },
  showCustomConfirm: vi.fn(async () => false),
}));

vi.mock('../../src/options/toolbox-rag.js', () => ({
  loadRagStatus: vi.fn(async () => ({ connected: true, ragAvailable: true, nodeVersion: 'v22.0.0' })),
  refreshRagSection: vi.fn(async () => {}),
  initRagEvents: noop,
  setRagAvailabilityChangeHandler: noop,
}));

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = { ragEnabled: true };
        if (typeof cb === 'function') {
          cb(result);
          return;
        }
        return Promise.resolve(result);
      },
      set: async () => {},
    },
    onChanged: { addListener: noop },
  },
};

const DOM = `
  <div id="knowledgeGate" style="display:none;"></div>
  <div id="knowledgeMain">
    <input type="text" id="kbSearchInput">
    <button id="kbSearchClear" type="button">✕</button>
    <div class="toolbox-filter-tabs">
      <button class="toolbox-filter-tab active" data-filter="all" data-target="kb" type="button">全部</button>
    </div>
    <button id="createKbBtn" type="button"></button>
    <div class="knowledge-list" id="knowledgeList"></div>
    <span id="knowledgeCount" style="display:none;"></span>
  </div>
`;

let anchorClicks = [];

beforeEach(async () => {
  vi.resetModules();
  apiCalls.length = 0;
  toastCalls.length = 0;
  fetchCalls.length = 0;
  anchorClicks = [];
  document.body.innerHTML = DOM;

  URL.createObjectURL = vi.fn(() => 'blob:mock-download');
  URL.revokeObjectURL = vi.fn();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  });
  window.HTMLAnchorElement.prototype.click = function click() {
    anchorClicks.push({ href: this.href, download: this.download });
  };
  globalThis.fetch = vi.fn(async (url, opts) => {
    fetchCalls.push({ url, opts });
    return new Response('original-bytes', {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        // 真实 agent 的响应头形态：ascii 回退名 + RFC 5987 原名
        'Content-Disposition': 'attachment; filename="report.pdf"; filename*=UTF-8\'\'%E5%AD%A3%E5%BA%A6%E6%8A%A5%E5%91%8A.pdf',
      },
    });
  });

  const mod = await import('../../src/options/knowledge-panel.js');
  mod.initKnowledgePanel();
  await mod.refreshKnowledgePanel();
  await vi.waitFor(() => expect(document.querySelectorAll('.kb-card')).toHaveLength(1));

  document.querySelector('.kb-card[data-kb-id="kb-1"] [data-action="docs"]').click();
  await vi.waitFor(() => expect(document.querySelectorAll('.kb-doc-row')).toHaveLength(5));
});

describe('文档列表：来源徽标与原件状态', () => {
  test('三类来源徽标 + 原件大小 + 无原件说明', () => {
    const fileRow = document.querySelector('.kb-doc-row[data-doc-id="doc_file"]');
    expect(fileRow.querySelector('.kb-doc-badge').textContent).toBe(t('knowledge.docSourceFile'));
    expect(fileRow.querySelector('.kb-doc-meta').textContent).toContain('2.0 MB');
    expect(fileRow.querySelector('[data-doc-download="original"]').disabled).toBe(false);

    const urlRow = document.querySelector('.kb-doc-row[data-doc-id="doc_url"]');
    expect(urlRow.querySelector('.kb-doc-badge').textContent).toBe(t('knowledge.docSourceUrl'));
    // 网页原件名与文档名不同时追加溯源信息
    expect(urlRow.querySelector('.kb-doc-meta').textContent).toContain('example.com-report.html');

    const textRow = document.querySelector('.kb-doc-row[data-doc-id="doc_text"]');
    expect(textRow.querySelector('.kb-doc-badge').textContent).toBe(t('knowledge.docSourceText'));
    const dlBtn = textRow.querySelector('[data-doc-download="original"]');
    expect(dlBtn.disabled).toBe(true);
    expect(dlBtn.title).toBe(t('knowledge.docNoOriginalText'));
  });

  test('免责：每行都有查看原文与删除动作', () => {
    for (const id of ['doc_file', 'doc_url', 'doc_text']) {
      const row = document.querySelector(`.kb-doc-row[data-doc-id="${id}"]`);
      expect(row.querySelector('[data-doc-view]')).toBeTruthy();
      expect(row.querySelector('[data-doc-delete]')).toBeTruthy();
    }
  });
});

describe('查看原文弹窗', () => {
  test('GET 详情 → 展示文本 + 截断提示 + 复制', async () => {
    document.querySelector('.kb-doc-row[data-doc-id="doc_file"] [data-doc-view]').click();

    await vi.waitFor(() => expect(document.querySelector('.kb-doc-textview')).toBeTruthy());
    expect(apiCalls.some((c) => c.method === 'GET' && c.path.endsWith('/documents/doc_file'))).toBe(true);

    const pre = document.querySelector('.kb-doc-textview');
    expect(pre.textContent).toBe('报告正文前 200000 字');
    expect(document.querySelector('.kb-doc-textnote').textContent)
      .toBe(t('knowledge.docViewTruncated', { limit: 200000, total: 300000 }));

    document.querySelector('[data-doc-copy]').click();
    await vi.waitFor(() => {
      expect(toastCalls.some(([msg]) => msg === t('knowledge.docViewCopied'))).toBe(true);
    });
  });

  test('短文本不显示截断提示', async () => {
    document.querySelector('.kb-doc-row[data-doc-id="doc_text"] [data-doc-view]').click();

    await vi.waitFor(() => expect(document.querySelector('.kb-doc-textview')).toBeTruthy());
    expect(document.querySelector('.kb-doc-textview').textContent).toBe('手输的正文内容');
    expect(document.querySelector('.kb-doc-textnote')).toBeNull();
  });

  test('Markdown 文档默认渲染预览，可切回源码', async () => {
    document.querySelector('.kb-doc-row[data-doc-id="doc_md"] [data-doc-view]').click();

    await vi.waitFor(() => expect(document.querySelector('.kb-doc-markdown')).toBeTruthy());
    expect(document.querySelector('.kb-doc-markdown h1').textContent).toBe('使用说明');
    expect(document.querySelector('.kb-doc-markdown strong').textContent).toBe('Markdown');
    expect(document.querySelector('.kb-doc-markdown pre code').textContent).toContain('console.log(1)');

    // 源码模式必须还原未渲染的 Markdown 原文
    document.querySelector('[data-doc-mode="source"]').click();
    expect(document.querySelector('.kb-doc-textview').textContent).toBe(MD_TEXT);
    expect(document.querySelector('[data-doc-mode="source"]').classList.contains('active')).toBe(true);

    document.querySelector('[data-doc-mode="preview"]').click();
    expect(document.querySelector('.kb-doc-markdown h1').textContent).toBe('使用说明');
  });

  test('无 .md 后缀但正文是 Markdown 的文档（大模型工具写入）自动识别并预览', async () => {
    document.querySelector('.kb-doc-row[data-doc-id="doc_llm"] [data-doc-view]').click();

    await vi.waitFor(() => expect(document.querySelector('.kb-doc-markdown')).toBeTruthy());
    expect(document.querySelector('.kb-doc-markdown h2').textContent).toBe('会议要点');
    expect(document.querySelectorAll('.kb-doc-markdown li')).toHaveLength(2);
    expect(document.querySelector('.kb-doc-markdown a').textContent).toBe('周报');
  });

  test('非 Markdown 文档默认源码，但保留手动切到预览的入口', async () => {
    document.querySelector('.kb-doc-row[data-doc-id="doc_file"] [data-doc-view]').click();

    await vi.waitFor(() => expect(document.querySelector('.kb-doc-textview')).toBeTruthy());
    // PDF 抽取正文不自动识别为 Markdown
    expect(document.querySelector('[data-doc-mode="source"]').classList.contains('active')).toBe(true);

    // 用户仍可强制预览
    document.querySelector('[data-doc-mode="preview"]').click();
    expect(document.querySelector('.kb-doc-markdown')?.textContent).toContain('报告正文前 200000 字');
  });
});

describe('下载原件', () => {
  test('带 Authorization 的 fetch + Content-Disposition 中文文件名', async () => {
    document.querySelector('.kb-doc-row[data-doc-id="doc_file"] [data-doc-download="original"]').click();

    await vi.waitFor(() => expect(fetchCalls).toHaveLength(1));
    const { url, opts } = fetchCalls[0];
    expect(url).toBe('http://127.0.0.1:6767/api/rag/collections/kb-1/documents/doc_file/download?kind=original');
    expect(opts.headers.Authorization).toBe('Bearer test-token');

    await vi.waitFor(() => expect(anchorClicks).toHaveLength(1));
    expect(anchorClicks[0].download).toBe('季度报告.pdf');
    expect(anchorClicks[0].href).toBe('blob:mock-download');
  });
});
