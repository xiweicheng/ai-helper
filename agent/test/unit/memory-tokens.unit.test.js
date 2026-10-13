// agent/test/unit/memory-tokens.unit.test.js - 记忆关键词提取（Task 1 搬迁的行为安全网）
// 这些断言锁的是 service.js 里那份实现的真实行为（含「整段 fallback token」），
// 搬迁后必须逐条通过，否则说明语义被改动。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractKeywords, STOP_WORDS, KEYWORD_CAP } from '../../src/memory/tokens.js';

test('导出常量存在', () => {
  assert.ok(STOP_WORDS instanceof Set);
  assert.equal(KEYWORD_CAP, 30);
  assert.ok(STOP_WORDS.has('的'));
  assert.ok(STOP_WORDS.has('the'));
});

test('英文与数字按整词切分、停用词过滤', () => {
  const kws = extractKeywords('use npm 12 to run the test');
  assert.ok(kws.includes('npm'));
  assert.ok(kws.includes('12'));
  assert.ok(!kws.includes('the'));
});

test('短中文连续段整段保留', () => {
  assert.ok(extractKeywords('用户偏好').includes('用户偏好'));
});

test('长中文连续段既拆 bigram，也保留整段 fallback', () => {
  const kws = extractKeywords('请在后续回复中使用中文说明');
  // >4 字的 CJK 块拆二元组
  assert.ok(kws.includes('后续'));
  assert.ok(kws.includes('回复'));
  // 实现会把整段（清洗后的 snippet）作为 fallback 关键词一并加入，评分依赖这条，不得丢
  assert.ok(kws.some((k) => k.length > 4), '整段 fallback token 应存在');
});

test('关键词数量封顶 30', () => {
  // 40 个互不相同的汉字 → 39 个 unique bigram + 1 个整段 fallback = 40 条，必须被截到 30
  const run = Array.from({ length: 40 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('');
  const kws = extractKeywords(run);
  assert.ok(kws.length <= KEYWORD_CAP, `实际 ${kws.length} 条应 ≤ ${KEYWORD_CAP}`);
  assert.equal(kws.length, KEYWORD_CAP);
});

test('超过 200 字符只取前 200 字符参与提取', () => {
  const tail = '独特结尾';
  const long = '甲'.repeat(300) + tail;
  assert.ok(!extractKeywords(long).includes(tail));
});

test('空输入与假值输入返回空数组', () => {
  assert.deepEqual(extractKeywords(''), []);
  assert.deepEqual(extractKeywords('   '), []);
  assert.deepEqual(extractKeywords(null), []);
  assert.deepEqual(extractKeywords(undefined), []);
});
