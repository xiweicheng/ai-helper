// 待办导入导出的「文件内容」部分：文件名、Blob 内容、读文件后的解析结果。
// 真正触发下载/选文件这类 DOM 动作由 todo-io-dom.unit.test.js 覆盖。
import { describe, it, expect } from 'vitest';
import {
  todoExportFileName,
  buildTodoExportFile,
  readTodoImportFile,
} from '../../src/side_panel/todo-io.js';
import { normalizeTodo, parseTodoImport } from '../../src/side_panel/todo-model.js';

const NOW = new Date(2026, 9, 29, 12, 0, 0).getTime();

function todo(overrides = {}) {
  return normalizeTodo({ id: 't1', title: '写方案', createdAt: NOW, order: 0, ...overrides });
}

describe('待办导出文件', () => {
  it('文件名带范围与日期，后缀随格式', () => {
    expect(todoExportFileName('all', 'json', NOW)).toBe('ai-helper-todos-2026-10-29.json');
    expect(todoExportFileName('active', 'md', NOW)).toBe('ai-helper-todos-active-2026-10-29.md');
    expect(todoExportFileName('done', 'json', NOW)).toBe('ai-helper-todos-done-2026-10-29.json');
    // 范围脏值按全部处理，别把非法字符写进文件名
    expect(todoExportFileName('weird', 'json', NOW)).toBe('ai-helper-todos-2026-10-29.json');
  });

  it('JSON 文件是标准类型，内容能被自己的解析器认回来', async () => {
    const { filename, blob } = buildTodoExportFile([todo()], { scope: 'active', format: 'json', now: NOW });
    expect(filename).toBe('ai-helper-todos-active-2026-10-29.json');
    expect(blob.type).toContain('application/json');
    const payload = JSON.parse(await blob.text());
    expect(payload.scope).toBe('active');
    expect(parseTodoImport(payload)).toEqual({ ok: true, todos: [payload.todos[0]] });
  });

  it('Markdown 文件是文本类型，头部说明 + 同款清单条目', async () => {
    const { filename, blob } = buildTodoExportFile([todo()], { scope: 'all', format: 'md', now: NOW });
    expect(filename).toBe('ai-helper-todos-2026-10-29.md');
    expect(blob.type).toContain('text/markdown');
    const text = await blob.text();
    expect(text.startsWith('# ')).toBe(true);
    expect(text).toContain('- [ ] 写方案');
  });
});

describe('读取导入文件', () => {
  it('合法 JSON → 交给 parseTodoImport', async () => {
    const r = await readTodoImportFile({
      text: async () => JSON.stringify({ todos: [{ id: 'x', title: 'A' }] }),
    });
    expect(r).toEqual({ ok: true, todos: [{ id: 'x', title: 'A' }] });
  });

  it('不是 JSON → reason 是 json', async () => {
    expect(await readTodoImportFile({ text: async () => 'nope' })).toEqual({ ok: false, reason: 'json' });
  });

  it('是 JSON 但不是待办结构 → reason 是 format', async () => {
    expect(await readTodoImportFile({ text: async () => '{}' })).toEqual({ ok: false, reason: 'format' });
  });

  it('读文件抛错也收成 reason json，不把异常甩给调用方', async () => {
    const r = await readTodoImportFile({ text: async () => { throw new Error('boom'); } });
    expect(r).toEqual({ ok: false, reason: 'json' });
  });
});
