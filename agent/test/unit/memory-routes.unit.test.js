/**
 * memory-routes.unit.test.js
 * /api/memory/* 路由分发层测试：只测分发与 HTTP 语义（业务行为由 memory-service.unit.test.js 覆盖）
 * 通过 options.service 注入临时目录 service，避免读写真实 ~/.ai-helper-agent 记忆文件
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryDispatch } from '../../src/memory/routes.js';
import { createMemoryService } from '../../src/memory/service.js';
import { createVectorStoreFacade } from '../../src/memory/vectors.js';

// 占位翻译桩：保留参数渲染，使 note 等插值可被断言
const T = (key, params) => `${key}:${JSON.stringify(params ?? {})}`;

function mkReq(method = 'POST') {
  return { method, headers: { origin: 'chrome-extension://test-ext' } };
}

function mkRes() {
  const res = {
    statusCode: 0,
    headers: null,
    body: null,
    writeHead(status, headers) { res.statusCode = status; res.headers = headers; },
    end(body) { res.body = JSON.parse(body); }
  };
  return res;
}

function withRouter(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mem-route-'));
  // 与 memory-service 的 withService 同一隔离口径：不供这四个注入点就会读用户真实
  // config.json、拿真 key 联网、写他真实的向量缓存（缘由见那个夹具的注释块）。
  const service = createMemoryService({
    filePath: join(dir, 'global-memory.json'),
    vectorsFilePath: join(dir, 'memory-vectors.json'),
    embeddingConfigProvider: () => ({ enabled: false }),
    tierResolver: () => 'none',
    embedderFactory: () => { throw new Error('路由夹具不得创建 embedding provider'); }
  });
  const call = (req, res, pathname, body) => {
    // 真实 ServerResponse 由 Node 原生挂接 res.req，mock 需显式补齐（getAllowedOrigin 依赖）
    res.req = req;
    return memoryDispatch(req, res, pathname, new URL('http://127.0.0.1' + pathname), T, body, { service });
  };
  return Promise.resolve(fn({ call, service })).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe('memoryDispatch 分发', () => {
  it('未知子路径返回 404 unknownApiPath', () => withRouter(async ({ call }) => {
    const res = mkRes();
    await call(mkReq(), res, '/api/memory/nope', {});
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes('error.unknownApiPath'));
  }));

  it('非 POST 方法返回 404', () => withRouter(async ({ call }) => {
    const res = mkRes();
    await call(mkReq('GET'), res, '/api/memory/store', {});
    assert.equal(res.statusCode, 404);
  }));

  it('store 分发到 service 并回 200 契约形状与 CORS 头', () => withRouter(async ({ call }) => {
    const res = mkRes();
    await call(mkReq(), res, '/api/memory/store', { action: 'add', type: 'fact', content: '路由冒烟' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.action, 'added');
    assert.match(res.body.memory.id, /^fact_/);
    assert.equal(res.headers['Access-Control-Allow-Origin'], 'chrome-extension://test-ext');
  }));

  it('recall 从请求体取 sessionId 并透传（二次召回同会话提示全旧）', () => withRouter(async ({ call }) => {
    await call(mkReq(), mkRes(), '/api/memory/store', { action: 'add', type: 'fact', content: '会话去重命中' });
    const r1 = mkRes();
    await call(mkReq(), r1, '/api/memory/recall', { query: '会话去重', sessionId: 'sess-r' });
    assert.equal(r1.statusCode, 200);
    assert.equal(r1.body.total, 1);
    const r2 = mkRes();
    await call(mkReq(), r2, '/api/memory/recall', { query: '会话去重', sessionId: 'sess-r' });
    assert.ok(r2.body.message.includes('recallNoteAllOld'));
  }));

  it('manage 分发（review）返回 scored/candidates', () => withRouter(async ({ call }) => {
    await call(mkReq(), mkRes(), '/api/memory/store', { action: 'add', type: 'fact', content: '待审查', importance: 1 });
    const res = mkRes();
    await call(mkReq(), res, '/api/memory/manage', { action: 'review' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.scored.length, 1);
    assert.ok(Array.isArray(res.body.candidates));
  }));

  it('inject 分发返回分级注入选择结果', () => withRouter(async ({ call }) => {
    await call(mkReq(), mkRes(), '/api/memory/store', { action: 'add', type: 'fact', content: '常驻项', importance: 9 });
    const res = mkRes();
    await call(mkReq(), res, '/api/memory/inject', {});
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.injected.length, 1);
    assert.equal(typeof res.body.remainingCount, 'number');
  }));

  it('service 业务失败（缺 action）返回 400 且带 error', () => withRouter(async ({ call }) => {
    const res = mkRes();
    await call(mkReq(), res, '/api/memory/store', { type: 'fact', content: 'x' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes('memory.missingAction'));
  }));

  it('service 抛错时返回 400 而非冒泡 500', () => withRouter(async ({ call }) => {
    const res = mkRes();
    const broken = { store: async () => { throw new Error('boom'); } };
    await memoryDispatch(mkReq(), res, '/api/memory/store', new URL('http://127.0.0.1/api/memory/store'), T, {}, { service: broken });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'boom');
  }));
});

describe('reindex 端点', () => {
  const callReindex = (method = 'POST', service) => {
    const res = mkRes();
    return memoryDispatch(
      mkReq(method), res, '/api/memory/reindex',
      new URL('http://127.0.0.1/api/memory/reindex'), T, {}, { service }
    ).then(() => res);
  };

  it('POST /api/memory/reindex 透传 backfillVectors 结果（t 作为唯一参数）', async () => {
    let gotT = null;
    const res = await callReindex('POST', {
      backfillVectors: async (t) => { gotT = t; return { success: true, indexed: 3 }; }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.indexed, 3);
    assert.equal(typeof gotT, 'function', '必须把请求语言的 t 传进去渲染跳过原因');
  });

  it('A 档返回 skipped 仍是 200（未启用不是错误）', async () => {
    const res = await callReindex('POST', {
      backfillVectors: async () => ({ success: true, skipped: true, reason: 'memory.embeddingDisabled' })
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.skipped, true);
  });

  it('嵌入整体失败时返回 400 与 error', async () => {
    const res = await callReindex('POST', {
      backfillVectors: async () => ({ success: false, indexed: 0, error: 'embedding_timeout' })
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'embedding_timeout');
  });

  it('reindex 只接受 POST', async () => {
    const res = await callReindex('GET', { backfillVectors: async () => ({ success: true, indexed: 0 }) });
    assert.equal(res.statusCode, 404);
  });
});

// vector-status 夹具：同时隔离向量缓存路径、配置来源与嵌入工厂。
// 三者缺一不可：复用 withRouter 会读真实 ~/.ai-helper-agent/memory/memory-vectors.json（碍用户数据且断言不可控），
// 不供 embedderFactory 则 store 的懒补会拿真 provider 联网/下载模型。
// 注：withRouter 本身已于 2026-10-13 补上同口径隔离，不再依赖本夹具单独兜底。
function withStatusRoute(cfg, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mem-status-route-'));
  const vectorsFilePath = join(dir, 'memory-vectors.json');
  const service = createMemoryService({
    filePath: join(dir, 'global-memory.json'),
    vectorsFilePath,
    embeddingConfigProvider: () => ({ enabled: false, mode: 'openai-compat', baseUrl: '', modelName: 'm', apiKey: '', dimensions: 3, queryPrefix: '', ...cfg }),
    tierResolver: () => (cfg.enabled === true ? 'remote' : 'none'),
    embedderFactory: () => ({ embedQuery: async () => [1, 0, 0], embedDocuments: async (texts) => texts.map(() => [0, 1, 0]) })
  });
  const call = (method, pathname) => {
    const req = { method, headers: { origin: 'chrome-extension://test-ext' } };
    const res = {
      statusCode: 0, headers: null, body: null,
      writeHead(status, headers) { res.statusCode = status; res.headers = headers; },
      end(body) { res.body = JSON.parse(body); }
    };
    res.req = req;
    return memoryDispatch(req, res, pathname, new URL('http://127.0.0.1' + pathname), T, {}, { service })
      .then(() => res);
  };
  return Promise.resolve(fn({ call, service, vectorsFilePath })).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe('GET /api/memory/vector-status', () => {
  it('GET 合法：返回 200 与状态字段（向量档未启用也不报错）', () => withStatusRoute({}, async ({ call, service }) => {
    await service.store({ action: 'add', type: 'fact', content: '一条记忆', tags: [], importance: 5 }, T);
    const res = await call('GET', '/api/memory/vector-status');
    assert.equal(res.statusCode, 200, '只读状态不因未启用向量档而报错');
    assert.equal(res.body.success, true);
    for (const k of ['indexed', 'total', 'storedModelKey', 'currentModelKey', 'stale', 'tier']) {
      assert.ok(k in res.body, `缺少字段 ${k}`);
    }
    assert.equal(res.body.total, 1);
    assert.equal(res.body.tier, 'none');
  }));

  it('换了模型没重建 → stale 为真（界面据此标红）', () => withStatusRoute({ enabled: true }, async ({ call, vectorsFilePath }) => {
    const store = createVectorStoreFacade({ filePath: vectorsFilePath });
    await store.upsertVectors([['fact_a', [1, 0, 0]]], 'openai-compat|old-model|3');
    const res = await call('GET', '/api/memory/vector-status');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.stale, true);
    assert.equal(res.body.indexed, 1);
    assert.equal(res.body.storedModelKey, 'openai-compat|old-model|3');
    assert.equal(res.body.currentModelKey, 'openai-compat|m|3', '指纹走 memoryModelKey，不自己拼');
  }));

  it('非 GET 方法落到通用分发 → 404（不新增业务路由）', () => withStatusRoute({}, async ({ call }) => {
    const res = await call('POST', '/api/memory/vector-status');
    assert.equal(res.statusCode, 404);
  }));
});
