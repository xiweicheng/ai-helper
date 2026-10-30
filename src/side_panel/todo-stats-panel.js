// side_panel/todo-stats-panel.js - 统计浮层（独立卡片，不挤占待办面板的列表高度）
//
// 数字全部来自 todo-stats：当前清单给四态/逾期，流水给今日与近 7 天趋势。
// HTML 由 todo-stats-view 生成，这里只管挂载、开关与键盘。

import { t, subscribe } from '../shared/i18n.js';
import { escapeAttr } from './utils.js';
import { getTodoGroups } from './todo-manager.js';
import { summarizeStats, loadStatsLog } from './todo-stats.js';
import { buildStatsHtml } from './todo-stats-view.js';

const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>';

let overlayEl = null;
let escHandler = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement('div');
  overlayEl.className = 'todo-stats-overlay';
  overlayEl.id = 'todoStatsOverlay';
  // 事件挂在容器上：内容随语言/数据重刷，监听器不用跟着重建
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl || e.target.closest?.('[data-action="close-stats"]')) {
      closeTodoStats();
    }
  });
  document.body.appendChild(overlayEl);
  return overlayEl;
}

function paint(stats) {
  const overlay = ensureOverlay();
  overlay.innerHTML = `
    <div class="todo-stats-card" role="dialog" aria-modal="true" aria-label="${escapeAttr(t('todoStats.title'))}">
      <div class="todo-stats-header">
        <span class="todo-stats-title">${t('todoStats.title')}</span>
        <button type="button" class="todo-stats-close" data-action="close-stats"
          title="${escapeAttr(t('todoStats.close'))}" aria-label="${escapeAttr(t('todoStats.close'))}">${CLOSE_ICON}</button>
      </div>
      <div class="todo-stats-body">${buildStatsHtml(stats)}</div>
    </div>`;
}

async function refresh() {
  const log = await loadStatsLog();
  const { active, done } = getTodoGroups();
  paint(summarizeStats([...active, ...done], log));
}

/** 打开统计浮层 */
export async function openTodoStats() {
  await refresh();
  const overlay = ensureOverlay();
  overlay.classList.add('show');
  if (!escHandler) {
    escHandler = (e) => {
      if (e.key !== 'Escape') return;
      // 别让 Esc 顺带把侧边栏会话收掉：浮层是当前焦点
      e.stopPropagation();
      closeTodoStats();
    };
    document.addEventListener('keydown', escHandler);
  }
  overlay.querySelector('.todo-stats-close')?.focus();
}

/** 关闭统计浮层（同时摘掉 Esc 监听，避免开合多次后监听成堆） */
export function closeTodoStats() {
  if (!overlayEl) return;
  overlayEl.classList.remove('show');
  if (escHandler) {
    document.removeEventListener('keydown', escHandler);
    escHandler = null;
  }
}

// 语言热切换：浮层开着的时候标题与标签也要跟着变
subscribe(() => {
  if (overlayEl?.classList.contains('show')) refresh();
});
