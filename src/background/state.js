// background/state.js - 状态管理和取消控制

// ReAct 循环取消控制
let isReactCancelled = false;
let currentReactTabId = null;

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
 * 取消当前 ReAct 循环
 */
export function cancelReactLoop(tabId) {
  if (currentReactTabId === tabId || tabId === null) {
    isReactCancelled = true;
    console.log('[Background] ReAct 循环已取消，tabId:', tabId);
  }
}

/**
 * 重置取消状态
 */
export function resetReactCancel() {
  isReactCancelled = false;
  currentReactTabId = null;
}

export function isCancelled() { return isReactCancelled; }
export function getCurrentReactTabId() { return currentReactTabId; }
export function setCurrentReactTabId(id) { currentReactTabId = id; }
