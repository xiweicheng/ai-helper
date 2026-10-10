// manifest 单元测试：阶段三帧注入覆盖与权限（srcdoc/about:blank 帧 + webNavigation）
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf-8'));

describe('manifest - 阶段三帧支持', () => {
  test('permissions 含 webNavigation（帧树枚举）', () => {
    expect(manifest.permissions).toContain('webNavigation');
  });

  test('content_scripts 开启 all_frames + match_about_blank + match_origin_as_fallback', () => {
    const cs = manifest.content_scripts[0];
    expect(cs.all_frames).toBe(true);
    expect(cs.match_about_blank).toBe(true);
    expect(cs.match_origin_as_fallback).toBe(true);
    expect(cs.matches).toContain('<all_urls>');
  });
});
