// skill/loader.js - Skill 文件加载器
// 从 ~/.ai-helper-agent/skills/ 目录加载 JSON/YAML 格式的 Workflow Skill 定义
// 同时扫描子目录中的 SKILL.md 加载 Agent Skill
import { readFileSync, readdirSync, existsSync, statSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { homedir } from 'os';
import { loadAllMarkdownSkills, saveMarkdownSkill, deleteMarkdownSkillDir, importMarkdownSkillFromZip, importMarkdownSkillFromUrl } from './markdown-loader.js';

const SKILLS_DIR = join(homedir(), '.ai-helper-agent', 'skills');

/**
 * Skill 定义 Schema 校验（Workflow 类型）
 * @param {Object} skill
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateWorkflowSkill(skill) {
  const errors = [];

  if (!skill.name || typeof skill.name !== 'string') {
    errors.push('缺少 name 字段');
  }
  if (!skill.description || typeof skill.description !== 'string') {
    errors.push('缺少 description 字段');
  }
  if (!skill.version) {
    skill.version = '1.0';
  }
  if (!skill.parameters) {
    skill.parameters = {};
  }
  if (!Array.isArray(skill.steps) || skill.steps.length === 0) {
    errors.push('steps 必须是非空数组');
  } else {
    skill.steps.forEach((step, i) => {
      if (!step.id) errors.push(`步骤 ${i}: 缺少 id`);
      if (!step.tool) errors.push(`步骤 ${i}: 缺少 tool`);
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 解析 YAML 文件内容（简易解析器，支持基本 YAML 特性）
 * 完整 YAML 解析需要 js-yaml 依赖，这里提供基本支持
 * 对于复杂 Skill 定义，推荐使用 JSON 格式
 */
function parseYaml(content) {
  // 简易 YAML 解析：仅支持基本结构
  // 对于包含多行字符串和嵌套的 Skill 定义，建议用 JSON
  try {
    // 尝试检测是否实际是 JSON
    JSON.parse(content);
    return null; // 是 JSON，让调用方用 JSON.parse
  } catch {
    // 简单的行解析（有限支持）
    const result = {};
    let currentKey = null;
    let currentArray = null;
    let inMultiline = false;
    let multilineKey = null;
    let multilineContent = [];

    const lines = content.split('\n');
    for (const line of lines) {
      // 跳过空行和注释
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed.endsWith('|') || trimmed.endsWith('|-')) {
        // 多行字符串开始
        multilineKey = trimmed.slice(0, -1).trim().replace(/:$/, '');
        inMultiline = true;
        multilineContent = [];
        continue;
      }

      if (inMultiline) {
        if (trimmed.startsWith('-') || line.match(/^\s{0,2}\w+:/)) {
          // 新的键值对开始，结束多行
          result[multilineKey] = multilineContent.join('\n');
          inMultiline = false;
        } else if (line.startsWith('  ') || line.startsWith('\t')) {
          multilineContent.push(trimmed);
          continue;
        } else if (trimmed === '') {
          multilineContent.push('');
          continue;
        }
      }
    }

    if (inMultiline) {
      result[multilineKey] = multilineContent.join('\n');
    }

    return result;
  }
}

/**
 * 加载单个 Skill 文件
 * @param {string} filePath
 * @returns {Object|null} - Skill 定义或 null
 */
function loadSkillFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const ext = extname(filePath).toLowerCase();

    let skill;
    if (ext === '.json') {
      skill = JSON.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
      // YAML 支持有限，推荐使用 JSON 格式
      const parsed = parseYaml(content);
      if (!parsed) {
        // parseYaml 返回 null 表示实际是 JSON
        skill = JSON.parse(content);
      } else {
        skill = parsed;
      }
    } else {
      return null;
    }

    if (!skill || typeof skill !== 'object') return null;

    const validation = validateWorkflowSkill(skill);
    if (!validation.valid) {
      console.warn(`[Skill Loader] "${filePath}" 校验失败:`, validation.errors.join(', '));
      return null;
    }

    skill._filePath = filePath;
    skill.enabled = skill.enabled !== false; // 默认启用
    skill.type = 'workflow';
    return skill;
  } catch (err) {
    console.warn(`[Skill Loader] 加载 "${filePath}" 失败:`, err.message);
    return null;
  }
}

/**
 * 扫描并加载所有 Skill 文件（Workflow + Agent）
 * @returns {Object[]} - Skill 定义数组
 */
export function loadAllSkills() {
  let allSkills = [];

  // 加载 Workflow Skills（JSON/YAML 文件）
  if (existsSync(SKILLS_DIR)) {
    let files;
    try {
      files = readdirSync(SKILLS_DIR);
    } catch (err) {
      console.warn('[Skill Loader] 读取 Skills 目录失败:', err.message);
      files = [];
    }

    for (const file of files) {
      const ext = extname(file).toLowerCase();
      if (ext !== '.json' && ext !== '.yaml' && ext !== '.yml') continue;

      const filePath = join(SKILLS_DIR, file);
      try {
        const fstat = statSync(filePath);
        if (!fstat.isFile()) continue;
      } catch { continue; }

      const skill = loadSkillFile(filePath);
      if (skill) {
        skill.type = 'workflow';
        allSkills.push(skill);
        console.log(`[Skill Loader] 加载 Workflow Skill: "${skill.name}" v${skill.version} (${skill.steps.length} 步骤)`);
      }
    }
  }

  // 加载 Agent Skills（子目录中的 SKILL.md）
  const agentSkills = loadAllMarkdownSkills(SKILLS_DIR);
  allSkills = allSkills.concat(agentSkills);

  console.log(`[Skill Loader] 共加载 ${allSkills.length} 个 Skill (${allSkills.filter(s => s.type === 'workflow').length} Workflow + ${allSkills.filter(s => s.type === 'agent').length} Agent)`);
  return allSkills;
}

/**
 * 保存 Skill 到文件（支持 Workflow 和 Agent 类型）
 * @param {Object} skill - Skill 定义
 * @returns {{ success: boolean, error?: string, filePath?: string }}
 */
export function saveSkillFile(skill) {
  try {
    if (!existsSync(SKILLS_DIR)) {
      mkdirSync(SKILLS_DIR, { recursive: true });
    }

    // Agent Skill：保存到子目录
    if (skill.type === 'agent') {
      return saveMarkdownSkill(SKILLS_DIR, skill);
    }

    // Workflow Skill：保存为 JSON 文件
    const validation = validateWorkflowSkill(skill);
    if (!validation.valid) {
      return { success: false, error: `校验失败: ${validation.errors.join(', ')}` };
    }

    const safeSkill = {
      name: skill.name,
      description: skill.description,
      version: skill.version || '1.0',
      enabled: skill.enabled !== false,
      parameters: skill.parameters || {},
      steps: skill.steps || []
    };

    const filePath = join(SKILLS_DIR, `${skill.name}.json`);
    writeFileSync(filePath, JSON.stringify(safeSkill, null, 2), 'utf-8');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: `保存失败: ${err.message}` };
  }
}

/**
 * 删除 Skill 文件（支持 Workflow 和 Agent 类型）
 * @param {string} name - Skill 名称
 * @param {string} [type] - Skill 类型（'workflow' | 'agent'），不传则尝试两种
 */
export function deleteSkillFile(name, type) {
  // Agent Skill：删除整个子目录
  if (type === 'agent') {
    return deleteMarkdownSkillDir(SKILLS_DIR, name);
  }

  // Workflow Skill：删除 JSON 文件
  const jsonPath = join(SKILLS_DIR, `${name}.json`);
  if (!existsSync(jsonPath)) {
    // 如果 JSON 不存在但 type 未指定，尝试作为 Agent Skill 删除
    if (!type) {
      const agentResult = deleteMarkdownSkillDir(SKILLS_DIR, name);
      if (agentResult.success) return agentResult;
    }
    return { success: false, error: `Skill "${name}" 不存在` };
  }
  try {
    unlinkSync(jsonPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: `删除失败: ${err.message}` };
  }
}

/**
 * 获取代码内置技能列表
 * 这些技能不存储在文件系统中，而是硬编码在代码里。
 * 内置技能的特点：
 * - 随代码发布，无需用户手动导入
 * - 不可编辑、不可删除，但可以停用
 * - 最终用户通过 skill-creator 生成的技能仍存放在 SKILLS_DIR 中
 * @returns {Object[]}
 */
export function getBuiltinSkills() {
  return [
    {
      type: 'agent',
      name: 'skill-creator',
      description: '创建新技能的元技能。当用户要求创建技能、沉淀技能、新增技能、或任何创建/添加技能的意图时，必须立即调用此技能。',
      version: '1.0.0',
      enabled: true,
      builtin: true,
      editable: false,
      deletable: false,
      resources: [],
      dirPath: null,
      skillMdPath: null,
      _filePath: null,
      prompt: `## When to Use

**必须在以下情况立即调用此技能：**
- 用户说"创建技能"、"沉淀技能"、"新增技能"、"添加技能"
- 用户说"把这个模式保存为技能"
- 用户说"我想以后也能用这个流程"
- 用户要求将某个操作规范化为可复用的技能

**不要做：**
- 仅解释如何创建技能而不实际创建
- 在未调用此技能的情况下手动指导创建
- 推迟技能创建到后续步骤

**重要安全约束**：\`~/.ai-helper-agent/\` 根目录是受限目录，AI 不能访问。唯一允许操作的是 \`~/.ai-helper-agent/skills/\` 子目录。禁止先探索父目录再找子目录。

## 技能目录结构

所有用户创建的技能存放在 \`~/.ai-helper-agent/skills/\` 目录下（SKILLS_DIR）：

\`\`\`
~/.ai-helper-agent/skills/<skill-name>/
├── SKILL.md          # 技能定义文件（必需）
└── _meta.json        # 元数据（可选）
\`\`\`

**禁止**：不要用 ls/readdir 探索 ~/.ai-helper-agent/ 或 ~/.ai-helper-agent/skills/。直接到目标目录操作。

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

**重要安全约束**：\`~/.ai-helper-agent/\` 根目录是受限目录，AI 不能访问。唯一允许操作的是 \`~/.ai-helper-agent/skills/\` 子目录。禁止先探索父目录再找子目录。

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

4. **直接创建文件**：一步到位，直接在 \`~/.ai-helper-agent/skills/<skill-name>/\` 下操作。
   - **禁止**先 \`ls\` 查看 \`~/.ai-helper-agent/\` 或 \`~/.ai-helper-agent/skills/\` 目录（前者无权限，后者不必要）
   - 直接 \`mkdir -p ~/.ai-helper-agent/skills/<skill-name>/\` 创建子目录
   - 直接写入 \`~/.ai-helper-agent/skills/<skill-name>/SKILL.md\`
   - 创建完成后，告知用户在工具箱页面点击「重新加载」使技能生效

5. **告知用户**：创建完成后，告知用户技能已就绪，说明触发关键词

## 技能质量标准

创建技能前验证：

- [ ] 解决方案经过验证且有效
- [ ] 内容脱离原始对话上下文后依然清晰可理解
- [ ] 触发条件明确，模型能准确识别
- [ ] description 包含功能描述和触发场景两部分
- [ ] 名称符合小写+连字符规范
- [ ] 代码示例完整且可独立运行
- [ ] 如有参考文档，在文中提供链接`,
      fullPrompt: `# Skill Creator

此技能用于在对话过程中即时创建和沉淀新技能。当用户在对话中发现有价值的操作模式、最佳实践或知识时，通过此技能将其固化为可复用的 SKILL.md 文件。

## When to Use

**必须在以下情况立即调用此技能：**
- 用户说"创建技能"、"沉淀技能"、"新增技能"、"添加技能"
- 用户说"把这个模式保存为技能"
- 用户说"我想以后也能用这个流程"
- 用户要求将某个操作规范化为可复用的技能

**不要做：**
- 仅解释如何创建技能而不实际创建
- 在未调用此技能的情况下手动指导创建
- 推迟技能创建到后续步骤

**重要安全约束**：~/.ai-helper-agent/ 根目录是受限目录，AI 不能访问。唯一允许操作的是 ~/.ai-helper-agent/skills/ 子目录。禁止先探索父目录再找子目录。

## 技能目录结构

所有用户创建的技能存放在 ~/.ai-helper-agent/skills/ 目录下：

\`\`\`
~/.ai-helper-agent/skills/<skill-name>/
├── SKILL.md
└── _meta.json
\`\`\`

**禁止**：不要用 ls/readdir 探索 ~/.ai-helper-agent/ 或 ~/.ai-helper-agent/skills/。直接到目标目录操作。

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

4. **直接创建文件**：一步到位，直接在 ~/.ai-helper-agent/skills/<skill-name>/ 下操作。
   - **禁止**先 ls 查看 ~/.ai-helper-agent/ 或 ~/.ai-helper-agent/skills/ 目录（前者无权限，后者不必要）
   - 直接 mkdir -p ~/.ai-helper-agent/skills/<skill-name>/ 创建子目录
   - 直接写入 ~/.ai-helper-agent/skills/<skill-name>/SKILL.md
   - 创建完成后，告知用户在工具箱页面点击「重新加载」使技能生效

5. **告知用户**：创建完成后，告知用户技能已就绪，说明触发关键词

## 技能质量标准

创建技能前验证：

- [ ] 解决方案经过验证且有效
- [ ] 内容脱离原始对话上下文后依然清晰可理解
- [ ] 触发条件明确，模型能准确识别
- [ ] description 包含功能描述和触发场景两部分
- [ ] 名称符合小写+连字符规范
- [ ] 代码示例完整且可独立运行
- [ ] 如有参考文档，在文中提供链接`
    }
  ];
}

export { SKILLS_DIR };
export { saveMarkdownSkill, deleteMarkdownSkillDir, importMarkdownSkillFromZip, importMarkdownSkillFromUrl };
