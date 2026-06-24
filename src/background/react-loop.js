// background/react-loop.js - ReAct 推理循环与 API 调用
import { cancelReactLoop, resetReactCancel, isCancelled, getOrCreateAbortController, getCurrentReactTabId, setCurrentReactTabId, incrementDialogApiCallCount, getDialogApiCallCount } from './state.js';
import { getStoredConfig } from './config.js';
import { getTools, executeTool, fetchWithTimeout, fetchWithRetry } from './tool-executor.js';
import { preselectTools } from './tool-preselector.js';

/**
 * 创建带执行日志的错误
 */
function createErrorWithLog(message, executionLog) {
  const error = new Error(message);
  error.executionLog = executionLog;
  return error;
}

/**
 * 带超时控制的 Promise 执行器
 * 使用 Promise.race 确保超时能正确捕获
 */
async function runWithTimeout(promise, timeoutMs, errorMessage, executionLog) {
  const timeoutPromise = new Promise((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(createErrorWithLog(errorMessage, executionLog));
    }, timeoutMs);
    
    // 确保清理
    promise.then(() => clearTimeout(timeoutId)).catch(() => clearTimeout(timeoutId));
  });
  
  return Promise.race([promise, timeoutPromise]);
}

/**
 * ReAct 推理循环
 * 注意：澄清工具执行时会暂停整体循环超时计时
 */
export async function reactLoop(messages, model, tools, tabId, apiParams = {}, sessionId = null, taskContext = null, onLogUpdate = null, globalIteration = { value: 0 }, initialLog = []) {
  let iteration = 0;
  let currentMessages = [...messages];
  
  const executionLog = [...initialLog];
  let currentSubtaskIndex = null;
  let subtaskPlan = null;
  
  // 缓存全量工具列表，用于 plan_task 拆解时临时展开
  let fullToolsCache = null;
  async function getFullTools() {
    if (!fullToolsCache) {
      fullToolsCache = await getTools();
    }
    return fullToolsCache;
  }
  
  resetReactCancel(sessionId || tabId);
  setCurrentReactTabId(tabId);
  
  // 为当前会话创建 AbortController，用于用户取消时中断 fetch 请求
  const abortController = sessionId ? getOrCreateAbortController(sessionId) : null;
  const abortSignal = abortController?.signal;
  
  const config = await getStoredConfig();
  const reactConfig = config.reactConfig;
  const maxIterations = reactConfig.maxIterations;
  const apiTimeout = reactConfig.apiTimeout;
  const loopTimeout = reactConfig.loopTimeout;
  const toolTimeout = reactConfig.toolTimeout;
  const clarifyTimeout = reactConfig.clarifyTimeout;
  
  console.log('[Background] reactLoop 配置:', reactConfig);
  console.log('[Background] reactLoop 收到工具列表:', tools.map(t => t.function.name), '数量:', tools.length);
  console.log('[Background] reactLoop 任务上下文:', taskContext ? `子任务 ${taskContext.subtaskId || '无'} (${taskContext.subtaskName || '主任务'})` : '无');
  
  /**
   * 发送实时执行状态更新消息
   */
  function sendExecutionStatusUpdate(nodeName, status) {
    try {
      const logSnapshot = [...executionLog];
      
      // 如果有回调函数，通知父任务
      if (typeof onLogUpdate === 'function') {
        onLogUpdate(logSnapshot);
      }
      
      const msg = {
        type: 'EXECUTION_STATUS_UPDATE',
        nodeName: nodeName,
        status: status,
        executionLog: logSnapshot
      };
      
      if (sessionId) {
        msg.sessionId = sessionId;
      }
      
      chrome.runtime.sendMessage(msg).catch(err => {
        console.log('[Background] 发送执行状态更新失败:', err.message);
      });
    } catch (e) {
      console.log('[Background] 发送执行状态更新异常:', e.message);
    }
  }
  
  // 整体循环超时控制 - 使用动态调整机制
  const loopStartTime = Date.now();
  let totalPausedDuration = 0;  // 累计暂停时长（澄清等待时间不计入）
  let pauseStartTime = null;    // 暂停开始时刻
  let isPaused = false;         // 是否处于暂停状态
  
  // 发送初始状态
  sendExecutionStatusUpdate('准备开始执行...', 'processing');
  
  /**
   * 暂停整体循环超时计时（用于澄清工具）
   */
  function pauseLoopTimer() {
    if (!isPaused) {
      pauseStartTime = Date.now();
      isPaused = true;
      console.log('[Background] 整体循环超时已暂停');
    }
  }
  
  /**
   * 计算当前剩余超时时间
   */
  function getRemainingTime() {
    const elapsedTime = Date.now() - loopStartTime;
    return loopTimeout + totalPausedDuration - elapsedTime;
  }
  
  /**
   * 恢复整体循环超时计时
   */
  function resumeLoopTimer() {
    if (isPaused && pauseStartTime !== null) {
      const pauseDuration = Date.now() - pauseStartTime;
      totalPausedDuration += pauseDuration;
      pauseStartTime = null;
      isPaused = false;
      
      console.log('[Background] 整体循环超时已恢复，暂停时长:', Math.round(pauseDuration / 1000), 's，剩余时间:', Math.round(getRemainingTime() / 1000), 's');
    }
  }
  
  try {
    while (iteration < maxIterations) {
      if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
        throw createErrorWithLog('ReAct 循环已被用户取消', executionLog);
      }
      
      // 检查超时（使用动态调整后的超时时间）
      const elapsedTime = Date.now() - loopStartTime;
      const adjustedTimeout = loopTimeout + totalPausedDuration;
      if (elapsedTime > adjustedTimeout) {
        throw createErrorWithLog(`ReAct 循环总超时 (${loopTimeout}ms，不含澄清等待时间)`, executionLog);
      }
      
      iteration++;
      // 递增 API 调用计数器（预筛选已经用了第1次）
      incrementDialogApiCallCount(sessionId);
      const remainingTime = adjustedTimeout - elapsedTime;
      console.log(`[Background] ReAct 循环第 ${iteration} 次，剩余时间: ${Math.round(remainingTime / 1000)}s (已暂停: ${Math.round(totalPausedDuration / 1000)}s)`);
      
      let response;
      const apiCallStartTime = Date.now();
      
      // 过滤消息中的不必要字段，确保消息格式符合 API 要求
      const filteredMessages = currentMessages.map((msg, index) => {
        // 移除不需要传递给 API 的字段
        const { executionLog, subtaskId, subtaskName, subtaskIndex, ...rest } = msg;
        
        // 对于工具消息，确保只有 role、content 和 tool_call_id
        if (rest.role === 'tool') {
          // 如果没有 tool_call_id，记录警告并跳过这条消息
          if (!rest.tool_call_id) {
            console.warn(`[Background] 发现消息 ${index} 缺少 tool_call_id，已跳过`, msg);
            return null;
          }
          return {
            role: rest.role,
            content: rest.content,
            tool_call_id: rest.tool_call_id
          };
        }
        
        return rest;
      }).filter(msg => msg !== null);
      
      // 添加 API 调用开始的日志节点（状态为 processing）
      const apiLogId = crypto.randomUUID();
      const currentCount = getDialogApiCallCount(sessionId);
      
      // 如果工具集中包含 plan_task，展开为全量工具，确保任务拆解时模型能感知所有可用工具
      const hasPlanTask = tools.some(t => t.function?.name === 'plan_task');
      const apiTools = hasPlanTask ? await getFullTools() : tools;
      if (hasPlanTask) {
        console.log('[Background] 当前迭代包含 plan_task，使用全量工具进行任务拆解，工具数:', apiTools.length);
      }
      
      executionLog.push({
        id: apiLogId,
        iteration: iteration,
        globalIteration: currentCount,
        timestamp: new Date().toISOString(),
        status: 'processing',
        nodeType: 'api_call',
        nodeName: `API调用 (第${currentCount}次${taskContext ? `, 子任务第${iteration}次` : ''})`,
        apiRequest: {
          messageCount: filteredMessages.length,
          toolCount: apiTools.length
        }
      });
      
      // 发送 API 调用状态
      sendExecutionStatusUpdate(`API调用 (第${currentCount}次${taskContext ? `, 子任务第${iteration}次` : ''})`, 'processing');
      
      try {
        const apiUrl = `${config.apiBase}/chat/completions`;
        console.log('[Background] API 请求工具数量:', apiTools.length);
        
        const requestBody = {
          model: model || config.modelName,
          messages: filteredMessages,
          tools: apiTools.map(t => {
            const { id, ...clean } = t;
            return clean;
          }),
          stream: false
        };
        
        // 添加 temperature 和 top_p 参数
        if (apiParams.temperature !== undefined) {
          requestBody.temperature = apiParams.temperature;
        }
        if (apiParams.top_p !== undefined) {
          requestBody.top_p = apiParams.top_p;
        }
        
        // 使用带重试和超时的 fetch
        const fetchResponse = await fetchWithRetry(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: abortSignal
        }, apiTimeout, reactConfig.apiRetryCount, reactConfig.apiRetryBaseDelay, (retryAttempt, retryError) => {
          console.warn(`[Background] API 重试 ${retryAttempt} 次后:`, retryError.message);
        });
        
        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text();
          console.error('[Background] API 响应错误:', fetchResponse.status, errorText);
          throw new Error(`HTTP error! status: ${fetchResponse.status}, message: ${errorText}`);
        }
        
        // 先获取原始文本，再解析 JSON
        const responseText = await fetchResponse.text();
        console.log('[Background] API 响应原始文本长度:', responseText.length, '预览:', responseText.substring(0, 200));
        try {
          response = JSON.parse(responseText);
        } catch (parseError) {
          console.error('[Background] JSON 解析失败:', parseError);
          console.error('[Background] 原始响应:', responseText);
          throw new Error('API 响应不是有效的 JSON: ' + parseError.message);
        }
      } catch (error) {
        console.error('[Background] API 调用失败:', error);
        
        // 更新 API 调用日志状态为失败
        const apiLogIndex = executionLog.findIndex(log => log.id === apiLogId);
        if (apiLogIndex !== -1) {
          executionLog[apiLogIndex] = {
            ...executionLog[apiLogIndex],
            duration: Date.now() - apiCallStartTime,
            status: 'failed',
            apiRequest: {
              ...executionLog[apiLogIndex].apiRequest,
              model: model || config.modelName,
              temperature: apiParams.temperature,
              top_p: apiParams.top_p,
              messageCount: filteredMessages.length,
              toolCount: apiTools.length
            },
            error: error.message
          };
        }
        
        throw createErrorWithLog(error.message);
      }
      
      // 更新成功的 API 调用日志
      const apiCallDuration = Date.now() - apiCallStartTime;
      const assistantMessage = response.choices?.[0]?.message;
      
      const apiLogIndex = executionLog.findIndex(log => log.id === apiLogId);
      if (apiLogIndex !== -1) {
        executionLog[apiLogIndex] = {
          ...executionLog[apiLogIndex],
          duration: apiCallDuration,
          status: 'success',
          thought: assistantMessage?.content || '',
          action: assistantMessage?.tool_calls?.length > 0 ? {
            name: assistantMessage.tool_calls[0].function?.name || assistantMessage.tool_calls[0].name,
            params: JSON.parse(assistantMessage.tool_calls[0].function?.arguments || '{}')
          } : null,
          apiRequest: {
            ...executionLog[apiLogIndex].apiRequest,
            model: model || config.modelName,
            temperature: apiParams.temperature,
            top_p: apiParams.top_p,
            messageCount: filteredMessages.length,
            toolCount: apiTools.length
          },
          apiResponse: {
            finishReason: response.choices?.[0]?.finish_reason,
            tokenUsage: response.usage
          }
        };
      }
      
      // 检查是否有工具调用
      if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log('[Background] 收到工具调用:', assistantMessage.tool_calls);
        
        currentMessages.push(assistantMessage);
        
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function?.name || toolCall.name;
          const toolStartTime = Date.now();
          
          // 添加工具执行开始的日志节点（状态为 processing）
          const toolLogId = crypto.randomUUID();
          executionLog.push({
            id: toolLogId,
            iteration: iteration,
            timestamp: new Date().toISOString(),
            status: 'processing',
            nodeType: 'tool_exec',
            nodeName: `执行工具: ${toolName}`
          });
          
          // 发送工具执行状态
          sendExecutionStatusUpdate(`执行工具: ${toolName}`, 'processing');
          
          // 如果是澄清工具，暂停整体循环超时计时
          if (toolName === 'clarify_question') {
            pauseLoopTimer();
            chrome.runtime.sendMessage({
              type: 'CLARIFY_START',
              ...(sessionId ? { sessionId } : {})
            }).catch(err => {
              console.log('[Background] 发送 CLARIFY_START 消息失败:', err.message);
            });
          }
          
          let toolResult;
          try {
            // 使用带超时的工具执行（澄清工具不设置外层超时）
            toolResult = await executeToolWithTimeout(toolCall, tabId, toolTimeout, loopTimeout, clarifyTimeout);
            
            // 如果是澄清工具，恢复整体循环超时计时
            if (toolName === 'clarify_question') {
              resumeLoopTimer();
              chrome.runtime.sendMessage({
                type: 'CLARIFY_END',
                ...(sessionId ? { sessionId } : {})
              }).catch(err => {
                console.log('[Background] 发送 CLARIFY_END 消息失败:', err.message);
              });
              
              // 澄清后重新预筛选工具：用户补充了新信息，工具集需要同步更新
              console.log('[Background] 澄清完成，重新预筛选工具...');
              try {
                const fullTools = await getTools();
                if (fullTools.length > 5) {
                  const rePreselectCount = incrementDialogApiCallCount(sessionId);
                  const reSelection = await preselectTools(currentMessages, model, fullTools, apiParams, rePreselectCount);
                  if (reSelection.type === 'tools') {
                    tools = reSelection.tools;
                    console.log('[Background] 澄清后工具重新筛选完成:', tools.map(t => t.function.name));
                  }
                  // 合并重新筛选的执行日志
                  if (reSelection.executionLog) {
                    executionLog.push(...reSelection.executionLog);
                  }
                }
              } catch (rePreselectErr) {
                console.warn('[Background] 澄清后工具重新筛选失败，继续使用当前工具集:', rePreselectErr.message);
              }
            }
            
            // 确保 toolResult 是字符串格式
            const toolResultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
            
            // 处理任务规划工具的结果，提取子任务列表
            if (toolName === 'plan_task' && toolResult && toolResult.success && toolResult.data) {
              subtaskPlan = toolResult.data;
              console.log('[Background] 收到任务规划结果:', JSON.stringify(subtaskPlan));
              
              // 先添加 plan_task 工具的响应消息（必须先响应工具调用）
              currentMessages.push({
                role: 'tool',
                content: JSON.stringify({
                  success: true,
                  message: `任务规划完成，已拆解为 ${subtaskPlan.subtasks.length} 个子任务`,
                  data: subtaskPlan
                }),
                tool_call_id: toolCall.id
              });
              
              // 更新工具执行日志
              const toolLogIndex = executionLog.findIndex(log => log.id === toolLogId);
              if (toolLogIndex !== -1) {
                executionLog[toolLogIndex] = {
                  ...executionLog[toolLogIndex],
                  duration: Date.now() - toolStartTime,
                  status: 'success',
                  nodeName: `任务规划完成`,
                  action: {
                    name: toolName,
                    params: JSON.parse(toolCall.function?.arguments || '{}')
                  },
                  observation: `已拆解为 ${subtaskPlan.subtasks.length} 个子任务`,
                  subtaskCount: subtaskPlan.subtasks.length,
                  strategy: subtaskPlan.strategy
                };
              }
              
              // 发送任务规划完成状态更新（让实时日志显示plan_task节点）
              sendExecutionStatusUpdate('任务规划完成', 'success');
              
              // 开始执行子任务
              const subtaskResults = await executeSubtasks(subtaskPlan, model, tabId, apiParams, sessionId, executionLog, globalIteration);
              
              // 将所有子任务结果添加到消息历史（作为系统消息，而非工具消息）
              const subtaskSummary = subtaskResults.map((result, idx) => 
                `子任务 ${idx + 1}: ${result.subtaskName}\n结果: ${result.result}`
              ).join('\n\n');
              
              currentMessages.push({
                role: 'system',
                content: `以下是拆解后子任务的执行结果，请进行总结：\n\n${subtaskSummary}`
              });
              
              // 继续下一轮循环，让模型总结子任务结果
              continue;
            }
            
            currentMessages.push({
              role: 'tool',
              content: toolResultStr,
              tool_call_id: toolCall.id,
              subtaskId: currentSubtaskIndex !== null ? `subtask_${currentSubtaskIndex}` : null,
              subtaskName: subtaskPlan?.subtasks[currentSubtaskIndex]?.name || null
            });
            
            console.log('[Background] 工具执行结果长度:', toolResultStr.length, '内容预览:', toolResultStr.substring(0, 200));
            
            // 检查工具执行是否成功
            const isSuccess = toolResult && toolResult.success !== false;
            
            // 更新工具执行日志
            const toolLogIndex = executionLog.findIndex(log => log.id === toolLogId);
            if (toolLogIndex !== -1) {
              executionLog[toolLogIndex] = {
                ...executionLog[toolLogIndex],
                duration: Date.now() - toolStartTime,
                status: isSuccess ? 'success' : 'failed',
                nodeName: `工具执行:${toolName}`,
                action: {
                  name: toolName,
                  params: JSON.parse(toolCall.function?.arguments || '{}')
                },
                observation: toolResultStr.length > 500 ? toolResultStr.substring(0, 500) + '...' : toolResultStr
              };
            }
            
          } catch (toolError) {
            console.error('[Background] 工具执行失败:', toolError);
            
            // 如果是澄清工具，恢复整体循环超时计时
            if (toolName === 'clarify_question') {
              resumeLoopTimer();
              chrome.runtime.sendMessage({
                type: 'CLARIFY_END',
                ...(sessionId ? { sessionId } : {})
              }).catch(err => {
                console.log('[Background] 发送 CLARIFY_END 消息失败:', err.message);
              });
            }
            
            // 更新工具执行日志为失败
            const toolLogIndex = executionLog.findIndex(log => log.id === toolLogId);
            if (toolLogIndex !== -1) {
              executionLog[toolLogIndex] = {
                ...executionLog[toolLogIndex],
                duration: Date.now() - toolStartTime,
                status: 'failed',
                nodeName: `工具执行:${toolName}`,
                action: {
                  name: toolName,
                  params: JSON.parse(toolCall.function?.arguments || '{}')
                },
                error: toolError.message
              };
            }
            
            throw createErrorWithLog(toolError.message);
          }
        }
        
        continue;
      }
      
      const content = assistantMessage?.content || '';
      console.log('[Background] ReAct 循环完成，最终内容长度:', content.length);
      
      // 发送完成状态
      sendExecutionStatusUpdate('执行完成', 'success');
      
      // 返回执行日志和内容
      return { content, executionLog };
    }
    
    const error = new Error(`ReAct 循环超过最大迭代次数 (${maxIterations})`);
    error.executionLog = executionLog;
    throw error;
  } catch (error) {
    // 重新抛出错误，保持错误处理流程
    throw error;
  }
}

/**
 * 子任务执行配置常量
 */
const SUBTASK_CONFIG = {
  DEFAULT_FAILURE_STRATEGY: 'continue',
  DEFAULT_MAX_RETRIES: 1,
  DEFAULT_MAX_PARALLEL: 3
};

/**
 * 执行子任务序列
 * 支持顺序执行、并行执行和条件执行策略
 * 支持失败策略、重试机制和回滚机制
 */
export async function executeSubtasks(subtaskPlan, model, tabId, apiParams, sessionId, parentExecutionLog, globalIteration = { value: 0 }) {
  const { 
    subtasks = [], 
    strategy = 'sequential', 
    taskDescription,
    failureStrategy = SUBTASK_CONFIG.DEFAULT_FAILURE_STRATEGY,
    maxRetries = SUBTASK_CONFIG.DEFAULT_MAX_RETRIES,
    maxParallel = SUBTASK_CONFIG.DEFAULT_MAX_PARALLEL
  } = subtaskPlan;
  
  const results = [];
  const completedSubtasks = []; // 记录已成功完成的子任务，用于回滚
  
  console.log('[Background] 开始执行子任务，策略:', strategy, '失败策略:', failureStrategy, '最大重试:', maxRetries, '数量:', subtasks.length);
  
  // 按依赖关系排序（拓扑排序）
  const sortedSubtasks = strategy === 'dependency' 
    ? sortSubtasksByDependencies(subtasks) 
    : subtasks;
  
  // 筛选每个子任务需要的工具
  const toolSets = await prepareToolSetsForSubtasks(sortedSubtasks);
  
  /**
   * 回滚已完成的子任务
   */
  async function rollbackCompletedTasks() {
    console.log('[Background] 开始回滚已完成的子任务');
    
    // 逆序回滚
    for (let i = completedSubtasks.length - 1; i >= 0; i--) {
      const { subtask, result } = completedSubtasks[i];
      
      if (typeof subtask.rollback === 'function') {
        try {
          console.log(`[Background] 回滚子任务: ${subtask.name}`);
          await subtask.rollback(result);
          
          // 记录回滚日志
          parentExecutionLog.push({
            id: crypto.randomUUID(),
            iteration: 0,
            timestamp: new Date().toISOString(),
            status: 'rolledback',
            nodeType: 'subtask',
            nodeName: `子任务 ${subtask.name} (已回滚)`,
            subtaskId: subtask.id,
            subtaskName: subtask.name
          });
          
          chrome.runtime.sendMessage({
            type: 'EXECUTION_STATUS_UPDATE',
            nodeName: `子任务 ${subtask.name} (已回滚)`,
            status: 'rolledback',
            executionLog: [...parentExecutionLog],
            ...(sessionId ? { sessionId } : {})
          }).catch(err => {});
          
        } catch (rollbackError) {
          console.error('[Background] 回滚失败:', rollbackError.message);
          parentExecutionLog.push({
            id: crypto.randomUUID(),
            iteration: 0,
            timestamp: new Date().toISOString(),
            status: 'rollback_failed',
            nodeType: 'subtask',
            nodeName: `子任务 ${subtask.name} (回滚失败)`,
            subtaskId: subtask.id,
            subtaskName: subtask.name,
            error: rollbackError.message
          });
        }
      }
    }
  }
  
  /**
   * 执行单个子任务（带重试逻辑）
   */
  async function executeSingleSubtask(subtask, subtaskTools, subtaskIndex) {
    const subtaskLogId = crypto.randomUUID();
    const taskGroup = `subtask_group_${subtaskIndex}`;
    let lastError = null;
    
    // 添加子任务开始日志（包含任务组信息）
    parentExecutionLog.push({
      id: subtaskLogId,
      iteration: 0,
      timestamp: new Date().toISOString(),
      status: 'processing',
      nodeType: 'subtask',
      nodeName: `子任务 ${subtaskIndex + 1}: ${subtask.name}`,
      subtaskId: subtask.id,
      subtaskName: subtask.name,
      subtaskIndex: subtaskIndex,
      taskGroup: taskGroup,  // 任务组ID，用于前端分组展示
      taskGroupIndex: subtaskIndex + 1,
      taskGroupName: subtask.name,
      isSubtask: true
    });
    
    // 发送子任务开始状态
    chrome.runtime.sendMessage({
      type: 'EXECUTION_STATUS_UPDATE',
      nodeName: `子任务 ${subtaskIndex + 1}: ${subtask.name}`,
      status: 'processing',
      executionLog: [...parentExecutionLog],
      taskGroup: taskGroup,
      ...(sessionId ? { sessionId } : {})
    }).catch(err => {});
    
    // 重试循环
    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        console.log(`[Background] 执行子任务 ${subtaskIndex + 1}/${sortedSubtasks.length}: ${subtask.name} (尝试 ${retry + 1}/${maxRetries + 1})`);
        
        // 为子任务创建独立的消息上下文
        const subtaskMessages = [
          {
            role: 'system',
            content: `你正在执行一个子任务。请专注完成此任务，不要询问用户。\n\n任务背景：${taskDescription}\n\n当前子任务：${subtask.description}\n\n可用工具：${subtaskTools.map(t => t.function.name).join(', ')}`
          },
          {
            role: 'user',
            content: subtask.description
          }
        ];
        
        // 调用子任务的ReAct循环
        const subtaskResult = await reactLoop(
          subtaskMessages, 
          model, 
          subtaskTools, 
          tabId, 
          apiParams,
          sessionId,
          { subtaskId: subtask.id, subtaskName: subtask.name },
          (subtaskLog) => {
            // 实时回调：将子任务日志合并到父日志并发送更新
            const mergedLog = [...parentExecutionLog];
            subtaskLog.forEach(childLog => {
              mergedLog.push({
                ...childLog,
                subtaskId: subtask.id,
                subtaskName: subtask.name,
                subtaskIndex: subtaskIndex,
                taskGroup: taskGroup,  // 任务组ID，用于前端分组展示
                taskGroupIndex: subtaskIndex + 1,
                taskGroupName: subtask.name,
                isSubtask: true
              });
            });
            
            chrome.runtime.sendMessage({
              type: 'EXECUTION_STATUS_UPDATE',
              nodeName: `子任务 ${subtaskIndex + 1}: ${subtask.name}`,
              status: 'processing',
              executionLog: mergedLog,
              taskGroup: taskGroup,
              ...(sessionId ? { sessionId } : {})
            }).catch(err => {});
          },
          globalIteration
        );
        
        // 将子任务内部的执行日志合并到父执行日志中
        if (subtaskResult.executionLog && subtaskResult.executionLog.length > 0) {
          subtaskResult.executionLog.forEach(childLog => {
            parentExecutionLog.push({
              ...childLog,
              subtaskId: subtask.id,
              subtaskName: subtask.name,
              subtaskIndex: subtaskIndex,
              taskGroup: taskGroup,  // 任务组ID，用于前端分组展示
              taskGroupIndex: subtaskIndex + 1,
              taskGroupName: subtask.name,
              isSubtask: true
            });
          });
        }
        
        // 更新子任务日志为成功
        const logIndex = parentExecutionLog.findIndex(log => log.id === subtaskLogId);
        if (logIndex !== -1) {
          parentExecutionLog[logIndex] = {
            ...parentExecutionLog[logIndex],
            status: 'success',
            duration: Date.now() - new Date(parentExecutionLog[logIndex].timestamp).getTime(),
            result: subtaskResult.content.substring(0, 200) + (subtaskResult.content.length > 200 ? '...' : '')
          };
        }
        
        // 发送子任务完成状态（包含完整的执行日志）
        chrome.runtime.sendMessage({
          type: 'EXECUTION_STATUS_UPDATE',
          nodeName: `子任务 ${subtaskIndex + 1}: ${subtask.name} (完成)`,
          status: 'success',
          executionLog: [...parentExecutionLog],
          taskGroup: taskGroup,
          ...(sessionId ? { sessionId } : {})
        }).catch(err => {});
        
        // 记录已完成的子任务（用于回滚）
        completedSubtasks.push({ subtask, result: subtaskResult });
        
        return {
          success: true,
          subtaskId: subtask.id,
          subtaskName: subtask.name,
          result: subtaskResult.content,
          executionLog: subtaskResult.executionLog || [],
          retryCount: retry
        };
        
      } catch (error) {
        lastError = error;
        console.warn(`[Background] 子任务 ${subtask.name} 尝试 ${retry + 1} 失败:`, error.message);
        
        if (retry >= maxRetries) {
          // 重试次数用尽，记录失败
          if (error.executionLog && error.executionLog.length > 0) {
            error.executionLog.forEach(childLog => {
              parentExecutionLog.push({
                ...childLog,
                subtaskId: subtask.id,
                subtaskName: subtask.name,
                subtaskIndex: subtaskIndex,
                taskGroup: taskGroup,  // 任务组ID，用于前端分组展示
                taskGroupIndex: subtaskIndex + 1,
                taskGroupName: subtask.name,
                isSubtask: true
              });
            });
          }
          
          // 更新子任务日志为失败
          const logIndex = parentExecutionLog.findIndex(log => log.id === subtaskLogId);
          if (logIndex !== -1) {
            parentExecutionLog[logIndex] = {
              ...parentExecutionLog[logIndex],
              status: 'failed',
              duration: Date.now() - new Date(parentExecutionLog[logIndex].timestamp).getTime(),
              error: error.message,
              retryCount: retry + 1
            };
          }
          
          // 发送子任务失败状态
          chrome.runtime.sendMessage({
            type: 'EXECUTION_STATUS_UPDATE',
            nodeName: `子任务 ${subtaskIndex + 1}: ${subtask.name} (失败)`,
            status: 'failed',
            executionLog: [...parentExecutionLog],
            taskGroup: taskGroup,
            ...(sessionId ? { sessionId } : {})
          }).catch(err => {});
          
          return {
            success: false,
            subtaskId: subtask.id,
            subtaskName: subtask.name,
            result: error.message,
            executionLog: error.executionLog || [],
            retryCount: retry + 1,
            error: error
          };
        }
        
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retry)));
      }
    }
  }
  
  if (strategy === 'sequential' || strategy === 'dependency') {
    // 顺序执行
    for (let i = 0; i < sortedSubtasks.length; i++) {
      const subtask = sortedSubtasks[i];
      const subtaskTools = toolSets[subtask.id] || [];
      
      const result = await executeSingleSubtask(subtask, subtaskTools, i);
      results.push(result);
      
      if (!result.success) {
        console.log(`[Background] 子任务 ${subtask.name} 失败，失败策略: ${failureStrategy}`);
        
        if (failureStrategy === 'stop') {
          // 停止执行并回滚
          console.log('[Background] 执行回滚');
          await rollbackCompletedTasks();
          return results;
        }
        
        // continue 或 skip：继续执行剩余子任务
      }
    }
  } else if (strategy === 'parallel') {
    // 并行执行
    console.log('[Background] 并行执行子任务，最大并发数:', maxParallel);
    
    const executing = [];
    const resultsMap = new Map();
    
    for (let i = 0; i < sortedSubtasks.length; i++) {
      // 如果达到最大并行数，等待一个完成
      if (executing.length >= maxParallel) {
        const completed = await Promise.race(executing);
        const idx = executing.indexOf(completed);
        if (idx > -1) executing.splice(idx, 1);
      }
      
      const subtask = sortedSubtasks[i];
      const subtaskTools = toolSets[subtask.id] || [];
      
      const promise = executeSingleSubtask(subtask, subtaskTools, i).then(result => {
        resultsMap.set(subtask.id, result);
        return result;
      });
      
      executing.push(promise);
    }
    
    // 等待所有任务完成
    await Promise.all(executing);
    
    // 按原始顺序返回结果
    let hasFailed = false;
    sortedSubtasks.forEach(subtask => {
      const result = resultsMap.get(subtask.id);
      if (result) {
        results.push(result);
        
        if (!result.success) {
          hasFailed = true;
        }
      }
    });
    
    // 如果有失败且策略是 stop，执行回滚
    if (hasFailed && failureStrategy === 'stop') {
      console.log('[Background] 并行执行中发生失败，执行回滚');
      await rollbackCompletedTasks();
    }
  } else {
    // 未知策略，降级为顺序执行
    console.warn(`[Background] 未知执行策略: ${strategy}，降级为顺序执行`);
    return executeSubtasks({ ...subtaskPlan, strategy: 'sequential' }, model, tabId, apiParams, sessionId, parentExecutionLog, globalIteration);
  }
  
  return results;
}

/**
 * 按依赖关系对任务进行拓扑排序
 */
export function sortSubtasksByDependencies(subtasks) {
  const sorted = [];
  const visited = new Set();
  const tempMark = new Set();
  
  function visit(node) {
    if (tempMark.has(node.id)) {
      throw new Error('检测到子任务依赖循环');
    }
    if (!visited.has(node.id)) {
      tempMark.add(node.id);
      const dependencies = node.dependencies || [];
      dependencies.forEach(depId => {
        const depNode = subtasks.find(s => s.id === depId);
        if (depNode) {
          visit(depNode);
        }
      });
      tempMark.delete(node.id);
      visited.add(node.id);
      sorted.push(node);
    }
  }
  
  subtasks.forEach(subtask => {
    if (!visited.has(subtask.id)) {
      visit(subtask);
    }
  });
  
  return sorted;
}

/**
 * 为每个子任务准备工具集
 */
export async function prepareToolSetsForSubtasks(subtasks) {
  const allTools = await getTools();
  const toolSets = {};
  const allToolNames = allTools.map(t => t.function?.name).filter(Boolean);
  const allToolIds = allTools.map(t => t.id).filter(Boolean);
  
  subtasks.forEach(subtask => {
    const requiredToolNames = subtask.requiredTools || [];
    if (requiredToolNames.length > 0) {
      // 只选择子任务需要的工具（按工具名称或ID匹配，忽略大小写）
      toolSets[subtask.id] = allTools.filter(tool => {
        const toolName = (tool.function?.name || '').toLowerCase();
        const toolId = (tool.id || '').toLowerCase();
        return requiredToolNames.some(req => {
          if (typeof req !== 'string') return false;
          const reqLower = req.toLowerCase();
          return toolName === reqLower || toolId === reqLower;
        });
      });
      
      // 检查是否有工具未匹配到
      const unmatchedTools = requiredToolNames.filter(req => {
        if (typeof req !== 'string') return false;
        const reqLower = req.toLowerCase();
        return !allToolNames.some(name => (name || '').toLowerCase() === reqLower) &&
               !allToolIds.some(id => (id || '').toLowerCase() === reqLower);
      });
      
      if (unmatchedTools.length > 0) {
        console.warn(`[Background] 子任务 ${subtask.name} 指定的工具不存在: ${unmatchedTools.join(', ')}`);
      }
      
      console.log(`[Background] 子任务 ${subtask.name} 需要工具: ${requiredToolNames.join(', ')}, 匹配到 ${toolSets[subtask.id].length} 个`);
    } else {
      // 如果没有指定工具，使用空工具集（强制 LLM 明确指定工具）
      toolSets[subtask.id] = [];
      console.warn(`[Background] 子任务 ${subtask.name} 未指定所需工具，将使用空工具集`);
    }
  });
  
  return toolSets;
}

/**
 * 带超时控制的工具执行
 * 注意：clarify_question 工具已在外层暂停整体循环超时，此处不设置额外超时
 */
export async function executeToolWithTimeout(toolCall, tabId, timeoutMs, loopTimeoutMs, clarifyTimeoutMs) {
  const toolName = toolCall.function?.name || toolCall.name;
  
  // clarify_question 工具：
  // 1. 整体循环超时已在 reactLoop 中暂停
  // 2. 内部有独立的澄清超时控制
  // 3. 此处不设置外层超时，直接执行
  if (toolName === 'clarify_question') {
    console.log(`[Background] 澄清工具直接执行，无外层超时（整体循环超时已暂停）`);
    return executeTool(toolCall, tabId);
  }
  
  // 其他工具使用正常超时
  console.log(`[Background] 工具 ${toolName} 使用超时: ${timeoutMs}ms`);
  
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`工具执行超时 (${timeoutMs}ms): ${toolName}`));
    }, timeoutMs);
    
    try {
      const result = await executeTool(toolCall, tabId);
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * 调用 OpenAI 兼容 API（非流式，简单模式）
 */
export function callApiNonStream(messages, model, apiParams = {}, sessionId = null) {
  return getStoredConfig().then(config => {
    // 获取 AbortController 以支持用户取消
    const abortController = sessionId ? getOrCreateAbortController(sessionId) : null;
    const abortSignal = abortController?.signal;

    const apiUrl = `${config.apiBase}/chat/completions`;

    console.log('[Background] 发送非流式 API 请求到:', apiUrl);

    // 过滤消息中的 executionLog 字段，不传递给大模型
    const filteredMessages = messages.map(msg => {
      const { executionLog, ...rest } = msg;
      return rest;
    });

    const requestBody = {
      model: model || config.modelName,
      messages: filteredMessages,
      stream: false
    };

    // 添加 temperature 和 top_p 参数
    if (apiParams.temperature !== undefined) {
      requestBody.temperature = apiParams.temperature;
    }
    if (apiParams.top_p !== undefined) {
      requestBody.top_p = apiParams.top_p;
    }

    return fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal
    });
  })
  .then(async response => {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    const rawText = await response.text();
    try {
      return JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[Background] JSON 解析失败，原始响应:', rawText.substring(0, 500));
      throw new Error(`JSON 解析失败: ${parseErr.message}`);
    }
  })
  .then(data => {
    console.log('[Background] API 响应:', JSON.stringify(data).substring(0, 200));
    const content = data.choices?.[0]?.message?.content || '';
    return content;
  })
  .catch(error => {
    console.error('[Background] API 调用失败:', error);
    throw error;
  });
}
