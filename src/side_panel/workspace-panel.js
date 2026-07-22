// workspace-panel.js - 工作目录文件管理器 UI

import {
  getWorkspaceRoot, resetWorkspaceRoot, getAgentConfig,
  listDirectory, readFileContent,
  downloadFileStream, downloadFilesStream,
  searchFilesRemote,
  getFileIcon, formatFileSize, formatTime,
  supportsPreview, getMimeType
} from './workspace-manager.js';
import logger from '../shared/logger.js';
import { showToast } from './utils.js';
import state from './state.js';
import { renderFilePreviews } from './file-extract.js';

// 当前浏览路径
let currentPath = null;
// 工作目录根路径
let workspaceRoot = null;
// 路径历史（用于返回上级）
let pathHistory = [];
// 是否已初始化
let initialized = false;
// 当前排序：{ field: 'name'|'size'|'time', asc: boolean }
let currentSort = { field: 'name', asc: true };
// 选中要下载的文件/目录集合
let selectedPaths = new Set();

/**
 * 初始化工作目录面板
 */
export function initWorkspacePanel() {
  if (initialized) return;
  initialized = true;

  const container = document.createElement('div');
  container.className = 'workspace-panel-container';
  container.id = 'workspacePanelContainer';
  container.innerHTML = `
    <button class="workspace-panel-toggle" id="workspacePanelToggle" title="工作目录">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
    <div class="workspace-panel" id="workspacePanel">
      <div class="workspace-panel-header">
        <div class="workspace-panel-title-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:#4a90d9;">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span>工作目录</span>
          <button class="workspace-panel-close" id="workspacePanelClose" title="关闭面板">×</button>
        </div>
        <div class="workspace-panel-breadcrumb" id="workspaceBreadcrumb"></div>
      </div>
      <div class="workspace-panel-toolbar" id="workspaceToolbar">
        <button class="workspace-toolbar-btn" id="workspaceBackBtn" title="返回上级目录" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <button class="workspace-toolbar-btn" id="workspaceRefreshBtn" title="刷新">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
        </button>
        <button class="workspace-toolbar-btn" id="workspaceUploadBtn" title="上传文件到当前目录">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
        </button>
        <button class="workspace-toolbar-btn" id="workspaceAskBtn" title="基于选中的文件进行问答" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>
        <button class="workspace-toolbar-btn" id="workspaceDownloadDirBtn" title="下载选中的文件/目录（多选打包为ZIP）" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
        </button>
        <span class="workspace-toolbar-selected" id="workspaceSelectedCount" style="display:none;"></span>
        <div class="workspace-search-box">
          <input type="text" id="workspaceSearchInput" placeholder="搜索文件..." />
          <button id="workspaceSearchClear" title="清除" style="display:none;">×</button>
          <button id="workspaceSearchBtn" title="搜索">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
        </div>
      </div>
      <!-- 排序标题行 -->
      <div class="workspace-file-header">
        <div class="workspace-file-select" id="workspaceSelectAll" title="全选/取消全选">
          <span class="workspace-checkbox"></span>
        </div>
        <div class="workspace-file-header-name sortable" data-sort="name">
          文件名 <span class="sort-indicator" id="sortNameIndicator"></span>
        </div>
        <div class="workspace-file-header-size sortable" data-sort="size">
          大小 <span class="sort-indicator" id="sortSizeIndicator"></span>
        </div>
        <div class="workspace-file-header-time sortable" data-sort="time">
          修改时间 <span class="sort-indicator" id="sortTimeIndicator"></span>
        </div>
      </div>
      <div class="workspace-panel-content" id="workspacePanelContent">
        <div class="workspace-panel-loading">加载中...</div>
      </div>
      <!-- 预览遮罩层 -->
      <div class="workspace-preview-overlay" id="workspacePreviewArea" style="display:none;">
        <div class="workspace-preview-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="workspace-preview-icon">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span class="workspace-preview-filename" id="workspacePreviewFilename"></span>
          <span class="workspace-preview-linecount" id="workspacePreviewLineCount"></span>
          <button class="workspace-preview-copy-btn" id="workspacePreviewCopyBtn" title="复制全部内容">复制</button>
          <button class="workspace-preview-download-btn" id="workspacePreviewDownloadBtn" title="下载文件">下载</button>
          <button class="workspace-preview-close" id="workspacePreviewClose" title="关闭预览">×</button>
        </div>
        <div class="workspace-preview-content" id="workspacePreviewContent"></div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  bindEvents();
  logger.debug('[WorkspacePanel] 工作目录面板已初始化');
}

/**
 * 绑定事件
 */
function bindEvents() {
  const container = document.getElementById('workspacePanelContainer');
  const panel = document.getElementById('workspacePanel');
  const toggle = document.getElementById('workspacePanelToggle');

  toggle.addEventListener('click', async (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.contains('expanded');
    if (isOpen) {
      closePanel();
    } else {
      await openPanel();
    }
  });

  // 关闭按钮
  document.getElementById('workspacePanelClose').addEventListener('click', (e) => {
    e.stopPropagation();
    closePanel();
  });

  // 工具栏按钮
  document.getElementById('workspaceBackBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    navigateBack();
  });
  document.getElementById('workspaceRefreshBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    refreshCurrent();
  });
  document.getElementById('workspaceUploadBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    triggerUpload();
  });
  document.getElementById('workspaceAskBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    askSelectedFiles();
  });
  document.getElementById('workspaceDownloadDirBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    downloadSelected();
  });

  // 搜索框
  const searchInput = document.getElementById('workspaceSearchInput');
  searchInput.addEventListener('input', handleSearchInput);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      performSearch();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      clearSearch();
    }
  });
  document.getElementById('workspaceSearchBtn').addEventListener('click', performSearch);
  document.getElementById('workspaceSearchClear').addEventListener('click', clearSearch);

  // 排序标题点击
  document.getElementById('workspacePanel').querySelectorAll('.workspace-file-header .sortable').forEach(el => {
    el.addEventListener('click', () => {
      const field = el.dataset.sort;
      if (currentSort.field === field) {
        currentSort.asc = !currentSort.asc;
      } else {
        currentSort.field = field;
        currentSort.asc = true;
      }
      updateSortIndicators();
      renderCurrentEntries();
    });
  });

  // 全选/取消全选
  document.getElementById('workspaceSelectAll').addEventListener('click', toggleSelectAll);

  // 文件列表点击（事件委托）
  document.getElementById('workspacePanelContent').addEventListener('click', handleFileListClick);

  // 预览关闭
  document.getElementById('workspacePreviewClose').addEventListener('click', closePreview);
  document.getElementById('workspacePreviewCopyBtn').addEventListener('click', copyPreviewContent);
  document.getElementById('workspacePreviewDownloadBtn').addEventListener('click', downloadPreviewFile);

  // 拖拽上传
  setupDragDrop();

  // 隐藏的文件上传 input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.id = 'workspaceFileInput';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', handleFileUpload);
  document.body.appendChild(fileInput);
}

// 缓存的当前目录条目列表
let cachedEntries = [];

/**
 * 展开面板
 */
async function openPanel() {
  const panel = document.getElementById('workspacePanel');
  if (panel.classList.contains('expanded')) return;
  panel.classList.add('expanded');
  if (!currentPath) {
    await navigateToRoot();
  }
}

/**
 * 关闭面板
 */
function closePanel() {
  closePanelInternal();
}

/**
 * 导航到工作目录根路径
 */
async function navigateToRoot() {
  const root = await getWorkspaceRoot();
  if (!root) {
    showError('无法获取工作目录，请确认 Agent 已连接');
    return;
  }
  workspaceRoot = root;
  pathHistory = [];
  navigateToPath(root);
}

/**
 * 导航到指定路径
 */
async function navigateToPath(path) {
  currentPath = path;
  selectedPaths.clear();
  updateBreadcrumb();
  updateBackButton();
  updateDownloadBtn();
  updateSortIndicators();
  await loadDirectory(path);
}

// 目录列表 LRU 缓存（key: path, value: { entries, timestamp }）
const dirCache = new Map();
const DIR_CACHE_TTL = 30000; // 30秒
const DIR_CACHE_MAX = 20;

/**
 * 加载目录内容（带 LRU 缓存）
 */
async function loadDirectory(dirPath) {
  const content = document.getElementById('workspacePanelContent');
  content.innerHTML = '<div class="workspace-panel-loading">加载中...</div>';

  // 查缓存
  const cached = dirCache.get(dirPath);
  if (cached && Date.now() - cached.timestamp < DIR_CACHE_TTL) {
    cachedEntries = cached.entries;
    renderCurrentEntries();
    return;
  }

  const result = await listDirectory(dirPath);
  if (!result.success) {
    showError(result.error || '加载目录失败');
    return;
  }

  cachedEntries = (result.entries || []).map(e => ({
    ...e,
    path: `${dirPath}/${e.name}`.replace(/\/+/g, '/')
  }));
  // 写缓存 + 简单 LRU 淘汰
  dirCache.set(dirPath, { entries: cachedEntries, timestamp: Date.now() });
  if (dirCache.size > DIR_CACHE_MAX) {
    dirCache.delete(dirCache.keys().next().value);
  }
  renderCurrentEntries();
}

/** 失效指定路径的目录缓存 */
function invalidateDirCache(path) {
  dirCache.delete(path);
}

/**
 * 按当前排序渲染条目
 */
function renderCurrentEntries() {
  const content = document.getElementById('workspacePanelContent');
  let entries = [];

  if (isSearchMode) {
    entries = searchResults;
  } else {
    entries = [...cachedEntries];
  }

  if (entries.length === 0) {
    content.innerHTML = isSearchMode ? '<div class="workspace-panel-empty">未找到匹配的文件</div>' : '<div class="workspace-panel-empty">此目录为空</div>';
    return;
  }

  const dirs = entries.filter(e => e.type === 'directory');
  const files = entries.filter(e => e.type !== 'directory');

  const sortFn = (a, b) => {
    let cmp;
    if (currentSort.field === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (currentSort.field === 'size') {
      if (a.type === 'directory' && b.type !== 'directory') return currentSort.asc ? -1 : 1;
      if (a.type !== 'directory' && b.type === 'directory') return currentSort.asc ? 1 : -1;
      cmp = (a.size || 0) - (b.size || 0);
    } else {
      cmp = (a.mtime || 0) - (b.mtime || 0);
    }
    return currentSort.asc ? cmp : -cmp;
  };

  const sortedDirs = dirs.sort(sortFn);
  const sortedFiles = files.sort(sortFn);

  let sorted;
  if (currentSort.field === 'name') {
    sorted = currentSort.asc ? [...sortedDirs, ...sortedFiles] : [...sortedFiles.reverse(), ...sortedDirs.reverse()];
  } else {
    sorted = [...sortedDirs, ...sortedFiles];
  }

  let html = '<div class="workspace-file-list">';
  for (const entry of sorted) {
    const icon = getFileIcon(entry.name, entry.type);
    const size = entry.type === 'directory' ? '—' : formatFileSize(entry.size);
    const time = formatTime(entry.mtime);
    const canPreview = entry.type === 'file' && supportsPreview(entry.name);
    const fullPath = isSearchMode ? entry.fullPath : `${currentPath}/${entry.name}`.replace(/\/+/g, '/');
    const isSelected = selectedPaths.has(fullPath);
    const relativePath = isSearchMode && entry.matchPath !== currentPath ? 
      entry.matchPath.replace(workspaceRoot, '').replace(/^\//, '') + '/' : '';

    html += `
      <div class="workspace-file-item ${entry.type} ${isSelected ? 'selected' : ''}" data-path="${escapeHtml(fullPath)}" data-type="${entry.type}" data-name="${escapeHtml(entry.name)}">
        <span class="workspace-file-select" data-action="select">
          <span class="workspace-checkbox ${isSelected ? 'checked' : ''}"></span>
        </span>
        <span class="workspace-file-icon">${icon}</span>
        <span class="workspace-file-name" title="${escapeHtml(relativePath + entry.name)}">${escapeHtml(relativePath + entry.name)}</span>
        <span class="workspace-file-size">${size}</span>
        <span class="workspace-file-time">${time}</span>
        <span class="workspace-file-actions">
          ${canPreview ? '<button class="workspace-file-btn preview" title="预览" data-action="preview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>' : ''}
          <button class="workspace-file-btn download" title="下载" data-action="download"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
          <button class="workspace-file-btn ask" title="基于文件问答" data-action="ask"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></button>
          <button class="workspace-file-btn delete" title="删除" data-action="delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
        </span>
      </div>`;
  }
  html += '</div>';
  content.innerHTML = html;
}

/**
 * 处理文件列表点击
 */
async function handleFileListClick(e) {
  const item = e.target.closest('.workspace-file-item');
  if (!item) return;

  const path = item.dataset.path;
  const type = item.dataset.type;
  const actionBtn = e.target.closest('[data-action]');

  // 处理 checkbox 选择
  const selectEl = e.target.closest('.workspace-file-select');
  if (selectEl) {
    e.stopPropagation();
    toggleSelection(path);
    return;
  }

  if (actionBtn) {
    const action = actionBtn.dataset.action;
    e.stopPropagation();
    if (action === 'preview') {
      await previewFile(path, item.dataset.name);
    } else if (action === 'download') {
      await doDownloadSingle(path, item.dataset.name);
    } else if (action === 'ask') {
      await attachFilesForQuestion([path]);
    } else if (action === 'delete') {
      await handleDeleteFile(path, item.dataset.name, type);
    }
    return;
  }

  // Ctrl/Cmd + 单击：复制文件名
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
    e.stopPropagation();
    navigator.clipboard.writeText(item.dataset.name).then(() => {
      showToast(`已复制文件名: ${item.dataset.name}`);
    }).catch(() => {
      showToast('复制失败', 'error');
    });
    return;
  }

  // Ctrl/Cmd + Shift + 单击：复制完整路径
  if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
    e.stopPropagation();
    navigator.clipboard.writeText(path).then(() => {
      showToast(`已复制路径: ${path}`);
    }).catch(() => {
      showToast('复制失败', 'error');
    });
    return;
  }

  // 点击目录：进入
  if (type === 'directory') {
    e.stopPropagation();
    pathHistory.push(currentPath);
    await navigateToPath(path);
    return;
  }

  // 点击文件：预览或下载
  if (supportsPreview(item.dataset.name)) {
    await previewFile(path, item.dataset.name);
  } else {
    await doDownloadSingle(path, item.dataset.name);
  }
}

/**
 * 切换选择状态（增量更新 DOM，避免全量重建）
 */
function toggleSelection(path) {
  if (selectedPaths.has(path)) {
    selectedPaths.delete(path);
  } else {
    selectedPaths.add(path);
  }
  updateDownloadBtn();
  updateSelectAllState();
  // 增量更新对应行，不重建整个列表
  const item = Array.from(document.querySelectorAll('.workspace-file-item'))
    .find(el => el.dataset.path === path);
  if (item) {
    const isSelected = selectedPaths.has(path);
    item.classList.toggle('selected', isSelected);
    const cb = item.querySelector('.workspace-checkbox');
    if (cb) cb.classList.toggle('checked', isSelected);
  }
}

/**
 * 全选/取消全选（增量更新）
 */
function toggleSelectAll() {
  const allPaths = cachedEntries.map(e => `${currentPath}/${e.name}`.replace(/\/+/g, '/'));
  const allSelected = allPaths.length > 0 && allPaths.every(p => selectedPaths.has(p));

  if (allSelected) {
    for (const p of allPaths) selectedPaths.delete(p);
  } else {
    for (const p of allPaths) selectedPaths.add(p);
  }
  updateDownloadBtn();
  updateSelectAllState();
  // 增量更新所有行
  for (const item of document.querySelectorAll('.workspace-file-item')) {
    const isSelected = selectedPaths.has(item.dataset.path);
    item.classList.toggle('selected', isSelected);
    const cb = item.querySelector('.workspace-checkbox');
    if (cb) cb.classList.toggle('checked', isSelected);
  }
}

/**
 * 更新全选 checkbox 状态
 */
function updateSelectAllState() {
  const allPaths = cachedEntries.map(e => `${currentPath}/${e.name}`.replace(/\/+/g, '/'));
  const selectAll = document.getElementById('workspaceSelectAll');
  if (!selectAll) return;
  const checkbox = selectAll.querySelector('.workspace-checkbox');
  if (allPaths.length === 0) {
    checkbox.classList.remove('checked');
    checkbox.classList.add('indeterminate');
  } else if (allPaths.every(p => selectedPaths.has(p))) {
    checkbox.classList.add('checked');
    checkbox.classList.remove('indeterminate');
  } else if (allPaths.some(p => selectedPaths.has(p))) {
    checkbox.classList.remove('checked');
    checkbox.classList.add('indeterminate');
  } else {
    checkbox.classList.remove('checked');
    checkbox.classList.remove('indeterminate');
  }
}

/**
 * 更新排序指示器
 */
function updateSortIndicators() {
  ['name', 'size', 'time'].forEach(f => {
    const el = document.getElementById(`sort${f.charAt(0).toUpperCase() + f.slice(1)}Indicator`);
    if (!el) return;
    if (currentSort.field === f) {
      el.textContent = currentSort.asc ? '▲' : '▼';
    } else {
      el.textContent = '';
    }
  });
}

/**
 * 预览文件
 */
const PREVIEW_MAX_SIZE = 1024 * 1024;   // 预览文件大小上限 1MB
const PREVIEW_MAX_LINES = 10000;         // 预览最大渲染行数

async function previewFile(filePath, fileName) {
  const previewArea = document.getElementById('workspacePreviewArea');
  const previewContent = document.getElementById('workspacePreviewContent');
  const previewFilename = document.getElementById('workspacePreviewFilename');
  const lineCountEl = document.getElementById('workspacePreviewLineCount');
  const copyBtn = document.getElementById('workspacePreviewCopyBtn');
  const downloadBtn = document.getElementById('workspacePreviewDownloadBtn');

  previewFilename.textContent = fileName;
  lineCountEl.textContent = '';
  previewContent.innerHTML = '<div class="workspace-panel-loading">加载中...</div>';
  previewArea.style.display = 'flex';
  copyBtn.style.display = '';
  downloadBtn.style.display = '';

  // 存储当前预览文件路径供下载/复制使用
  previewArea.dataset.previewPath = filePath;
  previewArea.dataset.previewName = fileName;

  // 大文件保护：从缓存中获取文件大小，超限则拒绝预览
  const entry = cachedEntries.find(e => e.path === filePath)
    || searchResults.find(e => e.fullPath === filePath);
  const fileSize = entry ? entry.size : 0;
  if (fileSize > PREVIEW_MAX_SIZE) {
    previewContent.innerHTML = `<div class="workspace-panel-error">文件过大 (${formatFileSize(fileSize)})，不支持预览，请直接下载</div>`;
    return;
  }

  // 文本文件预览
  const result = await readFileContent(filePath);
  if (result.success) {
    const lang = getLanguageClass(fileName);
    const text = result.content || '';
    const lines = text.split('\n');
    lineCountEl.textContent = `${lines.length} 行`;

    // 超大行数截断保护，避免创建过多 DOM 节点
    const truncated = lines.length > PREVIEW_MAX_LINES;
    const displayLines = truncated ? lines.slice(0, PREVIEW_MAX_LINES) : lines;

    let numberedHtml = '<table class="workspace-preview-code-table"><tbody>';
    for (let i = 0; i < displayLines.length; i++) {
      numberedHtml += `<tr><td class="line-num">${i + 1}</td><td class="line-content"><code class="${lang}">${escapeHtml(displayLines[i])}</code></td></tr>`;
    }
    if (truncated) {
      numberedHtml += `<tr><td class="line-num">…</td><td class="line-content"><code>（仅显示前 ${PREVIEW_MAX_LINES} 行，共 ${lines.length} 行，请下载查看完整内容）</code></td></tr>`;
    }
    numberedHtml += '</tbody></table>';
    previewContent.innerHTML = numberedHtml;
  } else {
    previewContent.innerHTML = `<div class="workspace-panel-error">预览失败: ${escapeHtml(result.error || '未知错误')}</div>`;
  }
}

/**
 * 复制预览内容
 */
async function copyPreviewContent() {
  const previewArea = document.getElementById('workspacePreviewArea');
  const filePath = previewArea.dataset.previewPath;
  if (!filePath) return;

  const result = await readFileContent(filePath);
  if (result.success) {
    try {
      await navigator.clipboard.writeText(result.content || '');
      showToast('已复制到剪贴板', 'success');
    } catch {
      showToast('复制失败，请手动选择复制', 'error');
    }
  } else {
    showToast('获取内容失败', 'error');
  }
}

/**
 * 下载预览中的文件
 */
async function downloadPreviewFile() {
  const previewArea = document.getElementById('workspacePreviewArea');
  const filePath = previewArea.dataset.previewPath;
  const fileName = previewArea.dataset.previewName;
  if (!filePath) return;
  await doDownloadSingle(filePath, fileName);
}

/**
 * 关闭预览
 */
function closePreview() {
  const previewArea = document.getElementById('workspacePreviewArea');
  previewArea.style.display = 'none';
  document.getElementById('workspacePreviewContent').innerHTML = '';
}

/**
 * 下载单个文件/目录（流式，避免 base64 膨胀）
 */
async function doDownloadSingle(filePath, fileName) {
  try {
    const result = await downloadFileStream(filePath);
    if (!result.success) {
      showToast(`下载失败: ${result.error}`, 'error');
      return;
    }
    triggerBrowserDownload(result.blob, result.name || fileName);
    showToast(`已开始下载: ${result.name || fileName}`, 'success');
  } catch (err) {
    showToast(`下载失败: ${err.message}`, 'error');
  }
}

/**
 * 下载选中的文件/目录（多选时在后端打包为 ZIP）
 */
async function downloadSelected() {
  if (selectedPaths.size === 0) return;

  const paths = Array.from(selectedPaths);
  if (paths.length === 1) {
    const name = paths[0].split('/').pop();
    await doDownloadSingle(paths[0], name);
    return;
  }

  showToast('正在打包...', 'info');
  try {
    const result = await downloadFilesStream(paths);
    if (result.success && result.blob) {
      triggerBrowserDownload(result.blob, result.name || 'workspace.zip');
      showToast(`已下载 ${paths.length} 个文件（ZIP 压缩包）`, 'success');
    } else {
      showToast(`打包失败: ${result.error || '未知错误'}`, 'error');
    }
  } catch (err) {
    showToast(`打包失败: ${err.message}`, 'error');
  }
}

/**
 * 触发浏览器下载（直接使用 Blob，无需 base64 解码）
 */
function triggerBrowserDownload(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

/**
 * 触发文件上传对话框
 */
function triggerUpload() {
  const fileInput = document.getElementById('workspaceFileInput');
  if (fileInput) {
    fileInput.click();
  }
}

/**
 * 处理文件上传（按钮触发）
 */
async function handleFileUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  // 先转数组，防止 input.value='' 清空 FileList 后引用失效
  const fileArr = Array.from(files);
  e.target.value = '';
  await uploadFiles(fileArr);
}

/**
 * 上传文件到当前目录（并发，限并发数 3）
 */
async function uploadFiles(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;

  const config = await getAgentConfig();
  if (!config) {
    showToast('Agent 未连接，无法上传', 'error');
    return;
  }

  let successCount = 0;
  let failCount = 0;
  const CONCURRENCY = 3;

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(async (file) => {
      const reader = new FileReader();
      const content = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const targetPath = `${currentPath}/${file.name}`.replace(/\/+/g, '/');
      const resp = await fetch(`${config.url}/api/fs/write`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.token}`
        },
        body: JSON.stringify({ path: targetPath, content, encoding: 'base64' })
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || '上传失败');
    }));
    for (const r of results) {
      if (r.status === 'fulfilled') successCount++;
      else failCount++;
    }
  }

  if (successCount > 0) showToast(`成功上传 ${successCount} 个文件`, 'success');
  if (failCount > 0) showToast(`${failCount} 个文件上传失败`, 'error');
  if (successCount > 0) {
    await refreshCurrent();
    scrollToNewFile(files[files.length - 1].name);
  }
}

/**
 * 设置拖拽上传
 */
function setupDragDrop() {
  const panel = document.getElementById('workspacePanel');
  if (!panel) return;

  panel.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    panel.classList.add('drag-over');
  });

  panel.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    panel.classList.remove('drag-over');
  });

  panel.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    panel.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    await uploadFiles(files);
  });
}

/**
 * 返回上级目录
 */
async function navigateBack() {
  if (pathHistory.length === 0) return;
  const prevPath = pathHistory.pop();
  selectedPaths.clear();
  await navigateToPath(prevPath);
}

/**
 * 刷新当前目录
 */
async function refreshCurrent() {
  if (currentPath) {
    invalidateDirCache(currentPath);
    selectedPaths.clear();
    updateDownloadBtn();
    await loadDirectory(currentPath);
    closePreview();
  }
}

/**
 * 更新面包屑
 */
function updateBreadcrumb() {
  const el = document.getElementById('workspaceBreadcrumb');
  if (!currentPath) {
    el.innerHTML = '';
    return;
  }

  const parts = currentPath.split('/').filter(Boolean);
  let html = '';
  let accumulatedPath = '';
  for (let i = 0; i < parts.length; i++) {
    accumulatedPath += '/' + parts[i];
    const isLast = i === parts.length - 1;
    const isClickable = !workspaceRoot || accumulatedPath === workspaceRoot || accumulatedPath.startsWith(workspaceRoot + '/');
    if (i > 0) html += '<span class="workspace-breadcrumb-sep">/</span>';
    if (isLast) {
      html += `<span class="workspace-breadcrumb-current">${escapeHtml(parts[i])}</span>`;
    } else if (isClickable) {
      html += `<span class="workspace-breadcrumb-link" data-path="${escapeHtml(accumulatedPath)}">${escapeHtml(parts[i])}</span>`;
    } else {
      html += `<span class="workspace-breadcrumb-disabled">${escapeHtml(parts[i])}</span>`;
    }
  }
  el.innerHTML = html || '<span class="workspace-breadcrumb-current">/</span>';

  el.querySelectorAll('.workspace-breadcrumb-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.stopPropagation();
      const targetPath = link.dataset.path;
      const idx = pathHistory.findIndex(p => p === targetPath);
      if (idx >= 0) {
        pathHistory = pathHistory.slice(0, idx);
      } else {
        pathHistory = [];
      }
      selectedPaths.clear();
      await navigateToPath(targetPath);
    });
  });
}

function updateBackButton() {
  const btn = document.getElementById('workspaceBackBtn');
  const belowRoot = workspaceRoot && currentPath && (currentPath !== workspaceRoot);
  btn.disabled = !belowRoot;
}

function showError(msg) {
  const content = document.getElementById('workspacePanelContent');
  content.innerHTML = `<div class="workspace-panel-error">${escapeHtml(msg)}</div>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLanguageClass(fileName) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const map = {
    js: 'javascript', mjs: 'javascript', ts: 'typescript', jsx: 'jsx', tsx: 'tsx',
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
    py: 'python', java: 'java', c: 'c', cpp: 'cpp', h: 'c',
    go: 'go', rs: 'rust', rb: 'ruby', php: 'php',
    sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
    md: 'markdown', vue: 'html', svelte: 'html',
  };
  return map[ext] ? `language-${map[ext]}` : '';
}

export async function refreshWorkspacePanel() {
  if (currentPath) {
    await loadDirectory(currentPath);
  }
}

export function updateWorkspacePanelVisibility(connected) {
  const container = document.getElementById('workspacePanelContainer');
  if (!container) return;

  if (connected) {
    container.style.display = '';
  } else {
    container.style.display = 'none';
    closePanelInternal();
  }
}

function closePanelInternal() {
  const panel = document.getElementById('workspacePanel');
  const container = document.getElementById('workspacePanelContainer');
  if (panel) panel.classList.remove('expanded');
  if (container) {
    container.classList.remove('hover-expanded');
    container.classList.remove('click-opened');
  }
  closePreview();
}

let searchQuery = '';
let searchResults = [];
let isSearchMode = false;

function handleSearchInput(e) {
  searchQuery = e.target.value.trim();
  const clearBtn = document.getElementById('workspaceSearchClear');
  clearBtn.style.display = searchQuery ? '' : 'none';
}

async function performSearch() {
  if (!searchQuery) {
    isSearchMode = false;
    searchResults = [];
    renderCurrentEntries();
    return;
  }

  showToast('搜索中...', 'info');
  const results = await searchFilesRemote(currentPath, searchQuery);
  searchResults = results;
  isSearchMode = true;
  renderCurrentEntries();
}

function clearSearch() {
  const searchInput = document.getElementById('workspaceSearchInput');
  searchInput.value = '';
  searchQuery = '';
  isSearchMode = false;
  searchResults = [];
  document.getElementById('workspaceSearchClear').style.display = 'none';
  renderCurrentEntries();
}

async function handleDeleteFile(path, name, type) {
  const isDir = type === 'directory';
  
  const message = isDir 
    ? `确定要删除目录 "${name}" 及其所有内容吗？\n\n路径: ${path}\n类型: 目录\n\n此操作不可恢复！`
    : `确定要删除文件 "${name}" 吗？\n\n路径: ${path}\n类型: 文件\n\n此操作不可恢复！`;
  
  if (typeof window.showCustomConfirm !== 'function') {
    const confirmed = confirm(message);
    if (!confirmed) return;
  } else {
    const confirmed = await window.showCustomConfirm(message, '确认删除');
    if (!confirmed) return;
  }

  try {
    const config = await getAgentConfig();
    if (!config) {
      showToast('Agent 未连接', 'error');
      return;
    }

    const resp = await fetch(`${config.url}/api/fs/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      },
      body: JSON.stringify({ path })
    });
    const data = await resp.json();
    if (data.success) {
      showToast(`${isDir ? '目录' : '文件'} 已删除`, 'success');
      selectedPaths.delete(path);
      updateDownloadBtn();
      refreshCurrent();
    } else {
      showToast(`删除失败: ${data.error || '未知错误'}`, 'error');
    }
  } catch (err) {
    showToast(`删除失败: ${err.message}`, 'error');
  }
}

async function attachFilesForQuestion(paths) {
  const files = [];
  for (const path of paths) {
    const name = path.split('/').pop();
    let entry = cachedEntries.find(e => e.path === path);
    if (!entry) {
      entry = searchResults.find(e => e.fullPath === path);
    }
    const size = entry ? entry.size : 0;

    files.push({
      name,
      size,
      type: getMimeType(name),
      text: '',
      status: 'done',
      agentPath: path
    });
  }

  if (files.length === 0) return;

  for (const f of files) {
    const exists = state.attachedFiles.some(af => af.name === f.name && af.agentPath === f.agentPath);
    if (!exists) {
      state.attachedFiles.push(f);
    }
  }

  renderFilePreviews();
  showToast(`已添加 ${files.length} 个文件到问答`, 'success');
}

async function askSelectedFiles() {
  if (selectedPaths.size === 0) return;
  const paths = Array.from(selectedPaths);
  await attachFilesForQuestion(paths);
}

function scrollToNewFile(fileName, retryCount = 0) {
  const content = document.getElementById('workspacePanelContent');
  if (!content) return;

  // 用 dataset 精确匹配，避免 querySelector 选择器转义问题
  const item = Array.from(content.querySelectorAll('.workspace-file-item'))
    .find(el => el.dataset.name === fileName);

  if (item) {
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    item.classList.add('highlight-new');
    setTimeout(() => item.classList.remove('highlight-new'), 2000);
  } else if (retryCount < 5) {
    setTimeout(() => scrollToNewFile(fileName, retryCount + 1), 150);
  }
}

function updateAskBtn() {
  const btn = document.getElementById('workspaceAskBtn');
  btn.disabled = selectedPaths.size === 0;
}

function updateDownloadBtn() {
  const btn = document.getElementById('workspaceDownloadDirBtn');
  const countEl = document.getElementById('workspaceSelectedCount');
  btn.disabled = selectedPaths.size === 0;
  if (selectedPaths.size > 0) {
    countEl.style.display = '';
    countEl.textContent = `已选 ${selectedPaths.size}`;
  } else {
    countEl.style.display = 'none';
  }
  updateAskBtn();
}
