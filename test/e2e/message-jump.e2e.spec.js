// message-jump.e2e.spec.js - 在真实 Chromium 里用真实布局与滚动验证消息跳转的分组定位
//
// 与单测的分工：单测用替身 rect 验证分组/定位的纯逻辑；本文件把 utils.js 打进真实页面
// （加载真实 theme.css + styles.css 与真实 .chat-container），用真实 getBoundingClientRect
// 和真实 scrollIntoView 证明：
// 1) 「列表编号 N」与「按 ▲▼ 跳 N 次落到的位置」是同一组——跳完反查当前组必须等于目标编号；
// 2) 问题列表面板不再半透明穿透、条目按两行截断（这两条只有真实渲染才说明得了）；
// 3) 列表滚动时 Header 固定：面板自身不滚，滚动只发生在 .chat-nav-question-list 内。
// 面板内容一律由真实的 NavKit.renderQuestionListHtml 生成，不手写副本，避免与产品漂移。
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
        "export { buildMessageJumpGroups, findActiveGroupIndex, resolveJumpTarget, formatQuestionPreview, renderQuestionListHtml } from './src/side_panel/utils.js';",
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

/** 真实样式：语义 token + 侧边栏样式表，不另写一份 CSS 副本 */
function pageHtml(theme = 'light', opts = {}) {
  // panelExtraStyle 默认带固定高仅供旧用例复用；真实产品面板只有 max-height:62vh，
  // 新用例传空串还原真实约束。
  const { panelExtraStyle = 'height:120px;', questions = null } = opts;
  const themeCss = fs.readFileSync(path.resolve(ROOT, 'src/shared/theme.css'), 'utf-8');
  const panelCss = fs.readFileSync(path.resolve(ROOT, 'src/side_panel/styles.css'), 'utf-8');
  const list = questions || ['第一条提问', '第二条稍微长一点的提问用于验证两行截断行为是否真的生效而不是只剩十几个字，这里继续补充内容直到它在两列宽度下必然超过两行，观察是否会出现被硬切一半的第三行', '第三条提问'];
  // flex:none 保证固定高度不被 .chat-container 的弹性布局压缩，否则内容不会溢出、根本滚不动
  const messages = list
    .map(
      (q, i) =>
        `<div class="message user" data-message-id="u${i}" style="height:60px; flex:none">${q}</div>` +
        `<div class="message assistant" data-message-id="a${i}" style="height:320px; flex:none">回答 ${i + 1}</div>`
    )
    .join('');
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${themeCss}</style><style>${panelCss}</style></head>
<body>
  <div class="chat-container" id="chatContainer" style="height:420px; overflow-y:auto;">${messages}</div>
  <div class="chat-nav-question-panel expanded" id="chatNavQuestionPanel" style="position:static; visibility:visible; opacity:1; ${panelExtraStyle}"></div>
  <script>${bundle}</script>
</body></html>`;
}

/** 用真实的 renderQuestionListHtml 渲染面板内容（DOM 只有一处来源，不与产品漂移） */
async function mountPanel(page, activeIndex, isPinned = false) {
  await page.evaluate(
    ({ activeIndex, isPinned }) => {
      const groups = NavKit.buildMessageJumpGroups(document.getElementById('chatContainer'));
      document.getElementById('chatNavQuestionPanel').innerHTML = NavKit.renderQuestionListHtml(
        groups,
        activeIndex,
        isPinned
      );
    },
    { activeIndex, isPinned }
  );
}

test('问答组覆盖每条提问与其后的回答，编号连续', async ({ page }) => {
  await page.setContent(pageHtml());
  const info = await page.evaluate(() => {
    const groups = NavKit.buildMessageJumpGroups(document.getElementById('chatContainer'));
    return {
      count: groups.length,
      sizes: groups.map(g => g.elements.length),
      anchors: groups.map(g => g.userElement?.dataset.messageId ?? null),
    };
  });
  expect(info.count).toBe(3);
  expect(info.sizes).toEqual([2, 2, 2]);
  expect(info.anchors).toEqual(['u0', 'u1', 'u2']);
});

test('按编号跳转后反查当前组得到同一编号（列表与箭头口径一致）', async ({ page }) => {
  await page.setContent(pageHtml());
  const results = await page.evaluate(() => {
    const container = document.getElementById('chatContainer');
    const groups = NavKit.buildMessageJumpGroups(container);
    const out = [];
    for (let target = 0; target < groups.length; target++) {
      groups[target].start.scrollIntoView({ block: 'start' });
      const top = container.getBoundingClientRect().top;
      out.push({ index: NavKit.findActiveGroupIndex(groups, top, 10), scrolled: container.scrollTop });
    }
    return out;
  });
  expect(results.map(r => r.index)).toEqual([0, 1, 2]);
  // 确认是真的滚动了，而不是容器没溢出导致的空跑
  expect(results[2].scrolled).toBeGreaterThan(0);
});

test('连按上一条/下一条在组间移动并停在边界', async ({ page }) => {
  await page.setContent(pageHtml());
  const walk = await page.evaluate(() => {
    const container = document.getElementById('chatContainer');
    const groups = NavKit.buildMessageJumpGroups(container);
    const top = () => container.getBoundingClientRect().top;
    let index = NavKit.findActiveGroupIndex(groups, top(), 10);
    const path = [index];
    for (let i = 0; i < 4; i++) {
      const next = NavKit.resolveJumpTarget(groups.length, index, 'next');
      if (next === null) break;
      groups[next].start.scrollIntoView({ block: 'start' });
      index = next;
      path.push(index);
    }
    // 到底后再按一次应无目标
    return { path, overflow: NavKit.resolveJumpTarget(groups.length, index, 'next') };
  });
  expect(walk.path).toEqual([0, 1, 2]);
  expect(walk.overflow).toBeNull();
});

test('面板为实色表面，条目不折行成单行截断', async ({ page }) => {
  await page.setContent(pageHtml());
  await mountPanel(page, 0);
  const style = await page.evaluate(() => {
    const panel = document.getElementById('chatNavQuestionPanel');
    const item = panel.querySelector('.chat-nav-question-item');
    const cs = getComputedStyle(panel);
    const is = getComputedStyle(item);
    return {
      bg: cs.backgroundColor,
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
      whiteSpace: is.whiteSpace,
      overflow: is.overflow,
    };
  });
  // 底色 alpha = 1：聊天正文不会从列表底下透出来
  const alpha = style.bg.match(/rgba?\(([^)]+)\)/)[1].split(',').length === 4
    ? Number(style.bg.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)[1])
    : 1;
  expect(alpha).toBe(1);
  expect(style.backdrop ?? 'none').toBe('none');
  expect(style.whiteSpace).not.toBe('nowrap');
  expect(style.overflow).toBe('hidden');
});

// 两行截断必须落在内部文本节点上（条目是 <button>，legacy -webkit-box 会被改掉），
// 且新版 Chromium（130+）把所有 -webkit-box 的 computed 值转成 flow-root，
// line-clamp 仍压行数，但省略号改由 text-overflow 决定：缺省 clip 时
// 第三行被 overflow:hidden 硬切一半、不画省略号。这里量的是真实渲染结果，
// display 断言兼容新旧引擎（-webkit-box / flow-root），并验证渲染高度
// 恰好是整数行（overflow 后不藏半行），而不是只读样式声明。
test('长提问恰好两行且由 CSS 画省略号，不出现被硬切的第三行', async ({ page }) => {
  await page.setContent(pageHtml());
  await mountPanel(page, 0);
  const out = await page.evaluate(() => {
    const items = document.querySelectorAll('.chat-nav-question-item');
    const item = items[1]; // 最长的那条提问
    const textEl = item.querySelector('.chat-nav-question-text');
    if (!textEl) return { hasTextEl: false };
    const cs = getComputedStyle(textEl);
    const lineHeight = parseFloat(cs.lineHeight);
    return {
      hasTextEl: true,
      display: cs.display,
      lineClamp: cs.webkitLineClamp,
      textOverflow: cs.textOverflow,
      textHeight: textEl.clientHeight,
      lineHeight,
      visibleLines: Math.round(textEl.clientHeight / lineHeight),
      remainder: textEl.clientHeight % lineHeight,
      textEndsWithEllipsis: /…$/.test(textEl.textContent.trim()),
    };
  });
  expect(out.hasTextEl).toBe(true);
  // 旧引擎保留 -webkit-box；新引擎转成 flow-root，两者都会应用 line-clamp
  expect(['-webkit-box', 'flow-root']).toContain(out.display);
  expect(out.lineClamp).toBe('2');
  // 省略号由 text-overflow 驱动：缺它则只压高度、第三行被硬切
  expect(out.textOverflow).toBe('ellipsis');
  // 盒子高度恰好两行，且是整数行高——overflow 后面不会藏着被切一半的第三行
  expect(out.visibleLines).toBe(2);
  const nearLineBoundary = Math.min(out.remainder, out.lineHeight - out.remainder);
  expect(nearLineBoundary).toBeLessThanOrEqual(1);
  // 文字本身不被 JS 截一刀（否则会出现「两个省略号」）
  expect(out.textEndsWithEllipsis).toBe(false);
});

test('当前组条目在列表内获得高亮态样式', async ({ page }) => {
  await page.setContent(pageHtml());
  // activeIndex=-1：初始无任何高亮，才能对比出 .current 带来的变化
  await mountPanel(page, -1);
  const plain = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelectorAll('.chat-nav-question-item')[0]);
    return { color: cs.color, bg: cs.backgroundColor, shadow: cs.boxShadow };
  });
  await page.locator('.chat-nav-question-item').nth(1).evaluate(el => el.classList.add('current'));
  // 条目有 color/background 过渡，必须等动画结束再取终值
  await page.waitForTimeout(400);
  const current = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelectorAll('.chat-nav-question-item')[1]);
    return { color: cs.color, bg: cs.backgroundColor, shadow: cs.boxShadow };
  });
  // 高亮必须肉眼可见：文字与底色随当前组变化，且有左侧指示条
  expect(current.color).not.toBe(plain.color);
  expect(current.bg).not.toBe(plain.bg);
  expect(current.shadow).not.toBe('none');
  expect(plain.shadow).toBe('none');
});

test('暗色主题下列表同样是实色底，高亮不靠透明度撑', async ({ page }) => {
  await page.setContent(pageHtml('dark'));
  await mountPanel(page, -1);
  const plain = await page.evaluate(() => getComputedStyle(document.querySelector('.chat-nav-question-item')).color);
  await page.locator('.chat-nav-question-item').first().evaluate(el => el.classList.add('current'));
  await page.waitForTimeout(400);
  const out = await page.evaluate(() => {
    const panel = getComputedStyle(document.getElementById('chatNavQuestionPanel'));
    const item = getComputedStyle(document.querySelector('.chat-nav-question-item'));
    return { panelBg: panel.backgroundColor, itemColor: item.color };
  });
  expect(out.panelBg).toBe('rgb(30, 33, 40)'); // --bg-surface 暗色实色，无 alpha 通道
  expect(out.itemColor).not.toBe(plain);
});

test('列表垂直滚动时 Header 固定可见', async ({ page }) => {
  await page.setContent(pageHtml());
  await mountPanel(page, 0);
  const before = await page.evaluate(() => {
    const panel = document.getElementById('chatNavQuestionPanel');
    const list = panel.querySelector('.chat-nav-question-list');
    return {
      headerTop: panel.querySelector('.chat-nav-question-header').getBoundingClientRect().top,
      // 滚动区必须真的可滚，否则后面的断言只是空跑
      scrollable: list.scrollHeight - list.clientHeight,
      panelScrollable: panel.scrollHeight - panel.clientHeight,
      panelTop: panel.scrollTop,
    };
  });
  expect(before.scrollable).toBeGreaterThan(0);
  expect(before.panelScrollable).toBe(0);

  const after = await page.evaluate(() => {
    const panel = document.getElementById('chatNavQuestionPanel');
    const list = panel.querySelector('.chat-nav-question-list');
    list.scrollTop = 40;
    return {
      listTop: list.scrollTop,
      headerTop: panel.querySelector('.chat-nav-question-header').getBoundingClientRect().top,
      panelTop: panel.scrollTop,
    };
  });
  expect(after.listTop).toBeGreaterThan(0);
  expect(after.headerTop).toBe(before.headerTop);
  expect(after.panelTop).toBe(0);
});

// 真实产品面板只有 max-height:62vh、没有显式 height：auto 高度的纵向 flex 容器
// 按子项假设主轴尺寸定高，列表区 flex-basis 若写 0，它对面板高度贡献 0，
// 整个列表会塌成 0 高、只剩 Header（曾经真实发生过，旧用例因内联固定高测不出）。
test('面板无显式高度时列表区不得塌成 0，超长内容在 62vh 内封顶并内部滚动', async ({ page }) => {
  const many = Array.from(
    { length: 12 },
    (_, i) => `第${i + 1}个问题需要足够长来撑出两行高度以便内容超过视口高度的百分之六十二，这里继续补充一些中文内容直到必然折行为止`
  );
  await page.setContent(pageHtml('light', { panelExtraStyle: '', questions: many }));
  await mountPanel(page, 2);
  const out = await page.evaluate(() => {
    const panel = document.getElementById('chatNavQuestionPanel');
    const list = panel.querySelector('.chat-nav-question-list');
    const item = panel.querySelector('.chat-nav-question-item');
    const header = panel.querySelector('.chat-nav-question-header');
    const headerTopBefore = header.getBoundingClientRect().top;
    list.scrollTop = 60;
    return {
      panelH: panel.getBoundingClientRect().height,
      cap: window.innerHeight * 0.62,
      listH: list.getBoundingClientRect().height,
      itemH: item.getBoundingClientRect().height,
      scrollable: list.scrollHeight - list.clientHeight,
      headerMoved: header.getBoundingClientRect().top - headerTopBefore,
      panelScrollTop: panel.scrollTop,
    };
  });
  expect(out.itemH).toBeGreaterThan(0);
  expect(out.listH).toBeGreaterThan(0);
  // 超长时面板被 62vh 封顶，滚动只发生在列表区，Header 不动
  expect(out.panelH).toBeLessThanOrEqual(out.cap + 1);
  expect(out.scrollable).toBeGreaterThan(0);
  expect(out.headerMoved).toBe(0);
  expect(out.panelScrollTop).toBe(0);
});

test('预览文案折叠空白并按上限截断', async ({ page }) => {
  await page.setContent(pageHtml());
  const out = await page.evaluate(() => ({
    folded: NavKit.formatQuestionPreview('  请分析 \n 这个页面  ', 40),
    cut: NavKit.formatQuestionPreview('x'.repeat(50), 40),
  }));
  expect(out.folded).toBe('请分析 这个页面');
  expect(out.cut).toHaveLength(41);
  expect(out.cut.endsWith('…')).toBe(true);
});
