// agent/test/eval/gen-vector-golden.mjs - 黄金向量生成器（人工执行，**绝不在测试链路里跑**）
// 用途：把合成 fixture 与 B 档评测查询送进真实 embedding，导出向量供离线评测复现真实 cos 分布。
// 为什么要它：现有向量单测注入的是 3 维手搓向量，能钉机制（懒补/超时/降级）却钉不住效果——
// 上一轮正是只测机制没测效果，才把「向量无可测收益」的错误结论写进了文档。
//  provider 取当前 agent config.json 的 memoryEmbedding（用哪个模型就生成哪份黄金），
// 换模型或换档位后重跑本文件即可再生成。
// 用法：cd agent && node test/eval/gen-vector-golden.mjs
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { FIXTURES, SEMANTIC_CASES } from './memory-recall-fixtures.js';
import { createEmbeddingProvider } from '../../src/rag/embedding/index.js';
import { getMemoryEmbeddingConfig, toEmbeddingProviderConfig } from '../../src/memory/embedding-config.js';
import { memoryModelKey } from '../../src/memory/vectors.js';
import { memorySearchText } from '../../src/memory/tokens.js';

// 1024 维 × 15 条：全精度约 320KB → 5 位小数约 126KB。
// 截到 5 位对分离度（top1-top2 量级 1e-2）与名次排序无影响，误差远小于判据分辨率。
const DIGITS = 5;
const round = (v) => v.map((x) => Number(x.toFixed(DIGITS)));

const cfg = getMemoryEmbeddingConfig();
if (cfg.enabled !== true && !cfg.modelName) {
  console.error('memoryEmbedding 未配置 provider（modelName 为空）。先在配置里填好模型与端点再生成。');
  process.exit(1);
}
const provider = createEmbeddingProvider(toEmbeddingProviderConfig(cfg));

const docs = {};
for (const m of FIXTURES) {
  const [vec] = await provider.embedDocuments([memorySearchText(m)]);
  docs[m.id] = round(vec);
}

const queries = {};
for (const c of SEMANTIC_CASES) {
  if (c.query in queries) continue;
  queries[c.query] = round(await provider.embedQuery(c.query));
}

const out = { modelKey: memoryModelKey(cfg), digits: DIGITS, docs, queries };
const target = join(dirname(fileURLToPath(import.meta.url)), 'memory-recall-vector-golden.json');
writeFileSync(target, JSON.stringify(out), 'utf8');
console.log(`已生成 ${Object.keys(docs).length} 条文档向量 + ${Object.keys(queries).length} 条查询向量 → ${target}`);
console.log(`modelKey: ${out.modelKey} | 小数位: ${DIGITS}`);
