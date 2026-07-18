import logger from '../shared/logger.js';

// background/state.js - 状态管理和取消控制
// 所有状态以 sessionId 为 key，支持多会话并行执行

// ReAct 循环取消控制
const cancelledSessions = new Map(); // sessionId -> boolean

// 每个会话的 AbortController，用于中断正在进行的 fetch 请求
const sessionAbortControllers = new Map(); // sessionId -> AbortController

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
 * 取消指定会话的 ReAct 循环
 * @param {string|null} sessionIdOrTabId - 会话ID 或 标签页ID
 */
export function cancelReactLoop(sessionIdOrTabId) {
  // 旧版兼容：tabId 是数字
  if (typeof sessionIdOrTabId === 'number') {
    cancelledTabs.set(sessionIdOrTabId, true);
    logger.debug('[Background] ReAct 循环已取消，tabId:', sessionIdOrTabId);
    return;
  }

  if (sessionIdOrTabId === null) {
    cancelledSessions.clear();
    cancelledTabs.clear();
    // 取消所有正在进行的 fetch 请求
    for (const [id, controller] of sessionAbortControllers) {
      controller.abort();
      logger.debug('[Background] 已取消会话的 fetch 请求，sessionId:', id);
    }
    sessionAbortControllers.clear();
    logger.debug('[Background] 所有会话的 ReAct 循环已取消');
  } else {
    cancelledSessions.set(sessionIdOrTabId, true);
    // 立即中断该会话正在进行的 fetch 请求
    const controller = sessionAbortControllers.get(sessionIdOrTabId);
    if (controller) {
      controller.abort();
      logger.debug('[Background] 已取消会话的 fetch 请求，sessionId:', sessionIdOrTabId);
    }
    logger.debug('[Background] ReAct 循环已取消，sessionId:', sessionIdOrTabId);
  }
}

/**
 * 重置指定会话的取消状态
 */
export function resetReactCancel(sessionIdOrTabId) {
  if (typeof sessionIdOrTabId === 'number') {
    cancelledTabs.delete(sessionIdOrTabId);
    return;
  }

  if (sessionIdOrTabId !== undefined) {
    cancelledSessions.delete(sessionIdOrTabId);
    sessionAbortControllers.delete(sessionIdOrTabId);
    logger.debug('[Background] 会话取消状态已重置，sessionId:', sessionIdOrTabId);
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
  if (sessionIdOrTabId === undefined) return false;

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