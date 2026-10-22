// agent/src/documents/image-extractor.js - 文档图片抽取（当前仅 docx；不依赖 canvas/pdfjs）
// 编号顺序 = document.xml 中 r:embed 出现顺序（去重）；扩展端 doc-images.js 的 docx 分支须与此一致
import { readEntry } from './zip-reader.js';

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
};

/** PNG IHDR / JPEG SOF0-2 头解析尺寸；解析失败返回 0x0 */
export function readImageDimensions(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (buf.length > 9 && buf[0] === 0xff && buf[1] === 0xd8) {
    for (let p = 2; p < buf.length - 9; ) {
      if (buf[p] !== 0xff) { p++; continue; }
      const marker = buf[p + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: dv.getUint16(p + 5), width: dv.getUint16(p + 7) };
      }
      p += 2 + dv.getUint16(p + 2);
    }
  }
  return { width: 0, height: 0 };
}

/**
 * 从 docx 字节抽取内嵌图片
 * @param {Uint8Array} buf docx 文件字节
 * @param {{ maxImages?: number, maxImageBytes?: number }} [opts]
 * @returns {{ images: Array<{index:number,name:string,ext:string,mimeType:string,bytes:number,width:number,height:number,data:Uint8Array}>, truncated: number, skipped: number }}
 */
export function extractDocxImages(buf, opts = {}) {
  const maxImages = opts.maxImages ?? 20;
  const maxImageBytes = opts.maxImageBytes ?? 5 * 1024 * 1024;
  const images = [];
  let truncated = 0;
  let skipped = 0;
  const decoder = new TextDecoder();
  const docXml = readEntry(buf, 'word/document.xml');
  const relsXml = readEntry(buf, 'word/_rels/document.xml.rels');
  if (!docXml || !relsXml) return { images, truncated, skipped };

  const relMap = new Map();
  for (const m of decoder.decode(relsXml).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1];
    const target = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && target && /media\//i.test(target)) {
      relMap.set(id, 'word/media/' + target.split('/').pop());
    }
  }

  const ordered = [];
  const seen = new Set();
  for (const m of decoder.decode(docXml).matchAll(/r:embed="(rId\d+)"/g)) {
    const target = relMap.get(m[1]);
    if (target && !seen.has(target)) {
      seen.add(target);
      ordered.push(target);
    }
  }

  for (const entryName of ordered) {
    const ext = entryName.split('.').pop().toLowerCase();
    if (!MIME_BY_EXT[ext]) { skipped++; continue; }
    if (images.length >= maxImages) { truncated++; continue; }
    const data = readEntry(buf, entryName);
    if (!data || data.length > maxImageBytes) { skipped++; continue; }
    const { width, height } = readImageDimensions(data);
    images.push({
      index: images.length + 1,
      name: entryName.split('/').pop(),
      ext,
      mimeType: MIME_BY_EXT[ext],
      bytes: data.length,
      width,
      height,
      data,
    });
  }
  return { images, truncated, skipped };
}
