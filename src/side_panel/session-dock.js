/**
 * session-dock.js - 执行中会话停靠条
 *
 * 背景：会话一多，正在跑的任务就被埋在标签栏深处。用户要点开好几个会话才能确认
 * 「哪个在跑、跑到哪了、有没有跑完」，切来切去很费劲。
 *
 * 方案：在左侧边缘竖着排一列状态芯片，只放「不是当前会话」的执行条目：
 *   - 执行中：会话标题首字符 + 呼吸光晕，悬停显示当前 ReAct 节点 / 子任务进度
 *   - 排队中：右下角条数徽标（会话还没开始跑，但用户需要知道它在等）
 *   - 已完成：✓ + 一次性高亮脉冲，点进去自动移除，也可手动 × 移除
 *
 * 数据源全部复用现有信号，本模块不新建「运行状态」：
 *   后台 QUERY_SESSION_RUNNING（权威）、state.generatingSessionIds /
 *   pendingCallApiSessionIds（面板本地的跨会话派发记账）、state.completedSessionIds
 *   （完成待查看，已持久化）、queue-store（排队条数）、EXECUTION_STATUS_UPDATE
 *   （当前节点名/子任务进度）、SCHEDULED_TASK_RUN_STATE（定时任务来源）。
 */

import state from './state.js';
import * as queueStore from './queue-store.js';
import { getSession } from '../storage/db.js';
import { handleSessionSwitch } from './session-manager-ui.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  dock: {
    ariaLabel: '执行中会话',
    running: '正在执行',
    node: '正在执行：{node}',
    subtask: '子任务 {index}/{total}',
    queued: '排队 {count} 条',
    done: '已完成，点击查看结果',
    doneAt: '已完成 {time}',
    scheduled: '定时任务',
    dismiss: '从停靠条移除',
    openSession: '点击进入该会话',
    unknownSession: '未知会话',
  },
});
registerTranslations('en', {
  dock: {
    ariaLabel: 'Running sessions',
    running: 'Running',
    node: 'Running: {node}',
    subtask: 'Subtask {index}/{total}',
    queued: '{count} queued',
    done: 'Finished — click to review',
    doneAt: 'Finished {time}',
    scheduled: 'Scheduled task',
    dismiss: 'Remove from dock',
    openSession: 'Click to open this session',
    unknownSession: 'Unknown session',
  },
});

/** 关闭条目后记住的存储键（刷新后不再复活，该会话下次开跑时自动解除） */
const DISMISSED_KEY = 'sessionDockDismissed';
/** 轮询后台运行集合的间隔（仅面板可见时） */
const POLL_MS = 5000;
/** EXECUTION_STATUS_UPDATE 高频到达，渲染去抖 */
const RENDER_DEBOUNCE_MS = 250;
/** 完成态高亮脉冲的类名保留时长（与 CSS 动画时长对齐） */
const DONE_FLASH_MS = 1200;
/** 同时渲染的最大条目数，超出纵向滚动 */
const MAX_VISIBLE = 8;

const PHASE_RANK = { running: 0, queued: 1, done: 2 };

/** sessionId -> { nodeName, subtaskIndex, subtaskTotal } */
const nodeInfo = new Map();
/** sessionId -> 首次观测到执行的时间戳 */
const startedAt = new Map();
/** sessionId -> 观测到完成的时间戳 */
const doneAt = new Map();
/** 定时任务发起的会话 */
const scheduledIds = new Set();
/** 用户手动 × 掉的会话（只对完成态生效） */
const dismissedIds = new Set();
/** sessionId -> 标题缓存（会话刚被后台创建、state.sessions 还没刷新时兜底） */
const titleCache = new Map();
/** 正在补标题的会话，避免重复查库 */
const titlePending = new Set();
/** 后台权威运行集合 */
let runningIds = new Set();
/** 当前已渲染条目（供调度判断是否需要重绘） */
let currentEntries = [];
/** 刚进入完成态的会话：加一次性高亮脉冲 */
let flashIds = new Set();

let dockEl = null;
let tipEl = null;
let renderTimer = null;
let pollTimer = null;
let inited = false;
let doneFlashTimer = null;

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  return [];
}

/**
 * 由各路信号算出停靠条条目（纯函数，便于单测）。
 *
 * 规则：
 * - 当前会话永不出现（用户正看着它，提示是干扰）
 * - 执行中 > 排队中 > 已完成 的优先级；排队数是会话维度，排队但没开跑的也要出现
 * - 「×掉」只对已完成生效：执行中点掉会让人以为任务被取消了
 *
 * @param {Object} input
 * @returns {Array<Object>} 条目数组（按 phase、开始时间排序）
 */
export function buildDockEntries({
  activeSessionId = null,
  titles = {},
  generatingIds = [],
  pendingIds = [],
  runningIds: backendRunningIds = [],
  completedIds = [],
  queuedCounts = {},
  scheduledIds: scheduledIdList = [],
  dismissedIds: dismissedIdList = [],
  nodeInfo: nodeInfoMap = {},
  startedAt: startedAtMap = {},
  doneAt: doneAtMap = {},
} = {}) {
  const executing = new Set([...toArray(generatingIds), ...toArray(pendingIds), ...toArray(backendRunningIds)]);
  const completed = new Set(toArray(completedIds));
  const dismissed = new Set(toArray(dismissedIdList));
  const scheduled = new Set(toArray(scheduledIdList));
  const queuedMap = queuedCounts || {};

  const candidates = new Set([
    ...executing,
    ...completed,
    ...Object.keys(queuedMap),
  ]);

  const entries = [];
  for (const sid of candidates) {
    if (!sid || sid === activeSessionId) continue;

    const queuedCount = Number(queuedMap[sid]) || 0;
    let phase;
    if (executing.has(sid)) phase = 'running';
    else if (queuedCount > 0) phase = 'queued';
    else if (completed.has(sid)) phase = 'done';
    else continue;

    if (phase === 'done' && dismissed.has(sid)) continue;

    const info = nodeInfoMap?.[sid] || {};
    entries.push({
      sessionId: sid,
      title: titles?.[sid] || '',
      phase,
      source: scheduled.has(sid) ? 'scheduled' : 'chat',
      queuedCount,
      nodeName: info.nodeName || '',
      subtaskIndex: info.subtaskIndex || 0,
      subtaskTotal: info.subtaskTotal || 0,
      startedAt: startedAtMap?.[sid] || 0,
      doneAt: doneAtMap?.[sid] || 0,
    });
  }

  entries.sort((a, b) => {
    const rank = PHASE_RANK[a.phase] - PHASE_RANK[b.phase];
    if (rank !== 0) return rank;
    const ta = a.phase === 'done' ? a.doneAt : a.startedAt;
    const tb = b.phase === 'done' ? b.doneAt : b.startedAt;
    if (ta !== tb) return ta - tb;
    return String(a.sessionId).localeCompare(String(b.sessionId));
  });

  return entries;
}

/** 该会话是否已经在跑（用于判定 startedAt / 清理 dismiss 标记） */
function isExecutingNow(sessionId) {
  return runningIds.has(sessionId)
    || state.generatingSessionIds.has(sessionId)
    || state.pendingCallApiSessionIds.has(sessionId);
}

/** 读取所有会话的排队条数 */
function readQueuedCounts() {
  const counts = {};
  try {
    const sessionIds = queueStore.listSessionIdsWithItems();
    for (const sid of sessionIds) {
      const count = queueStore.getQueuedCount(sid);
      if (count > 0) counts[sid] = count;
    }
  } catch (e) {
    logger.debug('[SessionDock] read queue counts failed:', e?.message || e);
  }
  return counts;
}

/** 标题：优先 state.sessions，缺失时异步补一次（后台新建的定时任务会话可能还没进缓存） */
function readTitles() {
  const titles = {};
  for (const session of state.sessions || []) {
    titles[session.id] = session.title || '';
  }
  for (const [sid, title] of titleCache) {
    if (!titles[sid]) titles[sid] = title;
  }
  return titles;
}

/** 补齐缺失标题（每会话只查一次库） */
function hydrateMissingTitles(sessionIds) {
  for (const sid of sessionIds) {
    if (!sid || titleCache.has(sid) || titlePending.has(sid)) continue;
    titlePending.add(sid);
    getSession(sid).then((session) => {
      if (session) titleCache.set(sid, session.title || '');
    }).catch(() => {}).finally(() => {
      titlePending.delete(sid);
      scheduleRender();
    });
  }
}

function formatClock(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 条目状态文案（tooltip 第二行） */
function describeEntry(entry) {
  if (entry.phase === 'running') {
    const base = entry.nodeName ? t('dock.node', { node: entry.nodeName }) : t('dock.running');
    return entry.subtaskTotal > 1
      ? `${base} · ${t('dock.subtask', { index: entry.subtaskIndex, total: entry.subtaskTotal })}`
      : base;
  }
  if (entry.phase === 'queued') return t('dock.queued', { count: entry.queuedCount });
  return entry.doneAt ? t('dock.doneAt', { time: formatClock(entry.doneAt) }) : t('dock.done');
}

/** 计算当前应该显示的条目，并维护 startedAt / doneAt / dismiss 标记 */
function collectEntries() {
  const completionSet = state.completedSessionIds;

  // 维护时间戳：首次观测到运行 → startedAt；离开运行且被标记完成 → doneAt
  for (const sid of new Set([
    ...runningIds,
    ...state.generatingSessionIds,
    ...state.pendingCallApiSessionIds,
  ])) {
    if (!startedAt.has(sid)) startedAt.set(sid, Date.now());
    // 该会话重新开跑：之前的「×掉」失效，否则下次完成就不再提示了
    dismissedIds.delete(sid);
    doneAt.delete(sid);
  }
  for (const sid of completionSet) {
    if (!doneAt.has(sid) && !isExecutingNow(sid)) doneAt.set(sid, Date.now());
  }

  const entries = buildDockEntries({
    activeSessionId: state.activeSessionId,
    titles: readTitles(),
    generatingIds: state.generatingSessionIds,
    pendingIds: state.pendingCallApiSessionIds,
    runningIds,
    completedIds: completionSet,
    queuedCounts: readQueuedCounts(),
    scheduledIds,
    dismissedIds,
    nodeInfo: Object.fromEntries(nodeInfo),
    startedAt: Object.fromEntries(startedAt),
    doneAt: Object.fromEntries(doneAt),
  });

  hydrateMissingTitles(entries.map((e) => e.sessionId));
  return entries;
}

/** 首次进入完成态的会话打一次高亮脉冲 */
function trackFlashes(entries) {
  const previousDone = new Set(currentEntries.filter((e) => e.phase === 'done').map((e) => e.sessionId));
  const fresh = entries
    .filter((e) => e.phase === 'done' && !previousDone.has(e.sessionId))
    .map((e) => e.sessionId);
  if (fresh.length === 0) return;
  flashIds = new Set(fresh);
  if (doneFlashTimer) clearTimeout(doneFlashTimer);
  doneFlashTimer = setTimeout(() => {
    doneFlashTimer = null;
    flashIds = new Set();
    scheduleRender();
  }, DONE_FLASH_MS);
}

function ensureDock() {
  if (dockEl || typeof document === 'undefined') return dockEl;
  dockEl = document.createElement('div');
  dockEl.className = 'session-dock';
  dockEl.id = 'sessionDock';
  dockEl.setAttribute('role', 'navigation');
  document.body.appendChild(dockEl);

  tipEl = document.createElement('div');
  tipEl.className = 'session-dock-tip';
  document.body.appendChild(tipEl);

  syncDockBounds();
  const chatContainer = document.getElementById('chatContainer');
  if (chatContainer && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(syncDockBounds).observe(chatContainer);
  }
  window.addEventListener('resize', syncDockBounds);
  return dockEl;
}

/**
 * 停靠条上边界与聊天区可视区对齐。
 * 只占顶部一段、向下堆叠：左侧垂直中心已经被「消息跳转热区」(.chat-nav-hotzone) 占住，
 * 停在那里会互相遮挡。
 */
function syncDockBounds() {
  if (!dockEl) return;
  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer) return;
  const rect = chatContainer.getBoundingClientRect();
  dockEl.style.top = `${Math.max(0, Math.round(rect.top + 8))}px`;
}

function buildChip(entry) {
  const wrapper = document.createElement('div');
  wrapper.className = 'session-dock-item';
  wrapper.dataset.sessionId = entry.sessionId;
  wrapper.dataset.phase = entry.phase;
  if (flashIds.has(entry.sessionId)) wrapper.classList.add('is-flash');

  const title = entry.title || t('dock.unknownSession');
  const status = describeEntry(entry);
  const face = entry.phase === 'done'
    ? '✓'
    : (Array.from(title)[0] || '?');

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'session-dock-chip';
  chip.setAttribute('aria-label', `${title} · ${status}`);
  chip.title = '';
  chip.textContent = face;
  chip.addEventListener('click', () => {
    void handleSessionSwitch(entry.sessionId);
  });
  wrapper.appendChild(chip);

  if (entry.queuedCount > 0 && entry.phase !== 'done') {
    const badge = document.createElement('span');
    badge.className = 'session-dock-badge';
    badge.textContent = String(entry.queuedCount > 99 ? '99+' : entry.queuedCount);
    wrapper.appendChild(badge);
  }

  if (entry.source === 'scheduled') {
    const clock = document.createElement('span');
    clock.className = 'session-dock-clock';
    wrapper.appendChild(clock);
  }

  // × 只出现在完成态：执行中点掉会被误读成「取消任务」
  if (entry.phase === 'done') {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'session-dock-dismiss';
    closeBtn.setAttribute('aria-label', t('dock.dismiss'));
    closeBtn.title = t('dock.dismiss');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissEntry(entry.sessionId);
    });
    wrapper.appendChild(closeBtn);
  }

  wrapper.addEventListener('mouseenter', () => showTip(wrapper, title, status));
  wrapper.addEventListener('mouseleave', hideTip);
  wrapper.addEventListener('focusin', () => showTip(wrapper, title, status));
  wrapper.addEventListener('focusout', hideTip);

  return wrapper;
}

function showTip(anchor, title, status) {
  if (!tipEl) return;
  tipEl.innerHTML = '';
  const titleEl = document.createElement('div');
  titleEl.className = 'session-dock-tip-title';
  titleEl.textContent = title;
  const statusEl = document.createElement('div');
  statusEl.className = 'session-dock-tip-status';
  statusEl.textContent = status;
  tipEl.appendChild(titleEl);
  tipEl.appendChild(statusEl);

  const rect = anchor.getBoundingClientRect();
  tipEl.style.top = `${Math.round(rect.top)}px`;
  tipEl.style.left = `${Math.round(rect.right + 8)}px`;
  tipEl.classList.add('show');
}

function hideTip() {
  if (tipEl) tipEl.classList.remove('show');
}

function dismissEntry(sessionId) {
  if (!sessionId) return;
  dismissedIds.add(sessionId);
  persistDismissed();
  scheduleRender();
}

function persistDismissed() {
  try {
    chrome.storage.local.set({ [DISMISSED_KEY]: Array.from(dismissedIds) }).catch(() => {});
  } catch { /* 无 chrome 环境（测试）忽略 */ }
}

function restoreDismissed() {
  try {
    chrome.storage.local.get([DISMISSED_KEY], (result) => {
      const ids = result?.[DISMISSED_KEY];
      if (!Array.isArray(ids)) return;
      for (const sid of ids) dismissedIds.add(sid);
      scheduleRender();
    });
  } catch { /* 无 chrome 环境（测试）忽略 */ }
}

/** 渲染停靠条（无条目时整体移除类与节点，聊天区恢复原宽） */
export function renderDock() {
  if (!ensureDock()) return;
  const entries = collectEntries();
  trackFlashes(entries);
  currentEntries = entries;

  dockEl.innerHTML = '';
  if (entries.length === 0) {
    dockEl.classList.remove('show');
    document.body.classList.remove('has-session-dock');
    hideTip();
    return;
  }

  for (const entry of entries.slice(0, MAX_VISIBLE)) {
    dockEl.appendChild(buildChip(entry));
  }
  dockEl.style.maxHeight = '';
  dockEl.classList.add('show');
  // 预留左侧走廊，避免芯片压住消息正文（排版让位，不靠透明叠字）
  document.body.classList.add('has-session-dock');
}

/** 去抖渲染：EXECUTION_STATUS_UPDATE 一轮能来几十条 */
function scheduleRender() {
  if (renderTimer) return;
  renderTimer = setTimeout(() => {
    renderTimer = null;
    try {
      renderDock();
    } catch (e) {
      logger.warn('[SessionDock] render failed:', e?.message || e);
    }
  }, RENDER_DEBOUNCE_MS);
}

/** 向后台确认「哪些会话真的在跑」（面板自己启动时本地集合是空的） */
function refreshRunningFromBackground() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'QUERY_SESSION_RUNNING' }, (res) => {
        if (chrome.runtime.lastError || !res) { resolve(); return; }
        if (Array.isArray(res.activeSessionIds)) runningIds = new Set(res.activeSessionIds);
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

function onExecutionStatus(message) {
  const sid = message?.sessionId;
  if (!sid) return;
  const prev = nodeInfo.get(sid) || {};
  nodeInfo.set(sid, {
    nodeName: message.nodeName || prev.nodeName || '',
    subtaskIndex: message.subtaskIndex || prev.subtaskIndex || 0,
    subtaskTotal: message.subtaskTotal || prev.subtaskTotal || 0,
  });
  scheduleRender();
}

function clearEntry(sessionId) {
  if (!sessionId) return;
  nodeInfo.delete(sessionId);
  startedAt.delete(sessionId);
  doneAt.delete(sessionId);
  dismissedIds.delete(sessionId);
  titleCache.delete(sessionId);
  scheduleRender();
}

/** 初始化停靠条（幂等） */
export function initSessionDock() {
  if (inited || typeof document === 'undefined') return;
  if (!ensureDock()) return;
  inited = true;

  restoreDismissed();

  document.addEventListener('generating-state-changed', scheduleRender);
  document.addEventListener('session-switched', scheduleRender);
  document.addEventListener('generation-ended', (e) => {
    const sid = e?.detail?.sessionId;
    if (sid && !doneAt.has(sid)) doneAt.set(sid, Date.now());
    scheduleRender();
  });
  // 归档 / 彻底删除后，条目立即消失（含「彻底删除已被归档的会话」这条路径）
  document.addEventListener('session-archived', (e) => clearEntry(e?.detail?.sessionId));
  document.addEventListener('session-deleted', (e) => clearEntry(e?.detail?.sessionId));

  try {
    queueStore.subscribe(scheduleRender);
  } catch (e) {
    logger.debug('[SessionDock] subscribe queue failed:', e?.message || e);
  }

  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message) return false;
      if (message.type === 'EXECUTION_STATUS_UPDATE') {
        onExecutionStatus(message);
        return false;
      }
      if (message.type === 'SCHEDULED_TASK_RUN_STATE' && message.sessionId) {
        if (message.running) scheduledIds.add(message.sessionId);
        else scheduledIds.delete(message.sessionId);
        scheduleRender();
        return false;
      }
      if (message.type === 'SCHEDULED_SESSION_UPDATED') {
        scheduleRender();
        return false;
      }
      return false;
    });
  } catch (e) {
    logger.debug('[SessionDock] register runtime listener failed:', e?.message || e);
  }

  // 面板可见时低频校准后台运行集合；切回页面立即补一次
  const startPolling = () => {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (document.hidden) return;
      void refreshRunningFromBackground().then(scheduleRender);
    }, POLL_MS);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    void refreshRunningFromBackground().then(scheduleRender);
  });
  startPolling();

  void refreshRunningFromBackground().then(() => {
    // 面板启动/重开后本地集合是空的，第一帧就要把后台在跑的会话补上
    for (const sid of runningIds) {
      if (!startedAt.has(sid)) startedAt.set(sid, Date.now());
    }
    renderDock();
  });
}

/** 仅供测试：清空模块内累积状态 */
export function __resetSessionDockForTest() {
  nodeInfo.clear();
  startedAt.clear();
  doneAt.clear();
  scheduledIds.clear();
  dismissedIds.clear();
  titleCache.clear();
  titlePending.clear();
  runningIds = new Set();
  currentEntries = [];
  flashIds = new Set();
}
