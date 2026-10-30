// @vitest-environment jsdom
// 待办导入导出的「DOM 动作」部分：真的去点下载链接、真的造一个 file input 选文件。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadTodoExport, pickTodoImportFile } from '../../src/side_panel/todo-io.js';
import { normalizeTodo } from '../../src/side_panel/todo-model.js';

const NOW = new Date(2026, 9, 29, 12, 0, 0).getTime();

function todo(overrides = {}) {
  return normalizeTodo({ id: 't1', title: '写方案', createdAt: NOW, order: 0, ...overrides });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('下载待办导出', () => {
  it('挂 a[download] 点一下，然后清掉临时节点与 objectURL', () => {
    const anchors = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (tag === 'a') anchors.push(el);
      return el;
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    // jsdom 没有 createObjectURL：桩掉，同时验证调用后会被回收
    const createUrl = vi.fn(() => 'blob:todo-export');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));

    const name = downloadTodoExport([todo()], { scope: 'all', format: 'json', now: NOW });

    expect(name).toBe('ai-helper-todos-2026-10-29.json');
    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toBe(name);
    expect(anchors[0].href).toBe('blob:todo-export');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledWith('blob:todo-export');
    // 临时 a 不能留在文档里
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });
});

describe('选导入文件', () => {
  it('只放行 .json，选完返回文件', async () => {
    let input = null;
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () {
      input = this;
    });

    const pending = pickTodoImportFile();
    expect(click).toHaveBeenCalledOnce();
    expect(input).toBeTruthy();
    expect(input.type).toBe('file');
    expect(input.accept).toContain('.json');

    const file = { name: 'todos.json', text: async () => '[]' };
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));

    await expect(pending).resolves.toBe(file);
  });

  it('用户取消选择 → 返回 null，调用方不用自己判空', async () => {
    let input = null;
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () {
      input = this;
    });

    const pending = pickTodoImportFile();
    input.dispatchEvent(new Event('cancel'));

    await expect(pending).resolves.toBeNull();
  });
});
