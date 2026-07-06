// skill/skill-creator-seed.js
// skill-creator 技能的种子 SKILL.md 内容
// 当 ~/.ai-helper-agent/skills/skill-creator/ 目录不存在时自动写入

export const SKILL_CREATOR_DIR = 'skill-creator';

export const SKILL_CREATOR_SEED_MD = `---
name: skill-creator
description: "创建新技能的元技能。当用户要求创建技能、沉淀技能、新增技能、或任何创建/添加技能的意图时，必须立即调用此技能。"
enabled: true
version: 1.1.0
---

# Skill Creator

此技能用于在对话过程中即时创建和沉淀新技能。当用户在对话中发现有价值的操作模式、最佳实践或知识时，通过此技能将其固化为可复用的 SKILL.md 文件。

## When to Use

**必须在以下情况立即调用此技能：**
- 用户说"创建技能"、"沉淀技能"、"新增技能"、"添加技能"
- 用户说"把这个模式保存为技能"、"把这个流程沉淀为技能"
- 用户说"我想以后也能用这个流程"
- 用户要求将某个操作规范化为可复用的技能
- 用户说"更新技能"、"完善技能"、"改进技能"、"优化技能"、"增强技能"
- 用户说"更新 XX 技能"（XX 是已有技能名称）
- 用户在对话中完善了已有技能的操作流程后说"更新这个技能"
- 用户发现已有技能的缺陷并提供了改进方案

**不要做：**
- 仅解释如何创建技能而不实际创建
- 在未调用此技能的情况下手动指导创建
- 推迟技能创建到后续步骤

**重要安全约束**：不探索或列举 ~/.ai-helper-agent/ 根目录的内容。唯一允许操作的是 ~/.ai-helper-agent/skills/ 子目录中的目标技能目录。

## 技能目录结构

所有用户创建的技能存放在 ~/.ai-helper-agent/skills/ 目录下：

\`\`\`
~/.ai-helper-agent/skills/<skill-name>/
├── SKILL.md          # 技能定义文件（必需）
└── _meta.json        # 元数据（可选）
\`\`\`

## SKILL.md 标准格式

\`\`\`markdown
---
name: <skill-name>
description: "<简明描述，包含：(1) 技能做什么，(2) 何时触发调用。控制在200字符以内>"
enabled: true
---

# <技能标题>

## When to Use This Skill

- 触发条件1
- 触发条件2

## Core Capabilities

- 能力1
- 能力2

## Usage

### Step-by-Step

1. 步骤1
2. 步骤2

## Examples

[具体示例]

## Source

从对话中沉淀，创建日期：YYYY-MM-DD
\`\`\`

## 创建流程

1. **确认意图**：与用户简短确认技能名称和核心用途
   - 技能名称：小写字母 + 连字符（如 code-reviewer、api-error-handler）
   - 一句话描述这个技能解决什么问题

2. **生成 description**：description 是触发匹配的关键，必须包含：
   - 技能做什么（功能描述）
   - 什么时候触发调用（触发条件/场景关键词）
   - 示例格式："Does X. Invoke when Y happens or user asks for Z."

3. **收集内容**：基于当前对话上下文，提取核心内容：
   - 触发条件（什么时候该用这个技能）
   - 核心能力（这个技能提供什么）
   - 操作步骤（具体怎么做）
   - 示例（正例和反例）
   - 注意事项（容易踩的坑）

4. **创建技能目录**：
   - 使用 \`agent_exec_command\` 创建技能子目录。
   - **macOS/Linux**：\`mkdir -p ~/.ai-helper-agent/skills/<skill-name>\`
   - **Windows (cmd)**：\`mkdir %USERPROFILE%\\.ai-helper-agent\\skills\\<skill-name>\`
   - **Windows (PowerShell)**：\`New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\.ai-helper-agent\\skills\\<skill-name>"\`
   - 如果 \`mkdir\` 报错，尝试不带参数或使用 \`agent_write_file\` 工具在目标路径写入一个临时文件，让系统自动创建父目录。

5. **写入 SKILL.md**：使用 \`agent_write_file\` 工具将内容写入：
   - 路径：\`~/.ai-helper-agent/skills/<skill-name>/SKILL.md\`
   - Windows 上路径中的 \`~\` 会自动解析为用户主目录

6. **告知用户**：创建完成后，告知用户技能已就绪，说明触发关键词。建议用户在工具箱页面点击「重新加载」使技能生效。

## 更新流程（已有技能）

当用户要求更新/完善已有技能时：

1. **确认技能名称**：与用户确认要更新的技能名称
2. **读取现有内容**：使用 \`agent_read_file\` 读取目标 SKILL.md
3. **分析更新需求**：结合当前对话上下文，识别需要更新的部分
4. **合并内容**：保留原技能的核心结构，将新内容融入适当位置
5. **覆盖写入**：使用 \`agent_write_file\` 覆盖写入 SKILL.md
6. **告知用户**：告知更新内容，建议重新加载

## 更新注意事项

- 保留原技能的名称（frontmatter 中的 name 字段不变）
- 保留原技能的核心结构，只在必要时重构
- 更新后技能的触发条件应比以前更完善
- 每次更新都应使技能质量提升

## 技能质量标准

创建技能前验证：

- [ ] 解决方案经过验证且有效
- [ ] 内容脱离原始对话上下文后依然清晰可理解
- [ ] 触发条件明确，模型能准确识别
- [ ] description 包含功能描述和触发场景两部分
- [ ] 名称符合小写+连字符规范
- [ ] 代码示例完整且可独立运行
- [ ] 如有参考文档，在文中提供链接
`;
