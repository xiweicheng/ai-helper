// @vitest-environment jsdom
// 验证知识库文档批量上传的核心逻辑：
// 1) validateBatchFiles：数量上限（整批拒绝）、单个大小、扩展名三类校验
// 2) runBatchIngest：串行执行、失败继续、成功/分块/失败汇总计数
// 3) 导入弹窗 DOM：文件选择框支持 multiple、已选清单容器存在、超限时拒绝并提示
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { t } from '../../src/shared/i18n.js';

const noop = () => {};
const { apiCalls, toastCalls } = vi.hoisted(() => ({ apiCalls: [], toastCalls: [] }));

vi.mock('../../src/options/toolbox-shared.js', () => ({
  agentApi: vi.fn(async (method, path) => {
    apiCalls.push({ method, path });
    if (method === 'GET' && path === '/api/rag/collections') {
      return { success: true, collections: [{ id: 'kb-1', name: '知识库一', documentCount: 0, chunkCount: 0 }] };
    }
    if (method === 'GET' && path.endsWith('/ingest/status')) {
      return { success: true, progress: { phase: 'embedding', current: 1, total: 2 } };
    }
    if (method === 'POST' && path.endsWith('/ingest')) {
      return { success: true, name: 'doc', chunkCount: 3 };
    }
    return { success: false, error: 'unexpected api call' };
  }),
  escapeHtml: (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  showToast: (...args) => { toastCalls.push(args); },
  showCustomConfirm: vi.fn(async () => true)
}));

vi.mock('../../src/options/toolbox-rag.js', () => ({
  loadRagStatus: vi.fn(async () => ({ connected: true, ragAvailable: true, nodeVersion: 'v22.0.0' })),
  refreshRagSection: vi.fn(async () => {}),
  initRagEvents: noop,
  setRagAvailabilityChangeHandler: noop
}));

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = { ragEnabled: true };
        if (typeof cb === 'function') { cb(result); return; }
        return Promise.resolve(result);
      },
      set: async () => {}
    },
    onChanged: { addListener: noop }
  }
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

const KB_ACCEPT = '.txt,.md,.markdown,.pdf,.docx,.doc,.xlsx,.xls,.csv,.pptx,.html,.htm,.json,.rtf,.odt,.odp,.ods,.epub';
const MAX_COUNT = 20;
const MAX_SIZE = 50 * 1024 * 1024;
const mk = (name, size = 1000) => ({ name, size });

let mod;

beforeEach(async () => {
  vi.resetModules();
  apiCalls.length = 0;
  toastCalls.length = 0;
  document.body.innerHTML = DOM;
  mod = await import('../../src/options/knowledge-panel.js');
  mod.initKnowledgePanel();
  await mod.refreshKnowledgePanel();
  await vi.waitFor(() => expect(document.querySelectorAll('.kb-card')).toHaveLength(1));
});

describe('validateBatchFiles：数量 / 大小 / 扩展名', () => {
  test('数量正好等于上限通过，超过则整批拒绝为 tooMany', () => {
    const opts = { maxCount: MAX_COUNT, maxSize: MAX_SIZE, accept: KB_ACCEPT };
    const atLimit = Array.from({ length: MAX_COUNT }, (_, i) => mk(`f${i}.pdf`));
    expect(mod.validateBatchFiles(atLimit, opts).ok).toBe(true);

    const over = Array.from({ length: MAX_COUNT + 1 }, (_, i) => mk(`f${i}.pdf`));
    const res = mod.validateBatchFiles(over, opts);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('tooMany');
    expect(res.detail.max).toBe(MAX_COUNT);
  });

  test('任一文件超过单文件大小上限 → tooLarge 并报出文件名', () => {
    const res = mod.validateBatchFiles(
      [mk('ok.pdf'), mk('big.pdf', MAX_SIZE + 1)],
      { maxCount: MAX_COUNT, maxSize: MAX_SIZE, accept: KB_ACCEPT }
    );
    expect(res.reason).toBe('tooLarge');
    expect(res.detail.name).toBe('big.pdf');
  });

  test('扩展名不在白名单 → badType；空扩展名同样拒绝', () => {
    const opts = { maxCount: MAX_COUNT, maxSize: MAX_SIZE, accept: KB_ACCEPT };
    expect(mod.validateBatchFiles([mk('a.exe')], opts).reason).toBe('badType');
    expect(mod.validateBatchFiles([mk('noext')], opts).reason).toBe('badType');
    expect(mod.validateBatchFiles([mk('note.MD')], opts).ok).toBe(true); // 大小写不敏感
  });

  test('空列表视为通过（判空交由调用方）', () => {
    expect(mod.validateBatchFiles([], { maxCount: MAX_COUNT, maxSize: MAX_SIZE, accept: KB_ACCEPT }).ok).toBe(true);
  });
});

describe('runBatchIngest：串行、失败继续、汇总', () => {
  test('全部成功：successCount / totalChunks 累加，failures 为空', async () => {
    const files = [mk('a.pdf'), mk('b.pdf'), mk('c.pdf')];
    const order = [];
    const summary = await mod.runBatchIngest(
      files,
      async (f, i) => { order.push(f.name); return { chunkCount: (i + 1) * 2 }; },
      null
    );
    expect(order).toEqual(['a.pdf', 'b.pdf', 'c.pdf']); // 严格串行、顺序一致
    expect(summary.successCount).toBe(3);
    expect(summary.failCount).toBe(0);
    expect(summary.totalChunks).toBe(2 + 4 + 6);
    expect(summary.failures).toHaveLength(0);
  });

  test('中间文件失败：记录原因并继续处理后续文件', async () => {
    const files = [mk('a.pdf'), mk('bad.pdf'), mk('c.pdf')];
    const summary = await mod.runBatchIngest(files, async (f) => {
      if (f.name === 'bad.pdf') throw new Error('解析失败');
      return { chunkCount: 1 };
    });
    expect(summary.successCount).toBe(2);
    expect(summary.failCount).toBe(1);
    expect(summary.failures[0]).toEqual({ name: 'bad.pdf', error: '解析失败' });
  });

  test('onProgress 按 index 递增回调，携带 total', async () => {
    const seen = [];
    await mod.runBatchIngest([mk('a.pdf'), mk('b.pdf')], async () => ({ chunkCount: 1 }),
      ({ index, total }) => seen.push({ index, total }));
    expect(seen).toEqual([{ index: 0, total: 2 }, { index: 1, total: 2 }]);
  });
});

describe('导入弹窗：文件多选与批量校验接线', () => {
  const openDialog = () => {
    document.querySelector('.kb-card[data-kb-id="kb-1"] [data-action="ingest"]').click();
    return document.querySelector('.modal-overlay');
  };

  test('文件选择框支持 multiple 且存在已选清单容器', () => {
    const overlay = openDialog();
    expect(overlay).toBeTruthy();
    expect(overlay.querySelector('#kbFileInput').hasAttribute('multiple')).toBe(true);
    expect(overlay.querySelector('#kbSelectedFiles')).toBeTruthy();
    expect(overlay.querySelector('#kbSelectedFile')).toBeNull(); // 旧的单文件容器已移除
  });

  test('拖入超过上限的文件数量：整批拒绝并提示最大数，已选清单保持为空', async () => {
    const overlay = openDialog();
    const dropzone = overlay.querySelector('#kbDropzone');
    const files = Array.from({ length: MAX_COUNT + 1 }, (_, i) => mk(`f${i}.pdf`));
    const drop = new Event('drop');
    drop.preventDefault = noop;
    drop.dataTransfer = { files };
    dropzone.dispatchEvent(drop);

    await vi.waitFor(() => {
      expect(toastCalls.some(([msg]) => msg === t('knowledge.maxBatchFiles', { max: MAX_COUNT }))).toBe(true);
    });
    const list = overlay.querySelector('#kbSelectedFiles');
    expect(list.style.display).toBe('none');
    expect(list.children.length).toBe(0);
  });
});
