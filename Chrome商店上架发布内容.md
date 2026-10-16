# Chrome 网上应用店上架发布内容

> 适用于 Google Chrome Web Store（chromewebstore.google.com）发布流程。
> 所有权限理由均基于 `manifest.json` 实际权限及代码中的真实用途核实，与《Edge商店上架审核填写内容.md》同源，并新增了 Chrome 特有的 `webNavigation` 理由与数据披露章节。
> 商店后台可为同一扩展分别添加 zh-CN / en 两个本地化列表，中英文版可直接粘贴。

---

## 目录

1. [发布前准备](#1-发布前准备)
2. [商店基本信息](#2-商店基本信息)
3. [详细描述（Store description）](#3-详细描述store-description)
4. [单一用途描述（Single purpose）](#4-单一用途描述single-purpose)
5. [权限理由（Permission justifications）](#5-权限理由permission-justifications)
6. [隐私与数据披露（Privacy practices）](#6-隐私与数据披露privacy-practices)
7. [图片素材清单](#7-图片素材清单)
8. [远程代码声明](#8-远程代码声明)
9. [提交与审核注意事项](#9-提交与审核注意事项)

---

## 1. 发布前准备

| 事项 | 说明 |
|---|---|
| 开发者账号 | 用 Google 账号登录 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)，一次性注册费 **$5**，需验证联系邮箱 |
| 上传包 | 运行 `npm run package` 生成根目录 `ai-helper@<version>.zip`（manifest.json 位于 zip 根目录，含 `_locales`，勿用 Finder 右键压缩） |
| 隐私政策 URL | **必填**。使用 GitHub Pages 部署的双语隐私政策：`https://xiweicheng.github.io/ai-helper/privacy-policy.html`（源文件 `docs/privacy-policy.html`，需先推送并确认 Pages 已发布、链接非 404） |
| 商店图标 | `icons/icon128.png`（128×128，≤ 128 KB） |

---

## 2. 商店基本信息

### Item name（≤ 75 字符）

- **中文：** `AI Helper 网页智能助手：侧边栏 AI 聊天与浏览器自动化`
- **English:** `AI Helper: Web AI Assistant, Side Panel Chat & Automation`

### Summary 简短描述（≤ 132 字符）

- **中文：** `基于大语言模型的网页智能助手：侧边栏对话问答、划词便捷提问、ReAct 推理循环驱动 40+ 内建工具与 MCP 扩展，支持网页内容理解与浏览器自动化操作`（72 字符）
- **English:** `LLM-powered web assistant: side panel chat, selection Q&A, ReAct loop with 40+ tools and MCP extensions for browser automation`（128 字符）

> 以上与 `_locales/*/messages.json` 中 manifest 的 name/description 保持一致，上传包后 Chrome 会自动带出默认文案，后台列表字段可另行覆盖。

### 其他字段

| 字段 | 取值 |
|---|---|
| Category 类别 | **Productivity（生产工具）** |
| Languages 语言 | 添加 `Chinese` 与 `English` 两个本地化条目 |
| Website URL | `https://github.com/xiweicheng/ai-helper` |
| Privacy Policy URL | `https://xiweicheng.github.io/ai-helper/privacy-policy.html` |
| Visibility 可见性 | 首次提审建议先选 **Unlisted（不公开）**，审核通过后再切 Public |

---

## 3. 详细描述（Store description）

> 字段上限 16,000 字符；Chrome 对关键词堆砌比 Edge 更敏感，以下文案已按"问题 → 功能 → 隐私"结构组织。

### 中文版

AI Helper 是一款开源的 LLM 浏览器智能助手，让你用自然语言操控网页——远不止聊天。

基于 ReAct 推理循环，AI Helper 能真正动手做事：读取和提取页面内容、点击元素、填写表单、滚动、截图，并在侧边栏聊天界面中自动完成复杂的多步骤网页任务。

核心功能：

- 侧边栏聊天：一边浏览一边与 AI 对话，支持流式响应与多轮记忆。快捷键 Ctrl/Cmd+Shift+Y 一键唤起。
- 划词问答：选中网页任意文本弹出浮动工具栏，支持 AI 搜索、解释、翻译、总结和自定义提示词。
- 40+ 内置工具：标签页、书签、历史、下载和 Cookie 管理，页面内容提取（含 iframe），截图，以及可选本地代理的文件操作与命令执行。
- 多智能体：创建自定义助手，各自拥有独立的系统提示词和工具权限，按场景自由切换。
- 长期记忆：AI 跨会话记住你的偏好。
- 可扩展：支持 Skill 工作流与 MCP（模型上下文协议）第三方工具接入。
- 完全透明：推理日志、Token 用量统计，每一步思考和操作都可追溯。

隐私承诺：

- 自带 API Key 即可使用（OpenAI 兼容接口、DeepSeek 等），请求仅发往你自行配置的模型服务。
- 所有对话、设置与记忆仅保存在你的设备本地，扩展自身不收集、不上传任何用户数据。
- 开源代码，欢迎审计：https://github.com/xiweicheng/ai-helper

### 英文版

AI Helper is an open-source, LLM-powered browser assistant that lets you control web pages with natural language — far beyond simple chat.

Built on a ReAct reasoning loop, AI Helper can truly act on your behalf: read and extract page content, click elements, fill forms, scroll, take screenshots, and automate complex multi-step web tasks, all from a side panel chat interface.

Key features:

- Side panel chat: converse with AI while browsing, with streaming responses and multi-turn memory. One shortcut (Ctrl/Cmd+Shift+Y) to summon it.
- Selection Q&A: select any text on a page to get a floating toolbar for AI search, explain, translate, summarize, and custom prompts.
- 40+ built-in tools: tab, bookmark, history, downloads and cookie management, page extraction (including iframes), screenshots, and file operations via an optional local agent.
- Multi-agent support: create custom assistants with their own system prompts and tool permissions, and switch per scenario.
- Long-term memory: the AI remembers your preferences across sessions.
- Extensible via Skills and the MCP (Model Context Protocol) for third-party tools.
- Full transparency: reasoning logs and token usage statistics make every thought and action traceable.

Privacy promise:

- Bring your own API key (OpenAI-compatible endpoints, DeepSeek, etc.). Requests go only to the model service you configure yourself.
- All conversations, settings and memory stay on your device. The extension itself collects and uploads no user data.
- Open source, audit welcome: https://github.com/xiweicheng/ai-helper

---

## 4. 单一用途描述（Single purpose）

> 在 Dashboard「Privacy → Single purpose」填写，需一句话概括，且所有权限都必须能归入该用途。

**中文：** 让用户通过自然语言与网页交互：侧边栏 AI 聊天、划词问答，并由 ReAct 推理循环驱动工具完成读取页面、操作页面、管理标签页/书签/历史/下载等用户明确请求的浏览器任务。所有数据仅本地存储。

**English:** Letting users interact with web pages in natural language: side panel AI chat, selection Q&A, and a ReAct reasoning loop that runs tools to read/act on pages and manage tabs, bookmarks, history and downloads on the user's explicit request. All data is stored locally only.

---

## 5. 权限理由（Permission justifications）

> Chrome 后台逐项权限填写 Reason（每项 ≤ 1000 字符）。以下与 Edge 版同源，**新增 `webNavigation`**。

### activeTab
**中文：** 用户唤起 AI 助手时需要访问当前激活的标签页，以便读取页面内容、显示划词工具栏，并对用户正在浏览的页面执行用户请求的操作。
**English:** Required to access the currently active tab when the user invokes the AI assistant, so it can read page content, show the text-selection toolbar, and perform user-requested actions on the page the user is viewing.

### storage
**中文：** 用于在本地持久化用户设置、智能体配置、自定义提示词、会话记录和长期记忆，保证用户数据在浏览器会话之间保留。
**English:** Required to persist user settings, agent configurations, custom prompts, chat sessions and long-term memory locally, so user data is retained between browser sessions.

### unlimitedStorage
**中文：** 长期使用后，聊天记录、执行日志和记忆数据可能超过默认的 5 MB 存储配额。该权限防止用户对话数据因配额限制而静默丢失。
**English:** Chat history, execution logs and memory records can grow beyond the default 5 MB quota over long-term use. This permission prevents user conversation data from being silently lost due to quota limits.

### sidePanel
**中文：** 扩展的主聊天界面渲染在浏览器侧边栏中，用户可以一边继续浏览网页一边与 AI 对话。
**English:** The extension's main chat interface is rendered in the browser side panel, allowing users to converse with the AI while continuing to browse the page.

### scripting
**中文：** 用于按需注入内容脚本，实现读取页面内容、定位并交互页面元素（点击、填写、高亮），以及支持划词工具栏进行 AI 辅助的页面自动化。
**English:** Required to inject content scripts on demand to read page content, locate and interact with page elements (click, fill, highlight), and support the text-selection toolbar for AI-assisted page automation.

### bookmarks
**中文：** 提供用户主动调用的工具，让 AI 在对话中帮助用户搜索浏览器书签、查找已收藏的页面。
**English:** Provides a user-invoked tool that lets the AI search the user's bookmarks to help find saved pages during conversation.

### history
**中文：** 提供用户主动调用的工具，让 AI 搜索浏览历史，帮助用户找到之前访问过的页面。
**English:** Provides a user-invoked tool that lets the AI search browsing history to help the user locate previously visited pages.

### downloads
**中文：** 当用户明确要求时，用于将 AI 生成的文件（如页面截图、导出的数据文件）保存到用户的下载文件夹。
**English:** Required to save files generated by the AI (such as page screenshots and exported data files) to the user's download folder when the user explicitly requests it.

### notifications
**中文：** 当长时间运行的 AI 任务完成或发生重要状态变化时通知用户，因为任务可能在用户切换到其他标签页后才完成。
**English:** Used to notify the user when a long-running AI task completes or when important status changes occur, since the task may finish while the user is on another tab.

### tabs
**中文：** 用于按用户请求管理标签页（打开/切换/关闭/刷新）、定位激活标签页以注入助手，以及截取页面截图用于多模态问答。
**English:** Required to manage tabs on user request (open/switch/close/reload), locate the active tab to inject the assistant, and capture page screenshots for multimodal Q&A.

### tabGroups
**中文：** 为"标签页绑定模式"提供视觉标记：当用户选择将 AI 助手侧边栏绑定到特定标签页时，扩展会将启用助手的标签页归入一个名为 "AI Helper" 的标签组，让用户直观看到哪些标签页正在使用助手，并可整体折叠、移动或关闭。该权限仅用于创建、查询、更新扩展自己的标签组及增减成员，且用户可在设置中关闭自动分组。
**English:** Provides visual grouping for the optional "tab-specific" mode: when the user binds the AI assistant to specific tabs, the extension groups those tabs under an "AI Helper" tab group so users can see and manage which tabs have the assistant enabled at a glance. It is used only to create, query, update and add/remove members of the extension's own group, and auto-grouping can be turned off by the user in settings.

### cookies
**中文：** 提供用户主动调用的工具，当用户明确要求时（例如排查登录问题），让 AI 查看和管理当前站点的 Cookie。
**English:** Provides a user-invoked tool that lets the AI view and manage cookies for the current site when the user explicitly asks, e.g. for troubleshooting login issues.

### offscreen
**中文：** 使用离屏文档代表 AI 工具执行剪贴板复制/粘贴操作，因为 Service Worker 没有 DOM 访问能力。
**English:** An offscreen document is used to perform clipboard copy/paste operations on behalf of the AI tools, since the service worker has no DOM access.

### clipboardRead
**中文：** 用于用户主动调用的"从剪贴板粘贴"工具，当用户要求时允许 AI 读取剪贴板内容并在对话中使用。
**English:** Required for the user-invoked "paste from clipboard" tool, allowing the AI to read clipboard content and use it in the conversation when the user asks.

### clipboardWrite
**中文：** 当用户点击复制按钮或要求 AI 复制时，用于将 AI 生成的结果、代码、页面链接和提取的内容复制到剪贴板。
**English:** Required to copy AI-generated results, code, page links and extracted content to the clipboard when the user clicks copy or asks the AI to copy.

### commands
**中文：** 注册键盘快捷键（Ctrl/Cmd+Shift+Y），方便用户快速打开或关闭 AI 助手侧边栏。
**English:** Registers a keyboard shortcut (Ctrl/Cmd+Shift+Y) so users can quickly open or close the AI assistant side panel.

### alarms
**中文：** 用于两项后台定时能力：（1）用户创建的定时任务——按周期或指定时间自动运行 AI 任务，MV3 后台 Service Worker 空闲时会被回收，必须通过 alarms 定时唤醒才能按时触发；（2）在用户使用页面调试功能期间周期性唤醒后台，维持调试会话。不用于任何数据采集。
**English:** Used for two background timing capabilities: (1) user-created scheduled tasks that run AI tasks periodically or at specified times — the MV3 background service worker is terminated when idle, so alarms are required to wake it and trigger the tasks on time; (2) keeping the service worker alive while the user is using the page debugging feature. Not used for any data collection.

### debugger
**中文：** 用于用户主动调用的高级页面调试工具：当用户在对话中明确要求排查网页问题时，扩展可附着到当前标签页，录制网络请求/响应（含请求头与响应体）以帮助分析接口问题，并支持页面截图、模拟输入和设备模拟。附着期间标签页顶部会显示"扩展程序正在调试此浏览器"提示条，用户可随时取消，空闲 2 分钟自动脱离，浏览器内部页面（chrome://、扩展商店等）无法调试。日常页面操作（点击、填表、读取内容）不使用此权限。
**English:** Used for the user-invoked advanced page debugging tool: when the user explicitly asks (in chat) to troubleshoot a web page, the extension can attach to the current tab to record network requests/responses (including headers and bodies) for analyzing API issues, and to support page screenshots, input emulation and device emulation. While attached, the browser shows a visible "debugging this browser" infobar and the user can cancel at any time; the session detaches automatically after 2 minutes idle; browser-internal pages (chrome://, extension store, etc.) cannot be debugged. Everyday page actions (clicking, form filling, content reading) do not use this permission.

### webNavigation（Chrome 新增，Edge 文档未包含）
**中文：** 用于当 AI 读取页面或按用户请求操作页面元素时，枚举当前标签页的 iframe 帧结构，使扩展能把页面元素正确定位到所在框架并操作。仅在用户主动请求 AI 处理页面时查询该标签页的帧树；不监听导航事件、不记录或上传任何浏览历史。
**English:** Used to enumerate the iframe frame tree of the current tab when the AI reads the page or interacts with page elements at the user's request, so elements inside nested frames can be located and acted on correctly. The frame tree of a tab is queried only when the user explicitly asks the AI to work on that page; no navigation events are listened to, and no browsing history is recorded or uploaded.

### 主机权限（`<all_urls>`）
**中文：** 助手必须在用户选择的任意网站上工作，因为用户可能在任何页面唤起它。主机访问仅用于：（1）读取和提取用户要求 AI 处理的页面内容；（2）执行用户明确请求的页面操作（点击、填表、滚动）；（3）显示划词工具栏，对选中文本进行 AI 问答。所有操作均由用户主动发起，未经用户请求不会收集或上传任何数据。
**English:** The assistant must work on any website the user chooses, since users can invoke it on arbitrary pages. Host access is used only to: (1) read and extract page content the user asks the AI about; (2) execute page actions the user explicitly requests (click, fill forms, scroll); (3) show the text-selection toolbar for AI Q&A on selected text. All operations are user-initiated; no data is collected or uploaded without the user's request.

---

## 6. 隐私与数据披露（Privacy practices）

Chrome 商店 Privacy 标签页需要回答"扩展是否处理以下数据"。AI Helper **不把任何数据上传到扩展开发者服务器**，但会**在本地处理**下列数据，且会把对话内容发送**到用户自行配置的 LLM API**。按事实逐项声明如下：

| 数据类别 | 声明 | 理由（可粘贴） |
|---|---|---|
| Authentication information（API Key 等凭据） | Locally only / Not transferred | 用户配置的模型 API Key 仅保存在 chrome.storage.local，只随请求发往用户自己配置的模型端点，扩展开发者不接收、不存储。 |
| Website content（网页内容） | Locally only | 仅当用户主动要求 AI 读取/操作页面时，在本地提取所需的页面文本与元素，随该次对话发往用户自选的模型端点。 |
| Location / 其他 | 不勾选 | 扩展不处理此类数据。 |
| Active browser tabs / Browsing history | Locally only | 仅在用户调用标签页/历史相关工具时本地读取，用于返回结果给用户，不上传第三方。 |

其余勾选项：

- **Privacy policy URL：** `https://xiweicheng.github.io/ai-helper/privacy-policy.html`
  - ⚠️ 此链接**必须填在 Dashboard 中该条目「隐私权（Privacy）」标签页的指定字段**，不得放在产品说明/描述文案里（首次拒审参考 ID: Purple Nickel，即因未填指定字段）。
- **Single purpose：** 见第 4 节
- **User data 是否售卖/共享：** No（一切数据仅留在用户设备与用户自选的模型服务之间）

---

## 7. 图片素材清单（最终上传集）

已按 Chrome 商店硬性规格（1280×800 / 440×280 / 1400×560，24 位 PNG **无 alpha 通道**，每张 ≤ 5 MB）组装完毕，位于 **`docs/store-assets/chrome-upload/`**，全部逐张验证通过，可直接上传：

| 商店字段 | 规格 | 目录 | 数量 |
|---|---|---|---|
| 以当地语言显示的屏幕截图（zh-CN 列表） | 1280×800，1–5 张，无 alpha | `zh-screenshots/` | 5 |
| 全球通用的屏幕截图（英文界面） | 1280×800，1–5 张，无 alpha | `global-screenshots/` | 5 |
| 小型宣传图块 | 440×280，无 alpha | `promo/small-promo-{zh,en,alt}` | 3 选 1 |
| 顶部宣传图块 | 1400×560，无 alpha | `promo/large-promo-{zh,en,alt}` | 3 选 1 |
| 商店图标 | 128×128 PNG（图标允许透明） | `icons/icon128.png` | 1 |

**当地语言截图与全球通用截图一一对应（同一场景、仅界面语言不同，均出自 `docs/images/new/` 真实渲染截图）：** ①划词工具条 ②划词解释结果 ③侧边栏对话（竖版截图加品牌底色居中合成）④多智能体自定义配置 ⑤Token 用量统计（竖版合成）。`zh-screenshots/` 为中文界面版，`global-screenshots/` 为英文界面版；③⑤两侧为纯色品牌底，符合"无 alpha、无误导内容"要求。

宣传图块说明：`zh`/`en` 为现有真实界面合成版（推荐，与 Edge 商店共用），`alt` 为本次新生成的品牌风格版备选；`docs/store-assets/` 原素材保持不动。

---

## 8. 远程代码声明

与 Edge 版一致，Chrome MV3 政策对远程代码是**红线**：

- 所有 JavaScript（含 marked、mermaid、html2canvas、jspdf 等第三方库）均打包在扩展内随包分发，不远程加载或执行任何脚本。
- **jsPDF PDFObject 死代码已中和（首次 Blue Argon 拒审点）**：官方 jspdf 包在扩展未使用的 `pdfobjectnewwindow` 输出模式内内置了 cdnjs 上的 `pdfobject.min.js` URL，会被商店自动扫描命中。`scripts/fix-build.js` 的 `patchJsPDFRemoteCode` 会在每次构建后将 `dist/libs/jspdf.min.js` 中该死路径的远程 URL 替换为本地空 blob（扩展实际只用 `pdf.save()` 下载，功能不受影响）；当前仓内 `libs/jspdf.min.js` 也已同步打补丁。**勿在未经 AUDIT 的情况下用 npm 新版覆盖 `libs/jspdf.min.js`**，否则需重新核实该扫描信号。
- manifest CSP 为 `script-src 'self'`，机制上禁止远程脚本。
- 扩展仅有的网络请求是调用**用户自行配置**的 LLM API，传输 JSON 数据。
- 若审核追问 Skill 功能：Skill 仅为本地配置（提示词/工具编排描述），扩展不会把任何远程返回内容当作脚本执行。

---

## 9. 提交与审核注意事项

1. **注册开发者账号**：$5 一次性费用；Dashboard → Account 页补齐开发者名称与已验证联系邮箱，否则无法提交。
2. **打包**：`npm run package`（内部先 `build:silent`，并校验 `_locales` 与 `__MSG_` 键完整性），产物为根目录 `ai-helper@<版本>.zip`。切勿 Finder 右键压缩（会把 manifest 藏进 `dist/` 子目录）。被拒后重提必须上传**版本号更高的新包**（如 2.3.0 被拒 → 先按既有发布流程 bump 到 2.3.1 再打包）。提交前可自检：`grep -r "cdnjs" dist/` 应无任何命中。
3. **locale 代码**：`default_locale` 必须是 `zh_CN`（裸 `zh` 会被商店忽略并报"缺少 default_locale"），当前 manifest 已正确。
4. **`<all_urls>` + `debugger` + `webNavigation`** 是本扩展最可能被追问的三项，理由已强调"用户主动触发、不监听、不采集"。若 `debugger` 理由被拒，可先提交不含调试功能的版本（从 manifest 移除 `debugger`），过审后作为更新再加回。
5. **名称政策**：Item name 不得使用 "Chrome" 字样、不能全大写、避免与热门扩展撞名；本方案 "AI Helper" 已核查为通用组合词，若被判定与现有条目高度相似，备选名："AI Helper – Web Smart Assistant"。
6. **隐私政策 URL 必须先可访问**：提交前确认 `https://xiweicheng.github.io/ai-helper/privacy-policy.html` 返回 200（历史上大量拒审源于政策链接 404）。
7. **审核时长**：新开发者首次发布通常 1–7 个工作日；被拒后修改重提会重新排队，拒审邮件会给出政策条款编号。
8. **发布后**：可在 Dashboard 开启 "Trusted Tester" 组织自测；切 Public 前用不公开链接（chromewebstore.google.com/detail/<id>）在小范围验证一次完整安装流程。
