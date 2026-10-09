// 侧边栏 "+" 菜单二级面板：悬停类别项时在菜单右侧展开「搜索框 + 列表」，
// 数据与选择动作完全复用各模块现有函数（提示词/技能/MCP/网页 4 类）。
//
// 职责：
//   1) openCategoryPanel(category)：加载该类数据并渲染（技能强制刷新，与弹窗一致）；
//      同类别重复调用 no-op；切换类别清空搜索框；请求序号丢弃过期响应；
//   2) 搜索过滤：本地即时过滤（code/content、name/description、serverName/serverId、title/url）；
//   3) 选择接线：普通点击与弹窗内行为一致（提示词发送、技能/MCP 多选切换、网页选中），
//      Ctrl/Cmd+点击 = 选中并收起菜单；技能/MCP 传 clearTrigger:false 防止误删输入框中的 "/" 正文；
//   4) closeCategoryPanel()：收起并重置（供菜单模块在关闭/移出时调用）。
//
// 与菜单模块解耦：不 import input-add-menu.js；需要关闭整个菜单时调用注入的 onRequestClose。
import state from './state.js';
import {
  getVisibleSkills, selectSkill, refreshSkillPickedState,
  getMcpServices, selectMcpService, refreshMcpPickedState,
} from './skill-selector.js';
import { sendPromptByCode, insertPromptToInputByCode } from './prompt-manager.js';
import { getOpenTabs, selectPage } from './page-selector.js';
import { escapeHtml, escapeAttr, adjustInputHeight } from './utils.js';
import { t, registerTranslations } from '../shared/i18n.js';
import logger from '../shared/logger.js';

registerTranslations('zh', {
  input: {
    addMenuPanelSearchPlaceholder: '搜索…',
    addMenuPanelLoading: '加载中…',
    addMenuPanelEmpty: '暂无可用内容',
    addMenuPanelNoMatch: '没有匹配项',
  },
});
registerTranslations('en', {
  input: {
    addMenuPanelSearchPlaceholder: 'Search…',
    addMenuPanelLoading: 'Loading…',
    addMenuPanelEmpty: 'No items available',
    addMenuPanelNoMatch: 'No matches',
  },
});

let panelEl = null;
let searchEl = null;
let listEl = null;
let activeCategory = null;
let dataset = [];   // 当前类别完整数据（渲染按搜索词过滤，选择动作传全量）
let loadSeq = 0;    // 请求序号：连续切换类别时只应用最后一次响应
let onRequestClose = () => {};

export function initInputAddPanel(options = {}) {
  onRequestClose = typeof options.onRequestClose === 'function' ? options.onRequestClose : () => {};
  panelEl = document.getElementById('inputAddPanel');
  searchEl = document.getElementById('inputAddPanelSearch');
  listEl = document.getElementById('inputAddPanelList');
  if (!panelEl || !searchEl || !listEl) return;
  searchEl.addEventListener('input', () => renderList());
}

export function isCategoryPanelOpen() {
  return !!activeCategory;
}

export function getPanelCategory() {
  return activeCategory;
}

export function isPanelSearchFocused() {
  return !!searchEl && document.activeElement === searchEl;
}

export async function openCategoryPanel(category) {
  if (!panelEl || !category) return;
  // 同类别已展开：no-op（状态机层已判断，此处防御）
  if (activeCategory === category && panelEl.style.display !== 'none') return;

  activeCategory = category;
  if (searchEl) {
    searchEl.value = '';
    searchEl.placeholder = t('input.addMenuPanelSearchPlaceholder');
  }
  panelEl.style.display = 'flex';
  const seq = ++loadSeq;
  if (listEl) listEl.innerHTML = `<div class="prompt-empty">${t('input.addMenuPanelLoading')}</div>`;

  try {
    const data = await fetchCategoryData(category);
    if (seq !== loadSeq) return; // 过期响应（已切换类别或已关闭）
    dataset = Array.isArray(data) ? data : [];
    renderList();
  } catch (err) {
    if (seq !== loadSeq) return;
    logger.warn('[InputAddPanel] load failed:', err && err.message);
    dataset = [];
    if (listEl) listEl.innerHTML = `<div class="prompt-empty">${t('input.addMenuPanelEmpty')}</div>`;
  }
}

export function closeCategoryPanel() {
  activeCategory = null;
  dataset = [];
  loadSeq++; // 作废在途请求
  if (searchEl) searchEl.value = '';
  if (listEl) listEl.innerHTML = '';
  if (panelEl) panelEl.style.display = 'none';
}

function fetchCategoryData(category) {
  switch (category) {
    case 'prompts': return Promise.resolve(state.customPrompts || []);
    case 'skills': return getVisibleSkills(true);
    case 'mcp': return getMcpServices();
    case 'pages': return getOpenTabs();
    default: return Promise.resolve([]);
  }
}

function filterDataset(query) {
  if (!query) return dataset;
  const q = query.toLowerCase();
  return dataset.filter((item) => {
    switch (activeCategory) {
      case 'prompts':
        return String(item.code || '').toLowerCase().includes(q)
          || String(item.content || '').toLowerCase().includes(q);
      case 'skills':
        return String(item.name || '').toLowerCase().includes(q)
          || String(item.description || '').toLowerCase().includes(q);
      case 'mcp':
        return String(item.serverName || '').toLowerCase().includes(q)
          || String(item.serverId || '').toLowerCase().includes(q);
      case 'pages':
        return String(item.title || '').toLowerCase().includes(q)
          || String(item.url || '').toLowerCase().includes(q);
      default:
        return true;
    }
  });
}

function renderList() {
  if (!listEl) return;
  const query = searchEl ? searchEl.value.trim() : '';
  const items = filterDataset(query);
  if (items.length === 0) {
    listEl.innerHTML = `<div class="prompt-empty">${query ? t('input.addMenuPanelNoMatch') : t('input.addMenuPanelEmpty')}</div>`;
    return;
  }
  listEl.innerHTML = items.map((item) => renderItem(item)).join('');
  listEl.querySelectorAll('.input-add-panel-item').forEach((el) => {
    el.addEventListener('click', (e) => handleItemClick(e, el));
  });
  // 技能/MCP 已选标记：复用全局刷新函数（面板项带 .skill-list-item/.mcp-list-item 即被覆盖）
  if (activeCategory === 'skills') refreshSkillPickedState();
  if (activeCategory === 'mcp') refreshMcpPickedState();
}

function renderItem(item) {
  switch (activeCategory) {
    case 'prompts':
      return `<div class="prompt-item input-add-panel-item" data-code="${escapeHtml(item.code)}" title="${escapeAttr(item.content || '')}">
        <span class="input-add-panel-item-title">/${escapeHtml(item.code)}</span>
        <span class="input-add-panel-item-sub">${escapeHtml(item.content || '')}</span>
      </div>`;
    case 'skills': {
      const disabled = item.enabled === false;
      const title = disabled ? `${item.name}\n${t('skillSelector.disabledTooltip')}` : item.name;
      return `<div class="skill-list-item input-add-panel-item${disabled ? ' skill-list-item-disabled' : ''}" data-skill-name="${escapeHtml(item.name)}" title="${escapeAttr(title)}">
        <span class="input-add-panel-item-icon">🧩</span>
        <span class="input-add-panel-item-title">${escapeHtml(item.name)}</span>
      </div>`;
    }
    case 'mcp': {
      const inactive = item.effectiveOpen === false;
      const title = inactive ? `${item.serverName}\n${t('skillSelector.mcpInactiveTooltip')}` : item.serverName;
      return `<div class="mcp-list-item input-add-panel-item${inactive ? ' mcp-list-item-inactive' : ''}" data-server-id="${escapeHtml(item.serverId)}" data-server-name="${escapeHtml(item.serverName)}" title="${escapeAttr(title)}">
        <span class="input-add-panel-item-icon">🔌</span>
        <span class="input-add-panel-item-title">${escapeHtml(item.serverName)}</span>
        ${inactive ? `<span class="mcp-list-item-badge mcp-badge-inactive">${t('skillSelector.mcpInactiveBadge')}</span>` : ''}
      </div>`;
    }
    case 'pages': {
      const title = item.title || item.url || '';
      const selected = !!(state.selectedPage && state.selectedPage.id === item.id);
      return `<div class="prompt-item input-add-panel-item" data-tab-id="${item.id}">
        <span class="input-add-panel-item-title">${escapeHtml(title)}</span>
        <span class="input-add-panel-item-sub">${escapeHtml(item.url || '')}</span>
        ${selected ? '<span class="page-selected-mark">✓</span>' : ''}
      </div>`;
    }
    default:
      return '';
  }
}

function handleItemClick(e, el) {
  const withCtrl = e.ctrlKey || e.metaKey;
  switch (activeCategory) {
    case 'prompts': {
      const code = el.dataset.code;
      if (withCtrl) insertPromptToInputByCode(code, { skipTriggerStrip: true });
      else sendPromptByCode(code);
      onRequestClose();
      break;
    }
    case 'skills':
      selectSkill(el.dataset.skillName, dataset, { clearTrigger: false });
      if (withCtrl) onRequestClose();
      break;
    case 'mcp':
      selectMcpService(el.dataset.serverId, el.dataset.serverName, dataset, { clearTrigger: false });
      if (withCtrl) onRequestClose();
      break;
    case 'pages': {
      const tab = dataset.find((x) => String(x.id) === el.dataset.tabId);
      if (tab) {
        // 与弹窗 selectPageByAt 一致：选中 + 回焦输入框（面板无 @ 触发文本，无需清理）
        selectPage(tab);
        const input = document.getElementById('userInput');
        if (input) input.focus();
        adjustInputHeight();
      }
      onRequestClose();
      break;
    }
    default:
      break;
  }
}
