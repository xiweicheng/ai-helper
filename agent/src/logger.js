// agent/src/logger.js - Audit log module (JSON Lines format, daily rotation, auto cleanup)
import { appendFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { detectSystemLang } from './sys-lang.js';

const LOG_DIR = join(homedir(), '.ai-helper-agent', 'logs');
const MAX_LOG_FILES = 30;               // Max log files to retain
const MAX_LOG_SIZE = 10 * 1024 * 1024;  // Max single file size 10MB
const CLEAN_INTERVAL_MS = 60_000;       // Cleanup interval (60s)
const QUERY_MAX_LIMIT = 1000;           // Max query entries per request

// Whether to write logs to stderr
let consoleOutput = false;

/**
 * Enable/disable console output (enabled in foreground mode)
 */
function setConsoleOutput(enabled) {
  consoleOutput = enabled;
}

// Category labels with locale support
const CATEGORY_LABELS_ZH = {
  auth: '认证', fs: '文件', exec: '命令', security: '安全', system: '系统'
};

const CATEGORY_LABELS_EN = {
  auth: 'Auth', fs: 'File', exec: 'Exec', security: 'Security', system: 'System'
};

let currentLocale = (() => {
  const env = process.env.AI_HELPER_LANG;
  if (env === 'zh' || env === 'en') return env;
  return detectSystemLang();
})();

/**
 * Set locale for log category labels
 */
export function setLoggerLocale(locale) {
  if (locale === 'zh' || locale === 'en') {
    currentLocale = locale;
  }
}

function getCategoryLabels() {
  return currentLocale === 'zh' ? CATEGORY_LABELS_ZH : CATEGORY_LABELS_EN;
}

const LEVEL_LABELS = { info: 'INFO', warn: 'WARN', error: 'ERROR' };

/**
 * 格式化详情为可读字符串
 */
function formatDetails(details) {
  if (!details || Object.keys(details).length === 0) return '';
  const parts = [];
  for (const [key, val] of Object.entries(details)) {
    if (val !== undefined && val !== null) {
      const str = typeof val === 'string' ? val : JSON.stringify(val);
      if (str.length > 120) {
        parts.push(`${key}=${str.slice(0, 120)}...`);
      } else {
        parts.push(`${key}=${str}`);
      }
    }
  }
  return parts.join(' ');
}

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * 获取当天日志文件路径
 */
function getLogFile(date) {
  if (date) return join(LOG_DIR, `agent-${date}.log`);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  return join(LOG_DIR, `agent-${dateStr}.log`);
}

// Cleanup throttle: record last cleanup time
let lastCleanTime = 0;

/**
 * Clean up old log files (keep latest MAX_LOG_FILES + remove oversized files)
 * Throttled: minimum CLEAN_INTERVAL_MS between runs
 */
function cleanOldLogs() {
  const now = Date.now();
  if (now - lastCleanTime < CLEAN_INTERVAL_MS) return;
  lastCleanTime = now;

  try {
    ensureLogDir();
    const files = readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.log'))
      .map(f => {
        const path = join(LOG_DIR, f);
        const stat = statSync(path);
        return { name: f, path, mtime: stat.mtimeMs, size: stat.size };
      })
      .sort((a, b) => b.mtime - a.mtime); // newest first

    let deleted = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      // Over retention limit or over size limit
      if (i >= MAX_LOG_FILES || f.size > MAX_LOG_SIZE) {
        try { unlinkSync(f.path); deleted++; } catch {}
      }
    }
    if (deleted > 0) {
      console.error(`[Logger] Cleaned up ${deleted} old log file(s)`);
    }
  } catch {}
}

/**
 * Write a log entry
 * @param {'info'|'warn'|'error'} level - Log level
 * @param {'auth'|'fs'|'exec'|'security'|'system'} category - Log category
 * @param {string} action - Operation name
 * @param {Object} details - Additional details
 */
function log(level, category, action, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    action,
    ...details
  };

  // Output to stderr (visible in foreground mode)
  if (consoleOutput) {
    const time = entry.timestamp.slice(11, 19); // HH:MM:SS
    const levelTag = LEVEL_LABELS[level] || level.toUpperCase();
    const labels = getCategoryLabels();
    const catTag = labels[category] || category;
    const detailStr = formatDetails(details);
    const msg = detailStr
      ? `[${time}] [${levelTag}] [${catTag}:${action}] ${detailStr}`
      : `[${time}] [${levelTag}] [${catTag}:${action}]`;
    process.stderr.write(msg + '\n');
  }

  // Write to file
  try {
    ensureLogDir();
    cleanOldLogs();
    appendFileSync(getLogFile(), JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    // Log write failure should not affect main flow
    console.error(`[Logger] Failed to write log: ${err.message}`);
  }
}

// ==================== Convenience methods ====================

function logAuth(action, details) { log('info', 'auth', action, details); }
function logFs(action, details) { log('info', 'fs', action, details); }
function logExec(action, details) { log('info', 'exec', action, details); }
function logSecurity(action, details) { log('warn', 'security', action, details); }
function logSystem(action, details) { log('info', 'system', action, details); }
function logError(category, action, details) { log('error', category, action, details); }

/**
 * Query logs (for /api/logs endpoint)
 * @param {Object} options - Query options
 * @param {string} [options.date] - Date (YYYY-MM-DD)
 * @param {string} [options.category] - Category filter
 * @param {number} [options.limit=200] - Max entries to return
 * @param {number} [options.offset=0] - Offset
 * @returns {{ entries: Array, total: number }}
 */
function queryLogs(options = {}) {
  const { date, category, limit: rawLimit = 200, offset = 0 } = options;
  const limit = Math.min(rawLimit, QUERY_MAX_LIMIT);

  const filePath = getLogFile(date);

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

  // Sort by timestamp descending (newest first)
  entries.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  const total = entries.length;
  entries = entries.slice(offset, offset + limit);

  return { entries, total };
}

/**
 * Get available log date list
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

export { setConsoleOutput, log, logAuth, logFs, logExec, logSecurity, logSystem, logError, queryLogs, getLogDates };
