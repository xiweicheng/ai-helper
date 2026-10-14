# 记忆向量配置界面 Implementation Plan

> **存档状态（2026-10-14 加注）**：本计划已全部执行完毕（记忆线最后一个相关提交 `0c1fdaa`），**不要按本文件实施**。
> 现行口径见 [`docs/Memory-Retrieval-Design.md`](../../Memory-Retrieval-Design.md)。文中的预写代码块与 Step 清单属实施前内容，已与源码不再同步。
> 不删的理由：本文件末尾的执行记录里有 45 处「作废 / 更正 / 推翻 / 错定」结论（哪些判据被实测否定、为什么），那是防止后续「顺手把已否定的判据加回来」的唯一书面依据。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 options 页新增「记忆」Tab，让记忆语义召回的 embedding 配置可视化、可验证、可重建；agent 端补一个只读状态端点暴露「向量指纹是否陈旧」。

**Architecture:** agent 端在 `memory/service.js` 加 `vectorStatus()`（纯文件级统计，绝不构造 provider），经 `routes.js` 的 `handleEmbeddingEndpoints` 以 `GET /api/memory/vector-status` 暴露；扩展端新建 `src/options/memory-panel.js`，复用现成的 `agentApi` / `showCustomConfirm` / knowledge 面板的 gate 模式，配置读写与重建全部打 agent 既有端点。

**Tech Stack:** Node 原生 `node:test`（agent 单测）、Vitest + jsdom（扩展端单测）、Chrome MV3 options 页原生 JS 模块、无框架。

**Spec:** `docs/superpowers/specs/2026-10-13-memory-embedding-config-ui-design.md`

## Global Constraints

- 只在 **main** 上工作，禁止创建分支或 worktree。
- **一律不推送**（origin / gitee / atomgit 都不推），不同步 wiki，不手改版本号。
- 测试**绝不读写用户真实 `~/.ai-helper-agent`**：agent 侧一律用 `mkdtempSync` 临时目录 + 注入 `embeddingConfigProvider` / `tierResolver` / `embedderFactory`；绝不联网、绝不下载模型。
- agent 单测框架是 **node:test**，不是 vitest：`cd agent && node --test --test-reporter=tap test/unit/<file>`。对 agent 目录跑 vitest 会得到 "no tests"（根 `vitest.config.js` 的 include 只有 `test/unit/**`）。
- 扩展端单测：`npx vitest run test/unit/<file>`，环境靠文件头 `// @vitest-environment jsdom` 覆盖（全局默认是 node）。
- TDD：每个 Step 先写失败测试 → 跑出红 → 最小实现 → 跑出绿 → 提交。收口前用 `git stash push -- <实现文件>` 做反向验证（必须见红），再 `git stash pop`。
- 改完必须跑 `npm run build:silent`，以 `BUILD_SUCCESS` 为准。
- i18n **中英双语齐补**（仓库没有 parity 测试，靠 Task 3 新增的结构钉兜底）。
- **隐藏字段不得提交空值或 0**：`memoryModelKey` 取 `Number(dims) > 0 ? floor : 0`，把已存 512 覆盖成 0 会冒报 `stale`。
- 文案里的数字必须照实测写：本地档 41 条重建 = 23 分钟（`EMBED_BATCH_SIZE = 10` → 8 批，首批含冷启动 106 秒）；本地档 512 token 截断，实测 41 条中 13 条超窗。
- 不擅自重启用户正在运行的 agent 进程；需要加载新代码时告知用户，由他决定。
- 临时脚本用 `.tmp-` 前缀，任务结束必须删除（收口前 `git status --porcelain -uall` 应为 0 行）。

---

### Task 1: agent 端 `vectorStatus()` 只读状态

**Files:**
- Modify: `agent/src/memory/service.js`（在 `backfillVectors` 之后、`return {...}` 出口之前插入函数；出口对象追加一个键）
- Test: `agent/test/unit/memory-service.unit.test.js`（文件末尾追加 describe）

**Interfaces:**
- Consumes: 同文件已有的 `vectors.read()`（`createVectorStoreFacade`，返回 `{modelKey, vectors}`）、`readMemoryFile()`、`embeddingConfigProvider()`、`tierResolver()`、`memoryModelKey(cfg)`（`vectors.js:13`）
- Produces: `svc.vectorStatus(): Promise<{ indexed: number, total: number, storedModelKey: string, currentModelKey: string, stale: boolean, tier: string } | { success: false, error: string }>`

- [x] **Step 1: 记录基线**

Run: `cd agent && node --test --test-reporter=tap test/unit/memory-service.unit.test.js 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 全绿。把 `# tests N` 的数字记下来（本段最近一次实测是 71），后续每步的「新增几条」以此为准。

- [x] **Step 2: 写失败测试**

在 `agent/test/unit/memory-service.unit.test.js` 末尾追加。注意用**可变的 cfg 闭包**（夹具默认的 `embeddingConfigProvider` 是常量，无法在测试中途改模型），`withVectorService` 的 `...opts` 在最后展开，所以自定义 provider 会覆盖默认值：

```js
// 追加：vectorStatus 只读状态。核心约束——它只读文件，绝不构造 provider
// （拿 tokenCounter 要 await _getPipeline()，那会触发模型下载；只读端点不许有这种副作用）。
describe('vectorStatus 向量状态', () => {
  it('报告条数与指纹；换模型未重建 → stale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mem-status-'));
    const cfg = { ...EMBED_CFG, modelName: 'first-model' };
    const svc = createMemoryService({
      filePath: join(dir, 'global-memory.json'),
      vectorsFilePath: join(dir, 'memory-vectors.json'),
      embeddingConfigProvider: () => ({ ...cfg }),
      tierResolver: () => 'remote',
      embedTimeoutMs: 200,
      embedderFactory: () => ({
        embedQuery: async () => [1, 0, 0],
        embedDocuments: async () => [[0.98, 0.2, 0]]
      })
    });
    return Promise.resolve((async () => {
      await svc.store({ action: 'add', type: 'fact', content: '一条记忆', tags: [], importance: 5 }, T);
      const bf = await svc.backfillVectors(T);
      assert.equal(bf.indexed, 1);

      const fresh = await svc.vectorStatus();
      assert.equal(fresh.indexed, 1);
      assert.equal(fresh.total, 1, 'total = facts + summaries');
      assert.equal(fresh.stale, false, '刚建完不该陈旧');
      assert.equal(fresh.storedModelKey, fresh.currentModelKey);
      assert.equal(fresh.tier, 'remote');

      cfg.modelName = 'second-model';        // 模拟用户在界面里换了模型但没重建
      const stale = await svc.vectorStatus();
      assert.equal(stale.stale, true, '换模型未重建必须可见');
      assert.equal(stale.indexed, 1, '陈旧不等于向量消失，条数照实报');
      assert.notEqual(stale.storedModelKey, stale.currentModelKey);
    })().finally(() => rmSync(dir, { recursive: true, force: true })));
  });

  it('从未建过向量（空库）不算陈旧', () => withVectorService({
    // 必须显式给假工厂：store 会 fire-and-forget 懒补一个向量，
    // 不给桩就会拿真 provider 去联网/下载模型（夹具默认就是真实实现）。
    embedderFactory: () => ({ embedQuery: async () => [1, 0, 0], embedDocuments: async (t) => t.map(() => [0, 1, 0]) })
  }, async (svc) => {
    await svc.store({ action: 'add', type: 'fact', content: '还没有向量', tags: [], importance: 5 }, T);
    const s = await svc.vectorStatus();
    assert.equal(s.indexed, 0);
    assert.equal(s.total, 1);
    assert.equal(s.storedModelKey, '', '空库没有指纹');
    assert.equal(s.stale, false, '首次启用时 indexed=0 是正常态，不得报警');
  }));

  it('向量档关着也照常返回统计（残留陈旧向量是需要看到的状态，不是错误）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mem-status-off-'));
    const svc = createMemoryService({
      filePath: join(dir, 'global-memory.json'),
      vectorsFilePath: join(dir, 'memory-vectors.json'),
      embeddingConfigProvider: () => ({ ...EMBED_CFG, enabled: false, modelName: 'now-model' }),
      tierResolver: () => 'none',
      // 同上：store 会懒补向量，不给假工厂就会碰真 provider
      embedderFactory: () => ({ embedQuery: async () => [1, 0, 0], embedDocuments: async (t) => t.map(() => [0, 1, 0]) })
    });
    return Promise.resolve((async () => {
      // 直接写一份与当前配置不符的向量缓存，模拟「以前开过、换了模型、现在关了」
      const vectors = createVectorStoreFacade({ filePath: join(dir, 'memory-vectors.json') });
      await vectors.upsertVectors([['fact_x', [1, 0, 0]]], 'remote|old-model|3');
      await svc.store({ action: 'add', type: 'fact', content: '条目', tags: [], importance: 5 }, T);

      const s = await svc.vectorStatus();
      assert.equal(s.tier, 'none');
      assert.equal(s.indexed, 1, '残留向量条数照实报');
      assert.equal(s.stale, true, '关着也要能看出向量已作废');
    })().finally(() => rmSync(dir, { recursive: true, force: true })));
  });
});
```

补 import（文件顶部若缺 `createVectorStoreFacade`）：

```js
import { createVectorStoreFacade } from '../../src/memory/vectors.js';
```

- [x] **Step 3: 跑测试确认失败**

Run: `cd agent && node --test --test-reporter=tap test/unit/memory-service.unit.test.js 2>&1 | grep -E "not ok|vectorStatus|# (tests|pass|fail)"`
Expected: 新增 3 条红，报 `svc.vectorStatus is not a function`；原有用例仍绿。

- [x] **Step 4: 最小实现**

在 `agent/src/memory/service.js` 的 `backfillVectors` 函数结束（`}` 之后、`return {` 出口之前）插入。变量名避开外层 `vectors`（那是 facade）：

```js
  /**
   * 向量索引状态（只读）：条数 + 指纹陈旧判定，供配置界面自证「改了模型有没有重建」。
   *
   * 刻意不碰 provider：拿超窗计数要 await _getPipeline()，那会触发模型下载——
   * 一个只读状态查询不许有这种副作用，所以 overWindow 只在 backfillVectors 里给。
   * stale 只在「真存过向量」时成立：空库 + 任意配置不算陈旧（首次启用是正常态）。
   * @returns {Promise<object>} {indexed,total,storedModelKey,currentModelKey,stale,tier}
   */
  async function vectorStatus() {
    const cfg = embeddingConfigProvider();
    const tier = tierResolver(cfg);
    const currentModelKey = memoryModelKey(cfg);
    const [vecStore, readResult] = await Promise.all([vectors.read(), readMemoryFile()]);
    if (!readResult.success) return { success: false, error: readResult.error };

    const data = readResult.data;
    const total = (data.facts || []).length + (data.summaries || []).length;
    const storedModelKey = typeof vecStore.modelKey === 'string' ? vecStore.modelKey : '';
    return {
      indexed: Object.keys(vecStore.vectors || {}).length,
      total,
      storedModelKey,
      currentModelKey,
      stale: Boolean(storedModelKey) && storedModelKey !== currentModelKey,
      tier
    };
  }
```

出口对象加一个键（与 `backfillVectors` 并列）：

```js
    backfillVectors,
    vectorStatus,
```

- [x] **Step 5: 跑测试确认通过**

Run: `cd agent && node --test --test-reporter=tap test/unit/memory-service.unit.test.js 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 基线 + 3 全绿，0 fail。

- [x] **Step 6: 提交**

```bash
git add agent/src/memory/service.js agent/test/unit/memory-service.unit.test.js
git commit -m "feat(memory): vectorStatus 只读状态（条数 + 指纹陈旧判定）"
```

---

### Task 2: agent 端 `GET /api/memory/vector-status`

**Files:**
- Modify: `agent/src/memory/routes.js`（`handleEmbeddingEndpoints` 内新增分支）
- Test: `agent/test/unit/memory-routes.unit.test.js`

**Interfaces:**
- Consumes: Task 1 的 `service.vectorStatus()`；`options.service || defaultService`（该函数已能拿到 `options`）；`jsonResponse(res, status, body)`
- Produces: HTTP 契约 `GET /api/memory/vector-status` → `200 {success:true, indexed, total, storedModelKey, currentModelKey, stale, tier}`；取数失败 → `400 {success:false,error}`；非 GET → 落到通用分发（`vector-status` 不在 `ROUTE_METHODS`，故 404）

- [x] **Step 1: 写失败测试**

追加到 `agent/test/unit/memory-routes.unit.test.js`。既有 `withRouter` 只传 `filePath`（向量会落到真实目录）、没注入配置、也没供假嵌入工厂（store 会懒补向量→碰真 provider），**必须**另写一个夹具：

```js
// vector-status 夹具：同时隔离向量缓存路径、配置来源与嵌入工厂。
// 三者缺一不可：复用 withRouter 会读真实 ~/.ai-helper-agent/memory/memory-vectors.json（碍用户数据且断言不可控），
// 不供 embedderFactory 则 store 的懒补会拿真 provider 联网/下载模型。
function withStatusRoute(cfg, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mem-status-route-'));
  const vectorsFilePath = join(dir, 'memory-vectors.json');
  const service = createMemoryService({
    filePath: join(dir, 'global-memory.json'),
    vectorsFilePath,
    embeddingConfigProvider: () => ({ enabled: false, mode: 'openai-compat', baseUrl: '', modelName: 'm', apiKey: '', dimensions: 3, queryPrefix: '', ...cfg }),
    tierResolver: () => (cfg.enabled === true ? 'remote' : 'none'),
    embedderFactory: () => ({ embedQuery: async () => [1, 0, 0], embedDocuments: async (texts) => texts.map(() => [0, 1, 0]) })
  });
  const call = (method, pathname) => {
    const req = { method, headers: { origin: 'chrome-extension://test-ext' } };
    const res = {
      statusCode: 0, headers: null, body: null,
      writeHead(status, headers) { res.statusCode = status; res.headers = headers; },
      end(body) { res.body = JSON.parse(body); }
    };
    res.req = req;
    return memoryDispatch(req, res, pathname, new URL('http://127.0.0.1' + pathname), T, {}, { service })
      .then(() => res);
  };
  return Promise.resolve(fn({ call, service, vectorsFilePath })).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe('GET /api/memory/vector-status', () => {
  it('GET 合法：返回 200 与状态字段（向量档未启用也不报错）', () => withStatusRoute({}, async ({ call, service }) => {
    await service.store({ action: 'add', type: 'fact', content: '一条记忆', tags: [], importance: 5 }, T);
    const res = await call('GET', '/api/memory/vector-status');
    assert.equal(res.statusCode, 200, '只读状态不因未启用向量档而报错');
    assert.equal(res.body.success, true);
    for (const k of ['indexed', 'total', 'storedModelKey', 'currentModelKey', 'stale', 'tier']) {
      assert.ok(k in res.body, `缺少字段 ${k}`);
    }
    assert.equal(res.body.total, 1);
    assert.equal(res.body.tier, 'none');
  }));

  it('换了模型没重建 → stale 为真（界面据此标红）', () => withStatusRoute({ enabled: true }, async ({ call, vectorsFilePath }) => {
    const store = createVectorStoreFacade({ filePath: vectorsFilePath });
    await store.upsertVectors([['fact_a', [1, 0, 0]]], 'openai-compat|old-model|3');
    const res = await call('GET', '/api/memory/vector-status');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.stale, true);
    assert.equal(res.body.indexed, 1);
    assert.equal(res.body.storedModelKey, 'openai-compat|old-model|3');
    assert.equal(res.body.currentModelKey, 'openai-compat|m|3', '指纹走 memoryModelKey，不自己拼');
  }));

  it('非 GET 方法落到通用分发 → 404（不新增业务路由）', () => withStatusRoute({}, async ({ call }) => {
    const res = await call('POST', '/api/memory/vector-status');
    assert.equal(res.statusCode, 404);
  }));
});
```

补 import（文件顶部若缺）：

```js
import { createVectorStoreFacade } from '../../src/memory/vectors.js';
```

- [x] **Step 2: 跑测试确认失败**

Run: `cd agent && node --test --test-reporter=tap test/unit/memory-routes.unit.test.js 2>&1 | grep -E "not ok|# (tests|pass|fail)"`
Expected: 前两条红（`GET /vector-status` 现在会掉进 404 分支，`statusCode` 断言失败），第三条绿——它是反向守卫钉，本就应通过。

- [x] **Step 3: 实现分支**

在 `agent/src/memory/routes.js` 的 `handleEmbeddingEndpoints` 内，`if (key === 'test-embedding') { ... }` 之后、结尾 `return false;` 之前插入：

```js
  // 只读状态：条数 + 指纹陈旧。走 GET（配置类端点同例，不受「非 POST 即 404」约束）。
  // 放在这里而不是 ROUTE_METHODS：后者只收 POST 业务动作，且需要请求体。
  if (key === 'vector-status') {
    if (req.method !== 'GET') return false;
    const service = options.service || defaultService;
    try {
      const data = await service.vectorStatus();
      if (data && data.success === false) {
        jsonResponse(res, 400, data);
      } else {
        jsonResponse(res, 200, { success: true, ...data });
      }
    } catch (err) {
      jsonResponse(res, 400, { success: false, error: err.message || 'vector_status_failed' });
    }
    return true;
  }
```

- [x] **Step 4: 跑测试确认通过**

Run: `cd agent && node --test --test-reporter=tap test/unit/memory-routes.unit.test.js 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 基线 + 3 全绿。

- [x] **Step 5: 确认既有冒烟不受新分支影响**

不往冒烟里新增项（本地档真实跑一次要 20+ 分钟，不适合放进自动收口）；只验证新分支没弄坏现有分发：

Run: `cd agent && node test/smoke/memory-pushdown.smoke.mjs 2>&1 | tail -3`
Expected: `合计 21 项，失败 0 项`（冒烟是脚本式，`node --test` 跑它只会报 `# tests 1`，必须直接 `node`）。

- [x] **Step 6: 提交**

```bash
git add agent/src/memory/routes.js agent/test/unit/memory-routes.unit.test.js
git commit -m "feat(memory): GET /api/memory/vector-status 只读状态端点"
```

---

### Task 3: options 页「记忆」Tab 骨架 + i18n 双语 + 接线

**Files:**
- Modify: `options.html`（tab-nav 第 40 行后加按钮；knowledge panel（693 行起）之后加 `<div class="tab-panel" data-tab="memory">`）
- Modify: `src/shared/locales/zh.js` / `src/shared/locales/en.js`（新增 `memoryPanel:` 命名空间）
- Modify: `src/options/styles.css`（`memory-status-*` 少量新增类）
- Test: `test/unit/memory-panel-structure.unit.test.js`（新建）

**Interfaces:**
- Consumes: 既有类名 `tab-nav-btn` / `tab-panel` / `form-group` / `global-toggle` / `knowledge-header` / `toolbox-add-btn`；`applyI18n` 认 `data-i18n` / `data-i18n-placeholder`
- Produces: Task 4 依赖的 DOM id 契约（**id 名逐字对齐，不得改动**）：
  `memoryGate`、`memoryEnabled`（checkbox）、`memoryEmbeddingMode`（radio 组，value 为 `openai-compat` / `local`）、`memoryRemoteGroup`、`memoryBaseUrlInput`、`memoryApiKeyGroup`、`memoryApiKeyInput`、`memoryDimsGroup`、`memoryDimsInput`、`memoryPrefixGroup`、`memoryPrefixInput`、`memoryModelInput`、`memoryLocalNotice`、`memoryTestRow`、`memoryTestBtn`、`memoryTestResult`、`memorySaveBtn`、`memoryReindexBtn`、`memoryStatus`、`memoryResult`

- [x] **Step 1: 写失败的结构钉**

新建 `test/unit/memory-panel-structure.unit.test.js`（node 环境即可，读文件文本断言；它同时兜住「仓库没有 i18n parity 测试」这个风险）：

```js
// 记忆面板的结构契约钉：options.html 的 id 与中英 i18n 键必须齐备。
// 为什么单独钉：行为测试（memory-panel.unit.test.js）用的是自己拷贝的 DOM 夹具，
// 真实页面漏一个 id 它看不见；而中英漏键仓库没有 parity 测试，历史上靠自查。
import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';

const html = readFileSync(new URL('../../options.html', import.meta.url), 'utf8');
const zh = readFileSync(new URL('../../src/shared/locales/zh.js', import.meta.url), 'utf8');
const en = readFileSync(new URL('../../src/shared/locales/en.js', import.meta.url), 'utf8');

const IDS = ['memoryGate', 'memoryEnabled', 'memoryBaseUrlInput', 'memoryApiKeyInput',
  'memoryDimsInput', 'memoryPrefixInput', 'memoryModelInput', 'memoryLocalNotice',
  'memoryTestRow', 'memoryTestBtn', 'memoryTestResult', 'memorySaveBtn',
  'memoryReindexBtn', 'memoryStatus', 'memoryResult'];

test('记忆 Tab 已挂进导航与面板容器', () => {
  expect(html).toContain('class="tab-nav-btn" data-tab="memory" data-i18n="memoryPanel.tabTitle"');
  expect(html).toContain('<div class="tab-panel" data-tab="memory">');
  expect(html).toContain('</div><!-- /tab-memory -->');
});

test('面板需要的 id 逐个存在', () => {
  for (const id of IDS) expect(html, `options.html 缺 id=${id}`).toContain(`id="${id}"`);
});

test('模式单选组两个值齐备（与 agent 白名单逐字一致）', () => {
  expect(html).toContain('name="memoryEmbeddingMode" value="openai-compat"');
  expect(html).toContain('name="memoryEmbeddingMode" value="local"');
});

test('memoryPanel 命名空间中英键完全对齐', () => {
  const keys = (src, label) => {
    const block = src.match(/\n  memoryPanel: \{([\s\S]*?)\n  \},/);
    expect(block, `缺 memoryPanel 命名空间（${label}）`).toBeTruthy();
    return [...block[1].matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]).sort();
  };
  const zhKeys = keys(zh, 'zh');
  const enKeys = keys(en, 'en');
  expect(zhKeys.length).toBeGreaterThan(10);
  expect(enKeys).toEqual(zhKeys);
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/unit/memory-panel-structure.unit.test.js 2>&1 | tail -12`
Expected: 4 条全红（`data-tab="memory"` 不存在）。

- [x] **Step 3: 加 tab 与面板 DOM**

`options.html` 第 40 行 knowledge 按钮之后插入：

```html
      <button class="tab-nav-btn" data-tab="memory" data-i18n="memoryPanel.tabTitle">记忆</button>
```

在 knowledge tab-panel 的闭合 `</div><!-- /tab-knowledge -->` 之后插入（容器类名沿用 knowledge 面板，不新造）：

```html
    <!-- 记忆：语义召回向量配置（数据在 agent 端 config.json 的 memoryEmbedding） -->
    <div class="tab-panel" data-tab="memory">
      <div class="knowledge-header">
        <div class="knowledge-title-row">
          <h2 class="knowledge-title" data-i18n="memoryPanel.title">记忆向量</h2>
        </div>
        <div style="display:flex; align-items:center; gap:16px; flex-shrink:0;">
          <label class="global-toggle">
            <input type="checkbox" id="memoryEnabled">
            <span class="global-toggle-slider"></span>
            <span class="global-toggle-label" id="memoryEnabledLabel" data-i18n="memoryPanel.disabled">已停用</span>
          </label>
        </div>
      </div>

      <div id="memoryGate" style="display:none;"></div>

      <div id="memoryMain">
        <!-- 状态卡：条数 + 指纹陈旧（stale 是本次设计的核心收益） -->
        <div class="form-group">
          <label data-i18n="memoryPanel.statusTitle">向量索引状态</label>
          <div id="memoryStatus" class="memory-status"></div>
        </div>

        <div class="form-group">
          <label data-i18n="memoryPanel.modeLabel">嵌入来源</label>
          <label style="display:inline-flex; align-items:center; gap:6px; margin-right:16px;">
            <input type="radio" name="memoryEmbeddingMode" value="openai-compat" style="width:auto;">
            <span data-i18n="memoryPanel.modeRemote">远端 API</span>
          </label>
          <label style="display:inline-flex; align-items:center; gap:6px;">
            <input type="radio" name="memoryEmbeddingMode" value="local" style="width:auto;">
            <span data-i18n="memoryPanel.modeLocal">本地模型</span>
          </label>
        </div>

        <div class="form-group" id="memoryRemoteGroup">
          <label data-i18n="memoryPanel.baseUrlLabel">服务地址</label>
          <input type="text" id="memoryBaseUrlInput" data-i18n-placeholder="memoryPanel.baseUrlPlaceholder" placeholder="https://api.openai.com/v1">
        </div>

        <div class="form-group">
          <label data-i18n="memoryPanel.modelLabel">模型名称</label>
          <input type="text" id="memoryModelInput" data-i18n-placeholder="memoryPanel.modelPlaceholder" placeholder="BAAI/bge-m3">
        </div>

        <div class="form-group" id="memoryApiKeyGroup">
          <label data-i18n="memoryPanel.apiKeyLabel">API Key</label>
          <input type="password" id="memoryApiKeyInput" data-i18n-placeholder="memoryPanel.apiKeyPlaceholder" placeholder="">
        </div>

        <div class="form-group" id="memoryDimsGroup">
          <label data-i18n="memoryPanel.dimsLabel">向量维度（可留空，测试时自动探测）</label>
          <div class="kb-vec-test-row" id="memoryTestRow">
            <input type="number" id="memoryDimsInput" min="1" max="8192" placeholder="">
            <button class="kb-action-btn" type="button" id="memoryTestBtn" data-i18n="memoryPanel.testBtn">测试连通性</button>
            <span class="kb-vec-test-result" id="memoryTestResult"></span>
          </div>
        </div>

        <div class="form-group" id="memoryPrefixGroup">
          <label data-i18n="memoryPanel.prefixLabel">查询前缀（queryPrefix，可留空）</label>
          <input type="text" id="memoryPrefixInput" placeholder="">
        </div>

        <div class="form-group" id="memoryLocalNotice" style="display:none;">
          <span data-i18n="memoryPanel.localNotice">本地档无需测试连通性：保存后直接重建向量索引（首次使用需下载模型，可能数十分钟）。嵌入在 512 token 处静默截断，超长条目只有前部进入向量。</span>
        </div>

        <div class="form-group" style="display:flex; gap:12px; align-items:center;">
          <button class="toolbox-add-btn" type="button" id="memorySaveBtn" style="width:auto; margin:0; padding:8px 18px; border-style:solid;" data-i18n="memoryPanel.saveBtn">保存配置</button>
          <button class="toolbox-add-btn" type="button" id="memoryReindexBtn" style="width:auto; margin:0; padding:8px 18px; border-style:solid;" data-i18n="memoryPanel.reindexBtn">重建向量索引</button>
        </div>

        <div id="memoryResult" class="memory-status" style="display:none;"></div>
      </div>
    </div><!-- /tab-memory -->
```

- [x] **Step 4: 补中英 i18n（键名与上面 data-i18n 逐字一致）**

`src/shared/locales/zh.js` 在 `knowledge: {` 块之前插入：

```js
  memoryPanel: {
    tabTitle: '记忆',
    title: '记忆向量',
    enabled: '已启用',
    disabled: '已停用',
    statusTitle: '向量索引状态',
    statusLoading: '读取中…',
    statusIndexed: '已索引 {indexed} / 共 {total} 条',
    statusStored: '向量指纹',
    statusCurrent: '当前配置指纹',
    statusTier: '生效档位',
    statusStale: '已陈旧：模型变更后未重建',
    statusFresh: '与当前配置一致',
    staleHint: '旧向量与新配置不可比，语义召回会静默退化。请点「重建向量索引」。',
    modeLabel: '嵌入来源',
    modeRemote: '远端 API',
    modeLocal: '本地模型',
    baseUrlLabel: '服务地址',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    modelLabel: '模型名称',
    modelPlaceholder: 'BAAI/bge-m3',
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: '留空表示不修改',
    dimsLabel: '向量维度（可留空，测试时自动探测）',
    prefixLabel: '查询前缀（queryPrefix，可留空）',
    localNotice: '本地档无需测试连通性：保存后直接重建向量索引（首次使用需下载模型，可能数十分钟）。嵌入在 512 token 处静默截断，超长条目只有前部进入向量。',
    testBtn: '测试连通性',
    testRunning: '测试中…',
    testOk: '连通正常：{model} 输出 {dims} 维',
    testFail: '测试失败：{error}',
    saveBtn: '保存配置',
    saveSuccess: '记忆向量配置已保存',
    saveFail: '保存失败：{error}',
    reindexBtn: '重建向量索引',
    reindexConfirm: '重建会用当前配置重新计算全部记忆的向量。本地档 41 条实测约 23 分钟（远端约 2 分钟），期间请勿关闭本页面。确定继续？',
    reindexRunning: '重建进行中，请勿关闭页面…',
    reindexDone: '重建完成：已索引 {indexed} / {total}',
    reindexBatchFail: '（{count} 批失败，详见 agent 日志）',
    reindexOverWindow: '（{count} 条超出 {window} token 窗口，尾部未进向量）',
    reindexSkipped: '未重建：向量档未启用',
    reindexFail: '重建失败：{error}',
    gateAgentOffTitle: '代理未连接',
    gateAgentOffBody: '记忆向量配置由本地 Agent 管理，请先在「扩展」中连接 Agent。',
    gateRagTitle: '本地模型依赖未就绪',
    gateRagMissing: '本地模型需要 RAG 依赖，请先在「扩展」面板完成安装。'
  },
```

`src/shared/locales/en.js` 同位置插入（**键名与键序与中文逐字一致**，结构钉会断言两侧完全对齐）：

```js
  memoryPanel: {
    tabTitle: 'Memory',
    title: 'Memory Vectors',
    enabled: 'Enabled',
    disabled: 'Disabled',
    statusTitle: 'Vector index status',
    statusLoading: 'Loading…',
    statusIndexed: 'Indexed {indexed} of {total}',
    statusStored: 'Stored vector fingerprint',
    statusCurrent: 'Current config fingerprint',
    statusTier: 'Active tier',
    statusStale: 'Stale: model changed without rebuild',
    statusFresh: 'Matches current config',
    staleHint: 'Old vectors are incomparable with the new config, so semantic recall degrades silently. Click “Rebuild vector index”.',
    modeLabel: 'Embedding source',
    modeRemote: 'Remote API',
    modeLocal: 'Local model',
    baseUrlLabel: 'Endpoint',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    modelLabel: 'Model name',
    modelPlaceholder: 'BAAI/bge-m3',
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: 'Leave blank to keep the stored key',
    dimsLabel: 'Vector dimensions (blank is fine, detected on test)',
    prefixLabel: 'Query prefix (optional)',
    localNotice: 'Local mode needs no connectivity test: save, then rebuild the vector index (the first run downloads the model and may take tens of minutes). Embeddings are silently truncated at 512 tokens, so only the head of an over-long entry is indexed.',
    testBtn: 'Test connectivity',
    testRunning: 'Testing…',
    testOk: 'OK: {model} returns {dims} dimensions',
    testFail: 'Test failed: {error}',
    saveBtn: 'Save config',
    saveSuccess: 'Memory vector config saved',
    saveFail: 'Save failed: {error}',
    reindexBtn: 'Rebuild vector index',
    reindexConfirm: 'Rebuilding recomputes vectors for every memory with the current config. On local mode 41 entries measured about 23 minutes (remote about 2). Keep this page open. Continue?',
    reindexRunning: 'Rebuilding, please keep this page open…',
    reindexDone: 'Rebuild done: indexed {indexed} of {total}',
    reindexBatchFail: ' ({count} batches failed, see agent logs)',
    reindexOverWindow: ' ({count} entries exceed the {window}-token window, their tails are not indexed)',
    reindexSkipped: 'Rebuild skipped: vector tier is disabled',
    reindexFail: 'Rebuild failed: {error}',
    gateAgentOffTitle: 'Agent not connected',
    gateAgentOffBody: 'Memory vector config is managed by the local Agent. Connect it in the Extensions tab first.',
    gateRagTitle: 'Local model dependency missing',
    gateRagMissing: 'Local models require the RAG dependency. Install it in the Extensions panel first.'
  },
```

- [x] **Step 5: 补样式**

`src/options/styles.css` 末尾追加（其余复用 knowledge 现有类）：

```css
/* 记忆面板状态卡：陈旧用红标强调，指纹用等宽小字（长 modelKey 常见） */
.memory-status { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-secondary, #666); }
.memory-status-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.memory-status-keys { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.memory-status-keys code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.memory-status-badge { padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.memory-status-badge.stale { background: #fed7d7; color: #c53030; }
.memory-status-badge.fresh { background: #e6fffa; color: #2c7a7b; }
.memory-status-hint { color: #c53030; font-size: 12px; }
.memory-status-muted { color: #999; font-size: 12px; }
/* 记忆面板门控引导区（未连接 / 本地档缺 RAG 依赖） */
.memory-gate { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; background: var(--bg-secondary, #f7fafc); }
.memory-gate-title { font-size: 14px; font-weight: 600; }
.memory-gate-body { font-size: 13px; color: var(--text-secondary, #666); }
```

- [x] **Step 6: 跑结构钉确认通过**

Run: `npx vitest run test/unit/memory-panel-structure.unit.test.js 2>&1 | tail -8`
Expected: 4 条全绿。

- [x] **Step 7: 接线并构建**

`src/options/index.js`：import 区补 `import { initMemoryPanel, refreshMemoryPanel } from './memory-panel.js';`（放在 knowledge-panel 那行之后），并在 `refreshKnowledgePanel` 的监听之后追加：

```js
  // 初始化记忆向量面板（配置与状态都来自 agent，需连接后才有内容）
  initMemoryPanel();

  document.querySelector('[data-tab="memory"]')?.addEventListener('click', () => {
    refreshMemoryPanel();
  });
```

Task 4 前 `memory-panel.js` 还不存在，此处先建**空壳**保证构建与页面不炸：

```js
// src/options/memory-panel.js - 选项页「记忆」面板（详见 docs/superpowers/specs/2026-10-13-memory-embedding-config-ui-design.md）
export function initMemoryPanel() {}
export function refreshMemoryPanel() {}
```

Run: `npm run build:silent 2>&1 | tail -3`
Expected: `BUILD_SUCCESS`

- [x] **Step 8: 提交**

```bash
git add options.html src/shared/locales/zh.js src/shared/locales/en.js src/options/styles.css src/options/index.js src/options/memory-panel.js test/unit/memory-panel-structure.unit.test.js
git commit -m "feat(options): 记忆 Tab 骨架、i18n 双语与结构契约钉"
```

---

### Task 4: `memory-panel.js` 行为逻辑

**Files:**
- Modify: `src/options/memory-panel.js`（填充 Task 3 空壳）
- Test: `test/unit/memory-panel.unit.test.js`（新建）

**Interfaces:**
- Consumes: Task 2 的 `GET /api/memory/vector-status` 字段；既有 `GET|POST /api/memory/embedding-config`、`POST /api/memory/test-embedding`、`POST /api/memory/reindex`；`agentApi` / `escapeHtml` / `showToast` / `showCustomConfirm`（`./toolbox-shared.js`）、`loadRagStatus`（`./toolbox-rag.js`，返回 `{connected, ragAvailable, nodeVersion}`）、`t`（`../shared/i18n.js`）
- Produces: `initMemoryPanel()` / `refreshMemoryPanel()`

- [x] **Step 1: 写失败的行为测试**

`test/unit/memory-panel.unit.test.js`（照 `knowledge-panel-disable.unit.test.js` 的夹具写法，DOM 与 Task 3 的真实 id 一致）：

```js
// @vitest-environment jsdom
// 记忆面板行为钉：显隐规则、提交体的「缺席」语义、陈旧标红、重建走确认。
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { t } from '../../src/shared/i18n.js';

const { apiCalls, toastCalls, confirmCalls } = vi.hoisted(() => ({
  apiCalls: [], toastCalls: [], confirmCalls: []
}));

const CONFIG = {
  enabled: true, mode: 'openai-compat', baseUrl: 'https://api.example.com/v1',
  modelName: 'BAAI/bge-m3', apiKey: '', hasApiKey: true, dimensions: 1024, queryPrefix: ''
};
let STATUS = { indexed: 41, total: 41, storedModelKey: 'openai-compat|BAAI/bge-m3|1024', currentModelKey: 'openai-compat|BAAI/bge-m3|1024', stale: false, tier: 'remote' };
let nextReindex = { success: true, indexed: 41, total: 41, failedBatches: 0 };
let nextSave = null;   // 非 null 时接管保存响应，用来模拟接口失败

vi.mock('../../src/options/toolbox-shared.js', () => ({
  agentApi: vi.fn(async (method, path, body) => {
    apiCalls.push({ method, path, body });
    if (method === 'GET' && path === '/api/memory/embedding-config') return { success: true, config: CONFIG };
    if (method === 'GET' && path === '/api/memory/vector-status') return { success: true, ...STATUS };
    if (method === 'POST' && path === '/api/memory/test-embedding') return { success: true, dimensions: 512 };
    if (method === 'POST' && path === '/api/memory/embedding-config') return nextSave || { success: true, config: { ...CONFIG, ...(body || {}) } };
    if (method === 'POST' && path === '/api/memory/reindex') return nextReindex;
    return { success: false, error: 'unexpected api call' };
  }),
  escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  showToast: (m, k) => toastCalls.push([m, k]),
  showCustomConfirm: vi.fn(async (m) => { confirmCalls.push(m); return true; })
}));

vi.mock('../../src/options/toolbox-rag.js', () => ({
  loadRagStatus: vi.fn(async () => ({ connected: true, ragAvailable: true, nodeVersion: 'v22.0.0' })),
  refreshRagSection: vi.fn(async () => {}),
  initRagEvents: () => {},
  setRagAvailabilityChangeHandler: () => {}
}));

globalThis.chrome = {
  storage: { local: { get: (k, cb) => { cb({}); }, set: async () => {} }, onChanged: { addListener: () => {} } }
};

const DOM = `<div class="knowledge-header"><input type="checkbox" id="memoryEnabled"><span id="memoryEnabledLabel"></span></div>
<div id="memoryGate" style="display:none;"></div><div id="memoryMain">
<div id="memoryStatus" class="memory-status"></div>
<input type="radio" name="memoryEmbeddingMode" value="openai-compat" id="memModeRemote" checked>
<input type="radio" name="memoryEmbeddingMode" value="local" id="memModeLocal">
<div id="memoryRemoteGroup"><input type="text" id="memoryBaseUrlInput"></div>
<input type="text" id="memoryModelInput">
<div id="memoryApiKeyGroup"><input type="password" id="memoryApiKeyInput"></div>
<div id="memoryDimsGroup"><div id="memoryTestRow"><input type="number" id="memoryDimsInput">
<button id="memoryTestBtn" type="button"></button><span id="memoryTestResult"></span></div></div>
<div id="memoryPrefixGroup"><input type="text" id="memoryPrefixInput"></div>
<div id="memoryLocalNotice" style="display:none;"></div>
<button id="memorySaveBtn" type="button"></button><button id="memoryReindexBtn" type="button"></button>
<div id="memoryResult" style="display:none;"></div></div>`;

let mod;
beforeEach(async () => {
  vi.resetModules();
  apiCalls.length = 0; toastCalls.length = 0; confirmCalls.length = 0;
  STATUS = { ...STATUS, stale: false, storedModelKey: STATUS.currentModelKey };
  nextReindex = { success: true, indexed: 41, total: 41, failedBatches: 0 };
  nextSave = null;
  document.body.innerHTML = DOM;
  mod = await import('../../src/options/memory-panel.js');
  mod.initMemoryPanel();
  mod.refreshMemoryPanel();
  await vi.waitFor(() => expect(apiCalls.filter(c => c.path === '/api/memory/vector-status')).toHaveLength(1));
});

describe('记忆面板：加载与显隐', () => {
  test('进面板并行拉配置与状态，并回填表单', async () => {
    await vi.waitFor(() => expect(document.getElementById('memoryModelInput').value).toBe('BAAI/bge-m3'));
    expect(apiCalls.some(c => c.method === 'GET' && c.path === '/api/memory/embedding-config')).toBe(true);
    expect(document.getElementById('memoryDimsInput').value).toBe('1024');
    expect(document.getElementById('memoryApiKeyInput').value).toBe('', '明文 key 永不回填');
    expect(document.getElementById('memoryEnabled').checked).toBe(true);
  });

  test('切到本地档：隐藏服务地址/key/维度/探活，显示本地说明', async () => {
    document.getElementById('memModeLocal').click();
    await vi.waitFor(() => {
      expect(document.getElementById('memoryTestRow').style.display).toBe('none');
      expect(document.getElementById('memoryRemoteGroup').style.display).toBe('none');
      expect(document.getElementById('memoryApiKeyGroup').style.display).toBe('none');
      expect(document.getElementById('memoryDimsGroup').style.display).toBe('none');
      expect(document.getElementById('memoryLocalNotice').style.display).toBe('');
    });
  });
});

describe('记忆面板：提交体的「缺席」语义', () => {
  test('apiKey 留空 → 请求体里根本没有 apiKey 字段（留空 = 不修改）', async () => {
    document.getElementById('memorySaveBtn').click();
    await vi.waitFor(() => {
      const post = apiCalls.find(c => c.method === 'POST' && c.path === '/api/memory/embedding-config');
      expect(post).toBeTruthy();
      expect('apiKey' in post.body).toBe(false);
    });
  });

  test('本地档保存：隐藏字段一个都不提交，绝不把维度写成 0 污染 modelKey', async () => {
    document.getElementById('memModeLocal').click();
    await vi.waitFor(() => expect(document.getElementById('memoryTestRow').style.display).toBe('none'));
    document.getElementById('memoryModelInput').value = 'Xenova/bge-small-zh-v1.5';
    document.getElementById('memorySaveBtn').click();
    await vi.waitFor(() => {
      const post = apiCalls.find(c => c.method === 'POST' && c.path === '/api/memory/embedding-config');
      expect(post.body).toEqual({ enabled: true, mode: 'local', modelName: 'Xenova/bge-small-zh-v1.5' });
      expect('dimensions' in post.body).toBe(false, '提交 dimensions:0 会让指纹改变并冒报 stale');
      expect('baseUrl' in post.body).toBe(false);
    });
  });

  test('本地档不显示探活按钮，也不发 test-embedding 请求', async () => {
    document.getElementById('memModeLocal').click();
    await vi.waitFor(() => expect(document.getElementById('memoryTestRow').style.display).toBe('none'));
    expect(apiCalls.some(c => c.path === '/api/memory/test-embedding')).toBe(false);
  });

  test('探活成功自动回填维度并提示', async () => {
    document.getElementById('memoryDimsInput').value = '';
    document.getElementById('memoryTestBtn').click();
    await vi.waitFor(() => expect(document.getElementById('memoryDimsInput').value).toBe('512'));
    expect(toastCalls.some(([m]) => m.includes('512'))).toBe(true);
  });
});

describe('记忆面板：陈旧与重建', () => {
  test('stale 为真时状态卡标红并给出重建引导', async () => {
    STATUS = { ...STATUS, stale: true, storedModelKey: 'local|old|512' };
    mod.refreshMemoryPanel();
    await vi.waitFor(() => expect(document.querySelector('#memoryStatus .memory-status-badge.stale')).toBeTruthy());
    expect(document.querySelector('#memoryStatus .memory-status-hint').textContent)
      .toBe(t('memoryPanel.staleHint'));
  });

  test('重建走确认弹窗，结果含超窗与批失败如实展示，并刷新状态', async () => {
    nextReindex = { success: true, indexed: 40, total: 41, failedBatches: 1, overWindow: { count: 13, window: 512, ids: ['fact_a'] } };
    document.getElementById('memoryReindexBtn').click();
    await vi.waitFor(() => expect(confirmCalls).toHaveLength(1));
    expect(confirmCalls[0]).toContain('23');            // 实测耗时必须写进提示，不许含糊
    await vi.waitFor(() => {
      const txt = document.getElementById('memoryResult').textContent;
      expect(txt).toContain('40');
      expect(txt).toContain('13');
      expect(txt).toContain('512');
    });
    expect(apiCalls.some(c => c.method === 'POST' && c.path === '/api/memory/reindex')).toBe(true);
    expect(document.getElementById('memoryReindexBtn').disabled).toBe(false, '结束后恢复按钮');
  });

  test('重建被跳过（向量档未启用）时说明原因而不是报失败', async () => {
    nextReindex = { success: true, skipped: true, reason: 'embedding_disabled' };
    document.getElementById('memoryReindexBtn').click();
    await vi.waitFor(() => expect(document.getElementById('memoryResult').textContent)
      .toContain(t('memoryPanel.reindexSkipped')));
  });

  test('接口失败走 error toast，不清空已填表单', async () => {
    nextSave = { success: false, error: 'invalid_embedding_mode' };
    document.getElementById('memorySaveBtn').click();
    await vi.waitFor(() => {
      expect(toastCalls.some(([m, kind]) => kind === 'error' && m.includes('invalid_embedding_mode'))).toBe(true);
    });
    expect(document.getElementById('memoryModelInput').value).toBe('BAAI/bge-m3', '保存失败不得把表单抹掉');
  });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/unit/memory-panel.unit.test.js 2>&1 | tail -15`
Expected: 全红（空壳什么都不做）。

- [x] **Step 3: 实现面板逻辑**

用以下内容整体替换 `src/options/memory-panel.js`：

```js
// src/options/memory-panel.js - 选项页「记忆」面板：语义召回向量的配置、状态与重建
// 数据源：Agent /api/memory/* 端点。配置真值只在 agent 的 config.json，本页读写都经 HTTP，
// 明文 apiKey 永不回显（agent 已脱敏），所以表单的 key 框只有「填了才提交」一种语义。
// 与知识库向量卡同构但不共用代码：记忆配置是 agent 全局单份，不是每库一份，字段与生效路径都不同。

import { agentApi, escapeHtml, showToast, showCustomConfirm } from './toolbox-shared.js';
import { loadRagStatus } from './toolbox-rag.js';
import { t } from '../shared/i18n.js';
import logger from '../shared/logger.js';

let initialized = false;
let cachedConfig = null;
let busy = false;   // 重建是长任务（本地档 41 条实测 23 分钟），期间锁住两个写操作按钮
let lastStatus = { connected: true, ragAvailable: true };  // mode 切换要重算门控，而连接态只有 refresh 时才知道

const $ = (id) => document.getElementById(id);

function currentMode() {
  return document.querySelector('input[name="memoryEmbeddingMode"]:checked')?.value || 'openai-compat';
}
const isLocal = () => currentMode() === 'local';

/** 本地档没有远端端点概念：地址/key/维度/探活对它无意义，隐藏且不提交 */
function applyModeVisibility() {
  const hide = isLocal() ? 'none' : '';
  ['memoryRemoteGroup', 'memoryApiKeyGroup', 'memoryDimsGroup', 'memoryPrefixGroup', 'memoryTestRow']
    .forEach((id) => { const el = $(id); if (el) el.style.display = hide; });
  const notice = $('memoryLocalNotice');
  if (notice) notice.style.display = isLocal() ? '' : 'none';
}

/**
 * 组装提交体：只收「看得见的且非空的」字段，其余**缺席**。
 * 为什么不能交空值：memoryModelKey = mode|modelName|dimensions，且 dimensions 取
 * `Number(d) > 0 ? floor : 0` —— 把已存 512 覆盖成 0 会改变指纹，界面冒报陈旧，
 * 逼用户做一次无谓重建。apiKey 留空同理（agent 端语义：不传即不改）。
 */
function collectPayload() {
  const payload = {
    enabled: $('memoryEnabled')?.checked === true,
    mode: currentMode()
  };
  const modelName = ($('memoryModelInput')?.value || '').trim();
  if (modelName) payload.modelName = modelName;

  if (!isLocal()) {
    const baseUrl = ($('memoryBaseUrlInput')?.value || '').trim();
    if (baseUrl) payload.baseUrl = baseUrl;
    const apiKey = ($('memoryApiKeyInput')?.value || '').trim();
    if (apiKey) payload.apiKey = apiKey;
    const dims = Number($('memoryDimsInput')?.value);
    if (Number.isFinite(dims) && dims > 0) payload.dimensions = Math.floor(dims);
    const queryPrefix = ($('memoryPrefixInput')?.value || '').trim();
    if (queryPrefix) payload.queryPrefix = queryPrefix;
  }
  return payload;
}

function fillForm(cfg) {
  $('memoryEnabled').checked = cfg.enabled === true;
  $('memoryEnabledLabel').textContent = cfg.enabled === true ? t('memoryPanel.enabled') : t('memoryPanel.disabled');
  const radio = document.querySelector(`input[name="memoryEmbeddingMode"][value="${cfg.mode === 'local' ? 'local' : 'openai-compat'}"]`);
  if (radio) radio.checked = true;
  $('memoryBaseUrlInput').value = cfg.baseUrl || '';
  $('memoryModelInput').value = cfg.modelName || '';
  $('memoryApiKeyInput').value = '';   // 明文 key 不回显，占位文案已说明「留空表示不修改」
  $('memoryDimsInput').value = cfg.dimensions > 0 ? String(cfg.dimensions) : '';
  $('memoryPrefixInput').value = cfg.queryPrefix || '';
  applyModeVisibility();
}

function renderStatus(s) {
  const box = $('memoryStatus');
  if (!box) return;
  if (!s) {
    box.innerHTML = `<span class="memory-status-muted">${escapeHtml(t('memoryPanel.statusLoading'))}</span>`;
    return;
  }
  box.innerHTML = `
    <div class="memory-status-row">
      <span>${escapeHtml(t('memoryPanel.statusIndexed', { indexed: s.indexed, total: s.total }))}</span>
      <span class="memory-status-badge ${s.stale ? 'stale' : 'fresh'}">${escapeHtml(s.stale ? t('memoryPanel.statusStale') : t('memoryPanel.statusFresh'))}</span>
    </div>
    <div class="memory-status-keys">
      <span>${escapeHtml(t('memoryPanel.statusStored'))}: <code>${escapeHtml(s.storedModelKey || '—')}</code></span>
      <span>${escapeHtml(t('memoryPanel.statusCurrent'))}: <code>${escapeHtml(s.currentModelKey)}</code></span>
      <span>${escapeHtml(t('memoryPanel.statusTier'))}: <code>${escapeHtml(s.tier)}</code></span>
    </div>
    ${s.stale ? `<div class="memory-status-hint">${escapeHtml(t('memoryPanel.staleHint'))}</div>` : ''}`;
}

function setBusy(on) {
  busy = on;
  $('memoryReindexBtn').disabled = on;
  $('memorySaveBtn').disabled = on;
  $('memoryTestBtn').disabled = on || isLocal();
}

// ==================== 动作 ====================

async function onTest() {
  if (isLocal()) return;
  setBusy(true);
  const result = $('memoryTestResult');
  result.textContent = t('memoryPanel.testRunning');
  try {
    const res = await agentApi('POST', '/api/memory/test-embedding', collectPayload());
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown');
    result.textContent = t('memoryPanel.testOk', { model: collectPayload().modelName, dims: res.dimensions });
    const dimsInput = $('memoryDimsInput');
    dimsInput.value = String(res.dimensions);   // 厂商实际维度优先于用户猜测
    showToast(t('memoryPanel.testOk', { model: collectPayload().modelName, dims: res.dimensions }), 'info');
  } catch (err) {
    result.textContent = t('memoryPanel.testFail', { error: err.message });
    showToast(t('memoryPanel.testFail', { error: err.message }), 'error');
  } finally {
    setBusy(false);
  }
}

async function onSave() {
  setBusy(true);
  try {
    const res = await agentApi('POST', '/api/memory/embedding-config', collectPayload());
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown');
    cachedConfig = res.config;
    $('memoryApiKeyInput').value = '';
    showToast(t('memoryPanel.saveSuccess'), 'info');
    await loadAll();
  } catch (err) {
    showToast(t('memoryPanel.saveFail', { error: err.message }), 'error');
  } finally {
    setBusy(false);
  }
}

async function onReindex() {
  const ok = await showCustomConfirm(t('memoryPanel.reindexConfirm'));
  if (!ok) return;
  setBusy(true);
  const out = $('memoryResult');
  out.style.display = '';
  out.textContent = t('memoryPanel.reindexRunning');
  try {
    const res = await agentApi('POST', '/api/memory/reindex', {});
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown');
    if (res.skipped === true) {
      out.textContent = t('memoryPanel.reindexSkipped');
    } else {
      // 三个计数照实展示：批失败与超窗都不会让重建"看起来失败"，藏起来等于骗人
      let text = t('memoryPanel.reindexDone', { indexed: res.indexed, total: res.total });
      if (res.failedBatches > 0) text += t('memoryPanel.reindexBatchFail', { count: res.failedBatches });
      if (res.overWindow && res.overWindow.count > 0) {
        text += t('memoryPanel.reindexOverWindow', { count: res.overWindow.count, window: res.overWindow.window });
      }
      out.textContent = text;
      showToast(t('memoryPanel.reindexDone', { indexed: res.indexed, total: res.total }), 'info');
    }
    await loadAll();   // 重建后指纹必然对齐，状态卡要跟着收敛
  } catch (err) {
    out.textContent = t('memoryPanel.reindexFail', { error: err.message });
    showToast(t('memoryPanel.reindexFail', { error: err.message }), 'error');
  } finally {
    setBusy(false);
  }
}

// ==================== 加载 ====================

async function loadAll() {
  try {
    const [cfgRes, statusRes] = await Promise.all([
      agentApi('GET', '/api/memory/embedding-config'),
      agentApi('GET', '/api/memory/vector-status')
    ]);
    if (cfgRes && cfgRes.success === true && cfgRes.config) {
      cachedConfig = cfgRes.config;
      fillForm(cfgRes.config);
    }
    renderStatus(statusRes && statusRes.success === true ? statusRes : null);
  } catch (err) {
    logger.warn('[MemoryPanel] load failed:', err.message);
    showToast(t('memoryPanel.statusLoading') + ' — ' + err.message, 'error');
    renderStatus(null);
  }
}

function renderGate(status) {
  const gate = $('memoryGate');
  const main = $('memoryMain');
  const blocked = !status.connected || (currentMode() === 'local' && !status.ragAvailable);
  gate.style.display = blocked ? '' : 'none';
  main.style.opacity = blocked ? '0.5' : '';
  ['memorySaveBtn', 'memoryReindexBtn', 'memoryTestBtn'].forEach((id) => { const el = $(id); if (el) el.disabled = blocked; });
  if (blocked) {
    const title = !status.connected ? t('memoryPanel.gateAgentOffTitle') : t('memoryPanel.gateRagTitle');
    const body = !status.connected
      ? t('memoryPanel.gateAgentOffBody')
      : t('memoryPanel.gateRagMissing');
    // 门控样式用本面板自己的类（knowledge 的 gate 是一套带安装引导的渲染器，不适合直接搬用）
    gate.innerHTML = `<div class="memory-gate"><span class="memory-gate-title">${escapeHtml(title)}</span><span class="memory-gate-body">${escapeHtml(body)}</span></div>`;
  }
}

// ==================== 入口 ====================

export function initMemoryPanel() {
  if (initialized) return;
  initialized = true;

  $('memoryTestBtn')?.addEventListener('click', onTest);
  $('memorySaveBtn')?.addEventListener('click', onSave);
  $('memoryReindexBtn')?.addEventListener('click', onReindex);
  document.querySelectorAll('input[name="memoryEmbeddingMode"]').forEach((r) => {
    r.addEventListener('change', () => { applyModeVisibility(); renderGate(lastStatus); });
  });
  $('memoryEnabled')?.addEventListener('change', () => {
    $('memoryEnabledLabel').textContent = $('memoryEnabled').checked ? t('memoryPanel.enabled') : t('memoryPanel.disabled');
  });
}

export async function refreshMemoryPanel() {
  const status = await loadRagStatus();
  lastStatus = status;
  renderGate(status);
  if (!status.connected) { renderStatus(null); return; }
  await loadAll();
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/unit/memory-panel.unit.test.js 2>&1 | tail -12`
Expected: 全绿（约 10 条）。

- [x] **Step 5: 跑两条相关测试 + 构建**

Run: `npx vitest run test/unit/memory-panel.unit.test.js test/unit/memory-panel-structure.unit.test.js 2>&1 | tail -8 && npm run build:silent 2>&1 | tail -3`
Expected: 全绿 + `BUILD_SUCCESS`

- [x] **Step 6: 反向验证**

```bash
git stash push -- src/options/memory-panel.js agent/src/memory/service.js agent/src/memory/routes.js
npx vitest run test/unit/memory-panel.unit.test.js 2>&1 | tail -6
cd agent && node --test --test-reporter=tap test/unit/memory-service.unit.test.js test/unit/memory-routes.unit.test.js 2>&1 | grep -E "^# (tests|pass|fail)"; cd ../
git stash pop
```
Expected: stash 后新增用例见红；pop 后全绿。

- [x] **Step 7: 提交**

```bash
git add src/options/memory-panel.js test/unit/memory-panel.unit.test.js
git commit -m "feat(options): 记忆向量面板行为逻辑（配置读写、陈旧标红、重建）"
```

---

### Task 5: 文档与全量收口

**Files:**
- Modify: `agent/README.md` / `agent/README.zh-CN.md`（端点表补 `GET /api/memory/vector-status`；新增「记忆向量配置界面」小节与已知限制）
- Modify: `CHANGELOG.md`（新增小节）
- Modify: `docs/superpowers/plans/`（本计划执行偏差写回）

- [x] **Step 1: agent README 中英各补**

端点表加一行 `GET /api/memory/vector-status — 向量索引状态（条数 + 指纹陈旧，只读，不触发模型加载）`；用户可见行为段补：「options 页新增「记忆」Tab：可开关语义召回、切换远端/本地、探活回填维度、保存配置、重建向量索引；状态卡会标出『模型已变更未重建』」；已知限制段沿用 512 截断与本地首次下载两条。

- [x] **Step 2: CHANGELOG 新增小节**

`### 新增（记忆向量配置界面）` 写扩展端面板 + 新端点 + 为什么不含 overWindow（只读端点不得触发模型下载）；`### 更正` 记 spec 自审抓到的一处错话：手改 config.json 即时生效（`loadConfig` 按 mtime 缓存），界面价值是可发现/可验证/防填错，不是免重启。

- [x] **Step 3: 全量回归**

```bash
cd agent && node --test --test-reporter=tap 2>&1 | grep -E "^# (tests|pass|fail)"   # 基线 330，本次 +6
node test/smoke/memory-pushdown.smoke.mjs 2>&1 | tail -3                              # 21 项 0 失败
npx vitest run 2>&1 | tail -8                                                          # 全量绿（以运行前基线为准）
npm run build:silent 2>&1 | tail -3                                                    # BUILD_SUCCESS
git status --porcelain -uall | wc -l                                                   # 0
```

- [x] **Step 4: 提交**

```bash
git add agent/README.md agent/README.zh-CN.md CHANGELOG.md docs/superpowers/plans/2026-10-13-memory-embedding-config-ui.md
git commit -m "docs(memory): 记忆向量配置界面文档与计划执行记录"
```

---

## 收尾

全部 Task 完成后走 finishing-a-development-branch：跑全量测试 → 检测环境（本仓在 main 上直接工作，无 worktree）→ 呈现三选项。注意用户既有约束是**不推送**，选项 2（Push + PR）与他的一贯要求冲突，呈现时要说明。

## 待办遗留（不在本计划内）

- 词面碎块 vs 语义 top1 的名次取向（动 `RRF_K` 需重跑 Task 2+4 标定）
- `0.48` 地板换模型的重标定工具
- 分段索引恢复超窗条目尾部（会使地板标定作废）
- ~~既有债：agent 代码从未被 eslint 覆盖、2 条既有集成失败、main 上多个提交未推送、wiki 未同步~~
  → eslint 覆盖与集成失败已在**第三轮收口**解决；未推送 / wiki / 版本号（仓库 2.2.0 vs 全局 2.1.0）仍在等用户发话
- ~~`toolbox` / `knowledge` 的 hash 直达不刷新缺口~~ → 已在第三轮收进注册表
- **D1（报告第一项，需用户先定检索取向）**：tags 是打分前的硬过滤，之后词面还要过 `isKeywordHit`、
  语义还要过 0.48 地板 —— 两个硬门槛 AND 叠加。是否让标签从「硬过滤」降为「加分项」属检索哲学选择，
  未经用户发话不动。
- **新发现且需用户动作**：`api.integration.test.js` 曾硬编码本机真实配对 token 并已进 git 历史（源码已改，
  但历史仍在，且 token 本身需重新配对才算彻底失效）；`api.integration` 会打 `/api/config/workdir`、
  `/api/exec`、`/api/fs/delete`，未经用户同意不得跑

---

## 执行记录（2026-10-13，当前会话逐 Task TDD 执行完毕）

提交序列（全在 main，**未推送**）：spec `6ddc88a` → 本计划 `4ec744d` → Task 1 `f285715` → Task 2 `353c62f` → Task 3 `d2e026c` → Task 4 `06631b6` → Task 5（文档与收口）。

与计划有出入的 6 处（均已实测验证）：

1. **Task 1 Step 1 基线：实测 53 例**，计划写的「最近一次 71」为错定（恪守「数字一律实测」这条约束）。最终 56/56。
2. **Task 1 Step 2 第二条用例需改写**：原写「向量档开着 + 空库」，首跑见红（`indexed` 断 0 实得 1），根因是**向量档开着时 `store()` 会 fire-and-forget 懒补一个向量**——「开启态的空向量库」在真实系统里不成立。用例改为同时给 `tierResolver: () => 'none'` 并补断言 `s.tier === 'none'`，注释写明这一真实行为（同一原因也决定了 Task 2 路由夹具必须三重隔离 `vectorsFilePath` / `embeddingConfigProvider` / `embedderFactory`）。
3. **Task 3 Step 5 样式变量去掉**：计划给的 `.memory-status*` / `.memory-gate*` 带 `var(--text-secondary, #666)` 等写法，而 `src/options/styles.css` 全文**无 `:root`、无 CSS 变量、无暗色模式**（`prefers-color-scheme` 零命中），变量永远退成 fallback → 改按项目实际调色板直接写死，渲染结果与计划一致。
4. **Task 4 Step 3 删两个死变量**：`let busy` 与 `let cachedConfig` 只写不读（锁按钮以 DOM 的 `disabled` 为准），已从实现中去掉，长任务说明移到 `setBusy` 上方注释；行为测试不引用它们，10 例仍全绿。
5. **Task 4 Step 6 反向验证范围缩小**：计划写 `git stash push -- src/options/memory-panel.js agent/src/memory/service.js agent/src/memory/routes.js`，但后两者已在 Task 1/2 提交、工作树无改动，stash 会落空并有误 pop 其他条目的风险 → 改为只 stash `src/options/memory-panel.js`（退回已提交的空壳），10 例全红、pop 后转绿；agent 侧的反向验证已在 Task 1/2 各自步里做过。
6. **Task 5 Step 3 全量回归范围修正**：`cd agent && node --test --test-reporter=tap`（不带路径）会连带扫 `test/integration/*`（需连一个活在跑的 agent）、`test/smoke`、`test/eval`，实测挂住 4 分钟零输出→ 收口定为 **`test/unit/*.test.js` 336/336**，不跑集成测试（它会打到用户运行中的进程，违反「不擅自动用户 agent」）；新端点影响面由 `memory-routes` 单测 + 冒烟覆盖。

计划外多做两件：

- **第 8 个 Tab 的溢出探针**（临时脚本 `.tmp-tab-nav-check.mjs`，跑完已删）：静态复刻真实 `styles.css`，8 个宽度 × 中英——`tab-nav` 无溢出、页面无横向滚动、无按钮文案被省略号截断，沿用上一轮 `min-width:0` + 窄屏断点的修复即可，本次不需改 `.tab-nav`。
- **`docs/zh|en/DOCUMENTATION.md` 补 `memory-panel.js` 一行**（本计划的 Files 未列，但这两个文件是逐文件的源码树地图，新增模块不登记就是文档不一致；已按列宽对齐（`#` 仍在第 40 列））。

收口计数（全部实测）：`memory-service` **56/56**、`memory-routes` **15/15**、agent 单测 **336/336**（+6）、冒烟 **21/21**、根 vitest **1285/1285**（83 文件，+14）、`npm run build:silent` BUILD_SUCCESS、`npx eslint` 对扩展端改动文件零输出、`git status --porcelain -uall` 0 行。

诚实记录两项非全绿：根 vitest 仍有 **2 处既有 unhandled rejection**（`apply-rag-tool-introduction.unit.test.js` 的 `document is not defined`），已用 `git stash push -u` 退回本次改动复验，确认与本计划无关；agent 集成测试本次未跑（见上文第 6 条）。

---

## 执行记录第二轮（2026-10-13 深夜：四项体验反馈 + 一次事故修复）

用户实机试用后回报四项体验问题（① 状态卡永久「读取中」② 两颗「保存配置」重名 ③ 英文整排 Tab 省略号 ④ 记忆弹层缺快捷入口），另报一个 bug（选中记忆 Tab 刷新后跳回「基础」）。本轮另发现并修复一个上一轮留下的、会写坏用户真实数据的测试缺陷。提交全在 main，**未推送**。

### 本轮作废的三条上一轮结论（均为错定，就地标注）

1. **「第 8 个 Tab 不需再改 `.tab-nav`」作废**。那次溢出探针用 `page.setContent()` + file:// 样式表，文档是 `about:blank`、**样式根本没加载**（本轮前置断言 `cssApplied=false` 才暴露）。改用仓库内 file:// 夹具 + `goto` 重测后得到真数据：容器内宽 540px，英文 8 个 Tab 自然宽合计 550px——只差 10px 就让整排全部截断 2–4px（中文 526px 放得下，故只在英文复现）。
2. **「全部 agent 测试零联网、不碰 `~/.ai-helper-agent`」作废**。`withService`（`memory-service.unit.test.js`）与 `withRouter`（`memory-routes.unit.test.js`）只注入了 `filePath`，而 `embeddingConfigProvider` 的默认值就是读用户真实 `config.json` 的 `getMemoryEmbeddingConfig`、`vectorsFilePath` 的默认值就是真实 `VECTORS_FILE`。
3. **「`validTabs` 无需改动」作废**：新增 Tab 时未同步这个硬编码白名单，`#memory` 被判非法后掉回 HTML 默认 active 的「基础」——这就是用户看到的「只有那个 Tab 刷新会跑掉」。

### 事故与恢复（用户真实数据）

- 现象：跑 agent 单测时，「只碰到 2 字碎块的条目不当成命中」从绿转红（`total` 期望 1 实得 2）。红因**不是** `RRF` 实现被改坏，而是该用例跑在双通道环境里（断言从「纯词面通道」漂到「词面+语义」）。临时脚本实测：注入 A 档后 `tier=none total=1`，不注入则 `tier=remote`、单条耗时 827ms（真联网）。
- 损害：用户 `~/.ai-helper-agent/memory/memory-vectors.json` 的 41 条被覆盖（`upsertVectors` 在 `cur.modelKey !== modelKey` 时整体作废旧向量），实测一度只剩 2 条、后一次 7 条全孤儿。真源 `global-memory.json` 未被动（mtime 20:22、41 条完好），是派生缓存。
- 处置（均经用户授权）：`POST /api/memory/reindex` 重建两次（`indexed:41 total:41 failedBatches:0`）+ `dropVectors` 清 7 条孤儿 → 缓存回到 41 条、0 孤儿；端点实测 `200 {indexed:41,total:41,stale:false,tier:"remote"}`。
- 堵漏：三个夹具补齐全五个注入点；`withVectorService` 加**默认抛错的 `embedderFactory`**（写在 `...opts` 前，不覆盖用例自带的）；新增 `agent/test/unit/memory-test-isolation.unit.test.js` 扫全目录源码做结构钉。
- **泄漏已堵的硬证据**：修复后跑全量 agent 单测（369/369，3.96s），该文件 mtime 与字节数跑前后逐字相同（`14:04:55.328Z` / 1043714B）。
- 反向验证：`git checkout HEAD --` 退回三个旧夹具 → 结构钉 3 红（逐个点名缺哪个注入点）且碎块用例回红；恢复后全绿。

### 四项体验反馈的实现要点（与原计划有出入之处）

- ① 状态卡：`agentApi` 附 `data.httpStatus`（不用 `status` 以免与响应体冲突，沿用 `background/local-agent-client.js` 惯例；改前 grep 核过 43 个调用方）；面板改三态 + `statusOffline`。`loadAll()` 第一版改成串行 `await`，与既有「进面板并行拉配置与状态」的测试语义相背 → 改回 cfgTask/statusTask 两个并发 IIFE、各自独立降级。
- ① 文案：用户指定「保存到Agent」改「**保存到代理**」。术语冲突已记录：仓库 zh 里「代理」同时是 `data-tab="agent"`（`tabAgent`）那个 Tab 的名字，故说明行显式写「代理（本地 agent 服务）」。
- ① 测试写法约束：`t(key)` 不传 params 时原样返回模板串，所以断言 `toContain(t('memoryPanel.statusFail'))` 要求该键**无占位符** → `statusFail` 设计成无参标签，错误详情另用 `statusDetail` + `<code>` 渲染。
- ② 刷新收敛为 `tabRefreshers` 注册表 + 在 `switchTab()` 末尾派发（四条激活路径全汇到它）；**注册必须早于 `activateByHash()`**，否则 F5 深链接那一条仍漏。（`toolbox` / `knowledge` 的同类缺口本轮只记录，已在第三轮收编）
- ④ CSS：`row-gap:4px` 会被后面的 `gap:2px` 简写覆盖 → 必须写 `gap: 4px 2px`；去掉 `min-width:0` 交给 `flex-wrap` 兜底。
- ③ 探针量法教训：标题行是 `align-items:center`，用「各子元素 top 是否相同」判换行会把 22px 按钮与 17px 文字误判成两行；正确信号是**行高 > 最高子元素**。

### 本轮收口计数（全部实测）

根 vitest **1298/1298**（84 文件，+13）、agent 单测 **369/369**（336 + 33）、`memory-service` **56/56**、`npx eslint` 对 9 个改动 js 零输出、`npm run build:silent` BUILD_SUCCESS。探针：`_tab-nav-overflow.mjs` 16/16、`_memory-config-entry.mjs` 13/13、临时端到端探针 14/14（已删）。常驻探针留在 `test-results-probes/`（该目录已 gitignore）。

仍有 2 处既有 unhandled rejection（`tool-panel.js:921` 的 `document is not defined`），已 `git stash push --` 本次全部改动后单跑复现，确认在干净 main 上就存在。（已在第三轮修掉）

---

## 执行记录第三轮（2026-10-13 深夜：技术债收口）

用户要求「技术上欠缺的、能做的继续做」。本轮五项均为边界明确的既有代码修改，无新增设计决策。

### 1. 凭据泄漏（本轮最重要的发现，非计划内）

上轮登记「集成测试从未跑」后去核查运行条件，发现 `agent/test/integration/api.integration.test.js` 把
**本机真实配对 token** 写成了 `process.env.AGENT_TOKEN || '<64hex>'` 的兜底值。全盘扫描（比对 `pairings.json`
里的真值，跳过 node_modules/dist 等）确认**只有这一个文件**。该 token 是本地管理接口唯一鉴权凭据，
随仓库推送即进公开历史（已有 1 个提交含它）。

- 修法：`resolveToken()` 只从环境变量或本机 `~/.ai-helper-agent/pairings.json` 取，两者都拿不到就在
  **发出任何请求之前** `process.exit(1)`。顺带把原本未使用的 `readFileSync` 用在实处。
- 钉（`test/unit/agent-integration-token.unit.test.js`）：集成目录不得出现 64 位 hex 字面量；不得出现
  本机真实 token；无凭据时非零退出且输出**不含 `ECONNREFUSED`/`fetch failed`**（这一条才能区分
  「报错退出」与「带着兜底值真的去连了服务」）。
- 反向验证：改前三条全红，且旧行为确实报 ECONNREFUSED；改后 3/3 绿。
- **需用户动作**：历史里那份 token 仍在，且 token 本身仍有效——要彻底失效需重新配对；推送前需权衡是
  否改写历史（本轮未动）。

### 2. 集成测试首跑（拆开看能不能跑）

四个 `rag-*.integration.test.js` 实测自带 `mkdtempSync` 隔离（`homedir()` 零命中），**不碰用户数据、不打
运行中的 agent** → 首次运行 **24/24 通过**（3.29s）。`api.integration.test.js` 则会调
`/api/config/workdir`、`/api/exec`、`/api/fs/delete`、`/api/trash/restore`、`/api/skill/reload`——会改用户
正跑着的 agent 配置与文件系统，**本轮未跑，等用户点头**。

### 3. toolbox / knowledge 的 hash 直达缺口（上轮只记录的）

两者刷新原先只挂在按钮 click 上 → 收进 `tabRefreshers`（与其他三个面板同一条 `switchTab` 派发），并删掉两个
click 监听避免双触发。安全性根据：`refreshToolbox` / `refreshKnowledgePanel` 都是自包含的（只读 storage 与
静态 DOM，不依赖各自 init 里的临时状态），因此早于 `initToolbox()` 被调不会出错；包一层 `.catch(() => {})`
防未处理 rejection。

- 钉：`memory-panel-structure.unit.test.js` 新增一条，除注册/去监听外还断言**三个注册行的字符偏移均早于首个
  `activateByHash();`**（晚了就漏 F5 那条路径）。改前该条红，改后 9/9 绿。
- 真实扩展冒烟（`test-results-probes/_tab-refresh-smoke.mjs`）：**17/17**。四个 tab 各自 hash 直达加载 →
  激活正确 + 面板非空壳（控件 16/8/11/87）+ 切走切回正常 + 零脚本错误。这一项专「早调用会不会把页面
  搞崩」，单测判不了。
- 为何没有更强的行为探针：MCP/Skill 列表数据来自 agent `/api/mcp/servers`，未配对的全新 profile 拿不到，
  无法在真扩展里构造「刷新前为空/刷新后有内容」的可区分场景——因此行为只靠结构钉 + 冒烟，不假称已端到端验证。

### 4. 那 2 处 unhandled rejection

`updateToolsToggleState()` 被模块初始化的 `.then` 回调调用，在 node 环境导入本模块时无 DOM → 抛错且游离
于断言之外。新文件 `test/unit/tool-panel-no-dom-import.unit.test.js` 监听 `unhandledRejection` 并动态 import，
**精确抓到那 2 条**（改前红：`document is not defined` × 2）；修法是在函数入口 `if (typeof document === 'undefined') return;`。

### 5. 测试不再写用户真实目录（上轮同因第二类风险）

`agent/test/unit/rag-ingest-path-sandbox.unit.test.js` 的「应被放行」用例原先用真实 `~/.ai-helper-agent/workspace`
造路径，每次跑单测都往用户数据目录里写文件（靠 `finally` 删，中途崩溃就留残留）。因 `AGENT_DIR` 在
`config.js`/`security.js` 顶层由 `homedir()` 求值且**无环境变量开关**，改为先覆盖 `process.env.HOME`（含 Windows 的
`USERPROFILE`）再**动态 import** 被测模块（静态 import 会先于顶层语句求值）。新增两条钉：沙箱数据根确实被创建
（防止哪天删掉覆盖后静默退回写真实目录）+ `after()` 比对真实 workspace 目录清单未变。反向验证：抽掉 HOME 覆盖
→ 4 例中 1 红；恢复 → 4/4 绿。

### 6. eslint 覆盖 agent

实测先排除假绿：`--no-ignore` 扫 `agent/**/*.js` **89 个文件，0 error 0 warning**；再放一个 `debugger` 探针
确认扫描真的生效（探针被抓到）。因此纳入零代价：`eslint.config.js` 的 ignores 从 `agent/**` 改为
`agent/node_modules/**` + `agent/dist/**`，`npm run lint` 改为 `eslint src/ agent/`。**负向对照**：不用 `--no-ignore`
时探针同样被抓到（计数=1），删除后 `npm run lint` 干净通过（3.05s）。

### 本轮收口计数（全部实测）

根 vitest **1303/1303**（86 文件，+5）且**不再报 unhandled rejection**；agent 单测 **370/370**（+1）；
rag 集成（隔离部分）**24/24**；`npm run lint` 干净；`npm run build:silent` BUILD_SUCCESS；
`_tab-refresh-smoke.mjs` 17/17。提交：`c5ab456`（凭据）+ 本轮收口一个（全在 main，**未推送**）。

本轮未动（需用户发话）：`api.integration` 实跑、token 重新配对/历史改写、推送与 wiki 同步、版本号对齐、
以及语义层三项（碎块 vs top1 取向、地板重标定、分段索引）。

## 执行记录第四轮（2026-10-13 深夜：侧边栏记忆报告的 D2/D3/D4 收口）

### 0. 报告核对与两处对报告的纠正

用户在侧边栏让 AI 自测永久记忆后产出「长期记忆能力验证报告（第二轮）」，9 条用例 + 4 个已知缺陷 D1~D4。
逐条对代码核验后采纳 D2/D3/D4（本轮修），D1 挂起等用户定检索取向。两处报告本身的归因不准确：

- D1 被归因为「多标签才触发」：实际 tags 是打分前的硬过滤（`service.js` 候选集阶段），之后词面过
  `isKeywordHit`、语义过 0.48 地板——**两个硬门槛 AND 叠加，单标签也能触发**。
- 报告未涉及但严重度更高的事实：扩展端工具 schema 的 `enum` **从未被任何代码执行**
  （`tool-executor.js` 直接 `JSON.parse(arguments)` 交给 handler，全仓无 schema 校验器），
  所以模型在普通对话里给出 `type: "note"` 就能落到写盘路径——不是「手工构造请求才能触发」。

另外报告首轮读数被我自己的脚本弄错过：按错误结构读 `global-memory.json` 报「41 条全是孤儿」，
真值是 41 真源 / 41 向量 / 0 孤儿 / 0 未索引，报告的「零残留」结论成立。

### 1. D3：`type` 白名单（旧实现有兜底数组）

旧代码 `const targetArray = type === 'fact' ? memoryData.facts : memoryData.summaries;` — 任何非 `fact`
的值（`note` / `Fact` / `fact1`）都被当摘要写进 `summaries`，并挤占 `maxSummaries = 20` 的配额。
现取 `MEMORY_TYPES = ['fact','summary']` 显式白名单，只在校验层拒；`delete` 按全局唯一 id 查找，
照旧不要求 `type`；未知 `action` 仍由 `unsupportedAction` 先报错，不让类型校验把错误换成误导性的 `invalidType`。

### 2. D4：`memoryType` 白名单，且校验必须早于嵌入请求

旧代码无效 `memoryType` 使 `candidates` 为空 → 返回「记忆库为空」文案，把参数错误伪装成数据状态。
现在 `RECALL_MEMORY_TYPES = ['all','fact','summary']` 之外直接返回 `memory.invalidMemoryType`。
校验点放在档位判定与 `embedQuery` **之前**：否则一次坏参数的检索会白打一发远端嵌入。
钉：新增用例断言注入的 `embedQuery` 调用次数为 0。

### 3. D2：`importance` 三条路径收到同一处

旧代码同一字段三套口径——add 用 `importance || 5`（传 0 静默变 5）、去重分支用
`importance || duplicate.importance`（吞掉低值）、update 用 `!== undefined`（0 原样写入）。
现在统一 `normalizeImportance()`：可解析的数字钳到 `1..10`（四舍五入），不可解析**报错而非写 NaN**
（NaN 会毁掉价值排序与注入选择）。区间依据取自代码而非猜测：locales 展示口径是 `{importance}/10`，
注入侧 Tier1 常驻阈值 8、摘要默认 6、缺省 5 全落在 1..10 内。

### 4. schema 侧补边界（并说明它不会被执行）

`src/background/tools/memory-tools.js` 的 `importance` 原先只有描述文字写着 1-10，没有
`minimum` / `maximum`（同仓 `media-tools.js` 有，属既有惯例）。补上后新增钉：schema 声明的区间必须与
service 钳制口径一致，且描述里的数字与 `minimum`/`maximum` 不矛盾——否则模型被引导写出的值正是被服务端拒掉的值。

### 5. 本轮自己的假绿灯（如实记录）

落盘脚本把模板串 `${QJ}` 的一个 `$` 写丢，导致 6 行 locale 文案里进了字面量 `{QJ}`，
而当时 **agent 单测 66/66 全绿**。根因不是脚本运气好没被抓到，而是**文案层完全没有测试覆盖**：
`memory-service.unit.test.js` 的 `t` 是 stub（返回 key），所以校验分支只被验了「拒不拒」。
补 `agent/test/unit/memory-validation-messages.unit.test.js`：真实 i18n 渲染 + service 注入真实 `t`
（断言拒绝信息里能看到模型传来的原始值、渲染后不残留任何 `{xxx}` 占位符）+ 两份语言包
**327 个叶子键的键集合一致**与**同名键占位符集合一致**。先跑出 4 红再修，修后 6/6。

### 本轮收口计数（全部实测）

根 vitest **1306/1306**（86 文件，+3）；agent 单测 **387/387**（+17）；rag 集成（隔离部分）**24/24**；
`npm run lint` 干净；`npm run build:silent` BUILD_SUCCESS。
`api.integration.test.js` 经静态核对**不涉及 `/api/memory/*`**，因此本轮校验改动与它无关，仍未实跑。

## 执行记录第五轮（2026-10-14：D1 标签口径——打分前硬过滤降为名次加成）

### 0. 取向与批准的设计

用户选定「降为加分项」。三个决定点在短设计里逐条获批：无 query 时保持硬过滤、`TAG_RANK_LIFT = 2` 的名次上抬、df 统计池走全候选。

### 1. 实现：口径集中到一个新模块

新建 `agent/src/memory/tags.js` 作单一来源（`hasTagRequest` / `tagOverlapRatio` / `filterByTags` / `applyTagRankLift` / `TAG_RANK_LIFT`），
`service.js` 只接三处：候选收集后判 `tagRequested`；`tagRequested && !hasQuery` 时才 `filterByTags`（枚举语义，标签是唯一选择器）；
两条通道的最终序之后、去重之前 `applyTagRankLift`。重叠比例分母取**请求标签数**，使「请求三个中一个」弱于「请求三个中三个」；
`lift = round(TAG_RANK_LIFT × 比例)`，全量命中最多上抬 2 位——1 位几乎抬不动，3 位以上就退化成「标签命中一律排前」，那正是本次要避开的形态。
`applyTagRankLift` 的排序键是 `index - lift`，同键时**被抬上来的那条优先**：否则抬 1 位会与它让开的那条并列，稳定序下纹丝不动，加成等于没生效（这条 tie-break 是测试逼出来的，第一版没有）。

### 2. df 统计池：我算错两次，最后按批准的原设计走

实现过程中我一度判定「df 用标签子集更安全」，并向用户声明了这条偏离；随后按 `d > 0 && d <= limit` 的语义算回：
只出现在**非标签条目**里的词在标签子集上 `d` 为 `undefined`，`d > 0` 直接为假——等于新方案想捞回的条目只能靠与子集共享的词才能命中，
跟硬过滤差不了多少，新方案自己就被自己废掉了。**已回退到用户批准的原设计（df 走全候选池）**，偏离作废，代价改为明文钉住（见下）。
这条口径同时写进 `tags.js` 文件头第 3 条，禁止本模块参与 df 池。

### 3. 真实库离线标定（只读，tier none，零网络）

把 `~/.ai-helper-agent/memory/global-memory.json`（41 条：facts 38 / summaries 3，151 个标签）复制进两个临时目录，
新旧实现各读各的副本，逐标签跑枚举用例、逐「出现 ≥2 次的标签 × 内容主题词」跑相关型用例：

| 指标 | 读数 |
| --- | --- |
| 枚举路径（只传 tags、无 query）新旧差异 | **0 / 151**（保持硬过滤这条承诺成立） |
| 相关型用例总数 | 36 |
| 新实现捞回条目的用例 | **24**（最大单例：旧 2 → 新 8） |
| 新实现少返回的用例 | **3** |
| 集合相同仅名次变化（旧 vs 新） | 0 |
| 完全一致（旧 vs 新） | 9 |

最后一行不能读成「加成没生效」——它比的是旧实现与新实现的返回序列，两侧本来就不同集。另跑一轮同实现自对照（新实现
分别以 `TAG_RANK_LIFT = 2` 与 `= 0` 各跑一遍，72 例：A 类 36 例词取自带标签条目自身、B 类 36 例词取自无标签条目）：
**名次变化 17 例（A 14 / B 3），集合变化 0 例**。即加成在他的库上只是轻微挪动（只上抬名次，既没把任何条目抬进返回窗口，也没把任何条目挤出返回窗口）；
上一轮只有 A 类用例时之所以看不出效果，是因为查询词就是从带标签条目里取的，标签项天然词面最强。

3 条少返回全部落在「查询词全库过半」这一格：`GitHub Wiki` / `文档` / `已建成` 三个标签配词 `ai`，新实现返回 0 条、旧实现各 2 条。
实测根因：`df(ai) = 30`，全库 `N = 41`、`limit = max(2, 20.5) = 20.5` → 判为无区分度剔除；而旧实现先按标签把候选缩到极小池，
`limit` 被 `KEYWORD_DF_EXEMPT = 2` 兜住，`ai` 反而存活。**即旧行为是被豁免下限意外救到的，不是设计正确**。不传 tags 的单查 `ai` 在旧实现同样 0 条。

### 4. 测试

- `agent/test/unit/memory-tag-rank.unit.test.js`（12 例，纯机制层）：重叠比例口径、全量命中恰好抬 2 位且**顶不掉第一**、部分重叠抬 1 位、零重叠不惩罚、不改入参、`filterByTags` 与迁移前 `some()` 逐字等价。
- `agent/test/unit/memory-service.unit.test.js`：改写旧钉「tags 筛选：命中任一标签才保留」→「tags 降为加分：两条都保留，标签命中项上抬到第一」；
  新增 describe「recall 标签口径：加分而非剔除」6 例，含 df 全池护栏、**无 query 仍硬筛选**、向量档不抹无标签条目，
  以及把上面那条代价**明文钉成用例**（查询词全库过半时标签全命中也返回空，防日后有人误当 bug 改）。
- 负向对照：`TAG_RANK_LIFT` 临时改 0 → **4 红**（机制层 2 + service 层 2，含向量档那条），证两处通道都对加成敏感；改回 2 后全绿。
  第一次跑负向对照时向量档用例没红，换夹具（让无标签条目在两通道都排第一）后才有牙——原夹具是假敏感。

### 5. 顺手发现的既有 flake（非本轮引入，本轮未修 → **第六轮已修**）

`store(add) 在向量档懒补：响应不等待嵌入，之后落盘` 断言 `Date.now() - t0 < 10` 而夹具的假端点 `setTimeout(10)`，
纯靠挂钟快慢分「有没有被 await」，调度抖动即红。实测全量套件 HEAD 态 3/20 红、改动后 4/20 红——**同一条、同量级，与本轮无关**。
建议改法（需用户点头，属另一条改动）：不测耗时，改为夹具持一个手动 resolve 的 promise，断言 store 已返回时嵌入仍未落盘。
> 第六轮按此建议实施完毕，并顺带揪出同族另外四处等待与一个更深的根因（不只是挂钟赌注）——见「执行记录第六轮」§3。

### 本轮收口计数（全部实测）

agent 单测 **405/405**（+18：机制层 12 + service 层 6）；两份黄金评测 `memory-recall-eval` / `-eval-b` 原样绿、未重钉任何期望；
rag 集成（隔离部分）**24/24**；记忆冒烟 **21 项 0 失败**；根 vitest **1306/1306**；`npm run lint` 干净；`npm run build:silent` BUILD_SUCCESS。
标定用临时件（`_legacy-service.tmp.js`、探针脚本、落盘脚本）已删除，工作树只留 `tags.js` + `service.js` + 两份测试。

---

## 执行记录第六轮（2026-10-14：df 全塌兜底 + 挂钟脆弱用例治理）

> 用户对上一轮汇报的四条待办点前两条（「第一条你干吧；第二条你也干」）：① df 全塌兜底；② 修复靠挂钟的脆弱用例。后两条（换模型重标定 0.48 地板、provider 嵌入层缺陷）仍未动。

### 1. df 全塌兜底（待办①）

上一轮标定得到的唯一真代价就是这一格：查询词在全库过半时整条判死，裸查 `ai` 返回 0 条。本轮按用户批准加上兜底。

**判据层形状变更（破坏性 API）**：`buildDocFreqFilter` 由返回函数改为返回 `{ keep, hasDiscriminative }`。改前先 grep 确认使用面只有 `service.js:448` 与 tokens 单测两处，无其他调用方：

```js
const limit = Math.max(KEYWORD_DF_EXEMPT, candidates.length * KEYWORD_MAX_DF_RATIO);
const keep = (key) => { const d = df.get(key); return d > 0 && d <= limit; };
let hasDiscriminative = false;
for (const d of df.values()) { if (d <= limit) { hasDiscriminative = true; break; } }
return { keep, hasDiscriminative };
```

**调用侧**（`service.js` 词面通道入口）：

```js
const { keep: dfKeep, hasDiscriminative } = buildDocFreqFilter(candidates, terms);
const dfFilter = hasDiscriminative ? dfKeep : () => true;
```

全塌判定有两个细节必须记清：
- `df` 的键只会在被某条候选碰到时才写入，所以 `d > 0` 恒成立，`hasDiscriminative` 等价于「有没有任一键没过 `limit`」。
- **「查询词全库无人碰」也算全塌**（`df` 为空表）。这是故意：那个词本来就不具备区分度。但兜底只关掉 df 闸门，**不放宽词面命中门槛**（`isKeywordHit`）——所以这种查询仍返回 0 条，不会把无关条目灌进来。

**上一轮明文钉的「已知代价」作废**：那条用例（`已知代价：查询词在全库过半时判无区分度，标签全命中也返回空`）就地改写为`df 全塌兜底…`，不新增一条更正记录。兜底的三条边界各自钉住：

| 用例 | 钉住的行为 |
| --- | --- |
| `df 全塌兜底：查询词在全库过半时忽略区分度剔除，标签上抬仍生效` | `zeta` 四条全命中→`total = 4`；且前两条必为带标签的「甲/乙」——兜底不得把上一轮的标签上抬挤掉 |
| `兜底不放宽词面门槛：全库无人碰该词时仍零命中` | `zzz` 仍 0 条 + `/memory\.noMatch/`，不说「空库」谎 |
| `兜底只在整体塌陷时生效：还有低频词幸存则高频词照旧被剔` | `quark 稀有`：`df(quark)=3 > limit 2.5` 但 `df(稀有)=1` 幸存→**不兜底**，只返回「稀有标识」 |

第三条是本轮最重要的反向护栏：若部分存活也兜底，高频词会把返回窗口填满、挤掉有效信号——那恰好是 `KEYWORD_MAX_DF_RATIO` 存在的理由。

### 2. 真实库离线标定（只读副本、tier none、零网络，重跑）

同一批 41 条（facts 38 / summaries 3、151 标签）、同一套用例重跑。旧侧仍是 `43712b4`（标签硬过滤、无兜底），新侧为本轮工作树：

| 指标 | 上一轮（D1） | 本轮（D1 + df 兜底） |
| --- | --- | --- |
| 枚举路径（只传 tags、无 query）新旧差异 | 0 / 151 | **0 / 151**（保持硬过滤这条承诺仍成立） |
| 相关型用例捞回条目 | 24 / 36 | **28 / 36** |
| 新实现少返回的用例 | 3 | **0** ← 代价清零 |
| 完全一致（旧 vs 新） | 9 | 8 |
| 触发全塌兜底的查询词数 | — | **4**（均为含 `ai` 的那批用例） |
| 不带标签裸查 `ai` | 0 条 | **10 条**（返回上限即满窗口） |
| 不带标签裸查 `配置` / `agent` | 0 条 | 0 条（**不触发兜底**：这些词在全库不过半，仍有区分度） |

`配置` 不触发是关键反向证据：兜底不是「把 df 关掉」的橡皮图章，只对真塌陷的查询生效。

**方法坑（下次直接照此避）**：`buildDocFreqFilter` 返回形状一变，导出的 legacy `service.js` 会把 `dfFilter` 当函数调当场崩。必须连 legacy 的 `tokens.js` 一起 `git show 43712b4:… > _legacy-tokens.tmp.js` 并 sed 重定向 legacy service 的 import，不能只导一个文件。

### 3. 挂钟脆弱用例治理（待办②）——根因不是挂钟

按上一轮建议先把懒补用例改成门闩式：夹具持一个手动 resolve 的 promise，断言改测**因果序**而非耗时；另加 `{ timeout: 3000 }`，使「store 敢等嵌入」这种情况干净地判红而不是挂住套件。

但改写后跑 25 次全量循环仍出 2 次红（`delete 同步摘除向量`），继续跑到 30 次又抓到 1 次红，拿到真实错误栈才看清根因：

```
SyntaxError: Unexpected end of JSON input
    at memory-service.unit.test.js:630
```

**是「撕裂读」，不是时长赌注**：`writeFile` 先 truncate 再落内容，而测试的轮询恰好发生在后台懒补写入途中——`existsSync` 在 truncate 之后就已成真，此刻同步 `readFileSync` 读到空串/半截 JSON。产品侧没有这个窗口（向量读排在全局串行链 `serialized()` 里，不会与自己的写交叉），所以**只修测试读盘，没有改任何产品代码**，也没动一条断言的宽松度。

收口到模块级三件助手（与 `withVectorService` 同层，全文件共用）：`waitUntil(condition, description)`（有界轮询 200×10ms）、`readVectorPayload()`（读不通返回 `null`，即「还没写好」）、`waitVectorPayload()` + `vectorIds()`（基于前者）。全文七处断言读盘加 vectorIds 内部一处直接 `JSON.parse(readFileSync(vectorsFilePath))` 全部改走容错版：懒补 / delete / update 重算 / compact 两组前后读，以及 `backfillVectors 整体重建`（它的 `store` 懒补也在后台写，同样暴露在这个窗口里）。

同时把四处「必须已发生」的 `settle()` 正向等待换成 `waitUntil`（`settle()` 仅保留给「不得发生」类断言，方向容错）。**同族缺陷不止用户点的那一条**：`delete 同步摘除向量` / `update 内容变化后重算向量` / `compact 淘汰的记忆同步摘除向量` 三处与懒补同源；compact 那条还补了一条断言（`未淘汰记忆的向量不得被误删`），否则只验「被删的摘干净」、验不出「误删」。

**循环计数（文件法重跑，全部实测）**：

| 配置 | 红场次 / 总跑数 | 备注 |
| --- | --- | --- |
| 修复前（严格读盘） | **3 / 61** | 25 次→2 红 + 6 次→0 红 + 30 次→1 红；均为撕裂读 |
| 修复后（容错读盘） | **0 / 100** | 60 次 + 追加 40 次；每次 409 例全跑 |

两条**失败的对照臂必须如实记下**（它们不构成证据，但记录能防下次重踩）：
1. 第一版对照把 `catch { return null }` 改成 `throw err` → **40/40 全红**。因为严格版连「文件还不存在」的 ENOENT 也抛，这不是修复前的等价物，对照无效。
2. 第二版对照只让半截 JSON 抛（`MUT_TORN`）→ **0/40 全绿**，没复现红。撕裂窗口太窄，**无法按需复现**，这一臂同样不能用。

所以本轮承重证据是「修复前实测到 SyntaxError 栈 + 修复后 0/100」，不是对照臂。另：**单文件孤立跑 40 次 0 红**，该 flake 只在全套件并发负载下出现——往后验证 flake 必须跑全量，拿单文件绿当证据会漏。

（过程中还有一次判定式误报：我用 `echo "$out" | grep -q '^ℹ fail 0'` 作守卫，报出「12/12 全红」，而后续文件法同样代码 6/6 全绿——循环里管输出的方式不可靠，改成一轮写一个文件再汇总。）

### 4. 本轮收口计数（全部实测）

agent 单测 **409/409**（+4：service 层净 +2〔删旧钉 1、新增 3〕+ tokens 层 +2）；两份黄金评测 `memory-recall-eval` / `-eval-b` 原样绿、未重钉任何期望；
rag 集成（隔离部分）**24/24**；记忆冒烟 **21 项 0 失败**；根 vitest **1306/1306**；`npm run lint` 干净；`npm run build:silent` BUILD_SUCCESS。
产品侧改动仅 `tokens.js`（+13/-4）与 `service.js`（+5/-1）；标定临时件（两份 `_legacy-*.tmp.js`、探针脚本、落盘脚本）已删，工作树无残留。`api.integration.test.js` 仍未实跑（会干扰用户正在跑的 agent）。
