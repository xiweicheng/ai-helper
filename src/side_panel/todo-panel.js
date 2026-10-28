// side_panel/todo-panel.js - 侧边栏待办面板
//
// 入口挂在右侧功能轨道的 todo 槽位（第 6 个），点开为右缘浮层。
// 交互约定：
// - 行内常驻只有「状态圈 + 标题」，编辑/复制/更多在悬停或键盘聚焦时才浮现；
// - 不常用动作（备注、截止、删除）收进行尾「⋯」菜单，头部「⋯」收纳批量动作；
// - 拖拽只在「进行中」组内生效，插入位置用虚线段提示，跨组改状态只走状态圈。

import { t, registerTranslations } from '../shared/i18n.js';
import { getSideRailSlot } from './side-rail.js';
import {
  escapeHtml,
  escapeAttr,
  showToast,
  clampPanelToViewport,
  releasePanelClamp,
  adjustInputHeight,
} from './utils.js';
import {
  addTodo,
  updateTodo,
  removeTodo,
  cycleTodoStatus,
  reorderActiveTodos,
  clearCompletedTodos,
  getTodoGroups,
  subscribeTodos,
} from './todo-manager.js';
import {
  TODO_STATUS,
  nextStatus,
  buildTodoDigest,
  formatRelativeTime,
  formatDueAt,
  formatDoneStamp,
  isOverdue,
} from './todo-model.js';
import logger from '../shared/logger.js';

registerTranslations('zh', {
  todo: {
    toggleTitle: '待办',
    title: '待办',
    fillInput: '填入输入框',
    fillInputTitle: '把待办清单填入问答输入框',
    placeholder: '添加待办，回车保存',
    addTitle: '添加',
    empty: '暂无待办',
    emptyHint: '在上方输入后回车即可添加',
    activeGroup: '进行中',
    doneGroup: '已完成',
    noteToggle: '备注',
    notePlaceholder: '补充备注（可选）',
    noteSave: '保存',
    noteCancel: '取消',
    editTitleAction: '编辑标题',
    addNote: '添加备注',
    editNote: '编辑备注',
    setDue: '设置截止',
    clearDue: '清除截止',
    delete: '删除',
    deleteConfirmTitle: '删除待办',
    deleteConfirmMsg: '确定删除「{title}」吗？',
    more: '更多操作',
    headerMore: '更多',
    copyItem: '复制本条',
    editItem: '编辑',
    copyClipboard: '复制到剪贴板',
    copyWithPrompt: '复制并附提问模板',
    clearCompleted: '清除已完成',
    clearCompletedConfirmTitle: '清除已完成',
    clearCompletedConfirmMsg: '确定删除全部 {n} 条已完成待办吗？',
    statusPending: '待处理',
    statusDoing: '处理中',
    statusDone: '已完成',
    markAs: '标记为{status}',
    filledToast: '已填入输入框',
    copiedToast: '已复制到剪贴板',
    copiedPromptToast: '已复制（含提问模板）',
    emptyDigestToast: '暂无可复制的待办',
    noInputToast: '未找到输入框',
    saveFailed: '保存失败，请重试',
    deletedToast: '已删除',
    clearedToast: '已清除已完成',
  },
});

registerTranslations('en', {
  todo: {
    toggleTitle: 'Todos',
    title: 'Todos',
    fillInput: 'To input',
    fillInputTitle: 'Insert todo list into the chat input',
    placeholder: 'Add a todo, press Enter',
    addTitle: 'Add',
    empty: 'No todos',
    emptyHint: 'Type above and press Enter to add',
    activeGroup: 'In progress',
    doneGroup: 'Done',
    noteToggle: 'Note',
    notePlaceholder: 'Add a note (optional)',
    noteSave: 'Save',
    noteCancel: 'Cancel',
    editTitleAction: 'Edit title',
    addNote: 'Add note',
    editNote: 'Edit note',
    setDue: 'Set due date',
    clearDue: 'Clear due date',
    delete: 'Delete',
    deleteConfirmTitle: 'Delete todo',
    deleteConfirmMsg: 'Delete "{title}"?',
    more: 'More actions',
    headerMore: 'More',
    copyItem: 'Copy this',
    editItem: 'Edit',
    copyClipboard: 'Copy to clipboard',
    copyWithPrompt: 'Copy with prompt',
    clearCompleted: 'Clear completed',
    clearCompletedConfirmTitle: 'Clear completed',
    clearCompletedConfirmMsg: 'Delete all {n} completed todos?',
    statusPending: 'Pending',
    statusDoing: 'In progress',
    statusDone: 'Done',
    markAs: 'Mark as {status}',
    filledToast: 'Inserted into input',
    copiedToast: 'Copied to clipboard',
    copiedPromptToast: 'Copied with prompt',
    emptyDigestToast: 'Nothing to copy',
    noInputToast: 'Input box not found',
    saveFailed: 'Failed to save, try again',
    deletedToast: 'Deleted',
    clearedToast: 'Completed todos cleared',
  },
});

const DONE_EXPANDED_KEY = 'todoDoneGroupExpanded';
const MENU_WIDTH = 132;

const ICONS = {
  listCheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>',
  fill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 19h16"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 16.5v.01"/></svg>',
};

let containerEl = null;
let panelEl = null;
let bodyEl = null;
let countEl = null;
let progressEl = null;
let addInputEl = null;
let toggleEl = null;
let badgeEl = null;
let menuEl = null;

let doneExpanded = false;
let titleEditId = null;
let noteEditId = null;
let dueEditId = null;
let expandedNoteIds = new Set();
let dragState = null;
let initialized = false;

// ==================== 初始化 ====================

/** 创建入口按钮与面板 DOM，并挂入右侧轨道 todo 槽位 */
export function initTodoPanel() {
  if (initialized) return;
  initialized = true;

  try {
    chrome.storage.local.get([DONE_EXPANDED_KEY], (result) => {
      doneExpanded = result?.[DONE_EXPANDED_KEY] === true;
      render();
    });
  } catch (e) { /* 非扩展上下文（单测/jsdom）忽略 */ }

  containerEl = document.createElement('div');
  containerEl.className = 'todo-panel-container';
  containerEl.id = 'todoPanelContainer';
  containerEl.innerHTML = `
    <button class="todo-panel-toggle" id="todoPanelToggle" title="${escapeAttr(t('todo.toggleTitle'))}" aria-label="${escapeAttr(t('todo.toggleTitle'))}">
      <span class="todo-badge" id="todoBadge" style="display:none;"></span>
      ${ICONS.listCheck}
    </button>
    <div class="todo-panel" id="todoPanel">
      <div class="todo-panel-header">
        <span class="todo-panel-icon">${ICONS.listCheck}</span>
        <span class="todo-panel-title">${escapeHtml(t('todo.title'))}</span>
        <span class="todo-panel-count" id="todoPanelCount">0 / 0</span>
        <div class="todo-panel-actions">
          <button class="todo-fill-btn" data-action="fill-input" title="${escapeAttr(t('todo.fillInputTitle'))}">
            ${ICONS.fill}<span>${escapeHtml(t('todo.fillInput'))}</span>
          </button>
          <button class="todo-icon-btn" data-action="header-more" title="${escapeAttr(t('todo.headerMore'))}" aria-label="${escapeAttr(t('todo.headerMore'))}">${ICONS.more}</button>
          <button class="todo-icon-btn" data-action="close" title="${escapeAttr(t('common.close'))}" aria-label="${escapeAttr(t('common.close'))}">${ICONS.close}</button>
        </div>
      </div>
      <div class="todo-progress"><i id="todoProgressBar" style="width:0%"></i></div>
      <div class="todo-add">
        <input type="text" class="todo-add-input" id="todoAddInput" placeholder="${escapeAttr(t('todo.placeholder'))}" autocomplete="off" />
        <button class="todo-add-btn" data-action="add" title="${escapeAttr(t('todo.addTitle'))}" aria-label="${escapeAttr(t('todo.addTitle'))}">+</button>
      </div>
      <div class="todo-body" id="todoBody"></div>
    </div>
  `;
  getSideRailSlot('todo').appendChild(containerEl);

  toggleEl = containerEl.querySelector('#todoPanelToggle');
  panelEl = containerEl.querySelector('#todoPanel');
  bodyEl = containerEl.querySelector('#todoBody');
  countEl = containerEl.querySelector('#todoPanelCount');
  progressEl = containerEl.querySelector('#todoProgressBar');
  addInputEl = containerEl.querySelector('#todoAddInput');
  badgeEl = containerEl.querySelector('#todoBadge');

  toggleEl.addEventListener('click', togglePanel);
  containerEl.addEventListener('click', handleClick);
  containerEl.addEventListener('change', handleChange);
  containerEl.addEventListener('keydown', handleKeydown);
  bodyEl.addEventListener('dragstart', handleDragStart);
  bodyEl.addEventListener('dragover', handleDragOver);
  bodyEl.addEventListener('drop', handleDrop);
  bodyEl.addEventListener('dragend', cleanupDrag);
  bodyEl.addEventListener('focusout', handleFocusOut);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuEl) closeMenu();
  });
  document.addEventListener('click', (e) => {
    if (!menuEl) return;
    if (menuEl.contains(e.target)) return;
    closeMenu();
  }, true);

  subscribeTodos(() => render());
  render();
}

// ==================== 开关 ====================

function isOpen() {
  return !!panelEl && panelEl.classList.contains('expanded');
}

function togglePanel() {
  if (isOpen()) closePanel();
  else openPanel();
}

function openPanel() {
  render();
  panelEl.classList.add('expanded');
  toggleEl.classList.add('active');
  clampPanelToViewport(panelEl);
  setTimeout(() => {
    if (isOpen()) addInputEl.focus();
  }, 60);
}

function closePanel() {
  panelEl.classList.remove('expanded');
  toggleEl.classList.remove('active');
  releasePanelClamp(panelEl);
  closeMenu();
  cancelInlineEdit();
}

/** 供其它模块（如快捷键）调用 */
export function closeTodoPanel() {
  if (isOpen()) closePanel();
}

// ==================== 渲染 ====================

function render() {
  if (!bodyEl) return;
  const { active, done, stats } = getTodoGroups();

  countEl.textContent = `${stats.done} / ${stats.total}`;
  progressEl.style.width = stats.total ? `${Math.round((stats.done / stats.total) * 100)}%` : '0%';
  updateBadge(active.length);

  const parts = [];
  parts.push(`<div class="todo-section">
      <span class="todo-section-name">${escapeHtml(t('todo.activeGroup'))}</span>
      <span class="todo-section-count">${active.length}</span>
    </div>`);

  if (stats.total === 0) {
    parts.push(`<div class="todo-empty">
        <div class="todo-empty-title">${escapeHtml(t('todo.empty'))}</div>
        <div class="todo-empty-hint">${escapeHtml(t('todo.emptyHint'))}</div>
      </div>`);
  } else {
    parts.push(`<div class="todo-list" data-group="active">${active.map(todo => renderItem(todo, 'active')).join('')}</div>`);
  }

  if (done.length > 0) {
    parts.push(`<div class="todo-section todo-section-done" data-action="toggle-done" role="button" tabindex="0">
        <span class="todo-section-chevron${doneExpanded ? ' open' : ''}">${ICONS.chevron}</span>
        <span class="todo-section-name">${escapeHtml(t('todo.doneGroup'))}</span>
        <span class="todo-section-count">${done.length}</span>
      </div>`);
    if (doneExpanded) {
      parts.push(`<div class="todo-list" data-group="done">${done.map(todo => renderItem(todo, 'done')).join('')}</div>`);
    }
  }

  bodyEl.innerHTML = parts.join('');
  if (titleEditId) focusTitleInput();
}

function updateBadge(count) {
  if (!badgeEl) return;
  if (count > 0) {
    badgeEl.textContent = count > 99 ? '99+' : String(count);
    badgeEl.style.display = '';
  } else {
    badgeEl.style.display = 'none';
  }
}

function statusLabel(status) {
  if (status === TODO_STATUS.DONE) return t('todo.statusDone');
  if (status === TODO_STATUS.DOING) return t('todo.statusDoing');
  return t('todo.statusPending');
}

function renderStatusButton(todo) {
  const label = t('todo.markAs', { status: statusLabel(nextStatus(todo.status)) });
  const inner = todo.status === TODO_STATUS.DONE
    ? ICONS.check
    : (todo.status === TODO_STATUS.DOING ? '<i></i>' : '');
  return `<button class="todo-status" data-action="cycle" data-id="${escapeAttr(todo.id)}"
      title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">${inner}</button>`;
}

function renderMeta(todo) {
  if (todo.status === TODO_STATUS.DONE) {
    return `<div class="todo-meta"><span>${escapeHtml(formatDoneStamp(todo))}</span></div>`;
  }
  const bits = [];
  if (Number.isFinite(todo.dueAt)) {
    const overdue = isOverdue(todo);
    const text = overdue
      ? t('todoTime.overdueStamp', { date: formatDueAt(todo.dueAt) })
      : formatDueAt(todo.dueAt);
    bits.push(`<span class="todo-due${overdue ? ' overdue' : ''}">${ICONS.alert}${escapeHtml(text)}</span>`);
  }
  const created = formatRelativeTime(todo.createdAt);
  if (created) bits.push(`<span>${escapeHtml(created)}</span>`);
  if (bits.length === 0) return '';
  return `<div class="todo-meta">${bits.join('<span class="todo-sep">·</span>')}</div>`;
}

function renderNote(todo) {
  const expanded = expandedNoteIds.has(todo.id);
  const editing = noteEditId === todo.id;
  const hasNote = !!(todo.note && todo.note.trim());

  if (editing) {
    return `<div class="todo-note-editor">
        <textarea class="todo-note-input" data-id="${escapeAttr(todo.id)}" rows="2"
          placeholder="${escapeAttr(t('todo.notePlaceholder'))}">${escapeHtml(todo.note || '')}</textarea>
        <div class="todo-note-editor-actions">
          <button class="todo-mini-btn" data-action="note-save" data-id="${escapeAttr(todo.id)}">${escapeHtml(t('todo.noteSave'))}</button>
          <button class="todo-mini-btn ghost" data-action="note-cancel" data-id="${escapeAttr(todo.id)}">${escapeHtml(t('todo.noteCancel'))}</button>
        </div>
      </div>`;
  }

  if (!hasNote) return '';
  return `<button class="todo-note-toggle${expanded ? ' open' : ''}" data-action="toggle-note" data-id="${escapeAttr(todo.id)}">
      ${ICONS.chevron}<span>${escapeHtml(t('todo.noteToggle'))}</span>
    </button>
    ${expanded ? `<div class="todo-note">${escapeHtml(todo.note)}</div>` : ''}`;
}

function renderItem(todo, group) {
  const isDone = todo.status === TODO_STATUS.DONE;
  const editingTitle = titleEditId === todo.id;
  const classes = ['todo-item'];
  if (todo.status === TODO_STATUS.DOING) classes.push('doing');
  if (isDone) classes.push('done');
  if (dueEditId === todo.id) classes.push('editing-due');

  const titleHtml = editingTitle
    ? `<input type="text" class="todo-edit-input" data-id="${escapeAttr(todo.id)}" value="${escapeAttr(todo.title)}" />`
    : `<div class="todo-name">${escapeHtml(todo.title)}</div>`;

  const dueHtml = dueEditId === todo.id
    ? `<div class="todo-due-editor">
        <input type="date" class="todo-due-input" data-id="${escapeAttr(todo.id)}" value="${toDateInputValue(todo.dueAt)}" />
        <button class="todo-mini-btn ghost" data-action="due-clear" data-id="${escapeAttr(todo.id)}">${escapeHtml(t('todo.clearDue'))}</button>
      </div>`
    : '';

  const draggable = group === 'active' ? ' draggable="true"' : '';
  const actions = `
    <div class="todo-item-actions">
      <button class="todo-act" data-action="edit-title" data-id="${escapeAttr(todo.id)}" title="${escapeAttr(t('todo.editItem'))}" aria-label="${escapeAttr(t('todo.editItem'))}">${ICONS.edit}</button>
      <button class="todo-act" data-action="copy-item" data-id="${escapeAttr(todo.id)}" title="${escapeAttr(t('todo.copyItem'))}" aria-label="${escapeAttr(t('todo.copyItem'))}">${ICONS.copy}</button>
      <button class="todo-act" data-action="row-more" data-id="${escapeAttr(todo.id)}" title="${escapeAttr(t('todo.more'))}" aria-label="${escapeAttr(t('todo.more'))}">${ICONS.more}</button>
    </div>`;

  return `<div class="${classes.join(' ')}" data-id="${escapeAttr(todo.id)}" data-group="${group}"${draggable}>
      ${renderStatusButton(todo)}
      <div class="todo-main">
        ${titleHtml}
        ${renderNote(todo)}
        ${dueHtml}
        ${renderMeta(todo)}
      </div>
      ${actions}
    </div>`;
}

function focusTitleInput() {
  const input = bodyEl.querySelector(`.todo-edit-input[data-id="${titleEditId}"]`);
  if (!input) return;
  input.focus();
  input.selectionStart = input.selectionEnd = input.value.length;
}

function toDateInputValue(ts) {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ==================== 事件 ====================

function handleClick(e) {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id;

  switch (action) {
    case 'close':
      e.stopPropagation();
      closePanel();
      return;
    case 'fill-input':
      e.stopPropagation();
      fillInput(false);
      return;
    case 'header-more':
      e.stopPropagation();
      openHeaderMenu(actionEl);
      return;
    case 'add':
      e.stopPropagation();
      submitQuickAdd();
      return;
    case 'toggle-done':
      doneExpanded = !doneExpanded;
      persistDoneExpanded();
      render();
      return;
    case 'cycle':
      e.stopPropagation();
      cycleTodoStatus(id);
      return;
    case 'toggle-note':
      e.stopPropagation();
      if (expandedNoteIds.has(id)) expandedNoteIds.delete(id);
      else expandedNoteIds.add(id);
      render();
      return;
    case 'edit-title':
      e.stopPropagation();
      cancelInlineEdit();
      titleEditId = id;
      render();
      return;
    case 'copy-item': {
      e.stopPropagation();
      const { active, done } = getTodoGroups();
      const todo = [...active, ...done].find(item => item.id === id);
      if (todo) copyText(todo.title, t('todo.copiedToast'));
      return;
    }
    case 'row-more':
      e.stopPropagation();
      openRowMenu(actionEl, id);
      return;
    case 'note-save':
      e.stopPropagation();
      saveNote(id);
      return;
    case 'note-cancel':
      e.stopPropagation();
      noteEditId = null;
      render();
      return;
    case 'due-clear':
      e.stopPropagation();
      dueEditId = null;
      updateTodo(id, { dueAt: null });
      return;
    default:
      return;
  }
}

function handleKeydown(e) {
  // 快速添加：回车新增并保持焦点，Esc 清空
  if (e.target === addInputEl) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitQuickAdd();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      addInputEl.value = '';
      if (isOpen()) closePanel();
    }
    return;
  }

  // 标题行内编辑：回车保存，Esc 取消
  if (e.target.classList?.contains('todo-edit-input')) {
    const id = e.target.dataset.id;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const value = e.target.value.trim();
      titleEditId = null;
      if (!value) {
        render();
        return;
      }
      updateTodo(id, { title: value }).then(ok => {
        if (!ok) showToast(t('todo.saveFailed'), 'error');
      });
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      titleEditId = null;
      render();
    }
    return;
  }

  // 备注编辑：Ctrl/⌘+Enter 保存，Esc 取消
  if (e.target.classList?.contains('todo-note-input')) {
    if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      e.stopPropagation();
      saveNote(e.target.dataset.id);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      noteEditId = null;
      render();
    }
    return;
  }

  // 已完成组头键盘可达
  if (e.key === 'Enter' && e.target?.dataset?.action === 'toggle-done') {
    doneExpanded = !doneExpanded;
    persistDoneExpanded();
    render();
  }
}

function handleChange(e) {
  if (!e.target.classList?.contains('todo-due-input')) return;
  const id = e.target.dataset.id;
  const value = e.target.value;
  dueEditId = null;
  if (!value) {
    updateTodo(id, { dueAt: null });
    return;
  }
  const d = new Date(value + 'T00:00:00');
  updateTodo(id, { dueAt: isNaN(d.getTime()) ? null : d.getTime() });
}

/** 标题输入框失焦即保存，避免用户点别处后编辑内容丢失 */
function handleFocusOut(e) {
  if (!e.target?.classList?.contains('todo-edit-input')) return;
  const id = e.target.dataset.id;
  if (!titleEditId || titleEditId !== id) return;
  const value = e.target.value.trim();
  titleEditId = null;
  if (!value) {
    render();
    return;
  }
  updateTodo(id, { title: value }).then(ok => {
    if (!ok) showToast(t('todo.saveFailed'), 'error');
    else render();
  });
}

async function submitQuickAdd() {
  const title = addInputEl.value.trim();
  if (!title) return;
  addInputEl.value = '';
  const created = await addTodo(title);
  if (!created) showToast(t('todo.saveFailed'), 'error');
  addInputEl.focus();
}

async function saveNote(id) {
  const input = bodyEl.querySelector(`.todo-note-input[data-id="${id}"]`);
  const note = input ? input.value : '';
  noteEditId = null;
  // 备注编辑结束即收起：列表只留「备注」折叠条，不占正文空间
  expandedNoteIds.delete(id);
  const ok = await updateTodo(id, { note });
  if (!ok) showToast(t('todo.saveFailed'), 'error');
}

function cancelInlineEdit() {
  const had = titleEditId || noteEditId || dueEditId;
  titleEditId = null;
  noteEditId = null;
  dueEditId = null;
  if (had) render();
}

function persistDoneExpanded() {
  try {
    chrome.storage.local.set({ [DONE_EXPANDED_KEY]: doneExpanded });
  } catch (e) { /* 忽略 */ }
}

/** 破坏性操作的二次确认：优先用全局自定义弹窗；弹窗不可用时不做破坏性动作 */
async function confirmAction(message, title) {
  if (typeof window !== 'undefined' && typeof window.showCustomConfirm === 'function') {
    return Boolean(await window.showCustomConfirm(message, title));
  }
  return false;
}

// ==================== 更多菜单 ====================

function ensureMenu() {
  if (menuEl) return menuEl;
  menuEl = document.createElement('div');
  menuEl.className = 'todo-menu';
  document.body.appendChild(menuEl);
  menuEl.addEventListener('click', (e) => {
    const item = e.target.closest('[data-menu-action]');
    if (!item) return;
    const { menuAction, menuId } = item.dataset;
    closeMenu();
    handleMenuAction(menuAction, menuId);
  });
  return menuEl;
}

function closeMenu() {
  if (!menuEl) return;
  menuEl.remove();
  menuEl = null;
}

function openMenuAt(anchorEl, items, id) {
  const menu = ensureMenu();
  menu.innerHTML = items.map(item => `
    <button type="button" data-menu-action="${escapeAttr(item.action)}" data-menu-id="${escapeAttr(id || '')}"
      class="todo-menu-item${item.danger ? ' danger' : ''}">
      ${item.icon || ''}<span>${escapeHtml(item.label)}</span>
    </button>
  `).join('');

  const rect = anchorEl.getBoundingClientRect();
  const height = menu.offsetHeight || 132;
  let left = Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8);
  left = Math.max(8, left);
  let top = rect.bottom + 4;
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function openRowMenu(anchorEl, id) {
  const { active, done } = getTodoGroups();
  const todo = [...active, ...done].find(item => item.id === id);
  if (!todo) return;
  openMenuAt(anchorEl, [
    { action: 'edit-title', label: t('todo.editTitleAction'), icon: ICONS.edit },
    { action: 'edit-note', label: todo.note ? t('todo.editNote') : t('todo.addNote'), icon: ICONS.note },
    { action: 'set-due', label: t('todo.setDue'), icon: ICONS.calendar },
    { action: 'delete', label: t('todo.delete'), icon: ICONS.trash, danger: true },
  ], id);
}

function openHeaderMenu(anchorEl) {
  const { done } = getTodoGroups();
  const items = [
    { action: 'copy-clipboard', label: t('todo.copyClipboard'), icon: ICONS.copy },
    { action: 'copy-with-prompt', label: t('todo.copyWithPrompt'), icon: ICONS.fill },
  ];
  if (done.length > 0) {
    items.push({ action: 'clear-completed', label: `${t('todo.clearCompleted')} (${done.length})`, icon: ICONS.trash, danger: true });
  }
  openMenuAt(anchorEl, items, '');
}

async function handleMenuAction(action, id) {
  const { active, done } = getTodoGroups();
  const todo = [...active, ...done].find(item => item.id === id);

  switch (action) {
    case 'edit-title':
      titleEditId = id;
      render();
      return;
    case 'edit-note':
      noteEditId = id;
      expandedNoteIds.add(id);
      render();
      setTimeout(() => {
        const input = bodyEl.querySelector(`.todo-note-input[data-id="${id}"]`);
        if (input) {
          input.focus();
          input.selectionStart = input.selectionEnd = input.value.length;
        }
      }, 30);
      return;
    case 'set-due':
      dueEditId = id;
      render();
      setTimeout(() => {
        const input = bodyEl.querySelector(`.todo-due-input[data-id="${id}"]`);
        if (input) input.focus();
      }, 30);
      return;
    case 'delete': {
      const ok = await confirmAction(
        t('todo.deleteConfirmMsg', { title: todo?.title || '' }),
        t('todo.deleteConfirmTitle'),
      );
      if (ok) {
        const removed = await removeTodo(id);
        if (removed) showToast(t('todo.deletedToast'), 'success');
      }
      return;
    }
    case 'copy-clipboard':
      fillInput(true);
      return;
    case 'copy-with-prompt':
      fillInput(true, true);
      return;
    case 'clear-completed': {
      const ok = await confirmAction(
        t('todo.clearCompletedConfirmMsg', { n: done.length }),
        t('todo.clearCompletedConfirmTitle'),
      );
      if (ok) {
        const cleared = await clearCompletedTodos();
        if (cleared) showToast(t('todo.clearedToast'), 'success');
      }
      return;
    }
    default:
  }
}

// ==================== 填入输入框 ====================

/**
 * 把待办清单填入问答输入框
 * @param {boolean} toClipboard - true 只复制到剪贴板（不写入输入框）
 * @param {boolean} [withPrompt] - 是否附提问模板
 */
function fillInput(toClipboard, withPrompt = false) {
  const { active, done } = getTodoGroups();
  const digest = buildTodoDigest([...active, ...done], { withPrompt });
  if (!digest) {
    showToast(t('todo.emptyDigestToast'), 'info');
    return;
  }

  if (toClipboard) {
    copyText(digest, withPrompt ? t('todo.copiedPromptToast') : t('todo.copiedToast'));
    return;
  }

  const input = document.getElementById('userInput');
  if (!input) {
    showToast(t('todo.noInputToast'), 'error');
    return;
  }

  const base = input.value.replace(/\s+$/, '');
  input.value = base ? `${base}\n\n${digest}` : digest;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  input.selectionStart = input.selectionEnd = input.value.length;
  adjustInputHeight();

  closePanel();
  showToast(t('todo.filledToast'), 'success');
}

function copyText(text, successMessage) {
  try {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMessage, 'success');
    }).catch((e) => {
      logger.warn('[Todo] copy failed:', e);
      showToast(t('todo.noInputToast'), 'error');
    });
  } catch (e) {
    logger.warn('[Todo] clipboard unavailable:', e);
  }
}

// ==================== 拖拽排序 ====================

function handleDragStart(e) {
  const item = e.target.closest?.('.todo-item[draggable="true"]');
  if (!item) return;
  const list = item.closest('.todo-list[data-group="active"]');
  if (!list) return;
  const items = Array.from(list.querySelectorAll('.todo-item'));
  dragState = { id: item.dataset.id, from: items.indexOf(item), list };
  item.classList.add('dragging');
  try {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.id);
  } catch (err) { /* 忽略 */ }
}

function handleDragOver(e) {
  if (!dragState) return;
  e.preventDefault();
  const list = dragState.list;
  if (!list || !list.isConnected) return;

  const items = Array.from(list.querySelectorAll('.todo-item')).filter(el => !el.classList.contains('dragging'));
  let target = items.length;
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      target = i;
      break;
    }
  }

  const placeholder = ensureDragPlaceholder();
  if (target >= items.length) list.appendChild(placeholder);
  else items[target].before(placeholder);
}

function ensureDragPlaceholder() {
  let el = bodyEl.querySelector('.todo-insert');
  if (el) return el;
  el = document.createElement('div');
  el.className = 'todo-insert';
  return el;
}

async function handleDrop(e) {
  if (!dragState) return;
  e.preventDefault();
  const list = dragState.list;
  const placeholder = bodyEl.querySelector('.todo-insert');
  let to = dragState.from;
  if (placeholder && list) {
    const items = Array.from(list.querySelectorAll('.todo-item')).filter(el => !el.classList.contains('dragging'));
    const index = items.findIndex(el => placeholder.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    to = index === -1 ? items.length : index;
  }
  const from = dragState.from;
  cleanupDrag();
  if (from !== to) await reorderActiveTodos(from, to);
}

function cleanupDrag() {
  dragState = null;
  bodyEl?.querySelectorAll('.todo-item.dragging').forEach(el => el.classList.remove('dragging'));
  bodyEl?.querySelector('.todo-insert')?.remove();
}
