// @vitest-environment jsdom
// Word 导出解析器测试：验证标题/正文段落结构正确、emoji 单独指定字体、标题紧贴内容不丢行
import { describe, test, expect, beforeAll } from 'vitest';

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
    sendMessage: (m) => Promise.resolve({}),
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
let parseInlineMarkdown;

beforeAll(async () => {
  const mod = await import('../../src/side_panel/chat-export.js');
  parseMarkdownToDocxChildren = mod.parseMarkdownToDocxChildren;
  parseInlineMarkdown = mod.parseInlineMarkdown;
});

// 将 docx 元素序列化为 XML JSON 字符串，用于结构断言
function xmlOf(node) {
  return JSON.stringify(node.prepForXml({ file: {}, viewWrapper: {}, stack: [] }));
}

describe('Word 导出 - 段落结构（标题与正文不再合并）', () => {
  test('标题后的正文独立成段，不并入标题段落', async () => {
    const children = await parseMarkdownToDocxChildren(
      '### 💰 真实降本点\n\ntoken8341 的优势只在自托管开源权重模型上。'
    );
    expect(children.length).toBe(2);

    const titleXml = xmlOf(children[0]);
    expect(titleXml).toContain('Heading3');
    expect(titleXml).not.toContain('token8341'); // 正文不能混入标题

    const bodyXml = xmlOf(children[1]);
    expect(bodyXml).toContain('token8341');
    expect(bodyXml).not.toContain('pStyle'); // 正文不能带标题样式
  });

  test('多个空行分隔的普通段落互不合并', async () => {
    const children = await parseMarkdownToDocxChildren('第一段内容。\n\n第二段内容。\n\n第三段内容。');
    expect(children.length).toBe(3);
    expect(xmlOf(children[0])).toContain('第一段内容');
    expect(xmlOf(children[1])).toContain('第二段内容');
    expect(xmlOf(children[2])).toContain('第三段内容');
  });

  test('用户截图完整场景：两个 emoji 标题 + 正文 + 表格', async () => {
    const md = [
      '### 💰 真实降本点',
      '',
      'token8341 的优势只在自托管开源权重模型上，8 卡机 6kW。',
      '',
      '### ⚠️ 一个值得警惕的细节',
      '',
      '两处页面名单互相矛盾：',
      '',
      '| 页面 | 列举 |',
      '| --- | --- |',
      '| /zh/pricing | 中卫 |',
    ].join('\n');
    const children = await parseMarkdownToDocxChildren(md);
    // 标题1、正文1、标题2、正文2、表格、空段 = 6 个顶层元素
    expect(children.length).toBe(6);
    expect(xmlOf(children[0])).toContain('Heading3');
    expect(xmlOf(children[0])).toContain('💰');
    expect(xmlOf(children[1])).toContain('token8341');
    expect(xmlOf(children[2])).toContain('Heading3');
    expect(xmlOf(children[3])).toContain('矛盾');
  });

  test('标题行后紧贴内容（单换行）不再丢行', async () => {
    const children = await parseMarkdownToDocxChildren('### 标题\n正文行紧跟其后');
    expect(children.length).toBe(2);
    expect(xmlOf(children[0])).toContain('Heading3');
    expect(xmlOf(children[1])).toContain('正文行紧跟其后');
  });
});

describe('Word 导出 - emoji 字体处理', () => {
  test('emoji 拆分为独立 run 并指定系统 emoji 字体', () => {
    const runs = parseInlineMarkdown('💰 真实降本点');
    expect(runs.length).toBe(2);
    const emojiXml = xmlOf(runs[0]);
    expect(emojiXml).toContain('Emoji'); // Apple Color Emoji / Segoe UI Emoji
    expect(emojiXml).toContain('💰');
    const textXml = xmlOf(runs[1]);
    expect(textXml).not.toContain('Emoji');
    expect(textXml).toContain('真实降本点');
  });

  test('带变体选择符的 emoji（⚠️）整体拆分', () => {
    const runs = parseInlineMarkdown('⚠️ 一个值得警惕的细节');
    expect(runs.length).toBe(2);
    expect(xmlOf(runs[0])).toContain('Emoji');
    expect(xmlOf(runs[0])).toContain('⚠️');
  });

  test('emoji 位于标题时同样指定 emoji 字体', async () => {
    const children = await parseMarkdownToDocxChildren('### 💰 真实降本点');
    const titleXml = xmlOf(children[0]);
    expect(titleXml).toContain('Heading3');
    expect(titleXml).toContain('Emoji');
  });

  test('正文中的 emoji 与行内粗体 emoji 均被处理', async () => {
    const children = await parseMarkdownToDocxChildren('提示：**⚠️ 注意**风险');
    const bodyXml = xmlOf(children[0]);
    expect(bodyXml).toContain('Emoji');
    expect(bodyXml).toContain('w:b');
  });

  test('无标记的普通文本不产生多余 run', () => {
    const runs = parseInlineMarkdown('普通纯文本内容');
    expect(runs.length).toBe(1);
    expect(xmlOf(runs[0])).not.toContain('Emoji');
  });
});

describe('Word 导出 - 标题样式贴近页面', () => {
  test('标题段落带浅灰底边框（与页面 h1~h3 一致）', async () => {
    const children = await parseMarkdownToDocxChildren('### 标题');
    const xml = xmlOf(children[0]);
    expect(xml).toContain('pBdr');
    expect(xml).toContain('EAECEF');
  });
});
