# AI Helper - 网页智能助手

> 基于大语言模型（LLM）的 Chrome 浏览器智能助手扩展，支持自然语言对话、浏览器自动化操作、网页内容处理等 60+ 项工具调用能力，采用 ReAct（Reasoning + Acting）推理循环架构。可选配代理服务实现文件系统操作、命令执行、技能系统和 MCP 协议扩展。

| 特性 | 说明 |
|------|------|
| 平台 | Chrome / Edge / Chromium 系浏览器 |
| 扩展协议 | Manifest V3 |
| Chrome 版本要求 | 114+（需要 Side Panel API） |
| API 协议 | OpenAI Chat Completions 兼容 |
| 构建工具 | Vite + @crxjs/vite-plugin |
| 本地 Agent | 可选，Node.js 18+ 独立进程，提供文件/命令能力 |
| Skill 系统 | 支持 Workflow 和 Agent 两种技能类型，支持从对话沉淀技能 |
| MCP 协议 | Model Context Protocol 支持，扩展第三方工具 |
| 多助手管理 | 支持自定义 Agent，内置多种角色模板 |

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
│  多助手管理 | Token 统计面板 | Agent 选择器                   │
└──────────────┬──────────────────────────────┬────────────────┘
               │  chrome.runtime.sendMessage   │
               ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│   Background Service      │    │     Options Page (配置层)      │
│   Worker (核心逻辑层)      │    │  options.html + src/options/   │
│                          │    │  API Key/模型/工具/ReAct参数   │
│  src/background/          │    │  反思系统/对话配置/工具栏      │
│  ├── index.js (消息路由)   │    │  Agent 配对连接管理/工具箱     │
│  ├── react-loop.js (ReAct) │    └──────────────────────────────┘
│  ├── tool-executor.js      │
│  ├── tool-preselector.js   │
│  ├── local-agent-client.js │    ┌──────────────────────────────┐
│  ├── config.js             │    │   代理服务 (可选层)           │
│  ├── state.js              │    │  agent/ (Node.js 独立进程)    │
│  ├── agent-dispatcher.js   │    │  HTTP REST + WebSocket       │
│  ├── stream-controller.js  │    │  文件读写 | 命令执行 | 搜索   │
│  └── token-recorder.js     │    │  Skill 系统 | MCP 协议扩展   │
└──────────────┬─────────────┘    │  路径沙箱 | 安全分级          │
               │                   └──────────────────────────────┘
               │  chrome.tabs.sendMessage
               ▼
┌──────────────────────────────────────────────────────────────┐
│              Content Script (页面工具执行层)                    │
│  src/content/*.js (注入到用户浏览网页)                         │
│  ├── index.js (消息路由, 页面工具)                             │
│  ├── page-tools.js (页面内容提取, 无障碍树, Markdown 转换)     │
│  ├── interaction-tools.js (交互操作, 语音合成, 取色器)         │
│  ├── advanced-tools.js (视频控制, 性能审计, Shadow DOM, 截图)  │
│  └── selection-toolbar.js (划词浮动工具栏，类比豆包设计)       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   Storage (数据持久化层)                        │
│  src/storage/                                                 │
│  ├── db.js (IndexedDB 封装，会话/原型持久化)                   │
│  ├── session-store.js (会话存储适配器)                         │
│  └── token-store.js (Token 统计存储)                          │
└──────────────────────────────────────────────────────────────┘
```

### 核心数据流

```
用户输入 → Side Panel (选择 Agent)
  → chrome.runtime.sendMessage('CALL_API')
    → Background: 工具预筛选 → ReAct 推理循环
      → Token 预算管理 → 上下文压力监测 → Token 统计记录
      → LLM API 调用 (OpenAI 兼容, 带重试和指数退避, 流式响应)
        → 如需工具: 工具确认检查（敏感操作）→ 执行工具
          ├── Background 直接执行（标签页管理、书签搜索等）
          ├── 委派 Content Script（页面交互、内容提取等）
          └── 委派本地 Agent（文件读写、命令执行、MCP 工具等）
        → 工具级反思 → 结果缓存 → 反馈给 LLM
      → 子任务拆解与并行执行（plan_task 集成，支持子任务分发）
      → 后置反思：多维度质量评估 → 合格/修订/重试
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
├── libs/                                # 第三方依赖（CDN 引入）
│   ├── marked.min.js                    # Markdown 渲染引擎
│   ├── mermaid.min.js                   # Mermaid 图表渲染引擎
│   ├── qrcode.min.js                    # 二维码生成库
│   └── github-markdown-light.min.css    # GitHub 风格 Markdown 样式
├── scripts/                             # 构建工具脚本
│   ├── fix-build.js                     # 修复 @crxjs/vite-plugin 打包产物
│   ├── generate-icons.js                # 图标生成脚本
│   └── deploy-pages.sh                  # Pages 部署脚本
├── styles/
│   └── styles.css                       # Content Script 浮框样式
├── src/                                 # 扩展源码
│   ├── background/                      # Background Service Worker
│   │   ├── index.js                     # 入口：消息路由、会话管理、Agent 健康监测
│   │   ├── react-loop.js               # ReAct 推理循环（核心引擎，含反思系统）
│   │   ├── tool-executor.js            # 工具定义注册与执行调度
│   │   ├── tool-preselector.js         # 工具预筛选（轻量 API 提前过滤）
│   │   ├── local-agent-client.js       # 本地 Agent HTTP/WebSocket 通信
│   │   ├── agent-dispatcher.js         # Agent 子任务分发器
│   │   ├── stream-controller.js        # 流式响应控制器
│   │   ├── token-recorder.js           # Token 使用统计记录器
│   │   ├── config.js                    # 配置读写
│   │   ├── constants.js                # 默认配置、60+ 个内建工具定义、分类映射
│   │   └── state.js                    # 多会话取消控制、API 计数器
│   ├── content/                         # 页面注入脚本
│   │   ├── index.js                     # 入口：消息路由分发
│   │   ├── page-tools.js               # 页面内容工具（提取、搜索、无障碍树等）
│   │   ├── interaction-tools.js        # 交互工具（点击、填表、语音合成等）
│   │   ├── advanced-tools.js           # 高级工具（视频、性能审计、Shadow DOM 等）
│   │   └── selection-toolbar.js        # 划词浮动工具栏（类比豆包设计）
│   ├── side_panel/                      # 侧边栏 UI
│   │   ├── index.js                     # 入口：事件绑定、配置管理、键盘快捷键
│   │   ├── chat-manager.js             # 对话管理（发送/接收、执行日志、导出）
│   │   ├── markdown-render.js          # Markdown/Mermaid 渲染与交互控制
│   │   ├── tool-panel.js               # 工具选择弹窗（分类筛选、搜索）
│   │   ├── prompt-manager.js           # 提示词管理（CRUD、快速选择、拖拽排序）
│   │   ├── agent-manager.js            # Agent 多助手管理 UI
│   │   ├── agent-store.js              # Agent 数据持久化存储
│   │   ├── agent-at-selector.js        # Agent @ 选择器
│   │   ├── token-stats-panel.js        # Token 统计面板
│   │   ├── session-manager.js          # 多会话存储 API
│   │   ├── session-manager-ui.js       # 会话标签页 UI（切换、重命名、归档）
│   │   ├── clarify-dialog.js           # 澄清对话框（倒计时、音频提醒）
│   │   ├── confirm-dialog.js           # 敏感操作确认对话框
│   │   ├── ui-prototype.js             # UI 原型预览与管理（缩放、下载、库）
│   │   ├── message-toc.js              # 消息目录（自动生成导航栏）
│   │   ├── input-history.js            # 输入历史（上下箭头回填）
│   │   ├── state.js                     # 全局状态管理（Proxy 双导出模式）
│   │   ├── utils.js                     # 工具函数（Toast、系统提示词构建等）
│   │   └── constants.js                # 温度预设、工具分类名
│   ├── options/                         # 扩展选项页
│   │   ├── index.js                     # 入口：标签页切换、表单事件、Agent 配对
│   │   ├── config-manager.js           # 配置读写管理
│   │   ├── config-io.js                # 配置导入/导出
│   │   ├── toolbar-config.js           # 工具栏配置（拖拽排序、域名屏蔽）
│   │   ├── toolbox-config.js           # 工具箱配置（Skill/MCP 管理）
│   │   └── constants.js                # 默认系统提示词与配置常量
│   ├── storage/                         # IndexedDB 持久化层
│   │   ├── db.js                        # IndexedDB 封装（事务重试、迁移）
│   │   ├── session-store.js            # 会话存储适配器
│   │   └── token-store.js              # Token 统计存储
│   ├── config/
│   │   └── constants.js                # Storage 键名、消息类型等
│   └── shared/                          # 共享模块
│       ├── tools.js                     # 工具分类、温度预设
│       ├── utils.js                     # 通用工具函数
│       ├── token-counter.js            # Token 计数与预算管理
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

### 多助手管理（Agent 系统）

支持创建和管理多个自定义 AI 助手，每个助手拥有独立的系统提示词和工具权限：

- **内置模板**：代码审查专家、网页自动化助手、数据分析师、文档撰写助手
- **自定义 Agent**：创建专属助手，设置图标、名称、系统提示词和工具权限
- **Agent 选择器**：侧边栏顶部快速切换助手
- **工具过滤**：每个助手可配置独立的工具集，避免工具过多导致的上下文膨胀
- **子任务分发**：支持将子任务委派给其他助手执行

### ReAct 推理循环

项目采用 ReAct（Reasoning + Acting）模式作为核心推理引擎，支持多轮工具调用与结果反馈：

1. **工具预筛选**：正式调用主力模型前，用一次轻量 API 调用判断需要哪些工具，将 60+ 个工具缩减为 5-10 个相关工具，大幅减少 Token 消耗。对于简单问题可直接回答，跳过完整推理循环
2. **推理循环**：LLM 思考 → 决定调用工具 → 执行工具 → 结果反馈 → 继续推理，直到得出最终答案
3. **Token 预算管理**：按模型上下文窗口动态计算可用 Token 预算（80%），按 Token 数而非消息数进行截断，保留 tool_calls/tool 消息配对完整性
4. **工具结果缓存**：并行工具结果自动缓存，缓存上限 30 条自动淘汰
5. **并行工具执行**：同一轮中标记为可并行的工具通过 `Promise.all` 并发执行
6. **任务拆解**：支持 `plan_task` 工具，将复杂任务拆解为子任务，支持顺序、并行、依赖三种执行策略，子任务失败支持重试/回滚/继续
7. **子任务分发**：支持将子任务委派给其他 Agent 执行，实现多 Agent 协作
8. **流式响应**：支持 OpenAI 流式响应，实时显示 LLM 输出
9. **澄清机制**：任务信息不完整时弹出澄清对话框，循环计时自动暂停，支持推荐选项、自定义输入和附加信息
10. **超时控制**：多级超时（API 超时、工具超时、整体循环超时），澄清期间自动暂停循环计时
11. **取消控制**：用户可随时取消推理循环，按会话隔离，支持全部取消
12. **SW 重启检测**：Keepalive 端口监测 Service Worker 静默重启，自动通知 Side Panel 恢复

### 反思系统（多级质量保障）

ReAct 循环内置三级反思机制，确保输出质量：

| 级别 | 说明 | 触发条件 |
|------|------|----------|
| **工具级反思** | 工具执行后快速评估结果是否有用 | 工具返回错误 / 空结果 / 结果过大 / 连续失败 |
| **子任务反思** | 评估子任务结果完整性和相关性 | 仅标记为 complex 的子任务（可配置） |
| **后置反思** | 最终答案 7 维度质量评分 | 每轮推理完成后自动执行 |

后置反思评分维度：完整性、准确性、相关性、工具使用、清晰度、安全性、效率。根据评分阈值自动决定：通过、修订、或重新执行。

### Token 预算管理

精细化的 Token 计数与管理：

- 中文字符 ~1.5 chars/token，英文 ~4 chars/token 智能估算
- 主流模型上下文窗口支持（DeepSeek 128k/64k）
- 消息预算 = 上下文窗口 - 系统提示词 - 工具定义 - 输出预留
- 上下文压力三级监测：safe / warning / critical
- Token 级别截断（70% 开头 + 30% 结尾 + 截断标记）

### Token 统计面板

实时追踪和展示 Token 使用情况：

- **实时统计**：每次 API 调用后更新 Token 消耗
- **会话统计**：当前会话累计消耗、平均每轮消耗
- **今日统计**：当日累计消耗、调用次数
- **图表展示**：趋势图和详细数据展示
- **历史记录**：最近 7 天的 Token 使用历史

### Skill 系统

支持将对话中的操作流程沉淀为可复用的技能：

- **Workflow Skill**：基于 JSON/YAML 定义的工作流技能，可直接执行
- **Agent Skill**：基于 SKILL.md 定义的代理技能，由 AI 在对话中自主调用
- **内置技能**：`skill-creator` 元技能，支持从对话中自动创建新技能
- **技能管理**：启用/停用、导入/导出、删除等操作
- **技能沉淀**：用户说"把这个流程沉淀为技能"即可触发技能创建

### MCP 协议扩展

支持 Model Context Protocol（MCP）协议，扩展第三方工具：

- **MCP Client**：JSON-RPC 2.0 通信，支持 stdio 传输
- **MCP Server 管理**：配置、连接、断开、状态监测
- **工具发现**：自动发现 MCP Server 提供的工具
- **工具调用**：通过 Agent 服务调用 MCP 工具
- **多 Server 支持**：同时连接多个 MCP Server

### 多会话管理

支持同时管理多个独立的对话会话：

- **标签页切换**：水平标签栏切换会话，自动恢复消息历史、模型、工具和温度配置
- **会话创建**：一键创建新会话，自动生成标题（取首条用户消息）
- **会话重命名/删除**：自定义确认弹窗，支持右键菜单
- **会话归档/恢复**：将当前会话归档（最多保留 20 个），可随时恢复
- **跨会话消息投递**：后台任务完成时自动追加到原始会话，即使已切换到其他会话
- **持久化存储**：基于 IndexedDB，自动从旧版 chrome.storage.local 迁移

### Side Panel 对话面板

- **自然语言对话**：支持 OpenAI 兼容 API，默认 DeepSeek V4
- **模型切换**：内置 DeepSeek 模型，支持自定义模型增删
- **温度调节**：4 档预设（精准编码 0.2 / 均衡开发 0.45 / 架构探索 0.65 / 创意发散 0.9），支持连续微调
- **记忆限制**：可配置发送给 LLM 的历史消息条数，支持不限制模式
- **隔离对话**：不联系前文模式，独立问答
- **划词问答**：侧边栏内选中文本自动弹出快捷菜单
- **提示词系统**：自定义提示词 CRUD，`/` 快速选择，支持菜单启用/禁用，拖拽排序
- **输入历史**：上下箭头快速回填历史输入，去重自动管理
- **系统提示词**：自动注入环境信息（Chrome 扩展、OS、Agent 平台），强制附加任务规划规则

### Markdown 与 Mermaid 渲染

- 完整 Markdown 支持：代码块（带行号、复制按钮、语言标签）、表格（可导出 Excel/复制 Markdown）、引用、列表
- **三阶段占位符策略**：Mermaid → 代码块 → 表格依次提取占位，渲染后恢复，防止内容干扰
- Mermaid 图表：流程图、时序图、甘特图等，支持缩放（Ctrl+滚轮）、拖拽平移、下载 PNG、复制到剪贴板、查看源码
- **表格单元格内联 Markdown**：支持粗体、斜体、代码、删除线

### UI 原型预览系统

AI 生成的 HTML/CSS 代码可实时预览和交互：

- **内联预览**：iframe `srcdoc` 渲染，自动检测完整文档 vs 片段
- **缩放控制**：0.25x-2.0x，Ctrl+滚轮 / Ctrl+0 重置
- **原型库**：保存到 IndexedDB，支持打开/编辑/删除
- **导出**：下载为 .html 文件，或在新标签页中打开
- **继续优化**：一键将优化指令填入输入框

### 消息操作

| 操作 | 说明 |
|------|------|
| 复制消息 | 复制原始 Markdown 内容 |
| 编辑重发 | 将消息回填到输入框 |
| 引用追问 | 将助手消息设为引用上下文 |
| 导出 Word | Markdown 转样式化 .doc 下载 |
| 导出 PDF | 浏览器打印窗口导出 |
| 导出 JSON | 完整对话历史 JSON 下载 |

### 选中文本浮动工具栏

在任意网页选中文本后，自动弹出浮动工具栏（类比豆包设计）：

- **AI 搜索**：打开侧边栏并发起搜索
- **快速操作**：解释、翻译、总结
- **自定义工具**：可添加自定义提示词工具，支持拖拽排序
- **追问输入框**：内联输入框直接追问
- **结果面板**：可拖拽、可缩放浮动面板，Markdown 渲染，支持追问、复制、锁定
- **建议追问**：AI 返回中的 `---SUGGESTIONS---` 自动生成追问按钮
- **配置项**：图标精简模式、直接显示数量、域名屏蔽、临时隐藏
- **玻璃态样式**：`backdrop-filter: blur` 毛玻璃效果

### 执行日志面板

可视化追踪 ReAct 推理全过程：

- **实时面板**：推理进行中实时更新，脉冲动画指示执行中
- **静态面板**：完成后展示完整执行时间线
- **节点信息**：工具名、状态、耗时、输入参数摘要、输出内容
- **汇总统计**：总节点数、成功/失败数、子任务进度
- **状态过滤**：按成功/失败/执行中筛选
- **任务分组**：子任务分阶段展示

### 质量评估展示

后置反思结果的可视化：

- **总体评分**：0-10 分，颜色编码（绿/黄/红）+ emoji
- **7 维度雷达**：每维度独立进度条
- **问题发现**：具体问题和改进建议
- **评估过程**：轮数、决策、推理
- **教育性说明**：什么是质量评估

### 消息目录 (TOC)

悬停助手消息时自动生成浮动导航：

- 自动提取 H1-H6 标题
- 浮动面板，点击平滑滚动到目标位置
- 1.5s 高亮闪烁效果
- 智能延迟隐藏，防止误操作

---

## 内建工具 (59)

### 内容提取（16 个）
| 工具 | 说明 |
|------|------|
| `get_page_text` | 获取纯文本内容（标题、链接、字数统计） |
| `get_full_html` | 获取完整 HTML（可选去样式） |
| `query_interactive_elements` | 提取可交互元素（按钮、输入框等，推荐优先使用） |
| `get_selected_content` | 获取用户选中内容（支持 HTML/纯文本） |
| `extract_table` | 表格提取为 JSON/Markdown |
| `extract_links` | 提取所有链接（可筛选内/外部） |
| `extract_forms` | 识别表单结构（字段属性、CSS 选择器） |
| `extract_images` | 提取图片 URL（含 CSS 背景图） |
| `extract_metadata` | 提取网页元数据（OG、JSON-LD、Microdata） |
| `search_in_page` | 正则搜索页面文本（支持高亮） |
| `page_to_markdown` | 网页转 Markdown（12+ 元素类型） |
| `page_to_json` | 结构化数据提取为 JSON |
| `find_similar_elements` | 查找相似结构元素 |
| `get_iframe_content` | 获取 iframe 内容（同源，支持嵌套） |
| `scroll_and_collect` | 滚动收集长内容（去重聚合） |
| `get_element_count` | 快速元素计数（可见性过滤） |

### 页面交互（8 个）
| 工具 | 说明 |
|------|------|
| `click_element` | 点击元素（CSS 选择器，自动清洗引号） |
| `hover_element` | 鼠标悬停 |
| `drag_and_drop` | 拖拽操作（实验性） |
| `scroll_to` | 滚动到指定位置/元素 |
| `wait_for_element` | 等待元素出现/消失（严格可见性检测） |
| `wait_for_navigation` | 等待页面跳转完成 |
| `scroll_and_collect` | 无限滚动页面内容收集 |
| `select_dropdown` | 下拉菜单选择（原生 select + 自定义组件） |

### 表单与输入（4 个）
| 工具 | 说明 |
|------|------|
| `fill_form` | 批量填表（支持富文本编辑器） |
| `keyboard_input` | 键盘输入（绕过 React 受控组件） |
| `file_upload` | 文件上传（DataTransfer 注入） |
| `select_dropdown` | 下拉菜单选择 |

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
| `fetch_url` | HTTP 请求（支持超时、重试、指数退避） |

### 媒体与输出（7 个）
| 工具 | 说明 |
|------|------|
| `capture_tab_screenshot` | 标签页截图（CDP 协议） |
| `take_full_page_screenshot` | 全页截图（CDP `Page.captureScreenshot`） |
| `generate_qrcode` | 生成二维码（QRCode 库 + Canvas 降级） |
| `copy_to_clipboard` | 复制到剪贴板（图片/文本） |
| `paste_from_clipboard` | 从剪贴板读取 |
| `download_file` | 下载文件（需确认） |
| `show_notification` | 桌面通知 |

### 调试与开发（4 个）
| 工具 | 说明 |
|------|------|
| `inject_css` | 注入 CSS 样式（全局/作用域/内联） |
| `get_browser_info` | 获取浏览器环境信息 |
| `get_element_count` | 快速元素计数 |
| `highlight_text` | 高亮页面文本（可清除） |

### AI 协作（6 个）
| 工具 | 说明 |
|------|------|
| `clarify_question` | 弹出澄清对话框（推荐选项、倒计时、音频提醒） |
| `highlight_text` | 高亮页面文本 |
| `plan_task` | 复杂任务拆解规划（支持并行/顺序/依赖） |
| `preview_ui_prototype` | UI 原型预览与管理 |
| `search_conversation_memory` | 搜索对话记忆（活跃 + 归档） |
| `read_accessibility_tree` | 读取无障碍树（ARIA 角色/标签） |

### 页面增强功能（可选）
| 工具 | 说明 |
|------|------|
| `run_javascript` | 在页面执行 JavaScript（异步超时支持） |
| `screenshot_element` | 元素区域截图（CDP 协议） |
| `page_to_pdf` | 页面导出 PDF |
| `video_control` | 视频/音频控制（播放、倍速、全屏等） |
| `performance_audit` | 性能审计（Navigation/Paint/LCP/CLS/Memory） |
| `shadow_dom_query` | Shadow DOM 查询（深度递归） |
| `pick_color` | 取色器（EyeDropper API） |
| `text_to_speech` | 文本语音朗读（Web Speech API） |

###  Agent（7 个）—— 需安装代理服务
| 工具 | 说明 |
|------|------|
| `agent_read_file` | 读取本地文件（路径沙箱，大小限制） |
| `agent_write_file` | 写入本地文件（脚本自动去执行权限） |
| `agent_list_dir` | 列出目录内容 |
| `agent_delete_file` | 删除本地文件/目录（需确认） |
| `agent_exec_command` | 执行终端命令（黑/灰/白名单三级安全） |
| `agent_search_files` | 按文件名搜索（支持 fd 加速） |
| `agent_search_content` | 在文件中搜索文本（支持 ripgrep 加速） |

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
| IndexedDB | 会话/原型/Token 统计持久化 |
| chrome.storage.local | 配置存储、Agent 定义存储 |
| chrome.storage.session | 跨重启消息恢复 |
| chrome.debugger API | CDP 截图/PDF 导出 |
| OpenAI Compatible API | LLM 调用，默认 DeepSeek V4，支持流式响应 |
| marked.js | Markdown 渲染引擎 |
| mermaid.js | 图表渲染引擎 |
| QRCode.js | 二维码生成（Canvas 降级方案） |
| Web Speech API | 文本语音合成 |
| EyeDropper API | 取色器 |
| Navigation/Performance API | 性能审计 |
| Node.js (Agent) | 本地文件/命令服务、Skill 系统、MCP 协议 |
| WebSocket (Agent) | 命令输出实时流 |
| MCP Protocol | Model Context Protocol，扩展第三方工具 |

---

## 代理服务

扩展可选配一个 Node.js 代理服务，提供浏览器沙箱之外的文件系统、终端命令、Skill 系统和 MCP 协议扩展能力。

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
- **路径沙箱**：`realpathSync` 解析符号链接，前缀匹配白名单路径，防止越权
- **命令安全**：环境变量白名单（约 40 个），`TERM=dumb` 禁用互动
- **脚本保护**：写入 `.sh`/`.py`/`.js` 等自动去除执行权限
- **大小限制**：请求体 10MB，单文件 50MB
- **并发安全**：磁盘写入互斥锁，优雅关闭防双重关闭
- **配置缓存**：mtime 检测，避免重复读盘

### Skill 系统（Agent 端）

Agent 服务内置 Skill 系统，支持两种类型的技能：

| 类型 | 定义格式 | 执行方式 | 用途 |
|------|----------|----------|------|
| **Workflow Skill** | JSON/YAML | 直接执行 | 自动化流程，按步骤执行 |
| **Agent Skill** | SKILL.md | AI 自主调用 | 知识沉淀，在对话中触发 |

Skill 存储目录：`~/.ai-helper-agent/skills/`

### MCP 协议（Agent 端）

支持 Model Context Protocol，扩展第三方工具能力：

- **MCP Client**：基于 JSON-RPC 2.0，支持 stdio 传输
- **自动发现**：连接后自动获取 MCP Server 的工具列表
- **多 Server**：同时连接多个 MCP Server，工具自动合并
- **工具调用**：通过 Agent API 调用 MCP Server 的工具

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
# 安装依赖
npm install

# 启动开发服务器（支持 HMR）
npm run dev
```

然后在 Chrome 中：
1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目目录下的 `dist` 文件夹（Vite 自动生成）
5. 修改源码后扩展会自动重载

### 生产构建

```bash
npm run build
```

构建产物在 `dist/` 目录，可直接加载到 Chrome。

> `scripts/fix-build.js` 会自动修复 @crxjs/vite-plugin 打包后的路径问题，并将 hash 文件名重命名为固定文件名。

### 配置使用

1. 右键点击工具栏中的扩展图标 → 选择「选项」
2. 在「基础设置」标签页填入 API Key、API 地址（默认 `https://api.deepseek.com`）
3. 配置模型名称、自定义模型
4. 在「推理」标签页调整推理循环参数
5. 在「反思」标签页配置三级反思策略
6. 在「对话」标签页设置历史限制和记忆限制
7. 在「代理」标签页配对代理服务（可选）
8. 在「工具栏」标签页管理划词浮动工具栏
9. 在侧边栏中即可开始对话

---

## 配置说明

### 基础设置（选项页「基础」标签页）

| 参数 | 说明 |
|------|------|
| API Key | OpenAI 兼容 API 密钥 |
| API 地址 | API 端点 URL |
| 模型名称 | 预设（DeepSeek V4 Pro/Flash）+ 自定义模型 |
| 系统提示词 | 自定义系统提示词（含重置按钮） |
| 默认温度 | 0.2-0.9 四档预设 |

### ReAct 配置（选项页「ReAct」标签页）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 最大迭代次数 | 5 | ReAct 循环上限 (1-100) |
| API 超时 | 60s | 单次 API 调用超时 (10-600s) |
| 循环超时 | 5min | 整体推理循环超时 (1-30min) |
| 工具超时 | 30s | 单个工具执行超时 (5-600s) |
| 澄清超时 | 3min | 澄清对话框等待超时 (1-10min) |
| API 重试次数 | 3 | 失败重试次数 (0-10)，指数退避 |
| 重试延迟 | 1s | 基础延迟 (0.5-30s) |
| 工具预筛选 | 开启 | 自动筛选相关工具 |
| 预筛选阈值 | 3 | 工具数超过此值才启动预筛选 |
| 工具安全确认 | 开启 | 敏感操作弹出确认框 |

### 反思配置（选项页「反思」标签页）

| 级别 | 默认值 | 说明 |
|------|--------|------|
| 反思总开关 | 开启 | 整体关闭所有反思 |
| 后置反思 | 开启 | 最终答案质量评估 |
| 质量阈值 | 7 | 1-10，低于此值重试 |
| 修订阈值 | 5 | 低于此值直接修订 |
| 子任务反思 | 关闭 | 子任务结果评估 |
| 工具级反思 | 开启 | 单次工具调用结果评估 |

### 对话配置（选项页「对话」标签页）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 最大历史轮数 | 50 | 对话记录保留上限 (10-200) |
| 最大输入历史 | 20 | 输入历史保存条数 (10-100) |
| 单条消息限制 | 100000 | 单条消息最大字符数 |
| 记忆限制 | 20 条 | 发送给 LLM 的历史消息条数上限 |

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

通过 Proxy 的 getter/setter 代理到顶层 `let` 绑定，确保所有模块共享同一份状态，无需框架。

### 数据持久化策略

| 数据类型 | 存储位置 | 说明 |
|----------|----------|------|
| 扩展配置 | `chrome.storage.local` | API Key、ReAct 参数、模型等 |
| 对话会话 | IndexedDB (`ai-helper-db`) | 活跃会话 + 归档会话 |
| UI 原型 | IndexedDB | 按会话关联 |
| 工具栏配置 | `chrome.storage.local` | 工具列表、排序、域名屏蔽 |
| 输入历史 | `chrome.storage.local` | 去重自动管理 |
| 跨重启消息 | `chrome.storage.session` | SW 重启恢复 |

### IndexedDB 数据库设计

`ai-helper-db` (v2)，四个对象存储：

| Store | 用途 |
|-------|------|
| `sessions` | 活跃会话（索引：updatedAt） |
| `activeSession` | 当前活跃会话 ID |
| `archivedSessions` | 已归档会话（索引：createdAt） |
| `uiPrototypes` | UI 原型（索引：createdAt, sessionId） |

支持自动从事务失败恢复（SW 重启导致连接断开），以及旧版 chrome.storage.local 自动迁移。

---

## 常见问题

**Q: 扩展加载后图标不显示？**
确保 `chrome://extensions/` 中「开发者模式」已开启，选择了正确的 `dist` 目录。

**Q: 侧边栏打不开？**
Chrome 版本需 ≥ 114，低版本不支持 Side Panel API。

**Q: 工具调用不生效？**
检查选项页中工具是否启用，部分工具需要特定网站权限。Agent 工具需要先完成配对连接。

**Q: 构建后文件名带有 hash，每次构建都要重新加载扩展？**
`scripts/fix-build.js` 会自动将 hash 文件名重命名为固定文件名，无需重新加载。

**Q: 如何连接本地 Agent？**
```bash
cd agent && npm install && npm start
```
然后在扩展选项页「Agent」标签页中输入终端显示的 4 位配对码。

**Q: Agent 命令执行失败？**
确认代理服务正在运行（`npm start`），检查 `~/.ai-helper-agent/config.json` 中的 `allowedPaths` 是否包含目标路径。

---

## License

MIT License

Copyright (c) 2026 AI Helper
