/**
 * memory-tag-rank.unit.test.js
 * 标签在检索中的角色（纯机制层，不建记忆库夹具）。
 *
 * 2026-10-14 口径变更：tags 从「打分前硬过滤」降为「名次加成」。这里钉三件事：
 * 1) 重叠比例怎么算（大小写、部分重叠、零重叠）；
 * 2) 加成的强度上限——全量命中最多上抬 TAG_RANK_LIFT 位，不得把强相关条目顶出第一；
 * 3) filterByTags 与迁移前的 some() 逐字等价（无 query 的枚举路径依它）。
 * df 统计池归 service 层钉（见 memory-service.unit.test.js 的标签口径用例）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TAG_RANK_LIFT,
  tagOverlapRatio,
  applyTagRankLift,
  filterByTags,
  hasTagRequest
} from '../../src/memory/tags.js';

/** 只关心序的用例里用短 id，断言读起来就是最终名次 */
const item = (id, tags) => ({ id, tags });
const ids = (list) => list.map(m => m.id);

describe('tagOverlapRatio', () => {
  it('请求标签全部命中为 1，一个都不沾为 0', () => {
    assert.equal(tagOverlapRatio(['Vue', 'RAG'], ['vue', 'rag']), 1);
    assert.equal(tagOverlapRatio(['Vue'], ['other']), 0);
  });

  it('部分重叠按比例：请求两个命中一个得 0.5', () => {
    assert.equal(tagOverlapRatio(['Vue', 'Other'], ['vue', 'team']), 0.5);
  });

  it('大小写不敏感，且条目无标签时为 0 而不是抛错', () => {
    assert.equal(tagOverlapRatio(['VUE'], ['vue']), 1);
    assert.equal(tagOverlapRatio(undefined, ['vue']), 0);
    assert.equal(tagOverlapRatio([], ['vue']), 0);
  });

  it('请求空标签不构成除零', () => {
    assert.equal(tagOverlapRatio(['vue'], []), 0);
    assert.equal(tagOverlapRatio(['vue'], null), 0);
  });
});

describe('applyTagRankLift', () => {
  it('全量命中的条目恰好上抬 TAG_RANK_LIFT 位，不得顶掉更靠前的强相关', () => {
    // 基线名次：P, Q, R, A, S（A 是标签命中项，排在第 4）
    const base = [item('P', []), item('Q', []), item('R', []), item('A', ['proj']), item('S', [])];
    const lifted = ids(applyTagRankLift(base, ['proj']));
    assert.equal(TAG_RANK_LIFT, 2, '强度变更必须显式改这里，不能藏在调用方');
    // 上抬恰好 2 位：第 4 → 第 2。到不了第 1——这就是与「标签命中一律排前」的区别
    assert.deepEqual(lifted, ['P', 'A', 'Q', 'R', 'S']);
    assert.notEqual(lifted[0], 'A');
  });

  it('部分重叠只上抬一半（round(2 × 0.5) = 1）', () => {
    const base = [item('X', []), item('Y', []), item('Z', ['proj'])];
    const lifted = ids(applyTagRankLift(base, ['proj', 'team']));
    assert.deepEqual(lifted, ['X', 'Z', 'Y']);
  });

  it('零重叠的条目名次不动（加成不是惩罚）', () => {
    const base = [item('X', []), item('Y', ['other'])];
    assert.deepEqual(ids(applyTagRankLift(base, ['proj'])), ['X', 'Y']);
  });

  it('已经在第一位的标签命中项不会被抬到序列之外', () => {
    const base = [item('A', ['proj']), item('B', [])];
    assert.deepEqual(ids(applyTagRankLift(base, ['proj'])), ['A', 'B']);
  });

  it('不修改入参数组（调用方还要用原名次做别的判定）', () => {
    const base = [item('X', []), item('A', ['proj'])];
    const snapshot = ids(base);
    applyTagRankLift(base, ['proj']);
    assert.deepEqual(ids(base), snapshot);
  });
});

describe('filterByTags：无 query 的枚举路径仍是硬筛选', () => {
  const entries = [
    item('E1', ['proj']),
    item('E2', ['Proj', 'other']),
    item('E3', []),
    { id: 'E4' }
  ];

  it('至少沾一个请求标签才保留，大小写不敏感（与迁移前 some() 等价）', () => {
    assert.deepEqual(ids(filterByTags(entries, ['proj'])), ['E1', 'E2']);
  });

  it('条目没有 tags 字段不抛错', () => {
    assert.doesNotThrow(() => filterByTags(entries, ['proj']));
  });

  it('没有标签请求时原样返回且不修改入参', () => {
    assert.equal(hasTagRequest(undefined), false);
    assert.deepEqual(ids(filterByTags(entries, undefined)), ['E1', 'E2', 'E3', 'E4']);
    const snapshot = ids(entries);
    filterByTags(entries, ['proj']);
    assert.deepEqual(ids(entries), snapshot);
  });
});
