// src/shared/image-signature.js - 图片 magic bytes 识别（扩展侧硬校验）
//
// 背景：read_image 的 path 来源把代理端工作目录任意文件字节送外部视觉端点，
// 且该工具属不可信内容入口（提示注入可诱导模型读取）——声明的 mimeType 不可信，
// 必须按文件头魔数硬校验，非图片一律拒绝，防止任意文件内容外泄。

const SIGNATURES = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  { mime: 'image/bmp', bytes: [0x42, 0x4d] }, // BM
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF（下方二次校验 WEBP 标记）
];

/**
 * 按字节头识别图片 MIME；非白名单图片返回 null
 * @param {Uint8Array} bytes
 * @returns {string|null}
 */
export function detectImageMime(bytes) {
  if (!bytes || bytes.length < 4) return null;
  for (const sig of SIGNATURES) {
    if (sig.bytes.every((b, i) => bytes[i] === b)) {
      // RIFF 需再验 8–12 字节为 WEBP，排除 wav/avi 等同头格式
      if (sig.mime === 'image/webp') {
        const tag = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
        if (tag !== 'WEBP') continue;
      }
      return sig.mime;
    }
  }
  return null;
}

/**
 * 校验 base64 图片字节（只解前 12 字节，不整解大文件）
 * @param {string} base64
 * @returns {string|null} 识别出的图片 MIME，非图片返 null
 */
export function detectImageMimeFromBase64(base64) {
  const s = String(base64 || '');
  if (!s) return null;
  try {
    const head = s.slice(0, 16); // 16 个 base64 字符 ≥ 12 字节，覆盖最长魔数
    const bin = atob(head);
    const bytes = Uint8Array.from(bin.slice(0, 12), (c) => c.charCodeAt(0));
    return detectImageMime(bytes);
  } catch {
    return null; // 非法 base64 视为非图片
  }
}
