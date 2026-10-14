// shared/secret.js - 密钥/Token 存储混淆（Base64 + enc: 前缀标记）
// 与 agent/src/crypto-lite.js 保持同一约定，非密码学安全，仅防明文一眼可辨。
// 兼容规则：读取时若无 enc: 前缀视为旧明文原样返回；下次写入自动升级。

const PREFIX = 'enc:';

/**
 * 编码：明文 → "enc:" + base64(明文)
 * @param {string} plain
 * @returns {string}
 */
export function encodeSecret(plain) {
  if (!plain) return plain;
  return PREFIX + btoa(unescape(encodeURIComponent(plain)));
}

/**
 * 解码："enc:..." → 明文；无 enc: 前缀 → 原样返回（兼容旧明文）
 * @param {string} stored
 * @returns {string}
 */
export function decodeSecret(stored) {
  if (!stored) return stored;
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    return decodeURIComponent(escape(atob(stored.slice(PREFIX.length))));
  } catch {
    return stored;
  }
}
