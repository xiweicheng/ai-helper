// workdir-scope.js - 会话级工作目录的唯一解析入口（side panel 与 background 共用）
//
// 为什么需要这一层：
//   代理端 config.json 里只有一个全局 workdir，而会话是扩展端 IndexedDB 里的概念。
//   一旦支持「会话绑定目录」，就必须保证**任何**进入模型上下文/请求的目录都按目标会话解析，
//   而不是读某个被就地改写的单例（历史实现是 state.agentPlatform.workdir）。
//
// 语义（与设计文档一致）：
//   - 未绑定会话：跟随代理当前全局默认目录（/api/status/detail 的 defaultWorkdir）。
//   - 已绑定会话：用它自己的目录；其他会话的任何操作都不会改它。
//   - 绑定时记录代理 id（workdirAgentId），换代理后自动回落默认，避免跨机器路径语义错乱。
//
// 执行期冻结（并行会话/排队任务的关键）：
//   任务派发时用 beginSessionRun(sessionId) 冻结本轮目录，任务内所有 agent 请求复用；
//   任务结束 endSessionRun 释放。这样即使会话记录在运行期间被改（用户在本会话内显式切换），
//   正在跑的这一轮也不会中途换目录。
import logger from './logger.js';
import { decodeSecret } from './secret.js';
// 静态引入会话存储：解析目录是热路径（每次工具调用/提示词拼装），
// 动态 import 会让每次解析都多一次模块加载往返
import { getSession } from '../storage/db.js';

// 默认目录缓存 TTL：/api/status/detail 是网络请求，不能每个工具调用都打一次
const DEFAULT_TTL_MS = 5000;

/** @type {{ workdir: string|null, at: number }|null} */
let _defaultCache = null;

/** sessionId -> { workdir, depth } 执行期冻结值（仅 background 上下文会写入） */
const _runState = new Map();

/** 派生会话后缀：plan 子任务与 dispatch 子代理都是主会话的扩展，目录必须跟主会话 */
const DERIVED_SESSION_RE = /(_subtask_[A-Za-z0-9_-]+|_sub_[A-Za-z0-9_-]+)$/;

/**
 * 取派生会话所属的主会话 id（非派生会话原样返回）
 * @param {string|null} sessionId
 * @returns {string|null}
 */
export function getBaseSessionId(sessionId) {
  if (!sessionId) return null;
  const base = String(sessionId).replace(DERIVED_SESSION_RE, '');
  return base || null;
}

/**
 * 取当前活跃代理的连接信息（url + 明文 token）
 * 与 workspace-manager.getAgentConfig 同源：storage 里的 token 是 enc: 混淆的
 * @returns {Promise<{ id: string, url: string, token: string }|null>}
 */
export async function getProxyAgentConfig() {
  try {
    const result = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
    const agents = Array.isArray(result.pairedAgents) ? result.pairedAgents : [];
    if (agents.length === 0) return null;
    const active = agents.find((a) => a.id === result.activeAgentId) || agents[0];
    if (!active || !active.url || !active.token) return null;
    return { id: active.id, url: active.url, token: decodeSecret(active.token) };
  } catch (err) {
    logger.warn('[WorkdirScope] read proxy agent failed:', err?.message || err);
    return null;
  }
}

/** 丢掉默认目录缓存（代理切换 / 全局目录切换 / 主动刷新时调用） */
export function invalidateDefaultWorkdir() {
  _defaultCache = null;
}

/**
 * 代理全局默认工作目录（未绑定会话的兜底）
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<string|null>}
 */
export async function getAgentDefaultWorkdir({ force = false } = {}) {
  if (!force && _defaultCache && Date.now() - _defaultCache.at < DEFAULT_TTL_MS) {
    return _defaultCache.workdir;
  }
  const cfg = await getProxyAgentConfig();
  if (!cfg) return _defaultCache ? _defaultCache.workdir : null;
  try {
    const resp = await fetch(`${cfg.url}/api/status/detail`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    if (!resp.ok) return _defaultCache ? _defaultCache.workdir : null;
    const data = await resp.json();
    // 不带会话头时 workdir === defaultWorkdir；两个都读以兼容旧版代理
    const workdir = data?.defaultWorkdir || data?.workdir || null;
    _defaultCache = { workdir, at: Date.now() };
    return workdir;
  } catch (err) {
    logger.debug('[WorkdirScope] fetch default workdir failed:', err?.message || err);
    return _defaultCache ? _defaultCache.workdir : null;
  }
}

/**
 * 调代理端接口（目录绑定/解绑/默认切换共用）
 * @param {string} pathname
 * @param {{ method?: string, body?: object, sessionId?: string }} [opts]
 * @returns {Promise<object>} 解析后的响应体
 */
async function agentApiFetch(pathname, { method = 'GET', body, sessionId } = {}) {
  const cfg = await getProxyAgentConfig();
  if (!cfg) throw new Error('agent not connected');
  const headers = { Authorization: `Bearer ${cfg.token}` };
  if (body) headers['Content-Type'] = 'application/json';
  // 带 sessionId 时同时给请求头与 body：新旧代理都能取到
  if (sessionId) headers['X-AIH-Session-Id'] = sessionId;
  const resp = await fetch(`${cfg.url}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await resp.json(); } catch { data = null; }
  if (!resp.ok || data?.success === false) {
    throw new Error(data?.error || `HTTP ${resp.status}`);
  }
  return data || {};
}

/** 绑定会话工作目录（只写代理端注册表，不动全局 config / allowedPaths） */
export async function bindSessionWorkdirRemote(sessionId, workdir) {
  const data = await agentApiFetch('/api/config/workdir', {
    method: 'POST',
    sessionId,
    body: { workdir, sessionId },
  });
  return data;
}

/** 解除会话工作目录绑定（恢复跟随代理默认目录） */
export async function unbindSessionWorkdirRemote(sessionId) {
  try {
    const data = await agentApiFetch('/api/config/workdir/unbind', {
      method: 'POST',
      sessionId,
      body: { sessionId },
    });
    return data;
  } catch (err) {
    // 删除会话等场景不关心失败（代理端有剪枝兜底），但不能吞错导致调用方误判成功
    logger.debug('[WorkdirScope] unbind session workdir failed:', err?.message || err);
    return null;
  }
}

/** 切换代理全局默认目录（影响所有未绑定会话；已绑定会话不受影响） */
export async function setAgentDefaultWorkdirRemote(workdir) {
  const data = await agentApiFetch('/api/config/workdir', { method: 'POST', body: { workdir } });
  invalidateDefaultWorkdir();
  if (data?.workdir) _defaultCache = { workdir: data.workdir, at: Date.now() };
  return data;
}

/**
 * 解析某会话的有效工作目录
 * @param {string|null} sessionId
 * @returns {Promise<{ workdir: string, scope: 'session'|'default', agentId: string|null, boundWorkdir: string|null }>}
 */
export async function resolveWorkdirForSession(sessionId) {
  const cfg = await getProxyAgentConfig();
  const agentId = cfg?.id || null;

  let boundWorkdir = null;
  let boundAgentId = null;
  // 子任务/子代理（派生 sessionId）继承主会话的目录绑定：它们不单独建会话记录
  const lookupSessionId = getBaseSessionId(sessionId) || sessionId;
  if (lookupSessionId) {
    try {
      const session = await getSession(lookupSessionId);
      boundWorkdir = session?.workdir || null;
      boundAgentId = session?.workdirAgentId || null;
    } catch (err) {
      logger.warn('[WorkdirScope] read session failed:', err?.message || err);
    }
  }

  // 只有「绑定值存在 + 绑定时代理就是当前代理」才算有效绑定；
  // 换过代理的绑定保留在记录里（切回原代理仍生效），但当前按默认目录执行
  const usable = !!(boundWorkdir && boundAgentId && agentId && boundAgentId === agentId);
  const workdir = usable ? boundWorkdir : (await getAgentDefaultWorkdir()) || '';

  return {
    workdir,
    scope: usable ? 'session' : 'default',
    agentId,
    boundWorkdir,
  };
}

/**
 * 冻结本轮执行目录（任务派发 / ReAct 循环入口调用）
 * 支持嵌套（主子任务共用同一 sessionId）：按引用计数，最外层才真正取值与释放。
 * @param {string|null} sessionId
 * @returns {Promise<string|null>} 冻结后的目录
 */
export async function beginSessionRun(sessionId) {
  if (!sessionId) return null;
  const current = _runState.get(sessionId);
  if (current) {
    current.depth += 1;
    return current.workdir;
  }
  const { workdir } = await resolveWorkdirForSession(sessionId);
  _runState.set(sessionId, { workdir, depth: 1 });
  return workdir;
}

/** 释放本轮冻结（与 beginSessionRun 成对；最外层释放时清除） */
export function endSessionRun(sessionId) {
  if (!sessionId) return;
  const current = _runState.get(sessionId);
  if (!current) return;
  current.depth -= 1;
  if (current.depth <= 0) _runState.delete(sessionId);
}

/**
 * 读取本轮冻结值（未冻结返回 null）
 * 注意：切换会话**不清空**它——执行中的任务不该被面板切换影响。
 */
export function getSessionRunWorkdir(sessionId) {
  if (!sessionId) return null;
  const current = _runState.get(sessionId);
  return current ? current.workdir : null;
}

/**
 * 请求级有效目录：优先本轮冻结值，其次按会话记录解析
 * @param {string|null} sessionId
 * @returns {Promise<string>}
 */
export async function getEffectiveWorkdir(sessionId) {
  const frozen = getSessionRunWorkdir(sessionId);
  if (frozen) return frozen;
  const { workdir } = await resolveWorkdirForSession(sessionId);
  return workdir;
}

/**
 * 构造 agent 请求作用域（会话 + 有效目录），供 local-agent-client 拼请求头
 * @param {string|null} sessionId
 * @returns {Promise<{sessionId: string, workdir: string|null}|null>}
 */
export async function buildAgentScope(sessionId) {
  if (!sessionId) return null;
  const workdir = await getEffectiveWorkdir(sessionId);
  return { sessionId, workdir: workdir || null };
}

/** 供测试/切换代理时清理全部冻结态 */
export function clearAllSessionRuns() {
  _runState.clear();
}

/**
 * 路径规整（不依赖 node:path：service worker / 浏览器同样可用）
 * 统一分隔符、消解 . 与 ..，保留 Windows 盘符
 * @param {string} input
 * @returns {string}
 */
export function normalizeScopePath(input) {
  const raw = String(input || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  const driveMatch = raw.match(/^([A-Za-z]:)(\/|$)/);
  const drive = driveMatch ? driveMatch[1] : '';
  const isAbs = !!drive || raw.startsWith('/');
  const body = drive ? raw.slice(drive.length) : raw;
  const segments = [];
  for (const seg of body.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') segments.pop();
      else if (!isAbs) segments.push('..');
      continue;
    }
    segments.push(seg);
  }
  const joined = segments.join('/');
  if (drive) return drive + '/' + joined;
  if (isAbs) return '/' + joined;
  return joined;
}

/**
 * child 是否落在 root 之内（含相等，大小写不敏感：兼容 Windows / macOS）
 * @param {string} child
 * @param {string} root
 * @returns {boolean}
 */
export function isPathInsideScope(child, root) {
  const c = normalizeScopePath(child).toLowerCase();
  const r = normalizeScopePath(root).toLowerCase();
  if (!c || !r) return false;
  if (c === r) return true;
  return c.startsWith(r.endsWith('/') ? r : r + '/');
}

/**
 * 将模型给出的 cwd 收敛到会话冻结目录内
 * - 缺省：直接用冻结目录
 * - 相对路径：拼到冻结目录下
 * - 绝对路径：在冻结目录内保留，越界丢弃并标记 dropped（防提示注入 / 陈旧跨会话路径）
 * @param {string|null|undefined} cwd
 * @param {string} root 会话冻结目录
 * @returns {{ cwd: string, dropped: boolean, original: string }}
 */
export function resolveScopeCwd(cwd, root) {
  const rootDir = normalizeScopePath(root);
  const original = typeof cwd === 'string' ? cwd.trim() : '';
  if (!rootDir) return { cwd: original, dropped: false, original };
  if (!original) return { cwd: rootDir, dropped: false, original };

  const looksAbsolute = /^[A-Za-z]:[\\/]/.test(original) || original.startsWith('/');
  if (!looksAbsolute) {
    return { cwd: normalizeScopePath(`${rootDir}/${original}`), dropped: false, original };
  }
  if (isPathInsideScope(original, rootDir)) {
    return { cwd: normalizeScopePath(original), dropped: false, original };
  }
  return { cwd: rootDir, dropped: true, original };
}

/**
 * 目录名展示：取末级目录名（根路径回落完整路径）
 * @param {string} fullPath
 * @param {{ homeDir?: string }} [opts]
 * @returns {string}
 */
export function formatWorkdirLabel(fullPath, { homeDir = '' } = {}) {
  const raw = String(fullPath || '').trim();
  if (!raw) return '';

  let display = raw.replace(/[/\\]+$/, '');
  // 根路径（/、C:\、C:）没有末级名，直接显示原值，避免变成空串
  if (!display) return raw;

  if (homeDir) {
    const home = String(homeDir).replace(/[/\\]+$/, '');
    if (home && (display === home || display.startsWith(home + '/') || display.startsWith(home + '\\'))) {
      display = '~' + display.slice(home.length);
      const segsHome = display.split(/[/\\]/).filter(Boolean);
      return segsHome[segsHome.length - 1] || display;
    }
  }

  const segs = display.split(/[/\\]/).filter(Boolean);
  const last = segs[segs.length - 1];
  return last || display;
}
