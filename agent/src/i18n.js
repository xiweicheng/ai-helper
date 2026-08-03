// agent/src/i18n.js - Agent-side i18n module
// Parses HTTP request Accept-Language header and returns localized strings
// Default: English (en), supports Chinese (zh)

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load language packs
const translations = {
  zh: JSON.parse(readFileSync(join(__dirname, 'locales', 'zh.json'), 'utf-8')),
  en: JSON.parse(readFileSync(join(__dirname, 'locales', 'en.json'), 'utf-8')),
};

// Default language: check env var (set by CLI), fallback to 'en'
const DEFAULT_LANG = (process.env.AI_HELPER_LANG === 'zh') ? 'zh' : 'en';
const SUPPORTED_LANGS = Object.keys(translations);

/**
 * Parse best matching language from Accept-Language header
 * Supports: zh, zh-CN, en-US, zh;q=0.9,en;q=0.8
 * @param {string} [acceptLanguage] - Accept-Language header value
 * @returns {string} Matched language code (zh or en)
 */
export function parseAcceptLanguage(acceptLanguage) {
  if (!acceptLanguage || typeof acceptLanguage !== 'string') return DEFAULT_LANG;

  // Parse language list and sort by weight
  const langs = acceptLanguage
    .split(',')
    .map(part => {
      const [code, ...params] = part.trim().split(';');
      const qParam = params.find(p => p.trim().startsWith('q='));
      const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1;
      return { code: code.trim().toLowerCase(), q };
    })
    .filter(item => item.code)
    .sort((a, b) => b.q - a.q);

  for (const { code } of langs) {
    // Exact match
    if (SUPPORTED_LANGS.includes(code)) return code;
    // Prefix match (e.g. zh-CN → zh)
    const prefix = code.split('-')[0];
    if (SUPPORTED_LANGS.includes(prefix)) return prefix;
  }

  return DEFAULT_LANG;
}

/**
 * Translation function
 * @param {string} lang - Language code
 * @param {string} key - Translation key (supports dot notation, e.g. 'error.fileNotFound')
 * @param {object} [params] - Interpolation params (e.g. { path: '/foo' } replaces {path})
 * @returns {string} Translated text, returns key if not found
 */
export function t(lang, key, params) {
  const dict = translations[lang] || translations[DEFAULT_LANG];
  let value = key
    .split('.')
    .reduce((obj, k) => (obj && typeof obj === 'object' ? obj[k] : undefined), dict);

  // Fallback to default language
  if (value === undefined && lang !== DEFAULT_LANG) {
    value = key
      .split('.')
      .reduce((obj, k) => (obj && typeof obj === 'object' ? obj[k] : undefined), translations[DEFAULT_LANG]);
  }

  if (value === undefined) return key;

  // Parameter interpolation
  if (params && typeof value === 'string') {
    return value.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? params[name] : `{${name}}`));
  }

  return value;
}

/**
 * Extract language from HTTP request and return translation function
 * @param {import('http').IncomingMessage} req - HTTP request object
 * @returns {{ lang: string, t: (key: string, params?: object) => string }}
 */
export function getRequestI18n(req) {
  const lang = parseAcceptLanguage(req.headers['accept-language']);
  return {
    lang,
    t: (key, params) => t(lang, key, params),
  };
}
