// skill/loader.js - Skill 文件加载器
// 从 ~/.ai-helper-agent/skills/ 目录加载 JSON/YAML 格式的 Workflow Skill 定义
// 同时扫描子目录中的 SKILL.md 加载 Agent Skill
import { readFileSync, readdirSync, existsSync, statSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { homedir } from 'os';
import { loadAllMarkdownSkills, saveMarkdownSkill, deleteMarkdownSkillDir, importMarkdownSkillFromZip, importMarkdownSkillFromUrl } from './markdown-loader.js';
import { SKILL_CREATOR_SEED_MD, SKILL_CREATOR_DIR } from './skill-creator-seed.js';

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
 * 种子 skill-creator 内置技能到文件系统
 * 首次运行时将 skill-creator 的 SKILL.md 写入 ~/.ai-helper-agent/skills/skill-creator/
 * 之后用户可在工具箱中编辑、优化此技能（如调整为 Windows cmd 兼容）
 * @returns {boolean} 是否执行了种子写入
 */
export function seedSkillCreator() {
  const skillDir = join(SKILLS_DIR, SKILL_CREATOR_DIR);
  const skillMdPath = join(skillDir, 'SKILL.md');

  console.log(`[Skill Loader] seedSkillCreator: 检查路径 ${skillMdPath}`);
  console.log(`[Skill Loader] seedSkillCreator: 文件存在? ${existsSync(skillMdPath)}`);

  if (existsSync(skillMdPath)) {
    // 已存在，检查是否需要升级（版本号不同则覆盖）
    try {
      const content = readFileSync(skillMdPath, 'utf-8');
      const versionMatch = content.match(/^version:\s*([\d.]+)/m);
      const currentVersion = versionMatch ? versionMatch[1] : '0.0.0';
      console.log(`[Skill Loader] seedSkillCreator: 已有文件版本=${currentVersion}, 目标版本=1.1.0`);
      if (currentVersion === '1.1.0') {
        console.log('[Skill Loader] seedSkillCreator: 版本匹配，跳过写入');
        return false;
      }
    } catch { /* 读取失败则覆盖 */ }
  }

  try {
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }
    writeFileSync(skillMdPath, SKILL_CREATOR_SEED_MD, 'utf-8');
    console.log('[Skill Loader] 已种子写入 skill-creator SKILL.md (v1.1.0)');
    return true;
  } catch (err) {
    console.warn('[Skill Loader] 种子写入 skill-creator 失败:', err.message);
    return false;
  }
}

/**
 * 获取代码内置技能列表（已废弃，改用 seedSkillCreator 写入磁盘）
 * 保留此函数为空以兼容旧代码调用
 * @returns {Object[]}
 */
export function getBuiltinSkills() {
  return [];
}

export { SKILLS_DIR };
export { saveMarkdownSkill, deleteMarkdownSkillDir, importMarkdownSkillFromZip, importMarkdownSkillFromUrl };
