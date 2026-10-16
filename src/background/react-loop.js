// background/react-loop.js - ReAct 推理循环与 API 调用
import { cancelReactLoop, resetReactCancel, isCancelled, getOrCreateAbortController, getOrCreateToolAbortController, clearToolAbortController, getCurrentReactTabId, setCurrentReactTabId, incrementDialogApiCallCount, getDialogApiCallCount, getKeepalivePort } from './state.js';
import { getStoredConfig, getChatConfig } from './config.js';
import { getTools, executeTool, fetchWithRetry, getSessionForcedMcpServers } from './tool-executor.js';
import { PARALLELIZABLE_TOOLS, CONFIRMATION_REQUIRED_TOOLS, CONFIRMATION_ACTION_MAP, TOOL_TIMEOUT_MS, INTERACTION_CONFIRM_TIMEOUT_MS, INTERACTION_PANEL_POLL_MS } from './constants.js';
import { estimateTokens, estimateMessagesTokens, truncateByTokens, truncateContentSmart, getContextWindow, assessContextPressure, filterApiMessages, sanitizeImageUrlsForApi, stripImagesFromContent, trimMessagesByBudget, updateCalibration, getCalibratedTokens, getCalibrationInfo } from '../shared/token-counter.js';
import { recordTokenUsage } from './token-recorder.js';
import { StreamController, readSSEStream, STREAM_IDLE_TIMEOUT_MS } from './stream-controller.js';
import { saveReactCheckpoint, getReactCheckpoint, deleteReactCheckpoint, getAllReactCheckpoints } from '../storage/db.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';
import { wrapUntrusted, applyUntrustedContract, getContractText } from '../shared/untrusted-content.js';
import { notifyInteractionRequired, clearInteractionNotification } from './notifier.js';
import { createLoopDetector } from './loop-detector.js';
import { isAgentPaired, writeFile as writeAgentFile } from './local-agent-client.js';
import { getSubagentDepth, setSubagentDepth, clearSubagentDepth } from './subagent-depth.js';
import { startSwHeartbeat, stopSwHeartbeat } from './sw-heartbeat.js';
import { startAutoResumeWatch, stopAutoResumeWatch } from './auto-resume.js';

// 注册 reactLoop 命名空间翻译
registerTranslations('zh', {
  reactLoop: {
    apiCallNode: 'API调用 (第{count}次{subtask})',
    apiCallSubtask: ', 子任务第{iteration}次',
    preparing: '准备开始执行...',
    toolExec: '工具执行:{name}',
    toolExecStart: '执行工具: {name}',
    taskPlanDone: '任务规划完成',
    executionDone: '执行完成',
    userDenied: '用户拒绝了此操作',
    subtaskRolledBack: '子任务 {name} (已回滚)',
    subtaskRollbackFailed: '子任务 {name} (回滚失败)',
    subtaskCount: '已拆解为 {count} 个子任务',
    subtaskPlanNode: '子任务计划（共 {count} 个）',
    subtaskNode: '子任务 {index}: {name}',
    subtaskCompleted: '子任务 {index}: {name} (完成)',
    subtaskFailed: '子任务 {index}: {name} (失败)',
    subtaskSkippedReplay: '子任务 {index}: {name}（中断前已完成，跳过重放）',
    subtaskStoppedLoop: '子任务 {index}: {name} (已停止：检测到循环；父任务将按失败策略重试或跳过，主任务暂停后可补充指导)',
    userCancelled: '用户取消',
    skippedAfterPlanTask: '已跳过（plan_task 已拆分子任务，本轮其他工具调用不再执行）',
    toolError: '错误: {message}',
    loopTimeout: 'ReAct 循环总超时 ({timeout}ms，不含澄清等待时间)',
    apiInvalidJson: 'API 响应不是有效的 JSON (HTTP {status}): {error}。响应前100字符: {preview}',
    infiniteLoopDetected: '连续{count}次执行完全相同的工具调用（入参和返参均相同），疑似陷入死循环，已自动终止。请更换策略或缩小任务范围后重试。',
    loopStoppedRepeat: '检测到重复无效操作：工具「{toolName}」结果无变化地反复调用（累计 {count} 次），任务已暂停。可补充指导后恢复任务。',
    loopStoppedRefEnum: '检测到页面元素枚举循环（可疑读取/乱序翻页 {count} 次），任务已暂停。可补充指导后恢复任务。',
    loopStoppedOscillation: '检测到操作振荡循环（在「{keyA}」与「{keyB}」间反复交替），任务已暂停。可补充指导后恢复任务。',
    loopStoppedFailureScope: '检测到同一操作连续失败（{scope}），任务已暂停。可补充指导后恢复任务。',
    loopStoppedNoProgressScroll: '检测到无进展滚动（{key} 方向已到边界仍反复滚动），任务已暂停。可补充指导后恢复任务。',
    loopStoppedBudget: '检测到多轮无进展操作（累计提醒 {nudges} 次），任务已暂停。可补充指导后恢复任务。',
    unknownStrategy: '未知的执行策略 "{strategy}"，有效值：sequential / parallel / dependency。请修正策略后重新调用 plan_task。',
    maxIterationsExceeded: 'ReAct 循环超过最大迭代次数 ({maxIterations})',
    toolTimeout: '工具执行超时 ({timeout}ms): {tool}',
    toolAborted: '工具执行已被用户终止: {tool}',
    jsonParseFailed: 'JSON 解析失败 (HTTP {status}): {error}。响应前100字符: {preview}',
    streamIdleTimeout: '流式响应空闲超时（{seconds} 秒未收到任何数据），已自动中断。可能是网络或服务提供商暂时不稳定，请重试。',
  },
});

registerTranslations('en', {
  reactLoop: {
    apiCallNode: 'API Call (#{count}{subtask})',
    apiCallSubtask: ', Subtask #{iteration}',
    preparing: 'Preparing to execute...',
    toolExec: 'Tool Exec:{name}',
    toolExecStart: 'Executing: {name}',
    taskPlanDone: 'Task planning completed',
    executionDone: 'Execution completed',
    userDenied: 'User denied this operation',
    subtaskRolledBack: 'Subtask {name} (rolled back)',
    subtaskRollbackFailed: 'Subtask {name} (rollback failed)',
    subtaskCount: 'Broken down into {count} subtasks',
    subtaskPlanNode: 'Subtask plan ({count} subtasks)',
    subtaskNode: 'Subtask {index}: {name}',
    subtaskCompleted: 'Subtask {index}: {name} (completed)',
    subtaskFailed: 'Subtask {index}: {name} (failed)',
    subtaskSkippedReplay: 'Subtask {index}: {name} (already completed before interruption; replay skipped)',
    subtaskStoppedLoop: 'Subtask {index}: {name} (stopped by loop detection; the parent task will retry or skip per its failure strategy. You can add guidance when the main task pauses)',
    skippedAfterPlanTask: 'Skipped (plan_task has decomposed subtasks, other tool calls in this round are no longer executed)',
    toolError: 'Error: {message}',
    loopTimeout: 'ReAct loop total timeout ({timeout}ms, excluding clarification wait time)',
    apiInvalidJson: 'API response is not valid JSON (HTTP {status}): {error}. First 100 chars: {preview}',
    infiniteLoopDetected: 'Executed the exact same tool call {count} times in a row (both inputs and outputs identical), likely stuck in an infinite loop. Automatically terminated. Please change strategy or narrow the task scope and retry.',
    loopStoppedRepeat: 'Repeated no-progress operation detected: "{toolName}" was called {count} times with no change in results. Task paused; you can add guidance before resuming.',
    loopStoppedRefEnum: 'Page element enumeration loop detected ({count} suspicious re-reads or out-of-order pages). Task paused; you can add guidance before resuming.',
    loopStoppedOscillation: 'Oscillation loop detected (alternating between "{keyA}" and "{keyB}"). Task paused; you can add guidance before resuming.',
    loopStoppedFailureScope: 'The same operation failed repeatedly ({scope}). Task paused; you can add guidance before resuming.',
    loopStoppedNoProgressScroll: 'No-progress scrolling detected ({key}: already at boundary). Task paused; you can add guidance before resuming.',
    loopStoppedBudget: 'Multiple no-progress patterns detected ({nudges} warnings). Task paused; you can add guidance before resuming.',
    unknownStrategy: 'Unknown execution strategy "{strategy}". Valid values: sequential / parallel / dependency. Please fix the strategy and call plan_task again.',
    maxIterationsExceeded: 'ReAct loop exceeded maximum iterations ({maxIterations})',
    toolTimeout: 'Tool execution timed out ({timeout}ms): {tool}',
    toolAborted: 'Tool execution was aborted by user: {tool}',
    jsonParseFailed: 'JSON parse failed (HTTP {status}): {error}. First 100 chars: {preview}',
    streamIdleTimeout: 'Stream idle timeout (no data received for {seconds}s), automatically interrupted. This may be caused by an unstable network or provider, please retry.',
  },
});
import { summarizeRoundsBatch, extractAllRounds } from './context-summarizer.js';
// 反思机制相关函数已拆分到 react-reflection.js
import {
  MAX_REFLECTION_ROUNDS,
  shouldReflect,
  buildReflectionPrompt, parseReflectionResult,
  reflectOnResult, reflectOnSubtask
} from './react-reflection.js';

// 活跃的 ReAct 循环 sessionId 集合，用于检测 SW 静默重启
// 当 onConnect 发现 keepalive 端口重连但 sessionId 不在其中时，说明 SW 已重启
export const activeReactLoops = new Set();

// 已获得"当前任务放行"的会话集合（按根任务会话记录，覆盖整棵子任务树）
const loopApprovedSessions = new Set();

// 挂起中的确认请求：`${sessionId}\0${confirmKey}` -> { sessionId, settle }
// 用途："当前任务放行"时一并结算同任务内已在等待的确认；以及超时/送达失败后下行撤销面板弹窗
const pendingConfirmations = new Map();

// 子任务派生会话后缀：`${parent}_subtask_${index}`（见 executeSubtasks）
const SUBTASK_SESSION_SUFFIX = /_subtask_\d+$/;

/**
 * 逐层剥离派生后缀，得到从自身到根任务的会话祖先链。
 * @param {string|null} sessionId
 * @returns {string[]}
 */
export function getSessionAncestry(sessionId) {
  const chain = [];
  let cur = sessionId;
  while (typeof cur === 'string' && cur) {
    chain.push(cur);
    const next = cur.replace(SUBTASK_SESSION_SUFFIX, '');
    if (next === cur) break;
    cur = next;
  }
  return chain;
}

/** 取根任务会话（无派生后缀时即自身） */
function getRootSessionId(sessionId) {
  const chain = getSessionAncestry(sessionId);
  return chain.length > 0 ? chain[chain.length - 1] : null;
}

/**
 * 查询会话是否已获得"本次任务放行"（单一数据源谓词）。
 * 供浏览器侧敏感工具与 agent_exec 灰名单命令两条确认通道共同采纳，
 * 保证"单次放行 / 任务级放行"语义在两个通道一致。
 *
 * 任务级授权按根任务会话记录：并行子任务共享同一根，
 * 故"当前任务放行"对整棵任务树一致生效（而不是只对单个子任务）。
 * @param {string|null} sessionId
 * @returns {boolean}
 */
export function hasLoopApproval(sessionId) {
  if (!sessionId) return false;
  return getSessionAncestry(sessionId).some((id) => loopApprovedSessions.has(id));
}

/**
 * 授予"当前任务放行"：按根任务会话记录，并把同一任务内仍在等待的确认一并按放行结算。
 * 否则已挂起的条目不受闸门影响（闸门只在发起确认前检查），
 * 用户会看到排队的同任务确认继续弹、还得逐条重点一次。
 * @param {string|null} sessionId - 本次应答所属会话
 */
function grantTaskLoopApproval(sessionId) {
  const root = getRootSessionId(sessionId);
  if (!root) return;
  loopApprovedSessions.add(root);
  logger.debug(`[Background] task ${root} set as current taskallow`);
  for (const [key, pending] of [...pendingConfirmations]) {
    if (getRootSessionId(pending.sessionId) === root) {
      logger.debug('[Background] taskallow releases pending confirm:', key);
      pending.settle(true, { dismiss: true });
    }
  }
}

/**
 * 向发起实例的侧边栏下发确认相关指令（如撤销陈旧弹窗）。
 * 通道选择与 SHOW_CONFIRM_DIALOG 一致：port 定向优先，无 port 回退广播。
 * 面板不可达时静默放弃：后台已按 fail-closed 结算，不会因此漏放。
 */
function sendConfirmDialogCommand(type, data, sessionId) {
  const msg = { type, data };
  const port = sessionId ? getKeepalivePort(sessionId) : null;
  if (port) {
    try {
      port.postMessage(msg);
      return;
    } catch (e) {
      logger.debug(`[Background] ${type} port postMessage failed, fallback to broadcast:`, e?.message);
    }
  }
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// 敏感操作显示名映射（i18n）
const TOOL_DISPLAY_NAME_KEYS = {
  manage_cookies: 'sensitiveTool.manage_cookies',
  clear_data: 'sensitiveTool.clear_data',
  download_file: 'sensitiveTool.download_file',
  manage_tab: 'sensitiveTool.manage_tab',
  agent_file: 'sensitiveTool.agent_file',
  debug_page: 'sensitiveTool.debug_page',
  agent_exec: 'sensitiveTool.agent_exec',
};

/**
 * 防御性解析 tool_call 参数（流式模式下 arguments 可能是 string 或已解析 object）
 */
function parseToolCallArgs(toolCall) {
  const rawArgs = toolCall.function?.arguments;
  if (!rawArgs) return {};
  if (typeof rawArgs === 'object') return rawArgs;
  try { return JSON.parse(rawArgs || '{}'); } catch { return {}; }
}

/**
 * 会话归属判定：防止一次点击误伤其他会话的同名工具确认。
 * 两侧任一没有会话标识（全局模式 / 旧消息）时不以此拒绝，避免把确认通道打死；
 * 两侧都有标识时必须一致。
 */
function confirmSessionMatches(respondedSessionId, expectedSessionId) {
  if (!expectedSessionId || !respondedSessionId) return true;
  return expectedSessionId === respondedSessionId;
}

/**
 * 请求用户确认敏感操作
 * 发送消息到 Side Panel 显示确认对话框，等待用户响应。
 *
 * 关联标识：响应必须同时匹配 correlationId（一次工具调用的唯一 ID，即 OpenAI toolCall.id）
 * 与会话 ID。不得仅按工具名匹配：并行子任务 / 多会话同时等待确认时，
 * 工具名相同会使一次点击释放所有同名的挂起确认（串扰）。
 *
 * 一律 fail-closed：仅当用户点击“确认”才 resolve(true)；拒绝 / 超时 /
 * 弹框无法送达（无 keepalive port 且广播无接收方）/ 面板已关闭均 resolve(false)。
 * 调用方两条通道（浏览器侧敏感工具、agent_exec 灰名单命令）共享此语义。
 *
 * 计时起点：倒计时不在发出弹窗时启动，而在面板回发 INTERACTION_DISPLAYED
 * （该条真正呈现）后才走。面板侧确认与澄清共用单模态闸门，排队未被看到的
 * 确认不得消耗用户的应答窗口；未呈现期间靠面板存活轮询保证不悬挂。
 *
 * @param {string} toolName
 * @param {Object} toolArgs
 * @param {number|null} tabId
 * @param {string|null} sessionId
 * @param {string|null} [correlationId] - 本次调用的唯一 ID；缺失时回退工具名（仅单会话场景安全）
 * @returns {Promise<boolean>}
 */
export async function requestToolConfirmation(toolName, toolArgs, tabId, sessionId, correlationId = null) {
  const toolLabelKey = TOOL_DISPLAY_NAME_KEYS[toolName];
  const toolLabel = toolLabelKey ? t(toolLabelKey) : toolName;
  const confirmTimeout = INTERACTION_CONFIRM_TIMEOUT_MS; // 5分钟确认超时
  // 关联键：优先用本次调用的唯一 ID，避免同名工具确认互相误伤
  const confirmKey = correlationId || toolName;

  logger.debug(`[Background] requesting user confirmation for tool operation: ${toolName}`, toolArgs);

  // 为 manage_tab(close) 获取标签页标题和 URL，帮助用户判断
  let extraMessage = '';
  if (toolName === 'manage_tab' && toolArgs.action === 'close' && toolArgs.tabId !== undefined) {
    try {
      const tab = await chrome.tabs.get(parseInt(toolArgs.tabId, 10));
      extraMessage = t('sensitiveTool.tabInfo', { title: tab.title || t('sensitiveTool.untitled'), url: tab.url || t('sensitiveTool.unknownUrl') });
    } catch (e) {
      extraMessage = t('sensitiveTool.tabInfoError', { error: e.message });
    }
  }
  // debug_page(attach) 提示黄色调试条
  if (toolName === 'debug_page' && toolArgs.action === 'attach') {
    extraMessage = t('sensitiveTool.debuggerAttachHint');
  }
  
  return new Promise((resolve) => {
    // 注册表 key 带上会话：同名工具在无 correlationId 回退时也不会互相顶掉
    const pendingKey = `${sessionId || ''}\u0000${confirmKey}`;

    let timeoutId = null;
    let panelCheckId = null;
    let countdownStarted = false;

    /**
     * 统一结算：清理监听器 / 计时器 / 注册表 / 交互提醒。
     * @param {boolean} confirmed
     * @param {{dismiss?: boolean}} [opts]
     *   dismiss=true 表示非用户应答的结算（超时 / 送达失败 / 任务放行扩散 / 面板已关），
     *   面板可能仍在展示或排队这一条，必须下行撤销，避免陈旧弹窗占位并吞掉后续确认
     */
    const settle = (confirmed, opts = {}) => {
      chrome.runtime.onMessage.removeListener(handler);
      clearTimeout(timeoutId);
      if (panelCheckId) {
        clearInterval(panelCheckId);
        panelCheckId = null;
      }
      pendingConfirmations.delete(pendingKey);
      clearInteractionNotification(sessionId);
      if (opts.dismiss) {
        sendConfirmDialogCommand('DISMISS_CONFIRM_DIALOG', { toolCallId: confirmKey, sessionId }, sessionId);
      }
      resolve(confirmed);
    };

    /**
     * 面板真正把这一条呈现出来后启动倒计时（计时约定见 constants）：
     * 面板侧确认与澄清共用单模态闸门，排队未被看到的弹窗不得消耗用户的确认窗口。
     */
    const startCountdown = () => {
      if (countdownStarted) return;
      countdownStarted = true;
      timeoutId = setTimeout(() => {
        // 超时默认拒绝 → 清除交互提醒 + 撤销面板弹窗
        logger.debug(`[Background] confirmtimeout,defaultdeny: ${toolName}`);
        settle(false, { dismiss: true });
      }, confirmTimeout);
    };

    const handler = (message) => {
      // 呈现回执：只有面板真正展示了这一条，才开始消耗倒计时
      if (message.type === 'INTERACTION_DISPLAYED') {
        const shown = message.data;
        if (
          shown &&
          shown.kind === 'confirm' &&
          shown.toolCallId === confirmKey &&
          confirmSessionMatches(shown.sessionId, sessionId)
        ) {
          logger.debug(`[Background] confirm dialog displayed, start countdown: ${toolName}`);
          startCountdown();
        }
        return;
      }

      // 双重匹配：关联 ID + 会话归属。只比工具名会让并发的同名工具确认被一次点击集体放行
      if (
        message.type === 'TOOL_CONFIRMATION_RESPONSE' &&
        message.toolCallId === confirmKey &&
        confirmSessionMatches(message.sessionId, sessionId)
      ) {
        logger.debug(`[Background] userconfirmresult: ${toolName} = ${message.confirmed}, scope: ${message.scope}`);
        const approvedForTask = message.confirmed && message.scope === 'loop';
        // 用户亲自应答：面板已自行关闭该条，无需再下行撤销
        settle(message.confirmed);
        if (approvedForTask) {
          // 任务级放行：按整棵任务树生效，并释放同任务内其他挂起确认
          grantTaskLoopApproval(sessionId);
        }
      }
    };
    
    chrome.runtime.onMessage.addListener(handler);

    // 未呈现 / 等待应答期间的兜底：面板已关闭则无人可应答，尽快 fail-closed，
    // 不让任务因等不到呈现回执而悬挂（旧行为是最长白等 5 分钟）
    if (typeof chrome?.runtime?.getContexts === 'function') {
      panelCheckId = setInterval(async () => {
        try {
          const contexts = await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] });
          if (!contexts || contexts.length === 0) {
            logger.debug(`[Background] confirm panel closed, default deny: ${toolName}`);
            settle(false, { dismiss: true });
          }
        } catch {
          // getContexts 异常时不以此判定面板已关闭，交回超时机制收敛
        }
      }, INTERACTION_PANEL_POLL_MS);
    }

    // 登记挂起确认：供任务级放行扩散结算与超时撤销
    pendingConfirmations.set(pendingKey, { sessionId, settle });
    
    // 发送显示确认对话框的消息：
    // 定向优先（keepalive port 点对点）——本实例发起的确认只弹在发起实例上，
    // 避免 chrome.runtime.sendMessage 广播导致所有 Tab 的侧边栏都弹框；
    // 无 port（定时任务发起、实例已关闭/刷新）或 port 失效时回退广播兜底。
    const confirmDialogMsg = {
      type: 'SHOW_CONFIRM_DIALOG',
      data: {
        toolName,
        toolLabel,
        args: toolArgs,
        toolCallId: confirmKey,
        sessionId,
        timeout: confirmTimeout,
        message: extraMessage ? t('dialog.confirmAction', { name: toolLabel }) + extraMessage : undefined
      }
    };
    let portSent = false;
    const port = sessionId ? getKeepalivePort(sessionId) : null;
    if (port) {
      try {
        port.postMessage(confirmDialogMsg);
        portSent = true;
      } catch (e) {
        logger.debug('[Background] confirm port postMessage failed, fallback to broadcast:', e?.message);
      }
    }
    if (portSent) {
      // 弹窗已送达发起实例；看不到面板时由通知中心弹桌面提醒（可见性判定在 notifier 内）
      notifyInteractionRequired({ kind: 'confirm', sessionId, detail: toolLabel }).catch(() => {});
    } else {
      chrome.runtime.sendMessage(confirmDialogMsg).then(() => {
        // 广播送达兜底（无 port 场景）：同样在看不到面板时补桌面提醒
        notifyInteractionRequired({ kind: 'confirm', sessionId, detail: toolLabel }).catch(() => {});
      }).catch(err => {
        logger.debug('[Background] sendconfirm dialogmessage failed, defaultdeny:', err.message);
        // 弹框无法送达（侧边栏已关闭 / 无消息接收方）= 未获得用户授权，
        // 一律 fail-closed 拒用：安全确认不得因界面不可达而静默放行
        settle(false, { dismiss: true });
      });
    }
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
 * 子任务失败时从内层执行日志构建"已完成产出摘要"（纯函数，可单测）：
 * 子任务判失败的唯一路径是内层循环抛异常且重试耗尽——往往大部分节点已成功
 * （如 98/101）。失败上报若只有 error.message，父模型对已有产出零知情，
 * "带着失败继续"实为盲续。附最近若干个成功产出节点（各自截断）供父模型基于
 * 既有工作继续，控制规模避免挤占上下文。
 * @param {Array} executionLog 内层执行日志（error.executionLog）
 * @param {{maxNodes?: number, maxCharsPerNode?: number}} [opts]
 * @returns {string} 摘要文本（无有效产出时空串）
 */
export function buildSubtaskPartialSummary(executionLog, { maxNodes = 5, maxCharsPerNode = 300 } = {}) {
  if (!Array.isArray(executionLog) || executionLog.length === 0) return '';
  const done = executionLog.filter((e) => {
    if (!e || e.status !== 'success' || e.result == null) return false;
    const s = typeof e.result === 'string' ? e.result : JSON.stringify(e.result);
    return s != null && String(s).trim() !== '';
  });
  return done.slice(-maxNodes).map((e) => {
    let s = typeof e.result === 'string' ? e.result : JSON.stringify(e.result);
    s = String(s).replace(/\s+/g, ' ').trim();
    if (s.length > maxCharsPerNode) s = s.slice(0, maxCharsPerNode - 1) + '\u2026';
    return `- ${e.nodeName || e.nodeType || 'node'}: ${s}`;
  }).join('\n');
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
 * 执行日志内存窗口上限：仅保留最近 N 条，防止长任务期间日志无限增长导致 SW 内存失控
 * 与 index.js 最终结果返回侧的 MAX_LOG_ENTRIES_FOR_MSG（1000）对齐，保证产物提取能力不退化
 */
const EXECUTION_LOG_MEMORY_LIMIT = 1000;

/**
 * 执行日志内存窗口裁剪（原地修改）：超出上限时移除最旧的终态条目
 * - 仅删除 status 不为 'processing' 的条目：进行中条目必须保留，
 *   否则其后续状态流转无法再经增量机制发出，前端节点会卡在"执行中"
 * - 距窗口 1000 条以前的条目早已在各自迭代内完成状态流转，必为终态；
 *   status 判断作为双重保险
 * - 同步清理 snapshotMap（增量发送快照）中对应记录，防止快照 Map 本身泄漏
 * - subtask_plan 条目豁免裁剪：它是"计划了哪些子任务"的唯一载体，被裁掉后历史视图
 *   无法展示从未执行的子任务
 * @param {Array} executionLog - 执行日志数组（原地裁剪）
 * @param {Map} [snapshotMap] - 增量发送快照 Map（id -> { status, nodeName }）
 * @param {number} [limit] - 窗口上限
 * @returns {number} 移除的条目数
 */
function trimExecutionLogMemory(executionLog, snapshotMap, limit = EXECUTION_LOG_MEMORY_LIMIT) {
  if (!executionLog || executionLog.length <= limit) return 0;
  const overflow = executionLog.length - limit;
  let removed = 0;
  for (let i = 0; i < executionLog.length && removed < overflow; i++) {
    if (executionLog[i].status !== 'processing' && executionLog[i].nodeType !== 'subtask_plan') {
      if (snapshotMap) snapshotMap.delete(executionLog[i].id);
      executionLog.splice(i, 1);
      removed++;
      i--; // splice 后后续条目前移，保持索引
    }
  }
  if (removed > 0) {
    logger.debug(`[Background] executionLog memory trimmed: removed ${removed} terminal old entries, remaining ${executionLog.length}`);
  }
  return removed;
}

/**
 * 序列化 checkpoint 并写入 IndexedDB
 * 失败不阻塞主流程，仅记录日志
 */
async function persistCheckpoint(sessionId, data) {
  if (!sessionId) return;
  try {
    const ok = await saveReactCheckpoint({ sessionId, ...data });
    if (ok) {
      logger.debug(`[Background] checkpoint saved (sessionId=${sessionId}, iteration=${data.iteration}, reason=${data.interruptedReason})`);
      // 验证写入：读回确认 checkpoint 确实落盘（防止 IndexedDB 升级阻塞导致静默失败）
      try {
        const verified = await getReactCheckpoint(sessionId);
        if (!verified) {
          logger.error(`[Background] ⚠️ checkpoint write returned successfulbut read-back empty!sessionId=${sessionId}, possibly is DB store does not exist or transaction not committed`);
        } else {
          logger.debug(`[Background] checkpoint write verifypassed,message=${verified.currentMessages?.length || 0}`);
        }
      } catch (verifyErr) {
        logger.error('[Background] checkpoint read-backverify failed:', verifyErr.message);
      }
    } else {
      logger.error(`[Background] checkpoint save returned false (sessionId=${sessionId}, iteration=${data.iteration}), possibly is reactCheckpoints store not found,DB upgrade blocked`);
    }
  } catch (e) {
    logger.error('[Background] save checkpoint failed:', e.message, e.stack);
  }
}

/**
 * 任务完成后清理 checkpoint
 */
async function clearCheckpoint(sessionId) {
  if (!sessionId) return;
  try {
    await deleteReactCheckpoint(sessionId);
    logger.debug(`[Background] checkpoint cleaned (sessionId=${sessionId})`);
  } catch (e) {
    logger.warn('[Background] cleanup checkpoint failed:', e.message);
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
        logger.warn('[Background] cleanupIncompleteMessagePairs: skip orphaned tool message (index=' + i + ')');
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
        logger.warn('[Background] cleanupIncompleteMessagePairs: orphaned assistant(tool_calls),clear tool_calls (index=' + i + ')');
        cleaned.push({ ...msg, tool_calls: undefined });
        i++;
        continue;
      }
    }

    cleaned.push(msg);
    i++;
  }

  if (cleaned.length !== messages.length) {
    logger.debug('[Background] cleanupIncompleteMessagePairs: cleanup complete,message:', messages.length, '→', cleaned.length);
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
    logger.warn(`[Background] not found sessionId=${sessionId}   checkpoint, no way to restore`);
    // 诊断：列出所有已保存的 checkpoint，帮助排查 sessionId 不匹配问题
    let diagInfo = '';
    try {
      const all = await getAllReactCheckpoints();
      if (all.length === 0) {
        logger.warn('[Background] IndexedDB contains no checkpoint record (may never have been saved successful)');
        diagInfo = '（IndexedDB 中无任何 checkpoint 记录）';
      } else {
        logger.warn('[Background] current IndexedDB   checkpoint  column table:', all.map(cp => ({
          sessionId: cp.sessionId,
          iteration: cp.iteration,
          updatedAt: new Date(cp.updatedAt).toISOString(),
          reason: cp.interruptedReason,
        })));
        diagInfo = `（共 ${all.length} 个 checkpoint: ${all.map(cp => cp.sessionId).join(', ')}）`;
      }
    } catch (e) {
      logger.error('[Background] read checkpoint  column table failed:', e);
      diagInfo = `（读取 checkpoint 列表失败: ${e.message}）`;
    }
    // 将诊断信息附加到返回值，供前端展示
    return null;
  }

  logger.debug(`[Background]  from  checkpoint restore ReAct loop: sessionId=${sessionId}, iteration=${checkpoint.iteration}, messages=${checkpoint.currentMessages?.length}, userGuidance=${userGuidance ? ' has ' : ' no '}, resumeCallId=${resumeCallId}`);

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
      content: `[Task Resume Notice] The task was previously interrupted during execution and is now resuming from the checkpoint.\n\nAdditional user instructions: ${userGuidance.trim()}\n\nPlease continue completing the task based on the previous tool call results, taking the above instructions into account. Do not repeat already completed steps.`,
    };
    restoredMessages.push(guidanceMsg);
    logger.debug('[Background] injected user additionaldescription,messagetotal:', restoredMessages.length);
  } else {
    // 即使没有用户描述，也注入一个系统级提示，告知模型任务是被恢复的
    const resumeHintMsg = {
      role: 'user',
      content: `[Task Resume Notice] The task was previously interrupted during execution and is now resuming from the checkpoint. Please continue completing the task based on the previous tool call results. Do not repeat already completed steps.`,
    };
    restoredMessages.push(resumeHintMsg);
    logger.debug('[Background] injected defaultrestoreprompt,messagetotal:', restoredMessages.length);
  }

  // 恢复时合并 checkpoint 状态并调用 reactLoop
  // taskContext 为 null 表示主任务（子任务的 checkpoint 不通过此入口恢复，子任务中断视为整体失败）
  // 关键：使用 resumeCallId（新 callId）而非 checkpoint.callId（旧 callId），
  // 否则前端 listener 按 myCallId 过滤时会丢弃所有 STREAM_* 消息，导致无流式输出
  const result = await reactLoop(
    restoredMessages,
    checkpoint.model,
    // 重新获取工具列表（避免工具配置变化导致的不一致）；
    // 会话强制下发的 MCP 服务（/ 手动指定）仍需感知
    await getTools(null, null, null, getSessionForcedMcpServers(sessionId)),
    checkpoint.tabId,
    checkpoint.apiParams || {},
    sessionId,
    null,  // 主任务恢复时不带 taskContext
    null,  // onLogUpdate
    checkpoint.globalIteration || { value: checkpoint.iteration || 0 },
    checkpoint.executionLog || [],
    resumeCallId || checkpoint.callId || null,  // 优先使用新的 resumeCallId
    { taskState: checkpoint.taskState || null, subtaskPlan: checkpoint.subtaskPlan || null, subtaskProgress: checkpoint.subtaskProgress || null }  // 回灌计划锚点与子任务完成进度，恢复后防重放
  );

  // 恢复成功后清理 checkpoint
  await clearCheckpoint(sessionId);
  return result;
}

/**
 * ReAct 推理循环（对外入口 = 心跳包装器）。
 * 任务执行窗口内开启 SW 保活心跳，覆盖静默间隙（等首 token/澄清等待/超长 fetch），
 * 结束（含抛错）在 finally 停跳；引用计数支持嵌套（子任务/子代理各自成对）。
 * 内部所有调用点走本包装器，实现体为 reactLoopImpl。
 */
export async function reactLoop(...args) {
  // 顶层主任务判定：有 sessionId（args[5]）且无 taskContext（args[6]）——
  // 子任务/子代理不另起续跑闹钟（它们随主任务的 checkpoint 整体恢复）
  const isTopLevelTask = !args[6] && !!args[5];
  startSwHeartbeat();
  if (isTopLevelTask) startAutoResumeWatch();
  try {
    return await reactLoopImpl(...args);
  } finally {
    if (isTopLevelTask) stopAutoResumeWatch();
    stopSwHeartbeat();
  }
}

/**
 * ReAct 推理循环实现体
 * 注意：澄清工具执行时会暂停整体循环超时计时
 */
async function reactLoopImpl(messages, model, tools, tabId, apiParams = {}, sessionId = null, taskContext = null, onLogUpdate = null, globalIteration = { value: 0 }, initialLog = [], callId = null, resumeState = null) {
  // 标记该 session 的 ReAct 循环正在运行，用于 SW 重启检测
  if (sessionId) activeReactLoops.add(sessionId);

  let iteration = 0;
  let totalReflectionRounds = 0; // 单次 ReAct 循环内反思总轮数，防止 API 调用次数远超 maxIterations
  let currentMessages = [...messages];
  const toolResultCache = new Map(); // 单次 ReAct 循环内的工具结果缓存
  const CACHE_TTL_MS = 60000; // 缓存条目 60 秒过期，同一轮对话内有效
  const MAX_CACHE_SIZE = 30; // 缓存上限，防止大结果无限增长

  // 多模式循环检测器（独立纯逻辑模块；本文件只在轮末喂入记录并接入提醒/终止）
  // 设计文档：docs/superpowers/specs/2026-10-10-loop-detection-upgrade-design.md
  const loopDetector = createLoopDetector();
  const loopRecords = []; // 本轮工具调用记录（轮末统一喂入检测器后清空）

  // stop reason → i18n key 映射（检测器保持纯逻辑，用户可见文案在壳侧生成）
  const LOOP_STOP_I18N = {
    repeat: 'loopStoppedRepeat',
    refEnum: 'loopStoppedRefEnum',
    oscillation: 'loopStoppedOscillation',
    failureScope: 'loopStoppedFailureScope',
    noProgressScroll: 'loopStoppedNoProgressScroll',
    budget: 'loopStoppedBudget',
  };

  // 轮末喂入本轮工具调用记录：软提醒合并为一条注入；遇硬停立即抛出
  // （硬停走既有 catch → saveCheckpointNow('error', force) 恢复链路）
  // 注：executionLog 定义在更下方，但调用点全部在工具轮末，闭包引用安全
  const flushLoopRecords = () => {
    if (loopRecords.length === 0) return;
    const pending = loopRecords.splice(0, loopRecords.length);
    // 并行路径下 push 顺序 = 协程完成顺序；检测器的 refEnum 步进与振荡尾迹判定依赖
    // 声明顺序，故按 order 稳定排序后喂入（Array.sort 稳定：同序保持插入顺序）
    pending.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const warnings = [];
    for (const rec of pending) {
      const outcome = loopDetector.record(tabId, rec.name, rec.args, rec.result);
      if (outcome.kind === 'stop') {
        const msgKey = LOOP_STOP_I18N[outcome.reason] || 'infiniteLoopDetected';
        logger.warn(`[Background] loop detector stopped run (${outcome.reason}): ${JSON.stringify(outcome.params)}`);
        const stopError = createErrorWithLog(t(`reactLoop.${msgKey}`, outcome.params), executionLog);
        // 结构化标记：子任务聚合点据此区分循环停止与普通失败（子任务内不存 checkpoint，恢复语义属主任务侧）
        stopError.loopStop = outcome.reason;
        throw stopError;
      }
      if (outcome.kind === 'nudge' && outcome.warning) {
        warnings.push(outcome.warning);
        logger.debug(`[Background] loop detector nudge: ${outcome.warning}`);
      }
    }
    if (warnings.length > 0) {
      // 合并为一条提醒注入（沿用 role:'user' 约定，避免破坏 filterApiMessages 配对检测）
      currentMessages.push({
        role: 'user',
        content: `[System Notice] ${warnings.join('\n')}\nPlease switch to a different strategy immediately and do not repeat this operation. If the current approach cannot make progress, try alternative methods, or provide a conclusion based on the information already available.`
      });
    }
  };
  
  // 增量对话摘要：累积已摘要的轮次文本，token 超标时注入上下文替代原始消息
  let summarizedAccumulator = null;       // 累积摘要文本，null 表示尚未摘要过
  
  // ReAct 循环 Token 预算：根据模型上下文窗口动态计算
  // 为工具定义、系统提示词、输出预留空间后的消息预算
  let reactTokenBudget = null;

  const getReactTokenBudget = (modelName) => {
    if (reactTokenBudget === null) {
      // 使用实际系统提示词和工具定义的 token 数，而非固定估算值
      const actualSystemTokens = estimateTokens(
        typeof currentMessages[0]?.content === 'string'
          ? currentMessages[0].content
          : JSON.stringify(currentMessages[0]?.content || '')
      );
      const actualToolDefTokens = estimateTokens(
        JSON.stringify(tools.map(t => { const { id, ...clean } = t; return clean; }))
      );
      const contextWindow = getContextWindow(modelName, 0, chatConfig.customModelMap);
      // 消息预算 = 上下文窗口 - 实际系统提示词 - 实际工具定义 - 输出预留(4096) - 安全余量(2000)
      reactTokenBudget = contextWindow - actualSystemTokens - actualToolDefTokens - 4096 - 2000;
      // 确保预算为正数
      if (reactTokenBudget < 1000) {
        logger.warn(`[Background] ReAct Token budget too low: ${reactTokenBudget},using minimumbudget 1000`);
        reactTokenBudget = 1000;
      }
      logger.debug(`[Background] ReAct Token budget: ${reactTokenBudget} tokens (model: ${modelName}, actualsystem promptword: ${actualSystemTokens}, actual tooldefinition: ${actualToolDefTokens}, context window: ${contextWindow})`);
    }
    return reactTokenBudget;
  };

  /**
   * 执行日志 observation 最大字符数
   * 注意：日志中的 observation 会被产物提取（artifacts-manager）用于解析
   * find / ls -R 等列表输出中动态生成的文件路径，截断过小会导致产物缺失。
   * toolResultStr 已被 MAX_TOOL_RESULT_TOKENS 限制（约 24KB），
   * 此处放宽到 50KB 作为日志存储的最终安全边界。
   */
  const MAX_LOG_OBSERVATION_CHARS = 50000;

  /**
   * 大工具结果卸载（offloading，Manus 文件系统记忆实践）：
   * Agent 已配对时把全文写入 workspace 的 tool-results/{id}.txt，
   * 对话内仅保留前 2K token 预览 + 完整内容路径，模型可用 agent_file read 回读；
   * 未配对或写入失败时返回 null，调用方回退普通截断。
   * @param {string} fullContentStr - 未截断的完整工具结果
   * @param {string} toolName - 工具名（路径命名用）
   * @param {string} toolCallId - 工具调用 ID（唯一文件名）
   * @returns {Promise<string|null>} 卸载后的替换文本，失败返回 null
   */
  const offloadLargeToolResult = async (fullContentStr, toolName, toolCallId) => {
    try {
      if (!(await isAgentPaired())) return null;
      const safeToolName = String(toolName || 'tool').replace(/[^a-zA-Z0-9_-]/g, '_');
      // toolCallId 来自模型响应，可能含 / 或 ../，须同样清洗，防止越出 tool-results/ 目录写入 workspace
      const safeCallId = String(toolCallId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = `tool-results/${safeToolName}_${safeCallId}.txt`;
      const writeResult = await writeAgentFile(filePath, fullContentStr);
      if (!writeResult?.success) {
        logger.debug(`[Background] tool result offload write failed: ${writeResult?.error || 'unknown'}`);
        return null;
      }
      const preview = truncateByTokens(fullContentStr, 2000);
      logger.debug(`[Background] tool result offloaded to agent workspace: ${filePath}`);
      return `[Tool result too large, offloaded to agent workspace file: ${filePath} (${estimateTokens(fullContentStr)} tokens total).\nPreview (first ~2000 tokens):\n${preview}\n\nUse agent_file action=read with path "${filePath}" to load the full content when needed.]`;
    } catch (err) {
      logger.debug('[Background] tool result offload exception:', err.message);
      return null;
    }
  };

  /**
   * 基于 Token 阈值触发的批量压缩 + 兜底裁剪
   * 保留 system message，确保 tool_calls/tool 配对
   *
   * 策略（分层递进）：
   *   1. 阈值触发：Token 超过预算 80% 即开始压缩，避免逼近上限才被动处理（400 风险 + 性能拖尾）。
   *   2. 批量压缩：一次 LLM 调用把所有待压旧轮次（保留最近 2 轮原文）压缩为结构化摘要
   *      （目标/已完成/关键事实/未决问题），替代旧版逐轮串行摘要（最多 3 次调用）。
   *   3. 兜底裁剪：压缩失败或仍超标时，使用权重裁剪（反思 > 工具结果 > 普通消息）直接删除。
   */
  const trimMessages = async () => {
    const budget = getReactTokenBudget(model || 'default');
    // 压缩触发阈值：预算的 80%
    const compactionThreshold = Math.floor(budget * 0.8);
    // 使用校准后的 token 估算：经过至少 3 次 API 调用的实际 prompt_tokens 对比修正
    let totalTokens = getCalibratedTokens(estimateMessagesTokens(currentMessages));
    if (totalTokens <= compactionThreshold) return;

    const oldLen = currentMessages.length;
    const oldTokens = totalTokens;
    const systemMsg = currentMessages[0]?.role === 'system' ? [currentMessages[0]] : [];
    const rest = systemMsg.length ? [...currentMessages.slice(1)] : [...currentMessages];

    // 内部辅助：校准版消息 token 估算（剥离图片后，避免图片 token 导致过度裁剪）
    const est = (msgs) => {
      const stripped = msgs.map(m => ({ ...m, content: stripImagesFromContent(m.content) }));
      return getCalibratedTokens(estimateMessagesTokens(stripped));
    };
    
    // ============================================================
    // 阶段一：阈值触发的批量压缩 —— 一次 LLM 调用压缩所有待压旧轮次
    // ============================================================
    totalTokens = est([...systemMsg, ...rest]);
    if (totalTokens > compactionThreshold) {
      // 提取完整轮次（assistant(tool_calls)+tool），保留最近 2 轮原文不动，其余批量压缩
      const rounds = extractAllRounds(rest);
      const compressRounds = rounds.slice(0, Math.max(0, rounds.length - 2));
      if (compressRounds.length > 0) {
        // 待压消息集合 = 压缩范围内轮次的成员 + 范围内的孤立消息（assistant 文本/user 追问等）
        const maxEndIdx = compressRounds[compressRounds.length - 1].endIdx;
        const toCompress = rest.filter((m, i) => i < maxEndIdx && !m._isSummary);
        const priorSummary = summarizedAccumulator ? summarizedAccumulator.trim() : '';
        const batchSummary = await summarizeRoundsBatch(toCompress, priorSummary, config, model, {
          signal: abortSignal,
          timeout: 30000
        });
    
        if (batchSummary) {
          summarizedAccumulator = batchSummary;
          // 移除旧摘要消息与待压消息（从后往前删，索引不失效）；
          // 保留首条用户问题（原始任务目标），避免压缩后逐字目标丢失
          const firstUserIdx = rest.findIndex(m => m.role === 'user');
          for (let i = rest.length - 1; i >= 0; i--) {
            if ((i < maxEndIdx && i !== firstUserIdx) || rest[i]._isSummary) rest.splice(i, 1);
          }
          // 摘要插入到（被保留的）首条用户问题之后，保持对话开头语义
          const insertIdx = rest.findIndex(m => m.role === 'user');
          rest.splice(insertIdx + 1, 0, {
            role: 'user',
            content: `[History Summary] The following is a structured summary of the compacted earlier conversation:\n${batchSummary}`,
            _isSummary: true
          });
          logger.debug(`[Background] batch compaction complete: ${toCompress.length} messages → 1 structured summary, ${est([...systemMsg, ...rest])} tokens`);
        } else {
          logger.debug('[Background] batch compaction failed,downgraded to weight-based trimming');
        }
      }
    }

    // ============================================================
    // 阶段二：兜底权重裁剪 —— 压缩后仍超硬预算时，直接删除
    // ============================================================
    totalTokens = est([...systemMsg, ...rest]);
    if (totalTokens > budget) {
      logger.debug(`[Background] still exceeding budget after compaction (${totalTokens} > ${budget}),enablefallbacktrimming`);

      // 消息权重：反思消息 > 工具结果 > 普通消息（权重越高，越优先被裁剪）
      const getWeight = (msg) => {
        if (msg._reflection) return 3;
        if (msg.role === 'tool') return 2;
        return 1;
      };

      // 从前往后逐条移除高权重消息，直到 token 量在预算内
      while (rest.length > 0) {
        const currentTokens = est([...systemMsg, ...rest]);
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
          if (bestWeight >= 3) break;
        }
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
              const nextMsg = rest[j + 1];
              if (!nextMsg || nextMsg.role !== 'tool') {
                delete rest[j].tool_calls;
              }
            } else {
              break;
            }
          }
        }
      }
    }

    // 原地改写而非重新绑定：currentMessages 被 executeSingleToolCall 以同名形参捕获，
    // 若在工具执行中途（如 plan_task 汇总后）重新赋值，会让协程后续 push 落到已丢弃的旧数组
    // 造成消息丢失（含 tool 结果与子任务汇总），故保持数组引用恒定
    currentMessages.splice(0, currentMessages.length, ...systemMsg, ...rest);
    const newTokens = est(currentMessages);
    logger.debug(`[Background] ReAct Token trimming: ${oldTokens} → ${newTokens} tokens (${oldLen} → ${currentMessages.length} )`);
  };

  const executionLog = [...initialLog];
  let currentSubtaskIndex = null;
  let subtaskPlan = null;
  // 任务状态锚点：plan_task 拆解后维护，每次 API 调用前回灌计划进度，
  // 防止长任务上下文被压缩/摘要后模型丢失目标与进度（业界 todo 锚点实践）
  // 恢复时从 resumeState 回灌 checkpoint 中的计划状态
  let taskState = resumeState?.taskState || null;
  if (resumeState?.subtaskPlan) subtaskPlan = resumeState.subtaskPlan;
  // 子任务完成进度（键 = String(subtask.id)）：每个子任务成功即实时记录并强制落 checkpoint，
  // 中断恢复后 executeSubtasks 据此跳过已完成子任务，防止写操作子任务被二次执行（防重放）。
  // 恢复时从 checkpoint 回灌；键经 JSON 序列化恒为字符串，查询处用 String(subtask.id) 归一化
  const subtaskProgress = new Map(Object.entries(resumeState?.subtaskProgress || {}));

  /**
   * 构建任务进度锚点消息（瞬态注入：不写入 currentMessages，不受 trim 裁剪、不累积）
   */
  const buildPlanAnchorMessage = () => {
    // checkpoint 回灌的 taskState 可能损坏/旧版：无有效 subtasks 时返回 null，
    // 由调用处判空跳过注入，避免恢复流程因结构异常抛错终止整个循环
    if (!taskState || !Array.isArray(taskState.subtasks) || taskState.subtasks.length === 0) return null;
    const doneCount = taskState.subtasks.filter(s => s.status === 'done').length;
    const lines = taskState.subtasks.map(s => `${s.index}. ${s.name} — ${s.status}`).join('\n');
    const desc = String(taskState.taskDescription || '').slice(0, 300);
    return {
      role: 'user',
      content: `[System Notice] Current task plan progress (system-maintained state; if earlier context was compacted, trust this as the source of truth. Strategy: ${taskState.strategy}, ${doneCount}/${taskState.subtasks.length} completed):\nOverall task: ${desc}\n${lines}\nDo not repeat steps already completed; continue with the pending ones.`
    };
  };

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
      logger.debug(`[Background] saveCheckpointNow skip (subtask): reason=${reason}`);
      return;
    }
    if (!sessionId) {
      logger.warn('[Background] saveCheckpointNow skip (sessionId empty)');
      return;
    }

    const now = Date.now();
    if (!force && now - lastCheckpointSaveTime < CHECKPOINT_THROTTLE_MS) {
      logger.debug(`[Background] saveCheckpointNow throttlestreamskip: reason=${reason}, since last save ${now - lastCheckpointSaveTime}ms < ${CHECKPOINT_THROTTLE_MS}ms`);
      return;
    }
    lastCheckpointSaveTime = now;

    // checkpoint 只保留窗口内日志，与内存保持一致，避免全量日志的序列化压力
    trimExecutionLogMemory(executionLog, lastSentLogSnapshot);

    logger.debug(`[Background] saveCheckpointNow start saving: sessionId=${sessionId}, reason=${reason}, force=${force}, iteration=${iteration}, messages=${currentMessages.length}, callId=${callId}`);

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
      taskState,
      subtaskProgress: Object.fromEntries(subtaskProgress),
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
  // 轮次上限只承担"防单个循环无限执行"职责：子任务与主任务沿用同一份设置页配置，
  // 总量失控由时限兜底（子任务超时实时读父任务剩余时间，见 subtaskLoopTimeoutMs）+ 循环检测器
  const maxIterations = reactConfig.maxIterations;
  const apiTimeout = reactConfig.apiTimeout;
  // 子任务/子代理整体超时：不超过 SUBTASK_LOOP_TIMEOUT_MS；若父任务经 apiParams.subtaskLoopTimeoutMs
  // 注入了更紧的预算（父任务实时剩余时间），则再取其 min，防止顺序子任务累计耗时冲破父任务时限
  const loopTimeout = taskContext
    ? Math.min(reactConfig.loopTimeout, SUBTASK_LOOP_TIMEOUT_MS, apiParams.subtaskLoopTimeoutMs || SUBTASK_LOOP_TIMEOUT_MS)
    : reactConfig.loopTimeout;
  const toolTimeout = reactConfig.toolTimeout;
  const clarifyTimeout = reactConfig.clarifyTimeout;
  
  // 子任务禁用流式输出（子任务的流式消息会干扰主任务的流式 UI 状态）
  // 子任务的执行日志通过 onLogUpdate 回调传递给父任务，无需流式显示
  // 同时兼容 plan_task 子任务（taskContext.subtaskId）和 dispatch_task 子 Agent（taskContext.type === 'subagent'）
  const isSubtask = taskContext && (taskContext.subtaskId || taskContext.type === 'subagent');
  const streamConfig = isSubtask
    ? { ...config.streamConfig, streamEnabled: false }
    : config.streamConfig;

  logger.debug('[Background] reactLoop configuration:', reactConfig);
  logger.debug('[Background] reactLoop received tool column table:', tools.map(t => t.function.name), 'count:', tools.length);
  logger.debug('[Background] reactLoop tasktext:', taskContext ? `subtask ${taskContext.subtaskId || ' no '} (${taskContext.subtaskName || 'maintask'})` : ' no ');
  
  /**
   * 发送实时执行状态更新消息（200ms 节流，子任务大量执行时防止消息拥塞）
   */
  let lastStatusSendTime = 0;
  let lastSentNodeName = '';
  // 跟踪已发送的执行日志条目，用于增量发送避免 64MiB 限制
  const lastSentLogSnapshot = new Map(); // id -> { status, nodeName }
  function sendExecutionStatusUpdate(nodeName, status) {
    try {
      // 内存窗口裁剪：发送前封顶日志，防止长任务期间无限增长
      trimExecutionLogMemory(executionLog, lastSentLogSnapshot);
      const now = Date.now();
      
      // 回调通知父任务：传递窗口内的完整日志（父任务需要完整日志进行合并）
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
        logger.debug('[Background] sendexecution statusupdate failed:', err.message);
      });
    } catch (e) {
      logger.debug('[Background] sendexecution statusupdate exception:', e.message);
    }
  }
  
  // 整体循环超时控制 - 使用动态调整机制
  const loopStartTime = Date.now();
  let totalPausedDuration = 0;  // 累计暂停时长（澄清等待时间不计入）
  let pauseStartTime = null;    // 暂停开始时刻
  let isPaused = false;         // 是否处于暂停状态
  
  // 发送初始状态
  sendExecutionStatusUpdate(t('reactLoop.preparing'), 'processing');

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
      logger.debug('[Background] overall looptimeoutpaused');
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
      
      logger.debug('[Background] overall looptimeoutrestored,pause duration:', Math.round(pauseDuration / 1000), 's,remaining time:', Math.round(getRemainingTime() / 1000), 's');
    }
  }
  
  // 再次清除取消状态，防止在 await getStoredConfig() 等异步操作期间
  // 收到前一个请求残留的 CANCEL_REACT 消息导致的误取消
  resetReactCancel(sessionId || tabId);

  // 任务是否正常完成（用于 finally 决定是否清理 checkpoint）
  let taskCompleted = false;

  // 上下文超限（400）自愈计数：至多允许 CONTEXT_HEAL_MAX_ATTEMPTS 次强制裁剪重发，
  // 逐档更激进；防止重试风暴，同时避免一次性自愈复发即猝死
  let contextHealAttempts = 0;

  try {
    while (iteration < maxIterations) {
      if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
        throw createErrorWithLog(t('bg.reactCancelled'), executionLog);
      }
      
      // 检查超时（使用动态调整后的超时时间）
      const elapsedTime = Date.now() - loopStartTime;
      const adjustedTimeout = loopTimeout + totalPausedDuration;
      if (elapsedTime > adjustedTimeout) {
        throw createErrorWithLog(t('reactLoop.loopTimeout', { timeout: loopTimeout }), executionLog);
      }
      
      iteration++;
      // 递增 API 调用计数器（预筛选已经用了第1次）
      incrementDialogApiCallCount(sessionId);
      const remainingTime = adjustedTimeout - elapsedTime;
      logger.debug(`[Background] ReAct loopstep ${iteration}  times,remaining time: ${Math.round(remainingTime / 1000)}s (paused: ${Math.round(totalPausedDuration / 1000)}s)`);
      
      let response;
      const apiCallStartTime = Date.now();
      
      // 动态提示注入防御：消息历史中存在不可信包装内容时，向 system 注入安全合约
      // （幂等 + 会话粘性；无包装内容时零开销返回原引用）
      currentMessages = applyUntrustedContract(currentMessages, getContractText());

      // 过滤消息中的内部字段，确保消息格式符合 API 要求
      let filteredMessages = filterApiMessages(currentMessages);
      
      // 剥离历史消息中的旧图片数据，只保留最后一条消息的图片
      // 当图片已经被识别处理后，后续 API 调用不需要再携带 Base64 编码
      for (let i = 0; i < filteredMessages.length - 1; i++) {
        filteredMessages[i] = { ...filteredMessages[i], content: stripImagesFromContent(filteredMessages[i].content) };
      }

      // 任务锚点/收敛提示注入已移到上下文压力裁剪之后（防止被 filterApiMessages 重建覆盖）
      
      // 添加 API 调用开始的日志节点（状态为 processing）
      const apiLogId = crypto.randomUUID();
      const currentCount = getDialogApiCallCount(sessionId);
      
      // 如果工具集中包含 plan_task，展示当前可用工具即可（Agent 已做了工具过滤）
      // 不再展开为全量工具，避免绕过 Agent 的工具限制
      const hasPlanTask = tools.some(t => t.function?.name === 'plan_task');
      const apiTools = tools;
      if (hasPlanTask) {
        logger.debug('[Background] current iterationcontains plan_task,using Agent limittool into  task decomposition,tool count :', apiTools.length);
      }

      // 上下文压力评估与主动裁剪：在每次 API 调用前检查并防止超限
      // 使用校准后的 token 估算，避免因 JSON/代码内容的估算偏差导致 API 超限
      const rawFilteredTokens = estimateMessagesTokens(filteredMessages);
      const filteredTokens = getCalibratedTokens(rawFilteredTokens);
      const contextWindow = getContextWindow(model || config.modelName, 0, chatConfig.customModelMap);
      
      // 计算实际工具定义 token 数（而非估算值）
      const rawToolTokens = estimateTokens(
        JSON.stringify(apiTools.map(t => { const { id, ...clean } = t; return clean; }))
      );
      const actualToolTokens = getCalibratedTokens(rawToolTokens);
      const totalEstimate = filteredTokens + actualToolTokens + 4096; // +输出预留
      // 保存不含输出预留的原始估算值，用于后续与 API 实际 prompt_tokens 对比校准
      const preCallPromptEstimate = rawFilteredTokens + rawToolTokens;
      const pressure = assessContextPressure(totalEstimate, contextWindow);
      
      if (pressure.level !== 'safe') {
        logger.warn(`[Background] context pressure: ${pressure.level} (${Math.round(pressure.ratio * 100)}% used, message: ${filteredTokens}, tool: ${actualToolTokens}, estimated total: ${totalEstimate}/${contextWindow} tokens)`);
        
        // 当总预估超过上下文窗口 85%，主动裁剪消息以留出安全余量
        if (pressure.level === 'critical' || totalEstimate > contextWindow * 0.85) {
          const reactBudget = getReactTokenBudget(model || 'default');
          const targetBudget = Math.floor(reactBudget * 0.75); // 裁剪到预算的 75%
          logger.warn(`[Background] context pressure too high,maindynamictrimmingmessage: current ${filteredTokens} tokens → target budget ${targetBudget}`);
          const trimmed = trimMessagesByBudget(currentMessages, Math.max(targetBudget, 2000));
          if (trimmed.trimmedCount > 0) {
            currentMessages = trimmed.messages;
            filteredMessages = filterApiMessages(currentMessages);
            // 重新剥离历史图片
            for (let i = 0; i < filteredMessages.length - 1; i++) {
              filteredMessages[i] = { ...filteredMessages[i], content: stripImagesFromContent(filteredMessages[i].content) };
            }
            logger.warn(`[Background] maindynamictrimmingcomplete: ${trimmed.trimmedCount} messageremove,remaining ${currentMessages.length} , ${estimateMessagesTokens(filteredMessages)} tokens`);
          }
        }
      }
      
      // 任务状态锚点与收敛提示：瞬态注入到 filteredMessages 末尾（append 在最后不破坏
      // assistant(tool_calls)+tool 配对）。必须在上下文压力裁剪块之后注入，否则 pressure
      // critical 分支的 filterApiMessages 重建会覆盖掉注入（恰好在最需要保留进度的轮次失效）
      if (taskState && !isSubtask) {
        const anchorMsg = buildPlanAnchorMessage();
        if (anchorMsg) filteredMessages = [...filteredMessages, anchorMsg];
      }
      const convergeAt = Math.ceil(maxIterations * 0.8);
      if (iteration >= convergeAt && (iteration - convergeAt) % 10 === 0) {
        filteredMessages = [...filteredMessages, {
          role: 'user',
          content: `[System Notice] Iteration budget warning: ${iteration}/${maxIterations} rounds used. Start converging now: stop exploratory tool calls and produce the best possible final answer based on the information already gathered. If the goal cannot be fully reached, summarize the completed parts and clearly state what remains.`
        }];
      }

      executionLog.push({
        id: apiLogId,
        iteration: iteration,
        globalIteration: currentCount,
        timestamp: new Date().toISOString(),
        status: 'processing',
        nodeType: 'api_call',
        nodeName: t('reactLoop.apiCallNode', { count: currentCount, subtask: taskContext ? t('reactLoop.apiCallSubtask', { iteration }) : '' }),
        apiRequest: {
          messageCount: filteredMessages.length,
          toolCount: apiTools.length
        }
      });
      
      // 发送 API 调用状态
      sendExecutionStatusUpdate(t('reactLoop.apiCallNode', { count: currentCount, subtask: taskContext ? t('reactLoop.apiCallSubtask', { iteration }) : '' }), 'processing');
      
      // 外层超时 watchdog，需在 try/catch 外层声明以便 catch 块中清理
      let outerWatchdog;

      try {
        const apiUrl = `${config.apiBase}/chat/completions`;
        logger.debug('[Background] API requesttool count  count :', apiTools.length);
        
        const requestBody = {
          model: model || config.modelName,
          messages: sanitizeImageUrlsForApi(filteredMessages),
          tools: apiTools.map(t => {
            const { id, ...clean } = t;
            return clean;
          }),
          stream: streamConfig.streamEnabled !== false
        };
        
        // 流式模式下请求包含 usage 统计（用于 Token 消耗展示）
        if (requestBody.stream) {
          requestBody.stream_options = { include_usage: true };
        }
        
        logger.debug('[Background] API requestbody stream mode:', requestBody.stream, 'tool count  count :', requestBody.tools.length, 'messagecount:', requestBody.messages.length, 'model:', requestBody.model);
        
        // 添加 temperature 和 top_p 参数
        if (apiParams.temperature !== undefined) {
          requestBody.temperature = apiParams.temperature;
        }
        if (apiParams.top_p !== undefined) {
          requestBody.top_p = apiParams.top_p;
        }
        
        // 使用带重试和超时的 fetch
        // 外层超时保护：独立 setTimeout watchdog，防止 fetchWithRetry 因 AbortSignal bug 永久挂起。
        // 注意：此 watchdog 仅覆盖 fetchWithRetry（建立连接+重试）阶段——它在下方 fetchWithRetry
        // 返回后即被 clearTimeout，不覆盖流式读取（流式卡住由 readSSEStream 的空闲超时保护）。
        // 合理上限 = 单次超时 ×(重试次数+1)+ 退避缓冲，而非整个循环剩余时间
        // （旧实现用 remainingTime-30s，任务初期兜底长达近 2 小时，形同虚设）。
        const retrySpan = apiTimeout * (reactConfig.apiRetryCount + 1) + 30000;
        const outerTimeoutMs = Math.max(apiTimeout, Math.min(retrySpan, remainingTime));
        outerWatchdog = setTimeout(() => {
          logger.warn(`[Background] ⚠️ API call outertimeoutprotection triggered (${Math.round(outerTimeoutMs / 1000)}s),force abort`);
          abortController?.abort();
        }, outerTimeoutMs);

        // 在 API 调用前发送 STREAM_START，让前端在等待响应时显示"思考中"状态
        if (streamConfig.streamEnabled !== false) {
          chrome.runtime.sendMessage({
            type: 'STREAM_START',
            sessionId: sessionId,
            callId: callId
          }).catch(() => {});
          logger.debug('[Background] STREAM_START sent (API call with  before )');
        }

        const fetchResponse = await fetchWithRetry(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: abortSignal
        }, apiTimeout, reactConfig.apiRetryCount, reactConfig.apiRetryBaseDelay, (retryAttempt, retryError, delay) => {
          logger.warn(`[Background] API retry (${retryAttempt}/${reactConfig.apiRetryCount}) scheduled in ${delay}ms:`, retryError.message);
          // 通知前端显示重试状态（"思考中"状态行就地更新为"重试中"）
          chrome.runtime.sendMessage({
            type: 'API_RETRYING',
            sessionId: sessionId,
            callId: callId,
            attempt: retryAttempt,
            maxRetries: reactConfig.apiRetryCount,
            delay: delay
          }).catch(() => {});
        });
        clearTimeout(outerWatchdog);

        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text();
          logger.error('[Background] API response error:', fetchResponse.status, errorText);
          throw new Error(`HTTP error! status: ${fetchResponse.status}, message: ${errorText.substring(0, 500)}`);
        }

        // 流式模式：读取 SSE 流
        if (streamConfig.streamEnabled !== false && fetchResponse.body) {
          logger.debug('[Background] enteringstreamingmode,streamEnabled:', streamConfig.streamEnabled);
          const streamController = new StreamController(sessionId, streamConfig, { callId, preStarted: true });
          const streamResult = await readSSEStream(fetchResponse.body.getReader(), streamController, abortSignal);
          logger.debug('[Background] streaming API responsecomplete,content length:', streamResult.content.length, 'tool_calls:', streamResult.toolCalls?.length, 'usage:', streamResult.usage);
          
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
          logger.debug('[Background] API responsestate:', fetchResponse.status, 'originaltext length:', responseText.length, 'preview:', responseText.substring(0, 200));

          try {
            response = JSON.parse(responseText);
          } catch (parseError) {
            logger.error('[Background] JSON parse failed:', parseError);
            logger.error('[Background] originalresponse:', responseText);
            throw new Error(t('reactLoop.apiInvalidJson', { status: fetchResponse.status, error: parseError.message, preview: responseText.substring(0, 100) }));
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
        // 区分用户取消（AbortError）、流式空闲超时（StreamIdleTimeout）和真正的 API 错误
        const isAborted = error.name === 'AbortError';
        const isIdleTimeout = error.name === 'StreamIdleTimeout';

        // 上下文超限自愈：400 且错误信息含 context/token/too long 特征时，
        // 强制裁剪后重试本轮，而非直接终止整个循环；至多 CONTEXT_HEAL_MAX_ATTEMPTS 次，
        // 每次按 CONTEXT_HEAL_RATIOS 逐档更激进（无法再裁时 trimmedCount=0 → 落到下方抛错）
        if (!isAborted && !isIdleTimeout && contextHealAttempts < CONTEXT_HEAL_MAX_ATTEMPTS) {
          const msgText = String(error.message || '');
          if (/status: 400/.test(msgText) && /context|token|too long|length/i.test(msgText)) {
            const reactBudget = getReactTokenBudget(model || 'default');
            const healRatio = CONTEXT_HEAL_RATIOS[Math.min(contextHealAttempts, CONTEXT_HEAL_RATIOS.length - 1)];
            const healTarget = Math.max(Math.floor(reactBudget * healRatio), 2000);
            const healTrim = trimMessagesByBudget(currentMessages, healTarget);
            if (healTrim.trimmedCount > 0) {
              contextHealAttempts++;
              currentMessages = healTrim.messages;
              logger.warn(`[Background] context overflow detected on HTTP 400: force-trimmed ${healTrim.trimmedCount} messages to ${healTarget} tokens (heal ${contextHealAttempts}/${CONTEXT_HEAL_MAX_ATTEMPTS}), retrying this round`);
              // 收尾本轮 API 日志节点（避免前端卡在“执行中”）后重试
              const healIdx = executionLog.findIndex(l => l.id === apiLogId);
              if (healIdx !== -1) {
                executionLog[healIdx] = {
                  ...executionLog[healIdx],
                  duration: Date.now() - apiCallStartTime,
                  status: 'success',
                  selfHeal: 'context_overflow_trim'
                };
              }
              sendExecutionStatusUpdate(t('reactLoop.apiCallNode', { count: currentCount, subtask: taskContext ? t('reactLoop.apiCallSubtask', { iteration }) : '' }), 'success');
              iteration--; // 以同一轮次号重试
              continue;
            }
          }
        }

        if (isAborted) {
          logger.debug('[Background] API call with by usercancel');
        } else if (isIdleTimeout) {
          logger.warn('[Background] API stream idle timeout:', error.message);
        } else {
          logger.error('[Background] API call with failed:', error.message || error);
        }
        
        // 用户可见的错误信息（空闲超时走 i18n 本地化）
        const userErrorMessage = isAborted
          ? t('bg.requestCancelled')
          : isIdleTimeout
            ? t('reactLoop.streamIdleTimeout', { seconds: Math.round((error.idleMs || STREAM_IDLE_TIMEOUT_MS) / 1000) })
            : error.message;
        
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
            error: isAborted ? t('reactLoop.userCancelled') : userErrorMessage
          };
        }
        
        throw createErrorWithLog(userErrorMessage, executionLog);
      }
      
      // 更新成功的 API 调用日志
      const apiCallDuration = Date.now() - apiCallStartTime;
      const assistantMessage = response.choices?.[0]?.message;
      const finishReason = response.choices?.[0]?.finish_reason;
      
      // 如果内容被截断，记录警告（循环仍继续，让模型在下一轮处理）
      if (finishReason === 'length') {
        logger.warn(`[Background] API response reason  token limit truncated (finish_reason: length),contentmay be incomplete`);
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

        // 实时校准 token 估算器：用 API 实际 prompt_tokens 修正我们的字符估算
        if (preCallPromptEstimate > 0 && response.usage.prompt_tokens > 0) {
          updateCalibration(preCallPromptEstimate, response.usage.prompt_tokens);
          const calInfo = getCalibrationInfo();
          if (calInfo.active) {
            logger.debug(`[Background] Tokencalibration activated: factor=${calInfo.factor.toFixed(3)}, samples=${calInfo.samples}`);
          }
        }
      }

      // 推送 API 调用成功状态更新
      sendExecutionStatusUpdate(t('reactLoop.apiCallNode', { count: currentCount, subtask: taskContext ? t('reactLoop.apiCallSubtask', { iteration }) : '' }), 'success');
      
      // 检查是否有工具调用
      if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
        logger.debug('[Background] recei to tool call:', assistantMessage.tool_calls);
        
        // 计算本轮工具调用的入参指纹（仅用于日志排查；循环判定由 loop-detector 在轮末基于记录完成）
        const currentInputFingerprint = JSON.stringify(
          assistantMessage.tool_calls.map(tc => ({
            name: tc.function?.name || tc.name,
            args: typeof tc.function?.arguments === 'string'
              ? (() => { try { return JSON.parse(tc.function.arguments); } catch { return tc.function.arguments; } })()
              : tc.function?.arguments || {}
          }))
        );
        logger.debug('[Background] this roundtool callinput fingerprint:', currentInputFingerprint.substring(0, 200));
        
        // 快照本轮 tool_calls 声明顺序（id→序号）。trimMessages 的兜底权重裁剪在删除孤立
        // tool 消息后会原地 `delete assistant.tool_calls`，而 rest 数组元素与 assistantMessage
        // 是同一引用；若到轮末重排时再实时读 assistantMessage.tool_calls 会拿到 undefined 崩溃。
        // 此处在可能被裁剪前先把声明顺序固化，供重排使用
        const roundToolCallOrder = assistantMessage.tool_calls.map((tc, i) => [tc.id, i]);
        currentMessages.push(assistantMessage);
        await trimMessages();
        
        const reflectionConfig = reactConfig.reflection;
        
        /**
         * 执行单个工具调用，返回执行结果
         * 处理：取消检查、工具执行（含超时）、clarify_question 暂停/恢复、
         * 结果格式化、缓存、执行日志更新、plan_task 子任务延续
         */
        async function executeSingleToolCall(toolCall, tabId, toolTimeout, loopTimeout, clarifyTimeout, sessionId, iteration, executionLog, currentMessages) {
          // 在每个工具执行前检查是否已取消
          if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
            throw createErrorWithLog(t('bg.reactCancelled'), executionLog);
          }
          
          const toolName = toolCall.function?.name || toolCall.name;
          const toolStartTime = Date.now();
          // 防御：arguments 可能是 string 或已解析的 object
          const rawArgs = toolCall.function?.arguments;
          logger.debug('[Background] executeSingleToolCall recei to tool call:', JSON.stringify({ name: toolName, argsType: typeof rawArgs, argsRaw: typeof rawArgs === 'string' ? rawArgs.substring(0, 200) : JSON.stringify(rawArgs).substring(0, 200), id: toolCall.id }));
          const toolArgs = (() => {
            if (!rawArgs) return {};
            if (typeof rawArgs === 'object') return rawArgs;
            try { return JSON.parse(rawArgs || '{}'); } catch { return {}; }
          })();
          // 防御：流式模式下 tool_call.id 可能为空，用 index 生成回退 id
          const toolCallId = toolCall.id || `tc_fallback_${crypto.randomUUID()}`;
          // 本轮 tool_calls 中的声明序号：并行路径下 loopRecords 的 push 顺序 = 协程完成顺序，
          // 而检测器的 refEnum 步进 / 振荡尾迹判定依赖声明顺序，flush 前须按此序号重排
          const callOrder = assistantMessage.tool_calls.indexOf(toolCall);
          
          // 检查是否需要用户确认（敏感操作 + 开关开启）
          // 1. 工具级确认（requiresConfirmation: true）
          // 2. action 级确认（合并工具的特定 action，如 manage_tab 的 close）
          const toolLevelConfirm = CONFIRMATION_REQUIRED_TOOLS.has(toolName);
          const actionLevelConfirm = CONFIRMATION_ACTION_MAP[toolName]?.includes(toolArgs.action);
          const needsConfirmation = (toolLevelConfirm || actionLevelConfirm) && reactConfig.toolConfirmationEnabled;
          if (needsConfirmation) {
            // 如果该会话已获得"当前任务放行"，跳过确认
            if (hasLoopApproval(sessionId)) {
              logger.debug(`[Background] session ${sessionId} got currenttaskallow,skip confirm: ${toolName}`);
            } else {
              // 暂停整体循环超时 + 通知前端暂停单次请求超时
              // （等待用户确认的时间不应计入超时，与 clarify_question 行为一致）
              pauseLoopTimer();
              chrome.runtime.sendMessage({
                type: 'TOOL_CONFIRM_START',
                ...(sessionId ? { sessionId } : {})
              }).catch(err => {
                logger.debug('[Background] send TOOL_CONFIRM_START message failed:', err.message);
              });

              let confirmed;
              try {
                confirmed = await requestToolConfirmation(toolName, toolArgs, tabId, sessionId, toolCall?.id || null);
              } finally {
                // 无论确认/拒绝/超时，都恢复超时计时
                resumeLoopTimer();
                chrome.runtime.sendMessage({
                  type: 'TOOL_CONFIRM_END',
                  ...(sessionId ? { sessionId } : {})
                }).catch(err => {
                  logger.debug('[Background] send TOOL_CONFIRM_END message failed:', err.message);
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
                  nodeName: t('reactLoop.toolExec', { name: toolName }),
                  action: { name: toolName, params: toolArgs },
                  error: t('reactLoop.userDenied')
                });
                sendExecutionStatusUpdate(t('reactLoop.toolExec', { name: toolName }), 'cancelled');
                // 推送工具拒绝响应到消息历史，确保 assistant(tool_calls) 后面有对应的 tool 消息
                currentMessages.push({
                  role: 'tool',
                  content: 'The user declined this operation.',
                  tool_call_id: toolCallId
                });
                loopRecords.push({ order: callOrder, name: toolName, args: toolArgs, result: { success: false, declined: true } });
                await trimMessages();
                return {
                  toolCall,
                  result: { success: false, content: 'The user declined this operation.', error: 'user_denied' },
                  toolResultStr: 'The user declined this operation.',
                  toolLogEntry: {
                    id: toolLogId,
                    iteration,
                    timestamp: new Date().toISOString(),
                    status: 'cancelled',
                    nodeType: 'tool_exec',
                    nodeName: t('reactLoop.toolExec', { name: toolName }),
                    action: { name: toolName, params: toolArgs },
                    error: t('reactLoop.userDenied')
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
                // 缓存命中同样喂入检测器：被替换的旧指纹逻辑不依赖 tool 消息即可识别重复调用，
                // 若不记录则 TTL 内模型重发同一调用将完全不可见（重复检测能力回退）
                loopRecords.push({ order: callOrder, name: toolName, args: toolArgs, result: cached.toolResult ?? { fromCache: true } });
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
            nodeName: t('reactLoop.toolExecStart', { name: toolName })
          });
          
          // 发送工具执行状态
          sendExecutionStatusUpdate(t('reactLoop.toolExecStart', { name: toolName }), 'processing');
          
          // 如果是澄清工具，暂停整体循环超时计时
          if (toolName === 'clarify_question') {
            pauseLoopTimer();
            chrome.runtime.sendMessage({
              type: 'CLARIFY_START',
              ...(sessionId ? { sessionId } : {})
            }).catch(err => {
              logger.debug('[Background] send CLARIFY_START message failed:', err.message);
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
                logger.debug('[Background] send CLARIFY_END message failed:', err.message);
              });
              
              // P2-10：clarify 后不再重新预筛选工具集 —— 保持工具集任务级稳定，
              // 避免每轮 tools 参数变化打爆 KV cache/提示缓存（预筛选本就默认关闭，
              // 重筛收益存疑而缓存代价明确）；新信息已通过用户补充消息本身传达给模型
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
              // 优先尝试卸载到 Agent workspace（保留完整信息可回读），失败时回退智能截断
              const offloaded = await offloadLargeToolResult(toolResultStr, toolName, toolCallId);
              if (offloaded) {
                logger.debug(`[Background] tool ${toolName} result offloaded: ${resultTokens} → ${estimateTokens(offloaded)} tokens`);
                toolResultTruncated = true;
                toolResultForDisplay = offloaded;
                toolResultStr = offloaded;
              } else {
                // 自动检测内容类型，智能截断
                const truncated = truncateContentSmart(toolResultStr, MAX_TOOL_RESULT_TOKENS);
                logger.debug(`[Background] tool ${toolName} result truncated: ${resultTokens} → ${estimateTokens(truncated)} tokens`);
                toolResultTruncated = true;
                toolResultForDisplay = truncated;
                toolResultStr = truncated;
              }
            }

            // 发送工具结果到 Side Panel 展示（使用截断后的内容）
            // 子任务禁用流式输出，不发送 STREAM_TOOL_RESULT（子任务通过 EXECUTION_STATUS_UPDATE 汇报状态）
            // 与下方失败分支保持一致，避免子任务工具结果泄漏到主 UI
            if (!isSubtask) {
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
            }

            // 统计本轮已落定的失败数（含失败分支先行落定的当前调用）。
            // 不用"连续失败"口径：并行组内同轮其它工具可能尚未落定/乱序 push，
            // 从尾部回溯会因 processing 提前 break 导致少计（#11）
            const roundFailCount = executionLog
              .filter(e => e.nodeType === 'tool_exec' && e.iteration === iteration && e.status === 'failed')
              .length;
            
            // 工具级观察提示（P2-9：替代独立 LLM 调用的工具级反思，零成本规则内联）
            const observationHint = getToolObservationHint({
              success: isToolSuccess,
              roundFailCount,
              resultTokens,
              truncated: toolResultTruncated,
              resultStr: toolResultStr
            });
            
            // 处理任务规划工具的结果，提取子任务列表
            if (toolName === 'plan_task' && toolResult && toolResult.success && toolResult.data) {
              subtaskPlan = toolResult.data;
              logger.debug('[Background] received taskplanresult:', JSON.stringify(subtaskPlan));

              // 初始化任务状态锚点（父循环被 executeSubtasks 阻塞，完成后按结果更新）
              taskState = {
                taskDescription: subtaskPlan.taskDescription || '',
                strategy: subtaskPlan.strategy || 'sequential',
                subtasks: subtaskPlan.subtasks.map((st, i) => ({ id: st.id, index: i + 1, name: st.name, status: 'pending' }))
              };
              
              // 先添加 plan_task 工具的响应消息（必须先响应工具调用）
              const planTaskContent = JSON.stringify({
                success: true,
                message: `Task planning complete. Decomposed into ${subtaskPlan.subtasks.length} subtasks.`,
                data: subtaskPlan
              });
              currentMessages.push({
                role: 'tool',
                content: planTaskContent,
                tool_call_id: toolCallId
              });
              loopRecords.push({ order: callOrder, name: toolName, args: toolArgs, result: toolResult });
              await trimMessages();
              
              // 更新工具执行日志
              const toolLogIndex = executionLog.findIndex(log => log.id === toolLogId);
              if (toolLogIndex !== -1) {
                executionLog[toolLogIndex] = {
                  ...executionLog[toolLogIndex],
                  duration: Date.now() - toolStartTime,
                  status: 'success',
                  nodeName: t('reactLoop.taskPlanDone'),
                  action: {
                    name: toolName,
                    params: toolArgs
                  },
                  observation: t('reactLoop.subtaskCount', { count: subtaskPlan.subtasks.length }),
                  subtaskCount: subtaskPlan.subtasks.length,
                  strategy: subtaskPlan.strategy
                };
              }
              
              // 发送任务规划完成状态更新（让实时日志显示plan_task节点）
              sendExecutionStatusUpdate(t('reactLoop.taskPlanDone'), 'success');

              // ⚡ 关键修复：在 executeSubtasks 之前，为同轮中剩余未执行的工具补发 STREAM_TOOL_RESULT
              // 模型可能在一轮中同时调用 plan_task + 其他工具（如 browser_info、agent_file）
              // STREAM_TOOL_CALL 已为所有工具发送，前端已创建卡片。但 plan_task 执行后 break，
              // 其他工具不执行。如果不在此处补发，卡片会卡在"执行中"直到 executeSubtasks 完成（可能数分钟）
              const currentToolIdx = assistantMessage.tool_calls.findIndex(tc => tc.id === toolCallId);
              if (currentToolIdx !== -1 && currentToolIdx < assistantMessage.tool_calls.length - 1) {
                for (let j = currentToolIdx + 1; j < assistantMessage.tool_calls.length; j++) {
                  const skippedCall = assistantMessage.tool_calls[j];
                  const skippedName = skippedCall.function?.name || skippedCall.name || 'unknown';
                  const skippedId = skippedCall.id || `tc_fallback_${crypto.randomUUID()}`;
                  logger.debug('[Background] resend skiptool  STREAM_TOOL_RESULT:', skippedName, 'id:', skippedId);
                  // 为被跳过的工具添加 tool 消息，满足 API 的 tool_calls 配对要求
                  currentMessages.push({
                    role: 'tool',
                    content: JSON.stringify({ success: false, message: 'Skipped: plan_task has decomposed subtasks; other tool calls in this round will not be executed.' }),
                    tool_call_id: skippedId
                  });
                  loopRecords.push({ order: j, name: skippedName, args: parseToolCallArgs(skippedCall), result: { skipped: true } });
                  // 补发 STREAM_TOOL_RESULT 让前端卡片从"执行中"变为"已跳过"
                  if (!isSubtask) {
                    chrome.runtime.sendMessage({
                      type: 'STREAM_TOOL_RESULT',
                      sessionId,
                      result: {
                        toolCallId: skippedId,
                        toolName: skippedName,
                        success: false,
                        content: t('reactLoop.skippedAfterPlanTask'),
                        truncated: false,
                        duration: 0
                      }
                    }).catch(() => {});
                  }
                }
                await trimMessages();
              }

              // 开始执行子任务
              // 单子任务结果入进度/汇总的统一截断阈值（先声明供进度钩子 onDone 与下方汇总消息共用）
              const SUBTASK_RESULT_MAX_TOKENS = 3000;
              const subtaskResults = await executeSubtasks(
                subtaskPlan, model, tools, tabId, apiParams, sessionId, executionLog, globalIteration,
                reactConfig.reflection, config, lastSentLogSnapshot, callId, abortSignal,
                { remainingIterations: Math.max(1, maxIterations - iteration), getRemainingTimeMs: () => getRemainingTime(), historySummary: summarizedAccumulator || '' },
                {
                  progress: subtaskProgress,
                  onDone: async (r) => {
                    if (!r || !r.success) return;
                    // 成功子任务即时记入防重放进度（不存 executionLog，控制 checkpoint 体积；键归一化字符串）
                    const rawResult = typeof r.result === 'string' ? r.result : JSON.stringify(r.result ?? '');
                    subtaskProgress.set(String(r.subtaskId), {
                      success: true,
                      subtaskId: r.subtaskId,
                      subtaskName: r.subtaskName,
                      result: estimateTokens(rawResult) > SUBTASK_RESULT_MAX_TOKENS
                        ? truncateByTokens(rawResult, SUBTASK_RESULT_MAX_TOKENS)
                        : rawResult,
                      retryCount: r.retryCount || 0,
                    });
                    // 锚点同步标 done：恢复后的进度回灌提示模型不重复已完成步骤
                    if (taskState && Array.isArray(taskState.subtasks)) {
                      const st = taskState.subtasks.find(s => String(s.id) === String(r.subtaskId));
                      if (st) st.status = 'done';
                    }
                    // 强制立即落 checkpoint：SW 若在下一个子任务执行中被杀，进度已持久化
                    await saveCheckpointNow('subtask_completed', true);
                  },
                }
              );

              // 按子任务完成结果更新锚点状态
              if (taskState) {
                for (const r of subtaskResults) {
                  const st = taskState.subtasks.find(s => s.id === r.subtaskId || s.name === r.subtaskName);
                  if (st) st.status = r.success ? 'done' : 'failed';
                }
              }
              
              // plan_task 整轮完成：汇总消息已入 currentMessages，清空防重放进度，
              // 防止后续新一轮 plan_task 的同 id 子任务误复用旧结果；
              // 随后 saveCheckpointNow('plan_task_completed') 将以空进度落盘
              subtaskProgress.clear();
              
              // 子任务执行完毕后检查是否已被取消
              if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
                throw createErrorWithLog(t('bg.reactCancelled'), executionLog);
              }
              
              // 将所有子任务结果添加到消息历史
              // 使用 role: 'user' 而非 'system'，原因：
              //   1. OpenAI 兼容 API 规范要求 system 消息在开头，中间插入 system 可能被某些提供商拒绝
              //   2. trimMessages 的 systemMsg 提取逻辑（L502）只认第一条 system，中间的 system 会被当作普通消息裁剪
              //   3. user 消息在中间插入是合法的对话流，表示"系统提供的上下文信息"
              // 每个子任务结果截断至合理大小，避免汇总消息过大（阈值已在进度记录处声明）
              const subtaskSummary = subtaskResults.map((result, idx) => {
                const resultStr = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
                const truncated = estimateTokens(resultStr) > SUBTASK_RESULT_MAX_TOKENS
                  ? truncateByTokens(resultStr, SUBTASK_RESULT_MAX_TOKENS)
                  : resultStr;
                return `Subtask ${idx + 1}: ${result.subtaskName}\nResult: ${truncated}`;
              }).join('\n\n');
              
              currentMessages.push({
                role: 'user',
                content: `[System Context] The following are the execution results of the decomposed subtasks. Please summarize them and continue with the main task:\n\n${subtaskSummary}`
              });
              await trimMessages();
              
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
            
            // 添加工具结果到消息历史（附规则观察提示）
            // 注入防御：外部可写数据包装（UI/日志通道用原文，仅模型消息包装）
            currentMessages.push({
              role: 'tool',
              content: wrapUntrusted(toolName, toolResultStr, sessionId) + observationHint,
              tool_call_id: toolCallId,
              subtaskId: currentSubtaskIndex !== null ? `subtask_${currentSubtaskIndex}` : null,
              subtaskName: subtaskPlan?.subtasks[currentSubtaskIndex]?.name || null
            });
            loopRecords.push({ order: callOrder, name: toolName, args: toolArgs, result: toolResult });
            await trimMessages();
            
            logger.debug('[Background] toolexec result length:', toolResultStr.length, 'content preview:', toolResultStr.substring(0, 200));
            
            // 更新工具执行日志
            const toolLogIndex = executionLog.findIndex(log => log.id === toolLogId);
            if (toolLogIndex !== -1) {
              const logEntry = {
                ...executionLog[toolLogIndex],
                duration: Date.now() - toolStartTime,
                status: isToolSuccess ? 'success' : 'failed',
                nodeName: t('reactLoop.toolExec', { name: toolName }),
                action: {
                  name: toolName,
                  params: toolArgs
                },
                observation: isToolSuccess ? (toolResultStr.length > MAX_LOG_OBSERVATION_CHARS ? toolResultStr.substring(0, MAX_LOG_OBSERVATION_CHARS) + '...' : toolResultStr) : undefined,
                prototypeId: toolResult?.prototypeId || null
              };
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
            logger.warn('[Background] toolexecution failed (ReAct loop continue):', toolError.message);
            
            // 如果是澄清工具，恢复整体循环超时计时
            if (toolName === 'clarify_question') {
              resumeLoopTimer();
              chrome.runtime.sendMessage({
                type: 'CLARIFY_END',
                ...(sessionId ? { sessionId } : {})
              }).catch(err => {
                logger.debug('[Background] send CLARIFY_END message failed:', err.message);
              });
            }
            
            // 推送工具错误响应到消息历史，确保 assistant(tool_calls) 后面有对应的 tool 消息，
            // 避免后续 API 调用出现 400 "insufficient tool messages following tool_calls"
            const toolErrorContent = JSON.stringify({
              success: false,
              error: toolError.message || 'Tool execution error'
            });
            currentMessages.push({
              role: 'tool',
              content: toolErrorContent,
              tool_call_id: toolCallId,
              subtaskId: currentSubtaskIndex !== null ? `subtask_${currentSubtaskIndex}` : null,
              subtaskName: subtaskPlan?.subtasks[currentSubtaskIndex]?.name || null
            });
            loopRecords.push({ order: callOrder, name: toolName, args: toolArgs, result: { success: false, error: toolError.message || 'Tool execution error' } });
            await trimMessages();
            
            // 更新工具执行日志为失败
            const toolLogIndex = executionLog.findIndex(log => log.id === toolLogId);
            if (toolLogIndex !== -1) {
              executionLog[toolLogIndex] = {
                ...executionLog[toolLogIndex],
                duration: Date.now() - toolStartTime,
                status: 'failed',
                nodeName: t('reactLoop.toolExec', { name: toolName }),
                action: {
                  name: toolName,
                  params: toolArgs
                },
                error: toolError.message
              };
            }
            
            // 工具执行失败时返回错误结果而非 throw，让 ReAct 循环继续下一轮
            // 模型可以根据错误信息调整策略（如重试、换工具、或直接给出结论）
            logger.warn(`[Background] tool ${toolName} execution failed,ReAct loop continue:`, toolError.message);
            sendExecutionStatusUpdate(t('reactLoop.toolExec', { name: toolName }), 'failed');

            // 发送工具错误结果到 Side Panel 展示（更新 UI 中的工具卡片状态）
            // 子任务禁用流式输出，不发送 STREAM_TOOL_RESULT（子任务通过 EXECUTION_STATUS_UPDATE 汇报状态）
            if (!isSubtask) {
              chrome.runtime.sendMessage({
                type: 'STREAM_TOOL_RESULT',
                sessionId,
                result: {
                  toolCallId: toolCallId,
                  toolName,
                  success: false,
                  content: t('reactLoop.toolError', { message: toolError.message }),
                  truncated: false,
                  duration: Date.now() - toolStartTime
                }
              }).catch(() => {});
            }

            return {
              error: toolError.message,
              toolName,
              toolCallId: toolCallId,
              toolResult: { success: false, error: toolError.message },
              toolResultStr: JSON.stringify({ success: false, error: toolError.message })
            };
          }
        }
        
        // 轮内工具部分并行：连续的 parallelizable 工具合并为一组并发执行，
        // 非并行工具（含 plan_task/clarify_question 的独占语义）单独按序执行；
        // tool 消息最终仍按 tool_calls 声明顺序重排写回
        const isParallelizableTc = tc => PARALLELIZABLE_TOOLS.has(tc.function?.name || tc.name);
        const tcGroups = [];
        for (const tc of assistantMessage.tool_calls) {
          const parallel = isParallelizableTc(tc);
          const last = tcGroups[tcGroups.length - 1];
          if (last && last.parallel === parallel && parallel) {
            last.calls.push(tc);
          } else {
            tcGroups.push({ parallel, calls: [tc] });
          }
        }

        // 记录分组执行前的消息数量，用于后续按 tool_calls 顺序重排 tool 消息
        const msgCountBefore = currentMessages.length;
        let planTaskHandled = false;

        for (const group of tcGroups) {
          if (group.parallel && group.calls.length > 1) {
            // 同组并发执行；单个工具抛异常（如用户取消）时 Promise.all 直接传播，
            // 与原全并行路径语义一致
            logger.debug('[Background] parallel group exec tool calls:', group.calls.map(tc => tc.function?.name || tc.name));
            const parallelResults = await Promise.all(group.calls.map(toolCall =>
              executeSingleToolCall(toolCall, tabId, toolTimeout, loopTimeout, clarifyTimeout, sessionId, iteration, executionLog, currentMessages)
                .catch(err => ({ error: err.message }))
            ));
            for (const result of parallelResults) {
              if (result.error) {
                logger.warn(`[Background] parallel tool execution failed: ${result.error}`);
              }
              if (result.planTaskHandled) {
                planTaskHandled = true;
              }
            }
          } else {
            // 非并行工具（或组内仅 1 个）：按序单独执行
            for (const toolCall of group.calls) {
              const result = await executeSingleToolCall(toolCall, tabId, toolTimeout, loopTimeout, clarifyTimeout, sessionId, iteration, executionLog, currentMessages);
              if (result.planTaskHandled) {
                // plan_task 处理了子任务，同轮剩余工具不再执行（跳过补发已在内部完成）
                planTaskHandled = true;
                break;
              }
            }
          }
          if (planTaskHandled) break;
        }

        // 按 tool_calls 原始顺序重排本轮新追加的 tool 消息，
        // 确保 tool 消息顺序与 assistant(tool_calls) 中的声明顺序一致
        // 守卫：若执行中途 trimMessages 触发使数组收缩（currentMessages.length < msgCountBefore），
        // 边界快照已失效，此时新消息按完成顺序追加在尾部且配对由压缩逻辑维护，跳过重排以保证安全
        if (msgCountBefore <= currentMessages.length) {
          const newMessages = currentMessages.splice(msgCountBefore);
          // 使用 trim 前固化的声明顺序快照，避免 assistantMessage.tool_calls 已被兜底裁剪删除
          const toolCallOrder = new Map(roundToolCallOrder);
          const toolMessages = newMessages.filter(m => m.role === 'tool');
          const nonToolMessages = newMessages.filter(m => m.role !== 'tool');
          toolMessages.sort((a, b) => {
            const orderA = toolCallOrder.get(a.tool_call_id) ?? 999;
            const orderB = toolCallOrder.get(b.tool_call_id) ?? 999;
            return orderA - orderB;
          });
          // tool 消息必须紧跟 assistant(tool_calls)（OpenAI 兼容 API 的配对前提），
          // 故先 push toolMessages，再把非 tool 消息（如 plan_task 子任务汇总的 user 消息）追加其后；
          // 若反向把非 tool 提到 tool 前，会破坏相邻性 → 下一请求 400
          currentMessages.push(...toolMessages, ...nonToolMessages);
        }

        // 分组工具失败不终止循环，让模型在下一轮根据错误信息调整策略

        if (planTaskHandled) {
          flushLoopRecords();
          await saveCheckpointNow('plan_task_completed');
          continue;
        }

        // 多模式循环检测：轮末按序喂入本轮全部工具调用记录
        // （软提醒合并为一条注入 / 硬停直接 throw，详见 loop-detector.js）
        flushLoopRecords();

        // 工具执行完毕，保存 checkpoint（覆盖 plan_task 子任务执行后的状态）
        await saveCheckpointNow('tools_completed');
        continue;
      }
      
      const content = assistantMessage?.content || '';
      const reasoningContent = assistantMessage?.reasoning_content || null;
      logger.debug('[Background] ReAct loop complete,finalcontent length:', content.length);

      // 任务正常完成：先保存最终 checkpoint（供反思失败时仍可续接），然后清理
      await saveCheckpointNow('final_answer');
      
      // 任务正常完成后清理 checkpoint（只有中断时才保留 checkpoint）
      await clearCheckpoint(sessionId);

      // 后置反思：对最终答案进行质量评估
      const reflectionConfig = reactConfig.reflection;
      if (reflectionConfig?.enabled && reflectionConfig?.postReflection?.enabled && shouldReflect(executionLog, taskContext)) {
        logger.debug('[Background] triggered post-reflection...');
        const reflectionResult = await reflectOnResult(
          currentMessages, content, executionLog, model, config,
          reflectionConfig, tabId, sendExecutionStatusUpdate, globalIteration, taskContext, sessionId, totalReflectionRounds, abortSignal
        );

        // 合并反思日志
        if (reflectionResult.reflectionLog && reflectionResult.reflectionLog.length > 0) {
          executionLog.push(...reflectionResult.reflectionLog);
        }

        sendExecutionStatusUpdate(t('reactLoop.executionDone'), 'success');
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
      sendExecutionStatusUpdate(t('reactLoop.executionDone'), 'success');

      // 返回执行日志和内容
      taskCompleted = true;
      return { content, executionLog, reasoningContent };
    }

    const error = new Error(t('reactLoop.maxIterationsExceeded', { maxIterations }));
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
  DEFAULT_MAX_PARALLEL: 3,
};

// 子任务/子代理整体超时上限（ms）：防止单个子任务占用父任务全部时间预算
const SUBTASK_LOOP_TIMEOUT_MS = 900000; // 15 分钟

// 工具结果截断：单条工具结果最大 token 数，避免 page_content / fetch_url 等大结果撑爆上下文。
// 模块级：截断/卸载与观察提示（getToolObservationHint）同源引用，防止阈值漂移
const MAX_TOOL_RESULT_TOKENS = 6000;

// 上下文超限（400）自愈：允许至多 CONTEXT_HEAL_MAX_ATTEMPTS 次强制裁剪，
// 每次按 CONTEXT_HEAL_RATIOS 逐档更激进（60% → 45% → 30%），防止一次性
// 自愈后复发直接抛错导致长任务猝死；次数封顶避免无法再裁时的重试风暴。
const CONTEXT_HEAL_MAX_ATTEMPTS = 3;
const CONTEXT_HEAL_RATIOS = [0.6, 0.45, 0.3];

/**
 * 计算子任务的整体超时预算（ms）：在 SUBTASK_LOOP_TIMEOUT_MS 之外，
 * 再受父任务实时剩余时间约束。预留 10s 缓冲，并设 60s 下限，
 * 避免父任务末期子任务被即刻杀停。父剩余时间无效时回退到上限。
 * @param {number|undefined} parentRemainMs - 父任务当前剩余时间（ms）
 * @returns {number}
 */
export function computeSubtaskLoopTimeoutMs(parentRemainMs) {
  const remain = Number.isFinite(parentRemainMs) ? parentRemainMs : SUBTASK_LOOP_TIMEOUT_MS;
  return Math.max(60000, Math.min(SUBTASK_LOOP_TIMEOUT_MS, remain - 10000));
}

/**
 * 工具级观察提示（替代独立 LLM 调用的工具级反思，零成本内联规则）：
 * 失败/连续失败/空结果/超大结果时生成规则提示，追加到 tool 结果后引导模型自我调整。
 * 模型面文本固定英文（与工具 schema 语言一致）。
 * @param {Object} ctx
 * @param {boolean} ctx.success - 工具执行是否成功
 * @param {number} ctx.roundFailCount - 本轮已落定的失败数（含当前调用，若失败分支已先行落定）
 * @param {number} ctx.resultTokens - 截断前的结果 token 数
 * @param {boolean} ctx.truncated - 结果是否被截断/卸载
 * @param {string} ctx.resultStr - 结果文本（用于空结果判断）
 * @returns {string} 提示文本，无命中时返回空串
 */
export function getToolObservationHint({ success, roundFailCount = 0, resultTokens = 0, truncated = false, resultStr = '' }) {
  const hints = [];
  if (!success) {
    // 阈值与截断/卸载同源（MAX_TOOL_RESULT_TOKENS）：超过即已被压缩，旧 24000 硬编码
    // 会让 6000~24000 区间被截断的结果拿不到提示（#11）
    const failSuffix = roundFailCount >= 1 ? ` (this is failure #${roundFailCount + 1} in this round)` : '';
    hints.push(`the tool returned a failure${failSuffix}. Do NOT retry the exact same call — change arguments, pick a different tool, or state the limitation in your conclusion`);
  } else if (!String(resultStr).trim()) {
    hints.push('the result is empty. The target may not exist or the query was too narrow — try alternative keywords or a different data source');
  } else if (truncated && resultTokens > MAX_TOOL_RESULT_TOKENS) {
    hints.push(`the original result was very large (${resultTokens} tokens) and has been condensed. If you need full details, narrow the next query (e.g. by range/filter) or read the offloaded file if one is referenced`);
  }
  return hints.length > 0 ? `\n\n[Observation Hint] ${hints.join('; ')}.` : '';
}

/**
 * 并行子任务派发（并发受限池）。
 *
 * 修复背景：旧实现在 executeSubtasks 内联用 `executing.indexOf(Promise.race 解出的结果值)`
 * 定位待移除元素——数组存的是 Promise 对象、race 解出的是结果值，引用永不相等，
 * indexOf 恒 -1 → splice 从不执行 → 首个子任务完成后并发上限彻底失效，
 * 剩余子任务瞬间全量并发（同 tab 多路互踩 + API 429 风暴）。
 * 改为 Set + 完成自移除：size 恒等于真实在途并发数。
 *
 * 保留旧语义：
 * - beforeDispatch 返回 true（如用户取消）→ 停止派发并返回 true，不等待在途任务
 *   （与旧提前 return 一致：在途子任务会因各自会话的取消检查自行终止）；
 * - 任务 rejection 直接向调用方传播（保留 AbortError/取消直传路径）。
 *
 * @param {Array} items 待派发列表
 * @param {number} maxParallel 并发上限（非法值兜底 1，旧实现 Promise.race([]) 会永久挂起）
 * @param {(item, index) => Promise<any>} executeOne 单项执行器
 * @param {() => boolean} [beforeDispatch] 派发前检查，返回 true 停止整体派发
 * @returns {Promise<boolean>} 是否因 beforeDispatch 提前停止派发
 */
export async function dispatchSubtasksParallel(items, maxParallel, executeOne, beforeDispatch = null) {
  const cap = Math.max(1, Number(maxParallel) || 1);
  const inFlight = new Set();
  for (let i = 0; i < items.length; i++) {
    if (beforeDispatch && beforeDispatch()) return true;

    // 满额时等待：race 只会观测在途 promise；每个 promise 完成时自移除，size 恒为真实并发数
    if (inFlight.size >= cap) {
      await Promise.race(inFlight);
    }

    let tracked;
    tracked = executeOne(items[i], i).finally(() => inFlight.delete(tracked));
    inFlight.add(tracked);
    // 预挂 catch 处理器：避免提前停止派发后，无人等待的 rejection 产生 unhandledrejection 噪声；
    // race/all 观察的仍是 tracked 本体，传播语义不变
    tracked.catch(() => {});
  }
  await Promise.all(inFlight);
  return false;
}

/**
 * 执行子任务序列
 * 支持顺序执行、并行执行和依赖拓扑执行策略
 * 支持失败策略、重试机制和回滚机制
 */
export async function executeSubtasks(subtaskPlan, model, tools, tabId, apiParams, sessionId, parentExecutionLog, globalIteration = { value: 0 }, reflectionConfig = null, config = null, lastSentLogSnapshot = new Map(), callId = null, signal = null, parentBudget = null, progressHooks = null) {
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
    // 内存窗口裁剪：子任务合并日志增长快，发送前封顶父日志防止无限增长
    trimExecutionLogMemory(parentExecutionLog, lastSentLogSnapshot);
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
      ...(callId ? { callId } : {}),
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
  
  logger.debug('[Background] start executing subtask,strategy:', strategy, 'failedstrategy:', failureStrategy, 'maxretry:', maxRetries, 'count:', subtasks.length);
  
  // 按依赖关系排序（拓扑排序）
  const sortedSubtasks = strategy === 'dependency' 
    ? sortSubtasksByDependencies(subtasks) 
    : subtasks;

  // 权威子任务清单：让界面能展示"计划了哪些、还没执行到哪些"（顺序取拓扑排序后，
  // 与 subtaskIndex 语义严格一致）。条目走既有增量日志通道进面板，并随 executionLog
  // 持久化进消息记录，历史恢复无需额外协议字段。
  parentExecutionLog.push({
    id: crypto.randomUUID(),
    iteration: 0,
    timestamp: new Date().toISOString(),
    status: 'success',
    nodeType: 'subtask_plan',
    nodeName: t('reactLoop.subtaskPlanNode', { count: sortedSubtasks.length }),
    subtaskTotal: sortedSubtasks.length,
    strategy,
    taskDescription: taskDescription || '',
    items: sortedSubtasks.map((st, i) => ({ index: i, id: st.id, name: st.name, description: st.description || '' })),
  });
  sendSubtaskStatusUpdate(t('reactLoop.subtaskPlanNode', { count: sortedSubtasks.length }), 'success', parentExecutionLog);
  
  // 筛选每个子任务需要的工具（继承父任务工具范围）
  const toolSets = await prepareToolSetsForSubtasks(sortedSubtasks, tools);
  
  /**
   * 回滚已完成的子任务
   */
  async function rollbackCompletedTasks() {
    logger.debug('[Background] start rollback completed subtask');
    
    // 逆序回滚
    for (let i = completedSubtasks.length - 1; i >= 0; i--) {
      const { subtask, result } = completedSubtasks[i];
      
      if (typeof subtask.rollback === 'function') {
        try {
          logger.debug(`[Background] rollback subtask: ${subtask.name}`);
          await subtask.rollback(result);
          
          // 记录回滚日志
          parentExecutionLog.push({
            id: crypto.randomUUID(),
            iteration: 0,
            timestamp: new Date().toISOString(),
            status: 'rolledback',
            nodeType: 'subtask',
            nodeName: t('reactLoop.subtaskRolledBack', { name: subtask.name }),
            subtaskId: subtask.id,
            subtaskName: subtask.name
          });
          
          sendSubtaskStatusUpdate(t('reactLoop.subtaskRolledBack', { name: subtask.name }), 'rolledback', parentExecutionLog);
          
        } catch (rollbackError) {
          logger.error('[Background] rollback failed:', rollbackError.message);
          parentExecutionLog.push({
            id: crypto.randomUUID(),
            iteration: 0,
            timestamp: new Date().toISOString(),
            status: 'rollback_failed',
            nodeType: 'subtask',
            nodeName: t('reactLoop.subtaskRollbackFailed', { name: subtask.name }),
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
    // 防重放跳过分支：中断前已成功完成的子任务直接返回 checkpoint 记录结果，不重新执行
    // （写操作子任务二次执行有副作用；失败记录 success!==true 不命中，恢复后正常重跑）
    const recorded = progressHooks?.progress?.get(String(subtask.id));
    if (recorded && recorded.success) {
      logger.debug(`[Background] subtask ${subtask.name} already completed before interruption, skipping replay`);
      parentExecutionLog.push({
        id: crypto.randomUUID(),
        iteration: 0,
        timestamp: new Date().toISOString(),
        status: 'success',
        nodeType: 'subtask',
        nodeName: t('reactLoop.subtaskSkippedReplay', { index: subtaskIndex + 1, name: subtask.name }),
        subtaskId: subtask.id,
        subtaskName: subtask.name,
        subtaskIndex: subtaskIndex,
        skippedReplay: true,
      });
      sendSubtaskStatusUpdate(
        t('reactLoop.subtaskSkippedReplay', { index: subtaskIndex + 1, name: subtask.name }),
        'success', parentExecutionLog,
        { subtaskIndex, subtaskTotal: sortedSubtasks.length, subtaskName: subtask.name }
      );
      return { ...recorded, executionLog: [], skippedReplay: true };
    }

    const subtaskLogId = crypto.randomUUID();
    const taskGroup = `subtask_group_${subtaskIndex}`;
    let lastError = null;
    
    // 为子任务创建派生 sessionId，隔离流式消息（避免干扰主任务的流式输出状态）
    const subtaskSessionId = sessionId ? `${sessionId}_subtask_${subtaskIndex}` : null;

    // 登记 plan 子任务嵌套深度（与 dispatch_task 通道共享同一计数器）：
    // 使子任务内部再调用 dispatch_task 时从「父深度+1」起算，而非从 0 重新计数，
    // 杜绝跨通道叠加出 3~4 层嵌套。执行结束在 finally 统一清理，防止 Map 泄漏。
    setSubagentDepth(subtaskSessionId, getSubagentDepth(sessionId) + 1);

    try {
    // 添加子任务开始日志（包含任务组信息）
    parentExecutionLog.push({
      id: subtaskLogId,
      iteration: 0,
      timestamp: new Date().toISOString(),
      status: 'processing',
      nodeType: 'subtask',
      nodeName: t('reactLoop.subtaskNode', { index: subtaskIndex + 1, name: subtask.name }),
      subtaskId: subtask.id,
      subtaskName: subtask.name,
      subtaskIndex: subtaskIndex,
      description: subtask.description || '',
      taskGroup: taskGroup,
      taskGroupIndex: subtaskIndex + 1,
      taskGroupName: subtask.name,
      isSubtask: true
    });
    
    // 发送子任务开始状态
    sendSubtaskStatusUpdate(t('reactLoop.subtaskNode', { index: subtaskIndex + 1, name: subtask.name }), 'processing', parentExecutionLog, { taskGroup: taskGroup, subtaskIndex, subtaskTotal: sortedSubtasks.length, subtaskName: subtask.name });
    
    // 重试循环
    for (let retry = 0; retry <= maxRetries; retry++) {
      // 每次重试前检查是否已取消（使用原始 sessionId 检查取消状态）
      if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
        logger.debug('[Background] subtaskretryby usercancel');
        throw createErrorWithLog(t('bg.reactCancelled'), parentExecutionLog);
      }
      
      try {
        logger.debug(`[Background] execute subtask ${subtaskIndex + 1}/${sortedSubtasks.length}: ${subtask.name} (attempt ${retry + 1}/${maxRetries + 1})`);
        
        // 子任务上下文交接（Cognition 原则：关键决策信息向下游共享，避免独立上下文产生不一致决策）
        // 顺序/依赖策略携带前序已完成子任务结果；并行策略子任务间无先后语义，只携带父任务历史摘要
        const inheritedParts = [];
        if (parentBudget?.historySummary) {
          inheritedParts.push(`### Parent conversation history summary\n${truncateByTokens(parentBudget.historySummary, 1000)}`);
        }
        if (strategy !== 'parallel') {
          const priorDone = results.filter(r => r && r.success);
          if (priorDone.length > 0) {
            const priorLines = priorDone.map(r => `- [done] ${r.subtaskName}: ${truncateByTokens(String(r.result || ''), 400)}`);
            inheritedParts.push(`### Completed preceding subtasks\n${priorLines.join('\n')}`);
          }
        }
        const inheritedContext = inheritedParts.length > 0
          ? `\n\n## Inherited Context\nInformation shared from the parent task and preceding subtasks. Keep your output consistent with it; do not redo completed work.\n${inheritedParts.join('\n\n')}`
          : '';

        // 为子任务创建独立的消息上下文
        const subtaskMessages = [
          {
            role: 'system',
            content: `You are executing a subtask. Focus on completing this task and do not ask the user any questions.\n\nTask context: ${taskDescription}\n\nCurrent subtask: ${subtask.description}\n\nYou may use all available tools to complete the task. Choose the appropriate tools based on the actual situation.${inheritedContext}`
          },
          {
            role: 'user',
            content: subtask.description
          }
        ];
        
        // 子任务迭代预算直接沿用设置页的 maxIterations（包装器内层自然读取同一配置），
        // 不再另加 20 轮钳制：轮次限制的职责是防单循环无限执行，总量保护由下方时限钳制承担

        // 子任务整体超时预算：逐子任务实时读父任务剩余时间（父以 getRemainingTimeMs 注入取值函数），
        // 使顺序策略下后启动的子任务不会各享满额 15 分钟而冲破父任务时限
        const parentRemainMs = typeof parentBudget?.getRemainingTimeMs === 'function'
          ? parentBudget.getRemainingTimeMs()
          : undefined;
        const subtaskLoopTimeoutMs = computeSubtaskLoopTimeoutMs(parentRemainMs);

        // 调用子任务的ReAct循环（使用派生 sessionId 隔离流式消息）
        const subtaskResult = await reactLoop(
          subtaskMessages, 
          model, 
          subtaskTools, 
          tabId, 
          { ...apiParams, subtaskLoopTimeoutMs },
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
            
            sendSubtaskStatusUpdate(t('reactLoop.subtaskNode', { index: subtaskIndex + 1, name: subtask.name }), 'processing', mergedLog, { taskGroup: taskGroup, subtaskIndex, subtaskTotal: sortedSubtasks.length, subtaskName: subtask.name });
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
            result: subtaskResult.content.substring(0, 600) + (subtaskResult.content.length > 600 ? '...' : '')
          };
        }
        
        // 发送子任务完成状态（增量发送，避免 64MiB 限制）
        sendSubtaskStatusUpdate(t('reactLoop.subtaskCompleted', { index: subtaskIndex + 1, name: subtask.name }), 'success', parentExecutionLog, { taskGroup: taskGroup, subtaskIndex, subtaskTotal: sortedSubtasks.length, subtaskName: subtask.name });
        
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
            logger.debug(`[Background] subtask ${subtask.name} trigger reflection,complexity: ${isComplexSubtask ? 'repmisc' : 'normal'}`);
            
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
              sessionId,
              signal
            );
            
            // 如果反思有修订，使用修订后的结果
            if (reflectionResult.refinedContent) {
              finalResult = reflectionResult.refinedContent;
              logger.debug(`[Background] subtask ${subtask.name} after reflectionrevise`);
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
        
        const doneResult = {
          success: true,
          subtaskId: subtask.id,
          subtaskName: subtask.name,
          result: finalResult,
          executionLog: subtaskResult.executionLog || [],
          retryCount: retry,
          reflectionScore: subtaskReflectionScore
        };
        
        // 防重放进度回写：成功子任务即时记入父 checkpoint（onDone 内强制保存）；
        // 回写失败不得影响子任务结果本身，try/catch 吞掉防止误入重试分支
        if (progressHooks?.onDone) {
          try { await progressHooks.onDone(doneResult); } catch (e) {
            logger.warn('[Background] subtask progress onDone failed:', e.message);
          }
        }
        return doneResult;
        
      } catch (error) {
        // 用户取消：直接传播 AbortError，不触发子任务重试
        if (error.name === 'AbortError') {
          throw error;
        }
        lastError = error;
        logger.warn(`[Background] subtask ${subtask.name} attempt ${retry + 1} failed:`, error.message);
        
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
          
          // 发送子任务失败状态（循环停止与普通失败文案区分：恢复语义仅适用于主任务侧）
          sendSubtaskStatusUpdate(error.loopStop ? t('reactLoop.subtaskStoppedLoop', { index: subtaskIndex + 1, name: subtask.name }) : t('reactLoop.subtaskFailed', { index: subtaskIndex + 1, name: subtask.name }), 'failed', parentExecutionLog, { taskGroup: taskGroup, subtaskIndex, subtaskTotal: sortedSubtasks.length, subtaskName: subtask.name });
          
          // 附已完成产出摘要：内层抛异常时多数节点可能已成功（如 98/101），
          // 让父模型基于既有工作继续而非盲续（防重放进度只记 success，不受影响）
          const partialSummary = buildSubtaskPartialSummary(error.executionLog);
          return {
            success: false,
            subtaskId: subtask.id,
            subtaskName: subtask.name,
            result: partialSummary ? `${error.message}\n\n[Partial progress before failure]\n${partialSummary}` : error.message,
            executionLog: error.executionLog || [],
            retryCount: retry + 1,
            error: error
          };
        }
        
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retry)));
      }
    }
    } finally {
      // 子任务结束（成功/失败/取消）统一清理深度登记，防止共享计数器泄漏
      clearSubagentDepth(subtaskSessionId);
    }
  }
  
  if (strategy === 'sequential' || strategy === 'dependency') {
    // 顺序执行
    for (let i = 0; i < sortedSubtasks.length; i++) {
      // 在每个子任务执行前检查是否已取消
      if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
        logger.debug('[Background] subtaskexec by usercancel');
        return results;
      }
      
      const subtask = sortedSubtasks[i];
      const subtaskTools = toolSets[subtask.id] || [];
      
      const result = await executeSingleSubtask(subtask, subtaskTools, i);
      results.push(result);
      
      if (!result.success) {
        logger.debug(`[Background] subtask ${subtask.name} failed,failedstrategy: ${failureStrategy}`);
        
        if (failureStrategy === 'stop') {
          // 停止执行并回滚
          logger.debug('[Background] execute rollback');
          await rollbackCompletedTasks();
          return results;
        }
        
        // continue 或 skip：继续执行剩余子任务
      }
      
      // 每个子任务完成后检查是否已取消
      if (isCancelled(tabId) || (sessionId && isCancelled(sessionId))) {
        logger.debug('[Background] subtaskexec by usercancel');
        return results;
      }
    }
  } else if (strategy === 'parallel') {
    // 并行执行（并发受限池 dispatchSubtasksParallel；修复旧内联 race+indexOf 永不匹配导致上限失效的 Bug）
    logger.debug('[Background] parallel executing subtask,max concurrency:', maxParallel);
    
    const resultsMap = new Map();
    
    const stoppedEarly = await dispatchSubtasksParallel(
      sortedSubtasks,
      maxParallel,
      (subtask, i) => {
        const subtaskTools = toolSets[subtask.id] || [];
        return executeSingleSubtask(subtask, subtaskTools, i).then(result => {
          resultsMap.set(subtask.id, result);
          return result;
        });
      },
      // 在每个子任务执行前检查是否已取消（保持旧“派发前检查”时机）
      () => isCancelled(tabId) || (sessionId && isCancelled(sessionId))
    );
    if (stoppedEarly) {
      logger.debug('[Background] subtaskparallel execby usercancel');
      return results;
    }
    
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
      logger.debug('[Background] parallel execoccurred failed,execute rollback');
      await rollbackCompletedTasks();
    }
  } else {
    // 未知策略：不再静默降级为顺序执行，抛出明确错误让模型重选
    //（executeSingleToolCall 的 catch 会将其转为 tool 错误消息回传模型，循环继续）
    logger.error(`[Background]  not knownexec strategy: ${strategy}`);
    throw createErrorWithLog(t('reactLoop.unknownStrategy', { strategy }), parentExecutionLog);
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
 * 根据 enableToolPreselect 开关决定是否按 requiredTools 筛选
 * - 开关关闭（默认）：子任务全量继承父任务工具，质量更稳定
 * - 开关开启：子任务仅继承标注的 requiredTools + 元工具（clarify_question）
 * - 注意：plan_task 已从子任务工具集中移除，禁止子任务继续嵌套拆分子任务
 * @param {Array} subtasks - 子任务列表
 * @param {Array} parentTools - 父任务的工具列表
 */
export async function prepareToolSetsForSubtasks(subtasks, parentTools = null) {
  const allTools = parentTools || await getTools();
  const reactConfig = await getStoredConfig().then(c => c.reactConfig || {});
  const toolFilterEnabled = reactConfig.enableToolPreselect === true;
  const preselectMinToolCount = reactConfig.preselectMinToolCount || 10;
  const toolSets = {};

  // 从子任务工具集中移除 plan_task，禁止嵌套拆分子任务
  // 子任务应专注于执行具体任务，而非进一步规划拆分
  const planTaskIds = ['plan_task'];
  const filteredTools = allTools.filter(t => !planTaskIds.includes(t.id));

  // 工具数未达阈值，不做筛选，全量继承（已移除 plan_task）
  if (filteredTools.length <= preselectMinToolCount) {
    logger.debug(`[Background] subtasktoolfilter:tool count  ${filteredTools.length} <= ${preselectMinToolCount},full count inherit (excluded plan_task)`);
    subtasks.forEach(subtask => {
      toolSets[subtask.id] = [...filteredTools];
    });
    return toolSets;
  }

  // 元工具：始终保留（无论是否筛选），确保子任务能澄清（不允许再规划）
  const META_TOOL_IDS = ['clarify_question'];

  subtasks.forEach(subtask => {
    if (toolFilterEnabled && Array.isArray(subtask.requiredTools) && subtask.requiredTools.length > 0) {
      // 筛选模式：仅保留标注的工具 + 元工具
      const filtered = filteredTools.filter(t => subtask.requiredTools.includes(t.id));
      const metaTools = filteredTools.filter(t => META_TOOL_IDS.includes(t.id));
      toolSets[subtask.id] = [...filtered, ...metaTools];
      logger.debug(`[Background] subtask ${subtask.name} filter tools: ${filtered.length}/${filteredTools.length}  (pre-filter mode)`);
    } else {
      // 全量继承（默认，或开关开启但未标注 requiredTools）
      toolSets[subtask.id] = [...filteredTools];
      logger.debug(`[Background] subtask ${subtask.name} inherit parent task ${filteredTools.length} tool (excluded plan_task)`);
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
    logger.debug(`[Background] clarificationtooldirectly execute, no outertimeout (overall looptimeoutpaused)`);
    return executeTool(toolCall, tabId, sessionId);
  }
  
  // 其他工具：支持按工具自定义超时，同时受全局超时上限约束
  const toolSpecificTimeout = TOOL_TIMEOUT_MS[toolName];
  // 取 min(工具自定义超时, 全局超时)，确保工具超时不超过全局上限
  // 未配置自定义超时的工具沿用全局 toolTimeout
  const effectiveTimeout = toolSpecificTimeout ? Math.min(toolSpecificTimeout, timeoutMs) : timeoutMs;
  logger.debug(`[Background] tool ${toolName} usingtimeout: ${effectiveTimeout}ms${toolSpecificTimeout ? ` (custom: ${toolSpecificTimeout}ms, globallimit: ${timeoutMs}ms)` : ''}`);
  
  // 创建工具级 AbortController，支持用户手动终止等待
  const toolAbortController = getOrCreateToolAbortController(sessionId);
  
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(t('reactLoop.toolTimeout', { timeout: effectiveTimeout, tool: toolName })));
    }, effectiveTimeout);

    // 用户手动终止等待
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new Error(t('reactLoop.toolAborted', { tool: toolName })));
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

    logger.debug('[Background] send API request to :', apiUrl, 'streaming:', useStream);

    const requestBody = {
      model: model || config.modelName,
      messages: sanitizeImageUrlsForApi(filteredMessages),
      stream: useStream
    };

    // 流式模式下请求包含 usage 统计（用于 Token 消耗展示）
    if (useStream) {
      requestBody.stream_options = { include_usage: true };
    }

    // 添加 temperature 和 top_p 参数
    if (apiParams.temperature !== undefined) {
      requestBody.temperature = apiParams.temperature;
    }
    if (apiParams.top_p !== undefined) {
      requestBody.top_p = apiParams.top_p;
    }

    // 在 API 调用前发送 STREAM_START，让前端在等待响应时显示"思考中"状态
    if (useStream && sessionId) {
      chrome.runtime.sendMessage({
        type: 'STREAM_START',
        sessionId: sessionId,
        callId: callId
      }).catch(() => {});
      logger.debug('[Background] STREAM_START sent (API call with  before )');
    }

    return fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal
    }, config.reactConfig.apiTimeout, config.reactConfig.apiRetryCount, config.reactConfig.apiRetryBaseDelay, (retryAttempt, retryError, delay) => {
      logger.warn(`[Background] API retry (${retryAttempt}/${config.reactConfig.apiRetryCount}) scheduled in ${delay}ms:`, retryError.message);
      // 通知前端显示重试状态（仅带 sessionId 的场景，避免无会话信令误更新侧边栏 UI）
      if (sessionId) {
        chrome.runtime.sendMessage({
          type: 'API_RETRYING',
          sessionId: sessionId,
          callId: callId,
          attempt: retryAttempt,
          maxRetries: config.reactConfig.apiRetryCount,
          delay: delay
        }).catch(() => {});
      }
    })
    .then(async response => {
      if (!response.ok) {
        const responseText = await response.text();
        logger.error('[Background] API response error:', response.status, responseText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${responseText.substring(0, 500)}`);
      }

      // 流式模式：读取 SSE 流
      if (useStream && response.body) {
        const streamController = new StreamController(sessionId, config.streamConfig, { ...streamOptions, callId, preStarted: true });
        const result = await readSSEStream(response.body.getReader(), streamController, abortSignal);
        logger.debug('[Background] streaming API responsecomplete,content length:', result.content.length, 'usage:', result.usage);
        return { content: result.content, usage: result.usage, reasoningContent: result.reasoningContent };
      }

      // 非流式模式：保持原有逻辑
      const responseText = await response.text();
      logger.debug('[Background]  non-streaming API responsestate:', response.status, 'text length:', responseText.length, 'preview:', responseText.substring(0, 200));

      try {
        const data = JSON.parse(responseText);
        logger.debug('[Background] API response:', JSON.stringify(data).substring(0, 200));
        const content = data.choices?.[0]?.message?.content || '';
        return { content, usage: data.usage || null };
      } catch (parseErr) {
        logger.error('[Background] JSON parse failed,originalresponse:', responseText.substring(0, 500));
        throw new Error(t('reactLoop.jsonParseFailed', { status: response.status, error: parseErr.message, preview: responseText.substring(0, 100) }));
      }
    })
    .catch(error => {
      if (error.name === 'AbortError') {
        logger.debug('[Background] API call with by usercancel');
      } else {
        logger.error('[Background] API call with failed:', error.message || error);
      }
      throw error;
    });
  });
}

// ============================================================
// 反思机制（Reflection）- 已拆分到 react-reflection.js
// ============================================================
// 工具级反思（reflectOnToolResult / shouldTriggerToolReflection / getToolReflectionPriority）
// 已移除：改为 getToolObservationHint 规则内联提示（零额外 LLM 调用）。
// shouldReflect / buildReflectionPrompt / parseReflectionResult
// / reflectOnResult / reflectOnSubtask 仍用于后置与子任务反思，
// 已通过顶部 import 引入本模块
