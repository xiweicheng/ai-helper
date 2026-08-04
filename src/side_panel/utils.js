// utils.js - 工具函数集合

import state from './state.js';
import { getAgent, getAllAgents } from './agent-store.js';
import { DEFAULT_REACT_CONFIG } from '../background/constants.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  util: {
    cmdHintPowerShell: '（请使用 PowerShell 语法，如 `Get-ChildItem`、`Set-Content`、`Remove-Item` 等）',
    cmdHintCmd: '（请使用 CMD 语法，如 `dir`、`echo`、`del` 等）',
    cmdHintGitBash: '（请使用 Unix 命令，如 `ls`、`cat`、`rm` 等，路径使用正斜杠 `/`）',
    cmdHintPowerShellShort: '（请使用 PowerShell 语法）',
    cmdHintUnix: '（请使用 Unix 命令，如 `ls`、`cat`、`rm` 等）',
    cmdExecEnvTitle: '## 命令执行环境',
    cmdExecOsShell: '**操作系统/Shell**',
    cmdExecWorkdir: '工作目录',
    cmdExecWorkdirUnset: '未设置',
    assistantTerm: '- **助手**：用户创建的 AI 智能体，每个助手有独立的系统提示词和工具权限，可独立工作或被其他助手调度执行子任务',
    noDesc: '无描述',
    subDispatchTitle: '## 子助手调度',
    subDispatchDesc: '使用 dispatch_task(subAgentId, task) 分派子任务给其他助手执行，支持并行调用。',
    subDispatchAvailable: '可用子助手：',
    agentTerm: '- **代理**：远端执行服务，提供文件操作、命令执行等能力。可通过 manage_agent 工具查询或切换代理',
    agentHostLabel: '- 代理主机地址：',
    agentHostHint: '（访问代理端服务时请优先使用此地址）',
    terminologyTitle: '## 术语定义',
    taskPlanningTitle: '## 任务拆解',
    taskPlanningDesc: '复杂任务（多步骤、有依赖）拆解为2-5个子任务，简单任务直接执行。使用 plan_task(taskDescription, subtasks) 提交方案。',
    memoryTitle: '## 记忆',
    memoryRules: '- 统一工具 agent_memory，通过 action 区分：store(增删改)/recall(检索)/manage(审查清理)\n- store: subAction=add需type+content，update需memoryId+type，**delete仅需memoryId无需type**。**删除前先recall查id**\n- recall: query用关键词(如"考试")，不用完整句子。可选memoryType和limit\n- manage: subAction=review审查价值，compact清理低价值\n- 存长期价值信息，加tags和importance(1-10)便于检索',
    importanceLabel: '重要性',
    tagsLabel: '标签',
    permanentNotesTitle: '## 永久注意事项',
    currentEnvTitle: '## 当前环境',
    currentTimeLabel: '当前时间：',
    browserLabel: '浏览器：Chrome 扩展 (Side Panel)',
    defaultPromptIntro: 'AI Helper：IT技术助手。',
    capabilityTitle: '## 能力',
    capabilityDesc: '编程开发与调试（Java/Python/JavaScript/Go/C++）、架构优化、性能调优、代码审查、文档编写、浏览器工具调用',
    taskPlanningJoin: '、任务规划',
    requirementTitle: '## 要求',
    requirementDesc: '精准技术术语，代码示例可运行，Markdown格式，方案可落地，不生成安全违规代码',
    envTitle: '## 环境',
  },
});

registerTranslations('en', {
  util: {
    cmdHintPowerShell: '(Use PowerShell syntax, e.g. `Get-ChildItem`, `Set-Content`, `Remove-Item`, etc.)',
    cmdHintCmd: '(Use CMD syntax, e.g. `dir`, `echo`, `del`, etc.)',
    cmdHintGitBash: '(Use Unix commands, e.g. `ls`, `cat`, `rm`, etc. Use forward slashes `/` for paths)',
    cmdHintPowerShellShort: '(Use PowerShell syntax)',
    cmdHintUnix: '(Use Unix commands, e.g. `ls`, `cat`, `rm`, etc.)',
    cmdExecEnvTitle: '## Command Execution Environment',
    cmdExecOsShell: '**OS/Shell**',
    cmdExecWorkdir: 'Working directory',
    cmdExecWorkdirUnset: 'not set',
    assistantTerm: '- **Assistant**: An AI agent created by the user. Each assistant has its own system prompt and tool permissions, and can work independently or be dispatched by other assistants to perform subtasks',
    noDesc: 'No description',
    subDispatchTitle: '## Sub-assistant Dispatch',
    subDispatchDesc: 'Use dispatch_task(subAgentId, task) to dispatch subtasks to other assistants. Parallel calls are supported.',
    subDispatchAvailable: 'Available sub-assistants:',
    agentTerm: '- **Agent**: A remote execution service that provides file operations, command execution, and other capabilities. Use the manage_agent tool to query or switch agents',
    agentHostLabel: '- Agent host: ',
    agentHostHint: '(Please use this address first when accessing agent services)',
    terminologyTitle: '## Terminology',
    taskPlanningTitle: '## Task Decomposition',
    taskPlanningDesc: 'Break down complex tasks (multi-step, with dependencies) into 2-5 subtasks; execute simple tasks directly. Use plan_task(taskDescription, subtasks) to submit the plan.',
    memoryTitle: '## Memory',
    memoryRules: '- Unified tool agent_memory, distinguished by action: store (add/update/delete) / recall (retrieve) / manage (review/cleanup)\n- store: subAction=add requires type+content, update requires memoryId+type, **delete only requires memoryId (no type)**. **Always recall first to find the id before deleting**\n- recall: use keywords for query (e.g. "exam"), not full sentences. Optional memoryType and limit\n- manage: subAction=review to assess value, compact to clean up low-value entries\n- Store long-term valuable information; add tags and importance (1-10) for easier retrieval',
    importanceLabel: 'Importance',
    tagsLabel: 'Tags',
    permanentNotesTitle: '## Permanent Notes',
    currentEnvTitle: '## Current Environment',
    currentTimeLabel: 'Current time: ',
    browserLabel: 'Browser: Chrome Extension (Side Panel)',
    defaultPromptIntro: 'AI Helper: IT Technical Assistant.',
    capabilityTitle: '## Capabilities',
    capabilityDesc: 'Programming & debugging (Java/Python/JavaScript/Go/C++), architecture optimization, performance tuning, code review, documentation, browser tool calls',
    taskPlanningJoin: ', task planning',
    requirementTitle: '## Requirements',
    requirementDesc: 'Precise technical terminology, runnable code examples, Markdown format, actionable solutions, no security-violating code',
    envTitle: '## Environment',
  },
});

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
    logger.error('[SidePanel] copy failed:', err);
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
        commandHint = t('util.cmdHintPowerShell');
      } else if (shellType.toLowerCase().includes('cmd') || shellType.toLowerCase().includes('command')) {
        shellType = 'CMD';
        commandHint = t('util.cmdHintCmd');
      } else if (shellType.toLowerCase().includes('bash') || ap.platformName.toLowerCase().includes('git')) {
        shellType = 'Git Bash';
        commandHint = t('util.cmdHintGitBash');
      } else {
        shellType = 'PowerShell';
        commandHint = t('util.cmdHintPowerShellShort');
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
      commandHint = t('util.cmdHintUnix');
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
      commandHint = t('util.cmdHintUnix');
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

${t('util.cmdExecEnvTitle')}
- ${t('util.cmdExecOsShell')}: ${execEnv.osType} (${execEnv.arch}) / ${execEnv.shellType}
- ${t('util.cmdExecWorkdir')}: ${execEnv.workdir || t('util.cmdExecWorkdirUnset')}
- ${execEnv.commandHint}`;
  }

  // 术语定义——助手术语和代理术语独立判断
  const allAgents = await getAllAgents();
  const subAgents = allAgents.filter(a => a.allowSubDispatch && a.id !== (agent?.id || ''));
  const hasSubDispatch = subAgents.length > 0 && agentHasTool('dispatch_task', agent?.toolIds);
  
  // 判断是否有配对的代理，并获取活跃代理主机地址
  let hasPairedAgents = false;
  let activeAgentHost = null;
  try {
    const result = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = result.pairedAgents || [];
    hasPairedAgents = agents.length > 0;
    if (hasPairedAgents && result.activeAgentId) {
      const activeAgent = agents.find(a => a.id === result.activeAgentId);
      if (activeAgent?.url) {
        try {
          activeAgentHost = new URL(activeAgent.url).hostname;
        } catch {
          // URL 解析失败时降级：通过字符串处理提取 hostname（不含端口）
          const stripped = activeAgent.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0];
          if (stripped) {
            activeAgentHost = stripped;
          }
        }
      }
    }
  } catch { /* 获取失败不影响主流程 */ }
  
  // 代理主机地址注入——当代理已连接且有活跃代理 Host 时
  let agentHostSection = '';
  if (activeAgentHost) {
    agentHostSection = `\n${t('util.agentHostLabel')}${activeAgentHost}${t('util.agentHostHint')}`;
  }

  let assistantTerminology = '';
  let agentTerminology = '';
  let dispatchToolRule = '';

  if (hasSubDispatch) {
    assistantTerminology = t('util.assistantTerm');

    const subAgentList = subAgents.map(a => `- **${a.id}** (${a.icon} ${a.name}): ${a.description || t('util.noDesc')}`).join('\n');
    dispatchToolRule = `

${t('util.subDispatchTitle')}
${t('util.subDispatchDesc')}

${t('util.subDispatchAvailable')}
${subAgentList}`;
  }

  if (hasPairedAgents) {
    agentTerminology = t('util.agentTerm');
  }

  // 拼接术语定义——两个术语独立注入
  let terminologySection = '';
  if (assistantTerminology || agentTerminology) {
    const terms = [assistantTerminology, agentTerminology].filter(Boolean).join('\n');
    terminologySection = `

${t('util.terminologyTitle')}
${terms}`;
  }

  // 任务拆解相关规则——仅在启用工具且当前 Agent 拥有 plan_task 时注入
  const taskPlanningRules = (state.useTools && agentHasTool('plan_task', agent?.toolIds)) ? `

${t('util.taskPlanningTitle')}
${t('util.taskPlanningDesc')}` : '';

  // 长期记忆规则——仅在启用工具、Agent 已连接、且拥有记忆工具时注入
  const memoryTools = ['agent_memory'];
  const hasAnyMemoryTool = memoryTools.some(t => agentHasTool(t, agent?.toolIds));
  const memoryRules = (state.useTools && state.agentPlatform?.connected && hasAnyMemoryTool) ? `

${t('util.memoryTitle')}
${t('util.memoryRules')}` : '';

  // 获取永久记忆（注意事项），注入系统提示词
  // 仅当本地 Agent 已连接时才获取（永久记忆存储在 Agent 本地文件系统中）
  let permanentNotesSection = '';
  if (state.agentPlatform?.connected) {
    try {
      const notes = await fetchPermanentNotes();
      if (notes && notes.length > 0) {
        const notesText = notes
          .map((n, i) => `${i + 1}. [${t('util.importanceLabel')}: ${n.importance || 5}] ${n.content}${n.tags && n.tags.length ? ` (${t('util.tagsLabel')}: ${n.tags.join(', ')})` : ''}`)
          .join('\n');
        permanentNotesSection = `

${t('util.permanentNotesTitle')}
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

${t('util.currentEnvTitle')}
- ${t('util.currentTimeLabel')}${currentTime}
- ${t('util.browserLabel')} / ${browserOS}${agentHostSection}${commandEnvSection}${taskPlanningRules}${dispatchToolRule}${memoryRules}
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
  let defaultPrompt = `${t('util.defaultPromptIntro')}${terminologySection}${permanentNotesSection}

${t('util.capabilityTitle')}
${t('util.capabilityDesc')}${(state.useTools && agentHasTool('plan_task', agent?.toolIds)) ? t('util.taskPlanningJoin') : ''}

${t('util.requirementTitle')}
${t('util.requirementDesc')}${taskPlanningRules}${dispatchToolRule}${memoryRules}

${t('util.envTitle')}
${currentTime} | Chrome Side Panel / ${browserOS}${agentHostSection}${commandEnvSection}
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
        logger.debug('[SidePanel] conversationconfiguration loaded:', state.chatConfig);
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
        logger.debug('[SidePanel] sync loadconversationconfiguration:', state.chatConfig);
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
        logger.debug('[SidePanel] get current Tab ID:', state.currentTabId, 'URL:', tabs[0].url);
        resolve(state.currentTabId);
      } else {
        logger.warn('[SidePanel] did not getvalid  Tab ID');
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
            logger.warn('[SidePanel] getselected content failed:', chrome.runtime.lastError.message);
            resolve('');
          } else {
            logger.debug('[SidePanel] got selectedcontent:', response?.text);
            resolve(response?.text || '');
          }
        });
      } else {
        resolve('');
      }
    });
  });
}
