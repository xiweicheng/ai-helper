// artifacts-manager.js - 任务文件产物管理
// 从任务执行日志（executionLog）中提取写文件操作，集中展示和管理产物文件。
// 提供定位到工作目录文件、预览文件等功能。

import { t, registerTranslations } from '../shared/i18n.js';
import { supportsPreview, getFileIcon, downloadFileStream, downloadFilesStream } from './workspace-manager.js';
import { locateFileInWorkspace, previewArtifactFile, closeWorkspacePreview, resolveWorkspaceAbsolutePath } from './workspace-panel.js';
import { showToast, copyToClipboard } from './utils.js';
import logger from '../shared/logger.js';

// ============================================================
// 国际化
// ============================================================
registerTranslations('zh', {
  artifacts: {
    btnTitle: '文件产物（{count}）',
    modalTitle: '本次任务的文件产物',
    emptyHint: '本次任务没有产生文件产物',
    fileCol: '文件',
    sizeCol: '大小',
    typeCol: '类型',
    timeCol: '时间',
    actionCol: '操作',
    locate: '定位到文件',
    preview: '预览',
    closeBtn: '关闭',
    typeWrite: '写入',
    typeDelete: '删除',
    typeCreate: '创建',
    typeEdit: '编辑',
    typeOther: '操作',
    noWorkspace: '无法获取工作目录，请确认 Agent 已连接',
    locateFailed: '定位文件失败',
    fileNotFound: '目录已定位，但未找到该文件（可能已被删除）',
    previewFailed: '预览文件失败',
    previewNotSupported: '此文件类型不支持预览',
    totalCount: '共 {count} 个文件',
    badgeLabel: '产物',
    download: '下载',
    downloadFailed: '下载失败',
    copyFileName: '复制文件名',
    copyFilePath: '复制文件路径',
    copiedName: '已复制文件名：{name}',
    copiedPath: '已复制文件路径',
    dblClickHint: '双击文件名可预览',
    sortHint: '点击排序',
    serialCol: '序号',
    deletedBadge: '已删除',
    deletedFile: '文件已删除',
    deletedCount: '{count} 个已删除',
  },
});

registerTranslations('en', {
  artifacts: {
    btnTitle: 'Artifacts ({count})',
    modalTitle: 'File Artifacts of This Task',
    emptyHint: 'No file artifacts produced in this task',
    fileCol: 'File',
    sizeCol: 'Size',
    typeCol: 'Type',
    timeCol: 'Time',
    actionCol: 'Actions',
    locate: 'Locate File',
    preview: 'Preview',
    closeBtn: 'Close',
    typeWrite: 'Write',
    typeDelete: 'Delete',
    typeCreate: 'Create',
    typeEdit: 'Edit',
    typeOther: 'Op',
    noWorkspace: 'Unable to access working directory. Please confirm the Agent is connected.',
    locateFailed: 'Failed to locate file',
    fileNotFound: 'Directory located, but file not found (may have been deleted)',
    previewFailed: 'Failed to preview file',
    previewNotSupported: 'Preview not supported for this file type',
    totalCount: '{count} files in total',
    badgeLabel: 'Artifacts',
    download: 'Download',
    downloadFailed: 'Download failed',
    copyFileName: 'Copy File Name',
    copyFilePath: 'Copy File Path',
    copiedName: 'Copied file name: {name}',
    copiedPath: 'File path copied',
    dblClickHint: 'Double-click to preview',
    sortHint: 'Click to sort',
    serialCol: '#',
    deletedBadge: 'Deleted',
    deletedFile: 'File deleted',
    deletedCount: '{count} deleted',
  },
});

// ============================================================
// 产物提取：从 executionLog 中解析写文件操作
// ============================================================

/**
 * 规范化路径
 */
function normalizePath(p) {
  return (p || '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

/**
 * 从文件路径提取文件名
 */
function getFileName(filePath) {
  if (!filePath) return '';
  const normalized = normalizePath(filePath);
  const parts = normalized.split('/');
  return parts[parts.length - 1] || '';
}

/**
 * 从文件路径提取扩展名（小写）
 */
function getFileExt(filePath) {
  if (!filePath) return '';
  const name = getFileName(filePath);
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.substring(idx + 1).toLowerCase() : '';
}

/**
 * HTML 转义（防注入）
 */
function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// Bash 花括号扩展解析
// ============================================================

/**
 * 按分隔符拆分字符串，但忽略嵌套在花括号 {} 内部的分隔符
 * 例: splitTopLevel('dir/{a,b} x', ' \t') → ['dir/{a,b}', 'x']
 *     splitTopLevel('a,{b,c},d', ',') → ['a', '{b,c}', 'd']
 * @param {string} s - 输入字符串
 * @param {string} separators - 分隔符集合（每个字符都是一个分隔符）
 * @returns {string[]}
 */
function splitTopLevel(s, separators) {
  const sepSet = new Set(separators);
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of s) {
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    if (depth === 0 && sepSet.has(ch)) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * 递归解析花括号扩展（兼容 Bash 语义）
 * 支持:
 *   {a,b}        → a, b
 *   pre{a,b}post → preapost, prebpost
 *   {a,b}{c,d}   → ac, ad, bc, bd（多层嵌套）
 *   {single}     → {single}（无逗号不展开）
 * @param {string} str - 输入字符串
 * @returns {string[]}
 */
function expandBraces(str) {
  const firstOpen = str.indexOf('{');
  if (firstOpen === -1) return [str];

  // 找到与第一个 { 匹配的 }
  let depth = 0;
  let firstClose = -1;
  for (let i = firstOpen; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) {
        firstClose = i;
        break;
      }
    }
  }
  // 括号不匹配，不做展开
  if (firstClose === -1) return [str];

  const prefix = str.substring(0, firstOpen);
  const inner = str.substring(firstOpen + 1, firstClose);
  const suffix = str.substring(firstClose + 1);

  const options = splitTopLevel(inner, ',').map(o => o.trim());
  // 无逗号 → 不展开（如 {single}）
  if (options.length <= 1) return [str];

  const results = [];
  for (const opt of options) {
    // 每个选项内部也可能包含嵌套的花括号
    for (const expandedOpt of expandBraces(opt)) {
      for (const tail of expandBraces(suffix)) {
        results.push(prefix + expandedOpt + tail);
      }
    }
  }
  return results;
}

/**
 * 批量处理路径数组：先展开花括号，再调用 resolveFn 解析为绝对路径（去重）
 * @param {string[]} paths - 原始路径数组（可能含花括号扩展）
 * @param {function} resolveFn - 解析函数 (rawPath: string) => string
 * @returns {string[]} - 展开并解析后的绝对路径列表
 */
function expandAndResolvePaths(paths, resolveFn) {
  const results = [];
  const seen = new Set();
  for (const p of paths) {
    if (!p) continue;
    for (const expanded of expandBraces(p)) {
      if (!expanded) continue;
      const resolved = resolveFn(expanded);
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);
      results.push(resolved);
    }
  }
  return results;
}

/**
 * 从 observation 中尝试解析出路径
 * @param {string|object} observation
 * @returns {string|null}
 */
function extractPathFromObservation(observation) {
  if (!observation) return null;
  let obs = observation;
  if (typeof obs === 'string') {
    try {
      obs = JSON.parse(obs);
    } catch {
      // 非 JSON 字符串，尝试正则提取路径
      const match = obs.match(/["']?path["']?\s*[:=]\s*["']([^"']+)["']/i);
      if (match) return match[1];
      return null;
    }
  }
  if (obs && typeof obs === 'object') {
    return obs.path || obs.filePath || obs.file_path || obs.result?.path || null;
  }
  return null;
}

/**
 * 从 agent_exec 命令字符串中解析写入的文件路径
 * 支持：echo > file、echo >> file、touch、mkdir、cp、cat > file、tee 等模式
 * 支持 Bash 花括号扩展：mkdir -p dir/{a,b}、touch {x,y}.txt
 * @param {string} command - 完整的命令字符串
 * @returns {{path: string, isDir: boolean}[]} - 提取出的文件路径列表（绝对路径或相对路径）
 */
function extractFilesFromAgentExec(command, initialCwd) {
  if (!command || typeof command !== 'string') return [];

  const results = [];
  let cwd = initialCwd || ''; // 初始工作目录（来自 agent_exec 的 params.cwd）

  // 按 && 和 ; 分割命令链（忽略花括号内部）
  const parts = [];
  {
    let depth = 0;
    let current = '';
    for (let i = 0; i < command.length; i++) {
      const ch = command[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
      if (depth === 0 && ch === ';') {
        parts.push(current);
        current = '';
      } else if (depth === 0 && ch === '&' && command[i + 1] === '&') {
        parts.push(current);
        current = '';
        i++;
      } else {
        current += ch;
      }
    }
    parts.push(current);
  }

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // 剥离引号内内容：防止引号内的 > < | 等特殊字符被误识别为 shell 操作符
    // 保留引号本身以维持参数边界，仅将引号内文本替换为空
    const stripped = trimmed
      .replace(/"[^"]*"/g, '""')
      .replace(/'[^']*'/g, "''");

    // cd 命令：更新当前工作目录
    const cdMatch = trimmed.match(/^cd\s+(.+?)\s*$/);
    if (cdMatch) {
      const target = cdMatch[1].trim().replace(/^['"]|['"]$/g, '');
      if (target.startsWith('/')) {
        cwd = target;
      } else if (target === '..') {
        cwd = cwd ? (normalizePath(cwd).replace(/\/[^/]+$/, '') || '/') : '..';
      } else {
        // 相对路径 cd：无论 cwd 是否已设置都累积拼接
        cwd = cwd ? normalizePath(cwd.replace(/\/$/, '') + '/' + target) : normalizePath(target);
      }
      continue;
    }

    /** 将相对路径转为绝对路径 */
    const resolvePath = (p) => {
      p = p.replace(/^['"]|['"]$/g, '');
      if (!p.startsWith('/') && cwd) {
        p = normalizePath(cwd.replace(/\/$/, '') + '/' + p);
      }
      return normalizePath(p);
    };

    // mkdir -p dir/{a,b}（使用 stripped 避免引号内干扰）
    const mkdirMatch = stripped.match(/^mkdir\s+(?:-[a-z]+\s+)*(.+?)$/);
    if (mkdirMatch) {
      const dirs = splitTopLevel(mkdirMatch[1], ' \t')
        .map(d => d.trim())
        .filter(d => d && !d.startsWith('-') && d !== '""' && d !== "''");
      const expanded = expandAndResolvePaths(dirs, resolvePath);
      for (const d of expanded) results.push({ path: d, isDir: true });
      continue;
    }

    // touch {x,y}.txt
    const touchMatch = stripped.match(/^touch\s+(.+)$/);
    if (touchMatch) {
      const fileList = splitTopLevel(touchMatch[1], ' \t')
        .map(f => f.trim())
        .filter(f => f && !f.startsWith('-') && f !== '""' && f !== "''");
      const expanded = expandAndResolvePaths(fileList, resolvePath);
      for (const f of expanded) results.push({ path: f, isDir: false });
      continue;
    }

    let filePath = null;

    // echo "..." > file 或 >> file（重定向在末尾，使用 stripped 避免引号内 > 被误匹配）
    const redirectMatch = stripped.match(/\s[>]{1,2}\s*['"]?([^\s|&;'"]+)['"]?\s*$/);
    if (redirectMatch) {
      filePath = redirectMatch[1];
    }

    // cat > file
    if (!filePath) {
      const catMatch = stripped.match(/^cat\s+>\s*['"]?([^\s|&;'"]+)['"]?/);
      if (catMatch) filePath = catMatch[1];
    }

    // cp src ... dest（dest 是最后一个参数，使用原始 trimmed 保留完整路径）
    if (!filePath) {
      const cpMatch = trimmed.match(/^cp\s+(?:-[a-zA-Z]+\s+)*(?:.+?\s+)+?['"]?([^\s|&;'"]+)['"]?\s*$/);
      if (cpMatch) filePath = cpMatch[1];
    }

    // tee file（使用 stripped，避免匹配引号内作为文本内容的 tee）
    if (!filePath) {
      const teeMatch = stripped.match(/tee\s+(?:-[a-zA-Z]+\s+)*['"]?([^\s|&;'"]+)['"]?/);
      if (teeMatch) filePath = teeMatch[1];
    }

    if (filePath) {
      const expanded = expandAndResolvePaths([filePath], resolvePath);
      for (const f of expanded) results.push({ path: f, isDir: false });
    }
  }

  return results;
}

// ============================================================
// 脚本内容分析：从脚本文件中提取可能创建的文件路径
// ============================================================

/**
 * 从脚本文件内容中提取可能创建的文件路径
 * 当 agent 写入脚本后又执行它时，脚本内部创建的文件也能被追踪为产物。
 * 跨平台支持：
 *   - Unix Shell（.sh/.bash/.zsh）
 *   - Windows CMD 批处理（.bat/.cmd）
 *   - PowerShell（.ps1）
 *   - Python（.py）
 * @param {string} content - 脚本文件内容
 * @param {string} ext - 文件扩展名（小写）
 * @returns {string[]} - 提取到的文件路径列表
 */
function extractDerivedFilesFromScript(content, ext) {
  if (!content || typeof content !== 'string') return [];
  const results = [];
  const lines = content.split('\n');

  if (['sh', 'bash', 'zsh'].includes(ext)) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      // 重定向: > file 或 >> file
      const redirectMatches = [...trimmed.matchAll(/[>]{1,2}\s*['"]?([^\s|&;>'"]+)['"]?/g)];
      for (const m of redirectMatches) {
        if (m[1] && !m[1].startsWith('/dev/')) results.push(m[1]);
      }
      // mkdir -p dir
      const mkdirMatch = trimmed.match(/^mkdir\s+(?:-[a-z]+\s+)*(.+?)$/);
      if (mkdirMatch) {
        const dirs = splitTopLevel(mkdirMatch[1], ' \t')
          .map(d => d.trim()).filter(d => d && !d.startsWith('-'));
        results.push(...dirs);
      }
      // touch file
      const touchMatch = trimmed.match(/^touch\s+(.+)$/);
      if (touchMatch) {
        const files = splitTopLevel(touchMatch[1], ' \t')
          .map(f => f.trim()).filter(f => f && !f.startsWith('-'));
        results.push(...files);
      }
      // cp src ... dest
      const cpMatch = trimmed.match(/^cp\s+(?:-[a-zA-Z]+\s+)*(?:.+?\s+)+?['"]?([^\s|&;'"]+)['"]?\s*$/);
      if (cpMatch) results.push(cpMatch[1]);
      // tee file
      const teeMatch = trimmed.match(/tee\s+(?:-[a-zA-Z]+\s+)*['"]?([^\s|&;'"]+)['"]?/);
      if (teeMatch) results.push(teeMatch[1]);
    }
  }

  // ── Windows CMD 批处理 (.bat / .cmd) ──
  else if (ext === 'bat' || ext === 'cmd') {
    for (const line of lines) {
      // 去掉 @ 前缀（如 @echo off）
      let trimmed = line.trim().replace(/^@/, '');
      if (!trimmed) continue;
      const upper = trimmed.toUpperCase();
      // 跳过注释行: REM ... 或 :: ...
      if (/^REM\b/i.test(trimmed) || trimmed.startsWith('::')) continue;
      // 跳过 echo 输出命令（echo text > file 除外，由下方重定向统一处理）
      if (/^ECHO\b/i.test(trimmed) && !/[>]{1,2}/.test(trimmed)) continue;

      // 重定向: > file 或 >> file（CMD 通用，覆盖 echo > file 等）
      const redirectMatches = [...trimmed.matchAll(/[>]{1,2}\s*"?([^\s|&;>"]+)"?/g)];
      for (const m of redirectMatches) {
        if (m[1] && m[1].toUpperCase() !== 'NUL') results.push(m[1]);
      }
      // mkdir / md dir
      const mkdirMatch = trimmed.match(/^(?:mkdir|md)\s+(?:"([^"]+)"|(\S+))/i);
      if (mkdirMatch) results.push(mkdirMatch[1] || mkdirMatch[2]);
      // copy src dest（最后一个参数是目标）
      const copyMatch = trimmed.match(/^copy\s+(?:\/\S+\s+)*(?:.+?\s+)+?"?([^\s|&;"]+)"?\s*$/i);
      if (copyMatch) results.push(copyMatch[1]);
      // xcopy src dest /flags
      const xcopyMatch = trimmed.match(/^xcopy\s+(?:\/\S+\s+)*(?:"[^"]+"|\S+)\s+(?:"([^"]+)"|(\S+))/i);
      if (xcopyMatch) results.push(xcopyMatch[1] || xcopyMatch[2]);
      // type nul > file（创建空文件，已由重定向覆盖）
    }
  }

  // ── PowerShell (.ps1) ──
  else if (ext === 'ps1') {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // 重定向: > file 或 >> file（PowerShell 也支持）
      const redirectMatches = [...trimmed.matchAll(/[>]{1,2}\s*"?([^\s|;>'"]+)"?/g)];
      for (const m of redirectMatches) {
        if (m[1] && m[1].toUpperCase() !== 'NUL') results.push(m[1]);
      }
      // Set-Content / Out-File / Add-Content -Path "path" 或 位置参数
      const psWriteMatch = trimmed.match(
        /(?:Set-Content|Out-File|Add-Content)\s+(?:-[\w]+\s+)*"?([^";\s|]+)"?/i
      );
      if (psWriteMatch) results.push(psWriteMatch[1]);
      // New-Item -Path "path" [-ItemType file|directory]
      const newItemMatch = trimmed.match(/New-Item\s+(?:-[\w]+\s+)*-Path\s+"?([^";\s|]+)"?/i);
      if (newItemMatch) results.push(newItemMatch[1]);
      // New-Item "path" -ItemType file/directory（位置参数在前）
      const newItemPosMatch = trimmed.match(/New-Item\s+"?([^";\s|]+)"?\s+(?:-[\w]+\s+)*-ItemType/i);
      if (newItemPosMatch) results.push(newItemPosMatch[1]);
      // Copy-Item src -Destination "path"
      const copyMatch = trimmed.match(/Copy-Item\s+(?:-[\w]+\s+)*"?([^";\s|]+)"?\s+(?:-[\w]+\s+)*-Destination\s+"?([^";\s|]+)"?/i);
      if (copyMatch) results.push(copyMatch[2]);
      // Move-Item src -Destination "path"
      const moveMatch = trimmed.match(/Move-Item\s+(?:-[\w]+\s+)*"?([^";\s|]+)"?\s+(?:-[\w]+\s+)*-Destination\s+"?([^";\s|]+)"?/i);
      if (moveMatch) results.push(moveMatch[2]);
    }
  }

  // ── Python (.py) ──
  else if (ext === 'py') {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      // open('path', 'w'/'a'/'x')
      const openMatch = trimmed.match(/open\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"][wax][+]?['"]/);
      if (openMatch) results.push(openMatch[1]);
      // os.makedirs / os.mkdir
      const makedirsMatch = trimmed.match(/os\.(?:makedirs|mkdir)\s*\(\s*['"]([^'"]+)['"]/);
      if (makedirsMatch) results.push(makedirsMatch[1]);
      // shutil.copy2 / shutil.copy / shutil.move
      const shutilMatch = trimmed.match(/shutil\.(?:copy2?|move)\s*\([^,]+,\s*['"]([^'"]+)['"]/);
      if (shutilMatch) results.push(shutilMatch[1]);
      // pathlib.Path('path').write_text / .write_bytes / .touch / .mkdir
      const pathlibMatch = trimmed.match(/Path\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.\s*(?:write_text|write_bytes|touch|mkdir)/);
      if (pathlibMatch) results.push(pathlibMatch[1]);
    }
  }

  // 去重并过滤不可静态解析的路径（含变量引用、纯相对路径片段等）
  const seen = new Set();
  return results.filter(p => {
    if (!p || seen.has(p)) return false;
    seen.add(p);
    // 过滤含未解析变量引用的路径：$VAR / ${VAR}（Unix）、%VAR%（Windows CMD）
    if (/\$[\w({]|%[\w]+%/.test(p)) return false;
    // 至少包含一个路径分隔符（/ 或 \）或扩展名，才视为有效文件路径
    return p.includes('/') || p.includes('\\') || p.includes('.');
  });
}

/**
 * 检测 agent_exec 命令是否在执行已知脚本文件，返回脚本路径或 null
 * 跨平台支持：
 *   - Unix: bash/sh/python/node ./script.sh
 *   - Windows CMD: cmd /c script.bat, script.bat
 *   - Windows PowerShell: powershell -File script.ps1
 */
function detectScriptExecution(command, knownScriptPaths) {
  if (!command || typeof command !== 'string') return null;
  const trimmed = command.trim();
  for (const scriptPath of knownScriptPaths) {
    const scriptName = getFileName(scriptPath);
    const escapedName = scriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedPath = scriptPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 同时生成反斜杠版本的路径模式（Windows 路径可能用 \）
    const escapedPathBs = scriptPath.replace(/\//g, '\\').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const pattern = new RegExp(
      // Unix: bash script.sh / sh script.sh
      `(?:^|[;\\s&|])(?:ba)?sh\\s+.*${escapedName}|` +
      // Unix: python script.py
      `(?:^|[;\\s&|])python[23]?\\s+.*${escapedName}|` +
      // Unix: node script.js
      `(?:^|[;\\s&|])node\\s+.*${escapedName}|` +
      // Unix: ./script.sh 或 /path/to/script.sh
      `(?:^|[;\\s&|])\\.?/${escapedName}|` +
      // Windows CMD: cmd /c script.bat
      `(?:^|[;\\s&|])cmd(?:\\.exe)?\\s+(?:/c|/k)\\s+.*${escapedName}|` +
      // Windows PowerShell: powershell -File script.ps1
      `(?:^|[;\\s&|])(?:powershell|pwsh)(?:\\.exe)?\\s+(?:-[\w-]+\\s+)*-File\\s+.*${escapedName}|` +
      // 直接绝对/相对路径执行（/ 或 \\ 分隔）
      `(?:^|[;\\s&|])${escapedPath}|` +
      `(?:^|[;\\s&|])${escapedPathBs}`
    );
    if (pattern.test(trimmed)) return scriptPath;
  }
  return null;
}

/**
 * 从 agent_exec 的命令中提取被删除的文件路径
 * 跨平台支持：
 *   - Unix: rm file、rm -rf dir
 *   - Windows CMD: del/erase file、rmdir/rd /s dir
 *   - PowerShell: Remove-Item [-Recurse] path
 * @param {string} command - 命令字符串
 * @returns {{path: string, isDir: boolean}[]}
 */
function extractFilesFromRm(command, initialCwd) {
  if (!command || typeof command !== 'string') return [];
  const results = [];
  let cwd = initialCwd || ''; // 初始工作目录（来自 agent_exec 的 params.cwd）

  const resolvePath = (p) => {
    p = p.replace(/^['"]|['"]$/g, '');
    // 兼容 Windows 路径：如果不是以 / 或盘符(X:\) 开头，则用 cwd 拼接
    if (!p.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(p) && cwd) {
      p = normalizePath(cwd.replace(/\/$/, '') + '/' + p);
    }
    return normalizePath(p);
  };

  // 按 && 和 ; 分割命令链
  const parts = [];
  {
    let depth = 0;
    let current = '';
    for (let i = 0; i < command.length; i++) {
      const ch = command[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
      if (depth === 0 && ch === ';') { parts.push(current); current = ''; }
      else if (depth === 0 && ch === '&' && command[i + 1] === '&') { parts.push(current); current = ''; i++; }
      else { current += ch; }
    }
    parts.push(current);
  }

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // cd 跟踪（兼容 Windows cd 和盘符切换）
    const cdMatch = trimmed.match(/^cd\s+(?:\/[dD]\s+)?(.+?)\s*$/);
    if (cdMatch) {
      const target = cdMatch[1].trim().replace(/^['"]|['"]$/g, '');
      if (target.startsWith('/') || /^[A-Za-z]:/.test(target)) {
        cwd = normalizePath(target);
      } else if (target === '..') {
        cwd = cwd ? (normalizePath(cwd).replace(/\/[^/]+$/, '') || '/') : '..';
      } else {
        // 相对路径 cd：无论 cwd 是否已设置都累积拼接
        cwd = cwd ? normalizePath(cwd.replace(/\/$/, '') + '/' + target) : normalizePath(target);
      }
      continue;
    }

    // ── Unix: rm [-flags] files... ──
    const rmMatch = trimmed.match(/^rm\s+((?:-[a-zA-Z]+\s+)*)(.+)$/);
    if (rmMatch) {
      const flags = rmMatch[1];
      const fileArgs = rmMatch[2];
      const isRecursive = /r|R/i.test(flags);
      const files = splitTopLevel(fileArgs, ' \t')
        .map(f => f.trim()).filter(f => f && !f.startsWith('-'));
      const expanded = expandAndResolvePaths(files, resolvePath);
      for (const p of expanded) results.push({ path: p, isDir: isRecursive });
      continue;
    }

    // ── Windows CMD: del / erase [-flags] files... ──
    const delMatch = trimmed.match(/^(?:del|erase)\s+((?:\/[a-zA-Z]+\s+)*)(.+)$/i);
    if (delMatch) {
      const flags = delMatch[1];
      const fileArgs = delMatch[2];
      const files = splitTopLevel(fileArgs, ' \t')
        .map(f => f.trim()).filter(f => f && !f.startsWith('/'));
      const expanded = expandAndResolvePaths(files, resolvePath);
      for (const p of expanded) results.push({ path: p, isDir: false });
      continue;
    }

    // ── Windows CMD: rmdir / rd [-flags] dirs... ──
    const rdMatch = trimmed.match(/^(?:rmdir|rd)\s+((?:\/[a-zA-Z]+\s+)*)(.+)$/i);
    if (rdMatch) {
      const flags = rdMatch[1];
      const dirArgs = rdMatch[2];
      const isRecursive = /s|S/i.test(flags);
      const dirs = splitTopLevel(dirArgs, ' \t')
        .map(f => f.trim()).filter(f => f && !f.startsWith('/'));
      const expanded = expandAndResolvePaths(dirs, resolvePath);
      for (const p of expanded) results.push({ path: p, isDir: isRecursive });
      continue;
    }

    // ── PowerShell: Remove-Item [-Recurse] [-Force] path ──
    const psRmMatch = trimmed.match(/^Remove-Item\s+((?:-[\w-]+\s+)*(?:"[^"]+"|\S+)?(?:\s+(?:-[\w-]+\s+)*(?:"[^"]+"|\S+))*)/i);
    if (psRmMatch) {
      const fullArgs = psRmMatch[1];
      const isRecursive = /-Recurse/i.test(fullArgs);
      // 提取非 flag 参数（路径）
      const pathArgs = [...fullArgs.matchAll(/(?:"([^"]+)"|(?<![-\/])(\S+))/g)]
        .map(m => m[1] || m[2])
        .filter(p => p && !p.startsWith('-'));
      const expanded = expandAndResolvePaths(pathArgs, resolvePath);
      for (const p of expanded) results.push({ path: p, isDir: isRecursive });
      continue;
    }
  }

  return results;
}

/**
 * 从 executionLog 中提取所有文件产物（写/创建/编辑文件操作）
 * @param {Array} executionLog - 执行日志
 * @returns {Array} 产物列表 [{ path, fileName, toolName, action, size, timestamp, status, type }]
 *   type: 'directory' | 'file'
 */
export function extractArtifactsFromExecutionLog(executionLog) {
  if (!Array.isArray(executionLog) || executionLog.length === 0) return [];

  const artifacts = [];
  const seenPaths = new Set(); // 去重

  // 按时间排序
  const sortedLog = [...executionLog].sort(
    (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
  );

  // ── 预扫描：收集通过 agent_file 写入的脚本文件内容，用于后续脚本执行时追踪派生文件 ──
  const scriptContentMap = new Map(); // scriptPath → { content, ext }
  for (const entry of sortedLog) {
    if (entry.nodeType !== 'tool_exec' || entry.status === 'failed') continue;
    if (entry.action?.name !== 'agent_file') continue;
    let p = entry.action.params;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch { continue; } }
    if (!p || p.action !== 'write' || typeof p.content !== 'string') continue;
    const path = normalizePath(p.path || p.filePath || '');
    const ext = getFileExt(path);
    if (['sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'py'].includes(ext)) {
      scriptContentMap.set(path, { content: p.content, ext });
    }
  }

  // 已知脚本路径列表（用于检测 agent_exec 是否在执行某个已写入的脚本）
  const knownScriptPaths = [...scriptContentMap.keys()];

  // 删除路径追踪：path → { isDir, timestamp }
  const deletedPaths = new Map();

  for (const entry of sortedLog) {
    if (entry.nodeType !== 'tool_exec') continue;
    if (!entry.action) continue;

    const toolName = entry.action.name || '';
    let params = entry.action.params;
    if (params == null) continue;
    if (typeof params === 'string') {
      try { params = JSON.parse(params); } catch { continue; }
    }
    if (typeof params !== 'object') continue;

    // agent_exec: 从 shell 命令中解析写入的文件路径
    if (toolName === 'agent_exec') {
      const command = params.command || '';
      if (!command) continue;

      // ── 脚本执行检测：如果命令在运行已写入的脚本，提取脚本内容中创建的文件 ──
      const executedScript = detectScriptExecution(command, knownScriptPaths);
      if (executedScript && entry.status !== 'failed') {
        const scriptInfo = scriptContentMap.get(executedScript);
        if (scriptInfo) {
          const derivedPaths = extractDerivedFilesFromScript(scriptInfo.content, scriptInfo.ext);
          for (const dp of derivedPaths) {
            if (!dp) continue;
            const resolvedPath = dp.startsWith('/') ? normalizePath(dp) : normalizePath(dp);
            if (seenPaths.has(resolvedPath)) {
              const idx = artifacts.findIndex(a => a.path === resolvedPath);
              if (idx >= 0) artifacts.splice(idx, 1);
            }
            seenPaths.add(resolvedPath);
            artifacts.push({
              path: resolvedPath,
              fileName: getFileName(resolvedPath),
              toolName,
              action: 'typeCreate',
              size: 0,
              timestamp: entry.timestamp || null,
              status: entry.status || 'unknown',
              type: 'file',
              deleted: deletedPaths.has(resolvedPath) || undefined,
            });
          }
        }
      }

      // ── rm 命令检测：追踪文件删除 ──
      if (entry.status !== 'failed') {
        const rmCandidates = extractFilesFromRm(command, params.cwd);
        for (const rmCandidate of rmCandidates) {
          deletedPaths.set(rmCandidate.path, { isDir: rmCandidate.isDir, timestamp: entry.timestamp });
        }
      }

      const candidates = extractFilesFromAgentExec(command, params.cwd);
      for (const candidate of candidates) {
        const filePath = candidate && candidate.path;
        if (!filePath) continue;

        // 去重（同一路径只保留最后一次操作）
        if (seenPaths.has(filePath)) {
          const idx = artifacts.findIndex(a => a.path === filePath);
          if (idx >= 0) artifacts.splice(idx, 1);
        }
        seenPaths.add(filePath);

        if (entry.status === 'failed') continue;

        artifacts.push({
          path: filePath,
          fileName: getFileName(filePath),
          toolName,
          action: 'typeCreate',
          size: 0,
          timestamp: entry.timestamp || null,
          status: entry.status || 'unknown',
          type: candidate.isDir ? 'directory' : 'file',
          deleted: deletedPaths.has(filePath) || undefined,
        });
      }
      continue;
    }

    let filePath = null;
    let actionLabel = 'typeOther';

    // agent_file: action=write 或 action=delete
    if (toolName === 'agent_file') {
      const action = params.action;
      if (action === 'write') {
        filePath = params.path || params.filePath;
        actionLabel = 'typeWrite';
      } else if (action === 'delete') {
        // 标记文件已删除
        const delPath = normalizePath(params.path || params.filePath || '');
        if (delPath && entry.status !== 'failed') {
          deletedPaths.set(delPath, { isDir: false, timestamp: entry.timestamp });
        }
        continue;
      } else {
        continue;
      }
    }
    // file_upload: 上传文件到工作目录
    else if (toolName === 'file_upload') {
      filePath = params.path || params.filePath || params.filename;
      actionLabel = 'typeCreate';
    }
    // download_file: 下载文件到工作目录，跳过
    else if (toolName === 'download_file') {
      continue;
    }
    // 其他可能的写文件工具（自定义扩展）
    else if (params.file_path && (params.content !== undefined || params.action === 'write' || params.action === 'create')) {
      filePath = params.file_path;
      actionLabel = params.action === 'create' ? 'typeCreate' : 'typeWrite';
    }

    if (!filePath) continue;

    // 尝试从 observation 中获取真实路径（Agent 可能返回规范化的路径）
    const obsPath = extractPathFromObservation(entry.observation);
    const finalPath = normalizePath(obsPath || filePath);
    if (!finalPath) continue;

    // 去重（同一路径只保留最后一次操作）
    if (seenPaths.has(finalPath)) {
      const idx = artifacts.findIndex(a => a.path === finalPath);
      if (idx >= 0) artifacts.splice(idx, 1);
    }
    seenPaths.add(finalPath);

    // 只记录成功的写操作
    if (entry.status === 'failed') continue;

    // 尝试从 observation 中获取文件大小
    let size = 0;
    if (entry.observation) {
      let obs = entry.observation;
      if (typeof obs === 'string') {
        try { obs = JSON.parse(obs); } catch {}
      }
      if (obs && typeof obs === 'object') {
        size = obs.size || obs.fileSize || obs.file_size || 0;
      }
    }

    artifacts.push({
      path: finalPath,
      fileName: getFileName(finalPath),
      toolName,
      action: actionLabel,
      size,
      timestamp: entry.timestamp || null,
      status: entry.status || 'unknown',
      type: 'file',
      deleted: deletedPaths.has(finalPath) || undefined,
    });
  }

  // ── 后处理：将后续被删除的文件标记为 deleted ──
  // 处理场景：文件先被创建（已 push 到 artifacts），后续被 rm/agent_file delete 删除
  if (deletedPaths.size > 0) {
    const deletedPathList = [...deletedPaths.keys()];
    /**
     * 后缀路径匹配：当一个路径是绝对路径，另一个是相对路径时，
     * 通过检查绝对路径是否以相对路径结尾（在路径段边界处）来匹配
     * 解决场景：agent_file write 创建绝对路径文件，后续 rm 在无 cwd 时产生相对路径
     */
    const isPathMatch = (artifactPath, deletedPath) => {
      if (artifactPath === deletedPath) return true;
      // 一个是绝对路径，一个是相对路径时，尝试后缀匹配
      const isAbsA = artifactPath.startsWith('/');
      const isAbsD = deletedPath.startsWith('/');
      if (isAbsA && !isAbsD) {
        return artifactPath.endsWith('/' + deletedPath) || artifactPath.endsWith(deletedPath);
      }
      if (isAbsD && !isAbsA) {
        return deletedPath.endsWith('/' + artifactPath) || deletedPath.endsWith(artifactPath);
      }
      return false;
    };

    for (const artifact of artifacts) {
      if (!artifact.deleted) {
        // 先尝试精确匹配，再尝试后缀匹配
        if (deletedPaths.has(artifact.path) || deletedPathList.some(dp => isPathMatch(artifact.path, dp))) {
          artifact.deleted = true;
        }
      }
    }
  }

  return artifacts;
}

/**
 * 判断是否可预览的文件（代理到 workspace-manager.supportsPreview）
 */
function canPreview(filePath) {
  try {
    return supportsPreview(filePath);
  } catch (e) {
    return false;
  }
}

// ============================================================
// 产物弹框 UI
// ============================================================

let modalOverlay = null;

// 排序状态
let artifactsSortKey = null; // 'name' | 'type' | 'time'
let artifactsSortDir = 1;    // 1 升序, -1 降序

/**
 * 格式化时间戳为 HH:MM:SS
 */
function formatHHMMSS(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 根据当前排序状态对产物列表排序
 */
function sortArtifacts(list) {
  if (!artifactsSortKey) return list;
  const dir = artifactsSortDir;
  return [...list].sort((a, b) => {
    let va, vb;
    if (artifactsSortKey === 'name') {
      va = (a.fileName || a.path || '').toLowerCase();
      vb = (b.fileName || b.path || '').toLowerCase();
    } else if (artifactsSortKey === 'type') {
      va = a.type || 'file';
      vb = b.type || 'file';
    } else {
      va = new Date(a.timestamp || 0).getTime();
      vb = new Date(b.timestamp || 0).getTime();
    }
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return 0;
  });
}

/**
 * 生成单个产物行 HTML
 */
function buildArtifactRowHtml(a, idx) {
  const icon = getFileIcon(a.fileName, a.type);
  const typeText = t(`artifacts.${a.action}`);
  const timeText = formatHHMMSS(a.timestamp);
  const previewable = !a.deleted && canPreview(a.fileName);
  const isDeleted = !!a.deleted;
  const deletedBadgeHtml = isDeleted ? `<span class="artifact-deleted-badge" title="${t('artifacts.deletedFile')}">${t('artifacts.deletedBadge')}</span>` : '';
  const disabledAttr = isDeleted ? 'disabled' : '';
  const disabledClass = isDeleted ? ' artifact-btn-disabled' : '';
  const rowClass = isDeleted ? ' artifact-deleted-row' : '';
  return `
    <tr class="artifacts-row${rowClass}" data-idx="${idx}" data-path="${escapeHtml(a.path)}" data-name="${escapeHtml(a.fileName)}">
      <td class="col-index">${idx + 1}</td>
      <td class="col-file">
        <span class="artifact-icon">${icon}</span>
        <span class="artifact-name" title="${escapeHtml(a.path)}${isDeleted ? ' · ' + t('artifacts.deletedFile') : ' · ' + t('artifacts.dblClickHint')}">${escapeHtml(a.fileName)}</span>
        ${deletedBadgeHtml}
        <button class="artifact-copy-btn" title="${t('artifacts.copyFileName')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
      </td>
      <td class="col-type">${typeText}</td>
      <td class="col-time">${timeText}</td>
      <td class="col-action">
        <button class="artifact-action-btn download-btn${disabledClass}" title="${isDeleted ? t('artifacts.deletedFile') : t('artifacts.download')}" ${disabledAttr}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button class="artifact-action-btn locate-btn${disabledClass}" title="${isDeleted ? t('artifacts.deletedFile') : t('artifacts.locate')}" ${disabledAttr}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </button>
        ${previewable ? `
        <button class="artifact-action-btn preview-btn" title="${t('artifacts.preview')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>` : ''}
      </td>
    </tr>
  `;
}

/**
 * 绑定产物行事件（排序重渲染后需重新绑定）
 * @param {HTMLElement} modal - 弹框根节点
 * @param {Array} sortedList - 排序后的产物列表
 */
function bindArtifactRowEvents(modal, sortedList) {
  modal.querySelectorAll('.artifacts-row').forEach(row => {
    const idx = parseInt(row.dataset.idx, 10);
    const artifact = sortedList[idx];
    if (!artifact) return;

    // 单击行：已删除文件不触发定位
    row.addEventListener('click', (e) => {
      // 点击按钮（操作/复制/下载）不重复触发
      if (e.target.closest('.artifact-action-btn') || e.target.closest('.artifact-copy-btn')) return;
      if (artifact.deleted) return;
      closeWorkspacePreview().catch(() => {});
      locateFileInWorkspace(artifact.path).catch(err => {
        logger.error('[Artifacts] locate failed:', err);
      });
    });

    // 双击文件名：已删除文件不触发预览
    const nameEl = row.querySelector('.artifact-name');
    if (nameEl) {
      nameEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault(); // 阻止文本选中
        if (artifact.deleted) return;
        if (!canPreview(artifact.fileName)) return;
        previewArtifactFile(artifact.path, artifact.fileName).catch(err => {
          logger.error('[Artifacts] preview failed:', err);
        });
      });
    }

    // 复制按钮：普通点击复制文件名，Ctrl/Cmd+点击复制文件绝对路径
    const copyBtn = row.querySelector('.artifact-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const copyPath = e.ctrlKey || e.metaKey;
        let text = artifact.fileName;
        if (copyPath) {
          // 解析为工作目录内的绝对路径（失败时回退原始路径）
          const abs = await resolveWorkspaceAbsolutePath(artifact.path);
          text = abs || artifact.path;
        }
        copyToClipboard(text, copyBtn);
        showToast(copyPath ? t('artifacts.copiedPath') : t('artifacts.copiedName', { name: artifact.fileName }), 'success');
      });
    }

    // 下载按钮：已删除文件禁用
    const dlBtn = row.querySelector('.download-btn');
    if (dlBtn && !dlBtn.disabled) {
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleArtifactDownload(artifact);
      });
    }

    // 定位/预览按钮：已删除文件禁用（HTML 中已设 disabled，此处做兜底）
    row.querySelectorAll('.locate-btn, .preview-btn').forEach(btn => {
      if (btn.disabled) return;
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (btn.classList.contains('locate-btn')) {
          closeWorkspacePreview().catch(() => {});
          try {
            // 定位完成后保持弹框打开，用户可继续操作
            await locateFileInWorkspace(artifact.path);
          } catch (err) {
            logger.error('[Artifacts] locate failed:', err);
          }
        } else if (btn.classList.contains('preview-btn')) {
          try {
            // 预览完成后保持弹框打开，用户可继续操作
            await previewArtifactFile(artifact.path, artifact.fileName);
          } catch (err) {
            logger.error('[Artifacts] preview failed:', err);
          }
        }
      });
    });
  });
}

/**
 * 渲染表格行（按当前排序），并更新表头排序指示器
 */
function renderArtifactRows(modal, artifacts) {
  const sorted = sortArtifacts(artifacts);
  const tbody = modal.querySelector('.artifacts-table tbody');
  tbody.innerHTML = sorted.map((a, i) => buildArtifactRowHtml(a, i)).join('');

  modal.querySelectorAll('.artifacts-table th.sortable').forEach(th => {
    const key = th.dataset.sort;
    th.classList.toggle('sorted-asc', key === artifactsSortKey && artifactsSortDir === 1);
    th.classList.toggle('sorted-desc', key === artifactsSortKey && artifactsSortDir === -1);
  });

  bindArtifactRowEvents(modal, sorted);
}

/**
 * 下载产物（文件走单文件流，目录走 Zip 流），失败时 Toast 提示
 */
async function handleArtifactDownload(artifact) {
  let result = null;
  try {
    if (artifact.type === 'directory') {
      result = await downloadFilesStream([artifact.path]);
    } else {
      result = await downloadFileStream(artifact.path);
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }

  if (!result || !result.success) {
    const detail = result && result.error ? `: ${result.error}` : '';
    showToast(t('artifacts.downloadFailed') + detail, 'error');
    return;
  }

  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  // 目录下载：压缩包以目录名命名（如 myapp → myapp.zip）
  let dlName = result.name || getFileName(artifact.path) || 'workspace.zip';
  if (artifact.type === 'directory') {
    const dirName = getFileName(artifact.path);
    if (dirName) dlName = dirName.replace(/\.zip$/i, '') + '.zip';
  }
  a.href = url;
  a.download = dlName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * 通过后端 Agent 批量检查文件是否存在，将不存在的文件标记为 deleted
 * 作为命令解析的补充：Agent 在线时以实际文件系统为准
 * @param {Array} artifacts - 产物列表（原地修改）
 * @returns {Promise<boolean>} 是否有产物被新标记为 deleted
 */
export async function checkArtifactsFileExistence(artifacts) {
  if (!artifacts || artifacts.length === 0) return false;

  // 只检查未被标记为 deleted 且有路径的产物
  const candidates = artifacts.filter(a => !a.deleted && a.path);
  if (candidates.length === 0) return false;

  try {
    // 产物路径可能是远程/沙箱路径（如 /workspace/fix.js），
    // 先解析为 Agent 工作目录的真实绝对路径，避免 stat 时路径不一致
    const pathMap = new Map();
    await Promise.all(candidates.map(async (a) => {
      let resolved = a.path;
      try {
        const abs = await resolveWorkspaceAbsolutePath(a.path);
        if (abs) resolved = abs;
      } catch { /* 解析失败保留原始路径 */ }
      if (!pathMap.has(resolved)) pathMap.set(resolved, []);
      pathMap.get(resolved).push(a.path);
    }));

    const pathsToCheck = [...pathMap.keys()];
    if (pathsToCheck.length === 0) return false;

    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_FILES_EXIST',
      paths: pathsToCheck,
    });

    if (!response || !response.success || !response.results) return false;

    let changed = false;
    // 将解析后路径的检查结果映射回原始产物路径
    for (const [resolved, originals] of pathMap) {
      if (response.results[resolved] === false) {
        for (const original of originals) {
          const artifact = artifacts.find(a => a.path === original);
          if (artifact && !artifact.deleted) {
            artifact.deleted = true;
            changed = true;
          }
        }
      }
    }
    return changed;
  } catch (err) {
    // Agent 离线或通信失败 → 静默忽略，保留命令解析结果
    return false;
  }
}

/**
 * 显示产物弹框
 * @param {Array} artifacts - 产物列表
 */
export function showArtifactsModal(artifacts) {
  // 如果已有弹框，先移除
  hideArtifactsModal();

  if (!artifacts || artifacts.length === 0) return;

  // 重置排序状态
  artifactsSortKey = null;
  artifactsSortDir = 1;

  modalOverlay = document.createElement('div');
  modalOverlay.className = 'artifacts-modal-overlay';
  modalOverlay.id = 'artifactsModalOverlay';

  const modal = document.createElement('div');
  modal.className = 'artifacts-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'artifacts-modal-header';
  header.innerHTML = `
    <div class="artifacts-modal-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;color:#4a90d9;">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="18" x2="12" y2="12"/>
        <line x1="9" y1="15" x2="15" y2="15"/>
      </svg>
      <span>${t('artifacts.modalTitle')}</span>
      <span class="artifacts-modal-count">${t('artifacts.totalCount', { count: artifacts.length })}</span>
    </div>
    <button class="artifacts-modal-close" id="artifactsModalClose" title="${t('artifacts.closeBtn')}">×</button>
  `;

  // Body - 表格
  const body = document.createElement('div');
  body.className = 'artifacts-modal-body';

  const table = document.createElement('table');
  table.className = 'artifacts-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-index" title="${t('artifacts.serialCol')}">${t('artifacts.serialCol')}</th>
        <th class="col-file sortable" data-sort="name" title="${t('artifacts.sortHint')}">${t('artifacts.fileCol')}<span class="sort-indicator"></span></th>
        <th class="col-type sortable" data-sort="type" title="${t('artifacts.sortHint')}">${t('artifacts.typeCol')}<span class="sort-indicator"></span></th>
        <th class="col-time sortable" data-sort="time" title="${t('artifacts.sortHint')}">${t('artifacts.timeCol')}<span class="sort-indicator"></span></th>
        <th class="col-action">${t('artifacts.actionCol')}</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  body.appendChild(table);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'artifacts-modal-footer';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'artifacts-modal-close-btn';
  closeBtn.textContent = t('artifacts.closeBtn');
  closeBtn.addEventListener('click', hideArtifactsModal);
  footer.appendChild(closeBtn);

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  modalOverlay.appendChild(modal);

  // 嵌入模式检测：工作目录面板为 embedded 布局时，overlay 挂载到左侧对话区域
  // （mainLeft）内，遮罩仅覆盖对话区，不遮挡右侧嵌入的工作目录区域
  let mountTarget = document.body;
  const workspaceContainer = document.getElementById('workspacePanelContainer');
  if (workspaceContainer && workspaceContainer.classList.contains('embedded')) {
    const mainLeft = document.getElementById('mainLeft');
    if (mainLeft) {
      modalOverlay.classList.add('embedded-mode');
      // 确保 mainLeft 作为 absolute 定位的包含块
      mainLeft.style.position = 'relative';
      mountTarget = mainLeft;
    }
  }
  mountTarget.appendChild(modalOverlay);

  // 绑定事件
  // 关闭按钮
  document.getElementById('artifactsModalClose').addEventListener('click', hideArtifactsModal);

  // 注意：点击遮罩区域不关闭弹窗本身（工作目录界面保持可操作）

  // ESC 关闭
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      hideArtifactsModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // 表头排序：点击切换排序，升序/降序交替，再次点击同列反转
  table.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (artifactsSortKey === key) {
        artifactsSortDir = -artifactsSortDir;
      } else {
        artifactsSortKey = key;
        artifactsSortDir = 1;
      }
      renderArtifactRows(modal, artifacts);
    });
  });

  // 首次渲染行
  renderArtifactRows(modal, artifacts);

  // 异步检查文件实际存在性（Agent 在线时以文件系统为准）
  checkArtifactsFileExistence(artifacts).then(changed => {
    if (changed && modalOverlay) {
      // 更新计数
      const countEl = modal.querySelector('.artifacts-modal-count');
      if (countEl) {
        const deletedCount = artifacts.filter(a => a.deleted).length;
        countEl.textContent = t('artifacts.totalCount', { count: artifacts.length }) +
          (deletedCount > 0 ? ` (${t('artifacts.deletedCount', { count: deletedCount })})` : '');
      }
      // 重新渲染行（反映新的 deleted 状态）
      renderArtifactRows(modal, artifacts);
    }
  }).catch(() => { /* 静默失败 */ });
}

/**
 * 隐藏产物弹框
 */
export function hideArtifactsModal() {
  if (modalOverlay) {
    modalOverlay.remove();
    modalOverlay = null;
  }
  // 关闭弹框不收起工作区面板/预览：工作目录中已打开的文件预览界面保持不变
}
