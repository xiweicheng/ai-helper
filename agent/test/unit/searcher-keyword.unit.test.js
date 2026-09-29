// agent/test/unit/searcher-keyword.unit.test.js
// 关键词命中增强（混合检索）单元测试：关键词提取、命中抬分、高频词剔除、阈值与旁路探测交互
// 运行：node --test agent/test/unit/searcher-keyword.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Searcher, extractKeywords } from '../../src/rag/searcher.js';

// ==================== extractKeywords ====================

describe('extractKeywords - 关键词提取', () => {
  test('英文专有名词原样保留并小写化', () => {
    assert.deepEqual(extractKeywords('RocketMQ'), ['rocketmq']);
  });

  test('中英混排按非字母数字汉字切分', () => {
    assert.deepEqual(extractKeywords('RocketMQ 技术栈'), ['rocketmq', '技术栈']);
  });

  test('单字符段被过滤（噪声过大）', () => {
    assert.deepEqual(extractKeywords('a 的'), []);
  });

  test('重复词去重', () => {
    assert.deepEqual(extractKeywords('RocketMQ rocketmq RocketMQ'), ['rocketmq']);
  });

  test('标点与符号作为分隔符', () => {
    assert.deepEqual(extractKeywords('Spring Cloud + Netty？'), ['spring', 'cloud', 'netty']);
  });

  test('空值与纯符号返回空数组', () => {
    assert.deepEqual(extractKeywords(''), []);
    assert.deepEqual(extractKeywords('  ？！ +- '), []);
    assert.deepEqual(extractKeywords(null), []);
  });
});

// ==================== 辅助 mock ====================

function makeStore(candidates, allItems) {
  return {
    search: async () => candidates.slice(),
    listAllItems: async () => allItems.slice(),
  };
}
const mockEmbedding = { embedQuery: async () => [0.1, 0.2] };
const item = (id, text) => ({ id, metadata: { text, documentName: `${id}.md` } });

// ==================== _boostByKeywords（经 search 集成验证） ====================

describe('search - 关键词命中增强', () => {
  test('命中 chunk 抬分并超过未命中的更高向量分', async () => {
    const candidates = [
      { id: 'A', content: 'x', metadata: {}, score: 0.45 },
      { id: 'B', content: 'y', metadata: {}, score: 0.55 },
    ];
    const all = [item('A', '采用 RocketMQ 构建'), item('B', '无关内容'), item('C', 'RocketMQ 集群')];
    const s = new Searcher(makeStore(candidates, all), mockEmbedding);
    const r = await s.search('RocketMQ', { topK: 5 });
    assert.equal(r.results.length, 3);
    const [first, second, third] = r.results;
    // A/C 命中抬到 0.6（max(0.45, 0.5) + 0.1），B 不动
    assert.equal(first.score, 0.6);
    assert.equal(second.score, 0.6);
    assert.equal(third.id, 'B');
    assert.equal(third.score, 0.55);
  });

  test('命中但未进向量候选的 chunk 被纳入（召回扩展）', async () => {
    const candidates = [{ id: 'B', content: 'y', metadata: {}, score: 0.55 }];
    const all = [item('B', '无关内容'), item('C', 'RocketMQ 深度实践')];
    const s = new Searcher(makeStore(candidates, all), mockEmbedding);
    const r = await s.search('RocketMQ', { topK: 5 });
    const c = r.results.find(x => x.id === 'C');
    assert.ok(c, 'C 应被纳入');
    assert.equal(c.score, 0.6);
    assert.equal(r.results[0].id, 'C');
  });

  test('多词命中叠加加分（同词只计一次，上限 3 词）', async () => {
    const candidates = [];
    const all = [item('A', 'rocketmq spring cloud netty redis 全都有')];
    const s = new Searcher(makeStore(candidates, all), mockEmbedding);
    const r = await s.search('RocketMQ Spring Cloud Netty Redis', { topK: 5 });
    // max(0, 0.5) + 0.1 * min(4, 3) = 0.8
    assert.equal(r.results[0].score, 0.8);
  });

  test('高频词被剔除（命中过半 chunk 且非低频的词不参与加分）', async () => {
    // 'test' 命中 6/7 个 chunk（86% > 50% 且 df > 2）→ 剔除；'rocketmq' 命中 1/7 → 有效
    const all = [];
    for (let i = 0; i < 6; i++) all.push(item('T' + i, 'test 内容 ' + i));
    all.push(item('R', 'rocketmq 专项内容'));
    const candidates = [{ id: 'B', content: 'y', metadata: {}, score: 0.55 }];
    const s = new Searcher(makeStore(candidates, all), mockEmbedding);
    const r = await s.search('test', { topK: 5 });
    // 'test' 被剔除 → 无有效词 → 候选原样（B 0.55）
    assert.equal(r.results.length, 1);
    assert.equal(r.results[0].score, 0.55);

    const r2 = await s.search('test rocketmq', { topK: 5 });
    // 'rocketmq' 有效 → R 抬分 0.6；'test' 即使命中也不计
    assert.equal(r2.results[0].id, 'R');
    assert.equal(r2.results[0].score, 0.6);
  });

  test('无有效关键词时行为与纯向量一致', async () => {
    const candidates = [{ id: 'A', content: 'x', metadata: {}, score: 0.8 }];
    const all = [item('A', 'x')];
    const s = new Searcher(makeStore(candidates, all), mockEmbedding);
    const r = await s.search('a？', { topK: 5 });
    assert.equal(r.results[0].score, 0.8);
  });

  test('抬分后仍低于 threshold 的结果被过滤（阈值语义保持）', async () => {
    const candidates = [];
    const all = [item('A', 'rocketmq 内容')];
    const s = new Searcher(makeStore(candidates, all), mockEmbedding);
    // 抬分后 0.6 < 0.7 → 过滤；旁路探测放宽到 0.5 → fallback 命中
    const r = await s.search('RocketMQ', { topK: 5, threshold: 0.7 });
    assert.equal(r.results.length, 0);
    assert.equal(r.hasContext, false);
  });

  test('listAllItems 失败时不影响向量主路径', async () => {
    const candidates = [{ id: 'A', content: 'x', metadata: {}, score: 0.8 }];
    const store = {
      search: async () => candidates.slice(),
      listAllItems: async () => { throw new Error('io error'); },
    };
    const s = new Searcher(store, mockEmbedding);
    const r = await s.search('RocketMQ', { topK: 5 });
    assert.equal(r.results.length, 1);
    assert.equal(r.results[0].score, 0.8);
  });
});

// ==================== 中文最长片段 / 英文词边界命中（方案 A：本地匹配策略升级） ====================

describe('search - 中文最长片段与英文词边界命中', () => {
  test('长中文查询：目标词以最长片段命中（整段失配问题修复）', async () => {
    const candidates = [{ id: 'B', content: 'y', metadata: {}, score: 0.35 }];
    const all = [item('A', '消息队列的核心概念与消费模型'), item('B', '今天天气不错')];
    const s = new Searcher(makeStore(candidates, all), mockEmbedding);
    const r = await s.search('帮我查一下消息队列的知识', { topK: 5 });
    const a = r.results.find(x => x.id === 'A');
    assert.ok(a, 'A 应通过中文片段命中被召回');
    // 最长命中片段「消息队列」(L=4) → 计分单元 min(4-1, 3) = 3：max(0, 0.5) + 0.1×3
    assert.equal(a.score, 0.8);
    assert.equal(r.results[0].id, 'A');
  });

  test('命中片段越长加分越多（L=4 顶格 3 单元，L=2 为 1 单元）', async () => {
    const all = [item('L4', '消息队列是核心组件'), item('L2', '这是优化建议文档')];
    const s = new Searcher(makeStore([], all), mockEmbedding);
    const r = await s.search('消息队列优化', { topK: 5 });
    const l4 = r.results.find(x => x.id === 'L4');
    const l2 = r.results.find(x => x.id === 'L2');
    assert.ok(l4 && l2, 'L4/L2 均应被片段命中召回');
    assert.equal(l4.score, 0.8);
    assert.equal(l2.score, 0.6);
    assert.equal(r.results[0].id, 'L4');
  });

  test('英文按词边界匹配：storage 中的子串 rag 不再误命中', async () => {
    const all = [
      item('F', 'storage 层设计说明'),
      item('T', 'RAG 检索流程'),
      item('M', '采用RAG检索引擎'),
    ];
    const s = new Searcher(makeStore([], all), mockEmbedding);
    const r = await s.search('RAG 是什么', { topK: 5 });
    assert.equal(r.results.find(x => x.id === 'F'), undefined, 'storage 中的 rag 是子串非独立词，不应命中');
    const t = r.results.find(x => x.id === 'T');
    const m = r.results.find(x => x.id === 'M');
    assert.ok(t && m, 'T/M 均应被词边界命中召回');
    assert.equal(t.score, 0.6);
    assert.equal(m.score, 0.6, 'CJK 相邻视为词边界');
  });

  test('中文高频片段按 df 剔除；低频片段照常加分', async () => {
    const candidates = [{ id: 'C1', content: 'c1', metadata: {}, score: 0.55 }];
    const all = [
      item('C1', '知识 体系'),
      item('C2', '知识 内容'),
      item('C3', '知识 文档'),
      item('C4', '管理 规范'),
    ];
    const s = new Searcher(makeStore(candidates, all), mockEmbedding);
    const r = await s.search('知识管理', { topK: 5 });
    const c1 = r.results.find(x => x.id === 'C1');
    const c4 = r.results.find(x => x.id === 'C4');
    assert.ok(c4, 'C4 应被低频片段「管理」命中召回');
    assert.equal(c4.score, 0.6);
    assert.equal(c1.score, 0.55, 'C1 的「知识」命中 3/4 chunk 被 df 剔除，保持原分');
    assert.equal(r.results.find(x => x.id === 'C2'), undefined);
    assert.equal(r.results.find(x => x.id === 'C3'), undefined);
  });

  test('无分隔符的中英混排段拆分为独立命中单元', async () => {
    const all = [item('MIX', 'RocketMQ集群部署实践')];
    const s = new Searcher(makeStore([], all), mockEmbedding);
    const r = await s.search('RocketMQ集群', { topK: 5 });
    // 「rocketmq」1 单元 + 「集群」(L=2) 1 单元 → max(0, 0.5) + 0.1×2 = 0.7
    assert.equal(r.results[0].score, 0.7);
  });
});
