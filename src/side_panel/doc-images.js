// src/side_panel/doc-images.js - 文档内嵌图片：浏览器端抽取 / 视觉转述 / 清单块 / 快照中转
// 开关唯一入口：state.enableImageInput（不新增配置项）
// 尺寸解析与 docx 编号算法与 agent/src/documents/image-extractor.js 双端同步，修改需同时改
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';
import { decodeSecret } from '../shared/secret.js';
import { callChatCompletion, readStreamEnabledFromStorage } from '../shared/chat-client.js';

registerTranslations('zh', {
  docImages: {
    header: '[文档图片: 共 {total} 张，已描述 {described} 张]',
    page: '｜第{page}页',
    sheetLoc: '｜工作表{sheet}!{cell}',
    lineDescribed: '〔图片{index}{loc}〕{desc}',
    lineTool: '〔图片{index}{loc}〕未描述，可调用 read_image(file="{file}", image={index}) 查看。',
    truncated: '[另有 {count} 张图未抽取，超出单文档 20 张上限]',
    describePrompt: '请客观描述这张图片的内容，并转录其中全部可读文字（OCR），不超过 300 字。',
    previewDescribed: '已描述 {described}/{total}',
    previewDeepReadable: ' · 可深读 {count}',
    previewCompact: '📷 {described}/{total}',
    previewCompactDeep: ' · {count}',
    previewFail: '📷 图片抽取失败',
    previewOff: '图片不会被识别（可在设置中开启图片识别）',
    chatImageHint: '[对话图片 1-{count} / chat-images] 这 {count} 张图只随本条消息发出，后续轮次不会再发送；需要复查时调用 read_image(file="{file}", image=N) 重新看图，N 取 1~{count}。',
  },
});
registerTranslations('en', {
  docImages: {
    header: '[Document images: {total} total, {described} described]',
    page: ' | p.{page}',
    sheetLoc: ' | sheet {sheet}!{cell}',
    lineDescribed: '[Image {index}{loc}] {desc}',
    lineTool: '[Image {index}{loc}] not described; call read_image(file="{file}", image={index}) to view.',
    truncated: '[{count} more images were not extracted due to the 20-image limit]',
    describePrompt: 'Describe this image objectively and transcribe all readable text (OCR) in it, within 300 words.',
    previewDescribed: 'described {described}/{total}',
    previewDeepReadable: ' · {count} deep-readable',
    previewCompact: '📷 {described}/{total}',
    previewCompactDeep: ' · {count}',
    previewFail: '📷 image extraction failed',
    previewOff: 'Images will not be recognized (enable image recognition in settings)',
    chatImageHint: '[Chat images 1-{count} / chat-images] These {count} image(s) travel with this message only and are stripped from later turns; call read_image(file="{file}", image=N) to look at image N again, N = 1~{count}.',
  },
});

export const VISION_CONSTANTS = {
  DESCRIBE_LIMIT: 2, // 上传时预转述的最大张数
  MAX_IMAGE_BYTES: 200 * 1024, // 单图压缩后送视觉上限
  MAX_IMAGES: 20, // 单文档抠图上限
  MAX_RAW_BYTES: 5 * 1024 * 1024, // 单图原始字节上限
  SNAPSHOT_BUDGET: 4 * 1024 * 1024, // session 快照中转预算
  MAX_CHAT_IMAGE_SNAPSHOT: 8, // 对话贴图落快照上限（按消息内顺序取前 N 张）
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

/** 0-based 列/行 → A1 单元格表示（列超 26 递入双字母） */
function cellRef(col, row) {
  let s = '';
  let c = col + 1;
  while (c > 0) {
    const rem = (c - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    c = Math.floor((c - 1) / 26);
  }
  return `${s}${row + 1}`;
}

/**
 * xlsx 抠图（浏览器端）：浮动图片（drawing anchor）按 sheet 声明顺序 + anchor 顺序编号
 * 链路：workbook.xml(sheet顺) → workbook rels(rid→sheet 文件) → sheet rels(drawing 文件)
 *   → drawing(anchors + xdr:from 定位) → drawing rels(rid→media) → xl/media/*
 * 单元格内嵌图（rich value / vm 属性）不在本功能范围；旧版 .xls 非 zip 安全空返
 * @param {File} file
 * @param {{ maxImages?: number }} [opts]
 * @returns {Promise<{ images: Array<object>, truncated: number, skipped: number }>}
 */
export async function extractXlsxImagesFromFile(file, opts = {}) {
  const maxImages = opts.maxImages || VISION_CONSTANTS.MAX_IMAGES;
  const JSZip = (await import('jszip')).default;
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { images: [], truncated: 0, skipped: 0 }; // 非 zip（如老 .xls）：空清单不报错
  }
  const wbEntry = zip.file('xl/workbook.xml');
  const wbRelsEntry = zip.file('xl/_rels/workbook.xml.rels');
  if (!wbEntry || !wbRelsEntry) return { images: [], truncated: 0, skipped: 0 };

  const readRelTargets = async (entry, typeRe) => {
    const map = new Map();
    if (!entry) return map;
    for (const m of (await entry.async('string')).matchAll(/<Relationship\b[^>]*>/g)) {
      const id = m[0].match(/Id="([^"]+)"/)?.[1];
      const type = m[0].match(/Type="([^"]+)"/)?.[1] || '';
      const target = m[0].match(/Target="([^"]+)"/)?.[1];
      if (id && target && typeRe.test(type)) map.set(id, target);
    }
    return map;
  };

  // 关系 Target → zip 条目名：OOXML 允许绝对形式 /xl/...（部分导出器如此），
  // 一律加 'xl/' 前缀会拼出 xl/xl/... 静默抽 0 张；绝对形式去首斜杠后已是包内路径
  const resolveRelTarget = (t) => {
    const s = String(t || '');
    if (s.startsWith('/')) return s.replace(/^\/+/, '');
    return 'xl/' + s.replace(/^\.\.\//, '');
  };

  // 按 workbook 声明顺序整理 sheet → 文件路径
  const wbRels = await readRelTargets(wbRelsEntry, /worksheet$/);
  const wbXml = await wbEntry.async('string');
  const sheetOrder = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = m[0].match(/name="([^"]+)"/)?.[1];
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1];
    const target = rid && wbRels.get(rid);
    if (name && target) sheetOrder.push({ name, file: resolveRelTarget(target) });
  }

  const images = [];
  let truncated = 0;
  let skipped = 0;
  const seen = new Set(); // 同一张图多锚点去重（同 docx 语义）
  for (const sheet of sheetOrder) {
    const sheetRelsEntry = zip.file(`xl/worksheets/_rels/${sheet.file.split('/').pop()}.rels`);
    const drawingTargets = await readRelTargets(sheetRelsEntry, /drawing$/);
    for (const relTarget of drawingTargets.values()) {
      const drawingFile = resolveRelTarget(relTarget);
      const drawingEntry = zip.file(drawingFile);
      if (!drawingEntry) continue;
      const imgRels = await readRelTargets(zip.file(drawingFile.replace('drawings/', 'drawings/_rels/') + '.rels'), /image$/);
      const drawingXml = await drawingEntry.async('string');
      for (const a of drawingXml.matchAll(/<[a-z]+:(?:oneCellAnchor|twoCellAnchor|absoluteAnchor)\b[\s\S]*?<\/[a-z]+:(?:oneCellAnchor|twoCellAnchor|absoluteAnchor)>/g)) {
        const rid = a[0].match(/r:embed="(rId\d+)"/)?.[1];
        if (!rid) continue;
        const target = imgRels.get(rid);
        if (!target) { skipped++; continue; }
        const entryName = resolveRelTarget(target);
        const ext = entryName.split('.').pop().toLowerCase();
        if (!MIME_BY_EXT[ext]) { skipped++; continue; }
        if (seen.has(entryName)) continue;
        seen.add(entryName);
        const col = Number(a[0].match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/)?.[1] ?? 0);
        const row = Number(a[0].match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)?.[1] ?? 0);
        if (images.length >= maxImages) { truncated++; continue; }
        const entry = zip.file(entryName);
        if (!entry) { skipped++; continue; }
        const bytes = await entry.async('uint8array');
        if (bytes.length > VISION_CONSTANTS.MAX_RAW_BYTES) { skipped++; continue; }
        const { width, height } = readImageDimensions(bytes);
        images.push({
          index: images.length + 1,
          page: null,
          sheet: sheet.name,
          cell: cellRef(col, row),
          mimeType: MIME_BY_EXT[ext],
          bytes: bytes.length,
          width,
          height,
          dataUrl: bytesToDataUrl(bytes, MIME_BY_EXT[ext]),
          kind: 'embedded',
        });
      }
    }
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

// —— 压缩（真实环境 createImageBitmap+OffscreenCanvas；canvas 分支单测不覆盖，Task 9 视觉验证） ——
async function defaultToJpeg(dataUrl, maxDim, quality) {
  const resp = await fetch(dataUrl); // side panel 可 fetch data: URL
  const bitmap = await createImageBitmap(await resp.blob());
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { dataUrl: await blobToDataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality })), width: canvas.width, height: canvas.height };
}

/**
 * 压缩到单图视觉上限；5 轮降级（先降 quality 后缩尺寸）仍超 → null（放弃实体，清单保留元信息）
 * @param {string} dataUrl
 * @param {{ toJpeg?: Function }} [deps] 单测注入 (dataUrl, maxDim, quality) → Promise<{dataUrl}|null>
 */
export async function compressForVision(dataUrl, deps = {}) {
  const toJpeg = deps.toJpeg || defaultToJpeg;
  let maxDim = 1024;
  let quality = 0.65;
  for (let i = 0; i < 5; i++) {
    let out;
    try { out = await toJpeg(dataUrl, maxDim, quality); } catch { return null; }
    if (!out || !out.dataUrl) return null;
    if (dataUrlBytes(out.dataUrl) <= VISION_CONSTANTS.MAX_IMAGE_BYTES) return out.dataUrl;
    if (quality > 0.3) quality = Math.round((quality - 0.15) * 100) / 100;
    else maxDim = Math.floor(maxDim * 0.75);
  }
  return null;
}

// —— 视觉配置（回落链与 tool-executor.js analyzeScreenshotWithVision / chat-manager 选模一致） ——
export async function getVisionConfig() {
  const cfg = await new Promise((r) => chrome.storage.local.get(['imageApiBase', 'imageApiKey', 'imageModelName', 'apiBase', 'apiKey', 'modelName'], r));
  return {
    apiBase: cfg.imageApiBase || cfg.apiBase || '',
    apiKey: decodeSecret(cfg.imageApiKey) || decodeSecret(cfg.apiKey) || '',
    model: cfg.imageModelName || cfg.modelName || '',
  };
}

/**
 * 前 count 张并发送视觉模型转述；失败置 null 不抛
 * @param {Array<{index: number, dataUrl?: string}>} images
 * @param {number} [count]
 * @param {(index:number, desc:string|null)=>void} [onEach] 每张完成即回调（乱序），供上层增量写入、发送不必等全部
 * @returns {Promise<Record<number, string|null>>}
 */
export async function describeImages(images, count = VISION_CONSTANTS.DESCRIBE_LIMIT, onEach) {
  const out = {};
  if (!images || images.length === 0) return out;
  const { apiBase, apiKey, model } = await getVisionConfig();
  const targets = images.filter((im) => im.dataUrl).slice(0, count);
  const report = (index, desc) => {
    out[index] = desc;
    if (onEach) { try { onEach(index, desc); } catch { /* 回调异常不影响转述 */ } }
  };
  if (!apiBase) {
    targets.forEach((im) => report(im.index, null));
    return out;
  }
  // 前 count 张并发转述（把最坏 N×60s 压到约 60s）；每张完成即回调，供上层增量使用
  await Promise.all(targets.map(async (img) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      // 跟随流式总开关：部分企业网关会在非流式请求上追加 stream_options 导致报错
      const { ok, data } = await callChatCompletion(`${apiBase}/chat/completions`, {
        headers,
        body: {
          model,
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: t('docImages.describePrompt') },
              { type: 'image_url', image_url: { url: img.dataUrl, detail: 'auto' } },
            ],
          }],
        },
        useStream: await readStreamEnabledFromStorage(),
        signal: controller.signal,
      });
      report(img.index, ok ? (data.choices?.[0]?.message?.content || null) : null);
    } catch (err) {
      logger.warn('doc-images: describe failed', String(err?.message || err));
      report(img.index, null);
    } finally {
      clearTimeout(timer);
    }
  }));
  return out;
}

/**
 * 消息内联图片清单块（spec §5）；无图返空串
 * @param {{ images: Array<object>, imageDescriptions?: Record<number, string>, truncated?: number }} fileEntry
 * @param {string} fileName
 */
export function buildImageBlock(fileEntry, fileName) {
  const images = fileEntry.images || [];
  if (images.length === 0) return '';
  const descs = fileEntry.imageDescriptions || {};
  const described = images.filter((im) => descs[im.index]).length;
  const lines = [t('docImages.header', { total: images.length, described })];
  for (const im of images) {
    const loc = im.page ? t('docImages.page', { page: im.page })
      : (im.sheet ? t('docImages.sheetLoc', { sheet: im.sheet, cell: im.cell || '' }) : '');
    if (descs[im.index]) {
      lines.push(t('docImages.lineDescribed', { index: im.index, loc, desc: String(descs[im.index]).trim() }));
    } else {
      lines.push(t('docImages.lineTool', { index: im.index, loc, file: fileName }));
    }
  }
  if (fileEntry.truncated > 0) lines.push(t('docImages.truncated', { count: fileEntry.truncated }));
  return '\n\n' + lines.join('\n');
}

/**
 * 附件预览 📷 状态行计数：已描述 / 总数 / 可深读
 * 可深读 = 未转述但已抽出且能取到图（本地 dataUrl / agent 落盘 path）的张数，overLimit 不计
 */
function previewCounts(fileEntry) {
  const images = fileEntry.images || [];
  const descs = fileEntry.imageDescriptions || {};
  const described = images.filter((im) => descs[im.index]).length;
  const deepReadable = images.filter((im) => !descs[im.index] && !im.overLimit && (im.dataUrl || im.path)).length;
  return { described, total: images.length, deepReadable };
}

/**
 * 完整文案（供悬停 title）：已描述 x/总 · 可深读 N
 * @param {{ images?: Array<object>, imageDescriptions?: Record<number, string>, imageStatus?: string }} fileEntry
 */
export function buildPreviewStatusText(fileEntry) {
  if (fileEntry.imageStatus === 'error') return t('docImages.previewFail');
  const { described, total, deepReadable } = previewCounts(fileEntry);
  let text = t('docImages.previewDescribed', { described, total });
  if (deepReadable > 0) text += t('docImages.previewDeepReadable', { count: deepReadable });
  return text;
}

/**
 * 紧凑文案（平时可见，省宽）：📷 x/总 · N（仅留数字，文字说明移到悬停 title）
 * @param {{ images?: Array<object>, imageDescriptions?: Record<number, string>, imageStatus?: string }} fileEntry
 */
export function buildPreviewCompactText(fileEntry) {
  if (fileEntry.imageStatus === 'error') return t('docImages.previewFail');
  const { described, total, deepReadable } = previewCounts(fileEntry);
  let text = t('docImages.previewCompact', { described, total });
  if (deepReadable > 0) text += t('docImages.previewCompactDeep', { count: deepReadable });
  return text;
}

// —— 快照中转（background 侧 read_document_image 取图；storage key: _docImageSnapshot）——
// 结构 { [sessionId]: { updatedAt, files: [{ name, imageSource, images: [{ index, page, path?, dataUrl? }] }] } }
const SNAPSHOT_KEY = '_docImageSnapshot';

function snapshotEntryBytes(e) {
  return e.files.reduce((s, f) => s + (f.imageSource === 'local'
    ? f.images.reduce((is, im) => is + (im.dataUrl ? dataUrlBytes(im.dataUrl) : 0), 0)
    : 0), 0);
}

/** 对话贴图在中转快照里的伪文件名：read_image(file="chat-images", image=N) 取第 N 张。 */
export const CHAT_IMAGE_FILE = 'chat-images';

/**
 * 对话贴图 → 快照条目。位置即序号（第 N 张图对应 image N），只存压缩图：
 * 原图 base64 会几倍撞 4MB 预算，连带把别的会话的文档图挤掉。
 * 已归一过的条目再次归一结果不变（序号按位置重算），调用方可复用结果算「可重读张数」。
 */
export function normalizeChatImageSnapshot(attachedImages) {
  return (Array.isArray(attachedImages) ? attachedImages : [])
    .slice(0, VISION_CONSTANTS.MAX_CHAT_IMAGE_SNAPSHOT)
    .map((im, i) => ({ index: i + 1, dataUrl: im?.compressedUrl || im?.dataUrl || im?.originalUrl || '' }))
    .filter((im) => !!im.dataUrl);
}

/**
 * 贴图文本线索：只随本条消息发出的图片，从第 2 次请求起就被 stripImagesFromContent 剥走。
 * 没有这行，模型既不知道图还存在，也不知道还能用 read_image 再读一次。
 */
export function buildChatImageHint(count) {
  const n = Math.min(Number(count) || 0, VISION_CONSTANTS.MAX_CHAT_IMAGE_SNAPSHOT);
  if (n <= 0) return '';
  return '\n' + t('docImages.chatImageHint', { count: n, file: CHAT_IMAGE_FILE });
}

/** 线索是给模型看的内部指令：历史回放 / 复制 / 编辑回填都要剥掉（中英两版都认）。 */
export function stripChatImageHint(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\n?\[(?:对话图片|Chat images) \d+-\d+ \/ chat-images\][^\n]*/g, '');
}

/**
 * 发送前写入 session 级图片快照；超预算从最旧 session 起淘汰，
 * 仅剩当前 session 仍超时剥除 dataUrl 保留清单
 */
export async function saveDocImageSnapshot(sessionId, attachedFiles, attachedImages = []) {
  const store0 = await new Promise((r) => chrome.storage.local.get([SNAPSHOT_KEY], r));
  const snap = store0[SNAPSHOT_KEY] || {};
  const withImages = (attachedFiles || []).filter((f) => f.status === 'done' && (f.images || []).length > 0);
  // 对话贴图复用同一份中转快照：read_image 来源二按文件名查表，贴图挂一条伪文件即可，
  // 不给工具加第三个参数（file + image 既有契约原样生效）
  const chatImages = normalizeChatImageSnapshot(attachedImages);
  if (withImages.length === 0 && chatImages.length === 0) {
    delete snap[sessionId];
  } else {
    const snapshotFiles = withImages.map((f) => ({
      name: f.name,
      imageSource: f.imageSource,
      images: f.images.map((im) => {
        const c = { index: im.index, page: im.page ?? null };
        if (im.path) c.path = im.path;
        if (im.dataUrl) c.dataUrl = im.dataUrl;
        return c;
      }),
    }));
    if (chatImages.length > 0) {
      snapshotFiles.push({ name: CHAT_IMAGE_FILE, imageSource: 'local', images: chatImages });
    }
    snap[sessionId] = {
      updatedAt: Date.now(),
      files: snapshotFiles,
    };
    const total = () => Object.values(snap).reduce((s, e) => s + snapshotEntryBytes(e), 0);
    while (total() > VISION_CONSTANTS.SNAPSHOT_BUDGET && Object.keys(snap).length > 1) {
      const oldest = Object.entries(snap)
        .filter(([k]) => k !== sessionId)
        .sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
      if (!oldest) break;
      delete snap[oldest[0]];
    }
    if (total() > VISION_CONSTANTS.SNAPSHOT_BUDGET && snap[sessionId]) {
      snap[sessionId].files.forEach((f) => {
        if (f.imageSource === 'local') f.images.forEach((im) => { delete im.dataUrl; });
      });
    }
  }
  await new Promise((r) => chrome.storage.local.set({ [SNAPSHOT_KEY]: snap }, r));
}

export async function removeDocImageSnapshot(sessionId) {
  const store0 = await new Promise((r) => chrome.storage.local.get([SNAPSHOT_KEY], r));
  const snap = store0[SNAPSHOT_KEY] || {};
  if (snap[sessionId]) {
    delete snap[sessionId];
    await new Promise((r) => chrome.storage.local.set({ [SNAPSHOT_KEY]: snap }, r));
  }
}
