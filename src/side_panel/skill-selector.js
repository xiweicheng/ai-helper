// side_panel/skill-selector.js - 技能选择器（提示词下拉框中的技能 Tab）
import state from './state.js';
import { escapeHtml, escapeAttr, adjustInputHeight } from './utils.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';
// 注：prompt-manager.js 反向依赖本模块（selectSkill/selectMcpService 等），构成循环 import；
// 此处引用的 hidePromptSelector 为函数声明（hoisted），仅运行时调用，ESM 循环依赖安全
import { hidePromptSelector } from './prompt-manager.js';

registerTranslations('zh', {
  promptSelector: {
    noMatchSkill: '暂无匹配的技能',
    skillManageTitle: '管理技能',
    noMatchMcp: '暂无匹配的 MCP 服务',
    toolCount: '{count} 个工具',
    mcpManageTitle: '管理 MCP 服务',
  },
});
registerTranslations('en', {
  promptSelector: {
    noMatchSkill: 'No matching skills',
    skillManageTitle: 'Manage skills',
    noMatchMcp: 'No matching MCP services',
    toolCount: '{count} tools',
    mcpManageTitle: 'Manage MCP services',
  },
});
registerTranslations('zh', {
  skillSelector: {
    selectedSkillStart: '[已选技能: {name}',
    useSkillToolsHint: '请根据上述技能说明，使用相关工具处理以下问题：\n',
    loadSkillHint: '请使用 `agent_skill`（action=load）加载「{name}」的完整说明，然后根据说明自主调用相关工具处理以下问题。\n',
    runSkillHint: '请使用 `agent_skill`（action=run）执行「{name}」技能来处理以下问题',
    requiredParam: '必填',
    optionalParam: '可选',
    callParamsPrefix: '，调用参数：',
    paramItem: '（{flag}，{type}：{desc}）',
    paramJoin: '、',
    sentenceEnd: '。\n',
    selectedMcpContext: '[已选MCP服务: {name}]\n请使用「{name}」MCP服务来处理以下问题：\n',
    disabledBadge: '未启用',
    disabledTooltip: '未启用（不会自动注入 AI 提示词），仍可手动选择使用',
    mcpInactiveBadge: '未开放',
    mcpInactiveTooltip: '该服务当前未开放（已关闭或被当前助手排除），选中后将随本次请求强制启用',
    manualUseSuffix: '手动使用',
  },
});
registerTranslations('en', {
  skillSelector: {
    selectedSkillStart: '[Selected skill: {name}',
    useSkillToolsHint: 'Please use the relevant tools to handle the following problem based on the skill description above:\n',
    loadSkillHint: 'Please use `agent_skill` (action=load) to load the full description of "{name}", then autonomously call relevant tools to handle the following problem.\n',
    runSkillHint: 'Please use `agent_skill` (action=run) to execute the "{name}" skill to handle the following problem',
    requiredParam: 'required',
    optionalParam: 'optional',
    callParamsPrefix: ', parameters: ',
    paramItem: '({flag}, {type}: {desc})',
    paramJoin: ', ',
    sentenceEnd: '.\n',
    selectedMcpContext: '[Selected MCP service: {name}]\nPlease use the "{name}" MCP service to handle the following problem:\n',
    disabledBadge: 'Disabled',
    disabledTooltip: 'Not enabled (won\'t be auto-injected into the AI prompt), but you can still select and use it manually',
    mcpInactiveBadge: 'Inactive',
    mcpInactiveTooltip: 'This service is currently inactive (closed or excluded by the current agent). Selecting it will force-enable it for this request.',
    manualUseSuffix: 'Manual',
  },
});

// 技能列表缓存
let skillListCache = [];
let skillListCacheTime = 0;
const CACHE_TTL = 30000; // 30 秒缓存

/**
 * 从后台获取技能列表
 * @returns {Promise<Array>}
 */
async function fetchSkillList(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && skillListCache.length > 0 && (now - skillListCacheTime) < CACHE_TTL) {
    return skillListCache;
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SKILL_LIST' }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        resolve(skillListCache); // 降级使用缓存
        return;
      }
      skillListCache = response.skills || [];
      skillListCacheTime = Date.now();
      resolve(skillListCache);
    });
  });
}

/**
 * 判断技能 Tab 是否应该显示
 * 条件：Agent 已连接 且 Skill 全局开关已开启
 * @returns {Promise<boolean>}
 */
export async function shouldShowSkillsTab() {
  // 检查 Agent 连接状态
  if (!state.agentPlatform?.connected) {
    return false;
  }

  // 检查 Skill 全局开关
  const storageResult = await new Promise((resolve) => {
    chrome.storage.local.get(['skillsEnabled'], resolve);
  });
  if (storageResult.skillsEnabled === false) {
    return false;
  }

  // 检查是否存在可选技能（全量，不受子助手 skillIds 绑定与启用状态限制）
  try {
    const visibleSkills = await getVisibleSkills();
    return visibleSkills.length > 0;
  } catch {
    return false;
  }
}

/**
 * 获取已启用的技能列表（过滤掉停用的）
 * @returns {Promise<Array>}
 */
export async function getEnabledSkills(forceRefresh = false) {
  const allSkills = await fetchSkillList(forceRefresh);
  return allSkills.filter(s => s.enabled !== false);
}

/**
 * 获取输入框下拉可选的技能列表（全量，不做任何过滤）
 * 包含已启用和未启用的技能，已启用的排在前面，未启用的排在后面。
 * 说明：
 * - 不受子助手（Agent）skillIds 绑定限制。子助手绑定只影响系统提示词中自动注入的技能，
 *   不应限制用户手动通过 "/" 触发选择技能。
 * - 不受 enabled 限制。未启用的技能虽然不会被自动注入系统提示词，但用户仍可主动选择，
 *   通过加载/执行工具正常使用（agent 端加载不校验 enabled）。
 * @param {boolean} forceRefresh - 是否强制刷新缓存
 * @returns {Promise<Array>}
 */
export async function getVisibleSkills(forceRefresh = false) {
  // 拷贝数组，避免排序污染 fetchSkillList 的缓存
  const skills = [...(await fetchSkillList(forceRefresh))];

  // 已启用的排在前面，未启用的排在后面
  skills.sort((a, b) => {
    const aEnabled = a.enabled !== false ? 0 : 1;
    const bEnabled = b.enabled !== false ? 0 : 1;
    return aEnabled - bEnabled;
  });

  return skills;
}

/**
 * 渲染技能列表
 * @param {string} filterText - 过滤文本
 */
export async function renderSkillList(filterText = '') {
  const skillListEl = document.getElementById('skillList');
  if (!skillListEl) return;

  let skills = await getVisibleSkills(true);

  const filterLower = filterText.toLowerCase();

  const filteredSkills = skills.filter(s => {
    if (!filterText) return true;
    return (s.name || '').toLowerCase().includes(filterLower) ||
           (s.description || '').toLowerCase().includes(filterLower);
  });

  if (filteredSkills.length === 0) {
    skillListEl.innerHTML = `<div class="prompt-empty">${t('promptSelector.noMatchSkill')}</div>`;
    state.selectedSkillIndex = -1;
    return;
  }

  state.selectedSkillIndex = 0;

  skillListEl.innerHTML = filteredSkills.map((skill, index) => {
    const isAgent = skill.type === 'agent';
    const badge = isAgent ? 'Agent' : 'Workflow';
    const desc = skill.description || '';
    const isDisabled = skill.enabled === false;
    const itemTitle = isDisabled
      ? `${skill.name}\n${t('skillSelector.disabledTooltip')}`
      : skill.name;
    return `
      <div class="skill-list-item ${index === 0 ? 'selected' : ''} ${isDisabled ? 'skill-list-item-disabled' : ''}" data-index="${index}" data-skill-name="${escapeHtml(skill.name)}" title="${escapeAttr(itemTitle)}">
        <span class="skill-list-item-index">${index + 1}</span>
        <span class="skill-list-item-icon">🧩</span>
        <div class="skill-list-item-info">
          <div class="skill-list-item-name">${escapeHtml(skill.name)}</div>
          ${desc ? `<div class="skill-list-item-desc" title="${escapeAttr(desc)}">${escapeHtml(desc)}</div>` : ''}
        </div>
        <span class="skill-list-item-badge">${badge}</span>
        ${isDisabled ? `<span class="skill-list-item-badge badge-disabled">${t('skillSelector.disabledBadge')}</span>` : ''}
      </div>
    `;
  }).join('');

  // 绑定点击事件
  skillListEl.querySelectorAll('.skill-list-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const skillName = item.dataset.skillName;
      selectSkill(skillName, skills);
      // Ctrl/Cmd+点击：选中后关闭下拉框（多选场景的单选快捷方式）
      if (e.ctrlKey || e.metaKey) hidePromptSelector();
    });
  });

  // 渲染后刷新已选标记（多选状态）
  refreshSkillPickedState();
}

/**
 * 更新技能列表选中状态
 */
export function updateSkillSelection(items) {
  items.forEach((item, index) => {
    if (index === state.selectedSkillIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

/**
 * 清除输入框中的 / 触发文本（保留触发符之前的内容）
 * 与 @ 选择器惯例对齐：从最后一个触发符处截断，恢复焦点与光标；
 * 无论触发符是否仍存在都无条件回焦输入框（保证可继续输入）
 */
function clearSlashTriggerText() {
  const userInput = document.getElementById('userInput');
  if (!userInput) return;
  const value = userInput.value;
  const lastSlashIndex = value.lastIndexOf('/');
  if (lastSlashIndex !== -1) {
    userInput.value = value.substring(0, lastSlashIndex);
  }
  userInput.focus();
  userInput.selectionStart = userInput.selectionEnd = userInput.value.length;
  adjustInputHeight();
}

/**
 * 选中/取消技能 - 多选（再次选择同一技能为移除），更新指示器 chips
 * 多选时保持下拉框打开，便于连续勾选；点击外部或开始输入时由既有逻辑关闭
 * @param {string} skillName - 技能名称
 * @param {Array} skills - 技能列表（用于查找完整信息）
 */
export function selectSkill(skillName, skills) {
  const skill = skills.find(s => s.name === skillName);
  if (!skill) return;

  const existsIndex = state.selectedSkills.findIndex(s => s.name === skillName);
  if (existsIndex >= 0) {
    state.selectedSkills.splice(existsIndex, 1);
  } else {
    state.selectedSkills.push({
      name: skill.name,
      description: skill.description || '',
      type: skill.type || 'agent',
      stepCount: skill.stepCount || 0,
      parameters: skill.parameters || {},
      enabled: skill.enabled !== false
    });
  }

  // 更新列表已选标记 + 指示器 chips
  refreshSkillPickedState();
  renderSkillIndicator();

  // 清除输入框中的 / 触发文本（含过滤关键字）
  clearSlashTriggerText();

  logger.debug('[SidePanel] skill toggled:', skill.name, 'count:', state.selectedSkills.length);
}

/**
 * 清除全部技能选择
 */
export function clearSkillSelection() {
  state.selectedSkills = [];
  state.selectedSkillIndex = -1;
  renderSkillIndicator();
  refreshSkillPickedState();

  logger.debug('[SidePanel] skill clearedselect');
}

/**
 * 渲染技能指示器（多技能 chips 形式，每个 chip 可单独移除）
 */
export function renderSkillIndicator() {
  const indicator = document.getElementById('skillIndicator');
  if (!indicator) return;
  if (state.selectedSkills.length === 0) {
    indicator.style.display = 'none';
    indicator.innerHTML = '';
    return;
  }
  indicator.innerHTML = state.selectedSkills.map(skill => {
    const isDisabled = skill.enabled === false;
    const label = isDisabled
      ? `${skill.name} (${t('skillSelector.manualUseSuffix')})`
      : skill.name;
    const title = isDisabled ? t('skillSelector.disabledTooltip') : skill.name;
    return `
      <span class="ref-chip skill-ref-chip${isDisabled ? ' skill-ref-chip-manual' : ''}">
        <span class="ref-chip-name" title="${escapeAttr(title)}">🧩 ${escapeHtml(label)}</span>
        <button class="ref-chip-close" data-skill-name="${escapeAttr(skill.name)}" title="${t('common.delete')}">✕</button>
      </span>
    `;
  }).join('');
  indicator.querySelectorAll('.ref-chip-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedSkills = state.selectedSkills.filter(s => s.name !== btn.dataset.skillName);
      renderSkillIndicator();
      refreshSkillPickedState();
    });
  });
  indicator.style.display = 'flex';
}

/**
 * 更新技能列表（Tab 视图与合并视图）中已选技能的标记
 */
export function refreshSkillPickedState() {
  const picked = new Set(state.selectedSkills.map(s => s.name));
  document.querySelectorAll('.skill-list-item, .merged-skill-item').forEach(item => {
    item.classList.toggle('picked', picked.has(item.dataset.skillName));
  });
}

/**
 * 初始化技能指示器关闭按钮事件
 * （指示器 chips 化后由 renderSkillIndicator 绑定各自 ✕，此处保留兼容旧 DOM 结构）
 */
export function initSkillIndicatorEvents() {
  const closeBtn = document.getElementById('skillIndicatorClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', clearSkillSelection);
  }
}

/**
 * 切换下拉框 Tab
 * @param {string} tab - 'prompts' | 'skills'
 */
export async function switchDropdownTab(tab) {
  state.activeDropdownTab = tab;
  state.lastActiveDropdownTab = tab;
  state.showMergedList = false;

  const promptList = document.getElementById('promptList');
  const skillList = document.getElementById('skillList');
  const mcpList = document.getElementById('mcpList');
  const tabsContainer = document.getElementById('promptDropdownTabs');
  const tabs = document.querySelectorAll('#promptDropdownTabs .prompt-tab');
  const headerText = document.querySelector('#promptDropdownHeader .prompt-dropdown-header-text');

  // 恢复 Tab 栏显示
  if (tabsContainer) tabsContainer.classList.remove('merged-mode');

  // 更新 Tab 激活状态
  tabs.forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  // 切换列表显示
  if (tab === 'skills') {
    if (promptList) promptList.style.display = 'none';
    if (skillList) skillList.style.display = 'block';
    if (mcpList) mcpList.style.display = 'none';
    if (headerText) headerText.textContent = t('promptSelector.switchHintSelect');
    state.selectedPromptIndex = -1;
    state.selectedMcpServiceIndex = -1;
    await renderSkillList();
  } else if (tab === 'mcp') {
    if (promptList) promptList.style.display = 'none';
    if (skillList) skillList.style.display = 'none';
    if (mcpList) mcpList.style.display = 'block';
    if (headerText) headerText.textContent = t('promptSelector.switchHintSelect');
    state.selectedPromptIndex = -1;
    state.selectedSkillIndex = -1;
    await renderMcpList();
  } else {
    if (promptList) promptList.style.display = 'block';
    if (skillList) skillList.style.display = 'none';
    if (mcpList) mcpList.style.display = 'none';
    if (headerText) headerText.textContent = t('promptSelector.switchHint');
    state.selectedSkillIndex = -1;
    state.selectedMcpServiceIndex = -1;
  }

  // 切换 header 右侧管理按钮的显示
  const promptManageBtn = document.querySelector('#promptDropdownHeader .prompt-manage-btn');
  const skillManageBtn = document.querySelector('#promptDropdownHeader .skill-manage-btn');
  const mcpManageBtn = document.querySelector('#promptDropdownHeader .mcp-manage-btn');
  if (promptManageBtn) promptManageBtn.style.display = tab === 'prompts' ? '' : 'none';
  if (skillManageBtn) skillManageBtn.style.display = tab === 'skills' ? '' : 'none';
  if (mcpManageBtn) mcpManageBtn.style.display = tab === 'mcp' ? '' : 'none';

  // 保持输入框焦点，以便键盘导航继续生效
  const userInput = document.getElementById('userInput');
  if (userInput) {
    userInput.focus();
  }
}

/**
 * 添加技能管理按钮到 header
 */
export function addSkillManageButton() {
  const header = document.getElementById('promptDropdownHeader');
  if (!header) return;

  // 检查是否已添加
  if (header.querySelector('.skill-manage-btn')) return;

  const manageBtn = document.createElement('button');
  manageBtn.className = 'skill-manage-btn';
  manageBtn.title = t('promptSelector.skillManageTitle');
  manageBtn.style.display = 'none'; // 默认隐藏，仅技能 Tab 显示
  manageBtn.style.fontSize = '13px';
  manageBtn.innerHTML = '✚';
  manageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE', hash: 'toolbox' });
  });

  header.appendChild(manageBtn);
}

/**
 * 初始化 Tab 切换事件
 */
export function initSkillTabEvents() {
  const tabsContainer = document.getElementById('promptDropdownTabs');
  if (!tabsContainer) return;

  // 添加技能管理按钮
  addSkillManageButton();
  // 添加 MCP 管理按钮
  addMcpManageButton();

  tabsContainer.addEventListener('click', (e) => {
    const tab = e.target.closest('.prompt-tab');
    if (!tab) return;
    const tabName = tab.dataset.tab;
    if (tabName === state.activeDropdownTab) return;
    switchDropdownTab(tabName);
  });
}

/**
 * 获取当前选中技能的系统提示文本（用于注入到用户消息中，支持多技能）
 * Agent Skill：直接加载完整 SKILL.md 内容拼接到用户消息，避免模型再走一次工具加载。
 * 这样解决了截图问答等场景下图片消息在工具调用期间被清除导致无法处理的问题。
 * Workflow Skill：仍通过 agent_skill (action=run) 执行（需要按步骤编排，无法直接注入）。
 * 多技能时各段以空行连接（顺序与选择顺序一致）。
 * @returns {Promise<string>}
 */
export async function getSkillContextText() {
  if (state.selectedSkills.length === 0) return '';

  const parts = [];
  for (const skill of state.selectedSkills) {
    const isAgent = skill.type === 'agent';

    let text = t('skillSelector.selectedSkillStart', { name: skill.name });
    if (skill.description) {
      text += ` - ${skill.description}`;
    }
    text += `]\n`;

    if (isAgent) {
      // Agent Skill：直接加载完整说明并拼接到用户消息，避免模型再走一次工具加载
      try {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_AGENT_SKILL_PROMPT', name: skill.name }, (resp) => {
            if (chrome.runtime.lastError || !resp?.success) {
              resolve(null);
              return;
            }
            resolve(resp);
          });
        });
        if (response && response.prompt) {
          text += `${response.prompt}\n\n${t('skillSelector.useSkillToolsHint')}`;
        } else {
          // 降级：加载失败时仍提示使用工具加载
          text += t('skillSelector.loadSkillHint', { name: skill.name });
        }
      } catch {
        // 降级：加载失败时仍提示使用工具加载
        text += t('skillSelector.loadSkillHint', { name: skill.name });
      }
    } else {
      // Workflow Skill：提示 AI 使用 agent_skill (action=run) 执行，并附上参数定义
      text += t('skillSelector.runSkillHint', { name: skill.name });
      const params = skill.parameters;
      if (params && params.properties && Object.keys(params.properties).length > 0) {
        const required = params.required || [];
        const paramList = Object.entries(params.properties)
          .map(([key, def]) => t('skillSelector.paramItem', {
            flag: required.includes(key) ? t('skillSelector.requiredParam') : t('skillSelector.optionalParam'),
            type: def.type || 'string',
            desc: def.description || '',
          }))
          .join(t('skillSelector.paramJoin'));
        text += t('skillSelector.callParamsPrefix') + paramList;
      }
      text += t('skillSelector.sentenceEnd');
    }
    parts.push(text);
  }
  return parts.join('\n\n');
}

// ============================================================
// MCP 服务选择器
// ============================================================

/**
 * 判断 MCP Tab 是否应该显示
 * 条件：Agent 已连接 且 MCP 全局开关开启 且存在已注册的 MCP 服务
 * @returns {Promise<boolean>}
 */
export async function shouldShowMcpTab() {
  if (!state.agentPlatform?.connected) {
    return false;
  }

  const mcpEnabled = await new Promise((resolve) => {
    chrome.storage.local.get(['mcpEnabled'], (result) => resolve(result.mcpEnabled));
  });
  if (!mcpEnabled) {
    return false;
  }

  // 与 MCP 列表口径一致：没有已注册的 MCP 服务则不显示 Tab
  const services = await getMcpServices();
  return services.length > 0;
}

/**
 * 从 chrome.storage 获取全部 MCP 服务列表（按 serverId 分组）
 * 全量化：列出所有已注册服务（不受关闭列表/当前助手排除限制）——
 * 未开放的服务仍可被选中，选中即随本次请求强制下发（forcedMcpServerIds）。
 * 开放的服务排前面，未开放的排后面并附「未开放」角标。
 * @returns {Promise<Array<{serverId, serverName, toolCount, effectiveOpen}>>}
 */
export async function getMcpServices() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['mcpTools'], (result) => {
      const tools = result.mcpTools || [];
      const closedSet = new Set(Array.isArray(state.mcpClosedServers) ? state.mcpClosedServers : []);
      const excludedSet = new Set(Array.isArray(state.activeAgentMcpExcludedServerIds) ? state.activeAgentMcpExcludedServerIds : []);

      const serverMap = new Map();
      tools.forEach(t => {
        const sid = t.serverId || 'unknown';
        if (!serverMap.has(sid)) {
          serverMap.set(sid, {
            serverId: sid,
            serverName: t.serverName || sid,
            toolCount: 0,
            effectiveOpen: !closedSet.has(sid) && !excludedSet.has(sid)
          });
        }
        serverMap.get(sid).toolCount++;
      });
      const services = Array.from(serverMap.values());
      // 未开放的服务排后面并附角标；组内保持原有顺序
      resolve([...services.filter(s => s.effectiveOpen), ...services.filter(s => !s.effectiveOpen)]);
    });
  });
}

/**
 * 渲染 MCP 服务列表
 * @param {string} filterText - 过滤文本
 */
export async function renderMcpList(filterText = '') {
  const mcpListEl = document.getElementById('mcpList');
  if (!mcpListEl) return;

  const services = await getMcpServices();
  const filterLower = filterText.toLowerCase();

  const filteredServices = services.filter(s => {
    if (!filterText) return true;
    return (s.serverName || '').toLowerCase().includes(filterLower) ||
           (s.serverId || '').toLowerCase().includes(filterLower);
  });

  if (filteredServices.length === 0) {
    mcpListEl.innerHTML = `<div class="prompt-empty">${t('promptSelector.noMatchMcp')}</div>`;
    state.selectedMcpServiceIndex = -1;
    return;
  }

  state.selectedMcpServiceIndex = 0;

  mcpListEl.innerHTML = filteredServices.map((svc, index) => {
    const inactive = svc.effectiveOpen === false;
    const itemTitle = inactive ? `${svc.serverName}\n${t('skillSelector.mcpInactiveTooltip')}` : svc.serverName;
    return `
    <div class="mcp-list-item ${index === 0 ? 'selected' : ''} ${inactive ? 'mcp-list-item-inactive' : ''}" data-index="${index}" data-server-id="${escapeHtml(svc.serverId)}" data-server-name="${escapeHtml(svc.serverName)}" title="${escapeAttr(itemTitle)}">
      <span class="mcp-list-item-index">${index + 1}</span>
      <span class="mcp-list-item-icon">🔌</span>
      <div class="mcp-list-item-info">
        <div class="mcp-list-item-name">${escapeHtml(svc.serverName)}</div>
        <div class="mcp-list-item-desc">${escapeHtml(svc.serverId)}</div>
      </div>
      ${inactive ? `<span class="mcp-list-item-badge mcp-badge-inactive">${t('skillSelector.mcpInactiveBadge')}</span>` : ''}
      <span class="mcp-list-item-badge">${t('promptSelector.toolCount', { count: svc.toolCount })}</span>
    </div>
  `;
  }).join('');

  // 绑定点击事件
  mcpListEl.querySelectorAll('.mcp-list-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const serverId = item.dataset.serverId;
      const serverName = item.dataset.serverName;
      selectMcpService(serverId, serverName, services);
      // Ctrl/Cmd+点击：选中后关闭下拉框（多选场景的单选快捷方式）
      if (e.ctrlKey || e.metaKey) hidePromptSelector();
    });
  });

  // 渲染后刷新已选标记（多选状态）
  refreshMcpPickedState();
}

/**
 * 更新 MCP 列表选中状态
 */
export function updateMcpSelection(items) {
  items.forEach((item, index) => {
    if (index === state.selectedMcpServiceIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

/**
 * 选中/取消 MCP 服务 - 多选（再次选择同一服务为移除），更新指示器 chips
 * 多选时保持下拉框打开，便于连续勾选；点击外部或开始输入时由既有逻辑关闭
 */
export function selectMcpService(serverId, serverName, services) {
  const svc = services?.find(s => s.serverId === serverId);
  const toolCount = svc?.toolCount || 0;
  const name = serverName || serverId;

  const existsIndex = state.selectedMcpServices.findIndex(s => s.serverName === name);
  if (existsIndex >= 0) {
    state.selectedMcpServices.splice(existsIndex, 1);
  } else {
    state.selectedMcpServices.push({
      serverId,
      serverName: name,
      toolCount
    });
  }

  // 更新列表已选标记 + 指示器 chips
  refreshMcpPickedState();
  renderMcpIndicator();

  // 清除输入框中的 / 触发文本（含过滤关键字）
  clearSlashTriggerText();

  logger.debug('[SidePanel] MCP service toggled:', name, 'count:', state.selectedMcpServices.length);
}

/**
 * 清除全部 MCP 服务选择
 */
export function clearMcpService() {
  state.selectedMcpServices = [];
  state.selectedMcpServiceIndex = -1;
  renderMcpIndicator();
  refreshMcpPickedState();

  logger.debug('[SidePanel] cleared MCP serviceselect');
}

/**
 * 获取 MCP 服务上下文文本（注入到用户消息中，支持多服务连续注入）
 * @returns {string}
 */
export function getMcpContextText() {
  if (state.selectedMcpServices.length === 0) return '';

  // 多服务各注入一段（段间空行），逐服务提示模型使用对应 MCP 服务
  return state.selectedMcpServices
    .map(svc => t('skillSelector.selectedMcpContext', { name: svc.serverName }))
    .join('\n');
}

/**
 * 渲染 MCP 服务指示器（多服务 chips 形式，每个 chip 可单独移除）
 */
export function renderMcpIndicator() {
  const indicator = document.getElementById('mcpIndicator');
  if (!indicator) return;
  if (state.selectedMcpServices.length === 0) {
    indicator.style.display = 'none';
    indicator.innerHTML = '';
    return;
  }
  indicator.innerHTML = state.selectedMcpServices.map(svc => `
    <span class="ref-chip mcp-ref-chip">
      <span class="ref-chip-name" title="${escapeAttr(svc.serverName)}">🔌 ${escapeHtml(svc.serverName)}</span>
      <button class="ref-chip-close" data-server-name="${escapeAttr(svc.serverName)}" title="${t('common.delete')}">✕</button>
    </span>
  `).join('');
  indicator.querySelectorAll('.ref-chip-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedMcpServices = state.selectedMcpServices.filter(s => s.serverName !== btn.dataset.serverName);
      renderMcpIndicator();
      refreshMcpPickedState();
    });
  });
  indicator.style.display = 'flex';
}

/**
 * 更新 MCP 列表（Tab 视图与合并视图）中已选服务的标记
 */
export function refreshMcpPickedState() {
  const picked = new Set(state.selectedMcpServices.map(s => s.serverName));
  document.querySelectorAll('.mcp-list-item, .merged-mcp-item').forEach(item => {
    item.classList.toggle('picked', picked.has(item.dataset.serverName));
  });
}

/**
 * 初始化 MCP 指示器关闭按钮事件
 * （指示器 chips 化后由 renderMcpIndicator 绑定各自 ✕，此处保留兼容旧 DOM 结构）
 */
export function initMcpIndicatorEvents() {
  const closeBtn = document.getElementById('mcpIndicatorClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', clearMcpService);
  }
}

/**
 * 添加 MCP 管理按钮到 header
 */
export function addMcpManageButton() {
  const header = document.getElementById('promptDropdownHeader');
  if (!header) return;

  if (header.querySelector('.mcp-manage-btn')) return;

  const manageBtn = document.createElement('button');
  manageBtn.className = 'mcp-manage-btn';
  manageBtn.title = t('promptSelector.mcpManageTitle');
  manageBtn.style.display = 'none';
  manageBtn.style.fontSize = '13px';
  manageBtn.innerHTML = '✚';
  manageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE', hash: 'toolbox' });
  });

  header.appendChild(manageBtn);
}