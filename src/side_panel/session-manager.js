// session-manager.js - 多会话管理模块
// 底层存储已迁移至 IndexedDB（src/storage/），本文件保持 API 兼容

import state from './state.js';
import * as store from '../storage/session-store.js';
import logger from '../shared/logger.js';

// chrome.storage.local 中存储已完成会话 ID 列表的键名
const COMPLETED_SESSIONS_KEY = 'completedSessionIds';

/**
 * 从 chrome.storage.local 恢复 completedSessionIds 到内存
 * 在 Side Panel 初始化时调用，保证刷新后仍能显示"完成待查看"提示
 */
export async function restoreCompletedSessions() {
  try {
    const result = await chrome.storage.local.get([COMPLETED_SESSIONS_KEY]);
    const ids = result[COMPLETED_SESSIONS_KEY] || [];
    state.completedSessionIds = new Set(ids);
  } catch (e) {
    logger.warn('[SessionManager] restore completedSessionIds failed:', e);
  }
}

/**
 * 将当前 completedSessionIds 持久化到 chrome.storage.local
 */
async function persistCompletedSessions() {
  try {
    await chrome.storage.local.set({
      [COMPLETED_SESSIONS_KEY]: Array.from(state.completedSessionIds),
    });
  } catch (e) {
    logger.warn('[SessionManager] persist completedSessionIds failed:', e);
  }
}

/**
 * 标记某会话的后台任务已完成，等待用户查看
 * 仅当该会话不是当前活跃会话（用户已切走）时才标记，否则无需提示
 * @param {string} sessionId 完成任务的会话 ID
 */
export async function markSessionCompleted(sessionId) {
  if (!sessionId) return;
  // 用户仍停留在该会话，无需提示
  if (sessionId === state.activeSessionId) return;
  // 已在完成集合中，避免重复写入
  if (state.completedSessionIds.has(sessionId)) return;
  state.completedSessionIds.add(sessionId);
  await persistCompletedSessions();
  document.dispatchEvent(new CustomEvent('generating-state-changed'));
}

/**
 * 清除某会话的"完成待查看"标记
 * 用户切回该会话查看后调用
 * @param {string} sessionId 已查看的会话 ID
 */
export async function clearSessionCompleted(sessionId) {
  if (!sessionId) return;
  if (!state.completedSessionIds.has(sessionId)) return;
  state.completedSessionIds.delete(sessionId);
  await persistCompletedSessions();
  document.dispatchEvent(new CustomEvent('generating-state-changed'));
}

// ==================== 对外 API（与旧版本 API 签名完全兼容） ====================

/**
 * 生成唯一会话 ID
 */
export function generateSessionId() {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

/**
 * 从存储加载所有会话
 */
export async function loadSessions() {
  return store.loadSessions();
}

/**
 * 保存所有会话到存储
 */
export async function saveSessions(sessionsData) {
  return store.saveSessions(sessionsData);
}

/**
 * 保存当前会话状态到存储
 */
export async function saveCurrentSession() {
  return store.saveCurrentSession();
}

/**
 * 创建一个新会话
 */
export async function createSession() {
  return store.createSession();
}

/**
 * 切换到指定会话
 */
export async function switchToSession(sessionId) {
  return store.switchToSession(sessionId);
}

/**
 * 删除指定会话
 */
export async function deleteSession(sessionId) {
  const result = await store.deleteStoreSession(sessionId);
  // 同步清理该会话的"完成待查看"标记，避免脏数据残留
  if (state.completedSessionIds.has(sessionId)) {
    state.completedSessionIds.delete(sessionId);
    await persistCompletedSessions();
  }
  return result;
}

/**
 * 重命名会话
 */
export async function renameSession(sessionId, newTitle) {
  return store.renameSession(sessionId, newTitle);
}

/**
 * 重新排序会话
 */
export async function reorderSessions(orderedIds) {
  return store.reorderSessions(orderedIds);
}

/**
 * 归档当前会话
 */
export async function archiveCurrentSession() {
  return store.archiveCurrentSession();
}

/**
 * 恢复归档会话为活跃会话
 */
export async function restoreArchivedSession(archivedId) {
  return store.restoreArchivedSession(archivedId);
}

/**
 * 从导出的会话数据导入
 */
export async function importSessions(sessionsData) {
  return store.importSessions(sessionsData);
}

/**
 * 将一条消息追加到指定会话的历史中（用于切换会话后保存后台任务结果）
 * @param {string} sessionId 目标会话 ID
 * @param {Object} message 消息对象 { role, content, executionLog }
 */
export async function appendMessageToSession(sessionId, message) {
  return store.appendMessageToSession(sessionId, message);
}

/**
 * 复制会话（完整快照或消息级截断，作为对话分支）
 * 完整继承源会话的消息历史与配置，自动激活新会话
 * @param {string} sourceSessionId - 源会话 ID
 * @param {string|null} [upToMessageId=null] - 消息级分叉点（含该消息）
 * @returns {Promise<Object>} 新创建的会话
 */
export async function duplicateSession(sourceSessionId, upToMessageId = null) {
  return store.duplicateSession(sourceSessionId, upToMessageId);
}
