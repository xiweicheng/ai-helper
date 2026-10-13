/**
 * memory-recall-eval-b.unit.test.js
 * 向量档（B 档）评测：用真实 embedding 产出的黄金向量跑 recall，**零联网**。
 *
 * 与 memory-recall-eval.unit.test.js（A 档）的分工：A 档钉词面门槛，B 档钉语义效果。
 * 两套期望分开写，不合并——A 档「少返甚至不返」的正确期望放到 B 档就成了「语义召回失败」。
 *
 * 为什么必须用真实向量而不是手搓向量：融合/采信规则的输入是 cos 的**分布形状**
 * （分离度、相对落差），3 维手搓向量能造出「命中」却造不出真实分布，
 * 那样测试只能钉住机制、钉不住效果——本计划要改的恰恰是效果。
 * 黄金向量由 test/eval/gen-vector-golden.mjs 一次性生成后提交。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryService } from '../../src/memory/service.js';
import { FIXTURES, SEMANTIC_CASES } from '../eval/memory-recall-fixtures.js';

const T = (key) => key;
const GOLDEN = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../eval/memory-recall-vector-golden.json'), 'utf8'));

/** 用黄金向量预置派生缓存，建一个只走远端语义档的服务 */
function withVectorFixtures(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mem-eval-b-'));
  const pick = (type) => FIXTURES.filter(m => m.type === type)
    .map(m => ({ id: m.id, content: m.content, title: m.title || '', tags: m.tags || [], type, importance: 5 }));
  const filePath = join(dir, 'global-memory.json');
  const vectorsFilePath = join(dir, 'memory-vectors.json');
  writeFileSync(filePath, JSON.stringify({ version: 1, facts: pick('fact'), summaries: pick('summary') }), 'utf8');
  // 预置文档向量：文档侧永不触发 embedDocuments，测试因此不联网
  writeFileSync(vectorsFilePath, JSON.stringify({ modelKey: GOLDEN.modelKey, vectors: GOLDEN.docs }), 'utf8');

  const svc = createMemoryService({
    filePath,
    vectorsFilePath,
    embeddingConfigProvider: () => ({
      enabled: true, mode: 'openai-compat', baseUrl: '', modelName: 'BAAI/bge-m3',
      apiKey: 'k', dimensions: 1024, queryPrefix: ''
    }),
    tierResolver: () => 'remote',
    embedTimeoutMs: 500,
    embedderFactory: () => ({
      embedQuery: async (q) => {
        const v = GOLDEN.queries[q];
        if (!v) throw new Error(`评测查询缺少黄金向量，请重跑 gen-vector-golden.mjs：${q}`);
        return v;
      },
      embedDocuments: async () => { throw new Error('评测集不应触发文档嵌入（黄金向量已预置）'); }
    })
  });
  return Promise.resolve(fn(svc, SEMANTIC_CASES)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe('记忆召回评测集（B 档向量通道）', () => {
  it('逐条断言其期望', async () => {
    await withVectorFixtures(async (svc, cases) => {
      const failures = [];
      for (const c of cases) {
        const r = await svc.recall({ query: c.query, limit: 5 }, null, T);
        assert.equal(r.success, true, `${c.name}：recall 不应失败`);
        const ids = r.results.map(m => m.id);
        // 明细打印出来：改采信门/融合规则时靠它判断影响面，不靠猜
        console.log(`[eval-b] ${c.name} → ${ids.join(', ') || '(无命中)'} | vectorMatched=${r.vectorMatched}`);

        if (c.expectNone && ids.length > 0) {
          failures.push(`${c.name}：本库无答案却返回 ${ids.length} 条（${ids.join(',')}）`);
        }
        if (c.target) {
          const rank = ids.indexOf(c.target) + 1;
          if (!rank) failures.push(`${c.name}：未召回目标 ${c.target}（实际 ${ids.join(',') || '(空)'}）`);
          else if (rank > c.maxRank) failures.push(`${c.name}：目标排第 ${rank}，要求 ≤ ${c.maxRank}`);
        }
        for (const a of (c.expectAbsent || [])) if (ids.includes(a)) failures.push(`${c.name}：含应 absent 的 ${a}`);
      }
      assert.deepEqual(failures, [], `B 档评测失败 ${failures.length} 项：\n  - ${failures.join('\n  - ')}`);
    });
  });
});
