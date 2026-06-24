// storage/db.js - IndexedDB 封装层
// 提供 Promise 化的 IndexedDB 操作，支持 side panel 和 service worker 共享访问

const DB_NAME = 'ai-helper-db';
const DB_VERSION = 1;

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
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('[IDB] 打开数据库失败:', event.target.error);
      reject(event.target.error);
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
    console.log('[IDB] 数据库连接已重置');
  }
}

/**
 * 获取数据库实例（缓存单例）
 */
function getDB() {
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
function withStore(storeName, mode, callback, isRetry = false) {
  return getDB().then((db) => {
    return new Promise((resolve, reject) => {
      let settled = false;

      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);

      callback(store, (result) => {
        settled = true;
        resolve(result);
      });

      tx.oncomplete = () => {
        // 如果 callback 里直接调了 resolve，这里不重复操作
      };

      tx.onerror = (event) => {
        if (settled) return;
        const err = event.target.error || new Error(`Transaction error on ${storeName}`);
        console.error(`[IDB] 事务错误 (${storeName}):`, err);

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
 * 保存/更新会话（put = insert or update）
 */
export function putSession(session) {
  return withStore('sessions', 'readwrite', (store, resolve) => {
    const request = store.put(session);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

/**
 * 删除会话
 */
export function deleteSession(id) {
  return withStore('sessions', 'readwrite', (store, resolve) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

/**
 * 批量保存/更新多个会话
 */
export function putSessions(sessions) {
  return getDB().then((db) => {
    return new Promise((resolve) => {
      const tx = db.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      sessions.forEach((s) => store.put(s));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
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

// ==================== 搜索 ====================

/**
 * 从所有活跃会话中搜索消息
 * @param {string} sessionId - 限定会话 ID，null 表示搜索所有活跃会话
 * @returns {Promise<Array<{session: string, index: number, role: string, content: string}>>}
 */
export function searchActiveSessionsMessages(sessionId) {
  return getAllSessions().then((all) => {
    const sessions = sessionId ? all.filter((s) => s.id === sessionId) : all;
    const results = [];
    sessions.forEach((session) => {
      const label = session.title || `会话 ${session.id?.slice(0, 8)}`;
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
      const label = `[归档] ${session.title || `会话 ${session.id?.slice(0, 8)}`}`;
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
        console.log('[IDB] 已迁移活跃会话:', list.length, '条');
      }

      // 迁移归档会话
      if (result.conversationSessions?.sessions?.length > 0) {
        await replaceArchivedSessions(result.conversationSessions.sessions);
        migrated = true;
        console.log('[IDB] 已迁移归档会话:', result.conversationSessions.sessions.length, '条');
      }

      if (migrated) {
        // 清除 chrome.storage 中的大数据 key，保留其他配置
        chrome.storage.local.remove(['sessions', 'conversationSessions', 'chatHistory'], () => {
          console.log('[IDB] 已清理 chrome.storage.local 中的旧数据');
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
