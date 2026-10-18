// background/config.js - 配置管理

import { DEFAULT_API_BASE, DEFAULT_MODEL, DEFAULT_REACT_CONFIG, DEFAULT_CHAT_CONFIG, DEFAULT_REFLECTION_CONFIG, DEFAULT_STREAM_CONFIG } from './constants.js';
import { normalizeCustomModels } from '../shared/token-counter.js';
import { decodeSecret } from '../shared/secret.js';

/**
 * 获取存储的配置
 */
export function getStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'apiBase', 'apiKey', 'modelName', 'enabledTools',
      'temperature', 'topP',
      'reactMaxIterations', 'reactApiTimeout', 'reactLoopTimeout', 'reactToolTimeout',
      'enableToolPreselect',
      'toolConfirmationEnabled',
      'networkAccessEnabled', 'allowedNetworkHosts',
      'reflectionConfig',
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
          maxIterations: result.reactMaxIterations || DEFAULT_REACT_CONFIG.maxIterations,
          apiTimeout: result.reactApiTimeout || DEFAULT_REACT_CONFIG.apiTimeout,
          loopTimeout: result.reactLoopTimeout || DEFAULT_REACT_CONFIG.loopTimeout,
          toolTimeout: result.reactToolTimeout || DEFAULT_REACT_CONFIG.toolTimeout,
          clarifyTimeout: DEFAULT_REACT_CONFIG.clarifyTimeout,
          apiRetryCount: DEFAULT_REACT_CONFIG.apiRetryCount,
          apiRetryBaseDelay: DEFAULT_REACT_CONFIG.apiRetryBaseDelay,
          enableToolPreselect: result.enableToolPreselect !== undefined ? result.enableToolPreselect : DEFAULT_REACT_CONFIG.enableToolPreselect,
          toolConfirmationEnabled: result.toolConfirmationEnabled !== undefined ? result.toolConfirmationEnabled : DEFAULT_REACT_CONFIG.toolConfirmationEnabled,
          // 内网地址访问：总闸 + 白名单（两者独立存储，关总闸不会清空白名单）
          networkAccessEnabled: result.networkAccessEnabled === true,
          allowedNetworkHosts: Array.isArray(result.allowedNetworkHosts) ? result.allowedNetworkHosts : DEFAULT_REACT_CONFIG.allowedNetworkHosts,
          // 反思配置（从 storage 读取，否则使用默认值）
          reflection: result.reflectionConfig || DEFAULT_REFLECTION_CONFIG
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
      'chatAutoCompaction', 'chatAutoCompactionThreshold', 'chatPersistSummaryToMemory'
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
        persistSummaryToMemory: result.chatPersistSummaryToMemory !== false
      });
    });
  });
}
