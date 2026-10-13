# Memory Hybrid Recall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Agent 端长期记忆的 `recall` 增加语义（向量）通道，并在 embedding 不可用/超时/失败时**逐字回落到今天的关键词行为**，零强制依赖。

**Architecture:** 记忆逻辑已在 Agent 进程内（`agent/src/memory/{service,routes}.js`），向量索引与数据同侧，无需跨 HTTP。新增三块：`memory/tokens.js`（把记忆自己的分词从 service 里搬出，单一来源）、`memory/embedding.js`（tier 决策 + provider 复用 RAG 的 `EmbeddingProvider` + 向量派生缓存）、`recall` 的融合排序。向量落在 `~/.ai-helper-agent/memory/memory-vectors.json`，`global-memory.json` 仍是唯一真源，向量文件随时可删重建。

**Tech Stack:** Node ESM + `node --test`；复用 `agent/src/rag/embedding/index.js` 的 `EmbeddingProvider`（`embedQuery` / `embedDocuments`）与 `rag/detect.js` 的 `isRagAvailable()`；配置持久化走 `agent/src/config.js` 的 `loadConfig()` / `updateConfigField(key, value)`；i18n 走 `agent/src/locales/{zh,en}.json` 的 `memory` 命名空间。

**Spec:** 记忆逻辑下推计划 `docs/superpowers/plans/2026-10-13-agent-memory-pushdown.md`（前置）；降级三级方案与「JSON 文件为唯一真源、向量为派生缓存」原则来自既有架构决策。

## Global Constraints

- **A 档行为不变是硬约束**：未配置 embedding（默认）时，`recall` 的候选收集、计分、排序、会话去重、`accessCount` 递增、输出文案必须与今天完全一致，由回归测试锁死。
- embedding **默认关闭**：`memoryEmbedding.enabled = false`；配置项缺省即走 A 档，不引入任何新的默认网络调用。
- 向量是**派生缓存**：`global-memory.json` 唯一真源；`memory-vectors.json` 可整文件删除并在下次使用时重建；模型标识（mode/modelName/dimensions）变更即整体作废。
- 语义通道**绝不让 recall 变成阻塞高风险调用**：embedQuery 超时上限 8000ms，失败/超时/返回维度不符 → 本条按关键词分继续排序，不整体失败、不抛错。
- 记忆条目规模上限 50 facts + 20 summaries = 70，**不引入 vectra**（≤100 条内存暴力余弦开销在毫秒级，vectra 只增加依赖与重建复杂度）。
- apiKey 只落 Agent 本地 `config.json`，任何响应**不回显明文**（沿用 `rag/routes.js:96-105` 的脱敏 + `hasApiKey` 约定）。
- 不改扩展端转发层的对外契约：`recall` 新增字段靠转发层的 `{ ...rest }` 透传，`src/background/tool-memory.js` 无需改动。
- Agent 改动跑 `cd agent && node --test test/unit/*.unit.test.js`；扩展侧若受影响跑 `npx vitest run`；构建 `npm run build:silent`。不手动改版本号。

---

### Task 1: 记忆分词器独立成模块（纯搬迁，锁行为）

**Files:**
- Create: `agent/src/memory/tokens.js`
- Modify: `agent/src/memory/service.js`（删除内部的 STOP_WORDS / extractKeywords 定义，改为 import）
- Test: `agent/test/unit/memory-tokens.unit.test.js`（新建）

**Interfaces:**
- Consumes: 无
- Produces: `export const STOP_WORDS: Set<string>`；`export function extractKeywords(query: string): string[]`（CJK ≤4 字整段、>4 字 bigram、英文数字整词、最多 30 个）；`export const KEYWORD_CAP = 30`

service.js 里现有的 STOP_WORDS/extractKeywords 是从扩展端逐字平移来的，语义**一个字符都不许改**；本 Task 只搬位置，靠现有 25 条 memory-service 测试做安全网。

实测补充（写计划时未核实到的两点）：① 两者定义在 `createMemoryService()` **闭包内部**（service.js:244-303，缩进两格），摘出到模块顶层时不依赖任何闭包变量，可安全搬迁；② `extractKeywords` 除 bigram 外还会把**整段清洗后的 snippet** 作为 fallback token 返回，长查询的第一个关键词因此可能远超 4 字——这是 recall 计分的一部分，后续 Task 不能"顺手优化"掉。

- [ ] **Step 1: 写失败测试**

新建 `agent/test/unit/memory-tokens.unit.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractKeywords, STOP_WORDS, KEYWORD_CAP } from '../../src/memory/tokens.js';

test('导出常量存在', () => {
  assert.ok(STOP_WORDS instanceof Set);
  assert.equal(KEYWORD_CAP, 30);
});

test('英文与数字按整词切分、停用词过滤', () => {
  const kws = extractKeywords('use npm 12 to run the test');
  assert.ok(kws.includes('npm'));
  assert.ok(kws.includes('12'));
  assert.ok(!kws.includes('the'));
});

test('短中文连续段整段保留', () => {
  assert.ok(extractKeywords('用户偏好').includes('用户偏好'));
});

test('长中文连续段既拆 bigram，也保留整段 fallback', () => {
  const kws = extractKeywords('请在后续回复中使用中文说明');
  assert.ok(kws.includes('后续'));
  assert.ok(kws.includes('回复'));
  // 实现会把清洗后的整段（snippet）也作为关键词加入，recall 计分依赖它，不得丢
  assert.ok(kws.some(k => k.length > 4));
});

test('关键词数量封顶 30', () => {
  // 40 个互不相同的汉字 → 39 个 unique bigram + 1 个整段 fallback，必须被截到 30
  const run = Array.from({ length: 40 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('');
  assert.equal(extractKeywords(run).length, KEYWORD_CAP);
});

test('超过 200 字符只取前 200 字符参与提取', () => {
  assert.ok(!extractKeywords('甲'.repeat(300) + '独特结尾').includes('独特结尾'));
});

test('空输入与假值输入返回空数组', () => {
  assert.deepEqual(extractKeywords(''), []);
  assert.deepEqual(extractKeywords('   '), []);
  assert.deepEqual(extractKeywords(null), []);
  assert.deepEqual(extractKeywords(undefined), []);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd agent && node --test test/unit/memory-tokens.unit.test.js`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 搬迁实现**

从 `agent/src/memory/service.js` 里把 STOP_WORDS 与 extractKeywords（含其 CJK bigram 分支）整段剪切到 `agent/src/memory/tokens.js`，头部加：

```js
// agent/src/memory/tokens.js - 记忆召回的关键词提取（单一来源）
// 逐字平移自 service.js（原扩展端 tool-memory.js），语义不得变更：
// CJK ≤4 字连续段整段保留、>4 字拆 bigram；英文/数字整词；停用词过滤；最多 KEYWORD_CAP 个。

export const KEYWORD_CAP = 30;

export const STOP_WORDS = new Set([ /* 原内容逐字粘贴 */ ]);

export function extractKeywords(query) { /* 原实现，硬编码 30 换成 KEYWORD_CAP、200 换成 SNIPPET_MAX_LENGTH */ }

// 实测偏差（执行时确认）：原实现开头是 `text.toLowerCase().trim()`，传 null 会 TypeError ——
// 现网调用方 recall 有 `if (query && query.trim())` 守卫所以从未触发。独立成模块后会被 Task 3/4/5
// 的新调用点复用，故补 `if (!text) return [];` + `String(text)` 归一化。非 null 输入逐字不变。
```

`service.js` 顶部加 import 并删除本地定义：

```js
import { extractKeywords } from './tokens.js';
```

注意：service.js 里若还有对 `STOP_WORDS` 的直接引用，一并改为 import；没有就只 import `extractKeywords`。

- [ ] **Step 4: 运行新旧测试全通过**

Run: `cd agent && node --test test/unit/memory-tokens.unit.test.js test/unit/memory-service.unit.test.js`
Expected: tokens 7 条 + service 25 条 = 32 PASS（行为未变的安全证明）；全量 `node --test test/unit/*.unit.test.js` 由 220 → **227**。

- [ ] **Step 5: Commit**

```bash
git add agent/src/memory/tokens.js agent/src/memory/service.js agent/test/unit/memory-tokens.unit.test.js
git commit -m "refactor(memory): 关键词提取独立为 memory/tokens.js（行为不变）"
```

---

### Task 2: 记忆 embedding 配置与端点

**Files:**
- Modify: `agent/src/config.js:18-25`（`DEFAULTS` 增加 `memoryEmbedding`）
- Create: `agent/src/memory/embedding-config.js`
- Modify: `agent/src/memory/routes.js`（新增两个子路径与 GET 支持）
- Modify: `agent/src/locales/zh.json` / `en.json`（`memory` 命名空间补文案）
- Test: `agent/test/unit/memory-embedding-config.unit.test.js`

**Interfaces:**
- Consumes: `loadConfig()`、`updateConfigField('memoryEmbedding', value)`（`VALID_CONFIG_KEYS = Object.keys(DEFAULTS)`，加进 DEFAULTS 即自动合法）
- Produces:
  - `export const DEFAULT_MEMORY_EMBEDDING_CONFIG = { enabled: false, mode: 'openai-compat', baseUrl: '', modelName: '', apiKey: '', dimensions: 0, queryPrefix: '' }`
  - `export function getMemoryEmbeddingConfig(): object`（原始含 key）
  - `export function maskMemoryEmbeddingConfig(cfg): object`（`apiKey: ''` + `hasApiKey: boolean`）
  - `export async function saveMemoryEmbeddingConfig(input): Promise<object>`（空白 apiKey 保留旧值）
  - 端点：`GET /api/memory/embedding-config`、`POST /api/memory/embedding-config`、`POST /api/memory/test-embedding`
  - 另导出 `MEMORY_EMBEDDING_MODES`（mode 白名单）与 `resolveMemoryEmbeddingConfig(override)`（探活/向量派生用的合并配置，明文 key 缺省回落已存值）

> **Task 2 执行结果（已实施）**：新增 `memory-embedding-config` 12 条 + `config-update-field` 6 条，agent 全量 227 → **245/245**。实施中发现并修掉两个既有缺陷（都不在本计划预期内）：
>
> 1. **`updateConfigField` 自我死锁**：它在 `withWriteLock` 内又调 `saveConfig`（同一把锁），后者排队等前者持有的锁 → **调用方永久挂起**。此前它零生产调用方（server.js 走 `saveConfig`），从未暴露；本 Task 是第一个调用方，症状是"测试跑完不退出"。修法：把 `saveConfig` 的写入体抽成**不加锁**的 `writeConfigBody(config)`，两者各自取锁后复用；`updateConfigField` 同时改浅拷贝再赋值（原 `loadConfig()[key]=value` 会就地改调用方已持有的缓存对象）。
> 2. **`withWriteLock` 隐含"fn 必须返回 Promise"契约**：`fn().finally(release)` 遇到同步写入体直接 TypeError 且**锁永不释放**。改为 `Promise.resolve(fn())` 兜住，并保证失败路径一定放锁（新增回归：写入失败后仍须能继续写）。
>
> 与计划的其余差异：① 临时 HOME 必须在 import **之前**设置（`config.js` 的 `AGENT_DIR` 在模块加载时求值，且 `loadConfig()` 首次会写默认 config.json），照抄本 Task 测试里的 `USERPROFILE` + `const { os } = await import('os')` 会污染真实 HOME；② `test-embedding` 增加 `options.createProvider` / `options.embeddingTimeoutMs` 测试接缝（沿用既有 `options.service` 模式），单测绝不真连外部 embedding；③ `withTimeout` 必须 `clearTimeout`（计划版本每次调用漏挂一个 8s 定时器，daemon 里是隐性唤醒源，测试进程还会延迟退出）；④ mode 校验错误经 `t('memory.invalidEmbeddingMode')` 渲染双语，其余错误原样透出。

- [ ] **Step 1: 写失败测试**

新建 `agent/test/unit/memory-embedding-config.unit.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';

// config.js 的落盘位置随 homedir()，用临时 HOME 隔离，绝不写用户真实 config.json
const home = mkdtempSync(join(tmpdir(), 'aha-memcfg-'));
const prevHome = process.env.HOME, prevU = process.env.USERPROFILE;
process.env.HOME = home; process.env.USERPROFILE = home;
const { os } = await import('os');
process.env.TZ = 'UTC';

const {
  DEFAULT_MEMORY_EMBEDDING_CONFIG,
  getMemoryEmbeddingConfig,
  maskMemoryEmbeddingConfig,
  saveMemoryEmbeddingConfig
} = await import('../../src/memory/embedding-config.js');

const cleanup = () => { rmSync(home, { recursive: true, force: true }); process.env.HOME = prevHome; process.env.USERPROFILE = prevU; void os; };

test('缺省为关闭', () => {
  assert.equal(DEFAULT_MEMORY_EMBEDDING_CONFIG.enabled, false);
  assert.equal(getMemoryEmbeddingConfig().enabled, false);
});

test('脱敏不回显 apiKey 且给出 hasApiKey', () => {
  const masked = maskMemoryEmbeddingConfig({ ...DEFAULT_MEMORY_EMBEDDING_CONFIG, apiKey: 'sk-secret' });
  assert.equal(masked.apiKey, '');
  assert.equal(masked.hasApiKey, true);
  assert.ok(!JSON.stringify(masked).includes('sk-secret'));
});

test('保存时空白 apiKey 视为不修改，保留已存 key', async () => {
  await saveMemoryEmbeddingConfig({ enabled: true, modelName: 'text-embedding-3-small', apiKey: 'sk-keep' });
  const saved = await saveMemoryEmbeddingConfig({ apiKey: '   ', modelName: 'text-embedding-3-large' });
  assert.equal(getMemoryEmbeddingConfig().apiKey, 'sk-keep');
  assert.equal(saved.modelName, 'text-embedding-3-large');
  assert.equal(saved.enabled, true);
});

test('非法 mode 被拒绝', async () => {
  await assert.rejects(() => saveMemoryEmbeddingConfig({ mode: 'magic' }));
});

cleanup();
```

- [ ] **Step 2: 运行确认失败**

Run: `cd agent && node --test test/unit/memory-embedding-config.unit.test.js`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 配置默认值**

`agent/src/config.js` 的 `DEFAULTS` 里 `ragUrlIngest` 之后追加：

```js
  // 长期记忆语义召回的 embedding 配置：缺省关闭 → recall 只走关键词（Tier A）。
  // mode: 'openai-compat'（远端，无需 RAG 依赖）| 'local'（本地模型，需 RAG 依赖可用）
  memoryEmbedding: {
    enabled: false,
    mode: 'openai-compat',
    baseUrl: '',
    modelName: '',
    apiKey: '',
    dimensions: 0,
    queryPrefix: ''
  }
```

- [ ] **Step 4: 实现配置模块**

`agent/src/memory/embedding-config.js`：

```js
// agent/src/memory/embedding-config.js - 记忆语义召回的 embedding 配置读写与脱敏
// 单一配置出口：只从 agent config.json 的 memoryEmbedding 字段读写，不在请求体里携带 key。

import { loadConfig, updateConfigField } from '../config.js';

export const DEFAULT_MEMORY_EMBEDDING_CONFIG = {
  enabled: false,
  mode: 'openai-compat',
  baseUrl: '',
  modelName: '',
  apiKey: '',
  dimensions: 0,
  queryPrefix: ''
};

const VALID_MODES = ['openai-compat', 'local'];

/** 原始配置（含 apiKey 明文，仅进程内使用） */
export function getMemoryEmbeddingConfig() {
  const cfg = loadConfig().memoryEmbedding || {};
  return { ...DEFAULT_MEMORY_EMBEDDING_CONFIG, ...cfg };
}

/** 对外响应形态：隐藏明文 key，附 hasApiKey 供前端「已配置」提示（与 RAG 同约定） */
export function maskMemoryEmbeddingConfig(cfg = getMemoryEmbeddingConfig()) {
  const { apiKey, ...rest } = cfg;
  return { ...rest, apiKey: '', hasApiKey: Boolean(apiKey) };
}

/**
 * 保存配置：空白 apiKey 表示不修改；mode 白名单校验；dimensions 规整为非负整数
 * @param {object} input
 * @returns {Promise<object>} 脱敏后的最新配置
 */
export async function saveMemoryEmbeddingConfig(input = {}) {
  const current = getMemoryEmbeddingConfig();
  const next = { ...current };

  if (input.mode !== undefined) {
    if (!VALID_MODES.includes(input.mode)) throw new Error('invalid_embedding_mode');
    next.mode = input.mode;
  }
  if (input.enabled !== undefined) next.enabled = input.enabled === true;
  if (typeof input.baseUrl === 'string') next.baseUrl = input.baseUrl.trim();
  if (typeof input.modelName === 'string') next.modelName = input.modelName.trim();
  if (typeof input.queryPrefix === 'string') next.queryPrefix = input.queryPrefix;
  // key 只在显式非空时覆盖，避免前端表单未回填明文时把已存 key 抹掉
  if (typeof input.apiKey === 'string' && input.apiKey.trim()) next.apiKey = input.apiKey.trim();
  if (input.dimensions !== undefined) {
    const n = Number(input.dimensions);
    next.dimensions = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  await updateConfigField('memoryEmbedding', next);
  return maskMemoryEmbeddingConfig(next);
}
```

- [ ] **Step 5: 路由接入（含 GET）**

`agent/src/memory/routes.js`：在 `memoryDispatch` 之前 import 配置模块，并在函数体**最前面**插入配置端点分支（`ROUTE_METHODS` 只处理 service 业务方法，配置类走独立分支，避免把 GET 混进「非 POST 即 404」的逻辑）：

```js
import { getMemoryEmbeddingConfig, maskMemoryEmbeddingConfig, saveMemoryEmbeddingConfig } from './embedding-config.js';
import { createEmbeddingProvider } from '../rag/embedding/index.js';

/** 记忆 embedding 配置/探活端点；返回 true 表示已处理 */
async function handleEmbeddingEndpoints(req, res, key, t, body) {
  if (key === 'embedding-config') {
    if (req.method === 'GET') {
      return jsonResponse(res, 200, { success: true, config: maskMemoryEmbeddingConfig() }), true;
    }
    if (req.method === 'POST') {
      try {
        const config = await saveMemoryEmbeddingConfig(body || {});
        return jsonResponse(res, 200, { success: true, config }), true;
      } catch (err) {
        return jsonResponse(res, 400, { success: false, error: err.message || 'embedding_config_error' }), true;
      }
    }
    return false;
  }

  if (key === 'test-embedding' && req.method === 'POST') {
    const cfg = { ...getMemoryEmbeddingConfig(), ...(body || {}) };
    // 探活允许请求体覆盖（尚未保存时先试），但明文 key 缺省时回落已存 key
    if (!cfg.apiKey) cfg.apiKey = getMemoryEmbeddingConfig().apiKey;
    try {
      const provider = createEmbeddingProvider(cfg);
      const vec = await withTimeout(provider.embedQuery('ping'), 8000);
      return jsonResponse(res, 200, { success: true, dimensions: vec.length }), true;
    } catch (err) {
      return jsonResponse(res, 400, { success: false, error: err.message || 'embedding_test_failed' }), true;
    }
  }

  return false;
}

/** embed 调用超时保护（语义通道绝不能拖垮 recall） */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('embedding_timeout')), ms))
  ]);
}
```

在 `memoryDispatch` 内、`ROUTE_METHODS` 查表**之前**调用：

```js
  const key = pathname.slice('/api/memory/'.length).replace(/\/+$/, '');

  if (await handleEmbeddingEndpoints(req, res, key, t, requestBody)) return;

  const method = ROUTE_METHODS[key];
```

同时把原来 `const key = ...` 那一行删掉（避免重复声明），并把 404 判定里的 `req.method !== 'POST'` 保留给业务四端点。

- [ ] **Step 6: i18n 文案**

`agent/src/locales/zh.json` 的 `memory` 命名空间追加（`en.json` 对应英文）：

追加时顺手补了校验文案 `invalidEmbeddingMode`（放在 `memory` 命名空间末尾、紧跟 `reviewItemCreated`）：

```json
    "invalidEmbeddingMode": "不支持的 embedding 模式，仅支持 openai-compat 或 local",
    "embeddingDisabled": "未启用语义召回，当前仅关键词通道",
    "embeddingTimeout": "向量服务响应超时，本次已回落关键词召回",
    "tierLabelNone": "关键词",
    "tierLabelRemote": "远端向量+关键词",
    "tierLabelLocal": "本地向量+关键词"
```

- [ ] **Step 7: 运行测试 + 全量**

Run: `cd agent && node --test test/unit/memory-embedding-config.unit.test.js test/unit/memory-routes.unit.test.js && node --test test/unit/*.unit.test.js`
Expected: embedding 配置 12 条 + 配置锁回归 6 条 PASS；routes 8 条仍 PASS；全量 `fail 0`（245）。

- [ ] **Step 8: Commit**

```bash
git add agent/src/config.js agent/src/memory/embedding-config.js agent/src/memory/routes.js agent/src/locales/zh.json agent/src/locales/en.json agent/test/unit/memory-embedding-config.unit.test.js agent/test/unit/config-update-field.unit.test.js
git commit -m "feat(memory): 记忆语义召回的 embedding 配置端点（默认关闭、apiKey 脱敏）"
```

---

### Task 3: 向量派生缓存

**Files:**
- Create: `agent/src/memory/vectors.js`
- Test: `agent/test/unit/memory-vectors.unit.test.js`

**Interfaces:**
- Consumes: `MEMORY_DIR`（`agent/src/config.js` 已导出，service.js 就是这么拿路径的；若未导出则从 service.js 现有 import 处取同一路径来源）
- Produces:
  - `export function memoryModelKey(cfg): string` → `${mode}|${modelName}|${dimensions}`
  - `export async function readVectors(): { modelKey: string, vectors: Record<string, number[]> }`
  - `export async function writeVectors(payload): Promise<{ success: boolean, error?: string }>`
  - `export async function upsertVectors(entries: Array<[string, number[])>, modelKey: string): Promise<void>`（modelKey 变更 → 先整体作废）
  - `export async function dropVectors(ids: string[]): Promise<void>`
  - `export function cosine(a: number[], b: number[]): number`
  - `export function createVectorStoreFacade({ filePath } = {})`（供 service 注入自定义路径做测试）
  - `export function clearVectors(): Promise<void>`（执行时补：Task 6 的 reindex 端点需要「整体作废但不删文件」，删文件会让下次写落在不存在的目录上多一次 mkdir）
  - `export const VECTORS_FILE`（默认缓存路径，Task 7 冒烟与文档引用）

- [ ] **Step 1: 写失败测试**

新建 `agent/test/unit/memory-vectors.unit.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { memoryModelKey, createVectorStoreFacade, cosine } from '../../src/memory/vectors.js';

const dir = mkdtempSync(join(tmpdir(), 'aha-vec-'));
const file = join(dir, 'memory-vectors.json');
const store = createVectorStoreFacade({ filePath: file });

test('modelKey 由 mode/model/dimensions 组成', () => {
  assert.equal(memoryModelKey({ mode: 'openai-compat', modelName: 'm1', dimensions: 1536 }), 'openai-compat|m1|1536');
});

test('upsert 后可读回', async () => {
  await store.upsertVectors([['fact_1', [1, 0, 0]], ['fact_2', [0, 1, 0]]], 'openai-compat|m1|1536');
  const { modelKey, vectors } = await store.read();
  assert.equal(modelKey, 'openai-compat|m1|1536');
  assert.deepEqual(vectors.fact_1, [1, 0, 0]);
  assert.equal(Object.keys(vectors).length, 2);
});

test('modelKey 变更即整体作废（跨模型向量不可混用）', async () => {
  await store.upsertVectors([['fact_3', [0, 0, 1]]], 'local|bge|512');
  const { vectors } = await store.read();
  assert.deepEqual(Object.keys(vectors), ['fact_3']);
});

test('drop 摘除指定 id 且不动其他', async () => {
  await store.upsertVectors([['a', [1]], ['b', [1]]], 'local|bge|512');
  await store.dropVectors(['a']);
  const { vectors } = await store.read();
  assert.ok(!('a' in vectors) && 'b' in vectors);
});

test('损坏的向量文件被当作空缓存（派生缓存可重建，不阻断召回）', async () => {
  const bad = join(dir, 'bad.json');
  await store.constructor; // no-op
  const fs = await import('fs');
  fs.writeFileSync(bad, '{not json');
  const s2 = createVectorStoreFacade({ filePath: bad });
  const r = await s2.read();
  assert.deepEqual(r, { modelKey: '', vectors: {} });
});

test('cosine 处理零向量与不等长', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([0, 0], [1, 1]), 0);
  assert.equal(cosine([1, 2], [1]), 0);
});

rmSync(dir, { recursive: true, force: true });
```

- [ ] **Step 2: 运行确认失败**

Run: `cd agent && node --test test/unit/memory-vectors.unit.test.js`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现缓存**

`agent/src/memory/vectors.js`：

```js
// agent/src/memory/vectors.js - 记忆向量的派生缓存
// 原则：global-memory.json 是唯一真源，本文件只缓存派生向量；删除/损坏都不得影响召回（回落关键词）。

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { MEMORY_DIR } from '../config.js';

export const VECTORS_FILE = join(MEMORY_DIR, 'memory-vectors.json');

/** 模型标识：mode|model|dimensions，任一变化都必须整体作废（跨模型向量不可比） */
export function memoryModelKey(cfg = {}) {
  return `${cfg.mode || ''}|${cfg.modelName || ''}|${Number(cfg.dimensions) || 0}`;
}

export function cosine(a = [], b = []) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 创建缓存门面（filePath 可注入，便于单测与临时 HOME 冒烟）
 */
export function createVectorStoreFacade({ filePath = VECTORS_FILE } = {}) {
  let chain = Promise.resolve();
  const serialized = (task) => {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  };

  async function readRaw() {
    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.vectors || typeof parsed.vectors !== 'object') {
        return { modelKey: '', vectors: {} };
      }
      return { modelKey: typeof parsed.modelKey === 'string' ? parsed.modelKey : '', vectors: parsed.vectors };
    } catch {
      return { modelKey: '', vectors: {} };
    }
  }

  async function writeRaw(payload) {
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(payload), 'utf-8');
      return { success: true };
    } catch (err) {
      console.warn('[Memory] vectors write failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  return {
    read: () => serialized(readRaw),
    write: (payload) => serialized(() => writeRaw(payload)),
    async upsertVectors(entries, modelKey) {
      return serialized(async () => {
        const cur = await readRaw();
        const vectors = cur.modelKey === modelKey ? cur.vectors : {};   // 模型变更 → 作废全部旧向量
        for (const [id, vec] of entries) if (Array.isArray(vec) && vec.length) vectors[id] = vec;
        await writeRaw({ modelKey, vectors });
      });
    },
    async dropVectors(ids) {
      return serialized(async () => {
        const cur = await readRaw();
        let touched = false;
        for (const id of ids || []) if (id in cur.vectors) { delete cur.vectors[id]; touched = true; }
        if (touched) await writeRaw(cur);
      });
    }
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd agent && node --test test/unit/memory-vectors.unit.test.js`
Expected: 12 条 PASS（实测 12/12）。

- [ ] **Step 5: Commit**

```bash
git add agent/src/memory/vectors.js agent/test/unit/memory-vectors.unit.test.js
git commit -m "feat(memory): 记忆向量派生缓存（模型变更整体作废、损坏即回落）"
```

> **执行结果（已实施）。计划在此处有 5 处需要修正／加固，按实测行为改写：**
> 1. **计划的清理会在测试自己落盘前把目录删掉**：`node:test` 的 `test()` 只是登记用例，模块体会先同步跑完，因此计划结尾的顶层 `rmSync(dir)` 在实际执行时先于异步用例的写盘发生。改为 `after(() => rmSync(dir, ...))`（新用 `node:test` 的 `after` 钩子）。
> 2. **计划第 5 条用例含两行无效代码**：`await store.constructor;`（对函数取属性再 await，无意义）与用例内 `await import('fs')`，已删；`writeFileSync` 改到文件头统一 import。
> 3. **计划的「落盘失败」用例本身跑不通**：原写法先 `mkdirSync(blocked)` 再 `writeFileSync(blocked, ...)` —— 对目录写文件是 EISDIR，报错发生在准备阶段而不是被测代码里。改为把父路径占成普通文件（`blocker.txt/vectors.json`），让 `mkdir(dirname)` 得到 ENOTDIR，才是真正的写失败路径。
> 4. **`cosine` 按计划实现会算出 `0.9999999999999998` 的自相似度**：`dot / (Math.sqrt(na) * Math.sqrt(nb))` 中 `Math.sqrt(2) * Math.sqrt(2) = 2.0000000000000004`。合并成 `dot / Math.sqrt(na * nb)` 后 `cosine([1,1],[1,1]) === 1` 严格成立。这不是美化——Task 5 的相似度阈值比较和 Tier 展示都依赖它。
> 5. **两处纯加固**（计划外的输入由实现兜住）：`memoryModelKey` 的 `dimensions` 用 `Number(...) > 0` 归一（字符串 `'512'` 与数字 512 必须得到同一个键，否则改一次配置就误作废全部向量）；`upsertVectors` 只接受「非空 + 全有限数」的向量，NaN/Infinity 不入库（一个 NaN 会让整批记忆的相似度全变 NaN，排序彻底失效）。
> 实际用例数按计划是 6 条，落地为 **12 条**：补了并发不丢写、文件不存在/结构不合法/只有 modelKey 三种空缓存形态、drop 不存在的 id 不产生写入、`clear` 整体作废、非有限数过滤。

**Agent 全量单测：245 → 257 passed / fail 0。**`vectors.js` 尚未被 `service.js` 引用（Task 5 才接入召回），因此本 Task 对既有行为零影响。

---

### Task 4: Tier 决策器与 RAG 计分常量复用

**Files:**
- Modify: `agent/src/rag/searcher.js:17-22`（把私有常量改为导出，值不变）
- Create: `agent/src/memory/tier.js`
- Test: `agent/test/unit/memory-tier.unit.test.js`

**Interfaces:**
- Consumes: `isRagAvailable()`（`agent/src/rag/detect.js:174`）、`getMemoryEmbeddingConfig()`
- Produces:
  - `export function resolveMemoryTier(cfg, ragAvailable): 'none' | 'remote' | 'local'`
  - `export function isVectorTier(tier): boolean`
  - searcher 侧新增导出：`KEYWORD_BOOST_PER_HIT`、`KEYWORD_MIN_SCORE`、`SCORE_MAX`、`VECTOR_THRESHOLD`（值逐字不变，仅加 `export`）

Tier 语义（与既有三级方案对齐并落到可实现口径）：
- `none`（Tier A）：未启用 → 只走关键词，**行为与今天一致**。
- `remote`（Tier B）：`enabled && mode === 'openai-compat' && apiKey && modelName` → 远端 embedding，不要求 RAG 依赖。
- `local`（Tier C）：`enabled && mode === 'local' && isRagAvailable()` → 本地模型 embedding（`LocalEmbedding` 依赖 transformers，属 RAG 依赖包）。
- `enabled && mode === 'local' && !isRagAvailable()` → 自动降到 `none`（依赖缺失时零报错降级，正是当初确认过的降级要求）。

- [ ] **Step 1: 写失败测试**

新建 `agent/test/unit/memory-tier.unit.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMemoryTier, isVectorTier } from '../../src/memory/tier.js';

const remote = { enabled: true, mode: 'openai-compat', apiKey: 'sk', modelName: 'm', dimensions: 0 };
const local = { enabled: true, mode: 'local', apiKey: '', modelName: 'bge', dimensions: 512 };

test('未启用 → none', () => {
  assert.equal(resolveMemoryTier({ ...remote, enabled: false }, true), 'none');
});
test('远端缺 key 或缺 model → none', () => {
  assert.equal(resolveMemoryTier({ ...remote, apiKey: '' }, true), 'none');
  assert.equal(resolveMemoryTier({ ...remote, modelName: '  ' }, true), 'none');
});
test('远端齐备 → remote（不依赖 RAG 是否安装）', () => {
  assert.equal(resolveMemoryTier(remote, false), 'remote');
});
test('local 且 RAG 可用 → local；不可用则降 none', () => {
  assert.equal(resolveMemoryTier(local, true), 'local');
  assert.equal(resolveMemoryTier(local, false), 'none');
});
test('未知 mode → none', () => {
  assert.equal(resolveMemoryTier({ enabled: true, mode: 'magic', apiKey: 'k', modelName: 'm' }, true), 'none');
});
test('isVectorTier 只对 remote/local 为真', () => {
  assert.deepEqual(['none', 'remote', 'local'].map(isVectorTier), [false, true, true]);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd agent && node --test test/unit/memory-tier.unit.test.js`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: searcher 常量导出（值不动）**

`agent/src/rag/searcher.js` 把这几行的 `const` 改成 `export const`，其余一概不改：

```js
export const KEYWORD_BOOST_PER_HIT = 0.1;
export const KEYWORD_MIN_SCORE = 0.5;
export const KEYWORD_MAX_DF_RATIO = 0.5;
export const SCORE_MAX = 0.99;
```

（同文件里若存在 `VECTOR_THRESHOLD` 之类的阈值常量，也一并导出；若无则本 Task 不引入新阈值，向量阈值在 memory 侧自定为 `MEMORY_VECTOR_THRESHOLD = 0.3`，与 RAG 默认阈值同源同值——注释里写明取自 RAG 默认阈值。）

- [ ] **Step 4: 实现 tier.js**

`agent/src/memory/tier.js`：

```js
// agent/src/memory/tier.js - 记忆召回通道分级决策（纯函数，无 IO）
// none = 关键词通道（与历史行为逐字一致）；remote/local = 叠加向量通道。

export const MEMORY_VECTOR_THRESHOLD = 0.3; // 与 RAG 默认检索阈值同口径

export function resolveMemoryTier(cfg = {}, ragAvailable = false) {
  if (cfg.enabled !== true) return 'none';
  const mode = cfg.mode;
  if (mode === 'openai-compat') {
    return (cfg.apiKey && String(cfg.modelName || '').trim()) ? 'remote' : 'none';
  }
  if (mode === 'local') {
    return ragAvailable ? 'local' : 'none';
  }
  return 'none';
}

export function isVectorTier(tier) {
  return tier === 'remote' || tier === 'local';
}
```

- [ ] **Step 5: 运行测试 + 全量**

Run: `cd agent && node --test test/unit/memory-tier.unit.test.js test/unit/rag*.unit.test.js && node --test test/unit/*.unit.test.js`
Expected: 新 9 条 PASS（实测 9/9）；RAG 现有测试不受影响（只加了 `export`）；全量 266 passed / fail 0。

- [ ] **Step 6: Commit**

```bash
git add agent/src/memory/tier.js agent/src/rag/searcher.js agent/test/unit/memory-tier.unit.test.js
git commit -m "feat(memory): 召回通道分级决策器并复用 RAG 计分常量"
```

> **执行结果（已实施）。3 处与计划不同，均已在代码注释里写明缘由：**
> 1. **`MEMORY_VECTOR_THRESHOLD` 不复制数值，改成真同源**：计划写「自定 `0.3` + 注释取自 RAG 默认阈值」。执行前核实：`searcher.js` 里并不存在 `VECTOR_THRESHOLD` 常量（grep 无命中），真正的默认阈值在 `agent/src/rag/config.js:49` 的 `DEFAULT_SEARCH_CONFIG.threshold`。该模块是纯常量（只有 `join/homedir/process.env`，无 fs 读写），所以直接 `import` 它而不抄数字——RAG 侧调参时记忆侧自动跟随，不会静默漂移。
> 2. **计划的远端判定会把「全是空格的 apiKey」放行**：原式 `cfg.apiKey && String(cfg.modelName || "").trim()` 中 `'   '` 为真 → 判成 `'remote'`，随后每次召回都拿空 key 去请求远端并必然失败。改为 key 与 model 都 trim 后判空。`saveMemoryEmbeddingConfig` 本身会 trim，但用户直接编辑 `config.json` 不经过它，故决策侧必须自带这道校验。
> 3. **`ragAvailable` 用真值判断而非 `=== true`（计划同义写法保留）**：调用方 `isRagAvailable()` 返回布尔，但严格比较会让包装层传回的任何真值被误降级成 `'none'`——降级必须是静默的，静默的假阴性最难查。

searcher 侧只导出计划点名的 4 个常量、值逐字不变；`KEYWORD_MIN_LEN`／`KEYWORD_MAX_HITS`／`KEYWORD_SCAN_LIMIT` 仍为私有（记忆侧不复用，导出它们只会扩大可被误用的面）。用例按计划是 7 条，落地 **9 条**：补了 `enabled` 假值（`'true'`／`1`／`undefined`）一律 none、无参/`null` 不抛、`isVectorTier` 非法值、以及阈值同源断言。

---

### Task 5: recall 融合排序（A 档零漂移）

**Files:**
- Modify: `agent/src/memory/service.js`（`createMemoryService` 选项、`recall` 内部分数计算）
- Test: `agent/test/unit/memory-service.unit.test.js`（追加向量通道用例）+ 既有 25 条作为 A 档回归锁

**Interfaces:**
- Consumes: `resolveMemoryTier`, `isVectorTier`, `createVectorStoreFacade`, `createEmbeddingProvider`, `getMemoryEmbeddingConfig`, `cosine`, `MEMORY_VECTOR_THRESHOLD`, `KEYWORD_BOOST_PER_HIT`, `SCORE_MAX`
- Produces:
  - `createMemoryService({ filePath, vectorsFilePath, embeddingConfigProvider, embedderFactory, tierResolver, embedTimeoutMs } = {})`（除 filePath 外均为可测性注入点，缺省走真实实现；执行时以 `embeddingConfigProvider` 取代计划里的 `ragAvailableProvider`，理由见本 Task 末尾）
  - `recall(args, sessionId, t)` 返回值新增 `tier: 'none'|'remote'|'local'` 与 `vectorMatched: number`；其余字段与今天逐字一致

排序规则（写进注释，避免实现走偏）：

```
finalScore = max(cosine, 0) + KEYWORD_BOOST_PER_HIT * keywordHitUnits
  - 有关键词命中时保底分 MEMORY_VECTOR_THRESHOLD + 0.2（保证语义漏召但词面命中的条目仍能出现）
  - 封顶 SCORE_MAX
  - cosine 缺失（该条目尚未有向量 / embedding 调用失败）→ 退回现有关键词分（kwScore）参与排序，不做惩罚
次级排序（分数相等时）沿用现状：importance 降序 → updatedAt 降序
```

A 档（`tier === 'none'`）**必须跳过以上整段**，直接用现有的 `kwScore` 排序代码路径，一行都不改。

- [ ] **Step 1: 追加失败测试**

在 `agent/test/unit/memory-service.unit.test.js` 末尾追加（沿用文件里已有的 `T`、`svc()` 辅助；若无则按现有用例的构造方式）：

```js
test('向量通道：语义相近但零关键词命中的条目被召回，且 tier 标注为 remote', async () => {
  const fakeProvider = {
    embedQuery: async () => [1, 0, 0],
    embedDocuments: async (texts) => texts.map((_, i) => i === 0 ? [0.98, 0.2, 0] : [0, 1, 0])
  };
  const svc = createMemoryService({
    filePath, vectorsFilePath,
    embedderFactory: () => fakeProvider,
    tierResolver: () => 'remote'
  });
  await svc.store({ action: 'add', type: 'fact', content: '目标条目', tags: [], importance: 5 }, T);
  await svc.store({ action: 'add', type: 'fact', content: '无关条目', tags: [], importance: 5 }, T);
  await svc.backfillVectors(T);   // 显式补齐（真实链路由 store 后懒补）

  const r = await svc.recall({ query: '完全不同措辞', limit: 5 }, null, T);
  assert.equal(r.tier, 'remote');
  assert.ok(r.vectorMatched >= 1);
  assert.equal(r.results[0].content, '目标条目');
});

test('向量调用抛错：本次 recall 不失败，退回关键词排序', async () => {
  const svc = createMemoryService({
    filePath, vectorsFilePath,
    embedderFactory: () => { throw new Error('boom'); },
    tierResolver: () => 'remote'
  });
  await svc.store({ action: 'add', type: 'fact', content: '关键词必须命中 npm', tags: [], importance: 5 }, T);
  const r = await svc.recall({ query: 'npm', limit: 5 }, null, T);
  assert.equal(r.success, true);
  assert.equal(r.total, 1);
  assert.ok(r.results[0].content.includes('npm'));
});

test('embedQuery 超时：按失败降级处理（不 hang）', async () => {
  const svc = createMemoryService({
    filePath, vectorsFilePath,
    embedderFactory: () => ({ embedQuery: () => new Promise(() => {}) }),  // 永不 resolve
    tierResolver: () => 'remote',
    embedTimeoutMs: 20
  });
  await svc.store({ action: 'add', type: 'fact', content: 'x npm', tags: [], importance: 5 }, T);
  const r = await svc.recall({ query: 'npm', limit: 5 }, null, T);
  assert.equal(r.success, true);
});

test('A 档（tier none）响应不含向量字段且结果与今天一致', async () => {
  const svc = createMemoryService({ filePath, vectorsFilePath, tierResolver: () => 'none' });
  await svc.store({ action: 'add', type: 'fact', content: 'abc 关键词', tags: ['t'], importance: 5 }, T);
  const r = await svc.recall({ query: '关键词', limit: 5 }, null, T);
  assert.equal(r.tier, 'none');
  assert.equal(r.vectorMatched, 0);
  assert.equal(typeof embedCalls, 'undefined');   // A 档绝不触碰 provider
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd agent && node --test test/unit/memory-service.unit.test.js`
Expected: 新增 4 条 FAIL，原 25 条 PASS（这条 PASS 就是 A 档未被破坏的证据）。

- [ ] **Step 3: service 注入点与向量融合实现**

`agent/src/memory/service.js` 的 `createMemoryService` 签名与内部装配改为：

```js
import { getMemoryEmbeddingConfig } from './embedding-config.js';
import { createVectorStoreFacade, memoryModelKey, cosine } from './vectors.js';
import { resolveMemoryTier, isVectorTier, MEMORY_VECTOR_THRESHOLD } from './tier.js';
import { isRagAvailable } from '../rag/detect.js';
import { createEmbeddingProvider } from '../rag/embedding/index.js';
import { KEYWORD_BOOST_PER_HIT, SCORE_MAX } from '../rag/searcher.js';

export function createMemoryService({
  filePath = join(MEMORY_DIR, 'global-memory.json'),
  vectorsFilePath,
  embedderFactory = (cfg) => createEmbeddingProvider(cfg),
  tierResolver = (cfg) => resolveMemoryTier(cfg, isRagAvailable()),
  embedTimeoutMs = 8000
} = {}) {
  const vectors = createVectorStoreFacade(vectorsFilePath ? { filePath: vectorsFilePath } : {});
  let cachedProvider = null;
  let cachedProviderKey = '';

  function getProvider() {
    const cfg = getMemoryEmbeddingConfig();
    const key = memoryModelKey(cfg);
    if (cachedProviderKey !== key || !cachedProvider) {
      cachedProvider = embedderFactory(cfg);
      cachedProviderKey = key;
    }
    return { provider: cachedProvider, cfg };
  }

  async function embedWithTimeout(promise) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('embedding_timeout')), embedTimeoutMs); })
      ]);
    } finally { clearTimeout(timer); }
  }
```

`recall` 内部：在现有候选收集之后、排序之前插入向量分支（A 档走原路径）：

```js
      const tier = tierResolver(getMemoryEmbeddingConfig());
      const useVector = isVectorTier(tier);

      let queryVec = null;
      let vectorMatched = 0;
      const vecMap = useVector ? (await vectors.read()).vectors : {};

      if (useVector) {
        try {
          const { provider } = getProvider();
          queryVec = await embedWithTimeout(provider.embedQuery(query || ''));
        } catch (err) {
          console.warn('[Memory] embedQuery failed, degrade to keyword-only:', err.message);
          queryVec = null;
        }
      }

      // 为缺失向量的条目按需补齐（只在本次 recall 批量做一次，不阻塞响应之外的路径）
      if (useVector && queryVec) {
        const missing = candidates.filter(m => !(m.id in vecMap));
        if (missing.length) {
          try {
            const { provider, cfg } = getProvider();
            const vecs = await embedWithTimeout(provider.embedDocuments(missing.map(m => memorySearchText(m))));
            await vectors.upsertVectors(missing.map((m, i) => [m.id, vecs[i]]), memoryModelKey(cfg));
            missing.forEach((m, i) => { vecMap[m.id] = vecs[i]; });
          } catch (err) {
            console.warn('[Memory] vector backfill skipped:', err.message);
          }
        }
      }
```

计分与排序改为：

```js
      const scored = candidates.map(m => {
        const kw = keywordScore(m, keywords, query);          // 现有关键词计分，不改
        let score = kw.score;
        if (queryVec && vecMap[m.id]) {
          const cos = cosine(queryVec, vecMap[m.id]);
          if (cos >= MEMORY_VECTOR_THRESHOLD || kw.hits > 0) {
            const boosted = Math.max(cos, 0) + KEYWORD_BOOST_PER_HIT * kw.hits;
            score = Math.min(
              kw.hits > 0 ? Math.max(boosted, MEMORY_VECTOR_THRESHOLD + 0.2) : boosted,
              SCORE_MAX
            );
            if (boosted >= MEMORY_VECTOR_THRESHOLD) vectorMatched++;
          } else {
            score = 0;   // 语义与词面都不沾 → 排除
          }
        }
        return { ...m, _score: score, _source: 'memory' };
      }).filter(m => m._score > 0).sort(compareMemoryScore);   // 现排序函数：_score 降序 → importance → updatedAt
```

返回值补两个字段（放在现有 `results/total/query` 同层）：

```js
        tier,
        vectorMatched: useVector && queryVec ? vectorMatched : 0,
```

新增两个模块级辅助（与现有关键词逻辑同处，避免重复）：

```js
/** 参与 embedding 的文本：content + title + tags（与关键词通道同一字段面） */
function memorySearchText(m) {
  return [m.content, m.title, (m.tags || []).join(' ')].filter(Boolean).join('\n');
}
```

- [ ] **Step 4: 运行测试**

Run: `cd agent && node --test test/unit/memory-service.unit.test.js`
Expected: 34 条全 PASS（原 25 条即 A 档回归锁，实测 34/34；agent 全量 275/275）。

- [ ] **Step 5: 暴露 backfillVectors 并在响应里带 tier**

`service` 返回对象加 `backfillVectors`（Task 5 测试用到，也是「重建索引」的底座）：

```js
  /** 显式为全部记忆补齐向量（模型变更或新建配置后调用一次） */
  async function backfillVectors(t) {
    const cfg = getMemoryEmbeddingConfig();
    const tier = tierResolver(cfg);
    if (!isVectorTier(tier)) return { success: true, skipped: true, reason: t ? t('memory.embeddingDisabled') : 'disabled' };
    const data = await readAll();
    const items = [...(data.facts || []), ...(data.summaries || [])].filter(m => m?.id);
    if (!items.length) return { success: true, indexed: 0 };
    const { provider } = getProvider();
    const out = [];
    for (let i = 0; i < items.length; i += 10) {
      const batch = items.slice(i, i + 10);
      const vecs = await embedWithTimeout(provider.embedDocuments(batch.map(memorySearchText)));
      batch.forEach((m, j) => out.push([m.id, vecs[j]]));
    }
    await vectors.upsertVectors(out, memoryModelKey(cfg));
    return { success: true, indexed: out.length };
  }
```

- [ ] **Step 6: Commit**

```bash
git add agent/src/memory/service.js agent/test/unit/memory-service.unit.test.js
git commit -m "feat(memory): recall 叠加向量通道并按需补齐缓存，未启用时逐字保持关键词行为"
```

> **执行结果（已实施）。本 Task 的计划与实际代码差异最大，4 处必须改计划本身，请按本节为准：**

> **① 计划假想的 recall 内部结构不存在。**`service.js` 里没有 `keywordScore(m,…) → {score, hits}`、没有 `compareMemoryScore`，`candidates` 之外也没有独立候选池：计分是内联的**整数加权**（content +3 / title +2 / tags +2 / 全文精确 +5+3，随关键词个数累加、无上限），排序只有 `.sort((a,b) => b.score - a.score)`，**没有 importance / updatedAt 次级键**（V8 的 sort 稳定，同分保持文件顺序）。执行时把这段内联计分原样抽成模块级 `keywordScore(m, keywords, originalQuery)`（权重与判定顺序逐字不变），`hits` 概念不存在，融合分支不再依赖它。

> **② 计划的融合公式与记忆侧分值不可比，因此 Task 4 的常量导出已回退。** 计划写 `finalScore = max(cos,0) + KEYWORD_BOOST_PER_HIT * hits` 并封顶 `SCORE_MAX`（0.99）——这是 RAG 的 [0,1] 刻度。直接套到整数分制上，所有条目分数都 < 1，而关键词档动辄 8、13，等于把排序交给浮点噪声；要救回来只能先把关键词分归一化，而那会**改写 A 档计分**，违反本 Task 的硬约束。最终改法是保持整数尺子：
> `score = kwScore + (cos >= MEMORY_VECTOR_THRESHOLD ? VECTOR_HIT_BONUS + Math.round(cos * VECTOR_SCALE_POINTS) : 0)`，其中 `VECTOR_HIT_BONUS = 3`（达阈值先保底一次 content 命中的权重）、`VECTOR_SCALE_POINTS = 4`（cos=1 时合计 7 ≈ content+title+tags 同时命中）。语义与词面都不沾的条目仍为 0 分被排除。
> 因此 Task 4 为「复用」而给 `rag/searcher.js` 加的 4 个 `export` 已回退成私有：没有消费方的导出只会留下幻影耦合。真正的同口径只保留一处——`MEMORY_VECTOR_THRESHOLD` 仍引用 `rag/config.js` 的 `DEFAULT_SEARCH_CONFIG.threshold`。

> **③ 注入点必须补 `embeddingConfigProvider`。** 计划版在单测里调用真实 `getMemoryEmbeddingConfig() → loadConfig()`，等于让 agent 单测去读用户机器上的 `~/.ai-helper-agent/config.json`：一旦用户真的配好了 embedding，modelKey/provider 行为会随用户配置漂移，测试不可重放。`ragAvailableProvider` 则取消——`tierResolver` 的缺省实现已经包住 `isRagAvailable()`，两个入口只会多出一个不一致的面。

> **④ 嵌入调用挪到取锁之前。** 计划把 `embedQuery` 写在 `withMemoryLock` 内部：记忆锁是进程内 Promise 链，一次 8 秒超时的 embedding 请求会把同进程所有 store/manage 写入一起堵死。现在档位判定 + 查询向量在锁外算完（`fused = queryVec !== null`），锁内只做纯计算与向量缓存读写。条目向量的按需补齐仍在锁内（它是 fs 写入且每条记忆一生最多一次）。

> **零漂移护栏的实际写法：**`if (keywords.length > 0 && !fused) { 原路径逐字保留 } else if (fused) { 融合 }`。所以 provider 抛错、`embedderFactory` 本身抛错、8 秒超时这三种情况下 `fused` 都是 false，走的正是今天这段代码——最坏情况等于没开向量，不会更差（3 条用例分别验证）。`fused` 为真但关键词切不出来时，语义达阈值的条目仍能单独命中（A 档拿不到的增量）。

> **测试辅助与计划不符：** 真实文件用 `describe/it` 与 `withService(fn)`（临时目录注入 filePath），不是计划里的顶层 `test()` + `svc()`；新增向量用例配套 `withVectorService(opts, fn)`。计划第 4 条的 `assert.equal(typeof embedCalls, 'undefined')` 是恒真断言（该标识符在计划里从未定义），换成两件事：provider 工厂计数器必须为 0，以及 A 档不得生成 `memory-vectors.json`。用例按计划 4 条，落地 **9 条**：另补 embedderFactory 抛错、无 query 不做向量、按需补齐只发生一次、modelKey 变更整体作废、删除条目的向量孤儿不影响结果。

> **`backfillVectors` 实现细节修正：** 计划版用 `await readAll()`（该方法失败会抛）拿数据，但执行时先照抄了 `readMemoryFile()` 的返回值——它返回的是 `{success, data}` 包装，`data.facts` 恒 undefined，于是 `indexed` 永远是 0；跑红后改为取 `.data`。分批大小用 `EMBED_BATCH_SIZE`（10，兼容阿里云百炼单次批量上限 10 条）而非硬编码，单批失败只记录不中断（能建多少算多少，剩下的 recall 时补）。A 档返回 `{success:true, skipped:true, reason: t('memory.embeddingDisabled')}`。

**回归证据：agent 全量 266 → 275 passed / fail 0**（原 25 条记忆 service 用例一条未改、一条未红，即 A 档零漂移）。扩展端本 Task 未改动。

---

### Task 6: 生命周期一致性与 reindex 端点

**Files:**
- Modify: `agent/src/memory/service.js`（store/delete 与 compact 的向量同步 + 懒补）
- Modify: `agent/src/memory/routes.js`（新增 `POST /api/memory/reindex`）
- Test: `agent/test/unit/memory-service.unit.test.js` + `agent/test/unit/memory-routes.unit.test.js`

**Interfaces:**
- Produces: `POST /api/memory/reindex` → `{ success, indexed }` 或 `{ success: true, skipped: true, reason }`
- 不变量：**每条记忆至多一个向量；删掉/淘汰的记忆不得残留向量**

- [ ] **Step 1: 写失败测试**

`agent/test/unit/memory-service.unit.test.js` 追加：

```js
test('store(add) 后向量懒补：不阻塞响应且完成后落盘', async () => {
  const svc = createMemoryService({ filePath, vectorsFilePath, tierResolver: () => 'none' });
  const r = await svc.store({ action: 'add', type: 'fact', content: 'c', tags: [], importance: 5 }, T);
  assert.ok(r.success && r.memory.id);      // 响应不携带向量工作成果，立即返回
  assert.deepEqual((await vectorStore.read()).vectors, {});   // none 档根本不写
});

test('delete 同步摘除向量', async () => {
  const svc = createMemoryService({ filePath, vectorsFilePath, tierResolver: () => 'remote', embedderFactory: () => fakeProvider });
  await svc.store({ action: 'add', type: 'fact', content: 'gone', tags: [], importance: 5 }, T);
  await svc.backfillVectors(T);
  const before = (await vectorStore.read()).vectors;
  assert.ok(Object.keys(before).length >= 1);
  const id = Object.keys(before)[0];
  await svc.store({ action: 'delete', memoryId: id }, T);
  assert.ok(!(id in (await vectorStore.read()).vectors));
});

test('compact 淘汰项同步摘除向量', async () => {
  // 构造 value<10 的低价值条目 + 其向量，跑 manage({action:'compact'}) 后断言向量已被摘除
});
```

`agent/test/unit/memory-routes.unit.test.js` 追加 reindex 一例：注入 `service: { ...stub, backfillVectors: async () => ({ success: true, indexed: 3 }) }`，`POST /api/memory/reindex` 断言 200 且 `indexed === 3`。

- [ ] **Step 2: 运行确认失败**

Run: `cd agent && node --test test/unit/memory-service.unit.test.js test/unit/memory-routes.unit.test.js`
Expected: 新增用例 FAIL。

- [ ] **Step 3: 生命周期接线**

`service.js`：
- `store` 的 `add`/`update` 成功分支：在 `return` 之前挂**不 await** 的补向量（失败只 warn，绝不影响响应）：

```js
        if (isVectorTier(tierResolver(getMemoryEmbeddingConfig()))) {
          queueMicrotask(() => backfillOne(newMemory.id, memorySearchText(newMemory)).catch(err =>
            console.warn('[Memory] lazy vector backfill failed:', err.message)));
        }
```

  配一个内部函数：

```js
  async function backfillOne(id, text) {
    const cfg = getMemoryEmbeddingConfig();
    const { provider } = getProvider();
    const [vec] = await embedWithTimeout(provider.embedDocuments([text]));
    await vectors.upsertVectors([[id, vec]], memoryModelKey(cfg));
  }
```

- `store` 的 `delete` 分支成功后：`await vectors.dropVectors([memoryId]);`
- `manage` 的 `compact` 分支：在已有 `removeFromRecalledCache(id)` 的同一循环里收集 `compactRemoved`，收尾一次 `await vectors.dropVectors(compactRemoved);`
- `update` 分支成功后：同 add，对该 id 重算向量（内容变了）。

`routes.js` 的 `ROUTE_METHODS` 加：

```js
  reindex: 'backfillVectors'
```

并在分发里按现有 `manage` 的调用形态接入（`t` 作为最后一个参数已具备）。

- [ ] **Step 4: 运行全部 Agent 测试**

Run: `cd agent && node --test test/unit/*.unit.test.js`
Expected: `fail 0`（实测 287 passed / fail 0；本 Task 新增 8 条 service + 4 条 routes）。

- [ ] **Step 5: Commit**

```bash
git add agent/src/memory/service.js agent/src/memory/routes.js agent/test/unit/memory-service.unit.test.js agent/test/unit/memory-routes.unit.test.js
git commit -m "feat(memory): 向量与记忆生命周期对齐（懒补/删除/淘汰摘除）并新增 reindex 端点"
```

> **执行结果（已实施）。4 处与计划不同：**
> 1. **`reindex` 不能靠现有的通用分发分支。**`ROUTE_METHODS` 的兜底调用形态是 `service[method](body, t)`，而 `backfillVectors(t)` 的第一个参数是翻译函数——直接映射会把请求体当成 `t`。已按 `injectSelect` 的先例加显式分支 `service.backfillVectors(t)`（不接请求体）。
> 2. **懒补的实现形态：**计划给的代码在 `getMemoryEmbeddingConfig()` 上直接取配置，执行时改用 Task 5 引入的 `embeddingConfigProvider` 注入点（否则单测里的懒补用例会去读用户真实 `config.json`）。档位判定与 `cfg` 在 `queueMicrotask` 之前算完，微任务内只做嵌入与落盘，两处各自 try/catch——`getProvider()` 同步抛错也不会变成 unhandled rejection。
> 3. **去重命中（`add` 转 `update`）也要懒补**：计划的接线清单只列了 add/update/delete/compact，但该分支会改写 `duplicate.tags`，而 tags 参与 embedding 文本，不重算就留下陈旧向量。已一并接上。
> 4. **`dropVectors` 在 delete/compact 里是 await 的（不懒删）**：这两处只涉及 fs 写、没有网络调用，留在记忆锁内反而能保证「真源删了、缓存也删了」在同一个临界区内完成；懒删会开出一段`向量已摘除但响应还没返回`的空窗，测试也无法确定时序。

用例按计划 3 条（其中第 3 条在计划里是空壳注释），落地 **8 条 service + 4 条 routes**：补了「懒补失败不留半成品文件」「delete 未落向量的条目不报错」「update 不存在的 id 不触发嵌入」「reindex 只接受 POST」「reindex 的 `skipped` 仍是 200」「嵌入整体失败才 400」。`EMBED_CFG` 与 `withVectorService` 从 Task 5 的 `describe` 内提到模块级，两个 describe 共用同一套注入辅助。

**不变量已验证：每条记忆至多一个向量（update 同 id 覆盖）、删除与压缩淘汰后不残留向量。**Agent 全量 275 → 287 passed / fail 0。

---

### Task 7: 转发层透传、文档与端到端冒烟

**Files:**
- Modify: `src/shared/locales/zh.json` / `en.json` 或 `src/background/tool-memory.js` 的 `toolMemory` 命名空间（若需要展示 tier 提示）
- Modify: `agent/README.md` / `agent/README.zh-CN.md`（「长期记忆」章节补 Tier 说明与新端点）
- Modify: wiki `Agent-Service` 中英、`Core-Features` 中英
- Modify: `agent/test/smoke/memory-pushdown.smoke.mjs`（追加向量档冒烟，用 fake provider，绝不真连外部 embedding）
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 确认扩展端零改动的透传**

Run: `grep -n "const { success, error, httpStatus, message, ...rest } = resp" src/background/tool-memory.js`
Expected: 命中一行——`tier` / `vectorMatched` 随 `...rest` 自动透传，转发层无需改动。若该解构已丢失（被后续改动破坏），先恢复再往下走。

- [ ] **Step 2: 冒烟脚本加向量档（假 provider）**

在 smoke 脚本里以临时 HOME 的 config.json 写入 `memoryEmbedding: { enabled: true, mode: 'openai-compat', apiKey: 'sk-fake', modelName: 'fake', dimensions: 3 }`，并把 `embedderFactory` 通过测试替身注入不可行（真实进程），因此本步改为**验证降级**：配置一个不可达的 `baseUrl`，断言 `POST /api/memory/recall` 仍 200 且 `tier === 'remote'`、结果非空（说明 embedding 失败安全回落），并断言 `POST /api/memory/reindex` 返回 `success: true`（fake 端点失败时也是 skipped/成功不抛）。

真连 provider 的正向验证由单测（Task 5 的 fakeProvider 用例）承担，冒烟只验「不可达时不影响 recall」这条运维最关心的性质。

Run: `node agent/test/smoke/memory-pushdown.smoke.mjs`
Expected: 全 PASS（含新增 2 项）。

- [ ] **Step 3: 文档同步**

- README 中英「长期记忆」章节：端点小节补 `POST /api/memory/reindex`、`GET|POST /api/memory/embedding-config`、`POST /api/memory/test-embedding`；并在「召回计分」后加一段 Tier A/B/C 说明（缺省 A 档；配置远端 embedding 升 B；装了 RAG 依赖且用本地模型为 C；embedding 失败自动回落 A）。
- wiki 同步同样内容，跑 `bash scripts/sync-wiki-to-gitee.sh` 推 Gitee 镜像。
- CHANGELOG 新增小节 `### 新增（记忆语义召回通道）`。

- [ ] **Step 4: 全量回归**

Run: `cd agent && node --test test/unit/*.unit.test.js`，回到根目录 `npx vitest run && npm run build:silent`
Expected: Agent `fail 0`；扩展与基线一致；`BUILD_SUCCESS`。

- [ ] **Step 5: Commit**

```bash
git add agent/README.md agent/README.zh-CN.md CHANGELOG.md agent/test/smoke/memory-pushdown.smoke.mjs docs/superpowers/plans/2026-10-13-memory-hybrid-recall.md
git commit -m "docs(memory): 语义召回通道文档、冒烟降级验证与 changelog"
```

> **执行结果（已实施）** —— Step 1 按计划通过（`tool-memory.js:85` 的 `...rest` 透传仍在，`tier`/`vectorMatched` 自动出现在工具结果里），**因此 locales 与转发层均未改动**：计划 Files 里列的 `zh.json`/`en.json` 一项是条件性的（「若需要展示 tier 提示」），而本任务不引入新 UI，未做。实际落地与计划的三处偏差：
>
> 1. **Step 2 的 `reindex` 预期错了**：计划要求「断言 `POST /api/memory/reindex` 返回 `success: true`（fake 端点失败时也是 skipped/成功不抛）」，但 `skipped` 只在**档位不是向量档**时才返回；配置已启用而端点不可达时走的是全量嵌入失败路径，Task 6 的实现返回 `{success:false, indexed:0, error}` → HTTP **400**。冒烟按实现断言 400，并把「明确失败而不是 500」作为真正的运维性质。
> 2. **冒烟挖出一个计划里没有、且会使 Tier B 完全不可用的真缺陷**：`memoryEmbedding` 配置面用 `baseUrl`，而 `rag/embedding/openai-compat.js` 读的是 `config.endpoint`（`rag/config.js` 的字段名）。两边从未对接过 → `endpoint` 永远为空 → `fetch('/embeddings')` → `Failed to parse URL from /embeddings`，**对任何真实端点 100% 失败**。单测看不见，因为 Task 5/6 全部注入 `embedderFactory`/`createProvider` 假工厂；只有走真实工厂的冒烟能暴露。
>    修正：`embedding-config.js` 新增单点出口 `toEmbeddingProviderConfig(cfg)`（`baseUrl` ⇄ `endpoint` 双向归一），service 的 `getProvider()` 与 routes 的 `test-embedding` 两个创建点都过它。映射放在**调用工厂之前**而不是默认工厂内部，这样注入的假工厂也能观察到，新加了 3 条单测钉住（纯函数 1 + routes 1 + service 1）。冒烟额外断言错误文案**不得**是 `Failed to parse URL`，防止以后再退回到静默不可用。
> 3. **wiki 同步未执行**：Step 3 的 `bash scripts/sync-wiki-to-gitee.sh` 会向 Gitee 远端推送，与本轮「暂不推，用户说了再推」的指示冲突，所以未跑；`.wiki-check/` 下的 `Agent-Service`/`Core-Features` 中英同步也一并待命。
>
> 冒烟从 16 项增至 **21 项**（配置脱敏、不可达时 recall 降级、不留半成品向量文件、reindex 400、test-embedding 400），全 PASS。Agent 全量 287 → **290 passed / fail 0**。
>
> Step 5 拆成两次提交（仓库 `git log` 是一目的一个的 conventional commit 风格，把行为修复和文档拧成一坨会看不清）：`fix(memory)` 带映射 + 3 条单测 + 冒烟，`docs(memory)` 带 README 中英 + CHANGELOG + 本计划写回。

## Self-Review 检查点

- **覆盖度**：三级降级（none/remote/local）、依赖缺失自动降级、JSON 真源 + 向量派生、apiKey 脱敏、超时保护、生命周期一致性、reindex、文档——逐条有 Task 承接。
- **A 档零漂移**：Task 5 Step 2 明确要求「原 25 条 service 测试保持 PASS」，并把「未启用时不触碰 provider」写成断言（`embedderFactory` 不被调用）。
- **类型一致性**：`createVectorStoreFacade` 暴露 `read/write/upsertVectors/dropVectors`；service 只用后三者与 `read`；`memoryModelKey` 在两处（vectors.js 定义、service.js 使用）同名同签名；`resolveMemoryTier(cfg, ragAvailable)` 的 `ragAvailable` 由 `tierResolver` 默认实现内部注入，调用点不传第二参——实施时不要改成必传。
- **未决风险（需在实施中确认，不可臆测）**：`agent/src/config.js` 是否已导出 `MEMORY_DIR`（service.js 现有 import 处即真源）；`searcher.js` 是否已有可对齐的向量阈值常量名称。两处都在 Task 3/Task 4 第一步要求先读现有代码再落笔。
- **成本**：每次 `store` 触发一次 embedDocuments、每次 `recall` 一次 embedQuery；默认关闭，开启后由用户承担。批量补按 10 条分批（沿用 `EMBED_BATCH_SIZE`）。
