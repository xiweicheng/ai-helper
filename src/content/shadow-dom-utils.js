// content/shadow-dom-utils.js - Shadow DOM 和 iframe 深度操作工具

/**
 * 递归穿透 Shadow DOM 和同源 iframe 查询单个元素
 * Shadow DOM 优先搜索（更深层的匹配更精确）
 * @param {string} selector - CSS选择器
 * @param {Document|ShadowRoot} root - 搜索根节点，默认为 document
 * @param {number} maxDepth - 最大递归深度，默认5
 * @param {number} depth - 当前深度（内部使用）
 * @returns {Element|null} 找到的元素或 null
 */
export function deepQuerySelector(selector, root = document, maxDepth = 5, depth = 0) {
  if (depth > maxDepth) return null;

  try {
    // 优先搜索 Shadow DOM 和 iframe（更深层匹配更精确）
    if (root.querySelectorAll) {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const found = deepQuerySelector(selector, el.shadowRoot, maxDepth, depth + 1);
          if (found) return found;
        }
        if (el.tagName === 'IFRAME') {
          try {
            const iframeDoc = el.contentDocument || el.contentWindow?.document;
            if (iframeDoc) {
              const found = deepQuerySelector(selector, iframeDoc, maxDepth, depth + 1);
              if (found) return found;
            }
          } catch {
            // 跨域 iframe，跳过
          }
        }
      }
    }

    // 再搜索当前根节点
    const result = root.querySelector?.(selector);
    if (result) return result;
  } catch {
    // 跨域或权限错误，跳过
  }

  return null;
}

/**
 * 递归穿透 Shadow DOM 和同源 iframe 查询所有匹配元素
 * @param {string} selector - CSS选择器
 * @param {Document|ShadowRoot} root - 搜索根节点，默认为 document
 * @param {number} maxDepth - 最大递归深度，默认5
 * @param {number} depth - 当前深度（内部使用）
 * @param {Set} found - 已找到元素集合（内部使用）
 * @returns {Element[]} 匹配元素数组
 */
export function deepQuerySelectorAll(selector, root = document, maxDepth = 5, depth = 0, found = new Set()) {
  if (depth > maxDepth) return [];

  try {
    if (root.querySelectorAll) {
      root.querySelectorAll(selector).forEach(el => {
        found.add(el);
      });

      root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) {
          deepQuerySelectorAll(selector, el.shadowRoot, maxDepth, depth + 1, found);
        }
        if (el.tagName === 'IFRAME') {
          try {
            const iframeDoc = el.contentDocument || el.contentWindow?.document;
            if (iframeDoc) {
              deepQuerySelectorAll(selector, iframeDoc, maxDepth, depth + 1, found);
            }
          } catch {
            // 跨域 iframe，跳过
          }
        }
      });
    }
  } catch {
    // 跨域或权限错误，跳过
  }

  return Array.from(found);
}

/**
 * 获取当前页面的所有选中内容（包括 Shadow DOM）
 * @param {Document|ShadowRoot} root - 搜索根节点，默认为 document
 * @param {number} maxDepth - 最大递归深度，默认5
 * @param {number} depth - 当前深度（内部使用）
 * @returns {Object} 包含 text 和 range 的选择信息
 */
export function deepGetSelection(root = document, maxDepth = 5, depth = 0) {
  if (depth > maxDepth) return { text: '', range: null };

  try {
    const selection = root.getSelection?.();
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const text = selection.toString().trim();
      if (text) {
        return {
          text,
          range: selection.getRangeAt(0),
          depth,
          source: 'shadow'
        };
      }
    }

    if (root.querySelectorAll) {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const result = deepGetSelection(el.shadowRoot, maxDepth, depth + 1);
          if (result.text) return result;
        }
      }
    }
  } catch {
    // 跨域或权限错误，跳过
  }

  return { text: '', range: null };
}

/**
 * 获取页面所有文本内容（穿透 Shadow DOM 和同源 iframe）
 * @param {Document|ShadowRoot} root - 搜索根节点，默认为 document
 * @param {number} maxDepth - 最大递归深度，默认5
 * @param {number} depth - 当前深度（内部使用）
 * @param {Set} visited - 已访问文档集合（防止循环引用）
 * @returns {string} 合并后的文本内容
 */
export function deepGetText(root = document, maxDepth = 5, depth = 0, visited = new Set()) {
  if (depth > maxDepth || visited.has(root)) return '';
  visited.add(root);

  let text = '';

  try {
    if (root.body) {
      // Document：获取 body 可见文本
      text += root.body.innerText || '';
    } else if (root instanceof ShadowRoot) {
      // ShadowRoot：获取 shadow tree 内所有文本
      text += root.textContent || '';
    }

    if (root.querySelectorAll) {
      root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) {
          text += '\n' + deepGetText(el.shadowRoot, maxDepth, depth + 1, visited);
        }

        if (el.tagName === 'IFRAME') {
          try {
            const iframeDoc = el.contentDocument || el.contentWindow?.document;
            if (iframeDoc && iframeDoc.body) {
              text += '\n' + deepGetText(iframeDoc, maxDepth, depth + 1, visited);
            }
          } catch {
            // 跨域 iframe，无法访问
          }
        }
      });
    }
  } catch {
    // 跨域或权限错误，跳过
  }

  return text.trim().replace(/\n{3,}/g, '\n\n');
}

/**
 * 获取页面完整 HTML（穿透 Shadow DOM 和同源 iframe）
 * @param {Document|ShadowRoot} root - 搜索根节点，默认为 document
 * @param {number} maxDepth - 最大递归深度，默认5
 * @param {number} depth - 当前深度（内部使用）
 * @param {Set} visited - 已访问文档集合
 * @returns {string} 合并后的 HTML
 */
export function deepGetHtml(root = document, maxDepth = 5, depth = 0, visited = new Set()) {
  if (depth > maxDepth || visited.has(root)) return '';
  visited.add(root);

  let html = '';

  try {
    if (root.documentElement) {
      // Document：获取完整 HTML
      html = root.documentElement.outerHTML;
    } else if (root instanceof ShadowRoot) {
      // ShadowRoot：获取 shadow tree 内部 HTML
      html = root.innerHTML || '';
    }

    const shadowParts = [];
    if (root.querySelectorAll) {
      root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) {
          const shadowHtml = deepGetHtml(el.shadowRoot, maxDepth, depth + 1, visited);
          if (shadowHtml) {
            shadowParts.push(`<!-- shadow-root of ${el.tagName} -->\n${shadowHtml}`);
          }
        }

        if (el.tagName === 'IFRAME') {
          try {
            const iframeDoc = el.contentDocument || el.contentWindow?.document;
            if (iframeDoc && iframeDoc.documentElement) {
              const iframeHtml = deepGetHtml(iframeDoc, maxDepth, depth + 1, visited);
              if (iframeHtml) {
                shadowParts.push(`<!-- iframe content -->\n${iframeHtml}`);
              }
            }
          } catch {
            // 跨域 iframe
          }
        }
      });
    }

    if (shadowParts.length > 0) {
      html += '\n<!-- Shadow DOM and iframe content -->\n' + shadowParts.join('\n');
    }
  } catch {
    // 跨域或权限错误，跳过
  }

  return html;
}

/**
 * 获取元素的完整路径选择器（包含 Shadow DOM 路径）
 * @param {Element} el - 目标元素
 * @returns {string} 完整路径选择器
 */
export function getDeepSelector(el) {
  if (!el) return '';

  const parts = [];
  let current = el;
  let shadowHosts = [];

  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${current.id}`;
    } else if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter(c => c);
      if (classes.length > 0) {
        selector += '.' + classes[0];
      }
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    parts.unshift(selector);

    const root = current.getRootNode?.();
    if (root instanceof ShadowRoot) {
      const host = root.host;
      shadowHosts.unshift(host.tagName.toLowerCase());
      current = host;
    } else {
      current = parent;
    }
  }

  if (shadowHosts.length > 0) {
    return `shadow(${shadowHosts.join(' > ')}) > ` + parts.join(' > ');
  }

  return parts.join(' > ');
}

/**
 * 查找包含指定元素的 Shadow Root
 * @param {Element} el - 目标元素
 * @returns {ShadowRoot|null} 包含该元素的 ShadowRoot
 */
export function findShadowRoot(el) {
  if (!el) return null;

  let current = el;
  while (current) {
    const root = current.getRootNode?.();
    if (root instanceof ShadowRoot) {
      return root;
    }
    current = current.parentElement;
  }

  return null;
}

/**
 * 获取元素在视口中的位置（处理 iframe 偏移）
 * @param {Element} el - 目标元素
 * @returns {Object} 包含 x, y 的坐标对象
 */
export function getElementViewportPosition(el) {
  if (!el) return { x: 0, y: 0 };

  const rect = el.getBoundingClientRect();
  let x = rect.left + rect.width / 2;
  let y = rect.top;

  let currentDoc = el.ownerDocument;
  while (currentDoc && currentDoc !== window.document) {
    const iframe = currentDoc.defaultView?.frameElement;
    if (!iframe) break;

    const iframeRect = iframe.getBoundingClientRect();
    x += iframeRect.left;
    y += iframeRect.top;

    currentDoc = iframe.ownerDocument;
  }

  return { x, y };
}

/**
 * 获取选择范围在视口中的位置（处理 Shadow DOM 和 iframe）
 * @param {Range} range - 选择范围
 * @returns {Object} 包含 x, y 的坐标对象
 */
export function getRangeViewportPosition(range) {
  if (!range) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  let rect;
  
  try {
    rect = range.getBoundingClientRect();
  } catch {
    rect = { left: 0, top: 0, width: 0, height: 0 };
  }
  
  if (!rect || rect.width === 0 && rect.height === 0) {
    const container = range.commonAncestorContainer;
    if (container) {
      const el = container.nodeType === Node.TEXT_NODE 
        ? container.parentElement 
        : container;
      if (el && el.getBoundingClientRect) {
        rect = el.getBoundingClientRect();
      }
    }
  }
  
  let x = rect.left + rect.width / 2;
  let y = rect.top;

  if (window.top !== window) {
    let currentDoc = range.startContainer.ownerDocument;
    while (currentDoc && currentDoc !== window.top.document) {
      const iframe = currentDoc.defaultView?.frameElement;
      if (!iframe) break;
      const iframeRect = iframe.getBoundingClientRect();
      x += iframeRect.left;
      y += iframeRect.top;
      currentDoc = iframe.ownerDocument;
    }
  }

  return { x, y };
}

/**
 * 在所有 Shadow DOM 上附加选择变化监听器
 * @param {Function} handler - 选择变化处理函数
 * @param {Document|ShadowRoot} root - 根节点
 * @param {number} maxDepth - 最大递归深度
 * @param {number} depth - 当前深度
 * @param {Set} listeners - 已添加监听器的集合
 * @returns {Set} 已添加的监听器集合
 */
export function attachSelectionListeners(handler, root = document, maxDepth = 5, depth = 0, listeners = new Set()) {
  if (depth > maxDepth || listeners.has(root)) return listeners;

  try {
    const listener = () => handler();
    root.addEventListener?.('selectionchange', listener);
    listeners.add({ root, listener });

    if (root.querySelectorAll) {
      root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) {
          attachSelectionListeners(handler, el.shadowRoot, maxDepth, depth + 1, listeners);
        }
      });
    }
  } catch {
    // 跨域或权限错误，跳过
  }

  return listeners;
}

/**
 * 移除所有附加的选择变化监听器
 * @param {Set} listeners - 监听器集合
 */
export function removeSelectionListeners(listeners) {
  for (const { root, listener } of listeners) {
    try {
      root.removeEventListener?.('selectionchange', listener);
    } catch {
      // 忽略移除失败
    }
  }
  listeners.clear();
}

/**
 * 检测当前页面是否包含 Shadow DOM
 * @returns {boolean} 是否包含 Shadow DOM
 */
export function hasShadowDom() {
  try {
    return document.querySelectorAll('*').some(el => el.shadowRoot);
  } catch {
    return false;
  }
}

/**
 * 检测当前页面是否包含 iframe
 * @returns {boolean} 是否包含 iframe
 */
export function hasIframe() {
  return document.querySelectorAll('iframe').length > 0;
}