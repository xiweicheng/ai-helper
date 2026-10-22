// agent/test/unit/docx-zip-reader.unit.test.js - 零依赖 ZIP 读取器单测
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { listEntryNames, readEntry } from '../../src/documents/zip-reader.js';

// —— zip fixture 构造器（无二进制依赖；Task 2/3 测试复用 makeZip） ——
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 构造最小合法 zip：[local header][data]... [central dir][EOCD]
 * @param {Array<{name: string, data: Buffer, deflate?: boolean}>} entries
 * @returns {Uint8Array}
 */
export function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data = e.deflate ? zlib.deflateRawSync(e.data) : e.data;
    const method = e.deflate ? 8 : 0;
    const crc = crc32(e.data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);

    offset += 30 + nameBuf.length + data.length;
  }
  const localBlob = Buffer.concat(locals);
  const centralBlob = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBlob.length, 12);
  eocd.writeUInt32LE(localBlob.length, 16);
  return new Uint8Array(Buffer.concat([localBlob, centralBlob, eocd]));
}

// —— 用例 ——
test('stored + deflate 条目均可读出，名字可枚举', () => {
  const zip = makeZip([
    { name: 'a.txt', data: Buffer.from('hello') },
    { name: 'word/media/image1.png', data: Buffer.from('PNGDATA'), deflate: true },
  ]);
  assert.deepEqual(listEntryNames(zip).sort(), ['a.txt', 'word/media/image1.png']);
  assert.equal(Buffer.from(readEntry(zip, 'a.txt')).toString(), 'hello');
  assert.equal(Buffer.from(readEntry(zip, 'word/media/image1.png')).toString(), 'PNGDATA');
});

test('不存在的条目返回 null', () => {
  const zip = makeZip([{ name: 'a.txt', data: Buffer.from('x') }]);
  assert.equal(readEntry(zip, 'nope.txt'), null);
});

test('非法 zip 字节：listEntryNames 抛错，readEntry 返回 null', () => {
  const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.throws(() => listEntryNames(junk), /EOCD/);
  assert.equal(readEntry(junk, 'a.txt'), null);
});
