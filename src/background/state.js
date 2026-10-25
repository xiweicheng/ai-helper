import logger from '../shared/logger.js';

// background/state.js - 状态管理和取消控制
// 所有状态以 sessionId 为 key，支持多会话并行执行

// ReAct 循环取消控制
const cancelledSessions = new Map(); // sessionId -> boolean

// 每个会话的 AbortController，用于中断正在进行的 fetch 请求
const sessionAbortControllers = new Map(); // sessionId -> AbortController

// 每个会话当前正在执行工具的 AbortController，用于用户手动终止等待
const toolAbortControllers = new Map(); // sessionId -> AbortController

// 每个会话的 API 调用计数器
const dialogApiCallCounts = new Map(); // sessionId -> count

// 旧版兼容：标签页维度的取消控制（tabId -> boolean）
const cancelledTabs = new Map();

// 旧版兼容：当前活跃的 ReAct 循环标签页
let activeReactTabId = null;

// ========== API 调用计数器（按 sessionId 隔离） ==========

export function resetDialogApiCallCount(sessionId) {
  if (sessionId) {
    dialogApiCallCounts.set(sessionId, 0);
  }
}

export function incrementDialogApiCallCount(sessionId) {
  if (sessionId) {
    const count = (dialogApiCallCounts.get(sessionId) || 0) + 1;
    dialogApiCallCounts.set(sessionId, count);
    return count;
  }
  return 0;
}

export function getDialogApiCallCount(sessionId) {
  if (sessionId) {
    return dialogApiCallCounts.get(sessionId) || 0;
  }
  return 0;
}

// ========== 取消控制（按 sessionId 隔离） ==========

/**
 * 收集一次取消应覆盖的会话 key：根会话自身 + 其全部派生会话。
 *
 * plan_task 子任务的在途 LLM 请求注册在 `${root}_subtask_${i}` 上，dispatch_task
 * 子代理注册在 `${root}_sub_${agentId}` 上，只 abort 根 key 会全部漏掉：父循环
 * 正 await 在 executeSubtasks 上永不返回，而 isCancelled 的检查点全在轮次之间，
 * 永远轮不到 → 用户点了停止后台其实还在跑，外层 catch 的中断现场也落不了盘。
 * 判定口径与 isCancelled 保持一致（派生 key 以 `${root}_` 开头），不另造一套规则。
 * @param {string} sessionId 根会话 id
 * @param {Iterable<string>} knownKeys 当前已登记的会话 key
 * @returns {string[]} 应被中断的 key（根在前，其余按 key 长度递增）
 */
export function collectSessionCancelKeys(sessionId, knownKeys) {
  if (!sessionId || typeof sessionId !== 'string') return [];
  const keys = [];
  for (const k of knownKeys || []) {
    if (k === sessionId || (typeof k === 'string' && k.startsWith(sessionId + '_'))) {
      keys.push(k);
    }
  }
  return keys.sort((a, b) => (a === sessionId ? -1 : b === sessionId ? 1 : a.length - b.length));
}

/**
 * 取消指定会话的 ReAct 循环
 * @param {string|null} sessionIdOrTabId - 会话ID 或 标签页ID
 */
export function cancelReactLoop(sessionIdOrTabId) {
  // 旧版兼容：tabId 是数字
  if (typeof sessionIdOrTabId === 'number') {
    cancelledTabs.set(sessionIdOrTabId, true);
    logger.debug('[Background] ReAct loop cancelled,tabId:', sessionIdOrTabId);
    return;
  }

  if (sessionIdOrTabId === null) {
    cancelledSessions.clear();
    cancelledTabs.clear();
    // 取消所有正在进行的 fetch 请求
    for (const [id, controller] of sessionAbortControllers) {
      controller.abort();
      logger.debug('[Background] cancelledsession  fetch requested ,sessionId:', id);
    }
    sessionAbortControllers.clear();
    toolAbortControllers.clear();
    logger.debug('[Background] all has session  ReAct loop cancelled');
  } else {
    cancelledSessions.set(sessionIdOrTabId, true);
    // 立即中断该会话正在进行的 fetch 请求（含其派生子任务/子代理会话，
    // 否则取消停不住在途请求，中断现场也无法落盘）
    // 取消范围为空时也要打出来：真机上出现过「点停止后一个 key 都没命中」，
    // 不打这条就分不清是「没登记」还是「登记在别的 key 上」
    const fetchKeys = collectSessionCancelKeys(sessionIdOrTabId, sessionAbortControllers.keys());
    logger.debug('[Background] cancel scope, sessionId:', sessionIdOrTabId, 'fetchKeys:', fetchKeys.join(',') || '(none)');
    for (const key of fetchKeys) {
      sessionAbortControllers.get(key).abort();
      logger.debug('[Background] cancelled session fetch requested, sessionId:', key);
    }
    // 子任务/子代理正卡在工具等待（含敏感操作确认弹窗）时，停止也应把等待终止
    for (const key of collectSessionCancelKeys(sessionIdOrTabId, toolAbortControllers.keys())) {
      const controller = toolAbortControllers.get(key);
      if (controller && !controller.signal.aborted) controller.abort();
      toolAbortControllers.delete(key);
    }
    logger.debug('[Background] ReAct loop cancelled,sessionId:', sessionIdOrTabId);
  }
}

/**
 * 重置指定会话的取消标志。
 * 只清标志，不动 sessionAbortControllers 里的登记：两个调用点（reactLoopImpl 开工前
 * 与主循环前）的语义都是「去掉上一个请求残留的取消标记」，而主循环前那次发生在
 * getOrCreateAbortController 之后 —— 顺手删登记会把即将用于 fetch 的 controller 抹掉，
 * 导致取消时扫不到任何 key，在途请求中断不了、中断现场也落不了盘。
 * 条目由下次同会话 getOrCreateAbortController 覆盖，全局取消时整体清空。
 */
export function resetReactCancel(sessionIdOrTabId) {
  if (typeof sessionIdOrTabId === 'number') {
    cancelledTabs.delete(sessionIdOrTabId);
    return;
  }

  if (sessionIdOrTabId !== undefined && sessionIdOrTabId !== null) {
    cancelledSessions.delete(sessionIdOrTabId);
    logger.debug('[Background] session cancel state reset, sessionId:', sessionIdOrTabId);
  }
}

/**
 * 获取或创建指定会话的 AbortController
 * 每次调用都会创建新的 AbortController（旧的会被替换）
 * @param {string} sessionId
 * @param {boolean} [abortOld=true] - 是否 abort 旧的 controller。子任务场景应传 false
 * @returns {AbortController}
 */
export function getOrCreateAbortController(sessionId, abortOld = true) {
  if (abortOld) {
    const old = sessionAbortControllers.get(sessionId);
    if (old) {
      old.abort();
    }
  }
  const controller = new AbortController();
  sessionAbortControllers.set(sessionId, controller);
  return controller;
}

/**
 * 检查指定会话的 ReAct 循环是否已取消
 * @param {string|number} sessionIdOrTabId
 * @returns {boolean}
 */
export function isCancelled(sessionIdOrTabId) {
  if (sessionIdOrTabId === undefined || sessionIdOrTabId === null) return false;

  // 旧版兼容：tabId 是数字
  if (typeof sessionIdOrTabId === 'number') {
    return cancelledTabs.get(sessionIdOrTabId) === true;
  }

  // 直接匹配
  if (cancelledSessions.get(sessionIdOrTabId) === true) {
    return true;
  }

  // 检查派生 sessionId（子任务使用 ${parentSessionId}_subtask_${index} 格式）
  // 如果父任务已取消，子任务也应视为已取消
  for (const cancelledSession of cancelledSessions.keys()) {
    if (sessionIdOrTabId.startsWith(cancelledSession + '_')) {
      return true;
    }
  }

  return false;
}

// ========== 旧版兼容函数（内部仍有使用） ==========

export function setActiveReactTabId(tabId) {
  activeReactTabId = tabId;
  if (tabId !== null) {
    cancelledTabs.delete(tabId);
  }
}

export function getActiveReactTabId() {
  return activeReactTabId;
}

export function resetReactCancelByTabId(tabId) {
  if (tabId !== undefined) {
    cancelledTabs.delete(tabId);
  }
}

export function setCurrentReactTabId(id) {
  setActiveReactTabId(id);
}

export function getCurrentReactTabId() {
  return getActiveReactTabId();
}

// ========== 最近操作标签页（模型主导 tabId 的 fallback 保障） ==========
//
// 目的：模型 open_tab/switch_tab 后，若下一步忘记传 tabId，用"模型最近主动
// 操作的 tab"作为 fallback，比浏览器全局活动 tab（getActiveTabId）更贴近模型意图。
//
// 关键：这是 fallback（args.tabId 优先），不是 override。模型传了 tabId 就用
// 模型的；只有没传时才用此值。只记录模型主动操作（open_tab/switch_tab），
// 不监听浏览器全局 onActivated，避免剥夺模型控制权。
const lastOperatedTabBySession = new Map(); // sessionId → tabId

export function setLastOperatedTab(sessionId, tabId) {
  if (sessionId && tabId != null) {
    lastOperatedTabBySession.set(sessionId, tabId);
  }
}

export function getLastOperatedTab(sessionId) {
  return sessionId ? lastOperatedTabBySession.get(sessionId) : null;
}

export function clearLastOperatedTab(sessionId) {
  if (sessionId) lastOperatedTabBySession.delete(sessionId);
}

// ========== 派生会话祖先链（子任务/子代理 → 根会话） ==========
//
// plan_task 子任务用 `${parent}_subtask_${index}`、dispatch_task 子代理用
// `${parent}_sub_${agentId}` 派生 sessionId 执行，而面板建立 keepalive 连接、
// 上报实例身份都用根会话 id。确认/澄清路径若拿派生 id 直查注册表必然落空：
// 定向发送退化为广播、可见性判定走「信息缺失保守按不可见」→ 用户明明看着
// 面板仍弹桌面提醒。查找类操作逐层剥后缀回退到最近已注册祖先（与
// hasLoopApproval 采纳的语义一致）；注册/注销仍按精确 key。
const DERIVED_SESSION_SUFFIX = /(_subtask_\d+|_sub_.+)$/;

/**
 * 逐层剥离派生后缀，得到从自身到根任务的会话祖先链（自身在前）。
 * @param {string|null} sessionId
 * @returns {string[]}
 */
export function getSessionAncestry(sessionId) {
  const chain = [];
  let cur = sessionId;
  while (typeof cur === 'string' && cur) {
    chain.push(cur);
    const next = cur.replace(DERIVED_SESSION_SUFFIX, '');
    if (next === cur) break;
    cur = next;
  }
  return chain;
}

// ========== Side Panel keepalive 长连接注册表（实例级定向消息路由） ==========
//
// side panel 实例发起 CALL_API 时建立 keepalive-<sessionId> 长连接，本表按 sessionId
// 记录该连接，供「只发给发起请求的那个实例」的定向消息使用。典型场景：澄清弹框、
// 敏感工具确认弹框——chrome.runtime.sendMessage 会广播到所有 Tab 的侧边栏（多 Tab
// 绑定模式下每个 Tab 一个实例），必须走 port 点对点发送才能只弹在发起实例上。
// port 断开（页面刷新/关闭）时由 onDisconnect 清理。
const keepalivePorts = new Map(); // sessionId → Port

export function registerKeepalivePort(sessionId, port) {
  if (sessionId && port) keepalivePorts.set(sessionId, port);
}

// 查找按祖先链逐层回退：派生会话（子任务/子代理）落到根会话的连接上
export function getKeepalivePort(sessionId) {
  if (!sessionId) return null;
  for (const id of getSessionAncestry(sessionId)) {
    const port = keepalivePorts.get(id);
    if (port) return port;
  }
  return null;
}

export function hasKeepalivePort(sessionId) {
  return Boolean(getKeepalivePort(sessionId));
}

// ========== Side Panel 实例身份（发起实例的窗口与宿主 tab） ==========
//
// 桌面通知可见性判定（“发起任务的实例面板是否被用户看到”）的数据源：侧边栏建立
// keepalive 连接时上报 {windowId, hostTabId}；查询失败上报 null（保留“查询过但
// 失败”语义）；缺失或陈旧时判定方一律保守按“不可见”处理。
const keepaliveIdentities = new Map(); // sessionId → {windowId, hostTabId} | null

/**
 * 记录 keepalive 连接上报的实例身份
 * @param {string} sessionId
 * @param {{windowId:number, hostTabId:number|null}|null} identity
 */
export function setKeepaliveIdentity(sessionId, identity) {
  if (!sessionId) return;
  if (identity && typeof identity.windowId === 'number') {
    keepaliveIdentities.set(sessionId, {
      windowId: identity.windowId,
      hostTabId: typeof identity.hostTabId === 'number' ? identity.hostTabId : null,
    });
  } else {
    keepaliveIdentities.set(sessionId, null);
  }
}

/**
 * 读取 keepalive 连接上报的实例身份
 * @param {string} sessionId
 * @returns {{windowId:number, hostTabId:number|null}|null}
 */
export function getKeepaliveIdentity(sessionId) {
  if (!sessionId) return null;
  // 同端口查找：派生会话回退到根会话上报的实例身份（可见性判定不再误按「缺失」处理）
  for (const id of getSessionAncestry(sessionId)) {
    const identity = keepaliveIdentities.get(id);
    if (identity) return identity;
  }
  return null;
}

/**
 * 注销 keepalive port
 * @param {string} sessionId
 * @param {Object} [port] - 断开连接的 port；传入时仅当注册表当前正是该 port 才删除，
 *   防止「旧连接的 onDisconnect 迟到」误删同会话后来建立的新连接（如连续调用、
 *   同会话多实例重连场景）
 */
export function unregisterKeepalivePort(sessionId, port) {
  if (!sessionId) return;
  if (port && keepalivePorts.get(sessionId) !== port) return;
  keepalivePorts.delete(sessionId);
  keepaliveIdentities.delete(sessionId);
}

// ========== 工具级终止等待（不取消 ReAct 循环） ==========

/**
 * 获取或创建当前工具的 AbortController
 * 每次工具执行前调用，创建新的 controller
 */
export function getOrCreateToolAbortController(sessionId) {
  if (!sessionId) return null;
  const controller = new AbortController();
  toolAbortControllers.set(sessionId, controller);
  return controller;
}

/**
 * 终止当前会话正在等待的工具（不取消 ReAct 循环）
 * 仅中断前端等待，不保证实际进程被终止
 */
export function abortCurrentTool(sessionId) {
  if (!sessionId) return false;
  const controller = toolAbortControllers.get(sessionId);
  if (controller && !controller.signal.aborted) {
    controller.abort();
    toolAbortControllers.delete(sessionId);
    return true;
  }
  return false;
}

/**
 * 清理工具 AbortController
 */
export function clearToolAbortController(sessionId) {
  if (sessionId) {
    toolAbortControllers.delete(sessionId);
  }
}