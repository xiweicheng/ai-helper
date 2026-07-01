// background/config.js - 配置管理

import { DEFAULT_API_BASE, DEFAULT_MODEL, DEFAULT_REACT_CONFIG, DEFAULT_CHAT_CONFIG, DEFAULT_REFLECTION_CONFIG, DEFAULT_STREAM_CONFIG } from './constants.js';

/**
 * 获取存储的配置
 */
export function getStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'apiBase', 'apiKey', 'modelName', 'enabledTools',
      'reactMaxIterations', 'reactApiTimeout', 'reactLoopTimeout', 'reactToolTimeout', 'reactClarifyTimeout',
      'reactApiRetryCount', 'reactApiRetryBaseDelay', 'enableToolPreselect',
      'preselectMinToolCount', 'toolConfirmationEnabled',
      'chatMaxInputHistory', 'chatMaxHistoryMessages', 'chatMaxMessageLength',
      'reflectionConfig',
      'streamEnabled', 'streamChunkDelay', 'agentStreamEnabled'
    ], (result) => {
      resolve({
        apiBase: result.apiBase || DEFAULT_API_BASE,
        apiKey: result.apiKey || '',
        modelName: result.modelName || DEFAULT_MODEL,
        enabledTools: result.enabledTools || ['get_page_content', 'get_element_by_selector', 'get_selected_content'],
        // ReAct 配置项
        reactConfig: {
          maxIterations: result.reactMaxIterations || DEFAULT_REACT_CONFIG.maxIterations,
          apiTimeout: result.reactApiTimeout || DEFAULT_REACT_CONFIG.apiTimeout,
          loopTimeout: result.reactLoopTimeout || DEFAULT_REACT_CONFIG.loopTimeout,
          toolTimeout: result.reactToolTimeout || DEFAULT_REACT_CONFIG.toolTimeout,
          clarifyTimeout: result.reactClarifyTimeout || DEFAULT_REACT_CONFIG.clarifyTimeout,
          apiRetryCount: result.reactApiRetryCount !== undefined ? result.reactApiRetryCount : DEFAULT_REACT_CONFIG.apiRetryCount,
          apiRetryBaseDelay: result.reactApiRetryBaseDelay !== undefined ? result.reactApiRetryBaseDelay : DEFAULT_REACT_CONFIG.apiRetryBaseDelay,
          enableToolPreselect: result.enableToolPreselect !== undefined ? result.enableToolPreselect : DEFAULT_REACT_CONFIG.enableToolPreselect,
          preselectMinToolCount: result.preselectMinToolCount !== undefined ? result.preselectMinToolCount : DEFAULT_REACT_CONFIG.preselectMinToolCount,
          toolConfirmationEnabled: result.toolConfirmationEnabled !== undefined ? result.toolConfirmationEnabled : DEFAULT_REACT_CONFIG.toolConfirmationEnabled,
          // 反思配置（从 storage 读取，否则使用默认值）
          reflection: result.reflectionConfig || DEFAULT_REFLECTION_CONFIG
        },
        // 对话配置项
        chatConfig: {
          maxInputHistory: result.chatMaxInputHistory || DEFAULT_CHAT_CONFIG.maxInputHistory,
          maxHistoryMessages: result.chatMaxHistoryMessages || DEFAULT_CHAT_CONFIG.maxHistoryMessages,
          maxMessageLength: result.chatMaxMessageLength || DEFAULT_CHAT_CONFIG.maxMessageLength
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
      'chatMaxInputHistory', 'chatMaxHistoryMessages', 'chatMaxMessageLength', 'chatMaxMemoryMessages', 'enableExecutionLog'
    ], (result) => {
      resolve({
        maxInputHistory: result.chatMaxInputHistory || DEFAULT_CHAT_CONFIG.maxInputHistory,
        maxHistoryMessages: result.chatMaxHistoryMessages || DEFAULT_CHAT_CONFIG.maxHistoryMessages,
        maxMessageLength: result.chatMaxMessageLength || DEFAULT_CHAT_CONFIG.maxMessageLength,
        maxMemoryMessages: result.chatMaxMemoryMessages !== undefined ? result.chatMaxMemoryMessages : DEFAULT_CHAT_CONFIG.maxMemoryMessages,
        enableExecutionLog: result.enableExecutionLog !== undefined ? result.enableExecutionLog : DEFAULT_CHAT_CONFIG.enableExecutionLog
      });
    });
  });
}
