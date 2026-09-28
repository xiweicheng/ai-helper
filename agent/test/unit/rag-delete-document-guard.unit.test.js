// agent/test/unit/rag-delete-document-guard.unit.test.js
// R5 防回归：deleteDocument 接入并发防护（_assertIdle + _activeOps 占位）
// 背景：导入/重建进行中并发删除文档会与索引写事务交错，可写坏索引
// 运行：node --test agent/test/unit/rag-delete-document-guard.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 隔离数据根目录（先于 manager import）
const ragRoot = await mkdtemp(join(tmpdir(), 'rag-delguard-test-'));
process.env.AI_HELPER_RAG_ROOT = ragRoot;
const { RagManager } = await import('../../src/rag/manager.js');
const { RagError } = await import('../../src/rag/errors.js');

// 断言：以指定错误码被拒绝
const rejectedWith = (code) => (err) => {
  assert.ok(err instanceof RagError, `期望 RagError 拒绝，实际: ${err.constructor.name}: ${err.message}`);
  assert.equal(err.code, code);
  return true;
};

describe('deleteDocument 并发防护（R5）', () => {
  test('同库有导入/重建进行中（_activeOps 占位）时，删除文档被拒', async () => {
    const manager = new RagManager();
    const col = await manager.createCollection({ name: '删除防护-A' });
    // 白盒模拟进行中的导入/重建：_activeOps 是该库的长任务占位集合
    manager._activeOps.add(col.id);
    try {
      await assert.rejects(
        () => manager.deleteDocument(col.id, 'doc_deadbeef0'),
        rejectedWith('operationInProgress')
      );
    } finally {
      manager._activeOps.delete(col.id);
    }
  });

  test('删除（含不存在文档的 no-op）完成后占位释放，不残留 _activeOps', async () => {
    const manager = new RagManager();
    const col = await manager.createCollection({ name: '删除防护-B' });
    const r1 = await manager.deleteDocument(col.id, 'doc_missing000');
    assert.equal(r1.removedChunks, 0);
    assert.equal(manager._activeOps.has(col.id), false);
    // 占位未残留：后续删除不被误拦
    const r2 = await manager.deleteDocument(col.id, 'doc_missing111');
    assert.equal(r2.removedChunks, 0);
  });
});
