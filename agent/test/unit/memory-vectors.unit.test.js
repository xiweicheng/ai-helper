// agent/test/unit/memory-vectors.unit.test.js
// 记忆向量派生缓存：真源永远是 global-memory.json，本文件可丢可坏，绝不能把召回带崩。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { memoryModelKey, cosine, createVectorStoreFacade } from '../../src/memory/vectors.js';

const dir = mkdtempSync(join(tmpdir(), 'aha-vec-'));
const file = join(dir, 'memory-vectors.json');
const store = createVectorStoreFacade({ filePath: file });

// 必须用 after：node:test 的 test() 只是登记，模块体先跑完，
// 顶层直接 rmSync 会在异步用例落盘前就把目录删掉。
after(() => rmSync(dir, { recursive: true, force: true }));

test('modelKey 由 mode/model/dimensions 组成', () => {
  assert.equal(
    memoryModelKey({ mode: 'openai-compat', modelName: 'm1', dimensions: 1536 }),
    'openai-compat|m1|1536'
  );
  // 缺字段也得得到稳定键串（dimensions 未显式指定时计为 0），不能因 undefined 拼出 'undefined'
  assert.equal(memoryModelKey({}), '||0');
  assert.equal(memoryModelKey(), '||0');
  assert.equal(memoryModelKey({ mode: 'local', modelName: 'bge', dimensions: '512' }), 'local|bge|512');
});

test('upsert 后可读回', async () => {
  await store.upsertVectors([['fact_1', [1, 0, 0]], ['fact_2', [0, 1, 0]]], 'openai-compat|m1|1536');
  const { modelKey, vectors } = await store.read();
  assert.equal(modelKey, 'openai-compat|m1|1536');
  assert.deepEqual(vectors.fact_1, [1, 0, 0]);
  assert.equal(Object.keys(vectors).length, 2);
});

test('modelKey 变更即整体作废（跨模型向量不可混用）', async () => {
  await store.upsertVectors([['fact_3', [0, 0, 1]]], 'local|bge|512');
  const { modelKey, vectors } = await store.read();
  assert.equal(modelKey, 'local|bge|512');
  assert.deepEqual(Object.keys(vectors), ['fact_3']);
});

test('drop 摘除指定 id 且不动其他', async () => {
  await store.upsertVectors([['a', [1]], ['b', [1]]], 'local|bge|512');
  await store.dropVectors(['a']);
  const { vectors } = await store.read();
  assert.ok(!('a' in vectors));
  assert.ok('b' in vectors);
});

test('drop 不存在的 id 不产生写入', async () => {
  const before = await store.read();
  await store.dropVectors(['zzz-not-exist']);
  const afterRead = await store.read();
  assert.deepEqual(afterRead, before);
});

test('并发 upsert 不丢写（门面内部串行化）', async () => {
  const par = createVectorStoreFacade({ filePath: join(dir, 'par.json') });
  await Promise.all([
    par.upsertVectors([['p1', [1]]], 'k'),
    par.upsertVectors([['p2', [2]]], 'k'),
    par.upsertVectors([['p3', [3]]], 'k'),
  ]);
  const { vectors } = await par.read();
  assert.deepEqual(Object.keys(vectors).sort(), ['p1', 'p2', 'p3']);
});

test('文件不存在 / 内容损坏 / 结构不合法都当作空缓存，绝不抛', async () => {
  const missing = await createVectorStoreFacade({ filePath: join(dir, 'none.json') }).read();
  assert.deepEqual(missing, { modelKey: '', vectors: {} });

  writeFileSync(join(dir, 'bad.json'), '{not json');
  assert.deepEqual(await createVectorStoreFacade({ filePath: join(dir, 'bad.json') }).read(), { modelKey: '', vectors: {} });

  writeFileSync(join(dir, 'shape.json'), JSON.stringify({ modelKey: 'k', vectors: 'nope' }));
  assert.deepEqual(await createVectorStoreFacade({ filePath: join(dir, 'shape.json') }).read(), { modelKey: '', vectors: {} });

  writeFileSync(join(dir, 'onlykey.json'), JSON.stringify({ modelKey: 'k' }));
  assert.deepEqual(await createVectorStoreFacade({ filePath: join(dir, 'onlykey.json') }).read(), { modelKey: '', vectors: {} });
});

test('落盘失败只回报失败，不抛给调用方', async () => {
  // 把父路径占成普通文件：dirname 处的 mkdir 必然 ENOTDIR
  const blocker = join(dir, 'blocker.txt');
  writeFileSync(blocker, 'occupied');
  const bad = createVectorStoreFacade({ filePath: join(blocker, 'vectors.json') });
  const res = await bad.write({ modelKey: 'k', vectors: {} });
  assert.equal(res.success, false);
  assert.ok(typeof res.error === 'string');
  // 写失败后仍可读（当作空缓存），不拖垂后续召回
  assert.deepEqual(await bad.read(), { modelKey: '', vectors: {} });
});

test('write 后可原样读回', async () => {
  const w = createVectorStoreFacade({ filePath: join(dir, 'w.json') });
  await w.write({ modelKey: 'mk', vectors: { s1: [0.5] } });
  const r = await w.read();
  assert.equal(r.modelKey, 'mk');
  assert.deepEqual(r.vectors.s1, [0.5]);
});

test('非有限数/空向量不入库，同批合法项仍写入', async () => {
  const s = createVectorStoreFacade({ filePath: join(dir, 'sanity.json') });
  await s.upsertVectors([
    ['bad_nan', [NaN, 1]],
    ['bad_empty', []],
    ['bad_type', '1,2'],
    ['good', [1, 2]],
  ], 'k1');
  const { vectors } = await s.read();
  assert.deepEqual(Object.keys(vectors), ['good']);
});

test('clear 整体作废且保留文件（reindex 入口）', async () => {
  const s = createVectorStoreFacade({ filePath: join(dir, 'clear.json') });
  await s.upsertVectors([['x', [1]], ['y', [2]]], 'k1');
  await s.clear();
  const r = await s.read();
  assert.deepEqual(r, { modelKey: '', vectors: {} });
});

test('cosine 处理零向量与不等长', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([0, 0], [1, 1]), 0);
  assert.equal(cosine([1, 2], [1]), 0);
  assert.equal(cosine([], []), 0);
  assert.equal(cosine([1, 1], [1, 1]), 1);
});
