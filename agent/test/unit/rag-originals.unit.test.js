// agent/test/unit/rag-originals.unit.test.js
// 原件留存单测：归档/配额/回滚/详情截断/下载头/删除联动
// 隔离策略：AI_HELPER_RAG_ROOT 临时目录（先于 manager/routes 动态 import——加载即建实例）
// 运行：node --test agent/test/unit/rag-originals.unit.test.js
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { once } from 'node:events';

const ragRoot = await mkdtemp(join(tmpdir(), 'rag-originals-test-'));
process.env.AI_HELPER_RAG_ROOT = ragRoot;

const { RagManager } = await import('../../src/rag/manager.js');
const { DOC_TEXT_VIEW_MAX_CHARS, ORIGINALS_ROOT, RAG_ROOT } = await import('../../src/rag/config.js');
const { ragRouter } = await import('../../src/rag/routes.js');

// t 桩：错误文案不参与断言，只校验错误码
const t = (key) => key;

// 假向量提供方：512 维与默认 embeddingConfig.dimensions 对齐，避免维度校验报错
const fakeProvider = {
  dimensions: 512,
  embedDocuments: async (texts) => texts.map(() => new Array(512).fill(0.01)),
};

function makeManager(originalsPolicy) {
  const manager = new RagManager(originalsPolicy ? { originalsPolicy } : {});
  manager._getProvider = () => fakeProvider;
  return manager;
}

const LONG_TEXT = '知识库原件留存测试文本。'.repeat(60);

after(async () => {
  await rm(ragRoot, { recursive: true, force: true });
});

describe('原件归档（_persistOriginal）', () => {
  test('写入原件并返回大小/哈希/mime', async () => {
    const manager = makeManager({ enabled: true, maxBytesPerCollection: 1024 * 1024 });
    const collection = await manager.createCollection({ name: 'archive' });
    const bytes = Buffer.from('hello original', 'utf-8');

    const { original, skipped } = await manager._persistOriginal(collection.id, 'doc_test1', bytes, {
      name: '笔记.txt', ext: '.txt', mime: 'text/plain; charset=utf-8',
    });

    assert.equal(skipped, undefined);
    assert.equal(original.name, '笔记.txt');
    assert.equal(original.size, bytes.length);
    assert.equal(original.ext, '.txt');
    assert.equal(original.sha256, createHash('sha256').update(bytes).digest('hex'));
    const stored = await readFile(join(ORIGINALS_ROOT, collection.id, 'doc_test1.txt'));
    assert.deepEqual(stored, bytes);
    assert.equal(await manager._originalsUsage(collection.id), bytes.length);
  });

  test('关闭开关 / 空内容：跳过归档且不落文件', async () => {
    const manager = makeManager({ enabled: false, maxBytesPerCollection: 1024 });
    const collection = await manager.createCollection({ name: 'disabled' });
    const disabled = await manager._persistOriginal(collection.id, 'doc_off', Buffer.from('x'), { ext: '.txt' });
    assert.equal(disabled.skipped, 'disabled');

    const enabled = makeManager({ enabled: true, maxBytesPerCollection: 1024 });
    const empty = await enabled._persistOriginal(collection.id, 'doc_empty', Buffer.alloc(0), { ext: '.txt' });
    assert.equal(empty.skipped, 'empty');
    assert.deepEqual(await readdir(join(ORIGINALS_ROOT, collection.id)).catch(() => []), []);
  });

  test('超出每库配额：跳过原件，返回 quotaExceeded', async () => {
    const manager = makeManager({ enabled: true, maxBytesPerCollection: 6 });
    const collection = await manager.createCollection({ name: 'quota' });

    const first = await manager._persistOriginal(collection.id, 'doc_q1', Buffer.from('1234'), { ext: '.txt' });
    assert.ok(first.original, '首个小文件应成功归档');

    const second = await manager._persistOriginal(collection.id, 'doc_q2', Buffer.from('5678'), { ext: '.txt' });
    assert.equal(second.skipped, 'quotaExceeded');
    assert.equal(second.original, undefined);
  });

  test('导入失败回滚：向量化抛错后原件被删除', async () => {
    const manager = makeManager({ enabled: true, maxBytesPerCollection: 1024 * 1024 });
    const collection = await manager.createCollection({ name: 'rollback' });
    const { original } = await manager._persistOriginal(collection.id, 'doc_rb', Buffer.from('abc'), {
      name: 'rb.txt', ext: '.txt',
    });
    assert.ok(original);

    manager._getProvider = () => ({
      dimensions: 512,
      embedDocuments: async () => { throw new Error('embedding boom'); },
    });

    await assert.rejects(() => manager._ingestText(collection.id, {
      text: LONG_TEXT, name: 'rb.txt', source: 'file', documentId: 'doc_rb', original,
    }));
    assert.deepEqual(await readdir(join(ORIGINALS_ROOT, collection.id)).catch(() => []), []);
    await assert.rejects(
      () => readFile(join(RAG_ROOT, collection.id, 'documents', 'doc_rb.json')),
      /ENOENT/,
    );
  });
});

describe('导入后溯源与详情', () => {
  test('文件导入：备份含原件字段，列表带原件信息，详情返回文本', async () => {
    const manager = makeManager({ enabled: true, maxBytesPerCollection: 1024 * 1024 });
    const collection = await manager.createCollection({ name: 'trace' });
    const content = '文件导入正文内容。'.repeat(20);

    const result = await manager.ingestFile(collection.id, {
      fileName: '导入文档.md',
      contentBase64: Buffer.from(content, 'utf-8').toString('base64'),
    });
    assert.ok(result.original, '文件导入应归档原件');
    assert.equal(result.original.ext, '.md');

    const backup = JSON.parse(await readFile(
      join(RAG_ROOT, collection.id, 'documents', `${result.documentId}.json`), 'utf-8',
    ));
    assert.equal(backup.original.sha256.length, 64);
    assert.equal(backup.source, 'file');

    const [doc] = await manager.listDocuments(collection.id);
    assert.equal(doc.id, result.documentId);
    assert.equal(doc.original.name, '导入文档.md');
    assert.equal(doc.chunkCount > 0, true);

    const detail = await manager.getDocument(collection.id, result.documentId);
    assert.equal(detail.name, '导入文档.md');
    assert.equal(detail.truncated, false);
    assert.equal(detail.text, content);
    assert.equal(detail.original.size, Buffer.byteLength(content, 'utf-8'));
  });

  test('文本导入：无原件但有文本，详情超长截断', async () => {
    const manager = makeManager({ enabled: true, maxBytesPerCollection: 1024 * 1024 });
    const collection = await manager.createCollection({ name: 'truncate' });
    const longText = 'a'.repeat(DOC_TEXT_VIEW_MAX_CHARS + 500);

    const result = await manager.ingestText(collection.id, { content: longText, name: '长文本' });
    assert.equal(result.original, undefined);

    const detail = await manager.getDocument(collection.id, result.documentId);
    assert.equal(detail.truncated, true);
    assert.equal(detail.text.length, DOC_TEXT_VIEW_MAX_CHARS);
    assert.equal(detail.totalChars, longText.length);
    assert.equal(detail.original, null);
  });

  test('备份不存在：documentNotFound', async () => {
    const manager = makeManager({ enabled: true, maxBytesPerCollection: 1024 });
    const collection = await manager.createCollection({ name: 'missing' });
    await assert.rejects(
      () => manager.getDocument(collection.id, 'doc_notexist'),
      (err) => err.code === 'documentNotFound',
    );
  });
});

describe('下载目标解析', () => {
  test('原件下载：返回路径/mime/大小；文本下载：现场生成', async () => {
    const manager = makeManager({ enabled: true, maxBytesPerCollection: 1024 * 1024 });
    const collection = await manager.createCollection({ name: 'download' });
    const bytes = Buffer.from('%PDF-1.4 fake', 'utf-8');
    const { original } = await manager._persistOriginal(collection.id, 'doc_dl', bytes, {
      name: '报告.pdf', ext: '.pdf', mime: 'application/pdf',
    });
    await manager._saveDocumentBackup(collection.id, {
      id: 'doc_dl', name: '报告.pdf', text: '正文', source: 'file',
      metadata: {}, chunkCount: 1, createdAt: new Date().toISOString(), original,
    });

    const originalTarget = await manager.resolveDocumentDownload(collection.id, 'doc_dl', 'original');
    assert.equal(originalTarget.kind, 'original');
    assert.equal(originalTarget.fileName, '报告.pdf');
    assert.equal(originalTarget.mime, 'application/pdf');
    assert.equal(originalTarget.size, bytes.length);

    const textTarget = await manager.resolveDocumentDownload(collection.id, 'doc_dl', 'text');
    assert.equal(textTarget.kind, 'text');
    assert.equal(textTarget.fileName, '报告.pdf.txt');
    assert.equal(textTarget.text, '正文');
  });

  test('无原件 / 归档文件丢失 / 非法 kind：对应错误码', async () => {
    const manager = makeManager({ enabled: true, maxBytesPerCollection: 1024 * 1024 });
    const collection = await manager.createCollection({ name: 'download-err' });
    await manager._saveDocumentBackup(collection.id, {
      id: 'doc_norg', name: '文本.txt', text: '只有文本', source: 'text',
      metadata: {}, chunkCount: 1, createdAt: new Date().toISOString(),
    });

    await assert.rejects(
      () => manager.resolveDocumentDownload(collection.id, 'doc_norg', 'original'),
      (err) => err.code === 'originalMissing' && /文本.txt/.test(err.params.name),
    );
    await assert.rejects(
      () => manager.resolveDocumentDownload(collection.id, 'doc_norg', 'zip'),
      (err) => err.code === 'unsupportedDownloadKind',
    );

    // 备份声明有原件但文件被手工删除：仍按 originalMissing 处理
    await manager._saveDocumentBackup(collection.id, {
      id: 'doc_ghost', name: '幽灵.pdf', text: 'x', source: 'file', metadata: {}, chunkCount: 1,
      createdAt: new Date().toISOString(),
      original: { name: '幽灵.pdf', ext: '.pdf', size: 10, mime: 'application/pdf', sha256: 'a'.repeat(64) },
    });
    await assert.rejects(
      () => manager.resolveDocumentDownload(collection.id, 'doc_ghost', 'original'),
      (err) => err.code === 'originalMissing',
    );
  });
});

describe('删除联动', () => {
  test('删除文档清掉原件与备份；删除知识库清掉原件目录', async () => {
    const manager = makeManager({ enabled: true, maxBytesPerCollection: 1024 * 1024 });
    const collection = await manager.createCollection({ name: 'cleanup' });

    const result = await manager.ingestFile(collection.id, {
      fileName: 'del.txt',
      contentBase64: Buffer.from('待删除内容', 'utf-8').toString('base64'),
    });
    const originalPath = join(ORIGINALS_ROOT, collection.id, `${result.documentId}.txt`);
    assert.equal((await readdir(join(ORIGINALS_ROOT, collection.id))).length, 1);

    await manager.deleteDocument(collection.id, result.documentId);
    await assert.rejects(() => readFile(originalPath), /ENOENT/);

    const result2 = await manager.ingestFile(collection.id, {
      fileName: 'del2.txt',
      contentBase64: Buffer.from('再次导入的内容', 'utf-8').toString('base64'),
    });
    assert.ok(result2.documentId);
    await manager.deleteCollection(collection.id);
    await assert.rejects(() => readdir(join(ORIGINALS_ROOT, collection.id)), /ENOENT/);
  });
});

// ==================== HTTP 层 ====================

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

  _write(chunk, _enc, cb) {
    this.chunks.push(Buffer.from(chunk));
    cb();
  }

  get buffer() {
    return Buffer.concat(this.chunks);
  }
}

async function call(pathname, { manager, method = 'GET' } = {}) {
  const res = new FakeRes();
  const url = new URL(`http://localhost${pathname}`);
  const done = once(res, 'finish').catch(() => {});
  await ragRouter({ method }, res, url.pathname, url, t);
  await done;
  return res;
}

describe('HTTP 路由：详情与下载', () => {
  test('详情返回原文，下载文本带 RFC 5987 文件名', async () => {
    const manager = makeManager({ enabled: true, maxBytesPerCollection: 1024 * 1024 });
    const collection = await manager.createCollection({ name: 'http' });
    const result = await manager.ingestText(collection.id, { content: '接口测试正文', name: '中文 名称' });

    const detail = await call(`/api/rag/collections/${collection.id}/documents/${result.documentId}`);
    assert.equal(detail.status, 200);
    assert.equal(JSON.parse(detail.buffer.toString('utf-8')).document.text, '接口测试正文');

    const download = await call(
      `/api/rag/collections/${collection.id}/documents/${result.documentId}/download?kind=text`,
    );
    assert.equal(download.status, 200);
    assert.equal(download.headers['Content-Type'], 'text/plain; charset=utf-8');
    assert.match(download.headers['Content-Disposition'], /filename\*=UTF-8''/);
    assert.match(download.headers['Content-Disposition'], /%E4%B8%AD%E6%96%87/);
    assert.equal(download.buffer.toString('utf-8'), '接口测试正文');
  });

  test('下载原件：返回归档字节与存储时 MIME', async () => {
    const manager = makeManager({ enabled: true, maxBytesPerCollection: 1024 * 1024 });
    const collection = await manager.createCollection({ name: 'http-original' });
    const payload = '原始文件内容 original bytes';
    const result = await manager.ingestFile(collection.id, {
      fileName: '报告.txt',
      contentBase64: Buffer.from(payload, 'utf-8').toString('base64'),
    });

    const download = await call(
      `/api/rag/collections/${collection.id}/documents/${result.documentId}/download?kind=original`,
    );
    assert.equal(download.status, 200);
    assert.equal(download.headers['Content-Type'], 'text/plain; charset=utf-8');
    assert.equal(download.buffer.toString('utf-8'), payload);
  });

  test('无原件下载原件：400 originalMissing；非法 kind：400 unsupportedDownloadKind', async () => {
    const manager = makeManager({ enabled: true, maxBytesPerCollection: 1024 * 1024 });
    const collection = await manager.createCollection({ name: 'http-err' });
    const result = await manager.ingestText(collection.id, { content: '只有文本的文档', name: '纯文本' });

    const missing = await call(
      `/api/rag/collections/${collection.id}/documents/${result.documentId}/download?kind=original`,
    );
    assert.equal(missing.status, 400);
    assert.equal(JSON.parse(missing.buffer.toString('utf-8')).code, 'originalMissing');

    const badKind = await call(
      `/api/rag/collections/${collection.id}/documents/${result.documentId}/download?kind=zip`,
    );
    assert.equal(badKind.status, 400);
    assert.equal(JSON.parse(badKind.buffer.toString('utf-8')).code, 'unsupportedDownloadKind');
  });
});
