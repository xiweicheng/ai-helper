// @vitest-environment jsdom
// 待办导入/导出选项弹窗
// 守住两件事：1) 一个入口，范围/格式/合并方式都在同一个弹窗里一次选完（不再套二级菜单）；
// 2) 纯 HTML 构建函数可断言，样式只用 token、层级低于菜单。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildExportDialogHtml, buildImportDialogHtml } from '../../src/side_panel/todo-io-dialogs.js';

// jsdom 环境下 import.meta.url 不是 file:// 绝对地址，用项目根拼源码路径
const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const STYLES = read('src/side_panel/styles.css');
const PANEL = read('src/side_panel/todo-panel.js');
const DIALOGS = read('src/side_panel/todo-io-dialogs.js');
const ZH = DIALOGS.slice(DIALOGS.indexOf("registerTranslations('zh'"), DIALOGS.indexOf("registerTranslations('en'"));
const EN = DIALOGS.slice(DIALOGS.indexOf("registerTranslations('en'"));

function rule(src, selector) {
  const start = src.indexOf(selector);
  expect(start, `缺少规则 ${selector}`).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('}', start));
}

describe('导出选项弹窗', () => {
  const counts = { all: 3, active: 2, done: 1 };
  const html = buildExportDialogHtml({ scope: 'all', format: 'json' }, counts);

  test('范围三选一与格式二选一在同一个弹窗里，没有第二级菜单', () => {
    for (const scope of ['all', 'active', 'done']) {
      expect(html, `缺范围 ${scope}`).toContain(`value="${scope}"`);
    }
    expect(html).toContain('value="json"');
    expect(html).toContain('value="md"');
    expect(html).toContain('data-io-action="confirm"');
    expect(html).toContain('data-io-action="cancel"');
  });

  test('每个范围都带条数，当前选中项由传入值决定', () => {
    expect(html).toContain('data-io-count="3"');
    expect(html).toContain('data-io-count="2"');
    expect(html).toContain('data-io-count="1"');
    expect(html).toMatch(/value="all"[^>]*checked/);
    expect(html).toMatch(/value="json"[^>]*checked/);
    expect(html).not.toMatch(/value="md"[^>]*checked/);
  });

  test('选中范围为空时导出按钮直接禁用，并说明原因', () => {
    const empty = buildExportDialogHtml({ scope: 'done', format: 'json' }, { all: 3, active: 3, done: 0 });
    expect(empty).toMatch(/data-io-action="confirm"[^>]*disabled/);
    expect(empty).toContain('todo-io-hint show');
    // 有内容时不显示这条提示
    expect(html).not.toContain('todo-io-hint show');
  });

  test('单选按钮带字段名，控制器靠它回写状态', () => {
    expect(html).toContain('data-io-field="scope"');
    expect(html).toContain('data-io-field="format"');
  });
});

describe('导入选项弹窗', () => {
  const info = { count: 12, existing: 3 };

  test('选完文件后才问怎么导：合并 / 替换二选一', () => {
    const html = buildImportDialogHtml({ mode: 'merge' }, info);
    expect(html).toContain('value="merge"');
    expect(html).toContain('value="replace"');
    expect(html).toMatch(/value="merge"[^>]*checked/);
    expect(html).toContain('data-io-action="confirm"');
  });

  test('摘要说清文件里几条、清单里几条', () => {
    const html = buildImportDialogHtml({ mode: 'merge' }, info);
    expect(html).toContain('12');
    expect(html).toContain('3');
  });

  test('替换是不可撤销的，选中才亮出警告条', () => {
    expect(buildImportDialogHtml({ mode: 'merge' }, info)).not.toContain('todo-io-warn show');
    expect(buildImportDialogHtml({ mode: 'replace' }, info)).toContain('todo-io-warn show');
  });
});

describe('头部菜单收敛成一个导出入口 + 一个导入入口', () => {
  test('菜单只剩 统计 / 导出… / 导入…', () => {
    const header = PANEL.slice(PANEL.indexOf('function headerMenuItems('));
    const body = header.slice(0, header.indexOf('\n}\n'));
    const actions = [...body.matchAll(/action: '([a-z-]+)'/g)].map(m => m[1]);
    expect(actions).toEqual(['stats', 'export-options', 'import-options']);
  });

  test('二级格式菜单已删（导出不再套两层）', () => {
    expect(PANEL).not.toContain('openExportFormatMenu');
    expect(PANEL).not.toMatch(/case 'export-json'/);
    expect(PANEL).not.toMatch(/case 'export-md'/);
  });

  test('导出入口把当前条数交给弹窗，确认后仍走 exportTodoScope', () => {
    const handler = PANEL.slice(PANEL.indexOf('async function handleMenuAction('));
    const body = handler.slice(0, handler.indexOf('\n}\n'));
    expect(body).toContain("case 'export-options':");
    expect(body).toContain('openExportDialog()');
    expect(PANEL).toContain('openExportOptions(');
    expect(PANEL).toContain('exportTodoScope(');
    expect(PANEL).toContain("from './todo-io-dialogs.js'");
  });

  test('导入入口只有一个：选文件 → 解析 → 选项弹窗 → 落库', () => {
    expect(PANEL).not.toMatch(/case 'import-merge'/);
    expect(PANEL).not.toMatch(/case 'import-replace'/);
    const fn = PANEL.slice(PANEL.indexOf('async function importTodoFile('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    const pickAt = body.indexOf('pickTodoImportFile(');
    const optionsAt = body.indexOf('openImportOptions(');
    const importAt = body.indexOf('importTodos(');
    expect(pickAt).toBeGreaterThan(-1);
    expect(optionsAt).toBeGreaterThan(pickAt);
    expect(importAt).toBeGreaterThan(optionsAt);
  });
});

describe('弹窗样式与文案', () => {
  test('浮层 fixed、层级低于菜单，卡片走主题 token', () => {
    expect(rule(STYLES, '.todo-io-overlay {')).toContain('position: fixed');
    expect(rule(STYLES, '.todo-io-card {')).toContain('var(--bg-elevated)');
    const z = STYLES.match(/\.todo-io-overlay \{[\s\S]*?z-index: (\d+)/);
    expect(z).toBeTruthy();
    expect(Number(z[1])).toBeLessThan(10020);
  });

  test('中英词条成对', () => {
    for (const key of [
      'exportTitle', 'importTitle', 'rangeLabel', 'formatLabel',
      'scopeAll', 'scopeActive', 'scopeDone', 'emptyRange',
      'modeLabel', 'modeMerge', 'modeMergeHint', 'modeReplace', 'modeReplaceHint',
      'exportAction', 'importAction', 'cancel',
    ]) {
      expect(ZH, `中文缺 ${key}`).toContain(`${key}:`);
      expect(EN, `英文缺 ${key}`).toContain(`${key}:`);
    }
  });
});
