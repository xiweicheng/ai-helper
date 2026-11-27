// @vitest-environment jsdom
// Markdown 表格转义竖线渲染测试：单元格内 \| 按 GFM 语义渲染为字面 |，
// 不得被当作单元格分隔符拆分（否则一行会多出若干列，与截图 bug 对应）
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';

let splitTableCells;
let tableRowCells;
let extractTableBlocks;
let createTableHTML;
let formatMarkdown;
let parseMarkdownToDocxChildren;

beforeAll(async () => {
  const mod = await import('../../src/side_panel/markdown-render.js');
  splitTableCells = mod.splitTableCells;
  tableRowCells = mod.tableRowCells;
  extractTableBlocks = mod.extractTableBlocks;
  createTableHTML = mod.createTableHTML;
  formatMarkdown = mod.formatMarkdown;
  const exp = await import('../../src/side_panel/chat-export.js');
  parseMarkdownToDocxChildren = exp.parseMarkdownToDocxChildren;
});

beforeEach(() => {
  window.__tableBlocks = [];
});

// 将 docx 元素序列化为 XML JSON 字符串，用于结构断言（与 docx-export.unit.test.js 一致）
function xmlOf(node) {
  return JSON.stringify(node.prepForXml({ file: {}, viewWrapper: {}, stack: [] }));
}

describe('splitTableCells - GFM 转义竖线', () => {
  test('无转义时行为与朴素 split 一致（含首尾空串）', () => {
    expect(splitTableCells('| a | b |')).toEqual(['', ' a ', ' b ', '']);
  });

  test('单个 \\| 不拆分，且反斜杠被移除保留字面竖线', () => {
    const cells = splitTableCells('| 向量 | modelKey=`openai-compat\\|BAAI/bge-m3\\|1024`，stale=false |');
    expect(cells).toEqual([
      '',
      ' 向量 ',
      ' modelKey=`openai-compat|BAAI/bge-m3|1024`，stale=false ',
      '',
    ]);
  });

  test('用户截图完整行：拆分后为 2 个单元格', () => {
    const row = '| 向量 | **41 条全部 1024 维**，modelKey=`openai-compat\\|BAAI/bge-m3\\|1024`，stale=false |';
    const cells = splitTableCells(row).slice(1, -1);
    expect(cells.length).toBe(2);
    expect(cells[1].trim()).toBe('**41 条全部 1024 维**，modelKey=`openai-compat|BAAI/bge-m3|1024`，stale=false');
    expect(cells.join('')).not.toContain('\\');
  });

  test('偶数个反斜杠（\\\\|）：字面反斜杠 + 单元格分隔符', () => {
    const cells = splitTableCells('| a\\\\|b |');
    expect(cells).toEqual(['', ' a\\', 'b ', '']);
  });

  test('空单元格保留，不被过滤', () => {
    expect(splitTableCells('| a |  | c |')).toEqual(['', ' a ', '  ', ' c ', '']);
  });
});

describe('createTableHTML - 渲染层不再多列', () => {
  const header = '| 校验项 | 结果 |';
  const body = [
    '| **tier** | **none** ✅（enabled=false 回退） |',
    '| 配置 | enabled=false, openai-compat, BAAI/bge-m3, 1024（与原始备份逐字段一致）|',
    '| 记忆库 | **事实 38 / 摘要 3 = 41 条**，与基线 ID 集合 **identical=True** |',
    '| 向量 | **41 条全部 1024 维**，modelKey=`openai-compat\\|BAAI/bge-m3\\|1024`，stale=false |',
    '| 零残留 | 7 条测试记忆/测试向量全部不存在，`memtest` 出现 0 次 |',
  ].join('\n');

  test('每行 td 数与表头列数一致（均为 2），无多余列', () => {
    const html = createTableHTML({ header, body, full: header + '\n|---|---|\n' + body });
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelectorAll('thead th').length).toBe(2);
    const rows = div.querySelectorAll('tbody tr');
    expect(rows.length).toBe(5);
    rows.forEach((tr) => {
      expect(tr.querySelectorAll('td').length).toBe(2);
    });
  });

  test('向量行单元格内容：竖线完整保留在行内代码中，无残留反斜杠', () => {
    const html = createTableHTML({ header, body, full: header + '\n|---|---|\n' + body });
    const div = document.createElement('div');
    div.innerHTML = html;

    const vectorCells = div.querySelectorAll('tbody tr')[3].querySelectorAll('td');
    expect(vectorCells.length).toBe(2);
    const code = vectorCells[1].querySelector('code');
    expect(code.textContent).toBe('openai-compat|BAAI/bge-m3|1024');
    expect(vectorCells[1].textContent).toContain('，stale=false');
    expect(vectorCells[1].textContent).not.toContain('\\');
  });
});

describe('表格外层竖线可选（GFM 语义）', () => {
  test('tableRowCells 兼容表头/表体行有无外层竖线', () => {
    expect(tableRowCells('| a | b |')).toEqual([' a ', ' b ']);
    expect(tableRowCells('| a | b')).toEqual([' a ', ' b']);
    expect(tableRowCells('a | b |')).toEqual(['a ', ' b ']);
    expect(tableRowCells('a | b')).toEqual(['a ', ' b']);
    expect(tableRowCells('| 仓库 | 分支 | 提交 | 远端 |')).toHaveLength(4);
  });

  test('表体行缺少外层竖线时整张表被完整提取，不残留竖线段落', () => {
    const md = [
      '| 仓库 | 分支 | 提交 | 远端 |',
      '|---|---|---|---|',
      '`ability-auto-util/web` | `feature/poc-frontend-adapter` | abc123 | origin',
      '`other/repo` | `main` | def456 | upstream',
      '',
      '收尾段落',
    ].join('\n');

    const { text, blocks } = extractTableBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].body.split('\n')).toHaveLength(2);
    expect(text).not.toContain('ability-auto-util');
    expect(text).toContain('%%TABLE_BLOCK_0%%');
    expect(text).toContain('收尾段落');
  });

  test('该类表格渲染为 4 列 2 行，单元格内容完整', () => {
    const { blocks } = extractTableBlocks([
      '| 仓库 | 分支 | 提交 | 远端 |',
      '|---|---|---|---|',
      '`a` | `b` | c | d',
      '| `e` | `f` | g | h |',
    ].join('\n'));
    const div = document.createElement('div');
    div.innerHTML = createTableHTML(blocks[0]);

    expect(div.querySelectorAll('thead th')).toHaveLength(4);
    const rows = div.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    rows.forEach(tr => expect(tr.querySelectorAll('td')).toHaveLength(4));
    expect(rows[0].querySelectorAll('td')[3].textContent.trim()).toBe('d');
    expect(rows[1].querySelectorAll('td')[0].querySelector('code').textContent).toBe('e');
  });

  test('表头也没有外层竖线时同样识别', () => {
    const { blocks } = extractTableBlocks('仓库 | 分支\n---|---\na | b');
    expect(blocks).toHaveLength(1);
    expect(tableRowCells(blocks[0].header)).toHaveLength(2);
  });

  test('表头行尾带空格仍识别，且存储时已去除', () => {
    const { blocks } = extractTableBlocks('| a | b |   \n|---|---|\n| 1 | 2 |');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].header).toBe('| a | b |');
    expect(tableRowCells(blocks[0].header)).toHaveLength(2);
  });

  test('行首缩进的表格不提取，留给 marked 处理（不打乱列表层级）', () => {
    expect(extractTableBlocks('  | a | b |\n  |---|---|\n  | 1 | 2 |').blocks).toHaveLength(0);
  });

  test('分隔行列数与表头不一致时不当作表格', () => {
    expect(extractTableBlocks('a | b\n---').blocks).toHaveLength(0);
  });

  test('表格后的普通段落不被吞进表体', () => {
    const { blocks } = extractTableBlocks('| a | b |\n|---|---|\n| 1 | 2 |\n\n普通段落 | 带竖线');
    expect(blocks[0].body).toBe('| 1 | 2 |');
  });
});

describe('formatMarkdown - 表格占位符还原', () => {
  test('单元格含 $& 等替换模式时不污染输出', () => {
    // formatMarkdown 依赖全局 marked / DOMPurify（生产由 libs-loader 注入），这里给最小实现
    const prevMarked = globalThis.marked;
    const prevPurify = globalThis.DOMPurify;
    globalThis.marked = { setOptions() {}, parse: (t) => `<p>${t}</p>` };
    globalThis.DOMPurify = { sanitize: (h) => h };
    try {
      const html = formatMarkdown('| 价格 | 说明 |\n|---|---|\n| $&.00 | 折扣 $` |');
      // 旧实现把 tableHTML 直接当替换串，$& 会展开成被匹配的占位符 <p>%%TABLE_BLOCK_0%%</p>
      expect(html).not.toContain('%%TABLE_BLOCK_0%%');
      expect(html).toContain('<table');
    } finally {
      globalThis.marked = prevMarked;
      globalThis.DOMPurify = prevPurify;
    }
  });
});

describe('Word 导出 - 含转义竖线的表格列数正确', () => {
  test('docx 表格单元格数 = 行列乘积，不因 \\| 多出列', async () => {
    const md = [
      '| 校验项 | 结果 |',
      '| --- | --- |',
      '| 向量 | modelKey=`openai-compat\\|BAAI/bge-m3\\|1024` |',
    ].join('\n');
    const children = await parseMarkdownToDocxChildren(md);

    const tableXml = children.map(xmlOf).find((x) => x.includes('"w:tc"'));
    expect(tableXml).toBeTruthy();
    // 2 行 × 2 列 = 4 个单元格
    const cellCount = tableXml.split('"w:tc"').length - 1;
    expect(cellCount).toBe(4);
    expect(tableXml).toContain('openai-compat|BAAI/bge-m3|1024');
    expect(tableXml).not.toContain('openai-compat\\\\|');
  });
});
