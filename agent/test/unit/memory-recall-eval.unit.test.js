/**
 * memory-recall-eval.unit.test.js
 * 记忆召回评测集：把真实库里观察到的缺陷固化成可重跑的断言。
 * 与逐条单测的分工：单测钉「实现细节」，本文件钉「用户能否搜到东西」——
 * 上一轮正是因为只测了实现、没测效果，才把「向量无可测收益」的错误结论写进了文档。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryService } from '../../src/memory/service.js';
import { FIXTURES, CASES } from '../eval/memory-recall-fixtures.js';

const T = (key) => key;

/** 用固定条目建只读服务：A 档（不启用向量），钉住纯关键词通道的行为 */
function withFixtures(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mem-eval-'));
  const facts = FIXTURES.filter(m => m.type !== 'summary')
    .map(m => ({ id: m.id, content: m.content, title: m.title || '', tags: m.tags || [], type: 'fact', importance: 5 }));
  const summaries = FIXTURES.filter(m => m.type === 'summary')
    .map(m => ({ id: m.id, content: m.content, title: m.title || '', tags: m.tags || [], type: 'summary' }));
  const filePath = join(dir, 'global-memory.json');
  writeFileSync(filePath, JSON.stringify({ version: 1, facts, summaries }), 'utf8');
  const svc = createMemoryService({
    filePath,
    // A 档不写缓存，但路径也得指回临时目录：少了这一项时 facade 默认落在用户真实缓存文件上
    vectorsFilePath: join(dir, 'memory-vectors.json'),
    // A 档：绝不触碰向量侧（本评测集不联网，也不允许联网）
    embeddingConfigProvider: () => ({ enabled: false }),
    tierResolver: () => 'none',
    embedderFactory: () => { throw new Error('评测集不得创建 embedding provider'); }
  });
  return Promise.resolve(fn(svc, CASES)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

/** 跑一轮评测，返回失败项与逐条明细（明细供人工定阈值用） */
async function evaluate(svc) {
  const failures = [];
  const details = [];
  for (const c of CASES) {
    const r = await svc.recall({ query: c.query, limit: 5 }, null, T);
    const ids = r.results.map(m => m.id);
    details.push({ name: c.name, query: c.query, ids });
    if (c.top1 && ids[0] !== c.top1) failures.push(`${c.name}：top1=${ids[0] ?? '(空)'}，期望 ${c.top1}`);
    if (c.maxResults !== undefined && ids.length > c.maxResults) {
      failures.push(`${c.name}：返回 ${ids.length} 条（${ids.join(',')}），上限 ${c.maxResults}`);
    }
    for (const a of (c.expectAbsent || [])) if (ids.includes(a)) failures.push(`${c.name}：含应 absent 的 ${a}`);
    for (const e of (c.expectTop || [])) if (!ids.slice(0, 2).includes(e)) failures.push(`${c.name}：${e} 未进前 2（实际 ${ids.join(',') || '(空)'}）`);
  }
  return { failures, details };
}

describe('记忆召回评测集（A 档关键词通道）', () => {
  it('逐条断言其期望', async () => {
    await withFixtures(async (svc) => {
      const { failures, details } = await evaluate(svc);
      // 明细打印出来：调阈值/计分口径时靠它判断影响面，不靠猜
      for (const d of details) console.log(`[eval] ${d.name} → ${d.ids.join(', ') || '(无命中)'}`);
      assert.deepEqual(failures, [], `评测失败 ${failures.length} 项：\n  - ${failures.join('\n  - ')}`);
    });
  });
});
