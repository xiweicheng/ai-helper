// agent/test/unit/rag-search-params-guard.unit.test.js
// S4a 检索参数边界单测：topK/threshold 归一化（防超大 topK 资源放大与非法值非预期行为）
// 威胁面：LLM 工具调用（tool-executor 透传 topK）与任意 HTTP body 可携带 1e9、'abc'、NaN 等
// 运行：node --test agent/test/unit/rag-search-params-guard.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RagManager, normalizeSearchOptions, SEARCH_TOPK_MAX } from '../../src/rag/manager.js';
import { Searcher } from '../../src/rag/searcher.js';

describe('normalizeSearchOptions - 检索参数归一化（S4a）', () => {
  test('topK 超上限：钳制到 SEARCH_TOPK_MAX（防候选集放大）', () => {
    assert.deepEqual(normalizeSearchOptions({ topK: 1e9 }), { topK: SEARCH_TOPK_MAX });
    assert.equal(normalizeSearchOptions({ topK: SEARCH_TOPK_MAX + 1 }).topK, SEARCH_TOPK_MAX);
  });

  test('topK 低于下界：钳制到 1', () => {
    assert.deepEqual(normalizeSearchOptions({ topK: -5 }), { topK: 1 });
    assert.deepEqual(normalizeSearchOptions({ topK: 0 }), { topK: 1 });
    assert.deepEqual(normalizeSearchOptions({ topK: 0.4 }), { topK: 1 }); // 截断为 0 后钳到 1
  });

  test('topK 小数：截断取整', () => {
    assert.deepEqual(normalizeSearchOptions({ topK: 7.9 }), { topK: 7 });
  });

  test('topK 非法值（非数字/NaN/Infinity）：不设置，回退下游默认', () => {
    assert.deepEqual(normalizeSearchOptions({ topK: 'abc' }), {});
    assert.deepEqual(normalizeSearchOptions({ topK: NaN }), {});
    assert.deepEqual(normalizeSearchOptions({ topK: Infinity }), {});
    assert.deepEqual(normalizeSearchOptions({ topK: {} }), {});
  });

  test('threshold 超范围：钳制到余弦相似度范围 [-1, 1]', () => {
    assert.deepEqual(normalizeSearchOptions({ threshold: 5 }), { threshold: 1 });
    assert.deepEqual(normalizeSearchOptions({ threshold: -3 }), { threshold: -1 });
  });

  test('threshold 非法值：不设置，回退下游默认', () => {
    assert.deepEqual(normalizeSearchOptions({ threshold: 'abc' }), {});
    assert.deepEqual(normalizeSearchOptions({ threshold: NaN }), {});
  });

  test('合法值原样保留；0 为合法阈值；空值/缺省不设置', () => {
    assert.deepEqual(normalizeSearchOptions({ topK: 5, threshold: 0.3 }), { topK: 5, threshold: 0.3 });
    assert.deepEqual(normalizeSearchOptions({ threshold: 0 }), { threshold: 0 });
    assert.deepEqual(normalizeSearchOptions(), {});
    assert.deepEqual(normalizeSearchOptions({ topK: null, threshold: '' }), {});
  });
});

describe('search/searchMulti 入口接入（S4a）', () => {
  // 构造只含 search 桩的 manager（跳过真实向量/嵌入依赖），记录每次调用的配额
  function makeStubManager() {
    const seen = [];
    const mgr = Object.create(RagManager.prototype);
    mgr.search = async (id, q, opts = {}) => {
      seen.push({ id, topK: opts.topK, threshold: opts.threshold });
      return { query: q, total: 0, hasContext: false, fallback: false, results: [] };
    };
    return { mgr, seen };
  }

  test('searchMulti：超大 topK 归一化后再按库均分配额', async () => {
    const { mgr, seen } = makeStubManager();
    await mgr.searchMulti(['A'], 'q', { topK: 1e9 });
    assert.equal(seen[0].topK, SEARCH_TOPK_MAX, '单库配额应为钳后总量');
    seen.length = 0;
    await mgr.searchMulti(['A', 'B', 'C'], 'q', { topK: 1e9 });
    assert.equal(seen[0].topK, Math.ceil(SEARCH_TOPK_MAX / 3), '多库配额基于钳后总量均分');
  });

  test('searchMulti：非法 topK 回退默认总量预算 5', async () => {
    const { mgr, seen } = makeStubManager();
    await mgr.searchMulti(['A'], 'q', { topK: 'abc' });
    assert.equal(seen[0].topK, 5);
  });

  test('search：传给 Searcher 的 options 已钳制/回退（下游不依赖自觉）', async () => {
    const seen = [];
    const orig = Searcher.prototype.search;
    Searcher.prototype.search = async function (q, opts) {
      seen.push(opts);
      return { query: q, total: 0, hasContext: false, fallback: false, results: [] };
    };
    try {
      const mgr = Object.create(RagManager.prototype);
      mgr.getCollection = async () => ({ id: 'kb_test01', embeddingConfig: {} });
      mgr._getProvider = () => ({});

      await mgr.search('kb_test01', 'q', { topK: 1e9, threshold: 99 });
      assert.equal(seen[0].topK, SEARCH_TOPK_MAX);
      assert.equal(seen[0].threshold, 1);

      await mgr.search('kb_test01', 'q', { topK: 'abc', threshold: NaN });
      assert.equal(seen[1].topK, undefined, '非法 topK 不应透传');
      assert.equal(seen[1].threshold, undefined, '非法 threshold 不应透传');
    } finally {
      Searcher.prototype.search = orig;
    }
  });
});
