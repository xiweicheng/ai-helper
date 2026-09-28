// S4b 回归测试：用户 metadata 不得覆盖系统保留键
// - 存储层（VectraStore）：documentId/chunkIndex/totalChunks/text/startPos/endPos 以系统写入值为准
// - 业务层（RagManager._ingestText）：documentName/source/createdAt 以系统写入值为准
// 恶意键既不生效，也不制造孤儿分块（仍可按系统 documentId 删除/检索）
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { VectraStore } from '../../src/rag/store/vectra.js';
import { RagManager } from '../../src/rag/manager.js';

describe('S4b: VectraStore 系统保留键不可被用户 metadata 覆盖', () => {
  let root;
  before(async () => { root = await mkdtemp(join(tmpdir(), 'rag-vectra-meta-')); });
  after(async () => { await rm(root, { recursive: true, force: true }); });

  test('恶意 metadata 无法覆盖分块系统字段，自定义键保留', async () => {
    const store = new VectraStore('kb1', root);
    await store.upsertChunks('doc1', [{ text: 'hello', startPos: 0, endPos: 5 }], [[0.1, 0.2, 0.3]], {
      documentId: 'EVIL',
      chunkIndex: 999,
      totalChunks: 0,
      text: 'EVIL',
      startPos: -1,
      endPos: -1,
      documentName: '我的文档',
      custom: 'ok',
    });

    const chunks = await store.listDocumentChunks('doc1');
    assert.equal(chunks.length, 1, '分块应可按系统 documentId 检索到');
    const m = chunks[0].metadata;
    assert.equal(m.documentId, 'doc1');
    assert.equal(m.chunkIndex, 0);
    assert.equal(m.totalChunks, 1);
    assert.equal(m.text, 'hello');
    assert.equal(m.startPos, 0);
    assert.equal(m.endPos, 5);
    assert.equal(m.documentName, '我的文档', '非保留键应原样保留');
    assert.equal(m.custom, 'ok', '自定义键应原样保留');
  });

  test('被覆盖的 documentId 不能制造孤儿分块（仍可按系统 ID 删除）', async () => {
    const store = new VectraStore('kb2', root);
    await store.upsertChunks('doc2', [{ text: 't', startPos: 0, endPos: 1 }], [[0.1, 0.2, 0.3]], {
      documentId: 'OTHER',
    });
    assert.equal(await store.removeDocument('doc2'), 1);
    assert.equal((await store.listDocumentChunks('doc2')).length, 0);
  });
});

describe('S4b: _ingestText 业务保留键不可被用户 metadata 覆盖', () => {
  test('documentName/source/createdAt 以系统值为准', async () => {
    const captured = [];
    const original = VectraStore.prototype.upsertChunks;
    VectraStore.prototype.upsertChunks = async (documentId, chunks, embeddings, metadata) => {
      captured.push({ documentId, metadata });
    };
    try {
      const mgr = Object.create(RagManager.prototype);
      mgr._activeOps = new Set();
      mgr._reportProgress = () => {};
      mgr.getCollection = async () => ({
        id: 'kb1',
        embeddingConfig: { dimensions: 3 },
        chunkConfig: { chunkSize: 400, overlap: 80 },
      });
      mgr._getProvider = () => ({ embedDocuments: async (texts) => texts.map(() => [0.1, 0.2, 0.3]) });
      mgr._saveDocumentBackup = async () => {};
      mgr._updateRegistry = async () => {};

      await mgr.ingestText('kb1', {
        content: '保留键测试内容 reserved keys test',
        name: 'real-name',
        metadata: { documentName: 'EVIL', source: 'EVIL', createdAt: 'EVIL' },
      });

      assert.equal(captured.length, 1);
      const m = captured[0].metadata;
      assert.equal(m.documentName, 'real-name');
      assert.equal(m.source, 'text');
      assert.notEqual(m.createdAt, 'EVIL');
      assert.match(m.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    } finally {
      VectraStore.prototype.upsertChunks = original;
    }
  });
});
