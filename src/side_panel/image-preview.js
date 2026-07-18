// image-preview.js - 图片预览、压缩、附件管理
// 从 chat-manager.js 提取

import state from './state.js';
import logger from '../shared/logger.js';

// ============================================================
// 图片预览缩放/拖拽状态
// ============================================================

let previewScale = 1;
let previewTranslateX = 0;
let previewTranslateY = 0;
let previewIsDragging = false;
let previewDragStartX = 0;
let previewDragStartY = 0;
let previewDragStartTX = 0;
let previewDragStartTY = 0;

// 图片预览多图切换状态
let previewImageList = [];
let previewImageIndex = 0;

// ============================================================
// 图片编辑状态（画笔、矩形、椭圆、箭头、直线等工具）
// ============================================================

let isEditingMode = false;
let currentTool = 'brush';
let brushColor = '#ff4757';
let brushSize = 4;
let brushOpacity = 1;
let isDrawing = false;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;
let currentX = 0;
let currentY = 0;
let undoStack = [];
let editCanvas = null;
let editCtx = null;
let previewCanvas = null;
let previewCtx = null;

function downloadImage(dataUrl) {
  const link = document.createElement('a');
  link.href = dataUrl;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  link.download = `image_${timestamp}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function updatePreviewTransform() {
  const img = document.getElementById('imagePreviewLarge');
  if (!img) return;
  img.style.transform = `translate(${previewTranslateX}px, ${previewTranslateY}px) scale(${previewScale})`;
  if (previewScale > 1) {
    img.classList.add('zoomable');
    if (previewIsDragging) {
      img.classList.add('dragging');
    } else {
      img.classList.remove('dragging');
    }
  } else {
    img.classList.remove('zoomable', 'dragging');
  }
}

function resetPreviewTransform() {
  previewScale = 1;
  previewTranslateX = 0;
  previewTranslateY = 0;
  previewIsDragging = false;
  updatePreviewTransform();
}

export function openImagePreview(dataUrl, sourceElement) {
  const overlay = document.getElementById('imagePreviewOverlay');
  const img = document.getElementById('imagePreviewLarge');
  const editBtn = document.getElementById('imagePreviewEdit');
  if (!overlay || !img) return;

  // 判断来源：消息区图片不需要编辑按钮
  const isFromMessage = sourceElement && sourceElement.closest('.user-message-images');
  if (editBtn) {
    editBtn.style.display = isFromMessage ? 'none' : '';
  }

  // 根据来源分组收集图片
  collectPreviewImages(dataUrl, sourceElement);

  // 如果只有一张图，隐藏导航
  updatePreviewNavVisibility();
  showPreviewImage(dataUrl);
  overlay.classList.add('show');
}

/**
 * 收集同组图片的 dataUrl，构建预览列表
 * @param {string} currentDataUrl - 当前图片 dataUrl
 * @param {Element} [sourceElement] - 触发预览的元素，用于判断分组
 */
function collectPreviewImages(currentDataUrl, sourceElement) {
  previewImageList = [];

  if (sourceElement) {
    // 输入框缩略图：仅收集输入框预览区的图片
    if (sourceElement.closest('.image-preview-bar') || sourceElement.classList.contains('image-preview-thumb')) {
      document.querySelectorAll('.image-preview-thumb').forEach((thumb) => {
        if (thumb.src) previewImageList.push(thumb.src);
      });
    }
    // 消息图片：仅收集同一消息容器内的图片
    else if (sourceElement.closest('.user-message-images')) {
      const container = sourceElement.closest('.user-message-images');
      container.querySelectorAll('.user-message-image').forEach((img) => {
        if (img.src) previewImageList.push(img.src);
      });
    }
  }

  // 如果未匹配到分组，收集所有图片（兜底）
  if (previewImageList.length === 0) {
    document.querySelectorAll('.image-preview-thumb, .user-message-image').forEach((img) => {
      if (img.src) previewImageList.push(img.src);
    });
  }

  // 找到当前图片的索引
  previewImageIndex = previewImageList.indexOf(currentDataUrl);
  if (previewImageIndex === -1) {
    previewImageList.push(currentDataUrl);
    previewImageIndex = previewImageList.length - 1;
  }
}

/**
 * 更新预览导航按钮可见性
 */
function updatePreviewNavVisibility() {
  const prevBtn = document.getElementById('imagePreviewPrev');
  const nextBtn = document.getElementById('imagePreviewNext');
  const counter = document.getElementById('imagePreviewCounter');

  if (previewImageList.length <= 1) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    if (counter) counter.style.display = 'none';
  } else {
    if (prevBtn) prevBtn.style.display = '';
    if (nextBtn) nextBtn.style.display = '';
    if (counter) counter.style.display = '';
    updatePreviewNavButtons();
  }
}

/**
 * 更新预览导航按钮状态和计数
 */
function updatePreviewNavButtons() {
  const prevBtn = document.getElementById('imagePreviewPrev');
  const nextBtn = document.getElementById('imagePreviewNext');
  const counter = document.getElementById('imagePreviewCounter');

  // 首尾循环，按钮始终可用
  if (prevBtn) prevBtn.disabled = false;
  if (nextBtn) nextBtn.disabled = false;
  if (counter) {
    counter.textContent = `${previewImageIndex + 1} / ${previewImageList.length}`;
  }
}

/**
 * 显示指定索引的图片
 */
function showPreviewImage(dataUrl) {
  const img = document.getElementById('imagePreviewLarge');
  if (!img) return;
  resetPreviewTransform();
  img.src = dataUrl;
}

/**
 * 切换到上一张/下一张（首尾循环）
 */
function navigatePreview(direction) {
  const total = previewImageList.length;
  if (total === 0) return;
  previewImageIndex = (previewImageIndex + direction + total) % total;
  showPreviewImage(previewImageList[previewImageIndex]);
  updatePreviewNavButtons();
}

/**
 * 初始化图片预览弹窗事件（一次性设置）
 */
export function initImagePreviewOverlay() {
  const overlay = document.getElementById('imagePreviewOverlay');
  if (!overlay || overlay.dataset.initialized) return;
  overlay.dataset.initialized = 'true';

  const img = document.getElementById('imagePreviewLarge');
  const closePreview = () => {
    overlay.classList.remove('show');
    resetPreviewTransform();
  };



  // 关闭按钮
  const closeBtn = overlay.querySelector('.image-preview-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closePreview);
  }

  // 下载按钮
  const downloadBtn = document.getElementById('imagePreviewDownload');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const img = document.getElementById('imagePreviewLarge');
      if (img && img.src) {
        downloadImage(img.src);
      }
    });
  }

  // 编辑按钮
  const editBtn = document.getElementById('imagePreviewEdit');
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEditingMode();
    });
  }

  // 上一张/下一张按钮
  const prevBtn = document.getElementById('imagePreviewPrev');
  const nextBtn = document.getElementById('imagePreviewNext');
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigatePreview(-1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigatePreview(1);
    });
  }

  // 键盘导航
  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('show')) return;
    if (e.key === 'Escape') {
      closePreview();
    } else if (e.key === 'ArrowLeft') {
      navigatePreview(-1);
    } else if (e.key === 'ArrowRight') {
      navigatePreview(1);
    }
  });

  // 滚轮缩放
  overlay.addEventListener('wheel', (e) => {
    if (!overlay.classList.contains('show')) return;
    if (isEditingMode) return;
    e.preventDefault();
    const rect = img.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    const oldScale = previewScale;
    const newScale = Math.max(0.3, Math.min(5, previewScale + delta));

    // 以鼠标位置为中心缩放
    const scaleRatio = newScale / oldScale;
    previewScale = newScale;
    previewTranslateX = mouseX - scaleRatio * (mouseX - previewTranslateX);
    previewTranslateY = mouseY - scaleRatio * (mouseY - previewTranslateY);
    updatePreviewTransform();
  }, { passive: false });

  // 拖拽平移
  img.addEventListener('mousedown', (e) => {
    if (isEditingMode) return;
    if (!overlay.classList.contains('show') || previewScale <= 1) return;
    e.preventDefault();
    previewIsDragging = true;
    previewDragStartX = e.clientX;
    previewDragStartY = e.clientY;
    previewDragStartTX = previewTranslateX;
    previewDragStartTY = previewTranslateY;
    updatePreviewTransform();
  });

  document.addEventListener('mousemove', (e) => {
    if (!previewIsDragging) return;
    previewTranslateX = previewDragStartTX + (e.clientX - previewDragStartX);
    previewTranslateY = previewDragStartTY + (e.clientY - previewDragStartY);
    updatePreviewTransform();
  });

  document.addEventListener('mouseup', () => {
    if (!previewIsDragging) return;
    previewIsDragging = false;
    updatePreviewTransform();
  });

  // 双击切换 1x / 2x
  img.addEventListener('dblclick', () => {
    if (isEditingMode) return;
    if (!overlay.classList.contains('show')) return;
    if (previewScale > 1) {
      resetPreviewTransform();
    } else {
      previewScale = 2;
      previewTranslateX = 0;
      previewTranslateY = 0;
      updatePreviewTransform();
    }
  });

  initImageEditor();
}

/**
 * 根据图片原始尺寸计算动态压缩参数
 * AI 识别推荐尺寸：1024-1536 像素，质量 0.70-0.85 即可满足识别需求
 * @param {number} width - 原始宽度
 * @param {number} height - 原始高度
 * @returns {Object} 包含 targetWidth, targetHeight, quality 的压缩参数
 */
function calculateCompressionParams(width, height) {
  const maxDimension = Math.max(width, height);
  
  let targetMaxDim, quality;
  
  if (maxDimension <= 1280) {
    targetMaxDim = maxDimension;
    quality = 0.85;
  } else if (maxDimension <= 2560) {
    targetMaxDim = 1280;
    quality = 0.80;
  } else if (maxDimension <= 3840) {
    targetMaxDim = 1536;
    quality = 0.75;
  } else {
    targetMaxDim = 1920;
    quality = 0.70;
  }
  
  let targetWidth = width;
  let targetHeight = height;
  
  if (maxDimension > targetMaxDim) {
    if (width > height) {
      targetHeight = Math.round(height * (targetMaxDim / width));
      targetWidth = targetMaxDim;
    } else {
      targetWidth = Math.round(width * (targetMaxDim / height));
      targetHeight = targetMaxDim;
    }
  }
  
  return { targetWidth, targetHeight, quality };
}

/**
 * 压缩图片并通过 canvas 转为 Base64，然后附加到 state.attachedImages
 * @param {Blob} blob - 原始图片 Blob
 */
export function compressAndAttachImage(blob) {
  const img = new Image();
  const url = URL.createObjectURL(blob);

  img.onload = () => {
    URL.revokeObjectURL(url);

    const reader = new FileReader();
    reader.onloadend = () => {
      const originalUrl = reader.result;

      const { width: originalWidth, height: originalHeight } = img;
      const { targetWidth, targetHeight, quality } = calculateCompressionParams(originalWidth, originalHeight);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      const compressedUrl = canvas.toDataURL('image/jpeg', quality);

      state.attachedImages.push({ originalUrl, compressedUrl });

      const previewBar = document.getElementById('imagePreviewBar');
      const userInput = document.getElementById('userInput');
      if (previewBar) previewBar.style.display = '';

      renderImagePreviewsFromChat();

      if (userInput) userInput.focus();
    };
    reader.readAsDataURL(blob);
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    logger.error('[ChatManager] 图片加载失败');
  };

  img.src = url;
}

/**
 * 从 chat-manager 上下文渲染图片预览
 */
export function renderImagePreviewsFromChat() {
  const previewBar = document.getElementById('imagePreviewBar');
  if (!previewBar) return;

  previewBar.innerHTML = '';

  if (state.attachedImages.length === 0) {
    previewBar.style.display = 'none';
    return;
  }
  previewBar.style.display = '';

  state.attachedImages.forEach((img, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'image-preview-item';

    const thumb = document.createElement('img');
    thumb.src = img.originalUrl || img.dataUrl;
    thumb.className = 'image-preview-thumb';
    thumb.title = '点击查看大图';
    thumb.style.cursor = 'zoom-in';
    thumb.addEventListener('click', () => {
      openImagePreview(img.originalUrl || img.dataUrl, thumb);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'image-preview-remove';
    removeBtn.innerHTML = '×';
    removeBtn.title = '移除图片';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.attachedImages.splice(index, 1);
      renderImagePreviewsFromChat();
    });

    wrapper.appendChild(thumb);
    wrapper.appendChild(removeBtn);
    previewBar.appendChild(wrapper);
  });
}

/**
 * 构建用户消息 content，当有图片附件时返回数组格式
 * @param {string} text - 纯文本内容
 * @returns {string|Array} content 字段值
 */
export function buildUserContent(text) {
  if (!state.enableImageInput || state.attachedImages.length === 0) {
    return text;
  }

  const parts = [{ type: 'text', text: text }];
  for (const img of state.attachedImages) {
    parts.push({
      type: 'image_url',
      image_url: { url: img.compressedUrl || img.dataUrl }
    });
  }

  return parts;
}

/**
 * 从消息 content 中移除图片数据，仅保留文本部分
 * 用于发送历史消息时避免携带已无用的 Base64 图片
 * @param {string|Array} content - 消息内容
 * @returns {string|Array} 仅含文本的内容
 */
export function stripImagesFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textParts = content.filter(c => c.type === 'text');
    return textParts.length === 1 ? textParts[0].text : textParts;
  }
  return content;
}

// ============================================================
// 图片编辑功能实现
// ============================================================

function initImageEditor() {
  editCanvas = document.getElementById('imagePreviewEditCanvas');
  previewCanvas = document.getElementById('imagePreviewPreviewCanvas');
  
  if (editCanvas) {
    editCtx = editCanvas.getContext('2d', { willReadFrequently: true });
    editCtx.lineCap = 'round';
    editCtx.lineJoin = 'round';
  }
  
  if (previewCanvas) {
    previewCtx = previewCanvas.getContext('2d', { willReadFrequently: true });
    previewCtx.lineCap = 'round';
    previewCtx.lineJoin = 'round';
  }
  
  setupEditorToolbar();
  
  const img = document.getElementById('imagePreviewLarge');
  if (img) {
    img.addEventListener('load', syncCanvasSize);
  }
}

function setupEditorToolbar() {
  const toolbar = document.getElementById('imagePreviewEditorToolbar');
  if (!toolbar) return;
  
  toolbar.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      toolbar.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = btn.dataset.tool;
      
      if (editCanvas) {
        editCanvas.style.cursor = currentTool === 'eraser' ? 'cell' : 'crosshair';
      }
    });
  });
  
  const colorPicker = document.getElementById('editorColorPicker');
  if (colorPicker) {
    colorPicker.addEventListener('input', (e) => {
      brushColor = e.target.value;
    });
  }
  
  const brushSizeInput = document.getElementById('editorBrushSize');
  if (brushSizeInput) {
    brushSizeInput.addEventListener('input', (e) => {
      brushSize = parseInt(e.target.value);
    });
  }
  
  const undoBtn = document.getElementById('editorUndoBtn');
  if (undoBtn) {
    undoBtn.addEventListener('click', undo);
  }
  
  const confirmBtn = document.getElementById('editorConfirmBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', confirmAnnotation);
  }
  
  const cancelBtn = document.getElementById('editorCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelAnnotation);
  }
  
  document.addEventListener('keydown', (e) => {
    if (!isEditingMode) return;
    
    const keyMap = {
      'b': 'brush',
      'r': 'rectangle',
      'e': 'ellipse',
      'a': 'arrow',
      'l': 'line'
    };
    
    if (keyMap[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      currentTool = keyMap[e.key.toLowerCase()];
      toolbar.querySelectorAll('[data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === currentTool);
      });
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    }
    
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmAnnotation();
    }
    
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelAnnotation();
    }
  });
}

function toggleEditingMode() {
  if (isEditingMode) {
    exitEditingMode();
  } else {
    enterEditingMode();
  }
}

function enterEditingMode() {
  isEditingMode = true;
  undoStack = [];
  
  const img = document.getElementById('imagePreviewLarge');
  if (!img || !img.src) return;
  
  resetPreviewTransform();
  
  img.style.transform = 'none';
  previewScale = 1;
  previewTranslateX = 0;
  previewTranslateY = 0;
  
  img.style.pointerEvents = 'none';
  img.style.zIndex = '1';
  
  if (editCanvas) {
    editCanvas.style.display = 'block';
    editCanvas.style.pointerEvents = 'auto';
    editCanvas.style.zIndex = '5';
  }
  if (previewCanvas) {
    previewCanvas.style.display = 'block';
    previewCanvas.style.pointerEvents = 'none';
    previewCanvas.style.zIndex = '6';
  }
  
  const toolbar = document.getElementById('imagePreviewEditorToolbar');
  if (toolbar) toolbar.style.display = 'flex';
  
  const editBtn = document.getElementById('imagePreviewEdit');
  if (editBtn) editBtn.style.display = 'none';
  
  const downloadBtn = document.getElementById('imagePreviewDownload');
  if (downloadBtn) downloadBtn.style.display = 'none';
  
  const viewport = document.getElementById('imagePreviewViewport');
  if (viewport) {
    viewport.addEventListener('contextmenu', preventContextMenu);
  }
  
  setTimeout(() => {
    syncCanvasSize();
  }, 50);
  
  undoStack = [];
  
  if (editCanvas) {
    editCanvas.addEventListener('mousedown', startDrawing);
  }
  
  document.addEventListener('mousemove', draw);
  document.addEventListener('mouseup', stopDrawing);
}

function preventContextMenu(e) {
  e.preventDefault();
}

function exitEditingMode() {
  isEditingMode = false;
  isDrawing = false;
  
  const img = document.getElementById('imagePreviewLarge');
  if (img) {
    img.style.pointerEvents = '';
    img.style.zIndex = '';
  }
  
  if (editCanvas) {
    editCanvas.style.display = 'none';
    editCanvas.removeEventListener('mousedown', startDrawing);
  }
  
  if (previewCanvas) {
    previewCanvas.style.display = 'none';
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  }
  
  const toolbar = document.getElementById('imagePreviewEditorToolbar');
  if (toolbar) toolbar.style.display = 'none';
  
  const editBtn = document.getElementById('imagePreviewEdit');
  if (editBtn) editBtn.style.display = '';
  
  const downloadBtn = document.getElementById('imagePreviewDownload');
  if (downloadBtn) downloadBtn.style.display = '';
  
  const viewport = document.getElementById('imagePreviewViewport');
  if (viewport) {
    viewport.removeEventListener('contextmenu', preventContextMenu);
  }
  
  document.removeEventListener('mousemove', draw);
  document.removeEventListener('mouseup', stopDrawing);
}

function syncCanvasSize() {
  const img = document.getElementById('imagePreviewLarge');
  const viewport = document.getElementById('imagePreviewViewport');
  
  if (!img || !viewport || !editCanvas || !previewCanvas) return;
  
  const imgRect = img.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  
  const canvasWidth = Math.round(imgRect.width);
  const canvasHeight = Math.round(imgRect.height);
  
  editCanvas.width = canvasWidth;
  editCanvas.height = canvasHeight;
  editCanvas.style.width = canvasWidth + 'px';
  editCanvas.style.height = canvasHeight + 'px';
  editCanvas.style.left = (viewportRect.width - canvasWidth) / 2 + 'px';
  editCanvas.style.top = (viewportRect.height - canvasHeight) / 2 + 'px';
  
  previewCanvas.width = canvasWidth;
  previewCanvas.height = canvasHeight;
  previewCanvas.style.width = canvasWidth + 'px';
  previewCanvas.style.height = canvasHeight + 'px';
  previewCanvas.style.left = (viewportRect.width - canvasWidth) / 2 + 'px';
  previewCanvas.style.top = (viewportRect.height - canvasHeight) / 2 + 'px';
}

function getCanvasCoordinates(e) {
  if (!editCanvas) return { x: 0, y: 0 };
  
  const rect = editCanvas.getBoundingClientRect();
  
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function startDrawing(e) {
  if (!isEditingMode) return;
  e.preventDefault();
  
  isDrawing = true;
  const coords = getCanvasCoordinates(e);
  startX = coords.x;
  startY = coords.y;
  lastX = coords.x;
  lastY = coords.y;
  currentX = coords.x;
  currentY = coords.y;
  
  undoStack.push(editCanvas.toDataURL());
  if (undoStack.length > 20) {
    undoStack.shift();
  }
}

function draw(e) {
  if (!isDrawing || !isEditingMode) return;
  e.preventDefault();
  
  const coords = getCanvasCoordinates(e);
  currentX = coords.x;
  currentY = coords.y;
  
  if (currentTool === 'brush') {
    editCtx.save();
    editCtx.beginPath();
    editCtx.strokeStyle = brushColor;
    editCtx.lineWidth = brushSize;
    editCtx.globalAlpha = brushOpacity;
    editCtx.lineCap = 'round';
    editCtx.lineJoin = 'round';
    
    const dx = currentX - lastX;
    const dy = currentY - lastY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 2) {
      const steps = Math.ceil(distance);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = lastX + dx * t;
        const y = lastY + dy * t;
        if (i === 1) {
          editCtx.moveTo(lastX, lastY);
        }
        editCtx.lineTo(x, y);
      }
    } else {
      editCtx.moveTo(lastX, lastY);
      editCtx.lineTo(currentX, currentY);
    }
    
    editCtx.stroke();
    editCtx.restore();
    
    lastX = currentX;
    lastY = currentY;
  } else if (currentTool === 'eraser') {
    editCtx.save();
    editCtx.beginPath();
    editCtx.lineWidth = brushSize * 2;
    editCtx.lineCap = 'round';
    editCtx.lineJoin = 'round';
    editCtx.globalCompositeOperation = 'destination-out';
    
    const dx = currentX - lastX;
    const dy = currentY - lastY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 2) {
      const steps = Math.ceil(distance);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = lastX + dx * t;
        const y = lastY + dy * t;
        if (i === 1) {
          editCtx.moveTo(lastX, lastY);
        }
        editCtx.lineTo(x, y);
      }
    } else {
      editCtx.moveTo(lastX, lastY);
      editCtx.lineTo(currentX, currentY);
    }
    
    editCtx.stroke();
    editCtx.restore();
    
    lastX = currentX;
    lastY = currentY;
  } else {
    if (!previewCtx) return;
    
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.strokeStyle = brushColor;
    previewCtx.lineWidth = brushSize;
    previewCtx.globalAlpha = brushOpacity;
    previewCtx.lineCap = 'round';
    previewCtx.lineJoin = 'round';
    
    switch (currentTool) {
      case 'rectangle':
        drawRectangle();
        break;
      case 'ellipse':
        drawEllipse();
        break;
      case 'arrow':
        drawArrow();
        break;
      case 'line':
        drawLine();
        break;
    }
  }
}

function stopDrawing() {
  if (!isDrawing) return;
  isDrawing = false;
  
  if (currentTool !== 'brush' && currentTool !== 'eraser' && previewCtx) {
    editCtx.drawImage(previewCanvas, 0, 0);
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  }
}

function drawRectangle() {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  
  if (event.shiftKey) {
    const size = Math.max(width, height);
    const startXAdjusted = currentX > startX ? startX : startX - size;
    const startYAdjusted = currentY > startY ? startY : startY - size;
    previewCtx.strokeRect(startXAdjusted, startYAdjusted, size, size);
  } else {
    previewCtx.strokeRect(x, y, width, height);
  }
}

function drawEllipse() {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  
  if (event.shiftKey) {
    const size = Math.max(width, height);
    const startXAdjusted = currentX > startX ? startX : startX - size;
    const startYAdjusted = currentY > startY ? startY : startY - size;
    previewCtx.beginPath();
    previewCtx.ellipse(startXAdjusted + size / 2, startYAdjusted + size / 2, size / 2, size / 2, 0, 0, Math.PI * 2);
    previewCtx.stroke();
  } else {
    previewCtx.beginPath();
    previewCtx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    previewCtx.stroke();
  }
}

function drawArrow() {
  const angle = Math.atan2(currentY - startY, currentX - startX);
  const headLength = 12;
  
  previewCtx.beginPath();
  previewCtx.moveTo(startX, startY);
  previewCtx.lineTo(currentX, currentY);
  previewCtx.stroke();
  
  previewCtx.beginPath();
  previewCtx.moveTo(currentX, currentY);
  previewCtx.lineTo(
    currentX - headLength * Math.cos(angle - Math.PI / 6),
    currentY - headLength * Math.sin(angle - Math.PI / 6)
  );
  previewCtx.moveTo(currentX, currentY);
  previewCtx.lineTo(
    currentX - headLength * Math.cos(angle + Math.PI / 6),
    currentY - headLength * Math.sin(angle + Math.PI / 6)
  );
  previewCtx.stroke();
}

function drawLine() {
  previewCtx.beginPath();
  previewCtx.moveTo(startX, startY);
  previewCtx.lineTo(currentX, currentY);
  previewCtx.stroke();
}

function undo() {
  if (undoStack.length === 0) return;
  
  const lastState = undoStack.pop();
  const img = new Image();
  img.onload = () => {
    try {
      editCtx.clearRect(0, 0, editCanvas.width, editCanvas.height);
      editCtx.drawImage(img, 0, 0, editCanvas.width, editCanvas.height);
    } catch (e) {
      logger.error('Undo failed:', e);
    }
  };
  img.onerror = () => {
    logger.error('Failed to load undo image');
    if (undoStack.length > 0) {
      undo();
    }
  };
  img.src = lastState;
}

function confirmAnnotation() {
  const img = document.getElementById('imagePreviewLarge');
  const overlay = document.getElementById('imagePreviewOverlay');
  if (!img || !editCanvas) return;
  
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = img.naturalWidth;
  compositeCanvas.height = img.naturalHeight;
  const ctx = compositeCanvas.getContext('2d', { willReadFrequently: true });
  
  ctx.drawImage(img, 0, 0);
  
  const scaleX = img.naturalWidth / editCanvas.width;
  const scaleY = img.naturalHeight / editCanvas.height;
  ctx.save();
  ctx.scale(scaleX, scaleY);
  ctx.drawImage(editCanvas, 0, 0);
  ctx.restore();
  
  const annotatedUrl = compositeCanvas.toDataURL('image/jpeg', 0.85);
  
  updateAnnotatedImage(annotatedUrl);
  
  exitEditingMode();
  
  overlay.classList.remove('show');
  resetPreviewTransform();
}

function updateAnnotatedImage(annotatedUrl) {
  const currentUrl = document.getElementById('imagePreviewLarge').src;
  
  const imgIndex = state.attachedImages.findIndex(
    img => img.originalUrl === currentUrl || img.compressedUrl === currentUrl
  );
  
  if (imgIndex !== -1) {
    state.attachedImages[imgIndex] = {
      originalUrl: annotatedUrl,
      compressedUrl: annotatedUrl
    };
    
    renderImagePreviewsFromChat();
  }
  
  const img = document.getElementById('imagePreviewLarge');
  if (img) img.src = annotatedUrl;
}

function cancelAnnotation() {
  if (editCtx) {
    editCtx.clearRect(0, 0, editCanvas.width, editCanvas.height);
  }
  undoStack = [];
  exitEditingMode();
}
