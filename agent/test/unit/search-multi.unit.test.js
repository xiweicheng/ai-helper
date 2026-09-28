// agent/test/unit/search-multi.unit.test.js
// 跨知识库检索（searchMulti）每库配额单测：topK 按库数均分，保证每个被引用的库都有结果进入合并集
// 运行：node --test agent/test/unit/search-multi.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RagManager } from '../../src/rag/manager.js';

// 构造只含 search 桩的 manager 实例（跳过真实向量/嵌入依赖）
// 桩模拟真实 Searcher 的行为：按传入 topK 截断返回（真实 search 内部会 slice(0, topK)）
function makeManager(perCollection) {
  const seen = [];
  const mgr = Object.create(RagManager.prototype);
  mgr.search = async (id, q, opts = {}) => {
    seen.push({ id, topK: opts.topK });
    const scores = perCollection[id] || [];
    return {
      query: q,
      total: scores.length,
      hasContext: scores.length > 0,
      fallback: false,
      results: scores.slice(0, opts.topK || 5).map((s, i) => ({
        id: id + '-' + i, content: 'c-' + id + '-' + i, metadata: {}, score: s,
      })),
    };
  };
  return { mgr, seen };
}

describe('searchMulti - 每库配额', () => {
  test('单库：topK 即每库上限（保持原单库行为）', async () => {
    const { mgr, seen } = makeManager({ A: [0.9, 0.8, 0.7, 0.6, 0.5, 0.4] });
    const r = await mgr.searchMulti(['A'], 'q', { topK: 5 });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].topK, 5);
    assert.equal(r.results.length, 5);
  });

  test('两库：topK=5 按库均分为每库 3 条，两库结果都在', async () => {
    const { mgr, seen } = makeManager({
      A: [0.9, 0.85, 0.8, 0.75, 0.7],
      B: [0.6, 0.55, 0.5, 0.45, 0.4],
    });
    const r = await mgr.searchMulti(['A', 'B'], 'q', { topK: 5 });
    assert.deepEqual(seen.map(s => s.topK), [3, 3]);
    assert.equal(r.results.length, 6);
    const ids = new Set(r.results.map(x => x.collectionId));
    assert.ok(ids.has('A') && ids.has('B'), '两库都应有结果');
  });

  test('高分库不再垄断：低分库条目不会被全局截断丢弃', async () => {
    const { mgr } = makeManager({
      A: [0.95, 0.94, 0.93, 0.92, 0.91],
      B: [0.2, 0.15, 0.1],
    });
    const r = await mgr.searchMulti(['A', 'B'], 'q', { topK: 5 });
    const bItems = r.results.filter(x => x.collectionId === 'B');
    assert.equal(bItems.length, 3, 'B 库 3 条应全部保留（原实现会被全局 slice(0,5) 全部丢弃）');
    const aItems = r.results.filter(x => x.collectionId === 'A');
    assert.equal(aItems.length, 3, 'A 库按配额保留 3 条');
  });

  test('库数多于 topK：每库至少保底 1 条', async () => {
    const { mgr, seen } = makeManager({
      A: [0.9], B: [0.8], C: [0.7], D: [0.6], E: [0.5], F: [0.4],
    });
    const r = await mgr.searchMulti(['A', 'B', 'C', 'D', 'E', 'F'], 'q', { topK: 5 });
    assert.ok(seen.every(s => s.topK === 1), '每库配额应为 1');
    assert.equal(r.results.length, 6);
    assert.equal(new Set(r.results.map(x => x.collectionId)).size, 6, '六个库都有结果');
  });

  test('合并结果按 score 全局降序', async () => {
    const { mgr } = makeManager({ A: [0.3, 0.9], B: [0.5, 0.7] });
    const r = await mgr.searchMulti(['A', 'B'], 'q', { topK: 4 });
    const scores = r.results.map(x => x.score);
    const sorted = [...scores].sort((a, b) => b - a);
    assert.deepEqual(scores, sorted);
  });

  test('单库检索失败：错误隔离且不影响其他库', async () => {
    const mgr = Object.create(RagManager.prototype);
    mgr.search = async (id, q, opts = {}) => {
      if (id === 'B') throw new Error('boom');
      return { query: q, total: 1, hasContext: true, fallback: false, results: [{ id: 'a0', content: 'c', metadata: {}, score: 0.9 }] };
    };
    const r = await mgr.searchMulti(['A', 'B'], 'q', { topK: 2 });
    assert.equal(r.results.length, 1);
    assert.equal(r.hasContext, true);
    assert.ok(Array.isArray(r.errors) && r.errors.length === 1);
    assert.equal(r.errors[0].collectionId, 'B');
  });

  test('缺省 topK：默认总量预算 5', async () => {
    const { mgr, seen } = makeManager({ A: [0.9, 0.8], B: [0.7, 0.6] });
    const r = await mgr.searchMulti(['A', 'B'], 'q');
    assert.deepEqual(seen.map(s => s.topK), [3, 3]);
    assert.equal(r.results.length, 4);
  });

  test('空引用列表：返回空结果不报错', async () => {
    const { mgr } = makeManager({});
    const r = await mgr.searchMulti([], 'q', { topK: 5 });
    assert.equal(r.results.length, 0);
    assert.equal(r.hasContext, false);
  });
});
