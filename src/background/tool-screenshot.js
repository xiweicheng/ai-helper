// background/tool-screenshot.js - 截图下载工具

import logger from '../shared/logger.js';

/**
 * 触发截图下载
 */
export function triggerScreenshotDownload(dataUrl, format) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `screenshot_${timestamp}.${format === 'png' ? 'png' : 'jpg'}`;

  chrome.downloads.download({
    url: dataUrl,
    filename: 'Downloads/' + fileName,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      logger.error('[Background] 下载失败:', chrome.runtime.lastError.message);
    } else {
      logger.debug('[Background] 截图已触发下载，ID:', downloadId, '文件名:', fileName);
    }
  });
}
