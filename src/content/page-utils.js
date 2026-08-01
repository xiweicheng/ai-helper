// content/page-utils.js - 网页元素工具函数
// 从 page-tools.js 拆分，提供元素选择器生成、文本/值读取、高亮清理等共享工具

/**
 * 生成元素的唯一CSS选择器
 */
export function generateUniqueSelector(el) {
  if (el.id) return `#${el.id}`;

  const parts = [];
  let current = el;

  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${current.id}`;
      parts.unshift(selector);
      break;
    }

    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter(c => c);
      if (classes.length > 0) {
        selector += '.' + classes[0];
      }
    }

    // 添加 nth-child
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    parts.unshift(selector);
    current = parent;
  }

  return parts.join(' > ');
}

/**
 * 获取元素的文本内容
 */
export function getElementText(el) {
  // 对于特定元素，返回适当的文本
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    return el.value || el.placeholder || el.name || '';
  }
  if (el.tagName === 'SELECT') {
    const selected = el.options[el.selectedIndex];
    return selected ? selected.text : '';
  }
  return el.textContent.trim();
}

/**
 * 获取元素的值
 */
export function getElementValue(el) {
  if (el.tagName === 'INPUT') {
    if (el.type === 'checkbox' || el.type === 'radio') {
      return el.checked ? 'checked' : 'unchecked';
    }
    return el.value;
  }
  if (el.tagName === 'SELECT') {
    return el.value;
  }
  return '';
}

/**
 * 获取元素CSS选择器
 */
export function getElementSelector(element) {
  if (element.id) return `#${element.id}`;

  let selector = element.tagName.toLowerCase();
  if (element.className) {
    const classes = element.className.split(' ').filter(c => c).slice(0, 2);
    if (classes.length) selector += '.' + classes.join('.');
  }

  return selector;
}

/**
 * 移除高亮（辅助函数）
 */
export function removeHighlights() {
  const highlights = document.querySelectorAll('.ai-helper-highlight');
  highlights.forEach(h => {
    const parent = h.parentNode;
    if (parent && parent.insertBefore && parent.removeChild) {
      while (h.firstChild) {
        parent.insertBefore(h.firstChild, h);
      }
      parent.removeChild(h);
      if (typeof parent.normalize === 'function') {
        parent.normalize();
      }
    }
  });

  const style = document.getElementById('ai-helper-highlight-style');
  if (style) style.remove();
}

// ==================== 操作后自动等待（auto-wait） ====================

/**
 * 获取页面 DOM 的轻量签名，用于检测操作后页面是否发生变化
 * 签名包含 body 子节点数 + 可交互元素计数 + URL，足以捕捉导航/弹窗/列表刷新等变化
 */
export function getDomSignature() {
  const body = document.body;
  const interactive = document.querySelectorAll('button, input, a[href], dialog, [role="dialog"], [role="alert"]').length;
  return `${location.href}|${body ? body.childElementCount : 0}|${interactive}`;
}

/**
 * 操作后自动等待：检测 URL 变化或 DOM 变化，若有变化则等待稳定
 *
 * 策略：
 * - 先等待 minWait（给页面响应的最小时间）
 * - 期间若检测到签名变化，继续轮询直到连续 stableCount 次无变化（视为稳定）或达到 maxWait
 * - 无变化时也至少等 minWait 后即返回，避免对纯前端响应的无谓阻塞
 *
 * @param {string} sigBefore - 操作前的 getDomSignature() 结果
 * @param {number} minWait - 最小等待 ms（默认 300）
 * @param {number} maxWait - 最大等待 ms（默认 2000）
 * @returns {Promise<{changed: boolean, urlChanged: boolean, domChanged: boolean, waitedMs: number, newUrl?: string}>}
 */
export async function autoWaitAfterAction(sigBefore, minWait = 300, maxWait = 2000) {
  const startTime = Date.now();
  // 先等最小等待时间
  await new Promise(r => setTimeout(r, Math.min(minWait, maxWait)));

  const urlBefore = sigBefore.split('|')[0];
  let urlChanged = location.href !== urlBefore;
  let domChanged = false;
  let lastSig = sigBefore;
  let stableCount = 0;

  // 若已检测到变化，继续等待稳定；否则直接返回
  while (Date.now() - startTime < maxWait) {
    const curSig = getDomSignature();
    if (curSig !== lastSig) {
      domChanged = true;
      stableCount = 0;
      lastSig = curSig;
    } else {
      stableCount++;
    }
    // 连续 2 次无变化（约 200ms）且已过最小等待 → 视为稳定
    if (stableCount >= 2) break;
    await new Promise(r => setTimeout(r, 100));
  }

  urlChanged = location.href !== urlBefore;

  const result = {
    changed: urlChanged || domChanged,
    urlChanged,
    domChanged,
    waitedMs: Date.now() - startTime,
  };
  if (urlChanged) result.newUrl = location.href;
  return result;
}
