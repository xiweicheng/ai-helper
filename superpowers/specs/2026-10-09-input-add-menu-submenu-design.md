# 加号菜单二级面板（双栏联动）设计

- 日期：2026-10-09
- 分支：feat/input-unified-container
- 状态：设计已确认（用户已批准），待实施
- 前置文档：docs/superpowers/specs/2026-10-09-input-area-unified-container-design.md

## 1. 背景与目标

现状：加号菜单（`#inputAddMenu`）内 8 个直达项，点击后打开对应选择器弹窗（/ @ $），用户需在弹窗中二次操作。

目标：为其中 4 类（提示词/技能/MCP/网页）增加**第二入口**——鼠标悬停一级菜单项时，菜单原地展开为双栏：左列保持一级项，右列显示该类"搜索框 + 列表"，可**直接在菜单内选择触发**。原"点击一级项打开弹窗"通道**保持不变**，两通道并存。

## 2. 范围

### 纳入

- 4 类二级面板：提示词（prompts）、技能（skills）、MCP（mcp）、网页（pages）
- hover 展开/切换/收起状态机；搜索过滤；选择动作接线；选中标记刷新
- 触发符截断行为修正（见第 6 节）

### 不纳入（YAGNI）

- 知识库/助手/代理/工作目录的二级面板（架构预留：类别映射表扩展即可）
- 面板项键盘导航（↑↓/Enter）、触摸设备 hover 兼容——键盘用户继续走"点击打开弹窗"通道
- 面板出现/收起的宽度过渡动画（出现用 fade-in，收起即时，见 4.4）

## 3. 整体架构

### 3.1 DOM 结构（改造 `side_panel.html` 中 `#inputAddMenu` 内部）

```html
<div class="input-add-menu" id="inputAddMenu" style="display:none;">
  <div class="input-add-cols">
    <div class="input-add-nav">
      <!-- 现有 8 个 .input-add-item + 2 个分隔符 + 开关区，原样搬入，零逻辑改动 -->
    </div>
    <div class="input-add-panel" id="inputAddPanel" style="display:none;">
      <input class="input-add-panel-search" id="inputAddPanelSearch" type="text" />
      <div class="input-add-panel-list" id="inputAddPanelList"></div>
    </div>
  </div>
</div>
```

双栏形态示意：

```
单栏（现状）                     hover "技能" 200ms 后
┌─────────────┐                 ┌──────────┬───────────────────┐
│ ✨ 提示词    │                 │ ✨ 提示词 │ [🔍 搜索…]        │
│ ⚡ 技能      │                 │ ⚡ 技能◀ │ ┌───────────────┐ │
│ 🔌 MCP      │   ──────────►   │ 🔌 MCP   │ │ 1 🧩 技能A     │ │
│ 🌐 网页      │                 │ 🌐 网页   │ │ 2 🧩 技能B ✓  │ │
│ ─────────── │                 │ ─────────│ │ 3 🧩 技能C     │ │
│ 📖 知识库    │                 │ 📖 知识库 │ └───────────────┘ │
│ 👤 助手 …    │                 │ 👤 助手…  │                   │
│ 开关         │                 │ 开关      │                   │
└─────────────┘                 └──────────┴───────────────────┘
```

### 3.2 模块划分

| 模块 | 职责 | 变更 |
|---|---|---|
| `src/side_panel/input-add-menu.js` | 菜单开合（现有）+ hover 状态机（新增）+ 关闭时重置面板 | 修改 |
| `src/side_panel/input-add-menu-panel.js` | 面板数据获取/搜索过滤/列表渲染/选择接线（新模块） | 新建 |
| `src/side_panel/skill-selector.js` | `selectSkill` / `selectMcpService` 增加 `clearTrigger` 选项 | 修改 |
| `src/side_panel/prompt-manager.js` | `insertPromptToInputByCode` 增加 `skipTriggerStrip` 选项 | 修改 |
| `src/side_panel/styles.css` | 双栏布局/面板样式/窄屏收窄/fade-in | 修改 |
| `side_panel.html` | 双栏容器 + 面板骨架 | 修改 |

**解耦方式**：面板模块不 import 菜单模块；菜单模块向面板模块注入关闭回调：`initInputAddPanel({ onRequestClose: () => setOpen(false) })`。面板模块导出接口：

```js
export function initInputAddPanel({ onRequestClose })  // 初始化：DOM 引用、搜索框 input 事件、点击委托
export async function openCategoryPanel(category)      // 打开/切换类别；同类别重复调用 no-op；异步加载 + 渲染
export function closeCategoryPanel()                   // 收起右列 + 重置状态（类别/搜索/列表）
export function isCategoryPanelOpen()                  // 供状态机查询
export function getPanelCategory()                     // 当前类别（null | 'prompts' | 'skills' | 'mcp' | 'pages'）
export function isPanelSearchFocused()                 // 搜索守卫
```

### 3.3 双通道行为（用户已确认）

| 操作 | 行为 |
|---|---|
| 点击一级项（任意项） | **原逻辑零改动**：打开对应弹窗、菜单整体关闭 |
| hover 4 个面板类项 | 200ms 后右列展开，或其已展开时切换类别 |
| hover 非面板项（知识库/助手/代理/工作目录/截图/附件/开关区） | 150ms 后右列收起（缩回单栏） |
| 鼠标移出整个菜单容器 | 150ms 后右列收起；搜索框有焦点时不自动收起 |
| 点击右列列表项 | 执行选择动作（见 5.5），技能/MCP 多选后保持展开 |

## 4. 交互规格

### 4.1 hover 状态机（input-add-menu.js 内部）

常量：`SHOW_DELAY = 200`（防误触展开）、`HIDE_DELAY = 150`（收起防抖动）。

状态变量：`showTimer`、`hideTimer`、`isPointerInMenu`。

```js
const PANEL_ITEMS = {
  promptTriggerBtn: 'prompts',
  addMenuSkillBtn: 'skills',
  addMenuMcpBtn: 'mcp',
  addMenuPageBtn: 'pages',
};

// 事件委托挂在 .input-add-nav 上（mouseover 冒泡；面板内的移动不经过 nav，天然不触发收起）
nav.addEventListener('mouseover', (e) => {
  if (!isOpen()) return;
  const item = e.target.closest('.input-add-item');
  const category = item ? PANEL_ITEMS[item.id] : null;
  if (!category) { scheduleHide(); return; }        // 非面板项 / 左列空白 → 延迟收起
  clearTimeout(hideTimer);                          // 取消 pending 收起
  if (isCategoryPanelOpen() && getPanelCategory() === category) return; // 同类别已展开，no-op
  clearTimeout(showTimer);
  showTimer = setTimeout(() => openCategoryPanel(category), SHOW_DELAY);
});

// 菜单容器进出
menu.addEventListener('mouseenter', () => { isPointerInMenu = true; clearTimeout(hideTimer); });
menu.addEventListener('mouseleave', () => { isPointerInMenu = false; scheduleHide(); });

function scheduleHide() {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (isPanelSearchFocused()) return;             // 搜索中不收起（blur 时补判）
    closeCategoryPanel();
  }, HIDE_DELAY);
}

// 搜索框 blur 补判（菜单模块初始化时监听 #inputAddPanelSearch 的 blur）：
// blur 时若 !isPointerInMenu 则 scheduleHide()——防抖 150ms 后收起（此时搜索已不聚焦，守卫放行）
searchInput.addEventListener('blur', () => {
  if (!isPointerInMenu) scheduleHide();
});
```

**关键点**：

- 委托挂 `.input-add-nav`（非 `#inputAddMenu`）：鼠标在右列面板内移动不触发 scheduleHide
- `setOpen(false)`（覆盖"+"关闭、外部点击关闭、点击一级项 capture 关闭三条路径）统一执行：`clearTimeout(showTimer); clearTimeout(hideTimer); closeCategoryPanel();`
- 点击一级项时若 pending showTimer 未触发，被 `setOpen(false)` 清理，避免菜单已关但面板状态变脏
- 面板类目项展开时加 `.panel-active` class（保持高亮表示"右列为此类内容"，即使鼠标移到开关区）；切换/收起时同步清除。**该标记由菜单模块维护**（openCategoryPanel 成功后设置、closeCategoryPanel 后清除），面板模块不操作左列 DOM

### 4.2 状态重置

- 每次菜单打开（`setOpen(true)`）恢复单栏：先 `closeCategoryPanel()` 再刷新可见性
- 面板模块 `closeCategoryPanel()` 内部重置：`activeCategory = null`、搜索框 value 清空、列表清空、`loadSeq++`（作废在途请求）

### 4.3 宽度自适应（侧边栏 280~430px）

- 单栏：维持现状（`min-width: 210px`）
- 双栏：`.input-add-cols { display:flex }`；左列 `flex: 0 0 auto`；面板 `flex: 1 1 210px; min-width: 120px`；菜单 `max-width: calc(100vw - 16px)`
- 双栏时左列自动收窄：`.input-add-menu.has-panel .add-item-hint { display: none }`（隐藏截图项 hint）
- **验收标准**：探针在 280px / 430px 两档断言菜单右缘 ≤ 视口宽（无横向溢出）、面板可视宽 ≥ 120px；像素细节实现时按实测校准

### 4.4 视觉过渡

- 面板出现：`animation: inputAddPanelIn 0.15s ease`（opacity 0→1 + translateX(-4px)→0）
- 面板收起：即时（不加动画，避免 animationend 时序复杂度）
- 左列项 `.panel-active`：浅紫背景（与 hover 同色系，`rgba(102,126,234,0.08)`）

## 5. 面板内容规格

### 5.1 类别映射表

| category | 数据获取 | 过滤字段（大小写不敏感 contains） | 空数据场景 |
|---|---|---|---|
| `prompts` | `state.customPrompts`（同步） | `code`、`content` | 无自定义提示词 |
| `skills` | `await getVisibleSkills(true)`（强制刷新，与弹窗一致） | `name`、`description` | 无可用技能 |
| `mcp` | `await getMcpServices()` | `serverName`、`serverId` | 无 MCP 服务 |
| `pages` | `await getOpenTabs()`（active 标签页已置顶） | `title`、`url` | 无可选网页 |

**竞态防护**：每次 `openCategoryPanel` 自增 `loadSeq`，异步响应返回后 `seq !== loadSeq` 则丢弃（与 file-at-selector 的 searchSeq 模式一致）。

**缓存策略**：不做跨次缓存——每次展开/切换类别重新获取（与弹窗"每次打开都刷新"一致）；同类别重复 hover no-op（4.1 已保证）。

### 5.2 列表项渲染

原则：**复用现有基础 class 以继承选中标记刷新与视觉**（`refreshSkillPickedState` / `refreshMcpPickedState` 用全局 `document.querySelectorAll`，面板项带相同 class + data 属性即自动获得 picked 刷新）；样式用 `.input-add-panel-list` 作用域覆盖为紧凑布局。

| 类别 | 基础 class + data | 行内容 | 状态标记 |
|---|---|---|---|
| prompts | `.prompt-item` + `data-code` | 主文本 `/code` + 次要 content（单行截断） | 无 |
| skills | `.skill-list-item` + `data-skill-name` | 🧩 + name（禁用项灰显 + title 提示复用 `skillSelector.disabledTooltip`） | `.picked`（现有函数自动刷新） |
| mcp | `.mcp-list-item` + `data-server-id`/`data-server-name` | 🔌 + serverName（未开放项灰显 + 徽标复用 `skillSelector.mcpInactiveBadge`） | `.picked` |
| pages | `.prompt-item` + `data-tab-id` | 网页标题（无标题时显示 url，单行截断）；url 次要灰字（超窄时 CSS 隐藏） | 当前 `state.selectedPage.id` 匹配项加高亮 class（与弹窗标记对齐） |

- 列表容器 `max-height: 240px; overflow-y: auto`
- 行点击绑定：渲染后逐项 `addEventListener('click', ...)`（与弹窗模式一致）

### 5.3 搜索过滤

- 面板顶部 `#inputAddPanelSearch`，`input` 事件触发本地即时过滤（数据已全量在内存，无防抖）
- 过滤后重渲染列表；无命中显示 `input.addMenuPanelNoMatch` 空态
- 切换类别时清空搜索框
- placeholder 用 data-i18n 机制（`input.addMenuPanelSearchPlaceholder`）

### 5.4 空态/加载态

| 状态 | 显示 | i18n key |
|---|---|---|
| 加载中 | `加载中…`（`.prompt-empty`） | `input.addMenuPanelLoading` |
| 数据为空 / 加载失败（catch 后） | `暂无可用内容` | `input.addMenuPanelEmpty` |
| 搜索无命中 | `没有匹配项` | `input.addMenuPanelNoMatch` |

### 5.5 选择行为（与弹窗内完全一致）

| 类别 | 普通点击 | Ctrl/Cmd + 点击 | 点击后面板 |
|---|---|---|---|
| prompts | `sendPromptByCode(code)`（直接发送） | `insertPromptToInputByCode(code, { skipTriggerStrip: true })`（带入输入框） | 收起菜单（`onRequestClose()`） |
| skills | `selectSkill(name, skills, { clearTrigger: false })`（多选切换） | 同左 + 收起菜单 | 普通点击保持展开，可连续勾选 |
| mcp | `selectMcpService(serverId, serverName, services, { clearTrigger: false })`（多选切换） | 同左 + 收起菜单 | 普通点击保持展开 |
| pages | `selectPage(tab)`（单选）+ 收起菜单 + focus 输入框 + `adjustInputHeight()` | （无特殊行为，同左） | 收起菜单 |

- prompts 收起菜单后由 `sendPromptByCode` / `insertPromptToInputByCode` 自身完成发送/带入与回焦
- skills/mcp 普通点击后面板保持展开，picked 标记经现有全局刷新函数自动更新，指示器 chips 同步
- pages 使用 `page-selector.js` 已导出的 `selectPage(tab)`（纯状态选择 + 指示器）；输入框无 @ 触发文本，无需清理

### 5.6 选中标记刷新

- skills/mcp：`selectSkill` / `selectMcpService` 内部自动调用 `refreshSkillPickedState()` / `refreshMcpPickedState()`（全局查询 `.skill-list-item` / `.mcp-list-item`），面板项带同 class + data 属性即被覆盖，**无需面板侧额外刷新**
- pages：选中后菜单收起，无需刷新；再次展开面板时渲染按 `state.selectedPage.id` 重新标记

## 6. 触发符截断修正（正确性修复）

**问题**：三个函数当前无条件按"最后一个 `/`"截断输入框文本。菜单面板是独立于 `/` 触发的入口，输入框中的 `/` 可能是正文（如 URL、路径），直接复用会**误删用户文本**。

| 函数 | 现状 | 修正 |
|---|---|---|
| `selectSkill(skillName, skills)` | 内部调 `clearSlashTriggerText()`：截断最后一个 `/` 之后内容 | 增加第三参 `{ clearTrigger = true } = {}`；`false` 时跳过截断，仅保留 `userInput.focus()` + 光标移至末尾 + `adjustInputHeight()` |
| `selectMcpService(serverId, serverName, services)` | 同上 | 同上 |
| `insertPromptToInputByCode(code)` | 找最后一个 `/`，截断 `/`（或行首）之前内容为 baseContent | 增加第二参 `{ skipTriggerStrip = false } = {}`；`true` 时 `baseContent = value`（全文保留），其余追加/回焦逻辑不变 |

默认参数保证弹窗调用方**零改动、行为不变**。

## 7. 边界与错误处理

- **数据获取失败**：各 async 获取包 try/catch，失败显示 `input.addMenuPanelEmpty` 空态，不抛出、不阻塞菜单
- **快速滑过多类**：`showTimer` 只对最后一次停留生效（clearTimeout 重置）；类目项之间滑动会频繁重置 timer，行为正确（停留在目标项 200ms 才展开）
- **面板内移动**：不触发收起（委托挂 nav、mouseover 不冒泡自面板）
- **外部点击关闭**：document 层基于 `.input-add-wrapper` contains 判断，面板在 wrapper 内，点击面板不会误关菜单（现状保持）
- **capture 关闭不误触发**：菜单 capture 层只响应 `closest('.input-add-item')`；面板内元素不带该 class，面板内点击不会关闭整个菜单
- **z-index**：面板在 `#inputAddMenu`（z-index 1000）内，无新增层级需求
- **搜索焦点守卫**：`isPanelSearchFocused()` 为 true 时 hideTimer 到期不收起；搜索框 blur 后若 `!isPointerInMenu` 则补一次 scheduleHide

## 8. i18n 文案（模块内 registerTranslations，跟随 file-at-selector.js 模式）

| key | zh | en |
|---|---|---|
| `input.addMenuPanelSearchPlaceholder` | 搜索… | Search… |
| `input.addMenuPanelLoading` | 加载中… | Loading… |
| `input.addMenuPanelEmpty` | 暂无可用内容 | No items available |
| `input.addMenuPanelNoMatch` | 没有匹配项 | No matches |

复用现有：`skillSelector.disabledTooltip`、`skillSelector.mcpInactiveBadge`。

## 9. 测试计划

### 9.1 单测（vitest，TDD）

**新建 `test/unit/input-add-menu-panel.unit.test.js`**：

1. 四类渲染：mock 数据源 → 断言列表项数量、主/次文本、data 属性、空态/加载态
2. 搜索过滤：输入关键字 → 命中项渲染、无命中显示 noMatch；切换类别清空搜索
3. 选择接线：点击各类项 → mock `sendPromptByCode` / `insertPromptToInputByCode` / `selectSkill` / `selectMcpService` / `selectPage` 被调用且参数正确（skills/mcp 带 `{ clearTrigger: false }`）
4. Ctrl/Cmd+点击：skills/mcp 触发 `onRequestClose`；普通点击不触发且列表保持
5. 竞态：连续 openCategoryPanel 两个类别，先发的慢响应被丢弃
6. 失败路径：数据源 reject → 空态文案
7. `closeCategoryPanel()`：清空搜索、activeCategory 重置、DOM 隐藏

**扩展 `test/unit/input-add-menu.unit.test.js`**（fake timers）：

1. hover 面板项 199ms 不展开、200ms 后 `openCategoryPanel` 被调
2. hover 非面板项 150ms 后 `closeCategoryPanel` 被调
3. 鼠标移出菜单容器 150ms 后收起；移回取消
4. 搜索聚焦时 hideTimer 到期不收起
5. 点击一级项 → pending showTimer 被清理、`closeCategoryPanel` 被调
6. 同类别重复 hover：不重复调 `openCategoryPanel`

**扩展签名相关测试**：

- 追加到 `test/unit/skill-mcp-multi.unit.test.js`：
  1. `selectSkill(name, skills, { clearTrigger: false })`：输入框含 `/` 文本不被截断、焦点回输入框
  2. `selectMcpService(..., { clearTrigger: false })`：同上
  3. 不传选项（默认路径）行为回归：`/` 触发文本仍被截断
- 新建 `test/unit/prompt-manager-insert.unit.test.js`：
  1. `insertPromptToInputByCode(code, { skipTriggerStrip: true })`：含 `/` 的输入文本全文保留 + 追加提示词
  2. 不传选项（默认路径）行为回归：`/` 触发截断逻辑不变

### 9.2 探针（Playwright，构建产物上运行）

**新建 `test-results-probes/_input-add-menu-panel.mjs`**（与主探针 `_input-bar-tiers.mjs` 分离）：

1. 点击 "+" 打开菜单 → hover 提示词项 → 等待 250ms → 断言面板可见、搜索框存在、面板含 mock 提示词项
2. hover 技能项 → 断言类别切换（列表内容变化、搜索框已清空）
3. 搜索过滤：输入关键字 → 断言项数减少；清空恢复
4. 点击技能项（普通）→ 断言 picked 标记 + 技能指示器 chip + 菜单与面板保持展开
5. Ctrl+点击技能项 → 断言菜单收起
6. 网页项：mock `chrome.tabs.query` → 点击 → 断言网页指示器出现 + 菜单收起
7. 宽度几何：280px 视口下双栏展开 → 断言菜单右缘 ≤ 视口宽、面板宽 ≥ 120px；430px 同样断言
8. 回归：点击一级项 → 对应弹窗打开 + 菜单关闭；点击 "+" → 面板状态清零
9. 关键场景截图人工确认

### 9.3 回归

- 全量单测（807+ 用例）通过（排除 2 个预先存在的 apply-rag unhandled errors）
- `npx eslint` 0 报错；`npm run build:silent` 成功

## 10. 文件清单

| 操作 | 文件 |
|---|---|
| 修改 | `side_panel.html`（双栏容器 + 面板骨架 + data-i18n placeholder） |
| 修改 | `src/side_panel/styles.css`（双栏布局/面板/窄屏/fade-in/panel-active） |
| 修改 | `src/side_panel/input-add-menu.js`（hover 状态机 + 重置 + 注入回调） |
| 新建 | `src/side_panel/input-add-menu-panel.js`（面板模块） |
| 修改 | `src/side_panel/skill-selector.js`（clearTrigger 选项） |
| 修改 | `src/side_panel/prompt-manager.js`（skipTriggerStrip 选项） |
| 新建 | `test/unit/input-add-menu-panel.unit.test.js` |
| 修改 | `test/unit/input-add-menu.unit.test.js`（hover 状态机用例） |
| 修改 | `test/unit/skill-mcp-multi.unit.test.js`（clearTrigger:false 用例） |
| 新建 | `test/unit/prompt-manager-insert.unit.test.js`（skipTriggerStrip 用例） |
| 新建 | `test-results-probes/_input-add-menu-panel.mjs` |

## 11. 已声明的行为约束（用户确认项）

- 普通点击 = 与弹窗内一致（提示词直接发送、技能/MCP 多选切换且保持展开、网页选中并收起）
- Ctrl/Cmd+点击 = 选中并收起（技能/MCP）；提示词 Ctrl = 带入输入框并收起
- 点击一级项本身 = 打开弹窗（现状不变）
- hover 非面板项 / 移出菜单 → 右列收起缩回单栏（第 1 节设计已确认）
