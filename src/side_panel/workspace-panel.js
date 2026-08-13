// workspace-panel.js - 工作目录文件管理器 UI

import {
  getWorkspaceRoot, resetWorkspaceRoot, getAgentConfig, getAgentStatusDetail,
  listDirectory, readFileContent, writeFileContent,
  downloadFileStream, downloadFilesStream,
  downloadFileStreamWithProgress, downloadFilesStreamWithProgress,
  searchFilesRemote,
  renameFs, createDir, moveFs, deleteFs, getFileInfo,
  getFileIcon, formatFileSize, formatTime,
  supportsPreview, getPreviewType, getMimeType,
  switchWorkspace, removeAllowedPath
} from './workspace-manager.js';
import logger from '../shared/logger.js';
import { showToast, copyToClipboard } from './utils.js';
import state from './state.js';
import { renderFilePreviews } from './file-extract.js';
import { renderImagePreviews } from './image-helpers.js';
import { formatMarkdown, renderMermaidCharts, addCodeCopyButtons, addMermaidControls, addTableToolbarEvents, cleanTableForClipboard } from './markdown-render.js';
import { renderMermaidInContainer, convertSvgsToImages } from './chat-export.js';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { pptxToHtml } from '@jvmr/pptx-to-html';

import DOMPurify from 'dompurify';
import { t, registerTranslations, getLanguage } from '../shared/i18n.js';

// 配置 PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';

registerTranslations('zh', {
  workspace: {
    // 面板标题与按钮
    workDir: '工作目录',
    closePanel: '关闭面板',
    embedMode: '嵌入模式',
    floatMode: '浮窗模式',
    narrowViewportHint: '视口过窄，已切回浮窗模式',
    switchWorkdir: '切换工作目录',
    backToParent: '返回上级目录',
    uploadToCurrent: '上传文件到当前目录',
    newFolder: '新建文件夹',
    askSelectedFiles: '基于选中的文件进行问答',
    downloadSelected: '下载选中的文件/目录（多选打包为ZIP）',
    deleteSelected: '删除选中的文件',
    clearSearch: '清除',
    search: '搜索',
    searchPlaceholder: '搜索...',
    selectAllToggle: '全选/取消全选',
    // 表头
    colName: '文件名',
    colSize: '大小',
    colTime: '修改时间',
    // 空状态
    noMatch: '未找到匹配的文件',
    dirEmpty: '此目录为空',
    // 错误提示
    noWorkspace: '无法获取工作目录，请确认 Agent 已连接',
    loadDirFailed: '加载目录失败',
    refreshFailed: '无法刷新，请确认 Agent 已连接',
    agentNotConnected: 'Agent 未连接',
    agentNotConnectedUpload: 'Agent 未连接，无法上传',
    unsupportedFileType: '不支持的文件类型',
    unknownError: '未知错误',
    // 复制提示
    copiedFileName: '已复制文件名: {name}',
    copiedPath: '已复制路径: {path}',
    copyFailed: '复制失败',
    copiedToClipboard: '已复制到剪贴板',
    copyFailedManual: '复制失败，请手动选择复制',
    getContentFailed: '获取内容失败',
    codeCopiedToClipboard: '代码已复制到剪贴板',
    copyUnsupportedType: '此文件类型不支持复制文本内容',
    copiedToClipboardShort: '已复制到剪贴板',
    clickToCopy: '点击复制',
    // 预览相关
    preview: '预览',
    previewBtn: '预览',
    details: '详情',
    download: '下载',
    downloadFile: '下载文件',
    rename: '重命名',
    askFile: '基于文件问答',
    delete: '删除',
    copyAll: '复制',
    copyAllTitle: '复制全部内容',
    toggleRenderPreview: '切换渲染预览',
    openInBrowser: '在浏览器中打开',
    openInBrowserBtn: '在浏览器中打开',
    fullscreenPreview: '全屏预览',
    exitFullscreen: '退出全屏',
    enterEditMode: '进入编辑模式',
    edit: '编辑',
    save: '保存',
    saveChanges: '保存修改 (Ctrl+S)',
    cancelChanges: '取消修改 (Esc)',
    closePreview: '关闭预览',
    close: '关闭',
    confirm: '确定',
    cancel: '取消',
    switchToSourcePreview: '切换为源码预览',
    switchToRenderPreview: '切换为渲染预览',
    markdownRendered: 'Markdown 渲染',
    lineCount: '{count} 行',
    linesModified: '{count} 行 · 已修改',
    truncatedHint: '（仅显示前 {shown} 行，共 {total} 行，请下载查看完整内容）',
    fileTooLargeNoPreview: '文件过大 ({size})，不支持预览，请直接下载',
    fileTooLargeOpenInBrowser: '文件过大 ({size})，无法内置预览，请点击上方「在浏览器中打开」按钮查看',
    previewFailed: '预览失败: {error}',
    openFailed: '打开失败: {error}',
    documentEmpty: '（文档为空）',
    pptxEmptyOrFailed: 'PPTX 文件为空或解析失败',
    pageCount: '{count} 页',
    prevPage: '上一页',
    nextPage: '下一页',
    zoomOut: '缩小',
    zoomIn: '放大',
    fitPage: '适应页面',
    originalSize: '原始大小',
    imageLoadFailed: '图片加载失败',
    // Excel 预览
    parsingExcel: '正在解析 Excel 文件...',
    loadingData: '正在加载数据...',
    requestFailed: '请求失败: {error}',
    parseFailed: '解析失败: {error}',
    noSheetsInWorkbook: '工作簿中没有工作表',
    sheetNotFound: '未找到工作表数据',
    emptySheet: '（空工作表）',
    xlsxTruncatedHint: '仅显示前 {shown} 行，共 {total} 行，请下载查看完整内容',
    // 媒体预览
    unsupportedMediaHint: '⚠ 浏览器不支持播放此格式（{ext}），请下载后使用本地播放器查看。',
    // 下载/上传进度
    uploading: '上传中...',
    downloadInProgress: '下载中',
    uploadInProgress: '上传中',
    cancelUpload: '取消上传',
    downloadCanceled: '下载已取消',
    downloadFailed: '下载失败',
    downloadFailedWithError: '下载失败: {error}',
    savingToLocal: '正在由浏览器保存至本地...',
    savedToLocal: '已保存至本地',
    downloaded: '已下载: {name}',
    downloadedCount: '已下载 {count} 个文件',
    downloadedZip: '已下载 {count} 个文件（ZIP 压缩包）',
    fileCount: '{count} 个文件',
    // 上传结果
    uploadCanceled: '已取消上传',
    uploadSuccessCount: '成功 {count}',
    uploadSkippedCount: '跳过 {count}',
    uploadFailedCount: '失败 {count}',
    uploadComplete: '上传完成',
    uploadCompleteWithStats: '上传完成 · {stats}',
    uploadedFiles: '成功上传 {count} 个文件',
    filesSkipped: '{count} 个文件已存在，跳过上传',
    filesUploadFailed: '{count} 个文件上传失败',
    uploadFailed: '上传失败',
    uploadFailedWithStatus: '上传失败 ({status})',
    parseResponseFailed: '解析响应失败',
    networkError: '网络错误',
    // 文件操作
    cannotMoveToSubdir: '不能将目录移动到其子目录中',
    moving: '移动中...',
    movedToDir: '"{name}" 已移动到目标目录',
    movedToTarget: '"{name}" 已移动到 "{target}"',
    moveFailed: '移动失败: {error}',
    searching: '搜索中...',
    // 删除确认
    confirmDeleteDir: '确定要删除目录 "{name}" 及其所有内容吗？\n\n路径: {path}\n类型: 目录\n\n删除后可在回收站中恢复（7天后自动清理）',
    confirmDeleteFile: '确定要删除文件 "{name}" 吗？\n\n路径: {path}\n类型: 文件\n\n删除后可在回收站中恢复（7天后自动清理）',
    confirmDeleteTitle: '确认删除',
    dirDeleted: '目录 已删除',
    fileDeleted: '文件 已删除',
    deleteFailedWithError: '删除失败: {error}',
    deleteFailed: '删除失败',
    confirmBatchDelete: '确定要删除选中的 {count} 个文件/目录吗？\n\n{names}\n\n删除后可在回收站中恢复（7天后自动清理）',
    batchNamesMore: '\n• ... 等共 {count} 项',
    confirmBatchDeleteTitle: '确认批量删除',
    deletedCount: '已删除 {success} 项{failed}',
    deletedCountFailed: '，{count} 项失败',
    // 文件详情
    fileDetailsTitle: '{name} - 文件详情',
    getTypeDir: '目录',
    getTypeSymlink: '符号链接',
    getTypeFile: '文件',
    bytes: '字节',
    infoName: '名称',
    infoType: '类型',
    infoPath: '路径',
    infoSize: '大小',
    infoMime: 'MIME 类型',
    infoMtime: '修改时间',
    infoCtime: '创建时间',
    infoAtime: '访问时间',
    infoPermission: '权限',
    getDetailsFailed: '获取详情失败: {error}',
    // 切换工作目录
    getWorkdirInfoFailed: '获取工作目录信息失败',
    cannotConnectAgent: '无法连接 Agent，请确认代理已启动',
    switchWorkdirTitle: '切换工作目录',
    currentLabel: '当前: ',
    notSet: '未设置',
    selectFromAllowed: '从允许的目录中选择（非当前目录可移除）',
    orInputPath: '或输入绝对路径',
    manualPathPlaceholder: '/Users/you/path 或 ~/path',
    switchBtn: '切换',
    noAllowedPaths: '暂无允许的目录',
    currentTag: '当前',
    removeFromAllowed: '从允许列表移除',
    confirmRemovePath: '确定要从允许访问的目录列表中移除以下目录吗？\n{path}\n\n移除后 AI 将无法访问该目录，可重新切换工作目录再加回。',
    confirmRemovePathTitle: '确认移除允许目录',
    removedFromAllowed: '已从允许列表移除',
    removeFailedWithError: '移除失败: {error}',
    selectOrInputPath: '请选择或输入目标路径',
    alreadyCurrentWorkdir: '该目录已是当前工作目录',
    confirmSwitchToNew: '该路径不在允许列表内，切换后将自动创建目录并加入允许列表:\n{path}',
    confirmSwitchToNewTitle: '确认切换到新目录',
    switchFailedWithError: '切换失败: {error}',
    switchedTo: '已切换到: {path}',
    // 重命名/新建
    renameDir: '重命名目录',
    renameFile: '重命名文件',
    inputNewName: '输入新名称',
    renamedTo: '已重命名为 "{name}"',
    renameFailedWithError: '重命名失败: {error}',
    newFolderTitle: '新建文件夹',
    inputFolderName: '输入文件夹名称',
    folderCreated: '已创建文件夹 "{name}"',
    createFailedWithError: '创建失败: {error}',
    // 问答附件
    addedFilesToQuestion: '已添加 {count} 个文件到问答',
    addedFilesToQuestionNoImage: '已添加 {count} 个文件到问答（图片识别未启用，图片作为文件附件）',
    selectedCount: '已选 {count}',
    // 未保存修改
    unsavedChanges: '未保存的修改',
    discardChangesPrompt: '有未保存的修改，确定要{action}吗？',
    actionClosePreview: '关闭预览',
    actionCancelEdit: '取消编辑',
    saving: '保存中...',
    saveSuccess: '保存成功',
    saveFailedWithError: '保存失败: {error}',
    agentNamePrefix: ' · {name}',
    agentNotPaired: 'Agent 未配对',
    fileDetailsLabel: '文件详情',
    loadingLabel: '加载中...',
    // 导出
    export: '导出',
    exportDocx: 'Word',
    exportPdf: 'PDF',
    exportImage: '图片',
    exportMd: 'Markdown',
    copyMarkdownHint: '按住 Ctrl/Cmd 点击复制富文本',
  },
});

registerTranslations('en', {
  workspace: {
    // Panel title and buttons
    workDir: 'Working Directory',
    closePanel: 'Close Panel',
    embedMode: 'Embed mode',
    floatMode: 'Floating mode',
    narrowViewportHint: 'Viewport too narrow, switched back to floating mode',
    switchWorkdir: 'Switch Working Directory',
    backToParent: 'Back to Parent Directory',
    uploadToCurrent: 'Upload files to current directory',
    newFolder: 'New Folder',
    askSelectedFiles: 'Ask based on selected files',
    downloadSelected: 'Download selected files/directories (multi-select as ZIP)',
    deleteSelected: 'Delete selected files',
    clearSearch: 'Clear',
    search: 'Search',
    searchPlaceholder: 'Search...',
    selectAllToggle: 'Select All / Deselect All',
    // Column headers
    colName: 'Name',
    colSize: 'Size',
    colTime: 'Modified',
    // Empty states
    noMatch: 'No matching files found',
    dirEmpty: 'This directory is empty',
    // Error messages
    noWorkspace: 'Unable to access working directory. Please confirm the Agent is connected.',
    loadDirFailed: 'Failed to load directory',
    refreshFailed: 'Unable to refresh. Please confirm the Agent is connected.',
    agentNotConnected: 'Agent not connected',
    agentNotConnectedUpload: 'Agent not connected, unable to upload',
    unsupportedFileType: 'Unsupported file type',
    unknownError: 'Unknown error',
    // Copy messages
    copiedFileName: 'Copied file name: {name}',
    copiedPath: 'Copied path: {path}',
    copyFailed: 'Copy failed',
    copiedToClipboard: 'Copied to clipboard',
    copyFailedManual: 'Copy failed, please select and copy manually',
    getContentFailed: 'Failed to get content',
    codeCopiedToClipboard: 'Code copied to clipboard',
    copyUnsupportedType: 'Copying text content is not supported for this file type',
    copiedToClipboardShort: 'Copied to clipboard',
    clickToCopy: 'Click to copy',
    // Preview actions
    preview: 'Preview',
    previewBtn: 'Preview',
    details: 'Details',
    download: 'Download',
    downloadFile: 'Download file',
    rename: 'Rename',
    askFile: 'Ask about file',
    delete: 'Delete',
    copyAll: 'Copy',
    copyAllTitle: 'Copy all content',
    toggleRenderPreview: 'Toggle rendered preview',
    openInBrowser: 'Open in browser',
    openInBrowserBtn: 'Open in browser',
    fullscreenPreview: 'Fullscreen preview',
    exitFullscreen: 'Exit fullscreen',
    enterEditMode: 'Enter edit mode',
    edit: 'Edit',
    save: 'Save',
    saveChanges: 'Save changes (Ctrl+S)',
    cancelChanges: 'Cancel changes (Esc)',
    closePreview: 'Close preview',
    close: 'Close',
    confirm: 'OK',
    cancel: 'Cancel',
    switchToSourcePreview: 'Switch to source preview',
    switchToRenderPreview: 'Switch to rendered preview',
    markdownRendered: 'Markdown rendered',
    lineCount: '{count} lines',
    linesModified: '{count} lines · Modified',
    truncatedHint: '(Showing first {shown} of {total} lines. Download to view full content.)',
    fileTooLargeNoPreview: 'File too large ({size}). Preview not supported. Please download directly.',
    fileTooLargeOpenInBrowser: 'File too large ({size}) for built-in preview. Please click "Open in browser" above to view.',
    previewFailed: 'Preview failed: {error}',
    openFailed: 'Open failed: {error}',
    documentEmpty: '(Empty document)',
    pptxEmptyOrFailed: 'PPTX file is empty or failed to parse',
    pageCount: '{count} pages',
    prevPage: 'Previous page',
    nextPage: 'Next page',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    fitPage: 'Fit page',
    originalSize: 'Original size',
    imageLoadFailed: 'Image load failed',
    // Excel preview
    parsingExcel: 'Parsing Excel file...',
    loadingData: 'Loading data...',
    requestFailed: 'Request failed: {error}',
    parseFailed: 'Parse failed: {error}',
    noSheetsInWorkbook: 'No worksheets in the workbook',
    sheetNotFound: 'Worksheet data not found',
    emptySheet: '(Empty sheet)',
    xlsxTruncatedHint: 'Showing first {shown} of {total} rows. Download to view full content.',
    // Media preview
    unsupportedMediaHint: '⚠ The browser cannot play this format ({ext}). Please download and use a local player.',
    // Upload/Download progress
    uploading: 'Uploading...',
    downloadInProgress: 'Downloading',
    uploadInProgress: 'Uploading',
    cancelUpload: 'Cancel upload',
    downloadCanceled: 'Download canceled',
    downloadFailed: 'Download failed',
    downloadFailedWithError: 'Download failed: {error}',
    savingToLocal: 'Saving to local via browser...',
    savedToLocal: 'Saved to local',
    downloaded: 'Downloaded: {name}',
    downloadedCount: 'Downloaded {count} files',
    downloadedZip: 'Downloaded {count} files (ZIP archive)',
    fileCount: '{count} files',
    // Upload results
    uploadCanceled: 'Upload canceled',
    uploadSuccessCount: 'Success {count}',
    uploadSkippedCount: 'Skipped {count}',
    uploadFailedCount: 'Failed {count}',
    uploadComplete: 'Upload complete',
    uploadCompleteWithStats: 'Upload complete · {stats}',
    uploadedFiles: 'Successfully uploaded {count} files',
    filesSkipped: '{count} file(s) already exist, skipped',
    filesUploadFailed: '{count} file(s) failed to upload',
    uploadFailed: 'Upload failed',
    uploadFailedWithStatus: 'Upload failed ({status})',
    parseResponseFailed: 'Failed to parse response',
    networkError: 'Network error',
    // File operations
    cannotMoveToSubdir: 'Cannot move a directory into its own subdirectory',
    moving: 'Moving...',
    movedToDir: '"{name}" moved to target directory',
    movedToTarget: '"{name}" moved to "{target}"',
    moveFailed: 'Move failed: {error}',
    searching: 'Searching...',
    // Delete confirmation
    confirmDeleteDir: 'Are you sure you want to delete directory "{name}" and all its contents?\n\nPath: {path}\nType: Directory\n\nDeleted items can be restored from the trash (auto-cleaned after 7 days).',
    confirmDeleteFile: 'Are you sure you want to delete file "{name}"?\n\nPath: {path}\nType: File\n\nDeleted items can be restored from the trash (auto-cleaned after 7 days).',
    confirmDeleteTitle: 'Confirm Delete',
    dirDeleted: 'Directory deleted',
    fileDeleted: 'File deleted',
    deleteFailedWithError: 'Delete failed: {error}',
    deleteFailed: 'Delete failed',
    confirmBatchDelete: 'Are you sure you want to delete the selected {count} file(s)/directory(s)?\n\n{names}\n\nDeleted items can be restored from the trash (auto-cleaned after 7 days).',
    batchNamesMore: '\n• ... and {count} more',
    confirmBatchDeleteTitle: 'Confirm Batch Delete',
    deletedCount: 'Deleted {success} item(s){failed}',
    deletedCountFailed: ', {count} failed',
    // File details
    fileDetailsTitle: '{name} - File Details',
    getTypeDir: 'Directory',
    getTypeSymlink: 'Symbolic link',
    getTypeFile: 'File',
    bytes: 'bytes',
    infoName: 'Name',
    infoType: 'Type',
    infoPath: 'Path',
    infoSize: 'Size',
    infoMime: 'MIME Type',
    infoMtime: 'Modified',
    infoCtime: 'Created',
    infoAtime: 'Accessed',
    infoPermission: 'Permission',
    getDetailsFailed: 'Failed to get details: {error}',
    // Switch working directory
    getWorkdirInfoFailed: 'Failed to get working directory info',
    cannotConnectAgent: 'Cannot connect to Agent. Please confirm the agent is running.',
    switchWorkdirTitle: 'Switch Working Directory',
    currentLabel: 'Current: ',
    notSet: 'Not set',
    selectFromAllowed: 'Select from allowed directories (non-current can be removed)',
    orInputPath: 'Or enter an absolute path',
    manualPathPlaceholder: '/Users/you/path or ~/path',
    switchBtn: 'Switch',
    noAllowedPaths: 'No allowed directories',
    currentTag: 'Current',
    removeFromAllowed: 'Remove from allowed list',
    confirmRemovePath: 'Are you sure you want to remove the following directory from the allowed list?\n{path}\n\nAfter removal, the AI will no longer be able to access this directory. You can switch the working directory again to add it back.',
    confirmRemovePathTitle: 'Confirm Remove Allowed Directory',
    removedFromAllowed: 'Removed from allowed list',
    removeFailedWithError: 'Remove failed: {error}',
    selectOrInputPath: 'Please select or enter a target path',
    alreadyCurrentWorkdir: 'This directory is already the current working directory',
    confirmSwitchToNew: 'This path is not in the allowed list. Switching will automatically create the directory and add it to the allowed list:\n{path}',
    confirmSwitchToNewTitle: 'Confirm Switch to New Directory',
    switchFailedWithError: 'Switch failed: {error}',
    switchedTo: 'Switched to: {path}',
    // Rename/New folder
    renameDir: 'Rename Directory',
    renameFile: 'Rename File',
    inputNewName: 'Enter new name',
    renamedTo: 'Renamed to "{name}"',
    renameFailedWithError: 'Rename failed: {error}',
    newFolderTitle: 'New Folder',
    inputFolderName: 'Enter folder name',
    folderCreated: 'Folder "{name}" created',
    createFailedWithError: 'Create failed: {error}',
    // Question attachments
    addedFilesToQuestion: 'Added {count} file(s) to question',
    addedFilesToQuestionNoImage: 'Added {count} file(s) to question (image recognition disabled; images attached as files)',
    selectedCount: '{count} selected',
    // Unsaved changes
    unsavedChanges: 'Unsaved Changes',
    discardChangesPrompt: 'You have unsaved changes. Are you sure you want to {action}?',
    actionClosePreview: 'close the preview',
    actionCancelEdit: 'cancel editing',
    saving: 'Saving...',
    saveSuccess: 'Saved successfully',
    saveFailedWithError: 'Save failed: {error}',
    agentNamePrefix: ' · {name}',
    agentNotPaired: 'Agent not paired',
    fileDetailsLabel: 'File Details',
    loadingLabel: 'Loading...',
    // Export
    export: 'Export',
    exportDocx: 'Word',
    exportPdf: 'PDF',
    exportImage: 'Image',
    exportMd: 'Markdown',
    copyMarkdownHint: 'Ctrl/Cmd+Click to copy rich text',
  },
});


// 当前浏览路径
let currentPath = null;
// 工作目录根路径
let workspaceRoot = null;
// 路径历史（用于返回上级）
let pathHistory = [];
// 路径历史最大长度，超出时丢弃最早的（防止无限增长）
const PATH_HISTORY_MAX = 50;
// 浮窗/嵌入双模式常量：嵌入面板最小宽度、左列（标签栏+对话+输入）最小宽度、阈值与默认宽度
const EMBED_MIN_PANEL_W = 240;
const EMBED_MIN_LEFT_W = 280;
const EMBED_MIN_TOTAL_W = EMBED_MIN_PANEL_W + EMBED_MIN_LEFT_W;
const EMBED_DEFAULT_W = 320;
const STORAGE_EMBED_MODE = 'workspacePanelEmbedMode';
const STORAGE_EMBED_WIDTH = 'workspacePanelEmbedWidth';
// 是否处于嵌入模式；嵌入模式下面板宽度；等待宽度/连接就绪后补恢复的挂起标志；
// 用户偏好的模式（与当前布局状态分离）：点 × 收起面板不改变偏好，下次打开直接按偏好进入
let embedMode = false;
let embedWidth = EMBED_DEFAULT_W;
let pendingRestoreEmbed = false;
let embedPreference = false;
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
// 预览是否因产物入口（previewArtifactFile）而自动展开面板：
// 为 true 时关闭预览会一并收起面板，避免残留空的工作目录页面（用户需关闭两次）
let previewAutoClosePanel = false;

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
    <button class="workspace-panel-toggle" id="workspacePanelToggle" title="${t('workspace.workDir')}">
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
          <span>${t('workspace.workDir')}</span>
          <span class="workspace-agent-name" id="workspaceAgentName"></span>
          <button class="workspace-panel-mode-btn" id="workspacePanelModeBtn" title="${t('workspace.embedMode')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M15 3v18"/>
            </svg>
          </button>
          <button class="workspace-panel-close" id="workspacePanelClose" title="${t('workspace.closePanel')}">×</button>
        </div>
        <div class="workspace-panel-breadcrumb-row">
          <button class="workspace-panel-switch-btn" id="workspaceSwitchBtn" title="${t('workspace.switchWorkdir')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <polyline points="9 14 12 17 15 14"/>
            </svg>
          </button>
          <div class="workspace-panel-breadcrumb" id="workspaceBreadcrumb"></div>
        </div>
      </div>
      <div class="workspace-panel-toolbar" id="workspaceToolbar">
        <button class="workspace-toolbar-btn" id="workspaceBackBtn" title="${t('workspace.backToParent')}" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <button class="workspace-toolbar-btn" id="workspaceRefreshBtn" title="${t('common.refresh')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
        </button>
        <button class="workspace-toolbar-btn" id="workspaceUploadBtn" title="${t('workspace.uploadToCurrent')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
        </button>
        <button class="workspace-toolbar-btn" id="workspaceNewFolderBtn" title="${t('workspace.newFolder')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
        <button class="workspace-toolbar-btn" id="workspaceAskBtn" title="${t('workspace.askSelectedFiles')}" style="display:none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>
        <button class="workspace-toolbar-btn" id="workspaceDownloadDirBtn" title="${t('workspace.downloadSelected')}" style="display:none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
        </button>
        <button class="workspace-toolbar-btn" id="workspaceBatchDeleteBtn" title="${t('workspace.deleteSelected')}" style="display:none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
        </button>
        <span class="workspace-toolbar-selected" id="workspaceSelectedCount" style="display:none;"></span>
        <div class="workspace-search-box">
          <input type="text" id="workspaceSearchInput" placeholder="${t('workspace.searchPlaceholder')}" />
          <button id="workspaceSearchClear" title="${t('workspace.clearSearch')}" style="display:none;">×</button>
          <button id="workspaceSearchBtn" title="${t('workspace.search')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
        </div>
      </div>
      <!-- 排序标题行 -->
      <div class="workspace-file-header">
        <div class="workspace-file-select" id="workspaceSelectAll" title="${t('workspace.selectAllToggle')}">
          <span class="workspace-checkbox"></span>
        </div>
        <div class="workspace-file-header-name sortable" data-sort="name">
          ${t('workspace.colName')} <span class="sort-indicator" id="sortNameIndicator"></span>
        </div>
        <div class="workspace-file-header-size sortable" data-sort="size">
          ${t('workspace.colSize')} <span class="sort-indicator" id="sortSizeIndicator"></span>
        </div>
        <div class="workspace-file-header-time sortable" data-sort="time">
          ${t('workspace.colTime')} <span class="sort-indicator" id="sortTimeIndicator"></span>
        </div>
      </div>
      <div class="workspace-panel-content" id="workspacePanelContent">
        <div class="workspace-panel-loading">${t('common.loading')}</div>
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
          <button class="workspace-preview-copy-btn workspace-preview-icon-btn" id="workspacePreviewCopyBtn" title="${t('workspace.copyAllTitle')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <div class="workspace-preview-export-menu" id="workspacePreviewExportMenu" style="display:none;">
            <button class="workspace-preview-export-btn workspace-preview-icon-btn ws-export-trigger-btn" id="workspacePreviewExportBtn" title="${t('workspace.export')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <div class="ws-export-dropdown" id="workspacePreviewExportDropdown">
              <button class="ws-export-dropdown-item" data-export-type="docx">
                <svg viewBox="0 0 1024 1024" width="18" height="18"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#555"/><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#555"/><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#555"/></svg>
                <span>${t('workspace.export')} ${t('workspace.exportDocx')}</span>
              </button>
              <button class="ws-export-dropdown-item" data-export-type="pdf">
                <svg viewBox="0 0 1024 1024" width="18" height="18"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#555"/><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#555"/></svg>
                <span>${t('workspace.export')} ${t('workspace.exportPdf')}</span>
              </button>
              <button class="ws-export-dropdown-item" data-export-type="image">
                <svg viewBox="0 0 1024 1024" width="18" height="18"><path d="M400.696 268.795c-17.249 0-31.233 13.986-31.233 31.233v30.471c0 17.249 13.986 31.233 31.233 31.233s31.233-13.986 31.233-31.233v-30.471c0-17.249-13.985-31.233-31.233-31.233z" fill="#555"/><path d="M623.649 361.734c17.249 0 31.234-13.986 31.234-31.233v-30.471c0-17.249-13.986-31.233-31.234-31.233s-31.233 13.986-31.233 31.233v30.471c-0.001 17.248 13.985 31.233 31.233 31.233z" fill="#555"/><path d="M438.295 388.804c-14.656 9.104-19.155 28.362-10.050 43.013 11.209 18.047 41.976 48.59 86.157 48.59 43.958 0 75.1-30.313 86.574-48.223 9.303-14.529 5.068-33.847-9.455-43.15-14.539-9.298-33.852-5.068-43.15 9.455-0.122 0.199-13.38 19.45-33.969 19.45-20.009 0-32.444-18.128-33.278-19.373-9.166-14.423-28.28-18.805-42.829-9.761z" fill="#555"/><path d="M824.508503 116.690676 571.592236 116.690676c-17.248849 0-31.233352 13.985526-31.233352 31.233352s13.985526 31.233352 31.233352 31.233352l252.916267 0c40.181141 0 72.878844 32.692586 72.878844 72.878844l0 396.966057-189.334159-165.29465c-12.20088-10.655687-30.517037-10.207479-42.173518 0.9967L468.578048 674.16231 309.521472 517.519714c-11.895935-11.70253-30.903847-12.002358-43.154869-0.645706L126.957507 646.163629l0-394.126382c0-40.186258 32.692586-72.878844 72.878844-72.878844l252.916267 0c17.248849 0 31.233352-13.985526 31.233352-31.233352S470.000444 116.690676 452.751594 116.690676L199.836351 116.690676c-74.632791 0-135.346571 60.71378-135.346571 135.346571l0 520.56405c0 74.632791 60.71378 135.346571 135.346571 135.346571l252.916267 0c17.248849 0 31.233352-13.985526 31.233352-31.233352s-13.985526-31.233352-31.233352-31.233352L199.836351 845.481164c-40.186258 0-72.878844-32.692586-72.878844-72.878844l0-41.23924 160.003134-148.385539 159.428036 157.007917c12.048407 11.865235 31.361265 11.981892 43.546795 0.274246l198.576661-190.68697 208.876238 182.346001 0 40.683585c0 40.186258-32.697703 72.878844-72.878844 72.878844L571.592236 845.481164c-17.248849 0-31.233352 13.985526-31.233352 31.233352s13.985526 31.233352 31.233352 31.233352l252.916267 0c74.627674 0 135.346571-60.71378 135.346571-135.346571L959.855074 252.037247C959.855074 177.404456 899.136178 116.690676 824.508503 116.690676z" fill="#555"/></svg>
                <span>${t('workspace.export')} ${t('workspace.exportImage')}</span>
              </button>
              <button class="ws-export-dropdown-item" data-export-type="md">
                <svg viewBox="0 0 1024 1024" width="18" height="18"><path d="M601.216 85.333333a42.666667 42.666667 0 0 1 30.485333 12.821334l209.450667 213.973333a42.666667 42.666667 0 0 1 12.181333 29.866667V853.333333a85.333333 85.333333 0 0 1-85.333333 85.333334H256a85.333333 85.333333 0 0 1-85.333333-85.333334V170.666667a85.333333 85.333333 0 0 1 85.333333-85.333334h345.216z m-35.584 64H256a21.333333 21.333333 0 0 0-21.333333 21.333334v682.666666a21.333333 21.333333 0 0 0 21.333333 21.333334h512a21.333333 21.333333 0 0 0 21.333333-21.333334V395.413333h-191.68a32 32 0 0 1-32-32L565.632 149.333333z" fill="#555"/><path d="M384.341333 800l-3.072-0.106667a32 32 0 0 1-29.162666-34.624l21.973333-256c2.752-32.256 46.165333-40.490667 60.544-11.477333l77.290667 156.010667 78.805333-156.224c14.08-27.925333 55.082667-20.906667 60.074667 8.789333l0.384 3.050667 20.714666 256a32 32 0 0 1-63.786666 5.162666l-11.541334-142.549333-56.341333 111.722667c-11.413333 22.613333-42.88 23.381333-55.744 2.517333l-1.493333-2.730667-54.912-110.826666-12.181334 142.016a32 32 0 0 1-31.552 29.269333z" fill="#555"/></svg>
                <span>${t('workspace.export')} ${t('workspace.exportMd')}</span>
              </button>
            </div>
          </div>
          <button class="workspace-preview-md-toggle-btn workspace-preview-icon-btn" id="workspacePreviewMdToggleBtn" title="${t('workspace.toggleRenderPreview')}" style="display:none;">
            <svg class="workspace-preview-md-icon-preview" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <svg class="workspace-preview-md-icon-source" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="display:none;">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
          </button>
          <button class="workspace-preview-download-btn workspace-preview-icon-btn" id="workspacePreviewDownloadBtn" title="${t('workspace.downloadFile')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button class="workspace-preview-download-btn workspace-preview-icon-btn" id="workspacePreviewOpenBrowserBtn" title="${t('workspace.openInBrowser')}" style="display:none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
          <button class="workspace-preview-fullscreen-btn" id="workspacePreviewFullscreenBtn" title="${t('workspace.fullscreenPreview')}" style="display:none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          </button>
          <button class="workspace-preview-edit-btn workspace-preview-icon-btn" id="workspacePreviewEditBtn" title="${t('workspace.enterEditMode')}" style="display:none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="workspace-preview-save-btn workspace-preview-icon-btn" id="workspacePreviewSaveBtn" title="${t('workspace.saveChanges')}" style="display:none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
          </button>
          <button class="workspace-preview-cancel-btn workspace-preview-icon-btn" id="workspacePreviewCancelBtn" title="${t('workspace.cancelChanges')}" style="display:none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <button class="workspace-preview-close" id="workspacePreviewClose" title="${t('workspace.closePreview')}">×</button>
        </div>
        <div class="workspace-preview-content" id="workspacePreviewContent"></div>
      </div>
    </div>
  `;
  // 挂载到主内容区（mainRow）右侧：浮窗模式脱离文档流不受影响，嵌入模式作为右列参与分栏
  const mainRow = document.getElementById('mainRow') || document.body;
  mainRow.appendChild(container);

  bindEvents();
  loadSearchHistory();
  updateWorkspaceAgentName();
  setupEmbedDivider();
  setupEmbedResizeObserver();
  restoreEmbedState();
  logger.debug('[WorkspacePanel] workspace panelinitializing');
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
    if (!isOpen) {
      // 用户主动打开面板：取消“关闭预览自动收起面板”标记（面板不再因产物预览而展开）
      previewAutoClosePanel = false;
    }
    if (isOpen) {
      closePanel();
    } else if (embedPreference) {
      // 偏好嵌入模式（点 × 收起不改变偏好）：打开时直接进入嵌入布局；宽度不足则回退浮窗
      const mainRow = document.getElementById('mainRow');
      const avail = mainRow ? mainRow.clientWidth : window.innerWidth;
      if (avail < EMBED_MIN_TOTAL_W) {
        await openPanel();
        showToast(t('workspace.narrowViewportHint'), 'error');
        return;
      }
      await openPanel();
      embedWidth = clampEmbedWidth(embedWidth);
      applyEmbedMode();
      embedMode = true;
      pendingRestoreEmbed = false;
      await persistEmbedState();
    } else {
      await openPanel();
    }
  });

  // 关闭按钮
  document.getElementById('workspacePanelClose').addEventListener('click', (e) => {
    e.stopPropagation();
    closePanel();
  });

  // 浮窗/嵌入模式切换按钮
  document.getElementById('workspacePanelModeBtn').addEventListener('click', async (e) => {
    e.stopPropagation();
    await toggleEmbedMode();
  });

  // 切换工作目录按钮
  const switchBtn = document.getElementById('workspaceSwitchBtn');
  if (switchBtn) {
    switchBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await showSwitchWorkdirDialog();
    });
  }

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
  // 文件列表双击（事件委托）：支持预览的文件双击直接进入预览
  document.getElementById('workspacePanelContent').addEventListener('dblclick', handleFileListDblClick);
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
  document.getElementById('workspacePreviewClose').addEventListener('click', () => closePreview());
  document.getElementById('workspacePreviewCopyBtn').addEventListener('click', (e) => copyPreviewContent(e));
  document.getElementById('workspacePreviewDownloadBtn').addEventListener('click', downloadPreviewFile);
  document.getElementById('workspacePreviewOpenBrowserBtn').addEventListener('click', openPreviewInBrowser);
  document.getElementById('workspacePreviewFullscreenBtn').addEventListener('click', togglePreviewFullscreen);
  document.getElementById('workspacePreviewMdToggleBtn').addEventListener('click', toggleMarkdownPreview);
  document.getElementById('workspacePreviewEditBtn').addEventListener('click', enterEditMode);
  document.getElementById('workspacePreviewSaveBtn').addEventListener('click', saveEditedFile);
  document.getElementById('workspacePreviewCancelBtn').addEventListener('click', cancelEditMode);

  // 导出菜单事件绑定
  bindExportMenuEvents();
  
  // 编辑模式快捷键
  document.addEventListener('keydown', handlePreviewKeydown);
  
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
        showToast(t('workspace.copiedFileName', { name: fileName }));
      } catch {
        showToast(t('workspace.copyFailed'), 'error');
      }
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      if (!filePath) return;
      try {
        await navigator.clipboard.writeText(filePath);
        showToast(t('workspace.copiedPath', { path: filePath }));
      } catch {
        showToast(t('workspace.copyFailed'), 'error');
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

// ========== 浮窗/嵌入双模式 ==========

// 模式按钮图标：进入嵌入（右侧分栏）与退出嵌入（右侧面板含收起箭头）
const EMBED_ICON_SPLIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>';
const EMBED_ICON_FLOAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/><path d="m8 9-3 3 3 3"/></svg>';

/**
 * 计算嵌入模式下面板最大可用宽度（保证左列至少保留 EMBED_MIN_LEFT_W）
 */
function getMaxEmbedWidth() {
  const mainRow = document.getElementById('mainRow');
  const avail = mainRow ? mainRow.clientWidth : window.innerWidth;
  return Math.max(EMBED_MIN_PANEL_W, avail - EMBED_MIN_LEFT_W);
}

function clampEmbedWidth(w) {
  return Math.max(EMBED_MIN_PANEL_W, Math.min(w, getMaxEmbedWidth()));
}

/**
 * 同步模式按钮图标与 tooltip（embedded 为 true 时显示"浮窗模式"图标）
 */
function updateModeBtnIcon(embedded) {
  const btn = document.getElementById('workspacePanelModeBtn');
  if (!btn) return;
  btn.title = t(embedded ? 'workspace.floatMode' : 'workspace.embedMode');
  btn.innerHTML = embedded ? EMBED_ICON_FLOAT : EMBED_ICON_SPLIT;
}

function applyEmbedMode() {
  const container = document.getElementById('workspacePanelContainer');
  if (!container) return;
  container.classList.add('embedded');
  container.style.setProperty('--ws-embed-width', `${embedWidth}px`);
  updateModeBtnIcon(true);
}

function exitEmbedMode() {
  const container = document.getElementById('workspacePanelContainer');
  if (container) container.classList.remove('embedded');
  updateModeBtnIcon(false);
}

async function persistEmbedState() {
  try {
    await chrome.storage.local.set({
      [STORAGE_EMBED_MODE]: embedMode,
      [STORAGE_EMBED_WIDTH]: embedWidth,
    });
  } catch (err) {
    logger.warn('[WorkspacePanel] persist embed state failed', err);
  }
}

/**
 * 切换浮窗/嵌入模式：进入嵌入前检查宽度，不足则提示并保持浮窗
 */
async function toggleEmbedMode() {
  if (embedMode) {
    // 主动点切换按钮退出嵌入：偏好改为浮窗并持久化
    embedMode = false;
    embedPreference = false;
    pendingRestoreEmbed = false;
    exitEmbedMode();
    await persistEmbedState();
    return;
  }
  const mainRow = document.getElementById('mainRow');
  const avail = mainRow ? mainRow.clientWidth : window.innerWidth;
  if (avail < EMBED_MIN_TOTAL_W) {
    showToast(t('workspace.narrowViewportHint'), 'error');
    return;
  }
  const panel = document.getElementById('workspacePanel');
  if (!panel.classList.contains('expanded')) {
    await openPanel();
  }
  embedWidth = clampEmbedWidth(embedWidth);
  applyEmbedMode();
  embedMode = true;
  embedPreference = true;
  pendingRestoreEmbed = false;
  await persistEmbedState();
}

/**
 * 嵌入模式宽度拖拽：面板左侧把手，拖拽时实时更新宽度，松手后持久化
 */
function setupEmbedDivider() {
  const container = document.getElementById('workspacePanelContainer');
  const divider = document.createElement('div');
  divider.className = 'workspace-embed-divider';
  divider.id = 'workspaceEmbedDivider';
  container.appendChild(divider);

  divider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = embedWidth;
    container.classList.add('resizing');

    function onMove(ev) {
      // 把手在面板最左侧：向左拖（clientX 变小）面板变宽
      const w = clampEmbedWidth(startW + (startX - ev.clientX));
      embedWidth = w;
      container.style.setProperty('--ws-embed-width', `${w}px`);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      container.classList.remove('resizing');
      persistEmbedState();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/**
 * 窄屏自动回退：嵌入模式下主内容区宽度不足阈值时自动切回浮窗；
 * 挂起中的嵌入恢复（宽度不足或 Agent 未连接）在宽度就绪时自动补恢复
 */
function setupEmbedResizeObserver() {
  const mainRow = document.getElementById('mainRow');
  if (!mainRow || typeof ResizeObserver === 'undefined') return;
  const ro = new ResizeObserver(() => {
    if (embedMode) {
      if (mainRow.clientWidth < EMBED_MIN_TOTAL_W) {
        pendingRestoreEmbed = false;
        embedMode = false;
        embedPreference = false; // 宽度不允许，偏好回退为浮窗
        exitEmbedMode();
        persistEmbedState();
        showToast(t('workspace.narrowViewportHint'), 'error');
      }
      return;
    }
    // 首次恢复因宽度未就绪而挂起时，宽度足够后自动补恢复
    if (pendingRestoreEmbed && mainRow.clientWidth >= EMBED_MIN_TOTAL_W) {
      deferredEmbedRestore();
    }
  });
  ro.observe(mainRow);
}

/**
 * 尝试应用嵌入模式恢复；宽度不足或 Agent 未连接（容器隐藏）时返回 false
 * @returns {Promise<boolean>}
 */
async function tryApplyEmbedRestore() {
  if (embedMode) return true;
  const container = document.getElementById('workspacePanelContainer');
  if (container && container.style.display === 'none') return false; // Agent 未连接，等待连接后恢复
  const mainRow = document.getElementById('mainRow');
  const avail = mainRow ? mainRow.clientWidth : window.innerWidth;
  if (avail < EMBED_MIN_TOTAL_W) return false; // 宽度尚未就绪
  embedWidth = clampEmbedWidth(embedWidth);
  const panel = document.getElementById('workspacePanel');
  if (!panel.classList.contains('expanded')) {
    await openPanel();
  }
  applyEmbedMode();
  embedMode = true;
  return true;
}

/**
 * 触发一次补恢复；失败（宽度/连接仍未就绪）时保持挂起等待后续时机
 */
function deferredEmbedRestore() {
  pendingRestoreEmbed = false;
  tryApplyEmbedRestore()
    .then(ok => {
      if (!ok) pendingRestoreEmbed = true; // 仍未就绪，继续挂起等待
    })
    .catch(err => {
      logger.warn('[WorkspacePanel] deferred embed restore failed', err);
      pendingRestoreEmbed = true;
    });
}

/**
 * 从本地存储恢复嵌入模式状态（重开侧边栏后保持上次布局与宽度）
 * 首屏布局/宽度未就绪时不放弃，标记挂起等待补恢复
 */
async function restoreEmbedState() {
  try {
    const data = await chrome.storage.local.get([STORAGE_EMBED_MODE, STORAGE_EMBED_WIDTH]);
    if (typeof data[STORAGE_EMBED_WIDTH] === 'number' && data[STORAGE_EMBED_WIDTH] >= EMBED_MIN_PANEL_W) {
      embedWidth = Math.round(data[STORAGE_EMBED_WIDTH]);
    }
    if (!data[STORAGE_EMBED_MODE]) return;
    embedPreference = true; // 存储为嵌入：即使本次宽度不足挂起，偏好仍保持嵌入
    // 等两帧让首屏布局稳定后再测量（side panel 初始宽度可能尚未恢复），setTimeout 兜底 rAF 不触发的情况
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      requestAnimationFrame(() => requestAnimationFrame(finish));
      setTimeout(finish, 500);
    });
    if (await tryApplyEmbedRestore()) return;
    // 宽度或 Agent 连接尚未就绪：挂起恢复，由 ResizeObserver / Agent 连接事件补恢复
    pendingRestoreEmbed = true;
  } catch (err) {
    logger.warn('[WorkspacePanel] restore embed state failed', err);
  }
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
    showError(t('workspace.noWorkspace'));
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
  content.innerHTML = `<div class="workspace-panel-loading">${t('common.loading')}</div>`;

  // 查缓存（LRU：命中时自动移到末尾）
  const cached = getDirCache(dirPath);
  if (cached) {
    cachedEntries = cached.entries;
    renderCurrentEntries();
    return;
  }

  const result = await listDirectory(dirPath);
  if (!result.success) {
    showError(result.error || t('workspace.loadDirFailed'));
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
    normalizePath(entry.matchPath).replace(normalizePath(workspaceRoot), '').replace(/^\//, '') + '/' + entry.name : '';
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
        ${canPreview ? `<button class="workspace-file-btn preview" title="${t('workspace.previewBtn')}" data-action="preview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>` : ''}
        <button class="workspace-file-btn info" title="${t('workspace.details')}" data-action="info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button>
        <button class="workspace-file-btn download" title="${t('workspace.download')}" data-action="download"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
        <button class="workspace-file-btn rename" title="${t('workspace.rename')}" data-action="rename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
        <button class="workspace-file-btn ask" title="${t('workspace.askFile')}" data-action="ask"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></button>
        <button class="workspace-file-btn delete" title="${t('workspace.delete')}" data-action="delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
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
    content.innerHTML = isSearchMode ? `<div class="workspace-panel-empty">${t('workspace.noMatch')}</div>` : `<div class="workspace-panel-empty">${t('workspace.dirEmpty')}</div>`;
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
  // 用户主动与文件列表交互：取消“关闭预览自动收起面板”标记，
  // 面板不再因产物预览而展开，关闭预览时保持展开
  previewAutoClosePanel = false;

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
      showToast(t('workspace.copiedFileName', { name: item.dataset.name }));
    }).catch(() => {
      showToast(t('workspace.copyFailed'), 'error');
    });
    return;
  }

  // Ctrl/Cmd + Shift + 单击：复制完整路径
  if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
    e.stopPropagation();
    navigator.clipboard.writeText(path).then(() => {
      showToast(t('workspace.copiedPath', { path }));
    }).catch(() => {
      showToast(t('workspace.copyFailed'), 'error');
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
 * 文件列表双击处理：支持预览的文件双击直接进入预览
 */
async function handleFileListDblClick(e) {
  const item = e.target.closest('.workspace-file-item');
  if (!item) return;
  // 用户主动与文件列表交互：取消“关闭预览自动收起面板”标记，
  // 面板不再因产物预览而展开，关闭预览时保持展开
  previewAutoClosePanel = false;

  const path = item.dataset.path;
  const type = item.dataset.type;
  const name = item.dataset.name;

  // 在 action 按钮上双击不触发预览，避免与单击行为冲突
  if (e.target.closest('[data-action]')) return;
  // 在 checkbox 上双击不触发预览
  if (e.target.closest('.workspace-file-select')) return;

  // 双击目录：进入目录
  if (type === 'directory') {
    e.stopPropagation();
    pushPathHistory(currentPath);
    await navigateToPath(path);
    return;
  }

  // 双击文件：如果支持预览则打开预览
  if (type === 'file' && supportsPreview(name)) {
    e.stopPropagation();
    await previewFile(path, name);
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
const PREVIEW_MAX_PPTX  = 50 * 1024 * 1024;  // PPTX: 50MB
const PREVIEW_MAX_XLSX  = 50 * 1024 * 1024;  // Excel: 50MB（服务端解析，无性能瓶颈）
const PREVIEW_MAX_IMAGE = 50 * 1024 * 1024;  // 图片: 50MB
const PREVIEW_MAX_VIDEO = 200 * 1024 * 1024; // 视频: 200MB（流式播放，可放宽）
const PREVIEW_MAX_AUDIO = 100 * 1024 * 1024; // 音频: 100MB
const PREVIEW_MAX_LINES = 10000;              // 文本预览最大渲染行数
const PREVIEW_XLSX_MAX_ROWS = 2000;            // Excel 预览最大渲染行数（防止 DOM 爆炸卡死）

/**
 * 从 Agent 后端获取文件二进制内容（ArrayBuffer）
 * 手动读取 response body stream，绕过 blob/arrayBuffer 等中间 API，
 * 避免 Content-Disposition: attachment 响应头导致的潜在数据截断
 */
async function fetchFileArrayBuffer(filePath) {
  const config = await getAgentConfig();
  if (!config) throw new Error(t('workspace.agentNotPaired'));
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
  previewContent.innerHTML = `<div class="workspace-panel-loading">${t('common.loading')}</div>`;
  previewArea.style.display = 'flex';
  copyBtn.style.display = '';
  downloadBtn.style.display = '';
  openBrowserBtn.style.display = 'none';
  fullscreenBtn.style.display = 'none';
  mdToggleBtn.style.display = 'none';
  mdToggleBtn.classList.remove('active');
  updateMdToggleIcon(mdToggleBtn, false);
  // 重置编辑相关按钮
  const editBtn = document.getElementById('workspacePreviewEditBtn');
  const saveBtn = document.getElementById('workspacePreviewSaveBtn');
  const cancelBtn = document.getElementById('workspacePreviewCancelBtn');
  editBtn.style.display = 'none';
  saveBtn.style.display = 'none';
  cancelBtn.style.display = 'none';
  delete previewArea.dataset.editMode;
  delete previewArea.dataset.origContent;
  previewArea.classList.remove('has-unsaved');
  previewFilename.classList.remove('modified');
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
      previewContent.innerHTML = `<div class="workspace-panel-error">${t('workspace.fileTooLargeNoPreview', { size: formatFileSize(fileSize) })}</div>`;
      return;
    }
    // 文本文件显示编辑按钮
    editBtn.style.display = '';
    fullscreenBtn.style.display = '';
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const result = await readFileContent(filePath);
    if (!result.success) {
      previewContent.innerHTML = `<div class="workspace-panel-error">${t('workspace.previewFailed', { error: escapeHtml(result.error || t('workspace.unknownError')) })}</div>`;
      return;
    }
    const text = result.content || '';
    // 存储原文用于编辑模式
    previewArea.dataset.origContent = text;

    if (ext === 'md' || ext === 'markdown') {
      mdToggleBtn.style.display = '';
      previewArea.dataset.markdownText = text;
      previewContent.classList.add('markdown-rendered');
      mdToggleBtn.classList.add('active');
      mdToggleBtn.title = t('workspace.switchToSourcePreview');
      updateMdToggleIcon(mdToggleBtn, true);
      copyBtn.style.display = '';
      // 渲染模式下显示导出菜单，隐藏下载按钮
      const downloadBtn = document.getElementById('workspacePreviewDownloadBtn');
      if (downloadBtn) downloadBtn.style.display = 'none';
      const exportMenu = document.getElementById('workspacePreviewExportMenu');
      if (exportMenu) exportMenu.style.display = '';
      previewContent.innerHTML = `<div class="markdown-body workspace-preview-markdown">${formatMarkdown(text)}</div>`;
      renderMermaidChartsInContainer(previewContent);
      bindCodeCopyButtonsInContainer(previewContent);
      addTableToolbarEvents();
      lineCountEl.textContent = '';
      updateCopyBtnTooltip(true);
      return;
    }
    // 普通文本/代码
    const lang = getLanguageClass(fileName);
    const lines = text.split('\n');
    lineCountEl.textContent = t('workspace.lineCount', { count: lines.length });
    const truncated = lines.length > PREVIEW_MAX_LINES;
    const displayLines = truncated ? lines.slice(0, PREVIEW_MAX_LINES) : lines;
    let numberedHtml = '<table class="workspace-preview-code-table"><tbody>';
    for (let i = 0; i < displayLines.length; i++) {
      numberedHtml += `<tr><td class="line-num">${i + 1}</td><td class="line-content"><code class="${lang}">${escapeHtml(displayLines[i])}</code></td></tr>`;
    }
    if (truncated) {
      numberedHtml += `<tr><td class="line-num">…</td><td class="line-content"><code>${t('workspace.truncatedHint', { shown: PREVIEW_MAX_LINES, total: lines.length })}</code></td></tr>`;
    }
    numberedHtml += '</tbody></table>';
    previewContent.innerHTML = numberedHtml;
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
      pptx: PREVIEW_MAX_PPTX,
      xlsx: PREVIEW_MAX_XLSX,
      image: PREVIEW_MAX_IMAGE,
      video: PREVIEW_MAX_VIDEO,
      audio: PREVIEW_MAX_AUDIO,
    }[previewType] || PREVIEW_MAX_TEXT;

    if (fileSize > maxSize) {
      const canOpenBrowser = previewType === 'pdf' || previewType === 'image';
      const msg = canOpenBrowser
        ? t('workspace.fileTooLargeOpenInBrowser', { size: formatFileSize(fileSize) })
        : t('workspace.fileTooLargeNoPreview', { size: formatFileSize(fileSize) });
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
      case 'pptx':
        fullscreenBtn.style.display = '';
        await previewPptx(arrayBuffer, fileName, previewContent, previewArea);
        break;
      case 'image':
        fullscreenBtn.style.display = '';
        await previewImage(arrayBuffer, fileName, previewContent);
        break;
      case 'video':
      case 'audio':
        fullscreenBtn.style.display = '';
        await previewMedia(arrayBuffer, fileName, previewType, previewContent, previewArea);
        break;
      default:
        previewContent.innerHTML = `<div class="workspace-panel-error">${t('workspace.unsupportedFileType')}</div>`;
    }
  } catch (err) {
    logger.error('[WorkspacePanel] preview failed:', filePath, err);
    const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : String(err));
    previewContent.innerHTML = `<div class="workspace-panel-error">${t('workspace.previewFailed', { error: escapeHtml(msg || t('workspace.unknownError')) })}</div>`;
  }
}

// ============================================================
// 文本/代码预览
// ============================================================

async function previewTextFile(filePath, fileName, lineCountEl, previewContent) {
  const result = await readFileContent(filePath);
  if (!result.success) {
    previewContent.innerHTML = `<div class="workspace-panel-error">${t('workspace.previewFailed', { error: escapeHtml(result.error || t('workspace.unknownError')) })}</div>`;
    return;
  }

  const lang = getLanguageClass(fileName);
  const text = result.content || '';
  const lines = text.split('\n');
  lineCountEl.textContent = t('workspace.lineCount', { count: lines.length });

  const truncated = lines.length > PREVIEW_MAX_LINES;
  const displayLines = truncated ? lines.slice(0, PREVIEW_MAX_LINES) : lines;

  let numberedHtml = '<table class="workspace-preview-code-table"><tbody>';
  for (let i = 0; i < displayLines.length; i++) {
    numberedHtml += `<tr><td class="line-num">${i + 1}</td><td class="line-content"><code class="${lang}">${escapeHtml(displayLines[i])}</code></td></tr>`;
  }
  if (truncated) {
    numberedHtml += `<tr><td class="line-num">…</td><td class="line-content"><code>${t('workspace.truncatedHint', { shown: PREVIEW_MAX_LINES, total: lines.length })}</code></td></tr>`;
  }
  numberedHtml += '</tbody></table>';
  previewContent.innerHTML = numberedHtml;
}

// ============================================================
// PDF 预览（视口缩放 + 拖拽 + 翻页）
// ============================================================

let currentPdfDoc = null;
let currentPdfPage = 1;
let pdfVisualScale = 1;  // 用户的视觉缩放（相对于PDF原始尺寸）
let pdfScale = 1;        // CSS transform 使用的缩放值
let pdfFitScale = 1;     // 适应容器的缩放比例（相对于PDF原始尺寸）
let pdfPanX = 0, pdfPanY = 0;
let pdfIsDragging = false;
let pdfDragStartX = 0, pdfDragStartY = 0;
let pdfDragPanStartX = 0, pdfDragPanStartY = 0;
let pdfZoomRenderTimer = null;
let pdfRenderZoom = 1;   // canvas 渲染时的缩放因子

async function previewPdf(arrayBuffer, fileName, previewContent, previewArea) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  currentPdfDoc = pdf;
  currentPdfPage = 1;
  pdfVisualScale = 1;
  pdfScale = 1;
  pdfFitScale = 1;
  pdfRenderZoom = 1;
  pdfPanX = 0;
  pdfPanY = 0;
  previewArea.dataset.previewType = 'pdf';

  const totalPages = pdf.numPages;
  document.getElementById('workspacePreviewLineCount').textContent = t('workspace.pageCount', { count: totalPages });

  previewContent.innerHTML = `
    <div class="pdf-wrap">
      <div class="pdf-toolbar">
        <button class="pdf-toolbar-btn" id="pdfPrevPage" title="${t('workspace.prevPage')}" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="pdf-page-info"><input type="number" class="pdf-page-input" id="pdfPageInput" value="1" min="1" max="${totalPages}"> / ${totalPages}</span>
        <button class="pdf-toolbar-btn" id="pdfNextPage" title="${t('workspace.nextPage')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <span class="pdf-toolbar-sep"></span>
        <button class="pdf-toolbar-btn" id="pdfZoomOut" title="${t('workspace.zoomOut')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <span class="pdf-zoom-info" id="pdfZoomInfo">100%</span>
        <button class="pdf-toolbar-btn" id="pdfZoomIn" title="${t('workspace.zoomIn')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <span class="pdf-toolbar-sep"></span>
        <button class="pdf-toolbar-btn" id="pdfZoomFit" title="${t('workspace.fitPage')}">
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
    zoomInfo.textContent = Math.round(pdfVisualScale * 100) + '%';
    if (!pdfIsDragging) {
      viewport.style.cursor = pdfVisualScale > pdfFitScale ? 'grab' : 'default';
    }
  }

  function clampPdfPan() {
    if (pdfVisualScale <= pdfFitScale) {
      pdfPanX = 0;
      pdfPanY = 0;
    }
  }

  function setPdfZoom(newScale, originX, originY) {
    const oldVisualScale = pdfVisualScale;
    pdfVisualScale = Math.max(0.05, Math.min(5, newScale));
    // CSS scale = visualScale / renderZoom (canvas已按renderZoom倍渲染)
    pdfScale = pdfVisualScale / pdfRenderZoom;

    if (originX !== undefined && originY !== undefined) {
      const rect = viewport.getBoundingClientRect();
      const ox = originX - rect.left - rect.width / 2;
      const oy = originY - rect.top - rect.height / 2;
      const ratio = pdfVisualScale / oldVisualScale;
      pdfPanX = ox - ratio * (ox - pdfPanX);
      pdfPanY = oy - ratio * (oy - pdfPanY);
    }

    clampPdfPan();
    applyPdfTransform();

    // 缩放后防抖重新渲染canvas以保持高分辨率清晰度
    schedulePdfZoomRerender();
  }

  function schedulePdfZoomRerender() {
    if (pdfZoomRenderTimer) {
      clearTimeout(pdfZoomRenderTimer);
    }
    pdfZoomRenderTimer = setTimeout(() => {
      renderPdfPageInternal();
    }, 180);
  }

  async function renderPdfPageInternal() {
    if (!currentPdfDoc) return;
    const page = await currentPdfDoc.getPage(currentPdfPage);
    const dpr = window.devicePixelRatio || 1;

    // 渲染缩放：当用户放大时用更高分辨率渲染canvas
    const renderZoom = Math.max(pdfVisualScale, 1);
    pdfRenderZoom = renderZoom;
    const vp = page.getViewport({ scale: renderZoom });

    // canvas实际像素尺寸（高DPR渲染）
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    // canvas CSS显示尺寸
    canvas.style.width = vp.width + 'px';
    canvas.style.height = vp.height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    // 计算 fit 比例（基于PDF原始1x尺寸）
    const baseVp = page.getViewport({ scale: 1 });
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw > 0 && vh > 0 && baseVp.width > 0 && baseVp.height > 0) {
      pdfFitScale = Math.min((vw - 24) / baseVp.width, (vh - 24) / baseVp.height);
    } else {
      pdfFitScale = 1;
    }

    // CSS scale = visualScale / renderZoom
    pdfScale = pdfVisualScale / renderZoom;

    // 如果当前视觉缩放接近fit，自动对齐
    if (pdfVisualScale < pdfFitScale * 1.05 && pdfVisualScale > pdfFitScale * 0.95) {
      pdfVisualScale = pdfFitScale;
      pdfScale = pdfFitScale / renderZoom;
      pdfPanX = 0;
      pdfPanY = 0;
    }

    clampPdfPan();
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

  // 滚轮缩放（基于视觉缩放）
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.005;
    setPdfZoom(pdfVisualScale + delta * pdfVisualScale, e.clientX, e.clientY);
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
      viewport.style.cursor = pdfVisualScale > pdfFitScale ? 'grab' : 'default';
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
    setPdfZoom(pdfVisualScale * 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById('pdfZoomOut').addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    setPdfZoom(pdfVisualScale / 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById('pdfZoomFit').addEventListener('click', () => {
    pdfVisualScale = pdfFitScale;
    pdfPanX = 0;
    pdfPanY = 0;
    renderPdfPageInternal();
  });

  // 双击 → fit
  viewport.addEventListener('dblclick', () => {
    pdfVisualScale = pdfFitScale;
    pdfPanX = 0;
    pdfPanY = 0;
    renderPdfPageInternal();
  });

  // resize 重新计算 fit 并重新渲染
  window.addEventListener('resize', () => {
    if (!currentPdfDoc) return;
    renderPdfPageInternal();
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
  const html = result.value || `<p>${t('workspace.documentEmpty')}</p>`;
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
// PPTX 预览（pptx-to-html 转换，视口缩放 + 拖拽 + 翻页）
// ============================================================

let pptxSlidesHtml = [];
let pptxCurrentSlide = 0;
let pptxVisualScale = 1;   // 用户的视觉缩放（相对于幻灯片自然尺寸）
let pptxFitScale = 1;      // 适应容器的缩放比例
let pptxPanX = 0, pptxPanY = 0;
let pptxIsDragging = false;
let pptxDragStartX = 0, pptxDragStartY = 0;
let pptxDragPanStartX = 0, pptxDragPanStartY = 0;

async function previewPptx(arrayBuffer, fileName, previewContent, previewArea) {
  previewArea.dataset.previewType = 'pptx';

  pptxSlidesHtml = await pptxToHtml(arrayBuffer, {
    width: 960,
    height: 540,
    scaleToFit: true,
    letterbox: true,
  });
  pptxCurrentSlide = 0;
  pptxVisualScale = 1;
  pptxFitScale = 1;
  pptxPanX = 0;
  pptxPanY = 0;

  if (!pptxSlidesHtml || pptxSlidesHtml.length === 0) {
    previewContent.innerHTML = `<div class="workspace-panel-error">${t('workspace.pptxEmptyOrFailed')}</div>`;
    return;
  }

  const totalSlides = pptxSlidesHtml.length;
  document.getElementById('workspacePreviewLineCount').textContent = t('workspace.pageCount', { count: totalSlides });

  previewContent.innerHTML = `
    <div class="pptx-wrap">
      <div class="pptx-toolbar">
        <button class="pptx-toolbar-btn" id="pptxPrevSlide" title="${t('workspace.prevPage')}" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="pptx-page-info"><span id="pptxSlideNum">1</span> / ${totalSlides}</span>
        <button class="pptx-toolbar-btn" id="pptxNextSlide" title="${t('workspace.nextPage')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <span class="pptx-toolbar-sep"></span>
        <button class="pptx-toolbar-btn" id="pptxZoomOut" title="${t('workspace.zoomOut')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <span class="pptx-zoom-info" id="pptxZoomInfo">100%</span>
        <button class="pptx-toolbar-btn" id="pptxZoomIn" title="${t('workspace.zoomIn')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <span class="pptx-toolbar-sep"></span>
        <button class="pptx-toolbar-btn" id="pptxZoomFit" title="${t('workspace.fitPage')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </button>
      </div>
      <div class="pptx-viewport" id="pptxViewport">
        <div class="pptx-pan" id="pptxPan">
          <div class="pptx-slide-container" id="pptxSlideContainer"></div>
        </div>
      </div>
    </div>
  `;

  // 初始渲染
  renderPptxSlide();

  const viewport = document.getElementById('pptxViewport');
  const pan = document.getElementById('pptxPan');
  const zoomInfo = document.getElementById('pptxZoomInfo');

  function applyPptxTransform() {
    pan.style.transform = `translate(${pptxPanX}px, ${pptxPanY}px) scale(${pptxVisualScale})`;
    zoomInfo.textContent = Math.round(pptxVisualScale * 100) + '%';
    if (!pptxIsDragging) {
      viewport.style.cursor = pptxVisualScale > pptxFitScale ? 'grab' : 'default';
    }
  }

  function clampPptxPan() {
    if (pptxVisualScale <= pptxFitScale) {
      pptxPanX = 0;
      pptxPanY = 0;
    }
  }

  function setPptxZoom(newScale, originX, originY) {
    const oldVisualScale = pptxVisualScale;
    pptxVisualScale = Math.max(0.05, Math.min(5, newScale));

    if (originX !== undefined && originY !== undefined) {
      const rect = viewport.getBoundingClientRect();
      const ox = originX - rect.left - rect.width / 2;
      const oy = originY - rect.top - rect.height / 2;
      const ratio = pptxVisualScale / oldVisualScale;
      pptxPanX = ox - ratio * (ox - pptxPanX);
      pptxPanY = oy - ratio * (oy - pptxPanY);
    }

    // 如果当前视觉缩放接近fit，自动对齐
    if (pptxVisualScale < pptxFitScale * 1.05 && pptxVisualScale > pptxFitScale * 0.95) {
      pptxVisualScale = pptxFitScale;
      pptxPanX = 0;
      pptxPanY = 0;
    }

    clampPptxPan();
    applyPptxTransform();
  }

  // 滚轮缩放
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.005;
    setPptxZoom(pptxVisualScale + delta * pptxVisualScale, e.clientX, e.clientY);
  }, { passive: false });

  // 拖拽平移
  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    pptxIsDragging = true;
    pptxDragStartX = e.clientX;
    pptxDragStartY = e.clientY;
    pptxDragPanStartX = pptxPanX;
    pptxDragPanStartY = pptxPanY;
    viewport.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!pptxIsDragging) return;
    pptxPanX = pptxDragPanStartX + (e.clientX - pptxDragStartX);
    pptxPanY = pptxDragPanStartY + (e.clientY - pptxDragStartY);
    clampPptxPan();
    applyPptxTransform();
  });

  window.addEventListener('mouseup', () => {
    if (pptxIsDragging) {
      pptxIsDragging = false;
      viewport.style.cursor = pptxVisualScale > pptxFitScale ? 'grab' : 'default';
    }
  });

  // 工具栏：翻页
  document.getElementById('pptxPrevSlide').addEventListener('click', () => {
    if (pptxCurrentSlide > 0) { pptxCurrentSlide--; renderPptxSlide(); }
  });
  document.getElementById('pptxNextSlide').addEventListener('click', () => {
    if (pptxCurrentSlide < totalSlides - 1) { pptxCurrentSlide++; renderPptxSlide(); }
  });

  // 工具栏：缩放
  document.getElementById('pptxZoomIn').addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    setPptxZoom(pptxVisualScale * 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById('pptxZoomOut').addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    setPptxZoom(pptxVisualScale / 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById('pptxZoomFit').addEventListener('click', () => {
    // 用 rAF 确保 resize 后的 DOM 布局已完成
    requestAnimationFrame(() => {
      recalcPptxFit();
      pptxVisualScale = pptxFitScale;
      pptxPanX = 0;
      pptxPanY = 0;
      pan.style.transform = `translate(0px, 0px) scale(${pptxFitScale})`;
      zoomInfo.textContent = Math.round(pptxFitScale * 100) + '%';
      viewport.style.cursor = 'default';
    });
  });

  // 双击 → fit
  viewport.addEventListener('dblclick', () => {
    requestAnimationFrame(() => {
      recalcPptxFit();
      pptxVisualScale = pptxFitScale;
      pptxPanX = 0;
      pptxPanY = 0;
      pan.style.transform = `translate(0px, 0px) scale(${pptxFitScale})`;
      zoomInfo.textContent = Math.round(pptxFitScale * 100) + '%';
      viewport.style.cursor = 'default';
    });
  });

  // resize 重新计算 fit 并应用
  window.addEventListener('resize', () => {
    if (!pptxSlidesHtml || pptxSlidesHtml.length === 0) return;
    // 用 rAF 确保全屏切换后 DOM 布局已完成
    requestAnimationFrame(() => {
      recalcAndApplyPptxFit();
    });
  });
}

function recalcPptxFit() {
  const viewport = document.getElementById('pptxViewport');
  const container = document.getElementById('pptxSlideContainer');
  if (!viewport || !container) return;

  // 使用 slide-container 的显式宽高（renderPptxSlide 中设置）
  const naturalW = parseFloat(container.style.width) || 960;
  const naturalH = parseFloat(container.style.height) || 540;
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;

  if (vw > 0 && vh > 0 && naturalW > 0 && naturalH > 0) {
    // 留 8px 边距给 box-shadow 呼吸空间
    pptxFitScale = Math.min((vw - 8) / naturalW, (vh - 8) / naturalH);
  } else {
    pptxFitScale = 1;
  }
}

/**
 * 重新计算 fit 比例，如果当前缩放接近 fit 则自动对齐
 * 用于 resize / 全屏切换时重新适配
 */
function recalcAndApplyPptxFit() {
  const viewport = document.getElementById('pptxViewport');
  const pan = document.getElementById('pptxPan');
  const zoomInfo = document.getElementById('pptxZoomInfo');
  if (!viewport || !pan) return;

  const oldFit = pptxFitScale;
  recalcPptxFit();

  // 如果当前缩放接近旧的 fit（说明用户正处于适应页面状态），自动对齐到新的 fit
  if (pptxVisualScale <= oldFit * 1.05) {
    pptxVisualScale = pptxFitScale;
    pptxPanX = 0;
    pptxPanY = 0;
  }

  pan.style.transform = `translate(${pptxPanX}px, ${pptxPanY}px) scale(${pptxVisualScale})`;
  if (zoomInfo) zoomInfo.textContent = Math.round(pptxVisualScale * 100) + '%';

  if (!pptxIsDragging) {
    viewport.style.cursor = pptxVisualScale > pptxFitScale ? 'grab' : 'default';
  }
}

function renderPptxSlide() {
  const container = document.getElementById('pptxSlideContainer');
  const pan = document.getElementById('pptxPan');
  if (!container || !pan || pptxCurrentSlide < 0 || pptxCurrentSlide >= pptxSlidesHtml.length) return;

  // 先重置 pan 为 scale(1)，防止上一页残留的 transform 影响尺寸测量
  pan.style.transform = 'scale(1)';

  const rawHtml = pptxSlidesHtml[pptxCurrentSlide];
  const cleaned = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['div', 'span', 'p', 'a', 'img', 'svg', 'path', 'circle', 'rect',
      'line', 'polyline', 'polygon', 'ellipse', 'g', 'defs', 'linearGradient', 'radialGradient',
      'stop', 'text', 'tspan', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'br',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u'],
    ALLOWED_ATTR: ['class', 'style', 'id', 'src', 'alt', 'width', 'height', 'href', 'target',
      'd', 'fill', 'stroke', 'stroke-width', 'transform', 'viewBox', 'x', 'y', 'cx', 'cy',
      'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points', 'opacity', 'font-size', 'font-family',
      'text-anchor', 'dominant-baseline', 'clip-path', 'preserveAspectRatio', 'xmlns'],
  });

  // 清除旧宽高，让内容自然撑开
  container.style.width = '';
  container.style.height = '';
  container.innerHTML = cleaned;

  // 用 offsetWidth/Height（不受 CSS transform 影响）测量 slide 自然尺寸
  const slideEl = container.firstElementChild;
  if (slideEl) {
    container.style.width = (slideEl.offsetWidth || 960) + 'px';
    container.style.height = (slideEl.offsetHeight || 540) + 'px';
  } else {
    container.style.width = '960px';
    container.style.height = '540px';
  }

  // 计算 fit 比例（基于显式宽高）
  recalcPptxFit();

  // 初始缩放使用 fit
  pptxVisualScale = pptxFitScale;
  pptxPanX = 0;
  pptxPanY = 0;
  pan.style.transform = `translate(0px, 0px) scale(${pptxFitScale})`;

  // 更新缩放显示和光标
  const zoomInfo = document.getElementById('pptxZoomInfo');
  if (zoomInfo) zoomInfo.textContent = Math.round(pptxVisualScale * 100) + '%';

  const viewport = document.getElementById('pptxViewport');
  if (viewport && !pptxIsDragging) {
    viewport.style.cursor = 'default';
  }

  // 更新导航按钮状态
  const prevBtn = document.getElementById('pptxPrevSlide');
  const nextBtn = document.getElementById('pptxNextSlide');
  const slideNum = document.getElementById('pptxSlideNum');
  if (prevBtn) prevBtn.disabled = pptxCurrentSlide <= 0;
  if (nextBtn) nextBtn.disabled = pptxCurrentSlide >= pptxSlidesHtml.length - 1;
  if (slideNum) slideNum.textContent = pptxCurrentSlide + 1;
}

// ============================================================
// Excel 预览（服务端通过 /api/fs/preview-xlsx 解析，前 500 行）
// ============================================================

let xlsxSheetsData = [];   // 所有 sheet 的 rows 数据
let xlsxCurrentSheet = 0;  // 当前选中的 sheet

async function previewXlsx(fileName, previewContent, previewArea) {
  previewContent.innerHTML = `<div class="workspace-panel-empty">${t('workspace.parsingExcel')}</div>`;

  const filePath = previewArea.dataset.previewPath;
  let result;
  try {
    const config = await getAgentConfig();
    if (!config) throw new Error(t('workspace.agentNotPaired'));
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
    previewContent.innerHTML = `<div class="workspace-panel-error">${t('workspace.requestFailed', { error: escapeHtml(err.message) })}</div>`;
    return;
  }

  if (!result.success) {
    previewContent.innerHTML = `<div class="workspace-panel-error">${t('workspace.parseFailed', { error: escapeHtml(result.error || t('workspace.unknownError')) })}</div>`;
    return;
  }

  const { sheets } = result.data;
  if (!sheets || sheets.length === 0) {
    previewContent.innerHTML = `<div class="workspace-panel-error">${t('workspace.noSheetsInWorkbook')}</div>`;
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
  previewContent.innerHTML = tabsHtml + `<div class="xlsx-sheet-content" id="xlsxSheetContent"><div class="workspace-panel-empty">${t('workspace.loadingData')}</div></div>`;

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
    content.innerHTML = `<div class="workspace-panel-error">${t('workspace.sheetNotFound')}</div>`;
    return;
  }

  renderXlsxSheet(sheet.rows, sheet.colCount, sheet.totalRows, content);
}

function renderXlsxSheet(rows, colCount, totalRows, content) {

  const oldMirror = content.querySelector('.xlsx-table-scrollbar-mirror');
  if (oldMirror) oldMirror.remove();

  if (!rows || rows.length === 0) {
    content.innerHTML = `<div class="workspace-panel-empty">${t('workspace.emptySheet')}</div>`;
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
    html += `<div class="xlsx-truncated-msg">${t('workspace.xlsxTruncatedHint', { shown: PREVIEW_XLSX_MAX_ROWS, total: totalRows })}</div>`;
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
        <button class="image-preview-btn" id="imgZoomOut" title="${t('workspace.zoomOut')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <span class="image-preview-zoom-level" id="imgZoomLevel">100%</span>
        <button class="image-preview-btn" id="imgZoomIn" title="${t('workspace.zoomIn')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <span class="image-preview-toolbar-sep"></span>
        <button class="image-preview-btn" id="imgZoomReset" title="${t('workspace.originalSize')}">
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
    previewContent.innerHTML = `<div class="workspace-panel-error">${t('workspace.imageLoadFailed')}</div>`;
  });

  // 窗口 resize 时重新计算 fit
  window.addEventListener('resize', () => {
    fitScale = calcFitScale();
    clampPan();
    applyTransform();
  });
}

/**
 * 视频/音频预览（浏览器原生播放器）
 */
let currentMediaUrl = null;

async function previewMedia(arrayBuffer, fileName, previewType, previewContent, previewArea) {
  // 释放上一次的 object URL，避免内存泄漏
  if (currentMediaUrl) {
    URL.revokeObjectURL(currentMediaUrl);
    currentMediaUrl = null;
  }

  const mimeType = getMimeType(fileName);
  const blob = new Blob([arrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  currentMediaUrl = url;
  previewArea.dataset.previewType = previewType;

  const isVideo = previewType === 'video';
  // 浏览器无法解码时给出提示
  const unsupportedHint = `<div class="workspace-panel-error" style="margin-top:10px;">${t('workspace.unsupportedMediaHint', { ext: escapeHtml((fileName.split('.').pop() || '').toUpperCase()) })}</div>`;

  if (isVideo) {
    previewContent.innerHTML = `
      <div class="media-preview-wrap" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:12px;">
        <video controls autoplay style="max-width:100%;max-height:calc(100% - 24px);border-radius:8px;background:#000;" onerror="this.style.display='none';document.getElementById('mediaUnsupportedHint').style.display='block';">
          <source src="${url}" type="${escapeHtml(mimeType)}">
        </video>
        <div id="mediaUnsupportedHint" style="display:none;">${unsupportedHint}</div>
      </div>`;
    // 扩展 Side Panel 不支持原生 Fullscreen API
    // <video controls> 的全屏按钮由浏览器 C++ 层实现，无法通过 JS 拦截，点击无反应
    // 替代方案：双击视频画面切换自定义全屏，或使用工具栏全屏预览按钮
    const videoEl = previewContent.querySelector('video');
    if (videoEl) {
      // 双击视频切换全屏（与原生播放器习惯一致）
      videoEl.addEventListener('dblclick', () => togglePreviewFullscreen());
    }
  } else {
    previewContent.innerHTML = `
      <div class="media-preview-wrap" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:12px;gap:16px;">
        <div style="font-size:14px;color:#555;">🎵 ${escapeHtml(fileName)}</div>
        <audio controls autoplay style="width:100%;max-width:560px;" onerror="this.style.display='none';document.getElementById('mediaUnsupportedHint').style.display='block';">
          <source src="${url}" type="${escapeHtml(mimeType)}">
        </audio>
        <div id="mediaUnsupportedHint" style="display:none;">${unsupportedHint}</div>
      </div>`;
  }
}

// ====== 导出菜单事件与功能 ======

let exportInProgress = false;

function positionExportDropdown(exportBtn, exportDropdown) {
  const rect = exportBtn.getBoundingClientRect();
  exportDropdown.style.top = (rect.bottom + 4) + 'px';
  // 右对齐按钮
  const dropdownWidth = 160;
  const left = rect.right - dropdownWidth;
  exportDropdown.style.left = Math.max(4, left) + 'px';
  exportDropdown.style.right = 'auto';
}

function showExportDropdown(exportBtn, exportDropdown) {
  positionExportDropdown(exportBtn, exportDropdown);
  exportDropdown.classList.add('show');
}

function bindExportMenuEvents() {
  const exportMenu = document.getElementById('workspacePreviewExportMenu');
  const exportBtn = document.getElementById('workspacePreviewExportBtn');
  let exportDropdown = document.getElementById('workspacePreviewExportDropdown');
  if (!exportMenu || !exportBtn || !exportDropdown) return;

  // 将下拉菜单移到 body 下，避免被 .workspace-panel 的 transform 创建包含块导致 fixed 失效
  document.body.appendChild(exportDropdown);

  // 点击导出按钮切换下拉菜单
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (exportDropdown.classList.contains('show')) {
      exportDropdown.classList.remove('show');
    } else {
      showExportDropdown(exportBtn, exportDropdown);
    }
  });

  // 悬停展开下拉菜单（延迟 200ms 显示，避免误触）
  let hoverTimer = null;
  let hideTimer = null;
  exportMenu.addEventListener('mouseenter', () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    hoverTimer = setTimeout(() => {
      showExportDropdown(exportBtn, exportDropdown);
    }, 200);
  });
  exportMenu.addEventListener('mouseleave', () => {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    // 延迟 300ms 隐藏，给用户时间移动到下拉菜单
    hideTimer = setTimeout(() => {
      if (!exportMenu.matches(':hover') && !exportDropdown.matches(':hover')) {
        exportDropdown.classList.remove('show');
      }
    }, 300);
  });

  // 下拉菜单自身的 mouseenter 取消隐藏
  exportDropdown.addEventListener('mouseenter', () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  });
  exportDropdown.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(() => {
      if (!exportMenu.matches(':hover') && !exportDropdown.matches(':hover')) {
        exportDropdown.classList.remove('show');
      }
    }, 200);
  });

  // 点击下拉菜单项
  exportDropdown.querySelectorAll('.ws-export-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const exportType = item.dataset.exportType;
      exportDropdown.classList.remove('show');
      handleExport(exportType);
    });
  });

  // 点击其他地方关闭下拉菜单
  document.addEventListener('click', (e) => {
    if (!exportMenu.contains(e.target) && !exportDropdown.contains(e.target)) {
      exportDropdown.classList.remove('show');
    }
  });

  // 滚动或窗口大小变化时重新定位
  const reposition = () => {
    if (exportDropdown.classList.contains('show')) {
      positionExportDropdown(exportBtn, exportDropdown);
    }
  };
  document.getElementById('workspacePreviewContent')?.addEventListener('scroll', reposition);
  window.addEventListener('resize', reposition);
}

function getExportMarkdownContent() {
  const previewArea = document.getElementById('workspacePreviewArea');
  return previewArea.dataset.markdownText || '';
}

function getExportHtmlContent() {
  const previewContent = document.getElementById('workspacePreviewContent');
  const markdownBody = previewContent.querySelector('.workspace-preview-markdown');
  if (markdownBody) {
    return markdownBody.innerHTML;
  }
  return previewContent.innerHTML;
}

async function handleExport(type) {
  if (exportInProgress) return;
  exportInProgress = true;

  const exportBtn = document.getElementById('workspacePreviewExportBtn');
  const exportMenu = document.getElementById('workspacePreviewExportMenu');
  const exportDropdown = document.getElementById('workspacePreviewExportDropdown');
  const previewArea = document.getElementById('workspacePreviewArea');
  const fileName = previewArea.dataset.previewName || 'export';

  // 设置 loading 状态
  const originalHtml = exportBtn.innerHTML;
  exportBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" style="animation: spin 0.8s linear infinite; width: 14px; height: 14px; flex-shrink: 0;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="31.4" stroke-dashoffset="10" opacity="0.25"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg>`;
  exportBtn.disabled = true;
  exportBtn.style.opacity = '0.6';

  try {
    switch (type) {
      case 'docx':
        await exportWorkspaceDocx(fileName);
        break;
      case 'pdf':
        await exportWorkspacePdf(fileName);
        break;
      case 'image':
        await exportWorkspaceImage(fileName);
        break;
      case 'md':
        exportWorkspaceMarkdown(fileName);
        break;
    }
  } catch (error) {
    logger.error('[WorkspacePanel] export failed:', error);
    showToast(t('chatExport.exportFailed', { message: error.message }), 'error');
  } finally {
    exportInProgress = false;
    // 恢复按钮
    exportBtn.innerHTML = originalHtml;
    exportBtn.disabled = false;
    exportBtn.style.opacity = '1';
    exportDropdown.classList.remove('show');
  }
}

async function preRenderMermaidForExport(container) {
  if (typeof mermaid === 'undefined') return;
  await renderMermaidInContainer(container);
  await convertSvgsToImages(container);
}

/**
 * 将 Markdown 中的 mermaid 代码块预渲染为 data URL 图片
 * 返回替换后的 Markdown（mermaid 块变为 ![mermaid](data:image/png;base64,...)）
 */
async function renderMermaidBlocksToImagesLocal(markdownContent) {
  if (typeof mermaid === 'undefined') return markdownContent;
  if (!/```mermaid/i.test(markdownContent)) return markdownContent;

  try {
    const htmlContent = formatMarkdown(markdownContent);
    const tempContainer = document.createElement('div');
    tempContainer.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    tempContainer.innerHTML = htmlContent;
    document.body.appendChild(tempContainer);

    await renderMermaidInContainer(tempContainer);
    await convertSvgsToImages(tempContainer);

    const mermaidContainers = tempContainer.querySelectorAll('.mermaid');
    const imgDataUrls = [];
    for (const container of mermaidContainers) {
      const img = container.querySelector('img');
      if (img && img.src && img.src.startsWith('data:')) {
        imgDataUrls.push(img.src);
      } else {
        imgDataUrls.push(null);
      }
    }
    document.body.removeChild(tempContainer);

    if (imgDataUrls.length === 0) return markdownContent;

    let idx = 0;
    return markdownContent.replace(/```\s*mermaid\s*[\r\n]+([\s\S]*?)```/gi, (match) => {
      const dataUrl = imgDataUrls[idx];
      idx++;
      if (dataUrl) return `![mermaid](${dataUrl})`;
      return match;
    });
  } catch (e) {
    logger.warn('[WorkspacePanel] Mermaid pre-render failed:', e.message);
    return markdownContent;
  }
}

async function exportWorkspaceDocx(fileName) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, ImageRun, ExternalHyperlink, convertInchesToTwip } = await import('docx');
  
  let markdownContent = getExportMarkdownContent();
  if (!markdownContent) {
    showToast(t('chatExport.noContent'), 'error');
    return;
  }

  // 预渲染 mermaid 图表为 data URL 图片，替换 markdown 中的 mermaid 代码块
  markdownContent = await renderMermaidBlocksToImagesLocal(markdownContent);

  const children = await parseMarkdownToDocxChildrenLocal(markdownContent);

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
        heading1: { run: { size: 36, bold: true }, paragraph: { spacing: { before: 320, after: 160 } } },
        heading2: { run: { size: 30, bold: true }, paragraph: { spacing: { before: 280, after: 120 } } },
        heading3: { run: { size: 26, bold: true }, paragraph: { spacing: { before: 240, after: 100 } } },
      }
    },
    sections: [{
      properties: { page: { margin: { top: convertInchesToTwip(1), right: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1) } } },
      children
    }]
  });

  const blob = await Packer.toBlob(doc);
  const timestamp = new Date().getTime();
  const dlName = `word-${timestamp}.docx`;
  downloadBlob(blob, dlName);
  showToast(t('workspace.downloaded', { name: dlName }), 'success');
}

async function parseMarkdownToDocxChildrenLocal(markdown) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, ImageRun, ExternalHyperlink, convertInchesToTwip } = await import('docx');
  
  if (!markdown || !markdown.trim()) {
    return [new Paragraph({ children: [new TextRun({ text: '' })] })];
  }

  const children = [];
  let content = markdown;

  // 提取代码块
  const codeBlocks = [];
  content = content.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang || '', code: code.trimEnd() });
    return `\n\n%%CODEBLOCK_${idx}%%\n\n`;
  });

  // 提取 HTML 表格
  const htmlTables = [];
  content = content.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
    const idx = htmlTables.length;
    htmlTables.push(match);
    return `\n\n%%HTMLTABLE_${idx}%%\n\n`;
  });

  // 提取 Markdown 表格
  const mdTables = [];
  content = content.replace(/(?:^\|.+\|\s*$\n)+^\|[\s\-:|]+\|\s*$\n(?:^\|.+\|\s*$\n?)+/gm, (match) => {
    const idx = mdTables.length;
    mdTables.push(match);
    return `\n\n%%MDTABLE_${idx}%%\n\n`;
  });

  const blocks = content.split(/\n{2,}/).filter(b => b.trim());

  function parseInline(text) {
    if (!text) return [];
    const tokenRegex = /(\*\*(.+?)\*\*|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|__(.+?)__|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|!\[([^\]]*)\]\(([^)]+)\))/;
    const result = [];
    let remaining = text;
    while (remaining.length > 0) {
      const match = remaining.match(tokenRegex);
      if (!match) { result.push(new TextRun({ text: remaining })); break; }
      const idx = match.index;
      if (idx > 0) result.push(new TextRun({ text: remaining.slice(0, idx) }));
      const fullMatch = match[1];
      if (match[2] !== undefined) result.push(new TextRun({ text: match[2], bold: true }));
      else if (match[3] !== undefined) result.push(new TextRun({ text: match[3], italics: true }));
      else if (match[4] !== undefined) result.push(new TextRun({ text: match[4], bold: true }));
      else if (match[5] !== undefined) result.push(new TextRun({ text: match[5], italics: true }));
      else if (match[6] !== undefined) result.push(new TextRun({ text: match[6], font: 'Consolas', size: 20 }));
      else if (match[7] !== undefined) result.push(new ExternalHyperlink({ children: [new TextRun({ text: match[7], style: 'Hyperlink' })], link: match[8] }));
      else if (match[9] !== undefined) {
        const imgUrl = match[10];
        if (imgUrl.startsWith('data:')) {
          try {
            const [header, base64] = imgUrl.split(',');
            const mimeMatch = header.match(/data:(image\/(\w+))/);
            if (mimeMatch && base64) {
              const binary = atob(base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              result.push(new ImageRun({ data: bytes, transformation: { width: 400, height: 300 }, type: mimeMatch[2] }));
            }
          } catch { result.push(new TextRun({ text: '[Image]', italics: true, color: '999999' })); }
        } else {
          result.push(new TextRun({ text: '[Image: ' + (match[9] || imgUrl) + ']', italics: true, color: '999999' }));
        }
      }
      remaining = remaining.slice(idx + fullMatch.length);
    }
    return result;
  }

  function parseHtmlTable(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const rows = [];
    doc.querySelectorAll('tr').forEach(tr => {
      const row = [];
      tr.querySelectorAll('th, td').forEach(cell => row.push(cell.textContent.trim()));
      if (row.length > 0) rows.push(row);
    });
    return rows;
  }

  function parseMdTable(md) {
    const lines = md.trim().split('\n');
    const rows = [];
    for (const line of lines) {
      if (/^[\s\|:\-]+$/.test(line.replace(/\|/g, ''))) continue;
      const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');
      if (cells.length > 0) rows.push(cells);
    }
    return rows;
  }

  function createTable(rows) {
    if (rows.length === 0) return new Paragraph({ children: [] });
    const colCount = Math.max(...rows.map(r => r.length));
    const tableRows = rows.map((row, rowIdx) => {
      const cells = [];
      for (let i = 0; i < colCount; i++) {
        const cellText = row[i] || '';
        cells.push(new TableCell({
          children: [new Paragraph({ children: parseInline(cellText), spacing: { before: 40, after: 40 } })],
          shading: rowIdx === 0 ? { fill: 'F2F2F2' } : undefined,
          width: { size: 100 / colCount, type: WidthType.PERCENTAGE }
        }));
      }
      return new TableRow({ children: cells });
    });
    return new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
        left: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
        right: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' }
      }
    });
  }

  for (const block of blocks) {
    const trimmed = block.trim();

    const cbMatch = trimmed.match(/^%%CODEBLOCK_(\d+)%%$/);
    if (cbMatch) {
      const { lang, code } = codeBlocks[parseInt(cbMatch[1])];
      const title = lang ? `${lang} code` : 'code';
      children.push(new Paragraph({ children: [new TextRun({ text: title, bold: true, font: 'Consolas', size: 18 })] }));
      const codeLines = code.split('\n');
      for (const line of codeLines) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 18 })],
          spacing: { before: 0, after: 0, line: 240 },
          shading: { fill: 'F5F5F5' }
        }));
      }
      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      continue;
    }

    const htMatch = trimmed.match(/^%%HTMLTABLE_(\d+)%%$/);
    if (htMatch) {
      const rows = parseHtmlTable(htmlTables[parseInt(htMatch[1])]);
      if (rows.length > 0) { children.push(createTable(rows)); children.push(new Paragraph({ children: [new TextRun({ text: '' })] })); }
      continue;
    }

    const mtMatch = trimmed.match(/^%%MDTABLE_(\d+)%%$/);
    if (mtMatch) {
      const rows = parseMdTable(mdTables[parseInt(mtMatch[1])]);
      children.push(createTable(rows));
      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const levelMap = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4, 5: HeadingLevel.HEADING_5, 6: HeadingLevel.HEADING_6 };
      children.push(new Paragraph({ children: parseInline(headingMatch[2]), heading: levelMap[headingMatch[1].length] || HeadingLevel.HEADING_1 }));
      continue;
    }

    if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
      children.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } }, spacing: { before: 200, after: 200 } }));
      continue;
    }

    if (/^[\-\*\+]\s+/.test(trimmed)) {
      const listItems = block.split(/\n(?=[\-\*\+]\s+)/);
      for (const item of listItems) {
        children.push(new Paragraph({ children: parseInline(item.replace(/^[\-\*\+]\s+/, '')), bullet: { level: 0 }, spacing: { before: 40, after: 40 } }));
      }
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems = block.split(/\n(?=\d+\.\s+)/);
      for (const item of listItems) {
        children.push(new Paragraph({ children: parseInline(item.replace(/^\d+\.\s+/, '')), numbering: { reference: 'default', level: 0 }, spacing: { before: 40, after: 40 } }));
      }
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines = block.split('\n').map(line => line.replace(/^>\s?/, '')).join('\n');
      children.push(new Paragraph({ children: parseInline(quoteLines), indent: { left: convertInchesToTwip(0.5) }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC' } }, spacing: { before: 60, after: 60 } }));
      continue;
    }

    const inlineChildren = parseInline(trimmed);
    children.push(new Paragraph({ children: inlineChildren.length > 0 ? inlineChildren : [new TextRun({ text: trimmed })], spacing: { before: 60, after: 60 } }));
  }

  return children;
}

async function exportWorkspacePdf(fileName) {
  const jsPDF = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
  const html2canvasFunc = window.html2canvas || null;

  if (!jsPDF || !html2canvasFunc) {
    showToast(t('chatExport.pdfLibNotLoaded'), 'error');
    return;
  }

  const markdownContent = getExportMarkdownContent();
  if (!markdownContent) {
    showToast(t('chatExport.noContent'), 'error');
    return;
  }

  const PDF_WIDTH = 595;
  const PDF_HEIGHT = 842;
  const PADDING = 40;
  const CONTENT_WIDTH = PDF_WIDTH - PADDING * 2;

  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${CONTENT_WIDTH}px;padding:${PADDING}px;background:white;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;font-size:12px;line-height:1.6;color:#333;box-sizing:border-box;`;
  container.innerHTML = `<div class="markdown-body">${formatMarkdown(markdownContent)}</div>`;
  document.body.appendChild(container);

  await preRenderMermaidForExport(container);

  const containerHeight = container.scrollHeight;
  const pageContentHeight = PDF_HEIGHT - PADDING * 2;
  const totalPages = Math.ceil(containerHeight / pageContentHeight);

  html2canvasFunc(container, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', willReadFrequently: true }).then(canvas => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [PDF_WIDTH, PDF_HEIGHT], compress: true });
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const scaleRatio = canvasHeight / containerHeight;
    const pageCanvasHeight = pageContentHeight * scaleRatio;

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();
      const startY = page * pageCanvasHeight;
      const endY = Math.min(startY + pageCanvasHeight, canvasHeight);
      const pageHeight = endY - startY;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasWidth;
      tempCanvas.height = pageHeight;
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      // 填充白色背景，避免 JPEG 透明区域变黑
      tempCtx.fillStyle = '#ffffff';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.drawImage(canvas, 0, startY, canvasWidth, pageHeight, 0, 0, canvasWidth, pageHeight);

      // 优先 JPEG（体积更小），失败降级 PNG
      let imgData, imgFormat;
      try {
        imgData = tempCanvas.toDataURL('image/jpeg', 0.85);
        imgFormat = 'JPEG';
      } catch (e) {
        imgData = tempCanvas.toDataURL('image/png');
        imgFormat = 'PNG';
      }
      const imgHeight = pageHeight / scaleRatio;
      pdf.addImage(imgData, imgFormat, 0, 0, PDF_WIDTH, imgHeight, undefined, 'FAST');
    }

    const timestamp = new Date().getTime();
    const dlName = `pdf-${timestamp}.pdf`;
    pdf.save(dlName);
    document.body.removeChild(container);
    showToast(t('workspace.downloaded', { name: dlName }), 'success');
  }).catch(error => {
    logger.error('[WorkspacePanel] PDF export failed:', error);
    showToast(t('chatExport.exportFailed', { message: error.message }), 'error');
    document.body.removeChild(container);
  });
}

async function exportWorkspaceImage(fileName) {
  const html2canvasFunc = window.html2canvas || null;
  if (!html2canvasFunc) {
    showToast(t('chatExport.imageLibNotLoaded'), 'error');
    return;
  }

  const previewContent = document.getElementById('workspacePreviewContent');
  const markdownBody = previewContent.querySelector('.workspace-preview-markdown');
  if (!markdownBody) {
    showToast(t('chatExport.noContent'), 'error');
    return;
  }

  // Clone the rendered markdown content
  const clone = markdownBody.cloneNode(true);
  const tempContainer = document.createElement('div');
  tempContainer.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:800px;padding:40px;background:white;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",\"PingFang SC\",\"Hiragino Sans GB\",\"Microsoft YaHei\",sans-serif;font-size:14px;line-height:1.6;color:#333;box-sizing:border-box;';
  tempContainer.appendChild(clone);
  document.body.appendChild(tempContainer);

  await preRenderMermaidForExport(tempContainer);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const canvas = await html2canvasFunc(tempContainer, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', willReadFrequently: true });
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const link = document.createElement('a');
    link.href = imgData;
    const timestamp = new Date().getTime();
    const dlName = `image-${timestamp}.jpg`;
    link.download = dlName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(t('workspace.downloaded', { name: dlName }), 'success');
  } catch (error) {
    logger.error('[WorkspacePanel] image export failed:', error);
    showToast(t('chatExport.exportFailed', { message: error.message }), 'error');
  } finally {
    document.body.removeChild(tempContainer);
  }
}

function exportWorkspaceMarkdown(fileName) {
  const markdownContent = getExportMarkdownContent();
  if (!markdownContent) {
    showToast(t('chatExport.noContent'), 'error');
    return;
  }

  const cleanContent = markdownContent.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  const blob = new Blob([cleanContent], { type: 'text/markdown;charset=utf-8' });
  const timestamp = new Date().getTime();
  const dlName = `md-${timestamp}.md`;
  downloadBlob(blob, dlName);
  showToast(t('workspace.downloaded', { name: dlName }), 'success');
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 复制预览内容
 * 普通点击：复制纯 Markdown 文本
 * Ctrl/Cmd + 点击：复制富文本（HTML），保留格式
 */
async function copyPreviewContent(event) {
  const previewArea = document.getElementById('workspacePreviewArea');
  const filePath = previewArea.dataset.previewPath;
  if (!filePath) return;

  // 二进制文件不支持文本复制
  const previewType = previewArea.dataset.previewType
    || getPreviewType(previewArea.dataset.previewName || '');
  if (previewType !== 'text') {
    showToast(t('workspace.copyUnsupportedType'), 'info');
    return;
  }

  const isCtrlPressed = event && (event.ctrlKey || event.metaKey);
  const previewContent = document.getElementById('workspacePreviewContent');
  const isRendered = previewContent.classList.contains('markdown-rendered');

  if (isCtrlPressed && isRendered) {
    // Ctrl/Cmd + 点击：复制富文本 HTML
    await copyWorkspaceRichText();
  } else {
    // 普通点击：复制 Markdown 文本
    const markdownText = previewArea.dataset.markdownText || '';
    if (markdownText) {
      try {
        await navigator.clipboard.writeText(markdownText);
        showToast(t('workspace.copiedToClipboard'), 'success');
      } catch {
        showToast(t('workspace.copyFailedManual'), 'error');
      }
    } else {
      // 非 Markdown 文件：读取文件内容
      const result = await readFileContent(filePath);
      if (result.success) {
        try {
          await navigator.clipboard.writeText(result.content || '');
          showToast(t('workspace.copiedToClipboard'), 'success');
        } catch {
          showToast(t('workspace.copyFailedManual'), 'error');
        }
      } else {
        showToast(t('workspace.getContentFailed'), 'error');
      }
    }
  }
}

/**
 * 复制工作目录预览的富文本（HTML）
 */
async function copyWorkspaceRichText() {
  const previewContent = document.getElementById('workspacePreviewContent');
  const markdownBody = previewContent.querySelector('.workspace-preview-markdown');
  if (!markdownBody) {
    showToast(t('chatCopy.copyFailedManual'), 'error');
    return;
  }

  // 克隆并清理表格
  const clone = markdownBody.cloneNode(true);
  clone.querySelectorAll('table').forEach(table => {
    const cleanTable = cleanTableForClipboard(table);
    table.parentNode.replaceChild(cleanTable, table);
  });

  const htmlContent = clone.innerHTML;
  const textContent = clone.textContent || '';

  // 包装 HTML 样式
  const styledHtml = wrapExportHtmlWithStyles(htmlContent);

  try {
    if (typeof ClipboardItem !== 'undefined') {
      const clipboardData = new ClipboardItem({
        'text/plain': new Blob([textContent], { type: 'text/plain' }),
        'text/html': new Blob([styledHtml], { type: 'text/html' })
      });
      await navigator.clipboard.write([clipboardData]);
    } else {
      // 降级方案
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-999999px';
      container.style.top = '-999999px';
      container.innerHTML = styledHtml;
      document.body.appendChild(container);

      const range = document.createRange();
      range.selectNodeContents(container);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      try {
        document.execCommand('copy');
      } catch {
        // 最终降级：复制纯文本
        await navigator.clipboard.writeText(textContent);
      } finally {
        selection.removeAllRanges();
        document.body.removeChild(container);
      }
    }
    showToast(t('chatCopy.copiedRich'), 'success');
  } catch (err) {
    logger.warn('[WorkspacePanel] rich textcopy failed:', err.message);
    // 降级为纯文本
    try {
      await navigator.clipboard.writeText(textContent);
      showToast(t('workspace.copiedToClipboard'), 'success');
    } catch {
      showToast(t('workspace.copyFailedManual'), 'error');
    }
  }
}

function wrapExportHtmlWithStyles(html) {
  const styles = `
    <style>
      h1 { font-size: 24px; font-weight: bold; margin: 16px 0 8px; }
      h2 { font-size: 20px; font-weight: bold; margin: 14px 0 6px; }
      h3 { font-size: 18px; font-weight: bold; margin: 12px 0 6px; }
      h4 { font-size: 16px; font-weight: bold; margin: 10px 0 6px; }
      p { margin: 6px 0; line-height: 1.6; }
      ul, ol { margin: 8px 0; padding-left: 24px; }
      li { margin: 4px 0; }
      blockquote { border-left: 4px solid #ddd; padding-left: 12px; margin: 8px 0; color: #666; }
      code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
      pre { background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 14px 16px; margin: 12px 0; overflow-x: auto; font-family: monospace; font-size: 13px; line-height: 1.6; color: #24292f; white-space: pre-wrap; word-break: break-word; }
      pre code { background: none; padding: 0; border: none; border-radius: 0; }
      table { border-collapse: collapse; width: 100%; margin: 8px 0; }
      th, td { border: 1px solid #ddd; padding: 6px 12px; text-align: left; }
      th { background: #f9f9f9; font-weight: bold; }
      strong { font-weight: bold; }
      em { font-style: italic; }
      a { color: #007bff; text-decoration: underline; }
      img { max-width: 100%; }
    </style>
  `;
  return `<!DOCTYPE html><html><head>${styles}</head><body>${html}</body></html>`;
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
      showToast(t('workspace.requestFailed', { error: result.error }), 'error');
      return;
    }
    const url = URL.createObjectURL(result.blob);
    window.open(url, '_blank');
    // 延迟释放，给浏览器足够时间读取
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    showToast(t('workspace.openInBrowser'), 'success');
  } catch (err) {
    showToast(t('workspace.openFailed', { error: err.message }), 'error');
  }
}

/**
 * 关闭预览
 */
/**
 * 更新 Markdown 切换按钮图标：激活态显示源码图标，非激活态显示预览图标
 * @param {HTMLElement} btn - 按钮元素
 * @param {boolean} isActive - 是否为激活态（渲染模式）
 */
function updateMdToggleIcon(btn, isActive) {
  const previewIcon = btn.querySelector('.workspace-preview-md-icon-preview');
  const sourceIcon = btn.querySelector('.workspace-preview-md-icon-source');
  if (previewIcon) previewIcon.style.display = isActive ? 'none' : '';
  if (sourceIcon) sourceIcon.style.display = isActive ? '' : 'none';
}

function togglePreviewFullscreen() {
  const previewArea = document.getElementById('workspacePreviewArea');
  const panel = document.getElementById('workspacePanel');
  const btn = document.getElementById('workspacePreviewFullscreenBtn');
  const isFullscreen = previewArea.classList.toggle('fullscreen');
  if (isFullscreen) {
    panel.classList.add('preview-fullscreen');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';
    btn.title = t('workspace.exitFullscreen');
  } else {
    panel.classList.remove('preview-fullscreen');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
    btn.title = t('workspace.fullscreenPreview');
  }
}

function toggleMarkdownPreview() {
  const previewArea = document.getElementById('workspacePreviewArea');
  const previewContent = document.getElementById('workspacePreviewContent');
  const btn = document.getElementById('workspacePreviewMdToggleBtn');
  const lineCountEl = document.getElementById('workspacePreviewLineCount');
  const copyBtn = document.getElementById('workspacePreviewCopyBtn');
  const downloadBtn = document.getElementById('workspacePreviewDownloadBtn');
  const exportMenu = document.getElementById('workspacePreviewExportMenu');

  const isRendered = previewContent.classList.toggle('markdown-rendered');
  const markdownText = previewArea.dataset.markdownText || '';

  if (isRendered) {
    // 渲染模式
    btn.classList.add('active');
    btn.title = t('workspace.switchToSourcePreview');
    updateMdToggleIcon(btn, true);
    // 渲染模式下显示导出菜单和复制按钮（支持 Ctrl+Click 富文本复制），隐藏下载按钮
    copyBtn.style.display = '';
    if (downloadBtn) downloadBtn.style.display = 'none';
    if (exportMenu) exportMenu.style.display = '';
    previewContent.innerHTML = `<div class="markdown-body workspace-preview-markdown">${formatMarkdown(markdownText)}</div>`;
    renderMermaidChartsInContainer(previewContent);
    bindCodeCopyButtonsInContainer(previewContent);
    addTableToolbarEvents();
    lineCountEl.textContent = '';
  } else {
    // 源码模式
    btn.classList.remove('active');
    btn.title = t('workspace.switchToRenderPreview');
    updateMdToggleIcon(btn, false);
    // 源码模式下显示复制和下载按钮，隐藏导出菜单
    copyBtn.style.display = '';
    if (downloadBtn) downloadBtn.style.display = '';
    if (exportMenu) exportMenu.style.display = 'none';
    const fileName = previewArea.dataset.previewName || '';
    const lang = getLanguageClass(fileName);
    const lines = (markdownText || '').split('\n');
    lineCountEl.textContent = t('workspace.lineCount', { count: lines.length });
    let numberedHtml = '<table class="workspace-preview-code-table"><tbody>';
    for (let i = 0; i < lines.length; i++) {
      numberedHtml += `<tr><td class="line-num">${i + 1}</td><td class="line-content"><code class="${lang}">${escapeHtml(lines[i])}</code></td></tr>`;
    }
    numberedHtml += '</tbody></table>';
    previewContent.innerHTML = numberedHtml;
  }

  // 更新复制按钮 tooltip
  updateCopyBtnTooltip(isRendered);
}

/**
 * 更新复制按钮 tooltip：渲染模式下提示 Ctrl/Cmd 复制富文本
 */
function updateCopyBtnTooltip(isRendered) {
  const copyBtn = document.getElementById('workspacePreviewCopyBtn');
  if (!copyBtn) return;
  if (isRendered) {
    copyBtn.title = t('workspace.copyAllTitle') + '\n' + t('workspace.copyMarkdownHint');
  } else {
    copyBtn.title = t('workspace.copyAllTitle');
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
        showToast(t('workspace.codeCopiedToClipboard'), 'success');
      }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = codeText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast(t('workspace.codeCopiedToClipboard'), 'success');
      });
    });
  }
}

async function closePreview(force = false) {
  const previewArea = document.getElementById('workspacePreviewArea');
  // 编辑模式下检查未保存修改（force=true 时跳过确认，直接丢弃）
  if (!force && previewArea.dataset.editMode === 'true' && previewArea.classList.contains('has-unsaved')) {
    const confirmed = await confirmDiscardChanges(t('workspace.actionClosePreview'));
    if (!confirmed) return false;
  }
  // 无论是否处于编辑模式，都清除编辑状态，避免关闭后残留导致下次再次弹出确认框
  exitEditMode(false);
  const panel = document.getElementById('workspacePanel');
  const previewContent = document.getElementById('workspacePreviewContent');
  previewContent.classList.remove('xlsx-mode');
  previewContent.classList.remove('markdown-rendered');
  delete previewArea.dataset.markdownText;
  const mdToggleBtn = document.getElementById('workspacePreviewMdToggleBtn');
  if (mdToggleBtn) {
    mdToggleBtn.classList.remove('active');
    mdToggleBtn.style.display = 'none';
    updateMdToggleIcon(mdToggleBtn, false);
  }
  if (previewArea.classList.contains('fullscreen')) {
    previewArea.classList.remove('fullscreen');
    panel.classList.remove('preview-fullscreen');
    const btn = document.getElementById('workspacePreviewFullscreenBtn');
    if (btn) {
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
      btn.title = t('workspace.fullscreenPreview');
    }
  }
  // 清理 PDF 资源
  if (currentPdfDoc) {
    currentPdfDoc.destroy();
    currentPdfDoc = null;
  }
  currentPdfPage = 1;
  pdfScale = 1;
  // 清理视频/音频 object URL，避免内存泄漏
  if (currentMediaUrl) {
    URL.revokeObjectURL(currentMediaUrl);
    currentMediaUrl = null;
  }
  // 隐藏导出菜单，重置复制按钮
  const exportMenu = document.getElementById('workspacePreviewExportMenu');
  if (exportMenu) exportMenu.style.display = 'none';
  const copyBtn = document.getElementById('workspacePreviewCopyBtn');
  if (copyBtn) copyBtn.title = t('workspace.copyAllTitle');
  previewArea.style.display = 'none';
  document.getElementById('workspacePreviewContent').innerHTML = '';
  // 预览因产物入口而展开面板（面板之前是收起状态）：关闭预览后一并收起面板，
  // 避免残留空的工作目录页面需要用户再关闭一次
  if (previewAutoClosePanel) {
    previewAutoClosePanel = false;
    closePanelInternal(false);
  }
  return true;
}

// ============================================================
// 文本文件在线编辑
// ============================================================

function enterEditMode() {
  const previewArea = document.getElementById('workspacePreviewArea');
  const previewContent = document.getElementById('workspacePreviewContent');
  const editBtn = document.getElementById('workspacePreviewEditBtn');
  const saveBtn = document.getElementById('workspacePreviewSaveBtn');
  const cancelBtn = document.getElementById('workspacePreviewCancelBtn');
  const copyBtn = document.getElementById('workspacePreviewCopyBtn');
  const downloadBtn = document.getElementById('workspacePreviewDownloadBtn');
  const mdToggleBtn = document.getElementById('workspacePreviewMdToggleBtn');
  const fullscreenBtn = document.getElementById('workspacePreviewFullscreenBtn');
  const lineCountEl = document.getElementById('workspacePreviewLineCount');
  const filenameEl = document.getElementById('workspacePreviewFilename');

  const origContent = previewArea.dataset.origContent || '';
  previewArea.dataset.editMode = 'true';

  // 重置保存按钮状态
  saveBtn.title = t('workspace.saveChanges');
  saveBtn.disabled = false;

  // 隐藏预览模式按钮（保留全屏按钮）
  copyBtn.style.display = 'none';
  downloadBtn.style.display = 'none';
  mdToggleBtn.style.display = 'none';
  editBtn.style.display = 'none';
  // 隐藏导出菜单
  const exportMenu = document.getElementById('workspacePreviewExportMenu');
  if (exportMenu) exportMenu.style.display = 'none';

  // 显示编辑模式按钮
  saveBtn.style.display = '';
  cancelBtn.style.display = '';

  // 替换为 textarea
  previewContent.innerHTML = `<textarea class="workspace-preview-editor" id="workspacePreviewEditor" spellcheck="false"></textarea>`;
  const editor = previewContent.querySelector('#workspacePreviewEditor');

  // 先设置初始值，再绑定事件，避免初始化触发误判
  editor.value = origContent;
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);

  // 更新状态提示
  lineCountEl.textContent = t('workspace.lineCount', { count: origContent.split('\n').length });
  filenameEl.classList.add('modified');
  filenameEl.textContent = (previewArea.dataset.previewName || '') + ' *';

  // 监听修改事件（初始值已设置完毕，不会误触发）
  editor.addEventListener('input', () => {
    const changed = editor.value !== origContent;
    if (changed) {
      previewArea.classList.add('has-unsaved');
      lineCountEl.textContent = t('workspace.linesModified', { count: editor.value.split('\n').length });
    } else {
      previewArea.classList.remove('has-unsaved');
      lineCountEl.textContent = t('workspace.lineCount', { count: editor.value.split('\n').length });
    }
  });
}

async function saveEditedFile() {
  const previewArea = document.getElementById('workspacePreviewArea');
  const editor = document.getElementById('workspacePreviewEditor');
  if (!editor) return;

  const filePath = previewArea.dataset.previewPath;
  const newContent = editor.value;
  const origContent = previewArea.dataset.origContent || '';

  if (newContent === origContent) {
    cancelEditMode();
    return;
  }

  const saveBtn = document.getElementById('workspacePreviewSaveBtn');
  const originalTitle = saveBtn.title;
  saveBtn.title = t('workspace.saving');
  saveBtn.disabled = true;

  try {
    const result = await writeFileContent(filePath, newContent);
    if (result.success) {
      logger.info('[WorkspacePanel] file save successful:', filePath);
      showToast(t('workspace.saveSuccess'));
      // 更新原始内容
      previewArea.dataset.origContent = newContent;
      // 退出编辑模式并重新预览
      exitEditMode(false);
      // 重新预览文件
      const fileName = previewArea.dataset.previewName;
      await previewFile(filePath, fileName);
    } else {
      logger.error('[WorkspacePanel] filesave failed:', filePath, result.error);
      showToast(t('workspace.saveFailedWithError', { error: result.error || t('workspace.unknownError') }));
      saveBtn.title = originalTitle;
      saveBtn.disabled = false;
    }
  } catch (err) {
    logger.error('[WorkspacePanel] file saveexception:', filePath, err);
    showToast(t('workspace.saveFailedWithError', { error: err.message || err }));
    saveBtn.title = originalTitle;
    saveBtn.disabled = false;
  }
}

async function cancelEditMode() {
  const previewArea = document.getElementById('workspacePreviewArea');
  if (previewArea.classList.contains('has-unsaved')) {
    const confirmed = await confirmDiscardChanges(t('workspace.actionCancelEdit'));
    if (!confirmed) return;
  }
  exitEditMode(true);
  // 重新预览文件恢复原始视图
  const filePath = previewArea.dataset.previewPath;
  const fileName = previewArea.dataset.previewName;
  if (filePath && fileName) {
    await previewFile(filePath, fileName);
  }
}

function exitEditMode(refreshButtons) {
  const previewArea = document.getElementById('workspacePreviewArea');
  const filenameEl = document.getElementById('workspacePreviewFilename');
  const saveBtn = document.getElementById('workspacePreviewSaveBtn');
  const cancelBtn = document.getElementById('workspacePreviewCancelBtn');

  delete previewArea.dataset.editMode;
  previewArea.classList.remove('has-unsaved');
  filenameEl.classList.remove('modified');

  saveBtn.style.display = 'none';
  cancelBtn.style.display = 'none';
}

async function confirmDiscardChanges(action) {
  if (typeof window.showCustomConfirm === 'function') {
    return await window.showCustomConfirm(t('workspace.discardChangesPrompt', { action }), t('workspace.unsavedChanges'));
  }
  return window.confirm(t('workspace.discardChangesPrompt', { action }));
}

function handlePreviewKeydown(e) {
  const previewArea = document.getElementById('workspacePreviewArea');
  if (previewArea.style.display === 'none') return;

  // 编辑模式：Ctrl/Cmd+S 保存、Esc 取消
  if (previewArea.dataset.editMode === 'true') {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveEditedFile();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditMode();
    }
    return;
  }

  // 翻页快捷键：左右方向键翻页（PDF/PPT）
  // 当焦点在输入框/文本域时不触发，避免干扰输入
  const tag = (e.target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

  const previewType = previewArea.dataset.previewType;
  if (previewType !== 'pdf' && previewType !== 'pptx') return;

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    const prevBtn = document.getElementById(previewType === 'pdf' ? 'pdfPrevPage' : 'pptxPrevSlide');
    if (prevBtn && !prevBtn.disabled) prevBtn.click();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    const nextBtn = document.getElementById(previewType === 'pdf' ? 'pdfNextPage' : 'pptxNextSlide');
    if (nextBtn && !nextBtn.disabled) nextBtn.click();
  }
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
      completeUploadProgressPanel(progressPanel, t('workspace.downloadCanceled'), true);
      showToast(t('workspace.downloadCanceled'), 'info');
      return;
    }
    if (!result.success) {
      completeUploadProgressPanel(progressPanel, t('workspace.downloadFailed'), true);
      showToast(t('workspace.downloadFailedWithError', { error: result.error }), 'error');
      return;
    }
    triggerBrowserDownload(result.blob, result.name || fileName);
    updateUploadProgressPanel(progressPanel, {
      percent: 100, fileName, loaded: result.blob.size, totalBytes: result.blob.size,
      speed: 0, statusText: t('workspace.savingToLocal')
    });
    // Chrome download via <a> click cannot be monitored from JS,
    // show "已保存" after a reasonable delay for the save dialog to appear
    setTimeout(() => {
      completeUploadProgressPanel(progressPanel, t('workspace.savedToLocal'), false);
    }, 1500);
    showToast(t('workspace.downloaded', { name: result.name || fileName }), 'success');
  } catch (err) {
    if (err.name === 'AbortError') {
      completeUploadProgressPanel(progressPanel, t('workspace.downloadCanceled'), true);
      showToast(t('workspace.downloadCanceled'), 'info');
    } else {
      completeUploadProgressPanel(progressPanel, t('workspace.downloadFailed'), true);
      showToast(t('workspace.downloadFailedWithError', { error: err.message }), 'error');
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
    const name = paths[0].split(/[\\/]/).pop();
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

  const label = t('workspace.fileCount', { count: paths.length });
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
      completeUploadProgressPanel(progressPanel, t('workspace.downloadCanceled'), true);
      showToast(t('workspace.downloadCanceled'), 'info');
      return;
    }
    if (result.success && result.blob) {
      triggerBrowserDownload(result.blob, result.name || 'workspace.zip');
      completeUploadProgressPanel(progressPanel, t('workspace.downloadedCount', { count: paths.length }), false);
      showToast(t('workspace.downloadedZip', { count: paths.length }), 'success');
    } else {
      completeUploadProgressPanel(progressPanel, t('workspace.downloadFailed'), true);
      showToast(t('workspace.downloadFailedWithError', { error: result.error || t('workspace.unknownError') }), 'error');
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      completeUploadProgressPanel(progressPanel, t('workspace.downloadCanceled'), true);
      showToast(t('workspace.downloadCanceled'), 'info');
    } else {
      completeUploadProgressPanel(progressPanel, t('workspace.downloadFailed'), true);
      showToast(t('workspace.downloadFailedWithError', { error: err.message }), 'error');
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
      <span class="workspace-upload-progress-title">${t('workspace.uploading')}</span>
      <button class="workspace-upload-progress-cancel" title="${t('workspace.cancelUpload')}">
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
  const prefix = panel.classList.contains('download-mode') ? t('workspace.downloadInProgress') : t('workspace.uploadInProgress');
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
    showToast(t('workspace.agentNotConnectedUpload'), 'error');
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
                reject(new Error(data.error || t('workspace.uploadFailed')));
              }
            } catch {
              reject(new Error(t('workspace.parseResponseFailed')));
            }
          } else {
            try {
              const data = JSON.parse(xhr.responseText);
              reject(new Error(data.error || t('workspace.uploadFailedWithStatus', { status: xhr.status })));
            } catch {
              reject(new Error(t('workspace.uploadFailedWithStatus', { status: xhr.status })));
            }
          }
        };
        xhr.onerror = () => {
          activeXhrs.delete(xhr);
          reject(new Error(cancelled ? '__CANCELLED__' : t('workspace.networkError')));
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
    completeMsg = t('workspace.uploadCanceled');
    isError = true;
  } else {
    const parts = [];
    if (successCount > 0) parts.push(t('workspace.uploadSuccessCount', { count: successCount }));
    if (skippedCount > 0) parts.push(t('workspace.uploadSkippedCount', { count: skippedCount }));
    if (failCount > 0) parts.push(t('workspace.uploadFailedCount', { count: failCount }));
    completeMsg = parts.length > 0 ? t('workspace.uploadCompleteWithStats', { stats: parts.join(' / ') }) : t('workspace.uploadComplete');
    isError = failCount > 0;
  }
  completeUploadProgressPanel(progressPanel, completeMsg, isError);

  if (successCount > 0) showToast(t('workspace.uploadedFiles', { count: successCount }), 'success');
  if (skippedCount > 0) showToast(t('workspace.filesSkipped', { count: skippedCount }), 'info');
  if (failCount > 0) showToast(t('workspace.filesUploadFailed', { count: failCount }), 'error');
  if (cancelled) showToast(t('workspace.uploadCanceled'), 'info');

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

        // 归一化后比较，兼容 Windows 反斜杠路径
        const normSrc = normalizePath(srcPath);
        const normDest = normalizePath(destDir);
        if (normSrc === normDest) return; // 不能拖到自己上
        if (normSrc.startsWith(normDest + '/')) {
          showToast(t('workspace.cannotMoveToSubdir'), 'error');
          return;
        }

        showToast(t('workspace.moving'), 'info');
        const result = await moveFs(srcPath, destDir);
        if (result.success) {
          showToast(t('workspace.movedToDir', { name: srcName }), 'success');
          invalidateDirCache(currentPath);
          invalidateDirCache(destDir);
          const destDirName = destDir.split(/[\\/]/).pop();
          await refreshCurrent();
          scrollToNewFile(destDirName);
        } else {
          showToast(t('workspace.moveFailed', { error: result.error }), 'error');
        }
      } catch (err) {
        showToast(t('workspace.moveFailed', { error: err.message }), 'error');
      }
      return;
    }

    // 外部文件拖到目录项上：上传到该目录，并进入该目录查看
    if (dirItem && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const destDir = dirItem.dataset.path;
      const destDirName = destDir.split(/[\\/]/).pop();
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
    logger.debug('[WorkspacePanel] update agentname failed:', e);
  }
}

async function handleStorageChange(changes, namespace) {
  if (namespace !== 'local') return;
  if (!changes.pairedAgents && !changes.activeAgentId) return;

  await updateWorkspaceAgentName();

  const newAgentId = changes.activeAgentId?.newValue;
  const oldAgentId = changes.activeAgentId?.oldValue;

  if (newAgentId !== oldAgentId) {
    logger.debug('[WorkspacePanel] Agent changed,refreshworking directory');

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
      showToast(t('workspace.refreshFailed'), 'error');
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
  // workspaceRoot 归一化，兼容 Windows 反斜杠；去掉末尾斜杠以便前缀比较
  const normRoot = workspaceRoot ? normalizePath(workspaceRoot).replace(/\/$/, '') : null;
  let html = '';
  let accumulatedPath = '';
  for (let i = 0; i < parts.length; i++) {
    // 构造累积路径：Windows 盘符段(如 "C:")不加前导 /，避免拼出非法的 /C:/...
    if (i === 0) {
      accumulatedPath = /^[a-zA-Z]:$/.test(parts[i]) ? parts[i] + '/' : '/' + parts[i];
    } else {
      accumulatedPath = (accumulatedPath.endsWith('/') ? accumulatedPath : accumulatedPath + '/') + parts[i];
    }
    const isLast = i === parts.length - 1;
    // workspaceRoot 之上的路径段不可点击（无权限）
    const isClickable = !normRoot || accumulatedPath === normRoot || accumulatedPath.startsWith(normRoot + '/');
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
        
        // 归一化后比较，兼容 Windows 反斜杠路径
        const normSrc = normalizePath(srcPath);
        const normDest = normalizePath(destDir);
        if (normSrc === normDest) return;
        if (normDest.startsWith(normSrc + '/')) {
          showToast(t('workspace.cannotMoveToSubdir'), 'error');
          return;
        }

        showToast(t('workspace.moving'), 'info');
        const result = await moveFs(srcPath, destDir);
        if (result.success) {
          showToast(t('workspace.movedToTarget', { name: srcName, target: destDir.split(/[\\/]/).pop() }), 'success');
          invalidateDirCache(currentPath);
          invalidateDirCache(destDir);
          await refreshCurrent();
        } else {
          showToast(t('workspace.moveFailed', { error: result.error }), 'error');
        }
      } catch (err) {
        showToast(t('workspace.moveFailed', { error: err.message }), 'error');
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
    // 断开期间嵌入模式保留：重连后自动重新展开面板
    if (embedMode) {
      const panel = document.getElementById('workspacePanel');
      if (panel && !panel.classList.contains('expanded')) {
        openPanel().catch(err => logger.warn('[WorkspacePanel] reopen panel after reconnect failed', err));
      }
    }
    // Agent 连接后补恢复之前因未连接而挂起的嵌入模式
    if (pendingRestoreEmbed) {
      deferredEmbedRestore();
    }
  } else {
    container.style.display = 'none';
    closePanelInternal(true);
  }
}

/**
 * 剥离工作目录前缀（大小写不敏感，兼容 Windows 盘符大小写差异）
 * @param {string} p - 规范化后的绝对路径
 * @param {string} root - 规范化后的工作目录绝对路径
 * @returns {string|null} 相对路径；不在 root 下返回 null
 */
function stripRootPrefix(p, root) {
  const rootLower = root.toLowerCase();
  const pLower = p.toLowerCase();
  if (pLower === rootLower) return '';
  if (pLower.startsWith(rootLower + '/')) return p.substring(root.length + 1);
  return null;
}

/**
 * 通过工作目录 basename 截取相对路径：
 * 处理远程代理/沙箱路径前缀与本地不同的情况
 * （如 /home/agent/workspace/src/x.js vs /Users/me/workspace/src/x.js）
 * @returns {string|null} 相对路径；无法匹配返回 null
 */
function stripByRootBasename(p, root) {
  const rootBase = root.split('/').filter(Boolean).pop();
  if (!rootBase) return null;
  // 从后往前找最后一次出现的 '/basename'，工作目录通常是路径中最深的一层
  const idx = p.lastIndexOf('/' + rootBase);
  if (idx === -1) return null;
  const afterBase = p.substring(idx + rootBase.length + 1);
  if (afterBase === '') return '';
  return afterBase;
}

/**
 * 将产物路径解析为工作目录内的绝对路径。
 * 支持多种来源格式：
 * - 相对路径：src/utils/helper.js
 * - 本地绝对路径：/Users/xx/proj/src/utils/helper.js
 * - 远程/沙箱绝对路径（前缀不同）：/home/agent/proj/src/utils/helper.js
 * - Windows 盘符/反斜杠：C:\proj\src\utils\helper.js
 * - ~ 开头：~/proj/src/utils/helper.js
 * @param {string} filePath - 产物原始路径
 * @param {string} workspaceRootPath - 工作目录绝对路径
 * @returns {string|null} 解析后的绝对路径；无法定位返回 null
 */
function resolveWorkspacePath(filePath, workspaceRootPath) {
  if (!filePath) return null;
  const root = normalizePath(workspaceRootPath);
  if (!root) return null;

  let p = normalizePath(filePath).trim();
  if (!p || p === '.') return null;

  // 展开 ~ 前缀：~/xxx 视为工作目录下的相对路径
  if (p === '~') return root;
  if (p.startsWith('~/')) p = p.substring(2);

  const isAbs = p.startsWith('/') || /^[a-zA-Z]:\//.test(p);
  if (!isAbs) {
    // 相对路径：直接拼接到工作目录
    return root + '/' + p;
  }

  // 绝对路径：先尝试直接剥离工作目录前缀
  let rel = stripRootPrefix(p, root);
  if (rel === null) {
    // 前缀不同：尝试通过工作目录 basename 截取（远程/沙箱场景）
    rel = stripByRootBasename(p, root);
  }
  if (rel === null) return null;
  return rel === '' ? root : root + '/' + rel;
}

/**
 * 定位到工作目录中的某个文件：
 * 1. 展开工作目录面板
 * 2. 导航到文件所在目录
 * 3. 高亮目标文件项
 * @param {string} filePath - 产物路径（相对/绝对/~ 均可）
 */
export async function locateFileInWorkspace(filePath) {
  if (!filePath) return;
  const panel = document.getElementById('workspacePanel');
  const container = document.getElementById('workspacePanelContainer');
  if (!panel || !container) return;

  // 展开面板
  panel.classList.add('expanded');
  container.classList.add('click-opened');

  // 确保已获取 workspaceRoot
  if (!workspaceRoot) {
    workspaceRoot = await getWorkspaceRoot();
  }
  if (!workspaceRoot) {
    showError(t('workspace.noWorkspace'));
    return;
  }

  // 将产物路径解析为工作目录内的绝对路径（兼容相对/绝对/Windows/~ 等格式）
  const resolved = resolveWorkspacePath(filePath, workspaceRoot);
  if (!resolved) {
    showError(t('artifacts.locateFailed'));
    return;
  }

  // 计算所在目录
  const lastSlash = resolved.lastIndexOf('/');
  const dirPath = lastSlash > 0 ? resolved.substring(0, lastSlash) : workspaceRoot;
  const fileName = lastSlash > 0 ? resolved.substring(lastSlash + 1) : resolved;

  // 导航到目录（带搜索高亮）
  await navigateToPath(dirPath);

  // 高亮目标文件项
  setTimeout(() => {
    const items = document.querySelectorAll('.workspace-file-item');
    let targetItem = null;
    items.forEach(item => {
      const name = item.dataset.name;
      if (name === fileName) {
        targetItem = item;
      }
    });
    if (targetItem) {
      targetItem.classList.add('highlighted');
      targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 3秒后移除高亮
      setTimeout(() => targetItem.classList.remove('highlighted'), 3000);
    } else {
      // 目录已定位但文件未找到（可能已删除/不在列表中），给出提示
      showToast(t('artifacts.fileNotFound'));
    }
  }, 300);
}

/**
 * 预览工作目录中的文件（调用内部 previewFile）
 * @param {string} filePath - 产物路径（相对/绝对/~ 均可）
 * @param {string} fileName - 文件名
 */
export async function previewArtifactFile(filePath, fileName) {
  if (!filePath) return;
  const panel = document.getElementById('workspacePanel');
  const container = document.getElementById('workspacePanelContainer');
  if (!panel || !container) return;

  // 记录预览前面板是否已展开：面板因本次预览而展开（之前收起）时，
  // 关闭预览后自动收起，避免残留一个空的工作目录页面
  const panelWasExpanded = panel.classList.contains('expanded');

  // 展开面板
  panel.classList.add('expanded');
  container.classList.add('click-opened');

  // 确保已获取 workspaceRoot
  if (!workspaceRoot) {
    workspaceRoot = await getWorkspaceRoot();
  }
  if (!workspaceRoot) {
    showError(t('workspace.noWorkspace'));
    return;
  }

  // 将产物路径解析为工作目录内的绝对路径，避免远程前缀/格式不一致导致读取失败
  const resolved = resolveWorkspacePath(filePath, workspaceRoot);
  if (!resolved) {
    showError(t('artifacts.locateFailed'));
    return;
  }

  // 关闭旧的预览
  await closePreview(true);

  // 直接调用 previewFile
  await previewFile(resolved, fileName);

  // 面板因本次预览而展开（之前收起）：关闭预览时一并收起面板，
  // 避免残留空的工作目录页面需要用户再关闭一次
  previewAutoClosePanel = !panelWasExpanded;
}

/**
 * 关闭工作目录预览窗口（供产物管理等外部模块调用）
 */
export async function closeWorkspacePreview() {
  await closePreview(true);
}

/**
 * 关闭（收起）工作目录面板（供产物管理等外部模块调用）
 */
export function closeWorkspacePanel() {
  closePanelInternal(true);
}

/**
 * 将路径解析为工作目录内的绝对路径（供产物管理等外部模块调用）
 * @param {string} filePath - 相对/绝对/~ 路径均可
 * @returns {Promise<string|null>}
 */
export async function resolveWorkspaceAbsolutePath(filePath) {
  if (!filePath) return null;
  if (!workspaceRoot) {
    workspaceRoot = await getWorkspaceRoot();
  }
  if (!workspaceRoot) return null;
  return resolveWorkspacePath(filePath, workspaceRoot);
}

async function closePanelInternal(force = false) {
  // 强制关闭时才销毁预览（如 Agent 断开连接），普通切换面板时保留预览状态
  if (force) {
    const closed = await closePreview(true);
    if (closed === false) return;
  }
  const panel = document.getElementById('workspacePanel');
  const container = document.getElementById('workspacePanelContainer');
  if (panel) panel.classList.remove('expanded');
  if (container) {
    container.classList.remove('hover-expanded');
    container.classList.remove('click-opened');
    // 嵌入模式下无 toggle 入口，正常关闭（非 Agent 断开）即退出嵌入布局；
    // 但不持久化模式偏好（storage 保持嵌入），下次打开侧边栏直接恢复嵌入模式；
    // 仅用户主动点切换按钮退出嵌入时才持久化为浮窗
    if (embedMode && !force) {
      embedMode = false;
      pendingRestoreEmbed = false;
      // 临时禁用过渡：嵌入样式强制面板可见，退出嵌入瞬间面板会跳回浮窗定位
      // 并执行 0.25s 淡出过渡（先闪现浮窗再消失）；同帧移除 embedded 直接隐藏
      container.classList.add('closing-no-anim');
      exitEmbedMode();
      requestAnimationFrame(() => container.classList.remove('closing-no-anim'));
    }
  }
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

  showToast(t('workspace.searching'), 'info');
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
    ? t('workspace.confirmDeleteDir', { name, path })
    : t('workspace.confirmDeleteFile', { name, path });

  if (typeof window.showCustomConfirm !== 'function') {
    const confirmed = confirm(message);
    if (!confirmed) return;
  } else {
    const confirmed = await window.showCustomConfirm(message, t('workspace.confirmDeleteTitle'));
    if (!confirmed) return;
  }

  const content = document.getElementById('workspacePanelContent');
  const preservedScrollTop = content ? content.scrollTop : 0;

  try {
    const config = await getAgentConfig();
    if (!config) {
      showToast(t('workspace.agentNotConnected'), 'error');
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
      showToast(isDir ? t('workspace.dirDeleted') : t('workspace.fileDeleted'), 'success');
      selectedPaths.delete(path);
      updateDownloadBtn();
      await refreshCurrent(preservedScrollTop);
    } else {
      showToast(t('workspace.deleteFailedWithError', { error: data.error || t('workspace.unknownError') }), 'error');
    }
  } catch (err) {
    showToast(t('workspace.deleteFailedWithError', { error: err.message }), 'error');
  }
}

async function handleBatchDelete() {
  if (selectedPaths.size === 0) return;
  
  const paths = Array.from(selectedPaths);
  const names = paths.map(p => {
    const entry = cachedEntries.find(e => e.path === p) 
      || searchResults.find(e => e.fullPath === p);
    return entry ? entry.name : p.split(/[\\/]/).pop();
  });
  
  const namesStr = names.slice(0, 5).map(n => `• ${n}`).join('\n') + (names.length > 5 ? t('workspace.batchNamesMore', { count: names.length }) : '');
  const message = t('workspace.confirmBatchDelete', { count: paths.length, names: namesStr });

  if (typeof window.showCustomConfirm !== 'function') {
    const confirmed = confirm(message);
    if (!confirmed) return;
  } else {
    const confirmed = await window.showCustomConfirm(message, t('workspace.confirmBatchDeleteTitle'));
    if (!confirmed) return;
  }

  const content = document.getElementById('workspacePanelContent');
  const preservedScrollTop = content ? content.scrollTop : 0;

  try {
    const config = await getAgentConfig();
    if (!config) {
      showToast(t('workspace.agentNotConnected'), 'error');
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
      showToast(t('workspace.deletedCount', { success: successCount, failed: failCount > 0 ? t('workspace.deletedCountFailed', { count: failCount }) : '' }), failCount > 0 ? 'warning' : 'success');
      updateDownloadBtn();
      await refreshCurrent(preservedScrollTop);
    } else {
      showToast(t('workspace.deleteFailed'), 'error');
    }
  } catch (err) {
    showToast(t('workspace.deleteFailedWithError', { error: err.message }), 'error');
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
      <button class="file-info-close" title="${t('workspace.close')}" style="position:absolute;top:10px;right:12px;background:none;border:none;font-size:20px;color:#999;cursor:pointer;padding:4px 8px;line-height:1;transition:color 0.15s ease;">×</button>
      <div class="modal-title">${escapeHtml(fileName)} - ${t('workspace.fileDetailsLabel')}</div>
      <div class="file-info-loading">${t('workspace.loadingLabel')}</div>
      <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
        <button class="modal-btn-cancel" style="padding:6px 16px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;">${t('workspace.close')}</button>
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
      body.innerHTML = `<div class="workspace-panel-error">${t('workspace.getDetailsFailed', { error: result.error || t('workspace.unknownError') })}</div>`;
      return;
    }
    const info = result.info;
    const formatDate = (ts) => {
      if (!ts) return '—';
      const d = new Date(ts);
      return d.toLocaleString(getLanguage() === 'en' ? 'en-US' : 'zh-CN');
    };

    const typeText = info.isDirectory ? t('workspace.getTypeDir') : info.isSymbolicLink ? t('workspace.getTypeSymlink') : t('workspace.getTypeFile');
    const sizeText = info.isDirectory ? null : formatFileSize(info.size) + ` (${info.size.toLocaleString()} ${t('workspace.bytes')})`;
    const mimeText = info.mimeType || null;
    const permText = formatPermission(info.mode, info.isDirectory);

    const rows = [
      [t('workspace.infoName'), escapeHtml(info.name), info.name],
      [t('workspace.infoType'), typeText, typeText],
      [t('workspace.infoPath'), `<span style="word-break:break-all;">${escapeHtml(info.path)}</span>`, info.path],
      [t('workspace.infoSize'), sizeText || '—', sizeText],
      [t('workspace.infoMime'), mimeText ? escapeHtml(mimeText) : '—', mimeText],
      [t('workspace.infoMtime'), formatDate(info.mtime), formatDate(info.mtime)],
      [t('workspace.infoCtime'), formatDate(info.ctime), formatDate(info.ctime)],
      [t('workspace.infoAtime'), formatDate(info.atime), formatDate(info.atime)],
      [t('workspace.infoPermission'), escapeHtml(permText), permText]
    ];
    if (info.uid !== undefined) rows.push(['UID', String(info.uid), String(info.uid)]);
    if (info.gid !== undefined) rows.push(['GID', String(info.gid), String(info.gid)]);

    body.className = 'file-info-body';
    body.innerHTML = `<table class="file-info-table">${
      rows.map(([k, v, copyVal]) => {
        if (copyVal != null) {
          return `<tr><td class="file-info-key">${k}</td><td class="file-info-val file-info-copyable" data-copy="${escapeHtml(copyVal)}" title="${t('workspace.clickToCopy')}">${v}<svg class="file-info-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></td></tr>`;
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
          showToast(t('workspace.copiedToClipboard'), 'success');
        } catch {
          showToast(t('workspace.copyFailed'), 'error');
        }
      });
    });
  } catch (err) {
    const body = overlay.querySelector('.file-info-loading');
    body.className = '';
    body.innerHTML = `<div class="workspace-panel-error">${t('workspace.getDetailsFailed', { error: err.message })}</div>`;
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
          <button class="modal-btn-cancel" style="padding:6px 16px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;">${t('workspace.cancel')}</button>
          <button class="modal-btn-confirm" style="padding:6px 16px;border:none;border-radius:6px;background:#4a90d9;color:#fff;cursor:pointer;">${t('workspace.confirm')}</button>
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
 * 切换工作目录弹窗：列出 allowedPaths 供选择，支持手动输入绝对路径
 * 仅通过按钮关闭（取消/切换/列表项点击），禁止点击遮罩关闭
 */
async function showSwitchWorkdirDialog() {
  let detail = null;
  try {
    detail = await getAgentStatusDetail();
  } catch (err) {
    showToast(t('workspace.getWorkdirInfoFailed'), 'error');
    return;
  }
  if (!detail) {
    showToast(t('workspace.cannotConnectAgent'), 'error');
    return;
  }

  const currentWorkdir = detail.workdir || '';
  let allowedPaths = Array.isArray(detail.allowedPaths) ? [...detail.allowedPaths] : [];

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="modal-container switch-workdir-dialog" style="max-width:480px;width:90%;box-sizing:border-box;position:relative;">
        <button class="switch-workdir-close" title="${t('workspace.close')}" style="position:absolute;top:10px;right:12px;width:28px;height:28px;border:none;background:transparent;color:#999;border-radius:6px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;padding:0;transition:all 0.2s;">✕</button>
        <div class="modal-title">${t('workspace.switchWorkdirTitle')}</div>
        <div style="font-size:12px;color:#888;margin-bottom:10px;word-break:break-all;">${t('workspace.currentLabel')}<span style="color:#4a90d9;" title="${escapeHtml(currentWorkdir)}">${escapeHtml(currentWorkdir) || t('workspace.notSet')}</span></div>
        <div style="font-size:12px;color:#999;margin:6px 0;">${t('workspace.selectFromAllowed')}</div>
        <div class="switch-workdir-list" id="switchWorkdirList" style="max-height:180px;overflow-y:auto;border:1px solid #eee;border-radius:8px;margin-bottom:10px;"></div>
        <div style="font-size:12px;color:#999;margin:6px 0;">${t('workspace.orInputPath')}</div>
        <input type="text" class="switch-workdir-manual" placeholder="${t('workspace.manualPathPlaceholder')}" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;margin-bottom:12px;" autofocus>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="switch-workdir-cancel" style="padding:6px 16px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;">${t('workspace.cancel')}</button>
          <button class="switch-workdir-confirm" style="padding:6px 16px;border:none;border-radius:6px;background:#4a90d9;color:#fff;cursor:pointer;">${t('workspace.switchBtn')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const listEl = overlay.querySelector('#switchWorkdirList');
    const manualInput = overlay.querySelector('.switch-workdir-manual');
    const cancelBtn = overlay.querySelector('.switch-workdir-cancel');
    const confirmBtn = overlay.querySelector('.switch-workdir-confirm');
    const closeBtn = overlay.querySelector('.switch-workdir-close');

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      overlay.remove();
    };

    // 渲染允许目录列表（删除后复用）
    function renderList() {
      if (!allowedPaths.length) {
        listEl.innerHTML = '<div style="padding:16px;text-align:center;color:#aaa;font-size:13px;">' + t('workspace.noAllowedPaths') + '</div>';
        return;
      }
      listEl.innerHTML = allowedPaths.map(p => {
        const isCurrent = p === currentWorkdir;
        return `
            <div class="switch-workdir-item${isCurrent ? ' current' : ''}" data-path="${escapeHtml(p)}" title="${escapeHtml(p)}" style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:${isCurrent ? 'default' : 'pointer'};font-size:13px;color:${isCurrent ? '#888' : '#333'};word-break:break-all;border-bottom:1px solid #f5f5f5;${isCurrent ? 'background:#f6f8fa;' : ''}">
              <span style="flex-shrink:0;">📁</span>
              <span style="flex:1;">${escapeHtml(p)}</span>
              ${isCurrent
                ? '<span style="flex-shrink:0;font-size:11px;color:#4a90d9;border:1px solid #4a90d9;border-radius:4px;padding:0 6px;">' + t('workspace.currentTag') + '</span>'
                : '<button class="switch-workdir-remove" data-remove-path="' + escapeHtml(p) + '" title="' + t('workspace.removeFromAllowed') + '" style="flex-shrink:0;background:none;border:none;color:#e53e3e;cursor:pointer;font-size:16px;line-height:1;padding:2px 6px;border-radius:4px;">×</button>'
              }
            </div>`;
      }).join('');
    }
    renderList();

    // 移除允许目录
    async function doRemove(targetPath) {
      const ok = await window.showCustomConfirm(
        t('workspace.confirmRemovePath', { path: targetPath }),
        t('workspace.confirmRemovePathTitle')
      );
      if (!ok) return;
      const result = await removeAllowedPath(targetPath);
      if (result.success) {
        allowedPaths = Array.isArray(result.allowedPaths) ? result.allowedPaths : allowedPaths.filter(p => p !== targetPath);
        renderList();
        showToast(t('workspace.removedFromAllowed'), 'success');
      } else {
        showToast(t('workspace.removeFailedWithError', { error: result.error || t('workspace.unknownError') }), 'error');
      }
    }

    // 列表事件委托：点击项切换、点击删除按钮移除
    listEl.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.switch-workdir-remove');
      if (removeBtn) {
        e.stopPropagation();
        doRemove(removeBtn.dataset.removePath);
        return;
      }
      const item = e.target.closest('.switch-workdir-item:not(.current)');
      if (item) {
        doSwitch(item.dataset.path);
      }
    });

    async function doSwitch(targetPath) {
      if (!targetPath) {
        showToast(t('workspace.selectOrInputPath'), 'error');
        return;
      }
      targetPath = targetPath.trim();
      if (targetPath === currentWorkdir) {
        showToast(t('workspace.alreadyCurrentWorkdir'), 'info');
        cleanup();
        resolve(false);
        return;
      }
      // 超出 allowedPaths 的路径给一次确认（自定义弹窗，非原生 confirm）
      // 跨平台路径比较：统一分隔符为 / + 大小写不敏感（Windows 盘符大小写不敏感、支持 / 和 \ 混用）
      const normPath = s => s.replace(/\\/g, '/').toLowerCase();
      const isAllowed = allowedPaths.some(p => {
        const tp = normPath(targetPath);
        const lp = normPath(p);
        return tp === lp || tp.startsWith(lp + '/');
      });
      if (!isAllowed) {
        const ok = await window.showCustomConfirm(
          t('workspace.confirmSwitchToNew', { path: targetPath }),
          t('workspace.confirmSwitchToNewTitle')
        );
        if (!ok) return;
      }
      cleanup();
      const result = await performSwitchWorkdir(targetPath);
      resolve(result);
    }

    confirmBtn.addEventListener('click', () => doSwitch(manualInput.value));
    cancelBtn.addEventListener('click', () => { cleanup(); resolve(false); });
    closeBtn.addEventListener('click', () => { cleanup(); resolve(false); });
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#333'; closeBtn.style.background = '#e8e8e8'; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#999'; closeBtn.style.background = 'transparent'; });
    manualInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doSwitch(manualInput.value); }
      if (e.key === 'Escape') { cleanup(); resolve(false); }
    });
    // 禁止点击遮罩关闭（符合 no-native-dialogs 规则）
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) e.stopPropagation();
    });
    setTimeout(() => manualInput.focus(), 50);
  });
}

/**
 * 执行切换：调后端接口 + 同步所有前端缓存 + 重新导航
 */
async function performSwitchWorkdir(newWorkdir) {
  const result = await switchWorkspace(newWorkdir);
  if (!result.success) {
    showToast(t('workspace.switchFailedWithError', { error: result.error || t('workspace.unknownError') }), 'error');
    return false;
  }

  // 1) resetWorkspaceRoot 已在 switchWorkspace 内调用
  // 2) 清面板本地状态（同 handleStorageChange 代理切换逻辑）
  workspaceRoot = null;
  currentPath = null;
  pathHistory = [];
  selectedPaths.clear();
  searchQuery = '';
  searchResults = [];
  isSearchMode = false;
  dirCache.clear();

  // 2.1) 清搜索框 DOM 残留（输入框 value / 清除按钮 / 展开态）
  //      仅清 JS 变量不够：输入框旧关键词会带到新目录，点搜索时 searchQuery 已空 → performSearch 直接 return → "点不动"
  const _searchInput = document.getElementById('workspaceSearchInput');
  if (_searchInput) _searchInput.value = '';
  const _clearBtn = document.getElementById('workspaceSearchClear');
  if (_clearBtn) _clearBtn.style.display = 'none';
  const _toolbar = document.getElementById('workspaceToolbar');
  if (_toolbar) {
    _toolbar.classList.remove('search-focused');
    const _box = _toolbar.querySelector('.workspace-search-box');
    if (_box) _box.classList.remove('search-box-expanded');
  }

  // 3) 同步 state.agentPlatform.workdir（system prompt 下次构建自动用新值）
  if (state.agentPlatform) {
    state.agentPlatform = { ...state.agentPlatform, workdir: result.workdir };
  }

  // 4) 同步 state.agentWorkdirs（代理下拉列表显示）
  try {
    const { activeAgentId } = await chrome.storage.local.get(['activeAgentId']);
    if (activeAgentId) {
      state.agentWorkdirs.set(activeAgentId, result.workdir);
      // 5) 更新下拉列表该项显示（index.js 暴露的全局函数）
      if (typeof window.updateAgentItemWorkdir === 'function') {
        window.updateAgentItemWorkdir(activeAgentId, result.workdir);
      }
    }
  } catch (e) {
    logger.debug('[WorkspacePanel] sync dropdown column table workdir failed:', e);
  }

  // 6) 重新导航到新 root
  const panel = document.getElementById('workspacePanel');
  if (panel && panel.classList.contains('expanded')) {
    await navigateToRoot();
  }

  showToast(t('workspace.switchedTo', { path: result.workdir }), 'success');
  return true;
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
    type === 'directory' ? t('workspace.renameDir') : t('workspace.renameFile'),
    baseName,
    t('workspace.inputNewName')
  );
  if (!newBase || newBase === baseName) return;

  const newName = newBase + ext;
  try {
    const result = await renameFs(path, newName);
    if (result.success) {
      showToast(t('workspace.renamedTo', { name: newName }), 'success');
      invalidateDirCache(currentPath);
      await refreshCurrent();
      scrollToNewFile(newName);
    } else {
      showToast(t('workspace.renameFailedWithError', { error: result.error }), 'error');
    }
  } catch (err) {
    showToast(t('workspace.renameFailedWithError', { error: err.message }), 'error');
  }
}

/**
 * 处理新建文件夹
 */
async function handleNewFolder() {
  if (!currentPath) return;

  const dirName = await showInputDialog(t('workspace.newFolderTitle'), '', t('workspace.inputFolderName'));
  if (!dirName) return;

  const dirPath = normalizePath(`${currentPath}/${dirName}`);
  try {
    const result = await createDir(dirPath);
    if (result.success) {
      showToast(t('workspace.folderCreated', { name: dirName }), 'success');
      invalidateDirCache(currentPath);
      await refreshCurrent();
      scrollToNewFile(dirName);
    } else {
      showToast(t('workspace.createFailedWithError', { error: result.error }), 'error');
    }
  } catch (err) {
    showToast(t('workspace.createFailedWithError', { error: err.message }), 'error');
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
      reject(new Error(t('workspace.imageLoadFailed')));
    };

    img.src = url;
  });
}

async function attachFilesForQuestion(paths) {
  const regularFiles = [];
  const imageFiles = [];

  for (const item of paths) {
    // 支持直接传入带元数据的条目对象（如 $ 选择器：{ fullPath, name, type, size, mtime }），
    // 或仅传入路径字符串（从工作目录面板现有缓存条目中查找）
    const hasMeta = item && typeof item === 'object';
    const path = hasMeta ? (item.fullPath || item.path) : item;
    const name = path.split(/[\\/]/).pop();
    let entry;
    if (hasMeta) {
      entry = item;
    } else {
      entry = cachedEntries.find(e => e.path === path);
      if (!entry) {
        entry = searchResults.find(e => e.fullPath === path);
      }
    }
    const size = entry ? entry.size : 0;
    const mime = getMimeType(name);
    const isImage = mime.startsWith('image/');
    // 仅当启用图片识别时才按图片处理，否则一律作为文件附件
    const shouldTreatAsImage = isImage && state.enableImageInput;

    if (shouldTreatAsImage) {
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
    // 未启用图片识别时，提示图片已作为文件处理
    if (!state.enableImageInput && regularFiles.some(f => f.type?.startsWith('image/'))) {
      showToast(t('workspace.addedFilesToQuestionNoImage', { count: total }), 'success');
    } else {
      showToast(t('workspace.addedFilesToQuestion', { count: total }), 'success');
    }
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
    countEl.textContent = t('workspace.selectedCount', { count: selectedPaths.size });
    btn.disabled = downloadInProgress;
  }
  updateAskBtn();
}
