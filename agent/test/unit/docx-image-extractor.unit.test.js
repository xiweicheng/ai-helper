// agent/test/unit/docx-image-extractor.unit.test.js - docx 图片抽取模块单测
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDocxImages } from '../../src/documents/image-extractor.js';
import { makeZip } from './docx-zip-reader.unit.test.js';

/** 构造 PNG 风格字节：签名 + IHDR（宽/高大端）+ body，供尺寸解析 */
export function pngLike(w, h) {
  const buf = Buffer.alloc(28);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12);
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  buf.write('body', 24);
  return buf;
}

/**
 * 构造最小 docx：document.xml（按序 blip）+ rels + word/media 条目
 * @param {Array<{rid: string, file: string, w: number, h: number, data?: Buffer}>} images
 */
export function docxZip(images) {
  const doc = '<w:document>' + images.map((i) => `<a:blip r:embed="${i.rid}"/>`).join('') + '</w:document>';
  const rels =
    '<Relationships>' +
    images.map((i) => `<Relationship Id="${i.rid}" Type="x/image" Target="media/${i.file}"/>`).join('') +
    '</Relationships>';
  return makeZip([
    { name: 'word/document.xml', data: Buffer.from(doc) },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(rels) },
    ...images.map((i) => ({ name: `word/media/${i.file}`, data: i.data || pngLike(i.w, i.h), deflate: true })),
  ]);
}

test('按 document.xml 引用顺序编号并解析 PNG 尺寸', () => {
  const zip = docxZip([
    { rid: 'rId2', file: 'image2.png', w: 800, h: 600 },
    { rid: 'rId3', file: 'image1.png', w: 100, h: 50 },
  ]);
  const { images, truncated } = extractDocxImages(zip);
  assert.equal(truncated, 0);
  assert.deepEqual(images.map((i) => i.index), [1, 2]);
  assert.deepEqual(images.map((i) => i.width), [800, 100]); // 跟随文档顺序，不是文件名顺序
  assert.equal(images[0].mimeType, 'image/png');
});

test('连续重复引用同一图片只计一次', () => {
  const one = { rid: 'rId2', file: 'image1.png', w: 10, h: 10 };
  const zip = docxZip([one, one]);
  assert.equal(extractDocxImages(zip).images.length, 1);
});

test('超出 maxImages 截断计数', () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ rid: `rId${i + 2}`, file: `image${i}.png`, w: 10, h: 10 }));
  const { images, truncated } = extractDocxImages(docxZip(many), { maxImages: 3 });
  assert.equal(images.length, 3);
  assert.equal(truncated, 2);
});

test('超过 maxImageBytes 的大图计入 skipped', () => {
  const { images, skipped } = extractDocxImages(docxZip([{ rid: 'rId2', file: 'a.png', w: 10, h: 10 }]), { maxImageBytes: 1 });
  assert.equal(images.length, 0);
  assert.equal(skipped, 1);
});

test('非白名单扩展名（wmf/emf）计入 skipped', () => {
  const zip = makeZip([
    { name: 'word/document.xml', data: Buffer.from('<w:document><a:blip r:embed="rId2"/></w:document>') },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from('<Relationships><Relationship Id="rId2" Type="x/image" Target="media/image1.wmf"/></Relationships>') },
    { name: 'word/media/image1.wmf', data: Buffer.from('WMF') },
  ]);
  const { images, skipped } = extractDocxImages(zip);
  assert.equal(images.length, 0);
  assert.equal(skipped, 1);
});

test('无图片 docx 返回空清单', () => {
  const zip = makeZip([{ name: 'word/document.xml', data: Buffer.from('<w:document/>') }]);
  assert.deepEqual(extractDocxImages(zip), { images: [], truncated: 0, skipped: 0 });
});
