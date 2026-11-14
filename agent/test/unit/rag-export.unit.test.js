// 知识库 ZIP 备份：原件 + 提取文本 + 文档元数据 + 脱敏配置，支持脱离向量索引恢复
// 运行：node --test agent/test/unit/rag-export.unit.test.js
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { once } from 'node:events';
import JSZip from 'jszip';

const ragRoot = await mkdtemp(join(tmpdir(), 'rag-export-test-'));
process.env.AI_HELPER_RAG_ROOT = ragRoot;

const { RagManager } = await import('../../src/rag/manager.js');
const { ORIGINALS_ROOT, RAG_ROOT } = await import('../../src/rag/config.js');
const { ragRouter } = await import('../../src/rag/routes.js');
const { formatLocalDate } = await import('../../src/rag/export.js');

const t = (key) => key;
const SECRET = 'export-test-secret-api-key';
const FILE_TEXT = '原始文件内容：知识库备份必须保留这些文字。\n第二行。';
const TEXT_ONLY = '没有原件的手工文本，也必须能够独立恢复。';

const fakeProvider = {
  dimensions: 512,
  embedDocuments: async (texts) => texts.map(() => new Array(512).fill(0.01)),
};

function makeManager() {
  const manager = new RagManager({ originalsPolicy: { enabled: true, maxBytesPerCollection: 1024 * 1024 } });
  manager._getProvider = () => fakeProvider;
  return manager;
}

async function finalizeArchive(archive) {
  const chunks = [];
  archive.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  const ended = once(archive, 'end');
  await archive.finalize();
  await ended;
  return Buffer.concat(chunks);
}

async function exportZip(manager, collectionId) {
  const exported = await manager.createCollectionExport(collectionId);
  const buffer = await finalizeArchive(exported.archive);
  return { ...exported, buffer, zip: await JSZip.loadAsync(buffer) };
}

async function createPopulatedCollection(manager, name = '产品资料') {
  const collection = await manager.createCollection({
    name,
    description: '用于灾难恢复的知识库',
    embeddingConfig: {
      mode: 'openai-compat',
      endpoint: 'https://example.com/v1',
      modelName: 'embedding-test',
      dimensions: 512,
      apiKey: SECRET,
    },
    chunkConfig: { chunkSize: 400, overlap: 80 },
  });
  const fileDoc = await manager.ingestFile(collection.id, {
    fileName: '季度 报告.txt',
    contentBase64: Buffer.from(FILE_TEXT, 'utf-8').toString('base64'),
    metadata: { category: 'report' },
  });
  const textDoc = await manager.ingestText(collection.id, {
    content: TEXT_ONLY,
    name: '会议记录',
    metadata: { category: 'minutes' },
  });
  return { collection, fileDoc, textDoc };
}

after(async () => {
  await rm(ragRoot, { recursive: true, force: true });
});

describe('知识库 ZIP 备份内容', () => {
  test('包含原件、全文文本、原始文档 JSON 和脱敏配置，不包含向量索引', async () => {
    const manager = makeManager();
    assert.equal(typeof manager.createCollectionExport, 'function');
    const { collection, fileDoc, textDoc } = await createPopulatedCollection(manager);

    const exported = await exportZip(manager, collection.id);
    assert.match(exported.fileName, /产品资料.*\.zip$/);
    assert.ok(exported.zip.file('manifest.json'));
    assert.ok(exported.zip.file('README.txt'));

    const manifest = JSON.parse(await exported.zip.file('manifest.json').async('string'));
    assert.equal(manifest.format, 'ai-helper-knowledge-base-backup');
    assert.equal(manifest.version, 1);
    assert.equal(manifest.collection.id, collection.id);
    assert.equal(manifest.collection.chunkConfig.chunkSize, 400);
    assert.equal(manifest.collection.embeddingConfig.hasApiKey, true);
    assert.equal(manifest.collection.embeddingConfig.apiKey, '');
    assert.equal(JSON.stringify(manifest).includes(SECRET), false);
    assert.equal(manifest.documents.length, 2);

    assert.equal(manifest.stats.unreadableBackups, 0);

    const fileEntry = manifest.documents.find((doc) => doc.id === fileDoc.documentId);
    const textEntry = manifest.documents.find((doc) => doc.id === textDoc.documentId);
    assert.equal(fileEntry.original.exported, true);
    assert.equal(fileEntry.original.name, '季度 报告.txt');
    assert.equal(fileEntry.metadata.category, 'report');
    // 有原件时不再重复写一份同样的全文，避免备份体积接近翻倍
    assert.equal(fileEntry.textPath, null);
    assert.equal(exported.zip.file('texts/季度 报告.txt'), null);
    assert.equal(textEntry.original, null);
    assert.equal(textEntry.textPath.startsWith('texts/'), true);

    // documents/*.json 保持与内部备份同构，可直接拷回 RAG_ROOT 恢复
    const rawBackup = JSON.parse(await exported.zip.file(fileEntry.backupPath).async('string'));
    assert.equal(rawBackup.text, FILE_TEXT);
    assert.equal(rawBackup.original.sha256.length, 64);
    assert.equal(await exported.zip.file(textEntry.textPath).async('string'), TEXT_ONLY);
    assert.equal(await exported.zip.file(fileEntry.original.path).async('string'), FILE_TEXT);

    const entryNames = Object.keys(exported.zip.files);
    assert.equal(entryNames.some((name) => /(^|\/)(vectors|index\.json)(\/|$)/.test(name)), false);
    assert.ok((await exported.zip.file('README.txt').async('string')).includes('manifest.json'));
  });

  test('原件意外缺失时仍导出全文，并在清单中明确标记不完整项', async () => {
    const manager = makeManager();
    const { collection, fileDoc } = await createPopulatedCollection(manager, '缺失原件测试');
    await unlink(join(ORIGINALS_ROOT, collection.id, `${fileDoc.documentId}.txt`));

    const { zip } = await exportZip(manager, collection.id);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    const fileEntry = manifest.documents.find((doc) => doc.id === fileDoc.documentId);
    assert.equal(fileEntry.original.exported, false);
    assert.equal(fileEntry.original.path, null);
    assert.equal(manifest.warnings.some((warning) => warning.documentId === fileDoc.documentId && warning.code === 'originalMissing'), true);
    assert.equal(await zip.file(fileEntry.textPath).async('string'), FILE_TEXT);
  });

  test('损坏的文档备份不会中断导出，并在清单中记录缺失项', async () => {
    const manager = makeManager();
    const { collection } = await createPopulatedCollection(manager, '损坏备份测试');
    await writeFile(
      join(RAG_ROOT, collection.id, 'documents', 'doc_broken0001.json'),
      '{ 这不是合法 JSON',
      'utf-8',
    );

    const { zip } = await exportZip(manager, collection.id);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    assert.equal(manifest.stats.documents, 2);
    assert.equal(manifest.stats.unreadableBackups, 1);
    assert.equal(
      manifest.warnings.some((w) => w.code === 'backupUnreadable' && w.documentId === 'doc_broken0001'),
      true,
    );
    assert.ok(zip.file('manifest.json'));
  });

  test('超长文件名截断后仍保留扩展名', async () => {
    const manager = makeManager();
    const collection = await manager.createCollection({ name: '长文件名测试' });
    const longName = `${'知'.repeat(200)}.txt`;
    const doc = await manager.ingestFile(collection.id, {
      fileName: longName,
      contentBase64: Buffer.from(FILE_TEXT, 'utf-8').toString('base64'),
    });

    const { zip } = await exportZip(manager, collection.id);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    const entry = manifest.documents.find((item) => item.id === doc.documentId);
    assert.equal(entry.original.exported, true);
    assert.equal(entry.original.path.startsWith('originals/'), true);
    assert.equal(entry.original.path.endsWith('.txt'), true);
    assert.ok(entry.original.path.length < longName.length);
  });

  test('导出结束后释放知识库操作锁，且提供失败兜底 release', async () => {
    const manager = makeManager();
    const { collection } = await createPopulatedCollection(manager, '锁释放测试');

    const exported = await exportZip(manager, collection.id);
    assert.equal(typeof exported.release, 'function');
    assert.equal(manager._activeOps.has(collection.id), false);

    // 兜底 release 幂等：重复调用不应抛错
    exported.release();
    assert.equal(manager._activeOps.has(collection.id), false);
  });

  test('ZIP 文件名使用本地日期而非 UTC 日期', () => {
    assert.equal(formatLocalDate(new Date(2026, 0, 2, 0, 30)), '2026-01-02');
    assert.equal(formatLocalDate(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  });
});

class FakeRes extends Writable {
  constructor() {
    super();
    this.req = { headers: {} };
    this.status = 0;
    this.headers = {};
    this.chunks = [];
  }

  writeHead(status, headers) {
    this.status = status;
    this.headers = headers || {};
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  get buffer() {
    return Buffer.concat(this.chunks);
  }
}

describe('知识库导出 HTTP 接口', () => {
  test('GET /export 直接流式下载带 UTF-8 文件名的 ZIP', async () => {
    const manager = makeManager();
    const { collection } = await createPopulatedCollection(manager, '接口备份');
    const res = new FakeRes();
    const url = new URL(`http://localhost/api/rag/collections/${collection.id}/export`);
    const finished = once(res, 'finish');

    await ragRouter({ method: 'GET' }, res, url.pathname, url, t);
    await finished;

    assert.equal(res.status, 200);
    assert.equal(res.headers['Content-Type'], 'application/zip');
    assert.match(res.headers['Content-Disposition'], /filename\*=UTF-8''/);
    assert.match(res.headers['Content-Disposition'], /\.zip/);
    const zip = await JSZip.loadAsync(res.buffer);
    assert.ok(zip.file('manifest.json'));
  });
});
