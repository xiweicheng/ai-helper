// input-history.js - 输入历史管理

import state from './state.js';

/**
 * 添加到输入历史
 * @param {string} text - 输入文本
 */
export function addToInputHistory(text) {
  if (!text || !text.trim() || text.trim() == '/') return;
  
  const trimmedText = text.trim();
  
  // 移除已存在的重复条目，确保不会有重复的历史记录
  const existingIndex = state.inputHistory.indexOf(trimmedText);
  if (existingIndex !== -1) {
    state.inputHistory.splice(existingIndex, 1);
  }
  
  // 添加到数组末尾（最新的在最后）
  state.inputHistory.push(trimmedText);
  
  // 限制历史记录数量，超过时移除最旧的（数组开头）
  if (state.inputHistory.length > state.chatConfig.maxInputHistory) {
    state.inputHistory.shift();
  }
  
  // 保存到 storage
  saveInputHistory();
}

/**
 * 保存输入历史到 storage
 */
export function saveInputHistory() {
  try {
    chrome.storage.local.set({ inputHistory: state.inputHistory });
    console.log('[SidePanel] 输入历史已保存，数量:', state.inputHistory.length);
  } catch (e) {
    console.error('[SidePanel] 保存输入历史失败:', e);
  }
}
