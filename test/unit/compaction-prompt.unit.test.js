// compaction-prompt 单元测试：素材限量 / 提示词构建（纯函数，node 环境）
import { describe, test, expect } from 'vitest';
import {
  buildCompactionPrompt,
  sanitizeMaterialContent,
  MATERIAL_MAX_CHARS,
  MATERIAL_TOTAL_MAX_CHARS,
} from '../../src/shared/compaction-prompt.js';

describe('sanitizeMaterialContent', () => {
  test('短内容原样返回', () => {
    expect(sanitizeMaterialContent('hello')).toBe('hello');
  });

  test('超长内容截断并追加标记', () => {
    const long = 'x'.repeat(MATERIAL_MAX_CHARS + 100);
    const out = sanitizeMaterialContent(long);
    expect(out.length).toBeLessThanOrEqual(MATERIAL_MAX_CHARS + 10);
    expect(out.endsWith('[已截断]')).toBe(true);
  });

  test('非字符串内容 JSON 序列化', () => {
    expect(sanitizeMaterialContent({ a: 1 })).toBe('{"a":1}');
    expect(sanitizeMaterialContent(null)).toBe('');
  });
});

describe('buildCompactionPrompt', () => {
  test('包含角色标签与素材内容', () => {
    const prompt = buildCompactionPrompt([
      { role: 'user', content: '帮我写个函数' },
      { role: 'assistant', content: '好的，函数如下' },
    ]);
    expect(prompt).toContain('[User]');
    expect(prompt).toContain('[Assistant]');
    expect(prompt).toContain('帮我写个函数');
    expect(prompt).toContain('好的，函数如下');
  });

  test('包含已有摘要合并要求（提示词规则）', () => {
    const prompt = buildCompactionPrompt([{ role: 'user', content: 'x' }]);
    expect(prompt).toContain('【已有摘要】');
  });

  test('总长超限时保留最近素材、丢弃最早素材', () => {
    const chunk = 'y'.repeat(MATERIAL_MAX_CHARS);
    const material = [];
    for (let i = 0; i < 30; i++) material.push({ role: 'user', content: `标签${i}-` + chunk });
    const prompt = buildCompactionPrompt(material);
    // 最新一条必须在，最早一条必须被丢弃
    expect(prompt).toContain('标签29-');
    expect(prompt).not.toContain('标签0-');
    // 总长受控（含提示词模板余量）
    expect(prompt.length).toBeLessThan(MATERIAL_TOTAL_MAX_CHARS + 2000);
  });
});
