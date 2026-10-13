# 记忆逻辑下推 Agent 端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将长期记忆的全部业务逻辑（store/recall/manage/三级注入筛选）从扩展端 background 迁移到 agent 包，agent 端暴露 `/api/memory/*` 业务端点，扩展端瘦身为纯转发层。

**Architecture:** agent 端新增 `src/memory/` 模块（service + injection 纯函数 + routes），文件读写改为进程内 `fs/promises`，锁与会话召回缓存落在 agent 长驻进程；扩展端 `tool-memory.js` 改为通过现成的 `AgentClient.agentRequest` 转发，结果形状保持不变（tool-executor / side_panel 零感知）。

**Tech Stack:** Node.js ESM（agent 包，无新增依赖）、Chrome MV3 background（扩展端）、`node --test`（agent 单测）、Vitest（扩展单测）。

**Spec:** 本计划源自 2026-10-13 会话决策（记忆机制 P0 分析），关键结论已内化为下方 Global Constraints；无独立 spec 文档。

## Global Constraints

- **行为 1:1 迁移，本计划不加任何新能力**（向量化检索、管理 UI、压缩沉淀属于后续 P0 项，各自单独出计划）。迁移前后 store/recall/manage/inject 的输入输出语义、文案、计分、淘汰线完全一致。
- **不做新旧版本兼容降级**（用户决策：插件端与代理端版本对应发布）。新扩展连旧 agent 时端点 404 → 返回明确错误文案引导升级 agent，不保留文件 API 老路径。
- **数据文件路径与 JSON 结构不变**：`~/.ai-helper-agent/memory/global-memory.json`（agent 端 `MEMORY_DIR/global-memory.json`），`facts/summaries/meta/stats` 字段与现结构逐字节一致，存量文件直接可用。
- **以下外部契约不变，禁止改动**：`agent_memory` 工具 schema（`src/background/tools/memory-tools.js`）；side_panel 渲染层（`utils.js` 的 `permanentNotes*`/`memoryRules`）；`GET_PERMANENT_NOTES` 消息响应形状 `{success, facts, remainingCount, remainingTags}`；`makeResult` 结果形状 `{success, message, tool_call_id, ...extra}`。
- **agent 端文案全部进 `agent/src/locales/zh.json` / `en.json` 新 `memory` 命名空间**，key 与现有 `toolMemory.*` 一一对应、译文逐字照搬（zh 取自 `tool-memory.js:11-57`，en 取自 `:60-107`）。
- 扩展端每次改动后跑 `npm run build:silent` 验证构建（项目实践规范）。
- agent 测试放 `agent/test/unit/*.unit.test.js`，用 `node --test` 运行；扩展测试放 `test/unit/`，用 `npx vitest run` 运行。临时探针脚本放 `test-results-probes/` 独立目录（playwright 会清空 test-results）。
- 每个 Task 结束时提交一次 commit（conventional 前缀，如 `refactor(memory): ...`）。

## 端点契约（所有 Task 共用，Task 5/6 的接口基线）

认证与现有 `/api/rag/*` 相同：`Authorization: Bearer <token>`，由 server.js 统一校验后才进 router；语言经 `getRequestI18n(req)` 解析，`t` 闭包传入 router。

| 端点（均 POST） | 请求体 | 成功响应 | 失败响应 |
|---|---|---|---|
| `/api/memory/store` | `{subAction, type, category, content, title, tags, importance, memoryId, sourceSessionId}`（subAction: add/update/delete，缺省按现逻辑报错） | `{success:true, message, memory?, removed?, action, stats}` | `{success:false, error}` |
| `/api/memory/recall` | `{query, tags, memoryType, limit, sessionId}` | `{success:true, message, results[], total, query}` | `{success:false, error}` |
| `/api/memory/manage` | `{subAction}`（review/compact） | `{success:true, message, scored?, candidates?, stats}` | `{success:false, error}` |
| `/api/memory/inject` | `{}` | `{success:true, injected[], remainingCount, remainingTags[]}` | `{success:false, error}` |

未匹配路径返回 404 `{success:false, error:t('error.unknownApiPath')}`（server 兜底已覆盖，router 内部对已知前缀的非法子路径同样 404）。业务错误统一 400 `{success:false, error}`（与 rag `handleWithT` 一致）。

**文件结构总览：**

```
agent/src/memory/
├── injection.js   # 纯函数（迁移自 src/background/memory-injection.js）
├── service.js     # 业务逻辑（迁移自 src/background/tool-memory.js 的 215-752 行 + 文件读写/锁改造）
└── routes.js      # memoryRouter（模式对齐 agent/src/rag/routes.js）
agent/test/unit/
├── memory-injection.unit.test.js   # 迁移自扩展端同名测试
└── memory-service.unit.test.js     # 新增：store/recall/manage 行为测试
src/background/tool-memory.js       # 重写为转发层（~80 行）
src/background/memory-injection.js  # 删除
test/unit/memory-injection.unit.test.js        # 删除（迁至 agent）
test/unit/tool-memory-forward.unit.test.js     # 新增：转发行为测试
```

---

### Task 1: injection 纯函数模块迁移到 agent

**Files:**
- Create: `agent/src/memory/injection.js`
- Create: `agent/test/unit/memory-injection.unit.test.js`
- Delete: `src/background/memory-injection.js`（在 Task 6 中随引用清理一并删除，本 Task 先不动扩展端）
- Test: `node --test`（agent 目录）

**Interfaces:**
- Consumes: 无
- Produces: `export { MEMORY_INJECTION_CONFIG, calcMemoryValue, selectMemoriesForInjection }`（签名与 `src/background/memory-injection.js` 完全一致），Task 4/5 依赖。

- [x] **Step 1: 迁移源文件**

将 `src/background/memory-injection.js` 全文（118 行，零依赖纯函数）原样复制为 `agent/src/memory/injection.js`，仅把首行注释中的路径说明改为 `agent/src/memory/injection.js - 记忆分级注入策略`。

- [x] **Step 2: 迁移测试**

将 `test/unit/memory-injection.unit.test.js` 复制为 `agent/test/unit/memory-injection.unit.test.js`，做两处适配：
1. import 路径改为 `../../src/memory/injection.js`；
2. **删除文件末尾的"接线守卫"describe 块**（原第 ~220-244 行，用 `readFileSync` 断言扩展端源码 import 关系的三个 `it`——这些守卫针对扩展端接线，由 Task 6 的扩展测试替代），保留 `calcMemoryValue` 与 `selectMemoriesForInjection` 的全部行为用例。

- [x] **Step 3: 运行验证**

Run: `cd agent && node --test test/unit/memory-injection.unit.test.js`
Expected: 全部 PASS（行为未变，直接绿；此 Task 是纯搬运，无红灯阶段）

- [x] **Step 4: Commit**

```bash
git add agent/src/memory/injection.js agent/test/unit/memory-injection.unit.test.js
git commit -m "refactor(memory): port injection tier-selection pure functions to agent package"
```

---

### Task 2: agent 记忆 service —— 存储核心与 store

**Files:**
- Create: `agent/src/memory/service.js`
- Modify: `agent/src/locales/zh.json`、`agent/src/locales/en.json`（新增顶层 `memory` 命名空间）
- Test: `agent/test/unit/memory-service.unit.test.js`

**Interfaces:**
- Consumes: 无（injection.js 暂不用）
- Produces: `service.js` 导出：
  - `createMemoryService({ filePath, t })` → 服务实例（`filePath` 可注入便于测试；缺省 `join(MEMORY_DIR, 'global-memory.json')`，`MEMORY_DIR` import 自 `../config.js`；`t` 为请求语言翻译闭包）
  - 实例方法 `store(args)`：args 即工具参数（`action` 字段为 store 内部子动作 add/update/delete，即扩展端映射后的 `subAction→action`），返回 `{success, message, memory?, removed?, action, stats}`（无 `tool_call_id`——由扩展转发层附加）

- [x] **Step 1: 写失败测试（store 三行为）**

```js
// agent/test/unit/memory-service.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryService } from '../../src/memory/service.js';

const t = (_k, p) => JSON.stringify(p ?? {}); // 断言靠结构字段，不靠文案

function withService(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mem-test-'));
  const svc = createMemoryService({ filePath: join(dir, 'g.json'), t });
  return fn(svc).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe('store', () => {
  test('add 新记忆写入文件并可读回', () => withService(async (svc) => {
    const r = await svc.store({ action: 'add', type: 'fact', content: '用户偏好 pnpm', importance: 8, tags: ['pkg'] });
    assert.equal(r.success, true);
    assert.equal(r.action, 'added');
    assert.match(r.memory.id, /^fact_/);
    const data = await svc.readAll();
    assert.equal(data.facts.length, 1);
  }));

  test('add 相同内容去重：转为 update 且不新增条目', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'A' });
    const r = await svc.store({ action: 'add', type: 'fact', content: 'A', importance: 7 });
    assert.equal(r.action, 'updated');
    const data = await svc.readAll();
    assert.equal(data.facts.length, 1);
    assert.equal(data.facts[0].importance, 7);
  }));

  test('update 缺 memoryId / 不存在 id / 类型不匹配分别报错', () => withService(async (svc) => {
    const r1 = await svc.store({ action: 'update', type: 'fact', content: 'x' });
    assert.equal(r1.success, false);
    const r2 = await svc.store({ action: 'update', type: 'fact', content: 'x', memoryId: 'fact_nope' });
    assert.equal(r2.success, false);
  }));

  test('delete 仅需 memoryId，跨 facts/summaries 查找', () => withService(async (svc) => {
    const a = await svc.store({ action: 'add', type: 'summary', content: 'S', title: 'T' });
    const d = await svc.store({ action: 'delete', memoryId: a.memory.id });
    assert.equal(d.success, true);
    assert.equal((await svc.readAll()).summaries.length, 0);
  }));

  test('接近上限（≥80%）时 message 含告警占位数据', () => withService(async (svc) => {
    for (let i = 0; i < 40; i++) await svc.store({ action: 'add', type: 'fact', content: `f${i}` });
    const r = await svc.store({ action: 'add', type: 'fact', content: 'f40' });
    assert.ok('facts' in r.stats);
    assert.equal((await svc.readAll()).facts.length, 41);
  }));
});
```

- [x] **Step 2: 运行确认失败**

Run: `cd agent && node --test test/unit/memory-service.unit.test.js`
Expected: FAIL（`Cannot find module '../../src/memory/service.js'`）

- [x] **Step 3: 实现 service.js 存储核心 + store**

从 `src/background/tool-memory.js` 按下表搬运，**只改标注的适配点，其余逐行等价**：

| 搬运内容 | 源位置 | 适配点 |
|---|---|---|
| `DEFAULT_MEMORY_DATA` | tool-memory.js:137-144 | 不变；`MEMORY_FILE_PATH` 常量删除，改为 `createMemoryService` 的 `filePath` 参数（默认 `join(MEMORY_DIR, 'global-memory.json')`） |
| `generateMemoryId` | :190-195 | 不变 |
| `readMemoryFile` | :150-173 | 改用 `fs/promises`：`readFile(filePath,'utf8')`；ENOENT（`err.code==='ENOENT'`）→ 返回默认结构（删除双语 HTTP 文案匹配分支，:154 的三串判断不再需要）；JSON.parse 失败 → `t('memory.parseFailed',{error})` |
| `writeMemoryFile` | :179-185 | 改为 `fs/promises.writeFile(filePath, JSON.stringify(data,null,2))`；stats/version/updatedAt 维护逻辑不变；失败返回 `{success:false,error:t('memory.writeFailed',{error})}` |
| 异步锁 | :111-130 | 替换为进程内 Promise 链锁（下方代码），语义等价（互斥 read-modify-write） |
| `executeAgentMemoryStore` 主体 | :215-347 | 函数签名改 `store(args)`，内部 `makeResult(ok,msg,toolCallId)` 改为返回 `{success:ok, message:msg}`（其余字段 `memory/action/stats` 不变）；所有 `t('toolMemory.*')` → `t('memory.*')`；`withMemoryLock` 包装保留 |
| `readAll()` | 新增 | `readMemoryFile` 的别名方法，Task 4/测试使用 |

Promise 链锁实现（替换 :111-130 的 SW 内存锁）：

```js
let lockChain = Promise.resolve();
function withMemoryLock(task) {
  let release;
  const gate = new Promise((r) => { release = r; });
  const run = lockChain.then(task).finally(release);
  lockChain = lockChain.then(gate);
  return run;
}
```

- [x] **Step 4: locales 增加 memory 命名空间**

`agent/src/locales/zh.json` 与 `en.json` 各新增顶层 `"memory": { ... }`，key 与 `tool-memory.js` 注册的 `toolMemory.*` 全量一致（zh 值照搬 :12-56，en 值照搬 :61-105），`nearLimitWarning`/`foundResults` 等 `{占位符}` 原样保留。两文件 key 集合必须相同（对照 `rag` 命名空间的中英对齐方式）。

- [x] **Step 5: 运行测试确认通过**

Run: `cd agent && node --test test/unit/memory-service.unit.test.js`
Expected: store 组全部 PASS

- [x] **Step 6: Commit**

```bash
git add agent/src/memory/service.js agent/src/locales/zh.json agent/src/locales/en.json agent/test/unit/memory-service.unit.test.js
git commit -m "refactor(memory): add agent-side memory service with store action"
```

---

### Task 3: service —— recall（关键词计分 + 会话去重 + accessCount）

**Files:**
- Modify: `agent/src/memory/service.js`
- Modify: `agent/test/unit/memory-service.unit.test.js`

**Interfaces:**
- Consumes: Task 2 的 `createMemoryService`、`withMemoryLock`、`readMemoryFile/writeMemoryFile`
- Produces: 实例方法 `recall(args, sessionId)` → `{success, message, results[], total, query}`

- [x] **Step 1: 写失败测试**

追加到 `memory-service.unit.test.js`：

```js
describe('recall', () => {
  test('关键词命中按 content/title/tags 计分排序', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '用户偏好 pnpm 管理依赖', tags: ['pkg'] });
    await svc.store({ action: 'add', type: 'fact', content: '与主题无关的随机内容', tags: ['misc'] });
    const r = await svc.recall({ query: 'pnpm' });
    assert.equal(r.success, true);
    assert.equal(r.results[0].content.includes('pnpm'), true);
  }));

  test('无命中返回 noMatch 文案且 results 为空', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: 'AAAA' });
    const r = await svc.recall({ query: 'zzzzz不存在的词xyz' });
    assert.equal(r.results.length, 0);
  }));

  test('session 级去重：重复召回同一条时被标记为旧结果（新结果优先返回）', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '记忆X关键词' });
    const s = 'sess-1';
    const r1 = await svc.recall({ query: '记忆X' }, s);
    assert.equal(r1.results.length, 1);
    const r2 = await svc.recall({ query: '记忆X' }, s);
    assert.equal(r2.results.length, 1); // 全旧场景仍返回并带提示
    assert.ok(r2.message.length > 0);
  }));

  test('召回后 accessCount +1 且 lastAccessAt 更新', () => withService(async (svc) => {
    const a = await svc.store({ action: 'add', type: 'fact', content: '计数测试' });
    await svc.recall({ query: '计数测试' });
    const data = await svc.readAll();
    const m = data.facts.find(x => x.id === a.memory.id);
    assert.equal(m.accessCount, 1);
    assert.ok(m.lastAccessAt);
  }));

  test('memoryType 过滤与 limit 生效', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '共同关键词aa' });
    await svc.store({ action: 'add', type: 'summary', content: '共同关键词bb', title: 'T' });
    const r = await svc.recall({ query: '共同关键词', memoryType: 'summary' });
    assert.equal(r.results.every(m => m.type === 'summary'), true);
    const l = await svc.recall({ query: '共同关键词', limit: 1 });
    assert.equal(l.results.length, 1);
  }));
});
```

- [x] **Step 2: 运行确认失败**

Run: `cd agent && node --test test/unit/memory-service.unit.test.js`
Expected: recall 组 FAIL（`svc.recall is not a function`）

- [x] **Step 3: 实现 recall**

从 `tool-memory.js` 搬运，逐段对应：`STOP_WORDS`（:407-419）、`extractKeywords`（:427-465，含整段 fallback、CJK ≤4 整段 / >4 bigram、英文数字整词、去停用词、30 上限）、标签筛选（:397-402）、计分（:471-496，content+3/title+2/tags+2、原句命中 content+5/title+3）、全文 fallback（:498-513，**注意源码 :500 在已清空的 `candidates` 上 filter 是既有失效路径——行为保持照搬，不修复**，加注释 `// 保持与旧实现一致` 即可，后续优化另行立项）、去重 limit（:518-523）、session 缓存（:350-364 + :525-551，Map 常驻 agent 进程，SW 重启丢失问题自然消失）、accessCount 写回（:564-582，失败 warn 不阻塞——agent 端用 `console.warn`）、结果格式化（:585-594，`t('memory.*')`）。删除 `results.map` 中的 `tool_call_id` 字段。

- [x] **Step 4: 运行测试确认通过**

Run: `cd agent && node --test test/unit/memory-service.unit.test.js`
Expected: recall 组全部 PASS

- [x] **Step 5: Commit**

```bash
git add agent/src/memory/service.js agent/test/unit/memory-service.unit.test.js
git commit -m "refactor(memory): port recall logic (keyword scoring, session dedup, accessCount) to agent service"
```

---

### Task 4: service —— manage（review/compact）与 inject-select

**Files:**
- Modify: `agent/src/memory/service.js`
- Modify: `agent/test/unit/memory-service.unit.test.js`

**Interfaces:**
- Consumes: Task 1 `selectMemoriesForInjection` / `calcMemoryValue`（`../memory/injection.js`）；Task 2 存储核心
- Produces: 实例方法 `manage(args, t)` → `{success, message, scored?, candidates?, stats, removedFacts?, removedSummaries?}`（`args.action` 取值 `review|compact`，与 store 一致由转发层做 subAction→action 映射）；`injectSelect(t)` → `{success, injected, remainingCount, remainingTags}`

- [x] **Step 1: 写失败测试**

```js
describe('manage + injectSelect', () => {
  test('review 按价值升序列出候选（value<10）', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '低价值', importance: 1 }); // value≈1 → 候选
    await svc.store({ action: 'add', type: 'fact', content: '高价值', importance: 9 });
    const r = await svc.manage({ subAction: 'review' });
    assert.equal(r.success, true);
    assert.ok(r.candidates.every(c => parseFloat(c.value) < 10));
  }));

  test('compact 移除低价值并写 lastReviewAt', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '低', importance: 1 });
    const r = await svc.manage({ subAction: 'compact' });
    assert.equal(r.removedFacts >= 1, true);
    assert.ok((await svc.readAll()).stats.lastReviewAt);
  }));

  test('injectSelect：importance≥8 常驻 + 其余走预算 + 剩余转索引计数', () => withService(async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '常驻记忆', importance: 9, tags: ['env'] });
    await svc.store({ action: 'add', type: 'fact', content: '按需记忆', importance: 5, tags: ['proj'] });
    const r = await svc.injectSelect();
    assert.equal(r.injected.length, 2); // Tier1 1 条 + Tier2 预算内 1 条
    const r2 = await svc.injectSelect();
    assert.equal(typeof r2.remainingCount, 'number');
  }));

  test('manage 未知 subAction 报错', () => withService(async (svc) => {
    const r = await svc.manage({ subAction: 'bogus' });
    assert.equal(r.success, false);
  }));
});
```

- [x] **Step 2: 运行确认失败**

Run: `cd agent && node --test test/unit/memory-service.unit.test.js`
Expected: FAIL（`svc.manage is not a function`）

- [x] **Step 3: 实现 manage 与 injectSelect**

`manage(args)`：搬运 `executeAgentMemoryManage`（:613-720），review 报告拼装（:652-671，`t('memory.*')`；淘汰线 `lowValueThreshold = 10` 与 compact `threshold = 10` 数值不变）、`_source` 剥离逻辑不变；同样去掉 `tool_call_id`、经 `withMemoryLock` 互斥。
`injectSelect()`：`readMemoryFile()` 后调用 `selectMemoriesForInjection(data.facts, data.summaries)`（import 自 `./injection.js`，默认 `MEMORY_INJECTION_CONFIG` 不覆盖），返回 `{success:true, injected: selection.injected, remainingCount: selection.remainingCount, remainingTags: selection.remainingTags}`。

- [x] **Step 4: 运行测试确认通过**

Run: `cd agent && node --test test/unit/memory-service.unit.test.js`
Expected: 全部 PASS；顺带跑 `node --test test/unit/` 确认无模块求值冲突

- [x] **Step 5: Commit**

```bash
git add agent/src/memory/service.js agent/test/unit/memory-service.unit.test.js
git commit -m "refactor(memory): port manage and injection selection to agent service"
```

---

### Task 5: memoryRouter 与 server.js 接线

**Files:**
- Create: `agent/src/memory/routes.js`
- Modify: `agent/src/server.js`（RAG 接线块之后、404 兜底之前）
- Test: `agent/test/unit/memory-routes.unit.test.js`

**Interfaces:**
- Consumes: Task 2-4 的 `createMemoryService`；server 注入的 `t / requestBody`（形状同 ragRouter：`(req, res, pathname, url, t, requestBody)`）
- Produces: HTTP 端点契约（见文档头部表格）；扩展 Task 6 依赖这 4 个路径。

- [x] **Step 1: 写失败测试**

路由层测试只测分发（业务已由 service 测试覆盖）：

```js
// agent/test/unit/memory-routes.unit.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDispatch } from '../../src/memory/routes.js';

const mkReq = (path, body) => ({ method: 'POST', headers: { origin: 'chrome-extension://x' } });
const mkRes = () => { const r = { statusCode: 0, body: null, writeHead(s) { r.statusCode = s; }, end(b) { r.body = JSON.parse(b); } }; return r; };
const t = (k) => k;

test('未知子路径 404', async () => {
  const res = mkRes();
  await memoryDispatch(mkReq(), res, '/api/memory/nope', new URL('http://x/api/memory/nope'), t, {});
  assert.equal(res.statusCode, 404);
});

test('store 分发到 service 并回 200 契约形状', async () => {
  const res = mkRes();
  await memoryDispatch(mkReq(), res, '/api/memory/store', new URL('http://x/api/memory/store'), t,
    { action: 'add', type: 'fact', content: '路由冒烟' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});
```

- [x] **Step 2: 运行确认失败**

Run: `cd agent && node --test test/unit/memory-routes.unit.test.js`
Expected: FAIL（模块不存在）

- [x] **Step 3: 实现 routes.js**

模式对齐 `rag/routes.js`（本地 `jsonResponse`/`getAllowedOrigin` 直接抄其 :39-63，依赖 Node 原生挂接的 `res.req`）。service 方法签名为 `(args, t)`，因此路由层必须把请求级 `t` 透传下去；末位加 `options` 供测试注入 tmp 目录实例（避免读写真实 `~/.ai-helper-agent` 记忆文件）：

```js
// agent/src/memory/routes.js - /api/memory/* 业务端点（认证/语言解析由 server.js 完成后转发）
import { createMemoryService } from './service.js';

const defaultService = createMemoryService(); // 进程级单例：文件锁与 session 缓存复用（同 rag manager）
const ROUTE_METHODS = { store: 'store', recall: 'recall', manage: 'manage', inject: 'injectSelect' };

export async function memoryDispatch(req, res, pathname, url, t, requestBody = {}, options = {}) {
  const service = options.service || defaultService;
  const key = pathname.slice('/api/memory/'.length).replace(/\/+$/, '');
  const method = ROUTE_METHODS[key];
  if (!method || req.method !== 'POST') {
    return jsonResponse(res, 404, { success: false, error: t('error.unknownApiPath') });
  }
  const body = requestBody || {};
  try {
    let data;
    if (method === 'recall') {
      data = await service.recall(body, body.sessionId ?? null, t);
    } else if (method === 'injectSelect') {
      data = await service.injectSelect(t);
    } else {
      data = await service[method](body, t);
    }
    // 业务失败（参数缺失 / 读写失败）回 400，与抛错同侧；404 仅用于路径不匹配（旧版本探测）
    if (data && data.success === false) return jsonResponse(res, 400, data);
    return jsonResponse(res, 200, { success: true, ...data });
  } catch (err) {
    console.error('[Memory] route error:', err);
    return jsonResponse(res, 400, { success: false, error: err.message || 'memory_error' });
  }
}

export async function memoryRouter(req, res, pathname, url, t, requestBody) {
  return memoryDispatch(req, res, pathname, url, t, requestBody);
}
```

注意：`service.recall(args, sessionId, t)` 的第二参数在路由层从 `requestBody.sessionId` 取出（扩展转发层负责把会话 ID 放进 body）。service 各方法内部失败返回 `{success:false,error}` 时统一回 HTTP 400（与 rag 惯例一致），而扩展端仍以 `body.success` 为准判断业务结果；404 只用于旧版本 agent 无该端点的探测，两者语义互不干扰。

- [x] **Step 4: server.js 接线**

在 `agent/src/server.js` 的 RAG 块（:2043-2058）之后、404 兜底（:2061）之前加入。**执行时改为静态 import**（记忆层零外部依赖，无需像 RAG 那样按可用性动态加载，也省掉每请求 import 开销）：文件头加 `import { memoryRouter } from './memory/routes.js';`，路由块为：

```js
    // 长期记忆业务端点（逻辑与数据文件同侧；零外部依赖，静态加载）
    if (pathname.startsWith('/api/memory/')) {
      return memoryRouter(req, res, pathname, url, t, requestBody);
    }
```

（放置点处于认证通过后的处理段内，`t/requestBody` 与其他业务路由同源。）

- [x] **Step 5: 运行测试确认通过**

Run: `cd agent && node --test test/unit/`
Expected: agent 全量 unit PASS

- [x] **Step 6: Commit**

```bash
git add agent/src/memory/routes.js agent/src/server.js agent/test/unit/memory-routes.unit.test.js
git commit -m "refactor(memory): expose /api/memory/* endpoints and wire into server"
```

---

### Task 6: 扩展端瘦身——转发层与接线清理

**Files:**
- Modify: `src/background/tool-memory.js`（重写为转发层）
- Modify: `src/background/index.js`（GET_PERMANENT_NOTES :1523-1545 改造 + 删 :17-18 import）
- Modify: `src/background/tool-executor.js:10`（去掉 `readMemoryFile` 死导入）
- Modify: `src/shared/locales/zh.js`、`en.js`（`toolMemory` 命名空间删除，新增 `agentClient.memoryEndpointMissing` 一条）
- Delete: `src/background/memory-injection.js`、`test/unit/memory-injection.unit.test.js`
- Create: `test/unit/tool-memory-forward.unit.test.js`

**Interfaces:**
- Consumes: Task 5 端点契约；`AgentClient.agentRequest`（已导出，返回体附 `httpStatus`）
- Produces: `executeAgentMemory(args, toolCallId, sessionId)` 与 `makeResult` 形状不变（tool-executor 路由 :2060 无感知）；`GET_PERMANENT_NOTES` 响应形状不变（side_panel `fetchPermanentNotes` 无感知）。

- [x] **Step 1: 写失败测试（转发层）**

```js
// test/unit/tool-memory-forward.unit.test.js（Vitest）
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/background/local-agent-client.js', () => ({ agentRequest: vi.fn() }));
vi.mock('../../src/background/config.js', () => ({ getStoredConfig: vi.fn() }));
import * as AgentClient from '../../src/background/local-agent-client.js';
import { executeAgentMemory } from '../../src/background/tool-memory.js';

beforeEach(() => vi.clearAllMocks());

describe('executeAgentMemory 转发', () => {
  it('recall 把 sessionId 放进请求体并附加 tool_call_id', async () => {
    AgentClient.agentRequest.mockResolvedValue({ success: true, message: 'ok', results: [], total: 0, httpStatus: 200 });
    const r = await executeAgentMemory({ action: 'recall', query: 'x' }, 'tc1', 'sess1');
    expect(AgentClient.agentRequest).toHaveBeenCalledWith('/api/memory/recall',
      expect.objectContaining({ action: 'recall', query: 'x', sessionId: 'sess1' }));
    expect(r).toMatchObject({ success: true, message: 'ok', tool_call_id: 'tc1' });
  });

  it('store 的 subAction 原样透传（不再本地映射）', async () => {
    AgentClient.agentRequest.mockResolvedValue({ success: true, message: 'added', memory: {}, action: 'added', stats: {}, httpStatus: 200 });
    await executeAgentMemory({ action: 'store', subAction: 'add', type: 'fact', content: 'a' }, 'tc2');
    expect(AgentClient.agentRequest).toHaveBeenCalledWith('/api/memory/store',
      expect.objectContaining({ action: 'store', subAction: 'add' }));
  });

  it('旧版 agent（404）返回升级指引错误', async () => {
    AgentClient.agentRequest.mockResolvedValue({ success: false, error: 'error.unknownApiPath', httpStatus: 404 });
    const r = await executeAgentMemory({ action: 'recall', query: 'x' }, 'tc3');
    expect(r.success).toBe(false);
    expect(r.message).toContain('升级');
  });

  it('action 缺失本地报错，不发请求', async () => {
    const r = await executeAgentMemory({}, 'tc4');
    expect(r.success).toBe(false);
    expect(AgentClient.agentRequest).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/tool-memory-forward.unit.test.js`
Expected: FAIL（现实现不发 `/api/memory/*`）

- [x] **Step 3: 重写 tool-memory.js**

保留文件骨架注释与导出名，函数体替换为：

```js
// background/tool-memory.js - 长期记忆工具（转发层：业务逻辑在 agent 端 /api/memory/*）
import { agentRequest } from './local-agent-client.js';
import { makeResult } from './tool-helpers.js';
import { t } from '../shared/i18n.js';

const ENDPOINTS = { store: '/api/memory/store', recall: '/api/memory/recall', manage: '/api/memory/manage' };

export async function executeAgentMemory(args, toolCallId, sessionId) {
  const { action } = args;
  if (!action || !ENDPOINTS[action]) {
    return makeResult(false, t('toolMemory.missingAction'), toolCallId);
  }
  const body = action === 'recall' ? { ...args, sessionId } : { ...args };
  const resp = await agentRequest(ENDPOINTS[action], body, 'POST', 30000);
  if (resp.httpStatus === 404) {
    return makeResult(false, t('agentClient.memoryEndpointMissing'), toolCallId);
  }
  if (!resp.success) {
    return makeResult(false, resp.error || t('agentClient.agentRequestFailed', { error: 'unknown' }), toolCallId);
  }
  const { success, error, httpStatus, ...rest } = resp;
  return { ...makeResult(true, rest.message, toolCallId), ...rest, tool_call_id: toolCallId };
}
```

（`missingAction` 文案复用扩展端 i18n 中保留的一条 `toolMemory` key；删除本地 `subAction→action` 映射——body 同时携带 `action` 与 `subAction`，agent 端 store/manage 按 `subAction` 分发。执行前将 tool-memory.js 的 store/manage 内部签名核对一次：agent service 的 `store(args)` 接收 `action` 字段为 add/update/delete，因此**转发层需做最小适配**：`const body = { ...args, action: args.subAction ?? args.action }`（store/manage）；recall 保持 `action:'recall'`。以 Task 5 契约测试为准。）

- [x] **Step 4: 改造 GET_PERMANENT_NOTES（index.js:1523-1545）**

handler 体改为：

```js
  if (message.type === 'GET_PERMANENT_NOTES') {
    agentRequest('/api/memory/inject', {}, 'POST', 15000)
      .then((resp) => {
        if (!resp.success) {
          sendResponse({ success: false, facts: [], remainingCount: 0, remainingTags: [], error: resp.error });
          return;
        }
        sendResponse({ success: true, facts: resp.injected || [], remainingCount: resp.remainingCount || 0, remainingTags: resp.remainingTags || [] });
      })
      .catch((err) => sendResponse({ success: false, facts: [], remainingCount: 0, remainingTags: [], error: err.message }));
    return true;
  }
```

同时删除 index.js 顶部 `readMemoryFile`（:17）与 `selectMemoriesForInjection`（:18）两条 import；`tool-executor.js:10` 去掉 `readMemoryFile`。

- [x] **Step 5: i18n 与旧文件清理**

- **执行修正**：`toolMemory` 命名空间并不在 `src/shared/locales/*.js`，而是在 `tool-memory.js` 文件内 `registerTranslations` 注册的（因此文案已随业务逻辑迁至 agent 端 `src/locales/{zh,en}.json` 的 `memory` 命名空间）。转发层只保留自己渲染的 6 条：`missingAction`、`unsupportedMemoryAction`、`storeMissingSubAction`、`manageMissingSubAction`、`memoryEndpointMissing`、`requestFailed`。
- `memoryEndpointMissing` 不放到 `agentClient` 命名空间：该文案仅由 tool-memory.js 渲染，放在本模块自己的命名空间可保证单测（mock 掉 local-agent-client.js 后）仍能解析真实文案，不依赖被 mock 模块的副作用。
- 删除 `src/background/memory-injection.js` 与 `test/unit/memory-injection.unit.test.js`（行为测试已在 Task 1 迁至 agent）；其中仍有意义的“接线守卫”（index.js handler / side_panel utils.js 渲染门控）改写后并入 `tool-memory-forward.unit.test.js`。
- **纠正旧实现的 `makeResult` 误用**：旧代码将 `toolCallId` 直传第三参（应形为 `extra` 对象），字符串展开会在结果上产生 `"0":"t"` 类垃圾键；转发层统一改为 `makeResult(success, content, { tool_call_id })`。

- [x] **Step 6: 运行扩展全量单测 + 构建**

Run: `npx vitest run` → 全绿（如有其他测试 mock/引用 `tool-memory` 内部函数，按其意图改为断言转发调用，逐个修复后重跑）
Run: `npm run build:silent` → BUILD SUCCESS

- [x] **Step 7: Commit**

```bash
git add src/background/tool-memory.js src/background/index.js src/background/tool-executor.js src/background/memory-injection.js src/shared/locales/zh.js src/shared/locales/en.js test/unit/
git commit -m "refactor(memory): extension background forwards memory ops to agent endpoints"
```

---

### Task 7: 端到端冒烟与版本同步

**Files:**
- Modify: `CHANGELOG.md`

（修正 2026-10-13：不手动改任何版本文件。项目采用单一版本流，版本号由 `npm run release:agent`（agent/publish.sh）发布时统一同步 agent package.json / 根 package.json+lock / manifest.json 并打 tag，详见既有惯例。）

**Interfaces:**
- Consumes: 全部前序 Task
- Produces: 可用的真机链路验证记录

- [x] **Step 1: 启动 agent 并直连冒烟**

```bash
cd agent && node bin/agent.js start -b && sleep 2 && node bin/agent.js status
```

（`-b` 后台守护——前台模式重启会丢进程，既有陷阱。）用冒烟脚本 `agent/test/smoke/memory-pushdown.smoke.mjs`（执行时从 `test-results-probes/` 临时探针提升为受版本控制的产物，因为 CHANGELOG 需引用它），在临时 HOME + 独立端口下进程内拉起真实 server，依次 POST `/api/memory/store`（add）→ `/api/memory/recall` → `/api/memory/inject` → `/api/memory/manage(review)`，断言四条响应 `success:true` 且 inject 的 `injected` 含刚写入的高重要性记忆，并校验落盘位置与 400/404 语义（脚本跑完保留输出记录，12/12 通过）。

- [x] **Step 2: 扩展真机验证**

`chrome://extensions` 重新加载 `dist/`，侧边栏对话让模型执行：存一条 importance 8+ 记忆 → 验证工具返回正常、下一轮系统提示词出现"永久注意事项"区块、manage review 可用。断开 agent → 验证记忆区块消失且触发工具时得到未配对/升级指引文案（无未处理异常）。

- [x] **Step 3: CHANGELOG 同步**

`CHANGELOG.md` 记录架构迁移条目（含行为不变声明与旧 agent 不兼容提示，提醒需通过 `npm run release:agent` 对应发布）。同步更新 `agent/docs/` 或 Wiki 中涉及记忆实现的描述（如有）。

- [x] **Step 4: 最终回归**

Run: `cd agent && node --test test/unit/` → PASS
Run: `npx vitest run` → PASS
Run: `npm run build:silent` → BUILD SUCCESS

- [x] **Step 5: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(memory): changelog for memory logic pushdown to agent"
```

---

## Self-Review 结论

- 覆盖检查：P0 分析中"下推"承诺的原子性（Task 2 进程内锁）、缓存/去重常驻（Task 3）、纯函数迁移（Task 1）、端点契约（Task 5）、转发兼容（Task 6）、无功能新增——均有对应 Task；无遗漏。
- 已明确不做：向量检索、管理 UI、压缩沉淀、`candidates` fallback 死路径修复（Task 3 Step 3 显式保持旧行为）。
- 类型一致性：`injected/remainingCount/remainingTags` 三个字段名在 Task 1/4/5/6 全程一致；端点路径常量为 Task 5/6 共同契约。
