// @vitest-environment jsdom
// page-extract 单元测试：元数据/链接/表单/图片/Markdown/搜索（jsdom 环境）
import { describe, test, expect, beforeEach } from 'vitest';
import {
  extractMetadata,
  extractLinks,
  extractForms,
  extractImages,
  getIframeContent,
  pageToMarkdown,
  pageToJson,
  searchInPage,
} from '../../../src/content/page-extract.js';

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('extractMetadata - 元数据提取', () => {
  test('提取 title 和 meta', () => {
    document.head.innerHTML = '<title>Test Page</title><meta name="description" content="desc">';
    document.title = 'Test Page';
    const r = extractMetadata();
    expect(r.success).toBe(true);
    expect(r.data.title).toBe('Test Page');
    expect(r.data.description).toBe('desc');
  });

  test('提取 og: 标签', () => {
    document.head.innerHTML = '<meta property="og:title" content="OG Title"><meta property="og:image" content="img.png">';
    const r = extractMetadata();
    expect(r.data.ogTitle).toBe('OG Title');
    expect(r.data.ogImage).toBe('img.png');
  });

  test('提取 JSON-LD 结构化数据', () => {
    document.head.innerHTML = '<script type="application/ld+json">{"@type":"Article","headline":"Hi"}</script>';
    const r = extractMetadata();
    expect(r.data.jsonLd).toBeDefined();
    expect(r.data.jsonLd[0].headline).toBe('Hi');
  });

  test('无 meta 时字段为 null', () => {
    document.head.innerHTML = '<title>Empty</title>';
    document.title = 'Empty';
    const r = extractMetadata();
    expect(r.data.title).toBe('Empty');
    expect(r.data.description).toBeNull();
  });
});

describe('extractLinks - 链接提取', () => {
  test('all 模式返回有效链接，排除 javascript:', () => {
    document.body.innerHTML = `
      <a href="http://example.com/a">A</a>
      <a href="http://example.com/b">B</a>
      <a href="http://example.com/c">C</a>
      <a href="javascript:void(0)">JS</a>
    `;
    const r = extractLinks('all');
    expect(r.success).toBe(true);
    expect(r.total).toBe(3);
  });

  test('external 过滤返回外部链接', () => {
    // about:blank 的 hostname 为空，所有绝对 URL 都算 external
    document.body.innerHTML = '<a href="http://example.com/a">A</a>';
    const r = extractLinks('external');
    expect(r.total).toBe(1);
  });

  test('includeImages=true 包含图片链接', () => {
    document.body.innerHTML = `
      <a href="http://example.com/a">A</a>
      <img src="http://example.com/img.png" alt="img">
    `;
    const r = extractLinks('all', true);
    const images = r.links.filter(l => l.type === 'image');
    expect(images.length).toBe(1);
  });
});

describe('extractForms - 表单提取', () => {
  test('提取 input/textarea/select 字段', () => {
    document.body.innerHTML = `
      <form id="f1">
        <input name="user" type="text" placeholder="user">
        <textarea name="bio"></textarea>
        <select name="city"><option value="a">A</option></select>
      </form>
    `;
    const r = extractForms();
    expect(r.success).toBe(true);
    expect(r.total).toBe(1);
    const form = r.forms[0];
    expect(form.formId).toBe('f1');
    expect(form.fields.length).toBe(3);
    const tags = form.fields.map(f => f.tag);
    expect(tags).toContain('input');
    expect(tags).toContain('textarea');
    expect(tags).toContain('select');
  });

  test('formSelector 限定单个表单', () => {
    document.body.innerHTML = `
      <form id="f1"><input name="a"></form>
      <form id="f2"><input name="b"></form>
    `;
    const r = extractForms('#f2');
    expect(r.total).toBe(1);
    expect(r.forms[0].formId).toBe('f2');
  });
});

describe('extractImages - 图片提取', () => {
  test('minWidth=0 返回所有图片', () => {
    document.body.innerHTML = `
      <img src="http://example.com/a.png" alt="A">
      <img src="http://example.com/b.png" alt="B">
    `;
    const r = extractImages({ minWidth: 0, minHeight: 0 });
    expect(r.success).toBe(true);
    expect(r.total).toBe(2);
  });

  test('minWidth 过滤掉 naturalWidth=0 的图（jsdom 未加载图片）', () => {
    document.body.innerHTML = '<img src="http://example.com/a.png" alt="A">';
    const r = extractImages({ minWidth: 100 });
    expect(r.total).toBe(0);
  });

  test('去重：相同 src 只返回一个', () => {
    document.body.innerHTML = `
      <img src="http://example.com/dup.png">
      <img src="http://example.com/dup.png">
    `;
    const r = extractImages({ minWidth: 0, minHeight: 0 });
    expect(r.total).toBe(1);
  });
});

describe('getIframeContent - iframe 内容', () => {
  test('返回 iframe 信息（jsdom 默认不可访问内容）', () => {
    document.body.innerHTML = '<iframe id="f" src="about:blank"></iframe>';
    const r = getIframeContent('iframe');
    expect(r.success).toBe(true);
    expect(r.total).toBe(1);
    expect(r.iframes[0].url).toBe('about:blank');
  });
});

describe('pageToMarkdown - 页面转 Markdown', () => {
  test('转换标题、段落、列表', () => {
    document.body.innerHTML = '<h1>Title</h1><p>Para</p><ul><li>a</li><li>b</li></ul>';
    const r = pageToMarkdown();
    expect(r.success).toBe(true);
    expect(r.markdown).toContain('# Title');
    expect(r.markdown).toContain('Para');
    expect(r.markdown).toContain('- a');
    expect(r.markdown).toContain('- b');
  });
});

describe('pageToJson - 页面结构化', () => {
  test('提取表格和列表', () => {
    document.body.innerHTML = `
      <table><tr><th>H</th></tr><tr><td>1</td></tr></table>
      <ul><li>x</li></ul>
    `;
    const r = pageToJson();
    expect(r.success).toBe(true);
    expect(r.counts.tables).toBe(1);
    expect(r.counts.lists).toBe(1);
  });
});

describe('searchInPage - 页面搜索', () => {
  test('regex 模式返回匹配（不依赖 window.find）', () => {
    document.body.innerHTML = '<p>hello world hello again</p>';
    const r = searchInPage({ query: 'hello', mode: 'regex' });
    expect(r.success).toBe(true);
    expect(r.mode).toBe('regex');
  });

  test('缺少 query 返回失败', () => {
    const r = searchInPage({ mode: 'regex' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('搜索关键词');
  });
});
