/**
 * memory-semantic-window.unit.test.js
 * 语义地板标定纯函数的离线测试：**零联网**，用已提交的 bge-m3 黄金向量跑真实 cos 分布。
 *
 * 为什么单独测这个纯函数：SEMANTIC_QUERY_FLOOR 的取值不是一个算法，而是「在标注好的
 * 相关/无关查询上，无关 top1 的最高值与相关 top1 的最低值之间有没有一段安全窗口」。
 * 这段窗口随 embedding 模型整体平移，换模型必须重算——本函数就是那套重算的数学，
 * 联网脚本只负责取向量、把向量喂给它。数学对了，脚本才不会交付一个没验证过的结论。
 *
 * 反证意识（见取安全窗口的方法）：如果哪天有人把「降权」误写成「剔除」、或把无关/相关
 * 判据取反，这里的窗口数值会立刻错位，测试即红。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeSemanticWindow } from '../eval/semantic-window.js';
import { SEMANTIC_CASES } from '../eval/memory-recall-fixtures.js';

const GOLDEN = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../eval/memory-recall-vector-golden.json'), 'utf8'));

const snap = (o) => computeSemanticWindow({
  docs: GOLDEN.docs, queries: GOLDEN.queries, cases: SEMANTIC_CASES, currentFloor: 0.48
});

describe('语义地板安全窗口标定（黄金向量离线）', () => {
  it('相关取有 target、无关取有 expectNone，其余标注无关的查询不进窗口', () => {
    const w = snap();
    // 6 条参与：5 条带 target（含「Vue 前端偏好」）、2 条 expectNone，「rag 框架」只有 expectAbsent 被忽略
    assert.equal(w.relevant.length, 5);
    assert.equal(w.control.length, 2);
    assert.ok(!w.relevant.some(r => r.query === 'rag 框架'));
    assert.ok(!w.control.some(r => r.query === 'rag 框架'));
  });

  it('下界=无关 top1 最大值、上界=相关 top1 最小值（黄金语料上可复现）', () => {
    const w = snap();
    assert.equal(w.controlTopMax.toFixed(4), '0.4322');   // 电费
    assert.equal(w.relevantTopMin.toFixed(4), '0.5163');  // 他习惯用哪种界面库写网页（vue-pref）
    assert.equal(w.lower.toFixed(4), '0.4322');
    assert.equal(w.upper.toFixed(4), '0.5163');
    assert.equal(w.windowUsable, true);
  });

  it('现值 0.48 落在窗口内，且离上界比离下界更近', () => {
    const w = snap();
    assert.equal(w.currentInside, true);
    assert.ok(w.marginBelow > 0, '0.48 应高于下界');
    assert.ok(w.marginAbove > 0, '0.48 应不高于上界');
    assert.ok(w.marginAbove < w.marginBelow, '窗口偏窄在上侧，0.48 离上界更近');
  });

  it('推荐值为窗口中点按 0.01 栅格归整', () => {
    const w = snap();
    // (0.4322 + 0.5163) / 2 = 0.47425 → 0.47
    assert.equal(w.recommend, 0.47);
  });

  it('每条相关查询都列出 target 是否 top1，供换模型时判断召回质量', () => {
    const w = snap();
    assert.equal(w.relevant.every(r => r.targetIsTop1), true);
    const vue = w.relevant.find(r => r.target === 'vue-pref' && r.query === '他习惯用哪种界面库写网页');
    assert.equal(vue.top1Id, 'vue-pref');
  });

  it('窗口空时（下界≥上界）判不可用、不给推荐值并告警', () => {
    // 人为造一个「无关查询比相关查询更像库」的退化场景：把某无关查询向量换成某相关查询向量
    const poisoned = { ...GOLDEN.queries, '法式洋葱汤要放哪些材料': GOLDEN.queries['这两个国家的综合实力谁更强'] };
    const w = computeSemanticWindow({ docs: GOLDEN.docs, queries: poisoned, cases: SEMANTIC_CASES, currentFloor: 0.48 });
    assert.equal(w.windowUsable, false);
    assert.equal(w.recommend, null);
    assert.equal(w.currentInside, false);
    assert.ok(w.warnings.some(x => x.includes('窗口')));
  });

  it('无关查询样本过薄时给出样本量告警', () => {
    const w = snap();
    assert.ok(w.warnings.some(x => x.includes('无关查询样本')));
  });
});
