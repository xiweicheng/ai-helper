// chat-export.js - 聊天消息导出功能（Word/PDF/Markdown/图片）
// 从 chat-manager.js 拆分，负责将助手消息导出为多种格式

import { showToast } from './utils.js';
import { formatMarkdown } from './markdown-render.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  chatExport: {
    exportFailed: '导出失败：{message}',
    pdfLibNotLoaded: 'PDF 库未加载，无法导出',
    noContent: '没有可导出的内容',
    imageLibNotLoaded: '图片库未加载，无法导出为图片',
    imagePlaceholder: '[图片: {name}]',
    canvasFailed: 'Canvas 转 DataURL 失败：{message}',
    svgLoadFailed: 'SVG 图片加载失败',
  },
});
registerTranslations('en', {
  chatExport: {
    exportFailed: 'Export failed: {message}',
    pdfLibNotLoaded: 'PDF library not loaded, cannot export',
    noContent: 'No content to export',
    imageLibNotLoaded: 'Image library not loaded, cannot export as image',
    imagePlaceholder: '[Image: {name}]',
    canvasFailed: 'Canvas to DataURL failed: {message}',
    svgLoadFailed: 'SVG image loading failed',
  },
});
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, AlignmentType, WidthType,
  BorderStyle, ImageRun, ExternalHyperlink, convertInchesToTwip
} from 'docx';

// 同一按钮的导出任务进行中时阻止重复触发
let exportInProgressMap = new Map();

// ====== Markdown → DOCX 解析器 ======

/**
 * 解析行内 Markdown 格式为 TextRun 数组
 * 支持 **bold**, *italic*, `code`, [link](url), ![image](url)
 * @param {string} text - 行内文本（不含块级元素）
 * @returns {Array<TextRun|ExternalHyperlink|ImageRun>}
 */
function parseInlineMarkdown(text) {
  if (!text) return [];

  // 正则匹配所有行内格式：粗体、斜体、行内代码、链接、图片
  const tokenRegex = /(\*\*(.+?)\*\*|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|__(.+?)__|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|!\[([^\]]*)\]\(([^)]+)\))/;
  const result = [];

  let remaining = text;
  while (remaining.length > 0) {
    const match = remaining.match(tokenRegex);
    if (!match) {
      // 剩余全是纯文本
      result.push(new TextRun({ text: remaining }));
      break;
    }

    const idx = match.index;
    // 匹配前的纯文本
    if (idx > 0) {
      result.push(new TextRun({ text: remaining.slice(0, idx) }));
    }

    const fullMatch = match[1];
    if (match[2] !== undefined) {
      // **bold**
      result.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[3] !== undefined) {
      // *italic*
      result.push(new TextRun({ text: match[3], italics: true }));
    } else if (match[4] !== undefined) {
      // __bold__
      result.push(new TextRun({ text: match[4], bold: true }));
    } else if (match[5] !== undefined) {
      // _italic_
      result.push(new TextRun({ text: match[5], italics: true }));
    } else if (match[6] !== undefined) {
      // `code`
      result.push(new TextRun({ text: match[6], font: 'Consolas', size: 20 }));
    } else if (match[7] !== undefined) {
      // [text](url)
      result.push(new ExternalHyperlink({
        children: [new TextRun({ text: match[7], style: 'Hyperlink' })],
        link: match[8]
      }));
    } else if (match[9] !== undefined) {
      // ![alt](url) - 图片
      const imgUrl = match[10];
      if (imgUrl.startsWith('data:')) {
        // data URL 图片可以嵌入
        try {
          const [header, base64] = imgUrl.split(',');
          const mimeMatch = header.match(/data:(image\/(\w+))/);
          if (mimeMatch && base64) {
            // 解码 base64
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }

            // 从原始字节解析图片尺寸，按像素计算 width/height
            // 注意：docx v9 的 transformation 接受像素值，库内部自动 *9525 转 EMU
            const imgType = mimeMatch[2]; // 'png', 'jpeg', etc.
            const dims = getImagePxDimensions(bytes, imgType);
            const maxWidthPx = 567; // ~5.9 inches at 96 DPI，适配 A4 页面

            let wPx = dims.width;
            let hPx = dims.height;
            if (wPx > maxWidthPx) {
              const ratio = maxWidthPx / wPx;
              wPx = Math.round(wPx * ratio);
              hPx = Math.round(hPx * ratio);
            }

            result.push(new ImageRun({
              data: bytes,
              transformation: { width: wPx, height: hPx },
              type: imgType
            }));
          }
        } catch (e) {
          logger.warn('[ChatExport] ImageRun create failed:', e.message);
          result.push(new TextRun({ text: t('chatExport.imagePlaceholder', { name: match[9] || 'image' }), italics: true, color: '999999' }));
        }
      } else {
        // 外部 URL 图片，用文字替代
        result.push(new TextRun({ text: t('chatExport.imagePlaceholder', { name: match[9] || imgUrl }), italics: true, color: '999999' }));
      }
    }

    remaining = remaining.slice(idx + fullMatch.length);
  }

  return result;
}

/**
 * 从图片字节数据解析像素尺寸（支持 PNG、JPEG）
 * @param {Uint8Array} bytes
 * @param {string} type - 'png' | 'jpeg' | 'jpg'
 * @returns {{ width: number, height: number }}
 */
function getImagePxDimensions(bytes, type) {
  if (type === 'png' && bytes.length > 24) {
    // PNG: bytes 16-19 = width, 20-23 = height (big-endian)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint32(16),
      height: view.getUint32(20)
    };
  }

  if ((type === 'jpeg' || type === 'jpg') && bytes.length > 100) {
    // JPEG: 扫描 SOF marker (0xFF 0xC0 ~ 0xFF 0xC3)
    let i = 2; // 跳过 SOI marker (0xFF 0xD8)
    while (i < bytes.length - 9) {
      if (bytes[i] === 0xFF) {
        const marker = bytes[i + 1];
        if (marker >= 0xC0 && marker <= 0xC3) {
          // SOF marker 找到：height 在 i+5 (2 bytes), width 在 i+7 (2 bytes)
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          return {
            height: view.getUint16(i + 5),
            width: view.getUint16(i + 7)
          };
        }
        // 跳过此段：长度字段在 i+2 (2 bytes, big-endian)
        i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
      } else {
        i++;
      }
    }
  }

  // 回退：默认 600x400 像素
  return { width: 600, height: 400 };
}

/**
 * 解析 Markdown 为 DOCX 元素数组
 * @param {string} markdown - 原始 Markdown 内容
 * @returns {Promise<Array>} DOCX children 数组
 */
async function parseMarkdownToDocxChildren(markdown) {
  if (!markdown || !markdown.trim()) {
    return [new Paragraph({ children: [new TextRun({ text: '' })] })];
  }

  const children = [];
  let content = markdown;

  // Step 1: 提取所有代码块，用占位符替换
  const codeBlocks = [];
  content = content.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang || '', code: code.trimEnd() });
    return `\n\n%%CODEBLOCK_${idx}%%\n\n`;
  });

  // Step 2: 提取所有 HTML 表格，用占位符替换
  const htmlTables = [];
  content = content.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
    const idx = htmlTables.length;
    htmlTables.push(match);
    return `\n\n%%HTMLTABLE_${idx}%%\n\n`;
  });

  // Step 3: 提取 Markdown 表格
  const mdTables = [];
  content = content.replace(/(?:^\|.+\|\s*$\n)+^\|[\s\-:|]+\|\s*$\n(?:^\|.+\|\s*$\n?)+/gm, (match) => {
    const idx = mdTables.length;
    mdTables.push(match);
    return `\n\n%%MDTABLE_${idx}%%\n\n`;
  });

  // Step 4: 按双换行分割为块
  const blocks = content.split(/\n{2,}/).filter(b => b.trim());

  for (const block of blocks) {
    const trimmed = block.trim();

    // 代码块占位符
    const cbMatch = trimmed.match(/^%%CODEBLOCK_(\d+)%%$/);
    if (cbMatch) {
      const { lang, code } = codeBlocks[parseInt(cbMatch[1])];
      const title = lang ? `${lang} code` : 'code';
      children.push(new Paragraph({
        children: [new TextRun({ text: title, bold: true, font: 'Consolas', size: 18 })]
      }));
      // 代码块每一行作为一个段落（保持格式）
      const codeLines = code.split('\n');
      for (const line of codeLines) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 18 })],
          spacing: { before: 0, after: 0, line: 240 },
          shading: { fill: 'F5F5F5' }
        }));
      }
      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      continue;
    }

    // HTML 表格占位符
    const htMatch = trimmed.match(/^%%HTMLTABLE_(\d+)%%$/);
    if (htMatch) {
      const htmlTable = htmlTables[parseInt(htMatch[1])];
      const rows = parseHtmlTable(htmlTable);
      if (rows.length > 0) {
        children.push(createDocxTable(rows));
        children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      }
      continue;
    }

    // Markdown 表格占位符
    const mtMatch = trimmed.match(/^%%MDTABLE_(\d+)%%$/);
    if (mtMatch) {
      const mdTable = mdTables[parseInt(mtMatch[1])];
      const rows = parseMdTable(mdTable);
      children.push(createDocxTable(rows));
      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      continue;
    }

    // 标题
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const headingLevelMap = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6
      };
      children.push(new Paragraph({
        children: parseInlineMarkdown(headingText),
        heading: headingLevelMap[level] || HeadingLevel.HEADING_1
      }));
      continue;
    }

    // 水平分割线
    if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
      children.push(new Paragraph({
        children: [],
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
        spacing: { before: 200, after: 200 }
      }));
      continue;
    }

    // 无序列表（连续的行）
    if (/^[\-\*\+]\s+/.test(trimmed)) {
      const listItems = block.split(/\n(?=[\-\*\+]\s+)/);
      for (const item of listItems) {
        const itemText = item.replace(/^[\-\*\+]\s+/, '');
        children.push(new Paragraph({
          children: parseInlineMarkdown(itemText),
          bullet: { level: 0 },
          spacing: { before: 40, after: 40 }
        }));
      }
      continue;
    }

    // 有序列表（连续的行）
    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems = block.split(/\n(?=\d+\.\s+)/);
      for (const item of listItems) {
        const itemText = item.replace(/^\d+\.\s+/, '');
        children.push(new Paragraph({
          children: parseInlineMarkdown(itemText),
          numbering: { reference: 'default', level: 0 },
          spacing: { before: 40, after: 40 }
        }));
      }
      continue;
    }

    // 引用块
    if (trimmed.startsWith('>')) {
      const quoteLines = block.split('\n').map(line => line.replace(/^>\s?/, '')).join('\n');
      children.push(new Paragraph({
        children: parseInlineMarkdown(quoteLines),
        indent: { left: convertInchesToTwip(0.5) },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC' } },
        spacing: { before: 60, after: 60 }
      }));
      continue;
    }

    // 普通段落
    const inlineChildren = parseInlineMarkdown(trimmed);
    if (children.length > 0) {
      const lastChild = children[children.length - 1];
      if (lastChild instanceof Paragraph && !lastChild.heading && !lastChild.bullet) {
        // 与前一段落合并（连续文本段）
        lastChild.root.push(...(inlineChildren.length > 0 ? inlineChildren : [new TextRun({ text: trimmed })]));
        continue;
      }
    }
    children.push(new Paragraph({
      children: inlineChildren.length > 0 ? inlineChildren : [new TextRun({ text: trimmed })],
      spacing: { before: 60, after: 60 }
    }));
  }

  return children;
}

/**
 * 解析 HTML 表格为二维数组
 */
function parseHtmlTable(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rows = [];
  const trs = doc.querySelectorAll('tr');
  trs.forEach(tr => {
    const row = [];
    tr.querySelectorAll('th, td').forEach(cell => {
      row.push(cell.textContent.trim());
    });
    if (row.length > 0) rows.push(row);
  });
  return rows;
}

/**
 * 解析 Markdown 表格为二维数组
 */
function parseMdTable(md) {
  const lines = md.trim().split('\n');
  const rows = [];
  for (const line of lines) {
    // 跳过分隔行 (|---|---|)
    if (/^[\s\|:\-]+$/.test(line.replace(/\|/g, ''))) continue;
    const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

/**
 * 根据二维数组创建 DOCX 表格
 */
function createDocxTable(rows) {
  if (rows.length === 0) return new Paragraph({ children: [] });

  const colCount = Math.max(...rows.map(r => r.length));
  const tableRows = rows.map((row, rowIdx) => {
    const cells = [];
    for (let i = 0; i < colCount; i++) {
      const cellText = row[i] || '';
      cells.push(new TableCell({
        children: [new Paragraph({
          children: parseInlineMarkdown(cellText),
          spacing: { before: 40, after: 40 }
        })],
        shading: rowIdx === 0 ? { fill: 'F2F2F2' } : undefined,
        width: { size: 100 / colCount, type: WidthType.PERCENTAGE }
      }));
    }
    return new TableRow({ children: cells });
  });

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' }
    }
  });
}

/**
 * 安全地将 canvas 转为 data URL（PNG 对大画布可能失败，自动降级为 JPEG）
 * @param {HTMLCanvasElement} canvas
 * @returns {{ dataUrl: string, format: string }} format 为 'PNG' 或 'JPEG'
 */
function safeCanvasToDataUrl(canvas) {
  // 优先使用 JPEG（体积更小），失败时降级为 PNG
  try {
    const jpgData = canvas.toDataURL('image/jpeg', 0.85);
    if (jpgData && jpgData.length > 100) {
      return { dataUrl: jpgData, format: 'JPEG' };
    }
  } catch (e) {
    logger.debug('[ChatExport] JPEG toDataURL failed, downgrade to PNG:', e.message);
  }

  // JPEG 失败 或数据异常小，降级为 PNG
  try {
    const pngData = canvas.toDataURL('image/png');
    return { dataUrl: pngData, format: 'PNG' };
  } catch (e) {
    // 最后尝试低质量 JPEG
    try {
      const jpgLowData = canvas.toDataURL('image/jpeg', 0.5);
      return { dataUrl: jpgLowData, format: 'JPEG' };
    } catch (e2) {
      throw new Error(t('chatExport.canvasFailed', { message: e2.message }));
    }
  }
}

/**
 * 在容器中渲染所有 mermaid 图表（异步）
 * @param {HTMLElement} container - 包含 .mermaid 元素的容器
 */
export async function renderMermaidInContainer(container) {
  if (typeof mermaid === 'undefined') return;

  const mermaidElements = container.querySelectorAll('.mermaid');
  if (mermaidElements.length === 0) return;

  for (const el of mermaidElements) {
    // 跳过已渲染的（已有 SVG 子元素）
    if (el.querySelector('svg')) continue;
    try {
      await mermaid.run({ nodes: [el] });
    } catch (e) {
      logger.warn('[SidePanel] exporthour mermaid render failed:', e);
    }
  }
}

/**
 * 检测 SVG 是否来自 Mermaid 类图（classDiagram）
 * 类图的 foreignObject 含多行文本，需特殊处理避免文字重叠
 */
function isClassDiagramSvg(svg) {
  const mermaidContainer = svg.closest('.mermaid');
  if (!mermaidContainer) return false;
  const rawCode = mermaidContainer.getAttribute('data-raw-code');
  if (!rawCode) return false;
  try {
    const decoded = decodeURIComponent(rawCode);
    return /^\s*classDiagram/im.test(decoded);
  } catch (e) {
    return false;
  }
}

/**
 * 将类图 SVG 中的 foreignObject 转换为 <text> 元素
 *
 * Mermaid 类图的 foreignObject 通过 transform 属性定位（非 x/y），
 * 且每个标签是独立的 foreignObject（非多行合并）。
 * 转换时必须复制 transform 属性，否则所有文字堆叠在原点。
 */
function convertClassDiagramForeignObjects(svgClone) {
  const foreignObjects = svgClone.querySelectorAll('foreignObject');
  foreignObjects.forEach(fo => {
    const div = fo.querySelector('div');
    if (!div) {
      fo.remove();
      return;
    }
    const span = div.querySelector('span');
    const targetEl = span || div;
    const textContent = targetEl.textContent.trim();
    if (!textContent) {
      fo.remove();
      return;
    }

    const foW = parseFloat(fo.getAttribute('width')) || 100;
    const foH = parseFloat(fo.getAttribute('height')) || 30;
    const transform = fo.getAttribute('transform');

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    // foreignObject 无 x/y 属性，文字居中于其自身宽高内
    text.setAttribute('x', String(foW / 2));
    text.setAttribute('y', String(foH / 2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    // 复制 transform 属性（类图标签通过 transform 定位，非 x/y）
    if (transform) {
      text.setAttribute('transform', transform);
    }
    // 复制 span 的 class 属性，保留 CSS 样式（nodeLabel、classTitle 等）
    const spanClass = span ? span.getAttribute('class') : '';
    if (spanClass) {
      text.setAttribute('class', spanClass);
    }
    text.textContent = textContent;

    fo.parentNode.replaceChild(text, fo);
  });
}

/**
 * 将容器中的 SVG 元素转换为 base64 图片（Word 不支持 SVG，html2canvas 也无法正确处理 SVG）
 * @param {HTMLElement} container
 */
export async function convertSvgsToImages(container) {
  const svgElements = container.querySelectorAll('svg');
  if (svgElements.length === 0) return;

  for (const svg of svgElements) {
    try {
      const svgClone = svg.cloneNode(true);

      // 类图（classDiagram）的 foreignObject 含多行文本，转单个 text 会重叠
      // 仅对类图展开 <switch> 让 mermaid 的 <text> 降级元素生效，其他图保持原有转换
      if (isClassDiagramSvg(svg)) {
        convertClassDiagramForeignObjects(svgClone);
      } else {
        // 将 foreignObject 转为 text 元素，避免 canvas 污染导致 toDataURL 失败
        // 同时保留文字内容，确保图表标签不丢失
        const foreignObjects = svgClone.querySelectorAll('foreignObject');
        foreignObjects.forEach(fo => {
          const div = fo.querySelector('div');
          if (!div) return;

          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          const foX = parseFloat(fo.getAttribute('x')) || 0;
          const foY = parseFloat(fo.getAttribute('y')) || 0;
          const foW = parseFloat(fo.getAttribute('width')) || 100;
          const foH = parseFloat(fo.getAttribute('height')) || 30;

          // 获取 div 的样式
          const divStyle = window.getComputedStyle(div);
          const span = div.querySelector('span');
          const targetEl = span || div;
          const elStyle = window.getComputedStyle(targetEl);

          text.textContent = targetEl.textContent.trim();
          text.setAttribute('x', String(foX + foW / 2));
          text.setAttribute('y', String(foY + foH / 2));
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'central');
          text.setAttribute('fill', elStyle.color || '#333');
          text.setAttribute('font-family', elStyle.fontFamily || 'sans-serif');
          text.setAttribute('font-size', elStyle.fontSize || '14px');
          if (elStyle.fontWeight === 'bold' || parseInt(elStyle.fontWeight) >= 600) {
            text.setAttribute('font-weight', 'bold');
          }

          fo.parentNode.replaceChild(text, fo);
        });
      }

      // 优先从 viewBox 获取尺寸（mermaid SVG 必有 viewBox）
      const viewBox = svg.getAttribute('viewBox');
      let width, height;
      if (viewBox) {
        const parts = viewBox.split(/\s+/);
        width = Math.ceil(parseFloat(parts[2]));
        height = Math.ceil(parseFloat(parts[3]));
      } else {
        const box = svg.getBoundingClientRect();
        width = Math.ceil(box.width || svg.getAttribute('width') || 300);
        height = Math.ceil(box.height || svg.getAttribute('height') || 200);
      }

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgClone);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(t('chatExport.svgLoadFailed')));
        image.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.scale(2, 2);
      // 填充白色背景，避免 JPEG 导出时透明区域变黑
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, width, height);

      const { dataUrl, format } = safeCanvasToDataUrl(canvas);
      URL.revokeObjectURL(url);

      const imgTag = document.createElement('img');
      imgTag.src = dataUrl;
      imgTag.style.cssText = `max-width:100%;width:${width}px;height:auto;`;
      svg.parentNode.replaceChild(imgTag, svg);
    } catch (e) {
      logger.warn('[SidePanel] SVG rotationimage failed:', e.name, e.message);
    }
  }
}

export function setExportButtonLoading(exportBtn, type, exportDropdown) {
  if (!exportBtn) return;

  const btnKey = exportBtn.dataset.exportBtnKey || Date.now().toString();
  exportBtn.dataset.exportBtnKey = btnKey;

  // 保存原始 SVG 图标
  const originalSvg = exportBtn.querySelector('svg');
  const originalSvgHTML = originalSvg ? originalSvg.outerHTML : '';

  exportInProgressMap.set(btnKey, {
    originalSvgHTML: originalSvgHTML,
    timer: null,
    dropdown: exportDropdown || null
  });

  // 替换图标为 loading spinner
  if (originalSvg) {
    originalSvg.outerHTML = `
      <svg viewBox="0 0 24 24" fill="none" style="animation: spin 0.8s linear infinite; width: 18px; height: 18px; flex-shrink: 0;">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="31.4" stroke-dashoffset="10" opacity="0.25"/>
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="31.4" stroke-dashoffset="10"/>
      </svg>
    `;
  }

  exportBtn.disabled = true;
  exportBtn.style.opacity = '0.6';
  exportBtn.style.transition = 'all 0.3s ease';
}

export function setExportButtonSuccess(exportBtn, type) {
  if (!exportBtn) return;

  const btnKey = exportBtn.dataset.exportBtnKey;
  const state = btnKey ? exportInProgressMap.get(btnKey) : null;

  // 关闭下拉菜单
  const dropdown = state && state.dropdown;
  if (dropdown) {
    dropdown.classList.remove('show');
  }

  if (state && state.timer) clearTimeout(state.timer);

  // 恢复原始图标并启用按钮
  const currentSvg = exportBtn.querySelector('svg');
  if (currentSvg && state && state.originalSvgHTML) {
    currentSvg.outerHTML = state.originalSvgHTML;
  }
  exportBtn.disabled = false;
  exportBtn.style.opacity = '1';
  exportBtn.style.transition = 'all 0.3s ease';

  if (btnKey) {
    exportInProgressMap.delete(btnKey);
  }
}

export function resetExportButton(exportBtn) {
  if (!exportBtn) return;

  const btnKey = exportBtn.dataset.exportBtnKey;
  const state = btnKey ? exportInProgressMap.get(btnKey) : null;

  // 关闭下拉菜单
  const dropdown = state && state.dropdown;
  if (dropdown) {
    dropdown.classList.remove('show');
  }

  if (state && state.timer) clearTimeout(state.timer);

  // 恢复原始图标并启用按钮
  const currentSvg = exportBtn.querySelector('svg');
  if (currentSvg && state && state.originalSvgHTML) {
    currentSvg.outerHTML = state.originalSvgHTML;
  }
  exportBtn.disabled = false;
  exportBtn.style.opacity = '1';
  exportBtn.style.transition = 'all 0.3s ease';

  if (btnKey) {
    exportInProgressMap.delete(btnKey);
  }
}

/**
 * 将 Markdown 中的 Mermaid 图表代码块预渲染为 data URL 图片
 * 返回替换后的 Markdown（mermaid 块变为 ![mermaid](data:image/png;base64,...)）
 * @param {string} markdownContent
 * @returns {Promise<string>}
 */
async function renderMermaidBlocksToImages(markdownContent) {
  if (typeof mermaid === 'undefined') return markdownContent;

  // 先检查是否包含 mermaid 代码块（与 formatMarkdown 使用相同的匹配逻辑）
  if (!/```mermaid/i.test(markdownContent)) return markdownContent;

  try {
    // 渲染全部 Markdown 为 HTML（让 formatMarkdown 处理 mermaid 块生成 .mermaid 容器）
    const htmlContent = formatMarkdown(markdownContent);

    const tempContainer = document.createElement('div');
    tempContainer.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    tempContainer.innerHTML = htmlContent;
    document.body.appendChild(tempContainer);

    // 渲染 mermaid SVG 并转为 img
    await renderMermaidInContainer(tempContainer);
    await convertSvgsToImages(tempContainer);

    // 收集所有 mermaid 容器生成的 img 的 data URL（按 DOM 顺序）
    const mermaidContainers = tempContainer.querySelectorAll('.mermaid');
    const imgDataUrls = [];

    for (const container of mermaidContainers) {
      const img = container.querySelector('img');
      if (img && img.src && img.src.startsWith('data:')) {
        imgDataUrls.push(img.src);
      } else {
        imgDataUrls.push(null); // 渲染失败
      }
    }

    document.body.removeChild(tempContainer);

    if (imgDataUrls.length === 0) return markdownContent;

    // 用提取到的 data URL 替换 Markdown 中的 mermaid 代码块
    let idx = 0;
    const result = markdownContent.replace(/```\s*mermaid\s*[\r\n]+([\s\S]*?)```/gi, (match) => {
      const dataUrl = imgDataUrls[idx];
      idx++;
      if (dataUrl) {
        return `![mermaid](${dataUrl})`;
      }
      // 渲染失败则保留原代码块
      return match;
    });

    return result;
  } catch (e) {
    logger.warn('[ChatExport] Mermaid pre-render failed,will keep ascodeblock:', e.message);
    return markdownContent;
  }
}

export async function exportAssistantMessageToDocx(messageDiv, exportBtn, exportDropdown) {
  const btnKey = exportBtn.dataset.exportBtnKey;
  if (btnKey && exportInProgressMap.has(btnKey)) return;

  setExportButtonLoading(exportBtn, 'docx', exportDropdown);

  // 让浏览器先渲染 loading 状态
  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
  try {
    let markdownContent = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';

    if (!markdownContent) {
      const markdownBody = messageDiv.querySelector('.markdown-body');
      if (markdownBody) {
        markdownContent = markdownBody.innerText;
      } else {
        markdownContent = messageDiv.innerText;
      }
    }

    // 预渲染 Mermaid 图表为图片，替换 Markdown 中的 mermaid 代码块
    markdownContent = await renderMermaidBlocksToImages(markdownContent);

    // 解析 Markdown 为 DOCX 元素
    const children = await parseMarkdownToDocxChildren(markdownContent);

    // 创建 DOCX 文档
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: 'Calibri',
              size: 22 // 11pt = 22 half-points
            }
          },
          heading1: {
            run: { size: 36, bold: true },
            paragraph: { spacing: { before: 320, after: 160 } }
          },
          heading2: {
            run: { size: 30, bold: true },
            paragraph: { spacing: { before: 280, after: 120 } }
          },
          heading3: {
            run: { size: 26, bold: true },
            paragraph: { spacing: { before: 240, after: 100 } }
          }
        }
      },
      sections: [{
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1)
            }
          }
        },
        children
      }]
    });

    // 打包为 Blob（真正的 .docx OOXML 格式）
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().getTime();
    link.download = `word-${timestamp}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportButtonSuccess(exportBtn, 'docx');
    logger.debug('[SidePanel] Word (docx) document export successful');
  } catch (error) {
    logger.error('[SidePanel] export Word failed:', error);
    showToast(t('chatExport.exportFailed', { message: error.message }), 'error');
    resetExportButton(exportBtn);
  }
  });
  });
}

export function exportAssistantMessageToPdf(messageDiv, exportBtn, exportDropdown) {
  const btnKey = exportBtn.dataset.exportBtnKey;
  if (btnKey && exportInProgressMap.has(btnKey)) return;

  setExportButtonLoading(exportBtn, 'pdf', exportDropdown);

  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
  try {
    const jsPDF = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
    const html2canvasFunc = window.html2canvas || null;

    if (!jsPDF || !html2canvasFunc) {
      showToast(t('chatExport.pdfLibNotLoaded'), 'error');
      resetExportButton(exportBtn);
      return;
    }

    let markdownContent = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';

    if (!markdownContent) {
      const markdownBody = messageDiv.querySelector('.markdown-body');
      if (markdownBody) {
        markdownContent = markdownBody.innerText;
      } else {
        markdownContent = messageDiv.innerText;
      }
    }

    const timestamp = new Date().getTime();
    const fileName = `pdf-${timestamp}.pdf`;

    const PDF_WIDTH = 595;
    const PDF_HEIGHT = 842;
    const PADDING = 40;
    const CONTENT_WIDTH = PDF_WIDTH - PADDING * 2;

    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      left: -9999px;
      top: -9999px;
      width: ${CONTENT_WIDTH}px;
      padding: ${PADDING}px;
      background: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #333;
      box-sizing: border-box;
    `;

    const content = document.createElement('div');
    content.className = 'markdown-body';
    content.innerHTML = formatMarkdown(markdownContent);
    container.appendChild(content);

    document.body.appendChild(container);

    await renderMermaidInContainer(container);
    await convertSvgsToImages(container);

    const containerHeight = container.scrollHeight;
    const pageContentHeight = PDF_HEIGHT - PADDING * 2;
    const totalPages = Math.ceil(containerHeight / pageContentHeight);

    html2canvasFunc(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      willReadFrequently: true
    }).then(canvas => {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [PDF_WIDTH, PDF_HEIGHT],
        compress: true
      });

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const scaleRatio = canvasHeight / containerHeight;
      const pageCanvasHeight = pageContentHeight * scaleRatio;

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        const startY = page * pageCanvasHeight;
        const endY = Math.min(startY + pageCanvasHeight, canvasHeight);
        const pageHeight = endY - startY;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasWidth;
        tempCanvas.height = pageHeight;
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        // 填充白色背景，避免 JPEG 透明区域变黑
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(canvas, 0, startY, canvasWidth, pageHeight, 0, 0, canvasWidth, pageHeight);

        const { dataUrl: tempImgData, format: tempFormat } = safeCanvasToDataUrl(tempCanvas);
        
        const imgHeight = pageHeight / scaleRatio;
        pdf.addImage(tempImgData, tempFormat, 0, 0, PDF_WIDTH, imgHeight, undefined, 'FAST');
      }

      pdf.save(fileName);

      setExportButtonSuccess(exportBtn, 'pdf');

      document.body.removeChild(container);
      logger.debug('[SidePanel] PDF export successful:', fileName);
    }).catch(error => {
      logger.error('[SidePanel] PDF export failed:', error);
      showToast(t('chatExport.exportFailed', { message: error.message }), 'error');
      document.body.removeChild(container);
      resetExportButton(exportBtn);
    });
  } catch (error) {
    logger.error('[SidePanel] export PDF failed:', error);
    showToast(t('chatExport.exportFailed', { message: error.message }), 'error');
    resetExportButton(exportBtn);
  }
  });
  });
}

export function exportAssistantMessageToMarkdown(messageDiv, exportBtn, exportDropdown) {
  const btnKey = exportBtn.dataset.exportBtnKey;
  if (btnKey && exportInProgressMap.has(btnKey)) return;

  setExportButtonLoading(exportBtn, 'md', exportDropdown);

  // 让浏览器先渲染 loading 状态
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
  try {
    let markdownContent = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';

    if (!markdownContent) {
      const contentEl = messageDiv.querySelector('.assistant-message-content, .message-content');
      if (contentEl) {
        markdownContent = contentEl.innerText || contentEl.textContent || '';
      }
    }

    if (!markdownContent.trim()) {
      showToast(t('chatExport.noContent'), 'error');
      resetExportButton(exportBtn);
      return;
    }

    markdownContent = markdownContent.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

    const timestamp = new Date().getTime();
    const fileName = `md-${timestamp}.md`;

    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExportButtonSuccess(exportBtn, 'md');
    logger.debug('[SidePanel] Markdown export successful:', fileName);
  } catch (error) {
    logger.error('[SidePanel] export Markdown failed:', error);
    showToast(t('chatExport.exportFailed', { message: error.message }), 'error');
    resetExportButton(exportBtn);
  }
  });
  });
}

export function exportAssistantMessageToImage(messageDiv, exportBtn, exportDropdown) {
  const btnKey = exportBtn.dataset.exportBtnKey;
  if (btnKey && exportInProgressMap.has(btnKey)) return;

  setExportButtonLoading(exportBtn, 'image', exportDropdown);

  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      let tempContainer = null;
      try {
        const html2canvasFunc = window.html2canvas || null;

        if (!html2canvasFunc) {
          showToast(t('chatExport.imageLibNotLoaded'), 'error');
          resetExportButton(exportBtn);
          return;
        }

        let markdownContent = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';

        if (!markdownContent) {
          const markdownBody = messageDiv.querySelector('.markdown-body');
          if (markdownBody) {
            markdownContent = markdownBody.innerText;
          } else {
            markdownContent = messageDiv.innerText;
          }
        }

        const timestamp = new Date().getTime();
        const fileName = `image-${timestamp}.jpg`;

        const MIN_EXPORT_WIDTH = 595;
        const actualWidth = Math.ceil(messageDiv.getBoundingClientRect().width);
        const exportWidth = Math.max(MIN_EXPORT_WIDTH, actualWidth);

        tempContainer = document.createElement('div');
        tempContainer.style.cssText = `
          position: fixed;
          left: -9999px;
          top: -9999px;
          width: ${exportWidth}px;
          padding: 40px;
          background: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #333;
          box-sizing: border-box;
        `;

        const content = document.createElement('div');
        content.className = 'markdown-body';
        content.innerHTML = formatMarkdown(markdownContent);
        tempContainer.appendChild(content);
        document.body.appendChild(tempContainer);

        await renderMermaidInContainer(tempContainer);
        await convertSvgsToImages(tempContainer);

        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        const canvas = await html2canvasFunc(tempContainer, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          willReadFrequently: true
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        const link = document.createElement('a');
        link.href = imgData;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setExportButtonSuccess(exportBtn, 'image');
        document.body.removeChild(tempContainer);
        tempContainer = null;
        logger.debug('[SidePanel] image export successful:', fileName);
      } catch (error) {
        logger.error('[SidePanel] export image failed:', error);
        showToast(t('chatExport.exportFailed', { message: error.message }), 'error');
        if (tempContainer && tempContainer.parentNode) {
          document.body.removeChild(tempContainer);
        }
        resetExportButton(exportBtn);
      }
    });
  });
}
