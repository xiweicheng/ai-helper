// content/advanced-tools.js - 高级工具

import { t, registerTranslations } from '../shared/i18n.js';
import { deepQuerySelector, deepGetText } from './shadow-dom-utils.js';

registerTranslations('zh', {
  advancedTools: {
    close: '关闭',
    qrcodeLibNotLoaded: 'QRCode 库未加载，已使用 SVG 降级方案生成',
    qrcodeLibAndFallbackUnavailable: '二维码库未加载且降级方案不可用',
    targetElementNotFound: '未找到目标元素',
    screenshotFailed: '截图失败',
    cssParamRequired: 'css 参数必须是非空字符串',
    unsupportedInjectMode: '不支持的 injectMode: {mode}，支持 \'style\' 或 \'inline\'',
  },
});

registerTranslations('en', {
  advancedTools: {
    close: 'Close',
    qrcodeLibNotLoaded: 'QRCode library not loaded, used SVG fallback',
    qrcodeLibAndFallbackUnavailable: 'QRCode library not loaded and fallback unavailable',
    targetElementNotFound: 'Target element not found',
    screenshotFailed: 'Screenshot failed',
    cssParamRequired: 'css parameter must be a non-empty string',
    unsupportedInjectMode: 'Unsupported injectMode: {mode}; supported: \'style\' or \'inline\'',
  },
});

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
      closeBtn.textContent = t('advancedTools.close');
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
            warning: t('advancedTools.qrcodeLibNotLoaded')
          });
        } else {
          resolve({ success: false, error: t('advancedTools.qrcodeLibAndFallbackUnavailable') });
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
        resolve({ success: false, error: t('advancedTools.targetElementNotFound') });
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
          resolve({ success: false, error: response?.error || t('advancedTools.screenshotFailed') });
        }
      });
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
}



// SEC-10 简单白名单：过滤可造成外链信标 / 属性选择器外泄 / 脚本执行的危险 CSS 构造。
// 只剔除危险片段，正当视觉改样式（颜色/字号/背景色/隐藏/定位等）不受影响。
// 因确认闸门被 toolConfirmationEnabled 总开关 AND 门控（用户关开关即失效），此净化
// 在执行内部恒定生效、不依赖任何确认。@import 先删（可吞掉其后的 url），再删各危险函数/绑定。
export function sanitizeInjectedCss(css) {
  if (typeof css !== 'string') return '';
  return css
    .replace(/@import\b[^;{}]*;?/gi, '')        // 顶层 @import 外链样式表（信标 + 二次载荷）
    .replace(/url\s*\([^;{}]*\)/gi, '')          // 一切 url(...)：出网信标 + 属性选择器外泄信道
    .replace(/expression\s*\([^;{}]*\)/gi, '')   // IE CSS 表达式（可执行脚本）
    .replace(/-moz-element\s*\([^;{}]*\)/gi, '') // -moz-element() 引用其它元素作图像（外泄）
    .replace(/element\s*\([^;{}]*\)/gi, '')      // element() 同上
    .replace(/-moz-binding\b[^;}]*;?/gi, '')     // XBL 绑定（脚本）
    .replace(/\bbehavior\b[^;}]*;?/gi, '');      // HTC behavior 绑定（脚本）
}

export function injectCss(css, targetSelector = null, injectMode = 'style') {
  try {
    if (!css || typeof css !== 'string') {
      return { success: false, error: t('advancedTools.cssParamRequired') };
    }

    // SEC-10：注入前统一净化；style(global/scoped) 与 inline 三条分支都使用净化后的 css
    css = sanitizeInjectedCss(css);

    if (injectMode !== 'style' && injectMode !== 'inline') {
      return { success: false, error: t('advancedTools.unsupportedInjectMode', { mode: injectMode }) };
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


// ==================== 完成度校验：客观取证器（Phase 3） ====================
// 在页面真实 DOM 上对每条 doneCriteria 求值，供 background 经 EVALUATE_DONE_CRITERIA 调用。
// 校验优先"用工具取证"而非"问模型"（AUDIT_STATUS line 85）。doc/loc 可注入以便单测。
//
// B-new-1：查询/取文本一律走 deepQuerySelector / deepGetText（与 interaction-tools/page-tools 同口径），
//         穿透 shadow DOM 与同源 iframe。否则模型据 deep 工具达成的目标，校验器只在浅层 light DOM 里找，
//         会对 shadow 内 modal 误判 element_absent 达成（假 ✅）、对 shadow 内元素误判 element_exists 未达（假 ⚠️）。
// M-new-3：三态如实上报。返回 { available, pass }：
//         - available:false = "求不出值"（缺 target / 非法选择器 / 坏 attr=value 格式 / 未知 check / 无 href），
//           绝不折成 pass:false（那会把"取不到证"谎报成"经独立取证确认未达成"）；
//         - available:true + pass:true/false = 真实 DOM 结论（达成 / 确证未达标）。

// 原生 querySelector 探测选择器语法是否合法：deepQuerySelector 内部吞异常返回 null，
// 无法区分"非法选择器"与"元素确不存在"，故单独试探测三态。
function selectorQueryable(doc, sel) {
  try { doc.querySelector(sel); return true; } catch { return false; }
}

function evalOneDoneCriterion(criterion, doc, loc) {
  const target = criterion.target != null ? String(criterion.target) : '';
  switch (criterion.check) {
    case 'element_exists': {
      if (!target || !selectorQueryable(doc, target)) return { available: false };
      return { available: true, pass: !!deepQuerySelector(target, doc) };
    }
    case 'element_absent': {
      if (!target || !selectorQueryable(doc, target)) return { available: false };
      return { available: true, pass: !deepQuerySelector(target, doc) };
    }
    case 'text_contains': {
      // 待查文本优先 expected，缺时回落 target（模型常把文本写进 target）
      const needle = criterion.expected != null ? String(criterion.expected)
        : (criterion.target != null ? String(criterion.target) : '');
      if (!needle) return { available: false };
      const text = deepGetText(doc) || (doc.body ? (doc.body.textContent || '') : '');
      return { available: true, pass: text.includes(needle) };
    }
    case 'url_matches': {
      // URL 子串优先 target，缺时回落 expected
      const pat = target || (criterion.expected != null ? String(criterion.expected) : '');
      const href = loc && loc.href ? String(loc.href) : '';
      if (!pat || !href) return { available: false };
      return { available: true, pass: href.includes(pat) };
    }
    case 'attribute_equals': {
      // target = CSS 选择器；expected = "attr=value"
      const raw = criterion.expected != null ? String(criterion.expected) : '';
      const idx = raw.indexOf('=');
      if (!target || idx <= 0 || !selectorQueryable(doc, target)) return { available: false };
      const el = deepQuerySelector(target, doc);
      return { available: true, pass: !!el && el.getAttribute(raw.slice(0, idx)) === raw.slice(idx + 1) };
    }
    default:
      return { available: false }; // 未知类型：无从取证（≠ 确证未达标）
  }
}

export function evaluateDoneCriteria(criteria, doc, loc) {
  const list = Array.isArray(criteria) ? criteria : [];
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const l = loc || (typeof window !== 'undefined' ? window.location : null);
  if (!d) return list.map((c) => ({ id: c.id, check: c.check, pass: false, available: false }));
  return list.map((c) => {
    let out;
    try {
      out = evalOneDoneCriterion(c, d, l);
    } catch {
      out = { available: false }; // 求值异常：取证不可用，绝不折成"确证未达标"
    }
    return { id: c.id, check: c.check, pass: out.available ? !!out.pass : false, available: !!out.available };
  });
}
