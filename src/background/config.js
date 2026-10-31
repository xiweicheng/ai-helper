// background/config.js - 配置管理

import { DEFAULT_API_BASE, DEFAULT_MODEL, DEFAULT_REACT_CONFIG, DEFAULT_CHAT_CONFIG, DEFAULT_REFLECTION_CONFIG, DEFAULT_STREAM_CONFIG, DEFAULT_COMPLETION_VERIFICATION_CONFIG, DEFAULT_GOAL_CONFIG } from './constants.js';
import { normalizeCustomModels } from '../shared/token-counter.js';
import { decodeSecret } from '../shared/secret.js';

// 「整体循环超时」硬边界：与 options/loop-timeout-slider.js 档位上下限、面板看门狗换算口径一致。
// 必须在读取侧钳制（而非只靠设置页保存校验）才能同时挡住「旧备份导入」与「历史残留值」两条
// 绕过 UI 的写入路径——否则滑杆把 1 分钟就近显示成 10 分钟、后台却仍按 1 分钟跑，一次工具调用就撞线。
const LOOP_TIMEOUT_MIN_MS = 600000;    // 10 分钟（低于它连一轮工具调用都跑不完）
const LOOP_TIMEOUT_MAX_MS = 86400000;  // 24 小时

/**
 * 获取存储的配置
 */
export function getStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'apiBase', 'apiKey', 'modelName', 'enabledTools',
      'temperature', 'topP',
      'reactLoopTimeout',
      'gracefulConverge',
      'enableToolPreselect',
      'toolConfirmationEnabled',
      'networkAccessEnabled', 'allowedNetworkHosts',
      'reflectionConfig',
      'completionVerificationConfig',
      'goalConfig',
      'streamEnabled', 'streamChunkDelay', 'agentStreamEnabled'
    ], (result) => {
      resolve({
        apiBase: result.apiBase || DEFAULT_API_BASE,
        apiKey: decodeSecret(result.apiKey) || '',
        modelName: result.modelName || DEFAULT_MODEL,
        temperature: result.temperature !== undefined ? result.temperature : undefined,
        topP: result.topP !== undefined ? result.topP : undefined,
        enabledTools: result.enabledTools || ['page_content', 'query_elements', 'clipboard'],
        // ReAct 配置项
        reactConfig: {
          // 轮数上限 / API 请求超时 / 工具执行超时均已撤出设置页，不再从 storage 读取：
          // 三者作为内部固定值（constants.js）——轮数 2000 抹「快而空转」、API 5min 抹「建连卡死」、
          // 工具 10min 与 Agent 端 TOTAL_BUDGET_CAP_MS 封顶对齐。旧配置里残留的 reactApiTimeout、
          // reactToolTimeout（如 600000）若继续生效，会让「界面已经没有这个开关了」变成谎话。
          maxIterations: DEFAULT_REACT_CONFIG.maxIterations,
          apiTimeout: DEFAULT_REACT_CONFIG.apiTimeout,
          loopTimeout: Math.min(Math.max(result.reactLoopTimeout || DEFAULT_REACT_CONFIG.loopTimeout, LOOP_TIMEOUT_MIN_MS), LOOP_TIMEOUT_MAX_MS),
          toolTimeout: DEFAULT_REACT_CONFIG.toolTimeout,
          clarifyTimeout: DEFAULT_REACT_CONFIG.clarifyTimeout,
          apiRetryCount: DEFAULT_REACT_CONFIG.apiRetryCount,
          apiRetryBaseDelay: DEFAULT_REACT_CONFIG.apiRetryBaseDelay,
          // 预算撞线软着陆：无 UI 控件（内部安全边界），但读 storage 以便导入/导出可覆盖；
          // 仅显式 false 才回退旧的抛错语义
          gracefulConverge: result.gracefulConverge !== false,
          enableToolPreselect: result.enableToolPreselect !== undefined ? result.enableToolPreselect : DEFAULT_REACT_CONFIG.enableToolPreselect,
          toolConfirmationEnabled: result.toolConfirmationEnabled !== undefined ? result.toolConfirmationEnabled : DEFAULT_REACT_CONFIG.toolConfirmationEnabled,
          // 内网地址访问：总闸 + 白名单（两者独立存储，关总闸不会清空白名单）
          networkAccessEnabled: result.networkAccessEnabled === true,
          allowedNetworkHosts: Array.isArray(result.allowedNetworkHosts) ? result.allowedNetworkHosts : DEFAULT_REACT_CONFIG.allowedNetworkHosts,
          // 反思配置（从 storage 读取，否则使用默认值）
          reflection: result.reflectionConfig || DEFAULT_REFLECTION_CONFIG,
          // 完成度校验器配置（默认 enabled:false，关闭时 react-loop 不进入校验分支）
          // 深合并：默认值打底，避免 options 只写 {enabled} 时其余默认字段被残缺对象顶替清空
          completionVerification: Object.assign({}, DEFAULT_COMPLETION_VERIFICATION_CONFIG,
            result.completionVerificationConfig && typeof result.completionVerificationConfig === 'object'
              ? result.completionVerificationConfig : {}),
          // 目标模式配置（默认 enabled:true，但只有面板真正下发 goal 快照时引擎才会进入评估分支，
          // 所以默认开不会改变任何现有请求的形状）。同样深合并打底。
          goal: Object.assign({}, DEFAULT_GOAL_CONFIG,
            result.goalConfig && typeof result.goalConfig === 'object' ? result.goalConfig : {})
        },
        // 流式输出配置
        streamConfig: {
          streamEnabled: result.streamEnabled !== undefined ? result.streamEnabled : DEFAULT_STREAM_CONFIG.streamEnabled,
          streamChunkDelay: result.streamChunkDelay !== undefined ? result.streamChunkDelay : DEFAULT_STREAM_CONFIG.streamChunkDelay,
          agentStreamEnabled: result.agentStreamEnabled !== undefined ? result.agentStreamEnabled : DEFAULT_STREAM_CONFIG.agentStreamEnabled
        }
      });
    });
  });
}

/**
 * 获取对话配置（供 side_panel 使用）
 */
export function getChatConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'chatMaxMemoryMessages', 'enableExecutionLog', 'customModels',
      'streamExpandTools', 'showMessageTimestamp',
      'chatAutoCompaction', 'chatAutoCompactionThreshold', 'chatPersistSummaryToMemory',
      'queueAutoCarry', 'queueAutoCarryEveryNIterations'
    ], (result) => {
      resolve({
        maxMemoryMessages: result.chatMaxMemoryMessages !== undefined ? result.chatMaxMemoryMessages : DEFAULT_CHAT_CONFIG.maxMemoryMessages,
        enableExecutionLog: result.enableExecutionLog !== undefined ? result.enableExecutionLog : DEFAULT_CHAT_CONFIG.enableExecutionLog,
        customModelMap: normalizeCustomModels(result.customModels || []),
        streamExpandTools: result.streamExpandTools === true,
        showMessageTimestamp: result.showMessageTimestamp !== false,
        // 自动压缩：开关默认关（额外调用），阈值越界回落默认，摘要沉淀默认开
        autoCompaction: result.chatAutoCompaction === true,
        autoCompactionThreshold: typeof result.chatAutoCompactionThreshold === 'number'
          && result.chatAutoCompactionThreshold > 0 && result.chatAutoCompactionThreshold <= 1
          ? result.chatAutoCompactionThreshold
          : DEFAULT_CHAT_CONFIG.autoCompactionThreshold,
        persistSummaryToMemory: result.chatPersistSummaryToMemory !== false,
        // 自动顺带：开关默认开（undefined 视为 true）；间隔轮数只做"是不是正数"的初筛，
        // 夹取区间交给面板侧 queue-auto-carry.js 的 normalizeEveryN（真源单一）
        queueAutoCarry: result.queueAutoCarry !== false,
        queueAutoCarryEveryNIterations: typeof result.queueAutoCarryEveryNIterations === 'number'
          && result.queueAutoCarryEveryNIterations > 0
          ? result.queueAutoCarryEveryNIterations
          : DEFAULT_CHAT_CONFIG.queueAutoCarryEveryNIterations
      });
    });
  });
}
