// session-manager.js - 多会话管理模块
// 底层存储已迁移至 IndexedDB（src/storage/），本文件保持 API 兼容

import state from './state.js';
import * as store from '../storage/session-store.js';

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
  return store.deleteStoreSession(sessionId);
}

/**
 * 重命名会话
 */
export async function renameSession(sessionId, newTitle) {
  return store.renameSession(sessionId, newTitle);
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
