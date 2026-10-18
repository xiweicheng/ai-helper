// @vitest-environment node
// theme-migrate.py 映射表完备性 + 替换正确性 + 幂等测试
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';

const SCRIPT = 'scripts/theme-migrate.py';

it('theme-map.json 覆盖消费级 CSS 全部去重 hex（除白名单，含文件作用域）', () => {
  const out = execFileSync('python3', [SCRIPT, '--missing',
    'src/side_panel/styles.css', 'src/options/styles.css'], { encoding: 'utf-8' });
  expect(JSON.parse(out || '[]')).toEqual([]);
});

it('whitelist 文件作用域：纸面值出现在非豁免文件时被 --check 拦下（防 B-2 复发）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-scope-'));
  const file = join(dir, 'panel.css');
  // #fff3cd 仅豁免于 markdown-render.js；#1f2328 仅豁免于 styles.css
  // → 写进另一个临时面板文件应视为未覆盖（旧的全局豁免会掩盖这类漏网）
  writeFileSync(file, '.x { background: #fff3cd; color: #1f2328; }\n', 'utf-8');
  let err;
  try {
    execFileSync('python3', [SCRIPT, '--check', file], { encoding: 'utf-8' });
  } catch (e) { err = e; }
  expect(err).toBeTruthy();
  const reported = JSON.parse(err.stdout);
  expect(reported.uncovered).toContain('#fff3cd');
  expect(reported.uncovered).toContain('#1f2328');
});

it('rgba 三元组全部有族/黑白灰归属', () => {
  const out = execFileSync('python3', [SCRIPT, '--missing-rgba'], { encoding: 'utf-8' });
  expect(JSON.parse(out || '[]')).toEqual([]);
});

it('就地替换 hex/rgba 为 token 引用，且幂等', () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-mig-'));
  const file = join(dir, 'fixture.css');
  const src = '.a { color: #667eea; }\n.b { background: rgba(0, 0, 0, 0.08); }\n.c { color: #ffffff; }\n.g { background: rgba(255, 255, 255, 0.85); }\n.h { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2); }\n';
  writeFileSync(file, src, 'utf-8');
  execFileSync('python3', [SCRIPT, file], { encoding: 'utf-8' });
  const once = readFileSync(file, 'utf-8');
  expect(once).toContain('var(--brand-500)');
  expect(once).toContain('rgba(var(--overlay-rgb), 0.12)');
  expect(once).toContain('var(--text-inverse)');
  // 白族 α>0.45 background → surface 通道；α≤0.45 on-color 高光保持字面量
  expect(once).toContain('rgba(var(--surface-rgb), 0.85)');
  expect(once).toContain('rgba(255, 255, 255, 0.2)');
  expect(once).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  // 幂等：重跑无变化
  execFileSync('python3', [SCRIPT, file], { encoding: 'utf-8' });
  expect(readFileSync(file, 'utf-8')).toBe(once);
});

it('js 模式：逐声明定属性（background:#fff 不被前面的 border 带偏）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-js-'));
  const file = join(dir, 'fixture.js');
  const src = "el.style.cssText = 'border:1px solid #cbd5e0;background:#fff;color:#4a5568;';\n";
  writeFileSync(file, src, 'utf-8');
  execFileSync('python3', [SCRIPT, file, '--mode', 'js'], { encoding: 'utf-8' });
  const out = readFileSync(file, 'utf-8');
  // border 声明 → border token；background 声明 → surface（若整串取首个属性会错判为 border）
  expect(out).toContain('border:1px solid var(--border-default)');
  expect(out).toContain('background:var(--bg-surface)');
  expect(out).toContain('color:var(--text-secondary)');
});

it('js 模式：style=""/.style 联动 token，SVG 表现属性保留字面量', () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-js2-'));
  const file = join(dir, 'fixture.js');
  const src = 'b.style.color = \'#667eea\';\n'
    + '<div style="width:50%;background:#4a6cf7;"></div>\n'
    + '<svg><polyline stroke="#667eea"></polyline><polygon fill="#667eea"></polygon></svg>\n';
  writeFileSync(file, src, 'utf-8');
  execFileSync('python3', [SCRIPT, file, '--mode', 'js'], { encoding: 'utf-8' });
  const out = readFileSync(file, 'utf-8');
  expect(out).toContain("b.style.color = 'var(--brand-500)'");
  expect(out).toContain('background:var(--info-500)');
  // SVG 属性中 var() 无效，必须保留字面量
  expect(out).toContain('stroke="#667eea"');
  expect(out).toContain('fill="#667eea"');
});

it('contextDispatch：#e8e8e8 作 color → code-fg（深色代码块文字不翻转），作 border → border-subtle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-ctx-'));
  const file = join(dir, 'fixture.js');
  const src = '<code style="background:#2d2d2d;color:#e8e8e8;"></code>\n'
    + '<div style="border:1px solid #e8e8e8;"></div>\n';
  writeFileSync(file, src, 'utf-8');
  execFileSync('python3', [SCRIPT, file, '--mode', 'js'], { encoding: 'utf-8' });
  const out = readFileSync(file, 'utf-8');
  expect(out).toContain('background:var(--code-bg)');
  expect(out).toContain('color:var(--code-fg)');
  expect(out).toContain('border:1px solid var(--border-subtle)');
});

