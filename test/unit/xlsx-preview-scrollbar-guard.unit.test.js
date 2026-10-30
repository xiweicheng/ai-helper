// Excel 预览水平滚动条守卫：表格容器不得出现原生横条（只保留底部镜像条）
// 背景：新版 Chrome 中，元素一旦声明标准 scrollbar-width，::-webkit-scrollbar 自定义
// 规则整组失效，.xlsx-table-scroll 的原生横条重新出现；>2000 行时被截断提示行与
// 底部镜像条分隔，视觉上变成两条水平滚动条（≤2000 行时两者重叠只见一条，故以 2000 行为界）
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const STYLES = readFileSync(
  new URL('../../src/side_panel/styles.css', import.meta.url), 'utf8',
);

function rule(selector) {
  const start = STYLES.indexOf(selector);
  expect(start, `缺少规则 ${selector}`).toBeGreaterThan(-1);
  const end = STYLES.indexOf('}', start);
  return STYLES.slice(start, end);
}

describe('xlsx 预览水平滚动条唯一性', () => {
  test('.xlsx-table-scroll 横向 overflow 必须显式 hidden（不依赖 webkit 规则生效）', () => {
    const block = rule('.xlsx-table-scroll {');
    expect(block).toMatch(/overflow-x:\s*hidden/);
    expect(block).toMatch(/overflow-y:\s*auto/);
    // 不得用 overflow: auto 简写（会连带放开横向）
    expect(block).not.toMatch(/overflow:\s*auto/);
  });

  test('.xlsx-table-scroll 不得声明标准 scrollbar-width（会使 webkit 隐藏规则失效）', () => {
    const block = rule('.xlsx-table-scroll {');
    // 只断言属性声明（注释里允许提及该词）
    expect(block).not.toMatch(/scrollbar-width:\s*thin/);
  });

  test('webkit 竖向滚动条自定义样式保留，横向隐藏规则保留（双保险）', () => {
    expect(STYLES).toContain('.xlsx-table-scroll::-webkit-scrollbar:horizontal');
    expect(STYLES).toMatch(/\.xlsx-table-scroll::-webkit-scrollbar\s*\{[^}]*width:/);
  });

  test('镜像条仍以 thin 标准滚动条呈现（自身需要可见横条）', () => {
    const block = rule('.xlsx-table-scrollbar-mirror {');
    expect(block).toContain('scrollbar-width: thin');
    expect(block).toMatch(/overflow-x:\s*auto/);
  });
});
