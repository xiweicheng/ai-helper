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
    expect(result.content).toContain('[ref ');
    const ref = Number(result.content.match(/\[ref (\d+)\]/)[1]);

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

  test('type 输入链路', async ({ page }) => {
    await page.goto(fixtureUrl('form-page.html'));
    const snapshot = await callTool(page, 'queryInteractiveElements', { filterByText: 'username' });
    expect(snapshot.content).toContain('[ref ');
    const ref = Number(snapshot.content.match(/\[ref (\d+)\]/)[1]);
    const r = await callTool(page, 'interactByRef', ref, 'type', { value: 'bob', waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(await page.inputValue('#username')).toBe('bob');
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
    expect(r.content).toContain('[ref ');
    expect(r.content).toContain('Inner');
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

// ==================== query_elements 分页 ====================

test.describe('query_elements 分页', () => {
  test('分页翻页、hasMore 字段与跨页 ref 稳定性', async ({ page }) => {
    await page.goto(fixtureUrl('overlay-paging-page.html'));
    const p1 = await callTool(page, 'queryInteractiveElements', { maxResults: 4, page: 1 });
    expect(p1.page).toBe(1);
    expect(p1.hasMore).toBe(true);
    expect(p1.totalPages).toBeGreaterThan(1);

    const p2 = await callTool(page, 'queryInteractiveElements', { maxResults: 4, page: 2 });
    expect(p2.page).toBe(2);

    // 稳定编号：b1 的 ref 在两次翻页后仍可点击
    const full = await callTool(page, 'queryInteractiveElements', {});
    const b1Line = full.content.split('\n').find(l => l.includes('"Alpha"'));
    const b1Ref = Number(b1Line.match(/\[ref (\d+)\]/)[1]);
    const clk = await callTool(page, 'interactByRef', b1Ref, 'click', { waitTime: 0, timeout: 0 });
    expect(clk.success).toBe(true);
    expect(await page.getAttribute('#b1', 'data-clicked')).toBe('1');
  });

  test('越界 page 返回提示不报错', async ({ page }) => {
    await page.goto(fixtureUrl('overlay-paging-page.html'));
    const r = await callTool(page, 'queryInteractiveElements', { maxResults: 4, page: 99 });
    expect(r.success).toBe(true);
    expect(r.hasMore).toBe(false);
    expect(r.content).toContain('超出范围');
  });
});

// ==================== query_elements 叠加层提升 ====================

test.describe('query_elements 叠加层提升', () => {
  test('dialog[open] 提升 + 主体去重 + ref 操作弹窗按钮', async ({ page }) => {
    await page.goto(fixtureUrl('overlay-paging-page.html'));
    const r = await callTool(page, 'queryInteractiveElements', {});
    const lines = r.content.split('\n');
    const overlayIdx = lines.indexOf('[打开层]');
    const bodyIdx = lines.indexOf('[页面主体]');
    expect(overlayIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(overlayIdx);

    const okIdx = lines.findIndex(l => l.includes('"Dialog OK"'));
    expect(okIdx).toBeGreaterThan(overlayIdx);
    expect(okIdx).toBeLessThan(bodyIdx);
    // 去重：弹窗按钮只出现一次
    expect(lines.filter(l => l.includes('"Dialog OK"')).length).toBe(1);

    const okRef = Number(lines[okIdx].match(/\[ref (\d+)\]/)[1]);
    const clk = await callTool(page, 'interactByRef', okRef, 'click', { waitTime: 0, timeout: 0 });
    expect(clk.success).toBe(true);
    expect(await page.getAttribute('#dlg-ok', 'data-clicked')).toBe('1');
  });

  test('popover 打开时提升到 [打开层]', async ({ page }) => {
    await page.goto(fixtureUrl('overlay-paging-page.html'));
    await page.click('#pop-trigger');
    await page.waitForFunction(() => {
      const p = document.getElementById('pop1');
      return p && p.matches(':popover-open');
    });
    const r = await callTool(page, 'queryInteractiveElements', {});
    const lines = r.content.split('\n');
    const overlayIdx = lines.indexOf('[打开层]');
    const actionIdx = lines.findIndex(l => l.includes('"Popover Action"'));
    expect(overlayIdx).toBeGreaterThan(-1);
    expect(actionIdx).toBeGreaterThan(overlayIdx);
    expect(actionIdx).toBeLessThan(lines.indexOf('[页面主体]'));
  });
});
