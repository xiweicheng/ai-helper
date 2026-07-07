// ui-prototype.js - UI 原型预览模块

import { getUiPrototype, listUiPrototypes, deleteUiPrototype } from '../storage/db.js';
import { ICON_EYE_24, ICON_EXTERNAL_LINK_24, ICON_EDIT_PEN_24, ICON_TRASH_24, ICON_DOWNLOAD_24 } from './icons.js';

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
  const localOpenBtn = document.getElementById('prototypeLocalOpenBtn');
  
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

  // 有本地文件路径时显示"本地浏览器打开"按钮
  if (localOpenBtn) {
    if (prototypeData.localPath) {
      localOpenBtn.style.display = '';
      localOpenBtn.dataset.path = prototypeData.localPath;
    } else {
      localOpenBtn.style.display = 'none';
    }
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
    
    renderPrototypeLibraryList(prototypes);
    
    // 绑定搜索和排序事件
    bindPrototypeLibraryControls(prototypes);
    
  } catch (err) {
    console.error('[SidePanel] 加载原型页面库失败:', err);
    listEl.innerHTML = '<div class="prototype-library-empty">加载失败</div>';
  }
  
  modal.classList.add('show');
  console.log('[SidePanel] 原型页面库已显示');
}

function renderPrototypeLibraryList(prototypes) {
  const listEl = document.getElementById('prototypeLibraryList');
  if (!listEl) return;

  if (prototypes.length === 0) {
    listEl.innerHTML = '<div class="prototype-library-empty">暂无原型</div>';
  } else {
    listEl.innerHTML = prototypes.map(p => {
        const shortId = p.id.replace('proto_', '').slice(-6);
        return `
        <div class="prototype-library-item" data-id="${p.id}">
          <div class="prototype-library-item-info">
            <div class="prototype-library-item-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</div>
            ${p.description ? `<div class="prototype-library-item-desc" title="${escapeHtml(p.description)}">${escapeHtml(p.description)}</div>` : '<div class="prototype-library-item-desc prototype-library-item-desc-empty">暂无描述</div>'}
            <div class="prototype-library-item-meta">
              <span class="prototype-library-item-id">ID: ${shortId}</span>
              <span class="prototype-library-item-time">${formatTime(p.createdAt)}</span>
            </div>
          </div>
          <div class="prototype-library-item-actions">
            <button class="prototype-library-item-open" title="面板内预览">
              ${ICON_EYE_24}
            </button>
            ${p.localPath ? `
            <button class="prototype-library-item-local-open" data-path="${escapeHtml(p.localPath)}" title="在本地浏览器打开">
              ${ICON_EXTERNAL_LINK_24}
            </button>
            ` : ''}
            <button class="prototype-library-item-optimize" data-id="${p.id}" title="继续优化">
              ${ICON_EDIT_PEN_24}
            </button>
            <button class="prototype-library-item-delete" data-id="${p.id}" title="删除">
              ${ICON_TRASH_24}
            </button>
            <button class="prototype-library-item-download" data-id="${p.id}" title="下载原型">
              ${ICON_DOWNLOAD_24}
            </button>
          </div>
        </div>
      `;
      }).join('');
      
      listEl.querySelectorAll('.prototype-library-item').forEach(item => {
        const infoArea = item.querySelector('.prototype-library-item-info');
        const openBtn = item.querySelector('.prototype-library-item-open');
        const localOpenBtn = item.querySelector('.prototype-library-item-local-open');
        const optimizeBtn = item.querySelector('.prototype-library-item-optimize');
        const deleteBtn = item.querySelector('.prototype-library-item-delete');
        const downloadBtn = item.querySelector('.prototype-library-item-download');
        
        if (infoArea) {
          infoArea.addEventListener('click', () => {
            const id = item.dataset.id;
            loadAndShowPrototype(id);
          });
        }
        
        if (openBtn) {
          openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = item.dataset.id;
            loadAndShowPrototype(id);
          });
        }

        if (localOpenBtn) {
          localOpenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const path = localOpenBtn.dataset.path;
            chrome.runtime.sendMessage({ type: 'OPEN_LOCAL_PROTOTYPE', path }, (response) => {
              if (!response?.success) {
                console.error('[SidePanel] 本地浏览器打开失败:', response?.error);
              }
            });
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

        if (downloadBtn) {
          downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = downloadBtn.dataset.id;
            downloadPrototypeFromLibrary(id);
          });
        }
      });
    }
  }

function bindPrototypeLibraryControls(allPrototypes) {
  const applyFilter = () => {
    const searchInput = document.getElementById('prototypeLibrarySearch');
    const sortSelect = document.getElementById('prototypeLibrarySort');
    const searchText = (searchInput?.value || '').trim().toLowerCase();
    const sortValue = sortSelect?.value || 'createdAt_desc';
    
    let filtered = allPrototypes;
    if (searchText) {
      filtered = allPrototypes.filter(p =>
        (p.title || '').toLowerCase().includes(searchText) ||
        (p.description || '').toLowerCase().includes(searchText)
      );
    }
    
    // 排序
    const [field, order] = sortValue.split('_');
    filtered = [...filtered].sort((a, b) => {
      let cmp;
      if (field === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '', 'zh-CN');
      } else {
        cmp = (a.createdAt || 0) - (b.createdAt || 0);
      }
      return order === 'desc' ? -cmp : cmp;
    });
    
    renderPrototypeLibraryList(filtered);
  };
  
  const searchInput = document.getElementById('prototypeLibrarySearch');
  const sortSelect = document.getElementById('prototypeLibrarySort');
  
  if (searchInput) {
    const newSearch = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearch, searchInput);
    newSearch.addEventListener('input', applyFilter);
  }
  
  if (sortSelect) {
    const newSort = sortSelect.cloneNode(true);
    sortSelect.parentNode.replaceChild(newSort, sortSelect);
    newSort.addEventListener('change', applyFilter);
  }
}

export function hidePrototypeLibrary() {
  const modal = document.getElementById('prototypeLibraryModal');
  if (modal) {
    modal.classList.remove('show');
  }
  console.log('[SidePanel] 原型页面库已隐藏');
}

function continueOptimizeFromLibrary(prototypeId, title) {
  const userInput = document.getElementById('userInput');
  if (userInput) {
    userInput.value = `请帮我优化这个UI原型界面 ${prototypeId}（${title}），`;
    userInput.focus();
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';
  }
  
  console.log('[SidePanel] 从原型页面库继续优化原型:', prototypeId);
}

async function downloadPrototypeFromLibrary(prototypeId) {
  try {
    const prototype = await getUiPrototype(prototypeId);
    if (!prototype || !prototype.html) {
      console.error('[SidePanel] 下载原型失败：未找到原型', prototypeId);
      return;
    }
    
    const wrappedHtml = wrapPrototypeHtml(prototype.html);
    const blob = new Blob([wrappedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = (prototype.title || 'prototype').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_') + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('[SidePanel] 原型已从原型库下载:', a.download);
  } catch (err) {
    console.error('[SidePanel] 下载原型失败:', err);
  }
}

async function deletePrototypeItem(prototypeId, title) {
  const confirmed = await showConfirm(
    '确认删除',
    `确定删除原型 "${title}" 吗？此操作不可撤销。`,
    '删除'
  );
  
  if (!confirmed) return;
  
  try {
    // 删除前先获取原型数据，检查是否有本地文件
    const prototype = await getUiPrototype(prototypeId);
    
    await deleteUiPrototype(prototypeId);
    console.log('[SidePanel] 原型已删除:', prototypeId);

    // 级联删除本地文件
    if (prototype?.localPath) {
      chrome.runtime.sendMessage(
        { type: 'DELETE_LOCAL_PROTOTYPE', path: prototype.localPath },
        (response) => {
          if (response?.success) {
            console.log('[SidePanel] 本地原型文件已删除:', prototype.localPath);
          } else {
            console.warn('[SidePanel] 本地原型文件删除失败:', response?.error);
          }
        }
      );
    }

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

  const localOpenBtn = document.getElementById('prototypeLocalOpenBtn');
  if (localOpenBtn) {
    localOpenBtn.addEventListener('click', () => {
      const path = localOpenBtn.dataset.path;
      if (path) {
        chrome.runtime.sendMessage({ type: 'OPEN_LOCAL_PROTOTYPE', path }, (response) => {
          if (!response?.success) {
            console.error('[SidePanel] 本地浏览器打开失败:', response?.error);
          }
        });
      }
    });
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
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SHOW_UI_PROTOTYPE') {
      console.log('[SidePanel] 收到显示原型请求:', message);
      // 如果已在本地浏览器打开，不自动弹窗（用户可通过圆形按钮手动打开）
      if (!message.data.localOpened) {
        loadAndShowPrototype(message.data.prototypeId);
      } else {
        console.log('[SidePanel] 原型已在本地浏览器打开，跳过弹窗');
      }
      sendResponse({ success: true });
    }
  });
  
  console.log('[SidePanel] UI 原型模块事件已初始化');
}
