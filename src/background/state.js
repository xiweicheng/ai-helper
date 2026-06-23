// background/state.js - 状态管理和取消控制

// ReAct 循环取消控制 - 使用 Map 支持多会话
const cancelledSessions = new Map(); // sessionId -> boolean

// 当前活跃的 ReAct 循环会话 ID（用于向前兼容）
let activeReactSessionId = null;

// 旧版兼容：标签页维度的取消控制（tabId -> boolean）
const cancelledTabs = new Map();

// 当前活跃的 ReAct 循环标签页（旧版兼容）
let activeReactTabId = null;

// 当前对话的 API 调用计数器（每次对话重置）
let currentDialogApiCallCount = 0;

export function resetDialogApiCallCount() {
  currentDialogApiCallCount = 0;
}

export function incrementDialogApiCallCount() {
  currentDialogApiCallCount++;
  return currentDialogApiCallCount;
}

export function getDialogApiCallCount() {
  return currentDialogApiCallCount;
}

/**
 * 取消指定会话的 ReAct 循环
 * @param {string|null} sessionId - 会话ID，为null时取消所有
 * @param {number|null} tabId - 标签页ID（旧版兼容），为null时取消所有标签页
 */
export function cancelReactLoop(sessionIdOrTabId) {
  // 如果是数字（旧版 tabId 调用），使用旧逻辑
  if (typeof sessionIdOrTabId === 'number' || sessionIdOrTabId === null) {
    const tabId = sessionIdOrTabId;
    if (tabId === null) {
      cancelledTabs.clear();
      cancelledSessions.clear();
      console.log('[Background] 所有会话和标签页的 ReAct 循环已取消');
    } else {
      cancelledTabs.set(tabId, true);
      console.log('[Background] ReAct 循环已取消，tabId:', tabId);
    }
    return;
  }
  
  // 新逻辑：基于 sessionId
  const sessionId = sessionIdOrTabId;
  if (sessionId === null) {
    cancelledSessions.clear();
    cancelledTabs.clear();
    console.log('[Background] 所有会话的 ReAct 循环已取消');
  } else {
    cancelledSessions.set(sessionId, true);
    console.log('[Background] ReAct 循环已取消，sessionId:', sessionId);
  }
}

/**
 * 重置指定会话的取消状态
 * @param {string} sessionId - 会话ID
 */
export function resetReactCancel(sessionIdOrTabId) {
  // 旧版兼容：tabId 是数字
  if (typeof sessionIdOrTabId === 'number') {
    cancelledTabs.delete(sessionIdOrTabId);
    return;
  }
  
  if (sessionIdOrTabId !== undefined) {
    cancelledSessions.delete(sessionIdOrTabId);
    console.log('[Background] 会话取消状态已重置，sessionId:', sessionIdOrTabId);
  }
}

/**
 * 检查指定会话的 ReAct 循环是否已取消
 * @param {string|number} sessionIdOrTabId - 会话ID或标签页ID
 * @returns {boolean}
 */
export function isCancelled(sessionIdOrTabId) {
  if (sessionIdOrTabId === undefined) {
    // 兼容：检查活跃会话
    if (activeReactSessionId !== null && cancelledSessions.get(activeReactSessionId) === true) {
      return true;
    }
    // 兼容：检查活跃标签页
    return activeReactTabId !== null && cancelledTabs.get(activeReactTabId) === true;
  }
  
  // 旧版兼容：tabId 是数字
  if (typeof sessionIdOrTabId === 'number') {
    return cancelledTabs.get(sessionIdOrTabId) === true;
  }
  
  return cancelledSessions.get(sessionIdOrTabId) === true;
}

/**
 * 设置当前活跃的 ReAct 循环会话
 * @param {string} sessionId - 会话ID
 */
export function setActiveReactSessionId(sessionId) {
  activeReactSessionId = sessionId;
  if (sessionId !== null) {
    cancelledSessions.delete(sessionId);
  }
}

/**
 * 获取当前活跃的 ReAct 循环会话
 * @returns {string|null}
 */
export function getActiveReactSessionId() {
  return activeReactSessionId;
}

// ========== 以下为旧版兼容函数 ==========

/**
 * @deprecated 使用 setActiveReactSessionId 代替
 */
export function setActiveReactTabId(tabId) {
  activeReactTabId = tabId;
  if (tabId !== null) {
    cancelledTabs.delete(tabId);
  }
}

/**
 * @deprecated 使用 getActiveReactSessionId 代替
 */
export function getActiveReactTabId() {
  return activeReactTabId;
}

/**
 * @deprecated Session 模式不再需要，保留兼容
 */
export function resetReactCancelByTabId(tabId) {
  if (tabId !== undefined) {
    cancelledTabs.delete(tabId);
  }
}

/**
 * @deprecated 使用 resetReactCancel 代替
 */
export function setCurrentReactTabId(id) { 
  setActiveReactTabId(id); 
}

/**
 * @deprecated 使用 getActiveReactSessionId 代替
 */
export function getCurrentReactTabId() { 
  return getActiveReactTabId(); 
}
