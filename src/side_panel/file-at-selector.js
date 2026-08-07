// side_panel/file-at-selector.js - $ 选择器（输入 $ 检索工作目录文件/目录并添加到文件问答）
import state from './state.js';
import { getWorkspaceRoot, listDirectory, searchFilesRemote, getFileIcon } from './workspace-manager.js';
import { attachFilesForQuestion } from './workspace-panel.js';
import { escapeHtml, adjustInputHeight, updateDropdownPosition } from './utils.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  fileSelector: {
    switchHint: '方向键切换 · Enter添加到文件问答 · Esc取消',
    searching: '搜索中...',
    noMatch: '没有匹配的文件或目录',
    noWorkspace: '暂无工作目录，请先连接 Agent',
    loadFailed: '加载失败: {error}',
    truncated: '仅显示前 {count} 条，请继续输入以缩小范围',
  },
});
registerTranslations('en', {
  fileSelector: {
    switchHint: '↑↓ navigate · Enter attach · Esc cancel',
    searching: 'Searching...',
    noMatch: 'No matching file or directory',
    noWorkspace: 'No workspace directory. Connect an Agent first.',
    loadFailed: 'Load failed: {error}',
    truncated: 'Showing top {count} results. Keep typing to narrow down.',
  },
});

// 下拉列表最多展示的条目数（截断，避免结果过多时列表过长、性能与可读性下降）
const MAX_VISIBLE = 50;
// 后端单次搜索的最大返回条数（多取一些回来，前端按匹配质量+最近修改时间排序后再截断）
const SEARCH_LIMIT = 200;
// 远端搜索防抖时长（毫秒）
const SEARCH_DEBOUNCE = 200;

let searchSeq = 0;   // 请求序号：用于丢弃过期响应（连续输入时只渲染最后一次结果）
let searchTimer = null;
let currentItems = []; // 当前展示的匹配条目，选中时连同元数据（size 等）一并传给文件问答

function normalizePath(p) {
  return (p || '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

/**
 * 当前 $ 选择器是否可见（供键盘处理判断）
 */
export function isFileAtSelectorVisible() {
  const el = document.getElementById('fileAtSelector');
  const dropdown = document.getElementById('fileAtDropdown');
  return !!el && el.style.display !== 'none' && !!dropdown && dropdown.classList.contains('show');
}

/**
 * 显示 $ 工作目录文件选择器
 * @param {string} filterText - $ 后面的过滤文本
 */
export async function showFileAtSelector(filterText = '') {
  const fileAtSelector = document.getElementById('fileAtSelector');
  const fileAtDropdown = document.getElementById('fileAtDropdown');
  if (!fileAtSelector || !fileAtDropdown) return;

  // 动态计算下拉框位置，确保紧贴在输入框上方
  updateDropdownPosition();

  fileAtSelector.style.display = 'block';
  fileAtDropdown.classList.add('show');

  await renderFileAtList(filterText);
}

/**
 * 隐藏 $ 选择器
 */
export function hideFileAtSelector() {
  const fileAtSelector = document.getElementById('fileAtSelector');
  const fileAtDropdown = document.getElementById('fileAtDropdown');
  if (fileAtSelector) fileAtSelector.style.display = 'none';
  if (fileAtDropdown) fileAtDropdown.classList.remove('show');
  state.selectedFileAtIndex = -1;
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  // 使仍在途的搜索请求作废
  searchSeq++;
}

/**
 * 渲染匹配列表（防抖 + 序号防过期响应）
 * @param {string} filterText - $ 后面的过滤文本
 */
function renderFileAtList(filterText = '') {
  const list = document.getElementById('fileAtList');
  if (!list) return;

  const seq = ++searchSeq;
  const query = filterText.trim();
  if (searchTimer) clearTimeout(searchTimer);

  const run = async () => {
    try {
      const root = await getWorkspaceRoot();
      if (seq !== searchSeq) return;
      if (!root) {
        list.innerHTML = `<div class="prompt-empty">${t('fileSelector.noWorkspace')}</div>`;
        state.selectedFileAtIndex = -1;
        return;
      }

      let results;
      if (query) {
        // 远端递归搜索（名称匹配）：多取一些，供前端排序后截断
        results = await searchFilesRemote(root, query, SEARCH_LIMIT);
      } else {
        // 未输入关键字：展示工作目录根目录内容，给用户即时反馈
        const dirResult = await listDirectory(root);
        results = (dirResult.entries || []).map(e => ({
          name: e.name,
          type: e.type || 'file',
          size: e.size,
          mtime: e.mtime,
          fullPath: normalizePath(`${root}/${e.name}`),
        }));
      }
      if (seq !== searchSeq) return;

      renderList(results, query, list, root);
    } catch (err) {
      if (seq !== searchSeq) return;
      logger.warn('[FileAtSelector] search failed:', err.message);
      list.innerHTML = `<div class="prompt-empty">${t('fileSelector.loadFailed', { error: err.message })}</div>`;
      state.selectedFileAtIndex = -1;
    }
  };

  if (query) {
    list.innerHTML = `<div class="prompt-empty">${t('fileSelector.searching')}</div>`;
    searchTimer = setTimeout(run, SEARCH_DEBOUNCE);
  } else {
    searchTimer = setTimeout(run, 0);
  }
}

/**
 * 排序规则（对齐 VS Code / IDE 快速打开等主流文件选择器的用户习惯）：
 * 1. 名称前缀匹配优先（startsWith 优先于 contains）
 * 2. 最近修改时间优先（mtime 倒序）—— 相比创建时间，修改时间更能反映内容变化，
 *    用户通常更关心最近动过的文件，各大文件管理器/编辑器默认展示的也是"修改时间"
 * 3. 目录优先（无关键字浏览时与文件管理器习惯一致）
 * 4. 名称字典序兜底，保证结果顺序稳定
 */
function sortResults(results, query) {
  const q = query.toLowerCase();
  return [...results].sort((a, b) => {
    const an = (a.name || '').toLowerCase();
    const bn = (b.name || '').toLowerCase();
    if (q) {
      const aPrefix = an.startsWith(q) ? 1 : 0;
      const bPrefix = bn.startsWith(q) ? 1 : 0;
      if (aPrefix !== bPrefix) return bPrefix - aPrefix;
    }
    const am = a.mtime || 0;
    const bm = b.mtime || 0;
    if (am !== bm) return bm - am;
    const aDir = a.type === 'directory' ? 0 : 1;
    const bDir = b.type === 'directory' ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return an.localeCompare(bn);
  });
}

/**
 * 渲染排序后的匹配列表
 */
function renderList(results, query, list, root) {
  const sorted = sortResults(results, query);
  const items = sorted.slice(0, MAX_VISIBLE);
  const truncated = sorted.length > MAX_VISIBLE;
  const normRoot = normalizePath(root);

  if (items.length === 0) {
    list.innerHTML = `<div class="prompt-empty">${t('fileSelector.noMatch')}</div>`;
    state.selectedFileAtIndex = -1;
    return;
  }

  // 默认选中第一项
  state.selectedFileAtIndex = 0;
  currentItems = items;

  list.innerHTML = items.map((item, index) => {
    const icon = getFileIcon(item.name, item.type);
    const fullPath = normalizePath(item.fullPath);
    // 相对工作目录的展示路径：优先展示文件名所在目录，便于区分同名文件
    const relPath = fullPath.startsWith(normRoot)
      ? fullPath.substring(normRoot.length).replace(/^\//, '')
      : fullPath;
    return `
      <div class="prompt-item ${index === 0 ? 'selected' : ''}" data-index="${index}" data-path="${escapeHtml(fullPath)}" title="${escapeHtml(fullPath)}">
        <span class="prompt-item-index">${index + 1}</span>
        <span class="prompt-item-icon">${icon}</span>
        <span class="prompt-item-content">${escapeHtml(item.name)}</span>
        <span class="file-at-path">${escapeHtml(relPath)}</span>
      </div>
    `;
  }).join('');

  // 结果被截断时给出提示，引导用户继续输入缩小范围
  if (truncated) {
    const footer = document.createElement('div');
    footer.className = 'file-at-truncated';
    footer.textContent = t('fileSelector.truncated', { count: MAX_VISIBLE });
    list.appendChild(footer);
  }

  list.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', () => {
      // 带上匹配条目的元数据（size/type/mtime），保证文件问答能正确展示文件大小
      const entry = currentItems.find(r => r.fullPath === item.dataset.path);
      selectFileByAt(entry || item.dataset.path);
    });
  });
}

/**
 * 选中文件/目录：移除输入框中的 $... 文本，并添加到文件问答
 * @param {Object|string} entry - 匹配条目对象（含 fullPath/name/type/size/mtime）或完整路径字符串
 */
function selectFileByAt(entry) {
  const fullPath = typeof entry === 'string' ? entry : entry && entry.fullPath;
  if (!fullPath) return;

  const userInput = document.getElementById('userInput');
  const value = userInput ? userInput.value : '';
  const lastDollarIndex = value.lastIndexOf('$');

  // 去掉输入框中的 $ 及后面的匹配文本（与 @ 选择器行为一致）
  if (lastDollarIndex !== -1) {
    const newValue = value.substring(0, lastDollarIndex);
    userInput.value = newValue;
    userInput.focus();
    userInput.selectionStart = userInput.selectionEnd = newValue.length;
  }

  hideFileAtSelector();
  // 添加到输入框上方的文件问答（图片自动按缩略图展示）
  attachFilesForQuestion([entry]);
  adjustInputHeight();
}

/**
 * 更新 $ 列表选中状态
 */
export function updateFileAtSelection(items) {
  const selectedIndex = state.selectedFileAtIndex;
  items.forEach((item, index) => {
    if (index === selectedIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}
