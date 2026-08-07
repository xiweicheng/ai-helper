// side_panel/agent-manager.js - Agent 管理 UI
import state from './state.js';
import { getAllAgents, createAgent, updateAgent, deleteAgent, getAgent, setActiveAgentId, getActiveAgentId, createAgentFromTemplate } from './agent-store.js';
import { AGENT_TEMPLATES } from '../shared/agent-defaults.js';
import { BUILTIN_TOOLS } from './constants.js';
import { PRESET_MODES } from './constants.js';
import { showToast } from './utils.js';
import { saveCurrentSession } from './session-manager.js';
import { renderToolsPopupList, updateCategoryBadges, updateToolsPopupTitle, updateToolsToggleState, getToolDesc } from './tool-panel.js';
import { getEnabledSkills } from './skill-selector.js';
import logger from '../shared/logger.js';
import { t, registerTranslations, getLanguage } from '../shared/i18n.js';

registerTranslations('zh', {
  agentMgr: {
    allTools: '全部',
    defaultAgentName: '默认助手',
    defaultAgentDesc: '全能 AI 助手，拥有所有工具能力',
    switchedTo: '已切换到：{name}',
    editAgent: '编辑助手',
    templateLoaded: '已加载模板：{name}',
    noSkillsHint: '暂无启用技能（请先确认 Agent 已连接且技能开关已开启）',
    nameRequired: '请输入助手名称',
    agentUpdated: '助手已更新',
    agentCreated: '助手 "{name}" 已创建',
    saveFailed: '保存失败：{message}',
    confirmDeleteAgentMessage: '确定要删除助手 "{name}" 吗？\n正在使用该助手的会话将恢复为默认助手。',
    deleteAgentTitle: '删除助手',
    agentDeleted: '助手已删除',
    deleteFailed: '删除失败：{message}',
    cannotDeleteDefault: '默认助手不支持删除',
    emojiCatFaceExpressions: '人物表情',
    emojiCatHandGestures: '手势动作',
    emojiCatProfessionalRoles: '职业角色',
    emojiCatAiTech: 'AI & 科技',
    emojiCatToolObjects: '工具物品',
    emojiCatDocData: '文档数据',
    emojiCatStatusMarks: '状态标记',
    emojiCatTransportTravel: '交通出行',
    emojiCatNatureWeather: '自然天气',
    emojiCatSymbolSigns: '符号标志',
    confirm: '确认',
  },
  agentTemplates: {
    codeReviewName: '代码审查专家',
    codeReviewDesc: '专注于代码审查和质量保证',
    webAutomationName: '网页自动化助手',
    webAutomationDesc: '专注于网页交互和自动化',
    dataAnalystName: '数据分析师',
    dataAnalystDesc: '专注于数据提取、分析和可视化',
    documentationName: '文档助手',
    documentationDesc: '专注于技术文档和内容整理',
  },
});

registerTranslations('en', {
  agentMgr: {
    allTools: 'All',
    defaultAgentName: 'Default Assistant',
    defaultAgentDesc: 'All-purpose AI assistant with all tool capabilities',
    switchedTo: 'Switched to: {name}',
    editAgent: 'Edit assistant',
    templateLoaded: 'Template loaded: {name}',
    noSkillsHint: 'No enabled skills (please confirm Agent is connected and skill switch is on)',
    nameRequired: 'Please enter assistant name',
    agentUpdated: 'Assistant updated',
    agentCreated: 'Assistant "{name}" created',
    saveFailed: 'Save failed: {message}',
    confirmDeleteAgentMessage: 'Are you sure you want to delete assistant "{name}"?\nSessions using this assistant will revert to the default assistant.',
    deleteAgentTitle: 'Delete assistant',
    agentDeleted: 'Assistant deleted',
    deleteFailed: 'Delete failed: {message}',
    cannotDeleteDefault: 'Default assistant cannot be deleted',
    emojiCatFaceExpressions: 'Face expressions',
    emojiCatHandGestures: 'Hand gestures',
    emojiCatProfessionalRoles: 'Professional roles',
    emojiCatAiTech: 'AI & Tech',
    emojiCatToolObjects: 'Tool objects',
    emojiCatDocData: 'Document & data',
    emojiCatStatusMarks: 'Status marks',
    emojiCatTransportTravel: 'Transport & travel',
    emojiCatNatureWeather: 'Nature & weather',
    emojiCatSymbolSigns: 'Symbols & signs',
    confirm: 'Confirm',
  },
  agentTemplates: {
    codeReviewName: 'Code Review Expert',
    codeReviewDesc: 'Focused on code review and quality assurance',
    webAutomationName: 'Web Automation Assistant',
    webAutomationDesc: 'Focused on web interaction and automation',
    dataAnalystName: 'Data Analyst',
    dataAnalystDesc: 'Focused on data extraction, analysis, and visualization',
    documentationName: 'Documentation Assistant',
    documentationDesc: 'Focused on technical documentation and content organization',
  },
});

/**
 * 初始化 Agent 管理
 */
export async function initAgentManager() {
  await loadAgentState();
  await renderAgentSelector();
  initAgentSelectorEvents();
  initAgentModalEvents();
  logger.debug('[AgentMgr] Agent managerinitialization complete, activeAgentId:', state.activeAgentId);
}

/**
 * 加载 Agent 状态
 */
async function loadAgentState() {
  const [activeId, allAgents] = await Promise.all([
    getActiveAgentId(),
    getAllAgents(),
  ]);
  // 如果会话已加载了 agentId，以会话绑定的为准，不覆盖
  if (!state.activeSessionId) {
    state.activeAgentId = activeId;
  }
  state.customAgents = allAgents.filter(a => !a.isBuiltin);
  // 初始化当前智能体的工具限定列表
  const currentAgentId = state.activeAgentId || activeId;
  const activeAgent = allAgents.find(a => a.id === currentAgentId || (!currentAgentId && a.id === 'default'));
  state.activeAgentToolIds = activeAgent ? activeAgent.toolIds : null;
  logger.debug('[AgentMgr] Agent state loaded, activeAgentId:', state.activeAgentId, 'total:', allAgents.length, 'toolIds:', state.activeAgentToolIds);
}

/**
 * 渲染 Agent 选择器
 */
export async function renderAgentSelector() {
  const listContainer = document.getElementById('agentListItems');
  const footerContainer = document.getElementById('agentDropdownFooter');
  if (!listContainer) return;

  const allAgents = await getAllAgents();
  const activeId = state.activeAgentId;

  let html = '';
  for (const agent of allAgents) {
    const isActive = agent.id === activeId || (!activeId && agent.id === 'default');
    const toolCount = agent.toolIds ? agent.toolIds.length : t('agentMgr.allTools');
    // 对内置默认 Agent 使用翻译后的名称和描述
    const displayName = agent.id === 'default' ? t('agentMgr.defaultAgentName') : agent.name;
    const displayDesc = agent.id === 'default' ? t('agentMgr.defaultAgentDesc') : (agent.description || t('agentConfig.toolCount', { count: toolCount }));
    html += `
      <div class="agent-item ${isActive ? 'active' : ''} ${!agent.isBuiltin ? 'is-editable' : ''}" data-agent-id="${escapeAttr(agent.id)}">
        <span class="agent-item-icon">${escapeHtml(agent.icon)}</span>
        <div class="agent-item-info">
          <span class="agent-item-name">${escapeHtml(displayName)}</span>
          <span class="agent-item-desc" title="${escapeAttr(displayDesc)}">${escapeHtml(displayDesc)}</span>
        </div>
        <div class="agent-item-actions">
          ${!agent.isBuiltin ? `<button class="agent-item-edit" data-action="edit" data-agent-id="${escapeAttr(agent.id)}" title="${escapeAttr(t('common.edit'))}">✎</button>` : ''}
          ${!agent.isBuiltin ? `<button class="agent-item-delete" data-action="delete" data-agent-id="${escapeAttr(agent.id)}" title="${escapeAttr(t('common.delete'))}">✕</button>` : ''}
          ${isActive ? '<span class="agent-item-check">✓</span>' : ''}
        </div>
      </div>`;
  }

  listContainer.innerHTML = html;

  // 固定底部：创建按钮
  if (footerContainer) {
    footerContainer.innerHTML = `
      <div class="agent-item" id="agentAddBtn" style="color:#667eea;">
        <span class="agent-item-icon" style="color:#667eea;">＋</span>
        <span class="agent-item-name">${t('agentEditor.createNew')}</span>
      </div>`;
  }

  updateAgentSelectorButton(allAgents, activeId);
}

/**
 * 更新 Agent 选择器按钮显示
 */
function updateAgentSelectorButton(allAgents, activeId) {
  const btn = document.getElementById('agentSelectorBtn');
  const text = document.getElementById('agentSelectorText');
  const emoji = document.getElementById('agentSelectorEmoji');
  if (!btn || !text) return;

  const activeAgent = allAgents.find(a => a.id === activeId) 
    || allAgents.find(a => a.id === 'default');
  
  if (activeAgent) {
    // 内置默认 Agent 使用翻译后的名称
    const displayName = activeAgent.id === 'default' ? t('agentMgr.defaultAgentName') : activeAgent.name;
    text.textContent = `${activeAgent.icon} ${displayName}`;
    if (emoji) emoji.textContent = activeAgent.icon;
    btn.title = `${t('header.switchAgent')}: ${activeAgent.icon} ${displayName}`;
  } else {
    text.textContent = t('header.defaultAssistant');
    if (emoji) emoji.textContent = '🤖';
    btn.title = t('header.switchAgent');
  }
}

/**
 * 动态定位下拉框：水平居中于按钮上方，clamp 在面板边界内
 */
function positionDropdown() {
  const btn = document.getElementById('agentSelectorBtn');
  const dropdown = document.getElementById('agentSelectorDropdown');
  if (!btn || !dropdown) return;

  const btnRect = btn.getBoundingClientRect();
  const dropdownRect = dropdown.getBoundingClientRect();
  const wrapperRect = document.getElementById('agentSelectorWrapper').getBoundingClientRect();
  const panelWidth = document.body.clientWidth;

  // 按钮中心相对于视口
  const btnCenter = btnRect.left + btnRect.width / 2;

  // 理想位置：下拉框中心对齐按钮中心
  let idealLeft = btnCenter - dropdownRect.width / 2;

  // clamp 在面板边界内（左右各留 8px 边距）
  const minLeft = 8;
  const maxLeft = panelWidth - dropdownRect.width - 8;

  // 如果面板宽度不够放下下拉框，限制最大宽度
  if (maxLeft < minLeft) {
    dropdown.style.maxWidth = (panelWidth - 16) + 'px';
    // 重新测量
    const newRect = dropdown.getBoundingClientRect();
    idealLeft = btnCenter - newRect.width / 2;
    const newMaxLeft = panelWidth - newRect.width - 8;
    idealLeft = Math.max(minLeft, Math.min(newMaxLeft, idealLeft));
  } else {
    dropdown.style.maxWidth = '';
    idealLeft = Math.max(minLeft, Math.min(maxLeft, idealLeft));
  }

  dropdown.style.left = (idealLeft - wrapperRect.left) + 'px';
}

/**
 * 初始化 Agent 选择器事件
 */
function initAgentSelectorEvents() {
  const btn = document.getElementById('agentSelectorBtn');
  const dropdown = document.getElementById('agentSelectorDropdown');

  if (!btn || !dropdown) return;

  // 点击按钮切换下拉
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.style.display === 'flex';
    if (isOpen) {
      dropdown.style.display = 'none';
    } else {
      // 打开前先渲染，展示后再动态定位
      renderAgentSelector();
      dropdown.style.display = 'flex';
      positionDropdown();
    }
  });

  // 点击外部关闭
  document.addEventListener('click', () => {
    dropdown.style.display = 'none';
  });

  // 选择 Agent
  dropdown.addEventListener('click', async (e) => {
    const item = e.target.closest('.agent-item');
    if (!item) return;

    const action = e.target.closest('[data-action]');
    if (action && action.dataset.action === 'edit') {
      e.stopPropagation();
      const agentId = action.dataset.agentId;
      openAgentEditor(agentId);
      return;
    }
    if (action && action.dataset.action === 'delete') {
      e.stopPropagation();
      await deleteAgentWithConfirm(action.dataset.agentId);
      return;
    }

    if (item.id === 'agentAddBtn') {
      openAgentEditor(null);
      return;
    }

    const agentId = item.dataset.agentId;
    if (agentId) {
      await switchAgent(agentId);
      dropdown.style.display = 'none';
    }
  });
}

/**
 * 切换 Agent
 */
export async function switchAgent(agentId) {
  const agent = agentId ? await getAgent(agentId) : null;
  state.activeAgentId = agentId;
  state.activeAgentToolIds = agent ? agent.toolIds : null;
  await setActiveAgentId(agentId);
  // 立即保存当前会话，确保刷新后数据不丢失
  saveCurrentSession().catch(() => {});

  // 加载 Agent 绑定的模型和温度
  // 自定义助手：仅更新 state，不写入 chrome.storage.local 全局键，避免覆盖默认助手全局值
  if (agent && !agent.isBuiltin) {
    if (agent.model) {
      state.currentModel = agent.model;
    }
    if (agent.temperature !== null && agent.temperature !== undefined) {
      state.temperature = agent.temperature;
      state.topP = agent.topP !== null && agent.topP !== undefined ? agent.topP : 1.0;
    }
    // 触发 UI 更新事件
    document.dispatchEvent(new CustomEvent('agent-model-changed'));
  } else if (!agent || agent.isBuiltin) {
    // 切换到默认助手：从全局 storage 恢复模型/温度
    try {
      const global = await chrome.storage.local.get(['modelName', 'temperature', 'topP']);
      if (global.modelName) state.currentModel = global.modelName;
      if (global.temperature !== undefined) state.temperature = global.temperature;
      if (global.topP !== undefined) state.topP = global.topP;
      document.dispatchEvent(new CustomEvent('agent-model-changed'));
    } catch { /* ignore */ }
  }

  await renderAgentSelector();

  // 加载当前智能体的工具启用/禁用状态
  const mcpToolsResult = await chrome.storage.local.get(['mcpTools']);
  const mcpTools = mcpToolsResult.mcpTools || [];
  const agentToolsKey = `agentEnabledTools_${agentId || 'default'}`;
  const saved = await chrome.storage.local.get([agentToolsKey, 'enabledTools']);
  const isAgentSpecific = !!saved[agentToolsKey]; // 是否命中 agent-specific key
  const savedTools = saved[agentToolsKey] || saved.enabledTools;
  if (savedTools && savedTools.length > 0) {
    const validToolIds = new Set([...BUILTIN_TOOLS.map(t => t.id), ...mcpTools.map(t => t.id)]);
    const existing = savedTools.filter(id => validToolIds.has(id));
    if (isAgentSpecific) {
      // Agent-specific：使用用户保存的列表，仅自动添加新的 MCP 工具
      const newMcp = mcpTools.filter(t => !existing.includes(t.id)).map(t => t.id);
      state.enabledTools = [...existing, ...newMcp];
    } else {
      // 全局降级：保留自动添加新 builtin 工具的行为
      const newBuiltin = BUILTIN_TOOLS.filter(t => t.enabled && !existing.includes(t.id)).map(t => t.id);
      const newMcp = mcpTools.filter(t => !existing.includes(t.id)).map(t => t.id);
      state.enabledTools = [...existing, ...newBuiltin, ...newMcp];
    }
    if (state.enabledTools.length !== savedTools.length) {
      chrome.storage.local.set({ [agentToolsKey]: state.enabledTools });
    }
  } else {
    state.enabledTools = [...BUILTIN_TOOLS.filter(t => t.enabled).map(t => t.id), ...mcpTools.map(t => t.id)];
  }
  
  // 如果工具弹窗打开，联动刷新（Agent 限定范围变化）
  const toolsPopupOverlay = document.getElementById('toolsPopupOverlay');
  if (toolsPopupOverlay && toolsPopupOverlay.classList.contains('show')) {
    renderToolsPopupList();
    updateCategoryBadges();
    updateToolsPopupTitle();
  }
  // 始终更新工具栏按钮（工具数量可能变化）
  updateToolsToggleState();
  
  const agentName = agent ? agent.name : t('agentMgr.defaultAgentName');
  showToast(t('agentMgr.switchedTo', { name: agentName }), 'info', 2000);
  
  logger.debug('[AgentMgr] switched Agent:', agentId, agentName);
}

/**
 * 初始化 Agent 编辑模态框事件
 */
function initAgentModalEvents() {
  const modal = document.getElementById('agentEditModal');
  if (!modal) return;

  // 关闭按钮
  modal.querySelector('#agentModalCloseBtn')?.addEventListener('click', closeAgentEditor);
  
  // 保存按钮
  modal.querySelector('#agentSaveBtn')?.addEventListener('click', saveAgent);

  // 删除按钮
  modal.querySelector('#agentDeleteBtn')?.addEventListener('click', deleteCurrentAgent);

  // 模板选择
  modal.querySelector('#agentTemplateSelect')?.addEventListener('change', onTemplateSelect);

  // Emoji 选择器
  initEmojiPicker();

  // 工具快捷操作按钮
  const toolActions = document.getElementById('agentToolActions');
  if (toolActions) {
    toolActions.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'selectAll') selectAllTools();
      else if (action === 'deselectAll') deselectAllTools();
    });
  }

  // 技能快捷操作按钮
  const skillActions = document.getElementById('agentSkillActions');
  if (skillActions) {
    skillActions.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'selectAllSkills') selectAllSkills();
      else if (action === 'deselectAllSkills') deselectAllSkills();
    });
  }

  // 工具分类标题点击：切换该分类全选/取消
  const toolList = document.getElementById('agentToolList');
  if (toolList) {
    toolList.addEventListener('click', (e) => {
      const catHeader = e.target.closest('.agent-tool-category-clickable');
      if (!catHeader) return;
      toggleCategorySelection(catHeader.dataset.category);
    });
    // 工具勾选变化：联动更新分类计数和总计数
    toolList.addEventListener('change', (e) => {
      if (e.target.matches('input[type="checkbox"]')) {
        updateAgentToolCounts();
      }
    });
  }

  // 技能勾选变化：联动更新总计数
  const skillList = document.getElementById('agentSkillList');
  if (skillList) {
    skillList.addEventListener('change', (e) => {
      if (e.target.matches('input[type="checkbox"]')) {
        updateAgentSkillCount();
      }
    });
  }

  // 点击外部关闭 emoji picker
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('emojiPicker');
    const btn = document.getElementById('agentEditIconBtn');
    if (picker && btn && picker.style.display === 'block' && !btn.contains(e.target) && !picker.contains(e.target)) {
      picker.style.display = 'none';
    }
  });
}

// 常用 Emoji 分类
const EMOJI_CATEGORIES = [
  { label: t('agentMgr.emojiCatFaceExpressions'), emojis: ['😀','😃','😎','🤩','🥳','😇','🤔','🧐','😤','😭','🥺','🤗','😏','🫡','🤫','🤯','🥱','😴','🤤','💀'] },
  { label: t('agentMgr.emojiCatHandGestures'), emojis: ['👋','🤝','👍','👎','👏','🙌','💪','✍️','🙏','🤞','✌️','🤘','👆','👇','👉','👈','🖐️','🤙','🤌','🫶'] },
  { label: t('agentMgr.emojiCatProfessionalRoles'), emojis: ['🤖','🧑‍💻','👨‍🔬','👩‍🎨','🧑‍🏫','👨‍💼','🧑‍🔧','👩‍⚕️','🧑‍🚀','👨‍🍳','🧑‍🎓','👩‍🚒','👮','🕵️','👷','🧙','🦸','🧛','🧜','👼'] },
  { label: t('agentMgr.emojiCatAiTech'), emojis: ['🧠','💡','🔍','🔬','🧪','🧬','🛰️','📡','🔗','🌐','💻','🖥️','⌨️','🖱️','🖨️','📱','🔌','💾','🎛️','⚙️'] },
  { label: t('agentMgr.emojiCatToolObjects'), emojis: ['🔧','🔨','🪛','🔐','🔑','🛡️','🔒','🔓','✂️','📐','📏','🧲','💣','🧨','🔔','🔕','💎','💿','📀','🎥'] },
  { label: t('agentMgr.emojiCatDocData'), emojis: ['📝','📋','📄','📊','📈','📉','🗂️','📁','📂','📚','📖','📌','📎','🖇️','✏️','🖊️','📏','📐','🗑️','📇'] },
  { label: t('agentMgr.emojiCatStatusMarks'), emojis: ['✅','❌','⚠️','⛔','🚫','➕','➖','⭐','🔥','💯','🎯','🏆','🥇','📌','📍','💬','🗨️','💭','🗯️','💢'] },
  { label: t('agentMgr.emojiCatTransportTravel'), emojis: ['🚀','✈️','🚗','🚲','🛵','🏎️','🚢','🚁','🛸','🏃','🚶','🧗','🏄','🚴','🏊','⛵','🚂','🚌','🚕','🛴'] },
  { label: t('agentMgr.emojiCatNatureWeather'), emojis: ['☀️','🌙','⭐','🌈','☁️','⛈️','❄️','🔥','💧','🌊','🌸','🌺','🌻','🌲','🍀','🌍','🏔️','🌋','🏝️','🌌'] },
  { label: t('agentMgr.emojiCatSymbolSigns'), emojis: ['©️','®️','™️','♻️','⚡','💲','🔴','🟠','🟡','🟢','🔵','🟣','⬛','⬜','🟤','❤️','💙','💚','💛','💜'] },
];

function initEmojiPicker() {
  const picker = document.getElementById('emojiPicker');
  const btn = document.getElementById('agentEditIconBtn');
  const hidden = document.getElementById('agentEditIcon');
  if (!picker || !btn) return;

  // 构建分类 emoji 面板
  let html = '';
  for (const cat of EMOJI_CATEGORIES) {
    html += `<div class="emoji-category-label">${cat.label}</div>`;
    html += '<div class="emoji-picker-grid">';
    for (const emoji of cat.emojis) {
      html += `<button type="button" class="emoji-picker-item" data-emoji="${emoji}">${emoji}</button>`;
    }
    html += '</div>';
  }
  picker.innerHTML = html;

  // 点击按钮切换 picker
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (picker.style.display === 'block') {
      picker.style.display = 'none';
      return;
    }
    // 动态定位：判断按钮右侧空间，不够则靠右展开
    const btnRect = btn.getBoundingClientRect();
    const panelWidth = document.body.clientWidth;
    const pickerWidth = 330;
    const spaceRight = panelWidth - btnRect.left;
    if (spaceRight >= pickerWidth) {
      picker.style.left = '0';
      picker.style.right = 'auto';
    } else {
      picker.style.left = 'auto';
      picker.style.right = '0';
    }
    picker.style.display = 'block';
  });

  // 选择 emoji
  picker.addEventListener('click', (e) => {
    const item = e.target.closest('.emoji-picker-item');
    if (!item) return;
    const emoji = item.dataset.emoji;
    btn.textContent = emoji;
    if (hidden) hidden.value = emoji;
    picker.style.display = 'none';
  });
}

function selectAllTools() {
  const checkboxes = document.querySelectorAll('#agentToolList input[type="checkbox"]');
  checkboxes.forEach(cb => { cb.checked = true; });
  updateAgentToolCounts();
}

function deselectAllTools() {
  const checkboxes = document.querySelectorAll('#agentToolList input[type="checkbox"]');
  checkboxes.forEach(cb => { cb.checked = false; });
  updateAgentToolCounts();
}

function selectAllSkills() {
  const checkboxes = document.querySelectorAll('#agentSkillList input[type="checkbox"]');
  checkboxes.forEach(cb => { cb.checked = true; });
  updateAgentSkillCount();
}

function deselectAllSkills() {
  const checkboxes = document.querySelectorAll('#agentSkillList input[type="checkbox"]');
  checkboxes.forEach(cb => { cb.checked = false; });
  updateAgentSkillCount();
}

function toggleCategorySelection(category) {
  const items = document.querySelectorAll(`#agentToolList .agent-tool-item[data-category="${category}"]`);
  const checkboxes = [];
  items.forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]');
    if (cb) checkboxes.push(cb);
  });
  if (checkboxes.length === 0) return;
  const allChecked = checkboxes.every(cb => cb.checked);
  checkboxes.forEach(cb => { cb.checked = !allChecked; });
  updateAgentToolCounts();
}

/**
 * 根据当前勾选状态刷新工具分类计数和总计数
 */
function updateAgentToolCounts() {
  const container = document.getElementById('agentToolList');
  if (!container) return;

  let totalCount = 0;
  let totalSelected = 0;
  const items = Array.from(container.querySelectorAll('.agent-tool-item'));
  container.querySelectorAll('.agent-tool-category-clickable').forEach(catEl => {
    const cat = catEl.dataset.category;
    const catItems = items.filter(item => item.dataset.category === cat);
    const catTotal = catItems.length;
    const catSelected = catItems.filter(item => {
      const cb = item.querySelector('input[type="checkbox"]');
      return cb && cb.checked;
    }).length;
    totalCount += catTotal;
    totalSelected += catSelected;
    const countSpan = catEl.querySelector('.agent-tool-cat-count');
    if (countSpan) countSpan.textContent = `${catSelected}/${catTotal}`;
  });

  const countEl = document.getElementById('agentToolCount');
  if (countEl) {
    countEl.textContent = t('agentConfig.selectedTotalCount', { selected: totalSelected, total: totalCount });
  }
}

/**
 * 根据当前勾选状态刷新技能总计数
 */
function updateAgentSkillCount() {
  const container = document.getElementById('agentSkillList');
  const countEl = document.getElementById('agentSkillCount');
  if (!container || !countEl) return;

  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  const total = checkboxes.length;
  const selected = container.querySelectorAll('input[type="checkbox"]:checked').length;
  countEl.textContent = t('agentConfig.selectedTotalCount', { selected, total });
}

/**
 * 打开 Agent 编辑器
 * @param {string|null} agentId - null 表示新建
 */
export async function openAgentEditor(agentId) {
  const modal = document.getElementById('agentEditModal');
  if (!modal) return;

  // 填充模型 datalist + 温度预设下拉
  await populateModelDatalist();
  populateTempPresetDropdown(-1);

  // 重置表单
  modal.querySelector('#agentEditId').value = '';
  modal.querySelector('#agentEditName').value = '';
  modal.querySelector('#agentEditIcon').value = '🤖';
  const iconBtn = modal.querySelector('#agentEditIconBtn');
  if (iconBtn) iconBtn.textContent = '🤖';
  modal.querySelector('#agentEditDesc').value = '';
  modal.querySelector('#agentEditPrompt').value = '';
  modal.querySelector('#agentEditAllowSub').checked = false;
  modal.querySelector('#agentTemplateSelect').value = '';
  modal.querySelector('#agentEditModel').value = '';

  const deleteBtn = modal.querySelector('#agentDeleteBtn');
  const titleEl = modal.querySelector('#agentEditTitle');

  if (agentId) {
    // 编辑模式
    const agent = await getAgent(agentId);
    if (!agent || agent.isBuiltin) return;  // 内置不可编辑

    titleEl.textContent = t('agentMgr.editAgent');
    modal.querySelector('#agentEditId').value = agent.id;
    modal.querySelector('#agentEditName').value = agent.name;
    modal.querySelector('#agentEditIcon').value = agent.icon || '🤖';
    const iconBtn = modal.querySelector('#agentEditIconBtn');
    if (iconBtn) iconBtn.textContent = agent.icon || '🤖';
    modal.querySelector('#agentEditDesc').value = agent.description || '';
    modal.querySelector('#agentEditPrompt').value = agent.systemPrompt || '';
    modal.querySelector('#agentEditAllowSub').checked = agent.allowSubDispatch || false;
    modal.querySelector('#agentEditModel').value = agent.model || '';
    // 反查温度预设档位
    const presetIdx = findTempPresetIndex(agent.temperature, agent.topP);
    populateTempPresetDropdown(presetIdx);
    deleteBtn.style.display = 'block';

    // 渲染工具选择
    renderAgentToolSelector(agent.toolIds);
    // 渲染技能选择
    renderAgentSkillSelector(agent.skillIds);
  } else {
    // 新建模式
    titleEl.textContent = t('agentEditor.createNew');
    deleteBtn.style.display = 'none';
    
    // 渲染空工具选择
    renderAgentToolSelector(null);
    // 渲染空技能选择
    renderAgentSkillSelector(null);
  }

  // 渲染模板选项（新建和编辑模式均支持切换模板）
  renderTemplateOptions();

  modal.style.display = 'flex';

  // 模型输入框：聚焦时暂清内容以显示完整下拉，失焦时恢复
  const modelInput = modal.querySelector('#agentEditModel');
  if (modelInput) {
    const savedValue = modelInput.value;
    // 移除旧事件（避免重复绑定）
    const newInput = modelInput.cloneNode(true);
    modelInput.parentNode.replaceChild(newInput, modelInput);
    newInput.value = savedValue;
    // mousedown 先于 focus 触发，同步清空值让 datalist 展示全部选项而非过滤后的
    newInput.addEventListener('mousedown', () => {
      const val = newInput.value;
      if (val) {
        newInput.dataset._saved = val;
        newInput.value = '';
      }
    });
    newInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (!newInput.value) {
          newInput.value = newInput.dataset._saved || '';
        }
      }, 150);
    });
  }
}

/**
 * 关闭 Agent 编辑器
 */
function closeAgentEditor() {
  const modal = document.getElementById('agentEditModal');
  if (modal) modal.style.display = 'none';
}

/**
 * 渲染模板下拉选项
 */
function renderTemplateOptions() {
  const select = document.getElementById('agentTemplateSelect');
  if (!select) return;

  const templateNames = [
    t('agentTemplates.codeReviewName'),
    t('agentTemplates.webAutomationName'),
    t('agentTemplates.dataAnalystName'),
    t('agentTemplates.documentationName'),
  ];

  let html = `<option value="">${t('agentEditor.selectTemplate')}</option>`;
  for (let i = 0; i < AGENT_TEMPLATES.length; i++) {
    const tmpl = AGENT_TEMPLATES[i];
    html += `<option value="${i}">${tmpl.icon} ${templateNames[i]}</option>`;
  }
  select.innerHTML = html;
}

/**
 * 模板选择回调
 */
function onTemplateSelect(e) {
  const idx = parseInt(e.target.value);
  if (isNaN(idx) || idx < 0 || idx >= AGENT_TEMPLATES.length) return;

  const template = AGENT_TEMPLATES[idx];
  const modal = document.getElementById('agentEditModal');
  if (!modal) return;

  const templateNameKeys = [
    'agentTemplates.codeReviewName',
    'agentTemplates.webAutomationName',
    'agentTemplates.dataAnalystName',
    'agentTemplates.documentationName',
  ];
  const templateDescKeys = [
    'agentTemplates.codeReviewDesc',
    'agentTemplates.webAutomationDesc',
    'agentTemplates.dataAnalystDesc',
    'agentTemplates.documentationDesc',
  ];

  modal.querySelector('#agentEditName').value = t(templateNameKeys[idx]);
  modal.querySelector('#agentEditIcon').value = template.icon;
  const iconBtn = modal.querySelector('#agentEditIconBtn');
  if (iconBtn) iconBtn.textContent = template.icon;
  modal.querySelector('#agentEditDesc').value = t(templateDescKeys[idx]);
  modal.querySelector('#agentEditPrompt').value = getLanguage() === 'en' ? template.systemPrompt : (template.systemPromptZh || template.systemPrompt);
  modal.querySelector('#agentEditAllowSub').checked = template.allowSubDispatch || false;
  modal.querySelector('#agentEditModel').value = template.model || '';
  // 反查温度预设档位
  const presetIdx = findTempPresetIndex(template.temperature, template.topP);
  populateTempPresetDropdown(presetIdx);
  
  // 渲染工具选择
  renderAgentToolSelector(template.toolIds);
  // 渲染技能选择
  renderAgentSkillSelector(template.skillIds || null);

  showToast(t('agentMgr.templateLoaded', { name: template.name }), 'info', 2000);
}

/**
 * 渲染工具选择列表
 */
async function renderAgentToolSelector(selectedToolIds) {
  const container = document.getElementById('agentToolList');
  if (!container) return;

  // 加载 MCP 工具
  let mcpTools = [];
  try {
    const result = await chrome.storage.local.get(['mcpTools']);
    mcpTools = result.mcpTools || [];
  } catch { /* ignore */ }

  // 读取全局开关和 Agent 连接状态
  const { mcpEnabled, skillsEnabled } = await chrome.storage.local.get(['mcpEnabled', 'skillsEnabled']);
  const agentConnected = state.agentPlatform?.connected === true;

  let allTools = [...BUILTIN_TOOLS, ...mcpTools];

  // Agent 未连接时，隐藏所有 agent_* 和 mcp_* 工具
  if (!agentConnected) {
    allTools = allTools.filter(t => !t.id.startsWith('agent_') && !t.id.startsWith('mcp_'));
  }
  // MCP 全局开关关闭时，隐藏 MCP 工具
  if (mcpEnabled !== true) {
    allTools = allTools.filter(t => !t.id.startsWith('mcp_'));
  }
  // Skill 全局开关关闭时，隐藏 Skill 相关工具
  if (skillsEnabled === false) {
    allTools = allTools.filter(t => t.id !== 'agent_skill');
  }

  const selectedSet = new Set(selectedToolIds || []);
  const selectedCount = selectedToolIds ? selectedToolIds.length : allTools.length;

  // 按类别分组
  const grouped = {};
  for (const tool of allTools) {
    const cat = tool.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(tool);
  }

  const totalCount = allTools.length;

  let html = '';
  for (const [cat, tools] of Object.entries(grouped)) {
    const catName = t(`toolCategory.${cat}`) !== `toolCategory.${cat}` ? t(`toolCategory.${cat}`) : cat;
    const catTotal = tools.length;
    const catSelected = tools.filter(t => selectedSet.has(t.id)).length;
    html += `<div class="agent-tool-category agent-tool-category-clickable" data-category="${escapeAttr(cat)}" title="${escapeAttr(t('agentConfig.toggleCategoryAll'))}">${catName} <span class="agent-tool-cat-count" style="font-weight:400;color:#999;">${catSelected}/${catTotal}</span></div>`;
    for (const tool of tools) {
      const checked = selectedSet.has(tool.id) ? 'checked' : '';
      const desc = getToolDesc(tool);
      const truncated = desc.length > 40 ? desc.substring(0, 40) + '...' : desc;
      html += `
        <label class="agent-tool-item" data-category="${escapeAttr(cat)}">
          <input type="checkbox" value="${escapeAttr(tool.id)}" ${checked} data-tool-id="${escapeAttr(tool.id)}">
          <span class="agent-tool-name" title="${escapeAttr(tool.name)}">${escapeHtml(tool.name)}</span>
          <span class="agent-tool-desc" title="${escapeAttr(desc)}">${escapeHtml(truncated)}</span>
        </label>`;
    }
  }
  container.innerHTML = html;

  // 更新总工具数
  const countEl = document.getElementById('agentToolCount');
  if (countEl) {
    countEl.textContent = t('agentConfig.selectedTotalCount', { selected: selectedCount, total: totalCount });
  }
}

/**
 * 获取当前选中的工具 ID 列表
 */
function getSelectedToolIds() {
  const container = document.getElementById('agentToolList');
  if (!container) return null;
  const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
  const ids = [];
  checkboxes.forEach(cb => ids.push(cb.value));
  return ids.length > 0 ? ids : null;
}

/**
 * 渲染技能选择列表
 * @param {string[]|null} selectedSkillNames - 已选技能名称列表，null 表示全部未选
 */
async function renderAgentSkillSelector(selectedSkillNames) {
  const container = document.getElementById('agentSkillList');
  if (!container) return;

  let skills = [];
  try {
    skills = await getEnabledSkills();
  } catch { /* ignore */ }

  const selectedSet = new Set(selectedSkillNames || []);
  const selectedCount = selectedSkillNames ? selectedSkillNames.length : skills.length;
  const totalCount = skills.length;

  if (skills.length === 0) {
    container.innerHTML = `<div style="color:#999;font-size:12px;padding:8px;text-align:center;">${t('agentMgr.noSkillsHint')}</div>`;
    const countEl = document.getElementById('agentSkillCount');
    if (countEl) countEl.textContent = '(0)';
    return;
  }

  container.innerHTML = skills.map(skill => {
    const checked = selectedSet.has(skill.name) ? 'checked' : '';
    return `
      <label class="agent-tool-item">
        <input type="checkbox" value="${escapeAttr(skill.name)}" ${checked}>
        <span class="agent-tool-name" title="${escapeAttr(skill.name)}">${escapeHtml(skill.name)}</span>
        <span class="agent-tool-desc" title="${escapeAttr(skill.description || '')}">${escapeHtml((skill.description || '').substring(0, 40))}${(skill.description || '').length > 40 ? '...' : ''}</span>
      </label>`;
  }).join('');

  const countEl = document.getElementById('agentSkillCount');
  if (countEl) {
    countEl.textContent = t('agentConfig.selectedTotalCount', { selected: selectedCount, total: totalCount });
  }
}

/**
 * 获取当前选中的技能名称列表
 */
function getSelectedSkillNames() {
  const container = document.getElementById('agentSkillList');
  if (!container) return null;
  const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
  const names = [];
  checkboxes.forEach(cb => names.push(cb.value));
  return names.length > 0 ? names : null;
}

/**
 * 填充模型 datalist（从 storage 读取模型列表）
 */
async function populateModelDatalist() {
  const datalist = document.getElementById('agentModelList');
  if (!datalist) return;

  const presetModels = ['deepseek-v4-pro', 'deepseek-v4-flash'];

  return new Promise((resolve) => {
    chrome.storage.local.get(['customModels', 'deletedPresetModels'], (result) => {
      const deletedPresets = new Set(result.deletedPresetModels || []);
      const options = presetModels.filter(m => !deletedPresets.has(m));

      // 添加自定义模型
      const customModels = result.customModels || [];
      customModels.forEach(item => {
        let modelName;
        if (typeof item === 'string') modelName = item;
        else if (item && item.name) modelName = item.name;
        if (modelName && !options.includes(modelName)) {
          options.push(modelName);
        }
      });

      datalist.innerHTML = options.map(m => `<option value="${escapeAttr(m)}">`).join('');
      resolve();
    });
  });
}

/**
 * 填充温度预设下拉框
 */
function populateTempPresetDropdown(selectedIndex) {
  const select = document.getElementById('agentEditTempPreset');
  if (!select) return;

  // 保留第一个"不设置"选项，追加预设档位
  while (select.options.length > 1) select.remove(1);

  PRESET_MODES.forEach((mode, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = `${t(mode.labelKey)}（${mode.temp.toFixed(2)}）`;
    select.appendChild(option);
  });

  // 设置选中项
  if (selectedIndex !== undefined && selectedIndex >= 0) {
    select.value = selectedIndex;
  } else {
    select.value = '';
  }
}

/**
 * 获取温度预设选择结果
 * @returns {{ temperature: number|null, topP: number|null }}
 */
function getSelectedTempPreset() {
  const select = document.getElementById('agentEditTempPreset');
  if (!select || select.value === '') {
    return { temperature: null, topP: null };
  }
  const index = parseInt(select.value);
  if (isNaN(index) || index < 0 || index >= PRESET_MODES.length) {
    return { temperature: null, topP: null };
  }
  const mode = PRESET_MODES[index];
  return { temperature: mode.temp, topP: mode.topP };
}

/**
 * 从 Agent 的 temperature/topP 反查预设档位索引
 */
function findTempPresetIndex(temperature, topP) {
  if (temperature === null || temperature === undefined) return -1;
  for (let i = 0; i < PRESET_MODES.length; i++) {
    const m = PRESET_MODES[i];
    if (Math.abs(m.temp - temperature) < 0.001 && Math.abs(m.topP - (topP || 1.0)) < 0.001) {
      return i;
    }
  }
  return -1;
}

/**
 * 保存 Agent
 */
async function saveAgent() {
  const modal = document.getElementById('agentEditModal');
  if (!modal) return;

  const agentId = modal.querySelector('#agentEditId').value;
  const name = modal.querySelector('#agentEditName').value.trim();
  const icon = modal.querySelector('#agentEditIcon').value.trim() || '🤖';
  const description = modal.querySelector('#agentEditDesc').value.trim();
  const systemPrompt = modal.querySelector('#agentEditPrompt').value.trim();
  const allowSubDispatch = modal.querySelector('#agentEditAllowSub').checked;
  const toolIds = getSelectedToolIds();
  const skillIds = getSelectedSkillNames();
  const modelVal = modal.querySelector('#agentEditModel').value.trim();
  const model = modelVal || null;
  const { temperature, topP } = getSelectedTempPreset();

  if (!name) {
    showToast(t('agentMgr.nameRequired'), 'warning');
    return;
  }

  const data = { name, icon, description, systemPrompt, allowSubDispatch, toolIds, skillIds, model, temperature, topP };

  try {
    if (agentId) {
      await updateAgent(agentId, data);
      showToast(t('agentMgr.agentUpdated'), 'success');
    } else {
      const newAgent = await createAgent(data);
      showToast(t('agentMgr.agentCreated', { name: newAgent.name }), 'success');
    }

    // 刷新状态
    await loadAgentState();
    await renderAgentSelector();
    closeAgentEditor();
  } catch (err) {
    logger.error('[AgentMgr] save Agent failed:', err);
    showToast(t('agentMgr.saveFailed', { message: err.message }), 'error');
  }
}

/**
 * 删除当前编辑的 Agent
 */
async function deleteCurrentAgent() {
  const modal = document.getElementById('agentEditModal');
  if (!modal) return;

  const agentId = modal.querySelector('#agentEditId')?.value;
  if (!agentId) return;

  const agent = await getAgent(agentId);
  const agentName = agent ? agent.name : '';
  const confirmed = await showCustomConfirm(
    t('agentMgr.confirmDeleteAgentMessage', { name: agentName }),
    t('agentMgr.deleteAgentTitle')
  );
  if (!confirmed) return;

  try {
    await deleteAgent(agentId);
    showToast(t('agentMgr.agentDeleted'), 'success');
    await loadAgentState();
    await renderAgentSelector();
    closeAgentEditor();
  } catch (err) {
    logger.error('[AgentMgr] delete Agent failed:', err);
    showToast(t('agentMgr.deleteFailed', { message: err.message }), 'error');
  }
}

/**
 * 从列表直接删除指定 Agent（带确认弹窗，标明助手名称）
 * 供下拉列表和 @ 选择器共用
 * @returns {Promise<boolean>} 是否删除成功
 */
export async function deleteAgentWithConfirm(agentId) {
  if (!agentId) return false;
  const agent = await getAgent(agentId);
  if (!agent || agent.isBuiltin) {
    showToast(t('agentMgr.cannotDeleteDefault'), 'warning');
    return false;
  }
  const confirmed = await showCustomConfirm(
    t('agentMgr.confirmDeleteAgentMessage', { name: agent.name }),
    t('agentMgr.deleteAgentTitle')
  );
  if (!confirmed) return false;
  try {
    await deleteAgent(agentId);
    showToast(t('agentMgr.agentDeleted'), 'success');
    await loadAgentState();
    await renderAgentSelector();
    return true;
  } catch (err) {
    logger.error('[AgentMgr] delete Agent failed:', err);
    showToast(t('agentMgr.deleteFailed', { message: err.message }), 'error');
    return false;
  }
}

/**
 * 获取当前 Agent 的提示词（供 chat-manager 使用）
 * 返回 { agent, systemPrompt }
 */
export async function getCurrentAgentPrompt() {
  const agent = state.activeAgentId ? await getAgent(state.activeAgentId) : null;
  // getSystemPrompt 现在在 utils.js 中，不再需要重复 import
  return agent;
}

/**
 * 获取当前 Agent 的工具 ID 列表
 * 返回 null = 使用全局 enabledTools，返回 [] = 不使用工具
 */
export function getCurrentAgentToolIds(agent) {
  if (!agent) return null;
  return agent.toolIds;  // null = 继承全局，[] = 无工具
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/["&<>]/g, (c) => ({
    '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;',
  })[c]);
}

/**
 * 自定义确认弹窗（如果全局有 showCustomConfirm 则使用，否则用 confirm）
 */
async function showCustomConfirm(message, title) {
  // 检查是否有全局的自定义确认函数
  if (typeof window.showCustomConfirm === 'function') {
    return window.showCustomConfirm(message, title);
  }
  // 降级方案
  return new Promise((resolve) => {
    const modal = document.getElementById('agentConfirmModal');
    if (!modal) {
      resolve(confirm(message));
      return;
    }
    
    modal.querySelector('#agentConfirmMessage').textContent = message;
    modal.querySelector('#agentConfirmTitle').textContent = title || t('agentMgr.confirm');
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      modal.querySelector('#agentConfirmOk').removeEventListener('click', onOk);
      modal.querySelector('#agentConfirmCancel').removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlay);
    };

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onOverlay = (e) => { if (e.target === modal) { cleanup(); resolve(false); } };

    modal.querySelector('#agentConfirmOk').addEventListener('click', onOk);
    modal.querySelector('#agentConfirmCancel').addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlay);
  });
}
