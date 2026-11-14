// agent/src/search.js - 文件搜索（fd/rg 优先 + Node.js 回退）
import { spawn } from 'child_process';
import { readdir, stat, readFile } from 'fs/promises';
import { statSync } from 'fs';
import { join, basename, extname, resolve, isAbsolute, relative, sep } from 'path';
import { checkPath } from './security.js';
import { t as translate } from './i18n.js';

// 默认使用 zh 语言（独立调用场景）；server.js 调用时会传入 req 的 lang
let currentLang = 'zh';

/**
 * 设置 search 模块当前使用的语言（由 server.js 在请求入口处调用）
 * @param {string} lang - 语言代码（'zh' | 'en'）
 */
export function setSearchLang(lang) {
  if (lang) currentLang = lang;
}

/**
 * 翻译辅助：使用当前模块语言或传入的 t 函数
 * @param {string} key - 翻译 key
 * @param {object} [params] - 插值参数
 * @param {Function} [tFn] - 可选的 t 函数（优先使用）
 * @returns {string}
 */
function tr(key, params, tFn) {
  if (typeof tFn === 'function') return tFn(key, params);
  return translate(currentLang, key, params);
}

// 缓存检测结果，避免每次启动重复检测
let fdAvailable = null;
let rgAvailable = null;

/**
 * 检测系统是否安装了 fd（快速文件搜索，带 5s 超时）
 */
function checkFdAvailable() {
  return new Promise((resolve) => {
    const proc = spawn('fd', ['--version'], { stdio: 'ignore', windowsHide: true });
    const timeout = setTimeout(() => { proc.kill(); resolve(false); }, 5000);
    proc.on('close', (code) => { clearTimeout(timeout); resolve(code === 0); });
    proc.on('error', () => { clearTimeout(timeout); resolve(false); });
  });
}

/**
 * 检测系统是否安装了 rg（ripgrep 快速内容搜索，带 5s 超时）
 */
function checkRgAvailable() {
  return new Promise((resolve) => {
    const proc = spawn('rg', ['--version'], { stdio: 'ignore', windowsHide: true });
    const timeout = setTimeout(() => { proc.kill(); resolve(false); }, 5000);
    proc.on('close', (code) => { clearTimeout(timeout); resolve(code === 0); });
    proc.on('error', () => { clearTimeout(timeout); resolve(false); });
  });
}

/**
 * 初始化检测 fd/rg 可用性（仅允许单次初始化）
 */
let searchToolsInitPromise = null;

export async function initSearchTools() {
  if (searchToolsInitPromise) return searchToolsInitPromise;
  searchToolsInitPromise = (async () => {
    const [fd, rg] = await Promise.all([checkFdAvailable(), checkRgAvailable()]);
    fdAvailable = fd;
    rgAvailable = rg;
    return { fd: fdAvailable, rg: rgAvailable };
  })();
  return searchToolsInitPromise;
}

/**
 * 获取搜索工具可用性
 */
export function getSearchToolsAvailable() {
  return { fd: fdAvailable, rg: rgAvailable };
}

// 默认忽略的目录（模拟 .gitignore 行为）
const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg',
  '__pycache__', '.cache', 'dist', 'build',
  '.next', '.nuxt', 'target', 'vendor',
  '.idea', '.vscode', '.DS_Store'
]);

/**
 * 命中任一排除 glob 时返回 true（用于回退实现，fd/rg 由原生参数处理）
 * 支持目录型 glob（`dist/**`）与路径型 glob（`src/*.js`），与 fd/rg 语义对齐
 */
function isExcludedPath(relPath, name, excludeGlobs) {
  if (!Array.isArray(excludeGlobs)) return false;
  const normalized = relPath.split(sep).join('/');
  return excludeGlobs.some((glob) => {
    const stripped = glob.replace(/\/\*\*$/, '');
    if (stripped !== glob) {
      // 目录型 glob：命中目录自身或其下任意层级
      return normalized === stripped || normalized.startsWith(`${stripped}/`);
    }
    return matchGlob(name, glob) || matchGlob(normalized, glob);
  });
}

/**
 * 文件名模式匹配（支持 glob：*.js, test*.ts, ** / *.js 等）
 */
function matchGlob(filename, pattern) {
  // 转换 glob 为简单正则
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<<ANY>>>')  // 先保护 **
    .replace(/\*/g, '[^/]*')
    .replace(/<<<ANY>>>/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp('^' + regexStr + '$', 'i');
  return regex.test(filename);
}

/**
 * 使用 fd 搜索文件和目录（快速）
 */
function searchWithFd(rootPath, filePattern, recursive, maxResults, excludeGlobs = []) {
  return new Promise((resolve) => {
    const args = ['--glob', filePattern, '--type', 'f', '--type', 'd', '--max-results', String(maxResults)];
    // 排除默认忽略的目录
    for (const dir of DEFAULT_IGNORE_DIRS) {
      args.push('--exclude', dir);
    }
    // 调用方指定的排除 glob（fd 按名字匹配，目录型 glob 需去掉尾部 /**）
    for (const glob of excludeGlobs) {
      args.push('--exclude', glob.replace(/\/\*\*$/, ''));
    }
    if (!recursive) args.push('--max-depth', '1');
    args.push(rootPath);

    const proc = spawn('fd', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const stdout = [];
    const stderr = [];
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill();
      resolve([]);
    }, 30000);

    proc.stdout.on('data', (chunk) => stdout.push(chunk));
    proc.stderr.on('data', (chunk) => stderr.push(chunk));

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) return;
      const output = Buffer.concat(stdout).toString('utf-8').trim();
      const lines = output ? output.split('\n').filter(Boolean) : [];
      const results = lines.map(p => {
        const absPath = isAbsolute(p) ? p : join(rootPath, p);
        try {
          const s = statSync(absPath);
          return { path: absPath, name: basename(p), type: s.isDirectory() ? 'directory' : 'file', size: s.size, mtime: s.mtimeMs };
        } catch {
          return { path: absPath, name: basename(p), type: 'file', size: 0, mtime: 0 };
        }
      });
      resolve(results);
    });

    proc.on('error', () => { clearTimeout(timeout); resolve([]); });
  });
}

/**
 * 让出事件循环，防止长时间同步操作阻塞其他请求
 */
function yieldEventLoop() {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Node.js 原生递归搜索文件和目录（回退方案，异步 + 分片防止阻塞事件循环）
 */
async function searchFilesNative(rootPath, filePattern, recursive, maxResults, excludeGlobs = []) {
  const results = [];

  async function walk(dir, depth) {
    if (results.length >= maxResults) return;
    if (!recursive && depth > 1) return;

    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }

    // 每处理一个目录后让出事件循环
    await yieldEventLoop();

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;
        if (isExcludedPath(relative(rootPath, fullPath), entry.name, excludeGlobs)) continue;
        // 目录也参与搜索匹配
        if (matchGlob(entry.name, filePattern)) {
          try {
            const s = await stat(fullPath);
            results.push({ path: fullPath, name: entry.name, type: 'directory', size: s.size, mtime: s.mtimeMs });
          } catch {
            results.push({ path: fullPath, name: entry.name, type: 'directory', size: 0, mtime: 0 });
          }
        }
        await walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        if (isExcludedPath(relative(rootPath, fullPath), entry.name, excludeGlobs)) continue;
        if (matchGlob(entry.name, filePattern)) {
          try {
            const s = await stat(fullPath);
            results.push({ path: fullPath, name: entry.name, type: 'file', size: s.size, mtime: s.mtimeMs });
          } catch {
            results.push({ path: fullPath, name: entry.name, type: 'file', size: 0, mtime: 0 });
          }
        }
      }
    }
  }

  await walk(rootPath, 0);
  return results;
}

/**
 * 搜索文件（按文件名模式）
 * @param {string} rootPath - 搜索根目录
 * @param {string} filePattern - 文件名模式（glob），如 "*.js"
 * @param {boolean} recursive - 是否递归
 * @param {number} maxResults - 最大结果数
 * @param {Function} [tFn] - 可选的翻译函数（由 server.js 传入）
 * @param {string[]} [excludeGlobs] - 排除的 glob 列表
 * @returns {Array<{path, name, size, mtime}>}
 */
export async function searchFiles(rootPath, filePattern = '*', recursive = true, maxResults = 200, tFn, ctx = {}, excludeGlobs = []) {
  const pathCheck = await checkPath(rootPath, tFn, ctx);
  if (!pathCheck.allowed) {
    return { success: false, error: pathCheck.reason };
  }

  const resolved = pathCheck.resolved;
  try {
    await stat(resolved);
  } catch {
    return { success: false, error: tr('search.pathNotExist', undefined, tFn) };
  }

  const s = await stat(resolved);
  if (!s.isDirectory()) {
    return { success: false, error: tr('search.pathNotDir', undefined, tFn) };
  }

  // 按 mtime 倒序需要先在更大的集合里取，否则 fd 的预截断会让“最新文件”被随机排除
  const fetchLimit = Math.min(Math.max(maxResults * 5, 500), 5000);
  let raw;
  if (fdAvailable) {
    raw = await searchWithFd(resolved, filePattern, recursive, fetchLimit, excludeGlobs);
  } else {
    raw = await searchFilesNative(resolved, filePattern, recursive, fetchLimit, excludeGlobs);
  }
  raw.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));

  const truncated = raw.length > maxResults;
  const results = truncated ? raw.slice(0, maxResults) : raw;

  return {
    success: true,
    results,
    total: results.length,
    truncated,
    engine: fdAvailable ? 'fd' : 'nodejs',
    path: resolved,
    pattern: filePattern
  };
}

/**
 * 使用 rg 搜索文件内容（快速）
 */
function searchContentWithRg(rootPath, pattern, filePattern, caseSensitive, recursive, maxResults, contextLines, excludeGlobs = []) {
  return new Promise((resolve) => {
    const args = [
      // --json 输出结构化事件，避免从文本行里区分「匹配行 / 上下文行」时的歧义
      '--json',
      // --max-count 是「每个文件」的上限；总量在调用方统一截断
      '--max-count', String(maxResults + 1)
    ];
    if (contextLines > 0) {
      args.push('-C', String(contextLines));
    }
    // 大小写不敏感时添加 -i（与 searchContentNative 的 caseSensitive 语义对齐）
    if (!caseSensitive) {
      args.push('-i');
    }
    // 非递归搜索：仅搜索直接子文件，不进入子目录（与 fd --max-depth 1 语义一致）
    if (!recursive) {
      args.push('--max-depth', '1');
    }
    if (filePattern) {
      args.push('--glob', filePattern);
    }
    // 默认忽略目录与 fd / Node 回退保持一致，不单纯依赖 .gitignore
    for (const dir of DEFAULT_IGNORE_DIRS) {
      args.push('--glob', `!**/${dir}`);
      args.push('--glob', `!**/${dir}/**`);
    }
    // 调用方指定的排除 glob：同时覆盖 `dist/**` 与 `dist` 两种写法
    for (const glob of excludeGlobs) {
      args.push('--glob', `!${glob}`);
      const stripped = glob.replace(/\/\*\*$/, '');
      if (stripped !== glob) {
        args.push('--glob', `!**/${stripped}/**`);
      }
    }
    // -e 显式指定模式，避免以 "-" 开头的 pattern 被当成命令行参数
    args.push('-e', pattern, rootPath);

    const proc = spawn('rg', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const stdout = [];
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill();
      resolve([]);
    }, 30000);

    proc.stdout.on('data', (chunk) => stdout.push(chunk));

    proc.on('close', () => {
      clearTimeout(timeout);
      if (timedOut) return;
      // 不再按退出码过滤：Windows 下 rg 可能返回退出码 2（错误）但仍带有效匹配结果，
      // 原逻辑 `code !== 0 && code !== 1` 会把这种情况的输出一并丢弃，导致有匹配却返回 0 条。
      // 只要 stdout 有内容就解析；stdout 为空时 parseRgJsonOutput 自然返回 []。
      const output = Buffer.concat(stdout).toString('utf-8').trim();
      resolve(parseRgJsonOutput(output, contextLines));
    });

    proc.on('error', () => { clearTimeout(timeout); resolve([]); });
  });
}

/**
 * 解析 rg --json 输出（每行一个事件）：
 *   match / context 事件都带 path、line_number、lines.text
 * 先按文件收集行内容，再以命中的行号为基准取上下文窗口，
 * 避免把内容里的 `:数字:` 误判成新的匹配行。
 * 上下文结构与 Node.js 回退一致：context: [{ line, content, isMatch }]
 */
function parseRgJsonOutput(output, contextLines) {
  if (!output) return [];

  const linesByFile = new Map(); // file -> Map<line, { content, isMatch }>
  const matches = [];

  for (const raw of output.split('\n')) {
    if (!raw) continue;
    let evt;
    try {
      evt = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!evt || (evt.type !== 'match' && evt.type !== 'context')) continue;

    const data = evt.data || {};
    const file = data.path && data.path.text;
    const line = data.line_number;
    if (!file || !line) continue;

    const content = ((data.lines && data.lines.text) || '').replace(/\n$/, '');
    if (!linesByFile.has(file)) linesByFile.set(file, new Map());
    linesByFile.get(file).set(line, { content, isMatch: evt.type === 'match' });

    if (evt.type === 'match') matches.push({ file, line });
  }

  return matches.map(({ file, line }) => {
    const map = linesByFile.get(file);
    const item = { file, line, content: map.get(line).content };
    if (contextLines > 0) {
      const ctx = [];
      for (let l = line - contextLines; l <= line + contextLines; l++) {
        const entry = map.get(l);
        if (entry) ctx.push({ line: l, content: entry.content, isMatch: l === line });
      }
      item.context = ctx;
    }
    return item;
  });
}

/**
 * Node.js 原生搜索文件内容（回退方案，异步 + 分片防止阻塞事件循环）
 */
async function searchContentNative(rootPath, pattern, filePattern, caseSensitive, recursive, maxResults, contextLines, excludeGlobs = []) {
  const results = [];
  const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();

  async function walk(dir) {
    if (results.length >= maxResults) return;

    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }

    // 每处理一个目录后让出事件循环
    await yieldEventLoop();

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;
        if (isExcludedPath(relative(rootPath, fullPath), entry.name, excludeGlobs)) continue;
        // 非递归搜索：跳过子目录，仅搜索当前目录下的文件
        if (!recursive) continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (isExcludedPath(relative(rootPath, fullPath), entry.name, excludeGlobs)) continue;
        if (filePattern && !matchGlob(entry.name, filePattern)) continue;
        // 跳过压缩和映射文件
        if (entry.name.endsWith('.min.js')) continue;
        if (entry.name.endsWith('.map')) continue;

        try {
          const s = await stat(fullPath);
          if (s.size > 1024 * 1024) continue; // 跳过 1MB 以上的文件

          const content = await readFile(fullPath, 'utf-8');
          const fileLines = content.split('\n');

          for (let i = 0; i < fileLines.length; i++) {
            if (results.length >= maxResults) break;
            const line = caseSensitive ? fileLines[i] : fileLines[i].toLowerCase();
            if (line.includes(searchPattern)) {
              const item = {
                file: fullPath,
                line: i + 1,
                content: fileLines[i]
              };
              if (contextLines > 0) {
                const ctx = [];
                const start = Math.max(0, i - contextLines);
                const end = Math.min(fileLines.length - 1, i + contextLines);
                for (let j = start; j <= end; j++) {
                  ctx.push({ line: j + 1, content: fileLines[j], isMatch: j === i });
                }
                item.context = ctx;
              }
              results.push(item);
            }
          }
        } catch {}
      }
    }
  }

  await walk(rootPath);
  return results;
}

/**
 * 搜索文件内容
 * @param {string} rootPath - 搜索根目录
 * @param {string} pattern - 搜索文本
 * @param {string} [filePattern] - 可选文件类型过滤，如 "*.js"
 * @param {boolean} caseSensitive - 是否大小写敏感
 * @param {boolean} recursive - 是否递归搜索子目录
 * @param {number} maxResults - 最大结果数
 * @param {number} contextLines - 上下文行数（0-5）
 * @param {Function} [tFn] - 可选的翻译函数（由 server.js 传入）
 * @param {string[]} [excludeGlobs] - 排除的 glob 列表
 * @returns {{ success: boolean, results: Array, total: number, truncated: boolean, engine: string }}
 */
export async function searchContent(rootPath, pattern, filePattern = null, caseSensitive = false, recursive = true, maxResults = 100, contextLines = 0, tFn, ctx = {}, excludeGlobs = []) {
  const pathCheck = await checkPath(rootPath, tFn, ctx);
  if (!pathCheck.allowed) {
    return { success: false, error: pathCheck.reason };
  }

  const resolved = pathCheck.resolved;
  try {
    await stat(resolved);
  } catch {
    return { success: false, error: tr('search.pathNotExist', undefined, tFn) };
  }

  if (!pattern || !pattern.trim()) {
    return { success: false, error: tr('search.emptyPattern', undefined, tFn) };
  }

  const ctxLines = Math.max(0, Math.min(Number(contextLines) || 0, 5));

  let raw;
  if (rgAvailable) {
    raw = await searchContentWithRg(resolved, pattern, filePattern, caseSensitive, recursive, maxResults + 1, ctxLines, excludeGlobs);
  } else {
    raw = await searchContentNative(resolved, pattern, filePattern, caseSensitive, recursive, maxResults + 1, ctxLines, excludeGlobs);
  }

  // 统一按总量截断（rg 的 --max-count 只是单文件上限）
  const truncated = raw.length > maxResults;
  const results = truncated ? raw.slice(0, maxResults) : raw;

  return {
    success: true,
    results,
    total: results.length,
    truncated,
    engine: rgAvailable ? 'rg' : 'nodejs',
    path: resolved,
    pattern
  };
}
