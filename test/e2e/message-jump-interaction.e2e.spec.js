// message-jump-interaction.e2e.spec.js - 用真鼠标/真键盘驱动消息跳转把手的交互路径（方案文档 §6 缺口）
//
// 与 message-jump.e2e.spec.js 的分工：那个文件只把 utils.js 打进页面验证纯逻辑与静态渲染；
// 本文件把真实的接线模块 message-jump-nav.js（连同 i18n / utils）打成 NavKit，调用
// initMessageJumpNav() 后，用 Playwright 的真实 hover/click/键盘事件驱动：
//   A1 键盘可达（Tab 聚焦把手展开、列表内 ↑/↓ 移动焦点）
//   A3 边界反馈（到头再跳时按钮进入 blocked 抖动态）
//   B6 搜索过滤（真实输入 → 命中子集、编号仍是全局组序）
//   钉住 / 移出保持 / Esc 清搜索再退钉住
// 面板内容由真实的 renderQuestionListHtml 生成，不手写副本。
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

let bundle;

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: [
        "export { initMessageJumpNav } from './src/side_panel/message-jump-nav.js';",
        "export { buildMessageJumpGroups } from './src/side_panel/utils.js';",
      ].join('\n'),
      resolveDir: ROOT,
      sourcefile: 'nav-entry.js',
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    globalName: 'NavKit',
    write: false,
    target: 'es2020',
    platform: 'browser',
  });
  bundle = result.outputFiles[0].text;
});

/**
 * 完整的把手接线页面：chatContainer + 热区 + ▲▼ 按钮 + 问题列表面板，
 * 加载后调用 initMessageJumpNav()，并把全局 Esc 接到返回 API（复刻 index.js 的委托）。
 */
function navPageHtml(questions) {
  const themeCss = fs.readFileSync(path.resolve(ROOT, 'src/shared/theme.css'), 'utf-8');
  const panelCss = fs.readFileSync(path.resolve(ROOT, 'src/side_panel/styles.css'), 'utf-8');
  const list = questions || ['第一条提问', '第二条稍微长一点的提问用于验证两行截断与滚动行为', '第三条提问'];
  const messages = list
    .map(
      (q, i) =>
        `<div class="message user" data-message-id="u${i}" data-timestamp="2000-01-0${i + 1}T09:0${i}:00" style="height:60px; flex:none">${q}</div>` +
        `<div class="message assistant" data-message-id="a${i}" style="height:320px; flex:none">回答 ${i + 1}</div>`
    )
    .join('');
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>${themeCss}</style><style>${panelCss}</style></head>
<body>
  <div class="chat-container" id="chatContainer" style="height:420px; overflow-y:auto;">${messages}</div>
  <div class="chat-nav-hotzone" id="chatNavHotzone" role="button" tabindex="0" aria-pressed="false"></div>
  <div class="chat-nav-buttons" id="chatNavButtons">
    <button class="chat-nav-btn" id="chatNavUp"></button>
    <button class="chat-nav-btn" id="chatNavDown"></button>
  </div>
  <div class="chat-nav-question-panel" id="chatNavQuestionPanel"></div>
  <script>${bundle}</script>
  <script>
    window.__nav = NavKit.initMessageJumpNav();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.__nav.handleEscape();
    });
  </script>
</body></html>`;
}

/** 挂载接线并把焦点放到把手上（触发 focus → 展开），返回后面板已 expanded */
async function expandByHover(page, questions) {
  await page.setContent(navPageHtml(questions));
  await page.hover('#chatNavHotzone');
  await page.waitForSelector('#chatNavQuestionPanel.expanded');
}

test('悬停把手展开列表：真实 mouseenter 生成条目并可见', async ({ page }) => {
  await expandByHover(page);
  const items = await page.$$('#chatNavQuestionPanel .chat-nav-question-item');
  expect(items.length).toBe(3);
  const vis = await page.$eval('#chatNavQuestionPanel', (el) => getComputedStyle(el).visibility);
  expect(vis).toBe('visible');
});

test('仅鼠标移出会自动收起；钉住后移出保持展开（收起只跟鼠标走）', async ({ page }) => {
  // 未钉住：只 hover（不点击、不留键盘焦点），移出后延时收起
  await expandByHover(page);
  await page.mouse.move(600, 6);
  await page.waitForTimeout(450);
  expect(await page.$eval('#chatNavQuestionPanel', (el) => el.classList.contains('expanded'))).toBe(false);

  // 重新展开并点击把手钉住（点击会把焦点留在把手内，正是钉住/键盘态不收起的设计）
  await page.hover('#chatNavHotzone');
  await page.waitForSelector('#chatNavQuestionPanel.expanded');
  await page.click('#chatNavHotzone');
  const pinned = await page.$eval('#chatNavHotzone', (el) => el.classList.contains('pinned') && el.getAttribute('aria-pressed') === 'true');
  expect(pinned).toBe(true);
  await page.mouse.move(600, 6);
  await page.waitForTimeout(450);
  expect(await page.$eval('#chatNavQuestionPanel', (el) => el.classList.contains('expanded'))).toBe(true);
});

test('键盘可达：Tab 聚焦把手即展开，列表内 ↓ 用真键盘移动焦点', async ({ page }) => {
  await page.setContent(navPageHtml());
  // 真键盘：焦点落到可聚焦的把手（tabindex=0）触发 focus 展开
  await page.focus('#chatNavHotzone');
  await page.waitForSelector('#chatNavQuestionPanel.expanded');
  // 把焦点放进第一个条目，再按方向键（keydown 冒泡到面板处理器）
  await page.focus('#chatNavQuestionPanel .chat-nav-question-item');
  await page.keyboard.press('ArrowDown');
  const activeIdx = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#chatNavQuestionPanel .chat-nav-question-item')];
    return items.indexOf(document.activeElement);
  });
  expect(activeIdx).toBe(1);
  await page.keyboard.press('End');
  const lastIdx = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#chatNavQuestionPanel .chat-nav-question-item')];
    return items.indexOf(document.activeElement);
  });
  expect(lastIdx).toBe(2);
});

test('搜索过滤：真实输入命中子集，条目编号仍是全局组序', async ({ page }) => {
  // 7 条 ≥ NAV_SEARCH_MIN_GROUPS 才会渲染搜索框
  const seven = Array.from({ length: 7 }, (_, i) => `第${i}个问题`);
  await expandByHover(page, seven);
  await page.waitForSelector('.chat-nav-question-search');
  await page.type('.chat-nav-question-search', '第5');
  const state = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#chatNavQuestionPanel .chat-nav-question-item')];
    return {
      count: items.length,
      messageIds: items.map((it) => it.dataset.messageId),
      idx: items.map((it) => it.querySelector('.idx').textContent),
      focusedIsSearch: document.activeElement.classList.contains('chat-nav-question-search'),
    };
  });
  expect(state.count).toBe(1);
  expect(state.messageIds).toEqual(['u5']);
  expect(state.idx).toEqual(['6']); // 全局第 6 组（下标 5）
  expect(state.focusedIsSearch).toBe(true); // 重建后焦点找回输入框
});

test('中文输入法：组合期间不销毁输入框，上屏后才过滤', async ({ page }) => {
  const seven = Array.from({ length: 7 }, (_, i) => `第${i}个问题`);
  await expandByHover(page, seven);
  await page.waitForSelector('.chat-nav-question-search');
  const res = await page.evaluate(() => {
    const input = document.querySelector('.chat-nav-question-search');
    input.__marker = 'alive'; // 打标记：一旦 innerHTML 重建，新节点不会带此标记
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = '第5';
    // 模拟拼音上屏前的 input（isComposing=true）：此时不得重建列表
    input.dispatchEvent(new InputEvent('input', { isComposing: true, bubbles: true }));
    const during = {
      alive: document.querySelector('.chat-nav-question-search').__marker === 'alive',
      items: document.querySelectorAll('#chatNavQuestionPanel .chat-nav-question-item').length,
    };
    // 组合提交（上屏）：此时才过滤重建
    input.dispatchEvent(new CompositionEvent('compositionend', { data: '第5', bubbles: true }));
    const after = {
      rebuilt: document.querySelector('.chat-nav-question-search').__marker !== 'alive',
      items: document.querySelectorAll('#chatNavQuestionPanel .chat-nav-question-item').length,
    };
    return { during, after };
  });
  expect(res.during.alive).toBe(true); // 组合期间输入框未被销毁
  expect(res.during.items).toBe(7); // 未过滤，条目不变
  expect(res.after.rebuilt).toBe(true); // 上屏后才重建过滤
  expect(res.after.items).toBe(1); // 命中「第5个问题」一条
});

test('Esc 优先清空搜索词，再按一次才退钉住/收起', async ({ page }) => {
  const seven = Array.from({ length: 7 }, (_, i) => `第${i}个问题`);
  await expandByHover(page, seven);
  await page.click('#chatNavHotzone'); // 钉住，避免直接收起
  await page.type('.chat-nav-question-search', '第5');
  await page.keyboard.press('Escape');
  // 第一次 Esc：清词、恢复全部条目、仍钉住且展开
  const afterEsc1 = await page.evaluate(() => ({
    items: document.querySelectorAll('#chatNavQuestionPanel .chat-nav-question-item').length,
    query: document.querySelector('.chat-nav-question-search')?.value ?? '',
    expanded: document.getElementById('chatNavQuestionPanel').classList.contains('expanded'),
    pinned: document.getElementById('chatNavHotzone').classList.contains('pinned'),
  }));
  expect(afterEsc1.query).toBe('');
  expect(afterEsc1.items).toBe(7);
  expect(afterEsc1.pinned).toBe(true);
  expect(afterEsc1.expanded).toBe(true);
  // 第二次 Esc：退钉住并收起
  await page.keyboard.press('Escape');
  const afterEsc2 = await page.evaluate(() => ({
    pinned: document.getElementById('chatNavHotzone').classList.contains('pinned'),
    expanded: document.getElementById('chatNavQuestionPanel').classList.contains('expanded'),
  }));
  expect(afterEsc2.pinned).toBe(false);
  expect(afterEsc2.expanded).toBe(false);
});

test('边界反馈：已在最后一组仍向下跳，目标按钮进入 blocked 态', async ({ page }) => {
  await page.setContent(navPageHtml());
  await page.evaluate(() => {
    // 滚到最后一组，使当前组为末组
    const groups = NavKit.buildMessageJumpGroups(document.getElementById('chatContainer'));
    groups[groups.length - 1].start.scrollIntoView({ block: 'start' });
  });
  const res = await page.evaluate(() => {
    const r = window.__nav.jumpToMessage('next');
    return {
      result: r,
      blocked: document.getElementById('chatNavDown').classList.contains('blocked'),
    };
  });
  expect(res.result).toBe('blocked');
  expect(res.blocked).toBe(true);
});

test('钉住后手动滚列表去点远处条目，不会被“跟随当前项”拽回顶部', async ({ page }) => {
  const many = Array.from({ length: 26 }, (_, i) => `第${i + 1}个问题`);
  await expandByHover(page, many);
  await page.click('#chatNavHotzone'); // 钉住：保持展开，收起只跟鼠标走
  // 当前项停在第 1 组（对话在顶部）
  await page.evaluate(() => document.getElementById('chatContainer').scrollTo(0, 0));
  // 指针移入列表（模拟去抓列表滚动条），把列表滚到底部
  await page.locator('.chat-nav-question-list').hover();
  await page.evaluate(() => { const l = document.querySelector('.chat-nav-question-list'); l.scrollTop = l.scrollHeight; });
  const before = await page.evaluate(() => {
    const l = document.querySelector('.chat-nav-question-list');
    return { top: l.scrollTop, scrollable: l.scrollHeight - l.clientHeight };
  });
  expect(before.scrollable).toBeGreaterThan(20); // 列表确实可滚
  expect(before.top).toBeGreaterThan(20);
  // 触发一次“跟随重绘”：chat 滚动 → updateActiveQuestion → paintActiveQuestion
  await page.evaluate(() => document.getElementById('chatContainer').dispatchEvent(new Event('scroll')));
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => document.querySelector('.chat-nav-question-list').scrollTop);
  // 指针仍在列表内 → 列表保持底部，不被拽回第 1 项
  expect(after).toBeGreaterThanOrEqual(before.top - 2);
});

test('点击条目后移开鼠标再滚对话，当前项会滚进列表可视区（不被滞留焦点屏蔽）', async ({ page }) => {
  const many = Array.from({ length: 26 }, (_, i) => `第${i + 1}个问题`);
  await expandByHover(page, many);
  await page.click('#chatNavHotzone'); // 钉住
  await page.locator('.chat-nav-question-item').first().click(); // 点第一条，焦点落到条目（面板内）
  // 焦点仍滞留在条目上，但把鼠标移出面板 → pointerInPanel=false，跟随应恢复
  await page.mouse.move(600, 6);
  await page.waitForTimeout(30);
  // 用户滚对话到最后一组
  await page.evaluate(() => { const c = document.getElementById('chatContainer'); c.scrollTo(0, c.scrollHeight); });
  await page.waitForTimeout(150);
  const state = await page.evaluate(() => {
    const list = document.querySelector('.chat-nav-question-list');
    const cur = list.querySelector('.chat-nav-question-item.current');
    const focusInPanel = list.contains(document.activeElement);
    if (!cur) return { has: false, focusInPanel };
    const lr = list.getBoundingClientRect();
    const cr = cur.getBoundingClientRect();
    return { has: true, focusInPanel, gi: Number(cur.dataset.groupIndex), fullyVisible: cr.top >= lr.top - 1 && cr.bottom <= lr.bottom + 1 };
  });
  expect(state.focusInPanel).toBe(true); // 复现前提：焦点确实滞留在面板内
  expect(state.gi).toBe(25); // 当前项已是最后一组
  expect(state.fullyVisible).toBe(true); // 且被滚进列表可视区
});
