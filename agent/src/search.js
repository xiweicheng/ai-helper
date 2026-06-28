// agent/src/search.js - 文件搜索（fd/rg 优先 + Node.js 回退）
import { spawn } from 'child_process';
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, basename, extname, resolve } from 'path';
import { checkPath } from './security.js';

// 缓存检测结果，避免每次启动重复检测
let fdAvailable = null;
let rgAvailable = null;

/**
 * 检测系统是否安装了 fd（快速文件搜索）
 */
function checkFdAvailable() {
  return new Promise((resolve) => {
    const proc = spawn('fd', ['--version'], { stdio: 'ignore' });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * 检测系统是否安装了 rg（ripgrep 快速内容搜索）
 */
function checkRgAvailable() {
  return new Promise((resolve) => {
    const proc = spawn('rg', ['--version'], { stdio: 'ignore' });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * 初始化检测 fd/rg 可用性
 */
export async function initSearchTools() {
  const [fd, rg] = await Promise.all([checkFdAvailable(), checkRgAvailable()]);
  fdAvailable = fd;
  rgAvailable = rg;
  console.log(`[Agent] fd (文件搜索): ${fd ? '✅ 可用' : '❌ 未安装，使用 Node.js 回退'}`);
  console.log(`[Agent] rg (内容搜索): ${rg ? '✅ 可用' : '❌ 未安装，使用 Node.js 回退'}`);
  return { fd: fdAvailable, rg: rgAvailable };
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
 * 文件名模式匹配（支持 glob：*.js, test*.ts, **/*.js 等）
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
 * 使用 fd 搜索文件（快速）
 */
function searchWithFd(rootPath, filePattern, recursive, maxResults) {
  return new Promise((resolve) => {
    const args = ['--glob', filePattern, '--type', 'f', '--max-results', String(maxResults)];
    if (!recursive) args.push('--max-depth', '1');
    args.push(rootPath);

    const proc = spawn('fd', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];

    proc.stdout.on('data', (chunk) => stdout.push(chunk));
    proc.stderr.on('data', (chunk) => stderr.push(chunk));

    proc.on('close', (code) => {
      const output = Buffer.concat(stdout).toString('utf-8').trim();
      const lines = output ? output.split('\n').filter(Boolean) : [];
      const results = lines.map(p => {
        try {
          const s = statSync(p);
          return { path: p, name: basename(p), size: s.size, mtime: s.mtimeMs };
        } catch {
          return { path: p, name: basename(p), size: 0, mtime: 0 };
        }
      });
      resolve(results);
    });

    proc.on('error', () => resolve([]));
    setTimeout(() => { proc.kill(); resolve([]); }, 30000);
  });
}

/**
 * Node.js 原生递归搜索文件（回退方案）
 */
function searchFilesNative(rootPath, filePattern, recursive, maxResults) {
  const results = [];

  function walk(dir, depth) {
    if (results.length >= maxResults) return;
    if (!recursive && depth > 1) return;

    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        if (matchGlob(entry.name, filePattern)) {
          try {
            const s = statSync(fullPath);
            results.push({ path: fullPath, name: entry.name, size: s.size, mtime: s.mtimeMs });
          } catch {
            results.push({ path: fullPath, name: entry.name, size: 0, mtime: 0 });
          }
        }
      }
    }
  }

  walk(rootPath, 0);
  return results;
}

/**
 * 搜索文件（按文件名模式）
 * @param {string} rootPath - 搜索根目录
 * @param {string} filePattern - 文件名模式（glob），如 "*.js"
 * @param {boolean} recursive - 是否递归
 * @param {number} maxResults - 最大结果数
 * @returns {Array<{path, name, size, mtime}>}
 */
export async function searchFiles(rootPath, filePattern = '*', recursive = true, maxResults = 200) {
  const pathCheck = checkPath(rootPath);
  if (!pathCheck.allowed) {
    return { success: false, error: pathCheck.reason };
  }

  const resolved = pathCheck.resolved;
  if (!existsSync(resolved)) {
    return { success: false, error: '搜索路径不存在' };
  }

  const s = statSync(resolved);
  if (!s.isDirectory()) {
    return { success: false, error: '搜索路径不是目录' };
  }

  let results;
  if (fdAvailable) {
    results = await searchWithFd(resolved, filePattern, recursive, maxResults);
  } else {
    results = searchFilesNative(resolved, filePattern, recursive, maxResults);
  }

  return {
    success: true,
    results,
    total: results.length,
    engine: fdAvailable ? 'fd' : 'nodejs',
    path: resolved,
    pattern: filePattern
  };
}

/**
 * 使用 rg 搜索文件内容（快速）
 */
function searchContentWithRg(rootPath, pattern, filePattern, maxResults, contextLines) {
  return new Promise((resolve) => {
    const args = [
      '--no-heading', '--line-number',
      '--max-count', String(maxResults),
      '-C', String(contextLines)
    ];
    if (filePattern) {
      args.push('--glob', filePattern);
    }
    args.push(pattern, rootPath);

    const proc = spawn('rg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    let killed = false;

    proc.stdout.on('data', (chunk) => stdout.push(chunk));

    proc.on('close', (code) => {
      if (code !== 0 && code !== 1) { resolve([]); return; } // 1 = no matches
      const output = Buffer.concat(stdout).toString('utf-8').trim();
      resolve(parseRgOutput(output, contextLines));
    });

    proc.on('error', () => resolve([]));
    setTimeout(() => { proc.kill(); killed = true; resolve([]); }, 30000);
  });
}

/**
 * 解析 rg 输出格式：file:line:content
 * 上下文行格式：file-line:content
 */
function parseRgOutput(output, contextLines) {
  if (!output) return [];
  const lines = output.split('\n');
  const results = [];

  for (const line of lines) {
    // 匹配行分隔符（rg 用 -- 分隔不同文件的匹配）
    if (line === '--') continue;

    // 匹配文件名:行号:内容
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (match) {
      results.push({
        file: match[1],
        line: parseInt(match[2], 10),
        content: match[3]
      });
    }
  }

  return results;
}

/**
 * Node.js 原生搜索文件内容（回退方案）
 */
function searchContentNative(rootPath, pattern, filePattern, caseSensitive, maxResults, contextLines) {
  const results = [];
  const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();

  function walk(dir) {
    if (results.length >= maxResults) return;

    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (filePattern && !matchGlob(entry.name, filePattern)) continue;
        // 跳过二进制和超大文件
        if (entry.name.endsWith('.min.js')) continue;
        if (entry.name.endsWith('.map')) continue;

        try {
          const s = statSync(fullPath);
          if (s.size > 1024 * 1024) continue; // 跳过 1MB 以上的文件

          const content = readFileSync(fullPath, 'utf-8');
          const fileLines = content.split('\n');

          for (let i = 0; i < fileLines.length; i++) {
            if (results.length >= maxResults) break;
            const line = caseSensitive ? fileLines[i] : fileLines[i].toLowerCase();
            if (line.includes(searchPattern)) {
              const ctx = [];
              const start = Math.max(0, i - contextLines);
              const end = Math.min(fileLines.length - 1, i + contextLines);
              for (let j = start; j <= end; j++) {
                ctx.push({ line: j + 1, content: fileLines[j], isMatch: j === i });
              }
              results.push({
                file: fullPath,
                line: i + 1,
                content: fileLines[i],
                context: ctx
              });
            }
          }
        } catch {}
      }
    }
  }

  walk(rootPath);
  return results;
}

/**
 * 搜索文件内容
 * @param {string} rootPath - 搜索根目录
 * @param {string} pattern - 搜索文本
 * @param {string} [filePattern] - 可选文件类型过滤，如 "*.js"
 * @param {boolean} caseSensitive - 是否大小写敏感
 * @param {number} maxResults - 最大结果数
 * @param {number} contextLines - 上下文行数
 * @returns {{ success: boolean, results: Array, total: number, engine: string }}
 */
export async function searchContent(rootPath, pattern, filePattern = null, caseSensitive = false, maxResults = 100, contextLines = 2) {
  const pathCheck = checkPath(rootPath);
  if (!pathCheck.allowed) {
    return { success: false, error: pathCheck.reason };
  }

  const resolved = pathCheck.resolved;
  if (!existsSync(resolved)) {
    return { success: false, error: '搜索路径不存在' };
  }

  if (!pattern || !pattern.trim()) {
    return { success: false, error: '搜索内容不能为空' };
  }

  let results;
  if (rgAvailable) {
    results = await searchContentWithRg(resolved, pattern, filePattern, maxResults, contextLines);
  } else {
    results = searchContentNative(resolved, pattern, filePattern, caseSensitive, maxResults, contextLines);
  }

  return {
    success: true,
    results,
    total: results.length,
    engine: rgAvailable ? 'rg' : 'nodejs',
    path: resolved,
    pattern
  };
}