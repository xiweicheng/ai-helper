// 导出文件名测试：验证从回答开头提取标题、清洗、截断与文件名拼装
import { describe, test, expect } from 'vitest';
import {
  extractExportTitle,
  sanitizeExportTitle,
  truncateExportTitle,
  buildExportFileName,
  resolveExportFileName,
  normalizeExportMarkdown,
  EXPORT_TITLE_MAX_CHARS,
} from '../../src/side_panel/export-filename.js';

const TS = 1730000000000;

describe('extractExportTitle - 标题定位', () => {
  test('首行就是一级标题', () => {
    expect(extractExportTitle('# 重构方案\n\n正文开始')).toBe('重构方案');
  });

  test('标题在第 3 行（前面是寒暄正文）也能取到', () => {
    const md = '好的，我帮你梳理一下。\n\n## 一、结论\n\n细节……';
    // 序号前缀「一、」不在文件名里有意义，会被剥掉
    expect(extractExportTitle(md)).toBe('结论');
  });

  test('有 H1 时优先取 H1，即使 H2 出现更早', () => {
    const md = '## 背景\n\ntext\n\n# 最终方案\n\ntext';
    expect(extractExportTitle(md)).toBe('最终方案');
  });

  test('没有 H1 时取最早出现的任意级别标题', () => {
    expect(extractExportTitle('### 摘要\n\n## 详述')).toBe('摘要');
  });

  test('Setext 形式的 === 一级标题', () => {
    expect(extractExportTitle('部署说明\n===\n\n正文')).toBe('部署说明');
  });

  test('去掉标题末尾的闭合井号', () => {
    expect(extractExportTitle('## 缓存策略 ##')).toBe('缓存策略');
  });
});

describe('extractExportTitle - 排除项', () => {
  test('代码块里的 # 不算标题', () => {
    const md = '```bash\n# 这是注释\n```\n\n没有标题的正文';
    expect(extractExportTitle(md)).toBe('');
  });

  test('加粗独占一行不算标题', () => {
    expect(extractExportTitle('**要点如下**\n\n- a\n- b')).toBe('');
  });

  test('标题在扫描窗口（40 行）之外不参与提取', () => {
    const md = `${'正文行\n'.repeat(60)}# 太靠后的标题`;
    expect(extractExportTitle(md)).toBe('');
  });

  test('纯文本、空串与非字符串输入都返回空串', () => {
    expect(extractExportTitle('就是一段没有标题的回答。')).toBe('');
    expect(extractExportTitle('')).toBe('');
    expect(extractExportTitle('   ')).toBe('');
    expect(extractExportTitle(null)).toBe('');
    expect(extractExportTitle(undefined)).toBe('');
  });

  test('井号后没有空格不算标题（#标签 不是 Markdown 标题）', () => {
    expect(extractExportTitle('#标签内容\n正文')).toBe('');
  });
});

describe('sanitizeExportTitle - 清洗', () => {
  test('去掉序号前缀', () => {
    expect(sanitizeExportTitle('1.2 结论与建议')).toBe('结论与建议');
    expect(sanitizeExportTitle('一、总体思路')).toBe('总体思路');
    expect(sanitizeExportTitle('（三）风险')).toBe('风险');
  });

  test('去掉行内标记，保留可读文字', () => {
    expect(sanitizeExportTitle('**性能**与`内存`对比')).toBe('性能与内存对比');
    expect(sanitizeExportTitle('[设计文档](https://example.com/a) 摘要')).toBe('设计文档-摘要');
  });

  test('非法字符替换、空白折叠为短横线', () => {
    expect(sanitizeExportTitle('Q3 复盘: A/B 对比?')).toBe('Q3-复盘_-A_B-对比');
  });

  test('空内容返回空串', () => {
    expect(sanitizeExportTitle('   ')).toBe('');
    expect(sanitizeExportTitle(null)).toBe('');
  });
});

describe('truncateExportTitle - 截断', () => {
  test('超过上限按 code point 截断并清掉尾部标点', () => {
    const long = '很长的标题'.repeat(10) + '。';
    const out = truncateExportTitle(long);
    expect(Array.from(out).length).toBeLessThanOrEqual(EXPORT_TITLE_MAX_CHARS);
    expect(out.endsWith('。')).toBe(false);
  });

  test('不切开 emoji 代理对', () => {
    const emojiTitle = '🚀'.repeat(50);
    const out = Array.from(truncateExportTitle(emojiTitle));
    expect(out.length).toBe(EXPORT_TITLE_MAX_CHARS);
    expect(out.every((ch) => ch === '🚀')).toBe(true);
  });

  test('未超长时原样返回', () => {
    expect(truncateExportTitle('短标题')).toBe('短标题');
  });
});

describe('buildExportFileName - 文件名拼装', () => {
  test('有标题时拼在原名前面，原文件名完整保留', () => {
    expect(buildExportFileName({ title: '重构方案', kind: 'word', timestamp: TS, ext: 'docx' }))
      .toBe(`重构方案-word-${TS}.docx`);
  });

  test('无标题时退回原有命名', () => {
    expect(buildExportFileName({ title: '', kind: 'md', timestamp: TS, ext: 'md' }))
      .toBe(`md-${TS}.md`);
  });

  test('标题传入时也会再清洗一次', () => {
    expect(buildExportFileName({ title: '1. 结论: A/B', kind: 'pdf', timestamp: TS, ext: 'pdf' }))
      .toBe(`结论_-A_B-pdf-${TS}.pdf`);
  });
});

describe('resolveExportFileName - 端到端', () => {
  test('从回答 Markdown 直接得到带标题的文件名', () => {
    const md = '先说结论。\n\n# ReAct 循环优化\n\n正文';
    expect(resolveExportFileName(md, { kind: 'image', ext: 'jpg', timestamp: TS }))
      .toBe(`ReAct-循环优化-image-${TS}.jpg`);
  });

  test('没有标题时保持原命名', () => {
    expect(resolveExportFileName('纯文本回答', { kind: 'pdf', ext: 'pdf', timestamp: TS }))
      .toBe(`pdf-${TS}.pdf`);
  });
});

describe('normalizeExportMarkdown - 换行归一化', () => {
  test('CRLF 转 LF，三连以上空行折叠为一个空行', () => {
    expect(normalizeExportMarkdown('a\r\nb\n\n\n\nc')).toBe('a\nb\n\nc');
  });

  test('非字符串输入返回空串', () => {
    expect(normalizeExportMarkdown(null)).toBe('');
  });
});
