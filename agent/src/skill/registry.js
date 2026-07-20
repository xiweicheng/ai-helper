// skill/registry.js - Skill 注册表
// 管理所有已加载的 Skill（Workflow + Agent），提供查询和执行接口
import { loadAllSkills, saveSkillFile, deleteSkillFile, getBuiltinSkills, seedSkillCreator, deleteMarkdownSkillDir } from './loader.js';
import { executeSkill } from './executor.js';
import { SKILLS_DIR } from './loader.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';

// Skill 映射表: name → skill定义
const skills = new Map();

// 内置技能状态持久化文件
const BUILTIN_STATE_FILE = join(dirname(SKILLS_DIR), 'builtin_skills_state.json');

// 用户停用技能状态持久化文件（比直接写 SKILL.md 更可靠，避免文件写入失败导致状态丢失）
const DISABLED_STATE_FILE = join(dirname(SKILLS_DIR), 'disabled_skills.json');

/**
 * 读取用户停用的技能列表
 * @returns {Set<string>}
 */
function loadDisabledState() {
  try {
    if (existsSync(DISABLED_STATE_FILE)) {
      const data = JSON.parse(readFileSync(DISABLED_STATE_FILE, 'utf-8'));
      return new Set(data.disabled || []);
    }
  } catch (e) { /* 忽略 */ }
  return new Set();
}

/**
 * 保存用户停用的技能列表
 * @param {Set<string>} disabledSet
 */
function saveDisabledState(disabledSet) {
  try {
    writeFileSync(DISABLED_STATE_FILE, JSON.stringify({ disabled: [...disabledSet] }, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Skill Registry] 无法保存停用状态:', e.message);
  }
}

/**
 * 读取内置技能的启用状态
 * @returns {Record<string, boolean>} name → enabled
 */
function loadBuiltinState() {
  try {
    if (existsSync(BUILTIN_STATE_FILE)) {
      return JSON.parse(readFileSync(BUILTIN_STATE_FILE, 'utf-8'));
    }
  } catch (e) { /* 忽略 */ }
  return {};
}

/**
 * 保存内置技能的启用状态
 * @param {Record<string, boolean>} state
 */
function saveBuiltinState(state) {
  try {
    writeFileSync(BUILTIN_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Skill Registry] 无法保存内置技能状态:', e.message);
  }
}

/**
 * 初始化 Skill 注册表
 * 扫描 skills 目录，加载所有 Skill 文件（Workflow JSON + Agent SKILL.md）
 * @returns {number} 加载的 Skill 数量
 */
export function initializeSkillRegistry() {
  skills.clear();

  // 0. 种子写入 skill-creator 到文件系统（首次运行或版本升级时）
  seedSkillCreator();

  // 1. 加载文件系统中的技能
  const loaded = loadAllSkills();

  for (const skill of loaded) {
    skills.set(skill.name, skill);
  }

  // 2. 加载代码内置技能（不覆盖文件系统中同名的技能）
  const builtinSkills = getBuiltinSkills();
  for (const skill of builtinSkills) {
    if (!skills.has(skill.name)) {
      skills.set(skill.name, skill);
    }
  }

  // 3. 标记内置技能的特殊属性（skill-creator 是内置技能，不可编辑、不可删除）
  const skillCreator = skills.get('skill-creator');
  if (skillCreator) {
    skillCreator.builtin = true;
    skillCreator.editable = false;
    skillCreator.deletable = false;
  }

  // 4. 恢复内置技能的启用状态（用户通过停止/启用的状态）
  const builtinState = loadBuiltinState();
  for (const [name, enabled] of Object.entries(builtinState)) {
    const skill = skills.get(name);
    if (skill && skill.builtin) {
      skill.enabled = enabled;
    }
  }

  // 5. 恢复用户手动停用的技能状态（所有类型，比 SKILL.md frontmatter 更可靠）
  const disabledSet = loadDisabledState();
  for (const name of disabledSet) {
    const skill = skills.get(name);
    if (skill) {
      skill.enabled = false;
    }
  }

  const workflowCount = [...skills.values()].filter(s => s.type === 'workflow').length;
  const agentCount = [...skills.values()].filter(s => s.type === 'agent').length;
  const enabledCount = [...skills.values()].filter(s => s.enabled !== false).length;
  const builtinCount = [...skills.values()].filter(s => s.builtin).length;

  console.log(`[Skill Registry] 初始化完成，共注册 ${skills.size} 个 Skill (${workflowCount} Workflow + ${agentCount} Agent)，已启用 ${enabledCount}，内置 ${builtinCount}`);
  return skills.size;
}

/**
 * 获取所有已注册的 Skill 列表（不含 steps 详情）
 * @param {string} [type] - 可选过滤类型：'workflow' | 'agent'
 */
export function getSkillList(type) {
  const list = [];
  for (const [name, skill] of skills) {
    if (type && skill.type !== type) continue;

    const item = {
      name: skill.name,
      type: skill.type || 'workflow',
      description: skill.description,
      version: skill.version,
      enabled: skill.enabled !== false,
      builtin: !!skill.builtin,
      editable: skill.editable !== false,
      deletable: skill.deletable !== false
    };

    if (skill.type === 'workflow') {
      item.stepCount = skill.steps?.length || 0;
      item.parameters = skill.parameters || {};
    } else if (skill.type === 'agent') {
      item.resourceCount = skill.resources?.length || 0;
      item.resources = (skill.resources || []).map(r => ({ name: r.name, type: r.type, size: r.size }));
    }

    list.push(item);
  }
  return { success: true, skills: list };
}

/**
 * 获取单个 Skill 的完整定义
 */
export function getSkill(name) {
  const skill = skills.get(name);
  if (!skill) {
    return { success: false, error: `Skill "${name}" 不存在` };
  }
  return { success: true, skill };
}

/**
 * 执行 Workflow Skill（Agent Skill 不支持此操作）
 * @param {string} name - Skill 名称
 * @param {Object} params - 参数
 * @param {Function} [onStepUpdate] - 步骤回调
 */
export async function runSkill(name, params = {}, onStepUpdate) {
  const skill = skills.get(name);
  if (!skill) {
    return { success: false, error: `Skill "${name}" 不存在或未启用` };
  }

  if (skill.type === 'agent') {
    return { success: false, error: `"${name}" 是 Agent Skill，无法直接执行。Agent Skill 由 AI 在对话中根据 SKILL.md 描述自主调用。` };
  }

  return await executeSkill(skill, params, onStepUpdate);
}

/**
 * 获取所有启用的 Agent Skill 的轻量列表
 * 仅包含名称和描述，用于注入到 AI System Prompt 中。
 * AI 需要使用 agent_skill_load 工具按需加载完整内容。
 * @returns {string} - 格式化的技能列表文本
 */
export function getAgentSkillPrompts() {
  const agentSkills = [];
  for (const [, skill] of skills) {
    if (skill.type === 'agent' && skill.enabled !== false) {
      agentSkills.push(skill);
    }
  }

  if (agentSkills.length === 0) return '';

  const parts = [];
  parts.push('## 可用技能 (Skills)');
  parts.push('');
  parts.push('以下是可用的 Agent Skill（AI 能力扩展）列表。当用户需求匹配某个技能时，使用 `agent_skill_load` 工具加载该技能的完整说明，然后由 AI 根据说明自主调用相关工具完成任务。');
  parts.push('');

  for (const skill of agentSkills) {
    parts.push(`### ${skill.name}`);
    parts.push(`**描述**: ${skill.description}`);
    if (skill.resources && skill.resources.length > 0) {
      const resourceNames = skill.resources.map(r => `\`${r.name}\``).join(', ');
      parts.push(`**可用资源**: ${resourceNames}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * 获取单个 Agent Skill 的完整 Prompt 内容
 * @param {string} name - Skill 名称
 * @returns {{ success: boolean, error?: string, skill?: Object, prompt?: string }}
 */
export function getAgentSkillPrompt(name) {
  const skill = skills.get(name);
  if (!skill || skill.type !== 'agent') {
    return { success: false, error: `Skill "${name}" 不存在或不是 Agent Skill` };
  }
  // 如果 skill 有 dirPath，在 prompt 前注入工作目录信息，方便 AI 解析相对路径引用
  let prompt = skill.fullPrompt || skill.prompt || '';
  if (skill.dirPath) {
    prompt = `[技能工作目录: ${skill.dirPath}]\n\n${prompt}`;
  }
  return {
    success: true,
    skill: {
      name: skill.name,
      description: skill.description,
      version: skill.version,
      resources: skill.resources
    },
    prompt
  };
}

/**
 * 导入 Skill（Workflow 或 Agent）
 * @param {Object} skillDef - Skill 定义
 */
export function importSkill(skillDef) {
  const result = saveSkillFile(skillDef);
  if (result.success) {
    // 立即注册到内存
    const registered = { ...skillDef };
    if (result.filePath) registered._filePath = result.filePath;
    if (result.dirPath) registered.dirPath = result.dirPath;
    skills.set(skillDef.name, registered);
    return { success: true, name: skillDef.name, type: skillDef.type || 'workflow' };
  }
  return result;
}

/**
 * 删除 Skill
 * @param {string} name - Skill 名称
 */
export function removeSkill(name) {
  const skill = skills.get(name);
  if (!skill) {
    return { success: false, error: `Skill "${name}" 不存在` };
  }
  if (skill.builtin) {
    return { success: false, error: `"${name}" 是内置技能，不可删除` };
  }

  let result;
  if (skill.type === 'agent' && skill.dirPath && existsSync(skill.dirPath)) {
    // Agent Skill：直接使用已记录的 dirPath 删除目录，避免 name 与目录名不一致的问题
    result = deleteMarkdownSkillDir(SKILLS_DIR, basename(skill.dirPath));
  } else {
    // Workflow Skill 或降级处理
    result = deleteSkillFile(name, skill?.type);
  }

  if (result.success) {
    skills.delete(name);
  }
  return result;
}

/**
 * 切换 Skill 的启用/停用状态
 * @param {string} name - Skill 名称
 * @returns {{ success: boolean, error?: string, enabled?: boolean }}
 */
export function toggleSkill(name) {
  const skill = skills.get(name);
  if (!skill) {
    return { success: false, error: `Skill "${name}" 不存在` };
  }

  const newEnabled = skill.enabled === false;
  skill.enabled = newEnabled;

  // 1. 持久化到 disabled_skills.json（所有类型统一使用，比直接写 SKILL.md 更可靠）
  const disabledSet = loadDisabledState();
  if (newEnabled) {
    disabledSet.delete(name);
  } else {
    disabledSet.add(name);
  }
  saveDisabledState(disabledSet);

  // 2. 内置技能额外保存到 builtin_skills_state.json
  if (skill.builtin) {
    const state = loadBuiltinState();
    state[name] = newEnabled;
    saveBuiltinState(state);
  }

  // 3. 尝试更新技能源文件（best-effort，失败不影响状态）
  try {
    if (skill.type === 'agent' && skill.skillMdPath) {
      const content = readFileSync(skill.skillMdPath, 'utf-8');
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        let frontmatter = frontmatterMatch[1];
        if (/^enabled:\s/m.test(frontmatter)) {
          frontmatter = frontmatter.replace(/^enabled:\s.*$/m, `enabled: ${newEnabled}`);
        } else {
          frontmatter += `\nenabled: ${newEnabled}`;
        }
        const newContent = content.replace(/^---\n[\s\S]*?\n---/, `---\n${frontmatter}\n---`);
        writeFileSync(skill.skillMdPath, newContent, 'utf-8');
      }
    } else if (skill.type === 'workflow' && skill._filePath) {
      const content = readFileSync(skill._filePath, 'utf-8');
      const parsed = JSON.parse(content);
      parsed.enabled = newEnabled;
      writeFileSync(skill._filePath, JSON.stringify(parsed, null, 2), 'utf-8');
    }
  } catch (err) {
    // 写源文件失败不影响状态，disabled_skills.json 已经持久化
    console.warn(`[Skill Registry] 更新 "${name}" 源文件失败（状态已通过 disabled_skills.json 保存）:`, err.message);
  }

  return { success: true, enabled: newEnabled };
}
export function reloadSkills() {
  return initializeSkillRegistry();
}

/**
 * 获取 Skills 根目录路径
 */
export function getSkillsDir() {
  return SKILLS_DIR;
}

// 导出 skills map 供 executor 等模块使用
export { skills };
