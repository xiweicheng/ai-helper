// side-rail 入口按钮主题适配守卫（方案 A：低对比 tinted 风格）
// 防止回退为实心亮色块（暗色下扎眼）或重新引入硬编码色值
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

describe('side-rail 入口 tinted 风格', () => {
  const cssToggles = [
    ['.message-toc-toggle {', '--brand', '--brand-600'],
    ['.bookmark-panel-toggle {', '--warning', '--warning-strong'],
    ['.search-panel-toggle {', '--info', '--info-strong'],
    ['.workspace-panel-toggle {', '--info', '--info-strong'],
  ];

  test.each(cssToggles)('%s 使用 tinted 语义底与语义图标色', (selector, token, colorToken) => {
    const block = rule(STYLES, selector);
    expect(block).toContain(`rgba(var(${token}-rgb), 0.1`);
    expect(block).toContain(`var(${colorToken})`);
    // 不允许回退为 0.85 实心块
    expect(block).not.toContain('0.85');
    // 不再依赖整体透明度
    expect(block).not.toMatch(/opacity:\s*0\.85/);
  });

  test('定时任务入口（内联样式）同样 tinted 且无硬编码色值', () => {
    const block = rule(SCHED, '.schedule-panel-toggle {');
    expect(block).toContain('rgba(var(--success-rgb), 0.1');
    expect(block).toContain('var(--success-strong)');
    expect(block).not.toContain('0.85');
    expect(block).not.toContain('rgba(31, 145, 80');
  });
});
