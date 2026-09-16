// debugger-rules.js - debug_page 工具的纯规则函数（零依赖，可直接在 node 下单测）
//
// 从 debugger-session.js / tool-debugger.js 中抽出的无 chrome.* 依赖逻辑：
// - 受限页面判定
// - 键盘按键规格解析
// - 字符串截断 / 网络条目序列化 / base64 解码

// ───────────────────────── 受限页面 ─────────────────────────

// 不可附着的页面前缀
export const RESTRICTED_PREFIXES = [
  'chrome://', 'chrome-extension://', 'chrome-search://',
  'edge://', 'about:', 'chrome-error://', 'view-source:',
  'devtools://', 'https://chrome.google.com',
  'https://chromewebstore.google.com',
];

/**
 * 判断 URL 是否为不可调试的受限页面
 * @param {string} url
 * @returns {boolean} 空值也视为受限（无有效页面可附着）
 */
export function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_PREFIXES.some(prefix => url.startsWith(prefix));
}

// ───────────────────────── 键盘按键解析 ─────────────────────────

// CDP 键盘修饰符位掩码（Input.dispatchKeyEvent 的 modifiers 字段）
export const KEY_MODIFIERS = {
  Alt: 1,
  Control: 2,
  Ctrl: 2,
  Meta: 4,
  Command: 4,
  Cmd: 4,
  Shift: 8,
};

// 特殊键 → { keyCode(Windows virtual key code), code(物理键位) }
export const SPECIAL_KEYS = {
  Enter: { keyCode: 13, code: 'Enter' },
  Tab: { keyCode: 9, code: 'Tab' },
  Escape: { keyCode: 27, code: 'Escape' },
  Esc: { keyCode: 27, code: 'Escape' },
  Backspace: { keyCode: 8, code: 'Backspace' },
  Delete: { keyCode: 46, code: 'Delete' },
  Space: { keyCode: 32, code: 'Space' },
  Home: { keyCode: 36, code: 'Home' },
  End: { keyCode: 35, code: 'End' },
  PageUp: { keyCode: 33, code: 'PageUp' },
  PageDown: { keyCode: 34, code: 'PageDown' },
  Insert: { keyCode: 45, code: 'Insert' },
  ArrowLeft: { keyCode: 37, code: 'ArrowLeft' },
  ArrowUp: { keyCode: 38, code: 'ArrowUp' },
  ArrowRight: { keyCode: 39, code: 'ArrowRight' },
  ArrowDown: { keyCode: 40, code: 'ArrowDown' },
};
for (let i = 1; i <= 12; i++) SPECIAL_KEYS[`F${i}`] = { keyCode: 111 + i, code: `F${i}` };

/**
 * 解析按键规格字符串为 CDP keyEvent 参数片段
 * 支持："Enter"、"Tab"、"a"、"0"、"Control+a"、"Ctrl+Shift+Enter"、"Cmd+C"
 *
 * @param {string} keySpec
 * @returns {{key:string, code:string, keyCode:number, modifiers:number}|null}
 *   非法修饰符 / 无法识别的主键返回 null
 */
export function parseKeySpec(keySpec) {
  if (typeof keySpec !== 'string' || !keySpec) return null;
  const parts = keySpec.split('+').map(s => s.trim());
  const main = parts.pop() || '';
  let modifiers = 0;
  for (const m of parts) {
    const bit = KEY_MODIFIERS[m];
    if (!bit) return null;
    modifiers |= bit;
  }
  // 特殊键
  const special = SPECIAL_KEYS[main];
  if (special) {
    return { key: main === 'Esc' ? 'Escape' : main, code: special.code, keyCode: special.keyCode, modifiers };
  }
  // 单字符（字母 / 数字）
  if (main.length === 1) {
    const upper = main.toUpperCase();
    const keyCode = upper.charCodeAt(0);
    let code = '';
    if (/[A-Z]/.test(upper)) code = `Key${upper}`;
    else if (/[0-9]/.test(upper)) code = `Digit${upper}`;
    return { key: main, code, keyCode, modifiers };
  }
  return null;
}

// ───────────────────────── 文本与数据处理 ─────────────────────────

/**
 * 超长字符串截断，附加被截断字符数说明
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
export function truncate(str, max) {
  if (typeof str !== 'string' || str.length <= max) return str;
  return str.slice(0, max) + `...[truncated ${str.length - max} chars]`;
}

/**
 * 网络录制条目序列化：只保留要返回给模型的字段，剥离内部字段（requestId 等）
 */
export function serializeNetworkEntry(e) {
  return {
    url: e.url,
    method: e.method,
    resourceType: e.resourceType,
    status: e.status,
    mimeType: e.mimeType,
    postData: e.postData,
    body: e.body,
    bodyTruncated: e.bodyTruncated,
  };
}

/**
 * base64 → UTF-8 字符串（CDP Network.getResponseBody 的 base64Encoded 响应体）
 * @param {string} base64
 * @returns {string}
 */
export function decodeBase64Utf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}
