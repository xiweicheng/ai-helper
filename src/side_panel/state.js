// state.js - 全局状态变量
// 同时导出命名 let 绑定（供 named import 使用）和 default 对象（供 import state 使用）
// default 对象通过 getter/setter 代理到同名 let 变量，确保两种导入方式共享同一份数据

export let generatingSessionIds = new Set();  // Set of sessionIds currently generating
export let messageHistory = [];
export let currentModel = 'deepseek-v4-pro';
export let activeSessionId = null;   // 当前活跃会话 ID
export let sessions = [];             // 所有会话列表缓存
export let useTools = true;
export let isolateChat = true;
export let enableSelectionQuery = false;
export let currentTabId = null;
export let selectedContextText = '';
export let quotedContextText = '';
export let customPrompts = [];
export let selectedPromptIndex = -1;
export let draggedItemIndex = null;
export let systemPrompt = '';
export let inputHistory = [];
export let inputHistoryIndex = -1;

// Agent 平台信息（从 Agent 获取，用于系统提示词注入）
export let agentPlatform = {
  platformName: 'Unknown',
  platform: 'unknown',
  arch: 'unknown',
  shell: '/bin/sh',
  homeDir: '/home/user',
  workdir: '',
  connected: false
};

// 配置常量 - 从 storage 获取，使用默认值作为后备
export let chatConfig = {
  maxInputHistory: 20,
  maxHistoryMessages: 50,
  maxMessageLength: 100000,
  maxMemoryMessages: 20,
  enableExecutionLog: false,
  contextWindow: 0   // 0 = 使用内置映射自动推断
};

// 温度设置
export let temperature = 0.2;
export let topP = 1.0;
export let selectedTempIndex = 0;

// 工具弹窗搜索和分类状态
export let currentCategory = 'all';
export let currentSearch = '';

// 当前启用的工具列表
export let enabledTools = [];

// 分类折叠状态
export const collapsedCategories = {};

// 当前执行状态（按 sessionId 隔离，key 为 sessionId）
export let sessionExecutionStatus = new Map();
export let executionLogListener = null;

// 当前 API 调用的取消函数，按 sessionId 隔离，防止多会话并行时互相覆盖
export let pendingCancelApiMap = new Map();

// 记录有 pending callApi 的会话 ID 集合（支持多会话同时有后台任务）
export let pendingCallApiSessionIds = new Set();

// 切换回原会话后，重新创建的加载指示器 ID 集合（按 sessionId 索引）
export let substituteLoadingIds = new Map();

// 澄清对话框相关状态
export let currentClarifyToolCallId = null;
export let currentClarifySessionId = null;  // 当前澄清所属的会话 ID
export let currentConfirmToolCallId = null; // 当前确认对话框所属的 toolCallId
export let currentConfirmSessionId = null;  // 当前确认对话框所属的会话 ID
export let clarifyTimerInterval = null;
export let clarifyTimeoutValue = 180000;  // 默认 3 分钟

// 消息目录状态
export let messageTocContainer = null;
export let isMouseOverToc = false;
export let tocHideTimer = null;

// 划词问答弹出菜单状态
export let lastSelectedText = '';
export let currentSelectionRange = null;
export let lastMouseX = 0;
export let lastMouseY = 0;

// 待删除的提示词索引
export let pendingDeleteIndex = -1;

// 图片识别
export let enableImageInput = false;
export let imageModelName = '';         // 图片识别模型，为空则使用 currentModel
export let imageApiBase = '';   // 图片识别独立 API Base，为空则使用主配置
export let imageApiKey = '';    // 图片识别独立 API Token，为空则使用主配置
export let attachedImages = [];  // [{ dataUrl: 'data:image/jpeg;base64,...' }]

// 标志位
export let isScrolling = false;

// ============================================================
// default 导出：通过 getter/setter 代理到同名 let 变量
// 使用方式: import state from './state.js'; state.xxx = value;
// ============================================================
export default {
  get isGenerating() { return generatingSessionIds.has(activeSessionId); },
  set isGenerating(v) { 
    if (v) generatingSessionIds.add(activeSessionId); 
    else generatingSessionIds.delete(activeSessionId);
    document.dispatchEvent(new CustomEvent('generating-state-changed'));
  },
  get generatingSessionIds() { return generatingSessionIds; },
  get messageHistory() { return messageHistory; },
  set messageHistory(v) { messageHistory = v; },
  get currentModel() { return currentModel; },
  set currentModel(v) { currentModel = v; },
  get activeSessionId() { return activeSessionId; },
  set activeSessionId(v) { activeSessionId = v; },
  get sessions() { return sessions; },
  set sessions(v) { sessions = v; },
  get useTools() { return useTools; },
  set useTools(v) { useTools = v; },
  get isolateChat() { return isolateChat; },
  set isolateChat(v) { isolateChat = v; },
  get enableSelectionQuery() { return enableSelectionQuery; },
  set enableSelectionQuery(v) { enableSelectionQuery = v; },
  get currentTabId() { return currentTabId; },
  set currentTabId(v) { currentTabId = v; },
  get selectedContextText() { return selectedContextText; },
  set selectedContextText(v) { selectedContextText = v; },
  get quotedContextText() { return quotedContextText; },
  set quotedContextText(v) { quotedContextText = v; },
  get customPrompts() { return customPrompts; },
  set customPrompts(v) { customPrompts = v; },
  get selectedPromptIndex() { return selectedPromptIndex; },
  set selectedPromptIndex(v) { selectedPromptIndex = v; },
  get draggedItemIndex() { return draggedItemIndex; },
  set draggedItemIndex(v) { draggedItemIndex = v; },
  get systemPrompt() { return systemPrompt; },
  set systemPrompt(v) { systemPrompt = v; },
  get agentPlatform() { return agentPlatform; },
  set agentPlatform(v) { Object.assign(agentPlatform, v); },
  get inputHistory() { return inputHistory; },
  set inputHistory(v) { inputHistory = v; },
  get inputHistoryIndex() { return inputHistoryIndex; },
  set inputHistoryIndex(v) { inputHistoryIndex = v; },
  get chatConfig() { return chatConfig; },
  set chatConfig(v) { chatConfig = v; },
  get temperature() { return temperature; },
  set temperature(v) { temperature = v; },
  get topP() { return topP; },
  set topP(v) { topP = v; },
  get selectedTempIndex() { return selectedTempIndex; },
  set selectedTempIndex(v) { selectedTempIndex = v; },
  get currentCategory() { return currentCategory; },
  set currentCategory(v) { currentCategory = v; },
  get currentSearch() { return currentSearch; },
  set currentSearch(v) { currentSearch = v; },
  get enabledTools() { return enabledTools; },
  set enabledTools(v) { enabledTools = v; },
  get collapsedCategories() { return collapsedCategories; },
  // collapsedCategories is const, no setter needed
  get sessionExecutionStatus() { return sessionExecutionStatus; },
  set sessionExecutionStatus(v) { sessionExecutionStatus = v; },
  // 兼容旧代码：currentExecutionStatus 通过 getter/setter 操作当前活跃会话
  get currentExecutionStatus() { return sessionExecutionStatus.get(activeSessionId) || null; },
  set currentExecutionStatus(v) { 
    if (v === null) {
      sessionExecutionStatus.delete(activeSessionId);
    } else {
      sessionExecutionStatus.set(activeSessionId, v);
    }
  },
  get executionLogListener() { return executionLogListener; },
  set executionLogListener(v) { executionLogListener = v; },
  get pendingCancelApi() { return pendingCancelApiMap.get(activeSessionId) || null; },
  set pendingCancelApi(v) {
    if (v === null) {
      pendingCancelApiMap.delete(activeSessionId);
    } else {
      pendingCancelApiMap.set(activeSessionId, v);
    }
  },
  get pendingCancelApiMap() { return pendingCancelApiMap; },
  get pendingCallApiSessionIds() { return pendingCallApiSessionIds; },
  set pendingCallApiSessionIds(v) { pendingCallApiSessionIds = v; },
  get substituteLoadingIds() { return substituteLoadingIds; },
  set substituteLoadingIds(v) { substituteLoadingIds = v; },
  get currentClarifyToolCallId() { return currentClarifyToolCallId; },
  set currentClarifyToolCallId(v) { currentClarifyToolCallId = v; },
  get currentClarifySessionId() { return currentClarifySessionId; },
  set currentClarifySessionId(v) { currentClarifySessionId = v; },
  get currentConfirmToolCallId() { return currentConfirmToolCallId; },
  set currentConfirmToolCallId(v) { currentConfirmToolCallId = v; },
  get currentConfirmSessionId() { return currentConfirmSessionId; },
  set currentConfirmSessionId(v) { currentConfirmSessionId = v; },
  get clarifyTimerInterval() { return clarifyTimerInterval; },
  set clarifyTimerInterval(v) { clarifyTimerInterval = v; },
  get clarifyTimeoutValue() { return clarifyTimeoutValue; },
  set clarifyTimeoutValue(v) { clarifyTimeoutValue = v; },
  get messageTocContainer() { return messageTocContainer; },
  set messageTocContainer(v) { messageTocContainer = v; },
  get isMouseOverToc() { return isMouseOverToc; },
  set isMouseOverToc(v) { isMouseOverToc = v; },
  get tocHideTimer() { return tocHideTimer; },
  set tocHideTimer(v) { tocHideTimer = v; },
  get lastSelectedText() { return lastSelectedText; },
  set lastSelectedText(v) { lastSelectedText = v; },
  get currentSelectionRange() { return currentSelectionRange; },
  set currentSelectionRange(v) { currentSelectionRange = v; },
  get lastMouseX() { return lastMouseX; },
  set lastMouseX(v) { lastMouseX = v; },
  get lastMouseY() { return lastMouseY; },
  set lastMouseY(v) { lastMouseY = v; },
  get pendingDeleteIndex() { return pendingDeleteIndex; },
  set pendingDeleteIndex(v) { pendingDeleteIndex = v; },
  get enableImageInput() { return enableImageInput; },
  set enableImageInput(v) { enableImageInput = v; },
  get imageModelName() { return imageModelName; },
  set imageModelName(v) { imageModelName = v; },
  get imageApiBase() { return imageApiBase; },
  set imageApiBase(v) { imageApiBase = v; },
  get imageApiKey() { return imageApiKey; },
  set imageApiKey(v) { imageApiKey = v; },
  get attachedImages() { return attachedImages; },
  set attachedImages(v) { attachedImages = v; },
  get isScrolling() { return isScrolling; },
  set isScrolling(v) { isScrolling = v; },
};
