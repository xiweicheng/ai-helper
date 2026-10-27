// agent/src/session-workdirs.js - 会话级工作目录注册表（带内存缓存 + 写入互斥锁）
//
// 代理端本来没有「会话」概念，只有扩展端 IndexedDB 里的会话记录。会话级工作目录要求
// 代理端能按 sessionId 解析有效 workdir，因此这里维护一份最小注册表：
//   { [sessionId]: { workdir, updatedAt } }
//
// 与 config.json 的关系：
//   - config.workdir 仍是「全局默认目录」，未注册的会话（未绑定）一律回落到它。
//   - 会话绑定不写入 config.allowedPaths：删会话 / 过期剪枝能真正回收授权，
//     否则每次绑定都留一条永久白名单，沙箱会被逐步撑成整个文件系统。
//
// 安全边界：
//   - 只有持有配对 token 的扩展端 background 能调用绑定端点，绑定能力等价于今天的
//     全局切换，不构成提权；sessionId 是客户端声明，不是身份凭据。
//   - 注册表有上限与过期时间，防止无限绑定。
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, chmodSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { AGENT_DIR } from './config.js';

const SESSION_WORKDIRS_FILE = join(AGENT_DIR, 'session-workdirs.json');

// 扩展端会话 id 形如 session_1729..._ab12cd（UUID / 时间戳 + 随机后缀）。
// 白名单化的目的是不让异常 key（路径分隔符、超长串、原型污染键）污染注册表。
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const MAX_ENTRIES = 200;
const MAX_AGE_DAYS = 90;

/**
 * 会话 id 是否可直接进注册表
 * @param {*} sessionId
 * @returns {boolean}
 */
export function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && SESSION_ID_RE.test(sessionId);
}

/**
 * 派生会话后缀：扩展端的 plan 子任务 / dispatch 子代理在主会话 id 后追加后缀，
 * 它们不单独绑定目录，而是继承主会话的绑定。
 */
const DERIVED_SESSION_RE = /(_subtask_[A-Za-z0-9_-]+|_sub_[A-Za-z0-9_-]+)$/;

/**
 * 取所属主会话 id（非派生会话原样返回；非法入参返回 null）
 * @param {string} sessionId
 * @returns {string|null}
 */
export function getBaseSessionId(sessionId) {
  if (!isValidSessionId(sessionId)) return null;
  const base = String(sessionId).replace(DERIVED_SESSION_RE, '');
  return isValidSessionId(base) ? base : null;
}

function getMtime(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * 纯函数：按过期时间与条目上限裁剪注册表（不落盘，便于单测）
 * @param {Object} entries - { [sessionId]: { workdir, updatedAt } }
 * @param {Object} [opts]
 * @param {number} [opts.maxEntries]
 * @param {number} [opts.maxAgeDays]
 * @param {number} [opts.now]
 * @returns {{ kept: Object, removed: number }}
 */
export function pruneEntries(entries, opts = {}) {
  const maxEntries = Number.isFinite(opts.maxEntries) ? opts.maxEntries : MAX_ENTRIES;
  const maxAgeDays = Number.isFinite(opts.maxAgeDays) ? opts.maxAgeDays : MAX_AGE_DAYS;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const maxAgeMs = maxAgeDays > 0 ? maxAgeDays * 24 * 60 * 60 * 1000 : Infinity;

  const alive = [];
  for (const [id, entry] of Object.entries(entries || {})) {
    if (!isValidSessionId(id)) continue;
    if (!entry || typeof entry.workdir !== 'string' || !entry.workdir) continue;
    const updatedAt = Number(entry.updatedAt) || 0;
    if (maxAgeMs !== Infinity && now - updatedAt > maxAgeMs) continue;
    alive.push([id, { workdir: entry.workdir, updatedAt }]);
  }

  // 超上限时保留最近更新的若干条
  alive.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  const keptArr = maxEntries > 0 ? alive.slice(0, maxEntries) : alive;
  const kept = {};
  for (const [id, entry] of keptArr) kept[id] = entry;

  const removed = Object.keys(entries || {}).length - keptArr.length;
  return { kept, removed };
}

/**
 * 创建注册表实例（filePath 可注入，便于单测隔离到临时目录）
 * @param {Object} [opts]
 * @param {string} [opts.filePath]
 * @param {number} [opts.maxEntries]
 * @param {number} [opts.maxAgeDays]
 */
export function createSessionWorkdirStore(opts = {}) {
  const filePath = opts.filePath || SESSION_WORKDIRS_FILE;
  const maxEntries = Number.isFinite(opts.maxEntries) ? opts.maxEntries : MAX_ENTRIES;
  const maxAgeDays = Number.isFinite(opts.maxAgeDays) ? opts.maxAgeDays : MAX_AGE_DAYS;

  let cache = null;
  let cacheMtime = -1;
  // 写入互斥锁：与 config.js 同构，避免并发写互相覆盖
  let writeLock = Promise.resolve();

  function withWriteLock(fn) {
    const prev = writeLock;
    let release;
    writeLock = new Promise((resolve) => { release = resolve; });
    return prev.then(() => Promise.resolve(fn())).finally(release);
  }

  function load() {
    const mtime = getMtime(filePath);
    if (cache && mtime === cacheMtime) return cache;

    if (!existsSync(filePath)) {
      cache = {};
      cacheMtime = 0;
      return cache;
    }

    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
      const entries = {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [id, entry] of Object.entries(parsed)) {
          if (!isValidSessionId(id)) continue;
          if (!entry || typeof entry.workdir !== 'string' || !entry.workdir) continue;
          entries[id] = { workdir: entry.workdir, updatedAt: Number(entry.updatedAt) || 0 };
        }
      }
      cache = entries;
      cacheMtime = mtime;
    } catch (err) {
      // 解析失败不炸服务：按空注册表处理，等下一次写入重建
      console.error('[SessionWorkdirs] Registry parse failed:', err.message);
      cache = {};
      cacheMtime = 0;
    }
    return cache;
  }

  function saveSync(entries) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    // 先写临时文件再 rename：进程被杀不会留下半截 JSON
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(entries, null, 2), { encoding: 'utf-8', mode: 0o600 });
    try { chmodSync(tmp, 0o600); } catch { /* ignore */ }
    renameSync(tmp, filePath);
    cache = entries;
    cacheMtime = getMtime(filePath);
  }

  return {
    filePath,

    /** 取会话绑定目录；未绑定 / 非法 id 返回 null */
    get(sessionId) {
      if (!isValidSessionId(sessionId)) return null;
      const entry = load()[sessionId];
      return entry ? entry.workdir : null;
    },

    /** 绑定会话目录（覆盖写），返回绑定后的条目 */
    async bind(sessionId, workdir) {
      if (!isValidSessionId(sessionId)) {
        throw new Error('invalid_session_id');
      }
      if (typeof workdir !== 'string' || !workdir) {
        throw new Error('invalid_workdir');
      }
      return withWriteLock(() => {
        const now = Date.now();
        const next = { ...load(), [sessionId]: { workdir, updatedAt: now } };
        const { kept } = pruneEntries(next, { maxEntries, maxAgeDays, now });
        saveSync(kept);
        return kept[sessionId];
      });
    },

    /** 解绑（恢复跟随全局默认），返回是否真的删掉了 */
    async unbind(sessionId) {
      if (!isValidSessionId(sessionId)) return false;
      return withWriteLock(() => {
        const entries = load();
        if (!entries[sessionId]) return false;
        const next = { ...entries };
        delete next[sessionId];
        saveSync(next);
        return true;
      });
    },

    /** 主动裁剪：过期 + 超上限，返回删除条数 */
    async prune(pruneOpts = {}) {
      return withWriteLock(() => {
        const entries = load();
        const { kept, removed } = pruneEntries(entries, {
          maxEntries,
          maxAgeDays,
          ...pruneOpts,
        });
        if (removed > 0) saveSync(kept);
        return removed;
      });
    },
  };
}

// 进程级默认实例：server.js 直接使用这几个函数
const defaultStore = createSessionWorkdirStore();

export function getSessionWorkdir(sessionId) {
  return defaultStore.get(sessionId);
}

export function bindSessionWorkdir(sessionId, workdir) {
  return defaultStore.bind(sessionId, workdir);
}

export function unbindSessionWorkdir(sessionId) {
  return defaultStore.unbind(sessionId);
}

export function pruneSessionWorkdirs(opts) {
  return defaultStore.prune(opts);
}

export { SESSION_WORKDIRS_FILE, MAX_ENTRIES, MAX_AGE_DAYS };
