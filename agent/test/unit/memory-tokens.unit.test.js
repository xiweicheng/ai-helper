/**
 * memory-tokens.unit.test.js
 * 记忆关键词通道的计分口径测试。
 *
 * 本文件在 2026-10-13 被整体重写，原因是记忆侧从「碎 bigram 累加」改为
 * 「最长命中片段的单元制」，并与知识库共用同一份匹配实现（rag/keyword-match.js）。
 * 旧用例钉住的正是本次要消除的缺陷，逐条处置记录在计划文档
 * docs/superpowers/plans/2026-10-13-memory-keyword-parity.md 的 Task 3「执行结果」。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { keywordScore, buildDocFreqFilter, extractMemoryTerms, FIELD_WEIGHT } from '../../src/memory/tokens.js';

const T = (m) => extractMemoryTerms(m);

describe('分词与计分常量', () => {
  it('字段权重为 content>title=tags 的整数刻度', () => {
    assert.equal(FIELD_WEIGHT.content, 3);
    assert.equal(FIELD_WEIGHT.title, 2);
    assert.equal(FIELD_WEIGHT.tags, 2);
  });

  it('查询按类型拆段（拉丁整词、中文连续段），不再拆成 bigram', () => {
    const { latin, cjk } = T('RAG 混合检索 的 方案');
    assert.deepEqual(latin, ['rag']);
    assert.deepEqual(cjk, ['混合检索', '方案']);
  });

  it('空输入与假值输入不抛错且计分为 0', () => {
    for (const q of ['', '   ', null, undefined]) {
      const terms = T(q);
      assert.equal(keywordScore({ content: '任何内容', title: '', tags: [] }, terms, String(q || ''), () => true).score, 0);
    }
  });
});

// 以下三条用例把 originalQuery 传空串，是为了隔离「单元数 → 分值」这一条轴；
// 整句原样命中加分是另一条轴，单独在「整句原样命中额外加分」里钉。
describe('单元制计分（本次行为改变的核心）', () => {
  it('命中 4 字整词高于命中同词的两个碎块，且为 3 倍关系', () => {
    const terms = T('混合检索');
    const whole = { content: '本文介绍混合检索方案与落地', title: '', tags: [] };
    const scattered = { content: '这里的检索很快，概念也很混合', title: '', tags: [] };
    const w = keywordScore(whole, terms, '', () => true);
    const s = keywordScore(scattered, terms, '', () => true);
    assert.equal(w.units, 3, 'L=4 → 顶格 3 单元');
    assert.equal(s.units, 1, '只命中 2 字片段 → 1 单元（不再因两处命中累加）');
    assert.equal(w.score, FIELD_WEIGHT.content * 3);
    assert.equal(w.score, s.score * 3, '整词分恰为碎块的 3 倍');
  });

  it('同字段单元数封顶，长查询不会把分数无限推高', () => {
    const terms = T('混合检索 方案 落地 评估');
    const m = { content: '混合检索方案落地评估报告', title: '', tags: [] };
    assert.equal(keywordScore(m, terms, '混合检索 方案 落地 评估', () => true).units, 3);
  });

  it('标题与标签命中按各自权重计分', () => {
    const terms = T('知乎发文');
    const inTitle = { content: '', title: '知乎发文经验', tags: [] };
    const inTags = { content: '', title: '', tags: ['知乎发文'] };
    assert.equal(keywordScore(inTitle, terms, '', () => true).score, FIELD_WEIGHT.title * 3);
    assert.equal(keywordScore(inTags, terms, '', () => true).score, FIELD_WEIGHT.tags * 3);
  });

  it('整句原样命中额外加分：正文 +5、标题 +3', () => {
    const terms = T('知乎发文');
    const body = { content: '关于知乎发文的记录', title: '无关', tags: [] };
    const head = { content: '关于知乎发文的记录', title: '知乎发文', tags: [] };
    assert.equal(keywordScore(body, terms, '知乎发文', () => true).score, FIELD_WEIGHT.content * 3 + 5);
    assert.equal(
      keywordScore(head, terms, '知乎发文', () => true).score,
      FIELD_WEIGHT.content * 3 + 5 + FIELD_WEIGHT.title * 3 + 3
    );
  });
});

describe('与知识库同口径的两条硬性质', () => {
  it('英文按词边界：rag 不命中 storage', () => {
    const terms = T('rag 框架');
    const m = { content: 'storage persistence 层的设计', title: '', tags: [] };
    assert.equal(keywordScore(m, terms, 'rag 框架', () => true).score, 0);
  });

  it('CJK 相邻构成边界：中文rag混排应命中 rag', () => {
    const terms = T('rag');
    const m = { content: '中文rag混排的写法', title: '', tags: [] };
    assert.ok(keywordScore(m, terms, 'rag', () => true).score > 0);
  });

  it('超长查询不再只取前 200 字（碎块方案遗留的截断已随其退场）', () => {
    // 旧实现把查询截到 200 字再拆词，尾部整词会丢；单元制下窗口按片段长度走，无此截断
    const longQuery = '无意义填充'.repeat(60) + '关键标识';   // 304 字
    const m = { content: '本文末尾记了关键标识一项', title: '', tags: [] };
    const terms = T(longQuery);
    assert.ok(keywordScore(m, terms, '', () => true).score > 0, '尾部整词命中必须参与计分');
  });

  it('高频单元不参与计分（df 过半剔除），低频命中保留', () => {
    const terms = T('项目文档');
    const candidates = Array.from({ length: 9 }, (_, i) => ({
      content: i === 0 ? '项目文档模板' : '项目笔记与项目计划',
      title: '', tags: []
    }));
    const { keep: dfFilter, hasDiscriminative } = buildDocFreqFilter(candidates, terms);
    // “项目”在 8 条里被碰到（过半）→ 失去区分度；4 字整词 “项目文档” 只在 1 条 → 保留
    assert.equal(dfFilter('项目'), false);
    assert.equal(dfFilter('项目文档'), true);
    assert.equal(hasDiscriminative, true, '有任一单元幸存就不得标记为全砍');
    const noisy = { content: '项目笔记与项目计划', title: '', tags: [] };
    const real = { content: '项目文档模板', title: '', tags: [] };
    assert.equal(keywordScore(noisy, terms, '项目文档', dfFilter).score, 0);
    assert.ok(keywordScore(real, terms, '项目文档', dfFilter).score > 0);
  });

  it('查询词全部过半时标记全砍（hasDiscriminative 为 false）', () => {
    const terms = T('项目');
    const candidates = Array.from({ length: 4 }, () => ({ content: '项目笔记', title: '', tags: [] }));
    const { keep, hasDiscriminative } = buildDocFreqFilter(candidates, terms);
    assert.equal(keep('项目'), false, '4/4 命中：limit = max(2, 2) = 2，该词已无区分度');
    assert.equal(hasDiscriminative, false, '整个查询只剩这一个单元，必须让调用方知道全塌了');
  });

  it('查询词在全库根本没人碰也算全砍（无区分度可言）', () => {
    const terms = T('zzz');
    const { hasDiscriminative } = buildDocFreqFilter([{ content: '无关内容', title: '', tags: [] }], terms);
    assert.equal(hasDiscriminative, false, 'df 表里没这个 key：d 为 undefined，本来就不具备区分度');
  });

  it('df 全砍后词面单元得 0 分，整句原样命中加分仍保留', () => {
    const terms = T('混合检索');
    const hit = { content: '混合检索方案', title: '', tags: [] };
    // 空 originalQuery：只看单元通道，确认 df 剔除能把分数压到 0
    assert.equal(keywordScore(hit, terms, '', () => false).score, 0);
    assert.equal(keywordScore(hit, terms, '', () => true).score, FIELD_WEIGHT.content * 3);
    // 整句原样命中是独立信号，不受 df 影响（迁移前即如此，本计划不动它）
    assert.equal(keywordScore(hit, terms, '混合检索', () => false).score, 5);
  });
});
