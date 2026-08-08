// agent/src/server.js - HTTP Router + WebSocket 服务器
import http from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync, createWriteStream, createReadStream, statSync, existsSync, watch } from 'fs';
import { readFile, writeFile, readdir, stat, unlink, rmdir, chmod, mkdir, rename } from 'fs/promises';
import { join, dirname, basename, resolve, isAbsolute, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { ZipArchive } from 'archiver';
import { homedir, tmpdir } from 'os';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import os from 'os';
import { loadConfig, saveConfig, setConfigLang } from './config.js';
import { verifyToken, startPairCodeRotation, stopPairCodeRotation, handlePairRequest, setAuthLang } from './auth.js';
import { checkPath, checkCommand, normalizePathFormat, setSecurityLang } from './security.js';
import { moveToTrash, restoreFromTrash, listTrash, startPeriodicCleanup, stopPeriodicCleanup, setTrashLang } from './trash.js';
import { executeCommand, executeCommandSync, addWsClient, disconnectWsClient, killProcess, getRunningProcesses, setExecutorLang } from './executor.js';
import { setConsoleOutput, setLoggerLocale, logAuth, logFs, logExec, logSecurity, logSystem, logError, queryLogs, getLogDates } from './logger.js';
import { initSearchTools, getSearchToolsAvailable, searchFiles, searchContent, setSearchLang } from './search.js';
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
  toggleMcpServer,
  setMcpRegistryLang
} from './mcp/registry.js';
import {
  initializeSkillRegistry,
  getSkillList,
  getSkill,
  toggleSkill,
  runSkill,
  importSkill,
  removeSkill,
  reloadSkills,
  getAgentSkillPrompts,
  getAgentSkillPrompt,
  getSkillsDir,
  setSkillRegistryLang
} from './skill/registry.js';
import { saveMarkdownSkill, importMarkdownSkillFromZip, importMarkdownSkillFromUrl, setSkillLoaderLang } from './skill/loader.js';
import { setSkillExecutorLang } from './skill/executor.js';
import { setMarkdownLoaderLang } from './skill/markdown-loader.js';
import { setMcpClientLang } from './mcp/client.js';
import { getRequestI18n, t, parseAcceptLanguage } from './i18n.js';

// Server-level i18n helper (uses env/CLI language)
const serverLang = parseAcceptLanguage();
const ln = (key, params) => t(serverLang, `server.${key}`, params);
import XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_VERSION = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version;
const AGENT_START_TIME = Date.now();

/**
 * 计算多个路径的共同父目录（跨平台，正确处理 Windows 盘符）
 * 用 path.dirname + path.relative 替代手工 split('/')，避免破坏盘符（如 /C:/Users）
 * @param {string[]} paths - 绝对路径数组
 * @returns {string} 共同父目录（始终为目录路径）
 */
function computeCommonParent(paths) {
  if (!paths || paths.length === 0) return '';
  let common = dirname(resolve(paths[0]));
  for (let i = 1; i < paths.length; i++) {
    const p = resolve(paths[i]);
    // 逐层上移 common，直到 p 落在 common 之下或 common 已到根
    while (true) {
      const parent = dirname(common);
      if (parent === common) break; // 已到根目录（如 / 或 C:\）
      const rel = relative(common, p);
      // rel 为空表示同路径；不以 '..' 开头且非绝对路径表示 p 在 common 之下
      if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) break;
      common = parent;
    }
  }
  return common;
}

/**
 * 跨平台 ZIP 打包（使用 archiver，替换 spawn zip）
 * @param {string[]} sourceNames - 源文件/目录名（basename）
 * @param {string} cwd - 工作目录（压缩时以此为当前目录）
 * @param {string} outputPath - 输出 ZIP 文件路径
 * @returns {Promise<Buffer>} ZIP 文件 Buffer
 */
async function createZipBuffer(sourceNames, cwd, outputPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks = [];

    output.on('close', () => {
      resolve(Buffer.concat(chunks));
    });
    output.on('error', reject);

    archive.on('error', reject);
    archive.on('data', (chunk) => chunks.push(chunk));

    archive.pipe(output);

    for (const name of sourceNames) {
      const fullPath = join(cwd, name);
      try {
        const s = statSync(fullPath);
        if (s.isDirectory()) {
          archive.directory(fullPath, name);
        } else {
          archive.file(fullPath, { name });
        }
      } catch {
        // 跳过不存在的文件
      }
    }

    archive.finalize();
  });
}

const MAX_BODY_SIZE = 200 * 1024 * 1024; // 200MB（JSON body 解析上限，旧 base64 上传受此限制）
const MAX_SEARCH_RESULTS = 5000;         // 单次搜索最大结果数
const PID_FILE = join(homedir(), '.ai-helper-agent', 'agent.pid');
const DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 文件默认大小限制（read/list 等读取操作）
const MAX_UPLOAD_SIZE = 200 * 1024 * 1024; // 流式上传最大 200MB（与 MAX_BODY_SIZE 一致，流式无 base64 膨胀，实际可传 200MB 原文件）

function detectShell() {
  const platform = os.platform();
  const envShell = process.env.SHELL || process.env.COMSPEC || '';

  if (platform === 'win32') {
    if (envShell.toLowerCase().includes('bash')) {
      return envShell;
    } else if (envShell.toLowerCase().includes('powershell')) {
      return envShell;
    } else if (envShell.toLowerCase().includes('cmd')) {
      return envShell;
    } else {
      const gitBashPaths = [
        'C:\\Program Files\\Git\\bin\\bash.exe',
        'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
        `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Git\\bin\\bash.exe`,
      ];
      for (const path of gitBashPaths) {
        try {
          if (existsSync(path)) {
            return path;
          }
        } catch {}
      }
      return 'cmd.exe';
    }
  }

  if (platform === 'darwin') {
    if (envShell.toLowerCase().includes('zsh')) {
      return envShell;
    } else if (envShell.toLowerCase().includes('bash')) {
      return envShell;
    }
    return '/bin/zsh';
  }

  if (envShell.toLowerCase().includes('bash')) {
    return envShell;
  } else if (envShell.toLowerCase().includes('zsh')) {
    return envShell;
  } else if (envShell.toLowerCase().includes('fish')) {
    return envShell;
  }
  return '/bin/bash';
}

/**
 * 异步检查文件/目录是否存在
 */
async function exists(path) {
  try { await stat(path); return true; }
  catch { return false; }
}

/**
 * 根据文件扩展名返回 MIME 类型
 */
function getMimeType(filePath) {
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  const mimeMap = {
    txt: 'text/plain', md: 'text/markdown', json: 'application/json',
    js: 'application/javascript', mjs: 'application/javascript', ts: 'application/typescript',
    jsx: 'text/jsx', tsx: 'text/tsx',
    html: 'text/html', htm: 'text/html', css: 'text/css', scss: 'text/x-scss', less: 'text/x-less',
    xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml',
    py: 'text/x-python', java: 'text/x-java', c: 'text/x-c', cpp: 'text/x-c++', h: 'text/x-c',
    go: 'text/x-go', rs: 'text/x-rust', rb: 'text/x-ruby', php: 'text/x-php',
    sql: 'text/x-sql', sh: 'text/x-sh', bash: 'text/x-sh', zsh: 'text/x-sh',
    cfg: 'text/plain', ini: 'text/plain', toml: 'text/plain', conf: 'text/plain',
    log: 'text/plain', csv: 'text/csv', tsv: 'text/tab-separated-values',
    env: 'text/plain', vue: 'text/x-vue', svelte: 'text/x-svelte', astro: 'text/x-astro', rtf: 'application/rtf',
    svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon',
    pdf: 'application/pdf',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar',
    mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

const PLATFORM_INFO = {
  platform: os.platform(),
  platformName: (() => {
    const map = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' };
    return map[os.platform()] || os.platform();
  })(),
  arch: os.arch(),
  hostname: os.hostname(),
  shell: detectShell(),
  homeDir: os.homedir(),
  nodeVersion: process.version
};

/**
 * 判断请求来源是否允许跨域读取响应
 * 安全策略：仅放行 Chrome 扩展来源（chrome-extension://<id>）。
 *   - 恶意网页（http/https origin）不返回 ACAO，浏览器阻止其跨域读取（保护无认证端点 /api/status、/api/pair 等）
 *   - 无 Origin 的请求（curl / 本地脚本）：不设 ACAO，非浏览器客户端不受 CORS 限制仍可访问
 *   - 扩展请求：返回其 Origin，扩展 fetch 可正常跨域读取
 */
function getAllowedOrigin(req) {
  const origin = req?.headers?.origin;
  if (typeof origin === 'string' && origin.startsWith('chrome-extension://')) {
    return origin;
  }
  return null;
}

/**
 * JSON 响应辅助
 */
function jsonResponse(res, status, data) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  const allowedOrigin = getAllowedOrigin(res.req);
  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

/**
 * 解析请求 body（带大小限制）
 */
function parseBody(req) {
  const { t } = getRequestI18n(req);
  return new Promise((resolve, reject) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > MAX_BODY_SIZE) {
      reject(new Error(t('error.bodyTooLarge')));
      return;
    }

    const chunks = [];
    let totalSize = 0;

    req.on('data', (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        reject(new Error(t('error.bodyTooLarge')));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      // 空 body 视为 {}（兼容无 body 的 POST 请求，如 /api/skill/reload）
      if (body.trim() === '') { resolve({}); return; }
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error(t('error.invalidJson'))); }
    });

    req.on('error', () => reject(new Error(t('error.readRequestFailed'))));
  });
}

/**
 * 解析 multipart/form-data，提取文件数据
 * @param {http.IncomingMessage} req
 * @returns {Promise<{fileBuffer: Buffer, fileName: string, mimeType: string}>}
 */
function parseMultipartBody(req) {
  const { t } = getRequestI18n(req);
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      reject(new Error(t('error.invalidMultipart')));
      return;
    }
    const boundary = boundaryMatch[1].trim();
    const boundaryBuffer = Buffer.from('--' + boundary);

    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > MAX_BODY_SIZE) {
      reject(new Error(t('error.fileTooLarge')));
      return;
    }

    const chunks = [];
    let totalSize = 0;

    req.on('data', (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        reject(new Error(t('error.fileTooLarge')));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const buffer = Buffer.concat(chunks);

      // 找到文件部分的起始位置
      const startIdx = buffer.indexOf(boundaryBuffer) + boundaryBuffer.length + 2; // +2 for \r\n
      if (startIdx < boundaryBuffer.length + 2) {
        reject(new Error(t('error.malformedMultipart')));
        return;
      }

      // 找 headers 结束位置（\r\n\r\n）
      const headersEnd = buffer.indexOf('\r\n\r\n', startIdx);
      if (headersEnd === -1) {
        reject(new Error(t('error.malformedMultipartHeaders')));
        return;
      }

      // 解析 headers
      const headersStr = buffer.slice(startIdx, headersEnd).toString();
      const dispMatch = headersStr.match(/filename="([^"]*)"/);
      const fileName = dispMatch ? dispMatch[1] : 'file';

      // 找数据结束位置（下一个 boundary）
      const dataStart = headersEnd + 4; // after \r\n\r\n
      const dataEnd = buffer.indexOf(boundaryBuffer, dataStart) - 2; // -2 for \r\n before boundary

      if (dataEnd <= dataStart) {
        reject(new Error(t('error.noFileData')));
        return;
      }

      const fileBuffer = buffer.slice(dataStart, dataEnd);

      resolve({
        fileBuffer,
        fileName,
        mimeType: headersStr.match(/Content-Type:\s*(.+?)\r?\n/i)?.[1]?.trim() || 'application/octet-stream'
      });
    });

    req.on('error', () => reject(new Error(t('error.readFileFailed'))));
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
  // restart/update/shutdown 防重入 + 频率限制
  let agentOperationInProgress = false;
  let lastOperationTime = 0;
  const OPERATION_COOLDOWN_MS = 10000; // 10s 冷却，防 DoS

  // ==================== HTTP Server ====================
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error(`[Agent] ${ln('requestException')}:`, err);
      try {
        const { t } = getRequestI18n(req);
        jsonResponse(res, 500, { success: false, error: t('error.internal') });
      } catch {}
    });
  });

  async function handleRequest(req, res) {
    // 初始化国际化（根据 Accept-Language 头选择语言）
    const { t, lang } = getRequestI18n(req);

    // 将当前请求的语言同步到各子模块（用于模块内部硬编码中文的国际化）
    setConfigLang(lang);
    setAuthLang(lang);
    setSecurityLang(lang);
    setTrashLang(lang);
    setExecutorLang(lang);
    setSearchLang(lang);
    setSkillExecutorLang(lang);
    setSkillLoaderLang(lang);
    setMarkdownLoaderLang(lang);
    setMcpClientLang(lang);

    // CORS 预检（仅放行 Chrome 扩展来源）
    if (req.method === 'OPTIONS') {
      const optHeaders = {
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      };
      const allowedOrigin = getAllowedOrigin(req);
      if (allowedOrigin) {
        optHeaders['Access-Control-Allow-Origin'] = allowedOrigin;
        optHeaders['Vary'] = 'Origin';
      }
      res.writeHead(204, optHeaders);
      return res.end();
    }

    let url;
    try {
      url = new URL(req.url, `http://${host}:${port}`);
    } catch {
      return jsonResponse(res, 400, { success: false, error: t('error.invalidUrl') });
    }
    const pathname = url.pathname;

    // 每次请求重新加载配置（切换 workdir 后立即生效，避免启动快照过期）
    // 遮蔽 startServer 外层的启动快照 config；loadConfig 有 mtime 缓存，无变化时仅一次 statSync
    const config = loadConfig();

    // ---------- 无需认证的接口 ----------

    // 配对
    if (req.method === 'POST' && pathname === '/api/pair') {
      let body;
      try { body = await parseBody(req); }
      catch (err) { return jsonResponse(res, 400, { success: false, error: err.message }); }
      const result = await handlePairRequest(body.code, body.extensionId, t);
      if (result.success) {
        logAuth('pair_success', { extensionId: body.extensionId });
      } else {
        logAuth('pair_failed', { extensionId: body.extensionId, reason: result.error });
      }
      return jsonResponse(res, result.success ? 200 : 400, result);
    }

    // 健康检查 + 平台信息（无认证：仅返回必要的平台标识，不泄露 hostname/homeDir/shell 等宿主敏感信息）
    if (req.method === 'GET' && pathname === '/api/status') {
      return jsonResponse(res, 200, {
        success: true,
        version: AGENT_VERSION,
        running: true,
        platform: PLATFORM_INFO.platform,
        platformName: PLATFORM_INFO.platformName,
        arch: PLATFORM_INFO.arch,
        nodeVersion: PLATFORM_INFO.nodeVersion,
        searchTools: getSearchToolsAvailable()
      });
    }

    // ---------- 需要认证的接口 ----------
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logSecurity('auth_missing', { path: pathname });
      return jsonResponse(res, 401, { success: false, error: t('error.noToken') });
    }
    const token = authHeader.slice(7);
    const extId = verifyToken(token);
    if (!extId) {
      logSecurity('auth_invalid', { path: pathname });
      return jsonResponse(res, 403, { success: false, error: t('error.invalidToken') });
    }

    // 心跳接口（需认证）：仅刷新 lastAuthTime 维持"插件在线"状态，不返回敏感信息
    if (req.method === 'GET' && pathname === '/api/heartbeat') {
      return jsonResponse(res, 200, { success: true, time: Date.now() });
    }

    // Agent 关闭（需认证）
    if (req.method === 'POST' && pathname === '/api/shutdown') {
      if (agentOperationInProgress) {
        return jsonResponse(res, 409, { success: false, error: t('error.operationInProgress') });
      }
      if (Date.now() - lastOperationTime < OPERATION_COOLDOWN_MS) {
        const wait = Math.ceil((OPERATION_COOLDOWN_MS - (Date.now() - lastOperationTime)) / 1000);
        return jsonResponse(res, 429, { success: false, error: t('error.tooFrequent', { wait }) });
      }
      agentOperationInProgress = true;
      lastOperationTime = Date.now();
      logSystem('shutdown', { reason: 'api_request', extId });
      jsonResponse(res, 200, { success: true, message: t('message.shuttingDown') });
      // 延迟 200ms 再关闭，确保响应数据已送达客户端（res.end() 仅写入缓冲区，不保证客户端已接收）
      setTimeout(() => shutdown(), 200);
      return;
    }

    // 重启 Agent（需认证）
    if (req.method === 'POST' && pathname === '/api/agent/restart') {
      if (agentOperationInProgress) {
        return jsonResponse(res, 409, { success: false, error: t('error.operationInProgress') });
      }
      if (Date.now() - lastOperationTime < OPERATION_COOLDOWN_MS) {
        const wait = Math.ceil((OPERATION_COOLDOWN_MS - (Date.now() - lastOperationTime)) / 1000);
        return jsonResponse(res, 429, { success: false, error: t('error.tooFrequent', { wait }) });
      }
      agentOperationInProgress = true;
      lastOperationTime = Date.now();
      logSystem('restart', { reason: 'api_request', extId });
      jsonResponse(res, 200, { success: true, message: t('message.restarting') });

      // 转成绝对路径，避免相对路径在 detached 子进程中失效
      const agentScript = resolve(process.argv[1]);
      const restartPort = config.port || 18910;
      const restartHost = config.host || '127.0.0.1';
      const restartWorkdir = resolve(config.workdir || process.cwd());
      const currentPid = process.pid;

      // spawn 两阶段重启包装器（detached，独立于老进程存活）
      // 包装器会先等老进程退出 + 端口释放，再启动新进程
      const child = spawn(process.execPath, [
        ...process.execArgv,
        agentScript,
        '_restart-helper',
        '--old-pid', String(currentPid),
        '--port', String(restartPort),
        '--host', restartHost,
        '--workdir', restartWorkdir,
        '--script', agentScript
      ], {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
        env: { ...process.env },
        windowsHide: true
      });

      child.on('error', (err) => {
        logError('restart_spawn_failed', err.message);
      });
      child.unref();

      // 延迟后关闭当前进程，让 _restart-helper 接管
      setTimeout(() => shutdown(), 500);
      return;
    }

    // 更新并重启 Agent（需认证）
    if (req.method === 'POST' && pathname === '/api/agent/update') {
      if (agentOperationInProgress) {
        return jsonResponse(res, 409, { success: false, error: t('error.operationInProgress') });
      }
      if (Date.now() - lastOperationTime < OPERATION_COOLDOWN_MS) {
        const wait = Math.ceil((OPERATION_COOLDOWN_MS - (Date.now() - lastOperationTime)) / 1000);
        return jsonResponse(res, 429, { success: false, error: t('error.tooFrequent', { wait }) });
      }
      agentOperationInProgress = true;
      lastOperationTime = Date.now();
      logSystem('update', { reason: 'api_request', extId });

      const agentScript = resolve(process.argv[1]);
      const restartPort = config.port || 18910;
      const restartHost = config.host || '127.0.0.1';
      const restartWorkdir = resolve(config.workdir || process.cwd());
      const currentPid = process.pid;

      // 同步执行 npm 全局安装，完成后才返回结果（前端能收到真实成功/失败）
      (async () => {
        let npmSuccess = false;
        let npmError = '';
        const npmOutput = [];

        try {
          // npm install -g ai-helper-agent@latest
          // 不指定 --registry，继承用户环境配置（公司内网/外网自适应）
          const result = await new Promise((resolvePromise) => {
            const npm = spawn('npm', ['install', '-g', 'ai-helper-agent@latest', '--no-audit', '--no-fund'], {
              shell: true,
              env: { ...process.env },
              windowsHide: true
            });
            npm.stdout.on('data', d => npmOutput.push(d.toString().trim()));
            npm.stderr.on('data', d => npmOutput.push(d.toString().trim()));
            npm.on('error', (err) => resolvePromise({ success: false, error: err.message }));

            // 超时保护（90s），防止 npm 卡住导致前端长等待
            const timer = setTimeout(() => {
              try { npm.kill('SIGTERM'); } catch {}
              resolvePromise({ success: false, error: t('error.npmInstallTimeout') });
            }, 90000);
            timer.unref();

            npm.on('close', (code) => {
              clearTimeout(timer);
              resolvePromise({ success: code === 0, code });
            });
          });
          npmSuccess = result.success;
          if (!npmSuccess) {
            npmError = result.error || t('error.npmInstallExitCode', { code: result.code });
          }
        } catch (err) {
          npmError = err.message;
        }

        if (!npmSuccess) {
          // 更新失败：不重启，保持老进程运行，提示用户手动执行
          agentOperationInProgress = false; // 重置防重入标志，允许后续重试
          logError('update_npm_failed', npmError + ' | output: ' + npmOutput.join('\n').slice(-500));
          jsonResponse(res, 200, {
            success: false,
            error: t('error.updateFailed')
          });
          return;
        }

        // 更新成功：返回响应并触发两阶段重启
        logSystem('update_success', { output: npmOutput.join('\n').slice(-500) });
        jsonResponse(res, 200, { success: true, message: t('message.updateSuccess') });

        // spawn 两阶段重启包装器
        const child = spawn(process.execPath, [
          ...process.execArgv,
          agentScript,
          '_restart-helper',
          '--old-pid', String(currentPid),
          '--port', String(restartPort),
          '--host', restartHost,
          '--workdir', restartWorkdir,
          '--script', agentScript
        ], {
          detached: true,
          stdio: 'ignore',
          cwd: process.cwd(),
          env: { ...process.env },
          windowsHide: true
        });

        child.on('error', (err) => {
          logError('update_restart_spawn_failed', err.message);
        });
        child.unref();

        setTimeout(() => shutdown(), 500);
      })();
      return;
    }

    const maxSize = config.fileMaxSize || DEFAULT_MAX_SIZE;

    // 认证后的状态信息（不再下发 pairCode：配对码仅用于一次性配对，避免已配对端横向获取）
    if (req.method === 'GET' && pathname === '/api/status/detail') {
      const mem = process.memoryUsage();
      return jsonResponse(res, 200, {
        success: true,
        version: AGENT_VERSION,
        pairCodeTTL: config.pairCodeTTL,
        workdir: config.workdir,
        allowedPaths: config.allowedPaths,
        commandTimeout: config.commandTimeout,
        fileMaxSize: config.fileMaxSize,       // 读取大小限制（/api/fs/read、/api/fs/download）
        uploadMaxSize: MAX_UPLOAD_SIZE,        // 上传大小限制（/api/fs/upload-stream，流式不占内存可更大）
        runningProcesses: getRunningProcesses(),
        resourceUsage: {
          memoryUsedMB: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
          memoryTotalMB: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
          memoryRssMB: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
          uptimeSeconds: Math.round((Date.now() - AGENT_START_TIME) / 1000),
          cpuUser: process.cpuUsage().user,
          cpuSystem: process.cpuUsage().system
        },
        ...PLATFORM_INFO,
        searchTools: getSearchToolsAvailable()
      });
    }

    // === 文件上传（multipart/form-data，必须在通用 JSON body 解析之前） ===
    if (req.method === 'POST' && pathname === '/api/files/upload') {
      try {
        const { fileBuffer, fileName, mimeType } = await parseMultipartBody(req);

        // 安全检查：过滤危险字符 + basename 防路径穿越（.. 等）
        const safeName = basename(fileName.replace(/[/\\:*?"<>|]/g, '_')) || 'unnamed_file';
        const destPath = join(config.workdir, safeName);

        // 去重：如果文件已存在，添加后缀
        let finalPath = destPath;
        if (await exists(finalPath)) {
          const ext = safeName.lastIndexOf('.') > 0 ? safeName.substring(safeName.lastIndexOf('.')) : '';
          const base = safeName.substring(0, safeName.length - ext.length) || safeName;
          let counter = 1;
          while (await exists(finalPath)) {
            finalPath = join(config.workdir, `${base}_${counter}${ext}`);
            counter++;
          }
        }

        // 确保工作目录存在
        await mkdir(config.workdir, { recursive: true });

        // 写入文件
        await writeFile(finalPath, fileBuffer);

        logFs('upload', { path: finalPath, size: fileBuffer.length, mimeType });

        return jsonResponse(res, 200, {
          success: true,
          path: finalPath,
          name: safeName,
          size: fileBuffer.length
        });
      } catch (err) {
        logError('fs', 'upload_error', { error: err.message });
        return jsonResponse(res, 400, { success: false, error: t('exec.uploadFailed', { message: err.message }) });
      }
    }

    // === 流式文件上传（raw binary body，目标路径通过 query 传递，避免 base64 膨胀） ===
    // 必须在通用 JSON body 解析之前拦截，因为 body 是二进制而非 JSON
    if (req.method === 'POST' && pathname === '/api/fs/upload-stream') {
      const targetPath = url.searchParams.get('path');
      if (!targetPath || typeof targetPath !== 'string') {
        return jsonResponse(res, 400, { success: false, error: t('error.missingPath') });
      }
      const check = await checkPath(targetPath, t);
      if (!check.allowed) {
        logSecurity('fs_upload_stream_blocked', { path: targetPath, reason: check.reason });
        return jsonResponse(res, 403, { success: false, error: check.reason });
      }

      const maxSize = MAX_UPLOAD_SIZE;
      const declaredSize = parseInt(req.headers['content-length'] || '0', 10);
      if (declaredSize > maxSize) {
        return jsonResponse(res, 400, { success: false, error: t('error.fileTooLargeDeclared', { declared: declaredSize, limit: maxSize }) });
      }

      await mkdir(dirname(check.resolved), { recursive: true });

      try {
        const written = await new Promise((resolve, reject) => {
          const ws = createWriteStream(check.resolved);
          let totalWritten = 0;
          let aborted = false;

          // 计数 + 超限保护（防止 Content-Length 造假或缺失）
          const onReqData = (chunk) => {
            totalWritten += chunk.length;
            if (totalWritten > maxSize) {
              aborted = true;
              try { ws.destroy(); } catch {}
              try { req.destroy(); } catch {}
              reject(new Error(t('error.fileSizeExceeded', { received: totalWritten, limit: maxSize })));
            }
          };
          req.on('data', onReqData);
          req.on('error', (err) => {
            if (aborted) return;
            aborted = true;
            try { ws.destroy(); } catch {}
            reject(err);
          });
          ws.on('error', (err) => {
            if (aborted) return;
            aborted = true;
            reject(err);
          });
          ws.on('finish', () => {
            if (aborted) return;
            resolve(totalWritten);
          });

          req.pipe(ws);
        });

        // 脚本文件剥离执行权限
        const SCRIPT_EXT_RE = /\.(sh|bash|zsh|py|js|mjs|rb|pl|php|lua)$/i;
        if (SCRIPT_EXT_RE.test(check.resolved)) {
          try { await chmod(check.resolved, 0o644); } catch {}
        }

        logFs('upload_stream', { path: check.resolved, size: written });
        return jsonResponse(res, 200, { success: true, size: written, path: check.resolved });
      } catch (err) {
        logError('fs', 'upload_stream_error', { path: check.resolved, error: err.message });
        try { await unlink(check.resolved); } catch {}  // 清理半成品文件
        return jsonResponse(res, 400, { success: false, error: t('exec.uploadFailed', { message: err.message }) });
      }
    }

    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      let body;
      try { body = await parseBody(req); }
      catch (err) { return jsonResponse(res, 400, { success: false, error: err.message }); }

      // === 工作目录切换（需认证） ===
      if (pathname === '/api/config/workdir' && req.method === 'POST') {
        const newWorkdir = body.workdir;
        if (!newWorkdir || typeof newWorkdir !== 'string') {
          return jsonResponse(res, 400, { success: false, error: t('error.missingWorkdir') });
        }

        // 展开 ~ 到用户主目录
        let resolvedWorkdir = newWorkdir.trim();
        if (resolvedWorkdir === '~') {
          resolvedWorkdir = homedir();
        } else if (resolvedWorkdir.startsWith('~/')) {
          resolvedWorkdir = join(homedir(), resolvedWorkdir.slice(2));
        }
        // 规整路径格式（MSYS /d/Users/... → D:/Users/...、盘符大写统一），
        // 必须在 isAbsolute/resolve 之前，否则 Windows 上 /d/Users 会被当作 Unix 绝对路径错误解析
        resolvedWorkdir = normalizePathFormat(resolvedWorkdir);

        // 必须是绝对路径（跨平台：path.isAbsolute 覆盖 Unix /、Windows 盘符、UNC 路径）
        if (!isAbsolute(resolvedWorkdir)) {
          return jsonResponse(res, 400, { success: false, error: t('error.workdirNotAbsolute') });
        }
        resolvedWorkdir = resolve(resolvedWorkdir);

        // 禁止设为 Agent 系统目录本身（防敏感文件暴露）
        const AGENT_DIR_PATH = join(homedir(), '.ai-helper-agent');
        if (resolvedWorkdir === AGENT_DIR_PATH) {
          logSecurity('workdir_switch_blocked', { path: resolvedWorkdir, reason: t('error.workdirIsSystemDir') });
          return jsonResponse(res, 403, { success: false, error: t('error.workdirIsSystemDir') });
        }

        try {
          // 目录不存在则自动创建（mkdir -p）
          await mkdir(resolvedWorkdir, { recursive: true });

          // 重新加载最新配置（防并发修改），更新 workdir + allowedPaths（只增不减）
          const freshConfig = loadConfig();
          const updatedConfig = { ...freshConfig };
          updatedConfig.workdir = resolvedWorkdir;
          if (!Array.isArray(updatedConfig.allowedPaths)) {
            updatedConfig.allowedPaths = [resolvedWorkdir];
          } else if (!updatedConfig.allowedPaths.includes(resolvedWorkdir)) {
            updatedConfig.allowedPaths = [...updatedConfig.allowedPaths, resolvedWorkdir];
          }

          await saveConfig(updatedConfig);

          logSystem('workdir_switched', { old: freshConfig.workdir, new: resolvedWorkdir, extId });
          return jsonResponse(res, 200, {
            success: true,
            workdir: resolvedWorkdir,
            allowedPaths: updatedConfig.allowedPaths,
            message: t('message.workdirSwitched')
          });
        } catch (err) {
          logError('config', 'workdir_switch_error', { path: resolvedWorkdir, error: err.message });
          return jsonResponse(res, 500, { success: false, error: t('error.switchWorkdirFailed', { message: err.message }) });
        }
      }

      // === 移除允许访问的目录（需认证，不可移除当前工作目录） ===
      if (pathname === '/api/config/allowed-paths/remove' && req.method === 'POST') {
        const targetPath = body.path;
        if (!targetPath || typeof targetPath !== 'string') {
          return jsonResponse(res, 400, { success: false, error: t('error.missingPath') });
        }

        let resolvedPath = targetPath.trim();
        if (resolvedPath === '~') {
          resolvedPath = homedir();
        } else if (resolvedPath.startsWith('~/')) {
          resolvedPath = join(homedir(), resolvedPath.slice(2));
        }
        // 规整 MSYS 路径格式，与 workdir 切换端点保持一致
        resolvedPath = normalizePathFormat(resolvedPath);
        if (!isAbsolute(resolvedPath)) {
          return jsonResponse(res, 400, { success: false, error: t('error.pathNotAbsolute') });
        }
        resolvedPath = resolve(resolvedPath);

        try {
          const freshConfig = loadConfig();
          const currentWorkdir = resolve(freshConfig.workdir || '');
          // 禁止移除当前工作目录
          if (resolvedPath === currentWorkdir) {
            return jsonResponse(res, 400, { success: false, error: t('error.cannotRemoveWorkdir') });
          }

          const allowedPaths = Array.isArray(freshConfig.allowedPaths) ? freshConfig.allowedPaths : [];
          // 跨平台路径比较：统一分隔符 + 大小写不敏感
          const norm = s => s.replace(/\\/g, '/').toLowerCase();
          const filtered = allowedPaths.filter(p => norm(p) !== norm(resolvedPath));

          // 没有变化说明该路径不在列表中
          if (filtered.length === allowedPaths.length) {
            return jsonResponse(res, 200, { success: true, allowedPaths: filtered, message: t('error.pathNotInAllowedList') });
          }

          const updatedConfig = { ...freshConfig, allowedPaths: filtered };
          await saveConfig(updatedConfig);

          logSystem('allowed_path_removed', { path: resolvedPath, extId });
          return jsonResponse(res, 200, {
            success: true,
            allowedPaths: updatedConfig.allowedPaths,
            message: t('message.removedFromAllowedList')
          });
        } catch (err) {
          logError('config', 'allowed_path_remove_error', { path: resolvedPath, error: err.message });
          return jsonResponse(res, 500, { success: false, error: t('error.removeAllowedPathFailed', { message: err.message }) });
        }
      }

      // === 文件操作 ===

      // 搜索文件（按文件名模式）
      if (pathname === '/api/fs/search_files') {
        const maxResults = Math.min(body.maxResults || 200, MAX_SEARCH_RESULTS);
        try {
          const result = await searchFiles(
            body.path || '.',
            body.pattern || '*',
            body.recursive !== false,
            maxResults,
            t
          );
          if (result.success) {
            logFs('search_files', { path: result.path, pattern: body.pattern, total: result.total, engine: result.engine });
          } else {
            logSecurity('fs_search_files_blocked', { path: body.path, reason: result.error });
          }
          return jsonResponse(res, result.success ? 200 : 403, result);
        } catch (err) {
          logError('fs', 'search_files_error', { path: body.path, error: err.message });
          return jsonResponse(res, 500, { success: false, error: t('error.fileSearchFailed', { message: err.message }) });
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
            body.recursive !== false,
            maxResults,
            body.contextLines !== undefined ? body.contextLines : 2,
            t
          );
          if (result.success) {
            logFs('search_content', { path: result.path, pattern: body.pattern, total: result.total, engine: result.engine });
          } else {
            logSecurity('fs_search_content_blocked', { path: body.path, reason: result.error });
          }
          return jsonResponse(res, result.success ? 200 : 403, result);
        } catch (err) {
          logError('fs', 'search_content_error', { path: body.path, error: err.message });
          return jsonResponse(res, 500, { success: false, error: t('error.contentSearchFailed', { message: err.message }) });
        }
      }

      // 读取文件
      if (pathname === '/api/fs/read') {
        const check = await checkPath(body.path, t);
        if (!check.allowed) {
          logSecurity('fs_read_blocked', { path: body.path, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        if (!await exists(check.resolved)) return jsonResponse(res, 404, { success: false, error: t('error.fileNotFound') });
        const fstat = await stat(check.resolved);
        if (fstat.isDirectory()) return jsonResponse(res, 400, { success: false, error: t('error.pathIsDir') });
        if (fstat.size > maxSize) return jsonResponse(res, 400, { success: false, error: t('error.fileTooLargeStat', { size: fstat.size, limit: maxSize }) });
        const content = await readFile(check.resolved, 'utf-8');
        logFs('read', { path: check.resolved, size: fstat.size });
        return jsonResponse(res, 200, { success: true, content, size: fstat.size, path: check.resolved });
      }

      // 写入文件
      if (pathname === '/api/fs/write') {
        const check = await checkPath(body.path, t);
        if (!check.allowed) {
          logSecurity('fs_write_blocked', { path: body.path, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        const rawContent = 'content' in body ? String(body.content) : '';
        const encoding = body.encoding === 'base64' ? 'base64' : 'utf-8';
        // base64 编码：先解码为二进制 Buffer 再写入，避免把 base64 字符串当文本写入导致文件损坏
        const buf = encoding === 'base64'
          ? Buffer.from(rawContent, 'base64')
          : Buffer.from(rawContent, 'utf-8');
        if (buf.length > maxSize) return jsonResponse(res, 400, { success: false, error: t('error.contentTooLarge', { size: buf.length, limit: maxSize }) });
        // 确保父目录存在
        await mkdir(dirname(check.resolved), { recursive: true });
        if (encoding === 'base64') {
          // 二进制内容直接写入 Buffer
          await writeFile(check.resolved, buf);
        } else {
          await writeFile(check.resolved, rawContent, 'utf-8');
        }

        // 如果写入的是脚本文件，剥离执行权限防止直接运行
        const SCRIPT_EXT_RE = /\.(sh|bash|zsh|py|js|mjs|rb|pl|php|lua)$/i;
        const isScriptExt = SCRIPT_EXT_RE.test(check.resolved);
        const hasShebang = encoding === 'utf-8' && rawContent.startsWith('#!');
        if (isScriptExt || hasShebang) {
          try {
            await chmod(check.resolved, 0o644);
          } catch {}
        }

        logFs('write', { path: check.resolved, size: buf.length, encoding });
        return jsonResponse(res, 200, { success: true, size: buf.length, path: check.resolved });
      }

      // 列出目录
      if (pathname === '/api/fs/list') {
        const dirPath = body.path || '.';
        const check = await checkPath(dirPath, t);
        if (!check.allowed) {
          logSecurity('fs_list_blocked', { path: dirPath, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        if (!await exists(check.resolved)) return jsonResponse(res, 404, { success: false, error: t('error.dirNotFound') });
        const dstat = await stat(check.resolved);
        if (!dstat.isDirectory()) return jsonResponse(res, 400, { success: false, error: t('error.pathNotDir') });
        const names = await readdir(check.resolved);
        const entries = await Promise.all(names.map(async (name) => {
          const fullPath = join(check.resolved, name);
          try {
            const s = await stat(fullPath);
            return { name, type: s.isDirectory() ? 'directory' : 'file', size: s.size, mtime: s.mtimeMs };
          } catch { return { name, type: 'unknown', size: 0, mtime: 0 }; }
        }));
        logFs('list', { path: check.resolved, entryCount: entries.length });
        return jsonResponse(res, 200, { success: true, entries, path: check.resolved });
      }

      // 获取文件详细信息（权限、创建/访问/修改时间、MIME 类型等）
      if (pathname === '/api/fs/stat') {
        const check = await checkPath(body.path, t);
        if (!check.allowed) {
          logSecurity('fs_stat_blocked', { path: body.path, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        if (!await exists(check.resolved)) {
          return jsonResponse(res, 404, { success: false, error: t('error.fileOrDirNotFound') });
        }
        const s = await stat(check.resolved);
        const info = {
          name: basename(check.resolved),
          path: check.resolved,
          type: s.isDirectory() ? 'directory' : 'file',
          size: s.size,
          mtime: s.mtimeMs,
          ctime: s.birthtimeMs || s.ctimeMs,
          atime: s.atimeMs,
          mode: s.mode,
          isDirectory: s.isDirectory(),
          isFile: s.isFile(),
          isSymbolicLink: s.isSymbolicLink()
        };
        // Windows 没有 uid/gid
        if (s.uid !== undefined) info.uid = s.uid;
        if (s.gid !== undefined) info.gid = s.gid;
        if (info.isFile) info.mimeType = getMimeType(check.resolved);
        logFs('stat', { path: check.resolved, type: info.type, size: info.size });
        return jsonResponse(res, 200, { success: true, info });
      }

      // 删除文件/目录（移至回收站，7天后自动清理）
      if (pathname === '/api/fs/delete') {
        const check = await checkPath(body.path, t);
        if (!check.allowed) {
          logSecurity('fs_delete_blocked', { path: body.path, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        if (!await exists(check.resolved)) return jsonResponse(res, 404, { success: false, error: t('error.fileOrDirNotFound') });
        const fstat2 = await stat(check.resolved);
        const isDir = fstat2.isDirectory();
        const trashResult = await moveToTrash(check.resolved, t);
        if (!trashResult.success) {
          logError('fs', 'trash_error', { path: check.resolved, error: trashResult.error });
          return jsonResponse(res, 500, { success: false, error: trashResult.error });
        }
        logFs('delete', { path: check.resolved, type: isDir ? 'directory' : 'file', size: fstat2.size, trashId: trashResult.trashId });
        return jsonResponse(res, 200, { success: true, path: check.resolved, isDir: trashResult.isDir, trashId: trashResult.trashId, message: t('message.movedToTrash') });
      }

      // 下载文件/目录（返回 base64 内容，目录自动打包为 zip）
      if (pathname === '/api/fs/download') {
        const targetPath = body.path;
        if (!targetPath || typeof targetPath !== 'string') {
          return jsonResponse(res, 400, { success: false, error: t('error.missingPath') });
        }
        const check = await checkPath(targetPath, t);
        if (!check.allowed) {
          logSecurity('fs_download_blocked', { path: targetPath, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        if (!await exists(check.resolved)) {
          return jsonResponse(res, 404, { success: false, error: t('error.fileOrDirNotFound') });
        }

        try {
          const fstat = await stat(check.resolved);
          if (fstat.isDirectory()) {
            // 目录：打包为 zip
            const tmpFile = join(tmpdir(), `ws-dl-${randomBytes(6).toString('hex')}.zip`);
            try {
              const dirName = basename(check.resolved);
              const parentDir = dirname(check.resolved);
              const zipBuffer = await createZipBuffer([dirName], parentDir, tmpFile);
              logFs('download', { path: check.resolved, type: 'directory', zipSize: zipBuffer.length });
              return jsonResponse(res, 200, {
                success: true,
                type: 'directory',
                name: `${dirName}.zip`,
                size: zipBuffer.length,
                content: zipBuffer.toString('base64'),
                mimeType: 'application/zip'
              });
            } finally {
              try { await unlink(tmpFile); } catch {}
            }
          } else {
            // 单个文件
            if (fstat.size > maxSize) {
              return jsonResponse(res, 400, { success: false, error: t('error.fileTooLargeStat', { size: fstat.size, limit: maxSize }) });
            }
            const buf = await readFile(check.resolved);
            const mimeType = getMimeType(check.resolved);
            logFs('download', { path: check.resolved, type: 'file', size: buf.length });
            return jsonResponse(res, 200, {
              success: true,
              type: 'file',
              name: basename(check.resolved),
              size: buf.length,
              content: buf.toString('base64'),
              mimeType
            });
          }
        } catch (err) {
          logError('fs', 'download_error', { path: targetPath, error: err.message });
          return jsonResponse(res, 500, { success: false, error: t('error.downloadFailed', { message: err.message }) });
        }
      }

      // 批量下载多个文件/目录（在后端打包为 zip）
      if (pathname === '/api/fs/download-multi') {
        const paths = body.paths;
        if (!Array.isArray(paths) || paths.length === 0) {
          return jsonResponse(res, 400, { success: false, error: t('error.missingPathsParam') });
        }

        const resolvedPaths = [];
        for (const p of paths) {
          const check = await checkPath(p, t);
          if (!check.allowed) {
            logSecurity('fs_download_blocked', { path: p, reason: check.reason });
            return jsonResponse(res, 403, { success: false, error: t('error.pathNotAllowed', { path: p }) });
          }
          if (!await exists(check.resolved)) {
            return jsonResponse(res, 404, { success: false, error: t('error.pathNotExist', { path: p }) });
          }
          resolvedPaths.push(check.resolved);
        }

        try {
          const tmpFile = join(tmpdir(), `ws-dl-${randomBytes(6).toString('hex')}.zip`);
          try {
            const zipArgs = resolvedPaths.map(p => basename(p));
            const commonParent = computeCommonParent(resolvedPaths);

            const zipBuffer = await createZipBuffer(zipArgs, commonParent, tmpFile);
            logFs('download_multi', { paths: resolvedPaths, zipSize: zipBuffer.length });
            return jsonResponse(res, 200, {
              success: true,
              type: 'archive',
              name: `workspace_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.zip`,
              size: zipBuffer.length,
              content: zipBuffer.toString('base64'),
              mimeType: 'application/zip'
            });
          } finally {
            try { await unlink(tmpFile); } catch {}
          }
        } catch (err) {
          logError('fs', 'download_multi_error', { paths, error: err.message });
          return jsonResponse(res, 500, { success: false, error: t('error.packFailed', { message: err.message }) });
        }
      }

      // 流式下载（直接返回二进制流，避免 base64 膨胀和前端同步解码）
      // 支持单文件/目录（path）或多文件打包（paths）
      if (pathname === '/api/fs/download-stream') {
        const targetPath = body.path;
        const paths = body.paths;

        // 辅助：设置下载响应头并分块流式返回二进制
        // 分块写入避免一次性 res.end(buffer) 导致客户端进度条瞬间跳到 100%
        const sendBinary = (buffer, filename, mimeType) => {
          const encodedName = encodeURIComponent(filename);
          res.writeHead(200, {
            'Content-Type': mimeType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
            'Content-Length': buffer.length,
            'Cache-Control': 'no-cache'
          });

          // 分块写入：每块 64KB，写完一块让出事件循环，让 TCP 有机会发送数据
          // 客户端 reader.read() 会持续拿到 64KB 左右的 chunk，进度条平滑更新
          const CHUNK_SIZE = 64 * 1024;
          let offset = 0;
          const writeNext = () => {
            if (res.writableEnded) return;
            if (offset >= buffer.length) {
              res.end();
              return;
            }
            const end = Math.min(offset + CHUNK_SIZE, buffer.length);
            const chunk = buffer.subarray(offset, end);
            offset = end;
            if (res.write(chunk)) {
              // 缓冲区未满，用 setImmediate 让出事件循环，让 TCP 有机会发送
              setImmediate(writeNext);
            } else {
              // 缓冲区满了，等待 drain 事件再继续
              res.once('drain', writeNext);
            }
          };
          writeNext();
        };

        try {
          if (paths && Array.isArray(paths) && paths.length > 0) {
            // 多文件打包流式下载
            const resolvedPaths = [];
            for (const p of paths) {
              const check = await checkPath(p, t);
              if (!check.allowed) {
                logSecurity('fs_download_blocked', { path: p, reason: check.reason });
                return jsonResponse(res, 403, { success: false, error: t('error.pathNotAllowed', { path: p }) });
              }
              if (!await exists(check.resolved)) {
                return jsonResponse(res, 404, { success: false, error: t('error.pathNotExist', { path: p }) });
              }
              resolvedPaths.push(check.resolved);
            }

            const tmpFile = join(tmpdir(), `ws-dl-${randomBytes(6).toString('hex')}.zip`);
            try {
              const zipArgs = resolvedPaths.map(p => basename(p));
              const commonParent = computeCommonParent(resolvedPaths);
              const zipBuffer = await createZipBuffer(zipArgs, commonParent, tmpFile);
              logFs('download_multi_stream', { paths: resolvedPaths, zipSize: zipBuffer.length });
              const zipName = `workspace_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.zip`;
              return sendBinary(zipBuffer, zipName, 'application/zip');
            } finally {
              try { await unlink(tmpFile); } catch {}
            }
          } else if (targetPath && typeof targetPath === 'string') {
            // 单文件/目录流式下载
            const check = await checkPath(targetPath, t);
            if (!check.allowed) {
              logSecurity('fs_download_blocked', { path: targetPath, reason: check.reason });
              return jsonResponse(res, 403, { success: false, error: check.reason });
            }
            if (!await exists(check.resolved)) {
              return jsonResponse(res, 404, { success: false, error: t('error.fileOrDirNotFound') });
            }

            const fstat = await stat(check.resolved);
            if (fstat.isDirectory()) {
              // 目录打包
              const tmpFile = join(tmpdir(), `ws-dl-${randomBytes(6).toString('hex')}.zip`);
              try {
                const dirName = basename(check.resolved);
                const parentDir = dirname(check.resolved);
                const zipBuffer = await createZipBuffer([dirName], parentDir, tmpFile);
                logFs('download_stream', { path: check.resolved, type: 'directory', zipSize: zipBuffer.length });
                return sendBinary(zipBuffer, `${dirName}.zip`, 'application/zip');
              } finally {
                try { await unlink(tmpFile); } catch {}
              }
            } else {
              // 单文件：用 createReadStream 流式传输，避免 readFile 把整个文件读入内存导致 OOM
              const mimeType = getMimeType(check.resolved);
              const encodedName = encodeURIComponent(basename(check.resolved));
              res.writeHead(200, {
                'Content-Type': mimeType || 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
                'Content-Length': fstat.size,
                'Cache-Control': 'no-cache'
              });
              const rs = createReadStream(check.resolved);
              rs.on('error', (err) => {
                logError('fs', 'download_stream_read_error', { path: check.resolved, error: err.message });
                try { res.destroy(); } catch {}
              });
              logFs('download_stream', { path: check.resolved, type: 'file', size: fstat.size });
              rs.pipe(res);
              return;
            }
          } else {
            return jsonResponse(res, 400, { success: false, error: t('error.missingPathOrPaths') });
          }
        } catch (err) {
          logError('fs', 'download_stream_error', { path: targetPath, paths, error: err.message });
          return jsonResponse(res, 500, { success: false, error: t('error.downloadFailed', { message: err.message }) });
        }
      }

      // XLSX 预览（服务端解析前 500 行，返回 JSON，避免前端引入 SheetJS）
      if (pathname === '/api/fs/preview-xlsx') {
        const filePath = body.path;
        if (!filePath || typeof filePath !== 'string') {
          return jsonResponse(res, 400, { success: false, error: t('error.missingPath') });
        }
        const check = await checkPath(filePath, t);
        if (!check.allowed) {
          logSecurity('fs_preview_xlsx_blocked', { path: filePath, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        try {
          const buffer = await readFile(check.resolved);
          const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: 2001 });
          const sheets = workbook.SheetNames.map((name, idx) => {
            const sheet = workbook.Sheets[name];
            const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
            const maxRow = Math.min(range.e.r, 2000);
            const rows = [];
            for (let r = range.s.r; r <= maxRow && r <= range.e.r; r++) {
              const row = [];
              for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[addr];
                row.push(cell ? String(cell.w ?? cell.v ?? '') : '');
              }
              rows.push(row);
            }

            // 裁剪：去掉尾部全空行和尾部全空列（避免仅设置了边框的空单元格撑爆 DOM）
            let lastDataRow = -1;
            let lastDataCol = -1;
            for (let ri = 0; ri < rows.length; ri++) {
              for (let ci = 0; ci < rows[ri].length; ci++) {
                if (rows[ri][ci] !== '') {
                  lastDataRow = Math.max(lastDataRow, ri);
                  lastDataCol = Math.max(lastDataCol, ci);
                }
              }
            }

            const trimmedRows = lastDataRow >= 0
              ? rows.slice(0, lastDataRow + 1).map(r => r.slice(0, lastDataCol + 1))
              : [];
            const colCount = lastDataCol >= 0 ? lastDataCol + 1 : 0;
            const totalRows = range.e.r - range.s.r + 1;

            return { name, index: idx, colCount, totalRows, rows: trimmedRows };
          });
          logFs('preview_xlsx', { path: check.resolved, sheets: sheets.length });
          return jsonResponse(res, 200, { success: true, data: { sheets } });
        } catch (err) {
          logError('fs', 'preview_xlsx_error', { path: filePath, error: err.message });
          return jsonResponse(res, 500, { success: false, error: t('error.parseFailed', { message: err.message }) });
        }
      }

      // 创建目录
      if (pathname === '/api/fs/mkdir') {
        const dirPath = body.path;
        if (!dirPath || typeof dirPath !== 'string') {
          return jsonResponse(res, 400, { success: false, error: t('error.missingPath') });
        }
        const check = await checkPath(dirPath, t);
        if (!check.allowed) {
          logSecurity('fs_mkdir_blocked', { path: dirPath, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        try {
          await mkdir(check.resolved, { recursive: false });
          logFs('mkdir', { path: check.resolved });
          return jsonResponse(res, 200, { success: true, path: check.resolved });
        } catch (err) {
          if (err.code === 'EEXIST') {
            return jsonResponse(res, 409, { success: false, error: t('error.dirExists') });
          }
          throw err;
        }
      }

      // 重命名文件/目录（仅修改文件名，不跨目录）
      if (pathname === '/api/fs/rename') {
        const oldPath = body.path;
        const newName = body.newName;
        if (!oldPath || typeof oldPath !== 'string' || !newName || typeof newName !== 'string') {
          return jsonResponse(res, 400, { success: false, error: t('error.missingPathOrNewName') });
        }
        if (newName.includes('/') || newName.includes('\\')) {
          return jsonResponse(res, 400, { success: false, error: t('error.newNameHasSeparator') });
        }
        // Windows 文件名非法字符（仅 Windows 拦截；Unix 允许这些字符）
        if (os.platform() === 'win32' && /[:*?"<>|]/.test(newName)) {
          return jsonResponse(res, 400, { success: false, error: t('error.newNameInvalidChars') });
        }
        const check = await checkPath(oldPath, t);
        if (!check.allowed) {
          logSecurity('fs_rename_blocked', { path: oldPath, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        if (!await exists(check.resolved)) {
          return jsonResponse(res, 404, { success: false, error: t('error.fileOrDirNotFound') });
        }
        const newFullPath = join(dirname(check.resolved), newName);
        // 确保目标路径也在允许范围内
        const newCheck = await checkPath(newFullPath, t);
        if (!newCheck.allowed) {
          logSecurity('fs_rename_blocked', { path: newFullPath, reason: newCheck.reason });
          return jsonResponse(res, 403, { success: false, error: t('error.targetPathNotAllowed', { reason: newCheck.reason }) });
        }
        // 防止覆盖：目标已存在时统一返回 409。
        // macOS/Linux 的 fs.rename 会静默覆盖目标文件（仅 Windows 报 EEXIST），
        // 主动检查避免跨平台数据丢失风险
        if (await exists(newFullPath)) {
          return jsonResponse(res, 409, { success: false, error: t('error.targetExists') });
        }
        try {
          await rename(check.resolved, newFullPath);
          logFs('rename', { from: check.resolved, to: newFullPath });
          return jsonResponse(res, 200, { success: true, newPath: newFullPath, newName });
        } catch (err) {
          if (err.code === 'ENOTEMPTY' || err.code === 'EEXIST') {
            return jsonResponse(res, 409, { success: false, error: t('error.targetExists') });
          }
          throw err;
        }
      }

      // 移动文件/目录
      if (pathname === '/api/fs/move') {
        const srcPath = body.path;
        const destDir = body.destDir;
        if (!srcPath || typeof srcPath !== 'string' || !destDir || typeof destDir !== 'string') {
          return jsonResponse(res, 400, { success: false, error: t('error.missingPathOrDestDir') });
        }
        const srcCheck = await checkPath(srcPath, t);
        if (!srcCheck.allowed) {
          logSecurity('fs_move_blocked', { path: srcPath, reason: srcCheck.reason });
          return jsonResponse(res, 403, { success: false, error: srcCheck.reason });
        }
        const destCheck = await checkPath(destDir, t);
        if (!destCheck.allowed) {
          logSecurity('fs_move_blocked', { path: destDir, reason: destCheck.reason });
          return jsonResponse(res, 403, { success: false, error: destCheck.reason });
        }
        if (!await exists(srcCheck.resolved)) {
          return jsonResponse(res, 404, { success: false, error: t('error.sourceNotFound') });
        }
        const destStat = await stat(destCheck.resolved).catch(() => null);
        if (!destStat || !destStat.isDirectory()) {
          return jsonResponse(res, 400, { success: false, error: t('error.targetNotDir') });
        }
        const itemName = basename(srcCheck.resolved);
        const destPath = join(destCheck.resolved, itemName);
        const destCheck2 = await checkPath(destPath, t);
        if (!destCheck2.allowed) {
          logSecurity('fs_move_blocked', { path: destPath, reason: destCheck2.reason });
          return jsonResponse(res, 403, { success: false, error: t('error.moveTargetNotAllowed', { reason: destCheck2.reason }) });
        }
        // 防止覆盖：目标已存在时统一返回 409（与 rename 端点一致，避免 macOS/Linux 静默覆盖）
        if (await exists(destPath)) {
          return jsonResponse(res, 409, { success: false, error: t('error.targetNameExists') });
        }
        try {
          await rename(srcCheck.resolved, destPath);
          logFs('move', { from: srcCheck.resolved, to: destPath });
          return jsonResponse(res, 200, { success: true, newPath: destPath });
        } catch (err) {
          if (err.code === 'ENOTEMPTY' || err.code === 'EEXIST') {
            return jsonResponse(res, 409, { success: false, error: t('error.targetNameExists') });
          }
          throw err;
        }
      }

      // 在本地浏览器中打开文件
      if (pathname === '/api/browser/open') {
        const targetPath = body.path;
        if (!targetPath || typeof targetPath !== 'string') {
          return jsonResponse(res, 400, { success: false, error: t('error.missingPath') });
        }
        const check = await checkPath(targetPath, t);
        if (!check.allowed) {
          logSecurity('browser_open_blocked', { path: targetPath, reason: check.reason });
          return jsonResponse(res, 403, { success: false, error: check.reason });
        }
        if (!await exists(check.resolved)) {
          return jsonResponse(res, 404, { success: false, error: t('error.fileNotFound') });
        }

        const fileUrl = pathToFileURL(check.resolved).href;
        const platform = os.platform();
        let cmd, args, spawnOpts;
        if (platform === 'darwin') {
          cmd = 'open';
          args = [fileUrl];
          spawnOpts = { detached: true, stdio: 'ignore' };
        } else if (platform === 'win32') {
          cmd = 'start';
          args = ['""', `"${fileUrl}"`];
          spawnOpts = { detached: true, stdio: 'ignore', shell: true, windowsHide: true };
        } else {
          cmd = 'xdg-open';
          args = [fileUrl];
          spawnOpts = { detached: true, stdio: 'ignore' };
        }

        spawn(cmd, args, spawnOpts).unref();

        logFs('browser_open', { path: check.resolved, platform });
        return jsonResponse(res, 200, { success: true, path: check.resolved, platform });
      }

      // === 命令执行 ===

      if (pathname === '/api/exec') {
        const { command, cwd, wait, force } = body;
        if (!command || typeof command !== 'string') return jsonResponse(res, 400, { success: false, error: t('error.missingCommand') });

        // 校验 cwd
        let resolvedCwd = cwd || config.workdir;
        const cwdCheck = await checkPath(resolvedCwd, t);
        if (!cwdCheck.allowed) {
          logSecurity('exec_cwd_blocked', { command, cwd: resolvedCwd, reason: cwdCheck.reason });
          return jsonResponse(res, 403, { success: false, error: t('error.execDirCheckFailed', { reason: cwdCheck.reason }) });
        }

        // 安全检查
        const cmdCheck = checkCommand(command, !!force, t);
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
            return jsonResponse(res, 500, { success: false, error: t('error.execFailed', { message: err.message }) });
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

      // 回收站恢复
      if (pathname === '/api/trash/restore') {
        if (!body.trashId) return jsonResponse(res, 400, { success: false, error: t('error.missingTrashId') });
        const result = await restoreFromTrash(body.trashId, t);
        if (result.success) {
          logFs('trash_restore', { trashId: body.trashId, restoredPath: result.restoredPath });
        } else {
          logSecurity('trash_restore_failed', { trashId: body.trashId, reason: result.error });
        }
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // 审计日志查询
      if (pathname === '/api/logs/query') {
        const limit = Math.min(body.limit || 200, 500); // 单次最多 500 条
        const cat = body.category || null;
        // 默认只查询最近 7 天的日志
        const today = new Date();
        const dates = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          dates.push(d.toISOString().slice(0, 10));
        }
        let allEntries = [];
        for (const date of dates) {
          const result = queryLogs({ date, category: cat, limit: limit - allEntries.length, offset: 0 });
          allEntries = allEntries.concat(result.entries);
          if (allEntries.length >= limit) break;
        }
        allEntries = allEntries.slice(0, limit);
        return jsonResponse(res, 200, { success: true, entries: allEntries, total: allEntries.length, dates });
      }

      // 执行 Skill
      if (pathname === '/api/skill/run') {
        if (!body.name) return jsonResponse(res, 400, { success: false, error: t('error.missingName') });
        const result = await runSkill(body.name, body.params || {});
        logSystem('skill_run', { skillName: body.name, success: result.success });
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // 导入 Skill
      if (pathname === '/api/skill/import') {
        if (!body.name || !body.steps) {
          return jsonResponse(res, 400, { success: false, error: t('error.missingNameAndSteps') });
        }
        const result = await importSkill(body);
        logSystem('skill_import', { skillName: body.name });
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // 删除 Skill
      if (pathname === '/api/skill/delete') {
        if (!body.name) return jsonResponse(res, 400, { success: false, error: t('error.missingName') });
        const result = await removeSkill(body.name);
        logSystem('skill_remove', { skillName: body.name });
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // 切换 Skill 启用/停用
      if (pathname === '/api/skill/toggle') {
        if (!body.name) return jsonResponse(res, 400, { success: false, error: t('error.missingName') });
        const result = toggleSkill(body.name);
        logSystem('skill_toggle', { skillName: body.name, enabled: result.enabled });
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // 重新加载 Skill
      if (pathname === '/api/skill/reload') {
        const count = await reloadSkills();
        logSystem('skill_reload', { count });
        return jsonResponse(res, 200, { success: true, count });
      }

      // === Agent Skill Markdown 管理 ===

      // 创建/更新 Agent Skill Markdown
      if (pathname === '/api/skill/save-markdown') {
        if (!body.name) {
          return jsonResponse(res, 400, { success: false, error: t('error.missingName') });
        }
        if (!body.markdown && !body.prompt) {
          return jsonResponse(res, 400, { success: false, error: t('error.missingMarkdownOrPrompt') });
        }
        // 检查是否为不可编辑的内置技能
        const { skills: skillsMap } = await import('./skill/registry.js');
        const existingSkill = skillsMap.get(body.name);
        if (existingSkill?.builtin && existingSkill?.editable === false) {
          return jsonResponse(res, 403, { success: false, error: t('error.builtinSkillNotEditable', { name: body.name }) });
        }
        const skillDef = {
          type: 'agent',
          name: body.name,
          description: body.description || '',
          version: body.version || '1.0',
          enabled: body.enabled !== false,
          fullPrompt: body.markdown || body.prompt || '',
          prompt: body.markdown || body.prompt || ''
        };
        const result = saveMarkdownSkill(getSkillsDir(), skillDef);
        if (result.success) {
          // 重新注册
          const { loadMarkdownSkill } = await import('./skill/markdown-loader.js');
          const skill = loadMarkdownSkill(result.dirPath);
          if (skill) {
            skillsMap.set(skill.name, skill);
          }
          logSystem('skill_save_markdown', { skillName: body.name });
        }
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // 从 Zip 导入 Agent Skill（base64 编码的 zip 内容）
      if (pathname === '/api/skill/import-zip') {
        if (!body.zipData) {
          return jsonResponse(res, 400, { success: false, error: t('error.missingZipData') });
        }
        try {
          const zipBuffer = Buffer.from(body.zipData, 'base64');
          const result = await importMarkdownSkillFromZip(getSkillsDir(), zipBuffer, body.name);
          if (result.success && result.skill) {
            const { skills } = await import('./skill/registry.js');
            skills.set(result.skill.name, result.skill);
            logSystem('skill_import_zip', { skillName: result.skill.name });
          }
          return jsonResponse(res, result.success ? 200 : 400, result);
        } catch (err) {
          return jsonResponse(res, 400, { success: false, error: t('error.zipImportFailed', { message: err.message }) });
        }
      }

      // 从 URL 导入 Agent Skill
      if (pathname === '/api/skill/import-url') {
        if (!body.url) {
          return jsonResponse(res, 400, { success: false, error: t('error.missingUrl') });
        }
        try {
          const result = await importMarkdownSkillFromUrl(getSkillsDir(), body.url);
          if (result.success && result.skill) {
            const { skills } = await import('./skill/registry.js');
            skills.set(result.skill.name, result.skill);
            logSystem('skill_import_url', { skillName: result.skill.name, url: body.url });
          }
          return jsonResponse(res, result.success ? 200 : 400, result);
        } catch (err) {
          return jsonResponse(res, 400, { success: false, error: t('error.urlImportFailed', { message: err.message }) });
        }
      }

      // === MCP 操作（需要 body） ===

      // 添加 MCP 服务器
      if (pathname === '/api/mcp/servers' && req.method === 'POST') {
        const isHttp = body.transport === 'sse' || body.transport === 'streamableHttp' || body.transport === 'websocket';
        if (!body.id) {
          return jsonResponse(res, 400, { success: false, error: t('error.missingId') });
        }
        if (isHttp && !body.url) {
          return jsonResponse(res, 400, { success: false, error: t('error.httpRequiresUrl') });
        }
        if (!isHttp && !body.command) {
          return jsonResponse(res, 400, { success: false, error: t('error.stdioRequiresCommand') });
        }
        // stdio 传输：对 command + args 做安全校验，防止 MCP 成为命令管控后门
        if (!isHttp) {
          const fullCmd = body.args?.length > 0
            ? `${body.command} ${body.args.join(' ')}`
            : body.command;
          const cmdCheck = checkCommand(fullCmd, false, t);
          if (cmdCheck.level === 'deny') {
            logSecurity('mcp_stdio_denied', { command: fullCmd, reason: cmdCheck.reason });
            return jsonResponse(res, 403, { success: false, error: t('error.mcpCommandBlocked', { reason: cmdCheck.reason }) });
          }
          if (cmdCheck.level === 'confirm') {
            logSecurity('mcp_stdio_confirm_required', { command: fullCmd, reason: cmdCheck.reason });
            return jsonResponse(res, 200, { success: true, level: 'confirm', reason: cmdCheck.reason, message: t('message.mcpCommandConfirm', { reason: cmdCheck.reason }) });
          }
        }
        const result = await addMcpServer(body);
        logSystem('mcp_server_add', { serverId: body.id });
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // 删除 MCP 服务器
      if (pathname === '/api/mcp/servers' && req.method === 'DELETE') {
        if (!body.id) return jsonResponse(res, 400, { success: false, error: t('error.missingIdParam') });
        const result = await removeMcpServer(body.id);
        logSystem('mcp_server_remove', { serverId: body.id });
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // MCP 连接
      if (pathname === '/api/mcp/servers/connect') {
        if (!body.id) return jsonResponse(res, 400, { success: false, error: t('error.missingIdParam') });
        const result = await connectMcpServer(body.id);
        logSystem('mcp_server_connect', { serverId: body.id, success: result.success });
        return jsonResponse(res, result.success ? 200 : 500, result);
      }

      // MCP 断开
      if (pathname === '/api/mcp/servers/disconnect') {
        if (!body.id) return jsonResponse(res, 400, { success: false, error: t('error.missingIdParam') });
        const result = await disconnectMcpServer(body.id);
        logSystem('mcp_server_disconnect', { serverId: body.id });
        return jsonResponse(res, 200, result);
      }

      // MCP 启用/禁用切换
      if (pathname === '/api/mcp/servers/toggle') {
        if (body.id === undefined || body.enabled === undefined) {
          return jsonResponse(res, 400, { success: false, error: t('error.missingIdAndEnabled') });
        }
        // 禁用时先断开连接，确保工具立即可用/不可用
        if (!body.enabled) {
          await disconnectMcpServer(body.id);
        }
        const result = await toggleMcpServer(body.id, body.enabled);
        logSystem('mcp_server_toggle', { serverId: body.id, enabled: body.enabled });
        return jsonResponse(res, result.success ? 200 : 400, result);
      }

      // MCP 工具调用
      if (pathname === '/api/mcp/call') {
        if (!body.serverId || !body.toolName) {
          return jsonResponse(res, 400, { success: false, error: t('error.missingServerIdAndToolName') });
        }
        const result = await callMcpTool(body.serverId, body.toolName, body.args || {});
        logSystem('mcp_tool_call', { serverId: body.serverId, toolName: body.toolName, success: result.success });
        return jsonResponse(res, result.success ? 200 : 500, result);
      }
    }

    // ========== Skill 管理接口（仅 GET 路由） ==========

    // Skill 列表
    if (req.method === 'GET' && pathname === '/api/skill/list') {
      return jsonResponse(res, 200, getSkillList());
    }

    // Skill 详情
    if (req.method === 'GET' && pathname === '/api/skill/detail') {
      const name = url.searchParams.get('name');
      if (!name) return jsonResponse(res, 400, { success: false, error: t('error.missingName') });
      return jsonResponse(res, 200, getSkill(name));
    }

    // Agent Skill Prompts（用于 AI System Prompt 注入）
    if (req.method === 'GET' && pathname === '/api/skill/agent-prompts') {
      const prompts = getAgentSkillPrompts();
      return jsonResponse(res, 200, { success: true, prompts });
    }

    // 按需加载单个 Agent Skill 的完整内容
    if (req.method === 'GET' && pathname === '/api/skill/agent-prompt') {
      const skillName = url.searchParams.get('name');
      if (!skillName) return jsonResponse(res, 400, { success: false, error: t('error.missingName') });
      const result = getAgentSkillPrompt(skillName);
      return jsonResponse(res, result.success ? 200 : 404, result);
    }

    // Agent Skill 的 SKILL.md 内容
    if (req.method === 'GET' && pathname === '/api/skill/markdown') {
      const name = url.searchParams.get('name');
      if (!name) return jsonResponse(res, 400, { success: false, error: t('error.missingName') });
      const result = getSkill(name);
      if (!result.success) return jsonResponse(res, 404, result);
      const skill = result.skill;
      if (skill.type !== 'agent') {
        return jsonResponse(res, 400, { success: false, error: t('error.notAgentSkill') });
      }
      return jsonResponse(res, 200, {
        success: true,
        name: skill.name,
        markdown: skill.fullPrompt || skill.prompt || '',
        frontmatter: {
          name: skill.name,
          description: skill.description,
          version: skill.version,
          enabled: skill.enabled
        },
        resources: skill.resources || [],
        dirPath: skill.dirPath
      });
    }

    // Skill 资源文件内容
    if (req.method === 'GET' && pathname === '/api/skill/resource') {
      const name = url.searchParams.get('name');
      const resource = url.searchParams.get('resource');
      if (!name || !resource) {
        return jsonResponse(res, 400, { success: false, error: t('error.missingNameOrResource') });
      }
      const result = getSkill(name);
      if (!result.success) return jsonResponse(res, 404, result);
      const skill = result.skill;
      if (skill.type !== 'agent') {
        return jsonResponse(res, 400, { success: false, error: t('error.notAgentSkill') });
      }
      const resInfo = skill.resources?.find(r => r.name === resource);
      if (!resInfo) {
        return jsonResponse(res, 404, { success: false, error: t('error.resourceNotFound', { resource }) });
      }
      try {
        const content = await readFile(resInfo.path, 'utf-8');
        return jsonResponse(res, 200, { success: true, name: resource, content, size: resInfo.size });
      } catch (err) {
        return jsonResponse(res, 500, { success: false, error: t('error.readResourceFailed', { message: err.message }) });
      }
    }

    // ========== MCP 管理接口（仅 GET 路由） ==========

    // 回收站列表
    if (req.method === 'GET' && pathname === '/api/trash/list') {
      const result = await listTrash();
      return jsonResponse(res, 200, result);
    }

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
    jsonResponse(res, 404, { success: false, error: t('error.unknownApiPath') });
  }

  // 追踪所有活跃 socket 连接，用于优雅关闭时强制断开
  const activeSockets = new Set();

  server.on('connection', (socket) => {
    activeSockets.add(socket);
    socket.on('close', () => activeSockets.delete(socket));
  });

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

      // WebSocket 连接也同步语言到各子模块
      const wsLang = getRequestI18n(request).lang;
      setExecutorLang(wsLang);
      setSecurityLang(wsLang);
      setConfigLang(wsLang);

      // WebSocket 认证：优先用 Authorization Header；回退到 ?token= query 是因为
      // 浏览器 WebSocket API 不支持自定义 Header（插件端 new WebSocket() 无法设置 Header）。
      // 安全注意：query token 可能被代理日志/Referer 记录，故此处绝不将 token 写入任何日志。
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
          ws.send(JSON.stringify({ type: 'error', error: getRequestI18n(request).t('error.processNotFound'), execId }));
          // 进程已不存在，发送错误后关闭 WebSocket，避免客户端空等
          ws.close();
          return;
        }
        // 客户端断开时，从监听列表中移除；所有客户端都断开后取消超时
        ws.on('close', () => {
          disconnectWsClient(execId, ws);
        });
      });
    } else {
      socket.destroy();
    }
  });

  // Start server
  server.on('error', (err) => {
    console.error(`[Agent] ${ln('serverError')}:`, err.message);
    logError('system', 'server_error', { message: err.message, code: err.code });
    if (err.code === 'EADDRINUSE') {
      console.error(`[Agent] ${ln('portInUse')}`);
      process.exit(1);
    }
  });

  server.listen(port, host, () => {
    console.log(`[Agent] ${ln('httpStarted', { host, port })}`);
    console.log(`[Agent] ${ln('wsStarted', { host, port })}`);

    // 同步 server 级语言到各子模块，确保启动日志语言一致（--lang / AI_HELPER_LANG / 系统检测）
    setLoggerLocale(serverLang);
    setAuthLang(serverLang);
    setTrashLang(serverLang);
    setConfigLang(serverLang);
    setExecutorLang(serverLang);
    setSecurityLang(serverLang);
    setSearchLang(serverLang);
    setSkillLoaderLang(serverLang);
    setSkillRegistryLang(serverLang);
    setSkillExecutorLang(serverLang);
    setMarkdownLoaderLang(serverLang);
    setMcpRegistryLang(serverLang);
    setMcpClientLang(serverLang);

    startPairCodeRotation();

    // 启动回收站定期清理（每6小时）+ 启动时清理一次过期文件
    startPeriodicCleanup();

    // 后台异步初始化 MCP 和 Skill，不阻塞主流程
    (async () => {
      try {
        await initializeMcpRegistry();
      } catch (err) {
        console.error(`[Agent] ${ln('mcpInitFailed')}:`, err.message);
      }

      try {
        await initializeSkillRegistry();
        startSkillDirWatcher();
      } catch (err) {
        console.error(`[Agent] ${ln('skillInitFailed')}:`, err.message);
      }
    })();
  });

  /**
   * 监听技能目录（~/.ai-helper-agent/skills/）的文件变更，
   * 当对话中通过写文件创建/更新技能后，自动重新扫描并加载，无需手动「重新加载」。
   */
  let skillDirWatchTimer = null;
  let skillDirWatcher = null;
  function startSkillDirWatcher() {
    try {
      const dir = getSkillsDir();
      if (!existsSync(dir)) return;
      skillDirWatcher = watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        // 仅关心 SKILL.md / _meta.json 等技能相关文件变更
        if (!/\.md$|\.json$/.test(filename)) return;
        if (skillDirWatchTimer) clearTimeout(skillDirWatchTimer);
        skillDirWatchTimer = setTimeout(async () => {
          try {
            await reloadSkills();
            logSystem('skill_auto_reload', { reason: 'dir_change', file: filename });
          } catch (err) {
            console.error(`[Agent] Skill auto-reload failed:`, err.message);
          }
        }, 800);
      });
      skillDirWatcher.on('error', (err) => {
        console.warn(`[Agent] Skill dir watcher error:`, err.message);
      });
    } catch (err) {
      console.warn(`[Agent] Failed to start skill dir watcher:`, err.message);
    }
  }

  // 优雅关闭（异步 + 防并发 + 超时兜底）
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Agent] ${ln('shuttingDown')}`);

    // Timeout safety: force exit after 10s to prevent server.close() from hanging
    const forceExitTimer = setTimeout(() => {
      console.log(`[Agent] ${ln('gracefulShutdownTimeout')}`);
      process.exit(1);
    }, 10000);
    forceExitTimer.unref();

    stopPairCodeRotation();
    stopPeriodicCleanup();

    // 终止所有运行中的进程
    for (const entry of getRunningProcesses()) {
      killProcess(entry.execId);
    }

    // 关闭所有 MCP 连接
    try { await shutdownMcpRegistry(); } catch {}

    // 强制断开所有 WebSocket 客户端
    wss.clients.forEach((client) => {
      try { client.terminate(); } catch {}
    });

    // 强制销毁所有活跃 HTTP socket，避免 server.close() 挂起等待
    for (const socket of activeSockets) {
      try { socket.destroy(); } catch {}
    }

    // 等待 server 和 wss 关闭
    await Promise.all([
      new Promise(resolve => server.close(resolve)),
      new Promise(resolve => wss.close(resolve))
    ]);

    // 清理 PID 文件
    try { if (await exists(PID_FILE)) await unlink(PID_FILE); } catch {}

    clearTimeout(forceExitTimer);
    logSystem('server_stop', { reason: 'shutdown' });
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 全局崩溃防护：捕获未处理的异常，记录日志但不退出进程
  if (process.listenerCount('uncaughtException') === 0) {
    process.on('uncaughtException', (err) => {
      console.error(`[Agent] ${ln('uncaughtException')}:`, err);
      logError('system', 'uncaught_exception', { message: err.message, stack: err.stack });
    });
  }

  if (process.listenerCount('unhandledRejection') === 0) {
    process.on('unhandledRejection', (reason) => {
      console.error(`[Agent] ${ln('unhandledRejection')}:`, reason);
      logError('system', 'unhandled_rejection', { message: reason?.message || String(reason), stack: reason?.stack });
    });
  }

  return { server, wss, shutdown };
}
