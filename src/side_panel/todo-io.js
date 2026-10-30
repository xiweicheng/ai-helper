// side_panel/todo-io.js - 待办导入导出的浏览器侧落地（Blob / 下载 / 选文件）
//
// 文件「内容」由 todo-model 生成（纯逻辑、可单测），这里只负责把它变成一个下载动作，
// 以及把用户挑中的文件读成 JSON 交给解析器。

import { buildTodoExportPayload, buildTodoMarkdownExport, parseTodoImport } from './todo-model.js';

const EXPORT_SCOPES = ['all', 'active', 'done'];
const FORMATS = {
  json: { ext: 'json', type: 'application/json;charset=utf-8' },
  md: { ext: 'md', type: 'text/markdown;charset=utf-8' },
};

function normalizeFormat(format) {
  return format === 'md' ? 'md' : 'json';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 文件名里的日期：只到天，同一天多次导出靠浏览器自动加序号 */
function fileDate(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 导出文件名：ai-helper-todos[-active|-done]-YYYY-MM-DD.ext
 * @param {'all'|'active'|'done'} scope
 * @param {'json'|'md'} format
 * @param {number} [now]
 */
export function todoExportFileName(scope, format, now = Date.now()) {
  const picked = EXPORT_SCOPES.includes(scope) ? scope : 'all';
  const suffix = picked === 'all' ? '' : `-${picked}`;
  return `ai-helper-todos${suffix}-${fileDate(now)}.${FORMATS[normalizeFormat(format)].ext}`;
}

/**
 * 组装导出文件（文件名 + Blob），不触发下载，便于单测与「先看内容再决定存哪」
 * @param {Array<Object>} todos
 * @param {{scope?: string, format?: 'json'|'md', now?: number}} [options]
 */
export function buildTodoExportFile(todos, options = {}) {
  const scope = EXPORT_SCOPES.includes(options.scope) ? options.scope : 'all';
  const format = normalizeFormat(options.format);
  const now = options.now || Date.now();
  const content = format === 'md'
    ? buildTodoMarkdownExport(todos, { scope, now })
    : JSON.stringify(buildTodoExportPayload(todos, { scope, now }), null, 2);
  return {
    filename: todoExportFileName(scope, format, now),
    blob: new Blob([content], { type: FORMATS[format].type }),
  };
}

/** 触发浏览器下载，返回文件名（调用方拿去提示） */
export function downloadTodoExport(todos, options = {}) {
  const { filename, blob } = buildTodoExportFile(todos, options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // 下载已经开始，对象 URL 没必要继续占内存
  URL.revokeObjectURL(url);
  return filename;
}

/**
 * 弹文件选择框，resolve 出用户选的文件（取消则为 null）
 * 只放行 .json：现在只认导出的 JSON，Markdown 是给人看的
 */
export function pickTodoImportFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    let settled = false;
    const done = (file) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => done(input.files && input.files[0] ? input.files[0] : null));
    // Chrome 在用户取消时会派发 cancel：不接这个事件，Promise 会一直悬着
    input.addEventListener('cancel', () => done(null));

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * 读导入文件并解析
 * @param {{text: () => Promise<string>}} file
 * @returns {Promise<{ok: true, todos: Array<Object>} | {ok: false, reason: 'json'|'format'}>}
 */
export async function readTodoImportFile(file) {
  if (!file || typeof file.text !== 'function') return { ok: false, reason: 'json' };
  let text = '';
  try {
    text = await file.text();
  } catch (e) {
    return { ok: false, reason: 'json' };
  }
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'json' };
  }
  return parseTodoImport(data);
}
