// agent/test/unit/rag-route-path-encoding.unit.test.js
// S4c 路由路径解码防护单测：畸形 % 编码（%zz / 不完整多字节序列）不再让 URIError
// 冒泡成 500（server 兜底 error.internal），而是按业务语义 400
// 隔离策略：AI_HELPER_RAG_ROOT 临时目录（先于 routes.js 动态 import——加载即建 manager 单例）
// 运行：node --test agent/test/unit/rag-route-path-encoding.unit.test.js
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 隔离数据根目录（先于 routes.js import）
const ragRoot = await mkdtemp(join(tmpdir(), 'rag-route-enc-test-'));
process.env.AI_HELPER_RAG_ROOT = ragRoot;
const { ragRouter } = await import('../../src/rag/routes.js');

after(async () => {
  await rm(ragRoot, { recursive: true, force: true });
});

// t 桩：错误文案不参与断言，仅校验错误码分支
const t = (key) => key;

function makeRes() {
  return {
    req: { headers: {} },
    status: 0,
    body: null,
    writeHead(status) { this.status = status; },
    end(data) { this.body = JSON.parse(String(data)); },
  };
}

async function call(pathname, method = 'GET') {
  const res = makeRes();
  await ragRouter({ method }, res, pathname, new URL(`http://localhost${pathname}`), t);
  return res;
}

describe('ragRouter 路径解码防护（S4c）', () => {
  test('collectionId 畸形编码：400 invalidCollectionId（不再 URIError 冒泡）', async () => {
    const res = await call('/api/rag/collections/%zz');
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'invalidCollectionId');
  });

  test('docId 畸形编码（不完整多字节序列）：400 invalidDocumentId', async () => {
    const res = await call('/api/rag/collections/kb_abc/documents/%E0%A4%A', 'DELETE');
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'invalidDocumentId');
  });

  test('回归：合法百分号编码正常解码并进入业务层', async () => {
    // kb%5Fabc 解码为 kb_abc：ID 格式合法 → 进入注册表查询 → 隔离目录中不存在
    const res = await call('/api/rag/collections/kb%5Fabc', 'DELETE');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'collectionNotFound');
  });
});
