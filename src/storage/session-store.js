// storage/session-store.js - 会话存储适配器
// 对接 IndexedDB，提供与旧 chrome.storage 兼容的 API
// 同时保留 chrome.storage.local 兜底（双写 + 读降级）

import * as idb from './db.js';
import state from '../side_panel/state.js';
import logger from '../shared/logger.js';

// 会话删除时需要同步清理对应的 ReAct checkpoint
async function cleanupCheckpointForSession(sessionId) {
  try {
    await idb.deleteReactCheckpoint(sessionId);
  } catch (e) {
    logger.warn('[session-store] 清理 ReAct checkpoint 失败:', e);
  }
}

let migrated = false;

/**
 * 初始化：尝试从 chrome.storage 迁移数据
 */
export async function init() {
  if (migrated) return;
  await idb.ensureMigration();
  migrated = true;

  // 清理孤儿 scrollPosition key（会话已被删除但 key 残留）
  cleanupOrphanScrollPositions();
}

/**
 * 清理 chrome.storage.local 中无对应会话的 scrollPosition_* key
 */
async function cleanupOrphanScrollPositions() {
  try {
    const sessions = await idb.getAllSessions();
    const validIds = new Set(sessions.map(s => s.id));
    // 'default' 是 fallback key，始终保留
    validIds.add('default');

    const allItems = await chrome.storage.local.get(null);
    const orphanKeys = Object.keys(allItems).filter(
      k => k.startsWith('scrollPosition_') && !validIds.has(k.slice('scrollPosition_'.length))
    );

    if (orphanKeys.length > 0) {
      await chrome.storage.local.remove(orphanKeys);
      logger.debug(`[session-store] 清理了 ${orphanKeys.length} 个孤儿 scrollPosition key:`, orphanKeys);
    }
  } catch (e) {
    // 非关键路径，静默失败
    logger.warn('[session-store] 清理孤儿 scrollPosition 失败:', e);
  }
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

  currentSession.messageHistory = state.messageHistory.map((msg) => ({
    role: msg.role,
    content: msg.content || '',
    executionLog: msg.executionLog || [],
    reflectionScore: msg.reflectionScore,
    wasRevised: msg.wasRevised || false,
    htmlContent: msg.htmlContent || undefined,
    messageId: msg.messageId || undefined,
    timestamp: msg.timestamp || undefined,
    contextBubbles: msg.contextBubbles || undefined,
    resumable: msg.resumable || false,
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

  const targetSession = await idb.getSession(sessionId);
  if (!targetSession) {
    logger.error('[SessionStore] 找不到会话:', sessionId);
    return false;
  }

  await idb.setActiveSessionId(sessionId);

  state.activeSessionId = sessionId;
  state.messageHistory = targetSession.messageHistory || [];
  // 会话切换时从会话恢复 model/temperature
  // 如果会话绑定了 Agent，优先使用 Agent 配置；否则使用会话存储的值
  state.currentModel = targetSession.model || state.currentModel;
  state.temperature = targetSession.temperature !== undefined ? targetSession.temperature : state.temperature;
  state.topP = targetSession.topP !== undefined ? targetSession.topP : state.topP;
  state.useTools = targetSession.useTools !== undefined ? targetSession.useTools : state.useTools;
  state.activeAgentId = targetSession.agentId || null;
  // 持久化当前智能体 ID，避免刷新后丢失
  if (targetSession.agentId) {
    chrome.storage.local.set({ activeAgentId: targetSession.agentId });
  } else {
    chrome.storage.local.remove('activeAgentId');
  }

  // 如果会话绑定了自定义 Agent，尝试从 Agent 配置中加载模型/温度
  // 注意：自定义 Agent 的参数只更新 state，不写入 chrome.storage.local 全局键，
  // 避免覆盖默认 Agent 的全局模型/温度值
  if (targetSession.agentId && targetSession.agentId !== 'default') {
    try {
      const { getAgent } = await import('../side_panel/agent-store.js');
      const agent = await getAgent(targetSession.agentId);
      if (agent) {
        if (agent.model) {
          state.currentModel = agent.model;
        }
        if (agent.temperature !== null && agent.temperature !== undefined) {
          state.temperature = agent.temperature;
          state.topP = agent.topP !== null && agent.topP !== undefined ? agent.topP : 1.0;
        }
        // 触发 UI 更新
        document.dispatchEvent(new CustomEvent('agent-model-changed'));
      }
    } catch { /* Agent 加载失败，使用会话存储值 */ }
  } else {
    // 默认 Agent：从 chrome.storage.local 读取全局模型/温度（所有默认 Agent 会话共享）
    try {
      const global = await chrome.storage.local.get(['modelName', 'temperature', 'topP']);
      if (global.modelName) state.currentModel = global.modelName;
      if (global.temperature !== undefined) state.temperature = global.temperature;
      if (global.topP !== undefined) state.topP = global.topP;
    } catch { /* 读取失败，使用会话存储值 */ }
    // 触发 UI 更新，确保弹窗 slider/输入框与图标一致
    document.dispatchEvent(new CustomEvent('agent-model-changed'));
  }
  // 使用按会话隔离的 generatingSessionIds Set 恢复生成状态
  // 仅当 pendingCallApiSessionIds 中也存在该 session 时才恢复，防止 SW 重启后
  // DB 中残留的 isGenerating=true 导致虚假的"生成中"状态
  if (targetSession.isGenerating && state.pendingCallApiSessionIds.has(sessionId)) {
    state.generatingSessionIds.add(sessionId);
  } else if (targetSession.isGenerating) {
    // DB 中有生成标记但实际无后台任务，异步清理过期状态（不阻塞切换）
    logger.debug('[SessionStore] 检测到过期的 isGenerating 标记，异步清理:', sessionId);
    (async () => {
      try {
        const session = await idb.getSession(sessionId);
        if (session) {
          session.isGenerating = false;
          await idb.putSession(session);
        }
      } catch (e) {
        logger.warn('[SessionStore] 清理过期 isGenerating 标记失败:', e);
      }
    })();
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

  // 清理该会话的 scrollPosition 存储，防止泄露
  chrome.storage.local.remove('scrollPosition_' + sessionId);

  // 同步清理该会话的 ReAct checkpoint
  await cleanupCheckpointForSession(sessionId);

  // 如果删除的是当前活跃会话，就近激活：优先右侧紧邻，无右侧则左侧紧邻
  if (activeId === sessionId) {
    // 按显示顺序排序（与 loadSessions 保持一致）
    const sorted = [...allSessions].sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      if (a.order !== undefined) return -1;
      if (b.order !== undefined) return 1;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
    const deletedIndex = sorted.findIndex(s => s.id === sessionId);
    const remaining = sorted.filter((s) => s.id !== sessionId);

    if (remaining.length > 0) {
      // 就近激活：取同位置（右侧邻居），若已超出则取最后一个（左侧邻居）
      const fallbackIndex = Math.min(deletedIndex, remaining.length - 1);
      await idb.setActiveSessionId(remaining[fallbackIndex].id);
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
    executionLog: msg.executionLog || [],
    reflectionScore: msg.reflectionScore,
    wasRevised: msg.wasRevised || false,
    htmlContent: msg.htmlContent || undefined,
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

/**
 * 复制会话（完整快照，作为对话分支使用）
 * 完整继承源会话的消息历史与配置（模型/工具/Agent/温度等）
 * @param {string} sourceSessionId - 源会话 ID
 * @returns {Promise<Object>} 新创建的会话
 */
export async function duplicateSession(sourceSessionId) {
  await init();

  const source = await idb.getSession(sourceSessionId);
  if (!source) throw new Error('源会话不存在');

  const newSessionId = generateSessionId();
  const now = new Date().toISOString();

  // 完整复制消息历史，深拷贝避免引用共享；重新生成 messageId 避免冲突
  const clonedMessages = (source.messageHistory || []).map((msg) => ({
    ...msg,
    executionLog: Array.isArray(msg.executionLog) ? [...msg.executionLog] : [],
    contextBubbles: Array.isArray(msg.contextBubbles) ? [...msg.contextBubbles] : undefined,
    // 重新生成 messageId（遵循项目约定：所有消息必须有唯一 messageId）
    messageId: 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8),
  }));

  const newSession = {
    ...source,
    id: newSessionId,
    title: `${source.title || '新会话'} - 副本`,
    messageHistory: clonedMessages,
    // 重置运行时状态
    isGenerating: false,
    lastExecutionLog: [],
    scrollPosition: 0,
    createdAt: now,
    updatedAt: now,
    order: Date.now(),
    // 分支元数据：仅记录来源，暂不做复杂分支功能
    forkMetadata: {
      sourceSessionId,
      forkedAt: now,
    },
  };

  await idb.putSession(newSession);
  await idb.setActiveSessionId(newSessionId);

  return newSession;
}
