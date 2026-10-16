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
| ✅ 已修复 / 已完成 | 8 | SEC-02（命令确认接真实弹窗，含延伸的 4 类名单绕过）、SEC-14、底账二的 P0-1 与 P1-1（同 SEC-02，计两项）、SEC-03 的"日志打印请求头"半条、**PERF-01 / NEW-01**（内容脚本注入清单，1.64 MB → 61 KB）、**NEW-02**（dist 已重建） |
| 🔴 成立，值得排期 | 11 | SEC-01、SEC-03、SEC-07、SEC-08、SEC-10、SEC-11、SEC-12、SEC-13、PERF-02、PERF-05、PERF-06 |
| 🟡 成立，但等级应下调 | 5 | SEC-05（高→低）、SEC-06（高→低）、SEC-04（高→策略取舍）、PERF-03（高→中低）、PERF-09（中→低） |
| 🔵 报告原判即"可接受"，我此前误列为待修 | 2 | PERF-12（报告原文："均有上限/清理，属可接受范围"）、SEC-09（报告原等级即"中·纵深防御"） |
| ⚪ 需产品/策略决策才能动工 | 3 | P1-2（已搁置）、P1-3、SEC-04 |
| 🆔 两份底账都没有的新发现 | 5 | NEW-01 … NEW-05（见第五节） |

**最高性价比的三件**（都不需要你先做策略决定）：

1. ~~**NEW-01 / PERF-01**~~ ✅ **已于本次修完**：`fix-build.js` 的 `libs/` 目录无脑全量注入已改为以源码 manifest 声明为唯一真相源，注入 libs 从 1.64 MB 降到 61 KB（每页每 iframe 少解析 1.61 MB 死重）。
2. **SEC-03**：`fetch_url` 免确认 + 只做 URL 格式校验 → 模型可自主发起内网请求。
3. **SEC-13 + PERF-05 + PERF-06**：三个 1–10 行级的独立小修（关 sourcemap / `chat-export.js` 改动态 import / `previewPdf` 监听配对移除）。

---

## 二、底账一逐条状态（SEC）

| 编号 | 原等级 | 现判定 | 现证据（本轮读取） | 处置 |
|---|---|---|---|---|
| SEC-01 | 严重 | 🔴 成立（定性修正为中） | 6 个位点全部未消毒：`selection-toolbar.js:784`、`:1022`、`:1033`、`:1582`、`:1991`、`:2027`；`DOMPurify` 全仓仅 `src/side_panel/markdown-render.js`、`workspace-panel.js`；`dist/assets/content.js` 中 `DOMPurify` 出现 **0 次** | **定性修正**：innerHTML 插入的 `<script>` 不执行，内联 handler 在**宿主页面主世界**执行，非扩展上下文 → 不是提权，是页面级 XSS。仍应加消毒，但不属"最危险"档 |
| SEC-02 | 严重 | ✅ 已修复 | `tool-executor.js:4279` `requestCommandUserConfirmation`，三处调用 `:4341`/`:4655`/`:4723`；模型自带 `force` 不采信；开关判定 `:4320` | 提交 `fda111e`；延伸修复 `7613e5e`、`18a6703` |
| SEC-03 | 严重 | 🔴 成立（半条已修） | 定义 `tools/storage-tools.js:75` `requiresConfirmation: false`；执行体 `tool-executor.js:2940-2977` **仅** `new URL(url)` 格式校验，无环回/私网/元数据/scheme 限制，headers 任意透传。报告所指"日志打印请求头"**已不存在**：`:2943` 现只打 method/url/timeout | 加内网与 scheme 拦截；是否纳入确认需你定（会新增一类弹窗） |
| SEC-04 | 高 | 🟡 成立，但属有意取舍 | `debugger/debugger-rules.js:126-131` 注释明写"headers 对调试场景最有价值……故完整暴露"；`serializeNetworkEntry` 返回 `requestHeaders`/`responseHeaders`；全仓 grep `redact`/header 脱敏 **0 命中** | 不是遗漏，是策略。要脱敏或纳入确认需你先定调试能力的边界 |
| SEC-05 | 高 | 🟡 成立（高→低） | 真身确为 `selection-toolbar.js:2129-2167`（`window.addEventListener('message')`，无 `event.origin`/`event.source` 校验），报告行号**本来就对**；发送侧 `postMessage` 在 `:1359`、`:1388`、`:1478` | 影响限于"伪造选区文本 + 按坐标弹出工具栏"，不能自行发起 AI 请求、不读数据，仍需用户再点一次 → 降为低。修法：校验 `event.source === window.parent` + 收敛 `targetOrigin` |
| SEC-06 | 高 | 🟡 成立（高→低） | `agent/src/server.js:502-509`：`isLocal` 为真即跳过认证 | 逻辑存在，但公网页→环回的 POST 现被浏览器 **Private Network Access** 预检挡住（agent 未实现 `Access-Control-Request-Private-Network` 授权头）→ 真实可达面是同机进程/自家扩展页 |
| SEC-07 | 高 | 🔴 成立（描述修正） | 扩展 `src/shared/secret.js:22-30` `decodeSecret = atob`；agent `src/crypto-lite.js:1` 文件头自称"落盘混淆（Base64 + `enc:` 前缀）"；全 `src/` grep `encrypt\|decrypt` **0 命中**；WS 仍走 query：`local-agent-client.js:681` `?token=` | **描述修正**：两侧同一水平（Base64 混淆，非加密），不存在"agent 已加密 / 扩展明文"的不对称。要不要上真加密取决于威胁模型（能读磁盘者亦能读 `chrome.storage`） |
| SEC-08 | 高 | 🔴 成立 | `content/page-extract.js:747-750` 与 `:801-804`，两处均直接重写**真实** `document.body.innerHTML`（已确认非克隆文档） | 每次"页内搜索+高亮"清掉全站事件监听/选中态，SPA 可能崩 → 属功能型缺陷。改 DOM Range 高亮 |
| SEC-09 | 中 | 🔵 无可达路径（撤销"外部源"表述） | 主入口 `background/index.js:907`，全 `src/background/` 无 `sender.id`/`sender.url` 校验；但 manifest **未声明 `externally_connectable`** → `chrome.runtime.onMessage` 只收自家扩展页 + 自家内容脚本；且这些 handler 本身在用 `sender.tab?.id` 做路由 | 报告原等级即"中·纵深防御"，我此前"任意外部源可投递"的措辞是加重。作为加固项保留，不作为缺陷 |
| SEC-10 | 中 | 🔴 成立（半条已缓解） | `content/advanced-tools.js:384-399`：scoped 分支已收敛（`#${wrapperId}` 前缀 + `style.textContent` + `data-ai-helper`），但 `else` 分支 `:396-399` 仍把**整段未过滤 CSS** 以 `data-ai-helper="global"` 注入宿主 head | 全局分支加属性白名单，或取消全局模式 |
| SEC-11 | 中 | 🔴 成立 | `side_panel/index.js:3714-3729` 模板直插 `entry.action`、`cat`、`level`、`details`；`formatAuditDetails`（`:3635-3646`）仅截断长度不转义 | 因发生在**扩展页面**，注入成功即获得扩展上下文发消息能力（连带激活 SEC-09 那批 handler）→ 这条的真实危害高于其"中"等级。一行转义 |
| SEC-12 | 中 | 🔴 成立 | `package.json:39` `pdfjs-dist ^3.11.174`、`:40` `xlsx ^0.18.5`；产物 `dist/assets/xlsx-*.js` 424 KB、`pdf-*.js` 305 KB；且用于解析**用户上传的任意文件**（`side_panel/file-extract.js:112`、`:142`） | 不是版本号难看，是"解析不可信输入的库带已知 CVE"。xlsx 官方停更 → 需换库或限功能面 |
| SEC-13 | 低 | 🔴 成立 | `vite.config.js:29` `sourcemap: true`；dist 内 **15 个 `.map`**，最大 `side_panel.js.map` **4.43 MB**（报告写 3.68 MB，已增长）；`.github/workflows/release.yml:91-93` 为 `cd dist && zip -r ../$ZIP .`，**无排除** | 商店包与 Release 包确实带源码映射。一行关闭 |
| SEC-14 | 低 | ✅ 已修复 | 全仓不再有无 `onerror=` 声明的元素 | 无需动作 |

---

## 三、底账一逐条状态（PERF）

| 编号 | 原等级 | 现判定 | 现证据 | 处置 |
|---|---|---|---|---|
| PERF-01 | 严重 | ✅ **已修复（2026-10-16）** | 旧行为：`fix-build.js` 取 `dist/libs/` 下除 `mermaid.min.js` 外全部 `.js` 注入，实测合计 **1.64 MB**（`pdf.worker 1062 KB` + `jspdf 357 KB` + `html2canvas 194 KB` + `marked 39 KB` + `qrcode 23 KB`），且 `all_frames` + `match_about_blank` + `match_origin_as_fallback` → 每页每 iframe 都载。新行为：`scripts/content-libs.js` 以源码 manifest 声明为唯一真相源派生注入清单，实建后 `dist/manifest.json` 为 `[libs/qrcode.min.js, libs/marked.min.js, assets/content.js]`，libs 合计 **61 KB**（降 1613 KB）；`dist/libs/` 文件**全部保留**（side panel 仍靠 `libs-loader.js` 动态加载） | 守卫：`test/unit/content-script-libs.unit.test.js` 11 例（含体积上限锁与旧写法不得复现的接线断言）；负向对照已验（退回旧写法则 2 条接线守卫立刻红）。**待真机点验**：选区翻译/解释、二维码、侧边栏导出图片/导出 PDF、工作区 PDF 预览 |
| PERF-02 | 严重 | 🔴 成立 | `background/constants.js:47` `streamChunkDelay: 30`；`side_panel/chat-streaming.js:264-265` 注释自认"流式每块用 innerHTML 重渲染整段内容（含代码块/图片/思考指示器折叠）" | 成立。改动面大、易回归 → 建议排在真机复测之后 |
| PERF-03 | 高 | 🟡 成立（高→中低） | `content/selection-toolbar.js:2191-2196`：仅顶层 frame，`observe(document.body, { childList, subtree })`，回调为"摘掉再重挂选区监听" | 开销随 SPA 变更频率放大，属长尾。可与 SEC-05 同批处理 |
| PERF-04 | 高 | 🔴 成立 | `side_panel/index.js:3506-3509` 每次 scroll 直接 `chrome.storage.local.set`；**全文件无任何 throttle/debounce**（grep 0 命中） | 一行防抖 |
| PERF-05 | 高 | 🔴 成立（成因已定位，见 NEW-03） | `chat-export.js:36` 静态 `} from 'docx'`；`workspace-panel.js:3366`、`:3402` 两处 `await import('docx')` 被其抵消；产物无 docx 独立 chunk，`dist/assets/side_panel.js` **1.377 MB** | 把 chat-export 也改动态 import 即可让懒加载真正生效 |
| PERF-06 | 高 | 🔴 成立（机制已定位，见 NEW-04） | `mousemove/mouseup/resize` 以**匿名函数**注册在 `previewPdf()`（`workspace-panel.js:2219` 起，`:2394`/`:2402`/`:2440`），从不 `removeEventListener`；`previewFile()`（`:1994`）每次预览都调用它。文件内仅有的 `removeEventListener`（`:1146-1147`）属另一处面板缩放拖拽，非本处配对 | 每预览一个 PDF 泄漏 3 个 window 常驻监听 + 闭包持有的 pdf 文档引用 |
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
| P1 | 记忆写入来源标记 + Tier1 投毒防护 | 🔴 未做，卡策略 | `agent/src/memory/injection.js:89-91` Tier1 仍仅按 `importance >= threshold` 筛；记忆条目**无** `origin` 字段（`routes.js:33` 那个 origin 是 HTTP 请求头）；`agent/src/memory/*.js` 无 `sanitizeFakeTags`/`untrusted` 接线；当时设想的守卫测试 `test/unit/memory-injection.unit.test.js` **文件不存在** |
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
| **NEW-02** | dist 产物落后于源码 | 原现象：`dist/assets/content.js` 构建于 10-16 13:08，而 `src/` 最后改动 13:25（提交 `279cd74`） | ✅ **已消除**：本次已重跑 `npm run build:silent`，产物含 `279cd74` 与本次构建修改（构建时间 17:41） |
| **NEW-03** | PERF-05 的成因是"懒加载做了一半" | `workspace-panel.js:3366`/`:3402` 已用 `await import('docx')`，被 `chat-export.js:36` 的静态 import 抵消 | 修一行即可让既有懒加载真正生效 |
| **NEW-04** | PERF-06 是"每次预览泄漏"，不是一次性注册 | 注册点在 `previewPdf()`（`:2219`）内，被 `previewFile()`（`:1994`）逐次调用 | 命名函数 + 预览切换/关闭时移除，或改用委托 |
| **NEW-05** | mermaid 缺"已渲染"守卫（报告 PERF-10 不含此项，勿混） | `markdown-render.js:688-721` `renderMermaidCharts()` 对 `document.querySelectorAll('.mermaid')` 的**每个元素无条件 `await renderSingleMermaid()`**，无属性/缓存守卫；调用点 `chat-manager.js:484`、`index.js:2409`、`index.js:2454` | 每条新消息都可能重画历史消息里已完成的图表。加"已渲染"标记即可 |

---

## 六、对既有文档与口头结论的勘误

1. **本报告内**：SEC-13 的 map 体积 3.68 MB → 现 **4.43 MB**；PERF-01 的"约 1.93 MB"实测为 **1.64 MB libs + 274 KB content.js**；SEC-03 的"日志打印请求头"半条已不成立。
2. **报告"一、结论速览"的两处判断需一并修正**：①"内容脚本渲染链路是本项目唯一的真实 XSS 通道"——SEC-11（审计日志未转义）同样可达，且它发生在扩展页面、危害更高；②"风险集中在两处"中的第二处（命令确认失守）已于今日修复。
3. **对话转述勘误（2026-10-16 我前几轮的错误，以本文件为准）**：
   - 把 SEC-09 说成"任意外部源可投递消息"——报告原等级即"中·纵深防御"，且已注明"manifest 未声明 `externally_connectable`，网页无法直连 Background"。
   - 声称"SEC-05 报告行号错了、真身在 2129"——**报告行号本来就是 `:2129-2167`**，错在我的前一轮转述。
   - 把 PERF-12 列为"待修/前提不成立"——报告原判即"可接受范围"。
   - 编号串位：把 SW 保活记成 PERF-08（实为 **PERF-07**）、把写放大记成 PERF-10/11（写放大是 **PERF-08**；PERF-10 是代码块/表格全 Panel 重绑，PERF-11 是 dataset 属性膨胀），并把 mermaid 归入 PERF-10/11（实为 NEW-05）。
   - 把 SEC-10（CSS 注入）与 SEC-07（凭据落盘）混为一条，并得出"agent 已加密、扩展明文"的不对称结论——两侧都只是 Base64 混淆。
   - 声称"SEC-01 是全仓唯一活跃 XSS 通道、最危险"——定性与等级均过头，详见第二节 SEC-01。
   - 声称"工作区仍有 7 个未提交改动"——已被提交为 `279cd74`，现工作区干净（`git status --porcelain` 为空），但该提交**本地领先 `origin/youhua01` 1 个未推送**。

---

## 七、复核局限（务必连同本表一起引用）

- 全部结论来自**静态代码与构建产物**取证：没有做运行时压测、火焰图、也没有对 SEC-01/03/05/08/11/12 构造真机 PoC。"成立"的含义是**缺陷逻辑确实缺失或确实存在**，不代表已在真实浏览器中复现危害。
- PERF 类判定是**代码形态推断**（如"每块全量重渲染""每次预览注册监听"），实际体感幅度未经测量；PERF-02/01/05 的改动会改变渲染与注入形态，建议与真机复测分批进行，避免归因混淆。
- SEC-06 的可利用性依赖浏览器 PNA 策略的当前实现版本，若 Chrome 放宽或 agent 改为非环回监听，结论需重估。
- 底账二（第四节）来源于对话而非文档，其中"dispatch 竞态"一条至今无法定位代码指代，标记为待澄清。
- 例外：**NEW-01 / PERF-01 已在真实浏览器中验证**（`dist` 装进 Chrome，见探针脚本），不再是纯静态推断；但探针只证明"脚本初始化、资源可取、面板能起"，选区翻译/解释、二维码出图、导出图片/PDF、PDF 预览这类需真实交互与产出物的路径仍未人工点验。另需注意：`test/e2e/*.spec.js` 全部从 `src/` 现打模块，**不经过 `dist/manifest.json`**，因此对构建产物的改动没有现成 e2e 覆盖——这是本轮才暴露出的测试盲区。

---

## 八、建议排期

**第一批（无需决策，独立可验）**

1. ~~NEW-01 / PERF-01~~ ✅ **已完成**：`scripts/content-libs.js` + `fix-build.js` 接线 + 11 例守卫，注入 libs 1.64 MB → 61 KB；已重跑构建，并用真扩展冒烟（12 项全绿）+ 负向对照验过。
2. SEC-03 —— `fetch_url` 增加环回/私网/元数据与 scheme 拦截（保持免确认）。
3. SEC-13（`sourcemap`）+ PERF-05（NEW-03）+ PERF-06（NEW-04）+ PERF-04 —— 四项各 1–10 行，可并一个提交。

**第二批（各需你一句话）**

4. SEC-11 转义 + SEC-05 origin 校验 + NEW-05 mermaid 守卫（同属面板渲染，一批做完一次回归）。
5. SEC-01 内容脚本消毒（DOMPurify 进内容脚本或复用 `libs-loader` 懒加载）。
6. SEC-07 凭据保护策略 / SEC-04 抓包头脱敏策略 / SEC-12 xlsx 替换 / P1-3 记忆来源分级 —— 这四条都在"要不要改变产品行为"这一层，不在代码难度层。

**搁置**：P1-2（工具级放行粒度）。**已完成的前置动作**：dist 已重建（NEW-02），当前产物含 `279cd74` 与本次构建修改；新构建去掉了每帧 1.61 MB 的死重注入，真机验证时请重点上表 PERF-01 行列出的 5 个功能点。
