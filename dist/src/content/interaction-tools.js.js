// content/interaction-tools.js - 页面交互与操作工具

let pageSnapshot = null;
let currentUtterance = null;

/**
 * 点击指定元素
 */
export function clickElement(selector, waitTime = 500, timeout = 3000) {
  try {
    if (!selector) {
      return { success: false, error: '选择器不能为空' };
    }
    
    const cleanedSelector = selector.trim().replace(/[`'"“”''""``]/g, '');
    
    const element = document.querySelector(cleanedSelector);
    if (!element) {
      return { success: false, error: `未找到匹配选择器的元素: ${selector}` };
    }
    element.click();
    return { success: true, message: `已成功点击元素: ${selector}` };
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
      const element = document.querySelector(selector);
      
      if (!element) {
        results.push({ selector, success: false, error: '未找到元素' });
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

          // 标准表单控件（input / textarea）
          element.value = value;
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
            results.push({ selector, success: false, error: '未找到匹配的选项' });
            return;
          }
        } else if (fieldType === 'checkbox') {
          element.checked = value === 'true' || value === true;
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (fieldType === 'radio') {
          const radio = document.querySelector(`${selector}[value="${value}"]`);
          if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            results.push({ selector, success: false, error: '未找到匹配的单选按钮' });
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
      message: `表单填充完成，成功 ${successCount}/${fields.length} 个字段`,
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
    const { target = 'selector', selector, x = 0, y = 0, behavior = 'smooth' } = options;
    
    if (target === 'top') {
      window.scrollTo({ top: 0, left: 0, behavior });
    } else if (target === 'bottom') {
      window.scrollTo({ top: document.body.scrollHeight, left: 0, behavior });
    } else if (target === 'coordinates') {
      window.scrollTo({ top: y, left: x, behavior });
    } else if (target === 'selector' && selector) {
      const element = document.querySelector(selector);
      if (!element) {
        return { success: false, error: `未找到元素: ${selector}` };
      }
      element.scrollIntoView({ behavior, block: 'center' });
    } else {
      return { success: false, error: '无效的滚动目标或缺少选择器' };
    }
    
    return { success: true, message: '滚动完成' };
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
      const el = document.querySelector(selector);
      
      if (state === 'appeared' && el) {
        resolve({ success: true, message: `元素 ${selector} 已出现`, element: selector });
        return;
      }
      
      if (state === 'disappeared' && !el) {
        resolve({ success: true, message: `元素 ${selector} 已消失` });
        return;
      }
      
      if (state === 'visible' && el && isElementTrulyVisible(el)) {
        resolve({ success: true, message: `元素 ${selector} 已可见`, element: selector });
        return;
      }
      
      if (state === 'hidden' && (!el || !isElementTrulyVisible(el))) {
        resolve({ success: true, message: `元素 ${selector} 已隐藏` });
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        resolve({ success: false, error: `等待超时（${timeout}ms），元素 ${selector} 未达到 ${state} 状态` });
        return;
      }
      
      setTimeout(check, 100);
    };
    
    check();
  });
}

/**
 * 模拟键盘输入
 */
export function keyboardInput({ key, text, ctrlKey = false, shiftKey = false, altKey = false }) {
  try {
    const activeElement = document.activeElement;

    if (!activeElement) {
      return { success: false, error: '没有聚焦的元素' };
    }

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
          // 标准 input/textarea：使用 native setter 绕过 React 的值托管
          const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, 'value'
          ) || Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype, 'value'
          );

          if (nativeSetter && nativeSetter.set) {
            nativeSetter.set.call(activeElement, activeElement.value + text);
          } else {
            activeElement.value += text;
          }
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
      const eventInit = {
        key: key,
        code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
        keyCode: key.toUpperCase().charCodeAt(0),
        which: key.toUpperCase().charCodeAt(0),
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
    
    return { success: true, message: '键盘输入成功' };
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
      const source = document.querySelector(sourceSelector);
      const target = document.querySelector(targetSelector);
      
      if (!source) {
        resolve({ success: false, error: `未找到源元素: ${sourceSelector}` });
        return;
      }
      
      if (!target) {
        resolve({ success: false, error: `未找到目标元素: ${targetSelector}` });
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
        message: `[实验性] 已尝试拖拽 ${sourceSelector} → ${targetSelector}（拖拽模拟在浏览器中为部分支持，可能未生效）`
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
    const input = document.querySelector(selector);
    
    if (!input) {
      return { success: false, error: `未找到文件上传控件: ${selector}` };
    }
    
    if (input.type !== 'file') {
      return { success: false, error: `选择的元素不是文件上传控件` };
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
    
    return { success: true, message: `已上传文件: ${fileName}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 滚动到元素可见
 */
export function scrollIntoView(selector, align = 'center', smooth = true) {
  try {
    const el = document.querySelector(selector);
    
    if (!el) {
      return { success: false, error: `未找到元素: ${selector}` };
    }
    
    el.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      block: align
    });
    
    return { success: true, message: `已滚动到元素: ${selector}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 监听元素变化
 */
export function watchElement(selector, duration = 30000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    
    if (!el) {
      resolve({ success: false, error: `未找到元素: ${selector}` });
      return;
    }
    
    const changes = [];
    const startTime = Date.now();
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        changes.push({
          type: mutation.type,
          target: mutation.target.nodeName,
          addedCount: mutation.addedNodes.length,
          removedCount: mutation.removedNodes.length,
          attributeName: mutation.attributeName
        });
      });
    });
    
    observer.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
    
    // 超时后返回结果
    setTimeout(() => {
      observer.disconnect();
      resolve({
        success: true,
        message: `监听结束，共捕获 ${changes.length} 次变化`,
        duration: Date.now() - startTime,
        changes: changes.slice(0, 50) // 限制返回数量
      });
    }, duration);
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
          return { success: true, data: allData };
        }
        const getValue = target.getItem(key);
        return { success: true, value: getValue };
        
      case 'set':
        if (!key || value === undefined) {
          return { success: false, error: 'set操作需要提供key和value' };
        }
        target.setItem(key, value);
        return { success: true, message: `已设置 ${key}` };
        
      case 'remove':
        if (!key) {
          return { success: false, error: 'remove操作需要提供key' };
        }
        target.removeItem(key);
        return { success: true, message: `已删除 ${key}` };
        
      case 'clear':
        target.clear();
        return { success: true, message: '已清空存储' };
        
      default:
        return { success: false, error: `未知操作: ${action}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 获取元素位置尺寸
 */
export function getElementRect(selector) {
  try {
    const el = document.querySelector(selector);
    
    if (!el) {
      return { success: false, error: `未找到元素: ${selector}` };
    }
    
    const rect = el.getBoundingClientRect();
    const styles = window.getComputedStyle(el);
    
    return {
      success: true,
      element: selector,
      viewport: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      },
      margin: {
        top: styles.marginTop,
        right: styles.marginRight,
        bottom: styles.marginBottom,
        left: styles.marginLeft
      },
      padding: {
        top: styles.paddingTop,
        right: styles.paddingRight,
        bottom: styles.paddingBottom,
        left: styles.paddingLeft
      },
      border: {
        top: styles.borderTopWidth,
        right: styles.borderRightWidth,
        bottom: styles.borderBottomWidth,
        left: styles.borderLeftWidth
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 获取计算样式
 */
export function getComputedStyleTool(selector, properties = null) {
  try {
    const el = document.querySelector(selector);
    
    if (!el) {
      return { success: false, error: `未找到元素: ${selector}` };
    }
    
    const computed = window.getComputedStyle(el);
    
    // 默认属性
    const defaultProps = [
      'display', 'visibility', 'opacity', 'width', 'height',
      'position', 'top', 'left', 'right', 'bottom',
      'margin', 'padding', 'border',
      'background', 'backgroundColor', 'backgroundImage',
      'color', 'fontSize', 'fontFamily', 'fontWeight',
      'textAlign', 'lineHeight', 'overflow', 'overflowX', 'overflowY',
      'flexDirection', 'justifyContent', 'alignItems', 'flex',
      'gridTemplateColumns', 'gridTemplateRows',
      'zIndex', 'transform', 'transition'
    ];
    
    const props = properties || defaultProps;
    const result = {};
    
    props.forEach(prop => {
      try {
        result[prop] = computed.getPropertyValue(prop) || computed[prop];
      } catch (e) {
        result[prop] = computed[prop];
      }
    });
    
    return {
      success: true,
      element: selector,
      styles: result
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 绑定函数名（因为我们不能重命名getComputedStyle）
export const getComputedStyle = getComputedStyleTool;

/**
 * 取色器
 */
export function pickColor() {
  return new Promise((resolve, reject) => {
    if (!('EyeDropper' in window)) {
      resolve({ success: false, error: '您的浏览器不支持 EyeDropper API' });
      return;
    }
    
    const eyeDropper = new EyeDropper();
    
    eyeDropper.open()
      .then(result => {
        resolve({
          success: true,
          color: result.sRGBHex,
          message: `已取色: ${result.sRGBHex}`
        });
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          resolve({ success: false, error: '用户取消了取色' });
        } else {
          resolve({ success: false, error: err.message });
        }
      });
  });
}

/**
 * 页面差异对比
 */
export function diffPage(action, snapshotName = 'default') {
  try {
    if (action === 'snapshot') {
      // 保存快照
      pageSnapshot = {
        name: snapshotName,
        timestamp: Date.now(),
        html: document.body.innerHTML,
        url: window.location.href
      };
      
      return {
        success: true,
        message: `已保存快照: ${snapshotName}`,
        snapshot: {
          name: snapshotName,
          timestamp: pageSnapshot.timestamp,
          url: pageSnapshot.url
        }
      };
    } else if (action === 'compare') {
      if (!pageSnapshot) {
        return { success: false, error: '没有可用的快照，请先保存快照' };
      }
      
      if (pageSnapshot.url !== window.location.href) {
        return { success: false, error: '页面URL已变更，无法对比' };
      }
      
      // 简单的文本差异对比
      const currentHtml = document.body.innerHTML;
      const oldHtml = pageSnapshot.html;
      
      // 计算新增和删除的内容
      const added = currentHtml.length - oldHtml.length;
      
      return {
        success: true,
        message: '对比完成',
        snapshot: {
          name: pageSnapshot.name,
          timestamp: pageSnapshot.timestamp
        },
        current: {
          timestamp: Date.now()
        },
        sizeChange: added,
        hasChanges: currentHtml !== oldHtml
      };
    }
    
    return { success: false, error: `未知操作: ${action}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 文字转语音
 */
export function textToSpeech(text, lang = 'zh-CN', rate = 1, pitch = 1) {
  try {
    if (!('speechSynthesis' in window)) {
      return { success: false, error: '您的浏览器不支持语音合成' };
    }
    
    // 停止之前的朗读
    if (currentUtterance) {
      speechSynthesis.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    
    currentUtterance = utterance;
    
    return new Promise((resolve) => {
      utterance.onend = () => {
        currentUtterance = null;
        resolve({ success: true, message: '朗读完成' });
      };
      
      utterance.onerror = (event) => {
        currentUtterance = null;
        resolve({ success: false, error: event.error });
      };
      
      speechSynthesis.speak(utterance);
      resolve({ success: true, message: '开始朗读...' });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
}
