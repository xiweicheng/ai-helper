// skill/registry.js - Skill 注册表
// 管理所有已加载的 Skill（Workflow + Agent），提供查询和执行接口
import { loadAllSkills, saveSkillFile, deleteSkillFile } from './loader.js';
import { executeSkill } from './executor.js';
import { SKILLS_DIR } from './loader.js';

// Skill 映射表: name → skill定义
const skills = new Map();

/**
 * 初始化 Skill 注册表
 * 扫描 skills 目录，加载所有 Skill 文件（Workflow JSON + Agent SKILL.md）
 * @returns {number} 加载的 Skill 数量
 */
export function initializeSkillRegistry() {
  skills.clear();

  const loaded = loadAllSkills();

  for (const skill of loaded) {
    if (skill.enabled !== false) {
      skills.set(skill.name, skill);
    }
  }

  const workflowCount = [...skills.values()].filter(s => s.type === 'workflow').length;
  const agentCount = [...skills.values()].filter(s => s.type === 'agent').length;

  console.log(`[Skill Registry] 初始化完成，共注册 ${skills.size} 个 Skill (${workflowCount} Workflow + ${agentCount} Agent)`);
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
      enabled: skill.enabled !== false
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
 * 获取所有启用的 Agent Skill 的 Prompt 汇总
 * 用于注入到 AI System Prompt 中
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
  parts.push('以下是你可以使用的专业技能。当用户的需求匹配某个技能时，请按照技能描述中的指示执行。');
  parts.push('每个技能目录下的 SKILL.md 包含完整说明，scripts/ templates/ assets/ references/ 子目录包含辅助资源。');
  parts.push('');

  for (const skill of agentSkills) {
    parts.push(`### ${skill.name}`);
    parts.push(`**描述**: ${skill.description}`);
    if (skill.resources && skill.resources.length > 0) {
      const resourceNames = skill.resources.map(r => `\`${r.name}\``).join(', ');
      parts.push(`**可用资源**: ${resourceNames}`);
    }
    parts.push('');
    parts.push(skill.fullPrompt || skill.prompt || '');
    parts.push('');
  }

  return parts.join('\n');
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
  const type = skill?.type;
  const result = deleteSkillFile(name, type);
  if (result.success) {
    skills.delete(name);
  }
  return result;
}

/**
 * 重新加载所有 Skill（热更新）
 */
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
