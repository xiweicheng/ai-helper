// side_panel/todo-io-dialogs.js - 待办导入/导出的选项弹窗
//
// 导出：一个入口 → 一个弹窗把「范围 + 格式」一次选完，不再套二级菜单；
// 导入：一个入口 → 选完文件再问「合并 / 替换」。
// 构建 HTML 的是纯函数（可单测），下面只负责挂载、单选回写与开关。

import { t, subscribe, registerTranslations } from '../shared/i18n.js';
import { escapeAttr, escapeHtml } from './utils.js';

const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>';

const RANGE_VALUES = ['all', 'active', 'done'];
const FORMAT_VALUES = ['json', 'md'];
const MODE_VALUES = ['merge', 'replace'];

registerTranslations('zh', {
  todoIo: {
    exportTitle: '导出待办',
    importTitle: '导入待办',
    close: '关闭',
    rangeLabel: '范围',
    formatLabel: '格式',
    scopeAll: '全部',
    scopeActive: '待办',
    scopeDone: '已完成',
    emptyRange: '这个范围里没有待办',
    modeLabel: '方式',
    modeMerge: '合并到现有',
    modeMergeHint: '重复的条目自动跳过',
    modeReplace: '替换全部',
    modeReplaceHint: '删除当前 {n} 条，不可撤销',
    importSummary: '文件里 {count} 条待办，当前清单 {existing} 条',
    replaceWarn: '将删除当前全部待办，并写入文件里的 {count} 条。此操作不可撤销，确定继续吗？',
    exportAction: '导出',
    importAction: '导入',
    cancel: '取消',
  },
});

registerTranslations('en', {
  todoIo: {
    exportTitle: 'Export todos',
    importTitle: 'Import todos',
    close: 'Close',
    rangeLabel: 'Range',
    formatLabel: 'Format',
    scopeAll: 'All',
    scopeActive: 'To do',
    scopeDone: 'Done',
    emptyRange: 'No todos in this range',
    modeLabel: 'Mode',
    modeMerge: 'Merge into current',
    modeMergeHint: 'Duplicates are skipped',
    modeReplace: 'Replace all',
    modeReplaceHint: 'Deletes all {n} current todos, cannot be undone',
    importSummary: '{count} todos in the file, {existing} in the list now',
    replaceWarn: 'All current todos will be deleted and {count} todos from the file written in. This cannot be undone. Continue?',
    exportAction: 'Export',
    importAction: 'Import',
    cancel: 'Cancel',
  },
});

function headerHtml(title) {
  return `<div class="todo-io-header">
      <span class="todo-io-title">${escapeHtml(title)}</span>
      <button type="button" class="todo-io-close" data-io-action="cancel"
        title="${escapeAttr(t('todoIo.close'))}" aria-label="${escapeAttr(t('todoIo.close'))}">${CLOSE_ICON}</button>
    </div>`;
}

function actionsHtml(confirmLabel, disabled) {
  return `<div class="todo-io-actions">
      <button type="button" class="todo-io-btn" data-io-action="cancel">${escapeHtml(t('todoIo.cancel'))}</button>
      <button type="button" class="todo-io-btn primary" data-io-action="confirm"${disabled ? ' disabled' : ''}>${escapeHtml(confirmLabel)}</button>
    </div>`;
}

function optionHtml({ field, value, label, hint, checked, count, danger }) {
  const meta = Number.isFinite(count)
    ? `<em class="todo-io-count" data-io-count="${count}">${count}</em>`
    : '';
  return `<label class="todo-io-option${danger ? ' danger' : ''}">
      <input type="radio" name="todoIo-${escapeAttr(field)}" value="${escapeAttr(value)}"
        data-io-field="${escapeAttr(field)}"${checked ? ' checked' : ''} />
      <span class="todo-io-option-main">
        <span class="todo-io-option-label">${escapeHtml(label)}</span>
        ${hint ? `<span class="todo-io-option-hint">${escapeHtml(hint)}</span>` : ''}
      </span>
      ${meta}
    </label>`;
}

/**
 * 导出选项弹窗 HTML：范围三选一 + 格式二选一
 * @param {{scope: string, format: string}} state
 * @param {{all?: number, active?: number, done?: number}} counts
 */
export function buildExportDialogHtml(state, counts = {}) {
  const scope = RANGE_VALUES.includes(state?.scope) ? state.scope : 'all';
  const format = FORMAT_VALUES.includes(state?.format) ? state.format : 'json';
  const selectedCount = Number(counts[scope] || 0);
  const empty = selectedCount === 0;

  const ranges = [
    ['all', t('todoIo.scopeAll')],
    ['active', t('todoIo.scopeActive')],
    ['done', t('todoIo.scopeDone')],
  ].map(([value, label]) => optionHtml({
    field: 'scope',
    value,
    label,
    checked: value === scope,
    count: Number(counts[value] || 0),
  })).join('');

  const formats = [
    ['json', t('todo.exportJson')],
    ['md', t('todo.exportMd')],
  ].map(([value, label]) => optionHtml({
    field: 'format',
    value,
    label,
    checked: value === format,
  })).join('');

  return `<div class="todo-io-card" role="dialog" aria-modal="true" tabindex="-1"
      aria-label="${escapeAttr(t('todoIo.exportTitle'))}">
    ${headerHtml(t('todoIo.exportTitle'))}
    <div class="todo-io-body">
      <div class="todo-io-group">
        <div class="todo-io-group-label">${escapeHtml(t('todoIo.rangeLabel'))}</div>
        <div class="todo-io-options" role="radiogroup" aria-label="${escapeAttr(t('todoIo.rangeLabel'))}">${ranges}</div>
      </div>
      <div class="todo-io-group">
        <div class="todo-io-group-label">${escapeHtml(t('todoIo.formatLabel'))}</div>
        <div class="todo-io-options" role="radiogroup" aria-label="${escapeAttr(t('todoIo.formatLabel'))}">${formats}</div>
      </div>
      <p class="todo-io-hint${empty ? ' show' : ''}" data-io-hint>${escapeHtml(t('todoIo.emptyRange'))}</p>
    </div>
    ${actionsHtml(t('todoIo.exportAction'), empty)}
  </div>`;
}

/**
 * 导入选项弹窗 HTML：合并 / 替换
 * @param {{mode: string}} state
 * @param {{count: number, existing: number}} info
 */
export function buildImportDialogHtml(state, info = {}) {
  const mode = MODE_VALUES.includes(state?.mode) ? state.mode : 'merge';
  const count = Number(info.count || 0);
  const existing = Number(info.existing || 0);

  const modes = [
    ['merge', t('todoIo.modeMerge'), t('todoIo.modeMergeHint')],
    ['replace', t('todoIo.modeReplace'), t('todoIo.modeReplaceHint', { n: existing })],
  ].map(([value, label, hint]) => optionHtml({
    field: 'mode',
    value,
    label,
    hint,
    checked: value === mode,
    danger: value === 'replace',
  })).join('');

  return `<div class="todo-io-card" role="dialog" aria-modal="true" tabindex="-1"
      aria-label="${escapeAttr(t('todoIo.importTitle'))}">
    ${headerHtml(t('todoIo.importTitle'))}
    <div class="todo-io-body">
      <p class="todo-io-summary">${escapeHtml(t('todoIo.importSummary', { count, existing }))}</p>
      <div class="todo-io-group">
        <div class="todo-io-group-label">${escapeHtml(t('todoIo.modeLabel'))}</div>
        <div class="todo-io-options" role="radiogroup" aria-label="${escapeAttr(t('todoIo.modeLabel'))}">${modes}</div>
      </div>
      <p class="todo-io-warn${mode === 'replace' ? ' show' : ''}" data-io-warn>${escapeHtml(t('todoIo.replaceWarn', { count }))}</p>
    </div>
    ${actionsHtml(t('todoIo.importAction'), false)}
  </div>`;
}

// ==================== 挂载与开关 ====================

let overlayEl = null;
/** @type {{kind: 'export'|'import', state: object, counts?: object, info?: object, resolve: Function}|null} */
let session = null;
let escHandler = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement('div');
  overlayEl.className = 'todo-io-overlay';
  overlayEl.id = 'todoIoOverlay';
  // 事件挂在容器上：内容随语言/选项重刷，监听器不用跟着重建
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) {
      settle(null);
      return;
    }
    const btn = e.target.closest?.('[data-io-action]');
    if (btn?.dataset.ioAction === 'cancel') settle(null);
    else if (btn?.dataset.ioAction === 'confirm') confirm();
  });
  overlayEl.addEventListener('change', (e) => {
    if (!session) return;
    const input = e.target.closest?.('input[data-io-field]');
    if (!input) return;
    session.state[input.dataset.ioField] = input.value;
    sync();
  });
  document.body.appendChild(overlayEl);
  return overlayEl;
}

function paint() {
  if (!session) return;
  const overlay = ensureOverlay();
  overlay.innerHTML = session.kind === 'export'
    ? buildExportDialogHtml(session.state, session.counts)
    : buildImportDialogHtml(session.state, session.info);
  sync();
}

/** 只更新随选择变化的派生状态，不重建 DOM（重建会把键盘焦点弄丢） */
function sync() {
  if (!session || !overlayEl) return;
  if (session.kind === 'export') {
    const empty = !Number(session.counts[session.state.scope] || 0);
    const confirmBtn = overlayEl.querySelector('[data-io-action="confirm"]');
    if (confirmBtn) confirmBtn.disabled = empty;
    overlayEl.querySelector('[data-io-hint]')?.classList.toggle('show', empty);
    return;
  }
  overlayEl.querySelector('[data-io-warn]')?.classList.toggle('show', session.state.mode === 'replace');
}

function confirm() {
  if (!session) return;
  if (session.kind === 'export') {
    // 0 条时按钮本身是禁用的，这里再挡一层：不生成空文件
    if (!Number(session.counts[session.state.scope] || 0)) return;
    settle({ scope: session.state.scope, format: session.state.format });
    return;
  }
  settle(session.state.mode);
}

function settle(value) {
  if (!session) return;
  const { resolve } = session;
  session = null;
  overlayEl?.classList.remove('show');
  unbindEsc();
  resolve(value);
}

function bindEsc() {
  if (escHandler) return;
  escHandler = (e) => {
    if (e.key !== 'Escape') return;
    // 别让 Esc 顺带把侧边栏会话收掉：弹窗是当前焦点
    e.stopPropagation();
    settle(null);
  };
  document.addEventListener('keydown', escHandler);
}

function unbindEsc() {
  if (!escHandler) return;
  document.removeEventListener('keydown', escHandler);
  escHandler = null;
}

function open(kind, state, extra) {
  // 上一次没关就再开：先按取消收尾，避免上一个 Promise 永远悬着
  if (session) settle(null);
  return new Promise((resolve) => {
    session = { kind, state, ...extra, resolve };
    paint();
    overlayEl.classList.add('show');
    bindEsc();
    overlayEl.querySelector('.todo-io-card')?.focus();
  });
}

/**
 * 打开导出选项弹窗
 * @param {{counts: object, scope?: string, format?: string}} [options]
 * @returns {Promise<{scope: string, format: string}|null>} 取消为 null
 */
export function openExportOptions({ counts = {}, scope = 'all', format = 'json' } = {}) {
  return open('export', {
    scope: RANGE_VALUES.includes(scope) ? scope : 'all',
    format: FORMAT_VALUES.includes(format) ? format : 'json',
  }, { counts });
}

/**
 * 打开导入选项弹窗
 * @param {{count?: number, existing?: number, mode?: string}} [options]
 * @returns {Promise<'merge'|'replace'|null>} 取消为 null
 */
export function openImportOptions({ count = 0, existing = 0, mode = 'merge' } = {}) {
  return open('import', { mode: MODE_VALUES.includes(mode) ? mode : 'merge' }, { info: { count, existing } });
}

// 语言热切换：弹窗开着的时候标题、选项、按钮都要跟着变
subscribe(() => {
  if (!session) return;
  paint();
  overlayEl.querySelector('.todo-io-card')?.focus();
});
