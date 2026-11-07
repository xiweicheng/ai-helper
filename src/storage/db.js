import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

// storage/db.js - IndexedDB 封装层
// 提供 Promise 化的 IndexedDB 操作，支持 side panel 和 service worker 共享访问

registerTranslations('zh', {
  db: {
    sessionLabel: '会话 {id}',
    archivedLabel: '[归档] {label}',
  },
});

registerTranslations('en', {
  db: {
    sessionLabel: 'Session {id}',
    archivedLabel: '[Archived] {label}',
  },
});

const DB_NAME = 'ai-helper-db';
// v8：新增 sessionIndex（会话摘要），会话列表只读摘要，不再随「全部会话的消息总量」线性变慢
const DB_VERSION = 8;

// ReAct Checkpoint TTL：7 天
export const REACT_CHECKPOINT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// chrome.storage.local 中 checkpoint 的 key 前缀（后备存储）
// 当 IndexedDB 的 reactCheckpoints store 不可用时，使用 chrome.storage.local 作为可靠后备
const CHECKPOINT_KEY_PREFIX = 'react_checkpoint_';

/**
 * 会话摘要：整条记录去掉 messageHistory，其余字段原样保留。
 * 只丢最占体积的那个数组——列表渲染、启动恢复用到的标量字段（标题/order/agentId/
 * 工作目录绑定/model 等）全部保留，将来新增标量字段也不会漏。
 */
export function buildSessionSummary(session) {
  if (!session || !session.id) return null;
  const { messageHistory, ...rest } = session;
  return {
    ...rest,
    messageCount: Array.isArray(messageHistory) ? messageHistory.length : 0,
  };
}

/**
 * 获取数据库连接（单例）
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 活跃会话存储（keyPath: id）
      if (!db.objectStoreNames.contains('sessions')) {
        const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' });
        sessionsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 活跃会话 ID（单条记录，keyPath: key）
      if (!db.objectStoreNames.contains('activeSession')) {
        db.createObjectStore('activeSession', { keyPath: 'key' });
      }

      // 归档会话存储（keyPath: id）
      if (!db.objectStoreNames.contains('archivedSessions')) {
        const archiveStore = db.createObjectStore('archivedSessions', { keyPath: 'id' });
        archiveStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // UI 原型存储（keyPath: id）
      if (!db.objectStoreNames.contains('uiPrototypes')) {
        const prototypeStore = db.createObjectStore('uiPrototypes', { keyPath: 'id' });
        prototypeStore.createIndex('createdAt', 'createdAt', { unique: false });
        prototypeStore.createIndex('sessionId', 'sessionId', { unique: false });
      }

      // Token 使用统计存储（keyPath: id）
      if (!db.objectStoreNames.contains('tokenStats')) {
        const tokenStatsStore = db.createObjectStore('tokenStats', { keyPath: 'id' });
        tokenStatsStore.createIndex('sessionId', 'sessionId', { unique: false });
        tokenStatsStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // ReAct Checkpoint 存储（keyPath: sessionId）—— 用于任务中断后续接
      if (!db.objectStoreNames.contains('reactCheckpoints')) {
        const checkpointStore = db.createObjectStore('reactCheckpoints', { keyPath: 'sessionId' });
        checkpointStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 消息收藏存储（keyPath: id）
      if (!db.objectStoreNames.contains('bookmarks')) {
        const bookmarksStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
        bookmarksStore.createIndex('sessionId', 'sessionId', { unique: false });
        bookmarksStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 定时任务存储（keyPath: id）
      if (!db.objectStoreNames.contains('scheduledTasks')) {
        const tasksStore = db.createObjectStore('scheduledTasks', { keyPath: 'id' });
        tasksStore.createIndex('nextRunAt', 'nextRunAt', { unique: false });
        tasksStore.createIndex('enabled', 'enabled', { unique: false });
      }

      // 待办事项存储（keyPath: id）—— 侧边栏待办面板，全局一份
      if (!db.objectStoreNames.contains('todos')) {
        const todosStore = db.createObjectStore('todos', { keyPath: 'id' });
        todosStore.createIndex('status', 'status', { unique: false });
        todosStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 会话摘要（keyPath: id）—— 列表页只读这里，避免把全部会话的消息历史都反序列化一遍。
      // 与 sessions 用同一个事务双写，摘要永远和正文同源，不会各自漂移。
      if (!db.objectStoreNames.contains('sessionIndex')) {
        db.createObjectStore('sessionIndex', { keyPath: 'id' });
      }

      // 老库一次性回填：用游标逐条投影，绝不 store.getAll() 一次性把历史读进内存。
      // 只在升级到 v8 时跑一次，之后摘要由双写维护。
      if (event.oldVersion < 8) {
        const tx = event.target.transaction;
        const indexStore = tx.objectStore('sessionIndex');
        tx.objectStore('sessions').openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) return;
          const summary = buildSessionSummary(cursor.value);
          if (summary) indexStore.put(summary);
          cursor.continue();
        };
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      // 关键：当其他连接（如 side_panel 持有的旧连接）触发版本变更时，
      // 主动关闭当前连接，避免阻塞 DB 升级。
      // 没有此处理会导致 SW 升级 DB 时被旧连接阻塞，reactCheckpoints store 无法创建，
      // 表现为 checkpoint 写入静默失败 → 恢复时"未找到 checkpoint"。
      db.onversionchange = (event) => {
        logger.debug('[IDB] detected versionchange event,maindynamicclosecurrent connection as allows upgrade');
        try { event.target.close(); } catch (e) {}
        // 重置单例缓存，下次 getDB() 会重新打开
        dbPromise = null;
      };

      resolve(db);
    };

    request.onerror = (event) => {
      logger.error('[IDB] opendatabase failed:', event.target.error);
      reject(event.target.error);
    };

    // 处理被阻塞的升级（其他连接持有旧版本时触发）
    request.onblocked = () => {
      logger.warn('[IDB] databaseupgrade blocked (other connections notclose),waitingretry...');
      // 不直接 reject，让调用方稍后重试 getDB() 时自然获得新连接
    };
  });
}

let dbPromise = null;

/**
 * 重置数据库连接缓存（用于 Service Worker 重启后恢复）
 */
function resetDBConnection() {
  if (dbPromise) {
    dbPromise = null;
    logger.debug('[IDB] databaseconnectionreset');
  }
}

/**
 * 获取数据库实例（缓存单例）
 */
export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB();
  }
  return dbPromise;
}

/**
 * 通用事务包装器（带连接恢复重试）
 * @param {string} storeName - objectStore 名称
 * @param {'readonly'|'readwrite'} mode
 * @param {function(IDBObjectStore, function): void} callback
 * @param {boolean} [isRetry=false] - 是否为重试调用（内部使用）
 * @returns {Promise<any>}
 */
export function withStore(storeName, mode, callback, isRetry = false) {
  return getDB().then((db) => {
    return new Promise((resolve, reject) => {
      let resolvedValue = null;
      let settled = false;

      // 检查 store 是否存在；不存在时强制重置连接并重试（触发 DB 升级创建缺失的 store）
      // 这是 "reactCheckpoints store 不存在导致 checkpoint 静默失败" 的根因修复
      if (!db.objectStoreNames.contains(storeName)) {
        logger.error(`[IDB] store "${storeName}" not found!current DB version: ${db.version}, store  column table: [${Array.from(db.objectStoreNames).join(', ')}]`);
        if (!isRetry) {
          settled = true;
          // 强制重置连接，下次 getDB() 会重新打开并触发 onupgradeneeded（如果版本有变化）
          // 但如果 DB 已经是最新版本但 store 仍然缺失（连接陈旧），需要先关闭再重开
          try { db.close(); } catch (e) {}
          resetDBConnection();
          // 延迟重试，给 DB 重开一点时间
          setTimeout(() => {
            withStore(storeName, mode, callback, true)
              .then(resolve)
              .catch(reject);
          }, 50);
          return;
        } else {
          settled = true;
          reject(new Error(`Store "${storeName}" does not exist in database (version ${db.version})`));
          return;
        }
      }

      let tx;
      try {
        tx = db.transaction(storeName, mode);
      } catch (e) {
        // transaction() 可能抛出同步异常（如连接已关闭）
        logger.error(`[IDB] create transaction failed (${storeName}):`, e.message);
        if (!isRetry) {
          settled = true;
          resetDBConnection();
          setTimeout(() => {
            withStore(storeName, mode, callback, true)
              .then(resolve)
              .catch(reject);
          }, 50);
          return;
        } else {
          settled = true;
          reject(e);
          return;
        }
      }
      const store = tx.objectStore(storeName);

      // 回调中的 resolve 仅保存结果，实际 resolve 在 tx.oncomplete 中执行
      // 确保事务已提交后再返回，防止调用方读取到未持久化的数据
      callback(store, (result) => {
        resolvedValue = result;
      });

      tx.oncomplete = () => {
        if (!settled) {
          settled = true;
          resolve(resolvedValue);
        }
      };

      tx.onerror = (event) => {
        if (settled) return;
        settled = true;
        const err = event.target.error || new Error(`Transaction error on ${storeName}`);
        logger.error(`[IDB] transaction error (${storeName}):`, err);

        if (!isRetry) {
          // Service Worker 重启后连接可能已关闭，重置并重试一次
          resetDBConnection();
          withStore(storeName, mode, callback, true)
            .then(resolve)
            .catch(reject);
        } else {
          reject(err);
        }
      };

      tx.onabort = () => {
        if (settled) return;
        settled = true;

        if (!isRetry) {
          resetDBConnection();
          withStore(storeName, mode, callback, true)
            .then(resolve)
            .catch(reject);
        } else {
          reject(new Error(`Transaction aborted on ${storeName}`));
        }
      };
    });
  });
}

// ==================== Sessions CRUD ====================

/**
 * 获取所有活跃会话
 */
export function getAllSessions() {
  return withStore('sessions', 'readonly', (store, resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

/**
 * 获取所有会话摘要（不含 messageHistory）。
 * 列表页用它：读库成本只跟「会话条数」有关，跟历史消息总量无关。
 */
export function getAllSessionSummaries() {
  return withStore('sessionIndex', 'readonly', (store, resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    // 返回 null 表示「摘要不可用」，由调用方回退到全量读：
    // 绝不能返回空数组——那会让用户看到空会话列表
    request.onerror = () => resolve(null);
  });
}

/**
 * 在同一个事务里同时写 sessions 与 sessionIndex —— 原子性保证摘要不会跟正文分叉。
 * 连接/事务异常时重置连接重试一次（与 withStore 的处理保持一致）。
 */
function withSessionWrite(mutator, isRetry = false) {
  return getDB().then((db) => {
    let tx;
    try {
      tx = db.transaction(['sessions', 'sessionIndex'], 'readwrite');
    } catch (e) {
      logger.error('[IDB] create session transaction failed:', e.message);
      if (isRetry) return false;
      resetDBConnection();
      return new Promise((resolve) => setTimeout(() => resolve(withSessionWrite(mutator, true)), 50));
    }
    try {
      mutator(tx.objectStore('sessions'), tx.objectStore('sessionIndex'));
    } catch (e) {
      logger.error('[IDB] write session stores failed:', e.message);
      // 已排队但未提交的写请求必须作废：不作废会出现「正文写成功、摘要没写」的分叉，
      // 列表里就会显示陈旧的标题/条数。abort 后再返回，保证两个 store 同生共死。
      try { tx.abort(); } catch (e2) {}
      return false;
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      // onerror 之后还会跟一个 onabort，只有一个能生效
      const retryOrFail = () => {
        if (isRetry) return finish(false);
        settled = true;
        // 连接可能已被 Service Worker 重启关闭：与 withStore 一致，重置后重试一次
        resetDBConnection();
        withSessionWrite(mutator, true).then(resolve, () => resolve(false));
      };
      tx.oncomplete = () => finish(true);
      tx.onerror = retryOrFail;
      // abort 也要收口，否则调用方永远等不到结果
      tx.onabort = retryOrFail;
    });
  });
}

/**
 * 获取单个会话
 */
export function getSession(id) {
  return withStore('sessions', 'readonly', (store, resolve) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

/**
 * 从会话的 messageHistory 中直接删除指定消息（不依赖 saveCurrentSession 的完整保存流程）
 * @param {string} sessionId
 * @param {string} messageId
 * @returns {Promise<boolean>}
 */
export async function deleteMessageFromSession(sessionId, messageId) {
  if (!sessionId || !messageId) return false;
  try {
    const session = await getSession(sessionId);
    if (!session || !session.messageHistory) return false;

    const idx = session.messageHistory.findIndex(
      msg => (msg.messageId || msg.id) === messageId
    );
    if (idx === -1) return false;

    session.messageHistory.splice(idx, 1);
    return await putSession(session);
  } catch (e) {
    logger.error('[DB] deleteMessageFromSession failed:', e);
    return false;
  }
}

/**
 * 保存/更新会话（put = insert or update）
 */
export function putSession(session) {
  return withSessionWrite((sessions, index) => {
    sessions.put(session);
    const summary = buildSessionSummary(session);
    if (summary) index.put(summary);
  });
}

/**
 * 删除会话
 */
export function deleteSession(id) {
  return withSessionWrite((sessions, index) => {
    sessions.delete(id);
    // 摘要必须同事务删掉：漏删会让列表里出现一条点不开的幽灵会话
    index.delete(id);
  });
}

/**
 * 批量保存/更新多个会话
 */
export function putSessions(sessionsList) {
  return withSessionWrite((sessions, index) => {
    sessionsList.forEach((s) => {
      sessions.put(s);
      const summary = buildSessionSummary(s);
      if (summary) index.put(summary);
    });
  });
}

// ==================== Active Session ID ====================

/**
 * 获取当前活跃会话 ID
 */
export function getActiveSessionId() {
  return withStore('activeSession', 'readonly', (store, resolve) => {
    const request = store.get('active');
    request.onsuccess = () => resolve(request.result?.sessionId || null);
    request.onerror = () => resolve(null);
  });
}

/**
 * 设置当前活跃会话 ID
 */
export function setActiveSessionId(sessionId) {
  return withStore('activeSession', 'readwrite', (store, resolve) => {
    const request = store.put({ key: 'active', sessionId });
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

// ==================== Archived Sessions CRUD ====================

/**
 * 获取所有归档会话
 */
export function getAllArchivedSessions() {
  return withStore('archivedSessions', 'readonly', (store, resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

/**
 * 保存归档会话
 */
export function putArchivedSession(session) {
  return withStore('archivedSessions', 'readwrite', (store, resolve) => {
    const request = store.put(session);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

/**
 * 删除归档会话
 */
export function deleteArchivedSession(id) {
  return withStore('archivedSessions', 'readwrite', (store, resolve) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

/**
 * 清空并批量写入归档会话（用于截断超出 20 条的场景）
 */
export function replaceArchivedSessions(sessions) {
  return getDB().then((db) => {
    return new Promise((resolve) => {
      const tx = db.transaction('archivedSessions', 'readwrite');
      const store = tx.objectStore('archivedSessions');

      // 清空
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        // 批量写入
        sessions.forEach((s) => store.put(s));
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  });
}

// ==================== UI Prototypes CRUD ====================

/**
 * 保存 UI 原型
 */
export function saveUiPrototype(prototype) {
  const now = Date.now();
  const data = {
    ...prototype,
    createdAt: prototype.createdAt || now,
    updatedAt: now
  };
  return withStore('uiPrototypes', 'readwrite', (store, resolve) => {
    const request = store.put(data);
    request.onsuccess = () => resolve(data);
    request.onerror = () => resolve(null);
  });
}

/**
 * 获取单个 UI 原型
 */
export function getUiPrototype(id) {
  return withStore('uiPrototypes', 'readonly', (store, resolve) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

/**
 * 获取所有 UI 原型（按创建时间倒序）
 */
export function listUiPrototypes(sessionId = null) {
  return withStore('uiPrototypes', 'readonly', (store, resolve) => {
    const request = store.getAll();
    request.onsuccess = () => {
      let results = request.result || [];
      if (sessionId) {
        results = results.filter(p => p.sessionId === sessionId);
      }
      results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      resolve(results);
    };
    request.onerror = () => resolve([]);
  });
}

/**
 * 删除 UI 原型
 */
export function deleteUiPrototype(id) {
  return withStore('uiPrototypes', 'readwrite', (store, resolve) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

// ==================== 搜索 ====================

/**
 * 从所有活跃会话中搜索消息
 * @param {string} sessionId - 限定会话 ID，null 表示搜索所有活跃会话
 * @returns {Promise<Array<{session: string, index: number, role: string, content: string}>>}
 */
export function searchActiveSessionsMessages(sessionId) {
  if (sessionId) {
    // 指定 sessionId 时使用 O(1) 主键查询，避免全量加载所有会话
    return getSession(sessionId).then((session) => {
      if (!session) return [];
      const label = session.title || t('db.sessionLabel', { id: session.id?.slice(0, 8) });
      return (session.messageHistory || []).filter(msg => msg.content).map((msg, idx) => ({
        session: session.id,
        sessionLabel: label,
        index: idx,
        role: msg.role,
        content: msg.content,
      }));
    });
  }
  return getAllSessions().then((all) => {
    // 归档会话对用户已隐藏（只在归档区可见），搜索里再挖得出来就自相矛盾了
    const sessions = all.filter((s) => !s.archivedAt);
    const results = [];
    sessions.forEach((session) => {
      const label = session.title || t('db.sessionLabel', { id: session.id?.slice(0, 8) });
      (session.messageHistory || []).forEach((msg, idx) => {
        if (msg.content) {
          results.push({
            session: session.id,
            sessionLabel: label,
            index: idx,
            role: msg.role,
            content: msg.content,
          });
        }
      });
    });
    return results;
  });
}

/**
 * 获取所有归档会话的消息
 * @returns {Promise<Array<{session: string, index: number, role: string, content: string}>>}
 */
export function getArchivedSessionsMessages() {
  return getAllArchivedSessions().then((archiveSessions) => {
    const results = [];
    archiveSessions.forEach((session) => {
      const label = t('db.archivedLabel', { label: session.title || t('db.sessionLabel', { id: session.id?.slice(0, 8) }) });
      (session.messages || []).forEach((msg, idx) => {
        if (msg.content) {
          results.push({
            session: session.id,
            sessionLabel: label,
            index: idx,
            role: msg.role,
            content: msg.content,
          });
        }
      });
    });
    return results;
  });
}

// ==================== 数据迁移 ====================

/**
 * 从 chrome.storage.local 迁移数据到 IndexedDB
 * 迁移后清除 chrome.storage.local 中的大数据 key
 * @returns {Promise<boolean>}
 */
export function migrateFromChromeStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['sessions', 'conversationSessions'], async (result) => {
      let migrated = false;

      // 迁移活跃会话
      if (result.sessions?.list?.length > 0) {
        const { list, activeSessionId } = result.sessions;
        await putSessions(list);
        if (activeSessionId) {
          await setActiveSessionId(activeSessionId);
        }
        migrated = true;
        logger.debug('[IDB] migrated activesession:', list.length, '');
      }

      // 迁移归档会话
      if (result.conversationSessions?.sessions?.length > 0) {
        await replaceArchivedSessions(result.conversationSessions.sessions);
        migrated = true;
        logger.debug('[IDB] migrated archivesession:', result.conversationSessions.sessions.length, '');
      }

      if (migrated) {
        // 清除 chrome.storage 中的大数据 key，保留其他配置
        chrome.storage.local.remove(['sessions', 'conversationSessions', 'chatHistory'], () => {
          logger.debug('[IDB] cleaned chrome.storage.local  olddata');
        });
      }

      resolve(migrated);
    });
  });
}

/**
 * 检查 IndexedDB 是否有数据，没有则尝试从 chrome.storage 迁移
 * @returns {Promise<void>}
 */
export async function ensureMigration() {
  const sessions = await getAllSessions();
  if (sessions.length > 0) return; // 已有数据

  const activeId = await getActiveSessionId();
  if (activeId) return; // 已有活跃会话标记

  // 尝试迁移
  await migrateFromChromeStorage();
}

// ==================== React Checkpoints CRUD ====================
//
// checkpoint 数据结构：
// {
//   sessionId: string,           // 主键
//   currentMessages: Array,      // 完整的 API 消息数组（含 tool_calls/tool 消息对）
//   executionLog: Array,         // 执行日志
//   iteration: number,           // 当前迭代次数
//   globalIteration: { value },  // 全局迭代计数
//   subtaskPlan: Object|null,    // 任务拆解计划
//   currentSubtaskIndex: number|null,  // 当前子任务索引
//   totalReflectionRounds: number,     // 反思轮数
//   model: string,               // 使用的模型
//   apiParams: Object,           // API 参数
//   taskContext: Object|null,    // 任务上下文（子任务/子代理）
//   tabId: number|null,          // 标签页 ID
//   callId: string|null,         // 调用 ID
//   interruptedReason: string,   // 中断原因
//   createdAt: number,           // 创建时间戳
//   updatedAt: number,           // 更新时间戳
// }

/**
 * 保存/更新 ReAct checkpoint
 * 采用双写策略：IndexedDB + chrome.storage.local（后备）
 * 当 IndexedDB 的 reactCheckpoints store 不存在或写入失败时，chrome.storage.local 确保数据不丢失
 * @param {Object} checkpoint - 必须包含 sessionId
 * @returns {Promise<boolean>}
 */
export async function saveReactCheckpoint(checkpoint) {
  if (!checkpoint?.sessionId) return false;
  const now = Date.now();
  const data = {
    ...checkpoint,
    updatedAt: now,
    createdAt: checkpoint.createdAt || now,
  };
  const key = CHECKPOINT_KEY_PREFIX + checkpoint.sessionId;

  // 策略：先写 chrome.storage.local（可靠），再尝试 IndexedDB（性能优化）
  // 这样即使 IndexedDB 完全不可用，checkpoint 也不会丢失
  let storageOk = false;
  try {
    await chrome.storage.local.set({ [key]: data });
    storageOk = true;
  } catch (e) {
    logger.warn('[Storage] chrome.storage.local save checkpoint failed:', e.message);
  }

  // 同时写入 IndexedDB（如果可用），供 getAllReactCheckpoints 高效查询
  let idbOk = false;
  try {
    idbOk = await withStore('reactCheckpoints', 'readwrite', (store, resolve) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  } catch (e) {
    // IndexedDB 不可用（store 不存在等），不影响主流程
    logger.warn('[Storage] IndexedDB save checkpoint failed (downgraded to chrome.storage.local):', e.message);
  }

  if (!storageOk && !idbOk) {
    logger.error('[Storage] checkpoint save complete failed:chrome.storage.local  and  IndexedDB averagenon- with ');
    return false;
  }
  return true;
}

/**
 * 获取指定会话的 ReAct checkpoint
 * 优先从 IndexedDB 读取，不存在时降级到 chrome.storage.local
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
export async function getReactCheckpoint(sessionId) {
  if (!sessionId) return null;

  // 优先尝试 IndexedDB
  try {
    const result = await withStore('reactCheckpoints', 'readonly', (store, resolve) => {
      const request = store.get(sessionId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
    if (result) return result;
  } catch (e) {
    // IndexedDB 不可用，继续尝试 chrome.storage.local
  }

  // 降级：从 chrome.storage.local 读取
  try {
    const key = CHECKPOINT_KEY_PREFIX + sessionId;
    const data = await chrome.storage.local.get(key);
    return data[key] || null;
  } catch (e) {
    logger.warn('[Storage] chrome.storage.local read checkpoint failed:', e.message);
    return null;
  }
}

/**
 * 删除指定会话的 ReAct checkpoint
 * 同时从 IndexedDB 和 chrome.storage.local 中删除
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
export async function deleteReactCheckpoint(sessionId) {
  if (!sessionId) return false;
  let ok = false;

  // 从 chrome.storage.local 删除
  try {
    const key = CHECKPOINT_KEY_PREFIX + sessionId;
    await chrome.storage.local.remove(key);
    ok = true;
  } catch (e) {
    logger.warn('[Storage] chrome.storage.local delete checkpoint failed:', e.message);
  }

  // 从 IndexedDB 删除
  try {
    await withStore('reactCheckpoints', 'readwrite', (store, resolve) => {
      const request = store.delete(sessionId);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
    ok = true;
  } catch (e) {
    // IndexedDB 不可用，不影响
  }

  return ok;
}

/**
 * 获取所有 ReAct checkpoint（用于 TTL 清理和诊断）
 * 合并 IndexedDB 和 chrome.storage.local 中的结果
 * @returns {Promise<Array>}
 */
export async function getAllReactCheckpoints() {
  // 从 chrome.storage.local 获取所有 checkpoint
  let storageCheckpoints = [];
  try {
    const all = await chrome.storage.local.get(null);
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(CHECKPOINT_KEY_PREFIX) && value?.sessionId) {
        storageCheckpoints.push(value);
      }
    }
  } catch (e) {
    logger.warn('[Storage] chrome.storage.local get all checkpoint failed:', e.message);
  }

  // 从 IndexedDB 获取
  let idbCheckpoints = [];
  try {
    idbCheckpoints = await withStore('reactCheckpoints', 'readonly', (store, resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch (e) {
    // IndexedDB 不可用
  }

  // 合并去重（以 sessionId 为键，IndexedDB 优先）
  const merged = new Map();
  for (const cp of storageCheckpoints) {
    merged.set(cp.sessionId, cp);
  }
  for (const cp of idbCheckpoints) {
    merged.set(cp.sessionId, cp);
  }
  return Array.from(merged.values());
}

/**
 * 清理过期的 ReAct checkpoint（TTL: 7 天）
 * 应在 SW 启动时调用
 * @returns {Promise<number>} 清理的条数
 */
export async function cleanupExpiredReactCheckpoints() {
  const all = await getAllReactCheckpoints();
  const now = Date.now();
  const expired = all.filter(c => (c.updatedAt || 0) < now - REACT_CHECKPOINT_TTL_MS);
  if (expired.length === 0) return 0;

  let deleted = 0;
  for (const cp of expired) {
    const ok = await deleteReactCheckpoint(cp.sessionId);
    if (ok) deleted++;
  }
  logger.debug(`[IDB] cleanup ${deleted} expired ReAct checkpoint`);
  return deleted;
}

// ==================== Bookmarks CRUD ====================

/**
 * 获取所有收藏
 * @returns {Promise<Array>}
 */
export function getAllBookmarks() {
  return withStore('bookmarks', 'readonly', (store, resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

/**
 * 保存收藏
 * @param {Object} bookmark - { id, sessionId, messageId, content, sessionTitle, createdAt, pinned }
 * @returns {Promise<boolean>}
 */
export function putBookmark(bookmark) {
  return withStore('bookmarks', 'readwrite', (store, resolve) => {
    const request = store.put(bookmark);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

/**
 * 删除收藏
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export function deleteBookmark(id) {
  return withStore('bookmarks', 'readwrite', (store, resolve) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

/**
 * 更新收藏的置顶状态
 * @param {string} id
 * @param {boolean} pinned
 * @returns {Promise<boolean>}
 */
export function updateBookmarkPin(id, pinned) {
  return withStore('bookmarks', 'readwrite', (store, resolve) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const bm = getReq.result;
      if (!bm) { resolve(false); return; }
      bm.pinned = pinned;
      const putReq = store.put(bm);
      putReq.onsuccess = () => resolve(true);
      putReq.onerror = () => resolve(false);
    };
    getReq.onerror = () => resolve(false);
  });
}

// ==================== Scheduled Tasks CRUD ====================

/**
 * 获取单个定时任务
 */
export function getScheduledTask(id) {
  return withStore('scheduledTasks', 'readonly', (store, resolve) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

/**
 * 获取所有定时任务
 */
export function getAllScheduledTasks() {
  return withStore('scheduledTasks', 'readonly', (store, resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

/**
 * 保存/更新定时任务（put = insert or update）
 */
export function putScheduledTask(task) {
  return withStore('scheduledTasks', 'readwrite', (store, resolve) => {
    const request = store.put(task);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

/**
 * 删除定时任务
 */
export function deleteScheduledTask(id) {
  return withStore('scheduledTasks', 'readwrite', (store, resolve) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

// ==================== Todo CRUD ====================

/**
 * 获取全部待办
 */
export function getAllTodos() {
  return withStore('todos', 'readonly', (store, resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

/**
 * 保存/更新单条待办（put = insert or update）
 */
export function putTodo(todo) {
  return withStore('todos', 'readwrite', (store, resolve) => {
    const request = store.put(todo);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

/**
 * 批量保存待办（拖拽重排等场景，同一个事务内写完）
 * @param {Array<Object>} todos
 */
export function putTodos(todos) {
  if (!Array.isArray(todos) || todos.length === 0) return Promise.resolve(true);
  return withStore('todos', 'readwrite', (store, resolve) => {
    todos.forEach(todo => store.put(todo));
    resolve(true);
  });
}

/**
 * 删除单条待办
 */
export function deleteTodo(id) {
  return withStore('todos', 'readwrite', (store, resolve) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

/**
 * 批量删除待办（清除已完成）
 * @param {Array<string>} ids
 */
export function deleteTodos(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return Promise.resolve(true);
  return withStore('todos', 'readwrite', (store, resolve) => {
    ids.forEach(id => store.delete(id));
    resolve(true);
  });
}
