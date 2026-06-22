// background/state.js - 状态管理和取消控制

// ReAct 循环取消控制 - 使用 Map 支持多标签页
const cancelledTabs = new Map(); // tabId -> boolean

// 当前活跃的 ReAct 循环标签页（用于取消所有）
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
 * 取消指定标签页的 ReAct 循环
 * @param {number|null} tabId - 标签页ID，为null时取消所有标签页的循环
 */
export function cancelReactLoop(tabId) {
  if (tabId === null) {
    // 取消所有标签页的循环
    cancelledTabs.clear();
    console.log('[Background] 所有标签页的 ReAct 循环已取消');
  } else {
    cancelledTabs.set(tabId, true);
    console.log('[Background] ReAct 循环已取消，tabId:', tabId);
  }
}

/**
 * 重置指定标签页的取消状态
 * @param {number} tabId - 标签页ID
 */
export function resetReactCancel(tabId) {
  if (tabId !== undefined) {
    cancelledTabs.delete(tabId);
    console.log('[Background] 标签页取消状态已重置，tabId:', tabId);
  }
}

/**
 * 检查指定标签页的 ReAct 循环是否已取消
 * @param {number} tabId - 标签页ID
 * @returns {boolean}
 */
export function isCancelled(tabId) {
  if (tabId === undefined) {
    // 如果没有提供tabId，检查活跃标签页
    return activeReactTabId !== null && cancelledTabs.get(activeReactTabId) === true;
  }
  return cancelledTabs.get(tabId) === true;
}

/**
 * 设置当前活跃的 ReAct 循环标签页
 * @param {number} tabId - 标签页ID
 */
export function setActiveReactTabId(tabId) {
  activeReactTabId = tabId;
  // 重置该标签页的取消状态
  if (tabId !== null) {
    cancelledTabs.delete(tabId);
  }
}

/**
 * 获取当前活跃的 ReAct 循环标签页
 * @returns {number|null}
 */
export function getActiveReactTabId() {
  return activeReactTabId;
}

// 为了向后兼容，保留原有的函数名
export function setCurrentReactTabId(id) { 
  setActiveReactTabId(id); 
}

export function getCurrentReactTabId() { 
  return getActiveReactTabId(); 
}