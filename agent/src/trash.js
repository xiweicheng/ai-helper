// agent/src/trash.js - 文件回收站模块
// 删除文件时先移动到回收站，7天后自动清理
import { mkdir, rename, readFile, writeFile, readdir, stat, unlink, rmdir } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

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
    console.error('[Trash] 无法创建回收站目录:', err.message);
    throw err;
  }
}

/**
 * 读取回收站元数据
 * @returns {Promise<Array>} [{ id, originalPath, name, size, deletedAt }]
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
 * 清理过期回收站条目（超过7天）
 * 同时在文件系统上删除对应文件/目录
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
    console.log(`[Trash] 清理了 ${expired.length} 个过期回收站条目`);
  }
}

/**
 * 将文件/目录移动到回收站
 * @param {string} sourcePath - 源文件/目录的绝对路径
 * @returns {Promise<{success: boolean, trashId?: string, error?: string}>}
 */
export async function moveToTrash(sourcePath) {
  await ensureTrashDir();

  // 每次删除前先清理过期条目（投机式清理，无需定时器）
  await cleanExpiredTrash();

  try {
    const ts = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const id = `${ts}_${randomSuffix}`;
    const name = basename(sourcePath);
    const trashPath = join(TRASH_DIR, id);

    // 获取文件信息
    let size = 0;
    try {
      const s = await stat(sourcePath);
      size = s.size;
    } catch {}

    // 移动到回收站
    await rename(sourcePath, trashPath);

    // 记录元数据
    const entries = await loadMetadata();
    entries.push({
      id,
      originalPath: sourcePath,
      name,
      size,
      deletedAt: ts
    });
    await saveMetadata(entries);

    console.log(`[Trash] 已移至回收站: ${sourcePath} -> ${trashPath}`);
    return { success: true, trashId: id };
  } catch (err) {
    return { success: false, error: `移至回收站失败: ${err.message}` };
  }
}

/**
 * 从回收站恢复文件
 * @param {string} trashId - 回收站条目 ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function restoreFromTrash(trashId) {
  const entries = await loadMetadata();
  const idx = entries.findIndex(e => e.id === trashId);
  if (idx === -1) {
    return { success: false, error: '回收站条目不存在或已过期' };
  }

  const entry = entries[idx];
  const trashPath = join(TRASH_DIR, entry.id);

  if (!existsSync(trashPath)) {
    // 文件已不在回收站，清理元数据
    entries.splice(idx, 1);
    await saveMetadata(entries);
    return { success: false, error: '回收站文件已不存在' };
  }

  try {
    // 检查原路径是否已被占用
    if (existsSync(entry.originalPath)) {
      return { success: false, error: `原位置已有文件: ${entry.originalPath}` };
    }

    await rename(trashPath, entry.originalPath);
    entries.splice(idx, 1);
    await saveMetadata(entries);

    console.log(`[Trash] 已恢复: ${entry.originalPath}`);
    return { success: true, restoredPath: entry.originalPath };
  } catch (err) {
    return { success: false, error: `恢复失败: ${err.message}` };
  }
}

/**
 * 获取回收站条目列表（不包含清理逻辑，用于前端展示）
 * @returns {Promise<{success: boolean, entries: Array}>}
 */
export async function listTrash() {
  await ensureTrashDir();
  // 前先清理一次过期条目，保持视图清爽
  await cleanExpiredTrash();
  const entries = await loadMetadata();
  return { success: true, entries };
}

/**
 * 获取回收站目录路径（用于配置 etc）
 */
export function getTrashDir() {
  return TRASH_DIR;
}

/**
 * 启动定期清理定时器（每6小时执行一次过期清理）
 * 配合 moveToTrash/listTrash 中的投机式清理，确保即使长期不操作也能清理过期文件
 */
export function startPeriodicCleanup() {
  if (periodicCleanTimer) return; // 防止重复启动
  periodicCleanTimer = setInterval(async () => {
    try {
      await cleanExpiredTrash();
    } catch (err) {
      console.error('[Trash] 定期清理出错:', err.message);
    }
  }, PERIODIC_CLEAN_INTERVAL_MS);
  // 允许进程退出（不阻止事件循环），Node 会在退出时自动清理
  if (periodicCleanTimer.unref) periodicCleanTimer.unref();
  console.log('[Trash] 定期清理已启动（间隔6小时）');
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
