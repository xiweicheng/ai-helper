/**
 * memory-service.unit.test.js
 * agent 端记忆 service 行为测试（自扩展端 tool-memory.js 迁移，行为不变）
 * 通过 filePath 注入临时目录，t 用占位 stub（断言依赖结构字段而非文案）
 * 向量侧一律靠注入关掉（见 withService），测试不读用户 config.json、不联网、不碰他真实缓存
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryService } from '../../src/memory/service.js';
import { createVectorStoreFacade } from '../../src/memory/vectors.js';

const T = (key, params) => `${key}:${JSON.stringify(params ?? {})}`;

/**
 * 关键词通道用的 service 夹具：四个注入点缺一不可。
 * 只给 filePath 时，service 会回落去读用户真实 config.json：一旦本机开过记忆向量，
 * store 的懒补向量与 recall 的语义路就会拿真 key 联网，并把向量写进用户真实的
 * ~/.ai-helper-agent/memory/memory-vectors.json（实测覆盖过他 41 条缓存），
 * 断言同时从「纯词面通道」漂成「词面 + 语义」双通道——本文件的碎块噪声用例就这样变红。
 */
function withService(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mem-test-'));
  const svc = createMemoryService({
    filePath: join(dir, 'global-memory.json'),
    vectorsFilePath: join(dir, 'memory-vectors.json'),
    embeddingConfigProvider: () => ({ enabled: false }),
    tierResolver: () => 'none',
    embedderFactory: () => { throw new Error('A 档夹具不得创建 embedding provider'); }
  });
  return Promise.resolve(fn(svc)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe('store', () => {
  it('add 新记忆写入文件并可读回', () => withService(async (svc) => {
    const r = await svc.store({ action: 'add', type: 'fact', content: '用户偏好 pnpm', importance: 8, tags: ['pkg'] }, T);
    assert.equal(r.success, true);
    assert.equal(r.action, 'added');
    assert.match(r.memory.id, /^fact_/);
    assert.equal(r.memory.importance, 8);
    assert.deepEqual(r.memory.tags, ['pkg']);
    const data = await svc.readAll();
    assert.equal(data.facts.length, 1);
  }));

  it('add 相同内容去重：转为 update 且不新增条目', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'A' }, T);
    const r = await svc.store({ action: 'add', type: 'fact', content: 'A', importance: 7 }, T);
    assert.equal(r.action, 'updated');
    assert.ok(r.message.includes('updatedDuplicate'));
    const data = await svc.readAll();
    assert.equal(data.facts.length, 1);
    assert.equal(data.facts[0].importance, 7);
  }));

  it('add 缺 type / 缺 content 报错', () => withService(async (svc) => {
    const r1 = await svc.store({ action: 'add', content: 'x' }, T);
    assert.equal(r1.success, false);
    const r2 = await svc.store({ action: 'add', type: 'fact' }, T);
    assert.equal(r2.success, false);
  }));

  it('update 缺 memoryId / 不存在 id 报错；类型不匹配提示实际类型', () => withService(async (svc) => {
    const r1 = await svc.store({ action: 'update', type: 'fact', content: 'x' }, T);
    assert.equal(r1.success, false);
    const r2 = await svc.store({ action: 'update', type: 'fact', content: 'x', memoryId: 'fact_nope' }, T);
    assert.equal(r2.success, false);
    const a = await svc.store({ action: 'add', type: 'summary', content: 'S', title: 'T' }, T);
    const r3 = await svc.store({ action: 'update', type: 'fact', content: 'x', memoryId: a.memory.id }, T);
    assert.equal(r3.success, false);
    assert.ok(r3.error.includes('summary'));
  }));

  it('delete 仅需 memoryId，跨 facts/summaries 查找', () => withService(async (svc) => {
    const a = await svc.store({ action: 'add', type: 'summary', content: 'S', title: 'T' }, T);
    const d = await svc.store({ action: 'delete', memoryId: a.memory.id }, T);
    assert.equal(d.success, true);
    assert.equal(d.removed.id, a.memory.id);
    const data = await svc.readAll();
    assert.equal(data.summaries.length, 0);
  }));

  it('delete 不存在的 id 报错', () => withService(async (svc) => {
    const d = await svc.store({ action: 'delete', memoryId: 'fact_nope' }, T);
    assert.equal(d.success, false);
  }));

  it('未知 action 报错', () => withService(async (svc) => {
    const r = await svc.store({ action: 'bogus', type: 'fact', content: 'x' }, T);
    assert.equal(r.success, false);
  }));

  it('接近上限（≥80%）时 added message 附带告警 key', () => withService(async (svc) => {
    for (let i = 0; i < 40; i++) await svc.store({ action: 'add', type: 'fact', content: `f${i}` }, T);
    const r = await svc.store({ action: 'add', type: 'fact', content: 'f40' }, T);
    assert.equal(r.success, true);
    assert.ok(r.message.includes('nearLimitWarning'));
    assert.equal((await svc.readAll()).facts.length, 41);
  }));

  it('stats 随写入更新 totalFacts', () => withService(async (svc) => {
    const r = await svc.store({ action: 'add', type: 'fact', content: 'x' }, T);
    assert.equal(r.stats.totalFacts, 1);
  }));
});

describe('recall', () => {
  it('关键词命中按 content 计分并排前', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '用户偏好 pnpm 管理依赖' }, T);
    await svc.store({ action: 'add', type: 'fact', content: '与主题无关的随机内容' }, T);
    const r = await svc.recall({ query: 'pnpm' }, null, T);
    assert.equal(r.success, true);
    assert.equal(r.total, 1);
    assert.ok(r.results[0].content.includes('pnpm'));
  }));

  it('单个中文短词仍能命中（整段命中不受单元门槛限制）', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '用户偏好 pnpm 管理依赖' }, T);
    const r = await svc.recall({ query: '依赖' }, null, T);
    assert.equal(r.total, 1);
  }));

  it('只碰到 2 字碎块的条目不当成命中（碎 bigram 噪声的出口）', () => withService(async (svc) => {
    // 目标：与查询共享 3 字片段「界面库」；噪声：只共享 2 字碎块「网页」
    await svc.store({ action: 'add', type: 'fact', content: '前端界面库偏好：选 Vue 3' }, T);
    await svc.store({ action: 'add', type: 'fact', content: '这个网页的框架选型还在讨论' }, T);
    const r = await svc.recall({ query: '他习惯用哪种界面库' }, null, T);
    assert.equal(r.total, 1, '旧实现下噪声条目会因「网页」碎块而被捣回');
    assert.ok(r.results[0].content.includes('界面库'));
  }));

  it('无命中返回 noMatch 且 results 为空', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'AAAA' }, T);
    const r = await svc.recall({ query: 'zzzzz不存在的词xyz' }, null, T);
    assert.equal(r.results.length, 0);
    assert.ok(r.message.includes('noMatch'));
  }));

  it('空库返回 memoryEmpty', () => withService(async (svc) => {
    const r = await svc.recall({ query: '任意' }, null, T);
    assert.equal(r.success, true);
    assert.equal(r.total, 0);
    assert.ok(r.message.includes('memoryEmpty'));
  }));

  it('session 级去重：重复召回同一条时标记全旧提示', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '记忆X关键词' }, T);
    const s = 'sess-1';
    const r1 = await svc.recall({ query: '记忆X' }, s, T);
    assert.equal(r1.results.length, 1);
    assert.ok(!r1.message.includes('recallNote'));
    const r2 = await svc.recall({ query: '记忆X' }, s, T);
    assert.equal(r2.results.length, 1); // 全旧场景仍返回并带提示
    assert.ok(r2.message.includes('recallNoteAllOld'));
  }));

  it('新记忆优先：混合新旧时仅返回新的并附 mixed 提示', () => withService(async (svc) => {
    const s = 'sess-2';
    await svc.store({ action: 'add', type: 'fact', content: '共同主题旧条目' }, T);
    const r1 = await svc.recall({ query: '共同主题' }, s, T);
    assert.equal(r1.results.length, 1);
    await svc.store({ action: 'add', type: 'fact', content: '共同主题新条目' }, T);
    const r2 = await svc.recall({ query: '共同主题' }, s, T);
    assert.equal(r2.results.length, 1);
    assert.ok(r2.results[0].content.includes('新条目'));
    assert.ok(r2.message.includes('recallNoteMixed'));
  }));

  it('召回后 accessCount +1 且 lastAccessAt 更新，未命中条目不变', () => withService(async (svc) => {
    const a = await svc.store({ action: 'add', type: 'fact', content: '计数测试命中' }, T);
    await svc.store({ action: 'add', type: 'fact', content: '无关内容' }, T);
    await svc.recall({ query: '计数测试' }, null, T);
    const data = await svc.readAll();
    const m = data.facts.find(x => x.id === a.memory.id);
    assert.equal(m.accessCount, 1);
    assert.ok(m.lastAccessAt);
    const untouched = data.facts.find(x => x.content === '无关内容');
    assert.equal(untouched.accessCount, 0);
  }));

  it('memoryType 过滤与 limit 生效', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '共同关键词aa' }, T);
    await svc.store({ action: 'add', type: 'summary', content: '共同关键词bb', title: 'T' }, T);
    const r = await svc.recall({ query: '共同关键词', memoryType: 'summary' }, null, T);
    assert.equal(r.results.every(m => m.type === 'summary'), true);
    const l = await svc.recall({ query: '共同关键词', limit: 1 }, null, T);
    assert.equal(l.results.length, 1);
  }));

  it('tags 筛选：命中任一标签才保留', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '标签目标内容', tags: ['Vue'] }, T);
    await svc.store({ action: 'add', type: 'fact', content: '标签目标其它内容' }, T);
    const r = await svc.recall({ query: '标签', tags: ['vue'] }, null, T);
    assert.equal(r.total, 1);
    assert.deepEqual(r.results[0].tags, ['Vue']);
  }));
});

describe('manage', () => {
  it('review 按价值升序列出，候选均为 value<10', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '低价值', importance: 1 }, T);
    await svc.store({ action: 'add', type: 'fact', content: '高价值', importance: 9 }, T);
    const r = await svc.manage({ action: 'review' }, T);
    assert.equal(r.success, true);
    assert.equal(r.scored.length, 2);
    const values = r.scored.map(s => parseFloat(s.value));
    for (let i = 1; i < values.length; i++) assert.ok(values[i - 1] <= values[i]);
    assert.ok(r.candidates.every(c => parseFloat(c.value) < 10));
    assert.ok(r.message.includes('memory.reviewTitle'));
    assert.ok(!('tool_call_id' in r));
  }));

  it('review scored/候选 不泄漏 _source 字段', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'summary', content: 'S', title: 'T', importance: 1 }, T);
    const r = await svc.manage({ action: 'review' }, T);
    assert.ok(r.scored.every(s => !('_source' in s)));
    assert.ok(r.candidates.every(c => !('_source' in c)));
  }));

  it('compact 移除低价值并写 lastReviewAt', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '低', importance: 1 }, T);
    await svc.store({ action: 'add', type: 'fact', content: '高', importance: 10 }, T);
    const r = await svc.manage({ action: 'compact' }, T);
    assert.equal(r.success, true);
    assert.equal(r.removedFacts, 1);
    const data = await svc.readAll();
    assert.equal(data.facts.length, 1);
    assert.equal(data.facts[0].content, '高');
    assert.ok(data.stats.lastReviewAt);
  }));

  it('compact 同步清除已删记忆的 session 召回缓存', () => withService(async (svc) => {
    const a = await svc.store({ action: 'add', type: 'fact', content: '召回然后进淘汰', importance: 1 }, T);
    await svc.recall({ query: '召回然后进淘汰' }, 'sess-c', T);
    assert.equal(svc._internals.sessionRecalledMemoryIds.get('sess-c').has(a.memory.id), true);
    await svc.store({ action: 'delete', memoryId: a.memory.id }, T);
    assert.equal(svc._internals.sessionRecalledMemoryIds.has('sess-c'), false);
  }));

  it('缺 action / 未知 action / 读失败均报错', () => withService(async (svc) => {
    assert.equal((await svc.manage({}, T)).success, false);
    assert.equal((await svc.manage({ action: 'bogus' }, T)).success, false);
  }));
});

describe('injectSelect', () => {
  it('importance≥8 常驻 + 其余走预算 + 返回剩余索引信息', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '常驻记忆', importance: 9, tags: ['env'] }, T);
    await svc.store({ action: 'add', type: 'fact', content: '按需记忆', importance: 5, tags: ['proj'] }, T);
    const r = await svc.injectSelect(T);
    assert.equal(r.success, true);
    assert.equal(r.injected.length, 2);
    assert.equal(r.injected[0].content, '常驻记忆'); // Tier1 优先
    assert.equal(typeof r.remainingCount, 'number');
    assert.ok(Array.isArray(r.remainingTags));
  }));

  it('summaries 永不注入，仅计入剩余索引数', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'F', importance: 5 }, T);
    await svc.store({ action: 'add', type: 'summary', content: 'S', title: 'T', importance: 10 }, T);
    const r = await svc.injectSelect(T);
    assert.equal(r.injected.every(m => m.type === 'fact'), true);
    assert.equal(r.remainingCount, 1);
  }));

  it('空库返回空注入且 remainingCount 为 0', () => withService(async (svc) => {
    const r = await svc.injectSelect(T);
    assert.equal(r.success, true);
    assert.deepEqual(r.injected, []);
    assert.equal(r.remainingCount, 0);
  }));
});

// 追加：recall 的向量通道（Tier B/C）。
// 关键约束：A 档（tier === 'none'）必须逐字维持现状——既不能触碰 provider，也不能创建向量缓存文件。
// 注入点用 embeddingConfigProvider / tierResolver / embedderFactory，测试绝不读用户真实 config.json，也绝不联网。
const EMBED_CFG = { enabled: true, mode: 'openai-compat', baseUrl: '', modelName: 'm', apiKey: 'k', dimensions: 3, queryPrefix: '' };

function withVectorService(opts, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mem-vec-test-'));
  const vectorsFilePath = join(dir, 'memory-vectors.json');
  const svc = createMemoryService({
    filePath: join(dir, 'global-memory.json'),
    vectorsFilePath,
    embeddingConfigProvider: () => ({ ...EMBED_CFG, ...(opts.embeddingConfig || {}) }),
    tierResolver: () => 'remote',
    embedTimeoutMs: 200,
    // 默认工厂直接抛：用例忘了供假 provider 时应当当场炸，而不是静默回落去拿真 provider 联网
    // （写在 ...opts 之前，用例自带的 embedderFactory 照旧覆盖它）
    embedderFactory: () => { throw new Error('向量夹具必须自带假 embedderFactory'); },
    ...opts
  });
  return Promise.resolve(fn(svc, { dir, vectorsFilePath })).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe('recall 向量通道', () => {

  // 语义近、词面零重合的条目应被召回；无关条目两条通道都不沾，应被排除
  it('向量通道召回语义相近但关键词零命中的条目，并标注 tier/vectorMatched', () => withVectorService({
    embedderFactory: () => ({
      embedQuery: async () => [1, 0, 0],
      embedDocuments: async (texts) => texts.map((s) => (s.includes('目标') ? [0.98, 0.2, 0] : [0, 1, 0]))
    })
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '目标条目', tags: [], importance: 5 }, T);
    await svc.store({ action: 'add', type: 'fact', content: '无关条目', tags: [], importance: 5 }, T);
    const backfill = await svc.backfillVectors(T);
    assert.equal(backfill.success, true);
    assert.equal(backfill.indexed, 2);

    const r = await svc.recall({ query: '完全不同措辞', limit: 5 }, null, T);
    assert.equal(r.tier, 'remote');
    assert.ok(r.vectorMatched >= 1);
    assert.equal(r.total, 1);
    assert.equal(r.results[0].content, '目标条目');
  }));

  // 计划四主缺陷的回归钉：cos 落在旧绝对阈值（0.3）之上、查询级地板（0.48）之下的条目，
  // 旧规则会当成「语义命中」并绕过词面门槛、填满 limit；新规则整通道不采信。
  // 上面那条用 0.98/0 的手搓向量钉住不了这个区间——两档规则在那种距离上结论相同。
  it('本库对该查询没有落点时，向量档不再填满窗口（旧阈值区间的噪声被挡掉）', () => withVectorService({
    embedderFactory: () => ({
      embedQuery: async () => [1, 0, 0],
      // [0.4, 0.9165151, 0] 模长 1，与查询的 cos 恰为 0.4：≥ 0.3（旧规则命中）但 < 0.48（新规则否决）
      embedDocuments: async (texts) => texts.map(() => [0.4, 0.9165151, 0])
    })
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '条目甲', tags: [], importance: 5 }, T);
    await svc.store({ action: 'add', type: 'fact', content: '条目乙', tags: [], importance: 5 }, T);
    assert.equal((await svc.backfillVectors(T)).indexed, 2);

    const r = await svc.recall({ query: 'zzz', limit: 5 }, null, T);
    assert.equal(r.success, true, '无落点应是正常空返，不是失败');
    assert.equal(r.vectorMatched, 0);
    assert.equal(r.total, 0, '两条 0.4 相似度的条目都不该被采信');
    assert.deepEqual(r.results, []);
  }));

  it('同库内既有落点也有勉强相关时，只返回落点那条', () => withVectorService({
    embedderFactory: () => ({
      embedQuery: async () => [1, 0, 0],
      embedDocuments: async (texts) => texts.map((s) => (s.includes('目标') ? [0.98, 0.2, 0] : [0.4, 0.9165151, 0]))
    })
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '目标条目', tags: [], importance: 5 }, T);
    await svc.store({ action: 'add', type: 'fact', content: '勉强条目', tags: [], importance: 5 }, T);
    assert.equal((await svc.backfillVectors(T)).indexed, 2);

    const r = await svc.recall({ query: 'zzz', limit: 5 }, null, T);
    assert.equal(r.total, 1);
    assert.equal(r.results[0].content, '目标条目');
    assert.equal(r.vectorMatched, 1);
  }));

  it('缺向量的条目在 recall 中按需补齐，第二次召回不再调用 embedDocuments', () => withVectorService({
    embedderFactory: () => {
      const calls = { q: 0, d: 0 };
      return {
        get stats() { return calls; },
        embedQuery: async () => { calls.q++; return [1, 0, 0]; },
        embedDocuments: async (texts) => { calls.d += texts.length; return texts.map(() => [0.98, 0.2, 0]); }
      };
    }
  }, async (svc, { vectorsFilePath }) => {
    await svc.store({ action: 'add', type: 'fact', content: 'alpha', tags: [], importance: 5 }, T);
    const r1 = await svc.recall({ query: 'zzz', limit: 5 }, null, T);
    assert.equal(r1.success, true);
    assert.ok(existsSync(vectorsFilePath), '补齐后应落盘向量缓存');

    const r2 = await svc.recall({ query: 'zzz', limit: 5 }, null, T);
    assert.equal(r2.success, true);
    assert.equal(r2.vectorMatched, r1.vectorMatched);
  }));

  it('embedQuery 抛错：本次召回不失败，退回关键词排序', () => withVectorService({
    embedderFactory: () => ({ embedQuery: async () => { throw new Error('boom'); }, embedDocuments: async () => { throw new Error('boom'); } })
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '必须命中 npm 包', tags: [], importance: 5 }, T);
    const r = await svc.recall({ query: 'npm', limit: 5 }, null, T);
    assert.equal(r.success, true);
    assert.equal(r.total, 1);
    assert.equal(r.vectorMatched, 0);
    assert.ok(r.results[0].content.includes('npm'));
  }));

  it('embedQuery 永不 resolve：按超时降级，不挂起', () => withVectorService({
    embedderFactory: () => ({ embedQuery: () => new Promise(() => {}), embedDocuments: async () => [] }),
    embedTimeoutMs: 20
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'x npm', tags: [], importance: 5 }, T);
    const r = await svc.recall({ query: 'npm', limit: 5 }, null, T);
    assert.equal(r.success, true);
    assert.equal(r.total, 1);
  }));

  it('provider 工厂本身抛错：等价于向量通道不可用，召回仍成功', () => withVectorService({
    embedderFactory: () => { throw new Error('no provider'); }
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'y npm', tags: [], importance: 5 }, T);
    const r = await svc.recall({ query: 'npm', limit: 5 }, null, T);
    assert.equal(r.success, true);
    assert.equal(r.vectorMatched, 0);
  }));

  it('A 档（none）完全不触碰向量侧：不调 provider、不创建缓存文件', () => {
    let embedCalls = 0;
    const dir = mkdtempSync(join(tmpdir(), 'mem-vec-a-'));
    const vectorsFilePath = join(dir, 'memory-vectors.json');
    const svc = createMemoryService({
      filePath: join(dir, 'global-memory.json'),
      vectorsFilePath,
      embeddingConfigProvider: () => ({ ...EMBED_CFG, enabled: false }),
      tierResolver: () => 'none',
      embedderFactory: () => { embedCalls++; throw new Error('A 档不该创建 provider'); }
    });
    return Promise.resolve(svc).then(async (s) => {
      await s.store({ action: 'add', type: 'fact', content: 'abc 关键词', tags: ['t'], importance: 5 }, T);
      const r = await s.recall({ query: '关键词', limit: 5 }, null, T);
      assert.equal(r.tier, 'none');
      assert.equal(r.vectorMatched, 0);
      assert.equal(r.total, 1);
      assert.equal(embedCalls, 0);
      assert.equal(existsSync(vectorsFilePath), false, 'A 档不得生成向量缓存文件');
      const bf = await s.backfillVectors(T);
      assert.equal(bf.skipped, true);
      assert.equal(embedCalls, 0);
    }).finally(() => rmSync(dir, { recursive: true, force: true }));
  });

  it('无 query 的召回不做向量计算（没有可嵌入的查询）', () => withVectorService({
    embedderFactory: () => ({ embedQuery: async () => { throw new Error('不应被调用'); }, embedDocuments: async (t) => t.map(() => [1, 0, 0]) })
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '条目', tags: [], importance: 5 }, T);
    const r = await svc.recall({ limit: 5 }, null, T);
    assert.equal(r.success, true);
    assert.equal(r.vectorMatched, 0);
    assert.equal(r.total, 1);
  }));

  it('backfillVectors 整体重建：模型标识变更即作废旧向量', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mem-vec-key-'));
    const vectorsFilePath = join(dir, 'memory-vectors.json');
    let cfg = { ...EMBED_CFG, modelName: 'm1' };
    const svc = createMemoryService({
      filePath: join(dir, 'global-memory.json'),
      vectorsFilePath,
      embeddingConfigProvider: () => cfg,
      tierResolver: () => 'remote',
      embedderFactory: () => ({ embedQuery: async () => [1, 0, 0], embedDocuments: async (t) => t.map(() => [0.98, 0.2, 0]) })
    });
    return Promise.resolve(svc).then(async (s) => {
      await s.store({ action: 'add', type: 'fact', content: 'alpha', tags: [], importance: 5 }, T);
      const first = await s.backfillVectors(T);
      assert.equal(first.indexed, 1);
      const stored = JSON.parse(readFileSync(vectorsFilePath, 'utf-8'));
      assert.equal(stored.modelKey, 'openai-compat|m1|3');

      cfg = { ...cfg, modelName: 'm2' };
      await s.backfillVectors(T);
      const after = JSON.parse(readFileSync(vectorsFilePath, 'utf-8'));
      assert.equal(after.modelKey, 'openai-compat|m2|3');
      assert.equal(Object.keys(after.vectors).length, 1, '换模型后只应剩新模型的这一条向量');
    }).finally(() => rmSync(dir, { recursive: true, force: true }));
  });

  // EMBED_BATCH_SIZE = 10，故第 11 条落在第二批。只对含标记词的那批报错，模拟真实厂商端点的
  // 「局部批 400、其余成功」——那种情况下旧实现只报 failedBatches 计数，原因既不入响应也不入日志。
  it('backfillVectors 部分批失败：原因进响应也进日志（不能只给一个计数）', () => withVectorService({
    embedderFactory: () => ({
      embedQuery: async () => [1, 0, 0],
      embedDocuments: async (texts) => {
        if (texts.some(s => String(s).includes('BOOM'))) throw new Error('400 {"code":20015}');
        return texts.map(() => [0.98, 0.2, 0]);
      }
    })
  }, async (svc) => {
    for (let i = 0; i < 10; i++) {
      await svc.store({ action: 'add', type: 'fact', content: `条目${i} alpha`, tags: [], importance: 5 }, T);
    }
    await svc.store({ action: 'add', type: 'fact', content: 'BOOM 那条长记忆', tags: [], importance: 5 }, T);

    const warns = [];
    const originalWarn = console.warn;
    console.warn = (...args) => { warns.push(args.join(' ')); };
    let r;
    try {
      r = await svc.backfillVectors(T);
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(r.success, true, '部分失败不得把整体报成失败');
    assert.equal(r.indexed, 10);
    assert.equal(r.total, 11);
    assert.equal(r.failedBatches, 1);
    assert.equal(r.lastError, '400 {"code":20015}', '有失败批时必须带出首条原因');
    assert.ok(warns.some(w => w.includes('400 {"code":20015}')), '完整原因要落进程日志');
  }));

  it('backfillVectors 全成功时不凭空造 lastError', () => withVectorService({
    embedderFactory: () => ({ embedQuery: async () => [1, 0, 0], embedDocuments: async (t) => t.map(() => [0.98, 0.2, 0]) })
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'alpha 条目', tags: [], importance: 5 }, T);
    const r = await svc.backfillVectors(T);
    assert.equal(r.failedBatches, 0);
    assert.ok(!('lastError' in r), '无失败时不得多出 lastError 字段');
  }));

  // 本地档的 pipeline 在 tokenizer.model_max_length（实测 512）处静默截断：超出部分根本不进向量，
  // 原先没有任何信号。这里只要求把它变成可见数字——不改向量、不影响建索引成败。
  // 注意检测按「provider 是否具备 tokenCounter」能力探测，不按 tier 判（夹具用的是 remote 档假工厂）。
  it('backfillVectors：超窗条目进响应也进日志（本地档静默截断必须可见）', () => withVectorService({
    embedderFactory: () => ({
      embedQuery: async () => [1, 0, 0],
      embedDocuments: async (t) => t.map(() => [0.98, 0.2, 0]),
      tokenCounter: async (texts) => ({ counts: texts.map(s => String(s).includes('超长') ? 900 : 120), window: 512 })
    })
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '超长 那条记忆', tags: [], importance: 5 }, T);
    await svc.store({ action: 'add', type: 'fact', content: '正常条目', tags: [], importance: 5 }, T);
    const longId = (await svc.readAll()).facts.find(m => m.content.includes('超长')).id;
    const warns = [];
    const originalWarn = console.warn;
    console.warn = (...args) => { warns.push(args.join(' ')); };
    let r;
    try { r = await svc.backfillVectors(T); } finally { console.warn = originalWarn; }
    assert.equal(r.indexed, 2, '超窗不得影响建索引结果');
    assert.equal(r.overWindow.count, 1, '必须报出超出本地窗口的条数');
    assert.deepEqual(r.overWindow.ids, [longId], '要能点名是哪一条');
    assert.equal(r.overWindow.window, 512, '窗口值未自定，必须照搬 provider 给的真实值');
    assert.ok(warns.some(w => w.includes('512') && w.includes(longId)), 'daemon stdout 不可见，原因要落进程日志');
  }));

  it('backfillVectors：零超窗时要明确报 0（不能与「无从判断」混淆）', () => withVectorService({
    embedderFactory: () => ({
      embedQuery: async () => [1, 0, 0],
      embedDocuments: async (t) => t.map(() => [0.98, 0.2, 0]),
      tokenCounter: async (texts) => ({ counts: texts.map(() => 50), window: 512 })
    })
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'alpha 条目', tags: [], importance: 5 }, T);
    const r = await svc.backfillVectors(T);
    assert.equal(r.overWindow.count, 0);
  }));

  it('backfillVectors：provider 不具备计数能力时不得凭空造 overWindow', () => withVectorService({
    embedderFactory: () => ({ embedQuery: async () => [1, 0, 0], embedDocuments: async (t) => t.map(() => [0.98, 0.2, 0]) })
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'alpha 条目', tags: [], importance: 5 }, T);
    const r = await svc.backfillVectors(T);
    assert.equal(r.indexed, 1);
    assert.ok(!('overWindow' in r), '远端档看不见厂商截断行为，不得装作知道');
  }));

  it('backfillVectors：计数失败不得拖垮索引结果（宁可不报也不误报）', () => withVectorService({
    embedderFactory: () => ({
      embedQuery: async () => [1, 0, 0],
      embedDocuments: async (t) => t.map(() => [0.98, 0.2, 0]),
      tokenCounter: async () => { throw new Error('tokenizer boom'); }
    })
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'alpha 条目', tags: [], importance: 5 }, T);
    const r = await svc.backfillVectors(T);
    assert.equal(r.success, true);
    assert.equal(r.indexed, 1);
    assert.equal(r.failedBatches, 0, '计数失败不得算进嵌入失败批数');
    assert.ok(!('overWindow' in r));
  }));

  it('delete 淘汰记忆后不再被召回（向量缓存中的孤儿不影响结果）', () => withVectorService({
    embedderFactory: () => ({ embedQuery: async () => [1, 0, 0], embedDocuments: async (t) => t.map(() => [0.98, 0.2, 0]) })
  }, async (svc) => {
    const added = await svc.store({ action: 'add', type: 'fact', content: '临时条目', tags: [], importance: 5 }, T);
    await svc.backfillVectors(T);
    await svc.store({ action: 'delete', memoryId: added.memory.id }, T);
    const r = await svc.recall({ query: 'zzz', limit: 5 }, null, T);
    assert.equal(r.success, true);
    assert.equal(r.total, 0);
  }));
});

describe('向量生命周期同步', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

  it('store(add) 在向量档懒补：响应不等待嵌入，之后落盘', () => withVectorService({
    embedderFactory: () => ({
      embedDocuments: async (texts) => {
        await new Promise((r) => setTimeout(r, 10));   // 慢端点：若被 await，store 响应会一起慢
        return texts.map(() => [1, 0, 0]);
      }
    })
  }, async (svc, { vectorsFilePath }) => {
    const t0 = Date.now();
    const r = await svc.store({ action: 'add', type: 'fact', content: '懒补条目', tags: [], importance: 5 }, T);
    assert.equal(r.success, true);
    assert.ok(Date.now() - t0 < 10, 'store 响应不得等待嵌入');
    await settle();
    const stored = JSON.parse(readFileSync(vectorsFilePath, 'utf-8'));
    assert.deepEqual(Object.keys(stored.vectors), [r.memory.id]);
  }));

  it('懒补失败（嵌入抛错）不影响 store 的成功响应', () => withVectorService({
    embedderFactory: () => ({ embedDocuments: async () => { throw new Error('endpoint down'); } })
  }, async (svc, { vectorsFilePath }) => {
    const r = await svc.store({ action: 'add', type: 'fact', content: '补不上', tags: [], importance: 5 }, T);
    assert.equal(r.success, true);
    await settle();
    assert.equal(existsSync(vectorsFilePath), false, '嵌入失败不应留下半成品向量文件');
  }));

  it('store(add) 在 A 档完全不触碰向量侧', () => {
    let factoryCalls = 0;
    const dir = mkdtempSync(join(tmpdir(), 'mem-life-a-'));
    const vectorsFilePath = join(dir, 'memory-vectors.json');
    const svc = createMemoryService({
      filePath: join(dir, 'global-memory.json'),
      vectorsFilePath,
      embeddingConfigProvider: () => ({ ...EMBED_CFG, enabled: false }),
      tierResolver: () => 'none',
      embedderFactory: () => { factoryCalls++; throw new Error('A 档不该建 provider'); }
    });
    return Promise.resolve(svc).then(async (s) => {
      const r = await s.store({ action: 'add', type: 'fact', content: 'x', tags: [], importance: 5 }, T);
      assert.equal(r.success, true);
      await new Promise((res) => setImmediate(res));
      assert.equal(factoryCalls, 0);
      assert.equal(existsSync(vectorsFilePath), false);
      assert.equal((await s.recall({ query: 'x' }, null, T)).vectorMatched, 0);
    }).finally(() => rmSync(dir, { recursive: true, force: true }));
  });

  it('delete 同步摘除向量，其他记忆不受牵连', () => withVectorService({
    embedderFactory: () => ({ embedQuery: async () => [1, 0, 0], embedDocuments: async (t) => t.map(() => [1, 0, 0]) })
  }, async (svc, { vectorsFilePath }) => {
    const a = await svc.store({ action: 'add', type: 'fact', content: '待删', tags: [], importance: 5 }, T);
    const b = await svc.store({ action: 'add', type: 'fact', content: '留下', tags: [], importance: 5 }, T);
    await settle();   // 先让懒补落定，再验证删除的摘除
    await svc.store({ action: 'delete', memoryId: a.memory.id }, T);
    const stored = JSON.parse(readFileSync(vectorsFilePath, 'utf-8'));
    assert.ok(!(a.memory.id in stored.vectors), '已删记忆不得残留向量');
    assert.ok(b.memory.id in stored.vectors, '其他记忆向量不受牵连');
  }));

  it('delete 未落向量的记忆也不报错（向量侧缺项是常态）', () => withVectorService({
    embedderFactory: () => ({ embedDocuments: async () => { throw new Error('no embed available'); } })
  }, async (svc) => {
    const a = await svc.store({ action: 'add', type: 'fact', content: '只有词面', tags: [], importance: 5 }, T);
    await settle();
    const r = await svc.store({ action: 'delete', memoryId: a.memory.id }, T);
    assert.equal(r.success, true);
  }));

  it('update 内容变化后重算向量（同 id 覆盖，不新增条目）', () => {
    const embeddedTexts = [];
    const dir = mkdtempSync(join(tmpdir(), 'mem-life-upd-'));
    const vectorsFilePath = join(dir, 'memory-vectors.json');
    const svc = createMemoryService({
      filePath: join(dir, 'global-memory.json'),
      vectorsFilePath,
      embeddingConfigProvider: () => ({ ...EMBED_CFG, modelName: 'mu' }),
      tierResolver: () => 'remote',
      embedderFactory: () => ({
        embedQuery: async () => [1, 0, 0],
        embedDocuments: async (texts) => {
          texts.forEach((s) => embeddedTexts.push(s));
          return texts.map(() => [1, 0, 0]);
        }
      })
    });
    return Promise.resolve(svc).then(async (s) => {
      const a = await s.store({ action: 'add', type: 'fact', content: '初稿', tags: [], importance: 5 }, T);
      await new Promise((r) => setTimeout(r, 30));
      assert.ok(embeddedTexts.some(x => x.includes('初稿')));

      await s.store({ action: 'update', type: 'fact', memoryId: a.memory.id, content: '终稿', tags: [], importance: 5 }, T);
      await new Promise((r) => setTimeout(r, 30));
      assert.ok(embeddedTexts.some(x => x.includes('终稿')), 'update 后必须按新内容重算');

      const stored = JSON.parse(readFileSync(vectorsFilePath, 'utf-8'));
      assert.deepEqual(Object.keys(stored.vectors), [a.memory.id], '同 id 覆盖，不得新增条目');
      assert.equal(stored.modelKey, 'openai-compat|mu|3');
    }).finally(() => rmSync(dir, { recursive: true, force: true }));
  });

  it('update 不存在的 id 不触发嵌入', () => {
    let calls = 0;
    const dir = mkdtempSync(join(tmpdir(), 'mem-life-miss-'));
    const svc = createMemoryService({
      filePath: join(dir, 'global-memory.json'),
      vectorsFilePath: join(dir, 'memory-vectors.json'),
      embeddingConfigProvider: () => EMBED_CFG,
      tierResolver: () => 'remote',
      embedderFactory: () => ({ embedDocuments: async (t) => { calls += t.length; return t.map(() => [1, 0, 0]); } })
    });
    return Promise.resolve(svc).then(async (s) => {
      const r = await s.store({ action: 'update', type: 'fact', memoryId: 'fact_nope', content: 'x' }, T);
      assert.equal(r.success, false);
      await new Promise((res) => setTimeout(res, 20));
      assert.equal(calls, 0);
    }).finally(() => rmSync(dir, { recursive: true, force: true }));
  });

  it('compact 淘汰的记忆同步摘除向量', () => withVectorService({
    embedderFactory: () => ({ embedQuery: async () => [1, 0, 0], embedDocuments: async (t) => t.map(() => [1, 0, 0]) })
  }, async (svc, { vectorsFilePath }) => {
    const low = await svc.store({ action: 'add', type: 'fact', content: '低价值', importance: 1 }, T);
    await svc.store({ action: 'add', type: 'fact', content: '高价值', importance: 10 }, T);
    await settle();
    const before = JSON.parse(readFileSync(vectorsFilePath, 'utf-8'));
    assert.equal(Object.keys(before.vectors).length, 2);

    const r = await svc.manage({ action: 'compact' }, T);
    assert.equal(r.success, true);
    assert.equal(r.removedFacts, 1);
    const after = JSON.parse(readFileSync(vectorsFilePath, 'utf-8'));
    assert.ok(!(low.memory.id in after.vectors), '被淘汰记忆不得残留向量');
    assert.equal(Object.keys(after.vectors).length, 1);
  }));
});

// 配置字段名适配：memoryEmbedding 存的是 baseUrl，而 rag/embedding 的 OpenAI 兼容后端读 endpoint。
// 两者曾不一致 → 远端档永远 fetch('/embeddings')，单测因注入假工厂而看不见，只有真链路会炸。
describe('provider 配置字段映射', () => {
  let seenCfg = null;
  it('交给 provider 工厂的配置带由 baseUrl 派生的 endpoint', () => withVectorService({
    embeddingConfig: { baseUrl: 'https://api.example.com/v1' },
    embedderFactory: (cfg) => {
      seenCfg = cfg;
      return { embedQuery: async () => [1, 0, 0], embedDocuments: async (t) => t.map(() => [0.98, 0.2, 0]) };
    }
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'alpha', importance: 5 }, T);
    const r = await svc.recall({ query: 'zzz', limit: 5 }, null, T);
    assert.equal(r.success, true);
    assert.ok(seenCfg, '向量档必须创建 provider');
    assert.equal(seenCfg.endpoint, 'https://api.example.com/v1');
  }));
});

// 追加：vectorStatus 只读状态。核心约束——它只读文件，绝不构造 provider
//（拿超窗计数要 await _getPipeline()，那会触发模型下载；一个只读状态查询不许有这种副作用）。
describe('vectorStatus 向量状态', () => {
  it('报告条数与指纹；换模型未重建 → stale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mem-status-'));
    const cfg = { ...EMBED_CFG, modelName: 'first-model' };
    const svc = createMemoryService({
      filePath: join(dir, 'global-memory.json'),
      vectorsFilePath: join(dir, 'memory-vectors.json'),
      embeddingConfigProvider: () => ({ ...cfg }),
      tierResolver: () => 'remote',
      embedTimeoutMs: 200,
      embedderFactory: () => ({
        embedQuery: async () => [1, 0, 0],
        embedDocuments: async () => [[0.98, 0.2, 0]]
      })
    });
    return Promise.resolve((async () => {
      await svc.store({ action: 'add', type: 'fact', content: '一条记忆', tags: [], importance: 5 }, T);
      const bf = await svc.backfillVectors(T);
      assert.equal(bf.indexed, 1);

      const fresh = await svc.vectorStatus();
      assert.equal(fresh.indexed, 1);
      assert.equal(fresh.total, 1, 'total = facts + summaries');
      assert.equal(fresh.stale, false, '刚建完不该陈旧');
      assert.equal(fresh.storedModelKey, fresh.currentModelKey);
      assert.equal(fresh.tier, 'remote');

      cfg.modelName = 'second-model';        // 模拟用户在界面里换了模型但没重建
      const stale = await svc.vectorStatus();
      assert.equal(stale.stale, true, '换模型未重建必须可见');
      assert.equal(stale.indexed, 1, '陈旧不等于向量消失，条数照实报');
      assert.notEqual(stale.storedModelKey, stale.currentModelKey);
    })().finally(() => rmSync(dir, { recursive: true, force: true })));
  });

  it('从未建过向量（空库）不算陈旧', () => withVectorService({
    // 前提修正：向量档开着时 store 会懒补出一个向量，“空库”在开启态下根本不存在
    //（实测 indexed 恒为 1）。真正需要不报警的是「向量档未开且从未建过」这种初始态。
    // 假工厂仍要给：万一档位判定变了也不会去碰真 provider。
    tierResolver: () => 'none',
    embedderFactory: () => ({ embedQuery: async () => [1, 0, 0], embedDocuments: async (t) => t.map(() => [0, 1, 0]) })
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '还没有向量', tags: [], importance: 5 }, T);
    const s = await svc.vectorStatus();
    assert.equal(s.tier, 'none');
    assert.equal(s.indexed, 0);
    assert.equal(s.total, 1);
    assert.equal(s.storedModelKey, '', '空库没有指纹');
    assert.equal(s.stale, false, '首次启用时 indexed=0 是正常态，不得报警');
  }));

  it('向量档关着也照常返回统计（残留陈旧向量是需要看到的状态，不是错误）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mem-status-off-'));
    const svc = createMemoryService({
      filePath: join(dir, 'global-memory.json'),
      vectorsFilePath: join(dir, 'memory-vectors.json'),
      embeddingConfigProvider: () => ({ ...EMBED_CFG, enabled: false, modelName: 'now-model' }),
      tierResolver: () => 'none',
      // 同上：store 会懒补向量，不给假工厂就会碰真 provider
      embedderFactory: () => ({ embedQuery: async () => [1, 0, 0], embedDocuments: async (t) => t.map(() => [0, 1, 0]) })
    });
    return Promise.resolve((async () => {
      // 直接写一份与当前配置不符的向量缓存，模拟「以前开过、换了模型、现在关了」
      const vectors = createVectorStoreFacade({ filePath: join(dir, 'memory-vectors.json') });
      await vectors.upsertVectors([['fact_x', [1, 0, 0]]], 'remote|old-model|3');
      await svc.store({ action: 'add', type: 'fact', content: '条目', tags: [], importance: 5 }, T);

      const s = await svc.vectorStatus();
      assert.equal(s.tier, 'none');
      assert.equal(s.indexed, 1, '残留向量条数照实报');
      assert.equal(s.stale, true, '关着也要能看出向量已作废');
    })().finally(() => rmSync(dir, { recursive: true, force: true })));
  });
});

// 追加：入参校验。钉住用户在真实对话里就能触发的那些脏数据路径（侧边栏记忆能力验证报告 D2/D3/D4）。
// 重点不只是「拒不拒」，而是拒绝的形态：旧代码 `type === 'fact' ? facts : summaries` 会把任何非 fact
// 的值写进 summaries（抢摘要配额）；旧代码 recall 遇到无效 memoryType 会说「记忆库为空」。
describe('store / recall 入参校验', () => {

  it('add 拒绝白名单外的 type，且不落进 summaries 兜底数组', () => withService(async (svc) => {
    const r = await svc.store({ action: 'add', type: 'note', content: 'x' }, T);
    assert.equal(r.success, false);
    assert.match(r.error, /memory\.invalidType/);
    const data = await svc.readAll();
    assert.equal(data.facts.length + data.summaries.length, 0, '无效类型不得写进任何数组');
  }));

  it('update 拒绝白名单外的 type（不再被 typeMismatch 误导成「类型不匹配」）', () => withService(async (svc) => {
    const a = await svc.store({ action: 'add', type: 'fact', content: 'F' }, T);
    const r = await svc.store({ action: 'update', type: 'bogus', content: 'x', memoryId: a.memory.id }, T);
    assert.equal(r.success, false);
    assert.match(r.error, /memory\.invalidType/);
  }));

  it('delete 照旧不要求 type', () => withService(async (svc) => {
    const a = await svc.store({ action: 'add', type: 'fact', content: 'F' }, T);
    const r = await svc.store({ action: 'delete', memoryId: a.memory.id }, T);
    assert.equal(r.success, true);
  }));

  it('importance 钳到 1..10：0 不再被 `|| 5` 吞成 5，999 落到上限', () => withService(async (svc) => {
    const lo = await svc.store({ action: 'add', type: 'fact', content: 'L', importance: 0 }, T);
    assert.equal(lo.memory.importance, 1, '0 是越界值，应钳到下限而不是被当没传退成默认 5');
    const hi = await svc.store({ action: 'add', type: 'fact', content: 'H', importance: 999 }, T);
    assert.equal(hi.memory.importance, 10);
    const str = await svc.store({ action: 'add', type: 'fact', content: 'S', importance: '8' }, T);
    assert.equal(str.memory.importance, 8, '字符串数字可解析，照钳制流程走');
    const def = await svc.store({ action: 'add', type: 'fact', content: 'D' }, T);
    assert.equal(def.memory.importance, 5, '未传仍取默认 5');
  }));

  it('importance 非数字直接报错，不写 NaN 进去毁掉价值排序', () => withService(async (svc) => {
    const r = await svc.store({ action: 'add', type: 'fact', content: 'x', importance: 'high' }, T);
    assert.equal(r.success, false);
    assert.match(r.error, /memory\.invalidImportance/);
    const data = await svc.readAll();
    assert.equal(data.facts.length, 0);
  }));

  it('update 与 add 的 importance 口径一致（旧代码 add 传 0 得 5、update 传 0 得 0）', () => withService(async (svc) => {
    const a = await svc.store({ action: 'add', type: 'fact', content: 'F', importance: 3 }, T);
    const u = await svc.store({ action: 'update', type: 'fact', content: 'F2', importance: 0, memoryId: a.memory.id }, T);
    assert.equal(u.success, true);
    assert.equal(u.memory.importance, 1);
    const bad = await svc.store({ action: 'update', type: 'fact', content: 'F3', importance: 'x', memoryId: a.memory.id }, T);
    assert.equal(bad.success, false);
    assert.match(bad.error, /memory\.invalidImportance/);
    const after = await svc.readAll();
    assert.equal(after.facts[0].content, 'F2', '拒绝非数字不得把已写入的内容改掉');
  }));

  it('去重分支同样走钳制（旧代码 `importance || duplicate.importance` 会吞掉低值）', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'dup', importance: 8 }, T);
    const r = await svc.store({ action: 'add', type: 'fact', content: 'dup', importance: 0 }, T);
    assert.equal(r.action, 'updated');
    assert.equal(r.memory.importance, 1);
  }));

  it('recall 无效 memoryType 明确报错，不再谎称「记忆库为空」', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'F' }, T);
    const r = await svc.recall({ query: 'F', memoryType: 'garbage' }, null, T);
    assert.equal(r.success, false);
    assert.match(r.error, /memory\.invalidMemoryType/);
    assert.doesNotMatch(JSON.stringify(r), /memoryEmpty/);
  }));

  it('有效 memoryType 仍照常工作（all / fact / summary 三值）', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '事实甲' }, T);
    await svc.store({ action: 'add', type: 'summary', content: '摘要乙', title: 'T' }, T);
    // 不传 query：避开词面/语义打分，只验「新加的白名单没把正常类型一并拒掉」
    for (const [mt, expectTotal] of [['all', 2], ['fact', 1], ['summary', 1]]) {
      const r = await svc.recall({ memoryType: mt }, null, T);
      assert.equal(r.success, true, mt);
      assert.equal(r.total, expectTotal, mt);
    }
  }));

  // 校验必须放在嵌入请求之前：否则一次参数写坏的记忆检索会白打一发远端嵌入
  it('无效 memoryType 的校验早于嵌入请求（不浪费一次网络往返）', () => {
    let queryCalls = 0;
    return withVectorService({
      embedderFactory: () => ({
        embedQuery: async () => { queryCalls++; return [1, 0, 0]; },
        embedDocuments: async (texts) => texts.map(() => [1, 0, 0])
      })
    }, async (svc) => {
      await svc.store({ action: 'add', type: 'fact', content: '目标', tags: [], importance: 5 }, T);
      const r = await svc.recall({ query: '目标', memoryType: 'garbage' }, null, T);
      assert.equal(r.success, false);
      assert.match(r.error, /memory\.invalidMemoryType/);
      assert.equal(queryCalls, 0, '参数非法时不得发起查询嵌入');
    });
  });
});
