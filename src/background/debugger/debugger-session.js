// debugger-session.js - chrome.debugger 会话管理
//
// 职责：
// 1. 按 tabId 维护调试会话（attach/detach，启用 Page/Runtime/Network 域）
// 2. 受限页面预检（chrome://、商店页等不可附着）
// 3. 空闲自动脱离（及时消除页面顶部的黄色调试提示条）
// 4. onDetach 兜底（用户手动取消 / DevTools 抢占 / 标签页关闭时清理状态）
// 5. 网络录制：被动记录请求/响应，并在加载完成后拉取响应体
// 6. MV3 保活：有活动会话期间用 alarms 唤醒 SW，降低休眠导致会话丢失的概率

import { logger } from '../../shared/logger.js';
import {
  isRestrictedUrl, truncate, serializeNetworkEntry as serializeEntry, decodeBase64Utf8,
  shouldFetchBody,
} from './debugger-rules.js';

const DEBUGGER_VERSION = '1.3';
const IDLE_DETACH_MS = 120000;        // 空闲 120s 自动脱离
const KEEPALIVE_ALARM = 'debugger-keepalive';
const MAX_NET_ENTRIES = 100;          // 每个会话最多缓存的网络条目
const MAX_BODY_LENGTH = 20 * 1024;    // 单个响应体最多保留 20KB

// tabId -> SessionRecord
// {
//   attached: boolean,
//   idleTimer: number|null,
//   network: {
//     recording: boolean,
//     filter: string,
//     entries: Array,          // 有序数组（保留时序 / 方便 drain）
//     reqMap: Map<requestId, entry>, // O(1) 索引，与 entries 保持同步
//   },
// }
const sessions = new Map();

let listenersBound = false;
let tabCloseListenerBound = false;

export class DebuggerNotAttachedError extends Error {
  constructor(message = 'Debugger session is not attached') {
    super(message);
    this.name = 'DebuggerNotAttachedError';
    this.code = 'DEBUGGER_NOT_ATTACHED';
  }
}

export class RestrictedPageError extends Error {
  constructor(url) {
    super(`Cannot attach debugger to restricted page: ${url}`);
    this.name = 'RestrictedPageError';
    this.code = 'DEBUGGER_RESTRICTED_PAGE';
    this.url = url;
  }
}

function getSession(tabId) {
  return sessions.get(tabId) || null;
}

export { isRestrictedUrl };

/**
 * Promise 化的 chrome.debugger.sendCommand
 */
function sendCommand(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    try {
      chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 空闲计时：每条命令后刷新，超时自动 detach
 */
function bumpIdleTimer(tabId) {
  const session = getSession(tabId);
  if (!session) return;
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    logger.debug(`[Debugger] idle timeout, auto-detaching tab ${tabId}`);
    detach(tabId, 'idle_timeout').catch(() => {});
  }, IDLE_DETACH_MS);
}

function clearIdleTimer(session) {
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = null;
  }
}

/**
 * 更新 keepalive alarm：有活动会话时保活，全部结束后清除
 */
function refreshKeepaliveAlarm() {
  const hasActive = [...sessions.values()].some(s => s.attached);
  if (hasActive) {
    chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });
  } else {
    chrome.alarms.clear(KEEPALIVE_ALARM).catch(() => {});
  }
}

/**
 * 网络事件处理（绑定一次）
 */
function onDebuggerEvent(source, method, params) {
  const tabId = source.tabId;
  const session = getSession(tabId);
  if (!session || !session.network.recording) return;

  const net = session.network;

  if (method === 'Network.requestWillBeSent') {
    const req = params.request || {};
    if (net.filter && !String(req.url || '').includes(net.filter)) return;
    const entry = {
      requestId: params.requestId,
      url: req.url || '',
      method: req.method || '',
      resourceType: params.type || '',
      requestHeaders: req.headers || {},
      postData: typeof req.postData === 'string' ? truncate(req.postData, MAX_BODY_LENGTH) : undefined,
      status: null,
      mimeType: '',
      responseHeaders: null,
      body: null,
      bodyTruncated: false,
      startedAt: params.timestamp || null,
    };
    net.entries.push(entry);
    net.reqMap.set(params.requestId, entry);
    if (net.entries.length > MAX_NET_ENTRIES) {
      const removed = net.entries.shift();
      if (removed) net.reqMap.delete(removed.requestId);
    }
    return;
  }

  if (method === 'Network.responseReceived') {
    const entry = net.reqMap.get(params.requestId);
    if (!entry) return;
    const resp = params.response || {};
    entry.status = resp.status ?? null;
    entry.mimeType = resp.mimeType || '';
    entry.responseHeaders = resp.headers || null;
    return;
  }

  if (method === 'Network.loadingFinished') {
    const entry = net.reqMap.get(params.requestId);
    if (!entry) return;
    // 二进制资源（图片/字体/媒体）直接跳过：拉回也没意义，只会白耗 SW 内存与 CDP 往返。
    if (!shouldFetchBody(entry)) return;
    // 异步拉取响应体（失败属正常情况：来自缓存 / 重定向 / 数据流等均可能拿不到）
    sendCommand(tabId, 'Network.getResponseBody', { requestId: params.requestId })
      .then((res) => {
        let body = res.body || '';
        if (res.base64Encoded) {
          try { body = decodeBase64Utf8(body); } catch { body = '[base64 body, decode failed]'; }
        }
        if (body.length > MAX_BODY_LENGTH) {
          entry.body = truncate(body, MAX_BODY_LENGTH);
          entry.bodyTruncated = true;
        } else {
          entry.body = body;
        }
      })
      .catch(() => { /* 部分响应无法获取 body，忽略 */ });
  }
}

/**
 * 调试会话被结束（用户取消 / DevTools 抢占 / 目标关闭）
 */
function onDebuggerDetach(source, reason) {
  const tabId = source.tabId;
  logger.debug(`[Debugger] detached from tab ${tabId}, reason: ${reason}`);
  const session = getSession(tabId);
  if (session) {
    clearIdleTimer(session);
    session.attached = false;
    session.network.recording = false;
    sessions.delete(tabId);
  }
  refreshKeepaliveAlarm();
}

function bindListeners() {
  if (listenersBound) return;
  chrome.debugger.onEvent.addListener(onDebuggerEvent);
  chrome.debugger.onDetach.addListener(onDebuggerDetach);
  listenersBound = true;

  // SW 被 alarm 唤醒时刷新所有存活会话的计时
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== KEEPALIVE_ALARM) return;
    for (const tabId of sessions.keys()) {
      if (getSession(tabId)?.attached) bumpIdleTimer(tabId);
    }
  });
}

function bindTabCloseListener() {
  if (tabCloseListenerBound) return;
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (sessions.has(tabId)) sessions.delete(tabId);
  });
  tabCloseListenerBound = true;
}

/**
 * 附着到标签页并启用基础域。已附着则直接复用。
 * @param {number} tabId
 * @returns {Promise<{tabId:number, reused:boolean}>}
 */
export async function attach(tabId) {
  const existing = getSession(tabId);
  if (existing?.attached) {
    bumpIdleTimer(tabId);
    return { tabId, reused: true };
  }

  // 受限页面预检
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) throw new Error(`Tab ${tabId} does not exist or is not accessible`);
  if (isRestrictedUrl(tab.url || '')) throw new RestrictedPageError(tab.url || '');

  bindListeners();
  bindTabCloseListener();

  await new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, DEBUGGER_VERSION, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  }).catch(async (err) => {
    // SW 重启后会丢失内存中的 sessions Map，但 chrome.debugger 的附着可能仍然存在（"孤儿附着"）：
    // 此时 attach 会报 "Another debugger is already attached"。先强制 detach 后重试一次，
    // 给用户/模型一条自愈路径，否则只能手动关标签页。
    const msg = String(err?.message || '');
    if (!/already attached/i.test(msg)) throw err;
    logger.debug(`[Debugger] stale attach detected on tab ${tabId}, forcing detach + retry`);
    await new Promise((resolve) => {
      chrome.debugger.detach({ tabId }, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    });
    await new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, DEBUGGER_VERSION, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  });

  sessions.set(tabId, {
    attached: true,
    idleTimer: null,
    network: { recording: false, filter: '', entries: [], reqMap: new Map() },
  });

  // 启用基础域（任一失败则回滚 attach）
  try {
    await Promise.all([
      sendCommand(tabId, 'Page.enable'),
      sendCommand(tabId, 'Runtime.enable'),
      sendCommand(tabId, 'Network.enable'),
    ]);
  } catch (e) {
    sessions.delete(tabId);
    await chrome.debugger.detach({ tabId }).catch(() => {});
    throw e;
  }

  bumpIdleTimer(tabId);
  refreshKeepaliveAlarm();
  logger.debug(`[Debugger] attached to tab ${tabId}`);
  return { tabId, reused: false };
}

/**
 * 主动脱离，尽力还原 emulation 覆盖
 */
export async function detach(tabId, reason = 'manual') {
  const session = getSession(tabId);
  const hadSession = !!session;
  if (session) {
    clearIdleTimer(session);
    session.attached = false;
    session.network.recording = false;
    sessions.delete(tabId);
  }
  // 仅在确实附着过时才下发还原命令，否则未附着 detach 会白发 6 条必然失败的 CDP
  // （每条都会触发 chrome.runtime.lastError，虽然被 allSettled 吞掉但仍是无意义开销）
  if (hadSession) {
    // 与 tool-debugger.js 中 emulate reset 保持同步：需同时清 6 项覆盖，
    // 否则 colorScheme 强制深色 / 触摸模拟等可能泄漏到 detach 之后。
    await Promise.allSettled([
      sendCommand(tabId, 'Emulation.clearDeviceMetricsOverride'),
      sendCommand(tabId, 'Emulation.clearGeolocationOverride'),
      sendCommand(tabId, 'Network.setUserAgentOverride', { userAgent: '' }),
      sendCommand(tabId, 'Emulation.setTimezoneOverride', { timezoneId: '' }),
      sendCommand(tabId, 'Emulation.setEmulatedMedia', { features: [] }),
      sendCommand(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: false }),
    ]);
  }
  await new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      void chrome.runtime.lastError; // 未附着等错误吞掉
      resolve();
    });
  });
  refreshKeepaliveAlarm();
  logger.debug(`[Debugger] detached from tab ${tabId} (${reason})`);
}

export function isAttached(tabId) {
  return !!getSession(tabId)?.attached;
}

/**
 * 返回当前处于 attached 状态的 tabId 列表。
 * 用于 tool-debugger 在缺省 tabId 时做"漂移兜底"：
 * 当活动标签页并非已附着的那个时，若全局仅有一个已附着会话，则优先复用它，
 * 避免用户切换标签页后 detach / evaluate 等动作打到错误的 tab。
 * @returns {number[]}
 */
export function getAttachedTabIds() {
  const ids = [];
  for (const [tabId, session] of sessions.entries()) {
    if (session?.attached) ids.push(tabId);
  }
  return ids;
}

/**
 * 发送 CDP 命令（统一空闲计时 + 失效检测）
 */
export async function cdp(tabId, method, params = {}) {
  const session = getSession(tabId);
  if (!session?.attached) throw new DebuggerNotAttachedError();
  try {
    const result = await sendCommand(tabId, method, params);
    bumpIdleTimer(tabId);
    return result;
  } catch (e) {
    // 会话已被外部终止（用户取消 / DevTools 抢占）但状态尚未被 onDetach 清理
    if (/not attached|detached|No tab with id/i.test(e.message)) {
      if (getSession(tabId)) sessions.delete(tabId);
      refreshKeepaliveAlarm();
      throw new DebuggerNotAttachedError(e.message);
    }
    throw e;
  }
}

// ───────────────────────── 网络录制 ─────────────────────────

export function startNetworkCapture(tabId, filter = '') {
  const session = getSession(tabId);
  if (!session?.attached) throw new DebuggerNotAttachedError();
  // 重复 start 时保留已有 entries / reqMap，仅更新 filter 与 recording 标志。
  // 避免模型不小心二次调用导致已录制的缓冲被静默丢弃；如需清空请先 collect 或 stop。
  session.network.recording = true;
  session.network.filter = filter || '';
  bumpIdleTimer(tabId);
}

/**
 * 取回并清空已录制的网络条目（drain 语义，避免重复）
 */
export function collectNetwork(tabId) {
  const session = getSession(tabId);
  if (!session?.attached) throw new DebuggerNotAttachedError();
  const entries = session.network.entries.map(serializeEntry);
  session.network.entries = [];
  session.network.reqMap.clear();
  bumpIdleTimer(tabId);
  return entries;
}

export function stopNetworkCapture(tabId) {
  const session = getSession(tabId);
  if (!session?.attached) throw new DebuggerNotAttachedError();
  const entries = session.network.entries.map(serializeEntry);
  session.network = { recording: false, filter: '', entries: [], reqMap: new Map() };
  bumpIdleTimer(tabId);
  return entries;
}
