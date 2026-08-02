# 国际化(i18n)改造实施计划

## Context

当前项目所有文案(工具描述、系统提示词、UI 界面、报错通知、agent 端响应)均为硬编码中文,约 1500–2000+ 处,且无任何 i18n 基础设施。为支持多语言,需建立完整的 i18n 体系。

**用户已确认的核心决策:**
1. **系统提示词** → 统一英文,固定不切换(用户看不到,大模型能理解夹杂语言;用户自定义部分用户自决)
2. **工具描述给模型的部分** → 统一英文固定
3. **工具描述给用户的部分(UI 配置展示)** → 国际化(英文语境用英文默认,其他语言翻译)
4. **所有 UI / Toast / 报错 / agent 端回传文案** → 给人看的,全部国际化

**核心原则:给模型看的用英文固定,给人看的按语言切换。**

---

## 核心架构设计

### 1. 双轨 i18n 机制

| 场景 | 方案 | 理由 |
|------|------|------|
| manifest.json(name/description/commands) | Chrome 原生 `chrome.i18n` + `_locales/{en,zh}/messages.json` | Chrome 扩展强制要求,`__MSG_xxx__` 占位 |
| 所有 JS / HTML 中的文案 | 自建轻量 i18n 模块 `src/shared/i18n.js` | `chrome.i18n` 的 `$1` 占位符不友好、同步 API 不支持运行时切换;自建 `t(key, params)` 更灵活,支持嵌套 key、参数插值、运行时语言切换、订阅刷新 |

### 2. i18n 模块设计(`src/shared/i18n.js`)

- `t(key, params)`:查表 + 参数插值(`{name}` 语法),找不到 key 时 fallback 到英文,再 fallback 到 key 本身
- `setLanguage(lang)` / `getLanguage()`:语言读写,持久化到 `chrome.storage.local`
- `subscribe(callback)`:语言变更订阅(UI 组件订阅后重新渲染)
- `registerTranslations(lang, dict)`:注册语言包(各模块可按需注册自己的文案)

语言资源文件:
- `src/shared/locales/zh.js` — 中文文案(按模块分组:`common`, `tool`, `ui`, `error`, `agent` 等)
- `src/shared/locales/en.js` — 英文文案

### 3. 工具描述拆分(关键设计)

利用现有 `BUILTIN_TOOLS`(给模型)与 `BUILTIN_TOOLS_UI`(给用户)已分离的结构,在 [constants.js:109-125](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/background/constants.js#L109-L125) 派生处改造:

- **给模型**:`BUILTIN_TOOLS` 的 `function.description` 保持英文(将现有中文描述翻译为英文,作为给模型的固定版本)
- **给用户**:`BUILTIN_TOOLS_UI` 的 `description` 改为 `t('tool.{id}.description')`,运行时按语言返回
- 工具定义文件(`browser-tools.js` 等)中的 `description` 字段改为英文(给模型),中文版本移入 `locales/zh.js`

### 4. agent 端本地化策略

采用 **方案 A:agent 端按 `Accept-Language` 返回本地化文案**:
- 插件端 `local-agent-client.js` 的 `agentRequest`/`agentGet` 统一加 `Accept-Language` 头(值来自 `state.currentLanguage`)
- agent 端新增 `agent/src/i18n.js` + `agent/src/locales/{en,zh}.js`,根据请求头选择语言
- 不破坏现有接口响应结构,改造量最小

---

## 分阶段实施路线

| 阶段 | 目标 | 范围 | 文案量 |
|------|------|------|--------|
| **阶段 1** | 基础设施 + 端到端试点 | i18n 模块、语言状态、语言切换 UI、manifest `_locales`、confirm-dialog 试点 | ~20 处 |
| **阶段 2** | UI 静态文案 | side_panel.html / options.html 静态文本 + JS 动态文案 | ~200 处 |
| **阶段 3** | 工具描述拆分 | 工具 description 英文化(给模型)+ UI 展示 i18n(给用户)+ 分类标签 + PRESET_MODES | ~150 处 |
| **阶段 4** | 报错/通知/Toast | 全栈报错信息、Toast、确认弹窗文案(带插值) | 数百处 |
| **阶段 5** | agent 端 | Accept-Language 头 + agent 端 i18n(server.js / security.js / auth.js 等) | ~100 处 |
| **阶段 6** | 系统提示词英文化 | agent-defaults.js / react-loop.js / context-summarizer.js 等提示词中→英 | ~20 块 |

**本次执行阶段 1**(基础设施 + 试点),验证机制可行后再大规模推广。

---

## 阶段 1 详细实施步骤

### 步骤 1:创建 i18n 核心模块

新建 `src/shared/i18n.js`:
- 维护 `currentLang`(默认 `'zh'`)和 `translations` 字典
- 实现 `t(key, params)`、`setLanguage`、`getLanguage`、`subscribe`、`registerTranslations`
- `t()` 查找顺序:当前语言 → 英文 fallback → key 本身
- 参数插值:`t('error.fileNotFound', {name: 'x.js'})` → `"文件 x.js 不存在"`

### 步骤 2:创建语言资源文件(试点 key)

新建 `src/shared/locales/zh.js` 和 `src/shared/locales/en.js`,先放入试点文案(confirm-dialog + 通用按钮):
```
common.confirm / common.cancel / common.close / common.ok
dialog.confirmTitle / dialog.confirmMessage
```
后续阶段按模块逐步扩充。

### 步骤 3:语言状态与持久化

修改 [src/side_panel/state.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/side_panel/state.js):
- 新增 `export let currentLanguage = 'zh'`
- 新增 `export function initLanguage()` 从 `chrome.storage.local` 读取并注册到 i18n 模块

修改 [src/options/index.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/options/index.js) 和 side_panel 初始化流程,启动时调用 `initLanguage()`。

### 步骤 4:manifest 国际化

1. 新建 `_locales/en/messages.json` 和 `_locales/zh/messages.json`,放入 `name`、`description`、`commandToggleSidepanel` 等
2. 修改 [manifest.json](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/manifest.json):
   - 加 `"default_locale": "zh"`
   - `name` → `"__MSG_extName__"`
   - `description` → `"__MSG_extDescription__"`
   - commands.description → `"__MSG_commandToggleSidepanel__"`

### 步骤 5:语言切换 UI

在设置页(options.html / options/index.js)新增语言下拉选择(中文 / English),切换后:
- `setLanguage(lang)` 更新 i18n 模块
- 持久化到 `chrome.storage.local`
- `subscribe` 的 UI 重新渲染
- 可选:提示用户刷新页面以应用全部变更

### 步骤 6:试点 — confirm-dialog 全量 i18n 化

改造 [src/side_panel/confirm-dialog.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/side_panel/confirm-dialog.js):
- 所有硬编码中文(标题、按钮、提示)替换为 `t()` 调用
- 验证:中英文切换后弹窗文案正确变化

### 步骤 7:HTML 文案占位机制(为阶段 2 铺路)

在 `src/shared/i18n.js` 中增加 `applyI18n(rootElement)` 函数:
- 扫描带 `data-i18n="key"` 属性的元素,设置 textContent
- 扫描带 `data-i18n-placeholder="key"` 的元素,设置 placeholder
- 扫描带 `data-i18n-title="key"` 的元素,设置 title
- 语言切换 / 页面加载时调用

这样阶段 2 只需在 HTML 加 `data-i18n` 属性 + 补充 key,无需逐个改 JS。

---

## 关键文件清单

**新增:**
- `src/shared/i18n.js` — i18n 核心模块
- `src/shared/locales/zh.js` — 中文文案
- `src/shared/locales/en.js` — 英文文案
- `_locales/zh/messages.json` — manifest 中文
- `_locales/en/messages.json` — manifest 英文

**修改(阶段 1):**
- [src/side_panel/state.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/side_panel/state.js) — 加 language 状态
- [manifest.json](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/manifest.json) — default_locale + __MSG__
- [src/side_panel/confirm-dialog.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/side_panel/confirm-dialog.js) — 试点改造
- [src/options/index.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/options/index.js) — 语言切换 UI + 初始化
- side_panel / options 初始化入口 — 调用 `initLanguage()` + `applyI18n()`

**后续阶段涉及(本次不动):**
- 工具定义:`src/background/tools/*.js`、[src/background/constants.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/background/constants.js)
- UI:`side_panel.html`、`options.html`、`src/side_panel/*.js`、`src/options/*.js`
- 提示词:`src/shared/agent-defaults.js`、`src/background/react-loop.js` 等
- agent 端:`agent/src/server.js`、`agent/src/security.js`、`agent/src/auth.js`、[src/background/local-agent-client.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/background/local-agent-client.js)

---

## 验证方式

1. `npm run build:silent` 构建通过
2. 加载扩展,manifest 名称/描述按 Chrome 界面语言正确显示
3. 设置页切换语言为 English → confirm-dialog 弹窗按钮显示 Confirm/Cancel
4. 切换回中文 → 显示 确认/取消
5. 刷新扩展后语言偏好保持
6. `npm run test:unit` 单元测试通过(若 i18n 模块有测试)
7. 验证 `t()` 找不到 key 时 fallback 到英文,再 fallback 到 key 本身(不报错)
