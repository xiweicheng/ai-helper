// storage/session-store.js - 会话存储适配器
// 对接 IndexedDB，提供与旧 chrome.storage 兼容的 API
// 同时保留 chrome.storage.local 兜底（双写 + 读降级）

import * as idb from './db.js';
import state from '../side_panel/state.js';
import { BUILTIN_TOOLS } from '../side_panel/constants.js';

let migrated = false;

// 记录上一次活跃的会话 ID，用于关闭当前会话后回退到上一个
let previousSessionId = null;

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
  // 按 order 排序，没有 order 的按 createdAt 兜底
  list.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
    if (a.order !== undefined) return -1;
    if (b.order !== undefined) return 1;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
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
 * 从消息 content 中提取纯文本（content 可能是数组格式含图片）
 */
function getTextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(c => c.type === 'text').map(c => c.text).join('');
  }
  return '';
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
  currentSession.agentId = state.activeAgentId || null;
  currentSession.temperature = state.temperature;
  currentSession.topP = state.topP;

  // 裁剪消息历史（仅限制消息条数，不再截断单条消息内容）
  const maxMessages = state.chatConfig.maxHistoryMessages || 50;
  currentSession.messageHistory = state.messageHistory.slice(-maxMessages).map((msg) => ({
    role: msg.role,
    content: msg.content || '',
    executionLog: msg.executionLog || [],
    reflectionScore: msg.reflectionScore,
    wasRevised: msg.wasRevised || false,
    htmlContent: msg.htmlContent || undefined,
  }));

  currentSession.updatedAt = new Date().toISOString();

  // 更新标题（取第一条用户消息的前 50 个字符）
  const firstUserMsg = state.messageHistory.find((m) => m.role === 'user');
  if (firstUserMsg) {
    currentSession.title = getTextContent(firstUserMsg.content).substring(0, 50).replace(/\n/g, ' ');
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
    agentId: state.activeAgentId || null,
    temperature: state.temperature,
    topP: state.topP,
    messageHistory: [],
    scrollPosition: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: Date.now(),
    isGenerating: false,
    lastExecutionLog: [],
  };

  await idb.putSession(newSession);
  await idb.setActiveSessionId(sessionId);
  return newSession;
}

/**
 * 从导出的会话数据导入为新的活跃会话
 * @param {Array} sessionsData - 导出的会话数据数组（不含 id/order，导入时重新生成）
 * @returns {Promise<Array>} 新创建的会话数组
 */
export async function importSessions(sessionsData) {
  await init();
  const createdSessions = [];

  for (const sessionData of sessionsData) {
    const sessionId = generateSessionId();
    const newSession = {
      id: sessionId,
      title: sessionData.title || '导入的会话',
      model: sessionData.model || state.currentModel,
      useTools: sessionData.useTools !== undefined ? sessionData.useTools : true,
      enabledTools: sessionData.enabledTools || [...state.enabledTools],
      temperature: sessionData.temperature !== undefined ? sessionData.temperature : state.temperature,
      topP: sessionData.topP !== undefined ? sessionData.topP : state.topP,
      agentId: sessionData.agentId || null,
      messageHistory: (sessionData.messageHistory || []).map((msg) => ({
        role: msg.role,
        content: msg.content || '',
        executionLog: msg.executionLog || [],
        reflectionScore: msg.reflectionScore,
        wasRevised: msg.wasRevised || false,
        htmlContent: msg.htmlContent || undefined,
      })),
      scrollPosition: 0,
      createdAt: sessionData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: Date.now() + createdSessions.length,
      isGenerating: false,
      lastExecutionLog: [],
    };

    await idb.putSession(newSession);
    createdSessions.push(newSession);
  }

  // 如果当前没有活跃会话，自动切换到第一个导入的会话
  const activeId = await idb.getActiveSessionId();
  if (!activeId && createdSessions.length > 0) {
    await idb.setActiveSessionId(createdSessions[0].id);
  }

  return createdSessions;
}

/**
 * 将一条消息追加到指定会话的消息历史中
 * 用于切换会话后，后台任务仍在执行时保存任务结果
 * @param {string} sessionId 目标会话 ID
 * @param {Object} message 消息对象 { role, content, executionLog }
 */
export async function appendMessageToSession(sessionId, message) {
  const session = await idb.getSession(sessionId);
  if (!session) return false;

  session.messageHistory = session.messageHistory || [];
  session.messageHistory.push({
    role: message.role,
    content: message.content || '',
    executionLog: message.executionLog || [],
    reflectionScore: message.reflectionScore,
    wasRevised: message.wasRevised || false,
    htmlContent: message.htmlContent || undefined,
  });

  session.updatedAt = new Date().toISOString();
  session.isGenerating = false;

  await idb.putSession(session);
  return true;
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

  // 记录切换前的会话 ID，用于删除当前会话时回退
  previousSessionId = state.activeSessionId;

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
  // 合并会话的 enabledTools：保留已有选择，自动添加新工具
  if (targetSession.enabledTools && targetSession.enabledTools.length > 0) {
    const validIds = new Set(BUILTIN_TOOLS.map(t => t.id));
    const saved = targetSession.enabledTools.filter(id => validIds.has(id));
    const added = BUILTIN_TOOLS.filter(t => t.enabled && !saved.includes(t.id)).map(t => t.id);
    state.enabledTools = [...saved, ...added];
  } else {
    state.enabledTools = targetSession.enabledTools || state.enabledTools;
  }
  state.temperature = targetSession.temperature !== undefined ? targetSession.temperature : state.temperature;
  state.topP = targetSession.topP !== undefined ? targetSession.topP : state.topP;
  state.activeAgentId = targetSession.agentId || null;
  // 使用按会话隔离的 generatingSessionIds Set 恢复生成状态
  // 注意：DB 中的 isGenerating 可能不准确（内存 Set 是权威来源），
  // 只基于 DB 值做 add，不做 delete——生成状态由 sendMessage 的 finally 块统一清理
  if (targetSession.isGenerating) {
    state.generatingSessionIds.add(sessionId);
  }

  return targetSession;
}

/**
 * 删除指定会话
 */
export async function deleteStoreSession(sessionId) {
  const allSessions = await idb.getAllSessions();
  const activeId = await idb.getActiveSessionId();

  await idb.deleteSession(sessionId);

  // 如果删除的是当前活跃会话，优先切换到上一个会话，其次第一个剩下的会话
  if (activeId === sessionId) {
    const remaining = allSessions.filter((s) => s.id !== sessionId);
    if (remaining.length > 0) {
      // 优先回退到上一次选中的会话
      const fallback = remaining.find(s => s.id === previousSessionId);
      await idb.setActiveSessionId(fallback ? fallback.id : remaining[0].id);
      // 清除回退记录
      previousSessionId = null;
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
 * 重新排序会话
 * @param {string[]} orderedIds - 按新顺序排列的会话 ID 列表
 */
export async function reorderSessions(orderedIds) {
  const allSessions = await idb.getAllSessions();
  const sessionMap = new Map(allSessions.map(s => [s.id, s]));

  const updates = [];
  orderedIds.forEach((id, index) => {
    const session = sessionMap.get(id);
    if (session) {
      session.order = index;
      updates.push(idb.putSession(session));
    }
  });

  await Promise.all(updates);
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
    ? getTextContent(firstUserMsg.content).substring(0, 50).replace(/\n/g, ' ')
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
