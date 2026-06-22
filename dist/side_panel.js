import { d as BUILTIN_TOOLS_UI } from './constants-5178b5af.js';

// state.js - 全局状态变量
// 同时导出命名 let 绑定（供 named import 使用）和 default 对象（供 import state 使用）
// default 对象通过 getter/setter 代理到同名 let 变量，确保两种导入方式共享同一份数据

let isGenerating = false;
let messageHistory = [];
let currentModel = 'deepseek-v4-pro';
let useTools = true;
let isolateChat = true;
let enableSelectionQuery = false;
let currentTabId = null;
let selectedContextText = '';
let quotedContextText = '';
let customPrompts = [];
let selectedPromptIndex = -1;
let draggedItemIndex = null;
let systemPrompt = '';
let inputHistory = [];
let inputHistoryIndex = -1;

// 配置常量 - 从 storage 获取，使用默认值作为后备
let chatConfig = {
  maxInputHistory: 20,
  maxHistoryMessages: 50,
  maxMessageLength: 5000,
  maxMemoryMessages: null
};

// 温度设置
let temperature = 0.2;
let topP = 1.0;
let selectedTempIndex = 0;

// 工具弹窗搜索和分类状态
let currentCategory = 'all';
let currentSearch = '';

// 当前启用的工具列表
let enabledTools = [];

// 分类折叠状态
const collapsedCategories = {};

// 当前执行状态
let currentExecutionStatus = null;
let executionLogListener = null;

// 问题澄清对话框状态
let currentClarifyToolCallId = null;
let clarifyTimerInterval = null;
let clarifyTimeoutValue = 180000;

// 消息目录状态
let messageTocContainer = null;
let isMouseOverToc = false;
let tocHideTimer = null;

// 划词问答弹出菜单状态
let lastSelectedText = '';
let currentSelectionRange = null;
let lastMouseX = 0;
let lastMouseY = 0;

// 待删除的提示词索引
let pendingDeleteIndex = -1;

// 标志位
let isScrolling = false;

// ============================================================
// default 导出：通过 getter/setter 代理到同名 let 变量
// 使用方式: import state from './state.js'; state.xxx = value;
// ============================================================
var state = {
  get isGenerating() { return isGenerating; },
  set isGenerating(v) { isGenerating = v; },
  get messageHistory() { return messageHistory; },
  set messageHistory(v) { messageHistory = v; },
  get currentModel() { return currentModel; },
  set currentModel(v) { currentModel = v; },
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
  get currentExecutionStatus() { return currentExecutionStatus; },
  set currentExecutionStatus(v) { currentExecutionStatus = v; },
  get executionLogListener() { return executionLogListener; },
  set executionLogListener(v) { executionLogListener = v; },
  get currentClarifyToolCallId() { return currentClarifyToolCallId; },
  set currentClarifyToolCallId(v) { currentClarifyToolCallId = v; },
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
  get isScrolling() { return isScrolling; },
  set isScrolling(v) { isScrolling = v; },
};

const PRESET_MODES = [
  { label: "精准编码", temp: 0.2, topP: 1.0, tip: "较低随机性，适合业务开发、调试、纠错" },
  { label: "均衡开发", temp: 0.45, topP: 0.9, tip: "兼顾稳定性，用于封装工具类、常规脚本" },
  { label: "架构探索", temp: 0.65, topP: 0.9, tip: "提供多种实现思路，用于组件重构、方案对比" },
  { label: "创意发散", temp: 0.9, topP: 0.9, tip: "随机性较高，仅用于原型探索，不建议生产代码" }
];

// utils.js - 工具函数集合

/**
 * 显示 Toast 提示
 * @param {string} message - 提示消息
 * @param {string} type - 提示类型：success, error, warning, info
 * @param {number} duration - 显示时长（毫秒），默认 3000
 */
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  // 触发动画
  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });
  
  // 自动移除
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}

/**
 * 自动调整输入框高度
 */
function adjustInputHeight() {
  const userInput = document.getElementById('userInput');
  if (!userInput) return;
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 100) + 'px';
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 格式化时长
 */
function formatDuration(ms) {
  if (!ms || ms < 0) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(1);
  return `${mins}分${secs}秒`;
}

/**
 * 复制到剪贴板
 */
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
    </svg>`;
    btn.classList.add('copied');
    
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('[SidePanel] 复制失败:', err);
    // 降级方案
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>`;
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.classList.remove('copied');
      }, 2000);
    } catch (e) {
      showToast('复制失败', 'error');
    }
    document.body.removeChild(textArea);
  });
}

/**
 * 获取系统提示词
 * 如果用户自定义了系统提示词，使用用户的；否则使用默认的
 */
function getSystemPrompt() {
  const currentTime = new Date().toLocaleString('zh-CN');
  
  // 任务拆解相关规则（无论是否使用自定义提示词，都需要追加）
  const taskPlanningRules = `

## 任务拆解规则
1. **任务大小判断**：
   - 简单任务（单一操作，如"点击按钮"、"获取页面文本"）：直接执行，不拆解
   - 中等任务（需要2-3个步骤，如"登录网站"）：根据复杂度决定是否拆解
   - 复杂任务（多个步骤、有依赖关系、需要多种工具，如"爬取多个页面并汇总数据"）：必须拆解

2. **拆解原则**：
   - 将大任务分解为2-5个独立子任务
   - 每个子任务应有明确的目标和输出
   - 识别子任务之间的依赖关系
   - 为每个子任务筛选所需的工具集

3. **工具集筛选**：
   - 仔细分析每个子任务的需求
   - 只选择完成该子任务真正需要的工具
   - 避免携带无关工具，减少Token消耗

4. **调用 plan_task 工具**：
   - 当判断需要拆解任务时，调用 plan_task 工具
   - 提供完整的子任务列表，包含ID、名称、描述、依赖和所需工具
   - 指定执行策略：sequential（顺序执行）、parallel（并行执行）或 conditional（条件执行）`;

  // 如果用户自定义了系统提示词
  if (state.systemPrompt && state.systemPrompt.trim()) {
    // 拼接环境信息和任务拆解规则
    return `${state.systemPrompt}

## 当前环境
- 运行环境：Chrome 浏览器扩展（Side Panel）
- 操作系统：Windows 10.0
- 当前时间：${currentTime}${taskPlanningRules}
`;
  }
  
  // 返回默认系统提示词
  return `你是AI智能助手(AI Helper)，专为IT从业者（产品经理、架构师、开发工程师、测试工程师等）打造的AI技术助手。

## 你的能力
- **编程开发**：精通主流编程语言（Java/Python/JavaScript/Go/C++等）及框架，能编写、调试、优化代码
- **技术问题解答**：擅长解答架构设计、算法优化、性能调优、Bug排查等技术问题
- **代码审查**：能提供代码质量评估、最佳实践建议、潜在风险识别
- **文档编写**：协助撰写技术文档、API说明、测试用例等
- **工具使用**：可调用浏览器工具获取当前网页内容或选中文本，辅助解答与网页相关的问题
- **任务规划**：能够将复杂任务拆解为多个子任务，规划执行顺序和所需工具${taskPlanningRules}

## 回答原则
1. **精准专业**：使用准确的技术术语，回答直击要点
2. **代码优先**：涉及代码时，优先给出可运行的代码示例，并添加必要注释
3. **结构清晰**：善用Markdown格式（标题、列表、代码块、表格等）组织内容
4. **实用导向**：提供可落地的解决方案，避免空泛的理论
5. **安全合规**：不生成违反安全规范的代码，不涉及敏感信息处理
6. **任务驱动**：复杂任务先规划后执行，使用 plan_task 工具进行拆解

## 当前环境
- 运行环境：Chrome 浏览器扩展（Side Panel）
- 操作系统：Windows 10.0
- 当前时间：${currentTime}
`;
}

/**
 * 获取API参数（包含temperature和top_p）
 * 定义为全局函数，避免作用域问题
 * 直接从 storage 获取最新值，避免异步加载未完成时获取到默认值
 */
function getApiParams() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['temperature', 'topP'], (result) => {
      resolve({
        temperature: result.temperature !== undefined ? parseFloat(result.temperature.toFixed(2)) : parseFloat(state.temperature.toFixed(2)),
        top_p: result.topP !== undefined ? parseFloat(result.topP.toFixed(2)) : parseFloat(state.topP.toFixed(2))
      });
    });
  });
}

/**
 * 加载对话配置
 */
function loadChatConfig() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_CHAT_CONFIG' }, (response) => {
      if (response) {
        state.chatConfig = response;
        console.log('[SidePanel] 对话配置已加载:', state.chatConfig);
      }
      resolve(response);
    });
  });
}

/**
 * 确保配置已加载（同步获取）
 */
async function ensureChatConfigLoaded() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_CHAT_CONFIG' }, (response) => {
      if (response) {
        state.chatConfig = response;
        console.log('[SidePanel] 同步加载对话配置:', state.chatConfig);
      }
      resolve();
    });
  });
}

/**
 * 获取当前激活的 Tab ID
 */
async function getCurrentActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0 && tabs[0].id) {
        state.currentTabId = tabs[0].id;
        console.log('[SidePanel] 获取当前 Tab ID:', state.currentTabId, 'URL:', tabs[0].url);
        resolve(state.currentTabId);
      } else {
        console.warn('[SidePanel] 未获取到有效的 Tab ID');
        resolve(null);
      }
    });
  });
}

/**
 * 获取 ReAct 配置（包含超时设置）
 */
function getReactConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'reactMaxIterations', 'reactApiTimeout', 'reactLoopTimeout', 
      'reactToolTimeout', 'reactClarifyTimeout'
    ], (result) => {
      resolve({
        maxIterations: result.reactMaxIterations || 30,
        apiTimeout: result.reactApiTimeout || 60000,
        loopTimeout: result.reactLoopTimeout || 300000,
        toolTimeout: result.reactToolTimeout || 30000,
        clarifyTimeout: result.reactClarifyTimeout || 180000
      });
    });
  });
}

// input-history.js - 输入历史管理

/**
 * 添加到输入历史
 * @param {string} text - 输入文本
 */
function addToInputHistory(text) {
  if (!text || !text.trim() || text.trim() == '/') return;
  
  const trimmedText = text.trim();
  
  // 移除已存在的重复条目，确保不会有重复的历史记录
  const existingIndex = state.inputHistory.indexOf(trimmedText);
  if (existingIndex !== -1) {
    state.inputHistory.splice(existingIndex, 1);
  }
  
  // 添加到数组末尾（最新的在最后）
  state.inputHistory.push(trimmedText);
  
  // 限制历史记录数量，超过时移除最旧的（数组开头）
  if (state.inputHistory.length > state.chatConfig.maxInputHistory) {
    state.inputHistory.shift();
  }
  
  // 保存到 storage
  saveInputHistory();
}

/**
 * 保存输入历史到 storage
 */
function saveInputHistory() {
  try {
    chrome.storage.local.set({ inputHistory: state.inputHistory });
    console.log('[SidePanel] 输入历史已保存，数量:', state.inputHistory.length);
  } catch (e) {
    console.error('[SidePanel] 保存输入历史失败:', e);
  }
}

// ========== 消息目录功能 ==========

/**
 * 初始化消息目录功能
 */
function initMessageToc() {
  // 使用 mouseover/mouseout 来检测鼠标移动
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  
  console.log('[SidePanel] 消息目录功能已初始化');
}

/**
 * 处理鼠标进入事件
 */
function handleMouseOver(event) {
  if (!(event.target instanceof Element)) return;
  
  // 如果目标是目录容器，标记为在目录区域内
  if (event.target.closest('.message-toc-container')) {
    state.isMouseOverToc = true;
    return;
  }
  
  // 如果目标是消息区域
  const messageDiv = event.target.closest('.message.assistant');
  if (!messageDiv) return;
  
  // 检查是否包含 H 标题
  const headings = messageDiv.querySelectorAll('.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6');
  
  if (headings.length === 0) {
    hideMessageToc();
    return;
  }
  
  // 生成目录
  showMessageToc(messageDiv, headings);
}

/**
 * 处理鼠标离开事件
 */
function handleMouseOut(event) {
  if (!(event.target instanceof Element)) return;
  
  // 如果目标是目录容器，取消标记
  if (event.target.closest('.message-toc-container')) {
    state.isMouseOverToc = false;
    // 清除可能存在的延迟隐藏定时器
    if (state.tocHideTimer) {
      clearTimeout(state.tocHideTimer);
      state.tocHideTimer = null;
    }
    return;
  }
  
  // 如果目标是消息区域
  const messageDiv = event.target.closest('.message.assistant');
  if (!messageDiv) return;
  
  // 检查 relatedTarget 是否在目录区域或消息区域内
  const relatedTarget = event.relatedTarget;
  if (relatedTarget) {
    if (relatedTarget.closest('.message-toc-container') || relatedTarget.closest('.message.assistant')) {
      return; // 移动到目录区域或消息区域，不隐藏
    }
  }
  
  // 如果鼠标不在目录区域内，延迟隐藏目录（给用户时间移动到目录）
  if (!state.isMouseOverToc) {
    // 清除之前的定时器
    if (state.tocHideTimer) {
      clearTimeout(state.tocHideTimer);
    }
    // 延迟 800ms 隐藏目录，让用户有充足时间将鼠标移动到目录区域
    state.tocHideTimer = setTimeout(() => {
      // 再次检查鼠标是否已经进入目录区域
      if (!state.isMouseOverToc) {
        hideMessageToc();
      }
      state.tocHideTimer = null;
    }, 800);
  }
}

/**
 * 显示目录
 */
function showMessageToc(messageDiv, headings) {
  // 将 NodeList 转换为数组
  const headingsArray = Array.from(headings);
  
  // 如果目录已存在，先移除
  if (state.messageTocContainer) {
    hideMessageToc();
  }
  
  // 为标题添加 ID（如果还没有）
  headingsArray.forEach((heading, index) => {
    if (!heading.id) {
      heading.id = `toc-heading-${Date.now()}-${index}`;
    }
  });
  
  // 创建目录容器
  const container = document.createElement('div');
  container.className = 'message-toc-container';
  container.dataset.headingsCount = headingsArray.length;
  const tocList = headingsArray.map((heading) => {
    const level = parseInt(heading.tagName.charAt(1));
    const text = heading.textContent.trim();
    const displayText = text.length > 30 ? text.substring(0, 30) + '...' : text;
    const anchor = `H${level}`;
    return `
      <li class="message-toc-item level-${level}" 
          data-target="${heading.id}"
          data-anchor="${anchor}"
          title="${text}">
        <span class="toc-anchor">${anchor}</span>
        <span class="toc-text">${displayText}</span>
      </li>
    `;
  }).join('');
  
  container.innerHTML = `
    <button class="message-toc-toggle" title="显示目录（H${headings.length}个标题）">
      ☰
    </button>
    <div class="message-toc-panel">
      <div class="message-toc-header">
        <span>☰</span>
        <span>目录</span>
        <span style="margin-left: auto; font-weight: normal; color: #999; font-size: 11px;">${headings.length} 个</span>
      </div>
      <div class="message-toc-content">
        <ul class="message-toc-list">
          ${tocList}
        </ul>
      </div>
    </div>
  `;
  
  // 添加到页面
  document.body.appendChild(container);
  state.messageTocContainer = container;

  // 动态调整容器位置：让容器左边界对齐消息的右边界，消除消息到目录之间的间隙
  const messageRect = messageDiv.getBoundingClientRect();
  // 容器默认 CSS 为 right: 0; width: 280px，其默认左边界 = viewportWidth - 280
  const defaultContainerLeft = window.innerWidth - 280;
  // 如果消息右边界在容器左边界左侧（存在间隙），则扩展容器左边界以覆盖间隙
  if (messageRect.right < defaultContainerLeft) {
    container.style.left = messageRect.right + 'px';
    container.style.right = '0';
    // 移除固定宽度，改用 left/right 拉伸
    container.style.width = 'auto';
  }
  
  // 绑定事件
  const toggle = container.querySelector('.message-toc-toggle');
  const panel = container.querySelector('.message-toc-panel');
  
  // 鼠标进入目录图标时展开
  toggle.addEventListener('mouseenter', () => {
    panel.classList.add('expanded');
  });
  
  // 点击切换展开/收起
  toggle.addEventListener('click', () => {
    panel.classList.toggle('expanded');
  });
  
  // 鼠标进入目录面板时保持展开
  panel.addEventListener('mouseenter', () => {
    panel.classList.add('expanded');
  });
  
  // 点击目录项滚动定位
  container.querySelectorAll('.message-toc-item').forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.dataset.target;
      const targetHeading = document.getElementById(targetId);
      
      if (targetHeading) {
        // 滚动到标题位置
        targetHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // 添加高亮效果
        targetHeading.classList.add('toc-highlight');
        setTimeout(() => {
          targetHeading.classList.remove('toc-highlight');
        }, 1500);
      }
      
      // 收起目录
      // panel.classList.remove('expanded');
    });
  });
  
  // 默认折叠，用户需要点击按钮展开
}

/**
 * 隐藏目录
 */
function hideMessageToc() {
  // 清除可能存在的延迟隐藏定时器
  if (state.tocHideTimer) {
    clearTimeout(state.tocHideTimer);
    state.tocHideTimer = null;
  }
  
  if (state.messageTocContainer) {
    state.messageTocContainer.remove();
    state.messageTocContainer = null;
  }
}

// clarify-dialog.js - 问题澄清对话框

function formatTimeDisplay(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function playNotificationSound(soundType = 'default') {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // 根据类型设置不同的频率和时长
    const soundConfig = {
      default: { frequency: 800, duration: 0.3 },
      success: { frequency: 523, duration: 0.2 },
      warning: { frequency: 440, duration: 0.4 },
      error: { frequency: 220, duration: 0.5 }
    };
    
    const config = soundConfig[soundType] || soundConfig.default;
    
    oscillator.frequency.value = config.frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + config.duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + config.duration);
    
    console.log('[SidePanel] 提示音已播放:', soundType);
  } catch (error) {
    console.error('[SidePanel] 播放提示音失败:', error.message);
  }
}

function updateClarifyTimer(remainingSeconds, totalSeconds) {
  const timerElement = document.getElementById('clarifyTimer');
  const timerTextElement = document.getElementById('clarifyTimerText');
  
  if (!timerElement || !timerTextElement) return;
  
  // 更新显示文本
  timerTextElement.textContent = `剩余时间: ${formatTimeDisplay(remainingSeconds)}`;
  
  // 计算剩余百分比
  const percentage = (remainingSeconds / totalSeconds) * 100;
  
  // 根据剩余时间设置样式
  timerElement.classList.remove('warning', 'critical');
  
  if (remainingSeconds <= 10) {
    // 最后 10 秒：紧急状态
    timerElement.classList.add('critical');
    timerTextElement.textContent = `即将超时: ${formatTimeDisplay(remainingSeconds)}`;
  } else if (remainingSeconds <= 30 || percentage <= 15) {
    // 最后 30 秒或 15%：警告状态
    timerElement.classList.add('warning');
  }
  
  // 播放提示音（最后 30 秒时）
  if (remainingSeconds === 30) {
    playNotificationSound('warning');
  }
}

function startClarifyTimer(timeoutMs) {
  // 清除之前的计时器
  stopClarifyTimer();
  
  state.clarifyTimeoutValue = timeoutMs;
  const totalSeconds = Math.ceil(timeoutMs / 1000);
  let remainingSeconds = totalSeconds;
  
  // 初始化显示
  updateClarifyTimer(remainingSeconds, totalSeconds);
  
  // 每秒更新倒计时
  state.clarifyTimerInterval = setInterval(() => {
    remainingSeconds--;
    if (remainingSeconds <= 0) {
      stopClarifyTimer();
      // 倒计时结束时的处理由 background.js 负责
    } else {
      updateClarifyTimer(remainingSeconds, totalSeconds);
    }
  }, 1000);
}

function stopClarifyTimer() {
  if (state.clarifyTimerInterval) {
    clearInterval(state.clarifyTimerInterval);
    state.clarifyTimerInterval = null;
  }
}

function showClarifyDialog(data) {
  console.log('[SidePanel] 显示澄清对话框:', data);
  
  const { question, options, recommendedOption, allowCustomInput = true, allowAdditionalInfo = true, toolCallId, timeout = 180000 } = data;
  
  // 保存工具调用ID
  state.currentClarifyToolCallId = toolCallId;
  
  // 使用推荐选项作为默认选中项
  // 如果没有指定推荐选项，默认使用第一个选项
  const finalRecommendedOption = recommendedOption !== undefined && recommendedOption >= 0 ? recommendedOption : 0;
  const finalRecommendedOptions = [finalRecommendedOption];
  const finalDefaultOption = finalRecommendedOption;
  
  // 更新问题显示
  const clarifyQuestion = document.getElementById('clarifyQuestion');
  if (clarifyQuestion) {
    clarifyQuestion.textContent = question;
  }
  
  // 渲染选项列表
  const optionsList = document.getElementById('clarifyOptionsList');
  if (optionsList) {
    // 只移除选项项，保留自定义输入区域
    document.querySelectorAll('.clarify-option-item').forEach(item => {
      item.remove();
    });
    
    options.forEach((option, index) => {
      const isRecommended = finalRecommendedOptions.includes(index);
      const item = document.createElement('div');
      item.className = `clarify-option-item ${finalDefaultOption === index ? 'selected' : ''} ${isRecommended ? 'recommended' : ''}`;
      item.dataset.index = index;
      item.innerHTML = `
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content">${option}${isRecommended ? '<span class="clarify-option-badge">推荐</span>' : ''}</div>
      `;
      item.addEventListener('click', () => selectClarifyOption(index));
      optionsList.appendChild(item);
    });
    
    // 如果允许自定义输入，添加"其他"选项到末尾
    if (allowCustomInput) {
      const otherItem = document.createElement('div');
      otherItem.className = 'clarify-option-item';
      otherItem.dataset.index = -1;
      otherItem.innerHTML = `
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content clarify-option-other">其他（请自定义输入）</div>
      `;
      otherItem.addEventListener('click', () => selectClarifyOption(-1));
      optionsList.appendChild(otherItem);
      
      // 将自定义输入区域移到"其他"选项之后
      const customInput = document.getElementById('clarifyCustomInput');
      if (customInput) {
        optionsList.appendChild(customInput);
      }
    }
  }
  
  // 初始时隐藏自定义输入区域（选择"其他"选项后才显示）
  const customInput = document.getElementById('clarifyCustomInput');
  if (customInput) {
    customInput.classList.remove('show');
  }
  
  // 显示/隐藏补充信息区域
  const additionalInfo = document.getElementById('clarifyAdditionalInfo');
  if (additionalInfo) {
    additionalInfo.classList.toggle('show', allowAdditionalInfo);
  }
  
  // 清空输入框
  const customTextarea = document.getElementById('clarifyCustomTextarea');
  if (customTextarea) {
    customTextarea.value = '';
  }
  const additionalTextarea = document.getElementById('clarifyAdditionalTextarea');
  if (additionalTextarea) {
    additionalTextarea.value = '';
  }
  
  // 显示对话框
  const overlay = document.getElementById('clarifyOverlay');
  if (overlay) {
    overlay.classList.add('show');
  }
  
  // 启动倒计时
  startClarifyTimer(timeout);
  
  console.log('[SidePanel] 澄清对话框已显示');
}

function hideClarifyDialog() {
  const overlay = document.getElementById('clarifyOverlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
  state.currentClarifyToolCallId = null;
  stopClarifyTimer();  // 停止倒计时
  console.log('[SidePanel] 澄清对话框已隐藏');
}

function selectClarifyOption(index) {
  // 移除所有选中状态
  document.querySelectorAll('.clarify-option-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  // 添加当前选中状态 - 根据 dataset.index 查找对应元素
  const selectedItem = document.querySelector(`.clarify-option-item[data-index="${index}"]`);
  if (selectedItem) {
    selectedItem.classList.add('selected');
  }
  
  // 显示/隐藏自定义输入区域
  const customInput = document.getElementById('clarifyCustomInput');
  if (customInput) {
    if (index === -1) {
      // 选择"其他"，显示自定义输入框
      customInput.classList.add('show');
      // 聚焦到自定义输入框
      const customTextarea = document.getElementById('clarifyCustomTextarea');
      if (customTextarea) {
        customTextarea.focus();
      }
    } else {
      // 选择其他选项，隐藏自定义输入框
      customInput.classList.remove('show');
    }
  }
  
  console.log('[SidePanel] 选择澄清选项:', index);
}

function sendClarifyResponse() {
  if (!state.currentClarifyToolCallId) {
    console.error('[SidePanel] 没有当前工具调用ID');
    return;
  }
  
  // 获取选中的选项索引
  let selectedOption = -1;
  document.querySelectorAll('.clarify-option-item').forEach((item, index) => {
    if (item.classList.contains('selected')) {
      selectedOption = parseInt(item.dataset.index);
    }
  });
  
  // 获取自定义输入内容
  const customTextarea = document.getElementById('clarifyCustomTextarea');
  const customInput = customTextarea ? customTextarea.value.trim() : '';
  
  // 获取补充信息
  const additionalTextarea = document.getElementById('clarifyAdditionalTextarea');
  const additionalInfo = additionalTextarea ? additionalTextarea.value.trim() : '';
  
  // 构建响应数据
  const responseData = {
    type: 'CLARIFY_RESPONSE',
    toolCallId: state.currentClarifyToolCallId,
    selectedOption,
    customInput,
    additionalInfo
  };
  
  console.log('[SidePanel] 发送澄清响应:', responseData);
  
  // 发送消息到 background.js（不需要回调响应）
  chrome.runtime.sendMessage(responseData);
  
  // 隐藏对话框
  hideClarifyDialog();
}

function cancelClarify() {
  if (state.currentClarifyToolCallId) {
    // 发送取消响应（不需要回调响应）
    const responseData = {
      type: 'CLARIFY_RESPONSE',
      toolCallId: state.currentClarifyToolCallId,
      selectedOption: -1,
      customInput: '',
      additionalInfo: ''
    };
    
    chrome.runtime.sendMessage(responseData);
  }
  
  hideClarifyDialog();
}

function initClarifyEvents() {
  // 确认按钮
  const confirmBtn = document.getElementById('clarifyConfirmBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', sendClarifyResponse);
  }
  
  // 取消按钮
  const cancelBtn = document.getElementById('clarifyCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelClarify);
  }
  
  // 不响应遮罩层点击关闭（防止误触导致澄清卡死）
  
  // 监听来自 background.js 的澄清请求
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SHOW_CLARIFY_DIALOG') {
      console.log('[SidePanel] 收到澄清请求:', message);
      showClarifyDialog(message.data);
      sendResponse({ success: true });
    } else if (message.type === 'PLAY_NOTIFICATION_SOUND') {
      console.log('[SidePanel] 收到播放提示音请求:', message);
      playNotificationSound(message.soundType);
      sendResponse({ success: true });
    } else if (message.type === 'CLARIFY_TIMEOUT') {
      console.log('[SidePanel] 收到澄清超时通知:', message);
      // 更新倒计时显示为超时状态
      const timerElement = document.getElementById('clarifyTimer');
      const timerTextElement = document.getElementById('clarifyTimerText');
      if (timerElement && timerTextElement) {
        timerElement.classList.remove('warning');
        timerElement.classList.add('critical');
        timerTextElement.textContent = '已超时';
      }
      playNotificationSound('error');
    }
  });
  
  console.log('[SidePanel] 澄清对话框事件已初始化');
}

// markdown-render.js - Markdown rendering utility functions

/**
 * 格式化 Markdown 文本
 */
function formatMarkdown(text) {
  if (!text) return '';
  
  // 提取 mermaid 图表并替换为占位符
  const mermaidBlocks = [];
  text = text.replace(/```mermaid\n?([\s\S]*?)```/g, (match, content) => {
    const index = mermaidBlocks.length;
    mermaidBlocks.push(content.trim());
    return `%%MERMAID_BLOCK_${index}%%`;
  });
  
  // 提取代码块并替换为占位符（保留语言标识）
  const codeBlocks = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, language, content) => {
    const index = codeBlocks.length;
    codeBlocks.push({ language: language || 'text', content: content.trim() });
    return `%%CODE_BLOCK_${index}%%`;
  });
  
  // 提取表格并替换为占位符
  const tableBlocks = [];
  text = text.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm, (match, header, separator, body) => {
    const index = tableBlocks.length;
    tableBlocks.push({ header, separator, body, full: match.trim() });
    // 在占位符前后添加换行符，确保表格作为独立块级元素，避免被标题包裹
    return `\n%%TABLE_BLOCK_${index}%%\n`;
  });
  
  // 使用 marked 解析 Markdown
  let html = '';
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
    html = marked.parse(text);
  } else {
    // 降级处理：简单的格式化
    html = text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }
  
  // 还原 mermaid 图表占位符
  mermaidBlocks.forEach((content, index) => {
    html = html.replace(`%%MERMAID_BLOCK_${index}%%`, `<div class="mermaid" data-raw-code="${encodeURIComponent(content)}">${content}</div>`);
  });
  
  // 还原代码块占位符
  codeBlocks.forEach((block, index) => {
    const escapedContent = block.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    
    html = html.replace(
      `%%CODE_BLOCK_${index}%%`,
      `<div class="code-block-container" style="position: relative;">
        <button class="code-copy-btn" data-code="${index}" title="复制代码">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
          </svg>
        </button>
        <pre><code class="language-${block.language}">${escapedContent}</code></pre>
      </div>`
    );
  });
  
  // 还原表格占位符
  tableBlocks.forEach((table, index) => {
    html = html.replace(`%%TABLE_BLOCK_${index}%%`, createTableHTML(table));
  });
  
  return html;
}

/**
 * 解析单元格内的内联 Markdown（加粗、斜体、代码等）
 */
function parseInlineMarkdown(text) {
  if (!text) return '';
  
  // 先转义 HTML（防止 XSS）
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // 解析行内代码 `` （必须在加粗之前处理，避免冲突）
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // 解析加粗 **text**
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // 解析斜体 *text*
  escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // 解析删除线 ~~text~~
  escaped = escaped.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  
  return escaped;
}

/**
 * 创建表格 HTML（含工具栏按钮）
 */
function createTableHTML(tableData) {
  const { header, body, full } = tableData;
  const tableIndex = window.__tableBlocks ? window.__tableBlocks.length : 0;
  
  // 存储原始表格数据
  if (window.__tableBlocks) {
    window.__tableBlocks[tableIndex] = { full, header, body };
  }
  
  // 解析表头
  const headers = header.split('|').filter(cell => cell.trim()).map(cell => parseInlineMarkdown(cell.trim()));
  
  // 解析表格行数据
  const rows = body.trim().split('\n').filter(row => row.trim()).map(row => {
    return row.split('|').filter(cell => cell.trim()).map(cell => parseInlineMarkdown(cell.trim()));
  });
  
  // 构建表格 HTML
  let tableHTML = '<div class="table-container-wrapper"><table>';
  
  // 表头
  tableHTML += '<thead><tr>';
  headers.forEach((headerCell, index) => {
    const isLastColumn = index === headers.length - 1;
    if (isLastColumn) {
      // 最后一列，添加包裹容器和工具栏
      tableHTML += `<th class="table-header-cell-wrapper">
        ${headerCell}
        <div class="table-toolbar">
          <button class="table-toolbar-btn copy-md-btn" title="复制 Markdown 表格" data-table-index="${tableIndex}">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
            </svg>
          </button>
          <button class="table-toolbar-btn download-excel-btn" title="下载 Excel" data-table-index="${tableIndex}">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
              <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
            </svg>
          </button>
        </div>
      </th>`;
    } else {
      tableHTML += `<th>${headerCell}</th>`;
    }
  });
  tableHTML += '</tr></thead>';
  
  // 表格主体
  tableHTML += '<tbody>';
  rows.forEach(row => {
    tableHTML += '<tr>';
    row.forEach(cell => {
      tableHTML += `<td>${cell}</td>`;
    });
    tableHTML += '</tr>';
  });
  tableHTML += '</tbody>';
  
  tableHTML += '</table></div>';
  
  return tableHTML;
}

/**
 * 下载表格为 Excel（CSV 格式）
 */
function downloadTableAsExcel(tableBlock) {
  try {
    const { header, body } = tableBlock;
    
    // 解析表头
    const headers = header.split('|').filter(cell => cell.trim()).map(cell => cell.trim());
    
    // 解析表格行数据
    const rows = body.trim().split('\n').filter(row => row.trim()).map(row => {
      return row.split('|').filter(cell => cell.trim()).map(cell => cell.trim());
    });
    
    // 转换为 CSV 格式
    let csvContent = '\uFEFF'; // BOM for UTF-8
    
    // 添加表头
    csvContent += headers.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
    
    // 添加数据行
    rows.forEach(row => {
      csvContent += row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
    });
    
    // 创建 Blob 并下载
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `table-${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('[SidePanel] Excel 下载成功');
  } catch (error) {
    console.error('[SidePanel] 下载 Excel 失败:', error);
    showToast('下载失败: ' + error.message, 'error');
  }
}

/**
 * 渲染所有 mermaid 图表
 */
async function renderMermaidCharts() {
  if (typeof mermaid === 'undefined') {
    console.warn('[SidePanel] Mermaid 库未加载');
    return;
  }
  
  console.log('[SidePanel] ===== renderMermaidCharts 开始 =====');
  
  const mermaidElements = document.querySelectorAll('.mermaid');
  console.log('[SidePanel] 找到 mermaid 元素数量:', mermaidElements.length);
  
  if (mermaidElements.length === 0) {
    return;
  }
  
  // 逐个渲染 mermaid 元素，避免单个失败影响其他图表
  for (let i = 0; i < mermaidElements.length; i++) {
    const container = mermaidElements[i];
    try {
      await mermaid.run({
        nodes: [container]
      });
      console.log('[SidePanel] 第', i + 1, '个 mermaid 图表渲染成功');
      
      // 为每个渲染好的图表添加工具栏
      addMermaidControls(container);
    } catch (error) {
      console.error('[SidePanel] 第', i + 1, '个 mermaid 图表渲染失败:', error);
      // 只在没有 SVG 且没有工具栏时才显示错误信息
      if (!container.querySelector('svg') && !container.querySelector('.mermaid-controls')) {
        container.innerHTML = `<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0;">图表渲染失败: ${error.message}</div>`;
      }
    }
  }
  
  console.log('[SidePanel] ===== renderMermaidCharts 完成 =====');
}

/**
 * 格式化消息内容（Markdown 渲染）
 */
function formatMessageContent(text) {
  if (!text) return '';
  return `<div class="markdown-body">${formatMarkdown(text)}</div>`;
}

/**
 * 为 mermaid 容器添加缩放/拖拽/复制控件
 */
function addMermaidControls(container) {
  // 检查是否已经添加工具栏
  if (container.querySelector('.mermaid-controls')) {
    console.log('[SidePanel] 工具栏已存在，跳过');
    return;
  }
  
  // 等待 SVG 渲染完成
  const svgElement = container.querySelector('svg');
  if (!svgElement) {
    console.warn('[SidePanel] SVG 元素未找到，当前内容:', container.innerHTML.substring(0, 100));
    return;
  }
  
  console.log('[SidePanel] 找到 SVG 元素，开始添加工具栏');
  console.log('[SidePanel] container 类名:', container.className);
  console.log('[SidePanel] container HTML:', container.innerHTML.substring(0, 200));
  
  // 设置 container 为 relative 定位
  container.style.position = 'relative';
  container.style.cursor = 'grab';
  container.style.userSelect = 'none';
  container.style.webkitUserSelect = 'none';
  
  // 创建 SVG 包装器
  let svgWrapper = container.querySelector('.mermaid-svg-wrapper');
  if (!svgWrapper) {
    svgWrapper = document.createElement('div');
    svgWrapper.className = 'mermaid-svg-wrapper';
    svgWrapper.style.transformOrigin = 'center center';
    svgWrapper.style.transition = 'transform 0.2s ease';
    svgWrapper.style.display = 'inline-block';
    svgWrapper.style.width = '100%';
    
    // 将 SVG 移入包装器
    svgElement.style.maxWidth = '100%';
    svgElement.style.height = 'auto';
    svgElement.style.userSelect = 'none';
    svgElement.style.webkitUserSelect = 'none';
    svgWrapper.appendChild(svgElement);
    container.insertBefore(svgWrapper, container.firstChild);
    
    // 隐藏原始的 mermaid 代码文本（只显示渲染后的 SVG）
    // 只移除文本节点，保留所有元素节点（如工具栏等）
    const nodesToRemove = [];
    Array.from(container.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        nodesToRemove.push(node);
      }
    });
    nodesToRemove.forEach(node => node.remove());
  }
  
  // 创建控制按钮（使用 Unicode 字符）
  const controls = document.createElement('div');
  controls.className = 'mermaid-controls';
  controls.innerHTML = `
    <button class="zoom-in" title="放大">+</button>
    <button class="zoom-out" title="缩小">−</button>
    <button class="reset-zoom" title="重置">↺</button>
    <button class="copy-to-clipboard" title="复制到剪贴板">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    </button>
    <button class="download-png" title="下载图片">↓</button>
    <button class="view-source" title="查看源代码">&lt;/&gt;</button>
  `;
  
  container.appendChild(controls);
  console.log('[SidePanel] 工具栏 HTML 已添加');
  console.log('[SidePanel] container 子元素:', Array.from(container.children).map(c => c.className).join(', '));
  
  // 缩放状态
  let scale = 1;
  const MIN_SCALE = 0.3;
  const MAX_SCALE = 3;
  const SCALE_STEP = 0.15;
  
  // 保存原始的 mermaid 源代码（优先使用 data-raw-code 属性中保存的原始代码）
  let rawSourceCode = container.dataset.rawCode || '';
  
  if (!rawSourceCode) {
    // 尝试从 SVG 的 title 元素获取源代码
    const titleEl = svgElement.querySelector('title');
    if (titleEl && titleEl.textContent) {
      rawSourceCode = titleEl.textContent.trim();
    }
  }
  
  // 如果 title 中没有，尝试从 SVG 的 comment 中获取
  if (!rawSourceCode) {
    const commentEl = svgElement.querySelector('script[type="text/plain"]');
    if (commentEl) {
      rawSourceCode = commentEl.textContent.trim();
    }
  }
  
  // 记录原始源代码到 container 的 data 属性上
  if (rawSourceCode && !container.dataset.rawMermaidCode) {
    container.dataset.rawMermaidCode = rawSourceCode;
  }
  
  // 查看源代码按钮事件 - 使用保存的原始源代码
  const viewSourceBtn = controls.querySelector('.view-source');
  viewSourceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // 从 data-raw-code 属性获取原始源代码（URL 编码）
    const rawCodeAttr = container.getAttribute('data-raw-code');
    const sourceCode = rawCodeAttr ? decodeURIComponent(rawCodeAttr) : container.dataset.rawMermaidCode || '';
    toggleMermaidSourceView(container, sourceCode, svgWrapper);
  });
  
  // 复制到剪贴板按钮事件
  controls.querySelector('.copy-to-clipboard').addEventListener('click', (e) => {
    e.stopPropagation();
    copyMermaidToClipboard(svgElement);
  });
  
  // 下载 PNG
  controls.querySelector('.download-png').addEventListener('click', (e) => {
    e.stopPropagation();
    downloadMermaidPNG(svgElement);
  });
  
  // 鼠标滚轮缩放（需要同时按下 Ctrl 或 Cmd 键）
  container.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return; // 只有按下 Ctrl 或 Cmd 键时才缩放
    
    e.preventDefault();
    e.stopPropagation();
    
    if (e.deltaY < 0) {
      scale = Math.min(MAX_SCALE, scale + SCALE_STEP);
    } else {
      scale = Math.max(MIN_SCALE, scale - SCALE_STEP);
    }
    applyTransform();
  }, { passive: false });
  
  // 拖拽状态
  let isDragging = false;
  let startX, startY, translateX = 0, translateY = 0;
  
  // 应用变换
  function applyTransform() {
    svgWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }
  
  // 放大
  controls.querySelector('.zoom-in').addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.min(MAX_SCALE, scale + SCALE_STEP);
    applyTransform();
  });
  
  // 缩小
  controls.querySelector('.zoom-out').addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.max(MIN_SCALE, scale - SCALE_STEP);
    applyTransform();
  });
  
  // 重置
  controls.querySelector('.reset-zoom').addEventListener('click', (e) => {
    e.stopPropagation();
    scale = 1;
    translateX = 0;
    translateY = 0;
    applyTransform();
  });
  
  // 拖拽功能
  container.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    container.style.cursor = 'grabbing';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    applyTransform();
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      container.style.cursor = 'grab';
    }
  });
}

/**
 * 将 Mermaid 图表复制到剪贴板（作为图片）
 */
async function copyMermaidToClipboard(svgElement, svgWrapper, scale) {
  try {
    console.log('[SidePanel] 开始复制到剪贴板');
    
    // 获取 SVG 的原始尺寸
    let svgWidth = svgElement.width.baseVal?.value || svgElement.getAttribute('width')?.replace('px', '') || 800;
    let svgHeight = svgElement.height.baseVal?.value || svgElement.getAttribute('height')?.replace('px', '') || 600;
    
    // 如果有 viewBox，优先使用 viewBox 的尺寸
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(' ').map(parseFloat);
      svgWidth = parts[2];
      svgHeight = parts[3];
    }
    
    console.log('[SidePanel] SVG 原始尺寸:', svgWidth, 'x', svgHeight);
    
    // 将 SVG 转换为 base64 编码的 data URL
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
    const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
    
    const img = new Image();
    
    img.onload = function() {
      const padding = 20;
      const scaleFactor = 2; // 2x 分辨率
      const canvasWidth = svgWidth + padding * 2;
      const canvasHeight = svgHeight + padding * 2;
      
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth * scaleFactor;
      canvas.height = canvasHeight * scaleFactor;
      const ctx = canvas.getContext('2d');
      
      // 设置白色背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 绘制图片（带内边距）
      ctx.drawImage(img, padding * scaleFactor, padding * scaleFactor, svgWidth * scaleFactor, svgHeight * scaleFactor);
      
      // 使用 toBlob 导出 PNG
      canvas.toBlob(function(blob) {
        if (blob) {
          // 尝试使用 Clipboard API 写入图片
          if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
            navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]).then(() => {
              console.log('[SidePanel] 图片复制到剪贴板成功');
              showToast('Mermaid 图表已复制到剪贴板！', 'success');
            }).catch(err => {
              console.error('[SidePanel] 复制到剪贴板失败:', err);
              // 降级：提示用户手动复制或使用下载功能
              showToast('复制失败，您的浏览器可能不支持此功能。请尝试使用下载按钮保存图表。', 'error');
            });
          } else {
            // 降级方案：提示用户
            console.warn('[SidePanel] Clipboard API 不可用，降级为下载');
            showToast('当前浏览器不支持图片复制功能，已自动转为下载。', 'warning');
            // 自动触发下载
            const downloadLink = document.createElement('a');
            downloadLink.href = URL.createObjectURL(blob);
            downloadLink.download = 'mermaid-diagram-' + Date.now() + '.png';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
          }
        }
      }, 'image/png');
    };
    
    img.onerror = function(error) {
      console.error('[SidePanel] 图片转换失败:', error);
      showToast('图片转换失败，请重试', 'error');
    };
    
    img.src = dataUrl;
  } catch (error) {
    console.error('[SidePanel] 复制到剪贴板失败:', error);
    showToast('复制失败: ' + error.message, 'error');
  }
}

/**
 * 下载 Mermaid 图表为 PNG
 */
function downloadMermaidPNG(svgElement, scale) {
  try {
    console.log('[SidePanel] 开始下载 PNG');
    
    // 获取 SVG 的原始尺寸
    let svgWidth = svgElement.width.baseVal?.value || svgElement.getAttribute('width')?.replace('px', '') || 800;
    let svgHeight = svgElement.height.baseVal?.value || svgElement.getAttribute('height')?.replace('px', '') || 600;
    
    // 如果有 viewBox，优先使用 viewBox 的尺寸
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(' ').map(parseFloat);
      svgWidth = parts[2];
      svgHeight = parts[3];
    }
    
    console.log('[SidePanel] SVG 原始尺寸:', svgWidth, 'x', svgHeight);
    
    // 将 SVG 转换为 base64 编码的 data URL，避免跨域问题
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
    const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
    
    const img = new Image();
    
    img.onload = function() {
      console.log('[SidePanel] SVG 图片加载成功');
      
      const padding = 20;
      const scaleFactor = 2; // 2x 分辨率
      const canvasWidth = svgWidth + padding * 2;
      const canvasHeight = svgHeight + padding * 2;
      
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth * scaleFactor;
      canvas.height = canvasHeight * scaleFactor;
      const ctx = canvas.getContext('2d');
      
      // 设置白色背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 绘制图片（带内边距）
      ctx.drawImage(img, padding * scaleFactor, padding * scaleFactor, svgWidth * scaleFactor, svgHeight * scaleFactor);
      
      // 使用 toBlob 导出
      canvas.toBlob(function(blob) {
        const pngUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = 'mermaid-diagram-' + Date.now() + '.png';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(pngUrl);
        
        console.log('[SidePanel] PNG 下载成功');
      }, 'image/png');
    };
    
    img.onerror = function(error) {
      console.error('[SidePanel] PNG 转换失败:', error);
      showToast('PNG 转换失败，请重试', 'error');
    };
    
    img.src = dataUrl;
  } catch (error) {
    console.error('[SidePanel] 下载 PNG 失败:', error);
    showToast('下载失败: ' + error.message, 'error');
  }
}

/**
 * 切换 Mermaid 图表源代码查看模式
 */
function toggleMermaidSourceView(container, sourceCode, svgWrapper, svgElement, currentScale, scaleConfig) {
  const sourceView = container.querySelector('.mermaid-source-view');
  const controls = container.querySelector('.mermaid-controls');
  
  if (sourceView) {
    // 当前是源代码视图，切换回图表视图
    if (sourceView.parentElement) {
      sourceView.parentElement.remove();
    }
    
    // 重新显示 SVG 包装器
    if (svgWrapper) {
      svgWrapper.style.display = 'inline-block';
    }
    
    // 重新添加工具栏
    addMermaidControls(container);
  } else {
    // 当前是图表视图，切换到源代码视图
    
    // 隐藏 SVG 包装器
    if (svgWrapper) {
      svgWrapper.style.display = 'none';
    }
    
    // 移除旧的工具栏
    if (controls) {
      controls.remove();
    }
    
    // 创建源代码视图容器
    const sourceWrapper = document.createElement('div');
    sourceWrapper.className = 'mermaid-container-wrapper';
    sourceWrapper.style.position = 'relative';
    
    // 创建源代码显示区域
    const sourcePre = document.createElement('pre');
    sourcePre.className = 'mermaid-source-view';
    sourcePre.style.position = 'relative';
    sourcePre.textContent = sourceCode;
    
    // 创建复制按钮
    const copyBtn = document.createElement('button');
    copyBtn.className = 'source-copy-btn';
    copyBtn.title = '复制源代码';
    copyBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    `;
    
    // 复制按钮事件
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(sourceCode, copyBtn);
    });
    
    // 创建切换回图表视图的按钮
    const backToChartBtn = document.createElement('button');
    backToChartBtn.className = 'source-copy-btn';
    backToChartBtn.style.right = '44px';
    backToChartBtn.title = '返回图表';
    backToChartBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a1.25 1.25 0 0 0 0 1.32l1.965 2.36a.25.25 0 0 1-.192.41h-3.932a.25.25 0 0 1-.192-.41l-1.966-2.36a1.25 1.25 0 0 0 0-1.32l1.966-2.36a.25.25 0 0 1 .192-.41zm-6.068 0H1.534a.25.25 0 0 0-.192.41l1.966 2.36a1.25 1.25 0 0 1 0 1.32l-1.966 2.36A.25.25 0 0 0 1.534 14h3.932a.25.25 0 0 0 .192-.41l-1.966-2.36a1.25 1.25 0 0 1 0-1.32l1.966-2.36a.25.25 0 0 0-.192-.41z"/>
      </svg>
    `;
    
    // 切换回图表视图按钮事件
    backToChartBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMermaidSourceView(container, sourceCode, svgWrapper);
    });
    
    // 组装 DOM
    sourcePre.appendChild(copyBtn);
    sourcePre.appendChild(backToChartBtn);
    sourceWrapper.appendChild(sourcePre);
    container.appendChild(sourceWrapper);
  }
}

/**
 * 在消息添加后渲染 mermaid
 */
async function renderMessageMermaid(messageDiv) {
  console.log('[SidePanel] ===== renderMessageMermaid 开始 =====');
  
  if (typeof mermaid === 'undefined') {
    console.warn('[SidePanel] Mermaid 库未加载');
    return;
  }
  
  // 等待 DOM 完全更新
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // 获取消息中所有的 mermaid 元素
  const mermaidElements = messageDiv.querySelectorAll('.mermaid');
  console.log('[SidePanel] 找到 mermaid 元素数量:', mermaidElements.length);
  
  if (mermaidElements.length === 0) {
    console.log('[SidePanel] 未找到 mermaid 元素');
    return;
  }
  
  try {
    // 批量渲染所有 mermaid 元素
    await mermaid.run({
      nodes: Array.from(mermaidElements)
    });
    
    console.log('[SidePanel] Mermaid.run 完成');
    
    // 等待 SVG 完全渲染
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 为每个渲染好的图表添加工具栏
    mermaidElements.forEach((container, index) => {
      console.log('[SidePanel] 开始为第', index + 1, '个图表添加工具栏');
      addMermaidControls(container);
    });
    
    // 验证工具栏是否添加成功
    await new Promise(resolve => setTimeout(resolve, 100));
    const controls = messageDiv.querySelectorAll('.mermaid-controls');
    console.log('[SidePanel] 工具栏添加结果:', controls.length, '个成功');
  } catch (error) {
    console.error('[SidePanel] Mermaid 渲染失败:', error);
    mermaidElements.forEach(mermaidDiv => {
      if (!mermaidDiv.querySelector('svg') && !mermaidDiv.querySelector('.mermaid-controls')) {
        mermaidDiv.innerHTML = `<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px;">图表渲染失败: ${error.message}</div>`;
      }
    });
  }
  
  // 添加代码块复制按钮事件
  addCodeCopyButtons();
}

/**
 * 添加代码块复制按钮事件
 */
function addCodeCopyButtons() {
  const copyButtons = document.querySelectorAll('.code-copy-btn');
  console.log('[SidePanel] 找到代码复制按钮数量:', copyButtons.length);
  
  copyButtons.forEach((btn, index) => {
    // 避免重复绑定
    if (btn.dataset.bound) {
      console.log('[SidePanel] 按钮', index, '已绑定，跳过');
      return;
    }
    btn.dataset.bound = 'true';
    
    btn.addEventListener('click', (e) => {
      console.log('[SidePanel] 代码复制按钮被点击');
      e.stopPropagation();
      // 从父容器获取代码，而不是全局查询
      const container = btn.closest('.code-block-container');
      console.log('[SidePanel] 找到容器:', !!container);
      if (container) {
        const codeElement = container.querySelector('pre code');
        console.log('[SidePanel] 找到代码元素:', !!codeElement);
        if (codeElement) {
          const codeText = codeElement.textContent;
          console.log('[SidePanel] 代码长度:', codeText.length);
          copyToClipboard(codeText, btn);
        }
      }
    });
    console.log('[SidePanel] 已绑定按钮', index);
  });
  
  // 添加表格工具栏按钮事件
  addTableToolbarEvents();
}

/**
 * 添加表格工具栏按钮事件
 */
function addTableToolbarEvents() {
  // 复制 Markdown 表格按钮
  document.querySelectorAll('.copy-md-btn').forEach((btn, index) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tableIndex = btn.dataset.tableIndex;
      const tableBlock = window.__tableBlocks?.[parseInt(tableIndex)];
      if (tableBlock) {
        copyToClipboard(tableBlock.full, btn);
      }
    });
  });
  
  // 下载 Excel 按钮
  document.querySelectorAll('.download-excel-btn').forEach((btn, index) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tableIndex = btn.dataset.tableIndex;
      const tableBlock = window.__tableBlocks?.[parseInt(tableIndex)];
      if (tableBlock) {
        downloadTableAsExcel(tableBlock);
      }
    });
  });
}

// chat-manager.js - 聊天管理模块

// ============================================================
// 辅助函数（仅在模块内使用）
// ============================================================

function setQuoteContext(content) {
  state.quotedContextText = content;
  const indicator = document.getElementById('selectionIndicator');
  const selectionText = document.getElementById('selectionText');
  const userInput = document.getElementById('userInput');
  
  if (indicator && selectionText && userInput) {
    let displayText;
    if (content.length > 100) {
      displayText = content.substring(0, 100) + '...';
    } else if (content.length > 50) {
      displayText = content.substring(0, 50) + '...';
    } else {
      displayText = content;
    }
    selectionText.textContent = `💬 已引用: ${displayText}`;
    indicator.classList.add('show');
  }
}

function clearSelectedContext$1() {
  console.log('[SidePanel] 清除选中内容上下文');
  state.selectedContextText = '';
  state.quotedContextText = '';
  const indicator = document.getElementById('selectionIndicator');
  const userInput = document.getElementById('userInput');
  
  if (indicator) {
    indicator.classList.remove('show');
    console.log('[SidePanel] 已隐藏选中内容提示条');
  }
  
  if (typeof window.hideFloatingMenu === 'function') {
    window.hideFloatingMenu();
  }
  
  if (userInput && userInput.value.startsWith('[选中内容]')) {
    const lines = userInput.value.split('\n');
    const questionStartIndex = lines.findIndex(line => line.startsWith('[用户问题]'));
    if (questionStartIndex !== -1) {
      userInput.value = lines.slice(questionStartIndex + 1).join('\n').trim();
    } else {
      userInput.value = '';
    }
  }
}

// ============================================================
// 聊天历史管理
// ============================================================

async function loadChatHistory() {
  chrome.storage.local.get(['chatHistory', 'scrollPosition'], (result) => {
    if (result.chatHistory && result.chatHistory.length > 0) {
      state.messageHistory = result.chatHistory;
      state.messageHistory.forEach(msg => {
        addMessage(msg.role, msg.content, false, msg.executionLog || []);
      });
      const welcomeMessage = document.querySelector('.welcome-message');
      if (welcomeMessage) {
        welcomeMessage.remove();
      }
      
      renderMermaidCharts();
      
      if (result.scrollPosition !== undefined) {
        setTimeout(() => {
          const chatContainerEl = document.getElementById('chatContainer');
          chatContainerEl.scrollTop = result.scrollPosition;
        }, 100);
      }
    }
  });
}

function saveChatHistory() {
  const trimmedHistory = state.messageHistory.slice(-state.chatConfig.maxHistoryMessages);
  
  const sanitizedHistory = trimmedHistory.map(msg => ({
    role: msg.role,
    content: msg.content.substring(0, state.chatConfig.maxMessageLength),
    executionLog: msg.executionLog || []
  }));
  
  try {
    chrome.storage.local.set({ chatHistory: sanitizedHistory }, (error) => {
      if (chrome.runtime.lastError) {
        console.error('[SidePanel] 保存对话历史失败:', chrome.runtime.lastError.message);
        if (state.messageHistory.length > 5) {
          state.messageHistory = state.messageHistory.slice(-5);
          const reducedHistory = state.messageHistory.map(msg => ({
            role: msg.role,
            content: msg.content.substring(0, 2000),
            executionLog: msg.executionLog || []
          }));
          chrome.storage.local.set({ chatHistory: reducedHistory }, () => {
            if (chrome.runtime.lastError) {
              console.error('[SidePanel] 再次保存失败:', chrome.runtime.lastError.message);
            } else {
              console.log('[SidePanel] 截断后保存成功，消息数:', reducedHistory.length);
            }
          });
        }
      } else {
        console.log('[SidePanel] 对话历史已保存，消息数:', sanitizedHistory.length);
      }
    });
  } catch (e) {
    console.error('[SidePanel] 保存对话历史异常:', e);
  }
}

function clearChatHistory() {
  state.messageHistory = [];
  chrome.storage.local.remove(['chatHistory', 'scrollPosition'], () => {
    const chatContainer = document.getElementById('chatContainer');
    chatContainer.innerHTML = `
      <div class="welcome-message">
        <div class="icon">💬</div>
        <h2>开始对话</h2>
        <p>输入您的问题，AI 助手将为您解答</p>
      </div>
    `;
    console.log('[SidePanel] 对话历史已清除');
  });
}

function exportChatHistory() {
  if (!state.messageHistory || state.messageHistory.length === 0) {
    showToast('当前没有对话历史可导出', 'warning');
    return;
  }
  
  const exportData = state.messageHistory.map((msg, index) => {
    const messageDiv = document.querySelectorAll('.message')[index];
    let timestamp = null;
    
    if (messageDiv && messageDiv.dataset.timestamp) {
      timestamp = messageDiv.dataset.timestamp;
    } else {
      timestamp = new Date().toISOString();
    }
    
    return {
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content || '',
      timestamp: timestamp,
      displayName: msg.role === 'user' ? '我' : 'AI助手'
    };
  });
  
  const now = new Date();
  const ts = now.getFullYear() + 
    String(now.getMonth() + 1).padStart(2, '0') + 
    String(now.getDate()).padStart(2, '0') + '-' + 
    String(now.getHours()).padStart(2, '0') + 
    String(now.getMinutes()).padStart(2, '0') + 
    String(now.getSeconds()).padStart(2, '0');
  
  const fileName = `ai-helper-${ts}.json`;
  const jsonData = JSON.stringify(exportData, null, 2);
  
  const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  console.log('[SidePanel] 对话历史已导出:', fileName, '共', exportData.length, '条消息');
  showToast(`对话历史已导出 (${exportData.length} 条消息)`, 'success');
}

// ============================================================
// 模态框
// ============================================================

function showModal() {
  const confirmModal = document.getElementById('confirmModal');
  confirmModal.classList.add('show');
}

function hideModal() {
  const confirmModal = document.getElementById('confirmModal');
  confirmModal.classList.remove('show');
}

// ============================================================
// 消息发送
// ============================================================

async function sendMessage() {
  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const chatContainer = document.getElementById('chatContainer');
  
  const text = userInput.value.trim();
  if (!text || state.isGenerating) return;
  
  const welcomeMessage = chatContainer.querySelector('.welcome-message');
  if (welcomeMessage) {
    welcomeMessage.remove();
  }

  let finalText = text;
  const hasSelectedContext = state.enableSelectionQuery && state.selectedContextText && state.selectedContextText.trim();
  const hasQuotedContext = state.quotedContextText && state.quotedContextText.trim();
  
  if (hasQuotedContext) {
    const ctx = state.quotedContextText.trim();
    finalText = `[引用内容]\n${ctx}\n\n[用户问题]\n${text}`;
    addContextBubble('quoted', ctx, false);
    state.quotedContextText = '';
  } else if (hasSelectedContext) {
    const ctx = state.selectedContextText.trim();
    finalText = `[选中内容]\n${ctx}\n\n[用户问题]\n${text}`;
    addContextBubble('selected', ctx, false);
    state.selectedContextText = '';
  }
  

  addMessage('user', text);
  
  state.messageHistory.push({ role: 'user', content: finalText });
  
  saveChatHistory();
  
  addToInputHistory(text);

  userInput.value = '';
  userInput.style.height = 'auto';
  
  if (hasSelectedContext || hasQuotedContext) {
    clearSelectedContext$1();
  }

  state.isGenerating = true;
  sendBtn.disabled = true;

  const loadingId = addLoadingMessage();

  const model = state.currentModel;

  try {
    await ensureChatConfigLoaded();
    
    console.log('[SidePanel] 发送消息调试信息:');
    console.log('  - isolateChat:', state.isolateChat);
    console.log('  - chatConfig:', state.chatConfig);
    console.log('  - messageHistory.length:', state.messageHistory.length);
    
    let messages = [
      {
        role: 'system',
        content: getSystemPrompt()
      }
    ];
    
    if (state.isolateChat) {
      let historyToSend = state.messageHistory;
      if (state.chatConfig.maxMemoryMessages !== null && state.chatConfig.maxMemoryMessages !== undefined && state.chatConfig.maxMemoryMessages > 0) {
        const historyWithoutCurrent = state.messageHistory.slice(0, -1);
        const limitedHistory = historyWithoutCurrent.slice(-state.chatConfig.maxMemoryMessages);
        historyToSend = [...limitedHistory, state.messageHistory[state.messageHistory.length - 1]];
        console.log('[SidePanel] 记忆历史限制生效:', state.chatConfig.maxMemoryMessages, '条（不含当前消息），实际发送:', historyToSend.length, '条');
      } else {
        console.log('[SidePanel] 记忆历史限制未生效:', state.chatConfig.maxMemoryMessages);
      }
      messages = [...messages, ...historyToSend];
    } else {
      messages.push({ role: 'user', content: finalText });
    }

    const apiParams = await getApiParams();
    let content, executionLog;
    
    try {
      const result = await callApi(messages, model, state.useTools, apiParams);
      content = result.content;
      executionLog = result.executionLog || [];
    } catch (errorResult) {
      removeLoadingMessage(loadingId);
      
      content = '❌ 请求失败：' + (errorResult.message || '未知错误');
      executionLog = errorResult.executionLog || [];
      
      const messageDiv = addMessage('assistant', content, true, executionLog);
      
      state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog });
      
      saveChatHistory();
      
      throw errorResult;
    }
    
    removeLoadingMessage(loadingId);
    
    const messageDiv = addMessage('assistant', content, true, executionLog);
    
    await renderMessageMermaid(messageDiv);
    
    state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog });
    
    saveChatHistory();
    
  } catch (error) {
  } finally {
    state.isGenerating = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

// 处理选中文本 AI 搜索：复用现有的选中内容上下文机制
function triggerSelectionSearch(prompt, selectedText) {
  const userInput = document.getElementById('userInput');
  
  if (!selectedText || state.isGenerating) {
    console.log('[SidePanel] triggerSelectionSearch 跳过:', { hasText: !!selectedText, isGenerating: state.isGenerating });
    return;
  }
  
  // 保存原有的 enableSelectionQuery 状态
  const prevEnableSelectionQuery = state.enableSelectionQuery;
  
  // 设置选中内容上下文（复用现有机制，会显示上下文气泡 + [选中内容] 格式）
  state.enableSelectionQuery = true;
  state.selectedContextText = selectedText;
  state.quotedContextText = '';
  
  // 设置输入框内容为搜索提示词
  const searchPrompt = '搜索一下';
  userInput.value = searchPrompt;
  userInput.dispatchEvent(new Event('input'));
  
  // 发送消息（sendMessage 内部会同步处理 selectedContextText，生成 [选中内容]...[用户问题] 格式）
  sendMessage();
  
  // 上下文处理完成后，临时禁用选中内容查询，防止 setInterval 重复显示指示器
  // 1.5 秒后恢复原有状态（此时页面选中文本已被清除，不会再触发）
  state.enableSelectionQuery = false;
  setTimeout(() => {
    state.enableSelectionQuery = prevEnableSelectionQuery;
  }, 1500);
}

// 填充侧边栏输入框（不自动发送，由用户决定是否发送）
function fillSidePanelInput(text) {
  const userInput = document.getElementById('userInput');
  if (!userInput || !text) return;
  
  userInput.value = text;
  userInput.dispatchEvent(new Event('input'));
  userInput.focus();
}

// 直接发送文本到侧边栏（填充输入框并自动发送，可选带上选中文本上下文）
function directSend(text, selectedText = '') {
  const userInput = document.getElementById('userInput');
  if (!userInput || !text || state.isGenerating) return;
  
  // 设置选中内容上下文
  if (selectedText) {
    state.enableSelectionQuery = true;
    state.selectedContextText = selectedText;
    state.quotedContextText = '';
  }
  
  userInput.value = text;
  userInput.dispatchEvent(new Event('input'));
  userInput.focus();
  sendMessage();
  
  // 上下文处理完成后，临时禁用选中内容查询
  if (selectedText) {
    state.enableSelectionQuery = false;
    setTimeout(() => {
      state.enableSelectionQuery = true;
    }, 1500);
  }
}

// ============================================================
// 消息渲染
// ============================================================

function addContextBubble(type, contextText, scroll = true) {
  const chatContainer = document.getElementById('chatContainer');
  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'user-context-bubble';
  bubbleDiv.dataset.role = 'context';
  
  const icon = type === 'quoted' ? '💬' : '📌';
  const label = type === 'quoted' ? '引用内容' : '选中内容';
  
  bubbleDiv.innerHTML = `
    <div class="context-bubble-inner">
      <div class="context-bubble-header" title="点击展开/收起">
        <span class="context-icon">${icon}</span>
        <span class="context-type">${label}</span>
      </div>
      <div class="context-bubble-content">${escapeHtml(contextText)}</div>
    </div>
  `;
  
  const headerEl = bubbleDiv.querySelector('.context-bubble-header');
  const contentEl = bubbleDiv.querySelector('.context-bubble-content');
  headerEl.addEventListener('click', (e) => {
    e.stopPropagation();
    contentEl.classList.toggle('expanded');
  });
  
  chatContainer.appendChild(bubbleDiv);
  
  if (scroll) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  
  return bubbleDiv;
}

function addMessage(role, content, scroll = true, executionLog = []) {
  const chatContainer = document.getElementById('chatContainer');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  
  const timestamp = new Date().toISOString();
  messageDiv.dataset.timestamp = timestamp;
  
  messageDiv.dataset.rawContent = content;
  
  messageDiv.dataset.executionLog = JSON.stringify(executionLog);
  
  if (role === 'assistant') {
    messageDiv.innerHTML = formatMessageContent(content);
    const footer = document.createElement('div');
    footer.className = 'message-footer';
    
    const footerCopyBtn = document.createElement('button');
    footerCopyBtn.className = 'copy-btn';
    footerCopyBtn.innerHTML = [
      '<svg viewBox="0 0 16 16" fill="currentColor">',
      '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>',
      '</svg>',
      '<span>复制</span>'
    ].join('');
    footerCopyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyAssistantMessage(messageDiv, footerCopyBtn);
    });
    
    footer.appendChild(footerCopyBtn);
    
    const quoteBtn = document.createElement('button');
    quoteBtn.className = 'quote-btn';
    quoteBtn.innerHTML = [
      '<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>',
      '<span>引用</span>'
    ].join('');
    quoteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      quoteAndAsk(messageDiv);
    });
    
    footer.appendChild(quoteBtn);
    
    const exportMenuContainer = document.createElement('div');
    exportMenuContainer.className = 'export-menu-container';
    
    const exportTriggerBtn = document.createElement('button');
    exportTriggerBtn.className = 'export-trigger-btn';
    exportTriggerBtn.innerHTML = '<svg t="1781245244396" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5115" width="14" height="14"><path d="M496.213333 739.84c2.133333 2.133333 4.693333 3.84 7.68 5.12 0.853333 0.426667 2.133333 0.426667 2.986667 0.853333 1.706667 0.426667 2.986667 0.853333 4.693333 0.853334 5.546667 0 11.093333-2.133333 14.933334-6.4l256-256c8.533333-8.533333 8.533333-21.76 0-30.293334s-21.76-8.533333-30.293334 0L533.333333 674.133333V128c0-11.946667-9.386667-21.333333-21.333333-21.333333s-21.333333 9.386667-21.333333 21.333333v545.706667l-219.306667-219.306667c-8.533333-8.533333-21.76-8.533333-30.293333 0s-8.533333 21.76 0 30.293333l255.146666 255.146667zM768 874.666667H256c-11.946667 0-21.333333 9.386667-21.333333 21.333333s9.386667 21.333333 21.333333 21.333333h512c11.946667 0 21.333333-9.386667 21.333333-21.333333s-9.386667-21.333333-21.333333-21.333333z" fill="#8a8a8a" p-id="5116"></path></svg><span>导出</span><svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>';
    
    const exportDropdown = document.createElement('div');
    exportDropdown.className = 'export-dropdown';
    exportDropdown.innerHTML = [
      '<div class="export-dropdown-item export-docx-item">',
      '<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>',
      '<span>导出 Word</span>',
      '</div>',
      '<div class="export-dropdown-item export-pdf-item">',
      '<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>',
      '<span>导出 PDF</span>',
      '</div>'
    ].join('');
    
    exportDropdown.querySelector('.export-docx-item').addEventListener('click', (e) => {
      e.stopPropagation();
      exportAssistantMessageToDocx(messageDiv, exportTriggerBtn);
      exportDropdown.classList.remove('show');
    });
    
    exportDropdown.querySelector('.export-pdf-item').addEventListener('click', (e) => {
      e.stopPropagation();
      exportAssistantMessageToPdf(messageDiv, exportTriggerBtn);
      exportDropdown.classList.remove('show');
    });
    
    exportTriggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.export-dropdown.show').forEach(menu => {
        if (menu !== exportDropdown) menu.classList.remove('show');
      });
      exportDropdown.classList.toggle('show');
    });
    
    let hoverTimer = null;
    exportMenuContainer.addEventListener('mouseenter', () => {
      hoverTimer = setTimeout(() => {
        document.querySelectorAll('.export-dropdown.show').forEach(menu => {
          if (menu !== exportDropdown) menu.classList.remove('show');
        });
        exportDropdown.classList.add('show');
      }, 300);
    });
    exportMenuContainer.addEventListener('mouseleave', () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      setTimeout(() => {
        if (!exportMenuContainer.matches(':hover') && !exportDropdown.matches(':hover')) {
          exportDropdown.classList.remove('show');
        }
      }, 100);
    });
    
    exportMenuContainer.appendChild(exportTriggerBtn);
    exportMenuContainer.appendChild(exportDropdown);
    footer.appendChild(exportMenuContainer);
    
    if (executionLog && executionLog.length > 0) {
      chrome.storage.local.get('enableExecutionLog', (result) => {
        if (result.enableExecutionLog) {
          const logBtn = document.createElement('button');
          logBtn.className = 'execution-log-btn';
          logBtn.title = '执行日志';
          logBtn.innerHTML = [
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
            '<circle cx="12" cy="12" r="10"></circle>',
            '<polyline points="12 6 12 12 16 14"></polyline>',
            '</svg>'
          ].join('');
          logBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showExecutionLog(executionLog);
          });
          footer.appendChild(logBtn);
        }
      });
    }
    
    messageDiv.appendChild(footer);
  } else {
    const quotedMatch = content.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/);
    const selectedMatch = content.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/);
    const match = quotedMatch || selectedMatch;
    
    if (match) {
      const type = quotedMatch ? 'quoted' : 'selected';
      const contextText = match[1].trim();
      const userQuestion = match[2].trim();
      messageDiv._pendingContext = { type, contextText, userQuestion };
      messageDiv.textContent = userQuestion;
    } else {
      messageDiv.textContent = content;
    }
    
    const toolbar = document.createElement('div');
    toolbar.className = 'message-toolbar';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-toolbar-btn copy-btn';
    copyBtn.title = '复制内容';
    copyBtn.innerHTML = [
      '<svg viewBox="0 0 16 16" fill="currentColor">',
      '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>',
      '</svg>'
    ].join('');
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyMessage(messageDiv, copyBtn);
    });
    
    const editBtn = document.createElement('button');
    editBtn.className = 'message-toolbar-btn edit-btn';
    editBtn.title = '编辑后重新发送';
    editBtn.innerHTML = [
      '<svg viewBox="0 0 16 16" fill="currentColor">',
      '<path d="M12.146.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12h.5a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.468-.325z"/>',
      '</svg>'
    ].join('');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editAndResendMessage(messageDiv);
    });
    
    toolbar.appendChild(copyBtn);
    toolbar.appendChild(editBtn);
    messageDiv.appendChild(toolbar);
  }
  
  chatContainer.appendChild(messageDiv);
  
  if (messageDiv._pendingContext) {
    const { type, contextText } = messageDiv._pendingContext;
    const contextBubble = addContextBubble(type, contextText, false);
    chatContainer.insertBefore(contextBubble, messageDiv);
    delete messageDiv._pendingContext;
  }
  
  if (scroll) {
    const userMessages = chatContainer.querySelectorAll('.message.user');
    if (userMessages.length > 0) {
      const latestUserMessages = userMessages[userMessages.length - 1];
      const prevEl = latestUserMessages.previousElementSibling;
      if (prevEl && prevEl.classList.contains('user-context-bubble')) {
        prevEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        latestUserMessages.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }
  
  if (role === 'assistant') {
    addCodeCopyButtons();
  }
  
  return messageDiv;
}

function renderExecutionTimeline(executionLog) {
  console.log('[SidePanel] renderExecutionTimeline 被调用，日志数量:', executionLog.length);
  executionLog.forEach((entry, i) => {
    console.log(`[SidePanel] 日志条目 ${i}:`, entry.nodeType, entry.nodeName, entry.status);
  });
  
  const sortedLog = [...executionLog].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  let result = '';
  let currentSubtaskIndex = null;
  
  sortedLog.forEach((entry, index) => {
    const isSubtask = entry.nodeType === 'subtask';
    const isToolExec = entry.nodeType === 'tool_exec';
    const isApiCall = entry.nodeType === 'api_call';
    const isPreselect = entry.nodeType === 'preselect';
    
    if (isSubtask) {
      currentSubtaskIndex = entry.subtaskIndex;
    }
    
    let indentClass = '';
    let prefix = '';
    if (isSubtask) {
      indentClass = 'subtask-level';
      prefix = '🔀';
    } else if (isToolExec && currentSubtaskIndex !== null) {
      indentClass = 'tool-level';
      prefix = '🔧';
    } else if (isApiCall && currentSubtaskIndex !== null) {
      indentClass = 'api-level';
      prefix = '📡';
    }
    
    let statusIcon = '○';
    let statusClass = entry.status || 'processing';
    if (entry.status === 'success') {
      statusIcon = '✓';
    } else if (entry.status === 'failed') {
      statusIcon = '✗';
    }
    
    let nodeName = escapeHtml(entry.nodeName || '未知节点');
    
    if (entry.subtaskIndex !== null && entry.subtaskIndex >= 0) {
      nodeName = `<span class="subtask-badge">${entry.subtaskIndex + 1}</span> ${nodeName}`;
    }
    
    if (entry.subtaskCount) {
      nodeName += ` <span class="plan-badge">(${entry.subtaskCount}个子任务)</span>`;
    }
    
    if ((isApiCall || isPreselect) && entry.apiRequest) {
      const info = [];
      if (entry.apiRequest.messageCount !== undefined && entry.apiRequest.messageCount !== null) {
        info.push(`💬<span title="本次模型API调用携带的消息数">${entry.apiRequest.messageCount}条</span>`);
      }
      if (!isPreselect && entry.apiRequest.toolCount !== undefined && entry.apiRequest.toolCount !== null) {
        info.push(`🔧<span title="本次模型API调用携带的工具定义数">${entry.apiRequest.toolCount}个</span>`);
      }
      if (info.length > 0) {
        nodeName += ` <span class="api-info-badge">（${info.join(' ')}）</span>`;
      }
    }
    
    result += `
      <div class="realtime-timeline-item ${indentClass}" data-status="${entry.status || 'processing'}" data-node-type="${entry.nodeType || ''}">
        <div class="realtime-timeline-dot ${statusClass}">${statusIcon}</div>
        <div class="realtime-timeline-content">
          <span class="realtime-node-name">${prefix} ${nodeName}</span>
          <span class="realtime-duration">${formatDuration(entry.duration || 0)}</span>
          ${entry.error ? `<span class="realtime-error">${escapeHtml(entry.error)}</span>` : ''}
        </div>
      </div>
    `;
  });
  
  return result;
}

function renderExecutionLogForPanel(executionLog) {
  const sortedLog = [...executionLog].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  let result = '';
  let currentSubtaskIndex = null;
  
  sortedLog.forEach((entry, index) => {
    const isSubtask = entry.nodeType === 'subtask';
    const isToolExec = entry.nodeType === 'tool_exec';
    const isApiCall = entry.nodeType === 'api_call';
    const isPreselect = entry.nodeType === 'preselect';
    const isPlanTask = isToolExec && entry.action?.name === 'plan_task';
    
    if (isSubtask) {
      currentSubtaskIndex = entry.subtaskIndex;
    }
    
    let indentClass = '';
    let nodeIcon = '';
    
    if (isPreselect) {
      nodeIcon = '📡';
    } else if (isPlanTask) {
      indentClass = 'plan-task-level';
      nodeIcon = '📋';
    } else if (isSubtask) {
      indentClass = 'subtask-level';
      nodeIcon = '🔀';
    } else if (isToolExec && currentSubtaskIndex !== null) {
      indentClass = 'tool-level';
      nodeIcon = '🔧';
    } else if (isApiCall && currentSubtaskIndex !== null) {
      indentClass = 'api-level';
      nodeIcon = '📡';
    } else if (isToolExec) {
      nodeIcon = '⚡';
    } else if (isApiCall) {
      nodeIcon = '📡';
    }
    
    let statusIcon = '○';
    let statusClass = entry.status || 'processing';
    if (entry.status === 'success') {
      statusIcon = '✓';
    } else if (entry.status === 'failed') {
      statusIcon = '✗';
    }
    
    let nodeName = escapeHtml(entry.nodeName || '未知节点');
    
    if (entry.subtaskId) {
      nodeName = `<span class="subtask-badge">${currentSubtaskIndex !== null ? currentSubtaskIndex + 1 : ''}</span> ${nodeName}`;
    }
    
    if (entry.subtaskCount) {
      nodeName += ` <span class="plan-badge">(${entry.subtaskCount}个子任务, ${entry.strategy === 'sequential' ? '顺序执行' : '并行执行'})</span>`;
    }
    
    if ((isApiCall || isPreselect) && entry.apiRequest) {
      const info = [];
      if (entry.apiRequest.messageCount !== undefined && entry.apiRequest.messageCount !== null) {
        info.push(`💬<span title="本次模型API调用携带的消息数">${entry.apiRequest.messageCount}条</span>`);
      }
      if (!isPreselect && entry.apiRequest.toolCount !== undefined && entry.apiRequest.toolCount !== null) {
        info.push(`🔧<span title="本次模型API调用携带的工具定义数">${entry.apiRequest.toolCount}个</span>`);
      }
      if (info.length > 0) {
        nodeName += ` <span class="api-info-badge">（${info.join(' ')}）</span>`;
      }
    }
    
    result += `
      <div class="timeline-item ${indentClass}">
        <div class="timeline-line"></div>
        <div class="timeline-dot ${statusClass}">
          ${statusIcon}
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="expand-icon">▼</span>
            <span class="node-icon">${nodeIcon}</span>
            <span class="iteration-badge">[${index + 1}/${sortedLog.length}]</span>
            <span class="node-name" title="${escapeHtml(entry.nodeName || '未知节点')}">${nodeName}</span>
            <span class="duration-badge" title="耗时">${formatDuration(entry.duration)}</span>
          </div>
          
          <div class="timeline-details">
            ${entry.thought && entry.thought.trim() ? `
            <div class="timeline-section">
              <div class="section-title">💡 思考</div>
              <div class="section-content">${escapeHtml(entry.thought)}</div>
            </div>
            ` : ''}
            
            ${!isPreselect && entry.action ? `
            <div class="timeline-section">
              <div class="section-title">⚡ 工具调用</div>
              <div class="section-content">
                <strong>工具:</strong> ${escapeHtml(entry.action.name)}<br>
                <strong>参数:</strong> <code>${escapeHtml(JSON.stringify(entry.action.params, null, 2))}</code>
              </div>
            </div>
            ` : ''}
            
            ${isPreselect && entry.action?.params?.selected ? `
            <div class="timeline-section">
              <div class="section-title">🔍 筛选结果</div>
              <div class="section-content">
                <strong>选中工具:</strong> ${entry.action.params.selected.map(t => escapeHtml(t)).join(', ')}<br>
                <strong>数量:</strong> ${entry.action.params.selected.length} 个
              </div>
            </div>
            ` : ''}
            
            ${entry.observation ? `
            <div class="timeline-section">
              <div class="section-title">📝 观察结果</div>
              <div class="section-content">${escapeHtml(entry.observation)}</div>
            </div>
            ` : ''}
            
            ${entry.apiRequest ? `
            <div class="timeline-section">
              <div class="section-title">📡 API 请求</div>
              <div class="section-content">
                ${entry.apiRequest.model ? `<strong>模型:</strong> ${escapeHtml(entry.apiRequest.model)}<br>` : ''}
                ${entry.apiRequest.temperature !== undefined ? `<strong>温度:</strong> ${entry.apiRequest.temperature}<br>` : ''}
                ${entry.apiRequest.top_p !== undefined ? `<strong>top_p:</strong> ${entry.apiRequest.top_p}<br>` : ''}
                ${entry.apiRequest.messageCount !== undefined ? `<strong>消息数:</strong> ${entry.apiRequest.messageCount}<br>` : ''}
                ${!isPreselect && entry.apiRequest.toolCount !== undefined ? `<strong>工具数:</strong> ${entry.apiRequest.toolCount}<br>` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.apiResponse ? `
            <div class="timeline-section">
              <div class="section-title">📤 API 响应</div>
              <div class="section-content">
                ${entry.apiResponse.finishReason ? `<strong>完成原因:</strong> ${escapeHtml(entry.apiResponse.finishReason)}<br>` : ''}
                ${entry.apiResponse.toolCountAfter !== undefined ? `<strong>筛选后工具数:</strong> ${entry.apiResponse.toolCountAfter} 个<br>` : ''}
                ${entry.apiResponse.tokenUsage ? `
                  <strong>Token 使用:</strong><br>
                  - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                  - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                  - Total: ${entry.apiResponse.tokenUsage.total_tokens || 0}
                ` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.error ? `
            <div class="timeline-section error">
              <div class="section-title">❌ 错误信息</div>
              <div class="section-content">${escapeHtml(entry.error)}</div>
            </div>
            ` : ''}
            
            ${entry.result ? `
            <div class="timeline-section">
              <div class="section-title">✅ 子任务结果</div>
              <div class="section-content">${escapeHtml(entry.result)}</div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  });
  
  return result;
}

function updateRealtimeExecutionLogPanel(status) {
  const panel = document.querySelector('.realtime-execution-log-panel');
  if (!panel) return;
  
  console.log('[SidePanel] updateRealtimeExecutionLogPanel 被调用，状态:', status.nodeName, '日志数量:', status.executionLog?.length);
  
  const executionValue = panel.querySelector('.realtime-execution-value');
  if (executionValue) {
    executionValue.textContent = status.nodeName || '处理中...';
  }
  
  const executionLog = status.executionLog || [];
  const totalCount = executionLog.length;
  const successCount = executionLog.filter(entry => entry.status === 'success').length;
  const failedCount = executionLog.filter(entry => entry.status === 'failed').length;
  const subtaskCount = executionLog.filter(entry => entry.nodeType === 'subtask').length;
  const completedSubtasks = executionLog.filter(entry => entry.nodeType === 'subtask' && entry.status === 'success').length;
  
  const statTotal = panel.querySelector('.realtime-stat-total');
  const statSuccess = panel.querySelector('.realtime-stat-success');
  const statFailed = panel.querySelector('.realtime-stat-failed');
  const statSubtask = panel.querySelector('.realtime-stat-subtask');
  
  if (statTotal) {
    statTotal.querySelector('.stat-count-mini').textContent = totalCount;
  }
  if (statSuccess) {
    statSuccess.querySelector('.stat-count-mini').textContent = successCount;
  }
  if (statFailed) {
    statFailed.querySelector('.stat-count-mini').textContent = failedCount;
  }
  if (statSubtask) {
    if (subtaskCount > 0) {
      statSubtask.style.display = 'flex';
      statSubtask.querySelector('.stat-count-mini').textContent = `${completedSubtasks}/${subtaskCount}`;
    } else {
      statSubtask.style.display = 'none';
    }
  }
  
  const timeline = panel.querySelector('.realtime-log-timeline');
  timeline.innerHTML = executionLog.length > 0 ? renderExecutionTimeline(executionLog) : '<div class="realtime-waiting-message">等待执行中...</div>';
  
  const timelineWrapper = panel.querySelector('.realtime-log-timeline-wrapper');
  if (timelineWrapper) {
    timelineWrapper.scrollTop = timelineWrapper.scrollHeight;
  }
}

function showRealtimeExecutionLogPanel(loadingId) {
  const panel = document.createElement('div');
  panel.className = 'realtime-execution-log-panel';
  
  panel.innerHTML = `
    <div class="realtime-log-container">
      <div class="realtime-log-header">
        <div class="realtime-log-title">
          <svg viewBox="0 0 1024 1024">
            <path d="M512 5.12C230.4 5.12 5.12 230.4 5.12 512s225.28 506.88 506.88 506.88 506.88-225.28 506.88-506.88S793.6 5.12 512 5.12z m0 92.16c107.52 0 215.04 46.08 291.84 122.88s122.88 184.32 122.88 291.84-46.08 215.04-122.88 291.84-184.32 122.88-291.84 122.88-215.04-46.08-291.84-122.88-122.88-184.32-122.88-291.84 46.08-215.04 122.88-291.84S404.48 97.28 512 97.28zM430.08 327.68h-5.12c-5.12 0-5.12 5.12-5.12 5.12v353.28l5.12 5.12h20.48l250.88-168.96s5.12 0 5.12-5.12V512v-5.12s0-5.12-5.12-5.12l-256-168.96c-5.12 0-5.12 0-10.24-5.12z" fill="#707070"></path>
          </svg>
          <h3>实时执行日志</h3>
        </div>
        <div class="realtime-log-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>
      <div class="realtime-log-content">
        <div class="realtime-header-bar">
          <div class="realtime-current-execution">
            <span class="realtime-execution-label">当前执行:</span>
            <span class="realtime-execution-value">准备中...</span>
          </div>
          <div class="realtime-stat-summary-inline">
            <span class="realtime-stat-item-mini realtime-stat-total">
              <span class="stat-icon">◉</span>
              <span class="stat-text-mini">总节点</span>
              <span class="stat-count-mini">0</span>
            </span>
            <span class="realtime-stat-item-mini realtime-stat-success" data-status="success">
              <span class="stat-icon">✓</span>
              <span class="stat-text-mini">成功</span>
              <span class="stat-count-mini">0</span>
            </span>
            <span>|</span>
            <span class="realtime-stat-item-mini realtime-stat-failed" data-status="failed">
              <span class="stat-icon">✗</span>
              <span class="stat-text-mini">失败</span>
              <span class="stat-count-mini">0</span>
            </span>
            <span class="realtime-stat-item-mini realtime-stat-subtask" data-status="subtask" style="display:none">
              <span class="stat-icon">🔀</span>
              <span class="stat-text-mini">子任务</span>
              <span class="stat-count-mini">0/0</span>
            </span>
          </div>
        </div>
        <div class="realtime-log-timeline-wrapper">
          <div class="realtime-log-timeline">
            <div class="realtime-waiting-message">等待执行中...</div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  const closeBtn = panel.querySelector('.realtime-log-close');
  closeBtn.addEventListener('click', () => {
    panel.remove();
  });
  
  panel.addEventListener('click', (e) => {
    if (e.target === panel) {
      panel.remove();
    }
  });
  
  panel.addEventListener('click', (e) => {
    const target = e.target.closest('.realtime-stat-item-mini[data-status]');
    if (target) {
      const status = target.dataset.status;
      const isActive = target.classList.contains('active');
      
      panel.querySelectorAll('.realtime-stat-item-mini[data-status]').forEach(item => {
        item.classList.remove('active');
      });
      
      if (!isActive) {
        target.classList.add('active');
        
        panel.querySelectorAll('.realtime-timeline-item').forEach(timelineItem => {
          if (status === 'subtask') {
            const nodeType = timelineItem.dataset.nodeType;
            if (nodeType === 'subtask') {
              timelineItem.style.display = '';
            } else {
              timelineItem.style.display = 'none';
            }
          } else {
            const itemStatus = timelineItem.dataset.status;
            if (itemStatus === status) {
              timelineItem.style.display = '';
            } else {
              timelineItem.style.display = 'none';
            }
          }
        });
      } else {
        panel.querySelectorAll('.realtime-timeline-item').forEach(timelineItem => {
          timelineItem.style.display = '';
        });
      }
    }
  });
  
  if (state.currentExecutionStatus) {
    updateRealtimeExecutionLogPanel(state.currentExecutionStatus);
  }
}

function toggleRealtimeExecutionLog(loadingId) {
  const existingPanel = document.querySelector('.realtime-execution-log-panel');
  if (existingPanel) {
    existingPanel.remove();
    return;
  }
  
  showRealtimeExecutionLogPanel();
}

function updateExecutionStatus(loadingId, nodeName, status, executionLog) {
  const loadingDiv = document.getElementById(loadingId);
  if (!loadingDiv) return;
  
  console.log('[SidePanel] updateExecutionStatus 被调用:', nodeName, status, '日志数量:', executionLog?.length);
  
  const nodeNameSpan = loadingDiv.querySelector('.current-node-name');
  if (nodeNameSpan) {
    nodeNameSpan.textContent = nodeName || '处理中...';
    nodeNameSpan.title = nodeName || '';
  }
  
  if (!state.currentExecutionStatus) {
    state.currentExecutionStatus = {
      nodeName: nodeName,
      status: status,
      executionLog: []
    };
  } else {
    if (!state.currentExecutionStatus.executionLog) {
      state.currentExecutionStatus.executionLog = [];
    }
    
    if (executionLog && executionLog.length > 0) {
      executionLog.forEach(newEntry => {
        const existingIndex = state.currentExecutionStatus.executionLog.findIndex(
          existing => existing.id === newEntry.id
        );
        if (existingIndex !== -1) {
          const existingEntry = state.currentExecutionStatus.executionLog[existingIndex];
          state.currentExecutionStatus.executionLog[existingIndex] = {
            ...newEntry,
            subtaskIndex: newEntry.subtaskIndex ?? existingEntry.subtaskIndex,
            subtaskId: newEntry.subtaskId ?? existingEntry.subtaskId,
            subtaskName: newEntry.subtaskName ?? existingEntry.subtaskName
          };
        } else {
          state.currentExecutionStatus.executionLog.push(newEntry);
        }
      });
    }
    
    state.currentExecutionStatus.nodeName = nodeName;
    state.currentExecutionStatus.status = status;
  }
  
  const realtimePanel = document.querySelector('.realtime-execution-log-panel');
  if (realtimePanel) {
    updateRealtimeExecutionLogPanel(state.currentExecutionStatus);
  }
}

// ============================================================
// 加载消息 / API 调用
// ============================================================

function addLoadingMessage() {
  const chatContainer = document.getElementById('chatContainer');
  const loadingId = 'loading-' + Date.now();
  
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading-message';
  loadingDiv.id = loadingId;
  loadingDiv.innerHTML = `
    <div class="loading-content">
      <div class="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span class="loading-text">思考中...</span>
      <button class="stop-task-btn" title="停止任务">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </button>
      <div class="execution-status-container" style="display: none;">
        <button class="execution-log-toggle-btn" title="查看执行日志">
          <svg viewBox="0 0 1024 1024">
            <path d="M512 5.12C230.4 5.12 5.12 230.4 5.12 512s225.28 506.88 506.88 506.88 506.88-225.28 506.88-506.88S793.6 5.12 512 5.12z m0 92.16c107.52 0 215.04 46.08 291.84 122.88s122.88 184.32 122.88 291.84-46.08 215.04-122.88 291.84-184.32 122.88-291.84 122.88-215.04-46.08-291.84-122.88-122.88-184.32-122.88-291.84 46.08-215.04 122.88-291.84S404.48 97.28 512 97.28zM430.08 327.68h-5.12c-5.12 0-5.12 5.12-5.12 5.12v353.28l5.12 5.12h20.48l250.88-168.96s5.12 0 5.12-5.12V512v-5.12s0-5.12-5.12-5.12l-256-168.96c-5.12 0-5.12 0-10.24-5.12z" fill="#707070"></path>
          </svg>
        </button>
        <span class="current-node-name">准备中...</span>
      </div>
    </div>
  `;
  
  chatContainer.appendChild(loadingDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
  const stopBtn = loadingDiv.querySelector('.stop-task-btn');
  const loadingText = loadingDiv.querySelector('.loading-text');
  if (stopBtn) {
    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      stopBtn.disabled = true;
      stopBtn.style.opacity = '0.6';
      stopBtn.style.cursor = 'not-allowed';
      if (loadingText) {
        loadingText.textContent = '停止中...';
      }
      chrome.runtime.sendMessage({ type: 'CANCEL_REACT', tabId: null });
    });
  }
  
  // 始终同步注册执行日志监听器，避免竞态（storage.get 是异步的）
  state.executionLogListener = (message, sender, sendResponse) => {
    if (message.type === 'EXECUTION_STATUS_UPDATE') {
      console.log('[SidePanel] 收到执行状态更新:', message.nodeName, message.status, '日志数量:', message.executionLog?.length);
      updateExecutionStatus(loadingId, message.nodeName, message.status, message.executionLog);
      return false;
    }
    return false;
  };
  chrome.runtime.onMessage.addListener(state.executionLogListener);

  // enableExecutionLog 只控制面板是否显示
  chrome.storage.local.get('enableExecutionLog', (result) => {
    const enableExecutionLog = result.enableExecutionLog || false;
    if (enableExecutionLog) {
      const statusContainer = loadingDiv.querySelector('.execution-status-container');
      if (statusContainer) {
        statusContainer.style.display = 'flex';
      }
    }
  });
  
  const logToggleBtn = loadingDiv.querySelector('.execution-log-toggle-btn');
  if (logToggleBtn) {
    logToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleRealtimeExecutionLog();
    });
  }
  
  return loadingId;
}

function removeLoadingMessage(loadingId) {
  const loadingDiv = document.getElementById(loadingId);
  if (loadingDiv) {
    const loadingText = loadingDiv.querySelector('.loading-text');
    if (loadingText) {
      loadingText.textContent = '思考中...';
    }
    loadingDiv.remove();
  }
  
  if (state.executionLogListener) {
    chrome.runtime.onMessage.removeListener(state.executionLogListener);
    state.executionLogListener = null;
  }
  
  state.currentExecutionStatus = null;
  
  const realtimePanel = document.querySelector('.realtime-execution-log-panel');
  if (realtimePanel) {
    realtimePanel.remove();
  }
}

async function callApi(messages, model, useTools = false, apiParams = {}) {
  const reactConfig = await getReactConfig();
  const timeoutMs = reactConfig.loopTimeout;
  
  return new Promise((resolve, reject) => {
    let executionLog = [];
    const timeoutSeconds = Math.round(timeoutMs / 1000);
    
    let timeoutId = setTimeout(() => {
      removeListener();
      chrome.runtime.sendMessage({
        type: 'CANCEL_REACT',
        tabId: state.currentTabId
      }).catch(err => {
        console.log('[SidePanel] 发送取消请求失败:', err.message);
      });
      reject({
        message: `请求超时（${timeoutSeconds}秒）`,
        executionLog: executionLog
      });
    }, timeoutMs);
    
    const loopStartTime = Date.now();
    let totalPausedDuration = 0;
    let pauseStartTime = null;
    
    const pauseTimeout = () => {
      if (pauseStartTime === null && timeoutId !== null) {
        pauseStartTime = Date.now();
        clearTimeout(timeoutId);
        timeoutId = null;
        console.log('[SidePanel] 前端超时已暂停（澄清工具执行中）');
      }
    };
    
    const resumeTimeout = () => {
      if (pauseStartTime !== null) {
        const pauseDuration = Date.now() - pauseStartTime;
        totalPausedDuration += pauseDuration;
        pauseStartTime = null;
        
        const elapsedTime = Date.now() - loopStartTime;
        const remainingTime = timeoutMs + totalPausedDuration - elapsedTime;
        
        if (remainingTime <= 0) {
          removeListener();
          reject({
            message: `请求超时（${timeoutSeconds}秒）`,
            executionLog: executionLog
          });
          return;
        }
        
        timeoutId = setTimeout(() => {
          removeListener();
          chrome.runtime.sendMessage({
            type: 'CANCEL_REACT',
            tabId: state.currentTabId
          }).catch(err => {
            console.log('[SidePanel] 发送取消请求失败:', err.message);
          });
          reject({
            message: `请求超时（${timeoutSeconds}秒）`,
            executionLog: executionLog
          });
        }, remainingTime);
        
        console.log('[SidePanel] 前端超时已恢复，暂停时长:', Math.round(pauseDuration / 1000), 's，剩余时间:', Math.round(remainingTime / 1000), 's');
      }
    };

    const listener = (message) => {
      console.log('[SidePanel] 收到消息:', message);
      
      if (message.type === 'EXECUTION_STATUS_UPDATE') {
        executionLog = message.executionLog || [];
        return false;
      }
      
      if (message.type === 'CLARIFY_START') {
        pauseTimeout();
        return false;
      }
      
      if (message.type === 'CLARIFY_END') {
        resumeTimeout();
        return false;
      }
      
      if (message.type === 'API_COMPLETE') {
        if (timeoutId) clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(listener);
        resolve({ 
          content: message.content, 
          executionLog: message.executionLog || executionLog 
        });
        return false;
      } else if (message.type === 'API_ERROR') {
        if (timeoutId) clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(listener);
        reject({
          message: message.error,
          executionLog: message.executionLog || executionLog
        });
        return false;
      }
      return false;
    };
    
    chrome.runtime.onMessage.addListener(listener);
    
    const removeListener = () => {
      chrome.runtime.onMessage.removeListener(listener);
    };

    console.log('[SidePanel] 发送 CALL_API 消息，useTools:', useTools, 'tabId:', state.currentTabId, 'apiParams:', apiParams, 'timeout:', timeoutMs);
    chrome.runtime.sendMessage({
      type: 'CALL_API',
      messages: messages,
      model: model,
      useTools: useTools,
      tabId: state.currentTabId,
      apiParams: apiParams
    });
  });
}

// ============================================================
// 执行日志面板
// ============================================================

function showExecutionLog(executionLog) {
  const existingPanel = document.querySelector('.execution-log-panel');
  if (existingPanel) {
    existingPanel.remove();
  }
  
  const panel = document.createElement('div');
  panel.className = 'execution-log-panel';
  
  const totalDuration = executionLog.reduce((sum, entry) => sum + (entry.duration || 0), 0);
  const successCount = executionLog.filter(entry => entry.status === 'success').length;
  const failedCount = executionLog.filter(entry => entry.status === 'failed').length;
  const subtaskCount = executionLog.filter(entry => entry.nodeType === 'subtask').length;
  const completedSubtasks = executionLog.filter(entry => entry.nodeType === 'subtask' && entry.status === 'success').length;
  const planTaskCount = executionLog.filter(entry => entry.nodeType === 'tool_exec' && entry.action?.name === 'plan_task' && entry.status === 'success').length;
  
  panel.innerHTML = `
    <div class="log-container">
      <div class="log-header">
        <div class="log-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <h3>执行日志</h3>
          ${planTaskCount > 0 ? `<span class="log-badge">任务拆解</span>` : ''}
        </div>
        <div class="log-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>
      
      <div class="log-summary">
        <div class="summary-item" title="总耗时: ${formatDuration(totalDuration)}">
          <svg class="summary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="summary-label">总耗时</span>
          <span class="summary-value">${formatDuration(totalDuration)}</span>
        </div>
        <div class="summary-combo" title="总节点: ${executionLog.length}">
          <div class="combo-main">
            <span class="combo-icon">◉</span>
            <span class="combo-label">总节点</span>
            <span class="combo-value">${executionLog.length}</span>
          </div>
          <div class="combo-stats">
            <div class="combo-stat success" data-status="success" title="成功: ${successCount}">
              <span class="stat-icon">✓</span>
              <span class="stat-label">成功</span>
              <span class="stat-value">${successCount}</span>
            </div>
            <div class="combo-stat failed" data-status="failed" title="失败: ${failedCount}">
              <span class="stat-icon">✗</span>
              <span class="stat-label">失败</span>
              <span class="stat-value">${failedCount}</span>
            </div>
            ${subtaskCount > 0 ? `
            <div class="combo-stat subtask" data-status="subtask" title="子任务: ${completedSubtasks}/${subtaskCount}">
              <span class="stat-icon">🔀</span>
              <span class="stat-label">子任务</span>
              <span class="stat-value">${completedSubtasks}/${subtaskCount}</span>
            </div>
            ` : ''}
          </div>
        </div>
        <div class="summary-actions">
          <button class="toggle-expand-btn" title="展开全部节点">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="7 13 12 18 17 13"></polyline>
              <polyline points="7 6 12 11 17 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="timeline">
        ${renderExecutionLogForPanel(executionLog)}
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  panel.addEventListener('click', (e) => {
    if (e.target === panel) {
      panel.remove();
    }
  });
  
  const logCloseBtn = panel.querySelector('.log-close');
  logCloseBtn.addEventListener('click', () => {
    panel.remove();
  });
  
  const toggleExpandBtn = panel.querySelector('.toggle-expand-btn');
  const timelineContents = panel.querySelectorAll('.timeline-content');
  let isExpanded = false;
  
  toggleExpandBtn.addEventListener('click', () => {
    isExpanded = !isExpanded;
    timelineContents.forEach(content => {
      if (isExpanded) {
        content.classList.add('expanded');
      } else {
        content.classList.remove('expanded');
      }
    });
    
    const svg = toggleExpandBtn.querySelector('svg');
    if (isExpanded) {
      svg.innerHTML = '<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>';
      toggleExpandBtn.setAttribute('title', '收起全部节点');
    } else {
      svg.innerHTML = '<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>';
      toggleExpandBtn.setAttribute('title', '展开全部节点');
    }
  });
  
  const timelineHeaders = panel.querySelectorAll('.timeline-header');
  timelineHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const content = header.parentElement;
      content.classList.toggle('expanded');
    });
  });
  
  const filterableItems = panel.querySelectorAll('.combo-stat');
  const timelineItems = panel.querySelectorAll('.timeline-item');
  
  filterableItems.forEach(item => {
    item.addEventListener('click', () => {
      const status = item.dataset.status;
      const isActive = item.classList.contains('active');
      
      filterableItems.forEach(i => i.classList.remove('active'));
      
      if (!isActive) {
        item.classList.add('active');
        
        timelineItems.forEach(timelineItem => {
          if (status === 'subtask') {
            if (timelineItem.classList.contains('subtask-level')) {
              timelineItem.style.display = '';
            } else {
              timelineItem.style.display = 'none';
            }
          } else {
            const dot = timelineItem.querySelector('.timeline-dot');
            if (dot && dot.classList.contains(status)) {
              timelineItem.style.display = '';
            } else {
              timelineItem.style.display = 'none';
            }
          }
        });
      } else {
        timelineItems.forEach(timelineItem => {
          timelineItem.style.display = '';
        });
      }
    });
  });
}

// ============================================================
// 消息操作（复制、编辑、引用、导出）
// ============================================================

function copyMessage(messageDiv, copyBtn) {
  try {
    const textToCopy = messageDiv.dataset.rawContent || '';
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
      `;
      copyBtn.classList.add('copied');
      
      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
        copyBtn.classList.remove('copied');
      }, 2000);
    }).catch(err => {
      console.error('[SidePanel] 复制失败:', err);
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
        `;
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (e) {
        showToast('复制失败', 'error');
      }
      document.body.removeChild(textArea);
    });
  } catch (error) {
    console.error('[SidePanel] 复制失败:', error);
    showToast('复制失败', 'error');
  }
}

function editAndResendMessage(messageDiv) {
  try {
    const textToEdit = messageDiv.dataset.rawContent || '';
    
    if (!textToEdit) {
      showToast('无法获取消息内容', 'error');
      return;
    }
    
    const userInput = document.getElementById('userInput');
    userInput.value = textToEdit;
    
    adjustInputHeight();
    
    userInput.focus();
    userInput.selectionStart = userInput.selectionEnd = userInput.value.length;
    
    console.log('[SidePanel] 已加载消息内容到输入框，等待用户编辑后发送');
  } catch (error) {
    console.error('[SidePanel] 编辑消息失败:', error);
    showToast('编辑失败: ' + error.message, 'error');
  }
}

function copyAssistantMessage(messageDiv, copyBtn) {
  try {
    let textToCopy = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';
    
    if (!textToCopy) {
      const lastMsg = state.messageHistory.find(msg => msg.role === 'assistant');
      if (lastMsg) {
        textToCopy = lastMsg.content;
      } else {
        const markdownBody = messageDiv.querySelector('.markdown-body');
        if (markdownBody) {
          textToCopy = markdownBody.innerText;
        } else {
          textToCopy = messageDiv.innerText;
        }
      }
    }
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已复制</span>
      `;
      copyBtn.classList.add('copied');
      
      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
        copyBtn.classList.remove('copied');
      }, 2000);
    }).catch(err => {
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
          <span>已复制</span>
        `;
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (e) {
        showToast('复制失败，请手动选择内容复制', 'error');
      }
      document.body.removeChild(textArea);
    });
  } catch (error) {
    console.error('[SidePanel] 复制失败:', error);
    showToast('复制失败', 'error');
  }
}

function exportAssistantMessageToDocx(messageDiv, exportBtn) {
  try {
    let markdownContent = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';
    
    if (!markdownContent) {
      const markdownBody = messageDiv.querySelector('.markdown-body');
      if (markdownBody) {
        markdownContent = markdownBody.innerText;
      } else {
        markdownContent = messageDiv.innerText;
      }
    }
    
    const htmlContent = formatMarkdown(markdownContent);
    
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>AI Helper 导出</title>
        <style>
          body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
            padding: 20px;
          }
          h1, h2, h3, h4, h5, h6 {
            margin-top: 16pt;
            margin-bottom: 8pt;
          }
          h1 { font-size: 18pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h2 { font-size: 15pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h3 { font-size: 13pt; }
          p { margin: 8pt 0; }
          code {
            font-family: 'Consolas', 'Courier New', monospace;
            background-color: #f5f5f5;
            padding: 2pt 4pt;
            border-radius: 3px;
            font-size: 10pt;
          }
          pre {
            background-color: #f5f5f5;
            padding: 10pt;
            border-radius: 5px;
            overflow-x: auto;
          }
          pre code {
            background-color: transparent;
            padding: 0;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 10pt 0;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 6pt 10pt;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
            font-weight: bold;
          }
          blockquote {
            border-left: 4px solid #ddd;
            margin: 10pt 0;
            padding: 5pt 15pt;
            color: #666;
          }
          ul, ol {
            margin: 8pt 0;
            padding-left: 25pt;
          }
          li { margin: 4pt 0; }
          a { color: #0563c1; text-decoration: none; }
          a:hover { text-decoration: underline; }
          img { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;
    
    const blob = new Blob(['\uFEFF', fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().getTime();
    link.download = `word-${timestamp}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    const originalHTML = exportBtn.innerHTML;
    exportBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已导出</span>
    `;
    
    setTimeout(() => {
      exportBtn.innerHTML = originalHTML;
    }, 2000);
    
    console.log('[SidePanel] Word 文档导出成功');
  } catch (error) {
    console.error('[SidePanel] 导出 Word 失败:', error);
    showToast('导出失败: ' + error.message, 'error');
  }
}

function exportAssistantMessageToPdf(messageDiv, exportBtn) {
  try {
    let markdownContent = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';
    
    if (!markdownContent) {
      const markdownBody = messageDiv.querySelector('.markdown-body');
      if (markdownBody) {
        markdownContent = markdownBody.innerText;
      } else {
        markdownContent = messageDiv.innerText;
      }
    }
    
    const htmlContent = formatMarkdown(markdownContent);
    
    const footerText = `AI Helper - ${new Date().toLocaleString('zh-CN')}`;
    
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>AI Helper 导出</title>
        <style>
          @page {
            size: A4;
            margin: 20mm;
          }
          body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
            padding: 20px;
          }
          h1, h2, h3, h4, h5, h6 {
            margin-top: 16pt;
            margin-bottom: 8pt;
            page-break-after: avoid;
          }
          h1 { font-size: 18pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h2 { font-size: 15pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h3 { font-size: 13pt; }
          p { margin: 8pt 0; page-break-inside: avoid; }
          code {
            font-family: 'Consolas', 'Courier New', monospace;
            background-color: #f5f5f5;
            padding: 2pt 4pt;
            border-radius: 3px;
            font-size: 10pt;
          }
          pre {
            background-color: #f5f5f5;
            padding: 10pt;
            border-radius: 5px;
            overflow-x: auto;
            page-break-inside: avoid;
          }
          pre code {
            background-color: transparent;
            padding: 0;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 10pt 0;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 6pt 10pt;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
            font-weight: bold;
          }
          blockquote {
            border-left: 4px solid #ddd;
            margin: 10pt 0;
            padding: 5pt 15pt;
            color: #666;
          }
          ul, ol {
            margin: 8pt 0;
            padding-left: 25pt;
          }
          li { margin: 4pt 0; }
          a { color: #0563c1; text-decoration: none; }
          a:hover { text-decoration: underline; }
          img { max-width: 100%; height: auto; page-break-inside: avoid; }
          .footer {
            margin-top: 30pt;
            padding-top: 10pt;
            border-top: 1px solid #ddd;
            font-size: 9pt;
            color: #999;
            text-align: center;
          }
        </style>
      </head>
      <body>
        ${htmlContent}
        <div class="footer">${footerText}</div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      showToast('请允许弹出窗口以使用 PDF 导出功能', 'warning');
      return;
    }
    
    printWindow.document.write(fullHtml);
    printWindow.document.close();
    
    printWindow.onload = function() {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 500);
    };
    
    const originalHTML = exportBtn.innerHTML;
    exportBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已触发</span>
    `;
    
    setTimeout(() => {
      exportBtn.innerHTML = originalHTML;
    }, 2000);
    
    console.log('[SidePanel] PDF 导出已触发');
  } catch (error) {
    console.error('[SidePanel] 导出 PDF 失败:', error);
    showToast('导出失败: ' + error.message, 'error');
  }
}

function quoteAndAsk(messageDiv) {
  try {
    const content = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';
    
    if (!content) {
      console.warn('[SidePanel] 无法获取消息内容');
      return;
    }
    
    const userInput = document.getElementById('userInput');
    if (!userInput) {
      console.warn('[SidePanel] 找不到输入框');
      return;
    }
    
    const quoteBtn = messageDiv.querySelector('.quote-btn');
    const originalHTML = quoteBtn ? quoteBtn.innerHTML : '';
    
    setQuoteContext(content);
    
    if (quoteBtn) {
      quoteBtn.innerHTML = `
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已引用</span>
      `;
      quoteBtn.classList.add('quoted');
      
      setTimeout(() => {
        quoteBtn.innerHTML = originalHTML;
        quoteBtn.classList.remove('quoted');
      }, 2000);
    }
    
    userInput.focus();
    
    console.log('[SidePanel] 已引用消息内容到提示条，输入框已获取焦点');
  } catch (error) {
    console.error('[SidePanel] 引用提问失败:', error);
    showToast('引用失败: ' + error.message, 'error');
  }
}

// ==================== 清除选中内容上下文（sendPromptByCode 依赖） ====================

/**
 * 清除选中内容上下文
 */
function clearSelectedContext() {
  console.log('[SidePanel] 清除选中内容上下文');
  state.selectedContextText = '';
  state.quotedContextText = '';
  const indicator = document.getElementById('selectionIndicator');
  const userInput = document.getElementById('userInput');

  if (indicator) {
    indicator.classList.remove('show');
    console.log('[SidePanel] 已隐藏选中内容提示条');
  }

  // 隐藏浮动菜单
  if (typeof window.hideFloatingMenu === 'function') {
    window.hideFloatingMenu();
  }

  // 移除输入框中的选中内容前缀
  if (userInput && userInput.value.startsWith('[选中内容]')) {
    const lines = userInput.value.split('\n');
    let startIndex = 0;
    // 找到 [用户问题] 行的位置
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('[用户问题]')) {
        startIndex = i;
        break;
      }
    }
    if (startIndex > 0) {
      userInput.value = lines.slice(startIndex).join('\n');
      userInput.dispatchEvent(new Event('input'));
      console.log('[SidePanel] 已移除输入框中的选中内容前缀');
    }
  }

  // 重置选中相关状态
  state.lastSelectedText = '';
  state.currentSelectionRange = null;
}

// ==================== 提示词拖拽排序 ====================

/**
 * 初始化提示词拖拽排序
 */
function initPromptDragAndDrop() {
  const list = document.getElementById('promptManageList');
  const items = list.querySelectorAll('.prompt-manage-item');

  items.forEach(item => {
    // 拖拽开始
    item.addEventListener('dragstart', (e) => {
      state.draggedItemIndex = parseInt(item.dataset.index);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', state.draggedItemIndex);
    });

    // 拖拽结束
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      // 清除所有 drag-over 样式
      items.forEach(i => i.classList.remove('drag-over'));
      state.draggedItemIndex = null;
    });

    // 拖拽经过
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over');
    });

    // 拖拽离开
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });

    // 放置
    item.addEventListener('drop', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const targetIndex = parseInt(item.dataset.index);

      if (state.draggedItemIndex !== null && state.draggedItemIndex !== targetIndex) {
        // 交换位置
        const temp = state.customPrompts[state.draggedItemIndex];
        state.customPrompts.splice(state.draggedItemIndex, 1);
        state.customPrompts.splice(targetIndex, 0, temp);

        // 保存并重新渲染
        chrome.storage.local.set({ customPrompts: state.customPrompts });
        renderPromptManageList();
      }

      item.classList.remove('drag-over');
    });
  });
}

// ==================== 提示词管理按钮 ====================

/**
 * 添加提示词管理按钮到工具栏
 */
function addPromptManageButton() {
  const inputToolbarRight = document.querySelector('.input-toolbar-right');
  if (!inputToolbarRight) return;

  const manageBtn = document.createElement('button');
  manageBtn.className = 'prompt-manage-btn';
  manageBtn.title = '提示词管理';
  manageBtn.innerHTML = `<svg t="1781177976746" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5076" width="16" height="16"><path d="M674.56 231.552l101.568 56.96-56.896-101.632 56.96-101.568-101.632 56.896-101.632-56.896 56.96 101.568-56.896 101.632 101.568-56.96zM186.944 629.76l-101.504-56.896 56.832 101.632-56.832 101.568 101.504-56.96 101.632 56.96-56.896-101.568 56.896-101.568-101.568 56.832zM85.44 85.312l56.832 101.568-56.832 101.632 101.504-56.96 101.632 56.96L231.68 186.88l56.896-101.568-101.568 56.896-101.568-56.896z m351.872 438.016l-99.2-99.136L424.32 337.984l99.072 99.264-86.08 86.144m-41.856-223.04L300.352 395.392a40.448 40.448 0 0 0 0 57.28l474.24 474.112a40.448 40.448 0 0 0 57.344 0l94.912-95.04a40.448 40.448 0 0 0 0-57.344L452.736 300.288a40.448 40.448 0 0 0-57.28 0z" p-id="5077" fill="#777"></path></svg>`;
  manageBtn.addEventListener('click', () => {
    showPromptManageModal();
  });

  inputToolbarRight.appendChild(manageBtn);
}

// ==================== 提示词选择器 ====================

/**
 * 显示提示词选择器
 */
function showPromptSelector(filterText = '') {
  const promptSelector = document.getElementById('promptSelector');
  const promptDropdown = document.getElementById('promptDropdown');

  promptSelector.style.display = 'block';
  promptDropdown.classList.add('show');

  // 渲染提示词列表
  renderPromptList(filterText);
}

/**
 * 隐藏提示词选择器
 */
function hidePromptSelector() {
  const promptSelector = document.getElementById('promptSelector');
  const promptDropdown = document.getElementById('promptDropdown');

  promptSelector.style.display = 'none';
  promptDropdown.classList.remove('show');
  state.selectedPromptIndex = -1;
}

/**
 * 切换提示词选择器显示/隐藏
 */
function togglePromptSelector() {
  const promptSelector = document.getElementById('promptSelector');
  const promptDropdown = document.getElementById('promptDropdown');
  const userInput = document.getElementById('userInput');

  if (promptSelector.style.display !== 'none' && promptDropdown.classList.contains('show')) {
    hidePromptSelector();
  } else {
    showPromptSelector();
    // 让输入框获得焦点，以便键盘事件可以触发
    userInput.focus();
  }
}

/**
 * 更新提示词列表（用于输入时实时过滤）
 */
function updatePromptList(filterText = '') {
  renderPromptList(filterText);
}

/**
 * 渲染提示词列表
 */
function renderPromptList(filterText = '') {
  const promptList = document.getElementById('promptList');
  const filterLower = filterText.toLowerCase();
  const filteredPrompts = state.customPrompts.filter(prompt => {
    if (!filterText) return true;
    return prompt.code.toLowerCase().includes(filterLower) ||
           prompt.content.toLowerCase().includes(filterLower);
  });

  if (filteredPrompts.length === 0) {
    promptList.innerHTML = '<div class="prompt-empty">暂无匹配的提示词</div>';
    state.selectedPromptIndex = -1;
    return;
  }

  // 默认选中第一条
  state.selectedPromptIndex = 0;

  promptList.innerHTML = filteredPrompts.map((prompt, index) => `
    <div class="prompt-item ${index === state.selectedPromptIndex ? 'selected' : ''}" data-index="${index}" data-code="${prompt.code}">
      <span class="prompt-item-content">${prompt.content}</span>
      <span class="prompt-item-code">/${prompt.code}</span>
    </div>
  `).join('');

  // 绑定点击事件
  promptList.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const code = item.dataset.code;
      // 如果按下Ctrl键（或Mac的Cmd键），则将提示词带入文本框，否则直接发送
      if (e.ctrlKey || e.metaKey) {
        insertPromptToInputByCode(code);
      } else {
        sendPromptByCode(code);
      }
    });
  });
}

/**
 * 更新提示词选中状态
 */
function updatePromptSelection(promptItems) {
  promptItems.forEach((item, index) => {
    if (index === state.selectedPromptIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

/**
 * 通过编码插入提示词到输入框（Ctrl+Enter）
 */
function insertPromptToInputByCode(code) {
  const prompt = state.customPrompts.find(p => p.code === code);
  if (!prompt) return;

  const userInput = document.getElementById('userInput');

  // 找到最后一个 / 的位置，截取该位置之前的内容
  const value = userInput.value;
  const lastSlashIndex = value.lastIndexOf('/');

  let baseContent = value;
  if (lastSlashIndex !== -1) {
    // 找到 / 前面的最后一个换行符的位置
    let lineStart = -1;
    for (let i = lastSlashIndex - 1; i >= 0; i--) {
      if (value[i] === '\n') {
        lineStart = i;
        break;
      }
    }

    if (lineStart !== -1) {
      // 保留换行之前的内容，去掉换行后到 / 之间的内容（包括尾部空格）
      baseContent = value.substring(0, lineStart + 1).trimEnd();
    } else {
      // / 在第一行，从头截取到 / 之前（包括尾部空格）
      baseContent = value.substring(0, lastSlashIndex).trimEnd();
    }
  }

  // 追加提示词到输入框
  userInput.value = baseContent + (baseContent && !baseContent.endsWith('\n') ? '\n\n' : '') + prompt.content;

  // 移动光标到末尾
  userInput.focus();
  userInput.selectionStart = userInput.selectionEnd = userInput.value.length;

  // 隐藏提示词选择器
  hidePromptSelector();

  // 自动调整输入框高度
  adjustInputHeight();

  console.log('[SidePanel] 已追加提示词到输入框:', prompt.code, prompt.content);
}

/**
 * 通过编码发送提示词（直接发送消息）
 */
async function sendPromptByCode(code) {
  const prompt = state.customPrompts.find(p => p.code === code);
  if (!prompt) return;

  // 防止重复点击
  if (state.isGenerating) {
    console.log('[SidePanel] 正在生成中，请稍候...');
    return;
  }

  // 隐藏提示词选择器
  hidePromptSelector();

  // 清除欢迎消息
  const chatContainer = document.getElementById('chatContainer');
  const welcomeMessage = chatContainer.querySelector('.welcome-message');
  if (welcomeMessage) {
    welcomeMessage.remove();
  }

  // 如果有选中内容且划词问答开启，拼接到用户消息前面，并标记为已使用
  let userMessage = prompt.content;
  const hasSelectedContext = state.enableSelectionQuery && state.selectedContextText && state.selectedContextText.trim();
  const hasQuotedContext = state.quotedContextText && state.quotedContextText.trim();

  // 优先处理引用内容
  if (hasQuotedContext) {
    const ctx = state.quotedContextText.trim();
    userMessage = `[引用内容]\n${ctx}\n\n[用户问题]\n${prompt.content}`;
    // 先添加独立引用气泡
    addContextBubble('quoted', ctx, false);
    // 清除引用内容，只使用一次
    state.quotedContextText = '';
  } else if (hasSelectedContext) {
    const ctx = state.selectedContextText.trim();
    userMessage = `[选中内容]\n${ctx}\n\n[用户问题]\n${prompt.content}`;
    // 先添加独立选中内容气泡
    addContextBubble('selected', ctx, false);
    // 清除选中内容，只使用一次
    state.selectedContextText = '';
  }

  // 如果选中内容或引用内容已使用，清除提示条
  if (hasSelectedContext || hasQuotedContext) {
    clearSelectedContext();
  }

  // 添加用户问题气泡
  addMessage('user', prompt.content);

  // 更新消息历史
  state.messageHistory.push({ role: 'user', content: userMessage });

  // 保存历史
  saveChatHistory();

  // 添加到输入历史
  addToInputHistory(prompt.content);

  // 清空输入框并保持焦点
  const userInput = document.getElementById('userInput');
  userInput.value = '';
  userInput.style.height = 'auto';

  // 禁用发送按钮
  state.isGenerating = true;
  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;

  // 添加加载消息
  const loadingId = addLoadingMessage();

  const model = state.currentModel;

  try {
    // 确保配置已加载
    await ensureChatConfigLoaded();

    console.log('[SidePanel] 发送消息调试信息:');
    console.log('  - isolateChat:', state.isolateChat);
    console.log('  - chatConfig:', state.chatConfig);
    console.log('  - messageHistory.length:', state.messageHistory.length);

    // 构建 messages
    let messages = [
      {
        role: 'system',
        content: getSystemPrompt()
      }
    ];

    // 如果记忆对话，则发送历史对话；否则只发送当前最新消息
    if (state.isolateChat) {
      let historyToSend = state.messageHistory;
      // 如果配置了记忆历史限制条数，则只取最近N条（不含当前消息和系统提示词）
      if (state.chatConfig.maxMemoryMessages !== null && state.chatConfig.maxMemoryMessages !== undefined && state.chatConfig.maxMemoryMessages > 0) {
        // 当前消息是 messageHistory 的最后一条，限制条数不含当前消息
        const historyWithoutCurrent = state.messageHistory.slice(0, -1);
        const limitedHistory = historyWithoutCurrent.slice(-state.chatConfig.maxMemoryMessages);
        historyToSend = [...limitedHistory, state.messageHistory[state.messageHistory.length - 1]];
        console.log('[SidePanel] 记忆历史限制生效:', state.chatConfig.maxMemoryMessages, '条（不含当前消息），实际发送:', historyToSend.length, '条');
      } else {
        console.log('[SidePanel] 记忆历史限制未生效:', state.chatConfig.maxMemoryMessages);
      }
      messages = [...messages, ...historyToSend];
    } else {
      // 无记忆模式：只发送当前用户消息
      messages.push({ role: 'user', content: userMessage });
    }

    // 调用 background.js 的 API
    const apiParams = await getApiParams();
    let content, executionLog;

    try {
      const result = await callApi(messages, model, state.useTools, apiParams);
      content = result.content;
      executionLog = result.executionLog || [];
    } catch (errorResult) {
      // 移除加载消息
      removeLoadingMessage(loadingId);

      // 错误情况下也获取 executionLog
      content = '❌ 请求失败：' + (errorResult.message || '未知错误');
      executionLog = errorResult.executionLog || [];

      // 添加错误消息（传递执行日志以便用户可查看）
      const messageDiv = addMessage('assistant', content, true, executionLog);

      // 将错误回复添加到消息历史（包含执行日志）
      state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog });

      // 保存历史
      saveChatHistory();

      throw errorResult; // 重新抛出以触发 finally 块
    }

    // 移除加载消息
    removeLoadingMessage(loadingId);

    // 添加助手回复（传递执行日志）
    const messageDiv = addMessage('assistant', content, true, executionLog);

    // 渲染消息中的 mermaid 图表
    await renderMessageMermaid(messageDiv);

    // 将助手回复添加到消息历史（包含执行日志）
    state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog });

    // 保存历史
    saveChatHistory();

  } catch (error) {
    // 已在内部 catch 块中处理并保存，这里只做清理工作
  } finally {
    state.isGenerating = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

// ==================== 提示词管理模态框 ====================

/**
 * 显示提示词管理模态框
 */
function showPromptManageModal() {
  const modal = document.getElementById('promptManageModal');
  modal.classList.add('show');
  renderPromptManageList();
}

/**
 * 隐藏提示词管理模态框
 */
function hidePromptManageModal() {
  const modal = document.getElementById('promptManageModal');
  modal.classList.remove('show');
  // 清空输入框
  const editIndex = document.getElementById('editPromptIndex');
  const codeInput = document.getElementById('newPromptCode');
  const contentInput = document.getElementById('newPromptContent');
  const addBtn = document.getElementById('promptManageAddBtn');

  if (editIndex) editIndex.value = '';
  if (codeInput) codeInput.value = '';
  if (contentInput) contentInput.value = '';
  if (addBtn) {
    addBtn.textContent = '添加提示词';
    addBtn.style.background = '#667eea';
  }
}

/**
 * 渲染提示词管理列表
 */
function renderPromptManageList() {
  const list = document.getElementById('promptManageList');

  if (state.customPrompts.length === 0) {
    list.innerHTML = '<div class="prompt-empty">暂无提示词，请添加</div>';
    return;
  }

  list.innerHTML = state.customPrompts.map((prompt, index) => `
    <div class="prompt-manage-item" draggable="true" data-index="${index}">
      <div class="prompt-manage-item-left">
        <span class="prompt-drag-handle" title="拖拽排序">⋮⋮</span>
        <span class="prompt-manage-item-code">/${prompt.code}</span>
        <span class="prompt-manage-item-content">${prompt.content}</span>
      </div>
      <div class="prompt-manage-item-actions">
        <button class="prompt-sort-btn move-up-btn" data-index="${index}" title="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="prompt-sort-btn move-down-btn" data-index="${index}" title="下移" ${index === state.customPrompts.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="prompt-sort-btn menu-toggle-btn ${prompt.enabledInMenu === true ? 'active' : ''}" data-index="${index}" title="菜单显示">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
          </svg>
        </button>
        <button class="edit-btn" data-index="${index}" title="编辑">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.146.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12h.5a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.468-.325z"/>
          </svg>
        </button>
        <button class="delete-btn" data-index="${index}" title="删除">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
            <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

  // 绑定上移按钮事件
  list.querySelectorAll('.move-up-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      if (index > 0) {
        const temp = state.customPrompts[index];
        state.customPrompts[index] = state.customPrompts[index - 1];
        state.customPrompts[index - 1] = temp;
        chrome.storage.local.set({ customPrompts: state.customPrompts });
        renderPromptManageList();
      }
    });
  });

  // 绑定下移按钮事件
  list.querySelectorAll('.move-down-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      if (index < state.customPrompts.length - 1) {
        const temp = state.customPrompts[index];
        state.customPrompts[index] = state.customPrompts[index + 1];
        state.customPrompts[index + 1] = temp;
        chrome.storage.local.set({ customPrompts: state.customPrompts });
        renderPromptManageList();
      }
    });
  });

  // 绑定菜单显示切换按钮事件
  list.querySelectorAll('.menu-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      state.customPrompts[index].enabledInMenu = !state.customPrompts[index].enabledInMenu;
      chrome.storage.local.set({ customPrompts: state.customPrompts });
      renderPromptManageList();
    });
  });

  // 绑定编辑事件
  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      editPrompt(index);
    });
  });

  // 绑定删除事件
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      showDeleteConfirmModal(index);
    });
  });

  // 绑定拖拽事件
  initPromptDragAndDrop();
}

// ==================== 提示词错误模态框 ====================

/**
 * 显示提示词校验错误模态框
 */
function showPromptErrorModal(message) {
  const modal = document.getElementById('promptErrorModal');
  const messageEl = document.getElementById('promptErrorMessage');
  messageEl.textContent = message;
  modal.classList.add('show');
}

/**
 * 隐藏提示词校验错误模态框
 */
function hidePromptErrorModal() {
  const modal = document.getElementById('promptErrorModal');
  modal.classList.remove('show');
}

// ==================== 提示词增删改 ====================

/**
 * 添加提示词
 */
function addPrompt() {
  const editIndex = document.getElementById('editPromptIndex');
  const codeInput = document.getElementById('newPromptCode');
  const contentInput = document.getElementById('newPromptContent');

  const code = codeInput.value.trim();
  const content = contentInput.value.trim();

  if (!code || !content) {
    showPromptErrorModal('请填写编码和内容');
    return;
  }

  const editIdx = editIndex ? parseInt(editIndex.value) : -1;

  // 检查编码是否已存在
  const existingIndex = state.customPrompts.findIndex(p => p.code === code);
  if (existingIndex !== -1 && existingIndex !== editIdx) {
    showPromptErrorModal('编码已存在');
    return;
  }

  if (editIdx >= 0 && editIdx < state.customPrompts.length) {
    // 编辑已有提示词，保留 enabledInMenu 状态
    state.customPrompts[editIdx] = { ...state.customPrompts[editIdx], code, content };
  } else {
    // 添加新提示词，默认不在菜单中显示
    state.customPrompts.push({ code, content, enabledInMenu: false });
  }

  chrome.storage.local.set({ customPrompts: state.customPrompts });

  // 清空输入框
  codeInput.value = '';
  contentInput.value = '';
  if (editIndex) {
    editIndex.value = '';
  }

  // 更新按钮文字
  const addBtn = document.getElementById('promptManageAddBtn');
  addBtn.textContent = '添加提示词';
  addBtn.style.background = '#667eea';

  // 重新渲染列表
  renderPromptManageList();
}

/**
 * 编辑提示词
 */
function editPrompt(index) {
  const prompt = state.customPrompts[index];
  if (!prompt) return;

  const editIndex = document.getElementById('editPromptIndex');
  const codeInput = document.getElementById('newPromptCode');
  const contentInput = document.getElementById('newPromptContent');
  const addBtn = document.getElementById('promptManageAddBtn');

  // 填充编辑索引
  if (editIndex) {
    editIndex.value = index;
  }

  // 填充表单
  codeInput.value = prompt.code;
  contentInput.value = prompt.content;

  // 更新按钮文字
  addBtn.textContent = '保存修改';
  addBtn.style.background = '#ffa502';

  // 滚动到表单区域
  codeInput.scrollIntoView({ behavior: 'smooth' });
}

/**
 * 显示删除确认模态框
 */
function showDeleteConfirmModal(index) {
  const prompt = state.customPrompts[index];
  if (!prompt) return;

  state.pendingDeleteIndex = index;
  const modal = document.getElementById('deleteConfirmModal');
  const message = document.getElementById('deleteConfirmMessage');
  message.textContent = `确定要删除提示词 "/${prompt.code}" 吗？`;
  modal.classList.add('show');
}

/**
 * 隐藏删除确认模态框
 */
function hideDeleteConfirmModal() {
  const modal = document.getElementById('deleteConfirmModal');
  modal.classList.remove('show');
  state.pendingDeleteIndex = -1;
}

/**
 * 删除提示词
 */
function deletePrompt(index) {
  state.customPrompts.splice(index, 1);
  chrome.storage.local.set({ customPrompts: state.customPrompts });
  renderPromptManageList();
}

// ==================== 初始化提示词事件 ====================

/**
 * 初始化提示词相关事件（原 IIFE）
 */
function initPromptEvents() {
  // 提示词管理模态框按钮
  const promptManageCancelBtn = document.getElementById('promptManageCancelBtn');
  const promptManageAddBtn = document.getElementById('promptManageAddBtn');
  const promptModalCloseBtn = document.getElementById('promptModalCloseBtn');

  if (promptManageCancelBtn) {
    promptManageCancelBtn.addEventListener('click', hidePromptManageModal);
  }

  if (promptManageAddBtn) {
    promptManageAddBtn.addEventListener('click', addPrompt);
  }

  // 关闭按钮
  if (promptModalCloseBtn) {
    promptModalCloseBtn.addEventListener('click', hidePromptManageModal);
  }

  // 删除确认模态框按钮
  const deleteCancelBtn = document.getElementById('deleteCancelBtn');
  const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');

  if (deleteCancelBtn) {
    deleteCancelBtn.addEventListener('click', hideDeleteConfirmModal);
  }

  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', () => {
      if (state.pendingDeleteIndex >= 0) {
        deletePrompt(state.pendingDeleteIndex);
      }
      hideDeleteConfirmModal();
    });
  }

  // 点击删除确认模态框外部关闭
  const deleteConfirmModal = document.getElementById('deleteConfirmModal');
  if (deleteConfirmModal) {
    deleteConfirmModal.addEventListener('click', (e) => {
      if (e.target === deleteConfirmModal) {
        hideDeleteConfirmModal();
      }
    });
  }

  // 提示词错误模态框按钮
  const promptErrorConfirmBtn = document.getElementById('promptErrorConfirmBtn');
  if (promptErrorConfirmBtn) {
    promptErrorConfirmBtn.addEventListener('click', hidePromptErrorModal);
  }

  // 点击提示词错误模态框外部关闭
  const promptErrorModal = document.getElementById('promptErrorModal');
  if (promptErrorModal) {
    promptErrorModal.addEventListener('click', (e) => {
      if (e.target === promptErrorModal) {
        hidePromptErrorModal();
      }
    });
  }
}

function openToolsPopup() {
  const toolsPopupOverlay = document.getElementById('toolsPopupOverlay');
  if (!toolsPopupOverlay) return;
  
  // 重置筛选条件
  state.currentCategory = 'all';
  state.currentSearch = '';
  
  // 清空搜索框
  const searchInput = document.getElementById('toolsSearchInput');
  if (searchInput) {
    searchInput.value = '';
  }
  
  // 更新标签角标数字
  updateCategoryBadges();
  
  // 更新标题中的启用工具数
  updateToolsPopupTitle();
  
  // 初始化所有标签的样式
  const categoryBtns = document.querySelectorAll('.category-btn');
  categoryBtns.forEach(btn => {
    btn.classList.remove('active');
    if (btn.classList.contains('category-all')) {
      // "全部"标签设置为选中状态
      btn.classList.add('active');
      btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      btn.style.color = 'white';
      btn.style.borderColor = 'transparent';
    } else {
      // 其他标签设置为默认样式
      btn.style.background = 'white';
      btn.style.color = '#555';
      btn.style.borderColor = '#ececec';
    }
  });
  
  // 渲染工具列表
  renderToolsPopupList();
  
  // 显示弹窗（使用 modal-overlay 的 show 类）
  toolsPopupOverlay.classList.add('show');
  
  console.log('[SidePanel] 打开工具弹窗');
}

function closeToolsPopup() {
  const toolsPopupOverlay = document.getElementById('toolsPopupOverlay');
  if (!toolsPopupOverlay) return;
  
  // 清除所有标签的选中状态
  const categoryBtns = document.querySelectorAll('.category-btn');
  categoryBtns.forEach(btn => {
    btn.classList.remove('active');
    btn.style.background = '';
    btn.style.color = '';
    btn.style.borderColor = '';
  });
  
  // 隐藏弹窗
  toolsPopupOverlay.classList.remove('show');
  
  console.log('[SidePanel] 关闭工具弹窗');
}

function renderToolsPopupList() {
  const toolsList = document.getElementById('toolsPopupList');
  if (!toolsList) return;
  
  toolsList.innerHTML = '';
  
  // 按分类分组显示
  const groupedTools = {};
  
  BUILTIN_TOOLS_UI.forEach(tool => {
    // 过滤：分类
    if (state.currentCategory !== 'all' && tool.category !== state.currentCategory) {
      return;
    }
    
    // 过滤：搜索
    if (state.currentSearch) {
      const nameMatch = tool.name.toLowerCase().includes(state.currentSearch);
      const descMatch = tool.description.toLowerCase().includes(state.currentSearch);
      if (!nameMatch && !descMatch) {
        return;
      }
    }
    
    const category = tool.category || 'other';
    if (!groupedTools[category]) {
      groupedTools[category] = [];
    }
    groupedTools[category].push(tool);
  });
  
  // 分类名称映射（用于显示）
  const categoryNames = {
    'page_interaction': '🖱️ 页面交互',
    'form_operation': '📝 表单操作',
    'info_extract': '📄 信息提取',
    'page_analysis': '🔍 页面分析',
    'tab_management': '📑 标签页管理',
    'bookmark_history': '🔖 书签历史',
    'storage_management': '💾 存储管理',
    'network_request': '🌐 网络请求',
    'media_process': '📷 媒体处理',
    'debug_dev': '🔧 调试开发',
    'ai_collaboration': '🤖 AI协作',
    'system_integration': '⚙️ 系统集成'
  };
  
  // 优化后的分类排序（按使用频率和逻辑顺序）
  const categoryOrder = ['page_interaction', 'form_operation', 'info_extract', 'page_analysis', 
                         'tab_management', 'bookmark_history', 'storage_management', 
                         'network_request', 'media_process', 'debug_dev', 'ai_collaboration', 'system_integration'];
  
  categoryOrder.forEach(category => {
    const tools = groupedTools[category];
    if (!tools || tools.length === 0) return;
    
    // 计算该分类下的工具总数和已启用数
    const categoryTools = BUILTIN_TOOLS_UI.filter(t => t.category === category);
    const totalCount = categoryTools.length;
    const enabledCount = categoryTools.filter(t => state.enabledTools.includes(t.id)).length;
    
    // 创建分类容器
    const categoryContainer = document.createElement('div');
    categoryContainer.className = 'popup-tool-category-group';
    categoryContainer.dataset.category = category;
    
    // 添加分类标题（带折叠按钮）
    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'popup-tool-category';
    categoryHeader.dataset.category = category;
    
    const isCollapsed = state.collapsedCategories[category] || false;
    
    categoryHeader.innerHTML = `
      <span class="category-expand-icon">${isCollapsed ? '▶' : '▼'}</span>
      <span class="category-name">${categoryNames[category] || category}</span>
      <span class="category-count">${enabledCount}/${totalCount}</span>
    `;
    
    // 添加折叠点击事件
    categoryHeader.addEventListener('click', () => {
      toggleCategoryCollapse(category);
    });
    
    categoryContainer.appendChild(categoryHeader);
    
    // 创建工具列表容器
    const toolsContainer = document.createElement('div');
    toolsContainer.className = `popup-tool-items ${isCollapsed ? 'collapsed' : ''}`;
    
    // 添加该分类下的工具
    tools.forEach(tool => {
      const isChecked = state.enabledTools.includes(tool.id);
      
      const toolItem = document.createElement('div');
      toolItem.className = 'popup-tool-item';
      toolItem.dataset.category = category;
      toolItem.innerHTML = `
        <input type="checkbox" id="tool_${tool.id}" ${isChecked ? 'checked' : ''}>
        <div class="popup-tool-content">
          <div class="popup-tool-name">${tool.name}</div>
          <div class="popup-tool-desc">${tool.description}</div>
        </div>
      `;
      
      // 为checkbox添加change事件监听器，实时更新分类标题的启用数量和enabledTools数组
      const checkbox = toolItem.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          // 阻止事件冒泡，避免触发分类折叠
          e.stopPropagation();
          // 更新enabledTools数组
          if (e.target.checked) {
            if (!state.enabledTools.includes(tool.id)) {
              state.enabledTools.push(tool.id);
            }
          } else {
            const index = state.enabledTools.indexOf(tool.id);
            if (index > -1) {
              state.enabledTools.splice(index, 1);
            }
          }
          // 更新分类标题的启用数量显示
          updateCategoryCount(category);
          // 更新标签角标
          updateCategoryBadges();
          // 更新弹窗标题中的启用工具数
          updateToolsPopupTitle();
        });
      }
      
      toolsContainer.appendChild(toolItem);
    });
    
    categoryContainer.appendChild(toolsContainer);
    toolsList.appendChild(categoryContainer);
  });
  
  // 如果没有结果
  if (toolsList.children.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'popup-tool-empty';
    emptyMsg.textContent = '没有找到匹配的工具';
    toolsList.appendChild(emptyMsg);
  }
}

function toggleCategoryCollapse(category) {
  state.collapsedCategories[category] = !state.collapsedCategories[category];
  
  const container = document.querySelector(`.popup-tool-category-group[data-category="${category}"]`);
  if (!container) return;
  
  const header = container.querySelector('.popup-tool-category');
  const icon = header.querySelector('.category-expand-icon');
  const items = container.querySelector('.popup-tool-items');
  
  if (state.collapsedCategories[category]) {
    icon.textContent = '▶';
    items.classList.add('collapsed');
  } else {
    icon.textContent = '▼';
    items.classList.remove('collapsed');
  }
}

function updateCategoryCount(category) {
  const categoryHeader = document.querySelector(`.popup-tool-category[data-category="${category}"]`);
  if (!categoryHeader) return;
  
  const countSpan = categoryHeader.querySelector('.category-count');
  if (!countSpan) return;
  
  // 获取该分类下的所有工具checkbox
  const categoryTools = BUILTIN_TOOLS_UI.filter(t => t.category === category);
  const totalCount = categoryTools.length;
  
  // 计算当前选中的数量
  let enabledCount = 0;
  categoryTools.forEach(tool => {
    const checkbox = document.getElementById('tool_' + tool.id);
    if (checkbox && checkbox.checked) {
      enabledCount++;
    }
  });
  
  // 更新数字显示
  countSpan.textContent = `${enabledCount}/${totalCount}`;
}

function getVisibleTools() {
  return BUILTIN_TOOLS_UI.filter(tool => {
    // 分类筛选
    if (state.currentCategory !== 'all' && tool.category !== state.currentCategory) {
      return false;
    }
    // 搜索筛选
    if (state.currentSearch) {
      const nameMatch = tool.name.toLowerCase().includes(state.currentSearch.toLowerCase());
      const descMatch = tool.description.toLowerCase().includes(state.currentSearch.toLowerCase());
      if (!nameMatch && !descMatch) {
        return false;
      }
    }
    return true;
  });
}

function updateAllCategoryCounts() {
  const categories = ['page_interaction', 'form_operation', 'info_extract', 'page_analysis', 
                     'tab_management', 'bookmark_history', 'storage_management', 
                     'network_request', 'media_process', 'debug_dev', 'ai_collaboration', 'system_integration'];
  categories.forEach(category => {
    updateCategoryCount(category);
  });
}

function updateCategoryBadges() {
  const categories = ['all', 'page_interaction', 'form_operation', 'info_extract', 'page_analysis', 
                     'tab_management', 'bookmark_history', 'storage_management', 
                     'network_request', 'media_process', 'debug_dev', 'ai_collaboration', 'system_integration'];
  
  categories.forEach(category => {
    const badge = document.getElementById('badge-' + category);
    if (!badge) return;
    
    let totalCount = 0;
    let enabledCount = 0;
    
    if (category === 'all') {
      totalCount = BUILTIN_TOOLS_UI.length;
      enabledCount = state.enabledTools.length;
    } else {
      const categoryTools = BUILTIN_TOOLS_UI.filter(tool => tool.category === category);
      totalCount = categoryTools.length;
      enabledCount = categoryTools.filter(t => state.enabledTools.includes(t.id)).length;
    }
    
    badge.textContent = `${enabledCount}/${totalCount}`;
  });
}

function updateToolsPopupTitle() {
  const countSpan = document.getElementById('toolsEnabledCount');
  if (!countSpan) return;
  
  const totalCount = BUILTIN_TOOLS_UI.length;
  const enabledCount = state.enabledTools.length;
  
  countSpan.textContent = `(已启用 ${enabledCount}/${totalCount})`;
}

function saveToolsFromPopup() {
  const newEnabledTools = [];
  
  BUILTIN_TOOLS_UI.forEach(tool => {
    const checkbox = document.getElementById('tool_' + tool.id);
    if (checkbox) {
      // 可见工具：根据 checkbox 状态决定
      if (checkbox.checked) {
        newEnabledTools.push(tool.id);
      }
    } else {
      // 不可见工具：保持原始状态（从 enabledTools 数组中获取）
      if (state.enabledTools.includes(tool.id)) {
        newEnabledTools.push(tool.id);
      }
    }
  });
  
  state.enabledTools = newEnabledTools;
  state.useTools = state.enabledTools.length > 0;
  
  // 保存到 storage
  chrome.storage.local.set({ enabledTools: state.enabledTools }, () => {
    console.log('[SidePanel] 工具配置已保存:', state.enabledTools);
  });
  
  // 更新按钮状态
  updateToolsToggleState();
  
  showToast(state.useTools ? `已启用 ${state.enabledTools.length} 个工具` : '工具已全部禁用', 'success');
}

function updateToolsToggleState() {
  const toolsToggleBtn = document.getElementById('toolsToggleBtn');
  const toolsBadge = document.getElementById('toolsBadge');
  
  if (toolsToggleBtn) {
    if (state.useTools && state.enabledTools.length > 0) {
      toolsToggleBtn.classList.add('active');
      toolsToggleBtn.title = `工具 (${state.enabledTools.length}个启用)`;
    } else {
      toolsToggleBtn.classList.remove('active');
      toolsToggleBtn.title = '工具 (未启用)';
    }
  }
  
  if (toolsBadge) {
    if (state.enabledTools.length > 0) {
      toolsBadge.textContent = state.enabledTools.length;
      toolsBadge.style.display = 'inline';
    } else {
      toolsBadge.style.display = 'none';
    }
  }
}

// side_panel/index.js - Side Panel 入口文件

// ==================== 配置监听 ====================

// 监听配置变化，实时更新记忆限制标签
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.chatMaxMemoryMessages) {
    state.chatConfig.maxMemoryMessages = changes.chatMaxMemoryMessages.newValue;
    updateMemoryLimitLabel();
    console.log('[SidePanel] 记忆限制配置已更新:', state.chatConfig.maxMemoryMessages);
  }
});

// ==================== 记忆限制相关 ====================

function updateMemoryLimitLabel() {
  const label = document.getElementById('memoryLimitLabel');
  if (label) {
    if (state.chatConfig.maxMemoryMessages !== null && state.chatConfig.maxMemoryMessages !== undefined && state.chatConfig.maxMemoryMessages > 0) {
      label.textContent = `(${state.chatConfig.maxMemoryMessages})`;
    } else {
      label.textContent = '(全)';
    }
    label.style.display = 'inline';
    label.style.cursor = 'pointer';
    label.title = '点击设置记忆历史限制条数';
  }
}

function toggleMemoryLimitDropdown(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropdown = document.getElementById('memoryLimitDropdown');
  dropdown.classList.toggle('show');

  if (dropdown.classList.contains('show')) {
    const currentValue = state.chatConfig.maxMemoryMessages;
    const options = dropdown.querySelectorAll('.memory-limit-option');
    options.forEach(opt => {
      opt.classList.remove('selected');
      const optValue = parseInt(opt.dataset.value);
      if ((currentValue === null && optValue === 0) ||
          (currentValue !== null && currentValue > 0 && optValue === currentValue)) {
        opt.classList.add('selected');
      }
    });

    const input = dropdown.querySelector('#memoryLimitInput');
    if (currentValue !== null && currentValue > 0) {
      input.value = currentValue;
    } else {
      input.value = '';
    }
  }
}

function initMemoryLimitDropdown() {
  const dropdown = document.getElementById('memoryLimitDropdown');
  const label = document.getElementById('memoryLimitLabel');
  const input = dropdown?.querySelector('#memoryLimitInput');

  if (!dropdown || !label) return;

  // 立即用当前状态刷新标签（避免 loadChatConfig 完成前显示空值）
  updateMemoryLimitLabel();

  label.addEventListener('click', toggleMemoryLimitDropdown);

  const options = dropdown.querySelectorAll('.memory-limit-option');
  options.forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = parseInt(opt.dataset.value);
      const maxMemoryMessages = value === 0 ? null : value;

      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');

      if (input) {
        input.value = value === 0 ? '' : value;
      }

      chrome.storage.local.set({ chatMaxMemoryMessages: maxMemoryMessages }, () => {
        state.chatConfig.maxMemoryMessages = maxMemoryMessages;
        updateMemoryLimitLabel();
        showToast('✅ 配置已更新', 'success');
      });
    });
  });

  if (input) {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('change', (e) => {
      e.stopPropagation();
      const value = e.target.value.trim();
      const maxMemoryMessages = value && parseInt(value) > 0 ? parseInt(value) : null;

      options.forEach(o => o.classList.remove('selected'));

      chrome.storage.local.set({ chatMaxMemoryMessages: maxMemoryMessages }, () => {
        state.chatConfig.maxMemoryMessages = maxMemoryMessages;
        updateMemoryLimitLabel();
        showToast('✅ 配置已更新', 'success');
      });
    });
  }

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== label) {
      dropdown.classList.remove('show');
    }
  });
}

// ==================== 模型选择相关 ====================

function updateModelSelection(selectedValue) {
  document.querySelectorAll('.model-option').forEach(option => {
    if (option.dataset.value === selectedValue) {
      option.classList.add('selected');
      option.querySelector('.model-option-check').textContent = '✓';
    } else {
      option.classList.remove('selected');
      option.querySelector('.model-option-check').textContent = '';
    }
  });
}

function loadCustomModelsToDropdown(customModels, callback) {
  const tempDropdown = document.getElementById('tempDropdown');
  if (!tempDropdown || !customModels) {
    if (typeof callback === 'function') callback();
    return;
  }

  const presetModels = ['deepseek-v4-pro', 'deepseek-v4-flash'];

  customModels.forEach(modelName => {
    if (presetModels.includes(modelName)) return;
    const existingOption = tempDropdown.querySelector(`.model-option[data-value="${modelName}"]`);
    if (existingOption) return;

    const option = document.createElement('div');
    option.className = 'model-option';
    option.dataset.value = modelName;
    option.innerHTML = `<span class="model-option-check"></span>${modelName}`;

    option.addEventListener('click', (e) => {
      e.stopPropagation();
      state.currentModel = modelName;
      updateModelSelection(modelName);
      chrome.storage.local.set({ modelName: modelName });
    });

    tempDropdown.querySelector('.model-section').appendChild(option);
  });

  if (typeof callback === 'function') {
    callback();
  }
}

// ==================== 选中内容上下文 ====================

function setSelectedContext(text, prefix = '📌 已选中') {
  if (!state.enableSelectionQuery) {
    return;
  }
  state.quotedContextText = '';
  state.selectedContextText = text;
  const indicator = document.getElementById('selectionIndicator');
  const selectionText = document.getElementById('selectionText');
  const userInput = document.getElementById('userInput');

  if (indicator && selectionText && userInput) {
    let displayText;
    if (text.length > 100) {
      displayText = text.substring(0, 100) + '...';
    } else if (text.length > 50) {
      displayText = text.substring(0, 50) + '...';
    } else {
      displayText = text;
    }
    selectionText.textContent = `${prefix}: ${displayText}`;
    indicator.classList.add('show');
  }
}

// ==================== 划词问答 - 浮动菜单 ====================

function showFloatingMenu(selection, text, mouseX = 0, mouseY = 0) {
  if (!state.enableSelectionQuery) {
    return;
  }

  const selectionFloatingMenu = document.getElementById('selectionFloatingMenu');
  const selectionMenuItems = document.getElementById('selectionMenuItems');

  if (!selectionFloatingMenu || !selectionMenuItems) {
    return;
  }

  const menuPrompts = state.customPrompts.filter(p => p.enabledInMenu === true);

  if (menuPrompts.length === 0) {
    return;
  }

  selectionMenuItems.innerHTML = '';

  menuPrompts.forEach(prompt => {
    const displayContent = prompt.content.length > 10 ? prompt.content.substring(0, 10) + '...' : prompt.content;
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.innerHTML = `
      <span>${displayContent}</span>
      <span class="menu-item-code">/${prompt.code}</span>
    `;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSelectionPromptClick(prompt, text);
    });
    selectionMenuItems.appendChild(item);
  });

  const sidePanelBody = document.body;
  const bodyRect = sidePanelBody.getBoundingClientRect();

  const estimatedMenuHeight = 40 + menuPrompts.length * 36;
  const estimatedMenuWidth = 180;

  let top = mouseY - bodyRect.top - estimatedMenuHeight - 10;
  let left = mouseX - bodyRect.left - 20;

  if (top < bodyRect.top + 10) {
    top = mouseY - bodyRect.top + 15;
  }

  if (left < bodyRect.left + 10) {
    left = mouseX - bodyRect.left + 20;
  }

  if (left + estimatedMenuWidth > bodyRect.right - 10) {
    left = mouseX - bodyRect.left - estimatedMenuWidth - 10;
    if (left < bodyRect.left + 10) {
      left = mouseX - bodyRect.left + 20;
    }
  }

  if (top + estimatedMenuHeight > bodyRect.bottom - 10) {
    top = mouseY - bodyRect.top - estimatedMenuHeight - 10;
    if (top < bodyRect.top + 10) {
      top = mouseY - bodyRect.top + 15;
    }
  }

  selectionFloatingMenu.style.top = top + 'px';
  selectionFloatingMenu.style.left = left + 'px';
  selectionFloatingMenu.style.maxHeight = (bodyRect.bottom - top - 20) + 'px';
  selectionFloatingMenu.classList.add('show');
}

window.hideFloatingMenu = function() {
  const selectionFloatingMenu = document.getElementById('selectionFloatingMenu');
  if (selectionFloatingMenu) {
    selectionFloatingMenu.classList.remove('show');
  }
  
  state.lastSelectedText = '';
  state.currentSelectionRange = null;
};

// ==================== 划词问答 - 点击处理 ====================

async function handleSelectionPromptClick(prompt, selectedText) {
  if (!state.enableSelectionQuery) {
    return;
  }

  window.hideFloatingMenu();

  if (state.isGenerating) {
    console.log('[SidePanel] 正在生成中，请稍候...');
    return;
  }

  state.selectedContextText = selectedText;

  clearSelectedContext$1();

  const chatContainer = document.getElementById('chatContainer');
  const welcomeMessage = chatContainer.querySelector('.welcome-message');
  if (welcomeMessage) {
    welcomeMessage.remove();
  }

  addContextBubble('selected', selectedText, false);

  const userMessage = `[选中内容]\n${selectedText}\n\n[用户问题]\n${prompt.content}`;

  addMessage('user', prompt.content);

  state.messageHistory.push({ role: 'user', content: userMessage });

  saveChatHistory();

  addToInputHistory(prompt.content);

  state.isGenerating = true;
  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;

  const loadingId = addLoadingMessage();

  const model = state.currentModel;

  try {
    await ensureChatConfigLoaded();

    console.log('[SidePanel] 发送消息调试信息:');
    console.log('  - isolateChat:', state.isolateChat);
    console.log('  - chatConfig:', state.chatConfig);
    console.log('  - messageHistory.length:', state.messageHistory.length);

    let messages = [
      {
        role: 'system',
        content: getSystemPrompt()
      }
    ];

    if (state.isolateChat) {
      let historyToSend = state.messageHistory;
      if (state.chatConfig.maxMemoryMessages !== null && state.chatConfig.maxMemoryMessages !== undefined && state.chatConfig.maxMemoryMessages > 0) {
        const historyWithoutCurrent = state.messageHistory.slice(0, -1);
        const limitedHistory = historyWithoutCurrent.slice(-state.chatConfig.maxMemoryMessages);
        historyToSend = [...limitedHistory, state.messageHistory[state.messageHistory.length - 1]];
        console.log('[SidePanel] 记忆历史限制生效:', state.chatConfig.maxMemoryMessages, '条（不含当前消息），实际发送:', historyToSend.length, '条');
      } else {
        console.log('[SidePanel] 记忆历史限制未生效:', state.chatConfig.maxMemoryMessages);
      }
      messages = [...messages, ...historyToSend];
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

    const apiParams = await getApiParams();
    let content, executionLog;

    try {
      const result = await callApi(messages, model, state.useTools, apiParams);
      content = result.content;
      executionLog = result.executionLog || [];
    } catch (errorResult) {
      removeLoadingMessage(loadingId);

      content = '❌ 请求失败：' + (errorResult.message || '未知错误');
      executionLog = errorResult.executionLog || [];

      const messageDiv = addMessage('assistant', content, true, executionLog);

      state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog });

      saveChatHistory();

      throw errorResult;
    }

    removeLoadingMessage(loadingId);

    const messageDiv = addMessage('assistant', content, true, executionLog);

    await renderMessageMermaid(messageDiv);

    state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog });

    saveChatHistory();

  } catch (error) {
  } finally {
    state.isGenerating = false;
    sendBtn.disabled = false;
    const userInput = document.getElementById('userInput');
    userInput.focus();
  }
}

// ==================== 主初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
  // 存储表格数据供工具栏按钮使用
  window.__tableBlocks = [];

  // 获取当前激活的 Tab ID
  await getCurrentActiveTabId();

  // 监听选中文本 AI 搜索消息（来自 background）
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SELECTION_AI_SEARCH' && message.prompt) {
      console.log('[SidePanel] 收到选中文本 AI 搜索:', message.selectedText?.substring(0, 50));
      triggerSelectionSearch(message.prompt, message.selectedText);
      // 清除存储的待处理搜索
      chrome.storage.session.remove('pendingSelectionSearch').catch(() => {});
    }
    if (message.type === 'FILL_SIDEPANEL_INPUT' && message.text) {
      console.log('[SidePanel] 收到追问填充:', message.text?.substring(0, 50));
      fillSidePanelInput(message.text);
      // 清除存储的待填充文本
      chrome.storage.session.remove('pendingFillInput').catch(() => {});
    }
    if (message.type === 'DIRECT_SEND' && message.text) {
      console.log('[SidePanel] 收到直接发送:', message.text?.substring(0, 50));
      directSend(message.text, message.selectedText || '');
      // 清除存储的待发送文本
      chrome.storage.session.remove('pendingDirectSend').catch(() => {});
    }
  });

  // 检查是否有待处理的选中文本搜索（Side Panel 刚打开时）
  const stored = await chrome.storage.session.get('pendingSelectionSearch');
  if (stored.pendingSelectionSearch && stored.pendingSelectionSearch.selectedText) {
    const { prompt, selectedText } = stored.pendingSelectionSearch;
    console.log('[SidePanel] 有待处理的选中文本搜索:', selectedText?.substring(0, 50));
    // 延迟执行，确保 UI 已完全初始化
    setTimeout(() => {
      triggerSelectionSearch(prompt, selectedText);
    }, 500);
    await chrome.storage.session.remove('pendingSelectionSearch');
  }

  // 检查是否有待填充的追问文本（Side Panel 刚打开时）
  const fillStored = await chrome.storage.session.get('pendingFillInput');
  if (fillStored.pendingFillInput && fillStored.pendingFillInput.text) {
    const { text } = fillStored.pendingFillInput;
    console.log('[SidePanel] 有待填充的追问文本:', text?.substring(0, 50));
    setTimeout(() => {
      fillSidePanelInput(text);
    }, 500);
    await chrome.storage.session.remove('pendingFillInput');
  }
  
  // 检查是否有待直接发送的文本（Side Panel 刚打开时）
  const sendStored = await chrome.storage.session.get('pendingDirectSend');
  if (sendStored.pendingDirectSend && sendStored.pendingDirectSend.text) {
    const { text, selectedText } = sendStored.pendingDirectSend;
    console.log('[SidePanel] 有待直接发送的文本:', text?.substring(0, 50));
    setTimeout(() => {
      directSend(text, selectedText || '');
    }, 500);
    await chrome.storage.session.remove('pendingDirectSend');
  }

  // 监听 Tab 切换事件,更新当前 Tab ID
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log('[SidePanel] Tab 切换, 新 Tab ID:', activeInfo.tabId);
    state.currentTabId = activeInfo.tabId;
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === 'complete' && state.currentTabId === tabId) {
      console.log('[SidePanel] 当前 Tab 页面更新:', changeInfo);
    }
  });

  // 初始化 marked
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
    console.log('[SidePanel] Marked 库已加载');
  }

  // 初始化 mermaid
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });
    console.log('[SidePanel] Mermaid 库已加载');
  }

  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const exportChatBtn = document.getElementById('exportChatBtn');
  const chatContainerEl = document.getElementById('chatContainer');

  // ==================== 温度设置初始化 ====================
  const tempDisplay = document.getElementById('tempDisplay');
  const tempDropdown = document.getElementById('tempDropdown');
  const tempPresetList = document.getElementById('tempPresetList');
  const tempSlider = document.getElementById('tempSlider');
  const tempNumberInput = document.getElementById('tempNumberInput');

  // 调整输入框高度（滚动时不调整）
  function adjustInputHeight() {
    if (!userInput || state.isScrolling) return;
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 100) + 'px';
  }

  // 加载保存的温度设置
  chrome.storage.local.get(['temperature', 'topP', 'selectedTempIndex'], (result) => {
    if (result.temperature !== undefined) state.temperature = result.temperature;
    if (result.topP !== undefined) state.topP = result.topP;
    if (result.selectedTempIndex !== undefined) state.selectedTempIndex = result.selectedTempIndex;

    updateTempUI();
  });

  // 更新温度UI显示
  function updateTempUI() {
    if (tempSlider) tempSlider.value = state.temperature;
    if (tempNumberInput) tempNumberInput.value = state.temperature.toFixed(2);
    const tempIconValueEl = document.getElementById('tempIconValue');
    if (tempIconValueEl) tempIconValueEl.textContent = state.temperature.toFixed(2);

    renderTempPresets();
  }

  // 渲染温度预设列表
  function renderTempPresets() {
    tempPresetList.innerHTML = PRESET_MODES.map((mode, index) => `
      <div class="temp-preset-item ${index === state.selectedTempIndex ? 'selected' : ''}" data-index="${index}">
        <div class="temp-preset-radio"></div>
        <div class="temp-preset-info">
          <div class="temp-preset-name">${mode.label}</div>
          <div class="temp-preset-desc" title="${mode.tip}">${mode.tip}</div>
        </div>
        <div class="temp-preset-value">${mode.temp.toFixed(2)}</div>
      </div>
    `).join('');

    tempPresetList.querySelectorAll('.temp-preset-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(item.dataset.index);
        selectTempPreset(index);
      });
    });
  }

  // 选择温度档位
  function selectTempPreset(index) {
    const mode = PRESET_MODES[index];
    if (!mode) return;

    state.selectedTempIndex = index;
    state.temperature = mode.temp;

    updateTempUI();

    chrome.storage.local.set({ temperature: state.temperature, topP: state.topP, selectedTempIndex: state.selectedTempIndex });
  }

  // 温度滑块事件
  tempSlider.addEventListener('input', (e) => {
    e.stopPropagation();
    let val = parseFloat(e.target.value);
    if (isNaN(val)) val = 0;
    val = Math.max(0, Math.min(1, val));
    state.temperature = val;
    tempNumberInput.value = val.toFixed(2);
    const tempIconValueEl = document.getElementById('tempIconValue');
    if (tempIconValueEl) tempIconValueEl.textContent = val.toFixed(2);

    let closestIndex = 0;
    let minDiff = Math.abs(PRESET_MODES[0].temp - val);
    for (let i = 1; i < PRESET_MODES.length; i++) {
      const diff = Math.abs(PRESET_MODES[i].temp - val);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    state.selectedTempIndex = closestIndex;
    renderTempPresets();

    chrome.storage.local.set({ temperature: state.temperature, topP: state.topP, selectedTempIndex: state.selectedTempIndex });
  });

  // 温度数字输入事件
  tempNumberInput.addEventListener('change', (e) => {
    e.stopPropagation();
    let val = parseFloat(e.target.value);
    if (isNaN(val)) val = 0;
    val = Math.max(0, Math.min(1, val));
    state.temperature = val;
    tempSlider.value = val;
    tempNumberInput.value = val.toFixed(2);

    let closestIndex = 0;
    let minDiff = Math.abs(PRESET_MODES[0].temp - val);
    for (let i = 1; i < PRESET_MODES.length; i++) {
      const diff = Math.abs(PRESET_MODES[i].temp - val);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    state.selectedTempIndex = closestIndex;
    renderTempPresets();

    chrome.storage.local.set({ temperature: state.temperature, topP: state.topP, selectedTempIndex: state.selectedTempIndex });
  });

  // 温度选择器点击事件
  if (tempDisplay && tempDropdown) {
    tempDisplay.addEventListener('click', (e) => {
      e.stopPropagation();
      tempDropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      const tempSelector = document.querySelector('.temp-selector');
      if (tempSelector && !tempSelector.contains(e.target)) {
        tempDropdown.classList.remove('show');
      }
    });
  }

  // ==================== 划词问答相关 ====================

  chatContainerEl.addEventListener('mousedown', (e) => {
    state.lastMouseX = e.clientX;
    state.lastMouseY = e.clientY;
  });

  chatContainerEl.addEventListener('mouseup', (e) => {
    state.lastMouseX = e.clientX;
    state.lastMouseY = e.clientY;

    if (!state.enableSelectionQuery) {
      return;
    }

    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) {
        const selectedText = selection.toString().trim();
        if (chatContainerEl.contains(selection.anchorNode)) {
          if (selectedText !== state.lastSelectedText) {
            state.lastSelectedText = selectedText;
            state.currentSelectionRange = selection.getRangeAt(0).cloneRange();

            setSelectedContext(selectedText);

            showFloatingMenu(selection, selectedText, state.lastMouseX, state.lastMouseY);
          }
        }
      } else {
        if (!chatContainerEl.contains(selection.anchorNode)) {
          state.lastSelectedText = '';
          state.currentSelectionRange = null;
          window.hideFloatingMenu();
        }
      }
    }, 10);
  });

  // 定时检查页面选中内容（每500ms检查一次）
  let pageLastSelectedText = '';

  setInterval(async () => {
    try {
      if (!state.enableSelectionQuery) {
        return;
      }

      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs));
      });
      if (tabs && tabs.length > 0) {
        const response = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'getSelectedText' }, (res) => {
            if (chrome.runtime.lastError) {
              console.debug('[SidePanel] content script 未加载或无法通信:', chrome.runtime.lastError.message);
              resolve(null);
            } else {
              resolve(res);
            }
          });
        });

        if (!response) {
          return;
        }

        const selectedText = response?.text || '';

        if (selectedText && selectedText.trim()) {
          if (selectedText !== pageLastSelectedText) {
            pageLastSelectedText = selectedText;
            setSelectedContext(selectedText.trim());
          }
        } else {
          pageLastSelectedText = '';
        }
      }
    } catch (e) {
    }
  }, 500);

  // 加载保存的模型选择和自定义模型
  chrome.storage.local.get(['modelName', 'customModels', 'customPrompts', 'systemPrompt', 'inputHistory'], (result) => {
    const savedModelName = result.modelName;
    if (savedModelName) {
      state.currentModel = savedModelName;
    }
    state.customPrompts = result.customPrompts || [];
    state.systemPrompt = result.systemPrompt || '';
    state.inputHistory = result.inputHistory || [];
    addPromptManageButton();

    loadCustomModelsToDropdown(result.customModels, () => {
      if (savedModelName) {
        updateModelSelection(savedModelName);
      }
    });
  });

  // 监听 storage 变化以更新自定义模型列表和模型选中状态
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.customModels) {
        const newCustomModels = changes.customModels.newValue || [];
        const modelSection = tempDropdown.querySelector('.model-section');
        if (modelSection) {
          const existingOptions = modelSection.querySelectorAll('.model-option');
          existingOptions.forEach(opt => {
            const value = opt.dataset.value;
            if (value !== 'deepseek-v4-pro' && value !== 'deepseek-v4-flash') {
              opt.remove();
            }
          });
        }
        loadCustomModelsToDropdown(newCustomModels);
      }
      if (changes.modelName) {
        const newModelName = changes.modelName.newValue;
        if (newModelName) {
          state.currentModel = newModelName;
          updateModelSelection(newModelName);
        }
      }
    }
  });

  // 加载保存的对话历史
  loadChatHistory();

  // 模型选项点击事件（现在在tempDropdown内）
  document.querySelectorAll('.model-option').forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = option.dataset.value;
      state.currentModel = value;
      updateModelSelection(value);
      chrome.storage.local.set({ modelName: value });
    });
  });

  // 点击其他地方关闭下拉框和浮动菜单
  document.addEventListener('click', (e) => {
    const promptDropdown = document.getElementById('promptDropdown');
    const promptSelector = document.getElementById('promptSelector');
    const selectionFloatingMenu = document.getElementById('selectionFloatingMenu');

    if (!promptSelector.contains(e.target)) {
      promptDropdown.classList.remove('show');
      hidePromptSelector();
    }
    
    if (selectionFloatingMenu && !selectionFloatingMenu.contains(e.target)) {
      const selection = window.getSelection();
      const isClickInsideChat = chatContainerEl.contains(e.target);
      const isSelectionInsideChat = selection && !selection.isCollapsed && chatContainerEl.contains(selection.anchorNode);
      
      if (!isClickInsideChat || !isSelectionInsideChat) {
        window.hideFloatingMenu();
      }
    }
  });

  // 发送按钮点击事件
  sendBtn.addEventListener('click', sendMessage);

  // 提示词触发按钮点击事件 - 切换显示/隐藏提示词选择器
  const promptTriggerBtn = document.getElementById('promptTriggerBtn');
  if (promptTriggerBtn) {
    promptTriggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      promptTriggerBtn.blur();
      togglePromptSelector();
    });
  }

  // 全局键盘快捷键
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
      e.preventDefault();
      const toolsPopup = document.getElementById('toolsPopup');
      if (toolsPopup && toolsPopup.style.display !== 'none') {
        closeToolsPopup();
      } else {
        openToolsPopup();
      }
    }
  });

  // 输入框回车发送（Shift+Enter 换行）
  userInput.addEventListener('keydown', (e) => {
    const promptSelector = document.getElementById('promptSelector');
    const promptDropdown = document.getElementById('promptDropdown');

    if (promptSelector.style.display !== 'none' && promptDropdown.classList.contains('show')) {
      const promptItems = promptDropdown.querySelectorAll('.prompt-item');
      const visibleCount = promptItems.length;

      if (visibleCount === 0) ; else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (state.selectedPromptIndex < 0) {
          state.selectedPromptIndex = 0;
        } else {
          state.selectedPromptIndex = (state.selectedPromptIndex + 1) % visibleCount;
        }
        updatePromptSelection(promptItems);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (state.selectedPromptIndex < 0) {
          state.selectedPromptIndex = visibleCount - 1;
        } else if (state.selectedPromptIndex === 0) {
          state.selectedPromptIndex = visibleCount - 1;
        } else {
          state.selectedPromptIndex = state.selectedPromptIndex - 1;
        }
        updatePromptSelection(promptItems);
        return;
      }

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && state.selectedPromptIndex >= 0) {
        e.preventDefault();
        const selectedCode = promptItems[state.selectedPromptIndex].dataset.code;
        insertPromptToInputByCode(selectedCode);
        return;
      }

      if (e.key === 'Enter' && state.selectedPromptIndex >= 0) {
        e.preventDefault();
        const selectedCode = promptItems[state.selectedPromptIndex].dataset.code;
        sendPromptByCode(selectedCode);
        return;
      }

      if (e.key === 'Escape') {
        hidePromptSelector();
        return;
      }
    }

    if (e.key === 'Escape') {
      if (state.inputHistoryIndex >= 0) {
        state.inputHistoryIndex = -1;
      }
      if (userInput.value) {
        userInput.value = '';
        userInput.style.height = 'auto';
        userInput.dispatchEvent(new Event('input'));
      }
      e.preventDefault();
      return;
    }

    const isPromptSelectorVisible = promptSelector.style.display !== 'none' && promptDropdown.classList.contains('show');
    if (!isPromptSelectorVisible && !state.isGenerating) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (state.inputHistoryIndex === -1) {
          state.inputHistoryIndex = state.inputHistory.length - 1;
        } else if (state.inputHistoryIndex > 0) {
          state.inputHistoryIndex--;
        }
        if (state.inputHistoryIndex < 0) {
          state.inputHistoryIndex = 0;
        }
        if (state.inputHistoryIndex >= 0 && state.inputHistory.length > 0) {
          userInput.value = state.inputHistory[state.inputHistoryIndex];
          userInput.dispatchEvent(new Event('input'));
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (state.inputHistoryIndex >= 0 && state.inputHistoryIndex < state.inputHistory.length - 1) {
          state.inputHistoryIndex++;
          userInput.value = state.inputHistory[state.inputHistoryIndex];
          userInput.dispatchEvent(new Event('input'));
        } else {
          state.inputHistoryIndex = -1;
          userInput.value = '';
          userInput.dispatchEvent(new Event('input'));
        }
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 控制输入框滚轮事件：锁定高度防止跳动
  userInput.addEventListener('wheel', (e) => {
    state.isScrolling = true;

    const currentHeight = userInput.style.height || userInput.offsetHeight + 'px';
    userInput.style.height = currentHeight;

    if (userInput.scrollHeight <= userInput.clientHeight + 10) {
      e.preventDefault();
      e.stopPropagation();
    }

    setTimeout(() => {
      state.isScrolling = false;
    }, 100);
  }, { passive: false });

  // 输入框输入事件 - 检查是否需要显示提示词选择器
  userInput.addEventListener('input', (e) => {
    const value = userInput.value;
    document.getElementById('promptSelector');
    document.getElementById('promptDropdown');

    const lastSlashIndex = value.lastIndexOf('/');

    if (lastSlashIndex !== -1) {
      const filterText = value.substring(lastSlashIndex + 1);

      if (lastSlashIndex === 0 || value[lastSlashIndex - 1] === '\n' || value[lastSlashIndex - 1] === ' ') {
        showPromptSelector(filterText);
      } else {
        updatePromptList(filterText);
      }
    } else {
      hidePromptSelector();
    }

    adjustInputHeight();
  });

  chatContainerEl.addEventListener('scroll', () => {
    chrome.storage.local.set({ scrollPosition: chatContainerEl.scrollTop });
  });

  // 清除对话历史按钮
  clearChatBtn.addEventListener('click', () => {
    showModal();
  });

  // 导出对话历史按钮
  if (exportChatBtn) {
    exportChatBtn.addEventListener('click', exportChatHistory);
  }

  // 设置按钮
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // 隔离对话开关（记忆对话）
  const isolateChatBtn = document.getElementById('isolateChatBtn');
  const enableToolsBtn = document.getElementById('enableToolsBtn');
  const toolsConfigBtn = document.getElementById('toolsConfigBtn');

  // 加载保存的状态
  chrome.storage.local.get(['isolateChat', 'enableSelectionQuery', 'enableTools', 'enabledTools'], (result) => {
    if (result.isolateChat !== undefined) {
      state.isolateChat = result.isolateChat;
    }
    isolateChatBtn.checked = state.isolateChat;

    if (result.enableSelectionQuery !== undefined) {
      state.enableSelectionQuery = result.enableSelectionQuery;
    }
    const enableSelectionQueryBtn = document.getElementById('enableSelectionQueryBtn');
    if (enableSelectionQueryBtn) {
      enableSelectionQueryBtn.checked = state.enableSelectionQuery;
    }

    if (result.enableTools !== undefined) {
      state.useTools = result.enableTools;
    }

    if (result.enabledTools && result.enabledTools.length > 0) {
      state.enabledTools = result.enabledTools;
    } else {
      state.enabledTools = BUILTIN_TOOLS_UI.filter(t => t.enabled).map(t => t.id);
    }

    if (state.enabledTools.length === 0) {
      state.useTools = false;
    }

    if (enableToolsBtn) {
      enableToolsBtn.checked = state.useTools;
    }
  });

  isolateChatBtn.addEventListener('change', () => {
    state.isolateChat = isolateChatBtn.checked;
    chrome.storage.local.set({ isolateChat: state.isolateChat });
    console.log('[SidePanel] 记忆对话:', state.isolateChat ? '已启用' : '已禁用');
  });

  // 划词问答开关
  const enableSelectionQueryBtn = document.getElementById('enableSelectionQueryBtn');
  if (enableSelectionQueryBtn) {
    enableSelectionQueryBtn.addEventListener('change', () => {
      state.enableSelectionQuery = enableSelectionQueryBtn.checked;
      chrome.storage.local.set({ enableSelectionQuery: state.enableSelectionQuery });
      console.log('[SidePanel] 划词问答:', state.enableSelectionQuery ? '已启用' : '已禁用');

      if (!state.enableSelectionQuery && state.selectedContextText) {
        clearSelectedContext$1();
      }
    });
  }

  // 工具总开关 - 勾选/取消勾选时直接启用/禁用所有工具
  if (enableToolsBtn) {
    enableToolsBtn.addEventListener('change', () => {
      state.useTools = enableToolsBtn.checked;
      chrome.storage.local.set({ enableTools: state.useTools });

      if (state.useTools && state.enabledTools.length === 0) {
        state.enabledTools = BUILTIN_TOOLS_UI.filter(t => t.enabled).map(t => t.id);
        chrome.storage.local.set({ enabledTools: state.enabledTools });
      }

      console.log('[SidePanel] 工具总开关:', state.useTools ? '已启用' : '已禁用');
    });
  }

  // 工具配置按钮 - 点击打开工具配置弹窗
  if (toolsConfigBtn) {
    toolsConfigBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openToolsPopup();
    });
  }

  // 工具弹窗相关元素
  const toolsPopupOverlay = document.getElementById('toolsPopupOverlay');
  const toolsPopupClose = document.getElementById('toolsPopupClose');
  const toolsPopupContainer = toolsPopupOverlay ? toolsPopupOverlay.querySelector('.modal-container') : null;

  if (toolsPopupClose) {
    toolsPopupClose.addEventListener('click', closeToolsPopup);
  }

  if (toolsPopupContainer) {
    toolsPopupContainer.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // 工具搜索功能
  const toolsSearchInput = document.getElementById('toolsSearchInput');

  if (toolsSearchInput) {
    toolsSearchInput.addEventListener('input', (e) => {
      state.currentSearch = e.target.value.toLowerCase();
      renderToolsPopupList();
    });
  }

  // 分类按钮点击事件
  const categoryBtns = document.querySelectorAll('.category-btn');
  categoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      categoryBtns.forEach(b => {
        b.classList.remove('active');
        if (b.classList.contains('category-all')) {
          b.style.background = '#f5f3ff';
          b.style.color = '#667eea';
          b.style.borderColor = '#d4cfff';
        } else {
          b.style.background = 'white';
          b.style.color = '#555';
          b.style.borderColor = '#ececec';
        }
      });
      btn.classList.add('active');
      btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      btn.style.color = 'white';
      btn.style.borderColor = 'transparent';
      state.currentCategory = btn.dataset.category;
      renderToolsPopupList();
    });
  });

  // 标签区域滚轮滚动支持
  const toolsCategories = document.getElementById('toolsCategories');
  if (toolsCategories) {
    toolsCategories.addEventListener('wheel', (e) => {
      e.preventDefault();
      toolsCategories.scrollLeft += e.deltaY * 2;
    }, { passive: false });
  }

  // 工具弹窗全选/取消全选（只作用于当前可见的工具）
  const toolsSelectAllBtn = document.getElementById('toolsSelectAll');
  const toolsSelectNoneBtn = document.getElementById('toolsSelectNone');

  if (toolsSelectAllBtn) {
    toolsSelectAllBtn.addEventListener('click', () => {
      const visibleTools = getVisibleTools();
      visibleTools.forEach(tool => {
        const checkbox = document.getElementById('tool_' + tool.id);
        if (checkbox) checkbox.checked = true;
        if (!state.enabledTools.includes(tool.id)) {
          state.enabledTools.push(tool.id);
        }
      });
      updateAllCategoryCounts();
      updateCategoryBadges();
      updateToolsPopupTitle();
    });
  }

  if (toolsSelectNoneBtn) {
    toolsSelectNoneBtn.addEventListener('click', () => {
      const visibleTools = getVisibleTools();
      visibleTools.forEach(tool => {
        const checkbox = document.getElementById('tool_' + tool.id);
        if (checkbox) checkbox.checked = false;
        const index = state.enabledTools.indexOf(tool.id);
        if (index > -1) {
          state.enabledTools.splice(index, 1);
        }
      });
      updateAllCategoryCounts();
      updateCategoryBadges();
      updateToolsPopupTitle();
    });
  }

  // 工具弹窗保存按钮（保存但不关闭窗口）
  const toolsPopupSave = document.getElementById('toolsPopupSave');
  if (toolsPopupSave) {
    toolsPopupSave.addEventListener('click', () => {
      saveToolsFromPopup();
      updateToolsPopupTitle();
    });
  }

  // 工具弹窗取消按钮
  const toolsPopupCancel = document.getElementById('toolsPopupCancel');
  if (toolsPopupCancel) {
    toolsPopupCancel.addEventListener('click', () => {
      closeToolsPopup();
    });
  }

  // 模态框按钮事件
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalConfirmBtn = document.getElementById('modalConfirmBtn');

  modalCancelBtn.addEventListener('click', () => {
    hideModal();
  });

  modalConfirmBtn.addEventListener('click', () => {
    hideModal();
    clearChatHistory();
  });

  // 点击模态框外部关闭
  const confirmModal = document.getElementById('confirmModal');
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      hideModal();
    }
  });

  // 关闭选中内容提示条
  const selectionCloseBtn = document.getElementById('selectionClose');
  if (selectionCloseBtn) {
    selectionCloseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[SidePanel] 用户点击关闭选中内容按钮');
      clearSelectedContext$1();
      window.hideFloatingMenu();
      state.lastSelectedText = '';
      state.currentSelectionRange = null;
    });
  }

  // 输入框输入时清除选中上下文
  userInput.addEventListener('input', () => {
  });
});

// ==================== 模块初始化 ====================

// 页面加载时获取配置，加载后刷新记忆限制标签
loadChatConfig().then(() => updateMemoryLimitLabel());

// 初始化记忆限制标签点击事件
document.addEventListener('DOMContentLoaded', () => {
  initMemoryLimitDropdown();
});

document.addEventListener('DOMContentLoaded', initMessageToc);
document.addEventListener('DOMContentLoaded', initPromptEvents);
document.addEventListener('DOMContentLoaded', initClarifyEvents);
