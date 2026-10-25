// queue-store.js - 会话维度的消息排队队列（持久化 / 排序 / 租约 / 归档）
//
// 设计要点（对应方案第三节）：
// 1. 队列按 sessionId 隔离：sessionId 就是队列主键，会话之间互不共享、互不聚合。
// 2. 状态转换同步落盘（不等去抖），只有纯文本编辑做短合并 —— 崩溃最多丢掉"正在改的措辞"，
//    绝不会丢条目本身。这是用户明确提出的硬要求（想法收集起来不容易，丢了没法回想）。
// 3. 任何"从队列消失"的路径都必须先落进 recent 归档，保证条目永远可找回、可重新入队。
//    唯一的例外是会话被删除：队列随会话一并丢弃（与消息历史同语义），不留看不见的僵尸。
// 4. 多面板实例共享同一份存储，靠 storage.onChanged 同步 + 派发租约（leaseUntil）防双发。

import logger from '../shared/logger.js';

const STORAGE_KEY = 'promptQueues';
const SCHEMA_VERSION = 1;

export const MAX_ITEMS_PER_SESSION = 20;
export const MAX_RECENT = 30;
/** 派发租约时长：抢到租约的实例在窗口内独占该条目的派发权 */
export const LEASE_MS = 30 * 1000;
/** 插话等待后台确认吸收的最长时间，超时即回退队列（防呆） */
export const INJECT_DEADLINE_MS = 15 * 1000;
/**
 * 同一条自动派发的尝试上限。
 * 任何未预料到的重复派发路径（回声回灌、多实例竞争）都靠它兜底止损：
 * 到顶即入归档置 failed，用户仍可从「最近处理」重新入队，不会无限重跑。
 */
export const MAX_DISPATCH_ATTEMPTS = 5;
/** 纯文本编辑的落盘合并窗口 */
const TEXT_EDIT_DEBOUNCE_MS = 200;
/**
 * 本实例最近写入的序列化值（回声指纹）。
 * 不能用「最后一次写入」单值去重：连续两次 persistNow 之间，上一次的 onChanged
 * 可能才到达，单值比不过它 → 内存被回滚成旧快照，删除的条目复活、
 * 正在派发的条目被打回 queued → 同一条无限重跑。
 */
const LOCAL_ECHO_LIMIT = 20;

/** 队列条目状态 */
export const QUEUE_STATUS = {
  QUEUED: 'queued',
  DISPATCHING: 'dispatching',
  INJECTING: 'injecting',
  INJECTED: 'injected',
  DONE: 'done',
  FAILED: 'failed',
};

/** 终态集合：进入终态即移入 recent 归档 */
const TERMINAL_STATUSES = new Set([
  QUEUE_STATUS.INJECTED,
  QUEUE_STATUS.DONE,
  QUEUE_STATUS.FAILED,
]);

// ============================================================
// 存储适配器（可注入，便于单测用内存实现）
// ============================================================

const defaultAdapter = {
  async get(key) {
    const res = await chrome.storage.local.get(key);
    return res ? res[key] : undefined;
  },
  async set(obj) {
    await chrome.storage.local.set(obj);
  },
};

let adapter = defaultAdapter;

/** 仅供测试：替换存储适配器 */
export function __setStorageAdapter(next) {
  adapter = next || defaultAdapter;
}

/** 仅供测试：重置内存态，强制下次 init 重新读取 */
export function __resetStoreForTest() {
  memory = emptyState();
  loaded = false;
  loadingPromise = null;
  degraded = false;
  lastSerialized = '';
  localEchoes.clear();
  listeners.clear();
  for (const timer of editTimers.values()) clearTimeout(timer);
  editTimers.clear();
}

// ============================================================
// 内存态
// ============================================================

function emptyState() {
  return { version: SCHEMA_VERSION, sessions: {} };
}

let memory = emptyState();
let loaded = false;
let loadingPromise = null;
/**
 * 降级态：读盘失败时为 true。
 * 语义是"磁盘上的内容未知"，因此任何写入都必须禁止（否则空快照会覆盖真数据）。
 */
let degraded = false;
let lastSerialized = '';
const localEchoes = new Set(); // 本实例写过的序列化值（防回声回灌）
const listeners = new Set();
const editTimers = new Map(); // `${sessionId}\0${itemId}` -> timer

function emptySession() {
  return { items: [], recent: [], paused: false, pausedReason: null };
}

function ensureSession(sessionId) {
  if (!sessionId) return emptySession();
  if (!memory.sessions[sessionId]) {
    memory.sessions[sessionId] = emptySession();
  }
  return memory.sessions[sessionId];
}

function serialize() {
  return JSON.stringify(memory);
}

function emit(reason, detail) {
  for (const fn of listeners) {
    try {
      fn(reason, detail);
    } catch (err) {
      logger.error('[QueueStore] listener failed:', err?.message);
    }
  }
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'q_' + crypto.randomUUID();
  }
  return 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/** 下一次可用序号（队尾） */
function nextOrder(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1;
}

/** 置顶：把条目移到数组首位并整体重编号 */
function moveToHead(items, target) {
  const idx = items.indexOf(target);
  if (idx < 0) return;
  items.splice(idx, 1);
  items.unshift(target);
  renumber(items);
}

function renumber(items) {
  items.forEach((item, i) => {
    item.order = i + 1;
  });
}

function sortByOrder(items) {
  return items.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

// ============================================================
// 持久化
// ============================================================

/**
 * 立即落盘（状态转换必须走这里，不允许去抖）。
 * @param {string} reason - 触发原因，用于日志与订阅通知
 */
async function persistNow(reason) {
  if (degraded) {
    // 降级态禁止落盘：磁盘上的真实内容未知，写出去就是销毁用户数据
    logger.error('[QueueStore] persist skipped in degraded mode:', reason);
    return false;
  }
  const payload = serialize();
  lastSerialized = payload;
  rememberLocalEcho(payload);
  try {
    await adapter.set({ [STORAGE_KEY]: memory });
  } catch (err) {
    logger.error('[QueueStore] persist failed:', err?.message);
  }
  emit(reason);
}

/** 记下本实例写入的指纹（保留最近若干次，因为 onChanged 会迟到） */
function rememberLocalEcho(payload) {
  localEchoes.add(payload);
  if (localEchoes.size <= LOCAL_ECHO_LIMIT) return;
  const oldest = localEchoes.values().next().value;
  localEchoes.delete(oldest);
}

/**
 * 合并落盘（仅用于纯文本编辑这类高频小改动）。
 */
function persistMerged(sessionId, itemId, reason) {
  const key = `${sessionId}\0${itemId}`;
  const existing = editTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    editTimers.delete(key);
    void persistNow(reason);
  }, TEXT_EDIT_DEBOUNCE_MS);
  editTimers.set(key, timer);
  emit(reason);
}

/**
 * 读取存储并做恢复治理：dispatching / injecting 一律降级回 queued 并置顶。
 * 上次的派发/插话会随页面销毁而中断，条目必须原样留在队列里。
 *
 * @param {Object} raw 存储里的原始对象
 * @param {{recoverInterrupted?: boolean}} [options]
 *   recoverInterrupted=true 仅用于**页面启动读盘**；外部变更同步时必须传 false，
 *   否则正在派发的条目（租约仍有效）会被对方的快照打回 queued → 同一条被反复重跑。
 */
function normalizeLoaded(raw, { recoverInterrupted = true } = {}) {
  const next = emptyState();
  if (!raw || typeof raw !== 'object') return next;

  const sessions = raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {};
  for (const [sessionId, bucket] of Object.entries(sessions)) {
    const items = Array.isArray(bucket?.items) ? bucket.items : [];
    const recent = Array.isArray(bucket?.recent) ? bucket.recent.slice(0, MAX_RECENT) : [];
    let interrupted = false;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      if (recoverInterrupted && (item.status === QUEUE_STATUS.DISPATCHING || item.status === QUEUE_STATUS.INJECTING)) {
        item.status = QUEUE_STATUS.QUEUED;
        item.interrupted = true;
        item.previousStatus = item.previousStatus || QUEUE_STATUS.DISPATCHING;
        item.leaseOwner = null;
        item.leaseUntil = 0;
        interrupted = true;
      }
    }
    // 被中断的条目置顶：用户最关心的就是"刚才那条没跑成"
    const rebuilt = sortByOrder(items);
    if (interrupted) {
      const interruptedItems = rebuilt.filter((it) => it.interrupted);
      const rest = rebuilt.filter((it) => !it.interrupted);
      rebuilt.splice(0, rebuilt.length, ...interruptedItems, ...rest);
    }
    renumber(rebuilt);
    // 超限截断不能让条目凭空消失：溢出的降级进归档，用户仍可从「最近处理」重新入队
    const kept = rebuilt.slice(0, MAX_ITEMS_PER_SESSION);
    const overflow = rebuilt.slice(MAX_ITEMS_PER_SESSION);
    for (const item of overflow.reverse()) {
      recent.unshift(stripForArchive({ ...item, status: QUEUE_STATUS.FAILED, lastError: 'over_limit' }));
    }
    next.sessions[sessionId] = {
      items: kept,
      recent: recent.slice(0, MAX_RECENT),
      paused: bucket?.paused === true,
      pausedReason: bucket?.pausedReason || null,
    };
  }

  return next;
}

/** 当前是否处于"读盘失败"降级态（供 runner 决定是否跳过附件清理） */
export function isDegraded() {
  return degraded;
}

/**
 * 初始化：从存储加载 + 恢复治理。多次调用只加载一次。
 * 读盘失败时进入降级态并允许重试 —— 绝不把"读不出来"当成"没有数据"。
 */
export async function init() {
  if (loaded) return memory;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    let raw;
    try {
      raw = await adapter.get(STORAGE_KEY);
    } catch (err) {
      // 不能把失败降级成"空数据"：那会让下一次 persistNow 用空快照覆盖磁盘，
      // 而 prune 也会把附件全当孤儿删掉 —— 所有会话的队列一起消失且不可恢复。
      degraded = true;
      loadingPromise = null; // 允许下一次 init 重试
      logger.error('[QueueStore] load failed, enter degraded mode:', err?.message);
      return memory;
    }
    memory = normalizeLoaded(raw);
    loaded = true;
    degraded = false;
    lastSerialized = serialize();
    return memory;
  })();
  return loadingPromise;
}

/** 监听外部（其它面板实例）对本队列的修改 */
export function watchExternalChanges() {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged?.addListener) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes?.[STORAGE_KEY]) return;
    const next = changes[STORAGE_KEY].newValue;
    if (!next) return;
    const nextSerialized = JSON.stringify(next);
    // 自己的变更不回灌（含**迟到的旧回声**）：否则刚删掉的条目会复活、
    // 正在派发的条目会被打回 queued，表现为“任务反复重跑且删不掉”
    if (localEchoes.has(nextSerialized) || nextSerialized === lastSerialized) return;
    // 外部变更：保留 dispatching / injecting（派发方持有租约，由它自己结算）
    memory = normalizeLoaded(next, { recoverInterrupted: false });
    loaded = true;
    lastSerialized = nextSerialized;
    emit('external', null);
  });
}

/** 订阅队列变化 */
export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ============================================================
// 读取
// ============================================================

/**
 * 指定会话的队列条目（按 order 升序），不含 recent。
 * 注意：返回的是元素为**内存引用**的新数组（排序副本）——runner/panel 依赖
 * 拿到的条目做状态流转（就地读 status/attempts 等）。消费方把它当只读快照用，
 * 想改字段必须走本模块的写接口（markInjecting / settle / reorder），改引用不会落盘。
 */
export function getItems(sessionId) {
  const bucket = memory.sessions[sessionId];
  if (!bucket) return [];
  return sortByOrder(bucket.items);
}

export function getRecent(sessionId, limit = MAX_RECENT) {
  const bucket = memory.sessions[sessionId];
  if (!bucket) return [];
  return bucket.recent.slice(0, limit);
}

export function getBucket(sessionId) {
  const bucket = memory.sessions[sessionId];
  if (!bucket) return emptySession();
  return {
    items: sortByOrder(bucket.items),
    recent: bucket.recent.slice(),
    paused: bucket.paused === true,
    pausedReason: bucket.pausedReason || null,
  };
}

export function getQueuedCount(sessionId) {
  return getItems(sessionId).filter((item) => item.status === QUEUE_STATUS.QUEUED).length;
}

/** 是否有可接力的条目（排除正在注入/派发中的） */
export function peekNext(sessionId) {
  return getItems(sessionId).find((item) => item.status === QUEUE_STATUS.QUEUED) || null;
}

/**
 * 「↑ 编辑队尾」的目标：队列里最后一条**仍在排队**的条目。
 * 跳过 dispatching / injecting —— 它们已经在后台手里，取回等于让同一条被执行两次。
 */
export function peekTailForEdit(sessionId) {
  const bucket = memory.sessions[sessionId];
  if (!bucket) return null;
  for (let i = bucket.items.length - 1; i >= 0; i -= 1) {
    if (bucket.items[i].status === QUEUE_STATUS.QUEUED) return bucket.items[i];
  }
  return null;
}

/**
 * 按 id 找一条。
 * 注意：返回**内存引用**（不是拷贝）——调用方常常接着调 settle / rollbackInjecting，
 * 以这里的引用为操作凭据；不要就地改字段（不会落盘），也不要假定每次拿到新对象。
 */
export function findItem(sessionId, itemId) {
  const bucket = memory.sessions[sessionId];
  if (!bucket) return null;
  return bucket.items.find((item) => item.id === itemId) || null;
}

/** 有队列的会话 ID 列表（供会话列表徽标） */
export function listSessionIdsWithItems() {
  return Object.keys(memory.sessions).filter((sid) => (memory.sessions[sid]?.items?.length || 0) > 0);
}

export function isPaused(sessionId) {
  return memory.sessions[sessionId]?.paused === true;
}

// ============================================================
// 写入：入队 / 编辑 / 删除 / 排序
// ============================================================

/**
 * 入队。队列满时拒绝并返回 queue_full（防止误贴长文把上下文打爆）。
 * @returns {Promise<{ok: boolean, item?: Object, error?: string, position?: number}>}
 */
export async function enqueue({ sessionId, text, contextSnapshot = null, hasContext = false, attachmentSummary = null, source = 'manual' }) {
  if (!sessionId) return { ok: false, error: 'missing_session' };
  const content = String(text || '').trim();
  if (!content) return { ok: false, error: 'empty' };

  await init();
  if (degraded) return { ok: false, error: 'storage_unavailable' };
  const bucket = ensureSession(sessionId);
  if (bucket.items.length >= MAX_ITEMS_PER_SESSION) {
    return { ok: false, error: 'queue_full', limit: MAX_ITEMS_PER_SESSION };
  }

  const item = {
    id: newId(),
    sessionId,
    text: content,
    // 入队时挂载的上下文快照（引用/选中/技能/MCP/知识库/网页），派发时原样还给输入区
    // 注意：图片/文件不放这里（体积大），由 queue-attachment-store 单独落 IndexedDB，
    // 这里只留摘要（数量 + 文件名），足够 chip 展示与“附件是否丢失”判断
    contextSnapshot: contextSnapshot || null,
    attachmentSummary: attachmentSummary || null,
    hasContext: hasContext === true,
    status: QUEUE_STATUS.QUEUED,
    order: nextOrder(bucket.items),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attempts: 0,
    lastError: null,
    source,
    interrupted: false,
    leaseOwner: null,
    leaseUntil: 0,
    injectRequestedAt: 0,
    injectDeadlineAt: 0,
    injectedIntoCallId: null,
    absorbedIteration: null,
  };
  bucket.items.push(item);
  await persistNow('enqueue');
  return { ok: true, item, position: bucket.items.length };
}

/** 编辑条目文本（高频小改动，合并落盘） */
export function updateText(sessionId, itemId, text) {
  const item = findItem(sessionId, itemId);
  if (!item) return false;
  item.text = String(text || '');
  item.updatedAt = Date.now();
  persistMerged(sessionId, itemId, 'update');
  return true;
}

/** 用户显式删除：直接移除，不进归档（这是用户意图，不是被动丢失） */
export async function removeItem(sessionId, itemId) {
  const bucket = memory.sessions[sessionId];
  if (!bucket) return false;
  const idx = bucket.items.findIndex((item) => item.id === itemId);
  if (idx < 0) return false;
  bucket.items.splice(idx, 1);
  renumber(bucket.items);
  await persistNow('remove');
  return true;
}

/** 清空指定会话的队列（全部进归档，便于找回） */
export async function clearSession(sessionId, { toRecent = true } = {}) {
  const bucket = memory.sessions[sessionId];
  if (!bucket || bucket.items.length === 0) return 0;
  const count = bucket.items.length;
  if (toRecent) {
    for (const item of bucket.items) {
      item.status = QUEUE_STATUS.FAILED;
      item.lastError = 'cleared';
      bucket.recent.unshift(stripForArchive(item));
    }
    bucket.recent = bucket.recent.slice(0, MAX_RECENT);
  }
  bucket.items = [];
  await persistNow('clear');
  return count;
}

/**
 * 按给定 ID 顺序重排（拖拽排序的唯一入口）。
 * 未列出的条目按原相对顺序追加到末尾。
 */
export async function reorder(sessionId, orderedIds) {
  const bucket = memory.sessions[sessionId];
  if (!bucket || !Array.isArray(orderedIds)) return false;
  const byId = new Map(bucket.items.map((item) => [item.id, item]));
  const next = [];
  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item && !next.includes(item)) next.push(item);
  }
  for (const item of sortByOrder(bucket.items)) {
    if (!next.includes(item)) next.push(item);
  }
  bucket.items = next;
  renumber(bucket.items);
  await persistNow('reorder');
  return true;
}

// ============================================================
// 写入：状态流转
// ============================================================

/** 普通状态变更（queued ↔ dispatching） */
export async function setStatus(sessionId, itemId, status, patch = {}) {
  const item = findItem(sessionId, itemId);
  if (!item) return false;
  item.status = status;
  Object.assign(item, patch, { updatedAt: Date.now() });
  await persistNow('status');
  return true;
}

/**
 * 进入"插入中"：条目仍留在队列里可见，只等后台确认吸收才真正移除。
 * 这是防丢的核心 —— 点一下不会立刻消失。
 */
export async function markInjecting(sessionId, itemId, deadlineMs = INJECT_DEADLINE_MS) {
  const item = findItem(sessionId, itemId);
  if (!item) return false;
  item.previousStatus = item.status;
  item.status = QUEUE_STATUS.INJECTING;
  item.injectRequestedAt = Date.now();
  item.injectDeadlineAt = Date.now() + deadlineMs;
  item.updatedAt = Date.now();
  await persistNow('inject:request');
  return true;
}

/**
 * 回退"插入中" → queued 并置顶。
 * 用于：后台拒绝、超时无回执、页面重载读到残留 injecting。
 * @param {string} reason - rejected / timeout / reload / error
 */
export async function rollbackInjecting(sessionId, itemId, reason = 'error', error = null) {
  const bucket = memory.sessions[sessionId];
  if (!bucket) return false;
  const item = bucket.items.find((it) => it.id === itemId);
  if (!item) return false;
  item.status = QUEUE_STATUS.QUEUED;
  item.injectDeadlineAt = 0;
  item.updatedAt = Date.now();
  item.lastError = error || reason;
  item.rollbackReason = reason;
  moveToHead(bucket.items, item);
  await persistNow('inject:rollback');
  return true;
}

/**
 * 完成任务/插话/失败：移出 items 进 recent 归档。
 * 只有确实走到终态才调用（插话必须先收到后台 INJECT_ABSORBED）。
 */
export async function settle(sessionId, itemId, { status, note = null, callId = null, iteration = null } = {}) {
  const bucket = memory.sessions[sessionId];
  if (!bucket) return false;
  const idx = bucket.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return false;
  const [item] = bucket.items.splice(idx, 1);
  renumber(bucket.items);
  item.status = status || QUEUE_STATUS.DONE;
  item.settledAt = Date.now();
  item.settleNote = note;
  if (callId) item.injectedIntoCallId = callId;
  if (iteration != null) item.absorbedIteration = iteration;
  bucket.recent.unshift(stripForArchive(item));
  bucket.recent = bucket.recent.slice(0, MAX_RECENT);
  await persistNow('settle');
  return true;
}

/** 从归档里取一条重新入队（任何原因被移出的条目都能找回） */
export async function requeueFromRecent(sessionId, recentId) {
  const bucket = memory.sessions[sessionId];
  if (!bucket) return { ok: false, error: 'missing_session' };
  const idx = bucket.recent.findIndex((it) => it.id === recentId);
  if (idx < 0) return { ok: false, error: 'not_found' };
  if (bucket.items.length >= MAX_ITEMS_PER_SESSION) {
    return { ok: false, error: 'queue_full', limit: MAX_ITEMS_PER_SESSION };
  }
  const [archived] = bucket.recent.splice(idx, 1);
  const item = {
    ...archived,
    status: QUEUE_STATUS.QUEUED,
    order: nextOrder(bucket.items),
    attempts: 0,
    lastError: null,
    interrupted: false,
    rollbackReason: null,
    settledAt: null,
    leaseOwner: null,
    leaseUntil: 0,
    injectDeadlineAt: 0,
    updatedAt: Date.now(),
  };
  bucket.items.push(item);
  await persistNow('requeue');
  return { ok: true, item };
}

/**
 * 从归档里彻底移除一条（用户主动放弃）。
 * 为什么需要：失败条目的提醒会一直显示在队列条上，没有移除入口就等于
 * “这块区域永远移不掉”——用户已经明确抱怨过这一点。移除前必须显式删除，
 * 不能靠归档满 30 条被挤掉，否则用户无法主动清理。
 */
export async function removeFromRecent(sessionId, recentId) {
  const bucket = memory.sessions[sessionId];
  if (!bucket) return false;
  const idx = bucket.recent.findIndex((it) => it.id === recentId);
  if (idx < 0) return false;
  bucket.recent.splice(idx, 1);
  await persistNow('recent-remove');
  return true;
}

/** 归档条目裁剪成可安全持久化的副本（去掉运行时字段与大对象） */
function stripForArchive(item) {
  const { leaseOwner, leaseUntil, injectDeadlineAt, contextSnapshot, ...rest } = item;
  // 上下文快照体积可能很大（引用原文），归档只保留正文 + 标记，重新入队时由用户补充上下文
  return { ...rest, hasContext: item.hasContext === true, contextDropped: !!contextSnapshot };
}

// ============================================================
// 写入：暂停 / 租约
// ============================================================

/**
 * 暂停该会话的自动接力。
 * 用户点"停止"后必须暂停，否则下一条会立刻把停止的任务重新拉起来。
 */
export async function pauseSession(sessionId, reason = 'user_stopped') {
  const bucket = ensureSession(sessionId);
  if (bucket.paused) return false;
  bucket.paused = true;
  bucket.pausedReason = reason;
  await persistNow('pause');
  return true;
}

export async function resumeSession(sessionId) {
  const bucket = memory.sessions[sessionId];
  if (!bucket || !bucket.paused) return false;
  bucket.paused = false;
  bucket.pausedReason = null;
  await persistNow('resume');
  return true;
}

/**
 * 抢占派发租约。返回 true 表示本实例拿到该条目的派发权。
 * 多面板实例下靠它避免同一条被两个面板同时派发。
 */
export async function acquireLease(sessionId, itemId, ownerId) {
  const item = findItem(sessionId, itemId);
  if (!item) return false;
  const now = Date.now();
  const heldByOther = item.leaseOwner && item.leaseOwner !== ownerId && Number(item.leaseUntil) > now;
  if (heldByOther) return false;
  item.leaseOwner = ownerId;
  item.leaseUntil = now + LEASE_MS;
  await persistNow('lease');
  return true;
}

export async function releaseLease(sessionId, itemId, ownerId) {
  const item = findItem(sessionId, itemId);
  if (!item) return false;
  if (ownerId && item.leaseOwner !== ownerId) return false;
  item.leaseOwner = null;
  item.leaseUntil = 0;
  await persistNow('lease');
  return true;
}

// ============================================================
// 会话删除
// ============================================================

/**
 * 会话被删除：队列与归档随会话一并丢弃。
 * 语义与消息历史一致 —— 用户放弃这个会话时，未发出的草稿也一并放弃。
 * 历史上这里曾把条目转入 orphans，但面板没有任何孤儿入口：
 * 留下的条目用户永远看不见、删不掉，只是永久占着存储。
 * 返回被丢弃的条数，供调用方如实告知用户。
 */
export async function dropSession(sessionId) {
  const bucket = memory.sessions[sessionId];
  if (!bucket) return 0;
  const count = bucket.items.length + bucket.recent.length;
  delete memory.sessions[sessionId];
  if (count > 0) await persistNow('drop-session');
  return count;
}
