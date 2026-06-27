// agent/src/logger.js - 审计日志模块（JSON Lines 格式，按日轮转，自动清理）
import { appendFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const LOG_DIR = join(homedir(), '.ai-helper-agent', 'logs');
const MAX_LOG_FILES = 30;          // 最多保留 30 个日志文件
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 单文件最大 10MB

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * 获取当天日志文件路径
 */
function getLogFile() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  return join(LOG_DIR, `agent-${date}.log`);
}

/**
 * 清理旧日志文件（保留最近 MAX_LOG_FILES 个，删除超大文件）
 */
function cleanOldLogs() {
  try {
    const files = readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.log'))
      .map(f => {
        const path = join(LOG_DIR, f);
        const stat = statSync(path);
        return { name: f, path, mtime: stat.mtimeMs, size: stat.size };
      })
      .sort((a, b) => b.mtime - a.mtime); // 最新的在前面

    let deleted = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      // 超过保留数量，或单文件超过大小限制
      if (i >= MAX_LOG_FILES || f.size > MAX_LOG_SIZE) {
        try { unlinkSync(f.path); deleted++; } catch {}
      }
    }
    if (deleted > 0) {
      console.log(`[Logger] 清理了 ${deleted} 个旧日志文件`);
    }
  } catch {}
}

/**
 * 写入一条日志
 * @param {'info'|'warn'|'error'} level - 日志级别
 * @param {'auth'|'fs'|'exec'|'security'|'system'} category - 日志分类
 * @param {string} action - 操作名称
 * @param {Object} details - 详细信息
 */
function log(level, category, action, details = {}) {
  try {
    ensureLogDir();
    cleanOldLogs(); // 每次写入时顺便清理（频率不高，影响可忽略）

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      action,
      ...details
    };

    appendFileSync(getLogFile(), JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    // 日志写入失败不应影响主流程
    console.error('[Logger] 日志写入失败:', err.message);
  }
}

// ==================== 便捷方法 ====================

function logAuth(action, details) { log('info', 'auth', action, details); }
function logFs(action, details) { log('info', 'fs', action, details); }
function logExec(action, details) { log('info', 'exec', action, details); }
function logSecurity(action, details) { log('warn', 'security', action, details); }
function logSystem(action, details) { log('info', 'system', action, details); }
function logError(category, action, details) { log('error', category, action, details); }

/**
 * 查询日志（用于 /api/logs 端点）
 * @param {Object} options - 查询选项
 * @param {string} [options.date] - 日期 (YYYY-MM-DD)
 * @param {string} [options.category] - 分类过滤
 * @param {number} [options.limit=200] - 返回条数上限
 * @param {number} [options.offset=0] - 偏移量
 * @returns {{ entries: Array, total: number }}
 */
function queryLogs(options = {}) {
  const { date, category, limit = 200, offset = 0 } = options;

  let filePath;
  if (date) {
    filePath = join(LOG_DIR, `agent-${date}.log`);
  } else {
    filePath = getLogFile();
  }

  let entries = [];
  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8');
      const lines = raw.trim().split('\n');
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (category && entry.category !== category) continue;
          entries.push(entry);
        } catch {}
      }
    }
  } catch {}

  // 按时间倒序（最新的在前）
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const total = entries.length;
  entries = entries.slice(offset, offset + limit);

  return { entries, total };
}

/**
 * 获取可用日志日期列表
 */
function getLogDates() {
  try {
    ensureLogDir();
    const files = readdirSync(LOG_DIR)
      .filter(f => f.match(/^agent-\d{4}-\d{2}-\d{2}\.log$/))
      .map(f => f.replace('agent-', '').replace('.log', ''))
      .sort()
      .reverse();
    return files;
  } catch {
    return [];
  }
}

export { log, logAuth, logFs, logExec, logSecurity, logSystem, logError, queryLogs, getLogDates };
