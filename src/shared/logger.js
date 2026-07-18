const LOG_LEVEL = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

let currentLevel = LOG_LEVEL.DEBUG;

export function setLogLevel(level) {
  currentLevel = level;
}

export function getLogLevel() {
  return currentLevel;
}

export function debug(...args) {
  if (currentLevel <= LOG_LEVEL.DEBUG) {
    console.debug('[AIH]', ...args);
  }
}

export function info(...args) {
  if (currentLevel <= LOG_LEVEL.INFO) {
    console.info('[AIH]', ...args);
  }
}

export function warn(...args) {
  if (currentLevel <= LOG_LEVEL.WARN) {
    console.warn('[AIH]', ...args);
  }
}

export function error(...args) {
  if (currentLevel <= LOG_LEVEL.ERROR) {
    console.error('[AIH]', ...args);
  }
}

export const logger = {
  debug,
  info,
  warn,
  error,
  setLogLevel,
  getLogLevel
};

export default logger;