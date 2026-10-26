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
