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

const { describeImages, buildImageBlock, buildPreviewStatusText, buildPreviewCompactText, saveDocImageSnapshot, removeDocImageSnapshot, compressForVision, VISION_CONSTANTS, CHAT_IMAGE_FILE, normalizeChatImageSnapshot, buildChatImageHint, stripChatImageHint } = await import('../../src/side_panel/doc-images.js');
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

  it('并发转述：两个请求在任一返回前都已发出；onEach 逐张回调', async () => {
    store.apiBase = 'https://x.example/v1';
    store.modelName = 'm';
    const pending = [];
    fetch.mockImplementation(() => new Promise((resolve) => {
      pending.push((content) => resolve({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) }));
    }));
    const imgs = [{ index: 1, dataUrl: 'data:,' }, { index: 2, dataUrl: 'data:,' }];
    const seen = [];
    const p = describeImages(imgs, 2, (idx) => seen.push(idx));
    await new Promise((r) => setTimeout(r, 0)); // 让 getVisionConfig 与并发发起完成
    expect(pending.length).toBe(2); // 串行则此处只有 1
    pending[1]('B'); pending[0]('A'); // 乱序完成
    const out = await p;
    expect(out[1]).toBe('A');
    expect(out[2]).toBe('B');
    expect(seen).toContain(1);
    expect(seen).toContain(2);
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
    expect(block).toContain('read_image(file="报告.docx", image=2)');
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

describe('buildPreviewStatusText', () => {
  it('imageStatus=error → 抽取失败文案', () => {
    expect(buildPreviewStatusText({ imageStatus: 'error', images: [{ index: 1 }] })).toBe('📷 图片抽取失败');
  });

  it('有未描述且可深读的图 → 完整文案带可深读段（无 📷 前缀）', () => {
    const images = Array.from({ length: 20 }, (_, i) => ({ index: i + 1, dataUrl: 'data:x' }));
    expect(buildPreviewStatusText({ images, imageDescriptions: { 1: 'a', 2: 'b' } })).toBe('已描述 2/20 · 可深读 18');
  });

  it('全部已描述 → 不追加可深读段', () => {
    const images = [{ index: 1, dataUrl: 'data:x' }];
    expect(buildPreviewStatusText({ images, imageDescriptions: { 1: 'a' } })).toBe('已描述 1/1');
  });

  it('overLimit 且未描述 → 不可深读，不计入', () => {
    const images = [{ index: 1, dataUrl: 'data:x' }, { index: 2, overLimit: true }];
    expect(buildPreviewStatusText({ images, imageDescriptions: { 1: 'a' } })).toBe('已描述 1/2');
  });

  it('英文文案', () => {
    setLanguage('en', false);
    const images = [{ index: 1, dataUrl: 'data:x' }, { index: 2, dataUrl: 'data:x' }];
    expect(buildPreviewStatusText({ images, imageDescriptions: { 1: 'a' } })).toBe('described 1/2 · 1 deep-readable');
  });
});

describe('buildPreviewCompactText', () => {
  it('error → 失败文案', () => {
    expect(buildPreviewCompactText({ imageStatus: 'error', images: [{ index: 1 }] })).toBe('📷 图片抽取失败');
  });

  it('有可深读 → 📷 描述/总 · 可深读数', () => {
    const images = Array.from({ length: 20 }, (_, i) => ({ index: i + 1, dataUrl: 'data:x' }));
    expect(buildPreviewCompactText({ images, imageDescriptions: { 1: 'a', 2: 'b' } })).toBe('📷 2/20 · 18');
  });

  it('agent 来源：未描述但有落盘 path 也算可深读', () => {
    const images = [{ index: 1, dataUrl: 'data:x' }, { index: 2, path: '/d/img-2.png' }];
    expect(buildPreviewCompactText({ images, imageDescriptions: { 1: 'a' } })).toBe('📷 1/2 · 1');
  });

  it('无可深读 → 仅 📷 描述/总（不追加尾数）', () => {
    const images = [{ index: 1, dataUrl: 'data:x' }];
    expect(buildPreviewCompactText({ images, imageDescriptions: { 1: 'a' } })).toBe('📷 1/1');
  });

  it('英文与中文同形（数字不依赖语言）', () => {
    setLanguage('en', false);
    const images = [{ index: 1, dataUrl: 'data:x' }, { index: 2, dataUrl: 'data:x' }];
    expect(buildPreviewCompactText({ images, imageDescriptions: { 1: 'a' } })).toBe('📷 1/2 · 1');
  });
});


describe('对话贴图快照（chat-images 伪文件）', () => {
  it('按位置编号写入伪文件，优先压缩图（原图 base64 会撞预算）', async () => {
    await saveDocImageSnapshot('c1', [], [
      { originalUrl: 'data:image/png;base64,ORIG1', compressedUrl: 'data:image/jpeg;base64,C1' },
      { originalUrl: 'data:image/png;base64,ORIG2' },
    ]);
    const files = store._docImageSnapshot.c1.files;
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe(CHAT_IMAGE_FILE);
    expect(files[0].name).toBe('chat-images');
    expect(files[0].imageSource).toBe('local');
    expect(files[0].images[0]).toEqual({ index: 1, dataUrl: 'data:image/jpeg;base64,C1' });
    expect(files[0].images[1]).toEqual({ index: 2, dataUrl: 'data:image/png;base64,ORIG2' });
  });

  it('文档图与贴图共存：伪文件排在文档之后，互不覆盖', async () => {
    await saveDocImageSnapshot('c2',
      [{ status: 'done', name: 'a.docx', imageSource: 'local', images: [{ index: 1, dataUrl: 'data:image/png;base64,D' }] }],
      [{ compressedUrl: 'data:image/jpeg;base64,C1' }]);
    expect(store._docImageSnapshot.c2.files.map((f) => f.name)).toEqual(['a.docx', 'chat-images']);
  });

  it('位置即序号：无图源的贴图项只跳过、不重排（序号必须与消息里第几个一致）', async () => {
    const items = normalizeChatImageSnapshot([{}, { compressedUrl: 'data:image/jpeg;base64,C9' }]);
    expect(items).toEqual([{ index: 2, dataUrl: 'data:image/jpeg;base64,C9' }]);
  });

  it('超过上限只保留前 N 张，序号连续且与消息顺序一致', async () => {
    const many = Array.from({ length: VISION_CONSTANTS.MAX_CHAT_IMAGE_SNAPSHOT + 3 }, (_, i) => ({ compressedUrl: `data:image/jpeg;base64,C${i}` }));
    await saveDocImageSnapshot('c4', [], many);
    const images = store._docImageSnapshot.c4.files[0].images;
    expect(images).toHaveLength(VISION_CONSTANTS.MAX_CHAT_IMAGE_SNAPSHOT);
    expect(images[images.length - 1].index).toBe(VISION_CONSTANTS.MAX_CHAT_IMAGE_SNAPSHOT);
  });

  it('既无文档图也无贴图 → 清掉该 session（不留下空快照）', async () => {
    store._docImageSnapshot = { c5: { updatedAt: 1, files: [] } };
    await saveDocImageSnapshot('c5', [], []);
    expect(store._docImageSnapshot.c5).toBeUndefined();
  });
});

describe('buildChatImageHint / stripChatImageHint', () => {
  it('没有贴图就不产出线索（纯文字消息不多一行噪声）', () => {
    expect(buildChatImageHint(0)).toBe('');
    expect(buildChatImageHint(undefined)).toBe('');
  });

  it('线索含伪文件名与序号范围，且以换行开头贴在上一条内容后', () => {
    const hint = buildChatImageHint(3);
    expect(hint.startsWith('\n')).toBe(true);
    expect(hint).toContain('chat-images');
    expect(hint).toContain('1~3');
  });

  it('中英线索都能剥干净，正文一字不动', () => {
    const body = '把按钮改成圆角';
    for (const lang of ['zh', 'en']) {
      setLanguage(lang, false);
      expect(stripChatImageHint(body + buildChatImageHint(2))).toBe(body);
      expect(stripChatImageHint(body)).toBe(body);
      expect(stripChatImageHint(null)).toBe(null);
    }
  });
});
