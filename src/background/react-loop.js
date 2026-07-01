// background/react-loop.js - ReAct 推理循环与 API 调用
import { cancelReactLoop, resetReactCancel, isCancelled, getOrCreateAbortController, getCurrentReactTabId, setCurrentReactTabId, incrementDialogApiCallCount, getDialogApiCallCount } from './state.js';
import { getStoredConfig } from './config.js';
import { getTools, executeTool, fetchWithTimeout, fetchWithRetry } from './tool-executor.js';
import { PARALLELIZABLE_TOOLS, CONFIRMATION_REQUIRED_TOOLS } from './constants.js';
import { preselectTools } from './tool-preselector.js';
import { estimateTokens, estimateMessagesTokens, truncateByTokens, getMessageBudget, assessContextPressure } from '../shared/token-counter.js';
import { recordTokenUsage } from './token-recorder.js';
import { StreamController, readSSEStream } from './stream-controller.js';

// 活跃的 ReAct 循环 sessionId 集合，用于检测 SW 静默重启
// 当 onConnect 发现 keepalive 端口重连但 sessionId 不在其中时，说明 SW 已重启
export const activeReactLoops = new Set();

// 敏感工具中文显示名映射
const TOOL_DISPLAY_NAMES = {
  manage_cookies: '管理 Cookie',
  clear_page_data: '清除页面数据',
  download_file: '下载文件',
  close_tab: '关闭标签页',
};

/**
 * 请求用户确认敏感工具操作
 * 发送消息到 Side Panel 显示确认对话框，等待用户响应
 */
async function requestToolConfirmation(toolName, toolArgs, tabId, sessionId) {
  const toolLabel = TOOL_DISPLAY_NAMES[toolName] || toolName;
  const confirmTimeout = 30000; // 30秒确认超时
  
  console.log(`[Background] 请求用户确认工具操作: ${toolName}`, toolArgs);
  
  return new Promise((resolve) => {
    const handler = (message) => {
      if (message.type === 'TOOL_CONFIRMATION_RESPONSE' && message.toolCallId === toolName) {
        chrome.runtime.onMessage.removeListener(handler);
        clearTimeout(timeoutId);
        console.log(`[Background] 用户确认结果: ${toolName} = ${message.confirmed}`);
        resolve(message.confirmed);
      }
    };
    
    chrome.runtime.onMessage.addListener(handler);
    
    const timeoutId = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      console.log(`[Background] 确认超时，默认拒绝: ${toolName}`);
      resolve(false); // 超时默认拒绝
    }, confirmTimeout);
    
    // 发送显示确认对话框的消息
    chrome.runtime.sendMessage({
      type: 'SHOW_CONFIRM_DIALOG',
      data: {
        toolName,
        toolLabel,
        args: toolArgs,
        toolCallId: toolName,
        sessionId,
        timeout: confirmTimeout
      }
    }).catch(err => {
      console.log('[Background] 发送确认对话框消息失败:', err.message);
      // 发送失败，直接放行
      chrome.runtime.onMessage.removeListener(handler);
      clearTimeout(timeoutId);
      resolve(true);
    });
  });
}

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
  // 标记该 session 的 ReAct 循环正在运行，用于 SW 重启检测
  if (sessionId) activeReactLoops.add(sessionId);

  let iteration = 0;
  let currentMessages = [...messages];
  const toolResultCache = new Map(); // 单次 ReAct 循环内的工具结果缓存
  const MAX_CACHE_SIZE = 30; // 缓存上限，防止大结果无限增长
  
  // ReAct 循环 Token 预算：根据模型上下文窗口动态计算
  // 为工具定义、系统提示词、输出预留空间后，剩余约 80% 用于消息历史
  let reactTokenBudget = null;

  const getReactTokenBudget = (modelName) => {
    if (reactTokenBudget === null) {
      const contextWindow = getMessageBudget(modelName, tools.length);
      reactTokenBudget = Math.floor(contextWindow * 0.8);
      console.log(`[Background] ReAct Token 预算: ${reactTokenBudget} tokens (模型: ${modelName})`);
    }
    return reactTokenBudget;
  };

  /**
   * 工具结果截断：单条工具结果最大 token 数
   * 避免 get_full_html / fetch_url 等大结果撑爆上下文
   */
  const MAX_TOOL_RESULT_TOKENS = 6000;

  /**
   * 基于 Token 总量的消息裁剪，替代原来的条数限制
   * 保留 system message，从后往前保留消息，确保 tool_calls/tool 配对
   */
  const trimMessages = () => {
    const budget = getReactTokenBudget(model || 'default');
    const totalTokens = estimateMessagesTokens(currentMessages);
    if (totalTokens <= budget) return;

    const oldLen = currentMessages.length;
    const oldTokens = totalTokens;
    const systemMsg = currentMessages[0]?.role === 'system' ? [currentMessages[0]] : [];
    const rest = systemMsg.length ? currentMessages.slice(1) : [...currentMessages];

    // 从后往前逐条移除，直到 token 量在预算内
    while (rest.length > 0) {
      const currentTokens = estimateMessagesTokens([...systemMsg, ...rest]);
      if (currentTokens <= budget) break;

      // 移除最早的非 system 消息
      const removed = rest.shift();

      // 如果移除的是 assistant(tool_calls)，则后续的 tool 消息也要一并移除
      if (removed?.role === 'assistant' && removed.tool_calls) {
        while (rest.length > 0 && rest[0]?.role === 'tool') {
          rest.shift();
        }
      }
    }

    currentMessages = [...systemMsg, ...rest];
    const newTokens = estimateMessagesTokens(currentMessages);
    console.log(`[Background] ReAct Token 裁剪: ${oldTokens} → ${newTokens} tokens (${oldLen} → ${currentMessages.length} 条)`);
  };
  
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
  // 子任务场景（有 taskContext）不 abort 旧的 controller，避免并行子任务互相杀死
  const abortController = sessionId ? getOrCreateAbortController(sessionId, !taskContext) : null;
  const abortSignal = abortController?.signal;
  
  const config = await getStoredConfig();
  
  // 如果传入了图片识别独立配置，则覆盖默认配置
  if (apiParams && apiParams.imageApiBase) {
    config.apiBase = apiParams.imageApiBase;
  }
  if (apiParams && apiParams.imageApiKey) {
    config.apiKey = apiParams.imageApiKey;
  }
  
  const reactConfig = config.reactConfig;
  const maxIterations = reactConfig.maxIterations;
  const apiTimeout = reactConfig.apiTimeout;
  const loopTimeout = reactConfig.loopTimeout;
  const toolTimeout = reactConfig.toolTimeout;
  const clarifyTimeout = reactConfig.clarifyTimeout;
  const streamConfig = config.streamConfig;
  
  console.log('[Background] reactLoop 配置:', reactConfig);
  console.log('[Background] reactLoop 收到工具列表:', tools.map(t => t.function.name), '数量:', tools.length);
  console.log('[Background] reactLoop 任务上下文:', taskContext ? `子任务 ${taskContext.subtaskId || '无'} (${taskContext.subtaskName || '主任务'})` : '无');
  
  /**
   * 发送实时执行状态更新消息（200ms 节流，子任务大量执行时防止消息拥塞）
   */
  let lastStatusSendTime = 0;
  let lastSentNodeName = '';
  function sendExecutionStatusUpdate(nodeName, status) {
    try {
      const now = Date.now();
      const logSnapshot = [...executionLog];
      
      // 回调通知父任务不受节流限制
      if (typeof onLogUpdate === 'function') {
        onLogUpdate(logSnapshot);
      }
      
      // 节流：200ms 内同一节点名不重复发送，但节点名变化时立即发送
      if (nodeName === lastSentNodeName && now - lastStatusSendTime < 200) return;
      lastStatusSendTime = now;
      lastSentNodeName = nodeName;
      
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
        // 移除不需要传递给 API 的字段（内部字段 + API 响应专用字段）
        const { executionLog, subtaskId, subtaskName, subtaskIndex, refusal, ...rest } = msg;
        
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
        
        // 对于 assistant 消息，裁剪 tool_calls 中可能混入的非标准字段（如 index 等）
        if (rest.role === 'assistant' && Array.isArray(rest.tool_calls)) {
          rest.tool_calls = rest.tool_calls.map(tc => ({
            id: tc.id,
            type: tc.type,
            function: tc.function
          }));
        }
        
        return rest;
      }).filter(msg => msg !== null);

      // 防御：扫描所有 assistant(tool_calls) 消息，确保其后有对应的 tool 消息
      // 如果 assistant(tool_calls) 后没有 tool 消息配对，清除 tool_calls（content 为空则移除整条）
      for (let i = 0; i < filteredMessages.length; i++) {
        const msg = filteredMessages[i];
        if (msg?.role === 'assistant' && msg.tool_calls) {
          // 检查该消息之后（直到下一条非 tool 消息或末尾）是否有 tool 消息
          let hasToolMsg = false;
          for (let j = i + 1; j < filteredMessages.length; j++) {
            const next = filteredMessages[j];
            if (next.role === 'tool') {
              hasToolMsg = true;
            } else {
              break; // 遇到非 tool 消息，停止检查
            }
          }
          if (!hasToolMsg) {
            console.warn('[Background] reactLoop: 第', i, '条 assistant 消息包含 tool_calls 但无对应 tool 消息，已清除');
            delete msg.tool_calls;
            if (!msg.content) {
              filteredMessages.splice(i, 1);
              i--; // 调整索引
            }
          }
        }
      }
      
      // 添加 API 调用开始的日志节点（状态为 processing）
      const apiLogId = crypto.randomUUID();
      const currentCount = getDialogApiCallCount(sessionId);
      
      // 如果工具集中包含 plan_task，展开为全量工具，确保任务拆解时模型能感知所有可用工具
      const hasPlanTask = tools.some(t => t.function?.name === 'plan_task');
      const apiTools = hasPlanTask ? await getFullTools() : tools;
      if (hasPlanTask) {
        console.log('[Background] 当前迭代包含 plan_task，使用全量工具进行任务拆解，工具数:', apiTools.length);
      }

      // 上下文压力评估：在每次 API 调用前检查 token 使用量
      const filteredTokens = estimateMessagesTokens(filteredMessages);
      const toolTokens = (typeof estimateToolsTokens === 'function' ? estimateToolsTokens : (n) => n * 200)(apiTools.length);
      const getCtxWin = typeof getContextWindow === 'function' ? getContextWindow : () => 64000;
      const pressure = assessContextPressure(filteredTokens + toolTokens, getCtxWin(model || config.modelName));
      if (pressure.level !== 'safe') {
        console.warn(`[Background] 上下文压力: ${pressure.level} (${Math.round(pressure.ratio * 100)}% 已用, ${filteredTokens} tokens ${filteredMessages.length} 条消息)`);
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
      
      // 外层超时 watchdog，需在 try/catch 外层声明以便 catch 块中清理
      let outerWatchdog;

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
          stream: streamConfig.streamEnabled !== false
        };
        
        console.log('[Background] API 请求体 stream 模式:', requestBody.stream, '工具数量:', requestBody.tools.length, '消息数量:', requestBody.messages.length, 'model:', requestBody.model);
        
        // 添加 temperature 和 top_p 参数
        if (apiParams.temperature !== undefined) {
          requestBody.temperature = apiParams.temperature;
        }
        if (apiParams.top_p !== undefined) {
          requestBody.top_p = apiParams.top_p;
        }
        
        // 使用带重试和超时的 fetch
        // 外层超时保护：独立 setTimeout watchdog，防止 fetchWithRetry 因 AbortSignal bug 永久挂起
        const outerTimeoutMs = Math.max(remainingTime - 30000, apiTimeout);
        outerWatchdog = setTimeout(() => {
          console.warn(`[Background] ⚠️ API 调用外层超时保护触发 (${Math.round(outerTimeoutMs / 1000)}s)，强制 abort`);
          abortController?.abort();
        }, outerTimeoutMs);

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
        clearTimeout(outerWatchdog);

        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text();
          console.error('[Background] API 响应错误:', fetchResponse.status, errorText);
          throw new Error(`HTTP error! status: ${fetchResponse.status}, message: ${errorText.substring(0, 500)}`);
        }

        // 流式模式：读取 SSE 流
        if (streamConfig.streamEnabled !== false && fetchResponse.body) {
          console.log('[Background] 进入流式模式，streamEnabled:', streamConfig.streamEnabled);
          const streamController = new StreamController(sessionId, streamConfig);
          const streamResult = await readSSEStream(fetchResponse.body.getReader(), streamController, abortSignal);
          console.log('[Background] 流式 API 响应完成，内容长度:', streamResult.content.length, 'tool_calls:', streamResult.toolCalls?.length, 'usage:', streamResult.usage);
          if (streamResult.toolCalls?.length > 0) {
            console.log('[Background] streamResult.toolCalls 详情:', JSON.stringify(streamResult.toolCalls.map(t => ({ id: t.id, name: t.function?.name, argsLen: t.function?.arguments?.length, argsPreview: t.function?.arguments?.substring(0, 200) }))));
          } else {
            console.log('[Background] WARNING: streamResult.toolCalls 为空或不存在 (status=' + streamResult.status + ')');
          }
          
          // 构建兼容现有代码的 response 对象
          // 流式模式下 tool_calls 的 id 可能为空，需要规范化，确保与 tool 消息的 tool_call_id 匹配
          const normalizedToolCalls = streamResult.toolCalls ? streamResult.toolCalls.map(tc => ({
            ...tc,
            id: tc.id || `tc_fb_${crypto.randomUUID().slice(0, 8)}`
          })) : null;

          response = {
            choices: [{
              message: {
                role: 'assistant',
                content: streamResult.content || null,
                reasoning_content: streamResult.reasoningContent,
                tool_calls: normalizedToolCalls
              },
              finish_reason: streamResult.status === 'tool_calls' ? 'tool_calls' : 'stop'
            }],
            usage: streamResult.usage
          };
        } else {
          // 非流式模式：保持原有逻辑
          const responseText = await fetchResponse.text();
          console.log('[Background] API 响应状态:', fetchResponse.status, '原始文本长度:', responseText.length, '预览:', responseText.substring(0, 200));

          try {
            response = JSON.parse(responseText);
          } catch (parseError) {
            console.error('[Background] JSON 解析失败:', parseError);
            console.error('[Background] 原始响应:', responseText);
            throw new Error(`API 响应不是有效的 JSON (HTTP ${fetchResponse.status}): ${parseError.message}。响应前100字符: ${responseText.substring(0, 100)}`);
          }
        }
      } catch (error) {
        clearTimeout(outerWatchdog);
        // 区分用户取消（AbortError）和真正的 API 错误
        const isAborted = error.name === 'AbortError';
        if (isAborted) {
          console.log('[Background] API 调用已被用户取消');
        } else {
          console.error('[Background] API 调用失败:', error.message || error);
        }
        
        // 更新 API 调用日志状态为失败
        const apiLogIndex = executionLog.findIndex(log => log.id === apiLogId);
        if (apiLogIndex !== -1) {
          executionLog[apiLogIndex] = {
            ...executionLog[apiLogIndex],
            duration: Date.now() - apiCallStartTime,
            status: isAborted ? 'cancelled' : 'failed',
            apiRequest: {
              ...executionLog[apiLogIndex].apiRequest,
              model: model || config.modelName,
              temperature: apiParams.temperature,
              top_p: apiParams.top_p,
              messageCount: filteredMessages.length,
              toolCount: apiTools.length
            },
            error: isAborted ? '用户取消' : error.message
          };
        }
        
        throw createErrorWithLog(isAborted ? '请求已被用户取消' : error.message, executionLog);
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

      // 记录 token 使用统计
      if (response.usage) {
        recordTokenUsage({
          sessionId,
          model: model || config.modelName,
          usage: response.usage,
          callType: 'react_loop'
        }).catch(() => {});
      }

      // 推送 API 调用成功状态更新
      sendExecutionStatusUpdate(`API调用 (第${currentCount}次${taskContext ? `, 子任务第${iteration}次` : ''})`, 'success');
      
      // 检查是否有工具调用
      if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log('[Background] 收到工具调用:', assistantMessage.tool_calls);
        
        currentMessages.push(assistantMessage);
        trimMessages();
        
        const pendingReflections = [];
        const reflectionConfig = reactConfig.reflection;
        
        /**
         * 执行单个工具调用，返回执行结果
         * 处理：取消检查、工具执行（含超时）、clarify_question 暂停/恢复、
         * 结果格式化、缓存、执行日志更新、plan_task 子任务延续
         */
        async function executeSingleToolCall(toolCall, tabId, toolTimeout, loopTimeout, clarifyTimeout, sessionId, iteration, executionLog, currentMessages) {
          // 在每个工具执行前检查是否已取消
          if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
            throw createErrorWithLog('ReAct 循环已被用户取消', executionLog);
          }
          
          const toolName = toolCall.function?.name || toolCall.name;
          const toolStartTime = Date.now();
          // 防御：arguments 可能是 string 或已解析的 object
          const rawArgs = toolCall.function?.arguments;
          console.log('[Background] executeSingleToolCall 收到工具调用:', JSON.stringify({ name: toolName, argsType: typeof rawArgs, argsRaw: typeof rawArgs === 'string' ? rawArgs.substring(0, 200) : JSON.stringify(rawArgs).substring(0, 200), id: toolCall.id }));
          const toolArgs = (() => {
            if (!rawArgs) return {};
            if (typeof rawArgs === 'object') return rawArgs;
            try { return JSON.parse(rawArgs || '{}'); } catch { return {}; }
          })();
          // 防御：流式模式下 tool_call.id 可能为空，用 index 生成回退 id
          const toolCallId = toolCall.id || `tc_fallback_${crypto.randomUUID()}`;
          
          // 检查是否需要用户确认（敏感工具 + 开关开启）
          const needsConfirmation = CONFIRMATION_REQUIRED_TOOLS.has(toolName) && reactConfig.toolConfirmationEnabled;
          if (needsConfirmation) {
            const confirmed = await requestToolConfirmation(toolName, toolArgs, tabId, sessionId);
            if (!confirmed) {
              // 用户拒绝，返回错误结果
              const toolLogId = crypto.randomUUID();
              executionLog.push({
                id: toolLogId,
                iteration,
                timestamp: new Date().toISOString(),
                status: 'cancelled',
                nodeType: 'tool_exec',
                nodeName: `工具执行:${toolName}`,
                action: { name: toolName, params: toolArgs },
                error: '用户拒绝了此操作'
              });
              sendExecutionStatusUpdate(`工具执行:${toolName}`, 'cancelled');
              // 推送工具拒绝响应到消息历史，确保 assistant(tool_calls) 后面有对应的 tool 消息
              currentMessages.push({
                role: 'tool',
                content: '用户拒绝了此操作',
                tool_call_id: toolCallId
              });
              trimMessages();
              return {
                toolCall,
                result: { success: false, content: '用户拒绝了此操作', error: 'user_denied' },
                toolResultStr: '用户拒绝了此操作',
                toolLogEntry: {
                  id: toolLogId,
                  iteration,
                  timestamp: new Date().toISOString(),
                  status: 'cancelled',
                  nodeType: 'tool_exec',
                  nodeName: `工具执行:${toolName}`,
                  action: { name: toolName, params: toolArgs },
                  error: '用户拒绝了此操作'
                }
              };
            }
          }
          
          // 缓存检查
          const cacheKey = `${toolName}:${JSON.stringify(toolArgs)}`;
          if (toolResultCache.has(cacheKey)) {
            if (PARALLELIZABLE_TOOLS.has(toolName)) {
              const cached = toolResultCache.get(cacheKey);
              return { ...cached, fromCache: true };
            }
            // 非并行工具：清空缓存
            toolResultCache.clear();
          }

          // 清除非并行工具缓存
          if (!PARALLELIZABLE_TOOLS.has(toolName)) {
            toolResultCache.clear();
          }
          
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
            toolResult = await executeToolWithTimeout(toolCall, tabId, toolTimeout, loopTimeout, clarifyTimeout, sessionId);
            
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
                const config = await getStoredConfig();
                const enableToolPreselect = config.reactConfig.enableToolPreselect;
                const preselectMinToolCount = config.reactConfig.preselectMinToolCount || 3;
                if (enableToolPreselect && fullTools.length > preselectMinToolCount) {
                  const reSelection = await preselectTools(currentMessages, model, fullTools, apiParams);
                  if (reSelection.type === 'tools') {
                    tools = reSelection.tools;
                    console.log('[Background] 澄清后工具重新筛选完成:', tools.map(t => t.function.name));
                  }
                  // 合并重新筛选的执行日志
                  if (reSelection.executionLog) {
                    executionLog.push(...reSelection.executionLog);
                  }
                } else if (!enableToolPreselect) {
                  console.log('[Background] 工具预筛选已关闭，澄清后不重新筛选');
                }
              } catch (rePreselectErr) {
                console.warn('[Background] 澄清后工具重新筛选失败，继续使用当前工具集:', rePreselectErr.message);
              }
            }
            
            // 格式化工具结果（normalizeToolResult 已保证 content 字段为字符串）
            let toolResultStr;
            if (typeof toolResult === 'string') {
              toolResultStr = toolResult;
            } else if (toolResult && typeof toolResult === 'object' && 'content' in toolResult) {
              toolResultStr = toolResult.content ?? JSON.stringify(toolResult);
            } else {
              toolResultStr = JSON.stringify(toolResult);
            }
            
            // 检查工具执行是否成功
            const isToolSuccess = toolResult && toolResult.success !== false;

            // 发送工具结果到 Side Panel 展示
            chrome.runtime.sendMessage({
              type: 'STREAM_TOOL_RESULT',
              sessionId,
              result: {
                toolCallId: toolCallId,
                toolName,
                success: isToolSuccess,
                content: isToolSuccess ? toolResultStr : (toolResult?.error || toolResultStr),
                truncated: false,
                duration: Date.now() - toolStartTime
              }
            }).catch(() => {});

            // 工具结果截断：防止大结果撑爆上下文
            const resultTokens = estimateTokens(toolResultStr);
            if (resultTokens > MAX_TOOL_RESULT_TOKENS) {
              const truncated = truncateByTokens(toolResultStr, MAX_TOOL_RESULT_TOKENS);
              console.log(`[Background] 工具 ${toolName} 结果截断: ${resultTokens} → ${estimateTokens(truncated)} tokens`);
              toolResultStr = truncated;
            }

            // 计算真正"连续"的失败数（从最近一次成功往后数）
            const allToolEntries = executionLog
              .filter(e => e.nodeType === 'tool_exec' && e.iteration === iteration)
              .sort((a, b) => executionLog.indexOf(a) - executionLog.indexOf(b));
            let consecutiveFailCount = 0;
            for (let i = allToolEntries.length - 1; i >= 0; i--) {
              if (allToolEntries[i].status === 'failed') {
                consecutiveFailCount++;
              } else {
                break;
              }
            }
            
            const toolReflectionCount = executionLog.filter(
              e => e.nodeType === 'reflection' && e.reflectionType === 'tool'
            ).length;
            const maxPerIteration = reflectionConfig?.toolReflection?.maxPerIteration || 2;
            const withinFrequencyLimit = toolReflectionCount < maxPerIteration;

            // 收集待处理的反思，而非立即执行（优先级队列）
            if (withinFrequencyLimit && shouldTriggerToolReflection(toolResultStr, consecutiveFailCount, reflectionConfig)) {
              pendingReflections.push({
                toolName,
                toolResultStr,
                toolCallParams: toolArgs,
                toolCallId: toolCallId,
                priority: getToolReflectionPriority(toolName, toolResultStr, consecutiveFailCount)
              });
            }
            
            // 处理任务规划工具的结果，提取子任务列表
            if (toolName === 'plan_task' && toolResult && toolResult.success && toolResult.data) {
              subtaskPlan = toolResult.data;
              console.log('[Background] 收到任务规划结果:', JSON.stringify(subtaskPlan));
              
              // 先添加 plan_task 工具的响应消息（必须先响应工具调用）
              const planTaskContent = JSON.stringify({
                success: true,
                message: `任务规划完成，已拆解为 ${subtaskPlan.subtasks.length} 个子任务`,
                data: subtaskPlan
              });
              currentMessages.push({
                role: 'tool',
                content: planTaskContent,
                tool_call_id: toolCallId
              });
              trimMessages();
              
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
                    params: toolArgs
                  },
                  observation: `已拆解为 ${subtaskPlan.subtasks.length} 个子任务`,
                  subtaskCount: subtaskPlan.subtasks.length,
                  strategy: subtaskPlan.strategy
                };
              }
              
              // 发送任务规划完成状态更新（让实时日志显示plan_task节点）
              sendExecutionStatusUpdate('任务规划完成', 'success');
              
              // 开始执行子任务
              const subtaskResults = await executeSubtasks(
                subtaskPlan, model, tabId, apiParams, sessionId, executionLog, globalIteration,
                reactConfig.reflection, config
              );
              
              // 子任务执行完毕后检查是否已被取消
              if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
                throw createErrorWithLog('ReAct 循环已被用户取消', executionLog);
              }
              
              // 将所有子任务结果添加到消息历史（作为系统消息，而非工具消息）
              // 每个子任务结果截断至合理大小，避免汇总消息过大
              const SUBTASK_RESULT_MAX_TOKENS = 3000;
              const subtaskSummary = subtaskResults.map((result, idx) => {
                const resultStr = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
                const truncated = estimateTokens(resultStr) > SUBTASK_RESULT_MAX_TOKENS
                  ? truncateByTokens(resultStr, SUBTASK_RESULT_MAX_TOKENS)
                  : resultStr;
                return `子任务 ${idx + 1}: ${result.subtaskName}\n结果: ${truncated}`;
              }).join('\n\n');
              
              currentMessages.push({
                role: 'system',
                content: `以下是拆解后子任务的执行结果，请进行总结：\n\n${subtaskSummary}`
              });
              trimMessages();
              
              // 缓存结果（plan_task 也是可缓存的只读操作）
              if (PARALLELIZABLE_TOOLS.has(toolName)) {
                if (toolResultCache.size >= MAX_CACHE_SIZE) {
                  // 删除最早插入的条目（Map 保持插入顺序）
                  const firstKey = toolResultCache.keys().next().value;
                  toolResultCache.delete(firstKey);
                }
                toolResultCache.set(cacheKey, { planTaskHandled: true, toolName, toolCallId: toolCallId });
              }
              
              return { planTaskHandled: true };
            }
            
            // 添加工具结果到消息历史（不附加反思备注，反思在优先级队列处理后统一附加）
            currentMessages.push({
              role: 'tool',
              content: toolResultStr,
              tool_call_id: toolCallId,
              subtaskId: currentSubtaskIndex !== null ? `subtask_${currentSubtaskIndex}` : null,
              subtaskName: subtaskPlan?.subtasks[currentSubtaskIndex]?.name || null
            });
            trimMessages();
            
            console.log('[Background] 工具执行结果长度:', toolResultStr.length, '内容预览:', toolResultStr.substring(0, 200));
            
            // 更新工具执行日志
            const toolLogIndex = executionLog.findIndex(log => log.id === toolLogId);
            if (toolLogIndex !== -1) {
              const logEntry = {
                ...executionLog[toolLogIndex],
                duration: Date.now() - toolStartTime,
                status: isToolSuccess ? 'success' : 'failed',
                nodeName: `工具执行:${toolName}`,
                action: {
                  name: toolName,
                  params: toolArgs
                },
                observation: toolResultStr.length > 500 ? toolResultStr.substring(0, 500) + '...' : toolResultStr,
                prototypeId: toolResult?.prototypeId || null
              };
              // 失败时传递 error 字段，确保执行日志面板能展示具体错误原因
              if (!isToolSuccess && toolResult?.error) {
                logEntry.error = toolResult.error;
              }
              executionLog[toolLogIndex] = logEntry;
            }
            
            // 缓存结果（仅并行工具）
            if (PARALLELIZABLE_TOOLS.has(toolName)) {
              if (toolResultCache.size >= MAX_CACHE_SIZE) {
                const firstKey = toolResultCache.keys().next().value;
                toolResultCache.delete(firstKey);
              }
              toolResultCache.set(cacheKey, { planTaskHandled: false, toolResultStr, toolName, toolCallId: toolCallId, toolResult });
            }
            
            return { planTaskHandled: false, toolResultStr, toolName, toolCallId: toolCallId, toolResult };
            
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
            
            // 推送工具错误响应到消息历史，确保 assistant(tool_calls) 后面有对应的 tool 消息，
            // 避免后续 API 调用出现 400 "insufficient tool messages following tool_calls"
            const toolErrorContent = JSON.stringify({
              success: false,
              error: toolError.message || '工具执行异常'
            });
            currentMessages.push({
              role: 'tool',
              content: toolErrorContent,
              tool_call_id: toolCallId,
              subtaskId: currentSubtaskIndex !== null ? `subtask_${currentSubtaskIndex}` : null,
              subtaskName: subtaskPlan?.subtasks[currentSubtaskIndex]?.name || null
            });
            trimMessages();
            
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
                  params: toolArgs
                },
                error: toolError.message
              };
            }
            
            throw createErrorWithLog(toolError.message, executionLog);
          }
        }
        
        /**
         * 处理待处理的反思队列（按优先级排序后处理前 N 个）
         */
        async function processPendingReflections() {
          if (pendingReflections.length === 0) return;
          
          // 按优先级降序排序
          pendingReflections.sort((a, b) => b.priority - a.priority);
          const maxPerIteration = reflectionConfig?.toolReflection?.maxPerIteration || 2;
          
          for (const ref of pendingReflections.slice(0, maxPerIteration)) {
            const toolReflection = await reflectOnToolResult(
              ref.toolName, ref.toolResultStr, ref.toolCallParams,
              config, model, reflectionConfig, executionLog, iteration
            );
            
            if (toolReflection) {
              const toolReflectionId = crypto.randomUUID();
              const toolReflectionEntry = {
                id: toolReflectionId,
                iteration,
                timestamp: new Date().toISOString(),
                status: toolReflection.useful ? 'success' : 'failed',
                nodeType: 'reflection',
                nodeName: `工具反思: ${ref.toolName}`,
                reflectionType: 'tool',
                useful: toolReflection.useful,
                reasoning: toolReflection.reasoning,
                suggestion: toolReflection.suggestion
              };
              executionLog.push(toolReflectionEntry);
              console.log(`[Background] 工具反思: ${ref.toolName} - ${toolReflection.useful ? '有用' : '无效'} - ${toolReflection.reasoning}`);
              
              // 将反思建议附加到工具结果消息中
              if (!toolReflection.useful && toolReflection.suggestion) {
                const note = `\n\n【反思提醒】工具"${ref.toolName}"的返回结果被评估为无帮助（${toolReflection.reasoning}）。建议：${toolReflection.suggestion}。请在后续步骤中考虑调整策略。`;
                // 查找并更新对应的工具消息
                for (let j = currentMessages.length - 1; j >= 0; j--) {
                  if (currentMessages[j].role === 'tool' && currentMessages[j].tool_call_id === ref.toolCallId) {
                    currentMessages[j] = {
                      ...currentMessages[j],
                      content: currentMessages[j].content + note
                    };
                    break;
                  }
                }
              }
            }
          }
        }
        
        // 检查是否所有工具都可并行执行
        const allParallelizable = assistantMessage.tool_calls.every(
          tc => PARALLELIZABLE_TOOLS.has(tc.function?.name || tc.name)
        );
        
        if (allParallelizable && assistantMessage.tool_calls.length > 1) {
          // 并行执行路径
          console.log('[Background] 并行执行工具调用:', assistantMessage.tool_calls.map(tc => tc.function?.name || tc.name));
          
          // 记录并行执行前的消息数量，用于后续按 tool_calls 顺序重排 tool 消息
          const msgCountBefore = currentMessages.length;
          
          const parallelPromises = assistantMessage.tool_calls.map(toolCall =>
            executeSingleToolCall(toolCall, tabId, toolTimeout, loopTimeout, clarifyTimeout, sessionId, iteration, executionLog, currentMessages)
              .catch(err => ({ error: err.message }))
          );
          const parallelResults = await Promise.all(parallelPromises);
          
          // 按 tool_calls 原始顺序重排 currentMessages 中新追加的 tool 消息，
          // 确保 tool 消息顺序与 assistant(tool_calls) 中的 tool_calls 顺序一致
          const newMessages = currentMessages.splice(msgCountBefore);
          const toolCallOrder = new Map(
            assistantMessage.tool_calls.map((tc, i) => [tc.id, i])
          );
          const toolMessages = newMessages.filter(m => m.role === 'tool');
          const nonToolMessages = newMessages.filter(m => m.role !== 'tool');
          // 按 tool_calls 声明顺序排序 tool 消息
          toolMessages.sort((a, b) => {
            const orderA = toolCallOrder.get(a.tool_call_id) ?? 999;
            const orderB = toolCallOrder.get(b.tool_call_id) ?? 999;
            return orderA - orderB;
          });
          // 非 tool 消息（如 plan_task 的 system 消息）保持在 tool 消息之前
          currentMessages.push(...nonToolMessages, ...toolMessages);
          
          // 按原始顺序处理结果，检查错误和 plan_task
          let planTaskHandled = false;
          for (let i = 0; i < assistantMessage.tool_calls.length; i++) {
            const result = parallelResults[i];
            if (result.error) {
              throw createErrorWithLog(result.error);
            }
            if (result.planTaskHandled) {
              planTaskHandled = true;
            }
          }
          
          // 处理反思优先级队列
          await processPendingReflections();
          
          if (planTaskHandled) {
            continue;
          }
        } else {
          // 顺序执行路径
          for (const toolCall of assistantMessage.tool_calls) {
            const result = await executeSingleToolCall(toolCall, tabId, toolTimeout, loopTimeout, clarifyTimeout, sessionId, iteration, executionLog, currentMessages);
            
            if (result.planTaskHandled) {
              // plan_task 处理了子任务，处理反思队列后继续外层循环
              await processPendingReflections();
              continue;
            }
          }
          
          // 所有工具执行完毕后，处理反思优先级队列
          await processPendingReflections();
        }
        
        continue;
      }
      
      const content = assistantMessage?.content || '';
      console.log('[Background] ReAct 循环完成，最终内容长度:', content.length);
      
      // 后置反思：对最终答案进行质量评估
      const reflectionConfig = reactConfig.reflection;
      if (reflectionConfig?.enabled && reflectionConfig?.postReflection?.enabled && shouldReflect(executionLog, taskContext)) {
        console.log('[Background] 触发后置反思...');
        const reflectionResult = await reflectOnResult(
          currentMessages, content, executionLog, model, config,
          reflectionConfig, tabId, sendExecutionStatusUpdate, globalIteration, taskContext, sessionId
        );
        
        // 合并反思日志
        if (reflectionResult.reflectionLog && reflectionResult.reflectionLog.length > 0) {
          executionLog.push(...reflectionResult.reflectionLog);
        }

        sendExecutionStatusUpdate('执行完成', 'success');
        return {
          content: reflectionResult.content,
          executionLog,
          reflectionScore: reflectionResult.overallScore,
          wasRevised: reflectionResult.wasRevised
        };
      }
      
      // 发送完成状态
      sendExecutionStatusUpdate('执行完成', 'success');
      
      // 返回执行日志和内容
      return { content, executionLog };
    }
    
    const error = new Error(`ReAct 循环超过最大迭代次数 (${maxIterations})`);
    error.executionLog = executionLog;
    throw error;
  } catch (error) {
    throw error;
  } finally {
    // 标记该 session 的 ReAct 循环已结束，用于 SW 重启检测
    if (sessionId) activeReactLoops.delete(sessionId);
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
export async function executeSubtasks(subtaskPlan, model, tabId, apiParams, sessionId, parentExecutionLog, globalIteration = { value: 0 }, reflectionConfig = null, config = null) {
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
      // 每次重试前检查是否已取消
      if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
        console.log('[Background] 子任务重试已被用户取消');
        throw createErrorWithLog('ReAct 循环已被用户取消', parentExecutionLog);
      }
      
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
        
        // 子任务反思：对子任务结果进行质量评估
        let finalResult = subtaskResult.content;
        let subtaskReflectionScore = null;
        
        if (reflectionConfig?.enabled && reflectionConfig?.subtaskReflection?.enabled) {
          const subtaskReflectConfig = reflectionConfig.subtaskReflection;
          
          // 检查是否应该触发子任务反思
          const isComplexSubtask = subtask.complexity === 'complex' || 
                                   subtaskResult.content.length > 500 || 
                                   (subtaskResult.executionLog && subtaskResult.executionLog.length > 3);
          
          const shouldReflectSubtask = !subtaskReflectConfig.onlyForComplexSubtasks || isComplexSubtask;
          
          if (shouldReflectSubtask && subtaskReflectConfig.maxRounds > 0) {
            console.log(`[Background] 子任务 ${subtask.name} 触发反思，复杂度: ${isComplexSubtask ? '复杂' : '普通'}`);
            
            const reflectionResult = await reflectOnSubtask(
              subtaskMessages, 
              subtaskResult.content, 
              subtaskResult.executionLog || [],
              model,
              config,
              subtaskReflectConfig,
              tabId,
              subtask.name,
              parentExecutionLog,
              sessionId
            );
            
            // 如果反思有修订，使用修订后的结果
            if (reflectionResult.refinedContent) {
              finalResult = reflectionResult.refinedContent;
              console.log(`[Background] 子任务 ${subtask.name} 反思后已修订`);
            }
            
            subtaskReflectionScore = reflectionResult.score;
            
            // 将反思日志添加到父日志
            if (reflectionResult.reflectionLog) {
              reflectionResult.reflectionLog.forEach(log => {
                parentExecutionLog.push({
                  ...log,
                  subtaskId: subtask.id,
                  subtaskName: subtask.name,
                  subtaskIndex: subtaskIndex,
                  taskGroup: taskGroup,
                  taskGroupIndex: subtaskIndex + 1,
                  taskGroupName: subtask.name,
                  isSubtask: true
                });
              });
            }
          }
        }
        
        return {
          success: true,
          subtaskId: subtask.id,
          subtaskName: subtask.name,
          result: finalResult,
          executionLog: subtaskResult.executionLog || [],
          retryCount: retry,
          reflectionScore: subtaskReflectionScore
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
      // 在每个子任务执行前检查是否已取消
      if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
        console.log('[Background] 子任务执行已被用户取消');
        return results;
      }
      
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
      
      // 每个子任务完成后检查是否已取消
      if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
        console.log('[Background] 子任务执行已被用户取消');
        return results;
      }
    }
  } else if (strategy === 'parallel') {
    // 并行执行
    console.log('[Background] 并行执行子任务，最大并发数:', maxParallel);
    
    const executing = [];
    const resultsMap = new Map();
    
    for (let i = 0; i < sortedSubtasks.length; i++) {
      // 在每个子任务执行前检查是否已取消
      if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
        console.log('[Background] 子任务并行执行已被用户取消');
        return results;
      }
      
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
export async function executeToolWithTimeout(toolCall, tabId, timeoutMs, loopTimeoutMs, clarifyTimeoutMs, sessionId = null) {
  const toolName = toolCall.function?.name || toolCall.name;
  
  // clarify_question 工具：
  // 1. 整体循环超时已在 reactLoop 中暂停
  // 2. 内部有独立的澄清超时控制
  // 3. 此处不设置外层超时，直接执行
  if (toolName === 'clarify_question') {
    console.log(`[Background] 澄清工具直接执行，无外层超时（整体循环超时已暂停）`);
    return executeTool(toolCall, tabId, sessionId);
  }
  
  // 其他工具使用正常超时
  console.log(`[Background] 工具 ${toolName} 使用超时: ${timeoutMs}ms`);
  
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`工具执行超时 (${timeoutMs}ms): ${toolName}`));
    }, timeoutMs);

    executeTool(toolCall, tabId, sessionId)
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * 调用 OpenAI 兼容 API（支持流式/非流式）
 */
export function callApiNonStream(messages, model, apiParams = {}, sessionId = null) {
  return getStoredConfig().then(config => {
    // 如果传入了图片识别独立配置，则覆盖默认配置
    if (apiParams.imageApiBase) {
      config.apiBase = apiParams.imageApiBase;
    }
    if (apiParams.imageApiKey) {
      config.apiKey = apiParams.imageApiKey;
    }
    
    // 获取 AbortController 以支持用户取消
    const abortController = sessionId ? getOrCreateAbortController(sessionId) : null;
    const abortSignal = abortController?.signal;

    const apiUrl = `${config.apiBase}/chat/completions`;

    // 过滤消息中的内部字段和 API 响应专用字段，不传递给大模型
    const filteredMessages = messages.map(msg => {
      const { executionLog, refusal, ...rest } = msg;
      return rest;
    });

    // 防御：扫描所有 assistant(tool_calls) 消息，确保其后有对应的 tool 消息
    // 如果 assistant(tool_calls) 后没有 tool 消息配对，清除 tool_calls（content 为空则移除整条）
    for (let i = 0; i < filteredMessages.length; i++) {
      const msg = filteredMessages[i];
      if (msg?.role === 'assistant' && msg.tool_calls) {
        let hasToolMsg = false;
        for (let j = i + 1; j < filteredMessages.length; j++) {
          const next = filteredMessages[j];
          if (next.role === 'tool') {
            hasToolMsg = true;
          } else {
            break;
          }
        }
        if (!hasToolMsg) {
          console.warn('[Background] callApiNonStream: 第', i, '条 assistant 消息包含 tool_calls 但无对应 tool 消息，已清除');
          delete msg.tool_calls;
          if (!msg.content) {
            filteredMessages.splice(i, 1);
            i--;
          }
        }
      }
    }

    const useStream = config.streamConfig?.streamEnabled !== false;

    console.log('[Background] 发送 API 请求到:', apiUrl, '流式:', useStream);

    const requestBody = {
      model: model || config.modelName,
      messages: filteredMessages,
      stream: useStream
    };

    // 添加 temperature 和 top_p 参数
    if (apiParams.temperature !== undefined) {
      requestBody.temperature = apiParams.temperature;
    }
    if (apiParams.top_p !== undefined) {
      requestBody.top_p = apiParams.top_p;
    }

    return fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal
    }, config.reactConfig.apiTimeout, config.reactConfig.apiRetryCount, config.reactConfig.apiRetryBaseDelay)
    .then(async response => {
      if (!response.ok) {
        const responseText = await response.text();
        console.error('[Background] API 响应错误:', response.status, responseText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${responseText.substring(0, 500)}`);
      }

      // 流式模式：读取 SSE 流
      if (useStream && response.body) {
        const streamController = new StreamController(sessionId, config.streamConfig);
        const result = await readSSEStream(response.body.getReader(), streamController, abortSignal);
        console.log('[Background] 流式 API 响应完成，内容长度:', result.content.length, 'usage:', result.usage);
        return { content: result.content, usage: result.usage };
      }

      // 非流式模式：保持原有逻辑
      const responseText = await response.text();
      console.log('[Background] 非流式 API 响应状态:', response.status, '文本长度:', responseText.length, '预览:', responseText.substring(0, 200));

      try {
        const data = JSON.parse(responseText);
        console.log('[Background] API 响应:', JSON.stringify(data).substring(0, 200));
        const content = data.choices?.[0]?.message?.content || '';
        return { content, usage: data.usage || null };
      } catch (parseErr) {
        console.error('[Background] JSON 解析失败，原始响应:', responseText.substring(0, 500));
        throw new Error(`JSON 解析失败 (HTTP ${response.status}): ${parseErr.message}。响应前100字符: ${responseText.substring(0, 100)}`);
      }
    })
    .catch(error => {
      if (error.name === 'AbortError') {
        console.log('[Background] API 调用已被用户取消');
      } else {
        console.error('[Background] API 调用失败:', error.message || error);
      }
      throw error;
    });
  });
}

// ============================================================
// 反思机制（Reflection）
// ============================================================

/**
 * 判断是否需要执行反思
 * 简单任务（0-1 次工具调用，无失败，无子任务）跳过反思
 */
function shouldReflect(executionLog, taskContext) {
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
function getToolReflectionPriority(toolName, toolResultStr, consecutiveFailCount) {
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
function shouldTriggerToolReflection(toolResultStr, failCountInIteration, reflectionConfig) {
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
function buildReflectionPrompt(messages, answer, executionLog, round = 1) {
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
function parseReflectionResult(rawContent) {
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

  console.warn('[Background] 无法解析反思结果，使用默认值');
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
async function reflectOnResult(messages, answer, executionLog, model, config, reflectionConfig, tabId, sendStatusUpdate, globalIteration, taskContext, sessionId) {
  const postConfig = reflectionConfig.postReflection;

  if (postConfig.maxRounds < 1) {
    return { content: answer, reflectionLog: [], status: 'skipped', overallScore: null, wasRevised: false };
  }

  const reflectionLog = [];
  const maxRounds = Math.max(1, postConfig.maxRounds);
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
    console.log(`[Background] 反思完成: 评分 ${finalScore}/10, 决策: ${decisionLabel}, 修订: ${wasRevised}, 总耗时: ${totalDuration}ms`);

    return {
      content: currentContent,
      reflectionLog,
      status: finalDecision,
      overallScore: finalScore,
      wasRevised
    };

  } catch (error) {
    console.warn('[Background] 反思 API 调用失败:', error.message);
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
async function reflectOnToolResult(toolName, toolResultStr, toolCallParams, config, model, reflectionConfig, executionLog, iteration) {
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
    console.warn('[Background] 工具反思调用失败:', error.message);
    return null;
  }
}

/**
 * 子任务反思：对子任务执行结果进行质量评估
 */
async function reflectOnSubtask(messages, result, executionLog, model, config, subtaskReflectConfig, tabId, subtaskName, parentExecutionLog, sessionId) {
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

    console.log(`[Background] 子任务反思完成: ${subtaskName}, 评分: ${parsed.overallScore}/10, 耗时: ${duration}ms`);

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
    console.warn('[Background] 子任务反思失败:', error.message);
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
