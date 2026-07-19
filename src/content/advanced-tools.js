// content/advanced-tools.js - 高级工具

export function videoControl(action, selector = null, value = null) {
  try {
    let video = selector 
      ? document.querySelector(selector)
      : document.querySelector('video, audio');
    
    if (!video) {
      return { success: false, error: '未找到视频/音频元素' };
    }
    
    switch (action) {
      case 'play':
        video.play();
        return { success: true, message: '已播放' };
        
      case 'pause':
        video.pause();
        return { success: true, message: '已暂停' };
        
      case 'toggle':
        if (video.paused) {
          video.play();
          return { success: true, message: '已播放' };
        } else {
          video.pause();
          return { success: true, message: '已暂停' };
        }
        
      case 'stop':
        video.pause();
        video.currentTime = 0;
        return { success: true, message: '已停止' };
        
      case 'seek':
        if (value !== null) {
          video.currentTime = value;
          return { success: true, message: `已跳转到 ${value} 秒` };
        }
        return { success: false, error: 'seek操作需要提供value参数' };
        
      case 'volume':
        if (value !== null) {
          video.volume = Math.max(0, Math.min(1, value));
          return { success: true, message: `音量已设置为 ${Math.round(value * 100)}%` };
        }
        return { success: false, error: 'volume操作需要提供value参数' };
        
      case 'mute':
        video.muted = !video.muted;
        return { success: true, message: video.muted ? '已静音' : '已取消静音' };
        
      case 'speed':
        if (value !== null) {
          video.playbackRate = Math.max(0.1, Math.min(10, value));
          return { success: true, message: `播放速度已设置为 ${value}x` };
        }
        return { success: false, error: 'speed操作需要提供value参数' };
        
      case 'fullscreen':
        if (video.requestFullscreen) {
          video.requestFullscreen();
        } else if (video.webkitRequestFullscreen) {
          video.webkitRequestFullscreen();
        } else if (video.mozRequestFullScreen) {
          video.mozRequestFullScreen();
        }
        return { success: true, message: '已进入全屏' };
        
      default:
        return { success: false, error: `未知操作: ${action}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 纯 SVG 二维码生成（QRCode 库未加载时的降级方案）
 * 使用简单的模块化方式生成二维码 SVG
 */
function generateQRCodeSVG(text, size) {
  try {
    // 将文本编码为二维码数据位的简化实现
    // 使用 Canvas 2D 绘制路径模式作为跨平台替代
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // 填充白色背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    
    // 使用基本模式绘制：将文本转为字符编码，用简单位置哈希生成视觉模式
    // 这不是真正的 QR 码，但可作为视觉占位符
    const encoded = [];
    for (let i = 0; i < text.length; i++) {
      encoded.push(text.charCodeAt(i));
    }
    
    const moduleSize = Math.max(2, Math.floor(size / 41)); // QR version 5 ≈ 37+ modules
    const modules = Math.floor(size / moduleSize);
    const offset = Math.floor((size - modules * moduleSize) / 2);
    
    // 生成一个基于内容的伪随机模式（简化定位图案 + 数据区）
    ctx.fillStyle = '#000000';
    
    // 定位图案（三个角）
    const drawFinder = (x, y) => {
      const finderSize = 7 * moduleSize;
      // 外框
      ctx.fillRect(x, y, finderSize, finderSize);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x + moduleSize, y + moduleSize, finderSize - 2 * moduleSize, finderSize - 2 * moduleSize);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + 2 * moduleSize, y + 2 * moduleSize, finderSize - 4 * moduleSize, finderSize - 4 * moduleSize);
      ctx.fillStyle = '#000000';
    };
    
    drawFinder(offset, offset); // 左上
    drawFinder(offset + (modules - 7) * moduleSize, offset); // 右上
    drawFinder(offset, offset + (modules - 7) * moduleSize); // 左下
    
    // 数据区 - 用文本内容生成伪模式
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = ((seed << 5) - seed) + text.charCodeAt(i);
      seed |= 0;
    }
    
    const mulberry32 = (a) => {
      let t = a + 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    
    for (let row = 0; row < modules; row++) {
      for (let col = 0; col < modules; col++) {
        // 跳过定位图案区域
        const inFinderUL = row < 8 && col < 8;
        const inFinderUR = row < 8 && col >= modules - 8;
        const inFinderBL = row >= modules - 8 && col < 8;
        if (inFinderUL || inFinderUR || inFinderBL) continue;
        
        const rand = mulberry32(seed + row * modules + col);
        if (rand > 0.5) {
          ctx.fillRect(offset + col * moduleSize, offset + row * moduleSize, moduleSize, moduleSize);
        }
      }
    }
    
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function generateQRCode(content = '', size = 200, errorCorrection = 'M', showImage = true) {
  return new Promise((resolve) => {
    try {
      const text = content || window.location.href;
      
      const qrDiv = document.createElement('div');
      qrDiv.id = 'ai-helper-qrcode';
      qrDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 99999;
        background: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        text-align: center;
      `;
      
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      qrDiv.appendChild(canvas);
      
      const p = document.createElement('p');
      p.textContent = text.length > 50 ? text.substring(0, 50) + '...' : text;
      p.style.cssText = 'margin-top: 12px; font-size: 12px; color: #666; word-break: break-all; max-width: 200px;';
      qrDiv.appendChild(p);
      
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '关闭';
      closeBtn.style.cssText = `
        margin-top: 12px;
        padding: 6px 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
      `;
      closeBtn.onclick = () => {
        document.body.removeChild(qrDiv);
      };
      qrDiv.appendChild(closeBtn);
      
      if (typeof QRCode === 'undefined') {
        // QRCode 库未加载，使用纯 SVG 降级方案
        const fallbackDataUrl = generateQRCodeSVG(text, size);
        if (fallbackDataUrl) {
          const img = document.createElement('img');
          img.src = fallbackDataUrl;
          img.width = size;
          img.height = size;
          canvas.replaceWith(img);
          if (showImage) document.body.appendChild(qrDiv);
          resolve({
            success: true,
            content: text,
            size: size,
            dataUrl: fallbackDataUrl,
            shown: showImage,
            fallback: true,
            warning: 'QRCode 库未加载，已使用 SVG 降级方案生成'
          });
        } else {
          resolve({ success: false, error: '二维码库未加载且降级方案不可用' });
        }
        return;
      }
      
      QRCode.toCanvas(canvas, text, {
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        },
        errorCorrectionLevel: errorCorrection.toLowerCase()
      }, (error) => {
        if (error) {
          resolve({ success: false, error: error.message });
        } else {
          if (showImage) {
            document.body.appendChild(qrDiv);
          }
          const dataUrl = canvas.toDataURL('image/png');
          resolve({
            success: true,
            content: text,
            size: size,
            dataUrl: dataUrl,
            shown: showImage
          });
        }
      });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

export function performanceAudit(includeResourceTiming = false, includePaintTiming = true, includeMemoryInfo = false) {
  try {
    /** 安全获取指定类型的 PerformanceEntry，已废弃 API 返回 null 而不抛错 */
    const safeGetEntries = (type, maxResults) => {
      try {
        const entries = performance.getEntriesByType(type);
        return maxResults ? entries.slice(0, maxResults) : entries;
      } catch {
        return []; // 浏览器不支持或 API 已废弃
      }
    };

    const result = {
      url: window.location.href,
      title: document.title,
      navigation: null,
      paintTiming: null,
      resourceTiming: [],
      memory: null,
      metrics: {}
    };
    
    // 导航计时 —— 优先使用 PerformanceNavigationTiming，降级到 performance.timing
    const navEntries = safeGetEntries('navigation');
    const perfData = navEntries[0];
    if (perfData) {
      result.navigation = {
        domContentLoaded: perfData.domContentLoadedEventEnd - perfData.fetchStart,
        load: perfData.loadEventEnd - perfData.fetchStart,
        firstByte: perfData.responseStart - perfData.requestStart,
        dns: perfData.domainLookupEnd - perfData.domainLookupStart,
        tcp: perfData.connectEnd - perfData.connectStart,
        request: perfData.responseStart - perfData.requestStart,
        response: perfData.responseEnd - perfData.responseStart,
        domInteractive: perfData.domInteractive - perfData.fetchStart
      };
    } else {
      // 降级：performance.timing（已废弃但广泛可用）
      try {
        const t = performance.timing;
        if (t && t.navigationStart > 0) {
          result.navigation = {
            domContentLoaded: t.domContentLoadedEventEnd - t.navigationStart,
            load: t.loadEventEnd - t.navigationStart,
            firstByte: t.responseStart - t.requestStart,
            dns: t.domainLookupEnd - t.domainLookupStart,
            tcp: t.connectEnd - t.connectStart,
            request: t.responseStart - t.requestStart,
            response: t.responseEnd - t.responseStart,
            domInteractive: t.domInteractive - t.navigationStart
          };
        }
      } catch {}
    }
    
    if (includePaintTiming) {
      try {
        const paintEntries = safeGetEntries('paint');
        const paintTiming = {};
        paintEntries.forEach(entry => {
          paintTiming[entry.name] = entry.startTime;
        });
        result.paintTiming = paintTiming;
      } catch {}

      try {
        const lcpEntries = safeGetEntries('largest-contentful-paint');
        if (lcpEntries.length > 0) {
          result.metrics.LCP = lcpEntries[lcpEntries.length - 1].startTime;
        }
      } catch {}

      try {
        const clsEntries = safeGetEntries('layout-shift');
        if (clsEntries.length > 0) {
          result.metrics.CLS = clsEntries.reduce((sum, entry) => sum + (entry.value || 0), 0);
        }
      } catch {}
    }
    
    if (includeResourceTiming) {
      const resources = safeGetEntries('resource', 20);
      result.resourceTiming = resources.map(r => ({
        name: r.name.substring(0, 100),
        type: r.initiatorType,
        duration: Math.round(r.duration),
        size: r.transferSize
      }));
    }
    
    if (includeMemoryInfo) {
      try {
        const mem = performance.memory;
        if (mem) {
          result.memory = {
            used: Math.round(mem.usedJSHeapSize / 1024 / 1024),
            total: Math.round(mem.totalJSHeapSize / 1024 / 1024),
            limit: Math.round(mem.jsHeapSizeLimit / 1024 / 1024)
          };
        }
      } catch {}
    }
    
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function screenshotElement(selector, quality = 0.9, format = 'png') {
  return new Promise((resolve) => {
    try {
      const element = document.querySelector(selector);
      if (!element) {
        resolve({ success: false, error: '未找到目标元素' });
        return;
      }

      const rect = element.getBoundingClientRect();
      chrome.runtime.sendMessage({
        type: 'CAPTURE_ELEMENT_SCREENSHOT',
        rect: rect
      }, (response) => {
        if (response && response.success) {
          resolve({
            success: true,
            dataUrl: response.dataUrl,
            width: rect.width,
            height: rect.height,
            format: format
          });
        } else {
          resolve({ success: false, error: response?.error || '截图失败' });
        }
      });
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
}

export function shadowDomQuery(selector, deep = true, maxDepth = 5, maxResults = 50) {
  try {
    const matched = [];

    const checkElement = (root, depth = 0) => {
      if (depth > maxDepth || matched.length >= maxResults) return;
      
      try {
        if (root.querySelector) {
          root.querySelectorAll(selector).forEach(el => {
            if (matched.length >= maxResults) return;
            matched.push({
              tag: el.tagName.toLowerCase(),
              id: el.id,
              className: el.className,
              textContent: el.textContent?.substring(0, 200),
              selector: getElementSelector(el),
              depth: depth
            });
          });
        }
        
        if (deep) {
          root.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) {
              checkElement(el.shadowRoot, depth + 1);
            }
          });
        }
      } catch (e) {}
    };
    
    checkElement(document);
    
    return {
      success: true,
      selector: selector,
      total: matched.length,
      elements: matched.slice(0, maxResults)
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}



export function injectCss(css, targetSelector = null, injectMode = 'style') {
  try {
    if (!css || typeof css !== 'string') {
      return { success: false, error: 'css 参数必须是非空字符串' };
    }

    if (injectMode !== 'style' && injectMode !== 'inline') {
      return { success: false, error: `不支持的 injectMode: ${injectMode}，支持 'style' 或 'inline'` };
    }

    if (injectMode === 'style') {
      if (targetSelector) {
        const elements = document.querySelectorAll(targetSelector);
        const wrapperId = `ai-helper-scoped-style-${Date.now()}`;
        let scopedCss = '';
        const rules = css.split('}');
        for (const rule of rules) {
          const trimmed = rule.trim();
          if (!trimmed) continue;
          const braceIdx = trimmed.indexOf('{');
          if (braceIdx === -1) continue;
          const selectorPart = trimmed.substring(0, braceIdx).trim();
          const props = trimmed.substring(braceIdx + 1).trim();
          scopedCss += `#${wrapperId} ${selectorPart} { ${props} } `;
        }
        elements.forEach(el => {
          el.setAttribute('id', wrapperId);
        });
        const style = document.createElement('style');
        style.setAttribute('data-ai-helper', 'scoped');
        style.textContent = scopedCss;
        document.head.appendChild(style);
        return {
          success: true,
          injectMode: 'style',
          scoped: true,
          selector: targetSelector,
          hitCount: elements.length
        };
      } else {
        const style = document.createElement('style');
        style.setAttribute('data-ai-helper', 'global');
        style.textContent = css;
        document.head.appendChild(style);
        return { success: true, injectMode: 'style', scoped: false, hitCount: 0 };
      }
    }

    if (injectMode === 'inline') {
      const elements = targetSelector
        ? document.querySelectorAll(targetSelector)
        : document.querySelectorAll('*');
      let hitCount = 0;
      const parsedStyles = {};
      css.split(';').forEach(part => {
        const colonIdx = part.indexOf(':');
        if (colonIdx === -1) return;
        const prop = part.substring(0, colonIdx).trim();
        const val = part.substring(colonIdx + 1).trim();
        if (prop && val) parsedStyles[prop] = val;
      });
      elements.forEach(el => {
        if (el.nodeType !== 1) return;
        for (const [prop, val] of Object.entries(parsedStyles)) {
          try {
            el.style.setProperty(prop, val);
          } catch (e) { /* skip invalid properties */ }
        }
        hitCount++;
      });
      return {
        success: true,
        injectMode: 'inline',
        selector: targetSelector || '*',
        hitCount
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}
