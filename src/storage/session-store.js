// storage/session-store.js - 会话存储适配器
// 对接 IndexedDB，提供与旧 chrome.storage 兼容的 API
// 同时保留 chrome.storage.local 兜底（双写 + 读降级）

import * as idb from './db.js';
import { removeDocImageSnapshot } from '../side_panel/doc-images.js';
import state from '../side_panel/state.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';
import { unbindSessionWorkdirRemote } from '../shared/workdir-scope.js';

registerTranslations('zh', {
  session: {
    newSession: '新会话',
    importedSession: '导入的会话',
    unnamedSession: '未命名会话',
    restoredSession: '恢复的会话',
    forkSuffix: '分叉',
    sourceNotFound: '源会话不存在',
    scheduledSession: '定时任务',
  },
});
registerTranslations('en', {
  session: {
    newSession: 'New session',
    importedSession: 'Imported session',
    unnamedSession: 'Unnamed session',
    restoredSession: 'Restored session',
    forkSuffix: 'Fork',
    sourceNotFound: 'Source session not found',
    scheduledSession: 'Scheduled task',
  },
});

// 会话删除时需要同步清理对应的 ReAct checkpoint
async function cleanupCheckpointForSession(sessionId) {
  try {
    await idb.deleteReactCheckpoint(sessionId);
  } catch (e) {
    logger.warn('[session-store] cleanup ReAct checkpoint failed:', e);
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
      logger.debug(`[session-store] cleanup ${orphanKeys.length} orphan scrollPosition key:`, orphanKeys);
    }
  } catch (e) {
    // 非关键路径，静默失败
    logger.warn('[session-store] cleanup orphaned scrollPosition failed:', e);
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
  if (!currentSession) {
    logger.warn('[SessionStore] saveCurrentSession cannot find currentsession:', state.activeSessionId);
    return false;
  }

  // 更新当前会话数据
  currentSession.model = state.currentModel;
  currentSession.useTools = state.useTools;
  currentSession.enabledTools = [...state.enabledTools];
  currentSession.agentId = state.activeAgentId || null;
  currentSession.temperature = state.temperature;
  currentSession.topP = state.topP;
  // 上下文压缩记录（会话级；undefined 时 JSON 序列化自动省略字段）
  currentSession.contextCompaction = state.activeCompaction || undefined;

  // 会话级工作目录绑定：只写本会话自己的值（null = 跟随代理默认）
  // workdirAgentId 是「绑定时生效的代理」，换代理后绑定仍保留（切回原代理仍生效）
  currentSession.workdir = state.sessionWorkdir || null;
  currentSession.workdirAgentId = state.sessionWorkdir ? (state.workdirAgentId || null) : null;

  currentSession.messageHistory = serializeMessageHistory(state.messageHistory);

  currentSession.updatedAt = new Date().toISOString();

  // 更新标题（取第一条用户消息的前 50 个字符）
  // 分叉/复制的会话保留其自定义标题（含"- 分叉"/"- 副本"后缀），不自动覆盖
  // 用户手动重命名的会话（titleManuallySet）同样保留自定义标题，避免切换/保存时被首条消息覆盖
  if (!currentSession.forkMetadata && !currentSession.titleManuallySet) {
    const firstUserMsg = state.messageHistory.find((m) => m.role === 'user');
    if (firstUserMsg) {
      currentSession.title = getTextContent(firstUserMsg.content).substring(0, 50).replace(/\n/g, ' ');
    }
  }

  const saved = await idb.putSession(currentSession);
  if (!saved) {
    logger.error('[SessionStore] putSession failed, sessionId:', state.activeSessionId);
    return false;
  }
  return true;
}

/**
 * 只保留消息历史里需要持久化的字段（当前会话与跨会话两条写盘路径共用）
 */
export function serializeMessageHistory(list) {
  return (list || []).map((msg) => ({
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
}

/** 消息身份：优先 messageId，老数据没有 id 时退回 role+content */
function sameMessage(a, b) {
  if (!a || !b) return false;
  if (a.messageId && b.messageId) return a.messageId === b.messageId;
  return a.role === b.role && (a.content || '') === (b.content || '');
}

/**
 * 合并消息历史（并发写保护）。
 * persistSessionState 的快照是 dispatch 时读的，而写回发生在生成结束时刻 ——
 * 期间别的路径（任务恢复结果 append、切走消息落盘）可能往该会话追加消息，
 * 整段覆盖会把它们吞掉。策略：以两侧最长共同前缀为底盘，磁盘独有段
 * （并发追加）保留在本轮新段之前；首条就对不上（历史被整体替换）退回快照。
 * @param {Array} onDisk 磁盘现值
 * @param {Array} snapshot 快照序列化后的历史
 * @returns {Array}
 */
function mergeMessageHistory(onDisk, snapshot) {
  const max = Math.min(onDisk.length, snapshot.length);
  let common = 0;
  while (common < max && sameMessage(onDisk[common], snapshot[common])) common++;
  if (common === 0) return snapshot;
  if (common === onDisk.length) return snapshot;
  return [...snapshot.slice(0, common), ...onDisk.slice(common), ...snapshot.slice(common)];
}

/**
 * 把一份会话态写回指定会话（不依赖 state.activeSessionId）。
 * 队列跨会话接力时目标会话并不显示在面板上，不能走 saveCurrentSession；
 * 只写显式传入的字段，其余保持磁盘原值，避免把当前会话的模型/帮手串过去。
 * @param {string} sessionId 目标会话
 * @param {{messageHistory?: Array, model?: string, useTools?: boolean, enabledTools?: Array,
 *          agentId?: string|null, temperature?: number, topP?: number,
 *          activeCompaction?: object|null, workdir?: string|null,
 *          workdirAgentId?: string|null}} snapshot
 * @returns {Promise<boolean>} 是否写盘成功
 */
export async function persistSessionState(sessionId, snapshot = {}) {
  if (!sessionId) return false;
  await init();
  const target = await idb.getSession(sessionId);
  if (!target) {
    logger.warn('[SessionStore] persistSessionState cannot find session:', sessionId);
    return false;
  }

  const { messageHistory, model, useTools, enabledTools, agentId, temperature, topP, activeCompaction, workdir, workdirAgentId } = snapshot;
  if (model !== undefined) target.model = model;
  if (useTools !== undefined) target.useTools = useTools;
  if (enabledTools !== undefined) target.enabledTools = [...enabledTools];
  if (agentId !== undefined) target.agentId = agentId || null;
  if (temperature !== undefined) target.temperature = temperature;
  if (topP !== undefined) target.topP = topP;
  if (activeCompaction !== undefined) target.contextCompaction = activeCompaction || undefined;
  // 跨会话接力时目标会话的目录绑定不能丢（否则会拿到面板当前会话的目录）
  if (workdir !== undefined) target.workdir = workdir || null;
  if (workdirAgentId !== undefined) target.workdirAgentId = workdirAgentId || null;
  if (messageHistory !== undefined) target.messageHistory = mergeMessageHistory(
    Array.isArray(target.messageHistory) ? target.messageHistory : [],
    serializeMessageHistory(messageHistory),
  );

  target.updatedAt = new Date().toISOString();
  return idb.putSession(target);
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
    title: t('session.newSession'),
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
    // 新建会话不绑定目录：跟随代理默认
    workdir: null,
    workdirAgentId: null,
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
      title: sessionData.title || t('session.importedSession'),
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
        messageId: msg.messageId || undefined,
        timestamp: msg.timestamp || undefined,
      })),
      scrollPosition: 0,
      createdAt: sessionData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: Date.now() + createdSessions.length,
      isGenerating: false,
      lastExecutionLog: [],
      // 导入的第三方路径不应直接生效：显式置空，需用户在本机重新选择
      workdir: null,
      workdirAgentId: null,
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
    messageId: message.messageId || undefined,
    timestamp: message.timestamp || undefined,
    contextBubbles: message.contextBubbles || undefined,
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

  // 并发化：保存当前会话与读取目标会话互相独立，同时发起。
  // 红线保留：saveCurrentSession 仍是第一个动作（读旧 state 保存），
  // 且所有 state 赋值都在 Promise.all 完成后执行；默认 Agent 的全局模型
  // 配置读取也无副作用，一并提前发起（结果仍在后文分支中应用）。
  const savePromise = saveCurrentSession();
  const globalConfigPromise = chrome.storage.local.get(['modelName', 'temperature', 'topP']).catch(() => ({}));

  const [targetSession] = await Promise.all([idb.getSession(sessionId), savePromise]);
  if (!targetSession) {
    logger.error('[SessionStore] find not  to session:', sessionId);
    return false;
  }

  await idb.setActiveSessionId(sessionId);

  state.activeSessionId = sessionId;
  state.messageHistory = targetSession.messageHistory || [];
  // 恢复会话级上下文压缩记录（无则置 null）
  state.activeCompaction = targetSession.contextCompaction || null;
  // 会话切换时从会话恢复 model/temperature
  // 如果会话绑定了 Agent，优先使用 Agent 配置；否则使用会话存储的值
  state.currentModel = targetSession.model || state.currentModel;
  state.temperature = targetSession.temperature !== undefined ? targetSession.temperature : state.temperature;
  state.topP = targetSession.topP !== undefined ? targetSession.topP : state.topP;
  state.useTools = targetSession.useTools !== undefined ? targetSession.useTools : state.useTools;
  state.activeAgentId = targetSession.agentId || null;
  // 会话级工作目录：只恢复目标会话自己的绑定，不触碰代理全局 workdir。
  // 绑定是否生效由 resolveWorkdirForSession 判定（代理不匹配时回落默认，记录保留）
  state.sessionWorkdir = targetSession.workdir || null;
  state.workdirAgentId = targetSession.workdirAgentId || null;
  // 面板缓存按会话维度失效：$ 文件选择器/目录面板下次取值会重新按本会话解析
  try {
    const { resetWorkspaceRoot } = await import('../side_panel/workspace-manager.js');
    resetWorkspaceRoot();
  } catch (e) {
    logger.warn('[SessionStore] reset workspace root failed:', e);
  }
  try {
    document.dispatchEvent(new CustomEvent('session-workdir-changed', {
      detail: { sessionId, workdir: state.sessionWorkdir, agentId: state.workdirAgentId },
    }));
  } catch { /* 非 UI 上下文（background）没有 document */ }
  // 持久化当前智能体 ID，避免刷新后丢失
  if (targetSession.agentId) {
    chrome.storage.local.set({ activeAssistantId: targetSession.agentId });
  } else {
    chrome.storage.local.remove('activeAssistantId');
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
    // 注：该读取已随切换流程并行发起（见函数开头），此处仅应用结果
    const global = await globalConfigPromise;
    if (global.modelName) state.currentModel = global.modelName;
    if (global.temperature !== undefined) state.temperature = global.temperature;
    if (global.topP !== undefined) state.topP = global.topP;
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
    logger.debug('[SessionStore] detected expiredperiod  isGenerating mark,async cleanup:', sessionId);
    (async () => {
      try {
        const session = await idb.getSession(sessionId);
        if (session) {
          session.isGenerating = false;
          await idb.putSession(session);
        }
      } catch (e) {
        logger.warn('[SessionStore] cleanup expired isGenerating mark failed:', e);
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

  // 同步清理该会话的文档图片快照中转存储（失败不阻断删除）
  try { await removeDocImageSnapshot(sessionId); } catch { /* 中转存储清理失败不阻断删除 */ }

  await idb.deleteSession(sessionId);

  // 清理该会话的 scrollPosition 存储，防止泄露
  chrome.storage.local.remove('scrollPosition_' + sessionId);

  // 同步清理该会话的 ReAct checkpoint
  await cleanupCheckpointForSession(sessionId);

  // 通知代理端删除会话目录绑定（注册表可回收，避免删会话后留下永久授权）
  // 失败不阻断删除：代理端有剪枝与过期兜底
  unbindSessionWorkdirRemote(sessionId).catch((e) => {
    logger.debug('[SessionStore] unbind session workdir failed:', e?.message || e);
  });
  if (activeId === sessionId) {
    // 被删的就是当前会话：面板上的绑定同步清空（目录 chip 立即回落默认）
    state.sessionWorkdir = null;
    state.workdirAgentId = null;
    try { document.dispatchEvent(new CustomEvent('session-workdir-changed')); } catch { /* background 无 document */ }
  }

  // 清理该会话的收藏
  try {
    const allBookmarks = await idb.getAllBookmarks();
    const toDelete = allBookmarks.filter(b => b.sessionId === sessionId);
    for (const bm of toDelete) {
      await idb.deleteBookmark(bm.id);
    }
    if (toDelete.length > 0) {
      logger.info(`[SessionStore] cleaned ${toDelete.length} bookmark (session ${sessionId} deleted)`);
    }
  } catch (e) {
    logger.warn('[SessionStore] cleanup bookmarks failed:', e);
  }

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
 * 写入/清除会话级工作目录绑定（本会话显式切换 / 本会话恢复默认的唯一写入口）
 * 其他会话的任何操作不得调用本函数，否则并行会话的执行目录会被串改。
 * @param {string} sessionId 目标会话
 * @param {string|null} workdir 绑定目录（null = 恢复跟随默认）
 * @param {string|null} [workdirAgentId=null] 绑定时生效的代理 id
 * @returns {Promise<boolean>}
 */
export async function setSessionWorkdirBinding(sessionId, workdir, workdirAgentId = null) {
  if (!sessionId) return false;
  const target = await idb.getSession(sessionId);
  if (!target) {
    logger.warn('[SessionStore] setSessionWorkdirBinding cannot find session:', sessionId);
    return false;
  }
  target.workdir = workdir || null;
  target.workdirAgentId = workdir ? (workdirAgentId || null) : null;
  target.updatedAt = new Date().toISOString();

  // 目标就是面板当前会话时同步内存态，保证下一次提示词/执行立即对齐
  if (state.activeSessionId === sessionId) {
    state.sessionWorkdir = target.workdir;
    state.workdirAgentId = target.workdirAgentId;
  }

  const ok = await idb.putSession(target);
  try {
    document.dispatchEvent(new CustomEvent('session-workdir-changed', {
      detail: { sessionId, workdir: target.workdir, agentId: target.workdirAgentId },
    }));
  } catch { /* background 无 document */ }
  return ok;
}

/**
 * 重命名会话
 */
export async function renameSession(sessionId, newTitle) {
  const session = await idb.getSession(sessionId);
  if (!session) return false;
  session.title = newTitle;
  // 标记为手动命名，后续 saveCurrentSession/归档不再用首条消息自动覆盖标题
  session.titleManuallySet = true;
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

  // 手动重命名/分叉的会话保留其自定义标题，其余取首条用户消息
  const keepCustomTitle = currentSession.titleManuallySet || currentSession.forkMetadata;
  const firstUserMsg = state.messageHistory.find((m) => m.role === 'user');
  const title = keepCustomTitle
    ? currentSession.title || t('session.unnamedSession')
    : (firstUserMsg
      ? getTextContent(firstUserMsg.content).substring(0, 50).replace(/\n/g, ' ')
      : currentSession.title || t('session.unnamedSession'));

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
    title: archived.title || t('session.restoredSession'),
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
    // 从归档恢复的会话不绑定目录（归档未保存绑定）
    workdir: null,
    workdirAgentId: null,
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
 * 复制会话（完整快照或消息级截断，作为对话分支使用）
 * 完整继承源会话的消息历史与配置（模型/工具/Agent/温度等）
 * @param {string} sourceSessionId - 源会话 ID
 * @param {string|null} [upToMessageId=null] - 消息级分叉：截断到此 messageId（含）为止
 *   传入时仅复制到该消息（含），不传则完整复制全部历史
 * @returns {Promise<Object>} 新创建的会话
 */
export async function duplicateSession(sourceSessionId, upToMessageId = null) {
  await init();

  const source = await idb.getSession(sourceSessionId);
  if (!source) throw new Error(t('session.sourceNotFound'));

  const newSessionId = generateSessionId();
  const now = new Date().toISOString();

  // 消息级分叉：截断到指定 messageId（含）；找不到则回退完整复制
  let srcMessages = source.messageHistory || [];
  let isMessageFork = false;
  if (upToMessageId) {
    const idx = srcMessages.findIndex(m => m.messageId === upToMessageId);
    if (idx >= 0) {
      srcMessages = srcMessages.slice(0, idx + 1); // 含该消息
      isMessageFork = true;
    }
  }

  // 完整复制消息历史，深拷贝避免引用共享；重新生成 messageId 避免冲突
  const clonedMessages = srcMessages.map((msg) => ({
    ...msg,
    executionLog: Array.isArray(msg.executionLog) ? [...msg.executionLog] : [],
    contextBubbles: Array.isArray(msg.contextBubbles) ? [...msg.contextBubbles] : undefined,
    // 重新生成 messageId（遵循项目约定：所有消息必须有唯一 messageId）
    messageId: 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8),
  }));

  const newSession = {
    ...source,
    id: newSessionId,
    title: `${source.title || t('session.newSession')} - ${t('session.forkSuffix')}`,
    messageHistory: clonedMessages,
    // 重置运行时状态
    isGenerating: false,
    lastExecutionLog: [],
    scrollPosition: 0,
    createdAt: now,
    updatedAt: now,
    order: Date.now(),
    // 分支元数据：记录来源与分叉点
    forkMetadata: {
      sourceSessionId,
      forkedAt: now,
      ...(isMessageFork ? { upToMessageId } : {}),
    },
  };

  await idb.putSession(newSession);
  await idb.setActiveSessionId(newSessionId);

  return newSession;
}

/**
 * 为定时任务创建专属宿主会话（当任务绑定的会话被删除时自愈使用）
 * 与普通会话一致，仅额外标记 scheduledTaskId，便于识别 与 后续清理
 * @param {Object} task - 定时任务对象
 * @returns {Promise<Object>} 新会话对象
 */
export async function createScheduledSession(task) {
  await init();
  const sessionId = generateSessionId();
  const newSession = {
    id: sessionId,
    title: task.name || t('session.scheduledSession'),
    // 注意：定时任务自建会话不写入占位配置，null 表示"执行时继承全局"，
    // 避免 SW 环境下的默认值（state 占位）覆盖真实全局配置
    model: task.model || null,
    useTools: task.useTools != null ? task.useTools : null,
    enabledTools: null,
    agentId: task.agentId || null,
    temperature: task.temperature != null ? task.temperature : null,
    topP: task.topP != null ? task.topP : null,
    messageHistory: [],
    scrollPosition: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: Date.now(),
    isGenerating: false,
    lastExecutionLog: [],
    scheduledTaskId: task.id,
    // 定时任务新建宿主会话：目标会话未提供绑定则跟随默认
    workdir: task.workdir || null,
    workdirAgentId: task.workdir ? (task.workdirAgentId || null) : null,
  };

  await idb.putSession(newSession);
  return newSession;
}
