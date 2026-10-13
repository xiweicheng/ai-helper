// agent/test/unit/memory-keyword-match.unit.test.js
// 关键词片段化匹配的共用实现（知识库与长期记忆同一条口径）的语义钉子。
// 这些断言是从 rag/searcher.js 的历史行为里逐字提取的：本模块一旦被改动，
// 两条通道会同时漂移，所以这里钉的是「不可变语义」而非「当前实现细节」。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractKeywords,
  extractQueryTerms,
  matchLatin,
  matchCjk,
  KEYWORD_MIN_LEN,
  KEYWORD_MAX_FRAGMENT_LEN,
  KEYWORD_MAX_HITS
} from '../../src/rag/keyword-match.js';

test('导出常量存在且取值锁定', () => {
  assert.equal(KEYWORD_MIN_LEN, 2);
  assert.equal(KEYWORD_MAX_FRAGMENT_LEN, 4);
  assert.equal(KEYWORD_MAX_HITS, 3);
});

test('extractKeywords 按分隔符切段、小写去重、丢弃单字符', () => {
  assert.deepEqual(extractKeywords('RocketMQ 技术栈'), ['rocketmq', '技术栈']);
  assert.deepEqual(extractKeywords('a 的'), []);
  assert.deepEqual(extractKeywords('RocketMQ rocketmq RocketMQ'), ['rocketmq']);
});

test('extractQueryTerms 分离拉丁段与中文段并去重', () => {
  const { latin, cjk } = extractQueryTerms('RAG 检索 的 关键词 rag');
  assert.deepEqual(latin, ['rag']);
  assert.deepEqual(cjk, ['检索', '关键词']);
});

test('matchLatin 按词边界，子串不算命中', () => {
  assert.deepEqual(matchLatin('use storage layer', ['rag']), []);
  assert.deepEqual(matchLatin('a rag framework', ['rag']), ['rag']);
  assert.deepEqual(matchLatin('中文rag混排', ['rag']), ['rag']);
  assert.deepEqual(matchLatin('anything', []), []);
});

test('matchCjk 取最长命中片段并按长度给单元数', () => {
  const hit = matchCjk('本文介绍混合检索方案', '混合检索');
  assert.equal(hit.units, 3);
  assert.deepEqual(hit.keys, ['混合检索']);

  const weak = matchCjk('这里的检索很快', '混合检索');
  assert.equal(weak.units, 1);
  assert.ok(weak.keys.length > 0);
});

test('matchCjk 无任何 2 字片段命中时返回 null', () => {
  assert.equal(matchCjk('完全无关的内容', '混合检索'), null);
});

test('matchCjk 单元数封顶 KEYWORD_MAX_HITS', () => {
  assert.equal(matchCjk('上下文压缩效果演示', '上下文压缩效果').units, KEYWORD_MAX_HITS);
});

test('matchCjk 的 2 字命中蕴含在长片段命中中（长命中优先，不误报短片段）', () => {
  // 同时存在 2 字与 4 字命中时，必须取最长者，否则又退回碎块噪声
  const hit = matchCjk('这是混合检索与向量检索的说明', '混合检索');
  assert.equal(hit.units, 3);
  assert.equal(hit.keys.includes('混合检索'), true);
});
