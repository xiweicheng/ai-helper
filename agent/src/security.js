// agent/src/security.js - 安全管控：文件沙箱 + 命令分级
import { resolve, normalize, isAbsolute } from 'path';
import { loadConfig } from './config.js';

/**
 * 检查路径是否在白名单内
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkPath(pathStr) {
  if (!pathStr || typeof pathStr !== 'string') {
    return { allowed: false, reason: '路径无效' };
  }

  const resolved = resolve(pathStr);
  const normalized = normalize(resolved);

  // 防路径穿越（如 ../../etc/passwd）
  const config = loadConfig();
  const allowedPaths = config.allowedPaths.length > 0 ? config.allowedPaths : [config.workdir];

  for (const allowed of allowedPaths) {
    const allowedResolved = resolve(allowed);
    if (normalized.startsWith(allowedResolved + '/') || normalized === allowedResolved) {
      return { allowed: true, resolved: normalized };
    }
  }

  return {
    allowed: false,
    reason: `路径 "${pathStr}" 不在允许的目录范围内。允许的目录: ${allowedPaths.join(', ')}`
  };
}

// ==================== 命令分级管控 ====================

// 黑名单模式 - 直接拒绝，不可绕过
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
  // 恶意管道执行
  /(curl|wget|lynx|links)\s+.*\|\s*(ba)?sh/,
  /git\s+clone\s+.*\|\s*(ba)?sh/,
  // 修改根目录权限
  /^\s*chmod\s+(-R\s+)?(0?777|a\+rwx)\s+\//,
  /^\s*chown\s+-R\s+\S+\s+\//,
];

// 灰名单模式 - 弹确认框，用户可放行
const GRAYLIST_PATTERNS = [
  // sudo 命令
  { pattern: /^\s*sudo\s/, reason: '命令需要管理员权限 (sudo)' },
  // 全局 npm 安装
  { pattern: /npm\s+(i|install)\s+-g\s/, reason: '全局安装 npm 包' },
  { pattern: /pip\s+(install|uninstall)\s/, reason: 'pip 安装/卸载包' },
  // 递归权限修改（非根目录）
  { pattern: /^\s*chmod\s+-R\s+777\s/, reason: '递归修改权限为 777' },
  // 递归删除（非根目录）
  { pattern: /^\s*rm\s+-rf\s+(?!\/|~)/, reason: '递归强制删除文件/目录' },
  // 强制推送
  { pattern: /git\s+push\s+(-f|--force)/, reason: 'Git 强制推送' },
  // 关机/重启
  { pattern: /^\s*(shutdown|reboot|halt|poweroff)/, reason: '关机或重启系统' },
  // 修改 hosts
  { pattern: /^\s*>\s*\/etc\/hosts/, reason: '修改系统 hosts 文件' },
  // eval 执行
  { pattern: /\beval\s+/, reason: '使用 eval 执行命令' },
];

/**
 * 检查命令安全性
 * @returns {{ safe: boolean, level: 'allow'|'confirm'|'deny', reason?: string }}
 */
function checkCommand(command) {
  if (!command || typeof command !== 'string') {
    return { safe: false, level: 'deny', reason: '命令无效' };
  }

  const trimmed = command.trim();

  // 1. 先检查黑名单
  for (const pattern of BLACKLIST_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        safe: false,
        level: 'deny',
        reason: `高危命令被拦截: "${trimmed.substring(0, 100)}"`
      };
    }
  }

  // 2. 检查灰名单
  for (const entry of GRAYLIST_PATTERNS) {
    if (entry.pattern.test(trimmed)) {
      return {
        safe: false,
        level: 'confirm',
        reason: entry.reason
      };
    }
  }

  // 3. 通过安全检查
  return { safe: true, level: 'allow' };
}

export { checkPath, checkCommand };
