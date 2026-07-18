// utils.js - 工具函数集合

import state from './state.js';
import { getAgent, getAllAgents } from './agent-store.js';
import { DEFAULT_REACT_CONFIG } from '../background/constants.js';
import logger from '../shared/logger.js';

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
    logger.error('[SidePanel] 复制失败:', err);
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

function getBrowserOS() {
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac OS') || ua.includes('Macintosh')) return 'macOS';
    if (ua.includes('Linux') && !ua.includes('Android')) return 'Linux';
  }
  return 'Unknown';
}

function getCommandExecutionEnv() {
  if (!state.agentPlatform || !state.agentPlatform.connected) {
    return null;
  }

  const hasExecCommandTool = state.enabledTools && state.enabledTools.includes('agent_exec_command');
  if (!hasExecCommandTool) {
    return null;
  }

  const ap = state.agentPlatform;
  let osType = 'unknown';
  let shellType = ap.shell || '/bin/sh';
  let commandHint = '';

  if (ap.platformName) {
    if (ap.platformName.toLowerCase().includes('windows')) {
      osType = 'Windows';
      if (shellType.toLowerCase().includes('powershell')) {
        shellType = 'PowerShell';
        commandHint = '（请使用 PowerShell 语法，如 `Get-ChildItem`、`Set-Content`、`Remove-Item` 等）';
      } else if (shellType.toLowerCase().includes('cmd') || shellType.toLowerCase().includes('command')) {
        shellType = 'CMD';
        commandHint = '（请使用 CMD 语法，如 `dir`、`echo`、`del` 等）';
      } else if (shellType.toLowerCase().includes('bash') || ap.platformName.toLowerCase().includes('git')) {
        shellType = 'Git Bash';
        commandHint = '（请使用 Unix 命令，如 `ls`、`cat`、`rm` 等，路径使用正斜杠 `/`）';
      } else {
        shellType = 'PowerShell';
        commandHint = '（请使用 PowerShell 语法）';
      }
    } else if (ap.platformName.toLowerCase().includes('mac') || ap.platformName.toLowerCase().includes('darwin')) {
      osType = 'macOS';
      if (shellType.toLowerCase().includes('zsh')) {
        shellType = 'zsh';
      } else if (shellType.toLowerCase().includes('bash')) {
        shellType = 'bash';
      } else {
        shellType = 'zsh';
      }
      commandHint = '（请使用 Unix 命令，如 `ls`、`cat`、`rm` 等）';
    } else if (ap.platformName.toLowerCase().includes('linux')) {
      osType = 'Linux';
      if (shellType.toLowerCase().includes('bash')) {
        shellType = 'bash';
      } else if (shellType.toLowerCase().includes('zsh')) {
        shellType = 'zsh';
      } else if (shellType.toLowerCase().includes('fish')) {
        shellType = 'fish';
      } else {
        shellType = 'bash';
      }
      commandHint = '（请使用 Unix 命令，如 `ls`、`cat`、`rm` 等）';
    }
  }

  return {
    osType,
    shellType,
    platformName: ap.platformName,
    arch: ap.arch,
    workdir: ap.workdir || '',
    commandHint
  };
}

/**
 * 获取系统提示词
 * 优先级：Agent 自定义 > 全局自定义 > 默认
 * @param {Object} [agent] - 可选，当前使用的 Agent 对象
 */
export async function getSystemPrompt(agent = null) {
  const currentTime = new Date().toLocaleString('zh-CN');
  const browserOS = getBrowserOS();
  const execEnv = getCommandExecutionEnv();

  let agentInfo = '';
  let commandEnvSection = '';
  
  if (execEnv) {
    agentInfo = `\n- 本地 Agent：${execEnv.platformName} (${execEnv.arch})，默认 shell: ${execEnv.shellType}，工作目录: ${execEnv.workdir || '未设置'}`;
    
    commandEnvSection = `

## 命令执行环境
- **操作系统**: ${execEnv.osType}
- **默认 Shell**: ${execEnv.shellType}
- **工作目录**: ${execEnv.workdir || '未设置'}
- **命令格式提示**: ${execEnv.commandHint}

### 命令格式规范
${['PowerShell', 'CMD'].includes(execEnv.shellType) ? `
- **文件操作**: 使用 PowerShell/CMD 命令，如 \`Get-ChildItem\`(ls), \`Set-Content\`(写文件), \`Remove-Item\`(删除), \`New-Item -ItemType Directory\`(创建目录)
- **环境变量**: 使用 \`$env:VAR_NAME\` 访问，如 \`$env:PATH\`
- **管道**: 使用 \`|\`，如 \`Get-ChildItem | Where-Object { $_.Name -like '*.txt' }\`
- **字符串**: 使用双引号 \`"\` 或单引号 \`'\`
- **避免**: 不要使用 Linux 特有命令如 \`cat\`(用 \`Get-Content\`), \`rm\`(用 \`Remove-Item\`), \`ls\`(用 \`Get-ChildItem\`)
` : `
- **文件操作**: 使用 Unix 命令，如 \`ls\`, \`cat\`, \`rm\`, \`mkdir\`, \`cp\`, \`mv\`
- **环境变量**: 使用 \`$VAR_NAME\` 访问，如 \`$PATH\`
- **管道**: 使用 \`|\`，如 \`ls -la | grep .txt\`
- **字符串**: 使用双引号 \`"\` 或单引号 \`'\`
- **路径**: 使用正斜杠 \`/\`，如 \`/c/Users/username/project\`（Windows 上 Git Bash）或 \`/home/user/project\`（Linux/macOS）
- **避免**: 不要使用 Windows 特有命令如 \`dir\`, \`del\`, \`copy\`
`}`;
  }
  
  // dispatch_sub_agent 工具说明——有可用子 Agent 时注入
  let dispatchToolRule = '';
  const allAgents = await getAllAgents();
  const subAgents = allAgents.filter(a => a.allowSubDispatch && a.id !== (agent?.id || ''));
  if (subAgents.length > 0) {
    const subAgentList = subAgents.map(a => `- **${a.id}** (${a.icon} ${a.name}): ${a.description || '无描述'}`).join('\n');
    dispatchToolRule = `
  
## Sub-Agent 调度
你可以使用 dispatch_sub_agent 工具将子任务分派给其他专业 Agent 执行。每个子 Agent 拥有独立的角色定义和工具集。
使用场景：复杂任务需要不同领域的专业能力时（如代码审查 + 文档撰写）。
调用方式：在一次响应中可并行调用多个 dispatch_sub_agent。
参数：subAgentId（子Agent的ID）、task（任务描述）

当前可用的子 Agent：
${subAgentList}`;
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

  // 长期记忆规则——仅在启用工具且 Agent 已连接时注入
  const memoryRules = (state.useTools && state.agentPlatform?.connected) ? `

## 长期记忆系统
你拥有长期记忆能力，可以将重要信息持久化存储，在未来的对话中召回使用。

**何时使用记忆**：
- 用户明确说"记住xxx"、"帮我记一下"时，调用 agent_memory_store 存储
- 对话中出现值得长期保留的信息（用户偏好、重要决策、项目规范等），主动判断是否需要存储
- 当用户的问题可能涉及历史信息时，自主调用 agent_memory_recall 检索相关记忆（对话中话题切换后也应重新检索）
- 记忆接近上限时会收到提示，届时调用 agent_memory_manage 进行审查整理

**记忆类型**：
- fact（事实记忆）：用户偏好、技术栈、项目决策、个人习惯等结构化事实
- summary（对话摘要）：对某次重要对话的总结

**存储原则**：
- 只存储有长期价值的信息，避免存储临时/琐碎的内容
- 为每条记忆添加适当的标签（tags）和重要性（importance）评分
- 重要性评分参考：偏好/习惯 8-10，技术决策 7-9，一般知识 5-7，临时备注 3-5` : '';

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
    let finalPrompt = `${promptContent}

## 当前环境
- 运行环境：Chrome 浏览器扩展（Side Panel）
- 浏览器操作系统：${browserOS}
- 当前时间：${currentTime}${agentInfo}${commandEnvSection}${taskPlanningRules}${dispatchToolRule}${memoryRules}
`;

    // 注入 Agent Skill Prompts
    try {
      const skillPrompts = await fetchAgentSkillPrompts(agent?.toolIds);
      if (skillPrompts) {
        finalPrompt += `\n${skillPrompts}\n`;
      }
    } catch { /* 获取失败不影响主流程 */ }

    return finalPrompt;
  }
  
  // 返回默认系统提示词
  let defaultPrompt = `你是AI智能助手(AI Helper)，专为IT从业者（产品经理、架构师、开发工程师、测试工程师等）打造的AI技术助手。

## 你的能力
- **编程开发**：精通主流编程语言（Java/Python/JavaScript/Go/C++等）及框架，能编写、调试、优化代码
- **技术问题解答**：擅长解答架构设计、算法优化、性能调优、Bug排查等技术问题
- **代码审查**：能提供代码质量评估、最佳实践建议、潜在风险识别
- **文档编写**：协助撰写技术文档、API说明、测试用例等
- **工具使用**：可调用浏览器工具获取当前网页内容或选中文本，辅助解答与网页相关的问题${state.useTools ? '\n- **任务规划**：能够将复杂任务拆解为多个子任务，规划执行顺序和所需工具' : ''}${taskPlanningRules}${dispatchToolRule}${memoryRules}

## 回答原则
1. **精准专业**：使用准确的技术术语，回答直击要点
2. **代码优先**：涉及代码时，优先给出可运行的代码示例，并添加必要注释
3. **结构清晰**：善用Markdown格式（标题、列表、代码块、表格等）组织内容
4. **实用导向**：提供可落地的解决方案，避免空泛的理论
5. **安全合规**：不生成违反安全规范的代码，不涉及敏感信息处理${state.useTools ? '\n6. **任务驱动**：复杂任务先规划后执行，使用 plan_task 工具进行拆解' : ''}

## 当前环境
- 运行环境：Chrome 浏览器扩展（Side Panel）
- 浏览器操作系统：${browserOS}
- 当前时间：${currentTime}${agentInfo}${commandEnvSection}
`;

  // 注入 Agent Skill Prompts
  try {
    const skillPrompts = await fetchAgentSkillPrompts(agent?.toolIds);
    if (skillPrompts) {
      defaultPrompt += `\n${skillPrompts}\n`;
    }
  } catch { /* 获取失败不影响主流程 */ }

  return defaultPrompt;
}

/**
 * 从后台获取 Agent Skill Prompts
 * @param {string[]|null|undefined} agentToolIds - Agent 的工具 ID 列表，null/undefined 表示使用全部工具
 * @returns {Promise<string>}
 */
async function fetchAgentSkillPrompts(agentToolIds) {
  // 如果 Agent 限定了工具列表，且列表中不包含任何 Skill 相关工具，则不注入 Skill 描述
  if (agentToolIds != null && Array.isArray(agentToolIds)
      && !agentToolIds.includes('agent_skill_load')
      && !agentToolIds.includes('agent_skill_run')) {
    return '';
  }

  return new Promise((resolve) => {
    try {
      // 检查全局 Skill 开关
      chrome.storage.local.get(['skillsEnabled'], (result) => {
        if (result.skillsEnabled === false) {
          resolve('');
          return;
        }
        chrome.runtime.sendMessage({ type: 'GET_AGENT_SKILL_PROMPTS' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve('');
            return;
          }
          resolve(response?.prompts || '');
        });
      });
    } catch {
      resolve('');
    }
  });
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
        logger.debug('[SidePanel] 对话配置已加载:', state.chatConfig);
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
        logger.debug('[SidePanel] 同步加载对话配置:', state.chatConfig);
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
        logger.debug('[SidePanel] 获取当前 Tab ID:', state.currentTabId, 'URL:', tabs[0].url);
        resolve(state.currentTabId);
      } else {
        logger.warn('[SidePanel] 未获取到有效的 Tab ID');
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
        loopTimeout: result.reactLoopTimeout || 7200000,
        toolTimeout: result.reactToolTimeout || 30000,
        clarifyTimeout: DEFAULT_REACT_CONFIG.clarifyTimeout
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
            logger.warn('[SidePanel] 获取选中内容失败:', chrome.runtime.lastError.message);
            resolve('');
          } else {
            logger.debug('[SidePanel] 获取到选中内容:', response?.text);
            resolve(response?.text || '');
          }
        });
      } else {
        resolve('');
      }
    });
  });
}
