// agent/src/security.js - 安全管控：文件沙箱 + 命令分级
import { resolve, normalize, sep, isAbsolute } from 'path';
import { realpathSync } from 'fs';
import { loadConfig } from './config.js';

/**
 * 检查路径是否在白名单内
 * 使用 realpathSync 防止符号链接绕过
 * @returns {{ allowed: boolean, reason?: string, resolved?: string }}
 */
function checkPath(pathStr) {
  if (!pathStr || typeof pathStr !== 'string') {
    return { allowed: false, reason: '路径无效' };
  }

  try {
    const config = loadConfig();

    // 相对路径基于 config.workdir 解析，而非 process.cwd()
    const resolved = isAbsolute(pathStr) ? resolve(pathStr) : resolve(config.workdir, pathStr);
    const normalized = normalize(resolved);

    const allowedPaths = config.allowedPaths.length > 0 ? config.allowedPaths : [config.workdir];

    // 先做前缀检查（快速路径，兼容 Windows/Unix）
    let prefixMatch = false;
    for (const allowed of allowedPaths) {
      const allowedResolved = resolve(allowed);
      // 统一使用 OS 分隔符构造前缀
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
      realPath = realpathSync(resolved);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // 文件不存在时，检查父目录
        const parentDir = resolve(resolved, '..');
        realPath = realpathSync(parentDir) + sep + normalized.split(sep).pop();
      } else {
        return { allowed: false, reason: `无法解析路径: ${err.message}` };
      }
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
  // Shell 命令替换注入（仅匹配反引号内的可执行命令模式）
  /`[^`]*`/,
  /\$\([^)]*\)/,
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
  { pattern: /^\s*chmod\s+(\+x|a\+x|u\+x|g\+x|o\+x|[0-7]*[1-7][0-7][0-7])\s/, reason: '修改文件执行权限' },
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
