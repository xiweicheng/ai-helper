// agent/src/documents/zip-reader.js - 最小 ZIP 读取器（stored/deflate，无外部依赖）
// 供 docx 内嵌图片抽取使用；仅读取中央目录，支持 stored(0) 与 deflate(8)
import zlib from 'node:zlib';

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** Uint8Array/Buffer 统一转为零拷贝 Buffer 视图 */
function asBuf(buf) {
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf.buffer, buf.byteOffset, buf.length);
}

/** 从尾部反向扫描 EOCD（注释区最大 65535 字节） */
function findEocd(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66536); i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

/** 遍历中央目录条目，回调 (name, headerPos) */
function eachCentralEntry(buf, cb) {
  const eocd = findEocd(buf);
  if (eocd < 0) return false;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) return false;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = Buffer.from(buf.subarray(p + 46, p + 46 + nameLen)).toString('utf8');
    cb({ name, method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return true;
}

/**
 * 列出全部条目名
 * @param {Uint8Array} buf
 * @returns {string[]}
 */
export function listEntryNames(input) {
  const buf = asBuf(input);
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('invalid zip: EOCD not found');
  const names = [];
  if (!eachCentralEntry(buf, (e) => names.push(e.name))) {
    throw new Error('invalid zip: central header');
  }
  return names;
}

/**
 * 读取条目原始字节；不存在或压缩方式不支持返回 null
 * @param {Uint8Array} buf
 * @param {string} name 条目路径（如 word/media/image1.png）
 * @returns {Uint8Array | null}
 */
export function readEntry(input, name) {
  const buf = asBuf(input);
  let found = null;
  eachCentralEntry(buf, (e) => {
    if (found || e.name !== name) return;
    // local header 的 name/extra 长度可能与 central 不同，需单独解析
    if (buf.readUInt32LE(e.localOffset) !== SIG_LOCAL) return;
    const lNameLen = buf.readUInt16LE(e.localOffset + 26);
    const lExtraLen = buf.readUInt16LE(e.localOffset + 28);
    const dataStart = e.localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + e.compSize);
    if (e.method === 0) found = new Uint8Array(raw);
    else if (e.method === 8) {
      try { found = new Uint8Array(zlib.inflateRawSync(raw)); } catch { found = null; }
    }
  });
  return found;
}
