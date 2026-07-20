// background/tool-screenshot.js - 截图工具
// 从 tool-executor.js 拆分，包含 capture_page / fullpage 截图、视觉分析、截图下载等工具实现

import logger from '../shared/logger.js';
import { makeResult } from './tool-helpers.js';


// ==================== 常量 ====================
const MAX_EMULATION_HEIGHT = 8192;
const STITCH_OVERLAP = 60;  // 分片之间的重叠像素，避免边界遗漏

/**
 * 执行页面截图工具
 * 支持四种模式：download（下载）、analyze（视觉分析）、both（下载+分析）、fullpage（全页截图）
 * action 参数的可用选项会根据 enableImageInput 开关动态变化
 */
export async function executeCapturePage(args, toolCallId, sessionId = null) {
  const {
    action = 'both',
    tabId,
    format = 'jpeg',
    quality = 60,
    visionMaxDim = 1024,
    visionQuality = 65
  } = args;

  // fullpage 模式委托给 executeTakeFullPageScreenshot
  if (action === 'fullpage') {
    return executeTakeFullPageScreenshot({ format, quality }, toolCallId);
  }

  try {
    let targetTabId;
    let targetWindowId;
    let targetUrl = '';
    let targetTitle = '';

    if (tabId) {
      try {
        const tab = await chrome.tabs.get(tabId);
        targetTabId = tab.id;
        targetWindowId = tab.windowId;
        targetUrl = tab.url || '';
        targetTitle = tab.title || '';
        await chrome.tabs.update(targetTabId, { active: true });
        await new Promise(r => setTimeout(r, 300));
      } catch {
        return makeResult(false, `标签页 ${tabId} 不存在或无法访问`, { tool_call_id: toolCallId });
      }
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs.length) {
        return makeResult(false, '无法获取当前标签页', { tool_call_id: toolCallId });
      }
      targetTabId = tabs[0].id;
      targetWindowId = tabs[0].windowId;
      targetUrl = tabs[0].url || '';
      targetTitle = tabs[0].title || '';
    }

    logger.debug('[Background] 执行截图: tabId=', targetTabId, 'url=', targetUrl, 'action=', action,
      'format=', format, 'quality=', quality, 'visionMaxDim=', visionMaxDim, 'visionQuality=', visionQuality);

    const dataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(
        targetWindowId,
        { format, quality },
        (capturedDataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(capturedDataUrl);
          }
        }
      );
    });

    const sizeKB = (dataUrl.length / 1024).toFixed(1);
    logger.debug('[Background] 截图完成，大小:', sizeKB, 'KB');

    // 存储截图供 side_panel 展示
    chrome.storage.local.set({ _lastVisionScreenshot: { dataUrl, sizeKB, url: targetUrl, title: targetTitle, timestamp: Date.now() } }).catch(() => {});

    // 根据 action 执行不同操作
    const needDownload = (action === 'download' || action === 'both');
    const needAnalyze = (action === 'analyze' || action === 'both');

    if (needDownload) {
      triggerScreenshotDownload(dataUrl, format);
    }

    if (needAnalyze) {
      // 使用大模型指定的参数压缩截图
      const compressedDataUrl = await compressImageForVision(dataUrl, visionMaxDim, visionQuality / 100);
      const compressedKB = (compressedDataUrl.length / 1024).toFixed(1);
      logger.debug('[Background] 截图压缩后大小:', compressedKB, 'KB (maxDim:', visionMaxDim, 'quality:', visionQuality, ')');

      // 调用图片识别 API 对压缩后的截图进行视觉分析
      const visionResult = await analyzeScreenshotWithVision(compressedDataUrl, targetUrl, targetTitle, sessionId);

      if (needDownload) {
        // both 模式：下载 + 分析
        return makeResult(true, `截图已下载到本地（${sizeKB} KB）。\n\n${visionResult}`, { tool_call_id: toolCallId });
      }
      return makeResult(true, visionResult, { tool_call_id: toolCallId });
    }

    // 纯 download 模式
    const imageSizeMB = (dataUrl.length / 1024 / 1024).toFixed(2);
    const fmt = format === 'png' ? 'png' : 'jpg';
    return makeResult(true, `截图成功！\n图片大小约 ${imageSizeMB} MB\n格式: ${fmt}\n质量: ${quality}\n截图已自动下载到浏览器默认下载目录`, { tool_call_id: toolCallId });
  } catch (err) {
    return makeResult(false, `截图失败: ${err.message}`, { tool_call_id: toolCallId });
  }
}

/**
 * 压缩图片用于视觉分析
 */
async function compressImageForVision(dataUrl, maxDim = 1024, jpegQuality = 0.65) {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    let { width, height } = bitmap;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round(height * (maxDim / width));
        width = maxDim;
      } else {
        width = Math.round(width * (maxDim / height));
        height = maxDim;
      }
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const compressedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(compressedBlob);
    });
  } catch (err) {
    logger.warn('[Background] 图片压缩失败，使用原始截图:', err.message);
    return dataUrl;
  }
}

/**
 * 调用图片识别 API 对截图进行视觉分析
 * 返回文本描述结果
 */
async function analyzeScreenshotWithVision(dataUrl, pageUrl, pageTitle, sessionId = null) {
  // 读取图片识别配置（独立 API 端点、Key、模型）+ 流式开关
  const visionConfig = await new Promise((resolve) => {
    chrome.storage.local.get(['imageApiBase', 'imageApiKey', 'imageModelName', 'apiBase', 'apiKey', 'modelName', 'streamEnabled'], resolve);
  });

  const apiBase = visionConfig.imageApiBase || visionConfig.apiBase;
  const apiKey = visionConfig.imageApiKey || visionConfig.apiKey;
  const model = visionConfig.imageModelName || visionConfig.modelName;
  const useStream = visionConfig.streamEnabled !== false; // 默认 true

  if (!apiBase || !apiKey) {
    logger.debug('[Background] 图片识别 API 未配置，返回截图基本信息');
    return `页面截图已获取。\n\n- 页面标题: ${pageTitle}\n- 页面地址: ${pageUrl}\n\n请根据页面 URL 和标题信息进行分析。如需启用图片识别分析，请在设置页面配置图片识别 API。`;
  }

  logger.debug('[Background] 调用图片识别 API 分析截图，模型:', model, '端点:', apiBase, '流式:', useStream);

  const visionPrompt = `请详细描述这张网页截图的内容，包括：
1. 页面整体布局和主要区块
2. 可见的文本内容（标题、段落、按钮文字等）
3. UI 元素（导航栏、按钮、输入框、表格、图片等）
4. 页面的视觉状态和风格
5. 如有明显错误、异常或问题，请指出

截图来源: ${pageTitle} (${pageUrl})`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const fetchBody = {
      model: model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: visionPrompt },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } }
        ]
      }],
      max_tokens: 2000
    };

    // 根据流式开关决定是否启用 stream
    if (useStream) {
      fetchBody.stream = true;
    }

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(fetchBody),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger.error('[Background] 图片识别 API 请求失败:', response.status, errorText);
      return `页面截图已获取。\n\n- 页面标题: ${pageTitle}\n- 页面地址: ${pageUrl}\n\n图片识别分析失败（API 返回 ${response.status}），请检查图片识别 API 配置。`;
    }

    let analysis;

    if (useStream) {
      // 流式模式：SSE 逐块读取，实时推送到 side panel
      analysis = await readVisionSSEStream(response, controller, sessionId);
    } else {
      // 非流式模式：JSON 一次性返回
      const data = await response.json();
      analysis = data.choices?.[0]?.message?.content;
    }

    if (!analysis) {
      logger.error('[Background] 图片识别 API 结果为空');
      return `页面截图已获取。\n\n- 页面标题: ${pageTitle}\n- 页面地址: ${pageUrl}\n\n图片识别返回结果为空，请重试。`;
    }

    logger.debug('[Background] 图片识别分析完成，结果长度:', analysis.length);
    return `页面截图分析结果：\n\n**页面**: ${pageTitle}\n**地址**: ${pageUrl}\n\n${analysis}`;

  } catch (err) {
    clearTimeout(timeout);
    logger.error('[Background] 图片识别 API 调用异常:', err.message);
    if (err.name === 'AbortError') {
      return `页面截图已获取。\n\n- 页面标题: ${pageTitle}\n- 页面地址: ${pageUrl}\n\n图片识别分析超时（60秒），请检查图片识别 API 是否可用或尝试重新截图。`;
    }
    return `页面截图已获取。\n\n- 页面标题: ${pageTitle}\n- 页面地址: ${pageUrl}\n\n图片识别分析失败: ${err.message}`;
  }
}

/**
 * 流式读取视觉 API 的 SSE 响应，逐块推送到 side panel 实时展示，完成后返回完整文本
 */
async function readVisionSSEStream(response, abortController, sessionId = null) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  try {
    while (true) {
      let readResult;
      if (abortController && abortController.signal) {
        readResult = await Promise.race([
          reader.read(),
          new Promise((_, reject) => {
            if (abortController.signal.aborted) {
              reject(new DOMException('Aborted', 'AbortError'));
              return;
            }
            const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
            abortController.signal.addEventListener('abort', onAbort, { once: true });
          })
        ]);
      } else {
        readResult = await reader.read();
      }

      const { done, value } = readResult;
      if (done) break;

      buffer += decoder.decode(value, { stream: false });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        let data = '';
        if (line.startsWith('data:')) {
          data = line.substring(5).replace(/^\s+/, '');
        }
        
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          // 兼容多种 SSE 格式：delta.content / message.content / text
          let delta = parsed.choices?.[0]?.delta?.content
            || parsed.choices?.[0]?.message?.content
            || parsed.choices?.[0]?.text
            || '';
          if (delta) {
            fullContent += delta;

            // 实时推送到 side panel 展示
            if (sessionId) {
              chrome.runtime.sendMessage({
                type: 'VISION_ANALYSIS_CHUNK',
                sessionId,
                delta
              }).catch(() => {});
            }
          }
        } catch (err) {
          // 解析失败时记录原始数据，方便排查不同模型的格式差异
          logger.warn('[Background] 图片识别 SSE 解析失败，原始数据:', data.substring(0, 200), '错误:', err.message);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

/**
 * 触发截图下载
 */
export function triggerScreenshotDownload(dataUrl, format) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `screenshot_${timestamp}.${format === 'png' ? 'png' : 'jpg'}`;
  
  // 直接将 Base64 data URL 传给 chrome.downloads
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

/**
 * executeTakeFullPageScreenshot - 全页面截图（通过滚动拼接方案）
 */
export async function executeTakeFullPageScreenshot(args, toolCallId) {
  const { tabId, format = 'png', quality = 80 } = args;

  try {
    let targetTabId = tabId;
    if (!targetTabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs.length) return makeResult(false, '无法获取当前标签页', toolCallId);
      targetTabId = tabs[0].id;
    }

    logger.debug('[Background] 执行全页截图: tabId=', targetTabId, 'format=', format);

    try {
      const stitchedDataUrl = await captureViaStitch(targetTabId, format, quality);
      triggerScreenshotDownload(stitchedDataUrl, format);
      return { success: true, dataUrl: stitchedDataUrl, fullPage: true, message: '全页截图成功', tool_call_id: toolCallId };
    } catch (stitchErr) {
      logger.error('[Background] 全页截图失败:', stitchErr.message);
      try {
        const dataUrl = await captureVisibleTab(targetTabId, { format: 'png' });
        triggerScreenshotDownload(dataUrl, 'png');
        return { success: true, dataUrl, fullPage: false, message: '全页截图失败，返回可视区截图', tool_call_id: toolCallId };
      } catch (err) {
        return makeResult(false, '可视区截图也失败: ' + err.message, toolCallId);
      }
    }
  } catch (err) {
    return makeResult(false, '执行失败: ' + err.message, toolCallId);
  }
}

/**
 * 向 content script 发送消息并等待响应
 */
function sendToContent(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * 捕获指定标签页的可视区域截图
 */
function captureVisibleTab(tabId, options) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      chrome.tabs.captureVisibleTab(tab.windowId, options, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(dataUrl);
        }
      });
    });
  });
}

/**
 * 方案：分段滚动截图 + Canvas 拼接
 * 先滚动到底部触发懒加载，再逐段截图拼接。
 * 返回 dataUrl
 */
async function captureViaStitch(tabId, format, quality) {
  // 1. 先滚动到页面底部，触发懒加载内容
  await scrollPageToBottom(tabId);

  // 2. 获取最终页面总高度（懒加载后可能变大）
  const pageMetrics = await sendToContent(tabId, {
    type: 'GET_PAGE_METRICS'
  });

  let pageW, pageH, viewH;
  try {
    pageW = pageMetrics?.width || 1280;
    pageH = pageMetrics?.height || 720;
    viewH = pageMetrics?.viewportHeight || 720;
  } catch {
    pageW = 1280;
    pageH = 720;
    viewH = 720;
  }

  logger.debug('[Background] Stitch 页面尺寸（懒加载后）:', pageW, 'x', pageH, 'viewport:', viewH);

  // 3. 逐段滚动截图（带重叠）
  const chunks = [];
  let y = 0;
  while (y < pageH) {
    await sendToContent(tabId, {
      type: 'SCROLL_TO',
      position: { x: 0, y }
    });
    await new Promise(r => setTimeout(r, 600));

    const chunkH = Math.min(viewH, pageH - y);
    const dataUrl = await captureVisibleTab(tabId, { format: 'png' });

    const base64Data = dataUrl.split(',')[1];
    chunks.push({ data: base64Data, y, h: chunkH, w: pageW });
    logger.debug('[Background] Stitch 分段:', y, '-', y + chunkH);
    y += (viewH - STITCH_OVERLAP);
  }

  // 4. 恢复滚动位置到顶部
  await sendToContent(tabId, {
    type: 'SCROLL_TO',
    position: { x: 0, y: 0 }
  });

  // 5. Canvas 拼接
  return stitchChunksToDataUrl(chunks, pageW, pageH, format, quality);
}

/**
 * 逐步滚动到页面底部，触发所有懒加载内容
 */
async function scrollPageToBottom(tabId) {
  // 先获取视口高度
  const vhResult = await sendToContent(tabId, {
    type: 'GET_VIEWPORT_HEIGHT'
  });
  const vh = parseInt(vhResult?.height) || 800;

  let prevScrollY = -1;
  let currentScrollY = 0;
  let rounds = 0;
  const maxRounds = 50;

  while (currentScrollY !== prevScrollY && rounds < maxRounds) {
    prevScrollY = currentScrollY;
    await sendToContent(tabId, {
      type: 'SCROLL_BY',
      delta: { x: 0, y: vh }
    });
    await new Promise(r => setTimeout(r, 300));
    const posResult = await sendToContent(tabId, {
      type: 'GET_SCROLL_POSITION'
    });
    currentScrollY = parseInt(posResult?.scrollY) || 0;
    rounds++;
  }

  logger.debug('[Background] 预滚动完成, 最终 scrollY:', currentScrollY, '轮次:', rounds);
}

/**
 * 将多个 base64 分片用 OffscreenCanvas 拼接为完整图片
 */
async function stitchChunksToDataUrl(chunks, totalW, totalH, format, quality) {
  const canvas = new OffscreenCanvas(totalW, totalH);
  const ctx = canvas.getContext('2d');

  for (const chunk of chunks) {
    const blob = base64ToBlob(chunk.data, 'image/png');
    const bitmap = await createImageBitmap(blob);
    // DPR=1 下 bitmap 像素尺寸与 CSS 尺寸一致，直接按坐标绘制
    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, chunk.y, chunk.w, chunk.h);
    bitmap.close();
  }

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const outputBlob = await canvas.convertToBlob({
    type: mimeType,
    quality: format === 'jpeg' ? (quality || 80) / 100 : undefined
  });
  const arrayBuffer = await outputBlob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * base64 字符串 → Blob
 */
function base64ToBlob(base64, mimeType = 'image/png') {
  const byteChars = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteChars.length; offset += 512) {
    const slice = byteChars.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: mimeType });
}


// 导出截图工具函数供 tool-executor.js 路由表使用
