// queue-panel.js - 输入区上方的排队条（chip 列表 / 拖拽排序 / 编辑回填 / 最近处理）
//
// 只渲染**当前激活会话**的队列：会话切换即整条重绘，绝不跨会话聚合。
// 调整顺序只走拖拽（store.reorder）——顶部按钮太多且与拖拽重复，已移除。

import state from './state.js';
import logger from '../shared/logger.js';
import { t } from '../shared/i18n.js';
import { showToast, escapeHtml } from './utils.js';
import * as store from './queue-store.js';
import { QUEUE_STATUS } from './queue-store.js';
import { enqueueFromInput, resumeQueue, hasContext, currentInputHasContext, restoreContextForItem, releaseAttachments, injectQueueItem } from './queue-runner.js';

/** DOM 引用 */
let stripEl = null;
let listEl = null;
let summaryEl = null;
let pausedTagEl = null;
let resumeBtnEl = null;
let stopSendBtnEl = null;
let recentBtnEl = null;
let recentEl = null;
let toggleBtnEl = null;
let headEl = null;

/** 展开状态（用户手动控制，切换会话保持） */
let expanded = false;
let recentVisible = false;

/** 拖拽中的条目 id */
let draggingId = null;

const STATUS_LABEL_KEY = {
  [QUEUE_STATUS.DISPATCHING]: 'queue.statusDispatching',
  [QUEUE_STATUS.INJECTING]: 'queue.statusInjecting',
  [QUEUE_STATUS.INJECTED]: 'queue.statusInjected',
  [QUEUE_STATUS.DONE]: 'queue.statusDone',
  [QUEUE_STATUS.FAILED]: 'queue.statusFailed',
};

/**
 * 条目状态标签：只返回“值得说”的状态。
 * queued 是这整块区域的默认态（列在这里的都是排队中的），再标一句“排队中”等于没说；
 * 只有“上次未完成”这类例外需要单独提示。
 */
function statusText(item) {
  if (item.status === QUEUE_STATUS.QUEUED) {
    return item.interrupted ? t('queue.statusRecovered') : '';
  }
  const key = STATUS_LABEL_KEY[item.status];
  return key ? t(key) : '';
}

function currentSessionId() {
  return state.activeSessionId;
}

// ============================================================
// 渲染
// ============================================================

/**
 * chip 上的上下文徽标。
 * 图片/文件单独计数（“2 图 · 1 文件”），用户一眼能确认带的东西没溜。
 */
function contextBadge(item) {
  const summary = item.attachmentSummary
    || (item.contextSnapshot && item.contextSnapshot.attachmentSummary)
    || null;
  const parts = [];
  if (summary) {
    if (summary.imageCount) parts.push(t('queue.withImages', { count: summary.imageCount }));
    if (summary.fileCount) parts.push(t('queue.withFiles', { count: summary.fileCount }));
  }
  const text = parts.length
    ? parts.join(' · ')
    : (hasContext(item.contextSnapshot) ? t('queue.withContext') : '');
  if (!text) return '';
  const title = (summary && (summary.fileNames || []).length)
    ? summary.fileNames.join('\u3001')
    : text;
  return `<span class="queue-chip-ctx" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
}

function renderChip(item, index) {
  const ctxBadge = contextBadge(item);
  // 正在执行的那条：drainOnce 要 await 整个任务跑完才出队，
  // 所以它会在列表里停留整轮生成（含工具调用），必须让用户看出它不是在“等”。
  const running = item.status === QUEUE_STATUS.DISPATCHING;
  const label = statusText(item);
  const statusHtml = label
    ? `<span class="queue-chip-status${running ? ' running' : ''}${item.interrupted ? ' warning' : ''}"${running ? ` title="${escapeHtml(t('queue.statusRunningHint'))}"` : ''}>${escapeHtml(label)}</span>`
    : '';
  const meta = statusHtml + ctxBadge;
  // ⚡ 插话：只有任务真跑着才有意义。不置 disabled —— 置灰按钮点不动且不说原因，
  // 用户只会以为坏了；用 muted 弱化，点了由后台给出权威结论（“当前没有正在执行的任务”）。
  const canInject = state.isGenerating === true;
  return `
    <div class="queue-chip" draggable="true" data-id="${escapeHtml(item.id)}" data-status="${escapeHtml(item.status)}">
      <span class="queue-chip-index">${index + 1}</span>
      <div class="queue-chip-main">
        <div class="queue-chip-text" title="${escapeHtml(item.text)}">${escapeHtml(item.text)}</div>
        ${meta ? `<div class="queue-chip-meta">${meta}</div>` : ''}
      </div>
      <div class="queue-chip-actions">
        <button class="queue-chip-btn inject${canInject ? '' : ' muted'}" type="button" data-act="inject" title="${escapeHtml(canInject ? t('queue.inject') : t('queue.injectIdleHint'))}">⚡</button>
        <button class="queue-chip-btn" type="button" data-act="edit" title="${escapeHtml(t('queue.editBack'))}">✎</button>
        <button class="queue-chip-btn danger" type="button" data-act="remove" title="${escapeHtml(t('queue.delete'))}">✕</button>
      </div>
    </div>`;
}

function renderRecent(recent) {
  if (!recent.length) {
    return `<div class="queue-recent-empty">${escapeHtml(t('queue.recentEmpty'))}</div>`;
  }
  return recent.map((item) => `
    <div class="queue-recent-item" data-id="${escapeHtml(item.id)}">
      <span class="queue-recent-status">${escapeHtml(statusText(item))}</span>
      <span class="queue-recent-text" title="${escapeHtml(item.text)}">${escapeHtml(item.text)}</span>
      <button class="queue-chip-btn" type="button" data-act="requeue" title="${escapeHtml(t('queue.requeue'))}">↺</button>
      <button class="queue-chip-btn danger" type="button" data-act="forget" title="${escapeHtml(t('queue.forgetRecent'))}">✕</button>
    </div>`).join('');
}

/**
 * 重绘整条。
 * @param {{flash?: boolean}} [options]
 */
export function renderQueue(options = {}) {
  if (!stripEl) return;
  // 拖拽重排进行中：重建 innerHTML 会让 draggingId 指向的节点脱离 DOM，
  // drop 目标丢失、排序静默失败。挂起渲染，dragend 时补一次。
  if (draggingId) return;
  const sessionId = currentSessionId();
  if (!sessionId) {
    stripEl.style.display = 'none';
    return;
  }

  const bucket = store.getBucket(sessionId);
  const items = bucket.items;
  const hasItems = items.length > 0;
  // 归档里“失败且未重试”的条目：这是失败任务唯一的手动重试入口，必须给提醒
  const failedCount = bucket.recent.filter((it) => it.status === QUEUE_STATUS.FAILED).length;
  const needsAttention = failedCount > 0;

  // 显示条件（三选一）：有排队项 / 有失败待处理 / 用户主动打开了归档。
  // 不能“只要归档非空就显示”：任务全部成功时也会留下“队列已空”这一行，
  // 永久占住输入区且用户无法移除。全成功时整条消失，失败时才留一行提醒，
  // 用户主动展开「最近处理」期间照旧保留（收起后若无失败随即消失）。
  // 归档被清空时即使展开着也收起：否则移除最后一条后只剩“队列已空”占着位置。
  if (!hasItems && !needsAttention && (!recentVisible || bucket.recent.length === 0)) {
    stripEl.style.display = 'none';
    return;
  }

  stripEl.style.display = '';
  stripEl.classList.toggle('empty', !hasItems);
  stripEl.classList.toggle('expanded', expanded && hasItems);
  stripEl.classList.toggle('paused', bucket.paused);

  if (summaryEl) {
    if (hasItems) {
      summaryEl.textContent = t('queue.summary', { count: items.length });
      summaryEl.classList.remove('failed');
      summaryEl.removeAttribute('title');
    } else if (needsAttention) {
      summaryEl.textContent = t('queue.summaryFailed', { count: failedCount });
      summaryEl.classList.add('failed');
      summaryEl.title = t('queue.summaryFailedHint');
    } else {
      summaryEl.textContent = t('queue.summaryEmpty');
      summaryEl.classList.remove('failed');
      summaryEl.removeAttribute('title');
    }
  }
  if (pausedTagEl) {
    pausedTagEl.style.display = bucket.paused ? '' : 'none';
    pausedTagEl.title = bucket.pausedReason === 'user_stopped'
      ? t('queue.pausedByStop')
      : t('queue.pausedHint');
  }
  if (resumeBtnEl) {
    const showResume = bucket.paused && items.length > 0;
    resumeBtnEl.style.display = showResume ? '' : 'none';
    resumeBtnEl.textContent = t('queue.resumeQueue');
  }
  if (stopSendBtnEl) {
    // 只有“任务真在跑 + 队列里真在等”时才有意义：
    // 不跑时这个按钮无事可做，队列空时牺牲当前进度毫无意义
    const showStopSend = state.isGenerating === true && hasItems && !bucket.paused;
    stopSendBtnEl.style.display = showStopSend ? '' : 'none';
  }
  if (recentBtnEl) {
    recentBtnEl.classList.toggle('active', recentVisible);
    recentBtnEl.title = t('queue.recentTitle');
  }
  if (toggleBtnEl) {
    toggleBtnEl.style.display = hasItems ? '' : 'none';
    toggleBtnEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggleBtnEl.textContent = expanded ? '▲' : '▼';
  }

  if (listEl) {
    listEl.style.display = expanded && hasItems ? '' : 'none';
    listEl.innerHTML = hasItems ? items.map((item, i) => renderChip(item, i)).join('') : '';
  }
  if (recentEl) {
    recentEl.style.display = recentVisible ? '' : 'none';
    recentEl.innerHTML = recentVisible ? renderRecent(bucket.recent) : '';
  }

  if (options.flash) {
    stripEl.classList.remove('queue-flash');
    // 强制回流以重启动画
    void stripEl.offsetWidth;
    stripEl.classList.add('queue-flash');
  }
}

// ============================================================
// 交互
// ============================================================

/**
 * 回填输入框并出队：用户要改的是这条，改完再决定什么时候发。
 * ✎ 按钮与 ↑ 编辑队尾共用这一条路径，避免两处逻辑各自漂移。
 * @param {string} itemId
 * @param {{viaShortcut?: boolean}} [options] viaShortcut 时补一句提示，让 ↑ 有反馈
 * @returns {Promise<boolean>} 是否真的回填了
 */
export async function editQueueItem(itemId, options = {}) {
  const sessionId = currentSessionId();
  if (!sessionId || !itemId) return false;
  const item = store.findItem(sessionId, itemId);
  if (!item) return false;
  const userInput = document.getElementById('userInput');

  // 1) 输入框已有草稿：先把草稿“连同它挂的上下文”一起入队。
  //    只搬文字会丢草稿上的引用/技能/图片；autoDrain=false 避免它被立即派发。
  if (userInput && userInput.value.trim()) {
    const res = await enqueueFromInput({ autoDrain: false });
    if (!res.ok) {
      // 草稿既没进队列又要被回填覆盖 → 中止回填，保住草稿（条目仍在队列里，没丢）
      showToast(res.error === 'queue_full'
        ? t('queue.queueFull', { limit: res.limit })
        : t('queue.enqueueFailed'), 'warning');
      return false;
    }
  } else if (currentInputHasContext()) {
    // 没写字但挂了图片/文件/引用：回填会先复位输入区，这些会被 revoke/清掉。
    // 宁可拦住让用户先处理，也绝不静默丢掉它们。
    showToast(t('queue.inputHasUnsavedContext'), 'warning', 4000);
    return false;
  }

  // 2) 取回这条的完整上下文：图片/文件（IndexedDB）＋引用/划词/技能/MCP/知识库/网页。
  //    必须赶在 removeItem 前，否则索引库里的附件记录会被释放。
  const restored = await restoreContextForItem(item);

  // 3) 回填文本
  if (userInput) {
    userInput.value = item.text;
    userInput.style.height = 'auto';
    userInput.dispatchEvent(new Event('input'));
    userInput.focus();
  }
  await store.removeItem(sessionId, itemId);
  await releaseAttachments(itemId);

  if (restored.wantsAttachments) {
    showToast(
      restored.attachments ? t('queue.editBackWithAttachments') : t('queue.attachmentsMissing'),
      restored.attachments ? 'success' : 'warning',
      2500,
    );
  } else if (options.viaShortcut) {
    showToast(t('queue.editTailHint'), 'info', 2000);
  }
  return true;
}

/**
 * 「↑ 编辑队尾」：键盘入口，等价于点最后一条的 ✎。
 * 返回值必须是同步布尔 —— 调用方要靠它决定是否 preventDefault。
 * @returns {boolean} 是否接管了这次按键
 */
export function editQueueTail() {
  const sessionId = currentSessionId();
  if (!sessionId) return false;
  const target = store.peekTailForEdit(sessionId);
  if (!target) return false;
  void editQueueItem(target.id, { viaShortcut: true });
  return true;
}

async function handleChipAction(act, itemId) {
  const sessionId = currentSessionId();
  if (!sessionId || !itemId) return;
  const items = store.getItems(sessionId);
  const index = items.findIndex((it) => it.id === itemId);
  if (index < 0) return;

  switch (act) {
    case 'edit':
      // 回填输入框并出队（与 ↑ 编辑队尾走同一条路径）
      await editQueueItem(itemId);
      break;
    case 'inject':
      // 两段式提交全在 runner 里：这里只管把意图传下去，toast 由它统一给
      await injectQueueItem(itemId, sessionId);
      break;
    case 'remove':
      await store.removeItem(sessionId, itemId);
      await releaseAttachments(itemId);
      showToast(t('queue.deleted'), 'info', 1500);
      break;
    default:
      break;
  }
}

/** 统一排序入口（拖拽是唯一入口） */
async function applyOrder(orderedIds) {
  const sessionId = currentSessionId();
  if (!sessionId) return;
  await store.reorder(sessionId, orderedIds);
}

/**
 * 拖拽落点计算：把拖动项插到目标项之前/之后。
 * @param {DragEvent} e
 * @param {HTMLElement} targetChip
 */
async function handleDrop(e, targetChip) {
  e.preventDefault();
  if (!draggingId) return;
  const targetId = targetChip?.dataset?.id;
  if (!targetId || targetId === draggingId) return;

  const sessionId = currentSessionId();
  if (!sessionId) return;
  const ids = store.getItems(sessionId).map((it) => it.id);
  const from = ids.indexOf(draggingId);
  if (from < 0) return;
  ids.splice(from, 1);

  const rect = targetChip.getBoundingClientRect();
  const after = (e.clientY - rect.top) > rect.height / 2;
  let insertAt = ids.indexOf(targetId);
  if (insertAt < 0) insertAt = ids.length;
  else if (after) insertAt += 1;

  ids.splice(insertAt, 0, draggingId);
  await applyOrder(ids);
}

function bindDragEvents() {
  if (!listEl) return;

  listEl.addEventListener('dragstart', (e) => {
    const chip = e.target.closest?.('.queue-chip');
    if (!chip) return;
    draggingId = chip.dataset.id;
    chip.classList.add('dragging');
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggingId);
    } catch { /* 部分环境不支持，忽略 */ }
  });

  listEl.addEventListener('dragend', (e) => {
    const chip = e.target.closest?.('.queue-chip');
    if (chip) chip.classList.remove('dragging');
    draggingId = null;
    listEl.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach((el) => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    // 拖拽期间被挂起的渲染在这里补上（可能已累积多次 store 变更）
    renderQueue();
  });

  listEl.addEventListener('dragover', (e) => {
    const chip = e.target.closest?.('.queue-chip');
    if (!chip || !draggingId || chip.dataset.id === draggingId) return;
    e.preventDefault();
    const rect = chip.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    chip.classList.toggle('drag-over-bottom', after);
    chip.classList.toggle('drag-over-top', !after);
  });

  listEl.addEventListener('dragleave', (e) => {
    const chip = e.target.closest?.('.queue-chip');
    if (chip) chip.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  listEl.addEventListener('drop', (e) => {
    const chip = e.target.closest?.('.queue-chip');
    void handleDrop(e, chip);
  });
}

function bindEvents() {
  // chip 内按钮（事件委托）
  listEl?.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.queue-chip-btn');
    if (!btn || btn.disabled) return;
    const chip = btn.closest('.queue-chip');
    if (!chip) return;
    void handleChipAction(btn.dataset.act, chip.dataset.id);
  });

  // 最近处理：重新入队 / 从记录中移除
  recentEl?.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('.queue-chip-btn');
    const row = btn?.closest('.queue-recent-item');
    const sessionId = currentSessionId();
    if (!btn || !row || !sessionId) return;

    // 用户主动放弃：失败条目的提醒会一直占着队列条，没这个入口就等于永远移不掉
    if (btn.dataset.act === 'forget') {
      const ok = await store.removeFromRecent(sessionId, row.dataset.id);
      if (ok) showToast(t('queue.forgotRecent'), 'success', 1500);
      return;
    }
    if (btn.dataset.act !== 'requeue') return;
    // 归档只保留文本与附件摘要（base64 已释放），重新入队后只能恢复文字，需如实告知
    const archived = store.getRecent(sessionId).find((it) => it.id === row.dataset.id);
    const lostAttachments = !!(archived && archived.attachmentSummary);
    const res = await store.requeueFromRecent(sessionId, row.dataset.id);
    if (!res.ok) {
      showToast(res.error === 'queue_full'
        ? t('queue.queueFull', { limit: res.limit })
        : t('queue.enqueueFailed'), 'warning');
      return;
    }
    showToast(
      lostAttachments ? t('queue.requeuedNoAttachments') : t('queue.requeued'),
      lostAttachments ? 'warning' : 'success',
      2500,
    );
  });

  toggleBtnEl?.addEventListener('click', () => {
    expanded = !expanded;
    renderQueue();
  });

  // 整行标题都是折叠开关：右侧 ▲▼ 只有 11px，点它才能收放太难命中。
  // 按钮各有自己的 handler（继续队列 / 最近处理 / ▲▼），冒泡到这里必须让路，
  // 否则点 ▲▼ 会被切换两次，等于点了没反应。
  headEl?.addEventListener('click', (e) => {
    if (e.target.closest?.('button')) return;
    if (!store.getItems(currentSessionId() || '').length) return;
    expanded = !expanded;
    renderQueue();
  });

  recentBtnEl?.addEventListener('click', () => {
    recentVisible = !recentVisible;
    if (recentVisible) expanded = true;
    renderQueue();
  });

  resumeBtnEl?.addEventListener('click', async () => {
    await resumeQueue();
    showToast(t('queue.resumed'), 'success', 1500);
  });

  // 停止并发送：真正的停止动作在入口层（它持有取消函数与按钮），
  // 这里只把意图广播出去 —— 队列模块不 import chat 模块（那会成环）
  stopSendBtnEl?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('queue-stop-and-send'));
  });

  bindDragEvents();

  // store 变化 → 重绘（含其它面板实例的写入）
  store.subscribe(() => renderQueue());

  // 入队成功 → 展开并闪一下，让用户看见"确实进去了"
  document.addEventListener('queue-enqueued', () => {
    expanded = true;
    renderQueue({ flash: true });
  });

  // 会话切换 → 整条重绘（只显示当前会话的队列）
  document.addEventListener('session-switched', () => {
    renderQueue();
  });

  // 生成结束：接力会改动队列状态，重绘一次保证徽标正确
  document.addEventListener('generation-ended', () => renderQueue());

  // 生成开始 / 结束都会改变 ⚡ 是否可用：不重绘的话按钮会一直停在旧样子
  document.addEventListener('generating-state-changed', () => renderQueue());
}

/**
 * 供外部在"会话已就绪"后主动刷新（首次加载时 activeSessionId 晚于排队条初始化）。
 * 内部保证存储已加载，避免读到空内存。
 */
export async function refreshQueueUI() {
  await store.init();
  renderQueue();
}

/**
 * 初始化队列条（幂等）。
 */
export async function initQueuePanel() {
  await store.init();
  stripEl = document.getElementById('queueStrip');
  if (!stripEl) {
    logger.warn('[QueuePanel] #queueStrip not found, queue UI disabled');
    return;
  }
  listEl = document.getElementById('queueList');
  summaryEl = document.getElementById('queueSummary');
  pausedTagEl = document.getElementById('queuePausedTag');
  resumeBtnEl = document.getElementById('queueResumeBtn');
  stopSendBtnEl = document.getElementById('queueStopSendBtn');
  recentBtnEl = document.getElementById('queueRecentBtn');
  recentEl = document.getElementById('queueRecent');
  toggleBtnEl = document.getElementById('queueToggleBtn');
  headEl = stripEl.querySelector('.queue-strip-head');

  bindEvents();
  renderQueue();
}
