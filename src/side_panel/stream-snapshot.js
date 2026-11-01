// side_panel/stream-snapshot.js - 流式气泡的「面板侧快照」
//
// 现场：面板实例随时可能消失（SW 被回收连带页面卸载 / 用户直接关掉侧边栏）。
// 重新打开的新实例接管同一轮任务时，气泡只能从接管那一刻开始累积正文，
// 脱落期间已经输出的文字与工具卡片在新实例里彻底不存在 —— 用户看到的就是
// 「确实还在输出，但之前输出的内容看不到了，只剩之后的」。
//
// 修法：流式过程中把「气泡 HTML + 本轮累积正文」按 sessionId 节流写进
// chrome.storage.session（会话级存储：不落盘到磁盘、浏览器重启即清，且能被
// 同一扩展的下一个面板实例读到），接管时读回来还原。
//
// 三条底线：
// - 只在有 callId 的流式轮次里写，终态一律清除，不给下一次接管留脏快照；
// - HTML 超限降级为只存正文，绝不因为快照把 storage.session 配额撑爆；
// - 任何一步失败都只记 debug 日志，快照是锦上添花，不能拖累正常流式。
import logger from '../shared/logger.js';

/** 节流窗口：一条流每秒几十条 chunk，不能每条都写盘 */
export const FLUSH_MS = 700;
/** 快照有效期：隔天再开面板不必还原昨天的半截流 */
export const TTL_MS = 30 * 60 * 1000;
/** 单会话 HTML 字节上限（按 UTF-8 算）：超限只留正文（storage.session 总量默认 10MB） */
export const MAX_HTML_BYTES = 300 * 1024;

const _utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

/**
 * 真实字节数。一个汉字 UTF-16 只占 1 个码元、UTF-8 占 3 字节，
 * 拿 string.length 当字节会把上限抬到三倍：storage.session 配额是按字节算的。
 */
function _utf8Size(text) {
  if (!text) return 0;
  if (_utf8Encoder) return _utf8Encoder.encode(text).length;
  // 没有 TextEncoder 的异常环境：保守按每码元 3 字节估（宁多算不少算）
  return text.length * 3;
}

const KEY_PREFIX = 'streamSnap|';
const keyOf = (sessionId) => `${KEY_PREFIX}${sessionId}`;

/** sessionId -> { callId, read, timer }：read 在落盘那一刻才执行，取到最新 DOM */
const _slots = new Map();
let _unloadHandlers = null;

function _storageAvailable() {
  return typeof chrome !== 'undefined'
    && chrome.storage
    && chrome.storage.session
    && typeof chrome.storage.session.set === 'function';
}

/**
 * 页面不能继续跑之前必须把待落盘的快照刷出去。
 *
 * 只挂 pagehide 不够：侧边栏被收起时页面进入 hidden，随时可能被冻结，
 * 那之后的异步 storage.set 不保证能走完；而「收起面板」正是用户最常做的
 * 动作。所以两个时机都刷：visibilitychange → hidden 先抢一次，pagehide 兜底。
 */
function _ensureUnloadHooks() {
  if (_unloadHandlers) return;
  if (typeof window === 'undefined' || !window.addEventListener) return;
  if (typeof document === 'undefined' || !document.addEventListener) return;
  const flush = () => { flushAllStreamSnapshots(); };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  _unloadHandlers = { pagehide: flush, onVisibility };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibility);
}

/**
 * 排一次快照（节流：窗口内多次调用只在末尾落一次盘，取最新内容）。
 * @param {string} sessionId
 * @param {string} callId 本轮 callId，读回方据此确认「还是同一轮」
 * @param {()=>{html:string,accumulated:string}} read 取最新 DOM 与累积正文（落盘时才调用）
 */
export function scheduleStreamSnapshot(sessionId, callId, read) {
  if (!sessionId || !callId || typeof read !== 'function') return;
  if (!_storageAvailable()) return;
  _ensureUnloadHooks();

  const slot = _slots.get(sessionId) || {};
  slot.callId = callId;
  slot.read = read;
  if (!slot.timer) {
    slot.timer = setTimeout(() => {
      const cur = _slots.get(sessionId);
      if (!cur) return;
      cur.timer = null;
      flushStreamSnapshot(sessionId).catch(() => {});
    }, FLUSH_MS);
  }
  _slots.set(sessionId, slot);
}

/** 立即把某会话待落盘的快照写下去（清掉节流窗口内的空档） */
export async function flushStreamSnapshot(sessionId) {
  const slot = _slots.get(sessionId);
  if (!slot) return;
  if (slot.timer) {
    clearTimeout(slot.timer);
    slot.timer = null;
  }
  if (!_storageAvailable()) return;

  let snapshot;
  try {
    snapshot = slot.read() || {};
  } catch (err) {
    logger.debug('[StreamSnapshot] 读取气泡内容失败（忽略）:', err?.message || err);
    return;
  }
  const rawHtml = typeof snapshot.html === 'string' ? snapshot.html : '';
  const accumulated = typeof snapshot.accumulated === 'string' ? snapshot.accumulated : '';
  // 超限降级：HTML 丢了也要保住正文，接管后至少看得到已经输出的文字。
  // 留一行日志：工具卡片/预筛选卡片凭空消失时得有个可查的线索。
  let html = rawHtml;
  const htmlBytes = _utf8Size(rawHtml);
  if (htmlBytes > MAX_HTML_BYTES) {
    logger.warn(
      `[StreamSnapshot] 快照 HTML ${htmlBytes} 字节超过上限 ${MAX_HTML_BYTES}，`
      + '本次只存正文（接管后看不到工具卡片等富结构）'
    );
    html = '';
  }

  await chrome.storage.session.set({
    [keyOf(sessionId)]: {
      sessionId,
      callId: slot.callId,
      html,
      accumulated,
      ts: Date.now(),
    },
  });
}

/**
 * 撤回某会话待落盘的快照（只丢节流窗口，不动已经写下去的那份）。
 * 新一轮起步 / 接管起步都会先把累积正文清零，此时窗口里攒着的抓拍读出来就是
 * 空正文 —— 让它落盘等于把上一轮还有效的快照顶成空的。读回方靠 callId 判定同一轮，
 * 所以保住旧快照不会串到新一轮，而丢掉旧快照会让脱落期白输出一段。
 */
export function cancelPendingStreamSnapshot(sessionId) {
  const slot = _slots.get(sessionId);
  if (!slot) return;
  if (slot.timer) clearTimeout(slot.timer);
  _slots.delete(sessionId);
}

/** 刷掉所有会话的待落盘快照（pagehide 用） */
export function flushAllStreamSnapshots() {
  return Promise.all(
    [..._slots.keys()].map((sid) => flushStreamSnapshot(sid).catch((err) => {
      logger.debug('[StreamSnapshot] 卸载前刷盘失败（忽略）:', err?.message || err);
    })),
  );
}

/**
 * 读回某会话的快照。
 * @param {string} sessionId
 * @returns {Promise<{sessionId:string,callId:string,html:string,accumulated:string,ts:number}|null>}
 *   没有 / 过期 / 环境不支持时返回 null
 */
export async function readStreamSnapshot(sessionId) {
  if (!sessionId || !_storageAvailable()) return null;
  try {
    const res = await chrome.storage.session.get(keyOf(sessionId));
    const snap = res && res[keyOf(sessionId)];
    if (!snap || !snap.callId) return null;
    if (Date.now() - (snap.ts || 0) > TTL_MS) {
      await clearStreamSnapshot(sessionId);
      return null;
    }
    return snap;
  } catch (err) {
    logger.debug('[StreamSnapshot] 读取快照失败（忽略）:', err?.message || err);
    return null;
  }
}

/** 清除快照（终态收口、或快照已被判定陈旧时） */
export async function clearStreamSnapshot(sessionId) {
  const slot = _slots.get(sessionId);
  if (slot && slot.timer) clearTimeout(slot.timer);
  _slots.delete(sessionId);
  if (!_storageAvailable()) return;
  try {
    await chrome.storage.session.remove(keyOf(sessionId));
  } catch (err) {
    logger.debug('[StreamSnapshot] 清除快照失败（忽略）:', err?.message || err);
  }
}

/** 仅测试使用：重置模块内部状态 */
export function __resetStreamSnapshotForTest() {
  for (const slot of _slots.values()) {
    if (slot.timer) clearTimeout(slot.timer);
  }
  _slots.clear();
  if (_unloadHandlers && typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.removeEventListener('pagehide', _unloadHandlers.pagehide);
    document.removeEventListener('visibilitychange', _unloadHandlers.onVisibility);
  }
  _unloadHandlers = null;
}
