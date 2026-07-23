// chat-export.js - 聊天消息导出功能（Word/PDF/Markdown/图片）
// 从 chat-manager.js 拆分，负责将助手消息导出为多种格式

import { showToast } from './utils.js';
import { formatMarkdown } from './markdown-render.js';
import logger from '../shared/logger.js';

// 同一按钮的导出任务进行中时阻止重复触发
let exportInProgressMap = new Map();

/**
 * 安全地将 canvas 转为 data URL（PNG 对大画布可能失败，自动降级为 JPEG）
 * @param {HTMLCanvasElement} canvas
 * @returns {{ dataUrl: string, format: string }} format 为 'PNG' 或 'JPEG'
 */
function safeCanvasToDataUrl(canvas) {
  // 先尝试 PNG
  try {
    const pngData = canvas.toDataURL('image/png');
    if (pngData && pngData.length > 100) {
      return { dataUrl: pngData, format: 'PNG' };
    }
  } catch (e) {
    logger.debug('[ChatExport] PNG toDataURL 失败，降级为 JPEG:', e.message);
  }

  // PNG 失败或数据异常小，降级为 JPEG
  try {
    const jpgData = canvas.toDataURL('image/jpeg', 0.92);
    return { dataUrl: jpgData, format: 'JPEG' };
  } catch (e) {
    // 最后尝试低质量 JPEG
    try {
      const jpgLowData = canvas.toDataURL('image/jpeg', 0.5);
      return { dataUrl: jpgLowData, format: 'JPEG' };
    } catch (e2) {
      throw new Error('Canvas toDataURL 失败: ' + e2.message);
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
      logger.warn('[SidePanel] 导出时 mermaid 渲染失败:', e);
    }
  }
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
        image.onerror = () => reject(new Error('SVG 图片加载失败'));
        image.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, width, height);

      const { dataUrl, format } = safeCanvasToDataUrl(canvas);
      URL.revokeObjectURL(url);

      const imgTag = document.createElement('img');
      imgTag.src = dataUrl;
      imgTag.style.cssText = `max-width:100%;width:${width}px;height:auto;`;
      svg.parentNode.replaceChild(imgTag, svg);
    } catch (e) {
      logger.warn('[SidePanel] SVG 转图片失败:', e.name, e.message);
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

export function exportAssistantMessageToDocx(messageDiv, exportBtn, exportDropdown) {
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

    const htmlContent = formatMarkdown(markdownContent);

    // 渲染 mermaid 图表为 SVG
    const tempContainer = document.createElement('div');
    tempContainer.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    tempContainer.innerHTML = htmlContent;
    document.body.appendChild(tempContainer);

    // 移除不需要的 UI 元素（Word 中不需要表格工具栏和代码复制按钮）
    tempContainer.querySelectorAll('.table-toolbar, .code-copy-btn').forEach(el => el.remove());

    await renderMermaidInContainer(tempContainer);
    await convertSvgsToImages(tempContainer);
    const renderedHtml = tempContainer.innerHTML;
    document.body.removeChild(tempContainer);

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>AI Helper 导出</title>
        <style>
          body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
            padding: 20px;
          }
          h1, h2, h3, h4, h5, h6 {
            margin-top: 16pt;
            margin-bottom: 8pt;
          }
          h1 { font-size: 18pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h2 { font-size: 15pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h3 { font-size: 13pt; }
          p { margin: 8pt 0; }
          code {
            font-family: 'Consolas', 'Courier New', monospace;
            background-color: #f5f5f5;
            padding: 2pt 4pt;
            border-radius: 3px;
            font-size: 10pt;
          }
          pre {
            background-color: #f5f5f5;
            padding: 10pt;
            border-radius: 5px;
            overflow-x: auto;
          }
          pre code {
            background-color: transparent;
            padding: 0;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 10pt 0;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 6pt 10pt;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
            font-weight: bold;
          }
          blockquote {
            border-left: 4px solid #ddd;
            margin: 10pt 0;
            padding: 5pt 15pt;
            color: #666;
          }
          ul, ol {
            margin: 10pt 0 10pt 40pt;
            padding-left: 0;
            list-style-position: outside;
          }
          ul ul, ol ol, ul ol, ol ul {
            margin-left: 30pt;
          }
          li { margin: 4pt 0; }
          td ul, td ol {
            margin: 4pt 0 4pt 24pt;
            padding-left: 0;
          }
          td li { margin: 2pt 0; }
          a { color: #0563c1; text-decoration: none; }
          a:hover { text-decoration: underline; }
          img { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        ${renderedHtml}
      </body>
      </html>
    `;

    const blob = new Blob(['\uFEFF', fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().getTime();
    link.download = `word-${timestamp}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportButtonSuccess(exportBtn, 'docx');
    logger.debug('[SidePanel] Word 文档导出成功');
  } catch (error) {
    logger.error('[SidePanel] 导出 Word 失败:', error);
    showToast('导出失败: ' + error.message, 'error');
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
      showToast('PDF 导出库未加载', 'error');
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
        format: [PDF_WIDTH, PDF_HEIGHT]
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
        tempCtx.drawImage(canvas, 0, startY, canvasWidth, pageHeight, 0, 0, canvasWidth, pageHeight);

        const { dataUrl: tempImgData, format: tempFormat } = safeCanvasToDataUrl(tempCanvas);
        
        const imgHeight = pageHeight / scaleRatio;
        pdf.addImage(tempImgData, tempFormat, 0, 0, PDF_WIDTH, imgHeight);
      }

      pdf.save(fileName);

      setExportButtonSuccess(exportBtn, 'pdf');

      document.body.removeChild(container);
      logger.debug('[SidePanel] PDF 导出成功:', fileName);
    }).catch(error => {
      logger.error('[SidePanel] PDF 导出失败:', error);
      showToast('导出失败: ' + error.message, 'error');
      document.body.removeChild(container);
      resetExportButton(exportBtn);
    });
  } catch (error) {
    logger.error('[SidePanel] 导出 PDF 失败:', error);
    showToast('导出失败: ' + error.message, 'error');
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
      showToast('没有可导出的内容', 'error');
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
    logger.debug('[SidePanel] Markdown 导出成功:', fileName);
  } catch (error) {
    logger.error('[SidePanel] 导出 Markdown 失败:', error);
    showToast('导出失败: ' + error.message, 'error');
    resetExportButton(exportBtn);
  }
  });
  });
}

export function exportAssistantMessageToImage(messageDiv, exportBtn, exportDropdown) {
  const btnKey = exportBtn.dataset.exportBtnKey;
  if (btnKey && exportInProgressMap.has(btnKey)) return;

  setExportButtonLoading(exportBtn, 'image', exportDropdown);

  // 让浏览器先渲染 loading 状态
  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
  try {
    const html2canvasFunc = window.html2canvas || null;

    if (!html2canvasFunc) {
      showToast('图片导出库未加载', 'error');
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

    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      left: -9999px;
      top: -9999px;
      width: 595px;
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
    container.appendChild(content);

    document.body.appendChild(container);

    // 渲染 mermaid 图表，并转为图片（html2canvas 无法正确处理 SVG）
    await renderMermaidInContainer(container);
    await convertSvgsToImages(container);

    html2canvasFunc(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      willReadFrequently: true
    }).then(canvas => {
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const link = document.createElement('a');
      link.href = imgData;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportButtonSuccess(exportBtn, 'image');

      document.body.removeChild(container);
      logger.debug('[SidePanel] 图片导出成功:', fileName);
    }).catch(error => {
      logger.error('[SidePanel] 图片导出失败:', error);
      showToast('导出失败: ' + error.message, 'error');
      document.body.removeChild(container);
      resetExportButton(exportBtn);
    });
  } catch (error) {
    logger.error('[SidePanel] 导出图片失败:', error);
    showToast('导出失败: ' + error.message, 'error');
    resetExportButton(exportBtn);
  }
  });
  });
}
