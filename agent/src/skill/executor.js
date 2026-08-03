// skill/executor.js - Skill 执行引擎
// 解析 Skill 定义的步骤 DAG，按拓扑排序执行，支持并行
import { render } from './template.js';
import { readFile, writeFile, readdir, stat, unlink } from 'fs/promises';
import { checkPath, checkCommand } from '../security.js';
import { join, basename } from 'path';
import { t as translate } from '../i18n.js';

// 当前模块使用的语言（由 server.js 在请求入口处设置）
let currentLang = 'zh';

/**
 * 设置 skill executor 模块当前使用的语言（由 server.js 在请求入口处调用）
 * @param {string} lang - 语言代码（'zh' | 'en'）
 */
export function setSkillExecutorLang(lang) {
  if (lang) currentLang = lang;
}

/**
 * 翻译辅助
 * @param {string} key - 翻译 key
 * @param {object} [params] - 插值参数
 * @returns {string}
 */
function tr(key, params) {
  return translate(currentLang, key, params);
}

// 执行上下文（当前活跃的执行任务）
const activeExecutions = new Map(); // execId → { skill, status, steps, results }
const MAX_ACTIVE_EXECUTIONS = 100;
const EXECUTION_TIMEOUT = 300000; // 5 分钟超时
const EXECUTION_CLEANUP_AGE = 600000; // 10 分钟后清理

let execIdCounter = 0;

/**
 * 清理超时/过期的执行记录
 */
function cleanupActiveExecutions() {
  const now = Date.now();
  // 删除超时的记录
  for (const [execId, exec] of activeExecutions) {
    if (exec.status === 'completed' || exec.status === 'error') {
      const age = now - (exec.endTime || exec.startTime);
      if (age > EXECUTION_CLEANUP_AGE) {
        activeExecutions.delete(execId);
      }
    }
  }
  // 超过上限时，删除最旧的已完成记录
  if (activeExecutions.size > MAX_ACTIVE_EXECUTIONS) {
    const sorted = [...activeExecutions.entries()]
      .filter(([_, e]) => e.status === 'completed' || e.status === 'error')
      .sort((a, b) => a[1].startTime - b[1].startTime);
    const toDelete = sorted.slice(0, sorted.length - MAX_ACTIVE_EXECUTIONS / 2);
    for (const [execId] of toDelete) {
      activeExecutions.delete(execId);
    }
  }
}

/**
 * 内部工具调用函数
 * 每个 Skill 步骤都是一个 Agent 工具调用
 */
async function executeToolCall(toolName, args) {
  // 映射 Skill 步骤中的 tool 到实际 Agent API
  try {
    switch (toolName) {
      case 'agent_file':
      case 'agent_read_file':
      case 'agent_write_file':
      case 'agent_list_dir':
      case 'agent_delete_file':
      case 'agent_download_file': {
        const action = args.action || (
          toolName === 'agent_read_file' ? 'read' :
          toolName === 'agent_write_file' ? 'write' :
          toolName === 'agent_list_dir' ? 'list' :
          toolName === 'agent_delete_file' ? 'delete' :
          toolName === 'agent_download_file' ? 'download' :
          (args.content ? 'write' : 'read')
        );
        const check = await checkPath(args.path);
        if (!check.allowed) return { success: false, error: check.reason };
        switch (action) {
          case 'read': {
            const content = await readFile(check.resolved, 'utf-8');
            return { success: true, content, size: content.length, path: check.resolved };
          }
          case 'write': {
            await writeFile(check.resolved, String(args.content || ''), 'utf-8');
            return { success: true, message: tr('skill.fileWritten', { path: check.resolved }) };
          }
          case 'list': {
            const names = await readdir(check.resolved);
            const entries = await Promise.all(names.map(async (name) => {
              const s = await stat(join(check.resolved, name));
              return { name, type: s.isDirectory() ? 'directory' : 'file', size: s.size };
            }));
            return { success: true, entries, path: check.resolved };
          }
          case 'delete': {
            await unlink(check.resolved);
            return { success: true, message: tr('skill.fileDeleted', { path: check.resolved }) };
          }
          case 'download': {
            const content = await readFile(check.resolved);
            return { success: true, content, path: check.resolved, filename: basename(check.resolved) };
          }
          default:
            return { success: false, error: tr('skill.unknownAction', { action }) };
        }
      }

      case 'agent_exec': {
        const cmdCheck = checkCommand(args.command, false);
        if (cmdCheck.level === 'deny') {
          return { success: false, error: cmdCheck.reason };
        }
        // Workflow Skill 自动执行，没有交互确认环节，灰名单命令直接拒绝
        if (cmdCheck.level === 'confirm') {
          return { success: false, error: tr('skill.commandNeedsConfirm', { reason: cmdCheck.reason }) };
        }
        const { exec } = await import('child_process');
        return new Promise((resolve) => {
          exec(args.command, {
            cwd: args.cwd || process.cwd(),
            encoding: 'utf-8',
            timeout: 30000,
            maxBuffer: 10 * 1024 * 1024,
            windowsHide: true
          }, (error, stdout, stderr) => {
            if (error) {
              resolve({ success: false, error: error.message, stdout, stderr });
            } else {
              resolve({ success: true, stdout, exitCode: 0, stderr });
            }
          });
        });
      }

      case 'agent_search':
      case 'agent_search_files':
      case 'agent_search_content': {
        const searchType = args.searchType || (
          toolName === 'agent_search_content' ? 'content' : 'file'
        );
        const { searchFiles, searchContent } = await import('../search.js');
        if (searchType === 'content') {
          return await searchContent(
            args.path || '.',
            args.pattern,
            args.filePattern || null,
            args.caseSensitive || false,
            args.recursive !== false,
            Math.min(args.maxResults || 100, 5000),
            args.contextLines || 2
          );
        }
        return await searchFiles(
          args.path || '.',
          args.pattern || '*',
          args.recursive !== false,
          Math.min(args.maxResults || 200, 5000)
        );
      }

      default:
        return { success: false, error: tr('skill.unknownTool', { toolName }) };
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
            onStepUpdate(step.id, 'skipped', tr('skill.conditionNotMet'));
            completed.add(step.id);
            return;
          }
        }

        onStepUpdate(step.id, 'running', tr('skill.executing'));

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
          onStepUpdate(step.id, 'success', result.content || tr('skill.execSuccess'));
        } else {
          onStepUpdate(step.id, 'error', result.error || tr('skill.execFailed'));
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
      console.warn('[Skill Executor] Possible circular dependency or missing prerequisite step');
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
        return { success: false, execId, error: tr('skill.missingParam', { key }) };
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
  cleanupActiveExecutions(); // 执行前先清理过期记录

  const notify = (stepId, status, message) => {
    execution.steps[stepId] = { status, message };
    if (onStepUpdate) onStepUpdate(stepId, status, message);
  };

  try {
    // 带超时的执行
    const results = await Promise.race([
      executeSkillSteps(skill, params, execId, notify),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(tr('skill.skillExecTimeout'))), EXECUTION_TIMEOUT)
      )
    ]);

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
        message: tr('skill.skillExecPartial', { name: skill.name, count: failedSteps.length })
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
      message: tr('skill.skillExecDone', { name: skill.name, count: Object.keys(results).length })
    };
  } catch (err) {
    execution.status = 'error';
    execution.error = err.message;
    activeExecutions.set(execId, execution);
    return { success: false, execId, error: tr('skill.execError', { message: err.message }) };
  }
}

/**
 * 查询 Skill 执行状态
 */
export function getSkillExecutionStatus(execId) {
  const execution = activeExecutions.get(execId);
  if (!execution) {
    return { success: false, error: tr('skill.execIdNotFound', { execId }) };
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
