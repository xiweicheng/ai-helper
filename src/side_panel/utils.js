// utils.js - 工具函数集合

import state from './state.js';
import { getAgent, getAllAgents } from './agent-store.js';
import { DEFAULT_REACT_CONFIG } from '../background/constants.js';
import logger from '../shared/logger.js';
import { t } from '../shared/i18n.js';

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
 * 自动调整输入框高度（滚动时不调整）
 * 单行内容时移除 inline height，让 CSS min-height 统一处理，避免中英文 scrollHeight 差异导致抖动
 */
export function adjustInputHeight() {
  const userInput = document.getElementById('userInput');
  if (!userInput || state.isScrolling) return;
  userInput.style.height = 'auto';
  const scrollH = userInput.scrollHeight;
  // 单行内容时移除 inline height，让 CSS min-height 统一处理，避免中英文 scrollHeight 差异导致抖动
  if (scrollH <= 50) {
    userInput.style.height = '';
  } else {
    userInput.style.height = Math.min(scrollH, 100) + 'px';
  }
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

export function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 格式化时长：按就近原则选择单一单位（ms/s/min/h）
 * - 最多保留 1 位小数，无小数时不显示小数点
 * - 例：980ms → "980ms"，1500ms → "1.5s"，2000ms → "2s"，90000ms → "1.5min"，120000ms → "2min"
 */
export function formatDuration(ms) {
  if (!ms || ms < 0) return '0ms';
  // 按就近原则选取单位：相邻单位阈值附近，值越小用更小单位更直观
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${_oneDecimal(ms / 1000)}s`;
  if (ms < 3600000) return `${_oneDecimal(ms / 60000)}min`;
  return `${_oneDecimal(ms / 3600000)}h`;
}

/**
 * 格式化为最多一位小数；整数时不显示小数点
 */
function _oneDecimal(n) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * 获取状态文本
 */
export function getStatusText(status) {
  const statusMap = {
    'success': t('common.statusSuccess'),
    'failed': t('common.statusFailed'),
    'processing': t('common.statusProcessing')
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
      showToast(t('common.copyFailed'), 'error');
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

function getCommandExecutionEnv(agentToolIds = null) {
  if (!state.agentPlatform || !state.agentPlatform.connected) {
    return null;
  }

  // 全局 enabledTools 中是否包含 agent_exec
  const globalHasExec = state.enabledTools && state.enabledTools.includes('agent_exec');
  if (!globalHasExec) {
    return null;
  }

  // 如果 Agent 限制了工具列表，且不包含 agent_exec，则不注入命令环境提示
  if (agentToolIds != null && Array.isArray(agentToolIds) && !agentToolIds.includes('agent_exec')) {
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
 * 检查当前 Agent 是否拥有指定工具
 * @param {string} toolId - 工具 ID
 * @param {string[]|null|undefined} agentToolIds - Agent 的工具 ID 列表；null/undefined = 全部可用
 * @returns {boolean}
 */
function agentHasTool(toolId, agentToolIds) {
  if (agentToolIds == null) return true;
  return Array.isArray(agentToolIds) && agentToolIds.includes(toolId);
}

/**
 * 获取系统提示词
 * 优先级：Agent 自定义 > 全局自定义 > 默认
 * @param {Object} [agent] - 可选，当前使用的 Agent 对象
 */
export async function getSystemPrompt(agent = null) {
  const currentTime = new Date().toLocaleString('zh-CN');
  const browserOS = getBrowserOS();
  const execEnv = getCommandExecutionEnv(agent?.toolIds);

  let commandEnvSection = '';
  
  if (execEnv) {
    commandEnvSection = `

## 命令执行环境
- **操作系统/Shell**: ${execEnv.osType} (${execEnv.arch}) / ${execEnv.shellType}
- **工作目录**: ${execEnv.workdir || '未设置'}
- ${execEnv.commandHint}`;
  }

  // 术语定义——助手术语和代理术语独立判断
  const allAgents = await getAllAgents();
  const subAgents = allAgents.filter(a => a.allowSubDispatch && a.id !== (agent?.id || ''));
  const hasSubDispatch = subAgents.length > 0 && agentHasTool('dispatch_task', agent?.toolIds);
  
  // 判断是否有配对的代理
  let hasPairedAgents = false;
  try {
    const result = await chrome.storage.local.get(['pairedAgents']);
    hasPairedAgents = (result.pairedAgents || []).length > 0;
  } catch { /* 获取失败不影响主流程 */ }
  
  let assistantTerminology = '';
  let agentTerminology = '';
  let dispatchToolRule = '';

  if (hasSubDispatch) {
    assistantTerminology = `- **助手**：用户创建的 AI 智能体，每个助手有独立的系统提示词和工具权限，可独立工作或被其他助手调度执行子任务`;

    const subAgentList = subAgents.map(a => `- **${a.id}** (${a.icon} ${a.name}): ${a.description || '无描述'}`).join('\n');
    dispatchToolRule = `

## 子助手调度
使用 dispatch_task(subAgentId, task) 分派子任务给其他助手执行，支持并行调用。

可用子助手：
${subAgentList}`;
  }

  if (hasPairedAgents) {
    agentTerminology = `- **代理**：远端执行服务，提供文件操作、命令执行等能力。可通过 manage_agent 工具查询或切换代理`;
  }

  // 拼接术语定义——两个术语独立注入
  let terminologySection = '';
  if (assistantTerminology || agentTerminology) {
    const terms = [assistantTerminology, agentTerminology].filter(Boolean).join('\n');
    terminologySection = `

## 术语定义
${terms}`;
  }

  // 任务拆解相关规则——仅在启用工具且当前 Agent 拥有 plan_task 时注入
  const taskPlanningRules = (state.useTools && agentHasTool('plan_task', agent?.toolIds)) ? `

## 任务拆解
复杂任务（多步骤、有依赖）拆解为2-5个子任务，简单任务直接执行。使用 plan_task(taskDescription, subtasks) 提交方案。` : '';

  // 长期记忆规则——仅在启用工具、Agent 已连接、且拥有记忆工具时注入
  const memoryTools = ['agent_memory'];
  const hasAnyMemoryTool = memoryTools.some(t => agentHasTool(t, agent?.toolIds));
  const memoryRules = (state.useTools && state.agentPlatform?.connected && hasAnyMemoryTool) ? `

## 记忆
- 统一工具 agent_memory，通过 action 区分：store(增删改)/recall(检索)/manage(审查清理)
- store: subAction=add需type+content，update需memoryId+type，**delete仅需memoryId无需type**。**删除前先recall查id**
- recall: query用关键词(如"考试")，不用完整句子。可选memoryType和limit
- manage: subAction=review审查价值，compact清理低价值
- 存长期价值信息，加tags和importance(1-10)便于检索` : '';

  // 获取永久记忆（注意事项），注入系统提示词
  // 仅当本地 Agent 已连接时才获取（永久记忆存储在 Agent 本地文件系统中）
  let permanentNotesSection = '';
  if (state.agentPlatform?.connected) {
    try {
      const notes = await fetchPermanentNotes();
      if (notes && notes.length > 0) {
        const notesText = notes
          .map((n, i) => `${i + 1}. [重要性: ${n.importance || 5}] ${n.content}${n.tags && n.tags.length ? ` (标签: ${n.tags.join(', ')})` : ''}`)
          .join('\n');
        permanentNotesSection = `

## 永久注意事项
${notesText}
`;
      }
    } catch { /* 获取失败不影响主流程 */ }
  }

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
    let finalPrompt = `${promptContent}${terminologySection}${permanentNotesSection}

## 当前环境
- 当前时间：${currentTime}
- 浏览器：Chrome 扩展 (Side Panel) / ${browserOS}${commandEnvSection}${taskPlanningRules}${dispatchToolRule}${memoryRules}
`;

    // 注入 Agent Skill Prompts
    try {
      const skillPrompts = await fetchAgentSkillPrompts(agent?.toolIds, agent?.skillIds);
      if (skillPrompts) {
        finalPrompt += `\n${skillPrompts}\n`;
      }
    } catch { /* 获取失败不影响主流程 */ }

    return finalPrompt;
  }
  
  // 返回默认系统提示词
  let defaultPrompt = `AI Helper：IT技术助手。${terminologySection}${permanentNotesSection}

## 能力
编程开发与调试（Java/Python/JavaScript/Go/C++）、架构优化、性能调优、代码审查、文档编写、浏览器工具调用${(state.useTools && agentHasTool('plan_task', agent?.toolIds)) ? '、任务规划' : ''}

## 要求
精准技术术语，代码示例可运行，Markdown格式，方案可落地，不生成安全违规代码${taskPlanningRules}${dispatchToolRule}${memoryRules}

## 环境
${currentTime} | Chrome Side Panel / ${browserOS}${commandEnvSection}
`;

  // 注入 Agent Skill Prompts
  try {
    const skillPrompts = await fetchAgentSkillPrompts(agent?.toolIds, agent?.skillIds);
    if (skillPrompts) {
      defaultPrompt += `\n${skillPrompts}\n`;
    }
  } catch { /* 获取失败不影响主流程 */ }

  return defaultPrompt;
}

/**
 * 从后台获取 Agent Skill Prompts
 * @param {string[]|null|undefined} agentToolIds - Agent 的工具 ID 列表，null/undefined 表示使用全部工具
 * @param {string[]|null|undefined} agentSkillIds - Agent 的技能名称列表，null/undefined 表示全部技能，[] 表示无技能
 * @returns {Promise<string>}
 */
async function fetchAgentSkillPrompts(agentToolIds, agentSkillIds) {
  // 如果 Agent 指定了 skillIds 为空数组，则不注入任何技能
  if (Array.isArray(agentSkillIds) && agentSkillIds.length === 0) {
    return '';
  }

  // 如果 Agent 未指定技能列表（skillIds 为 null/undefined），
  // 且限定了工具列表且不含 Skill 工具，则跳过（AI 无法调用技能工具）
  const hasSkillIds = agentSkillIds != null && Array.isArray(agentSkillIds) && agentSkillIds.length > 0;
  if (!hasSkillIds) {
    if (agentToolIds != null && Array.isArray(agentToolIds)
        && !agentToolIds.includes('agent_skill')) {
      return '';
    }
  }

  return new Promise((resolve) => {
    try {
      // 检查全局 Skill 开关
      chrome.storage.local.get(['skillsEnabled'], (result) => {
        if (result.skillsEnabled === false) {
          resolve('');
          return;
        }
        const message = { type: 'GET_AGENT_SKILL_PROMPTS' };
        // 如果指定了技能名称列表，传递给后台过滤
        if (agentSkillIds != null && Array.isArray(agentSkillIds) && agentSkillIds.length > 0) {
          message.skillNames = agentSkillIds;
        }
        chrome.runtime.sendMessage(message, (response) => {
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
 * 从后台获取永久记忆（注意事项），用于注入系统提示词
 * @returns {Promise<Array<{id, content, tags, importance}>>}
 */
async function fetchPermanentNotes() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'GET_PERMANENT_NOTES' }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          resolve([]);
          return;
        }
        resolve(response.facts || []);
      });
    } catch {
      resolve([]);
    }
  });
}

/**
 * 获取API参数（包含temperature和top_p）
 * 定义为全局函数，避免作用域问题
 * 直接从 storage 获取最新值，避免异步加载未完成时获取到默认值
 */
export function getApiParams() {
  return Promise.resolve({
    temperature: parseFloat(state.temperature.toFixed(2)),
    top_p: parseFloat(state.topP.toFixed(2))
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
