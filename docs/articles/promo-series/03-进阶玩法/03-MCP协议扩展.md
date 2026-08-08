# MCP 协议接入：让 AI 的能力没有边界

> 适合平台：SegmentFault、掘金
> 关键词：MCP、Model Context Protocol、工具扩展、Chrome 扩展
> 阅读时间：约 5 分钟

---

## 44 个工具够用吗？

AI Helper 内置了 44 个工具，覆盖了页面提取、表单操作、标签管理、截图下载等浏览器场景。日常使用基本够用。

但总有些需求超出了浏览器的边界：

- 想让 AI 直接查询你的数据库？
- 想让 AI 操作你的 GitHub 仓库——创建 Issue、合并 PR？
- 想让 AI 调用公司内部的 API 接口？

这些能力不可能内置在扩展里——每个用户的需求都不一样。你需要一种方式，让 AI 能按需接入外部工具。

这就是 MCP 的用武之地。

---

## MCP 是什么？

MCP（Model Context Protocol）是一个标准化的 AI 工具协议。简单说，它定义了一套规则：AI 怎么发现外部工具、怎么调用外部工具、怎么接收返回结果。

你可以把 MCP 理解成"AI 的 USB 接口"——任何服务只要实现了 MCP 协议，AI 就能直接调用它，不需要为每个服务单独写集成代码。

MCP 生态已经相当丰富：GitHub、GitLab、数据库、Slack、Notion、文件系统……都有现成的 MCP Server 实现。你只需要配置连接，AI 就能用上这些能力。

---

## AI Helper 的 MCP 实现

AI Helper 对 MCP 的实现有几个值得关注的设计点：

### JSON-RPC 2.0 通信

MCP Client 和 MCP Server 之间用 JSON-RPC 2.0 协议通信。这是一个轻量级的远程调用协议，请求和响应都是 JSON 格式，易于调试和排查。

### 多传输协议支持

默认使用 stdio 传输——MCP Server 作为子进程启动，通过标准输入输出通信。同时也支持 SSE、Streamable HTTP、WebSocket 三种网络传输方式，适应不同的部署场景。

### 多服务器同时连接

你可以同时连接多个 MCP Server。比如一个 GitHub Server 管仓库，一个数据库 Server 查数据，一个 Slack Server 发消息。所有 Server 的工具会自动合并到一个工具列表里，按 Server 名称分组。

### 工具自动合并注入

这是最关键的设计。MCP 工具不需要你手动选择——连接成功后，工具会自动注入到 AI 的可用工具列表里，和内置的 44 个工具一起参与工具预筛选。每个 MCP 工具的 ID 格式是 `mcp_{serverId}_{toolName}`，描述前缀是 `[MCP:服务器名]`，方便区分来源。

每次 Agent 连接或 MCP Server 状态变化时，系统会自动拉取最新的工具列表刷新缓存。AI 在推理循环中使用工具预筛选时，MCP 工具和内置工具一视同仁，按相关性自动选择。

---

## 配置方式：三步接入

接入一个 MCP Server 只需要三步：

**第一步**：打开选项页，进入 Toolbox 标签，找到 MCP 区域。

**第二步**：点击"添加 MCP Server"，填写配置：
- Server ID：唯一标识，比如 `github`
- Server 名称：显示用，比如 `GitHub MCP`
- 传输方式：默认 stdio
- 启动命令：比如 `npx`
- 参数：比如 `-y @modelcontextprotocol/server-github`

**第三步**：点击连接。如果配置正确，几秒后会显示"已连接"，并列出该 Server 提供的工具列表。

### 环境变量配置

很多 MCP Server 需要认证 Token。比如 GitHub MCP Server 需要 `GITHUB_PERSONAL_ACCESS_TOKEN`。AI Helper 支持为每个 Server 配置独立的环境变量，敏感值用密码输入框填写，不会明文显示。

---

## 快速选择：MCP 标签页

和 Skill 一样，MCP 服务也集成在输入框的下拉菜单里。切到"MCP"标签页，可以看到所有已连接的 MCP Server 及其工具数量。

选中某个 MCP 服务后，输入框会带上提示："请使用 GitHub MCP 服务来处理以下问题"。AI 收到后会优先使用该 Server 的工具来完成任务。

当然，即使不手动选择，AI 也会在工具预筛选阶段自动判断是否需要使用 MCP 工具。手动选择只是给 AI 一个更明确的信号。

---

## 全局开关

和 Skill 一样，Toolbox 里有一个全局开关可以一键启停所有 MCP 服务。关掉后，所有 MCP Server 断开连接，工具从列表中移除，不占用 Token。需要时一键开启即可。

每个 MCP Server 也可以单独启停——暂时不用的关掉，减少不必要的子进程。

---

## 实际场景

### 场景一：接入 GitHub MCP

配置 GitHub MCP Server 后，AI 可以直接：

- "列出我仓库里所有未关闭的 Issue"
- "给 PR #42 加一条 review 评论"
- "创建一个新分支并提交修改"

AI 会调用 `mcp_github_list_issues`、`mcp_github_create_comment` 等工具完成操作，全程在侧边栏里对话完成，不需要切换到 GitHub 网页。

### 场景二：接入数据库 MCP

配置一个数据库 MCP Server（比如 PostgreSQL），AI 可以直接查询数据：

- "查一下过去 7 天的订单量趋势"
- "找出消费金额 Top 10 的用户"

AI 调用 `mcp_postgres_query` 工具执行 SQL，拿到结果后自动分析并可视化呈现。

---

## 和 Skill 的区别

经常有人问：MCP 和 Skill 有什么区别？

| 维度 | Skill | MCP |
|------|-------|-----|
| 本质 | 预定义的工作流（步骤固定或半固定） | 实时工具调用（AI 自主决定怎么用） |
| 执行方式 | 按定义的步骤依次/并行执行工具 | AI 推理决定调用哪个工具、传什么参数 |
| 灵活性 | Workflow Skill 确定性高，Agent Skill 有一定灵活性 | 完全由 AI 自主决策 |
| 适用场景 | 重复性、流程化的多步骤任务 | 需要实时与外部系统交互的任务 |

一句话总结：**Skill 是你教 AI 怎么做，MCP 是给 AI 新工具让它自己做。**

两者可以配合使用——比如创建一个 Agent Skill，在执行步骤里调用 MCP 工具来完成特定操作。

---

## 小结

MCP 协议让 AI Helper 的能力边界从浏览器扩展到了整个系统。44 个内置工具覆盖通用场景，MCP 负责长尾需求——你需要什么能力，就接入什么 Server。多服务器并行连接、工具自动合并、预筛选一视同仁，用起来和内置工具没有区别。

如果你有重复性的外部系统交互需求，试试接入对应的 MCP Server，会发现 AI 的能力又上了一个台阶。

---

**项目地址：**
- GitHub：[https://github.com/xiweicheng/ai-helper](https://github.com/xiweicheng/ai-helper)
- Gitee：[https://gitee.com/xiweicheng/ai-helper](https://gitee.com/xiweicheng/ai-helper)
