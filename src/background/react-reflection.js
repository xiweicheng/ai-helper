// background/react-reflection.js - 反思机制（Reflection）
// 从 react-loop.js 拆分，包含所有反思相关的判断、Prompt 构建、API 调用与结果解析
import { fetchWithRetry } from './tool-executor.js';
import { recordTokenUsage } from './token-recorder.js';
import logger from '../shared/logger.js';

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
  const importantTools = ['fill_form', 'click_element', 'download_file', 'manage_cookies', 'clear_page_data'];
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
  // 提取用户问题
  const userMessages = messages.filter(m => m.role === 'user');
  const userQuestion = userMessages.length > 0
    ? (typeof userMessages[userMessages.length - 1].content === 'string'
        ? userMessages[userMessages.length - 1].content
        : JSON.stringify(userMessages[userMessages.length - 1].content))
    : '未知';

  // 构建详细执行摘要
  const apiCalls = executionLog.filter(e => e.nodeType === 'api_call').length;
  const toolEntries = executionLog.filter(e => e.nodeType === 'tool_exec');
  const toolDetails = toolEntries.map(e => {
    const params = e.action?.params || {};
    const paramsStr = Object.keys(params).length > 0 ? `参数: ${JSON.stringify(params)}` : '';
    const obs = e.observation ? `结果摘要: ${String(e.observation).substring(0, 200)}` : '';
    const status = e.status === 'success' ? '✅' : '❌';
    return `  ${status} ${e.action?.name || e.nodeName} ${paramsStr} ${obs}`.trim();
  }).join('\n');

  const toolSummary = toolEntries.length > 0
    ? toolEntries.map(e => `${e.action?.name || e.nodeName} (${e.status})`).join(', ')
    : '无';

  const planTasks = executionLog.filter(e => e.nodeType === 'tool_exec' && e.action?.name === 'plan_task');
  const subtaskInfo = planTasks.length > 0
    ? `，已拆解 ${planTasks[0].subtaskCount || 0} 个子任务`
    : '';

  const toolReflectionEntries = executionLog.filter(e => e.nodeType === 'reflection' && e.reflectionType === 'tool');
  const toolReflectionSummary = toolReflectionEntries.length > 0
    ? toolReflectionEntries.map(e => {
        const useful = e.useful ? '✅有用' : '⚠️无效';
        return `  ${useful} - ${e.nodeName}: ${e.reasoning || ''} ${e.suggestion ? `(建议: ${e.suggestion})` : ''}`;
      }).join('\n')
    : '无';

  const summary = `API 调用 ${apiCalls} 次${subtaskInfo}。`;

  // 截断答案
  const truncatedAnswer = answer.length > 3000 ? answer.substring(0, 3000) + '...' : answer;

  return `请严格评估以下 AI 助手对用户问题的回答质量${round > 1 ? `（这是第 ${round} 轮评估，上一轮的修订答案见下方"最终回答"）` : ''}。

## 用户问题
${userQuestion}

## 执行过程概览
${summary}

## 工具执行详情（包含参数和结果摘要）
${toolDetails || '无工具调用'}

## 工具反思记录（反思节点）
${toolReflectionSummary}

## AI 助手的最终回答
${truncatedAnswer}

## 评估维度（每项 1-10 分）
1. completeness（完整性）：是否完全回答了用户的问题，有无遗漏？
2. accuracy（准确性）：信息是否准确可靠，有无幻觉或错误？
3. relevance（相关性）：回答是否紧贴用户需求，有没有跑题？
4. toolUsage（工具使用）：工具选择是否合适，参数是否合理？参考上述工具执行详情判断。
5. efficiency（效率）：是否有不必要的步骤或重复操作？

请以严格的 JSON 格式输出（不要包含 markdown 代码块标记）：
{
  "overallScore": 8,
  "dimensions": {
    "completeness": 8,
    "accuracy": 9,
    "relevance": 7,
    "toolUsage": 8,
    "efficiency": 8
  },
  "issues": ["具体问题1", "具体问题2"],
  "suggestions": ["具体改进建议1", "具体改进建议2"],
  "refinedAnswer": "如果回答有明显缺陷，输出修订后的完整回答（必须完整，不能只输出修改部分）；否则设为 null"
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

  sendStatusUpdate('质量评估', 'processing');

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
            { role: 'system', content: '你是严格的质量评估者。请以 JSON 格式输出评估结果，不要包含 markdown 代码块标记。' },
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
            parsed.issues.unshift('⚠️ 原答案评分过低，已由反思修订');
          }
        } else {
          decision = 'needs_improvement';
          parsed.suggestions = parsed.suggestions || [];
          if (!parsed.suggestions.some(s => s.includes('重新执行') || s.includes('retry'))) {
            parsed.suggestions.push('建议：重新执行任务，基于反思问题调整工具选择和执行策略');
          }
        }
      }

      bestDecision = decision;  // 追踪每轮的实际决策
      const decisionLabel = decision === 'passed' ? '通过' : decision === 'revised' ? '已修订' : '需改进';

      reflectionLog.push({
        id: roundId,
        iteration: globalIteration?.value || 0,
        timestamp: new Date().toISOString(),
        status: 'success',
        nodeType: 'reflection',
        nodeName: `质量评估 ${round}/${maxRounds}`,
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
    const decisionLabel = finalDecision === 'passed' ? '通过' : finalDecision === 'revised' ? '已修订' : '需改进';

    sendStatusUpdate(`质量评估: ${finalScore}/10 (${decisionLabel})`, 'success');
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
      nodeName: '质量评估',
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
export async function reflectOnToolResult(toolName, toolResultStr, toolCallParams, config, model, reflectionConfig, executionLog, iteration) {
  if (!reflectionConfig?.enabled) return null;
  const tc = reflectionConfig.toolReflection;
  if (!tc?.enabled) return null;

  // 检查本迭代是否超过最大反思次数
  const reflectionCountInIteration = executionLog.filter(
    e => e.nodeType === 'reflection' && e.reflectionType === 'tool' && e.iteration === iteration
  ).length;
  if (reflectionCountInIteration >= tc.maxPerIteration) return null;

  const prompt = `你正在执行一个浏览器自动化任务。刚才调用了工具 "${toolName}"，参数为 ${JSON.stringify(toolCallParams)}。

工具返回结果（已截断）：
${toolResultStr.substring(0, 2000)}

请快速判断这个工具结果对完成任务是否有帮助。

以 JSON 格式输出（不要包含 markdown 代码块）：
{
  "useful": true,
  "reasoning": "简要理由（20字以内）",
  "suggestion": null
}

如果结果无帮助，设置 useful 为 false 并给出建议。`;

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
          { role: 'system', content: '你是一个工具执行结果评估者。只输出 JSON。' },
          { role: 'user', content: prompt }
        ],
        stream: false,
        temperature: 0.1,
        max_tokens: 256
      })
    }, 15000, 1, 1000);

    if (!response.ok) return null;

    const data = await response.json();
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
    completeness: '任务是否完整完成',
    relevance: '结果是否与任务目标相关',
    accuracy: '结果是否准确无误',
    efficiency: '执行过程是否高效'
  };

  const dimensionPrompts = dimensions.map(d => `- ${d}: ${dimensionsDesc[d] || d}`).join('\n');

  const prompt = `你正在评估一个子任务的执行结果。

子任务名称：${subtaskName}

执行结果：
${result.substring(0, 2000)}${result.length > 2000 ? '...(已截断)' : ''}

请按以下维度评估（每项 1-10 分）：
${dimensionPrompts}

以 JSON 格式输出评估结果（不要包含 markdown 代码块）：
{
  "overallScore": 8,
  "dimensions": {
    "completeness": 9,
    "relevance": 8
  },
  "issues": ["发现的问题1", "发现的问题2"],
  "suggestions": ["改进建议1"],
  "refinedAnswer": null  // 如果需要修订，在此提供修订后的答案
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
          { role: 'system', content: '你是一个严格的质量评估者。请以 JSON 格式输出评估结果，不要包含 markdown 代码块标记。' },
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
      nodeName: `子任务反思: ${subtaskName}`,
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
      nodeName: `子任务反思: ${subtaskName}`,
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
