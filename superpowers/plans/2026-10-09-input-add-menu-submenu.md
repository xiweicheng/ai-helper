# 加号菜单二级面板（双栏联动）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加号菜单支持悬停展开双栏二级面板（提示词/技能/MCP/网页），可在菜单内搜索过滤并直接选择触发，与"点击打开弹窗"双通道并存。

**Architecture:** 新建面板模块 `input-add-menu-panel.js`（数据加载/搜索/渲染/选择接线，通过注入回调与菜单模块解耦）；`input-add-menu.js` 增加 hover 状态机（200ms 展开 / 150ms 收起 / 搜索聚焦守卫）；`skill-selector.js` / `prompt-manager.js` 增加 options 参数修正触发符截断（菜单场景不误删输入框中的 `/` 正文），默认参数保证弹窗侧零回归。

**Tech Stack:** 原生 JS（ES modules）、Vitest（jsdom）、Playwright 探针（构建产物）、CSS。

**Spec:** `docs/superpowers/specs/2026-10-09-input-add-menu-submenu-design.md`

## Global Constraints

- 所有新增 UI 文案 zh/en 双语注册（`registerTranslations` 深合并，可用 `input.addMenuPanel*` 命名空间），禁止硬编码中文
- 修改 `skill-selector.js` / `prompt-manager.js` 必须保持默认参数行为不变（弹窗侧零回归，现有测试全绿）
- 每个任务结束运行相关单测；全部完成后 `npm run build:silent` 必须成功
- 探针文件在 gitignore 目录，提交必须 `git add -f test-results-probes/<file>`
- 提交信息中文，`feat:` / `test:` / `fix:` 前缀；不主动 push
- 单测在 `test/unit/`，`npx vitest run <file>` 单跑；jsdom 环境首行注释 `// @vitest-environment jsdom`

---

### Task 1: HTML 双栏骨架 + 面板 CSS + 测试 fixture 同步

**Files:**
- Modify: `side_panel.html`（`#inputAddMenu` 内，约 455-504 行）
- Modify: `src/side_panel/styles.css`（`.input-add-menu-switches-title` 段落之后，约 1195 行）
- Modify: `test/unit/input-add-menu.unit.test.js`（`setupDom` 函数）

**Interfaces:**
- Consumes: 无
- Produces: DOM 骨架 `#inputAddPanel` / `#inputAddPanelSearch` / `#inputAddPanelList`、`.input-add-nav` 容器、`.input-add-cols` 双栏容器、`.input-add-menu.has-panel` 状态类（Task 3/4 与 CSS 选择器依赖这些名称）

- [ ] **Step 1: 修改 `side_panel.html`**

在 `#inputAddMenu` 打开标签后插入 `<div class="input-add-cols"><div class="input-add-nav">`；在开关区 `</div>`（`#inputAddMenuSwitches` 闭合）之后、`</div>`（`#inputAddMenu` 闭合）之前，插入 nav 闭合标签与面板骨架。最终结构：

```html
<div class="input-add-menu" id="inputAddMenu" style="display:none;">
  <div class="input-add-cols">
    <div class="input-add-nav">
      <!-- 现有选择器直达组①（3 项）、分隔符、组②（5 项）、分隔符、截图/附件、
           开关区（#inputAddMenuSwitches）——内容一行不动 -->
    </div>
    <div class="input-add-panel" id="inputAddPanel" style="display:none;">
      <input class="input-add-panel-search" id="inputAddPanelSearch" type="text" placeholder="搜索…">
      <div class="input-add-panel-list" id="inputAddPanelList"></div>
    </div>
  </div>
</div>
```

注意：`placeholder` 仅为无 JS 时的兜底，真实文案由 `initInputAddPanel` 用 `t()` 动态设置。

- [ ] **Step 2: 修改 `src/side_panel/styles.css`**

在 `.input-add-menu-switches-title` 规则块之后追加：

```css
/* 双栏容器：单栏时仅左列可见；右列由 JS 控制 display 开关 */
.input-add-cols {
  display: flex;
  align-items: stretch;
}
.input-add-nav {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  min-width: 0;
}
/* 双栏展开态：菜单总宽受视口限制（侧边栏最窄 280px），超宽时右列自动收缩 */
.input-add-menu.has-panel {
  max-width: calc(100vw - 16px);
}
/* 双栏时收起截图项 hint，为左列让出宽度 */
.input-add-menu.has-panel .add-item-hint {
  display: none;
}
/* 当前展开面板对应的类别项保持高亮（鼠标移开后仍可辨识右列归属） */
.input-add-item.panel-active {
  background: rgba(102, 126, 234, 0.08);
}
.input-add-panel {
  display: none; /* JS 展开时置为 flex */
  flex: 1 1 210px;
  min-width: 120px;
  flex-direction: column;
  border-left: 1px solid rgba(0, 0, 0, 0.06);
  margin-left: 6px;
  padding-left: 6px;
  animation: inputAddPanelIn 0.15s ease;
}
@keyframes inputAddPanelIn {
  from { opacity: 0; transform: translateX(-4px); }
  to { opacity: 1; transform: none; }
}
.input-add-panel-search {
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 5px 8px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  color: #333;
  outline: none;
}
.input-add-panel-search:focus {
  border-color: rgba(102, 126, 234, 0.6);
}
.input-add-panel-list {
  flex: 1;
  min-height: 0;
  margin-top: 6px;
  max-height: 240px;
  overflow-y: auto;
}
/* 面板内列表项紧凑化（作用域覆盖弹窗样式） */
.input-add-panel-list .input-add-panel-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  margin: 0;
  border-radius: 6px;
  cursor: pointer;
  min-width: 0;
}
.input-add-panel-list .input-add-panel-item:hover {
  background: rgba(102, 126, 234, 0.08);
}
.input-add-panel-item-icon {
  flex-shrink: 0;
  font-size: 12px;
}
.input-add-panel-item-title {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 12px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.input-add-panel-item-sub {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
}
.input-add-panel-item .page-selected-mark {
  flex-shrink: 0;
  color: #667eea;
  font-size: 12px;
}
```

- [ ] **Step 3: 同步测试 fixture（`test/unit/input-add-menu.unit.test.js` 的 `setupDom`）**

将 ``<div class="input-add-menu" id="inputAddMenu" style="display:none;">` 至其闭合 `</div>` 的块替换为双栏结构（所有 id 与项顺序保持不变）：

```js
          <div class="input-add-menu" id="inputAddMenu" style="display:none;">
            <div class="input-add-cols">
              <div class="input-add-nav">
                <button class="input-add-item" id="promptTriggerBtn">提示词</button>
                <button class="input-add-item" id="addMenuSkillBtn">技能</button>
                <button class="input-add-item" id="addMenuMcpBtn">MCP</button>
                <div class="input-add-divider"></div>
                <button class="input-add-item" id="addMenuPageBtn">网页</button>
                <button class="input-add-item" id="addMenuKnowledgeBtn">知识库</button>
                <button class="input-add-item" id="addMenuAgentBtn">助手</button>
                <button class="input-add-item" id="addMenuProxyBtn">代理</button>
                <button class="input-add-item" id="addMenuWorkspaceBtn" style="display:none;">工作目录</button>
                <div class="input-add-divider"></div>
                <button class="input-add-item" id="screenshotBtn">截图</button>
                <button class="input-add-item" id="fileAttachBtn">附件</button>
                <div class="input-add-menu-switches" id="inputAddMenuSwitches">
                  <div class="input-add-menu-switches-title">开关</div>
                </div>
              </div>
              <div class="input-add-panel" id="inputAddPanel" style="display:none;">
                <input id="inputAddPanelSearch" type="text">
                <div id="inputAddPanelList"></div>
              </div>
            </div>
          </div>
```

- [ ] **Step 4: 运行现有测试验证零破坏**

Run: `npx vitest run test/unit/input-add-menu.unit.test.js`
Expected: 12 用例全绿（纯结构改动，逻辑未动）

- [ ] **Step 5: eslint + 构建**

Run: `npx eslint src/side_panel/input-add-menu.js test/unit/input-add-menu.unit.test.js && npm run build:silent`
Expected: 0 报错，构建成功

- [ ] **Step 6: 提交**

```bash
git add side_panel.html src/side_panel/styles.css test/unit/input-add-menu.unit.test.js
git commit -m "feat: 加号菜单双栏骨架与面板样式（二级面板前置）"
```

---

### Task 2: 触发符截断修正（selectSkill / selectMcpService / insertPromptToInputByCode 签名扩展）

**Files:**
- Modify: `src/side_panel/skill-selector.js`（`selectSkill` 约 259 行、`selectMcpService` 约 665 行）
- Modify: `src/side_panel/prompt-manager.js`（`insertPromptToInputByCode` 约 571 行）
- Test: `test/unit/skill-mcp-multi.unit.test.js`（追加 describe）
- Test: `test/unit/prompt-manager-insert.unit.test.js`（新建）

**Interfaces:**
- Consumes: 现有 `clearSlashTriggerText()`（skill-selector 内部）
- Produces（Task 3 依赖）:
  - `selectSkill(skillName: string, skills: Array, options?: { clearTrigger?: boolean })` —— 默认 `true`（截断，弹窗行为）；`false` 时不截断仅回焦
  - `selectMcpService(serverId: string, serverName: string, services: Array, options?: { clearTrigger?: boolean })` —— 同上
  - `insertPromptToInputByCode(code: string, options?: { skipTriggerStrip?: boolean })` —— 默认 `false`（截断）；`true` 时 `baseContent` 保留输入框全文

- [ ] **Step 1: 追加失败测试到 `test/unit/skill-mcp-multi.unit.test.js`**

在 `describe('selectSkill 多选 toggle 与 chips 指示器', ...)` 块内追加：

```js
  test('clearTrigger:false 时不截断输入框中的 "/" 正文，仅回焦', () => {
    const input = document.getElementById('userInput');
    input.value = '看这个 https://a.com/b 页面';
    selector.selectSkill('技能A', SKILLS, { clearTrigger: false });
    expect(input.value).toBe('看这个 https://a.com/b 页面'); // 未被截断
    expect(document.activeElement).toBe(input); // 仍回焦
  });
```

在 `describe('selectMcpService 多选 toggle 与 chips 指示器', ...)` 块内追加：

```js
  test('clearTrigger:false 时不截断输入框中的 "/" 正文，仅回焦', () => {
    const input = document.getElementById('userInput');
    input.value = '路径 src/side_panel 分析';
    selector.selectMcpService('srv-x', '服务X', SERVICES, { clearTrigger: false });
    expect(input.value).toBe('路径 src/side_panel 分析');
    expect(document.activeElement).toBe(input);
  });
```

在文件末尾新增默认路径回归 describe：

```js
describe('默认行为回归（弹窗侧不受签名扩展影响）', () => {
  test('selectSkill 默认仍截断最后一个 "/" 之后文本', () => {
    const input = document.getElementById('userInput');
    input.value = '前缀/过滤词';
    selector.selectSkill('技能A', SKILLS);
    expect(input.value).toBe('前缀');
  });
});
```

- [ ] **Step 2: 新建 `test/unit/prompt-manager-insert.unit.test.js`**

```js
// @vitest-environment jsdom
// insertPromptToInputByCode 签名扩展：skipTriggerStrip 保留输入框全文（菜单面板 Ctrl+点击场景）
import { describe, test, expect, beforeEach, beforeAll } from 'vitest';

const noop = () => {};
globalThis.chrome = {
  storage: {
    local: { get: (k, cb) => { if (typeof cb === 'function') cb({}); else return Promise.resolve({}); }, set: noop },
    onChanged: { addListener: noop },
  },
  runtime: { lastError: null, getManifest: () => ({ content_scripts: [{ js: [] }] }), getURL: (p) => p, sendMessage: () => Promise.resolve({}), onMessage: { addListener: noop } },
};

let pm;
let state;

beforeAll(async () => {
  pm = await import('../../src/side_panel/prompt-manager.js');
  state = (await import('../../src/side_panel/state.js')).default;
});

beforeEach(() => {
  document.body.innerHTML = `
    <textarea id="userInput"></textarea>
    <div id="promptSelector" style="display: block;">
      <div class="prompt-dropdown show" id="promptDropdown"></div>
    </div>`;
  state.customPrompts = [{ code: 'p1', content: '发送内容' }];
});

describe('insertPromptToInputByCode 签名扩展', () => {
  test('skipTriggerStrip:true 时输入框含 "/" 的正文全文保留并追加提示词', () => {
    const input = document.getElementById('userInput');
    input.value = '看 https://a.com/b 这个';
    pm.insertPromptToInputByCode('p1', { skipTriggerStrip: true });
    expect(input.value).toBe('看 https://a.com/b 这个\n\n发送内容');
  });

  test('默认路径回归：仍按最后一个 "/" 截断', () => {
    const input = document.getElementById('userInput');
    input.value = '前缀/过滤词';
    pm.insertPromptToInputByCode('p1');
    expect(input.value).toBe('前缀\n\n发送内容');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run test/unit/skill-mcp-multi.unit.test.js test/unit/prompt-manager-insert.unit.test.js`
Expected: 新用例 FAIL（选项未实现：非默认路径仍执行截断）

- [ ] **Step 4: 实现 `skill-selector.js` 的 `selectSkill` 选项**

将 `selectSkill` 签名与截断调用改为：

```js
export function selectSkill(skillName, skills, { clearTrigger = true } = {}) {
```

原 `// 清除输入框中的 / 触发文本（含过滤关键字）` 一行 `clearSlashTriggerText();` 替换为：

```js
  if (clearTrigger) {
    // 弹窗场景：清除输入框中的 / 触发文本（含过滤关键字）
    clearSlashTriggerText();
  } else {
    // 菜单面板场景：输入框中的 "/" 可能属于正文，不截断，仅保持回焦习惯
    const userInput = document.getElementById('userInput');
    if (userInput) {
      userInput.focus();
      userInput.selectionStart = userInput.selectionEnd = userInput.value.length;
    }
    adjustInputHeight();
  }
```

（`selectSkill` JSDoc 补充 `@param {{clearTrigger?: boolean}} [options]`。确认 skill-selector.js 已 import `adjustInputHeight`——`clearSlashTriggerText` 内部使用了它，同模块顶层已导入。）

- [ ] **Step 5: 实现 `skill-selector.js` 的 `selectMcpService` 选项**

同 Step 4 模式：签名改 `export function selectMcpService(serverId, serverName, services, { clearTrigger = true } = {})`，`clearSlashTriggerText();` 调用替换为相同的 if/else 分支。

- [ ] **Step 6: 实现 `prompt-manager.js` 的 `insertPromptToInputByCode` 选项**

签名改 `export function insertPromptToInputByCode(code, { skipTriggerStrip = false } = {})`；原截断判断：

```js
  if (lastSlashIndex !== -1) {
```

改为：

```js
  if (!skipTriggerStrip && lastSlashIndex !== -1) {
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run test/unit/skill-mcp-multi.unit.test.js test/unit/prompt-manager-insert.unit.test.js`
Expected: 全部 PASS

- [ ] **Step 8: 回归 + 提交**

Run: `npx eslint src/side_panel/skill-selector.js src/side_panel/prompt-manager.js && npx vitest run test/unit/file-at-selector.unit.test.js`

```bash
git add src/side_panel/skill-selector.js src/side_panel/prompt-manager.js test/unit/skill-mcp-multi.unit.test.js test/unit/prompt-manager-insert.unit.test.js
git commit -m "feat: 技能/MCP/提示词选择函数支持跳过触发符截断（菜单面板场景）"
```

---

### Task 3: 面板模块 `input-add-menu-panel.js`

**Files:**
- Create: `src/side_panel/input-add-menu-panel.js`
- Test: `test/unit/input-add-menu-panel.unit.test.js`

**Interfaces:**
- Consumes:
  - Task 2 的 `selectSkill(..., { clearTrigger: false })` / `selectMcpService(..., { clearTrigger: false })` / `insertPromptToInputByCode(code, { skipTriggerStrip: true })`
  - `skill-selector.js`: `getVisibleSkills(true)`、`getMcpServices()`、`refreshSkillPickedState()`、`refreshMcpPickedState()`
  - `prompt-manager.js`: `sendPromptByCode(code)`；`page-selector.js`: `getOpenTabs()`、`selectPage(tab)`；`state.js` 的 `state.customPrompts` / `state.selectedPage`；`utils.js`: `escapeHtml` / `escapeAttr` / `adjustInputHeight`
- Produces（Task 4 依赖）: `initInputAddPanel({ onRequestClose })`、`openCategoryPanel(category)`、`closeCategoryPanel()`、`isCategoryPanelOpen()`、`getPanelCategory()`、`isPanelSearchFocused()`

- [ ] **Step 1: 新建模块 `src/side_panel/input-add-menu-panel.js`**（完整实现）

```js
// 侧边栏 "+" 菜单二级面板：悬停类别项时在菜单右侧展开「搜索框 + 列表」，
// 数据与选择动作完全复用各模块现有函数（提示词/技能/MCP/网页 4 类）。
//
// 职责：
//   1) openCategoryPanel(category)：加载该类数据并渲染（技能强制刷新，与弹窗一致）；
//      同类别重复调用 no-op；切换类别清空搜索框；请求序号丢弃过期响应；
//   2) 搜索过滤：本地即时过滤（code/content、name/description、serverName/serverId、title/url）；
//   3) 选择接线：普通点击与弹窗内行为一致（提示词发送、技能/MCP 多选切换、网页选中），
//      Ctrl/Cmd+点击 = 选中并收起菜单；技能/MCP 传 clearTrigger:false 防止误删输入框中的 "/" 正文；
//   4) closeCategoryPanel()：收起并重置（供菜单模块在关闭/移出时调用）。
//
// 与菜单模块解耦：不 import input-add-menu.js；需要关闭整个菜单时调用注入的 onRequestClose。
import state from './state.js';
import {
  getVisibleSkills, selectSkill, refreshSkillPickedState,
  getMcpServices, selectMcpService, refreshMcpPickedState,
} from './skill-selector.js';
import { sendPromptByCode, insertPromptToInputByCode } from './prompt-manager.js';
import { getOpenTabs, selectPage } from './page-selector.js';
import { escapeHtml, escapeAttr, adjustInputHeight } from './utils.js';
import { t, registerTranslations } from '../shared/i18n.js';
import logger from '../shared/logger.js';

registerTranslations('zh', {
  input: {
    addMenuPanelSearchPlaceholder: '搜索…',
    addMenuPanelLoading: '加载中…',
    addMenuPanelEmpty: '暂无可用内容',
    addMenuPanelNoMatch: '没有匹配项',
  },
});
registerTranslations('en', {
  input: {
    addMenuPanelSearchPlaceholder: 'Search…',
    addMenuPanelLoading: 'Loading…',
    addMenuPanelEmpty: 'No items available',
    addMenuPanelNoMatch: 'No matches',
  },
});

let panelEl = null;
let searchEl = null;
let listEl = null;
let activeCategory = null;
let dataset = [];   // 当前类别完整数据（渲染按搜索词过滤，选择动作传全量）
let loadSeq = 0;    // 请求序号：连续切换类别时只应用最后一次响应
let onRequestClose = () => {};

export function initInputAddPanel(options = {}) {
  onRequestClose = typeof options.onRequestClose === 'function' ? options.onRequestClose : () => {};
  panelEl = document.getElementById('inputAddPanel');
  searchEl = document.getElementById('inputAddPanelSearch');
  listEl = document.getElementById('inputAddPanelList');
  if (!panelEl || !searchEl || !listEl) return;
  searchEl.addEventListener('input', () => renderList());
}

export function isCategoryPanelOpen() {
  return !!activeCategory;
}

export function getPanelCategory() {
  return activeCategory;
}

export function isPanelSearchFocused() {
  return !!searchEl && document.activeElement === searchEl;
}

export async function openCategoryPanel(category) {
  if (!panelEl || !category) return;
  // 同类别已展开：no-op（状态机层已判断，此处防御）
  if (activeCategory === category && panelEl.style.display !== 'none') return;

  activeCategory = category;
  if (searchEl) {
    searchEl.value = '';
    searchEl.placeholder = t('input.addMenuPanelSearchPlaceholder');
  }
  panelEl.style.display = 'flex';
  const seq = ++loadSeq;
  if (listEl) listEl.innerHTML = `<div class="prompt-empty">${t('input.addMenuPanelLoading')}</div>`;

  try {
    const data = await fetchCategoryData(category);
    if (seq !== loadSeq) return; // 过期响应（已切换类别或已关闭）
    dataset = Array.isArray(data) ? data : [];
    renderList();
  } catch (err) {
    if (seq !== loadSeq) return;
    logger.warn('[InputAddPanel] load failed:', err && err.message);
    dataset = [];
    if (listEl) listEl.innerHTML = `<div class="prompt-empty">${t('input.addMenuPanelEmpty')}</div>`;
  }
}

export function closeCategoryPanel() {
  activeCategory = null;
  dataset = [];
  loadSeq++; // 作废在途请求
  if (searchEl) searchEl.value = '';
  if (listEl) listEl.innerHTML = '';
  if (panelEl) panelEl.style.display = 'none';
}

function fetchCategoryData(category) {
  switch (category) {
    case 'prompts': return Promise.resolve(state.customPrompts || []);
    case 'skills': return getVisibleSkills(true);
    case 'mcp': return getMcpServices();
    case 'pages': return getOpenTabs();
    default: return Promise.resolve([]);
  }
}

function filterDataset(query) {
  if (!query) return dataset;
  const q = query.toLowerCase();
  return dataset.filter((item) => {
    switch (activeCategory) {
      case 'prompts':
        return String(item.code || '').toLowerCase().includes(q)
          || String(item.content || '').toLowerCase().includes(q);
      case 'skills':
        return String(item.name || '').toLowerCase().includes(q)
          || String(item.description || '').toLowerCase().includes(q);
      case 'mcp':
        return String(item.serverName || '').toLowerCase().includes(q)
          || String(item.serverId || '').toLowerCase().includes(q);
      case 'pages':
        return String(item.title || '').toLowerCase().includes(q)
          || String(item.url || '').toLowerCase().includes(q);
      default:
        return true;
    }
  });
}

function renderList() {
  if (!listEl) return;
  const query = searchEl ? searchEl.value.trim() : '';
  const items = filterDataset(query);
  if (items.length === 0) {
    listEl.innerHTML = `<div class="prompt-empty">${query ? t('input.addMenuPanelNoMatch') : t('input.addMenuPanelEmpty')}</div>`;
    return;
  }
  listEl.innerHTML = items.map((item) => renderItem(item)).join('');
  listEl.querySelectorAll('.input-add-panel-item').forEach((el) => {
    el.addEventListener('click', (e) => handleItemClick(e, el));
  });
  // 技能/MCP 已选标记：复用全局刷新函数（面板项带 .skill-list-item/.mcp-list-item 即被覆盖）
  if (activeCategory === 'skills') refreshSkillPickedState();
  if (activeCategory === 'mcp') refreshMcpPickedState();
}

function renderItem(item) {
  switch (activeCategory) {
    case 'prompts':
      return `<div class="prompt-item input-add-panel-item" data-code="${escapeHtml(item.code)}" title="${escapeAttr(item.content || '')}">
        <span class="input-add-panel-item-title">/${escapeHtml(item.code)}</span>
        <span class="input-add-panel-item-sub">${escapeHtml(item.content || '')}</span>
      </div>`;
    case 'skills': {
      const disabled = item.enabled === false;
      const title = disabled ? `${item.name}\n${t('skillSelector.disabledTooltip')}` : item.name;
      return `<div class="skill-list-item input-add-panel-item${disabled ? ' skill-list-item-disabled' : ''}" data-skill-name="${escapeHtml(item.name)}" title="${escapeAttr(title)}">
        <span class="input-add-panel-item-icon">🧩</span>
        <span class="input-add-panel-item-title">${escapeHtml(item.name)}</span>
      </div>`;
    }
    case 'mcp': {
      const inactive = item.effectiveOpen === false;
      const title = inactive ? `${item.serverName}\n${t('skillSelector.mcpInactiveTooltip')}` : item.serverName;
      return `<div class="mcp-list-item input-add-panel-item${inactive ? ' mcp-list-item-inactive' : ''}" data-server-id="${escapeHtml(item.serverId)}" data-server-name="${escapeHtml(item.serverName)}" title="${escapeAttr(title)}">
        <span class="input-add-panel-item-icon">🔌</span>
        <span class="input-add-panel-item-title">${escapeHtml(item.serverName)}</span>
        ${inactive ? `<span class="mcp-list-item-badge mcp-badge-inactive">${t('skillSelector.mcpInactiveBadge')}</span>` : ''}
      </div>`;
    }
    case 'pages': {
      const title = item.title || item.url || '';
      const selected = !!(state.selectedPage && state.selectedPage.id === item.id);
      return `<div class="prompt-item input-add-panel-item" data-tab-id="${item.id}">
        <span class="input-add-panel-item-title">${escapeHtml(title)}</span>
        <span class="input-add-panel-item-sub">${escapeHtml(item.url || '')}</span>
        ${selected ? '<span class="page-selected-mark">✓</span>' : ''}
      </div>`;
    }
    default:
      return '';
  }
}

function handleItemClick(e, el) {
  const withCtrl = e.ctrlKey || e.metaKey;
  switch (activeCategory) {
    case 'prompts': {
      const code = el.dataset.code;
      if (withCtrl) insertPromptToInputByCode(code, { skipTriggerStrip: true });
      else sendPromptByCode(code);
      onRequestClose();
      break;
    }
    case 'skills':
      selectSkill(el.dataset.skillName, dataset, { clearTrigger: false });
      if (withCtrl) onRequestClose();
      break;
    case 'mcp':
      selectMcpService(el.dataset.serverId, el.dataset.serverName, dataset, { clearTrigger: false });
      if (withCtrl) onRequestClose();
      break;
    case 'pages': {
      const tab = dataset.find((x) => String(x.id) === el.dataset.tabId);
      if (tab) {
        // 与弹窗 selectPageByAt 一致：选中 + 回焦输入框（面板无 @ 触发文本，无需清理）
        selectPage(tab);
        const input = document.getElementById('userInput');
        if (input) input.focus();
        adjustInputHeight();
      }
      onRequestClose();
      break;
    }
    default:
      break;
  }
}
```

- [ ] **Step 2: 新建测试 `test/unit/input-add-menu-panel.unit.test.js`**（完整实现）

```js
// @vitest-environment jsdom
// 面板模块：四类渲染/搜索过滤/空态/竞态/选择接线/Ctrl 行为/关闭重置
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/side_panel/prompt-manager.js', () => ({
  sendPromptByCode: vi.fn(async () => {}),
  insertPromptToInputByCode: vi.fn(),
}));
vi.mock('../../src/side_panel/skill-selector.js', () => ({
  getVisibleSkills: vi.fn(async () => []),
  getMcpServices: vi.fn(async () => []),
  selectSkill: vi.fn(),
  selectMcpService: vi.fn(),
  refreshSkillPickedState: vi.fn(),
  refreshMcpPickedState: vi.fn(),
}));
vi.mock('../../src/side_panel/page-selector.js', () => ({
  getOpenTabs: vi.fn(async () => []),
  selectPage: vi.fn(),
}));

import {
  initInputAddPanel, openCategoryPanel, closeCategoryPanel,
  isCategoryPanelOpen, getPanelCategory, isPanelSearchFocused,
} from '../../src/side_panel/input-add-menu-panel.js';
import {
  getVisibleSkills, getMcpServices, selectSkill, selectMcpService,
  refreshSkillPickedState, refreshMcpPickedState,
} from '../../src/side_panel/skill-selector.js';
import { sendPromptByCode, insertPromptToInputByCode } from '../../src/side_panel/prompt-manager.js';
import { getOpenTabs, selectPage } from '../../src/side_panel/page-selector.js';
import state from '../../src/side_panel/state.js';

let dom;
let closeSpy;

const SKILLS = [
  { name: '技能A', description: 'A描述', enabled: true },
  { name: '技能B', description: 'B描述', enabled: false },
];
const SERVICES = [
  { serverId: 'srv-x', serverName: '服务X', toolCount: 2, effectiveOpen: true },
  { serverId: 'srv-y', serverName: '服务Y', toolCount: 1, effectiveOpen: false },
];
const TABS = [
  { id: 1, title: '页面一', url: 'https://a.com', active: true, favIconUrl: '' },
  { id: 2, title: '页面二', url: 'https://b.com', active: false, favIconUrl: '' },
];

function setupDom() {
  document.body.innerHTML = `
    <textarea id="userInput"></textarea>
    <div class="input-add-panel" id="inputAddPanel" style="display:none;">
      <input id="inputAddPanelSearch" type="text">
      <div id="inputAddPanelList"></div>
    </div>`;
  closeSpy = vi.fn();
  initInputAddPanel({ onRequestClose: closeSpy });
  return {
    panel: document.getElementById('inputAddPanel'),
    search: document.getElementById('inputAddPanelSearch'),
    list: document.getElementById('inputAddPanelList'),
    userInput: document.getElementById('userInput'),
  };
}

const fireSearch = (value) => {
  dom.search.value = value;
  dom.search.dispatchEvent(new Event('input'));
};
const clickItem = (el, ctrl = false) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: ctrl }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getVisibleSkills).mockResolvedValue(SKILLS);
  vi.mocked(getMcpServices).mockResolvedValue(SERVICES);
  vi.mocked(getOpenTabs).mockResolvedValue(TABS);
  state.customPrompts = [
    { code: 'p1', content: '发送内容一' },
    { code: 'p2', content: '发送内容二' },
  ];
  state.selectedPage = null;
  dom = setupDom();
});

describe('渲染', () => {
  it('prompts：渲染全部提示词项（data-code + code/content）', async () => {
    await openCategoryPanel('prompts');
    const items = dom.list.querySelectorAll('.input-add-panel-item');
    expect(items).toHaveLength(2);
    expect(items[0].dataset.code).toBe('p1');
    expect(items[0].textContent).toContain('/p1');
    expect(items[0].textContent).toContain('发送内容一');
    expect(dom.panel.style.display).not.toBe('none');
  });

  it('skills：渲染技能项，禁用项带灰显 class，已选标记被刷新', async () => {
    await openCategoryPanel('skills');
    const items = dom.list.querySelectorAll('.skill-list-item.input-add-panel-item');
    expect(items).toHaveLength(2);
    expect(items[0].dataset.skillName).toBe('技能A');
    expect(items[1].classList.contains('skill-list-item-disabled')).toBe(true);
    expect(refreshSkillPickedState).toHaveBeenCalled();
  });

  it('mcp：未开放服务带「未开放」徽标', async () => {
    await openCategoryPanel('mcp');
    const items = dom.list.querySelectorAll('.mcp-list-item.input-add-panel-item');
    expect(items).toHaveLength(2);
    expect(items[1].classList.contains('mcp-list-item-inactive')).toBe(true);
    expect(items[1].textContent).toContain('未开放');
  });

  it('pages：当前已选网页带 ✓ 标记', async () => {
    state.selectedPage = { id: 2, title: '页面二', url: 'https://b.com' };
    await openCategoryPanel('pages');
    const items = dom.list.querySelectorAll('.prompt-item.input-add-panel-item');
    expect(items).toHaveLength(2);
    expect(items[0].dataset.tabId).toBe('1');
    expect(items[1].querySelector('.page-selected-mark')).toBeTruthy();
  });
});

describe('搜索过滤', () => {
  it('输入关键字过滤；清空恢复全量', async () => {
    await openCategoryPanel('prompts');
    fireSearch('内容二');
    expect(dom.list.querySelectorAll('.input-add-panel-item')).toHaveLength(1);
    fireSearch('');
    expect(dom.list.querySelectorAll('.input-add-panel-item')).toHaveLength(2);
  });

  it('无命中时显示空态（prompt-empty）', async () => {
    await openCategoryPanel('prompts');
    fireSearch('不存在');
    expect(dom.list.querySelectorAll('.input-add-panel-item')).toHaveLength(0);
    expect(dom.list.querySelector('.prompt-empty')).toBeTruthy();
  });

  it('切换类别时清空搜索框', async () => {
    await openCategoryPanel('prompts');
    fireSearch('内容一');
    await openCategoryPanel('skills');
    expect(dom.search.value).toBe('');
  });
});

describe('空态 / 失败 / 竞态', () => {
  it('数据为空显示空态', async () => {
    state.customPrompts = [];
    await openCategoryPanel('prompts');
    expect(dom.list.querySelector('.prompt-empty')).toBeTruthy();
  });

  it('数据源 reject 不抛出，显示空态', async () => {
    vi.mocked(getVisibleSkills).mockRejectedValue(new Error('boom'));
    await expect(openCategoryPanel('skills')).resolves.toBeUndefined();
    expect(dom.list.querySelector('.prompt-empty')).toBeTruthy();
  });

  it('快速切换类别：先发的慢响应被丢弃，只渲染最后一次', async () => {
    let resolveSkills;
    vi.mocked(getVisibleSkills).mockReturnValue(new Promise((r) => { resolveSkills = r; }));
    const p1 = openCategoryPanel('skills');
    const p2 = openCategoryPanel('mcp');
    resolveSkills(SKILLS);
    await Promise.all([p1, p2]);
    expect(dom.list.querySelectorAll('.mcp-list-item')).toHaveLength(2);
    expect(dom.list.querySelector('.skill-list-item')).toBeNull();
  });

  it('同类别重复打开不重复请求', async () => {
    await openCategoryPanel('skills');
    await openCategoryPanel('skills');
    expect(getVisibleSkills).toHaveBeenCalledTimes(1);
  });
});

describe('选择接线', () => {
  it('点击提示词 → sendPromptByCode + 收起菜单', async () => {
    await openCategoryPanel('prompts');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[0]);
    expect(sendPromptByCode).toHaveBeenCalledWith('p1');
    expect(closeSpy).toHaveBeenCalled();
  });

  it('Ctrl+点击提示词 → insertPromptToInputByCode(skipTriggerStrip) + 收起菜单', async () => {
    await openCategoryPanel('prompts');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[1], true);
    expect(insertPromptToInputByCode).toHaveBeenCalledWith('p2', { skipTriggerStrip: true });
    expect(closeSpy).toHaveBeenCalled();
  });

  it('点击技能（普通）→ selectSkill(clearTrigger:false)，面板不收起', async () => {
    await openCategoryPanel('skills');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[0]);
    expect(selectSkill).toHaveBeenCalledWith('技能A', SKILLS, { clearTrigger: false });
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('Ctrl+点击技能 → 选中后收起菜单', async () => {
    await openCategoryPanel('skills');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[0], true);
    expect(selectSkill).toHaveBeenCalledWith('技能A', SKILLS, { clearTrigger: false });
    expect(closeSpy).toHaveBeenCalled();
  });

  it('点击 MCP → selectMcpService(clearTrigger:false)，普通点击不收起', async () => {
    await openCategoryPanel('mcp');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[1]);
    expect(selectMcpService).toHaveBeenCalledWith('srv-y', '服务Y', SERVICES, { clearTrigger: false });
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('点击网页 → selectPage(tab 对象) + 回焦输入框 + 收起菜单', async () => {
    await openCategoryPanel('pages');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[1]);
    expect(selectPage).toHaveBeenCalledWith(TABS[1]);
    expect(document.activeElement).toBe(dom.userInput);
    expect(closeSpy).toHaveBeenCalled();
  });
});

describe('状态查询与关闭重置', () => {
  it('isCategoryPanelOpen/getPanelCategory 反映当前类别', async () => {
    expect(isCategoryPanelOpen()).toBe(false);
    await openCategoryPanel('skills');
    expect(isCategoryPanelOpen()).toBe(true);
    expect(getPanelCategory()).toBe('skills');
  });

  it('closeCategoryPanel：隐藏面板、清空搜索与列表、状态重置、作废在途请求', async () => {
    await openCategoryPanel('skills');
    fireSearch('技能A');
    let resolveMcp;
    vi.mocked(getMcpServices).mockReturnValue(new Promise((r) => { resolveMcp = r; }));
    const pending = openCategoryPanel('mcp');
    closeCategoryPanel();
    resolveMcp(SERVICES);
    await pending;
    expect(dom.panel.style.display).toBe('none');
    expect(dom.search.value).toBe('');
    expect(dom.list.innerHTML).toBe('');
    expect(isCategoryPanelOpen()).toBe(false);
  });

  it('isPanelSearchFocused 仅搜索框聚焦时为 true', () => {
    expect(isPanelSearchFocused()).toBe(false);
    dom.search.focus();
    expect(isPanelSearchFocused()).toBe(true);
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run test/unit/input-add-menu-panel.unit.test.js`
Expected: 全部 PASS（若个别断言因 i18n 文案（未开放徽标）或 DOM 细节失败，按实现微调断言，不改行为）

注：本任务实现与测试同批交付（模块为全新文件，先写模块再写测试一次跑绿；如需 TDD 节奏，可先写「渲染」describe 中的 4 个用例跑红再补实现，其余 describe 同理）。

- [ ] **Step 4: eslint + 提交**

Run: `npx eslint src/side_panel/input-add-menu-panel.js test/unit/input-add-menu-panel.unit.test.js`

```bash
git add src/side_panel/input-add-menu-panel.js test/unit/input-add-menu-panel.unit.test.js
git commit -m "feat: 加号菜单二级面板模块（渲染/搜索/选择接线）"
```

---

### Task 4: hover 状态机（`input-add-menu.js`）

**Files:**
- Modify: `src/side_panel/input-add-menu.js`
- Test: `test/unit/input-add-menu.unit.test.js`（新增 mock + 用例）

**Interfaces:**
- Consumes: Task 3 的 `initInputAddPanel({ onRequestClose })` / `openCategoryPanel(category)` / `closeCategoryPanel()` / `isCategoryPanelOpen()` / `getPanelCategory()` / `isPanelSearchFocused()`
- Produces: 用户可见的悬停展开行为；`has-panel` class 切换；`.panel-active` 高亮

- [ ] **Step 1: 测试文件加 mock 与 fixture 准备**

在 `test/unit/input-add-menu.unit.test.js` 顶部 mock 区追加：

```js
import {
  initInputAddPanel, openCategoryPanel, closeCategoryPanel,
  isCategoryPanelOpen, getPanelCategory, isPanelSearchFocused,
} from '../../src/side_panel/input-add-menu-panel.js';

vi.mock('../../src/side_panel/input-add-menu-panel.js', () => ({
  initInputAddPanel: vi.fn(),
  openCategoryPanel: vi.fn(async () => {}),
  closeCategoryPanel: vi.fn(),
  isCategoryPanelOpen: vi.fn(() => false),
  getPanelCategory: vi.fn(() => null),
  isPanelSearchFocused: vi.fn(() => false),
}));
```

在 `beforeEach` 末尾追加 mock 重置与状态变量：

```js
    vi.mocked(initInputAddPanel).mockClear();
    vi.mocked(openCategoryPanel).mockClear().mockResolvedValue(undefined);
    vi.mocked(closeCategoryPanel).mockClear();
    panelState.open = false;
    panelState.category = null;
    vi.mocked(isCategoryPanelOpen).mockImplementation(() => panelState.open);
    vi.mocked(getPanelCategory).mockImplementation(() => panelState.category);
    vi.mocked(isPanelSearchFocused).mockReturnValue(false);
```

文件顶部（describe 外）加：

```js
const panelState = { open: false, category: null };
const fire = (el, type) => el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
```

（fixture 已在 Task 1 Step 3 同步；现有 12 用例应仍全绿——`initInputAddMenu` 现会调用 `initInputAddPanel`，mock 后为 noop。）

- [ ] **Step 2: 追加状态机用例（fake timers）**

在文件末尾新增 describe：

```js
describe('hover 二级面板状态机', () => {
  it('hover 面板项 200ms 后展开对应类别（防误触延迟）', async () => {
    vi.useFakeTimers();
    try {
      dom.btn.click();
      fire(document.getElementById('addMenuSkillBtn'), 'mouseover');
      await vi.advanceTimersByTimeAsync(199);
      expect(openCategoryPanel).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(openCategoryPanel).toHaveBeenCalledWith('skills');
    } finally { vi.useRealTimers(); }
  });

  it('hover 非面板项 150ms 后收起面板', async () => {
    vi.useFakeTimers();
    try {
      dom.btn.click();
      fire(document.getElementById('addMenuKnowledgeBtn'), 'mouseover');
      await vi.advanceTimersByTimeAsync(149);
      expect(closeCategoryPanel).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(closeCategoryPanel).toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('鼠标移出菜单容器 150ms 后收起；移回取消', async () => {
    vi.useFakeTimers();
    try {
      dom.btn.click();
      fire(dom.menu, 'mouseenter');
      fire(dom.menu, 'mouseleave');
      await vi.advanceTimersByTimeAsync(100);
      fire(dom.menu, 'mouseenter'); // 移回
      await vi.advanceTimersByTimeAsync(200);
      expect(closeCategoryPanel).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('搜索框聚焦时 hideTimer 到期不收起', async () => {
    vi.useFakeTimers();
    try {
      dom.btn.click();
      vi.mocked(isPanelSearchFocused).mockReturnValue(true);
      fire(dom.menu, 'mouseleave');
      await vi.advanceTimersByTimeAsync(150);
      expect(closeCategoryPanel).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('点击一级项：pending 展开定时器被清理，菜单关闭后面板不弹出', async () => {
    vi.useFakeTimers();
    try {
      dom.btn.click();
      fire(dom.item, 'mouseover'); // dom.item = promptTriggerBtn，pending show
      dom.item.click(); // 点击 → 打开弹窗 + 菜单关（setOpen(false) 清理 timer）
      await vi.advanceTimersByTimeAsync(250);
      expect(openCategoryPanel).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('面板已开且同类别：重复 hover 不重复展开', async () => {
    vi.useFakeTimers();
    try {
      panelState.open = true;
      panelState.category = 'skills';
      dom.btn.click();
      fire(document.getElementById('addMenuSkillBtn'), 'mouseover');
      await vi.advanceTimersByTimeAsync(250);
      expect(openCategoryPanel).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('打开菜单时重置面板并同步 has-panel 类', () => {
    dom.btn.click();
    expect(closeCategoryPanel).toHaveBeenCalled();
    expect(dom.menu.classList.contains('has-panel')).toBe(false);
  });
});
```

- [ ] **Step 3: 运行确认新用例失败**

Run: `npx vitest run test/unit/input-add-menu.unit.test.js`
Expected: 新增 7 用例 FAIL（状态机未实现），原有 12 用例 PASS

- [ ] **Step 4: 实现 `input-add-menu.js`**

导入区追加：

```js
import {
  initInputAddPanel, openCategoryPanel, closeCategoryPanel,
  isCategoryPanelOpen, getPanelCategory, isPanelSearchFocused,
} from './input-add-menu-panel.js';
```

模块顶部（`initInputAddMenu` 外）追加常量：

```js
// 二级面板悬停时序：展开防误触 200ms；收起防抖动 150ms
const SHOW_DELAY = 200;
const HIDE_DELAY = 150;
const PANEL_ITEMS = {
  promptTriggerBtn: 'prompts',
  addMenuSkillBtn: 'skills',
  addMenuMcpBtn: 'mcp',
  addMenuPageBtn: 'pages',
};
```

`initInputAddMenu` 内，`const wrapper = ...` 之后追加状态变量：

```js
  const nav = menu.querySelector('.input-add-nav');
  let showTimer = null;
  let hideTimer = null;
  let isPointerInMenu = false;
```

`setOpen` 改为（在原有基础上增加面板重置与类同步）：

```js
  const syncPanelActive = () => {
    const active = isCategoryPanelOpen() ? getPanelCategory() : null;
    menu.classList.toggle('has-panel', !!active);
    menu.querySelectorAll('.input-add-item').forEach((el) => {
      el.classList.toggle('panel-active', !!active && PANEL_ITEMS[el.id] === active);
    });
  };

  const setOpen = (open) => {
    menu.style.display = open ? '' : 'none';
    if (open) {
      closeCategoryPanel(); // 每次打开从单栏开始
      syncPanelActive();
      refreshSelectorVisibility();
    } else {
      if (showTimer) { clearTimeout(showTimer); showTimer = null; }
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      closeCategoryPanel();
      syncPanelActive();
    }
  };

  // 面板初始化（须在 setOpen 定义之后：onRequestClose 闭包引用它）
  initInputAddPanel({ onRequestClose: () => setOpen(false) });
```

`document` 外部关闭监听之后追加状态机逻辑：

```js
  // 面板悬停状态机：防抖展开/收起（委托挂 .input-add-nav——面板内移动的 mouseover
  // 不经过 nav，天然不会触发收起）
  const scheduleHide = () => {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (isPanelSearchFocused()) return; // 搜索中不收起（blur 时补判）
      closeCategoryPanel();
      syncPanelActive();
    }, HIDE_DELAY);
  };

  if (nav) {
    nav.addEventListener('mouseover', (e) => {
      if (!isOpen()) return;
      const item = e.target.closest('.input-add-item');
      const category = item ? PANEL_ITEMS[item.id] : null;
      if (!category) { scheduleHide(); return; } // 非面板项 / 左列空白 → 延迟收起
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      // 已展开同类别：no-op
      if (isCategoryPanelOpen() && getPanelCategory() === category) return;
      if (showTimer) clearTimeout(showTimer);
      showTimer = setTimeout(async () => {
        showTimer = null;
        try {
          await openCategoryPanel(category);
        } catch {
          // 面板内部已兜底（失败显示空态），此处仅防意外未处理拒绝
        }
        syncPanelActive();
      }, SHOW_DELAY);
    });
  }

  menu.addEventListener('mouseenter', () => {
    isPointerInMenu = true;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  });
  menu.addEventListener('mouseleave', () => {
    isPointerInMenu = false;
    scheduleHide();
  });

  // 搜索框失焦补判：鼠标不在菜单内且已失焦 → 防抖收起
  const panelSearch = document.getElementById('inputAddPanelSearch');
  if (panelSearch) {
    panelSearch.addEventListener('blur', () => {
      if (!isPointerInMenu) scheduleHide();
    });
  }
```

- [ ] **Step 5: 运行全部用例**

Run: `npx vitest run test/unit/input-add-menu.unit.test.js test/unit/input-add-menu-panel.unit.test.js`
Expected: 全部 PASS（19 + 7 用例）

- [ ] **Step 6: eslint + 构建 + 提交**

Run: `npx eslint src/side_panel/input-add-menu.js && npm run build:silent`

```bash
git add src/side_panel/input-add-menu.js test/unit/input-add-menu.unit.test.js
git commit -m "feat: 加号菜单悬停展开二级面板状态机"
```

---

### Task 5: 探针与全量验证

**Files:**
- Create: `test-results-probes/_input-add-menu-panel.mjs`

**Interfaces:**
- Consumes: Task 1-4 全部产物（构建后的 dist）
- Produces: 探针断言报告 + 截图（人工确认）

- [ ] **Step 1: 构建**

Run: `npm run build:silent`
Expected: 构建成功（探针在 dist 产物上运行）

- [ ] **Step 2: 新建探针 `test-results-probes/_input-add-menu-panel.mjs`**

以 `_input-bar-tiers.mjs` 为模板复制 http server + `openPanel(seed)` 骨架（chrome.stub），并做以下增强：

1. **seed（场景唯一的页面）**：

```js
const { page, errors } = await openPanel({
  pairedAgents: [{ id: 'pa_probe1', name: 'Probe Agent', url: `http://127.0.0.1:${port}`, token: 't' }],
  activeAgentId: 'pa_probe1',
  skillsEnabled: true,
  mcpEnabled: true,
  mcpTools: [
    { serverId: 'srv-x', serverName: '服务X' },
    { serverId: 'srv-x', serverName: '服务X' },
    { serverId: 'srv-y', serverName: '服务Y' },
  ],
});
```

2. **http server 新增 mock 端点**：`/api/status/detail` 返回 `{ success: true, platformName: 'Probe', workdir: '/probe/ws' }`（已连接 + 工作目录）。
3. **addInitScript 内 chrome mock 增强**：
   - `runtime.sendMessage`：`GET_SKILL_LIST` 回调`{ success: true, skills: [{ name: '技能甲', description: '描述甲', enabled: true }, { name: '技能乙', description: '描述乙', enabled: true }] }`；其余维持 `{ success: false }`。
   - `tabs.query`：返回 `[{ id: 101, title: '探针页面一', url: 'https://one.example', active: true, favIconUrl: '' }, { id: 102, title: '探针页面二', url: 'https://two.example', active: false, favIconUrl: '' }]`（callback + Promise 双形态）。
4. **断言（check 函数沿用模板）**：

| # | 断言 | 方法 |
|---|---|---|
| 1 | 点击 "+" 后 hover 提示词项：hover 返回后立即断言面板不可见（200ms 防误触窗口内）；等待 250ms 后面板可见 + 搜索框存在 + 列表容器有内容（空态或项） | `page.hover('#promptTriggerBtn')` + 立即/延时两次 `evaluate` |
| 2 | hover 技能项：面板切换为技能列表（2 项、含“技能甲”） | `page.hover('#addMenuSkillBtn')` + 250ms |
| 3 | 搜索“甲” → 列表降为 1 项；清空恢复 2 项 | `page.fill('#inputAddPanelSearch', '甲')` |
| 4 | 点击技能项（普通）→ 指示器 chip 出现 + 面板项 picked + 菜单与面板保持展开 | `page.click('.skill-list-item[data-skill-name="技能甲"]')` |
| 5 | Ctrl+点击技能项 → 菜单收起 | `page.click(..., { modifiers: ['Control'] })` |
| 6 | hover 网页项 → 面板 2 项（探针页面一/二）；点击 → 网页指示器出现 + 菜单收起 | `page.hover('#addMenuPageBtn')` / 点击第 1 项 |
| 7 | 鼠标在面板内移动不收起：hover 面板中部 → 300ms → 面板仍可见；再移出菜单 → 250ms → 面板收起 | `page.mouse.move(...)` 坐标取 `getBoundingClientRect` |
| 8 | 280px 视口：双栏展开后菜单右缘 ≤ 视口宽、面板宽 ≥ 120px；430px 同样断无溢出 | `setViewportSize` + `evaluate` 几何 |
| 9 | 回归：菜单外点击 → 面板与菜单均关闭；重点开菜单 → 面板恢复单栏（不可见） | 点击外部 + 重新打开 |
| 10 | 页面无 JS 错误 | `errors.length === 0` |

5. **截图**：hover 提示词双栏展开（`_input-add-panel-prompts.png`）、技能面板含 picked（`_input-add-panel-skills.png`）、搜索过滤中（`_input-add-panel-search.png`）、280px 窄屏双栏（`_input-add-panel-280.png`）。

注：断言 1 中提示词列表为空时面板显示空态（seed 无 customPrompts）——将断言改为“面板可见 + 搜索框可见 + 列表容器存在（空态或项）”；技能/网页为主验证渠道。

- [ ] **Step 3: 运行探针**

Run: `node test-results-probes/_input-add-menu-panel.mjs`
Expected: 全部 PASS；若有 FAIL，按断言输出定位修复（优先查 CSS 几何与 mock 数据差异），修后重跑

- [ ] **Step 4: 截图人工确认**

查看 4 张截图：双栏展开布局正常、无遮挡、窄屏无溢出、搜索过滤后列表正确。

- [ ] **Step 5: 全量回归**

Run: `npx vitest run` && `npx eslint src/side_panel/ test/unit/` && `npm run build:silent`
Expected: 全量单测通过（允许 2 个预先存在的 apply-rag unhandled errors）、eslint 0、构建成功

- [ ] **Step 6: 提交（探针 gitignore，需 -f）**

```bash
git add -f test-results-probes/_input-add-menu-panel.mjs
git add -A
# 手动确认 git status 无意外文件（如 test-results-probes 下临时截图不入库）
git commit -m "test: 加号菜单二级面板探针（双栏/搜索/选择/窄屏几何）"
```

---

## 自审记录

（写完计划后的自审）

1. **Spec 覆盖**：
   - 3.1 DOM → Task 1；3.2 接口 → Task 3/4；3.3 双通道 → Task 4（点击路径未动 + 状态机）；4.1 状态机 → Task 4；4.2 重置 → Task 4 setOpen；4.3 宽度 → Task 1 CSS + Task 5 探针几何；4.4 过渡 → Task 1 CSS；5.1-5.6 → Task 3；6 签名修正 → Task 2；7 边界 → Task 3/4 实现 + Task 5 回归断言；8 i18n → Task 3；9 测试 → Task 2/3/4 单测 + Task 5 探针 ✓ 全覆盖
   - 遗漏检查：spec 7 中“capture 层不误触发”断言 —— 面板项不带 `.input-add-item` class（Task 3 renderItem 已保证）✓
2. **占位符扫描**：无 TBD/TODO；所有 Step 含可执行代码或准确断言；“如实现微调断言”仅限定断言细节（行为不变），不属于行为占位符
3. **类型一致性**：
   - `openCategoryPanel(category)` 类别值 `'prompts'|'skills'|'mcp'|'pages'` 在 Task 3/4 一致；`PANEL_ITEMS` 映射与此一致 ✓
   - `selectSkill(name, skills, { clearTrigger })` Task 2 定义 → Task 3 调用一致 ✓；`insertPromptToInputByCode(code, { skipTriggerStrip })` 一致 ✓
   - 面板模块导出六函数：Task 3 定义 → Task 4 导入一致（`initInputAddPanel/openCategoryPanel/closeCategoryPanel/isCategoryPanelOpen/getPanelCategory/isPanelSearchFocused`）✓
   - DOM id（`inputAddPanel/inputAddPanelSearch/inputAddPanelList`）Task 1 HTML → Task 3/4 JS 一致 ✓
