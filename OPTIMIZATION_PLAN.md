# AI Helper Token 使用统计优化方案

> **本次实施范围**：仅聚焦 Token 使用统计展示优化。ReAct 循环相关的 token 节省优化（prompt caching、本地规则摘要、动态工具截断、trimMessages 阈值调整等）**暂缓实施**，详见"四、暂缓说明"。

---

## 一、背景与目标

当前 AI Helper 已实现 Token 使用统计的基础采集与展示（[src/storage/token-store.js](src/storage/token-store.js)、[src/side_panel/token-stats-panel.js](src/side_panel/token-stats-panel.js)），但在**有限的侧边栏空间内**（模态框 520×540），信息组织平铺直叙、缺乏可视化趋势、无法按时间/模型/调用类型下钻，用户难以快速判断 token 消耗结构与异常。

本方案聚焦：
- **信息密度**：Tab 化布局，在同样的空间内承载 3 倍信息
- **可视化**：纯 SVG 手写 sparkline / 堆叠条 / 区间条，不引入图表库
- **多维度下钻**：按会话、按天、按模型、按 callType 多视角聚合
- **性能**：IndexedDB 索引优化 + 按天预聚合，支持大数据量场景

---

## 二、Token 统计展示优化

### 2.1 决策记录

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 费用估算 | **方案 C：不做费用** | 单价数据源不可靠且会变动，零维护、永远不踩坑 |
| 布局策略 | **Tab 化** | 侧边栏空间有限（模态框 520×540），平铺会拥挤 |
| 图表库 | **纯 SVG 手写** | 避免引入 chart.js/echarts 增加包体积，sparkline 和条形图手写足够 |
| 数据聚合 | **前端聚合 + IndexedDB 索引** | 后端预聚合成本高，前端聚合灵活且已有基础 |

### 2.2 空间约束

- 模态框 `max-width: 520px; width: 90%; max-height: 540px`（[side_panel.html:346](side_panel.html#L346)）
- 侧边栏宽 400px 时模态框实际只有 360px
- 顶部固定区约 140px（标题栏 + 副标题栏 + 3 个核心数字卡片）
- Tab 导航约 36px
- 内容区约 340px

### 2.3 Tab 化布局设计

#### 顶部固定区（所有 Tab 都显示）

保留现有标题栏 + 副标题栏 + 刷新/清空按钮，下方新增 3 个核心数字卡片横排：

| 卡片 | 数据源 | 配色 |
|------|--------|------|
| **本次 Token** | `getSessionTokenSummary().totalTokens` | 蓝底 `#f8f9ff` |
| **本次调用** | `getSessionTokenSummary().apiCallCount` | 绿底 `#f0fdf4` |
| **上下文峰值** | `getSessionTokenSummary().maxContextUsageRate` | 动态：<50% 绿 / 50-80% 橙 / ≥80% 红 |

#### Tab 1：趋势

- **当前会话 sparkline**：最近 20 次调用的 token 消耗趋势线，纯 SVG 手写（约 200×40px），鼠标悬停显示具体数值
- **近期调用列表**：保留现有（[token-stats-panel.js:186-214](src/side_panel/token-stats-panel.js#L186-L214)），每行左侧加一个微型柱条对标 token 量级
- **上下文使用率区间条**：min-avg-max 合并为一根水平条，带三个标记点，替代当前的 3 根独立条（[token-stats-panel.js:156-161](src/side_panel/token-stats-panel.js#L156-L161)）

#### Tab 2：分布

- **Prompt / Completion 堆叠条**：水平条，蓝段（prompt）+ 绿段（completion），右侧标百分比
- **按模型分布**：水平条形图，每行一个模型，长度 = token 占比，右侧标数值
- **按 callType 分布**：堆叠条，ReAct / 反思 / 工具反思 / 子任务反思 / 普通 / 流式各段不同颜色

#### Tab 3：全局

- **总 Token / 总会话 / 总调用**：3 个卡片，保留现有（[token-stats-panel.js:164-184](src/side_panel/token-stats-panel.js#L164-L184)）
- **全局 sparkline**：按天聚合的最近 30 天 token 消耗趋势
- **时间范围切换**：今日 / 本周 / 本月 / 全部（默认本月），切换时刷新上方卡片和 sparkline

### 2.4 数据层改动

#### 新增聚合查询接口

用于 Tab 2 分布和 Tab 3 全局 sparkline：

```js
// src/storage/token-store.js 新增

/**
 * 获取最近 N 天的每日 token 聚合
 * @param {number} days - 天数（默认 30）
 * @returns {Promise<Array<{date: string, totalTokens: number, apiCalls: number}>>}
 */
export function getDailyTokenSummary(days = 30) { ... }

/**
 * 按时间范围过滤的全局汇总
 * @param {string} startDate - ISO 日期字符串
 * @param {string} endDate - ISO 日期字符串
 * @returns {Promise<Object>} 同 getOverallTokenSummary 结构
 */
export function getOverallTokenSummaryByRange(startDate, endDate) { ... }

/**
 * 按模型聚合的 token 分布
 * @returns {Promise<Array<{model: string, totalTokens: number, percentage: number}>>}
 */
export function getTokenSummaryByModel() { ... }

/**
 * 按 callType 聚合的 token 分布
 * @returns {Promise<Array<{callType: string, totalTokens: number, percentage: number}>>}
 */
export function getTokenSummaryByCallType() { ... }
```

#### IndexedDB 索引优化（阶段三）

- **现状**：`getSessionTokenSummary` 和 `getOverallTokenSummary` 都是 `store.getAll()` 后内存过滤（[token-store.js:54](src/storage/token-store.js#L54)、[token-store.js:100](src/storage/token-store.js#L100)）。记录数多了会卡。
- **优化**：
  1. 在 [db.js](src/storage/db.js) 的 `tokenStats` store 上新增两个索引：`sessionId`（普通索引）、`timestamp`（普通索引）
  2. `getSessionTokenSummary` 改用 `IDBKeyRange` + 游标查询，只读取匹配 sessionId 的记录
  3. `getOverallTokenSummary` 维护一个增量更新的 `overall` 汇总记录（`id: 'overall'`），每次 `recordTokenCall` 时同步更新，避免每次全表扫描
  4. `getDailyTokenSummary` 用 `timestamp` 索引 + 游标范围查询
- **注意**：db.js 版本号需要升级，并写迁移逻辑（现有数据回填索引）

### 2.5 改动文件清单

| 文件 | 改动内容 |
|------|----------|
| [side_panel.html](side_panel.html) (L344-L373) | 加 Tab 导航结构（3 个 tab 按钮）+ 3 个 tab content 容器 + 顶部固定卡片容器 |
| [src/side_panel/token-stats-panel.js](src/side_panel/token-stats-panel.js) | 加 Tab 切换逻辑 + 顶部固定卡片渲染 + sparkline SVG 生成 + 堆叠条/区间条/分布图渲染 |
| [src/storage/token-store.js](src/storage/token-store.js) | 加按天/按模型/按 callType 聚合查询 + IndexedDB 索引优化 |
| [src/storage/db.js](src/storage/db.js) | `tokenStats` store 加 `sessionId` 和 `timestamp` 索引，版本号升级 + 迁移逻辑 |
| [styles/styles.css](styles/styles.css) | 加 Tab 导航样式、顶部卡片样式、sparkline 容器样式 |
| [_locales/zh/messages.json](_locales/zh/messages.json)、[_locales/en/messages.json](_locales/en/messages.json) | 加 Tab 名称、卡片标签、时间范围选项等 i18n key |

### 2.6 SVG 图表实现要点

**sparkline**（约 200×40px）：
- `viewBox="0 0 200 40"`，`<polyline>` 描点，`stroke-width: 1.5`
- 数据点 = 最近 20 次调用的 `totalTokens`，归一化到 `[0, 40]` 区间
- 鼠标悬停用 `<title>` 显示具体数值（原生 tooltip，不引入 JS 事件）

**堆叠条**（水平）：
- 外层 `div` 背景色，内层两个 `span` 按比例设置 `width`
- Prompt 蓝 `#3b82f6`，Completion 绿 `#10b981`

**区间条**（min-avg-max 三点）：
- 水平条背景 `#e8e8e8`，min 到 max 之间填充半透明色，avg 位置画一条竖线

**水平条形图**（按模型/callType 分布）：
- 每行一个 `div`，左侧 label 右侧 bar，bar 宽度 = `percentage%`

---

## 三、实施路径

### 阶段一：核心 Tab 化布局（P0）

| 项 | 改动量 | 预期收益 |
|----|--------|----------|
| Tab 导航结构 + 顶部固定 3 卡片 | 中 | 信息密度提升，切换不同视角 |
| Tab 1 趋势：sparkline + 近期调用列表 + 区间条 | 中 | 可视化趋势，一眼判断异常 |
| i18n 同步（zh/en） | 小 | 国际化完整性 |

### 阶段二：分布与全局 Tab（P1）

| 项 | 改动量 | 预期收益 |
|----|--------|----------|
| Tab 2 分布：Prompt/Completion 堆叠条 + 按模型分布 + 按 callType 分布 | 中 | 多维度下钻 |
| Tab 3 全局：全局 sparkline + 时间范围切换 | 中 | 长期趋势观察 |
| 数据层：`getDailyTokenSummary` / `getTokenSummaryByModel` / `getTokenSummaryByCallType` | 中 | 支撑 Tab 2/3 |

### 阶段三：性能优化（P2）

| 项 | 改动量 | 预期收益 |
|----|--------|----------|
| IndexedDB 索引（`sessionId` / `timestamp`）+ db.js 版本升级迁移 | 中 | 数据量大时不卡 |
| `overall` 汇总记录增量更新 | 中 | 避免每次全表扫描 |
| 游标查询替代 `getAll` | 中 | 内存占用降低 |

---

## 四、暂缓说明（ReAct 循环优化）

以下 ReAct 循环相关的 token 节省优化**本次不实施**，未来如需重启请参考 git 历史（当前提交前的 `OPTIMIZATION_PLAN.md` 版本）：

| 项 | 暂缓原因 |
|----|---------|
| prompt caching（工具定义 + system + 首问作为可缓存前缀） | 涉及多提供商适配（Anthropic / OpenAI / DeepSeek），改动面广，与本次 UI 优化目标不同 |
| summarizeRound 改本地规则摘要 | 涉及 ReAct 循环核心逻辑（`context-summarizer.js` + `react-loop.js`），风险较高，需独立评估 |
| 工具结果按类型动态截断 | 涉及 `constants.js` + `react-loop.js`，与 `trimMessages` 逻辑耦合 |
| trimMessages 阈值提前（85% → 60%） | 一行代码但影响面广，需配合本地规则摘要一起评估 |
| 权重裁剪时间衰减 + 关键引用保留 | 涉及消息权重体系重构，需充分测试 |
| 扩大可并行工具集 | 涉及工具定义（`parallelizable` 标记）+ system prompt，与 UI 无关 |
| 目标达成检测 / 反思前置触发 / 死循环白名单 | 均为 ReAct 循环增强项，与 UI 无关 |
| 子任务结果增量汇报 + 合并摘要 | 涉及 `executeSubtasks` 逻辑，风险较高 |

**重启条件**：当 Token 展示优化落地并观察一段时间后，若发现长任务 token 消耗仍是主要痛点，可重启 ReAct 优化评估。

---

## 五、明确不做项

| 项 | 理由 |
|----|------|
| 费用估算（$ / ¥） | 单价数据源不可靠且会变动（不同提供商、不同模型、不同时段价格不同），维护成本高，方案 C 明确放弃 |
| 引入图表库（chart.js / echarts / d3） | 纯 SVG 手写即可满足 sparkline / 堆叠条 / 条形图需求，避免增加包体积（chart.js min 约 200KB） |
| 实时刷新（websocket / 定时器轮询） | 用户点击"刷新"按钮主动刷新即可，避免后台持续查询 IndexedDB 影响性能 |
| 导出 CSV / JSON | 需求不明确，且侧边栏空间有限，暂不做 |

---

## 六、验收标准

### 布局与交互
- 模态框在 400px 侧边栏下不出现横向滚动
- 3 个 Tab 切换流畅，无内容闪烁，切换耗时 < 50ms
- 顶部固定卡片（本次 Token / 本次调用 / 上下文峰值）在所有 Tab 下都可见
- Tab 状态在模态框关闭再打开后保持（可选，用 `sessionStorage` 记忆）

### 可视化性能
- sparkline 在 20 个数据点下渲染 < 16ms（一帧内完成）
- 堆叠条 / 区间条 / 水平条形图渲染 < 16ms
- 时间范围切换（今日/本周/本月/全部）响应 < 100ms

### 数据准确性
- 顶部卡片数值与 Tab 3 全局统计数值一致（同一数据源）
- 按模型分布 / 按 callType 分布的百分比之和 = 100%（±0.1% 浮点误差）
- 按天聚合的 sparkline 数据点与 IndexedDB 实际记录一致

### 性能（IndexedDB 索引优化后）
- `getSessionTokenSummary` 在 10000 条记录下查询耗时 < 50ms
- `getOverallTokenSummary` 增量更新后查询耗时 < 10ms（不依赖记录总数）
- `getDailyTokenSummary(30)` 查询耗时 < 100ms

### 国际化
- 中英文切换后所有 Tab 名称、卡片标签、时间范围选项都正确显示
- 无硬编码中文字符串（通过 `t()` 函数查询）
