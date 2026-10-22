// test/unit/doc-images-describe.unit.test.js - 视觉转述/清单块/快照中转单测
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = {};
globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn((keys, cb) => { const out = {}; for (const k of [].concat(keys)) { if (store[k] !== undefined) out[k] = store[k]; } cb(out); }),
      set: vi.fn((obj, cb) => { Object.assign(store, obj); if (cb) cb(); return Promise.resolve(); }),
    },
  },
  runtime: { getURL: (p) => p },
};
globalThis.fetch = vi.fn();

const { describeImages, buildImageBlock, saveDocImageSnapshot, removeDocImageSnapshot, compressForVision, VISION_CONSTANTS } = await import('../../src/side_panel/doc-images.js');
const { setLanguage } = await import('../../src/shared/i18n.js');

beforeEach(() => {
  setLanguage('zh', false);
  Object.keys(store).forEach((k) => delete store[k]);
  fetch.mockReset();
});

describe('describeImages', () => {
  it('imageApiBase 留空回落 apiBase；modelName 回落生效', async () => {
    store.apiBase = 'https://base.example/v1';
    store.modelName = 'm1';
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '一张柱状图' } }] }) });
    const out = await describeImages([{ index: 1, dataUrl: 'data:image/png;base64,AAA' }], 2);
    expect(out[1]).toBe('一张柱状图');
    expect(fetch.mock.calls[0][0]).toBe('https://base.example/v1/chat/completions');
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('m1');
  });

  it('imageApiKey 优先生效（enc: 前缀解码）', async () => {
    store.imageApiBase = 'https://img.example/v1';
    store.imageApiKey = 'enc:' + btoa('sekret');
    store.imageModelName = 'vision-m';
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) });
    await describeImages([{ index: 1, dataUrl: 'data:,' }], 1);
    const headers = fetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer sekret');
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('vision-m');
  });

  it('单图 API 失败置 null 不抛出', async () => {
    store.apiBase = 'https://x.example/v1';
    store.apiKey = 'k';
    store.modelName = 'm';
    fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'err' });
    const out = await describeImages([{ index: 1, dataUrl: 'data:,' }], 2);
    expect(out[1]).toBeNull();
  });

  it('无 apiBase 时不调 fetch，全部置 null', async () => {
    const out = await describeImages([{ index: 1, dataUrl: 'data:,' }], 2);
    expect(fetch).not.toHaveBeenCalled();
    expect(out[1]).toBeNull();
  });

  it('超过 count 的图不转述', async () => {
    store.apiBase = 'https://x.example/v1';
    store.modelName = 'm';
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'd' } }] }) });
    const imgs = [{ index: 1, dataUrl: 'data:,' }, { index: 2, dataUrl: 'data:,' }, { index: 3, dataUrl: 'data:,' }];
    const out = await describeImages(imgs, VISION_CONSTANTS.DESCRIBE_LIMIT);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(out[3]).toBeUndefined();
  });
});

describe('compressForVision', () => {
  it('首次达标直接返回', async () => {
    const toJpeg = vi.fn(async () => ({ dataUrl: 'data:image/jpeg;base64,AAA' }));
    expect(await compressForVision('data:,x', { toJpeg })).toBe('data:image/jpeg;base64,AAA');
    expect(toJpeg).toHaveBeenCalledTimes(1);
    expect(toJpeg.mock.calls[0][1]).toBe(1024);
    expect(toJpeg.mock.calls[0][2]).toBe(0.65);
  });
  it('超限时降级重试，5 轮仍超返 null', async () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(400 * 1024);
    const toJpeg = vi.fn(async () => ({ dataUrl: big }));
    expect(await compressForVision('data:,x', { toJpeg })).toBeNull();
    expect(toJpeg).toHaveBeenCalledTimes(5);
    // 前三轮降 quality（最低到 0.2），第 4 轮起缩尺寸
    expect(toJpeg.mock.calls.map((c) => c[2])).toEqual([0.65, 0.5, 0.35, 0.2, 0.2]);
    expect(toJpeg.mock.calls[4][1]).toBe(768);
  });
  it('toJpeg 抛错返 null 不抛出', async () => {
    expect(await compressForVision('data:,x', { toJpeg: async () => { throw new Error('no canvas'); } })).toBeNull();
  });
});

describe('buildImageBlock', () => {
  it('混合已描述/未描述 + 工具用法行', () => {
    const block = buildImageBlock({ images: [{ index: 1, page: 3 }, { index: 2, page: 5 }], imageDescriptions: { 1: '架构图' } }, '报告.docx');
    expect(block).toContain('共 2 张，已描述 1 张');
    expect(block).toContain('〔图片1｜第3页〕架构图');
    expect(block).toContain('read_document_image(file="报告.docx", image=2)');
  });

  it('page=null（docx）不输出页码段；truncated 追加超限行', () => {
    const block = buildImageBlock({ images: [{ index: 1, page: null }], truncated: 3 }, 'a.docx');
    expect(block).not.toContain('第null页');
    expect(block).toContain('另有 3 张图未抽取');
  });

  it('xlsx 条目带 sheet/cell 时输出工作表定位段', () => {
    const block = buildImageBlock({ images: [{ index: 1, page: null, sheet: '汇总', cell: 'B3' }], imageDescriptions: { 1: '趋势图' } }, 'a.xlsx');
    expect(block).toContain('〔图片1｜工作表汇总!B3〕趋势图');
    expect(block).not.toContain('第null页');
  });

  it('无图返空串', () => {
    expect(buildImageBlock({ images: [] }, 'a.docx')).toBe('');
  });
});

describe('saveDocImageSnapshot / removeDocImageSnapshot', () => {
  it('agent 来源只存清单，local 来源存 dataUrl', async () => {
    await saveDocImageSnapshot('s1', [
      { status: 'done', name: 'a.docx', imageSource: 'agent', images: [{ index: 1, page: null, path: '/ws/_attachments/a/img-1.png' }] },
      { status: 'done', name: 'b.pdf', imageSource: 'local', images: [{ index: 1, page: 2, dataUrl: 'data:image/png;base64,AAAA' }] },
    ]);
    const snap = store._docImageSnapshot.s1;
    expect(snap.files[0].images[0].dataUrl).toBeUndefined();
    expect(snap.files[0].images[0].path).toBe('/ws/_attachments/a/img-1.png');
    expect(snap.files[1].images[0].dataUrl).toContain('base64');
  });

  it('本次无图 → 清除该 session 旧快照', async () => {
    store._docImageSnapshot = { s2: { updatedAt: 1, files: [] } };
    await saveDocImageSnapshot('s2', []);
    expect(store._docImageSnapshot.s2).toBeUndefined();
  });

  it('超 SNAPSHOT_BUDGET 从最旧 session 起淘汰，当前 session 保留', async () => {
    // 单张 dataUrl ≈ 2.4MB > 预算一半，两 session 合计超 4MB 预算
    const big = 'data:image/png;base64,' + 'A'.repeat(3200000);
    store._docImageSnapshot = { old: { updatedAt: 1, files: [{ name: 'o.pdf', imageSource: 'local', images: [{ index: 1, dataUrl: big }] }] } };
    await saveDocImageSnapshot('new1', [{ status: 'done', name: 'n.docx', imageSource: 'local', images: [{ index: 1, dataUrl: big }] }]);
    expect(store._docImageSnapshot.old).toBeUndefined();
    expect(store._docImageSnapshot.new1).toBeDefined();
    expect(store._docImageSnapshot.new1.files[0].images[0].dataUrl).toBeDefined();
  });

  it('仅剩当前 session 且仍超预算 → 剥除 dataUrl 保留清单', async () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(6400000); // ≈4.8MB 单 session 超预算
    await saveDocImageSnapshot('solo', [{ status: 'done', name: 'x.pdf', imageSource: 'local', images: [{ index: 1, page: 1, dataUrl: huge }] }]);
    const im = store._docImageSnapshot.solo.files[0].images[0];
    expect(im.dataUrl).toBeUndefined();
    expect(im.index).toBe(1);
    expect(im.page).toBe(1);
  });

  it('removeDocImageSnapshot 删除指定 session', async () => {
    store._docImageSnapshot = { s3: { updatedAt: 1, files: [] }, s4: { updatedAt: 1, files: [] } };
    await removeDocImageSnapshot('s3');
    expect(store._docImageSnapshot.s3).toBeUndefined();
    expect(store._docImageSnapshot.s4).toBeDefined();
  });
});
