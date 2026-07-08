// image-preview.js - 图片预览、压缩、附件管理
// 从 chat-manager.js 提取

import state from './state.js';

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
  if (!overlay || !img) return;

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

  // 点击遮罩关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closePreview();
    }
  });

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

      let { width, height } = img;
      const maxDim = 1024;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedUrl = canvas.toDataURL('image/jpeg', 0.65);

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
    console.error('[ChatManager] 图片加载失败');
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
