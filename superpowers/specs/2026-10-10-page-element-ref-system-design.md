# AI Helper 页面引用系统（ref 树快照）设计

> 状态：已批准（分两阶段，本 spec 覆盖阶段一）
> 日期：2026-10-10
> 范围：阶段一 = 树形快照 + 全树遍历发现 + 名称解析升级 + 失效引导 + 原子输入
> 参考：WebBrain AX 树 + ref_id 系统（GPL-3.0），仅借鉴思路、重新实现，不复制代码

---

## 1. 背景与目标

AI Helper 已有 ref 雏形（`elementRegistry` + `query_elements` + `interact_element(ref)`），
但存在明显短板：

| # | 差距 | 现状问题 |
|---|---|---|
| 1 | 元素发现只覆盖 7 类硬编码选择器 | `div[role=tab]`、`treeitem`、`contenteditable`、`summary` 等非标准组件完全看不见 |
| 2 | 输出为扁平 JSON（含 selector/className 冗余） | token 浪费；长 selector 字段诱导模型抄写易错的 CSS 选择器 |
| 3 | 名称解析简单（label/aria-label/文本） | 未标记表单（"前兄弟文本即标签"）识别差 |
| 4 | 失效时报错"请重新查询" | 无附近有效引用建议，模型需整轮重查 |
| 5 | 无原子输入 | `keyboard_input` 依赖 activeElement、`fill_form` 依赖 selector，单字段输入需多步 |

**目标**：
1. `query_elements` 输出从扁平 JSON 改为**紧凑缩进树文本**（直通模型，无 JSON 外壳），
   每个可交互元素分配 `[ref N]`，消除 selector 暴露
2. 元素发现升级为**全树遍历 + 可交互判定**（原生标签 / ARIA 角色 / tabindex / onclick / contenteditable）
3. 名称解析升级为多级优先级链（含前兄弟文本）
4. ref 编号**单调递增**（跨快照不复用，避免旧 ref 静默指向新元素）；失效时返回
   **附近有效引用建议**引导模型自我纠错
5. `interact_element` 增加 `action=type`（原子输入：text/clear/submit）；
   `fill_form` 的 field 支持 `ref` 定位

**非目标（阶段二）**：叠加层提升（[open overlays]）、分页、iframe 内交互 ref、CDP 穿透封闭 shadow root。
WeakRef：经实现推演，本方案采用"快照重建 + 单调编号"，注册表 clear 即释放强引用，
无内存泄漏面与跨快照误点风险，**明确不做 WeakRef**（如未来改跨快照引用存活再引入）。

---

## 2. 设计总览

```
┌─ content 侧 ─────────────────────────────────────────────────┐
│  queryInteractiveElements（重写为树构建器）                    │
│    ├─ 全树遍历（display:none 剪枝 / 透传容器不占缩进）          │
│    ├─ 可交互判定 → 名称解析链 → 属性序列化                     │
│    ├─ 注册表：ref 单调递增 → {element, selector(内部), tag,...}│
│    └─ 输出：{success, content: "<树文本>", count, total, ...}  │
│                                                              │
│  resolveByRef(ref)  ← 统一解析（存在性 + isConnected +       │
│    selector 兜底 + 失效建议），供交互/下拉/表单复用             │
│  interactByRef(ref, action)  ← click / hover / type          │
└──────────────────────────────────────────────────────────────┘
        ↑ INTERACT_ELEMENT 透传 text/clear/submit（payload 自动派生）
        ↓
┌─ background 侧 ──────────────────────────────────────────────┐
│  normalizeToolResult：content 字段直通 → 模型看到纯树文本      │
│  react-loop：wrapUntrusted(toolName, content)（已有链路不变） │
│  工具定义/描述更新：query_elements / interact_element /       │
│  fill_form（browser-tools.js）+ i18n（locales zh/en）         │
└──────────────────────────────────────────────────────────────┘
```

**关键链路事实（已核实）**：`react-loop.js` 的 `toolResultStr = toolResult.content ?? JSON.stringify(toolResult)`；
因此 content script 返回 `content` 字符串时，模型直接看到树文本，无 JSON 转义外壳。
`query_elements` 已在 `UNTRUSTED_CONTENT_TOOLS`（untrusted-content.js），树文本自动被
`<untrusted_page_content>` 包装，安全分类无需变更。

---

## 3. 详细设计

### 3.1 树快照输出格式

```
可交互元素快照：38 个元素（本次输出 28 个；已截断，请用 filterByText 缩小范围）
dialog "添加产品"
 textbox "名称" [ref 12] type="text" placeholder="产品名称" value="namaz"
 combobox "计费周期" [ref 13]
 textbox "价格" [ref 14] type="number" value="500"
 button "取消" [ref 15]
 button "保存" [ref 16]
heading "订单列表"
 table
  row "namaz 500 元/2月"
   button "编辑" [ref 21]
（ref 编号仅当前快照有效；页面变化后请重新调用 query_elements）
```

规则：
- 行格式：`{role} "{name}" [ref N] {attr="v" ...}`；语义容器行无 `[ref]`（不可寻址，仅上下文）
- 缩进：1 空格/有效深度；**无意义通用容器（div/span 等）透传、不占深度**；
  语义容器集合：dialog / form / nav / main / header / footer / section[aria-label] / table / row / heading(h1-h6)
- 属性白名单：`href`（截断 150 字符）、`type`、`placeholder`（截断 60）、`value`（截断 60）、
  `checked`/`selected`（有则输出 "true"）
- 名称截断 80 字符；无名称时省略 `"{name}"` 引号段
- 首行统计 + 截断提示；尾行 ref 有效期提示
- 截断策略：按树顺序累积字符，超 `maxChars`（默认 6000）即停，输出截断提示；
  元素数量上限另由 `maxResults` 参数保护（沿用默认 100，语义从"查询截断"变为"输出上限"）

### 3.2 元素发现：全树遍历 + 可交互判定

按序判定（命中即"可交互"，分配 ref）：

1. 原生交互标签：`button`、`input`（非 `type=hidden`）、`select`、`textarea`、
   `a[href]`、`summary`、`audio/video[controls]`
2. `contenteditable`（属性为 `""`/`true`/`plaintext-only`）
3. ARIA 角色集合：`button, link, checkbox, radio, switch, tab, menuitem, menuitemcheckbox,
   menuitemradio, option, combobox, listbox, searchbox, slider, spinbutton, textbox, treeitem`
4. `tabindex >= 0` 或 `hasAttribute('onclick')`

遍历与剪枝：
- 深度优先遍历（含 open shadow root，复用现有 `shadow-dom-utils` 能力）
- **剪枝**：`display:none`、`aria-hidden="true"`、`inert` 的子树整棵跳过
  （`visibility:hidden` 只跳过自身，继续遍历子树——子元素可覆盖回 visible）
- **透传**：非输出但含输出后代的容器不占缩进（用"有效深度"计数实现）
- **性能保护**：节点浏览上限 15000（防御性兜底）；遍历在 maxChars 达标后提前终止
- 可见性判定：优先 `checkVisibility({checkOpacity:true, checkVisibilityCSS:true})`
  （Chrome 105+）；不可用时回退 style 检查（`display`/`visibility`）——jsdom 测试走 fallback

已知边界（接受）：无 role / 无 tabindex / 用 addEventListener 绑定的"裸 div 卡片"不可发现
（现状 7 类选择器同样不可见，无回归）。

### 3.3 名称解析链（按序取第一个非空）

1. `select` 选中 option 文本
2. `aria-labelledby`（拼接引用元素文本）
3. `aria-label`
4. 关联 `label`（`label[for]` 或 `closest('label')` 文本）
5. `placeholder`
6. `title`
7. `alt`
8. `input[type=submit|button|reset]` 的 `value`
9. 元素直接文本（`textContent` 取直接子文本，截断）
10. **前兄弟文本**：前一个兄弟节点的直接文本（该兄弟不含交互元素）——解决未标记表单场景
11. 均无 → 名称省略

### 3.4 注册表与 ref 生命周期

- 编号：模块级单调递增计数器 `refCounter`（**跨快照不重置**）；每次树构建
  `elementRegistry.clear()` 后按遍历顺序重新注册
- entry：`{element, selector, tag, role, name}`（selector 仅供内部兜底，不暴露给模型）
- `resolveByRef(ref)` 统一解析：
  1. ref 不在注册表 → 失效 → 返回建议：
     "无效或已过期的 ref={ref}。最近快照的有效引用：ref 14 (combobox "国家")、
     ref 15 (textarea "留言")；如页面已变化请重新调用 query_elements"
     （建议 = 当前注册表中编号最接近的 ≤3 个存活条目）
  2. entry 存在且 `element.isConnected` → 返回
  3. 不 connected → 用内部 selector `deepQuerySelector` 兜底重查（现状行为保留）
  4. 兜底失败 → 同 1 的建议格式报错
- `getSelectorByRef(ref)` 保留为 `resolveByRef` 薄封装（select_dropdown 消费方，行为不变）
- 新增 `getElementByRef(ref)`（fill_form 消费方）
- 快照重建释放旧强引用（Map.clear），无内存泄漏面

### 3.5 原子输入

**`interact_element` 工具**：
- `action` enum 扩展为 `['click', 'hover', 'type']`
- 新增参数：`value`（type 时必填，输入内容；因 `text` 已被文本定位占用，
  输入内容命名为 `value`）、`clear`（boolean，默认 false，输入前先清空）、
  `submit`（boolean，默认 false，输入后派发 Enter）
- type 分支（在 `interactByRef` 内实现，复用 ref 解析/可见性基建）：
  1. 解析校验元素（同 click）；拒绝 `checkbox/radio/submit/file` 等非文本输入类型（明确报错）
  2. `focus()`
  3. `clear` → `setNativeValue(el, '')`
  4. 输入：`input/textarea` → `setNativeValue`（绕过 React/Vue 受控组件，现有实现）；
     `contenteditable` → `fillContentEditable` 路径
  5. 派发 `InputEvent('input')` + `Event('change')`（与 fill_form 一致）
  6. `submit` → 派发 Enter keydown/keypress/keyup 序列
  7. `autoWaitAfterAction` 返回变化提示
- **辅助函数移位**：`setNativeValue` / `fillContentEditable` / `isContentEditableElement`
  从 `interaction-tools.js` 私有函数移至 `page-utils.js`（export），两处消费方
  （interaction-tools / page-interaction）统一导入

**`fill_form` 工具**：
- `fields.items` 增加 `ref` 属性（integer）；`selector` 与 `ref` 二选一，ref 优先
- JSON Schema 无法表达条件必选，保持 `required: ['value']`，在描述中标注
  "selector or ref (one required)"

**返回值收敛**：`interactByRef` 成功返回值**移除 `selector` 字段**（消除长 selector 暴露），
统一为 `{success, message, changed, urlChanged, ...}`。

### 3.6 接口与描述更新

- `browser-tools.js`（模型侧定义，英文）：
  - `query_elements`：描述重写——输出为树形快照、`[ref N]` 用法、失效后重查、
    filterByText/maxChars；新增 `maxChars` 参数
  - `interact_element`：action 枚举更新 + 每值附参数提示
    （"click: ...; hover: ...; type: enter text into field (requires value; optional clear/submit)"）；
    `selector` 参数描述删除 "prefer selector returned by query_elements"（树输出不再返回 selector）
  - `fill_form`：fields 说明 ref/selector 二选一
- `shared/locales/zh.js` + `en.js`（`tool.*` 命名空间，UI 展示）：同步三处描述
- `agent-defaults.js`：现有"优先 query_elements"表述保留，不改（表述已通用）
- CONTENT_PAYLOADS 自动派生机制：新参数（text/clear/submit/maxChars）自动透传，无需改

---

## 4. 阶段二（本 spec 不做）

1. **叠加层提升**：打开的 dialog/listbox/menu 提升到快照顶部（解决 Portal 弹窗被截断）
2. **分页**：`page` 参数 + `hasMore`，替代纯字符截断
3. **WeakRef / 跨快照引用存活**：见第 1 节说明，当前明确不做
4. iframe 内交互 ref（iframe_read/click/type 体系）、CDP 穿透封闭 shadow root

---

## 5. 测试计划

**单测（TDD，先行）**：
- `test/unit/content/page-interaction.unit.test.js`（jsdom，现有文件大更新）：
  - 树输出格式：缩进、容器透传、`[ref N]`、统计行、名称引号
  - 发现范围：`role=tab`、`contenteditable`、`summary`、`label[for]`、
    `tabindex`、前兄弟文本名称
  - 剪枝：`display:none` / `aria-hidden` 子树不出现
  - 编号单调性：两次快照编号不重置、不复用
  - 失效引导：无效 ref 报错含"附近有效引用"
  - type 分支：`setNativeValue` + input/change 事件断言、clear/submit 行为、
    非法类型（checkbox）拒绝
- `test/unit/tool-definitions.unit.test.js`：interact_element action 枚举、
  fill_form ref 属性断言同步更新

**e2e（Playwright，现有文件更新/补充）**：
- `test/e2e/content-tools.e2e.spec.js`：query_elements 断言改为树文本；
  补"树快照 → interact_element(ref) → type(ref)"链路
- `test/e2e/demo-product-form.e2e.spec.js`：商品表单页跑 ref 定位全链路
  （快照 → 填名称 → 选周期 → 保存）

**回归验证**：
- `npx vitest run`（全量单测）
- `npm run build:silent`（构建通过）
- e2e 相关 spec 全跑

---

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 输出格式变化致模型理解回归 | 工具描述内嵌格式样例（2 行示例）；e2e 真实链路验证；保留尾行提示 |
| 全树遍历性能（大页面） | display:none 剪枝 + maxChars 早停 + 15000 节点上限；目标普通页面 <100ms |
| jsdom 与真实浏览器行为差异（checkVisibility/rect） | checkVisibility 探测 + style fallback；jsdom 单测走 fallback 路径；e2e 兜底 |
| 消费方同步遗漏（select_dropdown/fill_form/UI） | resolveByRef 统一重构；已核实 UI 无 `.elements` 结构依赖（展示走 content 字符串） |
| token 预算 | 紧凑格式（预计比 JSON 省 50-70% 字符）+ maxChars 截断 |
| 截断误报"缺失" | 截断提示显式说明"已截断，请 filterByText 缩小"；阶段二分页根治 |

---

## 7. 实施顺序（writing-plans 输入）

1. 单测先行：page-interaction 测试骨架（树/发现/名称/编号/建议/type）+ tool-definitions 更新（红）
2. `page-utils.js`：辅助函数移位（`setNativeValue` / `fillContentEditable` /
   `isContentEditableElement` 从 interaction-tools.js 移入并 export）；`interaction-tools.js` 改导入
3. `page-interaction.js`：树构建器 + 注册表（单调编号）+ `resolveByRef` +
   `interactByRef(action=type)`（依赖 Step 2 的辅助函数）
4. `interaction-tools.js`：`fillForm` 支持 field.ref（用 `getElementByRef`）
5. `content/index.js`：INTERACT_ELEMENT handler 透传 text/clear/submit
6. `browser-tools.js` + `locales zh/en`：定义与描述更新
7. 单测跑绿 + `npm run build:silent`
8. e2e 更新（content-tools / demo-product-form）+ 真实页验证
9. 全量回归（vitest + e2e）
