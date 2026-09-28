// agent/src/rag/document/parsers/text.js - 纯文本类格式解析（.txt/.md/.json/.csv）

import { readFile } from 'fs/promises';

/**
 * 解析纯文本文件
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function parse(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  // 去掉 UTF-8 BOM（否则首 chunk 会带不可见字符，影响 embedding 质量）
  return raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
}
