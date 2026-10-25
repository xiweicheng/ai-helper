// queue-attachment-store.js - 排队条目的"重"上下文（图片 / 文件）持久化
//
// 为什么单独存 IndexedDB，而不是跟条目一起放 chrome.storage.local：
//   1. 队列要求"状态转换同步立即落盘"，而 chrome.storage.local 是整对象覆盖写。
//      图片 base64 动辄数百 KB，排 20 条时每次入队/出队都要重写数 MB，面板会明显卡顿。
//   2. 附件体积不受控，混在队列状态里会让"崩溃只丢措辞不丢条目"的加固变得不可靠。
//
// 为什么用独立数据库，不复用 storage/db.js：
//   那边有版本升级 + 连接恢复的复杂逻辑（DB_VERSION 变更会牵动 SW 与面板两条连接），
//   为存附件而提升它的版本风险大于收益。附件生命周期独立（条目终结即可删），
//   独立库反而便于整体清理。
//
// 失败策略：任何异常都不向上抛。附件存不进去时由调用方退化为"本实例内存副本"，
// 并如实告知用户"面板重载后会丢失"，绝不假装成功。

const DB_NAME = 'ai-helper-queue-attachments';
const DB_VERSION = 1;
const STORE = 'attachments';

/** 单条附件的持久化上限；超过则拒绝落盘，由调用方降级为内存副本 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

let dbPromise = null;
/** 测试注入的适配器（null = 使用真实 IndexedDB） */
let adapter = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        // 会话维度批量清理（删除会话 / 迁移孤儿）
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
    request.onsuccess = (event) => {
      const db = event.target.result;
      // 与主库同样处理：版本变更时主动让路，避免阻塞其它上下文升级
      db.onversionchange = () => {
        try { db.close(); } catch { /* ignore */ }
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('idb_open_failed'));
    request.onblocked = () => { /* 等待其它连接释放，不 reject */ };
  });
}

function getDB() {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

function withStore(mode, fn) {
  return getDB().then((db) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE, mode);
    } catch (err) {
      dbPromise = null;   // 连接可能已失效，下次重开
      reject(err);
      return;
    }
    const store = tx.objectStore(STORE);
    let result = null;
    const set = (v) => { result = v; };
    try {
      fn(store, set);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('idb_tx_failed'));
    tx.onabort = () => reject(tx.error || new Error('idb_tx_aborted'));
  }));
}

/** 真实 IndexedDB 适配器 */
function idbAdapter() {
  return {
    async put(record) {
      await withStore('readwrite', (store) => { store.put(record); });
    },
    async get(id) {
      return withStore('readonly', (store, set) => {
        const req = store.get(id);
        req.onsuccess = () => set(req.result || null);
      });
    },
    async remove(id) {
      await withStore('readwrite', (store) => { store.delete(id); });
    },
    async removeBySession(sessionId) {
      await withStore('readwrite', (store) => {
        const req = store.index('sessionId').getAllKeys(sessionId);
        req.onsuccess = () => {
          for (const key of req.result || []) store.delete(key);
        };
      });
    },
    async allKeys() {
      return withStore('readonly', (store, set) => {
        const req = store.getAllKeys();
        req.onsuccess = () => set(req.result || []);
      });
    },
  };
}

function getAdapter() {
  return adapter || idbAdapter();
}

// ============================================================
// 轻量判断工具（不需要读库）
// ============================================================

/**
 * 粗略字节数（base64 为 ASCII，按字符数估算足够）。
 * 只用于"是否超过持久化上限"的判断，不追求精确。
 */
export function bytesOf(value) {
  if (value == null) return 0;
  if (typeof value === 'string') return value.length;
  if (typeof value === 'number' || typeof value === 'boolean') return 8;
  if (Array.isArray(value)) return value.reduce((sum, v) => sum + bytesOf(v), 0);
  if (typeof value === 'object') return Object.values(value).reduce((sum, v) => sum + bytesOf(v), 0);
  return 0;
}

/**
 * 生成 chip 上展示用的附件摘要（轻量、可随队列状态落盘）。
 * @param {Object} snapshot 完整的上下文快照
 */
export function summarizeAttachments(snapshot) {
  const images = (snapshot && snapshot.attachedImages) || [];
  const files = (snapshot && snapshot.attachedFiles) || [];
  if (!images.length && !files.length) return null;
  return {
    imageCount: images.length,
    fileCount: files.length,
    fileNames: files.map((f) => f.name).filter(Boolean).slice(0, 5),
  };
}

// ============================================================
// 读写
// ============================================================

/**
 * 保存条目的重附件。
 * @param {string} itemId 队列条目 id
 * @param {string} sessionId 所属会话
 * @param {{images?: Array, files?: Array}} heavy
 * @returns {Promise<{ok: boolean, reason?: string}>} 失败时调用方须降级为内存副本
 */
export async function saveAttachments(itemId, sessionId, { images = [], files = [] } = {}) {
  if (!itemId) return { ok: false, reason: 'missing_id' };
  if (!images.length && !files.length) return { ok: true, skipped: true };

  const size = bytesOf(images) + bytesOf(files);
  if (size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: 'too_large', size };
  }

  try {
    await getAdapter().put({
      id: itemId,
      sessionId: sessionId || null,
      size,
      images,
      files,
      updatedAt: Date.now(),
    });
    return { ok: true, size };
  } catch (err) {
    return { ok: false, reason: 'idb_error', message: err?.message || String(err) };
  }
}

/**
 * 取回条目的重附件。
 * @returns {Promise<{images: Array, files: Array}|null>} 不存在时返回 null
 */
export async function loadAttachments(itemId) {
  if (!itemId) return null;
  try {
    const record = await getAdapter().get(itemId);
    if (!record) return null;
    return { images: record.images || [], files: record.files || [] };
  } catch {
    return null;
  }
}

/** 删除单条附件（幂等，失败静默：清理不该影响主流程） */
export async function deleteAttachments(itemId) {
  if (!itemId) return false;
  try {
    await getAdapter().remove(itemId);
    return true;
  } catch {
    return false;
  }
}

/** 删除整个会话的附件（会话被删除 / 队列被清空） */
export async function deleteSessionAttachments(sessionId) {
  if (!sessionId) return false;
  try {
    await getAdapter().removeBySession(sessionId);
    return true;
  } catch {
    return false;
  }
}

/**
 * 清理孤儿记录：库里存在、但队列中已没有对应条目的附件。
 * 面板启动时调用一次，兜住"某些路径漏删"的情况（多占磁盘但不丢数据）。
 * @param {Iterable<string>} aliveIds 当前所有会话队列中的条目 id
 * @returns {Promise<number>} 清理条数
 */
export async function pruneOrphans(aliveIds) {
  const alive = aliveIds instanceof Set ? aliveIds : new Set(aliveIds || []);
  try {
    const keys = await getAdapter().allKeys();
    let removed = 0;
    for (const key of keys || []) {
      if (alive.has(key)) continue;
      await getAdapter().remove(key);
      removed += 1;
    }
    return removed;
  } catch {
    return 0;
  }
}

// ============================================================
// 测试钩子
// ============================================================

/** 注入内存适配器（测试用），传 null 恢复真实 IndexedDB */
export function __setAdapterForTest(next) {
  adapter = next || null;
}

export function __resetForTest() {
  adapter = null;
  dbPromise = null;
}
