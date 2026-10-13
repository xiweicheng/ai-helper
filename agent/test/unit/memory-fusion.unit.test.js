// agent/test/unit/memory-fusion.unit.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectSemanticHits, rrfFuse, RRF_K, SEMANTIC_QUERY_FLOOR } from '../../src/memory/fusion.js';

describe('selectSemanticHits', () => {
  const G = { floor: 0.48, margin: 0.05, maxTake: 2 };

  it('查询级地板：top1 低于地板时整通道否决（本库对该查询没有落点）', () => {
    // 实测形式：无关查询「今天北京天气」top1=0.4506，库内落差达 0.036 仍应全部不采信
    assert.deepEqual(selectSemanticHits([['a', 0.4506], ['b', 0.4145], ['c', 0.4120]], G), []);
  });

  it('top1 恰等于地板时放行（边界取 ≥ 不取 >）', () => {
    assert.deepEqual(selectSemanticHits([['a', G.floor], ['b', 0.1]], G).map(h => h[0]), ['a']);
  });

  it('地板达标后，相对落差之外的尾部被砍', () => {
    const hits = selectSemanticHits([['a', 0.63], ['b', 0.52], ['c', 0.51]], G);
    assert.deepEqual(hits.map(h => h[0]), ['a'], 'b/c 距 top1 超过 margin，不得采信');
  });

  it('分离度不参与判定：top1 达标且 gap 极小时照样采信头部', () => {
    // 这一条钉住 Task 2 去掉 gap 门的决定。将来谁要「顺手把分离度加回去」，这条会红：
    // 真实库 Q1（gap 0.0214）与无关查询天气（gap 0.0361）在 gap 轴上分不开，
    // 任何能救回 Q1 的 gap 下限都会同时放过噪声。
    const hits = selectSemanticHits([['a', 0.600], ['b', 0.599], ['c', 0.30]], G);
    assert.deepEqual(hits.map(h => h[0]), ['a', 'b']);
  });

  it('采信条数受 maxTake 封顶（防止高分查询填满窗口）', () => {
    const many = Array.from({ length: 10 }, (_, i) => [`x${i}`, 0.7 - i * 0.001]);
    assert.equal(selectSemanticHits(many, G).length, 2);
  });

  it('空表不抛错；单条候选达地板时采信（极小库只有一条相关记忆，语义必须生效）', () => {
    assert.deepEqual(selectSemanticHits([], G), []);
    assert.deepEqual(selectSemanticHits([['only', 0.6]], G).map(h => h[0]), ['only']);
    assert.deepEqual(selectSemanticHits([['only', 0.2]], G), []);
  });

  it('非有限 cos 被过滤（维度不匹配时 cosine 返回 NaN）', () => {
    assert.deepEqual(selectSemanticHits([['a', NaN], ['b', 0.9]], G).map(h => h[0]), ['b']);
  });

  it('缺省门用实测常量，且地板常量等于标定值', () => {
    assert.equal(SEMANTIC_QUERY_FLOOR, 0.48);
    assert.deepEqual(selectSemanticHits([['a', 0.44], ['b', 0.43]]), []);
  });
});

describe('rrfFuse', () => {
  it('两路都给名次的条目排在只被一路采信之前', () => {
    const fused = rrfFuse([[['kwA', 1], ['shared', 2]], [['vecB', 1], ['shared', 9]]], RRF_K);
    assert.equal(fused[0][0], 'shared');
  });

  it('名次越靠前贡献越大，且不受两路分值刻度影响', () => {
    const a = rrfFuse([[['x', 1]], [['y', 2]]], RRF_K);
    assert.ok(a.find(([id]) => id === 'x')[1] > a.find(([id]) => id === 'y')[1]);
  });

  it('空路返回空表', () => {
    assert.deepEqual(rrfFuse([], RRF_K), []);
  });

  it('非法名次（0/负数/缺 id）不参与融合', () => {
    assert.deepEqual(rrfFuse([[['a', 0], ['', 3], ['b', -1]]], RRF_K), []);
  });
});
