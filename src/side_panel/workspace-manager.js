// workspace-manager.js - 工作目录数据管理

import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';
import { decodeSecret } from '../shared/secret.js';
import state from './state.js';
import { invalidateDefaultWorkdir } from '../shared/workdir-scope.js';

registerTranslations('zh', {
  workspaceMgr: {
    agentNotPairedDetail: 'Agent 未配对，请先在设置中完成配对',
    agentNotPaired: 'Agent 未配对',
    requestFailed: '请求失败: {message}',
    downloadFailed: '下载失败',
    cancelled: '已取消',
  },
});
registerTranslations('en', {
  workspaceMgr: {
    agentNotPairedDetail: 'Agent not paired. Please complete pairing in Settings first.',
    agentNotPaired: 'Agent not paired',
    requestFailed: 'Request failed: {message}',
    downloadFailed: 'Download failed',
    cancelled: 'Cancelled',
  },
});

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
  const previewExts = new Set([
    // 文本/代码
    'txt', 'md', 'json', 'js', 'mjs', 'ts', 'jsx', 'tsx',
    'html', 'htm', 'css', 'scss', 'less', 'xml', 'yaml', 'yml',
    'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'rb', 'php',
    'sql', 'sh', 'bash', 'zsh', 'cfg', 'ini', 'toml', 'conf',
    'log', 'csv', 'tsv', 'env', 'vue', 'svelte', 'astro', 'rtf', 'svg',
    // 文档
    'pdf', 'docx',
    // 演示文稿
    'pptx',
    // 表格
    'xlsx', 'xls',
    // 图片
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico',
    // 视频（浏览器原生可播放）
    'mp4', 'webm', 'ogg', 'm4v', 'mov',
    // 音频（浏览器原生可播放）
    'mp3', 'wav', 'm4a', 'aac', 'flac', 'opus',
  ]);
  return previewExts.has(ext);
}

/**
 * 获取文件预览类型分类
 * @returns {'text'|'pdf'|'docx'|'xlsx'|'pptx'|'image'|'video'|'audio'|'unknown'}
 */
export function getPreviewType(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'pptx') return 'pptx';
  if (new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico']).has(ext)) return 'image';
  if (new Set(['mp4', 'webm', 'ogg', 'm4v', 'mov']).has(ext)) return 'video';
  if (new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'opus']).has(ext)) return 'audio';
  // 剩下的文本/代码/svg 都按 text 处理
  return 'text';
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
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // 视频
    mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
    m4v: 'video/x-m4v', mov: 'video/quicktime',
    // 音频
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
    aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg',
  };
  return mimeMap[ext] || 'text/plain';
}

// 缓存工作目录路径
// 缓存键含「会话 + 代理」：换会话或换代理都必须失效，否则文件选择器/面板会串目录
let _workspaceRoot = null;
let _workspaceRootKey = null;
let _homeDir = null;
let _agentConfig = null;

/**
 * 当前面板所在会话 id（工作目录面板 / $ 选择器 / 产物列表都属于“正在看的这个会话”）
 * @returns {string|null}
 */
function currentSessionId() {
  try {
    return state?.activeSessionId || null;
  } catch {
    return null;
  }
}

/**
 * 代理请求头（唯一拼头入口）：带会话头，代理端据此把相对路径与权限校验绑到该会话的目录。
 *
 * 凡是不能走 agentRequest 的调用（stream / blob / XHR / multipart）都必须用它：
 * 手工拼 `Authorization` 会漏掉会话头，而代理端会按全局默认目录校验——
 * 会话一旦绑定到非默认目录，这些请求全部 403（上传/删除/预览/下载皆然）。
 * @param {{ token: string }} config
 * @param {string|null} [sessionId] 缺省用面板当前会话；显式 null 表示不带会话头
 * @returns {Object<string, string>}
 */
export function buildAgentHeaders(config, sessionId = currentSessionId()) {
  const headers = { 'Authorization': `Bearer ${config.token}` };
  if (sessionId) headers['X-AIH-Session-Id'] = sessionId;
  return headers;
}

/**
 * 代理不可达判定：浏览器 fetch 网络失败文案跨浏览器不同
 * （Chrome "Failed to fetch" / Safari "Load failed" / Firefox "NetworkError..."）
 */
function isAgentUnreachableError(err) {
  if (err instanceof TypeError) return true;
  const lower = String((err && err.message) || '').toLowerCase();
  return lower.includes('failed to fetch') || lower.includes('load failed') || lower.includes('networkerror');
}

/**
 * 探测型请求（工作目录/家目录/状态详情）失败处理：
 * 代理未连接/不可达属可预期状态（加号菜单可见性、@选择器等会高频探测触发），
 * 降为 debug 避免控制台噪音；其他异常（如响应解析错误）保留 warn 便于诊断。
 */
function logProbeFailure(scope, err) {
  const detail = err && err.message;
  if (isAgentUnreachableError(err)) {
    logger.debug(`[WorkspaceManager] ${scope} skipped (agent unreachable):`, detail);
  } else {
    logger.warn(`[WorkspaceManager] ${scope} failed:`, detail);
  }
}

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
    // token 在存储中以 enc: 混淆，发请求前必须解码为明文，否则代理端鉴权失败（401）
    _agentConfig = { id: active.id, url: active.url, token: decodeSecret(active.token) };
    return _agentConfig;
  } catch (err) {
    logger.warn('[WorkspaceManager] getAgentconfiguration failed:', err.message);
    return null;
  }
}

/**
 * 获取工作目录根路径（按会话解析：已绑定取绑定值，未绑定取代理默认值）
 * @param {string} [sessionId] 目标会话；缺省用面板当前会话
 * @returns {Promise<string|null>}
 */
export async function getWorkspaceRoot(sessionId) {
  const sid = sessionId === undefined ? currentSessionId() : sessionId;
  const config = await getAgentConfig();
  const key = `${sid || ''}::${config?.id || config?.url || ''}`;
  if (_workspaceRoot && _workspaceRootKey === key) return _workspaceRoot;
  if (!config) return null;
  try {
    const resp = await fetch(`${config.url}/api/status/detail`, {
      headers: buildAgentHeaders(config, sid)
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.success && data.workdir) {
        _workspaceRoot = data.workdir;
        _workspaceRootKey = key;
        return _workspaceRoot;
      }
    }
  } catch (err) {
    logProbeFailure('get workingdirectory', err);
  }
  return null;
}

/**
 * 获取 Agent 所在机器的家目录（用于展开产物路径中的 ~/ 前缀）
 * 与 workdir 同源自 /api/status/detail 的 homeDir 字段
 */
export async function getHomeDir() {
  if (_homeDir) return _homeDir;
  const config = await getAgentConfig();
  if (!config) return null;
  try {
    const resp = await fetch(`${config.url}/api/status/detail`, {
      headers: { 'Authorization': `Bearer ${config.token}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.success && data.homeDir) {
        _homeDir = data.homeDir;
        return _homeDir;
      }
    }
  } catch (err) {
    logProbeFailure('get homedir', err);
  }
  return null;
}

/**
 * 重置工作目录缓存（切换代理 / 切换会话 / 目录变更时调用）
 */
export function resetWorkspaceRoot() {
  _workspaceRoot = null;
  _workspaceRootKey = null;
  _homeDir = null;
  _agentConfig = null;
  invalidateDefaultWorkdir();
}

/**
 * 获取 Agent 状态详情（含 workdir、allowedPaths 等）
 * 切换工作目录弹窗用
 * @param {string} [sessionId] 目标会话；缺省用面板当前会话（workdir 为会话有效目录）
 * @returns {Promise<Object|null>}
 */
export async function getAgentStatusDetail(sessionId) {
  const sid = sessionId === undefined ? currentSessionId() : sessionId;
  const config = await getAgentConfig();
  if (!config) return null;
  try {
    const resp = await fetch(`${config.url}/api/status/detail`, {
      headers: buildAgentHeaders(config, sid)
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.success) return data;
    }
  } catch (err) {
    logProbeFailure('get statusdetailcase', err);
  }
  return null;
}

/**
 * 切换工作目录
 * 有 sessionId：只绑定本会话（代理端不写 config、不改 allowedPaths），可选同时设为代理默认目录
 * 无 sessionId：沿用全局切换语义（影响所有未绑定会话）
 * @param {string} newWorkdir - 新工作目录绝对路径
 * @param {Object} [options]
 * @param {string|null} [options.sessionId] 目标会话；显式传 null 表示全局切换
 * @param {boolean} [options.setAsDefault] 绑定成功后是否再走一次全局切换
 * @returns {Promise<{success: boolean, workdir?: string, scope?: string, allowedPaths?: string[], error?: string}>}
 */
export async function switchWorkspace(newWorkdir, options = {}) {
  const sid = options.sessionId === undefined ? currentSessionId() : options.sessionId;
  // scope 显式声明意图：代理端据此区分「只绑本会话」与「改全局默认」，
  // 漏传 sessionId 时不会静默降级成全局切换（那会改掉所有未绑定会话的目录）
  const body = { workdir: newWorkdir, scope: sid ? 'session' : 'global' };
  if (sid) body.sessionId = sid;
  const result = await agentRequest('/api/config/workdir', body, sid);
  if (result.success) {
    // 清缓存：让 getWorkspaceRoot 下次重新拉取新 workdir
    resetWorkspaceRoot();
  }
  return result;
}

/**
 * 从允许访问目录列表中移除指定路径（不可移除当前工作目录）
 * @param {string} path - 要移除的目录绝对路径
 * @returns {Promise<{success: boolean, allowedPaths?: string[], error?: string}>}
 */
export async function removeAllowedPath(path) {
  return agentRequest('/api/config/allowed-paths/remove', { path });
}

// 目录选择要等用户操作：agent 端最多等 120s，扩展端留出更长的窗口，
// 避免 agent 端超时返回时扩展端早已放弃；两者都配超时，按钮不会永远停在“等待选择…”
// 必须大于 agent 端的多后端总预算（180s：窗口未出现的快速切换 + 用户选择时长），
// 否则扩展端会先放弃，把一次正常的选择判成超时
export const PICK_DIRECTORY_CLIENT_TIMEOUT_MS = 200 * 1000;

/**
 * 弹出 Agent 端系统原生目录选择框（仅本机代理支持，远端/无桌面环境返回 available:false）
 * 显式捕获 HTTP 状态：旧版代理端无此端点会返回 404，需区分“版本过旧”与“弹窗失败”
 * @returns {Promise<{success: boolean, path?: string|null, available?: boolean, outdated?: boolean,
 *   error?: string, backend?: string, attempts?: Array<object>, diagnostics?: string}>}
 */
export async function pickDirectory() {
  const config = await getAgentConfig();
  if (!config) return { success: false, available: false, error: t('workspaceMgr.agentNotPairedDetail') };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PICK_DIRECTORY_CLIENT_TIMEOUT_MS);
  try {
    const resp = await fetch(`${config.url}/api/config/pick-directory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      },
      body: JSON.stringify({}),
      signal: controller.signal
    });
    if (resp.status === 404) {
      return { success: false, path: null, available: false, outdated: true };
    }
    const data = await resp.json();
    return data && typeof data === 'object'
      ? data
      : { success: false, path: null, available: true, error: 'bad-response' };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      // agent 端整体失去响应（例如弹窗进程卡死且兜底未生效）：交给 UI 提示后重试
      return { success: false, path: null, available: true, error: 'client-timeout' };
    }
    return { success: false, path: null, error: t('workspaceMgr.requestFailed', { message: err.message }) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 直接向 Agent 发送请求
 * @param {string} path
 * @param {Object} [body]
 * @param {string|null} [sessionId] 目标会话；undefined 表示用面板当前会话，null 表示不带会话头
 */
async function agentRequest(path, body = {}, sessionId = undefined) {
  const config = await getAgentConfig();
  if (!config) return { success: false, error: t('workspaceMgr.agentNotPairedDetail') };
  const sid = sessionId === undefined ? currentSessionId() : sessionId;
  try {
    const resp = await fetch(`${config.url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAgentHeaders(config, sid)
      },
      body: JSON.stringify(body)
    });
    return await resp.json();
  } catch (err) {
    return { success: false, error: t('workspaceMgr.requestFailed', { message: err.message }) };
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
 * 写入文件内容（用于编辑保存）
 */
export async function writeFileContent(filePath, content) {
  return agentRequest('/api/fs/write', { path: filePath, content });
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

function normalizePath(p) {
  return (p || '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

function isAbsolutePath(p) {
  if (!p) return false;
  if (p.startsWith('/')) return true;
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
  // UNC 路径：\\server\share 或（经 normalizePath 后）//server/share
  if (/^(\\\\|\/\/)[^\\/]+[\\/]/.test(p)) return true;
  return false;
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
    // 后端返回的 r.path 可能是相对路径（fd）或绝对路径（Node.js 原生搜索）
    const fullPath = normalizePath(isAbsolutePath(r.path) ? r.path : `${dirPath}/${r.path}`);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    return {
      name: r.name,
      type: r.type || 'file',
      size: r.size,
      mtime: r.mtime,
      fullPath: fullPath,
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
  if (!config) return { success: false, error: t('workspaceMgr.agentNotPairedDetail') };
  try {
    const resp = await fetch(`${config.url}/api/fs/download-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAgentHeaders(config)
      },
      body: JSON.stringify({ path: filePath })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      return { success: false, error: err.error || t('workspaceMgr.downloadFailed') };
    }
    const blob = await resp.blob();
    const name = extractFilename(resp.headers.get('Content-Disposition'), filePath.split(/[\\/]/).pop());
    return { success: true, blob, name, mimeType: resp.headers.get('Content-Type') };
  } catch (err) {
    return { success: false, error: t('workspaceMgr.requestFailed', { message: err.message }) };
  }
}

/**
 * 带进度回调的流式下载（单文件/目录）
 * @param {string} filePath
 * @param {function} onProgress - ({ loaded, total, percent }) => void
 * @param {AbortSignal} [signal] - 取消信号
 */
export async function downloadFileStreamWithProgress(filePath, onProgress, signal) {
  const config = await getAgentConfig();
  if (!config) return { success: false, error: t('workspaceMgr.agentNotPaired') };
  try {
    const resp = await fetch(`${config.url}/api/fs/download-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAgentHeaders(config)
      },
      body: JSON.stringify({ path: filePath }),
      signal
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      return { success: false, error: err.error || t('workspaceMgr.downloadFailed') };
    }

    const contentLength = parseInt(resp.headers.get('Content-Length') || '0', 10);
    const reader = resp.body.getReader();
    // abort 时取消 reader，释放底层连接
    if (signal) {
      signal.addEventListener('abort', () => { try { reader.cancel(); } catch {} });
    }
    const chunks = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (onProgress && contentLength > 0) {
        onProgress({ loaded, total: contentLength, percent: Math.round((loaded / contentLength) * 100) });
      }
    }

    const blob = new Blob(chunks);
    const name = extractFilename(resp.headers.get('Content-Disposition'), filePath.split(/[\\/]/).pop());
    return { success: true, blob, name, mimeType: resp.headers.get('Content-Type') };
  } catch (err) {
    if (err.name === 'AbortError') return { success: false, error: t('workspaceMgr.cancelled'), aborted: true };
    return { success: false, error: t('workspaceMgr.requestFailed', { message: err.message }) };
  }
}

/**
 * 流式批量下载（返回 Blob）
 */
export async function downloadFilesStream(paths) {
  const config = await getAgentConfig();
  if (!config) return { success: false, error: t('workspaceMgr.agentNotPairedDetail') };
  try {
    const resp = await fetch(`${config.url}/api/fs/download-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAgentHeaders(config)
      },
      body: JSON.stringify({ paths })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      return { success: false, error: err.error || t('workspaceMgr.downloadFailed') };
    }
    const blob = await resp.blob();
    const name = extractFilename(resp.headers.get('Content-Disposition'), 'workspace.zip');
    return { success: true, blob, name, mimeType: resp.headers.get('Content-Type') };
  } catch (err) {
    return { success: false, error: t('workspaceMgr.requestFailed', { message: err.message }) };
  }
}

/**
 * 带进度回调的批量下载
 * @param {string[]} paths
 * @param {function} onProgress - ({ loaded, total, percent }) => void
 * @param {AbortSignal} [signal] - 取消信号
 */
export async function downloadFilesStreamWithProgress(paths, onProgress, signal) {
  const config = await getAgentConfig();
  if (!config) return { success: false, error: t('workspaceMgr.agentNotPaired') };
  try {
    const resp = await fetch(`${config.url}/api/fs/download-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAgentHeaders(config)
      },
      body: JSON.stringify({ paths }),
      signal
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      return { success: false, error: err.error || t('workspaceMgr.downloadFailed') };
    }

    const contentLength = parseInt(resp.headers.get('Content-Length') || '0', 10);
    const reader = resp.body.getReader();
    if (signal) {
      signal.addEventListener('abort', () => { try { reader.cancel(); } catch {} });
    }
    const chunks = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (onProgress && contentLength > 0) {
        onProgress({ loaded, total: contentLength, percent: Math.round((loaded / contentLength) * 100) });
      }
    }

    const blob = new Blob(chunks);
    const name = extractFilename(resp.headers.get('Content-Disposition'), 'workspace.zip');
    return { success: true, blob, name, mimeType: resp.headers.get('Content-Type') };
  } catch (err) {
    if (err.name === 'AbortError') return { success: false, error: t('workspaceMgr.cancelled'), aborted: true };
    return { success: false, error: t('workspaceMgr.requestFailed', { message: err.message }) };
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

/**
 * 获取文件详细信息（权限、创建/访问/修改时间、MIME 类型等）
 */
export async function getFileInfo(filePath) {
  return agentRequest('/api/fs/stat', { path: filePath });
}
