// ui-prototype.js - UI 原型预览模块

import { getUiPrototype, listUiPrototypes, deleteUiPrototype } from '../storage/db.js';

let currentPrototype = null;
let currentZoom = 1.0;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;

/**
 * 包裹原型 HTML，确保在任意容器中都可滚动
 * - 完整 HTML 文档：注入样式覆盖 overflow:hidden
 * - HTML 片段：包裹为标准文档结构
 */
function wrapPrototypeHtml(html) {
  const trimmed = html.trim();
  if (/^\s*<!DOCTYPE\s/i.test(trimmed) || /^\s*<html[\s>]/i.test(trimmed)) {
    const scrollFix = '<style>html,body{overflow:auto!important;height:auto!important;}</style>';
    if (/<\/head>/i.test(trimmed)) {
      return trimmed.replace(/<\/head>/i, scrollFix + '</head>');
    } else if (/<body[\s>]/i.test(trimmed)) {
      return trimmed.replace(/<body([\s>])/i, '<body$1' + scrollFix);
    }
    return trimmed;
  }
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;overflow:auto;">${trimmed}</body>
</html>`;
}

export function showUiPrototypeDialog(prototypeData) {
  console.log('[SidePanel] 显示 UI 原型预览:', prototypeData);
  
  currentPrototype = prototypeData;
  resetZoom();
  
  const titleEl = document.getElementById('prototypeTitle');
  const descEl = document.getElementById('prototypeDescription');
  const iframeEl = document.getElementById('prototypeIframe');
  
  if (titleEl) {
    titleEl.textContent = prototypeData.title || 'UI 原型预览';
  }
  
  if (descEl) {
    descEl.textContent = prototypeData.description || '';
    descEl.style.display = prototypeData.description ? 'block' : 'none';
  }
  
  if (iframeEl && prototypeData.html) {
    iframeEl.srcdoc = wrapPrototypeHtml(prototypeData.html);
  }
  
  const overlay = document.getElementById('prototypeOverlay');
  if (overlay) {
    overlay.classList.add('show');
  }
  
  console.log('[SidePanel] UI 原型预览弹窗已显示');
}

export function hideUiPrototypeDialog() {
  const overlay = document.getElementById('prototypeOverlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
  
  const iframeEl = document.getElementById('prototypeIframe');
  if (iframeEl) {
    iframeEl.srcdoc = '';
  }
  
  currentPrototype = null;
  
  console.log('[SidePanel] UI 原型预览弹窗已隐藏');
}

export function continueOptimizePrototype() {
  if (!currentPrototype) return;
  
  const prototypeId = currentPrototype.id;
  const title = currentPrototype.title || '原型';
  
  hideUiPrototypeDialog();
  
  const userInput = document.getElementById('userInput');
  if (userInput) {
    userInput.value = `请帮我优化这个UI原型界面 ${prototypeId}（${title}），`;
    userInput.focus();
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';
  }
  
  console.log('[SidePanel] 继续优化原型:', prototypeId);
}

export function downloadPrototype() {
  if (!currentPrototype || !currentPrototype.html) {
    console.error('[SidePanel] 没有可下载的原型');
    return;
  }
  
  const wrappedHtml = wrapPrototypeHtml(currentPrototype.html);
  const blob = new Blob([wrappedHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = (currentPrototype.title || 'prototype').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_') + '.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('[SidePanel] 原型已下载:', a.download);
}

export function openPrototypeInNewTab() {
  if (!currentPrototype || !currentPrototype.html) {
    console.error('[SidePanel] 没有可打开的原型');
    return;
  }
  
  const wrappedHtml = wrapPrototypeHtml(currentPrototype.html);
  const blob = new Blob([wrappedHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  
  chrome.tabs.create({ url: url, active: true });
  
  console.log('[SidePanel] 原型已在新标签页打开');
}

export async function loadAndShowPrototype(prototypeId) {
  try {
    const prototype = await getUiPrototype(prototypeId);
    
    if (!prototype) {
      console.error('[SidePanel] 未找到原型:', prototypeId);
      return;
    }
    
    showUiPrototypeDialog(prototype);
    
  } catch (err) {
    console.error('[SidePanel] 加载原型失败:', err);
  }
}

export async function showPrototypeLibrary() {
  const listEl = document.getElementById('prototypeLibraryList');
  const modal = document.getElementById('prototypeLibraryModal');
  
  if (!listEl || !modal) return;
  
  listEl.innerHTML = '<div class="prototype-library-empty">加载中...</div>';
  
  try {
    const prototypes = await listUiPrototypes();
    
    if (prototypes.length === 0) {
      listEl.innerHTML = '<div class="prototype-library-empty">暂无原型</div>';
    } else {
      listEl.innerHTML = prototypes.map(p => {
        const shortId = p.id.replace('proto_', '').slice(-6);
        return `
        <div class="prototype-library-item" data-id="${p.id}">
          <div class="prototype-library-item-info">
            <div class="prototype-library-item-title">${escapeHtml(p.title)}</div>
            <div class="prototype-library-item-id">ID: ${shortId}</div>
            <div class="prototype-library-item-time">${formatTime(p.createdAt)}</div>
          </div>
          <div class="prototype-library-item-actions">
            <button class="prototype-library-item-open" title="打开">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="prototype-library-item-optimize" data-id="${p.id}" title="继续优化">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="prototype-library-item-delete" data-id="${p.id}" title="删除">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
      }).join('');
      
      listEl.querySelectorAll('.prototype-library-item').forEach(item => {
        const infoArea = item.querySelector('.prototype-library-item-info');
        const openBtn = item.querySelector('.prototype-library-item-open');
        const optimizeBtn = item.querySelector('.prototype-library-item-optimize');
        const deleteBtn = item.querySelector('.prototype-library-item-delete');
        
        if (infoArea) {
          infoArea.addEventListener('click', () => {
            const id = item.dataset.id;
            loadAndShowPrototype(id);
            hidePrototypeLibrary();
          });
        }
        
        if (openBtn) {
          openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = item.dataset.id;
            loadAndShowPrototype(id);
            hidePrototypeLibrary();
          });
        }
        
        if (optimizeBtn) {
          optimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = optimizeBtn.dataset.id;
            const title = item.querySelector('.prototype-library-item-title')?.textContent || '原型';
            continueOptimizeFromLibrary(id, title);
            hidePrototypeLibrary();
          });
        }
        
        if (deleteBtn) {
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = deleteBtn.dataset.id;
            const title = item.querySelector('.prototype-library-item-title')?.textContent || '原型';
            deletePrototypeItem(id, title);
          });
        }
      });
    }
    
  } catch (err) {
    console.error('[SidePanel] 加载原型库失败:', err);
    listEl.innerHTML = '<div class="prototype-library-empty">加载失败</div>';
  }
  
  modal.classList.add('show');
  console.log('[SidePanel] 原型库已显示');
}

export function hidePrototypeLibrary() {
  const modal = document.getElementById('prototypeLibraryModal');
  if (modal) {
    modal.classList.remove('show');
  }
  console.log('[SidePanel] 原型库已隐藏');
}

function continueOptimizeFromLibrary(prototypeId, title) {
  const userInput = document.getElementById('userInput');
  if (userInput) {
    userInput.value = `请帮我优化这个UI原型界面 ${prototypeId}（${title}），`;
    userInput.focus();
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';
  }
  
  console.log('[SidePanel] 从原型库继续优化原型:', prototypeId);
}

async function deletePrototypeItem(prototypeId, title) {
  const confirmed = await showConfirm(
    '确认删除',
    `确定删除原型 "${title}" 吗？此操作不可撤销。`,
    '删除'
  );
  
  if (!confirmed) return;
  
  try {
    await deleteUiPrototype(prototypeId);
    console.log('[SidePanel] 原型已删除:', prototypeId);
    showPrototypeLibrary();
  } catch (err) {
    console.error('[SidePanel] 删除原型失败:', err);
    alert('删除失败: ' + err.message);
  }
}

/**
 * 显示自定义确认弹窗，返回 Promise<boolean>
 * @param {string} title 标题
 * @param {string} message 提示消息
 * @param {string} okText 确认按钮文字，默认"确认"
 */
function showConfirm(title, message, okText = '确认') {
  return new Promise((resolve) => {
    const modal = document.getElementById('genericConfirmModal');
    const titleEl = document.getElementById('genericConfirmTitle');
    const messageEl = document.getElementById('genericConfirmMessage');
    const okBtn = document.getElementById('genericConfirmOkBtn');
    const cancelBtn = document.getElementById('genericConfirmCancelBtn');
    
    if (!modal) {
      resolve(confirm(message));
      return;
    }
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    okBtn.textContent = okText;
    
    const cleanup = () => {
      modal.classList.remove('show');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
    };
    
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    
    modal.classList.add('show');
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) {
    return '刚刚';
  } else if (diff < 3600000) {
    return Math.floor(diff / 60000) + ' 分钟前';
  } else if (diff < 86400000) {
    return Math.floor(diff / 3600000) + ' 小时前';
  } else {
    return date.toLocaleDateString('zh-CN');
  }
}

// ========== 缩放功能 ==========

function applyZoom(newZoom) {
  currentZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  currentZoom = Math.round(currentZoom * 100) / 100;
  
  const iframeEl = document.getElementById('prototypeIframe');
  const levelEl = document.getElementById('prototypeZoomLevel');
  
  if (iframeEl) {
    iframeEl.style.zoom = currentZoom;
  }
  
  if (levelEl) {
    levelEl.textContent = Math.round(currentZoom * 100) + '%';
    if (currentZoom !== 1.0) {
      levelEl.classList.add('zoomed');
    } else {
      levelEl.classList.remove('zoomed');
    }
  }
}

function zoomIn() {
  applyZoom(currentZoom + ZOOM_STEP);
  flashZoomLevel();
}

function zoomOut() {
  applyZoom(currentZoom - ZOOM_STEP);
  flashZoomLevel();
}

function resetZoom() {
  applyZoom(1.0);
}

function setZoom(level) {
  applyZoom(level);
  flashZoomLevel();
}

function flashZoomLevel() {
  const levelEl = document.getElementById('prototypeZoomLevel');
  if (!levelEl) return;
  levelEl.classList.add('flash');
  setTimeout(() => levelEl.classList.remove('flash'), 150);
}

function handleZoomWheel(e) {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  
  if (e.deltaY < 0) {
    zoomIn();
  } else {
    zoomOut();
  }
}

function handleZoomKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === '0') {
    e.preventDefault();
    resetZoom();
  }
}

export function initPrototypeEvents() {
  const closeBtn = document.getElementById('prototypeCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideUiPrototypeDialog);
  }
  
  const downloadBtn = document.getElementById('prototypeDownloadBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadPrototype);
  }
  
  const openTabBtn = document.getElementById('prototypeOpenTabBtn');
  if (openTabBtn) {
    openTabBtn.addEventListener('click', openPrototypeInNewTab);
  }
  
  const continueBtn = document.getElementById('prototypeContinueBtn');
  if (continueBtn) {
    continueBtn.addEventListener('click', continueOptimizePrototype);
  }
  
  // 缩放按钮事件
  const zoomInBtn = document.getElementById('prototypeZoomInBtn');
  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', zoomIn);
  }
  
  const zoomOutBtn = document.getElementById('prototypeZoomOutBtn');
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', zoomOut);
  }
  
  const zoomLevel = document.getElementById('prototypeZoomLevel');
  if (zoomLevel) {
    zoomLevel.addEventListener('click', resetZoom);
  }
  
  // Ctrl+滚轮缩放
  const contentEl = document.getElementById('prototypeContent');
  if (contentEl) {
    contentEl.addEventListener('wheel', handleZoomWheel, { passive: false });
  }
  
  // Ctrl+0 快捷键
  document.addEventListener('keydown', handleZoomKeydown);
  
  const libraryCloseBtn = document.getElementById('prototypeLibraryCloseBtn');
  if (libraryCloseBtn) {
    libraryCloseBtn.addEventListener('click', hidePrototypeLibrary);
  }
  
  const libraryCancelBtn = document.getElementById('prototypeLibraryCancelBtn');
  if (libraryCancelBtn) {
    libraryCancelBtn.addEventListener('click', hidePrototypeLibrary);
  }
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SHOW_UI_PROTOTYPE') {
      console.log('[SidePanel] 收到显示原型请求:', message);
      loadAndShowPrototype(message.data.prototypeId);
      sendResponse({ success: true });
    }
  });
  
  console.log('[SidePanel] UI 原型模块事件已初始化');
}
