// agent/src/rag/document/parsers/pdf.js - PDF 文本提取（pdf-parse）
// 注意：pdf-parse 为 CJS 包，且其入口在 `!module.parent` 时会进调试分支（读测试文件报错），
// 必须用 createRequire 加载，禁止直接 ESM import

import { createRequire } from 'module';
import { readFile } from 'fs/promises';

const require = createRequire(import.meta.url);

/**
 * 解析 PDF 文件
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function parse(filePath) {
  const pdfParse = require('pdf-parse');
  const buf = await readFile(filePath);
  const data = await pdfParse(buf);
  return data.text || '';
}
