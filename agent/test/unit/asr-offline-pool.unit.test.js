// agent/test/unit/asr-offline-pool.unit.test.js
// offline 定稿 worker 池的端到端回归：真的起 worker_threads，只是把 transcribe 实现
// 换成 test/fixtures/asr-fake-transcribe.mjs（不加载 sherpa-onnx）。
//
// 核心断言是「主线程不被阻塞」：让 worker 同步空转 300ms，同时看主线程的定时器是否照常触发。
// 这条如果退化成主线程同步转写，tick 数会掉到 1 以下。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

let pool;

before(async () => {
  // 注入点必须在 worker spawn 之前设好（spawn 时读一次）
  process.env.AI_HELPER_ASR_OFFLINE_IMPL = new URL('../fixtures/asr-fake-transcribe.mjs', import.meta.url).href;
  pool = await import('../../src/asr/offline-pool.js');
});

after(async () => {
  try { await pool.closeOfflinePool(); } catch { /* 忽略 */ }
  delete process.env.AI_HELPER_ASR_OFFLINE_IMPL;
});

/** 轮询等待条件成立（避免用固定 sleep 赌时序） */
async function waitUntil(fn, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

describe('runOfflineTask：主线程不被阻塞', () => {
  test('worker 同步空转 300ms 期间，主线程定时器照常触发', async () => {
    const ticks = [];
    const timer = setInterval(() => ticks.push(1), 10);
    try {
      const result = await pool.runOfflineTask({
        kind: 'samples',
        samples: new Float32Array(1600),
        opts: { busyMs: 300 },
        idleMs: 0,
      });
      assert.equal(result.text, 'fake:1600');
    } finally {
      clearInterval(timer);
    }
    // 同步转写的实现里，这 300ms 全在同一个调用栈内，tick 只能是 0~1 次
    assert.ok(ticks.length >= 5, `主线程应始终可调度，实际 tick ${ticks.length} 次`);
  });

  test('采样点按 transfer 传过去，值不变', async () => {
    const samples = new Float32Array(64);
    const result = await pool.runOfflineTask({ kind: 'samples', samples, opts: {}, idleMs: 0 });
    assert.equal(result.text, 'fake:64');
  });

  test('wav 任务把 Buffer 交给 worker 解析', async () => {
    const result = await pool.runOfflineTask({
      kind: 'wav',
      buffer: Buffer.from('RIFFxxxx'),
      opts: {},
      idleMs: 0,
    });
    assert.equal(result.text, 'wav:8');
    assert.equal(result.durationMs, 250);
  });
});

describe('runOfflineTask：串行与错误穿透', () => {
  test('同一 worker 串行执行：先提交的先完成', async () => {
    const done = [];
    const a = pool.runOfflineTask({
      kind: 'samples',
      samples: new Float32Array(10),
      opts: { busyMs: 120 },
      idleMs: 0,
    }).then((r) => done.push(['a', r.text]));
    const b = pool.runOfflineTask({
      kind: 'samples',
      samples: new Float32Array(20),
      opts: {},
      idleMs: 0,
    }).then((r) => done.push(['b', r.text]));
    await Promise.all([a, b]);
    assert.deepEqual(done, [['a', 'fake:10'], ['b', 'fake:20']]);
  });

  test('worker 内抛错的 code 穿透到调用方（session 据此回退草稿）', async () => {
    await assert.rejects(
      pool.runOfflineTask({
        kind: 'samples',
        samples: new Float32Array(8),
        opts: { throwCode: 'fake_failure' },
        idleMs: 0,
      }),
      (err) => err.code === 'fake_failure' && /fake decode failed/.test(err.message),
    );
  });

  test('一个任务失败不影响后续任务（队列不继承失败）', async () => {
    const failed = pool.runOfflineTask({
      kind: 'samples',
      samples: new Float32Array(8),
      opts: { throwCode: 'boom' },
      idleMs: 0,
    }).catch((err) => err.code);
    const ok = pool.runOfflineTask({
      kind: 'samples',
      samples: new Float32Array(8),
      opts: {},
      idleMs: 0,
    });
    assert.equal(await failed, 'boom');
    assert.equal((await ok).text, 'fake:8');
  });
});

describe('runOfflineTask：超时与线程回收', () => {
  test('超时后 reject 并丢弃线程，下一次任务重新 spawn', async () => {
    await assert.rejects(
      pool.runOfflineTask({
        kind: 'samples',
        samples: new Float32Array(8),
        opts: { busyMs: 500 },
        timeoutMs: 40,
        idleMs: 0,
      }),
      (err) => err.code === 'offline_worker_timeout',
    );
    const again = await pool.runOfflineTask({
      kind: 'samples',
      samples: new Float32Array(8),
      opts: {},
      idleMs: 0,
    });
    assert.equal(again.text, 'fake:8', '丢弃线程后应能自动恢复');
  });

  test('空闲后终止线程，下一次任务自动重启', async () => {
    const first = await pool.runOfflineTask({
      kind: 'samples',
      samples: new Float32Array(4),
      opts: {},
      idleMs: 60,
      modelId: 'model-a',
    });
    assert.equal(first.text, 'fake:4');
    assert.equal(pool.getWorkerLoadedModelId(), 'model-a');

    assert.ok(await waitUntil(() => pool.getWorkerLoadedModelId() === null), '空闲后应回收线程');

    const again = await pool.runOfflineTask({
      kind: 'samples',
      samples: new Float32Array(4),
      opts: {},
      idleMs: 0,
      modelId: 'model-b',
    });
    assert.equal(again.text, 'fake:4');
    assert.equal(pool.getWorkerLoadedModelId(), 'model-b');
  });

  test('关闭池：在途任务被拒绝而不是悬挂', async () => {
    await pool.runOfflineTask({ kind: 'samples', samples: new Float32Array(4), opts: {}, idleMs: 0 });
    const inFlight = pool.runOfflineTask({
      kind: 'samples',
      samples: new Float32Array(4),
      opts: { busyMs: 600 },
      idleMs: 0,
    });
    // 让 exec 先把消息投给 worker，再关池
    await new Promise((resolve) => setImmediate(resolve));
    await pool.closeOfflinePool();
    await assert.rejects(inFlight, (err) => err.code === 'offline_pool_closed');
    assert.equal(pool.getWorkerLoadedModelId(), null);
  });
});

describe('warmupAsrEngines', () => {
  test('offline 预热失败只落到 failed，不抛出', async () => {
    const result = await pool.warmupAsrEngines(
      { online: null, offline: { id: 'no-such-model' } },
      { idleUnloadMs: 0 },
    );
    assert.deepEqual(result.warmed, []);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].kind, 'offline');
    assert.ok(result.failed[0].error.length > 0, '应带上失败原因');
  });
});

describe('runOfflineTask：shouldSkip 让排队中的任务空转', () => {
  test('shouldSkip 为真的任务不执行，直接返回 null', async () => {
    const calls = [];
    const result = await pool.runOfflineTask({
      kind: 'samples',
      samples: new Float32Array(16000),
      shouldSkip: () => { calls.push('checked'); return true; },
    });
    assert.equal(result, null);
    assert.deepEqual(calls, ['checked'], 'shouldSkip 应被调用一次');
  });

  test('排在前面的任务被 skip 后，后面的任务立即开始（模拟 stop 抢跑）', async () => {
    let aborted = false;
    const order = [];

    const slow = pool.runOfflineTask({
      kind: 'samples',
      samples: new Float32Array(16000),
      shouldSkip: () => { order.push('slow-check'); return aborted; },
    });

    // 模拟 stop：第一件已经在队里，出队前把 aborted 置真
    aborted = true;
    const fast = pool.runOfflineTask({
      kind: 'samples',
      samples: new Float32Array(16000),
      shouldSkip: () => { order.push('fast-check'); return false; },
    });

    assert.equal(await slow, null, '被中止的任务必须空转返回 null');
    const fastResult = await fast;
    assert.ok(fastResult, '后者必须真的执行并返回结果');
    assert.deepEqual(order, ['slow-check', 'fast-check'], '严格按入队顺序出队');
  });

  test('不传 shouldSkip 时行为不变', async () => {
    const result = await pool.runOfflineTask({
      kind: 'samples',
      samples: new Float32Array(1600),
    });
    assert.equal(result.text, 'fake:1600');
  });
});