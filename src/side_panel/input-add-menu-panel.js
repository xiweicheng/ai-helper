// 侧边栏 "+" 菜单二级面板：悬停类别项时在菜单右侧展开「搜索框 + 列表」，
// 数据与选择动作完全复用各模块现有函数（提示词/技能/MCP/网页/知识库/助手/代理/工作目录 8 类）。
//
// 职责：
//   1) openCategoryPanel(category)：加载该类数据并渲染（技能强制刷新，与弹窗一致）；
//      同类别重复调用 no-op；切换类别清空搜索框；请求序号丢弃过期响应；
//      工作目录仅列根目录一层（本地过滤），深层递归搜索仍走点击一级项打开的 $ 弹窗通道；
//   2) 搜索过滤：本地即时过滤（code/content、name/description、serverName/serverId、title/url、
//      知识库 name/description、助手名/描述、代理名/url、文件/目录名）；
//      搜索框内置一键清除按钮（清空 + 恢复全量 + 回焦搜索框）；
//   3) 选择接线：普通点击与弹窗内行为一致（提示词发送、技能/MCP/知识库多选切换且保持展开、
//      网页/助手/代理选中、工作目录附加到文件问答），Ctrl/Cmd+点击 = 选中并收起菜单；
//      面板是独立于触发符的入口，技能/MCP/知识库/助手/代理均传 clearTrigger:false
//      防止误删输入框中的 "/"、"@" 正文；
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
import {
  fetchKnowledgeCollections, getPairedAgents,
  selectKnowledgeByAt, refreshKnowledgePickedState,
  selectAgentByAt, selectProxyByAt,
  getAgentDisplayName, getAgentDisplayDesc,
} from './agent-at-selector.js';
import { getAllAgents } from './agent-store.js';
import { getWorkspaceRoot, listDirectory, getFileIcon, formatFileSize } from './workspace-manager.js';
import { attachFilesForQuestion } from './workspace-panel.js';
import { escapeHtml, escapeAttr, adjustInputHeight } from './utils.js';
import { t, registerTranslations } from '../shared/i18n.js';
import logger from '../shared/logger.js';

registerTranslations('zh', {
  input: {
    addMenuPanelSearchPlaceholder: '搜索…',
    addMenuPanelClear: '清除',
    addMenuPanelLoading: '加载中…',
    addMenuPanelEmpty: '暂无可用内容',
    addMenuPanelNoMatch: '没有匹配项',
  },
});
registerTranslations('en', {
  input: {
    addMenuPanelSearchPlaceholder: 'Search…',
    addMenuPanelClear: 'Clear',
    addMenuPanelLoading: 'Loading…',
    addMenuPanelEmpty: 'No items available',
    addMenuPanelNoMatch: 'No matches',
  },
});

let panelEl = null;
let searchEl = null;
let clearEl = null;
let listEl = null;
let activeCategory = null;
let dataset = [];   // 当前类别完整数据（渲染按搜索词过滤，选择动作传全量）
let loadSeq = 0;    // 请求序号：连续切换类别时只应用最后一次响应
let onRequestClose = () => {};

export function initInputAddPanel(options = {}) {
  onRequestClose = typeof options.onRequestClose === 'function' ? options.onRequestClose : () => {};
  panelEl = document.getElementById('inputAddPanel');
  searchEl = document.getElementById('inputAddPanelSearch');
  clearEl = document.getElementById('inputAddPanelSearchClear');
  listEl = document.getElementById('inputAddPanelList');
  if (!panelEl || !searchEl || !listEl) return;
  if (clearEl) {
    const label = t('input.addMenuPanelClear');
    clearEl.title = label;
    clearEl.setAttribute('aria-label', label);
    clearEl.addEventListener('click', () => {
      searchEl.value = '';
      renderList();
      syncSearchClear();
      searchEl.focus();
    });
  }
  searchEl.addEventListener('input', () => {
    renderList();
    syncSearchClear();
  });
}

// 一键清除按钮：有输入才显示
function syncSearchClear() {
  if (clearEl && searchEl) clearEl.style.display = searchEl.value ? 'flex' : 'none';
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
    syncSearchClear();
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
  if (searchEl) {
    searchEl.value = '';
    syncSearchClear();
  }
  if (listEl) listEl.innerHTML = '';
  if (panelEl) panelEl.style.display = 'none';
}

function fetchCategoryData(category) {
  switch (category) {
    case 'prompts': return Promise.resolve(state.customPrompts || []);
    case 'skills': return getVisibleSkills(true);
    case 'mcp': return getMcpServices();
    case 'pages': return getOpenTabs();
    // 知识库不可用时菜单项已被隐藏（refreshSelectorVisibility），此处仅兜底为空列表
    case 'knowledge': return fetchKnowledgeCollections().then((kbState) => (kbState.ok ? kbState.collections : []));
    case 'agents': return getAllAgents();
    case 'proxies': return getPairedAgents();
    case 'workspace': return fetchWorkspaceEntries();
    default: return Promise.resolve([]);
  }
}

/**
 * 工作目录：仅加载根目录一层条目（与 $ 弹窗未输入关键字的初始视图一致），
 * 排序对齐 $ 弹窗（最近修改优先 → 目录优先 → 名称字典序）；
 * 深层递归搜索仍走点击一级项打开的 $ 弹窗通道（双通道设计）
 */
async function fetchWorkspaceEntries() {
  const root = await getWorkspaceRoot();
  if (!root) return [];
  const result = await listDirectory(root);
  const entries = (result && result.entries) || [];
  const normRoot = String(root).replace(/\\/g, '/').replace(/\/+/g, '/');
  return entries
    .map((e) => ({
      name: e.name,
      type: e.type || 'file',
      size: e.size,
      mtime: e.mtime,
      fullPath: `${normRoot}/${e.name}`.replace(/\/+/g, '/'),
    }))
    .sort((a, b) => {
      const am = a.mtime || 0;
      const bm = b.mtime || 0;
      if (am !== bm) return bm - am;
      const aDir = a.type === 'directory' ? 0 : 1;
      const bDir = b.type === 'directory' ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;
      return String(a.name).localeCompare(String(b.name));
    });
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
      case 'knowledge':
        return String(item.name || '').toLowerCase().includes(q)
          || String(item.description || '').toLowerCase().includes(q);
      case 'agents':
        return String(getAgentDisplayName(item) || '').toLowerCase().includes(q)
          || String(getAgentDisplayDesc(item) || '').toLowerCase().includes(q);
      case 'proxies':
        return String(item.name || '').toLowerCase().includes(q)
          || String(item.url || '').toLowerCase().includes(q);
      case 'workspace':
        return String(item.name || '').toLowerCase().includes(q);
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
  // 技能/MCP/知识库已选标记：复用全局刷新函数（面板项带相同 class + data 属性即被覆盖）
  if (activeCategory === 'skills') refreshSkillPickedState();
  if (activeCategory === 'mcp') refreshMcpPickedState();
  if (activeCategory === 'knowledge') refreshKnowledgePickedState();
}

function renderItem(item) {
  switch (activeCategory) {
    case 'prompts':
      return `<div class="prompt-item input-add-panel-item input-add-panel-item-two-line" data-code="${escapeHtml(item.code)}" title="${escapeAttr(item.content || '')}">
        <span class="input-add-panel-item-title">/${escapeHtml(item.code)}</span>
        <span class="input-add-panel-item-sub">${escapeHtml(item.content || '')}</span>
      </div>`;
    case 'skills': {
      const disabled = item.enabled === false;
      const title = disabled ? `${item.name}\n${t('skillSelector.disabledTooltip')}` : item.name;
      const desc = item.description || '';
      return `<div class="skill-list-item input-add-panel-item input-add-panel-item-two-line${disabled ? ' skill-list-item-disabled' : ''}" data-skill-name="${escapeHtml(item.name)}" title="${escapeAttr(title)}">
        <span class="input-add-panel-item-title">🧩 ${escapeHtml(item.name)}</span>
        ${desc ? `<span class="input-add-panel-item-sub" title="${escapeAttr(desc)}">${escapeHtml(desc)}</span>` : ''}
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
      return `<div class="prompt-item input-add-panel-item input-add-panel-item-two-line" data-tab-id="${item.id}">
        <span class="input-add-panel-item-title">${escapeHtml(title)}</span>
        <span class="input-add-panel-item-sub">${escapeHtml(item.url || '')}</span>
        ${selected ? '<span class="page-selected-mark">✓</span>' : ''}
      </div>`;
    }
    case 'knowledge': {
      const disabled = item.enabled === false;
      const stats = t('knowledgeSelector.docChunk', { docs: item.documentCount || 0, chunks: item.chunkCount || 0 });
      return `<div class="prompt-item input-add-panel-item input-add-panel-item-two-line prompt-item-knowledge${disabled ? ' knowledge-item-disabled' : ''}" data-kb-id="${escapeHtml(item.id)}" data-kb-name="${escapeHtml(item.name || '')}" data-kb-disabled="${disabled ? '1' : '0'}"${disabled ? ` title="${escapeAttr(t('knowledgeSelector.disabledTooltip'))}"` : ''}>
        <span class="input-add-panel-item-title">📚 ${escapeHtml(item.name || '')}${disabled ? ` <span class="knowledge-item-badge badge-disabled">${t('knowledgeSelector.disabledBadge')}</span>` : ''}</span>
        <span class="input-add-panel-item-sub">${escapeHtml(stats)}</span>
      </div>`;
    }
    case 'agents': {
      const name = getAgentDisplayName(item);
      const desc = getAgentDisplayDesc(item);
      const isActive = item.id === state.activeAgentId || (!state.activeAgentId && item.id === 'default');
      const toolCount = item.toolIds ? item.toolIds.length : (item.toolIds === null ? null : 0);
      const toolLabel = toolCount === null ? t('promptSelector.inheritGlobal') : t('promptSelector.toolCount', { count: toolCount });
      return `<div class="prompt-item input-add-panel-item input-add-panel-item-two-line" data-agent-id="${escapeHtml(item.id)}">
        <span class="input-add-panel-item-title">${escapeHtml([item.icon, name].filter(Boolean).join(' '))}</span>
        <span class="input-add-panel-item-sub">${escapeHtml(desc || toolLabel)}</span>
        ${isActive ? '<span class="input-add-panel-item-mark">✓</span>' : ''}
      </div>`;
    }
    case 'proxies': {
      const name = item.name || t('promptSelector.unnamedProxy');
      return `<div class="prompt-item input-add-panel-item input-add-panel-item-two-line${item.isDisabled ? ' agent-disabled' : ''}" data-proxy-id="${escapeHtml(item.id)}">
        <span class="input-add-panel-item-title">${escapeHtml(name)}</span>
        <span class="input-add-panel-item-sub">${escapeHtml(item.url || '')}</span>
        ${item.isActive ? '<span class="input-add-panel-item-mark">✓</span>' : ''}
      </div>`;
    }
    case 'workspace': {
      const isDir = item.type === 'directory';
      return `<div class="prompt-item input-add-panel-item" data-path="${escapeHtml(item.fullPath)}" title="${escapeAttr(item.fullPath)}">
        <span class="input-add-panel-item-icon">${getFileIcon(item.name, item.type)}</span>
        <span class="input-add-panel-item-title">${escapeHtml(item.name)}${isDir ? '/' : ''}</span>
        ${!isDir && item.size != null ? `<span class="input-add-panel-item-sub">${escapeHtml(formatFileSize(item.size))}</span>` : ''}
      </div>`;
    }
    default:
      return '';
  }
}

async function handleItemClick(e, el) {
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
    case 'knowledge':
      // 多选切换；面板保持展开便于连续勾选（与技能/MCP 一致），修饰键点击 = 选中并收起
      selectKnowledgeByAt(
        { id: el.dataset.kbId, name: el.dataset.kbName, enabled: el.dataset.kbDisabled !== '1' },
        { clearTrigger: false },
      );
      if (withCtrl) onRequestClose();
      break;
    case 'agents':
      await selectAgentByAt(el.dataset.agentId, { clearTrigger: false });
      onRequestClose();
      break;
    case 'proxies':
      await selectProxyByAt(el.dataset.proxyId, { clearTrigger: false });
      onRequestClose();
      break;
    case 'workspace': {
      const entry = dataset.find((x) => x.fullPath === el.dataset.path);
      if (entry) {
        // 与 $ 弹窗 selectFileByAt 一致：回焦输入框 + 附加到文件问答（面板无 $ 触发文本，无需清理）
        const input = document.getElementById('userInput');
        if (input) input.focus();
        await attachFilesForQuestion([entry]);
        adjustInputHeight();
      }
      onRequestClose();
      break;
    }
    default:
      break;
  }
}
