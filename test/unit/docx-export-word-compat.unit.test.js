// @vitest-environment jsdom
// Word 兼容性回归：导出物必须是微软 Word 能打开的标准 OOXML
// 背景：有序列表曾引用未声明的 numbering reference，docx 打包后留下
// `{default-0}` 这样的未解析 numId 占位符（非整数且指向不存在的 num 定义），
// 微软 Word 判定文件损坏拒绝打开，而 WPS/LibreOffice 容错能打开。
import { describe, test, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';

const noop = () => {};

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        if (typeof cb === 'function') cb(result);
        else return Promise.resolve(result);
      },
      set: noop,
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: () => Promise.resolve({}),
    connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
    onMessage: { addListener: noop, removeListener: noop },
    getContexts: noop,
  },
  tabs: {
    query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
    remove: noop, reload: noop, goBack: noop, goForward: noop,
    captureVisibleTab: noop, onUpdated: { addListener: noop }, onActivated: { addListener: noop },
  },
  scripting: { executeScript: noop },
  downloads: { download: noop },
};

let parseMarkdownToDocxChildren;
let createDocxDocument;
let Packer;

beforeAll(async () => {
  const mod = await import('../../src/side_panel/chat-export.js');
  parseMarkdownToDocxChildren = mod.parseMarkdownToDocxChildren;
  createDocxDocument = mod.createDocxDocument;
  Packer = (await import('docx')).Packer;
});

/** 打包为 docx 并解出关键 XML 部件 */
async function packToParts(markdown) {
  const children = await parseMarkdownToDocxChildren(markdown);
  const buffer = await Packer.toBuffer(createDocxDocument(children));
  const zip = await JSZip.loadAsync(buffer);
  return {
    documentXml: await zip.file('word/document.xml').async('string'),
    numberingXml: await zip.file('word/numbering.xml').async('string'),
    contentTypes: await zip.file('[Content_Types].xml').async('string'),
  };
}

const MARKDOWN_WITH_ORDERED_LIST = [
  '## 一、降本点',
  '',
  '1. 第一项',
  '2. 第二项',
  '',
  '- 无序项 A',
  '- 无序项 B',
].join('\n');

describe('Word 导出 - OOXML 合法性（Word 严格模式可打开）', () => {
  test('有序列表的 numId 已解析为整数，不残留占位符', async () => {
    const { documentXml } = await packToParts(MARKDOWN_WITH_ORDERED_LIST);
    expect(documentXml).not.toMatch(/\{[a-z0-9-]+\}/i);
    const numIds = [...documentXml.matchAll(/<w:numId w:val="([^"]*)"\/>/g)].map((m) => m[1]);
    expect(numIds.length).toBeGreaterThan(0);
    numIds.forEach((id) => expect(id).toMatch(/^\d+$/));
  });

  test('document.xml 引用的每个 numId 都在 numbering.xml 中定义', async () => {
    const { documentXml, numberingXml } = await packToParts(MARKDOWN_WITH_ORDERED_LIST);
    const used = new Set([...documentXml.matchAll(/<w:numId w:val="([^"]*)"\/>/g)].map((m) => m[1]));
    const defined = new Set([...numberingXml.matchAll(/<w:num w:numId="([^"]*)"/g)].map((m) => m[1]));
    const missing = [...used].filter((id) => !defined.has(id));
    expect(missing).toEqual([]);
  });

  test('有序列表使用 decimal 编号格式', async () => {
    const { numberingXml } = await packToParts(MARKDOWN_WITH_ORDERED_LIST);
    expect(numberingXml).toContain('<w:numFmt w:val="decimal"/>');
  });

  test('标题 + 表格 + 代码块 + 链接混合内容同样不残留占位符', async () => {
    const md = [
      '### 标题 💰',
      '',
      '正文含 **粗体** 与 [链接](https://example.com/a?b=1&c=2)。',
      '',
      '1. 步骤一',
      '',
      '| 列 A | 列 B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '```js',
      'const a = 1;',
      '```',
    ].join('\n');
    const { documentXml, numberingXml } = await packToParts(md);
    expect(documentXml).not.toMatch(/\{[a-z0-9-]+\}/i);
    expect(numberingXml).toContain('decimal');
  });
});

describe('Word 导出 - XML 良构性（文本清洗）', () => {
  const ILLEGAL_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

  test('正文含 XML 非法控制字符时被剔除，document.xml 仍为良构 XML', async () => {
    const dirty = [
      '控制字符：' + String.fromCharCode(11) + String.fromCharCode(12) + String.fromCharCode(7),
      '',
      '正常段落保留',
    ].join('\n');
    const { documentXml } = await packToParts(dirty);
    expect(ILLEGAL_XML.test(documentXml)).toBe(false);
    const parsed = new DOMParser().parseFromString(documentXml, 'application/xml');
    expect(parsed.getElementsByTagName('parsererror').length).toBe(0);
    expect(documentXml).toContain('正常段落保留');
  });

  test('零宽字符与 emoji 组合不被误伤', async () => {
    const { documentXml } = await packToParts('零宽：\u200B 表情：👨‍👩‍👧‍👦 ⚠️');
    expect(documentXml).toContain('\u200B');
    expect(documentXml).toContain('👨‍👩‍👧‍👦');
  });

  test('sanitizeDocxText 直接可用的边界行为', async () => {
    const { sanitizeDocxText } = await import('../../src/side_panel/chat-export.js');
    expect(sanitizeDocxText('a\u0000b')).toBe('ab');
    expect(sanitizeDocxText('')).toBe('');
    expect(sanitizeDocxText(null)).toBe(null);
    expect(sanitizeDocxText('tab\tok')).toBe('tab\tok');
  });
});

describe('Word 导出 - 图片 docPr id 唯一', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  test('多张图片的 wp:docPr id 在文档内唯一且为整数', async () => {
    const md = ['![a](' + PNG + ')', '', '![b](' + PNG + ')', '', '![c](' + PNG + ')'].join('\n');
    const { documentXml } = await packToParts(md);
    const ids = [...documentXml.matchAll(/<wp:docPr id="([^"]*)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(3);
    ids.forEach((id) => expect(id).toMatch(/^\d+$/));
    expect(new Set(ids).size).toBe(3);
  });
});

describe('Word 导出 - 图片格式白名单（未声明 content type 会让 Word 拒开）', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const WEBP = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

  /** 打包并列出所有 part，返回 media 扩展名与 [Content_Types].xml */
  async function packToEntries(markdown) {
    const children = await parseMarkdownToDocxChildren(markdown);
    const buffer = await Packer.toBuffer(createDocxDocument(children));
    const zip = await JSZip.loadAsync(buffer);
    // 目录条目（以 / 结尾）不是 part，过滤掉
    const names = Object.keys(zip.files).filter((n) => !n.endsWith('/'));
    const contentTypes = await zip.file('[Content_Types].xml').async('string');
    const declared = new Set(
      [...contentTypes.matchAll(/Extension="([^"]*)"/g)].map((m) => m[1].toLowerCase())
    );
    return {
      names,
      declared,
      documentXml: await zip.file('word/document.xml').async('string'),
    };
  }

  test('webp 图片不被嵌入，退化为文字占位', async () => {
    const { names, declared, documentXml } = await packToEntries('![图](' + WEBP + ')');
    const media = names.filter((n) => n.startsWith('word/media/'));
    expect(media).toEqual([]);
    // 每个媒体 part 的扩展名都必须有 content type 声明
    names
      .filter((n) => n.startsWith('word/media/'))
      .forEach((n) => expect(declared.has(n.split('.').pop().toLowerCase())).toBe(true));
    expect(documentXml.length).toBeGreaterThan(0);
  });

  test('png 与 webp 混排：png 正常嵌入，webp 不产生非法 part', async () => {
    const md = ['![ok](' + PNG + ')', '', '![bad](' + WEBP + ')'].join('\n');
    const { names, declared } = await packToEntries(md);
    const media = names.filter((n) => n.startsWith('word/media/'));
    expect(media.length).toBe(1);
    media.forEach((n) => expect(declared.has(n.split('.').pop().toLowerCase())).toBe(true));
  });

  test('isDocxEmbeddableImageType 只放行 docx 声明过的格式', async () => {
    const { isDocxEmbeddableImageType } = await import('../../src/side_panel/chat-export.js');
    ['png', 'PNG', 'jpg', 'jpeg', 'gif', 'bmp'].forEach((t) => {
      expect(isDocxEmbeddableImageType(t)).toBe(true);
    });
    ['webp', 'avif', 'heic', 'svg', '', null, undefined].forEach((t) => {
      expect(isDocxEmbeddableImageType(t)).toBe(false);
    });
  });
});

describe('Word 导出 - 内容保真（换行 / emoji / 列宽）', () => {
  test('引用块内的换行写成 w:br，不会被 Word 折叠成一行', async () => {
    const md = ['> 引用第一行', '> 引用第二行'].join('\n');
    const { documentXml } = await packToParts(md);
    expect(documentXml).toContain('<w:br/>');
    expect(documentXml).toContain('引用第一行');
    expect(documentXml).toContain('引用第二行');
  });

  test('国旗 emoji 作为整体保留，不被拆成两个 run', async () => {
    const { documentXml } = await packToParts('国旗 🇨🇳 与地区');
    expect(documentXml).toContain('🇨🇳');
    // 拆开时会写成两个 w:t（🇨 与 🇳）
    expect(documentXml).not.toMatch(/<w:t[^>]*>🇨<\/w:t>/);
    expect(documentXml).not.toMatch(/<w:t[^>]*>🇳<\/w:t>/);
  });

  test('表格列宽百分比不超过两位小数', async () => {
    const md = [
      '| a | b | c | d | e | f |',
      '| --- | --- | --- | --- | --- | --- |',
      '| 1 | 2 | 3 | 4 | 5 | 6 |',
    ].join('\n');
    const { documentXml } = await packToParts(md);
    const pcts = [...documentXml.matchAll(/w:type="pct" w:w="([^"]*)"/g)].map((m) => m[1]);
    expect(pcts.length).toBeGreaterThan(0);
    pcts.forEach((v) => expect(v).toMatch(/^\d+(\.\d{1,2})?%$/));
  });
});
