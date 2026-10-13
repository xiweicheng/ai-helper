/**
 * memory-service.unit.test.js
 * agent 端记忆 service 行为测试（自扩展端 tool-memory.js 迁移，行为不变）
 * 通过 filePath 注入临时目录，t 用占位 stub（断言依赖结构字段而非文案）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryService } from '../../src/memory/service.js';

const T = (key, params) => `${key}:${JSON.stringify(params ?? {})}`;

function withService(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mem-test-'));
  const svc = createMemoryService({ filePath: join(dir, 'global-memory.json') });
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
