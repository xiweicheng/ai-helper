// @vitest-environment jsdom
// content/selection-toolbar-styles.js 主题化契约单测
import { it, expect } from 'vitest';
import { TOOLBAR_TOKENS, buildToolbarVars, buildToolbarCss, injectStyles, applyToolbarTheme } from '../../src/content/selection-toolbar-styles.js';

it('buildToolbarVars(dark) 生成容器作用域变量块且 dark 子集值正确', () => {
  const vars = buildToolbarVars('dark');
  expect(vars).toContain('#aih-selection-toolbar');
  expect(vars).toContain('#aih-selection-result');
  expect(vars).toContain('--bg-elevated:#262a33');
  expect(vars).toContain('--tb-accent:#6aa1fb');
});

it('buildToolbarVars(light) 还原既有观感（不跟随主题时恒用此块）', () => {
  const vars = buildToolbarVars('light');
  expect(vars).toContain('--bg-elevated:#ffffff');
  expect(vars).toContain('--tb-panel:rgba(255,255,255,0.96)');
  expect(vars).toContain('--tb-accent:#3b82f6');
});

it('buildToolbarCss(dark) 容器背景不再硬编码 #ffffff', () => {
  const css = buildToolbarCss('dark');
  expect(css).toContain('--bg-elevated:#262a33');
  // 不允许出现 background:#ffffff / background:#fff 这类容器白底字面量
  expect(css).not.toMatch(/background:\s*#(ffffff|fff)\b/i);
});

it('组件规则体一律走 var()，无裸 hex 色值（仅 token 块含 hex）', () => {
  const vars = buildToolbarVars('dark');
  const rules = buildToolbarCss('dark').replace(vars, '');
  // 剥离变量块后，规则区不应再有 #rrggbb 颜色字面量（#aih-* 选择器不算）
  expect(rules).not.toMatch(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/);
});

it('light/dark 两套 token 键集合一致（保证切换不丢变量）', () => {
  const l = Object.keys(TOOLBAR_TOKENS.light).sort();
  const d = Object.keys(TOOLBAR_TOKENS.dark).sort();
  expect(l).toEqual(d);
});

it('applyToolbarTheme 切换注入样式到 dark，且重复调用幂等', () => {
  document.head.innerHTML = '';
  injectStyles();
  const style = document.getElementById('aih-selection-toolbar-styles');
  expect(style.textContent).toContain('--bg-elevated:#ffffff');
  applyToolbarTheme('dark');
  expect(style.textContent).toContain('--bg-elevated:#262a33');
  const after = style.textContent;
  applyToolbarTheme('dark');
  expect(style.textContent).toBe(after);
});

it('applyToolbarTheme 在样式缺失时自动补注入', () => {
  document.head.innerHTML = '';
  applyToolbarTheme('dark');
  const style = document.getElementById('aih-selection-toolbar-styles');
  expect(style).toBeTruthy();
  expect(style.textContent).toContain('--bg-elevated:#262a33');
});
