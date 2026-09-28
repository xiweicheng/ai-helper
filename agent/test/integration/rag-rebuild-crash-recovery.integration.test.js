// agent/test/integration/rag-rebuild-crash-recovery.integration.test.js - R4 重建崩溃恢复
// 背景：重建换入是「旧索引移出 → 新索引就位 → 写注册表」的 rename 序列，
//       进程被杀（SIGKILL/断电）不走 catch：空窗期 finalDir 缺失、唯一数据在 tmpRoot，
//       且旧实现开头无条件 rm(tmpRoot) 会删掉唯一备份 → 永久丢数据。
// 覆盖：三种被杀形态的恢复收敛（回滚/提交/清理）+ 幂等 + 扫描入口 + 真实重建集成。
// 隔离策略：AI_HELPER_RAG_ROOT 临时目录（先于 manager import）+ mock embeddings 服务器（8 维）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, rename, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

// ---- 隔离数据根目录（先于 manager import）----
const ragRoot = await mkdtemp(join(tmpdir(), 'rag-crash-test-'));
process.env.AI_HELPER_RAG_ROOT = ragRoot;
const { RagManager } = await import('../../src/rag/manager.js');

// ---- mock embeddings 服务器（固定 8 维；仅「集成」用例使用）----
function createMockEmbeddingServer() {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch { /* ignore */ }
      const input = Array.isArray(payload.input) ? payload.input : [payload.input];
      const data = input.map((text, i) => ({
        index: i,
        embedding: Array.from({ length: 8 }, (_, k) => ((i + k) % 7) / 10 + 0.1),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data, model: payload.model }));
    });
  });
}

let server;
let endpoint;

before(async () => {
  server = createMockEmbeddingServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/v1`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(ragRoot, { recursive: true, force: true });
});

// ---- helpers ----

const finalDir = (id) => join(ragRoot, id);
const tmpRoot = (id) => join(ragRoot, `.rebuild_${id}`);
const exists = (p) => stat(p).then(() => true).catch(() => false);

function remoteConfig(model, dims = 8) {
  return { mode: 'openai-compat', endpoint, apiKey: 'test-key', modelName: model, dimensions: dims };
}

async function waitForDone(manager, collectionId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const p = manager.getIngestProgress(collectionId);
    if (p && p.done) return p;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timeout waiting for completion');
}

// 清单结构（与实现约定一致）
function manifestPayload(targetEmbeddingConfig, { chunkSize = 500, overlap = 50, documentCount = 0, chunkCount = 0 } = {}) {
  return {
    version: 1,
    targetEmbeddingConfig,
    targetChunkConfig: { chunkSize, overlap },
    documentCount,
    chunkCount,
    startedAt: new Date().toISOString(),
  };
}

// ---- 用例 ----

test('形态①换入空窗被杀（finalDir 缺失 + index_backup）：回滚旧索引，注册表不变', async () => {
  const manager = new RagManager();
  const created = await manager.createCollection({ name: 'crash-rollback' });
  const id = created.id;
  // 模拟被杀：旧索引已被移出到 tmpRoot/index_backup，新索引尚未就位
  await mkdir(tmpRoot(id), { recursive: true });
  await rename(finalDir(id), join(tmpRoot(id), 'index_backup'));
  assert.equal(await exists(finalDir(id)), false);

  const action = await manager._recoverInterruptedRebuild(id);
  assert.equal(action, 'rolled-back');
  assert.equal(await exists(join(finalDir(id), 'index.json')), true); // 旧索引已回滚就位
  assert.equal(await exists(tmpRoot(id)), false); // 临时目录已清理
  const after = await manager.getCollection(id);
  assert.equal(after.name, 'crash-rollback');
});

test('形态①且新索引已构建完成（tmpRoot/<id> 含清单）：恢复时完成换入并补提交', async () => {
  const manager = new RagManager();
  const created = await manager.createCollection({ name: 'crash-commit-new' });
  const id = created.id;
  const target = { mode: 'openai-compat', endpoint: 'https://recover.example.com/v1', apiKey: 'sk-r', modelName: 'recovered-model', dimensions: 4 };
  // 模拟被杀：新索引（含清单）已构建但未换入；旧索引在 index_backup；finalDir 缺失
  const newIndexDir = join(tmpRoot(id), id);
  await mkdir(newIndexDir, { recursive: true });
  await writeFile(join(newIndexDir, 'index.json'), JSON.stringify({ note: 'new-index' }), 'utf-8');
  await writeFile(join(newIndexDir, 'rebuild_manifest.json'), JSON.stringify(
    manifestPayload(target, { documentCount: 3, chunkCount: 7 })
  ), 'utf-8');
  await rename(finalDir(id), join(tmpRoot(id), 'index_backup'));

  const action = await manager._recoverInterruptedRebuild(id);
  assert.equal(action, 'committed');
  const idx = JSON.parse(await readFile(join(finalDir(id), 'index.json'), 'utf-8'));
  assert.equal(idx.note, 'new-index'); // 新索引已就位
  assert.equal(await exists(join(finalDir(id), 'rebuild_manifest.json')), false); // 清单已删
  assert.equal(await exists(tmpRoot(id)), false); // 临时目录（含旧备份）已清理
  const after = await manager.getCollection(id);
  assert.equal(after.embeddingConfig.modelName, 'recovered-model');
  assert.equal(after.embeddingConfig.dimensions, 4);
  assert.equal(after.documentCount, 3);
  assert.equal(after.chunkCount, 7);
});

test('形态②换入完成但注册表未提交被杀（finalDir 含清单）：用清单补提交并清理备份', async () => {
  const manager = new RagManager();
  const created = await manager.createCollection({ name: 'crash-commit-pending' });
  const id = created.id;
  const target = { mode: 'openai-compat', endpoint: 'https://recover.example.com/v1', apiKey: '', modelName: 'pending-model', dimensions: 6 };
  // 模拟被杀：新索引已就位（清单随之进入 finalDir），注册表仍是旧配置，旧索引备份残留
  await writeFile(join(finalDir(id), 'rebuild_manifest.json'), JSON.stringify(
    manifestPayload(target, { chunkSize: 800, overlap: 80, documentCount: 5, chunkCount: 11 })
  ), 'utf-8');
  await mkdir(join(tmpRoot(id), 'index_backup'), { recursive: true });
  await writeFile(join(tmpRoot(id), 'index_backup', 'index.json'), '{"old":true}', 'utf-8');

  const action = await manager._recoverInterruptedRebuild(id);
  assert.equal(action, 'committed');
  assert.equal(await exists(join(finalDir(id), 'rebuild_manifest.json')), false);
  assert.equal(await exists(tmpRoot(id)), false);
  const after = await manager.getCollection(id);
  assert.equal(after.embeddingConfig.modelName, 'pending-model');
  assert.equal(after.embeddingConfig.dimensions, 6);
  assert.equal(after.chunkConfig.chunkSize, 800);
  assert.equal(after.documentCount, 5);
  assert.equal(after.chunkCount, 11);
});

test('形态③注册表已提交仅残留临时目录：清理不触碰线上索引', async () => {
  const manager = new RagManager();
  const created = await manager.createCollection({ name: 'crash-cleanup' });
  const id = created.id;
  const beforeCfg = (await manager.getCollection(id)).embeddingConfig;
  await mkdir(join(tmpRoot(id), 'index_backup'), { recursive: true });
  await writeFile(join(tmpRoot(id), 'index_backup', 'stale.json'), '{}', 'utf-8');

  const action = await manager._recoverInterruptedRebuild(id);
  assert.equal(action, 'cleaned');
  assert.equal(await exists(tmpRoot(id)), false);
  assert.equal(await exists(join(finalDir(id), 'index.json')), true);
  const after = await manager.getCollection(id);
  assert.deepEqual(after.embeddingConfig, beforeCfg);
});

test('无残留时恢复为 no-op；重复恢复幂等', async () => {
  const manager = new RagManager();
  const created = await manager.createCollection({ name: 'crash-noop' });
  assert.equal(await manager._recoverInterruptedRebuild(created.id), 'none');
  assert.equal(await manager._recoverInterruptedRebuild(created.id), 'none');
});

test('扫描入口：批量恢复被中断的重建（幂等；非法目录名忽略）', async () => {
  const manager = new RagManager();
  const a = await manager.createCollection({ name: 'scan-a' });
  // 构造 A 的回滚形态
  await mkdir(tmpRoot(a.id), { recursive: true });
  await rename(finalDir(a.id), join(tmpRoot(a.id), 'index_backup'));
  // 非法目录名（非 kb_ 前缀）：不应被处理
  await mkdir(join(ragRoot, '.rebuild_invalid-name'), { recursive: true });

  const results = await manager.recoverInterruptedRebuilds();
  const recovered = results.find(r => r.collectionId === a.id);
  assert.equal(recovered?.action, 'rolled-back');
  assert.equal(await exists(finalDir(a.id)), true);
  assert.equal(await exists(join(ragRoot, '.rebuild_invalid-name')), true); // 非法目录未动
  // 幂等：再次扫描无待恢复项
  const again = await manager.recoverInterruptedRebuilds();
  assert.equal(again.length, 0);
});

test('集成：被中断的重建在下次重建开始时先回滚，文档数据不丢且重建成功', async () => {
  const manager = new RagManager();
  const created = await manager.createCollection({
    name: 'crash-then-rebuild',
    embeddingConfig: remoteConfig('model-a'),
  });
  const id = created.id;
  await manager.ingestText(id, { content: '崩溃恢复集成验证文档，内容用于重建重放。', name: 'survivor.txt' });
  assert.equal((await manager.getStats(id)).documentCount, 1);

  // 模拟上一次换入空窗被杀：finalDir → tmpRoot/index_backup，finalDir 缺失
  await mkdir(tmpRoot(id), { recursive: true });
  await rename(finalDir(id), join(tmpRoot(id), 'index_backup'));

  // 再次触发重建（旧实现开头无条件 rm(tmpRoot) 会删掉唯一备份 → 丢失数据、重建失败）
  const updated = await manager.updateCollection(id, { embeddingConfig: remoteConfig('model-b2') });
  assert.equal(updated.rebuilding, true);
  const progress = await waitForDone(manager, id);
  assert.equal(progress.phase, 'done', progress.error || '');

  // 文档仍在（回滚后重建读到了 documents 备份并重放）
  assert.equal((await manager.getStats(id)).documentCount, 1);
  const docs = await manager.listDocuments(id);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].name, 'survivor.txt');
  assert.equal((await manager.getCollection(id)).embeddingConfig.modelName, 'model-b2');
});
