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
8. **底部锚定不遮输入框**：不再复用共享的 `clampPanelToViewport`（它只按视口底 -8px 夹，正好会把面板压到输入框上），`todo-panel` 从 `OPEN_PANEL_SELECTOR` 名单移除；改为量 `.input-container` 顶边，写私有 `--todo-max-h` 与 `--fit-y`（仅负值），并用 `ResizeObserver` 跟输入区增高；量不到时回退 `innerHeight - 160`。

**与设计稿的两处偏差**（实现时纠正）：① 优先级不做二级菜单，直接在行 `⋯` 里给四个色块档位（二级菜单在 320px 浮层里难用）；② 色条 token 用仓库**实际存在**的 `--danger-500` / `--warning-500` / `--brand-500`，而非设计稿写的 `--brand-red/amber/blue-500`（不存在）。

**两个实现缺陷由探针暴露**（单测看不见）：① `handleChange` 的 link 分支缺 `linkEditId` 守卫，重渲染拆掉脏输入框时浏览器补发 `change` → 双写双 toast；② 「取消」按钮点下去时 `change`/`focusout` 都比 `click` 早，自动保存抢跑使取消变成死按钮 → 改为在 `pointerdown` 就 `cancelLinkEdit()`。两条都已补源码守卫单测与探针 O3b/O6b。

**验证面新增**：单测 `todo-model` 39 例 / `todo-manager` 29 例 / `todo-panel-structure` 56 例（双 Tab、状态动作可见、优先级色条、外部链接、菜单不换行、几何夹取、i18n 中英成对）；探针新增 M（标记完成入口+撤销+智能恢复+菜单不换行实测）、N（色条真实渲染色与 token 同值）、O（胶囊/开标签/非法拒收/移除/取消/重载持久）、P（面板底边与输入区上沿的几何不变量、输入区增高跟随、矮窗口）四组，整轮跑 ALL CHECKS PASSED。
