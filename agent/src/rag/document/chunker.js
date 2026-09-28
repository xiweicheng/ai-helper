// agent/src/rag/document/chunker.js - 分块策略：段落优先 + 字符窗口兜底 + 重叠
// 默认 400 字符 / 80 重叠，为中文保留安全边界：
//   bge-small-zh-v1.5 最大输入 512 token，中文约 1 字 ≈ 1 token，[CLS]/[SEP] 再占 2 token。
//   chunkSize=800 会被模型静默截断（内容丢失且无报错）
// 返回 chunks[]：{ text, startPos, endPos }（区间为原文偏移，为 BM25 混合检索预留）

import { CHUNK_SIZE_WARN_LIMIT } from '../config.js';

// 自然断点优先级（从后往前找最近的，切在断点之后）
const BREAK_SEQUENCES = ['\n\n', '\n', '。', '！', '？', '；', '. ', '! ', '? ', '; '];

/**
 * 在 [minPos, maxPos] 范围内从后往前寻找最近的断点位置（返回断点结束后的偏移）
 * 找不到时返回 -1
 */
function findBreakPoint(text, minPos, maxPos) {
  for (const seq of BREAK_SEQUENCES) {
    for (let i = maxPos - seq.length; i >= minPos; i--) {
      if (text.startsWith(seq, i)) return i + seq.length;
    }
  }
  return -1;
}

/**
 * 文本分块
 * @param {string} text - 原文
 * @param {{chunkSize?: number, overlap?: number}} [options]
 * @returns {Array<{text: string, startPos: number, endPos: number}>}
 */
export function chunkText(text, options = {}) {
  if (!text || typeof text !== 'string') return [];

  // 规范化换行（统一为 \n）
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const chunkSize = Math.max(50, Math.min(options.chunkSize || 400, 2000));
  const overlap = Math.max(0, Math.min(options.overlap ?? 80, Math.floor(chunkSize / 2)));

  if (chunkSize > CHUNK_SIZE_WARN_LIMIT) {
    console.warn(`[RAG] chunkSize=${chunkSize} 超过模型安全上限（${CHUNK_SIZE_WARN_LIMIT}），可能被静默截断`);
  }

  const n = normalized.length;
  const chunks = [];
  let pos = 0;

  while (pos < n) {
    // 跳过块间空白（段落间隙不进入 chunk）
    let start = pos;
    while (start < n && /\s/.test(normalized[start])) start++;
    if (start >= n) break;

    let end = Math.min(start + chunkSize, n);

    // 未到文末时优先在自然断点处收束（搜索区间：块后半段）
    if (end < n) {
      const breakAt = findBreakPoint(normalized, start + Math.floor(chunkSize * 0.5), end);
      if (breakAt > start) end = breakAt;
    }

    const chunkTextValue = normalized.slice(start, end).trim();
    if (chunkTextValue) {
      chunks.push({ text: chunkTextValue, startPos: start, endPos: end });
    }

    if (end >= n) break;

    // 重叠回退：下一块起点从本块结尾回退 overlap 字符（防止死循环）
    let next = end - overlap;
    if (next <= start) next = end;
    pos = next;
  }

  return chunks;
}
