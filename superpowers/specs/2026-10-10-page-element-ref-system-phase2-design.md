# AI Helper 页面引用系统阶段二设计（叠加层提升 + 分页）

> 状态：设计已确认（范围与两项关键决策经用户确认：叠加层+分页；WeakMap 稳定编号）
> 日期：2026-10-10
> 前置：阶段一 spec `2026-10-10-page-element-ref-system-design.md`（已落地）
> 范围：叠加层提升 + 分页 + WeakMap 稳定编号
> 本次不做：iframe 内交互 ref、CDP 穿透封闭 shadow root（阶段三评估）；WeakRef（维持不做）

---

## 1. 背景与目标

阶段一已落地：树形快照 / 全树遍历发现 / 名称解析链 / 失效引导 / 原子输入。
遗留两个阶段一 spec 明示的短板，另发现一个分页前置问题：

| # | 差距 | 现状问题 |
|---|---|---|
| 1 | Portal 弹窗被截断 | 打开的 dialog/menu/listbox 挂在 body 末尾，字符预算截断时被切掉——模型看不到当前最该操作的内容 |
| 2 | 纯字符截断、无分页 | 大页面截断后模型只能盲目 filterByText 缩小；无法逐页完整浏览 |
| 3 | 快照重建致 ref 全量换号 | 每次查询计数器全量递增：翻第 2 页会使第 1 页 ref 全部失效（分页自毁）；常规重查后模型也需重新记忆全部编号 |

**目标**：
1. 打开的叠加层（dialog/popover/menu/listbox）提升到快照顶部，优先于主体输出，天然避开截断
2. `page` 分页 + `hasMore`，逐页浏览完整页面
3. WeakMap 稳定编号：同一元素跨快照复用编号，新元素才递增；编号永不转给不同元素

**非目标**：iframe 内交互 ref、CDP 穿透封闭 shadow root（阶段三评估）；
WeakRef / 跨快照引用存活（阶段一理由维持，登记见第 2 节）。

---

## 2. 设计总览

```
┌─ content 侧（page-interaction.js）─────────────────────────────┐
│  queryInteractiveElements(options)                            │
│    ├─ ① 预收集：aria-expanded+aria-controls 目标 id 集合       │
│    ├─ ② collectMatches：全树遍历（不变）+ 叠加层根收集          │
│    ├─ ③ 注册 pass：matched 全量注册（发现即注册）              │
│    │     ref = elementRefMap.get(el) ?? ++refCounter          │
│    ├─ ④ 输出序 = 叠加层子树元素 + 主体元素（均为 DOM 序）       │
│    ├─ ⑤ 分页切片 outputSet = outputOrder[page 区间]           │
│    └─ ⑥ renderTree：以 outputSet 判定元素行；叠加层分区渲染     │
│          → {content, count, total, page, totalPages, hasMore} │
│                                                              │
│  resolveByRef：selector 懒生成回填（首次需要时生成）            │
└──────────────────────────────────────────────────────────────┘
        ↑ msg 整包直通（page 随 payload 自动派生，handler 不改）
        ↓
┌─ background 侧 ──────────────────────────────────────────────┐
│  browser-tools.js：query_elements 增 page 参数 + 描述更新     │
│  locales zh/en：tool.query_elements + 新 i18n 键              │
└──────────────────────────────────────────────────────────────┘
```

**关键链路事实（已核实）**：
- `content/index.js` 的 `QUERY_ELEMENTS: (msg) => queryInteractiveElements(msg)` 为消息整包直通，
  新参数 `page` 经 CONTENT_PAYLOADS 自动派生后即可到达，**两处均无需改动**
- `collectMatches` 阶段一已全量解析 role/name（供过滤），注册 pass 复用其产物，零额外解析成本
- 渲染期 `renderTree` 递归已实现"子树无输出则容器行不输出"，分页只需替换判定集合即可复用

---

## 3. 详细设计

### 3.1 管线重构：发现即注册

现状（阶段一）：collectMatches 产出 `matched[]` → `selected = matched.slice(0, maxResults)` →
renderTree 内**输出即注册**（仅渲染元素占用编号与注册表）。

变更为**发现即注册**（分页可用性的前提：翻页重建后前页 ref 仍可解析）：

- renderTree 前新增注册 pass：`matched.forEach(m => { m.ref = registerElement(m.el, m.role, m.name); })`
  ——注册表覆盖全部发现元素（节点预算 15000 内）
- `registerElement` 改为 WeakMap 复用编号（见 3.2），注册时不再立即生成 selector
- `renderTree` 中元素行改用 `ctx.outputSet`（本页输出元素集合）判定；ref 取自已注册编号
- 容器/heading 行逻辑不变（子树有输出才输出），分页天然生效

### 3.2 WeakMap 稳定编号

模块级新增 `const elementRefMap = new WeakMap()`（Element → ref）：

```js
function registerElement(el, role, name) {
  let ref = elementRefMap.get(el);
  if (ref == null) {
    refCounter += 1;
    ref = refCounter;
    elementRefMap.set(el, ref);
  }
  elementRegistry.set(ref, { element: el, selector: null, tag: el.tagName, role, name });
  return ref;
}
```

- `elementRegistry`（Map<ref, entry>）仍每次快照 `clear()` 重建，key 为稳定编号
- **selector 懒生成**：`resolveByRef` 中首次需要 selector 的分支统一回填（try/catch，失败记空串）：
  ① 成功返回前（供 `getSelectorByRef` 消费方）；② 元素断开后的兜底重查前（供 `deepQuerySelector`）。
  回填后对消费方透明，元素断开后的重查逻辑本身不变
- 语义保证：同一元素跨快照编号稳定；新元素才递增；编号**永不分配给不同元素**
  （元素被 GC 后 WeakMap 条目消失、编号退役，计数器单调不回收；失效建议据此只含当前存活条目）
- 输出顺序仍为遍历/渲染序，编号在同一页面状态下稳定但**不保证随输出递增**（旧元素带旧号）；
  尾行 ref 提示无需变化

### 3.3 叠加层提升

**检测**（遍历期收集，复用 collectMatches 的剪枝与 `isElementHidden` 可见性门控；
递归上下文携带 inOverlay 标记，**嵌套取最外层**）：命中其一且可见即为根——

1. `dialog[open]`
2. `[popover]` 且 `matches(':popover-open')`（try/catch；不支持时跳过）
3. `[role="dialog"]` / `[role="alertdialog"]` 且（`aria-modal="true"` 或包含 `document.activeElement`）
4. `[role="menu"]` / `[role="listbox"]` 且包含 `document.activeElement`
5. 触发源反查：快照开始前预收集
   `new Set([...document.querySelectorAll('[aria-expanded="true"][aria-controls]')].map(t => t.getAttribute('aria-controls')))`，
   元素 `el.id` 命中该集合

**渲染分区**：
- 存在叠加层根时：输出序 = 对每个根（DOM 序）渲染其子树 → i18n 标记 `[页面主体]` → 渲染主体
  （主体渲染时命中 `ctx.skipRoots`（各根）即不下钻不输出——**去重，不重复耗 token**）
- **无叠加层根时输出与阶段一完全一致**（零标记、零变化）
- 因分区渲染在预算计时之前，打开层天然优先于 maxChars 截断（本设计的核心收益）
- 标记 i18n：`snapshotOverlayBlock` = zh `[打开层]` / en `[Open overlays]`；
  `snapshotBodyBlock` = zh `[页面主体]` / en `[Page body]`（仅存在叠加层时输出）

### 3.4 分页

- 参数：`page`（integer，默认 1；非正整数/非法值按 1 处理）；页大小 = `maxResults`
  （默认 100，语义由"输出上限"改为"每页元素数"）；`maxChars`（默认 6000）保留为单页渲染安全上限
- **输出序与切片**：`outputOrder` = 叠加层子树元素（DOM 序）+ 主体元素（DOM 序）；
  `totalPages = ceil(matched.length / pageSize)`；
  本页集合 = `outputOrder.slice((page-1)*pageSize, page*pageSize)`
  （第 1 页因此总是先含打开层内容——符合"弹窗最重要"的意图）
- 渲染：renderTree 以 outputSet 判定元素行；容器/标题行随"子树含本页元素"输出
  （同一容器跨页时会在多页重复出现，作为结构上下文，接受）
- 返回字段：`{ success, content, count, total, page, totalPages, hasMore, truncated, hint }`；
  `hasMore = page < totalPages`；`truncated` 仅表示页内字符预算/节点预算截断
- 首行：`可交互元素快照：{total} 个元素`，`totalPages > 1` 时追加 `（第 {page}/{totalPages} 页，本次输出 {count} 个）`
- 尾行：`hasMore` 时输出 `还有更多元素：调用 query_elements 时带 page={page+1} 查看`，
  随后照旧附 ref 有效期提示；`hint` 字段在 hasMore 时给出 nextPage 提示
- 越界：`page > totalPages` 且 `total > 0` → content = 首行 + 提示行（i18n `snapshotPageOutOfRange`，
  "page=N 超出范围（共 M 页）"），`hasMore=false`，不报错（模型可自我纠正）
- `countOnly` 不受分页影响（仍返回总数）；maxChars 触顶保留原"缩小范围"提示（truncated=true）

### 3.5 输出与 i18n

zh / en 新增键（`pageInteraction.*`）：`snapshotPageInfo`、`snapshotHasMore`、
`snapshotPageOutOfRange`、`snapshotOverlayBlock`、`snapshotBodyBlock`；
`snapshotHeader` / `snapshotTruncated` / `snapshotFooter` 复用。

### 3.6 接口与描述更新

- `browser-tools.js` `query_elements`：新增 `page` 参数（英文 description："1-based page number,
  use with hasMore to paginate"）；description 增补——输出可能含 `[打开层]`（打开的弹窗/菜单提升置顶）
  与 `[页面主体]`；结果含 `hasMore`，更多元素用 `page=N` 继续；ref 编号在当前页面状态内稳定
  （重查后同一元素编号不变）；`maxResults` 描述改"每页元素数"
- `shared/locales/zh.js` + `en.js`：`tool.query_elements` 同步
- `content/index.js`：消息整包直通，**无需改动**；CONTENT_PAYLOADS 自动派生 `page`，**无需改动**

---

## 4. 与阶段一的语义变更清单（兼容性）

| # | 项 | 阶段一 | 阶段二 | 影响 |
|---|---|---|---|---|
| 1 | ref 编号 | 跨快照全量换号 | 同一元素稳定复用、新元素递增、不转给不同元素 | 阶段一"编号单调性"测试语义更新 2 条 |
| 2 | 注册范围 | 输出即注册 | 发现即注册（含未展示元素） | 失效建议可能含未展示条目（视为引导，接受） |
| 3 | 超限提示 | "已截断，请 filterByText 缩小" | maxResults 触顶改为 hasMore + page 提示；maxChars 截断提示保留 | 相关断言更新 |
| 4 | 无叠加层页面 | — | 输出格式零变化 | 回归零风险 |
| 5 | 非法/越界 page | — | 非法按 1；越界返回提示行 | 新增用例 |

---

## 5. 测试计划

**单测（TDD，先行；`test/unit/content/page-interaction.unit.test.js`）**：
- 稳定编号：两次快照同元素编号不变；移除 A 新增 C 时 C 得新号且旧号不转给 C；
  翻页后第 1 页 ref 仍可 `resolveByRef` 命中
- 分页：page=1/2 内容无重叠且并集完整；`hasMore` / `totalPages` 字段；越界提示；
  容器/标题行随页出现；`maxResults=2` 分页行为；`maxChars` 页内截断仍生效
- 叠加层：`dialog[open]` 提升 + 标记 + 主体去重；`aria-modal` / `role=menu`+焦点 /
  `aria-expanded`+`aria-controls` 各路径；未打开/不可见不提升；嵌套取最外层；
  无叠加层时输出与阶段一一致（回归断言）
- 阶段一既有用例回归（除语义调整项外全绿）

**单测（`test/unit/tool-definitions.unit.test.js`）**：`page` 参数与新描述断言。

**e2e（Playwright）**：
- `content-tools`：分页链路（`maxResults` 小值 → page=2 取剩余 + hasMore 提示；
  翻页后第 1 页 ref 跨页交互成功）
- `demo-product-form`：向导模态框打开时快照含 `[打开层]`、模态框元素主体去重、模态框内 ref 操作
- 真实页冒烟探针扩展：叠加层 + 分页两场景

**回归**：全量 `npx vitest run`、`npm run build:silent`、相关 e2e 全跑。

---

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 叠加层误判（常驻组件被提升） | 焦点包含 / aria-modal / aria-expanded 严格条件 + 可见性门控；最坏仅输出顺序变化，内容不丢 |
| 全量注册/名称解析性能 | 名称解析 collect 阶段本就全量（阶段一既有）；selector 懒生成规避大头；节点预算 15000 兜底；目标普通页面维持 <100ms |
| 稳定编号被理解为"永久有效" | 尾行提示维持；元素被移除后 resolveByRef 走失效建议（编号不复用，不会误点） |
| 翻页与页面变化交错 | hasMore/totalPages 基于当次快照；稳定编号让存活元素仍可解析，失效元素照旧建议重查 |
| 既有测试对格式敏感 | 无叠加层零变化；分页仅在 maxResults 触顶时改变提示文案，逐条更新受影响断言 |

---

## 7. 实施顺序（writing-plans 输入）

1. 单测先行：阶段一编号语义调整 2 条 + 新用例骨架（稳定编号/分页/叠加层）红
2. `page-interaction.js`：WeakMap 稳定编号 + selector 懒生成 + 发现即注册
3. 渲染管线：outputSet 分页切片 + 返回字段（page/totalPages/hasMore）
4. 叠加层收集与分区渲染 + outputOrder 统一
5. i18n 新键 + `browser-tools.js` 描述 + tool-definitions 断言
6. 单测跑绿 + `npm run build:silent`
7. e2e 更新（content-tools / demo-product-form）+ 真实页冒烟探针扩展
8. 全量回归（vitest + e2e）
