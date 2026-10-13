# 记忆语义档排名融合（计划四）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让记忆的向量通道真正兑现「换个说法也能找到记忆」，同时不再像今天那样对任何查询都返回满满一窗无关条目。

**Architecture:** 把融合从「关键词分 + 向量绝对阈值加分」改成「两路各排各的名次，用 RRF 合并」；语义通道是否采信**不再看 cos 的绝对值**，而看这条查询在本库里的**分离度**（top1 与 top2 的差）与**相对落差**（top1 − margin）。语义通道的输入是排名与分布形状，不是刻度不可移植的绝对相似度。

**Tech Stack:** Node ESM + `node:test`；无新增依赖；embedding 沿用 `agent/src/rag/embedding`（远端 OpenAI 兼容 / 本地 transformers 双模）。

**Spec:** 本计划的上游依据是计划二 `2026-10-13-memory-hybrid-recall.md`（三档通道与派生缓存）与计划三 `2026-10-13-memory-keyword-parity.md`（单元制关键词计分，本计划**不动**它）。下面「前置实测」是本计划自己产出的证据。

**Global constraints:**

- A 档（`tier === 'none'`）行为**逐字不变**：不触碰 provider、不创建向量缓存文件、既有 A 档单测一条不改全绿。
- 单测**绝不联网**、绝不读用户真实 `config.json`；效果评测靠提交的**黄金向量**离线复现真实 cos 分布。
- 不手改版本号（由 `npm run release:agent` 统一同步）；不做新旧配置兼容。
- 只在 `main` 上做，不开 worktree/分支；**一律不推送**（origin / gitee / atomgit）。
- TDD：先让新断言红，再实现到绿。改完跑 `npm run build:silent`。
- 真机测量一律只读；临时脚本一律 `.tmp-` 前缀且用完即删。

---

## 前置实测（2026-10-13，真机 B 方案验证产出）

测量环境：用户真实 agent 进程（PID 93944，HEAD 代码）+ 真实 `config.json` 的 `memoryEmbedding`
（`openai-compat` / `BAAI/bge-m3` / 1024 维）+ 真实记忆库 41 条。`reindex` 41/41 成功、0 失败批、2084ms。

### 1. 现状公式把正确的排序毁掉了

| 查询（换说法） | 目标条目 cos | **纯 cos 名次** | A 档实际名次 | B 档实际名次 |
|---|---|---|---|---|
| 他习惯用哪种界面库写网页 | 0.5253 | **2 / 41** | 未召回 | **掉出前 12** |
| 这两个国家的综合实力谁更强 | 0.5823 | **1 / 41** | 未召回（0 条） | 3 |
| 为什么我查不到海外的资料 | 0.5724 | **1 / 41** | 未召回（0 条） | 4 |
| 写入假装成功其实没保存的老毛病 | 0.6355 | **1 / 41** | 未召回 | 2 |
| 前端选型时他最中意哪个库 | 0.5899 | **1 / 41** | 1 | 1 |

语义信号本身又强又准（5 条里 4 条目标 cos 全场第 1）。毁掉它的是 `+3 + round(cos×4)` 的量化：

```
cos 0.3750 → 5 分   cos 0.5000 → 5 分   cos 0.5253 → 5 分   cos 0.5467 → 5 分
```

真实库 41 条的 cos 全落在 0.26~0.64，被压进 4~6 三个整数 → 大量并列 → 并列由词面分打破
→ 词面零命中的正确目标沉底。

### 2. 绝对阈值不存在可用区间（这是本计划的核心立论）

带**控制查询**（与全库主题完全无关，正确行为 = 一条都不返回）的真实测量：

| 查询 | top1 cos | top1−top2 分离度 | `≥0.45` 条数 | `≥0.3` 条数 |
|---|---|---|---|---|
| 帮我算一下这台机器的电费（无关） | **0.5285** | 0.001 | 3 | 40/41 |
| 今天北京天气怎么样（无关） | 0.4506 | 0.037 | 1 | 36/41 |
| 法式洋葱汤要放哪些材料（无关） | 0.3436 | 0.000 | 0 | 13/41 |
| 珠穆朗玛峰的海拔高度是多少（无关） | 0.3340 | 0.001 | 0 | 10/41 |
| 他习惯用哪种界面库写网页（相关） | 0.5467 | **0.021** | 20 | 40/41 |
| 这两个国家的综合实力谁更强（相关） | 0.5823 | **0.208** | 1 | 16/41 |
| 写入假装成功其实没保存的老毛病（相关） | 0.6355 | **0.108** | 18 | 41/41 |

**无关查询的 top1 区间 0.3340~0.5285 与相关查询的目标 cos 区间 0.5253~0.6355 直接重叠**
（0.5285 > 0.5253）。所以：

- ❌ **不是「把 `MEMORY_VECTOR_THRESHOLD` 从 0.3 调高」**。调高会同时砍掉真实目标（0.53 时 Q1 目标消失）；
  调低放过 40/41。这条是我在写本计划前的预设，被数据否定。
- ❌ **也不是纯相对门槛**（`cos ≥ top1 − margin`）：它永远放过 top1，控制查询照样返回东西，
  「本库里根本没有答案」这种情况表达不了。
- ✅ **可用信号是分离度**（`top1 − top2`）。上表里相关查询的分离度 0.208 / 0.108（除 Q1），
  无关查询 0.001 / 0.037 / 0.000 / 0.001 —— 两者在分离度轴上分得很开，在 cos 绝对值轴上分不开。

### 3. 计划三留下的真实缺陷：语义档整体绕过词面门槛

`service.js:462` 的过滤条件是 `s.vectorHit || isKeywordHit(s)`，而 `vectorHit = cos ≥ 0.3` 在真实库上
对 39~41/41 条成立：

```
A 档：5 条查询返回 1 / 0 / 0 / 1 / 1 条   ← 计划三的噪声门槛在起作用（无关命中 43→3）
B 档：5 条查询一律填满 limit              ← 门槛被 vectorHit 旁路，噪声以「语义命中」名义全部回归
```

**计划三的降噪成果只在向量关闭时成立。** 本计划必须同时修掉这个旁路。

### 4. 合成评测集在真实向量下可用（决定评测怎么建）

把 `test/eval/memory-recall-fixtures.js` 的 7 条 fixture 送进真实 bge-m3 后：4 条语义查询的目标 cos
**全部排第 1**（0.5163 / 0.5831 / 0.5851 / 0.6283），两条控制查询的 top1 只有 0.3122 / 0.4318。
即合成集能表达「词面救不了、语义能救」的用例，且体积可控（13 条 1024 维向量，5 位小数 ≈ 109KB）。
→ 评测用**提交的黄金向量**离线跑，不联网。

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `agent/test/eval/gen-vector-golden.mjs` | 黄金向量生成器（联网一次，人工执行，非测试链路） | Create |
| `agent/test/eval/memory-recall-vector-golden.json` | 7 条 fixture + 6 条查询的真实 bge-m3 向量（5 位小数） | Create |
| `agent/test/eval/memory-recall-fixtures.js` | 追加语义档期望（`semantic` 用例组：目标 id + 控制查询必须空返） | Modify |
| `agent/test/unit/memory-recall-eval-b.unit.test.js` | 向量档评测：注入黄金向量，零联网，跑改动前红→改动后绿 | Create |
| `agent/src/memory/fusion.js` | 纯函数：语义采信门（分离度 + 相对落差）与 RRF 融合，无 IO | Create |
| `agent/test/unit/memory-fusion.unit.test.js` | fusion 纯函数单测（含边界：单条、全并列、空表） | Create |
| `agent/src/memory/service.js` | fused 分支改走 fusion.js（427-465 行区间）；`vectorMatched` 语义变更 | Modify |
| `agent/src/memory/tier.js` | 删除 `MEMORY_VECTOR_THRESHOLD`（无绝对阈值可言） | Modify |
| `agent/test/unit/memory-tier.unit.test.js` | 删除钉 `= 0.3` 的两条断言（53-54 行） | Modify |
| `agent/test/unit/memory-service.unit.test.js` | 向量通道用例按新语义调整（逐条说明为什么是预期改变） | Modify |
| `agent/src/memory/embedding-config.js` | `toEmbeddingProviderConfig`：local 档空 `queryPrefix` 交出回落权 | Modify |
| `agent/src/memory/service.js` | 本地档嵌入前文本长度上限（避免整批 400 静默失败） | Modify |
| `agent/test/unit/memory-embedding-config.unit.test.js` | queryPrefix 回落用例 | Modify |
| `CHANGELOG.md` / `agent/README.md` / `agent/README.zh-CN.md` | 文档同步（含「B 档会填满窗口」的既有描述更正） | Modify |

**新建 `fusion.js` 而不是继续堆 `service.js`**：service.js 已 769 行，且融合规则是本计划要反复调参的对象，
独立成纯函数才能被单测直接钉住、也才能在离线评测里逐条复算。

---

## Task 1: 向量档评测基线（黄金向量 + 语义用例），先跑红

**Files:**
- Create: `agent/test/eval/gen-vector-golden.mjs`
- Create: `agent/test/eval/memory-recall-vector-golden.json`（由上一步生成后提交）
- Modify: `agent/test/eval/memory-recall-fixtures.js`（追加 `SEMANTIC_CASES`）
- Create: `agent/test/unit/memory-recall-eval-b.unit.test.js`

**Interfaces:**
- Consumes: `FIXTURES`（现有 7 条）、`createMemoryService` 的注入点 `embedderFactory` / `tierResolver` / `vectorsFilePath`、`memorySearchText`、`cosine`。
- Produces: `SEMANTIC_CASES`（Task 2/3 的判据输入）、黄金向量文件结构 `{ modelKey, docs: {id: number[]}, queries: {text: number[]} }`。

- [ ] **Step 1: 写黄金向量生成器**

```js
// agent/test/eval/gen-vector-golden.mjs
// 一次性工具：把合成 fixture 与评测查询送进真实 embedding，导出黄金向量供离线测试使用。
// **不在测试链路里跑**（测试必须零联网）。换模型/换档位后重跑本文件即可再生成。
// 用法：node test/eval/gen-vector-golden.mjs
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { FIXTURES, SEMANTIC_CASES } from './memory-recall-fixtures.js';
import { createEmbeddingProvider } from '../../src/rag/embedding/index.js';
import { getMemoryEmbeddingConfig, toEmbeddingProviderConfig } from '../../src/memory/embedding-config.js';
import { memoryModelKey } from '../../src/memory/vectors.js';
import { memorySearchText } from '../../src/memory/tokens.js';

const DIGITS = 5; // 1024 维 × 13 条：全精度 275KB → 5 位小数 ~109KB，排序与分离度判定不受影响
const round = (v) => v.map((x) => Number(x.toFixed(DIGITS)));

const provider = createEmbeddingProvider(toEmbeddingProviderConfig(getMemoryEmbeddingConfig()));
const docs = {};
for (const m of FIXTURES) docs[m.id] = round((await provider.embedDocuments([memorySearchText(m)]))[0]);
const queries = {};
for (const c of SEMANTIC_CASES) queries[c.query] = round(await provider.embedQuery(c.query));

const out = { modelKey: memoryModelKey(getMemoryEmbeddingConfig()), digits: DIGITS, docs, queries };
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'memory-recall-vector-golden.json'), JSON.stringify(out), 'utf8');
console.log(`已生成 ${Object.keys(docs).length} 条文档向量 + ${Object.keys(queries).length} 条查询向量`);
```

- [ ] **Step 2: 给 fixtures 追加语义档期望**

在 `agent/test/eval/memory-recall-fixtures.js` 末尾追加（**与现有 `CASES` 分开**：`CASES` 钉 A 档，
本组钉 B 档，两套期望不能混，否则 A 档的「少返」期望会伪装成 B 档的语义召回失败）：

```js
/**
 * 向量档（B 档）评测用例。与 A 档 `CASES` 的分工：
 * - A 档钉「词面门槛不把共享碎块的无关条目当成命中」；
 * - B 档钉「换个说法能找到目标」且「本库无答案时必须空返」——后者是向量档今天完全缺失的能力。
 * 期望写成 cos 分布无关的形式（名次/空返），而不是 cos 数值，换模型后仍成立。
 */
export const SEMANTIC_CASES = [
  // ---- 词面零重叠但语义唯一：向量档的全部价值所在，必须命中 ----
  { name: '换说法命中 Vue 偏好', query: '他习惯用哪种界面库写网页', target: 'vue-pref', maxRank: 3 },
  { name: '换说法命中国家观点', query: '这两个国家的综合实力谁更强', target: 'country', maxRank: 2 },
  { name: '换说法命中境外访问', query: '为什么我查不到海外的资料', target: 'proxy', maxRank: 2 },
  { name: '换说法命中 store 缺陷', query: '写入假装成功其实没保存的老毛病', target: 'mem-bug', maxRank: 2 },

  // ---- 控制组：与全库主题无关。正确行为是一条都不返回（今天 B 档会填满窗口）----
  { name: '无关查询不得返回任何东西（菜谱）', query: '法式洋葱汤要放哪些材料', expectNone: true },
  { name: '无关查询不得返回任何东西（电费）', query: '帮我算一下这台机器的电费', expectNone: true },

  // ---- 词面命中在向量档不能被降级：A 档结果必须仍在前 2 ----
  { name: '词面命中不因融合掉出前 2', query: 'Vue 前端偏好', target: 'vue-pref', maxRank: 2 },
  { name: '子串误伤在向量档同样不允许', query: 'rag 框架', expectAbsent: ['mem-bug'] },
];
```

- [ ] **Step 3: 写向量档评测的测试文件**

```js
/**
 * memory-recall-eval-b.unit.test.js
 * 向量档评测：用真实 embedding 产出的黄金向量跑 recall，零联网。
 * 为什么必须有它：现有向量单测注入的是 3 维手搓向量，能钉住机制（懒补、超时、降级）
 * 但钉不住效果——上一轮正是只测机制没测效果，才把「向量无可测收益」写进了文档。
 * 黄金向量的 cos 分布是真实的，所以融合公式的每次改动都能量化。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryService } from '../../src/memory/service.js';
import { FIXTURES } from '../eval/memory-recall-fixtures.js';
import { SEMANTIC_CASES } from '../eval/memory-recall-fixtures.js';

const T = (key) => key;
const GOLDEN = JSON.parse(readFileSync(join(import.meta.dirname, '../eval/memory-recall-vector-golden.json'), 'utf8'));

function withVectorFixtures(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mem-eval-b-'));
  const facts = FIXTURES.filter(m => m.type !== 'summary')
    .map(m => ({ id: m.id, content: m.content, title: m.title || '', tags: m.tags || [], type: 'fact', importance: 5 }));
  const summaries = FIXTURES.filter(m => m.type === 'summary')
    .map(m => ({ id: m.id, content: m.content, title: m.title || '', tags: m.tags || [], type: 'summary' }));
  const filePath = join(dir, 'global-memory.json');
  const vectorsFilePath = join(dir, 'memory-vectors.json');
  writeFileSync(filePath, JSON.stringify({ version: 1, facts, summaries }), 'utf8');
  // 预置黄金向量缓存：文档侧不再调 embedDocuments，测试完全不联网
  writeFileSync(vectorsFilePath, JSON.stringify({ modelKey: GOLDEN.modelKey, vectors: GOLDEN.docs }), 'utf8');

  const svc = createMemoryService({
    filePath,
    vectorsFilePath,
    embeddingConfigProvider: () => ({ enabled: true, mode: 'openai-compat', baseUrl: '', modelName: 'BAAI/bge-m3', apiKey: 'k', dimensions: 1024, queryPrefix: '' }),
    tierResolver: () => 'remote',
    embedTimeoutMs: 500,
    embedderFactory: () => ({
      embedQuery: async (q) => {
        const v = GOLDEN.queries[q];
        if (!v) throw new Error(`评测查询缺少黄金向量：${q}`);
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
        const ids = r.results.map(m => m.id);
        console.log(`[eval-b] ${c.name} → ${ids.join(', ') || '(无命中)'} | vectorMatched=${r.vectorMatched}`);
        if (c.expectNone && ids.length > 0) failures.push(`${c.name}：本库无答案却返回 ${ids.length} 条（${ids.join(',')}）`);
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
```

- [ ] **Step 4: 生成黄金向量文件（唯一需要联网的一步）**

Run: `cd agent && node test/eval/gen-vector-golden.mjs`
Expected: `已生成 7 条文档向量 + 8 条查询向量`，产出 `agent/test/eval/memory-recall-vector-golden.json`（约 100~110KB）

- [ ] **Step 5: 跑 B 档评测，确认改动前是红的**

Run: `cd agent && node --test test/unit/memory-recall-eval-b.unit.test.js`
Expected: **FAIL**，且失败项必须包含两类：
1. 两条控制查询「本库无答案却返回 5 条」—— 这就是实测 3 号缺陷的直接体现；
2. 换说法用例可能部分通过（现状公式在 cos 分离度大时侥幸能中），**不许**因为"大部分通过"就认为基线正常：
   控制查询不空返就是红。

- [ ] **Step 6: 记录基线明细，提交**

把 `[eval-b]` 逐行输出抄进本计划末尾的「执行结果」块（改动前基线）。

```bash
git add agent/test/eval/gen-vector-golden.mjs agent/test/eval/memory-recall-vector-golden.json \
        agent/test/eval/memory-recall-fixtures.js agent/test/unit/memory-recall-eval-b.unit.test.js
git commit -m "test: 记忆向量档评测基线（黄金向量离线复现真实 cos 分布）"
```

**注意**：`memory-recall-fixtures.js` 追加 `SEMANTIC_CASES` 后必须确认 A 档评测仍全绿
（`node --test test/unit/memory-recall-eval.unit.test.js`）—— A 档只消费 `CASES`，不该受影响；
若变红说明两处期望互相矛盾，必须当场解决而不是留到实现阶段。

---

## Task 2: 融合与采信门的候选规则实测（禁止拍脑袋定常量）

**Files:**
- Create: `agent/.tmp-rule-grid.mjs`（一次性，**用完即删，不提交**）

**Interfaces:**
- Consumes: Task 1 的 `memory-recall-vector-golden.json`、`SEMANTIC_CASES`；真实库只读副本（41 条 + 现有 `memory-vectors.json`）。
- Produces: 三个常量的选定值 —— `SEMANTIC_GAP_MIN`（分离度下限）、`SEMANTIC_MARGIN`（相对落差）、`SEMANTIC_MAX_TAKE`（每查询最多采信几条），以及 `RRF_K`。供 Task 3 直接引用。

- [ ] **Step 1: 声明判据优先级（写进脚本注释，先看数据再选规则）**

按此顺序比较候选，前一条分出的胜负不被后一条翻转：

1. **控制查询返回条数之和必须为 0**（首要：向量档不能把「本库无答案」伪装成「找到了」）；
2. 相关查询的目标名次之和最小；
3. 平均返回条数最小（噪声越少越好，注入提示词的预算有限）；
4. 常量取值**避开实测分布的边界**（若 gap ∈ [0.037, 0.108]，选定值不得贴着 0.037 或 0.108）。

- [ ] **Step 2: 跑候选网格**

脚本要点（离线复算，不调 recall，只用黄金向量 + 现有 `keywordScore` 直接算两路名次）：

```js
const GAPS = [0.02, 0.03, 0.05, 0.08, 0.10];
const MARGINS = [0.03, 0.05, 0.08, 0.12];
const TAKES = [1, 2, 3, 5];
// 语义采信：top1 - top2 >= gap 才启用该通道；采信 cos >= top1 - margin 的前 take 条
// 融合：rrf = (kw ? 1/(K+rankKw) : 0) + (vec ? 1/(K+rankVec) : 0)，K = 60
// 两套库各跑一遍：合成 7 条（小库）与真实 41 条（大库）
```

输出每张表的（控制返回数、目标名次和、平均返回数），格式：

```
gap  margin  take | 合成: ctrl/排名和/均值 | 真实: ctrl/排名和/均值
```

- [ ] **Step 3: 必须检查的两个已知死角（写进执行结果，不许隐瞒）**

1. **真实库 Q1（界面库）**：目标 cos 第 2 且 top1−top2 = 0.0214。任何 `gap ≥ 0.03` 的规则都会整通道否决 → Q1 在 B 档仍拿不到目标。若选 `gap ≤ 0.02` 则控制查询「电费/天气」放 1~3 条噪声。这是**结构性二选一**，必须如实记录选了哪边及其代价，不许用"平均值更好看"糊过去。
2. **合成集 Q1** 的分离度 0.013 与真实库 Q1 的 0.021 落在 gap 轴同一侧但结论相反（前者 top1 就是目标，后者 top1 是噪声）。gap 规则在小库（7 条）与大库（41 条）上不可外推 —— 若两者选不出同一组常量，**以真实库为准**并写明合成集该用例的期望需要相应放宽。

- [ ] **Step 4: 定数并把实测表写进「执行结果」**

不写「取经验值 0.05」。写：哪个候选在判据 1 上打平、判据 2/3 上如何排序、最终值距边界多远。

- [ ] **Step 5: 删除脚本**

```bash
rm -f agent/.tmp-rule-grid.mjs && git status --porcelain -uall   # 必须为空
```

---

## Task 3: 实现排名融合与语义采信门

**Files:**
- Create: `agent/src/memory/fusion.js`
- Create: `agent/test/unit/memory-fusion.unit.test.js`
- Modify: `agent/src/memory/service.js`（14 行 import、46-47 行常量、427-465 行 fused 分支）
- Modify: `agent/src/memory/tier.js`（删 `MEMORY_VECTOR_THRESHOLD`）
- Modify: `agent/test/unit/memory-tier.unit.test.js`（删 53-54 行两条断言）
- Modify: `agent/test/unit/memory-service.unit.test.js`（向量通道用例）

**Interfaces:**
- Consumes: `keywordScore`（计划三，返回 `{score, units, full}`）、`cosine`、Task 2 定下的三个常量。
- Produces:
  - `selectSemanticHits(pairs, { gapMin, margin, maxTake }) → Array<[id, cos]>`，`pairs` 为 `[id, cos][]`
  - `rrfFuse(lists, k) → Array<[id, number]>`
  - `SEMANTIC_GAP_MIN` / `SEMANTIC_MARGIN` / `SEMANTIC_MAX_TAKE` / `RRF_K`

- [ ] **Step 1: 写 fusion 单测（先红）**

```js
// agent/test/unit/memory-fusion.unit.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectSemanticHits, rrfFuse, RRF_K } from '../../src/memory/fusion.js';

describe('selectSemanticHits', () => {
  const G = { gapMin: 0.05, margin: 0.05, maxTake: 3 };

  it('分离度不足整通道否决：本库没有明确答案时不返回任何语义命中', () => {
    assert.deepEqual(selectSemanticHits([['a', 0.5285], ['b', 0.5275], ['c', 0.4]], G), []);
  });

  it('分离度达标时采信，且相对落差之外的尾部被砍', () => {
    const hits = selectSemanticHits([['a', 0.63], ['b', 0.52], ['c', 0.51]], G);
    assert.deepEqual(hits.map(h => h[0]), ['a'], 'b/c 距 top1 超过 margin，不得采信');
  });

  it('采信条数受 maxTake 封顶（防止高分查询填满窗口）', () => {
    const many = Array.from({ length: 10 }, (_, i) => [`x${i}`, 0.7 - i * 0.001]);
    assert.equal(selectSemanticHits(many, { ...G, gapMin: 0.0001 }).length, 3);
  });

  it('单条候选与空表不抛错（记忆库只有 1 条时无法算分离度，按否决处理）', () => {
    assert.deepEqual(selectSemanticHits([], G), []);
    assert.deepEqual(selectSemanticHits([['only', 0.6]], G), []);
  });

  it('绝对 cos 高低不参与判定：同分布整体平移结果不变', () => {
    const low = [['a', 0.31], ['b', 0.11], ['c', 0.10]];
    const high = [['a', 0.81], ['b', 0.61], ['c', 0.60]];
    assert.deepEqual(selectSemanticHits(low, G).map(h => h[0]), selectSemanticHits(high, G).map(h => h[0]));
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
});
```

Run: `cd agent && node --test test/unit/memory-fusion.unit.test.js`
Expected: FAIL with `Cannot find module ... fusion.js`

- [ ] **Step 2: 实现 fusion.js**

```js
// agent/src/memory/fusion.js - 语义采信门与排名融合（纯函数，无 IO）
// 为什么不用绝对阈值：真实记忆库实测「无关查询的 top1 cos 区间 0.3340~0.5285」与
// 「相关查询的目标 cos 区间 0.5253~0.6355」直接重叠，cos 绝对值在本数据域不可判别
// （证据见 docs/superpowers/plans/2026-10-13-memory-rank-fusion.md 前置实测 2）。
// 改用两个与刻度无关的量：本次查询的分离度（top1-top2）与相对落差（top1-cos）。
// 常量取值来自同一份实测网格，改动需重跑该测量（见计划 Task 2）。

export const SEMANTIC_GAP_MIN = 0.05;   // ← Task 2 实测选定，替换占位值
export const SEMANTIC_MARGIN = 0.05;    // ← 同上
export const SEMANTIC_MAX_TAKE = 3;     // ← 同上
export const RRF_K = 60;                // 排名融合的平滑常数（业界默认值，本计划不重调）

/**
 * 语义通道采信哪些条目。
 * ① 分离度门：top1 与 top2 差不足 gapMin → 整通道否决（本库对该查询没有明确答案）。
 *    记忆召回的结果会被注入提示词，"全都勉强相关" 等于 "没有相关"，此时宁可不给。
 * ② 相对落差门：只采信 cos ≥ top1 - margin 的头部，砍掉高分查询的长尾。
 * ③ 条数封顶 maxTake：防止一次语义命中填满 limit。
 * @param {Array<[string, number]>} pairs [id, cos]，顺序任意
 * @param {{gapMin:number, margin:number, maxTake:number}} gate
 * @returns {Array<[string, number]>} 按 cos 降序的采信结果（可为空）
 */
export function selectSemanticHits(pairs = [], gate = { gapMin: SEMANTIC_GAP_MIN, margin: SEMANTIC_MARGIN, maxTake: SEMANTIC_MAX_TAKE }) {
  const ranked = [...pairs].filter(([, c]) => Number.isFinite(c)).sort((a, b) => b[1] - a[1]);
  if (ranked.length < 2) return [];
  const top = ranked[0][1];
  if (top - ranked[1][1] < gate.gapMin) return [];
  const floor = top - gate.margin;
  return ranked.filter(([, c]) => c >= floor).slice(0, gate.maxTake);
}

/**
 * Reciprocal Rank Fusion：只消费名次，不消费分数，因此两路刻度不可比也不再是问题。
 * @param {Array<Array<[string, number]>>} lists 每路的 [id, rank]（rank 从 1 起）
 * @param {number} k
 * @returns {Array<[string, number]>} [id, 融合分] 降序
 */
export function rrfFuse(lists = [], k = RRF_K) {
  const acc = new Map();
  for (const list of lists) {
    for (const [id, rank] of list || []) {
      if (!id || !(rank >= 1)) continue;
      acc.set(id, (acc.get(id) || 0) + 1 / (k + rank));
    }
  }
  return [...acc.entries()].sort((a, b) => b[1] - a[1]);
}
```

- [ ] **Step 3: fusion 单测转绿**

Run: `cd agent && node --test test/unit/memory-fusion.unit.test.js`
Expected: PASS 8/8（用例数以实际写出的为准，逐条报告数字）

- [ ] **Step 4: 接线 service.js 的 fused 分支**

删除 46-47 行的 `VECTOR_HIT_BONUS` / `VECTOR_SCALE_POINTS`（RRF 之后不再有"向量加几分"的概念），
把 427-465 行的 fused 分支换成：

```js
          } else {
            // 双通道排名融合（RRF）：关键词与向量各排各的名次，只按名次合并。
            // 不叠加绝对相似度分数的原因见 memory/fusion.js 文件头——cos 绝对值在记忆粒度上不可判别。
            const vecMap = (await vectors.read()).vectors;

            const missing = candidates.filter(m => m.id && !(m.id in vecMap));
            if (missing.length) {
              // 派生缓存按需补齐（逻辑不变）：补不上只是这次少一条语义分，不影响正确性
              try {
                const { provider, cfg } = getProvider();
                const vecs = await embedWithTimeout(provider.embedDocuments(missing.map(memorySearchText)));
                const pairs = missing.map((m, i) => [m.id, Array.isArray(vecs) ? vecs[i] : undefined]).filter(([, v]) => Array.isArray(v) && v.length);
                if (pairs.length) {
                  await vectors.upsertVectors(pairs, memoryModelKey(cfg));
                  for (const [id, v] of pairs) vecMap[id] = v;
                }
              } catch (err) {
                console.warn('[Memory] vector backfill skipped:', err.message);
              }
            }

            // 关键词路：口径与 A 档逐字一致（同一门槛、同一排序），只是取名次
            const kwRanked = candidates
              .map(m => ({ memory: m, ...keywordScore(m, terms, originalQuery, dfFilter) }))
              .filter(isKeywordHit)
              .sort((a, b) => b.score - a.score);

            // 语义路：全候选算 cos 后过采信门（分离度 + 相对落差 + 条数封顶）
            const cosPairs = candidates
              .map(m => (m.id && vecMap[m.id] ? [m.id, cosine(queryVec, vecMap[m.id])] : null))
              .filter(Boolean);
            const semantic = selectSemanticHits(cosPairs);
            const vecRank = new Map(semantic.map(([id], i) => [id, i + 1]));
            vectorMatched = semantic.length;

            const byId = new Map(candidates.map(m => [m.id, m]));
            const kwRank = new Map(kwRanked.map((s, i) => [s.memory.id, i + 1]));
            const fusedList = rrfFuse([
              [...kwRank.entries()],
              [...vecRank.entries()],
            ]);

            candidates = fusedList.map(([id]) => byId.get(id)).filter(Boolean);
          }
```

`import` 行加 `selectSemanticHits, rrfFuse`，去掉 `MEMORY_VECTOR_THRESHOLD`；`tier.js` 删该常量
（同时删 `test/unit/memory-tier.unit.test.js:5` 的 import，否则该名字变 `undefined` 而断言会以
「undefined ≠ 0.3」这种误导性形式失败）。

- [ ] **Step 5: 语义变更点写进注释并同步断言**

`vectorMatched` 的含义由「过了绝对阈值的条数」变成「被采信进语义路的条数」。
全仓已确认扩展端与界面**都不消费该字段**（`grep -rn "vectorMatched|\.tier\b" src/` 为空），
仅转发层原样透传，故无需改扩展端。`memory-service.unit.test.js` 中依赖旧含义的断言逐条按新语义改，
并在执行结果里写明每条为什么是预期的行为改变。

**两条必须是此语义、不得中途「顺手修好」的设计决定：**

1. **候选不足 2 条时语义路整条不采信**（`selectSemanticHits` 里 `ranked.length < 2 → []`）。
   库里只有 1 条记忆时分离度无从谈起，此时若改用绝对 cos 地板就违背了本计划的核心立论。已知代价：
   极小库下语义档不生效，只有 A 档关键词通道工作 —— 该行为由 fusion 单测显式钉住，是有意为之。
2. **`SEMANTIC_MAX_TAKE` 封顶优先于 `limit`**：一次语义命中最多 N 条，不因调用方给了大 limit 就放更多。
   记忆召回的结果是直接注入提示词的上下文，预算比「宁多勿少」重要。

- [ ] **Step 6: 三套评测与全量单测一起跑**

```bash
cd agent
node --test test/unit/memory-fusion.unit.test.js
node --test test/unit/memory-recall-eval.unit.test.js      # A 档必须仍全绿（一条未改）
node --test test/unit/memory-recall-eval-b.unit.test.js    # B 档从红转绿
node --test "test/unit/memory-*.unit.test.js"
```

Expected: 全绿。若 B 档仍有失败，回到 Task 2 用网格重选常量，**不许反向修改期望来迁就实现**。

- [ ] **Step 7: 提交**

```bash
git add agent/src/memory/fusion.js agent/test/unit/memory-fusion.unit.test.js \
        agent/src/memory/service.js agent/src/memory/tier.js \
        agent/test/unit/memory-tier.unit.test.js agent/test/unit/memory-service.unit.test.js
git commit -m "feat(memory): 语义档改排名融合，绝对阈值换分离度门"
```

---

## Task 4: 真机复测（新公式在用户真实库上的实际效果）

**Files:**
- Create: `agent/.tmp-live-verify.mjs`（一次性，用完即删）

**Interfaces:**
- Consumes: 已就位的真机环境（agent PID 93944 跑 HEAD、`config.json` 已含 `memoryEmbedding` provider、`memory-vectors.json` 41 条已建好、pairings token 有效）。
- Produces: 「前置实测」同一批查询在新公式下的返回明细，与 A 档逐条对照。

- [ ] **Step 1: 打开向量档并跑 9 条查询（5 相关 + 4 控制）**

脚本要点：`POST /api/memory/embedding-config {enabled:true}` → 对每条查询 `POST /api/memory/recall {limit:5}`，
记录 `tier` / `vectorMatched` / 返回条数 / 目标名次；**控制查询必须单独列出**，它才是本计划的主判据。

查询清单（与前置实测逐字相同，不许换说法）：

```
相关：他习惯用哪种界面库写网页 / 这两个国家的综合实力谁更强 / 为什么我查不到海外的资料
     写入假装成功其实没保存的老毛病 / 前端选型时他最中意哪个库
控制：法式洋葱汤要放哪些材料 / 帮我算一下这台机器的电费 / 今天北京天气怎么样
     珠穆朗玛峰的海拔高度是多少
```

- [ ] **Step 2: 通过标准（先写死再测）**

1. **4 条控制查询返回 0 条** —— 这是计划四存在的理由，做不到就是没完成，不做「虽然返回了但其实……」的解释；
2. 相关查询目标名次之和 ≤ 前置实测的 6（A 档口径下不可召回的记为不比较）；
3. 每条相关查询返回条数 ≤ `SEMANTIC_MAX_TAKE + 词面命中数`，不许填满 limit。

- [ ] **Step 3: 关掉向量档并确认 A 档逐字未变**

`POST /api/memory/embedding-config {enabled:false}` 后重跑 5 条相关查询，结果必须仍是
`1 / 0 / 0 / 1 / 1`（前置实测的 A 档基线）。若变了，说明融合改动泄漏进了 A 档路径 —— 立即回滚排查，
不要在计划三已验收的通道上引入回归。

- [ ] **Step 4: 明细写进「执行结果」，删脚本**

```bash
rm -f agent/.tmp-live-verify.mjs && git status --porcelain -uall   # 必须为空
```

**收尾状态**：`memoryEmbedding.enabled` 留 false 还是 true，由用户在报告后拍板；
`memory-vectors.json`（41 条 / 891KB）保留复用，避免每轮验证都重新联网嵌入。

---

## Task 5: 本地档真正可用（长文本、queryPrefix、失败可见性）

远端档已被真机证明能全量建索引（41/41），本 Task 只处理**本地档**的两个实测缺陷：
换 `Xenova/bge-small-zh-v1.5` 时 30/41 条因长度报 `400 {"code":20015}` 而静默丢失；
以及 `queryPrefix` 空串把 provider 的 BGE 前缀回落权吃掉。

**Files:**
- Modify: `agent/src/memory/tokens.js`（新增 `memoryEmbedText` + 长度上限常量）
- Modify: `agent/src/memory/service.js`（三处 `embedDocuments(...map(memorySearchText))`：约 120、437、738 行）
- Modify: `agent/src/memory/embedding-config.js`（`toEmbeddingProviderConfig`，81-85 行）
- Modify: `agent/test/unit/memory-tokens.unit.test.js`、`agent/test/unit/memory-embedding-config.unit.test.js`

**Interfaces:**
- Consumes: `memorySearchText`（不变，仍供关键词计分与 df 全文使用）、`getMemoryEmbeddingConfig().mode`。
- Produces: `memoryEmbedText(m, cfg) → string`（本地档截断、远端档原样）、`LOCAL_EMBED_MAX_CHARS`。

- [ ] **Step 1: 测本地模型的长度失败边界（不碰真实缓存）**

一次性脚本：临时 HOME + 真实 `global-memory.json` **只读副本** + `mode: 'local'`，
按长度分档（200/400/512/600/800/1200/1900 字）逐条 `embedDocuments`，记录成功与失败长度。

**为什么必须临时 HOME**：本地档与远端档的 `modelKey` 不同，直接在真实 `memory-vectors.json` 上
切模式会整体作废并清空已建好的 41 条 bge-m3 向量（`upsertVectors` 的既有行为）。

```bash
rm -f agent/.tmp-local-limit.mjs   # 测完即删
```

把 Step 1 的输出表写进「执行结果」，`LOCAL_EMBED_MAX_CHARS` 取**实测最后一个安全档位再留余量**
（bge-small 系列上限 512 token，中文约 1 字/token，故预期落在 400~480 区间；以实测为准）。

- [ ] **Step 2: 写失败测试**

```js
it('本地档嵌入文本按上限截断，远端档不截断（长记忆不再整批静默失败）', () => {
  const long = { content: '填'.repeat(2000), title: '', tags: [] };
  assert.equal(memoryEmbedText(long, { mode: 'local' }).length, LOCAL_EMBED_MAX_CHARS);
  assert.ok(memoryEmbedText(long, { mode: 'openai-compat' }).length > LOCAL_EMBED_MAX_CHARS);
});
```

Run: `cd agent && node --test test/unit/memory-tokens.unit.test.js` → Expected: FAIL（函数不存在）

- [ ] **Step 3: 实现并接线**

```js
// agent/src/memory/tokens.js
/** 本地 BGE 小模型 512 token 上限：超长记忆会整批 400，截断比丢弃强（远端 bge-m3 无此限制） */
export const LOCAL_EMBED_MAX_CHARS = 400;   // ← Step 1 实测选定

/** 参与嵌入的文本：与 memorySearchText 同源，但按档位控制长度（向量化与关键词计分的口径因此可分头演进） */
export function memoryEmbedText(m, cfg = {}) {
  const text = memorySearchText(m);
  return cfg.mode === 'local' ? text.slice(0, LOCAL_EMBED_MAX_CHARS) : text;
}
```

三处调用点把 `batch.map(memorySearchText)` 换成 `batch.map(m => memoryEmbedText(m, cfg))`。
**注意**：截断会改变本地档向量内容，但 `modelKey` 不含长度信息 —— 本地档用户升级后需手动 `reindex` 一次；
本计划不为长度上限引入新的 modelKey 字段（远端档不受影响，本地档本来就要重建）。

- [ ] **Step 4: queryPrefix 回落权**

`toEmbeddingProviderConfig` 现在永远把 `queryPrefix: ''` 传给 provider，而 provider 用 `??` 判空 ——
空串不是 nullish，导致**本地 BGE 永远加不上查询前缀**（实测日志 `queryPrefix: off`）。

```js
export function toEmbeddingProviderConfig(cfg = {}) {
  const baseUrl = cfg.baseUrl || '';
  const endpoint = cfg.endpoint || '';
  const out = { ...cfg, endpoint: endpoint || baseUrl, baseUrl: baseUrl || endpoint };
  // 记忆配置面的空串表示「未设置」，而 provider 的 ?? 只认 null/undefined；
  // 不交出这个空串，本地 BGE 的查询前缀就永远加不上（前缀缺失对中文召回是实质性质量损失）。
  if (!String(out.queryPrefix || '').trim()) delete out.queryPrefix;
  return out;
}
```

测试钉两条：`local` + 空 `queryPrefix` → 交给工厂的对象**不含** `queryPrefix` 键；
`local` + 显式前缀 → 原样透传。远端档不受影响（provider 对非 local 本就置空）。

- [ ] **Step 5: reindex 失败原因可见**

今天 `backfillVectors` 返回 `{indexed, total, failedBatches}`（service.js:751）—— **计数有，原因没有**，
用户看到 `failedBatches: 8` 不知道为什么。响应补一条样本：

```js
    return {
      success: true,
      indexed: pairs.length,
      total: items.length,
      failedBatches: errors.length,
      ...(errors.length ? { lastError: errors[0] } : {})
    };
```

并同步 `console.warn('[Memory] reindex batch failed:', err.message)`（进程日志留全量原因，响应只留首条，
避免把端点报错串成堆）。测试钉「有失败批时响应含 lastError；全成功时不含」。

- [ ] **Step 6: 回归 + 提交**

```bash
cd agent && node --test "test/unit/memory-*.unit.test.js" && node test/memory-pushdown.smoke.mjs
npm run build:silent
git add agent/src/memory/tokens.js agent/src/memory/service.js agent/src/memory/embedding-config.js \
        agent/test/unit/memory-tokens.unit.test.js agent/test/unit/memory-embedding-config.unit.test.js
git commit -m "fix(memory): 本地档嵌入长度上限、查询前缀回落与重建失败原因可见"
```

---

## Task 6: 文档、全量回归、收尾

**Files:**
- Modify: `CHANGELOG.md`、`agent/README.md`、`agent/README.zh-CN.md`
- Modify: 本文件（追加「执行结果（已实施）」）

- [ ] **Step 1: 更正既有文档中被本轮推翻的说法**

计划三写入的「两路同尺」「关键词零命中但语义达阈值的条目由此能被召回」等表述在本轮被证伪 ——
达阈值的条目是**几乎全部**，不是「零命中的语义条目」。README 中英的「召回计分」段必须改成：

- 语义档采信条件：本次查询 top1 与 top2 的分离度达标，且条目落在 top1 − margin 内，且不超过 N 条；
- 明确写出**为什么没有绝对相似度阈值**（附前置实测 2 的重叠区间，一句一行）；
- 写出已知限制：目标在 cos 榜上不是第 1、且与第 1 名差小于分离度下限时，语义档不返回它（真实库 Q1 即此例）。

- [ ] **Step 2: CHANGELOG 新增「变更（记忆语义档改排名融合）」小节**

逐条列出：阈值→分离度、`round(cos×4)` 量化退场、`vectorHit` 旁路修复、本地档截断、queryPrefix 回落、
`reindex` 响应新增 `lastError`、`vectorMatched` 语义变更。

- [ ] **Step 3: 全量回归（数字必须实测，不许凭记忆）**

```bash
cd agent && node --test "test/unit/*.unit.test.js"        # 记录 passed/failed 真数
node test/memory-pushdown.smoke.mjs                        # 冒烟
npx vitest run                                             # 仓库单测（2 个既有 document is not defined 不变）
npm run build:silent                                        # BUILD_SUCCESS
npx eslint src/memory/fusion.js src/memory/service.js src/memory/tokens.js src/memory/embedding-config.js
```

分文件计数也要实测（照 `node --test <file>` 的 `ℹ tests` 取），计划三曾因我凭记忆写错
`embedding-config 16`（实为 14）被当场发现。

- [ ] **Step 4: 用户环境复查**

确认真机只留下应有的东西：`~/.ai-helper-agent/config.json` 的 `memoryEmbedding`、
`memory-vectors.json`、`config.json.bak-*` 备份、新 PID；
`.tmp-*` 脚本与结果文件为零；`git status --porcelain -uall` 为空。

- [ ] **Step 5: REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch**

按该 skill 呈现三个选项（合并 / 推 PR / 保持现状）。**本计划一律不推送**：origin 落后 17 个提交、
gitee/atomgit 落后更多，推送与 wiki 同步须用户明确发话。

---

## 已知限制与不做什么

- **不做记忆向量配置界面**。扩展端对 `memoryEmbedding` 零引用，界面是一块独立工作（计划五）；
  且界面复用知识库表单时必须先统一 `baseUrl`（记忆侧）与 `endpoint`（知识库侧）的字段命名。
- **不引入向量数据库**。41 条量级暴力余弦实测无性能压力，进程内 JSON 派生缓存维持不变。
- **不改 A 档任何行为**。计划三的单元制与 `full || units >= 2` 门槛原样保留，本计划只重写 fused 分支。
- **gap 规则在 7 条小库与 41 条大库上不可外推**（Task 2 Step 3），因此常量以真实库为准，
  合成集期望必要时放宽并写明。
- 分离度门是**分布形状**判据，记忆条目数变化会改变 top1−top2 的分布。库规模到几百条后本规则需重测，
  这一点写进 README 的限制段而不是假装永久成立。
