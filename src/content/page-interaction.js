// content/page-interaction.js - 网页元素交互与查询工具
// 从 page-tools.js 拆分，包含交互元素查询、相似元素查找、元素计数、滚动收集、无障碍树读取等

import { deepQuerySelector, deepQuerySelectorAll } from './shadow-dom-utils.js';
import { generateUniqueSelector, getDomSignature, autoWaitAfterAction, isContentEditableElement, setNativeValue, fillContentEditable } from './page-utils.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  pageInteraction: {
    refHint: 'ref 编号仅本次查询有效，页面导航/刷新或切换 tab 后需重新 query_elements',
    snapshotHeader: '可交互元素快照：{count} 个元素',
    snapshotTruncated: '（共 {total} 个，已截断，请用 filterByText 缩小范围）',
    snapshotFooter: '（ref 编号仅当前快照有效；页面变化后请重新调用 query_elements）',
    invalidRefSuggest: '无效或已过期的元素引用 ref={ref}。',
    invalidRefSuggestions: '最近快照中的有效引用：{list}。',
    invalidRefTail: '如页面已变化，请重新调用 query_elements 获取最新快照',
    elementNotVisibleError: '元素 ref={ref}（{tag}）当前不可见，可能被隐藏或折叠',
    navChangeHint: '（检测到导航变化，已等待 {ms}ms）',
    domChangeHint: '（检测到DOM变化，已等待 {ms}ms）',
    hoveredByRef: '已悬停元素 ref={ref}（{tag}）{hint}',
    clickedByRef: '已点击元素 ref={ref}（{tag}）{hint}',
    typedByRef: '已向元素 ref={ref}（{tag}）输入文本{hint}',
    typeNotSupported: '元素 {tag} 不支持文本输入（checkbox/radio 请用 fill_form 或 click）',
    valueRequired: 'action=type 时 value 不能为空',
    typeFailed: '文本输入失败',
    textRequired: 'text 不能为空',
    scrolledToText: '已滚动到包含"{text}"的元素',
    scrollTextNotFound: '滚动 {count} 次未找到包含"{text}"的文本',
  },
});

registerTranslations('en', {
  pageInteraction: {
    refHint: 'ref numbers are only valid for the current query; re-run query_elements after page navigation/refresh or tab switch',
    snapshotHeader: 'Interactive elements snapshot: {count} element(s)',
    snapshotTruncated: ' (of {total} total; truncated — narrow down with filterByText)',
    snapshotFooter: '(ref numbers are valid only for this snapshot; re-run query_elements after the page changes)',
    invalidRefSuggest: 'Invalid or stale element ref={ref}. ',
    invalidRefSuggestions: 'Nearest valid refs from the latest snapshot: {list}. ',
    invalidRefTail: 'If the page has changed, re-run query_elements',
    elementNotVisibleError: 'Element ref={ref} ({tag}) is not visible; it may be hidden or collapsed',
    navChangeHint: ' (navigation change detected, waited {ms}ms)',
    domChangeHint: ' (DOM change detected, waited {ms}ms)',
    hoveredByRef: 'Hovered element ref={ref} ({tag}){hint}',
    clickedByRef: 'Clicked element ref={ref} ({tag}){hint}',
    typedByRef: 'Typed text into element ref={ref} ({tag}){hint}',
    typeNotSupported: 'Element {tag} does not support text input (use fill_form or click for checkbox/radio)',
    valueRequired: 'value is required when action=type',
    typeFailed: 'Text input failed',
    textRequired: 'text cannot be empty',
    scrolledToText: 'Scrolled to element containing "{text}"',
    scrollTextNotFound: 'Scrolled {count} times but did not find text containing "{text}"',
  },
});

// ==================== 元素注册表（ref → element 映射） ====================
//
// query_elements 返回树快照时给每个输出元素分配一个 ref 编号，模型可用 ref 直接操作元素，
// 免去编写脆弱的 CSS selector。注册表只保留最近一次快照结果（每次查询重建），实体（element）
// 失效时会用内部 selector 兜底重新查找；编号跨快照单调递增、不复用——旧 ref 明确失效而非
// 静默指向新元素。selector 仅供内部兜底，不输出给模型。
let refCounter = 0;
const elementRegistry = new Map(); // ref → { element, selector, tag, role, name }

/**
 * 注册元素并返回 ref（输出即注册：只有真正输出到快照的元素才占用编号）
 */
function registerElement(el, role, name) {
  refCounter += 1;
  const ref = refCounter;
  let selector = '';
  try { selector = generateUniqueSelector(el); } catch { selector = ''; }
  elementRegistry.set(ref, { element: el, selector, tag: el.tagName, role, name });
  return ref;
}

/**
 * 统一 ref 解析：注册表命中 + isConnected 检查 + selector 兜底重查
 * 失败时返回带"附近有效引用"建议的错误信息，引导模型自我纠错
 */
export function resolveByRef(ref) {
  const refNum = parseInt(ref, 10);
  if (!refNum || !elementRegistry.has(refNum)) {
    return { error: buildInvalidRefMessage(refNum) };
  }
  const entry = elementRegistry.get(refNum);
  if (entry.element && entry.element.isConnected) {
    return { entry, element: entry.element };
  }
  const found = entry.selector ? deepQuerySelector(entry.selector) : null;
  if (found) {
    entry.element = found;
    return { entry, element: found };
  }
  return { error: buildInvalidRefMessage(refNum) };
}

/**
 * 构造失效 ref 的错误文案：附当前注册表中编号最接近的 ≤3 个有效引用
 */
function buildInvalidRefMessage(refNum) {
  let msg = t('pageInteraction.invalidRefSuggest', { ref: refNum });
  const alive = [...elementRegistry.entries()]
    .sort((a, b) => Math.abs(a[0] - refNum) - Math.abs(b[0] - refNum))
    .slice(0, 3);
  if (alive.length) {
    const list = alive
      .map(([r, e]) => `ref ${r} (${e.role || (e.tag && e.tag.toLowerCase()) || '?'}${e.name ? ` "${e.name}"` : ''})`)
      .join(', ');
    msg += t('pageInteraction.invalidRefSuggestions', { list });
  }
  msg += t('pageInteraction.invalidRefTail');
  return msg;
}

/**
 * 按 ref 获取元素的 selector（供 select_dropdown 等工具复用 ref 定位）
 */
export function getSelectorByRef(ref) {
  const resolved = resolveByRef(ref);
  return resolved.element ? resolved.entry.selector : null;
}

/**
 * 按 ref 获取元素（供 fill_form 等工具复用 ref 定位）
 */
export function getElementByRef(ref) {
  const resolved = resolveByRef(ref);
  return resolved.element || null;
}

// ==================== 遍历判定 ====================

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'option', 'combobox', 'listbox',
  'searchbox', 'slider', 'spinbutton', 'textbox', 'treeitem',
]);

// 语义容器：进树、不分配 ref（仅提供上下文）
const CONTAINER_ROLES = new Set([
  'dialog', 'form', 'navigation', 'main', 'banner', 'contentinfo', 'table', 'row', 'heading',
]);

/**
 * 获取元素角色：显式 role 属性优先，否则按标签/类型推导隐式角色
 */
function getRole(el) {
  const explicit = el.getAttribute('role');
  const role = explicit ? explicit.trim().split(/\s+/)[0] : '';
  if (role) return role;
  const tag = el.tagName;
  if (tag === 'BUTTON') return 'button';
  if (tag === 'A') return el.hasAttribute('href') ? 'link' : '';
  if (tag === 'SELECT') return (el.multiple || el.size > 1) ? 'listbox' : 'combobox';
  if (tag === 'TEXTAREA') return 'textbox';
  if (tag === 'SUMMARY') return 'button';
  if (/^H[1-6]$/.test(tag)) return 'heading';
  if (tag === 'NAV') return 'navigation';
  if (tag === 'MAIN') return 'main';
  if (tag === 'DIALOG') return 'dialog';
  if (tag === 'FORM') return 'form';
  if (tag === 'TABLE') return 'table';
  if (tag === 'TR') return 'row';
  if (tag === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    if (type === 'hidden') return '';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
    if (type === 'search') return 'searchbox';
    if (type === 'range') return 'slider';
    if (type === 'number') return 'spinbutton';
    return 'textbox';
  }
  return '';
}

/**
 * 剪枝判定：返回 true 时整棵子树跳过
 * （display:none / hidden / aria-hidden / inert 均不可被子元素覆盖）
 */
function isSubtreePruned(el) {
  if (el.hasAttribute('hidden') || el.hasAttribute('inert')) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.style && el.style.display === 'none') return true;
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  return !!style && style.display === 'none';
}

/**
 * 输出级可见性检查：不可见元素跳过自身（不剪子树——visibility 可被子元素覆盖）
 */
function isElementHidden(el) {
  if (typeof el.checkVisibility === 'function') {
    return !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  if (!style) return false;
  return style.display === 'none' || style.visibility === 'hidden';
}

function isInteractiveElement(el, role) {
  if (INTERACTIVE_ROLES.has(role)) return true;
  if (el.tagName === 'A' && el.hasAttribute('href')) return true;
  if (el.hasAttribute('contenteditable')) {
    const v = el.getAttribute('contenteditable');
    if (v === '' || v === 'true' || v === 'plaintext-only') return true;
  }
  const ti = el.getAttribute('tabindex');
  if (ti !== null && parseInt(ti, 10) >= 0) return true;
  if (el.hasAttribute('onclick')) return true;
  return false;
}

function getElementChildren(el) {
  const children = [];
  if (el.shadowRoot) children.push(...el.shadowRoot.children);
  children.push(...el.children);
  return children;
}

// ==================== 名称解析 ====================

/**
 * 无障碍名称解析链（取第一个非空），对未标记表单容错
 * 顺序：select 选中项 → aria-labelledby → aria-label → label[for]/包裹 label →
 *       placeholder → title → alt → 按钮类 value → 直接文本 → 前兄弟文本
 */
function resolveAccessibleName(el, role) {
  const trim = (s, max = 80) => {
    if (!s) return '';
    const text = String(s).replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  };
  const textOf = (node) => trim(node ? node.textContent : '');

  // 1. select 选中项文本
  if (el.tagName === 'SELECT') {
    const opt = el.options && el.options[el.selectedIndex];
    if (opt && opt.text) return trim(opt.text);
  }
  // 2. aria-labelledby（拼接引用元素文本）
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const joined = labelledby.split(/\s+/)
      .map(id => document.getElementById(id))
      .filter(Boolean).map(n => textOf(n)).filter(Boolean).join(' ');
    if (joined) return joined;
  }
  // 3. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return trim(ariaLabel);
  // 4. 关联 label（label[for] 或包裹 label）
  if (el.id) {
    try {
      const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (forLabel) {
        const t4 = textOf(forLabel);
        if (t4) return t4;
      }
    } catch { /* 忽略无效 id 选择器 */ }
  }
  const wrapLabel = el.closest && el.closest('label');
  if (wrapLabel) {
    const t4b = textOf(wrapLabel);
    if (t4b) return t4b;
  }
  // 5. placeholder
  if (el.getAttribute('placeholder')) return trim(el.getAttribute('placeholder'));
  // 6. title
  if (el.getAttribute('title')) return trim(el.getAttribute('title'));
  // 7. alt
  if (el.getAttribute('alt')) return trim(el.getAttribute('alt'));
  // 8. input 按钮类 value
  if (el.tagName === 'INPUT') {
    const type = (el.type || '').toLowerCase();
    if ((type === 'submit' || type === 'button' || type === 'reset') && el.value) return trim(el.value);
  }
  // 9. 元素直接文本（取直接子文本节点，避免吞掉深层交互元素文本）
  let ownText = '';
  for (const node of el.childNodes) {
    if (node.nodeType === 3) ownText += node.textContent;
  }
  if (!ownText.trim()) ownText = el.textContent || '';
  const t9 = trim(ownText);
  if (t9) return t9;
  // 10. 前兄弟文本（未标记表单场景；前兄弟自身不含交互元素才采用）
  let prev = el.previousElementSibling;
  while (prev && !(prev.textContent || '').trim()) prev = prev.previousElementSibling;
  if (prev && !prev.querySelector('button, a[href], input, select, textarea')) {
    const t10 = textOf(prev);
    if (t10) return t10;
  }
  return '';
}

// ==================== 属性序列化 ====================

function buildAttributeText(el, role) {
  const parts = [];
  const clip = (s, max) => (s && s.length > max ? s.slice(0, max - 1) + '…' : s);
  if (role === 'link' && el.getAttribute('href')) {
    parts.push(`href="${clip(el.getAttribute('href'), 150)}"`);
  }
  if (el.tagName === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    if (type !== 'text' && type !== 'checkbox' && type !== 'radio') parts.push(`type="${type}"`);
  }
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) parts.push(`placeholder="${clip(placeholder, 60)}"`);
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    if (el.value) parts.push(`value="${clip(el.value, 60)}"`);
  }
  if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio') && el.checked) {
    parts.push('checked="true"');
  }
  if (el.tagName === 'OPTION' && el.selected) parts.push('selected="true"');
  return parts.join(' ');
}

// ==================== 树序列化与查询 ====================

function matchesTypeFilter(el, role, types) {
  if (!types || !types.length) return true;
  const tag = el.tagName.toLowerCase();
  const inputType = el.tagName === 'INPUT' ? (el.type || '').toLowerCase() : '';
  return types.some(x => x === tag || x === inputType || x === role);
}

function matchesTextFilter(el, name, filterText) {
  if (!filterText) return true;
  const hay = `${name} ${el.textContent || ''} ${el.value || ''}`.toLowerCase();
  return hay.includes(String(filterText).toLowerCase());
}

/**
 * 查询可交互元素并输出树形快照（推荐优先使用）
 * 每个输出元素分配 [ref N] 编号（单调递增），供 interact_element / fill_form 引用
 *
 * @param {object} options
 * @param {string} options.filterByText - 按文本过滤（不区分大小写）
 * @param {string[]|null} options.elementTypes - 限定类型（tag 名 / input type / role 任一匹配）
 * @param {number} options.maxResults - 输出元素数上限（默认 100）
 * @param {number} options.maxChars - 快照字符预算（默认 6000），超限截断并提示
 * @param {boolean} options.countOnly - 只返回计数（不生成快照）
 */
export function queryInteractiveElements(options = {}) {
  const {
    filterByText = '',
    elementTypes = null,
    maxResults = 100,
    maxChars = 6000,
    countOnly = false,
  } = options;

  try {
    // 只保留本次快照结果（ref 编号单调递增，不重置）
    elementRegistry.clear();

    // 阶段 A：完整遍历收集匹配的交互元素（有序）
    const matched = [];
    collectMatches(document.body, { matched, filterByText, elementTypes });

    if (countOnly) {
      return { success: true, content: '', count: matched.length, total: matched.length, truncated: false, hint: '' };
    }

    // 阶段 B：输出集（maxResults 上限）
    const selected = new Set(matched.slice(0, maxResults).map(m => m.el));
    const tooMany = matched.length > maxResults;

    // 阶段 C：序列化（预算 maxChars，输出即注册）
    const ctx = { selected, budget: maxChars, truncated: false, count: 0 };
    const lines = [];
    renderTree(document.body, 0, lines, ctx);

    const truncated = ctx.truncated || tooMany;
    const header = t('pageInteraction.snapshotHeader', { count: ctx.count })
      + (truncated ? t('pageInteraction.snapshotTruncated', { total: matched.length }) : '');
    lines.unshift(header);
    lines.push(t('pageInteraction.snapshotFooter'));

    return {
      success: true,
      content: lines.join('\n'),
      count: ctx.count,
      total: matched.length,
      truncated,
      hint: t('pageInteraction.refHint'),
    };
  } catch (error) {
    console.error('[PageInteraction] queryInteractiveElements failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 遍历收集匹配的交互元素（DOM 有序）
 */
function collectMatches(root, { matched, filterByText, elementTypes }) {
  if (isSubtreePruned(root)) return;
  const role = getRole(root);
  if (isInteractiveElement(root, role) && !isElementHidden(root) && matchesTypeFilter(root, role, elementTypes)) {
    const effectiveRole = role || root.tagName.toLowerCase();
    const name = resolveAccessibleName(root, effectiveRole);
    if (matchesTextFilter(root, name, filterByText)) {
      matched.push({ el: root, role: effectiveRole, name });
    }
  }
  for (const child of getElementChildren(root)) {
    collectMatches(child, { matched, filterByText, elementTypes });
  }
}

/**
 * 递归渲染树行；返回本子树是否产生输出行
 * 缩进 = 有效深度：交互元素/语义容器 +1，一般容器透传
 */
function renderTree(el, depth, lines, ctx) {
  if (isSubtreePruned(el)) return false;
  const role = getRole(el);
  const interactive = isInteractiveElement(el, role);
  const container = !interactive && CONTAINER_ROLES.has(role) ? role : null;
  const childDepth = depth + ((interactive || container) ? 1 : 0);

  const childLines = [];
  let childProduced = false;
  for (const child of getElementChildren(el)) {
    if (renderTree(child, childDepth, childLines, ctx)) childProduced = true;
  }

  if (interactive && ctx.selected.has(el) && !isElementHidden(el)) {
    if (ctx.budget <= 0) { ctx.truncated = true; return childProduced; }
    const effectiveRole = role || el.tagName.toLowerCase();
    const name = resolveAccessibleName(el, effectiveRole);
    const attrs = buildAttributeText(el, effectiveRole);
    // 估算行长度（含 [ref NNNNN] 上限 12 字符）后再注册，保证输出=注册
    const estimate = depth + effectiveRole.length + (name ? name.length + 2 : 0) + (attrs ? attrs.length + 1 : 0) + 12;
    if (ctx.budget - estimate < 0) { ctx.truncated = true; return childProduced; }
    const ref = registerElement(el, effectiveRole, name);
    const line = `${' '.repeat(depth)}${effectiveRole}${name ? ` "${name}"` : ''} [ref ${ref}]${attrs ? ' ' + attrs : ''}`;
    ctx.budget -= line.length + 1;
    ctx.count += 1;
    lines.push(line, ...childLines); // DOM 顺序：父行在子行前
    return true;
  }

  if (container && childProduced) {
    const cname = (container === 'dialog' || container === 'heading')
      ? resolveAccessibleName(el, role) : '';
    const line = `${' '.repeat(depth)}${container}${cname ? ` "${cname}"` : ''}`;
    ctx.budget -= line.length + 1;
    lines.push(line, ...childLines);
    return true;
  }

  if (childProduced) {
    lines.push(...childLines);
    return true;
  }
  return false;
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

// ==================== P0/P1: 索引引用 & 文本滚动 ====================

/**
 * 按 ref 编号操作元素（配合 query_elements 返回的 ref 使用）
 *
 * 优势：模型无需编写 CSS selector，直接用编号引用元素，避免 selector 写错/失效问题
 * 容错：element 失效时用 selector 兜底重新查找；selector 也失效则提示重新 query_elements
 *
 * @param {number} ref - query_elements 返回的元素编号
 * @param {string} action - 'click' | 'hover' | 'type'
 * @param {object} options
 * @param {number} options.waitTime - 点击后最小等待 ms
 * @param {number} options.timeout - 点击后最大等待 ms
 * @param {string} options.value - action=type 时要输入的文本
 * @param {boolean} options.clear - action=type 时是否先清空原内容
 * @param {boolean} options.submit - action=type 时输入后是否按 Enter 提交
 */
export async function interactByRef(ref, action = 'click', options = {}) {
  const { waitTime = 300, timeout = 2000 } = options;

  const refNum = parseInt(ref, 10);
  const resolved = resolveByRef(refNum);
  if (resolved.error) {
    return { success: false, error: resolved.error };
  }
  const { entry, element } = resolved;

  // 可见性检查（点击不可见元素通常无意义）
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return {
      success: false,
      error: t('pageInteraction.elementNotVisibleError', { ref, tag: entry.tag }),
    };
  }

  if (action === 'type') {
    const sigBefore = getDomSignature();
    const typeResult = typeIntoElement(element, options.value, options);
    if (!typeResult.success) {
      return { success: false, error: typeResult.error };
    }
    const wait = await autoWaitAfterAction(sigBefore, waitTime, timeout);
    const changeHint = wait.changed
      ? t(wait.urlChanged ? 'pageInteraction.navChangeHint' : 'pageInteraction.domChangeHint', { ms: wait.waitedMs })
      : '';
    return {
      success: true,
      message: t('pageInteraction.typedByRef', { ref: refNum, tag: entry.tag, hint: changeHint }),
      ...wait,
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
    return { success: true, message: t('pageInteraction.hoveredByRef', { ref, tag: entry.tag, hint: changeHint }), ...wait };
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
    ...wait,
  };
}

/**
 * 原子输入：聚焦 + 可选清空 + 设值/富文本写入 + 事件 + 可选 Enter 提交
 */
function typeIntoElement(el, value, { clear = false, submit = false } = {}) {
  if (value == null || value === '') {
    return { success: false, error: t('pageInteraction.valueRequired') };
  }
  const tag = el.tagName;
  const editable = isContentEditableElement(el);
  if (tag === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    if (['checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image'].includes(type)) {
      return { success: false, error: t('pageInteraction.typeNotSupported', { tag: `<input type="${type}">` }) };
    }
  } else if (tag !== 'TEXTAREA' && !editable) {
    return { success: false, error: t('pageInteraction.typeNotSupported', { tag: `<${tag.toLowerCase()}>` }) };
  }
  try { el.focus(); } catch { /* 忽略聚焦失败 */ }

  const isRich = editable && tag !== 'INPUT' && tag !== 'TEXTAREA';
  if (isRich) {
    if (clear) fillContentEditable(el, '');
    const ok = fillContentEditable(el, value);
    if (!ok) return { success: false, error: t('pageInteraction.typeFailed') };
  } else {
    if (clear) {
      setNativeValue(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setNativeValue(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (submit) {
    const keyOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
    el.dispatchEvent(new KeyboardEvent('keypress', keyOpts));
    el.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
  }
  return { success: true };
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
