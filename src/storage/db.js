// storage/db.js - IndexedDB 封装层
// 提供 Promise 化的 IndexedDB 操作，支持 side panel 和 service worker 共享访问

const DB_NAME = 'ai-helper-db';
const DB_VERSION = 4;

// ReAct Checkpoint TTL：7 天
export const REACT_CHECKPOINT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// chrome.storage.local 中 checkpoint 的 key 前缀（后备存储）
// 当 IndexedDB 的 reactCheckpoints store 不可用时，使用 chrome.storage.local 作为可靠后备
const CHECKPOINT_KEY_PREFIX = 'react_checkpoint_';

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
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      // 关键：当其他连接（如 side_panel 持有的旧连接）触发版本变更时，
      // 主动关闭当前连接，避免阻塞 DB 升级。
      // 没有此处理会导致 SW 升级 DB 时被旧连接阻塞，reactCheckpoints store 无法创建，
      // 表现为 checkpoint 写入静默失败 → 恢复时"未找到 checkpoint"。
      db.onversionchange = (event) => {
        console.log('[IDB] 检测到 versionchange 事件，主动关闭当前连接以允许升级');
        try { event.target.close(); } catch (e) {}
        // 重置单例缓存，下次 getDB() 会重新打开
        dbPromise = null;
      };

      resolve(db);
    };

    request.onerror = (event) => {
      console.error('[IDB] 打开数据库失败:', event.target.error);
      reject(event.target.error);
    };

    // 处理被阻塞的升级（其他连接持有旧版本时触发）
    request.onblocked = () => {
      console.warn('[IDB] 数据库升级被阻塞（其他连接未关闭），等待重试...');
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
    console.log('[IDB] 数据库连接已重置');
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
        console.error(`[IDB] store "${storeName}" 不存在！当前 DB 版本: ${db.version}, store 列表: [${Array.from(db.objectStoreNames).join(', ')}]`);
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
        console.error(`[IDB] 创建事务失败 (${storeName}):`, e.message);
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
      const label = session.title || `会话 ${session.id?.slice(0, 8)}`;
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
    const sessions = all;
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
    console.warn('[Storage] chrome.storage.local 保存 checkpoint 失败:', e.message);
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
    console.warn('[Storage] IndexedDB 保存 checkpoint 失败（已降级到 chrome.storage.local）:', e.message);
  }

  if (!storageOk && !idbOk) {
    console.error('[Storage] checkpoint 保存完全失败：chrome.storage.local 和 IndexedDB 均不可用');
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
    console.warn('[Storage] chrome.storage.local 读取 checkpoint 失败:', e.message);
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
    console.warn('[Storage] chrome.storage.local 删除 checkpoint 失败:', e.message);
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
    console.warn('[Storage] chrome.storage.local 获取所有 checkpoint 失败:', e.message);
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
  console.log(`[IDB] 清理了 ${deleted} 个过期的 ReAct checkpoint`);
  return deleted;
}
