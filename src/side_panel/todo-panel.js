// side_panel/todo-panel.js - 侧边栏待办面板
//
// 入口挂在右侧功能轨道的 todo 槽位（第 5 个），点开为右缘浮层。
// 交互约定：
// - 待办 / 已完成是两个 Tab，一次只渲染一组（折叠分组会把已完成顶到屏幕外，用户根本看不到）；
// - 行内常驻只有「状态圈 + 标题」，编辑/复制/更多在悬停或键盘聚焦时才浮现；
// - 状态切换必须能在「⋯」菜单里看到文字动作，不能只藏在状态圈的点击上；
// - 左侧竖条只代优先级，「处理中」用圈内实心点 + 底色表示（一个位置只说一件事）；
// - 拖拽只在待办 Tab 内生效，插入位置用虚线段提示；
// - 面板底部锁定在输入区上沿，绝不遮住问答输入框。

import { t, registerTranslations } from '../shared/i18n.js';
import { getSideRailSlot } from './side-rail.js';
import {
  escapeHtml,
  escapeAttr,
  showToast,
  adjustInputHeight,
} from './utils.js';
import {
  addTodo,
  updateTodo,
  removeTodo,
  cycleTodoStatus,
  setTodoStatus,
  restoreTodo,
  setTodoPriority,
  setTodoLink,
  reorderActiveTodos,
  clearCompletedTodos,
  getTodoGroups,
  subscribeTodos,
} from './todo-manager.js';
import {
  TODO_STATUS,
  TODO_PRIORITY,
  nextStatus,
  buildTodoDigest,
  formatRelativeTime,
  formatDueAt,
  formatDoneStamp,
  isOverdue,
  isLinkOpenable,
  linkLabel,
  restoreTarget,
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
    emptyDone: '还没有已完成的待办',
    emptyDoneHint: '把某条标记完成后，它会出现在这里',
    tabActive: '待办',
    tabDone: '已完成',
    progressLabel: '完成 {done} / {total}',
    startDoing: '开始处理',
    markDone: '标记完成',
    backToPending: '退回待办',
    restoreTo: '恢复到{status}',
    undoBar: '已标记完成「{title}」',
    undoAction: '撤销',
    restoredToast: '已恢复到{status}',
    priority: '优先级',
    priorityHigh: '高',
    priorityMedium: '中',
    priorityLow: '低',
    priorityNone: '无',
    priorityTitle: '优先级：{level}',
    addLink: '添加链接',
    editLink: '编辑链接',
    linkPlaceholder: '粘贴链接，回车关联',
    linkSavedToast: '已关联链接',
    linkRemovedToast: '已移除链接',
    linkInvalid: '链接格式不对，仅支持 http/https',
    openLinkTitle: '打开 {host}',
    statusTip: '当前：{status} · 点击切到{next}',
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
    filledToast: '已填入输入框',
    copiedToast: '已复制到剪贴板',
    copiedPromptToast: '已复制（含提问模板）',
    emptyDigestToast: '暂无可复制的待办',
    copyFailed: '复制失败',
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
    emptyDone: 'Nothing completed yet',
    emptyDoneHint: 'Mark a todo as done and it lands here',
    tabActive: 'To do',
    tabDone: 'Done',
    progressLabel: '{done} / {total} done',
    startDoing: 'Start',
    markDone: 'Mark done',
    backToPending: 'Back to to-do',
    restoreTo: 'Restore to {status}',
    undoBar: 'Marked done “{title}”',
    undoAction: 'Undo',
    restoredToast: 'Restored to {status}',
    priority: 'Priority',
    priorityHigh: 'High',
    priorityMedium: 'Medium',
    priorityLow: 'Low',
    priorityNone: 'None',
    priorityTitle: 'Priority: {level}',
    addLink: 'Add link',
    editLink: 'Edit link',
    linkPlaceholder: 'Paste a link, press Enter',
    linkSavedToast: 'Link attached',
    linkRemovedToast: 'Link removed',
    linkInvalid: 'Invalid link, only http/https',
    openLinkTitle: 'Open {host}',
    statusTip: 'Now: {status} · click for {next}',
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
    filledToast: 'Inserted into input',
    copiedToast: 'Copied to clipboard',
    copiedPromptToast: 'Copied with prompt',
    emptyDigestToast: 'Nothing to copy',
    copyFailed: 'Copy failed',
    noInputToast: 'Input box not found',
    saveFailed: 'Failed to save, try again',
    deletedToast: 'Deleted',
    clearedToast: 'Completed todos cleared',
  },
});

// 面板底部与输入区之间留的间隙 / 顶部保留给会话区的高度 / 收缩后的最小可用高度
const INPUT_AREA_SELECTOR = '.input-container';
const RAIL_BOTTOM_RESERVE = 160;
const BOTTOM_GAP = 8;
const TOP_RESERVE = 108;
const MIN_PANEL_HEIGHT = 220;
// 撤销条停留时长：够看清并移过去点一下，又不会一直占位
const UNDO_DURATION_MS = 6000;

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
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h11a5 5 0 0 1 0 10H8"/><path d="M7 6l-4 4 4 4"/></svg>',
  circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>',
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
let tabActiveEl = null;
let tabDoneEl = null;

// 当前 Tab：'active' | 'done'（不持久化，面板每次打开都回到待办）
let activeTab = 'active';
let titleEditId = null;
let noteEditId = null;
let dueEditId = null;
let linkEditId = null;
let expandedNoteIds = new Set();
let dragState = null;
let initialized = false;
// 刚被标记完成的那一条：{ id, title }，靠它渲染面板内撤销条
let undoable = null;
let undoTimer = null;
// 面板开着时才监听输入区尺寸变化
let fitObserver = null;

// 行内编辑的未提交内容只活在 DOM 里，而每一次落库成功都会 emitChange → render()
// 重建整段列表。不在重建前把这些脏值抓下来，用户正在敲的备注/标题就会在下一次
// 重渲染时静默回退成库里的旧值（例如敲备注中途顺手点另一条的状态圈）。
const drafts = new Map();
const EDITOR_CLASSES = ['todo-edit-input', 'todo-note-input', 'todo-due-input', 'todo-link-input'];
const DRAFT_KEY = {
  'todo-edit-input': 'title',
  'todo-note-input': 'note',
  'todo-due-input': 'due',
  'todo-link-input': 'link',
};

// ==================== 初始化 ====================

/** 创建入口按钮与面板 DOM，并挂入右侧轨道 todo 槽位 */
export function initTodoPanel() {
  if (initialized) return;
  initialized = true;

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
        <div class="todo-panel-actions">
          <button class="todo-fill-btn" data-action="fill-input" title="${escapeAttr(t('todo.fillInputTitle'))}">
            ${ICONS.fill}<span>${escapeHtml(t('todo.fillInput'))}</span>
          </button>
          <button class="todo-icon-btn" data-action="header-more" title="${escapeAttr(t('todo.headerMore'))}" aria-label="${escapeAttr(t('todo.headerMore'))}">${ICONS.more}</button>
          <button class="todo-icon-btn" data-action="close" title="${escapeAttr(t('common.close'))}" aria-label="${escapeAttr(t('common.close'))}">${ICONS.close}</button>
        </div>
      </div>
      <div class="todo-progress-row">
        <span class="todo-panel-count" id="todoPanelCount"></span>
        <div class="todo-progress"><i id="todoProgressBar" style="width:0%"></i></div>
      </div>
      <div class="todo-tabs" role="tablist">
        <button class="todo-tab active" id="todoTabActive" role="tab" data-action="switch-tab" data-tab="active">
          <span>${escapeHtml(t('todo.tabActive'))}</span><span class="todo-tab-count" id="todoTabActiveCount">0</span>
        </button>
        <button class="todo-tab" id="todoTabDone" role="tab" data-action="switch-tab" data-tab="done">
          <span>${escapeHtml(t('todo.tabDone'))}</span><span class="todo-tab-count" id="todoTabDoneCount">0</span>
        </button>
      </div>
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
  tabActiveEl = containerEl.querySelector('#todoTabActive');
  tabDoneEl = containerEl.querySelector('#todoTabDone');

  countEl.textContent = t('todo.progressLabel', { done: 0, total: 0 });

  toggleEl.addEventListener('click', togglePanel);
  containerEl.addEventListener('click', handleClick);
  containerEl.addEventListener('change', handleChange);
  containerEl.addEventListener('keydown', handleKeydown);
  bodyEl.addEventListener('dragstart', handleDragStart);
  bodyEl.addEventListener('dragover', handleDragOver);
  bodyEl.addEventListener('drop', handleDrop);
  bodyEl.addEventListener('dragend', cleanupDrag);
  bodyEl.addEventListener('focusout', handleFocusOut);
  // 「取消」在 pointerdown 就生效：change 与 focusout 都比 click 早，等到 click 时
  // 链接已经存进库了，取消就成了死按钮。先结束编辑态，两条自动保存通道自然被拦住
  containerEl.addEventListener('pointerdown', (e) => {
    const btn = e.target?.closest?.('[data-action="link-cancel"]');
    if (!btn) return;
    e.preventDefault();
    cancelLinkEdit(btn.dataset.id || linkEditId);
  });

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
  activeTab = 'active';
  undoable = null;
  render();
  panelEl.classList.add('expanded');
  toggleEl.classList.add('active');
  watchInputArea();
  fitPanelToInputArea();
  setTimeout(() => {
    if (isOpen()) addInputEl.focus();
  }, 60);
}

function closePanel() {
  panelEl.classList.remove('expanded');
  toggleEl.classList.remove('active');
  stopWatchingInputArea();
  panelEl.style.removeProperty('--fit-y');
  panelEl.style.removeProperty('--todo-max-h');
  closeMenu();
  cancelInlineEdit();
  clearUndo();
}

// ==================== 渲染 ====================

/** 重渲染前采集正在编辑的未提交值 */
function captureDrafts() {
  EDITOR_CLASSES.forEach(cls => {
    bodyEl.querySelectorAll(`.${cls}`).forEach(el => {
      const id = el.dataset.id;
      if (!id) return;
      const draft = drafts.get(id) || {};
      draft[DRAFT_KEY[cls]] = el.value;
      drafts.set(id, draft);
    });
  });
}

/** 丢弃已不在清单里的草稿（删除/清除已完成/整表重载后不留脏数据） */
function pruneDrafts(aliveTodos) {
  if (drafts.size === 0) return;
  const alive = new Set(aliveTodos.map(item => item.id));
  for (const id of [...drafts.keys()]) {
    if (!alive.has(id)) drafts.delete(id);
  }
}

function clearDraft(id) {
  if (id) drafts.delete(id);
  else drafts.clear();
}

/** 取未提交值；空字符串是合法输入，不能当成「没有草稿」 */
function draftFor(id, key) {
  const draft = drafts.get(id);
  return draft && draft[key] !== undefined ? draft[key] : null;
}

/** 记下当前获焦的编辑器：重渲染后据此把焦点与光标送回原处 */
function getFocusMarker() {
  const el = document.activeElement;
  if (!el || !bodyEl.contains(el)) return null;
  const cls = EDITOR_CLASSES.find(c => el.classList.contains(c));
  if (!cls || !el.dataset.id) return null;
  return { cls, id: el.dataset.id, caret: safeCaret(el) };
}

/** date 等非文本输入读 selectionStart 会抛 InvalidStateError，统一兜住 */
function safeCaret(el) {
  try {
    return el.selectionStart;
  } catch (e) {
    return null;
  }
}

function editorEl(marker) {
  return bodyEl.querySelector(`.${marker.cls}[data-id="${escapeAttr(marker.id)}"]`);
}

function restoreFocus(marker) {
  const el = editorEl(marker);
  if (!el) return;
  el.focus();
  if (marker.caret === null) return;
  try {
    el.selectionStart = el.selectionEnd = marker.caret;
  } catch (e) { /* 不支持光标定位的输入类型 */ }
}

/** 本轮刚被打开、且重渲染后仍不持有焦点的编辑器 → 主动聚焦 */
function focusFreshEditor() {
  if (titleEditId) { focusTitleInput(); return; }
  if (noteEditId) {
    const el = editorEl({ cls: 'todo-note-input', id: noteEditId });
    if (el) el.focus();
    return;
  }
  if (dueEditId) {
    const el = editorEl({ cls: 'todo-due-input', id: dueEditId });
    if (el) el.focus();
    return;
  }
  if (linkEditId) {
    const el = editorEl({ cls: 'todo-link-input', id: linkEditId });
    if (!el) return;
    el.focus();
    el.selectionStart = el.selectionEnd = el.value.length;
  }
}

function render() {
  if (!bodyEl) return;
  captureDrafts();
  const focusMarker = getFocusMarker();
  const { active, done, stats } = getTodoGroups();

  countEl.textContent = t('todo.progressLabel', { done: stats.done, total: stats.total });
  progressEl.style.width = stats.total ? `${Math.round((stats.done / stats.total) * 100)}%` : '0%';
  updateBadge(active.length);
  updateTabs(active.length, done.length);

  const list = activeTab === 'done' ? done : active;
  const parts = [];
  pruneDrafts([...active, ...done]);

  if (undoable) {
    parts.push(`<div class="todo-undo">
        <span class="todo-undo-text">${escapeHtml(t('todo.undoBar', { title: undoable.title }))}</span>
        <button class="todo-mini-btn" data-action="undo-complete" data-id="${escapeAttr(undoable.id)}">${escapeHtml(t('todo.undoAction'))}</button>
      </div>`);
  }

  if (activeTab === 'done' && done.length > 0) {
    parts.push(`<button class="todo-clear-done" data-action="clear-completed-btn">
        ${ICONS.trash}<span>${escapeHtml(t('todo.clearCompleted'))} (${done.length})</span>
      </button>`);
  }

  if (list.length === 0) {
    const isDoneTab = activeTab === 'done';
    parts.push(`<div class="todo-empty">
        <div class="todo-empty-title">${escapeHtml(t(isDoneTab ? 'todo.emptyDone' : 'todo.empty'))}</div>
        <div class="todo-empty-hint">${escapeHtml(t(isDoneTab ? 'todo.emptyDoneHint' : 'todo.emptyHint'))}</div>
      </div>`);
  } else {
    parts.push(`<div class="todo-list" data-group="${activeTab}">${list.map(todo => renderItem(todo, activeTab)).join('')}</div>`);
  }

  bodyEl.innerHTML = parts.join('');
  // 焦点在编辑器里 → 原处还原（含光标位置）；否则视为刚打开编辑器 → 主动聚焦
  if (focusMarker) restoreFocus(focusMarker);
  else focusFreshEditor();
  fitPanelToInputArea();
}

/** Tab 条在 bodyEl 之外，只改计数与选中态，不重建 DOM（否则会抢走列表里的焦点） */
function updateTabs(activeCount, doneCount) {
  if (!tabActiveEl || !tabDoneEl) return;
  const isDone = activeTab === 'done';
  tabActiveEl.classList.toggle('active', !isDone);
  tabDoneEl.classList.toggle('active', isDone);
  tabActiveEl.setAttribute('aria-selected', String(!isDone));
  tabDoneEl.setAttribute('aria-selected', String(isDone));
  tabActiveEl.querySelector('.todo-tab-count').textContent = String(activeCount);
  tabDoneEl.querySelector('.todo-tab-count').textContent = String(doneCount);
}

// ==================== 面板几何（不遮住输入区） ====================

/** 输入区顶边：量不到（页面未就绪/结构变更）时回退到轨道给输入区留的 160px */
function measureInputTop() {
  const el = document.querySelector(INPUT_AREA_SELECTOR);
  const rect = el?.getBoundingClientRect();
  if (rect && rect.height > 0 && Number.isFinite(rect.top)) return rect.top;
  return window.innerHeight - RAIL_BOTTOM_RESERVE;
}

/**
 * 把面板装进「顶部保留区 ~ 输入区上沿」之间：
 * 先按可用高度限高（面板底部锚定，长不上去只会往上顶），再对仍然越界的做位移。
 * 共享的 clampPanelToViewport 只按视口底夹，正好会把面板放到输入框上，所以这里不用它。
 */
function fitPanelToInputArea() {
  if (!panelEl || !isOpen()) return;
  panelEl.style.removeProperty('--fit-y');
  requestAnimationFrame(() => {
    if (!panelEl || !isOpen()) return;
    const limit = measureInputTop() - BOTTOM_GAP;
    const rect = panelEl.getBoundingClientRect();
    if (!rect.height) return;
    // 底部锚定下 rect.bottom 不随高度变化，可以直接用它算可用高
    const available = Math.max(MIN_PANEL_HEIGHT, Math.floor(rect.bottom - TOP_RESERVE));
    panelEl.style.setProperty('--todo-max-h', `${available}px`);
    const dy = Math.min(0, Math.floor(limit - rect.bottom));
    if (dy) panelEl.style.setProperty('--fit-y', `${dy}px`);
  });
}

/** 面板开着时才监听：窗口尺寸 + 输入区高度变化（多行输入、语音条、排队条都会顶高） */
function watchInputArea() {
  stopWatchingInputArea();
  window.addEventListener('resize', fitPanelToInputArea);
  const area = document.querySelector(INPUT_AREA_SELECTOR);
  if (area && typeof ResizeObserver !== 'undefined') {
    fitObserver = new ResizeObserver(() => fitPanelToInputArea());
    fitObserver.observe(area);
  }
}

function stopWatchingInputArea() {
  window.removeEventListener('resize', fitPanelToInputArea);
  fitObserver?.disconnect();
  fitObserver = null;
}

// ==================== 标记完成的撤销 ====================

function markUndoable(todo) {
  undoable = { id: todo.id, title: todo.title };
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undoable = null;
    render();
  }, UNDO_DURATION_MS);
}

function clearUndo() {
  clearTimeout(undoTimer);
  undoTimer = null;
  undoable = null;
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

function priorityLabel(priority) {
  if (priority === TODO_PRIORITY.HIGH) return t('todo.priorityHigh');
  if (priority === TODO_PRIORITY.MEDIUM) return t('todo.priorityMedium');
  if (priority === TODO_PRIORITY.LOW) return t('todo.priorityLow');
  return t('todo.priorityNone');
}

function renderStatusButton(todo) {
  // 圈子的 tooltip 说清「现在是什么 · 点下去会变成什么」，否则循环切换只能靠试
  const label = t('todo.statusTip', {
    status: statusLabel(todo.status),
    next: statusLabel(nextStatus(todo.status)),
  });
  const inner = todo.status === TODO_STATUS.DONE
    ? ICONS.check
    : (todo.status === TODO_STATUS.DOING ? '<i></i>' : '');
  return `<button class="todo-status" data-action="cycle" data-id="${escapeAttr(todo.id)}"
      title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">${inner}</button>`;
}

/** 链接胶囊：标题不加下划线（与行内编辑抢手势），可点区单独给一枚带图标的胶囊 */
function renderLinkChip(todo) {
  const host = linkLabel(todo);
  if (!host) return '';
  const label = t('todo.openLinkTitle', { host });
  // href 不写进 DOM：点击才开新标签，避免扩展页面里出现可悬停预览的任意链接
  return `<button class="todo-link-chip" data-action="open-link" data-id="${escapeAttr(todo.id)}"
    title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">${ICONS.link}<span>${escapeHtml(host)}</span></button>`;
}

function renderMeta(todo) {
  const chip = renderLinkChip(todo);
  if (todo.status === TODO_STATUS.DONE) {
    return `<div class="todo-meta">${chip}<span>${escapeHtml(formatDoneStamp(todo))}</span></div>`;
  }
  const bits = [];
  if (chip) bits.push(chip);
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
    const draft = draftFor(todo.id, 'note');
    return `<div class="todo-note-editor">
        <textarea class="todo-note-input" data-id="${escapeAttr(todo.id)}" rows="2"
          placeholder="${escapeAttr(t('todo.notePlaceholder'))}">${escapeHtml(draft !== null ? draft : (todo.note || ''))}</textarea>
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
  // 左侧竖条只代表优先级；未设置时不出条（CSS 里 background: transparent）
  if (todo.priority) classes.push(`prio-${todo.priority}`);
  if (dueEditId === todo.id) classes.push('editing-due');

  const draftTitle = draftFor(todo.id, 'title');
  const titleHtml = editingTitle
    ? `<input type="text" class="todo-edit-input" data-id="${escapeAttr(todo.id)}" value="${escapeAttr(draftTitle !== null ? draftTitle : todo.title)}" />`
    : `<div class="todo-name">${escapeHtml(todo.title)}</div>`;

  const draftDue = draftFor(todo.id, 'due');
  const dueHtml = dueEditId === todo.id
    ? `<div class="todo-due-editor">
        <input type="date" class="todo-due-input" data-id="${escapeAttr(todo.id)}" value="${escapeAttr(draftDue !== null ? draftDue : toDateInputValue(todo.dueAt))}" />
        <button class="todo-mini-btn ghost" data-action="due-clear" data-id="${escapeAttr(todo.id)}">${escapeHtml(t('todo.clearDue'))}</button>
      </div>`
    : '';

  const draftLink = draftFor(todo.id, 'link');
  const linkHtml = linkEditId === todo.id
    ? `<div class="todo-link-editor">
        <input type="text" class="todo-link-input" data-id="${escapeAttr(todo.id)}" autocomplete="off"
          placeholder="${escapeAttr(t('todo.linkPlaceholder'))}" value="${escapeAttr(draftLink !== null ? draftLink : (todo.link || ''))}" />
        <button class="todo-mini-btn ghost" data-action="link-cancel" data-id="${escapeAttr(todo.id)}">${escapeHtml(t('todo.noteCancel'))}</button>
      </div>`
    : '';

  const draggable = group === 'active' ? ' draggable="true"' : '';
  const restoreAction = isDone
    ? `<button class="todo-act" data-action="restore" data-id="${escapeAttr(todo.id)}" title="${escapeAttr(t('todo.restoreTo', { status: statusLabel(restoreTarget(todo)) }))}" aria-label="${escapeAttr(t('todo.restoreTo', { status: statusLabel(restoreTarget(todo)) }))}">${ICONS.undo}</button>`
    : '';
  const actions = `
    <div class="todo-item-actions">
      ${restoreAction}
      <button class="todo-act" data-action="edit-title" data-id="${escapeAttr(todo.id)}" title="${escapeAttr(t('todo.editItem'))}" aria-label="${escapeAttr(t('todo.editItem'))}">${ICONS.edit}</button>
      <button class="todo-act" data-action="copy-item" data-id="${escapeAttr(todo.id)}" title="${escapeAttr(t('todo.copyItem'))}" aria-label="${escapeAttr(t('todo.copyItem'))}">${ICONS.copy}</button>
      <button class="todo-act" data-action="row-more" data-id="${escapeAttr(todo.id)}" title="${escapeAttr(t('todo.more'))}" aria-label="${escapeAttr(t('todo.more'))}">${ICONS.more}</button>
    </div>`;

  return `<div class="${classes.join(' ')}" data-id="${escapeAttr(todo.id)}" data-group="${group}"${draggable} data-priority="${escapeAttr(todo.priority || '')}">
      ${renderStatusButton(todo)}
      <div class="todo-main">
        ${titleHtml}
        ${renderNote(todo)}
        ${dueHtml}
        ${linkHtml}
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

/**
 * 落库结果的唯一出口：成功按需提示，失败必须说明。
 * 状态圈、截止日、删除、清除、重排、优先级、链接都不能失败时一声不响 ——
 * 乐观值已经被编排层回滚广播回来，界面上「东西又出现了」但没有任何原因。
 * @param {Promise<boolean|{ok: boolean, reason?: string}>} promise manager 写操作的结果
 * @param {string} [successMessage] 成功时的提示（不传则不提示）
 */
function persist(promise, successMessage) {
  Promise.resolve(promise).then((result) => {
    const ok = result === true || (result && result.ok === true);
    if (ok) {
      if (successMessage) showToast(successMessage, 'success');
      return;
    }
    // 链接格式不对与库里写不进去是两回事，得分开说
    const key = result && result.reason === 'invalid' ? 'todo.linkInvalid' : 'todo.saveFailed';
    showToast(t(key), 'error');
  });
}

/** 打开关联链接：只走 http/https，模型层再校一次（库里的旧值可能被手改坏） */
function openTodoLink(todo) {
  const url = todo && todo.link;
  if (!url || !isLinkOpenable(url)) {
    showToast(t('todo.linkInvalid'), 'error');
    return;
  }
  try {
    chrome.tabs.create({ url });
  } catch (e) {
    logger.warn('[Todo] open link failed:', e);
    showToast(t('todo.copyFailed'), 'error');
  }
}

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
    case 'switch-tab':
      switchTab(actionEl.dataset.tab);
      return;
    case 'undo-complete':
      e.stopPropagation();
      undoComplete(id);
      return;
    case 'restore':
      e.stopPropagation();
      restoreOne(id);
      return;
    case 'open-link':
      e.stopPropagation();
      openTodoLink(findTodo(id));
      return;
    case 'clear-completed-btn':
      e.stopPropagation();
      clearCompleted();
      return;
    case 'cycle':
      e.stopPropagation();
      persist(cycleTodoStatus(id));
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
      clearDraft(id);
      render();
      return;
    case 'due-clear':
      e.stopPropagation();
      dueEditId = null;
      clearDraft(id);
      persist(updateTodo(id, { dueAt: null }));
      return;
    case 'link-cancel':
      e.stopPropagation();
      cancelLinkEdit(id);
      return;
    default:
      return;
  }
}

function findTodo(id) {
  const { active, done } = getTodoGroups();
  return [...active, ...done].find(item => item.id === id) || null;
}

function switchTab(tab) {
  const next = tab === 'done' ? 'done' : 'active';
  if (next === activeTab) return;
  activeTab = next;
  cancelInlineEdit();
  render();
}

/** 标记完成：条目离开当前 Tab，同时开启 6s 撤销窗口 */
function markDone(id) {
  const todo = findTodo(id);
  if (!todo) return;
  markUndoable(todo);
  persist(setTodoStatus(id, TODO_STATUS.DONE));
}

function restoreOne(id) {
  const todo = findTodo(id);
  if (!todo) return;
  const target = restoreTarget(todo);
  clearUndo();
  persist(restoreTodo(id), t('todo.restoredToast', { status: statusLabel(target) }));
}

function undoComplete(id) {
  restoreOne(id);
}

async function clearCompleted() {
  const { done } = getTodoGroups();
  if (done.length === 0) return;
  const ok = await confirmAction(
    t('todo.clearCompletedConfirmMsg', { n: done.length }),
    t('todo.clearCompletedConfirmTitle'),
  );
  if (ok) persist(clearCompletedTodos(), t('todo.clearedToast'));
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
        clearDraft(id);
        render();
        return;
      }
      clearDraft(id);
      persist(updateTodo(id, { title: value }));
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      titleEditId = null;
      clearDraft(e.target.dataset.id);
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
      clearDraft(e.target.dataset.id);
      render();
    }
    return;
  }

  // 链接编辑：回车关联，Esc 取消（空值回车 = 移除链接，与输入框内清空同语义）
  if (e.target.classList?.contains('todo-link-input')) {
    const id = e.target.dataset.id;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      saveLink(id, e.target.value);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      cancelLinkEdit(id);
    }
  }
}

function handleChange(e) {
  if (e.target.classList?.contains('todo-link-input')) {
    const id = e.target.dataset.id;
    // 回车保存完 linkEditId 已置空，而重渲染把还带着脏值的输入框从 DOM 拆下来时，
    // 浏览器会再补发一次 change —— 不守住这一道就会写两次、弹两条一样的 toast
    if (!linkEditId || linkEditId !== id) return;
    saveLink(id, e.target.value);
    return;
  }
  if (!e.target.classList?.contains('todo-due-input')) return;
  const id = e.target.dataset.id;
  const value = e.target.value;
  dueEditId = null;
  clearDraft(id);
  if (!value) {
    persist(updateTodo(id, { dueAt: null }));
    return;
  }
  const d = new Date(value + 'T00:00:00');
  persist(updateTodo(id, { dueAt: isNaN(d.getTime()) ? null : d.getTime() }));
}

/** 标题/链接输入框失焦即保存，避免用户点别处后编辑内容丢失 */
function handleFocusOut(e) {
  if (e.target?.classList?.contains('todo-link-input')) {
    const id = e.target.dataset.id;
    if (!linkEditId || linkEditId !== id) return;
    saveLink(id, e.target.value);
    return;
  }
  if (!e.target?.classList?.contains('todo-edit-input')) return;
  const id = e.target.dataset.id;
  if (!titleEditId || titleEditId !== id) return;
  const value = e.target.value.trim();
  titleEditId = null;
  if (!value) {
    clearDraft(id);
    render();
    return;
  }
  clearDraft(id);
  updateTodo(id, { title: value }).then(ok => {
    if (!ok) showToast(t('todo.saveFailed'), 'error');
    else render();
  });
}

async function submitQuickAdd() {
  const title = addInputEl.value.trim();
  if (!title) return;
  addInputEl.value = '';
  // 新条目只会落在待办，在已完成 Tab 里添加要先转回去，否则「加了但看不见」
  if (activeTab === 'done') activeTab = 'active';
  const created = await addTodo(title);
  if (!created) showToast(t('todo.saveFailed'), 'error');
  addInputEl.focus();
}

function saveNote(id) {
  const input = bodyEl.querySelector(`.todo-note-input[data-id="${escapeAttr(id)}"]`);
  const note = input ? input.value : '';
  noteEditId = null;
  // 备注编辑结束即收起：列表只留「备注」折叠条，不占正文空间
  expandedNoteIds.delete(id);
  clearDraft(id);
  persist(updateTodo(id, { note }));
}

/**
 * 保存链接。校验在编排层：非法链接不会先上屏再回滚，也不会丢输入焦点以外的状态。
 * @param {string} id
 * @param {string} raw
 */
function saveLink(id, raw) {
  const hadLink = !!findTodo(id)?.link;
  linkEditId = null;
  clearDraft(id);
  const value = String(raw || '').trim();
  persist(setTodoLink(id, value), t(value ? 'todo.linkSavedToast' : (hadLink ? 'todo.linkRemovedToast' : 'todo.linkSavedToast')));
}

/** 取消链接编辑：只关编辑器，一个字节都不写库 */
function cancelLinkEdit(id) {
  linkEditId = null;
  clearDraft(id);
  render();
}

function cancelInlineEdit() {
  const had = titleEditId || noteEditId || dueEditId || linkEditId;
  titleEditId = null;
  noteEditId = null;
  dueEditId = null;
  linkEditId = null;
  clearDraft();
  if (had) render();
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
    const swatch = e.target.closest('[data-priority-value]');
    if (swatch) {
      const sid = swatch.dataset.menuId;
      const value = swatch.dataset.priorityValue || null;
      closeMenu();
      persist(setTodoPriority(sid, value));
      return;
    }
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

function menuRowHtml(item, id) {
  if (item.swatches) {
    const levels = [
      ['', t('todo.priorityNone')],
      [TODO_PRIORITY.LOW, t('todo.priorityLow')],
      [TODO_PRIORITY.MEDIUM, t('todo.priorityMedium')],
      [TODO_PRIORITY.HIGH, t('todo.priorityHigh')],
    ];
    return `<div class="todo-menu-row">
      <span class="todo-menu-row-label">${escapeHtml(item.label)}</span>
      ${levels.map(([value, label]) => `
        <button type="button" class="todo-swatch${value ? ` ${value}` : ''}${item.current === value ? ' active' : ''}"
          data-priority-value="${escapeAttr(value)}" data-menu-id="${escapeAttr(id)}"
          title="${escapeAttr(t('todo.priorityTitle', { level: label }))}"
          aria-label="${escapeAttr(label)}"></button>`).join('')}
    </div>`;
  }
  const divider = item.divider ? '<div class="todo-menu-sep"></div>' : '';
  return `${divider}<button type="button" data-menu-action="${escapeAttr(item.action)}" data-menu-id="${escapeAttr(id || '')}"
    class="todo-menu-item${item.danger ? ' danger' : ''}">
    ${item.icon || ''}<span>${escapeHtml(item.label)}</span>
  </button>`;
}

function openMenuAt(anchorEl, items, id) {
  const menu = ensureMenu();
  menu.innerHTML = items.map(item => menuRowHtml(item, id)).join('');

  const rect = anchorEl.getBoundingClientRect();
  // 宽度不再用常量：菜单改成 max-content 自适应文案，定位必须拿实测值，
  // 否则长文案（如「复制并附提问模板」）会把菜单顶到视口外
  const width = menu.offsetWidth || 168;
  const height = menu.offsetHeight || 132;
  let left = Math.min(rect.right - width, window.innerWidth - width - 8);
  left = Math.max(8, left);
  let top = rect.bottom + 4;
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

/** 菜单顶部的状态动作：按当前状态给，让「标记完成 / 恢复」在文字菜单里看得见 */
function statusMenuItems(todo) {
  if (todo.status === TODO_STATUS.DONE) {
    const target = restoreTarget(todo);
    const items = [
      { action: 'restore', label: t('todo.restoreTo', { status: statusLabel(target) }), icon: ICONS.undo, divider: true },
    ];
    // 智能恢复已经会回到待办时不再给重复项
    if (target !== TODO_STATUS.PENDING) {
      items.push({ action: 'set-pending', label: t('todo.backToPending'), icon: ICONS.circle });
    }
    return items;
  }
  if (todo.status === TODO_STATUS.DOING) {
    return [
      { action: 'set-done', label: t('todo.markDone'), icon: ICONS.check, divider: true },
      { action: 'set-pending', label: t('todo.backToPending'), icon: ICONS.circle },
    ];
  }
  return [
    { action: 'set-doing', label: t('todo.startDoing'), icon: ICONS.play, divider: true },
    { action: 'set-done', label: t('todo.markDone'), icon: ICONS.check },
  ];
}

function openRowMenu(anchorEl, id) {
  const todo = findTodo(id);
  if (!todo) return;
  openMenuAt(anchorEl, [
    ...statusMenuItems(todo),
    { swatches: true, label: t('todo.priority'), current: todo.priority || '', divider: true },
    { action: 'edit-title', label: t('todo.editTitleAction'), icon: ICONS.edit, divider: true },
    { action: 'edit-note', label: todo.note ? t('todo.editNote') : t('todo.addNote'), icon: ICONS.note },
    { action: 'set-due', label: t('todo.setDue'), icon: ICONS.calendar },
    { action: 'edit-link', label: todo.link ? t('todo.editLink') : t('todo.addLink'), icon: ICONS.link },
    { action: 'delete', label: t('todo.delete'), icon: ICONS.trash, danger: true, divider: true },
  ], id);
}

function openHeaderMenu(anchorEl) {
  openMenuAt(anchorEl, [
    { action: 'copy-clipboard', label: t('todo.copyClipboard'), icon: ICONS.copy },
    { action: 'copy-with-prompt', label: t('todo.copyWithPrompt'), icon: ICONS.fill },
  ], '');
}

async function handleMenuAction(action, id) {
  const todo = findTodo(id);

  switch (action) {
    case 'set-doing':
      persist(setTodoStatus(id, TODO_STATUS.DOING));
      return;
    case 'set-pending':
      persist(setTodoStatus(id, TODO_STATUS.PENDING));
      return;
    case 'set-done':
      markDone(id);
      return;
    case 'restore':
      restoreOne(id);
      return;
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
    case 'edit-link':
      linkEditId = id;
      render();
      return;
    case 'delete': {
      const ok = await confirmAction(
        t('todo.deleteConfirmMsg', { title: todo?.title || '' }),
        t('todo.deleteConfirmTitle'),
      );
      if (ok) {
        persist(removeTodo(id), t('todo.deletedToast'));
      }
      return;
    }
    case 'copy-clipboard':
      fillInput(true);
      return;
    case 'copy-with-prompt':
      fillInput(true, true);
      return;
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
      showToast(t('todo.copyFailed'), 'error');
    });
  } catch (e) {
    logger.warn('[Todo] clipboard unavailable:', e);
    showToast(t('todo.copyFailed'), 'error');
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

function handleDrop(e) {
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
  if (from !== to) persist(reorderActiveTodos(from, to));
}

function cleanupDrag() {
  dragState = null;
  bodyEl?.querySelectorAll('.todo-item.dragging').forEach(el => el.classList.remove('dragging'));
  bodyEl?.querySelector('.todo-insert')?.remove();
}
