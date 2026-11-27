// side-rail 入口按钮主题适配守卫（统一 tinted 风格）
// 防止两件事：
//   1) 回退为实心亮色块（暗色下扎眼）或重新引入硬编码色值；
//   2) 单个入口又跑回自己的语义色（warning/info/success/violet），
//      让纵向轨道变成一列多色相，破坏统一配色。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const STYLES = readFileSync(
  new URL('../../src/side_panel/styles.css', import.meta.url), 'utf8',
);
const SCHED = readFileSync(
  new URL('../../src/side_panel/schedule-panel.js', import.meta.url), 'utf8',
);

function rule(src, selector) {
  const start = src.indexOf(selector);
  expect(start, `缺少规则 ${selector}`).toBeGreaterThan(-1);
  const end = src.indexOf('}', start);
  return src.slice(start, end);
}

describe('side-rail 入口统一 tinted 风格', () => {
  const cssToggles = [
    '.message-toc-toggle {',
    '.bookmark-panel-toggle {',
    '.search-panel-toggle {',
    '.workspace-panel-toggle {',
    '.todo-panel-toggle {',
  ];

  test.each(cssToggles)('%s 使用品牌蓝 tinted 底与品牌色图标', (selector) => {
    const block = rule(STYLES, selector);
    expect(block).toContain('rgba(var(--brand-rgb), 0.1');
    expect(block).toContain('var(--brand-600)');
    // 不允许回退为 0.85 实心块
    expect(block).not.toContain('0.85');
    // 不再依赖整体透明度
    expect(block).not.toMatch(/opacity:\s*0\.85/);
  });

  test.each(cssToggles)('%s 不再使用各自语义色族', (selector) => {
    const block = rule(STYLES, selector);
    for (const token of ['--warning', '--info', '--success', '--brand-violet']) {
      expect(block).not.toContain(`var(${token}`);
    }
  });

  test('定时任务入口（内联样式）同样统一为品牌蓝且无硬编码色值', () => {
    const block = rule(SCHED, '.schedule-panel-toggle {');
    expect(block).toContain('rgba(var(--brand-rgb), 0.14)');
    expect(block).toContain('var(--brand-600)');
    expect(block).not.toContain('var(--success');
    expect(block).not.toContain('0.85');
    expect(block).not.toContain('rgba(31, 145, 80');
  });
});
