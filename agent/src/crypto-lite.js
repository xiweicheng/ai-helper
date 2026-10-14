// agent/src/crypto-lite.js - 密钥/Token 落盘混淆（Base64 + enc: 前缀标记）
// 非密码学安全，目的：避免配置文件被 cat/截图时一眼识别出密钥明文。
// 兼容规则：读取时若无 enc: 前缀视为旧明文原样返回；下次写入自动升级。

const PREFIX = 'enc:';

/**
 * 编码：明文 → "enc:" + base64(明文)
 * 空值原样返回（空字符串不编码）
 * @param {string} plain
 * @returns {string}
 */
export function encodeSecret(plain) {
  if (!plain) return plain;
  return PREFIX + Buffer.from(plain, 'utf-8').toString('base64');
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
    return Buffer.from(stored.slice(PREFIX.length), 'base64').toString('utf-8');
  } catch {
    return stored; // 解码失败（损坏数据）→ 原样返回，不崩溃
  }
}
