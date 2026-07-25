/**
 * XLSX 解析 Worker — 在后台线程执行 XLSX.read()，
 * 避免同步阻塞主线程导致 UI 卡死。
 *
 * 协议：
 *   main → worker: { type: 'parse', arrayBuffer }
 *   worker → main: { type: 'meta', sheetNames, sheetMetas[] }
 *   main → worker: { type: 'getSheet', sheetIndex }
 *   worker → main: { type: 'sheetData', sheetIndex, colCount, rows, totalRows }
 */
import * as XLSX from 'xlsx';

let workbook = null;
const MAX_ROWS = 500;

self.onmessage = (e) => {
  const { type, arrayBuffer, sheetIndex } = e.data;

  if (type === 'parse') {
    try {
      workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      const sheetNames = workbook.SheetNames;
      const sheetMetas = sheetNames.map((name, idx) => {
        const sheet = workbook.Sheets[name];
        const ref = sheet['!ref'] || 'A1';
        const range = XLSX.utils.decode_range(ref);
        return {
          name,
          index: idx,
          totalRows: range.e.r - range.s.r + 1,
          colCount: range.e.c - range.s.c + 1
        };
      });
      self.postMessage({ type: 'meta', sheetNames, sheetMetas });
    } catch (err) {
      self.postMessage({ type: 'meta', error: err.message || '解析失败' });
    }
  }

  if (type === 'getSheet' && workbook) {
    try {
      const name = workbook.SheetNames[sheetIndex];
      const sheet = workbook.Sheets[name];
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      const colCount = range.e.c - range.s.c + 1;
      const maxRow = Math.min(range.e.r - range.s.r, MAX_ROWS - 1);
      const totalRows = range.e.r - range.s.r + 1;

      const rows = [];
      for (let r = range.s.r; r <= range.s.r + maxRow && r <= range.e.r; r++) {
        const row = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[addr];
          row.push(cell ? String(cell.w ?? cell.v ?? '') : '');
        }
        rows.push(row);
      }
      self.postMessage({ type: 'sheetData', sheetIndex, colCount, rows, totalRows });
    } catch (err) {
      self.postMessage({ type: 'sheetData', error: err.message || '提取失败' });
    }
  }
};

