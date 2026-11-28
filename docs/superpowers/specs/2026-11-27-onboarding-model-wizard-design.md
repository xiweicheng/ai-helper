# 首次使用引导与大模型配置向导 设计方案

- 日期：2026-11-27
- 状态：待评审
- 范围：浏览器扩展侧边栏（`side_panel`）的新用户首次引导

## 1. 背景

插件从 Chrome / Edge 商店安装后，用户打开侧边栏看到的是 [side_panel.html](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/side_panel.html#L290-L297) 里的一句「开始对话 / 输入您的问题」，没有任何提示说明「必须先配置大模型」。

实际后果：

1. 用户直接输入问题 → 后台用空 `apiKey` 发起请求 → 收到 401/网络错误，只看到一条技术报错。
2. 用户不知道报错原因，也不知道要去设置页填 Key，于是判定「这插件不能用」并卸载。
3. 代理端（A 镜 / local agent）能力被误认为是使用前提，进一步抬高门槛。

因此需要一个**只要求最小配置**的首启引导：能让用户 1 分钟内接上模型；也允许他跳过，先把界面看一遍。

## 2. 目标与非目标

### 目标

1. 首次打开且未配置模型时，主动弹出 2 步配置向导，1 分钟内可完成。
2. 允许跳过；跳过后界面完全可用可浏览，并保留一个可随时回到配置的入口。
3. 未配置时发送消息不再产生裸 API 报错，而是引导回配置。
4. 配置完成后给出 3 条与当前页面能力匹配的示例任务，点击即填入输入框（不自动发送）。
5. 在引导首屏与完成页提供官方文档入口：`https://xiweicheng.github.io/ai-helper/`。

### 非目标

- 不做官方体验额度 / 中转 Key（即不做「零配置也能真聊」）。
- 不做无 Key 的静态对话演示回放。
- 不改代理端安装引导的既有逻辑（[install-guide.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/options/install-guide.js)），本次仅在完成页放一个可选的「了解代理端」卡片。
- 不重构设置页（`options.html`）的配置表单。
- 不在安装完成时自动打开欢迎页（Chrome 不允许安装后自动打开侧边栏，且本次不新增欢迎页）。

## 3. 现状事实（实现必须遵守）

| 事项 | 结论 | 依据 |
|---|---|---|
| 空态 DOM | `.welcome-message` 静态写在 `side_panel.html` | [side_panel.html#L290-L297](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/side_panel.html#L290-L297) |
| 发送入口 | 所有发送（含队列派发）汇入 `sendMessage()` | [chat-manager.js#L1177](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/side_panel/chat-manager.js#L1177) |
| 配置读写 | 必须走 `profiles` 体系，扁平键只是激活配置的镜像 | [model-profiles.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/shared/model-profiles.js#L234-L321) |
| 拉取模型 | `fetchModelList({ apiBase, apiKey })` 请求 `/models` | [model-fetcher.js#L59](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/options/model-fetcher.js#L59) |
| 预设服务商 | 内置 18 个 API Base 预设 | [constants.js#L57-L78](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/options/constants.js#L57-L78) |
| 设置入口 | 侧边栏 `settingsBtn` 直接 `chrome.runtime.openOptionsPage()` | [index.js#L4063-L4069](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/side_panel/index.js#L4063-L4069) |
| 已有引导机制 | 无 `onInstalled` 引导，无 onboarding 模块 | 全仓检索确认 |
| 弹窗规范 | 禁止原生 `alert/confirm/prompt`，用 `window.showCustomConfirm` | 项目硬性约束 |
| 国际化 | 中英文案必须成对新增 | [zh.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/shared/locales/zh.js) / [en.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/shared/locales/en.js) |

结论：向导不能自己写一套配置存储，必须复用 `createProfile()` / `updateActiveProfile()` / `applyProfile()`，否则设置页与侧边栏会读到两份不一致的配置。

## 4. 触发规则

### 判定「未配置有效模型」

```
apiKey = decodeSecret(storage.apiKey)
已配置 = apiKey 非空 && modelName 非空
```

`apiBase` 缺省视为默认 `https://api.deepseek.com`，不参与判定（避免老用户因未显式存 apiBase 被误判）。

### 触发时机

侧边栏初始化完成、会话历史就绪之后（`chatHistoryReady` 之后、首帧渲染完成后）检查一次：

- 未配置 **且** `onboardingWizardDismissedAt` 不存在 → 打开向导。
- 已配置 → 不打开。
- 已存在 `onboardingWizardDismissedAt` → 不自动打开。
- 当前正在生成（`state.generatingSessionIds` 非空）→ 不打开，避免打断。

### 手动唤起入口

1. 首页顶部状态条「未配置模型 · 去配置」。
2. 设置页基础配置卡片里的「重新打开配置向导」链接。

`onboardingWizardDismissedAt` 只控制「是否自动弹」，不控制手动唤起。

## 5. 流程（四屏）

### Step 0 · 首屏弹层

- 半透明遮罩覆盖对话区，弹层居中偏上（窄侧边栏下贴顶，留 8px 边距）。
- 内容：一句价值主张 + 一行支持范围说明 + 3 个服务商快捷片 + 主按钮「开始配置」+ 次级「跳过，先看看功能」+ 底部文档链接「不了解这是什么？看看官方介绍 ↗」。
- 遮罩点击 / Esc 等同于跳过。

### Step 1 · 选择服务商

8 张卡片（单列，避免窄屏挤压）：

1. DeepSeek · 推荐 · 便宜且够用（默认选中）
2. 阿里云百炼（通义千问）
3. 月之暗面（Kimi）
4. 火山方舟（豆包）
5. OpenAI（`https://api.openai.com/v1`）
6. Google Gemini（OpenAI 兼容端点）
7. Anthropic Claude（官方协议不兼容，需手填中转 Base）
8. 其他 / 自建中转（手动填 API Base）

选择后 `apiBase` 自动带出，不需要用户再填。底部「上一步 / 跳过 / 下一步」。

### Step 2 · 填 Key（自动校验 + 拉模型）

- 一个 Key 输入框（`type=password`，可切换明文）。
- 下方展示所选厂商的 API Base 地址（只读带入、可手动修改），修改后重新校验。
- 输入停顿 600ms 后自动校验；也可点「验证」手动触发。
- 校验动作：`fetchModelList()`。成功 → 展示「✓ 连接成功 · 已获取 N 个模型」并把模型下拉展开，默认选中第一个（若命中 DeepSeek 预设模型，优先 `deepseek-v4-pro`）。
- 失败 → 行内错误，按原因分类：401/403（Key 无效）、超时、网络错误、`/models` 不可用。
- `/models` 不可用时降级：允许手动输入模型名后直接保存。
- 底部「上一步 / 跳过 / 保存并开始」。保存前按钮不可点，保存中显示进行中状态。

### Step 3 · 完成页

- 标题一句「准备好了，试试让它干活」。
- 3 条示例任务卡：总结当前页并导出 Word / 把本页表格整理成 CSV / 定时盯页面。
- 点击卡片 → 文本填入输入框（不发送、不消耗 token），并关闭完成页。
- 一张次要卡片：「想让 AI 读写本地文件和终端？需要安装代理端 → 了解」，点击打开设置页 Agent 标签。
- 底部文档链接「完整功能文档与示例 ↗」。
- 未配置时仍显示底部状态条。

## 6. 跳过与恢复

| 场景 | 行为 |
|---|---|
| 点「跳过」/ 点遮罩 / 按 Esc | 关闭向导，写入 `onboardingWizardDismissedAt` |
| 跳过后浏览界面 | 全部功能正常可见；顶部保留状态条「⚠ 未配置模型 · 去配置」 |
| 跳过后首次发送消息 | `sendMessage()` 前置检查未配置 → 中止本次发送（不发请求）→ 打开向导；不产生 401 |
| 向导中配置成功 | 状态条消失；同时写入 `onboardingWizardDismissedAt`，避免刷新后再自动弹 |
| 已配置用户 | 状态条隐藏，不弹向导 |

## 7. 数据存储

- 新增键：`onboardingWizardDismissedAt`（number，毫秒时间戳；存在即视为已提示过）。
- 配置写入：`createProfile({ name, apiBase, apiKey, modelName, models }, { activate: true })`；若已存在激活配置则先 `updateActiveProfile(...)` 再 `applyProfile(activeProfileId)`，把配置同步回扁平键（状态条、发送拦截与后台请求都读扁平键，少了这一步等于没保存成功）。
- 不新增第二套 Key 存储，不绕开 `encodeSecret` / `decodeSecret`。

## 8. 组件与文件拆分

| 文件 | 变更 |
|---|---|
| `src/side_panel/onboarding-wizard.js` | 新增。状态机 + DOM 构建 + 校验 + 保存，对外暴露 `initOnboardingWizard()`、`maybeShowOnboardingWizard()`、`openOnboardingWizard()` |
| `src/side_panel/onboarding-wizard.css` 或 `styles/styles.css` | 新增样式，沿用现有 CSS 变量 |
| `side_panel.html` | 仅新增一个空容器节点 `<div id="onboardingRoot">`（DOM 由 JS 构建，便于切语言重渲染） |
| `src/side_panel/index.js` | 初始化末尾调用 `initOnboardingWizard()` 与 `maybeShowOnboardingWizard()` |
| `src/side_panel/chat-manager.js` | `sendMessage()` 内、发起请求前增加未配置拦截 |
| `src/shared/locales/zh.js` / `en.js` | ~~新增 `onboarding.*` 命名空间~~ **实现偏差**：改为在 `onboarding-wizard.js` 内用 `registerTranslations` 自注册（沿用 `usage-tips.js` 模式），不改两个大文件 |

约束：

- 单文件职责单一，不把向导逻辑塞进 `index.js`（该文件已 4000+ 行）。
- 不引入新依赖。
- 所有 DOM 文案走 `t()`，不硬编码中文。

## 9. 首页空态（与向导配套，小改）

现状 `.welcome-message` 只有标题和副标题。改为：

- 保留 `.welcome-message` 容器与现有 i18n key（避免破坏已有样式与其它引用）。
- 在容器内追加：一行价值主张 + 3 个示例任务胶囊（点击填入输入框）。
- 未配置时在对话区顶部显示状态条；已配置不显示。

这一项是独立小改，若评审认为应延后，可单独拆出。

## 10. 视觉与文案

- 宽度自适应窄面板（左右各留 10px），但**最大宽度 440px** 并水平居中，避免宽侧边栏下被拉伸；卡片圆角、阴影沿用现有语义 token，不引入新色板。
- 弹层 `z-index` 需高于会话停靠条（`.session-dock`），低于澄清弹框（`.clarify-overlay` 的 5000）。
- 主按钮用品牌色；「跳过」必须视觉弱化但可点，不做成灰色不可见。
- 价值主张 8–14 字；每步说明不超过一行。
- 文档链接统一 `target="_blank" rel="noopener noreferrer"`。

## 11. 错误处理

| 情况 | 处理 |
|---|---|
| Key 为空 | 保存按钮禁用 |
| 401 / 403 | 行内提示「Key 无效或已失效」，保留输入 |
| 请求超时 | 行内提示可重试，保留输入 |
| 网络失败 | 行内提示检查网络或 API 地址 |
| `/models` 返回空 | 提示并允许手动输入模型名 |
| 保存失败 | toast 提示，保留表单不关闭 |
| 向导渲染异常 | try/catch 兜底，静默降级为不显示，绝不阻塞侧边栏初始化 |

## 12. 验收标准

1. 全新安装、未配置：打开侧边栏自动弹向导。
2. 错误 Key：行内报错，向导不关闭，可修改重试。
3. 正确 Key：自动拉取模型、默认选中、保存后状态条消失且不再自动弹。
4. 点跳过：向导关闭，界面可正常浏览与操作，顶部出现状态条。
5. 跳过后发送消息：不发起 API 请求，弹出向导。
6. 已配置用户：不自动弹，无状态条。
7. 中英文切换后所有向导文案正确。
8. 向导打开时不破坏已有快捷键与输入框焦点；Esc 可关闭。
9. 网络断开时校验失败有明确提示，不出现空白卡死。

## 13. 风险与取舍

- **多一次 `/models` 请求**：只发生一次，不消耗 token；企业网关禁用该接口时降级手填。
- **误判老用户**：判定只依赖 `apiKey` 与 `modelName`，且 `onboardingWizardDismissedAt` 一次性写入，最坏情况是多弹一次可关闭的向导。
- **侧边栏空间窄**：因此每步只放一个决策点，服务商卡片单列，模型选择并入第 2 步。
- **不做零配置真聊**：这是明确取舍。首屏的价值主张与完成页示例承担「先给感觉」的职责，但真实成功仍然需要 Key。
