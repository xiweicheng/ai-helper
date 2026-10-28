// agent/test/unit/rag-embed-worker-client.unit.test.js
// 本地 embedding 子进程客户端：真的 spawn 一个假 worker（test/fixtures/rag-fake-embed-worker.mjs），
// 覆盖串行队列、超时杀进程、崩溃拒绝在途请求、熔断、空闲回收、错误映射。
//
// 为什么这些必须测：真实 transformers 加载会拖进几百 MB 的 onnxruntime，单测不可能真跑；
// 而子进程编排（超时/重入/僵尸进程）正是最容易出错、又无法靠肉眼发现的部分。
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';

import { EmbedWorkerClient } from '../../src/rag/embedding/worker-client.js';
import { LocalEmbedding } from '../../src/rag/embedding/local.js';
import { RagError, isOnnxRuntimeConflict } from '../../src/rag/errors.js';

const WORKER_PATH = fileURLToPath(new URL('../fixtures/rag-fake-embed-worker.mjs', import.meta.url));
const clients = [];

/** 建一个指向假 worker 的客户端（测试结束统一 close，避免悬挂子进程） */
function makeClient(opts = {}) {
  const client = new EmbedWorkerClient({
    workerPath: WORKER_PATH,
    idleMs: 0,
    loadTimeoutMs: 5000,
    opTimeoutMs: 5000,
    ...opts,
  });
  clients.push(client);
  return client;
}

after(async () => {
  for (const client of clients) {
    try { await client.close(); } catch { /* 忽略 */ }
  }
});

describe('EmbedWorkerClient：基本往返', () => {
  test('embed 结果按入参顺序返回，且只起一个子进程', async () => {
    const client = makeClient();
    const [a, b] = await Promise.all([
      client.embed(['第一条', '第二条'], { dims: 4 }),
      client.embed(['第三条'], { dims: 4 }),
    ]);
    assert.deepEqual(a, [[3, 3, 3, 3], [3, 3, 3, 3]]);
    assert.deepEqual(b, [[3, 3, 3, 3]]);
    assert.equal(client.alive, true);
  });

  test('countTokens 透传 counts/window', async () => {
    const client = makeClient();
    const result = await client.countTokens(['abcd', 'x']);
    assert.deepEqual(result, { counts: [4, 1], window: 512 });
  });

  test('超长批量（10×512 浮点）能完整往返，不被管道截断', async () => {
    const client = makeClient();
    const texts = Array.from({ length: 10 }, (_, i) => `text-${i}`);
    const vectors = await client.embed(texts, { dims: 512 });
    assert.equal(vectors.length, 10);
    assert.equal(vectors[0].length, 512);
    assert.equal(vectors[9][0], 'text-9'.length);
  });
});

describe('EmbedWorkerClient：失败治理', () => {
  test('子进程崩溃会拒绝在途请求，下次调用自动重起', async () => {
    const client = makeClient();
    await assert.rejects(
      () => client.embed(['x'], { crash: true }),
      (err) => err.code === 'embed_worker_crashed'
    );
    // 崩溃后客户端应已丢弃子进程，再调一次要能重新 spawn 成功
    const [vec] = await client.embed(['ok'], { dims: 2 });
    assert.deepEqual(vec, [2, 2]);
  });

  test('超时会杀掉卡住的子进程并报 embed_worker_timeout', async () => {
    const client = makeClient({ loadTimeoutMs: 150, opTimeoutMs: 150 });
    await assert.rejects(
      () => client.embed(['slow'], { delayMs: 3000 }),
      (err) => err.code === 'embed_worker_timeout'
    );
    assert.equal(client.alive, false);
  });

  test('连续 3 次失败后熔断，第 4 次不再 spawn', async () => {
    const client = makeClient();
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => client.embed(['x'], { failMessage: 'boom' }));
    }
    await assert.rejects(
      () => client.embed(['x']),
      (err) => err.code === 'embed_worker_cooldown'
    );
  });
});

describe('EmbedWorkerClient：生命周期', () => {
  test('空闲回收后自动重起（模型缓存不因此丢失：由子进程磁盘缓存保证）', async () => {
    const client = makeClient({ idleMs: 80 });
    await client.embed(['a']);
    assert.equal(client.alive, true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(client.alive, false);
    const [vec] = await client.embed(['bc'], { dims: 1 });
    assert.deepEqual(vec, [2]);
  });

  test('close 后的调用会重新 spawn，不残留僵尸', async () => {
    const client = makeClient();
    await client.embed(['a']);
    await client.close();
    assert.equal(client.alive, false);
    const [vec] = await client.embed(['ab'], { dims: 1 });
    assert.deepEqual(vec, [2]);
  });
});

/** 直接抛错的假 worker（用于把指定 message 送进 LocalEmbedding 的错误映射） */
function throwingWorker(message) {
  const fail = async () => { throw new Error(message); };
  return { embed: fail, countTokens: fail, load: fail };
}

describe('LocalEmbedding：对外接口与错误映射', () => {
  test('embed / countTokens 保持原签名与返回形状', async () => {
    const local = new LocalEmbedding({ modelName: 'fake', remoteHost: 'http://x/' }, { worker: makeClient() });
    const vectors = await local.embed(['一二三']);
    assert.deepEqual(vectors, [[3, 3, 3]]);
    const counted = await local.countTokens(['一二三']);
    assert.deepEqual(counted, { counts: [3], window: 512 });
    // 空输入不启子进程、直接返回空结构
    assert.deepEqual(await local.embed([]), []);
    assert.deepEqual(await local.countTokens([]), { counts: [], window: 0 });
  });

  test('onnxruntime dll 冲突（cannot run %1）映射为 ortConflict', async () => {
    const local = new LocalEmbedding({}, {
      worker: throwingWorker('The operating system cannot run %1. (onnxruntime_binding.node)'),
    });
    await assert.rejects(
      () => local.embed(['x']),
      (err) => err instanceof RagError && err.code === 'ortConflict'
    );
  });

  test('API version 冲突同样映射为 ortConflict，其余错误归 embedWorkerFailed', async () => {
    const versionLocal = new LocalEmbedding({}, {
      worker: throwingWorker('API version [24] is not available in this build of onnxruntime'),
    });
    await assert.rejects(
      () => versionLocal.embed(['x']),
      (err) => err instanceof RagError && err.code === 'ortConflict'
    );

    const genericLocal = new LocalEmbedding({}, { worker: throwingWorker('boom') });
    await assert.rejects(
      () => genericLocal.embed(['x']),
      (err) => err instanceof RagError && err.code === 'embedWorkerFailed' && err.params.message === 'boom'
    );
  });

  test('冲突识别覆盖三类特征串，且不误伤普通错误', () => {
    assert.equal(isOnnxRuntimeConflict('napi: Error: The operating system cannot run %1.'), true);
    assert.equal(isOnnxRuntimeConflict(new Error('ERROR_BAD_EXE_FORMAT')), true);
    assert.equal(isOnnxRuntimeConflict('... bin/napi-v6/win32/x64/onnxruntime_binding.node'), true);
    assert.equal(isOnnxRuntimeConflict('embedding worker timeout (60000ms)'), false);
    assert.equal(isOnnxRuntimeConflict(null), false);
  });
});
