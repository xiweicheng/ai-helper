// agent/src/server.js - HTTP Router + WebSocket 服务器
import http from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, rmdirSync, existsSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import os from 'os';
import { loadConfig } from './config.js';
import { verifyToken, getCurrentPairCode, startPairCodeRotation, stopPairCodeRotation, handlePairRequest } from './auth.js';
import { checkPath, checkCommand } from './security.js';
import { executeCommand, executeCommandSync, addWsClient, killProcess, getRunningProcesses } from './executor.js';
import { setConsoleOutput, logAuth, logFs, logExec, logSecurity, logSystem, logError, queryLogs, getLogDates } from './logger.js';
import { initSearchTools, getSearchToolsAvailable, searchFiles, searchContent } from './search.js';
import {
  initializeMcpRegistry,
  shutdownMcpRegistry,
  getMcpServersStatus,
  getMcpTools,
  callMcpTool,
  connectMcpServer,
  disconnectMcpServer,
  loadMcpConfig,
  addMcpServer,
  removeMcpServer,
  toggleMcpServer
} from './mcp/registry.js';
import {
  initializeSkillRegistry,
  getSkillList,
  getSkill,
  runSkill,
  importSkill,
  removeSkill,
  reloadSkills
} from './skill/registry.js';
import { getSkillExecutionStatus } from './skill/executor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_VERSION = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version;

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_SEARCH_RESULTS = 5000;         // 单次搜索最大结果数
const MAX_LOG_QUERY_LIMIT = 1000;        // 日志查询最大条数
const PID_FILE = join(homedir(), '.ai-helper-agent', 'agent.pid');
const DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 文件默认大小限制

// 平台信息（启动时检测一次）
const PLATFORM_INFO = {
  platform: os.platform(),
  platformName: (() => {
    const map = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' };
    return map[os.platform()] || os.platform();
  })(),
  arch: os.arch(),
  hostname: os.hostname(),
  shell: process.env.SHELL || process.env.COMSPEC || '/bin/sh',
  homeDir: os.homedir(),
  nodeVersion: process.version
};

/**
 * JSON 响应辅助
 */
function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

/**
 * 解析请求 body（带大小限制）
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > MAX_BODY_SIZE) {
      reject(new Error('请求体过大'));
      return;
    }

    const chunks = [];
    let totalSize = 0;

    req.on('data', (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });

    req.on('error', () => reject(new Error('读取请求失败')));
  });
}

/**
 * 创建并启动服务器
 */
export function startServer() {
  const config = loadConfig();
  const { port, host } = config;

  // 开启终端日志输出
  setConsoleOutput(true);

  logSystem('server_start', { port, host, workdir: config.workdir, ...PLATFORM_INFO });

  // 异步初始化搜索工具检测
  let searchTools = { fd: false, rg: false };
  initSearchTools().then(result => { searchTools = result; });

  // 防止 shutdown 并发执行
  let shuttingDown = false;

  // ==================== HTTP Server ====================
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error('[Agent] 请求处理异常:', err);
      try { jsonResponse(res, 500, { success: false, error: '服务器内部错误' }); } catch {}
    });
  });

  async function handleRequest(req, res) {
    // CORS 预检
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      });
      return res.end();
    }

    let url;
    try {
      url = new URL(req.url, `http://${host}:${port}`);
    } catch {
      return jsonResponse(res, 400, { success: false, error: '请求 URL 格式无效' });
    }
    const pathname = url.pathname;

    // ---------- 无需认证的接口 ----------

    // 配对
    if (req.method === 'POST' && pathname === '/api/pair') {
      let body;
      try { body = await parseBody(req); }
      catch (err) { return jsonResponse(res, 400, { success: false, error: err.message }); }
      const result = await handlePairRequest(body.code, body.extensionId);
      if (result.success) {
        logAuth('pair_success', { extensionId: body.extensionId });
      } else {
        logAuth('pair_failed', { extensionId: body.extensionId, reason: result.error });
      }
      return jsonResponse(res, result.success ? 200 : 400, result);
    }

    // 健康检查 + 平台信息
    if (req.method === 'GET' && pathname === '/api/status') {
      return jsonResponse(res, 200, {
        success: true,
        version: AGENT_VERSION,
        running: true,
        ...PLATFORM_INFO,
        searchTools: getSearchToolsAvailable()
      });
    }

    // Agent 关闭（无需认证，仅限本地访问）
    if (req.method === 'POST' && pathname === '/api/shutdown') {
      logSystem('shutdown', { reason: 'api_request' });
      jsonResponse(res, 200, { success: true, message: 'Agent 正在关闭...' });
      shutdown();
      return;
    }

    // ---------- 需要认证的接口 ----------
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logSecurity('auth_missing', { path: pathname });
      return jsonResponse(res, 401, { success: false, error: '未提供认证 token' });
    }
    const token = authHeader.slice(7);
    const extId = verifyToken(token);
    if (!extId) {
      logSecurity('auth_invalid', { path: pathname });
      return jsonResponse(res, 403, { success: false, error: '认证 token 无效' });
    }

    const maxSize = config.fileMaxSize || DEFAULT_MAX_SIZE;

    // 认证后的状态信息
    if (req.method === 'GET' && pathname === '/api/status/detail') {
      return jsonResponse(res, 200, {
        success: true,
        version: AGENT_VERSION,
        pairCode: getCurrentPairCode(),
        pairCodeTTL: config.pairCodeTTL,
        workdir: config.workdir,
        allowedPaths: config.allowedPaths,
        commandTimeout: config.commandTimeout,
        fileMaxSize: config.fileMaxSize,
        runningProcesses: getRunningProcesses(),
        ...PLATFORM_INFO,
        searchTools: getSearchToolsAvailable()
      });
    }

    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      let body;
      try { body = await parseBody(req); }
      catch (err) { return jsonResponse(res, 400, { success: false, error: err.message }); }

      // === 文件操作 ===

      // 搜索文件（按文件名模式）
      if (pathname === '/api/fs/search_files') {
        const maxResults = Math.min(body.maxResults || 200, MAX_SEARCH_RESULTS);
        try {
          const result = await searchFiles(
            body.path || '.',
            body.pattern || '*',
            body.recursive !== false,
            maxResults
          );
          if (result.success) {
            logFs('search_files', { path: result.path, pattern: body.pattern, total: result.total, engine: result.engine });
          } else {
            logSecurity('fs_search_files_blocked', { path: body.path, reason: result.error });
          }
          return jsonResponse(res, result.success ? 200 : 403, result);
        } catch (err) {
          logError('fs', 'search_files_error', { path: body.path, error: err.message });
          return jsonResponse(res, 500, { success: false, error: `文件搜索异常: ${err.message}` });
        }
      }

      // 搜索文件内容
      if (pathname === '/api/fs/search_content') {
        const maxResults = Math.min(body.maxResults || 100, MAX_SEARCH_RESULTS);
        try {
          const result = await searchContent(
            body.path || '.',
            body.pattern,
            body.filePattern || null,
            body.caseSensitive || false,
            maxResults,
            body.contextLines !== undefined ? body.contextLines : 2
          );
          if (result.success) {
            logFs('search_content', { path: result.path, pattern: body.pattern, total: result.total, engine: result.engine });
          } else {
            logSecurity('fs_search_content_blocked', { path: body.path, reason: result.error });
          }
          return jsonResponse(res, result.success ? 200 : 403, result);
        } catch (err) {
          logError('fs', 'search_content_error', { path: body.path, error: err.message });
          return jsonResponse(res, 500, { success: false, error: `内容搜索异常: ${err.message}` });
        }
      }

      // 读取文件
      if (pathname === '/api/fs/read') {
        const check = checkPath(body.path);
        if (!check.allowed) {
          logSecurity('fs_read_blocked', { path: body.path, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        if (!existsSync(check.resolved)) return jsonResponse(res, 404, { success: false, error: '文件不存在' });
        const fstat = statSync(check.resolved);
        if (fstat.isDirectory()) return jsonResponse(res, 400, { success: false, error: '路径是目录' });
        if (fstat.size > maxSize) return jsonResponse(res, 400, { success: false, error: `文件过大 (${fstat.size} > ${maxSize})` });
        const content = readFileSync(check.resolved, 'utf-8');
        logFs('read', { path: check.resolved, size: fstat.size });
        return jsonResponse(res, 200, { success: true, content, size: fstat.size, path: check.resolved });
      }

      // 写入文件
      if (pathname === '/api/fs/write') {
        const check = checkPath(body.path);
        if (!check.allowed) {
          logSecurity('fs_write_blocked', { path: body.path, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        const rawContent = 'content' in body ? String(body.content) : '';
        const buf = Buffer.from(rawContent, 'utf-8');
        if (buf.length > maxSize) return jsonResponse(res, 400, { success: false, error: `内容过大 (${buf.length} > ${maxSize})` });
        writeFileSync(check.resolved, rawContent, 'utf-8');

        // 如果写入的是脚本文件，剥离执行权限防止直接运行
        const SCRIPT_EXT_RE = /\.(sh|bash|zsh|py|js|mjs|rb|pl|php|lua)$/i;
        const isScriptExt = SCRIPT_EXT_RE.test(check.resolved);
        const hasShebang = rawContent.startsWith('#!');
        if (isScriptExt || hasShebang) {
          try {
            chmodSync(check.resolved, 0o644);
          } catch {}
        }

        logFs('write', { path: check.resolved, size: buf.length });
        return jsonResponse(res, 200, { success: true, size: buf.length, path: check.resolved });
      }

      // 列出目录
      if (pathname === '/api/fs/list') {
        const dirPath = body.path || '.';
        const check = checkPath(dirPath);
        if (!check.allowed) {
          logSecurity('fs_list_blocked', { path: dirPath, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        if (!existsSync(check.resolved)) return jsonResponse(res, 404, { success: false, error: '目录不存在' });
        const dstat = statSync(check.resolved);
        if (!dstat.isDirectory()) return jsonResponse(res, 400, { success: false, error: '路径不是目录' });
        const entries = readdirSync(check.resolved).map(name => {
          const fullPath = join(check.resolved, name);
          try {
            const s = statSync(fullPath);
            return { name, type: s.isDirectory() ? 'directory' : 'file', size: s.size, mtime: s.mtimeMs };
          } catch { return { name, type: 'unknown', size: 0, mtime: 0 }; }
        });
        logFs('list', { path: check.resolved, entryCount: entries.length });
        return jsonResponse(res, 200, { success: true, entries, path: check.resolved });
      }

      // 删除文件/目录
      if (pathname === '/api/fs/delete') {
        const check = checkPath(body.path);
        if (!check.allowed) {
          logSecurity('fs_delete_blocked', { path: body.path, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        if (!existsSync(check.resolved)) return jsonResponse(res, 404, { success: false, error: '文件/目录不存在' });
        const fstat2 = statSync(check.resolved);
        const isDir = fstat2.isDirectory();
        if (isDir) {
          rmdirSync(check.resolved, { recursive: true });
        } else {
          unlinkSync(check.resolved);
        }
        logFs('delete', { path: check.resolved, type: isDir ? 'directory' : 'file', size: fstat2.size });
        return jsonResponse(res, 200, { success: true, path: check.resolved });
      }

      // === 命令执行 ===

      if (pathname === '/api/exec') {
        const { command, cwd, wait, force } = body;
        if (!command || typeof command !== 'string') return jsonResponse(res, 400, { success: false, error: '缺少 command 参数（必须是字符串）' });

        // 校验 cwd
        let resolvedCwd = cwd || config.workdir;
        const cwdCheck = checkPath(resolvedCwd);
        if (!cwdCheck.allowed) {
          logSecurity('exec_cwd_blocked', { command, cwd: resolvedCwd, reason: cwdCheck.reason });
          return jsonResponse(res, 403, { success: false, error: '执行目录校验失败: ' + cwdCheck.reason });
        }

        // 安全检查
        const cmdCheck = checkCommand(command, !!force);
        if (cmdCheck.level === 'deny') {
          logSecurity('exec_denied', { command, reason: cmdCheck.reason });
          return jsonResponse(res, 403, { success: false, error: cmdCheck.reason, level: 'deny' });
        }
        if (cmdCheck.level === 'confirm') {
          logSecurity('exec_confirm_required', { command, reason: cmdCheck.reason });
          return jsonResponse(res, 200, { success: true, level: 'confirm', reason: cmdCheck.reason, command, cwd });
        }

        // 同步等待模式
        if (wait) {
          try {
            const result = await executeCommandSync(command, resolvedCwd);
            logExec('completed', {
              command,
              cwd: resolvedCwd,
              execId: result.execId,
              exitCode: result.exitCode,
              killed: result.killed,
              stdoutLen: (result.stdout || '').length,
              stderrLen: (result.stderr || '').length
            });
            return jsonResponse(res, 200, {
              success: true,
              level: 'allow',
              execId: result.execId,
              exitCode: result.exitCode,
              stdout: result.stdout || '',
              stderr: result.stderr || '',
              killed: result.killed,
              error: result.error
            });
          } catch (err) {
            logError('exec', 'error', { command, error: err.message });
            return jsonResponse(res, 500, { success: false, error: `命令执行异常: ${err.message}` });
          }
        }

        // 异步模式
        const execId = executeCommand(command, resolvedCwd, null, (result) => {
          logExec('completed', {
            command,
            cwd: resolvedCwd,
            execId: result.execId,
            exitCode: result.exitCode,
            killed: result.killed
          });
        });
        logExec('started', { command, cwd: resolvedCwd, execId });
        return jsonResponse(res, 200, {
          success: true,
          level: 'allow',
          execId,
          wsUrl: `ws://${host}:${port}/ws/exec/${execId}`
        });
      }

      // 停止命令
      if (pathname === '/api/exec/stop') {
        const stopped = killProcess(body.execId);
        logExec('stopped', { execId: body.execId, success: stopped });
        return jsonResponse(res, 200, { success: stopped, execId: body.execId });
      }

      // === Skill 操作（需要 body） ===

      // 执行 Skill
      if (pathname === '/api/skill/run') {
        if (!body.name) return jsonResponse(res, 400, { success: false, error: '缺少 name 参数' });
        const result = await runSkill(body.name, body.params || {});
        logSystem('skill_run', { skillName: body.name, success: result.success });
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // 导入 Skill
      if (pathname === '/api/skill/import') {
        if (!body.name || !body.steps) {
          return jsonResponse(res, 400, { success: false, error: '缺少必要参数: name, steps' });
        }
        const result = await importSkill(body);
        logSystem('skill_import', { skillName: body.name });
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // 删除 Skill
      if (pathname === '/api/skill/delete') {
        if (!body.name) return jsonResponse(res, 400, { success: false, error: '缺少 name 参数' });
        const result = await removeSkill(body.name);
        logSystem('skill_remove', { skillName: body.name });
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // 重新加载 Skill
      if (pathname === '/api/skill/reload') {
        const count = await reloadSkills();
        logSystem('skill_reload', { count });
        return jsonResponse(res, 200, { success: true, count });
      }

      // === MCP 操作（需要 body） ===

      // 添加 MCP 服务器
      if (pathname === '/api/mcp/servers' && req.method === 'POST') {
        if (!body.id || !body.command) {
          return jsonResponse(res, 400, { success: false, error: '缺少必要参数: id, command' });
        }
        const result = await addMcpServer(body);
        logSystem('mcp_server_add', { serverId: body.id });
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // 删除 MCP 服务器
      if (pathname === '/api/mcp/servers' && req.method === 'DELETE') {
        if (!body.id) return jsonResponse(res, 400, { success: false, error: '缺少 id 参数' });
        const result = await removeMcpServer(body.id);
        logSystem('mcp_server_remove', { serverId: body.id });
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // MCP 连接
      if (pathname === '/api/mcp/servers/connect') {
        if (!body.id) return jsonResponse(res, 400, { success: false, error: '缺少 id 参数' });
        const result = await connectMcpServer(body.id);
        logSystem('mcp_server_connect', { serverId: body.id, success: result.success });
        return jsonResponse(res, result.success ? 200 : 500, result);
      }

      // MCP 断开
      if (pathname === '/api/mcp/servers/disconnect') {
        if (!body.id) return jsonResponse(res, 400, { success: false, error: '缺少 id 参数' });
        const result = await disconnectMcpServer(body.id);
        logSystem('mcp_server_disconnect', { serverId: body.id });
        return jsonResponse(res, 200, result);
      }

      // MCP 启用/禁用切换
      if (pathname === '/api/mcp/servers/toggle') {
        if (body.id === undefined || body.enabled === undefined) {
          return jsonResponse(res, 400, { success: false, error: '缺少参数: id, enabled' });
        }
        const result = await toggleMcpServer(body.id, body.enabled);
        logSystem('mcp_server_toggle', { serverId: body.id, enabled: body.enabled });
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // MCP 工具调用
      if (pathname === '/api/mcp/call') {
        if (!body.serverId || !body.toolName) {
          return jsonResponse(res, 400, { success: false, error: '缺少参数: serverId, toolName' });
        }
        const result = await callMcpTool(body.serverId, body.toolName, body.args || {});
        logSystem('mcp_tool_call', { serverId: body.serverId, toolName: body.toolName, success: result.success });
        return jsonResponse(res, result.success ? 200 : 500, result);
      }
    }

    // 运行中进程列表（需认证）
    if (req.method === 'GET' && pathname === '/api/exec/running') {
      return jsonResponse(res, 200, { success: true, processes: getRunningProcesses() });
    }

    // 日志查询（需认证）
    if (req.method === 'GET' && pathname === '/api/logs') {
      const date = url.searchParams.get('date') || undefined;
      const category = url.searchParams.get('category') || undefined;
      const rawLimit = parseInt(url.searchParams.get('limit') || '200', 10);
      const limit = Math.min(isNaN(rawLimit) ? 200 : rawLimit, MAX_LOG_QUERY_LIMIT);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const result = queryLogs({ date, category, limit, offset });
      return jsonResponse(res, 200, { success: true, ...result });
    }

    // 日志日期列表（需认证）
    if (req.method === 'GET' && pathname === '/api/logs/dates') {
      return jsonResponse(res, 200, { success: true, dates: getLogDates() });
    }

    // ========== Skill 管理接口（仅 GET 路由） ==========

    // Skill 列表
    if (req.method === 'GET' && pathname === '/api/skill/list') {
      return jsonResponse(res, 200, getSkillList());
    }

    // Skill 详情
    if (req.method === 'GET' && pathname === '/api/skill/detail') {
      const name = url.searchParams.get('name');
      if (!name) return jsonResponse(res, 400, { success: false, error: '缺少 name 参数' });
      return jsonResponse(res, 200, getSkill(name));
    }

    // Skill 执行状态查询
    if (req.method === 'GET' && pathname === '/api/skill/status') {
      const execId = url.searchParams.get('execId');
      if (!execId) return jsonResponse(res, 400, { success: false, error: '缺少 execId 参数' });
      return jsonResponse(res, 200, getSkillExecutionStatus(execId));
    }

    // ========== MCP 管理接口（仅 GET 路由） ==========

    // MCP Servers 列表
    if (req.method === 'GET' && pathname === '/api/mcp/servers') {
      return jsonResponse(res, 200, getMcpServersStatus());
    }

    // MCP 工具列表
    if (req.method === 'GET' && pathname === '/api/mcp/tools') {
      const serverId = url.searchParams.get('serverId') || undefined;
      return jsonResponse(res, 200, getMcpTools(serverId));
    }

    // 404
    jsonResponse(res, 404, { success: false, error: '未知的 API 路径' });
  }

  // ==================== WebSocket Server ====================
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, `http://${host}:${port}`);
    } catch {
      socket.destroy();
      return;
    }
    const pathParts = url.pathname.split('/');

    if (pathParts[1] === 'ws' && pathParts[2] === 'exec') {
      const execId = pathParts[3];

      const authHeader = request.headers.authorization;
      let token = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      } else {
        token = url.searchParams.get('token');
      }
      if (!verifyToken(token)) {
        logSecurity('ws_auth_invalid', { execId });
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        const added = addWsClient(execId, ws);
        if (!added) {
          ws.send(JSON.stringify({ type: 'error', error: '进程不存在或已结束', execId }));
        }
      });
    } else {
      socket.destroy();
    }
  });

  // 启动服务器
  server.on('error', (err) => {
    console.error('[Agent] 服务器错误:', err.message);
    logError('system', 'server_error', { message: err.message, code: err.code });
    if (err.code === 'EADDRINUSE') {
      console.error('[Agent] 端口已被占用，请检查是否已有 Agent 在运行');
      process.exit(1);
    }
  });

  server.listen(port, host, async () => {
    console.log(`[Agent] HTTP 服务已启动: http://${host}:${port}`);
    console.log(`[Agent] WebSocket 服务已启动: ws://${host}:${port}`);
    startPairCodeRotation();

    // 初始化 MCP 注册表（异步，不阻塞请求）
    try {
      await initializeMcpRegistry();
    } catch (err) {
      console.error('[Agent] MCP 注册表初始化失败:', err.message);
    }

    // 初始化 Skill 注册表
    try {
      const skillCount = initializeSkillRegistry();
      console.log(`[Agent] Skill 注册表已初始化: ${skillCount} 个 Skill`);
    } catch (err) {
      console.error('[Agent] Skill 注册表初始化失败:', err.message);
    }
  });

  // 优雅关闭（异步 + 防并发）
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('[Agent] 正在关闭...');
    stopPairCodeRotation();

    // 终止所有运行中的进程
    for (const entry of getRunningProcesses()) {
      killProcess(entry.execId);
    }

    // 关闭所有 MCP 连接
    try { shutdownMcpRegistry(); } catch {}

    // 等待 server 和 wss 关闭
    await Promise.all([
      new Promise(resolve => server.close(resolve)),
      new Promise(resolve => wss.close(resolve))
    ]);

    // 清理 PID 文件
    try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE); } catch {}

    logSystem('server_stop', { reason: 'shutdown' });
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 全局崩溃防护：捕获未处理的异常，记录日志但不退出进程
  if (process.listenerCount('uncaughtException') === 0) {
    process.on('uncaughtException', (err) => {
      console.error('[Agent] 未捕获异常:', err);
      logError('system', 'uncaught_exception', { message: err.message, stack: err.stack });
    });
  }

  if (process.listenerCount('unhandledRejection') === 0) {
    process.on('unhandledRejection', (reason) => {
      console.error('[Agent] 未处理的 Promise 拒绝:', reason);
      logError('system', 'unhandled_rejection', { message: reason?.message || String(reason), stack: reason?.stack });
    });
  }

  return { server, wss, shutdown };
}
