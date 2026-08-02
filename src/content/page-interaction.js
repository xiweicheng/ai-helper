// content/page-interaction.js - 网页元素交互与查询工具
// 从 page-tools.js 拆分，包含交互元素查询、相似元素查找、元素计数、滚动收集、无障碍树读取等

import { deepQuerySelector, deepQuerySelectorAll } from './shadow-dom-utils.js';
import { generateUniqueSelector, getElementText, getElementValue, getDomSignature, autoWaitAfterAction } from './page-utils.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  pageInteraction: {
    refHint: 'ref 编号仅本次查询有效，页面导航/刷新或切换 tab 后需重新 query_elements',
    invalidRefError: '无效的元素编号 ref={ref}。ref 仅当前页面有效，页面导航/刷新或切换 tab 后需重新 query_elements',
    elementStaleError: '元素 ref={ref} 已失效（页面可能已变化），请重新调用 query_elements 获取最新元素',
    elementNotVisibleError: '元素 ref={ref}（{tag}）当前不可见，可能被隐藏或折叠',
    navChangeHint: '（检测到导航变化，已等待 {ms}ms）',
    domChangeHint: '（检测到DOM变化，已等待 {ms}ms）',
    hoveredByRef: '已悬停元素 ref={ref}（{tag}）{hint}',
    clickedByRef: '已点击元素 ref={ref}（{tag}）{hint}',
    textRequired: 'text 不能为空',
    scrolledToText: '已滚动到包含"{text}"的元素',
    scrollTextNotFound: '滚动 {count} 次未找到包含"{text}"的文本',
  },
});

registerTranslations('en', {
  pageInteraction: {
    refHint: 'ref numbers are only valid for the current query; re-run query_elements after page navigation/refresh or tab switch',
    invalidRefError: 'Invalid element ref={ref}. ref is only valid for the current page; re-run query_elements after navigation/refresh or tab switch',
    elementStaleError: 'Element ref={ref} is stale (page may have changed); please call query_elements again to get the latest elements',
    elementNotVisibleError: 'Element ref={ref} ({tag}) is not visible; it may be hidden or collapsed',
    navChangeHint: ' (navigation change detected, waited {ms}ms)',
    domChangeHint: ' (DOM change detected, waited {ms}ms)',
    hoveredByRef: 'Hovered element ref={ref} ({tag}){hint}',
    clickedByRef: 'Clicked element ref={ref} ({tag}){hint}',
    textRequired: 'text cannot be empty',
    scrolledToText: 'Scrolled to element containing "{text}"',
    scrollTextNotFound: 'Scrolled {count} times but did not find text containing "{text}"',
  },
});

// ==================== 元素注册表（ref → element 映射） ====================
//
// query_elements 返回结果时给每个元素分配一个 ref 编号，模型可用 ref 直接操作元素
// （interact_by_ref），免去编写脆弱的 CSS selector。注册表只保留最近一次查询结果，
// 页面变化导致 element 失效时会用 selector 兜底重新查找；selector 也失效则提示重新查询。
const elementRegistry = new Map();

/**
 * 按 ref 获取元素的 selector（供 select_dropdown 等工具复用 ref 定位）
 */
export function getSelectorByRef(ref) {
  const refNum = parseInt(ref, 10);
  if (!refNum || !elementRegistry.has(refNum)) return null;
  return elementRegistry.get(refNum).selector;
}

/**
 * 查询可交互元素（推荐优先使用）
 */
export function queryInteractiveElements(options = {}) {
  const { filterByText, elementTypes, maxResults = 100 } = options;

  const elements = [];
  const seenSelectors = new Set();
  // 清空注册表，只保留本次查询结果
  elementRegistry.clear();

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

        // 分配 ref 编号，存入注册表供 interact_by_ref 使用
        const ref = elements.length + 1;
        elementInfo.ref = ref;
        elementRegistry.set(ref, { element: el, selector: uniqueSelector, tag: tagName });

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
    elements: elements.slice(0, maxResults),
    hint: t('pageInteraction.refHint')
  };
}

/**
 * 快速统计元素数量
 * 比 query_elements 轻量得多，仅返回计数和存在性
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
      let actualScrolls = 0;

      for (let i = 0; i < maxScrolls; i++) {
        // 获取当前可视文本
        const currentText = getVisibleText();
        allText += currentText + '\n';
        lastText = currentText;

        // 记录滚动前的位置
        const prevScrollY = window.scrollY;

        // 滚动
        scrollElement.scrollBy({ top: scrollPixels, behavior: 'auto' });
        actualScrolls++;

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
        scrolls: actualScrolls,
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

// ==================== P0/P1: 索引引用 & 文本滚动 ====================

/**
 * 按 ref 编号操作元素（配合 query_elements 返回的 ref 使用）
 *
 * 优势：模型无需编写 CSS selector，直接用编号引用元素，避免 selector 写错/失效问题
 * 容错：element 失效时用 selector 兜底重新查找；selector 也失效则提示重新 query_elements
 *
 * @param {number} ref - query_elements 返回的元素编号
 * @param {string} action - 'click' | 'hover'（暂只支持点击和悬停）
 * @param {object} options
 * @param {number} options.waitTime - 点击后最小等待 ms
 * @param {number} options.timeout - 点击后最大等待 ms
 */
export async function interactByRef(ref, action = 'click', options = {}) {
  const { waitTime = 300, timeout = 2000 } = options;

  const refNum = parseInt(ref, 10);
  if (!refNum || !elementRegistry.has(refNum)) {
    return {
      success: false,
      error: t('pageInteraction.invalidRefError', { ref }),
    };
  }

  const entry = elementRegistry.get(refNum);
  let element = entry.element;

  // 检查缓存的 element 是否仍在 DOM 中
  if (!element.isConnected) {
    // 兜底：用 selector 重新查找
    element = deepQuerySelector(entry.selector);
    if (!element) {
      // selector 也失效，提示模型重新查询
      return {
        success: false,
        error: t('pageInteraction.elementStaleError', { ref }),
      };
    }
  }

  // 可见性检查（点击不可见元素通常无意义）
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return {
      success: false,
      error: t('pageInteraction.elementNotVisibleError', { ref, tag: entry.tag }),
    };
  }

  if (action === 'hover') {
    const sigBefore = getDomSignature();
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }));
    const wait = await autoWaitAfterAction(sigBefore, waitTime, timeout);
    const changeHint = wait.changed
      ? t(wait.urlChanged ? 'pageInteraction.navChangeHint' : 'pageInteraction.domChangeHint', { ms: wait.waitedMs })
      : '';
    return { success: true, message: t('pageInteraction.hoveredByRef', { ref, tag: entry.tag, hint: changeHint }), selector: entry.selector, ...wait };
  }

  // 默认 click
  const sigBefore = getDomSignature();
  element.click();
  const wait = await autoWaitAfterAction(sigBefore, waitTime, timeout);

  const changeHint = wait.changed
    ? t(wait.urlChanged ? 'pageInteraction.navChangeHint' : 'pageInteraction.domChangeHint', { ms: wait.waitedMs })
    : '';
  return {
    success: true,
    message: t('pageInteraction.clickedByRef', { ref, tag: entry.tag, hint: changeHint }),
    selector: entry.selector,
    ...wait,
  };
}

/**
 * 滚动直到找到包含指定文本的元素，并滚动到该元素
 * 原子操作，省去反复 scroll_to + search_in_page 的多轮调用
 *
 * @param {string} text - 要查找的文本
 * @param {object} options
 * @param {number} options.maxScrolls - 最大滚动次数（默认 20）
 * @param {number} options.pauseMs - 每次滚动后等待 ms（默认 500）
 */
export async function scrollToText(text, options = {}) {
  const { maxScrolls = 20, pauseMs = 500 } = options;

  if (!text) {
    return { success: false, error: t('pageInteraction.textRequired') };
  }

  const textLower = text.toLowerCase();
  // 在文档中查找包含指定文本的可滚动目标元素
  const findTarget = () => {
    // 优先在语义化元素中查找
    const candidates = deepQuerySelectorAll(
      'h1, h2, h3, h4, h5, h6, p, span, a, button, li, td, th, label, div'
    );
    for (const el of candidates) {
      // 只取直接文本（避免父容器匹配到子元素的内容导致定位不准）
      const directText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent)
        .join('')
        .trim();
      if (!directText) continue;
      if (directText.toLowerCase().includes(textLower)) {
        return el;
      }
    }
    return null;
  };

  // 先检查当前视口
  let target = findTarget();
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(r => setTimeout(r, 300));
    return {
      success: true,
      message: t('pageInteraction.scrolledToText', { text }),
      selector: generateUniqueSelector(target),
      scrolls: 0,
    };
  }

  // 循环滚动查找
  for (let i = 0; i < maxScrolls; i++) {
    const prevY = window.scrollY;
    window.scrollBy({ top: Math.floor(window.innerHeight * 0.8), behavior: 'auto' });
    await new Promise(r => setTimeout(r, pauseMs));

    target = findTarget();
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 300));
      return {
        success: true,
        message: t('pageInteraction.scrolledToText', { text }),
        selector: generateUniqueSelector(target),
        scrolls: i + 1,
      };
    }

    // 到底了
    if (Math.abs(window.scrollY - prevY) < 5) {
      await new Promise(r => setTimeout(r, pauseMs));
      if (Math.abs(window.scrollY - prevY) < 5) break;
    }
  }

  return {
    success: false,
    error: t('pageInteraction.scrollTextNotFound', { count: maxScrolls, text }),
    scrolls: maxScrolls,
  };
}
