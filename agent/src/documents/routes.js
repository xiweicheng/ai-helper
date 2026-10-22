// agent/src/documents/routes.js - /api/documents/* 处理器（可脱离 HTTP server 单测）
import { join, basename, extname, dirname } from 'node:path';
import { mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { checkPath } from '../security.js';
import { extractDocxImages } from './image-extractor.js';
import { listEntryNames } from './zip-reader.js';

const EXTRACT_MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * POST /api/documents/extract-images 处理器
 * @param {object} body { path, maxImages? }
 * @param {{ t?: Function, checkPathOverride?: Function }} [opts] checkPathOverride 仅供单测注入
 * @returns {Promise<{ status: number, payload: object }>}
 */
export async function extractImagesHandler(body = {}, { t, checkPathOverride } = {}) {
  const tt = typeof t === 'function' ? t : (k) => k;
  const path = body.path;
  if (!path || typeof path !== 'string') return { status: 400, payload: { success: false, error: 'missingPath' } };
  const ext = extname(path).toLowerCase();
  if (ext !== '.docx') return { status: 400, payload: { success: false, error: 'unsupportedFormat' } };

  const check = await (checkPathOverride || checkPath)(path, tt);
  if (!check.allowed) return { status: 403, payload: { success: false, error: check.reason } };
  const resolved = check.resolved;

  let fstat;
  try { fstat = await stat(resolved); } catch { return { status: 404, payload: { success: false, error: 'notFound' } }; }
  if (!fstat.isFile()) return { status: 404, payload: { success: false, error: 'notFound' } };
  if (fstat.size > EXTRACT_MAX_FILE_BYTES) {
    return { status: 413, payload: { success: false, error: 'fileTooLarge', size: fstat.size, limit: EXTRACT_MAX_FILE_BYTES } };
  }

  let result;
  try {
    const buf = new Uint8Array(await readFile(resolved));
    listEntryNames(buf); // zip 完整性预校验：损坏文件在此抛错 → parseFailed
    result = extractDocxImages(buf, {
      maxImages: Number(body.maxImages) > 0 ? Number(body.maxImages) : undefined,
    });
  } catch (err) {
    return { status: 400, payload: { success: false, error: 'parseFailed', detail: String(err?.message || err) } };
  }

  // 落盘到文档同级 _attachments/<词干>/，重复调用先清空目录保证幂等
  const stem = basename(resolved, extname(resolved));
  const outDir = join(dirname(resolved), '_attachments', stem);
  try {
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    const images = [];
    for (const img of result.images) {
      const fullPath = join(outDir, `img-${img.index}.${img.ext}`);
      await writeFile(fullPath, Buffer.from(img.data));
      images.push({
        index: img.index,
        path: fullPath,
        page: null,
        mimeType: img.mimeType,
        bytes: img.bytes,
        width: img.width,
        height: img.height,
        kind: 'embedded',
      });
    }
    const payload = { success: true, dir: outDir, images, truncated: result.truncated, skipped: result.skipped };
    await writeFile(join(outDir, 'manifest.json'), JSON.stringify({ updatedAt: Date.now(), source: resolved, ...payload }, null, 2));
    return { status: 200, payload };
  } catch (err) {
    return { status: 400, payload: { success: false, error: 'parseFailed', detail: String(err?.message || err) } };
  }
}
