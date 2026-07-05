# AI Helper 社交媒体推文合集

> 适合平台：Twitter/X、微博、LinkedIn、即刻  
> 用法：根据平台选择对应风格的推文，可直接复制发布

---

## 一、Twitter/X 推文（英文，Thread 形式）

### Thread 1：产品发布主推文

```
🧵 Introducing AI Helper — an open-source Chrome extension 
that turns your browser into an AI Agent.

Not just another chat sidebar. It thinks, acts, and automates.

Here's what makes it different 👇
```

```
1/ ReAct Reasoning Loop

Your task → AI thinks → picks tools → executes → learns → continues

It doesn't just answer questions. It completes tasks.

"Export this page's tables to Excel" → DONE.
"Fill this form with my data" → DONE.
```

```
2/ 62 Built-in Browser Tools

Content extraction, page interaction, tab management, 
screenshot, file download, form filling, cookie management...

Your browser becomes an operating system.
```

```
3/ Multi-Agent Collaboration

5 built-in agents: Code Reviewer, Data Analyst, Web Automator, 
Doc Writer, General Assistant.

Create custom agents with their own tools and prompts.
Switch with @mentions.
```

```
4/ Local Agent Service (optional)

Break out of the browser sandbox:
• Read/write files on your machine
• Execute terminal commands
• Build reusable Skills
• Connect MCP tools

All with path sandboxing and command whitelisting.
```

```
5/ 3-Level Quality Reflection

Every answer goes through self-evaluation:
• Tool-level: Did the tool work?
• Sub-task: Is the result complete?
• Final: 7-dimension quality score

Below threshold → auto-revise or retry.
```

```
6/ Privacy First

API keys go directly to model providers. No middleman server.
MIT License. Fully open-source. Auditable.

You own your data. You control your keys.
```

```
7/ Tech Stack

Vanilla JS + Vite + Chrome Manifest V3
No framework overhead. Clean architecture.
IndexedDB persistence. WebSocket real-time output.

github.com/[your-repo]/ai-helper

Star it if you find it useful! ⭐
```

---

### Thread 2：技术亮点推文

```
🧵 How AI Helper's ReAct loop achieves 60-80% Token savings:

Every LLM call costs tokens. With 62 tools, sending all 
tool definitions every time is wasteful.

Here's the trick: Tool Pre-screening 🎯
```

```
Before the main LLM call, we run a lightweight API call 
that scores each tool's relevance to the user's query.

Only the top 5-10 tools get injected into the prompt.

Result: 60-80% fewer tokens, better task completion.
```

```
But that's not all. We also do dynamic Token budgeting:

Total budget = model context window × 0.8
Remaining = budget - (system + tools + history + results)

When low: compress results, summarize early messages.
Never blindly "keep last N messages".
```

```
And when multiple tools have no dependencies?

Parallel execution via Promise.all.

"Open these 3 websites" → 3 tabs open simultaneously.
No waiting for sequential rounds.
```

```
The result: a reasoning engine that's both smarter 
and cheaper than naive implementations.

Open source. Check the code → github.com/[repo]/ai-helper
```

---

## 二、微博推文（中文，适合国内传播）

### 推文 1：产品介绍

```
发现一个超强的开源浏览器 AI 插件——AI Helper。

不是那种只能聊天的 AI 侧边栏，而是真正能操作浏览器的 AI Agent。

几个让我震惊的功能：
1. 说"导出这个页面的表格"→ 自动识别→提取→导出 Excel
2. 说"帮我把这三个网站都打开"→ 一键打开三个标签页
3. 说"审查这段代码的安全性"→ 自动分析+输出报告

62 个内置工具，5 个专业 AI 助手，完全开源 MIT 协议。

装上之后，浏览器就变成了 AI 工作站。

项目地址：[链接]  #AI工具 #Chrome插件 #效率工具 #开源
```

### 推文 2：场景化推广

```
分享一个我最近离不开的浏览器插件。

平时工作里那些重复的网页操作：提取表格、填写表单、翻译文章、对比竞品...现在全都可以用一句话搞定。

关键是开源的，不经过第三方服务器，API Key 直接连模型厂商，数据隐私有保障。

支持 DeepSeek、通义千问、GPT-4 等 30+ 模型。

免费，不用订阅。

[链接] #效率提升 #AI助手
```

### 推文 3：对比向

```
市面上的 AI 浏览器插件我基本都用过：Monica、Sider、Copilot...

大多数本质上是"带网页上下文的聊天框"——只能回答问题，不能实际操作浏览器。

AI Helper 是目前唯一一个开源的、能真正操作浏览器的 AI Agent：
- 能提取表格数据
- 能自动填表单
- 能切换标签页
- 能执行本地命令

差距就像智能音箱和智能手机那么大。

[链接] #AI #浏览器插件
```

---

## 三、LinkedIn 推文（专业风格，英文）

```
I've been exploring open-source AI browser agents, and 
AI Helper stands out for its architectural depth.

What impresses me most is the ReAct reasoning loop with 
tool pre-screening — by filtering 62 tools down to 5-10 
relevant ones before each LLM call, they achieve 60-80% 
token savings without sacrificing task quality.

The 3-level reflection system is also worth studying:
Each answer goes through tool-level, sub-task, and final 
7-dimension quality evaluation before being shown to the user.

For teams building AI agents, this is a great reference 
implementation. MIT licensed, vanilla JS, clean architecture.

Check it out: [link]

#AIAgents #OpenSource #ChromeExtension #LLM
```

---

## 四、即刻动态（短平快）

```
发现一个好东西 🎉

开源 AI 浏览器插件 AI Helper，一句话总结：

"ChatGPT 的脑子 + 浏览器的双手 + 你自己的 API Key"

不用订阅，不用中间服务器，数据不经过第三方。
62 个内置工具，能自动操作网页、提取数据、执行命令。

GitHub 开源的，懂的都懂 →

[链接]
```

---

## 五、小红书种草文案

```
📌 标题：这个免费插件让我的浏览器学会了"干活"

💡 不知道有没有人和我一样，每天要在浏览器里做很多重复的事：
提取表格数据、翻译文章、填各种表单、对比竞品网站...

直到我发现了一个开源的 AI 浏览器插件——AI Helper

🌟 和其他 AI 插件不一样的地方：
❌ 普通的 AI 插件：只能聊聊天，问个问题
✅ AI Helper：能直接操作浏览器，帮你干活

🎯 我常用的几个功能：

1️⃣ 网页表格提取
选中表格 → 一句话 → 自动导出 Excel
以前手动复制粘贴半小时，现在 3 秒

2️⃣ 划词翻译/解释
选中任何文字 → 浮动工具栏 → 一键翻译/解释
不用切换到其他翻译网站

3️⃣ 多页面自动化
"帮我把这三个网站都打开，提取它们的定价信息"
它会自动打开、提取、对比、输出报告

4️⃣ 代码审查
把 PR 页面发给代码审查助手，自动输出安全+性能分析

💰 关于费用：
✅ 完全免费（插件本身不收钱）
✅ API 费用直接付给模型厂商（DeepSeek 有免费额度）
✅ 不需要订阅，不需要注册

🔒 隐私安全：
开源代码可以审查，API Key 直连模型厂商
不经过第三方服务器，数据不会泄露

🔗 项目地址在评论区置顶

#效率工具 #浏览器插件 #AI工具 #免费好用 #程序员日常
```

---

## 六、发布策略建议

### 时间安排（以一周为周期）

| 日期 | 平台 | 内容 |
|------|------|------|
| 周一 | Product Hunt + Twitter | 产品发布主 Thread |
| 周二 | 掘金 + 知乎 | 综合介绍文章 |
| 周三 | V2EX + SegmentFault | 技术深度文章 |
| 周四 | 少数派 + 微博 | 场景化推广 |
| 周五 | Reddit + Hacker News | 技术亮点 Thread |
| 周末 | 小红书 + 即刻 | 种草文案 |

### 互动策略
1. 每条推文发布后 2 小时内保持在线回复评论
2. 在相关话题下"蹭热度"（如 #AI #Chrome 扩展 #开源项目）
3. 在 V2EX/Reddit 的评论区真诚回答技术问题
4. 准备 3-5 张高质量截图/GIF 作为配图

---

*本文发布于 [GitHub AI Helper 项目页]。欢迎转载，请注明出处。*
