// content-tools.e2e.spec.js - 真实浏览器下 content script 工具流程测试
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { getContentBundle, callTool } from './helpers/load-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureUrl = (name) => 'file://' + path.resolve(__dirname, 'fixtures', name);

let bundle;
test.beforeAll(async () => {
  bundle = await getContentBundle();
});

test.beforeEach(async ({ page }) => {
  // 每次导航前注入打包好的 content 工具模块，挂到 window.__tools
  await page.addInitScript({ content: bundle });
});

// ==================== query_elements → interact_element 完整链路 ====================

test.describe('query_elements → interact_element', () => {
  test('查询按钮并用 ref 点击', async ({ page }) => {
    await page.goto(fixtureUrl('form-page.html'));
    const result = await callTool(page, 'queryInteractiveElements', { filterByText: 'submit' });
    expect(result.success).toBe(true);
    expect(result.elements.length).toBeGreaterThan(0);
    const ref = result.elements[0].ref;

    const clickResult = await callTool(page, 'interactByRef', ref, 'click', { waitTime: 0, timeout: 0 });
    expect(clickResult.success).toBe(true);
    // ref 点击应直接触发 onclick，更新 #status
    expect(await page.textContent('#status')).toBe('submitted');
  });

  test('无效 ref 返回失败', async ({ page }) => {
    await page.goto(fixtureUrl('form-page.html'));
    const r = await callTool(page, 'interactByRef', 999, 'click', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(false);
  });
});

// ==================== fill_form 真实表单 ====================

test.describe('fill_form', () => {
  test('填充 text/select/checkbox/radio/contenteditable', async ({ page }) => {
    await page.goto(fixtureUrl('form-page.html'));
    const r = await callTool(page, 'fillForm', [
      { selector: '#username', value: 'alice', fieldType: 'text' },
      { selector: '#color', value: 'blue', fieldType: 'select' },
      { selector: '#agree', value: 'true', fieldType: 'checkbox' },
      { selector: '#plan-pro', value: 'pro', fieldType: 'radio' },
      { selector: '#editor', value: 'hello', fieldType: 'contenteditable' },
    ]);
    expect(r.success).toBe(true);
    expect(await page.inputValue('#username')).toBe('alice');
    expect(await page.inputValue('#color')).toBe('blue');
    expect(await page.isChecked('#agree')).toBe(true);
    expect(await page.isChecked('#plan-pro')).toBe(true);
    expect(await page.textContent('#editor')).toBe('hello');
  });
});

// ==================== select_dropdown ====================

test.describe('select_dropdown', () => {
  test('原生 select 选择', async ({ page }) => {
    await page.goto(fixtureUrl('form-page.html'));
    const r = await callTool(page, 'selectDropdown', '#color', 'Green');
    expect(r.success).toBe(true);
    expect(r.triggerTag).toBe('SELECT');
    expect(await page.inputValue('#color')).toBe('green');
  });

  test('未匹配选项返回可用列表', async ({ page }) => {
    await page.goto(fixtureUrl('form-page.html'));
    const r = await callTool(page, 'selectDropdown', '#color', 'Yellow');
    expect(r.success).toBe(false);
    expect(r.availableOptions).toContain('Red');
  });
});

// ==================== clickByText ====================

test.describe('clickByText', () => {
  test('点击文本对应按钮', async ({ page }) => {
    await page.goto(fixtureUrl('form-page.html'));
    const r = await callTool(page, 'clickByText', 'Cancel', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(r.matchedText).toBe('Cancel');
  });
});

// ==================== Shadow DOM 穿透 ====================

test.describe('Shadow DOM 穿透', () => {
  test('query_elements 查询 shadow 内按钮', async ({ page }) => {
    await page.goto(fixtureUrl('shadow-dom-page.html'));
    const r = await callTool(page, 'queryInteractiveElements', { filterByText: 'inner' });
    expect(r.success).toBe(true);
    expect(r.elements.length).toBeGreaterThan(0);
    expect(r.elements[0].text).toContain('Inner');
  });

  test('clickByText 点击 shadow 内按钮', async ({ page }) => {
    await page.goto(fixtureUrl('shadow-dom-page.html'));
    const r = await callTool(page, 'clickByText', 'Inner Button', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    // shadow 内按钮点击后设置 host 的 dataset.clicked
    expect(await page.getAttribute('#host', 'data-clicked')).toBe('1');
  });
});

// ==================== scroll_collect 无限滚动 ====================

test.describe('scroll_collect', () => {
  test('滚动并收集内容', async ({ page }) => {
    await page.goto(fixtureUrl('infinite-scroll-page.html'));
    const r = await callTool(page, 'scrollAndCollect', { scrollPixels: 300, maxScrolls: 5, pauseMs: 100 });
    expect(r.success).toBe(true);
    expect(r.contentLength).toBeGreaterThan(0);
    // 收集的内容应包含初始项
    expect(r.content).toContain('Item 1');
  });
});

// ==================== extract_data ====================

test.describe('extract_data', () => {
  test('提取链接', async ({ page }) => {
    await page.goto(fixtureUrl('form-page.html'));
    const r = await callTool(page, 'extractLinks', 'all');
    expect(r.success).toBe(true);
    expect(r.total).toBeGreaterThan(0);
  });

  test('提取表格为 JSON', async ({ page }) => {
    await page.goto(fixtureUrl('form-page.html'));
    const r = await callTool(page, 'pageToJson');
    expect(r.success).toBe(true);
    expect(r.counts.tables).toBe(1);
  });
});

// ==================== search_in_page ====================

test.describe('search_in_page', () => {
  test('regex 搜索', async ({ page }) => {
    await page.goto(fixtureUrl('form-page.html'));
    const r = await callTool(page, 'searchInPage', { query: 'Submit', mode: 'regex' });
    expect(r.success).toBe(true);
    expect(r.total).toBeGreaterThan(0);
  });
});

// ==================== iframe_content ====================

test.describe('iframe_content', () => {
  test('获取同源 iframe 内容', async ({ page }) => {
    await page.goto(fixtureUrl('iframe-page.html'));
    const r = await callTool(page, 'getIframeContent', 'iframe');
    expect(r.success).toBe(true);
    expect(r.total).toBe(1);
    // srcdoc 同源，应可访问
    expect(r.iframes[0].accessible).toBe(true);
    expect(r.iframes[0].textContent).toContain('iframe content');
  });
});
