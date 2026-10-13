# 更新日志 (Change Log)

本文件用于追踪项目的核心变更，方便后续总结与发布。

## 2026-10-13

### 变更（记忆向量配置界面：四项体验反馈 + 一次数据污染事故的修复）
> 用户实机使用后回报四项体验问题，另在收口时发现上一轮留下的 agent 测试夹具会写坏用户的真实向量缓存（见本节末「事故」）。

- **状态卡不再把「读失败」伪装成「读取中」**（上一轮的缺陷）：`agentApi` 原先 `return resp.json()` 丢掉状态码，`renderStatus(null)` 又把 404 与「尚未请求」合并成同一句 `statusLoading` → 永久「读取中…」。现在 `toolbox-shared.js` 给解析后的对象附 `data.httpStatus`（**字段名不用 `status`**，避开响应体已有的同名字段，与 `background/local-agent-client.js` 同一惯例；改前 grep 核过 43 个调用方无整体展开/回塞），面板改三态：加载中 / 成功 / 失败（`httpStatus === 404` → 提示「当前代理版本没有这个状态接口，请重启代理后再看」，其余失败附 `返回信息: <code>` 真实错误），未连接另给 `statusOffline`，不谎称读取中。`loadAll()` 拆成 cfgTask / statusTask **两个并发但各自独立降级**的请求：状态读失败不得拖垮配置回填（先改成了串行 await，与既有「并行拉取」语义相背，已改回）。
- **两颗同名不同物的保存按钮改成可区分**：底部 `#saveBtn` 写 chrome.storage 扩展设置，面板那颗写 agent 的 `config.json`——不是重复功能，故不删除而是**改名 + 加职责说明行**：按钮文案改「**保存到代理**」（用户指定措辞）/ `Save to Agent`，面板新增 `.memory-scope-hint`（「本 Tab 的配置写入代理（本地 agent 服务）的 config.json；页面底部的「保存」只存扩展自身设置，两者互不影响」）。**术语冲突已记录**：仓库 zh 里「代理」同时也是 `data-tab="agent"` 那个 Tab（`tabAgent`）的名字，说明行因此显式写成「代理（本地 agent 服务）」降低歧义。
- **修掉「刷新配置页后记忆 Tab 跳回基础」**（用户描述为「那个 G 的 tab 不正常」，即「记」）：根因是 `src/options/index.js:55` 的 `validTabs` 是硬编码白名单，上一轮新增记忆 Tab 时忘了同步 → `#memory` 被判非法 → 掉回 HTML 默认 active 的「基础」。同时把刷新收敛成 `tabRefreshers` 注册表并在 `switchTab()` 末尾派发：激活一共有四条路径（按钮 click、hash 直达、`optionsInitialTab`、`SWITCH_TAB` 消息），刷新若只挂在按钮 click 上，F5 与从侧边栏跳进来这两条会停在空数据。**注册必须早于 `activateByHash()`**，否则深链接那一条仍漏。
- **记忆弹层新增「＋」跳配置快捷入口**：`side_panel.html` 标题行右侧新增 `#memoryLimitConfigEntry`，**图标与 MCP/Skill 那颗逐字一致**（同一 `M12 5v14` / `M5 12h14` 加号、22×22、同一 hover 色），走同一通道 `OPEN_OPTIONS_PAGE` + `hash: 'memory'`。定位用 `margin-left:auto; flex:none`，不抢 `stopPropagation`（它在 dropdown 内部，文档监听靠 `contains(e.target)` 不会关掉弹层）。中英各新键 `memory.configEntry`。
- **英文整排 Tab 省略号**：实测容器内宽 540px，英文 8 个 Tab 自然宽合计 **550px**，只差 10px 就让整排全部截断 2–4px（中文 526px 放得下，所以只在英文复现）。修法不是继续缩字号而是**去掉 `min-width:0` + 给 `.tab-nav` 加 `flex-wrap:wrap` + `padding: 10px 6px → 10px 4px`**：`min-width:0` 允许按钮缩到文字以下，代价就是整排省略号；现在宽窗单行、真放不下才换行，任何宽度零截断。

### 事故（上一轮留下的 agent 测试夹具写坏用户真实数据，本轮修复）
- **泄漏方式**：`memory-service.unit.test.js` 的 `withService` 与 `memory-routes.unit.test.js` 的 `withRouter` **只注入了 `filePath`**。`createMemoryService` 的 `embeddingConfigProvider` 默认就是 `getMemoryEmbeddingConfig` → `loadConfig()` 读用户真实 `~/.ai-helper-agent/config.json`，`vectorsFilePath` 缺省 → facade 默认落 `VECTORS_FILE`。本机一开记忆向量，这些“单测”就会**拿真 key 联网**（实测单条耗时 827ms）并把向量**写进用户真实缓存**。
- **后果（实测）**：用户 `memory-vectors.json` 的 41 条被覆盖成 2 条测试条目（`upsertVectors` 在 `cur.modelKey !== modelKey` 时整体作废旧向量）。真源 `global-memory.json` **未被碰**（mtime 20:22、41 条完好），属派生缓存，可重建。
- **恢复**：经用户授权后调 `POST /api/memory/reindex` 两次重建（均 `indexed:41 total:41 failedBatches:0`），再用 `dropVectors` 清掉测试残留的 7 条孤儿；端点实测 `GET /api/memory/vector-status` 回 `200 {indexed:41,total:41,stale:false,tier:"remote"}`。**泄漏已堵的硬证据**：修复后跑全量 agent 单测，该文件的 mtime 与字节数跑前后逐字相同（`14:04:55.328Z` / 1043714B）。
- **上一轮的记录在此作废一条**：`withStatusRoute` 的注释当时已写明「复用 withRouter 会读真实缓存」，但**只隔离了新夹具、没回头修老 harness**，属于已知风险未堵。
- **防复发**：新增 `agent/test/unit/memory-test-isolation.unit.test.js`（33 例）——**扫全部 `test/unit/*.test.js` 源码**，按括号配对取出每个 `createMemoryService(...)` 的实参，要求五个注入点（`filePath`/`vectorsFilePath`/`embeddingConfigProvider`/`tierResolver`/`embedderFactory`）齐备，并禁 `vectorsFilePath: VECTORS_FILE` 与无参 `createVectorStoreFacade()`。它当场又拓出第三处：`memory-recall-eval.unit.test.js` 缺 `vectorsFilePath`（靠 `enabled:false` 遮蔽，结构上仍是开的）。`withVectorService` 补上**默认抛错的 `embedderFactory`**（写在 `...opts` 之前，用例自带的照旧覆盖）：忘了供假 provider 应当当场炸，而不是静默回落去联网。
- **反向验证**：`git checkout HEAD --` 临时退回三个旧夹具文件 → 结构钉 3 红（逐个点名缺哪个注入点）且碎块用例回红（569ms，仍在联网）；恢复后 369/369 绿。**意外收获**：`只碰到 2 字碎块的条目不当成命中` 这条红不是召回实现被改坏，而是断言从「纯词面通道」漂成了「词面 + 语义」双通道——隔离回 A 档后它**本就该绿**（临时脚本实测 `tier=none total=1`）。
- **未采纳**：不动 `withStatusRoute` 的现有形态，不改 `RRF` 实现（碎块 vs 语义 top1 的名次取向仍是上一轮已登记的遗留项，本轮只消除测试环境的干扰）。

### 工程质量与测试（四项体验反馈）
- 新增/改写 22 例：`memory-panel.unit.test.js` 状态卡三态 describe 5 例 + harness 加 `nextStatus`/`statusThrows`；新文件 `memory-popup-quick-entry.unit.test.js` 4 例结构钉（按钮位置/type、＋ 图标与 manage 逐字一致、`OPEN_OPTIONS_PAGE` hash、中英 `configEntry`）；`memory-panel-structure.unit.test.js` +4 例（`validTabs` 子集钉、刷新收敛钉、保存文案/说明行钉、三态文案键钉）；agent 侧 `memory-test-isolation.unit.test.js` 33 例。
- 计数（均实测）：根 vitest **1298/1298**（84 文件，上一节 1285 + 13）、agent 单测 **369/369**（336 + 33）、`memory-service` **56/56**、`npm run build:silent` BUILD_SUCCESS、`npx eslint` 对 9 个改动文件零输出。
- **常驻探针三件**（`test-results-probes/`，已被 .gitignore 盖）：`_tab-nav-overflow.mjs` **16/16**（从 `options.html` + 两份语言包解析真实标签，8 宽度 × 中英零截断零横向溢出）；`_memory-config-entry.mjs` **13/13**（加载真实 dist 扩展：＋ 在 360px 弹层里 22×22、贴标题行右、与文字同行不截断，点击真打开 options 并停在 `#memory`，未连代理时状态卡是「代理未连接」而非「读取中」）；临时端到端探针 **14/14**（8 条 Tab 的 F5 全中、深链接回填、404 → 旧代理提示且不含「读取中」、vw=1440 单行零截断）。
- **上一轮的溢出探针记录作废**：当时用 `page.setContent()` + file:// 样式表，那其实是个 `about:blank` 文档、**样式根本没加载**（本轮前置断言 `cssApplied=false` 暴露），那次「全绿」结论不成立。本轮改用仓库内 file:// 夹具 + `goto` 重测，并把「先断言样式确实生效」写进探针；`git stash` 退回旧样式后同一探针退出码 1（en vw=1440 整排截断），新样式 0。
- **已知非全绿（与本改动无关）**：根 vitest 仍有 **2 处既有 unhandled rejection**（`apply-rag-tool-introduction.unit.test.js` 的 `document is not defined`，源头 `src/side_panel/tool-panel.js:921`）。已 `git stash push --` 本次全部改动后单跑该文件复现同一 2 错（1 文件 passed / 9 例全过但带 2 错），确认在干净 main 上就存在，本轮不背这个改动。
- **未跑项如实记录**：`agent/test/integration/*.test.js` 仍未运行（需连一个真实在跑的 agent，会打到用户正在运行的进程）；本轮用户授权的是一次 `reindex`，不是重启。

### 新增（记忆向量配置界面）
- **options 页新增「记忆」Tab**（`src/options/memory-panel.js`）：开关语义召回、远端/本地单选、读写 `memoryEmbedding` 配置、探活并自动回填维度、保存、重建向量索引。配置真值仍只在 agent 的 `config.json`，扩展端全部经 HTTP 打既有端点（`/api/memory/embedding-config`、`/api/memory/test-embedding`、`/api/memory/reindex`），**agent 业务逻辑零改动**。
- **新只读端点 `GET /api/memory/vector-status`**（`service.vectorStatus()` + `handleEmbeddingEndpoints` 分支）：`{ indexed, total, storedModelKey, currentModelKey, stale, tier }`。`stale = Boolean(storedModelKey) && storedModelKey !== currentModelKey`，**空库不算陈旧**（首次启用是正常态）；`tier === 'none'` 照返 200（「关着但有陈旧残留」是要看到的状态）。走 GET 而非 `ROUTE_METHODS`（后者只收 POST 业务动作）。路由上非 GET 落回通用分发（404），不新增业务路由。
- **刻意不含 `overWindow`**：拿超窗计数要 `await _getPipeline()`，那会**触发模型下载**——一个只读状态查询不得有这种副作用，所以 `overWindow` 仍只在 `reindex` 响应里给。
- **本地档隐藏探活按钮**：探活上限恒 `DEFAULT_EMBEDDING_TIMEOUT_MS = 8000`，而本地档首次调用要先加载模型（实测首批冷启动 106 秒）——与其给一个必定红色的「超时」，不如不给按钮，改由说明文案指路「保存后直接重建」。
- **提交体守「缺席」语义**（表单核心规则，`collectPayload()`）：看不见的字段从请求体里**缺席**，绝不交空值或 `0`。因为 `memoryModelKey = mode|modelName|dimensions` 且 dimensions 取 `Number(d) > 0 ? floor : 0` —— 把已存 512 覆盖成 0 会改变指纹、界面冒报 `stale`、逼用户做一次无谓重建；`apiKey` 留空同理（agent 语义：不传即不改，且明文 key 永不回显）。
- **重建走确认弹窗**（`showCustomConfirm`），提示里写实测耗时（本地档 41 条约 23 分钟 / 远端约 2 分钟）——`agentApi` 是裸 fetch 无超时，长任务期间不锁按钮会并发两个全量重建。结果区如实展示 `indexed/total`、`failedBatches`、`overWindow`（藏掉批失败与超窗等于骗人），`skipped` 说成「向量档未启用」而不是报错。
- **i18n 中英各 45 键齐补**（`memoryPanel:`）；面板沿用 knowledge 的既有类（`tab-panel`/`form-group`/`global-toggle`/`kb-vec-test-row`/`toolbox-add-btn`），新增 `.memory-status*` 与 `.memory-gate*` 写在 `src/options/styles.css`（options.html 只引用该文件，写根 `styles/styles.css` 不生效）。

### 新增（结构契约钉：弥补仓库无 i18n parity 测试）
- `test/unit/memory-panel-structure.unit.test.js`（4 例）直接读 `options.html` 与两份语言包文本：Tab 已挂载、面板所需 15 个 id 逐个存在、mode 单选两个值与 agent 白名单逐字一致、`memoryPanel:` **中英键集完全相等**。行为测试用的是自拷 DOM 夹具，真实页面漏 id 它看不见；中英漏键仓库历史上没有 parity 测试，本例就地补上这一类风险。

### 工程质量与测试（记忆向量配置界面）
- 新增 20 例：agent `memory-service` +3（条数与换模型 stale、空库不算陈旧、向量档关着照返统计）、agent `memory-routes` +3（GET 合法 200、stale 透传、非 GET 落 404）、扩展端结构钉 4 + 行为钉 10。
- 计数（均实测）：`memory-service` **56/56**（基线 53 + 3）、`memory-routes` **15/15**（基线 12 + 3）、agent 全量单测 **336/336**、冒烟 **21/21**、根 vitest **1285/1285**（83 文件，本次 +14）、`npm run build:silent` BUILD_SUCCESS、`npx eslint` 对新增/修改的扩展端文件零输出。
- **反向验证**：Task 1/2 分别 `git stash` 退回 `service.js` / `routes.js` 实现后见红（3 红 / 2 红）且红因准确（`svc.vectorStatus is not a function` / `statusCode 404 ≠ 200`），pop 后转绿；Task 4 stash 退回 `memory-panel.js` 空壳后 10 例全红。全部 agent 测试用 `mkdtempSync` 临时目录 + 注入 `embeddingConfigProvider` / `tierResolver` / `embedderFactory`，**零联网、零下载模型、不碰 `~/.ai-helper-agent`**。 —— **本句末段为错定**（已由同日「事故」节推翻）：只适用于 `withVectorService` 与 `withStatusRoute` 两个新夹具，`withService` / `withRouter` / `memory-recall-eval` 三处开的是真网、写的是用户真实向量缓存，本轮已修。
- **tab 栏溢出探针**（用完即删）：第 8 个 Tab 加入后，静态复刻真实 `styles.css` 跑 8 个宽度 × 中英，`tab-nav` 无溢出、页面无横向滚动、无一个按钮文案被省略号截断（沿用上一轮 `min-width:0` + 窄屏断点的修复，本次无需再改）。 —— **本条结论作废**：探针用的 `setContent()` + file:// 样式表在 `about:blank` 下根本不加载样式，那是一次假绿灯；英文整排在真实页面上是截断的，已由同日上方「四项体验反馈」节的 `flex-wrap` 修复与重测探针处理。
- **未跑项如实记录**：`agent/test/integration/*.test.js` 本次未运行——它需连一个真实在跑的 agent（`127.0.0.1:18910` + token），会打到用户正在运行的进程上；新端点的影响面已由 `memory-routes` 单测 + 冒烟覆盖。

### 更正（记忆向量配置界面：spec 自审抓到的错话）
- **「用户改模型只能改文件再重启 agent」不成立**：`agent/src/config.js:116-119` 的 `loadConfig()` 按文件 **mtime** 缓存，手改 `config.json` 即时生效；`service.js:73 getProvider()` 又以 `memoryModelKey(cfg)` 为缓存键，改模型会自动重建 provider。因此这个界面的价值是**可发现、可验证、防填错、防漏重建**，不是「免重启」（spec 已就地改写）。
- **样式文件归属**：spec 初稿写 `styles/styles.css`，而 `options.html:824` 只加载 `src/options/styles.css`，写错位置不会生效。
- **计划执行偏差（详见 `docs/superpowers/plans/2026-10-13-memory-embedding-config-ui.md` 末尾「执行记录」）**：Task 1 基线实测 **53 例**（计划写的 71 为错定）；Task 1 第二条用例前提修正——向量档开着时 `store()` 会 fire-and-forget **懒补一个向量**，所以「开启态空库」在真实系统里不存在，该用例必须同时供上 `tierResolver: () => 'none'`；Task 4 实现去掉了两个只写不读的模块变量（`busy` / `cachedConfig`，锁按钮以 DOM 状态为准）；新增样式改用项目实际调色板（options 页无 CSS 变量也无暗色模式，`var(--text-secondary, #666)` 这类写法只会退成硬编码值）。

### 新增（本地档嵌入静默截断转为可见）
- **真缺陷：本地档在 512 token 处静默截断**。`feature-extraction` pipeline 内部带 `truncation: true`，而 `Xenova/bge-small-zh-v1.5` 的 `tokenizer.model_max_length = 512`：超出部分**根本不进向量且原先零信号**。走真实接缝（`toEmbeddingProviderConfig` → `EmbeddingProvider.tokenCounter` → `memorySearchText`）实测真实库 41 条：**13 条超窗**，最大一条 1111 token 只吃进 512（**覆盖率 46%，599 token 直接丢弃**），全库 token 中位数 385。知识库侧不受影响（默认 `chunkSize: 400` 已在窗口内）。
- **本轮只赢在「可见」**：`agent/src/rag/embedding/local.js` 新增 `countTokens(texts)` → `{ counts, window }`（关键：必须带 `truncation: false`，跟着 pipeline 的口径只会永远数到 512）；`EmbeddingProvider` 以 `tokenCounter` 暴露能力，**远端档置 null**（厂商截断行为从返回的向量里看不出来，不得臆造一个窗口）；`backfillVectors` 响应新增 `overWindow: { count, window, ids }` 并向进程日志点名（`[Memory] N items exceed embedding context window ...`）。检测按能力探测而非 tier 判；计数抛错/超时一律不报，**不得因此把索引报成失败**；零超窗时报 `count: 0`（与「无从判断」区分）。`POST /api/memory/reindex` 原样透传，扩展端零改动。
- **未采纳的两个选项**（均已向用户列出并拍板不做）：分段索引（一条多向量、需改 `vectors.js` 的 id 语义与删除传播、强制全量重建、还得重标定 0.48 地板）与「窗口内保头尾」压缩（同样触发重标定）。本轮不改向量内容 → **分布未变，上一节标定的 0.48 地板继续有效**。
- **已知噪声（非缺陷）**：同一条记忆的向量确实随分批组合漂移，但不是 mask 的问题（`mean_pooling` 逐位置乘 mask、按 mask 计数求平均）：实测逐条 vs 同批 cos 0.9940–0.9974（元素级最大差 ~1e-2），**与同批有无长文本无关**，短条目最明显——属 `dtype: 'q8'` 量化核的数值噪声，只能靠换精度缓解。

### 工程质量与测试（本地档截断可见化）
- 新增 5 例：`memory-service` 4 例（超窗进响应与日志・零超窗报 0・无能力时不凭空造字段・计数抛错不拖垮索引）+ `memory-embedding-config` 1 例**能力接缝钉**（真 `EmbeddingProvider`：本地档有 `tokenCounter`、远端档为 null）。
- 计数（均实测）：两个改动文件 **71/71**；`memory-*` **155/155**（上一节 150 + 5）；agent 全量单测 **330/330**（上一节 325 + 5）；冒烟 **21/21**；`npm run build:silent` BUILD_SUCCESS。
- **反向验证**：`git stash` 退回 `service.js` / `embedding/index.js` / `embedding/local.js` 三处实现后 71 例中 **3 红**（两条行为钉 + 接缝钉；两条反向守卫钉本来就应绿，实现前即通过），pop 后 71/71。真实接缝验证在 `/tmp` 模型缓存副本上跑（`AI_HELPER_RAG_ROOT` 重定向），**未写用户真实数据目录**。

### 更正（作废同日上一节的两条错记录）
> 下列两条为**取证走了另一条路**导致的错定，原文已在本文件同日「记忆语义档改排名融合」小节就地改写。

- **错定 ①**：「`local.js` 未开 truncation → 1900 字被喂 1902 token，position id 越界」。**不成立**：`src/pipelines/feature-extraction.js:97` 就是 `{ padding: true, truncation: true }`；经真实 pipeline 实测 1852 字条目 `input_ids dims = [1, 512]`。当时的 1902 是用独立的 `tokenizer.encode()` 数的，**那不是真实调用路径**。
- **错定 ②**：「mean pooling 未使用 attention mask」。**不成立**：已安装入口 `dist/transformers.node.mjs:14888` 逐位置乘 mask、除 mask 计数。真正存在的只是上面那条 q8 量化数值噪声（以及被误归因的 512 token 截断）。
- **错定 ③**：「本地模型有效信息窗口约 1200 字」。**不成立**：`cos(全文, 前 1200 字) = 1.0000` 的真正原因是两者都被截到**同一个前 512 token**；那组数据从一开头就是「存在 512 token 截断」的证据。当年据此取消截断的**决定仍然正确**（库已在 512 token 截，按 400 字再截只是把同一刀往前推），但当时给的理由是错的。

### 变更（记忆语义档改排名融合）
> 本节**作废**同日「长期记忆语义召回通道」中「两路计分同尺」一条的实现描述：`+3 + round(cos × 4)` 与绝对余弦阈值已退场。

- **融合从「分数相加」改为「名次融合（RRF）」**：新增 `agent/src/memory/fusion.js`（纯函数、无 IO），关键词路与语义路各排各的名次，按 `1/(60 + 名次)` 相加后重排。旧公式把不可比的两套刻度相加（关键词是 content+3/title+2/tags+2 的整数分，余弦是 `[0,1]`），真实库上 41 条的 cos 全落在 0.26~0.64，被 `round(cos × 4)` 压成 4~6 三个整数 → 大量并列 → 并列由词面分打破 → 词面零命中的正确目标沉底（目标纯 cos 排第 1，融合后掉出前 12）。
- **语义采信门改为「查询级落点地板 + 条目级相对落差 + 条数封顶」**：`SEMANTIC_QUERY_FLOOR = 0.48`、`SEMANTIC_MARGIN = 0.05`、`SEMANTIC_MAX_TAKE = 2`。绝对 cos 用在条目级不成立（≥0.3 放过 40/41、≥0.45 仍放过 20/41），但用在**查询级 top1** 可分（无关查询 0.3340~0.4506 vs 相关查询 0.5467~0.6353，间隙 0.096）——top1 不过地板即判定「本库对这个查询没有答案」，整条语义路不给。
- **删除 `MEMORY_VECTOR_THRESHOLD` 与 `vectorHit` 旁路**：`service.js` 的 `s.vectorHit || isKeywordHit(s)` 让语义命中绕过关键词门槛，计划三建立的降噪成果只在向量关闭时成立（A 档 5 条查询返 1/0/0/1/1，B 档一律填满 limit）；`tier.js` 随之不再依赖 `DEFAULT_SEARCH_CONFIG.threshold`。
- **`vectorMatched` 语义变更**：由「过阈值条数」改为「被语义路采信的条数」（上限 2）。扩展端转发层 `...rest` 透传，**零改动**。
- **真机复测（41 条真实库，临时开、测完收回 `enabled=false`）**：控制组 4 条无关查询**全部 0 返回**（首要判据达成），填满 limit 的查询数 0，A 档开关前后逐字一致 `1/0/0/1/1`；4 条换说法查询目标均命中。**未达成项如实记录**：目标名次之和 8 > 计划的 6，逐条读记忆原文定位到那 2 名损失全部来自**词面路**（碎块与整词命中把语义 top1 压后）——用纯 cos 单通道理想值考核双通道融合属口径错定，取向问题转计划五。
- **本地档嵌入长度截断经实测取消**（原计划 Task 5 Step 2/3）：本地 `Xenova/bge-small-zh-v1.5` 对真实库 41 条（最长 1901 字）与合成 1900 字阶梯**全部嵌入成功、零失败**，计划所依据的「超长报 `400 {"code":20015}` 静默丢失」实为**远端** `BAAI/bge-large-zh-v1.5` 的证据（张冠李戴）；而按 400 字截断只会把同一刀往前推。`tokens.js` 本轮未改。（本条原先写的「超出模型有效窗口（实测约 1200 字）」为错定，见上方「更正」③：实际在 512 token 处截断。）
- **修复查询前缀回落权**：`memoryEmbedding.queryPrefix` 缺省是空串，而 provider 用 `??` 判空（空串不是 nullish）→ 本地档 BGE 的非对称检索前缀**永远加不上**（实测 provider 日志 `queryPrefix: off`）。`toEmbeddingProviderConfig()` 现在交出空白前缀时删除该键，把回落权还给 provider；显式前缀照常透传，远端档行为不变。
- **`reindex` 部分失败原因可见**：`backfillVectors` 原先只报 `failedBatches` 计数（原因既不入响应也不入日志，只有全部批失败才露首条），现在响应带 `lastError`（仅首条）、进程日志记全量 `[Memory] reindex batch failed: ...`。
- ~~新发现两个 provider 层缺陷（本计划不动，转计划五）~~ —— **本条为错定，已由同日「更正」①②作废**（未开 truncation / mask 未用均不成立）；当时的观测数据本身属实，只是归因归错了：那两条其实是 512 token 静默截断与 q8 量化噪声的症状。

### 工程质量与测试（记忆语义档改排名融合）
- 新增 `memory-fusion`（12 例，含一条专门钉住「不许把分离度加回来」的用例）与 **B 档效果评测**：`agent/test/eval/memory-recall-vector-golden.json`（真实 bge-m3 生成的 7 文档 + 8 查询黄金向量，128KB）+ `memory-recall-eval-b.unit.test.js`，测试内 `embedDocuments` 直接抛错 → 零联网复现真实 cos 分布形状。此前只测机制不测效果，才把「向量无可测收益」的错误结论写进文档。
- 常量不靠拍脑袋：`gap × margin × take` 与 `abs × margin × take` 两轮网格（合成 7 条库 + 真实 41 条库同时判定），分离度门被数据否定（无关查询 gap 0.0361/0.0397 高于真实目标查询的 0.0214，且不可跨库规模外推），地板取安全窗口 `(0.4506, 0.5163]` 中点。
- **回归钉的反向验证**：`memory-service` 原有 45 例对新旧规则**完全不敏感**（手搓向量是 0.98/0 的极端距离，结论不变）→ 新增 2 条 cos=0.4（≥旧 0.3、<新 0.48）的服务层钉，`git stash` 退回旧实现时**两条均红**；Task 5 的 3 条新钉同样在旧实现上红（66 例中 3 红）。新增走真实 `EmbeddingProvider` 的**接缝钉**（注入假工厂看不见配置字段错位）。
- 计数（均实测）：`memory-*` 单测 **150/150**；agent 全量单测 **325/325**（本轮起点 220 → 计划三 306 → 320 → 325）；A 档评测 10 例与原有 service 用例**一条未改**（零漂移护栏）；冒烟 `test/smoke/memory-pushdown.smoke.mjs` **21/21**；`npm run build:silent` BUILD_SUCCESS。扩展端 vitest **81 文件 / 1271 用例全通**（2 个预先存在的 `document is not defined` 未处理 rejection 不变）。
- 已知未修：agent 集成测试 **84/86**，2 条失败为**既有失败**（`~ 展开到用户主目录`、`路径穿越 .. 被限制在沙箱内`），用同一 `git stash` 法在旧实现上复现，与本轮无关；`eslint.config.js` 的 `ignores` 包含 `agent/**` 且 agent 无自己的配置，agent 代码**实际未被 lint**。
- 实施计划：`docs/superpowers/plans/2026-10-13-memory-rank-fusion.md`（含 Task 1~5 执行结果；前置实测 §2 的一条数据在 Task 2 被推翻并已就地更正，Task 5 的立论在 Step 1 实测被推翻，而 Task 5 执行结果自 §2/§3 又被后续取证二次更正）。

### 新增（长期记忆语义召回通道）
- **三档降级召回**：`recall` 在既有关键词计分之上可叠加一路向量召回。Tier A `none`（缺省，`memoryEmbedding.enabled: false`）行为与计分逐字不变、零新增网络调用；Tier B `remote` 走 OpenAI 兼容 embedding + 进程内余弦比对（≤ 70 条量级 brute-force，不引入向量库依赖）；Tier C `local` 需本机具备 RAG 依赖，依赖缺失静默降回 A。档位由纯函数 `agent/src/memory/tier.js` 判定，apiKey / modelName 均 trim 后判空（空白不得误判为已启用远端）。
- **向量是派生缓存**：新增 `agent/src/memory/vectors.js`，`~/.ai-helper-agent/memory/memory-vectors.json` 可整删、可损坏、缺失一律当空且不抛错；`global-memory.json` 仍是唯一真源。缓存键 `mode|modelName|dimensions` 任一变化即整体作废（维度不同无法比对），字符串 `'512'` 与数字 `512` 归一为同键。
- **两路计分同尺**：语义命中在整数关键词分之上叠加 `+3 + round(cos × 4)`，余弦阈值直接复用知识库默认值（`DEFAULT_SEARCH_CONFIG.threshold`）而不复制常数。未做归一化：关键词分是 content+3/title+2/tags+2 的整数刻度，RAG 检索是 `[0,1]` 余弦刻度，两套刻度不可比——归一会改写 A 档计分、破坏零漂移硬约束。
- **嵌入调用移出记忆互斥锁**：档位判定与查询向量在取锁之前完成（锁是进程内 Promise 链、无超时逃生口，一次 8s 挂起会堵死同进程所有写入），锁内只做纯计算与向量缓存读写；嵌入报错/超时该次召回静默退回关键词通道且仍返回 200。
- **生命周期对齐**：store 的新增、去重命中改写、update 成功后以 microtask 懒补向量（绝不 `await`——那等于给每次写入多加一个网络往返；去重分支也会改 tags，而 tags 参与 embedding 文本，不重算即留陈旧向量）；delete 与 compact 淘汰的条目同步 `dropVectors`，不残留陈旧向量。
- **三个新端点**：`POST /api/memory/reindex`（按当前配置全量重建缓存：未启用返回 `skipped` 且仍 200，嵌入整体失败才 400）、`GET|POST /api/memory/embedding-config`（明文 key 永不回显，附 `hasApiKey`）、`POST /api/memory/test-embedding`（探活，8s 超时保护）。`recall` 响应新增 `tier` 与 `vectorMatched`，扩展端转发层经 `...rest` 原样透传，**零改动**。
- **修复配置字段名错位**：`memoryEmbedding` 存的是 `baseUrl`，而 `rag/embedding` 的 OpenAI 兼容后端读 `endpoint`——缺这一映射时远端档永远请求 `/embeddings`（报 `Failed to parse URL`），对任何真实端点都 100% 不可用。现由 `toEmbeddingProviderConfig()` 单点映射，service 与 routes 两个 provider 创建点都过它。该缺陷只在真链路上暴露：单测注入的是假工厂，只有冒烟走真实 provider 才炸出来。
- 附带修复：`updateConfigField` 自锁（保存配置时死锁）；记忆关键词提取从 service 内联抽出为 `agent/src/memory/tokens.js`（纯搬迁锁行为，为向量文本口径留出单点）。

### 工程质量与测试（记忆语义召回）
- 新增 `memory-tokens`（7）/`memory-vectors`（12）/`memory-tier`（9）/`memory-embedding-config`（14）单测，`memory-service` 追加向量通道 17 例（recall 融合 9 + 生命周期 8）、`memory-routes` 追加 reindex 4 例；记忆相关合计 115 例。Agent 全量 `node --test test/unit/*.unit.test.js` 220 → 290 passed / fail 0，原有 25 条 A 档记忆用例一条未改、一条未红（零漂移护栏）。
- 端到端冒烟 `memory-pushdown.smoke.mjs` 16 → 21 项：预置「已启用但端点不可达」的 embedding 配置（`http://127.0.0.1:1/v1`，不真联网），断言配置脱敏、不可达时 `recall` 仍 200 且 `tier=remote`/`vectorMatched=0`、不留半成品向量文件、`reindex` 与 `test-embedding` 明确 400 而非 500，并断言错误文案不是 `Failed to parse URL`（证明配置的 baseUrl 真到了 fetch 层）。真连 provider 的正向验证由单测的假 provider 承担。
- 文档：`agent/README.md` / `README.zh-CN.md` 中英对称补「语义召回通道（Tier）」小节与三个新端点行，配置表加 `memoryEmbedding`。扩展端代码未改动，`npm run build:silent` BUILD_SUCCESS。版本号未手动修正（由 `npm run release:agent` 统一同步）。
- 实施计划：`docs/superpowers/plans/2026-10-13-memory-hybrid-recall.md`（每个 Task 附「执行结果（已实施）」，记录融合刻度不可比、searcher 导出回退、reindex 不可走通用分发、冒烟期望从 `success: true` 更正为 400 等偏差）。

### 变更（记忆关键词通道对齐知识库）
- **计分口径换血**：`agent/src/memory/tokens.js` 从「把 query 炸成最多 30 个碎 bigram、每个命中 +3」改为「最长命中片段的单元制」（L=2→1 单元 / L=3→2 / L≥4 顶格 3，每字段封顶后×字段权重）。旧口径下「写网」「个国」这类随机 2 字块几乎必然命中某些长条目，且命中 4 个碎块（+12）高于命中一个 4 字整词（+3），**排序方向是反的**；知识库侧 2026-09 已修掉这两点，记忆侧一直沿用更早方案。
- **与知识库共用一份匹配实现**：匹配语义（切段 / 英文词边界 / 中文最长片段）上收为 `agent/src/rag/keyword-match.js`，`rag/searcher.js` 逐字平移复用（**既有 18 条 searcher 关键词用例一条未改**），记忆与知识库不再各写一套。`rag` 命中 `storage` 这类子串误伤随词边界统一而消失。
- **两道噪声闸门**：① 文档频率剔除——命中过半候选的单元（如「项目」）无区分度不参与计分，`df ≤ 2` 恒豁免，与知识库同参数；② 命中门槛 `full || units >= 2`——整词/整段命中可直接成立，只碰 2 字碎块时需 ≥ 2 单元。门槛故意不看 `score`，否则整句 +5 仍会因 `rag ⊂ storage` 子串包含而误伤。
- **停用词表删除**：`STOP_WORDS` / `KEYWORD_CAP` / `SNIPPET_MAX_LENGTH` 随碎块方案一同退场——单元数按命中长度分层后，虚词无法单独构成长片段，两侧共用一份切段口径比再叠一层词表更不易漂移；旧实现还会把查询截到前 200 字使尾部整词丢失，现在不截（最坏情形 1852 字查询 × 41 条候选实测 46ms）。
- **行为影响（用 41 条真实记忆只读副本实测）**：5 条换说法查询的无关返回从 **43 条 → 3 条**（单条查询 8/6/3/16/10 → 1/0/0/1/1），词面可命中的 Vue 偏好仍稳定排 top1；`pnpm`、`依赖`、`rag` 三类单关键词短查询均仍能命中（门槛设计时专门避开误杀）。**代价**：词面只沾 2 字碎块的条目在 A 档不再被返回——「换个说法也能找到记忆」不是关键词通道能兑现的，属于向量通道（待做）的责任。
- **新增记忆召回评测集** `agent/test/eval/memory-recall-fixtures.js` + `memory-recall-eval.unit.test.js`：合成 7 条形态对齐真实库（超短 7~32 字 / 中等 200~600 字 / 长条目 1300 字量级）的记忆 + 10 条查询，把改动前基线量成 4 项红（碎块噪声 3 + 子串误伤 1）、后全绿。上一轮正是因为只测实现未测效果，才把「向量无可测收益」的错误结论写进了文档。
- 回归：agent 单测 **298 → 306 passed / fail 0**（既有 A 档 service 用例全绿不改）；冒烟 21/21；vitest 81 文件 / 1271 用例；`npm run build:silent` BUILD_SUCCESS。扩展端零改动。
- 实施计划：`docs/superpowers/plans/2026-10-13-memory-keyword-parity.md`（含真机更正与截断规则实测表：`score>0`/`units>=2`/相对截断/整句限定 四组候选的失败子项数）。

### 新增（会话上下文压缩增强）
- **结构化双语摘要模板**：`src/shared/compaction-prompt.js` 由自由段落改为固定四小节（任务目标 / 已完成与关键结论 / 关键标识符 / 未决问题与下一步），修复既有 i18n 缺陷——指令块随背景语言走 `getLanguage()` 渲染中英两套，素材限量与总量保留逻辑不变。`【已有摘要】` 标记与语言无关，增量压缩仍可识别。
- **注入链路单点收敛**：新增 `applyCompactionInjection()` 到 `src/shared/context-usage.js`，三条发送链路（`chat-manager.sendMessage` / `side_panel/index.js` 划词提示词 / `prompt-manager.sendPromptByCode`）改为同一出口，删除三处内联重复；锚点失效（`upToMessageId` 找不到）时只告警忽略、不污染系统提示词。以源码扫描守卫测试锁定三条链路不再各自漂移。
- **阈值驱动的半自动压缩（默认关）**：新增 `src/side_panel/auto-compaction.js`，发送前若「开关开 + 非生成中 + 会话隔离 + 距上次压缩待处理消息 ≥ 4 + 上下文占用 ≥ 阈值（默认 85%）」则静默压缩一次；连续失败 2 次进入退避不再骚扰，手动压缩成功即复位。**任何失败都放行本次发送**，不因为增益功能阻塞对话。占用比取值走 thunk，取不到时按 `usage_unavailable` 不尝试。
- **手动/自动共用单一压缩内核**：`context-indicator.js` 的 `triggerCompaction` 抽出 `runCompaction({ silent })`，静默模式跳过确认框与「压缩中」模态、只发 `autoCompactedToast`；两条入口不再各写一套流程。
- **摘要按 memoryId 去重沉淀长期记忆（默认开）**：新增 `src/background/compaction-memory.js`，压缩成功后把摘要以 `type: summary` / `category: decision` / `importance: 6` / `tags: [compaction, session:<id>]` 写入 Agent 长期记忆；同一会话二次压缩走 `update`（不堆条目），沉淀失败仅 `logger.warn` 且保留原 `memoryId`，Agent 未连接或缺端点（404）时静默降级——摘要仍在会话内可用。
- **两个开关**：记忆下拉新增「自动压缩」与「摘要存入记忆」两行，采用与 11px 小字相称的 28×16 小滑动开关（与工具配置弹窗同款 `.toggle-switch` 视觉语言、独立一档尺寸：关=浅灰空槽滑块居左、开=紫色滑块右移 12px），标签恒为中性灰、状态只由滑轨表达，ⓘ 同步收到 11px，两行共用一条分隔线；切换即写 `chrome.storage.local` 的 `chatAutoCompaction` / `chatPersistSummaryToMemory`，并同步 `storage.onChanged` 监听；`DEFAULT_CHAT_CONFIG` 与 `getChatConfig` 补 `autoCompaction`（默认 false）/ `autoCompactionThreshold`（默认 0.85）/ `persistSummaryToMemory`（默认 true）。

### 修复（压缩开关状态回填）
- **开关刷新后回弹**：「自动压缩」「摘要存入记忆」两行的 `.checked` 原先只在 `DOMContentLoaded` 的 `initMemoryLimitDropdown()` 里按 `state.chatConfig` 盖一次，而那一刻 `GET_CHAT_CONFIG` 尚未往返完成，拿到的是模块默认值（`autoCompaction:false` / `persistSummaryToMemory:true`），之后没有任何代码再回填——于是打开的开关一刷新就变关（关闭的「摘要存入记忆」则反向回弹成开）。修复为在 `loadChatConfig().then()` 里调用 `syncAutoCompactToggle()` / `syncPersistSummaryToggle()`，勾选态以 storage 配置为唯一真源。行为侧此前未被污染：自动压缩判定读的是已加载的 `chatConfig`，只是 UI 与实际开关不一致。

### 工程质量与测试（压缩增强）
- 新增 `compaction-prompt`（+6）、`auto-compaction`（18）、`compaction-memory-persist`（6）、`compaction-injection-wiring`（8，源码接线守卫）与 `context-usage`（+4）用例，后补开关回填守卫（+2，合计 10）；扩展端全量 vitest 81 文件 / 1271 用例通过（原 78 文件 / 1227，2 个预先存在的 `document is not defined` 报错不变）；`npm run build:silent` BUILD_SUCCESS。
- agent 侧代码未改动，回归 `node --test test/unit/*.unit.test.js` 仍 220/220；端到端冒烟 `agent/test/smoke/memory-pushdown.smoke.mjs` 补 4 项摘要沉淀断言（add 落 summaries → 不进常驻注入只计 Tier 3 → 跨会话按 `compaction` 标签可召回 → 同 id update 不新增条目），合计 16 项全通。
- 实施计划：`docs/superpowers/plans/2026-10-13-context-compaction-effectiveness.md`（含执行偏差修正：发送链路实为三条；沉淀函数落独立模块而非 `background/index.js`；语言判定复用既有 `getLanguage()` 而非新增 `summaryLang` 配置）。版本号未手动修正。

### 变更（长期记忆逻辑下推 Agent 端）
- **架构错位消除**：长期记忆的全部业务逻辑（存储、召回计分、会话去重、审查/淘汰、三级注入筛选）从扩展端 background 整体迁至 agent 包（`agent/src/memory/{injection,service,routes}.js`），与数据文件 `~/.ai-helper-agent/memory/global-memory.json` 同进程；agent 新增 `POST /api/memory/{store,recall,manage,inject}` 四个业务端点（签名与 i18n 沿用 rag 路由模式，零外部依赖、静态加载）。
- **扩展端瘦身为转发层**：`src/background/tool-memory.js` 由 752 行降至 85 行（只做 `subAction → action` 映射、`sessionId` 透传与结果整形）；`GET_PERMANENT_NOTES` 改为请求 `/api/memory/inject`；删除 `src/background/memory-injection.js`（纯函数已迁 agent）与 `tool-executor.js`/`index.js` 的 `readMemoryFile` 死导入。
- **原子性与生命周期修复**：记忆 read-modify-write 的互斥锁从扩展 SW 内存锁改为 agent 进程内 Promise 链锁，不再受 MV3 Service Worker 重启影响，也不再存在“跨 HTTP 两次文件 API 调用非原子”的丢写风险；会话召回缓存（`sessionRecalledMemoryIds`）随逻辑常驻 agent 内存，不再因 SW 休眠丢失；`manage compact` 淘汰的记忆同步从会话召回缓存摘除。
- **不兼容提示**：不做新旧版本兼容（插件与 Agent 对应发布）。插件遇到旧版 Agent 无记忆端点（HTTP 404）时直接返回升级指引（`toolMemory.memoryEndpointMissing`），**不再回退通用文件 API 读写记忆**；Agent 未连接时记忆能力整体不可用（不建本地双存储）。文案由 agent 按请求 `Accept-Language` 渲染，转发层仅保留 6 条本地校验文案。
- 行为保持：记忆数据结构、三级注入参数（常驻阈值 importance≥8 / 预算 1500 字符 + 12 条）、召回计分（content+3 / title+2 / tags+2 / 原句+5）、价值公式与淘汰线（value<10）均逐字平移，未新增功能；`recall` 响应中的 `accessCount` 仍为召回前副本（与原实现一致，递增值以落盘为准）。

### 工程质量与测试
- agent 新增 `memory-service`（25 例）/`memory-routes`（8 例）/`memory-injection`（18 例）单测，`node --test test/unit/*.unit.test.js` 220/220 通过（原 169）。
- 扩展端新增 `test/unit/tool-memory-forward.unit.test.js`（12 例，含将旧“接线守卫”按新架构改写后保留的 4 条源码断言）；全量 vitest 78 文件 / 1227 用例通过（2 个预先存在的 `document is not defined` 报错不变）；`npm run build:silent` BUILD_SUCCESS。
- 端到端冒烟 `agent/test/smoke/memory-pushdown.smoke.mjs`（12 项全通，压缩增强后增至 16 项，手动 `node agent/test/smoke/memory-pushdown.smoke.mjs` 运行，不纳入常规单测）：临时 HOME + 独立端口 18977 进程内拉起真实 server，跑通配对→store→recall（含会话去重）→inject→manage(review)→落盘位置→400/404 语义→delete 后不再注入。
- 实施计划：`docs/superpowers/plans/2026-10-13-agent-memory-pushdown.md`（含执行时的 5 处偏差修正记录）。版本号未手动修正：由 `npm run release:agent` 统一同步（单一版本流惯例）。

## 2026-10-11

### 新增（ReAct 循环工程优化）
- **任务状态锚点**：`plan_task` 拆解后在内存维护 `taskState`，每次 API 调用前瞬态回灌计划进度到上下文（不写入消息、不被 trim），长任务被压缩/摘要后模型仍不丢失目标与进度；与 checkpoint（chrome.storage）恢复链路打通。
- **大工具结果卸载（offloading）**：超阈值工具结果优先卸载到 Agent workspace 文件（`tool-results/{tool}_{callId}.txt`）保留全文可回读，无代理/写失败时回退智能截断。
- **阈值批量压缩**：上下文超阈值时一次 LLM 调用将多旧轮次批量压缩为结构化摘要（任务目标/已完成/关键事实/未决问题），保留首条原始用户问题，失败降级权重裁剪。
- **轮内工具部分并行**：同一轮 `tool_calls` 按可并行性连续分组、`Promise.all` 并发，结果按声明顺序回写并保持 `assistant(tool_calls)+tool` 邻接。
- **收敛提示与子任务预算**：迭代预算近 80% 时注入收敛提示；子任务迭代轮次与整体超时均受父任务实时剩余约束。
- **429 Retry-After + jitter / 400 超限自愈**：重试退避尊重服务端 `Retry-After`；命中上下文超限 400 时自动压缩重试。

### 变更（工具级反思下线）
- **移除工具级反思**（原为独立 LLM 调用，成本收益不匹配），改由零成本内联规则「工具观察提示」（`[Observation Hint]`）承担：工具失败/空结果/超大结果被压缩时追加规则提示引导模型自我调整。同步删除 Options「反思」Tab 的工具级反思开关、`DEFAULT_REFLECTION_CONFIG.toolReflection`、`react-reflection.js` 相关函数与 zh/en i18n；配置导入/导出两侧剥离历史遗留的 `reflectionConfig.toolReflection` 死字段。反思层级文档表述由「三级」改为「二级反思（子任务 + 后置）+ 工具观察提示」。

### 修复（代码评审驱动的回归与缺陷）
- 轮内消息重排将 `plan_task` 的子任务汇总 `user` 消息提到 `tool` 前，破坏 `assistant(tool_calls)+tool` 配对导致下一请求 400（Blocker）。
- `trimMessages` 以同名形参遮蔽外层引用、阈值压缩下重新绑定致消息丢失（高危），改为原地 `splice` + 数组收缩守卫。
- 任务锚点/收敛提示被上下文压力 `critical` 分支的 `filterApiMessages` 重建覆盖，调整为在压力裁剪之后注入。
- 批量压缩误删首条原始用户问题、摘要插入位置漂移；卸载路径 `toolCallId` 未清洗存在路径越界。
- 观察提示超大结果阈值与截断阈值同源（`MAX_TOOL_RESULT_TOKENS=6000` 上提为模块级常量，取代旧硬编码 24000）；并行下失败计数改为本轮总数口径避免少计。
- 批量压缩 transcript 输入封顶（默认 30000 token，可覆盖），防超长会话下压缩请求自身超窗白烧一次调用。
- 锚点回灌的 `taskState` 无结构校验（损坏/旧版 checkpoint 恢复会抛错终止循环），加 `Array.isArray` 守卫并调用处判空；清理 react-loop 死导入与 `context-summarizer` 死导出 `summarizeRound`。

### 工程质量与测试
- `npm run build:silent` BUILD_SUCCESS；全量 vitest 68 文件 / 1110 用例通过（2 个预先存在的 `document is not defined` 报错不变）。新增/更新回归：配对行为用例（真实 `filterApiMessages` 验证）、`#7` 子任务超时纯函数、`#8`/`#9` 锚点结构守卫与死导入/死导出清理、`#10`/`#11` 压缩封顶与阈值同源、`config-io` 导入剥离；移除随功能下线的 `summarizeRound` 及其用例。
- 文档同步（Tier A）：`docs/zh|en/DOCUMENTATION.md`、`README.md`、`README.zh-CN.md`、`docs/AI-Helper-作品介绍文档.md`。

## 2026-10-10

### 新增
- **页面引用系统（ref 树快照）**：`query_elements` 输出从扁平 JSON 升级为紧凑缩进树文本（`{role} "{name}" [ref N] {attr}`，content 字段直通模型，不再向模型暴露 selector）；元素发现升级为全树遍历 + 可交互判定（原生交互标签 / 17 类 ARIA 角色 / `tabindex>=0` / `onclick` / `contenteditable`；`display:none` 与 `aria-hidden` 子树剪枝、`visibility:hidden` 仅跳过自身、通用 div/span 透传不占缩进）；名称解析升级为多级优先级链（含 label[for] / 包裹 label / 前兄弟文本，覆盖未标记表单）；失效报错附「最近快照中的有效引用」（最近 ≤3 个）引导自我纠错；截断改为字符预算 `maxChars`（默认 6000）+ 输出上限 `maxResults`（默认 100）。
- **`interact_element` 新增 `action=type` 原子输入**：一次调用完成聚焦 +（可选）清空 + 设值 + input/change 事件 +（可选）Enter 提交（`value` / `clear` / `submit` 参数）；native setter 绕过 React/Vue 受控组件，contenteditable 走富文本路径；checkbox/radio/file 等非文本类型明确拒绝并报错。
- **`fill_form` 字段支持 `ref` 定位**：`fields.items` 新增 `ref` 属性（优先于 selector）；radio 场景按 name 在同组内匹配 value。
- **页面引用系统阶段二（叠加层提升 + 分页 + WeakMap 稳定编号）**：`query_elements` 打开的叠加层（`dialog[open]` / 展开的 popover / 含焦点的 menu·listbox / `aria-modal` 弹窗 / `aria-expanded` 触发源反查）提升到快照顶部 `[打开层]` 区块优先输出——打开层先于 `maxChars` 预算消耗、天然避开截断，主体区以 `[页面主体]` 标记并去重；无叠加层页面输出零变化。新增 `page` 分页（页大小 = `maxResults`，默认 100），返回 `page` / `totalPages` / `hasMore` 字段，`hasMore` 时尾行提示 `page=N+1`；非法 page 按 1 处理、越界返回范围提示不报错。ref 编号改为 WeakMap 跨快照稳定复用：同一元素编号不变（重查 / 翻页后旧 ref 仍可操作）、新元素才递增、编号永不转给不同元素；注册改为「发现即注册」（含未展示元素，翻页后前页 ref 可解析），selector 懒生成。
- **页面引用系统阶段三（iframe 内交互 ref 穿透）**：`query_elements` 升级为 background 编排（content 侧逐帧采集结构化 ops → 编排器 webNavigation 帧枚举 + 并行定向收集 → 共享渲染器统一输出），可见 iframe 以 `[frame #N]` 区块纳入快照、其内元素 ref 全局有效——`interact_element` / `select_dropdown` / `fill_form` 传入全局 ref 后由编排器解析为「帧 + 本地 ref」定向发送到所属帧执行，`fill_form` 自动按归属帧拆分并合并返回（失败项标注「（frame N）」）；失效 ref 报错附全局编号翻译的「最近快照中的有效引用」建议；子帧重载（loadId 变化）自动清除该帧旧 ref 映射，帧移除后编号表按 tab 维度清理；嵌套帧深度 ≤3、先序名额 ≤20（超限子树整体排除并在概要注记）；跨源 / 不可达帧显示占位行并保留全局编号（「（内容不可访问）」），隐藏 / 零尺寸帧不输出不编号；新增 `frames` 参数（`auto` 默认 / `none` 仅顶层帧）；无可见 iframe 页面（含 `frames:"none"`）输出与阶段二逐字节一致。
- **多模式循环检测升级（六模式 + 软提醒 → 硬停两级处理）**：ReAct 循环新增独立循环检测器（`src/background/loop-detector.js`，纯逻辑无浏览器依赖，每 run 一实例、按 tab 分桶），逐轮巡检工具调用轨迹覆盖六类无进展形态——① 重复调用（工具 + 参数 + 结果稳定哈希；轮询因结果入 key 天然不误报；窗口内 3 次软提醒、累计 8 次硬停；成功导航不入重复窗口）；② 页面元素枚举（`query_elements` 按 scope 记录已读页与结果哈希：合法顺序翻页豁免、重读结果未变或乱序跳页累计，疑似 3 次提醒、6 次 / 乱序 12 次硬停，非 query 调用即整体清零）；③ ABAB 振荡（动作身份不含结果的交替检测，最近 4 条提醒、8 条全交替硬停，含 back / forward 导航乒乓）；④ 失败作用域（6 类变更工具按目标归一——同 ref 的 click / type 视为同目标；失败 2 次提醒、3 次硬停，同目标一次成功即退休，用户拒绝计失败）；⑤ 导航处理（成功 back / forward / reload / wait_navigation 重置页面作用域计数——成功导航即进展证据，仅参与导航乒乓检测）；⑥ 无进展滚动（`scroll_to` 已在边界输出 `moved:false`，同方向 / 坐标 5px 网格 2 次提醒、3 次硬停，真实滚动即清零）；健康调用 2 次迟滞重武装，提醒实例级累计 8 次预算兜底硬停。软提醒合并为单条模型可见英文注入（用户不可见），硬停经既有 checkpoint 链路可带指导恢复（zh/en 硬停文案各 6 条，只增不改）；`scroll_to` 输出仅在「已在边界」时增加 `moved:false` 字段，其余场景逐字节不变；旧「入参+返参组合指纹」检测块被整体替换（无双检测器并行）。

### 优化
- **ref 解析统一为 `resolveByRef`**：`getSelectorByRef` / `getElementByRef` 收敛为薄封装，供下拉选择 / 表单填写 / 元素交互统一复用；`interactByRef` 成功返回值移除 `selector` 字段（避免长选择器诱导模型抄写）。
- **`query_elements` 工具描述与 zh/en 文案同步**：模型侧 description 与 `page` / `maxResults`（改为「每页元素数」）/ `maxChars`（改为「每页字符预算」）参数描述同步分页、`[打开层]` 提升与稳定编号语义。
- **demo 商品录入页模态框补齐标准 ARIA**：`.modal-card` 增加 `role="dialog"` / `aria-modal="true"` / `aria-labelledby`（无障碍改进，同时使模态框命中叠加层提升检测路径）。
- **`query_elements` 编排升级为 background + 工具描述同步（阶段三）**：`execution` 由 `content_script` 改为 `background`——帧枚举 / 并行收集 / 全局编号 / 跨帧路由由后台编排器调度；模型侧 description 与 zh/en 文案补充「可见 iframe 以 [frame #N] 区块纳入、其 ref 全局有效、frames:"none" 仅顶层帧」并新增 `frames`（`auto` / `none`）参数声明。

### 修复
- **`page-tools.js` 残留导出导致构建失败**：删除已随重构移除的 `readAccessibilityTree` 重导出。
- **`demo-product-form` e2e 路径失效**：文档目录迁移后用例仍引用旧路径 `demo/`，修正指向 `docs/demo/`。

### 工程质量与测试
- 新增/扩展单测：`page-interaction`（树输出 / 发现范围 / 剪枝 / 编号稳定 / 失效建议 / type 原子输入 / 分页 / 叠加层 / 采集与薄包装拆分 / 帧身份与可见性 / 结构化建议）、`interaction-tools`（fill_form ref 定位，含 radio 同组匹配）、`tool-definitions`（分页与叠加层及阶段三 schema 断言）；阶段三新增 `page-snapshot-renderer`（唯一渲染出口 13 条）、`snapshot-orchestrator`（帧枚举 / 三重对应 / 编号表 / 定向发送 / 重载清理 7 条）、`ref-routing`（路由判定 / 定向发送 / 翻译 / 分组合并 6 条）、`manifest`（webNavigation + match_about_blank 2 条）；全量 1004 通过。e2e 断言迁移至 `content` 树文本并新增 type 链路与分页 / 叠加层用例（全量 31 通过，含阶段三 iframe-ref 跨帧用例 6 条）；真实页冒烟探针 `test-results-probes/_ref-system-smoke.mjs` 19 项不变，阶段三探针 `_iframe-ref-orchestrator.mjs`（真实编排器直驱）26 项 / `_iframe-ref-extension.mjs`（真实扩展注入）2 项通过。
- 设计 spec 与实施计划：阶段一 `docs/superpowers/specs/2026-10-10-page-element-ref-system-design.md`、`docs/superpowers/plans/2026-10-10-page-element-ref-system.md`；阶段二 `docs/superpowers/specs/2026-10-10-page-element-ref-system-phase2-design.md`、`docs/superpowers/plans/2026-10-10-page-element-ref-system-phase2.md`；阶段三 `docs/superpowers/specs/2026-10-10-page-element-ref-system-phase3-design.md`、`docs/superpowers/plans/2026-10-10-page-element-ref-system-phase3.md`。
- 循环检测升级配套：新增 `loop-detector` 单测 36 条（六模式正反例 + 正常多步任务形状零误报 + 配置合并 + nullish 入参兜底）、`interaction-tools` 滚动静态判定 5 条（top/bottom/coordinates 双形态 + selector 不判定 + quirks 滚动容器）、`react-loop-loop-detector-wiring` 守卫 15 条（i18n 6 key 存在性 + 注入集合为单 `[System Notice]` 点 + 旧指纹 0 残留 + 记录锚点 ≥6 且带声明序号 `order`（反向断言）/ flush 前稳定重排 / 缓存命中锚点 / push 邻接位置守卫 / 硬停 loopStop 标记与子任务文案分支）；全量单测 1060 通过（基线 1004 + 56）；e2e 31 项不漂移；真实模块直驱探针 `test-results-probes/_loop-detector-probe.mjs` 23 项断言通过（正常形状零误报 + 六模式 + 导航重置不入重复窗口 + 导航乒乓尾迹钉住 + 提醒预算）。设计 spec `docs/superpowers/specs/2026-10-10-loop-detection-upgrade-design.md` 与实施计划 `docs/superpowers/plans/2026-10-10-loop-detection-upgrade.md`。

## 2026-10-09

### 新增
- **工具配置弹窗「敏感操作确认」开关**：弹窗底部新增「敏感操作确认」开关（`toolConfirmationEnabled` 顶层存储键、缺省开启）——启用后模型执行敏感操作（工具调用、命令执行等）时弹出确认框等待用户确认，关闭后所有操作直接放行；与配置页共享同一存储键（改一处全局生效），打开弹窗回显、切换即持久化、保存按钮再次落盘，悬停提示升级为完整两行说明（`toolPanel.confirmHint`，中英双语）。底部按钮区重构为弹性换行：`.modal-actions` 启用 `flex-wrap`，两开关包进 `.tool-toggles` 组、取消/保存包进 `.modal-btns` 组整体换行——宽约 490px 以上同行，不足时开关组一行、按钮组一行，极窄时开关上下排（修复取消留在开关行、保存被拆到下一行的问题）；探针全宽度扫描（290~520px × 中英文）82/82 断言通过。
- **工具配置按钮开关状态指示器**：「工具配置」按钮右上角新增白底胶囊角标，内含两粒常驻色块（左=工具预筛选琥珀 `#f59e0b` / 右=敏感操作确认绿 `#22c55e`），开启显对应色、关闭浅灰（`#d4d9e2`）；悬停提示升级为动态三行（基础提示 + 两行开关状态），由 `updateToolsConfigIndicators()` 唯一写入（HTML 不挂 `data-i18n-title` 防 i18n 覆盖，语言就绪与切换时自动重排文案），启动读取存储 + `storage.onChanged` 实时刷新；弹窗内两开关开启时滑轨同步染色（与角标颜色一一对应）、白滑块内显示同色 ✓，未勾选态由 `#ccc` 调浅为 `#e8eaf0` 空槽 + 轨道内描边 + 滑块阴影，增强「勾没勾」辨识度；新增中英文状态文案（已开启 / 已关闭）；探针 28/28 断言通过（四种组合显隐 / 颜色 / 尺寸 / 零布局位移 / 中英提示比对）。
- **侧边栏输入区一体化容器改造**：输入区重构为「一体化容器 + 底行工具栏 + 加号浮动菜单」结构，图片输入/截图/文件/开关等入口迁入加号菜单；底行新增 4 级空间降级链（① 温度数值折叠 → ② 助手名折叠为 emoji → ③ 记忆/工具/划词三组图标化 → ④ 划词收进加号菜单），由 `toolbar-adapt.js` 逐级测量触发，窄至 290px 仍无横向溢出；③ 级图标态统一规格（19px 高 = 13px 图标 + 2×2 内边距 + 1px 边框、圆角 6px）；探针 290~520px 宽度扫描回归。
- **加号菜单二级面板（双栏联动）**：加号菜单升级为「一级项 hover 展开二级面板」双栏结构（独立浮层卡片 260px、chevron 指示、200ms 防误触 + 入场动效、与 hover 项顶部对齐）；9 类面板全覆盖——提示词（行内 SVG）/ 网页（favicon，标题+网址双行）/ 技能（名称+描述双行、禁用降调）/ MCP（名称+服务 ID 双行）/ 知识库（停用徽标）/ 助手（激活 ✓）/ 代理（状态圆点 + 激活 ✓ + 禁用灰显）/ 工作目录（根目录一层、最近修改优先）/ 截图（整页/区域两动作）；搜索框即时过滤 + 一键清除 + 右侧「管理 ＋」直达对应管理界面；截图面板隐藏搜索框，一级项点击直达整页截图。
- **截图二级面板快捷键提示**：整页/区域两个动作项右侧新增快捷键键帽（`Alt+S` / `Alt+Shift+S`，与页面快捷键一致），用户在菜单内即可知悉；等宽小字 + 双层下边框拟键盘键样式，文案自动预留右侧空间。

### 优化
- **开关组件样式统一与快捷键弹窗宽度响应式**：options 页四类开关（`.toggle-label` / `.reflection-toggle-switch` / `.global-toggle` / `.toolbox-toggle`）样式语言统一为「未勾选 = 浅灰空槽（`#e8eaf0` + 内描边 + 滑块阴影）；已勾选 = 紫色轨道 + 白滑块内紫色 ✓」——表单控件伪元素显式声明字体栈、按旋钮尺寸匹配 ✓ 字号（18px 旋钮配 12px、16px 配 11px），消除与侧边栏开关的视觉不一致；快捷键弹窗容器宽度改为响应式 `width: max(90%, calc(100% - 40px))`（封顶由 460px 放宽至 640px），随侧边栏伸缩跟随、两侧至多 20px 边距，窄屏保持 90% 旧行为兜底（380 / 560 / 760 / 900px 四档宽度实测）。
- **窄屏③级图标态统一打磨**：修复记忆/工具/划词三组高度不齐（统一 19px）、工具组圆角偏圆（回归基础 6px）、工具图标与数字间距过大（18px → 11px）、右侧助手/温度按钮与左组高度不一（emoji 行盒锁定 13px、统一 2×2 内边距），五个按钮全部 19px 等高，配套探针几何断言（圆角/间距/五按钮等高）。
- **二级面板布局细节**：面板内项改双行展示（标题不被长文本挤压）、垂直位置与 hover 项顶部对齐、加号展开旋转 45° 成 × 过渡动效。
- **`$` 工作目录弹窗与菜单直达**：滚动两段式 sticky 头部 + 「+」冲突收起 + 引用区紧凑化；修复提示行遮挡并新增标题路径行；加号菜单「工作目录」项点击直达。

### 修复
- **③级图标态记忆角标隐形**：记忆总开关开启时的选中高亮规则（蓝字）特异性高于③级角标样式，蓝底白字徽标被覆写为蓝字致文字隐形；高亮规则收窄为仅非图标态生效。
- **@ 搜索合并列表默认选中**：网页/知识库项补 `selected` 标记，默认选中全局第一项，对齐 `/` 弹窗行为。
- **代理不可达探测降噪**：工作目录/家目录/状态详情探测请求在代理不可达时由 warn 降为 debug，避免控制台误报。
- **工具栏降级链重测防误判**：测量期禁用过渡 + 先恢复完整态再收集浮层，避免浮层动画干扰测量结果。

### 工程质量与测试
- 新增/扩展单测：`input-add-menu` / `input-add-menu-panel`（含截图快捷键键帽）/ `toolbar-adapt`（降级链）/ `workspace-manager`（@ 接入选）/ `agent-at-merged-selection` / `file-at-selector` / `prompt-manager-insert` / `skill-mcp-multi` / `knowledge-multi` 等；探针扩展：加号菜单二级面板（双栏/搜索/选择/几何）、输入区一体化容器（宽度扫描/降级链/菜单交互）、@ 搜索默认选中、底行窄屏几何（290~520px 八档）；`test-results-probes` 恢复为本地探针产物（停止跟踪）。

### 文档
- 新增「输入区一体化容器改造」设计 spec 与实施计划、「加号菜单二级面板（双栏联动）」设计文档与实施计划（`docs/superpowers/specs|plans/2026-10-09-*.md`）。

## 2026-10-08

### 新增
- **桌面通知与完成反馈**：新增桌面通知中心（`src/background/notifier.js`）——对话任务完成 / 失败、定时任务完成 / 失败、AI 等待确认 / 澄清三类场景可弹出桌面系统通知；配置页「基础」新增三个独立开关（任务完成或失败时弹出桌面通知 / 定时任务完成或失败时弹出桌面通知 / AI 需要你确认或澄清时提醒我），本地存储持久化、修改实时生效并随配置导入导出同步。通知创建权统一收敛到 background：`panel-visibility.js` 按发起实例判定侧边栏可见性——完成通知仅在看不到侧边栏时弹出（成功自动消失、失败停留至手动关闭），定时任务通知在后端执行时总是弹出，交互提醒仅在看不到侧边栏时打扰；点击通知自动打开侧边栏面板；多实例场景下按发起实例精确判定、通知去重。配套 `task-notifier`（284 行）/ `panel-visibility` / `completion-feedback` 单元测试。
- **选项页保存按钮栏吸附**：配置页内容超出一屏时，底部保存按钮栏吸附在视口底部（`position: sticky`）保持始终可见，滚动到底部后恢复原位；新增 `src/options/save-bar.js` 处理吸附状态检测与浮动类切换；配套 `options-save-bar` 单元测试（126 行）与 e2e 测试（87 行）。
- **模型上下文窗口滑杆设置**：模型选项行新增上下文窗口徽标与滑杆入口按钮，点击弹出滑杆浮层（新增 `src/options/ctx-popover.js`，单例挂 `document.body` + `position:fixed` 定位，规避模型下拉容器限高 240px + `overflow-y:auto` 的内部裁切）——12 档标准档位（1K~1M，1000 进制）拖拽时实时预览徽标（仅更新 DOM、不落存储），松手 / 键盘步进提交持久化，异常中断自动回滚预览，「恢复自动」一键清除自定义值回到自动推断。徽标双模式：显式设置为品牌色、自动态为内置推断值 + 灰色虚线 + tooltip；主模型与视觉模型均支持，预设模型手动设置自动标记 `isCustom`。`token-counter.js` 新增 `inferContextWindow` / `formatContextWindow` 统一各模块口径（侧边栏移除本地重复实现，模型下拉徽标自动态与 options 页对齐）；配套中英文案与 `ctx-popover` 单元测试（538 行）。

### 优化
- **plan_task 单独调用引导强化**：`plan_task` 工具描述与任务规划系统提示（中英双语）补充「必须单独调用」引导——调用时同一轮不要同时返回其他工具调用，其他想执行的动作编入子任务描述由子任务执行；`getTools` 中内联的中文工具描述改为走 `t('toolExec.planTaskDesc')`，与国际化统一维护。

### 修复
- **桌面通知可见性判定与重新弹出修复**：引入面板实例上下文镜像（窗口 ID / 作用域 / 宿主 Tab）与可见性快照机制——随任务反馈消息携带发起时刻的实例状态，通知判定不再依赖 keepalive 身份生命周期，修复跨通道 IPC 竞速问题；修复同 ID 通知被静默替换、横幅不重新弹出的问题（改为先清除再创建）；浏览器焦点状态管理引入三态语义处理冷启动查询补水；完善标签页绑定模式下宿主 Tab 的权威解析与回传覆盖机制；补充快照与上下文管理单元测试。
- **定时任务模型与厂商不匹配修复**：定时任务执行前新增模型配置一致性校验——历史任务保存的模型不属于当前激活厂商配置时自动回退为默认模型，并在任务结果中给出中英文提示，避免因模型与当前厂商不匹配导致任务失败；`model-profiles` 补充校验逻辑单元测试。

### CI / 发布
- **版本号统一管理（v2.0.0）**：发布脚本（`agent/publish.sh`）实现单一版本流——发布时同步更新根目录 `package.json` / `package-lock.json` / `manifest.json` 与 `src/config/version.json`，构建前完成同步确保 `dist/manifest.json` 版本正确；发布提交包含 agent 与根目录全部版本文件、以同一版本号提交并打 tag；新增发布前根目录版本文件状态检查（防止未提交更改被覆盖）与全部回滚操作的版本文件恢复；新增 `publish-script-order` 单测锁定版本同步契约与执行顺序。代理端版本 v1.17.7 → v2.0.0，扩展与代理端统一为 v2.0.0。

### 文档
- **Edge 商店上架审核文档补全**：`docs/Edge商店上架审核填写内容.md` 补充 tabGroups / alarms / debugger 三项权限的中英文说明（标签页分组、后台定时任务、页面调试工具）。
- **v2.0.0 文档全面对齐**：README（中英）/ docs 双语 DOCUMENTATION / agent README 对齐 v2.0.0 代码实况（31 项功能、桌面通知、DB v6、RAG CLI 与进程树等），`icons/badges/version.svg` 徽章更新至 2.0.0。

## 2026-10-07

### 新增
- **多实例消息路由防串台**：引入 keepalive 端口注册表管理会话连接，重构 background 消息发送逻辑支持点对点传输——多实例（多窗口 / 标签页绑定模式）场景下澄清弹框、工具确认弹框定向发送、只在发起实例显示，避免多标签页串扰；添加端口失效时自动回退广播机制；`state.js` / `tool-executor.js` / `react-loop.js` / `chat-manager.js` / `clarify-dialog.js` 配套改造；新增 `clarify-routing`（189 行）/ `confirm-routing`（182 行）单元测试验证多实例隔离效果。

### 优化
- **工具栏自适应逻辑抽离独立模块**：将输入工具栏自适应功能从 `index.js` 拆分为独立模块 `src/side_panel/toolbar-adapt.js`；修复浮层动画重播导致的闪帧问题；改进 MutationObserver 逻辑，避免不必要的重测触发；新增 `toolbar-adapt.unit.test.js` 单元测试。
- **默认上下文窗口 64K 提升至 256K**：`token-counter.js` / `token-store.js` 默认上下文窗口大小由 64,000 调整为 256,000，适配主流模型更长的上下文能力；同步优化正则表达式中换行符的处理方式。
- **厂商 / 模型选择下拉支持过滤搜索与名称排序**：新增 `compareByName`（中文拼音与英文混合排序）、`sectionSelectSearchHtml`（搜索框组件）、`filterSectionSelectList`（关键字过滤）等能力，厂商与模型选择列表集成排序与搜索——搜索框吸顶显示、选项区独立滚动；补充中英文案；新增 `section-select` / `provider-selector` / `model-profiles` 单元测试共 250+ 行。

### 修复
- **配置页下拉菜单溢出修复**：`src/options/styles.css` 为下拉菜单补充最大高度限制与垂直自动滚动（保留水平溢出隐藏），修复选项较多时下拉过度展开、遮挡或撑开页面其他元素的问题。
- **DeepSeek 余额查询优化**：仅当模型为官方 DeepSeek 且 API 地址为 `deepseek.com` 域名时才发起余额查询，避免第三方厂商的 deepseek 模型误触发私有接口导致错误；查询失败或无数据时直接隐藏余额区域而非显示错误信息，移除错误状态样式类与冗余国际化文案配置。

### CI / 发布
- **一键推送全部远端脚本（`push-all.sh`）**：新增脚本将当前分支推送到所有已配置的远端——自动检测全部远端并按 origin 优先、其余字母序排列的顺序推送，支持 `-f` 参数走 `--force-with-lease` 安全强制推送，单个远端失败不阻断其他远端并在末尾汇总结果，提供彩色日志与错误提示；集成 `npm run push:all` 命令；并支持 gh-pages 分支部署。
- **GitHub Wiki 自动同步 Gitee（`sync-wiki-to-gitee.sh`）**：新增全自动同步脚本（临时目录中转、自清理），`package.json` 增加 `npm run sync:wiki` 入口；`.wiki-tmp` 中转目录加入 `.gitignore` 并从索引移除（Wiki 内容由独立 wiki 仓库管理）。
- 代理端版本迭代至 v1.17.6。

### 文档
- **英文版 Wiki 页面**：GitHub Wiki 新增英文版页面（`Agent-Service-EN` / `Configuration-EN`，独立 slug + 双语侧边栏与 Footer）。
- **官网英文支持与导航优化**：`docs/index.html` 导航栏新增英文文档链接、页脚与操作区新增 Wiki 链接并支持中英文界面切换时动态更新；导航栏样式与响应式断点同步调整（链接间距、按钮内边距、断点 1024px → 1150px）。
- **社区联系方式更新**：README 与官网将 Discord 链接替换为 GitHub Discussions（社区贡献 / 赞助合作渠道、版本信息面板链接与国际化文案同步），并补充单元测试验证链接配置。

## 2026-10-06

### 新增
- **版本信息弹窗**：侧边栏头部下拉菜单移除 GitHub / Gitee 仓库链接按钮，替换为版本信息弹窗——展示版本号、Git 标签、提交 ID 与发布时间，支持一键复制版本信息，底部保留仓库链接入口；发布脚本自动生成 `src/config/version.json` 并提交，弹窗数据无需手工维护；配套中英文案与 `version-info` 数据 / DOM 两套单元测试。
- **工具配置按钮计数显示**：工具配置按钮新增已启用工具数量计数器；工具勾选状态与工具总开关保持完全独立的状态管理；MCP 服务按服务粒度计数；修复空数组配置被误判为「未配置」的问题。

### 优化
- **执行日志统计区自适应降级**：新增 `src/side_panel/log-summary-adaptive.js`（静态弹窗与实时模式共用）——宽度不足时由 `adaptLogSummary` 测量 `scrollWidth / clientWidth` 逐级降级：① 折叠组合块文案（执行节点 / 成功 / 失败…）② 再折叠总耗时 / Token 文案 ③ 极窄时整块换行兜底（防止右侧展开按钮被裁剪）；rAF 节流合并面板创建、统计数字更新与窗口 resize 触发的高频重测，空间恢复自动还原；悬停 tooltip 保留完整信息，自动适配中英文与数字长度差异；配套 `log-summary-adaptive` 单元测试。
- **记忆条数徽标样式统一**：记忆条数徽标从内联样式迁移至 CSS 统一控制，与工具配置按钮风格保持一致（悬停效果、激活态配色、数字字号对齐），修复按钮字体继承问题并统一显示格式。

### 修复
- **Service Worker 终止竞态防护**：扩展重载 / SW 终止瞬间 `chrome` API 可能被剥离为 `undefined`，模块顶层直接访问（如 `chrome.storage.onChanged`）会抛 `TypeError` 并整体中断 SW 启动（表现为 "No SW"、Unchecked runtime.lastError 告警）。background `index.js` / `scheduler.js` / `tool-executor.js` 顶层 API 访问统一改为可选链保护，顶层异步调用（getContexts / tabs.query / storage.get 等）改为 try/catch 静默降级；新增 `detach-window.js` 模块承接脱离窗口状态恢复——storage / windows 调用失败时按「无脱离窗口」降级（不再抛 TypeError 与告警），窗口已销毁时清理残留记录；配套 `detach-window-restore` 回归测试。

### CI / 发布
- **GitHub Release 自动构建发布**：推送 `v*` 标签或手动触发时自动执行 `npm ci` + `npm run build`，将 `dist/` 打包为 `ai-helper-<tag>.zip` 并创建 GitHub Release（`overwrite_files` 避免重跑时资产同名冲突）；`dist/` 构建产物退出 Git 版本控制（移除已提交打包文件并加入 `.gitignore`）。
- **Gitee 同步发布**：Release 工作流新增 Gitee 同步——tag 同步 + OpenAPI 创建发行版 + 附件上传；构建在 GitHub 免费 Runner 完成、Gitee 端仅同步发行版（未使用收费 Gitee Go）；附件上传采用「先传后删 + 失败重试（3 次，间隔 20s / 40s，单次超时 420s）」策略，解决跨境上传超时 / 502 导致附件被清空丢失的问题，同名同大小附件直接跳过；未配置 `GITEE_TOKEN` 时仅告警跳过；发行版说明同步与 HTTP 状态码校验等错误处理增强。
- **发布脚本（publish.sh）增强**：支持多远端推送（origin / gitee / atomgit）与交互式版本选择；git 工作区检查前刷新 index stat 缓存，修复文件被 touch 或编辑器重写时的清洁度误报；扩展发布流程重构为「写入 version.json → 重新构建 → 发布 npm」，构建失败时回滚 `package.json` 与 `version.json`；新增 `publish-script-order` 单元测试；`package.json` 新增 `release:agent` 命令；代理端版本连续迭代至 v1.17.5。

### 文档
- **安装指南全面更新**：README / DOCUMENTATION（中英）与官网页面（`docs/index.html`）、宣传文章统一改为推荐从 GitHub Releases 下载构建包安装，并补充下载链接与版本说明。
- **演示资源目录迁移**：`demo/form-autofill` 演示工程（表单页面 / 构建脚本 / 视频工程 / 数据文件）整体迁移至 `docs/demo/form-autofill`，`OPTIMIZATION_PLAN.md` 移入 `docs/` 目录，`.gitignore` 相关路径同步更新。

## 2026-10-05

### 新增
- **上下文占用指示器**：输入框下方新增占用百分比指示器（环形进度 + 三档配色：安全 / 警告 / 危险），点击弹出占用明细（系统提示词、工具定义、历史消息、当前输入四项分解与记忆设置状态）；数值与实际发送口径同源（记忆条数 / 窗口 / 压缩 / 预算四层一致）。
- **手动压缩上下文**：支持将携带的历史消息手动压缩为 AI 结构化摘要（会话级持久化、压缩点后插入分隔条可查看摘要 / 撤销），后续发送以摘要替代压缩点前的历史消息；采用覆盖式单摘要模型（再次压缩时旧摘要与新消息合并），与既有自动裁剪机制分层协同（摘要注入 system prompt 受保护，不影响自动压力判断）。
- **输入区当前模型名展示**：输入框下方右侧实时显示当前使用的模型名（与左下角上下文占用指示器对称）；过长时尾部省略号截断、hover 显示完整名称，侧边栏极窄（≤420px）时进一步压缩宽度；点击可直接打开模型设置浮层快速切换模型（随模型选择 / 会话切换 / 助手切换自动刷新）。

### 修复
- **工具调用卡片渲染崩溃修复**：Chrome 扩展消息采用 JSON 序列化，会把稀疏数组空洞变成 `null`——服务商 SSE 的 `tool_calls.index` 跳号（如直接从 1 开始）时上游 toolCalls 形成稀疏数组，侧边栏渲染工具卡片读取 `tc.function` 抛 `TypeError: Cannot read properties of null (reading 'function')`。新增 `normalizeToolCalls`（过滤空洞 / 无效元素并补齐缺失 id）统一流式归一化、STREAM_DONE 与 getResult 三个出口的数组稠密度，前端渲染入口同步过滤防御；新增 `stream-controller.unit.test.js` 回归测试（跳号 / null 元素 / 正常连续 index 三场景）。
- **上下文占用明细「当前输入」空值修正**：输入框为空（trim 后无内容，与发送校验一致）时不再计入消息固定结构开销，明细显示 0 而非 4，消除“没有输入却占 4 token”的误解；总占用、百分比与明细合计同步保持口径一致。
- **定时任务面板标题栏风格统一**：标题左侧补充与收藏 / 检索面板一致的 16px 时钟图标（主题绿 #27ae60，与入口按钮同色）；标题字体对齐为 13px / 600 / #333、数量徽标对齐为 11px / #999，header 间距与分隔线同步对齐（padding 10px 14px、#f0f0f0），与其他侧边栏面板标题栏视觉风格一致。
- **输入区模型名与声明文案重叠修复**：侧边栏较窄或系统字号放大时，右下角模型名与「内容由 AI 生成，仅供参考」文案重叠（旧右侧让位 92px 与模型名上限 `calc(50% - 84px)` 之间数学上仅剩约 2px 余量，字号稍大即重叠）。改为右侧让位 150px（窄屏 140px）、模型名上限收紧为 `calc(50% - 96px)`（窄屏 `calc(50% - 100px)`）并启用 `box-sizing: border-box`；浏览器实测 5 组宽度×字号组合（含 14px 最小字号最坏场景）间 距 ≥ 24px，旧值对照组精确复现重叠（-12.2px）后修复验证通过。
- **输入工具栏窄屏溢出被裁剪修复**：侧边栏较窄时右上「模型设置」按钮（温度计+温度数字）被右缘裁剪——英文界面文案更长（Tools / Selection / Default Assistant），在 421-520px 区间无任何断点接管（旧 420px 媒体查询只折叠助手名），480px 即溢出 33px、440px 溢出 73px。改为两层防护：≤420px 媒体查询新增隐藏温度数字（仅留图标）；421px 以上由新增 `adaptInputToolbar`（index.js）动态测量 `scrollWidth` 逐级降级——① 隐藏温度数字 ② 折叠助手名为 emoji，窗口缩放与工具栏内容变化（语言切换 / 助手名更新）后重测、空间恢复自动还原。浏览器实测 12 组宽度×语言组合降级后均无溢出（英文 510-490px 仅需隐藏数字、480-440px 需两级；中文 425-500px 本就无需降级），降级前溢出对照组 3-73px 证实问题真实存在。
- **压缩上下文按钮点击无反应修复**：`context-indicator.js` 动态创建的确认框与摘要查看弹窗使用 `modal-overlay` 类但漏加 `show` 类——side_panel 的 `.modal-overlay` 基础样式为 `display:none`（须叠加 `.show` 才激活显示，与 options 页面同名类默认 `display:flex` 的语义相反），导致点击「压缩上下文」后确认框完全不可见、确认 Promise 永久挂起，用户侧表现为"点击无反应"（压缩未执行，也无任何提示）；摘要查看弹窗同样受影响。两处修复为 `'modal-overlay show'`。Playwright 探针实测对照：修复前确认框 `display:none`、0×0 不可见（bug 复现），修复后 `display:flex`、420×900 可见，完整链路走通——确认框 → 摘要生成 → 分隔条「上方 6 条消息已压缩为摘要」+ toast「压缩完成，节约约 527 tokens」+ 弹窗压缩态展示（占用 8%→7%，历史 546→0 tokens，与确认框预估一致）。
- **压缩进行中模态进度提示**：点击「开始压缩」到摘要生成完成之间原先无任何反馈（仅完成/失败后弹 toast），新增不可关闭的进行中模态——转圈动画 + 「正在调用模型生成摘要，请稍候…」提示，遮罩挡住界面防止误操作；完成/失败后由 `try/finally` 自动关闭（异常路径同样保证关闭）并显示结果提示。Playwright 探针实测（stub 延迟 800ms 模拟生成耗时）：进行中 `display:flex` 420×900 可见、spinner 动画生效、误点遮罩不关闭；完成后模态自动关闭，分隔条 + toast「压缩完成，节约约 527 tokens」正常。
- **压缩后无法再次压缩修复 + 撤销窗口规则**：详情弹窗压缩状态区原为互斥三分支（有压缩时只渲染「撤销」），压缩后无论是否发送新消息都无法再次压缩，与设计（覆盖式二次压缩：旧摘要+新消息合并浓缩为单摘要）不符——底层 `assembleCompactionMaterial`/`triggerCompaction` 的合并能力本就就绪，仅 UI 入口被吞掉。修复：发送新消息后弹窗显示「再次压缩」（点击走同一确认/合并流程）；撤销窗口规则明确为「发送新消息前可撤销」——发新消息后弹窗与分隔条不再显示撤销按钮，`undoCompaction` 增加守卫（窗口外调用提示），确认框文案同步改为「发送新消息前可撤销」。Playwright 探针实测：压缩①（6 条）→ 追加 2 条消息后弹窗显示「再次压缩」/无撤销、分隔条撤销按钮消失 → 再次压缩确认框提示「含已有摘要，将合并为新摘要」（素材 2 条 ≈ 55 tokens）→ 完成 `compressedCount` 6→8、分隔条「上方 8 条消息已压缩为摘要」、撤销按钮随新窗口回归。
- **工具参数解析修复增强（模型偶发多余转义引号）**：模型输出工具参数时偶发把值的闭合引号多写一个反斜杠（如 `{"action": "write\", ...}`，实测 JSON.parse 报 `Expected ',' or '}' after property value ... at position 22`），现有 6 个修复 pass 无法处理——轻则修复失败（args 退化为空对象、工具以空参执行），重则被 pass2d 误修为错误数据（action 值尾部残留 `\`）。新增「位置引导修复」：利用 JSON.parse 报错位置回溯 40 字符窗口，定位“后接 JSON 结构符（`, ] }` 或下一个 `"key":`）”的多余 `\"` 并删除反斜杠，每轮删除后重新解析验证（最多 4 轮），修好立即返回、修不动则照旧走传统修复流程；候选检测带后顾保护，不触碰合法 `\\"` 序列（值以反斜杠结尾）。同步删除 `tool-executor.js` 中重复的内联解析函数（此前 `tool-helpers.js` 的导出版无人调用），解析逻辑统一收敛到 `tool-helpers.js` 一处维护。探针实测：线上样本正确还原 `action: "write"`；变体（字段乱序 / 中文 key / 中段误转义 / 长文本值）均修复成功；合法串与 `\\"` 保护负例无误伤。
- **子任务反射功能 API 调用错误修复**：修复子任务反射 API 调用的错误处理逻辑，改进 API 响应解析与错误状态检查，优化反射结果的数据结构处理；修复 token 使用统计与上报，改进超时与异常情况下的资源清理；补充更准确的错误消息与调试日志（`chat-manager` / `chat-streaming` 配套调整），新增 `chat-manager-error-msg` 与 `chat-retry-hint` 回归测试。
- **工具栏下拉浮层导致布局误判修复**：下拉浮层（绝对定位元素）展开时参与工具栏宽度测量，空间充足却误判为不足、工具栏错误折叠；测量前临时隐藏绝对定位浮层、测量完成后立即恢复显示状态，并确保样式变更不触发循环观察回调。

### 优化
- **上下文摘要弹窗重新设计（响应式宽度 + Markdown 预览 / 源码切换）**：摘要弹窗宽度原被 `.modal-container` 基础规则（`width:90%` + `max-width:320px`，定义于文件更后处、同特异性后者胜出）钳制为固定窄宽，侧边栏加宽时弹窗不跟随；底部「关闭」按钮与内容零间距；摘要为 Markdown 却只能阅读原文。重设计：宽度随侧边栏自适应（`calc(100% - 40px)` 两侧各留 20px、`max-width:none`，双类 `.modal-container.context-usage-summary-modal` 提高特异性覆盖基础规则）；改为 flex 纵向布局（`max-height: calc(100vh - 48px)`），标题与「预览 / 源码」分段切换固定、内容区独立滚动；右上角新增 × 关闭图标（标题两侧对称留白避让不重叠；原底部「关闭」按钮因功能重复已移除，纯展示弹窗仅保留 × 与点击遮罩两种关闭方式）；新增双视图切换——预览模式复用消息区 `formatMarkdown` 渲染管线（代码块复制按钮同步绑定、`.markdown-body` 样式适配），源码模式以等宽字体展示原文；i18n 补充中英文「预览 / 源码」文案。Playwright 探针实测：视口 420px → 弹窗 380px、800px → 弹窗 760px 双向跟随；底部间距 14px；预览模式 h2 渲染 2 个、切至源码后 h2 归零且原文可见；右上角 × 与点击遮罩均可正常关闭。
- **Word 导出 emoji 字体与段落结构改进**：emoji 单独拆分为独立 TextRun 并指定系统 emoji 字体（跨平台自动检测：macOS 使用 `Apple Color Emoji`、Windows 使用 `Segoe UI Emoji`），避免 Word 中显示异常；修复标题后紧跟内容被静默丢弃的问题，确保内容独立成段；统一导出标题样式为与页面一致的浅灰底边框设计；工作目录面板虚拟滚动定位逻辑改进，支持大目录下文件高亮定位；新增 `docx-export` 与 `workspace-locate` 单元测试。

### 工程质量
- 新增 `context-usage.unit.test.js`（22 用例）与 `compaction-prompt.unit.test.js`（6 用例），覆盖历史选择四层流水线、占用计算、摘要注入、压缩素材组装；`tool-helpers.unit.test.js` 补充误转义引号修复回归 3 用例（对象直通 / 位置引导修复 / `\\"` 保护）；全量 560 个单测通过。

## 2026-09-29

### 新增
- **RAG 依赖「启动自动恢复」**：npm -g 更新代理时会把包目录内手动安装的 RAG 依赖清理掉（npm 对 extraneous 依赖的 prune 行为，实测确认），依赖曾装好但更新后消失时用户需手动重装。现在代理端启动检测到依赖缺失且历史安装成功过（新增 `everSucceeded` 持久化标记，含旧格式「npm 已完成但验证误报」失败记录的兼容判定）时自动重新安装并标记 `trigger=auto`——无论界面更新还是 npm 命令行更新代理，重启后依赖均自动恢复，用户零操作；从未安装成功过的用户不触发（避免骚扰），Node 版本不足时不触发（避免无谓下载）。新增回归测试 `rag-auto-restore.integration.test.js`（无历史不触发、有历史触发、旧格式兼容、运行中防重、成功写入标记）。
- **知识库依赖安装友好提示**：安装引导新增「安装成功后自动就绪，无需重启代理服务」说明；安装失败详情新增建议「若多次安装失败，可尝试重启代理服务（或稍后重试）后点击重新检测」；自动恢复运行时显示专属文案「代理更新后依赖缺失，正在自动恢复...」；`aha rag install` 安装/验证失败时同样输出重启建议。

### 修复
- **RAG 依赖一键安装「验证误报失败」根治（代理端）**：Node 对模块「求值失败」在同一进程内永久缓存（后续 import 永远重抛首个错误，与「模块找不到」不同）——代理端长驻进程内直接 import 探测 RAG 依赖，一旦在依赖不完整/安装进行中时失败，依赖装好后同进程重试永远误报失败（实测 8 次一键安装全部提示「依赖验证未通过」，而磁盘与新进程均正常）。修复：RAG 依赖检测改为在全新子进程（`agent/src/rag/probe-child.mjs`）执行，检测结果始终等于磁盘真实状态且不污染代理进程；安装后验证与「重新检测」失败时附带子进程探测到的真实错误原因（同步写入安装日志、状态文件与代理日志），扩展端「重新检测」失败直接展示原因；知识库路由按需加载失败时返回明确指引（可尝试重启代理端）而非通用 500。新增回归测试 `rag-detect-probe.unit.test.js`（失败→修复→成功翻转、探测超时、探测崩溃、真实探测协议）。

## 2026-09-28

### 新增
- **厂商配置管理与切换**：配置页「基础」新增厂商配置切换器，支持新建、复制、重命名、删除与快速切换多套厂商配置（每套含 API 地址 / Key / 模型列表与选中模型）；侧边栏对话面板新增「API 厂商」选择入口，可先切厂商再切模型，并提供跳转管理配置页的快捷入口。底层新增 `model-profiles` 模块：旧数据自动迁移为默认配置，激活配置字段统一投影回扁平键，既有调用链（会话 / Agent / 工具）零改动；配置导入导出同步覆盖厂商配置（可选含密钥、密钥剥离、旧格式文件兼容回写）。
- **MCP 服务级开关**：MCP 工具从「逐个工具勾选」重构为「服务级 deny-list」——工具配置弹窗按服务整体开关（可展开查看服务下的工具、展示服务 ID，新服务默认开放），助手编辑器可为指定助手排除 MCP 服务；`/` 选择器对未激活服务显示徽标，手动选中即在本会话强制下发（绕过关闭 / 排除列表，澄清重筛时自动补回被预筛选丢弃的强制工具）。
- **技能 / MCP 多选与 chip 指示器**：`/` 选择器支持多选技能与 MCP 服务（再次点选即移除），选中指示器改为 chips 动态渲染并随列表同步已选标记；Ctrl / Cmd + 点击可「选中并关闭」下拉（单选快捷方式），帮助文案补充 Ctrl+Enter 快捷键说明，代理 / 助手列表的键盘导航与事件处理同步优化。

### 优化
- **跨知识库检索配额均分**：多库检索的 topK 配额按引用库数均分（每库至少 1 条），防止高得分库垄断全局截断导致其他库零命中。
- **知识库引用气泡增强**：命中情况改为逐库展示（未命中库也明确提示，不再静默丢失）；为与注入模型严格一致的截断内容增加「✂ 已截断 · 原文 X 字，前 1500 字已发送」标记与截断计数徽章。
- **厂商配置交互优化**：配置页将 API 地址 / Key / 模型名三项以从属分组（缩进 + 侧线 + 浅底）挂在厂商配置之下，并随切换 / 语言实时更新联动提示；侧边栏「模型设置」弹窗中厂商 / 模型列表改为浮层下拉（弹窗高度恒定，不再被列表项撑高遮挡），「管理配置」入口调整为「API 厂商」标题行右侧「+」按钮。
- **导入导出厂商配置按 ID 合并**：合并导入时厂商配置按 ID 对齐——本机没有的配置追加；同 ID 以更新版本为准（旧文件忽略、保留本机）；本机空白默认配置不阻挡同 ID 导入；文件不含密钥时继承本机 Key 防止误清；合并后统一重投影运行时字段，保证状态一致。

### 工程质量
- 新增 5 个单测文件共 1000+ 行（`model-profiles` 295 行、`skill-mcp-multi` 320 行、`knowledge-multi` 185 行、`search-multi` 106 行、`kb-truncated` 157 行），并补充导入合并与配置一致性集成用例；全量 486 个单测通过。

## 2026-09-27

### 新增
- **知识库（RAG）功能**：配置页新增「知识库」标签页与 RAG 总开关，支持新建、编辑与搜索多个知识库；侧边栏新增知识库分类按钮与引用指示器，提示选择器支持知识库搜索；Agent 端新增 RAG 可选依赖（vectra、transformers 等）检测与一键安装，打通完整检索链路。
- **文档导入与进度跟踪**：支持向知识库导入文档，解析 / 分块 / 向量化 / 存储分阶段进度实时展示。
- **混合检索**：知识库检索升级为「向量检索 + 关键词命中抬分」的混合策略，支持中英文关键词提取；知识库名称与描述支持编辑更新。
- **远端向量服务与索引重建**：向量配置支持「远端服务（OpenAI 兼容）」模式（自定义端点 / API Key / 模型名），新增「测试连通性」按钮自动探测向量维度；向量配置变更时自动后台重建索引（临时目录重放 → 原子换入 → 写注册表），含维度一致性校验与导入 / 重建互斥保护。

### 优化
- 远端 embedding 批大小从 16 调整为 10，兼容阿里云百炼（text-embedding-v3/v4 单次批量上限 10 条）等平台限制。
- 远端向量 `dimensions` 语义明确化：显式指定时透传给服务端（支持降维的模型按指定维度返回），未指定时跟随平台默认维度并跳过本地维度校验；平台不支持该参数（返回 400，如硅基流动 BAAI/bge-m3）时自动降级重试不带该参数，不影响测试连通性与文档导入。
- **侧边栏右侧入口轨道重构**：工作目录 / 收藏 / 消息目录 / 搜索 / 定时任务五个浮动入口统一为一条自适应轨道（间距随窗口高度均分、与聊天区边界实时对齐），修复矮窗口下入口位置硬编码导致的互相重叠；浮层面板新增视口夹取，靠近屏幕上下边缘时自动调整偏移不再出屏。

### 修复
- 配置页全局输入框样式补全 `password` / `number` 类型兜底，修复 API Key（密码框）等控件无样式问题。
- 知识库「编辑 / 新建」弹窗点击遮罩区域不再关闭，防止误触丢失正在填写的表单内容。

### 文档
- 新增《AI Helper 安全与性能审计报告》（`docs/AUDIT_REPORT.md`）：覆盖 `src/`、`agent/`、`manifest.json` 与构建产物，梳理 14 项安全问题（如内容脚本 Markdown 渲染缺少消毒、危险工具确认流程失守）与 9 项性能问题，并给出优先级修复建议。

## 2026-09-24

### 优化
- **文件产物列表只展示有效文件**：重构产物过滤策略，仅展示工作目录下且当前实际存在的文件，移除已删除、工作目录外、误识别的无效产物（此前以「已删除」「目录外」标签 + 禁用按钮展示，现改为直接过滤不展示）；验证时机从打开弹窗时提前到消息渲染时（badge 计数从一开始就准确，全部无效则隐藏按钮）；Agent 离线时降级保留目录内产物。
- **配置页「扩展」Tab 技能文案中文化**：将技能管理区块中以英文单词 `Skill / Skills` 显示的中文界面文案统一改为「技能」（如「🧩 技能管理」「+ 导入技能」「暂无技能」「Workflow 技能 / Agent 技能」，以及导入 / 运行 / 启用 / 删除等各类提示与弹窗）；保留真实文件名 `SKILL.md` 与 i18n 键名不变，英文界面仍显示 "Skill"。
- **配置页 Tab 标签更名**：将选项页顶部导航中原「工具」Tab 的标签与标题改为「扩展」（`settings.tabToolbox`），英文由 "Toolbox" 改为 "Extension"，中英文案与 HTML 默认值同步。

### 新增
- **新建会话按钮悬停提示**：为侧边栏会话标签栏的「+」新建会话按钮补上 `title` 提示「新建会话 (Alt+N)」并接入 i18n（`session.newSessionTitle`，中英文），让已有的 `Alt+N` 快捷键更易被发现。

## 2026-09-23

### 新增
- **Token 统计面板 Tab 化重构**：将 Token 消耗统计弹窗改为「趋势 / 分布 / 全局」三标签页布局，顶部固定卡片展示本次 Token、调用次数与上下文峰值；纯手写 SVG 实现 sparkline 趋势图与堆叠条形图；支持按今日 / 本周 / 本月 / 全部切换时间范围；针对侧边栏有限空间优化弹窗尺寸与滚动行为。配套扩展 `token-store.js` 的统计聚合能力并补充中英文案。

## 2026-09-21

### 修复
- 修复选项页 MCP 编辑表单中环境变量与请求头处理函数因压缩后命名冲突（`X` / `it`）导致的引用错误，调整函数定义顺序，功能逻辑保持不变。

### 工程质量
- **流控制器重构**：重写 `StreamController`，新增流空闲超时机制（默认 120 秒），改进读流阶段的异常捕获与本地主机 URL / WebSocket 连接处理；重构工具预选择器，提升 JSON 解析与工具匹配准确性，并调整最小工具数量配置参数（`react-loop.js` / `react-reflection.js` / `stream-controller.js`）。
- **background 变量命名重构**：统一 `agent-dispatcher.js` / `react-loop.js` 中 Map 对象与函数参数的命名，重命名易与内置对象冲突的变量（如 `I` → `_e`），修正作用域与引用问题，仅重构不改变功能。

### 文档
- 新增《AI Helper 作品演示》文档（Markdown + PDF）与五层架构图（HTML + PNG）；将招聘作品海报重构为通用的 `portfolio-poster`（移除旧的 `liepin-portfolio-poster` 资源），并新增海报 PDF 生成脚本 `scripts/gen-portfolio-pdf.py`。

## 2026-09-20

### 新增
- **从厂商 API 一键获取模型列表**：选项页主模型 / 视觉模型配置区各新增「⟳ 从 API 获取」按钮，基于当前 API Base URL + API Key 请求厂商 OpenAI 兼容 `/models` 接口，容错解析多种返回格式（`data[]` / `models[]`、字符串 / 对象元素），合并追加进模型下拉（已存在跳过、保留原有预设与自定义模型，上下文窗口留空）；从下拉选定厂商且已填 Key 时自动静默拉取一次（防抖 + 去重）。失败（网络 / 超时 / 401 / 格式不识别）不阻断流程，兜底为用户手动添加。新增独立模块 `src/options/model-fetcher.js`（请求 + 容错解析 + 分级错误）。
- **预设模型厂商扩充至 18 家**：`PRESET_API_BASES` 新增腾讯混元、百度千帆、阶跃星辰、MiniMax、讯飞星火、Google Gemini、OpenRouter、Groq、Mistral，按国内主流 / 海外聚合分组并附厂商注释；移除已收缩的零一万物 01.AI。

### 修复
- 修复配置页「推理 / 反思 / 划词」Tab 下方出现双横线的问题：三个面板容器残留早年纵向堆叠布局的 `border-top`，与 Tab 栏下边框叠加；统一移除并与「代理」页对齐。

### 工程质量
- 新增 `model-fetcher` 单元测试 15 个（解析容错 / URL 拼接 / 请求头 / 超时 / 错误分级），并修复自动拉取与手动拉取共享按钮导致的 loading 文案卡死竞态；全量 418 个单测通过。

### 文档
- 新增 `agent/docs/MCP-UPGRADE-ANALYSIS.md`：梳理 MCP 协议从 2024-11-05 到 2026-07-28 的版本演进，记录移除协议级 Session、新增 `server/discover` RPC、MRTR 模式等核心变化，并给出向后兼容策略、四阶段升级实施计划与触发升级的具体条件。

## 2026-09-17

### 新增
- **侧边栏作用域模式**：选项页「基础」新增单选开关，支持在两种作用域之间切换，配置写入 `chrome.storage.local` 后 background 通过 `onChanged` 实时应用，无需重启扩展：
  - **全局模式**（默认）：同一窗口内所有标签页共享同一份侧边栏实例，切换标签页时始终可见，符合 Chrome 侧边栏原生行为
  - **标签页绑定模式**：侧边栏仅在打开它的标签页显示，可在多个标签页各自打开；切走自动隐藏、切回自动恢复，采用 webbrain 模型（只启用不禁用 + 可选分组）规避 MV3 `sidePanel.setOptions` 无法可靠禁用的限制
- **标签页自动分组**：标签页绑定模式下可开启「把打开侧边栏的标签页归入分组」，把这些标签页统一归入一个彩色标签组便于识别（标签页会被移动到分组所在位置）；关闭某个标签页的侧边栏或切回全局模式时会自动移出分组。全局模式下该开关置灰不可改（保留用户原有勾选值，切回绑定模式后继续生效）
- 新增两项配置的多语言文案（zh / en）与导入导出支持（`sidePanelScope`、`autoGroupTabs`）

### 修复
- 修复构建产物 `manifest.json` 中 `side_panel.default_path` 覆盖运行时 `setOptions` 导致标签页绑定作用域失效的问题，`scripts/fix-build.js` 构建后自动移除该字段
- 优化配置面板禁用状态下开关（checkbox）的视觉样式

## 2026-09-16

### 新增
- **页面调试工具 `debug_page`（「调试开发」工具）**：基于 Chrome DevTools Protocol（`chrome.debugger`）的高级页面调试能力，供大模型在常规内容脚本工具无法满足时使用，单个工具通过 `action` 参数提供 7 项能力：
  - `attach` / `detach`：显式开启 / 关闭调试会话（attach 需用户在确认弹窗中放行）
  - `evaluate`：在页面主世界执行任意 JS，支持 await Promise，自动捕获异常并截断超长返回
  - `input`：派发原生级鼠标 / 键盘事件（点击、输入文本、组合键、滚轮），可穿透 content script 无法触发的场景
  - `network`：两段式网络录制（开始 / 取回 / 停止），记录请求与响应头、POST 数据、响应体，支持 URL 过滤、自动拉取 body、单条 20KB 与总数 100 条上限
  - `screenshot`：视口 / 整页 / 指定元素截图，支持 JPEG 质量参数，截图直接下载不占用模型上下文
  - `emulate`：模拟 User-Agent、视口设备指标、地理位置、时区、深色模式，支持一键 reset
- **调试会话管理**：按标签页维护会话，复用附着、空闲 120 秒自动脱离以及时消除页面顶部黄色调试提示条；`chrome://` / 商店页等受限页面预检；用户取消调试或 DevTools 抢占时自动清理并给出可恢复的错误提示；活动会话期间通过 Alarms 维持 Service Worker 存活。
- 工具默认关闭，需在工具面板手动启用；`attach` 走操作确认流程，普通 action 不打扰。

### 工程质量
- 抽出零依赖规则模块 `debugger-rules.js`（受限页面判定、按键规格解析、文本截断、网络条目序列化等），新增 **104 个单元测试**（51 个纯规则用例 + 53 个执行器用例），全量 361 个单测通过。

## 2026-09-15

### 新增
- **定时任务**：新增定时任务调度能力，支持一次性（多少分钟后 / 指定时间点）、间隔、Cron 表达式三种调度规则；可基于指定网页上下文（抓取正文 / 仅使用 URL）与宿主会话执行，宿主会话被删除时自愈新建专属会话；基于 Chrome Alarms 调度并在 Service Worker 重启后自动重建。配套管理面板支持创建 / 编辑 / 删除 / 启用 / 停用 / 立即执行（自动定位宿主会话并滚动到底部等待结果），并提供运行历史、后台失败系统通知，以及「最多执行次数 / 截止时间」结束条件。
- **用户问题列表面板**：聊天侧边栏新增「问题列表」，鼠标悬停消息跳转热区时右侧展开，便于快速定位历史提问。
- **用户消息时间戳**：用户问题气泡下方常驻显示发问时间（今天显示时分，非今天显示日期，悬停查看完整年月日时分秒），随消息持久化，刷新 / 重开面板显示原始发问时间；选项页「基础」配置新增「显示消息时间戳」开关，默认开启，切换后对话面板实时生效，配置导入导出同步覆盖。