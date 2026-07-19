// background/react-loop.js - ReAct 推理循环与 API 调用
import { cancelReactLoop, resetReactCancel, isCancelled, getOrCreateAbortController, getOrCreateToolAbortController, clearToolAbortController, getCurrentReactTabId, setCurrentReactTabId, incrementDialogApiCallCount, getDialogApiCallCount } from './state.js';
import { getStoredConfig, getChatConfig } from './config.js';
import { getTools, executeTool, fetchWithTimeout, fetchWithRetry } from './tool-executor.js';
import { PARALLELIZABLE_TOOLS, CONFIRMATION_REQUIRED_TOOLS } from './constants.js';
import { preselectTools } from './tool-preselector.js';
import { estimateTokens, estimateMessagesTokens, estimateToolsTokens, truncateByTokens, truncateContentSmart, getMessageBudget, getContextWindow, assessContextPressure, filterApiMessages, stripImagesFromContent } from '../shared/token-counter.js';
import { recordTokenUsage } from './token-recorder.js';
import { StreamController, readSSEStream } from './stream-controller.js';
import { saveReactCheckpoint, getReactCheckpoint, deleteReactCheckpoint, getAllReactCheckpoints } from '../storage/db.js';
import logger from '../shared/logger.js';
// 反思机制相关函数已拆分到 react-reflection.js
import {
  MAX_REFLECTION_ROUNDS,
  shouldReflect, getToolReflectionPriority, shouldTriggerToolReflection,
  buildReflectionPrompt, parseReflectionResult,
  reflectOnResult, reflectOnToolResult, reflectOnSubtask
} from './react-reflection.js';

// 活跃的 ReAct 循环 sessionId 集合，用于检测 SW 静默重启
// 当 onConnect 发现 keepalive 端口重连但 sessionId 不在其中时，说明 SW 已重启
export const activeReactLoops = new Set();

// 已获得"当前任务放行"的会话集合，后续敏感操作自动通过
const loopApprovedSessions = new Set();

// 敏感操作中文显示名映射
const TOOL_DISPLAY_NAMES = {
  manage_cookies: '管理 Cookie',
  clear_page_data: '清除页面数据',
  download_file: '下载文件',
  close_tab: '关闭标签页',
};

/**
 * 请求用户确认敏感操作
 * 发送消息到 Side Panel 显示确认对话框，等待用户响应
 */
async function requestToolConfirmation(toolName, toolArgs, tabId, sessionId) {
  const toolLabel = TOOL_DISPLAY_NAMES[toolName] || toolName;
  const confirmTimeout = 300000; // 5分钟确认超时
  
  logger.debug(`[Background] 请求用户确认工具操作: ${toolName}`, toolArgs);

  // 为 close_tab 获取标签页标题和 URL，帮助用户判断
  let extraMessage = '';
  if (toolName === 'close_tab' && toolArgs.tabId !== undefined) {
    try {
      const tab = await chrome.tabs.get(parseInt(toolArgs.tabId, 10));
      extraMessage = `\n\n标签页标题: ${tab.title || '无标题'}\n标签页 URL: ${tab.url || '未知'}`;
    } catch (e) {
      extraMessage = `\n\n（无法获取标签页信息: ${e.message}）`;
    }
  }
  
  return new Promise((resolve) => {
    const handler = (message) => {
      if (message.type === 'TOOL_CONFIRMATION_RESPONSE' && message.toolCallId === toolName) {
        chrome.runtime.onMessage.removeListener(handler);
        clearTimeout(timeoutId);
        logger.debug(`[Background] 用户确认结果: ${toolName} = ${message.confirmed}, scope: ${message.scope}`);
        if (message.confirmed && message.scope === 'loop') {
          // 当前任务放行：后续工具调用自动通过
          loopApprovedSessions.add(sessionId);
          logger.debug(`[Background] 会话 ${sessionId} 已设为当前任务放行`);
        }
        resolve(message.confirmed);
      }
    };
    
    chrome.runtime.onMessage.addListener(handler);
    
    const timeoutId = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      logger.debug(`[Background] 确认超时，默认拒绝: ${toolName}`);
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
        timeout: confirmTimeout,
        message: extraMessage ? `模型请求执行操作: ${toolLabel}${extraMessage}` : undefined
      }
    }).catch(err => {
      logger.debug('[Background] 发送确认对话框消息失败:', err.message);
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

// MAX_REFLECTION_ROUNDS 已拆分到 react-reflection.js

/**
 * 序列化 checkpoint 并写入 IndexedDB
 * 失败不阻塞主流程，仅记录日志
 */
async function persistCheckpoint(sessionId, data) {
  if (!sessionId) return;
  try {
    const ok = await saveReactCheckpoint({ sessionId, ...data });
    if (ok) {
      logger.debug(`[Background] checkpoint 已保存 (sessionId=${sessionId}, iteration=${data.iteration}, reason=${data.interruptedReason})`);
      // 验证写入：读回确认 checkpoint 确实落盘（防止 IndexedDB 升级阻塞导致静默失败）
      try {
        const verified = await getReactCheckpoint(sessionId);
        if (!verified) {
          logger.error(`[Background] ⚠️ checkpoint 写入返回成功但读回为空！sessionId=${sessionId}，可能是 DB store 不存在或事务未提交`);
        } else {
          logger.debug(`[Background] checkpoint 写入验证通过，消息数=${verified.currentMessages?.length || 0}`);
        }
      } catch (verifyErr) {
        logger.error('[Background] checkpoint 读回验证失败:', verifyErr.message);
      }
    } else {
      logger.error(`[Background] checkpoint 保存返回 false (sessionId=${sessionId}, iteration=${data.iteration})，可能是 reactCheckpoints store 不存在，DB 升级被阻塞`);
    }
  } catch (e) {
    logger.error('[Background] 保存 checkpoint 失败:', e.message, e.stack);
  }
}

/**
 * 任务完成后清理 checkpoint
 */
async function clearCheckpoint(sessionId) {
  if (!sessionId) return;
  try {
    await deleteReactCheckpoint(sessionId);
    logger.debug(`[Background] checkpoint 已清理 (sessionId=${sessionId})`);
  } catch (e) {
    logger.warn('[Background] 清理 checkpoint 失败:', e.message);
  }
}

/**
 * 清理不完整的消息配对
 * 任务中断时，checkpoint 中可能存在：
 * 1. 孤立的 tool 消息（前面没有对应的 assistant(tool_calls)）→ API 400 错误
 * 2. 孤立的 assistant(tool_calls)（后面没有对应的 tool 消息）→ 模型会困惑
 * @param {Array} messages - 消息数组
 * @returns {Array} 清理后的消息数组
 */
function cleanupIncompleteMessagePairs(messages) {
  if (!messages || messages.length === 0) return messages;

  const cleaned = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    // 孤立的 tool 消息：前面不是 assistant(tool_calls)，跳过
    if (msg.role === 'tool') {
      const prevMsg = i > 0 ? messages[i - 1] : null;
      if (!prevMsg || prevMsg.role !== 'assistant' || !prevMsg.tool_calls) {
        logger.warn('[Background] cleanupIncompleteMessagePairs: 跳过孤立的 tool 消息（index=' + i + '）');
        i++;
        continue;
      }
    }

    // assistant(tool_calls)：检查后面是否有对应的 tool 消息
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      // 检查下一条消息是否是 tool
      const nextMsg = i + 1 < messages.length ? messages[i + 1] : null;
      if (!nextMsg || nextMsg.role !== 'tool') {
        // 孤立的 assistant(tool_calls)：清除 tool_calls，保留消息内容（可能是思考过程）
        logger.warn('[Background] cleanupIncompleteMessagePairs: 孤立的 assistant(tool_calls)，清除 tool_calls（index=' + i + '）');
        cleaned.push({ ...msg, tool_calls: undefined });
        i++;
        continue;
      }
    }

    cleaned.push(msg);
    i++;
  }

  if (cleaned.length !== messages.length) {
    logger.debug('[Background] cleanupIncompleteMessagePairs: 清理完成，消息数:', messages.length, '→', cleaned.length);
  }

  return cleaned;
}

/**
 * 从 checkpoint 恢复 ReAct 循环
 * 供 background/index.js 的 RESUME_REACT 消息处理调用
 *
 * @param {string} sessionId - 会话 ID
 * @param {string} [userGuidance=''] - 用户追加的任务描述（可选）
 * @param {string} [resumeCallId=null] - 恢复请求的 callId，用于流式消息过滤（必须与前端 listener 的 myCallId 一致）
 * @returns {Promise<{content, executionLog, reasoningContent}|null>}
 */
export async function resumeReactLoopFromCheckpoint(sessionId, userGuidance = '', resumeCallId = null) {
  if (!sessionId) return null;
  const checkpoint = await getReactCheckpoint(sessionId);
  if (!checkpoint) {
    logger.warn(`[Background] 未找到 sessionId=${sessionId} 的 checkpoint，无法恢复`);
    // 诊断：列出所有已保存的 checkpoint，帮助排查 sessionId 不匹配问题
    let diagInfo = '';
    try {
      const all = await getAllReactCheckpoints();
      if (all.length === 0) {
        logger.warn('[Background] IndexedDB 中没有任何 checkpoint 记录（可能从未保存成功）');
        diagInfo = '（IndexedDB 中无任何 checkpoint 记录）';
      } else {
        logger.warn('[Background] 当前 IndexedDB 中的 checkpoint 列表:', all.map(cp => ({
          sessionId: cp.sessionId,
          iteration: cp.iteration,
          updatedAt: new Date(cp.updatedAt).toISOString(),
          reason: cp.interruptedReason,
        })));
        diagInfo = `（共 ${all.length} 个 checkpoint: ${all.map(cp => cp.sessionId).join(', ')}）`;
      }
    } catch (e) {
      logger.error('[Background] 读取 checkpoint 列表失败:', e);
      diagInfo = `（读取 checkpoint 列表失败: ${e.message}）`;
    }
    // 将诊断信息附加到返回值，供前端展示
    return null;
  }

  logger.debug(`[Background] 从 checkpoint 恢复 ReAct 循环: sessionId=${sessionId}, iteration=${checkpoint.iteration}, messages=${checkpoint.currentMessages?.length}, userGuidance=${userGuidance ? '有' : '无'}, resumeCallId=${resumeCallId}`);

  // 恢复 currentMessages：深拷贝避免修改 checkpoint 原始数据
  let restoredMessages = JSON.parse(JSON.stringify(checkpoint.currentMessages || []));

  // 清理不完整的消息配对：任务中断时可能存在孤立的 tool 消息（前面没有 assistant(tool_calls)）
  // 或孤立的 assistant(tool_calls)（后面没有 tool 消息），这些都会导致 API 400 错误
  restoredMessages = cleanupIncompleteMessagePairs(restoredMessages);

  // 如果用户提供了追加描述，作为 user 消息注入到消息末尾
  // 让模型基于"之前已完成的工具调用 + 用户新的指导"继续执行
  if (userGuidance && userGuidance.trim()) {
    const guidanceMsg = {
      role: 'user',
      content: `[任务恢复提示] 任务此前在执行过程中被中断，现在从断点继续。\n\n用户追加说明：${userGuidance.trim()}\n\n请基于之前已完成的工具调用结果，结合上述说明继续完成任务。不要重复已完成的步骤。`,
    };
    restoredMessages.push(guidanceMsg);
    logger.debug('[Background] 已注入用户追加描述，消息总数:', restoredMessages.length);
  } else {
    // 即使没有用户描述，也注入一个系统级提示，告知模型任务是被恢复的
    const resumeHintMsg = {
      role: 'user',
      content: `[任务恢复提示] 任务此前在执行过程中被中断，现在从断点继续。请基于之前已完成的工具调用结果继续完成任务，不要重复已完成的步骤。`,
    };
    restoredMessages.push(resumeHintMsg);
    logger.debug('[Background] 已注入默认恢复提示，消息总数:', restoredMessages.length);
  }

  // 恢复时合并 checkpoint 状态并调用 reactLoop
  // taskContext 为 null 表示主任务（子任务的 checkpoint 不通过此入口恢复，子任务中断视为整体失败）
  // 关键：使用 resumeCallId（新 callId）而非 checkpoint.callId（旧 callId），
  // 否则前端 listener 按 myCallId 过滤时会丢弃所有 STREAM_* 消息，导致无流式输出
  const result = await reactLoop(
    restoredMessages,
    checkpoint.model,
    await getTools(),  // 重新获取工具列表（避免工具配置变化导致的不一致）
    checkpoint.tabId,
    checkpoint.apiParams || {},
    sessionId,
    null,  // 主任务恢复时不带 taskContext
    null,  // onLogUpdate
    checkpoint.globalIteration || { value: checkpoint.iteration || 0 },
    checkpoint.executionLog || [],
    resumeCallId || checkpoint.callId || null  // 优先使用新的 resumeCallId
  );

  // 恢复成功后清理 checkpoint
  await clearCheckpoint(sessionId);
  return result;
}

/**
 * ReAct 推理循环
 * 注意：澄清工具执行时会暂停整体循环超时计时
 */
export async function reactLoop(messages, model, tools, tabId, apiParams = {}, sessionId = null, taskContext = null, onLogUpdate = null, globalIteration = { value: 0 }, initialLog = [], callId = null) {
  // 标记该 session 的 ReAct 循环正在运行，用于 SW 重启检测
  if (sessionId) activeReactLoops.add(sessionId);

  let iteration = 0;
  let totalReflectionRounds = 0; // 单次 ReAct 循环内反思总轮数，防止 API 调用次数远超 maxIterations
  let currentMessages = [...messages];
  const toolResultCache = new Map(); // 单次 ReAct 循环内的工具结果缓存
  const CACHE_TTL_MS = 60000; // 缓存条目 60 秒过期，同一轮对话内有效
  const MAX_CACHE_SIZE = 30; // 缓存上限，防止大结果无限增长

  // 重复工具调用检测：防止模型陷入重复调用同一工具的循环
  const REPEATED_CALL_WARN_THRESHOLD = 3; // 连续相同调用达到此次数时注入警告
  const REPEATED_CALL_HARD_LIMIT = 6;     // 连续相同调用达到此次数时强制终止
  let lastToolCallFingerprint = null;     // 上一轮工具调用的指纹
  let repeatedCallCount = 0;              // 连续相同调用的计数
  
  // ReAct 循环 Token 预算：根据模型上下文窗口动态计算
  // 为工具定义、系统提示词、输出预留空间后的消息预算
  let reactTokenBudget = null;

  const getReactTokenBudget = (modelName) => {
    if (reactTokenBudget === null) {
      // getMessageBudget 已减去了系统提示词、工具定义和输出预留
      reactTokenBudget = getMessageBudget(modelName, tools.length, 0, chatConfig.customModelMap);
      logger.debug(`[Background] ReAct Token 预算: ${reactTokenBudget} tokens (模型: ${modelName})`);
    }
    return reactTokenBudget;
  };

  /**
   * 工具结果截断：单条工具结果最大 token 数
   * 避免 get_page_content / fetch_url 等大结果撑爆上下文
   */
  const MAX_TOOL_RESULT_TOKENS = 6000;

  /**
   * 基于 Token 总量的消息裁剪，替代原来的条数限制
   * 保留 system message，从后往前保留消息，确保 tool_calls/tool 配对
   * 反思消息优先裁剪（权重更高），保护核心对话
   */
  const trimMessages = () => {
    const budget = getReactTokenBudget(model || 'default');
    const totalTokens = estimateMessagesTokens(currentMessages);
    if (totalTokens <= budget) return;

    const oldLen = currentMessages.length;
    const oldTokens = totalTokens;
    const systemMsg = currentMessages[0]?.role === 'system' ? [currentMessages[0]] : [];
    const rest = systemMsg.length ? [...currentMessages.slice(1)] : [...currentMessages];

    // 消息权重：反思消息 > 工具结果 > 普通消息（权重越高，越优先被裁剪）
    const getWeight = (msg) => {
      if (msg._reflection) return 3;
      if (msg.role === 'tool') return 2;
      return 1;
    };

    // 从前往后逐条移除高权重消息，直到 token 量在预算内
    while (rest.length > 0) {
      const currentTokens = estimateMessagesTokens([...systemMsg, ...rest]);
      if (currentTokens <= budget) break;

      // 从开头找到第一条可裁剪的消息（优先高权重）
      let removeIdx = -1;
      let bestWeight = 0;
      for (let i = 0; i < rest.length; i++) {
        const w = getWeight(rest[i]);
        if (w > bestWeight) {
          bestWeight = w;
          removeIdx = i;
        }
        // 最高权重，不再继续查找
        if (bestWeight >= 3) break;
      }
      // 如果没找到高权重消息（都是权重 0），移除最早的一条
      if (removeIdx < 0 || bestWeight === 0) removeIdx = 0;

      const removed = rest.splice(removeIdx, 1)[0];

      // 如果移除的是 assistant(tool_calls)，则后续的 tool 消息也要一并移除
      if (removed?.role === 'assistant' && removed.tool_calls) {
        while (rest.length > 0 && rest[removeIdx]?.role === 'tool') {
          rest.splice(removeIdx, 1);
        }
      } else if (removed?.role === 'tool') {
        // 如果移除了 tool 消息，检查前面的 assistant 是否因此孤立
        for (let j = removeIdx - 1; j >= 0; j--) {
          if (rest[j]?.role === 'assistant' && rest[j]?.tool_calls) {
            // 检查是否还有其他 tool 消息配对
            const nextMsg = rest[j + 1];
            if (!nextMsg || nextMsg.role !== 'tool') {
              // 孤立的 assistant(tool_calls)，清除 tool_calls
              delete rest[j].tool_calls;
            }
          } else {
            break;
          }
        }
      }
    }

    currentMessages = [...systemMsg, ...rest];
    const newTokens = estimateMessagesTokens(currentMessages);
    logger.debug(`[Background] ReAct Token 裁剪: ${oldTokens} → ${newTokens} tokens (${oldLen} → ${currentMessages.length} 条)`);
  };

  const executionLog = [...initialLog];
  let currentSubtaskIndex = null;
  let subtaskPlan = null;

  /**
   * 保存当前 ReAct 循环状态为 checkpoint
   * 仅主任务（无 taskContext）保存，子任务不保存（避免与父任务 checkpoint 冲突）
   * 节流：两次保存间隔至少 1500ms，避免高频写 IndexedDB
   * @param {string} reason - 保存原因
   * @param {boolean} force - 是否强制保存（绕过节流），用于 catch 块确保中断状态被保存
   */
  let lastCheckpointSaveTime = 0;
  const CHECKPOINT_THROTTLE_MS = 1500;
  async function saveCheckpointNow(reason = '', force = false) {
    // 子任务不保存 checkpoint（子任务中断视为整体失败，由父任务重试）
    if (taskContext) {
      logger.debug(`[Background] saveCheckpointNow 跳过（子任务）: reason=${reason}`);
      return;
    }
    if (!sessionId) {
      logger.warn('[Background] saveCheckpointNow 跳过（sessionId 为空）');
      return;
    }

    const now = Date.now();
    if (!force && now - lastCheckpointSaveTime < CHECKPOINT_THROTTLE_MS) {
      logger.debug(`[Background] saveCheckpointNow 节流跳过: reason=${reason}, 距上次保存 ${now - lastCheckpointSaveTime}ms < ${CHECKPOINT_THROTTLE_MS}ms`);
      return;
    }
    lastCheckpointSaveTime = now;

    logger.debug(`[Background] saveCheckpointNow 开始保存: sessionId=${sessionId}, reason=${reason}, force=${force}, iteration=${iteration}, messages=${currentMessages.length}, callId=${callId}`);

    await persistCheckpoint(sessionId, {
      currentMessages: currentMessages.map(msg => {
        // 过滤掉无法序列化的字段（如函数）
        const clean = { ...msg };
        if (typeof clean.content === 'function') clean.content = String(clean.content);
        return clean;
      }),
      executionLog: [...executionLog],
      iteration,
      globalIteration: { value: globalIteration?.value || iteration },
      subtaskPlan,
      currentSubtaskIndex,
      totalReflectionRounds,
      model: model || config?.modelName,
      apiParams,
      taskContext: null,  // 主任务 checkpoint 永远是 null
      tabId,
      callId,
      interruptedReason: reason || 'in_progress',
    });
  }
  
  resetReactCancel(sessionId || tabId);
  setCurrentReactTabId(tabId);
  
  // 为当前会话创建 AbortController，用于用户取消时中断 fetch 请求
  // 子任务场景（有 taskContext）不 abort 旧的 controller，避免并行子任务互相杀死
  const abortController = sessionId ? getOrCreateAbortController(sessionId, !taskContext) : null;
  const abortSignal = abortController?.signal;
  
  const config = await getStoredConfig();
  const chatConfig = await getChatConfig();
  
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
  
  // 子任务禁用流式输出（子任务的流式消息会干扰主任务的流式 UI 状态）
  // 子任务的执行日志通过 onLogUpdate 回调传递给父任务，无需流式显示
  const isSubtask = taskContext && taskContext.subtaskId;
  const streamConfig = isSubtask 
    ? { ...config.streamConfig, streamEnabled: false }
    : config.streamConfig;
  
  logger.debug('[Background] reactLoop 配置:', reactConfig);
  logger.debug('[Background] reactLoop 收到工具列表:', tools.map(t => t.function.name), '数量:', tools.length);
  logger.debug('[Background] reactLoop 任务上下文:', taskContext ? `子任务 ${taskContext.subtaskId || '无'} (${taskContext.subtaskName || '主任务'})` : '无');
  
  /**
   * 发送实时执行状态更新消息（200ms 节流，子任务大量执行时防止消息拥塞）
   */
  let lastStatusSendTime = 0;
  let lastSentNodeName = '';
  // 跟踪已发送的执行日志条目，用于增量发送避免 64MiB 限制
  const lastSentLogSnapshot = new Map(); // id -> { status, nodeName }
  function sendExecutionStatusUpdate(nodeName, status) {
    try {
      const now = Date.now();
      
      // 回调通知父任务：始终传递完整日志（父任务需要完整日志进行合并）
      if (typeof onLogUpdate === 'function') {
        onLogUpdate([...executionLog]);
      }
      
      // 节流：200ms 内同一节点名不重复发送，但节点名变化时立即发送
      if (nodeName === lastSentNodeName && now - lastStatusSendTime < 200) return;
      lastStatusSendTime = now;
      lastSentNodeName = nodeName;
      
      // 增量发送：只发送新增或变更的条目，避免完整 executionLog 超过 64MiB 限制
      const deltaLog = [];
      for (const entry of executionLog) {
        const prev = lastSentLogSnapshot.get(entry.id);
        if (!prev || prev.status !== entry.status || prev.nodeName !== entry.nodeName) {
          deltaLog.push(entry);
          lastSentLogSnapshot.set(entry.id, { status: entry.status, nodeName: entry.nodeName });
        }
      }
      
      const msg = {
        type: 'EXECUTION_STATUS_UPDATE',
        nodeName: nodeName,
        status: status,
        callId: callId,
        executionLog: deltaLog
      };
      
      if (sessionId) {
        msg.sessionId = sessionId;
      }
      
      chrome.runtime.sendMessage(msg).catch(err => {
        logger.debug('[Background] 发送执行状态更新失败:', err.message);
      });
    } catch (e) {
      logger.debug('[Background] 发送执行状态更新异常:', e.message);
    }
  }
  
  // 整体循环超时控制 - 使用动态调整机制
  const loopStartTime = Date.now();
  let totalPausedDuration = 0;  // 累计暂停时长（澄清等待时间不计入）
  let pauseStartTime = null;    // 暂停开始时刻
  let isPaused = false;         // 是否处于暂停状态
  
  // 发送初始状态
  sendExecutionStatusUpdate('准备开始执行...', 'processing');

  // 初始 checkpoint：在主循环开始前保存一次，确保即使第一次 API 调用期间用户刷新页面，
  // 也有 checkpoint 可供恢复（否则要等到第一个工具执行完才有 checkpoint）
  await saveCheckpointNow('initial', true);
  
  /**
   * 暂停整体循环超时计时（用于澄清工具）
   */
  function pauseLoopTimer() {
    if (!isPaused) {
      pauseStartTime = Date.now();
      isPaused = true;
      logger.debug('[Background] 整体循环超时已暂停');
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
      
      logger.debug('[Background] 整体循环超时已恢复，暂停时长:', Math.round(pauseDuration / 1000), 's，剩余时间:', Math.round(getRemainingTime() / 1000), 's');
    }
  }
  
  // 再次清除取消状态，防止在 await getStoredConfig() 等异步操作期间
  // 收到前一个请求残留的 CANCEL_REACT 消息导致的误取消
  resetReactCancel(sessionId || tabId);

  // 任务是否正常完成（用于 finally 决定是否清理 checkpoint）
  let taskCompleted = false;

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
      logger.debug(`[Background] ReAct 循环第 ${iteration} 次，剩余时间: ${Math.round(remainingTime / 1000)}s (已暂停: ${Math.round(totalPausedDuration / 1000)}s)`);
      
      let response;
      const apiCallStartTime = Date.now();
      
      // 过滤消息中的内部字段，确保消息格式符合 API 要求
      let filteredMessages = filterApiMessages(currentMessages);
      
      // 剥离历史消息中的旧图片数据，只保留最后一条消息的图片
      // 当图片已经被识别处理后，后续 API 调用不需要再携带 Base64 编码
      for (let i = 0; i < filteredMessages.length - 1; i++) {
        filteredMessages[i] = { ...filteredMessages[i], content: stripImagesFromContent(filteredMessages[i].content) };
      }
      
      // 添加 API 调用开始的日志节点（状态为 processing）
      const apiLogId = crypto.randomUUID();
      const currentCount = getDialogApiCallCount(sessionId);
      
      // 如果工具集中包含 plan_task，展示当前可用工具即可（Agent 已做了工具过滤）
      // 不再展开为全量工具，避免绕过 Agent 的工具限制
      const hasPlanTask = tools.some(t => t.function?.name === 'plan_task');
      const apiTools = tools;
      if (hasPlanTask) {
        logger.debug('[Background] 当前迭代包含 plan_task，使用 Agent 限定工具进行任务拆解，工具数:', apiTools.length);
      }

      // 上下文压力评估：在每次 API 调用前检查 token 使用量
      const filteredTokens = estimateMessagesTokens(filteredMessages);
      const toolTokens = estimateToolsTokens(apiTools.length);
      const pressure = assessContextPressure(filteredTokens + toolTokens, getContextWindow(model || config.modelName, 0, chatConfig.customModelMap));
      if (pressure.level !== 'safe') {
        logger.warn(`[Background] 上下文压力: ${pressure.level} (${Math.round(pressure.ratio * 100)}% 已用, ${filteredTokens} tokens ${filteredMessages.length} 条消息)`);
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
        logger.debug('[Background] API 请求工具数量:', apiTools.length);
        
        const requestBody = {
          model: model || config.modelName,
          messages: filteredMessages,
          tools: apiTools.map(t => {
            const { id, ...clean } = t;
            return clean;
          }),
          stream: streamConfig.streamEnabled !== false
        };
        
        logger.debug('[Background] API 请求体 stream 模式:', requestBody.stream, '工具数量:', requestBody.tools.length, '消息数量:', requestBody.messages.length, 'model:', requestBody.model);
        
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
          logger.warn(`[Background] ⚠️ API 调用外层超时保护触发 (${Math.round(outerTimeoutMs / 1000)}s)，强制 abort`);
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
          logger.warn(`[Background] API 重试 ${retryAttempt} 次后:`, retryError.message);
        });
        clearTimeout(outerWatchdog);

        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text();
          logger.error('[Background] API 响应错误:', fetchResponse.status, errorText);
          throw new Error(`HTTP error! status: ${fetchResponse.status}, message: ${errorText.substring(0, 500)}`);
        }

        // 流式模式：读取 SSE 流
        if (streamConfig.streamEnabled !== false && fetchResponse.body) {
          logger.debug('[Background] 进入流式模式，streamEnabled:', streamConfig.streamEnabled);
          const streamController = new StreamController(sessionId, streamConfig, { callId });
          const streamResult = await readSSEStream(fetchResponse.body.getReader(), streamController, abortSignal);
          logger.debug('[Background] 流式 API 响应完成，内容长度:', streamResult.content.length, 'tool_calls:', streamResult.toolCalls?.length, 'usage:', streamResult.usage);
          
          // 构建兼容现有代码的 response 对象
          // 流式模式下 tool_calls 的 id 可能为空，需要规范化，确保与 tool 消息的 tool_call_id 匹配
          // 注意：readSSEStream 中已发送 STREAM_TOOL_CALL 并规范化了 ID，此处保持幂等
          const normalizedToolCalls = streamResult.toolCalls ? streamResult.toolCalls.map(tc => ({
            ...tc,
            id: tc.id || `tc_fb_${crypto.randomUUID().slice(0, 8)}`
          })) : null;

          // STREAM_TOOL_CALL 已在 readSSEStream 中发送，此处不再重复发送

          response = {
            choices: [{
              message: {
                role: 'assistant',
                content: streamResult.content || '',
                reasoning_content: streamResult.reasoningContent,
                ...(normalizedToolCalls ? { tool_calls: normalizedToolCalls } : {})
              },
              finish_reason: streamResult.status === 'tool_calls' ? 'tool_calls' : (streamResult.truncated ? 'length' : 'stop')
            }],
            usage: streamResult.usage
          };
        } else {
          // 非流式模式：保持原有逻辑
          const responseText = await fetchResponse.text();
          logger.debug('[Background] API 响应状态:', fetchResponse.status, '原始文本长度:', responseText.length, '预览:', responseText.substring(0, 200));

          try {
            response = JSON.parse(responseText);
          } catch (parseError) {
            logger.error('[Background] JSON 解析失败:', parseError);
            logger.error('[Background] 原始响应:', responseText);
            throw new Error(`API 响应不是有效的 JSON (HTTP ${fetchResponse.status}): ${parseError.message}。响应前100字符: ${responseText.substring(0, 100)}`);
          }

          // 非流式模式下，规范化 tool_calls 的 ID（不发送 STREAM_TOOL_CALL，前端不创建流式元素）
          const nonStreamToolCalls = response.choices?.[0]?.message?.tool_calls;
          if (nonStreamToolCalls && nonStreamToolCalls.length > 0) {
            const normalizedNonStreamToolCalls = nonStreamToolCalls.map(tc => ({
              ...tc,
              id: tc.id || `tc_fb_${crypto.randomUUID().slice(0, 8)}`
            }));

            // 更新 response 中的 tool_calls 使用规范化后的 ID
            response.choices[0].message.tool_calls = normalizedNonStreamToolCalls;
          }
        }
      } catch (error) {
        clearTimeout(outerWatchdog);
        // 区分用户取消（AbortError）和真正的 API 错误
        const isAborted = error.name === 'AbortError';
        if (isAborted) {
          logger.debug('[Background] API 调用已被用户取消');
        } else {
          logger.error('[Background] API 调用失败:', error.message || error);
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
      const finishReason = response.choices?.[0]?.finish_reason;
      
      // 如果内容被截断，记录警告（循环仍继续，让模型在下一轮处理）
      if (finishReason === 'length') {
        logger.warn(`[Background] API 响应因 token 限制被截断 (finish_reason: length)，内容可能不完整`);
      }
      
      const apiLogIndex = executionLog.findIndex(log => log.id === apiLogId);
      if (apiLogIndex !== -1) {
        executionLog[apiLogIndex] = {
          ...executionLog[apiLogIndex],
          duration: apiCallDuration,
          status: 'success',
          thought: assistantMessage?.content || '',
          action: assistantMessage?.tool_calls?.length > 0 ? {
            name: assistantMessage.tool_calls[0].function?.name || assistantMessage.tool_calls[0].name,
            params: (() => { try { return JSON.parse(assistantMessage.tool_calls[0].function?.arguments || '{}'); } catch { return {}; } })()
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
        logger.debug('[Background] 收到工具调用:', assistantMessage.tool_calls);
        
        // 重复工具调用检测：计算本轮工具调用的指纹并与上一轮比较
        const currentFingerprint = JSON.stringify(
          assistantMessage.tool_calls.map(tc => ({
            name: tc.function?.name || tc.name,
            args: typeof tc.function?.arguments === 'string' 
              ? (() => { try { return JSON.parse(tc.function.arguments); } catch { return tc.function.arguments; } })()
              : tc.function?.arguments || {}
          }))
        );
        
        if (currentFingerprint === lastToolCallFingerprint) {
          repeatedCallCount++;
          logger.warn(`[Background] 检测到重复工具调用 (第${repeatedCallCount}次连续重复):`, 
          assistantMessage.tool_calls.map(tc => tc.function?.name || tc.name).join(', '));
          
          if (repeatedCallCount >= REPEATED_CALL_HARD_LIMIT) {
            logger.warn(`[Background] 连续${repeatedCallCount}次执行相同的工具调用，疑似陷入循环，已自动终止。请更换策略或缩小任务范围后重试。`);
            // throw createErrorWithLog(
            //   `连续${repeatedCallCount}次执行相同的工具调用，疑似陷入循环，已自动终止。请更换策略或缩小任务范围后重试。`,
            //   executionLog
            // );
          }
          
          if (repeatedCallCount >= REPEATED_CALL_WARN_THRESHOLD) {
            logger.warn(`[Background] 【系统提示】你已经连续${repeatedCallCount}次调用了完全相同的工具和参数，但未取得有效进展。请立即更换其他策略或工具，不要继续重复此操作。如果当前工具无法获取所需数据，请尝试其他替代方案，或基于已有信息直接给出结论。`);
            // 注入警告消息，提示模型更换策略
            // 使用 role: 'user' 而非 'system'，避免插入中间的 system 消息破坏 filterApiMessages 的 assistant/tool 配对检测
            // const warnMsg = {
            //   role: 'user',
            //   content: `【系统提示】你已经连续${repeatedCallCount}次调用了完全相同的工具和参数，但未取得有效进展。请立即更换其他策略或工具，不要继续重复此操作。如果当前工具无法获取所需数据，请尝试其他替代方案，或基于已有信息直接给出结论。`
            // };
            // currentMessages.push(warnMsg);
            // logger.debug('[Background] 注入重复调用警告消息');
          }
        } else {
          lastToolCallFingerprint = currentFingerprint;
          repeatedCallCount = 1;
        }
        
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
          logger.debug('[Background] executeSingleToolCall 收到工具调用:', JSON.stringify({ name: toolName, argsType: typeof rawArgs, argsRaw: typeof rawArgs === 'string' ? rawArgs.substring(0, 200) : JSON.stringify(rawArgs).substring(0, 200), id: toolCall.id }));
          const toolArgs = (() => {
            if (!rawArgs) return {};
            if (typeof rawArgs === 'object') return rawArgs;
            try { return JSON.parse(rawArgs || '{}'); } catch { return {}; }
          })();
          // 防御：流式模式下 tool_call.id 可能为空，用 index 生成回退 id
          const toolCallId = toolCall.id || `tc_fallback_${crypto.randomUUID()}`;
          
          // 检查是否需要用户确认（敏感操作 + 开关开启）
          const needsConfirmation = CONFIRMATION_REQUIRED_TOOLS.has(toolName) && reactConfig.toolConfirmationEnabled;
          if (needsConfirmation) {
            // 如果该会话已获得"当前任务放行"，跳过确认
            if (sessionId && loopApprovedSessions.has(sessionId)) {
              logger.debug(`[Background] 会话 ${sessionId} 已获当前任务放行，跳过确认: ${toolName}`);
            } else {
              // 暂停整体循环超时 + 通知前端暂停单次请求超时
              // （等待用户确认的时间不应计入超时，与 clarify_question 行为一致）
              pauseLoopTimer();
              chrome.runtime.sendMessage({
                type: 'TOOL_CONFIRM_START',
                ...(sessionId ? { sessionId } : {})
              }).catch(err => {
                logger.debug('[Background] 发送 TOOL_CONFIRM_START 消息失败:', err.message);
              });

              let confirmed;
              try {
                confirmed = await requestToolConfirmation(toolName, toolArgs, tabId, sessionId);
              } finally {
                // 无论确认/拒绝/超时，都恢复超时计时
                resumeLoopTimer();
                chrome.runtime.sendMessage({
                  type: 'TOOL_CONFIRM_END',
                  ...(sessionId ? { sessionId } : {})
                }).catch(err => {
                  logger.debug('[Background] 发送 TOOL_CONFIRM_END 消息失败:', err.message);
                });
              }
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
          }
          
          // 缓存检查（含 TTL 过期检查）
          const cacheKey = `${toolName}:${JSON.stringify(toolArgs)}`;
          if (toolResultCache.has(cacheKey)) {
            const cached = toolResultCache.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
              if (PARALLELIZABLE_TOOLS.has(toolName)) {
                return { ...cached, fromCache: true };
              }
              // 非并行工具：清空缓存
              toolResultCache.clear();
            } else {
              // 缓存已过期，删除
              toolResultCache.delete(cacheKey);
            }
          }

          // 清除非并行工具缓存
          if (!PARALLELIZABLE_TOOLS.has(toolName)) {
            toolResultCache.clear();
          }
          
          // 让出事件循环，确保 STREAM_TOOL_CALL 有机会先传递到侧面板
          // 这样用户能在工具执行开始前看到"执行中..."状态，而不是等待工具执行完成后才看到
          await new Promise(r => setTimeout(r, 0));
          
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
              logger.debug('[Background] 发送 CLARIFY_START 消息失败:', err.message);
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
                logger.debug('[Background] 发送 CLARIFY_END 消息失败:', err.message);
              });
              
              // 澄清后重新预筛选工具：用户补充了新信息，工具集需要同步更新
              logger.debug('[Background] 澄清完成，重新预筛选工具...');
              try {
                const fullTools = await getTools();
                const config = await getStoredConfig();
                const enableToolPreselect = config.reactConfig.enableToolPreselect;
                const preselectMinToolCount = config.reactConfig.preselectMinToolCount || 3;
                if (enableToolPreselect && fullTools.length > preselectMinToolCount) {
                  const reSelection = await preselectTools(currentMessages, model, fullTools, apiParams);
                  if (reSelection.type === 'tools') {
                    tools = reSelection.tools;
                    reactTokenBudget = null; // 工具集变更，重置 Token 预算缓存
                    logger.debug('[Background] 澄清后工具重新筛选完成:', tools.map(t => t.function.name));
                  }
                  // 合并重新筛选的执行日志
                  if (reSelection.executionLog) {
                    executionLog.push(...reSelection.executionLog);
                  }
                } else if (!enableToolPreselect) {
                  logger.debug('[Background] 工具预筛选已关闭，澄清后不重新筛选');
                }
              } catch (rePreselectErr) {
                logger.warn('[Background] 澄清后工具重新筛选失败，继续使用当前工具集:', rePreselectErr.message);
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

            // 工具结果截断：防止大结果撑爆上下文 以及 chrome.runtime.sendMessage 64MiB 限制
            const resultTokens = estimateTokens(toolResultStr);
            let toolResultTruncated = false;
            let toolResultForDisplay = toolResultStr;
            if (resultTokens > MAX_TOOL_RESULT_TOKENS) {
              // 自动检测内容类型，智能截断
              const truncated = truncateContentSmart(toolResultStr, MAX_TOOL_RESULT_TOKENS);
              logger.debug(`[Background] 工具 ${toolName} 结果截断: ${resultTokens} → ${estimateTokens(truncated)} tokens`);
              toolResultTruncated = true;
              toolResultForDisplay = truncated;
              toolResultStr = truncated;
            }

            // 发送工具结果到 Side Panel 展示（使用截断后的内容）
            chrome.runtime.sendMessage({
              type: 'STREAM_TOOL_RESULT',
              sessionId,
              result: {
                toolCallId: toolCallId,
                toolName,
                success: isToolSuccess,
                content: isToolSuccess ? toolResultForDisplay : (toolResult?.error || toolResultForDisplay),
                truncated: toolResultTruncated,
                duration: Date.now() - toolStartTime
              }
            }).catch(() => {});

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
              logger.debug('[Background] 收到任务规划结果:', JSON.stringify(subtaskPlan));
              
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
                subtaskPlan, model, tools, tabId, apiParams, sessionId, executionLog, globalIteration,
                reactConfig.reflection, config, lastSentLogSnapshot
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
                toolResultCache.set(cacheKey, { planTaskHandled: true, toolName, toolCallId: toolCallId, timestamp: Date.now() });
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
            
            logger.debug('[Background] 工具执行结果长度:', toolResultStr.length, '内容预览:', toolResultStr.substring(0, 200));
            
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
              toolResultCache.set(cacheKey, { planTaskHandled: false, toolResultStr, toolName, toolCallId: toolCallId, toolResult, timestamp: Date.now() });
            }
            
            return { planTaskHandled: false, toolResultStr, toolName, toolCallId: toolCallId, toolResult };
            
          } catch (toolError) {
            logger.warn('[Background] 工具执行失败（ReAct 循环继续）:', toolError.message);
            
            // 如果是澄清工具，恢复整体循环超时计时
            if (toolName === 'clarify_question') {
              resumeLoopTimer();
              chrome.runtime.sendMessage({
                type: 'CLARIFY_END',
                ...(sessionId ? { sessionId } : {})
              }).catch(err => {
                logger.debug('[Background] 发送 CLARIFY_END 消息失败:', err.message);
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
            
            // 工具执行失败时返回错误结果而非 throw，让 ReAct 循环继续下一轮
            // 模型可以根据错误信息调整策略（如重试、换工具、或直接给出结论）
            logger.warn(`[Background] 工具 ${toolName} 执行失败，ReAct 循环继续:`, toolError.message);
            sendExecutionStatusUpdate(`工具执行:${toolName}`, 'failed');

            // 发送工具错误结果到 Side Panel 展示（更新 UI 中的工具卡片状态）
            chrome.runtime.sendMessage({
              type: 'STREAM_TOOL_RESULT',
              sessionId,
              result: {
                toolCallId: toolCallId,
                toolName,
                success: false,
                content: `错误: ${toolError.message}`,
                truncated: false,
                duration: Date.now() - toolStartTime
              }
            }).catch(() => {});

            return {
              error: toolError.message,
              toolName,
              toolCallId: toolCallId,
              toolResult: { success: false, error: toolError.message },
              toolResultStr: JSON.stringify({ success: false, error: toolError.message })
            };
          }
        }
        
        /**
         * 处理待处理的反思队列（按优先级排序后处理前 N 个）
         */
        async function processPendingReflections() {
          if (pendingReflections.length === 0) return;
          if (totalReflectionRounds >= MAX_REFLECTION_ROUNDS) {
            logger.warn('[Background] 反思总轮数已达上限，跳过工具反思');
            return;
          }
          
          // 按优先级降序排序
          pendingReflections.sort((a, b) => b.priority - a.priority);
          const maxPerIteration = reflectionConfig?.toolReflection?.maxPerIteration || 2;
          
          for (const ref of pendingReflections.slice(0, maxPerIteration)) {
            if (totalReflectionRounds >= MAX_REFLECTION_ROUNDS) break;
            totalReflectionRounds++;
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
              logger.debug(`[Background] 工具反思: ${ref.toolName} - ${toolReflection.useful ? '有用' : '无效'} - ${toolReflection.reasoning}`);
              
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
          logger.debug('[Background] 并行执行工具调用:', assistantMessage.tool_calls.map(tc => tc.function?.name || tc.name));
          
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
              logger.warn(`[Background] 并行工具执行失败: ${assistantMessage.tool_calls[i].function?.name || assistantMessage.tool_calls[i].name} - ${result.error}`);
            }
            if (result.planTaskHandled) {
              planTaskHandled = true;
            }
          }
          // 并行工具失败不终止循环，让模型在下一轮根据错误信息调整策略
          
          // 处理反思优先级队列
          await processPendingReflections();

          if (planTaskHandled) {
            await saveCheckpointNow('plan_task_completed');
            continue;
          }
        } else {
          // 顺序执行路径
          for (const toolCall of assistantMessage.tool_calls) {
            const result = await executeSingleToolCall(toolCall, tabId, toolTimeout, loopTimeout, clarifyTimeout, sessionId, iteration, executionLog, currentMessages);

            if (result.planTaskHandled) {
              // plan_task 处理了子任务，跳出当前 for 循环，由外层 while 重新迭代
              // 使用 break 而非 continue，避免在子任务执行后继续执行其他已过时的工具调用
              await processPendingReflections();
              break;
            }
          }

          // 所有工具执行完毕后，处理反思优先级队列
          await processPendingReflections();
        }

        // 工具执行完毕，保存 checkpoint（覆盖 plan_task 子任务执行后的状态）
        await saveCheckpointNow('tools_completed');
        continue;
      }
      
      const content = assistantMessage?.content || '';
      const reasoningContent = assistantMessage?.reasoning_content || null;
      logger.debug('[Background] ReAct 循环完成，最终内容长度:', content.length);

      // 任务正常完成：先保存最终 checkpoint（供反思失败时仍可续接），然后清理
      await saveCheckpointNow('final_answer');
      
      // 任务正常完成后清理 checkpoint（只有中断时才保留 checkpoint）
      await clearCheckpoint(sessionId);

      // 后置反思：对最终答案进行质量评估
      const reflectionConfig = reactConfig.reflection;
      if (reflectionConfig?.enabled && reflectionConfig?.postReflection?.enabled && shouldReflect(executionLog, taskContext)) {
        logger.debug('[Background] 触发后置反思...');
        const reflectionResult = await reflectOnResult(
          currentMessages, content, executionLog, model, config,
          reflectionConfig, tabId, sendExecutionStatusUpdate, globalIteration, taskContext, sessionId, totalReflectionRounds
        );

        // 合并反思日志
        if (reflectionResult.reflectionLog && reflectionResult.reflectionLog.length > 0) {
          executionLog.push(...reflectionResult.reflectionLog);
        }

        sendExecutionStatusUpdate('执行完成', 'success');
        taskCompleted = true;
        return {
          content: reflectionResult.content,
          executionLog,
          reflectionScore: reflectionResult.overallScore,
          wasRevised: reflectionResult.wasRevised,
          reasoningContent
        };
      }

      // 发送完成状态
      sendExecutionStatusUpdate('执行完成', 'success');

      // 返回执行日志和内容
      taskCompleted = true;
      return { content, executionLog, reasoningContent };
    }

    const error = new Error(`ReAct 循环超过最大迭代次数 (${maxIterations})`);
    error.executionLog = executionLog;
    throw error;
  } catch (error) {
    // 任务异常中断：强制保存 checkpoint 供后续恢复（绕过节流）
    // 取消（AbortError）和真实错误都保存，让用户可以选择是否续接
    const isUserCancel = error.name === 'AbortError' ||
                         error.message === '请求已被用户取消' ||
                         error.message === 'ReAct 循环已被用户取消';
    await saveCheckpointNow(isUserCancel ? 'user_cancelled' : 'error', true);
    throw error;
  } finally {
    // 标记该 session 的 ReAct 循环已结束，用于 SW 重启检测
    if (sessionId) {
      activeReactLoops.delete(sessionId);
      loopApprovedSessions.delete(sessionId);  // 清除"当前任务放行"状态
    }
    // 注意：不在 finally 中清理 checkpoint！
    // 原因：页面刷新后 SW 中的 reactLoop 可能继续运行并正常完成，
    // 此时 API_COMPLETE 无法送达前端（页面已刷新），如果清理了 checkpoint，
    // 用户将无法恢复。checkpoint 的清理依赖以下机制：
    // 1. 新 CALL_API 启动时清理（index.js）
    // 2. resumeReactLoopFromCheckpoint 恢复成功后清理
    // 3. 会话删除时清理（session-store.js）
    // 4. TTL 7 天过期自动清理（SW 启动时）
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
export async function executeSubtasks(subtaskPlan, model, tools, tabId, apiParams, sessionId, parentExecutionLog, globalIteration = { value: 0 }, reflectionConfig = null, config = null, lastSentLogSnapshot = new Map()) {
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

  /**
   * 增量发送执行日志状态更新，避免 parentExecutionLog 超过 64MiB 限制
   */
  function sendSubtaskStatusUpdate(nodeName, status, logToSend, extraFields = {}) {
    const deltaLog = [];
    for (const entry of logToSend) {
      const prev = lastSentLogSnapshot.get(entry.id);
      if (!prev || prev.status !== entry.status || prev.nodeName !== entry.nodeName) {
        deltaLog.push(entry);
        lastSentLogSnapshot.set(entry.id, { status: entry.status, nodeName: entry.nodeName });
      }
    }
    if (deltaLog.length === 0) return; // 无变更，跳过发送
    
    const msg = {
      type: 'EXECUTION_STATUS_UPDATE',
      nodeName,
      status,
      executionLog: deltaLog,
      ...(sessionId ? { sessionId } : {}),
      ...extraFields
    };
    
    // 子任务进度信息：让前端显示 "子任务 X/N: name 执行中..."
    if (extraFields.subtaskTotal != null) {
      msg.subtaskTotal = extraFields.subtaskTotal;
      msg.subtaskIndex = extraFields.subtaskIndex;
      msg.subtaskName = extraFields.subtaskName;
    }
    
    chrome.runtime.sendMessage(msg).catch(err => {});
  }
  
  logger.debug('[Background] 开始执行子任务，策略:', strategy, '失败策略:', failureStrategy, '最大重试:', maxRetries, '数量:', subtasks.length);
  
  // 按依赖关系排序（拓扑排序）
  const sortedSubtasks = strategy === 'dependency' 
    ? sortSubtasksByDependencies(subtasks) 
    : subtasks;
  
  // 筛选每个子任务需要的工具（继承父任务工具范围）
  const toolSets = await prepareToolSetsForSubtasks(sortedSubtasks, tools);
  
  /**
   * 回滚已完成的子任务
   */
  async function rollbackCompletedTasks() {
    logger.debug('[Background] 开始回滚已完成的子任务');
    
    // 逆序回滚
    for (let i = completedSubtasks.length - 1; i >= 0; i--) {
      const { subtask, result } = completedSubtasks[i];
      
      if (typeof subtask.rollback === 'function') {
        try {
          logger.debug(`[Background] 回滚子任务: ${subtask.name}`);
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
          
          sendSubtaskStatusUpdate(`子任务 ${subtask.name} (已回滚)`, 'rolledback', parentExecutionLog);
          
        } catch (rollbackError) {
          logger.error('[Background] 回滚失败:', rollbackError.message);
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
    
    // 为子任务创建派生 sessionId，隔离流式消息（避免干扰主任务的流式输出状态）
    const subtaskSessionId = sessionId ? `${sessionId}_subtask_${subtaskIndex}` : null;
    
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
      taskGroup: taskGroup,
      taskGroupIndex: subtaskIndex + 1,
      taskGroupName: subtask.name,
      isSubtask: true
    });
    
    // 发送子任务开始状态
    sendSubtaskStatusUpdate(`子任务 ${subtaskIndex + 1}: ${subtask.name}`, 'processing', parentExecutionLog, { taskGroup: taskGroup, subtaskIndex, subtaskTotal: sortedSubtasks.length, subtaskName: subtask.name });
    
    // 重试循环
    for (let retry = 0; retry <= maxRetries; retry++) {
      // 每次重试前检查是否已取消（使用原始 sessionId 检查取消状态）
      if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
        logger.debug('[Background] 子任务重试已被用户取消');
        throw createErrorWithLog('ReAct 循环已被用户取消', parentExecutionLog);
      }
      
      try {
        logger.debug(`[Background] 执行子任务 ${subtaskIndex + 1}/${sortedSubtasks.length}: ${subtask.name} (尝试 ${retry + 1}/${maxRetries + 1})`);
        
        // 为子任务创建独立的消息上下文
        const subtaskMessages = [
          {
            role: 'system',
            content: `你正在执行一个子任务。请专注完成此任务，不要询问用户。\n\n任务背景：${taskDescription}\n\n当前子任务：${subtask.description}\n\n你可以使用所有可用的工具来完成任务，根据实际情况自行选择合适的工具。`
          },
          {
            role: 'user',
            content: subtask.description
          }
        ];
        
        // 调用子任务的ReAct循环（使用派生 sessionId 隔离流式消息）
        const subtaskResult = await reactLoop(
          subtaskMessages, 
          model, 
          subtaskTools, 
          tabId, 
          apiParams,
          subtaskSessionId,
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
            
            sendSubtaskStatusUpdate(`子任务 ${subtaskIndex + 1}: ${subtask.name}`, 'processing', mergedLog, { taskGroup: taskGroup, subtaskIndex, subtaskTotal: sortedSubtasks.length, subtaskName: subtask.name });
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
        
        // 发送子任务完成状态（增量发送，避免 64MiB 限制）
        sendSubtaskStatusUpdate(`子任务 ${subtaskIndex + 1}: ${subtask.name} (完成)`, 'success', parentExecutionLog, { taskGroup: taskGroup, subtaskIndex, subtaskTotal: sortedSubtasks.length, subtaskName: subtask.name });
        
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
            logger.debug(`[Background] 子任务 ${subtask.name} 触发反思，复杂度: ${isComplexSubtask ? '复杂' : '普通'}`);
            
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
              logger.debug(`[Background] 子任务 ${subtask.name} 反思后已修订`);
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
        logger.warn(`[Background] 子任务 ${subtask.name} 尝试 ${retry + 1} 失败:`, error.message);
        
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
          sendSubtaskStatusUpdate(`子任务 ${subtaskIndex + 1}: ${subtask.name} (失败)`, 'failed', parentExecutionLog, { taskGroup: taskGroup, subtaskIndex, subtaskTotal: sortedSubtasks.length, subtaskName: subtask.name });
          
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
        logger.debug('[Background] 子任务执行已被用户取消');
        return results;
      }
      
      const subtask = sortedSubtasks[i];
      const subtaskTools = toolSets[subtask.id] || [];
      
      const result = await executeSingleSubtask(subtask, subtaskTools, i);
      results.push(result);
      
      if (!result.success) {
        logger.debug(`[Background] 子任务 ${subtask.name} 失败，失败策略: ${failureStrategy}`);
        
        if (failureStrategy === 'stop') {
          // 停止执行并回滚
          logger.debug('[Background] 执行回滚');
          await rollbackCompletedTasks();
          return results;
        }
        
        // continue 或 skip：继续执行剩余子任务
      }
      
      // 每个子任务完成后检查是否已取消
      if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
        logger.debug('[Background] 子任务执行已被用户取消');
        return results;
      }
    }
  } else if (strategy === 'parallel') {
    // 并行执行
    logger.debug('[Background] 并行执行子任务，最大并发数:', maxParallel);
    
    const executing = [];
    const resultsMap = new Map();
    
    for (let i = 0; i < sortedSubtasks.length; i++) {
      // 在每个子任务执行前检查是否已取消
      if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
        logger.debug('[Background] 子任务并行执行已被用户取消');
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
      logger.debug('[Background] 并行执行中发生失败，执行回滚');
      await rollbackCompletedTasks();
    }
  } else {
    // 未知策略，降级为顺序执行
    logger.warn(`[Background] 未知执行策略: ${strategy}，降级为顺序执行`);
    return executeSubtasks({ ...subtaskPlan, strategy: 'sequential' }, model, tools, tabId, apiParams, sessionId, parentExecutionLog, globalIteration);
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
 * 子任务继承父任务的工具范围，不再额外限制
 * @param {Array} subtasks - 子任务列表
 * @param {Array} parentTools - 父任务的工具列表
 */
export async function prepareToolSetsForSubtasks(subtasks, parentTools = null) {
  // 如果未传入父任务工具，降级为获取全部工具（兼容旧调用）
  const allTools = parentTools || await getTools();
  const toolSets = {};
  const allToolNames = allTools.map(t => t.function?.name).filter(Boolean);
  const allToolIds = allTools.map(t => t.id).filter(Boolean);
  
  subtasks.forEach(subtask => {
    const requiredToolNames = subtask.requiredTools || [];
    if (requiredToolNames.length > 0) {
      // 子任务指定了工具 → 从父任务工具范围中筛选
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
        logger.warn(`[Background] 子任务 ${subtask.name} 指定的工具不存在: ${unmatchedTools.join(', ')}`);
      }
      
      logger.debug(`[Background] 子任务 ${subtask.name} 需要工具: ${requiredToolNames.join(', ')}, 匹配到 ${toolSets[subtask.id].length} 个`);
    } else {
      // 未指定工具 → 继承父任务全部工具范围
      toolSets[subtask.id] = [...allTools];
      logger.debug(`[Background] 子任务 ${subtask.name} 未指定所需工具，继承父任务全部 ${allTools.length} 个工具`);
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
    logger.debug(`[Background] 澄清工具直接执行，无外层超时（整体循环超时已暂停）`);
    return executeTool(toolCall, tabId, sessionId);
  }
  
  // 其他工具使用正常超时 + 用户终止等待
  logger.debug(`[Background] 工具 ${toolName} 使用超时: ${timeoutMs}ms`);
  
  // 创建工具级 AbortController，支持用户手动终止等待
  const toolAbortController = getOrCreateToolAbortController(sessionId);
  
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`工具执行超时 (${timeoutMs}ms): ${toolName}`));
    }, timeoutMs);

    // 用户手动终止等待
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new Error(`工具执行已被用户终止: ${toolName}`));
    };

    if (toolAbortController && !toolAbortController.signal.aborted) {
      toolAbortController.signal.addEventListener('abort', onAbort, { once: true });
    }

    executeTool(toolCall, tabId, sessionId)
      .then(result => {
        clearTimeout(timeoutId);
        if (toolAbortController) {
          toolAbortController.signal.removeEventListener('abort', onAbort);
          clearToolAbortController(sessionId);
        }
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        if (toolAbortController) {
          toolAbortController.signal.removeEventListener('abort', onAbort);
          clearToolAbortController(sessionId);
        }
        reject(error);
      });
  });
}

/**
 * 调用 OpenAI 兼容 API（支持流式/非流式）
 */
export function callApiNonStream(messages, model, apiParams = {}, sessionId = null, streamOptions = {}, callId = null) {
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

    // 过滤消息中的内部字段，确保消息格式符合 API 要求
    const filteredMessages = filterApiMessages(messages);

    const useStream = config.streamConfig?.streamEnabled !== false;

    logger.debug('[Background] 发送 API 请求到:', apiUrl, '流式:', useStream);

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
        logger.error('[Background] API 响应错误:', response.status, responseText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${responseText.substring(0, 500)}`);
      }

      // 流式模式：读取 SSE 流
      if (useStream && response.body) {
        const streamController = new StreamController(sessionId, config.streamConfig, { ...streamOptions, callId });
        const result = await readSSEStream(response.body.getReader(), streamController, abortSignal);
        logger.debug('[Background] 流式 API 响应完成，内容长度:', result.content.length, 'usage:', result.usage);
        return { content: result.content, usage: result.usage, reasoningContent: result.reasoningContent };
      }

      // 非流式模式：保持原有逻辑
      const responseText = await response.text();
      logger.debug('[Background] 非流式 API 响应状态:', response.status, '文本长度:', responseText.length, '预览:', responseText.substring(0, 200));

      try {
        const data = JSON.parse(responseText);
        logger.debug('[Background] API 响应:', JSON.stringify(data).substring(0, 200));
        const content = data.choices?.[0]?.message?.content || '';
        return { content, usage: data.usage || null };
      } catch (parseErr) {
        logger.error('[Background] JSON 解析失败，原始响应:', responseText.substring(0, 500));
        throw new Error(`JSON 解析失败 (HTTP ${response.status}): ${parseErr.message}。响应前100字符: ${responseText.substring(0, 100)}`);
      }
    })
    .catch(error => {
      if (error.name === 'AbortError') {
        logger.debug('[Background] API 调用已被用户取消');
      } else {
        logger.error('[Background] API 调用失败:', error.message || error);
      }
      throw error;
    });
  });
}

// ============================================================
// 反思机制（Reflection）- 已拆分到 react-reflection.js
// ============================================================
// shouldReflect / getToolReflectionPriority / shouldTriggerToolReflection
// / buildReflectionPrompt / parseReflectionResult
// / reflectOnResult / reflectOnToolResult / reflectOnSubtask
// 已通过顶部 import 引入本模块
