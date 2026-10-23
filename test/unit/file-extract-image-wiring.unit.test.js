// test/unit/file-extract-image-wiring.unit.test.js - 附件处理图片链路接线单测
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/side_panel/doc-images.js', () => ({
  extractDocxImagesFromFile: vi.fn(async () => ({ images: [{ index: 1, page: null, dataUrl: 'data:x' }], truncated: 0, skipped: 0 })),
  extractPdfImagesFromFile: vi.fn(async () => ({ images: [{ index: 1, page: 2, dataUrl: 'data:x' }], truncated: 0, skipped: 0 })),
  extractXlsxImagesFromFile: vi.fn(async () => ({ images: [{ index: 1, page: null, sheet: 'Sheet1', cell: 'B3', dataUrl: 'data:x' }], truncated: 0, skipped: 0 })),
  compressForVision: vi.fn(async (u) => u),
  describeImages: vi.fn(async (ims) => (ims.length ? { [ims[0].index]: '描述' } : {})),
  buildImageBlock: vi.fn((f) => (f.images && f.images.length ? '\n\n[BLOCK]' : '')),
  VISION_CONSTANTS: { DESCRIBE_LIMIT: 2, MAX_IMAGES: 20, MAX_RAW_BYTES: 5 * 1024 * 1024, MAX_IMAGE_BYTES: 200 * 1024 },
}));

const { runImagePipeline, buildFileContentText, getAgentConnectionInfo } = await import('../../src/side_panel/file-extract.js');
const state = (await import('../../src/side_panel/state.js')).default;
const { setLanguage } = await import('../../src/shared/i18n.js');
const { extractDocxImagesFromFile, extractXlsxImagesFromFile, describeImages } = await import('../../src/side_panel/doc-images.js');

beforeEach(() => {
  setLanguage('zh', false);
  state.attachedFiles = [];
  state.enableImageInput = true;
  vi.unstubAllGlobals();
});

// 真实 chrome.storage.local.get 同时支持回调与 Promise，stub 需两者均可
function stubChromeAgents(pairedAgents, activeAgentId) {
  vi.stubGlobal('chrome', {
    storage: { local: { get: (k, cb) => { const out = { pairedAgents, activeAgentId }; if (cb) cb(out); return Promise.resolve(out); } } },
  });
}

describe('runImagePipeline', () => {
  it('开关关闭时不做任何事', async () => {
    state.enableImageInput = false;
    const entry = { name: 'a.docx', status: 'done' };
    await runImagePipeline(entry, new File([''], 'a.docx'), 'docx', false);
    expect(entry.images).toBeUndefined();
    expect(extractDocxImagesFromFile).not.toHaveBeenCalled();
  });

  it('非 docx/pdf 类别不处理', async () => {
    const entry = { name: 'a.txt', status: 'done' };
    await runImagePipeline(entry, new File([''], 'a.txt'), 'text', false);
    expect(entry.images).toBeUndefined();
  });

  it('浏览器模式 docx：source=local + 转述 + imageStatus=described', async () => {
    const entry = { name: 'a.docx', status: 'done' };
    await runImagePipeline(entry, new File([''], 'a.docx'), 'docx', false);
    expect(entry.imageSource).toBe('local');
    expect(entry.images.length).toBe(1);
    expect(entry.imageDescriptions[1]).toBe('描述');
    expect(entry.imageStatus).toBe('described');
  });

  it('Agent 模式 pdf：本地抽取 source=local', async () => {
    const entry = { name: 'a.pdf', status: 'done', agentPath: '/ws/a.pdf' };
    await runImagePipeline(entry, new File([''], 'a.pdf'), 'pdf', true);
    expect(entry.imageSource).toBe('local');
  });

  it('xlsx：走本地抽取（Agent 端点仅 docx，不进 agent 分支）', async () => {
    const entry = { name: 'a.xlsx', status: 'done', agentPath: '/ws/a.xlsx' };
    await runImagePipeline(entry, new File([''], 'a.xlsx'), 'xlsx', true);
    expect(extractXlsxImagesFromFile).toHaveBeenCalled();
    expect(entry.imageSource).toBe('local');
    expect(entry.images[0].sheet).toBe('Sheet1');
    expect(entry.imageStatus).toBe('described');
  });

  it('Agent 模式 docx：调端点+下载+转述 source=agent', async () => {
    stubChromeAgents([{ id: 'a1', url: 'http://127.0.0.1:18910', token: 'TK' }], 'a1');
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/api/documents/extract-images')) {
        return { ok: true, json: async () => ({ success: true, dir: '/d', truncated: 0, skipped: 0, images: [{ index: 1, page: null, path: '/d/img-1.png', mimeType: 'image/png', bytes: 10, width: 8, height: 8, kind: 'embedded' }] }) };
      }
      if (String(url).includes('/api/fs/download')) {
        return { ok: true, json: async () => ({ success: true, type: 'file', content: 'QUFB', mimeType: 'image/png' }) };
      }
      throw new Error('unexpected ' + url);
    }));
    const entry = { name: 'a.docx', status: 'done', agentPath: '/ws/a.docx' };
    await runImagePipeline(entry, new File([''], 'a.docx'), 'docx', true);
    expect(entry.imageSource).toBe('agent');
    expect(entry.images[0].path).toContain('img-1.png');
    expect(entry.images[0].dataUrl).toBe('data:image/png;base64,QUFB'); // 下载→压缩链路走通
    expect(entry.imageDescriptions[1]).toBe('描述');
    expect(entry.imageStatus).toBe('described');
  });

  it('Agent 端点失败仅降级本地抽取（仍不抛出）', async () => {
    stubChromeAgents([{ id: 'a1', url: 'http://127.0.0.1:18910', token: 'TK' }], 'a1');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('agent offline'); }));
    const entry = { name: 'a.docx', status: 'done', agentPath: '/ws/a.docx' };
    await runImagePipeline(entry, new File([''], 'a.docx'), 'docx', true);
    // Agent 抽取失败：降级为浏览器本地抽取
    expect(entry.imageSource).toBe('local');
    expect(entry.imageStatus).toBe('described');
  });

  it('抽取异常降级 imageStatus=error 不抛出', async () => {
    extractDocxImagesFromFile.mockRejectedValueOnce(new Error('corrupt'));
    const entry = { name: 'a.docx', status: 'done' };
    await runImagePipeline(entry, new File([''], 'a.docx'), 'docx', false);
    expect(entry.imageStatus).toBe('error');
  });

  it('传入 onEach 增量写入 imageDescriptions（发送不等全部转述完）', async () => {
    let captured;
    describeImages.mockImplementationOnce(async (ims, cnt, onEach) => { captured = onEach; return {}; });
    const entry = { name: 'a.docx', status: 'done' };
    await runImagePipeline(entry, new File([''], 'a.docx'), 'docx', false);
    expect(typeof captured).toBe('function');
    captured(3, '半程描述'); // 模拟某张先完成
    expect(entry.imageDescriptions[3]).toBe('半程描述');
  });
});

describe('getAgentConnectionInfo', () => {
  it('未配对返 null', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: (k, cb) => { if (cb) cb({}); return Promise.resolve({}); } } } });
    expect(await getAgentConnectionInfo()).toBeNull();
  });
  it('配对则返回 url+token（token 解码）', async () => {
    stubChromeAgents([{ id: 'x', url: 'http://h:1', token: 'enc:' + btoa('plain') }], 'x');
    const info = await getAgentConnectionInfo();
    expect(info.url).toBe('http://h:1');
    expect(info.token).toBe('plain');
  });
});

describe('buildFileContentText 图片块追加', () => {
  it('有图文件在标记后追加块；无图逐字节不变', () => {
    state.attachedFiles = [
      { name: 'b.pdf', status: 'done', text: 'BODY', images: [{ index: 1, page: 1 }] },
      { name: 'c.txt', status: 'done', text: 'PLAIN' },
    ];
    const out = buildFileContentText();
    expect(out).toContain('[文件内容: b.pdf]\nBODY');
    expect(out).toContain('[BLOCK]');
    expect(out.indexOf('[BLOCK]')).toBeGreaterThan(out.indexOf('BODY'));
    // c.txt 段落内不含块
    expect(out.split('---')[1]).not.toContain('[BLOCK]');
  });

  it('零图时输出与旧格式一致（回归保护）', () => {
    state.attachedFiles = [{ name: 'c.txt', status: 'done', text: 'PLAIN' }];
    expect(buildFileContentText()).toBe('\n\n[文件内容: c.txt]\nPLAIN');
  });
});
