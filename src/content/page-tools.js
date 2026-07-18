// content/page-tools.js - 网页内容读取与提取工具
// 主文件保留基础工具函数，复杂提取/交互函数已拆分到 page-extract.js / page-interaction.js
// 共享工具函数已拆分到 page-utils.js

import { deepQuerySelector, deepQuerySelectorAll, deepGetText, deepGetHtml } from './shadow-dom-utils.js';
import { removeHighlights } from './page-utils.js';

// 重导出共享工具函数（保持向后兼容：content/index.js 仍从本模块导入 removeHighlights）
export { generateUniqueSelector, getElementText, getElementValue, getElementSelector, removeHighlights } from './page-utils.js';
// 重导出内容提取类工具
export {
  extractMetadata, extractLinks, extractForms, extractImages,
  pageToMarkdown, pageToJson, getIframeContent, searchInPage
} from './page-extract.js';
// 重导出交互查询类工具
export {
  queryInteractiveElements, findSimilarElements,
  getElementCount, scrollAndCollect, readAccessibilityTree
} from './page-interaction.js';

/**
 * 获取当前网页的纯文本内容（增强版）
 */
export function getPageText(options = {}) {
  const { maxLength = 50000, includeHeadings = true, includeLinks = true } = options;

  const bodyText = deepGetText();

  const title = document.title || '';

  const data = {
    title,
    url: window.location.href,
    content: bodyText.substring(0, maxLength),
    wordCount: bodyText.split(/\s+/).length
  };

  if (includeHeadings) {
    data.headings = Array.from(deepQuerySelectorAll('h1, h2, h3, h4, h5, h6'))
      .map(h => ({ level: h.tagName, text: h.textContent.trim() }))
      .filter(h => h.text.length > 0)
      .slice(0, 30);
  }

  if (includeLinks) {
    data.links = Array.from(deepQuerySelectorAll('a'))
      .map(a => ({ text: a.textContent.trim(), href: a.href }))
      .filter(link => link.text.length > 0)
      .slice(0, 50);
  }

  return { success: true, data };
}

/**
 * 获取当前网页的完整HTML内容
 */
export function getFullHtml(options = {}) {
  const { includeStyles = false, maxLength = 50000 } = options;

  let html = deepGetHtml();

  if (!includeStyles) {
    html = html.replace(/\s*style="[^"]*"/gi, '');
  }

  return {
    success: true,
    content: JSON.stringify({
      title: document.title,
      url: window.location.href,
      html: html.substring(0, maxLength),
      fullLength: html.length
    })
  };
}

/**
 * 获取用户选中的内容
 */
export function getSelectedContent(format = 'text') {
  try {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return { success: false, error: '当前没有选中的内容' };
    }

    const result = {
      success: true,
      data: {
        selectedCount: selection.rangeCount,
        text: ''
      }
    };

    if (format === 'html') {
      // 获取富文本/HTML内容
      const htmlParts = [];
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        const fragment = range.cloneContents();
        const div = document.createElement('div');
        div.appendChild(fragment);
        htmlParts.push(div.innerHTML);
      }
      result.data.html = htmlParts.join('\n');
      result.data.text = selection.toString();
    } else {
      // 获取纯文本
      result.data.text = selection.toString();
    }

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 提取表格数据
 */
export function extractTable(selector = 'table', includeHeaders = true, format = 'json') {
  try {
    const table = deepQuerySelector(selector);
    if (!table) {
      return { success: false, error: `未找到匹配选择器的表格: ${selector}` };
    }

    const rows = Array.from(table.querySelectorAll('tr'));
    const data = [];

    rows.forEach((row, index) => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      const rowData = cells.map(cell => cell.textContent.trim());
      if (includeHeaders || index > 0) {
        data.push(rowData);
      }
    });

    if (format === 'markdown') {
      if (data.length === 0) {
        return { success: true, content: '表格为空' };
      }
      const header = `| ${data[0].join(' | ')} |`;
      const separator = `| ${data[0].map(() => '---').join(' | ')} |`;
      const body = data.slice(1).map(row => `| ${row.join(' | ')} |`).join('\n');
      return { success: true, content: `${header}\n${separator}\n${body}` };
    }

    return { success: true, content: JSON.stringify({ data, rowCount: data.length, columnCount: data[0]?.length || 0 }), data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 复制文本到剪贴板
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return { success: true, message: '已复制到剪贴板' };
  } catch (error) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return { success: true, message: '已复制到剪贴板（降级方案）' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

/**
 * 从剪贴板读取文本
 */
export async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    return { success: true, content: text };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 鼠标悬停在元素上
 */
export function hoverElement(selector) {
  try {
    const element = deepQuerySelector(selector);
    if (!element) {
      return { success: false, error: `未找到元素: ${selector}` };
    }

    // 创建并触发 mouseenter 事件
    const mouseEnterEvent = new MouseEvent('mouseenter', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    element.dispatchEvent(mouseEnterEvent);

    // 创建并触发 mouseover 事件
    const mouseOverEvent = new MouseEvent('mouseover', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    element.dispatchEvent(mouseOverEvent);

    return { success: true, message: `已在元素上触发悬停效果: ${selector}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 在页面上高亮文本
 */
export function highlightText(text, color = 'yellow') {
  try {
    if (!text) {
      return { success: false, error: '未提供要高亮的文本' };
    }

    // 移除之前的高亮
    removeHighlights();

    // 创建高亮样式
    const style = document.createElement('style');
    style.id = 'ai-helper-highlight-style';
    style.textContent = `
      .ai-helper-highlight {
        background-color: ${color} !important;
        padding: 2px 0;
      }
    `;
    document.head.appendChild(style);

    // 查找并高亮文本
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeValue.toLowerCase().includes(text.toLowerCase())) {
        textNodes.push(node);
      }
    }

    const highlights = [];
    textNodes.forEach(textNode => {
      const parent = textNode.parentNode;
      if (!parent || !parent.replaceChild || !parent.insertBefore) return;

      const text = textNode.nodeValue;
      const lowerText = text.toLowerCase();
      const searchText = text.toLowerCase();
      const index = lowerText.indexOf(searchText);

      if (index !== -1) {
        const span = document.createElement('span');
        span.className = 'ai-helper-highlight';
        span.textContent = text.substring(index, index + text.length);

        const before = document.createTextNode(text.substring(0, index));
        const after = document.createTextNode(text.substring(index + text.length));

        parent.replaceChild(after, textNode);
        parent.insertBefore(span, after);
        parent.insertBefore(before, span);

        highlights.push(span);
      }
    });

    // 滚动到第一个高亮
    if (highlights.length > 0) {
      highlights[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return {
      success: true,
      message: `已高亮 ${highlights.length} 处文本`,
      count: highlights.length
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
