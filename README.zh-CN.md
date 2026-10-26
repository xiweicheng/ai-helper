> [English](./README.md) | [中文](./README.zh-CN.md)

<div align="center">

# AI Helper — 网页智能助手

### 让大模型亲手操作网页的开源浏览器插件

不只是聊天 —— 真的会点击、填表、拖拽、上传文件、跑终端命令，还能通过 MCP 动态扩展工具。

[![Chrome 应用商店](https://img.shields.io/badge/Chrome_%E5%BA%94%E7%94%A8%E5%95%86%E5%BA%97-%E5%B7%B2%E4%B8%8A%E6%9E%B6-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/ai-helper-%E7%BD%91%E9%A1%B5%E6%99%BA%E8%83%BD%E5%8A%A9%E6%89%8B/fnolhphogjkdcmnecpeckhjoeofldiac) [![Microsoft Edge](https://img.shields.io/badge/Microsoft_Edge-%E5%B7%B2%E4%B8%8A%E6%9E%B6-0078D7?logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/ai-helper-%E7%BD%91%E9%A1%B5%E6%99%BA%E8%83%BD%E5%8A%A9%E6%89%8B/kabhmgfbkhpbfhhnokaafhkdbckeipcl) [![讨论组](https://img.shields.io/badge/%E8%AE%A8%E8%AE%BA%E7%BB%84-%E5%8A%A0%E5%85%A5-181717?logo=github&logoColor=white)](https://github.com/xiweicheng/ai-helper/discussions) [![License](docs/images/badges/license-MIT.svg)](./LICENSE) [![Version](docs/images/badges/version.svg)](./package.json) ![Platform](docs/images/badges/platform.svg) ![PRs Welcome](docs/images/badges/prs-welcome.svg) [![English Docs](https://img.shields.io/badge/Docs-English-blue)](./README.md)

### [安装到 Chrome 应用商店 →](https://chromewebstore.google.com/detail/ai-helper-%E7%BD%91%E9%A1%B5%E6%99%BA%E8%83%BD%E5%8A%A9%E6%89%8B/fnolhphogjkdcmnecpeckhjoeofldiac) · [安装到 Microsoft Edge →](https://microsoftedge.microsoft.com/addons/detail/ai-helper-%E7%BD%91%E9%A1%B5%E6%99%BA%E8%83%BD%E5%8A%A9%E6%89%8B/kabhmgfbkhpbfhhnokaafhkdbckeipcl)

Chromium 等无商店账号的用户请看下方 [30 秒上手](#30-秒上手) 里的开发者模式加载方式。

</div>

---

![AI Helper 演示](docs/images/ai-helper-promo-zh.gif)

<p align="center"><sub>一句话让 AI 帮你读网页、填表单、传文件、跑命令。</sub></p>

---

## 演示视频

**AI Helper 产品介绍**（约 4 分钟 · 带旁白）：完整讲解 ReAct 推理循环、40+ 内置工具、多智能体协作、工作目录管理、Skill 系统与 MCP 协议扩展——一次看懂浏览器助手如何思考与执行。

- ▶️ 中文版：[在线观看（Bilibili）](https://www.bilibili.com/video/BV1tZHZ6NEAr/)
- ▶️ English：[Watch on YouTube](https://www.youtube.com/watch?v=6UtuvmZ1Pm8)

**AI 插件自动批量录入表单**（67 秒 · 带旁白与字幕）：附 Excel 数据源一句话下单，插件自动跳转表单页、逐行读取、自动填入并提交，结尾与源数据分屏核对。

- ▶️ 中文版：[在线观看（Bilibili）](https://www.bilibili.com/video/BV1E5Hf6WECq/)
- ▶️ 英文版：[Watch on YouTube](https://www.youtube.com/watch?v=mA1x2QiuXPo)

## 它能帮你做什么

- **一句话让它自动填复杂表单 + 上传附件** —— AI 自己找字段、输内容、点提交，Shadow DOM 和 React 受控组件都能穿透。
- **一键总结当前 Tab（B 站 / YouTube / PDF / 长文），导出为 Word 或 PDF** —— 输入 `@` 选中当前页，出结果，点导出。
- **定时盯一个网页** —— Cron / 间隔 / 一次性三种调度，按时重跑你的指令，把结果写入指定会话。
- **让 AI 直接读写你本地文件、跑终端命令** —— 可选本地 Agent，命令三级安全 + 7 天回收站兜底。
- **脚本生成的文件产物不再漏识别** —— AI 用脚本动态产出的文件（如导出的 Excel）也能进「文件产物」面板；回答里出现的文件路径可直接点击，一键在侧边栏自带的工作目录里定位高亮。
- **用自己的文档建知识库问答** —— PDF / Word / Excel / PPT / Markdown / HTML / CSV 一键导入本地知识库，检索增强回答附带可点击的引用来源，还支持多库同时检索。
- **不想打字就直接说** —— 输入框 🎤 或随时按 `Alt+V`（焦点在网页里也能触发）：边说边出草稿，松手后换高精度模型加标点、规整数字；识别全部在本地 Agent 完成，音频不出本机、不经任何云端 ASR。
- **任意厂商，两下切换** —— 保存多套 OpenAI 兼容厂商配置（地址 / Key / 模型列表），在侧边栏先选厂商、再选模型，随切随用。
- **任务完成不错过** —— 任务完成 / 失败、定时任务结束、AI 等待确认或澄清时弹出桌面通知，点击即可回到侧边栏。
- **亮 / 暗 / 跟随系统三态主题** —— 全站语义 token 化，侧边栏「更多」菜单与选项页「外观」两处入口即时切换，任一处改动其余页面无需刷新同步。

## 能力对比

| 维度 | 商业闭源浏览器 AI 插件 | 浏览器自动化代码框架 | 纯聊天侧边栏 | **AI Helper** |
|---|---|---|---|---|
| 是否开源 | 否 | 是 | 部分 | **是（MIT）** |
| 上手门槛 | 装插件 + 订阅 | 写 Python / JS | 装插件 | **装插件即用** |
| 真的点击 / 填表 / 上传文件 | 部分 | 是 | 否 | **是** |
| 本地文件读写 + 终端命令 | 否 | 需自建 | 否 | **是（可选 Agent）** |
| MCP 协议动态扩展 | 少数 | 需自建 | 否 | **是** |
| 内置本地知识库（RAG）+ 引用溯源 | 部分 | 需自建 | 否 | **是（可选 Agent）** |
| 本地语音输入（不调云端 ASR） | 否 | 需自建 | 否 | **是（可选 Agent）** |
| 多 Agent 协作 / 子任务分派 | 否 | 需自建 | 否 | **是** |
| 工具预选 + Token 预算省钱 | 否 | 需自建 | 否 | **是** |
| 反思质量保障 | 否 | 需自建 | 否 | **是** |
| 定时任务 + 断点续接 | 少数 | 需自建 | 否 | **是** |
| 数据本地 / 自主可控 | 否 | 是 | 部分 | **是** |

## 为什么不只是"另一个 AI 侧边栏"

- **反思质量保障**：预筛选 → 零成本工具观察提示 → 子任务反思 → 后置反思。每轮最终答案都会做 7 维度评分，未达标自动修订或重跑，不会把 LLM 原始输出直接甩给你。
- **子任务完成度客观取证**：`plan_task` 拆出的子任务可用 `doneCriteria` 声明验收标准，用真实 DOM / 命令证据（穿透 Shadow DOM / 同源 iframe）判断是否达成，而非依赖模型自述；可选开启自动重跑回路，四闸门驱动未达标子任务回炉（默认关闭时现有行为逐字节不变）。
- **工具预选省钱**：40+ 个工具定义全塞给主力模型 Token 会爆炸，先用一次轻量 API 缩到 5–10 个真正相关的，再喂给主模型。
- **Token 预算管理**：按 Token 数而非消息数截断，`tool_calls` / `tool` 消息配对永远不会被腰斩。
- **长引用自动压缩**：选中一大段网页也不会永远霸占上下文，自动摘要压缩，把空间留给真正相关的信息。
- **内置本地知识库（RAG）**：导入自有文档，向量 + 关键词混合检索，回答附引用来源；索引存在本机，文件不出本地。
- **语音输入完全不出本机**：用说的代替打 —— Agent 本地跑 ONNX 语音识别（流式草稿 + 高精度定稿双模型），不需要任何云端 ASR 或 API Key，音频不出本机。配套 24 根音量柱录音条、静音提示、焦点在网页也能用的 `Alt+V`、`Esc` 取消。
- **Checkpoint 断点续接 + SW 重启恢复**：长任务能扛住 Service Worker 静默重启，被中断后一键继续。
- **定时任务 + 长期记忆 + 文件回收站 + 审计日志**：这些"不出彩"的东西，才是把 AI 从聊天玩具变成能长期跑的生产力的关键。

## 典型场景

**场景 A：自动填复杂表单 + 上传文件。** 附上文件，告诉 AI 要填什么，看它自己找字段、输内容、点提交 —— Shadow DOM 和 React 受控组件都能穿透。[详细 →](docs/zh/DOCUMENTATION.md#22-shadow-dom-深度穿透)

**场景 B：一键总结当前 Tab 并导出。** 输入 `@` 选中当前标签页，让 AI 总结，然后从消息操作栏一键导出 Word / PDF / 图片 / JSON。[详细 →](docs/zh/DOCUMENTATION.md#14-消息操作)

**场景 C：定时任务盯网页。** 每天 9 点针对指定 URL 重跑一段指令，结果落到你选定的会话里。支持 Cron / 间隔 / 一次性三种调度，带运行历史和失败通知。[详细 →](docs/zh/DOCUMENTATION.md#30-定时任务)

**场景 D：向自己的知识库提问。** 启动 Agent 后，在选项页「知识库」创建知识库并导入文档，回到侧边栏直接提问 —— 回答会带着引用气泡，指向命中的原文片段。[技术细节 →](agent/README.zh-CN.md#知识库rag)

**场景 E：用说的代替打字。** 在选项页「工具箱 → 语音输入」一键安装可选组件、把模型包放进 Agent，之后随时按 `Alt+V`（读网页时也生效）。边说边出草稿；松手后高精度模型补标点、规整数字，**不自动发送**。[安装与模型包制作 →](docs/Voice-Input-Local-STT.md)

## 30 秒上手

1. **安装** —— [Chrome 应用商店](https://chromewebstore.google.com/detail/ai-helper-%E7%BD%91%E9%A1%B5%E6%99%BA%E8%83%BD%E5%8A%A9%E6%89%8B/fnolhphogjkdcmnecpeckhjoeofldiac) 或 [Microsoft Edge 扩展商店](https://microsoftedge.microsoft.com/addons/detail/ai-helper-%E7%BD%91%E9%A1%B5%E6%99%BA%E8%83%BD%E5%8A%A9%E6%89%8B/kabhmgfbkhpbfhhnokaafhkdbckeipcl) 一键装；或从 [GitHub Releases](https://github.com/xiweicheng/ai-helper/releases/latest) 下载自动构建的扩展包（`ai-helper-*.zip`），解压后在 `chrome://extensions/` 开启开发者模式，点击「加载已解压的扩展程序」选择解压后的文件夹。开发者可从源码构建：`npm install && npm run build` 后加载 `dist/` 目录。
2. **打开侧边栏** —— 按 `Ctrl+Shift+Y` / `Cmd+Shift+Y`，或点击扩展图标。
3. **填入 API Key** —— 选项页 → 基础设置。任何 OpenAI 兼容端点都行，默认预置 DeepSeek；可保存多套厂商配置随时切换。
4. **（可选）解锁本地文件 / 命令 / MCP / Skill / 知识库** —— 一键安装代理端：`curl -fsSL https://raw.githubusercontent.com/xiweicheng/ai-helper/main/install.sh | bash`（Windows: `irm https://raw.githubusercontent.com/xiweicheng/ai-helper/main/install.ps1 | iex`），或手动 `npm install -g ai-helper-agent && aha start -b`，把终端里的 6 位配对码填到选项页 → Agent。

需要 Chrome / Edge / Chromium 114+ 版本（Side Panel API）。

## 完整文档

上手之后的所有细节都放在完整技术参考里：

- **中文** —— 架构总览、34 项功能、40+ 工具、代理服务、配置说明、状态管理、常见问题 → [`docs/zh/DOCUMENTATION.md`](docs/zh/DOCUMENTATION.md)
- **English** —— architecture、34 features、40+ tools、Agent service、configuration、state management、FAQ → [`docs/en/DOCUMENTATION.md`](docs/en/DOCUMENTATION.md)
- **Wiki** —— 安装、功能、工具、代理、配置全站 → [中文](https://github.com/xiweicheng/ai-helper/wiki) · [English](https://github.com/xiweicheng/ai-helper/wiki/Home-EN)
- **文档站** —— <https://xiweicheng.github.io/ai-helper/>
- **技术文档站** —— RepoWiki 全站技术文档（离线全文搜索 + 目录树导航）<https://xiweicheng.github.io/ai-helper/wiki/> · 维护者刷新：`npm run build:docsite`（本地预览 `npm run preview:docsite`）
- **作品介绍** —— [`docs/AI-Helper-作品介绍文档.md`](docs/AI-Helper-作品介绍文档.md)

## 社区与贡献

- **GitHub 讨论组** —— <https://github.com/xiweicheng/ai-helper/discussions>
- **Issues** —— <https://github.com/xiweicheng/ai-helper/issues> · [`good first issue`](https://github.com/xiweicheng/ai-helper/labels/good%20first%20issue)
- 每个 Issue 24 小时内回复。
- 欢迎 PR —— 动手前建议先看 [架构总览](docs/zh/DOCUMENTATION.md#架构总览)。

## 赞助与合作伙伴

感谢以下赞助方以 Token 额度、算力、云资源或服务等方式支持本项目。作为回馈，项目通过 README、文档站等渠道为赞助方提供持续曝光与引流，欢迎更多互利合作。

| 赞助方 | 支持内容 | 链接 |
|---|---|---|
| **硅碳相变 Token工厂**（SiCore TokenWorks）· 北京硅碳相变智能技术有限公司<br><sub>OpenAI 兼容的 AI 大模型 API 聚合平台，一个密钥调用盘古 / DeepSeek / 通义千问 / 文心一言 / 豆包 / GPT / Claude / Gemini 等主流模型</sub> | 大模型 Token 额度赞助 | <https://www.token8341.com> |

有意赞助或合作？欢迎通过 [GitHub 讨论组](https://github.com/xiweicheng/ai-helper/discussions) 或 [Issues](https://github.com/xiweicheng/ai-helper/issues) 与我们联系。

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=xiweicheng/ai-helper&type=Date)](https://star-history.com/#xiweicheng/ai-helper&Date)

</div>

## License

MIT License · Copyright (c) 2026 AI Helper
