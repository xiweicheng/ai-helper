// agent/test/unit/docx-extract-images-route.unit.test.js - extract-images 处理器单测
// checkPath 依赖 config.workdir，单测通过 checkPathOverride 注入"workdir 内放行"等价语义；server 接线不传该覆盖
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractImagesHandler } from '../../src/documents/routes.js';
import { docxZip } from './docx-image-extractor.unit.test.js';

const t = (k) => k;
// 等价于 checkPath 的"路径在工作区内"分支：绝对路径直接放行
const allowAll = async (p) => ({ allowed: true, resolved: p });

async function mkWs() { return await mkdtemp(join(tmpdir(), 'aha-extract-')); }
const call = (body, extra = {}) => extractImagesHandler(body, { t, checkPathOverride: allowAll, ...extra });

test('合法 docx：落盘 + manifest.json + 返回清单', async () => {
  const ws = await mkWs();
  const docPath = join(ws, '报告.docx');
  await writeFile(docPath, Buffer.from(docxZip([{ rid: 'rId2', file: 'image1.png', w: 800, h: 600 }])));
  const { status, payload } = await call({ path: docPath });
  assert.equal(status, 200);
  assert.equal(payload.images.length, 1);
  assert.equal(payload.images[0].width, 800);
  assert.equal(payload.images[0].kind, 'embedded');
  assert.ok(payload.images[0].path.endsWith(join('_attachments', '报告', 'img-1.png')));
  const saved = await readFile(payload.images[0].path);
  assert.ok(saved.length >= 8);
  const manifest = JSON.parse(await readFile(join(payload.dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.images[0].index, 1);
  assert.equal(manifest.source, docPath);
  await rm(ws, { recursive: true, force: true });
});

test('非 docx → 400 unsupportedFormat', async () => {
  const ws = await mkWs();
  const p = join(ws, 'a.pdf');
  await writeFile(p, 'x');
  const r = await call({ path: p });
  assert.equal(r.status, 400);
  assert.equal(r.payload.error, 'unsupportedFormat');
  await rm(ws, { recursive: true, force: true });
});

test('缺 path → 400 missingPath；文件不存在 → 404 notFound', async () => {
  const ws = await mkWs();
  const missing = await extractImagesHandler({}, { t, checkPathOverride: allowAll });
  assert.equal(missing.status, 400);
  assert.equal(missing.payload.error, 'missingPath');
  const nf = await call({ path: join(ws, 'nope.docx') });
  assert.equal(nf.status, 404);
  assert.equal(nf.payload.error, 'notFound');
  await rm(ws, { recursive: true, force: true });
});

test('路径检查拒绝 → 403', async () => {
  const ws = await mkWs();
  const deny = async () => ({ allowed: false, reason: 'notInAllowedDir' });
  const r = await extractImagesHandler({ path: join(ws, 'a.docx') }, { t, checkPathOverride: deny });
  assert.equal(r.status, 403);
  assert.equal(r.payload.error, 'notInAllowedDir');
  await rm(ws, { recursive: true, force: true });
});

test('非法 docx 字节 → 400 parseFailed', async () => {
  const ws = await mkWs();
  const p = join(ws, 'bad.docx');
  await writeFile(p, Buffer.from('not a zip at all'));
  const r = await call({ path: p });
  assert.equal(r.status, 400);
  assert.equal(r.payload.error, 'parseFailed');
  await rm(ws, { recursive: true, force: true });
});

test('幂等：重复调用覆盖旧产物目录', async () => {
  const ws = await mkWs();
  const docPath = join(ws, 'a.docx');
  await writeFile(docPath, Buffer.from(docxZip([{ rid: 'rId2', file: 'image1.png', w: 10, h: 10 }])));
  await call({ path: docPath });
  await writeFile(docPath, Buffer.from(docxZip([{ rid: 'rId2', file: 'a.png', w: 20, h: 20 }, { rid: 'rId3', file: 'b.png', w: 5, h: 5 }])));
  const r = await call({ path: docPath });
  assert.equal(r.payload.images.length, 2);
  const files = await readdir(r.payload.dir);
  assert.deepEqual(files.sort(), ['img-1.png', 'img-2.png', 'manifest.json']);
  await rm(ws, { recursive: true, force: true });
});
