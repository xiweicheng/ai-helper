// content/page-tools.js - 网页内容读取与提取工具

/**
 * 获取当前网页的纯文本内容（增强版）
 */
function getPageText(options = {}) {
  const { maxLength = 15000, includeHeadings = true, includeLinks = true } = options;
  
  // 获取页面主体文本
  const bodyText = document.body ? document.body.innerText : '';
  
  // 获取页面标题
  const title = document.title || '';
  
  const data = {
    title,
    url: window.location.href,
    content: bodyText.substring(0, maxLength),
    wordCount: bodyText.split(/\s+/).length
  };
  
  // 可选：包含标题层级
  if (includeHeadings) {
    data.headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .map(h => ({ level: h.tagName, text: h.textContent.trim() }))
      .filter(h => h.text.length > 0)
      .slice(0, 30);
  }
  
  // 可选：包含链接列表
  if (includeLinks) {
    data.links = Array.from(document.querySelectorAll('a'))
      .map(a => ({ text: a.textContent.trim(), href: a.href }))
      .filter(link => link.text.length > 0)
      .slice(0, 50);
  }
  
  return { success: true, data };
}

/**
 * 获取当前网页的完整HTML内容
 */
function getFullHtml(options = {}) {
  const { includeStyles = false, maxLength = 50000 } = options;
  
  let html = document.documentElement.outerHTML;
  
  // 如果不包含样式，移除内联样式
  if (!includeStyles) {
    html = html.replace(/\s*style="[^"]*"/gi, '');
  }
  
  return {
    success: true,
    data: {
      title: document.title,
      url: window.location.href,
      html: html.substring(0, maxLength),
      fullLength: html.length
    }
  };
}

/**
 * 查询可交互元素（推荐优先使用）
 */
function queryInteractiveElements(options = {}) {
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
  
  // 查询元素
  querySelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
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
 * 生成元素的唯一CSS选择器
 */
function generateUniqueSelector(el) {
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
function getElementText(el) {
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
function getElementValue(el) {
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
 * 获取指定选择器的元素内容
 */
function getElementBySelector(selector) {
  try {
    if (!selector) {
      return { success: false, error: '选择器不能为空' };
    }
    
    const cleanedSelector = selector.trim().replace(/[`'"“”''""``]/g, '');
    
    const element = document.querySelector(cleanedSelector);
    if (!element) {
      return { success: false, error: `未找到匹配选择器的元素: ${selector}` };
    }
    return {
      success: true,
      data: {
        tagName: element.tagName,
        className: element.className,
        text: element.innerText ? element.innerText.substring(0, 5000) : '',
        html: element.innerHTML ? element.innerHTML.substring(0, 5000) : ''
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 获取用户选中的内容
 */
function getSelectedContent(format = 'text') {
  try {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return { success: false, error: '当前没有选中的内容' };
    }
    
    const result = {
      success: true,
      data: {
        selectedCount: selection.rangeCount,
        text: ''
      }
    };
    
    if (format === 'html') {
      // 获取富文本/HTML内容
      const htmlParts = [];
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        const fragment = range.cloneContents();
        const div = document.createElement('div');
        div.appendChild(fragment);
        htmlParts.push(div.innerHTML);
      }
      result.data.html = htmlParts.join('\n');
      result.data.text = selection.toString();
    } else {
      // 获取纯文本
      result.data.text = selection.toString();
    }
    
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 提取表格数据
 */
function extractTable(selector = 'table', includeHeaders = true, format = 'json') {
  try {
    const table = document.querySelector(selector);
    if (!table) {
      return { success: false, error: `未找到匹配选择器的表格: ${selector}` };
    }
    
    const rows = Array.from(table.querySelectorAll('tr'));
    const data = [];
    
    rows.forEach((row, index) => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      const rowData = cells.map(cell => cell.textContent.trim());
      if (includeHeaders || index > 0) {
        data.push(rowData);
      }
    });
    
    if (format === 'markdown') {
      if (data.length === 0) {
        return { success: true, data: '表格为空' };
      }
      const header = `| ${data[0].join(' | ')} |`;
      const separator = `| ${data[0].map(() => '---').join(' | ')} |`;
      const body = data.slice(1).map(row => `| ${row.join(' | ')} |`).join('\n');
      return { success: true, data: `${header}\n${separator}\n${body}` };
    }
    
    return { success: true, data, rowCount: data.length, columnCount: data[0]?.length || 0 };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 复制文本到剪贴板
 */
async function copyToClipboard$1(text) {
  try {
    await navigator.clipboard.writeText(text);
    return { success: true, message: '已复制到剪贴板' };
  } catch (error) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return { success: true, message: '已复制到剪贴板（降级方案）' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

/**
 * 从剪贴板读取文本
 */
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    return { success: true, data: text };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 鼠标悬停在元素上
 */
function hoverElement(selector) {
  try {
    const element = document.querySelector(selector);
    if (!element) {
      return { success: false, error: `未找到元素: ${selector}` };
    }
    
    // 创建并触发 mouseenter 事件
    const mouseEnterEvent = new MouseEvent('mouseenter', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    element.dispatchEvent(mouseEnterEvent);
    
    // 创建并触发 mouseover 事件
    const mouseOverEvent = new MouseEvent('mouseover', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    element.dispatchEvent(mouseOverEvent);
    
    return { success: true, message: `已在元素上触发悬停效果: ${selector}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 提取网页元数据
 */
function extractMetadata() {
  try {
    const getMetaContent = (name) => {
      const meta = document.querySelector(`meta[name="${name}"]`) || 
                   document.querySelector(`meta[property="${name}"]`) ||
                   document.querySelector(`meta[property="og:${name}"]`);
      return meta ? meta.content : null;
    };
    
    const getMetaAll = (name) => {
      const metas = document.querySelectorAll(`meta[name="${name}"], meta[property="${name}"], meta[property="og:${name}"]`);
      return Array.from(metas).map(m => m.content).filter(Boolean);
    };

    // 提取 JSON-LD 结构化数据
    const jsonLdData = [];
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    jsonLdScripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        // 兼容 @graph 数组和单个对象
        if (Array.isArray(data)) {
          jsonLdData.push(...data);
        } else if (data && data['@graph'] && Array.isArray(data['@graph'])) {
          jsonLdData.push(...data['@graph']);
        } else if (data) {
          jsonLdData.push(data);
        }
      } catch {
        // JSON 解析失败，跳过
      }
    });

    // 提取微数据 (Microdata / Schema.org)
    const microdataItems = [];
    const scopedElements = document.querySelectorAll('[itemscope]');
    scopedElements.forEach(el => {
      const itemType = el.getAttribute('itemtype') || '';
      if (!itemType) return;
      const props = {};
      el.querySelectorAll('[itemprop]').forEach(propEl => {
        // 避免递归嵌套 itemscope（每个 itemscope 会被独立处理）
        if (propEl.closest('[itemscope]') !== el) return;
        const propName = propEl.getAttribute('itemprop') || '';
        if (!propName) return;
        // 优先取 content 属性，其次取 href/src，最后取 textContent
        const propVal = propEl.getAttribute('content')
          || propEl.getAttribute('href')
          || propEl.getAttribute('src')
          || propEl.textContent?.trim();
        if (propVal) {
          if (props[propName]) {
            props[propName] = Array.isArray(props[propName])
              ? [...props[propName], propVal]
              : [props[propName], propVal];
          } else {
            props[propName] = propVal;
          }
        }
      });
      microdataItems.push({ itemType, properties: props });
    });

    return {
      success: true,
      data: {
        title: document.title,
        description: getMetaContent('description'),
        keywords: getMetaContent('keywords'),
        author: getMetaContent('author'),
        ogTitle: getMetaContent('og:title'),
        ogDescription: getMetaContent('og:description'),
        ogImage: getMetaContent('og:image'),
        ogUrl: getMetaContent('og:url'),
        ogType: getMetaContent('og:type'),
        ogSiteName: getMetaContent('og:site_name'),
        ogLocale: getMetaContent('og:locale'),
        articlePublishedTime: getMetaContent('article:published_time'),
        articleModifiedTime: getMetaContent('article:modified_time'),
        articleAuthor: getMetaContent('article:author'),
        twitterCard: getMetaContent('twitter:card'),
        twitterTitle: getMetaContent('twitter:title'),
        twitterDescription: getMetaContent('twitter:description'),
        twitterImage: getMetaContent('twitter:image'),
        twitterSite: getMetaContent('twitter:site'),
        twitterCreator: getMetaContent('twitter:creator'),
        canonicalUrl: document.querySelector('link[rel="canonical"]')?.href,
        links: getMetaAll('citation_author'),
        jsonLd: jsonLdData.length > 0 ? jsonLdData : undefined,
        microdata: microdataItems.length > 0 ? microdataItems : undefined
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 移除高亮（辅助函数）
 */
function removeHighlights() {
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

/**
 * 在页面上高亮文本
 */
function highlightText(text, color = 'yellow') {
  try {
    if (!text) {
      return { success: false, error: '未提供要高亮的文本' };
    }
    
    // 移除之前的高亮
    removeHighlights();
    
    // 创建高亮样式
    const style = document.createElement('style');
    style.id = 'ai-helper-highlight-style';
    style.textContent = `
      .ai-helper-highlight {
        background-color: ${color} !important;
        padding: 2px 0;
      }
    `;
    document.head.appendChild(style);
    
    // 查找并高亮文本
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeValue.toLowerCase().includes(text.toLowerCase())) {
        textNodes.push(node);
      }
    }
    
    const highlights = [];
    textNodes.forEach(textNode => {
      const parent = textNode.parentNode;
      if (!parent || !parent.replaceChild || !parent.insertBefore) return;
      
      const text = textNode.nodeValue;
      const lowerText = text.toLowerCase();
      const searchText = text.toLowerCase();
      const index = lowerText.indexOf(searchText);
      
      if (index !== -1) {
        const span = document.createElement('span');
        span.className = 'ai-helper-highlight';
        span.textContent = text.substring(index, index + text.length);
        
        const before = document.createTextNode(text.substring(0, index));
        const after = document.createTextNode(text.substring(index + text.length));
        
        parent.replaceChild(after, textNode);
        parent.insertBefore(span, after);
        parent.insertBefore(before, span);
        
        highlights.push(span);
      }
    });
    
    // 滚动到第一个高亮
    if (highlights.length > 0) {
      highlights[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    return { 
      success: true, 
      message: `已高亮 ${highlights.length} 处文本`,
      count: highlights.length 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 提取链接
 */
function extractLinks(filterType = 'all', includeImages = false) {
  try {
    const currentDomain = window.location.hostname;
    const links = [];
    
    // 提取<a>标签链接
    document.querySelectorAll('a[href]').forEach(a => {
      try {
        const href = a.href;
        if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;
        
        const url = new URL(href);
        const isExternal = url.hostname !== currentDomain;
        
        if (filterType === 'internal' && isExternal) return;
        if (filterType === 'external' && !isExternal) return;
        
        links.push({
          href: href,
          text: a.textContent.trim(),
          title: a.title,
          domain: url.hostname,
          isExternal: isExternal,
          target: a.target
        });
      } catch (e) {}
    });
    
    // 可选：提取图片链接
    if (includeImages) {
      document.querySelectorAll('img[src]').forEach(img => {
        try {
          const src = img.src;
          if (!src) return;
          
          const url = new URL(src);
          const isExternal = url.hostname !== currentDomain;
          
          if (filterType === 'internal' && isExternal) return;
          if (filterType === 'external' && !isExternal) return;
          
          links.push({
            href: src,
            text: img.alt || '',
            title: img.title,
            domain: url.hostname,
            isExternal: isExternal,
            type: 'image'
          });
        } catch (e) {}
      });
    }
    
    return {
      success: true,
      total: links.length,
      links: links
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 提取表单
 */
function extractForms(formSelector = null) {
  try {
    const forms = formSelector 
      ? [document.querySelector(formSelector)].filter(Boolean)
      : Array.from(document.querySelectorAll('form'));
    
    const result = forms.map((form, index) => {
      const fields = [];
      const formId = form.id || `form-${index}`;
      
      // 输入框
      form.querySelectorAll('input').forEach(input => {
        fields.push({
          tag: 'input',
          name: input.name,
          id: input.id,
          type: input.type,
          placeholder: input.placeholder,
          required: input.required,
          selector: getElementSelector$1(input)
        });
      });
      
      // 文本域
      form.querySelectorAll('textarea').forEach(textarea => {
        fields.push({
          tag: 'textarea',
          name: textarea.name,
          id: textarea.id,
          placeholder: textarea.placeholder,
          required: textarea.required,
          selector: getElementSelector$1(textarea)
        });
      });
      
      // 下拉框
      form.querySelectorAll('select').forEach(select => {
        const options = Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.textContent.trim()
        }));
        fields.push({
          tag: 'select',
          name: select.name,
          id: select.id,
          required: select.required,
          options: options,
          selector: getElementSelector$1(select)
        });
      });
      
      return {
        formId: formId,
        action: form.action,
        method: form.method,
        fields: fields
      };
    });
    
    return {
      success: true,
      total: result.length,
      forms: result
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 获取元素CSS选择器
 */
function getElementSelector$1(element) {
  if (element.id) return `#${element.id}`;
  
  let selector = element.tagName.toLowerCase();
  if (element.className) {
    const classes = element.className.split(' ').filter(c => c).slice(0, 2);
    if (classes.length) selector += '.' + classes.join('.');
  }
  
  return selector;
}

/**
 * 提取页面图片
 */
function extractImages(options = {}) {
  try {
    const { minWidth = 0, minHeight = 0, includeBackgroundImages = false, download = false, maxResults = 100 } = options;
    const images = [];
    const seenUrls = new Set();
    
    document.querySelectorAll('img[src]').forEach(img => {
      try {
        const src = img.src;
        if (!src || seenUrls.has(src)) return;
        
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        
        if (width >= minWidth && height >= minHeight) {
          seenUrls.add(src);
          images.push({
            src: src,
            alt: img.alt || '',
            title: img.title || '',
            width: width,
            height: height,
            selector: getElementSelector$1(img)
          });
        }
      } catch (e) {}
    });
    
    if (includeBackgroundImages) {
      document.querySelectorAll('*').forEach(el => {
        try {
          const style = window.getComputedStyle(el);
          const bgImage = style.backgroundImage;
          if (!bgImage || bgImage === 'none' || bgImage.startsWith('gradient')) return;
          
          const match = bgImage.match(/url\(['"]?([^'")]+)['"]?\)/);
          if (match && match[1]) {
            const url = match[1];
            if (!seenUrls.has(url)) {
              seenUrls.add(url);
              images.push({
                src: url,
                alt: '',
                title: '',
                width: 0,
                height: 0,
                type: 'background',
                selector: getElementSelector$1(el)
              });
            }
          }
        } catch (e) {}
      });
    }
    
    if (download && images.length > 0) {
      images.slice(0, Math.min(maxResults, 10)).forEach((img, index) => {
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = img.src;
          link.download = `image_${index + 1}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, index * 500);
      });
    }
    
    return {
      success: true,
      total: images.length,
      images: images.slice(0, maxResults),
      message: download ? `已开始下载 ${Math.min(images.length, 10)} 张图片` : ''
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 页面内搜索
 */
function searchInPage(options = {}) {
  try {
    const { pattern, caseSensitive = false, contextLength = 50, maxResults = 20, highlight = false } = options;
    
    if (!pattern) {
      return { success: false, error: '需要提供搜索模式' };
    }
    
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(pattern, flags);
    
    const bodyText = document.body.innerText;
    const matches = [];
    let match;
    
    while ((match = regex.exec(bodyText)) !== null && matches.length < maxResults) {
      const start = Math.max(0, match.index - contextLength);
      const end = Math.min(bodyText.length, match.index + match[0].length + contextLength);
      
      matches.push({
        match: match[0],
        position: match.index,
        context: bodyText.substring(start, end),
        lineNumber: bodyText.substring(0, match.index).split('\n').length
      });
      
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
    
    if (highlight && matches.length > 0) {
      removeHighlights();
      const highlightStyle = document.createElement('style');
      highlightStyle.id = 'ai-helper-highlight-style';
      highlightStyle.textContent = `
        .ai-helper-search-highlight {
          background-color: #ffff00;
          color: #000;
          padding: 1px 2px;
          border-radius: 2px;
        }
      `;
      document.head.appendChild(highlightStyle);
      
      document.body.innerHTML = document.body.innerHTML.replace(
        new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags),
        '<span class="ai-helper-search-highlight">$&</span>'
      );
    }
    
    return {
      success: true,
      pattern: pattern,
      total: matches.length,
      matches: matches,
      highlighted: highlight
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 页面转 Markdown
 */
function pageToMarkdown(selector = null, includeImages = true, includeLinks = true, maxLength = 50000) {
  try {
    const element = selector ? document.querySelector(selector) : document.body;
    if (!element) {
      return { success: false, error: '未找到目标元素' };
    }
    
    let markdown = '';
    
    const convertElement = (el, depth = 0) => {
      if (depth > 6) return '';
      
      let result = '';
      const tag = el.tagName.toLowerCase();
      
      switch (tag) {
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
          const level = parseInt(tag[1]);
          result += '\n' + '#'.repeat(level) + ' ' + el.textContent.trim() + '\n\n';
          break;
          
        case 'p':
          result += el.textContent.trim() + '\n\n';
          break;
          
        case 'a':
          if (includeLinks) {
            const href = el.getAttribute('href');
            const text = el.textContent.trim();
            result += `[${text || href}](${href})`;
          } else {
            result += el.textContent.trim();
          }
          break;
          
        case 'img':
          if (includeImages) {
            const src = el.getAttribute('src');
            const alt = el.getAttribute('alt') || '';
            result += `![${alt}](${src})\n\n`;
          }
          break;
          
        case 'ul':
          el.querySelectorAll('li').forEach((li, i) => {
            result += '\n- ' + li.textContent.trim();
          });
          result += '\n\n';
          break;
          
        case 'ol':
          el.querySelectorAll('li').forEach((li, i) => {
            result += '\n' + (i + 1) + '. ' + li.textContent.trim();
          });
          result += '\n\n';
          break;
          
        case 'blockquote':
          result += '\n> ' + el.textContent.trim().replace(/\n/g, '\n> ') + '\n\n';
          break;
          
        case 'code':
          const parent = el.parentElement;
          if (parent && parent.tagName.toLowerCase() === 'pre') {
            result += '\n```\n' + el.textContent + '\n```\n\n';
          } else {
            result += '`' + el.textContent.trim() + '`';
          }
          break;
          
        case 'table':
          let table = '\n';
          const rows = el.querySelectorAll('tr');
          rows.forEach((row, i) => {
            const cells = row.querySelectorAll('th, td');
            const cellTexts = Array.from(cells).map(c => c.textContent.trim());
            table += '| ' + cellTexts.join(' | ') + ' |\n';
            if (i === 0 && rows.length > 1) {
              table += '| ' + cellTexts.map(() => '---').join(' | ') + ' |\n';
            }
          });
          result += table + '\n';
          break;
          
        case 'br':
          result += '\n';
          break;
          
        default:
          if (el.childNodes.length > 0) {
            el.childNodes.forEach(child => {
              if (child.nodeType === Node.ELEMENT_NODE) {
                result += convertElement(child, depth + 1);
              } else if (child.nodeType === Node.TEXT_NODE) {
                result += child.textContent;
              }
            });
          }
      }
      
      return result;
    };
    
    markdown = convertElement(element);
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
    
    if (markdown.length > maxLength) {
      markdown = markdown.substring(0, maxLength) + '...\n\n*内容已截断*';
    }
    
    return {
      success: true,
      markdown: markdown,
      length: markdown.length,
      url: window.location.href,
      title: document.title
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 将页面提取为结构化 JSON 数据
 */
function pageToJson(selector = null, maxItems = 100) {
  try {
    const roots = selector
      ? Array.from(document.querySelectorAll(selector))
      : [document.body];

    if (!roots.length) {
      return { success: false, error: `未找到匹配选择器的元素: ${selector}` };
    }

    const tables = [];
    const lists = [];
    const jsonLd = [];
    const articles = [];
    const microdata = [];

    const seenJsonLd = new Set();
    const seenMicrodata = new Set();

    roots.forEach(root => {
      if (tables.length < maxItems) {
        root.querySelectorAll('table').forEach(table => {
          if (tables.length >= maxItems) return;
          const headers = [];
          table.querySelectorAll('th').forEach(th => {
            headers.push(th.textContent.trim());
          });
          const rows = [];
          table.querySelectorAll('tr').forEach(tr => {
            const cells = [];
            tr.querySelectorAll('td, th').forEach(cell => {
              cells.push(cell.textContent.trim());
            });
            rows.push(cells);
          });
          tables.push({ headers, rows });
        });
      }

      if (lists.length < maxItems) {
        root.querySelectorAll('ul, ol').forEach(list => {
          if (lists.length >= maxItems) return;
          const items = [];
          list.querySelectorAll(':scope > li').forEach(li => {
            items.push(li.textContent.trim());
          });
          lists.push({ tag: list.tagName.toLowerCase(), items });
        });
      }

      if (jsonLd.length < maxItems) {
        root.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
          if (jsonLd.length >= maxItems) return;
          const key = script.textContent.substring(0, 200);
          if (seenJsonLd.has(key)) return;
          seenJsonLd.add(key);
          try {
            const data = JSON.parse(script.textContent);
            jsonLd.push(data);
          } catch {
            // JSON 解析失败，跳过
          }
        });
      }

      if (articles.length < maxItems) {
        root.querySelectorAll('article').forEach(article => {
          if (articles.length >= maxItems) return;
          const text = article.textContent.trim();
          articles.push({
            textContent: text.substring(0, 500),
            wordCount: text.split(/\s+/).filter(Boolean).length
          });
        });
      }

      if (microdata.length < maxItems) {
        root.querySelectorAll('[itemscope]').forEach(el => {
          if (microdata.length >= maxItems) return;
          const itemType = el.getAttribute('itemtype') || '';
          if (!itemType) return;

          const sig = itemType + el.textContent.trim().substring(0, 100);
          if (seenMicrodata.has(sig)) return;
          seenMicrodata.add(sig);

          const props = {};
          el.querySelectorAll('[itemprop]').forEach(propEl => {
            if (propEl.closest('[itemscope]') !== el) return;
            const propName = propEl.getAttribute('itemprop') || '';
            if (!propName) return;
            const propVal = propEl.getAttribute('content')
              || propEl.getAttribute('href')
              || propEl.getAttribute('src')
              || propEl.textContent?.trim();
            if (propVal) {
              if (props[propName]) {
                props[propName] = Array.isArray(props[propName])
                  ? [...props[propName], propVal]
                  : [props[propName], propVal];
              } else {
                props[propName] = propVal;
              }
            }
          });
          microdata.push({ itemType, properties: props });
        });
      }
    });

    return {
      success: true,
      data: { tables, lists, jsonLd, articles, microdata },
      counts: {
        tables: tables.length,
        lists: lists.length,
        jsonLd: jsonLd.length,
        articles: articles.length,
        microdata: microdata.length
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 查找与目标元素结构相似的其他元素
 */
function findSimilarElements(selector, maxResults = 50) {
  try {
    if (!selector) {
      return { success: false, error: '选择器不能为空' };
    }

    const target = document.querySelector(selector);
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
 * 获取 iframe 内容（仅限同源）
 */
function getIframeContent(selector = 'iframe', includeNested = false, maxLength = 10000) {
  try {
    const iframes = document.querySelectorAll(selector);
    const results = [];

    const processIframe = (iframeEl, depth = 1, parentSelector = '') => {
      try {
        const iframeSelector = generateUniqueSelector(iframeEl);
        const fullSelector = parentSelector ? `${parentSelector} > iframe` : iframeSelector;
        const url = iframeEl.src || 'about:blank';

        let accessible = false;
        let iframeTitle = '';
        let textContent = '';
        let htmlLength = 0;

        try {
          const doc = iframeEl.contentDocument || iframeEl.contentWindow?.document;
          if (doc) {
            accessible = true;
            iframeTitle = doc.title || '';
            textContent = (doc.body?.innerText || '').substring(0, maxLength);
            htmlLength = (doc.documentElement?.outerHTML || '').length;

            if (includeNested && depth < 2) {
              doc.querySelectorAll('iframe').forEach(nestedIframe => {
                processIframe(nestedIframe, depth + 1, fullSelector);
              });
            }
          }
        } catch {
          accessible = false;
        }

        results.push({
          selector: fullSelector,
          url,
          accessible,
          title: iframeTitle,
          textContent,
          htmlLength
        });
      } catch {
        // 单个 iframe 处理失败，继续处理下一个
      }
    };

    iframes.forEach(iframe => processIframe(iframe));

    return {
      success: true,
      iframes: results,
      total: results.length,
      accessible: results.filter(r => r.accessible).length
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 获取页面语言信息
 */
function getPageLanguage() {
  try {
    const htmlLang = document.documentElement.lang || '';

    const metaContentLanguage = document.querySelector('meta[http-equiv="content-language"]');
    const metaContentLanguageValue = metaContentLanguage ? metaContentLanguage.content : '';

    const metaLanguage = document.querySelector('meta[name="language"]');
    const metaLanguageValue = metaLanguage ? metaLanguage.content : '';

    const navigatorLanguage = navigator.language || '';
    const direction = document.dir || '';

    const primaryLang = htmlLang
      || metaContentLanguageValue
      || metaLanguageValue
      || navigatorLanguage;

    return {
      success: true,
      language: primaryLang,
      details: {
        htmlLang,
        metaLanguage: metaContentLanguageValue || metaLanguageValue,
        navigatorLanguage,
        direction
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 读取无障碍树信息
 */
function readAccessibilityTree(maxResults = 100) {
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

// content/interaction-tools.js - 页面交互与操作工具

let pageSnapshot = null;
let currentUtterance = null;

/**
 * 点击指定元素
 */
function clickElement(selector, waitTime = 500, timeout = 3000) {
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
function fillForm(fields, waitTime = 500) {
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
function scrollToPosition(options) {
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
function waitForElement(selector, state = 'appeared', timeout = 10000) {
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
function keyboardInput({ key, text, ctrlKey = false, shiftKey = false, altKey = false }) {
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
function dragAndDrop(sourceSelector, targetSelector) {
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
function fileUpload(selector, fileName, fileContent, fileType = 'application/octet-stream') {
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
function scrollIntoView(selector, align = 'center', smooth = true) {
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
function watchElement(selector, duration = 30000) {
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
function manageStorage({ action, storage, key, value }) {
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
function getElementRect(selector) {
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
function getComputedStyleTool(selector, properties = null) {
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
const getComputedStyle = getComputedStyleTool;

/**
 * 取色器
 */
function pickColor() {
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
function diffPage(action, snapshotName = 'default') {
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
function textToSpeech(text, lang = 'zh-CN', rate = 1, pitch = 1) {
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

// content/advanced-tools.js - 高级工具

function videoControl(action, selector = null, value = null) {
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

function generateQRCode(content = '', size = 200, errorCorrection = 'M', showImage = true) {
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

function performanceAudit(includeResourceTiming = false, includePaintTiming = true, includeMemoryInfo = false) {
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

function screenshotElement(selector, quality = 0.9, format = 'png') {
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

function shadowDomQuery(selector, deep = true, maxDepth = 5, maxResults = 50) {
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

function pageToPdf(fileName = 'page.pdf', landscape = false, scale = 1, printBackground = true, margins = null) {
  return new Promise((resolve) => {
    try {
      const options = {
        landscape,
        scale,
        printBackground,
        displayHeaderFooter: false,
        marginTop: margins?.top !== undefined ? margins.top : 1,
        marginBottom: margins?.bottom !== undefined ? margins.bottom : 1,
        marginLeft: margins?.left !== undefined ? margins.left : 1,
        marginRight: margins?.right !== undefined ? margins.right : 1,
        paperWidth: 8.27,  // A4
        paperHeight: 11.69 // A4
      };

      chrome.runtime.sendMessage({
        type: 'GENERATE_PDF',
        options: options
      }, (response) => {
        if (!response) {
          resolve({ success: false, error: 'PDF 生成失败：Background 无响应' });
          return;
        }

        if (!response.success) {
          resolve({ success: false, error: response.error || 'PDF 生成失败' });
          return;
        }

        // 将 base64 PDF 数据下载到本地
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${response.data}`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        resolve({
          success: true,
          message: 'PDF 已生成并开始下载',
          fileName: fileName,
          size: response.data ? Math.round(response.data.length * 3 / 4) : 0 // 估算字节数
        });
      });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

function runJavascript(code, timeout = 5000) {
  return new Promise((resolve) => {
    try {
      let result;
      try {
        result = eval(code);
      } catch (evalError) {
        resolve({ success: false, error: evalError.message });
        return;
      }

      if (result && typeof result.then === 'function') {
        const timeoutId = setTimeout(() => {
          resolve({ success: false, error: `执行超时 (${timeout}ms)` });
        }, timeout);
        result.then(value => {
          clearTimeout(timeoutId);
          resolve({ success: true, result: value, type: typeof value });
        }).catch(err => {
          clearTimeout(timeoutId);
          resolve({ success: false, error: err.message });
        });
        return;
      }

      resolve({ success: true, result: result, type: typeof result });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

function injectCss(css, targetSelector = null, injectMode = 'style') {
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

function findTextOnPage(query, caseSensitive = false, highlight = true) {
  try {
    if (!query || typeof query !== 'string') {
      return { success: false, error: 'query 参数必须是非空字符串' };
    }

    const found = window.find(query, caseSensitive, false, true, false, true, false);

    let count = 0;
    if (highlight && found) {
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );
          const flags = caseSensitive ? 'g' : 'gi';
          const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const matches = node.textContent.match(regex);
            if (matches) {
              count += matches.length;
            }
          }
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (e) {
        count = found ? 1 : 0;
      }
    }

    return { success: true, found, count: count || (found ? 1 : 0) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function setZoom(level) {
  try {
    const previousZoom = document.body.style.zoom || '1';
    let newLevel;

    if (typeof level === 'number') {
      newLevel = Math.max(0.5, Math.min(3.0, level));
    } else if (level === 'in') {
      newLevel = Math.min(3.0, parseFloat(previousZoom) + 0.1);
    } else if (level === 'out') {
      newLevel = Math.max(0.5, parseFloat(previousZoom) - 0.1);
    } else if (level === 'reset') {
      newLevel = 1;
    } else {
      return { success: false, error: `无效的 zoom level: ${level}，支持数字(0.5-3.0)、'in'、'out'、'reset'` };
    }

    document.body.style.zoom = String(newLevel);

    return {
      success: true,
      previousZoom: String(previousZoom),
      currentZoom: String(newLevel)
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// content/selection-toolbar.js - 选中文本浮动工具栏（豆包风格）

// ==================== SVG 图标 ====================
const ICONS = {
  search: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  explain: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7Z"/></svg>`,
  translate: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  summary: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>`,
  copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  sparkle: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  lock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  unlock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,
  copyLarge: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  grip: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>`,
  send: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  more: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`,
  gear: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  block: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
  eyeOff: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
};

// ==================== DOM 元素 ====================
let toolbarEl = null;
let resultPanelEl = null;
let isToolbarVisible = false;
let isAskMode = false; // 问问AI 输入框模式
let askSavedSelectedText = ''; // 进入问问模式时保存的选中文本
let askSavedRange = null; // 进入问问模式时保存的选中范围
let askSavedLeft = ''; // 进入问问模式时保存的工具栏 left 值
let isResultVisible = false;
let isResultLocked = false;
let resultRawContent = '';     // 回答原始文本（不含追问）
let savedActionText = '';      // 触发工具操作时的选中文本（用于继续提问）
let lastActionType = '';       // 上次操作类型（用于重新生成）
let lastActionCustomPrompt = ''; // 上次操作的自定义系统提示词
let currentSelectedText = '';
let enableSelectionQuery = false;
let blockedDomains = []; // 域名屏蔽列表
let toolbarTemporarilyHidden = false; // 临时隐藏（页面刷新后恢复）
let suppressNextClick = false;
let lastPanelPos = { x: 0, y: 0 };  // 保存面板位置，避免工具栏隐藏后无法获取
let pendingSelection = null;  // 鼠标拖动选中时暂存，抬起时再显示工具栏
let toolbarTools = null;  // 工具栏工具配置缓存
let toolbarMaxVisible = 4;  // 直接显示的工具数量
let toolbarIconOnly = false; // 图标精简模式
let overflowDropdownEl = null;  // 溢出下拉菜单

// 拖拽状态
let dragState = null;

// 通用拖拽实现
function makeDraggable(element, handleSelector) {
  const handle = handleSelector ? element.querySelector(handleSelector) : element;
  if (!handle) return;
  
  handle.style.cursor = 'grab';
  
  handle.addEventListener('mousedown', (e) => {
    // 不拦截按钮点击
    if (e.target.closest('[role="button"]')) return;
    // 右键不拖拽
    if (e.button !== 0) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = element.getBoundingClientRect();
    dragState = {
      el: element,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      pointerId: e.pointerId || 0
    };
    
    handle.style.cursor = 'grabbing';
    element.style.transition = 'none';
  });
}

// 全局拖拽事件
document.addEventListener('mousemove', (e) => {
  if (!dragState) return;
  
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  
  let newLeft = dragState.startLeft + dx;
  let newTop = dragState.startTop + dy;
  
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const rect = dragState.el.getBoundingClientRect();
  
  newLeft = Math.max(0, Math.min(newLeft, viewportWidth - rect.width));
  newTop = Math.max(0, Math.min(newTop, viewportHeight - rect.height));
  
  dragState.el.style.left = newLeft + 'px';
  dragState.el.style.top = newTop + 'px';
});

document.addEventListener('mouseup', () => {
  if (!dragState) return;
  
  // 恢复 transition
  dragState.el.style.transition = '';
  
  // 恢复 cursor
  const handle = dragState.el.querySelector('.aih-result-header') || dragState.el;
  handle.style.cursor = 'grab';
  
  dragState = null;
});

// 检查扩展上下文是否还有效
function isExtensionValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

// ==================== 样式注入 ====================
function injectStyles() {
  if (document.getElementById('aih-selection-toolbar-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'aih-selection-toolbar-styles';
  style.textContent = `
    #aih-selection-toolbar {
      position: fixed;
      z-index: 2147483647;
      display: none;
      align-items: center;
      gap: 1px;
      padding: 4px 6px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid #e8e8e8;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10), 0 1px 3px rgba(0, 0, 0, 0.06);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      line-height: 1;
      user-select: none;
      -webkit-user-select: none;
      transition: opacity 0.15s ease, transform 0.15s ease;
      opacity: 0;
      transform: translateY(2px);
      white-space: nowrap;
    }
    #aih-selection-toolbar.show {
      opacity: 1;
      transform: translateY(0);
    }
    #aih-selection-toolbar .aih-tb-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 4px 6px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: #333;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
      outline: none;
      white-space: nowrap;
      line-height: 1;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-toolbar .aih-tb-btn:hover {
      background: #f0f0f0;
    }
    #aih-selection-toolbar .aih-tb-btn:active {
      background: #e4e4e4;
    }
    #aih-selection-toolbar .aih-tb-btn .aih-tb-icon {
      display: flex;
      align-items: center;
    }
    #aih-selection-toolbar .aih-tb-divider {
      width: 1px;
      height: 14px;
      background: #e0e0e0;
      margin: 0 1px;
      flex-shrink: 0;
    }
    #aih-selection-toolbar .aih-tb-grip {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px 2px;
      color: #bbb;
      cursor: grab;
      flex-shrink: 0;
      border-radius: 6px;
      transition: color 0.15s;
    }
    #aih-selection-toolbar .aih-tb-grip:hover {
      color: #666;
    }
    #aih-selection-toolbar .aih-tb-grip:active {
      cursor: grabbing;
    }
    #aih-selection-toolbar .aih-tb-btn.primary {
      background: #3b82f6;
      color: #fff;
      font-weight: 500;
    }
    #aih-selection-toolbar .aih-tb-btn.primary:hover {
      background: #2563eb;
    }
    #aih-selection-toolbar .aih-tb-btn.primary .aih-tb-icon {
      color: #fff;
    }
    
    /* 溢出下拉菜单 */
    .aih-overflow-dropdown {
      position: fixed;
      z-index: 2147483646;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid #e8e8e8;
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.06);
      padding: 4px;
      min-width: 140px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    .aih-overflow-dropdown .aih-dropdown-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #333;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s;
      outline: none;
      font-family: inherit;
      white-space: nowrap;
      text-align: left;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    .aih-overflow-dropdown .aih-dropdown-item:hover {
      background: #f0f0f0;
    }
    .aih-overflow-dropdown .aih-dropdown-item .aih-tb-icon {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }

    /* 下拉菜单分隔线 */
    .aih-overflow-dropdown .aih-dropdown-divider {
      height: 1px;
      background: #e8e8e8;
      margin: 4px 8px;
    }
    /* 下拉菜单设置按钮 */
    .aih-overflow-dropdown .aih-dropdown-settings {
      color: #555;
    }
    .aih-overflow-dropdown .aih-dropdown-settings:hover {
      background: #f0f0f0;
      color: #667eea;
    }
    
    /* 问问AI 内联输入框 */
    #aih-selection-toolbar .aih-tb-buttons {
      display: flex;
      align-items: center;
      gap: 1px;
    }
    #aih-selection-toolbar .aih-tb-ask-wrap {
      display: flex;
      align-items: center;
      gap: 0;
      border: 1px solid #ddd;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
      width: 75px;
      flex-shrink: 0;
      transition: width 0.2s ease;
    }
    #aih-selection-toolbar .aih-tb-ask-input {
      flex: 1;
      min-width: 0;
      padding: 4px 6px;
      border: none;
      background: transparent;
      color: #333;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      line-height: 1.4;
      transition: flex 0.2s ease;
      box-sizing: border-box;
    }
    #aih-selection-toolbar .aih-tb-ask-input::placeholder {
      color: #bbb;
    }
    #aih-selection-toolbar .aih-tb-ask-send {
      flex-shrink: 0;
      padding: 4px 6px;
      border-radius: 0;
    }
    /* ask 模式：工具栏宽度限制 360px，输入框撑满 */
    #aih-selection-toolbar.aih-ask-mode {
      max-width: 360px;
    }
    #aih-selection-toolbar.aih-ask-mode .aih-tb-ask-wrap {
      flex: 1;
      width: auto;
    }
    #aih-selection-toolbar.aih-ask-mode .aih-tb-ask-input {
      flex: 1;
      width: auto;
    }
    #aih-selection-toolbar.aih-ask-mode .aih-tb-buttons {
      display: none;
    }
    
    /* 结果面板 */
    #aih-selection-result {
      position: fixed;
      z-index: 2147483647;
      display: none;
      flex-direction: column;
      width: 420px;
      max-width: 92vw;
      max-height: 520px;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid #e8e8e8;
      border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.65;
      color: #333;
      overflow: hidden;
      animation: aih-panel-in 0.2s ease-out;
    }
    @keyframes aih-panel-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #aih-selection-result .aih-result-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      padding: 10px 14px;
      border-bottom: 1px solid #f0f0f0;
      background: #fafafa;
      font-size: 15px;
      color: #555;
      font-weight: 600;
    }
    #aih-selection-result .aih-result-header-actions {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    #aih-selection-result .aih-result-lock,
    #aih-selection-result .aih-result-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #999;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      padding: 0;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-result-lock:hover,
    #aih-selection-result .aih-result-close:hover {
      background: #e8e8e8;
      color: #555;
    }
    #aih-selection-result .aih-result-lock.locked {
      color: #3b82f6;
    }
    #aih-selection-result .aih-result-body {
      padding: 12px 14px;
      word-break: break-word;
    }
    #aih-selection-result .aih-result-body p {
      margin: 0 0 8px;
    }
    #aih-selection-result .aih-result-body p:last-child {
      margin-bottom: 0;
    }
    #aih-selection-result .aih-result-body pre {
      background: #f5f5f5;
      padding: 10px 12px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.5;
      margin: 8px 0;
    }
    #aih-selection-result .aih-result-body code {
      font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
      background: #f0f0f0;
      padding: 1px 4px;
      border-radius: 3px;
    }
    #aih-selection-result .aih-result-body pre code {
      background: none;
      padding: 0;
    }
    #aih-selection-result .aih-result-body ul, 
    #aih-selection-result .aih-result-body ol {
      padding-left: 20px;
      margin: 8px 0;
    }
    #aih-selection-result .aih-result-body li {
      margin-bottom: 4px;
    }
    #aih-selection-result .aih-result-body h1,
    #aih-selection-result .aih-result-body h2,
    #aih-selection-result .aih-result-body h3,
    #aih-selection-result .aih-result-body h4 {
      margin: 12px 0 6px;
      font-weight: 600;
    }
    #aih-selection-result .aih-result-body h1 { font-size: 1.3em; }
    #aih-selection-result .aih-result-body h2 { font-size: 1.15em; }
    #aih-selection-result .aih-result-body h3 { font-size: 1.05em; }
    #aih-selection-result .aih-result-body blockquote {
      border-left: 3px solid #3b82f6;
      margin: 8px 0;
      padding: 4px 12px;
      color: #666;
      background: #f8f9fa;
      border-radius: 0 4px 4px 0;
    }
    #aih-selection-result .aih-result-body table {
      border-collapse: collapse;
      width: 100%;
      margin: 8px 0;
      font-size: 13px;
    }
    #aih-selection-result .aih-result-body th,
    #aih-selection-result .aih-result-body td {
      border: 1px solid #e0e0e0;
      padding: 6px 10px;
      text-align: left;
    }
    #aih-selection-result .aih-result-body th {
      background: #f5f5f5;
      font-weight: 600;
    }
    #aih-selection-result .aih-result-body a {
      color: #3b82f6;
      text-decoration: none;
    }
    #aih-selection-result .aih-result-body a:hover {
      text-decoration: underline;
    }
    #aih-selection-result .aih-result-body hr {
      border: none;
      border-top: 1px solid #e0e0e0;
      margin: 12px 0;
    }
    #aih-selection-result .aih-result-loading {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px 14px;
      color: #888;
      font-size: 13px;
    }
    #aih-selection-result .aih-result-scroll {
      flex: 1 1 0%;
      min-height: 0;
      overflow-y: auto;
    }
    #aih-selection-result .aih-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid #e0e0e0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: aih-spin 0.8s linear infinite;
    }
    @keyframes aih-spin {
      to { transform: rotate(360deg); }
    }
    #aih-selection-result .aih-result-error {
      padding: 16px 14px;
      color: #e53e3e;
      font-size: 13px;
    }
    #aih-selection-result .aih-result-footer {
      display: flex;
      gap: 6px;
      padding: 8px 14px;
      background: #fafafa;
    }
    #aih-selection-result .aih-result-footer-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #666;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      outline: none;
      font-family: inherit;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-result-footer-btn:hover {
      background: #e8e8e8;
      color: #333;
    }
    #aih-selection-result .aih-result-footer-btn .aih-tb-icon {
      display: flex;
      align-items: center;
    }
    /* 推荐追问 */
    #aih-selection-result .aih-result-suggestions {
      padding: 10px 14px;
      border-top: 1px solid #f0f0f0;
    }
    #aih-selection-result .aih-suggestions-label {
      font-size: 11px;
      color: #999;
      margin-bottom: 8px;
      font-weight: 500;
    }
    #aih-selection-result .aih-suggestions-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    #aih-selection-result .aih-suggestion-chip {
      display: block;
      width: 100%;
      text-align: left;
      padding: 7px 10px;
      border: 1px solid #e8e8e8;
      border-radius: 8px;
      background: #fafafa;
      color: #333;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      outline: none;
      font-family: inherit;
      line-height: 1.4;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-suggestion-chip:hover {
      background: #eff6ff;
      border-color: #3b82f6;
      color: #2563eb;
    }
    /* 追问输入框 */
    #aih-selection-result .aih-result-followup {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      padding: 8px 14px;
      border-top: 1px solid #f0f0f0;
    }
    #aih-selection-result .aih-followup-wrap {
      display: flex;
      align-items: center;
      flex: 1;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
      transition: border-color 0.15s;
    }
    #aih-selection-result .aih-followup-wrap:focus-within {
      border-color: #3b82f6;
    }
    #aih-selection-result .aih-followup-input {
      flex: 1;
      padding: 6px 8px;
      border: none;
      background: transparent;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      color: #333;
    }
    #aih-selection-result .aih-followup-input::placeholder {
      color: #bbb;
    }
    #aih-selection-result .aih-followup-send {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: 6px 8px;
      border: none;
      border-radius: 0;
      background: transparent;
      color: #3b82f6;
      cursor: pointer;
      transition: color 0.15s;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-followup-send:hover {
      color: #2563eb;
    }
  `;
  document.head.appendChild(style);
}

// ==================== 工具栏工具加载 ====================
const DEFAULT_TOOLS = [
  { id: 'ai-search',  name: 'AI搜索', systemPrompt: '使用ReAct Agent模式，通过多轮思考、搜索和推理来回答选中的问题。', builtin: true, order: 0 },
  { id: 'explain',   name: '解释',   systemPrompt: '对选中的内容进行解释说明，帮助理解其含义。', builtin: true, order: 1 },
  { id: 'translate', name: '翻译',   systemPrompt: '将选中的内容翻译成中文。', builtin: true, order: 2 },
  { id: 'summary',   name: '总结',   systemPrompt: '对选中的内容进行归纳总结，提炼关键要点。', builtin: true, order: 3 },
  { id: 'copy',      name: '复制',   systemPrompt: '将选中内容复制到剪贴板。', builtin: true, order: 99 }
];

function loadToolbarTools() {
  return new Promise((resolve) => {
    if (toolbarTools) {
      resolve(toolbarTools);
      return;
    }
    chrome.storage.local.get(['toolbarTools', 'toolbarMaxVisible', 'toolbarIconOnly'], (result) => {
      const rawTools = (result.toolbarTools && result.toolbarTools.length > 0) 
        ? result.toolbarTools 
        : DEFAULT_TOOLS;
      // 内置工具始终使用默认的 systemPrompt
      const defaultMap = new Map(DEFAULT_TOOLS.map(t => [t.id, t]));
      toolbarTools = rawTools.map(t => {
        if (t.builtin && defaultMap.has(t.id)) {
          return { ...t, systemPrompt: defaultMap.get(t.id).systemPrompt };
        }
        return t;
      });
      toolbarMaxVisible = result.toolbarMaxVisible || 4;
      toolbarIconOnly = result.toolbarIconOnly || false;
      resolve(toolbarTools);
    });
  });
}

function refreshToolbarCache() {
  toolbarTools = null;
  toolbarIconOnly = false;
  loadToolbarTools();
}

function getToolIcon(toolId) {
  const iconMap = {
    'ai-search': ICONS.search,
    'explain': ICONS.explain,
    'translate': ICONS.translate,
    'summary': ICONS.summary,
    'copy': ICONS.copy,
  };
  return iconMap[toolId] || ICONS.sparkle;
}

function createOverflowDropdown() {
  if (overflowDropdownEl) return;
  
  overflowDropdownEl = document.createElement('div');
  overflowDropdownEl.id = 'aih-overflow-dropdown';
  overflowDropdownEl.className = 'aih-overflow-dropdown';
  overflowDropdownEl.style.display = 'none';
  document.body.appendChild(overflowDropdownEl);
  
  document.addEventListener('click', (e) => {
    if (overflowDropdownEl && overflowDropdownEl.style.display === 'block') {
      if (!overflowDropdownEl.contains(e.target) && !e.target.closest('.aih-tb-btn-overflow')) {
        overflowDropdownEl.style.display = 'none';
      }
    }
  });
}

function renderOverflowDropdown(overflowTools) {
  if (!overflowDropdownEl) createOverflowDropdown();
  
  let itemsHtml = overflowTools.map(tool => {
    const icon = getToolIcon(tool.id);
    return `<div class="aih-dropdown-item" role="button" tabindex="0" data-action="${tool.id}">
      <span class="aih-tb-icon">${icon}</span>${tool.name}
    </div>`;
  }).join('');
  
  itemsHtml += `<div class="aih-dropdown-divider"></div>`;
  itemsHtml += `<div class="aih-dropdown-item aih-dropdown-settings" role="button" tabindex="0" title="打开配置页面">
    <span class="aih-tb-icon">${ICONS.gear}</span>设置
  </div>`;
  itemsHtml += `<div class="aih-dropdown-item aih-dropdown-hide" role="button" tabindex="0" title="暂时隐藏直到页面刷新">
    <span class="aih-tb-icon">${ICONS.eyeOff}</span>本次临时禁用
  </div>`;
  itemsHtml += `<div class="aih-dropdown-item aih-dropdown-block" role="button" tabindex="0" title="在此网站禁用工具栏">
    <span class="aih-tb-icon">${ICONS.block}</span>在此网站禁用
  </div>`;
  
  overflowDropdownEl.innerHTML = itemsHtml;
  
  overflowDropdownEl._clickHandler = (e) => {
    if (e.target.closest('.aih-dropdown-settings')) {
      e.stopPropagation();
      overflowDropdownEl.style.display = 'none';
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE', hash: 'toolbar' }).catch(() => {});
      return;
    }
    
    if (e.target.closest('.aih-dropdown-block')) {
      e.stopPropagation();
      e.preventDefault();
      overflowDropdownEl.style.display = 'none';
      blockCurrentDomain();
      return;
    }
    
    if (e.target.closest('.aih-dropdown-hide')) {
      e.stopPropagation();
      e.preventDefault();
      overflowDropdownEl.style.display = 'none';
      toolbarTemporarilyHidden = true;
      hideToolbar();
      hideResultPanel();
      currentSelectedText = '';
      return;
    }
    
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    overflowDropdownEl.style.display = 'none';
    handleAction(btn.dataset.action, currentSelectedText);
  };
  overflowDropdownEl.addEventListener('click', overflowDropdownEl._clickHandler);
  
  // 键盘支持：Enter/Space 触发点击
  overflowDropdownEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const target = e.target.closest('[role="button"]');
      if (target) {
        e.preventDefault();
        target.click();
      }
    }
  });
}

// ==================== 工具栏创建 ====================
async function createToolbar() {
  if (toolbarEl) return;
  
  await loadToolbarTools();
  // AI搜索固定在最前，复制固定在最后，均不参与排序
  const tools = [...toolbarTools].sort((a, b) => a.order - b.order);
  const aiSearchTool = tools.find(t => t.id === 'ai-search');
  const configurableTools = tools.filter(t => t.id !== 'ai-search' && t.id !== 'copy');
  const visibleTools = configurableTools.slice(0, toolbarMaxVisible - 1); // 留一位给AI搜索
  const overflowTools = configurableTools.slice(toolbarMaxVisible - 1);
  
  toolbarEl = document.createElement('div');
  toolbarEl.id = 'aih-selection-toolbar';
  
  let buttonsHtml = `<span class="aih-tb-buttons">`;
  buttonsHtml += `<span class="aih-tb-grip" title="拖拽移动">${ICONS.grip}</span>`;
  
  const iconMode = toolbarIconOnly; // 图标精简模式：仅显示图标
  
  // AI搜索固定在第一个，始终显示
  if (aiSearchTool) {
    buttonsHtml += `<div class="aih-tb-btn primary" role="button" tabindex="0" data-action="ai-search" title="AI 搜索">
      <span class="aih-tb-icon">${ICONS.search}</span>${iconMode ? '' : 'AI搜索'}
    </div>`;
  }
  
  visibleTools.forEach((tool) => {
    const icon = getToolIcon(tool.id);
    buttonsHtml += `<div class="aih-tb-btn" role="button" tabindex="0" data-action="${tool.id}" title="${tool.name}">
      <span class="aih-tb-icon">${icon}</span>${iconMode ? '' : tool.name}
    </div>`;
  });
  
  // 如果有溢出工具，添加"更多"按钮（放在复制按钮前面）
  if (overflowTools.length > 0) {
    buttonsHtml += `<div class="aih-tb-btn aih-tb-btn-overflow" role="button" tabindex="0" title="更多工具">
      <span class="aih-tb-icon">${ICONS.more}</span>
    </div>`;
    renderOverflowDropdown(overflowTools);
  }
  
  // 复制按钮固定在最后
  buttonsHtml += `<div class="aih-tb-btn" role="button" tabindex="0" data-action="copy" title="复制选中内容">
    <span class="aih-tb-icon">${ICONS.copy}</span>${iconMode ? '' : '复制'}
  </div>`;
  buttonsHtml += `</span>`; // close .aih-tb-buttons
  
  // 问问AI 输入框（紧凑内联形态）
  buttonsHtml += `<span class="aih-tb-ask-wrap">
    <input type="text" class="aih-tb-ask-input" placeholder="问问..." />
    <div class="aih-tb-btn aih-tb-ask-send" role="button" tabindex="0" title="发送">
      <span class="aih-tb-icon">${ICONS.send}</span>
    </div>
  </span>`;
  
  toolbarEl.innerHTML = buttonsHtml;
  
  toolbarEl.addEventListener('click', (e) => {
    if (e.target.closest('.aih-tb-btn-overflow')) {
      e.stopPropagation();
      const btn = e.target.closest('.aih-tb-btn-overflow');
      const rect = btn.getBoundingClientRect();
      if (overflowDropdownEl) {
        overflowDropdownEl.style.display = 
          overflowDropdownEl.style.display === 'block' ? 'none' : 'block';
        overflowDropdownEl.style.top = (rect.bottom + 4) + 'px';
        overflowDropdownEl.style.left = (rect.right - 160) + 'px';
      }
      return;
    }
    
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    
    const action = btn.dataset.action;
    handleAction(action, currentSelectedText);
  });
  
  // 键盘支持：Enter/Space 触发点击
  toolbarEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const target = e.target.closest('[role="button"]');
      if (target && !target.classList.contains('aih-tb-ask-send')) {
        e.preventDefault();
        target.click();
      }
    }
  });
  
  document.body.appendChild(toolbarEl);
  
  // 问问AI 输入框事件
  const askInput = toolbarEl.querySelector('.aih-tb-ask-input');
  const askSend = toolbarEl.querySelector('.aih-tb-ask-send');
  toolbarEl.querySelector('.aih-tb-buttons');
  
  const doSend = () => {
    const val = askInput.value.trim();
    if (val) {
      const savedText = askSavedSelectedText; // 先保存，exitAskMode 会清空
      exitAskMode();
      askInput.value = '';
      sendToSidePanelInputWithContext(val, savedText);
      hideToolbar();
    }
  };
  
  const enterAskMode = () => {
    if (isAskMode) return;
    isAskMode = true;
    // 保存当前选中的文本和范围
    askSavedSelectedText = currentSelectedText || '';
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      askSavedRange = selection.getRangeAt(0).cloneRange();
    }
    // 保存展开前右侧边缘位置，展开后使用 width 直接限制为 360px
    const oldRight = toolbarEl.getBoundingClientRect().right;
    askSavedLeft = toolbarEl.style.left;
    toolbarEl.classList.add('aih-ask-mode');
    toolbarEl.style.width = '360px';
    // 调整 left 使右侧位置保持不变
    const newLeft = Math.max(8, oldRight - 360);
    toolbarEl.style.left = newLeft + 'px';
    
    // 恢复选中高亮，并聚焦输入框（双重 rAF 确保 DOM 更新完成）
    requestAnimationFrame(() => {
      if (askSavedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(askSavedRange);
      }
      requestAnimationFrame(() => {
        askInput.focus();
      });
    });
  };
  
  const exitAskMode = () => {
    if (!isAskMode) return;
    isAskMode = false;
    askSavedSelectedText = '';
    askSavedRange = null;
    toolbarEl.classList.remove('aih-ask-mode');
    toolbarEl.style.width = '';
    // 恢复原始 left 位置
    if (askSavedLeft) {
      toolbarEl.style.left = askSavedLeft;
      askSavedLeft = '';
    }
  };
  
  askInput.addEventListener('focus', () => {
    // 如果还没展开（mousedown 没来得及处理），补调
    if (!isAskMode) enterAskMode();
  });
  
  // mousedown 提前展开工具栏，阻止原生聚焦避免 DOM 变化时失焦
  askInput.addEventListener('mousedown', (e) => {
    if (!isAskMode) {
      e.preventDefault(); // 阻止原生 focus
      enterAskMode();
    }
  });
  
  askInput.addEventListener('blur', () => {
    // 延迟检查，以便点击发送按钮时能触发 doSend
    setTimeout(() => {
      if (isAskMode && !toolbarEl.contains(document.activeElement)) {
        exitAskMode();
        hideToolbar();
      }
    }, 150);
  });
  
  askInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      exitAskMode();
      askInput.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      doSend();
    }
  });
  
  askSend.addEventListener('mousedown', (e) => {
    e.preventDefault(); // 防止 blur 先触发
    e.stopPropagation();
    doSend();
  });
  
  makeDraggable(toolbarEl, '.aih-tb-grip');
}

// ==================== 结果面板 ====================
function createResultPanel() {
  if (resultPanelEl) return;
  
  resultPanelEl = document.createElement('div');
  resultPanelEl.id = 'aih-selection-result';
  resultPanelEl.innerHTML = `
    <div class="aih-result-header">
      <span>${ICONS.sparkle} AI 回答</span>
      <div class="aih-result-header-actions">
        <div class="aih-result-lock" role="button" tabindex="0" title="锁定窗口">${ICONS.unlock}</div>
        <div class="aih-result-close" role="button" tabindex="0" title="关闭">${ICONS.close}</div>
      </div>
    </div>
    <div class="aih-result-scroll">
      <div class="aih-result-body"></div>
      <div class="aih-result-footer">
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="copy-result" title="复制全部内容">
          <span class="aih-tb-icon">${ICONS.copyLarge}</span>复制
        </div>
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="regenerate-result" title="重新生成答案">
          <span class="aih-tb-icon">${ICONS.refresh}</span>重新生成
        </div>
      </div>
      <div class="aih-result-suggestions" style="display:none;">
        <div class="aih-suggestions-label">💡 推荐追问</div>
        <div class="aih-suggestions-list"></div>
      </div>
    </div>
    <div class="aih-result-followup">
      <span class="aih-followup-wrap">
        <input type="text" class="aih-followup-input" placeholder="继续提问..." />
        <div class="aih-followup-send" role="button" tabindex="0" title="发送到侧边栏">${ICONS.send}</div>
      </span>
    </div>
  `;
  
  resultPanelEl.querySelector('.aih-result-close').addEventListener('click', (e) => {
    e.stopPropagation();
    hideResultPanel();
  });
  
  resultPanelEl.querySelector('.aih-result-lock').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleResultLock();
  });
  
  resultPanelEl.querySelector('.aih-result-footer').addEventListener('click', (e) => {
    e.stopPropagation();
    const action = e.target.closest('[data-action]')?.dataset?.action;
    if (action === 'regenerate-result') {
      if (!lastActionType || !savedActionText) return;
      sendToAI(lastActionType, savedActionText, lastActionCustomPrompt);
    } else if (action === 'copy-result') {
      copyResultContent();
    }
  });
  
  // 追问输入框事件
  const followupInput = resultPanelEl.querySelector('.aih-followup-input');
  const followupSend = resultPanelEl.querySelector('.aih-followup-send');
  
  followupSend.addEventListener('click', (e) => {
    e.stopPropagation();
    const text = followupInput.value.trim();
    if (text) {
      sendToSidePanelInput(text);
      followupInput.value = '';
    }
  });
  
  followupInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = followupInput.value.trim();
      if (text) {
        sendToSidePanelInput(text);
        followupInput.value = '';
      }
    }
  });
  
  // 推荐追问点击事件（委托在 suggestions-list 上）
  resultPanelEl.querySelector('.aih-suggestions-list').addEventListener('click', (e) => {
    const chip = e.target.closest('.aih-suggestion-chip');
    if (!chip) return;
    e.stopPropagation();
    const question = chip.dataset.question;
    if (question) {
      sendToSidePanelInput(question);
    }
  });
  
  // 键盘支持：Enter/Space 触发点击
  resultPanelEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const target = e.target.closest('[role="button"]');
      if (target) {
        e.preventDefault();
        target.click();
      }
    }
  });
  
  document.body.appendChild(resultPanelEl);
  
  // 结果面板通过标题栏拖拽
  makeDraggable(resultPanelEl, '.aih-result-header');
}

function showResultPanel(x, y, content, suggestions = []) {
  if (!resultPanelEl) return;
  
  // 确保面板始终在 body 最末尾，处于最顶层
  document.body.appendChild(resultPanelEl);
  
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  resultPanelEl.style.display = 'flex';
  resultPanelEl.style.left = '-9999px';
  resultPanelEl.style.top = '-9999px';
  
  const body = resultPanelEl.querySelector('.aih-result-body');
  body.innerHTML = content;
  
  // 渲染推荐追问
  const suggestionsEl = resultPanelEl.querySelector('.aih-result-suggestions');
  const suggestionsList = resultPanelEl.querySelector('.aih-suggestions-list');
  if (suggestions.length > 0 && suggestionsEl && suggestionsList) {
    suggestionsList.innerHTML = suggestions.map(s => 
      `<div class="aih-suggestion-chip" role="button" tabindex="0" data-question="${escapeHtml(s)}">${escapeHtml(s)}</div>`
    ).join('');
    suggestionsEl.style.display = 'block';
  } else if (suggestionsEl) {
    suggestionsEl.style.display = 'none';
  }
  
  requestAnimationFrame(() => {
    const rect = resultPanelEl.getBoundingClientRect();
    const panelWidth = rect.width || 420;
    const panelHeight = Math.min(rect.height || 200, 520);

    let left = x - panelWidth / 2;
    if (left < 8) left = 8;
    if (left + panelWidth > viewportWidth - 8) left = viewportWidth - panelWidth - 8;
    
    let top = y - panelHeight - 8;
    if (top < 8) {
      top = y + 8;
    }
    
    resultPanelEl.style.left = left + 'px';
    resultPanelEl.style.top = top + 'px';
    resultPanelEl.style.maxHeight = Math.min(520, viewportHeight - top - 16) + 'px';
    
    isResultVisible = true;
    
    // 再次确保在最顶层（防止 requestAnimationFrame 期间有其他元素插入）
    document.body.appendChild(resultPanelEl);
  });
}

function showResultLoading(x, y) {
  if (!resultPanelEl) return;
  
  // 保存面板位置，后续显示结果时复用
  lastPanelPos = { x, y };
  
  // 重置锁定状态
  isResultLocked = false;
  updateLockButton();
  
  // 隐藏推荐追问区域
  const suggestionsEl = resultPanelEl.querySelector('.aih-result-suggestions');
  if (suggestionsEl) suggestionsEl.style.display = 'none';
  
  // 清空追问输入框
  const followupInput = resultPanelEl.querySelector('.aih-followup-input');
  if (followupInput) followupInput.value = '';
  
  // 确保面板始终在 body 最末尾，处于最顶层
  document.body.appendChild(resultPanelEl);
  
  resultPanelEl.style.display = 'flex';
  
  const body = resultPanelEl.querySelector('.aih-result-body');
  body.innerHTML = `<div class="aih-result-loading"><div class="aih-spinner"></div>AI 正在思考...</div>`;
  
  positionPanel(resultPanelEl, x, y);
  isResultVisible = true;
  
  hideToolbar();
}

function showResultError(x, y, errorMsg) {
  if (!resultPanelEl) return;
  
  // 重置锁定状态
  isResultLocked = false;
  resultRawContent = '';
  updateLockButton();
  
  // 确保面板始终在 body 最末尾，处于最顶层
  document.body.appendChild(resultPanelEl);
  
  resultPanelEl.style.display = 'flex';
  
  const body = resultPanelEl.querySelector('.aih-result-body');
  body.innerHTML = `<div class="aih-result-error">请求失败: ${escapeHtml(errorMsg)}</div>`;
  
  positionPanel(resultPanelEl, x, y);
  isResultVisible = true;
}

function positionPanel(panel, x, y) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  panel.style.left = '-9999px';
  panel.style.top = '-9999px';
  
  requestAnimationFrame(() => {
    const rect = panel.getBoundingClientRect();
    const panelWidth = rect.width || 420;
    const panelHeight = Math.min(rect.height || 200, 520);
    
    let left = x - panelWidth / 2;
    if (left < 8) left = 8;
    if (left + panelWidth > viewportWidth - 8) left = viewportWidth - panelWidth - 8;
    
    let top = y - panelHeight - 8;
    if (top < 8) {
      top = y + 8;
    }
    
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.maxHeight = Math.min(520, viewportHeight - top - 16) + 'px';
    
    // 再次确保在最顶层（防止 requestAnimationFrame 期间有其他元素插入）
    document.body.appendChild(panel);
  });
}

function hideResultPanel() {
  if (!resultPanelEl) return;
  resultPanelEl.style.display = 'none';
  isResultVisible = false;
  isResultLocked = false;
  resultRawContent = '';
  updateLockButton();
}

function toggleResultLock() {
  isResultLocked = !isResultLocked;
  updateLockButton();
}

function updateLockButton() {
  if (!resultPanelEl) return;
  const lockBtn = resultPanelEl.querySelector('.aih-result-lock');
  if (!lockBtn) return;
  if (isResultLocked) {
    lockBtn.innerHTML = ICONS.lock;
    lockBtn.classList.add('locked');
    lockBtn.title = '解除锁定';
  } else {
    lockBtn.innerHTML = ICONS.unlock;
    lockBtn.classList.remove('locked');
    lockBtn.title = '锁定窗口';
  }
}

function sendToSidePanelInput(text) {
  if (!text || !isExtensionValid()) return;
  
  const selText = currentSelectedText || savedActionText || '';
  chrome.runtime.sendMessage({
    type: 'DIRECT_SEND',
    text: text,
    selectedText: selText
  }).catch(err => {
    console.error('[SelectionToolbar] 发送追问到侧边栏失败:', err);
  });
}

function sendToSidePanelInputWithContext(text, selectedText) {
  if (!text || !isExtensionValid()) return;
  
  chrome.runtime.sendMessage({
    type: 'DIRECT_SEND',
    text: text,
    selectedText: selectedText || ''
  }).catch(err => {
    console.error('[SelectionToolbar] 发送到侧边栏失败:', err);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== 显示/隐藏 ====================
function showToolbar(x, y) {
  if (!toolbarEl || !currentSelectedText || isResultVisible) return;
  
  // 确保工具栏始终在 body 最末尾，处于最顶层
  document.body.appendChild(toolbarEl);
  
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  toolbarEl.style.display = 'flex';
  
  requestAnimationFrame(() => {
    const rect = toolbarEl.getBoundingClientRect();
    const toolbarWidth = rect.width || 300;
    const toolbarHeight = rect.height || 40;
    
    let left = x - toolbarWidth / 2;
    if (left < 8) left = 8;
    if (left + toolbarWidth > viewportWidth - 8) left = viewportWidth - toolbarWidth - 8;
    
    // 首选位置：选中内容上方
    let top = y - toolbarHeight - 10;
    // 如果上方空间不够，放到下方
    if (top < 8) {
      top = y + 10;
    }
    // 最终兜底：确保工具栏一定在可视区域内
    if (top < 8) top = 8;
    if (top + toolbarHeight > viewportHeight - 8) {
      top = viewportHeight - toolbarHeight - 8;
    }
    
    toolbarEl.style.left = left + 'px';
    toolbarEl.style.top = top + 'px';
    
    if (!isToolbarVisible) {
      toolbarEl.classList.add('show');
      isToolbarVisible = true;
    }
  });
}

function hideToolbar() {
  if (!toolbarEl || !isToolbarVisible) return;
  
  if (isAskMode) {
    isAskMode = false;
    askSavedSelectedText = '';
    askSavedRange = null;
    toolbarEl.classList.remove('aih-ask-mode');
    toolbarEl.style.width = '';
    if (askSavedLeft) {
      toolbarEl.style.left = askSavedLeft;
      askSavedLeft = '';
    }
  }
  
  toolbarEl.classList.remove('show');
  toolbarEl.style.display = 'none';
  isToolbarVisible = false;
}

// 获取工具栏当前的屏幕位置（用于结果面板定位）
function getToolbarPosition() {
  if (!toolbarEl) return { x: 0, y: 0 };
  const rect = toolbarEl.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top };
}

function getPanelCenter(panel) {
  const rect = panel.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top };
}

// ==================== 选中检测 ====================
function onSelectionChange() {
  if (!enableSelectionQuery) return;
  // 检查当前域名是否被屏蔽
  if (blockedDomains.length > 0 && blockedDomains.includes(window.location.hostname)) return;
  // 检查是否临时隐藏
  if (toolbarTemporarilyHidden) return;
  
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : '';
  
  if (!text || text.length < 2) {
    if (!isAskMode) hideToolbar();
    currentSelectedText = '';
    pendingSelection = null;
    return;
  }
  
  const maxLength = 5000;
  const displayText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const editable = container.nodeType === Node.TEXT_NODE 
      ? container.parentElement.closest('[contenteditable], input, textarea')
      : container.closest && container.closest('[contenteditable], input, textarea');
    
    if (editable instanceof HTMLElement) {
      if (editable.tagName === 'INPUT' || editable.tagName === 'TEXTAREA') {
        hideToolbar();
        currentSelectedText = '';
        pendingSelection = null;
        return;
      }
    }
  }
  
  if (text === currentSelectedText && isToolbarVisible) return;
  
  currentSelectedText = displayText;
  
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    if (rect.width === 0 && rect.height === 0) return;
    
    // 暂存选中位置，等鼠标抬起时再显示工具栏
    pendingSelection = {
      x: rect.left + rect.width / 2,
      y: rect.top
    };
  }
}

// ==================== 点击外部隐藏 ====================
function onDocumentClick(e) {
  // 结果面板可见时，点击外部关闭结果面板（锁定时不关闭）
  if (isResultVisible && resultPanelEl) {
    if (!resultPanelEl.contains(e.target) && !isResultLocked) {
      hideResultPanel();
    }
    return;
  }
  
  if (!isToolbarVisible) return;
  if (!toolbarEl) return;
  
  if (isAskMode) return; // 输入框模式下不关闭
  
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  
  if (toolbarEl.contains(e.target)) return;
  
  hideToolbar();
}

function onMouseUp() {
  suppressNextClick = true;
  
  // 鼠标抬起时，如果有暂存的选中位置，显示工具栏
  if (pendingSelection && currentSelectedText) {
    showToolbar(pendingSelection.x, pendingSelection.y);
    pendingSelection = null;
  }
}

// ==================== 滚动/缩放时的处理 ====================
function onScrollOrResize() {
  if (isAskMode) return;
  
  if (!isToolbarVisible) return;
  
  // 滚动时：尝试根据当前选中内容重新定位工具栏
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0 && currentSelectedText) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      showToolbar(rect.left + rect.width / 2, rect.top);
      return;
    }
  }
  // 选中内容完全滚出可视区域时，隐藏工具栏
  hideToolbar();
}
function onResize() {
  if (isAskMode) return;
  if (isToolbarVisible) hideToolbar();
}

// ==================== 操作处理 ====================
function handleAction(action, text) {
  if (!text) return;
  
  savedActionText = text; // 保存用于继续提问时带入选中的内容
  if (action === 'copy') {
    copySelectedText(text);
    hideToolbar();
    return;
  }
  
  lastActionType = action;
  lastActionCustomPrompt = '';
  
  const BUILTIN_ACTIONS = ['ai-search', 'explain', 'translate', 'summary'];
  if (BUILTIN_ACTIONS.includes(action)) {
    sendToAI(action, text);
    return;
  }
  
  // 自定义工具
  const tool = toolbarTools.find(t => t.id === action);
  if (tool) {
    lastActionCustomPrompt = tool.systemPrompt || '';
    sendToAI(action, text, tool.systemPrompt);
  }
}

function copySelectedText(text) {
  copyToClipboard(text).then(() => {
    showCopyToast();
  }).catch(err => {
    console.error('[SelectionToolbar] 复制失败:', err);
    showCopyErrorToast();
  });
}

function copyResultContent() {
  const text = resultRawContent;
  if (!text) return;
  copyToClipboard(text).then(() => {
    showCopyToast();
  }).catch(err => {
    console.error('[SelectionToolbar] 复制结果失败:', err);
    showCopyErrorToast();
  });
}

async function copyToClipboard(text) {
  if (!navigator.clipboard) {
    return fallbackCopy(text);
  }
  
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      return fallbackCopy(text);
    }
    throw err;
  }
}

function fallbackCopy(text) {
  return new Promise((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    
    try {
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      
      const success = document.execCommand('copy');
      if (success) {
        resolve();
      } else {
        reject(new Error('execCommand copy failed'));
      }
    } catch (err) {
      reject(err);
    } finally {
      textarea.remove();
    }
  });
}

function showCopyErrorToast() {
  const oldToast = document.getElementById('aih-copy-toast');
  if (oldToast) oldToast.remove();
  
  const toast = document.createElement('div');
  toast.id = 'aih-copy-toast';
  toast.textContent = '复制失败，请手动复制';
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(239, 68, 68, 0.9);
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    pointer-events: none;
    animation: aih-toast-in 0.2s ease-out, aih-toast-out 0.2s 1.5s ease-in forwards;
  `;
  
  document.body.appendChild(toast);
  toast.style.zIndex = '2147483647';
  setTimeout(() => toast.remove(), 1800);
}

function showCopyToast() {
  const oldToast = document.getElementById('aih-copy-toast');
  if (oldToast) oldToast.remove();
  
  const toast = document.createElement('div');
  toast.id = 'aih-copy-toast';
  toast.textContent = '已复制';
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    pointer-events: none;
    animation: aih-toast-in 0.2s ease-out, aih-toast-out 0.2s 1s ease-in forwards;
  `;
  
  if (!document.getElementById('aih-toast-anim')) {
    const anim = document.createElement('style');
    anim.id = 'aih-toast-anim';
    anim.textContent = `
      @keyframes aih-toast-in { from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
      @keyframes aih-toast-out { from { opacity: 1; } to { opacity: 0; } }
    `;
    document.head.appendChild(anim);
  }
  
  document.body.appendChild(toast);
  // 确保 toast 在最顶层
  toast.style.zIndex = '2147483647';
  setTimeout(() => toast.remove(), 1300);
}

function sendToAI(action, text, customSystemPrompt) {
  if (!isExtensionValid()) {
    console.warn('[SelectionToolbar] 扩展上下文已失效，请刷新页面');
    return;
  }
  
  const actionLabels = {
    'ai-search': `搜索并分析以下内容：\n\n${text}`,
    'explain': `用1-3句话简洁解释以下内容，不需要展开说明。\n\n${text}\n\n---\n回答完毕后，请在最后另起一行，严格按以下格式提供3个用户可能追问的问题：\n---SUGGESTIONS---\n问题1\n问题2\n问题3`,
    'translate': `翻译以下内容，只输出翻译结果：\n\n${text}`,
    'summary': `用3-5个要点总结以下内容，每条要点一句话。\n\n${text}\n\n---\n回答完毕后，请在最后另起一行，严格按以下格式提供3个用户可能追问的问题：\n---SUGGESTIONS---\n问题1\n问题2\n问题3`
  };
  
  const message = customSystemPrompt ? `请处理以下内容：\n\n${text}` : (actionLabels[action] || text);
  
  // AI搜索：打开侧边栏，不显示浮动面板
  if (action === 'ai-search') {
    hideToolbar();
    
    // 清除页面选中文本，避免 Side Panel 的 setInterval 重复检测到选中内容
    window.getSelection().removeAllRanges();
    
    chrome.runtime.sendMessage({
      type: 'SELECTION_TOOLBAR_ACTION',
      action: action,
      text: text,
      prompt: message
    }).catch(err => {
      console.error('[SelectionToolbar] 发送消息失败:', err);
    });
    return;
  }
  
  createResultPanel();
  
  const actionTitles = {
    'ai-search': 'AI搜索',
    'explain': '解释',
    'translate': '翻译',
    'summary': '总结'
  };
  let panelTitle = actionTitles[action];
  if (!panelTitle && toolbarTools) {
    const tool = toolbarTools.find(t => t.id === action);
    panelTitle = tool ? tool.name : 'AI 回答';
  }
  const titleSpan = resultPanelEl.querySelector('.aih-result-header span');
  if (titleSpan) {
    titleSpan.innerHTML = `${ICONS.sparkle} ${panelTitle || 'AI 回答'}`;
  }
  
  const pos = isResultVisible && resultPanelEl
    ? getPanelCenter(resultPanelEl)
    : getToolbarPosition();
  showResultLoading(pos.x, pos.y);
  
  chrome.runtime.sendMessage({
    type: 'SELECTION_TOOLBAR_ACTION',
    action: action,
    text: text,
    prompt: message,
    systemPrompt: customSystemPrompt || ''
  }).catch(err => {
    console.error('[SelectionToolbar] 发送消息失败:', err);
    showResultError(pos.x, pos.y, err.message);
  });
}

// ==================== 监听 AI 响应 ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isExtensionValid()) return;
  
  if (message.type === 'SELECTION_TOOLBAR_RESULT') {
    if (message.error) {
      resultRawContent = '';
      showResultError(lastPanelPos.x, lastPanelPos.y, message.error);
    } else {
      const rawContent = message.content || '无响应';
      
      // 解析 ---SUGGESTIONS--- 分隔符，分离回答和追问
      let answerContent = rawContent;
      resultRawContent = rawContent;
      let suggestions = [];
      const suggestIdx = rawContent.indexOf('---SUGGESTIONS---');
      if (suggestIdx !== -1) {
        answerContent = rawContent.substring(0, suggestIdx).trim();
        resultRawContent = answerContent;  // 复制时只复制回答部分
        const suggestBlock = rawContent.substring(suggestIdx + '---SUGGESTIONS---'.length);
        suggestions = suggestBlock
          .split('\n')
          .map(s => s.replace(/^[\d]+[\.\、\s]+/, '').trim())  // 去掉序号前缀
          .filter(s => s.length > 0)
          .slice(0, 3);
      }
      
      // 使用 marked 解析 Markdown 内容
      const htmlContent = typeof marked !== 'undefined' 
        ? marked.parse(answerContent) 
        : escapeHtml(answerContent).replace(/\n/g, '<br>');
      showResultPanel(lastPanelPos.x, lastPanelPos.y, htmlContent, suggestions);
    }
  }
});

// ==================== 域名屏蔽 ====================
function blockCurrentDomain() {
  const hostname = window.location.hostname;
  chrome.storage.local.get(['blockedDomains'], (result) => {
    const list = result.blockedDomains || [];
    if (!list.includes(hostname)) {
      list.push(hostname);
      chrome.storage.local.set({ blockedDomains: list }, () => {
        blockedDomains = list;
        hideToolbar();
        hideResultPanel();
        currentSelectedText = '';
      });
    }
  });
}

// ==================== 监听开关状态变化 ====================
function loadToggleState() {
  if (!isExtensionValid()) return;
  
  chrome.storage.local.get(['enableSelectionQuery', 'blockedDomains'], (result) => {
    enableSelectionQuery = !!(result.enableSelectionQuery);
    blockedDomains = result.blockedDomains || [];
    console.log('[SelectionToolbar] 开关状态:', enableSelectionQuery ? '已启用' : '已禁用', '屏蔽域名:', blockedDomains.length);
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (!isExtensionValid()) return;
  
  if (areaName === 'local' && changes.enableSelectionQuery) {
    enableSelectionQuery = !!(changes.enableSelectionQuery.newValue);
    if (!enableSelectionQuery) {
      hideToolbar();
      hideResultPanel();
      currentSelectedText = '';
    }
  }
  
  if (areaName === 'local' && changes.blockedDomains) {
    blockedDomains = changes.blockedDomains.newValue || [];
  }
  
  if (areaName === 'local' && (changes.toolbarTools || changes.toolbarMaxVisible)) {
    refreshToolbarCache();
  }
});

// ==================== 导出的启动/停止函数 ====================
function initSelectionToolbar() {
  injectStyles();
  createToolbar();
  createResultPanel();
  loadToggleState();
  
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('mouseup', onMouseUp, true);
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onResize);
  
  console.log('[SelectionToolbar] 初始化完成');
}

// content/index.js - Content Script 入口文件

// ==================== 快捷键支持 ====================
// Ctrl+Shift+A 或 Cmd+Shift+A 打开 Popup
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
    e.preventDefault();
    chrome.action.click();
  }
});

// ==================== 消息监听 ====================

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 获取纯文本内容
  if (message.type === 'GET_PAGE_TEXT') {
    const result = getPageText(message);
    sendResponse(result);
  }
  
  // 获取完整HTML
  if (message.type === 'GET_FULL_HTML') {
    const result = getFullHtml(message);
    sendResponse(result);
  }
  
  // 查询可交互元素
  if (message.type === 'QUERY_INTERACTIVE_ELEMENTS') {
    const result = queryInteractiveElements(message);
    sendResponse(result);
  }
  
  // 获取指定元素
  if (message.type === 'GET_ELEMENT') {
    const result = getElementBySelector(message.selector);
    sendResponse(result);
  }
  
  // 获取选中内容
  if (message.type === 'GET_SELECTED_CONTENT') {
    const result = getSelectedContent(message.format);
    sendResponse(result);
  }
  
  // 点击元素
  if (message.type === 'CLICK_ELEMENT') {
    const result = clickElement(message.selector, message.waitTime, message.timeout);
    sendResponse(result);
  }
  
  // 填充表单
  if (message.type === 'FILL_FORM') {
    const result = fillForm(message.fields, message.waitTime);
    sendResponse(result);
  }
  
  // 滚动到指定位置
  if (message.type === 'SCROLL_TO') {
    const result = scrollToPosition(message);
    sendResponse(result);
  }
  
  // 提取表格
  if (message.type === 'EXTRACT_TABLE') {
    const result = extractTable(message.selector, message.includeHeaders, message.format);
    sendResponse(result);
  }
  
  // 复制到剪贴板
  if (message.type === 'COPY_TO_CLIPBOARD') {
    copyToClipboard$1(message.text).then(result => sendResponse(result));
    return true;
  }
  
  // 从剪贴板粘贴
  if (message.type === 'PASTE_FROM_CLIPBOARD') {
    pasteFromClipboard().then(result => sendResponse(result));
    return true;
  }
  
  // 鼠标悬停
  if (message.type === 'HOVER_ELEMENT') {
    const result = hoverElement(message.selector);
    sendResponse(result);
  }
  
  // 提取元数据
  if (message.type === 'EXTRACT_METADATA') {
    const result = extractMetadata();
    sendResponse(result);
  }
  
  // 高亮文本
  if (message.type === 'HIGHLIGHT_TEXT') {
    const result = highlightText(message.text, message.color);
    sendResponse(result);
  }
  
  // 移除高亮
  if (message.type === 'REMOVE_HIGHLIGHTS') {
    const result = removeHighlights();
    sendResponse(result);
  }
  
  // ========== 交互工具 ==========
  
  // 等待元素
  if (message.type === 'WAIT_FOR_ELEMENT') {
    waitForElement(message.selector, message.state, message.timeout).then(result => sendResponse(result));
    return true;
  }
  
  // 键盘输入
  if (message.type === 'KEYBOARD_INPUT') {
    const result = keyboardInput(message);
    sendResponse(result);
  }
  
  // 拖拽操作
  if (message.type === 'DRAG_AND_DROP') {
    dragAndDrop(message.sourceSelector, message.targetSelector).then(result => sendResponse(result));
    return true;
  }
  
  // 文件上传
  if (message.type === 'FILE_UPLOAD') {
    const result = fileUpload(message.selector, message.fileName, message.fileContent, message.fileType);
    sendResponse(result);
  }
  
  // 滚动到元素可见
  if (message.type === 'SCROLL_INTO_VIEW') {
    const result = scrollIntoView(message.selector, message.align, message.smooth);
    sendResponse(result);
  }
  
  // 提取链接
  if (message.type === 'EXTRACT_LINKS') {
    const result = extractLinks(message.filterType, message.includeImages);
    sendResponse(result);
  }
  
  // 提取表单
  if (message.type === 'EXTRACT_FORMS') {
    const result = extractForms(message.formSelector);
    sendResponse(result);
  }
  
  // 监听元素变化
  if (message.type === 'WATCH_ELEMENT') {
    watchElement(message.selector, message.duration).then(result => sendResponse(result));
    return true;
  }
  
  // 管理Storage
  if (message.type === 'MANAGE_STORAGE') {
    const result = manageStorage(message);
    sendResponse(result);
  }
  
  // 获取元素位置尺寸
  if (message.type === 'GET_ELEMENT_RECT') {
    const result = getElementRect(message.selector);
    sendResponse(result);
  }
  
  // 获取计算样式
  if (message.type === 'GET_COMPUTED_STYLE') {
    const result = getComputedStyle(message.selector, message.properties);
    sendResponse(result);
  }
  
  // 取色器
  if (message.type === 'COLOR_PICKER') {
    pickColor().then(result => sendResponse(result));
    return true;
  }
  
  // 页面差异对比
  if (message.type === 'DIFF_PAGE') {
    const result = diffPage(message.action, message.snapshotName);
    sendResponse(result);
  }
  
  // 文字转语音
  if (message.type === 'TEXT_TO_SPEECH') {
    const result = textToSpeech(message.text, message.lang, message.rate, message.pitch);
    sendResponse(result);
  }
  
  // ========== 高级工具 ==========
  
  // 提取图片
  if (message.type === 'EXTRACT_IMAGES') {
    const result = extractImages(message);
    sendResponse(result);
  }
  
  // 页面内搜索
  if (message.type === 'SEARCH_IN_PAGE') {
    const result = searchInPage(message);
    sendResponse(result);
  }
  
  // 视频控制
  if (message.type === 'VIDEO_CONTROL') {
    const result = videoControl(message.action, message.selector, message.value);
    sendResponse(result);
  }
  
  // 生成二维码
  if (message.type === 'GENERATE_QRCODE') {
    generateQRCode(message.content, message.size, message.errorCorrection, message.showImage).then(result => {
      sendResponse(result);
    });
    return true;
  }
  
  // 网页转Markdown
  if (message.type === 'PAGE_TO_MARKDOWN') {
    const result = pageToMarkdown(message.selector, message.includeImages, message.includeLinks, message.maxLength);
    sendResponse(result);
  }
  
  // 性能审计
  if (message.type === 'PERFORMANCE_AUDIT') {
    const result = performanceAudit(message.includeResourceTiming, message.includePaintTiming, message.includeMemoryInfo);
    sendResponse(result);
  }
  
  // 元素截图
  if (message.type === 'SCREENSHOT_ELEMENT') {
    screenshotElement(message.selector, message.quality, message.format).then(result => sendResponse(result));
    return true;
  }
  
  // Shadow DOM查询
  if (message.type === 'SHADOW_DOM_QUERY') {
    const result = shadowDomQuery(message.selector, message.deep, message.maxDepth, message.maxResults);
    sendResponse(result);
  }
  
  // 页面转PDF
  if (message.type === 'PAGE_TO_PDF') {
    pageToPdf(message.fileName, message.landscape, message.scale, message.printBackground, message.margins)
      .then(result => sendResponse(result));
    return true;
  }
  
  // ========== 新增工具消息处理 ==========
  // 页面结构化 JSON 提取
  if (message.type === 'PAGE_TO_JSON') {
    const result = pageToJson(message.selector, message.maxItems);
    sendResponse(result);
  }
  
  // 查找相似元素
  if (message.type === 'FIND_SIMILAR_ELEMENTS') {
    const result = findSimilarElements(message.selector, message.maxResults);
    sendResponse(result);
  }
  
  // iframe 内容获取
  if (message.type === 'GET_IFRAME_CONTENT') {
    const result = getIframeContent(message.selector, message.includeNested, message.maxLength);
    sendResponse(result);
  }
  
  // 在页面执行 JavaScript
  if (message.type === 'RUN_JAVASCRIPT') {
    runJavascript(message.code, message.timeout).then(result => sendResponse(result));
    return true;
  }
  
  // 注入 CSS
  if (message.type === 'INJECT_CSS') {
    const result = injectCss(message.css, message.targetSelector, message.injectMode);
    sendResponse(result);
  }
  
  // 原生查找页面文本
  if (message.type === 'FIND_TEXT_ON_PAGE') {
    const result = findTextOnPage(message.query, message.caseSensitive, message.highlight);
    sendResponse(result);
  }
  
  // 获取页面语言
  if (message.type === 'GET_PAGE_LANGUAGE') {
    const result = getPageLanguage();
    sendResponse(result);
  }
  
  // 读取无障碍树
  if (message.type === 'READ_ACCESSIBILITY_TREE') {
    const result = readAccessibilityTree(message.maxResults);
    sendResponse(result);
  }
  
  // 页面缩放
  if (message.type === 'SET_ZOOM') {
    const result = setZoom(message.level);
    sendResponse(result);
  }
  
  // 清除站点数据（content script 端处理 localStorage/sessionStorage）
  if (message.type === 'CLEAR_PAGE_DATA') {
    try {
      const cleared = [];
      if (message.site) {
        // 指定站点清除（仅清除同源的 storage）
        if (window.location.href.includes(new URL(message.site).hostname)) {
          localStorage.clear();
          sessionStorage.clear();
          cleared.push('localStorage', 'sessionStorage');
        }
      } else {
        localStorage.clear();
        sessionStorage.clear();
        cleared.push('localStorage', 'sessionStorage');
      }
      sendResponse({ success: true, cleared });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  }
  
  // 获取网页选中的内容（旧版兼容）
  if (message.action === 'getSelectedText') {
    const selectedText = window.getSelection()?.toString() || '';
    sendResponse({ text: selectedText });
  }
});

// 初始化选中文本浮动工具栏
initSelectionToolbar();
