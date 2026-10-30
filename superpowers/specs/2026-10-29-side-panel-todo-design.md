# 侧边栏待办（Todo）面板 · 设计

日期：2026-10-29 ｜ 分支：`feat/side-panel-todo` ｜ 示意：[mockups/todo-panel-mockup.html](./mockups/todo-panel-mockup.html)

## 1. 目标与范围

在侧边栏右侧入口轨道新增第 6 个入口「待办」，点开为右缘浮层，支持快速录入、状态流转、备注、拖拽排序、时间属性，并一键把清单以 Markdown 填入问答输入框，供用户接着向 AI 提问规划。

**已确认的产品决策**

| 决策点 | 结论 |
|---|---|
| 数据范围 | 全局一份（不随会话切换） |
| 状态分组 | 两段式：「进行中」（含 `pending` + `doing`，用视觉标记区分）/「已完成」 |
| 面板形态 | 右缘浮层，锚定入口按钮，与收藏/搜索/定时任务同族 |
| AI 联动 | 仅「一键填入输入框」（不新增后端/内置工具） |
| 截止时间 | 做，基于原生 `<input type="date">` |
| 已完成组 | 默认折叠，记住上次展开状态（`chrome.storage.local`） |
| 入口次序 | `workspace → bookmark → toc → search → todo → schedule` |

**明确不做（YAGNI）**：置顶（拖拽已可置顶）、跨组拖拽（状态只通过状态圈改）、提醒推送、日历视图、todo 与定时任务的互转、AI 直接读写 todo 的内置工具。

## 2. 布局与视觉

- 入口复用现有轨道机制：`SLOT_ORDER` 增加 `todo`，`flex column + space-evenly + gap:10px`，槽高 34px，垂直对齐与其余入口一致，无需任何手写定位。
- 入口尺寸语法与收藏/搜索一致（`position: relative` 容器 + `justify-content: flex-end` + `padding: 8px 4px` → 24×34），不撑满 28px 轨道；面板 `width: 320px` + `max-width: calc(100vw - 44px)`。
- 最小占位：6×34 + 5×10 = 254px；新增 `@media (max-height: 620px)` 兜底降为槽高 30px / gap 8px（220px），避免矮窗口下与聊天区互相挤压。
- 配色取主题中**尚未被其它入口占用**的 `--brand-violet-rgb` / `--brand-violet-500`，维持 tinted 语义风格；未完成数徽标 `--brand-violet-500` 底、白字，>99 显示 `99+`，为 0 隐藏。
- 图标：方框 + 勾选的清单图标。

## 3. 面板交互

**结构**：Header（图标 + 「待办」 + `3 / 8` 计数 + 进度条 + 「填入输入框」+ `⋯` + `×`）→ 快速添加行 → 「进行中」组 → 「已完成」组。

> 本节的「两组同列 + 折叠」结构已在 2026-10-30 的 UX 重做中被双 Tab 取代，见 §9。

**行**：`状态圈 + 标题（2 行截断）+ 备注折叠条 + 元信息（截止 / 相对时间）`。

- 状态圈点击循环 `pending → doing → done`；`doing` 额外显示左侧 2px 竖条与实心点；`done` 移入已完成组并记录 `completedAt`。
- 备注：仅当存在备注时出现一行「› 备注」，点击就地展开；默认收起，不占空间。
- 时间：创建时间用相对时间（`2 小时前`）；截止按**日粒度**设置（`<input type="date">`，落库为当日 00:00 本地时间），显示 `今天` / `明天` / `11-3`；逾期判定也按天比较（`startOfDay(dueAt) < startOfDay(now)`，今日到期不算逾期），逾期时前置告警图标并写作 `已逾期 {日}`；已完成显示 `10-28 完成`。
- 拖拽：整行 `draggable`，插入位置画紫色虚线，仅组内排序；已完成组不可拖。

**按钮分层（清爽的关键）**

| 层级 | 内容 |
|---|---|
| 常驻行内 | 状态圈、标题 |
| 悬停 / `:focus-within` 浮现 | 编辑、复制本条、`⋯` |
| 行 `⋯` 菜单 | 编辑标题、添加备注、设置截止、删除 |
| Header 常驻 | 填入输入框 |
| Header `⋯` 菜单 | 复制到剪贴板、复制并附提问模板、清除已完成 |

**键盘与可达性**：全部图标按钮带 `title` 与 `aria-label`；操作区在 `:focus-within` 时同样显示，Tab 可达；快速添加输入框 `Enter` 新增并保持焦点，`Esc` 清空。

## 4. 数据与存储

数据模型：

```js
{ id, title, note, status: 'pending'|'doing'|'done', order, dueAt, createdAt, updatedAt, completedAt }
```

- 存储：IndexedDB（`src/storage/db.js`），`DB_VERSION 6 → 7`，新增 `todos` store（keyPath `id`，索引 `status`、`createdAt`），提供 `getAllTodos / putTodo / putTodos / deleteTodo / deleteTodos`。沿用既有 `withStore`、`onversionchange`、`onblocked` 处理。
- 内存：`state.todos` 缓存，写操作「先改 state 再落库」，落库失败回滚并 toast。
- 排序：`order` 升序，缺失回退 `createdAt`；新增置于进行中组末尾；拖拽后把该组 `order` 重写为 `0..n-1` 并批量写回。

## 5. 一键填入输入框

生成 Markdown 清单（进行中在前、已完成在后），追加到 `#userInput` 现有草稿之后（两个换行分隔，不覆盖、不自动发送），聚焦到末尾并调用 `adjustInputHeight()`，随后关闭面板并 toast。

```
**进行中**
- [ ] ⏳ 把待办入口接进 side-rail 第 6 槽位
  - 备注：6 槽太挤时压缩槽高到 30px
- [ ] 拖拽排序要显示插入虚线

**已完成**
- [x] 确定入口配色（10-28 完成）
```

「复制并附提问模板」在此基础上追加一行：`请基于以上待办，给出实施顺序与风险提示。`

## 6. 模块划分

| 文件 | 职责 |
|---|---|
| `src/storage/db.js` | todos store 与 CRUD（纯数据） |
| `src/side_panel/todo-model.js`（新） | 无 DOM 纯逻辑：分组、排序、状态循环、重排、Markdown digest、时间格式化 |
| `src/side_panel/todo-manager.js`（新） | state 同步 + 持久化编排 + 徽标刷新 |
| `src/side_panel/todo-panel.js`（新） | 入口按钮、浮层、事件委托、拖拽、更多菜单、i18n |
| `src/side_panel/side-rail.js` | 槽位顺序与打开态面板选择器 |
| `src/side_panel/index.js` | `loadTodos()` + `initTodoPanel()` 接线 |
| `src/side_panel/state.js` | `todos` 状态位 |
| `src/side_panel/styles.css` | 入口 tinted 样式、面板、行/组/悬停/拖拽、矮窗兜底 |

## 7. 测试

- `test/unit/todo-model.unit.test.js`：分组边界（空表 / 全完成）、`order` 缺失回退、状态循环、重排结果、digest 文案与 `withPrompt`、时间格式化（今天/昨天/本年/跨年）。
- `test/unit/todo-manager.unit.test.js`：编排层行为（14 例：成功新增/载入补齐；每条失败路径只撤销本条且必须广播回滚；不存在 id 一律拒绝；并发时序 3 例——串行排队、重排失败不抹期间改好的标题、清除失败不影响期间新增的条目）。
- `test/unit/todo-panel-structure.unit.test.js`：入口槽位数为 6；`.todo-item-actions` 默认 `opacity: 0` 且 `:hover/:focus-within` 为 1；样式零硬编码色值（只用 `var(--token)` / `rgba(var(--x-rgb), a)`）；面板复用 `clampPanelToViewport`；`todo-model.js` 不引入 DOM 依赖；重渲染前必须先采集草稿与焦点、失败分支必须走 `persist()`、`max-width` 为停靠条留走廊、不留无人调用的导出。
- 回归：全量 `vitest run` + `npm run build:silent`。
- 真实 MV3 探针 `test-results-probes/_todo-panel-visual.mjs`（36 项）：入口尺寸/槽内偏移与兄弟入口逐个比对、快速添加、两次点击状态流转、组默认折叠、hover 前后 `opacity`、真鼠标拖拽改序 + 重载持久化、填入输入框保留草稿、暗色截图、无 `pageerror`；以及代码评审后的回归项：未提交行内编辑在他人操作触发的重渲染中存活、焦点与光标保持、保存后编辑器收起、重载后落库正确，以及 360px 窄窗下面板左缘不把停靠条走廊吃掉、与定时任务同开时 `elementFromPoint` 命中待办，以及删除链路 L1–L3（全局确认弹窗真实出现 → 条目移出且仍弹「已删除」→ 重载后不复活）。

## 8. 风险

- DB 版本升级：SW 与 side panel 可能同时持有旧连接；既有 `onversionchange`/`onblocked`/`withStore` 重试已覆盖，新增 store 沿用同一升级回调，`withStore` 的 store 缺失重试也会兜底。
- 入口增至 6 个：仅在极矮窗口有挤压风险，已加媒体查询兜底。

## 9. 2026-10-30 UX 重做（实现记录）

上线后用户实测反馈四个硬伤：只看到一堆「进行中」（组名误导）、`0 / 11` 看不出分子、**找不到「标记完成」入口**（只有删除）、已完成条目被顶到屏幕外。另外要求菜单不换行、要优先级、要能关联外部链接、面板底部不能盖住问答输入框。以下为本轮实际落地的变更，与本节冲突处以本节为准。

1. **双 Tab 取代折叠分组**：`待办` / `已完成` 一次只渲染一组，各自带条数（`data-group="active|done"`）；折叠偏好不再使用。在已完成 Tab 里添加会自动切回待办 Tab。
2. **进度文案自解释**：头部写 `完成 1 / 3`（`progressLabel`），不再只给 `1 / 3`。
3. **状态入口两条路径**：状态圈依旧循环点击，但行尾 `⋯` 菜单里必须有文字版 `开始处理 / 标记完成 / 退回待办`。
4. **撤销与智能恢复**：`done` 时记录 `prevStatus`，离开 `done` 清除；标记完成后弹面板内联撤销条（6s，`showToast` 是 `textContent` 实现、塞不了按钮），撤销走 `restoreTodo` 并**保持 `order` 原位**而不是落到末尾；已完成 Tab 的恢复目标由 `restoreTarget()` 决定（完成前是处理中就回处理中，否则回待处理）。
5. **优先级**：`priority: 'high'|'medium'|'low'|null`，模型层 `normalizePriority` 白名单过滤；行首 3px 竖条只表优先级，`doing` 改用圈内实心点 + 淡底，两者不抢同一个位置。
6. **外部链接**：`link` 存绝对地址；`normalizeLink` 剔前导斜杠、缺协议补 `https://`、协议白名单 `http:/https:`，返回 `{url, host, valid}`。非法链接在编排层就拒（`reason:'invalid'`），不进乐观更新。胶囊是普通 `button`（**`href` 不写进 DOM**），点击才 `chrome.tabs.create({url})`；清空回车即移除。摘要只写合法链接。
7. **菜单不换行**：`.todo-menu` 为 `width: max-content` + `white-space: nowrap`，按视口右缘/高度夹取，超长可滚动。
8. **底部锚定不遮输入框**：不再复用共享的 `clampPanelToViewport`（它只按视口底 - 8px 夹，正好会把面板压到输入框上），`todo-panel` 从 `OPEN_PANEL_SELECTOR` 名单移除；改为量 `.input-container` 顶边，写私有 `--todo-max-h` 与 `--fit-y`（仅负值），并用 `ResizeObserver` 跟输入区增高；量不到时回退 `innerHeight - 160`。
9. **高度只增不减**（用户反馈第二轮）：双 Tab 上线后出现新问题——两个 Tab 条目数不同，面板高度按内容走，切 Tab 整块上下跳。口径不是“打开即锁死”（那样只有 1 条时面板会很矮），而是 `heightFloor = min(available, max(heightFloor, 内容自然高))`：添加条目继续长高，到可用上限为止；切到条目更少的 Tab 或删条目不回缩；`openPanel`/`closePanel` 把 floor 与 `height` 归零，所以每次重新打开都按新内容重算。测量前必须先把 `height` 临时置 `auto`，否则量到的永远是上一次写回的值。
10. **撤销条不换行**：`button` 在 flex 容器里的 `min-width:auto` 只等于一个汉字宽，标题一长「撤销」就被压成竖排两行；补 `.todo-undo .todo-mini-btn { flex: 0 0 auto; white-space: nowrap; }`，长标题交给 `.todo-undo-text` 的 ellipsis 承接。

**与设计稿的两处偏差**（实现时纠正）：① 优先级不做二级菜单，直接在行 `⋯` 里给四个色块档位（二级菜单在 320px 浮层里难用）；② 色条 token 用仓库**实际存在**的 `--danger-500` / `--warning-500` / `--brand-500`，而非设计稿写的 `--brand-red/amber/blue-500`（不存在）。

**两个实现缺陷由探针暴露**（单测看不见）：① `handleChange` 的 link 分支缺 `linkEditId` 守卫，重渲染拆掉脏输入框时浏览器补发 `change` → 双写双 toast；② 「取消」按钮点下去时 `change`/`focusout` 都比 `click` 早，自动保存抢跑使取消变成死按钮 → 改为在 `pointerdown` 就 `cancelLinkEdit()`。两条都已补源码守卫单测与探针 O3b/O6b。

**验证面新增**：单测 `todo-model` 39 例 / `todo-manager` 29 例 / `todo-panel-structure` 56 例（双 Tab、状态动作可见、优先级色条、外部链接、菜单不换行、几何夹取、i18n 中英成对）；探针新增 M（标记完成入口+撤销+智能恢复+菜单不换行实测）、N（色条真实渲染色与 token 同值）、O（胶囊/开标签/非法拒收/移除/取消/重载持久）、P（面板底边与输入区上沿的几何不变量、输入区增高跟随、矮窗口）、Q（Tab 来回切高度不变、添加条目仍长高、超长标题下撤销按钮不折行且文本被截断、重开面板锁定归零）五组，整轮跑 ALL CHECKS PASSED。

## 10. 2026-10-30 第二轮：语言热切换、快捷键、导入导出、统计

用户提了六件事：切语言必须重启插件才生效；待办操作要支持快捷键；只要单条填入、去掉批量；条目要能拖进输入框且带组合文本；头部要显示处理中条数；要一个统计视图看完成情况与比例。以下是本轮实际落地。

**10.1 语言热切换（三处一起修）**

单点修不掉：① 面板骨架文案原本写成 `t(...)` 插值，只会在建 DOM 那一刻定稿 → 全部改为 `data-i18n` / `data-i18n-placeholder` / `data-i18n-title` / `data-i18n-aria-label`，由 `applyI18n(containerEl)` 统一填充；② JS 拼出来的列表 / 菜单 / 统计浮层不归 `applyI18n` 管 → 各自 `subscribe()` 重渲染（统计浮层只在 `.show` 时刷）；③ `initI18n()` 是异步、`initTodoPanel()` 是同步，骨架可能先建在默认语言上 → 用 `.then()` 补一次 `render()`。结论：切语言立即生效，不用关面板、更不用重开插件。

**10.2 快捷键（Alt + 字母，作用对象是当前行）**

沿用仓库既定样式（`e.altKey && !shift/ctrl/meta` + `e.code`）。`Alt+T` 开关面板、`Alt+A` 聚焦添加框（这两个面板关着也生效），`Alt+B` 备注、`Alt+L` 链接、`Alt+D` 完成/退回、`Alt+P` 循环优先级（这四个只对聚焦行生效）。`↑`/`↓` 在行间移动焦点，`focusin` 把 `activeId` 记成当前行，重渲染后 `restoreRowFocus()` 送回同一行——否则按一次键焦点就掉到 `body`。全部词条登记在 `side_panel.html` 的 `#shortcutsModal` 与 `locales/{zh,en}.js`。

**10.3 只留单条填入，并支持拖拽**

批量的「填入输入框」「复制清单」删除（积压越多越没意义，用户原话）。`buildItemDigest(todo)` 与整单摘要共用 `itemLine` / `noteLine`，所以单条与拖拽落下的文本口径完全一致：标题行（含状态标记、高优先级、截止）+ 备注行 + 链接。拖拽复用行 `⋯` 的同一份文本（`dataTransfer.setData('text/plain', digest)`），落在 `#userInput` 即追加，不自动发送。

**10.4 导入导出：先范围、再格式**（菜单形态与替换确认已被 §11 取代，保留为历史记录）

- 文件内容由 `todo-model` 生成（纯逻辑、可单测）：`buildTodoExportPayload` 输出 `{kind:'todos', version:1, scope, exportedAt, todos}`（字段白名单，`prevStatus`/`order`/`completedAt` 都带，才能回导），`buildTodoMarkdownExport` 输出给人看的清单。
- 浏览器侧 `todo-io.js` 只管落地：Blob + `URL.createObjectURL` + `a[download]`，用完 `revokeObjectURL`；选文件 `<input type=file accept=".json,application/json">` 必须同时接 `change` 与 `cancel`，否则用户取消时 Promise 永久悬着。
- 文件名 `ai-helper-todos[-active|-done]-YYYY-MM-DD.ext`；范围内为空就在 UI 层拦掉，不生成空文件。
- 导入默认合并：`mergeTodoImport` 只往后追加、同 `id` 跳过不覆盖，`order` 接着现有最大值往后排；失败只摘掉本次新增的条目。替换需二次确认，先 `deleteTodos` 再 `putTodos`，**写失败把 `previous` 回写库**；空文件 / 坏 JSON 直接拒绝并保留现有数据（`reason:'empty'` 与 `reason:'json'`/`'format'`）。导入成功切回待办 Tab。
- 头部菜单六项且**每项都带图标**（混排会让文案左缘参差，这点由探针截图看出，已补结构守卫）。

**10.5 处理中计数 + 完成流水 + 统计浮层**

- `groupTodos` 的 `stats` 从三字段扩到 `total/done/active/pending/doing`；进度行 `完成 d / t` 后按需追加 `· 处理中 z`（z=0 不占字）。
- 完成率与近 7 天趋势骗不出来，所以加一份轻量流水：`chrome.storage.local.todoStatsLog = { 'YYYY-MM-DD': { added, done } }`，保留 90 天，读-改-写在独立 `writeChain` 里串行，失败只 `logger.warn` 不影响待办主流程。`addTodo` +added、进入 `done` +done、离开 `done` 按 `completedAt` 那天 -done（跨天撤销要扣对那天）。
- `summarizeStats(todos, log)` 产出四态 + 逾期 + 未完成高优先级 + 整数完成率 + 今日 added/done + 近 7 天正序 + 连续完成天数（今天还没完成就从昨天起算）。
- 视图拆成 `todo-stats-view.js`（纯渲染，只依赖 i18n，可直接单测柱高归一化与除零）与 `todo-stats-panel.js`（挂载/开关/键盘）。入口在头部菜单首项，独立浮层 z-index 10015（低于 `.todo-menu` 的 10020），`Esc` / 遮罩 / `×` 三种关法，关掉摘监听，开着时切语言立即重刷。

**验证面**：`todo-model` 54 例、`todo-manager` 39 例、`todo-panel-structure` 87 例、`todo-io` 10 例、`todo-stats` 10 例、`todo-stats-view` 5 例；全量 `vitest run` 224 文件 / 3513 例全绿。新增探针 `test-results-probes/_todo-io-stats.mjs`（40 项）：处理中计数、header 六项菜单与二级格式菜单不越界、统计浮层数值/7 柱/层级/三种关法/完成后再开数字跟随、导出 JSON 与 Markdown 真下载且内容可回导、空范围不导空文件、合并去重与重复导入提示、坏 JSON、替换二次确认、**空文件替换不清库**、切语言后浮层与菜单立即变英文。`_todo-panel-visual.mjs` 同步修正三处过期断言（批量入口已删、`:focus-within` 会浮现操作、点哪行焦点跟哪行）。

## 11. 2026-10-30 第三轮：入口收敛、快捷键可见、面板撑高、两个点击失效的 bug

用户提了四个体验点 + 两个 bug：导出/导入菜单太多；行菜单里的快捷键没有标注；面板太矮只能看三四条；「复制本条 / 复制并附提问模板」点击没反应；统计菜单顶上多一条分割线。

**11.1 导出/导入各收敛到一个入口 + 一张弹窗**

- 头部菜单从六项降到三项：`stats` / `export-options` / `import-options`。「导出…」弹 `openExportOptions()`（`src/side_panel/todo-io-dialogs.js`），**范围三选一（各自带条数）+ 格式二选一同屏**，确认才调既有的 `exportTodoScope(scope, format)`；范围为空时确认按钮 `disabled` 并亮出 `data-io-hint`，`confirm()` 里再挡一层（不生成空文件）。
- 「导入…」先 `pickTodoImportFile()` → `readTodoImportFile()`，解析成功才弹 `openImportOptions({count, existing})`；摘要写明「文件 N 条 / 当前清单 M 条」，选择合并/替换后各自落到 `importTodos(todos, mode)`。**替换的二次确认就是弹窗里的警告条**（选中 `replace` 即 `data-io-warn.show`），不再额外弹 `customConfirmOverlay`；坏文件根本走不到选方式这一步。
- 弹窗是纯函数 + 瘦控制器：`buildExportDialogHtml(state, counts)` / `buildImportDialogHtml(state, info)` 可单测，控制器只做「挂载 / `change` 回写 `session.state` / `sync()` 只切 disabled 与 `.show`（不重建 DOM，免得丢焦点）/ `settle()` / `Esc`」。层级 10015，低于 `.todo-menu` 的 10020。

**11.2 菜单项右侧标出快捷键**

根因是数据里没有快捷键字段：`kbdHtml(shortcut)` 只在真有键时输出 `<kbd class="todo-menu-kbd">`，`menuRowHtml` 两处（普通项与色块行）插入；数据侧 `statusMenuItems` / `openRowMenu` 补 `shortcut`：`set-done`/`restore` → `Alt+D`、优先级行 → `Alt+P`、`edit-note` → `Alt+B`、`edit-link` → `Alt+L`，其余项不占位。角标 `margin-left:auto` 右对齐。

**11.3 面板按输入区上沿撑高（根因修复）**

旧算法用**面板自己的底边**当基准算可用高度（`rect.bottom - TOP_RESERVE`），而面板本来就悬在输入区上方，等于自己限制自己：探针实测 `inputTop 752 / rect.bottom 629 / maxH 520`，白白少掉 100px+；同时 `--fit-y` 只允许 `Math.min(0, …)`，面板悬空 123px 却没有办法贴上去。改为：

- `limit = measureInputTop() - BOTTOM_GAP(8)`，`available = max(MIN_PANEL_HEIGHT(220), floor(limit - TOP_RESERVE(108)))` → 同场景 `maxH 520 → 635`（约多两条）。
- `dy = floor(limit - rect.bottom)` 正负都写：悬空向下补齐（实测 `+115px`），越界向上让开；`.todo-panel.expanded` 自己声明 `transition: opacity 0.2s ease, visibility 0.2s`（反掉基类的 `transform` 过渡），位置一次定好后不再滑动。
- 保持「高度只增不减」策略：条目少就按内容矮，条目多才长到 `available`，之后转列表滚动。

**11.4 两个 bug 的根因**

- 复制无反应：菜单点击统一进 `handleMenuAction`，而该 `switch` 没有 `copy-item` / `copy-item-prompt` 分支（落到 `default: return`）；处理器只活在 `handleClick` 里，服务的是第 9 轮已删除的行内复制按钮。修法是把 case 迁到 `handleMenuAction` 并删掉 `handleClick` 的死分支，同时补一条**静态守卫**：把 `statusMenuItems` / `openRowMenu` / `headerMenuItems` 里所有 `action` 抽出来，逐个断言 `handleMenuAction` 有对应 `case`——以后新增菜单项忘了接处理器会被单测拦住。
- 统计顶上多一条线：`divider: true` 挂在 `headerMenuItems()` 首项上，而 `menuRowHtml` 把分割线渲染在**该项上方**，菜单顶上空无一物就得到一条没来由的横线。修在 `openMenuAt` 渲染前把首项 `divider` 归零（不在数据里逐项删，避免以后调整顺序又冒出来）。

**验证面**：`todo-panel-structure` 95 例（新增「菜单动作必须有落点」「菜单分割线」「行菜单标注快捷键」三个 describe，并重写导入导出与面板几何的旧断言）、新建 `todo-io-dialogs` 13 例（jsdom：两种弹窗结构、空范围禁用、头部菜单契约、导入顺序 pick → options → importTodos、样式 token 与层级、中英词条成对）；待办相关 7 个测试文件共 224 例全绿，全量 `vitest run` 226 文件 / 3553 例（4 例失败全在 `src/background/*`，与本轮无关）。探针 `_todo-io-stats.mjs` 重写 S/T/V/W 四组（43 项全绿）：三入口菜单、弹窗内范围+格式同屏与条数、空范围禁用+硬点不出文件、真下载 JSON/Markdown、选文件后选方式、摘要条数、替换警告条、坏文件不问方式、**空文件替换不清库**、弹窗开着切语言；`_todo-panel-visual.mjs` 新增 R 组（首项无分割线、角标与真实快捷键一致、复制与复制并附模板真的调到 `clipboard.writeText`）并把 P 组断言从「底边在输入区上方」改为「底边贴住 `inputTop - 8`」，另加限高按输入区上沿算足的根因断言。
