// agent/src/i18n.js - 代理端国际化模块
// 解析 HTTP 请求的 Accept-Language 头，返回对应语言的文案
// 默认中文（zh），支持英文（en）

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 加载语言包
const translations = {
  zh: JSON.parse(readFileSync(join(__dirname, 'locales', 'zh.json'), 'utf-8')),
  en: JSON.parse(readFileSync(join(__dirname, 'locales', 'en.json'), 'utf-8')),
};

const DEFAULT_LANG = 'zh';
const SUPPORTED_LANGS = Object.keys(translations);

/**
 * 从 Accept-Language 头解析最佳匹配语言
 * 支持格式：zh, zh-CN, en-US, zh;q=0.9,en;q=0.8
 * @param {string} [acceptLanguage] - Accept-Language 头的值
 * @returns {string} 匹配的语言代码（zh 或 en）
 */
export function parseAcceptLanguage(acceptLanguage) {
  if (!acceptLanguage || typeof acceptLanguage !== 'string') return DEFAULT_LANG;

  // 解析语言列表并按权重排序
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
    // 精确匹配
    if (SUPPORTED_LANGS.includes(code)) return code;
    // 前缀匹配（如 zh-CN → zh）
    const prefix = code.split('-')[0];
    if (SUPPORTED_LANGS.includes(prefix)) return prefix;
  }

  return DEFAULT_LANG;
}

/**
 * 翻译函数
 * @param {string} lang - 语言代码
 * @param {string} key - 翻译键（支持点号分隔，如 'error.fileNotFound'）
 * @param {object} [params] - 插值参数（如 { path: '/foo' } 替换 {path}）
 * @returns {string} 翻译后的文本，找不到则返回 key
 */
export function t(lang, key, params) {
  const dict = translations[lang] || translations[DEFAULT_LANG];
  let value = key
    .split('.')
    .reduce((obj, k) => (obj && typeof obj === 'object' ? obj[k] : undefined), dict);

  // 回退到默认语言
  if (value === undefined && lang !== DEFAULT_LANG) {
    value = key
      .split('.')
      .reduce((obj, k) => (obj && typeof obj === 'object' ? obj[k] : undefined), translations[DEFAULT_LANG]);
  }

  if (value === undefined) return key;

  // 参数插值
  if (params && typeof value === 'string') {
    return value.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? params[name] : `{${name}}`));
  }

  return value;
}

/**
 * 从 HTTP 请求中提取语言并返回翻译函数
 * @param {import('http').IncomingMessage} req - HTTP 请求对象
 * @returns {{ lang: string, t: (key: string, params?: object) => string }}
 */
export function getRequestI18n(req) {
  const lang = parseAcceptLanguage(req.headers['accept-language']);
  return {
    lang,
    t: (key, params) => t(lang, key, params),
  };
}
