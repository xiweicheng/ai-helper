// agent/test/eval/recalibrate-semantic-floor.mjs - 语义地板换模型重标定器（人工执行，**绝不在测试链路里跑**）
//
// 用途：换了 embedding 模型（或改了记忆文本拼接方式）后，用**当前 config 的模型**把合成
// fixture 与标注查询送进真实 embedding，量出新的安全窗口，打印建议地板与「现值 0.48 是否仍可用」。
// 为什么需要它：SEMANTIC_QUERY_FLOOR 的可用窗口随模型整体平移，不能沿用（见 fusion.js 文件头）。
// 计划 Task 2 的网格方法此前只写在归档计划里、不可执行；本脚本把它固化成一条命令。
//
// 它与 gen-vector-golden.mjs 的分工：那个把向量落盘供离线评测复现，这个把「取向量 + 算窗口」
// 连成一次读数，只打印结论不改文件。数学全在纯函数 semantic-window.js 里（已离线测试钉死）。
//
// 用法：cd agent && node test/eval/recalibrate-semantic-floor.mjs
// 前置：先在 agent config.json 的 memoryEmbedding 里配好目标模型与端点（本脚本会联网一次）。
import { FIXTURES, SEMANTIC_CASES } from './memory-recall-fixtures.js';
import { computeSemanticWindow } from './semantic-window.js';
import { createEmbeddingProvider } from '../../src/rag/embedding/index.js';
import { getMemoryEmbeddingConfig, toEmbeddingProviderConfig } from '../../src/memory/embedding-config.js';
import { memoryModelKey } from '../../src/memory/vectors.js';
import { memorySearchText } from '../../src/memory/tokens.js';
import { SEMANTIC_QUERY_FLOOR } from '../../src/memory/fusion.js';

const cfg = getMemoryEmbeddingConfig();
if (!cfg.modelName) {
  console.error('memoryEmbedding 未配置 provider（modelName 为空）。先在配置里填好目标模型与端点再标定。');
  process.exit(1);
}
const provider = createEmbeddingProvider(toEmbeddingProviderConfig(cfg));

console.log(`标定模型：${memoryModelKey(cfg)}  |  现值 SEMANTIC_QUERY_FLOOR = ${SEMANTIC_QUERY_FLOOR}\n`);

// 文档侧：逐条 fixture 嵌入（记忆文本按 memorySearchText 拼接，与线上口径一致）
const docs = {};
for (const m of FIXTURES) {
  const [vec] = await provider.embedDocuments([memorySearchText(m)]);
  docs[m.id] = vec;
}
// 查询侧：标注查询嵌入
const queries = {};
for (const c of SEMANTIC_CASES) {
  if (c.query in queries) continue;
  queries[c.query] = await provider.embedQuery(c.query);
}

const w = computeSemanticWindow({ docs, queries, cases: SEMANTIC_CASES, currentFloor: SEMANTIC_QUERY_FLOOR });

const f = (n) => (n === null || n === undefined ? '  —  ' : n.toFixed(4));

console.log('相关查询（有 target）— 决定上界：');
for (const r of w.relevant) {
  console.log(`  top1=${f(r.top1)}  ${r.targetIsTop1 ? '✓' : '✗(目标非top1)'}  target=${r.target}  ←  ${JSON.stringify(r.query)}`);
}
console.log('\n无关查询（本库无答案）— 决定下界：');
for (const r of w.control) {
  console.log(`  top1=${f(r.top1)}  误落 ${r.top1Id}  ←  ${JSON.stringify(r.query)}`);
}

console.log('\n—— 结论 ——');
console.log(`安全窗口 (${f(w.lower)}, ${f(w.upper)}]   ${w.windowUsable ? '可用' : '⚠ 空窗口，地板不可用'}`);
console.log(`窗口中点建议地板：${w.recommend === null ? '—' : w.recommend}`);
if (w.windowUsable) {
  console.log(`现值 ${SEMANTIC_QUERY_FLOOR} ${w.currentInside ? '仍在窗口内' : '⚠ 已越界'}  （下余量 ${f(w.marginBelow)}，上余量 ${f(w.marginAbove)}）`);
  if (!w.currentInside || w.marginBelow < 0.02 || w.marginAbove < 0.02) {
    console.log(`>> 建议把 fusion.js 的 SEMANTIC_QUERY_FLOOR 改为 ${w.recommend}，改后重跑 test/eval 两套评测确认。`);
  } else {
    console.log('>> 现值余量充足，无需改动。');
  }
}
if (w.warnings.length) {
  console.log('\n告警：');
  for (const msg of w.warnings) console.log('  · ' + msg);
}
console.log('\n注：窗口在合成 fixture 语料上量得，无关样本偏薄；换模型正式定值前，建议再用真实记忆库复核下界。');
