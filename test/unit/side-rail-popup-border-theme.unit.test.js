// 回归守卫：右侧入口轨道 5 个浮层（工作目录 / 收藏 / 消息目录 / 检索 / 定时任务）
// 的边框必须走主题 token，否则亮色下白框压白底、暗色下白框过亮，面板边界与背景糊在一起。
//
// 历史写法：border: 1px solid rgba(255,255,255,0.3) + inset 0 1px 0 rgba(255,255,255,0.5)
// 现写法：border: 1px solid var(--border-strong) + box-shadow: 0 8px 32px rgba(var(--overlay-rgb), 0.18)
// 视觉断言见 test-results-probes/_side-rail-popup-border.mjs（真实页面双主题取色）。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const STYLES_SRC = readFileSync(
  path.resolve(process.cwd(), 'src/side_panel/styles.css'),
  'utf8'
);
const SCHEDULE_SRC = readFileSync(
  path.resolve(process.cwd(), 'src/side_panel/schedule-panel.js'),
  'utf8'
);

/** 取某个选择器规则的声明块（从选择器到第一个右花括号） */
function ruleBlock(src, selector) {
  const start = src.indexOf(selector);
  expect(start, `未找到选择器 ${selector}`).toBeGreaterThan(-1);
  const end = src.indexOf('}', start);
  return src.slice(start, end);
}

const PANEL_SELECTORS = ['.workspace-panel {', '.bookmark-panel {', '.message-toc-panel {', '.search-panel {'];

describe('styles.css 侧边浮层边框走主题 token', () => {
  test.each(PANEL_SELECTORS)('%s 使用 1px var(--border-strong) 描边', (selector) => {
    const block = ruleBlock(STYLES_SRC, selector);
    expect(block).toContain('border: 1px solid var(--border-strong);');
  });

  test.each(PANEL_SELECTORS)('%s 不再使用写死的白色边框/白色内高光', (selector) => {
    const block = ruleBlock(STYLES_SRC, selector);
    expect(block).not.toContain('rgba(255, 255, 255, 0.3)');
    expect(block).not.toContain('inset 0 1px 0 rgba(255, 255, 255, 0.5)');
  });

  test.each(PANEL_SELECTORS)('%s 投影使用 overlay-rgb（随主题翻转）', (selector) => {
    const block = ruleBlock(STYLES_SRC, selector);
    expect(block).toContain('box-shadow: 0 8px 32px rgba(var(--overlay-rgb), 0.18);');
  });
});

describe('schedule-panel.js 内联样式同步改造', () => {
  test('定时任务浮层同样使用 var(--border-strong) 描边', () => {
    expect(SCHEDULE_SRC).toContain('border: 1px solid var(--border-strong); border-radius: 12px;');
  });

  test('定时任务浮层不再使用写死的白色边框/白色内高光', () => {
    expect(SCHEDULE_SRC).not.toContain('border: 1px solid rgba(255,255,255,0.3)');
    expect(SCHEDULE_SRC).not.toContain('inset 0 1px 0 rgba(255,255,255,0.5)');
  });
});
