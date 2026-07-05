// skill/executor.js - Skill 执行引擎
// 解析 Skill 定义的步骤 DAG，按拓扑排序执行，支持并行
import { render } from './template.js';
import { readFileSync } from 'fs';
import { checkPath } from '../security.js';
import { join } from 'path';

// 执行上下文（当前活跃的执行任务）
const activeExecutions = new Map(); // execId → { skill, status, steps, results }

let execIdCounter = 0;

/**
 * 内部工具调用函数
 * 每个 Skill 步骤都是一个 Agent 工具调用
 */
async function executeToolCall(toolName, args) {
  // 映射 Skill 步骤中的 tool 到实际 Agent API
  try {
    switch (toolName) {
      case 'agent_read_file': {
        const check = checkPath(args.path);
        if (!check.allowed) return { success: false, error: check.reason };
        const content = readFileSync(check.resolved, 'utf-8');
        return { success: true, content, size: content.length, path: check.resolved };
      }

      case 'agent_write_file': {
        const check = checkPath(args.path);
        if (!check.allowed) return { success: false, error: check.reason };
        const { writeFileSync } = await import('fs');
        writeFileSync(check.resolved, String(args.content || ''), 'utf-8');
        return { success: true, message: `文件已写入: ${check.resolved}` };
      }

      case 'agent_list_dir': {
        const check = checkPath(args.path || '.');
        if (!check.allowed) return { success: false, error: check.reason };
        const { readdirSync, statSync } = await import('fs');
        const entries = readdirSync(check.resolved).map(name => {
          const s = statSync(join(check.resolved, name));
          return { name, type: s.isDirectory() ? 'directory' : 'file', size: s.size };
        });
        return { success: true, entries, path: check.resolved };
      }

      case 'agent_exec_command': {
        const { execSync } = await import('child_process');
        const result = execSync(args.command, {
          cwd: args.cwd || process.cwd(),
          encoding: 'utf-8',
          timeout: 30000,
          maxBuffer: 10 * 1024 * 1024
        });
        return { success: true, stdout: result, exitCode: 0 };
      }

      case 'agent_search_files': {
        const { searchFiles } = await import('../search.js');
        return await searchFiles(
          args.path || '.',
          args.pattern || '*',
          args.recursive !== false,
          Math.min(args.maxResults || 200, 5000)
        );
      }

      case 'agent_search_content': {
        const { searchContent } = await import('../search.js');
        return await searchContent(
          args.path || '.',
          args.pattern,
          args.filePattern || null,
          args.caseSensitive || false,
          Math.min(args.maxResults || 100, 5000),
          args.contextLines || 2
        );
      }

      default:
        return { success: false, error: `未知工具: ${toolName}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * 构建步骤依赖 DAG
 * @returns {{ graph: Map<string, string[]>, inDegree: Map<string, number> }}
 */
function buildStepDag(steps) {
  const graph = new Map();
  const inDegree = new Map();

  for (const step of steps) {
    const stepId = step.id;
    if (!graph.has(stepId)) {
      graph.set(stepId, []);
      inDegree.set(stepId, 0);
    }

    if (step.dependsOn && Array.isArray(step.dependsOn)) {
      for (const depId of step.dependsOn) {
        if (!graph.has(depId)) {
          graph.set(depId, []);
          inDegree.set(depId, 0);
        }
        graph.get(depId).push(stepId);
        inDegree.set(stepId, (inDegree.get(stepId) || 0) + 1);
      }
    }
  }

  return { graph, inDegree };
}

/**
 * 按拓扑排序执行步骤（支持并行）
 * @param {Object} skill - Skill 定义
 * @param {Object} params - 用户传入的参数
 * @param {string} execId - 执行 ID
 * @param {Function} onStepUpdate - 步骤状态回调
 */
async function executeSkillSteps(skill, params, execId, onStepUpdate) {
  const { graph, inDegree } = buildStepDag(skill.steps);
  const stepResults = {};
  const completed = new Set();

  // 合并默认参数和用户传入参数
  const variables = { ...params };
  if (skill.parameters) {
    for (const [key, def] of Object.entries(skill.parameters)) {
      if (variables[key] === undefined && def.default !== undefined) {
        variables[key] = def.default;
      }
    }
  }

  // 准备就绪队列
  let ready = [];
  for (const step of skill.steps) {
    if (inDegree.get(step.id) === 0) {
      ready.push(step);
    }
  }

  // 拓扑排序执行
  while (ready.length > 0) {
    // 并行执行当前批次的所有就绪步骤
    const batch = ready;
    ready = [];

    const batchPromises = batch.map(async (step) => {
      try {
        // 检查条件
        if (step.when !== undefined) {
          const whenResult = render(step.when, variables);
          if (!whenResult || whenResult === 'false' || whenResult === false) {
            onStepUpdate(step.id, 'skipped', '条件不满足');
            completed.add(step.id);
            return;
          }
        }

        onStepUpdate(step.id, 'running', '执行中...');

        // 渲染参数中的模板变量（包含前面步骤的结果）
        const stepArgs = step.args || step.params || {};
        const renderedParams = { ...stepArgs };
        for (const [key, value] of Object.entries(renderedParams)) {
          if (typeof value === 'string') {
            renderedParams[key] = render(value, variables);
          }
        }

        // 执行工具调用
        const result = await executeToolCall(step.tool, renderedParams);

        // 存储结果到变量上下文
        stepResults[step.id] = result;
        variables[`step.${step.id}`] = result;
        variables[`step.${step.id}.success`] = result.success;
        variables[`step.${step.id}.content`] = result.content || '';

        if (result.success) {
          onStepUpdate(step.id, 'success', result.content || '执行成功');
        } else {
          onStepUpdate(step.id, 'error', result.error || '执行失败');
        }

        completed.add(step.id);
      } catch (err) {
        stepResults[step.id] = { success: false, error: err.message };
        onStepUpdate(step.id, 'error', err.message);
        completed.add(step.id);
      }
    });

    await Promise.all(batchPromises);

    // 查找新的就绪步骤
    for (const step of skill.steps) {
      if (completed.has(step.id)) continue;

      const deps = step.dependsOn || [];
      const allDepsDone = deps.every(depId => completed.has(depId));
      if (allDepsDone) {
        ready.push(step);
      }
    }

    // 防止死循环：如果没有任何步骤变为就绪但还有未完成的步骤
    if (ready.length === 0 && completed.size < skill.steps.length) {
      console.warn('[Skill Executor] 可能存在循环依赖或缺失的依赖步骤');
      break;
    }
  }

  return stepResults;
}

/**
 * 执行一个 Skill
 * @param {Object} skill - Skill 定义（从 registry 获取）
 * @param {Object} params - 用户传入的参数
 * @param {Function} [onStepUpdate] - 步骤状态回调 (stepId, status, message)
 * @returns {Promise<{success: boolean, execId: string, results: Object}>}
 */
export async function executeSkill(skill, params = {}, onStepUpdate) {
  const execId = `skill_${++execIdCounter}`;

  // 参数校验
  if (skill.parameters) {
    // 兼容 JSON Schema 格式: { type: "object", properties: {...}, required: [...] }
    const props = skill.parameters.properties || skill.parameters;
    const requiredList = Array.isArray(skill.parameters.required) ? skill.parameters.required : [];
    for (const [key, def] of Object.entries(props)) {
      if (!def || typeof def !== 'object') continue;
      if (requiredList.includes(key) && (params[key] === undefined || params[key] === null || params[key] === '')) {
        return { success: false, execId, error: `缺少必需参数: ${key}` };
      }
      if (params[key] !== undefined && def.type) {
        // 基本类型检查
        const actualType = typeof params[key];
        if (def.type === 'number' && actualType !== 'number') {
          params[key] = Number(params[key]);
        } else if (def.type === 'boolean' && actualType !== 'boolean') {
          params[key] = params[key] === 'true' || params[key] === true;
        } else if (def.type === 'string' && actualType !== 'string') {
          params[key] = String(params[key]);
        }
      }
    }
  }

  const execution = {
    skill: skill.name,
    execId,
    status: 'running',
    steps: {},
    startTime: Date.now()
  };

  activeExecutions.set(execId, execution);

  const notify = (stepId, status, message) => {
    execution.steps[stepId] = { status, message };
    if (onStepUpdate) onStepUpdate(stepId, status, message);
  };

  try {
    const results = await executeSkillSteps(skill, params, execId, notify);

    // 检查是否有失败的步骤
    const failedSteps = Object.entries(results).filter(([_, r]) => !r.success);
    if (failedSteps.length > 0) {
      execution.status = 'partial';
      execution.results = results;
      activeExecutions.set(execId, execution);
      return {
        success: true,
        execId,
        partial: true,
        results,
        message: `Skill "${skill.name}" 执行完成（${failedSteps.length} 个步骤失败）`
      };
    }

    execution.status = 'completed';
    execution.results = results;
    execution.endTime = Date.now();
    activeExecutions.set(execId, execution);

    return {
      success: true,
      execId,
      results,
      message: `Skill "${skill.name}" 执行完成（${Object.keys(results).length} 个步骤）`
    };
  } catch (err) {
    execution.status = 'error';
    execution.error = err.message;
    activeExecutions.set(execId, execution);
    return { success: false, execId, error: `执行异常: ${err.message}` };
  }
}

/**
 * 查询 Skill 执行状态
 */
export function getSkillExecutionStatus(execId) {
  const execution = activeExecutions.get(execId);
  if (!execution) {
    return { success: false, error: `执行 ID "${execId}" 不存在` };
  }
  return {
    success: true,
    execId: execution.execId,
    skill: execution.skill,
    status: execution.status,
    steps: execution.steps,
    elapsed: Date.now() - execution.startTime
  };
}
