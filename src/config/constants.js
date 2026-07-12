// config/constants.js - Configuration constants

export const CHAT_CONFIG_KEYS = {
  MAX_INPUT_HISTORY: 'chatMaxInputHistory',
  MAX_HISTORY_MESSAGES: 'chatMaxHistoryMessages',
  MAX_MEMORY_MESSAGES: 'chatMaxMemoryMessages',
};

export const REACT_CONFIG_KEYS = {
  MAX_ITERATIONS: 'reactMaxIterations',
  API_TIMEOUT: 'reactApiTimeout',
  LOOP_TIMEOUT: 'reactLoopTimeout',
  TOOL_TIMEOUT: 'reactToolTimeout',
  CLARIFY_TIMEOUT: 'reactClarifyTimeout',
};

export const STORAGE_KEYS = {
  API_BASE: 'apiBase',
  API_KEY: 'apiKey',
  MODEL_NAME: 'modelName',
  ENABLED_TOOLS: 'enabledTools',
  TEMPERATURE: 'temperature',
  TOP_P: 'topP',
  SELECTED_TEMP_INDEX: 'selectedTempIndex',
  CUSTOM_MODELS: 'customModels',
  CUSTOM_PROMPTS: 'customPrompts',
  SYSTEM_PROMPT: 'systemPrompt',
  INPUT_HISTORY: 'inputHistory',
  SCROLL_POSITION: 'scrollPosition',
  TOOLBAR_TOOLS: 'toolbarTools',
  TOOLBAR_MAX_VISIBLE: 'toolbarMaxVisible',
  TOOLBAR_ICON_ONLY: 'toolbarIconOnly',
  // 流式输出配置
  STREAM_ENABLED: 'streamEnabled',
  STREAM_CHUNK_DELAY: 'streamChunkDelay',
  AGENT_STREAM_ENABLED: 'agentStreamEnabled',
};

export const MESSAGE_TYPES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
};

export const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

export const STORAGE_CHANGE_EVENTS = {
  MODEL_NAME: 'modelName',
  CUSTOM_MODELS: 'customModels',
  CHAT_MAX_MEMORY_MESSAGES: 'chatMaxMemoryMessages',
};
