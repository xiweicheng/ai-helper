// @vitest-environment jsdom
// markdown-render.js 产物声明标记剥离单元测试
import { describe, test, expect, beforeAll } from 'vitest';

let formatMarkdown, stripArtifactMarkers;
beforeAll(async () => {
  const mod = await import('../../src/side_panel/markdown-render.js');
  formatMarkdown = mod.formatMarkdown;
  stripArtifactMarkers = mod.stripArtifactMarkers;
});

describe('stripArtifactMarkers', () => {
  test('移除单条带说明标记', () => {
    expect(stripArtifactMarkers('结果如下\n[[artifact:a.xlsx|报表]]\n完毕'))
      .toBe('结果如下\n完毕');
  });
  test('移除多条无说明标记', () => {
    expect(stripArtifactMarkers('[[artifact:a.py]][[artifact:b.md]]')).toBe('');
  });
  test('不含标记时原样返回', () => {
    expect(stripArtifactMarkers('普通文本 `code`')).toBe('普通文本 `code`');
  });
  test('无标记时不折叠代码块内多空行', () => {
    const src = '```python\ndef a():\n    pass\n\n\ndef b():\n    pass\n```';
    expect(stripArtifactMarkers(src)).toBe(src);
  });
  test('有标记时才做空白整理', () => {
    expect(stripArtifactMarkers('a\n\n\n[[artifact:x.md]]\n\n\nb')).toBe('a\n\nb');
  });
  test('formatMarkdown 输出不含标记原文', () => {
    const html = formatMarkdown('标题\n[[artifact:report.xlsx|季度报表]]');
    expect(html).not.toContain('[[artifact:');
    expect(html).not.toContain('report.xlsx');
  });
});
