// storage/session-store.js - 会话存储适配器
// 对接 IndexedDB，提供与旧 chrome.storage 兼容的 API
// 同时保留 chrome.storage.local 兜底（双写 + 读降级）

import * as idb from './db.js';
import state from '../side_panel/state.js';

let migrated = false;

/**
 * 初始化：尝试从 chrome.storage 迁移数据
 */
export async function init() {
  if (migrated) return;
  await idb.ensureMigration();
  migrated = true;
}

/**
 * 加载所有会话（兼容旧 API 返回格式）
 * @returns {Promise<{activeSessionId: string|null, list: Array}>}
 */
export async function loadSessions() {
  await init();
  const [list, activeId] = await Promise.all([
    idb.getAllSessions(),
    idb.getActiveSessionId(),
  ]);
  return { activeSessionId: activeId, list };
}

/**
 * 保存所有活跃会话到存储
 * @param {{activeSessionId: string|null, list: Array}} sessionsData
 */
export async function saveSessions(sessionsData) {
  await init();
  const { list, activeSessionId } = sessionsData;
  await Promise.all([
    idb.putSessions(list),
    idb.setActiveSessionId(activeSessionId),
  ]);
  return true;
}

/**
 * 保存当前会话状态
 */
export async function saveCurrentSession() {
  if (!state.activeSessionId) return false;

  const currentSession = await idb.getSession(state.activeSessionId);
  if (!currentSession) return false;

  // 更新当前会话数据
  currentSession.model = state.currentModel;
  currentSession.useTools = state.useTools;
  currentSession.enabledTools = [...state.enabledTools];
  currentSession.temperature = state.temperature;
  currentSession.topP = state.topP;

  // 裁剪消息历史（仅限制消息条数，不再截断单条消息内容）
  const maxMessages = state.chatConfig.maxHistoryMessages || 50;
  currentSession.messageHistory = state.messageHistory.slice(-maxMessages).map((msg) => ({
    role: msg.role,
    content: msg.content || '',
    executionLog: msg.executionLog || [],
  }));

  currentSession.updatedAt = new Date().toISOString();

  // 更新标题（取第一条用户消息的前 50 个字符）
  const firstUserMsg = state.messageHistory.find((m) => m.role === 'user');
  if (firstUserMsg) {
    currentSession.title = firstUserMsg.content.substring(0, 50).replace(/\n/g, ' ');
  }

  await idb.putSession(currentSession);
  return true;
}

/**
 * 创建一个新会话
 * @returns {Promise<Object>} 新会话对象
 */
export async function createSession() {
  await init();
  const sessionId = generateSessionId();
  const newSession = {
    id: sessionId,
    title: '新会话',
    model: state.currentModel,
    useTools: state.useTools,
    enabledTools: [...state.enabledTools],
    temperature: state.temperature,
    topP: state.topP,
    messageHistory: [],
    scrollPosition: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isGenerating: false,
    lastExecutionLog: [],
  };

  await idb.putSession(newSession);
  await idb.setActiveSessionId(sessionId);
  return newSession;
}

/**
 * 生成唯一会话 ID
 */
function generateSessionId() {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

/**
 * 切换到指定会话
 * @returns {Promise<Object|false>}
 */
export async function switchToSession(sessionId) {
  if (sessionId === state.activeSessionId) return;
  await saveCurrentSession();

  const targetSession = await idb.getSession(sessionId);
  if (!targetSession) {
    console.error('[SessionStore] 找不到会话:', sessionId);
    return false;
  }

  await idb.setActiveSessionId(sessionId);

  state.activeSessionId = sessionId;
  state.messageHistory = targetSession.messageHistory || [];
  state.currentModel = targetSession.model || state.currentModel;
  state.useTools = targetSession.useTools !== undefined ? targetSession.useTools : state.useTools;
  state.enabledTools = targetSession.enabledTools || state.enabledTools;
  state.temperature = targetSession.temperature !== undefined ? targetSession.temperature : state.temperature;
  state.topP = targetSession.topP !== undefined ? targetSession.topP : state.topP;
  state.isGenerating = targetSession.isGenerating || false;

  return targetSession;
}

/**
 * 删除指定会话
 */
export async function deleteStoreSession(sessionId) {
  const allSessions = await idb.getAllSessions();
  const activeId = await idb.getActiveSessionId();

  await idb.deleteSession(sessionId);

  // 如果删除的是当前活跃会话，切换到第一个剩下的会话
  if (activeId === sessionId) {
    const remaining = allSessions.filter((s) => s.id !== sessionId);
    if (remaining.length > 0) {
      await idb.setActiveSessionId(remaining[0].id);
    } else {
      await idb.setActiveSessionId(null);
    }
  }

  return true;
}

/**
 * 重命名会话
 */
export async function renameSession(sessionId, newTitle) {
  const session = await idb.getSession(sessionId);
  if (!session) return false;
  session.title = newTitle;
  session.updatedAt = new Date().toISOString();
  await idb.putSession(session);
  return true;
}

/**
 * 归档当前会话
 */
export async function archiveCurrentSession() {
  if (!state.messageHistory || state.messageHistory.length === 0) return;

  const currentSession = await idb.getSession(state.activeSessionId);
  if (!currentSession) return;

  const firstUserMsg = state.messageHistory.find((m) => m.role === 'user');
  const title = firstUserMsg
    ? firstUserMsg.content.substring(0, 50).replace(/\n/g, ' ')
    : currentSession.title || '未命名会话';

  const archivedId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

  const sanitizedMessages = state.messageHistory.map((msg) => ({
    role: msg.role,
    content: msg.content || '',
  }));

  // 保存到归档
  const archiveSessions = await idb.getAllArchivedSessions();
  archiveSessions.push({
    id: archivedId,
    title,
    createdAt: new Date().toISOString(),
    messages: sanitizedMessages,
  });

  // 最多保留 20 个归档
  if (archiveSessions.length > 20) {
    archiveSessions.splice(0, archiveSessions.length - 20);
  }

  await idb.replaceArchivedSessions(archiveSessions);

  // 从活跃会话列表中移除，保留一个空的新会话
  const newEmptySession = await createSession();
  await deleteStoreSession(currentSession.id);
  await switchToSession(newEmptySession.id);

  return true;
}

/**
 * 恢复归档会话为活跃会话
 */
export async function restoreArchivedSession(archivedId) {
  const archiveSessions = await idb.getAllArchivedSessions();
  const archived = archiveSessions.find((s) => s.id === archivedId);

  if (!archived) return false;

  // 创建新活跃会话
  const sessionId = generateSessionId();
  const newSession = {
    id: sessionId,
    title: archived.title || '恢复的会话',
    model: state.currentModel,
    useTools: state.useTools,
    enabledTools: [...state.enabledTools],
    temperature: state.temperature,
    topP: state.topP,
    messageHistory: archived.messages || [],
    scrollPosition: 0,
    createdAt: archived.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isGenerating: false,
    lastExecutionLog: [],
  };

  await idb.putSession(newSession);
  await idb.setActiveSessionId(sessionId);

  // 从归档中移除
  const archiveIdx = archiveSessions.findIndex((s) => s.id === archivedId);
  if (archiveIdx !== -1) {
    archiveSessions.splice(archiveIdx, 1);
  }
  await idb.replaceArchivedSessions(archiveSessions);

  return newSession;
}
