# 更新日志 (Change Log)

本文件用于追踪项目的核心变更，方便后续总结与发布。

## 2026-10-30

### 待办第二轮：语言热切换、快捷键、单条填入与拖拽、导入导出、处理中计数与统计视图

> 来源：用户实测提出六件事——切语言要重启插件才生效、待办操作要支持快捷键、批量填入没有意义只要单条、条目要能拖进输入框且带组合好 的文本、头部看不到处理中条数、需要一个统计视图看完成情况与比例。

**语言热切换：三处一起修才有效**
- 根因不是「翻译没加载」，是三条链路各自断：骨架文案写 `t(...)` 插值，只建 DOM 那一刻定稿；JS 拼的列表不归 `applyI18n` 管；`initI18n()` 异步、`initTodoPanel()` 同步，骨架可能先建在默认语言上。
- 骨架全部改挂 `data-i18n*` + `applyI18n(containerEl)`，列表/菜单/统计浮层各自 `subscribe()` 重渲染，`initI18n().then()` 再补一次 `render()`。切语言立即生效，不必关面板更不必重开插件。

**快捷键（Alt + 字母，作用对象是当前行）**
- `Alt+T` 开关面板、`Alt+A` 聚焦添加框（面板关着也生效）；`Alt+B` 备注、`Alt+L` 链接、`Alt+D` 完成/退回、`Alt+P` 循环优先级（只对聚焦行生效）；`↑`/`↓` 移行。
- `focusin` 记当前行 + 重渲染后 `restoreRowFocus()` 送回同一行——否则按一次方向键焦点掉到 `body`，后续快捷键全部失效。词条同步登记到 `#shortcutsModal` 与中英 locales。

**只留单条填入 + 拖拽进输入框**
- 删除批量「填入输入框」「复制清单」：积压越多，把整份清单塞进输入框越没处下手。
- `buildItemDigest` 与整单摘要共用 `itemLine`/`noteLine`，所以行内填入与拖拽落下的是同一份文本（标题行 + 状态/优先级/截止 + 备注 + 链接），可直接追问 AI 做任务规划。拖拽 `setData('text/plain', digest)`，落在 `#userInput` 只追加不发送。

**导入导出：先范围再格式，合并为主、替换二次确认**
- 新增 `todo-io.js`（Blob + `a[download]` + 选文件）。选文件必须同时接 `change` 与 `cancel`，否则用户取消后 Promise 永久悬着。
- 文件名 `ai-helper-todos[-active|-done]-YYYY-MM-DD.ext`；JSON 可回导（字段白名单含 `prevStatus`/`order`/`completedAt`），Markdown 给人看；范围内为空不生成空文件。
- 合并只追加、同 `id` 跳过不覆盖，失败只摘掉本次新增；替换先弹全局确认框，**写失败把原数据写回库**；空文件 / 坏 JSON 拒绝并保留现有数据；导入成功切回待办 Tab。
- 头部菜单六项且每项都带图标：探针截图里发现三个导出项没图标而其余有，整列文案左缘参差，已补齐并补一条结构守卫单测。

**处理中计数 + 完成流水 + 统计浮层**
- `groupTodos` 的 stats 扩到 `total/done/active/pending/doing`，进度行按需追加 `· 处理中 z`（z=0 不占字）。
- 完成率与近 7 天趋势单靠当前清单骗不出来，加一份 90 天轻量流水 `chrome.storage.local.todoStatsLog`：独立 `writeChain` 串行读-改-写，新增 +added、进入完成 +done、撤销按 `completedAt` 那天 -done，失败只 `warn` 不影响待办。
- 统计视图拆两层：`todo-stats-view.js` 纯渲染（只依赖 i18n，柱高归一化与除零可直接单测）、`todo-stats-panel.js` 管挂载与键盘。内容为完成率 + 四态 + 逾期 + 近 7 天柱图 + 今日新增/完成 + 连续天数 + 高优先级；`Esc`/遮罩/`×` 三种关法，层级 10015 低于菜单 10020，开着时切语言立即重刷。

**验证**
- 单测：`todo-model` 54 / `todo-manager` 39 / `todo-panel-structure` 87 / `todo-io` 10 / `todo-stats` 10 / `todo-stats-view` 5；全量 `vitest run` **224 文件 / 3513 例全绿**；`npm run lint` 与 `npm run theme:check` 无输出；`npm run build:silent` BUILD_SUCCESS。
- 新增探针 `test-results-probes/_todo-io-stats.mjs` **40/40 ALL CHECKS PASSED**：真下载 JSON/Markdown 并校验内容、空范围不导空文件、合并去重/重复导入/坏 JSON/替换确认/空文件不清库、统计浮层数值与 7 柱与层级与三种关法、切语言后浮层与 header 菜单立即变英文。
- `_todo-panel-visual.mjs` 同步修掉三处**过期断言**（批量入口已删、`:focus-within` 会让操作浮现、点哪行焦点跟哪行），修完整轮 ALL CHECKS PASSED。

### 用户气泡正文对比度：白字从 3.66 提到 5.59，并把这条不变量做成门禁

> 来源：上一轮「点停靠条芯片定位」的探针顺带报出的既有问题——用户气泡正文对比度 **亮 3.66 / 暗 2.45**，都低于 WCAG AA 的 4.5:1。用户批准单开一项修。

**根因不是「颜色选浅了」，是 token 契约与值不符**
- `docs/superpowers/specs/2026-10-18-theme-switching-design.md` §4.2 把 `--brand-fill` 的用途写成「实底按钮/开关轨道（**保白字 AA**）」，可它的亮色值当时就填了 `#667eea` —— 白字在上面只有 3.66:1，契约要求的 AA 从来没成立过。
- 而这个 token 在 `src/` 里**零引用**（死 token），所以不符值的坑一直没人踩到；`.message.user` 是直接拿了 `--brand-500`。
- `--brand-500` 本就不该承载正文：校验器 `scripts/theme-contrast-check.py` 是按**非文本图形 3:1** 给它定的档（适合图标 / 边框 / 进度条），而门禁从不算「白字 on 品牌实底」这一格 —— 于是 3.66 没有任何一道闸能拦住。

**改法（选「白字不动」那条路）**
- 亮色 `--brand-fill` 取品牌阶更深的 `#4c5bd4`（白字 **5.59:1**），暗色保持 `#566ad3`（**4.77:1**），两档同口径；`.message.user` 底色 `--brand-500` → `--brand-fill`，`color: var(--text-on-brand)` 一个字不动 —— 气泡内以白字为前提的配色（文件标签的 rgba 白底白字、悬停工具条）因此全都不用跟着改。
- 拒绝的方案：① 暗色翻成「浅底深字」（`#16181d` on `#8da2f2` = 7.26:1）数值最好看，但要把气泡内所有白字前提的配色重做一遍；② 直接改 `--text-on-brand`（全仓 63 处引用）或改 `--brand-500`（全站色源）爆炸半径更大。
- `--brand-fill` 补契约注释（写清它是 AA 实底、不是 `--brand-500` 的别名，动它必须重新过 AA）。

**换深底把自己引入的第二个坑顶出来了**
- 高亮脉冲 `bookmarkHighlightPulse` 带 `inset` 琥珀内光，会把正文底下那层提亮：实测瞬时掉到 亮 **4.54**（相对降 18.9%）/ 暗 **3.62**（降 24.3%），反而**跌破 AA**。原先浅底本来就不过线，内光才没被当成问题。
- 新增 `@keyframes bookmarkHighlightPulseOnBrand`：只做外扩涟漪、全程零 `inset`，配 `.message.user.bookmark-highlight` 专用规则 —— 反馈一样不少（外圈 + `::before` 描边都动），正文底下那层颜色一律不动。收藏 / 搜索 / 目录跳转那一路的通用脉冲**一字未改**（探针反向断言助手气泡峰值帧确有 inset，防止顺手改错地方）。
- `@media (prefers-reduced-motion: reduce)` 的选择器组必须补上 `.message.user.bookmark-highlight`：它权重 (0,3,0) 高于块里原有的 `.bookmark-highlight` (0,2,0)，漏写就会在「减少动态」下赢过本块、气泡又开始闪。

**把不变量做成门禁**
- `scripts/theme-contrast-check.py` 新增 `brand_fill_check()`：对 `:root` 与 `html[data-theme="dark"]` **两块都**算 `--text-on-brand` × `--brand-fill` ≥ 4.5，失败计入非零退出（token 缺失则跳过不报错）。实测 `[OK] 亮色 5.59:1` / `[OK] 暗色 4.77:1` / 未达标 0 项 / 退出码 0。
- `test/unit/theme-contrast.unit.test.js` 2 → **6 例**：门禁确实跑到（亮暗两行都出 `[OK]`，防空跑）、把 `--brand-fill` 改回 `#667eea` 必须 `[AA FAIL]` 且非零退出、亮色 `brand-fill` 不许是 `brand-500` 的副本、`.message.user` 必须用 `--brand-fill` 不许退回 `--brand-500`。顺带修掉测试自己的坑：`css.indexOf('data-theme')` 会被文件头注释命中而切出空串，导致「undefined not.toBe undefined」假过 —— 改用 `html[data-theme="dark"]` 并补两条 `toBeTruthy()`。
- `test/unit/message-focus-anchor.unit.test.js` 7 → **11 例**（CSS 源码守卫）：新 keyframes 全程不含 `inset`、气泡确实切到 `OnBrand`、通用 `bookmarkHighlightPulse` 保持原样、reduce 块含那条高权重选择器。两文件合跑 **17 例全过**。
- 真实 Chrome 探针 `test-results-probes/_session-archive-dock-ui.mjs` 50 → **66 项**，亮 / 暗各 **66/66 EXT_UI_PASS**：静态正文对比度 ≥4.5 硬门、逐帧 rAF 录 900ms（56 帧）断言取样窗口内**无 inset** 且**确有外扩涟漪在动**、`::before` 描边动画名在位、高亮前后对比度差 ≤2%（实测 before = during = 亮 5.59 / 暗 4.77）、助手气泡峰值帧确有 inset。晕光必须用新的 `contrastWithGlow()` 按 alpha 合成「祖先不透明底 + inset 层」——直接读 `backgroundColor` 永远看不见内光的影响。
- 探针两个取样坑一并记录：只取 300ms 单帧会刚好落在 `alpha 0 / spread 12px` 的关键帧上（必漏），改成逐帧录制再 `some/every`；`style(sel, prop)` 不支持伪元素，`::before` 的动画名得走 `getComputedStyle(el, '::before')`。

**如实报告没动的部分**
- 还有 **11 处**「`--text-on-brand` 白字 + `--brand-500` 实底」的规则没跟着换：`src/options/styles.css` 的 `.add-model-form-actions .btn-primary` 与 `.toolbox-btn-primary`（真按钮文字，亮色同样只有 3.66），以及侧边栏 9 处徽标 / 圆点 / hover 态（`.tool-toggle-btn .badge`、`.main-tasks-dot`、`.session-dock-badge`、`.session-archive-entry-count` 等）。它们不属于「用户气泡」这一项，而且按 4.5（正文）还是按 3:1（图形）定档需要单独定夺 —— 新门禁只校 `--brand-fill`，暂时管不到这些点。
- 同一份 spec §4.2 把「用户气泡」列在 `--brand-soft-bg`（品牌浅底）那行的用途里，与实现的实底白字不一致；本次保留实底观感（用户已熟悉）并按实底把它修到 AA，这条 spec 与实现的分歧如实留着。
- `src/content/index.js`、`src/content/advanced-tools.js`、`src/content/selection-toolbar-styles.js`、`src/side_panel/token-stats-panel.js` 里仍有硬编码 `#667eea`（SVG 图表 stroke/fill、选中文本工具条），与气泡无关，`npm run theme:check` 也没把这几条列进违规，属既有存量，未改。

**验证**
- `python3 scripts/theme-contrast-check.py src/shared/theme.css` 未达标 0 项 / 退出码 0；`npx vitest run test/unit/theme-contrast.unit.test.js test/unit/message-focus-anchor.unit.test.js` **17 例全过**；探针亮 / 暗各 **66/66**；`npm run theme:check` 无输出。

### 切换会话工作目录：任务执行中禁用的入口，执行结束后必须当场自动恢复

> 来源：用户复测上一轮改动后报告——「会话执行中把输入框底部的切换入口禁掉我是认的，但有时候任务执行完了它还是禁用的，我只有把会话切走再切回来，那个禁用状态才会解除。」语义经确认保持不变（执行中 / 队列非空都不许换目录），只修实时性。

- **根因是快照，不是判定写错**：`updateWorkdirTag()` 把「是否在跑 + 队列是否非空」的结果一次性写进 `el.dataset.locked`，而 `initWorkdirTag()` 只挂了 `session-switched` / `session-workdir-changed` / `agent-model-changed` / `agent-tools-changed` 四条会话与代理类事件——**没有 `generating-state-changed`**（全站已有 13 个消费者挂它，生成起止都派发这一条）。于是生成结束时没人重算 chip，陈旧的 `locked="true"` 又拦在点击最前面，弹窗内部那份当场计算的判定根本没机会执行；「切走再切回」之所以像解药，只是因为会话切换会重跑一次 `updateWorkdirTag()`。队列侧更空：删除 / 清空连 DOM 事件都没有。
- **判定收成一份**：新增 `src/side_panel/workdir-switch-lock.js` 导出 `isWorkdirSwitchBlocked(sessionId)`（`generatingSessionIds.has(sid) || getQueuedCount(sid) > 0`，纯同步内存读，渲染路径上不许发请求）。删掉 `workspace-panel.js` 里各写一遍的 `hasPendingQueue()`，chip 点击、「恢复默认目录」入口与 `showSwitchWorkdirDialog()` 全部改用它——两份实现必然漂移，漂移的表现就是要么假锁、要么正在跑却放行。
- **锁定态跟着事件重算**：`index.js` 新增 `syncWorkdirTagLock()`（只重算 `dataset.locked`，不重新解析目录、不发 HTTP），`updateWorkdirTag()` 也改为调它，全仓只剩这一处写 `dataset.locked`；挂上 `generating-state-changed` + `generation-ended`，并 `subscribe` 队列 store（入队 / 删除 / 清空 / 暂停 / 跨窗口同步都会 `emit`，比补几条 DOM 事件覆盖得全）。
- **点击不信快照**：chip 的 click 改成当场调 `isWorkdirSwitchBlocked()`，顺手把视觉同步回真值。即使将来又有新事件漏挂，最坏也只是「灰一下但点得开」，不会再出现点不动的死锁。

- **测试**：新增 `test/unit/workdir-switch-lock.unit.test.js` 16 例（判定真值表：无会话放行、本会话在跑/在排队拦、别的会话忙不拦、结束且删空后当场放行；源码守卫：`dataset.locked` 全文件只赋值一次、重算入口不含 `resolveWorkdirForSession`、挂了 `generating-state-changed` 与 `generation-ended`、订阅了队列 store、click 里不再读 `dataset.locked`、会话/代理四条监听原样保留、弹窗侧 `hasPendingQueue` 已删且两处共用同一判定）。
- **真实 MV3 探针**：`_workdir-ext-ui.mjs` 加第 7 段 12 项，自带一个假 LLM（Node 侧 SSE，每 500ms 一帧持续 8 秒）真跑一轮生成，**全程不切会话、不重载**：跑前 `data-locked=false` → 生成中立刻变 `true` → 生成中带草稿点击真的入队 → 停止任务后队列仍留着那条（所以按既定语义继续禁用）→ 点队列条目上的 ✕ 删掉后 `data-locked` 当场回 `false` → 再点 chip 真能弹出切换弹窗且没有「无法切换工作目录」的提示。顺带修掉探针自己的过时写法：`indexedDB.open('ai-helper-db', 6)` 在库升到 7 之后会以 `VersionError` 中断整条探针（改为不写死版本）。
- **反向验证**（摘掉才证明监听不是装饰）：只摘两条生成事件监听 → 「任务执行中：chip 立刻变禁用」FAIL；只摘队列订阅 → 「删除最后一条排队项后 chip 当场恢复可点」FAIL（复现的正是用户那句「执行完了还是禁用的」）。两条各自独立失败、恢复后全绿。
- **验证**：`npx vitest run` 220 文件中仅 `todo-model.unit.test.js` 5 例失败（属并发进行中的待办面板改动，与本功能无关），工作目录相关 4 个文件 47 例全过；探针 **101 项全过 / EXT_UI_PASS**；`node --test agent/test/unit/*.test.js` 825 例；`npx eslint src/ agent/` 只剩待办面板的 4 个 `no-undef`（同上，非本次改动）；`npm run build:silent` → BUILD_SUCCESS。


### 待办面板 UX 重做：双 Tab、标记完成入口、优先级色条、外部链接、底边不挡输入框

> 来源：用户在真实扩展里用了一轮之后给出四条硬伤——「怎么都是进行中的呀？」（组名误导）、「上面那个待办上有一个数字一直是 0，前面那个是什么呢？」（`0 / 11` 看不出分子）、「完成的任务在哪里呢？怎么把任务标记完成？只有删除，没有标记完成呢？」（致命可发现性缺陷）、已完成条目被折叠分组顶到屏幕外；并追加要求：菜单不要换行（「连都换行了？好难看呀！」）、要优先级（「在前面加一个垂直的颜色条」）、要能关联外部链接、面板底部不能盖住问答输入框。列表形态经确认选**双 Tab**。

- **双 Tab 取代折叠分组**：「待办 / 已完成」一次只渲染一组（`data-group="active|done"`），各自带条数；折叠偏好彻底不再使用。之前两组同列 + 默认折叠，已完成条目被顶到可视区之外，等价于「做完了但找不到」。头部进度改成自解释的「完成 1 / 3」；在已完成 Tab 里添加会自动切回待办 Tab，避免「加了但看不见」。
- **标记完成有文字入口**：状态圈继续承担点击循环，但行尾「⋯」菜单里必须出现「开始处理 / 标记完成 / 退回待办」——把关键动作藏在一个空心圆圈的点击上是本次最大的可用性问题。「处理中」改用圈内实心点 + 淡底表示，把左侧竖条让给优先级（一个位置只说一件事）。
- **撤销条与智能恢复**：进入 `done` 时记录 `prevStatus`、离开时清除；标记完成后在原位置浮现面板内联撤销条（6 秒），点击走 `restoreTodo` 且**保持 `order` 原位**而不是掉到列表末尾（`showToast` 内部是 `textContent`，塞不进按钮，所以撤销只能做成内联条）。已完成 Tab 每行的「恢复」文案写明目标状态：完成前是「处理中」就回到处理中，否则回到待处理。
- **优先级**：`priority: 'high' | 'medium' | 'low' | null`，模型层 `normalizePriority` 白名单过滤（脏值落库前就变成 `null`）；行首 3px 竖条只代表优先级，色值取仓库实际存在的 `--danger-500` / `--warning-500` / `--brand-500`（设计稿写的 `--brand-red/amber/blue-500` 并不存在），未设置则不出条；摘要里高优先级条目带「（高优先级）」标注。
- **外部链接**：`link` 存绝对地址，`normalizeLink` 剔前导斜杠、缺协议补 `https://`、协议白名单只留 `http:` / `https:`，返回 `{url, host, valid}`。**校验在编排层先于乐观更新**——非法链接不先上屏再回滚，`setTodoLink` 返回 `reason:'invalid'` 并弹「仅支持 http/https」。胶囊是普通 `button`，**`href` 不写进 DOM**，点击时才 `chrome.tabs.create({url})`，扩展页面因此不留可悬停的任意链接；清空回车即移除；摘要只写合法链接。
- **菜单不换行**：`.todo-menu` 用 `width: max-content` + 条目 `white-space: nowrap`，按视口右缘与高度实测夹取（`offsetWidth` 而非猜宽度），超长时可滚动。
- **底边不挡输入框**：不再复用共享的 `clampPanelToViewport`（它只按「视口底 - 8px」夹，恰好会把面板压到输入框上），todo 从 `OPEN_PANEL_SELECTOR` 名单移出，改为参照定时任务的底部锚定：量 `.input-container` 顶边，写私有 `--todo-max-h` 与 `--fit-y`（只取负值），量不到时回退 `innerHeight - 160`，并用 `ResizeObserver` 跟着输入区增高把面板抬上去。
- **探针暴露的两个自引入缺陷**（单测看不见，都是本轮改动带进来的）：① `handleChange` 的 link 分支缺 `linkEditId` 守卫，回车保存后重渲染把还带脏值的输入框从 DOM 拆下来时，浏览器会补发一次 `change` → 写两遍、弹两条一样的 toast（探针 O 组的 toast 串「已关联链接 | 已关联链接」直接暴露）；② 链接编辑器的「取消」按钮点下去时 `change` 与 `focusout` 都比 `click` 早，自动保存抢跑让取消变成死按钮——先试过 `focusout` 里判 `relatedTarget`，实测 `change` 更早就没有焦点信息可用，改成在 `pointerdown` 就 `cancelLinkEdit()`。两条各补源码守卫与探针断言（O3b / O6b）。
- **第二轮反馈（上线后立即复测）**：① 撤销条里的「撤销」两字被折成竖排——`button` 在 flex 容器里的 `min-width:auto` 只等于一个汉字宽，标题一长就把按钮挤窄；补 `.todo-undo .todo-mini-btn { flex: 0 0 auto; white-space: nowrap; }`，长标题交给文本侧 ellipsis 承接。② 切「待办 / 已完成」两个 Tab 时面板整块上下跳——高度原本完全由内容决定，而两个 Tab 条目数必然不同。改为**高度只增不减**：`heightFloor = min(可用高, max(heightFloor, 内容自然高))`，添加条目继续长高直到可用上限后改为列表区滚动，切到条目更少的 Tab 或删条目不回缩；`openPanel`/`closePanel` 把 floor 与 `height` 归零，所以每次重新打开仍按新内容重算（而不是“打开即锁死”导致只有 1 条时面板很矮）。测量前必须先把 `height` 临时置 `auto`，否则量到的永远是上一次自己写回的值。
- **测试同步**：`todo-model` 39 例（优先级白名单、`normalizeLink` 全分支、`linkLabel`/`isLinkOpenable`、`restoreTarget`、`prevStatus` 脏值、摘要含高优先级与链接且非法链接不进摘要）、`todo-manager` 29 例（完成与恢复 / 优先级 / 外部链接三个新 describe：`prevStatus` 记录与清除、恢复保持原位、相同状态短路、非法状态拒收、写操作 `{ok, reason}` 四态、校验先于乐观更新）、`todo-panel-structure` 59 例（双 Tab、状态动作可见、优先级色条分工、外部链接、菜单不换行、几何夹取、高度只增不减与开关归零、撤销按钮不收缩、i18n 中英 key 成对）；探针新增 M / N / O / P / Q 五组实测（菜单条目真实高度与截断、色条真实渲染色与 token 同值、开新标签的 URL 是补全后的 https、面板底边与输入区上沿的几何不变量含输入区增高与 620px 矮窗口、Tab 来回切高度不变且添加条目仍长高、超长标题下撤销按钮实测 38px 单行且文本确实被截断、人为污染超大 height 后重开面板回落）。
- **验证**：`npx vitest run` **218 文件 / 3406 例全绿**；`node test-results-probes/_todo-panel-visual.mjs` **78 项 ALL CHECKS PASSED**（含暗色截图）；`npm run lint`（eslint src/ agent/）无输出；`npm run build:silent` → BUILD_SUCCESS。中英 `DOCUMENTATION.md` 第 36 节与 `docs/superpowers/specs/2026-10-29-side-panel-todo-design.md`（新增 §9 实现记录）已同步。

## 2026-10-29

### 侧边栏待办（todo）：右侧轨道第 6 个入口 + 浮层清单

> 来源：用户提出「侧边栏对话面板右侧边缘加一个待办入口，弹窗里能快速增删改、拖拽排序、分待处理/处理中/已完成，备注默认折叠，还能一键把清单填进输入框让我接着问『怎么实施』」。

- **入口接入既有轨道，不新造定位**：各入口已统一在 `src/side_panel/side-rail.js` 的 `SLOT_ORDER`（`flex column` + `space-evenly` + `gap:10px`，槽高 34px）里，本次只加一条槽位名 `todo`（排在「检索」之后、「定时任务」之前），位置由轨道自动均分，无任何手写定位；配色用主题里唯一没被占用的 `--brand-violet-500` / `--brand-violet-rgb`（brand=消息目录 / warning=收藏 / info=工作目录+搜索 / success=定时任务），入口容器、按钮尺寸语法（`position:relative` 容器 + 右对齐 + `padding: 8px 4px` 得到 24×34）与收藏/搜索逐项对齐，不撑满 28px 轨道。
- **矮窗口兜底**：6 个入口在 `max-height: 620px` 下把槽高压到 30px、间距压到 8px（254px → 220px），避免挤压聊天区；面板本身也加 `max-width: calc(100vw - 44px)`，窄侧边栏下不会把聊天区全盖住。
- **三层拆分（可单测）**：`todo-model.js` 纯逻辑（状态流转 `nextStatus`、两段式分组 `groupTodos`（进行中按 `order` 升序、已完成按 `completedAt` 倒序）、`reorderList`/`withOrder`、时间格式化、`buildTodoDigest` 生成 Markdown）；`todo-manager.js` 编排（state 缓存 + IndexedDB 落库 + 失败回滚 + `subscribeTodos` 广播）；`todo-panel.js` 只渲染和收事件。存储侧 `src/storage/db.js` 升级 DB_VERSION 6→7，新增 `todos` store（keyPath `id`，索引 `status`/`createdAt`）与 `getAllTodos`/`putTodo`/`putTodos`/`deleteTodo`/`deleteTodos`。
- **交互按「清爽」取舍**：行内常驻只有「状态圈 + 标题 + 时间」，编辑/复制/⋯ 靠 `:hover, :focus-within` 浮现（键盘 Tab 也能看见）；低频动作（编辑标题、备注、截止日、删除）收进行尾 `⋯`，批量动作（复制 Markdown、复制并附提问、清除已完成）收进头部 `⋯`。状态圈点一次「待处理 → 处理中」仍在进行中组（打 ⏳ 标记），点两次移入「已完成」并默认折叠组；备注编辑结束即收起，只留一条「备注」折叠条；拖拽只在进行中组内生效，插入位置用虚线段提示，跨组改状态只走状态圈。
- **一键填入输入框**：`fillInput()` 把清单转成 `**进行中** / **已完成**` 的 Markdown **追加**到原草稿之后（不覆盖、不自动发送），再 `adjustInputHeight()` 撑高并自动收起面板；破坏性操作（删除、清除已完成）优先走全局 `window.showCustomConfirm`，弹窗不可用时**不做**动作。
- **踩坑与修复**：第一版 `initTodoPanel()` 只建了容器却漏了 `getSideRailSlot('todo').appendChild(containerEl)`，真实扩展里轨道有 6 个槽位但入口永远不出现（单测只看结构、看不出来）—— 已补挂载并加结构守卫；同时把入口从 `width/height:100%` 改成靠 `padding` 决定尺寸，与其它入口同为 24×34（原来撑满 28px 宽，视觉上比邻居胖一圈）。
- **验证**：新增 `test/unit/todo-model.unit.test.js`（24 例）+ `test/unit/todo-panel-structure.unit.test.js`（16 例：槽位顺序、打开态夹取名单、pointer-events、矮窗兜底、tinted 配色无硬编码色值、入口尺寸语法、行内操作默认 `opacity:0`+`pointer-events:none`、`:focus-within` 键盘可达、菜单 `position: fixed`、纯逻辑/编排层不碰 DOM、填入保留草稿正则）；真实 MV3 探针 `test-results-probes/_todo-panel-visual.mjs` **26 项全过**（入口尺寸/槽内偏移与邻居逐个比对、快速添加后焦点保持、两次点击状态流转、组默认折叠、行内按钮 hover 前后 `opacity` 0→1、真鼠标序列驱动的 HTML5 拖拽改序 + 重载后持久化、填入输入框保留草稿且自动关闭、暗色主题截图、全程无 pageerror），并据此修掉 3 个只有真扩展才暴露的问题（漏挂载、入口偏宽、`page.dragAndDrop` 不触发 `dragover` 的探针误判）。回归 `npx vitest run` **209 文件 / 3161 例**、`npx eslint` 无输出、`npm run theme:check` 通过、`npm run build:silent` → BUILD_SUCCESS。

### 待办面板评审后修复：重渲染吞掉未提交编辑、并发写互踩、失败静默

> 来源：功能完成后对本次全量改动（`git diff origin/main...HEAD`）发起代码评审，产出 1 Blocker + 2 重要 + 4 次要；逐条回源码独立复核后**修 6 条、判 1 条不修**，并补两层证据（源码守卫单测 + 真实 MV3 探针）。

- **Blocker — 敲到一半的行内编辑会被别人的操作抹掉**：每一次落库成功都会 `emitChange()` → `render()` 重建整段列表，而标题/备注/截止日的未提交内容只活在 DOM 里。典型路径：正在给 A 敲备注，顺手点了一下 B 的状态圈 → A 的输入框被重建、草稿回退成库里的旧值，用户看到字还在、其实下一次渲染就没了。修法是给面板层加一套**草稿保护**：`drafts` Map（`id → {title|note|due}`）在 `bodyEl.innerHTML` 赋值**之前** `captureDrafts()` 抓取脏值，赋值之后按 `getFocusMarker()` 还原焦点与光标位置（`safeCaret()` 兜住 `date` 输入读 `selectionStart` 抛 `InvalidStateError` 的问题），三种编辑器一律以草稿为底稿渲染，`pruneDrafts()` 在条目消失时回收，保存/取消/切走才 `clearDraft()`。
- **重要 — 并发写各自抓「整表快照」会互踩**：原回滚逻辑是失败时把 `state.todos` 整体还原成操作前的快照，两个操作重叠时后失败的那个会连别人已经落库成功的变更一起抹掉。改为 `writeChain` + `queueWrite()` 把落库排成串行链；单条操作（`addTodo`/`updateTodo`/`setTodoStatus`/`removeTodo`）失败时**只撤销本条**（`replaceTodo(current)` / `filter` 掉新条目 / 把本条补回）；reorder 失败只还原 `order` 字段（不把重排前抓的整份对象盖回去，否则期间改好的标题会被一次失败的重排抹掉）；clear-completed 失败只补回本次清掉的条目（不连带覆盖期间新增的条目）。
- **重要 — 回滚不广播，界面和数据各说各话**：乐观值已经渲染给用户了，失败分支原先只改内存不 `emitChange()`，界面就停在那个假的值上。现在**所有**失败分支都补上广播。
- **次要 — 状态圈点下去、截止日选完、删除后条目又回来了，全都一声不响**：把 `persist(promise, successMessage)` 做成面板层落库结果的**唯一出口**，失败一律弹 `todo.saveFailed`，成功按需弹提示。原先只有主交互走它，`cycle`／`due-clear`／`change`／标题回车经 `persist()`，本轮又把备注保存、**删除**（原 `if (removed) toast成功`）、**清除已完成**、**拖拽重排**四个同样会静默的分支收进来——它们失败时编排层已把数据回滚广播回来，界面上「东西又出现了」但没有任何原因，用户只能自己猜；`copyText` 的「剪贴板不可用」分支原来只在有输入框时才提示，现补 `todo.copyFailed`（中英各一条）并对两类失败都给提示。
- **次要 — 窄侧边栏下面板把左侧停靠条走廊吃掉**：合并进来的执行中会话停靠条占左缘 26px、并给聊天区留 34px `padding-left`，而待办的 `max-width: calc(100vw - 44px)` 只减了右轨宽度。改为 `calc(100vw - 60px)`（右轨 26 + 左走廊 34），360px 窄窗实测面板 `left=34 / right=334`，不再压住芯片。
- **次要 — 与定时任务同开时待办被盖住**：待办是轨道第 5 槽，树序在它后面的「定时任务」面板会按 DOM 顺序叠上来；`.todo-panel.expanded` 加 `z-index: 2` 提到轨内最上层，探针用 `elementFromPoint` 验证命中待办。其它 5 个浮层之间的叠放属 main 五入口既有的全局行为，本次不扩散改动。
- **清理**：删掉无人调用的 `export function closeTodoPanel()`；`removeTodo` 对不存在的 id 提前返回，避免空跑一次删除。
- **判定不修（附证据）**：评审提出 `getAllTodos` 的 `request.onerror = () => resolve([])`「会把读失败伪装成空清单」。核对 `src/storage/db.js`，同款写法共 7 处（第 270/380/471/772/819/890/925 行，覆盖 sessions、archivedSessions、bookmarks、scheduledTasks 等全部 store），是仓库既定的读降级约定——单独改待办一处反而制造不一致，要改得整体改，不属本次范围。
- **文档同步**：`docs/zh|en/DOCUMENTATION.md` 的 IndexedDB 章节仍写「v6 / 八个对象存储」（合并后实际 v7 / 九个），已校正并补 `todos` store 行、持久化策略表加「侧边栏待办」行、项目结构树补 `side-rail.js` 与 `todo-model/todo-manager/todo-panel` 三件套、架构图 Side Panel 框增列「待办清单」，并新增功能章节「36. 侧边栏待办清单 / Sidebar Todo List」；设计文档 `docs/superpowers/specs/2026-10-29-side-panel-todo-design.md` 的截止显示口径（原写 `⏰ 今天 18:00`）改为与实现一致（日期粒度、逾期按天比较、告警图标）。
- **验证**：新增 `test/unit/todo-manager.unit.test.js`（14 例：成功路径 3 + 每条失败路径「只撤销本条且必须广播」8 + 并发时序 3（串行排队、重排失败不抹期间改好的标题、清除失败不影响期间新增的条目），用 `vi.hoisted` 桩控制挂起与失败）；`todo-panel-structure.unit.test.js` 16 → **29 例**（新增重渲染存活、失败必走 `persist`（含删除/清除/重排不得只报成功）、`max-width` 留走廊与轨内层级、不留死导出四组守卫）；真实 MV3 探针 26 → **36 项全过**（新增 J1–J4：他人操作触发的重渲染中未提交备注存活、焦点保持、存完收起、重载后落库；K1–K2：360px 窄窗左缘 ≥ 34、与定时任务同开时命中待办且 `zIndex=2`；L1–L3：行「⋯」→ 删除→ 全局确认弹窗真实出现、确认后条目移出且仍弹「已删除」、重载后不复活）。全量回归 `npx vitest run` **218 文件 / 3346 例**全过、`npx eslint src/ agent/` 无输出、`npm run theme:check` 通过、`npm run build:silent` → BUILD_SUCCESS。
- **如实记录、本次未修**：①六个轨道浮层之间没有互斥（点外不关、可同时打开），这是 main 五个入口共有的既有全局行为，要修得改 5 个模块；②`@media (max-height: 620px)` 把槽高压到 30px 而按钮 content 是 32px，svg 被压到 14px，全入口共有；③`.session-dock-tip`（z-index 10005）悬停提示会盖在待办浮层之上；④`.search-panel` 完全没有 `max-width` 兜底；⑤`.docsite-src/` 与已发布的 `docs/wiki/` 生成的文档站仍写「当前版本为 6」，需整站重生成才能刷新。

### 会话归档区 + 执行中会话左侧停靠条

> 来源：用户提出两件事——①「会话开太多会产生干扰，有些我觉得不会再问答了，可又不敢删，万一还用得上」→ 要能把会话移入归档区、随时调回、也能彻底删除；②「执行中的任务夹杂在很多会话中间，要选来选去很麻烦」→ 想在左侧边缘给正在跑的会话一个小图标，悬停看标题、点击进入，跑完给个完成提示。

**归档（可逆移出视野，不是删数据）**
- 数据层落 `session.archivedAt`（`session-store.js` 新增 `archiveSession` / `unarchiveSession` / `listArchivedSessions` / `nextSessionOrder`），消息、目录绑定、ReAct checkpoint 全部原样保留；`loadSessions()` 默认过滤归档会话，`{ includeArchived: true }` 才拿全量。
- 三处「用户能翻到会话」的入口统一隐藏：标签栏（走 `loadSessions`）、「全部会话」下拉、全局消息搜索（`db.searchActiveSessionsMessages` 与 `search-panel` 的 `visibleSessions` 都过滤）。
- 入口只有一个且不占常驻空间：「全部会话」面板底部 `归档区 (N)` → 全屏归档面板（层级 10004，高于会话列表）。面板内按归档时间分组、可搜索、点行=恢复并进入、右侧 hover 出「恢复 / 彻底删除」，底部一句「归档只是移出视野，随时可以恢复」。
- 三个归档入口（列表行按钮、标签右键菜单、归档面板）都走同一个 `archiveSessionFlow`；**执行中 / 有排队任务时拒绝归档**并说明原因（`isSessionArchivable`），避免把正在写结果的会话藏起来。
- 归档掉当前会话后自动切到最近更新的会话（一个不剩就新建），否则用户会停在一个标签栏里看不见的会话上；`switchToSession` 另加一道兜底——切到归档会话先自动解档（收藏、旧入口、定时任务都可能直达）。
- 彻底删除复用普通删除的清理路径（队列条目 / 附件 / 完成标记 / checkpoint），并二次确认文案明说「消息与执行记录都无法恢复」。
- **与旧的 `archiveCurrentSession()` 划清边界**：「清空当前对话」写的是独立 `archivedSessions` 表（上限 20、仅 RAG 检索可见、随后删会话），和本次「归档区」不是同一件事；两处都加了辨析注释，防止后续维护把两条通道搞混。

**停靠条（`src/side_panel/session-dock.js`，新模块）**
- 不新建运行状态，只消费既有信号：后台 `QUERY_SESSION_RUNNING` 回执（权威）+ `state.generatingSessionIds` / `pendingCallApiSessionIds`（面板跨会话派发记账）+ `state.completedSessionIds`（完成待查看，已持久化）+ `queue-store`（排队条数）+ `EXECUTION_STATUS_UPDATE`（当前节点/子任务进度）+ `SCHEDULED_TASK_RUN_STATE`（定时任务来源）。
- 三态芯片（26px 圆）：**执行中**品牌色 + 呼吸光环 + 外圈旋转弧，tooltip 显示「正在执行：Write · 子任务 2/3」；**排队中**琥珀色 + 条数徽标；**完成**绿色 ✓ + 一次性弹出脉冲 + `HH:mm` 完成时间。
- 完成态不自动消失（自动消失等于把提示价值丢掉）：点进会话由 `session-switched` 自动移除；也可悬停点 `×` —— 只对完成态给 `×`，执行态给 `×` 会被误读成「取消任务」。`×` 结果持久化到 `chrome.storage.local[sessionDockDismissed]`，该会话下次开跑自动解除。
- 当前位置：贴左缘、从聊天区顶部向下堆叠（左侧垂直中心已被消息跳转热区 `.chat-nav-hotzone` 占住，停在那里会互相遮挡）；出现时给 `.chat-container` 留 34px 左侧走廊，让排版让位而不是把芯片透明叠在正文上；层级 10002，会话面板一开就整条被盖住。
- 面板不可见时暂停校准（`document.hidden` 跳过），切回立即补一次；`EXECUTION_STATUS_UPDATE` 一轮能来几十条，渲染 250ms 去抖。
- **定时任务配套**：`scheduler.resolveHostSession` 把归档会话视为不可用并重建专属会话（否则执行结果写进用户看不见的会话）；`SCHEDULED_TASK_RUN_STATE` 补发 `sessionId`（原先只有 `taskId`，入口图标能转但停靠条无从按会话归位）。

**可访问性与动效**
- 芯片是 `<button>`（可 Tab、可 Enter），`aria-label` 带标题与状态；`×` 有独立 `aria-label` 且 `:focus-within` 也显示；三态颜色对软底均取 `-700` / `-strong` 档过 4.5:1（`--brand-500` 在 `--brand-soft-bg` 上只有约 3.6:1）。
- `prefers-reduced-motion: reduce` 下呼吸、旋转弧、完成脉冲全部关闭。

**验证**
- 新增 `test/unit/session-archive.unit.test.js`（20 例：内存版 IDB 验 `loadSessions` 默认过滤 / 归档保留消息与 order / 幂等 / 恢复落位末尾 / 归档列表倒序 / 归档再恢复回到列表；另含执行中拒归档、切归档自动解档、搜索过滤、三入口接线、二次确认、定时任务自愈等源码守卫）与 `test/unit/session-dock.unit.test.js`（20 例：`buildDockEntries` 的当前会话排除、优先级、排队、`×` 只对完成态生效、来源标记、排序、Set/数组入参，以及面板初始化与样式接线）。
- 视觉探针 `test-results-probes/_session-archive-dock-ui.mjs`：用真实 `theme.css` / `styles.css` 渲染真实 DOM 结构，断言浏览器算出来的值（芯片 26×26、三态动画名、等距堆叠不重叠、`×` 悬停才显、tooltip 不挡点击、34px 走廊、z 序 停靠条 < 会话列表 < 归档区、归档面板全屏、悬停归档行才出操作按钮、无页面异常）→ 亮色 / 暗色各 **25 项全过 / EXT_UI_PASS**。
- 回归：`npx vitest run` **209 文件 / 3161 例**全过、`npx eslint src/ agent/` 无输出、`npm run build:silent` → BUILD_SUCCESS。

### 停靠条补两个边界：条目放不下时的 +N 聚合、执行状态卡死时的陈旧降级
> 来源：用户追问两点——①「执行中状态有没有显示个数限制？假如我执行 10 个、20 个任务，左侧边缘放不放得下？」②「万一执行状态卡死掉了，停靠条上的执行中状态还删不删得掉？现在好像只有跑完变打勾才出现小叉，如果一直是执行中怎么办？」

**先如实认下两个原有缺陷**（追问时读代码才发现，不是这次才出现的）：
- `MAX_VISIBLE = 8` 的注释写着「超出纵向滚动」，但 `.session-dock` 既无 `max-height` 也无 `overflow`，且渲染后还有一句死代码 `dockEl.style.maxHeight = ''` —— 第 9 个条目是**静默丢弃**，不是滚动。更糟的是同组按 `startedAt` **升序**排，被丢弃的恰好是最新的任务。
- `collectEntries` 用「后台集合 ∪ 两路面本地集合」的并集去解除 `dismissedIds` 标记，而陈旧条目正是脏在本地集合里 —— 点 `×` 后下一帧就被自己复活，等于删不掉。

**溢出：+N 聚合芯片 + 溢出面板**
- 整条只占 `MAX_CHIPS = 8` 个位置：条目 ≤ 8 全画条目；> 8 画前 `MAX_INLINE_ENTRIES = 7` 条 + 第 8 位换成 `+N` 芯片（`session-dock-item--more` / `session-dock-more`）。26px 宽的芯片列里塞滚动条没法用，所以滚动放在**正常宽度（220px）的溢出浮层**里，`max-height: 320px` + `overflow-y: auto`，挂在聚合芯片右侧 8px、与芯片顶对齐且不超出视口底部。
- 溢出面板按「其他执行中的会话」列出全部被折叠条目（标题 + 状态两行、整宽 `<button>`、点击进入该会话并收起），悬停/聚焦芯片展开、移开延迟收起、点击即钉住、`Esc` 与面板隐藏时一并收起。`aria-expanded` + `is-open` 类由 JS 同步（溢出面板在 DOM 里排在停靠条之后，CSS 兄弟选择器够不到）。
- 同组排序改**降序**（running/queued 按 `startedAt`、done 按 `doneAt`，最新在前），保证被折叠的一定是最老的；`+N` 数字 > 99 显示 `+99`。
- `+N` 芯片用中性虚线描边 + `--text-secondary`，避开三态状态色，免得被读成「第四种执行状态」。

**卡死：陈旧降级 + 允许移除**
- 新增导出纯函数 `isEntryStale({ phase, sessionId, backendRunningIds, startedAt, lastUpdateAt, now, staleMs })`，三条件同时成立才判陈旧：① 只对 `running` 生效（queued 来自持久数据、done 本是终态）；② 后台权威集合已不认这个会话（还在报告的一律不判）；③ 距最后一次 `EXECUTION_STATUS_UPDATE` / 首次观测运行超过 `STALE_MS = 90s`。两个时间戳都为 0（无任何时间基准）时不判 —— 宁可少报不可误报。
- 面板新增 `lastUpdateAt` 记账：`EXECUTION_STATUS_UPDATE` 与后台确认在跑都会刷新，所以真在跑的会话永不误伤。
- 视觉与交互：转灰 + 虚线描边 + `animation: none` + `::after { display: none }`（还在动就等于在说谎），tooltip 改「状态可能已失效 · 未在限定时间内收到执行更新」（据此判断要不要继续等，说谎比不显示更糟），`×` 露出来并改用「移除失效条目」文案，`×` 结果同样持久化。同组内 stale 排在真实 running 之后。
- 配合修掉上面的 dismiss bug：**只有后台权威 `runningIds` 里的会话才解除 `×` 标记**，本地脏数据不再能翻掉用户的手动移除。
- 明确留在范围外（用户当时未选）：跨会话「停止执行」按钮、`isSessionArchivable` 脏状态解挡。后果如实告知：被判陈旧的会话**仍然归档不了**（`generatingSessionIds` 还脏着），只能 `×` 掉或重开面板。

**验证**
- `test/unit/session-dock.unit.test.js` 20 → **40 例**：`isEntryStale` 阈值边界 / 后台在跑不判 / queued 与 done 不参与 / 无时间基准不判；`buildDockEntries` 降序与 stale 归组期望；+N 折叠（8 个以内不出芯片、第 9 个起 7 条 + 1 芯片共占 8 位）；陈旧降级上 DOM（`data-stale` + `×` + 不再报「正在执行」）；两条隐藏 bug 的源码守卫（只按后台集合解除 dismiss、`×` 只给完成态与陈旧态）。
- 视觉探针扩到 **43 项**（新增陈旧灰态/停动画/`×` 悬停可见/对比度实测、+N 芯片尺寸与中性描边、芯片列不横向溢出、溢出面板宽度/滚动/层级/长标题截断/四态色区分），亮色 / 暗色各 **43/43 全过 / EXT_UI_PASS**，并核对 `dist/` 里新类名与中文文案确实打包进去。
- 回归：`npx vitest run` **214 文件 / 3242 例**全过、`npx eslint src/ agent/` 无输出、`npm run build` 成功。

### 停靠条悬停提示：主行改为用户的问题，会话标题降为次要小字
> 来源：用户提出「执行中任务那个旋转的小图标，移上去显示的是会话标题。是不是显示用户对那个任务的问题更合适？一眼就能看出这是哪一个用户问题——看会话名称有可能对不上是哪个任务」。

**先纠正两个我自己读错的事实**（设计前查证代码，不是猜的）：
- 会话记录里的消息字段是 **`messageHistory`**，不是 `messages`；按 `session.messages` 设计会直接取到 `undefined`。
- **不能只读内存 `state.sessions`**：它是上一次 `loadSessions` 的快照，而 `chat-manager` 的跨会话派发明确「非激活会话的会话态只从调用方给的快照读，绝不回写 state」。内存里那份 `messageHistory` 可能停在上一轮 —— 恰好会复现用户抱怨的「对不上是哪个任务」。所以**真值以 IndexedDB 为准**（`getSession`），内存快照只当首帧占位，避免每帧读库。
- `EXECUTION_STATUS_UPDATE` 载荷里只有 `nodeName` / `status` / `executionLog` / `sessionId` / `callId`，**根本没有问题原文**，指望事件带文本这条路不通。

**改法**
- 新增导出纯函数 `normalizeLabel` / `isSameLabel` / `pickEntryLabel`，主行优先级：`queued` 取排队原文（`queueStore.peekNext(sid).text`）→ 否则取会话里**最后一条用户消息** → 都没有才回落到会话标题。有独立原文可展示时就不再重复标题；`normalizeLabel` 折叠空白并截断到 `MAX_LABEL_CHARS = 160`。
- 副行只在「标题与问题不是同一件事」时出现（`isSameLabel` 比对前**丢掉全部空白**：标题是首条问题前 50 字符且换行被换成空格，只折叠空白会漏判，结果副行把同一句话重播一遍）。三行结构 = 加粗问题（最多两行）+ 灰色会话标题 + 状态行。
- 采集侧 `hydrateMissingTitles` → `hydrateSessionLabels`：**一次 `getSession` 同时补标题与问题**，缓存按 `stamp = startedAt || doneAt` 键控，只有轮次变了才重查库；`titlePending` 换成 `questionCache` + `labelPending`，`clearEntry` / `reset` 同步清理。
- 多模态带图提问的 `content` 是 parts 数组，**必须走既有的 `extractTextFromContent`**（`src/shared/token-counter.js`），直接 `String(content)` 会把 base64 data URL 塞进 tooltip。该模块只依赖 logger + i18n 且侧边栏已有 4 处在用，不增加打包体积。
- 芯片首字符按用户选择**保持取会话标题**（26px 里放问题首字反而更易误认），但 `aria-label` 改用主行文本，读屏拿到的是问题。
- 样式：`.session-dock-tip-title` 从单行 `nowrap` 省略改 `-webkit-box` + `line-clamp: 2` + `word-break: break-word`（一行 nowrap 会把长问题切得看不出是哪个任务，反而失去这次改动的意义）；新增 `.session-dock-tip-sub`（11px / `--text-secondary` / 单行省略，小字要过 4.5:1 只能用 `-secondary` 档）。

**验证**
- `test/unit/session-dock.unit.test.js` 40 → **56 例**：主行优先级与回落链、160 字符截断、空白差异判重、排队条目用原文、5 个 DOM 用例（主行是问题、副行是标题、标题与问题相同时不出副行）；两条专门守卫 —— 取文本必须走 `extractTextFromContent`（断言源码里不许出现 `String(msg.content)`）、问题真值以库为准（`questionCache.set(sid, { text, stamp })` 且只有一处 `getSession(`）。
- 视觉探针 43 → **50 项**：长问题两行截断、副行存在与内容、状态行未被改样式弄丢；亮色 / 暗色各 **50/50 全过 / EXT_UI_PASS**，副行对比度实测 **亮 5.74 / 暗 7.70**。
- 回归：`npx eslint src/ agent/` 无输出、`npx vitest run` **214 文件 / 3258 例**全过、`npm run build` 成功，并在 `dist/assets/side_panel.{js,css}` 里核验压缩后仍存在 `{primary:...,sub:...,isQuestion:...}` 与 `Array.isArray(e?.messageHistory)` + `role !== 'user'` 的取文本逻辑，及 `session-dock-tip-sub` / `-webkit-line-clamp:2`。

**顺便回答「卡死了图标还删不删得掉」**：真在跑的没有 `×` 是刻意的（给执行态画 `×` 会被读成「取消任务」）；卡死要靠上面那三条同时成立才判陈旧并露出 `×`。**如实说明还剩一个洞**：若后台 Service Worker 自身 hung 住、`activeReactLoops` 里仍留着该会话，则条件②「后台不认」永不成立 → 永不判陈旧 → 停靠条上删不掉，只能点进该会话用停止按钮，或等 SW 被回收重启（届时面板本地脏的 `generating` / `pending` 都不持久化，能自愈）。按用户选择本次不加「立即删除」入口。

### 点停靠条芯片不再只是「打开会话」：额外定位到那一轮用户问题
> 来源：用户追问「点击左侧那个执行状态的圆圈，除了打开会话，有没有定位到会话里对应的那个用户问题？我看好像只是打开了会话，滚动到的是当前正在执行任务的那条问题，而不是芯片对应的那条。」

**先证实观察成立，并说清用户看到的滚动到底是什么**：
- 芯片点击原先只调 `handleSessionSwitch(entry.sessionId)`，**没有任何定位逻辑** —— 用户看到的落点来自另一条路：切换会话后 150ms 会恢复 `chrome.storage.local['scrollPosition_<sid>']`（写入点在滚动监听），而 rebuild 消息走的是 `addMessage(..., scroll=false)`。所以那个位置是「这个会话上次看到哪儿」，**与芯片代表哪条问题无关**，单轮会话下两者恰好重合，才像是定位了。
- 定位选「问题」而不是「回答」：回答在跑的过程中随执行日志与流式输出不断变高，定位过去要么停在半截、要么很快跑出视野；问题是这一轮的起点且尺寸稳定，且芯片主行显示的本来就是这个问题（完成态同样定位到问题）。

**改法**
- `utils.js` 新增导出 `focusMessageInView(messageId)`：遍历容器内 `[data-message-id]` 比 `dataset.messageId` 而**不拼属性选择器**（消息 id 是用户内容，jsdom 也没有 `CSS.escape`，两条路径不一致），命中则 `scrollIntoView({ behavior: 'instant', block: 'start' })` + 复用既有 `bookmark-highlight` 闪烁（新常量 `MESSAGE_HIGHLIGHT_MS = 2000`）；找不到返回 `false`。`instant` 而非 `smooth`：点哪个就该看到哪个，长途平滑滚动会把定位意图盖掉。
- `handleSessionSwitch(sessionId, { focusMessageId = null })`：只在传了锚点时给 `session-switched` 事件加 `skipScrollRestore: true`（收藏 / 搜索 / 定时任务跳转用的是同一套契约），否则 500ms 后会被内建的恢复位置拽回来；渲染稳定后（`FOCUS_SETTLE_MS = 500`）再定位，且先查 `state.activeSessionId !== sessionId`（用户已切走就别抢视野）；**定位失败回落 `restoreSessionScroll`**，不强行停在顶部。新参默认不传 → 所有既有调用点行为零变化。
- 采集侧 `lastUserMessageFrom` 连带返回 `messageId`；`readQuestions()` 返回 `{ questions, anchors }`；`questionCache` 改存 `{ text, messageId, stamp }`；`buildDockEntries` 新增 `anchors` 入参并落 `entry.anchorMessageId`；`pickEntryLabel` 新增 `from` 字段（`queued` / `question` / `title` / `''`）——**只有 `from === 'question'` 才给锚点**：排队原文根本还没入库、标题回落没有对应消息节点，拿上一轮的 id 去定位只能算骗人。（该字段叫 `from` 而不叫 `source`：`entry.source` 已被「定时任务 / 普通聊天」占用，同名不义。）
- 两处点击（芯片、溢出面板行）统一走新增的 `openDockEntry(entry)`，`session-dock.js` 里 `handleSessionSwitch(` 只允许出现 1 处（有源码守卫）。
- `styles.css` 补一处降级：`prefers-reduced-motion: reduce` 下原本的 `animation: none` 会把 `.bookmark-highlight::before` 的描边退回 `transparent` —— 定位反馈等于被关掉。现改为 reduce 下保留 2s **静态** `--warning-strong` 描边（不闪但仍看得见）。

**验证**
- `test/unit/session-dock.unit.test.js` 56 → **67 例**：锚点采集（`messageHistory` 倒序取第一条有文本的 user 消息）、排队条目不许拿上一轮 id 冒充定位、标题回落不出锚点、`from` 四值、DOM 上点击芯片传 `{ focusMessageId: 'msg_other_q2' }` / 只有标题时传 `null` / 溢出行同样传锚点，以及两条源码守卫（缓存必须存 `messageId`、切换调用口只留一处）。
- 新建 `test/unit/message-focus-anchor.unit.test.js`（**7 例**）：`instant` + `block:'start'` 参数、fake timers 在 1999/2000ms 验证高亮按时撤除、找不到返回 `false` 且不碰任何节点、`msg_1` 不误中 `msg_12`、空 id 与容器缺失、特殊字符 id（`a"b'c\d`）走 dataset 仍安全、CSS 里没新造第三种闪烁类。
- 视觉探针 50 → **61 项**，亮 / 暗各 **61/61 全过 / EXT_UI_PASS**：真实滚动后目标顶边与容器 padding box 顶 `offset=1px`、`scrollTop=374/523`（确实滚了且没退到底）、脉冲动画名、峰值帧确有 inset 晕光（否则下面那条是空跑）、晕光相对降幅 **亮 8.3% / 暗 7.3%**（门槛 ≤10%）、高亮不改布局、撤高亮后无残余动画、reduce 下不闪但描边仍在。探针自身两个坑一并记录：`.chat-container` 是 `flex: 1`，只写 inline `height` 会被 flex 撑满、滚动条根本不出现（需 `max-height`）；`scrollIntoView` 对齐的是**padding box** 而非 border box，拿 `getBoundingClientRect().top` 直接比会把 11px 上内边距算成偏差。
- 回归：`npx eslint src/ agent/` 无输出、`npx vitest run` **215 文件 / 3276 例**全过、`npm run build` 成功；`dist/assets/side_panel.js` 里核验压缩后仍有 `function As(e,{focusMessageId:t=null}={})`、`...t?{skipScrollRestore:!0}:{}`、`scrollIntoView({behavior:\`instant\`,block:\`start\`})` 只多这一处、`XT(e){As(e.sessionId,{focusMessageId:e.anchorMessageId||null})}` 且芯片与溢出行**两个调用点**都在；`dist/assets/side_panel.css` 里 reduce 静态描边规则确实打包进去。

**如实报告两条既有 / 遗留问题（本次没动）**：
- 用户气泡正文对比度实测 **亮 3.66 / 暗 2.45**（`--text-on-brand` on `--brand-500`），均低于 4.5:1，暗色明显更糟 —— 这是既有配色，与本次定位无关，所以探针只卡「晕光相对基线降幅」而不拿它当本次的门，数值以 INFO 行报出。是否单开一项修由用户定。
- 排队中的那条原文还没进消息库，点它的芯片仍然只能打开会话、**不做假定位**（只走原有的恢复滚动）。

### 切换工作目录：会话级切换不再弹「不在允许路径之内」，勾选「设为默认目录」对列表项生效
> 来源：用户反馈两点——①「在会话里切换工作目录会弹窗说当前目录不在允许的路径之内，但会话绑定的工作目录本来就不需要加进允许路径吧，这个提示有问题」；②「设默认目录必须在输入框里填 + 勾选才行，如果我是从上面的目录列表里选一项，要怎么把它设为默认？勾一下再点列表项行不行，现在实现了吗」。

- **①的根因（提示内容与真实后果不符）**：确认框那句「切换后将自动创建目录并加入允许列表」只对**全局切换**成立。代理端 `scope=session` 分支只 `bindSessionWorkdir()` 写 `session-workdirs.json`，**既不写 `allowedPaths` 也不 `saveConfig`**；而会话目录在 `checkPath` 的 0.6 分支无条件放行、根本不查白名单。所以「不在允许列表」对一次会话级切换既不是风险也不会发生，拿它劝阻用户纯属误导。修法：把确认门控从 `!isAllowed` 收紧为 `!isAllowed && willChangeGlobalDefault`（`willChangeGlobalDefault = !effectiveSessionId || setAsDefault`，即只有旧版代理端回落全局、或勾了「同时设为代理默认目录」才弹），文案同时改成讲清真实后果的「本次会把它设为代理默认目录…（影响未绑定的会话）」，标题改「确认切换到新默认目录」。
- **②的核查结论（功能本来就在，缺的是可达性与反馈）**：列表项点击与「切换」按钮都走同一个 `doSwitch`，而 `doSwitch` 会读 `setDefaultCheckbox.checked`，所以「勾选 + 点列表项」一直是有效的；真正挡住用户的是三处缺口。修法：① 弹窗列表原本只渲染 `allowedPaths`，而会话级切换不写白名单 → 切到一个列表外目录后再打开弹窗，连「当前」那一项都看不见（这正是 ① 那句误导提示的土壤）；现在列表 = `白名单 ∪ 代理默认目录 ∪ 本会话有效目录`（跨平台判重、非 ASCII 安全比较），被合并进来的展示项不给「×」（它没有「附加授权」身份可移除）；② 标「当前」的项此前被 `:not(.current)` 一刀切禁点，于是「先把会话切到 X、再把 X 提为默认」这条最常见的路径点了没反应 → 现在勾选后该项可点且光标跟随变 `pointer`，点击走 `performSetAgentDefault()`（只做全局默认切换、不动会话绑定）；③ 复选框补 `title` 提示（中英各一份）说明「勾选后点列表里的目录或点『切换』都会同时把它设为代理默认目录」，成功 toast 按是否真的改了默认目录分两套（`switchedToAndSetDefault` / `setAsDefaultDone`），否则用户无从判断勾选有没有生效。
- **顺手收口**：`performSwitchWorkdir` 里「代理默认目录变了要同步的三处缓存」抽成 `syncAgentDefaultWorkdirCache()`，与新增的 `performSetAgentDefault()` 共用（会话级切换不得写 `state.agentPlatform.workdir`，这条不变量现在只有一处写入口）；代理端移除接口的路由注释仍写着「不可移除当前工作目录」，与上一轮已删掉的守卫矛盾，一并改正。
- **验证**：真实 MV3 探针 `test-results-probes/_workdir-ext-ui.mjs` 新增 5h 段 23 项（会话级切到列表外目录 → **不出现** `#customConfirmOverlay` 且 `config.json` 的 `workdir`/`allowedPaths` 分毫未动；列表里能看见标「当前」的会话目录且不配「×」；勾选后点「当前」项 → `workdir` 落库且会话绑定不变；勾选后点列表非当前项 → 绑定 + 默认同时生效；不勾选切列表外目录不弹、勾选后切列表外目录**仍要弹**且文案含「设为代理默认目录」；确认后 `allowedPaths` 才真的追加）→ **89 项全过 / EXT_UI_PASS**。新增 `test/unit/workdir-switch-confirm.unit.test.js`（14 例：代理端会话分支无 `allowedPaths`/`saveConfig` 而全局分支有、`willChangeGlobalDefault` 门控、旧 `confirmSwitchToNew` 文案已删且新 key 唯一调用点、列表点击与按钮共用 `doSwitch`、`computeDisplayPaths` 三源合并与跨平台判重、× 仅给白名单项、光标跟随、`defaultApplied` 两套 toast、`state.defaultWorkdir` 只有一处写入口、tooltip 中英齐备）；`workdir-allowed-list-remove.unit.test.js` 的 3 处锚点与断言随列表渲染改造更新。回归 `npx vitest run` **212 文件 / 3182 例**、`node --test agent/test/unit/*.test.js` **825 例**、`npx eslint src/ agent/` 无输出、`npm run build:silent` → BUILD_SUCCESS。代理进程需重启、扩展需重新加载后生效。


### 流式输出：切换会话后命令执行结果掉出工具折叠区

> 来源：用户反馈「正在跑命令的会话切到别的会话，等它输出完再切回来，命令执行结果不在工具执行的折叠里，单独显示成一块」。

- **根因**：`AGENT_STREAM` 首次创建输出块时，用 `if (!outputDiv.isConnected)` 判断「是否已成功放进工具卡片」，失败才退回 `.stream-content`。但切换会话时 `chatContainer` 会被重建，流式消息元素只由 `_streamingElements` 保活、**整体脱离文档** —— 此时它的整棵子树 `isConnected` 恒为 `false`，哪怕已经 `appendChild` 进 `.tool-call-body` 也会被再 `appendChild` 搬到 `.stream-content`，于是切回会话后结果落在折叠区外。
- **修法**：`chat-streaming.js` 新增 `createAgentStreamOutput(card, streamContent)`，挂载位置**只由卡片查找结果决定**（卡片在 → 进 `.tool-call-body`；卡片缺失才退回 `.stream-content`），彻底不再用 `isConnected` 判定；`chat-manager` 的 `AGENT_STREAM` 分支改为调用它。
- **验证**：新增 `test/unit/agent-stream-output-placement.unit.test.js`（6 例：脱离文档态输出仍落在 tool-call-body、文档内行为不变、卡片缺失才回落 stream-content、缺 `.tool-call-body` 时退化挂卡片、源码守卫禁止 `!outputDiv.isConnected` 回归）；回归 `npx vitest run` **212 文件 / 3182 例**、`npx eslint` 无输出、`npm run build:silent` → BUILD_SUCCESS。**需重新加载扩展**。

### 侧边栏浮层：工作目录 / 收藏 / 消息目录 / 检索 / 定时任务补可见边框

> 来源：用户反馈「右侧那些图标点开的弹框没有边框色，白色主题下跟背景糊在一起，分不清弹框边界；暗色主题也要照顾到」。

- **根因**：5 个浮层的边框都写死成 `1px solid rgba(255,255,255,0.3)` 外加 `inset 0 1px 0 rgba(255,255,255,0.5)` 白色内高光，投影走 `--shadow-sm`。亮色下白框叠白底等于没有；暗色下白框刺眼且与主题无关。
- **修法**：统一改用主题 token —— `border: 1px solid var(--border-strong)`（亮 `#ccc` / 暗 `#4a5160`）+ `box-shadow: 0 8px 32px rgba(var(--overlay-rgb), 0.18)`（暗色下自动翻成微光晕）。涉及 `styles.css` 的 `.workspace-panel` / `.bookmark-panel` / `.message-toc-panel` / `.search-panel` 与 `schedule-panel.js` 的内联样式；嵌入模式下工作目录面板的左右分栏边框不受影响。
- **验证**：新增真实 MV3 探针 `test-results-probes/_side-rail-popup-border.mjs`（dist 包 + light/dark 双主题，逐面板断言 1px 描边存在、描边色与页面底色可区分、描边色等于 `--border-strong` 计算值）**31 项全过**，截图留档 `_side-rail-border-{theme}-*.png`；新增 `test/unit/side-rail-popup-border-theme.unit.test.js`（14 例源码守卫）；`npm run theme:check` 无违规。

### 切换工作目录：允许移除列表里的「默认目录」（此前被误判成「当前工作目录」）
> 来源：用户反馈「删除列表项时提示『不能移除当前工作目录』，但我当前会话已经切到其它目录了，删不掉我没绑定的那个目录」。

- **根因（三方对「当前」的定义不一致）**：切换弹窗里的「当前」标记比的是 `/api/status/detail` 的 `workdir`（**本会话有效目录**，用户已切到 `/B`），而代理端移除接口的守卫比的是 `config.workdir`（**全局默认目录**，还是 `/A`）。于是 `/A` 在列表里不被标「当前」、还带着删除按钮，点下去必被 400 拒绝，提示写「不能移除当前工作目录」——用户看到的就是「我明明没在用这个目录」。
- **为什么这条守卫本身就是错的**：`allowedPaths` 的语义是「有效工作目录之外的**附加授权**」，而有效工作目录在 `checkPath` 的 0.6 分支里**无条件放行、从不查白名单**。所以把全局默认目录（或本会话目录）从列表里删掉，删不掉任何可用性；拦下来只会造成「列表里不让删、实际照样能读写」的自相矛盾。
- **修法**：① 代理端删掉 `cannotRemoveWorkdir` 守卫（连同 zh/en 两条误导文案），移除接口对任何路径都只做「从 allowedPaths 里摘掉」；② 扩展端列表给默认目录加「默认」徽标（当前目录保留「当前」徽标），**所有列表项都渲染删除按钮**（此前当前项没有按钮、默认项有按钮却删不掉，两条都是死路）；③ 移除默认/当前目录时换一套确认文案与成功提示（「移出列表后仍照常可用，只是不再作为附加授权显示」），普通附加目录仍保留原来那句「移除后 AI 将无法访问该目录」—— 那句对它才是真的。
- **验证**：新增真实代理探针 `test-results-probes/_allowed-list-remove.mjs`（临时 HOME + 真实 `startServer` + 真实配对）：切全局默认为新目录 → 移除它 → **200 且 allowedPaths 里消失** → `/api/fs/list` 仍 200（0.6 放行）→ `detail.defaultWorkdir` 仍是它；对照组「普通附加目录移出后 `fs/list` 变 403」证明移除不是空操作 → **13 项全过**。反向验证：把旧守卫临时加回去再跑同一探针 → 恰好「移除默认目录」一项 FAIL（`status=400`），与用户遇到的症状一致，去掉后全绿。单测新增 `test/unit/workdir-allowed-list-remove.unit.test.js`（7 例：守卫已删除、i18n 无残留、默认目录取值与徽标、删除按钮对所有项渲染、两类文案分支），`agent/test/integration/api.integration.test.js` 里「移除当前工作目录被拒绝」改为「允许移除且移出后仍可访问」。回归 `npx vitest run` **208 文件 / 3128 例**、`node --test agent/test/unit/*.test.js` **825 例**、真实 MV3 探针 `_workdir-ext-ui.mjs` **66 项**、`npx eslint src/ agent/` 无输出、`npm run build:silent` → BUILD_SUCCESS。代理进程需重启后生效。

### 切换工作目录：Windows「浏览…」选完目录不回显（窗口标记吃掉了路径解码）
> 来源：用户反馈「在公司 Windows 电脑上切换工作目录，通过浏览选择目录，弹窗弹出来了，但选完目录后没有回显到输入框里」（macOS 上正常）。

- **根因**：Windows 后端为了让「窗口到底有没有弹出来」可判定，脚本会在 `ShowDialog` 之前先向 stdout 写一个窗口标记 `@@AI_HELPER_PICK_SHOWN@@`，再用 `[Console]::Out.Write` 写选中路径的 UTF-8 base64。两次 `Write` 之间没有换行，stdout 实际是 `标记+base64` **拼在同一行**；而解码侧 `decodePowerShellOutput` 的校验是「整行必须匹配 base64 字符集」（`@` `_` 都不是），于是必然失配 → 解出空路径 → 退出码 0 被 `classifyPickResult` 归为「对话框正常关闭但没选」→ **静默当作用户取消**，输入框不回显、也没有任何提示。macOS 走 `osascript`（路径直接在 stdout 的文本行里），不经这段，所以只有 Windows 复现。
- **为什么之前没被测出来**：单测里「Windows 选中」用例的 fake stdout 只喂了 base64（没有标记），真实线上永远带标记 —— 测试与实现各说各话。
- **修法**：① 脚本改用 `[Console]::Out.WriteLine('标记')`，标记独占一行（`Console.Out` 自动 flush，`shownTimeout` 的快速探测不受影响）；② `decodePowerShellOutput` 先按标记切行再逐行找 base64，兼容旧脚本/被污染的 stdout；③ `classifyPickResult` 在 `exit 0/2` 且去掉标记后仍有输出却解不出路径时返回 `decode-failed: <片段>`（不再谎报取消），扩展端会走既有的「浏览失败：<原因>」toast，下次出问题能直接看到原因而不是「点了没反应」。
- **验证**：把 HEAD 版本与修复后版本对同一份真实 stdout（`标记+base64` 同行）做对比 → 修复前 `""`、修复后 `C:\Users\me\ws`；`agent/test/unit/directory-picker.unit.test.js` 37 例全过，新增 5 例（真实形态同行解码、标记换行解码、无标记纯 base64 兼容、脚本标记必须 `WriteLine`、`exit 0` 但解不出 → `decode-failed`）。回归 `node --test agent/test/unit/*.test.js` **825 例**、`npx eslint src/ agent/` 无输出、`npm run build:silent` → BUILD_SUCCESS。代理进程需重启后生效。

### 语音输入：输入设备一直显示「正在读取设备列表」（Windows 上枚举不返回）

> 来源：用户反馈「在公司的 Windows 电脑上看语音输入配置，输入设备那里一直显示『读取设备列表』，但列表里只有一个默认值，其他值也看不到」。

- **根因**：`refreshDeviceList()` 里第一个语句就是 `await listAudioInputDevices()`，而它直接 `await navigator.mediaDevices.enumerateDevices()` **没有任何超时**。Windows 上这个调用并不保证会返回（麦克风已授权但系统音频服务刚启动 / 隐私设置半开 / 驱动半挂，远程桌面与公司域机器上尤其常见）—— Promise 永不 settle，函数就永远卡在第一行 await 上：后面的 `menu.innerHTML = …`、`input.value = …`、状态文案赋值**全都没机会执行**。于是两个现象是同一个原因：下拉里只剩 `options.html` 写死的那一项「跟随系统默认」（看起来就是“只有一个默认值”），状态行一直停在初始文案「正在读取设备列表…」。macOS 上枚举总是立即返回，所以只有 Windows 复现。
- **三个会把它“拖更久”的隐藏诱因**：① 状态行挂了 `data-i18n="toolbox.asrDeviceNoteLoading"`，任何一次 `applyI18n()` 都会把已经刷好的状态文案冲回「正在读取」（外观上就是卡死）；② `devicechange` 在 Windows 音频服务抖动时会连发，每次都重新走一遍枚举，旧结果被并发丢弃、状态行反复被冲回 loading；③ 授权入口只存在于「麦克风权限」小节，而那节跟着语音总开关收起，关着时用户在设备块里根本找不到自救入口。
- **修法**：① 新增 `probeAudioInputDevices()`，用 `Promise.race` 给枚举加 2.5s 超时兑底，并区分 `timedOut` / `unsupported` / 空列表三种「列不出来」的原因（只回一个空数组，页面就分不清该提示“没插麦克风”还是“枚举卡死”）；② 新增 `warmupAudioInputDevices()`：超时且**已授权**时先用 `getUserMedia` 开一次流（拿完立即 `stop`，超时后迟到的流也自己收掉，不占着麦克风）把音频子系统唤醒，再枚举一次 —— 这是真正把设备列回来的那一步，不只是把卡死换成报错；③ `refreshDeviceList()` 整体 `try/catch`，**任何**异常都必须落成一个可读文案，不再允许停在 loading；④ 状态行去掉 `data-i18n`（改由 JS 管），并只在「尚未拿到过确定结果」时显示 loading，后台刷新不再闪回；⑤ `devicechange` 防抖 400ms；⑥ 设备块内就地补「授权麦克风」按钮（超时 / 读失败 / 未授权时露出，已拒绝则不弹），不再依赖收起的那一节；⑦ 文案补 `asrDeviceTimeout` / `asrDeviceUnsupported` / `asrDeviceReadFailed` / `asrDeviceDenied` 四条（中英文各一份）。
- **验证**：新增真机探针 `test-results-probes/_voice-device-stall.mjs`（真实 Chromium + dist 包，用 `addInitScript` 在页面脚本前把 `enumerateDevices` 打成永不返回）——**11 项全过**：状态行不再停在「正在读取」、落到确定超时文案、下拉仍渲染出「跟随系统默认」、连点两次刷新后依旧回到确定文案、`devicechange` 连发 6 次后状态行不变回 loading；第二个场景把枚举打成「第一次挂住、之后正常」，验证预热兜底确实把 2 个真实设备列了回来（`enumCalls=3`）。新增 `test/unit/asr-device-loading-guard.unit.test.js`（12 例）把上面的契约钉住：超时常量必须有限、页面不得再裸 `await enumerateDevices`、必须有 catch 兜底、五种失败文案必须中英各一份、状态行不得挂 `data-i18n`、`devicechange` 必须防抖、预热不得占着麦克风；并做了变异验证——把三处契约改回旧写法，对应 4 条守卫如预期失败（确认不是恒真断言）。`audio-input-device.unit.test.js` 补 9 例（超时兑底 / 抛错不误报超时 / `unsupported` 区分 / 默认超时必须是有限值 / 预热成功就停轨 / 预热被拒不抛 / 预热超时时迟到的流也要 `stop`）。既有探针 `_voice-device-select.mjs` **16 项无回退**。回归 `npx vitest run` **212 文件 / 3182 例**全绿、`npx eslint` 无输出、`npm run build:silent` → BUILD_SUCCESS。**需重新加载扩展**（纯扩展侧代码，不涉及代理进程）。

### 语音输入：可自选输入设备（麦克风）

> 来源：用户反馈「语音输入到底用哪个麦克风？我没地方选。别的语音输入都会列一个设备列表，或者自动选」。

- **原来写死系统默认**：采集侧 `getUserMedia({ audio: { channelCount: 1, echoCancellation, noiseSuppression, autoGainControl } })` 不带 `deviceId`，永远走系统默认录音设备，插了 USB / 蓝牙麦克风也没法指定。
- **新增 `src/shared/audio-input-device.js`**：设备列表（只留 `audioinput`，滤掉 Chrome 的 `default` / `communications` 伪设备与重复项，`label` 为空时回落占位名）；选择读写落 `chrome.storage.local[voiceInputDevice]`（空串 = 跟随系统默认，不删键，语义更明确）；`watchAudioInputDevices()` 监听 `devicechange`；`acquireAudioStream()` 选了就 `deviceId: { exact }`，仅 `OverconstrainedError` / `NotFoundError` / `NotReadableError` 回退默认并返回 `fellBack: true`，`NotAllowedError` 不吞（仍走「去授权」）。
- **选项页新增「输入设备」块**：在语音 Tab 里但位于 `#asrSection` 之外（纯扩展侧偏好，代理离线也能先配好），下拉 + 「刷新列表」+ 一行状态说明（未授权提示去授权、设备已拔出标黄）；设备拔掉时下拉回落显示「跟随系统默认」，但**不清存储**——蓝牙断连后 `deviceId` 会回来，抹掉等于逼用户重选。
- **不静默换设备**：录音开始后若真的发生了回退，录音条显示「原麦克风不可用，已改用系统默认」4 秒再恢复「正在听…」。
- **下拉与「识别语言」统一**：第一版用的是原生 `<select>`，和旁边的识别语言（`.model-selector` + 只读 input）并排时圆角 / 箭头 / 高度 / focus ring 全不一样。改成完全复用同一套组件 + 同一个 `.asr-lang-field` 宽度规则，「刷新列表」从整行虚线按钮降为下方的 12px 文字动作；交互也抽成 `bindDropdownSelect()` 两颗共用（点触发器展开、点选项落盘、点外面或 `Esc` 收起 —— 原生 select 有这个行为，自定义下拉不能丢）。
- **验证**：新增 `test/unit/audio-input-device.unit.test.js`（20 例）、`test/unit/voice-input-device.unit.test.js`（4 例），`voice-tab-structure` 补 1 例（设备块不得被包回 `#asrSection`），`asr-lang-dropdown-style` 补 4 例（与识别语言同构：基类 / 浮层 / 共用绑定 / 无残留 `.asr-device-row`）；真实 MV3 探针 `test-results-probes/_voice-device-select.mjs`（`--use-fake-device-for-media-stream`）**16 项全过**，包含只有浏览器能回答的几件事——`exact` 取到的确实是选中的设备、不存在的 `deviceId` 报 `OverconstrainedError`（回退分支的前提）、自定义浮层展开后 3 项全部可见可点且点外面能收起。回归 `npx vitest run` **207 文件 / 3121 例**、`npx eslint` 无输出、`npm run build:silent` → BUILD_SUCCESS。

### 会话级工作目录：二轮代码评审修复（请求头编码 / 请求超时 / 自愈重试 / chip 显隐）
> 来源：应要求对「会话级工作目录」整块变更（`ae0888b5..HEAD` 的 20 个相关文件）做二轮代码评审，逐条复核后确认 6 个真问题并修掉。

- **P0 非 ASCII 目录会打挂整条 agent 链路**：`agentRequest` 把有效目录**原样**塞进 `X-AIH-Workdir`，而代理端按 `decodeURIComponent` 解析——HTTP 头只能承载 ByteString，含中文/emoji 的路径在 `Headers.set` 阶段抛 `TypeError`，被外层 `catch` 吞成 `{ success: false }`，于是该会话的读写/执行/搜索**全部失败**（未绑定会话也会中，因为默认目录同样走这个头）；含 `%` 的目录则让代理端 `decode` 抛 `URIError` 并静默忽略冻结声明。修法：新增纯函数 `encodeWorkdirHeaderValue()`（用 `encodeURI`，不把 `/` 编成 `%2F`，排障时仍能读路径），发送端统一编码，与既有 `decodeURIComponent` 成对。扩展 SW 内实测确认：`new Headers({ 'X-AIH-Workdir': '/…/项目' })` 与 `fetch(..., { headers })` 均抛 `TypeError: String contains non ISO-8859-1`（Node/undici 同样严格），所以原实现会让中文目录会话的工具调用整条失效。
- **新链路 3 处 `fetch` 没有超时**：`getAgentDefaultWorkdir`（工具调用热路径）、`agentApiFetch`（绑定/解绑/恢复默认）、`reconcileSessionWorkdir` 的 detail 探测。代理进程「半挂」时 promise 永不 settle —— `inFlight` 不释放导致该会话此后不再自愈、`await unbind` 让「恢复默认」永久无响应、默认目录探测把 ReAct 迭代一起拖住。修法：`workdir-scope` 新增 `fetchWithTimeout()`（默认 8s，AbortError 交给各自降级分支），三处统一走它。
- **自愈动作失败会变成永久放弃**：`reconcileSessionWorkdir` 在 `setSessionWorkdirBinding` / `unbindSessionWorkdirRemote` **之前**就 `attempted.add(base)`，一次瞬时失败（IDB 写失败、代理 500）后该会话在整个面板生命周期内不再修复；反向问题是无漂移的早退分支不记账，chip 每次刷新（切会话/切模型/水合）都重打一次 `/api/status/detail`。修法：记账移到**成功之后**，动作失败保留重试；无漂移/探测失败按 30s TTL 缓存结论（`resetWorkdirReconcileState()` 一并清空）；解绑返回 `null` 时不再谎报 `cleaned`。
- **chip 显隐不跟工具勾选**：显隐条件是「代理已连接 + 已启用 `agent_exec`」，但工具弹窗保存只改 `state.enabledTools`，没有任何事件 —— 勾选/取消 `agent_exec` 后 chip 要等切会话或切模型才变。修法：保存时派发 `agent-tools-changed`，`initWorkdirTag()` 监听并刷新（不在工具弹窗里耦合 chip 逻辑）。
- **绑定可能记到已失效的代理 id**：`performSwitchWorkdir` 记录的是 `chrome.storage.local.activeAgentId`，而请求侧 `getAgentConfig()` 在 `activeAgentId` 失配时会回落 `agents[0]` —— 代理被删/改名后，绑定会带着一个永远不匹配的 id 落库，`usable` 恒为 false（静默回落到默认目录）。修法：记录**本次请求实际使用**的代理 id。
- **硬阻止清单只认符号链接形态**：`HARD_BLOCKED_PATHS` 用未 `realpath` 的 `~/.ai-helper-agent` 拼路径，而 `checkPath` 的 0.6 分支用 `realpath` 后的路径比对 —— 若用户把代理数据目录做成符号链接（挪到别的盘），真实路径下的 `config.json` / `session-workdirs.json` 就**不在**硬阻止名单内，绑定到该目标即可写注册表（自我扩权）。修法：启动时把 `realpathSync(AGENT_DIR)` 的真实路径形态一并补进清单。
- **验证**：新增 `test/unit/workdir-reconcile.unit.test.js`（6 例行为级：写库失败可重试、成功才记账、解绑失败不谎报、结论缓存、无绑定不解析、reset 后可重探）；`workdir-scope` 补 5 例（中文目录编码后 `decodeURIComponent` 原样还原且 ByteString 安全、含 `%` 目录编码、ASCII 路径不变、空值返回 null、`fetchWithTimeout` 超时抛 AbortError）；`workdir-execution-isolation` 补 1 例真实请求头编码断言；把 `session-workdir-hydration` 里两处写死格式的字符串断言改成语义正则（评审 P2-4 的同款问题）。真实 MV3 探针新增 5g 段（取消勾选 `agent_exec` → chip 立即隐藏；重新勾选 → 立即可见且仍是本会话目录），并用**中文目录**把整套探针跑一遍 → **66 项全过 / EXT_UI_PASS**。反向验证时发现：把构建产物里的编码改回「原样发送」，探针依旧全绿 —— 查明面板走的是 `workspace-manager` 自己的头（只带 `X-AIH-Session-Id`），覆盖不到 `X-AIH-Workdir`，所以该链路改用「扩展 SW 内直接构头 + fetch」取证（raw 抛 TypeError、编码后正常），并由单测在捕获到的请求头上断言编码值。回归 `node --test agent/test/unit/*.test.js` **820 例**、`npx vitest run` **207 文件 / 3117 例**、`npx playwright test` **67 例**、`node agent/test/smoke/session-workdir.smoke.mjs` **44 项**、`npx eslint src/ agent/` 无输出、`npm run build:silent` → BUILD_SUCCESS。

## 2026-10-28

### 会话级工作目录：刷新后文件面板不再停在全局默认目录（启动竞态补对齐）
> 来源：用户反馈「刷新插件后自动恢复上次会话，输入框下方的目录是对的，但侧边栏文件面板显示的是全局默认目录；关掉再展开也没用，只有切走再切回来才正常」。

- **根因（启动时序竞态 + 浏览位置一锤定音）**：侧边栏各模块在 `DOMContentLoaded` 各自并行初始化。文件面板的嵌入模式恢复会**立即** `openPanel()` → `navigateToRoot()` → `getWorkspaceRoot()`，而此刻会话层的 `loadChatHistory()` 还没跑到 `state.activeSessionId = ...`（它前面有一长串 `await`）。`getWorkspaceRoot()` 拿 `currentSessionId()` 得到 `null`，请求就不带 `X-AIH-Session-Id`，代理端按**全局默认目录**回包。更糟的是 `currentPath` / `workspaceRoot` 是模块级单例、一旦落定就只会走 `openPanel()` 的 `if (!currentPath)` 分支短路，所以**收起再展开也不会重新解析**；只有 `session-switched` / `session-workdir-changed` 才会触发 `syncWorkspaceToSession()` 复位重解析 —— 这就是「切走再切回来才好」。chip 之所以是对的，是因为它在 `_loadChatHistoryImpl` 里被 `agent-model-changed` 顺带刷新了一次，而面板没有这个后置触发点。
- **修法（谁掌握「会话就绪」谁发信号）**：`chat-manager` 新增 `notifySessionHydrated()`，在两条激活路径的 `hydrateSessionWorkdir()` 之后**紧邻**广播 `session-hydrated`（带 `sessionId` + `workdir`，`activeSessionId` 为空时不广播）。`workspace-panel` 监听该事件并复用既有的 `syncWorkspaceToSession()` 单一入口 —— 目录由「默认」变成「本会话」时会复位并重导航，收起态只清缓存、下次打开自动解析。特意**不复用** `session-switched`：那条会重建聊天区，启动阶段代价高且易打架。
- **顺带补一处同类缺口**：`updateWorkspacePanelVisibility(true)`（重连）原本只在「嵌入模式且未展开」时 `openPanel()`；若面板已展开但 `currentPath` 已被复位（水合/断线时清过），重连后会停在空白。现在补一条 `else if (expanded && !currentPath) navigateToRoot()`。
- **验证（先复现、再修、并证明守护测试能抓住它）**：真实 MV3 探针新增 5f 段 —— 存好嵌入模式与宽度（真实用户态，面板会立即恢复展开）→ 重载 → 断言「启动竞态确实发生（面板抢跑时列过全局默认目录）」+「水合后自动纠正到会话绑定目录（不需要切会话）」+「收起再展开仍正确」→ 探针扩到 **62 项全过**。为证明这条守护能抓到 bug，**只**把构建产物里监听端的 `session-hydrated` 改名（派发端不动）再跑：恰好这两项 FAIL、面板停在全局默认目录，与用户描述的症状完全一致；恢复后全绿。单测新增 5 例（信号函数定义与字段、未就绪不广播、两条路径紧邻广播、不得复用 `session-switched`、面板监听必须走 `syncWorkspaceToSession`）。回归 `npx vitest run` **204 文件 / 3080 例**、`npx playwright test` **67 例**、`node agent/test/smoke/session-workdir.smoke.mjs` **44 项**、`npx eslint src/ agent/` 无输出、`npm run build:silent` → BUILD_SUCCESS。

### 会话级工作目录：修掉「重载后绑定被保存链路抹掉」导致 chip 误报目录不可用
> 来源：用户反馈「鼠标移上去，工作目录上显示『…/workspace（默认）目录不存在或不可访问，请重新选择』」。

- **真实故障（不是文案问题）**：侧边栏启动走的是 `_loadChatHistoryImpl()`，它恢复了 `messageHistory / model / useTools / agentId / contextCompaction`，**唯独没恢复 `state.sessionWorkdir`**；而 `saveCurrentSession()` 是整段覆盖（`currentSession.workdir = state.sessionWorkdir || null`），于是重载后面板里的第一次保存（新建会话、切助手、上下文压缩、可见性变化…十几处都会调）就把库里的真实绑定写成 `null`。结果扩展端按默认目录解析、代理端 `session-workdirs.json` 还留着旧绑定，`updateWorkdirTag()` 的「与代理端权威值比对」判定不一致，把这种**记录漂移**翻译成了「目录不存在或不可访问」。`reloadAfterDelete()` 同样漏了水合；`newSession()` 反过来会把上一个会话的绑定带进新会话。
- **统一水合入口**：新增 `session-store.hydrateSessionWorkdir(session)`（一次写 `sessionWorkdir / workdirAgentId / sessionWorkdirOwner`），`switchToSession` 改走它；启动加载、首次自动建会话、新建会话、删除后重载全部调用，杜绝「只恢复一半」。
- **保存闸门**：`state` 新增 `sessionWorkdirOwner`（目录状态属于哪个会话），`saveCurrentSession()` 只在 `owner === activeSessionId` 时才回写 workdir 字段，其余情况保留库里原值 —— 将来再冒出部分水合的路径也不会再抹数据。
- **提示说实话**：`updateWorkdirTag()` 区分两种不一致 —— `scope === 'session'` 且与代理端不符才是真「目录不可用」（保留异常标记）；`scope === 'default'` 但代理端仍有本会话绑定属于**两侧记录漂移**，不再标红。
- **历史数据自愈**：新增 `src/side_panel/workdir-reconcile.js`（幂等，每会话只试一次）——扩展端没绑定而代理端还留着 → 以代理端为准**恢复绑定**（代理端能返回该目录即证明目录在这台机器上存在，且正是用户当初选的）；扩展端有绑定但属于别的代理（换代理回落）→ **清掉代理端残留**，避免命令跑在旧目录。修好后 chip 随事件自动刷新回「（本会话）」。
- **验证**：新增 `test/unit/session-workdir-hydration.unit.test.js`（17 例源码守卫：水合入口、保存闸门位置、四条激活路径、自愈分支与幂等、chip 两种不一致的处理）；真实 MV3 探针 `test-results-probes/_workdir-ext-ui.mjs` 补 5d 段（**重载面板** → chip 仍是本会话且无「目录不存在」→ 新建会话回到默认且不继承 → 切回绑定会话绑定仍在 → 代理注册表仍在）→ 扩到 **58 项全过**（再加 5e 段：直接改 IDB 抹掉绑定模拟历史漂移 → 重载后 chip 自动恢复「（本会话）」且写回库），这正是此前漏掉的关键场景（旧探针全程不重载，所以一直绿）；回归 `npx vitest run` **204 文件 / 3075 例**、`npx playwright test` **67 例**、`node agent/test/smoke/session-workdir.smoke.mjs` **44 项**、`npx eslint src/ agent/` 无输出、`npm run build:silent` → BUILD_SUCCESS。

### 会话级工作目录：目录 chip 补齐「新建会话」这条切换路径
> 来源：用户反馈「面板现在是联动了，但输入框下方的目录 chip 又不动了」。

- **根因（事件契约不对称）**：chip 只监听 `session-workdir-changed`（`switchToSession` 派发），而 `newSession()`（点 + 新建）、`reloadAfterDelete()`（删完自动补一个空会话）、首次打开的自动建会话都只派发 `session-switched`。上一版让面板也监听 `session-switched` 之后，面板跟上了、chip 掉队，差异才暴露出来；点 tab 切会话因为走 `switchToSession` 一直是好的。
- **修法（在 chip 这一侧收口，不新增事件）**：`initWorkdirTag()` 增加 `session-switched` 监听，与既有的 `session-workdir-changed` / `agent-model-changed` 一起都只调 `updateWorkdirTag()`。这样任何「活跃会话变了」的路径（现有与将来新增的）都能刷新，不需要每个建会话的地方各派一次 workdir 事件。
- **并发刷新取最后一次**：两个事件会连着来，而 `updateWorkdirTag()` 是异步的（`resolveWorkdirForSession` + 与代理权威值比对），先发的旧会话结果可能后落地并覆盖新会话。新增模块级 `workdirTagToken`，每次刷新自增，两处 `await` 之后判一次陈旧即返回；陈旧判定排在写文案/标题之前。
- **验证**：新增 `test/unit/workdir-tag-session-sync.unit.test.js`（10 例源码守卫：三条监听都在、token 在模块级、陈旧判定不少于两处且早于写 UI、取值仍只走 `resolveWorkdirForSession`、`newSession`/`reloadAfterDelete` 必须派发 `session-switched`）；真实 MV3 探针 `test-results-probes/_workdir-ext-ui.mjs` 补 4 项（切到未绑定新会话后 chip 回到默认目录且 title 标注「（默认）」、切回绑定会话后 chip 复现绑定目录）→ **49 项全过**；回归 `npx vitest run` **203 文件 / 3058 例**、`npx playwright test` **67 例**、`node agent/test/smoke/session-workdir.smoke.mjs` **44 项**、`npx eslint src/ agent/` 无输出、`npm run build:silent` → BUILD_SUCCESS。

### 会话级工作目录：切会话时文件面板跟着换目录（+ 顺带清掉上个会话的预览）
> 来源：用户实测反馈「切会话后，输入框下方的目录 chip 变了，但侧边栏靠边的文件面板没跟着变，展示的仍是最近一次会话设置的目录」。

- **根因（静默错目录）**：面板的浏览位置 `currentPath` / `workspaceRoot` 是 `workspace-panel.js` 的模块级单例，切会话时没人复位它；而 `openPanel()` 只在 `!currentPath` 时才解析根目录，所以关掉再开也修不回来。更隐蔽的是新旧目录通常都在 `allowedPaths` 内，`/api/fs/list` 不报 403，连刷新按钮也只是把错误目录再列一遍 —— 用户看到的是「有内容、但不对」。chip 与上下文估算各自监听了 `session-workdir-changed`，所以只有它们跟着变。
- **单一同步入口**：新增 `syncWorkspaceToSession()`，负责「清 `workspace-manager` 会话级缓存 → 清面板导航态（`currentPath` / 历史 / 搜索 / `dirCache`）→ 目录真的变了才 `navigateToRoot()`」。`initWorkspacePanel()` 里注册 `session-switched` 与 `session-workdir-changed` 两个监听；后者按 `detail.sessionId` 过滤，别的会话改目录不动本面板。
- **不丢用户位置**：先取目标会话的根再比较，**目录没变（多个会话共用同一目录，含都未绑定）直接短路**，不重导航、不跳回根目录；只有目录真的换了才复位重列。
- **收起态也安全**：收起时只清缓存不导航，靠 `openPanel()` 既有的 `if (!currentPath)` 分支在下次打开时按新会话重新解析。
- **预览不串会话**：切会话时若正开着文件预览，强关（`closePreview(true)` 跳过「未保存」确认，避免切会话被模态框拦住），并先清 `previewAutoClosePanel`，防止产物预览展开的面板被顺手收起。
- **收敛重复入口**：`afterWorkdirChanged()` 改为只广播 `session-workdir-changed`，复位/重导航统一交给监听，避免「自己导航一次 + 监听再导航一次」连续列两遍目录；`sessionSyncToken` 让同一批事件只让最后一次真正导航。
- **验证**：新增 `test/unit/workspace-panel-session-sync.unit.test.js`（14 例源码守卫：两个监听必须走单一入口、复位在导航之前、同目录短路、`afterWorkdirChanged` 不得再自行导航、收起态依赖 `!currentPath`）；真实 MV3 探针 `test-results-probes/_workdir-ext-ui.mjs` 从 36 项扩到 **45 项全过**，新增「切会话 → 面板换目录（面包屑 + `/api/fs/list` 换新会话头）→ 旧会话预览被关闭 → 面板保持展开 → 收起态切回后重开定位回绑定目录」9 项；回归 `npx vitest run` **202 文件 / 3046 例**、`npx playwright test` **67 例**、`node agent/test/smoke/session-workdir.smoke.mjs` **44 项**、`npx eslint src/ agent/` 无输出、`npm run build:silent` → BUILD_SUCCESS。

### 语音输入：右侧 Alt / 右侧 Ctrl 单键触发（可配置，AltGr 不误触）
> 来源：用户反馈「Alt+V 有时候按起来不方便」，希望把一般闲置的右侧 Alt / 右侧 Ctrl 也做成触发键，且要能配、能两个都开、也能只开一个。

- **纯加法，不动既有习惯**：`Alt+V` 仍默认可用，且**不提供改键**（它与 `Alt+S` / `Alt+Shift+S` 同族）；新增的只是两个可选单键，默认全关。
- **一个模块三处共用**：新增 `src/shared/voice-shortcut.js`（无 DOM、chrome 惰性访问），判定（`matchSingleKeyDown`）、状态机（`createSingleKeyTrigger`）、存储（`load` / `save` / `watchVoiceShortcutConfig`）全放在这里；选项页、侧边栏、content script 都 import 同一份，避免三套语义漂移。配置落 `chrome.storage.local[voiceShortcutConfig]`，靠 `chrome.storage.onChanged` 实时同步，勾完即生效（不必重启扩展或重开面板）。
- **语义是「按下 → 松开」**：`keydown` 武装（返回 `'cancel'` → 调用方 `preventDefault`，顺带压掉 Windows 裸按 Alt 抢浏览器菜单），`keyup` 结算；按住期间敲了任何别的键就整次作废 —— 右 Alt 在 AltGr 布局上是组合键，这样既不误开录音，也不截断 AltGr 的字符输入；`isComposing` 期间同样不认。
- **捕获阶段 + `e.code`**：监听挂 `document` / `window` 的捕获阶段，页面脚本 `stopPropagation` 吞不掉；判定用 `AltRight` / `ControlRight`，与键盘布局无关，并要求「只有它自己」（AltGr 带的 `ctrlKey` 因此被排除）。
- **面板与网页同时生效**：面板走 `toggleVoiceInput()`；网页仍走 `VOICE_TOGGLE_FROM_PAGE` → background（面板已开则广播 `VOICE_TOGGLE`，未开则写 `pendingVoiceStart` 并尝试把侧边栏拉起）。门控未就绪（依赖 × 模型 × 开关）时不 `preventDefault`、不触发，不抢用户的键。
- **配置块不随总开关收起**：独立 `#asrShortcutSection`（不带 `disabled-section`），代理离线 / 还没装模型时也能先配好；🎤 的 `title` / `aria-label` 跟着配置列出可用键位。
- **验证**：新增 `test/unit/voice-shortcut-single-key.unit.test.js`（24 例：配置归一化 / 左键与 AltGr 不认 / 组合作废 / repeat 不作废 / 松开时已关不触发 / 合并写入 / watch 只听 local）+ `test/unit/voice-shortcut-panel.unit.test.js`（3 例，jsdom 真事件）→ `npx vitest run` **201 文件 / 3032 例全绿**；Playwright 探针 `test-results-probes/_asr-shortcut-section.mjs` 7 项全过（勾选落盘、合并写入、总开关关闭时仍可见）；真实扩展探针 `test-results-probes/_voice-single-key-panel.mjs` 10 项全过（真实 Chromium + dist 包：配置页勾选 → 已打开面板的 tooltip 经 `chrome.storage.onChanged` 立即更新；面板页与宿主网页上右 Alt 的 keydown 被拦（= 已武装）、左 Alt 不受影响；关掉后两处都不再拦）；`npm run build:silent` → BUILD_SUCCESS，`npx eslint` 六个文件无输出。

- **生效不依赖单一事件**：除了 `chrome.storage.onChanged`，侧边栏与 content script 还挂 `window.focus` / 可见性变化，回到面板或网页时再与存储对一次 —— 面板被隐藏、SW 刚重启等情况下事件可能没送到，表现就是「勾了要重开插件才生效」；新增真实扩展探针 `test-results-probes/_voice-shortcut-live-sync.mjs`，按「先开页面与面板、再回配置页勾选」的真实顺序复现，6 项全过。

### 知识库：本地向量改独立子进程（修 Windows 装完语音输入后 onnxruntime 抢句柄）
> 来源：用户在 Windows 机器上先装知识库、后装语音输入，之后所有检索报 `检索失败: The operating system cannot run %1. ...\onnxruntime_binding.node`。用户在公司机器上手工验证过修复方向（删嵌套副本 + 子进程），要求回收到源码。

- **根因**：`sherpa-onnx-node`（语音输入）与 `onnxruntime-node`（本地向量）各自捆绑一份 onnxruntime 原生库，而 Windows 的 `LoadLibrary` **按「模块基名」复用模块** —— 同一进程出现第二份 `onnxruntime.dll` 时后来者直接拿到先加载那份的句柄。ASR 在线识别在主进程加载 sherpa 的 dll，RAG 随后在主进程加载 onnxruntime-node 的 dll，版本不同即报 Win32 193（另一种表现是 `API version [N] is not available`）。
- **根治（进程隔离）**：新增 `agent/src/rag/embedding/embed-worker.mjs` 作为**主进程之外唯一的 `@huggingface/transformers` 加载点**（主进程一行都不 import，可用性探测的 `probe-child.mjs` 也跑在独立子进程里），stdin/stdout 单行 JSON（`load` / `embed` / `countTokens`）驱动；配套 `worker-client.js`（串行队列、未加载 180s / 已加载 60s 超时即杀、连续 3 次失败熔断 5 分钟、空闲 10 分钟回收、退出时拒绝在途请求）。`local.js` 只做透传，对外签名不变，RAG 检索与长期记忆无感。`worker_threads` 与主线程共享地址空间，隔离不了，所以必须是子进程。
- **防复发（副本去重）**：新增 `agent/src/native-lib-guard.js`，RAG / ASR 每次一键安装之后（两者都会重算包目录依赖树）扫一遍 `node_modules`，把嵌套的 `@huggingface/transformers/node_modules/onnxruntime-node` 删掉、只留顶层（= overrides 钉的 1.23.x）。**只清 `onnxruntime-node`**：`onnxruntime-common` 是纯 JS 胶水层，`onnxruntime-web` 正常自带 dev 版，删它只制造风险。清理结果写进安装日志（`rag_native_dedupe` / `asr_native_dedupe`），删除失败（文件被占）不判安装失败。
- **可诊断**：`errors.js` 识别 onnxruntime 抢句柄的**强特征**（`cannot run %1` / `ERROR_BAD_EXE_FORMAT` / `not a valid Win32 application` / `API version [N] is not available`）并映射为新错误码 `rag.err_ortConflict`，文案直接告诉用户「重启代理」—— 已加载的 DLL 在进程退出前无法卸载，热修无效。`RagError` 的 message 现在带上底层原因（此前只剩 `RAG error: <code>`，排障时看不到任何线索）。
- **收尾**：`server.js` 的 shutdown 关闭 embedding 子进程（它跑在独立进程，父进程退出不会自动回收）；新增手工验收 `agent/test/manual/rag-embed-isolation.mjs`（真实 512 维推理 + 断言主进程零 onnxruntime 加载 + 打印副本与 common 版本）。
- **不变式守卫（审计 + 单测）**：`agent/src` 全域 grep 复核 import 点 —— 真的加载这个包的**只有** `rag/embedding/embed-worker.mjs`；`rag/probe-child.mjs`（可用性探测）是唯一另一处字面量，但它是 `detect.js` 用 `spawn(process.execPath)` 起的独立进程，且 `import(name)` 走变量名、不在包加载期求值；`rag/detect.js` 只做 `detail['@huggingface/transformers']` 键访问；`test-embedding` 路由（`rag/routes.js`）与长期记忆（`memory/service.js`、`memory/routes.js`）全部经 `createEmbeddingProvider` → `LocalEmbedding` → `getEmbedWorker()`。新增 `test/unit/rag-no-mainprocess-transformers.unit.test.js`（12 例）三层锁死：源码静态扫描（剥注释后只允许 worker import、只允许三处字面量、禁止绕过工厂 `new LocalEmbedding`）+ 子进程契约（必须 `process.execPath` spawn、禁 `worker_threads`、probe 只被 spawn）+ **运行时证据**（`test/fixtures/rag-main-module-graph.mjs` 在干净子进程里加载 9 个主进程模块并走通一次本地档往返，断言 `process.report().sharedObjects` 中 onnxruntime 为 0；另带 `--control` 反向对照，先 import transformers 必须能看到 ort 共享库，防止「探不到」造成空转通过）。
- **验证**：代理端 `node --test test/unit/*.test.js` → **812 例全绿**（新增 32 例：子进程往返/超时/崩溃/熔断/空闲回收/错误映射 + 去重扫描/幂等/不动 `.pnpm` 与 web 的 common + 主进程不 import transformers 的 12 例不变式）；`node test/manual/rag-embed-isolation.mjs` → embed `2 x 512`、countTokens `{counts:[6],window:512}`、主进程 ort/sherpa 原生库 **0 个**；`npx eslint agent/src agent/test` 无输出。

### 知识库：进程隔离首版代码评审修复（全修）
> 来源：「修改的代码，做一下代码评审」—— Blocker 0 / Major 3 / Minor 5 / Nit 5，逐条复核实锤后全修（其中两条在实现时又挖出真问题，见 M4）。

- **M1 取证可能空转**：不变式单测靠 `process.report().sharedObjects` 枚举已加载共享库，而这是 Node **未文档化**字段（官方 process 文档里没有它），部分平台/版本不提供。旧实现把「探不到」当成「没加载」→ 单测永远绿、`--control` 反向对照在探不到的平台硬失败、手工脚本恒 PASS。改为**能力探测**：fixture 上报 `sharedObjectsAvailable`，探不到时单测 `t.skip` 并写明理由、手工脚本 `exit 2`（「无证据」不是「通过」）。
- **M2 安装期去重可能与子进程抢文件**：`pruneNativeDuplicates()` 在 daemon 内同步执行，而 embedding 子进程可能仍映射着 `onnxruntime.dll` → Windows 上删除拿 EPERM/EBUSY，只落进 `failed`，安装依旧显示 success，重启也不收敛。两个 install 在 prune 前先 `await closeEmbedWorker()`，并新增 `rag_native_dedupe_failed` / `asr_native_dedupe_failed` 日志把失败抬到可诊断层面。
- **M3 管道断裂会打崩 daemon**：`child.stdin.write` 只有同步 try/catch，而 EPIPE 是以**异步 `'error'` 事件**报的，没有监听就升级成 `uncaughtException`。给三条管道各挂一个空 `'error'` 监听（真正的失败仍由 `exit` / `_dropChild` 统一收敛）。
- **M4 `close()` 只「发起」退出**：旧实现 kill 完立即返回，Windows 上紧接着删 dll 必失败。改为「关 stdin → 等 `exit`（2s 未退强杀）」，返回即代表进程已消失。实现时踩到两个坑，都已写进代码注释：① 队列空了以后子进程是被 `unref` 的，若等 `exit` 的定时器也 `unref`，事件循环会直接排空 → 进程带 **unsettled top-level await** 以退出码 13 结束、子进程还在跑，所以等 `exit` 前必须把子进程 `ref` 回来；② 子进程收尾不能用 `process.exit(0)`：模型加载后进程里有 onnxruntime 原生线程，强退会在静态析构阶段撞 `mutex lock failed: Invalid argument` 并以 **SIGABRT** 结束（macOS 实测退出码 134），日志里看着像崩溃 → 改为让事件循环自然排空 + 5s 兜底强退。
- **m1 冷却退化**：冷却到点只清 `_cooldownUntil` 不清 `_failures`，「连续 3 次」会退化成「冷却结束后第一次失败就再锁 5 分钟」。到期时两者一起归零。
- **m2 冲突识别过宽**：`/onnxruntime_binding\.node/` 单独成条，会把「包没装全 / 架构不对 / Cannot find module」都判成抢句柄，给用户「重启代理」是误诊。拆成**强特征**（上面四类）与**弱特征**（`dlopen` / `LoadLibrary` / `cannot open shared object` / `DLL load failed` 等加载失败措辞，且 300 字符内与 `onnxruntime` 共现）。
- **m3 错误信息丢现场**：`ortConflict` 分支不传 params，Win32 193 的唯一线索丢了；`err_embedWorkerFailed` 又无条件让用户重启代理。现在统一 `errorDetail()`（压成一行 + 截断 300 字符）后带进 message；`ortConflict` 文案补「若重启后仍失败，请重新安装一次知识库依赖」，`embedWorkerFailed` 去掉误导性的重启建议。
- **m5 / Nit**：协议行超 1MB 视为协议错乱，直接丢子进程（不再留着半截 buffer 等到 60s 超时）；`MAX_DEPTH` 注释写 4 实为 6；「整个安装唯一 import」措辞不准（`probe-child.mjs` 也 import，只是跑在独立子进程里）→ 统一改为「主进程唯一加载点」。
- **测试补齐（8 例）**：`close()` 有在途请求 → `embed_worker_closed` 且 `waitGone(pid)` 证明进程真退出；**空闲态 close 在独立进程里验**（`node --test` 的测试运行器句柄会掩掉事件循环排空问题，这条用 `spawn(process.execPath, ['--input-type=module', '--eval', …])` 跑）；错 id 回包 → 超时不串包；worker 脚本不存在 → 毫秒级失败不吊死；冲突识别拆成「强特征 / 只有 binding 路径不算 / 弱特征需共现」三例 + `errorDetail` 截断；`native-lib-guard` 补「删不掉时落入 failed 而不抛错」（chmod 只读父目录，Windows 与 root 下 skip）。
- **验证**：`node --test test/unit/*.test.js` → **820 例全绿**；`npx eslint agent/src agent/test` 无输出；`node test/manual/rag-embed-isolation.mjs` → embed `2 x 512`、countTokens `{counts:[6],window:512}`、主进程 ort/sherpa 原生库 **0 个**、退出码 0（收尾不再有 SIGABRT 噪声）。

### 会话级工作目录：会话头覆盖收口（13 处漏传 + 源码守卫）
> 来源：用户追问「设计目录的一些 API 都会传会话 ID 吗，有没有遗漏」。审计发现代理端已经全部按会话作用域校验，但扩展端有一批请求绕过了统一拼头入口。

- **漏传的是「不能走 agentRequest」的通道**：会话头只有三个入口（`local-agent-client.agentRequest` 按需、`workspace-manager.agentRequest` 缺省取当前会话、`workdir-scope.agentApiFetch` 绑定专用）。凡是需要原始字节 / 表单 / 流式的调用都得手工拼 headers，一不留神只写了 `Authorization` → 代理端 `resolveRequestScope()` 拿不到 sessionId → 静默回落全局默认目录。会话绑定到非默认目录后，这类请求**全部 403**；附件上传更糟：文件写进默认目录，而模型后续是带会话头去读的，读它必然 403。
- **面板侧收拢成唯一拼头入口**：`workspace-manager` 的私有 `agentHeaders` 提升为导出的 `buildAgentHeaders(config, sessionId = currentSessionId())`（缺省按面板当前会话，显式传 `null` 表示不带会话头，覆盖「不跟会话走」的场景）。替换 4 处流式下载（单文件 / 带进度 / 批量 / 批量带进度）+ `workspace-panel` 6 处（拖拽上传 XHR、单删、批量删、预览取字节、xlsx 预览、导出图片）。XHR 不能传 headers 对象，改为 `Object.entries(buildAgentHeaders(config))` 逐个 `setRequestHeader`。
- **附件链路三处必须同改**：`file-extract` 新增 `sessionHeaders(token)`，覆盖上传（`/api/files/upload`，服务端按 `scope.workdir` 落盘）、抽图（`/api/documents/extract-images`）、取图（`/api/fs/download`）。只改一处会让「上传目录」与「读图目录」分处两地，docx 配图直接失效。
- **删掉 background 的上传死代码**：`local-agent-client.uploadFile` 无任何调用方，且其实现不带会话头（写入全局默认目录）。留着就是下一次误用的入口。
- **新增源码守卫单测**：`test/unit/workdir-session-header-coverage.unit.test.js`（9 例）把结构约束卡住——拼头入口必须存在于 `workspace-manager` 且缺省取当前会话；4 处 `download-stream`、6 处 `workspace-panel` 的 `/api/` 调用必须带 `buildAgentHeaders`；`workspace-panel` 不得再出现裸 `'Authorization'`；`file-extract` 只有 helper 自己能写 `Authorization`，上传/抽图/取图必须成对带会话头；background 不得再有 `/api/files/upload`。行为测试要真实 MV3 + 绑定会话才覆盖得到，源码守卫负责防回归。
- **验证**：真实扩展链路探针从 25 项扩到 **36 项全过**——在会话已绑定 `proj-a` 的状态下打开工作目录面板（定位到会话目录）→ 上传（XHR）→ 图片预览（`download-stream`）→ 下载 → 删除（进回收站）→ 附件上传，每步既断言请求头里的 `X-AIH-Session-Id`，也断言磁盘落点（落在 `proj-a`、不落代理默认目录）；扩展端 `npx vitest run` → **198 文件 / 3001 例全绿**；代理端 `node --test` → **776 例全绿**；Playwright → **67 例全过**；真 HTTP 冒烟 → **44 项全过**；`npx eslint src/ agent/src/` 无输出；`npm run build:silent` → BUILD_SUCCESS。

### 会话级工作目录：模拟用户实测收口（5 处真实缺陷）
> 来源：用户要求「代码测试、端到端测试、模拟用户的测试都试一试，发现问题就修掉并直接推远端」。前四层（单测/冒烟/Playwright/真实 HTTP 边缘矩阵）之外补了**真实 MV3 扩展 + 真实代理进程**的整套用户链路，缺陷是这一层跑出来的。

- **符号链接下新文件写穿沙箱**（安全）：`checkPath` 的 realpath 复查遇到 `ENOENT` 直接放行，理由是「路径尚不存在，无法通过链接绕过」。但会话目录里可以有 `link -> /outside`，`link/new.txt` 自身不存在 → `realpath` 抛 ENOENT → 放行 → 写入跟随链接落到沙箱外。新增 `realpathLoose()`（最近存在祖先的 realpath + 拼尾段）后再做前缀判定，并把「硬阻止 + 允许面」复查统一收拢成 `insideAllowed()` 供两处复用。
- **绑定到已存在的文件返回 500**：`/api/config/workdir` 对目标只判「在不在允许面内」，选到文件时后续 `mkdir` 抛 `EEXIST` → 500「切换失败」，用户分不清是权限还是选错了路径。改为 `statSync().isDirectory()` 预检，返回 400 + `error.workdirNotDirectory`。
- **会话目录被删后 exec 文案误导**：会话绑定的目录被删/改名后，`/api/exec` 一律回「路径不在本会话目录内」，用户去查权限配置也查不出所以然。现在先判作用域目录是否存在，缺失时回 `error.sessionWorkdirMissing` + `reason: 'session_workdir_missing'`，直接提示重新选择目录。
- **面板目录 chip 首次加载永不出现**（功能可用性）：`updateWorkdirTag()` 只在 DOMContentLoaded、`updateAgentIndicator`、`session-workdir-changed`、`agent-model-changed` 时触发，而 `state.enabledTools` 是更晚的异步回调才填充；填充完成没有任何补刷 → 首次打开面板 chip 一直隐藏，要等下一次会话/代理事件才出现。在工具状态加载回调末尾补一次 `updateWorkdirTag()`。
- **Playwright 夹具点「取消」导致假失败**：`form-page.html` 的 `#cancel-btn` 缺 `type="button"`，在 form 内缺省即 `submit`，点击触发页面导航，`clickByText` 的 `page.evaluate` 拿到「执行上下文已销毁」。补 `type="button"`。
- **验证**：真实扩展链路探针 **25 项全过**（真实配对 → 新会话 → chip（默认）→ 弹窗切目录 → 请求带 `X-AIH-Session-Id` + `scope=session` → 注册表落盘 → 全局 `config`/`allowedPaths` 未污染 → chip 变（本会话）→ 该会话 `exec` pwd 落绑定目录、未绑定会话仍落默认目录 → 恢复默认后 chip 回落）；代理端 `node --test` → **776 例全绿**（新增符号链接逃逸 2 例）；扩展端 `npx vitest run` → **197 文件 / 2992 例全绿**；Playwright → **67 例全过**；真 HTTP 冒烟 → **44 项全过**；`npx eslint src/ agent/` 无输出；`npm run build:silent` → BUILD_SUCCESS。

### 会话级工作目录：多会话权限审计 + 目录边界与调用链修正
> 来源：多会话并行后，代理端所有路径判定必须拿到「本会话」的目录上下文，否则会把合法操作误判成越界。用户要求「好好处理权限判断，别到时候出现问题」。

- **修掉目录边界误拦截**：`/api/config/workdir` 原判据 `startsWith(AGENT_DIR + sep)` 把 Agent 整棵子树都封了，而默认工作目录就是 `~/.ai-helper-agent/workspace` —— 选默认目录或任意子目录都被 403。抽出 `isWorkdirTargetAllowed()` 与 `checkPath`/`isHardBlocked` 同源：只拒根目录本身与硬阻止敏感面（`config.json`/`pairings.json`/`logs`/`.trash`），其余子目录放行；`realpath` + 大小写归一处理符号链接与 `.AI-HELPER-AGENT` 变体。全局切换与会话级绑定共用同一判据。
- **技能链补会话上下文**：`runSkill → executeSkill → executeSkillSteps → executeToolCall` 全程传 `ctx`；`agent_file`/`agent_search` 的 `checkPath` 带上会话作用域；`agent_exec` 的默认 cwd 由 `process.cwd()` 改为本会话有效目录，且 `args.cwd` 必须过同一套沙箱（技能是用户自定义内容，参数不可信）。
- **RAG 导入补会话上下文**：`ragRouter(..., ctx)` → `RagManager.ingestFile(collectionId, input, ctx)` → `checkPath(input.path, undefined, ctx)`。会话绑定刻意不写 `allowedPaths`（为了删会话能真正回收授权），不带 ctx 时会话目录内的文件一律被判越界。
- **扩展端调用方补齐作用域**（代码评审发现）：`local-agent-client.js` 的 `runSkill`/`ragIngest` 原先从不传第 5 参 `scope`，代理端 `resolveRequestScope()` 拿到的 sessionId 恒为 null —— 代理端的 ctx 形同虚设，技能与 RAG 仍按全局目录判定。现由 `tool-executor.js` 的 `executeAgentSkill`/`executeKnowledgeIngest` 接住分发时传入的 `sessionId` 并下传。
- **绑定意图显式化**：`/api/config/workdir` 新增 `body.scope`（`session`|`global`）。原先只按「有没有传 sessionId」推断，上层漏一个字段就会静默走全局切换，把并行会话（含正在执行和排队中的任务）的目录一起改掉。现在声明 `session` 却没 id → 400；传了非法值（如 `Session`）→ 400 `error.invalidScope`；完全不传的旧客户端行为不变。
- **验证**：代理端 `node --test` → **774 例全绿**；真 HTTP 冒烟 → **44 项全过**（新增目录边界、scope 三态、非法值）；真实并发压测 **20 项**（A 跑长任务期间改绑自己的目录、B 改绑自己的目录，产物仍落原目录；跨会话读写/exec 403 且带 hint）；扩展端 `npx vitest run` → **197 文件 / 2992 例全绿**；`npx eslint src/ agent/` 无输出；`npm run build:silent` → BUILD_SUCCESS。

### 会话级工作目录：按 sessionId 解析 + 执行期冻结 + 信息带目录 chip
> 来源：工作目录原本是代理 `config.json` 里的单一全局值，切一次所有会话跟着变。用户要求「并行会话里切走改目录，不能影响别的会话正在跑或排队的任务」，且「注入到上下文的目录必须跟着会话走，不能沿用全局旧值」。

- **代理端会话注册表**：新增 `agent/src/session-workdirs.js`（`~/.ai-helper-agent/session-workdirs.json`，0600 + tmp/rename 原子写 + 写锁 + mtime 缓存 + 200 条/90 天剪枝 + sessionId 白名单）。会话绑定**不**写 `config.allowedPaths` —— 否则删会话会留下永久授权，沙箱被逐步撑成整个文件系统。
- **权限校验会话化**：`checkPath(pathStr, tFn, { sessionId, workdir })`，相对路径按会话有效目录解析，放行集合 = 会话目录 ∪ `allowedPaths` ∪ 记忆目录；顺序仍是硬阻止 > 记忆目录 > 会话目录 > `allowedPaths` > realpath 复查（符号链接逃不掉）。
- **请求作用域贯穿**：`resolveRequestScope()` 解析 `X-AIH-Session-Id`；`X-AIH-Workdir` 只是「执行期冻结值」的声明，**仅当**等于该会话注册值（或未注册且等于全局默认）时才采纳，否则忽略并写审计日志。exec / fs / upload / status-detail / config-workdir(+unbind) 全部走会话上下文。
- **扩展端唯一解析入口**：`src/shared/workdir-scope.js` 的 `resolveWorkdirForSession()` 是唯一取值来源，`state.agentPlatform.workdir` 降级为「代理默认目录缓存」，禁止再出现在提示词拼装路径（源码守卫单测卡住回归）。
- **注入即对齐**：`getSystemPrompt(agent, { sessionId })` + 三处发送点传目标 sessionId；定时任务、子代理派发、ReAct 子任务三处后台提示词都按会话注入目录。
- **执行期隔离**：`beginSessionRun`/`endSessionRun` 引用计数在任务派发时冻结目录，`convergeSessionCwd()` 把越界 cwd 收拢回会话目录并记审计；跨会话接力时 `loadSessionStateForDispatch` 快照补 `workdir`/`workdirAgentId`，出队取的是所属会话的目录。
- **界面**：输入区信息带改为 flex 容器，上下文百分比右侧新增目录 chip（末级目录名，`title` 放完整路径 + 作用域），520/460/400/320 四档依次压窄目录名 → 隐免责声明 → 只留环；切换弹窗支持「恢复默认目录」「同时设为代理默认目录」，同会话执行中拦截不弹窗。
- **修掉三个真实缺陷**：`/api/exec` 403 分支在 `resolvedCwd` 声明前引用它（越界 cwd 会抛 TDZ 而不是回 403，模型的自我纠正通道直接失效）；`executeAgentFile`/`executeAgentSearch` 分发器漏传 sessionId（所有 fs/搜索工具退回全局目录校验）；`workdir-scope` 动态 import `db.js`（热路径多一次模块加载，且宏任务让测试等不到）。
- **验证**：代理端 `node --test` → **753 例全绿**；扩展端 `npx vitest run` → **196 文件 / 2985 例全绿**；新增真 HTTP 端到端冒烟 `agent/test/smoke/session-workdir.smoke.mjs` → **31 项全过**（绑定不污染全局 config、exec cwd 四种语义、跨会话借用 403、头采纳矩阵、unbind 回落）；Playwright 四档截图 9 例通过；`npx eslint src/ agent/` 无输出；`npm run build:silent` → BUILD_SUCCESS。

### 语音评审 Low 级项收口：模型哈希改分块读 + 录音条 live region 收敛
> 来源：上一轮评审列了 6 条 Low，但原始清单在上下文重置时丢了，本轮逐项重审确认能复现的那几条并改掉。

- **模型哈希整包读**：`sha256OfFile` 的注释写着「按 4MB 分块，避免一次性读入」，实现却是 `readFileSync(filePath)` 把整个文件读进内存 —— 上限设在 8GB，而 Node Buffer 上限约 2GB，超过会直接抛 `ERR_FS_FILE_TOO_LARGE`；几百 MB 的模型也是实打实的内存尖峰。改为 `openSync` + 4MB `readSync` 循环顺序读，内存峰值从「文件大小」降到 4MB。
- **录音条 live region 位置不对**：`role="status" aria-live="polite"` 原本挂在整条 `#voiceRecorderBar` 上，而条内计时器每 200ms 改写一次 `00:01`/`00:02` —— 读屏用户会被跳秒刷屏，真正该播报的状态文案反而被淹没。把 live region 下移到 `#voiceStatusText`，计时器与波形不再参与播报。
- **`aria-hidden="false"` 两态写法**：`showBar()` 原来写 `setAttribute('aria-hidden','false')`。false 与移除在无障碍树上等价，但两态写法正是上一轮「隐藏时焦点还在里面」那类问题的温床。改为显示时 `removeAttribute`，属性只表达「隐藏」。
- **核实后不改的一项**：「WS 握手无超时」在现有实现下不成立 —— Node 的 `headersTimeout`（默认 60s）在 upgrade 请求上同样生效，而升级后的连接还有 30s 一拍、两拍不回就 `terminate` 的心跳。不做改动。
- **验证**：新增 3 例（9MB 跨块文件的哈希与一次性计算一致；源码契约：`sha256OfFile` 内不得出现 `readFileSync(`；`side_panel.html` 的 live region 必须在状态文本上、显示录音条后 `aria-hidden` 必须不存在）。代理端 `node --test test/unit/*.test.js` → **696 例全绿**；扩展端 `npx vitest run` → **192 文件 / 2929 例全绿**；`npx eslint src/ agent/src/` 无输出；`npm run build:silent` → BUILD_SUCCESS。

### 无障碍：收起录音条前先把焦点交还输入框（消掉 Chrome 的 aria-hidden 告警）
> 来源：用户真机点「取消」后，控制台出现 `Blocked aria-hidden on an element because its descendant retained focus`，焦点元素是 `button.voice-cancel-btn#voiceCancelBtn`，被隐藏的祖先是 `div.voice-recorder-bar#voiceRecorderBar`。

- **问题**：「取消 / 完成 / 去授权」三个按钮都在录音条里，点是靠点击或 Enter 触发的 —— 点完焦点就留在按钮上；紧接着 `hideBar()` 给整条设 `aria-hidden="true"`，等于把一个**仍带焦点**的子树从无障碍树里摘掉。Chrome 122+ 会拒绝该属性并告警，读屏 / 键盘用户的焦点还会被悬空。功能上不报错，但属于实打实的可访问性缺陷。
- **修法**：新增 `releaseBarFocus()`，在 `hideBar()` 最前面调用 —— 若 `document.activeElement` 落在录音条内，先 `focus({ preventScroll: true })` 回输入框（取消或定稿之后用户下一步本来就是接着打字），输入框不可聚焦时退化为 `blur()`；焦点本就在条外则**不动**，不抢用户当前的焦点位置。
- **验证**：`voice-review-fixes` 补 2 例（点取消后焦点回 `#userInput` 且条内不再含焦点元素；焦点在麦克风按钮上时收起条不抢焦点）。**反向验证**：临时摘掉 `releaseBarFocus()` 调用跑一遍 → 第一例变红（`expected <button#voiceCancelBtn> to be <textarea#userInput>`），第二例仍绿，说明断言能精确区分「有修复 / 无修复」。语音相关 8 个测试文件 99 例全绿；`npx eslint` 无输出；`npm run build:silent` → BUILD_SUCCESS。

## 2026-10-27

### 语音转文字代码评审遗留项 M8：offline 定稿搬到 worker 线程（同步原生调用不再堵事件循环）
> 来源：上一轮评审把 M8 记为「架构级改动，暂不改」。用户要求「剩下的问题也全部解决完」，故本轮收口：把整段定稿推理从主线程搬到 `worker_threads`。

- **问题**：`transcribeSamples` → `recognizer.decode()` 是 sherpa-onnx 的**同步原生调用**（几百毫秒到数十秒）。它当时跑在两个主线程入口里：① `/ws/asr/:id` 的 `stop` 分支（即每次说话松手）；② `/api/asr/transcribe` 的 HTTP handler。期间整个 agent 事件循环停摆 —— `/health` 探活、WS cancel 帧、聊天流、工具执行全部排队，用户感受是「点停止后代理像死了一样」。此外启动预热在主线程加载了 offline 引擎，worker 化后若不动它，同一份几百 MB ONNX 会话会驻留两份。
- **修法（新增 `agent/src/asr/offline-worker.js` + `agent/src/asr/offline-pool.js`）**：单 worker + 串行队列。串行不只是省 CPU：worker 侧的 engine 缓存是**一个** recognizer 实例，两次 decode 交错会互相踩；串行队列还让「一个任务炸掉」不会污染后续任务（队列自身不继承失败）。带单任务超时（默认 180s，`AI_HELPER_ASR_OFFLINE_TIMEOUT_MS` 可调）、崩溃/超时后丢弃线程并由下一个任务重新 spawn、空闲 `idleMs` 后 `dispose → terminate` 把原生内存还回去（daemon 模式下线程 `unref`，空闲时不持住进程，有在途任务时才 `ref`）。
- **会话侧（`session.js`）：定稿改为「先让出名额，再等结果」**。`finalize()` 现在返回 Promise：同步段先把整段波形与草稿取走，`handleControl('stop')` 立刻 `release(session)`（在 `MAX_SESSIONS` 默认 1 的情况下，用户松手后**马上就能开始下一次录音**，不必等定稿跑完），worker 回来后再补发 `final` 并 `close()`；`max_duration` 定时器路径同样处理。期间客户端断开也不会报错——`send()` 发现 `readyState !== 1` 就静默丢弃（连接断了不是错误）。
- **HTTP 侧（`routes.js`）**：`/api/asr/transcribe` 走同一个池（`kind:'wav'`，解析 + 重采样 + 推理都在 worker）。错误码通过消息原样穿透，`unsupported_audio` → 400、`model_missing` → 409、其余 → 500 的分流契约不变。
- **预热与状态**：`warmupAsrEngines()` 把「流式预热留在主线程（增量 decode、开销小）/ offline 预热送进 worker」拆开 —— 几百 MB 的原生会话只留一份。`/api/asr/status` 的 `loaded.offline` 也随之补上 worker 侧的真实状态（`getWorkerLoadedModelId()`），否则配置页会显示「未加载」而实际已加载。`server.js` 停服时新增 `await closeOfflinePool()`。
- **两个容易踩的坑（都已在代码里注释说明）**：① `new Worker` 必须传 `execArgv: []` —— 默认继承主线程的 execArgv，`--test` / `--input-type` 这类入口参数会让 worker 直接起不来（`ERR_WORKER_INVALID_EXEC_ARGV`），而 Node 的 `node --test` 恰好就带 `--test`；`NODE_OPTIONS` 仍经环境变量继承，内存/实验开关照常生效。② `process.memoryUsage().rss` 是**进程级**的，worker_threads 共享同一地址空间，所以 `session.js` 的 RSS 保护阈值依然覆盖 worker 里的原生分配，不需要额外去读线程内存。
- **自己写出又自己抓到的一个 bug（记为教训）**：第一版 `settle(id, run)` 里，pending 条目存的 `resolve` 是「再调一次 settle」的包装 —— 消息回调先 `settle` 删条目、再回调里 `entry.resolve` 二次 `settle`，此时条目已不存在、直接 return，**Promise 永不落地**（探针里表现为 `runOfflineTask` 挂死 8 秒直到 watchdog 退出）。改成 `leaveQueue(id)` 只做出队 + 空闲调度、resolve/reject 直接由调用方执行。
- **spawn 失败仍在主线程兜底**：`new Worker` 抛错（文件缺失 / 环境限制）时退回主线程同步转写并记 `asr_offline_worker_unavailable` —— 宁可卡一下，也不让语音输入整个不可用（`warmup` 任务不兜底，预热失败只记 failed）。
- **验证**：新增 `agent/test/unit/asr-offline-pool.unit.test.js`（10 例，真起 worker_threads，只把 transcribe 换成 `test/fixtures/asr-fake-transcribe.mjs`）：**主线程不被阻塞**（worker 同步空转 300ms 期间主线程 tick ≥ 5）、transfer 传参、wav 任务、串行完成顺序、错误码穿透、队列不继承失败、超时后丢弃线程并自动恢复、空闲终止线程后重启、关池拒绝在途任务、预热失败只进 failed。`asr-session` 补 2 例并调整既有断言：**stop 后立刻让出并发名额（定稿还在跑也能 attach 下一路）**、定稿期间连接已断时 final 静默丢弃。
- **反向验证（关键）**：临时探针同一段 300ms 忙等跑两次 —— worker 路径 `wall=345ms ticks=31`，同步路径 `wall=300ms ticks=0`。说明「tick ≥ 5」这条断言真的能区分同步与异步，不是恒真。
- **回归**：代理端 `node --test test/unit/*.test.js` → **694 例全绿**；扩展端 `npx vitest run` → **192 文件 / 2925 例全绿**（本轮未改扩展代码）；`npx eslint src/ agent/src/` 与新增测试文件无输出；`npm run build:silent` → BUILD_SUCCESS。
- **未验证（如实标注）**：真机 sherpa 长时间定稿（如 5 分钟录音）在 worker 里的耗时与内存峰值没有实测；`node --test` 下的 worker 路径已验证，但 Electron/其它嵌入形态（若将来有）需重新确认 `worker_threads` 可用。

### 语音转文字代码评审：1 高危 + 8 中危全部修复（流式草稿文本膨胀 / 兜底回声 /  门控不刷新 / 续传坏包 / 并发开录）
> 来源：用户要求「再做一次代码评审，关于语音转文字功能的相关代码」。评审覆盖扩展侧（`voice-input.js` 913 行 / `voice-capture-worklet.js` / `background` 的 ASR 段 / `toolbox-asr.js` / `mic-permission.js`）与代理侧（`agent/src/asr/` 10 个文件 ≈3287 行），产出 1 High + 9 Medium + 6 Low。用户选定「修 8 项 + M4」，M8 单独记待办。

- **H1（最严重，用户可感知）：用户接手草稿后，文字会指数级膨胀**。`computeDraftEdit` 在 `draft.dirty` 时返回 `len: 0`，而 `applyDraft` 只在 `len > 0` 时回写 `st.draft.len` —— 一旦用户手动改过输入框，`len` 就永远停在旧值、`dirty` 永不复位，于是**每一个 partial（约 150ms 一次）都把整段累积文本追加一遍**：说 30 秒的话，输入框里会出现同一句话层层嵌套几十次，且旧文字再也替换不掉。修法：新增 `appendOnlyDelta(prev, next)`（纯函数，可单测）—— 记住「已写进输入框的那一版」`st.appliedText`，dirty 后只追加与上一版相比**多出来的尾巴**；若这一版是改写（不是前缀关系）则返回 `null`、**什么都不写**（宁可少写一句，也不重写用户已经看过的文本）。写入统一走新增的 `writeInput()`。
- **M2：`max_duration` 被当成硬失败，把 agent 已经算出来的定稿也一起扔了**。代理端的时序是「先发 `error{code:'max_duration'}` → 再用整段音频跑一次 offline 定稿发 `final`」（offline 质量比 partial 高），而面板收到 error 就 `rollbackDraft()` 回滚 + 回 idle，于是那条 final 要么被当迟到丢弃、要么落在空输入框里；用户看到的还是「语音识别失败」。修法：`max_duration` 单列一个分支 —— 只改文案（`voice.maxDuration`「已达单次录音时长上限，正在转写…」）、**保持 finalizing 等 final**，且若面板计时器被后台节流（phase 仍是 `recording`）就补一刀 `finish('stop')`。**顺带修掉一个自己写出来的次序 bug**：文案必须在 `finish('stop')` 之后设，否则会被 `finish` 内部的「正在转写…」覆盖（这条是反向验证时才暴露的）。
- **M3：ScriptProcessor 兜底会让用户听见自己的回声**。兜底路径 `node.connect(ctx.destination)` 是必需的（ScriptProcessor 不被拉到 destination 就不回调），但直连等于把麦克风原样播到扬声器。修法：串一个 `createGain()`、`gain.value = 0` 的中继再进 destination，`st.mute` 记住它、`stopCapture()` 一并断开。**先说清前提**：评审曾猜测「worklet 不接 destination 会一帧不产」，新探针 `_voice-worklet-pull.mjs` 实测三种接法各跑 600ms —— **悬空 16 帧 / 直连 16 帧 / gain(0) 中继 16 帧**，说明 worklet 悬空仍被驱动，这条高危猜测不成立，兜底也确实只在 worklet 加载失败时才走。
- **M4：程序写入草稿不通知下游，生成中补一句话按钮仍是「停止」**。`updateSendBtnState` 只挂在 `input` 和 `generating-state-changed` 上，语音是直接改 `input.value` 的，不发事件 → 按钮状态不刷新，用户点下去实际是「中断生成」。**评审建议的 `dispatchEvent('input')` 不能照抄**：侧边栏另有一个 input 监听在扫 `/` `@` `$` 弹提示词 / 助手选择器，口述内容里出现这三个字符就会在录音中途弹面板。改用专用信号 `document.dispatchEvent(new CustomEvent('voice-draft-written'))`，`index.js` 监听它刷新按钮三态。
- **M5：`ASR_STATUS_CHANGED` 全仓没有发送方**。面板 `initVoiceInput` 里注册了监听 → `refreshGating()`，但没有任何代码广播过它，于是「代理端装好了依赖 / 导入了模型 / 改过开关」之后，面板的 🎤 该亮不亮、该灭不灭。修法：`background` 处理 `ASR_RESET_STATUS` 时先 `clearAsrStatusCache()` 再广播（这个通道本来就在「配置页改完 → 回到侧边栏」这条路径上）。
- **M6：非法模型包在配置页显示成空行**。`agent scanModels` 返回的是 `{dir, name, error}`，`toolbox-asr.js` 却按 `x.id` / `x.message` 渲染 → 用户只看到「⚠ : 」，既不知道哪个包坏了、也不知道为什么。修法：`x.name || x.id || x.dir` 与 `x.error || x.reason`（后者兼容路由层的风格）。
- **M7：续传只比字节数，坏文件会被永久跳过**。`already === file.size` 就 `continue` —— 中断 / 掉电留下的「大小恰好一致、内容是残片」的文件从此被当成已下载，**每次重试都命中跳过**，直到引擎加载模型才炸，而报错信息（模型加载失败 / 输出乱码）和下载毫无关系。修法：续传判断改成 `already === file.size && sha256Matches(dest, file)`（清单没给哈希时退回只信大小以兼容老包，给了哈希但算不出来则按不匹配处理、宁可重下）；整包下完后再 `readModelManifest(partDir, { verifyHash: true })` 复核一次。为此把 `model-pack.js` 里原本私有的 `sha256OfFile` 导出复用（它自带以 `size+mtime` 为键的哈希缓存，重复校验不重复读盘）。
- **M9：并发开录时第二路会把第一路的麦克风关掉**。`startRecording` 在 `await refreshGating()` 之后不复查 phase（`await startCapture()` 之后那道复查已经补过，这条是同一类竞态的另一个入口）。两路都通过检查 → 第二路进 starting 各自开一套采集 → 被 `startCapture` 之后那道复查拦下 → 而它手里的 `stopCapture()` 清的是**共享的** `st.ctx` / `st.stream`：**界面停在「录音中」，麦克风已经灭了**。修法：`await refreshGating()` 之后同样复查 `st.phase !== 'idle'` 立即返回；门控降级（`!armed`）时由 `refreshGating` 自身负责 cancel。
- **M1：cancel / 错误路径不清 60s 兜底定时器**。`finishWaitTimer` 只在 `finish()` 里设、只在 `finish()` 里清，`cancelRecording` / 硬失败 / `closed` 等出口都直接写 `st.phase = 'idle'` 就走了 → 上一轮的定时器会跟到下一轮，触发时提前用 partial 定稿，紧接着的真实 final 被当成「迟到」丢弃。修法：新增 `resetToIdle()` 统一收口（清定时器 + 置 idle），全文 7 处出口全部改走它，并加断言「除 `resetToIdle` 内部外，全文不得再有直接写 `st.phase = 'idle'`」。
- **M8 记待办（明确不改）**：agent 端 offline 推理是**同步**调用 sherpa-onnx，几百毫秒到数秒的转写会阻塞事件循环 —— 期间 `/health` 探活、`cancel`、其它请求全部排队。正确修法是 `worker_threads` / 子进程隔离，属于架构改动，不在本轮范围。已列为后续待办。
- **验证**：新增 `test/unit/voice-review-fixes.unit.test.js`（13 例：H1 三态 —— 未 dirty 不累积 / dirty 只补尾巴 / 改写不动用户文本、`appendOnlyDelta` 纯函数矩阵、M2 保草稿等 final 且文案不被覆盖 + 硬失败仍回滚、M4 只发专用信号不发原生 input、M9 并发两路只开一路且不掐掉流、M1/M3/M5/M6 的源码契约）；新增 `agent/test/unit/asr-model-download-resume.unit.test.js`（6 例：`sha256OfFile` 已导出且结果与 crypto 一致 / 空文件与缺失返回 null、**同字节数不同内容 → `verifyHash` 必报 `sha256_mismatch`**、续传条件是「大小 && 哈希」双条件、`sha256Matches` 的两条分支、收尾 verifyHash）。**三条关键用例都做了反向验证**（临时摘掉修复跑一遍，确认会变红）：H1 → 2 例失败；M2 → 文案变成「正在转写…」；M9 → `tracks[0].stopped` 变 true。**M9 的第一版断言是恒真的**（只断言「只发一条 start」），因为 `startCapture` 之后那道复查会兜住第二路、只是顺手把第一路的流关掉 —— 换成「麦克风必须还活着」才真正抓住故障。全量 `npx vitest run` → **192 文件 / 2925 例全绿**；`agent` 端 `node --test test/unit/*.test.js` → **681 例全过**；`npx eslint src/ agent/src/` 无输出；`npm run build:silent` → BUILD_SUCCESS。
- **未验证（如实标注）**：以上均为单测 / 源码契约 / 探针证据，**未真机复跑**。建议手动确认三件事：① 说长句时中途点一下输入框再继续（H1 的 dirty 路径）；② 连续录满 `maxRecordingMs`，看是否显示「已达上限」并最终出稿（M2）；③ 生成中点 🎤 补一句，发送按钮是否立刻变成「发送」（M4）。

### 语音输入真机试用回流：worklet 路径修正（消掉两条报错）+ 发送即停录音 + 录音描边跟随圆角
> 来源：用户真机试用，截到三条控制台报错 + 三条体验反馈：① 识别出文字后按 Enter / 点发送，语音还在录；② 按 Enter 发送是不是也该停；③ 录音时输入框的边框特效是直角，很突兀。

- **那三条报错不是无害噪音，是同一条因果链**：`Failed to load worklet module script ... (Network error)` → `[AIH] [Voice] worklet unavailable, fallback to ScriptProcessor` → `ScriptProcessorNode is deprecated`。真因不是 CSP，是路径多拼了一层：`voice-input.js` 写死 `chrome.runtime.getURL('dist/voice-capture-worklet.js')`，而**打包后 dist 就是扩展根**（`manifest.json` 在 dist 根），于是请求落到不存在的 `<根>/dist/voice-capture-worklet.js` → `ERR_FILE_NOT_FOUND`，每次录音都静默退到 ScriptProcessor（主线程音频回调 + 已废弃 API）。功能虽能用，但白丢了 worklet 的低占用，还常驻一条废弃警告。修法：`WORKLET_PATHS = ['voice-capture-worklet.js', 'dist/voice-capture-worklet.js']` 两个候选（商店 zip / load unpacked dist → 扩展根；load unpacked 项目根 → 源码形态在 `dist/` 子目录），**先用 `fetch` 探存在性再 `addModule`** —— 直接 `addModule` 失败会由浏览器打一条错误日志，不能拿来当探测手段；解析结果缓存，一次会话只探一次。
- **发送 = 语音终态，三条「消费输入框」的路径全部收尾**：`chat-manager.sendMessage()` 在「确认有文字」之后 abort（带 `if (!opts.fromQueue)` 守卫 —— 队列派发不消费输入框，用户可能正在录下一句）；`queue-runner.enqueueFromInput()`（生成中按 Enter / 发送按钮带草稿）与 `injectAdHocText()`（Alt+Enter 插话）同样先 abort 再清空。abort 用 `rollback: false`：已经识别出来的字正是要发出去的内容，不能回滚。开关语义不变 —— 录音中再点一次 🎤 仍是 `finish('stop')`；发完之后 phase 已回 idle，再点 🎤 就是新的一次录音。
- **还抄出一个更麻烦的竞态**：`startRecording()` 在 `await startCapture()` 之后**不复查 phase**。采集是异步的（getUserMedia 授权框 + worklet fetch/addModule 合起来几百毫秒），这期间按 Enter 发送 → `abort()` 已把 phase 打回 idle，但采集恰好这时就绪，下一行 `phase = 'recording'` 把刚停掉的录音重新拉起来 —— 表现就是「消息发出去了，麦克风还亮着，说一句又往空输入框里冒字」。现在采集返回后先复查 `phase === 'starting'`，不是则 `stopCapture()` 当场释放刚拿到的流并 return false；catch 分支同样加了复查（否则迟到的采集错误会在已收起的录音条上闪一条「失败」）。顺带 `cancelRecording()` 在 `starting` 阶段不再往代理端发 `cancel`（那时还没发 `start`，没有会话可取消）。
- **迟到的 final 必须丢弃**：代理端在 `cancel` 之后仍可能补一条 `final`，原 `onAgentEvent` 无条件 `finalizeText`，于是「消息发出去后又冒出一段字 / 弹一条已完成」，像偷偷又录了一次。现在 `final` 只在 `recording | finalizing` 时处理，其余一律丢弃 —— 同时覆盖「点 🎤 停止 → 转写中 → 立刻按 Enter 发送」这条路径（final 回来时输入框已清空）。
- **描边直角是因为画错了层**：脉冲光晕原先挂在 `.input-wrapper textarea` 上，而 textarea 的 `border-radius` 是 0（圆角由 `.input-container` 的 `16px 16px 8px 8px` 提供）→ 得到一圈直角光晕，和容器圆角对不上。改挂 `.input-container` 后光晕自然贴合圆角，基底 `box-shadow` 与 `transition` 一并复用（不新增过渡）。
- **验证**：新增 `test/unit/voice-send-stop.unit.test.js`（11 例：abort 后采集停 / 按钮复原 / 录音条收起 / 发出 `cancel`、abort 不回滚已识别文字、迟到 final 被丢弃、**`starting` 阶段被 abort 后不重拉录音且流当场释放**（用悬起 getUserMedia 卡出窗口，已反向验证：摘掉修复则此例失败）、三条消费路径的接线契约、worklet 候选与 fetch 探测、描边挂在容器且 textarea 保持 `border-radius: 0`）。探针 `_voice-worklet-load.mjs` 在真实 dist 上实测：`voice-capture-worklet.js` → **HTTP 200 / 1451 bytes**，`AudioWorklet.addModule` → **ok**，`new AudioWorkletNode('voice-capture')` 注册成功（即不再走 ScriptProcessor 兜底，deprecation 警告随之消失）；录音态容器 `border-radius = 16px 16px 8px 8px`、`box-shadow = rgba(102,126,234,0.22) 0 0 0 1px, ...`、textarea `box-shadow = none`，截图 `_voice-recording-glow.png` 可见光晕贴着圆角。全量 `npx vitest run test/unit` → **191 文件 / 2912 例全绿**；`npx eslint src/ ...` 无输出；`npm run build:silent` → BUILD_SUCCESS。
- **未验证（如实标注）**：探针是在 `side_panel.html` 里直接 `fetch + addModule`（无麦克风授权，跑不通真实 `getUserMedia` 采集链），所以「真机录音时控制台零报错」仍建议手动再确认一次；现有证据只能证明「路径可达 / 模块可加载 / processor 可实例化」这三段。

### 语音输入（本地 STT）体验收口：安装误报「失败」修复 + 模型一键下载 + 语言文案与下拉统一
> 来源：真机试用反馈 5 点：① 点依赖安装几次都提示安装报错，过一会儿「重新检测」又说已装好；② 模型目录为什么还要选；③ 模型能不能也自动装；④ 识别语言为什么写的是语言编码；⑤ 输入框下拉太原始、要和项目其它下拉统一。

- **问题 ① 的真根因不在「重复点击」，而是前端读了一个不存在的字段**：`getAsrInstallStatus()` 返回的是 `{running, done, success, phase, logTail}`，前端却判 `install.status === 'running' | 'done'` —— 恒为 `undefined`，于是第一次点击就立刻走 `else` 分支：进度区写「安装已中断」、并弹红 toast「安装失败」、同时 `clearInterval` 停掉轮询。npm 其实一直在后台正常跑，所以「过一会儿重新检测」就变成已装好。修法：前端统一判 `running` / `done` / `success`；`startAsrInstall` 在已在安装时返回 `{started:false, alreadyRunning:true}` 且 HTTP 统一回 **200**（原来是 `409`，前端只能当失败），按钮在安装中置为 disabled + 「安装中…」；轮询连续 3 次拿不到状态才提示，一次网络抖动不再误报。**顺带纠正用户的一个猜测**：ASR 刻意**不**在启用时自动装依赖（`install.js` 顶部有注释），300MB+ 不该在用户不知情时吃带宽。
- **问题 ② 的真相：模型目录本来就是固定的**（`MODELS_DIR = ASR_ROOT/models`），可变的只是旧 UI 把「从外部目录拷包进来」写成了「选择模型目录」，读起来像是让用户选一个存储位置。改成：配置页直接展示固定路径（`getModelsDirDisplay()` 把 home 折叠为 `~`，避免暴露用户名长路径），按钮改叫「从文件夹导入」；同时修掉 `copyDirSync` 用 `writeFileSync(to, readFileSync(from))` 把 239MB 整文件读进内存的隐患（改 `copyFileSync`），并让 `scanModels` 跳过点开头目录（下载器的 `.part` 中转目录不该出现在「非法模型」列表里）。
- **问题 ③ 落地为「两条腿走路」**：新增 `agent/src/asr/model-catalog.js`（内置 2 个包 / 6 个文件的体积与 sha256，均以本机已跑通且转写通过的包为准）+ `agent/src/asr/model-download.js`（任务式逐文件下载）+ 4 个端点（`catalog` / `download` / `download/status` / `download/cancel`）。关键取舍：**不下载官方 `.tar.bz2`**（Node 没有 bzip2，为解压引依赖不值得），改走 HF 单文件 HTTP + 本地生成 `manifest.json`；默认端点 `hf-mirror.com`（实测 `huggingface.co` 直连 curl 返回 000 不可达，镜像 200，且 6 个文件的 `Content-Length` 与本地字节数完全一致）；未完成包落 `models/.<id>.part/`，全部就绪才原子 `rename`；已存在且字节数对得上的文件直接跳过（续传），逐块 `sha256`，无数据 60s 超时，`AbortController` 取消，任务状态落盘并在启动时把「运行中」收敛为「已中止」。交互按用户选定：**打开开关时缺模型就自动试一次**，失败降级为「模型未安装 + 固定路径」并保留手动重试 / 拷包两条路，不把内网用户一棒子打死。
- **问题 ④/⑤**：识别语言从 `auto/zh/en/…` 改为「自动识别（中英混说）/ 中文 / 英文 / 日语 / 韩语 / 粤语」（协议侧仍传编码），下拉直接复用项目已有的 `.model-selector` / `.model-dropdown` / `.model-option`，避免同一页面两种下拉形态。**注：当时的触发器是自写的 `<button>`，次日又按用户反馈改成与「界面语言」下拉完全同构（见下文「识别语言下拉与『界面语言』同构」），本条不再代表现状。**
- **验证**：代理端新增 `asr-model-catalog.unit.test.js`（20 例：清单自洽、id 白名单、端点覆盖、状态机 404/尺寸不符/幂等重入/取消/已安装跳过）+ `asr-routes` 补 6 例下载端点契约 —— 全量 **667 例 / 118 套件全绿**；扩展端 `vitest` **187 文件 / 2870 例全绿**；`eslint src/ agent/src/` 无输出；`npm run build:silent` → BUILD_SUCCESS。真机 status 实测：`modelsDirDisplay=~/.ai-helper-agent/asr/models`、`catalog` 两条目 `installed=true`、`install.running=false done=true success=true`（即历史安装其实是成功的）。
- **未验证（如实标注）**：本机两个包已存在 → 真实从零下载 434MB 未跑（接口回 `skipped: already_installed`），下载链路的失败 / 取消 / 续传 / 幂等由本地假镜像的单测覆盖；真机建议拿一台干净环境验一次断点续传与取消。

### 语音输入麦克风授权：侧边栏里弹不出授权框的根治（配置页一次性授权 + 侧边栏「去授权」）
> 来源：用户反馈「点 🎤 只提示我去授权，浏览器却没弹框；还得自己到配置页找配置项——是不是代码没触发申请？」

- **根因不是代码没触发，是浏览器不允许**：Chromium 在 **side panel / popup / offscreen document** 里调 `getUserMedia` **不会**展示原生权限弹窗，直接抛 `NotAllowedError`；只有**标签页形态的扩展页面**能弹。更麻烦的是扩展页面没有地址栏锁图标，用户也没有「点图标放行」的入口；原文案指向 `chrome://settings/content/microphone` 也不对——扩展不在普通站点列表里，正确入口是 `chrome://extensions` → 详情 → 网站设置。
- **方案（用户明确选定：不动 manifest）**：新增 `src/shared/mic-permission.js`（`normalizeMicState` / `queryMicState` / `requestMicAccess` / `watchMicState`，依赖可注入）——把「已拒绝」和「只是关掉了弹窗（仍是 prompt）」分开，`permissions.query` 抛错（老浏览器不认 `microphone`）回落 `unknown` 而不是误报被拒。配置页「语音 Tab → 麦克风权限」新增常驻的**麦克风权限小节**：状态 pill（已授权 / 未授权 / 已被拒绝 / 状态未知）+「授权麦克风」，拿到流后立刻 `track.stop()` 只要授权结果；已被拒绝时按钮换成「复制扩展详情链接」（`chrome://` 地址无法用 `<a>` 打开，只能让用户粘）。
- **真正的「提前申请」落在打开开关那一下**：开关的 click 本身就是用户手势，且配置页是标签页，所以启用语音输入时先 `getUserMedia` 再保存配置——错过这里就只剩「侧边栏报错 → 跳过来补授权」。授权按 `chrome-extension://<id>` 记忆，一次之后侧边栏直接可用且不再询问。
- **侧边栏侧**：录音条新增隐藏的「去授权」文字按钮，仅 `NotAllowedError` / `SecurityError` 时露出，走已有的 `OPEN_OPTIONS_PAGE{hash:'asr'}`；配置页 `activateByHash` 新增 `#asr` 别名（`switchTab('toolbox')` + `scrollIntoView` + `.section-flash` 高亮，后随语音独立成 Tab 改为 `switchTab('voice')` + `focusMicBlock()`）。未授权时录音条停留 12s（其它失败仍 4s），避免按钮来不及点。同时把文案从「麦克风权限被拒绝」改为「麦克风未授权」——侧边栏里大多数情况是**从未授权**而非**被拒绝**，原表述会把人引向错误的自查方向。
- **刻意不做**：不在 `manifest.json` 声明 `audioCapture`。它能省掉运行时弹框（安装时一次授予），代价是**所有用户**安装时都会看到麦克风权限提示且无法按需撤销；本项目把语音做成可选组件，「用到才申请」更合适。MV3 下该权限的实际行为本轮未取得一手证据（官方 permissions 列表页抓取失败），只作为后续可选增强记录。
- **验证**：新增 `test/unit/mic-permission.unit.test.js`（14 例：状态归一化 / 查询兜底 / 申请成功即 stop 轨道 / 拒绝 vs 关弹窗 / NotFoundError 不误判 / watch 取消订阅），并改写 `voice-recorder-bar` 的权限用例（断言「去授权」露出 + 点击发出 `OPEN_OPTIONS_PAGE{hash:'asr'}`）。扩展端全量 `npx vitest run test/unit` → **188 文件 / 2884 例全绿**；`npx eslint src/` 无输出；`npm run build:silent` → BUILD_SUCCESS（已确认 dist 内 `options.html`、`side_panel.html`、i18n 包含新文案与 `#voicePermBtn`）。
- **未验证（如实标注）**：真机未手动跑「点授权 → 浏览器弹框 → 允许 / 拒绝 / 关掉」三条路径。弹框能力依赖 Chromium 对**标签页形态扩展页面**的例外行为，若实测某些版本仍不弹，降级路径是文案里的「复制扩展详情链接 → 网站设置」手工授权，功能不受影响。

### 语音输入独立成 Tab（从「扩展」迁出）+ 识别语言下拉撑满整行
> 来源：「语音输入放在扩展 Tab 下是不是合适？为什么不单独搞一个 Tab，叫『语音』呢？」（用户选定：拆）；随后「这个下拉输入框宽度设为 100%，撑满」。

- **为什么值得一个 Tab**：语音是「换一种输入方式」，MCP / 技能是「给 AI 加能力」，不是一类；体量也够（依赖 + 模型 + 识别语言 + 麦克风权限四个小节）。原先夹在 MCP 与技能之间，想改识别语言得先滚过整个 MCP 列表。也与「知识库 / 记忆」这两个同为「装依赖 + 下模型 + 开关」的子系统独立成 Tab 的先例一致。
- **搬了什么**：`options.html` 新增 `data-tab="voice"` 面板并把 `#asrSection` 整块移入（「扩展」面板删掉原 ASR 块）；`index.js` 的 `validTabs` 加 `'voice'`、`tabRefreshers.voice` 走新增的 `refreshVoicePanel()`（`initAsrEvents` + `refreshAsrSection`）；`refreshToolbox()` 摘掉 ASR 两行 —— 进「扩展」不再顺手查一遍 ASR 状态（代理端那次 status 会去查依赖 / 模型 / 安装进度）。
- **深链不动**：`#asr` 继续有效，只是落点从 `switchTab('toolbox') + 滚动` 换成 `switchTab('voice') + focusMicBlock()`（面板异步渲染，等 `#asrMicBlock` 量出高度再滚 + `.section-flash`，最多重试 8×120ms），侧边栏「去授权」一行没改。
- **顺手修掉拆出来的一个坑**：独立 Tab 里没有「扩展」那颗 `#toolboxAgentStatus` 兜底，代理未连接时若沿用「收起」就只剩一张「已停用」的折叠卡、没有任何原因提示。disconnected 分支改回**展开**，文案指向「代理」Tab：`Agent 未连接：请先到「代理」Tab 完成连接，之后才能配置语音输入`。
- **识别语言下拉撑满**：`.asr-lang-field` 由 `max-width: 320px` 改成 `width: 100%` —— 正下方的提示文字本来就占满整行，下拉只到 320px 显得「半截」；浮层 `.model-dropdown` 是 `left:0; right:0`，自然跟随同宽，排版（padding / 字体 / 圆角 / 边框）仍全部来自 `.model-selector` 基类。
- **验证**：新增 `test/unit/voice-tab-structure.unit.test.js`（8 例：8 个 Tab 顺序、ASR 节点只在语音面板、「扩展」零残留、双语文案、`#asr` 落点、`tabRefreshers.voice`、`refreshToolbox` 已解耦）。探针 `_tabnav-width.mjs` 重写为守卫：中英文各量一次 —— **8 个 Tab / 1 行 / 容器 540px / 零截字**，并实测 `#voice` 激活与 `#asr` 深链落点（voice=true toolbox=false）；`_asr-section-collapse.mjs` 开 370px → 关 79px（省 291px）；`_asr-lang-dropdown-clip.mjs` 新增宽度断言 —— 触发器 **540px**（可用 540），下拉同宽 540px，排版 5 项仍与 `#languageInput` 全等。全量 `npx vitest run test/unit` → **190 文件 / 2901 例全绿**；`npx eslint src/` 无输出；`npm run build:silent` → BUILD_SUCCESS。

### 语音输入：总开关关闭时收起下方全部配置项
> 来源：「总开关关掉后，下面的配置项还在界面上铺着，想看『技能管理』还得往下滚。」

- **折叠机制本来就有，是被自己摘掉的**：区块沿用了 MCP / 技能同款的 `.toolbox-section.disabled-section`（`max-height: 0 ↔ 2000px` + `opacity`），但 `refreshAsrSection()` 每一轮都无条件 `remove` 这个类 —— 于是「关掉总开关」只改了 checkbox，配置区永远是展开态。改成按 `status.enabled` 去 `toggle`。（**注**：代理未连接分支次日又改回展开 —— 语音已独立成 Tab，那里没有别的状态兜底，收起会让用户面对一片空白；见上文「语音输入独立成 Tab」。）
- **只收内容区不够**：`#asrMicBlock`（麦克风权限小节）物理上在 `#asrSectionContent` **之外** —— 内容区每次刷新都整体替换 `innerHTML`，静态节点放进去会被冲掉。所以它必须单独跟随 `disabled-section` 收起，否则关掉总开关后仍剩一整块（标题 + 提示 + 按钮）。
- **验证**：新增探针 `test-results-probes/_asr-section-collapse.mjs`（真实扩展页面，只切类不改配置）—— 开启时区块 370px（内容 148 + 麦克风 128），关闭时 79px（只剩标题行），省 291px；同时校验「授权麦克风」按钮完整落在区块内。

### 识别语言下拉与「界面语言」同构（去掉自写触发器）
> 来源：「识别语言那个下拉框是不是可以参考界面语言下拉框的样式去做？」

- **差异是真差异，不是错觉**：识别语言的触发器是自写的 `<button class="asr-lang-trigger">`（`padding: 10px`、`font-family: inherit`、自定义 hover / focus ring），而「界面语言」是 `.model-selector` + `readonly input`（`padding: 12px 40px 12px 12px`、等宽字体、`focus` 时 `border + 3px` 光晕）。两者并排能看出高度与字重不同，选项还多包了一层 `.model-option-left`。
- **做法：删掉那套，直接同构**：触发器换成 `<input type="text" id="asrLangInput" readonly>`（选项文案放进 `value`，随 `renderStatusBlock` 重渲染自然回显），选项回归纯文本 `.model-option`；一并删除 `.asr-lang-trigger` 相关的 31 行自定义样式与 `.model-option-left` 包裹，只保留 `.asr-lang-field`（宽度，见上文已改为 100%）与 `.asr-lang-menu.model-dropdown { max-height: 280px }`（6 个语种一屏看完）。代价是语言名回到等宽字体 —— 与「界面语言」保持一致优先。
- **验证**：`_asr-lang-dropdown-clip.mjs` 新增逐项比对 —— `padding / font / border-radius / border / background` 与 `#languageInput` 计算样式**完全相等**；`asr-lang-dropdown-style.unit.test.js` 补 3 例守卫（触发器必须是 `.model-selector` + readonly input、不得再有 `.asr-lang-trigger`、选项不得再包 `.model-option-left`），防止又长出第二套；扩展端全量 `npx vitest run test/unit` → **189 文件 / 2892 例全绿**，`npx eslint src/` 无输出，`npm run build:silent` → BUILD_SUCCESS。

### 语音输入：识别语言下拉只能看到第一项（区块 overflow 裁切）
> 来源：上一轮刚把识别语言改成自定义下拉，用户截图反馈「下拉高度怎么这么低，选项显示不出来」。

- **不是下拉被压扁，是被上层挖掉了**：`.toolbox-section-content` 为了折叠动画带 `overflow: hidden`（`max-height: 0 ↔ 2000px`），而语言下拉是 `.model-selector` 内的**绝对定位** `.model-dropdown` —— 浮层一旦越过区块内容区的底边就被裁切，看上去像「高度只有一行」。下拉自身 `max-height: 240px` + `overflow-y: auto` 一直是正常的（截图里那条细竖条就是它自己的滚动条）。
- **修法**：给「展开态的语音输入内容区」单开覆盖 `#asrSection:not(.disabled-section) #asrSectionContent { max-height: none; overflow: visible; }`。带 `:not(.disabled-section)` 守卫是关键——折叠态仍回到 `overflow: hidden`，`max-height: 0` 折叠动画与「代理未连接时收起」都不受影响（探针有反向断言）。不用把规则提到全局 `.toolbox-section-content`，免影响 MCP / Skill / 知识库等其它区块。
- **顺手修一个观感问题**：6 个语种 = 6×41≈246px，默认 240px 会只为 6px 溢出挂一条滚动条。`.asr-lang-menu.model-dropdown { max-height: 280px }` → 一屏看完，多语种扩展后仍会内部滚动。
- **验证**：新增 `test/unit/asr-lang-dropdown-style.unit.test.js`（5 例：基础折叠仍是 hidden / 展开态必须放开 / 覆盖规则带 `:not()` 守卫 / 语种高度 > 240 / 定位上下文在 `.model-selector`）+ 真机扩展探针 `test-results-probes/_asr-lang-dropdown-clip.mjs`（加载真实 dist 的 options.html，用 `elementFromPoint` 在「区块底边之外」取点：修前命中下方区块、修后命中下拉项）。结果：`overflow=visible`、折叠态 `hidden`、下拉高 247px 一屏 6 项、探针点命中 `model-option-left`，截图 `_asr-lang-dropdown-clip.png` 可见 6 项完整展开。全量 `npx vitest run test/unit` → **189 文件 / 2889 例全绿**；`eslint` 无输出；`build:silent` BUILD_SUCCESS。

## 2026-10-26

### 语音输入（本地 STT）：代理端本地推理 + 侧边栏 🎤 / Alt+V
> 来源：需要「说话变文字」，但既没有可用的 ASR API，代理端又部署在无外网的公司办公网。硬约束是**数据不出本机、不出内网**，因此推理必须落在本机代理端，模型走离线包分发。

- **技术选型**：`sherpa-onnx-node@^2.0.0`（N-API 预编译，7 个平台 optionalDependencies）+ 本地 ONNX 模型。流式草稿用 Streaming Zipformer（transducer，int8），松手定稿用 SenseVoice（int8，`use_itn=1`），断句用 Silero VAD。选它而不是 whisper.cpp / transformers.js whisper：① 同一次录音要「边说边出草稿 + 松手高精度定稿」两条链路，sherpa 的 online/offline 两套识别器是同一套配置模型，不用维护两个引擎；② N-API 预编译包不需要用户装编译器（whisper.cpp 要 build）；③ 中文 + 中英混说的 CER 明显好于 whisper-tiny/base。
- **安装严格可选，零侵入主流程**（对齐 RAG 的形态，但反向取舍见下条）：`agent/package.json` 新增自有字段 `asrDependencies` —— npm 不认它，所以 `npm i -g ai-helper-agent` 与 `install.sh/ps1` 都不会顺手拉这 300MB+。安装入口三处齐备：配置页一键安装（`POST /api/asr/deps/install` + 2s 轮询进度）、`aha asr install`、`install.sh --with-asr` / `install.ps1 -WithAsr`。安装脚本里该步骤独立子进程执行，仅交互式终端才询问且**默认否**，非交互（管道 / CI）静默跳过，失败只打警告并提示「稍后在配置页安装」，绝不中断安装主流程。
- **刻意不做依赖自动重装**（与 RAG 的 `maybeAutoRestoreRagDeps` 相反）：包体大、磁盘占用高，`npm -g` 升级把包目录内依赖清掉时只把 `everSucceeded=true` 记进状态，提示「依赖已被清理，请点击重新安装」，不在用户不知情时重下 300MB。
- **启动期零成本探测**：判定顺序是「读 `asr-config.json` → 检查 `node_modules/sherpa-onnx-node/package.json` 是否存在 → 两者都满足才起子进程探测（超时 3s）」，未装用户不会付出任何加载开销（RAG 的探针会加载 onnxruntime，对未装用户纯浪费）；探测在 `server.listen` 之后异步执行，不阻塞启动、不影响任何既有接口。这里沿用 R8 教训：依赖可用性只能**子进程**判活 —— 模块求值失败会被永久缓存，进程内 import 一次失败后整个进程都以为它坏了。
- **启用状态三分离**：`depsReady`（依赖）/ `modelsReady`（模型）/ `enabled`（用户开关），三者全真才向 UI 暴露 🎤，`/api/asr/status` 的 `reason` 直接回 `deps_missing` / `models_missing` / `disabled`。默认 `enabled=false` —— 装了不等于启用，避免「装了就该能用」的误解。扩展端 `computeArmed()` 以服务端 `available` 为权威（有该字段就用它），只在旧代理无该字段时才按三项自行推导，防止两端规则漂移。
- **代理端新增 `agent/src/asr/`**：`config.js`（路径 / 默认值 / 写锁）、`model-pack.js`（manifest 校验 + 目录穿越防护 + sha256 按 path/size/mtime 缓存）、`detect.js`（子进程探针）、`engine.js`（online/offline/vad 三类懒加载单例，`intraOpNumThreads=clamp(1..4, cpus-1)`，`idleUnloadMs` 到期释放）、`transcribe.js`（WAV 解析 → 非 16k 线性插值重采样 → VAD 切段 → 逐段解码 → 拼接）、`session.js`（WS 流式会话注册表）、`routes.js`、`install.js`。
- **`session.js` 的收敛策略**：二进制帧 `acceptWaveform + decode`，partial 节流 150ms；`isEndpoint` 为真则提交片段并 `reset` stream；`stop` 优先走离线定稿，无离线模型 / 离线失败 / RSS 超限时**退化为流式全文**（`fallback:true`，只在日志里记 `asr_offline_skipped`，不丢已识别内容）；`close` 未 stop、空闲 30s、总时长 5min、并发超限（默认 1）、进程退出统一收敛并释放。
- **写单测时挖出 3 个真实缺陷并修掉**：① **partial 节流把 `currentText` 的更新也一起推迟**，导致「无离线模型时 stop 退化」拿到的是被节流窗口截断的旧文本（丢尾部）—— 拆成 `currentText`（最新解码文本，任何情况都更新）与 `lastSentText`（真正推送过的文本，仅用于去重），`endpoint` 时两者一并重置；② **输入框上方的「连续静音 2.5s」提示只有常量声明没有实现**（`SILENCE_HINT_MS`/`SILENCE_RMS`/`st.silentSince` 全是死代码），补 `trackSilence()` 接进每帧回调；③ **ASR 通道断开后 UI 卡在 `finalizing`**（原来延时 800ms 走 `finish('error')`，期间还发了一次 stop 帧），改为立即结束采集、**保留已写入的文字**、清草稿标记、条内提示「连接中断」。
- **扩展端交互**：输入区上方新增「录音条」（24 根纯 CSS 音量柱 + `mm:ss` 计时 + `✕ 取消` / `✓ 完成` + 状态位 `role=status aria-live=polite`），录音中给输入框加脉冲描边表达「这段文字还在变动」；草稿直接写入 textarea（textarea 无法局部着色），用户中途手改则**降级为只追加**（`dirty` 标记），取消时按 `insertAt`/`insertedLen` 配对回滚。定稿后**不自动发送**（微信 / 飞书 / ChatGPT 桌面同款）。`prefers-reduced-motion` 下取消动效。
- **快捷键 `Alt+V`（toggle）与录音态 `Esc`（取消，优先于「清空输入框」）**，三处触发通道：侧边栏内直接调 `toggleVoiceInput()`；网页内内容脚本拦截后转 `VOICE_TOGGLE_FROM_PAGE`；页面焦点但面板未打开时先走 `chrome.action.click()` 的用户手势传导，再在 `chrome.storage.session` 写一次性标记 `pendingVoiceStart`，面板初始化时 15s 内消费一次并自动开录。守卫 `isComposing`（输入法候选期）与 `repeat`（长按），并 `preventDefault()` 阻止 `Alt+V` 在页面输入框里打出字符。判定抽成 `matchVoiceShortcut(e)` 单一实现，侧边栏与单测共用，避免两处规则漂移。**不用 `chrome.commands`**：它带不了「当前面板 / 当前输入框」上下文，还要用户自己去 `chrome://extensions/shortcuts` 手工绑定，与开箱可用相悖。快捷键说明弹框（`Alt+/`）与 i18n（`voice.*` / `shortcuts.voiceInput` / `toolbox.asr*`）同步补齐。
- **模型分发**：内网无模型下载通道，模型包由有外网的机器做成「一目录一模型 + `manifest.json`」后打 zip 拷入，配置页「选择模型目录」就地注册（`POST /api/asr/models/pick`，仅回环地址可用、零上传）。制作命令、`manifest.json` 字段、sha256 生成脚本、12 类校验失败原因、内网 npm 镜像需放通的 8 个包，全部写进 [docs/Voice-Input-Local-STT.md](docs/Voice-Input-Local-STT.md)。
- **验证**：代理端 `cd agent && node --test test/unit` —— 新增 4 个文件（`asr-model-pack` 36 例 / `asr-session` 20 例 / `asr-routes` 21 例 / `asr-install-command`），全部通过；扩展端 `npx vitest run test/unit` —— 新增 4 个文件（`voice-input-draft` 14 例 / `voice-input-gating` 11 例 / `voice-input-shortcut` 15 例 / `voice-recorder-bar` 16 例），全部通过；`npm run build:silent` → BUILD_SUCCESS（`scripts/fix-build.js` 额外把 `voice-capture-worklet.js` 复制进 `dist/`，CSP `script-src 'self'` 下 `AudioWorklet.addModule` 只能用扩展内 URL，不能走 blob）。
- **未验证（如实标注）**：真机尚未跑过真实录音链路 —— 单测全部是注入假 recognizer / 假 ws / 假 media，证明的是状态机与契约；`sherpa-onnx-node` 的实际加载、RTF、RSS 峰值需要在内网机执行 `agent/test/manual/asr-probe.mjs` 取得。若探针判定该 N-API 包在目标机不可用，按预案切 `@huggingface/transformers` whisper（复用 RAG 已装依赖 + 本地目录加载，`allowRemoteModels=false`），仅重写 `engine.js` 与 `transcribe.js` 的引擎层，其余设计不变。

## 2026-10-25

### 工具超时参数横向收口：5 个裸 timeout 参数 + 统一归一边界表
> 来源：上一批修 `fetch_url.timeout` 时，我把 `manage_tab.loadTimeout` 记为「同一误用模式，待并入下批」。本轮先取证再动手，结果与原表述有两处出入，一并纠正。

- **纠正上批的记录**：`executeOpenTab` 里原本就有 `Math.max(1000, Math.floor(Number(loadTimeout) || 15000))`，即执行侧早有 1000ms 下限，并非「完全裸奔」。真正的缺口是 schema 无单位无描述（模型传 30 → 加载预算被压到 1s 必判超时）以及缺上限。
- **顺查反而揪出 4 个更严重的同族项**（执行侧连下限都没有，30 会直接变成「只等 30ms」）：`wait_navigation.timeout`、`wait_element.timeout`、`select_dropdown.timeout`、`interact_element.timeout`；另 `interact_element.waitTime` 也是裸声明。
- **统一归一源**（`src/shared/tool-timeout.js`）：`TOOL_TIMEOUT_BOUNDS` 集中 7 组边界 + `clampTimeoutMs()` —— 非数字/0/负数回落 fallback，越界钳到 `[min, max]`，小数取整。`normalizeFetchUrlTimeout` 改为委托同一张表，消除重复实现。`waitTime` 与 `timeout` 默认值不同（300 vs 2000），刻意分两组边界，避免共用时 `waitTime` 被抬到 2000。
- **执行侧接线位置是刻意选的**：background 三个（`executeFetchUrl` / `executeOpenTab` / `executeWaitForNavigation`）+ content 五个（`waitForElement` / `selectDropdown` / `clickElement` / `clickByText` / `interactByRef`）。内容脚本工具只能落在真正消费参数的函数里——`CONTENT_PAYLOADS` 透传与跨帧路由（`routeSingleRefTool`）是两条下发路径，只在 background 钳制会漏掉后者。
- **schema 侧**：5 个 timeout + `waitTime` + `waitForLoad` 补 `minimum`/`maximum`/`description`（明写 ms、默认值、越界钳制、语义边界：settle 预算 ≠ 请求超时）。
- **验证**：新增 `tool-timeout-params.unit.test.js` —— 19 条归一化边界 + 边界表自洽（fallback 必在区间内）+ 全工具模块 schema 契约扫描（任何新出现的名字含 timeout 的参数都必须有 `minimum` 与毫秒描述，防止同一坑再引入）；`content/interaction-tools` 补 3 条真实行为断言（`waitForElement`/`selectDropdown` 错误文案回显生效值 200ms 而非 30ms、`clickElement` 的 `waitedMs` 不被压到 30ms）。全量单测 **170 文件 / 2555 例全绿**（+2 文件 / +44 例），`eslint` 8 个改动文件无输出，`build:silent` → BUILD_SUCCESS。
- **未验证（如实标注）**：`executeWaitForNavigation` / `executeOpenTab` 的归一只有单测层的边界与 schema 保证，没有在真扩展里用 `timeout:30` 跑一次端到端（需真页面导航计时，属独立探针）。

### fetch_url 超时参数契约：毫秒语义写进 schema + 执行侧双向钳制
> 来源：控制台出现 `[Background] HTTP request failed: Error 请求超时 (30ms)`，用户追问「这个超时正常吗」。顺链路取证：该文案唯一出口是 `tool-executor.js` 的 `executeFetchUrl` → `fetchWithTimeout` 内部超时分支，`safeTimeoutMs` 就是模型传进来的 `timeout`。30ms 连一次公网 HTTP 往返都不可能完成，属参数误用而非网络抖动。

- **根因是 schema 契约缺失**：`fetch_url` 的 `timeout` 在 `storage-tools.js` 里原为裸的 `{ type: 'integer' }` —— 无单位、无下限、无描述。模型按「秒」理解而传 `30`，代码按毫秒执行即秒挂；`fetchWithRetry(..., 1)` 再退避约 1s 重试一次，两次都是 30ms，最终只留下一条控制台 error 与一条被浪费的工具调用。对照组是 `agent_exec` 的 `timeoutMs`（`minimum: 5000` + 延长语义说明）。
- **schema 侧**：补 `minimum: 1000` / `maximum: 120000` / `description`（明写毫秒、默认 15000、越界被钳制，并说明该预算只覆盖等响应头、不覆盖整包下载，慢接口应调大而不是盲目重试），让模型在传参前就知道契约边界。
- **执行侧**：新增 `normalizeFetchUrlTimeout()`（附 `FETCH_URL_TIMEOUT_DEFAULT_MS/MIN_MS/MAX_MS` 三个导出常量），`executeFetchUrl` 先归一再用 —— 0/负数/非数字回落 15000，小数向下取整，越界钳到 `[1000, 120000]`；执行日志与 `toolExec.requestTimeout` 文案统一改用生效值，不再回显模型给的裸数字（否则「请求超时 (30ms)」会继续误导排查）。schema 不参与执行，只靠它挡不住，两层必须同时有（与 `agent_exec` 那次教训同源）。
- **验证**：`fetch-url-network-scope.unit.test.js` 新增 `timeout 参数契约` 一组 —— 9 条归一化边界（含 `30`/`'30'`/`0`/负数/非数字/越界）、两条 `AbortSignal.timeout` 断言（真正下发 1000ms 与 15000ms，不是只测纯函数）、一条 schema 边界守卫（防止 `minimum`/单位描述被后来者抹掉）；全量单测 **168 文件 / 2511 例全绿**，`eslint` 三个改动文件无输出，`build:silent` → BUILD_SUCCESS。
- **未跟进（同类隐患，不在本批）**：`manage_tab` 的 `loadTimeout` 同样是裸 `{ type: 'integer' }`，与本次完全同一误用模式（模型传小值即加载超时），待并入下批处理。

### 真机探针收尾批次：取消作用域对齐 + 防重放进度不被误清 + 「已跳过重放」可见 + checkpoint 尾随落盘
> 来源：为「子任务中断现场续用」搭的真机端到端探针（Playwright 加载 dist + OpenAI 兼容假流）。前一轮它报过「假绿灯」，本轮重建后才第一次真正测到链路，随即暴露 5 项缺陷（前两项同属取消链路）。逐项回 HEAD 取证确认均为存量问题（非本批引入），再按 TDD 修复。

- **探针自身的两次误判先清算**（属仪器错误，如实留档）：① 断言「续跑 system 里没出现 marker」被当成回灌失败 —— 实际 marker 造在 `take_note` 的**入参**，而现场摘要按契约只取工具**结果** `observation`（`take_note` 的结果固定为「Note #N saved…」），结构上永不可能含 marker，属探针造法错误的**假红灯**；改断言口径为「落盘 `partialSummary` 原文是否被回灌」，并加 `!!sunkSummary` 前置防 `includes('')` 恒真变成新的假绿灯。② Node 侧假流曾以 `req.on('close')` 判客户端断开 —— `req` 是入站消息，请求体读完即 close，与断开无关，必须用 `res.on('close')`。
- **缺陷① 取消作用域只认根 key**（`state.js`）：同一模块两套口径 —— `isCancelled` 早已认派生 key（`startsWith(cancelledSession + '_')`），而 `cancelReactLoop` 只 `sessionAbortControllers.get(根key)`。子任务/子代理的在途请求登记在 `${root}_subtask_${i}` 上，点「停止」中断不了它们，中断现场也落不了盘。新增 `collectSessionCancelKeys(sessionId, knownKeys)`（根 key 优先、短 key 在前）统一两处作用域，并打出取消范围日志 —— 真机出现过「点停止后一个 key 都没命中」，不打这条就分不清是「没登记」还是「登记在别的 key 上」。
- **缺陷② 重置取消态顺手抹掉 fetch 登记**（`state.js`）：`resetReactCancel` 原本还 `sessionAbortControllers.delete(...)`，而它的两个调用点语义都是「去掉上一请求残留的取消标记」，其中主循环前那次发生在 `getOrCreateAbortController` **之后** —— 等于把即将用于本次 fetch 的 controller 抹掉，取消时必然扫不到任何 key（缺陷①的另一半）。改为只清标志；条目由下次同会话 `getOrCreateAbortController` 覆盖、全局取消时整体清空。
- **缺陷③ 取消那一轮把防重放进度一起清掉**（`react-loop.js`）：HEAD 里 `subtaskProgress.clear()` 排在取消判定**之前** —— 用户取消时整张进度表被清空，续跑即全量重放已完成子任务的写操作，而这正是防重放要防的事。抽出 `finalizePlanRound(progress, { cancelled, taskState, subtaskResults })`：取消时仍回写 `taskState` 各子任务状态，但保留进度不清空。
- **缺陷④ 「中断前已完成，跳过重放」对用户完全不可见**（`chat-manager.js` + `styles.css`）：三层取证给出决定性分工 —— SW 发出含跳过 2 条 / 面板收到含跳过 2 条 / DOM 零文案，且清单行被正常渲染成成功行。即消息通路和渲染都正常，缺口在渲染层**从来不读** `skippedReplay`（行标题按设计取 `message.subtaskName`，带跳过语义的 `nodeName` 不参与渲染）—— 回 HEAD 取证：`react-loop.js` 里 `skippedReplay` 已有 2 处，`chat-manager.js` 里 0 处，即字段一直在传、UI 一直未消费，属存量而非本批引入。新增纯函数 `isSubtaskReplaySkipped(entries, index)` + 清单行「已跳过重放」标记（悬停说明写清「写操作不会二次生效」、双语、颜色走主题 token）。**必须扫描而不是「取第一条」**：resume 场景同一 `subtaskIndex` 在 `executionLog` 里必然两条 `nodeType==='subtask'`，中断前那条排在前面。**刻意没改 `subtaskMainLog` 取法**（写方案时自查掉的回归）：跳过节点没有 `result`，让它顶掉中断前那条会把行里的「产出摘要」一起抹掉；这条约束反向钉进测试，防止日后改回顺手写法。
- **缺陷⑤ checkpoint 节流把带新数据的写直接丢弃**（`react-loop.js`）：HEAD 的节流分支就是「窗口内直接 return、什么也不补」（`throttlestreamskip`），真机一轮实录 6 次节流跳过，其中 2 次是 `subtask_partial_progress`（间隔 31ms/45ms）。危害不是「丢 1.5s」：`createSubtaskPartialProgressWriter` 只在**摘要内容真的变了**才回调，被挡下的那次携带的是新现场，而它要等下一次保存尝试才落盘 —— 下一次可能是整个子任务结束，SW 在此期间被硬杀就整段丢失。抽 `createCheckpointThrottle({throttleMs, persist, now, schedule, unschedule})`：窗口内的请求合并成**一次**尾随落盘（只更新原因、不重挂定时器，避免连续调用下永远推后的饿死）。三处 cancel 接线各自防一个新高危 bug：`force` 落盘撤尾随（同一现场不写两遍）、正常完成 `clearCheckpoint` 后撤尾随、`finally` 兜底撤尾随 —— 否则尾随定时器会把「已完成/已取消任务」的现场写回去，而 `final_answer` 不在 `TERMINAL_REASONS` 里，alarms 会据此自动重跑已完成任务。
- **两条守卫被变异实验验出是空转的**（写完后自己逼红才发现）：① 渲染接线守卫原用 `toContain('isSubtaskReplaySkipped(executionLog, si)')`，改成 `false && isSubtaskReplaySkipped(...)`（接线废掉）照样命中 → 改正则钉住「标记的唯一条件就是该判定」的三元结构；② 两处 cancel 接线守卫用不限长的 `indexOf(needle, anchor)`，撤掉近处那处会匹配到远处另一处，且「全文第一个 `} finally {`」基准根本不在本次循环上（文件里有四处）→ 改锚唯一语句 + 距离限窗（实测 141/100，跳走是 2029/1988）。教训：**源码结构守卫也必须过变异，否则只是把写错的断言固化成契约**。
- **真机结果**：探针从 17 项 1 红走到 **18 项 0 红**，无降级断言。关键读数 `progressKeys:["s1","s2","s3"]`、`progressSuccess:["s1:ok","s2:ok","s3:no"]`、续跑增量 `SUB1+0 SUB2+0 SUB3+2`、SW `skipping replay` ×2、回灌命中 `true,true`、清单行标记期望行 `[0,1]`/实得行 `[0,1]`、完成后本轮残留 checkpoint `[]`。
- **已知不足（不拿调低阈值装成已达标）**：① 尾随 flush「硬杀时少丢多少现场」未量化，只有单测证调度语义（真机 4 次排定中 1 次到期补齐、其余被 force 覆盖，两者都是正确行为，故不做成断言）；② 缺陷② 的代价（不再删登记后 Map 条目只增到下次覆盖/全局清空）仅静态分析，未做泄漏量化测试；③ 假流的 plan_task 计划形态简单，真实多策略（parallel/dependency）组合下的跳过语义未覆盖。
- **文档同步**：docsite 源与 repowiki 的 ReAct 页各三处 —— 「checkpoint 节流保存」补上尾随落盘语义、「防重放」补两条（跳过可见标记 + 取消不清进度）、「检查点保存」补尾随合并与三处必须撤下尾随的后果；重跑 `npm run build:docsite` → 通过 7 项校验、索引 136 页（产物 `docs/wiki` 为资产哈希联动：138 M / 57 D / 62 ??，与上一批同形态，无意外删除）。README/DOCUMENTATION 无新增功能项，未动特性计数；`.wiki/` 里没有节流/防重放相关表述，无需同步。
- **当日收口（全部实测）**：全量单测 **160 文件 / 2406 例全绿**（本批 +2 文件 / +24 例）、`npm run lint` exit 0、`build:silent` BUILD_SUCCESS；变异复验本批 **12/12 被逼红**（可见性 M4–M7 四例、节流 N1–N8 八例，脚本 `test-results-probes/_mutation-check-skip-visible.py`、`_mutation-check-throttle.py`），每个变异跑完即还原且 `md5` 与备份逐一相符；真机探针 exit 0。

### 收尾批次：L-b / L-d / L-e 三项「择机」遗留 + 对比度改真实渲染态实测
> 来源：上批商定「择机」的三项。开工前先逐条对源码/真值复核，结果两项与评审（以及我此前的转述）说法不一致。

- **L-b 原表述不成立（我此前未核对就写进了变更记录）**：所谓「`120min` 与设置页『2 小时』不同形」不存在 —— `options.html` 的 `reactLoopTimeout` 是 `type="number" max="120"` 输入框，单位标签就是「分钟 (min)」，`config-manager.js` 按 `/60000` 换算，页面上从来只有「120 分钟」。`formatDurationMs(7200000) === '120min'` 与设置页 **同形**。教训：评审转述的结论也必须核到源码，不能当作已知事实传播。
- **L-b 真正要修的是亚秒谎报**：`formatDurationMs` 对 <1s 向下取整，999ms 显示 `0s`，文案会读成「已用 0s，预算 120min」，用户据此判定一秒都没跑就被杀。现改为非零亚秒显示 `<1s`，真零（及负数/NaN）仍显示 `0s`（把 0 也写成 `<1s` 是另一种谎报）。另新增一条可执行的「单位对齐」守卫：从 `options.html` 解析 `max` 与 `unitMinute` 标签，断言满额配置读出来必须是 `Nmin` 形态 —— 设置页单位一旦改小时/秒而文案不改，本例必须红。
- **L-d 窗口取法有两个方向的错**：旧写法把窗口右界取成「下一个 `async function`」。① 函数体内先出现 async 辅助函数时窗口被截短 → **响亮地假失败**；② 更严的是反向：若紧随其后的是非 async 的 `function`，`indexOf('async function')` 会一路越过真实边界，把后一个函数的内容也算进来 —— 把 `onDone` 搬出 `executeSingleSubtask` 仍全绿（**静默假通过**）；③ header 改名后 `fnStart === -1`，`slice(-1, n)` 取到文件尾巴仍可能凑出命中。改为花括号配平取真函数体（扫描时跳过 行注释/块注释/字符串/模板串），并补 `expect(body).not.toBeNull()` 与「体内不得出现下一个顶层函数声明」两道验伪。另写 3 例合成源码用例作为窗口取法本身的拟合记录，其中一例直接跑旧公式并断言它越界 —— 证明新守卫不是空转。
- **L-e 实测比评审说的严重得多**：评审只说「⊘ 约 2.8:1」。新建浏览器探针 `test-results-probes/_subtask-stat-contrast.mjs`：在真实扩展 origin 加载 `side_panel.html`，按渲染实际结构搭祖先链（`.message.assistant` 气泡底 > `.subtask-progress` 6% 半透明紫底），读 computed color 并逐层合成底色，按 WCAG §4.2 实算。结果：**亮色主题下四个统计全部不达标** —— 总数 2.64、✓ 2.11、✗ 3.83、⊘ 2.64（暗色均达标）。即 ⊘ 不是孤例，✓ 比它更差一倍。
- **修复（全部用现有 token，不自造色号）**：`.subtask-stat-total` / `.subtask-stat-other` → `--text-secondary`；`.subtask-stat-done` → `--success-strong`；`.subtask-stat-fail` → `--danger-strong`（`--*-500` 是偏浅状态色档，`--*-strong` 才是项目给文字用的档）。浏览器复测：亮色 5.33 / 4.21 / 5.07 / 5.33，暗色 7.90 / 10.08 / 5.33 / 7.90。
- **已知不足（不拿调低阈值装成已达标）**：✓ 取 `--success-strong` 后在**没被紫底污染的纯 `--bg-surface`** 上是 4.54:1（达 AA），被 `.subtask-progress` 的 6% 紫底合成拉到 **4.21:1**，仍短 0.29。再往上压需要改 `--success-strong` 本身（全仓 37 处共用，含作背景/描边的用法），属设计系统级改动，不在本批。守卫对该项卡 4.0（断掉「改回 `--success-500` → 2.11」的回归），并单独断它在纯 `--bg-surface` 上≥ 4.5，把「差在哪」写进注释与探针输出。
- **守卫不重复评审的错**：旧的单测断的是 token **名字**（`toMatch(/var\(--text-tertiary\)/)`），恰好把缺陷锁成契约。新守卫从仓库真值实算：styles.css 取 token 名 → theme.css 取亮/暗真值 → 统计行落点从 `.subtask-progress` 的 `rgba(var(--x-rgb), a)` 与 `--bg-surface` 解析并合成 → 算对比度，不写死任何色号。实测值与浏览器探针逐位一致（5.33/4.21/5.07），两条通道互相校验。
- **顺带发现（未修，需拍板）**：项目自带的 `scripts/theme-contrast-check.py` **只对暗色 token 算对比度**，亮色文本档无门禁 —— 这是 `#999` 的 `--text-tertiary`（紫底上 2.64:1）长期无人发现的根因。补亮色分支会带出全仓一批存量违规，属独立批次。
- **文档**：本批不改动架构叙述（repowiki/docsite 无 `120min`/`⊘`/超时单位相关失效表述），故未重跑 `build:docsite`（避免无内容变更的哈希抖动）。
- **验证**：全量单测 **157 文件 / 2369 例全绿**（+5）、`npm run lint` exit 0 无输出、`build:silent` 通过；浏览器对比度探针 exit 0（亮/暗各 4 项）；**L 批次变异复验 7/7 被逼红**（还原后 RESTORE_OK + 34 例绿，脚本 `test-results-probes/_mutate-verify-le.sh`）：删亚秒分支 → 1、零也显示 <1s → 1、⊘ 改回 tertiary → 1、✓ 改回 500 → 1、✗ 改回 500 → 1、三桶共用 token → 2、分钟改小时 → 2。
- **真机端到端仍未做（没找替代糊弄）**：「长子任务被中断 → checkpoint 落盘 → SW 回收 → alarms 自动续跑 → `[Partial progress before failure]` 回灌进 prompt」这条链需要真模型端。核查 `test/e2e/` 只有内容脚本/UI 级 fixture，**没mock LLM 的 SSE harness**；e2e helpers 里也没。搭它需要起一个 OpenAI 兼容假流 + 写入扩展配置 + 驱动 plan_task，而子任务预算下限 60s / 预留下限 30s 意味着至少 60s 真实计时，属独立工程。本轮只完成了可在浏览器里定的那部分（渲染态配色/构造）。

## 2026-10-24

### 代码评审修复批次：read_image 安全闸门 + 流式收口欠账清算 + 6 项局部缺陷
> 来源：针对 10-23 全部 15 个提交的代码评审，逐条对源码核验确认后按 TDD 修复（新增/扩展 7 个测试文件，全量单测 153 文件 / 2280 例绿）。

- **Critical① 改名迁移补登**：`read_document_image → read_image` 漏登 `TOOL_NAME_MIGRATION`——曾显式保存勾选的老用户存储里是旧 ID，新工具不再下发且下次保存被宇宙清洗不可自愈。补映射条目 + `gettools-vision-gate` 回归。
- **Critical② read_image path 安全闸门**：path 来源构成「任意工作目录文件 → 外部视觉端点」外泄通道（代理沙箱对工作目录永远放行 + 扩展侧零类型校验 + 工具属不可信内容入口无需确认）。新增 `shared/image-signature.js`：声明 mimeType 不可信，按 magic bytes（png/jpeg/gif/bmp/webp）硬校验 + 5MB 字节上限，非图片一律拒绝；agent 来源快照取图同口径纵深防御。参数契约补齐：两源同时给出显式二选一报错、`path` 非字符串/全空白拒绝、`image` 序号字符串归一（"1" 等同 1，不再误报越界）。
- **流式收口三项欠账**（`chat-client.js`）：① SSE 每轮 read 与空闲计时器 race（默认 120s，与主循环 `STREAM_IDLE_TIMEOUT_MS` 同口径），headers 后卡流不再永久悬挂；② 非 2xx 读取并回传响应正文（网关报错根因只在 4xx body 里），压缩 toast 经 `compactErrorDetail` 解析 `error.message` 展示真实原因；③ SSE 内 `error` 数据抛异常不再吞成 `empty_summary`；④ `TextDecoder` 改 `{stream:true}` + 尾 flush，修复跨块多字节字符被切开出 U+FFFD 污染摘要/反思 JSON。新增 `compaction-error-surface`（压缩链路行为级 3 例）+ `aux-chat-call-guards`（辅助调用收口扫描守卫，防后续重新硬编码）。
- **划词工具栏交互锁**：`toolbarInteracting` 无界锁——页外释放时 document 收不到 mouseup 工具栏永久粘死；复位监听改模块级单例（mouseup + window blur 幂等注册），`hideToolbar` 内置复位；消除语言切换重建时匿名监听器在 document 上线性累积。
- **xlsx 绝对 Target**：OOXML 关系 Target 允许 `/xl/...` 绝对形式（部分导出器如此），旧拼接一律加 `xl/` 前缀拼出 `xl/xl/...` 静默抽 0 张；三处统一走 `resolveRelTarget`。
- **助手编辑器**：技能 `inheritMode` 判定改宽松判等（历史助手 `skillIds` 为 undefined 不再误显示「已选 0/N」）；MCP 分类切换补置 `inheritMode=false`（与其余勾选路径口径一致）。
- **侧边栏拖拽**：`drop` 入口恢复无条件 `preventDefault`，未识别拖拽形态不再放行浏览器默认投放（可能导航/替换侧栏页面）；视觉深读失败也携带后端正文（与压缩链路口径一致）。
- **验证**：全量单测 153 文件 / 2280 例、ESLint 0 告警、`build:silent` 通过；UTF-8 跨块用例做旧写法负向对照验证有效。
- **二次评审跟进**（安全/健壮性收口）：① `read_image` 抽出 `guardDownloadedImageBase64` 让来源二（`file+image` 落盘路径）与来源一（`path`）同过「5MB 体积闸门 + magic bytes」，堵住来源二只判类型不判大小的漏挡（新增回归）；② SSE 空闲超时单一来源化——`stream-controller.js` 的 `STREAM_IDLE_TIMEOUT_MS` 改为从 `shared/chat-client.js` 的 `DEFAULT_STREAM_IDLE_TIMEOUT_MS` 导入再导出，消除两处 `120000` 硬编码漂移风险；③ 移除划词工具栏 `unbindInteractingReset` 死代码（复位监听按设计随 content script 生命周期常驻，无拆除调用点）。跟进后全量单测 154 文件 / 2288 例、ESLint 0 告警、`build:silent` 通过。

### 子任务时长与中断现场：放开 15 分钟硬封顶 + 节点三桶计数 + 已完成节点摘要回灌
> 背景：侧边栏子任务清单出现「ReAct 循环总超时 (900000ms)」中断，且面板报「80/83 完成，1 个节点失败」这种 80 + 1 ≠ 83 的对不上号。逐条对源码核验后按 TDD 修复（新增 2 个测试文件 + 同步 2 个旧契约文件）。

- **A 超时预算放开**（`react-loop.js`）：子任务曾被 `SUBTASK_LOOP_TIMEOUT_MS = 900000` 硬封顶，设置页「整体循环超时」（默认 2h）对子任务完全无效——用户把预算调到最大仍会在 15 分钟被杀。删除该常数，`computeSubtaskLoopTimeoutMs(parentRemainMs, configLoopTimeoutMs)` 改为 `min(配置上限, 父实时剩余 - 10s)`（保留 60s 下限）；两处调用（首跑 / 完成度校验重跑）都把配置上限传进去，未注入父预算的 `dispatch_task` 子代理回退配置值而非分钟数。
- **B 节点统计三桶**（`chat-manager.js` + `styles.css`）：旧口径 `totalNodes` 收所有节点，而 ✓ 只数 `success`、✗ 只数 `failed`，用户拒绝敏感操作确认（cancelled）、被取消的 API 调用、终止时残留的 processing 节点计入总数却两头不算。新增 `classifySubtaskNodeStats` 保证恒等式 `success + failed + other === total`（脏条目并 other），面板补可点击的 ⊘ 统计（含中英文提示与独立配色），`toggleNodeFilter` / `applyNodeFilter` 接 `other` 过滤。
- **C 已完成节点摘要回灌**：核验发现 `buildSubtaskPartialSummary` 本就存在，但**唯一调用点**在重试耗尽的最终失败返回（只给父模型看）；子任务进度表 `subtaskProgress` 只记「整子任务成功」终态，既不落盘已完成节点现场，也不回灌给子任务自身——重跑/恢复对自己的上次零知情，等于从零重做。新增 `recordSubtaskPartialProgress`（实时日志回调按新增成功工具节点数节流写入，不降级覆盖成功记录）+ `buildSubtaskResumeContext`（重试与自动续跑注入「不要重做」续跑段落），随父 checkpoint 落盘；`shouldSkipSubtaskReplay` 保持只认 `success === true`，防止被中断的长子任务被误当已完成而静默丢失。
- **D 中断原因文案**：超时文案原来只报预算毫秒数不报实际耗时，且「不含澄清等待时间」漏了「敏感操作确认等待」（两者都走 `pauseLoopTimer` 豁免）。改为 `已用 {elapsed}，预算 {timeout}`（新增 `formatDurationMs`：整分钟不带小数、非整分钟一位小数、不足一分钟按秒）+ 豁免项写全，中英文同步。
- **旧契约同步**：`react-loop-upgrade-wiring` 中明文断言「超时仍 15 分钟封顶 / `SUBTASK_LOOP_TIMEOUT_MS = 900000` 存在」的 4 例按新契约重写（本次要改的行为本身，非回归）；`subtask-checkpoint-replay` 的函数体窗口断言取 12000 魔法长度，因函数体合法增长假失败，改为按「下一个 `async function`」取真实边界。
- **文档同步**：repowiki 与 docsite 的「子任务整体超时上限 15 分钟」表述改为只由设置页决定，补「中断现场续用」条目；源码残留注释「各享满额 15 分钟」同步修正。
- **验证**：全量单测 156 文件 / 2318 例全绿、ESLint 0 告警、`build:silent` 通过。
- **RED 实录更正**：新增 29 例中 28 例失败（「父剩余过小时仍保留 60s 下限」一例旧实现即满足，作为回归护栏保留），此前记作「10/10 与 19/19 失败」属过度声明。

### 代码评审跟进批次：子任务中断现场的接线补强
> 来源：对本批 4 项改动的整体评审（含两轮变异实验：故意摘除接线再跑全量）。评审判定「需修后合并」，无 Critical、3 High。

- **High①「假绿灯」清算**：评审用变异实验证明，摘除 C 项的两处接线调用（实时写入 + 续跑注入）后全量 2318 例仍全绿——`toMatch(/recordSubtaskPartialProgress\(/)` 命中的是函数**定义行**。据此新增可测 seam 与 `test/unit/subtask-progress-wiring.unit.test.js`（26 例），接线守卫从「存在性 toMatch」改为**精确计数**（定义 + 唯一调用 + 结果真的进 prompt / 上报字段）。二轮变异复验：摘除注入、摘除耗尽回写、摘除两处落盘触发、摘除首跑写入 —— 四种变异逐一被逼红（此前三种完全无红）。
- **High② 超时读数自相矛盾**：`elapsedTime` 是含暂停的墙钟，而豁免靠「加长预算」实现，于是「已用 100min，预算 120min（等待不计入）」必然自证矛盾。新增 `computeLoopTimeoutReport` 一次算清墙钟/等待/有效已用/是否超阈，展示改取 `usedMs`，文案补 `{paused}`（中英文）；`getRemainingTime()` 同源改走该读数，消除三处重复算式。
- **High③ 现场不落盘**：`subtaskProgress` 此前只由「整子任务成功」等 6 个既有时机间接带走，而 C 的目标场景（长子任务全部未成功即被打断）恰好一次都碰不到 → 内存摘要随 SW 回收丢失。`progressHooks` 新增 `onPartial`，写入器返回「本次是否真的写入」，只在现场变化时触发 `saveCheckpointNow('subtask_partial_progress')`（不传 force，复用既有 1500ms 节流）。
- **Medium② 尾量与耗尽路径**：每 5 个成功节点一写 → 中断点前最后 0~4 个必漏；且重试耗尽时那份**最完整**的摘要只拼进给父模型的字符串、不回写进度表，子任务自身重跑仍零知情。新增 `buildSubtaskFailureResult`（回写完整现场 + 复用同一份摘要上报，顺带去掉双份序列化）；完成度校验重跑的回调也接同一写入器，二次尝试的新进展不再白烧。
- **Medium① 三桶渲染守卫**：`toMatch(/subtask-stat-other/)` 单次命中即过，删掉 failed 分支的 ⊘ 仍全绿 → 改为按出现次数锁定「三个分支各一处 + 均为 `otherNodes > 0` 条件渲染」。
- **Low① 旧正则失去约束力**：`/recorded\s*&&\s*recorded\.success/` 现在只命中纯函数体，把跳过判定改回 `if (recorded)`（会误跳过进行中记录）也不会红 → 改锚 `if (shouldSkipSubtaskReplay(recorded))` 并补该纯函数的行为断言。
- **Low② 文档产物未重跑**：`docs/wiki` 是 git 跟踪的构建产物，只改了 `.docsite-src` 会留下线上 wiki 仍写「子任务整体超时上限 15 分钟」→ 补跑 `npm run build:docsite`（138 页为资产哈希引用联动、57 个 pagefind 分块重排，内容变更仅 ReAct 页）。
- **搬移引发的既有守卫同步**：`subtask-partial-outcome`（失败上报内联三元上提到 seam）与 `take-note-scratchpad`（便签段组装移入 seam）两条源形状守卫按新位置改写；seam 内保持 `parentBudget?.notes` 原写法，使便签不变量的表达不被放宽。
- **评审确认为正确设计（未改动）**：预算三重保护纯函数化、逐子任务实时读父剩余、`shouldSkipSubtaskReplay` 严格 `success === true` 不被进行中记录稀释、写入不降级覆盖成功记录、B 项未改动成功率分母（≥80% 判定与改前逐位等价）。
- **未做（已知遗留）**：M3 父预算 10s 收尾缓冲过薄 + parallel 下各子任务近乎各享满额父剩余；L3 repowiki 33 处源码行号引用漂移（建议改符号锚点）；L4 续跑段落注入上一尝试不可信工具输出未做包裹；L5 `formatDurationMs` 亚秒显示 `0s`、2h 显示 `120min`。
- **验证**：全量单测 157 文件 / 2346 例全绿、`npm run lint` 0 告警、`build:silent` 通过；变异复验记录见 `test-results-probes/`。

### 第二轮整体评审修复批次：C1 字段契约致命缺陷 + H1/H2 + M1~M5
> 来源：对上一批全部改动再做整体评审（恰好派发 1 个 CodeReview 子代理），评审判定 **1 Critical**；逐条对源码复核并先用临时探针测试取得运行证据后确认。范围经人工确认为「C1+M4+M5 一批，H1+H2 紧随」，与 C1 同根的 M1/M2/M3 一并处理。

- **Critical C1 现场摘要读错字段（整条链路在生产中从未生效）**：`buildSubtaskPartialSummary` 的准入是 `e.result != null`，而内层循环成功落定的 `tool_exec` 节点把产出正文写在 **`observation`**（全部 4 处 `executionLog.push` 与 2 处就地更新都不写 `result`；旁证：`react-reflection.js` 读 `e.observation` 并注释为 "result summary"）。于是摘要恒为 `''` → 进度表零写入 → `onWritten`/`onPartial` 从不触发 → `[Partial progress before failure]` 段永不出现 → 续跑段落永不注入。上一轮「四种变异逐一被逼红」的记录**是真的但没有意义**：变异只摘接线，对字段契约零抵抗力；测试 fixture 又自造了生产不存在的 `result` 字段，所以「进度表真的写进去了」这类行为断言全绿。取证：临时探针测试逐字段照抄生产节点，跑出 `expected '' to contain '页面正文-ABC'`（文件已删）。修法为改读 `observation`（保留 `result` 兜底），并把 `subtask-partial-outcome` / `subtask-progress-wiring` 的 fixture 全部改成逐字段照抄生产形状。
- **M2 节点口径**：摘要不再只看 `status === 'success'`，同时限定 `nodeType === 'tool_exec'`，与「工具产出」这一语义口径对齐（避免 api_call 的响应体被当作产出回灌）。
- **M1 写入节流永久哑火**：原按「成功工具节点计数增量 ≥ 5」节流，但 `trimExecutionLogMemory`（窗口 1000）先裁剪、回调后触发，窗口滑满后计数会回落，`done - counted < every` 恒成立 → 长子任务跑到窗口上限之后**一次都不再写**。改为以「现场内容变化」为条件（`createSubtaskPartialProgressWriter` 缓存上次摘要做差异判定），删除 `countSuccessfulToolNodes` 与 `PARTIAL_PROGRESS_EVERY_NODES`。
- **M3 重试趟覆盖现场**：重试趟的执行日志从零重建，直接整条替换会让落盘现场只剩最后一次尝试的尾部。新增 `mergePartialSummaryLines` 做有界按行去重合并（keep-first + 尾部保留 `maxNodes` 行）。
- **M4 不可信内容注入面**：C1 修好后回灌摘要成为活口——上一尝试的工具输出（网页正文等）会未经包裹拼进 system prompt。`buildSubtaskResumeContext(record, sessionKey)` 复用模块内已导入的 `wrapUntrusted('subtask_previous_attempt', ...)`，并显式声明该块是数据而非指令；`composeSubtaskInheritedContext` 新增 `sessionKey` 形参并在调用点透传 `sessionId`（nonce 与 tool 消息同源）。
- **H1 父预算超售**：硬封顶移除后每个子任务都按「取快照那一刻的满额父剩余」领取预算，parallel 首波即可吃干父预算，超时从子任务层转移到父任务层（父任务在汇总前被杀）。`computeSubtaskLoopTimeoutMs(parentRemainMs, configLoopTimeoutMs, pendingSubtaskCount)` 新增分摊：并行按并发池波次数、顺序按剩余个数；并留出比例化收尾预留（剩余的 5%，夹在 30s~5min）；`Math.min(..., hardCap)` 确保预算**绝不超过**父实际剩余——原先的 60s 固定下限在父剩余仅 30s 时会越权。
- **H2 重跑那一拍恒被红线拒绝**：`onDone` 在完成度取证**之前**就写 `success: true`，而 `recordSubtaskPartialProgress` 的红线是 `existing.success === true → return ''`，于是二次尝试的新进展既不落表也不落盘。新增 `appendAfterSuccess` 追加模式（只追加 `partialSummary`，不动 `success`/`result`/`retryCount`，防重放红线不破），重跑回调走 `writePartialProgress(rerunLog, { appendAfterSuccess: true })`。
- **M5 集成范式落地方式**：评审建议「真 `executeSubtasks` + mock `reactLoop`」。核查后未照抄——`subtask-checkpoint-replay` 实际绕开 `reactLoop`（只测 skip 路径，注释明写「避开真实 reactLoop 网络路径」），仓库无全链路 harness；`executeSubtasks` 直接调用同模块导出的 `reactLoop`，ESM 绑定不可从外部 rebind；搭建需打桩 SSE 流/工具执行/checkpoint DB，成本与脆性均高。改为新增闭环组合测试（写入器 → 进度表 → 继承上下文 → prompt，另含「无现场不得凭空出现 previous attempt」与「JSON 反序列化为普通对象后仍能读出现场」两条可逆用例），并保留少量精确计数守卫；已在测试文件头注释中如实声明未做全链路 harness 及原因，本轮撤掉 1 条冗余存在性正则。
- **单一来源化**：`react-loop-upgrade-wiring` 的 P1-8 曾把同一组预算毫秒再写一遍，新契约下触发 4 例真实回归（`expected 6900000 to be 7190000` 等）。该文件收敛为只锁方向性关系（`budget <= remain`、`budget < plenty`）与接线正则，具体数值归 `subtask-timeout-budget`。
- **文档同步**：repowiki 与 docsite 的「超时与预算」改为分摊+比例预留+不越权口径，「中断现场续用」补 observation 字段来源/内容差异节流/去重合并/不可信包裹四条；重跑 `npm run build:docsite`。
- **验证**：RED 批次合并 16 例失败（其中 `subtask-timeout-budget` 整文件因正则字面量触发 rolldown 解析歧义而加载失败，改 `new RegExp` 后正常）；GREEN 后全量单测 **157 文件 / 2364 例 0 失败**、`npm run lint` exit 0 无输出、`build:silent` 通过。**变异复验 8/8 被逼红**（还原后 RESTORE_OK，脚本 `test-results-probes/_mutate-verify.sh`）：回退 C1 → 18 红、M2 → 2、M1 → 8、M3 → 1、M4 → 4、H2 → 2、H1 越权下限 → 1、H1 不分摊 → 1。首轮脚本 8 行只印标签不印结果，根因是 vitest 输出含 ANSI 码使 `grep -E "^ +Tests "` 行首锚定失效，加 `sed 's/\x1b\[[0-9;]*m//g'` 后正常。
- **实施过程中的自我纠错**：M3 用例原写 `expect(merged).toContain('产出-1')`，而 `'产出-1'` 是 `'产出-11'` 的子串——绿得没有意义；改为整行同时匹配 `工具3`+`产出-3` 与 `工具11`+`产出-11`。
- **未做（本轮商定「择机」）**：L-b `formatDurationMs(7200000) === '120min'` 与设置页「2 小时」不同形；L-d `indexOf('async function')` 取函数体窗口右界可被一个 async 辅助函数悄悄截短；L-e ⊘ 统计用 `--text-tertiary` 对比约 2.8:1。真机（Chrome）验证未做。（→ 已在上方的「收尾批次」处理完；其中 **L-b 的「2 小时」表述经核对不成立**，见该节第一条）

## 2026-10-23

### 辅助 LLM 调用流式收口：修复企业网关非流式报错
> 背景：反思/预筛选/压缩/转述等辅助调用曾硬编码 `stream:false`，部分企业网关会在非流式请求上追加 `stream_options` 导致 stream/stream_options 不匹配报错。

- 新增 `shared/chat-client.js` 统一收口：跟随配置页流式总开关发起，静默聚合 SSE 后返回与非流式完全相同的 `{ choices, usage }` 形状，下游解析零改动；接线反思×2、工具预筛选、上下文压缩、批量摘要、视觉深读/转述全部辅助调用。
- **react-loop 协议/UI 解耦**：子任务曾强制 `streamEnabled:false`，本意只关 UI 推送却连带降级 API 协议；拆开 `apiStreamEnabled`（协议层，父/子统一生效）与 `uiStreamEnabled`（推送层，子任务用静默 `sendFn` 阻断）。
- **划词工具栏飞书 bug**：富文本编辑器在 mousedown 阶段程序化清选区，工具栏在 click 派发前已隐藏致按钮全部点不了；新增 mousedown→mouseup 交互窗口期抑制 selectionchange 隐藏与 iframe 清选区上报（含 4 例复现单测）。
- **侧边栏知识库工具丢失与纯文本拖拽误判**：代理离线时同步隐藏 `knowledge_*`；纯文本拖拽不再被误判为文件上传，改手动光标插入。
- **上下文压缩失败原因上屏**：`compactErrorDetail()` 把 `http_x`/`empty_summary`/超时映射为可读文案进失败 toast。
- **助手编辑器搜索过滤**：工具/技能列表支持名称+描述搜索（150ms 防抖、一键清除）与「只看已勾选」；状态迁移到渲染缓存单一真相（抽出纯函数 `agent-tool-filter.js`），全选/计数/保存全部改读缓存；RAG 知识库工具并入可选集。技能列表同步支持。
- `read_image` 改名 ripple 与按需下发等其余条目见下方同日各节（其中 `tool-executor.js` 的「`path` 越权由代理沙箱兜底」方案存在扩展侧闸门缺失，已于 10-24 评审批次修正）。

### `read_document_image` → `read_image`：图片深读工具泛化，支持代理端任意路径
> 需求：原工具只能读会话文档附件里的图片。升级为通用图片深读入口，新增“代理端任意图片路径”来源——AI 可用 `agent_exec` 跑系统命令（如 `screencapture`）生成截图落到工作目录，再用本工具传路径加载进视觉模型分析。方案：本轮只做代理端路径来源（远程 URL / 内置桌面截图 API 后置）。

- **工具契约**：`read_document_image` 改名 `read_image`；参数改为两种**互斥来源**二选一——文档附件（`file` + `image` 序号）或代理端图片（`path`）；`required` 置空，由 handler 校验。`description`/`path` 说明明确引导：相对路径按工作目录解析、也支持绝对路径与 `~`；建议 AI 把生成的截图存到工作目录。纯插件端改动，不新增代理端代码。
- **Handler（`tool-executor.js`）**：抽出公共尾段 `analyzeImageWithVision(dataUrl, question, toolCallId)`（压缩→配置回落链→视觉调用）；`executeReadImage` 优先判 `path` 走 `AgentClient.downloadFile(path)`现拉→复用同一尾段；文档来源（`file`+`image`）逻辑逐字不变。`path` 越权读由代理端 `/api/fs/download` 已有的 `checkPath` 沙箱兜底（工作目录内永远放行，目录外需 `allowedPaths`）；新增错误文案 `docImageNoSource`（两源皆缺）/`docImagePathFailed`（离线或越权）。
- **改名 ripple**（同口径全同步）：`tool-executor.js` 下发门控 + `TOOL_HANDLERS` 注册表、`locales/zh.js`+`en.js` 工具名、`untrusted-content.js`（仍列为不可信内容）、`tool-panel.js` 勾选过滤、`doc-images.js` 清单工具用法行（中英）。门控口径不变：仍仅“图片识别总开关”开启时下发。
- **验证**：`tool-read-document-image` 文档来源回归全数迁移至 `read_image`，新增 path 来源 3 例（`downloadFile(path)` 被调不查快照 / 取图失败含 path 不调视觉 / 两源皆缺参数错）+ 修正 `beforeEach` 清 `downloadFile` 调用记录；`gettools-vision-gate`、`doc-images-describe` 清单断言同步改名。全量单测 150 文件 / 2244 例、`build:silent` 通过。

## 2026-10-22

### 文档附件图片识别（Word/PDF/Excel 内嵌图片 → 视觉转述 + 按需深读）
> 需求：上传 Word/PDF 让 AI 能「看见」文档里的图片。双运行形态（有/无本地 Agent）下均可用。方案文档：`docs/superpowers/specs/2026-10-22-document-image-recognition-design.md`；实施计划：`docs/superpowers/plans/2026-10-22-document-image-recognition.md`。

- 新增：文档附件图片识别——上传 Word/PDF/Excel 时自动抽取内嵌图片，经视觉模型转述为文本供 AI 阅读（受“启用图片识别”总开关控制，不新增配置项）；新增 `read_document_image` 工具支持 AI 按需深读文档图片（结果按不可信内容包装）；连接 Agent 时 docx 图片抽取落盘 `_attachments/`、跨会话可继续读取。
- **Agent 端（仅 docx 落盘抽取）**：零依赖 ZIP 读取器（EOCD 反向扫描 + central directory + stored/deflate，不新增依赖）；`documents/image-extractor.js` 按 `document.xml` 的 `r:embed` 出现顺序编号抽 `word/media/*`（MIME 白名单，wmf/emf 计入 skipped）；`/api/documents/extract-images` 端点经 checkPath 安全校验，限 50MB，损坏文件归入 parseFailed。
- **插件端（docx+pdf 浏览器抠图）**：`doc-images.js` 新增——docx 用 jszip（新增依赖）；pdf 用 pdfjs `getOperatorList` 抓 `paintImageXObject` + RGBA 校验 + 扫描件兜底（低文本页 4×4 采样判非白）；`compressForVision` 5 轮降级（quality 0.65→0.2 后缩尺寸，仍超 200KB 弃）；视觉配置回落链同截图工具（image* → 主配置），仅 apiBase 必需（兼容本地无鉴权视觉服务）；前 2 张转述 + 全量清单块注入消息；Agent docx 端点失败自动降级浏览器本地抽取；图片链路任何失败不阻断文本主链路。
- **xlsx 浮动图片（浏览器端抠图）**：`extractXlsxImagesFromFile` 沿 `workbook.xml`（sheet 声明序）→ `workbook rels`（rid→worksheet 文件）→ `sheet rels`（drawing 文件）→ `drawing`（`xdr:twoCellAnchor`/`oneCellAnchor` + `xdr:from` 锚点定位）→ `drawing rels`（rid→media）→ `xl/media/*` 逐层解析，按 sheet 顺 + anchor 顺编号；清单块以 `〔图片N｜工作表{sheet}!{cell}`（A1 表示）定位；单元格内嵌图（rich value / `vm` 属性）不在范围；旧版 `.xls` 非 zip 安全空返；复用既有压缩/转述/快照中转/`read_document_image` 全链路，工具与 Agent 无需改动（Agent 端点仍仅 docx，xlsx 走本地分支）。
- **上传即处理提速（并发转述 + 增量落地 + 提前退出「提取中」）**：`describeImages` 前 2 张由 `for` 串行改 `Promise.all` 并发（最坏 2×60s 压到约 60s），新增 `onEach` 逐张回调（乱序完成即回调）；`runImagePipeline` 借 `onEach` 增量写入 `imageDescriptions`，发送时可直接用已完成部分、不必等全部转述完成；`processFile` 在文字抽取完成（`status='done'`）后立即 `renderFilePreviews`，图片转述期间预览不再假显示「提取中」而挤出文件名。纯插件端改动，Agent 与工具无需改动。测试：`describeImages` 并发+乱序回调 1 例、`runImagePipeline` 增量写入 1 例。
- **快照中转与工具**：发送链路（chat-manager `sendMessage` 与 prompt-manager `sendPromptByCode` 双链对齐）写入 `_docImageSnapshot`（chrome.storage.local，4MB 预算从最旧 session 整条淘汰）；session 删除同步清理；`read_document_image(file, image, question?)` 内置工具：local 来源直读快照 dataUrl，agent 来源经 `downloadFile` 现拉落盘图，深读文本经 `UNTRUSTED_CONTENT_TOOLS` 分类包装。**按需下发门控**：图片识别总开关关闭时不下发该工具（getTools 过滤链 + tool-panel 勾选清单同口径）——开关关则附件抠图不产出图片、快照必空，省 schema token；工具不以 `agent_` 前缀命名故不受 Agent 连通性过滤，浏览器模式（无 Agent）下靠快照 dataUrl 独立可用。
- **验证**：新增 8 个测试文件 66 例（zip-reader/extractor/route 15+ 例、浏览器抠图 12 例（含 xlsx 5 例）、转述/压缩/清单/快照 17 例（含 xlsx 工作表定位 1 例）、file-extract 接线 12 例（含 xlsx 走本地分支 1 例）、快照接线守卫 4 例、工具行为 8 例、逐字节回归基线 4 例：开关关闭与零图时注入文本与旧格式逐字符不变、按需下发门控 4 例）；全量单测 147 文件 / 2204 例、agent 533 例、`build:silent` 通过。

## 2026-10-20

### 文件产物声明识别 + 聊天内可点击文件路径
> 用户反馈：AI 通过脚本动态生成的文件（如导出的 `浏览器书签分类分析_2026-10-20.xlsx`）在「文件产物」面板里识别不到；回答里提到的文件路径也希望能直接点击定位。方案文档：`docs/superpowers/specs/2026-10-20-artifact-declaration-and-clickable-path-design.md`；实施计划：`docs/superpowers/plans/2026-10-20-artifact-declaration-and-clickable-path.md`。

- **产物声明识别（提示词零成本 + stat 兜底防幻觉）**：系统提示词引导 AI 用文本约定 `[[artifact:路径|说明]]` 声明脚本产物；`artifacts-manager.js` 新增纯函数 `parseDeclaredArtifactsFromText`（解析声明）/`mergeDeclaredArtifacts`（与静态分析结果按路径去重合并、标 `source: 'static'|'declared'`）/`buildArtifactsForMessage`（静态分析地板 + 声明补缺口），三处产物点（`addMessage` 非流式 / `finalizeStreamingMessage` 流式 / `rebindArtifactsButton` 切会话回灌）统一接入；声明项经 `dataset.declaredArtifacts` 持久化，回灌时复用现有 `validateArtifactsAsync` stat 校验剔除幻觉/已删文件。不加工具、不遍历目录、不改 Agent 端。
- **显示期剥离标记**：`markdown-render.js` 新增 `stripArtifactMarkers`，`formatMarkdown` 渲染前剥离 `[[artifact:...]]` 标记（仅用于产物解析，不展示给用户）；未命中标记时原样返回，保护代码块空行保真。
- **聊天内文件路径可点击定位**：`markdown-render.js` 新增 `extractPathCandidates`（提取路径候选，兼顾类 Unix/Windows/相对路径，去 URL/去尾标点/去重）、`applyFilePathLinks`（TreeWalker 遍历文本节点转 `.chat-file-link`，产物可信路径直接转链接、其余候选 fail-closed 校验：仅在解析到工作目录根内且 `CHECK_FILES_EXIST` 返回存在才转，防误链与跨空格切词）、`bindFileLinkDelegate`（幂等点击委托，复用 `workspace-panel.js` 的 `locateFileInWorkspace` 在侧边栏自带的工作目录面板定位并高亮）。因 `markdown-render.js ↔ workspace-panel.js` 循环依赖，相关符号走 `await import()` 动态导入破环。
- **i18n 与样式**：新增 `chat.fileLinkTitle`/`fileLinkFailed`（zh/en）；`.chat-file-link` 用品牌色 token `--brand-500` + 下划线 + hover 底色。
- **验证**：新增 `artifact-declare-linkify.unit.test.js` 19 例（parse/merge/build 纯函数、system prompt 注入守卫、三处产物点接线守卫、`extractPathCandidates`/`applyFilePathLinks` 含 fail-closed 与不跨空格切词负向例）+ `markdown-strip-marker.unit.test.js` 扩至 6 例（含「无标记不折叠代码块空行 / 有标记才整理」回归）；相关单测 + `build:silent` 通过。

### RepoWiki 文档官网（VitePress + Pagefind 静态站）
> 需求：把 Qoder RepoWiki 生成的全站中文技术文档做成可托管到 GitHub Pages 的文档官网。方案文档：`docs/superpowers/specs/2026-10-20-repowiki-docsite-design.md`；实施计划：`docs/superpowers/plans/2026-10-20-repowiki-docsite.md`。

- 新增 RepoWiki 文档官网：`npm run build:docsite` 一键将 Qoder RepoWiki（134 篇）构建为 VitePress + Pagefind 静态站并发布到 GitHub Pages `/ai-helper/wiki/`（离线中文全文搜索 + mermaid 渲染 + 目录树导航），产物入库 `docs/wiki/`。

## 2026-10-19

### 消息跳转（问题列表定位感：统一口径 + 当前高亮 + 钉住 + 实色面板）
> 用户反馈：用户问题导航列表（编号条目 + 上一个/下一个 + 点击定位）有没有优化空间。核查后确认三处硬伤：列表完全没有「当前在哪」的提示；▲▼ 与列表是两套口径（箭头按混合消息列表走、列表只按用户提问编号，编号点了跳不对）；列表半透明穿透且移出即收起，长列表没法读。方案文档：`docs/superpowers/specs/2026-10-19-message-jump-navigator-design.md`。

- **口径统一为「问答组」**（新增 `utils.js` 纯函数 `buildMessageJumpGroups`/`findActiveGroupIndex`/`resolveJumpTarget`/`formatQuestionPreview`）：一次提问 + 其后所有回答为一组，首条提问之前的内容并入首组，无提问的历史会话整体成一组；`jumpToMessage` 与问题列表共用同一分组，列表编号与按 ▲▼ 落到的位置严格对应。
- **当前定位**：面板展开时高亮当前组条目（品牌色 + 14% 底 + 左侧指示条），头部由「10」改「3 / 10」，当前条目自动滚进列表可视区；`#chatContainer` 滚动经 rAF 节流实时同步；组数变化（流式新增提问）时重建列表防高亮错位；面板已展开时再次进入只同步不重建。
- **钉住**：点击把手切换 `pinned`，钉住后移出不收起、`Esc` 取消；头部加纯文字「钉住/取消钉住」按钮；非钉住时点击条目立即收起让位正文；收起延时 200→300ms。
- **视觉与死代码**：面板底 `rgba(--surface-rgb,.78)`+blur 改实色 `var(--bg-surface)`、边框/阴影升档；条目取消 `nowrap` 改 `-webkit-line-clamp:2` + `text-overflow:ellipsis`（原来 JS 40 字 + CSS 再截一刀只剩十几字；新版 Chromium 130+ 把所有 `-webkit-box` 的 computed 值转成 `flow-root`，省略号改由 `text-overflow` 驱动，缺它则只压行数、第三行被 `overflow:hidden` 硬切不画省略号，已经真实 Chromium 截图取证）、宽度 280→300px；把手 8→10px 便于点击；删除当时从未渲染的 `.chat-nav-question-empty`（二期搜索无命中时按真实空态重新启用）。
- **i18n**：新增 `chat.navHotzoneTitle`/`navPinLabel`/`navUnpinLabel`/`navPosition`（zh/en），把手 `title="消息跳转"` 硬编码改 `data-i18n-title`。
- **Header 固定可见**：面板原先自身是滚动容器，列表一滚「问题列表/钉住/位置」整行就被推走。改为面板 `display:flex; flex-direction:column; overflow:hidden`，条目收进新增的 `.chat-nav-question-list`（`flex:1 1 auto; min-height:0; overflow-y:auto`）里滚动，Header `flex:none` 不参与压缩。列表区 flex-basis 必须是 `auto` 不能是 `0`：真实产品面板只有 `max-height:62vh` 没有显式 height，auto 高度的纵向 flex 容器按子项假设主轴尺寸定高，basis 0 会让列表对面板高度贡献 0、整个列表塌成 0 高只剩 Header（首版写 `1 1 0` 实机复现过，因当时 e2e 给面板内联了固定高而漏测；已补真实约束回归例并对 `1 1 0` 做变异验证转红）。列表 HTML 从 `index.js` 内联模板提取为 `utils.js` 的 `renderQuestionListHtml(groups, activeIndex, isPinned)`，e2e 因此直接驱动产品级 DOM。转义改用已有的 `escapeAttr`（`escapeHtml` 走 `document`，且不转义引号——用户提问里的 `"` 会破坏 `title`/`data-message-id` 属性）。
- **快捷键文案同步口径**：跳转单位已变成问答组，但快捷键表还写「跳转到上一条/下一条消息」。改为「跳转到上一个/下一个问题」（`shortcuts.gotoPrev`/`gotoNext`），▲▼ tooltip 同步为「上一个/下一个问题 (Alt+↑/↓)…」（`chat.navPrevTitle`/`navNextTitle`），en 侧 `previous/next question`；`side_panel.html` 的行内 `title` 兜底与表格 `<td>` 默认文本、`docs/zh|en/DOCUMENTATION.md` 与 `.wiki/Configuration*.md` 的 `Alt+↑/↓` 行一并改掉；顺手删除全仓无引用、说法过时的重复死键 `shortcuts.prevMessage`/`nextMessage`。把手名「消息跳转」保留（它是入口功能名，含 Ctrl/Cmd 回顶/到底）。
- **验证**：新增 `message-jump-navigator.unit.test.js` 57 例（TDD 先红后绿，对「组数变化重建」与属性转义做变异验证）+ 真实 Chromium `message-jump.e2e.spec.js` 10 例（用真实布局证明跳转编号与当前组反查一致、面板 alpha=1、两行截断由 CSS 画省略号且渲染高度恰为整数行、暗色实色、列表滚动时 Header 位置不变、面板无显式高度时列表区不塌成 0；Header 例经「面板改回自身滚动」、塌高例经 `flex:1 1 0` 变异确认均会失败）；全量单测 136 文件 / 2038 例、全量 e2e 48 例、`build:silent`、`theme:contrast`/`theme:check` 通过。（当时悬停/钉住接线仍在 `index.js` 初始化闭包内、只有源码守卫断言，已在下方「二期」抽出独立模块并用真实鼠标/键盘补齐）。

### 消息跳转 · 二期（键盘可达 + 列表搜索 + 提问时间/附件预览 + 真实交互 e2e + 接线抽模块 + 收起/焦点冲突修复）
> 承接一期，盘点「还有优化空间吗」后落地 A/B/C 三档：A=设计文档自认缺口（键盘不可达、无真实交互测试、边界无反馈）、B=增强（条目悬停显示提问时间、图片/附件显示预览、Header 搜索过滤）、C=清理（孤儿键、`aria-current`、既有 `line-clamp` 补 `text-overflow`）。

- **接线抽模块**（新增 `src/side_panel/message-jump-nav.js`）：把把手悬停/钉住/跳转接线从 `index.js` 初始化闭包提取为可 `import` 的 `initMessageJumpNav()`，返回 `{ jumpToMessage, updateActiveQuestion, handleEscape, isPinned }`；`index.js` 缩为一行 `const navApi = initMessageJumpNav();`，`Esc` 分支走 `navApi.handleEscape()`、`Alt+↑/↓` 走 `navApi.jumpToMessage()/updateActiveQuestion()`。抽模块是为让 e2e 能用 esbuild 打成 IIFE 后以真实鼠标/键盘驱动产品代码（一期只有源码守卫断言）。
- **A1 键盘可达**：`side_panel.html` 把手补 `role=button tabindex=0 aria-pressed=false` + `data-i18n-aria-label`；聚焦即展开、`↑/↓/Home/End` 在条目间移动、`Enter/Space` 钉住切换、`Esc` 收起（有搜索词时先清词）；`.chat-nav-hotzone:focus-visible` / `.chat-nav-question-item:focus-visible` 加品牌色描边。
- **A3 边界反馈**：`jumpToMessage` 返回 `'jumped'|'blocked'|'noop'`，到顶/到底时 `flashNavBlocked` 给 ▲▼ 加 `blocked` 类播放 `chatNavShake` 抖动（`prefers-reduced-motion` 下降级为静态 ring，不抖）。
- **B4 提问时间 / B5 附件预览 / B6 搜索过滤**（`utils.js` 纯函数 `formatNavTime`/`getQuestionPreview`/`filterJumpGroups`，`renderQuestionListHtml` 加 `query` 参）：提问时间放条目**右侧独立列**（当天 `HH:MM`、跨天 `M-D`）——`.chat-nav-question-item` 改横向 flex，文本 `flex:1 1 auto; min-width:0` 占剩余宽度两行截断、时间 `flex:none; white-space:nowrap` 不被压缩且与首行同基线（若浮在文字上方会与 line-clamp 争位、遮挡正文，故选独占列）；无文字的图片/附件消息预览首个文件名（多附 `+N`）或「N 张图片」；组数 ≥ `NAV_SEARCH_MIN_GROUPS(6)` 时 Header 下渲染搜索框，按问题文本过滤且保留原始组序，命中为 0 显示 `.chat-nav-question-empty` 空态。
- **中文输入法修复 + 时间列位置调整 + 折行对齐修复**（用户反馈）：（a）搜索框此前每个 `input` 事件都整体重建 `innerHTML`，中文/日文拼音上屏前的组合期 `input`（`isComposing=true`）会销毁正在组合的 input，导致拼音永远转不出汉字只剩字母——改为组合期短路、`compositionend` 提交后才过滤（并加 `navQuery` 同值早退避免重复重建）；时间从「问题下方一行」改到右侧独立列（见上条 B4）。（b）序号原本内联在被 clamp 的正文节点内部，导致长提问折行的第二行回退到 x=0、顶到序号下方而非与第一行文字左对齐——把序号提为正文的 flex 兄弟列（`.idx{flex:none;min-width:14px}`），条目改 `align-items:baseline` 让序号/时间与首行同基线，折行第二行自然与第一行左对齐（新 e2e 用 `Range.getClientRects` 量真实行盒回归）。
- **C7/C8/C9 清理**：删全仓无引用的孤儿键 `chat.navEmptyLabel`；当前条目补 `aria-current=true/false`；`.kb-bubble-hit-text` 与记忆条目两处既有 `-webkit-line-clamp` 补 `text-overflow:ellipsis`（同 Chromium 130+ 省略号驱动口径）。
- **修复「收起即弹回」真 bug**（`message-jump-nav.js`）：`Esc`/点击条目收起时把焦点交回把手，会触发把手 `focus→showChatNav` 重新展开；且 `hideChatNav` 的 `navContainsFocus` 守卫使点击条目（条目获焦）后根本收不起。新增 `suppressFocusExpand` 标志位 + `collapseChatNavReturningFocus()` helper，`focus` 监听先判抑制位；`item-click` 非钉住分支与 `handleEscape` 都改用该 helper。由二期 e2e 的 `Esc` 用例暴露。
- **修复列表“跟随当前项”与用户手动滚动/滞动跟随的双向冲突**（`message-jump-nav.js`，用户反馈）：`paintActiveQuestion` 原本每次重绘都无条件 `activeItem.scrollIntoView({ block:'nearest' })` 把列表滚到“当前项”。两个方问题：（a）钉住后在长列表里点跨度大的条目会“跳动/点不中、甚至跳回上一个”——用户手动滚列表时对话并未滚动、当前项仍是旧的，任一次面板 `mouseenter`/chat scroll 重绘就把列表拽回旧当前项。（b）但首版只用“指针或焦点在面板内”作为屏蔽条件（`userInPanel`），反而引入新 bug：点过条目后焦点会滞留在条目上（在面板内），导致之后鼠标移到对话区滚对话时，“当前项不露出”（高亮会跟但列表不滚）。最终改为**只看 `pointerInPanel`**（面板 `mouseenter/leave` 维护）：指针在列表上时不拽（避免打断手动找目标），指针移到对话区时（`mouseleave` 已清除标志）正常跟随露出当前项；并显式断言不得掺入“焦点在面板内”判定。由两条交互 e2e 分别回归（“钉住后手动滚列表不被拽回”与“点击条目后移开鼠标滚对话当前项仍露出”，各自去掉守卫/掺回焦点判定即转红，已变异验证）。
- **i18n**：新增 `chat.navSearchPlaceholder`/`navNoMatch`/`navQuestionImageCount`（zh/en），更新 `chat.navHotzoneTitle` 提及键盘；新增 `shortcuts.navOpenByTab`/`navListArrows`/`navPinToggle`/`navEscCollapse`，`side_panel.html` 快捷键表 + `docs/zh|en/DOCUMENTATION.md` + `.wiki/Configuration*.md` 键盘表补 `Tab`/`↑↓HomeEnd`/`Enter·Space`/`Esc` 四行。
- **验证**：`message-jump-navigator.unit.test.js` 57→87 例（新增 `formatNavTime`/`getQuestionPreview`/`filterJumpGroups`/`renderQuestionListHtml(query)` 纯函数例、键盘可达/`blocked` 守卫例、`index.js` 接线集成守卫、IME 组合期不重建、时间右列 flex 与序号独立列（正文不再内嵌序号）守卫、列表跟随只看 `pointerInPanel`（含“不得掺入焦点判定”负向断言）与 `pointerInPanel` 标志接线守卫；「删除空态死样式」例翻转为「空态样式存在且被 utils 引用」）+ 新建真实交互 e2e `message-jump-interaction.e2e.spec.js` 9 例（esbuild 打 `initMessageJumpNav`+`buildMessageJumpGroups` 成 IIFE，真鼠标 hover 展开/移出收起/钉住保持、键盘 Tab 聚焦展开+`ArrowDown/End` 移动、搜索「第5」过滤到 1 条焦点回搜索框、**中文输入法组合期不销毁输入框上屏后才过滤**、`Esc` 先清词后退钉住收起、末组 `next` 返回 `blocked`、**钉住后手动滚列表不被“跟随当前项”拽回**、**点击条目后移开鼠标滚对话当前项仍露出**）+ `message-jump.e2e.spec.js` 新增折行第二行与首行左对齐的行盒量测例；全量单测 136 文件 / 2072 例、全量 e2e 48→58 例、`build:silent`、`eslint`(src+test) 0、`theme:check`/`theme:contrast` 通过。

### 配置页（推理循环「配置说明」与实际字段对齐）
> 用户反馈：说明文案与当前配置项对不上。核对后修正两处失真、补一处缺失。

- **超时设置**：文案从笼统的「防止长时间等待」改为明确列出页面上实际存在的三项——API 请求 / 整体循环 / 工具执行超时。
- **澄清等待**：补注「自动暂停计时，非配置项」——该机制仍在 `react-loop.js` 运行（`totalPausedDuration`），但早已不在页面暴露，避免误导成可调参数。
- **敏感操作确认**：新增说明条目（页面实有该开关，原文案漏讲）。`options.html` + zh/en 两份 locale 同步。

### 反思机制（超时优化：评估/修订解耦 + 重试 + undefined/10 修复）
> 用户反馈：质量评估 30s 超时失败、执行日志面板头部评分显示 `undefined/10`。根因是评估调用被迫在响应里输出完整修订答案，长答案下非流式生成远超 30s。方案文档：`docs/superpowers/specs/2026-10-19-reflection-timeout-optimization-design.md`。

- **评估/修订解耦**（`react-reflection.js`）：评估调用只输出评分 JSON（新增 `buildRevisionPrompt`/`parseRevisionAnswer`），仅低分时发起独立修订调用；修订失败降级为「保留原答案 + 需改进」，不再整条反思判失败；修订以 `reflectionType:'revise'` 子节点记入日志。
- **超时/重试代码内配置（不开放 UI）**：`constants.js` 的 `postReflection` 新增 `timeoutMs:90000`/`reviseTimeoutMs:150000`/`maxRetries:2`，模块导出 `REFLECTION_FETCH_DEFAULTS` 供旧 storage 残缺配置回落；替换原硬编码 30s/1 次。
- **undefined/10 修复**：失败反思条目显式 `overallScore:null`；`chat-panels.js` 面板头部得分块判空显示「—」。`parseReflectionResult` 兼容字符串数字分数。
- **验证**：新增 `react-reflection-flow.unit.test.js` 11 用例（TDD 先红后绿）；全量单测、`build:silent` 通过。

### 消息 footer 工具条（对齐与字号统一）
> 用户反馈：Token 标签/产物/评分/收藏一排按钮水平不齐、字号不协调。根因：控件高度混用（22/24/26px）、字号混用（11/12px）、评分徽章直角而 Token 标签胶囊、emoji 基线偏高。

- **统一控件规格**（`styles.css`）：footer 全部按钮（执行日志/产物/原型/收藏/分叉/删除/复制/导出）固定 `height:20px; padding:0 4px`，文字统一 11px，图标 14px。
- **评分徽章胶囊化**：与 Token 标签同规格（20px 高、10px 圆角）；emoji 包 `.reflection-badge-emoji`（10px、line-height:1）修正基线，`chat-manager.js`/`chat-streaming.js` 两处渲染点同步。
- 窄屏媒体查询下 Token 标签改固定 18px 高。

### 主题（side-rail 五个入口按钮暗色适配：实心彩色块改低对比 tinted）
> 用户反馈：右侧轨道入口按钮在暗色下是悬浮的亮色块。原实现虽走 token，但 0.85 实心底在暗色 token 提亮后更扎眼。

- **tinted 风格**（`styles.css` 4 个 toggle + `schedule-panel.js` 内联样式）：底色改 `rgba(var(--语义-rgb), 0.14)`、图标改语义 strong/brand-600，hover 升至 0.24；移除 `opacity:0.85` 整体透明与重彩阴影，替换定时任务按钮硬编码 `rgba(31,145,80,.85)`。
- **守卫**：新增 `side-rail-tinted-style.unit.test.js` 防回退；`theme:contrast`/`theme:check` 通过。

### Agent 质量（完成度校验自动重跑回路 + 取证契约结构化 + 缺项渲染修复）
> 承接 10-18 的子任务完成度取证校验器，本次把它从「只上报不断言」升级为可自动重跑的闭环，并修复取证文案与渲染缺项。

- **自动重跑回路**（`react-loop.js`/`completion-verifier.js`）：`annotateOneSubtaskCompletion` 接通 Phase B 重跑，四闸门（可重试 / 有进展 / 有预算 / 未超次）真实计算后驱动子任务回炉；新增 `isStrictSubset` 严格真子集判定——缺项集不单调收缩即停止重跑防振荡。取证逻辑下沉至 `executeSingleSubtask`，DOM 类按派生 `sessionId` 动态解析工作 tab。
- **命令取证三档门控**：命令类 `doneCriteria` 新增 `readOnlyGate` 参数，重跑模式下改由 agent 侧 allow/confirm/deny 三档门控，与只读硬拦两种取证模式并立；`ai-tools` 的 `doneCriteria` 描述同步说明。
- **取证契约升级为结构化对象**：返回值从三态 `true/false/null` 改为 `{available, pass, reason}`；内容脚本各分支补机器可读 `reason` 码（`invalid_selector` 等），新增 `summarizeEvidenceDetail` 按判据写法 / 通道异常 / 混合分桶生成提示，`verifySubtaskCompletion` 透传 `checkResults`。
- **缺项渲染与文案修复**：新增 `describeCriterion` 按 `check` 类型展示 `expected`，修复 `text_contains` 等只显示 `target` 丢失关键值；拆分 `evidence_unavailable` 与 `evidence_partial` 独立文案，不再把「未能求值」误述为「取证通道不可用」；诊断日志降为 debug 级。
- **选项页**：新增「完成度自动重跑」子开关，切换时联动展开 / 收起；`constants.js` 加 `rerunEnabled` 配置项，`config-manager` 加载回填。
- **验证**：agent 单测 + 根目录全量测试全绿，eslint 0，`npm run build:silent` 成功。

### 主题（暗色修复：配置页 Toast/保存按钮等把前景语义 token 当底色用，暗色下浅底白字）
> 用户反馈：暗色下点「保存配置」后按钮变绿与顶部 Toast 颜色和亮色一致、白字不可读。根因：options 页 token 化时漏接专为浮层底色设的 `--toast-*` token，直接引用了前景语义 token（`--success-strong`/`--danger-500` 等暗色下刻意翻浅）作 background。

- **新增 `--fill-*` 实心语义底色 token**（`src/shared/theme.css`）：`--fill-danger/info/warning` + `--fill-danger-strong`（hover 加深档），亮色 danger/info 沿用原 `--*-500` 值零回归，warning 改深琥珀 `#b45309` 顺带修复亮色白字对比度不足；暗色取深饱和档与 `--toast-*` 同一校准逻辑。
- **配置页 Toast 全量接线**（`src/options/styles.css`）：`.toast` 底色 `--text-primary`→`--toast-neutral`，success/error/warning/info 分别换 `--toast-success`/`--fill-danger`/`--toast-warning`/`--fill-info`，与侧边栏 Toast 实现完全对齐。
- **保存按钮 saved 态**：渐变起点 `--success-500`→`--toast-success`（亮色两端仍为绿色系，暗色下深绿底白字可读）。
- **同类误用顺带清账**：options 页配对代理按钮 delete/disconnect/enable 的 hover 实心底、`.toolbox-btn-warn`、记忆条目 compact 按钮 hover；侧边栏扫描后补修 `.context-usage-btn.primary`、发送按钮 `.send-inner-btn.stop-mode`（hover 原 `--danger-soft-text` 越悬越浅，改 `--fill-danger-strong` 越悬越深）。
- **保持不动**：状态圆点/进度条填充/flag 轨道等无文字叠层的语义色用法（暗色翻浅正是可见性设计）；`--*-soft-bg` 系作底已有暗色深档，均无问题。
- **验证**：`npm run build:silent` 成功；改动均为 CSS token 引用替换，无 JS 逻辑变更。

## 2026-10-18

### 主题切换（亮 / 暗 / 跟随系统）：全站语义 token 化与三态即时同步
> 重做上次失败的主题尝试（当时“很多组件颜色调得不协调”）。本次以语义 token + 脚本批量映射 + 暗色客观验收重建，避免靠肉眼难以发现的不协调残留。

- **双主题 token 层**：`src/shared/theme.css` 定义 `:root` / `html[data-theme="dark"]` 两套语义 token（约 62 个：text-*/bg-*/border-*/brand-*/状态色 *-soft 变体/overlay-rgb 通道等）；侧边栏、选项页、内联样式、Markdown/Mermaid 全量迁至 `var()` 引用，硬编码字面量清零。
- **三态读写与同步**：`src/shared/theme.js` 提供 `getTheme/setTheme/getResolvedTheme/subscribeTheme/initTheme`；storage 键 `appTheme`，`system` 态跟随 OS `prefers-color-scheme`；`onChanged` 跨页同步，任一处切换其余页面无需刷新；localStorage 镜像已解析态消除暗色首帧白闪。
- **批量迁移工具链**：`scripts/theme-migrate.py`（direct/contextDispatch/rgbaFamilies/bands/whitelist 映射，apply + `--check` 零残留门禁）与 `scripts/theme-contrast-check.py`（token 对比度门禁）保障一致性与可回归。
- **两个入口**：选项页「基础」→「外观」三分段控件；侧边栏顶部「更多」菜单「主题：当前态」按 亮→暗→跟随系统 循环；文案随语言/主题动态刷新（i18n `settings.theme*` / `header.themeToggle`）。
- **划词浮层主题化**：`selection-toolbar-styles.js` 重写为自带 token 子集（注入宿主页面读不到扩展 `:root`），本地解析生效主题不污染宿主 `<html>`；由独立开关 `selectionToolbarFollowTheme` 控制是否跟随（关闭恒亮）。
- **导出锁定亮纸张**：PDF / Word / HTML 导出与富文本复制（SVG `fill` 属性 / canvas `fillStyle` / jsPDF / html2canvas 等 `var()` 无效上下文）恒为白底黑字不随暗色，保证离线可读；均加头注释与行内注释说明。
- **验收**：`test/unit/mermaid-theme.unit.test.js` 等新增单测；真扩展暗色探针验证跨页同步、Markdown/Mermaid 联动、逐浮层对比度扫描（34 浮层 + 骨架）与白斑检测均 0 违规（WCAG AA）。
- **当日收口（全部实测）**：根目录全量 **119 文件 / 1765 测试全绿**，agent 单测 **503 例全绿**（本次不动 agent 进程），eslint 0，`npm run build:silent` 成功；`theme-migrate.py --check`（白名单外源码 CSS + `src/**/*.js`）exit 0，对比度门禁 0 项未达标。
- **暗色遗留项顺带清账**：主题切换合入后陆续修复暗色下未主题化的滚动条（Markdown 代码块水平条 / 表格横向条 / 工具调用与结果 `pre` 垂直条过粗）、Toast 对比度与弹窗输入框底色，以及 `theme.js` 健壮性 / 子菜单 / 门禁的代码评审补充。

### Agent 质量（新增子任务完成度独立取证校验器：`plan_task` 子任务的客观验收，默认关时行为逐字节不变）
> 为 `plan_task` 分解的子任务引入可选的完成度客观取证校验——用真实 DOM / 命令证据而非模型自述判断子任务是否达成。

- **纯判定内核**（`src/shared/completion-verdict.js`）：三态 verdict（`satisfied`/`unmet`/`indeterminate`）+ 四闸门回炉判定（AND）+ judge `goalMet` 类型护栏。
- **客观取证**（`content/advanced-tools.js`）：`doneCriteria` 断言用 `deepQuerySelector`/`deepGetText` 穿透 Shadow DOM / 同源 iframe，`selectorQueryable` 探语法合法性，三态 `available` 不谎报未达标。
- **background 端接线**（`completion-verifier.js`/`react-loop.js`）：collector 单条取证超时；`annotateOneSubtaskCompletion` 在 per-subtask `onDone` 内即时取证（现场最新、尽力而为不中断主循环），仅上报 `completionNote` 不重跑不改 `st.status`。
- **门控与持久化**：`doneCriteria` 移出静态 schema，按开关在 `getTools` 门控注入；`executePlanTask` 透传 / 回显按开关裁剪；设置页开关 + storage 持久化 + 导入导出白名单。

### 选项页（反思配置从独立 Tab 合并至推理 Tab）
- 移除独立反思 tab 导航与面板，将反思总开关 / 后置反思 / 子任务反思配置项并入推理 tab；反思可见性改为 `display` 显隐控制二级开关，持久化统一为 `persistReflectionField` 辅助函数；删除 `styles.css` 约 200 行反思专属样式。
- 中英文 locale 移除 `tabReflection` 并调整描述文案；单测 `validTabs` 移除 `reflection`，tab 下限调为 7。

## 2026-10-17

### Agent 能力（新增 `take_note` scratchpad 工具：让模型主动落中间推理便签并在上下文压缩中存活）
> 底账二长线项。此前分析指出：Agent 缺“记笔记”的显式通道（对标 Claude Code 的 `TodoWrite`、Manus 的 `todo.md`），`buildPlanAnchorMessage` 只覆盖了“有 `plan_task` 时的进度锚点”，普通长任务中间推理状态仍靠“历史摘要 + 卸载文件”。本次新增一个极轻量的 `take_note` 工具，让模型在无 `plan_task` 的普通长任务中也能主动落便签。

- **独立顶层工具**：`tools/agent-tools.js` 的 `AGENT_TOOLS` 新增 `take_note`（`content` 必填 + 可选 `label`），经 `constants.js` 单一数据源自动流入 `RAW_TOOLS`/`BUILTIN_TOOLS`/UI；`tool-executor.js` 新增 `executeTakeNote`（只做入参校验 + trim + 单条 500 字符截断，不持有 loop 状态）并登记进 `TOOL_HANDLERS`。因 `take_note` 经拦截改写 loop 作用域状态，设 `parallelizable: false`（对齐 `plan_task`）：否则同内容在 TTL 内命中结果缓存被早返回、先于拦截而静默丢便签。
- **安全分类**：`take_note` 结果是模型自产文本，显式归入 `untrusted-content.js` 的 `KNOWN_SAFE_TOOLS`（与 `plan_task`/`dispatch_task` 同组）；穷举分类守卫（新增工具必须显式二选一）把关。
- **存活机制（照抄计划锚点同构）**：`react-loop.js` 新增作用域级 `let notesState`；便签不写入消息历史正文，而是由 `buildNotesAnchorMessage` 在上下文压力裁剪块之后**瞬态回注**（压缩裁不掉）；take_note 结果被拦截并入 `notesState`（FIFO ≤50、锚点从最新往旧逐条累加至 800 token 预算（上限 20 条、保尾弃头））；checkpoint 落盘与恢复回灌白名单同步加 `notesState`。
- **子任务语义（隔离 + 只读继承）**：`notesState` 是每个 `reactLoopImpl` 作用域的独立变量（含子任务递归），父/子/并行子任务各持一份 → **结构性隔离、并行零竞态**；子任务经 `Inherited Context` **只读**拿到父笔记（最近 10 条），自己的新笔记**不上并**回父（notes=作用域内草稿、result=跨作用域契约）；子任务不落 checkpoint（沿用现成 subtask-gate）。
- **默认启用边界**：新装/从未保存过配置的用户自动启用；已有自定义 `enabledTools` 的用户不自动 backfill（尊重显式禁用），可在工具 UI 手动勾选。
- **守卫**：`test/unit/take-note-scratchpad.unit.test.js` 20 例（注册接线/安全分类/handler 行为/锚点与回灌源不变量/子任务隔离）+ 负向对照（未分类假工具被同一守卫判红、笔记锚点块不含 `!isSubtask` 且与计划锚点门控形成对照）。
- **验证**：根目录全量 **107 文件 / 1638 测试全绿**，eslint 0，`npm run build:silent` 成功；已复核 `dist/assets/background.js` 含 `take_note`。纯扩展侧逻辑改动，无需重启 agent。

## 2026-10-17

### 安全（命令分级防绕过补漏：特权前缀 / 重定向 / 路径变形 / 过度拦截）
> 防绕过 / 防误杀 / 档位语义 / 一致性 四维静态矩阵（43 例）实测 29/43，暴露 11 个绕过 + 3 个过度拦截。逐条先在 `command-security-check.unit.test.js` 以正确期望落为回归（先红后绿），再修复转正。

- **GAP-1 特权前缀不再给绝对禁止项发降级通行证（P0，9 条）**：`collectCommandScopes` 的 `COMMAND_WRAPPERS` 原本只含 `nohup/time/env/…`，不含 `sudo/doas`——于是 `sudo rm -rf /usr`、`sudo mkfs`、`sudo dd of=/dev/sda`、`sudo sh -c "rm -rf /usr"` 因段首黑名单正则看不见被 `sudo` 挡住的破坏命令，降级为 `confirm`（点一下确认或关确认开关即执行）。修：把 `sudo/doas` 纳入剥壳，且 `stripCommandWrappers` 改为 `peelCommandWrappers` **逐层**剥壳并递归送检——既保留 `sudo …` 中间形态（灰名单 sudo 仍可见，避免 `nohup sudo apt install foo` 被一步剥到底反而丢确认），又让最内层 `rm -rf /usr` 暴露到黑名单。
- **GAP-4 管道喂给带特权前缀的解释器（P0）**：`curl … | sudo sh` 因管道右侧多了 `sudo` 从 `deny` 降为 `confirm`（管道黑名单整串匹配 `\|\s*(ba)?sh` 不容前缀）。修：管道正则容忍可选 `sudo/doas/runas` 及选项 token 前缀。
- **GAP-3 重定向覆盖系统文件不再只锚行首（P0）**：`> /etc/passwd` 类黑名单 `^\s*>` 只匹配以 `>` 开头的串，`echo x > /etc/passwd` 判 `allow`。修：重定向正则改为 `>` 出现在任意位置（前行首或分隔符），兼容 `2>`/`>>`/`>&`/`&>` 多种形式，并要求目标路径紧跟空白/结尾以免误伤 `/etc/passwd_xxx`。
- **GAP-2 路径变形归一化（P0）**：`rm -rf //usr`、`rm -rf /.//usr` 在 POSIX 下等价 `/usr` 却只判 `confirm`（黑名单目标未折叠冗余分隔符）。修：新增 `normalizeShellPathTargets` 折叠 `//+`、`/.` 段、解析 `/X/..` 穿越（`rm -rf /tmp/../usr`、`/../x` 等价 `/x`），并对 `key=value` 形态（`dd of=//dev/sda`）只归一化以 `/` 开头的值；归一化后的串作为额外送检范围（只加不减），普通绝对路径不受影响。
- **OVERBLOCK 普通绝对路径的 chmod/chown 不再被当根目录硬拒（3 条）**：黑名单「修改根目录权限/属主」的正则 `\s+\/` 把 `chmod 777 /tmp/x`、`chown -R user /tmp/x` 这类普通绝对路径也当成根 `/`，判 `deny` 且 force 不可越。修：收紧为 `\s+\/(\s|$)` 只匹配目标本身就是根 `/`；非根目标回落灰名单 `confirm`。
- **测试**：`command-security-check.unit.test.js` 新增 2 组 8 例（特权前缀绝对禁止项 deny / 普通路径不过度拦截 / 重定向任意位置与 `>&`/`&>` 变体 / 双斜杠、`/.`、`..` 穿越与 `dd of=//dev` 归一化 / 带特权前缀的管道）；矩阵用例与单测双向对齐。既有 `collectCommandScopes` 结构性断言改为 `includes` 以适配逐层剥壳新增的中间范围。
- **验证**：静态矩阵 **43/43**、agent 单测 **498 例全绿**、根目录全量 **106 文件 / 1618 测试全绿**、eslint 0、`npm run build:silent` 成功。
- **已知边界**：`runas /user:… cmd`（Windows 提权）只列入灰名单、未做剥壳暴露内层，本批未覆盖；变量间接执行与脚本正文内容仍静态不可判。
- **待决风险（未改，需拍板档位与摩擦权衡）**：`echo x | tee /etc/passwd`（`tee` 写系统文件，属“拦语法不拦效果”）、`echo … | base64 -d | sh`（非 curl/wget 的通用解码器管道喂解释器）仍为 allow。要收口需新增类别（`tee` 目标或管道右侧泛化解释器），会引入新确认摩擦，留待确认。

## 2026-10-17

### 安全（SEC-08：页内搜索高亮改用 DOM Range，停止重写整段 body.innerHTML）
> 底账一第二节 SEC-08。用户问“A 里 SEC-08/10/02 值不值得修”后，判定 SEC-08 属“确定该修且改动自包含”（Q1 象限），先行处理。根因：`page-extract.js` 的 plain/regex 两个高亮分支都执行 `document.body.innerHTML = document.body.innerHTML.replace(...)`，把命中片段替换进整段 HTML 串再回写——① 整段 body 从字符串重建，宿主页面全部事件监听、框架虚拟 DOM 关联、选中态随之丢失，SPA 上做一次“搜索+高亮”就可能把页面点坏；② 命中若落在标签/属性内部（如 `alt="cat"`），插入 `<span>` 直接损坏标记。

- **高亮改按文本节点用 Range 包裹**：新增 `page-utils.js:highlightTextMatches(root, regex, maxResults)`——TreeWalker 只遍历文本节点、先快照命中区间再从后往前 `Range.surroundContents` 包进 `<span class="ai-helper-search-highlight">`；绝不触碰元素标签/属性、不重写任何 innerHTML，故监听与结构全保留；跳过 `script/style/title/textarea` 容器。两个分支的 `innerHTML.replace` 均替换为该函数调用。
- **顺带修掉潜伏的第二处缺陷**：`removeHighlights` 旧只清 `.ai-helper-highlight`，而搜索高亮打的是 `.ai-helper-search-highlight`——类名不匹配导致搜索高亮永不复位、反复搜索会累积；已把该类名并入清理名单（解包 + `normalize` 还原原文）。
- **修正 regex 模式下高亮与命中对不上**：旧写法查找用原始模式、高亮却把模式转义成字面量，两者不一致；改为复用与查找同一个正则。
- **守卫**：`test/unit/page-search-highlight.unit.test.js` 11 例——3 条源码接线（旧自赋值模式不得复现、两分支均走 `highlightTextMatches`、`removeHighlights` 名单含新类名）+ 7 条行为不变量（监听存活且节点身份不变、属性不被污染、单文本节点多处命中反向拆分校验、`maxResults` 上限、解包复位、script 内容跳过、可见文本原样保留）+ 1 条负向对照（复刻旧 `innerHTML.replace` 确会重建节点、丢监听、打断属性）。
- **验证**：根目录全量 **106 文件 / 1618 测试全绿**，eslint 0，`npm run build:silent` 成功；已复核 `dist/assets/content.js` 中该自赋值模式消失。纯内容脚本改动，无需重启 agent。

## 2026-10-17

### 可靠性（agent_exec 两端超时一致性：进程生命周期权威移交代理端）
> 收口上一条「待办（另案处理）」：`timeoutMs` 配置、`tool-executor.js` 写死 120s 强杀、有输出自动延长 5 倍三者互不匹配，导致配置名存实亡；且两端 6 个定时器各自为政，WS 一断就解除代理端超时——MV3 Service Worker 被 Chrome 杀掉后进程裸奔。用户「两端要匹配、分析到位」后重做。

- **代理端成为进程超时唯一权威**：`/api/exec` 新增 `timeoutMs` 透传，显式传即进入「受管模式」——定时器与 WS 连接数**解耦**（`disconnectWsClient` 不再因全断开而 `clearTimeout`），到期由纯函数 `decideTimeoutAction` 裁决：**本预算期内有输出才延长**（输出流即心跳），静默命令到点即杀，总预算封顶 600s（`TOTAL_BUDGET_CAP_MS`，替代原「6 倍无上限」）。未传 `timeoutMs` 一律保持旧语义，新 agent × 旧插件行为不变。
- **显式 daemon 豁免替代断连反推**：新增 `POST /api/exec/detach { execId }` 与 `detachProcess`；插件端空闲分支改为「先 detach 再关 WS」，挂起型服务凭显式声明保活，通讯故障不再意外永久保活。
- **超时不再丢输出**：`executeCommandSync` 兜底回收 `stdoutBuf/stderrBuf`（原返回空串）；`exit` 帧与回放新增 `timedOut` 字段，插件端据此返回本地化超时结果（`toolExec.execTimedByAgent`）并保留已收集输出。
- **WS 半开连接收敛**：`/ws/exec` upgrade 后加 30s `ping/pong` 心跳，两拍未回 `terminate` 走 disconnect 路径（受管模式定时器仍在，不会被误解除）。
- **杜绝双重执行**：流式失败的 catch 分支以 `processStarted = !!execId` 为界——进程已在代理端启动过就**绝不** `execCommandWait` 同步重跑，仅 init 前失败（无 execId）才回退，消除副作用命令被跑两遍的事故。
- **插件端只做外层保险**：删除自管延长逻辑；硬超时从写死 120s 改为按预算派生 `computeExecGuardMs = min(effectiveTimeout×6, 600000) + 30000`。
- **schema 契约显式化**：`agent_exec.timeoutMs` 补 `minimum: 5000` + 描述钳制与延长上限（此前只有 `type: integer`，模型传 3000 被静默抬到 5000 引发「参数被忽略」误判）。
- **顺带修复**：`agent/test/integration/api.integration.test.js` 的 `resolveToken` 之前直接返回 `enc:` 混淆密文（从不解码）导致整套鉴权 403、`before` 钩子失败——补 `decodeSecret`，与新建的 `exec-timeout.integration.test.js` 一致。
- **测试**：agent `decideTimeoutAction` 单测 5 例 + `exec-timeout.integration.test.js` 5 例（timeoutMs 透传被杀/有输出延长跑完/超时回收输出/detach 存活/断开不解除超时）；插件端 `agent-exec-timeout-model.unit.test.js` 7 例（派生保险/钳制透传/预算耗尽不延长/空闲 detach/timedOut 映射/防重跑/schema 契约）；既有 `agent-exec-confirmation` 断言补 `execCommand` 第 4 参。
- **验证**：agent 全量单测 **490/490**、exec 集成用例全绿；根目录全量 **105 文件 / 1607 测试全绿**，`eslint src agent/src` 0 error，`npm run build:silent` 成功。**生效需重启 agent daemon**。
- **发布顺序**：先发 agent（版本 +1）再发插件；任意新旧组合都不出现「无人杀进程」窗口。


## 2026-10-17

### 安全（P1-3：长期记忆来源分级 + Tier1 常驻注入门控 + 写入侧防御）
> 底账二第四节 P1 条。根因：`injection.js` 的 Tier1 只要 `importance>=8` 就无条件常驻注入 system prompt，而 `importance` 由模型经 `agent_memory` 工具自传——模型此刻可能正在消化不可信网页内容，把投毒记忆顶到高值即可绕过 `<untrusted>` 包裹形成“记忆投毒 → 永久常驻注入”后门。用户三项拍板后开工。

- **来源 `origin` 由运行时按“谁发的请求”判定、模型不能自封**：`memoryDispatch` 从 HTTP header `X-Memory-Caller` 取可信来源——仅 options 面板的 `agentApi` 写记忆时带 `user`；background 的 `agent_memory` 工具（`tool-memory.js`）与自动压缩（`compaction-memory.js`）两条 `agentRequest` 不带 → 默认 `model`。关键：`tool-memory.js` 以 `{ ...args }` 原样透传、模型可往 body 塞任意字段，故 origin 只认 header/ctx、**绝不读 body**；`service.store` 新增可信 `ctx` 形参。
- **Tier1 常驻门控**：`injection.js` Tier1 改 `origin==='user'` 且单条 ≤500 字符；`model`/旧数据（无 origin）一律降 Tier2/Tier3（仍可预算内/按需召回，不常驻）。默认不可信 → 旧记忆自动降出常驻，无需迁移。
- **写入侧 fail-closed**：命中提示注入短语（`ignore previous instructions`/`system override`/“忽略以上指令”等中英）直接拒写；同一 sessionId 写入超 20 条限流（无 sessionId 不计，避免误伤）；`agentApi` 与 agent CORS 放行头同步新增 `X-Memory-Caller`。
- **守卫**：`memory-injection`(+5：model/缺失/超长不进 Tier1、model 高分仍进 Tier2)、`memory-service`(+5：origin 打戳/body 伪造无效/用户编辑提权/注入拒写/限流)、`memory-routes`(+2：header 判源、body 伪造被覆盖)。负向对照：抽掉 origin 门控 → 恰那 2 条负向例转红。
- **验证**：agent 全量 **484/484**、根目录全量 **104 文件 / 1600 测试全绿**，eslint 0，`npm run build:silent` 成功。**生效需重启 agent daemon**。

## 2026-10-17

### 安全（命令分级档位纠偏与危险动作覆盖补齐）
> 用户探针实测：一批零风险写法被硬拒，而 `dd`/`chmod` 这类真破坏动作静默执行。结论：现规则拦「语法形似注入」，不拦「效果具备破坏性」，且档位放反了。

- **命令替换特征从黑名单下调至灰名单**：`$( … )` / 反引号两条模式原在 `BLACKLIST_PATTERNS`，命中即 `deny`——**不给确认弹窗、`force` 也不可绕过**，于是 `a=$(echo hi)`、`ts=$(date +%s)` 这类只取值/只打印的写法被当绝对禁止。下调为 `confirm`：真用户确认弹窗，`force`（用户点确认 / 关闭确认开关）可跳过。判定逻辑不变，只改档位。
- **修正整串一票否决的误报根源**：`collectCommandScopes` 始终先把原始整串送检，而替换特征只看段首命令名——`pwd; echo $(date)`、`cd /tmp && echo \`ls\`` 因整串首 token 不是 `echo` 而被拦。新增 `substitutionCheckScopes`：子段只看非纯输出段，整串只在头命令不属于只读类（`pwd`/`cd`/`whoami`/`test` 等）时参与；替换藏在引号参数里（`git commit -m "feat: $(date)"`）时另扫该引号片段，不扩大到整串。`$( … )` 内的敏感命令仍由 `extractSubstitutions` 逐段送检，防护不降。
- **连带堵住一个真缺口（旧版就存在）**：拆分器为了不把 `"a && b"` 误拆，在引号内不扫替换，于是**被引号包住的替换内层完全不进送检集合**——`bash -c "echo \`rm -rf /\`"` 实测判 `allow`，连「force 也不可绕过」的黑名单都绕过（内联载荷解开后只剩 `echo \`rm -rf /\``，顶不上任何模式）。修：`extractSubstitutions` 补扫引号片段内部，使内层命令照常逐层进名单；没有替换的引号文本（`echo "plain text"`、`grep -c "sudo rm -rf /" notes.txt`）仍不拆。
- **真危险动作补齐覆盖**（原先即使确认开关打开也 `allow`）：灰名单新增 `dd of=`（裸写任意文件，原表只拦 `of=/dev/`）、`shred`、`truncate -s 0`/`--size=0`、`chmod 000`/`a-rwx`（原表只拦 777 与 `+x`）、`chown`、`curl/wget/nc/telnet/ssh/scp`（原表只拦 `curl|sh`）、`kill/pkill/killall`、`systemctl/launchctl/crontab/sysctl`。
- **`rm` 两类静默执行的拼写/目标收口**：原灰名单只写了 `-rf` 且排除了 `/` 开头，于是 `rm -r -f x`、`rm --recursive --force x`、`rm -rf /tmp/x` 全部 `allow`。改为「同时具备递归与强删」即确认（`rm -f x` 不新增摩擦）；黑名单在 `/dev /etc /proc /sys` 之外补上 `/usr /var /bin /sbin /lib /boot /opt /root /System /Library`，且保留「目标紧跟分隔符或结尾」的边界，`/tmp`、`/private/tmp` 不误判为系统目录。
- **已知局限写入代码注释**（不再假装防住）：命令通道不受 `allowedPaths` 路径沙箱约束（`checkPath` 只作用于文件类工具），故 `cat /etc/passwd` 这类「读取即外泄」无法在本层拦；变量间接执行与脚本正文内容静态不可判；只读头命令豁免**仅适用于替换这一项语法特征**，黑名单与其余灰名单条目不享豁免。
- **测试**：`agent/test/unit/command-security-check.unit.test.js` 新增 4 组——误杀回归（含用户原探针 8 条写法）、覆盖补齐、黑名单 `force` 不可越、既有防线不退化（`curl|sh`、链式 `sudo`、包装器剥壳、常规构建命令零摩擦）；并补两组「被引号包住的替换内层同样逐层送检」用例（覆盖上面那个真缺口）。另加一组守卫：灰名单 `reasonKey` 必须在中英语言包都有文案且非空（弹框直接展示 `reason`，漏一侧会给用户展出裸 key）。
- **验证**：agent 单测 **473 例全绿**，根目录全量 **104 文件 / 1600 测试全绿**，eslint 0，`npm run build:silent` 成功。
- **待办（不属本次改动）**：`timeoutMs` 配置与 `tool-executor.js` 硬编码 120s 强杀、有输出时自动延长 5 倍三者冲突，导致配置值名存实亡，另案处理。

## 2026-10-17

### 安全（SEC-11：审计日志渲染转义）
> 审计底账里与 SEC-05、NEW-05 并批的一条。核实后只有本条同时满足「确认是真问题 + 改动纯追加式、风险很低」，故单独收口；另两条结论见下。

- **SEC-11 已修**：`side_panel/index.js` 的 `renderAuditLogs` 把审计条目拼成 HTML 直赋 `innerHTML`，其中 `cat` / `level` / `entry.action` / `details` 源自工具调用记录（文件路径 / 命令 / URL）且未转义。因渲染发生在**扩展页面**，注入成功即拿到扩展上下文、能 `chrome.runtime.sendMessage` 唤起其它 handler，真实危害高于其标称「中」等级。修法：四处一律过已引入的 `escapeHtml`（元素文本位）后再插值；`time`（Date 生成）与 `levelClass`（固定 map 兜底字面量）本就安全，未动。
- **守卫**：新增 `test/unit/audit-log-escape.unit.test.js` 11 例——4 例源码接线形状（`cat/level/details` 赋值包 `escapeHtml`、action 插值过 `escapeHtml`、旧裸插值/裸赋值不得复现）+ 7 例行为不变量（用真 `escapeHtml` 驱 5 类 payload 复刻渲染位，断言注不进真元素且 `.textContent` 原样保留 + 一条「不转义确会注入」的正向对照）。负向对照：`git checkout` 还原 SEC-11 → 3 条源码接线守卫转红（行为层与源码无关，仍绿）。全量 **104 文件 / 1600 测试全绿**，eslint 0，已重跑 `npm run build:silent`。
- **NEW-05（mermaid 缺已渲染守卫）复核后判定为误报，未改**：① 每条新流式消息走的是作用域化的 `renderMessageMermaid(messageDiv)`，不是全文档扫描；② `renderSingleMermaid` 首行已有 `if (container.querySelector('svg')) return` 守卫，已渲染的图不会重跑 `mermaid.run()`；③ `renderMermaidCharts()` 只在会话切换 / 历史恢复两个批处理点调用，而那里重建 `addMermaidControls` 是**有意的**（虚拟 DOM 缓存恢复后事件监听失效需重挂）。加「已渲染跳过」标记反会让恢复后的图表控制按钮失灵——既非真缺陷、也不低风险。
- **SEC-05（iframe 消息无来源校验）确认为真问题，但修法不低风险，暂缓待决**：`selection-toolbar.js` 的 `window.addEventListener('message')` 不校验 `event.origin/source`，发送侧 `postMessage(...,'*')`。但内容脚本与页面脚本共用同一 `window` 消息通道，`origin` 校验对同源 iframe 无效、`event.source` 只能区分层级不能区分是否真内容脚本；要真正收口需迁到 `chrome.runtime` 或跨域 iframe 实测——回归面（选区上报被打断）远大于改动本身，且只能靠真扩展 iframe 探针取证。仅加「字段形状校验」堵不住本条的真实威胁（伪造者可发格式正确的假选区）。待用户定夺是否配探针单做。

## 2026-10-16

### 新增（确认/澄清弹窗单模态闸门与并发排队）
> 痛点：并行工具调用会同时发多条命令确认，面板一次渲染一个模态——后到的弹窗直接覆盖先到的，用户点一次「本次放行」被结算到别的命令上；澄清弹窗同理由并发丢失。

- **新增 `src/side_panel/interaction-gate.js`（单模态闸门）**：确认与澄清注册为同一组展示者，`requestDisplay/releaseDisplay` 决定谁能占屏；`reportInteractionDisplayed` 回执驱动的倒计时只在真正展示出来的那一条上跑（未展示的不得吃掉超时）。面板侧所有结算路径统一走 `settleClarifyVisible → advanceClarifyDisplay`，闸门无泄漏路径。
- **并发排队可见化**：非展示条目排队并在同一条弹窗上显示「另有 N 条待确认」，逐条答复；后台 `tool-executor`/`react-loop` 按 `toolCallId` 逐条挂起与结算，不做会话级合并。
- **测试**：`interaction-gate.unit.test.js` 248 行、`clarify-dialog-queue.unit.test.js`、`confirm-dialog-queue.unit.test.js`；新增 e2e `interaction-dialogs.e2e.spec.js`（真浏览器里验证排队/逐条结算/回执倒计时）。

### 修复（点一次「本次放行」后此后再也不弹确认框）
> 用户真机复测反馈：选「本次放行」（scope=single）后，同会话后续所有新命令都不再弹框，行为等同于选了「当前任务放行」。排查发现两个能各自造成该症状的缺陷，都与点的是哪个按钮无关。

- **关联键退化导致一次点击集体放行**（`1c1840e`）：确认关联键（`toolCallId`/`confirmKey`）缺失时退化成同一个空键，面板双通道投递的去重把不同命令当作重复投递吞掉、结算串位。修：键强制唯一 + `inFlightConfirmKeys` 唯一性守卫 + 去重只按完整键匹配。新增双侧同总线集成回归 `confirm-loop-cross-talk.unit.test.js`（真后台模块与真面板模块挂同一条 `chrome` 消息总线、用真按钮 click 驱动）证明两侧接缝已闭合。
- **agent 命令名单锚定串开头造成链式命令零确认**（`7613e5e`）：`BLACKLIST/GRAYLIST_PATTERNS` 绝大多数是 `^\s*sudo\s` 这类开头锚定模式，而模型很习惯写 `cd /tmp && sudo apt install foo`、`echo 1234 | sudo -S …`、`bash -c "sudo …"`——实测这些全部判 `allow`（连「force 也不可绕过」的黑名单都绕过：`cd /tmp && rm -rf /` 也是 allow）。修：`collectCommandScopes` 将判定集合展开为原始整串（保留 fork bomb 这类自带控制符的既有语义）+ shell 控制符逐段（引号/反引号/`$()` 内不拆）+ 环变量前缀剥离，黑名单与灰名单逐段判定，只加不减强度；纯空白命令改 fail-closed deny。
- **任务级放行跨任务驻留**（`7613e5e`）：`loopApprovedSessions` 按 `getRootSessionId(sessionId)` 记账，而 finally 只 `delete(sessionId)`；sessionId 在很多入口等于聊天会话 ID（跟任务不同生命周期），一次运行未走到收尾就长期驻留。修：新增 `revokeTaskLoopApproval(sessionId)`（连带清掉 `${sessionId}_` 子任务树），挂在 `reactLoopImpl` 起点与 finally 两处——一次性授权必须在运行起点与收尾两处复位。
- **四类仍能绕过名单的写法**（`18a6703`）：前缀包装器（`nohup/time/env/command/timeout/nice/stdbuf/exec/xargs sudo …`）、sudo 同类替代品（`doas`、`runas /user:` 根本没进名单）、Windows 内联载荷（`cmd /c /k`、`powershell -Command`、`-EncodedCommand` 的 base64/UTF-16LE）、`$( … )` 与反引号内部。修：逐段之上再追加剥壳范围（`stripCommandWrappers`/`extractInlinePayloads`/`extractSubstitutions`），灰名单补 `Remove-Item -Recurse/-Force` 与 `pwsh -EncodedCommand`：内联载荷静态看不出内容的，「看不出来」按需要确认而非放行。新增 zh/en 三键。
- **测试**：`agent/test/unit/command-security-check.unit.test.js` 20 例（原有语义不变/链式不绕灰名单/逐段不放宽强度也不误伤/剥壳拆解）；`confirm-routing.unit.test.js` 补任务级放行生命周期 2 例与接线守卫 2 例（源码正则）。均先做负向对照：还原 `security.js` → 5 例红，还原 `react-loop.js` → 7 例红。agent 单测 454/454，扩展 96 文件 / 1439 测试全绿，eslint 0。
- **已知能力边界**（显式写入注释）：变量间接执行 `S=rm; $S -rf ./x` 静态不可分类，不在本层解决；要堵需先定策略（如拒绝一切含未展开变量调用的命令）。另：改动要在全局安装的 `aha` 守护进程上生效必须 `npm i -g ./agent && aha stop && aha start`，否则真机仍跑旧代码。

### 性能（内容脚本注入清单：每个 iframe 每帧 1.61 MB 死重）
> 起因：审计条目 PERF-01 的复核。构建脚本生成 `content_scripts.js` 时用的是「扫 `dist/libs` 目录、除 mermaid 外全部注入」，而不是按需声明。而 dist/libs 里同时放着**只给 side panel 用**的重型库（side panel 靠 `libs-loader.js` 往自己文档插 `<script src="libs/…">`，依赖的是文件存在，与 content_scripts 声明无关）——于是它们被塞进每个页面的每个 iframe（`all_frames` + `match_about_blank`），而内容脚本产物对它们的引用数为 0。

- **注入清单改为以源码 `manifest.json` 声明为唯一真相源**（新增 `scripts/content-libs.js` 的 `resolveContentScriptLibs`，`fix-build.js` 调用）：不再扫目录、也不再逐个排除 mermaid，以后确实需要给内容脚本加库只需写进 manifest。声明项在 `dist/libs` 里缺失时**抛错而非静默丢库**（静默丢失会退化成运行时 `typeof marked === 'undefined'` 降级分支，难归因）。
- **效果**：注入 libs 从 1.64 MB（`pdf.worker` 1.06 MB + `jspdf` 357 KB + `html2canvas` 194 KB + `marked` 39 KB + `qrcode` 23 KB）降到 **61 KB**，每页每 iframe 少解析 **1.61 MB**；`dist/libs/` 文件全部保留，side panel 侧行为不变。
- **确认为问题的四层证据**：源码 manifest 只声明 2 个库；产物中五个重型库标识引用数全为 0（`marked` 8 / `QRCode` 5）；产物无 `window[…]`/`globalThis[…]` 间接取值；内容脚本唯一的 `canvas.toDataURL`（`advanced-tools.js:105`/`:197`）经读码确认是二维码绘制而非截图导出。mermaid 此前已排除且功能正常，等于预先验证过这类排除是安全的。
- **测试**：新增 `test/unit/content-script-libs.unit.test.js` 11 例（派生语义 6 + 仓库真实状态 3 + 构建脚本接线守卫 2，含注入体积上限锁与「旧写法不得复现」断言）；负向对照已验——`git stash` 掉 `fix-build.js` 后接线守卫立即 2 例红。扩展全量 97 文件 / 1450 测试全绿，eslint 0，已重跑 `npm run build:silent`。
- **真扩展冒烟**（`test-results-probes/_content-libs-trim-smoke.mjs`，12 项全通过）：现有 `test/e2e/*.spec.js` 走的是 esbuild 从 `src/` 现打 IIFE，**完全不经过 `dist/manifest.json`**，判不了这次改动；探针改为把 `dist` 真装进 Chrome，验 ① 内容脚本在顶层帧与同源 iframe 里都完成初始化（以 `initSelectionToolbar()` 首步无条件插入的 `<style id="aih-selection-toolbar-styles">` 为 canary，244 ms 内出现）② 声明注入的 `qrcode`/`marked` 在扩展内可取 ③ 移出清单的 `html2canvas`/`jspdf`/`pdf.worker` 文件仍在 `dist` 且可取（面板 `libs-loader` 的依赖没被误删）④ side panel 正常渲染无报错。**负向对照同样跑过**：往 `content_scripts.js` 塞一个不存在的文件后，Chrome 直接起不来（`launchPersistentContext` 超时）——印证「清单写错」是加载级故障而非降级，也正是 `resolveContentScriptLibs` 选择抛错的理由。**仍需人工点验**：选区翻译/解释、二维码出图、侧边栏导出图片/PDF、工作区 PDF 预览（这些要真实交互与产出物，探针只能证明「脚本起来了、库取得到」）。

### 新增（`fetch_url` 内网访问闸门：总开关 + 允许列表）
> 痛点（审计条目 SEC-03）：内置工具 `fetch_url` 只做 `new URL()` 格式校验，无 scheme 限制、无主机限制，且 `requiresConfirmation: false` → 模型可被提示词诱导直接打本机/内网。本轮把结论从「静态成立」升级为「运行时证实可达」：真扩展 Service Worker 里发 `127.0.0.1`/`localhost`/`[::1]` 的 GET 与 POST 全 HTTP 200 且响应体可读，**无 PNA 预检、无 OPTIONS**——扩展自身发起的请求不受 Chrome Private Network Access 约束（这也推翻了我上一轮拿 PNA 给 SEC-06 降级的理由）。

- **新增 `src/shared/network-scope.js`（唯一判定源）**：采用 B2 语义——公网目标一律不进判定；内网目标必须「总闸开 + 命中白名单」才放行；**开关开着但白名单为空仍拒绝**（避免存在「整个内网敞开」这一合法状态）；scheme 限 http/https。覆盖环回、`0/8`、`10/8`、`172.16/12`、`192.168/16`、链路本地（含云元数据 `169.254.169.254`）、CGNAT `100.64/10`、IPv6 `::1`/ULA/link-local、IPv4 映射 IPv6，主机名侧认 `localhost`、`.local/.internal/.corp/.lan/.home/.intranet` 与无点主机名。白名单支持大小写不敏感精确匹配、`*.` 子域通配（不匹裸域）、录入容忍协议/端口/路径。
- **与代理端 `agent/src/rag/url-guard.js` 刻意区分强度**（已写进文件头）：SW 无 DNS 解析 API、fetch 默认内部跟随重定向，所以扩展侧只能按字面主机名/IP 粗筛，「公网域名解析到内网 IP」与 DNS rebinding、公网 302 跳内网这三类识别不了；代理端有 lookup + `redirect:'manual'` 逐跳校验。**按你的指示本轮未动代理端**（其 `ragUrlIngest` 现行语义是「白名单非空则总开关被完全忽略」，属界面承诺与安全行为不一致，待后续按 B2 改）。
- **接线与配置链**：`tool-executor.js` `executeFetchUrl` 在格式校验后调 `decideNetworkAccess`，拒绝时返回指名开关位置的可执行模型文案（不新增弹窗，保持免确认）；`constants.js` 默认 `networkAccessEnabled: false` + `allowedNetworkHosts: []`；`config.js`/`config-manager.js` 读写；`storage-tools.js` 的 `fetch_url` 描述已写明限制。
- **设置页「推理」Tab**（紧挨「敏感操作确认」，同类安全闸门有先例）：新增总开关 + 允许列表（复用「域名屏蔽」那套列表控件，不新增 Tab）。**开关与白名单独立存储，关开关绝不清空列表**（你明确提出的痛点：关掉再开不用重录）；关闸时白名单整块收起（实测高度 203px → 0px），只留开关一行，避开无效配置长期占位；开闸后条目立即回显。显隐做法沿用既有「流式输出 → 流式工具卡片默认展开」的 wrap 机制，未另立一套；两个设置页同时开着时，开关与展开态随 `storage.onChanged` 同步（列表原本就会同步，不让开关落在后面）。zh/en 各 13 键（说明文案已改为「关闭开关只是收起该区块，不会清空已录入的列表」）。
- **配置导入剔除这两个键**（`config-io.js`）：安全闸门不允许被一个（可能手改过的）配置文件静默打开并灌入白名单，只能在设置页当面改。
- **测试**：新增 `network-scope.unit.test.js` 61 例（私网边界值 + 主机名规则 + B2 真值表）、`fetch-url-network-scope.unit.test.js` 22 例（公网不误伤 / 关闸+白名单非空仍拒 / 开闸空白名单仍拒 / 命中放行 / scheme / POST 同判定）、`network-access-config.unit.test.js` 10 例（录入归一、去重、**列表操作绝不写总开关**、关闸收起与开闸回显、收起过程不写 storage、HTML 转义）；`config-io-import.unit.test.js` 追加 1 例锁「导入不飘移」。扩展全量 **100 文件 / 1547 测试全绿**，eslint 0，已重跑 `npm run build:silent`。
- **真扩展冒烟**（`test-results-probes/_sec03-network-scope-smoke.mjs`，27 项全绿）：① 产物层——SW chunk 确实引到 `network-scope-*.js`，拒绝文案与配置键未被 tree-shake；② 设置页三态——默认关且白名单区块高度为 0、开闸写库并展开（实测 203px）、录入 `http://Nas.Corp.Internal:8443/some/path` 归一成 `nas.corp.internal`、**关闸后区块高度回 0 但 storage 条目原样保留**、再开闸条目立即回显无需重录，并量了两态占位（关闸 114.5px 只剩开关行 vs 开闸 333px，多出的 218.5px 即白名单区块），两态截图 `_sec03-gate-off.png` / `_sec03-gate-on.png`；全程 0 报错；③ 把 dist 里那颗判定函数 import 起来逐档跑 B2 真值表（MV3 SW 全局域禁止 dynamic import，改在扩展页跑同一份产物）；④ 网络层对照——自建 `:18999` 双栈探针服务证明浏览器本身仍不拦环回，即拦截必须来自这道新闸门。另需注意：`manage_tab` 的 open/navigate 到内网依旧免确认且带用户 cookie，**这条门本轮未堵**。

### 性能与安全（审计四项小修：源码映射 / 滚动写盘 / 预览监听 / docx 懒加载）
> 起因：审计条目 SEC-13、PERF-04、PERF-05（NEW-03）、PERF-06（NEW-04），四项各 1–10 行，按你拍板并一个批次做完（SEC-13 配置与两道打包防线都做、PERF-04 用防抖加兜底、PERF-06 三组预览一起修、PERF-05 走整体按需方案）。

- **SEC-13 产物不再携带源码映射**：`vite.config.js` 的 `sourcemap` 关为 `false`（开着的等于把源码连注释直接装进扩展包公开）；`.github/workflows/release.yml` 与 `scripts/package.js` 的 zip 各加 `-x "*.map"`，并在打包后立即 `unzip -l` 复核归档，检出 `.map` 即失败退出——只排除不校验的话，配置被改回 `true` 仍会静默发布。实测：改前当前源码构建出 **19 个 `.map` 共 10.3 MB**（最大 `side_panel.js.map` 2.64 MB），改后 dist 与商店包均为 **0 个**，包体 2.69 MB。
- **PERF-04 滚动位置不再每帧直写 storage**：`side_panel/index.js` 的 scroll 回调改走既有 `debounce`（静默 200 ms 落一次），并加 `pagehide` 兜底立即落一次防丢最后一段；`key` 与 `scrollTop` 都在事件发生时捕获再传入，否则延迟落盘时会话可能已切走、位置会写到别的会话上。真扩展插桩实测：改前 20 次滚动 = **20 次 `chrome.storage.local.set`**，改后 **1 次防抖 + 1 次兜底**，落盘值 233 与最后一次 `scrollTop` 一致。
- **PERF-06 预览期 window 监听配对作废**：审计只报了 PDF 一组，回到代码里核实是**同形态三组共 9 个** window 监听（`previewPdf`/`previewPptx`/`previewImage` 各挂 `mousemove`/`mouseup`/`resize` 的匿名函数），从不 `removeEventListener`，每预览一个文件泄漏一组。改为模块级 `previewAbortController` + 唯一注册入口 `addPreviewWindowListener(type, handler)`，`previewFile()` 开头 abort 上一轮再新建（三个分支都只从它进，收口一处即可）；signal 缺失时退化为普通注册，不因初始化顺序丢监听。另一处 `resize` 用命名函数注册，`addEventListener` 对同 target/type/listener 天然幂等，不构成泄漏，未改。
- **PERF-05 docx 彻底移出首屏 chunk**：`chat-export.js` 顶层静态 `from 'docx'` 会把前面所有 `await import('docx')` 抵消掉。改法是三个引用方（`chat-manager` 12 处、`chat-streaming` 4 处、`workspace-panel` 3 个函数）删静态 import、在调用点改 `await import('./chat-export.js')`，16 个 click 回调随之转 async。产物实测：`side_panel.js` **1,376,516 → 962,742 字节（-404 KB / -29.3%）**，OOXML 特征串 `schemas.openxmlformats.org/wordprocessingml` 在主 chunk 里 **74 → 0** 处。
- **顺手抓到一个构建缺陷（NEW-06，不修则上述改动是功能破坏）**：chat-export 独立成 chunk 后要反向 import 入口 chunk，而 `scripts/fix-build.js` 把带 hash 的入口改名成 `side_panel.js` 时只改写了 manifest / loader / 两个 HTML，**没改写 chunk 之间的静态 import**，产物里留下指向已不存在文件的 `./side_panel-<hash>.js`。真扩展里表现为点任意导出按钮即 `Failed to fetch dynamically imported module`——即所有导出功能静默全坏（改前 chat-export 就在入口 chunk 内部，没有跨 chunk 引用，所以这层缺陷一直没暴露）。修：改名映射同样遍历 `assets/*.js` 应用一遍。
- **真机点验撞出的第二个坑（NEW-07，本批改动自己引入的回归）**：试导出 Word 报 `Cannot read properties of null (reading 'dataset')`，栈落在 `chat-export-*.js:10`。根因在调用方而非导出函数：`restoreMessageFromHtml` 与 `rebindAllMessages` 这两处重绑的 8 个回调原本同步读 `e.currentTarget`，改成 `async` 后按需 import 让出了一次微任务，而 DOM 事件派发结束时会把 `currentTarget` 复位为 null——传进去的按钮成了 null，导出函数首行 `exportBtn.dataset.exportBtnKey` 即抛。影响面是「从历史恢复 / 重绑过的消息」四类导出全崩，新流式消息（`addMessage` 用的是外部常量 `docxBtn`）不受影响。修：8 处均在 `await` 之前把按钮捕获成局部常量。守卫三层：`export-click-lazy-import.unit.test.js` 7 例（契约层实测 `await` 后 `currentTarget === null`；用真 `rebindAllMessages` + 真点击驱动，断言导出函数收到的按钮非空；产物接线形状）+ 探针 F1/F2 逐个数产物里的回调顺序 + F3–F6 在真扩展里真导出一份 docx（8,635 B，MIME 为 OOXML 文档，文件名 `word-<ts>.docx`，导出后按钮回可用、下拉收起；探针把 `<a download>` 的 click 换成记录，不写磁盘）。负向对照：把 8 处还原成 await 后取值 → 该文件 6 例红（报错原文即 `expected null to be <button …>`）、探针 F1/F2 红。
- **测试**：新增 `test/unit/audit-small-fixes.unit.test.js` 21 例（四项的源码/构建脚本/产物接线形状 + `debounce` 与 `signal` 两条真语义契约 + 产物引用图完整性）与 `test/unit/workspace-preview-listener-lifecycle.unit.test.js` 4 例（用真 `workspace-panel.js` 驱真 `previewArtifactFile` 连做三轮图片预览，只桩网络层；给每个已注册 handler 套调用计数，旧轮次 **0 次调用**、存活的这轮照常收到调用）。另有 `test/unit/export-click-lazy-import.unit.test.js` 7 例（NEW-07 的回归守卫）。全量 **103 文件 / 1579 测试全绿**。负向对照均已跑：八个改动文件一起 `git stash`（不重建 dist）后重跑两个文件 → **17 例红 / 8 例绿**，其中守卫文件 13 红、行为取证文件 4 例全红；绿的 8 例全部是契约类与 dist 产物级（产物仍是修好的那个），说明红点精确落在源码与构建脚本的改动上。
- **真扩展冒烟**（`test-results-probes/_audit-small-fixes-smoke.mjs`，27 项全绿）：把 dist 真装进 Chrome 验 ① 首屏 0 个 `.map` 请求、0 个 chat-export 请求 ② chunk 间静态 import 无悬空目标（23 个 chunk 全 OK）③ 滚动 20 次期间 0 次写入、静默后 1 次、`pagehide` 再 1 次 ④ 扩展内可动态 import 按需 chunk 且引用方取用的 7 个符号全部可用 ⑤ docx 代码确实落在按需链里且首屏从未拉取 ⑥ 真跑一次 Word 导出并校验产物。负向对照分两次跑：回退四项改动 → **9 项红**（B1 直接量化出改前 20 次滚动写入 20 次、D1 量出改前主 chunk 1,316 KB 含 OOXML）；只把 8 个导出回调还原成 await 后取 `currentTarget` → **F1/F2 红**（实测「捕获 0 个」与「8 个晚取」）。
- **未覆盖面（需人工点验）**：真扩展里已把 Word 导出跑到产出物（上一那条），但 PDF / Markdown / 图片三类导出仍只验到「函数可取、按钮非空」这一层；PDF/PPTX 预览也没真跑（要先把 agent 起起来走完配对并备齐三种二进制素材，装置成本远超这些改动本身的风险面），所以预览那两条路径只验到「监听生命周期」与「chunk 可拉取」两层。

### 工程质量（代码审查驱动：守卫升级 AST 版 / 产物级断言去静默绿 / 预览监听并发修正）
> 起因：对上一批 NEW-07 修复与守卫做代码审查。审查确认 8 处修复本身成立，但指出守卫有 4 个「假绿」洞、`audit-small-fixes` 产物断言可能静默绿，并顺带撞出 PERF-06 在并发下的作废语义不成立。本批是把这三处补硬，未改生产代码的功能面（除 PERF-06 的并发修正）。

- **`export-click-lazy-import.unit.test.js` 三层守卫由字符串正则/大括号配对整体重写为 acorn AST（7 → 15 例）**，逐个堵审查点名的假绿洞：① jsdom 把 click 派发到按钮本身时 `target === currentTarget`，测不出「晚取的是 target 还是 currentTarget」——改为派发到按钮内部 `<span>`/`<svg>`，复刻真机落点使二者可区分；② 锚点原以 `chat-export` 的 import 语句为界，改为回调体内**首个 `await`** 的字节位置（用 AST 定位，提前 await、嵌套括号实参都拦得住）；③ `restoreMessageFromHtml` 此前只有形状覆盖没有行为覆盖——`test.each` 把「驱动函数 × 导出类型」交叉跑（2 驱动 × 4 导出 = 8 例），断言导出函数收到的按钮非空且 `tagName === 'BUTTON'`；④ 别名（`const ev = e; ev.currentTarget`）与解构（`const { currentTarget: btn } = e`）漏扫——追踪事件参数派生名集合，成员访问与解构两形态都查。`acorn` 提为直接 devDependency。
- **负向对照**（`test-results-probes/_new07-guard-negative-control.mjs`）：对守卫本身做 M0–M6 共 7 个变体（复现 await 后取值、改 `e.target`、import 前插 await、解构改写、别名晚取、内联实参晚取、删捕获行），逐个注入 git HEAD 前的坏形态再跑该文件，**7 变体全部转红、基线全绿、还原后 src 与 HEAD 逐字节一致**——证明这层守卫不是摆设。（踩坑记录：目录沙箱方案因 `vi.mock` 按解析后真实模块 id 匹配、依赖链断导致整文件被 skip 而误判绿，改回原地注入；vitest 汇总行含 ANSI 色码须先 stripAnsi。）
- **`audit-small-fixes.unit.test.js` 的 5 条产物级断言此前在本机也从未真跑（静默绿）**：根因是 `DIST_ASSETS = new URL('../../dist/assets/', import.meta.url)` 在 vitest 环境里 pathname 解析成 `/dist/assets`（前缀丢失），`existsSync` 恒 false → `distReady` 恒 false，那 5 条 `if (!distReady) return;` 直接静默通过。改为 `resolve(__dirname, '../../dist')` + `join`，并把 5 处静默 `return` 换成 `test.skipIf(!distReady)`（缺失时显式 skip 而非假装绿）。修复后 21 例全跑全绿，再临时收紧阈值（size<10、carriers>999）验证它们确会红。
- **PERF-06 并发下作废语义不成立（本批生产侧唯一功能修正）**：`addPreviewWindowListener` 原读模块变量 `previewAbortController`，而 `previewFile` 在 `await` 取文件期间会让出——此时若另起一轮预览，模块变量已被换成新 controller，读模块变量的写法会让**旧轮监听挂到新轮 controller 上驻留**，旧轮闭包里的 pdf/pptx/image 数据要等第三轮才回收。改为 signal 逐轮作参数透传（`previewFile` 建局部 `previewSignal`，三分支加 `signal` 形参、9 个注册点透传）；`closePreview` 提为 export 并在关闭时 `abort` 本轮 controller；`previewImage` 的 `resize` 回调补 `isConnected` 存活守卫；注册入口加 `if (signal?.aborted) return;`（真浏览器丢弃已 aborted 的 signal，jsdom 仍登记——实测语义差异，不能让陈旧轮继续注册）。生命周期测试 4 → 6 例（新增「两轮并发交叠」与「关闭即作废」两例，断言对交错次序保持不敏感）。
- **复验（全部实测）**：`npm run build:silent` → BUILD_SUCCESS；全量 **103 文件 / 1589 测试全绿**；eslint 0；真扩展冒烟 `_audit-small-fixes-smoke.mjs` **27 项全绿**（重建后按需 chunk 为 `chat-export-cl7EOC1O.js`，F1/F2 验产物 8 个回调仍在 await 前捕获）；`chat-manager.js` 相对 HEAD 无改动（本批只动守卫、产物断言与 workspace-panel）。本批改动尚未提交。

## 2026-10-15

### 新增（选项页记忆 Tab：代理端持久化记忆的条目查看与管理区）
> 痛点：记忆真源在 agent 的 `global-memory.json`，但此前只有 LLM 工具通道——高价值记忆常驻 system prompt 对用户是黑盒；纠错须对话里让模型先 recall 查 id 再删；手改 JSON 会留脏向量缓存。

- **选项页「记忆」Tab 底部新增记忆条目管理区**（`src/options/memory-entries.js` 新模块）：全量列表（类型徽标/内容两行截断点击展开/重要度/价值分/标签/访问统计）、关键词+类型筛选（纯客户端）、编辑弹窗（内容/重要度/标签）、单条删除、低价值候选条 + 一键压缩。Agent 端零改动，全部复用既有端点。
- **列表数据源定死 `manage(review)` 而非 `recall`**：recall 会写 `accessCount/lastAccessAt` 并做会话去重，管理端调用会污染召回统计；review 只读枚举并自带价值分。写操作走 `store`（agent 端已封装向量懒补 / `dropVectors`，UI 不操心向量一致性）；旧代理无端点时 404 如实提示升级重启，不停在「读取中」。
- **接线与样式**：`memory-panel.js` init/refresh 链路带刷条目区（代理未连接不发请求）；`options.html` 记忆 Tab 追加容器；`.memory-entry-*` 系列 kebab-case 样式（宽字符 `min-width:0` + `word-break` 防撑爆）；zh/en 新增 `memoryEntries` 命名空间 44 键。
- **列表排序显式化**（同次追加）：此前列表只能按创建时间倒序且规则只写在代码注释里，用户看不到也无法切换。筛选行新增「排序」下拉，规则直接暴露在选项文案：创建时间（新→旧，默认）/ 重要度（高→低）/ 价值分（高→低）/ 价值分（低→高，淘汰视角配合候选条清理）。纯前端对 review 全量重排，不发明新端点、不重发请求，与关键词/类型筛选正交叠加；同分一律回落创建时间倒序（否则相等元素次序依赖引擎约定，用户看到「随机抖动」）。未加最近访问/访问次数排序——管理场景用得少。
- **列表自身限高内滚**（同次追加）：条目多时列表把整页撑到几屏外，要看到底部条目得滚整页。`.memory-entries-list` 改为 `max-height: min(420px, 50vh) + overflow-y:auto`（沿用 `.toolbox-list` 惯例与同款细滚动条），只让列表自身出滚动条；`50vh` 档防矮视口下仍顶出多屏（探针实测窗口里生效的正是这一档）。标题/筛选/排序/低价值候选条故意留在滚动区外，否则翻几条就找不到筛选框；编辑弹窗是 body 级 `position:fixed`，不被新容器的 overflow 裁切（内嵌弹层会被裁，已写进注释里防回退）。
- **测试**：新增 `memory-entries.unit.test.js` 27 例（review 数据源且绝不调 recall / 筛选 / 排序四规则与同分回落且切排序不重发请求 / 编辑 body 形状 / 删除仅 `memoryId` 两字段 / 写在途防连点 / compact 确认含阈值 / 404与失败与离线三态 / 语言热切换重渲染 / 真实 t() 渲染无占位符残留 / 列表限高内滚与筛选行不在滚动区内 / options.html id 与中英键、占位符对齐）。全部先红后绿；全量 1380/1380、eslint 0、`BUILD_SUCCESS`。
- **真实渲染探针收口三个缺口**：`test-results-probes/_memory-entries-panel.mjs`（假代理端 18978 + 加载 dist 真实扩展，zh/en 双轮各 15 项 + 长列表专项 7 项：两行截断/无横向溢出/排序生效/写链路请求形状/列表内滚）。抓到三个 jsdom 单测盲区：
  1. 语言热切换——静态标签由 applyI18n 刷而条目区文案全是 JS 拼的，切换后「英文页夹中文徽标」；修：状态行改存「键+参数」语义、订阅 i18n 变更整区重渲染。
  2. 排序下拉文字截断——`#memoryEntriesSort` 固定 168px 对 zh 够用、en 的 "Created (newest first)" 被裁；修：改 `width:auto; min-width:168px`，并新增「最长选项文字宽度 ≤ 可用宽」的 canvas 量算钉（原生 select 被裁时 `scrollWidth` 不增长，靠溢出属性探不到）。
  3. 长列表内滚专项（夹具可切 3/30 条）：实测 `scrollHeight 2211 > clientHeight 357`、容器高被 `max-height` 限住、未滚时末行在容器外、滚到底可取到末行且首行滚出、整区高度仅 +62px（不再随条目数线性膨胀）、滞后的滚动条不引入横向溢出、筛选/排序仍在滚动区外。

## 2026-10-14

### 修复（知识库工具勾选在代理离线期间被误清理）
> 用户实测：勾选三个知识库工具 → 断开代理（工具从列表消失属预期）→ 重连代理后三个工具全部未勾选，须手动重勾。

- **根因**：代理离线时 background 调 `unloadRagTools()` 清空 `storage.ragTools`；侧边栏 4 处（面板加载 / 切换助手 / 切换会话 / 弹窗保存）用「内置 + 当前已注册 ragTools」过滤用户已存的 `agentEnabledTools_*` 并**把过滤结果持久化写回**——离线时 `knowledge_*` 不在全集内，被当残留无效 ID 清理；重连后 `ragToolsIntroduced=true` 不再重新引入，勾选永久丢失。
- **修**：新增 `RAG_TOOL_IDS` 静态全集（`constants.js`，从 `src/background/tools/rag-tools.js` 的 `RAG_TOOLS` 派生，单一数据源）+ `getValidToolIdUniverse()`（内置 + RAG 静态全集 + 已注册 RAG 工具），4 处有效性判定与弹窗保存遍历统一改走它；真正无效的残留 ID（旧版 `mcp_*`）仍被清理，主动取消勾选的工具不会被重新加入。
- **测试**：新增 `tool-valid-id-universe.unit.test.js` 6 例（先红后绿：离线过滤不丢 `knowledge_search/ingest/list`、残留 `mcp_*` 仍清理、已注册工具并入去重、非法入参安全降级）。

### 修复（Markdown 表格：单元格内转义竖线支持）
> 用户截图报告：表格一行被拆成多列。渲染/导出走朴素 `split('|')`，单元格内的 `\|`（GFM 字面竖线）被当成列分隔符——一行 2 列被拆成 4 列。

- **修**：`markdown-render.js` 新增 `splitTableCells()`（奇数个 `\` + `|` 为字面竖线、偶数个为分隔符），表格渲染 / Excel 导出 / 复制（`extractTableFromDOM` 反向把单元格竖线转义回 `\|`）统一走它；Word 导出（`chat-export.js`）与工作目录预览导出（`workspace-panel.js`）同步接入。
- **测试**：新增 `markdown-table-escape.unit.test.js` 8 例（splitTableCells 语义 5 + 渲染列数 2 + Word 导出单元格数 1）。

### 修复（记忆线二轮评审收口：recall 锁外补齐 + provider 全配置缓存键 + 配置所见即所存）
> 评审确认问题收口；口径写回 `docs/Memory-Retrieval-Design.md` §2/§7/§10。

- **recall 改三段式（锁内只读 → 锁外补齐缺失向量 → 锁内收尾）**：补齐的嵌入是外部 IO（最长 8s 超时），原先在记忆互斥锁内执行——锁是进程内 Promise 链、无超时逃生口，一次挂起会堵死同进程所有记忆写入。补齐失败按 modelKey 冷却 60s（`RECALL_BACKFILL_COOLDOWN_MS`），冷却期内只用手上向量算名次。
- **向量缓存读出加指纹校验**：缓存 `modelKey` 与当前模型不符时整份视空、当轮按当前模型重建（旧实现会把换模型前的旧向量拿去算 cos，噪声名次混入语义路）。
- **provider 缓存键改为全生效配置 JSON**（原为 `mode|modelName|dimensions`）：改 `baseUrl`/`apiKey`/`queryPrefix` 也会重建 provider，不再拿旧端点打新配置。
- **访问计数 RMW 重读真源**：阶段 1 到收尾之间可能已有 store/compact/delete 落盘，避免拿旧快照写回抹掉并发变更。
- **store(update) 锚点失效可机器判定**：不存在 id 返回 `code: 'not_found'`；扩展端压缩摘要沉淀据此降级为 `add` 重建并回传新 id（此前会 update 一个不存在的 id，摘要沉淀静默断供）。
- **配置界面「所见即所存」**：远端档 baseUrl / modelName / queryPrefix / dimensions 始终提交（含空值 / 0，清空字段不再被「缺席即不改」静默吞掉）；apiKey 是唯一例外（明文不回显、留空=不修改），新增「清除已存 Key」按钮（`clearApiKey:true` 为唯一显式清除通道）；配置读取失败时拒绝保存（`configLoadFailed` 守卫，防空表单覆盖真配置）。中英补 5 键 + staleHint 补注。
- **测试**：agent `memory-service` +5 例（not_found / 换模型整份失配重建 / 补齐在锁外·store 不阻塞 / 冷却 / 全配置缓存键）、`memory-embedding-config` 补 clearApiKey 优先；根 vitest `memory-panel` +8 例（所见即所存 / 清除 Key 五态 / 保存守卫两态）、`compaction-memory-persist` +3 例（not_found 降级 / 降级也失败仍静默 / 其他 400 不误重建）。

### 修复（工具栏分组选中态误触发：只认组内直属主开关）
- 记忆组把条数下拉嵌在组内，下拉里的「自动压缩 / 摘要存入记忆」子开关会误触发整组高亮（关掉记忆主开关后选中态仍残留）；`:has(input:checked)` 收窄为 `:has(> label.check-toggle > input:checked)`。

### 修复（记忆线评审收口：score 字段级封顶回归 + 窄窗口越界 + 残留清空 + 语义档转纯 top-K）
> 承 CodeReview「确认是问题的先修，不确定的先核实」；全部先红后绿。

- **`keywordScore` 恢复字段级封顶（真回归）**：`6e2a22f` 重构时丢了 `Math.min(units, KEYWORD_MAX_HITS)`，`score` 变逐单元线性累加（红跑实测 18，恰为旧实现 9 的两倍）；修回「字段内先封顶再乘权重」。旧钉只断言 `units` 未断言 `score`，本轮补上 score 轴。
- **标定工具窄窗口越界**：`recommend = snapToGrid(中点)` 归整后可能越出窗口上界（构造 `(0.454,0.456]` → 0.46），照它设地板会拒掉最低分的相关查询；改为归整值出窗时退回未归整中点 + 两条告警。bge-m3 真实窗口 0.084 不触发，属换模型前置护栏。
- **本地档残留清空扩到 queryPrefix/dimensions**：残留 `queryPrefix` 会顶替本地 BGE 默认前缀（`??` 只认 nullish）；残留 `dimensions` 进 `memoryModelKey` 指纹会让同一份本地配置冒报 stale、白跑一次 23 分钟本地重建。本地分支显式清空 + 惰性字段省略。
- **语义档转纯 top-K（删查询级绝对地板）**：0.48 只在 bge-m3 上标定、不可跨模型平移——本地档实测噪声 top1=**0.5599** 逃过地板被误返、真相关 top1=**0.4888** 反被绞杀。线上不再施加，只留随模型自动平移的两道相对门（条目级落差 0.05 + 条数封顶 2）；B 档验收从「无关查询必须空返」改为「至多 maxTake 条、不填满 limit」（放弃「无匹配空返」换取任意模型开箱即用）；`SEMANTIC_QUERY_FLOOR` 常量保留仅供离线标定。

### 变更（记忆检索四轮迭代 + 口径文档收口：重标定工具 / 词面门槛去重 / 标签加成 / df 兜底）

- **重标定工具**：把「安全窗口 = 无关 top1 最大值 < 地板 ≤ 相关 top1 最小值」固化成一条命令——纯函数 `agent/test/eval/semantic-window.js`（无 IO/网络）+ 人工执行的联网标定脚本 `recalibrate-semantic-floor.mjs`（不进测试链路）；离线测试用 bge-m3 黄金向量复现窗口 `(0.4322, 0.5163]`、中点 0.47、现行 0.48 在内（下余量 0.048 / 上余量 0.036），7 例零联网，反向验证 4 红。
- **词面门槛按去重片段判定 + 深度命中优先排序**：单元身份从「命中片段」收到「查询单元」，同一单元跨正文/标题/标签取**最强值**而非累加（旧实现靠跨字段重复计数旁路门槛：查询「配置远端模型」把一条既不含「远端」也不含「模型」的 QQ 邮箱记忆顶到第 1）；新增 `best` 轴与唯一比较器 `byKeywordRank`（深度命中优先），A 档与融合档两处同步改走它——开没开向量档不能改变碎块条目的地位。门槛去重是**降权不是剔除**，`score` 仍按各字段权重累加。
- **标签从硬过滤降为名次加成**（新模块 `tags.js`，上抬上限 2 位）：有 query 时不再剔除候选、只在最终序上按重叠比例上抬；无 query 时保持枚举硬过滤。真实库离线标定（41 条 / 151 标签）：枚举路径新旧差异 **0/151**、相关型 36 例**捞回 24 例**、少返回 3 例——3 例代价全部落在全库过半词一格（旧行为是被 df 豁免下限意外救到的，非设计正确）。
- **df 全塌兜底**：查询所有单元都判无区分度时忽略 df、宁按词面强度排（不放宽命中门槛，全库无人碰该词仍 0 条；尚有低频单元幸存就照旧剔高频词）。重跑标定：捞回 **24 → 28**、少返回 **3 → 0（代价清零）**、裸查 `ai` **0 → 10 条**、裸查 `配置`/`agent` 不触发兜底。
- **向量测试脆弱等待治理**：根因不是挂钟而是**撕裂读**（`writeFile` 先 truncate 再落内容，测试轮询撞进半截 JSON）——只修测试读盘（`waitUntil` 等四件有界轮询助手）、未改产品代码；修复前 **3 红 / 61 跑** → 修复后 **0 红 / 100 跑**（仅在全套件并发负载下复现，单文件跑不出来）。
- **文档收口**：现行口径收到单一来源 `docs/Memory-Retrieval-Design.md`（含「已被实测否定过的方案（不得加回来）」清单与每条判据的用例索引）；5 份已执行计划就地加「存档状态」声明、**不删**——保留 45 处「作废/更正/推翻/错定」作防回退的书面依据。

### 变更（记忆向量配置界面：命名对齐知识库 + 本地档模型固定 + 总开关即改即存）
- **命名统一**：远端选项改为「远端服务（OpenAI 兼容接口）」，与知识库单选逐字一致。
- **本地档不再可编辑模型名 + 残留显式清空**：模型框加 id `memoryModelGroup` 纳入隐藏清单；`collectPayload` 本地分支**显式发 `modelName:''`**（若只隐藏不提交，此前配远端存下的 `BAAI/bge-m3` 会残留并劫持本地默认模型）。
- **总开关切换即持久化**：原「表单制」下关掉开关不落盘、刷新被真值回填（用户报「好像这个开关我控制不了」）；改为 `change` 即 POST（请求体严格只有 `enabled`），成功后只重拉状态卡、**绝不 `loadAll()`**（防盖掉未保存草稿），失败回滚勾选框 + toast，写入在途锁开关；门控两把锁合并下放到开关本身；标签文案改由面板按开关态唯一渲染（原静态 i18n 键在语言切换后会说谎）。
- **测试**：结构钉 + 行为钉同步改写（33/33 与 22/22 两批全绿）；四条变异证明用例有牙——改发全量体 → 2 红、成功后走 `loadAll()` → 2 红、失败不回滚 → 1 红、门控不锁开关 → 1 红。
- **文档同步**：wiki 配置页新增「记忆（向量召回）配置」整节（标签页计数 7→8、标签一览表与数据持久化表同步）；代理服务页把 4 条旧记忆端点行替换为 `/api/memory/*` 八条端点小节，并在「长期记忆」机制节补语义向量通道与向量派生/重建两条；核心特性页补「语义向量召回」条目；docs 中英文档第 19 节改为「关键词 + 语义向量」双通道与三档降级口径。以上中英同步，已推 GitHub wiki 并镜像至 Gitee wiki。

**当日收口（全部实测）**：根 vitest **1340/1340**（88 文件）、agent 单测 **433/433**（含两套黄金评测）、`npm run lint` 干净、`npm run build:silent` BUILD_SUCCESS。

## 2026-10-13

### 变更（记忆入参校验收口：D2/D3/D4 + 文案层测试补齐）
> 侧边栏自测报告 9 条用例 + 4 个缺陷，逐条核验后修 D2/D3/D4；D1（标签硬过滤是否降为加分项）挂起等用户定取向。

- **D3 无效 `type` 不再兜底成摘要**：原 `type === 'fact' ? facts : summaries` 会把非 `fact` 值（模型打错的 `note` / `Fact` / `fact1`）当摘要写入并挤占 `maxSummaries = 20` 配额；现 `MEMORY_TYPES` 白名单显式拒绝（`delete` 照旧不要求 `type`，未知 `action` 仍先走 `unsupportedAction`）。
- **D4 无效 `memoryType` 不再谎称「记忆库为空」**：`all / fact / summary` 之外直接报错，且校验早于嵌入请求（钉住注入的 `embedQuery` 调用次数为 0，坏参数不白打一发远端嵌入）。
- **D2 `importance` 三套口径收到一处**：`normalizeImportance()` 统一 add 的 `|| 5`、去重的 `|| duplicate.importance`、update 的 `!== undefined`；可解析数字钳到 1..10，不可解析报错而不是写 NaN。`memory-tools.js` schema 补 `minimum`/`maximum` 并钉住「声明区间与 service 钳制口径一致」（关键核实：全链路不按 schema 校验入参，`enum` 只是给模型的提示）。
- **文案层测试盲区补齐**：曾有落盘脚本把 `${QJ}` 的 `$` 写丢，6 行 locale 进了字面量 `{QJ}` 而单测全绿（service 的 `t` 是 stub）——补 `memory-validation-messages` 6 例：真实 i18n 渲染 + 拒绝信息可见模型传来的原始值 + 两份语言包 327 个叶子键键集与占位符集一致（先 4 红后 6/6）。

### 安全（集成测试硬编码了本机真实配对 token）
- `api.integration.test.js` 曾把本机配对 token 写成 `process.env.AGENT_TOKEN || '<64hex>'` 兜底值并入 git——该 token 是本地管理接口唯一鉴权凭据（可读写用户工作区、改配置、导知识库），**推送即进公开历史**；全盘比对 `pairings.json` 扫描确认只此一处。
- 修：`resolveToken()` 只从环境变量或本机 `pairings.json` 取，两者都拿不到则在**发出任何请求之前** `exit(1)`；钉 3 条（集成目录不得出现 64 位 hex 字面量 / 不得出现真实 token / 无凭据时非零退出且输出不含连接类错误）。
- **需用户动作**：已入历史的 token 未改写（需显式授权），要彻底失效需重新配对。

### 技术债收口（清掉五项既有欠账）
- **`toolbox` / `knowledge` 的 hash 直达不刷新**：刷新迁到 `tabRefreshers` 注册表（**注册须早于 `activateByHash()`**，已加字符偏移断言），删除双 click 监听；真实扩展冒烟 `_tab-refresh-smoke.mjs` 17/17。
- **根套件 2 处 `document is not defined` 噪音**：`updateToolsToggleState()` 入口加 DOM 守卫，新增 `unhandledRejection` 测试精确抱住那 2 条。
- **单测写用户真实目录**：`rag-ingest-path-sandbox` 改为先覆盖 `process.env.HOME`（含 `USERPROFILE`）再动态 import 被测模块，新增两条隔离生效判据。
- **agent 代码纳入 eslint**：ignores 从整块 `agent/**` 收窄到只排 `agent/node_modules/**` 与 `agent/dist/**`；纳入前实扫 89 个文件 0 error 0 warning 并用探针正反验证。
- **agent 集成测试首跑**：四个 `rag-*.integration.test.js` 自带 `mkdtempSync` 隔离，**24/24 通过**；`api.integration.test.js` 会改运行中 agent 的配置，**仍未跑、需用户点头**。

### 变更（记忆向量配置界面：四项体验反馈 + 数据污染事故修复）
- **状态卡三态（加载中 / 成功 / 失败）**：`agentApi` 原先丢掉状态码、404 与「尚未请求」合并成同一句「读取中…」（永久读取中）；现在 `toolbox-shared.js` 给解析对象附 `data.httpStatus`（避开响应体同名字段），404 → 「重启代理」提示、其余附真实错误、未连接另给 `statusOffline`；`loadAll()` 拆 cfgTask / statusTask 两个并发且各自独立降级的请求（状态读失败不得拖垮配置回填）。
- **两颗同名不同物的保存按钮改名区分**：面板那颗写 agent `config.json`（页面底部 `#saveBtn` 写扩展自身设置）——改名「**保存到代理**」+ 职责说明行 `.memory-scope-hint`（显式写「代理（本地 agent 服务）」避开术语冲突）。
- **修「刷新配置页后记忆 Tab 跳回基础」**：根因 `validTabs` 硬编码白名单漏了新增的 `#memory`；刷新收敛成 `tabRefreshers` 注册表并在 `switchTab()` 末尾派发（覆盖按钮 click / hash 直达 / `optionsInitialTab` / `SWITCH_TAB` 四条激活路径，**注册须早于 `activateByHash()`**）。
- **记忆弹层新增「＋」跳配置快捷入口**：`#memoryLimitConfigEntry`，图标与 MCP/Skill 那颗逐字一致，走 `OPEN_OPTIONS_PAGE` + `hash: 'memory'`。
- **英文整排 Tab 省略号**：实测内宽 540px vs 英文 8 个 Tab 自然宽 550px，仅差 10px 致整排截断；去掉 `min-width:0` + `.tab-nav` 加 `flex-wrap` + padding 收窄，任何宽度零截断。**旧溢出探针记录作废**（`setContent()` + file:// 是 `about:blank`、样式根本没加载，属假绿灯；改用仓库内 file:// 夹具 + `goto` 重测，先断言 `cssApplied`）。
- **事故（上一轮测试夹具写坏用户真实数据，本轮修复）**：`withService` / `withRouter` 只注入 `filePath`，`embeddingConfigProvider` 默认读用户真实 `config.json`、向量落真实 `VECTORS_FILE`——用户 `memory-vectors.json` 41 条被覆盖成 2 条测试条目（单条实打真 key 联网 827ms；真源 `global-memory.json` 未碰，属派生缓存）；经用户授权 `reindex` 两次重建（均 `indexed:41 failedBatches:0`）+ 清 7 条孤儿后恢复，跑全量单测确认该文件 mtime 与字节数前后逐字相同。防复发：`memory-test-isolation` 33 例扫全部测试源码，要求五个注入点（`filePath`/`vectorsFilePath`/`embeddingConfigProvider`/`tierResolver`/`embedderFactory`）齐备，当场拓出第三处（`memory-recall-eval` 缺 `vectorsFilePath`）；`withVectorService` 补默认抛错的 `embedderFactory`。反向验证：退回三个旧夹具 → 结构钉 3 红且碎块用例仍联网回红；恢复后 369/369。
- **测试**：改写/新增 22 例（状态卡三态 5 + 快捷入口结构钉 4 + 结构钉 +4 + 隔离钉 33）；常驻探针 `_tab-nav-overflow` 16/16、`_memory-config-entry` 13/13、端到端 14/14。

### 新增（记忆向量配置界面 + 结构契约钉）
- **options 页新增「记忆」Tab**（`src/options/memory-panel.js`）：开关语义召回、远端/本地单选、读写 `memoryEmbedding` 配置、探活并自动回填维度、保存、重建向量索引；配置真值仍只在 agent `config.json`，扩展端全部经 HTTP 打既有端点（`/api/memory/embedding-config`・`test-embedding`・`reindex`），**agent 业务逻辑零改动**。
- **新只读端点 `GET /api/memory/vector-status`**：`{indexed, total, storedModelKey, currentModelKey, stale, tier}`；**空库不算陈旧**、`tier === 'none'` 照返 200、非 GET 落 404；刻意不含 `overWindow`（算它要 `_getPipeline()` 会触发模型下载，只读查询不得有副作用）。
- **提交体守「缺席」语义**：看不见的字段从请求体缺席、绝不交空值或 0（把已存 512 覆盖成 0 会改指纹、白逼一次重建）；apiKey 留空=不修改、明文永不回显；本地档隐藏探活按钮（冷启动实测 106 秒）改指路「保存后直接重建」；重建走确认弹窗（本地档 41 条约 23 分钟 / 远端约 2 分钟）并如实展示 `failedBatches`/`overWindow`，不锁按钮防并发双跑。
- **结构契约钉**（`memory-panel-structure` 4 例）：直接读 `options.html` 与两份语言包——Tab 已挂载、15 个 id 逐个存在、mode 值与 agent 白名单逐字一致、`memoryPanel` **中英键集完全相等**（仓库史上无 i18n parity 测试，就地补上）。
- **测试**：新增 20 例（agent `memory-service` +3 / `memory-routes` +3 / 扩展端结构钉 4 + 行为钉 10）；反向验证（stash 退回实现分别 3 红 / 2 红 / 10 红且红因准确，pop 后转绿）。
- **更正（spec 自审）**：「用户改模型只能改文件再重启 agent」不成立——`loadConfig()` 按文件 mtime 缓存、`getProvider()` 又以 `memoryModelKey` 为键，手改即生效；界面价值是**可发现、可验证、防填错、防漏重建**。样式写 `src/options/styles.css`（options.html 只加载它）；计划偏差：Task 1 基线实测 53 例、「开启态空库」在真实系统不存在（store 会懒补向量）、去掉了两个只写不读的模块变量、样式改用项目实际调色板。

### 变更（本地档 512 token 截断从静默转为可见）
- **真缺陷**：`feature-extraction` pipeline 内部带 `truncation: true` 且 `tokenizer.model_max_length = 512`；超出部分**根本不进向量且原先零信号**。走真实接缝实测真实库 41 条：**13 条超窗**，最大一条 1111 token 只吃进 512（**覆盖率 46%**），全库 token 中位数 385；知识库侧不受影响（默认 `chunkSize: 400` 已在窗口内）。
- **本轮只赢在「可见」**：`local.js` 新增 `countTokens(texts)` → `{counts, window}`（关键：必须带 `truncation: false`，跟 pipeline 口径只会永远数到 512）；`EmbeddingProvider` 以 `tokenCounter` 暴露能力、**远端档置 null**（不得臆造窗口）；`backfillVectors` 响应出 `overWindow: {count, window, ids}` + 进程日志点名；计数抛错不拖垮索引，零超窗报 `count: 0`。
- **未采纳（已拍板不做）**：分段索引（需改 id 语义与删除传播、强制全量重建）与「窗口内保头尾」压缩（同样触发重标定）——本轮不改向量内容 → **分布未变，0.48 地板继续有效**。
- **已知噪声（非缺陷）**：同条记忆向量随分批组合漂移，实测逐条 vs 同批 cos 0.9940–0.9974，**与同批有无长文本无关**，属 `dtype: 'q8'` 量化核数值噪声（mask 逐位置乘、按 mask 计数求平均均正确），只能靠换精度缓解。
- **测试**：新增 5 例（超窗进响应与日志 / 零超窗报 0 / 无能力不造字段 / 计数抛错不拖垮索引 + 能力接缝钉：本地有 `tokenCounter`、远端 null）；反向验证 stash 退回三处实现 3 红，pop 后 71/71；接缝验证在 `/tmp` 模型缓存副本上跑，**未写用户真实数据目录**。

### 变更（记忆语义档改名次融合 RRF + 三条错定作废）
- **融合从「分数相加」改为「名次融合（RRF）」**：新增 `agent/src/memory/fusion.js`（纯函数、无 IO），关键词路与语义路各排各的名次，按 `1/(60 + 名次)` 相加后重排。旧公式把不可比的两套刻度相加（41 条 cos 全落 0.26~0.64 被 `round(cos × 4)` 压成 4~6 三个整数 → 大量并列由词面打破 → 目标纯 cos 排第 1、融合后掉出前 12）。
- **语义采信门改为「查询级落点地板 + 条目级相对落差 + 条数封顶」**：`SEMANTIC_QUERY_FLOOR = 0.48` / `SEMANTIC_MARGIN = 0.05` / `SEMANTIC_MAX_TAKE = 2`。绝对 cos 条目级不成立（≥0.3 放过 40/41、≥0.45 仍放过 20/41），但查询级 top1 可分（无关 0.3340~0.4506 vs 相关 0.5467~0.6353，间隙 0.096）。删除 `MEMORY_VECTOR_THRESHOLD` 与 `vectorHit` 旁路（它让语义命中绕过关键词门槛，A 档降噪成果只在向量关闭时成立）；`vectorMatched` 语义改为「被语义路采信的条数」（上限 2），转发层 `...rest` 透传零改动。
- **真机复测（41 条真实库，测完收回 `enabled=false`）**：4 条无关查询**全部 0 返回**（首要判据达成）、填满 limit 0 条、A 档开关前后逐字一致 `1/0/0/1/1`、4 条换说法查询目标均命中；目标名次之和 8 > 计划的 6——2 名损失全部来自词面路（用纯 cos 单通道理想值考核双通道融合属口径错定，取向转计划五）。
- **配套修复**：① 本地档嵌入长度截断取消（1900 字实测零失败；计划所依据的「超长报 400」实为**远端**模型证据，张冠李戴）；② 查询前缀回落权修复——`queryPrefix` 空串被 `??` 判为非 nullish，本地 BGE 前缀永远加不上，现空白前缀删键还权（实测 provider 日志 `queryPrefix: off` → 修复后生效）；③ `reindex` 响应带 `lastError` + 日志记全量批失败。
- **三条错定作废**（取证走了另一条路导致的错定，原文已就地改写）：①「`local.js` 未开 truncation → position id 越界」→ `feature-extraction.js:97` 就是 `{padding:true, truncation:true}`，实测 `input_ids dims=[1,512]`，1902 是独立 `tokenizer.encode()` 数的非真实路径；②「mean pooling 未用 attention mask」→ 已安装入口逐位置乘 mask、除 mask 计数；③「有效信息窗口约 1200 字」→ `cos(全文, 前 1200 字) = 1.0000` 是两者都被截到同一前 512 token。当年取消截断的决定正确，但理由是错的。
- **工程质量**：新增 `memory-fusion` 12 例（含一条「不许把分离度加回来」钉）与 **B 档效果评测**（真实 bge-m3 生成的 7 文档 + 8 查询黄金向量，128KB；测试内 `embedDocuments` 直接抛错 → 零联网复现真实 cos 分布形状）；常量经「gap × margin × take」与「abs × margin × take」两轮网格标定（分离度门被数据否定）；回归钉反向验证：旧实现上 3 红、pop 后转绿；A 档评测 10 例零漂移。**已知未修（如实记录）**：agent 集成测试 84/86（2 条既有失败，与本轮无关）；agent 代码当时实际未被 lint（已由同日「技术债收口」修掉）。

### 新增（长期记忆语义召回通道：三档降级）
- **Tier A / B / C**：`none`（缺省，行为与计分逐字不变、零新增网络调用）/ `remote`（OpenAI 兼容 embedding + 进程内 brute-force 余弦，≤ 70 条量级不引向量库依赖）/ `local`（依赖缺失静默降回 A）；档位由纯函数 `tier.js` 判定（apiKey / modelName trim 后判空，空白不得误判）。
- **向量是派生缓存**：`vectors.js` → `memory-vectors.json` 可整删、可损坏、缺失一律当空且不抛错；`global-memory.json` 仍是唯一真源；缓存键 `mode|modelName|dimensions` 任一变化即整体作废（`'512'` 与 `512` 归一为同键）。
- **两路计分同尺（初版，后由同日 RRF 节作废）**：语义命中叠加 `+3 + round(cos × 4)`、阈值复用知识库默认值——后被名次融合替代。
- **嵌入调用移出记忆互斥锁**：档位判定与查询向量在取锁之前完成（锁是进程内 Promise 链、无超时逃生口，一次 8s 挂起会堵死同进程所有写入）；嵌入报错/超时该次召回静默退回关键词通道且仍返回 200。
- **生命周期对齐**：store 的新增、去重命中改写、update 成功后以 microtask 懒补向量（绝不 `await`）；delete 与 compact 淘汰同步 `dropVectors`。
- **三个新端点**：`POST /api/memory/reindex`（未启用返 `skipped` 仍 200）/ `GET|POST /api/memory/embedding-config`（明文 key 永不回显 + `hasApiKey`）/ `POST /api/memory/test-embedding`（探活 8s 超时）；`recall` 响应新增 `tier` 与 `vectorMatched`，转发层 `...rest` 零改动。
- **修复配置字段名错位**：`memoryEmbedding.baseUrl` 与 provider 读的 `endpoint` 不一致 → 远端档永远请求 `/embeddings`（`Failed to parse URL`），由 `toEmbeddingProviderConfig()` 单点映射修复；该缺陷只在真链路暴露（单测注入假工厂看不见，冒烟走真实 provider 才炸出来）。附带修 `updateConfigField` 自锁；关键词提取抽为 `tokens.js`。
- **工程质量**：新增 `memory-tokens`（7）/`memory-vectors`（12）/`memory-tier`（9）/`memory-embedding-config`（14）与 `memory-service` 向量通道 17 例、`memory-routes` reindex 4 例（记忆相关合计 115 例）；agent 全量 **220 → 290**，原有 25 条 A 档用例一条未改（零漂移护栏）；冒烟 16 → 21 项（预置「已启用但端点不可达」不真联网，断言配置脱敏、不可达时 `recall` 仍 200、不留半成品向量、`reindex`/`test-embedding` 明确 400、错误文案不是 `Failed to parse URL`）；README 中英对称补 Tier 小节与三端点行。

### 变更（记忆关键词通道对齐知识库）
- **计分口径换血**：从「query 炸成最多 30 个碎 bigram、每个命中 +3」改为「最长命中片段的单元制」（L=2→1 单元 / L=3→2 / L≥4 顶格 3，每字段封顶后 × 字段权重）。旧口径下「写网」「个国」这类随机 2 字块几乎必然命中，命中 4 个碎块（+12）高于命中一个 4 字整词（+3），**排序方向是反的**。
- **与知识库共用一份匹配实现**：匹配语义上收为 `rag/keyword-match.js`，`rag/searcher.js` 逐字平移复用（**既有 18 条关键词用例一条未改**）；`rag` 命中 `storage` 的子串误伤随词边界统一而消失。
- **两道噪声闸门**：① 文档频率剔除（命中过半候选的单元不计分，`df ≤ 2` 恒豁免）；② 命中门槛 `full || units >= 2`（门槛故意不看 `score`）。停用词表随碎块方案退场；查询不再截到前 200 字（最坏情形 1852 字 × 41 条候选实测 46ms）。
- **真实库实测（41 条只读副本）**：5 条换说法查询的无关返回 **43 条 → 3 条**（单查询 8/6/3/16/10 → 1/0/0/1/1），Vue 偏好仍稳 top1，`pnpm`/`依赖`/`rag` 短查询仍可命中。**代价**：只沾 2 字碎块的条目 A 档不再返回——「换个说法也能找到」属向量通道的责任。
- **新增评测集**：`memory-recall-fixtures.js` + `memory-recall-eval.unit.test.js`（合成 7 条形态对齐真实库 + 10 条查询），改动前基线量成 4 项红、后全绿；agent 单测 **298 → 306**，vitest 81 文件 / 1271 用例，扩展端零改动。

### 变更（会话上下文压缩增强 + 开关回填修复）
- **结构化双语摘要模板**：`compaction-prompt.js` 由自由段落改为固定四小节（任务目标 / 已完成与关键结论 / 关键标识符 / 未决问题与下一步），指令块随背景语言走 `getLanguage()` 渲染中英两套；`【已有摘要】`标记语言无关，增量压缩仍可识别。
- **注入链路单点收敛**：新增 `applyCompactionInjection()`（`context-usage.js`），三条发送链路（`chat-manager.sendMessage` / 划词提示词 / `sendPromptByCode`）改为同一出口，锚点失效只告警不污染系统提示词；源码扫描守卫锁定不再漂移。
- **阈值驱动的半自动压缩（默认关）**：`auto-compaction.js` 发送前满足「开关开 + 非生成中 + 会话隔离 + 待处理消息 ≥ 4 + 上下文占用 ≥ 85%」则静默压缩一次；连续失败 2 次退避、手动成功即复位；**任何失败都放行本次发送**；手动/自动共用 `runCompaction({ silent })` 单一内核。
- **摘要按 memoryId 去重沉淀长期记忆（默认开）**：`compaction-memory.js` 以 `type: summary` / `importance: 6` / `tags: [compaction, session:<id>]` 写入；同会话二次压缩走 `update`（不堆条目）；沉淀失败仅 warn 且保留原 `memoryId`，Agent 未连接或 404 静默降级。
- **两个开关 + 回填修复**：记忆下拉新增「自动压缩」「摘要存入记忆」两行 28×16 小滑动开关，切换即写 storage 并同步 `storage.onChanged`；修复「刷新后回弹」——`.checked` 原先只在 `DOMContentLoaded` 盖一次（那一刻 `GET_CHAT_CONFIG` 尚未往返，拿到的是模块默认值），改为 `loadChatConfig().then()` 回填、以 storage 为唯一真源。
- **测试**：新增 `compaction-prompt`（+6）/`auto-compaction`（18）/`compaction-memory-persist`（6）/`compaction-injection-wiring`（8）/`context-usage`（+4）/ 开关回填守卫（+2）；vitest 81 文件 / 1271 用例；冒烟补 4 项摘要沉淀断言（16 项全通）。

### 变更（长期记忆逻辑下推 Agent 端）
- **架构错位消除**：记忆全部业务逻辑（存储、召回计分、会话去重、审查/淘汰、三级注入筛选）从扩展端 background 整体迁入 agent 包（`agent/src/memory/{injection,service,routes}.js`），与数据文件 `global-memory.json` 同进程；agent 新增 `POST /api/memory/{store,recall,manage,inject}` 四端点。
- **扩展端瘦身为转发层**：`tool-memory.js` 752 行 → 85 行（只做 subAction→action 映射、sessionId 透传与结果整形）；`GET_PERMANENT_NOTES` 改请求 `/api/memory/inject`；删除 `memory-injection.js` 与死导入。
- **原子性与生命周期修复**：互斥锁从扩展 SW 内存锁改为 agent 进程内 Promise 链锁（不再受 MV3 SW 重启影响、不再有跨 HTTP 两次文件调用非原子的丢写）；会话召回缓存常驻 agent 内存；`manage compact` 淘汰同步摘除召回缓存。
- **不兼容提示**：不做新旧版本兼容（插件与 Agent 对应发布）；旧版 Agent 遇记忆端点 404 直接返回升级指引、**不回退通用文件 API**；Agent 未连接时记忆整体不可用（不建本地双存储）。
- 行为逐字平移：数据结构、三级注入参数（importance ≥ 8 / 1500 字符 + 12 条）、召回计分（content+3 / title+2 / tags+2 / 原句+5）、价值公式与淘汰线（value<10）均未变。
- **测试**：agent 新增 `memory-service`（25）/`memory-routes`（8）/`memory-injection`（18），全量 **169 → 220**；扩展端新增 `tool-memory-forward`（12）；冒烟 `memory-pushdown.smoke.mjs` 12 项（临时 HOME + 独立端口 18977 拉起真实 server：配对→store→recall（含会话去重）→inject→manage(review)→落盘位置→400/404 语义→delete 后不再注入），压缩增强后增至 16 项。

**当日收口（全部实测）**：agent 单测 **387/387**、根 vitest **1306/1306**（86 文件）、rag 集成（隔离部分）**24/24**、`npm run lint` 干净、`npm run build:silent` BUILD_SUCCESS。

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
