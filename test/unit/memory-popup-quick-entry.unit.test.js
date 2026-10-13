// 记忆 Popup 快捷入口的结构钉：side panel 记忆弹层里那颗跳配置页的按钮。
// 钉三件事：① 按钮确实在标题行且落在行尾（用户要的「右侧」）；② 图标与 MCP/Skill
// 那套 ＋ 管理入口逐字一致（用户明确要求保持一致，抄错形状就失去意义）；③ 跳转通道
// 用的是既有 OPEN_OPTIONS_PAGE + hash，且中文英文都有 title。
import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';

const panelHtml = readFileSync(new URL('../../side_panel.html', import.meta.url), 'utf8');
const panelJs = readFileSync(new URL('../../src/side_panel/index.js', import.meta.url), 'utf8');
const panelCss = readFileSync(new URL('../../src/side_panel/styles.css', import.meta.url), 'utf8');
const zh = readFileSync(new URL('../../src/shared/locales/zh.js', import.meta.url), 'utf8');
const en = readFileSync(new URL('../../src/shared/locales/en.js', import.meta.url), 'utf8');

// 从 HTML 里抠出某个元素内部的前两段 svg path（用来比对图标形状）
function svgPaths(fragment) {
  return [...fragment.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
}

test('记忆弹层标题行内有跳配置的按钮，且排在行尾', () => {
  const title = panelHtml.match(/<div class="memory-limit-dropdown-title">([\s\S]*?)<\/div>/);
  expect(title, '找不到记忆弹层标题行').toBeTruthy();
  expect(title[1]).toContain('id="memoryLimitConfigEntry"');
  expect(title[1], '必须是 type=button，否则在表单语境里会触发默认提交').toContain('type="button"');
  // 位置钉：按钮出现在 ⓘ 之后（= 行尾），且样式里用 margin-left:auto 顶到右边
  expect(title[1].indexOf('memoryLimitConfigEntry')).toBeGreaterThan(title[1].indexOf('memory-limit-info-icon'));
  const rule = panelCss.match(/\.memory-limit-config-entry\s*\{([^}]*)\}/);
  expect(rule, '缺 .memory-limit-config-entry 样式').toBeTruthy();
  expect(rule[1]).toContain('margin-left: auto');
});

test('＋ 图标与 MCP/Skill 的管理入口逐字一致', () => {
  const manage = panelHtml.match(/<button class="input-add-panel-manage"[\s\S]*?<\/button>/);
  expect(manage, '找不到 MCP/Skill 的管理入口按钮').toBeTruthy();
  const entry = panelHtml.match(/<button class="memory-limit-config-entry"[\s\S]*?<\/button>/);
  expect(entry, '找不到记忆配置入口按钮').toBeTruthy();
  expect(svgPaths(entry[0])).toEqual(svgPaths(manage[0]));
});

test('点击走 OPEN_OPTIONS_PAGE 通道跳到 memory Tab', () => {
  expect(panelJs).toContain("getElementById('memoryLimitConfigEntry')");
  const block = panelJs.match(/memoryLimitConfigEntry[\s\S]{0,400}/);
  expect(block[0]).toMatch(/type:\s*'OPEN_OPTIONS_PAGE'/);
  expect(block[0]).toMatch(/hash:\s*'memory'/);
});

test('入口文案中英齐备', () => {
  for (const [label, src] of [['zh', zh], ['en', en]]) {
    const memoryBlock = src.match(/\n  memory: \{([\s\S]*?)\n  \},/);
    expect(memoryBlock, `缺 memory 命名空间（${label}）`).toBeTruthy();
    const value = memoryBlock[1].match(/^\s{4}configEntry:\s*'([^']+)'/m);
    expect(value, `${label} 缺 memory.configEntry`).toBeTruthy();
    expect(value[1].trim().length).toBeGreaterThan(0);
  }
});
