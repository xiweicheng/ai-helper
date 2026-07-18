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
