# AI Helper 审计条目复核状态

> 复核日期：2026-10-16
> 复核方式：逐条回到**当前源码与构建产物**取行号证据（静态复核；未做运行时压测、未做真机 PoC，见"七、复核局限"）
> 底账一：[docs/AUDIT_REPORT.md](AUDIT_REPORT.md)（2026-09-24，SEC-01…14 + PERF-01…12）
> 底账二：Agent 核心模块调研（P0/P1/P2/长线，此前**只存在于对话中、从未落盘**，本文件首次收录）
>
> 本文件是这两份底账的**唯一现行结论**。若与 `AUDIT_REPORT.md` 正文冲突，以本文件为准。

---

## 一、结论速览

| 判定 | 数量 | 条目 |
|---|---|---|
| ✅ 已修复 / 已完成 | 17 | SEC-02（命令确认接真实弹窗，含延伸的 4 类名单绕过）、SEC-14、底账二的 P0-1 与 P1-1（同 SEC-02，计两项）、SEC-03 的"日志打印请求头"半条、**SEC-03 的拦截主体**（`fetch_url` 内网/scheme 闸门 + 设置页总闸与白名单）、**PERF-01 / NEW-01**（内容脚本注入清单，1.64 MB → 61 KB）、**NEW-02**（dist 已重建）、**SEC-13**（sourcemap）、**PERF-04**（滚动防抖）、**PERF-05 / NEW-03**（docx 移出首屏）、**PERF-06 / NEW-04**（预览监听配对作废）、**NEW-06**（入口改名后 chunk 间引用悬空，本轮新发现并修）、**NEW-07**（导出回调转 async 后 `currentTarget` 复位，真机点验撞出并修）、**SEC-11**（审计日志渲染转义，2026-10-17）、**P1-3**（记忆来源分级 + Tier1 常驻门控 + 写侧防御，2026-10-17）、**SEC-08**（页内搜索高亮改 DOM Range，不再重写 `body.innerHTML`，含 `removeHighlights` 类名不匹配的潜伏缺陷，2026-10-17） |
| 🔴 成立，值得排期 | 6 | SEC-01、SEC-03（残余：`manage_tab` 免确认打开内网页，带用户 cookie）、SEC-07、SEC-10、SEC-12、PERF-02 |
| 🟡 成立，但等级应下调 | 5 | SEC-05（高→低）、SEC-06（高→中，见第二节：原降级理由只对"网页发起"成立）、SEC-04（高→策略取舍）、PERF-03（高→中低）、PERF-09（中→低） |
| 🔵 报告原判即"可接受"，我此前误列为待修 | 2 | PERF-12（报告原文："均有上限/清理，属可接受范围"）、SEC-09（报告原等级即"中·纵深防御"） |
| ⚪ 需产品/策略决策才能动工 | 2 | P1-2（已搁置）、SEC-04（脱敏，暂缓） |
| 🆔 两份底账都没有的新发现 | 7 | NEW-01 … NEW-07（见第五节）|

**最高性价比的三件**（都不需要你先做策略决定）：

1. ~~**NEW-01 / PERF-01**~~ ✅ **已于本次修完**：`fix-build.js` 的 `libs/` 目录无脑全量注入已改为以源码 manifest 声明为唯一真相源，注入 libs 从 1.64 MB 降到 61 KB（每页每 iframe 少解析 1.61 MB 死重）。
2. ~~**SEC-03**~~ ✅ **拦截主体已修**：`fetch_url` 现过内网/scheme 闸门（默认关、需总闸 + 白名单双条件），设置页"推理"Tab 有总开关与允许列表。残余一条门：`manage_tab` 仍可免确认打开内网页面。
3. ~~**SEC-13 + PERF-05 + PERF-06**~~ ✅ **已于 2026-10-16 连同 PERF-04 一并修完**：关 sourcemap + 两道打包防线、`chat-export.js` 整体改按需、三组预览共 9 个 window 监听改 AbortController 配对作废、滚动保存改防抖 + `pagehide` 兜底。过程中另外发现并修掉 **NEW-06**（入口 chunk 改名后 chunk 间静态引用悬空，不修则所有导出按钮静默全坏）；PERF-05 改动使首屏主 chunk 从 1.377 MB 降到 **962 KB**。真机点验又撞出 **NEW-07**（同一批改动自己的回归：`e.currentTarget` 在 await 后已复位为 null，导致恢复出的消息四类导出全崩），已修，并在真扩展里真跑出一次 Word 导出产物。

---

## 二、底账一逐条状态（SEC）

| 编号 | 原等级 | 现判定 | 现证据（本轮读取） | 处置 |
|---|---|---|---|---|
| SEC-01 | 严重 | 🔴 成立（定性修正为中） | 6 个位点全部未消毒：`selection-toolbar.js:784`、`:1022`、`:1033`、`:1582`、`:1991`、`:2027`；`DOMPurify` 全仓仅 `src/side_panel/markdown-render.js`、`workspace-panel.js`；`dist/assets/content.js` 中 `DOMPurify` 出现 **0 次** | **定性修正**：innerHTML 插入的 `<script>` 不执行，内联 handler 在**宿主页面主世界**执行，非扩展上下文 → 不是提权，是页面级 XSS。仍应加消毒，但不属"最危险"档。**⚪ 暂缓（2026-10-17 用户决定，暂不做）**：修法需在"DOMPurify 进 manifest 注入（每帧 +~20KB，触 PERF-01 瘦身原则）"与"按需懒注入（时序/CSP 复杂）"间取舍，属架构权衡而非低风险即做项 |
| SEC-02 | 严重 | ✅ 已修复 | `tool-executor.js:4279` `requestCommandUserConfirmation`，三处调用 `:4341`/`:4655`/`:4723`；模型自带 `force` 不采信；开关判定 `:4320` | 提交 `fda111e`；延伸修复 `7613e5e`、`18a6703` |
| SEC-03 | 严重 | ✅ 拦截主体已修（残余 `manage_tab`） | 新增 `src/shared/network-scope.js`：scheme 限 http/https，内网目标需"总闸开 + 命中白名单"（B2 语义，开关开着但白名单为空仍拒绝）。接入点 `tool-executor.js:2944` `executeFetchUrl` 在 `new URL` 后调 `decideNetworkAccess`，拒绝时返回带开关位置的可执行文案；配置链 `config.js` 读 `networkAccessEnabled`/`allowedNetworkHosts`（默认 false / 空，`constants.js:19-23`），设置页"推理"Tab 新增总闸与白名单（关闸只改开关并把白名单区块收起、绝不清空列表，实测验证），配置导入剔除这两个键（安全闸门不允许被文件飘移）。工具定义 `storage-tools.js:79` 描述已写明限制。报告所指"日志打印请求头"**已不存在**：`:2943` 现只打 method/url/timeout | 已修部分按你的决定保持免确认（不新增弹窗）。**残余**：`tab-tools.js:5-10` `manage_tab` 仍 `requiresConfirmation: false` 且 `confirmationActions: ['close']` → open/navigate 到内网免确认，且带用户 cookie，光封 `fetch_url` 拦不住这条 | 
| SEC-04 | 高 | 🟡 成立，但属有意取舍 | `debugger/debugger-rules.js:126-131` 注释明写"headers 对调试场景最有价值……故完整暴露"；`serializeNetworkEntry` 返回 `requestHeaders`/`responseHeaders`；全仓 grep `redact`/header 脱敏 **0 命中** | 不是遗漏，是策略。要脱敏或纳入确认需你先定调试能力的边界。**⚪ 暂缓（2026-10-17）**：脱敏会削弱 `debug_page` 看认证头/CORS 排障的核心价值，属产品取舍，待你定调试能力边界 |
| SEC-05 | 高 | 🟡 成立（高→低） | 真身确为 `selection-toolbar.js:2129-2167`（`window.addEventListener('message')`，无 `event.origin`/`event.source` 校验），报告行号**本来就对**；发送侧 `postMessage` 在 `:1359`、`:1388`、`:1478` | 影响限于"伪造选区文本 + 按坐标弹出工具栏"，不能自行发起 AI 请求、不读数据，仍需用户再点一次 → 降为低。修法：校验 `event.source === window.parent` + 收敛 `targetOrigin` |
| SEC-06 | 高 | 🟡 成立（高→中） | `agent/src/server.js:502-509`：`isLocal` 为真即跳过认证，名单含 `127.0.0.1`/`::1`/`::ffff:127.0.0.1`/`localhost` | **原降级理由已推翻**：我以 Chrome PNA 预检为依据把本条降到"低"，但实测（真扩展 SW 发起）表明**扩展自身发起的请求不受 PNA 约束** —— 环回 GET/POST 全 200、无 `Access-Control-Request-Private-Network`、无 OPTIONS。PNA 只挡"网页发起"的那一类。因此回评为中：`fetch_url` 这条发起路径本轮已被 SEC-03 闸门封住，残余可达面是同机进程、自家扩展页与 `manage_tab` |
| SEC-07 | 高 | 🔴 成立（描述修正） | 扩展 `src/shared/secret.js:22-30` `decodeSecret = atob`；agent `src/crypto-lite.js:1` 文件头自称"落盘混淆（Base64 + `enc:` 前缀）"；全 `src/` grep `encrypt\|decrypt` **0 命中**；WS 仍走 query：`local-agent-client.js:681` `?token=` | **描述修正**：两侧同一水平（Base64 混淆，非加密），不存在"agent 已加密 / 扩展明文"的不对称。要不要上真加密取决于威胁模型（能读磁盘者亦能读 `chrome.storage`）。**2026-10-17 复核**：① 落盘真加密需"存密钥的密钥"，桌面场景多属过度保护 → 暂缓；② WS `?token=` 移出 URL **不可行/不必要**——浏览器 `new WebSocket()` 无法设握手 header，agent 端"优先 header、回退 query"里那个 query 正是浏览器 WS 唯一认证通道，且 WS 归一到回环 `ws://127.0.0.1`、query 不经网络无 Referer 外泄 → 维持现状（真收口需两侧改首帧认证，属协议变更） |
| SEC-08 | 高 | ✅ **已修复（2026-10-17）** | 旧写法：`content/page-extract.js` 的 plain/regex 两个高亮分支均 `document.body.innerHTML = document.body.innerHTML.replace(...)` 重写**真实** body。新实现：抽出 `page-utils.js:highlightTextMatches()`，用 TreeWalker 只遍历文本节点 + `Range.surroundContents` 包裹命中，绝不碰标签/属性、不重建 DOM → 事件监听/框架虚拟 DOM 关联/选中态全保留 | 顺带修掉潜伏的第二处缺陷：`removeHighlights` 旧只清 `.ai-helper-highlight`，而搜索高亮打的是 `.ai-helper-search-highlight` → 类名不匹配、搜索高亮永不复位且反复搜索会累积，已并入清理名单；另修正 regex 模式下"查找用原始模式、高亮却把模式转义成字面量"导致高亮与命中对不上（改为复用同一正则）。守卫：`page-search-highlight.unit.test.js` 11 例（3 源码接线 + 7 行为不变量：监听存活/属性不被污染/单节点多处反向拆分/上限/解包复位/script 跳过/文本保留 + 1 负向对照"旧写法确重建节点、丢监听、断属性"）；负向对照已验（对 HEAD 旧内容跑接线守卫命中=能捕获回归，当前产物=false）。纯内容脚本改动，全量 **106 文件 / 1618 全绿**，eslint 0，`npm run build:silent` 成功，已复核 `dist/assets/content.js` 中该自赋值模式消失 |
| SEC-09 | 中 | 🔵 无可达路径（撤销"外部源"表述） | 主入口 `background/index.js:907`，全 `src/background/` 无 `sender.id`/`sender.url` 校验；但 manifest **未声明 `externally_connectable`** → `chrome.runtime.onMessage` 只收自家扩展页 + 自家内容脚本；且这些 handler 本身在用 `sender.tab?.id` 做路由 | 报告原等级即"中·纵深防御"，我此前"任意外部源可投递"的措辞是加重。作为加固项保留，不作为缺陷 |
| SEC-10 | 中 | 🔴 成立（半条已缓解） | `content/advanced-tools.js:384-399`：scoped 分支已收敛（`#${wrapperId}` 前缀 + `style.textContent` + `data-ai-helper`），但 `else` 分支 `:396-399` 仍把**整段未过滤 CSS** 以 `data-ai-helper="global"` 注入宿主 head | 全局分支加属性白名单，或取消全局模式 |
| SEC-11 | 中 | ✅ **已修复（2026-10-17）** | `side_panel/index.js` 的 `renderAuditLogs`（模板行 3734-3741）曾把 `entry.action`、`cat`、`level`、`details` 直插 `innerHTML`；`formatAuditDetails` 仅截断长度不转义。现四处均包已引入的 `escapeHtml` 后再插值 | 因发生在**扩展页面**，注入成功即获得扩展上下文发消息能力（连带激活 SEC-09 那批 handler）→ 真实危害高于其"中"等级。守卫：`audit-log-escape.unit.test.js` 11 例（4 源码接线形状 + 7 行为不变量：真 `escapeHtml` 驱 5 类 payload 注不进真元素、`.textContent` 原样保留 + 一条不转义确会注入的正向对照）；负向对照 `git checkout` 还原 → 3 条源码接线守卫转红 |
| SEC-12 | 中 | 🔴 成立 | `package.json:39` `pdfjs-dist ^3.11.174`、`:40` `xlsx ^0.18.5`；产物 `dist/assets/xlsx-*.js` 424 KB、`pdf-*.js` 305 KB；且用于解析**用户上传的任意文件**（`side_panel/file-extract.js:112`、`:142`） | 不是版本号难看，是"解析不可信输入的库带已知 CVE"。xlsx 官方停更 → 需换库或限功能面。**⚪ 暂缓（2026-10-17）**：换 blessed 构建/换库/收缩可解析文件类型三者都改变"支持哪些文件/保真度/体积"这一产品能力，属产品取舍，待你定方向 |
| SEC-13 | 低 | ✅ 已修复（2026-10-16） | `vite.config.js` 现 `sourcemap: false`（带注释说明为何不得改回）；`release.yml` 与 `scripts/package.js` 两处 zip 均 `-x "*.map"` 并在打包后立即 `unzip -l` 复核，检出即退出码 1。实测：当前源码下把 `sourcemap` 改回 `true` 会构建出 **19 个 `.map` 共 10.3 MB**（最大 `side_panel.js.map` 2.64 MB）；现产物与商店包均为 **0 个**，包体 2.69 MB；真扩展首屏 0 个 `.map` 请求 | 已修。守卫：`audit-small-fixes.unit.test.js` 4 例（配置/yml/package.js/产物），负向对照已验 |
| SEC-14 | 低 | ✅ 已修复 | 全仓不再有无 `onerror=` 声明的元素 | 无需动作 |

---

## 三、底账一逐条状态（PERF）

| 编号 | 原等级 | 现判定 | 现证据 | 处置 |
|---|---|---|---|---|
| PERF-01 | 严重 | ✅ **已修复（2026-10-16）** | 旧行为：`fix-build.js` 取 `dist/libs/` 下除 `mermaid.min.js` 外全部 `.js` 注入，实测合计 **1.64 MB**（`pdf.worker 1062 KB` + `jspdf 357 KB` + `html2canvas 194 KB` + `marked 39 KB` + `qrcode 23 KB`），且 `all_frames` + `match_about_blank` + `match_origin_as_fallback` → 每页每 iframe 都载。新行为：`scripts/content-libs.js` 以源码 manifest 声明为唯一真相源派生注入清单，实建后 `dist/manifest.json` 为 `[libs/qrcode.min.js, libs/marked.min.js, assets/content.js]`，libs 合计 **61 KB**（降 1613 KB）；`dist/libs/` 文件**全部保留**（side panel 仍靠 `libs-loader.js` 动态加载） | 守卫：`test/unit/content-script-libs.unit.test.js` 11 例（含体积上限锁与旧写法不得复现的接线断言）；负向对照已验（退回旧写法则 2 条接线守卫立刻红）。**待真机点验**：选区翻译/解释、二维码、侧边栏导出图片/导出 PDF、工作区 PDF 预览 |
| PERF-02 | 严重 | 🔴 成立 | `background/constants.js:47` `streamChunkDelay: 30`；`side_panel/chat-streaming.js:264-265` 注释自认"流式每块用 innerHTML 重渲染整段内容（含代码块/图片/思考指示器折叠）" | 成立。改动面大、易回归 → 建议排在真机复测之后 |
| PERF-03 | 高 | 🟡 成立（高→中低） | `content/selection-toolbar.js:2191-2196`：仅顶层 frame，`observe(document.body, { childList, subtree })`，回调为"摘掉再重挂选区监听" | 开销随 SPA 变更频率放大，属长尾。可与 SEC-05 同批处理 |
| PERF-04 | 高 | ✅ **已修复（2026-10-16）** | `side_panel/index.js` 的 scroll 回调改走既有 `debounce`（200 ms）+ `pagehide` 兜底立即落一次；`key` 与 `scrollTop` 均在事件发生时捕获再传入（否则延迟落盘时会话已切走、位置会写到别的会话） | 真扩展插桩实测：改前 20 次滚动 = **20 次 `chrome.storage.local.set`**；改后 **1 次防抖 + 1 次兜底**，落盘值 233 与最后一次 `scrollTop` 一致 |
| PERF-05 | 高 | ✅ **已修复（2026-10-16，含 NEW-03）** | 三个引用方（`chat-manager` 12 处、`chat-streaming` 4 处、`workspace-panel` 3 个函数）删静态 import，改在调用点 `await import('./chat-export.js')`，16 个 click 回调转 async | 产物实测：`dist/assets/side_panel.js` **1,376,516 → 962,742 字节（-404 KB / -29.3%）**；OOXML 特征串在主 chunk **74 → 0** 处；真扩展首屏 0 次请求 chat-export chunk，且该 chunk 可在扩展内成功动态 import、引用方取用的 7 个符号全部可用。本条改动曾引入 **NEW-07**（await 后取 `e.currentTarget` 得 null），已修。**Word 导出已在真扩展跑到产出物**（8,635 B 的 OOXML 文档）；PDF / Markdown / 图片三类仍待点验 |
| PERF-06 | 高 | ✅ **已修复（2026-10-16，含 NEW-04；审查后补并发修正）** | 报告只列了 PDF 一组，实测为**同形态三组共 9 个** window 监听（`previewPdf`/`previewPptx`/`previewImage` 各 `mousemove`/`mouseup`/`resize` 匿名函数）。改为唯一注册入口 `addPreviewWindowListener(signal, type, handler)`，`previewFile()` 开头 abort 上一轮再新建，并把**本轮 signal 逐轮作参数透传**到三分支与 9 个注册点（原读模块变量的写法在并发交叠时会让旧轮监听挂到新轮 controller 上驻留，审查后修正）；`closePreview` 关闭即作废本轮、`previewImage` 的 `resize` 回调加 `isConnected` 存活守卫、注册入口对已 aborted 的 signal 早退（jsdom 与浏览器语义差异） | jsdom 驱真 `previewArtifactFile`（`workspace-preview-listener-lifecycle.unit.test.js` 6 例）：每轮注册 3 个、上一轮 signal 全部 `aborted`、**旧 handler 调用次数 0**、存活监听恒为 3 个；新增两轮并发交叠与关闭即作废两例（断言对交错次序不敏感）。PDF/PPTX 两分支属同一入口，未单独跑真预览（需 agent 配对与二进制素材） |
| PERF-07 | 中 | 🟡 成立（半撤销） | `background/index.js:2235` `setInterval(performAgentHealthCheck, 30000)`、`:2282` 心跳 60 s、`:2293` 模块顶层无条件 `startAgentHealthCheck()`、`:2117`/`:2105` `_startAutoReconnect`；心跳注释与实现均为"只对当前活跃代理发"，且有 stop 配对 | 报告"常开保活"成立（`chrome.alarms` 只用于定时任务，见 `:56`，未用于这两个保活）。但"未配对 agent 是否启用"是唯一的实质问题 → 降为轻微。改 `alarms` 需权衡 |
| PERF-08 | 中 | 🔴 成立 | `tool-executor.js:1017-1023` `appendAuditLog`：`get` 全数组 → `unshift` → 截断 → `set` 整写回；`recordToolStats` 在 `:1698` 同为读-改-写 | 内存聚合 + 防抖落盘，或迁 IndexedDB |
| PERF-09 | 中 | 🟡 成立（中→低） | `storage/token-store.js`：会话维度已走 index range（`:58`，`:55` 注释说明动机）；但 `:106`、`:145`、`:177`、`:285`、`:319` 仍 `store.getAll()`；无 TTL/retention（grep 0 命中） | 索引那条已修。剩全局口径与保留策略；数据量到千级才显著 |
| PERF-10 | 中 | 🔴 成立 | `markdown-render.js:1272` `addCodeCopyButtons` 用 `document.querySelectorAll('.code-copy-btn')`（`:1273`）；`:1360` `addTableToolbarEvents` 在 `:1362`/`:1452`/`:1481` 三处全 document 扫描重绑 | 改事件委托。注意：报告此条指**代码块/表格按钮**，不是 mermaid（mermaid 是 NEW-05） |
| PERF-11 | 低 | 🔴 成立 | `chat-streaming.js:2072` 与 `:2076` `element.dataset.htmlContent = element.outerHTML`；`:1732` `dataset.executionLog = JSON.stringify(executionLog)` | 整段 HTML/日志复制进 DOM 属性 → 改存 JS Map |
| PERF-12 | 低 | 🔵 报告原判即可接受 | `side_panel/index.js:2208-2216` `refreshSelectionInterval()` 先 `clearInterval`，仅 `state.enableSelectionQuery` 为真才建 500 ms interval；恢复轮询有界（`maxAttempts = 20`） | **我此前把它列为"待修/前提不成立"都是转述错误**：报告原文即"均有上限/清理，属可接受范围；建议选区检测改为事件驱动"——是建议不是缺陷 |

---

## 四、底账二首次落盘：Agent 核心模块调研（原仅存在于对话）

| 优先级 | 事项 | 现判定 | 证据 |
|---|---|---|---|
| P0 | `agent_exec` 灰名单确认接真实用户弹窗 | ✅ 已完成 | 同 SEC-02 |
| P0 | 确认开关与灰名单防护解耦 | 🟡 半（按字面未做） | `tool-executor.js:4320` `!== false`、`react-loop.js:1712` 用 `&&` 一起短路 → 关开关仍等于灰名单自动放行。当时收口动作是"写明后果"（wiki `Built-in-Tools.md:179`"关闭后敏感操作直接放行"），非解耦 |
| P1 | 确认 fail-open → fail-closed | ✅ 已完成 | 弹窗无法送达即拒 + 写审计；面板上下文轮询兜底；纯空白命令 deny（`agent/src/security.js`） |
| P1 | loop 放行改**工具级**粒度 | ⚪ **已搁置（2026-10-16 用户决定）** | `react-loop.js:177-180` `hasLoopApproval(sessionId)` 仍只看会话祖先链；授予 `:205-215` `loopApprovedSessions.add(root)` 无工具维度；消费点 `:1715` 与 `tool-executor.js:4281`；`grantTaskLoopApproval` 遍历 `pendingConfirmations` 跨工具 `settle(true)`。搁置理由：收窄后并行子任务弹框次数显著上升，且需重做按钮文案 |
| P1 | 记忆写入来源标记 + Tier1 投毒防护 | ✅ **已修复（2026-10-17）** | 记忆条目新增 `origin`，**由运行时按"谁发的请求"判定、模型不能自封**：`routes.js` 取 HTTP header `X-Memory-Caller` 作可信来源（仅 options 面板 `agentApi` 写记忆时带 `user`，background 的 `agent_memory` 工具与自动压缩两条 `agentRequest` 不带 → 默认 `model`；`tool-memory.js` 以 `{ ...args }` 透传、模型可伪造 body，故 origin 绝不读 body）；`service.js` store 只认可信 ctx。`injection.js` Tier1 门控改 `origin==='user'` + 单条 ≤500 字符，`model`/缺失一律降 Tier2/Tier3（仍可召回、不常驻），**旧数据无 origin 自动降出常驻**（默认不可信、无需迁移）。写入侧 fail-closed：命中提示注入短语拒写、同一 sessionId 超 20 条限流（无 sessionId 不计）。用户三拍板：来源运行时判（user 仅面板创建/编辑）、Tier1 仅 user、写侧含长度上限+关键词过滤+频率上限（未选面板晋升）。守卫：`memory-injection`(+5)/`memory-service`(+5)/`memory-routes`(+2)，负向对照已验（抽掉 origin 门控→2 条负向例转红）。agent 全量 484/484、扩展 104/1600 全绿，eslint 0，已重跑 `npm run build:silent`；**生效需重启 agent daemon** |
| P2 | trim O(n²) 优化 | 🔴 未做 | `src/shared/token-counter.js:460-486` `trimMessagesByBudget`：`while` 内每丢一条即 `estimateMessagesTokens([...systemMsg, ...rest])` 全量重估 + 整份复制数组 |
| P2 | 工具定义 token 缓存 | 🔴 未做 | `react-loop.js:1321-1324` 每次 API 调用前重新 `JSON.stringify(apiTools…)` + 估算 |
| P2 | dispatch 竞态 | ❓ 指代不明 | 代码中无法定位该结论对应实现点；`executeDispatchSubAgent` 在 `tool-executor.js:2065`（别名映射 `:1119`）。今日修复的 `pendingConfirmations`/放行子树清理覆盖了确认通道那一块 |
| P2 | `timingSafeEqual` | 🔴 未做 | `agent/src/auth.js:117-125` `verifyToken` 仍 `pairing.token === token` 普通比较（收益在本场景极低——威胁是局域网时序探测） |
| 长线 | 完成度校验器 / `take_note` scratchpad / 子任务 token 预算 | 🔴 全未开始 | `verifyCompletion`、`completionVerifier`、`take_note`、`scratchpad` 在 `src/background/` + `src/shared/` 全部 0 命中；`tool-executor.js` 无 subtask budget 实现 |

---

## 五、两份底账都没有的新发现（本轮复核产出）

| 编号 | 发现 | 证据 | 判定 |
|---|---|---|---|
| **NEW-01** | PERF-01 注入的 5 个库里有 **3 个在内容脚本零引用**，是误配死重而非优化项——已按四层证据确认并修完 | ① 意图：源码 `manifest.json` 只声明 `[libs/qrcode.min.js, libs/marked.min.js, src/content/index.js]`；② 产物：`dist/assets/content.js` 中 `html2canvas`/`jsPDF`/`jspdf`/`pdfjsLib`/`GlobalWorkerOptions` 引用数 **0/0/0/0/0**，`marked` 8、`QRCode` 5；③ 间接引用：产物中 `window[…]` / `globalThis[…]` 动态取值 **0 处**；④ 唯一 `canvas.toDataURL`（`advanced-tools.js:105`/`:197`）经读码确认是**二维码绘制**，与截图/导出无关。另：`mermaid.min.js` 早已排除且内容侧 0 引用、功能正常，等于预先验证过"排除面板专用库"是安全的 | ✅ **已修**：新增 `scripts/content-libs.js`，以源码 manifest 声明为唯一真相源（非硬编码白名单，未来加库只需写进 manifest）；`fix-build.js:223-245` 改用该函数。声明项在 `dist/libs` 缺失时**抛错而非静默丢库**。已用真扩展冒烟验证（`test-results-probes/_content-libs-trim-smoke.mjs`，12 项全绿）：内容脚本在顶层帧与同源 iframe 均完成初始化、注入项可取、面板专用库文件未被误删、side panel 无报错；负向对照（清单塞入不存在文件）下 Chrome 直接启动失败，属加载级故障 |
| **NEW-02** | dist 产物落后于源码 | 原现象：`dist/assets/content.js` 构建于 10-16 13:08，而 `src/` 最后改动 13:25（提交 `279cd74`） | ✅ **已消除并保持**：已多次重跑 `npm run build:silent`，现产物含 `279cd74`、内容脚本注入瘦身、SEC-03 闸门与本轮四项小修 |
| **NEW-03** | PERF-05 的成因是"懒加载做了一半" | `workspace-panel.js` 早已用 `await import('docx')`，被 `chat-export.js` 的静态 import 抵消 | ✅ **已修**：改为三个引用方共 19 处按需加载（详见第三节 PERF-05）。注意原判定的"修一行"不成立：docx 符号在 chat-export 里跨 35→907 行且被 3 个模块静态引用 |
| **NEW-04** | PERF-06 是"每次预览泄漏"，不是一次性注册 | 注册点在 `previewPdf()` 内，被 `previewFile()` 逐次调用 | ✅ **已修**：改用 AbortController 在 `previewFile()` 单点收口。当时只报出 PDF 一组，实测是 **三组共 9 个**监听（漏报 2/3） |
| **NEW-05** | mermaid 缺"已渲染"守卫（报告 PERF-10 不含此项，勿混） | `markdown-render.js:688-721` `renderMermaidCharts()` 遍历 `.mermaid`；调用点 `chat-manager.js:482`、`index.js:2410/2455` | ⚪ **复核后判定为误报，未改**：① 每条新流式消息走的是作用域化 `renderMessageMermaid(messageDiv)`，非全文档扫描；② `renderSingleMermaid` 首行已有 `if (container.querySelector('svg')) return` 守卫，已渲染的图不会重跑 `mermaid.run()`；③ `renderMermaidCharts()` 只在会话切换/历史恢复两个批处理点调用，而那里重建 `addMermaidControls` 是**有意的**（虚拟 DOM 恢复后事件监听需重挂）。加"已渲染跳过"标记反会让恢复后的图表控制按钮失灵——既非真缺陷、也不低风险 |
| **NEW-06** | 入口 chunk 改名后，chunk 间的静态 import 会悬空（本轮修 PERF-05 时撞出来的） | `scripts/fix-build.js` 的 `renameToStableNames` 把带 hash 的入口改成稳定名（`side_panel-<hash>.js` → `side_panel.js`），但 `replaceInFile` 只覆盖 manifest / service-worker-loader / 两个 HTML。chat-export 拆成独立 chunk 后它反向 `from"./side_panel-<hash>.js"`，产物里出现全仓**唯一一处**悬空引用；真扩展里表现为点任意导出按钮即 `Failed to fetch dynamically imported module` | ✅ **已修**：改名映射额外遍历 `assets/*.js` 应用一遍。守卫两层：`audit-small-fixes.unit.test.js` 的接线守卫 + 产物引用图逐块校验，探针 A4 项同时在真构建产物上扫 23 个 chunk。**踩坑价值**：改前 chat-export 就在入口 chunk 内部、无跨 chunk 引用，所以这个缺陷存在已久但直到本次拆分才暴露——说明"入口改名"这类后处理必须同时改引用方 |
| **NEW-07** | 导出回调转 async 后，`e.currentTarget` 在 await 之后已被复位为 null（本批 PERF-05 自己的回归，由真机点验撞出） | 现象：导出 Word 报 `Cannot read properties of null (reading 'dataset')`，栈在 `chat-export-*.js:10`，即 `exportAssistantMessageToDocx` 首行 `exportBtn.dataset.exportBtnKey`。真因在调用方：`chat-manager.js` 的 `restoreMessageFromHtml` 与 `rebindAllMessages` 共 8 个回调把 `e.currentTarget` 用在 `await import()` 之后（DOM 规范：派发结束即置 null）；`addMessage` 与 `chat-streaming` 那 8 处用的是外部常量 `docxBtn`，不受影响 | ✅ **已修**：8 处均在 await 前捕获成局部常量再传入。守卫三层：`export-click-lazy-import.unit.test.js` **15 例（审查后由字符串正则/大括号配对整体重写为 acorn AST，堵住 target/currentTarget 不可区分、锁点用 import 而非首个 await、restore 无行为覆盖、解构与别名漏扫四个假绿洞；`acorn` 提为 devDependency）**（含"await 后 currentTarget 为 null"的契约实测 + 派发到按钮内部元素驱真点击 + `test.each` 覆盖 restore×rebind×4 导出）、探针 F1/F2 在产物里逐回调验顺序、F3–F6 在真扩展真导出一份 docx（8,635 B / OOXML MIME / `word-<ts>.docx` / 按钮回可用）。负向对照两轮：还原 8 处 → 守卫多例红（`expected null to be <button …>`）+ 探针 F1/F2 红；对守卫本身做 M0–M6 共 7 个坏形态变体（`_new07-guard-negative-control.mjs`）→ 全部拦住、基线全绿、还原后 src 与 HEAD 逐字节一致。**踩坑价值**：异步化一个同步回调时，事件对象上的一切字段都必须在让出微任务之前捕获 |

---

## 六、对既有文档与口头结论的勘误

1. **本报告内**：SEC-13 的 map 体积 3.68 MB → 当时复核 **4.43 MB** → 本轮（10-16 修完 PERF-05 后把 `sourcemap` 改回 `true` 实测）为 **19 个 `.map` 共 10.3 MB**，但最大的 `side_panel.js.map` 反而降到 **2.64 MB**——数量涨而单件变小，因为 PERF-05 拆出了更多 chunk（现共 23 个）；该数字只用于说明「开着会漏多少」，现行产物已是 **0 个**。PERF-01 的"约 1.93 MB"实测为 **1.64 MB libs + 274 KB content.js**；SEC-03 的"日志打印请求头"半条已不成立。
2. **SEC-06 的降级理由作废（2026-10-16）**：我先前据 Chrome PNA 预检把 SEC-06 从"高"降到"低"，并顺手用同一理由给 SEC-03 的可达性降级。实测推翻了这个前提：PNA 只约束**网页发起**的请求，**扩展自身（SW）发起的请求不受约束**，环回 GET/POST 直连且响应体可读。两条的等级与处置已按实测重写。
3. **agent 侧 `ragUrlIngest` 语义（本轮只查证、未改动）**：`agent/src/rag/url-guard.js:73-78` 现行是"白名单非空则总开关被完全忽略"，即 `allowPrivateNetwork: false` + 白名单非空 → 那台内网照样放行；且唯一锁这套语义的用例（`agent/test/unit/rag-url-ingest-guard.unit.test.js:76-81`）两条断言的开关都是 `true`，"关 + 白名单非空"这一档从无覆盖。你已选 **B2（AND 闸语义）** 并要求连 agent 一起改，本轮按你后面的指示（"代理端知识库的先不要动"）**暂未动手**，仅扩展侧落地。
4. **报告"一、结论速览"的两处判断需一并修正**：①"内容脚本渲染链路是本项目唯一的真实 XSS 通道"——SEC-11（审计日志未转义）同样可达，且它发生在扩展页面、危害更高；②"风险集中在两处"中的第二处（命令确认失守）已于今日修复。
5. **对话转述勘误（2026-10-16 我前几轮的错误，以本文件为准）**：
   - 把 SEC-09 说成"任意外部源可投递消息"——报告原等级即"中·纵深防御"，且已注明"manifest 未声明 `externally_connectable`，网页无法直连 Background"。
   - 声称"SEC-05 报告行号错了、真身在 2129"——**报告行号本来就是 `:2129-2167`**，错在我的前一轮转述。
   - 把 PERF-12 列为"待修/前提不成立"——报告原判即"可接受范围"。
   - 编号串位：把 SW 保活记成 PERF-08（实为 **PERF-07**）、把写放大记成 PERF-10/11（写放大是 **PERF-08**；PERF-10 是代码块/表格全 Panel 重绑，PERF-11 是 dataset 属性膨胀），并把 mermaid 归入 PERF-10/11（实为 NEW-05）。
   - 把 SEC-10（CSS 注入）与 SEC-07（凭据落盘）混为一条，并得出"agent 已加密、扩展明文"的不对称结论——两侧都只是 Base64 混淆。
   - 声称"SEC-01 是全仓唯一活跃 XSS 通道、最危险"——定性与等级均过头，详见第二节 SEC-01。
   - 声称"工作区仍有 7 个未提交改动"——已被提交为 `279cd74`，现工作区干净（`git status --porcelain` 为空），但该提交**本地领先 `origin/youhua01` 1 个未推送**。

---

## 七、复核局限（务必连同本表一起引用）

- 全部结论来自**静态代码与构建产物**取证：没有做运行时压测、火焰图，也没有对 SEC-01/05/08/11/12 构造真机 PoC。"成立"的含义是**缺陷逻辑确实缺失或确实存在**，不代表已在真实浏览器中复现危害。（例外见下文的「例外」条：SEC-03、NEW-01/PERF-01、以及 SEC-13 / PERF-04 / PERF-05 / PERF-06 / NEW-06 已补运行时取证）
- PERF 类判定是**代码形态推断**（如"每块全量重渲染""每次预览注册监听"），实际体感幅度未经测量；PERF-02/01/05 的改动会改变渲染与注入形态，建议与真机复测分批进行，避免归因混淆。
- SEC-06 的残余可达面仍依赖浏览器行为与 agent 监听地址：本轮实测只覆盖"环回 + 默认配置"，公网页→环回那一段因无法在本机构造公网前提而未测（已标为 inconclusive）；若 agent 改为非环回监听，结论需重估。
- 底账二（第四节）来源于对话而非文档，其中"dispatch 竞态"一条至今无法定位代码指代，标记为待澄清。
- 例外：**NEW-01 / PERF-01、SEC-03 的闸门、以及 SEC-13 / PERF-04 / PERF-05 / PERF-06 / NEW-06 已在真实浏览器中验证**（`dist` 装进 Chrome，见探针脚本），不再是纯静态推断；但探针只证明"脚本初始化、资源可取、面板能起、产物里的判定函数逐档行为正确、设置页三态与 storage 往返正确、监听生命周期与 chunk 按需加载正确、Word 导出能产出 OOXML 文件"，选区翻译/解释、二维码出图、导出的 PDF/Markdown/图片三类、PDF/PPTX 预览这类需真实交互与产出物的路径仍未人工点验。另需注意：`test/e2e/*.spec.js` 全部从 `src/` 现打模块，**不经过 `dist/manifest.json`**，因此对构建产物的改动没有现成 e2e 覆盖——本轮的 NEW-06 正是因这个盲区才差点漏掉（只有真扩展动态 import 一次才看见）；NEW-07 同理——它只能被真点击触发，静态与单元层面看不出来。
- SEC-03 的"模型可自主发起内网请求"已从静态成立升级为**运行时证实可达**（真 SW 里环回 GET/POST 全 200）；`POST /api/shutdown` 能关掉 agent 那一跳**没有真发**（会杀开发进程），属强推断。

---

## 八、建议排期

**第一批（无需决策，独立可验）**

1. ~~NEW-01 / PERF-01~~ ✅ **已完成**：`scripts/content-libs.js` + `fix-build.js` 接线 + 11 例守卫，注入 libs 1.64 MB → 61 KB；已重跑构建，并用真扩展冒烟（12 项全绿）+ 负向对照验过。
2. ~~SEC-03 —— `fetch_url` 增加环回/私网/元数据与 scheme 拦截（保持免确认）~~ ✅ **已完成**：`src/shared/network-scope.js`（B2 语义）+ `executeFetchUrl` 接线 + 配置链 + 设置页"推理"Tab 总闸与允许列表（关闸不清空列表）+ 导入不飘移；1543 例单测全绿（本条新增 92 例），真扩展冒烟 26 项全绿。
3. **SEC-03 残余：`manage_tab` 的 open/navigate 到内网同样免确认，且带用户 cookie** —— 不堵这条，模型换个工具照样能进内网。同属一行级改动（复用同一份 `decideNetworkAccess`）。
4. ~~SEC-13（`sourcemap`）+ PERF-05（NEW-03）+ PERF-06（NEW-04）+ PERF-04~~ ✅ **已完成**：四项全修；过程中发现并修掉 **NEW-06**（否则 PERF-05 会变成导出功能全坏）。新增 `audit-small-fixes.unit.test.js` 21 例 + `workspace-preview-listener-lifecycle.unit.test.js` 6 例 + `export-click-lazy-import.unit.test.js` 15 例（NEW-07，审查后重写为 acorn AST）。审查驱动的第二轮加固：守卫堵 4 个假绿洞（负向对照 M0–M6 七变体全拦）、`audit-small-fixes` 产物级断言修正本机静默绿（`new URL` 在该环境解析成 `/dist` 使 `distReady` 恒 false）、PERF-06 改为逐轮透传 signal 修并发下作废语义。全量 **103 文件 / 1589 测试全绿**，eslint 0，已重跑构建与商店打包（包内 0 个 `.map`），真扩展冒烟 27 项全绿。

**第二批（各需你一句话）**

5. ~~SEC-11 转义 + SEC-05 origin 校验 + NEW-05 mermaid 守卫~~ → **拆分处理**（核实后三条不同性）：✅ **SEC-11 已修**（纯追加式转义，风险低）；⚪ **NEW-05 实为误报**（已被现有 SVG 守卫与作用域渲染消解，不修）；🔴 **SEC-05 确认为真问题但修法不低风险**（origin/source 校验对同源 iframe 无效、跨域下易打断选区上报，需真扩展 iframe 探针才能取证）——待用户定夺是否配探针单做。
6. **SEC-01 内容脚本消毒**：⚪ **暂缓（2026-10-17 用户决定，暂不做）**。修法在"DOMPurify 进 manifest 注入（每帧 +~20KB，触 PERF-01 原则）"与"按需懒注入（时序/CSP 复杂）"间取舍，属架构权衡。
7. ~~SEC-07 凭据保护策略 / SEC-04 抓包头脱敏策略 / SEC-12 xlsx 替换 / P1-3 记忆来源分级~~ → **2026-10-17 拆分**：✅ **P1-3 已修**（见第四节 P1 行）；SEC-07 落盘加密**暂缓**（过度保护）、WS token 移出 URL **不可行/不必要**（见第二节 SEC-07）；SEC-04 脱敏、SEC-12 xlsx 替换均 **⚪ 暂缓待定**（改变产品能力，需你先定方向）。这四条确在"要不要改变产品行为"这一层，不在代码难度层。
8. agent 侧 `ragUrlIngest` 改 B2（AND 闸语义）+ 补"关 + 白名单非空"用例 —— 语义已定（你选了 B2），本轮按你的指示暂未动代理端。

**搁置**：P1-2（工具级放行粒度）。**已完成的前置动作**：dist 已重建（NEW-02），当前产物含 `279cd74`、内容脚本注入瘦身与 SEC-03 闸门；真机验证时请重点上表 PERF-01 行列出的 5 个功能点，以及新设置项的三态（默认关 / 开闸但列表空 / 开闸且命中条目）。
