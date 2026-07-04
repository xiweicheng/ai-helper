// utils.js - 工具函数集合

import state from './state.js';
import { getAgent, getAllAgents } from './agent-store.js';

/**
 * 显示 Toast 提示
 * @param {string} message - 提示消息
 * @param {string} type - 提示类型：success, error, warning, info
 * @param {number} duration - 显示时长（毫秒），默认 3000
 */
export function showToast(message, type = 'info', duration = 3000) {
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
export function adjustInputHeight() {
  const userInput = document.getElementById('userInput');
  if (!userInput) return;
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 100) + 'px';
}

/**
 * HTML 转义
 */
export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 格式化时长
 */
export function formatDuration(ms) {
  if (!ms || ms < 0) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(1);
  return `${mins}分${secs}秒`;
}

/**
 * 获取状态文本
 */
export function getStatusText(status) {
  const statusMap = {
    'success': '成功',
    'failed': '失败',
    'processing': '处理中'
  };
  return statusMap[status] || status;
}

/**
 * 复制到剪贴板
 */
export function copyToClipboard(text, btn) {
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
 * 优先级：Agent 自定义 > 全局自定义 > 默认
 * @param {Object} [agent] - 可选，当前使用的 Agent 对象
 */
export async function getSystemPrompt(agent = null) {
  const currentTime = new Date().toLocaleString('zh-CN');

  // 构建 Agent 平台信息文本
  let agentInfo = '';
  if (state.agentPlatform && state.agentPlatform.connected) {
    const ap = state.agentPlatform;
    agentInfo = `\n- 本地 Agent：${ap.platformName} (${ap.arch})，默认 shell: ${ap.shell}，工作目录: ${ap.workdir || '未设置'}`;
  }
  
  // dispatch_sub_agent 工具说明——仅在 Agent 允许 sub dispatch 时注入
  let dispatchToolRule = '';
  if (agent && agent.allowSubDispatch) {
    const allAgents = await getAllAgents();
    const subAgents = allAgents.filter(a => a.allowSubDispatch && a.id !== (agent.id || ''));
    const subAgentList = subAgents.map(a => `- **${a.id}** (${a.icon} ${a.name}): ${a.description || '无描述'}`).join('\n');
    dispatchToolRule = `
  
## Sub-Agent 调度
你可以使用 dispatch_sub_agent 工具将子任务分派给其他专业 Agent 执行。每个子 Agent 拥有独立的角色定义和工具集。
使用场景：复杂任务需要不同领域的专业能力时（如代码审查 + 文档撰写）。
调用方式：在一次响应中可并行调用多个 dispatch_sub_agent。

当前可用的子 Agent：
${subAgentList || '（暂无可用子 Agent，请先在 Agent 管理中创建并启用 Sub-Agent 调度）'}`;
  }

  // 任务拆解相关规则——仅在启用工具时注入，节省 token
  const taskPlanningRules = state.useTools ? `

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
   - 指定执行策略：sequential（顺序执行）、parallel（并行执行）或 conditional（条件执行）` : '';

  // 确定系统提示词内容：Agent > 全局 > 默认
  let promptContent;
  if (agent && agent.systemPrompt && agent.systemPrompt.trim()) {
    promptContent = agent.systemPrompt;
  } else if (state.systemPrompt && state.systemPrompt.trim()) {
    promptContent = state.systemPrompt;
  } else {
    promptContent = null;
  }

  // 如果 Agent 有自定义 prompt，用它拼接环境信息
  if (promptContent) {
    return `${promptContent}

## 当前环境
- 运行环境：Chrome 浏览器扩展（Side Panel）
- 操作系统：Windows 10.0
- 当前时间：${currentTime}${agentInfo}${taskPlanningRules}${dispatchToolRule}
`;
  }
  
  // 返回默认系统提示词
  return `你是AI智能助手(AI Helper)，专为IT从业者（产品经理、架构师、开发工程师、测试工程师等）打造的AI技术助手。

## 你的能力
- **编程开发**：精通主流编程语言（Java/Python/JavaScript/Go/C++等）及框架，能编写、调试、优化代码
- **技术问题解答**：擅长解答架构设计、算法优化、性能调优、Bug排查等技术问题
- **代码审查**：能提供代码质量评估、最佳实践建议、潜在风险识别
- **文档编写**：协助撰写技术文档、API说明、测试用例等
- **工具使用**：可调用浏览器工具获取当前网页内容或选中文本，辅助解答与网页相关的问题${state.useTools ? '\n- **任务规划**：能够将复杂任务拆解为多个子任务，规划执行顺序和所需工具' : ''}${taskPlanningRules}${dispatchToolRule}

## 回答原则
1. **精准专业**：使用准确的技术术语，回答直击要点
2. **代码优先**：涉及代码时，优先给出可运行的代码示例，并添加必要注释
3. **结构清晰**：善用Markdown格式（标题、列表、代码块、表格等）组织内容
4. **实用导向**：提供可落地的解决方案，避免空泛的理论
5. **安全合规**：不生成违反安全规范的代码，不涉及敏感信息处理${state.useTools ? '\n6. **任务驱动**：复杂任务先规划后执行，使用 plan_task 工具进行拆解' : ''}

## 当前环境
- 运行环境：Chrome 浏览器扩展（Side Panel）
- 操作系统：Windows 10.0
- 当前时间：${currentTime}${agentInfo}
`;
}

/**
 * 获取API参数（包含temperature和top_p）
 * 定义为全局函数，避免作用域问题
 * 直接从 storage 获取最新值，避免异步加载未完成时获取到默认值
 */
export function getApiParams() {
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
export function loadChatConfig() {
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
export async function ensureChatConfigLoaded() {
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
export async function getCurrentActiveTabId() {
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
export function getReactConfig() {
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

/**
 * 获取当前网页选中的内容
 */
export async function getSelectedTextFromPage() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getSelectedText' }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[SidePanel] 获取选中内容失败:', chrome.runtime.lastError.message);
            resolve('');
          } else {
            console.log('[SidePanel] 获取到选中内容:', response?.text);
            resolve(response?.text || '');
          }
        });
      } else {
        resolve('');
      }
    });
  });
}
