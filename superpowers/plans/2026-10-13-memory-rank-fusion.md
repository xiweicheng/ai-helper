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

> **⚠ 本节的上表有一条数据在 Task 2 被推翻，见下方「Task 2 执行结果」的更正。**
> 结论中「条目级绝对 cos 不可用」仍然成立；「查询级 top1 不可用」**不成立**。

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
| `agent/src/memory/fusion.js` | 纯函数：语义采信门（查询级落点地板 + 条目级相对落差）与 RRF 融合，无 IO | Create |
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

### Task 1 执行结果（2026-10-13，提交 `1cfa35a`）

改动前基线（`[eval-b]` 逐行）：

```
换说法命中 Vue 偏好   → webpage, long-zhihu, vue-pref, summary-1, proxy | vectorMatched=6
换说法命中国家观点   → country, proxy, summary-1                          | vectorMatched=3
换说法命中境外访问   → mem-bug, country, proxy, webpage, long-zhihu        | vectorMatched=6
换说法命中 store 缺陷 → mem-bug, webpage, long-zhihu, summary-1, vue-pref  | vectorMatched=7
无关查询（菜谱）     → long-zhihu, summary-1                              | vectorMatched=2
无关查询（电费）     → webpage, long-zhihu, summary-1, country, proxy      | vectorMatched=6
词面命中不因融合掉出前 2 → vue-pref, webpage, long-zhihu                    | vectorMatched=3
子串误伤在向量档同样不允许 → vue-pref, long-zhihu, summary-1, country, webpage | vectorMatched=6
```

**3 项失败**（正是预测的三类）：目标排第 3 超 `maxRank 2`（境外访问）；两条控制查询分别返回 2 条 / 5 条。
`vectorMatched` 在 7 条库上是 2~7——即阈值几乎对所有候选都成立，印证前置实测 §3 的旁路结论。
A 档评测仍全绿（10 条用例一条未改），黄金向量实际体积 128KB（7 文档 + 8 查询）。

**与计划的偏差（2 处，均已修）**：

1. `import.meta.dirname` 换成 `dirname(fileURLToPath(import.meta.url))`。计划写的那行需要 Node ≥ 20.11，
   而 `agent/package.json` 的 `engines` 声明是 `>=18.0.0`；仓内其余测试都用 `fileURLToPath`。
2. 计划里两个 `import` 行合并为一行（同一模块不得写两条 import）。

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

### Task 2 执行结果（2026-10-13）

**三个发现，前两个推翻了本节写好的东西。**

**1. 判据 1 的口径一开头就写错了，且它掩盖了一个误分类数据。**
按原口径（控制查询总返回条数之和 = 0）跑完整 80 组合网格（5 gap × 4 margin × 4 take，两套库），
**没有任何一个组合能同时让合成库与真实库都为 0**。原因不是方案不行，是我把两个通道的返回混计了：
真实库上「电费」查询在**词面通道本来就该命中**（`kw命中 = 1`），因为库里真有一条水电费记忆。
→ 口径改为**语义路净新增**（融合结果减去纯词面结果），同时把「电费」从控制组踢出，换成
「敦煌莫高窟一共有多少个洞窟」（词面 0 命中）。

**这一改同时抽空了前置实测 §2 的一块地基**：那条 top1 = 0.5285 的「重叠证据」本来就不是无关查询。
剔除四条**真正**无关的查询后，真实库 41 条上的分布是：

| 类别 | 查询 | top1 cos | top1−top2 |
|---|---|---|---|
| 无关 | 珠穆朗玛峰海拔 | 0.3340 | 0.0006 |
| 无关 | 法式洋葱汤 | 0.3436 | 0.0000 |
| 无关 | 敦煌莫高窟 | 0.3656 | 0.0397 |
| 无关 | 今天北京天气 | **0.4506** | 0.0361 |
| 相关 | 他习惯用哪种界面库 | **0.5467** | 0.0214 |
| 相关 | 为什么查不到海外资料 | 0.5724 | 0.0558 |
| 相关 | 这两个国家综合实力 | 0.5823 | 0.2083 |
| 相关 | 前端选型最中意哪个库 | 0.5899 | 0.0970 |
| 相关 | 写入假装成功 | 0.6353 | 0.1079 |

**无关 top1 区间 0.3340~0.4506，相关 top1 区间 0.5467~0.6353，间隙 0.096 —— 查询级 top1 完全可分。**
原立论只对**条目级**成立（≥ 0.3 放过 40/41、≥ 0.45 仍放过 20/41）。
区分开这两个层级是本次定数的全部实质：**绝对值用在查询级（本库对该查询有无落点），
相对落差用在条目级（哪几条入选）**。

**2. 分离度门不可跨库规模外推，必须去掉，不是调常数。**
实测 gap 值：无关查询 0.0000~0.0397（最高「敦煌」 0.0397、天气 0.0361），
相关查询下界是 Q1 的 0.0214。**0.0214 落在两条无关的 gap 之下** —— 在 gap 单轴上 Q1 和噪声
分不开：取 gap ≤ 0.02 救回 Q1、代价是两条无关各漏 1 条 top1；取 gap ≥ 0.04 那么控制全 0、
代价是 Q1 永久丢。合成库（7 条）同题查询的 gap 只有 0.0128，而其两条控制的 gap 是 0.0082/0.0055
—— 小库上反而可以兼得。**库越大，无关查询的 top1−top2 越可能偶然变大**，所以上面 Step 3
写的「以真实库为准放宽合成集期望」方向不对：不存在一个 gap 常数能同时适配两库。
→ gap 门从设计中**整块移除**。

**3. 定数：查询级绝对门 + 条目级相对落差 + 条数封顶。两个判据同时满足，Step 3 预期的结构性二选一消失。**

安全窗口（margin=0.03 take=2，在 abs 轴上逐点扫 0.44~0.53）：

- 下界 **0.4506**：天气控制查询 top1 刚好等于它 → abs ≤ 0.4506 开始漏 1 条；0.46 起降为 0
- 上界 **0.5163**：合成库 Q1（vue-pref）的 top1 → abs 超过它合成目标即丢（0.52 行合成目标名次和从 5 跳到 103）
- 窗口 (0.4506, 0.5163] 宽 0.0657，取中点 **0.48**（下余量 0.0294 / 上余量 0.0363）

margin 与 take 在同一 abs 上的对比（均为两库净新增 0）：

| margin | take | 合成目标名次和 | 真实目标名次和 | 真实均返 |
|---|---|---|---|---|
| 0.03 | 2 | 5 | 8 | 0.89 |
| 0.05 | 2 | 5 | 8 | 0.89 |
| 0.08 | 2 | 5 | 8 | 1.00 |
| 0.05 | 3 | 5 | 8 | 1.00 |

选定 **abs = 0.48、margin = 0.05、take = 2**，`RRF_K = 60`（不变）：

- margin 取 0.05 而非 0.03：两库指标完全相同，但 0.03 对真实 Q1（目标落后 top1 0.0214）只剩 0.0086 余量，太脆
- take 取 2 而非 3：名次不变、均返从 1.00 降到 0.89
- abs 取窗口中点而非端点：0.46 距下界只剩 0.0094，不可靠

**选定组合的逐条实测**（合成 5 个目标全部第 1 名；真实 5/5 全召回）：

```
合成 「他习惯用哪种界面库写网页」 融合第 1（语义 1，词面 -）
合成 「Vue 前端偏好」              融合第 1（语义 1，词面 1）
真实 「他习惯用哪种界面库写网页」  融合第 3（语义 2，词面 -）  ← top1 被噪声占，目标仍在窗口内
真实 「写入假装成功…」            融合第 2（语义 1，词面 -）
真实 「前端选型最中意哪个库」      融合第 1（语义 1，词面 1）
两库 4 条无关查询：语义路净新增 0 条
```

**遗留风险（写进代码注释与文档，不许谎）**：0.48 是在 `BAAI/bge-m3` + 41 条库 + 9 条查询上标定的。
它不可跨模型平移（尤其换成cos 刻度不同的模型），换模型必须重跑网格；9 条查询的样本量小，
下界靠 3 条无关查询撑住。`SEMANTIC_GAP_MIN` 相关设计全部作废，Task 3 按新三门实现。

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
  - `selectSemanticHits(pairs, { floor, margin, maxTake }) → Array<[id, cos]>`，`pairs` 为 `[id, cos][]`
  - `rrfFuse(lists, k) → Array<[id, number]>`
  - `SEMANTIC_QUERY_FLOOR` / `SEMANTIC_MARGIN` / `SEMANTIC_MAX_TAKE` / `RRF_K`

> 本 Task 的原设计以**分离度（gap）为主门**，已被 Task 2 实测否定（见上方执行结果发现 2）。
> 下文的门形式、常量与单测都是**修订后**的版本：查询级绝对地板 + 条目级相对落差，无 gap 门。

- [ ] **Step 1: 写 fusion 单测（先红）**

```js
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
    // 这一条钉住 Task 2 去掉 gap 门的决定。将来谁要「顺手把分离度加回去」，
    // 这条会红：真实库 Q1（gap 0.0214）与无关查询天气（gap 0.0361）在 gap 轴上分不开，
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
//
// 【为什么绝对 cos 阀值在这里又出现了，而计划开头说它不可用】
// 关键在于**两个层级不能混用**（真实记忆库 41 条实测，见计划前置实测 §2 与 Task 2 执行结果）：
//  • 条目级（问「这条记忆算不算命中」）：绝对值**不可用**。≥ 0.3 放过 40/41 条，≥ 0.45 仍放过 20/41。
//  • 查询级（问「本库对该查询有无落点」）：绝对值**可用且必要**。无关查询 top1 区间
//    0.3340~0.4506，相关查询 top1 区间 0.5467~0.6353，间隙 0.096。旧公式把尺子用在了条目级，
//    这是噪声泛滥的根；纯相对门槛则表达不了「本库无答案」。
// 分离度（top1-top2）曾是本模块的原设计主门，已实测否定：它不可跨库规模外推（库越大，
// 无关查询的 top1-top2 越可能偶然变大），且真实库目标查询 Q1 的 gap 0.0214 低于两条无关查询的
// 0.0361/0.0397——在 gap 轴上分不开。**不要把它加回来。**
//
// SEMANTIC_QUERY_FLOOR 的可用窗口是 (0.4506, 0.5163]，取中点 0.48（上下余量各约 0.03）。
// 它**不可跨模型平移**：在 BAAI/bge-m3 上标定；换 embedding 模型或改变记忆文本拼接方式后，
// 必须重跑计划的 Task 2 网格重定，不能直接沿用。

export const SEMANTIC_QUERY_FLOOR = 0.48;  // 查询级落点地板：top1 低于此值则整通道不采信
export const SEMANTIC_MARGIN = 0.05;       // 条目级相对落差：只采信距 top1 不超过此值的头部
export const SEMANTIC_MAX_TAKE = 2;        // 每次查询最多采信几条语义命中
export const RRF_K = 60;                   // 排名融合的平滑常数（业界默认值，本计划不重调）

/**
 * 语义通道采信哪些条目。三道门依次为：
 * ① 查询级地板：top1 < floor → 本库对该查询没有落点，整通道否决（宁可不给）。
 *    记忆召回结果直接注入提示词，「全都勉强相关」等于「没有相关」。
 * ② 条目级相对落差：只采信 cos ≥ top1 - margin 的头部，砍掉高分查询的长尾。
 * ③ 条数封顶 maxTake：防止一次语义命中填满 limit。
 * 注意：**不看 top1-top2 分离度**（理由见文件头）。
 * @param {Array<[string, number]>} pairs [id, cos]，顺序任意
 * @param {{floor:number, margin:number, maxTake:number}} gate
 * @returns {Array<[string, number]>} 按 cos 降序的采信结果（可为空）
 */
export function selectSemanticHits(pairs = [], gate = { floor: SEMANTIC_QUERY_FLOOR, margin: SEMANTIC_MARGIN, maxTake: SEMANTIC_MAX_TAKE }) {
  const ranked = [...pairs].filter(([, c]) => Number.isFinite(c)).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return [];
  const top = ranked[0][1];
  if (top < gate.floor) return [];
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

            // 语义路：全候选算 cos 后过采信门（查询级地板 + 条目级相对落差 + 条数封顶）
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

**三条必须是此语义、不得中途「顺手修好」的设计决定：**

1. **不看分离度（top1-top2）**。单测里「分离度不参与判定」那条就是为钉住这一点写的。
   它看着像「应该加」的合理性措施，但实测上不存在能同时适配 7 条库与 41 条库的 gap 常数，
   且会永久否决真实库 Q1。要改动必须先重跑 Task 2 网格。
2. **单条候选且达地板时采信**（旧设计是 `ranked.length < 2 → []` 整条否决）。理由：查询级地板
   已经承担了「本库有无落点」的判定，分离度不在判据里，所有一候选库也能正常语义生效。
   代价反转：旧设计下极小库只靠 A 档，现在单条库也能走语义 —— 这是有意为之，由单测钉住。
3. **`SEMANTIC_MAX_TAKE` 封顶优先于 `limit`**：一次语义命中最多 N 条，不因调用方给了大 limit 就放更多。
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
git commit -m "feat(memory): 语义档改排名融合，条目级绝对阈值换查询级地板"
```

### Task 3 执行结果（2026-10-13，提交 `47c31d7`）

| 套件 | 改动前 | 改动后 |
|---|---|---|
| `memory-fusion.unit.test.js` | 红（`ERR_MODULE_NOT_FOUND`） | **12/12 绿** |
| `memory-recall-eval.unit.test.js`（A 档护栏） | 绿 | **绿**（一条未改） |
| `memory-recall-eval-b.unit.test.js` | 红 3 项 | **绿** |
| `test/unit/*.unit.test.js` 全量 | — | **320/320 绿** |
| `test/integration/*.integration.test.js` | 60/62（两条既有失败） | 60/62（**同一两条**） |

B 档改动后的实际行为（与 Task 2 网格预测逐条一致）：

```
换说法命中 Vue 偏好   → vue-pref, long-zhihu | vectorMatched=2
换说法命中国家观点   → country                | vectorMatched=1
换说法命中境外访问   → proxy                  | vectorMatched=1
换说法命中 store 缺陷 → mem-bug                | vectorMatched=1
无关查询（菜谱/电费）  → (无命中)              | vectorMatched=0
词面命中不因融合掉出前 2 → vue-pref              | vectorMatched=1
子串误伤在向量档同样不允许 → vue-pref              | vectorMatched=0
```

**Step 5 的预期落空了，且落空得有意义**：计划假定 `memory-service.unit.test.js` 里会有断言依赖旧语义而需要改，
实际 **45/45 一条未改就全绿**。查下去发现原因：那些用例的手搓向量是 0.98 / 0 这种极端距离，新旧两套规则
在这个距离上结论相同——它们钉得住机制（懒补/超时/降级），钉不住本次修的缺陷。于是**新增两条服务层回归钉**：
用 `cos = 0.4`（≥ 旧阈值 0.3、< 新地板 0.48）的向量，即原缺陷泛滥的那一类。为证明它们不是跟着实现写的装饰，
用 `git stash` 临时退回旧实现跑了一遍：**两条都红**，而原有那条向量用例仍绿（证实它确实不敏感）。
恢复后 47/47 绿。service 层从 45 例变 47 例。

**两条既有集成失败（与本改动无关，已验证）**：`api.integration.test.js` 的「~ 展开到用户主目录」与
「路径穿越 .. 被限制在沙箱内」。在 `git stash` 退回旧实现的状态下跑同一文件仍是这 2 条红，故为既有失败。

**其他偏差**：`tier.js` 连带删了 `DEFAULT_SEARCH_CONFIG` 的 import（只为该常量而存在）；`memory-tier.unit.test.js`
除了计划写明的删两条断言，还删了同一目的的 `DEFAULT_SEARCH_CONFIG` import，并留了注释说明阈值概念已迁至 `fusion.js`。

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

### Task 4 执行结果（2026-10-13，真机 PID 28292）

真机进程需重启才能加载新代码（旧进程 93944 跑的是改动前的 `service.js`）。

| 查询 | A 档 | 旧 B 档（前置实测） | **新 B 档** | 返回条数 |
|---|---|---|---|---|
| 他习惯用哪种界面库写网页 | 未召回 | 掉出前 12 | **第 3**（语义第 2） | 3 |
| 这两个国家的综合实力谁更强 | 未召回（0 条） | 3 | **第 1** | 1 |
| 为什么我查不到海外的资料 | 未召回（0 条） | 4 | **第 1** | 1 |
| 写入假装成功其实没保存的老毛病 | 未召回 | 2 | **第 2**（语义第 1） | 2 |
| 前端选型时他最中意哪个库 | 1 | 1 | **第 1** | 1 |
| 法式洋葱汤 / 敦煌莫高窟 / 北京天气 / 珠峰海拔（控制） | — | 填满 limit | **全部 0 条** | 0 |

逐条实测输出：`tier=remote`、`vectorMatched` 分别为 2/1/1/1/1，控制组全为 0；相关查询**无一填满 limit**（旧公式 5 条全部填满）。

**四条通过标准：3 过 1 没过。**

- ✅ 标准 1（主判据）：4 条控制查询返回条数之和 = **0**。
- ✅ 标准 3：填满 limit 的查询数 = **0**，`vectorMatched` 上限就是 `SEMANTIC_MAX_TAKE = 2`。
- ✅ 标准 4：A 档开启前后两次均为 `1 / 0 / 0 / 1 / 1`，与前置实测逐字一致——融合**没有泄漏进 A 档路径**。
- ❌ **标准 2 未达成**：目标名次和 = **8**，判据写的是 ≤ 6。不许把这条解释成过。

**标准 2 为什么没过（定位到条目，不是笼统的「有优化空间」）**：那个 6 是**纯 cos 单通道的理想值**
（前置实测表里 2+1+1+1+1），而设计是双通道融合，词面路每一跳都在投票。多出的 2 名全部来自词面路：

```
Q1 目标第 3：前面是 mu5affte（「product-form.html …**界面**…」——「界面」碎块词面命中）
              和 mu9kqlkb（简历「Java 后端 + **Vue** 前端双栈」，它确实是 cos 全场 top1）
Q4 目标第 2：前面是 mv607bck（视频降噪「…安装**成功**…」）
```

关键事实：**A 档单独跑 Q1 时，返回的就是 mu5affte 这一条**。所以新 B 档相对 A 档严格变好（多出语义目标），
相对旧 B 档也是大幅变好（名次和从「Q1 不可达 + 其余 3/4/2/1」降到全部可达且 3/1/1/2/1）。

**判据本身的问题（写下来供后续计划引用）**：拿双通道融合的结果去比单通道理想值，是个错定的口径。
真正该问的是「词面碎块该不该压过语义 top1」——那是个产品取向问题，属计划五（若需要，手段是调 `RRF_K`
或给词面路只采信整段命中，而不是回到绝对阈值）。本计划不动它，因为调 `RRF_K` 会同时改变 A 档与 B 档的相对权重，
需重跑 Task 2 网格与 Task 4 全量复测。

**电费对照（已从控制组踢出、改作词面合法命中对照）**：`vm=2` 返回 2 条（token8341 充值规则与商业链路两条），
语义上确实相近（花费/充值），不是噪声——印证 Task 2 将它重新分类的判断。

**收尾**：`enabled` 已由脚本本身收回 `false`；向量缓存 41 条保留复用；`.tmp-live-verify.mjs` 已删。

---

## Task 5: 本地档真正可用（长文本、queryPrefix、失败可见性）

> **⚠ 本 Task 的立论在 Step 1 实测被推翻**：本地档不存在「超长报 400 静默丢失」（41/41 与 1900 字全部成功），
> Step 2/3 的截断**不实施**。下文 Step 1–3 保留原文作为错定的记录，**结论见「Task 5 执行结果」**；
> Step 4（queryPrefix）与 Step 5（lastError）经代码与实测确认成立，已实现。
>
> **⚠ 二次更正（同日，后续取证）**：「全部成功」属实，但**成功不等于全文进向量**——
> pipeline 实际在 512 token 处**静默截断**，真实库 13/41 条尾部内容从未被索引。
> 本节 §2/§3 原先给出的「有效窗口约 1200 字」与两个 provider 缺陷**均为写错**，已在原处改写。
> 取消截断的决定仍然正确，但当时给的理由是错的。

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

### Task 5 执行结果（2026-10-13，提交 `56c6c1a`）

#### 1. Step 1 实测：本地档根本不会因长度失败 —— 计划的立论错了

一次性脚本（`agent/.tmp-local-*.mjs` × 4，已全部删除）。模型缓存在 `/tmp` 副本上跑
（`AI_HELPER_RAG_ROOT` 重定向），**真实 `~/.ai-helper-agent/` 未被写入**（目录 mtime 仍为 9/27），
且只直调 `provider.embedDocuments`，不经过 memory service → 不碰任何向量缓存文件。

| 测项 | 实测结果 |
|---|---|
| 真实库 41 条逐条嵌入（最长 1901 字） | **成功 41 / 失败 0**，均返回 512 维 |
| 合成阶梯 200/400/480/500/510/512/520/600/800/1200/1900 字 | **全部成功**，无一失败 |
| 批内混长（1 短 + 1 条 1200 字） | 整批成功，两条各 512 维 |

**错误来源已查到**：本计划前言写的「换 `Xenova/bge-small-zh-v1.5` 时 30/41 报 `400 {"code":20015}`」
是引用计划三 §3 的结论时引用错了主体——那条证据原文（`2026-10-13-memory-hybrid-recall.md:1169`）是
**远端** `BAAI/bge-large-zh-v1.5` 只有 11/41 建索引（HTTP 400 是厂商端点报的）。
本地 transformers 路径不发 HTTP，不可能出现 400。

#### 2. 400 字截断确实无益（但下文给出过「窗口 1200 字」这个错解释，已修正）

最长条目全文向量 vs 不同截断长度向量的 cos（实测数据本身无误）：

```
前 300 字 0.8770   前 400 字 0.9105   前 480 字 0.9307   前 512 字 0.9352
前 600 字 0.9498   前 700 字 0.9630   前 900 字 0.9862   前 1200 字 1.0000（及以后均 1.0000）
```

**当时写的「即模型的有效信息窗口约到 1200 字」是错的。** 这组数的真正解释：pipeline 内部带着
`truncation: true`，全文与前 1200/1900 字**都被截到同一个前 512 token**，所以上下文完全一致 → cos 恒等 1.0000；
而前 900/700/480 字分别只剩 902/702/482 token，与 512 的差额递减 → cos 递升。
换句话说：这组数据从一开头就是「存在 512 token 截断」的证据，当时读成了「窗口比 512 宽得多」。

取消截断的结论仍成立，但理由要换成：**库已在 512 token 处截，再按 400 字截只是把同一刀往前推，
换不回任何尾部信息，还要本地档用户重建一次索引**。耗时也不是理由（单条 100/300/512/800/1200/1900 字
= 16/43/73/75/76/75ms，各取 3 次中位数）——512 字以后耗时不再增长。当时此处还多写了
一句「超出部分几乎不花钱」，那句也当作废：不增长是因为超出部分根本没进模型，而不是「进了但不贵」。

#### 3. 本节原先的两个「provider 缺陷」均为错定（原因值得一留）

原写：① `local.js` 未开 truncation → 1900 字被喂 1902 token，position id 越界；
② `pooling:'mean'` 未使用 attention mask → 向量随分批组合漂移。**两条都不成立：**

1. **截断开着**。`@huggingface/transformers@4.3.0` 的 `src/pipelines/feature-extraction.js:97` 就是
   `this.tokenizer(texts, { padding: true, truncation: true })`；经真实 pipeline 的 tokenizer 实测
   `model_max_length = 512`、1852 字条目编码后 `input_ids dims = [1, 512]`。
2. **mask 用对了**。同文件 116 行 `mean_pooling(result, model_inputs.attention_mask)`，
   已安装入口 `dist/transformers.node.mjs:14888` 的实现逐位置乘 mask、按 mask 求和计数再除。

**错的根源是取证走了另一条路**：当时用独立的 `tokenizer.encode(text)` 数 token，
那条默认不带 truncation——而真正在用的是 pipeline 内部的 `tokenizer(texts, {truncation:true})`。
拿旁路的观测给主路定罪，两条错定由此产生（与前面「把远端证据安到本地头上」同一类错）。

真正存在的是另外两件事：

1. **（真缺陷，已修）**本地档在 512 token 处**静默截断**：超出部分根本不进向量，原先零信号。
   走真实接缝（`toEmbeddingProviderConfig` → `EmbeddingProvider.tokenCounter` → `memorySearchText`）实测：
   窗口 512，真实库 41 条中 **13 条超窗**（按嵌入文本口径，比按正文字数的 12 条多一条），
   最大一条 1111 token 只吃进 512（**覆盖率 46%，599 token 直接丢弃**）；全库 token 中位数 385。
   修正方式见后续工作：`backfillVectors` 响应新增 `overWindow: { count, window, ids }` + 进程日志点名，
   本轮**只赢在可见**（不改向量、不动索引成败）。分段索引与「保头尾」压缩均未采纳，继续后置。
2. **（非缺陷，已知噪声）**向量确实随分批组合轻微漂移，但不是 mask 的问题：实测逐条 vs 同批
   cos 0.9940–0.9974（元素级最大差 ~1e-2），且**与同批有没有长文本无关**（0.9969 vs 0.9974），
   短条目最明显（7 字一条 0.9940）。该形态是 `dtype: 'q8'` 量化核的数值噪声，只能靠换精度缓解。
3. 计划三 §3 遗留的「recall 按需补齐每次都对必然失败的长文本重打请求」仍成立，但它是**远端**小上下文模型的问题，
   与本地档截断无关，继续后置。

#### 4. 已实现的两项（先红后绿 + 反向验证）

- **queryPrefix 回落权**（`toEmbeddingProviderConfig`）：缺陷实测确认 —— 交出
  `{ queryPrefix: "" }` → `new EmbeddingProvider(...).queryPrefix === ""` → provider 日志 `queryPrefix: off`；
  显式前缀则正常透传。修后：空白（含纯空白）时删除该键，把回落权还给 provider。
- **reindex 失败原因可见**（`backfillVectors`）：代码确认 `errors.push(err.message)` 有存但不入响应也不打日志，
  只有**全部**批失败时才从 747 行露出首条。修后：`lastError`（仅首条）+ `console.warn`（全量）。
  冒烟路径已实证该日志生效：`[Memory] reindex batch failed: fetch failed`。
- **新增 5 条单测**：其中 1 条是走真实 `EmbeddingProvider` 的**接缝钉**（沿计划三教训：
  注入假工厂的 service 单测看不见配置字段错位）；另有 2 条是守卫（显式前缀透传 / 全成功不造 lastError）。
- **反向验证**：`git stash push -- src/memory/embedding-config.js src/memory/service.js` 退回旧实现
  → **66 例中 3 红**（正好是 3 条新钉），恢复后 66/66。
- **回归**：`memory-*.unit.test.js` **150/150**；agent 全量 unit **325/325**；冒烟 **21/21**；`BUILD_SUCCESS`。

#### 5. 与计划的偏差（3 处）

1. **Step 2/3（截断）整块不实施**，理由见上；commit 文案相应改为
   `fix(memory): 查询前缀回落权交还 provider，向量重建失败原因进响应与日志`；`tokens.js` 本轮未改。
2. Step 1 用「直调 provider + `/tmp` 模型缓存副本」代替「临时 HOME + 真实记忆只读副本」：
   只读不写，不进入 `upsertVectors` 路径，比计划做法更少一个可变因子（也无需担心作废真向量缓存）。
3. Step 6 命令的路径写错了：冒烟实际在 `test/smoke/memory-pushdown.smoke.mjs`（不是 `test/` 根）。
   另：`npx eslint src/memory/...` 在 agent 目录下是**空跑**——根 `eslint.config.js` 的 `ignores` 包含 `agent/**`，
   且 agent 无自己的 eslint 配置（Task 6 Step 3 需相应更正，不得把「4 条 File ignored 警告」当作 lint 通过）。


---

## Task 6: 文档、全量回归、收尾

**Files:**
- Modify: `CHANGELOG.md`、`agent/README.md`、`agent/README.zh-CN.md`
- Modify: 本文件（追加「执行结果（已实施）」）

- [ ] **Step 1: 更正既有文档中被本轮推翻的说法**

计划三写入的「两路同尺」「关键词零命中但语义达阈值的条目由此能被召回」等表述在本轮被证伪 ——
达阈值的条目是**几乎全部**，不是「零命中的语义条目」。README 中英的「语义召回通道」段必须改成
（**本条原定形的「分离度达标」已由 Task 2 实测作废，按下述三门写**）：

- 语义档采信条件：本次查询的 **top1 达查询级落点地板**，且条目落在 top1 − margin 内，且不超过 N 条；
- 明确写出**为什么没有条目级的绝对相似度阈值**（附前置实测 2 的重叠区间，并说明绝对 cos 只在查询级 top1 上可用）；
- 写出已知限制：地板不可跨模型平移（换 embedding 模型必须重标定）；分离度门已被实测否定且不得加回；
  目标不在 cos 头部（落在 top1 − margin 之外）时语义路不返回它。

- [ ] **Step 2: CHANGELOG 新增「变更（记忆语义档改排名融合）」小节**

逐条列出：分数相加→名次融合、`round(cos×4)` 量化退场、`vectorHit` 旁路修复、
queryPrefix 回落、`reindex` 响应新增 `lastError`、`vectorMatched` 语义变更；
并写明**本地档截断经实测取消**与两个转计划五的 provider 缺陷。
（原文本行包含「阈值→分离度」与「本地档截断」，均已被 Task 2 / Task 5 实测推翻。）
（**二次更正**：此处写的「两个转计划五的 provider 缺陷」本身也是错定（见 Task 5 执行结果 §3），
当时写进 CHANGELOG 的同名条目已随之改写；真正的缺陷是本地档 512 token 静默截断。）

- [ ] **Step 3: 全量回归（数字必须实测，不许凭记忆）**

```bash
cd agent && node --test "test/unit/*.unit.test.js"        # 记录 passed/failed 真数
cd agent && node --test "test/unit/memory-*.unit.test.js"  # 记忆相关分文件计数
cd agent && node test/smoke/memory-pushdown.smoke.mjs       # 冒烟（实际路径在 test/smoke/ 下）
cd agent && node --test "test/integration/*.test.js"        # 集成（注意有 2 条既有失败）
npx vitest run                                             # 仓库单测（2 个既有 document is not defined 不变）
npm run build:silent                                        # BUILD_SUCCESS
```

> 原文的 `node test/memory-pushdown.smoke.mjs` 路径不存在（实际在 `test/smoke/`）；
> 原文的 `npx eslint src/memory/*.js` 是**空跑**：根 `eslint.config.js` 的 `ignores` 含 `agent/**`，
> 且 agent 无自己的 eslint 配置——不得把「File ignored 警告」当作 lint 通过。

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

### Task 6 执行结果（2026-10-13）

#### Step 1–2：文档更正与 CHANGELOG

- `agent/README.zh-CN.md` / `agent/README.md`（中英对称）：删退场的「两路同尺 / One scale for both channels」
  （`+3 + round(cos × 4)` 与绝对余弦阈值），换成四条：**双通道只融合名次**、**语义采信门是两道**（查询级地板 0.48 +
  条目级落差 0.05 + 封顶 2 条）、**为什么没有条目级绝对阈值**（附实测重叠区间）、**已知限制**
  （窗口 `(0.4506, 0.5163]`、不可跨模型平移、几百条后需重测、分离度门已被否定且「不要加回来」、
  以及目标落在头部落差之外的具体后果）。`vectorMatched` 描述改为「被语义路采信、上限 2 条」；
  运维条目补 `failedBatches` + `lastError`。
- `CHANGELOG.md`：新增两节「变更（记忆语义档改排名融合）」与「工程质量与测试（同上）」，
  并在首行显式声明**作废同日「两路计分同尺」条目的实现描述**（历史条目不遭改）。
- 全盘 grep 校对：`MEMORY_VECTOR_THRESHOLD` / `round(cos` / `两路同尺` 除本计划与历史计划文档外仅剩
  CHANGELOG 新节的「已退场」描述，**代码里零残留**；扩展端 `docs/` 与 `.wiki-check/` 对
  `memoryEmbedding` / 「语义召回」**零引用**，所以无陈旧说法需改（wiki 同步仍未做，等发话）。

#### Step 3：全量回归（逐文件实测）

| 项 | 结果 |
|---|---|
| `node --test "test/unit/memory-*.unit.test.js"` | **150/150** |
| ├ 分文件 | fusion 12 / tokens 12 / vectors 12 / tier 8 / embedding-config 17 / service 49 / routes 12 / injection 18 / keyword-match 8 / eval-A 1 / eval-B 1 |
| `node --test "test/unit/*.unit.test.js"` | **325 passed / 0 failed**（62 suites） |
| `node test/smoke/memory-pushdown.smoke.mjs` | **21/21**（含新日志 `[Memory] reindex batch failed: fetch failed` 实证） |
| `node --test "test/integration/*.test.js"` | **84/86**，2 条失败为既有（`~ 展开到用户主目录`、`路径穿越 .. 被限制在沙箱内`） |
| `npx vitest run` | **81 文件 / 1271 用例全通**，2 个既有 `document is not defined` 未处理 rejection 不变 |
| `npm run build:silent` | **BUILD_SUCCESS** |
| eslint | **不适用**：`eslint.config.js` 的 `ignores` 含 `agent/**` 且 agent 无自有配置（见上方命令块的更正） |

#### Step 4：用户环境复查（均只读）

```
config.json memoryEmbedding = { enabled: false, mode: openai-compat, model: BAAI/bge-m3, queryPrefix: "" }
memory-vectors.json       = 41 条，modelKey openai-compat|BAAI/bge-m3|1024，891705 B
备份                      = config.json.bak-20261013-180007（仍在）
.tmp-* 残留               = 0；工作树提交后 git status --porcelain -uall 为空
agent 进程              = PID 28292，127.0.0.1:18910，版本 2.2.0，
                         启于 10/13 18:40（Task 4 重启），代码为 Task 3 版
```

**如实说明一处残留差异**：Task 5 的两处代码改动（queryPrefix 回落、reindex 日志）**尚未被运行中的进程加载**。
不擅自重启的理由：当前配置是 `enabled: false` + `mode: openai-compat`，两处改动在此状态下无行为差异
（前者只在 `mode: local` 生效，后者只在 `reindex` 失败时多一段日志）。用户下次自行重启或跑 `release:agent` 即自然含入。

#### Step 5：收尾

按 finishing-a-development-branch 执行：集成决策交由用户，本计划全程未推送
（`origin/main..HEAD` 现 24 个提交，gitee/atomgit 落后更多），也未动过任何远端与 wiki。

---

## 已知限制与不做什么

- **不做记忆向量配置界面**。扩展端对 `memoryEmbedding` 零引用，界面是一块独立工作（计划五）；
  且界面复用知识库表单时必须先统一 `baseUrl`（记忆侧）与 `endpoint`（知识库侧）的字段命名。
- **不引入向量数据库**。41 条量级暴力余弦实测无性能压力，进程内 JSON 派生缓存维持不变。
- **不改 A 档任何行为**。计划三的单元制与 `full || units >= 2` 门槛原样保留，本计划只重写 fused 分支。
- **采信门在 7 条小库与 41 条大库上不可外推**（Task 2 Step 3），因此常量以真实库为准，
  合成集期望必要时放宽并写明。
- 查询级地板是**分布形状**判据，记忆条目数与 embedding 模型都会改变 top1 的分布。
  库规模到几百条后本规则需重测，换模型后必须重跑 Task 2 网格 —— 这两点已写进 README 的限制段而不是假装永久成立。
- ~~分离度门是分布形状判据~~ → **已被实测否定并从实现中移除**（见 Task 2 执行结果）。
