# 侧边栏输入区一体化容器改造 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把侧边栏输入区从"上方工具栏 + 独立输入框 + 下方信息带"三层结构改造成一体化容器：textarea 与功能入口行收进一个大圆角框，提示词/截图/附件收进底行最左 "+" 菜单，信息带保持现状。

**Architecture:** 纯前端 DOM/CSS 重构 + 测量式降级链重写。所有元素 id 不变（既有事件绑定零改动）；新增 `input-add-menu.js`（"+" 菜单交互与蓝点）；`toolbar-adapt.js` 测量目标从 `.input-toolbar` 改为 `.input-bottom-row`，降级链从 2 级扩为 4 级（新增图标化与收进菜单）。

**Tech Stack:** 原生 ESM JS + CSS；Chrome 扩展（Vite + @crxjs 构建）；测试：Vitest（jsdom 单测）+ Playwright 探针脚本（`test-results-probes/` 惯例，node 直跑）。

**Spec:** `docs/superpowers/specs/2026-10-09-input-area-unified-container-design.md`

## Global Constraints

- **所有现有元素 id 保持不变**（`userInput` / `promptTriggerBtn` / `screenshotBtn` / `fileAttachBtn` / `sendBtn` / `fileInput` / `memoryGroup` / `memoryLimitLabel` / `toolsConfigBtn` / `agentSelectorWrapper` / `tempDisplay`…）——事件绑定零改动的前提，禁止重命名。
- **信息带三元素不动**：`#contextUsageIndicator` / `.input-disclaimer` / `#currentModelTag` 的 DOM、定位、样式、420px 媒体查询原样保留，不参与降级、不进菜单。
- **组合键与状态逻辑不改**：提示词 Ctrl/Cmd+单击=网页选择器（index.js 2529-2543）；截图 Ctrl/Shift/Cmd+单击=区域截图（index.js 3363）；发送按钮生成中自动变停止（stop-mode）。
- **降级链 4 级**（测量式、无硬编码断点，顺序固定）：① `.temp-collapsed`（温度数字隐藏）→ ② `.agent-collapsed`（助手名折叠 emoji）→ ③ `.switches-icon`（记忆/工具/划词图标化）→ ④ `.selection-in-menu`（划词组 DOM 移入 "+" 菜单）。
- **浮层统一向上弹出**：`bottom: calc(100% + 8px)`（助手/温度/记忆条数/新 "+" 菜单）。
- **复用既有类名**：`.toolbar-chip-group` / `.tool-toggle-wrapper`（胶囊外观）、`.temp-collapsed` / `.agent-collapsed`（前两级降级）、`.input-inner-btn` / `.send-inner-btn`（发送按钮）。
- **每完成一次代码修改执行** `npm run build:silent` 构建。
- 提交信息中文、仓库风格：`feat(sidepanel): …` / `test(sidepanel): …`。
- 视觉参考（最终确认 mockup）：`.superpowers/brainstorm/98684-1791514861/content/final-v2-infobar.html`

---

## Task 1: side_panel.html DOM 重构 + i18n 文案

**Files:**
- Modify: `side_panel.html`（输入区，现约 450-645 行）
- Modify: `src/shared/locales/zh.js`（`input` 组，现约 486-502 行）
- Modify: `src/shared/locales/en.js`（`input` 组，现约 486-502 行）

**Interfaces:**
- Consumes: 无（首个任务）。
- Produces: 新 DOM——`.input-bottom-row`（`> .input-bottom-left` / `.input-bottom-right`）、`#inputAddBtn`、`#inputAddMenu`、`#inputAddMenuSwitches`；划词组新 `id="selectionToggleGroup"`（toolbar-adapt.js 移动锚点）；开关 label 内新 `.toggle-icon` span；i18n key：`input.addMenuTitle / addMenuPrompt / addMenuScreenshot / addMenuFile / addMenuPromptHint / addMenuScreenshotHint / addMenuSwitches`。

- [ ] **Step 1: zh.js 追加新 key**

在 `src/shared/locales/zh.js` 的 `input: {` 组内、`aiDisclaimer: '内容由 AI 生成，仅供参考',` 行之后追加：

```js
    addMenuTitle: '添加内容',
    addMenuPrompt: '提示词',
    addMenuScreenshot: '截图',
    addMenuFile: '附件',
    addMenuPromptHint: 'Ctrl+单击 → 网页',
    addMenuScreenshotHint: 'Ctrl+单击 → 区域截图',
    addMenuSwitches: '开关',
```

- [ ] **Step 2: en.js 同步追加**

在 `src/shared/locales/en.js` 的 `input: {` 组内、`aiDisclaimer: 'AI-generated content, for reference only.',` 行之后追加：

```js
    addMenuTitle: 'Add content',
    addMenuPrompt: 'Prompts',
    addMenuScreenshot: 'Screenshot',
    addMenuFile: 'Attachment',
    addMenuPromptHint: 'Ctrl+click → Pages',
    addMenuScreenshotHint: 'Ctrl+click → Area capture',
    addMenuSwitches: 'Toggles',
```

- [ ] **Step 3: 删除 `.input-toolbar` 整块**

在 `side_panel.html` 中删除整个 `<div class="input-toolbar">…</div>` 块（从 `<div class="input-toolbar">` 开始，到它的闭合 `</div>`，即 `<div class="selection-indicator" …>` 之前那一行；块内依次为 `.input-toolbar-left`（记忆组 / 工具组 / 划词组）、`.input-toolbar-right`（`#agentSelectorWrapper` / `.temp-selector` 含 `#tempDropdown` 模型设置浮层全部内容））。

注意：不要真的丢弃——其中五组元素的 HTML 原样用于下面 Step 4 的底行（唯一的增量差异见 Step 4 表格）。

- [ ] **Step 4: 精简 `.input-wrapper` 并插入新底行**

先把 `.input-wrapper` 内 `<button class="input-inner-btn prompt-inner-btn" id="promptTriggerBtn" …>…</button>` 整块与 `<div class="input-right-buttons">…</div>` 整块（含 `#screenshotBtn` / `#fileAttachBtn` / `#sendBtn`）从原位置删除，`.input-wrapper` 只留：

```html
    <div class="input-wrapper">
      <input type="file" id="fileInput" multiple accept="（原 accept 属性值逐字保留）" style="display:none;">
      <textarea id="userInput" data-i18n-placeholder="input.placeholder" placeholder="（原 placeholder 逐字保留）" rows="1"></textarea>
    </div>
```

然后紧随 `.input-wrapper` 闭合标签之后插入：

```html
    <div class="input-bottom-row">
      <div class="input-bottom-left">
        <div class="input-add-wrapper">
          <button class="input-add-btn" id="inputAddBtn" type="button" data-i18n-title="input.addMenuTitle" title="添加内容">+</button>
          <div class="input-add-menu" id="inputAddMenu" style="display:none;">
            <button class="input-add-item" id="promptTriggerBtn" type="button" data-i18n-title="input.atHint" title="提示词 (单击) / 网页 (Ctrl/Cmd+单击)">
              <svg viewBox="0 0 1024 1024" width="16" height="16" fill="currentColor"><path d="M274.090667 107.861333l43.235555 116.792889 116.792889 43.235556-116.792889 43.235555-43.235555 116.736-43.235556-116.792889-116.736-43.235555 116.736-43.235556 43.235556-116.736zM717.937778 532.138667l51.825778 140.117333 140.117333 51.882667-140.117333 51.882666-51.882667 140.117334-51.825778-140.117334-140.174222-51.882666 140.174222-51.882667 51.825778-140.117333zM699.278222 190.350222a36.977778 36.977778 0 1 0-64.056889-36.977778L219.192889 873.927111a36.977778 36.977778 0 1 0 64.056889 36.977778l416.028444-720.554667z"/></svg>
              <span class="add-item-label" data-i18n="input.addMenuPrompt">提示词</span>
              <span class="add-item-hint" data-i18n="input.addMenuPromptHint">Ctrl+单击 → 网页</span>
            </button>
            <button class="input-add-item" id="screenshotBtn" type="button" style="display:none;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span class="add-item-label" data-i18n="input.addMenuScreenshot">截图</span>
              <span class="add-item-hint" data-i18n="input.addMenuScreenshotHint">Ctrl+单击 → 区域截图</span>
            </button>
            <button class="input-add-item" id="fileAttachBtn" type="button" style="display:none;" data-i18n-title="input.uploadFile" title="上传文件（PDF/Word/Excel/文本）">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              <span class="add-item-label" data-i18n="input.addMenuFile">附件</span>
            </button>
            <div class="input-add-menu-switches" id="inputAddMenuSwitches">
              <div class="input-add-menu-switches-title" data-i18n="input.addMenuSwitches">开关</div>
            </div>
          </div>
        </div>
        <!-- 以下三块从原 .input-toolbar-left 原样迁移，仅按下方表格差异修改 -->
        <!-- 记忆组 -->
        <div class="toolbar-chip-group" id="memoryGroup">
          <label class="check-toggle core-feature" for="isolateChatBtn" data-i18n-title="toggle.memoryHint" title="开启后，前文问答将作为上下文（默认全部，条数可配置）">
            <input type="checkbox" id="isolateChatBtn">
            <span class="checkmark"></span>
            <span class="tool-toggle-label" data-i18n="memory.label">记忆</span>
            <span class="toggle-icon" aria-hidden="true">🧠</span>
          </label>
          <label class="memory-limit-label" id="memoryLimitLabel" for="isolateChatBtn"></label>
          <div class="memory-limit-dropdown" id="memoryLimitDropdown">
            （原样保留，内容不动）
          </div>
        </div>
        <!-- 工具组 -->
        <div class="tool-toggle-wrapper">
          <label class="check-toggle core-feature" data-i18n-title="toggle.toolsHint" title="工具总开关：点击开启或关闭工具调用">
            <input type="checkbox" id="enableToolsBtn">
            <span class="checkmark"></span>
            <span class="tool-toggle-label" data-i18n="toggle.tools">工具</span>
            <span class="toggle-icon" aria-hidden="true">🔧</span>
          </label>
          <button class="tool-config-btn" id="toolsConfigBtn" title="点击打开工具详细配置">
            <span class="tools-config-count" id="toolsConfigCount">0</span>
            <span class="tools-config-flags" id="toolsConfigFlags" aria-hidden="true">
              <span class="tools-config-flag flag-preselect" id="toolsConfigFlagPreselect"></span>
              <span class="tools-config-flag flag-confirm" id="toolsConfigFlagConfirm"></span>
            </span>
          </button>
        </div>
        <!-- 划词组 -->
        <div class="toolbar-chip-group" id="selectionToggleGroup">
          <label class="check-toggle core-feature" data-i18n-title="toggle.selectionHint" title="开启后，划词选中内容时可快速提问">
            <input type="checkbox" id="enableSelectionQueryBtn">
            <span class="checkmark"></span>
            <span class="tool-toggle-label" data-i18n="toggle.selection">划词</span>
            <span class="toggle-icon" aria-hidden="true">✏️</span>
          </label>
        </div>
      </div>
      <div class="input-bottom-right">
        <!-- 以下三块从原 .input-toolbar-right / .input-right-buttons 原样迁移 -->
        <div class="agent-selector-wrapper" id="agentSelectorWrapper">
          （原样保留：agentSelectorBtn / agentSelectorDropdown 全部内容）
        </div>
        <div class="temp-selector">
          （原样保留：tempDisplay / tempDropdown 模型设置浮层全部内容）
        </div>
        <button class="input-inner-btn send-inner-btn" id="sendBtn" data-i18n-title="input.send" title="发送">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z"/></svg>
        </button>
      </div>
    </div>
```

**迁移差异表（除下列差异外，每块 HTML 逐字保留原内容）**：

| 元素 | 目标位置 | 与原件的差异 |
|---|---|---|
| `#memoryGroup`（原 453-481） | 底行左组（"+" 之后） | label 内末尾加 `<span class="toggle-icon" aria-hidden="true">🧠</span>` |
| `.tool-toggle-wrapper`（原 482-497） | 底行左组 | label 内末尾加 `<span class="toggle-icon" aria-hidden="true">🔧</span>` |
| 划词组（原 498-504） | 底行左组末尾 | 外层加 `id="selectionToggleGroup"`；label 内末尾加 `<span class="toggle-icon" aria-hidden="true">✏️</span>` |
| `#agentSelectorWrapper`（原 507-516） | 底行右组首位 | 无 |
| `.temp-selector`（原 517-563，含 `#tempDropdown` 全部内容） | 底行右组 | 无（整块剪切） |
| `#sendBtn`（原 640-642） | 底行右组末位 | 无（保留 `.input-inner-btn.send-inner-btn` 类） |
| `#promptTriggerBtn`（原 629-631） | "+" 菜单第 1 项 | 类改为 `input-add-item`；svg 宽高 18→16；内层加 `.add-item-label` + `.add-item-hint` 两个 span |
| `#screenshotBtn`（原 634-636） | "+" 菜单第 2 项 | 类改为 `input-add-item`；svg 宽高 18→16；内层加 label + hint 两个 span |
| `#fileAttachBtn`（原 637-639） | "+" 菜单第 3 项 | 类改为 `input-add-item`；svg 宽高 18→16；内层加 label span |

不动：`.selection-indicator` 起至 `.file-preview-bar` 的动态指示条、`#promptSelector` / `#agentAtSelector` / `#fileAtSelector` 浮层、`#contextUsageIndicator` / `#currentModelTag` / `.input-disclaimer` 信息带、`#fileInput`。

- [ ] **Step 5: 构建 + DOM 断言**

Run:
```bash
npm run build:silent && node -e "
const fs=require('fs');
const html=fs.readFileSync('dist/side_panel.html','utf8');
const must=['inputAddBtn','inputAddMenu','inputAddMenuSwitches','input-bottom-row','selectionToggleGroup','inputAddBtn'];
const miss=must.filter(k=>!html.includes(k));
if(miss.length) throw new Error('缺少: '+miss.join(','));
if(html.includes('input-toolbar')) throw new Error('input-toolbar 残留');
if(html.includes('input-right-buttons')) throw new Error('input-right-buttons 残留');
console.log('DOM OK');
"
```
Expected: 输出 `DOM OK`（无异常抛出）。

- [ ] **Step 6: 提交**

```bash
git add side_panel.html src/shared/locales/zh.js src/shared/locales/en.js
git commit -m "feat(sidepanel): 输入区一体化容器 DOM 重构（底行 + 添加菜单 + 迁移功能入口）"
```

---

## Task 2: styles.css 一体化容器 + 底行 + 菜单 + 降级态样式

**Files:**
- Modify: `src/side_panel/styles.css`（多处，见步骤）
- Modify: `src/side_panel/image-helpers.js`（`updateTextareaPadding`，现 73-80 行）

**Interfaces:**
- Consumes: Task 1 的 DOM 类名（`.input-bottom-row` / `.input-bottom-left` / `.input-bottom-right` / `.input-add-wrapper` / `.input-add-btn` / `.input-add-menu` / `.input-add-item` / `.input-add-menu-switches` / `.toggle-icon`）。
- Produces: 降级钩子 `.switches-icon`（③级样式）、`.has-active-switch`（"+" 蓝点，Task 4 的 JS 切换该类）。

- [ ] **Step 1: `.input-container` 一体化容器（现 4689-4699）**

将现有规则替换为：

```css
.input-container {
  position: relative;
  padding: 12px 16px 22px 16px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 12px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  transition: border-color 0.25s, box-shadow 0.25s;
}
.input-container:focus-within {
  border-color: rgba(102, 126, 234, 0.4);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.08), 0 4px 16px rgba(0, 0, 0, 0.08);
}
```

（原 `border-top: 1px solid rgba(0, 0, 0, 0.06);` 行被完整边框替代。）

- [ ] **Step 2: textarea 去边框（现 4700-4717、4728-4731）**

`.input-container textarea` 规则内改 5 处并删 1 行：

- `padding: 12px 20px;` → `padding: 12px 4px;`
- `border: 1px solid rgba(0, 0, 0, 0.08);` → `border: none;`
- `border-radius: 24px;` → `border-radius: 0;`
- `background: rgba(255, 255, 255, 0.9);` → `background: transparent;`
- 删除 `box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);`

其余（`flex` / `font-size` / `line-height` / `resize` / `font-family` / `outline` / `max-height` / `min-height` / 滚动条隐藏 / `transition`）保留。删除整条 `.input-container textarea:focus { … }` 规则（焦点视觉已由容器 `:focus-within` 承担）。

- [ ] **Step 3: `.input-wrapper textarea` 去左右让位（现 4994-5000）**

替换为：

```css
.input-wrapper textarea {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
}
```

（删除 `padding-left: 44px;` 与 `padding-right: 44px;` 两行。）

- [ ] **Step 4: 删除旧工具栏死样式（现 1065-1081）**

删除 `.input-toolbar` / `.input-toolbar-left` / `.input-toolbar-right` 三条规则。

- [ ] **Step 5: 迁移左组开关文字样式（现 1876-1888）**

将三处选择器 `.input-toolbar-left .check-toggle…` 改为 `.input-bottom-left .check-toggle…`，规则内容不变：

```css
.input-bottom-left .check-toggle {
  user-select: none;
  gap: 0;
}
.input-bottom-left .check-toggle .checkmark {
  display: none;
}
.input-bottom-left .check-toggle input:checked ~ .tool-toggle-label {
  color: #667eea;
  font-weight: 500;
}
```

- [ ] **Step 6: 新增底行、菜单与记忆组定位样式**

追加（建议放在输入区样式区，`.memory-limit-dropdown` 规则附近）：

```css
/* === 输入区底行（一体化容器功能行） === */
.input-bottom-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.input-bottom-left,
.input-bottom-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.input-bottom-right {
  margin-left: auto;
}
.input-bottom-left > *,
.input-bottom-right > * {
  flex-shrink: 0;
}
.input-bottom-row .toolbar-chip-group,
.input-bottom-row .tool-toggle-wrapper {
  padding: 2px 7px;
}
/* 记忆组作为定位参照：条数下拉与图标态角标都相对它定位 */
.input-bottom-left #memoryGroup {
  position: relative;
}

/* "+" 按钮与添加菜单 */
.input-add-wrapper {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}
.input-add-btn {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid #dcdfe6;
  border-radius: 50%;
  background: transparent;
  color: #444;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.2s;
}
.input-add-btn:hover {
  border-color: rgba(102, 126, 234, 0.5);
  color: #667eea;
}
.input-add-btn.has-active-switch::after {
  content: '';
  position: absolute;
  top: -1px;
  right: -1px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #667eea;
  border: 1.5px solid #fff;
}
.input-add-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 210px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
  padding: 6px;
  z-index: 1000;
}
.input-add-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #333;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
}
.input-add-item:hover {
  background: rgba(102, 126, 234, 0.08);
}
.input-add-item svg {
  flex-shrink: 0;
}
.input-add-item .add-item-hint {
  margin-left: auto;
  font-size: 10px;
  color: #999;
  white-space: nowrap;
}
.input-add-menu-switches {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  margin-top: 4px;
  padding: 4px 4px 0;
  display: none;
}
.input-add-menu-switches:has(.check-toggle) {
  display: block;
}
.input-add-menu-switches .check-toggle {
  padding: 5px 6px;
  border-radius: 8px;
  width: 100%;
}
.input-add-menu-switches-title {
  font-size: 11px;
  color: #999;
  padding: 2px 6px 4px;
}
```

- [ ] **Step 7: ③ 级降级态样式（图标化 + 分体胶囊 + 记忆角标）**

在现有降级规则（现 1305-1309 一带）后追加：

```css
/* ③ switches-icon：记忆/工具/划词图标化 */
.toggle-icon { display: none; }
.input-container.switches-icon .input-bottom-left .check-toggle .tool-toggle-label { display: none; }
.input-container.switches-icon .input-bottom-left .check-toggle .toggle-icon { display: inline; font-size: 13px; line-height: 1; }
.input-container.switches-icon .tool-toggle-wrapper { padding: 0; border-radius: 8px; }
.input-container.switches-icon .tool-toggle-wrapper .check-toggle { padding: 3px 7px; }
.input-container.switches-icon .tool-toggle-wrapper .tool-config-btn {
  border-left: 1px solid rgba(102, 126, 234, 0.25);
  border-radius: 0;
  height: 26px;
  padding: 0 6px;
}
.input-container.switches-icon .memory-limit-label {
  position: absolute;
  top: -5px;
  right: -6px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  font-size: 9px;
  line-height: 14px;
  text-align: center;
  background: #667eea;
  color: #fff;
  border-radius: 7px;
  border: 1.5px solid #fff;
}
```

- [ ] **Step 8: 发送按钮底行尺寸**

追加：

```css
.input-bottom-row .send-inner-btn {
  width: 30px;
  height: 30px;
}
```

- [ ] **Step 9: 删除失效样式**

删除以下规则（连同各自的 `:hover` 等变体）：

- `.input-right-buttons`（现 5020-5027）
- `.prompt-inner-btn` 与 `.prompt-inner-btn:hover`（现 5040-5049）
- `.screenshot-inner-btn` 与 `.screenshot-inner-btn:hover`（现 5080 一带）
- `.file-attach-btn` 与 `.file-attach-btn:hover`（现 5310-5319 一带）

保留 `.input-inner-btn` 基础样式与 `.send-inner-btn` 全系列（`#sendBtn` 仍在使用）。

- [ ] **Step 10: image-helpers.js 去除 textarea 动态右侧 padding**

将 `updateTextareaPadding()`（现 73-80 行）函数体替换为：

```js
export function updateTextareaPadding() {
  const userInput = document.getElementById('userInput');
  if (!userInput) return;
  // 一体化容器改造：发送/截图/附件已移出输入框，无需再为内嵌按钮动态让位
  userInput.style.removeProperty('padding-right');
}
```

调用点（61、101 行）与 import 不动。

- [ ] **Step 11: 构建冒烟**

Run: `npm run build:silent`
Expected: 构建成功、无报错。此时 JS 降级逻辑（toolbar-adapt.js）尚未重写（仍指向已删除的 `.input-toolbar`，会安全 early-return）——降级功能在 Task 3 恢复，本步只验证构建与样式。

- [ ] **Step 12: 提交**

```bash
git add src/side_panel/styles.css src/side_panel/image-helpers.js
git commit -m "feat(sidepanel): 一体化容器与底行样式（含 ③ 级图标态与添加菜单样式）"
```

---

## Task 3: toolbar-adapt.js 重写（4 级降级链）+ 单测更新

**Files:**
- Modify: `test/unit/toolbar-adapt.unit.test.js`（整文件重写）
- Modify: `src/side_panel/toolbar-adapt.js`（整文件重写）

**Interfaces:**
- Consumes: `.input-bottom-row` / `.input-container` / `#selectionToggleGroup` / `#inputAddMenuSwitches`（Task 1）；降级类 `.temp-collapsed` / `.agent-collapsed` / `.switches-icon` / `.selection-in-menu`（Task 2 样式钩子）。
- Produces: `adaptInputToolbar()` / `initToolbarAdaptive()` / `isInsideOverlay()` / `finishReplayedAnimations()` 导出签名不变（index.js 4297 行的调用无需改动）。

- [ ] **Step 1: 重写单测（先写失败测试）**

将 `test/unit/toolbar-adapt.unit.test.js` 整文件替换为：

```js
// @vitest-environment jsdom
// toolbar-adapt.unit.test.js - 输入底行自适应：4 级降级链 + 浮层豁免测量 + 重播动画快进
//
// 背景：adaptInputToolbar 测量时会临时把打开的浮层 display:none 再恢复。
// display 切换会使浮层 CSS 入场动画从头重播，恢复后必须快进到终态（防闪帧）。
// MutationObserver 需忽略浮层内部变更，并忽略④级移动划词组自身的 mutation（防死循环）。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { adaptInputToolbar, initToolbarAdaptive, isInsideOverlay, finishReplayedAnimations } from '../../src/side_panel/toolbar-adapt.js';

function setupDom() {
  document.body.innerHTML = `
    <div class="input-container">
      <div class="input-wrapper"><textarea id="userInput"></textarea></div>
      <div class="input-bottom-row">
        <div class="input-bottom-left">
          <div class="input-add-wrapper">
            <button id="inputAddBtn">+</button>
            <div class="input-add-menu" id="inputAddMenu" style="display:none;">
              <div class="input-add-menu-switches" id="inputAddMenuSwitches"></div>
            </div>
          </div>
          <div class="toolbar-chip-group" id="memoryGroup"><span id="plainText">记忆</span></div>
          <div class="tool-toggle-wrapper"></div>
          <div class="toolbar-chip-group" id="selectionToggleGroup"><span>划词</span></div>
        </div>
        <div class="input-bottom-right">
          <div class="temp-selector">
            <div class="temp-dropdown" id="tempDropdown" style="position: absolute;">
              <div class="model-section" id="modelSection">
                <span id="modelText">deepseek-v4-pro</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  return {
    container: document.querySelector('.input-container'),
    bar: document.querySelector('.input-bottom-row'),
    left: document.querySelector('.input-bottom-left'),
    menuSwitches: document.getElementById('inputAddMenuSwitches'),
    selectionGroup: document.getElementById('selectionToggleGroup'),
    dropdown: document.getElementById('tempDropdown'),
  };
}

/** 让 adaptInputToolbar 认为底行溢出（scrollWidth > clientWidth），并记录每次测量时浮层的 display */
function makeBarOverflow(bar, dropdown, measuredDisplays) {
  Object.defineProperty(bar, 'scrollWidth', {
    configurable: true,
    get: () => {
      measuredDisplays.push(dropdown.style.display);
      return 200;
    },
  });
  Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => 100 });
  dropdown.getClientRects = () => [{ width: 120, height: 80 }];
}

describe('isInsideOverlay', () => {
  it('浮层内部节点判定为浮层内，普通底行部件与底行自身为浮层外', () => {
    const { bar } = setupDom();
    expect(isInsideOverlay(document.getElementById('modelText'), bar)).toBe(true);
    expect(isInsideOverlay(document.getElementById('plainText'), bar)).toBe(false);
    expect(isInsideOverlay(bar, bar)).toBe(false);
  });
});

describe('finishReplayedAnimations', () => {
  it('快进运行中动画、跳过 idle 动画、容忍无 getAnimations 的元素', () => {
    const finish = vi.fn();
    const finishIdle = vi.fn();
    finishReplayedAnimations([
      { getAnimations: () => [{ playState: 'running', finish }, { playState: 'idle', finish: finishIdle }] },
      {},
    ]);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(finishIdle).not.toHaveBeenCalled();
  });
});

describe('adaptInputToolbar', () => {
  let dom;

  beforeEach(() => {
    dom = setupDom();
  });

  it('④级兜底：测量期间浮层保持隐藏，四档降级类全部添加，划词组移入菜单，恢复后快进重播动画', () => {
    const { container, bar, menuSwitches, selectionGroup, dropdown } = dom;
    const measuredDisplays = [];
    makeBarOverflow(bar, dropdown, measuredDisplays);
    const finish = vi.fn();
    dropdown.getAnimations = () => [{ playState: 'running', finish }];

    adaptInputToolbar();

    // 每次测量时浮层都必须处于隐藏状态（overflow 判定不含浮层溢出）
    expect(measuredDisplays.length).toBeGreaterThan(0);
    expect(measuredDisplays.every((d) => d === 'none')).toBe(true);
    // 恢复显示且重播动画被快进到终态（防“闪一帧透明”）
    expect(dropdown.style.display).toBe('');
    expect(finish).toHaveBeenCalledTimes(1);
    // 四级降级按需触发（scrollWidth 恒溢出）
    expect(container.classList.contains('temp-collapsed')).toBe(true);
    expect(container.classList.contains('agent-collapsed')).toBe(true);
    expect(container.classList.contains('switches-icon')).toBe(true);
    expect(container.classList.contains('selection-in-menu')).toBe(true);
    // 划词组 DOM 移入菜单开关区（事件监听在元素自身，不丢失）
    expect(selectionGroup.parentElement).toBe(menuSwitches);
  });

  it('中途空间足够时停止降级（②级即止，不再加③④）', () => {
    const { container, bar } = dom;
    Object.defineProperty(bar, 'scrollWidth', {
      configurable: true,
      get: () => (container.classList.contains('agent-collapsed') ? 100 : 200),
    });
    Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => 100 });

    adaptInputToolbar();

    expect(container.classList.contains('temp-collapsed')).toBe(true);
    expect(container.classList.contains('agent-collapsed')).toBe(true);
    expect(container.classList.contains('switches-icon')).toBe(false);
    expect(container.classList.contains('selection-in-menu')).toBe(false);
  });

  it('空间充足时提前返回：无降级类、划词组留在左组、浮层恢复且动画快进', () => {
    const { container, bar, left, selectionGroup, dropdown } = dom;
    Object.defineProperty(bar, 'scrollWidth', { configurable: true, get: () => 100 });
    Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => 200 });
    dropdown.getClientRects = () => [{ width: 120, height: 80 }];
    const finish = vi.fn();
    dropdown.getAnimations = () => [{ playState: 'running', finish }];

    adaptInputToolbar();

    expect(dropdown.style.display).toBe('');
    expect(finish).toHaveBeenCalledTimes(1);
    expect(container.classList.contains('temp-collapsed')).toBe(false);
    expect(container.classList.contains('agent-collapsed')).toBe(false);
    expect(container.classList.contains('switches-icon')).toBe(false);
    expect(container.classList.contains('selection-in-menu')).toBe(false);
    expect(selectionGroup.parentElement).toBe(left);
  });

  it('空间恢复时全量还原：类清除、划词组从菜单移回左组', () => {
    const { container, bar, left, selectionGroup } = dom;
    makeBarOverflow(bar, dom.dropdown, []);
    adaptInputToolbar();
    expect(selectionGroup.parentElement).toBe(dom.menuSwitches);

    // 空间恢复：重新定义宽度并重测
    Object.defineProperty(bar, 'scrollWidth', { configurable: true, get: () => 100 });
    adaptInputToolbar();

    expect(container.classList.contains('temp-collapsed')).toBe(false);
    expect(container.classList.contains('agent-collapsed')).toBe(false);
    expect(container.classList.contains('switches-icon')).toBe(false);
    expect(container.classList.contains('selection-in-menu')).toBe(false);
    expect(selectionGroup.parentElement).toBe(left);
  });
});

describe('initToolbarAdaptive', () => {
  it('移动划词组的 mutation 不触发重测，浮层内部变更跳过，底行可见文字变化触发重测', async () => {
    const dom = setupDom();
    const { container, bar, menuSwitches, selectionGroup, dropdown } = dom;
    makeBarOverflow(bar, dropdown, []);
    initToolbarAdaptive();

    // 初始化立即重测一次：溢出 → 一路降到底，划词组入菜单
    expect(container.classList.contains('temp-collapsed')).toBe(true);
    expect(selectionGroup.parentElement).toBe(menuSwitches);

    // 清理降级标记；模拟适配器移动划词组（菜单 ↔ 左组）
    container.classList.remove('temp-collapsed', 'agent-collapsed', 'switches-icon', 'selection-in-menu');
    document.querySelector('.input-bottom-left').appendChild(selectionGroup);
    await new Promise((r) => setTimeout(r, 60));
    expect(container.classList.contains('temp-collapsed')).toBe(false);

    // 浮层内部文本变化（切换厂商/模型场景）：不影响底行宽度 → 不触发重测
    document.getElementById('modelText').textContent = 'gpt-4o';
    await new Promise((r) => setTimeout(r, 60));
    expect(container.classList.contains('temp-collapsed')).toBe(false);

    // 底行可见文字变化（语言切换/助手改名场景）：触发重测 → 重新降级
    document.getElementById('plainText').textContent = '一个很长的记忆名称';
    await new Promise((r) => setTimeout(r, 60));
    expect(container.classList.contains('temp-collapsed')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/unit/toolbar-adapt.unit.test.js`
Expected: FAIL——`switches-icon` / `selection-in-menu` 断言失败、划词组未移动（旧实现只支持前两级且目标选择器为 `.input-toolbar`）。

- [ ] **Step 3: 重写 toolbar-adapt.js**

将 `src/side_panel/toolbar-adapt.js` 整文件替换为：

```js
// side_panel/toolbar-adapt.js - 输入底行溢出探测自适应
//
// 空间不足时逐级降级以避免元素被裁剪：
//   ① temp-collapsed    温度数字隐藏（仅留图标）
//   ② agent-collapsed   助手名折叠为 emoji
//   ③ switches-icon     记忆/工具/划词 图标化
//   ④ selection-in-menu 划词开关整组移入 "+" 菜单（兜底）
// 采用实测而非固定断点，适配英文文案 / 自定义长名的多语言场景。
//
// 三个关键约束：
//   1) 测量必须排除打开的绝对定位浮层（助手选择器 / 模型设置 / "+" 菜单等）——
//      浮层按设计可探出底行边界，计入 scrollWidth 会被误判为空间不足而误折叠；
//   2) 临时隐藏再恢复浮层会让其 CSS 关键帧入场动画（dropdownFadeIn）从头
//      重播：读取 scrollWidth 强制样式重算时 display:none 已生效（动画被取消），
//      恢复后动画从第 0 帧重新计时，下一帧渲染出近全透明状态（弹框"闪一下"）。
//      因此恢复显示后立即把重播动画快进到终态，同一帧内消化，用户不可见；
//   3) ④ 级把划词开关组真实移入 "+" 菜单（DOM 移动）会触发 MutationObserver——
//      必须过滤"划词组自身被移动"的 mutation，否则每次移动都触发重测 → 再移动，
//      形成死循环。事件监听绑定在元素自身（id 不变），DOM 移动不会丢失监听。

let toolbarAdaptRafId = 0;

/**
 * 判定节点是否位于底行内的绝对定位浮层中
 * （自身或任一祖先 computed position 为 absolute；底行自身不算浮层）
 */
export function isInsideOverlay(node, bar) {
  const start = node && node.nodeType === 1 ? node : (node ? node.parentElement : null);
  for (let el = start; el && el !== bar; el = el.parentElement) {
    if (getComputedStyle(el).position === 'absolute') return true;
  }
  return false;
}

/** 收集底行内可见的绝对定位浮层（测量前临时隐藏，恢复后需快进重播动画） */
function collectOverlays(bar) {
  const overlays = [];
  bar.querySelectorAll('*').forEach((el) => {
    if (getComputedStyle(el).position === 'absolute' && el.getClientRects().length > 0) {
      overlays.push(el);
    }
  });
  return overlays;
}

/** display 恢复显示后，CSS 关键帧动画会从头重播：立即快进到终态避免闪帧 */
export function finishReplayedAnimations(elements) {
  elements.forEach((el) => {
    (el.getAnimations?.() || []).forEach((a) => {
      if (a.playState !== 'idle') a.finish?.();
    });
  });
}

/** rAF 节流：合并 resize 拖动与 DOM 批量变更期间的高频触发 */
function scheduleToolbarAdapt() {
  if (toolbarAdaptRafId) return;
  toolbarAdaptRafId = requestAnimationFrame(() => {
    toolbarAdaptRafId = 0;
    adaptInputToolbar();
  });
}

/** ④ 级兜底：划词组移入 "+" 菜单开关区 */
function moveSelectionGroupToMenu() {
  const group = document.getElementById('selectionToggleGroup');
  const target = document.getElementById('inputAddMenuSwitches');
  if (group && target && group.parentElement !== target) target.appendChild(group);
}

/** 恢复完整布局：划词组归位底行左组（appendChild 到末尾与原始顺序一致） */
function restoreSelectionGroup() {
  const group = document.getElementById('selectionToggleGroup');
  const left = document.querySelector('.input-bottom-left');
  if (group && left && group.parentElement !== left) left.appendChild(group);
}

/** 输入底行溢出探测：空间不足时逐级降级以避免元素被裁剪 */
export function adaptInputToolbar() {
  const bar = document.querySelector('.input-bottom-row');
  const container = bar?.closest('.input-container') || null;
  if (!bar || !container) return;

  const overlays = collectOverlays(bar);
  const overlayDisplays = overlays.map((el) => el.style.display);
  overlays.forEach((el) => { el.style.display = 'none'; });
  const restoreOverlays = () => {
    overlays.forEach((el, i) => { el.style.display = overlayDisplays[i]; });
    finishReplayedAnimations(overlays);
  };

  // 先恢复完整状态再测量，保证空间恢复时能还原
  container.classList.remove('temp-collapsed', 'agent-collapsed', 'switches-icon', 'selection-in-menu');
  restoreSelectionGroup();
  if (bar.scrollWidth <= bar.clientWidth) { restoreOverlays(); return; }
  container.classList.add('temp-collapsed');
  if (bar.scrollWidth <= bar.clientWidth) { restoreOverlays(); return; }
  container.classList.add('agent-collapsed');
  if (bar.scrollWidth <= bar.clientWidth) { restoreOverlays(); return; }
  container.classList.add('switches-icon');
  if (bar.scrollWidth <= bar.clientWidth) { restoreOverlays(); return; }
  container.classList.add('selection-in-menu');
  moveSelectionGroupToMenu();
  restoreOverlays();
}

/** 初始化底行自适应：窗口缩放 / 底行内可见文字变化（语言切换、助手名与记忆标签更新）后重测 */
export function initToolbarAdaptive() {
  adaptInputToolbar();
  window.addEventListener('resize', scheduleToolbarAdapt);
  const bar = document.querySelector('.input-bottom-row');
  if (bar && typeof MutationObserver !== 'undefined') {
    new MutationObserver((mutations) => {
      // 浮层内部变更不影响底行宽度（浮层为绝对定位覆盖层），且重测的隐藏-恢复
      // 会打断浮层动画（切厂商/模型更新列表文本即此场景），故直接跳过；
      // ④ 级移动划词组是适配器自身的职责（移动后随即重新测量），同样跳过；
      // 仅底行可见布局元素的变化才触发重测。
      const selectionGroup = document.getElementById('selectionToggleGroup');
      const isSelectionGroupMove = (m) =>
        !!selectionGroup
        && ([...m.addedNodes, ...m.removedNodes].includes(selectionGroup));
      if (mutations.some((m) => !isInsideOverlay(m.target, bar) && !isSelectionGroupMove(m))) {
        scheduleToolbarAdapt();
      }
    }).observe(bar, { subtree: true, childList: true, characterData: true });
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/unit/toolbar-adapt.unit.test.js`
Expected: PASS（全部用例绿）。

- [ ] **Step 5: 构建验证**

Run: `npm run build:silent`
Expected: 构建成功。

- [ ] **Step 6: 提交**

```bash
git add src/side_panel/toolbar-adapt.js test/unit/toolbar-adapt.unit.test.js
git commit -m "feat(sidepanel): 底行 4 级降级链（新增图标态与划词收进菜单兜底）"
```

---

## Task 4: input-add-menu.js（"+" 菜单交互与蓝点）+ 单测 + 接线

**Files:**
- Create: `test/unit/input-add-menu.unit.test.js`
- Create: `src/side_panel/input-add-menu.js`
- Modify: `src/side_panel/index.js`（import 区与 DOMContentLoaded 区，现 26 行 / 4297 行附近）

**Interfaces:**
- Consumes: `#inputAddBtn` / `#inputAddMenu` / `#inputAddMenuSwitches`（Task 1）；`.has-active-switch` 样式（Task 2）。
- Produces: `initInputAddMenu()` 导出（index.js 接线调用）。

- [ ] **Step 1: 写失败测试**

创建 `test/unit/input-add-menu.unit.test.js`：

```js
// @vitest-environment jsdom
// input-add-menu.unit.test.js - "+" 添加菜单：开合、外部点击关闭、菜单项点击关闭（含 capture 机制）、蓝点状态
import { describe, it, expect, beforeEach } from 'vitest';
import { initInputAddMenu } from '../../src/side_panel/input-add-menu.js';

function setupDom() {
  document.body.innerHTML = `
    <div class="input-bottom-row">
      <div class="input-bottom-left">
        <div class="input-add-wrapper">
          <button id="inputAddBtn">+</button>
          <div class="input-add-menu" id="inputAddMenu" style="display:none;">
            <button class="input-add-item" id="promptTriggerBtn">提示词</button>
            <div class="input-add-menu-switches" id="inputAddMenuSwitches">
              <div class="input-add-menu-switches-title">开关</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="outside">外部</div>`;
  initInputAddMenu();
  return {
    btn: document.getElementById('inputAddBtn'),
    item: document.getElementById('promptTriggerBtn'),
    menu: document.getElementById('inputAddMenu'),
    switches: document.getElementById('inputAddMenuSwitches'),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('input-add-menu', () => {
  let dom;

  beforeEach(() => {
    dom = setupDom();
  });

  it('点击 "+" 切换开合', () => {
    expect(dom.menu.style.display).toBe('none');
    dom.btn.click();
    expect(dom.menu.style.display).not.toBe('none');
    dom.btn.click();
    expect(dom.menu.style.display).toBe('none');
  });

  it('点击菜单外部关闭', () => {
    dom.btn.click();
    expect(dom.menu.style.display).not.toBe('none');
    document.getElementById('outside').click();
    expect(dom.menu.style.display).toBe('none');
  });

  it('菜单项自身 stopPropagation 时仍能关闭（capture 监听）', () => {
    // 模拟真实场景：提示词按钮 handler 会 stopPropagation（index.js 2529-2530）
    dom.item.addEventListener('click', (e) => e.stopPropagation());
    dom.btn.click();
    expect(dom.menu.style.display).not.toBe('none');
    dom.item.click();
    expect(dom.menu.style.display).toBe('none');
  });

  it('蓝点：开关区内无开关时隐藏；移入已激活开关时显示；取消勾选后消失', async () => {
    expect(dom.btn.classList.contains('has-active-switch')).toBe(false);

    // ④级降级把划词组（含已勾选的划词开关）移入菜单开关区
    const group = document.createElement('div');
    group.className = 'toolbar-chip-group';
    group.innerHTML = '<input type="checkbox" checked>';
    dom.switches.appendChild(group);
    await tick();
    expect(dom.btn.classList.contains('has-active-switch')).toBe(true);

    // 在菜单里取消勾选（change 冒泡到开关区）
    const checkbox = group.querySelector('input');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(dom.btn.classList.contains('has-active-switch')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/unit/input-add-menu.unit.test.js`
Expected: FAIL——模块 `input-add-menu.js` 不存在（import 解析失败）。

- [ ] **Step 3: 实现 input-add-menu.js**

创建 `src/side_panel/input-add-menu.js`：

```js
// side_panel/input-add-menu.js - 底行 "+" 添加菜单
//
// 职责：
//   1) 开合菜单：点击 "+" 切换；点击菜单项或菜单外部关闭；
//   2) "+" 蓝点：菜单开关区内存在已激活开关时显示（划词 ④ 级降级移入的场景）。
//
// 菜单项按钮（提示词/截图/附件）的业务事件监听分别绑定在 index.js / 各模块
// （id 不变），本模块不重复绑定业务行为；菜单项 handler 会 stopPropagation，
// 因此菜单项点击关闭使用 capture 阶段监听。

export function initInputAddMenu() {
  const addBtn = document.getElementById('inputAddBtn');
  const menu = document.getElementById('inputAddMenu');
  if (!addBtn || !menu) return;
  const wrapper = addBtn.closest('.input-add-wrapper');

  const setOpen = (open) => {
    menu.style.display = open ? '' : 'none';
  };
  const isOpen = () => menu.style.display !== 'none';

  // 点击 "+" 切换开合
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!isOpen());
  });

  // 点击菜单项后自动关闭：capture 阶段先于按钮自身的 handler（其会
  // stopPropagation 阻断冒泡），保证业务逻辑执行的同时菜单收起
  menu.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.input-add-item')) setOpen(false);
  }, true);

  // 点击菜单外部关闭
  document.addEventListener('click', (e) => {
    if (!isOpen()) return;
    if (wrapper && wrapper.contains(e.target)) return;
    setOpen(false);
  });

  // "+" 蓝点：开关区内有开启的开关时显示（当前仅划词会移入）
  const switches = document.getElementById('inputAddMenuSwitches');
  const syncDot = () => {
    const checkbox = switches?.querySelector('input[type="checkbox"]');
    addBtn.classList.toggle('has-active-switch', !!(checkbox && checkbox.checked));
  };
  if (switches) {
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(syncDot).observe(switches, { subtree: true, childList: true });
    }
    // 开关切换（在菜单内操作划词）时同步蓝点
    switches.addEventListener('change', syncDot);
  }
  syncDot();
}
```

- [ ] **Step 4: index.js 接线**

在 `src/side_panel/index.js` 的 `import { initToolbarAdaptive } from './toolbar-adapt.js';`（现 26 行）之后追加：

```js
import { initInputAddMenu } from './input-add-menu.js';
```

在 `document.addEventListener('DOMContentLoaded', initToolbarAdaptive);`（现 4297 行）之后追加：

```js
document.addEventListener('DOMContentLoaded', initInputAddMenu);
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run test/unit/input-add-menu.unit.test.js`
Expected: PASS（全部用例绿）。

- [ ] **Step 6: 构建 + 提交**

```bash
npm run build:silent
git add src/side_panel/input-add-menu.js src/side_panel/index.js test/unit/input-add-menu.unit.test.js
git commit -m "feat(sidepanel): 添加菜单交互模块（开合/外部关闭/蓝点）并接线初始化"
```

---

## Task 5: 综合视觉探针 + 全量验证

**Files:**
- Create: `test-results-probes/_input-bar-tiers.mjs`
- （可能微调）前四个任务的文件——仅当探针发现真实缺陷时

**Interfaces:**
- Consumes: 前四个任务的全部产物。
- Produces: 可复跑的验收探针（宽度扫描、降级断言、菜单交互、信息带位置、截图）。

- [ ] **Step 1: 创建探针脚本**

创建 `test-results-probes/_input-bar-tiers.mjs`。头部与运行骨架**从既有探针 `test-results-probes/_tools-popup-footer.mjs` 复制**（http server serve dist 段落 1-38 行 + `openPanel(seed)` 内 `page.addInitScript` 的 chrome API mock 段落），断言主体如下（替换后者主流程）：

```js
// 探针：真实浏览器加载构建后的侧边栏，验证输入区一体化容器改造：
// 1) 宽度扫描（700→280）：底行四档降级按顺序触发、无水平溢出、信息带位置不受影响
// 2) "+" 菜单：开合、外部点击关闭、菜单项点击关闭（capture 机制，模拟 stopPropagation）
// 3) 组合键（尽力项）：Ctrl+单击提示词 → 网页选择器
// 用法：node test-results-probes/_input-bar-tiers.mjs
//
// （文件头部 1-38 行 http server + openPanel 的 addInitScript mock 从 _tools-popup-footer.mjs 复制）

const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

// openPanel(seed) 从 _tools-popup-footer.mjs 复制：返回 { page, errors }（errors 收集 console/pageerror；按既有实现微调）
// seed 预置划词开关为开启，供 ④ 级蓝点断言使用
const { page, errors } = await openPanel({ enableSelectionQuery: true });

// —— 1) 宽度扫描：四档降级 + 无溢出 + 信息带位置 ——
const WIDTHS = [700, 520, 450, 430, 400, 380, 330, 300, 280];
const snapshot = () => page.evaluate(() => {
  const container = document.querySelector('.input-container');
  const bar = document.querySelector('.input-bottom-row');
  const ring = document.querySelector('#contextUsageIndicator');
  const modelTag = document.querySelector('#currentModelTag');
  const disclaimer = document.querySelector('.input-disclaimer');
  return {
    cls: ['temp-collapsed', 'agent-collapsed', 'switches-icon', 'selection-in-menu']
      .filter((c) => container.classList.contains(c)),
    overflow: bar.scrollWidth - bar.clientWidth,
    ringVisible: !!ring && ring.getClientRects().length > 0,
    modelVisible: !!modelTag && modelTag.getClientRects().length > 0,
    disclaimerVisible: !!disclaimer && disclaimer.getClientRects().length > 0,
    selectionInMenu: document.getElementById('inputAddMenuSwitches')?.querySelector('#selectionToggleGroup') !== null,
  };
});

for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(120);
  const s = await snapshot();
  check(`w=${w} 底行无水平溢出`, s.overflow <= 1, `溢出 ${s.overflow}px`);
  check(`w=${w} 信息带元素可见`, s.ringVisible && s.modelVisible && s.disclaimerVisible,
    `ring=${s.ringVisible} model=${s.modelVisible} disclaimer=${s.disclaimerVisible}`);
  await page.screenshot({ path: `test-results-probes/_input-bar-${w}.png` });
  console.log(`   w=${w} 降级类: [${s.cls.join(', ')}] selectionInMenu=${s.selectionInMenu}`);
}

// 降级顺序断言：宽度递减时类集合单调递增；相邻档位顺序固定
const at = async (w) => {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(120);
  return snapshot();
};
const s520 = await at(520);
const s400 = await at(400);
const s330 = await at(330);
const s280 = await at(280);
check('520px 完整形态（无降级类）', s520.cls.length === 0, s520.cls.join(','));
check('400px 触发 ①②（温度/助手降级）',
  s400.cls.includes('temp-collapsed') && s400.cls.includes('agent-collapsed')
  && !s400.cls.includes('switches-icon'), s400.cls.join(','));
check('330px 触发 ③（开关图标化）',
  s330.cls.includes('switches-icon') && !s330.cls.includes('selection-in-menu'), s330.cls.join(','));
check('280px 触发 ④（划词收进菜单）',
  s280.cls.includes('selection-in-menu') && s280.selectionInMenu, s280.cls.join(','));

// ④ 级 + 划词开启（seed）→ "+" 蓝点显示
const dotOn = await page.evaluate(() =>
  document.getElementById('inputAddBtn').classList.contains('has-active-switch'));
check('280px "+" 蓝点显示（菜单内开关已激活）', dotOn);

// —— 2) "+" 菜单交互 ——
await page.setViewportSize({ width: 430, height: 900 });
await page.waitForTimeout(120);
await page.click('#inputAddBtn');
check('点击 "+" 菜单打开', await page.evaluate(() => document.getElementById('inputAddMenu').style.display !== 'none'));
await page.screenshot({ path: 'test-results-probes/_input-bar-menu-open.png' });
await page.click('body', { position: { x: 10, y: 10 } });
check('点击外部菜单关闭', await page.evaluate(() => document.getElementById('inputAddMenu').style.display === 'none'));

// 菜单项点击关闭（真实菜单项业务 handler 会 stopPropagation，验证 capture 关闭仍生效）
await page.click('#inputAddBtn');
await page.evaluate(() => {
  // 给菜单项注入一个 stopPropagation 监听，模拟真实按钮行为
  document.getElementById('promptTriggerBtn').addEventListener('click', (e) => e.stopPropagation());
});
await page.click('#promptTriggerBtn');
check('点击菜单项后菜单关闭（capture）', await page.evaluate(() => document.getElementById('inputAddMenu').style.display === 'none'));
await page.keyboard.press('Escape');

// —— 3) 组合键（尽力项）：Ctrl+单击提示词 → 网页选择器 ——
try {
  await page.click('#inputAddBtn');
  await page.evaluate(() => {
    const btn = document.getElementById('promptTriggerBtn');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
  });
  await page.waitForTimeout(300);
  const agentAtVisible = await page.evaluate(() => {
    const sel = document.getElementById('agentAtSelector');
    return !!sel && sel.style.display !== 'none';
  });
  check('Ctrl+单击提示词 → 网页选择器（尽力项）', agentAtVisible,
    agentAtVisible ? '' : '未打开（可能依赖运行时数据，需人工复核）');
} catch (e) {
  check('Ctrl+单击提示词 → 网页选择器（尽力项）', false, `异常：${e.message}`);
}

// —— 页面错误 ——
check('页面无 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) process.exitCode = 1;
```

- [ ] **Step 2: 运行探针**

Run: `node test-results-probes/_input-bar-tiers.mjs`
Expected: 全部 PASS（降级顺序断言 + 无溢出 + 菜单交互 + 无 JS 错误）。
注意：宽度档位（450/400/330/280）是 mockup 预估的近似值，真实字体渲染可能偏差 ±40px；**核心正确性 = 降级顺序固定（①②③④）+ 随宽度递减单调递增 + 全程无溢出**。若某个档位断言因边界偏差失败（如 400px 实际只降了①），按语义调整该断言（把断言移到下一个更窄/更宽的宽度验证），不要为凑数值改实现或样式尺寸。
若 FAIL：按输出定位（溢出→Task 2 样式尺寸问题；降级顺序→Task 3 逻辑或 Task 1 结构问题），修复后回到 Step 1 重跑。

- [ ] **Step 3: 全量单测**

Run: `npm run test:unit`
Expected: 全部通过（含既有 46 个测试文件，确认无回归）。

- [ ] **Step 4: 构建**

Run: `npm run build:silent`
Expected: 构建成功。

- [ ] **Step 5: 人工验证清单（输出给用户）**

在侧边栏加载扩展（`chrome://extensions` 重新加载 dist）后逐项确认：
1. 提示词：单击 → 提示词选择器；**Ctrl/Cmd+单击 → 网页选择器**；
2. 截图：单击 → 整页截图；**Ctrl/Shift+单击 → 区域截图**；图片功能关闭时菜单中该项隐藏；
3. 附件：单击 → 文件选择器；拖拽文件仍出现门板并可上传；
4. 发送：生成中自动变红色停止按钮，可取消；
5. 记忆/工具/划词开关：菜单外正常切换；记忆条数下拉、工具配置弹窗正常；
6. 助手下拉、模型设置浮层正常（温度滑杆可调，模型名标签与温度联动不变）；
7. 信息带：占用环点击弹详情、模型名点击开模型设置、AI 声明位置不变；
8. 键盘：`/` `@` `$`、↑↓ 历史、Esc、Enter/Shift+Enter；
9. 窄屏拖拽侧边栏至最窄：四档降级依次生效无裁切；
10. 中英文切换：底行文案变化后自动重测降级。

- [ ] **Step 6: 提交**

```bash
git add test-results-probes/_input-bar-tiers.mjs
git commit -m "test(sidepanel): 输入区一体化容器综合探针（宽度扫描/降级/菜单）"
```

---

## 验证入口汇总

| 验证项 | 命令 | 预期 |
|---|---|---|
| 单测（自适应降级链） | `npx vitest run test/unit/toolbar-adapt.unit.test.js` | 全绿 |
| 单测（添加菜单） | `npx vitest run test/unit/input-add-menu.unit.test.js` | 全绿 |
| 全量单测 | `npm run test:unit` | 无回归 |
| 综合探针 | `node test-results-probes/_input-bar-tiers.mjs` | 全部 PASS + 截图 |
| 构建 | `npm run build:silent` | 成功 |

## 风险与回滚

- **中间态**：Task 1 完成后 ~ Task 3 前，降级逻辑指向已删除的 `.input-toolbar`（安全 early-return，无报错）——期间窄屏无自适应，属预期中间态。
- **回滚**：五个任务各自独立提交，任一任务出问题可 `git revert <hash>` 单步回退。
- **不做**：底行新增其他入口（MCP/技能等）、信息带任何调整、双行/横向滚动替代布局（评审已否决）。

