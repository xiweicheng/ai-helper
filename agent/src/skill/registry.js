// skill/registry.js - Skill 注册表
// 管理所有已加载的 Skill（Workflow + Agent），提供查询和执行接口
import { loadAllSkills, saveSkillFile, deleteSkillFile } from './loader.js';
import { executeSkill } from './executor.js';
import { SKILLS_DIR } from './loader.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

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
    // 加载所有 Skill（包括禁用的），通过 enabled 字段区分
    skills.set(skill.name, skill);
  }

  const workflowCount = [...skills.values()].filter(s => s.type === 'workflow').length;
  const agentCount = [...skills.values()].filter(s => s.type === 'agent').length;
  const enabledCount = [...skills.values()].filter(s => s.enabled !== false).length;

  console.log(`[Skill Registry] 初始化完成，共注册 ${skills.size} 个 Skill (${workflowCount} Workflow + ${agentCount} Agent)，已启用 ${enabledCount}`);
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
  parts.push('以下是可用的专业技能列表。当用户需求匹配某个技能时，使用 `agent_skill_load` 工具加载该技能的完整说明。');
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
  return {
    success: true,
    skill: {
      name: skill.name,
      description: skill.description,
      version: skill.version,
      resources: skill.resources
    },
    prompt: skill.fullPrompt || skill.prompt || ''
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
  const type = skill?.type;
  const result = deleteSkillFile(name, type);
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

  try {
    if (skill.type === 'agent' && skill.skillMdPath) {
      // 更新 SKILL.md 的 frontmatter
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
      // 更新 JSON 文件
      const content = readFileSync(skill._filePath, 'utf-8');
      const parsed = JSON.parse(content);
      parsed.enabled = newEnabled;
      writeFileSync(skill._filePath, JSON.stringify(parsed, null, 2), 'utf-8');
    }
  } catch (err) {
    // 文件写入失败不影响内存状态，仅记录警告
    console.warn(`[Skill Registry] 持久化 "${name}" 的启用状态失败:`, err.message);
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
