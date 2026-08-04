// agent/src/sys-lang.js - Detect system language from the local environment
// Used as the final fallback when no explicit --lang flag or AI_HELPER_LANG env is set.
// This module is intentionally side-effect free so it can be imported before
// bin/agent.js sets process.env.AI_HELPER_LANG.
// Returns 'zh' or 'en'.

/**
 * Detect system language from environment signals.
 * Priority:
 *   1. LANGUAGE / LC_ALL / LC_MESSAGES / LANG env vars (Unix-like: macOS / Linux)
 *   2. Intl runtime default locale (fallback, useful on Windows)
 * @returns {'zh'|'en'}
 */
export function detectSystemLang() {
  for (const envName of ['LANGUAGE', 'LC_ALL', 'LC_MESSAGES', 'LANG']) {
    const val = process.env[envName];
    if (!val) continue;
    if (/^zh/i.test(val)) return 'zh';
    if (/^en/i.test(val)) return 'en';
  }
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    if (/^zh/i.test(locale)) return 'zh';
    if (/^en/i.test(locale)) return 'en';
  } catch {
    // Intl unavailable, fall through to 'en'
  }
  return 'en';
}
