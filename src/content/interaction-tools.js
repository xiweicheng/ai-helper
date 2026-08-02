// content/interaction-tools.js - 页面交互与操作工具

import { deepQuerySelector, deepQuerySelectorAll } from './shadow-dom-utils.js';
import { generateUniqueSelector, getDomSignature, autoWaitAfterAction } from './page-utils.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  interactionTools: {
    selectorRequired: '选择器不能为空',
    elementNotFoundBySelector: '未找到匹配选择器的元素: {selector}',
    navChangeHint: '（检测到导航变化，已等待 {ms}ms）',
    domChangeHint: '（检测到DOM变化，已等待 {ms}ms）',
    clickedElement: '已点击元素: {selector}{hint}',
    elementNotFound: '未找到元素',
    optionNotFound: '未找到匹配的选项',
    radioButtonNotFound: '未找到匹配的单选按钮',
    formFillComplete: '表单填充完成，成功 {success}/{total} 个字段',
    elementNotFoundShort: '未找到元素: {selector}',
    invalidScrollTarget: '无效的滚动目标或缺少选择器',
    scrollComplete: '滚动完成',
    elementAppeared: '元素 {selector} 已出现',
    elementDisappeared: '元素 {selector} 已消失',
    elementVisible: '元素 {selector} 已可见',
    elementHidden: '元素 {selector} 已隐藏',
    waitTimeout: '等待超时（{timeout}ms），元素 {selector} 未达到 {state} 状态',
    noFocusedElement: '没有聚焦的元素',
    keyboardInputSuccess: '键盘输入成功{hint}',
    sourceElementNotFound: '未找到源元素: {selector}',
    targetElementNotFound: '未找到目标元素: {selector}',
    dragExperimental: '⚠️拖拽为实验性，可能未生效（{source} → {target}）。受浏览器 dataTransfer 限制，依赖拖拽数据的网页多数无法触发，建议验证结果或改用点击坐标实现',
    fileUploadNotFound: '未找到文件上传控件: {selector}',
    notFileUploadControl: '选择的元素不是文件上传控件',
    fileUploaded: '已上传文件: {fileName}',
    textRequired: 'text 不能为空',
    hoveredByText: '已悬停文本"{text}"对应的{tag}元素{hint}',
    clickedByText: '已点击文本"{text}"对应的{tag}元素{hint}',
    textNotFound: '页面中不存在文本"{text}"，可能需要先操作（如打开下拉面板）或文本有误',
    textFoundButHidden: '找到文本"{text}"但元素不可见，可能需要先打开下拉面板/滚动到可见区域',
    textNotClickable: '找到文本"{text}"但不在可点击元素中，请用 query_elements 查看实际结构或用 selector 定位',
    textFoundButNotMatched: '找到文本"{text}"在可点击元素中但未匹配，可能文本被分割或大小写不一致',
    tagConstraint: '（限定标签: {tag}）',
    triggerNotFound: '未找到触发器: {selector}',
    selectedOption: '已选择: {label}',
    selectOptionNotFound: '在 <select> 中未找到匹配的选项: "{option}"',
    optionContainerNotFound: '未找到选项容器: {selector}',
    optionMatchTimeout: '在 {timeout}ms 内未找到匹配选项: "{option}"',
    setRequiresKeyValue: 'set操作需要提供key和value',
    keySet: '已设置 {key}',
    removeRequiresKey: 'remove操作需要提供key',
    keyRemoved: '已删除 {key}',
    storageCleared: '已清空存储',
    unknownAction: '未知操作: {action}',
  },
});

registerTranslations('en', {
  interactionTools: {
    selectorRequired: 'Selector cannot be empty',
    elementNotFoundBySelector: 'No element found matching selector: {selector}',
    navChangeHint: ' (navigation change detected, waited {ms}ms)',
    domChangeHint: ' (DOM change detected, waited {ms}ms)',
    clickedElement: 'Clicked element: {selector}{hint}',
    elementNotFound: 'Element not found',
    optionNotFound: 'No matching option found',
    radioButtonNotFound: 'No matching radio button found',
    formFillComplete: 'Form fill complete: {success}/{total} fields succeeded',
    elementNotFoundShort: 'Element not found: {selector}',
    invalidScrollTarget: 'Invalid scroll target or missing selector',
    scrollComplete: 'Scroll complete',
    elementAppeared: 'Element {selector} appeared',
    elementDisappeared: 'Element {selector} disappeared',
    elementVisible: 'Element {selector} is visible',
    elementHidden: 'Element {selector} is hidden',
    waitTimeout: 'Timed out ({timeout}ms); element {selector} did not reach {state} state',
    noFocusedElement: 'No focused element',
    keyboardInputSuccess: 'Keyboard input successful{hint}',
    sourceElementNotFound: 'Source element not found: {selector}',
    targetElementNotFound: 'Target element not found: {selector}',
    dragExperimental: '⚠️ Drag is experimental and may not have worked ({source} → {target}). Due to browser dataTransfer limitations, most pages relying on drag data cannot be triggered; please verify the result or use click coordinates instead',
    fileUploadNotFound: 'File upload control not found: {selector}',
    notFileUploadControl: 'The selected element is not a file upload control',
    fileUploaded: 'File uploaded: {fileName}',
    textRequired: 'text cannot be empty',
    hoveredByText: 'Hovered over the {tag} element matching "{text}"{hint}',
    clickedByText: 'Clicked the {tag} element matching "{text}"{hint}',
    textNotFound: 'Text "{text}" does not exist on the page; you may need to perform an action first (e.g. open a dropdown) or the text may be incorrect',
    textFoundButHidden: 'Found text "{text}" but the element is not visible; you may need to open a dropdown panel or scroll to make it visible',
    textNotClickable: 'Found text "{text}" but it is not in a clickable element; use query_elements to inspect the structure or use a selector to locate it',
    textFoundButNotMatched: 'Found text "{text}" in a clickable element but it did not match; the text may be split or have different casing',
    tagConstraint: ' (tag constraint: {tag})',
    triggerNotFound: 'Trigger not found: {selector}',
    selectedOption: 'Selected: {label}',
    selectOptionNotFound: 'No matching option found in <select>: "{option}"',
    optionContainerNotFound: 'Option container not found: {selector}',
    optionMatchTimeout: 'No matching option found within {timeout}ms: "{option}"',
    setRequiresKeyValue: 'Set operation requires both key and value',
    keySet: 'Set {key}',
    removeRequiresKey: 'Remove operation requires a key',
    keyRemoved: 'Removed {key}',
    storageCleared: 'Storage cleared',
    unknownAction: 'Unknown action: {action}',
  },
});

/**
 * 点击指定元素
 * 点击后自动等待：检测 URL/DOM 变化，若有变化则等待稳定（auto-wait）
 * - waitTime: 最小等待 ms（给页面响应时间，默认 300）
 * - timeout: 最大等待 ms（检测到变化时的等待上限，默认 2000）
 */
export async function clickElement(selector, waitTime = 300, timeout = 2000) {
  try {
    if (!selector) {
      return { success: false, error: t('interactionTools.selectorRequired') };
    }

    // Only strip wrapping quote pairs, preserve quotes inside CSS attribute selectors like a[href="/foo"]
    let cleanedSelector = selector.trim();
    // Matching wrapping quote pairs: "x", 'x', `x`, "x", 'x', 「x」
    const wrapPatterns = [
      [/^"([\s\S]*)"$/, '$1'],
      [/^'([\s\S]*)'$/, '$1'],
      [/^`([\s\S]*)`$/, '$1'],
      [/^"([\s\S]*)"$/, '$1'],
      [/^'([\s\S]*)'$/, '$1'],
      [/^「([\s\S]*)」$/, '$1'],
    ];
    for (const [pattern, replacement] of wrapPatterns) {
      cleanedSelector = cleanedSelector.replace(pattern, replacement);
    }

    const element = deepQuerySelector(cleanedSelector);
    if (!element) {
      return { success: false, error: t('interactionTools.elementNotFoundBySelector', { selector }) };
    }

    // 记录点击前状态，点击后自动等待页面稳定
    const sigBefore = getDomSignature();
    element.click();
    const wait = await autoWaitAfterAction(sigBefore, waitTime, timeout);

    const changeHint = wait.changed
      ? t(wait.urlChanged ? 'interactionTools.navChangeHint' : 'interactionTools.domChangeHint', { ms: wait.waitedMs })
      : '';
    return {
      success: true,
      message: t('interactionTools.clickedElement', { selector, hint: changeHint }),
      ...wait,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 检测元素是否为 contenteditable（自身或祖先节点）
 */
function isContentEditableElement(el) {
  return el.isContentEditable || el.getAttribute('contenteditable') === 'true';
}

/**
 * 使用原型链 native setter 设置 input/textarea 的 value
 * 绕过 React 的 inputValueTracking 托管，确保受控组件能感知到值变化
 * 对非 React 的原生表单同样有效，无回归风险
 */
function setNativeValue(element, value) {
  const proto = element.tagName === 'TEXTAREA'
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
  if (nativeSetter && nativeSetter.set) {
    nativeSetter.set.call(element, value);
  } else {
    element.value = value;
  }
}

/**
 * 填充 contenteditable / 富文本编辑器
 */
function fillContentEditable(element, value) {
  try {
    // 聚焦元素
    element.focus();

    // 尝试 execCommand('insertText') —— 大多数富文本编辑器兼容
    const supported = document.execCommand('insertText', false, value);

    if (!supported) {
      // execCommand 不支持时，直接设置 textContent
      element.textContent = value;
    }

    // 触发 input 事件，让框架/编辑器感知内容变化
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  } catch (e) {
    // 最后的 fallback：直接操作 textContent
    try {
      element.textContent = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 填充表单
 */
export function fillForm(fields, waitTime = 500) {
  try {
    const results = [];
    fields.forEach(field => {
      const { selector, value, fieldType = 'text' } = field;
      const element = deepQuerySelector(selector);
      
      if (!element) {
        results.push({ selector, success: false, error: t('interactionTools.elementNotFound') });
        return;
      }
      
      try {
        if (fieldType === 'text') {
          // 检测 contenteditable / 富文本编辑器
          if (isContentEditableElement(element)) {
            const ok = fillContentEditable(element, value);
            results.push({ selector, success: ok, value });
            return;
          }

          // 标准表单控件（input / textarea）—— 统一用 native setter 绕过 React 受控组件
          setNativeValue(element, value);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (fieldType === 'contenteditable') {
          const ok = fillContentEditable(element, value);
          results.push({ selector, success: ok, value });
          return;
        } else if (fieldType === 'select') {
          const option = element.querySelector(`option[value="${value}"]`) || 
                        Array.from(element.options).find(opt => opt.textContent === value);
          if (option) {
            element.value = option.value;
            element.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            results.push({ selector, success: false, error: t('interactionTools.optionNotFound') });
            return;
          }
        } else if (fieldType === 'checkbox') {
          element.checked = value === 'true' || value === true;
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (fieldType === 'radio') {
          const radio = deepQuerySelector(`${selector}[value="${value}"]`);
          if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            results.push({ selector, success: false, error: t('interactionTools.radioButtonNotFound') });
            return;
          }
        }
        results.push({ selector, success: true, value });
      } catch (e) {
        results.push({ selector, success: false, error: e.message });
      }
    });
    
    const successCount = results.filter(r => r.success).length;
    return { 
      success: true, 
      message: t('interactionTools.formFillComplete', { success: successCount, total: fields.length }),
      details: results 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 滚动到指定位置
 */
export function scrollToPosition(options) {
  try {
    const { target = 'selector', selector, x = 0, y = 0, behavior = 'smooth', align = 'center' } = options;
    
    if (target === 'top') {
      window.scrollTo({ top: 0, left: 0, behavior });
    } else if (target === 'bottom') {
      window.scrollTo({ top: document.body.scrollHeight, left: 0, behavior });
    } else if (target === 'coordinates') {
      window.scrollTo({ top: y, left: x, behavior });
    } else if (target === 'selector' && selector) {
      const element = deepQuerySelector(selector);
      if (!element) {
        return { success: false, error: t('interactionTools.elementNotFoundShort', { selector }) };
      }
      element.scrollIntoView({ behavior, block: align });
    } else {
      return { success: false, error: t('interactionTools.invalidScrollTarget') };
    }
    
    return { success: true, message: t('interactionTools.scrollComplete') };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 检查元素是否真正可见
 * 比 offsetParent !== null 更严格，涵盖 display:none、visibility:hidden、opacity:0、
 * 被 clip-path 裁剪、以及完全滚出视口等场景
 */
function isElementTrulyVisible(el) {
  if (!el) return false;

  // display:none 或祖先被隐藏 → offsetParent 为 null
  if (el.offsetParent === null && el.tagName !== 'BODY') {
    // 例外：position:fixed 的元素 offsetParent 也可能为 null，需要进一步检查
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none') return false;
    if (cs.visibility === 'hidden') return false;
    if (cs.position !== 'fixed') return false;
  }

  const cs = window.getComputedStyle(el);
  if (cs.display === 'none') return false;
  if (cs.visibility === 'hidden') return false;
  if (parseFloat(cs.opacity) <= 0) return false;

  // 检查是否有非零尺寸
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  // 检查是否在视口内（至少部分可见）
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const isInViewport = rect.top < viewportHeight && rect.bottom > 0 &&
                       rect.left < viewportWidth && rect.right > 0;
  if (!isInViewport) return false;

  return true;
}

/**
 * 等待元素出现/消失/可见状态变化
 */
export function waitForElement(selector, state = 'appeared', timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      const el = deepQuerySelector(selector);
      
      if (state === 'appeared' && el) {
        resolve({ success: true, message: t('interactionTools.elementAppeared', { selector }), element: selector });
        return;
      }
      
      if (state === 'disappeared' && !el) {
        resolve({ success: true, message: t('interactionTools.elementDisappeared', { selector }) });
        return;
      }
      
      if (state === 'visible' && el && isElementTrulyVisible(el)) {
        resolve({ success: true, message: t('interactionTools.elementVisible', { selector }), element: selector });
        return;
      }
      
      if (state === 'hidden' && (!el || !isElementTrulyVisible(el))) {
        resolve({ success: true, message: t('interactionTools.elementHidden', { selector }) });
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        resolve({ success: false, error: t('interactionTools.waitTimeout', { timeout, selector, state }) });
        return;
      }
      
      setTimeout(check, 100);
    };
    
    check();
  });
}

/**
 * 常见按键的 code/keyCode 映射（字母/数字由规则计算，功能键查表）
 */
const KEY_CODE_MAP = {
  enter: { code: 'Enter', keyCode: 13 },
  escape: { code: 'Escape', keyCode: 27 }, esc: { code: 'Escape', keyCode: 27 },
  tab: { code: 'Tab', keyCode: 9 },
  backspace: { code: 'Backspace', keyCode: 8 },
  delete: { code: 'Delete', keyCode: 46 },
  arrowup: { code: 'ArrowUp', keyCode: 38 },
  arrowdown: { code: 'ArrowDown', keyCode: 40 },
  arrowleft: { code: 'ArrowLeft', keyCode: 37 },
  arrowright: { code: 'ArrowRight', keyCode: 39 },
  home: { code: 'Home', keyCode: 36 }, end: { code: 'End', keyCode: 35 },
  pageup: { code: 'PageUp', keyCode: 33 }, pagedown: { code: 'PageDown', keyCode: 34 },
  space: { code: 'Space', keyCode: 32 },
};

function getKeyCodeInfo(key) {
  const lower = key.toLowerCase();
  if (KEY_CODE_MAP[lower]) return KEY_CODE_MAP[lower];
  if (key.length === 1 && /[a-zA-Z]/.test(key)) {
    return { code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0) };
  }
  if (key.length === 1 && /[0-9]/.test(key)) {
    return { code: `Digit${key}`, keyCode: key.charCodeAt(0) };
  }
  const fMatch = key.match(/^F([1-9]|1[0-2])$/i);
  if (fMatch) {
    const n = parseInt(fMatch[1], 10);
    return { code: `F${n}`, keyCode: 111 + n };
  }
  return { code: key, keyCode: key.toUpperCase().charCodeAt(0) };
}

/**
 * 模拟键盘输入
 */
export async function keyboardInput({ key, text, ctrlKey = false, shiftKey = false, altKey = false }) {
  try {
    const activeElement = document.activeElement;

    if (!activeElement) {
      return { success: false, error: t('interactionTools.noFocusedElement') };
    }

    const sigBefore = getDomSignature();

    // 直接输入文本
    if (text) {
      const isInput = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
      const isEditable = activeElement.isContentEditable;

      if (isInput || isEditable) {
        // 聚焦目标元素
        activeElement.focus();

        if (isEditable) {
          // 富文本编辑器：使用 execCommand 以兼容 CKEditor/TinyMCE/React 等
          try {
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, text);
          } catch {
            activeElement.textContent += text;
          }
        } else {
          // 标准 input/textarea：复用 setNativeValue 绕过 React 受控组件
          setNativeValue(activeElement, activeElement.value + text);
        }

        // 分发事件（React 依赖 inputType、bubbles）
        try {
          // 优先使用 InputEvent，React 16+ 依赖 inputType
          activeElement.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text
          }));
        } catch {
          activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
        activeElement.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    
    // 模拟按键
    if (key) {
      const keyInfo = getKeyCodeInfo(key);
      const eventInit = {
        key: key,
        code: keyInfo.code,
        keyCode: keyInfo.keyCode,
        which: keyInfo.keyCode,
        bubbles: true,
        cancelable: true,
        ctrlKey: ctrlKey,
        shiftKey: shiftKey,
        altKey: altKey
      };
      
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', eventInit));
      document.activeElement.dispatchEvent(new KeyboardEvent('keypress', eventInit));
      document.activeElement.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    }
    
    // auto-wait：按键/输入后检测页面变化（如 Enter 提交触发导航、输入触发搜索建议）
    const wait = await autoWaitAfterAction(sigBefore, 300, 2000);
    const changeHint = wait.changed
      ? t(wait.urlChanged ? 'interactionTools.navChangeHint' : 'interactionTools.domChangeHint', { ms: wait.waitedMs })
      : '';
    return { success: true, message: t('interactionTools.keyboardInputSuccess', { hint: changeHint }), ...wait };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 拖拽操作（实验性 / 部分支持）
 *
 * ⚠️ 局限性：
 * - 手动创建的 DragEvent 在 Chrome 中 dataTransfer 为只读，无法真正传递拖拽数据
 * - elementFromPoint().dispatchEvent() 与浏览器原生拖拽行为存在差异
 * - 依赖 dataTransfer 的网页拖拽功能（如文件拖放、自定义拖拽数据）几乎无法触发
 * - 仅对简单的、仅依赖事件冒泡的拖拽交互可能生效
 */
export function dragAndDrop(sourceSelector, targetSelector) {
  return new Promise((resolve, reject) => {
    try {
      const source = deepQuerySelector(sourceSelector);
      const target = deepQuerySelector(targetSelector);
      
      if (!source) {
        resolve({ success: false, error: t('interactionTools.sourceElementNotFound', { selector: sourceSelector }) });
        return;
      }
      
      if (!target) {
        resolve({ success: false, error: t('interactionTools.targetElementNotFound', { selector: targetSelector }) });
        return;
      }
      
      // 获取元素中心坐标
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      
      const sourceX = sourceRect.left + sourceRect.width / 2;
      const sourceY = sourceRect.top + sourceRect.height / 2;
      const targetX = targetRect.left + targetRect.width / 2;
      const targetY = targetRect.top + targetRect.height / 2;
      
      // 创建并分发拖拽事件（实验性）
      const dispatchDragEvent = (type, clientX, clientY) => {
        const event = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: clientX,
          clientY: clientY,
          screenX: clientX,
          screenY: clientY
        });
        Object.defineProperty(event, 'dataTransfer', {
          value: {
            getData: () => '',
            setData: () => {},
            effectAllowed: 'all',
            dropEffect: 'none'
          }
        });
        document.elementFromPoint(clientX, clientY)?.dispatchEvent(event);
      };
      
      // 开始拖拽
      dispatchDragEvent('dragstart', sourceX, sourceY);
      
      // 拖入目标
      dispatchDragEvent('dragenter', targetX, targetY);
      dispatchDragEvent('dragover', targetX, targetY);
      
      // 释放
      dispatchDragEvent('drop', targetX, targetY);
      dispatchDragEvent('dragend', sourceX, sourceY);
      
      resolve({
        success: true,
        experimental: true,
        message: t('interactionTools.dragExperimental', { source: sourceSelector, target: targetSelector })
      });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * 文件上传
 */
export function fileUpload(selector, fileName, fileContent, fileType = 'application/octet-stream') {
  try {
    const input = deepQuerySelector(selector);
    
    if (!input) {
      return { success: false, error: t('interactionTools.fileUploadNotFound', { selector }) };
    }
    
    if (input.type !== 'file') {
      return { success: false, error: t('interactionTools.notFileUploadControl') };
    }
    
    // 创建File对象
    let blob;
    try {
      // 尝试作为base64解码
      const decoded = atob(fileContent);
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i);
      }
      blob = new Blob([bytes], { type: fileType });
    } catch (e) {
      // 如果base64解码失败，直接作为文本处理
      blob = new Blob([fileContent], { type: fileType });
    }
    
    const file = new File([blob], fileName, { type: fileType });
    
    // 使用DataTransfer设置文件
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    
    // 触发change事件
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    return { success: true, message: t('interactionTools.fileUploaded', { fileName }) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 按文本点击元素（原子操作：查找 + 点击 + 自动等待）
 * 遍历可交互元素，匹配文本后点击，省去 query_elements → interact_element 两步
 *
 * @param {string} text - 要匹配的文本（精确匹配优先，其次包含匹配）
 * @param {object} options
 * @param {string} options.tag - 限定标签（如 'button'/'a'），不传则遍历所有可交互元素
 * @param {number} options.waitTime - 点击后最小等待 ms
 * @param {number} options.timeout - 点击后最大等待 ms
 */
export async function clickByText(text, options = {}) {
  const { tag, action = 'click', waitTime = 300, timeout = 2000 } = options;

  if (!text) {
    return { success: false, error: t('interactionTools.textRequired') };
  }

  // 可交互元素选择器（穿透 Shadow DOM）
  const selectors = tag
    ? [tag]
    : [
        'button',
        '[role="button"]',
        'input[type="submit"]',
        'input[type="button"]',
        'a[href]',
        '[role="menuitem"]',
        '[role="menuitemradio"]',
        '[role="menuitemcheckbox"]',
        '[role="option"]',
        '[role="tab"]',
        '[onclick]',
        'summary',
        'li',
      ];

  const textLower = text.toLowerCase();

  for (const sel of selectors) {
    let elements = [];
    try {
      elements = deepQuerySelectorAll(sel);
    } catch {
      continue;
    }
    for (const el of elements) {
      // 获取元素文本（含 value 用于 input[submit/button]）
      const elText = (el.textContent || el.value || '').trim();
      if (!elText) continue;
      const elLower = elText.toLowerCase();

      // 精确匹配优先，其次包含匹配
      if (elText === text || elLower === textLower || elLower.includes(textLower)) {
        // 检查可见性（不可见元素跳过，避免点到隐藏的同类元素）
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) <= 0) {
          continue;
        }

        const selector = generateUniqueSelector(el);
        const sigBefore = getDomSignature();
        if (action === 'hover') {
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }));
          const wait = await autoWaitAfterAction(sigBefore, waitTime, timeout);
          const changeHint = wait.changed
            ? t(wait.urlChanged ? 'interactionTools.navChangeHint' : 'interactionTools.domChangeHint', { ms: wait.waitedMs })
            : '';
          return {
            success: true,
            message: t('interactionTools.hoveredByText', { text, tag: el.tagName.toLowerCase(), hint: changeHint }),
            selector,
            matchedText: elText.substring(0, 100),
            ...wait,
          };
        }
        el.click();
        const wait = await autoWaitAfterAction(sigBefore, waitTime, timeout);

        const changeHint = wait.changed
          ? t(wait.urlChanged ? 'interactionTools.navChangeHint' : 'interactionTools.domChangeHint', { ms: wait.waitedMs })
          : '';
        return {
          success: true,
          message: t('interactionTools.clickedByText', { text, tag: el.tagName.toLowerCase(), hint: changeHint }),
          selector,
          matchedText: elText.substring(0, 100),
          ...wait,
        };
      }
    }
  }

  // 增强错误诊断：深度搜索文本是否存在，帮助模型定位问题根因
  let textFound = false;
  let textHidden = false;
  let textNotClickable = false;
  try {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      if ((walker.currentNode.textContent || '').toLowerCase().includes(textLower)) {
        textFound = true;
        const parent = walker.currentNode.parentElement;
        if (parent) {
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) <= 0) {
            textHidden = true;
          }
          const interactive = parent.closest('button, [role="button"], [role="option"], [role="tab"], li, a[href], [onclick], summary, [tabindex]');
          if (!interactive) {
            textNotClickable = true;
          }
        }
        break;
      }
    }
  } catch {}

  let error;
  if (!textFound) {
    error = t('interactionTools.textNotFound', { text });
  } else if (textHidden) {
    error = t('interactionTools.textFoundButHidden', { text });
  } else if (textNotClickable) {
    error = t('interactionTools.textNotClickable', { text });
  } else {
    error = t('interactionTools.textFoundButNotMatched', { text });
  }

  return {
    success: false,
    error: error + (tag ? t('interactionTools.tagConstraint', { tag }) : ''),
  };
}

// ========== P0/P1 新增工具 (2026-06-28) ==========

/**
 * 下拉选择器
 * 支持原生 <select> 和自定义下拉（div+ul+li）
 * 流程：点击触发器 → 等待 → 匹配文本 → 点击选项
 */
export function selectDropdown(triggerSelector, optionText, optionSelector = null, timeout = 5000) {
  return new Promise(async (resolve) => {
    try {
      const trigger = deepQuerySelector(triggerSelector);
      if (!trigger) {
        resolve({ success: false, error: t('interactionTools.triggerNotFound', { selector: triggerSelector }) });
        return;
      }

      // 尝试原生 <select>
      if (trigger.tagName === 'SELECT') {
        const options = trigger.options;
        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          const optLabel = (opt.textContent || opt.label || '').trim();
          // 精确匹配或包含匹配
          if (optLabel === optionText || optLabel.includes(optionText)) {
            trigger.value = opt.value;
            trigger.dispatchEvent(new Event('change', { bubbles: true }));
            trigger.dispatchEvent(new Event('input', { bubbles: true }));
            resolve({ success: true, message: t('interactionTools.selectedOption', { label: optLabel }), triggerTag: 'SELECT' });
            return;
          }
        }
        resolve({ success: false, error: t('interactionTools.selectOptionNotFound', { option: optionText }), availableOptions: Array.from(options).map(o => o.textContent?.trim()).filter(Boolean) });
        return;
      }

      // 自定义下拉：点击触发器
      trigger.click();
      await new Promise(r => setTimeout(r, 300));

      // 等待选项出现
      const startTime = Date.now();
      const optionContainer = optionSelector ? deepQuerySelector(optionSelector) : document;
      if (!optionContainer) {
        resolve({ success: false, error: t('interactionTools.optionContainerNotFound', { selector: optionSelector }) });
        return;
      }

      let matchedOption = null;
      while (Date.now() - startTime < timeout) {
        const candidates = deepQuerySelectorAll(
          'li, [role="option"], [role="menuitem"], .option, .dropdown-item, .select-item, [data-value], div',
          optionContainer
        );
        for (const el of candidates) {
          const text = (el.textContent || '').trim();
          // 忽略太短的文本
          if (text.length < 2) continue;
          // 匹配：精确、包含、或去空白后匹配
          if (text === optionText || text.includes(optionText) ||
              text.replace(/\s+/g, '') === optionText.replace(/\s+/g, '')) {
            matchedOption = el;
            break;
          }
        }
        if (matchedOption) break;
        await new Promise(r => setTimeout(r, 100));
      }

      if (!matchedOption) {
        resolve({ success: false, error: t('interactionTools.optionMatchTimeout', { timeout, option: optionText }) });
        return;
      }

      // 点击匹配的选项
      matchedOption.click();
      resolve({ success: true, message: t('interactionTools.selectedOption', { label: matchedOption.textContent?.trim() }), triggerTag: trigger.tagName });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * 管理Storage
 */
export function manageStorage({ action, storage, key, value }) {
  try {
    const target = storage === 'session' ? sessionStorage : localStorage;
    
    switch (action) {
      case 'get':
        if (!key) {
          // 返回所有键值对
          const allData = {};
          for (let i = 0; i < target.length; i++) {
            const k = target.key(i);
            allData[k] = target.getItem(k);
          }
          return { success: true, content: JSON.stringify(allData), data: allData };
        }
        const getValue = target.getItem(key);
        return { success: true, content: JSON.stringify({ key, value: getValue }), value: getValue };
        
      case 'set':
        if (!key || value === undefined) {
          return { success: false, error: t('interactionTools.setRequiresKeyValue') };
        }
        target.setItem(key, value);
        return { success: true, message: t('interactionTools.keySet', { key }) };

      case 'remove':
        if (!key) {
          return { success: false, error: t('interactionTools.removeRequiresKey') };
        }
        target.removeItem(key);
        return { success: true, message: t('interactionTools.keyRemoved', { key }) };

      case 'clear':
        target.clear();
        return { success: true, message: t('interactionTools.storageCleared') };

      default:
        return { success: false, error: t('interactionTools.unknownAction', { action }) };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}


