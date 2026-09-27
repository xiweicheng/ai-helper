// agent/src/rag/document/parsers/office.js - Office 文档解析
// 路由策略（见设计文档 5.6）：
//   .docx          → mammoth（提取纯文本最快）
//   .xlsx/.xls     → xlsx（agent 核心依赖，零新增）：逐 sheet 转 CSV 文本
//   .pptx 及其他   → officeparser（覆盖 pptx/odt/odp/ods/rtf 等）

import { extname } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * 解析 docx（mammoth 提取纯文本）
 */
async function parseDocx(filePath) {
  const mammoth = require('mammoth');
  const { value } = await mammoth.extractRawText({ path: filePath });
  return value || '';
}

/**
 * 解析表格文件（xlsx/xls，逐 sheet 转 CSV；CSV 保留表格行列结构，对检索友好）
 */
async function parseSpreadsheet(filePath) {
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(filePath);
  const parts = [];
  for (const sheetName of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
    if (csv.trim()) parts.push(`# ${sheetName}\n${csv}`);
  }
  return parts.join('\n\n');
}

/**
 * 解析其他 Office 格式（pptx/odt/... 走 officeparser 通用解析）
 */
async function parseGeneric(filePath) {
  const { parseOffice } = await import('officeparser');
  const ast = await parseOffice(filePath);
  const out = await ast.to('text');
  return out?.value || '';
}

/**
 * 按扩展名路由解析 Office 文档
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function parse(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.docx') return parseDocx(filePath);
  if (ext === '.xlsx' || ext === '.xls') return parseSpreadsheet(filePath);
  return parseGeneric(filePath);
}
