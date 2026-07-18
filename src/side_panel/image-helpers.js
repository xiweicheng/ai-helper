// side_panel/image-helpers.js - 图片辅助函数
// 从 index.js 拆分，包含图片预览、截图、裁剪等功能
import state from './state.js';
import { showToast, getCurrentActiveTabId } from './utils.js';
import { clearFiles } from './file-extract.js';
import { openImagePreview, compressAndAttachImage } from './chat-manager.js';
import logger from '../shared/logger.js';

/**
 * 更新图片预览区可见性
 */
export function updateImagePreviewVisibility() {
  const previewBar = document.getElementById('imagePreviewBar');
  const screenshotBtn = document.getElementById('screenshotBtn');
  // 预览区仅在有图片时显示
  if (previewBar) {
    previewBar.style.display = state.attachedImages.length > 0 ? '' : 'none';
  }
  if (screenshotBtn) {
    if (state.enableImageInput) {
      screenshotBtn.style.removeProperty('display');
    } else {
      screenshotBtn.style.display = 'none';
    }
  }
  // 根据右侧按钮可见情况，动态调整 textarea 的 padding-right
  updateTextareaPadding();

  // 如果关闭了图片功能，清空已附加的图片
  if (!state.enableImageInput) {
    state.attachedImages = [];
  }
  renderImagePreviews();
}

/**
 * 根据右侧按钮可见情况，动态调整 textarea 的 padding-right
 */
export function updateTextareaPadding() {
  const userInput = document.getElementById('userInput');
  if (!userInput) return;
  let rightPadding = 44; // 发送按钮(32) + 右侧间距(8) + 内边距(4)
  if (state.enableImageInput) rightPadding += 32; // 截图按钮(32)
  if (state.enableFileInput) rightPadding += 32; // 文件上传按钮(32)
  userInput.style.paddingRight = rightPadding + 'px';
}

/**
 * 更新文件上传按钮可见性
 */
export function updateFileInputVisibility() {
  const fileAttachBtn = document.getElementById('fileAttachBtn');
  const fileInput = document.getElementById('fileInput');
  if (fileAttachBtn) {
    fileAttachBtn.style.display = state.enableFileInput ? '' : 'none';
  }
  // Agent 连接时放开所有文件格式，未连接时限制为浏览器可提取格式
  if (fileInput) {
    if (state.agentPlatform?.connected) {
      fileInput.accept = '*';
      fileAttachBtn && (fileAttachBtn.title = '上传文件到Agent工作目录，大模型通过工具直接操作');
    } else {
      fileInput.accept = '.pdf,.docx,.xlsx,.xls,.txt,.md,.json,.js,.jsx,.ts,.tsx,.html,.css,.scss,.less,.xml,.yaml,.yml,.py,.java,.c,.cpp,.h,.go,.rs,.rb,.php,.sql,.sh,.bash,.zsh,.cfg,.ini,.toml,.conf,.log,.csv,.tsv,.env,.vue,.svelte,.astro,.rtf';
      fileAttachBtn && (fileAttachBtn.title = '上传文件并提取文本内容（支持PDF/Word/Excel/文本等）');
    }
  }
  updateTextareaPadding();
  // 如果关闭了文件功能，清空已附加的文件
  if (!state.enableFileInput) {
    clearFiles();
  }
}

/**
 * 渲染图片预览缩略图
 */
export function renderImagePreviews() {
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
    thumb.src = img.dataUrl;
    thumb.className = 'image-preview-thumb';
    thumb.title = '点击查看大图';
    thumb.style.cursor = 'zoom-in';
    thumb.addEventListener('click', () => {
      openImagePreview(img.dataUrl, thumb);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'image-preview-remove';
    removeBtn.innerHTML = '×';
    removeBtn.title = '移除图片';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.attachedImages.splice(index, 1);
      renderImagePreviews();
    });

    wrapper.appendChild(thumb);
    wrapper.appendChild(removeBtn);
    previewBar.appendChild(wrapper);
  });
}

/**
 * 全页面截图：截取整个可见标签页
 */
export async function captureFullPageScreenshot() {
  if (!state.enableImageInput) {
    showToast('请先开启图片输入功能');
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' });
    if (response?.dataUrl) {
      const res = await fetch(response.dataUrl);
      const blob = await res.blob();
      compressAndAttachImage(blob);
      showToast('截图成功');
    }
  } catch (err) {
    logger.error('[SidePanel] 全页面截图失败:', err);
    showToast('截图失败，请重试');
  }
}

/**
 * 区域截图：先让用户在活跃标签页上拖拽选择区域，再截取并裁剪
 */
export async function captureRegionScreenshot() {
  const tabId = await getCurrentActiveTabId();
  if (!tabId) {
    showToast('无法获取当前标签页');
    return;
  }

  try {
    // 向 content script 发送消息，启动区域选择
    const rect = await chrome.tabs.sendMessage(tabId, { type: 'START_REGION_SELECTION' });

    if (!rect) {
      // 用户取消或区域太小
      return;
    }

    logger.debug('[SidePanel] 区域选择结果:', rect);

    // 先截取整个可见区域
    const capResponse = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' });
    if (!capResponse?.dataUrl) {
      showToast('截图失败，请重试');
      return;
    }

    // 裁剪图片
    const croppedDataUrl = await cropImage(capResponse.dataUrl, rect);
    if (!croppedDataUrl) {
      showToast('裁剪失败，请重试');
      return;
    }

    // 转为 blob 并附加
    const res = await fetch(croppedDataUrl);
    const blob = await res.blob();
    compressAndAttachImage(blob);
  } catch (err) {
    logger.error('[SidePanel] 区域截图失败:', err);
    showToast('区域截图失败，请确保页面已加载且未被浏览器限制');
  }
}

/**
 * 使用 Canvas 裁剪图片
 * @param {string} dataUrl - 原始图片 data URL
 * @param {{x, y, width, height}} rect - 裁剪区域（视口坐标）
 * @returns {Promise<string>} 裁剪后的 data URL
 */
export function cropImage(dataUrl, rect) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // 考虑 devicePixelRatio
      const dpr = window.devicePixelRatio || 1;
      const sx = rect.x * dpr;
      const sy = rect.y * dpr;
      const sw = rect.width * dpr;
      const sh = rect.height * dpr;

      canvas.width = sw;
      canvas.height = sh;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}

/**
 * 处理页面快捷键截图结果
 */
export async function handlePageScreenshotResult(dataUrl, mode, rect) {
  if (!state.enableImageInput) {
    showToast('请先开启图片输入功能');
    return;
  }
  try {
    let finalDataUrl = dataUrl;
    if (mode === 'region' && rect) {
      finalDataUrl = await cropImage(dataUrl, rect);
    }
    const res = await fetch(finalDataUrl);
    const blob = await res.blob();
    compressAndAttachImage(blob);
    showToast('截图成功');
  } catch (err) {
    logger.error('[SidePanel] 页面快捷键截图处理失败:', err);
    showToast('截图处理失败，请重试');
  }
}
