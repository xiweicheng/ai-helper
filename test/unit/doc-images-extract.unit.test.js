// @vitest-environment jsdom
// test/unit/doc-images-extract.unit.test.js - 浏览器端 docx/pdf 抠图单测（编码器全部注入假实现）
import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { extractDocxImagesFromFile, extractPdfImagesFromFile } from '../../src/side_panel/doc-images.js';

// —— docx fixture：与 agent Task 2 相同结构，用 JSZip 构造 File ——
function pngBytes(w, h) {
  const head = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(25);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(8, w); // 整体偏移 16 = head8 + len4 + 'IHDR'4
  dv.setUint32(12, h); // 整体偏移 20
  return new Blob([head, ihdr, new Uint8Array([1, 2, 3])]);
}
async function docxFile(images) {
  const zip = new JSZip();
  zip.file('word/document.xml', `<w:document>${images.map((i) => `<a:blip r:embed="${i.rid}"/>`).join('')}</w:document>`);
  zip.file('word/_rels/document.xml.rels', `<Relationships>${images.map((i) => `<Relationship Id="${i.rid}" Type="t/image" Target="media/${i.file}"/>`).join('')}</Relationships>`);
  images.forEach((i) => zip.file(`word/media/${i.file}`, pngBytes(i.w, i.h)));
  return new File([await zip.generateAsync({ type: 'blob' })], 'a.docx');
}

describe('extractDocxImagesFromFile', () => {
  it('按 r:embed 顺序输出 dataUrl 清单', async () => {
    const file = await docxFile([
      { rid: 'rId3', file: 'b.png', w: 40, h: 30 },
      { rid: 'rId2', file: 'a.png', w: 8, h: 8 },
    ]);
    const { images, truncated, skipped } = await extractDocxImagesFromFile(file);
    expect(truncated).toBe(0);
    expect(skipped).toBe(0);
    expect(images.map((i) => i.index)).toEqual([1, 2]);
    expect(images[0].width).toBe(40); // 跟随文档引用顺序，不是文件名顺序
    expect(images[0].mimeType).toBe('image/png');
    expect(images[0].dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(images[0].page).toBe(null);
    expect(images[0].kind).toBe('embedded');
  });

  it('超出 maxImages 截断计数', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ rid: `rId${i + 2}`, file: `i${i}.png`, w: 4, h: 4 }));
    const { images, truncated } = await extractDocxImagesFromFile(await docxFile(many), { maxImages: 3 });
    expect(images.length).toBe(3);
    expect(truncated).toBe(2);
  });

  it('非白名单扩展名计入 skipped', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document><a:blip r:embed="rId2"/></w:document>');
    zip.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId2" Type="t/image" Target="media/image1.wmf"/></Relationships>');
    zip.file('word/media/image1.wmf', new Blob([new Uint8Array([1])]));
    const file = new File([await zip.generateAsync({ type: 'blob' })], 'a.docx');
    const { images, skipped } = await extractDocxImagesFromFile(file);
    expect(images.length).toBe(0);
    expect(skipped).toBe(1);
  });
});

// —— pdf fake：vi.mock 提供静态形状，具体 doc 由每个用例经 state 注入 ——
const pdfState = vi.hoisted(() => ({ doc: null }));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  OPS: { paintImageXObject: 40, paintInlineImageXObject: 41 },
  getDocument: () => ({ promise: pdfState.doc }),
}));

/**
 * pages: [{ ops: [objName...], textLen, w, h }]
 * objs.get(name, cb) 按名字尾字符奇偶微调宽度，保证同页不同对象 hash 不同
 */
function pdfFixture({ pages }) {
  const doc = {
    numPages: pages.length,
    async getPage(i) {
      const p = pages[i - 1];
      return {
        async getOperatorList() {
          return { fnArray: p.ops.map(() => 40), argsArray: p.ops.map((n) => [n]) };
        },
        async getTextContent() {
          return { items: [{ str: 'x'.repeat(p.textLen) }] };
        },
        objs: {
          get(name, cb) {
            const seed = name.charCodeAt(name.length - 1) % 3;
            const w = p.w + seed;
            const h = p.h;
            cb({ data: new Uint8Array(w * h * 4).fill(7), width: w, height: h });
          },
        },
      };
    },
  };
  pdfState.doc = doc;
  const file = new File([new Uint8Array([1])], 'a.pdf');
  return { file };
}

describe('extractPdfImagesFromFile', () => {
  it('位图去重 + 序号连续 + page 记录 + kind=embedded', async () => {
    const { file } = pdfFixture({ pages: [{ ops: ['n1', 'n1', 'n2'], textLen: 500, w: 2, h: 2 }] });
    const encodeRgbaToPng = vi.fn(async ({ width, height }) => `data:image/png;base64,F${width}x${height}`);
    const { images } = await extractPdfImagesFromFile(file, {}, { encodeRgbaToPng, renderPageToJpeg: async () => ({ dataUrl: '', blank: true }) });
    expect(images.length).toBe(2); // n1 重复引用去重后只计一次
    expect(images.map((i) => i.index)).toEqual([1, 2]);
    expect(images.map((i) => i.page)).toEqual([1, 1]);
    expect(images[0].kind).toBe('embedded');
  });

  it('无内嵌位图且文本稀少 → 整页渲染 scanned-page', async () => {
    const { file } = pdfFixture({ pages: [{ ops: [], textLen: 10, w: 0, h: 0 }] });
    const renderPageToJpeg = vi.fn(async () => ({ dataUrl: 'data:image/jpeg;base64,SC', width: 600, height: 800 }));
    const { images } = await extractPdfImagesFromFile(file, {}, { encodeRgbaToPng: async () => 'data:,', renderPageToJpeg });
    expect(images.length).toBe(1);
    expect(images[0].kind).toBe('scanned-page');
    expect(images[0].mimeType).toBe('image/jpeg');
    expect(renderPageToJpeg).toHaveBeenCalledTimes(1);
  });

  it('渲染结果为空白页 → 不产图', async () => {
    const { file } = pdfFixture({ pages: [{ ops: [], textLen: 0, w: 0, h: 0 }] });
    const { images } = await extractPdfImagesFromFile(file, {}, {
      encodeRgbaToPng: async () => 'data:,',
      renderPageToJpeg: async () => ({ dataUrl: '', width: 0, height: 0, blank: true }),
    });
    expect(images.length).toBe(0);
  });

  it('文本充足的正常页不触发整页渲染', async () => {
    const { file } = pdfFixture({ pages: [{ ops: [], textLen: 300, w: 0, h: 0 }] });
    const renderPageToJpeg = vi.fn(async () => ({ dataUrl: 'data:image/jpeg;base64,X', width: 1, height: 1 }));
    const { images } = await extractPdfImagesFromFile(file, {}, { encodeRgbaToPng: async () => 'data:,', renderPageToJpeg });
    expect(images.length).toBe(0);
    expect(renderPageToJpeg).not.toHaveBeenCalled();
  });
});
