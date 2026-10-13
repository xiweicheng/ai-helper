// agent/test/unit/memory-embedding-config.unit.test.js
// 记忆语义召回的 embedding 配置读写/脱敏 + 两个配置端点的 HTTP 语义。
// 注意：config.js 的 AGENT_DIR 在模块加载时用 homedir() 求值，且 loadConfig() 首次会写默认
// config.json —— 因此必须在 import 之前把 HOME 指向临时目录（沿用 rag-detect-probe 的做法），
// 绝不写用户真实的 ~/.ai-helper-agent/config.json。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'aha-memcfg-'));
process.env.HOME = home;

const {
  DEFAULT_MEMORY_EMBEDDING_CONFIG,
  getMemoryEmbeddingConfig,
  maskMemoryEmbeddingConfig,
  saveMemoryEmbeddingConfig,
  toEmbeddingProviderConfig,
} = await import('../../src/memory/embedding-config.js');

const { memoryDispatch } = await import('../../src/memory/routes.js');

// 真实的 rag/embedding 工厂：queryPrefix 的回落权丢失只能在「配置出口 → provider」的接缝上才会显形，
// 注入假工厂的 service 单测永远看不到（与 baseUrl ⇄ endpoint 错位同一类盲区）。
const { EmbeddingProvider } = await import('../../src/rag/embedding/index.js');

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

// 配置端点会走 loadConfig/updateConfigField，与 routes 单例共享临时 HOME 即可
function callRoute(method, pathname, body = {}, options = {}) {
  const req = mkReq(method);
  const res = mkRes();
  res.req = req;
  return memoryDispatch(req, res, pathname, new URL('http://127.0.0.1' + pathname), T, body, options)
    .then(() => res);
}

after(() => {
  rmSync(home, { recursive: true, force: true });
});

// ==================== 配置模块 ====================

test('导出默认值为关闭态', () => {
  assert.equal(DEFAULT_MEMORY_EMBEDDING_CONFIG.enabled, false);
  assert.equal(DEFAULT_MEMORY_EMBEDDING_CONFIG.mode, 'openai-compat');
  assert.equal(getMemoryEmbeddingConfig().enabled, false);
});

test('脱敏不回显明文 key，并给出 hasApiKey', () => {
  const masked = maskMemoryEmbeddingConfig({ ...DEFAULT_MEMORY_EMBEDDING_CONFIG, apiKey: 'sk-secret' });
  assert.equal(masked.apiKey, '');
  assert.equal(masked.hasApiKey, true);
  assert.ok(!JSON.stringify(masked).includes('sk-secret'));
});

test('未配置过 key 时 hasApiKey 为 false', () => {
  assert.equal(maskMemoryEmbeddingConfig(DEFAULT_MEMORY_EMBEDDING_CONFIG).hasApiKey, false);
});

test('空白 apiKey 视为不修改，其余字段照常更新', async () => {
  await saveMemoryEmbeddingConfig({ enabled: true, modelName: 'text-embedding-3-small', apiKey: 'sk-keep' });
  const saved = await saveMemoryEmbeddingConfig({ apiKey: '   ', modelName: 'text-embedding-3-large' });
  assert.equal(getMemoryEmbeddingConfig().apiKey, 'sk-keep');
  assert.equal(saved.modelName, 'text-embedding-3-large');
  assert.equal(saved.enabled, true);
  assert.equal(saved.apiKey, '');
});

test('非法 mode 被拒绝且不落盘', async () => {
  await assert.rejects(() => saveMemoryEmbeddingConfig({ mode: 'magic' }));
  assert.equal(getMemoryEmbeddingConfig().mode, 'openai-compat');
});

test('enabled 只认真 true，dimensions 规整为非负整数', async () => {
  const a = await saveMemoryEmbeddingConfig({ enabled: 'yes', dimensions: 1536.7 });
  assert.equal(a.enabled, false);
  assert.equal(a.dimensions, 1536);
  const b = await saveMemoryEmbeddingConfig({ enabled: true, dimensions: -3 });
  assert.equal(b.enabled, true);
  assert.equal(b.dimensions, 0);
});

test('provider 配置出口把 baseUrl 映射成 rag/embedding 读取的 endpoint', () => {
  const out = toEmbeddingProviderConfig({
    mode: 'openai-compat', baseUrl: 'https://api.example.com/v1', apiKey: 'sk-x', modelName: 'm1', dimensions: 1536
  });
  // 字段名不一致曾让远端档永远 fetch('/embeddings')：endpoint 必须由 baseUrl 派生，不能靠调用方记得映射
  assert.equal(out.endpoint, 'https://api.example.com/v1');
  assert.equal(out.baseUrl, 'https://api.example.com/v1');
  assert.equal(out.mode, 'openai-compat');
  assert.equal(out.apiKey, 'sk-x');
  assert.equal(out.modelName, 'm1');
  assert.equal(out.dimensions, 1536);
});

test('空 queryPrefix 不交出键：本地档才能拿到 provider 的 BGE 查询前缀', () => {
  // 记忆配置面缺省是空串（不是 undefined），而 provider 用 `??` 判空——空串不是 nullish。
  // 原样传出会让 mode:'local' 的查询前缀永远是 ''（实测日志 queryPrefix: off）。
  const out = toEmbeddingProviderConfig({ mode: 'local', modelName: 'Xenova/bge-small-zh-v1.5', queryPrefix: '' });
  assert.ok(!('queryPrefix' in out), '空串不得作为 queryPrefix 传给 provider');
  assert.ok(!('queryPrefix' in toEmbeddingProviderConfig({ mode: 'local', queryPrefix: '   ' })), '纯空白等同未设置');
});

test('显式 queryPrefix 原样透传（用户自己定的前缀不得被回落逻辑抹掉）', () => {
  const prefix = '为这个句子生成表示以用于检索相关文章：';
  assert.equal(toEmbeddingProviderConfig({ mode: 'local', queryPrefix: prefix }).queryPrefix, prefix);
});

test('接缝：记忆缺省配置经出口给到真实 provider 时，本地档必须拿到非空前缀', () => {
  // 这一条钉的是跨模块契约本身——上面的字段级断言全绿也可能被 provider 侧的判空口径推翻。
  const cfg = { ...DEFAULT_MEMORY_EMBEDDING_CONFIG, mode: 'local', enabled: true };
  const localProvider = new EmbeddingProvider(toEmbeddingProviderConfig(cfg));
  assert.ok(localProvider.queryPrefix, '本地档 provider 的查询前缀不得为空');
  // 远端档不受影响：非 local 本就该无前缀（BGE 前缀对远端模型是噪声）
  const remoteProvider = new EmbeddingProvider(toEmbeddingProviderConfig({ ...cfg, mode: 'openai-compat', apiKey: 'k', modelName: 'm' }));
  assert.equal(remoteProvider.queryPrefix, '');
});

// ==================== 配置端点 ====================

test('GET /embedding-config 返回脱敏配置', async () => {
  await saveMemoryEmbeddingConfig({ apiKey: 'sk-endpoint-secret', modelName: 'm1' });
  const res = await callRoute('GET', '/api/memory/embedding-config');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.config.apiKey, '');
  assert.equal(res.body.config.hasApiKey, true);
  assert.equal(res.body.config.modelName, 'm1');
  assert.ok(!JSON.stringify(res.body).includes('sk-endpoint-secret'));
});

test('POST /embedding-config 非法 mode 返回 400', async () => {
  const res = await callRoute('POST', '/api/memory/embedding-config', { mode: 'nope' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

test('POST /embedding-config 用 GET 以外的未知方法返回 404', async () => {
  const res = await callRoute('PUT', '/api/memory/embedding-config', {});
  assert.equal(res.statusCode, 404);
});

test('POST /test-embedding 成功时回报维度，不含明文 key', async () => {
  const fake = { embedQuery: async () => [0.1, 0.2, 0.3] };
  const res = await callRoute('POST', '/api/memory/test-embedding', { modelName: 'm1' }, { createProvider: () => fake });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.dimensions, 3);
});

test('POST /test-embedding 失败回落 400 而不抛给调用方', async () => {
  const fake = { embedQuery: async () => { throw new Error('boom'); } };
  const res = await callRoute('POST', '/api/memory/test-embedding', {}, { createProvider: () => fake });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'boom');
});

test('POST /test-embedding 超时保护返回 400 embedding_timeout', async () => {
  const fake = { embedQuery: () => new Promise(() => {}) };
  const res = await callRoute('POST', '/api/memory/test-embedding', {}, {
    createProvider: () => fake,
    embeddingTimeoutMs: 20,
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'embedding_timeout');
});

test('POST /test-embedding 交给 provider 的配置已带 endpoint', async () => {
  await saveMemoryEmbeddingConfig({ mode: 'openai-compat', baseUrl: 'https://mx.example.com/v1', apiKey: 'sk-map', modelName: 'm-map' });
  let seen = null;
  const res = await callRoute('POST', '/api/memory/test-embedding', {}, {
    createProvider: (cfg) => { seen = cfg; return { embedQuery: async () => [1, 2] }; }
  });
  assert.equal(res.statusCode, 200);
  assert.ok(seen, 'provider 工厂必须被调用');
  assert.equal(seen.endpoint, 'https://mx.example.com/v1');
});
