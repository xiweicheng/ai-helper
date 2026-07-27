// workspace-panel.js - 工作目录文件管理器 UI

import {
  getWorkspaceRoot, resetWorkspaceRoot, getAgentConfig,
  listDirectory, readFileContent,
  downloadFileStream, downloadFilesStream,
  downloadFileStreamWithProgress, downloadFilesStreamWithProgress,
  searchFilesRemote,
  renameFs, createDir, moveFs, deleteFs, getFileInfo,
  getFileIcon, formatFileSize, formatTime,
  supportsPreview, getPreviewType, getMimeType
} from './workspace-manager.js';
import logger from '../shared/logger.js';
import { showToast, copyToClipboard } from './utils.js';
import state from './state.js';
import { renderFilePreviews } from './file-extract.js';
import { renderImagePreviews } from './image-helpers.js';
import { formatMarkdown, renderMermaidCharts, addCodeCopyButtons, addMermaidControls, addTableToolbarEvents } from './markdown-render.js';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

import DOMPurify from 'dompurify';

// 配置 PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';


// 当前浏览路径
let currentPath = null;
// 工作目录根路径
let workspaceRoot = null;
// 路径历史（用于返回上级）
let pathHistory = [];
// 路径历史最大长度，超出时丢弃最早的（防止无限增长）
const PATH_HISTORY_MAX = 50;
// 是否已初始化
let initialized = false;
// 当前排序：{ field: 'name'|'size'|'time', asc: boolean }
let currentSort = { field: 'name', asc: true };
// 选中要下载的文件/目录集合
let selectedPaths = new Set();
// 下载进行中标记
let downloadInProgress = false;
let uploadInProgress = false;
// 键盘导航：当前聚焦的文件项索引（-1 表示无聚焦）
let focusedIndex = -1;

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
          <span class="workspace-agent-name" id="workspaceAgentName"></span>
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
        <button class="workspace-toolbar-btn" id="workspaceNewFolderBtn" title="新建文件夹">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
        <button class="workspace-toolbar-btn" id="workspaceAskBtn" title="基于选中的文件进行问答" style="display:none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>
        <button class="workspace-toolbar-btn" id="workspaceDownloadDirBtn" title="下载选中的文件/目录（多选打包为ZIP）" style="display:none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
        </button>
        <button class="workspace-toolbar-btn" id="workspaceBatchDeleteBtn" title="删除选中的文件" style="display:none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
        </button>
        <span class="workspace-toolbar-selected" id="workspaceSelectedCount" style="display:none;"></span>
        <div class="workspace-search-box">
          <input type="text" id="workspaceSearchInput" placeholder="搜索..." />
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
          <button class="workspace-preview-md-toggle-btn" id="workspacePreviewMdToggleBtn" title="切换渲染预览" style="display:none;">
            <span class="workspace-preview-md-toggle-label">预览</span>
          </button>
          <button class="workspace-preview-download-btn" id="workspacePreviewDownloadBtn" title="下载文件">下载</button>
          <button class="workspace-preview-download-btn" id="workspacePreviewOpenBrowserBtn" title="在浏览器中打开" style="display:none">在浏览器中打开</button>
          <button class="workspace-preview-fullscreen-btn" id="workspacePreviewFullscreenBtn" title="全屏预览" style="display:none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          </button>
          <button class="workspace-preview-close" id="workspacePreviewClose" title="关闭预览">×</button>
        </div>
        <div class="workspace-preview-content" id="workspacePreviewContent"></div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  bindEvents();
  loadSearchHistory();
  updateWorkspaceAgentName();
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
  document.getElementById('workspaceNewFolderBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    handleNewFolder();
  });
  document.getElementById('workspaceAskBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    askSelectedFiles();
  });
  document.getElementById('workspaceDownloadDirBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    downloadSelected();
  });
  document.getElementById('workspaceBatchDeleteBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    handleBatchDelete();
  });

  // 搜索框
  const searchInput = document.getElementById('workspaceSearchInput');
  const toolbar = document.getElementById('workspaceToolbar');
  const searchBox = toolbar.querySelector('.workspace-search-box');

  function shouldCollapseToolbar() {
    const toolbarWidth = toolbar.clientWidth;
    const minWidthWithButtons = 120 + 28 * 2 + 4 * 3;
    return toolbarWidth < minWidthWithButtons;
  }

  function updateSearchExpanded() {
    if (searchInput.value.trim()) {
      searchBox.classList.add('search-box-expanded');
      if (shouldCollapseToolbar()) {
        toolbar.classList.add('search-focused');
      }
    } else {
      searchBox.classList.remove('search-box-expanded');
      toolbar.classList.remove('search-focused');
    }
  }

  searchInput.addEventListener('input', (e) => {
    handleSearchInput(e);
    updateSearchExpanded();
  });
  searchInput.addEventListener('focus', () => {
    if (shouldCollapseToolbar()) {
      toolbar.classList.add('search-focused');
    }
  });
  searchInput.addEventListener('blur', () => {
    if (!searchInput.value.trim()) {
      toolbar.classList.remove('search-focused');
    }
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      performSearch();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      clearSearch();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchHistory.length === 0) return;
      if (searchHistoryIndex === -1) {
        searchHistoryIndex = searchHistory.length - 1;
      } else if (searchHistoryIndex > 0) {
        searchHistoryIndex--;
      }
      searchInput.value = searchHistory[searchHistoryIndex];
      searchQuery = searchInput.value.trim();
      document.getElementById('workspaceSearchClear').style.display = searchQuery ? '' : 'none';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchHistoryIndex === -1 || searchHistoryIndex >= searchHistory.length - 1) {
        searchHistoryIndex = -1;
        searchInput.value = '';
        searchQuery = '';
        document.getElementById('workspaceSearchClear').style.display = 'none';
      } else {
        searchHistoryIndex++;
        searchInput.value = searchHistory[searchHistoryIndex];
        searchQuery = searchInput.value.trim();
        document.getElementById('workspaceSearchClear').style.display = searchQuery ? '' : 'none';
      }
    }
  });
  document.getElementById('workspaceSearchBtn').addEventListener('click', () => {
    searchInput.focus();
    performSearch();
  });
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
  // 键盘导航（↑↓浏览、Enter打开、Delete删除、F2重命名、Space选择）
  document.getElementById('workspacePanelContent').addEventListener('keydown', handleFileListKeydown);
  // content 需要 tabindex 才能获得键盘焦点
  document.getElementById('workspacePanelContent').tabIndex = 0;

  // 拖拽文件/目录到聊天输入框（事件委托）
  document.getElementById('workspacePanelContent').addEventListener('dragstart', handleFileListDragStart);

  // 虚拟滚动：scroll 事件触发重新渲染（requestAnimationFrame 节流）
  let scrollRafId = null;
  document.getElementById('workspacePanelContent').addEventListener('scroll', () => {
    if (!virtualScrollState) return;
    if (scrollRafId) cancelAnimationFrame(scrollRafId);
    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = null;
      renderVirtualScroll();
    });
  });

  // 预览关闭
  document.getElementById('workspacePreviewClose').addEventListener('click', closePreview);
  document.getElementById('workspacePreviewCopyBtn').addEventListener('click', copyPreviewContent);
  document.getElementById('workspacePreviewDownloadBtn').addEventListener('click', downloadPreviewFile);
  document.getElementById('workspacePreviewOpenBrowserBtn').addEventListener('click', openPreviewInBrowser);
  document.getElementById('workspacePreviewFullscreenBtn').addEventListener('click', togglePreviewFullscreen);
  document.getElementById('workspacePreviewMdToggleBtn').addEventListener('click', toggleMarkdownPreview);
  
  // 预览标题快捷键：Ctrl/Cmd + 单击复制文件名，Ctrl/Cmd + Shift + 单击复制完整路径
  document.getElementById('workspacePreviewFilename').addEventListener('click', async (e) => {
    const previewArea = document.getElementById('workspacePreviewArea');
    const fileName = previewArea.dataset.previewName;
    const filePath = previewArea.dataset.previewPath;
    if (!fileName) return;
    
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(fileName);
        showToast(`已复制文件名: ${fileName}`);
      } catch {
        showToast('复制失败', 'error');
      }
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      if (!filePath) return;
      try {
        await navigator.clipboard.writeText(filePath);
        showToast(`已复制路径: ${filePath}`);
      } catch {
        showToast('复制失败', 'error');
      }
    }
  });

  // 拖拽支持
  setupDragDrop();

  // 监听 Agent 切换/断开
  chrome.storage.local.onChanged.addListener(handleStorageChange);

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
 * 压入路径历史（限制最大长度，超出时丢弃最早的）
 */
function pushPathHistory(path) {
  pathHistory.push(path);
  if (pathHistory.length > PATH_HISTORY_MAX) {
    pathHistory.shift();
  }
}

/**
 * 清洗文件名：过滤 Windows/Unix 非法字符，去首尾空格和点
 * 非法字符替换为下划线，避免上传后文件名异常或导致后端错误
 */
function sanitizeFileName(name) {
  if (!name || typeof name !== 'string') return 'unnamed';
  // Windows 非法字符：< > : " | ? * 以及控制字符
  // 路径分隔符 / \ 也过滤掉，防止路径注入
  let cleaned = name.replace(/[<>:"|?*\\/\x00-\x1f]/g, '_');
  // 保留扩展名前的点，去掉文件名主体中多余的点（仅末尾连续点在 Windows 上非法）
  cleaned = cleaned.replace(/\.+$/, '');
  // 去首尾空格
  cleaned = cleaned.trim();
  // 空名兜底
  if (!cleaned) cleaned = 'unnamed';
  return cleaned;
}

/**
 * 高亮搜索关键词：先转义 HTML，再用 <mark> 包裹匹配部分（大小写不敏感）
 */
function highlightSearchMatch(text, query) {
  const escaped = escapeHtml(text);
  if (!query) return escaped;
  // 转义正则特殊字符
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(`(${escapedQuery})`, 'gi'), '<mark class="search-highlight">$1</mark>');
}

/**
 * 展开面板
 */
async function openPanel() {
  const panel = document.getElementById('workspacePanel');
  if (panel.classList.contains('expanded')) return;
  panel.classList.add('expanded');
  await updateWorkspaceAgentName();
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
  if (isSearchMode && searchQuery) {
    const results = await searchFilesRemote(path, searchQuery);
    searchResults = results;
    renderCurrentEntries();
  } else {
    await loadDirectory(path);
  }
  updateSelectAllState();
}

// 目录列表 LRU 缓存（key: path, value: { entries, timestamp }）
// Map 保持插入顺序，访问时 delete+re-set 移到末尾（最近使用），淘汰时删头部（最久未用）
const dirCache = new Map();
const DIR_CACHE_TTL = 30000; // 30秒
const DIR_CACHE_MAX = 20;

/**
 * LRU 读取：命中时把 key 移到 Map 末尾（最近使用），未命中返回 null
 */
function getDirCache(path) {
  const cached = dirCache.get(path);
  if (!cached) return null;
  if (Date.now() - cached.timestamp >= DIR_CACHE_TTL) {
    dirCache.delete(path);
    return null;
  }
  // 移到末尾：先删再 set
  dirCache.delete(path);
  dirCache.set(path, cached);
  return cached;
}

/**
 * LRU 写入：超出上限时淘汰 Map 头部（最久未访问的）
 */
function setDirCache(path, value) {
  if (dirCache.has(path)) dirCache.delete(path);
  dirCache.set(path, value);
  if (dirCache.size > DIR_CACHE_MAX) {
    dirCache.delete(dirCache.keys().next().value);
  }
}

/**
 * 加载目录内容（带 LRU 缓存）
 */
async function loadDirectory(dirPath) {
  const content = document.getElementById('workspacePanelContent');
  content.innerHTML = '<div class="workspace-panel-loading">加载中...</div>';

  // 查缓存（LRU：命中时自动移到末尾）
  const cached = getDirCache(dirPath);
  if (cached) {
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
    path: normalizePath(`${dirPath}/${e.name}`)
  }));
  setDirCache(dirPath, { entries: cachedEntries, timestamp: Date.now() });
  renderCurrentEntries();
}

/**
 * 规范化路径（统一使用 / 分隔符，处理 Windows \ 和 Linux /）
 */
function normalizePath(p) {
  return (p || '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

/** 失效指定路径的目录缓存 */
function invalidateDirCache(path) {
  dirCache.delete(path);
}

// 虚拟滚动：文件项超过阈值时只渲染可视区域，用 padding 撑起总高度
const VIRTUAL_SCROLL_THRESHOLD = 200;
const VIRTUAL_ITEM_HEIGHT = 32;  // 初始估算行高（padding 7+7 + 内容 ~13 + border 2），首次渲染后动态测量
const VIRTUAL_BUFFER = 5;        // 可视区域上下各多渲染的缓冲行数
// 虚拟滚动状态：{ sorted, itemHeight } —— 非 null 时表示当前处于虚拟滚动模式
let virtualScrollState = null;
// 当前排序后的完整列表（虚拟滚动滚动时复用，避免重复排序）
let sortedEntriesCache = [];

/**
 * 生成单个文件项的 HTML
 */
function renderFileItemHtml(entry) {
  const icon = getFileIcon(entry.name, entry.type);
  const size = entry.type === 'directory' ? '—' : formatFileSize(entry.size);
  const time = formatTime(entry.mtime);
  const canPreview = entry.type === 'file' && supportsPreview(entry.name);
  const fullPath = isSearchMode ? entry.fullPath : normalizePath(`${currentPath}/${entry.name}`);
  const isSelected = selectedPaths.has(fullPath);
  // 搜索结果仅用于 tooltip 显示完整路径，不在名称前拼接层级
  const searchTooltip = isSearchMode && entry.matchPath !== currentPath ?
    entry.matchPath.replace(workspaceRoot, '').replace(/^\//, '') + '/' + entry.name : '';
  const nameHtml = isSearchMode
    ? highlightSearchMatch(entry.name, searchQuery)
    : escapeHtml(entry.name);

  return `
    <div class="workspace-file-item ${entry.type} ${isSelected ? 'selected' : ''}" data-path="${escapeHtml(fullPath)}" data-type="${entry.type}" data-name="${escapeHtml(entry.name)}" draggable="true">
      <span class="workspace-file-select" data-action="select">
        <span class="workspace-checkbox ${isSelected ? 'checked' : ''}"></span>
      </span>
      <span class="workspace-file-icon">${icon}</span>
      <span class="workspace-file-name" title="${escapeHtml(searchTooltip || entry.name)}">${nameHtml}</span>
      <span class="workspace-file-size">${size}</span>
      <span class="workspace-file-time">${time}</span>
      <span class="workspace-file-actions">
        ${canPreview ? '<button class="workspace-file-btn preview" title="预览" data-action="preview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>' : ''}
        <button class="workspace-file-btn info" title="详情" data-action="info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button>
        <button class="workspace-file-btn download" title="下载" data-action="download"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
        <button class="workspace-file-btn rename" title="重命名" data-action="rename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
        <button class="workspace-file-btn ask" title="基于文件问答" data-action="ask"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></button>
        <button class="workspace-file-btn delete" title="删除" data-action="delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
      </span>
    </div>`;
}

/**
 * 虚拟滚动：只渲染可视区域 + 缓冲区的文件项
 */
function renderVirtualScroll() {
  if (!virtualScrollState) return;
  const { sorted } = virtualScrollState;
  const content = document.getElementById('workspacePanelContent');
  const containerHeight = content.clientHeight;
  const scrollTop = content.scrollTop;
  const itemHeight = virtualScrollState.itemHeight;

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - VIRTUAL_BUFFER);
  const endIndex = Math.min(sorted.length, Math.ceil((scrollTop + containerHeight) / itemHeight) + VIRTUAL_BUFFER);
  const topPad = startIndex * itemHeight;
  const bottomPad = (sorted.length - endIndex) * itemHeight;

  let html = `<div class="workspace-file-list" style="padding-top:${topPad}px;padding-bottom:${bottomPad}px;">`;
  for (let i = startIndex; i < endIndex; i++) {
    html += renderFileItemHtml(sorted[i]);
  }
  html += '</div>';
  content.innerHTML = html;

  // 首次渲染后动态测量实际行高，修正估算值
  const firstItem = content.querySelector('.workspace-file-item');
  if (firstItem) {
    const actualHeight = firstItem.offsetHeight;
    if (actualHeight && Math.abs(actualHeight - itemHeight) > 2) {
      virtualScrollState.itemHeight = actualHeight;
      // 用正确行高重新渲染一次
      const newStart = Math.max(0, Math.floor(scrollTop / actualHeight) - VIRTUAL_BUFFER);
      const newEnd = Math.min(sorted.length, Math.ceil((scrollTop + containerHeight) / actualHeight) + VIRTUAL_BUFFER);
      const newTop = newStart * actualHeight;
      const newBottom = (sorted.length - newEnd) * actualHeight;
      let rehtml = `<div class="workspace-file-list" style="padding-top:${newTop}px;padding-bottom:${newBottom}px;">`;
      for (let i = newStart; i < newEnd; i++) {
        rehtml += renderFileItemHtml(sorted[i]);
      }
      rehtml += '</div>';
      content.innerHTML = rehtml;
    }
  }

  // 更新键盘焦点
  updateFocusVisual();
  // 恢复行内进度条（虚拟滚动重渲染后 DOM 被重建，需要恢复活跃的进度条）
  restoreInlineProgress();
}

/**
 * 按当前排序渲染条目（大目录自动启用虚拟滚动）
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
    virtualScrollState = null;
    sortedEntriesCache = [];
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

  sortedEntriesCache = sorted;
  focusedIndex = -1;

  // 大目录：虚拟滚动
  if (sorted.length > VIRTUAL_SCROLL_THRESHOLD) {
    virtualScrollState = { sorted, itemHeight: VIRTUAL_ITEM_HEIGHT };
    content.scrollTop = 0;
    renderVirtualScroll();
    return;
  }

  // 小目录：全量渲染
  virtualScrollState = null;
  let html = '<div class="workspace-file-list">';
  for (const entry of sorted) {
    html += renderFileItemHtml(entry);
  }
  html += '</div>';
  content.innerHTML = html;
}

/**
 * 获取当前所有文件项 DOM 元素
 */
function getFileItems() {
  const content = document.getElementById('workspacePanelContent');
  return content ? Array.from(content.querySelectorAll('.workspace-file-item')) : [];
}

/**
 * 更新键盘导航的视觉焦点
 */
function updateFocusVisual() {
  const content = document.getElementById('workspacePanelContent');

  // 虚拟滚动模式下：如果聚焦项不在当前渲染范围内，先滚动到该位置再渲染
  if (virtualScrollState && focusedIndex >= 0) {
    const { sorted, itemHeight } = virtualScrollState;
    if (focusedIndex >= sorted.length) return;
    const scrollTop = content.scrollTop;
    const containerHeight = content.clientHeight;
    const itemTop = focusedIndex * itemHeight;
    const itemBottom = itemTop + itemHeight;
    // 如果聚焦项不在可视区域，调整 scrollTop 并重新渲染
    if (itemTop < scrollTop || itemBottom > scrollTop + containerHeight) {
      content.scrollTop = Math.max(0, itemTop - (containerHeight - itemHeight) / 2);
      renderVirtualScroll();
      return;
    }
  }

  // 清除所有焦点标记，再给目标项加上
  const items = getFileItems();
  items.forEach(el => el.classList.remove('keyboard-focused'));

  if (focusedIndex < 0) return;

  // 虚拟滚动模式：用 data-path 匹配（因为 DOM 中的 idx 和 focusedIndex 不对应）
  if (virtualScrollState) {
    const focusedEntry = virtualScrollState.sorted[focusedIndex];
    if (!focusedEntry) return;
    const focusedPath = isSearchMode ? focusedEntry.fullPath : normalizePath(`${currentPath}/${focusedEntry.name}`);
    const el = items.find(el => el.dataset.path === focusedPath);
    if (el) el.classList.add('keyboard-focused');
  } else {
    // 非虚拟滚动模式：idx 直接对应 focusedIndex
    if (focusedIndex < items.length) {
      items[focusedIndex].classList.add('keyboard-focused');
      items[focusedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

/**
 * 键盘导航：移动焦点
 */
function moveFocus(delta) {
  const items = getFileItems();
  if (items.length === 0) return;
  if (focusedIndex === -1) {
    focusedIndex = delta > 0 ? 0 : items.length - 1;
  } else {
    focusedIndex = Math.max(0, Math.min(items.length - 1, focusedIndex + delta));
  }
  updateFocusVisual();
}

/**
 * 键盘导航：获取当前聚焦的文件项数据
 */
function getFocusedItem() {
  const items = getFileItems();
  if (focusedIndex < 0 || focusedIndex >= items.length) return null;
  const el = items[focusedIndex];
  return {
    el,
    path: el.dataset.path,
    name: el.dataset.name,
    type: el.dataset.type
  };
}

/**
 * 拖拽开始：将工作目录文件/目录路径写入自定义 drag data，
 * 拖到聊天输入框时由 index.js 的 drop handler 识别并调用 attachFilesForQuestion
 */
function handleFileListDragStart(e) {
  const item = e.target.closest('.workspace-file-item');
  if (!item) return;
  const path = item.dataset.path;
  const type = item.dataset.type;
  if (!path) return;

  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('application/x-workspace-file', JSON.stringify({
    path,
    name: item.dataset.name,
    type
  }));
}

/**
 * 键盘事件处理（绑定到 content 容器）
 */
async function handleFileListKeydown(e) {
  // 输入框中不处理（搜索框、输入对话框等）
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      moveFocus(1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      moveFocus(-1);
      break;
    case 'Enter': {
      e.preventDefault();
      const item = getFocusedItem();
      if (!item) return;
      if (item.type === 'directory') {
        pushPathHistory(currentPath);
        await navigateToPath(item.path);
      } else {
        await previewFile(item.path, item.name);
      }
      break;
    }
    case 'Delete': {
      e.preventDefault();
      const item = getFocusedItem();
      if (!item) return;
      await handleDeleteFile(item.path, item.name, item.type);
      break;
    }
    case 'F2': {
      e.preventDefault();
      const item = getFocusedItem();
      if (!item) return;
      await handleRenameFile(item.path, item.name, item.type);
      break;
    }
    case ' ': {
      e.preventDefault();
      const item = getFocusedItem();
      if (!item) return;
      toggleSelection(item.path);
      // 空格选择后自动下移一项，方便连续多选
      moveFocus(1);
      break;
    }
    case 'Escape':
      focusedIndex = -1;
      updateFocusVisual();
      break;
  }
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

  // 更新键盘焦点到点击的文件项
  const items = getFileItems();
  const clickedIdx = items.indexOf(item);
  if (clickedIdx >= 0) {
    focusedIndex = clickedIdx;
    updateFocusVisual();
  }

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
    } else if (action === 'info') {
      await showFileInfo(path, item.dataset.name, type);
    } else if (action === 'download') {
      await doDownloadSingle(path, item.dataset.name);
    } else if (action === 'ask') {
      await attachFilesForQuestion([path]);
    } else if (action === 'delete') {
      await handleDeleteFile(path, item.dataset.name, type);
    } else if (action === 'rename') {
      await handleRenameFile(path, item.dataset.name, type);
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
    pushPathHistory(currentPath);
    await navigateToPath(path);
    return;
  }

  // 点击文件：不做任何操作（预览和下载有各自独立的按钮）
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
  const entries = isSearchMode ? searchResults : cachedEntries;
  const allPaths = entries.map(e => isSearchMode ? e.fullPath : normalizePath(`${currentPath}/${e.name}`));
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
  const entries = isSearchMode ? searchResults : cachedEntries;
  const allPaths = entries.map(e => isSearchMode ? e.fullPath : normalizePath(`${currentPath}/${e.name}`));
  const selectAll = document.getElementById('workspaceSelectAll');
  if (!selectAll) return;
  const checkbox = selectAll.querySelector('.workspace-checkbox');
  if (allPaths.length === 0) {
    checkbox.classList.remove('checked');
    checkbox.classList.remove('indeterminate');
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

// 各类文件预览大小上限
const PREVIEW_MAX_TEXT  = 1024 * 1024;       // 文本: 1MB（DOM 渲染密集，需保守）
const PREVIEW_MAX_PDF   = 50 * 1024 * 1024;  // PDF: 50MB
const PREVIEW_MAX_DOCX  = 20 * 1024 * 1024;  // Word: 20MB
const PREVIEW_MAX_XLSX  = 50 * 1024 * 1024;  // Excel: 50MB（服务端解析，无性能瓶颈）
const PREVIEW_MAX_IMAGE = 50 * 1024 * 1024;  // 图片: 50MB
const PREVIEW_MAX_LINES = 10000;              // 文本预览最大渲染行数
const PREVIEW_XLSX_MAX_ROWS = 2000;            // Excel 预览最大渲染行数（防止 DOM 爆炸卡死）

/**
 * 从 Agent 后端获取文件二进制内容（ArrayBuffer）
 * 手动读取 response body stream，绕过 blob/arrayBuffer 等中间 API，
 * 避免 Content-Disposition: attachment 响应头导致的潜在数据截断
 */
async function fetchFileArrayBuffer(filePath) {
  const config = await getAgentConfig();
  if (!config) throw new Error('Agent 未配对');
  const resp = await fetch(`${config.url}/api/fs/download-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`
    },
    body: JSON.stringify({ path: filePath })
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(typeof errText === 'string' ? errText : `HTTP ${resp.status}`);
  }

  // 手动从 ReadableStream 逐块读取，避免 resp.blob()/arrayBuffer() 在
  // Content-Disposition: attachment 响应下可能的截断问题
  const reader = resp.body.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result.buffer;
}

/**
 * 预览文件（按类型分支）
 */
async function previewFile(filePath, fileName) {
  const previewArea = document.getElementById('workspacePreviewArea');
  const previewContent = document.getElementById('workspacePreviewContent');
  const previewFilename = document.getElementById('workspacePreviewFilename');
  const lineCountEl = document.getElementById('workspacePreviewLineCount');
  const copyBtn = document.getElementById('workspacePreviewCopyBtn');
  const downloadBtn = document.getElementById('workspacePreviewDownloadBtn');
  const openBrowserBtn = document.getElementById('workspacePreviewOpenBrowserBtn');
  const fullscreenBtn = document.getElementById('workspacePreviewFullscreenBtn');
  const mdToggleBtn = document.getElementById('workspacePreviewMdToggleBtn');

  previewFilename.textContent = fileName;
  lineCountEl.textContent = '';
  previewContent.classList.remove('xlsx-mode');
  previewContent.classList.remove('markdown-rendered');
  previewContent.innerHTML = '<div class="workspace-panel-loading">加载中...</div>';
  previewArea.style.display = 'flex';
  copyBtn.style.display = '';
  downloadBtn.style.display = '';
  openBrowserBtn.style.display = 'none';
  fullscreenBtn.style.display = 'none';
  mdToggleBtn.style.display = 'none';
  mdToggleBtn.classList.remove('active');
  const mdLabel = mdToggleBtn.querySelector('.workspace-preview-md-toggle-label');
  if (mdLabel) mdLabel.textContent = '预览';
  previewArea.classList.remove('fullscreen');
  document.getElementById('workspacePanel').classList.remove('preview-fullscreen');

  // 存储当前预览文件路径供下载/复制使用
  previewArea.dataset.previewPath = filePath;
  previewArea.dataset.previewName = fileName;
  // 清除旧的自定义数据
  delete previewArea.dataset.previewType;
  delete previewArea.dataset.previewSheets;

  // 根据文件类型选择不同策略
  const previewType = getPreviewType(fileName);

  // 获取文件大小
  const entry = cachedEntries.find(e => e.path === filePath)
    || searchResults.find(e => e.fullPath === filePath);
  const fileSize = entry ? entry.size : 0;

  // 文本文件走原有 UTF-8 读取路径
  if (previewType === 'text') {
    copyBtn.style.display = '';
    if (fileSize > PREVIEW_MAX_TEXT) {
      previewContent.innerHTML = `<div class="workspace-panel-error">文件过大 (${formatFileSize(fileSize)})，不支持预览，请直接下载</div>`;
      return;
    }
    fullscreenBtn.style.display = '';
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    if (ext === 'md' || ext === 'markdown') {
      mdToggleBtn.style.display = '';
      const result = await readFileContent(filePath);
      if (result.success) {
        previewArea.dataset.markdownText = result.content || '';
      }
    }
    await previewTextFile(filePath, fileName, lineCountEl, previewContent);
    return;
  }

  // 非文本文件走二进制下载路径
  // 隐藏复制按钮（二进制文件不支持文本复制）
  copyBtn.style.display = 'none';
  // 仅 PDF 和图片支持在浏览器中打开
  openBrowserBtn.style.display = (previewType === 'pdf' || previewType === 'image') ? '' : 'none';

  try {
    const maxSize = {
      pdf: PREVIEW_MAX_PDF,
      docx: PREVIEW_MAX_DOCX,
      xlsx: PREVIEW_MAX_XLSX,
      image: PREVIEW_MAX_IMAGE,
    }[previewType] || PREVIEW_MAX_TEXT;

    if (fileSize > maxSize) {
      const canOpenBrowser = previewType === 'pdf' || previewType === 'image';
      const msg = canOpenBrowser
        ? `文件过大 (${formatFileSize(fileSize)})，无法内置预览，请点击上方「在浏览器中打开」按钮查看`
        : `文件过大 (${formatFileSize(fileSize)})，不支持预览，请直接下载`;
      previewContent.innerHTML = `<div class="workspace-panel-error">${msg}</div>`;
      return;
    }

    // XLSX 走服务端解析，不需要前端下载二进制
    if (previewType === 'xlsx') {
      fullscreenBtn.style.display = '';
      await previewXlsx(fileName, previewContent, previewArea);
      return;
    }

    const arrayBuffer = await fetchFileArrayBuffer(filePath);

    switch (previewType) {
      case 'pdf':
        fullscreenBtn.style.display = '';
        await previewPdf(arrayBuffer, fileName, previewContent, previewArea);
        break;
      case 'docx':
        fullscreenBtn.style.display = '';
        await previewDocx(arrayBuffer, previewContent);
        break;
      case 'image':
        fullscreenBtn.style.display = '';
        await previewImage(arrayBuffer, fileName, previewContent);
        break;
      default:
        previewContent.innerHTML = '<div class="workspace-panel-error">不支持的文件类型</div>';
    }
  } catch (err) {
    logger.error('[WorkspacePanel] 预览失败:', filePath, err);
    const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : String(err));
    previewContent.innerHTML = `<div class="workspace-panel-error">预览失败: ${escapeHtml(msg || '未知错误')}</div>`;
  }
}

// ============================================================
// 文本/代码预览
// ============================================================

async function previewTextFile(filePath, fileName, lineCountEl, previewContent) {
  const result = await readFileContent(filePath);
  if (!result.success) {
    previewContent.innerHTML = `<div class="workspace-panel-error">预览失败: ${escapeHtml(result.error || '未知错误')}</div>`;
    return;
  }

  const lang = getLanguageClass(fileName);
  const text = result.content || '';
  const lines = text.split('\n');
  lineCountEl.textContent = `${lines.length} 行`;

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
}

// ============================================================
// PDF 预览（视口缩放 + 拖拽 + 翻页）
// ============================================================

let currentPdfDoc = null;
let currentPdfPage = 1;
let pdfScale = 1;
let pdfFitScale = 1;
let pdfPanX = 0, pdfPanY = 0;
let pdfIsDragging = false;
let pdfDragStartX = 0, pdfDragStartY = 0;
let pdfDragPanStartX = 0, pdfDragPanStartY = 0;

async function previewPdf(arrayBuffer, fileName, previewContent, previewArea) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  currentPdfDoc = pdf;
  currentPdfPage = 1;
  pdfScale = 1;
  pdfFitScale = 1;
  pdfPanX = 0;
  pdfPanY = 0;
  previewArea.dataset.previewType = 'pdf';

  const totalPages = pdf.numPages;
  document.getElementById('workspacePreviewLineCount').textContent = `${totalPages} 页`;

  previewContent.innerHTML = `
    <div class="pdf-wrap">
      <div class="pdf-toolbar">
        <button class="pdf-toolbar-btn" id="pdfPrevPage" title="上一页" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="pdf-page-info"><input type="number" class="pdf-page-input" id="pdfPageInput" value="1" min="1" max="${totalPages}"> / ${totalPages}</span>
        <button class="pdf-toolbar-btn" id="pdfNextPage" title="下一页">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <span class="pdf-toolbar-sep"></span>
        <button class="pdf-toolbar-btn" id="pdfZoomOut" title="缩小">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <span class="pdf-zoom-info" id="pdfZoomInfo">100%</span>
        <button class="pdf-toolbar-btn" id="pdfZoomIn" title="放大">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <span class="pdf-toolbar-sep"></span>
        <button class="pdf-toolbar-btn" id="pdfZoomFit" title="适应页面">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </button>
      </div>
      <div class="pdf-viewport" id="pdfViewport">
        <div class="pdf-pan" id="pdfPan">
          <canvas id="pdfCanvas"></canvas>
        </div>
      </div>
    </div>
  `;

  const viewport = document.getElementById('pdfViewport');
  const pan = document.getElementById('pdfPan');
  const canvas = document.getElementById('pdfCanvas');
  const zoomInfo = document.getElementById('pdfZoomInfo');

  function applyPdfTransform() {
    pan.style.transform = `translate(${pdfPanX}px, ${pdfPanY}px) scale(${pdfScale})`;
    zoomInfo.textContent = Math.round(pdfScale * 100) + '%';
    if (!pdfIsDragging) {
      viewport.style.cursor = pdfScale > pdfFitScale ? 'grab' : 'default';
    }
  }

  function clampPdfPan() {
    if (pdfScale <= pdfFitScale) {
      pdfPanX = 0;
      pdfPanY = 0;
    }
  }

  function setPdfZoom(newScale, originX, originY) {
    const oldScale = pdfScale;
    pdfScale = Math.max(0.05, Math.min(5, newScale));

    if (originX !== undefined && originY !== undefined) {
      const rect = viewport.getBoundingClientRect();
      const ox = originX - rect.left - rect.width / 2;
      const oy = originY - rect.top - rect.height / 2;
      const ratio = pdfScale / oldScale;
      pdfPanX = ox - ratio * (ox - pdfPanX);
      pdfPanY = oy - ratio * (oy - pdfPanY);
    }

    clampPdfPan();
    applyPdfTransform();
  }

  async function renderPdfPageInternal() {
    if (!currentPdfDoc) return;
    const page = await currentPdfDoc.getPage(currentPdfPage);
    const vp = page.getViewport({ scale: 1 });  // always render at 1x, CSS scale handles zoom
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    // 计算 fit 比例
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw > 0 && vh > 0 && vp.width > 0 && vp.height > 0) {
      pdfFitScale = Math.min((vw - 24) / vp.width, (vh - 24) / vp.height);
    } else {
      pdfFitScale = 1;
    }
    pdfScale = pdfFitScale;
    pdfPanX = 0;
    pdfPanY = 0;
    applyPdfTransform();

    // 更新控件状态
    const prevBtn = document.getElementById('pdfPrevPage');
    const nextBtn = document.getElementById('pdfNextPage');
    const pageInput = document.getElementById('pdfPageInput');
    if (prevBtn) prevBtn.disabled = currentPdfPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPdfPage >= currentPdfDoc.numPages;
    if (pageInput) pageInput.value = currentPdfPage;
  }

  // 初始渲染
  await renderPdfPageInternal();

  // 滚轮缩放
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.005;
    setPdfZoom(pdfScale + delta * pdfScale, e.clientX, e.clientY);
  }, { passive: false });

  // 拖拽平移
  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    pdfIsDragging = true;
    pdfDragStartX = e.clientX;
    pdfDragStartY = e.clientY;
    pdfDragPanStartX = pdfPanX;
    pdfDragPanStartY = pdfPanY;
    viewport.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!pdfIsDragging) return;
    pdfPanX = pdfDragPanStartX + (e.clientX - pdfDragStartX);
    pdfPanY = pdfDragPanStartY + (e.clientY - pdfDragStartY);
    clampPdfPan();
    applyPdfTransform();
  });

  window.addEventListener('mouseup', () => {
    if (pdfIsDragging) {
      pdfIsDragging = false;
      viewport.style.cursor = pdfScale > pdfFitScale ? 'grab' : 'default';
    }
  });

  // 工具栏按钮
  document.getElementById('pdfPrevPage').addEventListener('click', () => { if (currentPdfPage > 1) { currentPdfPage--; renderPdfPageInternal(); } });
  document.getElementById('pdfNextPage').addEventListener('click', () => { if (currentPdfPage < totalPages) { currentPdfPage++; renderPdfPageInternal(); } });
  document.getElementById('pdfPageInput').addEventListener('change', (e) => {
    const p = parseInt(e.target.value, 10);
    if (p >= 1 && p <= totalPages) { currentPdfPage = p; renderPdfPageInternal(); }
  });
  document.getElementById('pdfZoomIn').addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    setPdfZoom(pdfScale * 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById('pdfZoomOut').addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    setPdfZoom(pdfScale / 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById('pdfZoomFit').addEventListener('click', () => {
    pdfScale = pdfFitScale;
    pdfPanX = 0;
    pdfPanY = 0;
    applyPdfTransform();
  });

  // 双击 → fit
  viewport.addEventListener('dblclick', () => {
    pdfScale = pdfFitScale;
    pdfPanX = 0;
    pdfPanY = 0;
    applyPdfTransform();
  });

  // resize 重新计算 fit
  window.addEventListener('resize', () => {
    if (!currentPdfDoc) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const cw = canvas.width;
    const ch = canvas.height;
    if (vw > 0 && vh > 0 && cw > 0 && ch > 0) {
      pdfFitScale = Math.min((vw - 24) / cw, (vh - 24) / ch);
    }
    clampPdfPan();
    applyPdfTransform();
  });
}

// ============================================================
// Word .docx 预览（mammoth → HTML → DOMPurify）
// ============================================================

async function previewDocx(arrayBuffer, previewContent) {
  const result = await mammoth.convertToHtml({ arrayBuffer }, {
    // 样式映射：将 Word 样式转为内联 style
    styleMap: [
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "r[style-name='Strong'] => strong",
      "r[style-name='Emphasis'] => em",
    ]
  });
  const html = result.value || '<p>（文档为空）</p>';
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','strong','em','u','s','a','img','table','thead','tbody','tr','td','th','ul','ol','li','blockquote','pre','code','hr','sup','sub'],
    ALLOWED_ATTR: ['href','src','alt','title','style'],
  });

  // 仅展示 error 级别消息，过滤掉 mammoth 的样式警告（如 Unrecognised paragraph style）
  const errors = result.messages ? result.messages.filter(m => m.type === 'error') : [];
  if (errors.length > 0) {
    const errorDivs = errors.map(m => `<div class="docx-warning">⚠ ${escapeHtml(m.message)}</div>`).join('');
    previewContent.innerHTML = `<div class="workspace-preview-docx">${sanitized}<div class="docx-warnings">${errorDivs}</div></div>`;
  } else {
    previewContent.innerHTML = `<div class="workspace-preview-docx">${sanitized}</div>`;
  }
}

// ============================================================
// Excel 预览（服务端通过 /api/fs/preview-xlsx 解析，前 500 行）
// ============================================================

let xlsxSheetsData = [];   // 所有 sheet 的 rows 数据
let xlsxCurrentSheet = 0;  // 当前选中的 sheet

async function previewXlsx(fileName, previewContent, previewArea) {
  previewContent.innerHTML = '<div class="workspace-panel-empty">正在解析 Excel 文件...</div>';

  const filePath = previewArea.dataset.previewPath;
  let result;
  try {
    const config = await getAgentConfig();
    if (!config) throw new Error('Agent 未配对');
    const resp = await fetch(`${config.url}/api/fs/preview-xlsx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      },
      body: JSON.stringify({ path: filePath, maxRows: 500 })
    });
    result = await resp.json();
  } catch (err) {
    previewContent.innerHTML = `<div class="workspace-panel-error">请求失败: ${escapeHtml(err.message)}</div>`;
    return;
  }

  if (!result.success) {
    previewContent.innerHTML = `<div class="workspace-panel-error">解析失败: ${escapeHtml(result.error || '未知错误')}</div>`;
    return;
  }

  const { sheets } = result.data;
  if (!sheets || sheets.length === 0) {
    previewContent.innerHTML = '<div class="workspace-panel-error">工作簿中没有工作表</div>';
    return;
  }

  xlsxSheetsData = sheets;
  xlsxCurrentSheet = 0;

  previewArea.dataset.previewType = 'xlsx';
  previewArea.dataset.previewSheets = JSON.stringify(sheets.map(s => s.name));
  previewContent.classList.add('xlsx-mode');

  // 渲染 tabs
  let tabsHtml = '<div class="xlsx-sheet-tabs" id="xlsxSheetTabs">';
  sheets.forEach((s, i) => {
    tabsHtml += `<button class="xlsx-sheet-tab${i === 0 ? ' active' : ''}" data-sheet="${i}">${escapeHtml(s.name)}</button>`;
  });
  tabsHtml += '</div>';
  previewContent.innerHTML = tabsHtml + '<div class="xlsx-sheet-content" id="xlsxSheetContent"><div class="workspace-panel-empty">正在加载数据...</div></div>';

  // Tab 切换事件
  document.getElementById('xlsxSheetTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.xlsx-sheet-tab');
    if (!tab) return;
    const idx = parseInt(tab.dataset.sheet, 10);
    if (idx === xlsxCurrentSheet) return;
    document.querySelectorAll('.xlsx-sheet-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    loadAndRenderSheet(idx);
  });

  // 阶段二：按需加载第一个 sheet 的数据
  await loadAndRenderSheet(0);
}

async function loadAndRenderSheet(sheetIndex) {
  const content = document.getElementById('xlsxSheetContent');
  if (!content) return;

  xlsxCurrentSheet = sheetIndex;
  const sheet = xlsxSheetsData[sheetIndex];
  if (!sheet) {
    content.innerHTML = '<div class="workspace-panel-error">未找到工作表数据</div>';
    return;
  }

  renderXlsxSheet(sheet.rows, sheet.colCount, sheet.totalRows, content);
}

function renderXlsxSheet(rows, colCount, totalRows, content) {

  const oldMirror = content.querySelector('.xlsx-table-scrollbar-mirror');
  if (oldMirror) oldMirror.remove();

  if (!rows || rows.length === 0) {
    content.innerHTML = '<div class="workspace-panel-empty">（空工作表）</div>';
    return;
  }

  const headerRow = rows[0];
  let html = '<div class="xlsx-table-scroll" id="xlsxTableScroll"><table class="xlsx-preview-table"><thead><tr>';
  for (const cell of headerRow) {
    html += `<th>${escapeHtml(String(cell ?? ''))}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (let i = 1; i < rows.length; i++) {
    html += '<tr>';
    for (let c = 0; c < colCount; c++) {
      html += `<td>${escapeHtml(String(rows[i][c] ?? ''))}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';

  if (totalRows > PREVIEW_XLSX_MAX_ROWS) {
    html += `<div class="xlsx-truncated-msg">仅显示前 ${PREVIEW_XLSX_MAX_ROWS} 行，共 ${totalRows} 行，请下载查看完整内容</div>`;
  }

  content.innerHTML = html;

  const scroll = content.querySelector('#xlsxTableScroll');
  if (scroll) {
    const mirror = document.createElement('div');
    mirror.className = 'xlsx-table-scrollbar-mirror';
    const innerWidth = scroll.scrollWidth;
    mirror.innerHTML = `<div class="xlsx-table-scrollbar-mirror-inner" style="width:${innerWidth}px;"></div>`;
    
    let syncing = false;
    scroll.addEventListener('scroll', () => {
      if (syncing) { syncing = false; return; }
      syncing = true;
      mirror.scrollLeft = scroll.scrollLeft;
    });
    mirror.addEventListener('scroll', () => {
      if (syncing) { syncing = false; return; }
      syncing = true;
      scroll.scrollLeft = mirror.scrollLeft;
    });
    
    content.appendChild(mirror);
  }
}

// ============================================================
// 图片预览（滚轮缩放 + 拖拽平移）
// ============================================================

async function previewImage(arrayBuffer, fileName, previewContent) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mimeMap = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon'
  };
  const mimeType = mimeMap[ext] || 'image/png';
  const blob = new Blob([arrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);

  // 缩放控制工具栏 + 画布容器
  previewContent.innerHTML = `
    <div class="image-preview-wrap">
      <div class="image-preview-toolbar">
        <button class="image-preview-btn" id="imgZoomOut" title="缩小">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <span class="image-preview-zoom-level" id="imgZoomLevel">100%</span>
        <button class="image-preview-btn" id="imgZoomIn" title="放大">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <span class="image-preview-toolbar-sep"></span>
        <button class="image-preview-btn" id="imgZoomReset" title="原始大小">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </button>
      </div>
      <div class="image-preview-viewport" id="imgViewport">
        <div class="image-preview-pan" id="imgPan">
          <img src="${url}" alt="${escapeHtml(fileName)}" id="imgPreviewImage">
        </div>
      </div>
    </div>
  `;

  const img = document.getElementById('imgPreviewImage');
  const viewport = document.getElementById('imgViewport');
  const pan = document.getElementById('imgPan');
  const zoomLevel = document.getElementById('imgZoomLevel');

  let fitScale = 1;   // 图片完整适配视口的缩放比例
  let scale = 1;
  let panX = 0, panY = 0;
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let dragPanStartX = 0, dragPanStartY = 0;

  function calcFitScale() {
    if (!img.naturalWidth || !img.naturalHeight) return 1;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw <= 0 || vh <= 0) return 1;
    const padding = 20;
    return Math.min((vw - padding) / img.naturalWidth, (vh - padding) / img.naturalHeight);
  }

  function applyTransform() {
    pan.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    zoomLevel.textContent = Math.round(scale * 100) + '%';
    if (!isDragging) {
      viewport.style.cursor = scale > fitScale ? 'grab' : 'default';
    }
  }

  function clampPan() {
    // fit 及以下自动居中，放大后无边界限制自由拖拽
    if (scale <= fitScale) {
      panX = 0;
      panY = 0;
    }
  }

  function setZoom(newScale, originX, originY) {
    const oldScale = scale;
    scale = Math.max(0.01, Math.min(20, newScale));  // 无下限，最大 2000%

    // 以鼠标/视口中心为原点缩放（pan 层定位在 left:50%; top:50%，原点在视口中心）
    if (originX !== undefined && originY !== undefined) {
      const rect = viewport.getBoundingClientRect();
      const ox = originX - rect.left - rect.width / 2;
      const oy = originY - rect.top - rect.height / 2;
      const ratio = scale / oldScale;
      panX = ox - ratio * (ox - panX);
      panY = oy - ratio * (oy - panY);
    }

    clampPan();
    applyTransform();
  }

  function resetToFit() {
    scale = fitScale;
    panX = 0;
    panY = 0;
    applyTransform();
  }

  // 鼠标滚轮缩放
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.005;
    setZoom(scale + delta * scale, e.clientX, e.clientY);
  }, { passive: false });

  // 拖拽平移
  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragPanStartX = panX;
    dragPanStartY = panY;
    viewport.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panX = dragPanStartX + (e.clientX - dragStartX);
    panY = dragPanStartY + (e.clientY - dragStartY);
    clampPan();
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      viewport.style.cursor = scale > fitScale ? 'grab' : 'default';
    }
  });

  // 工具栏按钮
  document.getElementById('imgZoomIn').addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    setZoom(scale * 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById('imgZoomOut').addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    setZoom(scale / 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById('imgZoomReset').addEventListener('click', resetToFit);

  // 双击 → fit
  viewport.addEventListener('dblclick', resetToFit);

  // 图片加载后计算适配比例并居中
  img.addEventListener('load', () => {
    fitScale = calcFitScale();
    scale = fitScale;
    panX = 0;
    panY = 0;
    applyTransform();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  img.addEventListener('error', () => {
    URL.revokeObjectURL(url);
    previewContent.innerHTML = '<div class="workspace-panel-error">图片加载失败</div>';
  });

  // 窗口 resize 时重新计算 fit
  window.addEventListener('resize', () => {
    fitScale = calcFitScale();
    clampPan();
    applyTransform();
  });
}

/**
 * 复制预览内容
 */
async function copyPreviewContent() {
  const previewArea = document.getElementById('workspacePreviewArea');
  const filePath = previewArea.dataset.previewPath;
  if (!filePath) return;

  // 二进制文件不支持文本复制
  const previewType = previewArea.dataset.previewType
    || getPreviewType(previewArea.dataset.previewName || '');
  if (previewType !== 'text') {
    showToast('此文件类型不支持复制文本内容', 'info');
    return;
  }

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
 * 在浏览器中打开预览文件（用于 PDF 等大文件，利用浏览器原生渲染能力）
 */
async function openPreviewInBrowser() {
  const previewArea = document.getElementById('workspacePreviewArea');
  const filePath = previewArea.dataset.previewPath;
  if (!filePath) return;

  try {
    const result = await downloadFileStream(filePath);
    if (!result.success) {
      showToast(`获取文件失败: ${result.error}`, 'error');
      return;
    }
    const url = URL.createObjectURL(result.blob);
    window.open(url, '_blank');
    // 延迟释放，给浏览器足够时间读取
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    showToast('已在浏览器中打开', 'success');
  } catch (err) {
    showToast(`打开失败: ${err.message}`, 'error');
  }
}

/**
 * 关闭预览
 */
function togglePreviewFullscreen() {
  const previewArea = document.getElementById('workspacePreviewArea');
  const panel = document.getElementById('workspacePanel');
  const btn = document.getElementById('workspacePreviewFullscreenBtn');
  const isFullscreen = previewArea.classList.toggle('fullscreen');
  if (isFullscreen) {
    panel.classList.add('preview-fullscreen');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';
    btn.title = '退出全屏';
  } else {
    panel.classList.remove('preview-fullscreen');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
    btn.title = '全屏预览';
  }
}

function toggleMarkdownPreview() {
  const previewArea = document.getElementById('workspacePreviewArea');
  const previewContent = document.getElementById('workspacePreviewContent');
  const btn = document.getElementById('workspacePreviewMdToggleBtn');
  const mdLabel = btn.querySelector('.workspace-preview-md-toggle-label');
  const lineCountEl = document.getElementById('workspacePreviewLineCount');
  const copyBtn = document.getElementById('workspacePreviewCopyBtn');

  const isRendered = previewContent.classList.toggle('markdown-rendered');
  const markdownText = previewArea.dataset.markdownText || '';

  if (isRendered) {
    btn.classList.add('active');
    btn.title = '切换为源码预览';
    if (mdLabel) mdLabel.textContent = '预览';
    copyBtn.style.display = 'none';
    previewContent.innerHTML = `<div class="markdown-body workspace-preview-markdown">${formatMarkdown(markdownText)}</div>`;
    renderMermaidChartsInContainer(previewContent);
    bindCodeCopyButtonsInContainer(previewContent);
    addTableToolbarEvents();
    lineCountEl.textContent = 'Markdown 渲染';
  } else {
    btn.classList.remove('active');
    btn.title = '切换为渲染预览';
    if (mdLabel) mdLabel.textContent = '预览';
    copyBtn.style.display = '';
    const fileName = previewArea.dataset.previewName || '';
    const lang = getLanguageClass(fileName);
    const lines = (markdownText || '').split('\n');
    lineCountEl.textContent = `${lines.length} 行`;
    let numberedHtml = '<table class="workspace-preview-code-table"><tbody>';
    for (let i = 0; i < lines.length; i++) {
      numberedHtml += `<tr><td class="line-num">${i + 1}</td><td class="line-content"><code class="${lang}">${escapeHtml(lines[i])}</code></td></tr>`;
    }
    numberedHtml += '</tbody></table>';
    previewContent.innerHTML = numberedHtml;
  }
}

async function renderMermaidChartsInContainer(container) {
  if (typeof mermaid === 'undefined') return;
  const mermaidElements = container.querySelectorAll('.mermaid');
  for (const el of mermaidElements) {
    if (el.querySelector('svg')) continue;
    const rawCode = el.getAttribute('data-raw-code');
    const originalContent = rawCode ? decodeURIComponent(rawCode) : (el.textContent || '');
    try {
      await mermaid.run({ nodes: [el] });
      if (typeof addMermaidControls === 'function') {
        addMermaidControls(el);
      }
    } catch (err) {
      el.textContent = originalContent;
    }
  }
}

function bindCodeCopyButtonsInContainer(container) {
  const copyButtons = container.querySelectorAll('.code-copy-btn');
  copyButtons.forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const codeContainer = btn.closest('.code-block-container');
      if (codeContainer) {
        const codeElement = codeContainer.querySelector('pre code');
        if (codeElement) {
          copyToClipboard(codeElement.textContent || '', btn);
        }
      }
    });
  });

  if (!container.dataset.ctrlClickBound) {
    container.dataset.ctrlClickBound = 'true';
    container.addEventListener('click', (e) => {
      if ((!e.ctrlKey && !e.metaKey) || e.button !== 0) return;

      let codeEl = e.target.closest('code');
      if (!codeEl) {
        const preEl = e.target.closest('pre');
        if (preEl) {
          codeEl = preEl.querySelector('code');
        }
        if (!codeEl) {
          const codeContainer = e.target.closest('.code-block-container');
          if (codeContainer) {
            codeEl = codeContainer.querySelector('code');
          }
        }
      }
      if (!codeEl) return;

      const copyBtn = e.target.closest('.code-copy-btn');
      if (copyBtn) return;

      e.preventDefault();
      const codeText = codeEl.textContent;
      if (!codeText) return;

      navigator.clipboard.writeText(codeText).then(() => {
        showToast('代码已复制到剪贴板', 'success');
      }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = codeText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('代码已复制到剪贴板', 'success');
      });
    });
  }
}

function closePreview() {
  const previewArea = document.getElementById('workspacePreviewArea');
  const panel = document.getElementById('workspacePanel');
  const previewContent = document.getElementById('workspacePreviewContent');
  previewContent.classList.remove('xlsx-mode');
  previewContent.classList.remove('markdown-rendered');
  delete previewArea.dataset.markdownText;
  const mdToggleBtn = document.getElementById('workspacePreviewMdToggleBtn');
  if (mdToggleBtn) {
    mdToggleBtn.classList.remove('active');
    mdToggleBtn.style.display = 'none';
    const mdLabel = mdToggleBtn.querySelector('.workspace-preview-md-toggle-label');
    if (mdLabel) mdLabel.textContent = '预览';
  }
  if (previewArea.classList.contains('fullscreen')) {
    previewArea.classList.remove('fullscreen');
    panel.classList.remove('preview-fullscreen');
    const btn = document.getElementById('workspacePreviewFullscreenBtn');
    if (btn) {
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
      btn.title = '全屏预览';
    }
  }
  // 清理 PDF 资源
  if (currentPdfDoc) {
    currentPdfDoc.destroy();
    currentPdfDoc = null;
  }
  currentPdfPage = 1;
  pdfScale = 1;
  previewArea.style.display = 'none';
  document.getElementById('workspacePreviewContent').innerHTML = '';
}

/**
 * 下载单个文件/目录（增强进度面板 + 取消 + 文件行内进度条）
 */
async function doDownloadSingle(filePath, fileName) {
  if (downloadInProgress) return;
  downloadInProgress = true;
  setDownloadButtonsDisabled(true);

  // 文件行内进度条（视觉关联，用路径匹配避免同名文件冲突）
  const inlineBar = showFileProgress(filePath);
  // 取消控制器
  const controller = new AbortController();

  // 速度计算（滑动窗口）
  const speedSamples = [];
  const calcSpeed = () => {
    if (speedSamples.length < 2) return 0;
    const first = speedSamples[0];
    const last = speedSamples[speedSamples.length - 1];
    const dt = (last.time - first.time) / 1000;
    if (dt <= 0) return 0;
    return (last.loaded - first.loaded) / dt;
  };

  // 浮动进度面板（详细信息 + 取消按钮）
  const progressPanel = showUploadProgressPanel(() => controller.abort());
  progressPanel.classList.add('download-mode');
  updateUploadProgressPanel(progressPanel, { percent: 0, fileName, loaded: 0, totalBytes: 0, speed: 0 });

  try {
    const result = await downloadFileStreamWithProgress(filePath, ({ loaded, total, percent }) => {
      updateFileProgress(inlineBar, percent);
      const now = Date.now();
      speedSamples.push({ time: now, loaded });
      if (speedSamples.length > 8) speedSamples.shift();
      updateUploadProgressPanel(progressPanel, {
        percent, fileName, loaded, totalBytes: total, speed: calcSpeed()
      });
    }, controller.signal);

    if (result.aborted) {
      completeUploadProgressPanel(progressPanel, '下载已取消', true);
      showToast('下载已取消', 'info');
      return;
    }
    if (!result.success) {
      completeUploadProgressPanel(progressPanel, '下载失败', true);
      showToast(`下载失败: ${result.error}`, 'error');
      return;
    }
    triggerBrowserDownload(result.blob, result.name || fileName);
    updateUploadProgressPanel(progressPanel, {
      percent: 100, fileName, loaded: result.blob.size, totalBytes: result.blob.size,
      speed: 0, statusText: '正在由浏览器保存至本地...'
    });
    // Chrome download via <a> click cannot be monitored from JS,
    // show "已保存" after a reasonable delay for the save dialog to appear
    setTimeout(() => {
      completeUploadProgressPanel(progressPanel, '已保存至本地', false);
    }, 1500);
    showToast(`已下载: ${result.name || fileName}`, 'success');
  } catch (err) {
    if (err.name === 'AbortError') {
      completeUploadProgressPanel(progressPanel, '下载已取消', true);
      showToast('下载已取消', 'info');
    } else {
      completeUploadProgressPanel(progressPanel, '下载失败', true);
      showToast(`下载失败: ${err.message}`, 'error');
    }
  } finally {
    setTimeout(() => removeFileProgress(inlineBar), 600);
    downloadInProgress = false;
    setDownloadButtonsDisabled(false);
  }
}

/**
 * 下载选中的文件/目录（多选时在后端打包为 ZIP，增强进度面板 + 取消）
 */
async function downloadSelected() {
  if (selectedPaths.size === 0 || downloadInProgress) return;

  const paths = Array.from(selectedPaths);
  if (paths.length === 1) {
    const name = paths[0].split('/').pop();
    await doDownloadSingle(paths[0], name);
    return;
  }

  downloadInProgress = true;
  setDownloadButtonsDisabled(true);

  const controller = new AbortController();
  const speedSamples = [];
  const calcSpeed = () => {
    if (speedSamples.length < 2) return 0;
    const first = speedSamples[0];
    const last = speedSamples[speedSamples.length - 1];
    const dt = (last.time - first.time) / 1000;
    if (dt <= 0) return 0;
    return (last.loaded - first.loaded) / dt;
  };

  const label = `${paths.length} 个文件`;
  const progressPanel = showUploadProgressPanel(() => controller.abort());
  progressPanel.classList.add('download-mode');
  // 初始：后端打包阶段还没开始发送数据，提示"准备中"
  updateUploadProgressPanel(progressPanel, { percent: 0, fileName: label, loaded: 0, totalBytes: 0, speed: 0 });

  try {
    const result = await downloadFilesStreamWithProgress(paths, ({ loaded, total, percent }) => {
      const now = Date.now();
      speedSamples.push({ time: now, loaded });
      if (speedSamples.length > 8) speedSamples.shift();
      updateUploadProgressPanel(progressPanel, {
        percent, fileName: label, loaded, totalBytes: total, speed: calcSpeed()
      });
    }, controller.signal);

    if (result.aborted) {
      completeUploadProgressPanel(progressPanel, '下载已取消', true);
      showToast('下载已取消', 'info');
      return;
    }
    if (result.success && result.blob) {
      triggerBrowserDownload(result.blob, result.name || 'workspace.zip');
      completeUploadProgressPanel(progressPanel, `已下载 ${paths.length} 个文件`, false);
      showToast(`已下载 ${paths.length} 个文件（ZIP 压缩包）`, 'success');
    } else {
      completeUploadProgressPanel(progressPanel, '下载失败', true);
      showToast(`下载失败: ${result.error || '未知错误'}`, 'error');
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      completeUploadProgressPanel(progressPanel, '下载已取消', true);
      showToast('下载已取消', 'info');
    } else {
      completeUploadProgressPanel(progressPanel, '下载失败', true);
      showToast(`下载失败: ${err.message}`, 'error');
    }
  } finally {
    downloadInProgress = false;
    setDownloadButtonsDisabled(false);
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
 * 设置下载按钮禁用状态
 */
function setDownloadButtonsDisabled(disabled) {
  const btns = document.querySelectorAll('.workspace-file-btn.download');
  btns.forEach(btn => { btn.disabled = disabled; });
  const dirDownloadBtn = document.getElementById('workspaceDownloadDirBtn');
  if (dirDownloadBtn) dirDownloadBtn.disabled = disabled || selectedPaths.size === 0;
  // 预览下载按钮
  const previewDlBtn = document.getElementById('workspacePreviewDownloadBtn');
  if (previewDlBtn) previewDlBtn.disabled = disabled;
}

// 活跃的行内进度条：filePath → percent（虚拟滚动重渲染后用于恢复进度条）
const activeInlineProgress = new Map();

/**
 * 在文件行底部显示进度条（用路径匹配，避免同名文件冲突）
 * 返回 filePath 作为句柄，虚拟滚动重渲染后可通过 restoreInlineProgress 恢复
 */
function showFileProgress(filePath) {
  activeInlineProgress.set(filePath, 0);
  restoreInlineProgress();
  return filePath;
}

function updateFileProgress(handle, percent) {
  if (!handle) return;
  const filePath = handle;
  activeInlineProgress.set(filePath, percent);
  const fileItem = Array.from(document.querySelectorAll('.workspace-file-item'))
    .find(el => el.dataset.path === filePath);
  if (fileItem) {
    let bar = fileItem.querySelector('.workspace-file-progress');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'workspace-file-progress';
      bar.innerHTML = `<div class="workspace-file-progress-bar"></div>`;
      fileItem.appendChild(bar);
    }
    const inner = bar.querySelector('.workspace-file-progress-bar');
    if (inner) inner.style.width = percent + '%';
  }
}

function removeFileProgress(handle) {
  if (!handle) return;
  const filePath = handle;
  activeInlineProgress.delete(filePath);
  const fileItem = Array.from(document.querySelectorAll('.workspace-file-item'))
    .find(el => el.dataset.path === filePath);
  if (fileItem) {
    const bar = fileItem.querySelector('.workspace-file-progress');
    if (bar) bar.remove();
  }
}

/**
 * 恢复行内进度条（虚拟滚动重渲染后调用）
 * 遍历 activeInlineProgress，为可见的文件项重新创建进度条
 */
function restoreInlineProgress() {
  for (const [filePath, percent] of activeInlineProgress) {
    const fileItem = Array.from(document.querySelectorAll('.workspace-file-item'))
      .find(el => el.dataset.path === filePath);
    if (fileItem && !fileItem.querySelector('.workspace-file-progress')) {
      const bar = document.createElement('div');
      bar.className = 'workspace-file-progress';
      bar.innerHTML = `<div class="workspace-file-progress-bar" style="width:${percent}%"></div>`;
      fileItem.appendChild(bar);
    }
  }
}

// ==================== 上传/下载通用进度面板 ====================

/**
 * 创建浮动进度面板（含文件名、字节、速度、计数、取消按钮）
 * @param {function} onCancel - 取消回调
 * @returns {HTMLElement} 面板元素
 */
function showUploadProgressPanel(onCancel) {
  const panel = document.createElement('div');
  panel.className = 'workspace-upload-progress';
  panel.innerHTML = `
    <div class="workspace-upload-progress-header">
      <span class="workspace-upload-progress-title">上传中...</span>
      <button class="workspace-upload-progress-cancel" title="取消上传">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="14" height="14">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="workspace-upload-progress-file"></div>
    <div class="workspace-upload-progress-track">
      <div class="workspace-upload-progress-bar"></div>
    </div>
    <div class="workspace-upload-progress-stats">
      <span class="workspace-upload-progress-bytes"></span>
      <span class="workspace-upload-progress-speed"></span>
    </div>
  `;
  document.body.appendChild(panel);
  const cancelBtn = panel.querySelector('.workspace-upload-progress-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      cancelBtn.style.display = 'none';
      if (typeof onCancel === 'function') onCancel();
    });
  }
  return panel;
}

/**
 * 更新上传进度面板
 * @param {HTMLElement} panel
 * @param {object} opts - { percent, completed, total, fileName, loaded, totalBytes, speed }
 */
function updateUploadProgressPanel(panel, opts) {
  if (!panel) return;
  const { percent, completed, total, fileName, loaded, totalBytes, speed, statusText } = opts;
  const title = panel.querySelector('.workspace-upload-progress-title');
  const fileEl = panel.querySelector('.workspace-upload-progress-file');
  const bar = panel.querySelector('.workspace-upload-progress-bar');
  const bytesEl = panel.querySelector('.workspace-upload-progress-bytes');
  const speedEl = panel.querySelector('.workspace-upload-progress-speed');

  // 优先使用 statusText 覆盖标题
  const prefix = panel.classList.contains('download-mode') ? '下载中' : '上传中';
  if (title) {
    if (statusText) {
      title.textContent = statusText;
    } else if (completed != null && total != null) {
      title.textContent = `${prefix} ${completed}/${total} · ${percent}%`;
    } else {
      title.textContent = `${prefix} ${percent}%`;
    }
  }
  if (fileEl && fileName) {
    fileEl.textContent = fileName;
    fileEl.title = fileName;
  }
  if (bar) bar.style.width = percent + '%';
  if (bytesEl) {
    if (loaded != null && totalBytes != null && totalBytes > 0) {
      bytesEl.textContent = `${formatFileSize(loaded)} / ${formatFileSize(totalBytes)}`;
    } else if (loaded != null) {
      bytesEl.textContent = formatFileSize(loaded);
    }
  }
  if (speedEl) {
    speedEl.textContent = speed > 0 ? `${formatFileSize(speed)}/s` : '';
  }
}

/**
 * 标记上传完成（显示完成状态，延迟移除）
 */
function completeUploadProgressPanel(panel, message, isError) {
  if (!panel) return;
  const title = panel.querySelector('.workspace-upload-progress-title');
  const cancelBtn = panel.querySelector('.workspace-upload-progress-cancel');
  const bar = panel.querySelector('.workspace-upload-progress-bar');
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (title) title.textContent = message;
  if (bar && !isError) bar.style.width = '100%';
  panel.classList.add('workspace-upload-progress-done');
  if (isError) panel.classList.add('workspace-upload-progress-error');
  setTimeout(() => { try { panel.remove(); } catch {} }, 1500);
}

/**
 * 设置上传按钮禁用状态
 */
function setUploadButtonDisabled(disabled) {
  const uploadBtn = document.getElementById('workspaceUploadBtn');
  if (uploadBtn) {
    uploadBtn.disabled = disabled;
    if (disabled) {
      uploadBtn.dataset.originalHtml = uploadBtn.innerHTML;
      uploadBtn.innerHTML = '<span class="workspace-upload-spinner"></span>';
    } else if (uploadBtn.dataset.originalHtml) {
      uploadBtn.innerHTML = uploadBtn.dataset.originalHtml;
      delete uploadBtn.dataset.originalHtml;
    }
  }
  // 禁用拖拽
  const panel = document.getElementById('workspacePanel');
  if (panel) {
    panel.classList.toggle('upload-in-progress', disabled);
  }
}

/**
 * 上传文件到当前目录（流式上传，并发 3，增强进度面板，支持取消）
 * 使用 XMLHttpRequest 直接发送 File 对象，避免 base64 膨胀和内存占用
 */
async function uploadFiles(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0 || uploadInProgress) return;

  uploadInProgress = true;
  setUploadButtonDisabled(true);

  const config = await getAgentConfig();
  if (!config) {
    showToast('Agent 未连接，无法上传', 'error');
    uploadInProgress = false;
    setUploadButtonDisabled(false);
    return;
  }

  // 一次性获取目录文件列表，本地判断是否已存在（替代 N 次 read 请求）
  let existingNames = new Set();
  try {
    const listResult = await listDirectory(currentPath);
    if (listResult.success && Array.isArray(listResult.entries)) {
      existingNames = new Set(listResult.entries.map(e => e.name));
    }
  } catch {}

  let successCount = 0;
  let skippedCount = 0;
  let failCount = 0;
  const CONCURRENCY = 3;
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const uploadedBytes = new Array(files.length).fill(0);
  const activeXhrs = new Set();
  let cancelled = false;
  let lastFileName = '';

  // 速度计算（滑动窗口，最近 8 个采样点）
  const speedSamples = [];
  const calcSpeed = () => {
    if (speedSamples.length < 2) return 0;
    const first = speedSamples[0];
    const last = speedSamples[speedSamples.length - 1];
    const dt = (last.time - first.time) / 1000;
    if (dt <= 0) return 0;
    return (last.loaded - first.loaded) / dt;
  };

  // 增强进度面板（含取消按钮）
  const progressPanel = showUploadProgressPanel(() => {
    cancelled = true;
    for (const xhr of activeXhrs) {
      try { xhr.abort(); } catch {}
    }
    activeXhrs.clear();
  });

  const updateProgress = (fileName) => {
    if (fileName) lastFileName = fileName;
    const sum = uploadedBytes.reduce((s, b) => s + b, 0);
    const percent = totalBytes > 0 ? Math.round((sum / totalBytes) * 100) : 0;
    const now = Date.now();
    speedSamples.push({ time: now, loaded: sum });
    if (speedSamples.length > 8) speedSamples.shift();
    updateUploadProgressPanel(progressPanel, {
      percent,
      completed: successCount + skippedCount + failCount,
      total: files.length,
      fileName: lastFileName,
      loaded: sum,
      totalBytes,
      speed: calcSpeed()
    });
  };
  updateProgress();

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    if (cancelled) break;
    const batch = files.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(async (file, batchIdx) => {
      const fileIdx = i + batchIdx;
      // 清洗文件名：过滤 Windows 非法字符，防止上传失败或文件名异常
      const safeName = sanitizeFileName(file.name);
      const targetPath = normalizePath(`${currentPath}/${safeName}`);

      // 本地判断文件是否已存在（用清洗后的名字匹配）
      if (existingNames.has(safeName)) {
        uploadedBytes[fileIdx] = file.size;
        updateProgress(safeName);
        throw new Error('__SKIPPED__');
      }
      if (cancelled) throw new Error('__CANCELLED__');

      // 流式上传：body 直接传 File 对象，浏览器自动分块发送，零内存占用
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        activeXhrs.add(xhr);
        const url = `${config.url}/api/fs/upload-stream?path=${encodeURIComponent(targetPath)}`;
        xhr.open('POST', url);
        xhr.setRequestHeader('Authorization', `Bearer ${config.token}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            uploadedBytes[fileIdx] = e.loaded;
            updateProgress(file.name);
          }
        };
        xhr.onload = () => {
          activeXhrs.delete(xhr);
          if (cancelled) { reject(new Error('__CANCELLED__')); return; }
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.success) {
                uploadedBytes[fileIdx] = file.size;
                updateProgress(file.name);
                resolve();
              } else {
                reject(new Error(data.error || '上传失败'));
              }
            } catch {
              reject(new Error('解析响应失败'));
            }
          } else {
            try {
              const data = JSON.parse(xhr.responseText);
              reject(new Error(data.error || `上传失败 (${xhr.status})`));
            } catch {
              reject(new Error(`上传失败 (${xhr.status})`));
            }
          }
        };
        xhr.onerror = () => {
          activeXhrs.delete(xhr);
          reject(new Error(cancelled ? '__CANCELLED__' : '网络错误'));
        };
        xhr.onabort = () => {
          activeXhrs.delete(xhr);
          reject(new Error('__CANCELLED__'));
        };
        xhr.send(file);
      });
    }));

    for (const r of results) {
      if (r.status === 'fulfilled') {
        successCount++;
      } else {
        const msg = r.reason && r.reason.message ? r.reason.message : '';
        if (msg.includes('__SKIPPED__') || msg.includes('已存在')) {
          skippedCount++;
        } else if (msg.includes('__CANCELLED__')) {
          // 取消的不计入失败
        } else {
          failCount++;
        }
      }
    }
  }

  // 完成过渡提示
  let completeMsg;
  let isError = false;
  if (cancelled) {
    completeMsg = '已取消上传';
    isError = true;
  } else {
    const parts = [];
    if (successCount > 0) parts.push(`成功 ${successCount}`);
    if (skippedCount > 0) parts.push(`跳过 ${skippedCount}`);
    if (failCount > 0) parts.push(`失败 ${failCount}`);
    completeMsg = parts.length > 0 ? `上传完成 · ${parts.join(' / ')}` : '上传完成';
    isError = failCount > 0;
  }
  completeUploadProgressPanel(progressPanel, completeMsg, isError);

  if (successCount > 0) showToast(`成功上传 ${successCount} 个文件`, 'success');
  if (skippedCount > 0) showToast(`${skippedCount} 个文件已存在，跳过上传`, 'info');
  if (failCount > 0) showToast(`${failCount} 个文件上传失败`, 'error');
  if (cancelled) showToast('上传已取消', 'info');

  uploadInProgress = false;
  setUploadButtonDisabled(false);

  if (successCount > 0) {
    await refreshCurrent();
    scrollToNewFile(files[files.length - 1].name);
  }
}

/**
 * 设置拖拽支持（外部上传 + 内部文件移动）
 */
function setupDragDrop() {
  const panel = document.getElementById('workspacePanel');
  if (!panel) return;

  // 为文件行绑定 dragstart，作为内部拖拽源
  const content = document.getElementById('workspacePanelContent');
  content.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.workspace-file-item');
    if (!item) return;
    const path = item.dataset.path;
    const name = item.dataset.name;
    // 设置拖拽数据，标记为内部移动
    e.dataTransfer.setData('application/x-workspace-move', JSON.stringify({ path, name }));
    e.dataTransfer.effectAllowed = 'move';
    item.classList.add('dragging');
    // 拖拽结束后清理
    const onDragEnd = () => {
      item.classList.remove('dragging');
      item.removeEventListener('dragend', onDragEnd);
    };
    item.addEventListener('dragend', onDragEnd);
  });

  // 目录行的 dragover/dragleave 反馈
  content.addEventListener('dragover', (e) => {
    // 始终阻止事件冒泡，避免触发 input-wrapper 的拖拽门板
    e.preventDefault();
    e.stopPropagation();
    const dirItem = e.target.closest('.workspace-file-item.directory');
    // 高亮目标目录
    const allDirs = content.querySelectorAll('.workspace-file-item.directory.drop-target');
    allDirs.forEach(d => d.classList.remove('drop-target'));
    
    if (dirItem) {
      // 拖到目录上：高亮目录，不显示面板蒙版
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-workspace-move') ? 'move' : 'copy';
      dirItem.classList.add('drop-target');
      panel.classList.remove('drag-over');
    } else {
      // 拖到非目录区域：显示面板拖拽蒙版
      if (!e.dataTransfer.types.includes('application/x-workspace-move')) {
        panel.classList.add('drag-over');
      }
    }
  });

  content.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const allDirs = content.querySelectorAll('.workspace-file-item.directory.drop-target');
    allDirs.forEach(d => d.classList.remove('drop-target'));
    // 离开文件列表区域时移除面板蒙版
    panel.classList.remove('drag-over');
  });

  content.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dirItem = e.target.closest('.workspace-file-item.directory');
    // 清理高亮和拖拽蒙版
    content.querySelectorAll('.workspace-file-item.directory.drop-target').forEach(d => d.classList.remove('drop-target'));
    panel.classList.remove('drag-over');

    if (dirItem && e.dataTransfer.types.includes('application/x-workspace-move')) {
      // 内部拖拽：移动文件到目录
      try {
        const moveData = JSON.parse(e.dataTransfer.getData('application/x-workspace-move'));
        const srcPath = moveData.path;
        const destDir = dirItem.dataset.path;
        const srcName = moveData.name;

        if (srcPath === destDir) return; // 不能拖到自己上
        if (srcPath.startsWith(destDir + '/')) {
          showToast('不能将目录移动到其子目录中', 'error');
          return;
        }

        showToast('移动中...', 'info');
        const result = await moveFs(srcPath, destDir);
        if (result.success) {
          showToast(`"${srcName}" 已移动到目标目录`, 'success');
          invalidateDirCache(currentPath);
          invalidateDirCache(destDir);
          const destDirName = destDir.split('/').pop();
          await refreshCurrent();
          scrollToNewFile(destDirName);
        } else {
          showToast(`移动失败: ${result.error}`, 'error');
        }
      } catch (err) {
        showToast(`移动失败: ${err.message}`, 'error');
      }
      return;
    }

    // 外部文件拖到目录项上：上传到该目录，并进入该目录查看
    if (dirItem && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const destDir = dirItem.dataset.path;
      const destDirName = destDir.split('/').pop();
      // 保存当前路径到历史，然后导航到目标目录
      pushPathHistory(currentPath);
      currentPath = destDir;
      await uploadFiles(e.dataTransfer.files);
      updateBreadcrumb();
      updateBackButton();
      return;
    }

    // 外部文件拖到非目录文件项上：上传到当前目录
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files);
      return;
    }
  });

  // 面板级别的拖拽（外部文件上传）
  panel.addEventListener('dragover', (e) => {
    // 始终阻止事件冒泡，避免触发 input-wrapper 的拖拽门板
    e.preventDefault();
    e.stopPropagation();
    // 内部拖拽不触发面板级别高亮
    if (e.dataTransfer.types.includes('application/x-workspace-move')) return;
    panel.classList.add('drag-over');
  });

  panel.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('application/x-workspace-move')) return;
    panel.classList.remove('drag-over');
  });

  panel.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 内部拖拽已在 content 级处理
    if (e.dataTransfer.types.includes('application/x-workspace-move')) return;
    panel.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    await uploadFiles(files);
  });
}

/**
 * 监听 storage 变化（Agent 切换/断开）
 */
async function updateWorkspaceAgentName() {
  try {
    const agentNameEl = document.getElementById('workspaceAgentName');
    if (!agentNameEl) return;

    const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = storage.pairedAgents || [];
    const activeId = storage.activeAgentId;

    if (activeId) {
      const activeAgent = agents.find(a => a.id === activeId);
      if (activeAgent && activeAgent.name) {
        agentNameEl.textContent = ` · ${activeAgent.name}`;
        agentNameEl.style.display = '';
        return;
      }
    }

    agentNameEl.textContent = '';
    agentNameEl.style.display = 'none';
  } catch (e) {
    logger.debug('[WorkspacePanel] 更新代理名称失败:', e);
  }
}

async function handleStorageChange(changes, namespace) {
  if (namespace !== 'local') return;
  if (!changes.pairedAgents && !changes.activeAgentId) return;

  await updateWorkspaceAgentName();

  const newAgentId = changes.activeAgentId?.newValue;
  const oldAgentId = changes.activeAgentId?.oldValue;

  if (newAgentId !== oldAgentId) {
    logger.debug('[WorkspacePanel] Agent 已变更，刷新工作目录');

    resetWorkspaceRoot();
    workspaceRoot = null;
    currentPath = null;
    pathHistory = [];
    selectedPaths.clear();
    searchQuery = '';
    searchResults = [];
    isSearchMode = false;
    dirCache.clear();

    const panel = document.getElementById('workspacePanel');
    if (panel && panel.classList.contains('expanded')) {
      await navigateToRoot();
    }
  }
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
async function refreshCurrent(preservedScrollTop) {
  if (!currentPath) {
    const root = workspaceRoot || await getWorkspaceRoot();
    if (!root) {
      showToast('无法刷新，请确认 Agent 已连接', 'error');
      return;
    }
    workspaceRoot = root;
    currentPath = root;
  }
  invalidateDirCache(currentPath);
  selectedPaths.clear();
  updateDownloadBtn();
  if (isSearchMode && searchQuery) {
    const results = await searchFilesRemote(currentPath, searchQuery);
    searchResults = results;
    renderCurrentEntries();
  } else {
    await loadDirectory(currentPath);
  }
  closePreview();
  updateSelectAllState();
  if (preservedScrollTop !== undefined) {
    const content = document.getElementById('workspacePanelContent');
    if (content) {
      requestAnimationFrame(() => {
        content.scrollTop = preservedScrollTop;
      });
    }
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

  const parts = normalizePath(currentPath).split('/').filter(Boolean);
  let html = '';
  let accumulatedPath = '';
  for (let i = 0; i < parts.length; i++) {
    accumulatedPath += '/' + parts[i];
    const isLast = i === parts.length - 1;
    // workspaceRoot 之上的路径段不可点击（无权限）
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
    
    // 拖拽到面包屑目录支持
    link.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('application/x-workspace-move')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      link.classList.add('drop-target');
    });
    
    link.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      link.classList.remove('drop-target');
    });
    
    link.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      link.classList.remove('drop-target');
      
      if (!e.dataTransfer.types.includes('application/x-workspace-move')) return;
      
      try {
        const moveData = JSON.parse(e.dataTransfer.getData('application/x-workspace-move'));
        const srcPath = moveData.path;
        const destDir = link.dataset.path;
        const srcName = moveData.name;
        
        if (srcPath === destDir) return;
        if (destDir.startsWith(srcPath + '/')) {
          showToast('不能将目录移动到其子目录中', 'error');
          return;
        }
        
        showToast('移动中...', 'info');
        const result = await moveFs(srcPath, destDir);
        if (result.success) {
          showToast(`"${srcName}" 已移动到 "${destDir.split('/').pop()}"`, 'success');
          invalidateDirCache(currentPath);
          invalidateDirCache(destDir);
          await refreshCurrent();
        } else {
          showToast(`移动失败: ${result.error}`, 'error');
        }
      } catch (err) {
        showToast(`移动失败: ${err.message}`, 'error');
      }
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

/**
 * 重置所有缓存并刷新工作目录（代理切换后调用）
 */
export async function resetAndRefreshWorkspace() {
  resetWorkspaceRoot();
  workspaceRoot = null;
  currentPath = null;
  pathHistory = [];
  selectedPaths.clear();
  searchQuery = '';
  searchResults = [];
  isSearchMode = false;
  dirCache.clear();

  const panel = document.getElementById('workspacePanel');
  if (panel && panel.classList.contains('expanded')) {
    await navigateToRoot();
  }
}

export { attachFilesForQuestion };
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
let searchHistory = [];
let searchHistoryIndex = -1;

// 加载搜索历史
function loadSearchHistory() {
  try {
    chrome.storage.local.get(['workspaceSearchHistory'], (result) => {
      searchHistory = result.workspaceSearchHistory || [];
    });
  } catch {}
}

/**
 * 添加搜索历史（去重、最多20条）
 */
function addSearchHistory(query) {
  if (!query.trim()) return;
  const idx = searchHistory.indexOf(query);
  if (idx !== -1) searchHistory.splice(idx, 1);
  searchHistory.push(query);
  if (searchHistory.length > 20) searchHistory.shift();
  try {
    chrome.storage.local.set({ workspaceSearchHistory: searchHistory });
  } catch {}
}

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
    updateSelectAllState();
    return;
  }

  addSearchHistory(searchQuery);
  searchHistoryIndex = -1;

  showToast('搜索中...', 'info');
  const results = await searchFilesRemote(currentPath, searchQuery);
  searchResults = results;
  isSearchMode = true;
  renderCurrentEntries();
  updateSelectAllState();
}

async function clearSearch() {
  const searchInput = document.getElementById('workspaceSearchInput');
  const toolbar = document.getElementById('workspaceToolbar');
  const searchBox = toolbar.querySelector('.workspace-search-box');
  searchInput.value = '';
  searchQuery = '';
  isSearchMode = false;
  searchResults = [];
  selectedPaths.clear();
  document.getElementById('workspaceSearchClear').style.display = 'none';
  toolbar.classList.remove('search-focused');
  searchBox.classList.remove('search-box-expanded');
  searchInput.blur();
  await loadDirectory(currentPath);
  updateSelectAllState();
  updateDownloadBtn();
}

async function handleDeleteFile(path, name, type) {
  const isDir = type === 'directory';
  
  const message = isDir 
    ? `确定要删除目录 "${name}" 及其所有内容吗？\n\n路径: ${path}\n类型: 目录\n\n删除后可在回收站中恢复（7天后自动清理）`
    : `确定要删除文件 "${name}" 吗？\n\n路径: ${path}\n类型: 文件\n\n删除后可在回收站中恢复（7天后自动清理）`;
  
  if (typeof window.showCustomConfirm !== 'function') {
    const confirmed = confirm(message);
    if (!confirmed) return;
  } else {
    const confirmed = await window.showCustomConfirm(message, '确认删除');
    if (!confirmed) return;
  }

  const content = document.getElementById('workspacePanelContent');
  const preservedScrollTop = content ? content.scrollTop : 0;

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
      await refreshCurrent(preservedScrollTop);
    } else {
      showToast(`删除失败: ${data.error || '未知错误'}`, 'error');
    }
  } catch (err) {
    showToast(`删除失败: ${err.message}`, 'error');
  }
}

async function handleBatchDelete() {
  if (selectedPaths.size === 0) return;
  
  const paths = Array.from(selectedPaths);
  const names = paths.map(p => {
    const entry = cachedEntries.find(e => e.path === p) 
      || searchResults.find(e => e.fullPath === p);
    return entry ? entry.name : p.split('/').pop();
  });
  
  const message = `确定要删除选中的 ${paths.length} 个文件/目录吗？\n\n${names.slice(0, 5).map(n => `• ${n}`).join('\n')}${names.length > 5 ? `\n• ... 等共 ${names.length} 项` : ''}\n\n删除后可在回收站中恢复（7天后自动清理）`;
  
  if (typeof window.showCustomConfirm !== 'function') {
    const confirmed = confirm(message);
    if (!confirmed) return;
  } else {
    const confirmed = await window.showCustomConfirm(message, '确认批量删除');
    if (!confirmed) return;
  }

  const content = document.getElementById('workspacePanelContent');
  const preservedScrollTop = content ? content.scrollTop : 0;

  try {
    const config = await getAgentConfig();
    if (!config) {
      showToast('Agent 未连接', 'error');
      return;
    }

    let successCount = 0;
    let failCount = 0;
    for (const path of paths) {
      try {
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
          selectedPaths.delete(path);
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }
    
    if (successCount > 0) {
      showToast(`已删除 ${successCount} 项${failCount > 0 ? `，${failCount} 项失败` : ''}`, failCount > 0 ? 'warning' : 'success');
      updateDownloadBtn();
      await refreshCurrent(preservedScrollTop);
    } else {
      showToast('删除失败', 'error');
    }
  } catch (err) {
    showToast(`删除失败: ${err.message}`, 'error');
  }
}

/**
 * 格式化权限 mode（rwx 字符串表示）
 */
function formatPermission(mode, isDir) {
  const perms = [
    { bit: 0o400, ch: 'r' }, { bit: 0o200, ch: 'w' }, { bit: 0o100, ch: 'x' },
    { bit: 0o040, ch: 'r' }, { bit: 0o020, ch: 'w' }, { bit: 0o010, ch: 'x' },
    { bit: 0o004, ch: 'r' }, { bit: 0o002, ch: 'w' }, { bit: 0o001, ch: 'x' }
  ];
  let str = isDir ? 'd' : '-';
  for (const p of perms) {
    str += (mode & p.bit) ? p.ch : '-';
    // setuid/setgid/sticky 位
    if (p.ch === 'x' && (mode & (p.bit << 9))) str = str.slice(0, -1) + (p.ch === 'x' ? 's' : 'S');
  }
  // 八进制表示（如 755）
  const octal = (mode & 0o777).toString(8).padStart(3, '0');
  return `${str} (${octal})`;
}

/**
 * 显示文件详情面板（模态弹窗）
 */
async function showFileInfo(filePath, fileName, type) {
  // 先显示加载中
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `
    <div class="modal-container file-info-modal">
      <button class="file-info-close" title="关闭" style="position:absolute;top:10px;right:12px;background:none;border:none;font-size:20px;color:#999;cursor:pointer;padding:4px 8px;line-height:1;transition:color 0.15s ease;">×</button>
      <div class="modal-title">${escapeHtml(fileName)} - 文件详情</div>
      <div class="file-info-loading">加载中...</div>
      <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
        <button class="modal-btn-cancel" style="padding:6px 16px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.modal-btn-cancel').addEventListener('click', close);
  overlay.querySelector('.file-info-close').addEventListener('click', close);

  try {
    const result = await getFileInfo(filePath);
    const body = overlay.querySelector('.file-info-loading');
    if (!result.success || !result.info) {
      body.className = '';
      body.innerHTML = `<div class="workspace-panel-error">获取详情失败: ${escapeHtml(result.error || '未知错误')}</div>`;
      return;
    }
    const info = result.info;
    const formatDate = (ts) => {
      if (!ts) return '—';
      const d = new Date(ts);
      return d.toLocaleString('zh-CN');
    };

    const typeText = info.isDirectory ? '目录' : info.isSymbolicLink ? '符号链接' : '文件';
    const sizeText = info.isDirectory ? null : formatFileSize(info.size) + ` (${info.size.toLocaleString()} 字节)`;
    const mimeText = info.mimeType || null;
    const permText = formatPermission(info.mode, info.isDirectory);

    const rows = [
      ['名称', escapeHtml(info.name), info.name],
      ['类型', typeText, typeText],
      ['路径', `<span style="word-break:break-all;">${escapeHtml(info.path)}</span>`, info.path],
      ['大小', sizeText || '—', sizeText],
      ['MIME 类型', mimeText ? escapeHtml(mimeText) : '—', mimeText],
      ['修改时间', formatDate(info.mtime), formatDate(info.mtime)],
      ['创建时间', formatDate(info.ctime), formatDate(info.ctime)],
      ['访问时间', formatDate(info.atime), formatDate(info.atime)],
      ['权限', escapeHtml(permText), permText]
    ];
    if (info.uid !== undefined) rows.push(['UID', String(info.uid), String(info.uid)]);
    if (info.gid !== undefined) rows.push(['GID', String(info.gid), String(info.gid)]);

    body.className = 'file-info-body';
    body.innerHTML = `<table class="file-info-table">${
      rows.map(([k, v, copyVal]) => {
        if (copyVal != null) {
          return `<tr><td class="file-info-key">${k}</td><td class="file-info-val file-info-copyable" data-copy="${escapeHtml(copyVal)}" title="点击复制">${v}<svg class="file-info-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></td></tr>`;
        }
        return `<tr><td class="file-info-key">${k}</td><td class="file-info-val">${v}</td></tr>`;
      }).join('')
    }</table>`;

    // 点击复制
    body.querySelectorAll('.file-info-copyable').forEach(el => {
      el.addEventListener('click', async () => {
        const text = el.dataset.copy;
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          showToast('已复制到剪贴板', 'success');
        } catch {
          showToast('复制失败', 'error');
        }
      });
    });
  } catch (err) {
    const body = overlay.querySelector('.file-info-loading');
    body.className = '';
    body.innerHTML = `<div class="workspace-panel-error">获取详情失败: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * 显示输入对话框（自定义 UI，返回 Promise<string|null>）
 */
function showInputDialog(title, defaultValue = '', placeholder = '') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="modal-container input-dialog" style="min-width:320px;">
        <div class="modal-title">${escapeHtml(title)}</div>
        <input type="text" class="modal-input" value="${escapeHtml(defaultValue)}" placeholder="${escapeHtml(placeholder)}" autofocus style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;margin:8px 0;box-sizing:border-box;">
        <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
          <button class="modal-btn-cancel" style="padding:6px 16px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;">取消</button>
          <button class="modal-btn-confirm" style="padding:6px 16px;border:none;border-radius:6px;background:#4a90d9;color:#fff;cursor:pointer;">确定</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.modal-input');
    const confirmBtn = overlay.querySelector('.modal-btn-confirm');
    const cancelBtn = overlay.querySelector('.modal-btn-cancel');

    const cleanup = () => {
      overlay.remove();
    };

    const doConfirm = () => {
      const val = input.value.trim();
      cleanup();
      resolve(val || null);
    };

    confirmBtn.addEventListener('click', doConfirm);
    cancelBtn.addEventListener('click', () => { cleanup(); resolve(null); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doConfirm();
      if (e.key === 'Escape') { cleanup(); resolve(null); }
    });
    // 自动聚焦
    setTimeout(() => input.select(), 50);
  });
}

/**
 * 处理文件/目录重命名（仅修改不含后缀的文件名部分）
 */
async function handleRenameFile(path, name, type) {
  // 提取不含后缀的部分
  let baseName = name;
  let ext = '';
  const dotIndex = name.lastIndexOf('.');
  if (type !== 'directory' && dotIndex > 0) {
    baseName = name.substring(0, dotIndex);
    ext = name.substring(dotIndex);
  }

  const newBase = await showInputDialog(
    `重命名${type === 'directory' ? '目录' : '文件'}`,
    baseName,
    '输入新名称'
  );
  if (!newBase || newBase === baseName) return;

  const newName = newBase + ext;
  try {
    const result = await renameFs(path, newName);
    if (result.success) {
      showToast(`已重命名为 "${newName}"`, 'success');
      invalidateDirCache(currentPath);
      await refreshCurrent();
      scrollToNewFile(newName);
    } else {
      showToast(`重命名失败: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`重命名失败: ${err.message}`, 'error');
  }
}

/**
 * 处理新建文件夹
 */
async function handleNewFolder() {
  if (!currentPath) return;

  const dirName = await showInputDialog('新建文件夹', '', '输入文件夹名称');
  if (!dirName) return;

  const dirPath = normalizePath(`${currentPath}/${dirName}`);
  try {
    const result = await createDir(dirPath);
    if (result.success) {
      showToast(`已创建文件夹 "${dirName}"`, 'success');
      invalidateDirCache(currentPath);
      await refreshCurrent();
      scrollToNewFile(dirName);
    } else {
      showToast(`创建失败: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`创建失败: ${err.message}`, 'error');
  }
}

async function compressBlobImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const reader = new FileReader();
      reader.onloadend = () => {
        const originalUrl = reader.result;
        const width = img.width;
        const height = img.height;
        const maxDim = Math.max(width, height);

        let targetMaxDim, quality;
        if (maxDim <= 768) {
          targetMaxDim = maxDim;
          quality = 0.75;
        } else if (maxDim <= 1280) {
          targetMaxDim = 768;
          quality = 0.70;
        } else if (maxDim <= 2560) {
          targetMaxDim = 1024;
          quality = 0.65;
        } else if (maxDim <= 3840) {
          targetMaxDim = 1280;
          quality = 0.60;
        } else {
          targetMaxDim = 1280;
          quality = 0.55;
        }

        let targetWidth = width;
        let targetHeight = height;
        if (maxDim > targetMaxDim) {
          if (width > height) {
            targetHeight = Math.round(height * (targetMaxDim / width));
            targetWidth = targetMaxDim;
          } else {
            targetWidth = Math.round(width * (targetMaxDim / height));
            targetHeight = targetMaxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const compressedUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ originalUrl, compressedUrl });
      };
      reader.readAsDataURL(blob);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };

    img.src = url;
  });
}

async function attachFilesForQuestion(paths) {
  const regularFiles = [];
  const imageFiles = [];

  for (const path of paths) {
    const name = path.split('/').pop();
    let entry = cachedEntries.find(e => e.path === path);
    if (!entry) {
      entry = searchResults.find(e => e.fullPath === path);
    }
    const size = entry ? entry.size : 0;
    const mime = getMimeType(name);
    const isImage = mime.startsWith('image/');

    if (isImage) {
      imageFiles.push({ name, size, type: mime, path });
    } else {
      const fileEntry = {
        name,
        size,
        type: mime,
        text: '',
        status: 'done',
        agentPath: path
      };
      regularFiles.push(fileEntry);
    }
  }

  for (const img of imageFiles) {
    try {
      const config = await getAgentConfig();
      if (config) {
        const resp = await fetch(`${config.url}/api/fs/download-stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.token}`
          },
          body: JSON.stringify({ path: img.path })
        });
        if (resp.ok) {
          const blob = await resp.blob();
          const { originalUrl, compressedUrl } = await compressBlobImage(blob);
          const exists = state.attachedImages.some(ai => ai.compressedUrl === compressedUrl);
          if (!exists) {
            state.attachedImages.push({ originalUrl, compressedUrl });
          }
        }
      }
    } catch {}
  }

  for (const f of regularFiles) {
    const exists = state.attachedFiles.some(af => af.name === f.name && af.agentPath === f.agentPath);
    if (!exists) {
      state.attachedFiles.push(f);
    }
  }

  renderFilePreviews();
  renderImagePreviews();

  const total = regularFiles.length + imageFiles.length;
  if (total > 0) {
    showToast(`已添加 ${total} 个文件到问答`, 'success');
  }
}

async function askSelectedFiles() {
  if (selectedPaths.size === 0) return;
  const paths = Array.from(selectedPaths);
  await attachFilesForQuestion(paths);
}

function scrollToNewFile(fileName, retryCount = 0) {
  const content = document.getElementById('workspacePanelContent');
  if (!content) return;

  // 虚拟滚动模式：文件可能未渲染，先计算索引并滚动到对应位置
  if (virtualScrollState) {
    const idx = virtualScrollState.sorted.findIndex(e => e.name === fileName);
    if (idx >= 0) {
      const itemHeight = virtualScrollState.itemHeight;
      // 滚动到目标项位置（居中）
      content.scrollTop = Math.max(0, idx * itemHeight - content.clientHeight / 2 + itemHeight / 2);
      // 重新渲染后查找 DOM 元素并高亮
      renderVirtualScroll();
      const item = Array.from(content.querySelectorAll('.workspace-file-item'))
        .find(el => el.dataset.name === fileName);
      if (item) {
        item.classList.add('highlight-new');
        setTimeout(() => item.classList.remove('highlight-new'), 2000);
      }
      return;
    }
  }

  // 非虚拟滚动模式：直接查找 DOM
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
  if (selectedPaths.size === 0) {
    btn.style.display = 'none';
  } else {
    btn.style.display = '';
  }
}

function updateDownloadBtn() {
  const btn = document.getElementById('workspaceDownloadDirBtn');
  const batchDeleteBtn = document.getElementById('workspaceBatchDeleteBtn');
  const countEl = document.getElementById('workspaceSelectedCount');
  if (selectedPaths.size === 0) {
    btn.style.display = 'none';
    batchDeleteBtn.style.display = 'none';
    countEl.style.display = 'none';
  } else {
    btn.style.display = '';
    batchDeleteBtn.style.display = '';
    countEl.style.display = '';
    countEl.textContent = `已选 ${selectedPaths.size}`;
  }
  updateAskBtn();
}
