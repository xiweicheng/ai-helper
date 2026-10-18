/**
 * AI Helper 主题读写与跨环境同步
 * 机制来源：docs/superpowers/specs/2026-10-18-theme-switching-design.md §3
 * 约定：偏好 preference = 'light' | 'dark' | 'system'（持久化于 chrome.storage.local 的 appTheme）；
 *      生效值 resolved = 'light' | 'dark'（写到 <html data-theme> 上，供 CSS 变量翻转）。
 * 防闪烁：模块顶层同步读 localStorage 镜像 appThemeResolved 立即打标，正式值由 initTheme() 覆盖。
 */

const KEY = 'appTheme';
const VALID = ['light', 'dark', 'system'];
let preference = 'light';
let resolved = 'light';
let mq = null;
let mqHandler = null;
const subscribers = [];
let listenerBound = false;

function apply(next) {
  const changed = next !== resolved;
  resolved = next;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', next);
  }
  try { localStorage.setItem('appThemeResolved', next); } catch (e) { /* 隐私模式兜底 */ }
  // 仅在生效值真正变化时通知订阅者：吞掉本页 setTheme→onChanged 回声与 system 未变的重复触发
  if (!changed) return;
  subscribers.slice().forEach((cb) => {
    try { cb(next); } catch (e) { console.warn('[theme] subscriber error', e); }
  });
}

function resolve(pref) {
  if (pref === 'system') {
    return (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  return pref === 'dark' ? 'dark' : 'light';
}

// 防闪烁：顶层同步读镜像缓存，早于 initTheme() 的异步 storage 读取先落一次属性
(function applyFromCache() {
  try {
    const v = (typeof localStorage !== 'undefined') && localStorage.getItem('appThemeResolved');
    if (v === 'dark' || v === 'light') {
      resolved = v;
      if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', v);
    }
  } catch (e) { /* 忽略 */ }
})();

export function getTheme() { return preference; }
export function getResolvedTheme() { return resolved; }
export function subscribeTheme(cb) { subscribers.push(cb); }

export async function initTheme() {
  if (typeof matchMedia !== 'undefined') {
    mq = matchMedia('(prefers-color-scheme: dark)');
    if (mqHandler) mq.removeEventListener('change', mqHandler);
    mqHandler = () => { if (preference === 'system') apply(resolve('system')); };
    mq.addEventListener('change', mqHandler);
  }
  if (!listenerBound && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.appTheme && VALID.includes(changes.appTheme.newValue)) {
        preference = changes.appTheme.newValue;
        apply(resolve(preference));
      }
    });
    listenerBound = true;
  }
  const stored = await new Promise((r) => {
    try {
      chrome.storage.local.get([KEY], (o) => {
        if (chrome.runtime && chrome.runtime.lastError) { r(null); return; }
        r(o || {});
      });
    } catch (e) { r(null); }
  });
  // storage 读取失败时保留顶层镜像已应用的生效主题，不强行回落 light（避免暗色用户偶发变亮）
  if (stored === null) return;
  preference = VALID.includes(stored[KEY]) ? stored[KEY] : 'light';
  apply(resolve(preference));
}

export async function setTheme(pref) {
  if (!VALID.includes(pref)) return;
  preference = pref;
  apply(resolve(pref));
  await new Promise((r) => chrome.storage.local.set({ appTheme: pref }, r));
}
