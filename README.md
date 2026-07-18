# AI Helper - 网页智能助手

> 基于大语言模型（LLM）的 Chrome 浏览器智能助手扩展。采用 ReAct（Reasoning + Acting）推理循环架构，支持自然语言对话、浏览器自动化操作、网页内容处理等 **50+ 项内建工具 + MCP 动态扩展**。可搭配本地代理服务实现文件系统操作、终端命令执行、Skill 技能系统和 MCP 协议扩展，同时具备多模态文件问答、图片识别与标注、长期记忆系统、任务断点续接恢复、Shadow DOM 深度穿透、会话导入/导出等高级能力。

## 为什么选择 AI Helper

AI Helper 是一个**深度集成浏览器能力**的智能助手，相比于普通的 Chat 类工具，它有几个关键差异化优势：

- **真正的浏览器操控能力**：不仅读取网页内容，还能**点击、填表、拖拽、滚动、等待元素、上传文件**——LLM 可以像人类一样操作网页。
- **三级质量保障体系**：创新的**预筛选 → 工具级反思 → 子任务反思 → 后置反思**多级机制，确保输出质量而非简单返回 LLM 原始结果。
- **Agent 多助手协作**：支持将复杂任务拆解为子任务，**分派给不同专业 Agent 并行处理**，实现真正的多 Agent 协作。
- **工具预筛选**：50+ 个工具定义会消耗大量 Token，AI Helper 在每次调用主力模型前用一次**轻量 API 预判**，将工具缩减为 5-10 个相关项，大幅节省成本。
- **Token 预算管理**：按模型上下文窗口动态计算可用 Token 预算，按 Token 数而非消息数进行智能截断，确保 tool_calls/tool 消息配对完整性。
- **上下文压缩**：长引用内容自动摘要压缩，避免无关信息永久占据上下文空间，保证对话质量不下滑。

| 特性 | 说明 |
|------|------|
| 平台 | Chrome / Edge / Chromium 系浏览器 |
| 扩展协议 | Manifest V3 |
| Chrome 版本要求 | 114+（需要 Side Panel API） |
| API 协议 | OpenAI Chat Completions 兼容（支持 Vision） |
| 构建工具 | Vite + @crxjs/vite-plugin |
| 本地 Agent | Node.js 18+ 独立进程，提供文件/命令/MCP/Skill 能力 |
| 多模态输入 | 图片识别（Vision API）+ 文件提取（PDF/Word/Excel，50+ 纯文本格式） |
| Skill 系统 | Workflow + Agent 两种技能类型，支持对话中沉淀技能 |
| MCP 协议 | Model Context Protocol，支持动态工具注册与多 Server 管理 |
| 多助手管理 | 自定义 Agent，内置 5 种角色模板，支持子任务分派 |
| 断点续接 | ReAct Checkpoint 系统，任务中断后一键恢复，7 天 TTL 自动过期 |
| 上下文管理 | 智能 Token 预算 + 三级压力监测 + 消息裁剪 + 引用压缩 |

## 功能预览

![AI Helper 功能预览](docs/images/ai-helper-promo.gif)

---

## 架构总览

项目采用 **五层架构**，通过 Chrome Extension API 的消息通道进行通信：

```
┌──────────────────────────────────────────────────────────────┐
│                   Side Panel (UI 层)                          │
│  side_panel.html + src/side_panel/*.js                        │
│  对话管理 | 多会话标签页 | Markdown/Mermaid 渲染 | 工具面板    │
│  提示词管理 | 划词问答 | 输入历史 | 执行日志 | 澄清/确认对话框 │
│  UI 原型预览 | 质量评估展示 | 消息目录 (TOC) | 会话归档       │
│  多助手管理 | Token 统计面板 | Agent 选择器 | @ Agent/网页切换  │
│  图片识别输入 | 图片标注编辑 | 文件上传提取 | 会话导出/导入    │
│  技能选择器 (Skill Tab) | MCP 服务选择器 (MCP Tab)            │
│  聊天导出 (Word/PDF) | 断点续接 | 消息复制                     │
└──────────────┬──────────────────────────────┬────────────────┘
               │  chrome.runtime.sendMessage   │
               ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│   Background Service      │    │     Options Page (配置层)      │
│   Worker (核心逻辑层)      │    │  options.html + src/options/   │
│                          │    │  API Key/模型/工具/ReAct参数   │
│  src/background/          │    │  反思系统/对话配置/工具栏      │
│  ├── index.js (消息路由)   │    │  Agent 配对连接管理           │
│  ├── react-loop.js (ReAct) │    │  工具箱 (MCP服务 + Skill管理) │
│  ├── react-reflection.js   │    └──────────────────────────────┘
│  ├── tool-executor.js      │
│  ├── tool-preselector.js   │    ┌──────────────────────────────┐
│  ├── local-agent-client.js │    │   代理服务 (可选层)           │
│  ├── config.js             │    │  agent/ (Node.js 独立进程)    │
│  ├── state.js              │    │  agent/ (Node.js 独立进程)    │
│  ├── agent-dispatcher.js   │    │  HTTP REST + WebSocket       │
│  ├── stream-controller.js  │    │  文件读写 | 命令执行 | 搜索   │
│  └── token-recorder.js     │    │  Skill 系统 | MCP 协议扩展   │
└──────────────┬─────────────┘    │  路径沙箱 | 安全分级          │
               │                   │  文件上传 API                │
               │  chrome.tabs.sendMessage                      │
               ▼                   └──────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│              Content Script (页面工具执行层)                    │
│  src/content/*.js (注入到用户浏览网页)                         │
│  ├── index.js (消息路由, 页面工具)                             │
│  ├── page-tools.js (页面内容提取, 无障碍树, Markdown 转换)     │
│  ├── page-interaction.js (可交互元素查询)                      │
│  ├── interaction-tools.js (交互操作, 语音合成, 取色器)         │
│  ├── advanced-tools.js (视频控制, 性能审计, Shadow DOM, 截图)  │
│  ├── shadow-dom-utils.js (Shadow DOM 递归穿透 + iframe)       │
│  └── selection-toolbar.js (划词浮动工具栏，类比豆包设计)       │
└──────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│              Offscreen Document (辅助能力层)                    │
│  src/offscreen/ (剪贴板操作支持)                               │
│  ├── offscreen.html + offscreen.js (copy_to_clipboard /       │
│  │   paste_from_clipboard 的 MV3 兼容实现)                    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   Storage (数据持久化层)                        │
│  src/storage/                                                 │
│  ├── db.js (IndexedDB 封装，事务重试、自动迁移、v4 多连接管理)│
│  ├── session-store.js (会话存储适配器)                         │
│  └── token-store.js (Token 统计存储)                          │
└──────────────────────────────────────────────────────────────┘
```

### 核心数据流

```
用户输入 → Side Panel (选择 Agent, 可选图片/文件附件, 可选 Skill/MCP, 可选 @网页上下文)
  → chrome.runtime.sendMessage('CALL_API')
    → Background: MCP 工具注入 → 工具预筛选 → ReAct 推理循环
      → Token 预算管理 → 上下文压力监测 → Token 统计记录
      → LLM API 调用 (OpenAI 兼容, 带重试和指数退避, 流式响应 + DeepSeek thinking)
        → 如需工具: 工具确认检查（敏感操作）→ 执行工具
          ├── Background 直接执行（标签页管理、书签搜索等）
          ├── 委派 Content Script（页面交互、内容提取等）
          ├── 委派本地 Agent（文件读写、命令执行、MCP 工具等）
          └── Offscreen 文档（剪贴板读写）
        → 工具级反思 → 结果缓存 → 反馈给 LLM
      → 子任务拆解与并行执行（plan_task 集成，支持 Agent 子任务分派）
      → Checkpoint 断点保存 → 后置反思：多维度质量评估 → 合格/修订/重试
    → chrome.runtime.sendMessage('API_COMPLETE')
  → Side Panel: Markdown 渲染, Mermaid 图表渲染, 质量评估展示, Token 统计更新
```

---

## 项目结构

```
ai-helper/
├── agent/                               # 代理服务（Node.js 独立进程）
│   ├── bin/agent.js                     # CLI 启动脚本
│   ├── src/
│   │   ├── server.js                    # HTTP + WebSocket 服务端
│   │   ├── executor.js                  # 命令执行引擎（流式/阻塞）
│   │   ├── security.js                  # 路径沙箱 + 命令安全分级
│   │   ├── config.js                    # Agent 配置（磁盘持久化）
│   │   ├── auth.js                      # 配对认证（4 位动态码）
│   │   ├── search.js                    # 文件/内容搜索（fd/rg 加速）
│   │   ├── logger.js                    # 结构化日志
│   │   ├── skill/                       # Skill 系统
│   │   │   ├── loader.js               # Skill 加载器（JSON/YAML/SKILL.md）
│   │   │   ├── registry.js             # Skill 注册表
│   │   │   ├── executor.js             # Workflow Skill 执行器
│   │   │   ├── markdown-loader.js      # Agent Skill 加载器（SKILL.md）
│   │   │   └── template.js             # Skill 模板
│   │   └── mcp/                         # MCP 协议支持
│   │       ├── client.js               # MCP Client（JSON-RPC 2.0）
│   │       ├── registry.js             # MCP Server 注册表
│   │       ├── transport.js            # Stdio 传输层
│   │       └── mcp-config.js           # MCP 配置管理
│   └── package.json
├── icons/                               # 扩展图标
│   ├── icon16.png / icon48.png / icon128.png
│   └── README.md
├── libs/                                # 第三方依赖（CDN/local 引入）
│   ├── marked.min.js                    # Markdown 渲染引擎
│   ├── mermaid.min.js                   # Mermaid 图表渲染引擎
│   ├── qrcode.min.js                    # 二维码生成库
│   ├── pdf.worker.min.js               # PDF.js Worker (PDF 提取)
│   └── github-markdown-light.min.css    # GitHub 风格 Markdown 样式
├── scripts/                             # 构建工具脚本
│   ├── fix-build.js                     # 修复 @crxjs/vite-plugin 打包产物
│   ├── silent-build.js                  # 静默构建（CI 友好，仅失败输出）
│   ├── generate-icons.js                # 图标生成脚本
│   └── deploy-pages.sh                  # Pages 部署脚本
├── styles/
│   └── styles.css                       # Content Script 浮框样式
├── src/                                 # 扩展源码
│   ├── background/                      # Background Service Worker
│   │   ├── index.js                     # 入口：消息路由、会话管理、Agent 健康监测
│   │   ├── react-loop.js               # ReAct 推理循环（核心引擎，含三级反思系统）
│   │   ├── react-reflection.js         # 三级反思系统（后置反思、工具级反思、子任务反思）
│   │   ├── tool-executor.js            # 工具定义注册、执行调度、MCP 动态注入
│   │   ├── tool-preselector.js         # 工具预筛选（轻量 API 提前过滤）
│   │   ├── local-agent-client.js       # 本地 Agent HTTP/WebSocket 通信
│   │   ├── agent-dispatcher.js         # Agent 子任务分发器
│   │   ├── stream-controller.js        # 流式响应控制器（SSE 解析 + DeepSeek thinking）
│   │   ├── token-recorder.js           # Token 使用统计记录器
│   │   ├── config.js                    # 配置读写
│   │   ├── constants.js                # 默认配置、50+ 个内建工具定义、分类映射
│   │   ├── state.js                    # 多会话取消控制、API 计数器
│   │   └── tools/                       # 工具定义分目录
│   │       ├── browser-tools.js        # 页面交互 + 表单操作 + 内容提取 (17)
│   │       ├── tab-tools.js            # 标签页管理 + 书签历史 (8)
│   │       ├── storage-tools.js        # 存储管理 + 网络请求 (4)
│   │       ├── media-tools.js          # 媒体输出 + 调试开发 (7)
│   │       ├── ai-tools.js             # AI 协作 (6)
│   │       ├── agent-tools.js          # 本地代理 (9)
│   │       ├── memory-tools.js         # 长期记忆 (3)
│   │       ├── tool-clipboard.js       # 剪贴板 + 页面内容合并定义
│   │       ├── tool-memory.js          # 长期记忆工具 handler
│   │       ├── tool-network.js         # fetchWithTimeout + fetchWithRetry
│   │       └── tool-screenshot.js      # 截图工具 handler
│   ├── content/                         # 页面注入脚本
│   │   ├── index.js                     # 入口：消息路由分发
│   │   ├── page-tools.js               # 页面内容工具（提取、搜索、无障碍树等）
│   │   ├── page-interaction.js         # 可交互元素查询（query_interactive_elements）
│   │   ├── interaction-tools.js        # 交互工具（点击、填表、语音合成等）
│   │   ├── advanced-tools.js           # 高级工具（视频、性能审计、Shadow DOM 等）
│   │   ├── shadow-dom-utils.js         # Shadow DOM 递归穿透 + 同源 iframe
│   │   └── selection-toolbar.js        # 划词浮动工具栏（类比豆包设计）
│   ├── offscreen/                       # Offscreen 文档（剪贴板操作）
│   │   ├── offscreen.html              # Offscreen 页面
│   │   └── offscreen.js                # Clipboard API 桥接
│   ├── side_panel/                      # 侧边栏 UI
│   │   ├── index.js                     # 入口：事件绑定、配置管理、键盘快捷键
│   │   ├── chat-manager.js             # 对话管理（发送/接收、执行日志、导出/导入）
│   │   ├── chat-streaming.js           # 流式输出处理（STREAM_START/CHUNK/DONE）
│   │   ├── chat-panels.js              # 执行日志面板 + 反思信息展示
│   │   ├── chat-resume.js              # 任务断点续接（Resume Checkpoint）
│   │   ├── chat-export.js              # 聊天多格式导出（Word/PDF/图片）
│   │   ├── chat-copy.js                # 消息复制功能
│   │   ├── markdown-render.js          # Markdown/Mermaid 渲染与交互控制
│   │   ├── tool-panel.js               # 工具选择弹窗（分类筛选、搜索、MCP 实时监听）
│   │   ├── prompt-manager.js           # 提示词管理（CRUD、快速选择、拖拽排序）
│   │   ├── agent-manager.js            # Agent 多助手管理 UI
│   │   ├── agent-store.js              # Agent 数据持久化存储
│   │   ├── agent-at-selector.js        # Agent @ 选择器（助手 Tab + 网页 Tab）
│   │   ├── page-selector.js            # @ 网页选择器（列出当前标签页注入上下文）
│   │   ├── token-stats-panel.js        # Token 统计面板
│   │   ├── session-manager.js          # 多会话存储 API
│   │   ├── session-manager-ui.js       # 会话标签页 UI（切换、重命名、归档）
│   │   ├── clarify-dialog.js           # 澄清对话框（倒计时、音频提醒）
│   │   ├── confirm-dialog.js           # 敏感操作确认对话框
│   │   ├── ui-prototype.js             # UI 原型预览与管理（缩放、下载、库）
│   │   ├── message-toc.js              # 消息目录（自动生成导航栏）
│   │   ├── input-history.js            # 输入历史（上下箭头回填）
│   │   ├── image-preview.js            # 图片预览、压缩、多图切换、标注编辑
│   │   ├── image-helpers.js            # 图片可见性检测、缩略图、截图按钮
│   │   ├── file-extract.js             # 文件提取（PDF/Word/Excel/Text，50+ 格式）、Agent 上传
│   │   ├── skill-selector.js           # 技能/MCP 服务快捷选择器
│   │   ├── export-import.js            # 会话导出/导入（批量选择、格式校验）
│   │   ├── execution-log-render.js     # 执行日志渲染（任务组、实时模式）
│   │   ├── icons.js                     # 共享 SVG 图标常量
│   │   ├── state.js                     # 全局状态管理（Proxy 双导出模式）
│   │   ├── utils.js                     # 工具函数（Toast、系统提示词构建等）
│   │   └── constants.js                # 温度预设、工具分类名
│   ├── options/                         # 扩展选项页
│   │   ├── index.js                     # 入口：标签页切换、表单事件、Agent 配对
│   │   ├── config-manager.js           # 配置读写管理
│   │   ├── config-io.js                # 配置导入/导出
│   │   ├── toolbar-config.js           # 工具栏配置（拖拽排序、域名屏蔽）
│   │   ├── toolbox-config.js           # 工具箱配置入口
│   │   ├── toolbox-shared.js           # 工具箱共享状态与辅助函数
│   │   ├── toolbox-mcp.js              # MCP 服务器管理（增删改查、连接、环境变量）
│   │   ├── toolbox-skills.js           # Skill 管理（分类展示、导入、编辑器）
│   │   └── constants.js                # 默认系统提示词与配置常量
│   ├── storage/                         # IndexedDB 持久化层
│   │   ├── db.js                        # IndexedDB 封装（事务重试、自动迁移）
│   │   ├── session-store.js            # 会话存储适配器
│   │   └── token-store.js              # Token 统计存储
│   ├── config/
│   │   └── constants.js                # Storage 键名、消息类型等
│   └── shared/                          # 共享模块
│       ├── tools.js                     # 工具分类、温度预设
│       ├── utils.js                     # 通用工具函数（makeResult 标准化等）
│       ├── token-counter.js            # Token 计数、预算管理、上下文压缩、消息摘要
│       └── agent-defaults.js           # 内置 Agent 定义和模板
├── manifest.json                        # Chrome 扩展配置
├── side_panel.html                      # 侧边栏 HTML
├── options.html                         # 选项页 HTML
├── vite.config.js                       # Vite 构建配置
├── package.json
└── README.md
```

---

## 核心功能

### 1. 多模态输入

#### 图片识别输入
支持在对话中附加图片，通过 Vision API（OpenAI 兼容）进行多模态理解和问答：

- **图片压缩**：自动压缩大图（1024px + JPEG 65%），减少 Token 消耗
- **独立 API 配置**：支持为图片识别配置独立的 API Base / API Key / 模型
- **全局开关**：可随时开启/关闭图片输入功能
- **多图上传**：同时附加多张图片进行对比分析

#### 文件上传问答
在浏览器端直接上传文件并提取内容，无需依赖 Agent 服务也可使用：

- **支持格式**：
  | 格式 | 提取引擎 | 说明 |
  |------|----------|------|
  | PDF | PDF.js (pdfjs-dist) | 完整文本提取，支持多页 |
  | Word (.docx) | mammoth.js | 富文本转纯文本 |
  | Excel (.xlsx/.xls) | SheetJS (xlsx) | 多 Sheet CSV 导出 |
  | 纯文本 | FileReader API | 50+ 扩展名自动识别 |
- **Agent 优先上传**：连接 Agent 后自动上传至工作目录，支持大模型直接操作原始文件
- **浏览器降级**：Agent 不可用时自动切换为浏览器端提取
- **文件预览栏**：显示文件名、大小、提取状态、支持删除

#### 图片标注编辑器
内建完整的图片标注能力，可直接在预览中编辑图片后发送：

- **6 种标注工具**：画笔 (B)、矩形 (R)、椭圆 (E)、箭头 (A)、直线 (L)、橡皮擦
- **颜色/粗细/透明度**可调
- **Undo 支持**（最多 20 步，Ctrl+Z）
- **键盘快捷键**：Enter 确认、Esc 取消
- **编辑后自动更新**：标注结果立即更新到附件列表

### 2. 多助手管理（Agent 系统）

支持创建和管理多个自定义 AI 助手，每个助手拥有独立的系统提示词和工具权限：

- **内置模板**：默认助手、代码审查专家、网页自动化助手、数据分析师、文档撰写助手
- **自定义 Agent**：创建专属助手，设置图标、名称、系统提示词、模型、温度和工具权限
- **Agent 选择器**：侧边栏顶部快速切换，支持 `@Agent名称` 快速切换
- **工具过滤**：每个助手可配置独立的工具集，避免上下文膨胀
- **子任务分派**：`dispatch_sub_agent` 支持并行分派，子 Agent 独立执行并返回结果
- **Agent 持久化**：基于 `chrome.storage.local`，跨重启保持

### 3. ReAct 推理循环

项目采用 ReAct（Reasoning + Acting）模式作为核心推理引擎：

1. **MCP 工具动态注入**：每次推理前自动从 Agent 拉取最新的 MCP 工具列表，注入到 RAW_TOOLS 中
2. **工具预筛选**：正式调用主力模型前，用一次轻量 API 调用判断需要哪些工具，将 50+ 个工具缩减为 5-10 个相关工具，大幅减少 Token 消耗。简单问题可直接回答跳过推理循环
3. **推理循环**：LLM 思考 → 决定调用工具 → 执行工具 → 结果反馈 → 继续推理
4. **Token 预算管理**：按模型上下文窗口动态计算可用 Token 预算（80%），按 Token 数截断，保留 tool_calls/tool 消息配对完整性
5. **上下文压力监测**：三级监测（safe / warning / critical），自动触发摘要压缩
6. **上下文智能压缩**：对长引用内容自动生成摘要压缩，避免永久占据上下文空间
7. **工具结果缓存**：并行工具结果自动缓存（上限 30 条）
8. **并行工具执行**：同一轮中标记为可并行的工具通过 `Promise.all` 并发执行
9. **任务拆解**：`plan_task` 支持顺序、并行、条件三种执行策略，子任务失败支持重试/回滚/继续
10. **子任务分发**：`dispatch_sub_agent` 支持将子任务委派给其他 Agent 并行执行
11. **流式响应**：支持 OpenAI 流式响应，可配置字符间延迟（模拟打字效果）
12. **澄清机制**：信息不完整时弹出澄清对话框，循环计时自动暂停，支持推荐选项
13. **多级超时控制**：API 超时 5min、工具超时 10min、整体循环超时 30min
14. **取消控制**：用户可随时取消推理循环，按会话隔离
15. **SW 重启恢复**：Keepalive 端口监测 SW 静默重启，自动通知 Side Panel 恢复。后台任务状态持久化到 `chrome.storage.session`
16. **Checkpoint 断点**：每轮推理后自动保存 Checkpoint，支持任务中断后恢复继续执行

### 4. 反思系统（多级质量保障）

| 级别 | 说明 | 触发条件 |
|------|------|----------|
| **工具级反思** | 工具执行后快速评估结果是否有用 | 工具返回错误 / 空结果 / 结果过大(>50000字符) / 连续 3 次失败 |
| **子任务反思** | 评估子任务结果完整性和相关性 | 仅标记为 complex 的子任务（可配置） |
| **后置反思** | 最终答案 7 维度质量评分 | 每轮推理完成后自动执行 |

后置反思评分维度：完整性、准确性、相关性、工具使用、清晰度、安全性、效率。根据评分阈值自动决定：通过 (≥7)、修订 (5-7)、或重新执行 (<5)。

### 5. 上下文压缩与 Token 预算管理

从 v1.0 开始引入的智能上下文管理策略：

- **自适应 Token 估算**：中文字符 ~1.5 chars/token，英文 ~4 chars/token
- **上下文窗口自动检测**：根据模型名自动推断上下文窗口（支持自定义映射）
- **消息预算 = 上下文窗口 - 系统提示词 - 工具定义 - 输出预留**
- **上下文压力三级监测**：safe / warning / critical
- **消息摘要**：压力达到 critical 时自动对早期消息生成摘要，替代原始内容
- **引用压缩**：长引用/选中内容自动压缩为摘要，避免永久占据上下文
- **Token 级别截断**：70% 开头 + 30% 结尾 + 截断标记
- **流式输出配置**：可配置字符间渲染延迟（0=瞬间，适合高网速场景）

### 6. Token 统计面板

- **实时统计**：每次 API 调用后更新 Token 消耗
- **会话统计**：当前会话累计消耗、平均每轮消耗
- **今日统计**：当日累计消耗、调用次数
- **历史记录**：最近 7 天的 Token 使用历史

### 7. Skill 系统

支持两种类型的技能，覆盖确定性自动化和 AI 自主调用场景：

- **Workflow Skill**：基于 JSON/YAML 定义的确定性工作流，带参数验证和执行结果展示
- **Agent Skill**：基于 SKILL.md 的 AI 能力扩展，AI 在对话中自主调用
- **内置技能**：`skill-creator` 元技能，支持从对话中自动创建新技能
- **快捷选择器**：输入框下拉框中新增「技能」Tab，可快速搜索和选择技能
- **导入方式**：支持 JSON 文件、直接编写 Markdown、Zip 包（含资源）、URL 下载四种导入方式
- **Skill 编辑器**：可视化编辑 SKILL.md 内容，支持描述、版本和资源管理
- **全局开关**：选项页工具箱中可一键启用/停用所有 Skill

### 8. MCP 协议扩展

支持 Model Context Protocol（MCP），动态扩展第三方工具能力：

- **MCP 工具动态注入**：每次推理前从 Agent 自动拉取最新的 MCP 工具列表并注入
- **MCP Client**：JSON-RPC 2.0 通信，支持 stdio 传输
- **MCP Server 管理**：在选项页「工具箱」Tab 中可视化配置、连接、断开
- **环境变量支持**：每个 MCP Server 可独立配置环境变量，敏感值密码输入框
- **多 Server 支持**：同时连接多个 MCP Server，工具自动合并、按 Server 分组
- **全局开关**：一键启用/停用所有 MCP 服务
- **快捷选择器**：输入框下拉框中「MCP」Tab，可快速选择特定 MCP 服务

### 9. 多会话管理

- **标签页切换**：水平标签栏，自动恢复消息历史、模型、工具和温度配置
- **会话创建**：一键创建，自动生成标题（取首条用户消息）
- **会话重命名/删除**：右键菜单操作
- **会话归档/恢复**：最多保留 20 个归档，可随时恢复
- **跨会话消息投递**：后台任务完成时自动追加到原始会话
- **持久化存储**：基于 IndexedDB，自动从旧版 `chrome.storage.local` 迁移
- **会话导出/导入**：支持批量选择导出为 `.aihelper.json`，兼容新版/旧版格式导入

### 10. 会话导出/导入

- **批量导出**：弹窗中选择多个会话，支持全选/反选/仅选当前
- **导出格式**：`.aihelper.json`，包含完整消息历史、执行日志、反射评分、HTML 内容、Agent 配置
- **导入兼容**：支持新版 `.aihelper.json` 格式和旧版消息数组格式
- **智能文件名**：单会话导出以会话名命名，多会话以数量+时间戳命名

### 11. Side Panel 对话面板

- **自然语言对话**：支持 OpenAI 兼容 API，默认 DeepSeek V4 Pro
- **模型切换**：内置 DeepSeek 系列，支持自定义模型增删和上下文窗口映射
- **温度调节**：4 档预设（精准严谨 0.2 / 日常通用 0.45 / 思路发散 0.65 / 创意脑暴 0.9），支持连续微调
- **记忆限制**：可配置发送给 LLM 的历史消息条数
- **隔离对话**：不联系前文模式
- **划词问答**：侧边栏内选中文本自动弹出快捷菜单
- **提示词系统**：自定义提示词 CRUD，`/` 快速选择，拖拽排序
- **输入历史**：上下箭头快速回填，去重自动管理
- **系统提示词**：自动注入环境信息（Chrome 扩展、OS、Agent 平台），强制附加任务规划规则

### 12. Markdown 与 Mermaid 渲染

- 完整 Markdown 支持：代码块（带行号、复制按钮、语言标签）、表格（可导出 Excel/复制 Markdown）、引用、列表
- **三阶段占位符策略**：Mermaid → 代码块 → 表格依次提取占位，渲染后恢复
- Mermaid 图表：流程图、时序图、甘特图等，缩放（Ctrl+滚轮）、拖拽平移、下载 PNG、复制到剪贴板、查看源码
- **表格单元格内联 Markdown**：支持粗体、斜体、代码、删除线

### 13. UI 原型预览系统

- **内联预览**：iframe `srcdoc` 渲染，自动检测完整文档 vs 片段
- **缩放控制**：0.25x-2.0x，Ctrl+滚轮 / Ctrl+0 重置
- **原型页面库**：保存到 IndexedDB，支持打开/编辑/删除
- **导出**：下载 .html 文件，或在新标签页打开
- **继续优化**：一键将优化指令填入输入框

### 14. 消息操作

| 操作 | 说明 |
|------|------|
| 复制消息 | 复制原始 Markdown 内容 |
| 编辑重发 | 将消息回填到输入框 |
| 引用追问 | 将助手消息设为引用上下文（自动压缩摘要） |
| 导出 Word | Markdown 转样式化 .doc 下载（Mermaid 图表预渲染为图片） |
| 导出 PDF | 浏览器打印窗口导出 |
| 导出图片 | 消息渲染为图片下载 |
| 导出 JSON | 完整对话历史（含执行日志）JSON 下载 |

### 15. 选中文本浮动工具栏

在任意网页选中文本后，自动弹出毛玻璃风格浮动工具栏：

- **AI 搜索**：打开侧边栏并发起搜索
- **快速操作**：解释、翻译、总结
- **自定义工具**：可添加自定义提示词工具，支持拖拽排序
- **追问输入框**：内联输入框直接追问
- **结果面板**：可拖拽、可缩放浮动面板，Markdown 渲染，锁定功能防止关闭
- **建议追问**：AI 返回中自动生成追问按钮
- **配置项**：图标精简模式、直接显示数量、域名屏蔽、临时隐藏

### 16. 执行日志面板

- **实时模式**：推理进行中实时更新，脉冲动画指示执行状态
- **静态模式**：完成后展示完整执行时间线
- **任务组可视化**：复杂任务按任务组分组展示，支持折叠/展开
- **节点详情**：工具名、状态、耗时、输入参数、输出内容、API 请求详情
- **汇总统计**：总节点数、成功/失败数、子任务进度
- **状态过滤**：按成功/失败/子任务筛选
- **单条展开**：点击标题展开/折叠单条详情

### 17. 质量评估展示

后置反思结果的可视化：

- **总体评分**：0-10 分，颜色编码（绿/黄/红）+ emoji
- **7 维度雷达**：每维度独立进度条
- **问题发现**：具体问题和改进建议
- **评估过程**：轮数、决策、推理详情

### 18. 消息目录 (TOC)

悬停助手消息时自动生成浮动导航：

- 自动提取 H1-H6 标题
- 浮动面板，平滑滚动到目标位置
- 1.5s 高亮闪烁效果

### 19. 长期记忆系统

AI Helper 具备长期记忆能力，可以跨会话存储和检索用户信息：

- **记忆存储**：AI 自动识别对话中的重要信息（偏好、知识、决策），主动调用 `agent_memory_store` 存储
- **记忆类型**：支持事实记忆（fact）和对话摘要（summary）两种类型
- **智能检索**：通过 `agent_memory_recall` 按关键词、标签、类型搜索历史记忆
- **记忆管理**：自动审查记忆质量（review），合并重复记忆，淘汰低价值记忆（compact）
- **标签分类**：偏好、知识、决策、自定义四类标签体系
- **重要性评分**：1-10 分，帮助记忆系统做优先级排序
- **自动归档**：facts 上限 50 条，summaries 上限 20 条，超出自动触发压缩清理

### 20. ReAct Checkpoint 断点续接

任务执行过程中自动保存检查点（Checkpoint），支持中断后一键恢复：

- **自动保存**：每轮 ReAct 推理完成后自动保存 Checkpoint 到 IndexedDB
- **SW 重启恢复**：Service Worker 静默重启后通过 `chrome.storage.session` 自动恢复状态
- **手动恢复**：中断任务的消息卡片显示「继续执行」按钮，点击可追加描述并恢复执行
- **流式输出保留**：恢复后的流式输出完整保存到消息历史，刷新页面不丢失
- **TTL 自动过期**：Checkpoint 保存 7 天后自动清理，避免数据堆积
- **多连接管理**：IndexedDB 支持 SW + Side Panel 双连接安全关闭与重建

### 21. @ 网页 Tab 选择器

输入框中输入 `@` 后弹出的选择器新增「网页」Tab，支持快速选择当前浏览器标签页作为对话上下文：

- **标签页列表**：列出当前窗口所有打开的标签页，显示 favicon、标题、URL
- **当前页标记**：高亮标记当前活跃标签页
- **关键词过滤**：支持按标题/URL 快速筛选
- **上下文注入**：选择页面后自动将其内容注入为对话上下文
- **动态数量显示**：Tab 标题实时显示选项数量（如「助手 (5)」「网页 (12)」）

### 22. Shadow DOM 深度穿透

支持递归穿透 Shadow DOM 和同源 iframe 进行元素查找和操作：

- **递归穿透**：`deepQuerySelector` / `deepQuerySelectorAll` 可穿透多层 Shadow DOM（最大深度 5 层）
- **iframe 支持**：自动进入同源 iframe 内部进行查找
- **可见性检测**：严格可见性判断（display/visibility/opacity/尺寸）
- **React 组件支持**：`keyboard_input` 绕过 React 合成事件系统，`fill_form` 支持 contenteditable/prosemirror 等富文本编辑器

---

## 内建工具（50+ 项可配置 + MCP 动态扩展）

### 内容提取（7 个）
| 工具 | 说明 |
|------|------|
| `get_page_content` | 获取页面内容（text/html/markdown/json 多格式，支持跨标签页提取） |
| `extract_data` | 提取结构化数据（table/links/forms/images/metadata，支持跨标签页） |
| `query_interactive_elements` | 提取可交互元素（推荐优先使用，省 Token，支持 countOnly 模式） |
| `search_in_page` | 正则搜索页面文本（支持高亮） |
| `find_similar_elements` | 查找相似结构元素 |
| `get_iframe_content` | 获取 iframe 内容（同源，支持嵌套） |
| `scroll_and_collect` | 滚动收集长内容（去重聚合） |

### 页面交互（6 个）
| 工具 | 说明 |
|------|------|
| `click_element` | 点击元素（CSS 选择器，自动清洗引号） |
| `hover_element` | 鼠标悬停 |
| `drag_and_drop` | 拖拽操作 |
| `scroll_to` | 滚动到指定位置/元素（支持对齐方式） |
| `wait_for_element` | 等待元素出现/消失（严格可见性检测） |
| `wait_for_navigation` | 等待页面跳转完成（支持 load/domcontentloaded/networkidle） |

### 表单与输入（4 个）
| 工具 | 说明 |
|------|------|
| `fill_form` | 批量填表（支持富文本编辑器/contenteditable） |
| `keyboard_input` | 键盘输入（绕过 React 受控组件） |
| `file_upload` | 文件上传（DataTransfer 注入） |
| `select_dropdown` | 下拉菜单选择（原生 select + 自定义组件） |

### 标签页管理（6 个）
| 工具 | 说明 |
|------|------|
| `open_tab` | 打开新标签页 |
| `switch_tab` | 切换标签页 |
| `close_tab` | 关闭标签页（需确认） |
| `get_tabs` | 获取所有标签页列表 |
| `navigate_back_forward` | 前进/后退导航 |
| `reload_tab` | 刷新标签页 |

### 书签与历史（2 个）
| 工具 | 说明 |
|------|------|
| `search_bookmarks` | 搜索浏览器书签 |
| `search_history` | 搜索浏览器历史记录 |

### 存储管理（3 个）
| 工具 | 说明 |
|------|------|
| `manage_cookies` | Cookie 管理（CRUD，需确认） |
| `manage_storage` | localStorage/sessionStorage 管理 |
| `clear_page_data` | 一键清除站点数据（需确认） |

### 网络请求（1 个）
| 工具 | 说明 |
|------|------|
| `fetch_url` | HTTP 请求（支持超时、重试、指数退避、AbortSignal 取消传播） |

### 媒体与输出（5 个）
| 工具 | 说明 |
|------|------|
| `capture_page` | 页面截图（支持可视区/全页/下载/视觉分析四种模式） |
| `clipboard` | 剪贴板操作（复制/粘贴/获取页面选中文本） |
| `generate_qrcode` | 生成二维码（QRCode 库 + Canvas 降级） |
| `download_file` | 下载文件（需确认） |
| `show_notification` | 桌面通知 |

### 调试与开发（2 个）
| 工具 | 说明 |
|------|------|
| `inject_css` | 注入 CSS 样式（全局/作用域/内联） |
| `get_browser_info` | 获取浏览器环境信息 |

### AI 协作（6 个）
| 工具 | 说明 |
|------|------|
| `clarify_question` | 弹出澄清对话框（推荐选项、倒计时、音频提醒） |
| `plan_task` | 复杂任务拆解规划（支持并行/顺序/条件执行） |
| `preview_ui_prototype` | UI 原型预览与管理（支持 preview/get 两种 action） |
| `search_conversation_memory` | 搜索对话记忆（当前会话 / 所有历史会话） |
| `dispatch_sub_agent` | 子任务分派给子 Agent 执行（支持并行分派） |
| `highlight_text` | 高亮页面文本 |

### Agent（9 个）—— 需安装代理服务
| 工具 | 说明 |
|------|------|
| `agent_read_file` | 读取本地文件（路径沙箱，大小限制） |
| `agent_write_file` | 写入本地文件（脚本自动去执行权限） |
| `agent_list_dir` | 列出目录内容 |
| `agent_delete_file` | 删除本地文件/目录（需确认） |
| `agent_exec_command` | 执行终端命令（黑/灰/白名单三级安全，支持 force/timeout） |
| `agent_search_files` | 按文件名搜索（fd 加速） |
| `agent_search_content` | 在文件中搜索文本（ripgrep 加速） |
| `agent_skill_load` | 按需加载 Agent Skill 的完整说明文档 |
| `agent_skill_run` | 执行预定义的 Workflow Skill 工作流 |

### 长期记忆（3 个）—— 需安装代理服务
| 工具 | 说明 |
|------|------|
| `agent_memory_store` | 存储/更新/删除长期记忆（偏好、知识、决策、摘要） |
| `agent_memory_recall` | 按关键词或标签检索已存储的记忆 |
| `agent_memory_manage` | 审查记忆质量、合并重复、淘汰低价值记忆 |

### MCP 工具（动态扩展）
通过 MCP 协议连接第三方工具服务器后，工具会自动注册到系统中。数量取决于连接的 MCP Server。

### 敏感工具安全确认

以下工具操作前会弹出确认对话框（30 秒超时自动拒绝，可全局关闭）：

- `close_tab`、`download_file`、`manage_cookies`、`clear_page_data`
- `agent_delete_file`、`agent_exec_command`

Agent 命令执行三级安全：
1. **黑名单**（始终禁止）：`rm -rf /`、`mkfs.*`、fork 炸弹、curl-to-shell 管道等
2. **灰名单**（需确认）：`sudo`、`npm install -g`、`chmod -R 777`、`git push --force` 等
3. **白名单**（直接放行）：常规命令

---

## 技术栈

| 技术 | 说明 |
|------|------|
| Vite + @crxjs/vite-plugin | 构建工具链，ES Module，开发 HMR |
| Manifest V3 | 最新 Chrome 扩展协议 |
| Service Worker | 后台进程，API 调用和工具执行 |
| Side Panel API | Chrome 114+ 侧边栏 |
| Content Script | 页面注入，DOM 操作 |
| Offscreen Document | MV3 剪贴板操作兼容层 |
| IndexedDB | 会话/原型/Token 统计持久化 |
| chrome.storage.local | 配置存储、Agent 定义存储 |
| chrome.storage.session | 跨重启消息恢复、后台任务持久化 |
| chrome.debugger API | CDP 截图/PDF 导出 |
| OpenAI Compatible API | LLM 调用（含 Vision），默认 DeepSeek V4，支持流式响应 |
| marked.js | Markdown 渲染引擎 |
| mermaid.js | 图表渲染引擎 |
| QRCode.js | 二维码生成（Canvas 降级） |
| pdfjs-dist | PDF 文件文本提取 |
| mammoth.js | Word .docx 文件文本提取 |
| SheetJS (xlsx) | Excel .xlsx/.xls 文件文本提取 |
| Web Speech API | 文本语音合成 |
| EyeDropper API | 取色器 |
| Navigation/Performance API | 性能审计 |
| Node.js (Agent) | 本地文件/命令服务、Skill 系统、MCP 协议 |
| WebSocket (Agent) | 命令输出实时流 |
| MCP Protocol | Model Context Protocol，扩展第三方工具 |

---

## 代理服务

扩展可选配一个 Node.js 代理服务，提供浏览器沙箱之外的文件系统、终端命令、Skill、MCP 和文件上传能力。

### Agent 架构

```
┌─────────────────────────────────┐
│   Chrome Extension (Background)  │
│   local-agent-client.js          │
│   HTTP REST + WebSocket          │
└──────────────┬──────────────────┘
               │ 127.0.0.1:18910
               ▼
┌─────────────────────────────────┐
│   ai-helper-agent (Node.js)      │
│   ├── HTTP API                   │
│   │   ├── /api/fs/* (文件 CRUD)   │
│   │   ├── /api/files/upload (上传)│
│   │   ├── /api/exec (命令执行)    │
│   │   ├── /api/status (健康检查)  │
│   │   ├── /api/pair (配对认证)    │
│   │   ├── /api/logs (日志查询)    │
│   │   ├── /api/shutdown (优雅关闭)│
│   │   ├── /api/skill/* (技能管理) │
│   │   └── /api/mcp/* (MCP 管理)   │
│   ├── WebSocket (命令输出流)      │
│   ├── Skill 系统                  │
│   │   ├── Workflow Skill 执行器   │
│   │   └── Agent Skill 加载器      │
│   ├── MCP 协议扩展               │
│   │   ├── MCP Client 管理        │
│   │   └── JSON-RPC 2.0 通信      │
│   └── 安全层                      │
│       ├── Bearer Token 认证       │
│       ├── 路径沙箱（realpath）    │
│       └── 命令黑/灰/白名单        │
└─────────────────────────────────┘
```

### Agent 核心特性

- **配对认证**：4 位动态码 + extensionId 配对，生成 Bearer Token
- **路径沙箱**：`realpathSync` 解析符号链接，前缀匹配白名单路径
- **命令安全**：环境变量白名单（约 40 个），`TERM=dumb` 禁用互动
- **脚本保护**：写入 `.sh`/`.py`/`.js` 等自动去除执行权限
- **大小限制**：请求体 10MB，单文件 50MB
- **并发安全**：磁盘写入互斥锁，优雅关闭防双重关闭
- **配置缓存**：mtime 检测，避免重复读盘

### Skill 系统（Agent 端）

| 类型 | 定义格式 | 执行方式 | 用途 |
|------|----------|----------|------|
| **Workflow Skill** | JSON/YAML | 直接执行 | 自动化流程，按步骤执行，支持条件跳过 |
| **Agent Skill** | SKILL.md | AI 自主调用 | 知识沉淀，在对话中触发 |

导入方式：JSON 上传 / 在线编写 Markdown / Zip 包（含辅助资源）/ URL 下载

### MCP 协议（Agent 端）

- **MCP Client**：基于 JSON-RPC 2.0，stdio 传输
- **自动发现**：连接后自动获取工具列表
- **多 Server**：同时连接多个，工具自动合并
- **动态注入**：每次推理前自动同步最新工具列表

### 启动 Agent

```bash
cd agent
npm install
npm start
# 默认监听 127.0.0.1:18910
```

在扩展选项页的「Agent」标签页中填入配对码完成连接。

---

## 快速开始

### 开发模式

```bash
npm install
npm run dev
```

Chrome 中：
1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目 `dist` 文件夹
5. 修改源码后扩展自动重载

### 生产构建

```bash
npm run build
# 或静默构建（仅失败时输出）
npm run build:silent
```

构建产物在 `dist/` 目录。`scripts/fix-build.js` 会自动修复路径问题并重命名 hash 文件名为固定文件名。

### 配置使用

1. 右键扩展图标 →「选项」
2. 「基础设置」：填入 API Key、API 地址、模型
3. 「图片识别」：配置独立的 Vision API（可选，不配则使用主配置）
4. 「推理」：调整 ReAct 循环参数
5. 「反思」：配置三级反思策略
6. 「对话」：设置历史限制和记忆限制
7. 「代理」：配对本地 Agent 服务
8. 「工具栏」：管理划词浮动工具栏
9. 「工具箱」：管理 MCP 服务器和 Skill
10. 侧边栏中开始对话

---

## 配置说明

### 基础设置

| 参数 | 说明 |
|------|------|
| API Key | OpenAI 兼容 API 密钥 |
| API 地址 | API 端点 URL |
| 模型名称 | 预设（DeepSeek V4 Pro/Flash）+ 自定义模型 |
| 系统提示词 | 自定义系统提示词（含重置按钮） |
| 默认温度 | 0.2-0.9 四档预设 |

### 图片识别设置

| 参数 | 说明 |
|------|------|
| 图片识别开关 | 全局开启/关闭图片输入 |
| 图片识别模型 | Vision 模型名，为空则使用主模型 |
| 图片识别 API Base | 独立 API 地址，为空则使用主配置 |
| 图片识别 API Key | 独立 API Token，为空则使用主配置 |

### ReAct 配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 最大迭代次数 | 100 | ReAct 循环上限 (1-100) |
| API 超时 | 300s | 单次 API 调用超时 (10-600s) |
| 循环超时 | 30min | 整体推理循环超时 (1-60min) |
| 工具超时 | 600s | 单个工具执行超时 (5-600s) |
| 澄清超时 | 3min | 澄清对话框等待超时 (1-10min) |
| API 重试次数 | 3 | 失败重试次数 (0-10)，指数退避 |
| 重试延迟 | 1s | 基础延迟 (0.5-30s) |
| 工具预筛选 | 开启 | 自动筛选相关工具 |
| 预筛选阈值 | 3 | 工具数超过此值才启动预筛选 |
| 工具安全确认 | 开启 | 敏感操作弹出确认框 |

### 反思配置

| 级别 | 默认值 | 说明 |
|------|--------|------|
| 反思总开关 | 关闭 | 整体关闭所有反思 |
| 后置反思 | 开启 | 最终答案质量评估 |
| 质量阈值 | 7 | 1-10，低于此值重试 |
| 修订阈值 | 5 | 低于此值直接修订 |
| 子任务反思 | 关闭 | 子任务结果评估 |
| 工具级反思 | 开启 | 连续 3 次失败触发，每轮最多 2 次 |

### 流式输出配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| LLM 流式输出 | 开启 | OpenAI stream 模式 |
| 字符渲染延迟 | 30ms | Side Panel 字符间延迟，0=瞬间 |
| Agent 流式输出 | 开启 | 命令执行实时流式输出 |

### 对话配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 最大历史轮数 | 50 | 对话记录保留上限 (10-200) |
| 最大输入历史 | 20 | 输入历史保存条数 (10-100) |
| 单条消息限制 | 100000 | 单条消息最大字符数 |
| 记忆限制 | 20 条 | 发送给 LLM 的历史消息条数上限 |
| 上下文窗口 | 自动 | 0=根据模型名自动推断，支持自定义映射 |

### 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+T` / `Cmd+T` | 打开工具选择面板 |
| `Alt+/` | 显示快捷键面板 |
| `Alt+↑/↓` | 切换消息焦点 |
| `Alt+Shift+↑/↓` | 跳到首/末条消息 |
| `Esc` | 关闭面板 / 清空输入 |
| `Ctrl+Shift+A` / `Cmd+Shift+A` | 全局快捷键打开侧边栏 |

---

## 状态管理设计

### 双导出 Proxy 模式

[state.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/side_panel/state.js) 采用独特的双导出 Proxy 模式：

```js
// 两种导入方式指向同一数据
import state from './state.js';      // state.messageHistory
import { messageHistory } from './state.js'; // 直接解构
```

通过 Proxy 的 getter/setter 代理到顶层 `let` 绑定，确保所有模块共享同一份状态，无需框架。支持 80+ 个状态字段，包括图片输入、文件附件、技能选择、MCP 服务选择等。

### 数据持久化策略

| 数据类型 | 存储位置 | 说明 |
|----------|----------|------|
| 扩展配置 | `chrome.storage.local` | API Key、ReAct 参数、模型、图片识别等 |
| 对话会话 | IndexedDB (`ai-helper-db`) | 活跃会话 + 归档会话 |
| UI 原型 | IndexedDB | 按会话关联 |
| 工具栏配置 | `chrome.storage.local` | 工具列表、排序、域名屏蔽 |
| 输入历史 | `chrome.storage.local` | 去重自动管理 |
| 跨重启消息 | `chrome.storage.session` | SW 重启恢复、后台任务持久化 |

### IndexedDB 数据库设计

`ai-helper-db` (v4)，六个对象存储：

| Store | 用途 |
|-------|------|
| `sessions` | 活跃会话（索引：updatedAt） |
| `activeSession` | 当前活跃会话 ID |
| `archivedSessions` | 已归档会话（索引：createdAt） |
| `uiPrototypes` | UI 原型（索引：createdAt, sessionId） |
| `tokenStats` | Token 使用统计（索引：timestamp, sessionId） |
| `reactCheckpoints` | ReAct Checkpoint 断点（7 天 TTL 自动过期） |

支持自动从事务失败恢复及旧版 `chrome.storage.local` 自动迁移。

---

## 常见问题

**Q: 扩展加载后图标不显示？**
确保 `chrome://extensions/` 中「开发者模式」已开启，选择了正确的 `dist` 目录。

**Q: 侧边栏打不开？**
Chrome 版本需 >= 114，低版本不支持 Side Panel API。

**Q: 工具调用不生效？**
检查选项页中工具是否启用，部分工具需要特定网站权限。Agent 工具需要先完成配对连接。

**Q: 构建后文件名带有 hash？**
`scripts/fix-build.js` 会自动将 hash 文件名重命名为固定文件名，无需重新加载。

**Q: 如何开启图片识别？**
在选项页「图片识别」Tab 中开启全局开关，可选配独立的 Vision API Base/Key/Model。

**Q: 如何上传文件进行问答？**
直接粘贴或拖拽文件到输入区域，支持 PDF/Word/Excel/文本等格式。有 Agent 时优先上传至工作目录。

**Q: 如何连接本地 Agent？**
```bash
cd agent && npm install && npm start
```
然后在扩展选项页「Agent」标签页中输入终端显示的 4 位配对码。

**Q: 如何添加 MCP 工具？**
选项页 →「工具箱」Tab → 添加 MCP 服务器 → 填写命令和参数 → 连接。工具会自动注册到系统中。

**Q: 如何导入/导出对话？**
侧边栏输入框下方点击「导出」按钮，可选择多个会话批量导出。导入通过文件选择器完成。

**Q: Agent 命令执行失败？**
确认代理服务正在运行（`npm start`），检查 `~/.ai-helper-agent/config.json` 中的 `allowedPaths` 是否包含目标路径。

---

## License

MIT License

Copyright (c) 2026 AI Helper
