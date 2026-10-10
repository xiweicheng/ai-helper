# AI Helper 页面引用系统阶段三设计（iframe 内交互 ref）

> 状态：设计已确认（三项关键决策经用户确认：范围=仅 iframe ref；默认纳入可见 frame；分区块呈现）
> 日期：2026-10-10
> 前置：阶段一 spec `2026-10-10-page-element-ref-system-design.md`（已落地）、阶段二 spec `2026-10-10-page-element-ref-system-phase2-design.md`（已落地）
> 范围：可见 iframe 内容纳入快照（分区块）+ 全局 ref 编号 + 跨帧透明交互
> 本次不做：CDP 穿透封闭 shadow root（评估结论见第 8 节，维持 `debug_page` 兜底）；WeakRef（维持不做）

---

## 1. 背景与目标

阶段一/二已落地：树形快照 / 名称解析链 / 失效引导 / 原子输入 / 叠加层提升 / 分页 / WeakMap 稳定编号。
阶段一 spec 遗留短板"iframe 内交互 ref"，核实现状：

| # | 差距 | 现状问题 |
|---|---|---|
| 1 | iframe 内容不可见 | `QUERY_ELEMENTS`/`INTERACT_ELEMENT`/`SCROLL_TO` 有 `TOP_FRAME_ONLY_TYPES` 护栏（`content/index.js`）；ref 注册表仅顶层 frame 维护；模型对页面中的 iframe 完全无感知 |
| 2 | iframe 不可交互 | `iframe_content` 仅同源、只读文本；跨域支付组件/嵌入表单无法 ref 定位与操作 |
| 3 | 跨帧编号无体系 | ref 编号是单帧概念；多帧场景无全局编号与路由机制 |

**目标**：
1. `query_elements` 默认纳入可见 iframe 内容（分区块呈现，含跨域；隐藏/零尺寸 frame 排除）
2. 全局 ref 编号 + 跨帧透明交互（`interact_element` / `fill_form` / `select_dropdown` / `scroll_to`）
3. 兼容红线：无帧/单帧页面输出与阶段二逐字节一致

**非目标**：CDP 穿透封闭 shadow root（评估结论：维持 `debug_page` 兜底，见第 8 节）；WeakRef；
`iframe_content` 工具改造（保持现状）；超限帧（>20 个 / >3 层）展开；iframe 内文本类工具（`wait_element` 等）跨帧改造。

---

## 2. 设计总览

```
┌─ content 侧（每帧，含顶层）───────────────────────────────┐
│  collectSnapshotOps(options)                               │
│    ├─ 帧可见性自检（innerSize + IntersectionObserver）      │
│    ├─ 遍历：叠加层根收集 + matched（阶段二既有逻辑复用）     │
│    ├─ 注册 pass：本地 WeakMap 编号（阶段二语义原样保留）    │
│    └─ ops 采集：结构化渲染数据（不渲染文本）                │
│  queryInteractiveElements（薄包装，兼容出口，签名不变）      │
│    = collectSnapshotOps + 共享渲染器 → 单帧输出逐字节不变   │
└────────────────────────────────────────────────────────────┘
        ↑ 逐帧定向消息（frameId）+ 注入重试（复用既有基建）
        ↓
┌─ background 侧（snapshot-orchestrator.js，新）──────────────┐
│  ├─ webNavigation.getAllFrames 枚举帧树                     │
│  ├─ 并行收集各帧 ops（总超时 ~400ms，超时按不可达处理）      │
│  ├─ 全局编号表 (frameId, localRef) → globalRef              │
│  ├─ 合并全页 ops 流 + 调用共享渲染器                        │
│  └─ 交互路由：全局 ref → (frameId, localRef) → 定向发送     │
└────────────────────────────────────────────────────────────┘
        ↑ 共享
┌─ 共享模块（src/shared/page-snapshot-renderer.js，新）───────┐
│  纯函数：合并 ops + 分页参数 → 文本快照（唯一渲染出口）      │
└────────────────────────────────────────────────────────────┘
```

**传输通道选型（存档）**：

| 候选 | 结论 | 理由 |
|---|---|---|
| CDP（chrome.debugger） | 弃用 | 高频快照场景 attach 确认 + 黄色调试条常驻，与"debug_page 仅兜底"哲学冲突 |
| 顶层 frame 同源 DOM 直读 | 弃用 | 仅覆盖同源 frame（现有 `iframe_content` 模式），跨域场景全部失效 |
| **跨帧消息编排** | **选用** | content script 已注入所有 frame（`all_frames: true`），无新点击摩擦；跨域天然可达 |

**为什么传"结构化 ops"而非"渲染好的行"**：阶段二的全局分页（`page`/`hasMore`/`maxChars`）必须跨帧统一不变量——各帧自行渲染文本则无法干净跨 frame 边界切片、预算无法全局分配。ops 数据让后台对全页 matched 流统一分页，再由唯一渲染器出文本，杜绝多渲染器格式漂移。

**兼容策略**：`queryInteractiveElements` 保留为薄包装（本地 collect + 共享渲染器），单帧页面输出逐字节不变；现有 45 条 jsdom 单测与 25 条 e2e 作为重构安全网零改写。

**关键链路事实（已核实）**：
- `content/index.js` 消息 handler 直通模式：新消息类型仅需在 HANDLERS 注册
- `CONTENT_PAYLOADS` 按 `function.parameters.properties` 自动派生：`frames` 参数零改动透传
- `debugger-session.js` / `tool-debugger.js` 已是完整的 CDP 基建（本阶段不启用，见第 8 节）
- e2e `page.addInitScript` 对全部 frame 生效（既有 `iframe-page.html` 用例已实证）

---

## 3. 详细设计

### 3.1 快照格式（分区块模型）

无可见 frame 页面（或 `frames:'none'`）→ 输出与阶段二逐字节一致。含可见 frame 时：

```
可交互元素快照：N 个元素（含 F 个 iframe 区块）
[打开层]
...
[页面主体]
  button "Submit" [ref 4]
  iframe #1 "Payment"
  ...
[frame #1 "Payment" · js.stripe.com]
  textbox "Card number" [ref 12]
  [打开层]
  ...
  [frame #2 "Nested" · b.com]
  ...
（ref 编号仅当前快照有效；页面变化后请重新调用 query_elements）
```

- **frame 编号**：帧树先序（顶层不编号，可见子帧 1..F，全局抢序）
- **占位行**：`iframe #N "title"`（title 取 iframe 元素 title 属性，可缺省）；位于 iframe 元素 DOM 位置；像容器行一样消耗字符预算、不计入 count/total；`frames:'none'` 时不输出
- **区块**：`[frame #N "title" · host]`（host 取 URL 主机名省字符；`about:srcdoc`/`about:blank` 分别显示 `srcdoc`/`blank`；无 title 时省略引号段）；仅在**该帧本页有匹配元素**时输出；区块头消耗预算
- **帧内叠加层**：帧内打开的 dialog/menu 在该区块内复用 `[打开层]`/`[页面主体]` 语言（帧内局部渲染逻辑原样复用）
- **嵌套帧**：区块内缩进展示
- **header 帧概要**：仅确有参与收集的可见 frame 时追加（zh `（含 {n} 个 iframe）` / en ` ({n} iframe(s))`；n = 本次纳入的可见帧数，含不可达帧）
- **i18n 新增键**（`page-interaction.js` 模块内注册，zh/en 双语）：`snapshotHeaderFrames`、`snapshotFrameBlock`（区块头模板）、`snapshotFramePlaceholder`、`snapshotFrameUnreachable` 等

### 3.2 全局 ref 编号

- 展示给模型的一律是**全局编号**；帧内部继续使用本地 WeakMap 编号（阶段二语义原样保留）
- bg 维护映射表 `(frameId, localRef) → globalRef`：同一元素同页面状态下重查稳定；全局编号单调递增、**永不转给不同元素**（承诺与阶段二一致，作用域从单帧扩展到整页）
- 每次 `query_elements` 修剪全局表：消失帧的子表清除，存活帧的既有映射持续复用（跨帧编号稳定的前提）
- **失效建议**：帧内 `resolveByRef` 失败时以结构化数据返回建议项（本地编号 + role/name），bg 反向翻译为全局编号后统一格式化输出；单帧包装路径下本地即全局，行为不变
- SW 重启致编号表丢失时，路由失败返回"请重新 query_elements"类引导（不静默失败）

### 3.3 分页与预算（跨帧统一不变量）

- **全局 matched 流** = 顶层（打开层 → 主体）→ 各可见帧按帧树先序拼接（各帧内部仍为 打开层 → 主体）
- `page` / `maxResults` / `hasMore` / `totalPages` 在这条拼接流上统一计算；单帧页面退化为阶段二原语义
- `maxChars` 为全局预算，跨区块连续消耗；截断提示沿用现有文案；跨 frame 边界的翻页自然工作
- `countOnly` 跨可见帧合计；`filterByText` / `elementTypes` 在每帧采集时各自应用（语义与单帧一致）

### 3.4 采集协议（ops 数据结构）

content 侧 `collectSnapshotOps(options)` 返回纯数据（**不渲染文本**）：

```js
{
  frameInfo: { url, title, innerSize: {w, h}, ioVisible: true | false | null },
  ops: [
    { t: 'interactive', localRef, role, name, attrs, depth, inOverlay },
    { t: 'container', role, name, depth, inOverlay },        // 子树有输出才采集（阶段二渲染判定前移）
    { t: 'frame-placeholder', title, srcUrl, sameOriginHref, orderInParent, depth },
  ],
}
```

- `depth` = 阶段二"有效深度"语义；`inOverlay` 标记沿用；容器行的 childProduced 判定在采集期完成的预渲染遍历中计算
- `frame-placeholder` 项由**顶层帧**在遍历到 iframe 元素时采集：`sameOriginHref`（同源帧可读 `contentWindow.location.href`，跨域置 null）、`orderInParent`（该 iframe 在父帧全部 iframe 元素中的出现序号）
- 新消息类型 `SNAPSHOT_COLLECT`：`content/index.js` HANDLERS 注册直通 `collectSnapshotOps`；bg 逐帧定向发送（`tabs.sendMessage` + `{frameId}`），复用 `sendToContentScriptWithRetry` 的注入重试（扩展为支持 `frameIds` 定向注入）
- 帧自报不可见时返回轻响应 `{ visible: false }`，不携带 ops

### 3.5 帧枚举与占位行对应（三重策略）

- 帧树数据源：`chrome.webNavigation.getAllFrames(tabId)`（frameId / parentFrameId / url）
- 可见帧筛选：以子帧自报为准（见 4.1）；bg 收集后过滤
- 占位行与帧区块共享编号 `#N`（帧树先序）；对应关系三重策略：
  1. **同源精确**：`frame-placeholder.sameOriginHref` 与帧的 `url` 全等
  2. **src 唯一匹配**：`srcUrl` 归一化后在父帧的 placeholder 中唯一、且在帧树中唯一
  3. **出现次序匹配**：`orderInParent` 与父帧子帧列表的帧树先序位置对齐
- 三重均无法唯一确定时：占位行**省略 `#N`**（区块编号保留）——保证永不错标

### 3.6 渲染器接口（shared/page-snapshot-renderer.js）

纯函数、零 DOM 依赖（content 与 bg 共用）：

```js
renderSnapshot({
  frames: [ { frameId, frameInfo, ops, isTopFrame } ],  // 已完成合并与全局编号替换
  page, maxResults, maxChars, frameCount, unreachableFrames,
}) → { content, count, total, page, totalPages, hasMore, truncated, hint }
```

渲染器职责（唯一渲染出口）：在全局 matched 流上分页切片、预算消耗、占位行/区块头/容器/元素行生成、header/footer 组装、越界页提示。编排器与薄包装均只调用它。

### 3.7 交互路由

- `interact_element`（ref）/ `select_dropdown`（ref）/ `scroll_to`（target=ref）：bg 查全局表 → 定向 `frameId` 发送，消息内携带**本地 ref**；帧内 `resolveByRef` 原样工作（含断开重查兜底）
- `fill_form`（fields[].ref）：bg 按字段归属帧分组 → 每帧一次子调用 → 结果合并（成功字段数 + 失败明细注明所属 frame）；同一次调用混合多帧字段自动拆分，模型无感知
- **非 ref 路径不变**：text 模式查找、`wait_element` 等维持顶层 frame 语义
- **路由失败统一错误**：无映射（过期 / SW 重启）→"ref 无效，请重新 query_elements"；目标 frame 已消失 → 同类提示附"该 frame 已不可用"

### 3.8 执行路径与描述更新

- `tool-executor.js` 增加分流：`query_elements` 改为**编排器接管**（不再走 `CONTENT_PAYLOADS` 直通）；其余 content 工具走原有直通路径
- `browser-tools.js` `query_elements`：新增 `frames` 参数（`'auto'` 默认 / `'none'`），description 增补——可见 iframe 内容以 `[frame #N]` 区块输出、ref 全局有效、`frames:'none'` 只查顶层
- `shared/locales/zh.js` + `en.js`：`tool.query_elements` 同步

---

## 4. 边界与降级

### 4.1 帧可见性判定（子帧自报，无父子握手）

- 同步基线：`innerWidth/innerHeight > 0`（`display:none` / 零尺寸 → 0 排除）
- 被动 `IntersectionObserver`（观察自身 documentElement）持续更新，快照零延迟读取最近状态
- 未知态 **fail-open**（宁可多含不可漏真实内容）
- **已知局限（文档化）**：父级 `visibility:hidden`/`opacity:0` 的 iframe 子帧无法自检 → 可能被纳入（低频边缘）
- 隐藏帧完全不参与：无匹配、无占位行、无区块（占位行仅对应参与收集的可见帧）

### 4.2 不可达帧（可见但取不到内容）

- 三类来源：内容脚本未覆盖（sandbox / 特殊 scheme）、收集超时、帧已消失竞态
- 呈现：占位行照常显示并标注 `iframe #1 "X"（内容不可访问）`，不输出空区块；不计入 matched
- 各帧并行收集，总预算 ~400ms，超时帧按不可达处理（不阻塞整体快照）

### 4.3 注入覆盖与权限（manifest 变更）

| 变更 | 目的 | 备注 |
|---|---|---|
| `content_scripts.match_about_blank: true` | 覆盖 srcdoc/about:blank 帧（sandboxed widget 主流形态，当前未覆盖） | 必加 |
| `content_scripts.match_origin_as_fallback: true` | 覆盖 blob:/data: 继承源帧 | Chrome 119+；实施时探针实证，异常可回退仅保留前者 |
| `permissions` 新增 `webNavigation` | 枚举帧树（frameId + parentFrameId，嵌套区块数据源） | 无新增敏感数据面，权限面小于现有 `debugger` |

### 4.4 数量与深度上限

- 可见帧上限 **20**、深度上限 **3 层**（超出按帧树先序不收集）
- 超限帧：不输出区块；占位行正常显示但不带编号（避免模型等待不存在的区块）——header 注明截断

### 4.5 性能预算

- 单帧采集沿用既有节奏（节点上限 / 剪枝，普通页面 ~100ms 量级）；多帧并行收集，总增量目标 ≤ 400ms
- 无子帧页面：编排器自然退化为单次帧内收集 + 渲染，无额外往返

### 4.6 生命周期

- 每次 `query_elements` 重建全局编号表（清除消失帧子表）；帧导航 → 旧 ref 自然失效走既有引导
- 路由时表无映射 / 帧无响应 → 明确错误提示（不静默失败）

---

## 5. 与阶段二的语义变更清单（兼容性）

| # | 项 | 阶段二 | 阶段三 | 影响 |
|---|---|---|---|---|
| 1 | 无帧页面输出 | — | 逐字节零变化 | 回归零风险 |
| 2 | 含可见帧页面输出 | 仅顶层内容 | 占位行 + frame 区块 + 全局编号 | 新格式；`frames:'none'` 可退回 |
| 3 | ref 编号作用域 | 单帧 | 全局（跨帧唯一、跨帧稳定） | 单帧下与阶段二等价 |
| 4 | query_elements 执行路径 | content 消息直通 | bg 编排器接管 | tool-executor 分流 |
| 5 | fill_form 跨帧 | — | 自动拆分合并 | 新能力 |
| 6 | manifest | — | +3 项（match_about_blank / match_origin_as_fallback / webNavigation） | 无新增敏感权限面 |
| 7 | 失效建议编号 | 本地编号 | bg 翻译为全局编号 | 帧内建议结构化返回 |

---

## 6. 测试计划

**单测（TDD，先行）**：

| 层 | 文件 | 覆盖 |
|---|---|---|
| 渲染器（纯函数） | `test/unit/shared/page-snapshot-renderer.unit.test.js`（新） | 行格式断言从 page-interaction 测试平移（缩进/容器/[ref N]/统计/分页/截断/越界）；多帧用例：区块头、嵌套区块、占位行、全局编号展示、header 帧概要 |
| ops 采集（jsdom） | `test/unit/content/page-interaction.unit.test.js`（更新） | ops 结构（inOverlay/container childProduced/剪枝/depth）；帧自报字段；**既有 45 条经薄包装继续全绿 = 兼容红线锁** |
| 编排器（mock chrome） | `test/unit/background/snapshot-orchestrator.unit.test.js`（新） | 帧树枚举、并行收集、超时降级、可见帧过滤、全局编号表（重查稳定/新增递增/帧消失失效）、三重对应策略、`fill_form` 拆分合并、路由查询与错误分支 |
| schema / manifest | `test/unit/tool-definitions.unit.test.js`（更新）+ manifest 断言 | `frames` 参数；`match_about_blank` / `match_origin_as_fallback` / `webNavigation` 存在性 |

**e2e（Playwright，现有 25 条零改写全绿）**：
- 新 fixture `test/e2e/fixtures/iframe-visible-page.html`：可见 srcdoc 帧 + 同源 file 子页 + `display:none` 帧 + 零尺寸帧
- 新 helper `callToolInFrame(page, frameSelector, fnName, ...)`：定位子 frame 后调用 `__tools`
- 新用例：各帧内 `collectSnapshotOps` 断言（可见性排除、ops 结构）；页面内组合渲染验证区块/占位行文本
- **框架决策**：bg 编排由单测 mock + 探针真实验证覆盖；e2e 保持 `file://` 体系不引入 http 双源——跨域验证归属探针

**探针（真实扩展 + 真实页面，`test-results-probes/` gitignored 不入库）**：
- 新建 `_iframe-ref-system-smoke.mjs`：本地双源测试页（127.0.0.1 主文档 + localhost 跨域子帧 + srcdoc 帧 + 隐藏帧），验证 7 项：区块+占位行、隐藏帧排除、**跨域帧内 ref 真实路由点击**、重查编号稳定、`fill_form` 跨帧混合填充、帧移除后失效引导、`frames:'none'` 与阶段二一致
- 现有 `_ref-system-smoke.mjs`（19 项）复跑回归

**回归矩阵与兼容专项**：
- `vitest 全量 → build:silent → playwright 全量 → 探针双本`
- 兼容红线专项：无帧 / 单帧页面输出与阶段二逐字节一致（单测薄包装 + 现有 e2e 双锁，漂移立即红）

---

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| ops 重构引入格式漂移 | 薄包装 + 45 单测 / 25 e2e 双锁；渲染器断言平移；逐字节兼容专项 |
| 帧枚举/收集时序（懒加载帧、竞态） | 每次快照实时枚举；并行收集 + 总超时降级为不可达标注；可见性 fail-open |
| 三重对应启发式错标 | 不确定即省略编号（宁缺勿错）；同源精确路径优先 |
| 跨域不可达（sandbox / scheme） | 占位行标注 + 无区块；文档化局限 |
| SW 重启编号表丢失 | 明确引导重查；不静默失败 |
| 多帧消息往返致性能退化 | 并行收集 + 总超时；无子帧页面自然退化单次收集 |
| manifest 权限变更引发审查问题 | 仅新增 `webNavigation`；`match_*` 属现有 `<all_urls>` 覆盖范围 |

---

## 8. CDP 穿透封闭 shadow root 评估结论（非实施项）

封闭 shadow root 不集成 CDP 的理由：`chrome.debugger` attach 需用户确认 + 黄色调试条常驻，与高频快照工具的"静默"哲学冲突；封闭 shadow root 在普通站点占比低；现有 `debug_page`（`evaluate`/`input`）已是可用的逃生通道。后续若确有需求，在 `debug_page` 侧扩展"快照式 action"演进——**记录为未来选项，非承诺**。

---

## 9. 实施顺序（writing-plans 输入）

1. 渲染器抽离：`src/shared/page-snapshot-renderer.js` + 断言平移（红→绿），薄包装改造，单帧兼容锁
2. ops 采集：`page-interaction.js` `collectSnapshotOps`（叠加层/容器/占位行/帧自报），单测
3. manifest：`match_about_blank` / `match_origin_as_fallback` / `webNavigation` + 断言
4. 编排器：`snapshot-orchestrator.js`（帧枚举 / 并行收集 / 全局编号 / 三重对应 / 合并）+ mock chrome 单测
5. 交互路由：`tool-executor` 分流 + 定向发送 + `fill_form` 拆分 + 失效建议翻译
6. 工具定义与 i18n：`browser-tools` `frames` 参数 + 描述 + locales + 新 i18n 键
7. e2e：新 fixture + `callToolInFrame` + 区块/占位行/可见性排除断言
8. 探针：`_iframe-ref-system-smoke.mjs` 7 项 + 现有 19 项回归
9. 全量回归：vitest + build + playwright + 探针双本
