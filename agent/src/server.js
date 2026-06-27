// agent/src/server.js - HTTP Router + WebSocket 服务器
import http from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, rmdirSync, existsSync } from 'fs';
import { join } from 'path';
import { loadConfig } from './config.js';
import { verifyToken, getCurrentPairCode, startPairCodeRotation, stopPairCodeRotation, handlePairRequest } from './auth.js';
import { checkPath, checkCommand } from './security.js';
import { executeCommand, addWsClient, killProcess, getRunningProcesses } from './executor.js';

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
 * 解析请求 body
 */
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

/**
 * 创建并启动服务器
 */
export function startServer() {
  const config = loadConfig();
  const { port, host } = config;

  // ==================== HTTP Server ====================
  const server = http.createServer(async (req, res) => {
    // CORS 预检
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      });
      return res.end();
    }

    const url = new URL(req.url, `http://${host}:${port}`);
    const pathname = url.pathname;

    // ---------- 无需认证的接口 ----------

    // 配对
    if (req.method === 'POST' && pathname === '/api/pair') {
      const body = await parseBody(req);
      const result = handlePairRequest(body.code, body.extensionId);
      return jsonResponse(res, result.success ? 200 : 400, result);
    }

    // 健康检查
    if (req.method === 'GET' && pathname === '/api/status') {
      return jsonResponse(res, 200, {
        success: true,
        version: '1.0.0',
        pairCode: getCurrentPairCode(),
        workdir: config.workdir,
        runningProcesses: getRunningProcesses()
      });
    }

    // ---------- 需要认证的接口 ----------
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse(res, 401, { success: false, error: '未提供认证 token' });
    }
    const token = authHeader.slice(7);
    const extId = verifyToken(token);
    if (!extId) {
      return jsonResponse(res, 403, { success: false, error: '认证 token 无效' });
    }

    const maxSize = config.fileMaxSize;

    // === 文件操作 ===
    if (req.method === 'POST') {
      const body = await parseBody(req);

      // 读取文件
      if (pathname === '/api/fs/read') {
        const check = checkPath(body.path);
        if (!check.allowed) return jsonResponse(res, 403, { success: false, error: check.reason });
        if (!existsSync(check.resolved)) return jsonResponse(res, 404, { success: false, error: '文件不存在' });
        const stat = statSync(check.resolved);
        if (stat.isDirectory()) return jsonResponse(res, 400, { success: false, error: '路径是目录' });
        if (stat.size > maxSize) return jsonResponse(res, 400, { success: false, error: `文件过大 (${stat.size} > ${maxSize})` });
        const content = readFileSync(check.resolved, 'utf-8');
        return jsonResponse(res, 200, { success: true, content, size: stat.size, path: check.resolved });
      }

      // 写入文件
      if (pathname === '/api/fs/write') {
        const check = checkPath(body.path);
        if (!check.allowed) return jsonResponse(res, 403, { success: false, error: check.reason });
        const buf = Buffer.from(body.content || '', 'utf-8');
        if (buf.length > maxSize) return jsonResponse(res, 400, { success: false, error: `内容过大 (${buf.length} > ${maxSize})` });
        writeFileSync(check.resolved, body.content || '', 'utf-8');
        return jsonResponse(res, 200, { success: true, size: buf.length, path: check.resolved });
      }

      // 列出目录
      if (pathname === '/api/fs/list') {
        const check = checkPath(body.path || '.');
        if (!check.allowed) return jsonResponse(res, 403, { success: false, error: check.reason });
        if (!existsSync(check.resolved)) return jsonResponse(res, 404, { success: false, error: '目录不存在' });
        const stat = statSync(check.resolved);
        if (!stat.isDirectory()) return jsonResponse(res, 400, { success: false, error: '路径不是目录' });
        const entries = readdirSync(check.resolved).map(name => {
          const fullPath = join(check.resolved, name);
          try {
            const s = statSync(fullPath);
            return { name, type: s.isDirectory() ? 'directory' : 'file', size: s.size };
          } catch { return { name, type: 'unknown', size: 0 }; }
        });
        return jsonResponse(res, 200, { success: true, entries, path: check.resolved });
      }

      // 删除文件/目录
      if (pathname === '/api/fs/delete') {
        const check = checkPath(body.path);
        if (!check.allowed) return jsonResponse(res, 403, { success: false, error: check.reason });
        if (!existsSync(check.resolved)) return jsonResponse(res, 404, { success: false, error: '文件/目录不存在' });
        const stat = statSync(check.resolved);
        if (stat.isDirectory()) {
          rmdirSync(check.resolved, { recursive: true });
        } else {
          unlinkSync(check.resolved);
        }
        return jsonResponse(res, 200, { success: true, path: check.resolved });
      }

      // === 命令执行 ===

      // 发起命令执行
      if (pathname === '/api/exec') {
        const { command, cwd } = body;
        if (!command) return jsonResponse(res, 400, { success: false, error: '缺少 command 参数' });
        const cmdCheck = checkCommand(command);
        if (cmdCheck.level === 'deny') {
          return jsonResponse(res, 403, { success: false, error: cmdCheck.reason, level: 'deny' });
        }
        if (cmdCheck.level === 'confirm') {
          return jsonResponse(res, 200, { success: true, level: 'confirm', reason: cmdCheck.reason, command, cwd });
        }
        const execId = executeCommand(command, cwd, null, null);
        return jsonResponse(res, 200, { success: true, level: 'allow', execId, wsUrl: `ws://${host}:${port}/ws/exec/${execId}?token=${token}` });
      }

      // 确认执行（灰名单命令）
      if (pathname === '/api/exec/confirm') {
        const { command, cwd } = body;
        if (!command) return jsonResponse(res, 400, { success: false, error: '缺少 command 参数' });
        const execId = executeCommand(command, cwd, null, null);
        return jsonResponse(res, 200, { success: true, execId, wsUrl: `ws://${host}:${port}/ws/exec/${execId}?token=${token}` });
      }

      // 停止命令
      if (pathname === '/api/exec/stop') {
        const stopped = killProcess(body.execId);
        return jsonResponse(res, 200, { success: stopped, execId: body.execId });
      }
    }

    // 运行中进程列表
    if (req.method === 'GET' && pathname === '/api/exec/running') {
      return jsonResponse(res, 200, { success: true, processes: getRunningProcesses() });
    }

    // 404
    jsonResponse(res, 404, { success: false, error: '未知的 API 路径' });
  });

  // ==================== WebSocket Server ====================
  const wss = new WebSocketServer({ noServer: true });

  // 在 HTTP upgrade 时处理 WS 连接
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${host}:${port}`);
    const pathParts = url.pathname.split('/');
    // /ws/exec/<execId>
    if (pathParts[1] === 'ws' && pathParts[2] === 'exec') {
      const execId = pathParts[3];

      // Token 验证
      const authHeader = request.headers.authorization;
      let token = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      } else {
        token = url.searchParams.get('token');
      }
      if (!verifyToken(token)) {
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
  server.listen(port, host, () => {
    console.log(`[Agent] HTTP 服务已启动: http://${host}:${port}`);
    console.log(`[Agent] WebSocket 服务已启动: ws://${host}:${port}`);
    startPairCodeRotation();
  });

  // 优雅关闭
  function shutdown() {
    console.log('[Agent] 正在关闭...');
    stopPairCodeRotation();
    for (const entry of getRunningProcesses()) {
      killProcess(entry.execId);
    }
    wss.close();
    server.close();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, wss, shutdown };
}
