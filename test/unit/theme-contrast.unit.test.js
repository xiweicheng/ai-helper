// @vitest-environment node
// theme-contrast-check.py：暗色文本/边框 token 与「品牌实底×白字正文」的 WCAG AA 门禁
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';

const THEME = new URL('../../src/shared/theme.css', import.meta.url);
const SIDE_STYLES = new URL('../../src/side_panel/styles.css', import.meta.url);
const run = (file) => execFileSync('python3', ['scripts/theme-contrast-check.py', file], { encoding: 'utf-8' });

it('theme.css 暗色文本 token 全部通过 AA', () => {
  const out = run('src/shared/theme.css');
  expect(out).not.toContain('AA FAIL');
});

// 门禁必须确实跑到了，不然「输出里没有 FAIL」跟「根本没检」长得一模一样
it('品牌实底×白字：亮暗两套都实算并报 OK', () => {
  const out = run('src/shared/theme.css');
  expect(out).toMatch(/\[OK\] 亮色 --brand-fill=\S+ × --text-on-brand=\S+ 对比度 (\d+\.\d+):1/);
  expect(out).toMatch(/\[OK\] 暗色 --brand-fill=\S+ × --text-on-brand=\S+ 对比度 (\d+\.\d+):1/);
});

it('把 --brand-fill 改回旧的 --brand-500 值（#667eea，白字 3.66:1）→ 门禁报错并非零退出', () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-cc-fill-'));
  const file = join(dir, 'shallow.css');
  writeFileSync(file, [
    ':root { --bg-surface: #ffffff; --text-on-brand: #ffffff; --brand-fill: #667eea; }',
    'html[data-theme="dark"] { --bg-surface: #1e2128; --text-on-brand: #ffffff; --brand-fill: #566ad3; }',
  ].join('\n'), 'utf-8');
  let code = 0;
  let stdout = '';
  try {
    stdout = run(file);
  } catch (e) {
    code = e.status;
    stdout = `${e.stdout || ''}`;
  }
  expect(stdout).toContain('[AA FAIL] 亮色 --brand-fill');
  expect(code).not.toBe(0);
});

it('theme.css 亮色 --brand-fill 已不再是 --brand-500 的副本', () => {
  const css = readFileSync(THEME, 'utf-8');
  // 文件头注释里就出现“data-theme”字样，必须取 :root 之后那个暗色块起点，否则切出来是空串
  const root = css.slice(css.indexOf(':root'), css.indexOf('html[data-theme="dark"]'));
  const value = (name) => (root.match(new RegExp(name + '\\s*:\\s*([^;]+);')) || [])[1]?.trim();
  expect(value('--brand-fill'), '亮色块里没读到 --brand-fill').toBeTruthy();
  expect(value('--brand-500'), '亮色块里没读到 --brand-500').toBeTruthy();
  expect(value('--brand-fill')).not.toBe(value('--brand-500'));
});

it('用户气泡（正文量级的白字底）不得再用 --brand-500，必须用品牌实底 token', () => {
  const css = readFileSync(SIDE_STYLES, 'utf-8');
  const start = css.indexOf('.message.user {');
  expect(start).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf('}', start));
  expect(block).toMatch(/background:\s*var\(--brand-fill\)/);
  expect(block).not.toMatch(/background:\s*var\(--brand-500\)/);
});

it('注入一个不达标暗色文本值时脚本报 AA FAIL 并非零退出', () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-cc-'));
  const file = join(dir, 'bad.css');
  // --text-primary 暗色设成深灰（对比 #1e2128 不足 4.5）
  writeFileSync(file, ':root { --bg-surface: #ffffff; --text-primary: #333333; }\nhtml[data-theme="dark"] { --bg-surface: #1e2128; --text-primary: #2a2d33; }\n', 'utf-8');
  let code = 0;
  let stdout = '';
  try {
    stdout = execFileSync('python3', ['scripts/theme-contrast-check.py', file], { encoding: 'utf-8' });
  } catch (e) {
    code = e.status;
    stdout = (e.stdout || '') + '';
  }
  expect(stdout).toContain('AA FAIL');
  expect(code).not.toBe(0);
});
