// @vitest-environment node
// theme-migrate.py 映射表完备性 + 替换正确性 + 幂等测试
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';

const SCRIPT = 'scripts/theme-migrate.py';

it('theme-map.json 覆盖 styles.css 全部去重 hex（除白名单）', () => {
  const css = readFileSync('src/side_panel/styles.css', 'utf-8');
  const hex = new Set((css.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).map((h) =>
    h.length === 4 ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h.toLowerCase()));
  const out = execFileSync('python3', [SCRIPT, '--missing'], { encoding: 'utf-8' });
  const missing = out.trim() ? JSON.parse(out).filter((v) => !hex.has(v)) : [];
  expect(missing).toEqual([]);
});

it('rgba 三元组全部有族/黑白灰归属', () => {
  const out = execFileSync('python3', [SCRIPT, '--missing-rgba'], { encoding: 'utf-8' });
  expect(JSON.parse(out || '[]')).toEqual([]);
});

it('就地替换 hex/rgba 为 token 引用，且幂等', () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme-mig-'));
  const file = join(dir, 'fixture.css');
  const src = '.a { color: #667eea; }\n.b { background: rgba(0, 0, 0, 0.08); }\n.c { color: #ffffff; }\n';
  writeFileSync(file, src, 'utf-8');
  execFileSync('python3', [SCRIPT, file], { encoding: 'utf-8' });
  const once = readFileSync(file, 'utf-8');
  expect(once).toContain('var(--brand-500)');
  expect(once).toContain('rgba(var(--overlay-rgb), 0.12)');
  expect(once).toContain('var(--text-inverse)');
  expect(once).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  // 幂等：重跑无变化
  execFileSync('python3', [SCRIPT, file], { encoding: 'utf-8' });
  expect(readFileSync(file, 'utf-8')).toBe(once);
});
