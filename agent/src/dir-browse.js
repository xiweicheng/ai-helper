// 目录浏览（工作目录选择用）：只读、只列目录，不做路径沙箱校验。
// 与 /api/fs/list 的职责分开：后者面向文件面板（返回文件与 stat），受 workdir / allowedPaths 约束；
// 而「切换工作目录」必须能浏览沙箱之外的目录，且只需要目录名。
// 本模块不 spawn 任何子进程，因此不受 Windows 终端类型 / 桌面会话影响。

import fs from 'fs';
import { readdir, stat } from 'fs/promises';
import os from 'os';
import path from 'path';

export const MAX_BROWSE_ENTRIES = 5000;
export const BROWSE_TIMEOUT_MS = 5000;
export const MAX_BROWSE_PATH_LENGTH = 4096;
// 符号链接解析并发上限：避免大量链接（pnpm 等）逐个串行等待，
// 同时避免一次性打开过多文件句柄。
export const LINK_STAT_CONCURRENCY = 16;
// 根节点（盘符）探测缓存：Windows 每次 existsSync 都可能命中不可达的映射驱动器，
// 深层导航不需要重复探测，短 TTL 内复用结果。
export const ROOTS_CACHE_TTL_MS = 10_000;

// 机器码 + 本地化 message key + HTTP 状态码；由 server.js 统一转换成响应
export class BrowseError extends Error {
  constructor(code, messageKey, httpStatus, detail = '') {
    super(detail || code);
    this.name = 'BrowseError';
    this.code = code;
    this.messageKey = messageKey;
    this.httpStatus = httpStatus;
  }
}

function pathApiFor(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

function joinFor(platform, base, name) {
  return pathApiFor(platform).join(base, name);
}

function withTimeout(promise, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new BrowseError('timeout', 'error.browseTimeout', 504));
    }, timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

function mapFsError(err) {
  if (err instanceof BrowseError) return err;
  const code = err && err.code;
  if (code === 'ENOENT') return new BrowseError('path_not_found', 'error.dirNotFound', 404);
  if (code === 'ENOTDIR') return new BrowseError('not_a_directory', 'error.pathNotDir', 400);
  if (code === 'EACCES' || code === 'EPERM') return new BrowseError('permission_denied', 'error.browsePermissionDenied', 403);
  if (code === 'ENAMETOOLONG') return new BrowseError('path_too_long', 'error.browsePathTooLong', 400);
  return new BrowseError('browse_failed', 'error.browseFailed', 500, err && err.message ? err.message : '');
}

/**
 * 规范化浏览路径。
 * - 空值返回 null（表示请求根节点集合）
 * - 支持 ~ 前缀展开（仅前缀，不做 shell 展开）
 * - 必须是绝对路径；统一分隔符；去掉根之外的尾部斜杠
 */
export function normalizeBrowsePath(rawPath, options = {}) {
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();
  if (rawPath === undefined || rawPath === null) return null;

  let raw = String(rawPath);
  if (!raw.trim()) return null;
  raw = raw.trim();
  // 用户从资源管理器复制时可能带引号
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }
  if (!raw) return null;
  if (raw.includes('\0')) throw new BrowseError('bad_path', 'error.browseBadPath', 400);
  if (raw.length > MAX_BROWSE_PATH_LENGTH) throw new BrowseError('path_too_long', 'error.browsePathTooLong', 400);

  if (raw === '~') {
    raw = homeDir;
  } else if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    raw = pathApiFor(platform).join(homeDir, raw.slice(2));
  }

  const P = pathApiFor(platform);

  // Windows 下 /c/Users 这类 MSYS 风格路径会被 resolve 成当前盘下的 \Users，属于静默错误，直接拒绝
  if (platform === 'win32' && /^\/[A-Za-z](\/|$)/.test(raw)) {
    throw new BrowseError('bad_path', 'error.browseBadPath', 400);
  }

  if (!P.isAbsolute(raw)) {
    throw new BrowseError('bad_path', 'error.browseBadPath', 400);
  }

  let resolved = P.resolve(raw);
  if (resolved.length > MAX_BROWSE_PATH_LENGTH) {
    throw new BrowseError('path_too_long', 'error.browsePathTooLong', 400);
  }

  const root = P.parse(resolved).root;
  if (resolved !== root) {
    while (resolved.length > root.length && /[\\/]$/.test(resolved)) {
      resolved = resolved.slice(0, -1);
    }
  }
  return resolved;
}

/**
 * 根节点集合：Windows 为可用盘符 + 主目录，POSIX 为 / + 主目录。
 * existsImpl 可注入，便于在非 Windows 环境测试盘符逻辑。
 */
export function listRoots(options = {}) {
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();
  const existsImpl = options.existsImpl || fs.existsSync;
  const roots = [];

  if (platform === 'win32') {
    for (let i = 0; i < 26; i += 1) {
      const letter = String.fromCharCode(65 + i);
      const rootPath = `${letter}:\\`;
      let ok = false;
      try { ok = Boolean(existsImpl(rootPath)); } catch { ok = false; }
      if (ok) roots.push({ name: `${letter}:`, path: rootPath, kind: 'drive' });
    }
  } else {
    roots.push({ name: '/', path: '/', kind: 'root' });
  }

  if (homeDir && !roots.some((item) => item.path === homeDir)) {
    roots.push({ name: '~', path: homeDir, kind: 'home' });
  }
  return roots;
}

/**
 * 列出单层子目录（不递归）。只返回目录；符号链接解析后必须是目录才返回。
 */
export async function listChildDirs(absPath, options = {}) {
  const platform = options.platform || process.platform;
  const timeoutMs = options.timeoutMs === undefined ? BROWSE_TIMEOUT_MS : options.timeoutMs;
  const maxEntries = options.maxEntries === undefined ? MAX_BROWSE_ENTRIES : options.maxEntries;

  let dirents;
  try {
    dirents = await withTimeout(readdir(absPath, { withFileTypes: true }), timeoutMs);
  } catch (err) {
    throw mapFsError(err);
  }

  const dirs = [];
  const links = [];
  for (const dirent of dirents) {
    const name = dirent.name;
    if (!name) continue;
    if (dirent.isDirectory()) {
      dirs.push({ name, path: joinFor(platform, absPath, name), kind: 'dir', link: false });
      continue;
    }
    if (dirent.isSymbolicLink()) links.push({ name, fullPath: joinFor(platform, absPath, name) });
  }

  // 链接/目录联接：解析目标后仍必须是目录；断链或无权访问则跳过。
  // 有界并发 + 整层总预算：单个链接超时按「剩余预算」递减，避免大量链接
  // 把单次列目录拖成 N × timeoutMs（前端 8s 已经超时，服务端却还在跑）。
  if (links.length) {
    const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : 0;
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= links.length) return;
        const remaining = deadline ? deadline - Date.now() : 0;
        if (deadline && remaining <= 0) return;
        const item = links[index];
        try {
          const target = await withTimeout(stat(item.fullPath), remaining || timeoutMs);
          if (target.isDirectory()) {
            dirs.push({ name: item.name, path: item.fullPath, kind: 'dir', link: true });
          }
        } catch {
          // 断链 / 目标不可读 / 超时：不返回
        }
      }
    };
    const workers = Array.from(
      { length: Math.min(LINK_STAT_CONCURRENCY, links.length) },
      () => worker(),
    );
    await Promise.all(workers);
  }

  // 名称升序，大小写不敏感；完全相同时按原名兜底，保证稳定
  dirs.sort((a, b) => {
    const byLower = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    return byLower !== 0 ? byLower : a.name.localeCompare(b.name);
  });

  const truncated = dirs.length > maxEntries;
  return {
    entries: truncated ? dirs.slice(0, maxEntries) : dirs,
    truncated,
  };
}

export function parentOf(absPath, platform = process.platform) {
  const P = pathApiFor(platform);
  const parent = P.dirname(absPath);
  return parent === absPath ? null : parent;
}

let rootsCache = null; // { key, at, roots }

/** 清空根节点缓存（测试用；盘符变化在 TTL 内自动过期） */
export function resetRootsCache() {
  rootsCache = null;
}

/**
 * 带 TTL 的根节点探测：每次浏览请求都同步探测 Windows 盘符代价很高，
 * 深层导航复用短时间内的结果；显式注入 existsImpl 时不缓存（测试/特殊场景）。
 */
function cachedRoots(options = {}) {
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();
  if (options.existsImpl) {
    return listRoots({ platform, homeDir, existsImpl: options.existsImpl });
  }
  const key = `${platform}|${homeDir}`;
  const now = Date.now();
  if (rootsCache && rootsCache.key === key && now - rootsCache.at < ROOTS_CACHE_TTL_MS) {
    return rootsCache.roots;
  }
  const roots = listRoots({ platform, homeDir });
  rootsCache = { key, at: now, roots };
  return roots;
}

/**
 * 组装 /api/fs/browse 的响应体。
 * rawPath 为空时返回根节点集合（entries 为空）。
 */
export async function buildBrowsePayload(options = {}) {
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();
  const roots = cachedRoots({ platform, homeDir, existsImpl: options.existsImpl });

  const rawPath = options.rawPath;
  const normalized = normalizeBrowsePath(rawPath, { platform, homeDir });
  if (!normalized) {
    return {
      success: true,
      path: null,
      parent: null,
      platform,
      entries: [],
      roots,
      truncated: false,
    };
  }

  const { entries, truncated } = await listChildDirs(normalized, {
    platform,
    timeoutMs: options.timeoutMs,
    maxEntries: options.maxEntries,
  });

  return {
    success: true,
    path: normalized,
    parent: parentOf(normalized, platform),
    platform,
    entries,
    roots,
    truncated,
  };
}

/**
 * 简单滑动窗口频控：每 key 在 windowMs 内最多 limit 次。
 * 正常点击速率远低于阈值；这里主要用于防止被刷成目录枚举器。
 */
export function createBrowseRateLimiter(options = {}) {
  const limit = options.limit === undefined ? 30 : options.limit;
  const windowMs = options.windowMs === undefined ? 10000 : options.windowMs;
  const now = options.now || (() => Date.now());
  const buckets = new Map();

  return {
    consume(key) {
      const bucketKey = String(key || 'anonymous');
      const ts = now();
      const recent = (buckets.get(bucketKey) || []).filter((t) => ts - t < windowMs);
      if (recent.length >= limit) {
        const retryAfterMs = Math.max(0, windowMs - (ts - recent[0]));
        buckets.set(bucketKey, recent);
        return { allowed: false, retryAfterMs };
      }
      recent.push(ts);
      buckets.set(bucketKey, recent);
      if (buckets.size > 10000) {
        for (const [k, list] of buckets) {
          if (!list.length || ts - list[list.length - 1] >= windowMs) buckets.delete(k);
        }
      }
      return { allowed: true, retryAfterMs: 0 };
    },
    reset() {
      buckets.clear();
    },
  };
}
