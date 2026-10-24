// @vitest-environment jsdom
// test/unit/doc-images-extract.unit.test.js - 浏览器端 docx/pdf 抠图单测（编码器全部注入假实现）
import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { extractDocxImagesFromFile, extractPdfImagesFromFile, extractXlsxImagesFromFile } from '../../src/side_panel/doc-images.js';

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

// —— xlsx fixture：最小包骨架 workbook→rels→sheet→sheetRels→drawing→drawingRels→media ——
async function xlsxFile({ sheets, drawings }) {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', `<workbook><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="${s.rid}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships>${sheets.map((s) => `<Relationship Id="${s.rid}" Type="t/worksheet" Target="${s.target}"/>`).join('')}</Relationships>`);
  for (const s of sheets) {
    const rels = s.drawing
      ? `<Relationships><Relationship Id="rIdD1" Type="t/drawing" Target="${s.drawing}"/></Relationships>`
      : '<Relationships/>';
    zip.file(`xl/worksheets/_rels/${s.target.split('/').pop()}.rels`, rels);
  }
  for (const d of drawings) {
    zip.file(`xl/drawings/${d.file}`, `<xdr:wsDr>${d.anchors.join('')}</xdr:wsDr>`);
    zip.file(`xl/drawings/_rels/${d.file}.rels`, `<Relationships>${d.rels.map((r) => `<Relationship Id="${r.rid}" Type="t/image" Target="${r.target}"/>`).join('')}</Relationships>`);
    for (const r of d.rels) {
      const name = r.target.split('/').pop();
      zip.file(`xl/media/${name}`, pngBytes(r.w, r.h));
    }
  }
  return new File([await zip.generateAsync({ type: 'blob' })], 'a.xlsx');
}
const anchor = (rid, col, row) =>
  `<xdr:twoCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:row>${row}</xdr:row></xdr:from><xdr:pic><xdr:blipFill><a:blip r:embed="${rid}"/></xdr:blipFill></xdr:pic></xdr:twoCellAnchor>`;

describe('extractXlsxImagesFromFile', () => {
  it('按 sheet 顺序 + anchor 顺序输出，带工作表名与单元格定位', async () => {
    const file = await xlsxFile({
      sheets: [
        { name: '汇总', rid: 'rId1', target: 'worksheets/sheet1.xml', drawing: '../drawings/drawing1.xml' },
        { name: '明细', rid: 'rId2', target: 'worksheets/sheet2.xml', drawing: '../drawings/drawing2.xml' },
      ],
      drawings: [
        { file: 'drawing1.xml', anchors: [anchor('rId2', 1, 2), anchor('rId1', 0, 0)], rels: [{ rid: 'rId1', target: '../media/a.png', w: 8 }, { rid: 'rId2', target: '../media/b.png', w: 40 }].map((r) => ({ ...r, h: 30 })) },
        { file: 'drawing2.xml', anchors: [anchor('rId1', 3, 5)], rels: [{ rid: 'rId1', target: '../media/c.jpg', w: 20, h: 10 }] },
      ],
    });
    const { images, truncated, skipped } = await extractXlsxImagesFromFile(file);
    expect(truncated).toBe(0);
    expect(skipped).toBe(0);
    expect(images.map((i) => i.index)).toEqual([1, 2, 3]);
    expect(images[0].width).toBe(40); // drawing1 内按 anchor 顺序：rId2 在前
    expect(images[0].sheet).toBe('汇总');
    expect(images[0].cell).toBe('B3'); // col1 row2 → B3（0-based + 行号 1-based）
    expect(images[2].sheet).toBe('明细');
    expect(images[2].cell).toBe('D6');
    expect(images[2].mimeType).toBe('image/jpeg');
    expect(images[2].dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('同一张图多锚点去重（同 docx seen 语义）', async () => {
    const file = await xlsxFile({
      sheets: [{ name: 'S1', rid: 'rId1', target: 'worksheets/sheet1.xml', drawing: '../drawings/drawing1.xml' }],
      drawings: [{ file: 'drawing1.xml', anchors: [anchor('rId1', 0, 0), anchor('rId1', 2, 2)], rels: [{ rid: 'rId1', target: '../media/a.png', w: 8, h: 8 }] }],
    });
    const { images } = await extractXlsxImagesFromFile(file);
    expect(images.length).toBe(1);
  });

  it('非白名单扩展名计入 skipped；无 drawing 的 sheet 跳过', async () => {
    const file = await xlsxFile({
      sheets: [
        { name: 'S1', rid: 'rId1', target: 'worksheets/sheet1.xml', drawing: '../drawings/drawing1.xml' },
        { name: 'S2', rid: 'rId2', target: 'worksheets/sheet2.xml', drawing: null },
      ],
      drawings: [{ file: 'drawing1.xml', anchors: [anchor('rId1', 0, 0)], rels: [{ rid: 'rId1', target: '../media/emf1.emf', w: 1, h: 1 }] }],
    });
    const { images, skipped } = await extractXlsxImagesFromFile(file);
    expect(images.length).toBe(0);
    expect(skipped).toBe(1);
  });

  it('超出 maxImages 截断计数', async () => {
    const file = await xlsxFile({
      sheets: [{ name: 'S1', rid: 'rId1', target: 'worksheets/sheet1.xml', drawing: '../drawings/drawing1.xml' }],
      drawings: [{
        file: 'drawing1.xml',
        anchors: [0, 1, 2, 3, 4].map((i) => anchor(`rId${i + 1}`, i, 0)),
        rels: [0, 1, 2, 3, 4].map((i) => ({ rid: `rId${i + 1}`, target: `../media/m${i}.png`, w: 4, h: 4 })),
      }],
    });
    const { images, truncated } = await extractXlsxImagesFromFile(file, { maxImages: 3 });
    expect(images.length).toBe(3);
    expect(truncated).toBe(2);
  });

  it('非 zip 内容（如老 .xls）安全返回空清单', async () => {
    const file = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3])], 'old.xls');
    const res = await extractXlsxImagesFromFile(file);
    expect(res.images).toEqual([]);
  });

  // 回归：OOXML 允许关系 Target 写绝对形式（部分导出器如此），旧拼接一律加 'xl/' 前缀
  // 得到 xl/xl/... → zip.file 命中不了，含图 xlsx 静默抽出 0 张且无计数线索
  it('rels 绝对 Target（/xl/...）同样命中，不误拼 xl/xl 前缀', async () => {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="S1" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="t/worksheet" Target="/xl/worksheets/sheet1.xml"/></Relationships>');
    zip.file('xl/worksheets/_rels/sheet1.xml.rels', '<Relationships><Relationship Id="rIdD1" Type="t/drawing" Target="/xl/drawings/drawing1.xml"/></Relationships>');
    zip.file('xl/drawings/drawing1.xml', `<xdr:wsDr>${anchor('rId1', 0, 0)}</xdr:wsDr>`);
    zip.file('xl/drawings/_rels/drawing1.xml.rels', '<Relationships><Relationship Id="rId1" Type="t/image" Target="/xl/media/a.png"/></Relationships>');
    zip.file('xl/media/a.png', pngBytes(40, 30));
    const file = new File([await zip.generateAsync({ type: 'blob' })], 'abs.xlsx');
    const { images, skipped } = await extractXlsxImagesFromFile(file);
    expect(images.length).toBe(1);
    expect(images[0].width).toBe(40);
    expect(images[0].sheet).toBe('S1');
    expect(skipped).toBe(0);
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
