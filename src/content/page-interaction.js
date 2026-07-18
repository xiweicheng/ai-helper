// content/page-interaction.js - 网页元素交互与查询工具
// 从 page-tools.js 拆分，包含交互元素查询、相似元素查找、元素计数、滚动收集、无障碍树读取等

import { deepQuerySelector, deepQuerySelectorAll } from './shadow-dom-utils.js';
import { generateUniqueSelector, getElementText, getElementValue } from './page-utils.js';

/**
 * 查询可交互元素（推荐优先使用）
 */
export function queryInteractiveElements(options = {}) {
  const { filterByText, elementTypes, maxResults = 100 } = options;

  const elements = [];
  const seenSelectors = new Set();

  // 定义可交互元素的选择器
  const selectors = {
    button: 'button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"]',
    input: 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])',
    select: 'select',
    textarea: 'textarea',
    a: 'a[href]',
    checkbox: 'input[type="checkbox"]',
    radio: 'input[type="radio"]',
    menuitem: '[role="menuitem"], [role="menu"], [role="menuitemcheckbox"], [role="menuitemradio"]'
  };

  // 确定要查询的选择器
  let querySelectors = [];
  if (elementTypes && elementTypes.length > 0) {
    elementTypes.forEach(type => {
      if (selectors[type]) querySelectors.push(selectors[type]);
    });
  } else {
    querySelectors = Object.values(selectors);
  }

  // 查询元素（穿透 Shadow DOM）
  querySelectors.forEach(selector => {
    try {
      deepQuerySelectorAll(selector).forEach(el => {
        // 生成唯一选择器
        const uniqueSelector = generateUniqueSelector(el);
        if (seenSelectors.has(uniqueSelector)) return;
        seenSelectors.add(uniqueSelector);

        const tagName = el.tagName.toLowerCase();
        const text = getElementText(el);
        const value = getElementValue(el);

        // 过滤文本
        if (filterByText && !text.toLowerCase().includes(filterByText.toLowerCase())) {
          return;
        }

        // 构建元素信息
        const elementInfo = {
          tag: tagName,
          selector: uniqueSelector,
          text: text.substring(0, 100)
        };

        // 根据类型添加特定属性
        if (tagName === 'a') {
          elementInfo.href = el.href;
        } else if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
          elementInfo.name = el.name;
          elementInfo.type = el.type || 'text';
          elementInfo.value = value;
          elementInfo.placeholder = el.placeholder;
        }

        // 添加属性
        if (el.id) elementInfo.id = el.id;
        if (el.className && typeof el.className === 'string') {
          elementInfo.className = el.className.split(' ').filter(c => c).slice(0, 3).join(' ');
        }

        elements.push(elementInfo);
      });
    } catch (e) {
      // 忽略无效选择器
    }
  });

  return {
    success: true,
    count: Math.min(elements.length, maxResults),
    total: elements.length,
    elements: elements.slice(0, maxResults)
  };
}

/**
 * 查找与目标元素结构相似的其他元素
 */
export function findSimilarElements(selector, maxResults = 50) {
  try {
    if (!selector) {
      return { success: false, error: '选择器不能为空' };
    }

    const target = deepQuerySelector(selector);
    if (!target) {
      return { success: false, error: `未找到目标元素: ${selector}` };
    }

    const getSignature = (el) => {
      const tagName = el.tagName.toLowerCase();
      const classList = el.classList
        ? Array.from(el.classList).sort().join('.')
        : '';
      const childCounts = {};
      Array.from(el.children).forEach(child => {
        const childTag = child.tagName.toLowerCase();
        childCounts[childTag] = (childCounts[childTag] || 0) + 1;
      });
      const childSig = Object.keys(childCounts)
        .sort()
        .map(k => `${k}:${childCounts[k]}`)
        .join(',');
      return `${tagName}|${classList}|${childSig}`;
    };

    const targetSig = getSignature(target);

    const similar = [];
    const allElements = document.querySelectorAll(target.tagName.toLowerCase());

    for (const el of allElements) {
      if (el === target) continue;
      if (similar.length >= maxResults) break;
      if (getSignature(el) === targetSig) {
        similar.push({
          tag: el.tagName.toLowerCase(),
          selector: generateUniqueSelector(el),
          text: (el.textContent || '').trim().substring(0, 200),
          id: el.id || '',
          className: typeof el.className === 'string' ? el.className : ''
        });
      }
    }

    return {
      success: true,
      original: {
        tag: target.tagName.toLowerCase(),
        selector: generateUniqueSelector(target),
        text: (target.textContent || '').trim().substring(0, 200),
        signature: targetSig
      },
      similar,
      count: similar.length
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 快速统计元素数量
 * 比 query_interactive_elements 轻量得多，仅返回计数和存在性
 */
export function getElementCount(selector, includeHidden = false) {
  try {
    const elements = document.querySelectorAll(selector);
    if (!includeHidden) {
      let visibleCount = 0;
      let totalCount = elements.length;
      elements.forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
          visibleCount++;
        }
      });
      return {
        success: true,
        count: visibleCount,
        totalCount,
        empty: visibleCount === 0,
        selector
      };
    }
    return {
      success: true,
      count: elements.length,
      totalCount: elements.length,
      empty: elements.length === 0,
      selector
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 滚动收集文本内容
 * 适用于无限滚动页面：连续滚动并收集新增的可见文本，去重后返回
 */
export function scrollAndCollect(args = {}) {
  const { scrollPixels = 800, maxScrolls = 20, pauseMs = 500, selector } = args;

  return new Promise(async (resolve) => {
    try {
      const container = selector ? document.querySelector(selector) : null;
      const getVisibleText = () => {
        const target = container || document.body;
        // 只获取当前可视区域内的文本节点
        const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
        let text = '';
        let node;
        while ((node = walker.nextNode())) {
          const parentEl = node.parentElement;
          if (!parentEl) continue;
          const rect = parentEl.getBoundingClientRect();
          // 在可视区内（或接近可视区）
          if (rect.bottom > -100 && rect.top < window.innerHeight + 100) {
            const trimmed = node.textContent.trim();
            if (trimmed) text += trimmed + '\n';
          }
        }
        return text;
      };

      const scrollElement = container || (document.scrollingElement || document.documentElement);
      let allText = '';
      let lastText = '';
      const startScrollY = window.scrollY;

      for (let i = 0; i < maxScrolls; i++) {
        // 获取当前可视文本
        const currentText = getVisibleText();
        allText += currentText + '\n';
        lastText = currentText;

        // 记录滚动前的位置
        const prevScrollY = window.scrollY;

        // 滚动
        scrollElement.scrollBy({ top: scrollPixels, behavior: 'auto' });

        // 暂停等待内容加载
        await new Promise(r => setTimeout(r, pauseMs));

        // 检查是否已到底部（位置没变）
        if (Math.abs(window.scrollY - prevScrollY) < 5) {
          // 再试一次
          await new Promise(r => setTimeout(r, pauseMs));
          if (Math.abs(window.scrollY - prevScrollY) < 5) break;
        }
      }

      // 滚回起始位置
      if (container) {
        scrollElement.scrollTo({ top: startScrollY, behavior: 'auto' });
      }

      // 去重：移除相邻重复行
      const lines = allText.split('\n');
      const deduped = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && trimmed !== deduped[deduped.length - 1]) {
          deduped.push(trimmed);
        }
      }

      resolve({
        success: true,
        content: deduped.join('\n'),
        contentLength: deduped.join('\n').length,
        scrolls: maxScrolls,
        startScrollY,
        endScrollY: window.scrollY
      });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * 读取无障碍树信息
 */
export function readAccessibilityTree(maxResults = 100) {
  try {
    const semanticRoles = {
      'nav': 'navigation',
      'main': 'main',
      'header': 'banner',
      'footer': 'contentinfo',
      'aside': 'complementary',
      'section': 'region',
      'article': 'article',
      'form': 'form',
      'search': 'search',
      'figure': 'figure',
      'figcaption': 'figcaption',
      'summary': 'button',
      'dialog': 'dialog',
      'table': 'table',
      'img': 'img',
      'button': 'button',
      'a': 'link',
      'input': 'textbox',
      'select': 'combobox',
      'textarea': 'textbox',
      'h1': 'heading',
      'h2': 'heading',
      'h3': 'heading',
      'h4': 'heading',
      'h5': 'heading',
      'h6': 'heading'
    };

    const elements = [];
    const seen = new Set();

    const querySelector = [
      '[aria-label]',
      '[aria-labelledby]',
      '[role]',
      ...Object.keys(semanticRoles).map(tag => tag)
    ].join(',');

    document.querySelectorAll(querySelector).forEach(el => {
      if (elements.length >= maxResults) return;

      const uniqueKey = el.id || generateUniqueSelector(el);
      if (seen.has(uniqueKey)) return;
      seen.add(uniqueKey);

      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || semanticRoles[tag] || '';
      const label = el.getAttribute('aria-label')
        || el.textContent?.trim().substring(0, 100)
        || '';

      const props = {};

      if (el.getAttribute('aria-expanded') !== null) {
        props['aria-expanded'] = el.getAttribute('aria-expanded');
      }
      if (el.getAttribute('aria-selected') !== null) {
        props['aria-selected'] = el.getAttribute('aria-selected');
      }
      if (el.getAttribute('aria-checked') !== null) {
        props['aria-checked'] = el.getAttribute('aria-checked');
      }
      if (el.getAttribute('aria-disabled') !== null) {
        props['aria-disabled'] = el.getAttribute('aria-disabled');
      }
      if (el.getAttribute('aria-hidden') !== null) {
        props['aria-hidden'] = el.getAttribute('aria-hidden');
      }
      if (el.getAttribute('aria-haspopup') !== null) {
        props['aria-haspopup'] = el.getAttribute('aria-haspopup');
      }
      if (el.getAttribute('aria-level') !== null) {
        props['aria-level'] = el.getAttribute('aria-level');
      }
      if (el.getAttribute('tabindex') !== null) {
        props['tabindex'] = el.getAttribute('tabindex');
      }

      const entry = {
        tag,
        selector: generateUniqueSelector(el),
        role,
        label
      };

      if (Object.keys(props).length > 0) {
        entry.properties = props;
      }

      elements.push(entry);
    });

    return {
      success: true,
      elements,
      total: elements.length
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
