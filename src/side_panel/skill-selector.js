// side_panel/skill-selector.js - 技能选择器（提示词下拉框中的技能 Tab）
import state from './state.js';
import { escapeHtml } from './utils.js';

// 技能列表缓存
let skillListCache = [];
let skillListCacheTime = 0;
const CACHE_TTL = 30000; // 30 秒缓存

/**
 * 从后台获取技能列表
 * @returns {Promise<Array>}
 */
async function fetchSkillList() {
  const now = Date.now();
  if (skillListCache.length > 0 && (now - skillListCacheTime) < CACHE_TTL) {
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
  return new Promise((resolve) => {
    chrome.storage.local.get(['skillsEnabled'], (result) => {
      resolve(result.skillsEnabled !== false);
    });
  });
}

/**
 * 获取已启用的技能列表（过滤掉停用的）
 * @returns {Promise<Array>}
 */
export async function getEnabledSkills() {
  const allSkills = await fetchSkillList();
  return allSkills.filter(s => s.enabled !== false);
}

/**
 * 渲染技能列表
 * @param {string} filterText - 过滤文本
 */
export async function renderSkillList(filterText = '') {
  const skillListEl = document.getElementById('skillList');
  if (!skillListEl) return;

  const skills = await getEnabledSkills();
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
    const icon = isAgent ? '🤖' : '⚙️';
    const badge = isAgent ? '代理' : 'Workflow';
    const desc = skill.description || '';
    return `
      <div class="skill-list-item ${index === 0 ? 'selected' : ''}" data-index="${index}" data-skill-name="${escapeHtml(skill.name)}">
        <span class="skill-list-item-icon">${icon}</span>
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

  console.log('[SidePanel] 已选中技能:', skill.name);
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

  console.log('[SidePanel] 已清除技能选择');
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
  state.showMergedList = false;

  const promptList = document.getElementById('promptList');
  const skillList = document.getElementById('skillList');
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
    if (headerText) headerText.textContent = '方向键切换 · Enter选中技能 · Esc取消';
    state.selectedPromptIndex = -1;
    await renderSkillList();
  } else {
    if (promptList) promptList.style.display = 'block';
    if (skillList) skillList.style.display = 'none';
    if (headerText) headerText.textContent = '方向键切换 · Enter发送 · Ctrl+Enter带入文本框';
    state.selectedSkillIndex = -1;
  }

  // 切换 header 右侧管理按钮的显示
  const promptManageBtn = document.querySelector('#promptDropdownHeader .prompt-manage-btn');
  const skillManageBtn = document.querySelector('#promptDropdownHeader .skill-manage-btn');
  if (promptManageBtn) promptManageBtn.style.display = tab === 'prompts' ? '' : 'none';
  if (skillManageBtn) skillManageBtn.style.display = tab === 'skills' ? '' : 'none';

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
  manageBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
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
  let text = `[已选技能: ${skill.name}`;
  if (skill.description) {
    text += ` - ${skill.description}`;
  }
  text += `]\n请使用「${skill.name}」技能来处理以下问题：\n`;
  return text;
}