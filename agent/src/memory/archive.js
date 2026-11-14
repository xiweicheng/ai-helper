// agent/src/memory/archive.js - 淘汰记忆归档（append-only JSONL）
//
// 为什么不用「一个 backup 文件」：淘汰是长期行为，单文件会无限增长，越到后面越难打开、
// 越难备份，一次写坏就是全量丢失。这里按月切片：memory-archive-YYYY-MM.jsonl。
//
// 为什么用 JSONL 而不是 JSON 数组：
//   1. 追加只改文件尾部，不需要「读全量-改-写回」，单次淘汰的写入量与归档总量无关；
//   2. 崩溃最多损坏最后一行，前面的历史记录仍然可读（导入侧按行解析、坏行跳过）；
//   3. 一行一条记忆，用户可以直接用编辑器/文本工具查看某个月的淘汰项。
//
// 单文件上限之外还要管总量：按月切片只约束文件名，不约束单文件大小（一个月内也可能
// 反复淘汰）。这里再做两层限制：
//   1. 单文件超过 ARCHIVE_MAX_FILE_BYTES 时，月内继续切片为 memory-archive-YYYY-MM-2.jsonl；
//   2. 最多保留 ARCHIVE_MAX_FILES 个文件且总量不超过 ARCHIVE_MAX_BYTES，
//      超出后从最旧的文件开始删——归档是兜底，不是无限期冷存储。
//
// 失败语义由调用方决定：append 失败必须中止淘汰（fail-closed，宁可这轮不压缩），
// prune 失败只告警（数据已经归档，删不掉旧文件不影响正确性）。

import { appendFile, mkdir, open, readdir, rm, stat } from 'fs/promises';
import { basename, join } from 'path';

export const ARCHIVE_MAX_FILES = 12;                       // 最多 12 个归档文件（月份或月内分段）
export const ARCHIVE_MAX_BYTES = 10 * 1024 * 1024;         // 总量上限 10 MB
export const ARCHIVE_MAX_FILE_BYTES = 2 * 1024 * 1024;     // 单文件上限 2 MB，超出后月内再切片
export const ARCHIVE_FILE_RE = /^memory-archive-(\d{4})-(\d{2})(?:-(\d+))?\.jsonl$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 归档基础文件按月命名；月内分段为 -2、-3……，文件名本身即时间范围 */
export function archiveFilePath(dir, now = Date.now()) {
  const d = new Date(now);
  return join(dir, `memory-archive-${d.getFullYear()}-${pad2(d.getMonth() + 1)}.jsonl`);
}

/** 排序键：先月份、再分段号（无后缀视为第 1 段），保证裁剪永远从最旧开始 */
function archiveSortKey(name) {
  const m = ARCHIVE_FILE_RE.exec(name);
  if (!m) return '';
  const seg = m[3] ? Number(m[3]) : 1;
  return `${m[1]}-${m[2]}-${String(seg).padStart(6, '0')}`;
}

/**
 * 选追加目标：优先写进当月已有分段中「再加这条不会超单文件上限」的最早一个，
 * 都放不下就新开一个分段。这样单文件大小有硬上限，而恢复时按文件名排序仍然天然有序。
 */
async function pickArchiveTarget(dir, now, payloadBytes, maxFileBytes) {
  const month = basename(archiveFilePath(dir, now), '.jsonl');
  const segRe = new RegExp(`^${month}(?:-(\\d+))?\\.jsonl$`);

  let names = [];
  try {
    names = await readdir(dir);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const segs = names
    .map((name) => {
      const m = segRe.exec(name);
      return m ? { name, seg: m[1] ? Number(m[1]) : 1 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.seg - b.seg);

  for (const item of segs) {
    const path = join(dir, item.name);
    const st = await stat(path);
    if (st.size + payloadBytes <= maxFileBytes) return path;
  }

  const nextSeg = segs.length ? segs[segs.length - 1].seg + 1 : 1;
  return join(dir, nextSeg === 1 ? `${month}.jsonl` : `${month}-${nextSeg}.jsonl`);
}

/**
 * 上次追加若在写一半时崩掉，文件末尾可能缺换行；此时直接追加会把新记录拼到残行上，
 * 连上一条历史记录一起毁掉。追加前检查最后一个字节，缺就补一个换行。
 */
async function endsWithNewline(filePath) {
  let st;
  try {
    st = await stat(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') return true;
    throw err;
  }
  if (st.size === 0) return true;
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(1);
    await fh.read(buf, 0, 1, st.size - 1);
    return buf[0] === 0x0a;
  } finally {
    await fh.close();
  }
}

/**
 * 把淘汰项追加进当月归档文件（一次写入，减少半行风险）；
 * 当月文件超过单文件上限时自动切到下一个分段。
 * @param {Array<{memory: Object, value: number}>} records - 被淘汰条目及其淘汰时的价值分
 * @param {{dir: string, reason?: string, now?: number, maxFileBytes?: number}} opts
 * @returns {Promise<{archived: number, filePath: string}>}
 */
export async function appendArchive(records, {
  dir, reason = 'compact', now = Date.now(), maxFileBytes = ARCHIVE_MAX_FILE_BYTES,
}) {
  const list = Array.isArray(records) ? records.filter((r) => r && r.memory) : [];
  if (!list.length) return { archived: 0, filePath: null };

  await mkdir(dir, { recursive: true });
  const archivedAt = new Date(now).toISOString();
  const body = list.map(({ memory, value }) => JSON.stringify({
    ...memory,
    archivedAt,
    archiveReason: reason,
    archiveValue: Number.isFinite(value) ? Number(value.toFixed(2)) : null,
  })).join('\n') + '\n';

  const filePath = await pickArchiveTarget(dir, now, Buffer.byteLength(body), maxFileBytes);
  const prefix = await endsWithNewline(filePath) ? '' : '\n';
  await appendFile(filePath, prefix + body, 'utf8');
  return { archived: list.length, filePath };
}

/**
 * 总量控制：按「月份 + 分段号」从旧到新，删到「文件数 ≤ maxFiles 且总字节 ≤ maxBytes」。
 * 永远保留最新的一个文件：即使它单独就超过 maxBytes（极端情况下单次归档量过大），
 * 删掉它等于删掉刚归档的数据，宁可让上限短暂失效。
 * @param {{dir: string, maxFiles?: number, maxBytes?: number}} opts
 * @returns {Promise<{removed: string[]}>}
 */
export async function pruneArchive({
  dir,
  maxFiles = ARCHIVE_MAX_FILES,
  maxBytes = ARCHIVE_MAX_BYTES,
} = {}) {
  let names;
  try {
    names = await readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return { removed: [] };
    throw err;
  }

  const files = [];
  let total = 0;
  for (const name of names
    .filter((n) => ARCHIVE_FILE_RE.test(n))
    .sort((a, b) => archiveSortKey(a).localeCompare(archiveSortKey(b)))) {
    const path = join(dir, name);
    const st = await stat(path);
    files.push({ name, path, size: st.size });
    total += st.size;
  }

  const removed = [];
  while (files.length > 1 && (files.length > maxFiles || total > maxBytes)) {
    const oldest = files.shift();
    await rm(oldest.path, { force: true });
    total -= oldest.size;
    removed.push(oldest.name);
  }
  return { removed };
}
