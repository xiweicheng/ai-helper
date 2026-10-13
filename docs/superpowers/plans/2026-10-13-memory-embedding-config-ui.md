# 记忆向量配置界面 Implementation Plan

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

- [ ] **Step 1: 记录基线**

Run: `cd agent && node --test --test-reporter=tap test/unit/memory-service.unit.test.js 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 全绿。把 `# tests N` 的数字记下来（本段最近一次实测是 71），后续每步的「新增几条」以此为准。

- [ ] **Step 2: 写失败测试**

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

- [ ] **Step 3: 跑测试确认失败**

Run: `cd agent && node --test --test-reporter=tap test/unit/memory-service.unit.test.js 2>&1 | grep -E "not ok|vectorStatus|# (tests|pass|fail)"`
Expected: 新增 3 条红，报 `svc.vectorStatus is not a function`；原有用例仍绿。

- [ ] **Step 4: 最小实现**

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

- [ ] **Step 5: 跑测试确认通过**

Run: `cd agent && node --test --test-reporter=tap test/unit/memory-service.unit.test.js 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 基线 + 3 全绿，0 fail。

- [ ] **Step 6: 提交**

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

- [ ] **Step 1: 写失败测试**

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

- [ ] **Step 2: 跑测试确认失败**

Run: `cd agent && node --test --test-reporter=tap test/unit/memory-routes.unit.test.js 2>&1 | grep -E "not ok|# (tests|pass|fail)"`
Expected: 前两条红（`GET /vector-status` 现在会掉进 404 分支，`statusCode` 断言失败），第三条绿——它是反向守卫钉，本就应通过。

- [ ] **Step 3: 实现分支**

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

- [ ] **Step 4: 跑测试确认通过**

Run: `cd agent && node --test --test-reporter=tap test/unit/memory-routes.unit.test.js 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: 基线 + 3 全绿。

- [ ] **Step 5: 确认既有冒烟不受新分支影响**

不往冒烟里新增项（本地档真实跑一次要 20+ 分钟，不适合放进自动收口）；只验证新分支没弄坏现有分发：

Run: `cd agent && node test/smoke/memory-pushdown.smoke.mjs 2>&1 | tail -3`
Expected: `合计 21 项，失败 0 项`（冒烟是脚本式，`node --test` 跑它只会报 `# tests 1`，必须直接 `node`）。

- [ ] **Step 6: 提交**

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

- [ ] **Step 1: 写失败的结构钉**

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

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/unit/memory-panel-structure.unit.test.js 2>&1 | tail -12`
Expected: 4 条全红（`data-tab="memory"` 不存在）。

- [ ] **Step 3: 加 tab 与面板 DOM**

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

- [ ] **Step 4: 补中英 i18n（键名与上面 data-i18n 逐字一致）**

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

- [ ] **Step 5: 补样式**

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

- [ ] **Step 6: 跑结构钉确认通过**

Run: `npx vitest run test/unit/memory-panel-structure.unit.test.js 2>&1 | tail -8`
Expected: 4 条全绿。

- [ ] **Step 7: 接线并构建**

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

- [ ] **Step 8: 提交**

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

- [ ] **Step 1: 写失败的行为测试**

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

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/unit/memory-panel.unit.test.js 2>&1 | tail -15`
Expected: 全红（空壳什么都不做）。

- [ ] **Step 3: 实现面板逻辑**

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

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/unit/memory-panel.unit.test.js 2>&1 | tail -12`
Expected: 全绿（约 10 条）。

- [ ] **Step 5: 跑两条相关测试 + 构建**

Run: `npx vitest run test/unit/memory-panel.unit.test.js test/unit/memory-panel-structure.unit.test.js 2>&1 | tail -8 && npm run build:silent 2>&1 | tail -3`
Expected: 全绿 + `BUILD_SUCCESS`

- [ ] **Step 6: 反向验证**

```bash
git stash push -- src/options/memory-panel.js agent/src/memory/service.js agent/src/memory/routes.js
npx vitest run test/unit/memory-panel.unit.test.js 2>&1 | tail -6
cd agent && node --test --test-reporter=tap test/unit/memory-service.unit.test.js test/unit/memory-routes.unit.test.js 2>&1 | grep -E "^# (tests|pass|fail)"; cd ../
git stash pop
```
Expected: stash 后新增用例见红；pop 后全绿。

- [ ] **Step 7: 提交**

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

- [ ] **Step 1: agent README 中英各补**

端点表加一行 `GET /api/memory/vector-status — 向量索引状态（条数 + 指纹陈旧，只读，不触发模型加载）`；用户可见行为段补：「options 页新增「记忆」Tab：可开关语义召回、切换远端/本地、探活回填维度、保存配置、重建向量索引；状态卡会标出『模型已变更未重建』」；已知限制段沿用 512 截断与本地首次下载两条。

- [ ] **Step 2: CHANGELOG 新增小节**

`### 新增（记忆向量配置界面）` 写扩展端面板 + 新端点 + 为什么不含 overWindow（只读端点不得触发模型下载）；`### 更正` 记 spec 自审抓到的一处错话：手改 config.json 即时生效（`loadConfig` 按 mtime 缓存），界面价值是可发现/可验证/防填错，不是免重启。

- [ ] **Step 3: 全量回归**

```bash
cd agent && node --test --test-reporter=tap 2>&1 | grep -E "^# (tests|pass|fail)"   # 基线 330，本次 +6
node test/smoke/memory-pushdown.smoke.mjs 2>&1 | tail -3                              # 21 项 0 失败
npx vitest run 2>&1 | tail -8                                                          # 全量绿（以运行前基线为准）
npm run build:silent 2>&1 | tail -3                                                    # BUILD_SUCCESS
git status --porcelain -uall | wc -l                                                   # 0
```

- [ ] **Step 4: 提交**

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
- 既有债：agent 代码从未被 eslint 覆盖（根 `eslint.config.js` ignores 含 `agent/**`）、2 条既有集成失败、版本号仓库 2.2.0 vs 全局 2.1.0、main 上多个提交未推送、wiki 未同步
