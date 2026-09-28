// agent/src/rag/document/loader.js - 文档加载器：按扩展名路由到对应解析器
// 统一输出纯文本，再由 chunker 切分（见设计文档 5.6）

import { extname, basename } from 'path';
import { PARSER_ROUTES } from '../config.js';
import { RagError } from '../errors.js';

// 解析器按需加载（仅用到的格式才加载对应依赖）
const PARSERS = {
  text: () => import('./parsers/text.js'),
  html: () => import('./parsers/html.js'),
  pdf: () => import('./parsers/pdf.js'),
  office: () => import('./parsers/office.js'),
};

/**
 * 判断文件是否受支持（按扩展名）
 * @param {string} filePath
 * @returns {boolean}
 */
export function isSupportedFile(filePath) {
  return PARSER_ROUTES[extname(filePath).toLowerCase()] !== undefined;
}

/**
 * 列出支持的扩展名（供前端/错误提示展示）
 * @returns {string[]}
 */
export function supportedExtensions() {
  return Object.keys(PARSER_ROUTES);
}

/**
 * 加载并解析文档文件
 * @param {string} filePath - 文件绝对路径
 * @returns {Promise<{text: string, fileName: string}>}
 */
export async function loadDocument(filePath) {
  const ext = extname(filePath).toLowerCase();
  const parserName = PARSER_ROUTES[ext];
  if (!parserName) {
    throw new RagError('unsupportedFormat', { ext: ext || filePath });
  }

  const mod = await PARSERS[parserName]();
  const text = await mod.parse(filePath);
  return { text, fileName: basename(filePath) };
}
