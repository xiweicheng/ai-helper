# 记忆关键词通道对齐知识库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让长期记忆的关键词召回复用知识库已验证的片段化匹配（英文词边界 + 中文最长命中片段 + df 高频剔除），消除碎 bigram 噪声。

**Architecture:** 先把 `rag/searcher.js` 里的纯匹配逻辑抽成共享模块 `rag/keyword-match.js`（行为逐字不变，由既有 18 条 searcher 关键词单测护栏），再由记忆侧复用；记忆计分从「N 个关键词 × 字段权重累加」改为「命中片段单元数 × 字段权重」，单元数按最长命中长度分层并封顶。

**Tech Stack:** Node 22+ ESM、`node --test`、无新增依赖、无网络。

**Spec:** `docs/superpowers/plans/2026-10-13-memory-hybrid-recall.md` 的「真机验证更正（2026-10-13，实施后）」第 5 节 —— 该节记录本计划的立项依据与实测数据。

## Global Constraints

- **零新依赖、零网络**：本计划只改词面匹配，不引入分词库、不调用 embedding（既有决策：本地片段化匹配优先，LLM 抽取暂缓）。
- **本计划明确破除「A 档零漂移」硬约束**（2026-10-13 用户授权）：记忆的关键词计分行为**必须改变**，这是本计划的目的而非副作用。因此 `memory-service.unit.test.js` 中锁定旧计分的用例允许修改，但**每条修改都必须在提交信息里逐条说明理由**，不允许静默改断言凑绿。
- **`rag/searcher.js` 的行为不得改变**：Step 1 是纯抽取，`searcher-keyword.unit.test.js` 18 条用例一条不许改、一条不许红。
- **仓库内不得出现真实记忆数据**：评测集用合成条目（形态对齐真实分布），真实数据只允许本地临时跑（临时 HOME + 只读副本，脚本不进仓库）。
- 每步改完跑 `npm run build:silent`（既有规范）；只在 main 上；未经用户明确指示不 push。

## 已知缺陷（立项依据，实测于真实 41 条记忆）

| query（与原文词面零重叠） | Tier A 实际返回 | 期望 |
|---|---|---|
| 他习惯用哪种界面库写网页 | 8 条无关，目标未在场 | 少返或明确无匹配 |
| 这两个国家的综合实力谁更强 | 6 条无关，目标未在场 | 同上 |
| 为什么我查不到海外的资料 | 3 条无关，目标未在场 | 同上 |

根因：`agent/src/memory/tokens.js` 把 query 炸成最多 30 个 2 字块，`service.js` 的 `keywordScore` 对每个块 `content.includes(kw)` 一律 +3。长记忆条目（中位 626 字、最长 1901 字）几乎必然命中若干随机 2 字块，于是**任何 query 都能捞回一堆无关条目**；且命中 4 个随机 2 字块（+12）高于命中一个 4 字整词（+3），排序方向是反的。

---

### Task 1: 抽出共享关键词匹配模块（纯搬迁，锁行为）

**Files:**
- Create: `agent/src/rag/keyword-match.js`
- Modify: `agent/src/rag/searcher.js`（改为 import 共享模块，删除本地实现）
- Test: `agent/test/unit/searcher-keyword.unit.test.js`（既有 18 条，一条不改）
- Test: `agent/test/unit/memory-keyword-match.unit.test.js`（新增，直接钉住共享模块语义）

**Interfaces:**
- Consumes: 无
- Produces:
  - `export function extractQueryTerms(query): { latin: string[], cjk: string[] }`
  - `export function matchLatin(text, latin): string[]` —— 词边界命中的英文/数字单元
  - `export function matchCjk(text, seg): { keys: string[], units: number } | null` —— 最长命中片段
  - `export const KEYWORD_MIN_LEN = 2` / `KEYWORD_MAX_FRAGMENT_LEN = 4` / `KEYWORD_MAX_HITS = 3`

- [ ] **Step 1: 先读 searcher.js 现状，确认待搬代码边界**

Run: `grep -n "extractKeywords\|extractQueryTerms\|latin.length\|keys2\|bestLen\|dfLimit" agent/src/rag/searcher.js`
Expected: 与计划一致 —— `extractKeywords`（L31）、`extractQueryTerms`（L50）、`_boostByKeywords` 内的匹配循环（L152-L199）。**只搬「匹配」，不搬「df 统计与抬分」**（那部分绑 `this.store` 与 `[0,1]` 刻度，属检索器私有）。

- [ ] **Step 2: 写共享模块的失败测试**

```js
// agent/test/unit/memory-keyword-match.unit.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractQueryTerms, matchLatin, matchCjk, KEYWORD_MAX_HITS } from '../../src/rag/keyword-match.js';

test('extractQueryTerms 分离拉丁段与中文段并去重', () => {
  const { latin, cjk } = extractQueryTerms('RAG 检索 的 关键词 rag');
  assert.deepEqual(latin, ['rag']);                 // 小写去重，长度 <2 丢弃
  assert.deepEqual(cjk, ['检索', '关键词']);
});

test('matchLatin 按词边界，子串不算命中', () => {
  assert.deepEqual(matchLatin('use storage layer', ['rag']), []);   // rag ∉ storage
  assert.deepEqual(matchLatin('a rag framework', ['rag']), ['rag']);
  assert.deepEqual(matchLatin('中文rag混排', ['rag']), ['rag']);      // CJK 相邻视为边界
});

test('matchCjk 取最长命中片段并按长度给单元数', () => {
  const hit = matchCjk('本文介绍混合检索方案', '混合检索');
  assert.equal(hit.units, 3);                       // L=4 → min(4-1, 3) 顶格
  assert.deepEqual(hit.keys, ['混合检索']);
  const weak = matchCjk('这里的检索很快', '混合检索');
  assert.equal(weak.units, 1);                      // 只命中 2 字片段
  assert.equal(weak.keys.length > 0, true);
  assert.equal(matchCjk('完全无关的内容', '混合检索'), null);
});

test('matchCjk 单元数封顶 KEYWORD_MAX_HITS', () => {
  assert.equal(matchCjk('上下文压缩效果演示', '上下文压缩效果').units, KEYWORD_MAX_HITS);
});
```

- [ ] **Step 3: 跑到红**

Run: `cd agent && node --test test/unit/memory-keyword-match.unit.test.js`
Expected: FAIL —— `Cannot find module '../../src/rag/keyword-match.js'`

- [ ] **Step 4: 实现共享模块（逐字平移 searcher 的语义）**

```js
// agent/src/rag/keyword-match.js - 关键词片段化匹配的纯函数（知识库与长期记忆共用）
// 拆成独立模块的原因：两侧原本各写一套匹配，知识库 2026-09 已修的碎块噪声/子串误伤/长句失配
// 三个坑，记忆侧一直原封未动。共用一份实现，避免再次漂移。
// 语义与 searcher.js 的历史实现逐字一致，改动此处会同时影响知识库与记忆两条通道。

export const KEYWORD_MIN_LEN = 2;          // 命中单元最小长度（单字符匹配噪声过大）
export const KEYWORD_MAX_FRAGMENT_LEN = 4; // 中文最长匹配窗口（≥4 字已顶格 3 单元）
export const KEYWORD_MAX_HITS = 3;         // 计分单元总数上限

/** 切段：按非 [字母数字汉字] 分隔，长度 ≥2，小写去重 */
export function extractKeywords(query) { /* 平移 searcher.js L31-42，逐字不改 */ }

/** 段内再拆拉丁 run 与中文 run */
export function extractQueryTerms(query) { /* 平移 searcher.js L50-70，逐字不改 */ }

/**
 * 英文/数字：词边界匹配。文本侧非字母数字一律替换为空格后做 `' term '` 判定，
 * 使 CJK 相邻也构成边界（「中文rag混排」应命中）。
 */
export function matchLatin(text, latin) {
  if (!latin || latin.length === 0) return [];
  const bounded = ' ' + String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
  return latin.filter(term => bounded.includes(' ' + term + ' '));
}

/**
 * 中文：该 chunk 内此段的最长连续命中。2 字预检（更长片段必蕴含其 2 字子串命中）
 * + 从最长窗口向下降级找首个有命中的长度。
 * @returns {{keys: string[], units: number} | null} units = min(bestLen-1, KEYWORD_MAX_HITS)
 */
export function matchCjk(text, seg) { /* 平移 searcher.js L168-196 的单段逻辑 */ }
```

实现要求：`matchCjk` 必须与 searcher 原逻辑等价 —— 预检集合 `keys2` 非空否则返回 `null`；`maxLen = Math.min(seg.length, KEYWORD_MAX_FRAGMENT_LEN)`；从 `maxLen` 递减到 3 找第一个非空集合即 `break`；`units = Math.min(bestLen - 1, KEYWORD_MAX_HITS)`。**不要把「整段 fallback」加回来**（记忆旧实现有该行为，本计划要消除的正是它）。

- [ ] **Step 5: searcher.js 改为复用，跑既有 18 条确认未改行为**

```js
import { extractKeywords, extractQueryTerms, matchLatin, matchCjk,
  KEYWORD_MIN_LEN, KEYWORD_MAX_FRAGMENT_LEN, KEYWORD_MAX_HITS } from './keyword-match.js';
```

`_boostByKeywords` 的循环体改为调用 `matchLatin` / `matchCjk`，但**df 统计、抬分公式、`resultMap` 合并、排序一律留在 searcher.js**（那些是 `[0,1]` 刻度的检索器私有逻辑）。`searcher.js` 若原先 `export function extractKeywords` 被其他模块引用，保留同名再导出以免破坏 import 方：

Run: `cd agent && grep -rn "from.*searcher.js" src test | grep -i "extractKeywords\|extractQueryTerms"`
Expected: 无命中则不保留再导出；有命中则加 `export { extractKeywords, extractQueryTerms };` 再导出行。

Run: `cd agent && node --test test/unit/searcher-keyword.unit.test.js && node --test test/unit/*.unit.test.js`
Expected: searcher 关键词 18/18 未改一条且全 PASS；全量 290 passed / fail 0。

- [ ] **Step 6: Commit**

```bash
git add agent/src/rag/keyword-match.js agent/src/rag/searcher.js agent/test/unit/memory-keyword-match.unit.test.js
git commit -m "refactor(rag): 关键词片段化匹配抽为共享模块，记忆侧可复用同一实现"
```

---

### Task 2: 记忆评测集（先量化，再改）

**Files:**
- Create: `agent/test/eval/memory-recall-fixtures.js`（合成条目 + query→期望）
- Create: `agent/test/unit/memory-recall-eval.unit.test.js`（跑评测集并断言指标）

**Interfaces:**
- Consumes: `createMemoryService`（Task 3 后走新计分）
- Produces: `export const FIXTURES`、`export const CASES`、`export function evaluate(svc, cases)` → `{ top1Hit, precisionAt5, noiseCount, details }`

- [ ] **Step 1: 写合成记忆条目（形态对齐真实分布，绝不用真实数据）**

必须覆盖的真实形态：超短偏好（≈7~32 字）、中等事实（≈200~600 字）、超长多段技术记录（≈1000~1900 字，含中文标点与英文专名）。**关键设计要求：让噪声条目真实含有一两个与 query 共享的 2 字块**（这正是真实库里发生的事），否则测不出碎 bigram 问题。

```js
// agent/test/eval/memory-recall-fixtures.js
// 合成数据，形态对齐真实记忆库（短偏好 / 中事实 / 超长多段记录）。
// 故意让不相关条目与查询共享少量 2 字块——真实碎 bigram 噪声正是这么产生的。
export const FIXTURES = [
  { id: 'vue-pref', type: 'fact', tags: ['Vue', '前端开发', '技术偏好'],
    content: '用户非常喜欢使用Vue进行前端开发，Vue是TA的首选前端框架。' },
  { id: 'country', type: 'fact', tags: ['中国', '观点'],
    content: '中国比美国强大' },
  { id: 'proxy', type: 'fact', tags: ['中国', '网络限制', '网络访问'],
    content: '用户位于中国，无法访问被屏蔽的外国网站（如Google搜索等境外网站），需要提供可替代的国内可访问方案或工具建议。' },
  { id: 'webpage', type: 'fact', tags: ['表单自动化', '浏览器自动化'],
    content: '多步骤表单自动填写演示页：http://localhost:8901/product-form.html（"商品录入"，4 步向导）。页面结构如下……' /* 补足到 ~600 字以还原真实长度分布 */ },
  { id: 'mem-bug', type: 'fact', tags: ['记忆系统', 'Bug', 'store持久化'],
    content: '记忆系统 store 操作曾存在持久化问题：调用后返回成功但实际未写入存储，导致检索时找不到。' },
  { id: 'long-zhihu', type: 'fact', tags: ['知乎', 'Draft.js', '浏览器自动化'],
    content: '知乎「写文章」编辑器自动化发布经验……' /* 补足到 ~1350 字 */ },
  { id: 'summary-1', type: 'summary', tags: ['compaction'],
    content: '[会话压缩摘要] 1. 任务目标：自动测试记忆工具能力……' },
];
```

- [ ] **Step 2: 写查询与期望**

```js
export const CASES = [
  // 语义类：词面零重叠，正确行为是「不返回噪声」。旧碎 bigram 计分会捞回 8 条。
  { name: '零重叠不应捞噪声', query: '他习惯用哪种界面库写网页',
    expectAbsent: ['long-zhihu', 'webpage'], maxResults: 2 },
  { name: '零重叠国家观点', query: '这两个国家的综合实力谁更强',
    expectAbsent: ['mem-bug', 'long-zhihu'], maxResults: 3 },

  // 词面类：应命中且排序正确
  { name: '整词命中排第一', query: 'Vue 前端偏好', top1: 'vue-pref' },
  { name: '长句中的目标词不失配', query: '关于store持久化写入失败的记录', top1: 'mem-bug' },
  { name: '英文专名按词边界', query: 'rag 框架', expectAbsent: ['mem-bug'] }, // rag ∉ 「存储」等，不得子串误伤
  { name: '子串不得误伤', query: 'google 境外访问', top1: 'proxy' },
  { name: '标签命中', query: '浏览器自动化', expectTop: ['webpage', 'long-zhihu'] },
  { name: '摘要类可检索', query: '会话压缩摘要', top1: 'summary-1' },
];
```

- [ ] **Step 3: 写评测执行器与首轮基线（这一步就是 RED）**

```js
// agent/test/unit/memory-recall-eval.unit.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIXTURES, CASES } from '../eval/memory-recall-fixtures.js';

/** 用固定条目建一个只读服务（A 档，不触碰向量侧） */
async function withFixtures(fn) { /* 写临时 global-memory.json → createMemoryService({filePath}) → fn(svc) */ }

test('评测集：每条 case 断言其期望', async () => {
  await withFixtures(async (svc) => {
    const bad = [];
    for (const c of CASES) {
      const r = await svc.recall({ query: c.query, limit: 5 }, null, (k) => k);
      const ids = r.results.map(m => m.id);
      if (c.top1 && ids[0] !== c.top1) bad.push(`${c.name}: top1=${ids[0]} 期望 ${c.top1}`);
      if (c.maxResults !== undefined && ids.length > c.maxResults) bad.push(`${c.name}: 返回 ${ids.length} 条 > ${c.maxResults}`);
      for (const a of (c.expectAbsent || [])) if (ids.includes(a)) bad.push(`${c.name}: 含应 absent 的 ${a}`);
      for (const e of (c.expectTop || [])) if (!ids.slice(0, 2).includes(e)) bad.push(`${c.name}: ${e} 未进前 2`);
    }
    assert.deepEqual(bad, [], `评测失败 ${bad.length} 项:\n` + bad.join('\n'));
  });
});
```

Run: `cd agent && node --test test/unit/memory-recall-eval.unit.test.js`
Expected: **FAIL**，且失败项必须逐条对应本计划「已知缺陷」表 —— 特别是碎 bigram 捞回噪声（`maxResults` 超限）与 `expectAbsent` 违例。若首轮全绿，说明合成条目没造出真实的重叠形态，回 Step 1 加严，**不许改断言凑绿**。

- [ ] **Step 4: 记录基线数字并 Commit**

把 Step 3 的失败项原文抄进本计划 Task 2 的「执行结果」，作为改动前基线。

```bash
git add agent/test/eval/memory-recall-fixtures.js agent/test/unit/memory-recall-eval.unit.test.js docs/superpowers/plans/2026-10-13-memory-keyword-parity.md
git commit -m "test(memory): 记忆召回评测集与改动前基线（碎 bigram 噪声量化）"
```

---

### Task 3: 记忆计分改为片段化单元制

**Files:**
- Modify: `agent/src/memory/tokens.js`
- Modify: `agent/src/memory/service.js`（`keywordScore`、`recall` 的关键词分支）
- Test: `agent/test/unit/memory-tokens.unit.test.js`（旧 bigram 断言允许改，逐条写理由）
- Test: `agent/test/unit/memory-service.unit.test.js`
- Test: `agent/test/unit/memory-recall-eval.unit.test.js`

**Interfaces:**
- Consumes: `extractQueryTerms`, `matchLatin`, `matchCjk`, `KEYWORD_MAX_HITS`（Task 1）
- Produces: `export function keywordScore(memory, terms, originalQuery, dfFilter)` → 整数分

- [ ] **Step 1: 先写新计分的失败测试**

```js
test('命中更长的片段应高于命中多个碎块', async () => {
  // 「store持久化」在 A 中命中 4 字整段，在 B 中命中 2 个随机 2 字块
  // 旧实现：B(+6) > A(+3)；新实现：A(units=3) > B(units=1+1)
});
test('英文子串不再误伤：rag 不命中 storage', () => { /* matchLatin 边界 */ });
test('高频单元不参与计分（df 过半剔除）', () => { /* dfFilter 返回 false 时该单元计 0 */ });
```

- [ ] **Step 2: 实现单元制计分**

```js
// agent/src/memory/tokens.js 新增：字段级单元统计
const FIELD_WEIGHT = { content: 3, title: 2, tags: 2 };

/** 一条记忆在某字段上得到的单元总数（拉丁命中 + 中文最长片段），无有效命中为 0 */
function fieldUnits(text, terms, dfFilter) {
  const hay = String(text || '').toLowerCase();
  if (!hay) return 0;
  let units = 0;
  for (const term of matchLatin(hay, terms.latin)) {
    if (dfFilter(term)) units += 1;
  }
  for (const seg of terms.cjk) {
    const hit = matchCjk(hay, seg);
    if (hit && hit.keys.some(k => dfFilter(k))) units += hit.units;
  }
  return Math.min(units, KEYWORD_MAX_HITS);
}

/**
 * 记忆关键词分：单元数 × 字段权重，另保留整句加分。
 * 与旧实现的差别即本计划的目的——碎块不再与整词等价，长命中不再被拆成多次 +3。
 */
export function keywordScore(m, terms, originalQuery, dfFilter = () => true) {
  let s = 0;
  s += FIELD_WEIGHT.content * fieldUnits(m.content, terms, dfFilter);
  s += FIELD_WEIGHT.title * fieldUnits(m.title, terms, dfFilter);
  s += FIELD_WEIGHT.tags * fieldUnits((m.tags || []).join(' '), terms, dfFilter);
  if (originalQuery && originalQuery.length >= 2) {
    const hay = String((m.content || '') + '\n' + (m.title || '')).toLowerCase();
    if (hay.includes(originalQuery)) s += 5;
    if (String(m.title || '').toLowerCase().includes(originalQuery)) s += 3;
  }
  return s;
}
```

`recall` 内：`extractKeywords(query)` 换成 `extractQueryTerms(query)`；在打分前先对全候选扫一遍统计 df（`total = candidates.length`，`dfLimit = Math.max(2, total * 0.5)`，`df<=2` 低频豁免 —— **与 searcher 同口径，直接从 keyword-match.js 或本模块内同一实现取**），再传入 `dfFilter`。

- [ ] **Step 3: 决定截断规则（用 Task 2 的评测集实测，不许拍脑袋）**

候选规则依次试，取评测集指标最优者；每条规则的失败项原文写进计划：

1. `score > 0`（只靠单元制与 df 剔除收敛噪声）
2. 要求 `units >= 2`（至少 3 字片段，或两个独立单元）才算命中
3. 相对截断：低于 `maxScore * 0.4` 的条目丢弃

判据：Task 2 评测集全绿 + 「零重叠不应捞噪声」的返回条数下降，同时 `top1` 类用例一条不退。

- [ ] **Step 4: 修旧断言（逐条写理由）**

`memory-tokens.unit.test.js` 中「长中文连续段既拆 bigram，也保留整段 fallback」等钉住旧行为的用例：删除或改写为新语义，**每条在本 Task 的「执行结果」里写明「原断言 → 新断言 → 为什么这是预期的行为改变」**。`memory-service.unit.test.js` 的 25 条 A 档用例（含 `关键词命中按 content 计分并排前`、`无命中返回 noMatch`）**目标是全绿不改**；确有改的必要同样逐条说明。

Run: `cd agent && node --test test/unit/memory-*.unit.test.js`
Expected: 评测集全绿 + 记忆相关用例 fail 0。

- [ ] **Step 5: 真实数据复测（本地，不进仓库）**

用临时 HOME + 真实记忆库只读副本，重跑「已知缺陷」表的 3 个零重叠 query，记录改动后返回条数与 top5；跑完删除脚本与临时目录，确认 `grep -c memoryEmbedding ~/.ai-helper-agent/config.json` 仍为 0、`~/.ai-helper-agent/memory/` 下仍无 `memory-vectors.json`。

- [ ] **Step 6: 全量回归 + 构建 + 提交**

```bash
cd agent && node --test test/unit/*.unit.test.js   # 期望 fail 0，总数 ≥ 290 + 新增
npx vitest run && npm run build:silent             # BUILD_SUCCESS
node agent/test/smoke/memory-pushdown.smoke.mjs    # 21 项全 PASS
```

```bash
git add -A && git commit -m "feat(memory): 关键词通道改用片段化单元计分，消除碎 bigram 噪声"
```

CHANGELOG 与 README 的文档同步、以及「融合公式改排名主导（RRF）+ 废掉 `MEMORY_VECTOR_THRESHOLD`」另立计划四（本计划不碰向量通道，避免两件事互相污染评测）。
