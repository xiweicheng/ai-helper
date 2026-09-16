// debugger-rules.js - debug_page 工具的纯规则函数（零依赖，可直接在 node 下单测）
//
// 从 debugger-session.js / tool-debugger.js 中抽出的无 chrome.* 依赖逻辑：
// - 受限页面判定
// - 键盘按键规格解析
// - 字符串截断 / 网络条目序列化 / base64 解码

// ───────────────────────── 受限页面 ─────────────────────────

// 不可附着的页面 scheme 前缀（包含冒号、属于伪协议或浏览器内部页，无需主机边界判定）
export const RESTRICTED_PREFIXES = [
  'chrome://', 'chrome-extension://', 'chrome-search://',
  'edge://', 'about:', 'chrome-error://', 'view-source:', 'devtools://',
];

// 需按主机边界匹配的受限站点（不能直接 startsWith，
// 否则 `https://chrome.google.com.evil.com` 会被误判为受限）
export const RESTRICTED_HOSTS = [
  'chrome.google.com',
  'chromewebstore.google.com',
];

// 主机后的合法边界字符：结束 / 路径 / 查询 / 片段 / 端口
const HOST_BOUNDARY_CHARS = new Set(['', '/', '?', '#', ':']);

/**
 * 判断 URL 是否为不可调试的受限页面
 * @param {string} url
 * @returns {boolean} 空值也视为受限（无有效页面可附着）
 */
export function isRestrictedUrl(url) {
  if (!url) return true;
  if (RESTRICTED_PREFIXES.some(prefix => url.startsWith(prefix))) return true;
  for (const host of RESTRICTED_HOSTS) {
    const prefix = `https://${host}`;
    if (url.startsWith(prefix) && HOST_BOUNDARY_CHARS.has(url.charAt(prefix.length))) {
      return true;
    }
  }
  return false;
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
 * 网络录制条目序列化：返回给模型的字段集。
 * 早期版本丢弃了 requestHeaders/responseHeaders/startedAt，但 headers 对调试场景
 * （Authorization / Cookie / CORS）恰恰最有价值，且内存成本已付出——故完整暴露。
 * requestId 仅供内部 Map 索引，不返回。
 */
export function serializeNetworkEntry(e) {
  return {
    url: e.url,
    method: e.method,
    resourceType: e.resourceType,
    status: e.status,
    mimeType: e.mimeType,
    startedAt: e.startedAt,
    requestHeaders: e.requestHeaders,
    responseHeaders: e.responseHeaders,
    postData: e.postData,
    body: e.body,
    bodyTruncated: e.bodyTruncated,
  };
}

// 不需要拉取响应体的资源类型（图像/字体/媒体等二进制拉回也没意义，
// 既浪费 SW 内存（最多 100 xd7 20KB = 2MB）又浪费 CDP 往返）
export const SKIP_BODY_RESOURCE_TYPES = new Set(['Image', 'Font', 'Media', 'Manifest', 'Other']);

// 仅对这些 mimeType 前缀拉取 body（双保险：resourceType 缺失时仍能过滤）
export const TEXT_BODY_MIME_PREFIXES = [
  'text/', 'application/json', 'application/xml', 'application/javascript',
  'application/ecmascript', 'application/x-www-form-urlencoded',
  'application/graphql', 'application/ld+json', 'application/manifest+json',
  'image/svg+xml',
];

/**
 * 判断一个网络条目是否应该拉取响应体。
 * 默认不拉二进制资源；mimeType 已知时进一步限定为文本类。
 */
export function shouldFetchBody(entry) {
  if (!entry) return false;
  if (SKIP_BODY_RESOURCE_TYPES.has(entry.resourceType)) return false;
  const mime = String(entry.mimeType || '').toLowerCase();
  // mimeType 未知时（部分请求在 loadingFinished 时仍未回填）：保守拉取
  if (!mime) return true;
  return TEXT_BODY_MIME_PREFIXES.some(p => mime.startsWith(p));
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
