// src/side_panel/doc-images.js - 文档内嵌图片：浏览器端抽取 / 视觉转述 / 清单块 / 快照中转
// 开关唯一入口：state.enableImageInput（不新增配置项）
// 尺寸解析与 docx 编号算法与 agent/src/documents/image-extractor.js 双端同步，修改需同时改
import logger from '../shared/logger.js';

export const VISION_CONSTANTS = {
  DESCRIBE_LIMIT: 2, // 上传时预转述的最大张数
  MAX_IMAGE_BYTES: 200 * 1024, // 单图压缩后送视觉上限
  MAX_IMAGES: 20, // 单文档抠图上限
  MAX_RAW_BYTES: 5 * 1024 * 1024, // 单图原始字节上限
  SNAPSHOT_BUDGET: 4 * 1024 * 1024, // session 快照中转预算
  SCANNED_PAGE_TEXT_THRESHOLD: 50, // 页文本层低于此字符数视为扫描件候选
};

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };

export function dataUrlBytes(dataUrl) {
  const b64 = String(dataUrl || '').split(',')[1] || '';
  return Math.floor((b64.length * 3) / 4);
}

export function bytesToDataUrl(bytes, mimeType) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/** PNG IHDR / JPEG SOF0-2 头解析尺寸；解析失败返回 0x0（与 agent 端算法一致） */
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
 * docx 抠图（浏览器端）：word/media/* 按 document.xml r:embed 出现顺序编号
 * @param {File} file
 * @param {{ maxImages?: number }} [opts]
 * @returns {Promise<{ images: Array<object>, truncated: number, skipped: number }>}
 */
export async function extractDocxImagesFromFile(file, opts = {}) {
  const maxImages = opts.maxImages || VISION_CONSTANTS.MAX_IMAGES;
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const docEntry = zip.file('word/document.xml');
  const relsEntry = zip.file('word/_rels/document.xml.rels');
  if (!docEntry || !relsEntry) return { images: [], truncated: 0, skipped: 0 };

  const relMap = new Map();
  for (const m of (await relsEntry.async('string')).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1];
    const target = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && target && /media\//i.test(target)) relMap.set(id, 'word/media/' + target.split('/').pop());
  }
  const ordered = [];
  const seen = new Set();
  for (const m of (await docEntry.async('string')).matchAll(/r:embed="(rId\d+)"/g)) {
    const t = relMap.get(m[1]);
    if (t && !seen.has(t)) { seen.add(t); ordered.push(t); }
  }

  const images = [];
  let truncated = 0;
  let skipped = 0;
  for (const entryName of ordered) {
    const ext = entryName.split('.').pop().toLowerCase();
    if (!MIME_BY_EXT[ext]) { skipped++; continue; }
    if (images.length >= maxImages) { truncated++; continue; }
    const entry = zip.file(entryName);
    if (!entry) { skipped++; continue; }
    const bytes = await entry.async('uint8array');
    if (bytes.length > VISION_CONSTANTS.MAX_RAW_BYTES) { skipped++; continue; }
    const { width, height } = readImageDimensions(bytes);
    images.push({
      index: images.length + 1,
      page: null,
      mimeType: MIME_BY_EXT[ext],
      bytes: bytes.length,
      width,
      height,
      dataUrl: bytesToDataUrl(bytes, MIME_BY_EXT[ext]),
      kind: 'embedded',
    });
  }
  return { images, truncated, skipped };
}

// —— 真实编码器（浏览器运行时；单测注入假实现） ——
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function defaultEncodeRgbaToPng({ data, width, height }) {
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  return await blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
}

/** 整页渲染 JPEG + 4x4 采样空白探测（纯白页返回 blank） */
async function defaultRenderPageToJpeg(page, scale = 1.5) {
  const vp = page.getViewport({ scale });
  const canvas = new OffscreenCanvas(Math.floor(vp.width), Math.floor(vp.height));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const x = Math.floor((canvas.width * (gx + 0.5)) / 4);
      const y = Math.floor((canvas.height * (gy + 0.5)) / 4);
      const i = (y * canvas.width + x) * 4;
      if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) {
        return {
          dataUrl: await blobToDataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 })),
          width: canvas.width,
          height: canvas.height,
        };
      }
    }
  }
  return { dataUrl: '', width: canvas.width, height: canvas.height, blank: true };
}

async function bitmapToDataUrl(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return await blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
}

/** pdf.js v3：objs.get 回调式取解码对象，10s 超时保护 */
async function resolveObjName(page, name) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('image obj timeout')), 10000);
    page.objs.get(name, (obj) => { clearTimeout(timer); resolve(obj); });
  });
}

/** 仅接受 RGBA 位图 / bitmap；灰度、索引色第一期跳过 */
async function normalizeImageObject(obj) {
  const resolved = await obj; // v3 下可能是 Promise
  if (!resolved) return null;
  if (resolved.bitmap) return { bitmap: resolved.bitmap, width: resolved.bitmap.width, height: resolved.bitmap.height };
  if (resolved.data && resolved.width && resolved.height
    && resolved.data.length === resolved.width * resolved.height * 4) {
    return { data: resolved.data, width: resolved.width, height: resolved.height };
  }
  return null;
}

/**
 * pdf 抠图（两端统一在插件端浏览器执行）：operatorList 抓位图 + 扫描件整页渲染兜底
 * @param {File} file
 * @param {{ maxImages?: number }} [opts]
 * @param {{ encodeRgbaToPng?: Function, renderPageToJpeg?: Function }} [deps] 单测注入
 */
export async function extractPdfImagesFromFile(file, opts = {}, deps = {}) {
  const encodeRgbaToPng = deps.encodeRgbaToPng || defaultEncodeRgbaToPng;
  const renderPageToJpeg = deps.renderPageToJpeg || defaultRenderPageToJpeg;
  const maxImages = opts.maxImages || VISION_CONSTANTS.MAX_IMAGES;

  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;

  const images = [];
  let truncated = 0;
  let skipped = 0;
  const seenHash = new Set();

  for (let p = 1; p <= pdf.numPages; p++) {
    if (images.length >= maxImages) { truncated++; continue; }
    const page = await pdf.getPage(p);
    const ops = await page.getOperatorList();
    let embeddedInPage = 0;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (fn !== pdfjsLib.OPS.paintImageXObject && fn !== pdfjsLib.OPS.paintInlineImageXObject) continue;
      if (images.length >= maxImages) { truncated++; continue; }
      try {
        const arg = ops.argsArray[i][0];
        const obj = typeof arg === 'string' ? await resolveObjName(page, arg) : arg;
        const normalized = await normalizeImageObject(obj);
        if (!normalized) { skipped++; continue; }
        const hash = normalized.bitmap
          ? `bm:${normalized.width}x${normalized.height}`
          : `${normalized.width}x${normalized.height}:${normalized.data.length}`;
        if (seenHash.has(hash)) continue; // 重复 XObject 引用去重
        seenHash.add(hash);
        const dataUrl = normalized.bitmap
          ? await bitmapToDataUrl(normalized.bitmap)
          : await encodeRgbaToPng(normalized);
        images.push({
          index: images.length + 1,
          page: p,
          mimeType: 'image/png',
          bytes: dataUrlBytes(dataUrl),
          width: normalized.width,
          height: normalized.height,
          dataUrl,
          kind: 'embedded',
        });
        embeddedInPage++;
      } catch (err) {
        logger.warn('doc-images: pdf obj resolve failed', String(err?.message || err));
        skipped++;
      }
    }
    // 扫描件兜底：无内嵌位图 + 文本层稀少 → 整页渲染
    if (embeddedInPage === 0) {
      const textContent = await page.getTextContent();
      const textLen = (textContent.items || []).reduce((s, it) => s + ((it && it.str) || '').length, 0);
      if (textLen < VISION_CONSTANTS.SCANNED_PAGE_TEXT_THRESHOLD) {
        try {
          const rendered = await renderPageToJpeg(page);
          if (!rendered.blank && rendered.dataUrl) {
            images.push({
              index: images.length + 1,
              page: p,
              mimeType: 'image/jpeg',
              bytes: dataUrlBytes(rendered.dataUrl),
              width: rendered.width,
              height: rendered.height,
              dataUrl: rendered.dataUrl,
              kind: 'scanned-page',
            });
          }
        } catch (err) {
          logger.warn('doc-images: page render failed', String(err?.message || err));
          skipped++;
        }
      }
    }
  }
  return { images, truncated, skipped };
}
