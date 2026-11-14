// 知识库可恢复备份：保留原件与完整文本，向量索引在恢复时重新生成
import { extname, join } from 'path';
import { stat } from 'fs/promises';
import { ZipArchive } from 'archiver';
import { ORIGINALS_ROOT } from './config.js';

const BACKUP_FORMAT = 'ai-helper-knowledge-base-backup';
const ORIGINAL_EXT_RE = /^\.[a-z0-9]{1,8}$/;
const MAX_ENTRY_NAME = 160;

function safeOriginalExt(ext) {
  const value = String(ext || '').toLowerCase();
  return ORIGINAL_EXT_RE.test(value) ? value : '.bin';
}

/**
 * ZIP 内文件名只保留单段，清理控制字符与各平台保留字符。
 * 超长名按「主干裁剪 + 保留扩展名」截断：直接切尾会把 .pdf/.docx 切掉，
 * 恢复时无法识别文件类型。
 */
function safeFileName(value, fallback) {
  const cleaned = String(value || '')
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= MAX_ENTRY_NAME) return cleaned;

  const rawExt = extname(cleaned);
  const ext = rawExt.length > 1 && rawExt.length <= 10 ? rawExt : '';
  const stem = ext ? cleaned.slice(0, -ext.length) : cleaned;
  return `${stem.slice(0, MAX_ENTRY_NAME - ext.length)}${ext}`;
}

/** 保留可读原名；重名时追加文档 ID，避免覆盖（按大小写不敏感判断，兼容 Windows/macOS） */
function allocateEntryName(directory, preferredName, documentId, usedNames) {
  const safeName = safeFileName(preferredName, documentId);
  const ext = extname(safeName);
  const stem = ext ? safeName.slice(0, -ext.length) : safeName;
  let candidate = `${directory}/${safeName}`;
  let suffix = 0;
  while (usedNames.has(candidate.toLowerCase())) {
    suffix += 1;
    const disambiguator = suffix === 1 ? documentId : `${documentId}-${suffix}`;
    candidate = `${directory}/${stem}-${disambiguator}${ext}`;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

/** ZIP 文件名用本地日期（toISOString 是 UTC，东八区凌晨导出会差一天） */
export function formatLocalDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function collectionForExport(collection) {
  const { apiKey, ...embeddingConfig } = collection.embeddingConfig || {};
  return {
    ...collection,
    embeddingConfig: {
      ...embeddingConfig,
      apiKey: '',
      hasApiKey: Boolean(apiKey),
    },
  };
}

function restoreReadme(collection) {
  return `AI Helper 知识库备份 / Knowledge Base Backup
=========================================

知识库：${collection.name}
知识库 ID：${collection.id}

备份内容
- manifest.json：知识库配置、文档索引、文件路径、SHA-256 和缺失项警告。
- documents/*.json：每篇文档的完整内部备份（含全文与元数据），文件名与内部存储一致。
- originals/*：导入时保留的原始文件。
- texts/*：仅对「没有原件」的文档提供完整 UTF-8 提取文本，避免与 documents/ 重复存一份全文。

恢复方法
1. 在 AI Helper 中新建知识库，按 manifest.json 的 collection 配置名称、向量模型和分块参数。
2. 远端向量服务的 API Key 不会写入备份，请在恢复时重新填写。
3. 最直接的方式：把 documents/*.json 拷回 <RAG 数据目录>/<知识库 ID>/documents/，
   把 originals/* 拷回 <RAG 数据目录>/originals/<知识库 ID>/（文件名需改回文档 ID），
   即可复用原始文档记录。
4. 更稳妥的方式：重新导入 originals/ 中的文件；没有原件时导入 texts/ 中的文本。
5. 重新导入会重新分块并生成向量索引，因此备份不包含旧向量、缓存或索引文件。
6. 如 manifest.json 的 warnings 非空，请先查看缺失项：
   - backupUnreadable：内部文档备份无法解析，该文档未进入备份（需从其他来源补齐）。
   - originalMissing：原件已丢失，仅保留了全文（见 documents/ 或 texts/）。
   - documentExportFailed：该文档导出时出错，备份不完整。

Backup contents
- manifest.json: sanitized collection settings, document metadata, entry paths, hashes and warnings.
- documents/: complete internal document backups, byte-compatible with the agent's storage layout.
- originals/: retained original bytes.
- texts/: full UTF-8 text only for documents without an exported original (avoids duplicating
  the same text that documents/ already contains).

To restore, create a knowledge base using the collection settings in manifest.json,
re-enter the remote embedding API key, then import originals/ (or texts/ when no original exists).
The vector index is intentionally excluded and is rebuilt on import.
Check manifest.json warnings for any incomplete entries.
`;
}

/**
 * 准备单库 ZIP 流。原件由 archiver 逐文件读取，不把整个知识库一次性载入内存。
 * 调用方负责 archive.pipe(destination) 与 archive.finalize()。
 */
export async function buildCollectionExport(manager, collection) {
  const collectionId = collection.id;
  const { documents, unreadable } = await manager.scanDocumentBackups(collectionId);
  const now = new Date();
  const exportedAt = now.toISOString();
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const usedNames = new Set(['manifest.json', 'readme.txt']);
  const manifestDocuments = [];
  // 损坏的内部备份不能静默丢弃：写进 warnings，恢复时才不会"少文件却不知道"
  const warnings = unreadable.map((item) => ({
    documentId: item.documentId,
    code: 'backupUnreadable',
    name: item.file,
  }));
  const pendingOriginals = [];

  for (const { id: documentId, backup } of documents) {
    try {
      const backupPath = `documents/${documentId}.json`;
      const { text, ...metadata } = backup;
      const entry = {
        ...metadata,
        id: documentId,
        backupPath,
        textPath: null,
        original: null,
      };

      if (backup.original) {
        const ext = safeOriginalExt(backup.original.ext);
        const originalPath = join(ORIGINALS_ROOT, collectionId, `${documentId}${ext}`);
        const info = await stat(originalPath).catch(() => null);
        if (info?.isFile()) {
          const zipPath = allocateEntryName(
            'originals',
            backup.original.name || `${backup.name || documentId}${ext}`,
            documentId,
            usedNames,
          );
          entry.original = { ...backup.original, exported: true, path: zipPath };
          pendingOriginals.push({ path: originalPath, name: zipPath });
        } else {
          entry.original = { ...backup.original, exported: false, path: null };
          warnings.push({ documentId, code: 'originalMissing', name: backup.name || documentId });
        }
      }

      // 有原件时正文已可由原件重建，不再重复写一份；无原件时文本是唯一的恢复来源
      if (!entry.original?.exported) {
        entry.textPath = allocateEntryName(
          'texts',
          `${backup.name || documentId}.txt`,
          documentId,
          usedNames,
        );
        archive.append(String(text || ''), { name: entry.textPath });
      }

      manifestDocuments.push(entry);
      archive.append(JSON.stringify(backup, null, 2), { name: backupPath });
    } catch (err) {
      warnings.push({ documentId, code: 'documentExportFailed', message: String(err?.message || err) });
    }
  }

  for (const original of pendingOriginals) {
    archive.file(original.path, { name: original.name });
  }

  const manifest = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt,
    collection: collectionForExport(collection),
    stats: {
      documents: manifestDocuments.length,
      originals: manifestDocuments.filter((doc) => doc.original?.exported).length,
      missingOriginals: warnings.filter((item) => item.code === 'originalMissing').length,
      unreadableBackups: unreadable.length,
    },
    documents: manifestDocuments,
    warnings,
  };
  const safeCollectionName = safeFileName(collection.name, collectionId);
  const fileName = `${safeCollectionName}-backup-${formatLocalDate(now)}.zip`;

  archive.append(restoreReadme(collection), { name: 'README.txt' });
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
  return { archive, fileName, warningCount: warnings.length };
}
