// side_panel/skill-selector.js - 技能选择器（提示词下拉框中的技能 Tab）
import state from './state.js';
import { escapeHtml } from './utils.js';
import logger from '../shared/logger.js';

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

  // 检查是否有已启用的技能（没有启用技能时隐藏 Tab）
  try {
    const enabledSkills = await getEnabledSkills();
    return enabledSkills.length > 0;
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
 * 渲染技能列表
 * @param {string} filterText - 过滤文本
 */
export async function renderSkillList(filterText = '') {
  const skillListEl = document.getElementById('skillList');
  if (!skillListEl) return;

  const skills = await getEnabledSkills(true);
  const filterLower = filterText.toLowerCase();

  const filteredSkills = skills.filter(s => {
    if (!filterText) return true;
    return (s.name || '').toLowerCase().includes(filterLower) ||
           (s.description || '').toLowerCase().includes(filterLower);
  });

  if (filteredSkills.length === 0) {
    skillListEl.innerHTML = '<div class="prompt-empty">暂无匹配的技能</div>';
    state.selectedSkillIndex = -1;
    return;
  }

  state.selectedSkillIndex = 0;

  skillListEl.innerHTML = filteredSkills.map((skill, index) => {
    const isAgent = skill.type === 'agent';
    const badge = isAgent ? 'Agent' : 'Workflow';
    const desc = skill.description || '';
    return `
      <div class="skill-list-item ${index === 0 ? 'selected' : ''}" data-index="${index}" data-skill-name="${escapeHtml(skill.name)}">
        <span class="skill-list-item-index">${index + 1}</span>
        <span class="skill-list-item-icon">🧩</span>
        <div class="skill-list-item-info">
          <div class="skill-list-item-name">${escapeHtml(skill.name)}</div>
          ${desc ? `<div class="skill-list-item-desc">${escapeHtml(desc)}</div>` : ''}
        </div>
        <span class="skill-list-item-badge">${badge}</span>
      </div>
    `;
  }).join('');

  // 绑定点击事件
  skillListEl.querySelectorAll('.skill-list-item').forEach(item => {
    item.addEventListener('click', () => {
      const skillName = item.dataset.skillName;
      selectSkill(skillName, skills);
    });
  });
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
 * 选中技能 - 显示技能指示器
 * @param {string} skillName - 技能名称
 * @param {Array} skills - 技能列表（用于查找完整信息）
 */
export function selectSkill(skillName, skills) {
  const skill = skills.find(s => s.name === skillName);
  if (!skill) return;

  state.selectedSkill = {
    name: skill.name,
    description: skill.description || '',
    type: skill.type || 'agent'
  };

  // 显示技能指示器
  const indicator = document.getElementById('skillIndicator');
  const nameEl = document.getElementById('skillIndicatorName');
  if (indicator && nameEl) {
    nameEl.textContent = skill.name;
    indicator.style.display = 'flex';
  }

  // 隐藏下拉框（直接操作 DOM，避免循环依赖）
  const promptSelector = document.getElementById('promptSelector');
  const promptDropdown = document.getElementById('promptDropdown');
  if (promptSelector) promptSelector.style.display = 'none';
  if (promptDropdown) promptDropdown.classList.remove('show');

  logger.debug('[SidePanel] 已选中技能:', skill.name);
}

/**
 * 清除技能选择
 */
export function clearSkillSelection() {
  state.selectedSkill = null;
  state.selectedSkillIndex = -1;

  const indicator = document.getElementById('skillIndicator');
  if (indicator) {
    indicator.style.display = 'none';
  }

  logger.debug('[SidePanel] 已清除技能选择');
}

/**
 * 初始化技能指示器关闭按钮事件
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
  if (tabsContainer) tabsContainer.style.display = '';

  // 更新 Tab 激活状态
  tabs.forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  // 切换列表显示
  if (tab === 'skills') {
    if (promptList) promptList.style.display = 'none';
    if (skillList) skillList.style.display = 'block';
    if (mcpList) mcpList.style.display = 'none';
    if (headerText) headerText.textContent = '方向键切换 · Enter选中技能 · Esc取消';
    state.selectedPromptIndex = -1;
    state.selectedMcpServiceIndex = -1;
    await renderSkillList();
  } else if (tab === 'mcp') {
    if (promptList) promptList.style.display = 'none';
    if (skillList) skillList.style.display = 'none';
    if (mcpList) mcpList.style.display = 'block';
    if (headerText) headerText.textContent = '方向键切换 · Enter选中MCP服务 · Esc取消';
    state.selectedPromptIndex = -1;
    state.selectedSkillIndex = -1;
    await renderMcpList();
  } else {
    if (promptList) promptList.style.display = 'block';
    if (skillList) skillList.style.display = 'none';
    if (mcpList) mcpList.style.display = 'none';
    if (headerText) headerText.textContent = '方向键切换 · Enter发送 · Ctrl+Enter带入文本框';
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
  manageBtn.title = '技能管理';
  manageBtn.style.display = 'none'; // 默认隐藏，仅技能 Tab 显示
  manageBtn.style.fontSize = '14px';
  manageBtn.innerHTML = '🧩';
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
 * 获取当前选中技能的系统提示文本（用于注入到用户消息中）
 * @returns {string}
 */
export function getSkillContextText() {
  if (!state.selectedSkill) return '';

  const skill = state.selectedSkill;
  const isAgent = skill.type === 'agent';

  let text = `[已选技能: ${skill.name}`;
  if (skill.description) {
    text += ` - ${skill.description}`;
  }
  text += `]\n`;

  if (isAgent) {
    // Agent Skill：提示 AI 使用 agent_skill_load 加载，不要用 agent_skill_run
    text += `请使用 \`agent_skill_load\` 加载「${skill.name}」的完整说明，然后根据说明自主调用相关工具处理以下问题。注意：这是一个 Agent Skill，不要使用 agent_skill_run。\n`;
  } else {
    // Workflow Skill：提示 AI 使用 agent_skill_run 执行
    text += `请使用 \`agent_skill_run\` 执行「${skill.name}」技能来处理以下问题：\n`;
  }
  return text;
}

// ============================================================
// MCP 服务选择器
// ============================================================

/**
 * 判断 MCP Tab 是否应该显示
 * 条件：Agent 已连接 且 MCP 全局开关开启 且有 MCP 服务可用
 * @returns {Promise<boolean>}
 */
export async function shouldShowMcpTab() {
  if (!state.agentPlatform?.connected) {
    return false;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(['mcpEnabled', 'mcpTools'], (result) => {
      if (!result.mcpEnabled) {
        resolve(false);
        return;
      }
      const tools = result.mcpTools || [];
      resolve(tools.length > 0);
    });
  });
}

/**
 * 从 chrome.storage 获取 MCP 服务列表（按 serverId 分组）
 * @returns {Promise<Array<{serverId, serverName, toolCount}>>}
 */
export async function getMcpServices() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['mcpTools'], (result) => {
      const tools = result.mcpTools || [];
      const serverMap = new Map();
      tools.forEach(t => {
        const sid = t.serverId || 'unknown';
        if (!serverMap.has(sid)) {
          serverMap.set(sid, {
            serverId: sid,
            serverName: t.serverName || sid,
            toolCount: 0
          });
        }
        serverMap.get(sid).toolCount++;
      });
      resolve(Array.from(serverMap.values()));
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
    mcpListEl.innerHTML = '<div class="prompt-empty">暂无MCP服务</div>';
    state.selectedMcpServiceIndex = -1;
    return;
  }

  state.selectedMcpServiceIndex = 0;

  mcpListEl.innerHTML = filteredServices.map((svc, index) => `
    <div class="mcp-list-item ${index === 0 ? 'selected' : ''}" data-index="${index}" data-server-id="${escapeHtml(svc.serverId)}" data-server-name="${escapeHtml(svc.serverName)}">
      <span class="mcp-list-item-index">${index + 1}</span>
      <span class="mcp-list-item-icon">🔌</span>
      <div class="mcp-list-item-info">
        <div class="mcp-list-item-name">${escapeHtml(svc.serverName)}</div>
        <div class="mcp-list-item-desc">${escapeHtml(svc.serverId)}</div>
      </div>
      <span class="mcp-list-item-badge">${svc.toolCount}个工具</span>
    </div>
  `).join('');

  // 绑定点击事件
  mcpListEl.querySelectorAll('.mcp-list-item').forEach(item => {
    item.addEventListener('click', () => {
      const serverId = item.dataset.serverId;
      const serverName = item.dataset.serverName;
      selectMcpService(serverId, serverName, services);
    });
  });
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
 * 选中 MCP 服务 - 显示 MCP 指示器
 */
export function selectMcpService(serverId, serverName, services) {
  const svc = services?.find(s => s.serverId === serverId);
  const toolCount = svc?.toolCount || 0;

  state.selectedMcpService = {
    serverId,
    serverName: serverName || serverId,
    toolCount
  };

  // 显示 MCP 指示器
  const indicator = document.getElementById('mcpIndicator');
  const nameEl = document.getElementById('mcpIndicatorName');
  if (indicator && nameEl) {
    nameEl.textContent = serverName || serverId;
    indicator.style.display = 'flex';
  }

  // 隐藏下拉框
  const promptSelector = document.getElementById('promptSelector');
  const promptDropdown = document.getElementById('promptDropdown');
  if (promptSelector) promptSelector.style.display = 'none';
  if (promptDropdown) promptDropdown.classList.remove('show');

  logger.debug('[SidePanel] 已选中 MCP 服务:', serverName);
}

/**
 * 清除 MCP 服务选择
 */
export function clearMcpService() {
  state.selectedMcpService = null;
  state.selectedMcpServiceIndex = -1;

  const indicator = document.getElementById('mcpIndicator');
  if (indicator) {
    indicator.style.display = 'none';
  }

  logger.debug('[SidePanel] 已清除 MCP 服务选择');
}

/**
 * 获取 MCP 服务上下文文本（注入到用户消息中）
 * @returns {string}
 */
export function getMcpContextText() {
  if (!state.selectedMcpService) return '';

  const svc = state.selectedMcpService;
  return `[已选MCP服务: ${svc.serverName}]\n请使用「${svc.serverName}」MCP服务来处理以下问题：\n`;
}

/**
 * 初始化 MCP 指示器关闭按钮事件
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
  manageBtn.title = 'MCP管理';
  manageBtn.style.display = 'none';
  manageBtn.style.fontSize = '14px';
  manageBtn.innerHTML = '🔌';
  manageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE', hash: 'toolbox' });
  });

  header.appendChild(manageBtn);
}