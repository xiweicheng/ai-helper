// session-manager.js - 多会话管理模块

import state from './state.js';
import { showToast } from './utils.js';

/**
 * 生成唯一会话 ID
 */
export function generateSessionId() {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

/**
 * 从 storage 加载所有会话
 */
export async function loadSessions() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['sessions', 'chatHistory'], (result) => {
      const sessions = result.sessions;
      
      // 旧数据迁移：如果 chatHistory 存在且 sessions 为空，自动创建默认会话
      if ((!sessions || !sessions.list || sessions.list.length === 0) && result.chatHistory && result.chatHistory.length > 0) {
        const defaultSession = {
          id: generateSessionId(),
          title: '默认会话',
          model: state.currentModel,
          useTools: state.useTools,
          enabledTools: state.enabledTools,
          temperature: state.temperature,
          topP: state.topP,
          messageHistory: result.chatHistory,
          scrollPosition: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isGenerating: false,
          lastExecutionLog: []
        };
        resolve({
          activeSessionId: defaultSession.id,
          list: [defaultSession]
        });
        return;
      }
      
      if (sessions && sessions.list && sessions.list.length > 0) {
        resolve(sessions);
      } else {
        resolve({
          activeSessionId: null,
          list: []
        });
      }
    });
  });
}

/**
 * 保存所有会话到 storage
 */
export async function saveSessions(sessionsData) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ sessions: sessionsData }, () => {
      if (chrome.runtime.lastError) {
        console.error('[SessionManager] 保存会话失败:', chrome.runtime.lastError.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * 保存当前会话状态到 storage
 */
export async function saveCurrentSession() {
  if (!state.activeSessionId) return false;
  
  const sessions = await loadSessions();
  const currentSession = sessions.list.find(s => s.id === state.activeSessionId);
  
  if (!currentSession) return false;
  
  // 更新当前会话数据
  currentSession.model = state.currentModel;
  currentSession.useTools = state.useTools;
  currentSession.enabledTools = [...state.enabledTools];
  currentSession.temperature = state.temperature;
  currentSession.topP = state.topP;
  
  // 裁剪消息历史
  const maxMessages = state.chatConfig.maxHistoryMessages || 50;
  const maxLen = state.chatConfig.maxMessageLength || 5000;
  currentSession.messageHistory = state.messageHistory.slice(-maxMessages).map(msg => ({
    role: msg.role,
    content: (msg.content || '').substring(0, maxLen),
    executionLog: msg.executionLog || []
  }));
  
  currentSession.updatedAt = new Date().toISOString();
  
  // 更新标题（取第一条用户消息的前 50 个字符）
  const firstUserMsg = state.messageHistory.find(m => m.role === 'user');
  if (firstUserMsg) {
    currentSession.title = firstUserMsg.content.substring(0, 50).replace(/\n/g, ' ');
  }
  
  await saveSessions(sessions);
  return true;
}

/**
 * 创建一个新会话
 */
export async function createSession() {
  const sessionId = generateSessionId();
  const newSession = {
    id: sessionId,
    title: '新会话',
    model: state.currentModel,   // 继承当前配置
    useTools: state.useTools,
    enabledTools: [...state.enabledTools],
    temperature: state.temperature,
    topP: state.topP,
    messageHistory: [],
    scrollPosition: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isGenerating: false,
    lastExecutionLog: []
  };
  
  const sessions = await loadSessions();
  sessions.list.push(newSession);
  sessions.activeSessionId = sessionId;
  
  await saveSessions(sessions);
  return newSession;
}

/**
 * 切换到指定会话
 */
export async function switchToSession(sessionId) {
  if (sessionId === state.activeSessionId) return;
  
  // 先保存当前会话
  await saveCurrentSession();
  
  const sessions = await loadSessions();
  const targetSession = sessions.list.find(s => s.id === sessionId);
  
  if (!targetSession) {
    console.error('[SessionManager] 找不到会话:', sessionId);
    return false;
  }
  
  // 更新 activeSessionId
  sessions.activeSessionId = sessionId;
  await saveSessions(sessions);
  
  // 恢复目标会话的状态到内存
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
export async function deleteSession(sessionId) {
  const sessions = await loadSessions();
  const idx = sessions.list.findIndex(s => s.id === sessionId);
  
  if (idx === -1) return false;
  
  sessions.list.splice(idx, 1);
  
  // 如果删除的是当前活跃会话，切换到第一个剩下的会话
  if (sessions.activeSessionId === sessionId) {
    if (sessions.list.length > 0) {
      sessions.activeSessionId = sessions.list[0].id;
    } else {
      sessions.activeSessionId = null;
    }
  }
  
  await saveSessions(sessions);
  return true;
}

/**
 * 重命名会话
 */
export async function renameSession(sessionId, newTitle) {
  const sessions = await loadSessions();
  const session = sessions.list.find(s => s.id === sessionId);
  
  if (!session) return false;
  
  session.title = newTitle;
  session.updatedAt = new Date().toISOString();
  
  await saveSessions(sessions);
  return true;
}

/**
 * 归档当前会话
 */
export async function archiveCurrentSession() {
  if (!state.messageHistory || state.messageHistory.length === 0) return;
  
  const sessions = await loadSessions();
  const currentSession = sessions.list.find(s => s.id === state.activeSessionId);
  
  if (!currentSession) return;
  
  // 生成归档数据
  const firstUserMsg = state.messageHistory.find(m => m.role === 'user');
  const title = firstUserMsg
    ? firstUserMsg.content.substring(0, 50).replace(/\n/g, ' ')
    : (currentSession.title || '未命名会话');
  
  const archivedId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  
  const sanitizedMessages = state.messageHistory.map(msg => ({
    role: msg.role,
    content: (msg.content || '').substring(0, 3000)
  }));
  
  // 保存到 conversationSessions
  chrome.storage.local.get(['conversationSessions'], (result) => {
    const archiveSessions = result.conversationSessions?.sessions || [];
    
    archiveSessions.push({
      id: archivedId,
      title: title,
      createdAt: new Date().toISOString(),
      messages: sanitizedMessages
    });
    
    // 最多保留 20 个归档
    if (archiveSessions.length > 20) {
      archiveSessions.splice(0, archiveSessions.length - 20);
    }
    
    chrome.storage.local.set({
      conversationSessions: { sessions: archiveSessions }
    });
  });
  
  // 从活跃会话列表中移除，保留一个空的新会话
  const newEmptySession = await createSession();
  
  // 删除旧会话
  await deleteSession(currentSession.id);
  
  // 切换到新会话
  await switchToSession(newEmptySession.id);
  
  return true;
}

/**
 * 恢复归档会话为活跃会话
 */
export async function restoreArchivedSession(archivedId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['conversationSessions'], async (result) => {
      const archiveSessions = result.conversationSessions?.sessions || [];
      const archived = archiveSessions.find(s => s.id === archivedId);
      
      if (!archived) {
        resolve(false);
        return;
      }
      
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
        lastExecutionLog: []
      };
      
      const sessions = await loadSessions();
      sessions.list.push(newSession);
      sessions.activeSessionId = sessionId;
      
      // 从归档中移除
      const archiveIdx = archiveSessions.findIndex(s => s.id === archivedId);
      if (archiveIdx !== -1) {
        archiveSessions.splice(archiveIdx, 1);
      }
      
      chrome.storage.local.set({
        conversationSessions: { sessions: archiveSessions }
      });
      
      await saveSessions(sessions);
      resolve(newSession);
    });
  });
}
