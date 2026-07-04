// skill/registry.js - Skill 注册表
// 管理所有已加载的 Skill，提供查询和执行接口
import { loadAllSkills, saveSkillFile, deleteSkillFile } from './loader.js';
import { executeSkill } from './executor.js';

// Skill 映射表: name → skill定义
const skills = new Map();

/**
 * 初始化 Skill 注册表
 * 扫描 skills 目录，加载所有 Skill 文件
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

  console.log(`[Skill Registry] 初始化完成，共注册 ${skills.size} 个 Skill`);
  return skills.size;
}

/**
 * 获取所有已注册的 Skill 列表（不含 steps 详情）
 */
export function getSkillList() {
  const list = [];
  for (const [name, skill] of skills) {
    list.push({
      name: skill.name,
      description: skill.description,
      version: skill.version,
      enabled: skill.enabled !== false,
      stepCount: skill.steps?.length || 0,
      parameters: skill.parameters || {}
    });
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
 * 执行 Skill
 * @param {string} name - Skill 名称
 * @param {Object} params - 参数
 * @param {Function} [onStepUpdate] - 步骤回调
 */
export async function runSkill(name, params = {}, onStepUpdate) {
  const skill = skills.get(name);
  if (!skill) {
    return { success: false, error: `Skill "${name}" 不存在或未启用` };
  }

  return await executeSkill(skill, params, onStepUpdate);
}

/**
 * 导入 Skill
 * @param {Object} skillDef - Skill 定义 JSON
 */
export function importSkill(skillDef) {
  const result = saveSkillFile(skillDef);
  if (result.success) {
    // 立即注册到内存
    skills.set(skillDef.name, { ...skillDef, _filePath: result.filePath });
    return { success: true, name: skillDef.name };
  }
  return result;
}

/**
 * 删除 Skill
 */
export function removeSkill(name) {
  const result = deleteSkillFile(name);
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

// 导出 skills map 供 executor 等模块使用
export { skills };
