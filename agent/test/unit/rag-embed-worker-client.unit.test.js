// agent/test/unit/rag-embed-worker-client.unit.test.js
// 本地 embedding 子进程客户端：真的 spawn 一个假 worker（test/fixtures/rag-fake-embed-worker.mjs），
// 覆盖串行队列、超时杀进程、崩溃拒绝在途请求、熔断、空闲回收、关闭语义、错误映射。
//
// 为什么这些必须测：真实 transformers 加载会拖进几百 MB 的 onnxruntime，单测不可能真跑；
// 而子进程编排（超时/重入/僵尸进程/close 是否真的等到退出）正是最容易出错、又无法靠肉眼
// 发现的部分 —— close() 的不变式尤其关键：安装期去重要删被这个进程映射着的 onnxruntime.dll，
// Windows 上进程没退就删不掉。
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'url';

import { EmbedWorkerClient } from '../../src/rag/embedding/worker-client.js';
import { LocalEmbedding } from '../../src/rag/embedding/local.js';
import { RagError, errorDetail, isOnnxRuntimeConflict } from '../../src/rag/errors.js';

const WORKER_PATH = fileURLToPath(new URL('../fixtures/rag-fake-embed-worker.mjs', import.meta.url));
const CLIENT_URL = new URL('../../src/rag/embedding/worker-client.js', import.meta.url).href;
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

/** 轮询等待条件成立（固定 sleep 会在慢机/CI 上变成偶发失败） */
async function waitFor(predicate, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return predicate();
}

/** 等 pid 真的消失（进程退出并由内核回收）；超时返回 false */
async function waitGone(pid, timeoutMs = 3000) {
  if (!pid) return true;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    let alive = true;
    try { process.kill(pid, 0); } catch { alive = false; }
    if (!alive) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

/** 在独立进程里跑一段 ESM 源码（事件循环排空类问题在 node --test 里看不出来） */
function runNode(script, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`子进程 ${timeoutMs}ms 未退出，stderr 末尾：${err.slice(-500)}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

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

  test('响应 id 对不上时不串包，等超时失败并丢弃子进程', async () => {
    // 旧实现的缓冲解析若按「行序」而非 id 配对，错 id 的响应会落到错误请求上（串包）
    const client = makeClient({ loadTimeoutMs: 200, opTimeoutMs: 200 });
    await assert.rejects(
      () => client.embed(['x'], { wrongId: true }),
      (err) => err.code === 'embed_worker_timeout'
    );
    assert.equal(client.alive, false);
  });

  test('worker 脚本不存在：毫秒级失败，不吊死到超时', async () => {
    const client = makeClient({
      workerPath: join(tmpdir(), 'aha-no-such-embed-worker.mjs'),
      loadTimeoutMs: 5000,
      opTimeoutMs: 5000,
    });
    const startedAt = Date.now();
    await assert.rejects(
      () => client.embed(['x']),
      (err) => err.code === 'embed_worker_crashed' || err.code === 'embed_worker_exited'
    );
    assert.ok(Date.now() - startedAt < 3000, '应由子进程退出事件立刻失败，而不是等满 5s 超时');
    assert.equal(client.alive, false);
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

  test('close() 拒绝在途请求，且返回时子进程真的已退出（安装期删 dll 的前提）', async () => {
    const client = makeClient({ loadTimeoutMs: 5000, opTimeoutMs: 5000 });
    const inflight = client.embed(['slow'], { delayMs: 5000 });
    // 先挂上拒绝处理，避免 close 立刻拒绝时被当成 unhandled rejection
    inflight.catch(() => {});
    assert.equal(await waitFor(() => client.alive), true);
    const pid = client.pid;
    assert.ok(pid > 0, '子进程应已启动');

    await client.close();

    await assert.rejects(() => inflight, (err) => err.code === 'embed_worker_closed');
    assert.equal(client.pid, null);
    // 关键不变式：close() 之后进程必须真的没了（不是只发了退出信号），
    // 否则 Windows 上后续 rmSync 会 EPERM/EBUSY，去重永远失败
    assert.equal(await waitGone(pid), true, 'close() 返回时子进程应已退出');
  });

  test('close 后的调用会重新 spawn（安装完依赖的正常路径）', async () => {
    const client = makeClient();
    await client.embed(['a']);
    await client.close();
    assert.equal(client.alive, false);
    const [vec] = await client.embed(['ab'], { dims: 1 });
    assert.deepEqual(vec, [2]);
  });

  test('空闲状态下 close() 也能等到真退出，主机进程能自然结束', async () => {
    // 队列空了之后子进程被 unref（空闲子进程不该吊住 daemon）。若 close() 只挂一个
    // unref 定时器等 exit，事件循环会直接排空 → 进程以退出码 13 退出、子进程还活着。
    // 这种时序在 node --test 里被测试运行器的句柄掩掉，所以必须在独立进程里验。
    const script = `
      process.env.AI_HELPER_RAG_EMBED_WORKER = ${JSON.stringify(WORKER_PATH)};
      const { EmbedWorkerClient } = await import(${JSON.stringify(CLIENT_URL)});
      const client = new EmbedWorkerClient({ idleMs: 0 });
      await client.embed(['a']);
      await client.close();
      process.stdout.write('CLOSED');
    `;
    const { code, out, err } = await runNode(script);
    assert.equal(err.includes('unsettled top-level await'), false, `close() 期间事件循环被排空：${err}`);
    assert.equal(code, 0, `退出码应为 0，stderr：${err}`);
    assert.equal(out.includes('CLOSED'), true, `close() 没有跑完，stdout：${out}`);
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

  test('冲突识别：强特征直接命中', () => {
    assert.equal(isOnnxRuntimeConflict('napi: Error: The operating system cannot run %1.'), true);
    assert.equal(isOnnxRuntimeConflict(new Error('ERROR_BAD_EXE_FORMAT')), true);
    assert.equal(isOnnxRuntimeConflict('API version [24] is not available in this build of onnxruntime'), true);
  });

  test('只有 binding 路径不算冲突（包没装全/架构不对/Cannot find module 都会带这串）', () => {
    // 这些给用户「重启代理」是误诊：真正的修法是重装依赖
    assert.equal(isOnnxRuntimeConflict('... bin/napi-v6/win32/x64/onnxruntime_binding.node'), false);
    assert.equal(
      isOnnxRuntimeConflict("Cannot find module 'C:/x/node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node'"),
      false
    );
    assert.equal(isOnnxRuntimeConflict('embedding worker timeout (60000ms)'), false);
    assert.equal(isOnnxRuntimeConflict(null), false);
  });

  test('弱特征需与加载失败措辞共现才算冲突', () => {
    assert.equal(
      isOnnxRuntimeConflict('cannot open shared object file: libonnxruntime.so: onnxruntime_binding.node undefined symbol'),
      true
    );
    assert.equal(isOnnxRuntimeConflict('DLL load failed while importing onnxruntime_binding.node'), true);
    assert.equal(isOnnxRuntimeConflict('onnxruntime_binding.node: ERROR_BAD_EXE_FORMAT'), true);
  });

  test('errorDetail 压成一行并截断超长 message', () => {
    assert.equal(errorDetail('boom\n  at x'), 'boom at x');
    const long = errorDetail('x'.repeat(500));
    assert.equal(long.length, 301, '300 字符 + 省略号');
    assert.equal(long.endsWith('…'), true);
  });
});
