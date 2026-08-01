# 工具自动化测试基础设施

## Context（背景）

当前项目（Chrome 扩展）**核心工具层零测试覆盖**：
- `src/background/tool-executor.js`（160KB，4168 行，承载 50+ 工具的分发与执行）无任何测试
- `src/content/` 下 7 个工具模块（页面交互、表单填充、内容提取）无测试
- 根 `package.json` 无 test 脚本、无测试框架、无 fixture
- 仅 `agent/` 子项目有 2 个 `node:test` 测试（与扩展主体隔离）

工具大量依赖浏览器环境（DOM、Shadow DOM、真实事件、滚动、React 受控组件），仅靠静态阅读无法验证正确性，手动验证成本高且易回归。本计划建立**分层自动化测试体系**，从纯函数到真实浏览器逐层覆盖，让工具缺陷能在开发阶段被捕获。

预期产出：`npm run test:unit`（秒级反馈）+ `npm run test:e2e`（真实浏览器验证）两条命令，覆盖工具定义校验、纯函数逻辑、DOM 逻辑、真实页面交互全链路。

## 技术选型

| 层 | 框架 | 环境 | 覆盖范围 | 速度 |
|---|---|---|---|---|
| 单元测试 | **vitest** | node | 纯函数、工具定义校验 | 毫秒级 |
| DOM 单元测试 | **vitest + jsdom** | jsdom | content script DOM 逻辑 | 秒级 |
| 集成测试 | **@playwright/test** | 真实 Chromium | 真实事件/Shadow DOM/滚动/表单 | 秒级 |

选 vitest 的理由：与现有 vite 生态零摩擦，ESM 原生，内置断言/spy/假定时器，文件级 `// @vitest-environment jsdom` 注释即可切环境。
选 Playwright 的理由：用户明确诉求"页面环境要打开"，jsdom 不支持真实事件派发、Shadow DOM 完整、`scrollBy`、React 受控组件 input 事件，这些必须真实浏览器。

> **取舍提示**：Playwright 首次需 `npx playwright install chromium`（约 150MB 一次性下载）。若不希望引入该重依赖，可只采纳阶段一（vitest+jsdom），但真实交互层将无覆盖。计划按两阶段交付，阶段二可独立决定。

## 项目结构

```
ai-helper/
├── test/
│   ├── unit/
│   │   ├── tool-helpers.unit.test.js          # 纯函数：JSON 修复/解析/结果归一
│   │   ├── tool-definitions.unit.test.js      # 7 个工具定义 schema 校验
│   │   └── content/
│   │       ├── page-utils.unit.test.js        # 选择器生成/文本/值读取
│   │       ├── shadow-dom-utils.unit.test.js # 深度查询穿透 Shadow DOM/iframe
│   │       ├── page-interaction.unit.test.js  # query_elements/ref 注册表/计数
│   │       ├── page-extract.unit.test.js      # metadata/links/forms/images/search
│   │       └── interaction-tools.unit.test.js # fillForm/selectDropdown/clickByText
│   ├── e2e/
│   │   ├── fixtures/
│   │   │   ├── form-page.html                 # 表单（含 select/checkbox/radio/contenteditable）
│   │   │   ├── shadow-dom-page.html           # Shadow DOM + 自定义组件
│   │   │   ├── infinite-scroll-page.html      # 懒加载/无限滚动
│   │   │   └── iframe-page.html               # 同源/跨域 iframe（复用 docs/test-*.html）
│   │   ├── content-tools.e2e.spec.js           # 真实页面工具流程
│   │   └── helpers/
│   │       └── load-module.js                 # esbuild 预打包 content 模块→IIFE 注入页面
│   └── setup/
│       ├── chrome-mock.js                     # 最小 chrome API mock（单元测试用）
│       └── jsdom-globals.js                   # jsdom 缺失 API 补丁（window.find 等）
├── vitest.config.js                            # node + jsdom 双环境
├── playwright.config.js                        # Chromium e2e
└── package.json                                # 新增 test/test:unit/test:e2e 脚本
```

## 测试分层与覆盖点

### 第一层：纯函数单元测试（node 环境，零 mock）

**`test/unit/tool-helpers.unit.test.js`** — 测 `src/background/tool-helpers.js` 已导出的纯函数（无顶层副作用，可直接 import）：
- `autoCompleteJson`：尾随逗号、未引号值、截断 JSON 补全
- `fixArrayObjectMismatch`：数组/对象错配修复
- `tryParseToolArgs`：合法 JSON 直通 / 截断修复 / 不可修复返回失败信封
- `makeResult`：success/content/extra 合并、tool_call_id 注入
- `normalizeToolResult`：纯字符串补 content、对象缺字段补齐、已有 content 保留

**`test/unit/tool-definitions.unit.test.js`** — 校验 `src/background/tools/*.js` 7 个文件（聚合自 `constants.js` 的 `RAW_TOOLS`）：
- id 全局唯一；`function.name === id`
- `execution` 取值 ∈ {content_script, background}
- `required` 中每个字段都在 `parameters.properties` 中存在
- `parameters.type === 'object'`；enum 字段值为字符串数组
- 每个工具都有 `category`、`type:'function'`

### 第二层：DOM 逻辑单元测试（jsdom 环境）

直接 `import` content script 模块（已确认 7 个模块均无顶层副作用，jsdom 可安全加载；**避开** `index.js`/`selection-toolbar.js`）。

**`page-utils.unit.test.js`** — `generateUniqueSelector`（有 id / 无 id 走 nth-child / body 边界 / className 截断）、`getElementText`（input/textarea/select/普通元素）、`getElementValue`（checkbox·radio·text·select）。

**`shadow-dom-utils.unit.test.js`** — `deepQuerySelector`/`deepQuerySelectorAll`（普通 DOM / Shadow DOM 穿透 / 同源 iframe / 跨域 iframe 跳过 / maxDepth 截断）、`hasShadowDom`/`hasIframe`。

**`page-interaction.unit.test.js`** — `queryInteractiveElements`（elementTypes 过滤 / filterByText / ref 编号分配 / hint 字段）、`getElementCount`（includeHidden 可见性过滤）、`getSelectorByRef`（注册表命中/未命中）、`readAccessibilityTree`（语义角色映射）。
> 注意：`elementRegistry` 是模块级 Map，`beforeEach` 重新调用 `queryInteractiveElements` 清空状态。

**`page-extract.unit.test.js`** — `extractMetadata`（title/description/og:*）、`extractLinks`（internal/external/all 过滤 + includeImages）、`extractForms`（字段收集）、`extractImages`（minWidth/minHeight 过滤）、`searchInPage`（plain/regex + caseSensitive）、`getIframeContent`（同源可读 / 跨域报错）。
> jsdom 不实现 `window.find()`，`searchInPage` plain 模式需在 `setup/jsdom-globals.js` 补 stub 或仅测 regex 模式。

**`interaction-tools.unit.test.js`** — `fillForm`（text/select/checkbox/radio/contenteditable 五分支）、`selectDropdown`（触发→等选项→点击 optionText）、`clickByText`（选择器命中 / 文本不存在 / 不可见 / 不可点击 四种错误诊断）、`scrollToPosition`（坐标/selector/align）、`keyboardInput`（text 输入 vs key 派发）。
> jsdom 不触发真实事件，仅断言函数调用后 DOM 状态变化与返回信封；真实事件验证留给 e2e。

### 第三层：真实浏览器集成测试（Playwright + Chromium）

**模块注入方案**：content script 是 ESM，浏览器页面无法直接跨域 import 本地文件。用 `test/e2e/helpers/load-module.js` 在测试启动前用 **esbuild（已是 devDependency）** 把 `src/content/*.js` 打包成单文件 IIFE bundle，挂到 `window.__tools`。测试中：
```js
await page.addInitScript({ content: bundleCode });      // 注入工具模块
await page.goto('fixtures/form-page.html');             // 打开测试页
const result = await page.evaluate((args) => window.__tools.fillForm(args.fields), { fields: [...] });
assert(result.success);
```

**`content-tools.e2e.spec.js`** 覆盖端到端流程（真实事件）：
- `query_elements` → 拿 ref → `interact_element(ref)` 完整链路（含 auto-wait）
- `fill_form` React 受控组件真实输入（构造一个挂在 fixture 的 React input，验证 value 同步）
- `select_dropdown` 自定义组件（Shadow DOM 下拉）
- `scroll_collect` 无限滚动页面收集去重
- `drag_drop`（标注实验性，验证触发但不强制断言效果）
- `search_in_page` / `extract_data`（table/links/images 各 dataType）
- Shadow DOM 穿透：在 shadow tree 内点击按钮、查询元素

## 关键文件清单

**待新建**：
- `vitest.config.js` — `environmentMatchGlobs`：`test/unit/content/**` → jsdom，其余 node；`setupFiles: ['./test/setup/chrome-mock.js']`
- `playwright.config.js` — `testDir: './test/e2e'`，`projects: [{ name:'chromium', use: { ...devices['Desktop Chrome'] } }]`，`webServer` 可选起静态 server serve fixtures
- `test/setup/chrome-mock.js` — 全局 `globalThis.chrome = { storage:{local:{get,set}}, runtime:{lastError:null}, tabs:{query}, scripting:{executeScript} }` 最小集
- `test/e2e/helpers/load-module.js` — esbuild 打包 content 模块为 IIFE，导出 `buildBundle()` 与 `callTool(page, fnName, args)`
- `test/e2e/fixtures/*.html` — 4 个测试页（可部分复用 `docs/test-shadow-dom-iframe.html`、`docs/test-iframe-content.html`、`docs/test-nested-iframe.html`）
- 上述 7 个测试文件

**复用现有**：
- 纯函数：`src/background/tool-helpers.js`（已 export `tryParseToolArgs`/`makeResult`/`normalizeToolResult`/`autoCompleteJson`/`fixArrayObjectMismatch`）
- 工具定义聚合：`src/background/constants.js` 的 `RAW_TOOLS`（单一数据源）
- content 模块：`src/content/{page-utils,shadow-dom-utils,page-interaction,page-extract,interaction-tools}.js`（均无顶层副作用，可直接 import）
- 现有手动测试页：`docs/test-*.html`

**不改源码**（除非后续清理技术债）：`tool-executor.js` 内重复定义了 `tryParseToolArgs`/`makeResult`/`normalizeToolResult`（847/933/953 行），未从 tool-helpers import。单测覆盖 tool-helpers 导出版本即可；建议后续单独 PR 删除重复定义改用 import（不在本计划范围）。

## 实现步骤

### 阶段一：单元测试（无浏览器依赖，先行）
1. 安装 devDeps：`vitest`、`jsdom`；写 `vitest.config.js`
2. 写 `test/setup/chrome-mock.js`（最小 chrome stub）
3. 写 `tool-helpers.unit.test.js` + `tool-definitions.unit.test.js`（node 环境）
4. 写 5 个 `content/*.unit.test.js`（jsdom 环境，文件头加 `// @vitest-environment jsdom`）
5. `package.json` 加 `"test:unit": "vitest run"`、`"test:unit:watch": "vitest"`
6. 跑通 `npm run test:unit`，确认全绿

### 阶段二：e2e 真实浏览器测试
7. 安装 `@playwright/test`；`npx playwright install chromium`
8. 写 `playwright.config.js`、`test/e2e/helpers/load-module.js`（esbuild bundle）
9. 写 4 个 `fixtures/*.html`（部分复用 docs/）
10. 写 `content-tools.e2e.spec.js`（先 query_elements→interact_element、fill_form、select_dropdown 三个核心流程，再扩展）
11. `package.json` 加 `"test:e2e": "playwright test"`、`"test": "npm run test:unit && npm run test:e2e"`
12. 跑通 `npm run test:e2e`，确认全绿

## 验证方式

1. **绿灯**：`npm run test:unit` 与 `npm run test:e2e` 均全过
2. **失效注入**（验证测试有效）：临时改坏 `generateUniqueSelector`（如返回固定字符串）→ 对应 `page-utils.unit.test.js` 应红；改坏 `clickByText` 选择器 → e2e 应红；改完恢复
3. **覆盖度抽查**：`npx vitest run --coverage`（可选装 `@vitest/coverage-v8`）查看 content 模块行覆盖
4. **CI 就绪**：`npm test` 单命令跑全套，退出码非 0 即失败

## 范围边界

- ✅ 测：工具定义 schema、tool-helpers 纯函数、content script DOM 逻辑、真实页面工具流程
- ❌ 不测（成本过高/价值低）：`executeTool` 全链路（需 mock 17 个 chrome API + 模块级 const）、Agent/WebSocket 类工具、UI 层（side_panel/options）
- ❌ 不改：现有源码逻辑（仅新增测试文件与配置；技术债清理另立 PR）
