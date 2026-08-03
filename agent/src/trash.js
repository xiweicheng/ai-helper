// agent/src/trash.js - 文件回收站模块
// 删除文件/目录时先移动到回收站，7天后自动清理
import { mkdir, rename, readFile, writeFile, readdir, stat, unlink, rmdir } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { t as translate } from './i18n.js';

// 默认使用 zh 语言（独立调用场景）；server.js 调用时会传入 req 的 lang
let currentLang = 'zh';

/**
 * 设置 trash 模块当前使用的语言（由 server.js 在请求入口处调用）
 * @param {string} lang - 语言代码（'zh' | 'en'）
 */
export function setTrashLang(lang) {
  if (lang) currentLang = lang;
}

/**
 * 翻译辅助：使用当前模块语言或传入的 t 函数
 * @param {string} key - 翻译 key
 * @param {object} [params] - 插值参数
 * @param {Function} [tFn] - 可选的 t 函数（优先使用）
 * @returns {string}
 */
function tr(key, params, tFn) {
  if (typeof tFn === 'function') return tFn(key, params);
  return translate(currentLang, key, params);
}

const AGENT_DIR = join(homedir(), '.ai-helper-agent');
const TRASH_DIR = join(AGENT_DIR, '.trash');
const TRASH_META_FILE = join(TRASH_DIR, 'metadata.json');
const TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天
const PERIODIC_CLEAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 每 6 小时执行一次定期清理
let periodicCleanTimer = null;

/**
 * 确保回收站目录存在
 */
async function ensureTrashDir() {
  try {
    if (!existsSync(TRASH_DIR)) {
      await mkdir(TRASH_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('[Trash] Cannot create trash directory:', err.message);
    throw err;
  }
}

/**
 * 读取回收站元数据
 * @returns {Promise<Array>} [{ id, originalPath, name, size, deletedAt, isDir }]
 */
async function loadMetadata() {
  try {
    if (existsSync(TRASH_META_FILE)) {
      const raw = await readFile(TRASH_META_FILE, 'utf-8');
      return JSON.parse(raw).entries || [];
    }
  } catch {}
  return [];
}

/**
 * 保存回收站元数据
 */
async function saveMetadata(entries) {
  await writeFile(TRASH_META_FILE, JSON.stringify({ entries }, null, 2), 'utf-8');
}

/**
 * 递归计算目录实际大小
 * @param {string} dirPath - 目录路径
 * @returns {Promise<number>} 总大小（字节）
 */
async function getDirSize(dirPath) {
  let total = 0;
  try {
    const items = await readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(dirPath, item.name);
      if (item.isDirectory()) {
        total += await getDirSize(fullPath);
      } else if (item.isFile() || item.isSymbolicLink()) {
        try {
          const s = await stat(fullPath);
          total += s.size;
        } catch {}
      }
    }
  } catch {}
  return total;
}

/**
 * 清理过期回收站条目（超过7天）
 */
async function cleanExpiredTrash() {
  await ensureTrashDir();
  const entries = await loadMetadata();
  const now = Date.now();
  const expired = entries.filter(e => (now - e.deletedAt) > TRASH_TTL_MS);
  const kept = entries.filter(e => (now - e.deletedAt) <= TRASH_TTL_MS);

  for (const entry of expired) {
    const trashPath = join(TRASH_DIR, entry.id);
    try {
      // 目录用 rename 存入，需递归删除；文件用 unlink
      const s = await stat(trashPath);
      if (s.isDirectory()) {
        await rmdir(trashPath, { recursive: true });
      } else {
        await unlink(trashPath);
      }
    } catch { /* 文件可能已被手动清理 */ }
  }

  if (expired.length > 0) {
    await saveMetadata(kept);
    console.log(`[Trash] Cleaned up ${expired.length} expired trash entries`);
  }
}

/**
 * 将文件/目录移动到回收站（使用 rename，同文件系统瞬时完成）
 * @param {string} sourcePath - 源文件/目录的绝对路径
 * @param {Function} [tFn] - 可选的翻译函数（由 server.js 传入）
 * @returns {Promise<{success: boolean, trashId?: string, isDir?: boolean, error?: string}>}
 */
export async function moveToTrash(sourcePath, tFn) {
  await ensureTrashDir();
  await cleanExpiredTrash();

  try {
    const s = await stat(sourcePath);
    const isDir = s.isDirectory();
    const ts = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const id = `${ts}_${randomSuffix}`;
    const name = basename(sourcePath);
    const trashPath = join(TRASH_DIR, id);

    // 获取实际大小（目录需要递归计算）
    const size = isDir ? await getDirSize(sourcePath) : s.size;

    // 移动到回收站（rename 是文件系统元数据操作，瞬时完成）
    await rename(sourcePath, trashPath);

    // 记录元数据
    const entries = await loadMetadata();
    entries.push({
      id,
      originalPath: sourcePath,
      name,
      size,
      deletedAt: ts,
      isDir
    });
    await saveMetadata(entries);

    console.log(`[Trash] Moved to trash: ${sourcePath} -> ${trashPath} (${size} bytes, ${isDir ? 'directory' : 'file'})`);
    return { success: true, trashId: id, isDir };
  } catch (err) {
    return { success: false, error: tr('trash.moveFailed', { message: err.message }, tFn) };
  }
}

/**
 * 从回收站恢复文件/目录
 * @param {string} trashId - 回收站条目 ID
 * @param {Function} [tFn] - 可选的翻译函数（由 server.js 传入）
 * @returns {Promise<{success: boolean, restoredPath?: string, error?: string}>}
 */
export async function restoreFromTrash(trashId, tFn) {
  const entries = await loadMetadata();
  const idx = entries.findIndex(e => e.id === trashId);
  if (idx === -1) {
    return { success: false, error: tr('trash.entryNotFound', undefined, tFn) };
  }

  const entry = entries[idx];
  const trashPath = join(TRASH_DIR, entry.id);

  if (!existsSync(trashPath)) {
    entries.splice(idx, 1);
    await saveMetadata(entries);
    return { success: false, error: tr('trash.fileNotFound', undefined, tFn) };
  }

  try {
    if (existsSync(entry.originalPath)) {
      return { success: false, error: tr('trash.originalPathOccupied', { path: entry.originalPath }, tFn) };
    }

    await rename(trashPath, entry.originalPath);
    entries.splice(idx, 1);
    await saveMetadata(entries);

    console.log(`[Trash] Restored: ${entry.originalPath}`);
    return { success: true, restoredPath: entry.originalPath };
  } catch (err) {
    return { success: false, error: tr('trash.restoreFailed', { message: err.message }, tFn) };
  }
}

/**
 * 获取回收站条目列表
 * @returns {Promise<{success: boolean, entries: Array}>}
 */
export async function listTrash() {
  await ensureTrashDir();
  await cleanExpiredTrash();
  const entries = await loadMetadata();
  return { success: true, entries };
}

/**
 * 获取回收站目录路径
 */
export function getTrashDir() {
  return TRASH_DIR;
}

/**
 * 启动定期清理定时器（每6小时执行一次过期清理）
 */
export function startPeriodicCleanup() {
  if (periodicCleanTimer) return;
  periodicCleanTimer = setInterval(async () => {
    try {
      await cleanExpiredTrash();
    } catch (err) {
      console.error('[Trash] Periodic cleanup error:', err.message);
    }
  }, PERIODIC_CLEAN_INTERVAL_MS);
  if (periodicCleanTimer.unref) periodicCleanTimer.unref();
  console.log('[Trash] Periodic cleanup started (interval: 6 hours)');
}

/**
 * 停止定期清理定时器
 */
export function stopPeriodicCleanup() {
  if (periodicCleanTimer) {
    clearInterval(periodicCleanTimer);
    periodicCleanTimer = null;
  }
}

export { TRASH_DIR, TRASH_TTL_MS };
