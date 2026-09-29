// agent/test/unit/rag-collection-disable.unit.test.js
// 知识库停用功能单测（toggle 切换 + 停用库检索过滤）：
// 1) toggleCollection：缺省/undefined 视为启用 → 首次切换为停用；再次切换恢复启用；不存在抛 collectionNotFound
// 2) POST /api/rag/search 无 ids（LLM 自主跨库检索）→ 仅检索已启用库
// 3) POST /api/rag/search 显式 ids（@ 手动引用链路）→ 停用库照常检索（红线不变式，显式 IDs 禁止过滤）
// 4) POST /api/rag/collections/{id}/toggle 路由接线（响应 success/enabled）
// 隔离策略：AI_HELPER_RAG_ROOT 临时目录（先于 routes.js 动态 import——加载即建 manager 单例）
// 运行：node --test agent/test/unit/rag-collection-disable.unit.test.js
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RagManager } from '../../src/rag/manager.js';
import { RagError } from '../../src/rag/errors.js';

// 隔离数据根目录（先于 routes.js import）
const ragRoot = await mkdtemp(join(tmpdir(), 'rag-collection-disable-test-'));
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

async function call(pathname, method = 'GET', body = {}) {
  const res = makeRes();
  await ragRouter({ method, headers: {} }, res, pathname, new URL(`http://localhost${pathname}`), t, body);
  return res;
}

/**
 * 注册表读写打桩的 manager（跳过真实文件系统，聚焦状态切换逻辑）
 * getCollection/_assertCollectionId 走真实实现（复用原型）
 */
function makeStubManager(collections) {
  const mgr = Object.create(RagManager.prototype);
  let reg = { version: 1, collections };
  mgr._loadRegistry = async () => reg;
  mgr._updateRegistry = async (mutator) => {
    const out = mutator(reg) || reg;
    reg = out;
    return out;
  };
  return { mgr, getReg: () => reg };
}

describe('toggleCollection - 停用状态切换', () => {
  test('缺省 enabled 视为启用：首次切换变为停用并持久化', async () => {
    const { mgr, getReg } = makeStubManager([{ id: 'kb_a', name: 'A' }]);
    const result = await mgr.toggleCollection('kb_a');
    assert.deepEqual(result, { enabled: false });
    assert.equal(getReg().collections[0].enabled, false);
  });

  test('已停用：再次切换恢复启用', async () => {
    const { mgr, getReg } = makeStubManager([{ id: 'kb_a', name: 'A', enabled: false }]);
    const result = await mgr.toggleCollection('kb_a');
    assert.deepEqual(result, { enabled: true });
    assert.equal(getReg().collections[0].enabled, true);
  });

  test('显式 enabled=true 的库：切换为停用', async () => {
    const { mgr, getReg } = makeStubManager([{ id: 'kb_a', name: 'A', enabled: true }]);
    const result = await mgr.toggleCollection('kb_a');
    assert.deepEqual(result, { enabled: false });
    assert.equal(getReg().collections[0].enabled, false);
  });

  test('不存在的库：抛 collectionNotFound', async () => {
    const { mgr } = makeStubManager([]);
    await assert.rejects(
      () => mgr.toggleCollection('kb_missing'),
      (err) => err instanceof RagError && err.code === 'collectionNotFound'
    );
  });
});

describe('ragRouter - 停用库检索过滤（LLM 自主 vs @ 手动引用）', () => {
  // 原型补丁：routes.js 的 manager 单例共享原型方法
  const proto = RagManager.prototype;
  const orig = {
    listCollections: proto.listCollections,
    searchMulti: proto.searchMulti,
    toggleCollection: proto.toggleCollection,
  };
  const restore = () => {
    proto.listCollections = orig.listCollections;
    proto.searchMulti = orig.searchMulti;
    proto.toggleCollection = orig.toggleCollection;
  };

  test('无 ids（LLM 自主全库检索）：仅检索已启用库，停用库被排除', async () => {
    const calls = [];
    proto.listCollections = async () => [
      { id: 'kb_on', name: '启用库' },
      { id: 'kb_off', name: '停用库', enabled: false },
    ];
    proto.searchMulti = async (ids, q) => { calls.push(ids); return { query: q, results: [] }; };
    try {
      const res = await call('/api/rag/search', 'POST', { query: 'q' });
      assert.equal(res.status, 200);
      assert.deepEqual(calls[0], ['kb_on']);
    } finally {
      restore();
    }
  });

  test('全部库停用：无 ids 检索候选为空', async () => {
    const calls = [];
    proto.listCollections = async () => [{ id: 'kb_off', name: '停用库', enabled: false }];
    proto.searchMulti = async (ids, q) => { calls.push(ids); return { query: q, results: [] }; };
    try {
      const res = await call('/api/rag/search', 'POST', { query: 'q' });
      assert.equal(res.status, 200);
      assert.deepEqual(calls[0], []);
    } finally {
      restore();
    }
  });

  test('显式 ids（@ 手动引用红线）：停用库照常检索，显式 IDs 禁止过滤', async () => {
    const calls = [];
    proto.listCollections = async () => [{ id: 'kb_off', name: '停用库', enabled: false }];
    proto.searchMulti = async (ids, q) => { calls.push(ids); return { query: q, results: [] }; };
    try {
      const res = await call('/api/rag/search', 'POST', { query: 'q', collectionIds: ['kb_off'] });
      assert.equal(res.status, 200);
      assert.deepEqual(calls[0], ['kb_off']);
    } finally {
      restore();
    }
  });

  test('POST /api/rag/collections/{id}/toggle：路由接线（响应 {success, enabled}）', async () => {
    const seen = [];
    proto.toggleCollection = async (id) => { seen.push(id); return { enabled: false }; };
    try {
      const res = await call('/api/rag/collections/kb_abc/toggle', 'POST');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { success: true, enabled: false });
      assert.deepEqual(seen, ['kb_abc']);
    } finally {
      restore();
    }
  });
});
