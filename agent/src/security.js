// agent/src/security.js - 安全管控：文件沙箱 + 命令分级
import { resolve, normalize, sep, isAbsolute, join, dirname } from 'path';
import { realpath } from 'fs/promises';
import { homedir, platform } from 'os';
import { loadConfig, MEMORY_DIR } from './config.js';

const isWin32 = platform() === 'win32';

function normalizePathFormat(pathStr) {
  if (!pathStr || typeof pathStr !== 'string') return pathStr;
  // 1. 把异常的 "/C:/" 形式（带前导斜杠的盘符）规整为 "C:/"
  //    仅匹配 /<字母>:/ ，不会误伤 /home/ 等普通路径段
  pathStr = pathStr.replace(/\/([a-zA-Z]):(\/|$)/g, '$1:$2');
  // 2. MSYS/Git Bash 风格路径：/d/Users/... → D:/Users/...
  //    前导 / + 单字母盘符 + / ，无冒号，是 MSYS 特有的挂载点表示法
  if (isWin32) {
    pathStr = pathStr.replace(/^\/([a-zA-Z])\//, '$1:/');
  }
  // 3. 统一为正斜杠（path.resolve/normalize 在所有平台都能正确处理正斜杠并归一化到平台分隔符）
  pathStr = pathStr.replace(/\\/g, '/');
  // 4. Windows 盘符统一为大写：d:/ → D:/
  //    path.resolve 保留盘符原始大小写，而白名单前缀比较是大小写敏感的字符串比较，
  //    小写盘符路径与大写盘符白名单前缀比较会失败（d:\Users\.startsWith(D:\Users\) → false）
  if (isWin32) {
    pathStr = pathStr.replace(/^([a-zA-Z]):/, m => m.toUpperCase());
  }
  return pathStr;
}

// ==================== 硬阻止目录（任何情况下都不可访问） ====================

const AGENT_DIR = join(homedir(), '.ai-helper-agent');

/** 核心敏感文件/目录（硬阻止，不可绕过）。其他子目录（如 workspace）由白名单控制。 */
const HARD_BLOCKED_PATHS = [
  join(AGENT_DIR, 'config.json'),     // 代理配置文件
  join(AGENT_DIR, 'pairings.json'),   // 配对记录
  join(AGENT_DIR, 'mcp_servers.json'),// MCP 服务器配置
  join(AGENT_DIR, 'logs') + sep,      // 日志目录
  join(AGENT_DIR, '.trash') + sep,    // 回收站目录（通过 /api/trash 端点管理）
  join(AGENT_DIR, 'builtin_skills_state.json'), // 内置技能状态
  join(AGENT_DIR, 'disabled_skills.json'),      // 停用技能状态
];

/**
 * 检查路径是否命中核心敏感文件
 */
function isHardBlocked(normalizedPath) {
  for (const blocked of HARD_BLOCKED_PATHS) {
    if (blocked.endsWith(sep)) {
      // 目录：检查是否在该目录下
      if (normalizedPath.startsWith(blocked) || normalizedPath === blocked.slice(0, -1)) {
        return true;
      }
    } else {
      // 文件：精确匹配
      if (normalizedPath === blocked) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 检查路径是否在白名单内
 * 使用 realpath 防止符号链接绕过
 * @returns {{ allowed: boolean, reason?: string, resolved?: string }}
 */
async function checkPath(pathStr) {
  if (!pathStr || typeof pathStr !== 'string') {
    return { allowed: false, reason: '路径无效' };
  }

  // 展开 ~ 到用户主目录（扩展端无法知道 Agent 所在机器的 home 路径）
  if (pathStr === '~') {
    pathStr = homedir();
  } else if (pathStr.startsWith('~/')) {
    pathStr = join(homedir(), pathStr.slice(2));
  }

  try {
    const config = loadConfig();

    const normalizedPathStr = normalizePathFormat(pathStr);
    const normalizedWorkdir = normalizePathFormat(config.workdir);

    const resolved = isAbsolute(normalizedPathStr) ? resolve(normalizedPathStr) : resolve(normalizedWorkdir, normalizedPathStr);
    const normalized = normalize(resolved);

    // 0. 硬阻止检查（优先级最高，不可绕过）
    if (isHardBlocked(normalized)) {
      return { allowed: false, reason: '禁止访问代理系统文件' };
    }

    // 0.5. 系统目录白名单：记忆存储目录（Agent 内部管理，可读写）
    const memoryPrefix = normalize(join(MEMORY_DIR, sep));
    if (normalized.startsWith(memoryPrefix) || normalized === normalize(MEMORY_DIR)) {
      return { allowed: true, resolved: normalized };
    }

    // 0.6. 工作目录永远放行（不受 allowedPaths 配置控制）
    //      workdir 是用户当前选定的操作目录，必须始终可访问，即使未在 allowedPaths 中也不应被拦截
    if (normalizedWorkdir) {
      const workdirResolved = resolve(normalizedWorkdir);
      const workdirPrefix = workdirResolved.endsWith(sep) ? workdirResolved : workdirResolved + sep;
      if (normalized.startsWith(workdirPrefix) || normalized === workdirResolved) {
        // realpath 硬阻止检查：防止通过 workdir 内的符号链接绕过到代理系统文件
        try {
          const realPath = await realpath(resolved);
          if (isHardBlocked(realPath)) {
            return { allowed: false, reason: '禁止访问代理系统文件' };
          }
        } catch (err) {
          if (err.code !== 'ENOENT') {
            return { allowed: false, reason: `无法解析路径: ${err.message}` };
          }
          // ENOENT：路径尚不存在（如待创建的文件），无法通过符号链接绕过，放行
        }
        return { allowed: true, resolved: normalized };
      }
    }

    const allowedPaths = config.allowedPaths.length > 0 ? config.allowedPaths.map(p => normalizePathFormat(p)) : [normalizedWorkdir];

    // 先做前缀检查（快速路径，兼容 Windows/Unix）
    let prefixMatch = false;
    for (const allowed of allowedPaths) {
      const allowedResolved = resolve(allowed);
      const prefix = allowedResolved.endsWith(sep) ? allowedResolved : allowedResolved + sep;
      if (normalized.startsWith(prefix) || normalized === allowedResolved) {
        prefixMatch = true;
        break;
      }
    }
    if (!prefixMatch) {
      return { allowed: false, reason: '路径不在允许的目录范围内' };
    }

    // realpath 校验：防止符号链接绕过
    let realPath;
    try {
      realPath = await realpath(resolved);
    } catch (err) {
      if (err.code === 'ENOENT') {
        let existing = resolved;
        while (true) {
          const parent = dirname(existing);
          if (parent === existing) {
            break;
          }
          try {
            realPath = await realpath(parent) + sep + normalized.slice(resolve(parent).length).replace(/^[/\\]/, '');
            break;
          } catch (parentErr) {
            if (parentErr.code === 'ENOENT') {
              existing = parent;
              continue;
            }
            return { allowed: false, reason: `无法解析路径: ${parentErr.message}` };
          }
        }
        if (!realPath) {
          return { allowed: false, reason: `路径检查异常: ${err.message}` };
        }
      } else {
        return { allowed: false, reason: `无法解析路径: ${err.message}` };
      }
    }

    // 对 realPath 做硬阻止检查（防止通过符号链接绕过）
    if (isHardBlocked(realPath)) {
      return { allowed: false, reason: '禁止访问代理系统文件' };
    }

    // 对 realPath 再次做前缀检查
    for (const allowed of allowedPaths) {
      const allowedResolved = resolve(allowed);
      const prefix = allowedResolved.endsWith(sep) ? allowedResolved : allowedResolved + sep;
      if (realPath.startsWith(prefix) || realPath === allowedResolved) {
        return { allowed: true, resolved: normalized };
      }
    }

    return { allowed: false, reason: '路径指向了允许范围之外的位置' };
  } catch (err) {
    return { allowed: false, reason: `路径检查异常: ${err.message}` };
  }
}

// ==================== 命令分级管控 ====================

const BLACKLIST_PATTERNS = [
  // 高危写入系统目录
  /^\s*rm\s+-rf\s+\/(\*|\s|$)/,
  /^\s*rm\s+-rf\s+~(\*|\s|$)/,
  /^\s*rm\s+-rf\s+\/dev\//,
  /^\s*rm\s+-rf\s+\/etc\//,
  /^\s*rm\s+-rf\s+\/proc\//,
  /^\s*rm\s+-rf\s+\/sys\//,
  // 格式化/磁盘破坏
  /^\s*mkfs\./,
  /^\s*dd\s+if=.*of=\/dev\//,
  /^\s*>\s*\/dev\/sd/,
  // 覆盖系统文件
  /^\s*>\s*\/etc\/passwd/,
  /^\s*>\s*\/etc\/shadow/,
  /^\s*>\s*\/etc\/sudoers/,
  // fork bomb
  /:\(\)\s*{\s*:\s*\|\s*:\s*&\s*};\s*:/,
  // shebang 直接执行（出现在命令开头）
  /^\s*#!/,
  // 恶意管道执行
  /(curl|wget|lynx|links)\s+.*\|\s*(ba)?sh/,
  /git\s+clone\s+.*\|\s*(ba)?sh/,
  // 修改根目录权限
  /^\s*chmod\s+(-R\s+)?(0?777|a\+rwx)\s+\//,
  /^\s*chown\s+-R\s+\S+\s+\//,
  // Shell 命令替换注入 — 允许 echo/printf 等纯输出命令中使用
  /^\s*(?!(echo|printf|cat|head|tail|wc|ls|pwd|date|whoami|hostname|uname|id|env|printenv|which|type)\s).*`[^`]*`/,
  /^\s*(?!(echo|printf|cat|head|tail|wc|ls|pwd|date|whoami|hostname|uname|id|env|printenv|which|type)\s).*\$\s*\([^)]*\)/,
  // Windows 高危破坏性命令（大小写不敏感）
  /^\s*format\s+[a-zA-Z]:/i,                                                          // 格式化磁盘
  /^\s*diskpart\b/i,                                                                  // 磁盘分区操作
  /^\s*>\s*[a-zA-Z]:[\\\/][^\n]*[\\\/]Windows[\\\/]System32[\\\/]config[\\\/](SAM|SYSTEM|SECURITY|DEFAULT|NTUSER)/i, // 覆盖注册表蜂巢
  /^\s*>\s*[a-zA-Z]:[\\\/][^\n]*[\\\/]drivers[\\\/]etc[\\\/]hosts/i,                  // 覆盖 hosts
];
const SCRIPT_EXTENSIONS = '(sh|bash|zsh|py|js|mjs|rb|pl|php|lua)';
const SCRIPT_INTERPRETERS = '(bash|sh|zsh|python3?|node|ruby|perl|php|lua)';

const GRAYLIST_PATTERNS = [
  { pattern: /^\s*sudo\s/, reason: '命令需要管理员权限 (sudo)' },
  { pattern: /npm\s+(i|install)\s+-g\s/, reason: '全局安装 npm 包' },
  { pattern: /pip\s+(install|uninstall)\s/, reason: 'pip 安装/卸载包' },
  { pattern: /^\s*chmod\s+-R\s+777\s/, reason: '递归修改权限为 777' },
  { pattern: /^\s*rm\s+-rf\s+(?!\/|~)/, reason: '递归强制删除文件/目录' },
  { pattern: /git\s+push\s+(-f|--force)/, reason: 'Git 强制推送' },
  { pattern: /^\s*(shutdown|reboot|halt|poweroff)/, reason: '关机或重启系统' },
  { pattern: /^\s*>\s*\/etc\/hosts/, reason: '修改系统 hosts 文件' },
  { pattern: /\beval\s+/, reason: '使用 eval 执行命令' },

  // 脚本解释器执行外部文件
  { pattern: new RegExp(`^\\s*${SCRIPT_INTERPRETERS}(\\s+[^-]\\S*)*\\s+\\S*\\.${SCRIPT_EXTENSIONS}\\b`), reason: '执行外部脚本文件' },
  // 直接执行脚本
  { pattern: new RegExp(`^\\s*\\.?\\/\\S*\\.${SCRIPT_EXTENSIONS}\\b`), reason: '直接执行脚本文件' },
  // chmod +x 授予执行权限
  { pattern: /^\s*chmod\s+(\+x|a\+x|u\+x|g\+x|o\+x|[0-7]*[1-7][0-9][0-9])\s/, reason: '修改文件执行权限' },

  // Windows 命令（大小写不敏感）
  { pattern: /^\s*rmdir?\s+\/s\b/i, reason: '递归删除目录 (rd/rmdir /s)' },
  { pattern: /^\s*(del|erase)\s+\/[a-zA-Z]*f/i, reason: '强制删除文件 (del /f)' },
  { pattern: /^\s*icacls\b/i, reason: '修改文件权限 (icacls)' },
  { pattern: /^\s*takeown\b/i, reason: '夺取文件所有权 (takeown)' },
  { pattern: /^\s*reg\s+(add|delete|import|load|restore)\b/i, reason: '修改注册表 (reg)' },
  { pattern: /^\s*net\s+(user|localgroup)\b/i, reason: '用户/用户组管理 (net)' },
  { pattern: /^\s*sc\s+(stop|delete|config)\b/i, reason: '服务管理 (sc)' },
  { pattern: /^\s*taskkill\s+\/[a-zA-Z]*f/i, reason: '强制结束进程 (taskkill /f)' },
];

/**
 * 检查命令安全性
 * @param {boolean} [force=false] - 用户已确认（跳过灰名单但保留黑名单）
 * @returns {{ safe: boolean, level: 'allow'|'confirm'|'deny', reason?: string }}
 */
function checkCommand(command, force = false) {
  if (!command || typeof command !== 'string') {
    return { safe: false, level: 'deny', reason: '命令无效' };
  }

  const trimmed = command.trim();

  // 1. 黑名单始终生效（即使是 force 模式也不可绕过）
  for (const pattern of BLACKLIST_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        safe: false,
        level: 'deny',
        reason: `高危命令被拦截: "${trimmed.substring(0, 100)}"`
      };
    }
  }

  // 1.5 禁止访问核心敏感文件（通过命令也一样拦截）
  // Windows 文件系统不区分大小写，归一化比较防止 .AI-HELPER-AGENT 等大小写变换绕过
  const cmpTrimmed = isWin32 ? trimmed.toLowerCase() : trimmed;
  for (const blocked of HARD_BLOCKED_PATHS) {
    const cmpBlocked = isWin32 ? blocked.toLowerCase() : blocked;
    if (cmpTrimmed.includes(cmpBlocked)) {
      return {
        safe: false,
        level: 'deny',
        reason: '禁止访问代理系统文件'
      };
    }
  }

  // 2. 强制模式：跳过灰名单检查
  if (force) {
    return { safe: true, level: 'allow' };
  }

  // 3. 检查灰名单
  for (const entry of GRAYLIST_PATTERNS) {
    if (entry.pattern.test(trimmed)) {
      return {
        safe: false,
        level: 'confirm',
        reason: entry.reason
      };
    }
  }

  // 4. 通过安全检查
  return { safe: true, level: 'allow' };
}

export { checkPath, checkCommand };
