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

const DEBUGGER_VERSION = '1.3';
const IDLE_DETACH_MS = 120000;        // 空闲 120s 自动脱离
const KEEPALIVE_ALARM = 'debugger-keepalive';
const MAX_NET_ENTRIES = 100;          // 每个会话最多缓存的网络条目
const MAX_BODY_LENGTH = 20 * 1024;    // 单个响应体最多保留 20KB

// 不可附着的页面前缀
const RESTRICTED_PREFIXES = [
  'chrome://', 'chrome-extension://', 'chrome-search://',
  'edge://', 'about:', 'chrome-error://', 'view-source:',
  'devtools://', 'https://chrome.google.com',
  'https://chromewebstore.google.com',
];

// tabId -> SessionRecord
// {
//   attached: boolean,
//   idleTimer: number|null,
//   network: { recording: boolean, filter: string, entries: Array, reqMap: Map },
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

/**
 * 判断 URL 是否为不可调试的受限页面
 */
export function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_PREFIXES.some(prefix => url.startsWith(prefix));
}

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
    net.reqMap.set(params.requestId, params.requestId);
    net.entries.push({
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
    });
    if (net.entries.length > MAX_NET_ENTRIES) {
      const removed = net.entries.shift();
      if (removed) net.reqMap.delete(removed.requestId);
    }
    return;
  }

  if (method === 'Network.responseReceived') {
    const entry = net.entries.find(e => e.requestId === params.requestId);
    if (!entry) return;
    const resp = params.response || {};
    entry.status = resp.status ?? null;
    entry.mimeType = resp.mimeType || '';
    entry.responseHeaders = resp.headers || null;
    return;
  }

  if (method === 'Network.loadingFinished') {
    const entry = net.entries.find(e => e.requestId === params.requestId);
    if (!entry) return;
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
  if (session) {
    clearIdleTimer(session);
    session.attached = false;
    session.network.recording = false;
    sessions.delete(tabId);
  }
  // 还原模拟覆盖（失败不影响 detach）
  await Promise.allSettled([
    sendCommand(tabId, 'Emulation.clearDeviceMetricsOverride'),
    sendCommand(tabId, 'Emulation.clearGeolocationOverride'),
    sendCommand(tabId, 'Network.setUserAgentOverride', { userAgent: '' }),
    sendCommand(tabId, 'Emulation.setTimezoneOverride', { timezoneId: '' }),
  ]);
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
  session.network = { recording: true, filter: filter || '', entries: [], reqMap: new Map() };
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

function serializeEntry(e) {
  return {
    url: e.url,
    method: e.method,
    resourceType: e.resourceType,
    status: e.status,
    mimeType: e.mimeType,
    postData: e.postData,
    body: e.body,
    bodyTruncated: e.bodyTruncated,
  };
}

// ───────────────────────── 工具函数 ─────────────────────────

function truncate(str, max) {
  if (typeof str !== 'string' || str.length <= max) return str;
  return str.slice(0, max) + `...[truncated ${str.length - max} chars]`;
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}
