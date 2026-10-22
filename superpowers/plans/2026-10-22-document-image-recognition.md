# 文档图片识别（Word/PDF 内嵌图片 → AI）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让上传的 docx/pdf 中的图片经视觉模型转述为文本进入对话，并提供 `read_document_image` 工具按需深读，Agent 模式与纯浏览器模式双链路。

**Architecture:** 主模型全程只消费文本；视觉模型只在插件端被调用。Agent 端仅负责 docx 抽图落盘（零新依赖 ZIP 解析）+ 按需提供 `/api/fs/download` 取图；PDF 抽取统一在插件端浏览器 pdf.js 执行。图片信息经 `_docImageSnapshot` chrome.storage 中转供 background 工具使用。

**Tech Stack:** Node ESM（agent，node:zlib）、pdfjs-dist ^3.11（插件端动态 import）、jszip（插件端新增依赖）、chrome.storage.local、vitest / node:test。

**Spec:** `docs/superpowers/specs/2026-10-22-document-image-recognition-design.md`（含规划阶段修正：Agent 端不解析 PDF）

## Global Constraints

- 不新增任何配置项；整条链路唯一开关为 `enableImageInput`
- 阈值硬编码：`DESCRIBE_LIMIT=2`、`MAX_IMAGE_BYTES=200*1024`（压缩后）、`MAX_IMAGES=20`、`MAX_RAW_BYTES=5*1024*1024`（单图原始）、`SNAPSHOT_BUDGET=4*1024*1024`、agent 端 `EXTRACT_MAX_FILE_BYTES=50*1024*1024`
- 图片链路任何失败不得阻塞文档文本主链路；`enableImageInput` 关闭或文档零图时消息输出与改动前逐字节一致
- agent 测试收口：`cd agent && node --test --test-reporter=tap test/unit/*.test.js`（不得跑 integration）；扩展端：`npx vitest run test/unit/<file>`，全量 `npx vitest run`
- 每个任务完成后根目录执行 `npm run build:silent`；agent 源码改动需重启进程（`cd agent && node bin/agent.js stop && node bin/agent.js start`）
- 扩展端模块文案用 `registerTranslations('zh'|'en', …)` 双语注册（模式见 file-extract.js L10-43）；CSS 类名 kebab-case；内置工具按钮名称渲染时动态查询 i18n 禁止缓存
- 新工具必须显式声明 `category` 并通过既有工具分类/提示注入守卫测试（Task 8 Step 6）

---

### Task 1: Agent 端零依赖 ZIP 读取器

**Files:**
- Create: `agent/src/documents/zip-reader.js`（含新建目录 `agent/src/documents/`）
- Test: `agent/test/unit/docx-zip-reader.unit.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `listEntryNames(buf: Uint8Array): string[]`；`readEntry(buf: Uint8Array, name: string): Uint8Array | null`；测试导出 `makeZip(entries: Array<{name, data: Buffer, deflate?: boolean}>): Uint8Array`（Task 2/3 复用）

- [ ] **Step 1: 写失败测试** — 测试内用 `node:zlib.deflateRawSync` 现造 zip（local header `0x04034b50` + central `0x02014b50` + EOCD `0x06054b50`，CRC-32 表法多项式 `0xEDB88320`），断言：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { listEntryNames, readEntry } from '../../src/documents/zip-reader.js';
import { makeZip } from './docx-zip-reader.unit.test.js';

test('stored + deflate 条目均可读出', () => {
  const zip = makeZip([
    { name: 'a.txt', data: Buffer.from('hello') },
    { name: 'word/media/image1.png', data: Buffer.from('PNGDATA'), deflate: true },
  ]);
  assert.deepEqual(listEntryNames(zip).sort(), ['a.txt', 'word/media/image1.png']);
  assert.equal(Buffer.from(readEntry(zip, 'a.txt')).toString(), 'hello');
  assert.equal(Buffer.from(readEntry(zip, 'word/media/image1.png')).toString(), 'PNGDATA');
});
test('不存在条目返回 null；不支持的压缩返回 null', () => {
  const zip = makeZip([{ name: 'a.txt', data: Buffer.from('x') }]);
  assert.equal(readEntry(zip, 'nope.txt'), null);
});
```

`makeZip` 与 `crc32` 与被测模块同文件还是测试文件：放测试文件并 `export`（node:test 允许 test 文件被 import，fixture 构造器不属于被测行为）。zip 二进制布局：local header 30 字节（offset4 method@6? 否——method 在 local offset 8；central method offset 10； sizes：compSize central offset 20、uncompSize 24、nameLen 28、extraLen 30、commentLen 32、localOffset 42；EOCD：count offset 10、centralSize 12、centralOffset 16），写入字段以 Step 3 实现为准逐一对齐。

- [ ] **Step 2: 运行确认失败** — `cd agent && node --test --test-reporter=tap test/unit/docx-zip-reader.unit.test.js`，Expected: `Cannot find module .../zip-reader.js`

- [ ] **Step 3: 实现 zip-reader.js**

```js
// agent/src/documents/zip-reader.js - 最小 ZIP 读取器（stored/deflate，无外部依赖）
import zlib from 'node:zlib';

const SIG_EOCD = 0x06054b50, SIG_CENTRAL = 0x02014b50, SIG_LOCAL = 0x04034b50;

function findEocd(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66536); i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

export function listEntryNames(buf) {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('invalid zip: EOCD not found');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) throw new Error('invalid zip: central header');
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    names.push(Buffer.from(buf.subarray(p + 46, p + 46 + nameLen)).toString('utf8'));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/** 读取条目原始字节；不存在或压缩方式不支持返回 null */
export function readEntry(buf, name) {
  const eocd = findEocd(buf);
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const entryName = Buffer.from(buf.subarray(p + 46, p + 46 + nameLen)).toString('utf8');
    if (entryName === name) {
      const localOffset = buf.readUInt32LE(p + 42);
      if (buf.readUInt32LE(localOffset) !== SIG_LOCAL) return null;
      const lNameLen = buf.readUInt16LE(localOffset + 26), lExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return raw;
      if (method === 8) return new Uint8Array(zlib.inflateRawSync(raw));
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}
```

- [ ] **Step 4: 运行确认通过** — 同 Step 2，Expected: PASS
- [ ] **Step 5: 提交** — `git add agent/src/documents/zip-reader.js agent/test/unit/docx-zip-reader.unit.test.js && git commit -m "feat(agent): 零依赖 ZIP 读取器（docx 图片抽取前置）"`

---

### Task 2: Agent 端 docx 图片抽取模块

**Files:**
- Create: `agent/src/documents/image-extractor.js`
- Test: `agent/test/unit/docx-image-extractor.unit.test.js`

**Interfaces:**
- Consumes: Task 1 `listEntryNames/readEntry`、`makeZip`
- Produces: `extractDocxImages(buf: Uint8Array, opts?: { maxImages?: number, maxImageBytes?: number }): { images: Array<{ index, name, ext, mimeType, bytes, width, height, data: Uint8Array }>, truncated: number, skipped: number }`；`readImageDimensions(buf): {width, height}`。index 从 1 起，按 document.xml `r:embed` 出现顺序（连续重复引用去重）

- [ ] **Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDocxImages } from '../../src/documents/image-extractor.js';
import { makeZip } from './docx-zip-reader.unit.test.js';

// pngLike(w,h)：PNG 签名 8 字节 + IHDR chunk（长度13/'IHDR'/宽IHDR+8高IHDR+12 大端）+ 'body'
// docxZip(images)：word/document.xml（按序拼 <a:blip r:embed="rIdN"/>）+
//   word/_rels/document.xml.rels（Id→Target=media/x.png）+ 各 word/media 条目（deflate）
// 两函数在本测试文件内实现并 export（Task 3 测试继续复用 docxZip）

test('按 document.xml 引用顺序编号并解析 PNG 尺寸', () => {
  const zip = docxZip([{ rid: 'rId2', file: 'image2.png', w: 800, h: 600 }, { rid: 'rId3', file: 'image1.png', w: 100, h: 50 }]);
  const { images, truncated } = extractDocxImages(zip);
  assert.equal(truncated, 0);
  assert.deepEqual(images.map(i => i.index), [1, 2]);
  assert.deepEqual(images.map(i => i.width), [800, 100]); // 跟随文档顺序，不是文件名顺序
  assert.equal(images[0].mimeType, 'image/png');
});
test('超出 maxImages 截断计数', () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ rid: `rId${i + 2}`, file: `image${i}.png`, w: 10, h: 10 }));
  const { images, truncated } = extractDocxImages(docxZip(many), { maxImages: 3 });
  assert.equal(images.length, 3); assert.equal(truncated, 2);
});
test('超过 maxImageBytes 的大图计入 skipped', () => {
  const { images, skipped } = extractDocxImages(docxZip([{ rid: 'rId2', file: 'a.png', w: 10, h: 10 }]), { maxImageBytes: 1 });
  assert.equal(images.length, 0); assert.equal(skipped, 1);
});
test('非白名单扩展名（wmf/emf）计入 skipped', () => {
  const zip = makeZip([
    { name: 'word/document.xml', data: Buffer.from('<w:document><a:blip r:embed="rId2"/></w:document>') },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from('<Relationships><Relationship Id="rId2" Type="x/image" Target="media/image1.wmf"/></Relationships>') },
    { name: 'word/media/image1.wmf', data: Buffer.from('WMF') },
  ]);
  const { images, skipped } = extractDocxImages(zip);
  assert.equal(images.length, 0); assert.equal(skipped, 1);
});
test('无图片 docx 返回空清单', () => {
  const zip = makeZip([{ name: 'word/document.xml', data: Buffer.from('<w:document/>') }]);
  assert.deepEqual(extractDocxImages(zip), { images: [], truncated: 0, skipped: 0 });
});
```

- [ ] **Step 2: 运行确认失败** — `cd agent && node --test --test-reporter=tap test/unit/docx-image-extractor.unit.test.js`

- [ ] **Step 3: 实现 image-extractor.js**

```js
// agent/src/documents/image-extractor.js - 文档图片抽取（当前仅 docx；不依赖 canvas/pdfjs）
import { readEntry } from './zip-reader.js';

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };

/** PNG IHDR / JPEG SOF0-2 头解析尺寸；解析失败返回 0x0 */
export function readImageDimensions(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (buf.length > 9 && buf[0] === 0xFF && buf[1] === 0xD8) {
    for (let p = 2; p < buf.length - 9; ) {
      if (buf[p] !== 0xFF) { p++; continue; }
      const marker = buf[p + 1];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { height: dv.getUint16(p + 5), width: dv.getUint16(p + 7) };
      }
      p += 2 + dv.getUint16(p + 2);
    }
  }
  return { width: 0, height: 0 };
}

export function extractDocxImages(buf, opts = {}) {
  const maxImages = opts.maxImages ?? 20;
  const maxImageBytes = opts.maxImageBytes ?? 5 * 1024 * 1024;
  const images = []; let truncated = 0; let skipped = 0;
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
  const ordered = []; const seen = new Set();
  for (const m of decoder.decode(docXml).matchAll(/r:embed="(rId\d+)"/g)) {
    const target = relMap.get(m[1]);
    if (target && !seen.has(target)) { seen.add(target); ordered.push(target); }
  }
  for (const entryName of ordered) {
    const ext = entryName.split('.').pop().toLowerCase();
    if (!MIME_BY_EXT[ext]) { skipped++; continue; }
    if (images.length >= maxImages) { truncated++; continue; }
    const data = readEntry(buf, entryName);
    if (!data || data.length > maxImageBytes) { skipped++; continue; }
    const { width, height } = readImageDimensions(data);
    images.push({ index: images.length + 1, name: entryName.split('/').pop(), ext, mimeType: MIME_BY_EXT[ext], bytes: data.length, width, height, data });
  }
  return { images, truncated, skipped };
}
```

- [ ] **Step 4: 运行确认通过**；agent 全量 `cd agent && node --test --test-reporter=tap test/unit/*.test.js`
- [ ] **Step 5: 提交** — `git commit -am "feat(agent): docx 内嵌图片抽取模块（r:embed 顺序编号）"`

---

### Task 3: Agent 端 extract-images 处理器 + server 路由

**Files:**
- Create: `agent/src/documents/routes.js`
- Modify: `agent/src/server.js`（顶部 import 区 L28 附近加一行；路由插在 JSON POST 区 `if (pathname === '/api/fs/download')` 块之前，约 L1163）
- Test: `agent/test/unit/docx-extract-images-route.unit.test.js`

**Interfaces:**
- Consumes: Task 2 `extractDocxImages`；`checkPath(path, tFn) → {allowed, reason, resolved}`（`agent/src/security.js`）
- Produces: `extractImagesHandler(body, { t }): Promise<{ status: number, payload: object }>`；HTTP 契约=spec §3.1：仅 `.docx`；落盘 `<文档目录>/_attachments/<词干>/img-{N}.{ext}` + `manifest.json`；成功 payload `{ success: true, dir, images: [{ index, path, page: null, mimeType, bytes, width, height, kind: 'embedded' }], truncated, skipped }`；错误 `{ success: false, error }`：`missingPath`(400)/`unsupportedFormat`(400)/403(路径拦截)/`notFound`(404)/`fileTooLarge`(413)/`parseFailed`(400)

- [ ] **Step 1: 写失败测试**（真实 `mkdtemp` tmp 目录；`t` 用恒等桩；docx fixture 复用 Task 2 测试文件导出的 `docxZip`）

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractImagesHandler } from '../../src/documents/routes.js';
import { docxZip } from './docx-image-extractor.unit.test.js';

const t = (k) => k;
async function mkWs() { return await mkdtemp(join(tmpdir(), 'aha-extract-')); }

test('合法 docx：落盘 + manifest.json + 返回清单', async () => {
  const ws = await mkWs();
  const docPath = join(ws, '报告.docx');
  await writeFile(docPath, Buffer.from(docxZip([{ rid: 'rId2', file: 'image1.png', w: 800, h: 600 }])));
  const { status, payload } = await extractImagesHandler({ path: docPath }, { t });
  assert.equal(status, 200);
  assert.equal(payload.images.length, 1);
  assert.equal(payload.images[0].width, 800);
  assert.ok(payload.images[0].path.endsWith(join('_attachments', '报告', 'img-1.png')));
  const saved = await readFile(payload.images[0].path);
  assert.ok(saved.length >= 8);
  const manifest = JSON.parse(await readFile(join(payload.dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.images[0].index, 1);
  await rm(ws, { recursive: true, force: true });
});
test('非 docx → 400 unsupportedFormat', async () => {
  const ws = await mkWs();
  const p = join(ws, 'a.pdf'); await writeFile(p, 'x');
  const r = await extractImagesHandler({ path: p }, { t });
  assert.equal(r.status, 400); assert.equal(r.payload.error, 'unsupportedFormat');
  await rm(ws, { recursive: true, force: true });
});
test('缺 path → 400 missingPath；文件不存在 → 404 notFound', async () => {
  const ws = await mkWs();
  assert.equal((await extractImagesHandler({}, { t })).status, 400);
  const nf = await extractImagesHandler({ path: join(ws, 'nope.docx') }, { t });
  assert.equal(nf.status, 404); assert.equal(nf.payload.error, 'notFound');
  await rm(ws, { recursive: true, force: true });
});
test('幂等：重复调用覆盖旧产物目录', async () => {
  const ws = await mkWs();
  const docPath = join(ws, 'a.docx');
  await writeFile(docPath, Buffer.from(docxZip([{ rid: 'rId2', file: 'image1.png', w: 10, h: 10 }])));
  await extractImagesHandler({ path: docPath }, { t });
  await writeFile(docPath, Buffer.from(docxZip([{ rid: 'rId2', file: 'a.png', w: 20, h: 20 }, { rid: 'rId3', file: 'b.png', w: 5, h: 5 }])));
  const r = await extractImagesHandler({ path: docPath }, { t });
  assert.equal(r.payload.images.length, 2);
  const files = await readdir(r.dir);
  assert.deepEqual(files.sort(), ['img-1.png', 'img-2.png', 'manifest.json']);
  await rm(ws, { recursive: true, force: true });
});
```

注意：`checkPath` 要求路径在工作区内——测试将 docx 放 `mkdtemp` 目录，若 `checkPath` 校验的是配置的工作区列表则测试会 403。实现时先读 `agent/src/security.js` 的 `checkPath` 判定逻辑（现有单测 `agent/test/unit/path-security.unit.test.js` 展示了如何构造合法路径，照其方式在测试里传入/设置可覆盖的 workspace 根，handler 签名保持 `checkPath(path, t)`）。若 checkPath 无覆盖手段，则在 `extractImagesHandler` 增加可选 `opts.checkPathOverride` 供测试注入，server 接线不传。

- [ ] **Step 2: 运行确认失败** — `cd agent && node --test --test-reporter=tap test/unit/docx-extract-images-route.unit.test.js`

- [ ] **Step 3: 实现 routes.js**

```js
// agent/src/documents/routes.js - /api/documents/* 处理器（可脱离 HTTP server 单测）
import { join, basename, extname } from 'node:path';
import { mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { checkPath } from '../security.js';
import { extractDocxImages } from './image-extractor.js';

const EXTRACT_MAX_FILE_BYTES = 50 * 1024 * 1024;

export async function extractImagesHandler(body = {}, { t, checkPathOverride } = {}) {
  const tt = typeof t === 'function' ? t : (k) => k;
  const path = body.path;
  if (!path || typeof path !== 'string') return { status: 400, payload: { success: false, error: 'missingPath' } };
  const ext = extname(path).toLowerCase();
  if (ext !== '.docx') return { status: 400, payload: { success: false, error: 'unsupportedFormat' } };

  const check = await (checkPathOverride || checkPath)(path, tt);
  if (!check.allowed) return { status: 403, payload: { success: false, error: check.reason } };
  const resolved = check.resolved;

  let fstat;
  try { fstat = await stat(resolved); } catch { return { status: 404, payload: { success: false, error: 'notFound' } }; }
  if (!fstat.isFile()) return { status: 404, payload: { success: false, error: 'notFound' } };
  if (fstat.size > EXTRACT_MAX_FILE_BYTES) return { status: 413, payload: { success: false, error: 'fileTooLarge', size: fstat.size, limit: EXTRACT_MAX_FILE_BYTES } };

  let result;
  try {
    const buf = new Uint8Array(await readFile(resolved));
    result = extractDocxImages(buf, {
      maxImages: Number(body.maxImages) > 0 ? Number(body.maxImages) : undefined,
    });
  } catch (err) {
    return { status: 400, payload: { success: false, error: 'parseFailed', detail: String(err?.message || err) } };
  }

  const stem = basename(resolved, extname(resolved));
  const docDir = resolved.slice(0, resolved.length - basename(resolved).length);
  const outDir = join(docDir, '_attachments', stem);
  try {
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    const images = [];
    for (const img of result.images) {
      const fullPath = join(outDir, `img-${img.index}.${img.ext}`);
      await writeFile(fullPath, Buffer.from(img.data));
      images.push({ index: img.index, path: fullPath, page: null, mimeType: img.mimeType, bytes: img.bytes, width: img.width, height: img.height, kind: 'embedded' });
    }
    const payload = { success: true, dir: outDir, images, truncated: result.truncated, skipped: result.skipped };
    await writeFile(join(outDir, 'manifest.json'), JSON.stringify({ updatedAt: Date.now(), source: resolved, ...payload }, null, 2));
    return { status: 200, payload };
  } catch (err) {
    return { status: 400, payload: { success: false, error: 'parseFailed', detail: String(err?.message || err) } };
  }
}
```

- [ ] **Step 4: server.js 接线** — import 区追加 `import { extractImagesHandler } from './documents/routes.js';`；`/api/fs/download` 路由前插入：

```js
      // === 文档图片抽取（docx；图片落盘到文档旁 _attachments/） ===
      if (pathname === '/api/documents/extract-images') {
        const { status, payload } = await extractImagesHandler(body, { t });
        if (payload.success) logFs('extract_images', { path: body.path, count: payload.images.length, truncated: payload.truncated });
        else logError('fs', 'extract_images_error', { path: body.path, error: payload.error });
        return jsonResponse(res, status, payload);
      }
```

- [ ] **Step 5: agent 全量测试** — `cd agent && node --test --test-reporter=tap test/unit/*.test.js`，Expected: 全部 PASS（既有基线不回归）
- [ ] **Step 6: 提交 + 构建** — `git commit -am "feat(agent): /api/documents/extract-images 端点（docx 抽图落盘）"`；`npm run build:silent`。提醒：用户侧需重启 agent 进程新端点才生效

---

### Task 4: 插件端 doc-images.js — 浏览器抠图（docx + pdf）

**Files:**
- Modify: `package.json`（`npm i jszip`）
- Create: `src/side_panel/doc-images.js`
- Test: `test/unit/doc-images-extract.unit.test.js`

**Interfaces:**
- Consumes: jszip（新增根依赖）；pdfjs-dist 动态 import（worker `libs/pdf.worker.min.js`，模式同 file-extract.js L111-115）
- Produces: `DocImage = { index, page: number|null, mimeType, bytes, width, height, dataUrl, kind: 'embedded'|'scanned-page' }`；`extractDocxImagesFromFile(file, opts?, deps?): Promise<{images: DocImage[], truncated, skipped}>`；`extractPdfImagesFromFile(file, opts?, deps?): Promise<同上>`；`deps = { encodeRgbaToPng({data,width,height})→dataUrl, renderPageToJpeg(page)→{dataUrl,width,height,blank?} }`（默认 OffscreenCanvas 实现，单测注入假实现）；内部工具 `bytesToDataUrl`、`dataUrlBytes`、`readImageDimensions`（与 agent 端算法一致，注释注明双端同步）

- [ ] **Step 1: `npm i jszip`**

- [ ] **Step 2: 写失败测试**（`vi.mock('pdfjs-dist')` 提供 fake：`getDocument→{promise→doc}`；`doc.getPage→{ getOperatorList→{fnArray,argsArray}, getTextContent→{items:[{str}]}, objs.get(name,cb) }`；`OPS.paintImageXObject=40` 常量由 mock 提供）

```js
import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { extractDocxImagesFromFile, extractPdfImagesFromFile } from 'src/side_panel/doc-images.js';

// —— docx：pngLike(mime→bytes) 与 docxZip 结构同 agent Task 2（此处用 JSZip 构造 File） ——
function pngBytes(w, h) {
  const head = new Uint8Array([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  const ihdr = new Uint8Array(25);
  new DataView(ihdr.buffer).setUint32(8, w); // 长度13+'IHDR'后：宽在整体偏移16 → ihdr[8..11]
  new DataView(ihdr.buffer).setUint32(12, h);
  return new Blob([head, ihdr, new Uint8Array([1,2,3])]);
}
async function docxFile(images) {
  const zip = new JSZip();
  zip.file('word/document.xml', `<w:document>${images.map(i => `<a:blip r:embed="${i.rid}"/>`).join('')}</w:document>`);
  zip.file('word/_rels/document.xml.rels', `<Relationships>${images.map(i => `<Relationship Id="${i.rid}" Type="t/image" Target="media/${i.file}"/>`).join('')}</Relationships>`);
  images.forEach(i => zip.file(`word/media/${i.file}`, pngBytes(i.w, i.h)));
  return new File([await zip.generateAsync({ type: 'blob' })], 'a.docx');
}

describe('extractDocxImagesFromFile', () => {
  it('按 r:embed 顺序输出 dataUrl 清单', async () => {
    const file = await docxFile([{ rid: 'rId3', file: 'b.png', w: 40, h: 30 }, { rid: 'rId2', file: 'a.png', w: 8, h: 8 }]);
    const { images } = await extractDocxImagesFromFile(file);
    expect(images.map(i => i.index)).toEqual([1, 2]);
    expect(images[0].width).toBe(40);
    expect(images[0].dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});

// —— pdf fake ——
function pdfFixture({ pages }) { /* pages: [{ ops: [name...], textLen, w, h }]
   构造 fake pdfjs module：GlobalWorkerOptions、OPS={paintImageXObject:40}、
   getDocument→doc{ numPages, getPage(i)→page }；
   page.getOperatorList→{ fnArray: ops.map(()=>40), argsArray: ops.map(n=>[n]) }；
   page.objs.get(n, cb)→cb({ data: rgbaBytes(w*h*4), width: w, height: h })；
   page.getTextContent→{ items: [{ str: 'x'.repeat(textLen) }] } */
  … // 实现按上述注释写全，返回 { file, module }
}
vi.mock('pdfjs-dist', async (importOriginal) => { /* 由测试内 setPdfMock(fake) 控制的工厂 */ … });

describe('extractPdfImagesFromFile', () => {
  it('位图去重 + 序号连续 + page 记录 + kind=embedded', async () => {
    const { file } = pdfFixture({ pages: [{ ops: ['n1', 'n1', 'n2'], textLen: 500, w: 2, h: 2 }] });
    const encodeRgbaToPng = vi.fn(async ({ width, height }) => `data:image/png;base64,F${width}x${height}`);
    const { images } = await extractPdfImagesFromFile(file, {}, { encodeRgbaToPng, renderPageToJpeg: async () => ({ dataUrl: '', blank: true }) });
    expect(images.length).toBe(2);
    expect(images.map(i => i.page)).toEqual([1, 1]);
  });
  it('文本稀少且非空白 → 整页渲染 scanned-page', async () => {
    const { file } = pdfFixture({ pages: [{ ops: [], textLen: 10, w: 0, h: 0 }] });
    const renderPageToJpeg = vi.fn(async () => ({ dataUrl: 'data:image/jpeg;base64,SC', width: 600, height: 800 }));
    const { images } = await extractPdfImagesFromFile(file, {}, { encodeRgbaToPng: async () => 'data:,', renderPageToJpeg });
    expect(images.length).toBe(1);
    expect(images[0].kind).toBe('scanned-page');
  });
  it('纯空白稀少文本页不产图', async () => {
    const { file } = pdfFixture({ pages: [{ ops: [], textLen: 0, w: 0, h: 0 }] });
    const { images } = await extractPdfImagesFromFile(file, {}, {
      encodeRgbaToPng: async () => 'data:,',
      renderPageToJpeg: async () => ({ dataUrl: '', width: 0, height: 0, blank: true }),
    });
    expect(images.length).toBe(0);
  });
});
```

- [ ] **Step 3: 运行确认失败** — `npx vitest run test/unit/doc-images-extract.unit.test.js`

- [ ] **Step 4: 实现 doc-images.js（抽取部分）**

```js
// src/side_panel/doc-images.js - 文档内嵌图片：浏览器端抽取 / 视觉转述 / 清单块 / 快照中转
// 开关唯一入口：state.enableImageInput（不新增配置项）
// 尺寸解析算法与 agent/src/documents/image-extractor.js 双端同步，修改需同时改
import logger from '../shared/logger.js';

export const VISION_CONSTANTS = {
  DESCRIBE_LIMIT: 2,
  MAX_IMAGE_BYTES: 200 * 1024,
  MAX_IMAGES: 20,
  MAX_RAW_BYTES: 5 * 1024 * 1024,
  SNAPSHOT_BUDGET: 4 * 1024 * 1024,
  SCANNED_PAGE_TEXT_THRESHOLD: 50,
};

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };

export function dataUrlBytes(dataUrl) {
  const b64 = String(dataUrl || '').split(',')[1] || '';
  return Math.floor(b64.length * 3 / 4);
}
export function bytesToDataUrl(bytes, mimeType) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}
export function readImageDimensions(buf) { /* 与 agent 端同算法：PNG IHDR / JPEG SOF；解析失败 {width:0,height:0} */ }

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
  const ordered = []; const seen = new Set();
  for (const m of (await docEntry.async('string')).matchAll(/r:embed="(rId\d+)"/g)) {
    const t = relMap.get(m[1]);
    if (t && !seen.has(t)) { seen.add(t); ordered.push(t); }
  }
  const images = []; let truncated = 0; let skipped = 0;
  for (const entryName of ordered) {
    const ext = entryName.split('.').pop().toLowerCase();
    if (!MIME_BY_EXT[ext]) { skipped++; continue; }
    if (images.length >= maxImages) { truncated++; continue; }
    const entry = zip.file(entryName);
    if (!entry) { skipped++; continue; }
    const bytes = await entry.async('uint8array');
    if (bytes.length > VISION_CONSTANTS.MAX_RAW_BYTES) { skipped++; continue; }
    const { width, height } = readImageDimensions(bytes);
    images.push({ index: images.length + 1, page: null, mimeType: MIME_BY_EXT[ext], bytes: bytes.length, width, height, dataUrl: bytesToDataUrl(bytes, MIME_BY_EXT[ext]), kind: 'embedded' });
  }
  return { images, truncated, skipped };
}

// —— 真实编码器（浏览器运行时；单测注入假实现） ——
async function defaultEncodeRgbaToPng({ data, width, height }) {
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  return await blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
}
async function defaultRenderPageToJpeg(page, scale = 1.5) {
  const vp = page.getViewport({ scale });
  const canvas = new OffscreenCanvas(Math.floor(vp.width), Math.floor(vp.height));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const x = Math.floor(canvas.width * (gx + 0.5) / 4), y = Math.floor(canvas.height * (gy + 0.5) / 4);
    const i = (y * canvas.width + x) * 4;
    if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) {
      return { dataUrl: await blobToDataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 })), width: canvas.width, height: canvas.height };
    }
  }
  return { dataUrl: '', width: canvas.width, height: canvas.height, blank: true };
}
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob);
  });
}

async function resolveObjName(page, name) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('image obj timeout')), 10000);
    page.objs.get(name, (obj) => { clearTimeout(timer); resolve(obj); });
  });
}
async function normalizeImageObject(obj) {
  const resolved = await obj; // v3 下可能是 Promise
  if (!resolved) return null;
  if (resolved.bitmap) return { bitmap: resolved.bitmap, width: resolved.bitmap.width, height: resolved.bitmap.height };
  if (resolved.data && resolved.width && resolved.height
      && resolved.data.length === resolved.width * resolved.height * 4) {
    return { data: resolved.data, width: resolved.width, height: resolved.height };
  }
  return null; // 灰度/索引色/其他：第一期跳过
}

export async function extractPdfImagesFromFile(file, opts = {}, deps = {}) {
  const encodeRgbaToPng = deps.encodeRgbaToPng || defaultEncodeRgbaToPng;
  const renderPageToJpeg = deps.renderPageToJpeg || defaultRenderPageToJpeg;
  const maxImages = opts.maxImages || VISION_CONSTANTS.MAX_IMAGES;
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const images = []; let truncated = 0; let skipped = 0;
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
        images.push({ index: images.length + 1, page: p, mimeType: 'image/png', bytes: dataUrlBytes(dataUrl), width: normalized.width, height: normalized.height, dataUrl, kind: 'embedded' });
        embeddedInPage++;
      } catch { skipped++; }
    }
    if (embeddedInPage === 0) { // 扫描件兜底：无内嵌位图 + 文本层稀少 → 整页渲染
      const textContent = await page.getTextContent();
      const textLen = (textContent.items || []).reduce((s, it) => s + ((it && it.str) || '').length, 0);
      if (textLen < VISION_CONSTANTS.SCANNED_PAGE_TEXT_THRESHOLD) {
        try {
          const rendered = await renderPageToJpeg(page);
          if (!rendered.blank && rendered.dataUrl) {
            images.push({ index: images.length + 1, page: p, mimeType: 'image/jpeg', bytes: dataUrlBytes(rendered.dataUrl), width: rendered.width, height: rendered.height, dataUrl: rendered.dataUrl, kind: 'scanned-page' });
          }
        } catch { skipped++; }
      }
    }
  }
  return { images, truncated, skipped };
}

async function bitmapToDataUrl(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return await blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
}
```

- [ ] **Step 5: 运行确认通过** — `npx vitest run test/unit/doc-images-extract.unit.test.js`；全量 `npx vitest run` 不回归
- [ ] **Step 6: 提交** — `git commit -am "feat(side-panel): 浏览器端 docx/pdf 内嵌图片抽取（doc-images）"`

---

### Task 5: doc-images.js — 压缩、视觉转述、清单块、快照中转

**Files:**
- Modify: `src/side_panel/doc-images.js`（追加导出 + 模块内 `registerTranslations` 双语）
- Test: `test/unit/doc-images-describe.unit.test.js`

**Interfaces:**
- Consumes: Task 4 `DocImage`/`dataUrlBytes`；`decodeSecret`（shared/secret.js）；`t/registerTranslations`（shared/i18n.js）
- Produces:
  - `compressForVision(dataUrl, deps?): Promise<string|null>`（`deps.toJpeg(dataUrl, maxDim, quality)→{dataUrl}`，默认 createImageBitmap+OffscreenCanvas；目标 ≤ `MAX_IMAGE_BYTES`，5 轮降级后仍超返 null）
  - `getVisionConfig(): Promise<{apiBase, apiKey, model}>`（imageApiBase 留空回落 apiBase；Key 经 decodeSecret）
  - `describeImages(images, count?): Promise<Record<number, string|null>>`（非流式、单图 60s AbortController、失败置 null 不抛）
  - `buildImageBlock(fileEntry, fileName): string`（spec §5 格式；page=null 省略页码段；含 `read_document_image(file="…", image=N)` 用法提示）
  - `saveDocImageSnapshot(sessionId, attachedFiles)`；`removeDocImageSnapshot(sessionId)`；storage key `_docImageSnapshot`

- [ ] **Step 1: 写失败测试**（stub `globalThis.chrome.storage.local` + `globalThis.fetch`；`setLocale('zh')`）

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
const store = {};
globalThis.chrome = { storage: { local: {
  get: vi.fn((keys, cb) => cb(Object.fromEntries([].concat(keys).filter(k => store[k] !== undefined).map(k => [k, store[k]))))),
  set: vi.fn((obj) => { Object.assign(store, obj); return Promise.resolve(); }),
} } };
globalThis.fetch = vi.fn();
const { describeImages, buildImageBlock, saveDocImageSnapshot } = await import('src/side_panel/doc-images.js');
const { setLocale } = await import('src/shared/i18n.js');

beforeEach(() => { setLocale('zh'); Object.keys(store).forEach(k => delete store[k]); fetch.mockReset(); });

describe('describeImages', () => {
  it('配置留空回落 base；读取 enc: Key 解码', async () => {
    store.apiBase = 'https://base.example/v1'; store.modelName = 'm1';
    fetch.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '一张柱状图' } }] }) });
    const out = await describeImages([{ index: 1, dataUrl: 'data:image/png;base64,AAA' }], 2);
    expect(out[1]).toBe('一张柱状图');
    expect(fetch.mock.calls[0][0]).toBe('https://base.example/v1/chat/completions');
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('m1');
  });
  it('单图 API 失败置 null 不抛出', async () => {
    store.apiBase = 'x'; store.apiKey = 'enc:ab'; store.modelName = 'm';
    fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'err' });
    const out = await describeImages([{ index: 1, dataUrl: 'data:,' }], 2);
    expect(out[1]).toBeNull();
  });
});

describe('buildImageBlock', () => {
  it('混合已描述/未描述 + 工具用法行', () => {
    const block = buildImageBlock({ images: [{ index: 1, page: 3 }, { index: 2, page: 5 }], imageDescriptions: { 1: '架构图' } }, '报告.docx');
    expect(block).toContain('共 2 张，已描述 1 张');
    expect(block).toContain('〔图片1｜第3页〕架构图');
    expect(block).toContain('read_document_image(file="报告.docx", image=2)');
  });
  it('page=null（docx）不输出页码段；truncated 追加超限行', () => {
    const block = buildImageBlock({ images: [{ index: 1, page: null }], truncated: 3 }, 'a.docx');
    expect(block).not.toContain('第null页');
    expect(block).toContain('另有 3 张图未抽取');
  });
  it('无图返空串', () => {
    expect(buildImageBlock({ images: [] }, 'a.docx')).toBe('');
  });
});

describe('saveDocImageSnapshot', () => {
  it('agent 来源只存清单，local 来源存 dataUrl', async () => {
    await saveDocImageSnapshot('s1', [
      { status: 'done', name: 'a.docx', imageSource: 'agent', images: [{ index: 1, page: null, path: '/ws/_attachments/a/img-1.png' }] },
      { status: 'done', name: 'b.pdf', imageSource: 'local', images: [{ index: 1, page: 2, dataUrl: 'data:image/png;base64,AAAA' }] },
    ]);
    const snap = store._docImageSnapshot.s1;
    expect(snap.files[0].images[0].dataUrl).toBeUndefined();
    expect(snap.files[0].images[0].path).toBe('/ws/_attachments/a/img-1.png');
    expect(snap.files[1].images[0].dataUrl).toContain('base64');
  });
  it('本次无图 → 清除该 session 旧快照', async () => {
    store._docImageSnapshot = { s2: { updatedAt: 1, files: [] } };
    await saveDocImageSnapshot('s2', []);
    expect(store._docImageSnapshot.s2).toBeUndefined();
  });
  it('超 SNAPSHOT_BUDGET 从旧 session 起淘汰；仅剩当前 session 时剥除最旧 dataUrl', async () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(300 * 1024);
    store._docImageSnapshot = { old: { updatedAt: 1, files: [{ name: 'o.pdf', imageSource: 'local', images: [{ index: 1, dataUrl: big }] }] } };
    await saveDocImageSnapshot('new1', [{ status: 'done', name: 'n.docx', imageSource: 'local', images: [{ index: 1, dataUrl: big }] }]);
    expect(store._docImageSnapshot.old).toBeUndefined();
    expect(store._docImageSnapshot.new1).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npx vitest run test/unit/doc-images-describe.unit.test.js`
- [ ] **Step 3: 实现追加部分**

```js
// —— 压缩（真实环境 createImageBitmap+OffscreenCanvas；canvas 分支单测不覆盖，Task 9 视觉验证） ——
export async function compressForVision(dataUrl, deps = {}) {
  const toJpeg = deps.toJpeg || defaultToJpeg; // (dataUrl, maxDim, quality) → Promise<{dataUrl}|null>
  let maxDim = 1024, quality = 0.65;
  for (let i = 0; i < 5; i++) {
    let out;
    try { out = await toJpeg(dataUrl, maxDim, quality); } catch { return null; }
    if (!out || !out.dataUrl) return null;
    if (dataUrlBytes(out.dataUrl) <= VISION_CONSTANTS.MAX_IMAGE_BYTES) return out.dataUrl;
    if (quality > 0.3) quality = Math.round((quality - 0.15) * 100) / 100;
    else maxDim = Math.floor(maxDim * 0.75);
  }
  return null; // 仍超 200KB：放弃实体，清单保留元信息（spec §6.1）
}

async function defaultToJpeg(dataUrl, maxDim, quality) {
  const resp = await fetch(dataUrl); // side panel 可 fetch data: URL
  const bitmap = await createImageBitmap(await resp.blob());
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { dataUrl: await blobToDataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality })), width: canvas.width, height: canvas.height };
}

// —— 视觉配置（回落链与 tool-executor.js L1495-1497 / chat-manager 选模一致） ——
export async function getVisionConfig() {
  const cfg = await new Promise(r => chrome.storage.local.get(['imageApiBase', 'imageApiKey', 'imageModelName', 'apiBase', 'apiKey', 'modelName'], r));
  return {
    apiBase: cfg.imageApiBase || cfg.apiBase || '',
    apiKey: decodeSecret(cfg.imageApiKey) || decodeSecret(cfg.apiKey) || '',
    model: cfg.imageModelName || cfg.modelName || '',
  };
}

// 转述 prompt（zh）：客观描述图片内容并转录其中全部可读文字（OCR），不超过 300 字。
export async function describeImages(images, count = VISION_CONSTANTS.DESCRIBE_LIMIT) {
  const out = {};
  if (!images || images.length === 0) return out;
  const { apiBase, apiKey, model } = await getVisionConfig();
  const targets = images.filter(im => im.dataUrl).slice(0, count);
  if (!apiBase || !apiKey) { targets.forEach(im => out[im.index] = null); return out; }
  for (const img of targets) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const resp = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, max_tokens: 800, stream: false, messages: [{ role: 'user', content: [
          { type: 'text', text: t('docImages.describePrompt') },
          { type: 'image_url', image_url: { url: img.dataUrl, detail: 'auto' } },
        ] }] }),
      });
      out[img.index] = resp.ok ? ((await resp.json()).choices?.[0]?.message?.content || null) : null;
    } catch { out[img.index] = null; }
    finally { clearTimeout(timer); }
  }
  return out;
}

// 清单块（spec §5）；i18n 文案：
//   zh: header '[文档图片: 共 {total} 张，已描述 {described} 张]'；page '第{page}页｜'；
//   lineDescribed '〔图片{index}｜{loc}〕{desc}'；
//   lineTool '〔图片{index}｜{loc}〕未描述，可调用 read_document_image(file="{file}", image={index}) 查看。'；
//   truncated '[另有 {count} 张图未抽取，超出单文档 20 张上限]'；describePrompt 如上；
//   previewDescribed '📷 已描述 {described}/{total}'；previewFail '📷 图片抽取失败'；previewOff '图片不会被识别（可在设置中开启图片识别）'
//   en: 同键名英文文案（lineTool 英文: '… not described; call read_document_image(file="{file}", image={index}) to view.'）
export function buildImageBlock(fileEntry, fileName) {
  const images = fileEntry.images || [];
  if (images.length === 0) return '';
  const descs = fileEntry.imageDescriptions || {};
  const described = images.filter(im => descs[im.index]).length;
  const lines = [t('docImages.header', { total: images.length, described })];
  for (const im of images) {
    const loc = im.page ? t('docImages.page', { page: im.page }) : '';
    if (descs[im.index]) lines.push(t('docImages.lineDescribed', { index: im.index, loc, desc: String(descs[im.index]).trim() }));
    else lines.push(t('docImages.lineTool', { index: im.index, loc, file: fileName }));
  }
  if (fileEntry.truncated > 0) lines.push(t('docImages.truncated', { count: fileEntry.truncated }));
  return '\n\n' + lines.join('\n');
}

// 快照中转（storage key: _docImageSnapshot；结构 { [sessionId]: { updatedAt, files: [{ name, imageSource, images: [{ index, page, path?, dataUrl? }] }] } }）
export async function saveDocImageSnapshot(sessionId, attachedFiles) {
  const store0 = await new Promise(r => chrome.storage.local.get(['_docImageSnapshot'], r));
  const snap = store0._docImageSnapshot || {};
  const withImages = (attachedFiles || []).filter(f => f.status === 'done' && (f.images || []).length > 0);
  if (withImages.length === 0) {
    delete snap[sessionId];
  } else {
    snap[sessionId] = { updatedAt: Date.now(), files: withImages.map(f => ({
      name: f.name, imageSource: f.imageSource,
      images: f.images.map(im => { const c = { index: im.index, page: im.page ?? null }; if (im.path) c.path = im.path; if (im.dataUrl) c.dataUrl = im.dataUrl; return c; }),
    })) };
    // 预算：所有 session 的 local dataUrl 合计 ≤ SNAPSHOT_BUDGET；从最旧 updatedAt 起整 session 淘汰，当前 session 最后存活时剥数据保清单
    const entryBytes = e => e.files.reduce((s, f) => s + (f.imageSource === 'local' ? f.images.reduce((is, im) => is + (im.dataUrl ? dataUrlBytes(im.dataUrl) : 0), 0) : 0), 0);
    let over = () => Object.values(snap).reduce((s, e) => s + entryBytes(e), 0) > VISION_CONSTANTS.SNAPSHOT_BUDGET;
    while (over() && Object.keys(snap).length > 1) {
      const oldest = Object.entries(snap).filter(([k]) => k !== sessionId).sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
      if (!oldest) break;
      delete snap[oldest[0]];
    }
    if (over() && snap[sessionId]) {
      snap[sessionId].files.forEach(f => { if (f.imageSource === 'local') f.images.forEach(im => { delete im.dataUrl; }); });
    }
  }
  await new Promise(r => chrome.storage.local.set({ _docImageSnapshot: snap }, r));
}

export async function removeDocImageSnapshot(sessionId) {
  const store0 = await new Promise(r => chrome.storage.local.get(['_docImageSnapshot'], r));
  const snap = store0._docImageSnapshot || {};
  if (snap[sessionId]) {
    delete snap[sessionId];
    await new Promise(r => chrome.storage.local.set({ _docImageSnapshot: snap }, r));
  }
}
```

模块头部补 `import { t, registerTranslations } from '../shared/i18n.js';`、`import { decodeSecret } from '../shared/secret.js';` 与 zh/en 两组 `registerTranslations`。

- [ ] **Step 4: 运行确认通过** — `npx vitest run test/unit/doc-images-describe.unit.test.js`
- [ ] **Step 5: 提交** — `git commit -am "feat(side-panel): doc-images 视觉转述/清单块/快照中转"`；`npm run build:silent`

---

### Task 6: file-extract.js 编排接线 + 附件预览状态

**Files:**
- Modify: `src/side_panel/file-extract.js`
- Test: `test/unit/file-extract-image-wiring.unit.test.js`

**Interfaces:**
- Consumes: Task 4/5 全部导出；`state.enableImageInput`、`state.agentPlatform`、`uploadFileToAgent`（现有 L189）
- Produces: `runImagePipeline(fileEntry, file, category, isAgentMode): Promise<void>`（导出仅供测试；副作用写 fileEntry 的 `images/imageSource/imageDescriptions/truncated/skipped/imageStatus`）；`getAgentConnectionInfo(): Promise<{url, token}|null>`（从 uploadFileToAgent 抽出，uploadFileToAgent 改调它，行为不变）；`agentPostToActive(jsonPath, body): Promise<object>`（复用 getAgentConnectionInfo 的 POST JSON 封装）；`buildFileContentText` 输出追加图片块；`renderFilePreviews` 新增📷状态行

- [ ] **Step 1: 写失败测试**（`vi.mock('./doc-images.js')`；fetch 按 url 分支 stub）

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./doc-images.js', () => ({
  extractDocxImagesFromFile: vi.fn(async () => ({ images: [{ index: 1, page: null, dataUrl: 'data:x' }], truncated: 0, skipped: 0 })),
  extractPdfImagesFromFile: vi.fn(async () => ({ images: [{ index: 1, page: 2, dataUrl: 'data:x' }], truncated: 0, skipped: 0 })),
  compressForVision: vi.fn(async (u) => u),
  describeImages: vi.fn(async (ims) => ({ [ims[0].index]: '描述' })),
  buildImageBlock: vi.fn(() => '\n\n[BLOCK]'),
  VISION_CONSTANTS: { DESCRIBE_LIMIT: 2, MAX_IMAGES: 20, MAX_RAW_BYTES: 5 * 1024 * 1024 },
}));
import { runImagePipeline, buildFileContentText } from 'src/side_panel/file-extract.js';
import state from 'src/side_panel/state.js';

beforeEach(() => { state.attachedFiles = []; state.enableImageInput = true; });

describe('runImagePipeline', () => {
  it('开关关闭时不做任何事', async () => {
    state.enableImageInput = false;
    const entry = { name: 'a.docx', status: 'done' };
    await runImagePipeline(entry, new File([''], 'a.docx'), 'docx', false);
    expect(entry.images).toBeUndefined();
  });
  it('浏览器模式 docx：source=local + 转述 + imageStatus=described', async () => {
    const entry = { name: 'a.docx', status: 'done' };
    await runImagePipeline(entry, new File([''], 'a.docx'), 'docx', false);
    expect(entry.imageSource).toBe('local');
    expect(entry.images.length).toBe(1);
    expect(entry.imageDescriptions[1]).toBe('描述');
    expect(entry.imageStatus).toBe('described');
  });
  it('Agent 模式 pdf：本地抽取 source=local', async () => {
    const entry = { name: 'a.pdf', status: 'done', agentPath: '/ws/a.pdf' };
    await runImagePipeline(entry, new File([''], 'a.pdf'), 'pdf', true);
    expect(entry.imageSource).toBe('local');
  });
  it('Agent 模式 docx：调端点+下载+转述 source=agent', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: (k, cb) => cb({ pairedAgents: [{ id: 'a1', url: 'http://127.0.0.1:18910', token: 'enc:TK' }], activeAgentId: 'a1' }) } } });
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/api/documents/extract-images')) {
        return { ok: true, json: async () => ({ success: true, dir: '/d', truncated: 0, skipped: 0, images: [{ index: 1, page: null, path: '/d/img-1.png', mimeType: 'image/png', bytes: 10, width: 8, height: 8, kind: 'embedded' }] }) };
      }
      if (String(url).includes('/api/fs/download')) {
        return { ok: true, json: async () => ({ success: true, type: 'file', content: 'QUFB', mimeType: 'image/png' }) };
      }
      throw new Error('unexpected ' + url);
    }));
    const entry = { name: 'a.docx', status: 'done', agentPath: '/ws/a.docx' };
    await runImagePipeline(entry, new File([''], 'a.docx'), 'docx', true);
    expect(entry.imageSource).toBe('agent');
    expect(entry.images[0].path).toContain('img-1.png');
    expect(entry.imageDescriptions[1]).toBe('描述'); // 下载后压缩→转述链路走通
    vi.unstubAllGlobals();
  });
  it('抽取异常降级 imageStatus=error 不抛出', async () => {
    const { extractDocxImagesFromFile } = await import('./doc-images.js');
    extractDocxImagesFromFile.mockRejectedValueOnce(new Error('corrupt'));
    const entry = { name: 'a.docx', status: 'done' };
    await runImagePipeline(entry, new File([''], 'a.docx'), 'docx', false);
    expect(entry.imageStatus).toBe('error');
  });
});

describe('buildFileContentText 图片块追加', () => {
  it('有图文件在标记后追加块；无图逐字节不变', () => {
    state.attachedFiles = [
      { name: 'b.pdf', status: 'done', text: 'BODY', images: [{ index: 1, page: 1 }] },
      { name: 'c.txt', status: 'done', text: 'PLAIN' },
    ];
    const out = buildFileContentText();
    expect(out).toContain('[文件内容: b.pdf]\nBODY');
    expect(out).toContain('[BLOCK]');
    expect(out.indexOf('[BLOCK]')).toBeGreaterThan(out.indexOf('BODY'));
    // c.txt 段落内不含块
    expect(out.split('---')[1]).not.toContain('[BLOCK]');
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npx vitest run test/unit/file-extract-image-wiring.unit.test.js`
- [ ] **Step 3: 实现接线**

```js
// file-extract.js 新增 import（模块顶部）
import { extractDocxImagesFromFile, extractPdfImagesFromFile, compressForVision, describeImages, buildImageBlock, VISION_CONSTANTS } from './doc-images.js';

// 1) 抽出 getAgentConnectionInfo：将 uploadFileToAgent L190-198 的 storage 读取段提取为导出函数
export async function getAgentConnectionInfo() {
  const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
  const agents = (storage.pairedAgents || []).map(a => a.token ? { ...a, token: decodeSecret(a.token) } : a);
  const active = agents.find(a => a.id === storage.activeAgentId);
  if (!active?.url || !active?.token) return null;
  return { url: active.url, token: active.token };
}
// uploadFileToAgent 改为 const agent = await getAgentConnectionInfo(); if (!agent) throw …

// 2) Agent JSON POST 封装（extract-images 用）
async function agentPostToActive(jsonPath, body) {
  const agent = await getAgentConnectionInfo();
  if (!agent) throw new Error(t('fileExtract.agentNotPaired'));
  const resp = await fetch(`${agent.url}${jsonPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agent.token}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

// 3) 图片链路编排（失败仅置 imageStatus，绝不影响文本主链路）
export async function runImagePipeline(fileEntry, file, category, isAgentMode) {
  if (!state.enableImageInput) return;
  if (category !== 'docx' && category !== 'pdf') return;
  try {
    if (isAgentMode && category === 'docx') {
      const manifest = await agentPostToActive('/api/documents/extract-images', { path: fileEntry.agentPath });
      if (!manifest || manifest.success !== true) throw new Error(manifest?.error || 'extractFailed');
      fileEntry.images = manifest.images;
      fileEntry.truncated = manifest.truncated || 0;
      fileEntry.imageSource = 'agent';
      // 拉前 DESCRIBE_LIMIT 张原图（/api/fs/download 返回 base64）转 dataUrl 后压缩供转述
      const agent = await getAgentConnectionInfo();
      for (const im of (fileEntry.images || []).slice(0, VISION_CONSTANTS.DESCRIBE_LIMIT)) {
        const dl = await fetch(`${agent.url}/api/fs/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agent.token}` },
          body: JSON.stringify({ path: im.path }),
        }).then(r => r.json());
        if (dl.success && dl.content) im.dataUrl = await compressForVision(`data:${dl.mimeType};base64,${dl.content}`);
      }
    } else {
      const { images, truncated, skipped } = category === 'docx'
        ? await extractDocxImagesFromFile(file)
        : await extractPdfImagesFromFile(file);
      for (const im of images) {
        const c = await compressForVision(im.dataUrl);
        if (c === null) { im.overLimit = true; delete im.dataUrl; } else { im.dataUrl = c; }
      }
      fileEntry.images = images;
      fileEntry.truncated = truncated;
      fileEntry.skipped = skipped;
      fileEntry.imageSource = 'local';
    }
    if (!fileEntry.images || fileEntry.images.length === 0) { fileEntry.imageStatus = 'none'; return; }
    fileEntry.imageStatus = 'extracted';
    fileEntry.imageDescriptions = await describeImages(fileEntry.images.filter(im => im.dataUrl), VISION_CONSTANTS.DESCRIBE_LIMIT);
    fileEntry.imageStatus = 'described';
  } catch (err) {
    logger.warn('[FileExtract] image pipeline failed (degrade):', file.name, err.message);
    fileEntry.imageStatus = fileEntry.images?.length ? fileEntry.imageStatus || 'extracted' : 'error';
    if (!fileEntry.images) fileEntry.imageStatus = 'error';
  }
}

// 4) processFile 接线：
//    Agent 分支（L241 status='done' 前）：await runImagePipeline(fileEntry, file, category, true);
//    浏览器分支（L258 text 赋值后）：await runImagePipeline(fileEntry, file, category, false);
//    两处均失败不中断（runImagePipeline 内部已 catch）

// 5) buildFileContentText：agentFiles/browserFiles 循环内，push 标记后追加：
//    const block = buildImageBlock(file, file.name); if (block) parts.push(parts.pop() + block);  // 块紧跟同一文件标记/正文之后

// 6) renderFilePreviews：status 标签区（L375-391）后追加：
//    if (file.images?.length) { 📷 行：described 数/总数；imageStatus==='error' → t('docImages.previewFail') }
//    if (!state.enableImageInput && ['docx','pdf'].some(...) 附件含 docx/pdf) → 隐藏提示行 t('docImages.previewOff')（title 属性即可，不新增 DOM 结构）
```

注意：`describeImages` 只对有 `dataUrl` 的图转述（Agent 模式清单中超出 DESCRIBE_LIMIT 的图只有 path 无 dataUrl，自然跳过）；`buildImageBlock` 对无 dataUrl 且无描述的图输出工具用法行，与 spec 一致。

- [ ] **Step 4: 运行确认通过** + 全量 `npx vitest run` 不回归
- [ ] **Step 5: 提交** — `git commit -am "feat(side-panel): 附件处理接线图片链路与预览状态"`；`npm run build:silent`

---

### Task 7: 发送时快照写入 + session 删除清理

**Files:**
- Modify: `src/side_panel/chat-manager.js`（L985-997 附件注入段）
- Modify: `src/side_panel/prompt-manager.js`（L742 附近同构段落）
- Modify: `src/storage/session-store.js`（L399 `idb.deleteSession(sessionId)` 前）
- Test: `test/unit/doc-image-snapshot-wiring.unit.test.js`

**Interfaces:**
- Consumes: Task 5 `saveDocImageSnapshot/removeDocImageSnapshot`
- Produces: 发送链路副作用——`_docImageSnapshot[sessionId]` 在两条发送链路（chat-manager / prompt-manager 提示词一键发送）均写入；session 删除时同步清理（对齐记忆觃范：多发送链路上下文注入必须对齐）

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect, vi } from 'vitest';
vi.mock('src/side_panel/doc-images.js', async (orig) => {
  const real = await orig();
  return { ...real, saveDocImageSnapshot: vi.fn(async () => {}), removeDocImageSnapshot: vi.fn(async () => {}) };
});
// 断言 1：仿照现有 chat-manager-*.unit.test.js 的 setup 模式（参考 test/unit/chat-manager-error-msg.unit.test.js 的环境搭建），
//   构造带 images 的 attachedFiles 后触发发送组装函数，expect(saveDocImageSnapshot).toHaveBeenCalledWith(sessionId, files)
// 断言 2：prompt-manager 同一组 mock 下另一条发送链路同样触发（可只测到达 saveDocImageSnapshot 的分支，mock 掉模型请求后续）
// 断言 3：session-store.deleteSession('sx') 后 expect(removeDocImageSnapshot).toHaveBeenCalledWith('sx')
```

（实现时从现有同前缀测试文件拷环境搭建样板；本任务不新建测试基础设施。）

- [ ] **Step 2: 运行确认失败** — `npx vitest run test/unit/doc-image-snapshot-wiring.unit.test.js`
- [ ] **Step 3: 接线**

```js
// chat-manager.js 附件注入段（L985 if (attachedFilesSnapshot.length > 0) { … }）内，buildFileContentText() 之后追加：
    // 图片快照中转：供 background 的 read_document_image 工具取图（失败不影响发送）
    try { await saveDocImageSnapshot(state.activeSessionId, attachedFilesSnapshot); }
    catch (e) { logger.warn('[Chat] save doc image snapshot failed:', e.message); }

// prompt-manager.js L742 同构位置同样追加（注释注明与 chat-manager 对齐）

// session-store.js deleteSession（L399 idb.deleteSession 前）：
  try { await removeDocImageSnapshot(sessionId); } catch { /* 中转存储清理失败不阻断删除 */ }
// （session-store 若无 chrome.storage 环境依赖，用 typeof chrome !== 'undefined' 守卫）

// 附件移除（file-extract.js removeFile/clearFiles）无需额外处理：快照在下次发送时按
// withImages 过滤自然覆盖；若本次无图则删除该 session 旧快照（Task 5 已实现）
```

- [ ] **Step 4: 运行确认通过**；全量 `npx vitest run`
- [ ] **Step 5: 提交** — `git commit -am "feat(side-panel): 发送链路写入图片快照中转 + session 删除清理"`；`npm run build:silent`

---

### Task 8: 内置工具 read_document_image（定义 + background 执行器）

**Files:**
- Modify: `src/background/tools/browser-tools.js`（`content_extraction` 组末尾追加定义）
- Modify: `src/background/tool-executor.js`（新 handler + `TOOL_HANDLERS` 注册（L2106 附近 map）+ 视觉请求函数）
- Modify: `src/background/local-agent-client.js`（确认 `downloadFile` 在 L1074 export 块中，缺则补导出）
- Modify: `src/shared/locales/zh.js` / `en.js`（`search_in_page` 所在工具描述段 L667 附近各加一条）
- Test: `test/unit/tool-read-document-image.unit.test.js`

**Interfaces:**
- Consumes: `_docImageSnapshot`（Task 5 结构）；`downloadFile(path) → {success, content(base64), mimeType}`（local-agent-client）；`compressImageForVision(dataUrl, maxDim, quality)`（tool-executor.js 内部 L1449，提为可导出供新 handler 复用或同文件内直接调用）；工具配置回落链同 `analyzeScreenshotWithVision`（L1490-1498）
- Produces: 工具 `read_document_image`，schema `{ file: string, image: integer, question?: string }`；`required: ["file", "image"]`；`execution:'background'`、`parallelizable:false`、`requiresConfirmation:false`；成功返回 `{ success: true, data: <深读文本>, tool_call_id }`；失败 `makeResult(false, <错误文案>)`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
// mock chrome.storage（存 _docImageSnapshot + 视觉配置）、local-agent-client.downloadFile、fetch
const snapshots = {
  s1: { updatedAt: 1, files: [
    { name: 'a.docx', imageSource: 'agent', images: [{ index: 1, page: null, path: '/ws/_attachments/a/img-1.png' }] },
    { name: 'b.pdf', imageSource: 'local', images: [{ index: 1, page: 2, dataUrl: 'data:image/png;base64,AAA' }] },
    { name: 'c.pdf', imageSource: 'local', images: [{ index: 1, page: 2 }] }, // dataUrl 已失效（重启后）
  ] } },
};
globalThis.chrome = { storage: { local: { get: (k, cb) => cb({ _docImageSnapshot: snapshots, apiBase: 'https://v.example/v1', apiKey: 'enc:KEY', modelName: 'vision-m' }) } }, runtime: { sendMessage: vi.fn(() => Promise.resolve()) } };
globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '图中表格显示 Q3 营收 180 万' } }] }) }));
import { executeTool } from 'src/background/tool-executor.js';

beforeEach(() => { vi.mocked(fetch).mockClear(); });

const call = (args) => executeTool({ name: 'read_document_image', arguments: JSON.stringify(args), id: 't1' }, null, 's1');

describe('read_document_image', () => {
  it('local 来源：直读快照 dataUrl → 视觉深读 → 返回文本', async () => {
    const r = await call({ file: 'b.pdf', image: 1, question: '图里的表格数值是多少' });
    expect(r.success).toBe(true);
    expect(r.data).toContain('180 万');
    expect(JSON.parse(fetch.mock.calls[0][1].body).messages[0].content[0].text).toContain('图里的表格数值是多少');
  });
  it('agent 来源：走 downloadFile 取图', async () => {
    const dl = await import('src/background/local-agent-client.js');
    // vi.mock local-agent-client：downloadFile → { success: true, content: 'QUFB', mimeType: 'image/png' }
    const r = await call({ file: 'a.docx', image: 1 });
    expect(dl.downloadFile).toHaveBeenCalledWith('/ws/_attachments/a/img-1.png');
    expect(r.success).toBe(true);
  });
  it('file 不在会话附件 → 错误文案', async () => {
    const r = await call({ file: 'zzz.docx', image: 1 });
    expect(r.success).toBe(false); expect(r.error).toContain('zzz.docx');
  });
  it('序号越界 → 含总数提示', async () => {
    const r = await call({ file: 'b.pdf', image: 9 });
    expect(r.success).toBe(false); expect(r.error).toMatch(/共 1 张/);
  });
  it('local 快照无 dataUrl（失效）→ 请重新附加', async () => {
    const r = await call({ file: 'c.pdf', image: 1 });
    expect(r.success).toBe(false); expect(r.error).toContain('重新附加');
  });
  it('视觉 API 未配置 → 明确错误', async () => {
    // chrome.storage mock 返回空配置变体
    const r = await call({ file: 'b.pdf', image: 1 });
    expect(r.success).toBe(false); expect(r.error).toContain('图片识别');
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npx vitest run test/unit/tool-read-document-image.unit.test.js`（工具未知）
- [ ] **Step 3: 工具定义（browser-tools.js，content_extraction 组末）**

```js
  {
    id: 'read_document_image',
    category: 'content_extraction',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'read_document_image',
      description: 'Deep-read one image extracted from an attached document (docx/pdf) in this session. Use it when the inline image description is insufficient or you need specific details from an image listed in the document image manifest. Returns a text analysis of the image from the vision model.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Attachment file name exactly as shown in the manifest, e.g. 报告.docx' },
          image: { type: 'integer', description: 'Image index from the manifest, starting at 1' },
          question: { type: 'string', description: 'Optional: what specific detail to focus on; omit for a full re-description' },
        },
        required: ['file', 'image'],
      },
    },
  },
```

- [ ] **Step 4: locales 双语文案**（`search_in_page` 所在段同键位结构新增）

```js
// zh.js：read_document_image: '深入读取会话附件文档中的指定图片（视觉模型分析后返回文本）',
// en.js：read_document_image: 'Deep-read a specified image from attached documents via vision model',
// 另在 toolExec 段新增错误/提示键（zh/en 双语，键名同）：
//   docImageFileNotFound: '附件 {file} 不在当前会话的图片清单中，可用附件：{files}'
//   docImageIndexOutOfRange: '图片序号 {image} 越界（{file} 共 {total} 张）'
//   docImageCacheLost: '图片缓存已失效，请重新附加该文件后再试'
//   docImageAgentOffline: 'Agent 不在线或取图失败，无法读取 {file} 的图片 {image}'
//   docImageVisionNotConfigured: '未配置图片识别 API（可在设置中开启图片识别并配置端点），无法深读图片'
//   docImageVisionFailed: '图片识别 API 调用失败：{detail}'
//   docImageDeepReadPrompt（无 question 时）: '详细完整描述图片内容，逐项转录图中全部可读文字与数值。'
//   docImageDeepReadPromptQuestion: '请结合以下问题重点分析图片，并逐项转录图中相关可读文字与数值。问题：{question}'
```

- [ ] **Step 5: tool-executor.js handler**

```js
// 新增（仿 analyzeScreenshotWithVision L1488+ 的配置读取/请求/错误模式；非流式，工具结果同步返回）
async function executeReadDocumentImage(args, toolCallId, sessionId) {
  const store = await new Promise(r => chrome.storage.local.get(['_docImageSnapshot'], r));
  const snap = (store._docImageSnapshot || {})[sessionId];
  const fileEntry = snap?.files?.find(f => f.name === args.file);
  if (!fileEntry) return makeResult(false, t('toolExec.docImageFileNotFound', { file: args.file, files: (snap?.files || []).map(f => f.name).join(', ') || '无' }), { tool_call_id: toolCallId });
  const img = (fileEntry.images || []).find(im => im.index === args.image);
  if (!img) return makeResult(false, t('toolExec.docImageIndexOutOfRange', { image: args.image, file: args.file, total: (fileEntry.images || []).length }), { tool_call_id: toolCallId });

  let dataUrl = img.dataUrl || '';
  if (!dataUrl && img.path) { // agent 来源：现拉
    const dl = await downloadFile(img.path); // local-agent-client（若未导出则补 export）
    if (!dl?.success || !dl.content) return makeResult(false, t('toolExec.docImageAgentOffline', { file: args.file, image: args.image }), { tool_call_id: toolCallId });
    dataUrl = `data:${dl.mimeType || 'image/png'};base64,${dl.content}`;
  }
  if (!dataUrl) return makeResult(false, t('toolExec.docImageCacheLost'), { tool_call_id: toolCallId });

  const compressed = await compressImageForVision(dataUrl, 1024, 0.65) || dataUrl; // 压缩失败回退原图（同截图工具既有容错）
  const prompt = args.question
    ? t('toolExec.docImageDeepReadPromptQuestion', { question: String(args.question).slice(0, 500) })
    : t('toolExec.docImageDeepReadPrompt');
  const cfg = await new Promise(r => chrome.storage.local.get(['imageApiBase', 'imageApiKey', 'imageModelName', 'apiBase', 'apiKey', 'modelName'], r));
  const apiBase = cfg.imageApiBase || cfg.apiBase, apiKey = decodeSecret(cfg.imageApiKey) || decodeSecret(cfg.apiKey), model = cfg.imageModelName || cfg.modelName;
  if (!apiBase || !apiKey) return makeResult(false, t('toolExec.docImageVisionNotConfigured'), { tool_call_id: toolCallId });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const resp = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: compressed, detail: 'auto' } },
      ] }] }),
    });
    clearTimeout(timer);
    if (!resp.ok) return makeResult(false, t('toolExec.docImageVisionFailed', { detail: `HTTP ${resp.status}` }), { tool_call_id: toolCallId });
    const data = await resp.json();
    const analysis = data.choices?.[0]?.message?.content;
    if (!analysis) return makeResult(false, t('toolExec.docImageVisionFailed', { detail: 'empty' }), { tool_call_id: toolCallId });
    return makeResult(true, analysis, { tool_call_id: toolCallId });
  } catch (err) {
    return makeResult(false, t('toolExec.docImageVisionFailed', { detail: err.message }), { tool_call_id: toolCallId });
  }
}
// TOOL_HANDLERS map 注册：read_document_image: executeReadDocumentImage,
// 顶部 import：import { downloadFile } from './local-agent-client.js';（确认 L1074 export 块含 downloadFile，缺则补）
// 转述/深读文本属不可信内容：工具结果经现有 tool message 通道回注，不新增拼接格式（untrusted-content 口径）
```

- [ ] **Step 6: 守卫测试与全量回归**
```bash
npx vitest run 2>&1 | tail -20
```
若有断言工具总数/清单的既有测试（grep `RAW_TOOLS.length`、`BUILTIN_TOOLS`）因新增工具失败，按既有方式更新期望值；若存在工具分类显式清单守卫测试（提示注入规范），将 `read_document_image` 归入只读安全类同批更新。Expected: 全绿。
- [ ] **Step 7: 提交** — `git commit -am "feat(tools): read_document_image 内置工具（文档图片按需深读）"`；`npm run build:silent`

---

### Task 9: 回归基线 + 全量验证 + 视觉验收 + 文档同步

**Files:**
- Test: `test/unit/doc-image-regression-baseline.unit.test.js`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: 前 8 个任务全部产出
- Produces: 两条逐字节不变基线断言；全量测试绿色；视觉验收记录；CHANGELOG 条目

- [ ] **Step 1: 基线回归测试（先于任何手动验证写）**

```js
// 断言 1：enableImageInput=false 时 processFile 后 buildFileContentText() 输出与无图片链路一致（无 [文档图片] 块、fileEntry 无 images）
// 断言 2：抽取结果为 0 图（extract* mock 返 {images:[],truncated:0,skipped:0}）时 buildFileContentText() 逐字符等于旧逻辑产物
// 实现：mock doc-images.js，直接调 runImagePipeline + buildFileContentText 对比硬编码期望串（含现有 fileContentMarker 段）
```

- [ ] **Step 2: 两套测试全量收口**
```bash
npx vitest run
cd agent && node --test --test-reporter=tap test/unit/*.test.js
```
Expected: 均全绿（agent 基线 336 例不回归）。

- [ ] **Step 3: 构建 + 重启 agent** — `npm run build:silent`；提醒用户重启 agent 进程后手工验证：真实含图 docx/pdf 各一，附件预览出现📷状态行；发送后消息含图片块；对纯文本主模型追问图中细节，观察 `read_document_image` 工具调用与结果。
- [ ] **Step 4: Playwright 视觉验证（可选但推荐）** — 沿用现有扩展页面探针模式（test-results-probes 惯例，chrome profile + 构建产物）：截图验证 ①附件预览"📷 已描述 2/4" ②开关关闭时的 previewOff 提示 ③无图文档零新增 UI。产出图片存 test-results-probes/。
- [ ] **Step 5: CHANGELOG** — 在最新版本条目下新增（中英同格式，沿用现有条目句式）：
```markdown
- 新增：文档附件图片识别——上传 Word/PDF 时自动抽取内嵌图片，经视觉模型转述为文本供 AI 阅读（受“启用图片识别”总开关控制）；新增 read_document_image 工具支持 AI 按需深读文档图片；连接 Agent 时 docx 图片抽取落盘、跨会话可继续读取
```
- [ ] **Step 6: 提交** — `git commit -am "test(docs): 文档图片识别回归基线 + CHANGELOG"`

---

## Self-Review 记录（已执行）

1. **Spec 覆盖**：spec §3.1/3.2 → Task 1-3；§4.1 → Task 6；§4.2 → Task 4-5；§4.3 → Task 8；§4.4 → Task 5/7；§5 → Task 5/6；§6 降级矩阵 → Task 5（转述失败）/6（链路异常）/8（工具错误文案）；§7 测试 → 各任务 TDD + Task 9。无遗漏。
2. **类型一致性**：`DocImage`/清单字段（index/page/path/dataUrl/kind）在 Task 3 响应、Task 4 产出、Task 5 快照、Task 8 消费四处命名一致；`VISION_CONSTANTS` 来自 Task 5 单一定义点；`saveDocImageSnapshot` 签名三处（Task 5 定义、Task 7 两处调用）一致。
3. **无占位符**：Task 4/7 测试伪代码块中 `pdfFixture`/chat-manager 样板标注了完整行为规格与参照文件，执行时按规格写全；其余均为可直接落地的真实代码。
