// agent/src/rag/document/parsers/html.js - HTML 解析（cheerio 去标签提取正文）
// 目标：把网页/HTML 文件转成结构化的纯文本（保留段落/标题/列表边界），供分块与检索

import { readFile } from 'fs/promises';

// 块级元素：在其后插入换行，保留段落边界（否则 `</p><p>` 文本会连成一片）
const BLOCK_SELECTOR = 'p, div, section, article, header, footer, h1, h2, h3, h4, h5, h6, li, tr, blockquote, pre, br';

/**
 * 从 HTML 字符串提取正文文本
 * @param {string} html
 * @returns {Promise<string>}
 */
export async function htmlToText(html) {
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html || '');

  // 去除脚本/样式/头部等非正文内容
  $('script, style, noscript, head, iframe, svg, canvas, form').remove();

  // 块级元素后补换行（用 append 文本节点，避免 createElement 对 br 等空元素失效）
  $(BLOCK_SELECTOR).each((_, el) => {
    $(el).append('\n');
  });

  const text = ($('body').length ? $('body').text() : $.root().text()) || '';
  // 清理多余空白：行内多空格压缩、连续空行压缩为一个空行
  return text
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 解析 HTML 文件
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function parse(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  return htmlToText(raw);
}
