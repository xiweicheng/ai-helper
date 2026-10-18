// @vitest-environment node
// theme-contrast-check.py：暗色文本/边框 token 的 WCAG AA 门禁
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';

it('theme.css 暗色文本 token 全部通过 AA', () => {
  const out = execFileSync('python3', ['scripts/theme-contrast-check.py', 'src/shared/theme.css'], { encoding: 'utf-8' });
  expect(out).not.toContain('AA FAIL');
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
