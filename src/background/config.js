// background/config.js - 配置管理

import { DEFAULT_API_BASE, DEFAULT_MODEL, DEFAULT_REACT_CONFIG, DEFAULT_CHAT_CONFIG, DEFAULT_REFLECTION_CONFIG, DEFAULT_STREAM_CONFIG } from './constants.js';
import { normalizeCustomModels } from '../shared/token-counter.js';

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
      'reflectionConfig',
      'streamEnabled', 'streamChunkDelay', 'agentStreamEnabled'
    ], (result) => {
      resolve({
        apiBase: result.apiBase || DEFAULT_API_BASE,
        apiKey: result.apiKey || '',
        modelName: result.modelName || DEFAULT_MODEL,
        temperature: result.temperature !== undefined ? result.temperature : undefined,
        topP: result.topP !== undefined ? result.topP : undefined,
        enabledTools: result.enabledTools || ['get_page_content', 'query_interactive_elements', 'clipboard'],
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
          preselectMinToolCount: DEFAULT_REACT_CONFIG.preselectMinToolCount,
          toolConfirmationEnabled: result.toolConfirmationEnabled !== undefined ? result.toolConfirmationEnabled : DEFAULT_REACT_CONFIG.toolConfirmationEnabled,
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
      'chatMaxMemoryMessages', 'enableExecutionLog', 'customModels'
    ], (result) => {
      resolve({
        maxMemoryMessages: result.chatMaxMemoryMessages !== undefined ? result.chatMaxMemoryMessages : DEFAULT_CHAT_CONFIG.maxMemoryMessages,
        enableExecutionLog: result.enableExecutionLog !== undefined ? result.enableExecutionLog : DEFAULT_CHAT_CONFIG.enableExecutionLog,
        customModelMap: normalizeCustomModels(result.customModels || [])
      });
    });
  });
}
