// workspace-manager.js - 工作目录数据管理

import logger from '../shared/logger.js';

/**
 * 文件扩展名对应的图标
 */
const FILE_ICONS = {
  // 文本/代码
  txt: '📄', md: '📝', json: '📋',
  js: '📜', mjs: '📜', ts: '📘', jsx: '⚛️', tsx: '⚛️',
  html: '🌐', htm: '🌐', css: '🎨', scss: '🎨', less: '🎨',
  xml: '📰', yaml: '📰', yml: '📰',
  py: '🐍', java: '☕', c: '⚙️', cpp: '⚙️', h: '⚙️',
  go: '🔹', rs: '🦀', rb: '💎', php: '🐘',
  sql: '🗄️', sh: '💻', bash: '💻', zsh: '💻',
  cfg: '⚙️', ini: '⚙️', toml: '⚙️', conf: '⚙️',
  log: '📊', csv: '📊', tsv: '📊', env: '🔒',
  vue: '💚', svelte: '🧡', astro: '🚀', rtf: '📄',
  // 图片
  svg: '🖼️', png: '🖼️', jpg: '🖼️', jpeg: '🖼️',
  gif: '🖼️', webp: '🖼️', bmp: '🖼️', ico: '🖼️',
  // 文档
  pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗',
  ppt: '📙', pptx: '📙',
  // 压缩
  zip: '📦', gz: '📦', tar: '📦', rar: '📦', '7z': '📦',
  // 音视频
  mp3: '🎵', wav: '🎵', mp4: '🎬', webm: '🎬', avi: '🎬',
};

/**
 * 获取文件图标
 */
export function getFileIcon(name, type) {
  if (type === 'directory') return '📁';
  const ext = (name.split('.').pop() || '').toLowerCase();
  return FILE_ICONS[ext] || '📄';
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * 格式化时间
 */
export function formatTime(mtime) {
  if (!mtime) return '—';
  return new Date(mtime).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

/**
 * 判断文件是否支持预览
 */
export function supportsPreview(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const textExts = new Set([
    'txt', 'md', 'json', 'js', 'mjs', 'ts', 'jsx', 'tsx',
    'html', 'htm', 'css', 'scss', 'less', 'xml', 'yaml', 'yml',
    'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'rb', 'php',
    'sql', 'sh', 'bash', 'zsh', 'cfg', 'ini', 'toml', 'conf',
    'log', 'csv', 'tsv', 'env', 'vue', 'svelte', 'astro', 'rtf', 'svg',
  ]);
  return textExts.has(ext);
}

/**
 * 判断是否为图片文件
 */
export function isImageFile(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg']).has(ext);
}

/**
 * 获取 MIME 类型
 */
export function getMimeType(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const mimeMap = {
    txt: 'text/plain', md: 'text/markdown',
    json: 'application/json', js: 'application/javascript',
    html: 'text/html', css: 'text/css',
    xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml',
    csv: 'text/csv', svg: 'image/svg+xml',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    pdf: 'application/pdf',
  };
  return mimeMap[ext] || 'text/plain';
}

// 缓存工作目录路径
let _workspaceRoot = null;
let _agentConfig = null;

/**
 * 获取 Agent 连接配置
 */
export async function getAgentConfig() {
  if (_agentConfig && _agentConfig.url && _agentConfig.token) return _agentConfig;
  try {
    const result = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = result.pairedAgents || [];
    const activeId = result.activeAgentId;
    if (!activeId || agents.length === 0) return null;
    const active = agents.find(a => a.id === activeId) || agents[0];
    if (!active) return null;
    _agentConfig = { url: active.url, token: active.token };
    return _agentConfig;
  } catch (err) {
    logger.warn('[WorkspaceManager] 获取Agent配置失败:', err.message);
    return null;
  }
}

/**
 * 获取工作目录根路径
 */
export async function getWorkspaceRoot() {
  if (_workspaceRoot) return _workspaceRoot;
  const config = await getAgentConfig();
  if (!config) return null;
  try {
    const resp = await fetch(`${config.url}/api/status/detail`, {
      headers: { 'Authorization': `Bearer ${config.token}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.success && data.workdir) {
        _workspaceRoot = data.workdir;
        return _workspaceRoot;
      }
    }
  } catch (err) {
    logger.warn('[WorkspaceManager] 获取工作目录失败:', err.message);
  }
  return null;
}

/**
 * 重置工作目录缓存（切换代理时调用）
 */
export function resetWorkspaceRoot() {
  _workspaceRoot = null;
  _agentConfig = null;
}

/**
 * 直接向 Agent 发送请求
 */
async function agentRequest(path, body = {}) {
  const config = await getAgentConfig();
  if (!config) return { success: false, error: 'Agent 未配对，请先在设置中完成配对' };
  try {
    const resp = await fetch(`${config.url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      },
      body: JSON.stringify(body)
    });
    return await resp.json();
  } catch (err) {
    return { success: false, error: `请求失败: ${err.message}` };
  }
}

/**
 * 列出目录内容
 * @param {string} dirPath - 目录路径（相对于工作目录或绝对路径）
 */
export async function listDirectory(dirPath) {
  return agentRequest('/api/fs/list', { path: dirPath || '.' });
}

/**
 * 读取文件内容（用于预览）
 */
export async function readFileContent(filePath) {
  return agentRequest('/api/fs/read', { path: filePath });
}

/**
 * 下载文件或目录
 */
export async function downloadFile(filePath) {
  return agentRequest('/api/fs/download', { path: filePath });
}

/**
 * 批量下载多个文件/目录（后端打包）
 */
export async function downloadFiles(paths) {
  return agentRequest('/api/fs/download-multi', { paths });
}

/**
 * 搜索文件（后端递归搜索，单次请求，避免前端多次串行请求）
 */
export async function searchFilesRemote(dirPath, query, maxResults = 200) {
  const result = await agentRequest('/api/fs/search_files', {
    path: dirPath,
    pattern: `*${query}*`,
    recursive: true,
    maxResults
  });
  if (!result.success) return [];
  return (result.results || []).map(r => {
    const dir = r.path.substring(0, r.path.lastIndexOf('/'));
    return {
      name: r.name,
      type: r.type || 'file',
      size: r.size,
      mtime: r.mtime,
      fullPath: r.path,
      matchPath: dir
    };
  });
}

/**
 * 从 Content-Disposition 头提取文件名
 */
function extractFilename(cd, fallback) {
  if (!cd) return fallback;
  const match = cd.match(/filename\*=UTF-8''(.+?)(?:;|$)/) || cd.match(/filename="(.+?)"/);
  return match ? decodeURIComponent(match[1]) : fallback;
}

/**
 * 流式下载文件或目录（返回 Blob，避免 base64 膨胀）
 */
export async function downloadFileStream(filePath) {
  const config = await getAgentConfig();
  if (!config) return { success: false, error: 'Agent 未配对，请先在设置中完成配对' };
  try {
    const resp = await fetch(`${config.url}/api/fs/download-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      },
      body: JSON.stringify({ path: filePath })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      return { success: false, error: err.error || '下载失败' };
    }
    const blob = await resp.blob();
    const name = extractFilename(resp.headers.get('Content-Disposition'), filePath.split('/').pop());
    return { success: true, blob, name, mimeType: resp.headers.get('Content-Type') };
  } catch (err) {
    return { success: false, error: `请求失败: ${err.message}` };
  }
}

/**
 * 流式批量下载（返回 Blob）
 */
export async function downloadFilesStream(paths) {
  const config = await getAgentConfig();
  if (!config) return { success: false, error: 'Agent 未配对，请先在设置中完成配对' };
  try {
    const resp = await fetch(`${config.url}/api/fs/download-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      },
      body: JSON.stringify({ paths })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      return { success: false, error: err.error || '下载失败' };
    }
    const blob = await resp.blob();
    const name = extractFilename(resp.headers.get('Content-Disposition'), 'workspace.zip');
    return { success: true, blob, name, mimeType: resp.headers.get('Content-Type') };
  } catch (err) {
    return { success: false, error: `请求失败: ${err.message}` };
  }
}

/**
 * 删除文件或目录
 */
export async function deleteFs(path) {
  return agentRequest('/api/fs/delete', { path });
}

/**
 * 重命名文件或目录
 * @param {string} filePath - 原路径
 * @param {string} newName - 新文件名（包含后缀）
 */
export async function renameFs(filePath, newName) {
  return agentRequest('/api/fs/rename', { path: filePath, newName });
}

/**
 * 创建目录
 * @param {string} dirPath - 新目录完整路径
 */
export async function createDir(dirPath) {
  return agentRequest('/api/fs/mkdir', { path: dirPath });
}

/**
 * 移动文件或目录
 * @param {string} srcPath - 源路径
 * @param {string} destDir - 目标目录路径
 */
export async function moveFs(srcPath, destDir) {
  return agentRequest('/api/fs/move', { path: srcPath, destDir });
}
