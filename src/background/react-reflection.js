// background/react-reflection.js - 反思机制（Reflection）
// 从 react-loop.js 拆分，包含所有反思相关的判断、Prompt 构建、API 调用与结果解析
import { fetchWithRetry } from './tool-executor.js';
import { recordTokenUsage } from './token-recorder.js';
import { extractTextFromContent } from '../shared/token-counter.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  reflection: {
    qualityAssessment: '质量评估',
    qualityAssessmentScore: '质量评估: {score}/10 ({decision})',
    decisionPassed: '通过',
    decisionRevised: '已修订',
    decisionNeedsImprovement: '需改进',
    postNodeName: '质量评估 {round}/{maxRounds}',
    subtaskNodeName: '子任务反思: {name}',
    lowScoreRevised: '⚠️ 原答案评分过低，已由反思修订',
    retrySuggestion: '建议：重新执行任务，基于反思问题调整工具选择和执行策略',
  },
});

registerTranslations('en', {
  reflection: {
    qualityAssessment: 'Quality Assessment',
    qualityAssessmentScore: 'Quality Assessment: {score}/10 ({decision})',
    decisionPassed: 'Passed',
    decisionRevised: 'Revised',
    decisionNeedsImprovement: 'Needs Improvement',
    postNodeName: 'Quality Assessment {round}/{maxRounds}',
    subtaskNodeName: 'Subtask Reflection: {name}',
    lowScoreRevised: '⚠️ Original score too low, revised by reflection',
    retrySuggestion: 'Suggestion: Re-execute the task, adjust tool selection and execution strategy based on reflection issues',
  },
});

// 反思总轮数上限（模块级常量）
export const MAX_REFLECTION_ROUNDS = 10;

/**
 * 判断是否需要执行反思
 * 简单任务（0-1 次工具调用，无失败，无子任务）跳过反思
 */
export function shouldReflect(executionLog, taskContext) {
  // 子任务内部（有 taskContext）默认不触发反思，由父级统一处理
  if (taskContext) return false;

  // 有子任务拆解 → 需要反思
  const hasPlanTask = executionLog.some(e =>
    e.nodeType === 'tool_exec' && e.action?.name === 'plan_task' && e.status === 'success'
  );
  if (hasPlanTask) return true;

  // 有工具执行失败 → 需要反思
  const hasToolFailure = executionLog.some(e =>
    e.nodeType === 'tool_exec' && e.status === 'failed'
  );
  if (hasToolFailure) return true;

  // 工具调用 >= 2 次 → 需要反思
  const toolCallCount = executionLog.filter(e => e.nodeType === 'tool_exec').length;
  if (toolCallCount >= 2) return true;

  // 简单任务 → 跳过反思
  return false;
}

/**
 * 计算工具反思优先级
 * 用于决定反思队列的处理顺序
 */
export function getToolReflectionPriority(toolName, toolResultStr, consecutiveFailCount) {
  let priority = 0;
  // 错误结果获得最高优先级
  if (toolResultStr.includes('"success":false') || toolResultStr.includes('error') || toolResultStr.includes('失败')) {
    priority += 10;
  }
  // 连续失败获得高优先级
  if (consecutiveFailCount >= 2) {
    priority += consecutiveFailCount * 5;
  }
  // 重要工具（表单填充、数据修改）获得更高优先级
  const importantTools = ['fill_form', 'interact_element', 'download_file', 'manage_cookies', 'clear_data'];
  if (importantTools.includes(toolName)) {
    priority += 3;
  }
  // 空结果获得中等优先级
  if (!toolResultStr || toolResultStr.trim() === '' || toolResultStr === '{}') {
    priority += 2;
  }
  return priority;
}

/**
 * 判断工具结果是否触发工具级反思
 */
export function shouldTriggerToolReflection(toolResultStr, failCountInIteration, reflectionConfig) {
  if (!reflectionConfig?.enabled) return false;
  if (!reflectionConfig?.toolReflection?.enabled) return false;
  const tc = reflectionConfig.toolReflection;

  // 连续失败触发
  if (tc.triggerOnConsecutiveFails && failCountInIteration >= tc.triggerOnConsecutiveFails) {
    return true;
  }

  // 错误触发（统一格式下 content 字段可能包含 error 或 失败 关键字）
  if (tc.triggerOnError && (toolResultStr.includes('"success":false') || toolResultStr.includes('error') || toolResultStr.includes('失败'))) {
    return true;
  }

  // 空结果触发
  if (tc.triggerOnEmpty && (!toolResultStr || toolResultStr.trim() === '' || toolResultStr === '{}')) {
    return true;
  }

  // 结果过大触发
  if (tc.triggerOnOversized && toolResultStr.length > tc.oversizeThreshold) {
    return true;
  }

  return false;
}

/**
 * 构建后置反思 Prompt（增强版：包含完整执行详情）
 */
export function buildReflectionPrompt(messages, answer, executionLog, round = 1) {
  // 提取用户问题（仅取文本部分，避免 Base64 图片污染反思 prompt）
  const userMessages = messages.filter(m => m.role === 'user');
  const userQuestion = userMessages.length > 0
    ? extractTextFromContent(userMessages[userMessages.length - 1].content)
    : 'unknown';

  // 构建详细执行摘要
  const apiCalls = executionLog.filter(e => e.nodeType === 'api_call').length;
  const toolEntries = executionLog.filter(e => e.nodeType === 'tool_exec');
  const toolDetails = toolEntries.map(e => {
    const params = e.action?.params || {};
    const paramsStr = Object.keys(params).length > 0 ? `params: ${JSON.stringify(params)}` : '';
    const obs = e.observation ? `result summary: ${String(e.observation).substring(0, 200)}` : '';
    const status = e.status === 'success' ? '✅' : '❌';
    return `  ${status} ${e.action?.name || e.nodeName} ${paramsStr} ${obs}`.trim();
  }).join('\n');

  const toolSummary = toolEntries.length > 0
    ? toolEntries.map(e => `${e.action?.name || e.nodeName} (${e.status})`).join(', ')
    : 'none';

  const planTasks = executionLog.filter(e => e.nodeType === 'tool_exec' && e.action?.name === 'plan_task');
  const subtaskInfo = planTasks.length > 0
    ? `, ${planTasks[0].subtaskCount || 0} subtasks decomposed`
    : '';

  const toolReflectionEntries = executionLog.filter(e => e.nodeType === 'reflection' && e.reflectionType === 'tool');
  const toolReflectionSummary = toolReflectionEntries.length > 0
    ? toolReflectionEntries.map(e => {
        const useful = e.useful ? '✅useful' : '⚠️invalid';
        return `  ${useful} - ${e.nodeName}: ${e.reasoning || ''} ${e.suggestion ? `(suggestion: ${e.suggestion})` : ''}`;
      }).join('\n')
    : 'none';

  const summary = `API calls: ${apiCalls}${subtaskInfo}.`;

  // 截断答案
  const truncatedAnswer = answer.length > 3000 ? answer.substring(0, 3000) + '...' : answer;

  return `Please strictly evaluate the quality of the following AI assistant's answer to the user's question${round > 1 ? ` (this is round ${round} of evaluation; the revised answer from the previous round is shown in "Final Answer" below)` : ''}.

## User Question
${userQuestion}

## Execution Overview
${summary}

## Tool Execution Details (including parameters and result summaries)
${toolDetails || 'No tool calls'}

## Tool Reflection Records (reflection nodes)
${toolReflectionSummary}

## AI Assistant's Final Answer
${truncatedAnswer}

## Evaluation Dimensions (each scored 1-10)
1. completeness: Does it fully answer the user's question without omissions?
2. accuracy: Is the information accurate and reliable, without hallucinations or errors?
3. relevance: Does the answer stay closely aligned with the user's needs without going off-topic?
4. toolUsage: Are tool selections appropriate and parameters reasonable? Judge based on the tool execution details above.
5. efficiency: Are there unnecessary steps or repetitive operations?

Please output in strict JSON format (do not include markdown code block markers):
{
  "overallScore": 8,
  "dimensions": {
    "completeness": 8,
    "accuracy": 9,
    "relevance": 7,
    "toolUsage": 8,
    "efficiency": 8
  },
  "issues": ["specific issue 1", "specific issue 2"],
  "suggestions": ["specific improvement suggestion 1", "specific improvement suggestion 2"],
  "refinedAnswer": "If the answer has obvious flaws, output the complete revised answer (must be complete, not just the modified parts); otherwise set to null"
}`;
}

/**
 * 从反思 API 返回的文本中解析 JSON 结果
 */
export function parseReflectionResult(rawContent) {
  const defaults = {
    overallScore: 7,
    dimensions: {},
    issues: [],
    suggestions: [],
    refinedAnswer: null
  };

  if (!rawContent) return defaults;

  try {
    // 尝试直接解析
    const parsed = JSON.parse(rawContent.trim());
    return {
      overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : 7,
      dimensions: parsed.dimensions || {},
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      refinedAnswer: typeof parsed.refinedAnswer === 'string' ? parsed.refinedAnswer : null
    };
  } catch {
    // 尝试从 markdown 代码块提取
    const jsonMatch = rawContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        return {
          overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : 7,
          dimensions: parsed.dimensions || {},
          issues: Array.isArray(parsed.issues) ? parsed.issues : [],
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
          refinedAnswer: typeof parsed.refinedAnswer === 'string' ? parsed.refinedAnswer : null
        };
      } catch { /* fall through */ }
    }
  }

  logger.warn('[Background] 无法解析反思结果，使用默认值');
  return defaults;
}

/**
 * 后置反思：对 ReAct 循环的最终答案进行质量评估（多轮修订循环）
 *
 * 决策逻辑：
 *   score >= qualityThreshold(7)  → passed，使用原答案（或 refinedAnswer）
 *   score >= refineThreshold(5)  → revised，使用 refinedAnswer（标记为已修订）
 *   score < refineThreshold(5)   → needs_improvement
 *     - 有 refinedAnswer → revised，使用修订答案，issues 中加入"经反思修订"说明
 *     - 无 refinedAnswer → needs_improvement，issues 中加入"建议重新执行"建议
 *   第二轮（maxRounds>=2）：对修订答案再做一次评估
 *
 * @returns {{ content: string, reflectionLog: Array, status: string, overallScore: number|null, wasRevised: boolean }}
 */
export async function reflectOnResult(messages, answer, executionLog, model, config, reflectionConfig, tabId, sendStatusUpdate, globalIteration, taskContext, sessionId, totalReflectionRounds = 0) {
  const postConfig = reflectionConfig.postReflection;

  if (!reflectionConfig?.enabled || !postConfig?.enabled || postConfig.maxRounds < 1) {
    return { content: answer, reflectionLog: [], status: 'skipped', overallScore: null, wasRevised: false };
  }

  const reflectionLog = [];
  const maxRounds = Math.min(
    Math.max(1, postConfig.maxRounds),
    MAX_REFLECTION_ROUNDS - totalReflectionRounds
  );
  const startTime = Date.now();
  let currentContent = answer;
  let bestScore = null;
  let bestDecision = 'passed';
  let wasRevised = false;

  sendStatusUpdate(t('reflection.qualityAssessment'), 'processing');

  try {
    const apiUrl = `${config.apiBase}/chat/completions`;
    const reflectionModel = postConfig.model || model || config.modelName;

    for (let round = 1; round <= maxRounds; round++) {
      totalReflectionRounds++;
      const roundStartTime = Date.now();
      const roundId = crypto.randomUUID();

      // 如果是第 2 轮，使用上一轮的修订答案作为反思对象
      const prompt = buildReflectionPrompt(messages, currentContent, executionLog, round);

      const response = await fetchWithRetry(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: reflectionModel,
          messages: [
            { role: 'system', content: 'You are a strict quality evaluator. Output the evaluation result in JSON format; do not include markdown code block markers.' },
            { role: 'user', content: prompt }
          ],
          stream: false,
          temperature: postConfig.temperature,
          max_tokens: postConfig.maxTokens
        })
      }, 30000, 1, 1000);

      if (!response.ok) {
        throw new Error(`Reflection API error: ${response.status}`);
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '';
      const parsed = parseReflectionResult(rawContent);
      const duration = Date.now() - roundStartTime;

      bestScore = parsed.overallScore;

      // 决策
      let decision;
      let applyContent = currentContent;

      if (parsed.overallScore >= postConfig.qualityThreshold) {
        decision = 'passed';
        applyContent = parsed.refinedAnswer || currentContent;
        // 即使通过，如果模型主动修订了也用修订版
        if (parsed.refinedAnswer && parsed.refinedAnswer !== currentContent) {
          wasRevised = true;
        }
      } else if (parsed.overallScore >= postConfig.refineThreshold) {
        decision = 'revised';
        if (parsed.refinedAnswer) {
          applyContent = parsed.refinedAnswer;
          wasRevised = true;
        }
      } else {
        // 低于 refineThreshold
        if (parsed.refinedAnswer) {
          decision = 'revised';
          applyContent = parsed.refinedAnswer;
          wasRevised = true;
          // 标记这是低分修订
          parsed.issues = parsed.issues || [];
          if (!parsed.issues.some(i => i.includes('反思修订'))) {
            parsed.issues.unshift(t('reflection.lowScoreRevised'));
          }
        } else {
          decision = 'needs_improvement';
          parsed.suggestions = parsed.suggestions || [];
          if (!parsed.suggestions.some(s => s.includes('重新执行') || s.includes('retry'))) {
            parsed.suggestions.push(t('reflection.retrySuggestion'));
          }
        }
      }

      bestDecision = decision;  // 追踪每轮的实际决策
      const decisionLabel = decision === 'passed' ? t('reflection.decisionPassed') : decision === 'revised' ? t('reflection.decisionRevised') : t('reflection.decisionNeedsImprovement');

      reflectionLog.push({
        id: roundId,
        iteration: globalIteration?.value || 0,
        timestamp: new Date().toISOString(),
        status: 'success',
        nodeType: 'reflection',
        nodeName: t('reflection.postNodeName', { round: round, maxRounds: maxRounds }),
        reflectionType: 'post',
        round,
        overallScore: parsed.overallScore,
        dimensions: parsed.dimensions,
        issues: parsed.issues,
        suggestions: parsed.suggestions,
        prompt,
        rawContent,
        apiRequest: {
          model: reflectionModel,
          messageCount: 2,
          temperature: postConfig.temperature,
          maxTokens: postConfig.maxTokens
        },
        apiResponse: {
          tokenUsage: data.usage || null
        },
        action: {
          decision,
          refinedAnswer: parsed.refinedAnswer && parsed.refinedAnswer !== currentContent ? parsed.refinedAnswer : null
        },
        duration
      });

      // 记录反思 token 使用统计
      if (data.usage) {
        recordTokenUsage({
          sessionId,
          model: reflectionModel,
          usage: data.usage,
          callType: 'reflection'
        }).catch(() => {});
      }

      // 如果通过且不需要修订，提前结束
      if (decision === 'passed') {
        currentContent = applyContent;
        break;
      }

      // 下一轮使用修订后的答案
      currentContent = applyContent;
    }

    const totalDuration = Date.now() - startTime;
    const lastEntry = reflectionLog[reflectionLog.length - 1];
    const finalScore = bestScore ?? lastEntry?.overallScore;
    const finalDecision = bestDecision || lastEntry?.action?.decision || 'passed';
    const decisionLabel = finalDecision === 'passed' ? t('reflection.decisionPassed') : finalDecision === 'revised' ? t('reflection.decisionRevised') : t('reflection.decisionNeedsImprovement');

    sendStatusUpdate(t('reflection.qualityAssessmentScore', { score: finalScore, decision: decisionLabel }), 'success');
    logger.debug(`[Background] 反思完成: 评分 ${finalScore}/10, 决策: ${decisionLabel}, 修订: ${wasRevised}, 总耗时: ${totalDuration}ms`);

    return {
      content: currentContent,
      reflectionLog,
      status: finalDecision,
      overallScore: finalScore,
      wasRevised
    };

  } catch (error) {
    logger.warn('[Background] 反思 API 调用失败:', error.message);
    const duration = Date.now() - startTime;
    reflectionLog.push({
      id: crypto.randomUUID(),
      iteration: globalIteration?.value || 0,
      timestamp: new Date().toISOString(),
      status: 'failed',
      nodeType: 'reflection',
      nodeName: t('reflection.qualityAssessment'),
      reflectionType: 'post',
      error: error.message,
      duration
    });
    return { content: answer, reflectionLog, status: 'reflection_failed', overallScore: null, wasRevised: false };
  }
}

/**
 * 工具级反思：对单个工具执行结果进行快速评估
 */
export async function reflectOnToolResult(toolName, toolResultStr, toolCallParams, config, model, reflectionConfig, executionLog, iteration, sessionId) {
  if (!reflectionConfig?.enabled) return null;
  const tc = reflectionConfig.toolReflection;
  if (!tc?.enabled) return null;

  // 检查本迭代是否超过最大反思次数
  const reflectionCountInIteration = executionLog.filter(
    e => e.nodeType === 'reflection' && e.reflectionType === 'tool' && e.iteration === iteration
  ).length;
  if (reflectionCountInIteration >= tc.maxPerIteration) return null;

  const prompt = `You are executing a browser automation task. The tool "${toolName}" was just called with parameters ${JSON.stringify(toolCallParams)}.

Tool returned result (truncated):
${toolResultStr.substring(0, 2000)}

Please quickly assess whether this tool result is helpful for completing the task.

Output in JSON format (do not include markdown code blocks):
{
  "useful": true,
  "reasoning": "brief reason (within 20 characters)",
  "suggestion": null
}

If the result is not helpful, set useful to false and provide a suggestion.`;

  try {
    const apiUrl = `${config.apiBase}/chat/completions`;
    const response = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || config.modelName,
        messages: [
          { role: 'system', content: 'You are a tool execution result evaluator. Output only JSON.' },
          { role: 'user', content: prompt }
        ],
        stream: false,
        temperature: 0.1,
        max_tokens: 256
      })
    }, 15000, 1, 1000);

    if (!response.ok) return null;

    const data = await response.json();

    // 记录工具反思 token 使用统计
    if (data.usage) {
      recordTokenUsage({
        sessionId: sessionId || 'unknown',
        model: model || config.modelName,
        usage: data.usage,
        callType: 'tool_reflection'
      }).catch(() => {});
    }

    const rawContent = data.choices?.[0]?.message?.content || '';

    try {
      const parsed = JSON.parse(rawContent.trim());
      return {
        useful: parsed.useful !== false,
        reasoning: parsed.reasoning || '',
        suggestion: parsed.suggestion || null
      };
    } catch {
      // 尝试从代码块提取
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          useful: parsed.useful !== false,
          reasoning: parsed.reasoning || '',
          suggestion: parsed.suggestion || null
        };
      }
    }

    return null;
  } catch (error) {
    logger.warn('[Background] 工具反思调用失败:', error.message);
    return null;
  }
}

/**
 * 子任务反思：对子任务执行结果进行质量评估
 */
export async function reflectOnSubtask(messages, result, executionLog, model, config, subtaskReflectConfig, tabId, subtaskName, parentExecutionLog, sessionId) {
  const startTime = Date.now();
  const reflectionLog = [];

  // 构建评估维度
  const dimensions = subtaskReflectConfig.dimensions || ['completeness', 'relevance'];
  const dimensionsDesc = {
    completeness: 'whether the task is fully completed',
    relevance: 'whether the result is relevant to the task goal',
    accuracy: 'whether the result is accurate without errors',
    efficiency: 'whether the execution process is efficient'
  };

  const dimensionPrompts = dimensions.map(d => `- ${d}: ${dimensionsDesc[d] || d}`).join('\n');

  const prompt = `You are evaluating the execution result of a subtask.

Subtask name: ${subtaskName}

Execution result:
${result.substring(0, 2000)}${result.length > 2000 ? '...(truncated)' : ''}

Please evaluate along the following dimensions (each scored 1-10):
${dimensionPrompts}

Output the evaluation result in JSON format (do not include markdown code blocks):
{
  "overallScore": 8,
  "dimensions": {
    "completeness": 9,
    "relevance": 8
  },
  "issues": ["discovered issue 1", "discovered issue 2"],
  "suggestions": ["improvement suggestion 1"],
  "refinedAnswer": null  // if revision is needed, provide the revised answer here
}`;

  try {
    const apiUrl = `${config.apiBase}/chat/completions`;
    const reflectionModel = subtaskReflectConfig.model || model || config.modelName;

    const response = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: reflectionModel,
        messages: [
          { role: 'system', content: 'You are a strict quality evaluator. Output the evaluation result in JSON format; do not include markdown code block markers.' },
          { role: 'user', content: prompt }
        ],
        stream: false,
        temperature: subtaskReflectConfig.temperature || 0.3,
        max_tokens: subtaskReflectConfig.maxTokens || 1024
      })
    }, 30000, 1, 1000);

    if (!response.ok) {
      throw new Error(`Subtask reflection API error: ${response.status}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '';
    const parsed = parseReflectionResult(rawContent);
    const duration = Date.now() - startTime;

    // 记录反思日志
    reflectionLog.push({
      id: crypto.randomUUID(),
      iteration: 0,
      timestamp: new Date().toISOString(),
      status: 'success',
      nodeType: 'reflection',
      nodeName: t('reflection.subtaskNodeName', { name: subtaskName }),
      reflectionType: 'subtask',
      overallScore: parsed.overallScore,
      dimensions: parsed.dimensions,
      issues: parsed.issues,
      suggestions: parsed.suggestions,
      prompt,
      rawContent,
      apiRequest: {
        model: reflectionModel,
        messageCount: 2,
        temperature: subtaskReflectConfig.temperature || 0.3,
        maxTokens: subtaskReflectConfig.maxTokens || 1024
      },
      apiResponse: {
        tokenUsage: data.usage || null
      },
      duration
    });

    logger.debug(`[Background] 子任务反思完成: ${subtaskName}, 评分: ${parsed.overallScore}/10, 耗时: ${duration}ms`);

    // 记录子任务反思 token 使用统计
    if (data.usage) {
      recordTokenUsage({
        sessionId,
        model: reflectionModel,
        usage: data.usage,
        callType: 'subtask_reflection'
      }).catch(() => {});
    }

    return {
      score: parsed.overallScore,
      refinedContent: parsed.refinedAnswer && parsed.refinedAnswer !== result ? parsed.refinedAnswer : null,
      reflectionLog
    };

  } catch (error) {
    logger.warn('[Background] 子任务反思失败:', error.message);
    const duration = Date.now() - startTime;

    reflectionLog.push({
      id: crypto.randomUUID(),
      iteration: 0,
      timestamp: new Date().toISOString(),
      status: 'failed',
      nodeType: 'reflection',
      nodeName: t('reflection.subtaskNodeName', { name: subtaskName }),
      reflectionType: 'subtask',
      error: error.message,
      duration
    });

    return {
      score: null,
      refinedContent: null,
      reflectionLog
    };
  }
}
