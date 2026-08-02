// i18n.js - 轻量国际化模块
// 提供同步的 t(key, params) 查表 + 参数插值，支持运行时语言切换与订阅刷新
//
// 用法:
//   import { t, setLanguage, getLanguage, subscribe, applyI18n, initI18n } from '../shared/i18n.js';
//   t('common.confirm')                       // → "确认"
//   t('dialog.remainingTime', { time: '1:30' }) // → "剩余时间: 1:30"
//
// HTML 占位（语言切换/页面加载时调用 applyI18n 自动填充）:
//   <button data-i18n="common.confirm">确认</button>
//   <input data-i18n-placeholder="ui.inputPlaceholder" />
//   <span data-i18n-title="ui.tip" title="x"></span>

import zh from './locales/zh.js';
import en from './locales/en.js';

// 支持的语言列表（顺序即 UI 展示顺序）
export const SUPPORTED_LANGUAGES = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
];

export const DEFAULT_LANGUAGE = 'zh';

// 当前语言
let currentLang = DEFAULT_LANGUAGE;

// 各语言翻译字典：{ zh: {...}, en: {...} }
const translations = { zh, en };

// 语言变更订阅者集合
const subscribers = new Set();

/**
 * 在字典中按点分 key 查找（如 'common.confirm'）
 * @param {object} dict
 * @param {string} key
 * @returns {string|undefined}
 */
function lookup(dict, key) {
  if (!dict || !key) return undefined;
  const parts = key.split('.');
  let cur = dict;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * 参数插值：将 {name} 替换为 params.name
 * @param {string} str
 * @param {object} [params]
 * @returns {string}
 */
function interpolate(str, params) {
  if (!params || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (m, name) =>
    (params[name] !== undefined && params[name] !== null) ? String(params[name]) : m
  );
}

/**
 * 翻译
 * 查找顺序: 当前语言 → 英文 fallback → key 本身（不报错）
 * @param {string} key - 点分 key，如 'common.confirm'
 * @param {object} [params] - 插值参数，如 { name: 'x.js' }
 * @returns {string}
 */
export function t(key, params) {
  const fromCur = lookup(translations[currentLang], key);
  if (fromCur !== undefined) return interpolate(fromCur, params);
  // 英文 fallback（避免当前语言缺 key 时直接显示原始 key）
  if (currentLang !== 'en') {
    const fromEn = lookup(translations.en, key);
    if (fromEn !== undefined) return interpolate(fromEn, params);
  }
  // 最终 fallback: 返回 key 本身，便于发现遗漏
  return key;
}

/**
 * 获取当前语言代码
 * @returns {string}
 */
export function getLanguage() {
  return currentLang;
}

/**
 * 设置当前语言并持久化，通知所有订阅者
 * @param {string} lang - 语言代码，如 'zh' / 'en'
 * @param {boolean} [persist=true] - 是否写入 chrome.storage.local
 */
export function setLanguage(lang, persist = true) {
  if (!lang || lang === currentLang) return;
  if (!translations[lang]) {
    // 未知语言，忽略
    return;
  }
  currentLang = lang;
  if (persist && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ language: lang }).catch(() => {});
  }
  // 通知订阅者
  for (const cb of subscribers) {
    try { cb(lang); } catch (e) { /* 单个订阅者异常不影响其它 */ }
  }
}

/**
 * 订阅语言变更
 * @param {(lang: string) => void} callback
 * @returns {() => void} 取消订阅函数
 */
export function subscribe(callback) {
  if (typeof callback === 'function') subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/**
 * 注册/合并某个语言的翻译字典（各模块可按需追加自己的文案）
 * @param {string} lang
 * @param {object} dict
 */
export function registerTranslations(lang, dict) {
  if (!translations[lang]) translations[lang] = {};
  translations[lang] = deepMerge(translations[lang], dict);
}

function deepMerge(target, source) {
  for (const k of Object.keys(source || {})) {
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      if (!target[k] || typeof target[k] !== 'object') target[k] = {};
      deepMerge(target[k], source[k]);
    } else {
      target[k] = source[k];
    }
  }
  return target;
}

// 防止 storage.onChanged 监听重复注册
let storageListenerBound = false;

/**
 * 初始化语言：从 chrome.storage.local 读取已保存的语言偏好
 * 并注册 storage.onChanged 监听，实现 background / side_panel / options / content 跨环境同步
 * 应在各环境启动时调用
 * @returns {Promise<string>} 实际生效的语言代码
 */
export async function initI18n() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return currentLang;
  }
  try {
    const result = await chrome.storage.local.get('language');
    if (result.language && translations[result.language]) {
      // 不持久化（避免重复写），仅设置内存
      currentLang = result.language;
    }
  } catch (e) {
    // 读取失败，保持默认语言
  }
  // 监听 storage 变更，跨环境同步语言（不持久化，避免循环写入）
  if (!storageListenerBound) {
    storageListenerBound = true;
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes.language) return;
        const newLang = changes.language.newValue;
        if (newLang && translations[newLang] && newLang !== currentLang) {
          currentLang = newLang;
          for (const cb of subscribers) {
            try { cb(newLang); } catch (e) { /* 单个订阅者异常不影响其它 */ }
          }
        }
      });
    } catch (e) {
      // 某些环境无 storage.onChanged，忽略
    }
  }
  return currentLang;
}

/**
 * 将 DOM 中带 data-i18n* 属性的元素填充为对应语言文案
 * 在页面加载后、语言切换后调用
 * @param {ParentNode} [root=document]
 */
export function applyI18n(root) {
  if (typeof document === 'undefined') return;
  const scope = root || document;

  // textContent
  scope.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  // placeholder
  scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.placeholder = t(key);
  });
  // title
  scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);
  });
  // aria-label
  scope.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key) el.setAttribute('aria-label', t(key));
  });
}

export default {
  t,
  getLanguage,
  setLanguage,
  subscribe,
  registerTranslations,
  initI18n,
  applyI18n,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
};
