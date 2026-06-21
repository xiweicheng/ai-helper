# AI Helper - 网页智能助手

> 基于大语言模型（LLM）的 Chrome 浏览器智能助手扩展，支持自然语言对话、浏览器自动化操作、网页内容处理等 50+ 工具调用能力，采用 ReAct（Reasoning + Acting）推理循环架构。

| 特性 | 说明 |
|------|------|
| 平台 | Chrome / Edge / Chromium 系浏览器 |
| 扩展协议 | Manifest V3 |
| Chrome 版本要求 | 114+（需要 Side Panel API） |
| API 协议 | OpenAI Chat Completions 兼容 |
| 构建工具 | Vite + @crxjs/vite-plugin |

---

## 架构总览

项目采用 **四层架构**，通过 Chrome Extension API 的消息通道进行通信：

```
┌──────────────────────────────────────────────────────────────┐
│                   Side Panel (UI 层)                          │
│  side_panel.html + src/side_panel/*.js                        │
│  对话管理 | Markdown/Mermaid 渲染 | 工具面板 | 提示词管理      │
│  划词问答 | 输入历史 | 执行日志 | 澄清对话框                   │
└──────────────┬──────────────────────────────┬────────────────┘
               │  chrome.runtime.sendMessage   │
               ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│   Background Service      │    │     Options Page (配置层)      │
│   Worker (核心逻辑层)      │    │  options.html + src/options/   │
│                          │    │  API Key/模型/工具/ReAct参数   │
│  src/background/          │    │  工具栏/提示词/域名屏蔽        │
│  ├── index.js (消息路由)   │    └──────────────────────────────┘
│  ├── react-loop.js (ReAct) │
│  ├── tool-executor.js      │
│  ├── tool-preselector.js   │
│  ├── config.js             │
│  ├── constants.js          │
│  └── state.js              │
└──────────────┬─────────────┘
               │  chrome.tabs.sendMessage
               ▼
┌──────────────────────────────────────────────────────────────┐
│              Content Script (页面工具执行层)                    │
│  src/content/*.js (注入到用户浏览网页)                         │
│  ├── index.js (消息路由, 50+ 页面工具)                         │
│  ├── page-tools.js (页面内容提取)                              │
│  ├── interaction-tools.js (页面交互操作)                       │
│  ├── advanced-tools.js (高级工具)                              │
│  └── selection-toolbar.js (划词浮动工具栏)                     │
└──────────────────────────────────────────────────────────────┘
```

### 核心数据流

```
用户输入 → Side Panel
  → chrome.runtime.sendMessage('CALL_API')
    → Background: 工具预筛选 → ReAct 推理循环
      → LLM API 调用 (OpenAI 兼容)
        → 如需要工具: 执行工具（Background 直接执行 或 委派 Content Script）
        → 工具结果反馈给 LLM → 新一轮推理
      → 最终答案
    → chrome.runtime.sendMessage('API_COMPLETE')
  → Side Panel: Markdown 渲染, Mermaid 图表渲染
```

---

## 项目结构

```
ai-helper/
├── icons/                              # 扩展图标
│   ├── icon16.png / icon48.png / icon128.png
│   └── README.md
├── libs/                               # 第三方依赖（CDN 引入）
│   ├── marked.min.js                   # Markdown 渲染引擎
│   ├── mermaid.min.js                  # Mermaid 图表渲染引擎
│   ├── qrcode.min.js                   # 二维码生成库
│   └── github-markdown-light.min.css   # GitHub 风格 Markdown 样式
├── scripts/                            # 构建后处理脚本
│   └── fix-build.js                    # 修复 @crxjs/vite-plugin 打包产物
├── styles/                             # 样式文件
│   └── styles.css                      # Content Script 浮框样式
├── src/                                # 源码目录
│   ├── background/                     # Background Service Worker
│   │   ├── index.js                    # 入口：消息路由、API 调用分发
│   │   ├── react-loop.js              # ReAct 推理循环（核心引擎）
│   │   ├── tool-executor.js           # 工具定义与执行（26 个 Background 直接工具 + 40+ 委派 Content Script 工具）
│   │   ├── tool-preselector.js        # 工具预筛选（轻量 API 调用提前过滤工具集）
│   │   ├── config.js                   # 配置读写
│   │   ├── constants.js               # 默认配置、50+ 内建工具定义、工具分类映射
│   │   └── state.js                   # 取消控制和 API 计数器
│   ├── content/                        # 页面注入脚本
│   │   ├── index.js                    # 入口：消息路由，50+ 工具消息处理
│   │   ├── page-tools.js              # 页面内容工具（文本提取、元数据、链接等）
│   │   ├── interaction-tools.js       # 交互工具（点击、填表、滚动、拖拽等）
│   │   ├── advanced-tools.js          # 高级工具（视频控制、截图、Shadow DOM 等）
│   │   └── selection-toolbar.js       # 划词浮动工具栏
│   ├── side_panel/                     # 侧边栏 UI
│   │   ├── index.js                    # 入口：事件绑定、组件初始化
│   │   ├── chat-manager.js            # 对话管理（发送/接收消息、执行日志渲染）
│   │   ├── markdown-render.js         # Markdown/Mermaid 渲染与交互控制
│   │   ├── tool-panel.js              # 工具选择弹窗
│   │   ├── prompt-manager.js          # 提示词管理（CRUD、快速选择）
│   │   ├── clarify-dialog.js          # 澄清对话框
│   │   ├── message-toc.js             # 消息目录
│   │   ├── input-history.js           # 输入历史（上下箭头回填）
│   │   ├── state.js                    # UI 状态管理
│   │   ├── utils.js                    # 工具函数
│   │   └── constants.js               # 温度预设、工具分类名
│   ├── options/                        # 扩展选项页
│   │   ├── index.js                    # 入口：Tab 切换、表单事件
│   │   ├── config-manager.js          # 配置读写管理
│   │   ├── toolbar-config.js          # 工具栏配置
│   │   └── constants.js               # 默认系统提示词
│   ├── config/                         # 全局配置常量
│   │   └── constants.js               # Storage 键名、消息类型等
│   └── shared/                         # 共享工具
│       ├── tools.js                    # 工具分类等共享定义
│       └── utils.js                    # 共享工具函数
├── manifest.json                       # Chrome 扩展配置
├── side_panel.html                     # 侧边栏 HTML
├── options.html                        # 选项页 HTML
├── vite.config.js                      # Vite 构建配置
├── package.json                        # npm 包配置
└── README.md
```

---

## 核心功能

### ReAct 推理循环

项目采用 ReAct（Reasoning + Acting）模式作为核心推理引擎：

1. **工具预筛选**：在正式调用主力模型前，用一次轻量 API 调用让小模型判断需要哪些工具，将 50+ 工具缩减为 5-10 个相关工具，大幅减少 Token 消耗
2. **推理循环**：LLM 思考 → 决定调用工具 → 执行工具 → 结果反馈 → 继续推理，直到得出最终答案
3. **任务拆解**：支持 `plan_task` 工具，将复杂任务拆解为多个子任务，按依赖关系拓扑排序后顺序执行
4. **澄清机制**：当任务信息不完整时，LLM 可调用 `clarify_question` 弹出对话框让用户补充信息
5. **超时控制**：多级超时（API 超时、工具超时、整体循环超时），澄清期间自动暂停循环计时

### Side Panel 对话面板

- **自然语言对话**：支持 OpenAI 兼容 API，默认 DeepSeek
- **对话历史**：自动保存最多 50 轮，支持记忆限制配置
- **模型切换**：内置 DeepSeek 模型，支持自定义模型
- **温度调节**：4 档预设（精准编码 0.2 / 均衡开发 0.45 / 架构探索 0.65 / 创意发散 0.9），支持连续调节
- **隔离对话**：不联系前文模式，独立问答
- **划词问答**：在侧边栏内选中文本自动弹出快捷菜单
- **提示词系统**：自定义提示词，支持 `/` 快速选择，支持菜单启用/禁用
- **输入历史**：上下箭头快速回填历史输入

### Markdown 与 Mermaid 渲染

- 完整 Markdown 支持：代码块（带行号、复制按钮、语言标签）、表格（可导出 Excel/复制 Markdown）、引用、列表
- Mermaid 图表：流程图、时序图、甘特图等，支持缩放（Ctrl+滚轮）、拖拽、下载 PNG、复制到剪贴板、查看源码

### 消息导出

- 复制完整消息
- 复制单个代码块
- 导出为 Word (.docx) 文档
- 导出为 PDF 文档
- 复制/下载 Markdown 表格
- 下载 Mermaid 图表为 PNG

### 选中文本浮动工具栏

在任意网页选中文本后，自动弹出浮动工具栏，提供：

- **AI 搜索**：打开侧边栏并发起搜索
- **快速操作**：解释、翻译、总结
- **自定义工具**：可添加自定义提示词工具
- **追问输入**：内联输入框直接追问
- **结果面板**：浮动结果展示，支持追问、复制
- **配置项**：图标精简模式、直接显示数量、域名屏蔽

---

## 内建工具 (50+)

### 页面内容提取（13 个）
| 工具 | 说明 |
|------|------|
| `get_page_text` | 获取纯文本内容 |
| `get_full_html` | 获取完整 HTML |
| `query_interactive_elements` | 提取可交互元素（推荐优先使用） |
| `get_element_by_selector` | CSS 选择器获取元素 |
| `get_selected_content` | 获取用户选中内容 |
| `extract_table` | 表格提取为 JSON/Markdown |
| `extract_links` | 提取所有链接 |
| `extract_forms` | 识别表单结构 |
| `extract_images` | 提取图片 URL |
| `extract_metadata` | 提取网页元数据（SEO） |
| `search_in_page` | 正则搜索页面文本 |
| `page_to_markdown` | 网页转 Markdown |
| `page_to_json` | 网页结构化数据提取为 JSON |

### 页面交互操作（10 个）
| 工具 | 说明 |
|------|------|
| `click_element` | 点击元素 |
| `fill_form` | 批量填表 |
| `hover_element` | 鼠标悬停 |
| `scroll_to` | 滚动到指定位置 |
| `scroll_into_view` | 元素滚动到可视区域 |
| `wait_for_element` | 等待元素出现/消失 |
| `watch_element` | 监听 DOM 变化 |
| `drag_and_drop` | 拖拽操作 |
| `keyboard_input` | 键盘输入 |
| `file_upload` | 文件上传控件注入 |

### 标签页管理（9 个）
| 工具 | 说明 |
|------|------|
| `open_tab` | 打开新标签页 |
| `switch_tab` | 切换标签页 |
| `close_tab` | 关闭标签页 |
| `get_tabs` | 获取所有标签页列表 |
| `navigate_back_forward` | 前进/后退导航 |
| `reload_tab` | 刷新标签页 |
| `mute_tab` | 静音/取消静音 |
| `pin_tab` | 固定/取消固定标签页 |
| `group_tabs` | 标签页分组 |

### 调试开发（6 个）
| 工具 | 说明 |
|------|------|
| `run_javascript` | 在页面执行 JavaScript |
| `inject_css` | 注入 CSS 样式 |
| `shadow_dom_query` | 穿透 Shadow DOM 查询元素 |
| `color_picker` | EyeDropper 取色器 |
| `performance_audit` | 采集 Core Web Vitals |
| `record_network` | 录制网络请求 |

### 媒体处理（6 个）
| 工具 | 说明 |
|------|------|
| `capture_tab_screenshot` | 标签页截图 |
| `screenshot_element` | 元素截图 |
| `page_to_pdf` | 页面导出 PDF |
| `generate_qrcode` | 生成二维码 |
| `text_to_speech` | 文字转语音 |
| `video_control` | 控制页面视频播放 |

### AI 协作（7 个）
| 工具 | 说明 |
|------|------|
| `clarify_question` | 弹出澄清对话框 |
| `plan_task` | 复杂任务拆解规划 |
| `execute_workflow` | 执行预定义工作流 |
| `schedule_task` | 创建定时任务 |
| `manage_user_scripts` | 用户脚本管理 |
| `highlight_text` | 高亮页面文本 |
| `find_text_on_page` | 浏览器原生查找 |

### 系统集成（9 个）
| 工具 | 说明 |
|------|------|
| `fetch_url` | HTTP 请求 |
| `download_file` | 下载文件 |
| `copy_to_clipboard` | 复制到剪贴板 |
| `paste_from_clipboard` | 从剪贴板读取 |
| `get_browser_info` | 浏览器环境信息 |
| `show_notification` | 桌面通知 |
| `manage_cookies` | Cookie 管理 |
| `manage_storage` | localStorage/sessionStorage 管理 |
| `clear_page_data` | 一键清除站点数据 |

---

## 技术栈

| 技术 | 说明 |
|------|------|
| Vite + @crxjs/vite-plugin | 构建工具链，支持 ES Module 和 HMR |
| Manifest V3 | 最新 Chrome 扩展协议 |
| Service Worker | 后台进程，API 调用和工具执行 |
| Side Panel API | Chrome 114+ 侧边栏 |
| Content Script | 页面注入，DOM 操作 |
| chrome.debugger API | 用于页面导出 PDF、网络录制等高级功能 |
| OpenAI Compatible API | LLM 调用，默认 DeepSeek |
| marked.js | Markdown 渲染引擎 |
| mermaid.js | 图表渲染引擎 |
| qrcode.js | 二维码生成库 |

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
2. 填入 API Key、API 地址（默认 `https://api.deepseek.com`）
3. 配置模型名称、ReAct 参数（迭代次数、超时时间等）
4. 在「工具栏配置」标签页中管理划词浮动工具栏
5. 在侧边栏中即可开始对话

---

## 配置说明

### ReAct 配置（在选项页「ReAct」标签页）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 最大迭代次数 | 5 | ReAct 循环上限 (1-20) |
| API 超时 | 60s | 单次 API 调用超时 |
| 循环超时 | 300s | 整体推理循环超时 |
| 工具超时 | 30s | 单个工具执行超时 |
| 澄清超时 | 180s | 澄清对话框等待超时 |

### 对话配置（在选项页「对话」标签页）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 最大历史轮数 | 50 | 对话记录保留上限 |
| 单条消息限制 | 5000 | 单条消息最大字符数 |
| 记忆历史限制 | 不限制 | 发送给 LLM 的历史消息条数上限 |

---

## 常见问题

**Q: 扩展加载后图标不显示？**  
确保 `chrome://extensions/` 中「开发者模式」已开启，选择了正确的 `dist` 目录。

**Q: 侧边栏打不开？**  
Chrome 版本需 ≥ 114，低版本不支持 Side Panel API。

**Q: 工具调用不生效？**  
检查选项页中工具是否启用，部分工具需要特定网站权限。

**Q: 构建后文件名带有 hash，每次构建都要重新加载扩展？**  
`scripts/fix-build.js` 会自动将 hash 文件名重命名为固定文件名，无需重新加载。

---

## License

MIT License

Copyright (c) 2026 AI Helper
