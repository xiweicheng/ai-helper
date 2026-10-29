// session-manager.js - 多会话管理模块
// 底层存储已迁移至 IndexedDB（src/storage/），本文件保持 API 兼容

import state from './state.js';
import * as store from '../storage/session-store.js';
import logger from '../shared/logger.js';
import * as queueStore from './queue-store.js';
import * as queueAttachments from './queue-attachment-store.js';

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
 * 把会话记录里的目录绑定水合进内存态（所有激活会话的路径都要调）
 */
export function hydrateSessionWorkdir(session) {
  return store.hydrateSessionWorkdir(session);
}

/**
 * 把一份会话态写回指定会话（跨会话接力用，不依赖 activeSessionId）
 */
export async function persistSessionState(sessionId, snapshot) {
  return store.persistSessionState(sessionId, snapshot);
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
 * 删除指定会话。
 *
 * 队列条目必须随会话一并清理：面板只渲染激活会话的队列，会话删除后
 * 留在存储里的条目用户再也看不见、删不掉（历史上它们进 orphans，同样无处可查）。
 * 这正是“沉默的僵尸数据”：既占着存储，又永远等不到派发。
 * 附件跟条目同生命周期，一并清理（失败也不阻塞删除，只多占磁盘）。
 */
export async function deleteSession(sessionId) {
  const jobCount = await queueStore.dropSession(sessionId);
  if (jobCount > 0) {
    void queueAttachments.deleteSessionAttachments(sessionId);
  }
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

// ==================== 归档区（用户可见的归档） ====================
//
// 与上面的 archiveCurrentSession / restoreArchivedSession 不是同一件事：
// 那两个是「清空对话」时写进独立 archivedSessions 表的旧快照通道（上限 20、无 UI）。
// 本节的归档可逆：只给会话对象打 archivedAt，消息、工作目录绑定、checkpoint 全部保留。

/**
 * 归档区列表（按归档时间倒序）
 */
export async function loadArchivedSessions() {
  return store.listArchivedSessions();
}

/**
 * 判断会话当前能否归档。
 * 执行中/排队中的会话不允许归档：归档后标签栏与会话列表都看不到它，
 * 而任务还在后台继续写消息，用户既看不到进度也找不到入口去停。
 * @param {string} sessionId
 * @returns {{ok: boolean, reason?: 'running'|'queued'|'missing'}}
 */
export function isSessionArchivable(sessionId) {
  if (!sessionId) return { ok: false, reason: 'missing' };
  if (state.generatingSessionIds.has(sessionId) || state.pendingCallApiSessionIds.has(sessionId)) {
    return { ok: false, reason: 'running' };
  }
  if (queueStore.getQueuedCount(sessionId) > 0) {
    return { ok: false, reason: 'queued' };
  }
  return { ok: true };
}

/**
 * 归档一个会话（可逆）。
 * 当前会话被归档后该切到哪里由调用方（session-manager-ui）负责。
 * @param {string} sessionId
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function archiveSession(sessionId) {
  const check = isSessionArchivable(sessionId);
  if (!check.ok) return check;
  const done = await store.archiveSession(sessionId);
  if (!done) return { ok: false, reason: 'missing' };
  // 归档会话不参与「完成待查看」提示：否则标签栏/停靠条会留下一个永远点不到的条目
  if (state.completedSessionIds.has(sessionId)) {
    state.completedSessionIds.delete(sessionId);
    await persistCompletedSessions();
    document.dispatchEvent(new CustomEvent('generating-state-changed'));
  }
  return { ok: true };
}

/**
 * 从归档区恢复为普通会话（回到标签栏末尾），不负责切换
 */
export async function restoreSession(sessionId) {
  return store.unarchiveSession(sessionId);
}

/**
 * 彻底删除归档会话：故意复用 deleteSession 而非 deleteStoreSession，
 * 否则会漏清队列条目、附件、完成标记（那条路径只有 UI 层知道）。
 */
export async function deleteArchivedSession(sessionId) {
  return deleteSession(sessionId);
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
