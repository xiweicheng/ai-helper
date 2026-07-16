// markdown-render.js - Markdown rendering utility functions

import { escapeHtml, showToast, copyToClipboard } from './utils.js';

/**
 * 格式化 Markdown 文本
 */
export function formatMarkdown(text) {
  if (!text) return '';
  
  // 提取 mermaid 图表并替换为占位符
  const mermaidBlocks = [];
  const mermaidIdSeed = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  text = text.replace(/```mermaid\n?([\s\S]*?)```/g, (match, content) => {
    const index = mermaidBlocks.length;
    mermaidBlocks.push(content.trim());
    return `%%MERMAID_BLOCK_${index}%%`;
  });
  
  // 提取代码块并替换为占位符（保留语言标识）
  const codeBlocks = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, language, content) => {
    const index = codeBlocks.length;
    codeBlocks.push({ language: language || 'text', content: content.trim() });
    return `%%CODE_BLOCK_${index}%%`;
  });
  
  // 提取表格并替换为占位符
  const tableBlocks = [];
  text = text.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm, (match, header, separator, body) => {
    const index = tableBlocks.length;
    tableBlocks.push({ header, separator, body, full: match.trim() });
    // 在占位符前后添加换行符，确保表格作为独立块级元素，避免被标题包裹
    return `\n%%TABLE_BLOCK_${index}%%\n`;
  });
  
  // 使用 marked 解析 Markdown
  let html = '';
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
    html = marked.parse(text);
  } else {
    // 降级处理：简单的格式化
    html = text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }
  
  // 还原 mermaid 图表占位符
  mermaidBlocks.forEach((content, index) => {
    const mermaidId = `mermaid-${mermaidIdSeed}-${index}`;
    // 重要：必须 HTML 转义内容，避免 mermaid 代码中的尖括号（如 <rows>、<br/> 等）
    // 被浏览器当作 HTML 标签解析，导致 content 内容变形或丢失
    // data-raw-code 保留 URL 编码的原始代码，供下载/导出使用
    // textContent 会被浏览器自动解码，mermaid 读取时仍是正确的原始内容
    html = html.replace(`%%MERMAID_BLOCK_${index}%%`, `<div class="mermaid" id="${mermaidId}" data-raw-code="${encodeURIComponent(content)}">${escapeHtml(content)}</div>`);
  });
  
  // 还原代码块占位符
  codeBlocks.forEach((block, index) => {
    const escapedContent = block.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    
    html = html.replace(
      `%%CODE_BLOCK_${index}%%`,
      `<div class="code-block-container" style="position: relative;">
        <button class="code-copy-btn" data-code="${index}" title="复制代码">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
          </svg>
        </button>
        <pre><code class="language-${block.language}">${escapedContent}</code></pre>
      </div>`
    );
  });
  
  // 还原表格占位符
  tableBlocks.forEach((table, index) => {
    html = html.replace(`%%TABLE_BLOCK_${index}%%`, createTableHTML(table));
  });
  
  return html;
}

/**
 * 解析单元格内的内联 Markdown（加粗、斜体、代码等）
 */
export function parseInlineMarkdown(text) {
  if (!text) return '';
  
  // 先转义 HTML（防止 XSS）
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // 解析行内代码 `` （必须在加粗之前处理，避免冲突）
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // 解析加粗 **text**
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // 解析斜体 *text*
  escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // 解析删除线 ~~text~~
  escaped = escaped.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  
  return escaped;
}

/**
 * 创建表格 HTML（含工具栏按钮）
 */
export function createTableHTML(tableData) {
  const { header, body, full } = tableData;
  const tableIndex = window.__tableBlocks ? window.__tableBlocks.length : 0;
  
  // 存储原始表格数据
  if (window.__tableBlocks) {
    window.__tableBlocks[tableIndex] = { full, header, body };
  }
  
  // 解析表头
  const headers = header.split('|').filter(cell => cell.trim()).map(cell => parseInlineMarkdown(cell.trim()));
  
  // 解析表格行数据
  const rows = body.trim().split('\n').filter(row => row.trim()).map(row => {
    return row.split('|').filter(cell => cell.trim()).map(cell => parseInlineMarkdown(cell.trim()));
  });
  
  // 构建表格 HTML
  let tableHTML = '<div class="table-container-wrapper"><table>';
  
  // 表头
  tableHTML += '<thead><tr>';
  headers.forEach((headerCell, index) => {
    const isLastColumn = index === headers.length - 1;
    if (isLastColumn) {
      // 最后一列，添加包裹容器和工具栏
      tableHTML += `<th class="table-header-cell-wrapper">
        ${headerCell}
        <div class="table-toolbar">
          <button class="table-toolbar-btn copy-md-btn" title="复制 Markdown 表格" data-table-full="${encodeURIComponent(full)}">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
            </svg>
          </button>
          <button class="table-toolbar-btn download-excel-btn" title="下载 Excel" data-table-header="${encodeURIComponent(header)}" data-table-body="${encodeURIComponent(body)}">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
              <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
            </svg>
          </button>
        </div>
      </th>`;
    } else {
      tableHTML += `<th>${headerCell}</th>`;
    }
  });
  tableHTML += '</tr></thead>';
  
  // 表格主体
  tableHTML += '<tbody>';
  rows.forEach(row => {
    tableHTML += '<tr>';
    row.forEach(cell => {
      tableHTML += `<td>${cell}</td>`;
    });
    tableHTML += '</tr>';
  });
  tableHTML += '</tbody>';
  
  tableHTML += '</table></div>';
  
  return tableHTML;
}

/**
 * 下载表格为 Excel（CSV 格式）
 */
export function downloadTableAsExcel(tableBlock) {
  try {
    const { header, body } = tableBlock;
    
    // 解析表头
    const headers = header.split('|').filter(cell => cell.trim()).map(cell => cell.trim());
    
    // 解析表格行数据
    const rows = body.trim().split('\n').filter(row => row.trim()).map(row => {
      return row.split('|').filter(cell => cell.trim()).map(cell => cell.trim());
    });
    
    // 转换为 CSV 格式
    let csvContent = '\uFEFF'; // BOM for UTF-8
    
    // 添加表头
    csvContent += headers.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
    
    // 添加数据行
    rows.forEach(row => {
      csvContent += row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
    });
    
    // 创建 Blob 并下载
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `table-${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('[SidePanel] Excel 下载成功');
  } catch (error) {
    console.error('[SidePanel] 下载 Excel 失败:', error);
    showToast('下载失败: ' + error.message, 'error');
  }
}

/**
 * 渲染所有 mermaid 图表
 */
/**
 * Extract meaningful error message from mermaid error object
 */
function getMermaidErrorDetail(err) {
  if (!err) return '未知错误';
  if (typeof err === 'string') return err;
  // mermaid 可能抛出非标准 Error 对象
  const msg = err.message || err.str || err.msg || err.text || '';
  if (msg) return msg;
  // 尝试 JSON 序列化
  try { return JSON.stringify(err); } catch (e) { return String(err); }
}

const MERMAID_RENDER_MAX_RETRIES = 2;

/**
 * 渲染单个 mermaid 容器（带重试）
 * 注意：mermaid.run() 失败时会修改 DOM 内容（替换为错误展示），
 * 因此需要在渲染前保存原始内容，重试时恢复
 */
async function renderSingleMermaid(container, retries = MERMAID_RENDER_MAX_RETRIES) {
  // 已有 SVG（例如从虚拟 DOM 缓存恢复），跳过重渲染，直接复用
  if (container.querySelector('svg')) {
    return { success: true };
  }

  // 保存原始内容：优先使用 data-raw-code 属性（不受 DOM 修改影响）
  const rawCode = container.getAttribute('data-raw-code');
  const originalContent = rawCode ? decodeURIComponent(rawCode) : (container.textContent || '');

  for (let attempt = 0; attempt <= retries; attempt++) {
    // 重试前恢复原始内容（mermaid.run 失败会修改 DOM）
    if (attempt > 0) {
      container.textContent = originalContent;
    }

    try {
      await mermaid.run({ nodes: [container] });
      return { success: true };
    } catch (err) {
      const detail = getMermaidErrorDetail(err);
      // 某些错误重试无意义（如语法错误），直接返回失败
      const noRetry = /(Parse error|syntax error|Lexical error|No diagram type detected)/i;
      if (noRetry.test(detail) || attempt >= retries) {
        console.error('[SidePanel] Mermaid 渲染失败，原始内容（前300字符）:', originalContent.substring(0, 300));
        // 恢复原始内容，方便调用方显示友好的错误提示
        container.textContent = originalContent;
        return { success: false, detail, err };
      }
      // 重试前短暂等待
      await new Promise(r => setTimeout(r, 200));
    }
  }
}

export async function renderMermaidCharts() {
  if (typeof mermaid === 'undefined') {
    console.warn('[SidePanel] Mermaid 库未加载');
    return;
  }
  
  console.log('[SidePanel] ===== renderMermaidCharts 开始 =====');
  
  const mermaidElements = document.querySelectorAll('.mermaid');
  console.log('[SidePanel] 找到 mermaid 元素数量:', mermaidElements.length);
  
  if (mermaidElements.length === 0) {
    return;
  }
  
  // 逐个渲染 mermaid 元素，避免单个失败影响其他图表
  for (let i = 0; i < mermaidElements.length; i++) {
    const container = mermaidElements[i];
    const result = await renderSingleMermaid(container);
    
    if (result.success) {
      console.log('[SidePanel] 第', i + 1, '个 mermaid 图表渲染成功');
      addMermaidControls(container);
    } else {
      console.error('[SidePanel] 第', i + 1, '个 mermaid 图表渲染失败:', result.detail, result.err);
      if (!container.querySelector('svg') && !container.querySelector('.mermaid-controls')) {
        container.innerHTML = `<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0;">图表渲染失败: ${result.detail}</div>`;
      }
    }
  }
  
  console.log('[SidePanel] ===== renderMermaidCharts 完成 =====');
}

/**
 * 格式化消息内容（Markdown 渲染）
 */
export function formatMessageContent(text) {
  if (!text) return '';
  return `<div class="markdown-body">${formatMarkdown(text)}</div>`;
}

/**
 * 为 mermaid 容器添加缩放/拖拽/复制控件
 */
export function addMermaidControls(container) {
  // 移除旧的工具栏（例如从虚拟 DOM 缓存恢复的，事件监听器已失效）
  const existingControls = container.querySelector('.mermaid-controls');
  if (existingControls) {
    existingControls.remove();
  }
  
  // 等待 SVG 渲染完成
  const svgElement = container.querySelector('svg');
  if (!svgElement) {
    console.warn('[SidePanel] SVG 元素未找到，当前内容:', container.innerHTML.substring(0, 100));
    return;
  }
  
  console.log('[SidePanel] 找到 SVG 元素，开始添加工具栏');
  console.log('[SidePanel] container 类名:', container.className);
  console.log('[SidePanel] container HTML:', container.innerHTML.substring(0, 200));
  
  // 设置 container 为 relative 定位
  container.style.position = 'relative';
  container.style.cursor = 'grab';
  container.style.userSelect = 'none';
  container.style.webkitUserSelect = 'none';
  
  // 创建 SVG 包装器
  let svgWrapper = container.querySelector('.mermaid-svg-wrapper');
  if (!svgWrapper) {
    svgWrapper = document.createElement('div');
    svgWrapper.className = 'mermaid-svg-wrapper';
    svgWrapper.style.transformOrigin = 'center center';
    svgWrapper.style.transition = 'transform 0.2s ease';
    svgWrapper.style.display = 'inline-block';
    svgWrapper.style.width = '100%';
    
    // 将 SVG 移入包装器
    svgElement.style.maxWidth = '100%';
    svgElement.style.height = 'auto';
    svgElement.style.userSelect = 'none';
    svgElement.style.webkitUserSelect = 'none';
    svgWrapper.appendChild(svgElement);
    container.insertBefore(svgWrapper, container.firstChild);
    
    // 隐藏原始的 mermaid 代码文本（只显示渲染后的 SVG）
    // 只移除文本节点，保留所有元素节点（如工具栏等）
    const nodesToRemove = [];
    Array.from(container.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        nodesToRemove.push(node);
      }
    });
    nodesToRemove.forEach(node => node.remove());
  }
  
  // 创建控制按钮（使用 Unicode 字符）
  const controls = document.createElement('div');
  controls.className = 'mermaid-controls';
  controls.innerHTML = `
    <button class="zoom-in" title="放大">+</button>
    <button class="zoom-out" title="缩小">−</button>
    <button class="reset-zoom" title="重置">↺</button>
    <button class="copy-to-clipboard" title="复制到剪贴板">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    </button>
    <button class="download-png" title="下载图片">↓</button>
    <button class="view-source" title="查看源代码">&lt;/&gt;</button>
  `;
  
  container.appendChild(controls);
  console.log('[SidePanel] 工具栏 HTML 已添加');
  console.log('[SidePanel] container 子元素:', Array.from(container.children).map(c => c.className).join(', '));
  
  // 缩放状态 - 支持无限缩放
  let scale = 1;
  const MIN_SCALE = 0.01;
  const MAX_SCALE = 100;
  const SCALE_STEP = 0.15;
  
  // 保存原始的 mermaid 源代码（优先使用 data-raw-code 属性中保存的原始代码）
  let rawSourceCode = container.dataset.rawCode || '';
  
  if (!rawSourceCode) {
    // 尝试从 SVG 的 title 元素获取源代码
    const titleEl = svgElement.querySelector('title');
    if (titleEl && titleEl.textContent) {
      rawSourceCode = titleEl.textContent.trim();
    }
  }
  
  // 如果 title 中没有，尝试从 SVG 的 comment 中获取
  if (!rawSourceCode) {
    const commentEl = svgElement.querySelector('script[type="text/plain"]');
    if (commentEl) {
      rawSourceCode = commentEl.textContent.trim();
    }
  }
  
  // 记录原始源代码到 container 的 data 属性上
  if (rawSourceCode && !container.dataset.rawMermaidCode) {
    container.dataset.rawMermaidCode = rawSourceCode;
  }
  
  // 查看源代码按钮事件 - 使用保存的原始源代码
  const viewSourceBtn = controls.querySelector('.view-source');
  viewSourceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // 从 data-raw-code 属性获取原始源代码（URL 编码）
    const rawCodeAttr = container.getAttribute('data-raw-code');
    const sourceCode = rawCodeAttr ? decodeURIComponent(rawCodeAttr) : container.dataset.rawMermaidCode || '';
    toggleMermaidSourceView(container, sourceCode, svgWrapper, svgElement, scale, { MIN_SCALE, MAX_SCALE, SCALE_STEP });
  });
  
  // 复制到剪贴板按钮事件
  controls.querySelector('.copy-to-clipboard').addEventListener('click', (e) => {
    e.stopPropagation();
    copyMermaidToClipboard(svgElement, svgWrapper, scale);
  });
  
  // 下载 PNG
  controls.querySelector('.download-png').addEventListener('click', (e) => {
    e.stopPropagation();
    downloadMermaidPNG(svgElement, scale);
  });
  
  // 鼠标滚轮缩放（需要同时按下 Ctrl 或 Cmd 键）
  container.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return; // 只有按下 Ctrl 或 Cmd 键时才缩放
    
    e.preventDefault();
    e.stopPropagation();
    
    if (e.deltaY < 0) {
      scale = Math.min(MAX_SCALE, scale + SCALE_STEP);
    } else {
      scale = Math.max(MIN_SCALE, scale - SCALE_STEP);
    }
    applyTransform();
  }, { passive: false });
  
  // 拖拽状态
  let isDragging = false;
  let startX, startY, translateX = 0, translateY = 0;
  
  // 应用变换
  function applyTransform() {
    svgWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }
  
  // 放大
  controls.querySelector('.zoom-in').addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.min(MAX_SCALE, scale + SCALE_STEP);
    applyTransform();
  });
  
  // 缩小
  controls.querySelector('.zoom-out').addEventListener('click', (e) => {
    e.stopPropagation();
    scale = Math.max(MIN_SCALE, scale - SCALE_STEP);
    applyTransform();
  });
  
  // 重置
  controls.querySelector('.reset-zoom').addEventListener('click', (e) => {
    e.stopPropagation();
    scale = 1;
    translateX = 0;
    translateY = 0;
    applyTransform();
  });
  
  // 拖拽功能
  container.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    container.style.cursor = 'grabbing';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    applyTransform();
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      container.style.cursor = 'grab';
    }
  });
}

/**
 * 将 Mermaid 图表复制到剪贴板（作为图片）
 */
export async function copyMermaidToClipboard(svgElement, svgWrapper, scale) {
  try {
    console.log('[SidePanel] 开始复制到剪贴板');
    
    // 获取 SVG 的原始尺寸
    let svgWidth = svgElement.width.baseVal?.value || svgElement.getAttribute('width')?.replace('px', '') || 800;
    let svgHeight = svgElement.height.baseVal?.value || svgElement.getAttribute('height')?.replace('px', '') || 600;
    
    // 如果有 viewBox，优先使用 viewBox 的尺寸
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(' ').map(parseFloat);
      svgWidth = parts[2];
      svgHeight = parts[3];
    }
    
    console.log('[SidePanel] SVG 原始尺寸:', svgWidth, 'x', svgHeight);
    
    // 将 SVG 转换为 base64 编码的 data URL
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
    const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
    
    const img = new Image();
    
    img.onload = function() {
      const padding = 20;
      const scaleFactor = 2; // 2x 分辨率
      const canvasWidth = svgWidth + padding * 2;
      const canvasHeight = svgHeight + padding * 2;
      
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth * scaleFactor;
      canvas.height = canvasHeight * scaleFactor;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      // 设置白色背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 绘制图片（带内边距）
      ctx.drawImage(img, padding * scaleFactor, padding * scaleFactor, svgWidth * scaleFactor, svgHeight * scaleFactor);
      
      // 使用 toBlob 导出 PNG
      canvas.toBlob(function(blob) {
        if (blob) {
          // 尝试使用 Clipboard API 写入图片
          if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
            navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]).then(() => {
              console.log('[SidePanel] 图片复制到剪贴板成功');
              showToast('Mermaid 图表已复制到剪贴板！', 'success');
            }).catch(err => {
              console.error('[SidePanel] 复制到剪贴板失败:', err);
              // 降级：提示用户手动复制或使用下载功能
              showToast('复制失败，您的浏览器可能不支持此功能。请尝试使用下载按钮保存图表。', 'error');
            });
          } else {
            // 降级方案：提示用户
            console.warn('[SidePanel] Clipboard API 不可用，降级为下载');
            showToast('当前浏览器不支持图片复制功能，已自动转为下载。', 'warning');
            // 自动触发下载
            const downloadLink = document.createElement('a');
            downloadLink.href = URL.createObjectURL(blob);
            downloadLink.download = 'mermaid-diagram-' + Date.now() + '.png';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
          }
        }
      }, 'image/png');
    };
    
    img.onerror = function(error) {
      console.error('[SidePanel] 图片转换失败:', error);
      showToast('图片转换失败，请重试', 'error');
    };
    
    img.src = dataUrl;
  } catch (error) {
    console.error('[SidePanel] 复制到剪贴板失败:', error);
    showToast('复制失败: ' + error.message, 'error');
  }
}

/**
 * 下载 Mermaid 图表为 PNG
 */
export function downloadMermaidPNG(svgElement, scale) {
  try {
    console.log('[SidePanel] 开始下载 PNG');
    
    // 获取 SVG 的原始尺寸
    let svgWidth = svgElement.width.baseVal?.value || svgElement.getAttribute('width')?.replace('px', '') || 800;
    let svgHeight = svgElement.height.baseVal?.value || svgElement.getAttribute('height')?.replace('px', '') || 600;
    
    // 如果有 viewBox，优先使用 viewBox 的尺寸
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(' ').map(parseFloat);
      svgWidth = parts[2];
      svgHeight = parts[3];
    }
    
    console.log('[SidePanel] SVG 原始尺寸:', svgWidth, 'x', svgHeight);
    
    // 将 SVG 转换为 base64 编码的 data URL，避免跨域问题
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
    const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
    
    const img = new Image();
    
    img.onload = function() {
      console.log('[SidePanel] SVG 图片加载成功');
      
      const padding = 20;
      const scaleFactor = 2; // 2x 分辨率
      const canvasWidth = svgWidth + padding * 2;
      const canvasHeight = svgHeight + padding * 2;
      
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth * scaleFactor;
      canvas.height = canvasHeight * scaleFactor;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      // 设置白色背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 绘制图片（带内边距）
      ctx.drawImage(img, padding * scaleFactor, padding * scaleFactor, svgWidth * scaleFactor, svgHeight * scaleFactor);
      
      // 使用 toBlob 导出
      canvas.toBlob(function(blob) {
        const pngUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = 'mermaid-diagram-' + Date.now() + '.png';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(pngUrl);
        
        console.log('[SidePanel] PNG 下载成功');
      }, 'image/png');
    };
    
    img.onerror = function(error) {
      console.error('[SidePanel] PNG 转换失败:', error);
      showToast('PNG 转换失败，请重试', 'error');
    };
    
    img.src = dataUrl;
  } catch (error) {
    console.error('[SidePanel] 下载 PNG 失败:', error);
    showToast('下载失败: ' + error.message, 'error');
  }
}

/**
 * 切换 Mermaid 图表源代码查看模式
 */
export function toggleMermaidSourceView(container, sourceCode, svgWrapper, svgElement, currentScale, scaleConfig) {
  const sourceView = container.querySelector('.mermaid-source-view');
  const controls = container.querySelector('.mermaid-controls');
  
  if (sourceView) {
    // 当前是源代码视图，切换回图表视图
    if (sourceView.parentElement) {
      sourceView.parentElement.remove();
    }
    
    // 重新显示 SVG 包装器
    if (svgWrapper) {
      svgWrapper.style.display = 'inline-block';
    }
    
    // 重新添加工具栏
    addMermaidControls(container);
  } else {
    // 当前是图表视图，切换到源代码视图
    
    // 隐藏 SVG 包装器
    if (svgWrapper) {
      svgWrapper.style.display = 'none';
    }
    
    // 移除旧的工具栏
    if (controls) {
      controls.remove();
    }
    
    // 创建源代码视图容器
    const sourceWrapper = document.createElement('div');
    sourceWrapper.className = 'mermaid-container-wrapper';
    sourceWrapper.style.position = 'relative';
    
    // 创建源代码显示区域
    const sourcePre = document.createElement('pre');
    sourcePre.className = 'mermaid-source-view';
    sourcePre.style.position = 'relative';
    sourcePre.textContent = sourceCode;
    
    // 创建复制按钮
    const copyBtn = document.createElement('button');
    copyBtn.className = 'source-copy-btn';
    copyBtn.title = '复制源代码';
    copyBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    `;
    
    // 复制按钮事件
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(sourceCode, copyBtn);
    });
    
    // 创建切换回图表视图的按钮
    const backToChartBtn = document.createElement('button');
    backToChartBtn.className = 'source-copy-btn';
    backToChartBtn.style.right = '44px';
    backToChartBtn.title = '返回图表';
    backToChartBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a1.25 1.25 0 0 0 0 1.32l1.965 2.36a.25.25 0 0 1-.192.41h-3.932a.25.25 0 0 1-.192-.41l-1.966-2.36a1.25 1.25 0 0 0 0-1.32l1.966-2.36a.25.25 0 0 1 .192-.41zm-6.068 0H1.534a.25.25 0 0 0-.192.41l1.966 2.36a1.25 1.25 0 0 1 0 1.32l-1.966 2.36A.25.25 0 0 0 1.534 14h3.932a.25.25 0 0 0 .192-.41l-1.966-2.36a1.25 1.25 0 0 1 0-1.32l1.966-2.36a.25.25 0 0 0-.192-.41z"/>
      </svg>
    `;
    
    // 切换回图表视图按钮事件
    backToChartBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMermaidSourceView(container, sourceCode, svgWrapper, svgElement, currentScale, scaleConfig);
    });
    
    // 组装 DOM
    sourcePre.appendChild(copyBtn);
    sourcePre.appendChild(backToChartBtn);
    sourceWrapper.appendChild(sourcePre);
    container.appendChild(sourceWrapper);
  }
}

/**
 * 在消息添加后渲染 mermaid
 */
export async function renderMessageMermaid(messageDiv) {
  console.log('[SidePanel] ===== renderMessageMermaid 开始 =====');
  
  if (typeof mermaid === 'undefined') {
    console.warn('[SidePanel] Mermaid 库未加载');
    return;
  }
  
  // 等待 DOM 完全更新
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // 获取消息中所有的 mermaid 元素
  const mermaidElements = messageDiv.querySelectorAll('.mermaid');
  console.log('[SidePanel] 找到 mermaid 元素数量:', mermaidElements.length);
  
  if (mermaidElements.length === 0) {
    console.log('[SidePanel] 未找到 mermaid 元素');
    return;
  }
  
  try {
    // 逐个渲染，避免批量模式下 DOM 引用失效导致工具栏添加失败
    for (let i = 0; i < mermaidElements.length; i++) {
      const container = mermaidElements[i];
      const result = await renderSingleMermaid(container);
      
      // 渲染后重新查询，确保拿到最新的 DOM 引用
      const currentContainer = messageDiv.querySelectorAll('.mermaid')[i];
      
      if (result.success && currentContainer) {
        console.log('[SidePanel] 第', i + 1, '个 mermaid 图表渲染成功');
        addMermaidControls(currentContainer);
      } else if (currentContainer && !currentContainer.querySelector('svg') && !currentContainer.querySelector('.mermaid-controls')) {
        console.error('[SidePanel] 第', i + 1, '个 mermaid 图表渲染失败:', result.detail, result.err);
        currentContainer.innerHTML = `<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px;">图表渲染失败: ${result.detail}</div>`;
      }
    }
    
    console.log('[SidePanel] Mermaid 渲染完成');
    
    // 验证工具栏是否添加成功
    const controls = messageDiv.querySelectorAll('.mermaid-controls');
    console.log('[SidePanel] 工具栏添加结果:', controls.length, '个成功');
  } catch (error) {
    console.error('[SidePanel] Mermaid 渲染整体失败:', error);
  }
  
  // 添加代码块复制按钮事件
  addCodeCopyButtons();
}

// Ctrl+单击复制代码的事件委托是否已绑定
let ctrlClickBound = false;

/**
 * 设置 Ctrl+单击复制代码事件（委托在 #chatContainer 上，只绑定一次）
 */
function setupCodeCtrlClick() {
  if (ctrlClickBound) return;
  ctrlClickBound = true;

  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer) return;

  chatContainer.addEventListener('click', (e) => {
    // 必须按下 Ctrl（Windows/Linux）或 Cmd（Mac），且必须是左键点击（排除右键/Ctrl+Click）
    if ((!e.ctrlKey && !e.metaKey) || e.button !== 0) return;

    // 点击目标是 <code> 元素，或代码块容器内的任意位置
    let codeEl = e.target.closest('code');
    if (!codeEl) {
      // 点击可能落在 <pre> 内边距或空白区域（<code> 是 <pre> 的子元素而非祖先）
      const preEl = e.target.closest('pre');
      if (preEl) {
        codeEl = preEl.querySelector('code');
      }
      if (!codeEl) {
        const container = e.target.closest('.code-block-container');
        if (container) {
          codeEl = container.querySelector('code');
        }
      }
    }
    if (!codeEl) return;

    // 排除复制按钮区域内的点击（按钮自己的点击事件会 stopPropagation）
    const copyBtn = e.target.closest('.code-copy-btn');
    if (copyBtn) return;

    e.preventDefault();
    const codeText = codeEl.textContent;
    if (!codeText) return;

    navigator.clipboard.writeText(codeText).then(() => {
      // 判断是行内代码还是代码块
      const isCodeBlock = codeEl.closest('.code-block-container');
      const label = isCodeBlock ? '代码块' : '代码';
      showToast(`${label}已复制到剪贴板`, 'success');
    }).catch((err) => {
      console.error('[SidePanel] Ctrl+单击复制失败:', err);
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = codeText;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('代码已复制到剪贴板', 'success');
    });
  });

  console.log('[SidePanel] Ctrl+单击复制代码事件已绑定');
}

/**
 * 添加代码块复制按钮事件
 */
export function addCodeCopyButtons() {
  const copyButtons = document.querySelectorAll('.code-copy-btn');
  console.log('[SidePanel] 找到代码复制按钮数量:', copyButtons.length);
  
  copyButtons.forEach((btn, index) => {
    // 避免重复绑定
    if (btn.dataset.bound) {
      console.log('[SidePanel] 按钮', index, '已绑定，跳过');
      return;
    }
    btn.dataset.bound = 'true';
    
    btn.addEventListener('click', (e) => {
      console.log('[SidePanel] 代码复制按钮被点击');
      e.stopPropagation();
      // 从父容器获取代码，而不是全局查询
      const container = btn.closest('.code-block-container');
      console.log('[SidePanel] 找到容器:', !!container);
      if (container) {
        const codeElement = container.querySelector('pre code');
        console.log('[SidePanel] 找到代码元素:', !!codeElement);
        if (codeElement) {
          const codeText = codeElement.textContent;
          console.log('[SidePanel] 代码长度:', codeText.length);
          copyToClipboard(codeText, btn);
        }
      }
    });
    console.log('[SidePanel] 已绑定按钮', index);
  });
  
  // 设置 Ctrl+单击复制（只绑定一次）
  setupCodeCtrlClick();

  // 添加表格工具栏按钮事件
  addTableToolbarEvents();
}

/**
 * 从 DOM 中提取表格数据（历史消息的最终 fallback）
 */
function extractTableFromDOM(btn) {
  const table = btn.closest('.table-container-wrapper')?.querySelector('table');
  if (!table) return null;

  // 提取表头
  const headers = [];
  table.querySelectorAll('thead th').forEach(th => {
    // 取第一个文本子节点（排除 toolbar 中的 SVG 文本）
    let text = '';
    for (const node of th.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('table-toolbar') && !node.closest('.table-toolbar')) {
        text += node.textContent || '';
      }
    }
    headers.push(text.trim());
  });

  // 提取表体
  const bodyRows = [];
  table.querySelectorAll('tbody tr').forEach(tr => {
    const cells = [];
    tr.querySelectorAll('td').forEach(td => {
      cells.push(td.textContent.trim());
    });
    bodyRows.push(cells);
  });

  if (headers.length === 0 && bodyRows.length === 0) return null;

  // 构建 Markdown 表格
  const headerLine = '| ' + headers.join(' | ') + ' |';
  const sepLine = '| ' + headers.map(() => '---').join(' | ') + ' |';
  const bodyLines = bodyRows.map(row => '| ' + row.join(' | ') + ' |').join('\n');

  return {
    full: headerLine + '\n' + sepLine + '\n' + bodyLines,
    header: headerLine + '\n' + sepLine,
    body: bodyLines
  };
}

/**
 * 添加表格工具栏按钮事件
 */
export function addTableToolbarEvents() {
  // 复制 Markdown 表格按钮
  document.querySelectorAll('.copy-md-btn').forEach((btn, index) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 1. 新格式：从 data 属性读取（HTML 恢复后也能工作）
      const full = btn.dataset.tableFull ? decodeURIComponent(btn.dataset.tableFull) : null;
      if (full) {
        copyToClipboard(full, btn);
        return;
      }
      // 2. 旧格式：从 window.__tableBlocks 读取（实时渲染时）
      const tableIndex = btn.dataset.tableIndex;
      const tableBlock = window.__tableBlocks?.[parseInt(tableIndex)];
      if (tableBlock) {
        copyToClipboard(tableBlock.full, btn);
        return;
      }
      // 3. 最终 fallback：从 DOM 提取表格数据（历史消息，既有旧格式又是 restore）
      const domData = extractTableFromDOM(btn);
      if (domData) {
        copyToClipboard(domData.full, btn);
      }
    });
  });
  
  // 下载 Excel 按钮
  document.querySelectorAll('.download-excel-btn').forEach((btn, index) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 1. 新格式：从 data 属性读取
      const header = btn.dataset.tableHeader ? decodeURIComponent(btn.dataset.tableHeader) : null;
      const body = btn.dataset.tableBody ? decodeURIComponent(btn.dataset.tableBody) : null;
      if (header && body) {
        downloadTableAsExcel({ header, body });
        return;
      }
      // 2. 旧格式：从 window.__tableBlocks 读取
      const tableIndex = btn.dataset.tableIndex;
      const tableBlock = window.__tableBlocks?.[parseInt(tableIndex)];
      if (tableBlock) {
        downloadTableAsExcel(tableBlock);
        return;
      }
      // 3. 最终 fallback：从 DOM 提取
      const domData = extractTableFromDOM(btn);
      if (domData) {
        downloadTableAsExcel(domData);
      }
    });
  });
}
