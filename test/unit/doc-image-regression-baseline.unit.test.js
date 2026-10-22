// test/unit/doc-image-regression-baseline.unit.test.js - 文档图片识别回归基线
// 两条逐字节不变断言：开关关闭 / 零图时 buildFileContentText() 输出与图片链路接线前的旧格式完全一致
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/side_panel/doc-images.js', () => ({
  extractDocxImagesFromFile: vi.fn(async () => ({ images: [], truncated: 0, skipped: 0 })),
  extractPdfImagesFromFile: vi.fn(async () => ({ images: [], truncated: 0, skipped: 0 })),
  compressForVision: vi.fn(async (u) => u),
  describeImages: vi.fn(async () => ({})),
  // 真实实现同款门控：无 images 字段必须返回空串（逐字节不变的最后一道）
  buildImageBlock: vi.fn((f) => ((f.images && f.images.length) ? '\n\n[BLOCK]' : '')),
  VISION_CONSTANTS: { DESCRIBE_LIMIT: 2, MAX_IMAGES: 20, MAX_RAW_BYTES: 5 * 1024 * 1024, MAX_IMAGE_BYTES: 200 * 1024 },
}));

const { runImagePipeline, buildFileContentText } = await import('../../src/side_panel/file-extract.js');
const state = (await import('../../src/side_panel/state.js')).default;
const { setLanguage } = await import('../../src/shared/i18n.js');
const { buildImageBlock } = await import('../../src/side_panel/doc-images.js');

beforeEach(() => {
  setLanguage('zh', false);
  state.attachedFiles = [];
  state.enableImageInput = true;
  vi.mocked(buildImageBlock).mockClear();
});

// 接线前的旧输出格式（硬编码基线，勿由被测函数自身生成）
const OLD_BROWSER_OUT = '\n\n[文件内容: a.docx]\nBODY';
const OLD_AGENT_OUT = '\n\n[工作目录文件: /ws/a.docx (原名: a.docx)]';

describe('回归基线 1：enableImageInput=false 时输出逐字节不变', () => {
  it('runImagePipeline 早退不触碰 fileEntry，注入文本等于旧格式', async () => {
    state.enableImageInput = false;
    const entry = { name: 'a.docx', status: 'done', text: 'BODY' };
    await runImagePipeline(entry, new File([''], 'a.docx'), 'docx', false);
    expect(entry.images).toBeUndefined();
    expect(entry.imageStatus).toBeUndefined();
    state.attachedFiles = [entry];
    expect(buildFileContentText()).toBe(OLD_BROWSER_OUT);
  });
});

describe('回归基线 2：抽取结果为 0 图时输出逐字符等于旧逻辑产物', () => {
  it('浏览器路径：described 状态但零图 → 无清单块', async () => {
    const entry = { name: 'a.docx', status: 'done', text: 'BODY' };
    await runImagePipeline(entry, new File([''], 'a.docx'), 'docx', false);
    expect(entry.images).toEqual([]);
    state.attachedFiles = [entry];
    expect(buildFileContentText()).toBe(OLD_BROWSER_OUT);
  });

  it('Agent 路径：零图 → 标记行后无附加内容', async () => {
    const entry = { name: 'a.docx', status: 'done', agentPath: '/ws/a.docx', text: '' };
    await runImagePipeline(entry, new File([''], 'a.docx'), 'docx', false);
    state.attachedFiles = [entry];
    expect(buildFileContentText()).toBe(OLD_AGENT_OUT);
  });

  it('混合附件（txt + 零图文档）整体格式不变', async () => {
    const docEntry = { name: 'a.docx', status: 'done', text: 'BODY' };
    await runImagePipeline(docEntry, new File([''], 'a.docx'), 'docx', false);
    state.attachedFiles = [
      { name: 'c.txt', status: 'done', text: 'PLAIN' },
      docEntry,
    ];
    expect(buildFileContentText()).toBe(
      '\n\n[文件内容: c.txt]\nPLAIN\n\n---\n\n[文件内容: a.docx]\nBODY'
    );
  });
});
