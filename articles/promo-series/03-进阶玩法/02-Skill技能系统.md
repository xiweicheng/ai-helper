# Skill 技能系统：把常用工作流沉淀为可复用技能

> 适合平台：掘金、V2EX
> 关键词：Skill、工作流、自动化、Chrome 扩展
> 阅读时间：约 5 分钟

---

## 痛点：重复劳动是最大的浪费

你有没有这种体验：每次让 AI 提取网页表格并导出 Excel，都要重新描述一遍——先提取表格、再格式化、再生成文件下载。说一次还好，说十次就烦了。

更烦的是，AI 每次的执行路径还不太一样：有时候先提取再格式化，有时候先分析结构再提取。结果不稳定，你得盯着看。

AI Helper 的 Skill 技能系统就是解决这个问题的：**把一次性的操作流程沉淀成可复用的技能，以后一键调用。**

---

## 两种 Skill，覆盖两种场景

### Workflow Skill：确定性工作流

Workflow Skill 用 JSON 或 YAML 定义，步骤固定、参数可配、支持条件跳过。适合那些"每次执行路径都一样"的任务。

看一个真实的 Workflow Skill 定义：

```json
{
  "name": "project-report",
  "description": "生成项目报告：列出目录结构、搜索 JS 文件、统计代码量",
  "version": "1.0",
  "parameters": {
    "type": "object",
    "properties": {
      "targetDir": { "type": "string", "description": "要分析的目标目录路径" }
    },
    "required": ["targetDir"]
  },
  "steps": [
    { "id": "list-dir", "tool": "agent_file", "args": { "action": "list", "path": "{{targetDir}}" } },
    { "id": "search-js", "tool": "agent_search", "args": { "searchType": "file", "pattern": "*.js" }, "dependsOn": ["list-dir"] },
    { "id": "count-lines", "tool": "agent_exec", "args": { "command": "find {{targetDir}} -name '*.js' | xargs wc -l | tail -1" }, "dependsOn": ["search-js"] }
  ]
}
```

几个关键设计：

- **参数验证**：`parameters` 用 JSON Schema 定义，必填参数缺失会直接报错，不会让 AI 瞎猜
- **模板变量**：`{{targetDir}}` 会在执行时替换为实际传入的值
- **步骤依赖**：`dependsOn` 声明步骤间的前后关系，没有依赖的步骤可以并行执行
- **工具调用**：每个 step 直接调用一个工具（`agent_file`、`agent_search`、`agent_exec`），不需要 AI 推理"下一步该干什么"

执行结果是确定性的——同样的输入，永远得到同样的输出。

### Agent Skill：AI 自主调用

Agent Skill 用 SKILL.md 格式定义，是一段 Markdown 文档，告诉 AI"什么时候用这个技能"和"怎么用"。AI 根据对话上下文自主判断是否调用。

```markdown
---
name: project-report
description: 生成项目报告：分析目录结构、统计代码量、识别关键文件
version: 1.0
---

# 项目报告生成器

## 何时使用
- 用户要求分析项目目录结构
- 用户想要统计项目的代码行数
- 用户要求生成项目概览报告

## 执行步骤
1. 使用 agent_file 列出目标目录的顶层结构
2. 使用 agent_search 搜索所有 .js 文件
3. 使用 agent_exec 统计 JS 文件总行数
4. 汇总结果以表格形式呈现

## 参数
- targetDir：要分析的目标目录路径（必填）
```

区别在于：Workflow Skill 是"照着菜谱做菜"，步骤写死了；Agent Skill 是"给厨师一张菜谱让他自己发挥"，AI 读了之后自主决定怎么执行，甚至可以根据实际情况调整步骤。

**怎么选？** 结果必须稳定的选 Workflow，需要灵活应变的选 Agent。

---

## skill-creator：从对话中直接创建

这是最省心的创建方式。

你在对话中发现某个操作流程很好用，直接跟 AI 说：

> 把刚才这个流程沉淀成一个技能，名字叫"网页表格提取并导出"。

AI Helper 内置了 `skill-creator` 元技能。听到这个指令后，AI 会自动：
1. 回顾刚才的对话，提取操作步骤
2. 生成 SKILL.md 文件，写入 `~/.ai-helper-agent/skills/` 目录
3. 告诉你技能已创建完成

不需要你手写任何 JSON 或 Markdown，AI 帮你搞定。

---

## 四种导入方式

除了从对话中创建，还支持四种导入方式：

| 方式 | 适用场景 |
|------|----------|
| JSON 文件上传 | 导入别人分享的 Workflow Skill |
| 直接写 Markdown | 手写 Agent Skill，适合开发者 |
| Zip 包导入 | 带资源的技能包（比如附带脚本和模板文件） |
| URL 下载 | 从网上直接下载技能，一行 URL 搞定 |

Zip 包导入特别有用——一个技能可能需要附带 shell 脚本、模板文件等资源，打成 Zip 一起导入，目录结构自动解压到技能目录下。

---

## 技能编辑器：可视化修改

创建技能只是第一步，后续还需要维护和优化。

AI Helper 提供了内置的技能编辑器，可以可视化编辑 SKILL.md 文件——修改描述、更新版本号、管理资源文件、调整触发条件。不用命令行，不用文本编辑器，在选项页里直接改。

---

## 日常使用：下拉框一选就行

技能创建好之后，使用方式非常轻量。

在侧边栏输入框上方有一个下拉菜单，点开能看到几个标签页：Prompt（提示词）、Skills（技能）、MCP（MCP 服务）。切到 Skills 标签，搜索技能名称，选中即可。

选中 Workflow Skill 后，如果你配置了参数，输入框会自动带上参数提示，你只需要填入具体值然后发送。

选中 Agent Skill 后，输入框会提示 AI 使用 `agent_skill`（action=load）加载技能的完整说明，然后自主执行。

整个流程：选技能 -> 填参数 -> 发送，三步搞定。

---

## 全局开关：不想用的随时关

选项页的 Toolbox 标签里有一个全局开关，可以一键启停所有 Skill。

关掉之后，Skill 的提示词不会被注入到 AI 的上下文里，节省 Token。但注意：关闭的技能仍然可以在下拉框里手动选择使用，只是不会自动触发。

这个设计很贴心——有些技能你只是偶尔用，不需要每次对话都注入到上下文里占 Token，但想用的时候又能快速找到。

---

## Agent 侧执行：连接代理后解锁完整能力

Skill 的执行依赖本地代理服务（Node.js Agent）。连接代理后：

- Workflow Skill 通过 `agent_skill`（action=run）执行，引擎按 steps 定义依次调用工具
- Agent Skill 通过 `agent_skill`（action=load）加载完整说明，AI 读取后自主调用相关工具

两种方式都需要代理服务提供文件操作、命令执行等底层能力。如果没连代理，Skill 只能用浏览器侧的工具（比如页面提取、截图），能力会受限。

---

## 实战案例：网页表格提取并导出 Excel

假设你经常需要从各种网页提取表格数据并导出，每次都要跟 AI 解释一遍流程。用 Skill 一次性解决：

1. 打开一个有表格的网页，让 AI 提取并导出
2. 完成后说"把这个流程沉淀成技能"
3. skill-creator 自动生成技能定义，包含：提取表格 -> 格式化数据 -> 生成 CSV -> 触发下载
4. 以后打开任何网页，选这个技能，说"提取这个页面的表格"就行

从"每次描述三分钟"变成"选技能说一句话"。

---

## 小结

Skill 技能系统的本质是**知识沉淀**——把一次性的操作流程固化成可复用的资产。Workflow Skill 保证确定性，Agent Skill 保留灵活性，skill-creator 降低创建门槛，四种导入方式方便分享传播。

用得越多，积累的技能越多，AI Helper 就越懂你的工作习惯。

---

**项目地址：**
- GitHub：[https://github.com/xiweicheng/ai-helper](https://github.com/xiweicheng/ai-helper)
- Gitee：[https://gitee.com/xiweicheng/ai-helper](https://gitee.com/xiweicheng/ai-helper)
