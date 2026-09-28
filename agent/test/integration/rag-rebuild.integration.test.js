// agent/test/integration/rag-rebuild.integration.test.js - 远端向量配置与索引重建集成测试
// 隔离策略：
//   - AI_HELPER_RAG_ROOT 指向临时目录（必须在 import manager 前设置）
//   - mock HTTP embeddings 服务器（确定性向量；模型名含 "16" 返回 16 维，fail-model 返回 500）
// 覆盖：远端创建/导入 → 改模型触发重建 → 计数与检索保持；
//       重建失败保持旧索引旧配置；导入维度不匹配报错；重建期间并发导入被拒

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

// ---- 隔离数据根目录（先于 manager import）----
const ragRoot = await mkdtemp(join(tmpdir(), 'rag-rebuild-test-'));
process.env.AI_HELPER_RAG_ROOT = ragRoot;

const { RagManager } = await import('../../src/rag/manager.js');

// ---- mock embeddings 服务器 ----
const MOCK_DELAY_MS = 50; // 每次请求延迟，保证并发窗口稳定
const capturedPayloads = []; // 捕获每次请求体（供 dimensions 透传断言）

function createMockEmbeddingServer() {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      setTimeout(() => {
        let payload = {};
        try {
          payload = JSON.parse(body || '{}');
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'bad json' }));
          return;
        }
        capturedPayloads.push(payload);
        const model = String(payload.model || '');
        if (model === 'fail-model') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'mock failure' }));
          return;
        }
        // 模拟不支持 dimensions 参数的平台（如硅基流动 bge-m3）：带该参数 → 400 参数无效
        if (model.includes('dims-strict') && 'dimensions' in payload) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 20015, message: 'The parameter is invalid. Please check again.', data: null }));
          return;
        }
        const dims = model.includes('16') ? 16 : 8;
        const input = Array.isArray(payload.input) ? payload.input : [payload.input];
        const data = input.map((text, i) => ({
          index: i,
          embedding: Array.from({ length: dims }, (_, k) => ((i + k) % 7) / 10 + 0.1),
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data, model }));
      }, MOCK_DELAY_MS);
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

function remoteConfig(model, dims) {
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

// ---- 用例 ----

test('远端创建/导入 → 修改模型触发重建（配置切换、计数与检索保持）', async () => {
  const manager = new RagManager();
  const created = await manager.createCollection({
    name: 'rebuild-ok',
    embeddingConfig: remoteConfig('model-a', 8),
  });
  assert.equal(created.embeddingConfig.mode, 'openai-compat');
  assert.equal(created.embeddingConfig.modelName, 'model-a');
  assert.equal(created.embeddingConfig.dimensions, 8);
  assert.equal(created.embeddingConfig.queryPrefix, ''); // 远端模式不继承 BGE 查询前缀

  await manager.ingestText(created.id, { content: '苹果是一种常见的水果，富含维生素。', name: 'doc-a' });
  await manager.ingestText(created.id, { content: '香蕉富含钾元素，是运动员喜爱的水果。', name: 'doc-b' });
  const before = await manager.getStats(created.id);
  assert.equal(before.documentCount, 2);
  assert.ok(before.chunkCount > 0);
  const searchBefore = await manager.search(created.id, '水果');
  assert.ok(searchBefore.results.length > 0);

  // 修改模型与维度 → 触发后台重建（mock 对含 "16" 的模型返回 16 维）
  const updated = await manager.updateCollection(created.id, {
    embeddingConfig: remoteConfig('model-b-16', 16),
  });
  assert.equal(updated.rebuilding, true);

  const progress = await waitForDone(manager, created.id);
  assert.equal(progress.phase, 'done');
  assert.equal(progress.error, null);

  // 新配置生效 + 计数保持
  const after = await manager.getCollection(created.id);
  assert.equal(after.embeddingConfig.modelName, 'model-b-16');
  assert.equal(after.embeddingConfig.dimensions, 16);
  assert.equal(after.documentCount, before.documentCount);
  assert.equal(after.chunkCount, before.chunkCount);

  // 检索走新 provider（16 维）与新索引，不再报维度错误
  const searchAfter = await manager.search(created.id, '水果');
  assert.ok(searchAfter.results.length > 0);
});

test('重建失败：旧索引与旧配置保持可用', async () => {
  const manager = new RagManager();
  const created = await manager.createCollection({
    name: 'rebuild-fail',
    embeddingConfig: remoteConfig('model-a', 8),
  });
  await manager.ingestText(created.id, { content: '用于验证回退的测试文档内容。', name: 'keep-doc' });

  const updated = await manager.updateCollection(created.id, {
    embeddingConfig: remoteConfig('fail-model', 8),
  });
  assert.equal(updated.rebuilding, true);

  const progress = await waitForDone(manager, created.id);
  assert.equal(progress.phase, 'error');
  assert.ok(progress.error);

  // 注册表仍为旧配置；旧索引可正常统计与检索
  const after = await manager.getCollection(created.id);
  assert.equal(after.embeddingConfig.modelName, 'model-a');
  const stats = await manager.getStats(created.id);
  assert.equal(stats.documentCount, 1);
  const search = await manager.search(created.id, '测试文档');
  assert.ok(search.results.length > 0);
});

test('导入维度不匹配：立即报 embeddingDimensionMismatch 且索引不写入', async () => {
  const manager = new RagManager();
  const created = await manager.createCollection({
    name: 'dim-mismatch',
    embeddingConfig: remoteConfig('model-16x', 8), // mock 对含 "16" 的模型返回 16 维
  });

  await assert.rejects(
    () => manager.ingestText(created.id, { content: '维度不匹配测试内容。', name: 'dim-doc' }),
    (err) => err.code === 'embeddingDimensionMismatch'
  );

  const stats = await manager.getStats(created.id);
  assert.equal(stats.documentCount, 0);
  assert.equal(stats.chunkCount, 0);
});

test('重建进行中拒绝并发导入（operationInProgress）', async () => {
  const manager = new RagManager();
  const created = await manager.createCollection({
    name: 'concurrency',
    embeddingConfig: remoteConfig('model-a', 8),
  });
  await manager.ingestText(created.id, { content: '初始种子文档。', name: 'seed' });

  // 触发重建（mock 有延迟，重建仍在进行中）
  await manager.updateCollection(created.id, {
    embeddingConfig: remoteConfig('model-b-16', 16),
  });

  await assert.rejects(
    () => manager.ingestText(created.id, { content: '并发导入内容。', name: 'concurrent' }),
    (err) => err.code === 'operationInProgress'
  );

  const progress = await waitForDone(manager, created.id);
  assert.equal(progress.phase, 'done');
});

test('配置校验：远端缺 endpoint / 非法维度被拒绝', async () => {
  const manager = new RagManager();
  await assert.rejects(
    () => manager.createCollection({
      name: 'invalid-1',
      embeddingConfig: { mode: 'openai-compat', modelName: 'm', dimensions: 8 },
    }),
    (err) => err.code === 'invalidEmbeddingEndpoint'
  );
  await assert.rejects(
    () => manager.createCollection({
      name: 'invalid-2',
      embeddingConfig: { mode: 'openai-compat', endpoint, modelName: 'm', dimensions: -1 },
    }),
    (err) => err.code === 'invalidEmbeddingDimensions'
  );
});

test('dimensions 透传：显式指定时请求携带 dimensions，未指定时不携带', async () => {
  const manager = new RagManager();

  // 显式指定 8 维 → 请求体透传 dimensions: 8
  const withDims = await manager.createCollection({
    name: 'dims-explicit',
    embeddingConfig: remoteConfig('model-dims', 8),
  });
  capturedPayloads.length = 0;
  await manager.ingestText(withDims.id, { content: '显式维度透传测试文本。', name: 'd1' });
  assert.ok(capturedPayloads.length > 0);
  assert.equal(capturedPayloads[0].dimensions, 8);

  // 未指定（0）→ 请求体不带 dimensions 字段（使用平台默认维度）
  const noDims = await manager.createCollection({
    name: 'dims-default',
    embeddingConfig: { mode: 'openai-compat', endpoint, apiKey: 'test-key', modelName: 'model-dims' },
  });
  assert.equal(noDims.embeddingConfig.dimensions, 0); // 远端未指定 → 0（语义：跟随平台默认）
  capturedPayloads.length = 0;
  await manager.ingestText(noDims.id, { content: '默认维度测试文本。', name: 'd2' });
  assert.ok(capturedPayloads.length > 0);
  assert.ok(!('dimensions' in capturedPayloads[0]));
});

test('平台不支持 dimensions（400）：自动降级重试不带参数，导入成功', async () => {
  const manager = new RagManager();
  const created = await manager.createCollection({
    name: 'dims-strict',
    embeddingConfig: remoteConfig('dims-strict-model', 8),
  });
  capturedPayloads.length = 0;
  await manager.ingestText(created.id, { content: '降级重试测试文本。', name: 'd1' });
  // 第一次带 dimensions:8（被 400 拒绝），第二次自动降级不带 dimensions（成功）
  assert.equal(capturedPayloads.length, 2);
  assert.equal(capturedPayloads[0].dimensions, 8);
  assert.ok(!('dimensions' in capturedPayloads[1]));
  // mock 降级后返回 8 维，与配置一致 → 导入成功
  const stats = await manager.getStats(created.id);
  assert.equal(stats.documentCount, 1);
});
