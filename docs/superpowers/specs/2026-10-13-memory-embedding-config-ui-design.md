# 记忆向量配置界面 设计文档

**日期**：2026-10-13
**范围**：计划五第二件。第一件（本地档 512 token 静默截断转为可见）已合入 `c3e27e5` / `237e40f`。

## 目标

把记忆语义召回（`memoryEmbedding`）的配置从「只能手改 `~/.ai-helper-agent/config.json`」变成扩展端可看、可改、可验证、可重建的界面。当前扩展端对 `memoryEmbedding` **零引用**（全仓搜索仅命中 `/api/rag/test-embedding`），改配置只能编辑 JSON：填错字段名（如 `baseUrl` 与 provider 侧 `endpoint` 的错位曾让远端档 100% 不可用）、维度靠猜、改完无从判断旧向量是否已作废。

注意：**手改配置本身不需要重启 agent**——`loadConfig()` 按文件 mtime 缓存（`src/config.js:116-119`），`getProvider()` 又按 `memoryModelKey` 重建，编辑文件即时生效。本界面解决的是「可发现、可验证、防填错、防漏重建」，不是「免重启」。

## 已核实的地基（无需新写）

| 能力 | 端点 | 现有行为 |
|---|---|---|
| 读配置 | `GET /api/memory/embedding-config` | 返回 `maskMemoryEmbeddingConfig()`：明文 `apiKey` 置空 + `hasApiKey` 布尔 |
| 写配置 | `POST /api/memory/embedding-config` | `saveMemoryEmbeddingConfig(body)`：mode 白名单校验；**空白 apiKey = 不修改**；dimensions 规整为非负整数；enabled 只认真 `true` |
| 探活 | `POST /api/memory/test-embedding` | 允许用请求体覆盖**未保存的草稿**；明文 key 缺省回落已存 key；返回 `{success, dimensions}` |
| 重建 | `POST /api/memory/reindex` | → `backfillVectors(t)`，返回 `{indexed,total,failedBatches,overWindow?}` |

配置字段（`DEFAULT_MEMORY_EMBEDDING_CONFIG`）：`enabled / mode / baseUrl / modelName / apiKey / dimensions / queryPrefix`；mode 白名单 `['openai-compat','local']`。

扩展端现成件：`agentApi(method, path, body)`（`src/options/toolbox-shared.js`，自带 baseUrl 与 Bearer token）、`escapeHtml`、`showToast`、`showCustomConfirm`；面板样板 `src/options/knowledge-panel.js`（endpoint/apiKey/model/维度四字段 + 测试按钮 + 自动回填维度 + toast）。

**改模型不需要重启 agent**：`service.js:73 getProvider()` 以 `memoryModelKey(cfg)` 为缓存键，配置一变即重建 provider。上一轮观察到的「维度陈旧」只发生在同一个 provider 实例内，不构成界面约束。

## 设计

### 一、agent 端：新增一个只读状态端点

`GET /api/memory/vector-status` →

```json
{ "success": true,
  "indexed": 41,     // memory-vectors.json 里的向量条数
  "total": 41,       // facts + summaries 条数（与 backfillVectors 的 items 同口径）
  "storedModelKey": "local|Xenova/bge-small-zh-v1.5|512",
  "currentModelKey": "openai-compat|BAAI/bge-m3|1024",
  "stale": true, "tier": "remote" }
```

- `stale = Boolean(storedModelKey) && storedModelKey !== currentModelKey`：**本次设计的核心收益**。它把「改了模型忘了重建 → 向量维度不符被召回静默跳过 → 语义通道悄悄退化成只剩词面」这个最难自查的坑变成界面上一个红标。
- 走 `memoryModelKey(cfg)`（`vectors.js:13`）与 `vectors.read()`（同文件 facade），不新造指纹算法。
- 在 `routes.js` 的 `handleEmbeddingEndpoints` 内新增分支（配置类端点本就不受「非 POST 即 404」约束，`memoryDispatch` 先分流再判 method）；service 侧新增 `vectorStatus()` 方法，用与 `backfillVectors` 同源的 `embeddingConfigProvider()` / `tierResolver()` 取值。
- **刻意不含 `overWindow`**：算它必须 `provider.tokenCounter` → 内部 `await _getPipeline()` → **触发模型下载**（正是上一轮踩过的 huggingface.co 镜像陷阱）。只读状态端点不得有这种副作用；超窗数继续在 reindex 响应里给（那时 provider 本来就要建）。
- 向量档未启用（`tier === 'none'`）时仍返回 200，`indexed` 照实（历史残留向量可见），`stale` 照实——「关着但有陈旧向量」是需要看到的状态，不是错误。

### 二、扩展端：options 页新增「记忆」Tab

| 文件 | 改动 |
|---|---|
| `options.html` | tab-nav 新增 `<button class="tab-nav-btn" data-tab="memory" data-i18n="memoryPanel.tabTitle">`（跟在 knowledge 之后）+ 新 `<div class="tab-panel" data-tab="memory">`，含头部总开关、状态卡、配置表单、条件字段区、按钮组、门控引导区 `#memoryGate` |
| `src/options/memory-panel.js` | 新建。导出 `initMemoryPanel()` / `refreshMemoryPanel()`，与 `knowledge-panel.js` 同构（`initialized` 幂等标志 + 事件绑定 + 缓存态渲染） |
| `src/options/index.js` | 在知识库 init 之后追加 `initMemoryPanel()` 与切 tab 时 `refreshMemoryPanel()`（两行，与 1266-1270 现有写法同构） |
| `src/shared/locales/zh.js` / `en.js` | 新增 `memoryPanel:` 命名空间，**双语齐补**（仓库无 i18n parity 测试，靠自查） |
| `styles/styles.css` | 复用 knowledge / toolbox 现有类，不新造视觉语言 |

数据流：进 tab → 并行 `GET embedding-config` + `GET vector-status` → 渲染；「保存」→ `POST embedding-config` → 成功后重新拉状态；「重建向量索引」→ 确认弹窗 → `POST reindex` → 展示 `indexed/total/failedBatches/overWindow` 并刷新状态卡。请求失败统一走 `showToast(..., 'error')`，不静默。

### 三、字段的显隐与约束

- 模式单选 `openai-compat` / `local`。选 **local** 时隐藏 服务地址 / apiKey / 维度 / **「测试连通性」按钮**，文案指向「本地档无需测试，保存后直接重建索引（首次使用需下载模型，可能数十分钟）」。理由：探活超时上限 `DEFAULT_EMBEDDING_TIMEOUT_MS = 8000`（`routes.js:14`，只作用于 test-embedding，与召回预算 `MEMORY_EMBED_TIMEOUT_MS` 分开算）对本地档第一次加载必红——给一个注定红的按钮不如把话说清。
- apiKey 输入框**永不回填**，占位文案「留空表示不修改」（agent 端已实现该语义）。
- 维度框允许留空：点「测试连通性」成功后按返回值自动填充并 toast 提示（照 KB 卡 `vectorDimsFilled` 的做法）。
- 模型名为纯文本输入，**不做预设下拉**（与 KB 卡一致；agent 端无 `/api/models` 端点，硬编码清单会随上游漂移）。
- **隐藏字段必须从 POST 请求体里缺席，而不是提交空值或 0**。`saveMemoryEmbeddingConfig` 只在 key 存在时覆盖（`input.dimensions !== undefined` 才写），而 `memoryModelKey` 取 `Number(c.dimensions) > 0 ? floor : 0`：若本地档把已存的 512 覆盖成 0，指纹立刻改变 → 界面冒报 `stale`，用户被迫做一次无谓重建。这条同样适用于 mode 切回 openai-compat 时的 endpoint/apiKey。

### 四、重建按钮（长任务）

实测本地档 41 条重建 = **23 分钟**（`EMBED_BATCH_SIZE = 10` → 8 批，首批含冷启动 106 秒），远端同量 127 秒；`agentApi` 是裸 fetch 无超时，按钮会挂满全程。因此：

1. 点击必过 `showCustomConfirm`，文案写明量级与「请勿关闭本页面」；
2. 进行中禁用按钮并显示进度态（无逐批回调，靠 `stale`/`indexed` 在完成后刷新收敛）；
3. `stale` 为真时状态卡标红并给出「点重建」的直达引导——这是配置改完最容易被漏掉的一步。

### 五、门控

沿用知识库面板的 gate 模式：agent 未连接 / RAG 依赖未就绪（本地档需要）时，`#memoryGate` 显示引导并把表单置灰，与 `knowledgeGate` 同款处理。

## 测试

- **扩展端**：新建 `test/unit/memory-panel.unit.test.js`，照 `knowledge-panel-disable.unit.test.js` 的先例——`// @vitest-environment jsdom` + `vi.mock('../../src/options/toolbox-shared.js')` 桩掉 `agentApi`，断言：拉配置回填、mode 切换显隐（含 local 隐藏探活）、apiKey 留空不提交该字段、`stale` 标红、重建走确认弹窗且结果字段渲染、接口失败走 error toast。
- **agent 端**：`agent/test/unit/memory-routes.unit.test.js` 追加 `vector-status` 用例（`stale` 真假两支、`tier:'none'` 仍 200、GET 合法）；`memory-service.unit.test.js` 追加 `vectorStatus()` 取数用例。反向验证照惯例 `git stash` 实现文件后应见红。
- 收口：`node --test` agent 单测全量 + 根 `vitest run` 全量 + `npm run build:silent`。

## 明确不做

- 侧栏（聊天面板）入口：侧栏无任何记忆 UI 基设，连接态/卡片/保存条都要从零搭，成本与本节收益不匹配。
- 记忆条目的增删改界面：本期只管向量配置。`POST /api/memory/manage` 已有，但没有界面不是本设计的义务。
- 分段索引（让超 512 token 条目的尾部重新可召回）：要改 `vectors.js` 的 id 语义与删除传播，强制全量重建并重标定阈值，分布一变 `0.48` 地板作废。
- 模型预设清单：见三。

## 已知限制（须写进界面文案，不藏）

1. 本地档模型嵌入在 512 token 处静默截断，实测真实库 41 条中 13 条超窗（最大 1111 token 只吃 512，覆盖率 46%）；本轮只赢在可见。
2. 本地档首次使用需下载模型（须走 hf-mirror，默认 huggingface.co 国内不可达），耗时数十分钟量级。
3. 改模型/维度后不重建，旧向量按 `modelKey` 整体作废，语义通道退化——已由 `stale` 显式化。
