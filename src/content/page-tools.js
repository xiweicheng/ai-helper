// content/page-tools.js - 网页内容读取与提取工具

/**
 * 获取当前网页的纯文本内容（增强版）
 */
export function getPageText(options = {}) {
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
export function getFullHtml(options = {}) {
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
 * 获取用户选中的内容
 */
export function getSelectedContent(format = 'text') {
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
export function extractTable(selector = 'table', includeHeaders = true, format = 'json') {
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
export async function copyToClipboard(text) {
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
export async function pasteFromClipboard() {
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
export function hoverElement(selector) {
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
export function extractMetadata() {
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

/**
 * 在页面上高亮文本
 */
export function highlightText(text, color = 'yellow') {
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
export function extractLinks(filterType = 'all', includeImages = false) {
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
export function extractForms(formSelector = null) {
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
          selector: getElementSelector(input)
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
          selector: getElementSelector(textarea)
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
          selector: getElementSelector(select)
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
 * 提取页面图片
 */
export function extractImages(options = {}) {
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
            selector: getElementSelector(img)
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
                selector: getElementSelector(el)
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
export function searchInPage(options = {}) {
  try {
    const { query, pattern, mode = 'plain', caseSensitive = false, contextLength = 50, maxResults = 20, highlight = false } = options;
    
    const searchPattern = query || pattern;
    
    if (!searchPattern) {
      return { success: false, error: '需要提供搜索关键词' };
    }
    
    if (mode === 'plain') {
      const found = window.find(searchPattern, caseSensitive, false, true, false, true, false);
      
      let count = 0;
      const matches = [];
      
      try {
        const sel = window.getSelection();
        const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        const flags = caseSensitive ? 'g' : 'gi';
        const escaped = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, flags);
        const bodyText = document.body.innerText;
        
        let globalIndex = 0;
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const nodeText = node.textContent;
          const nodeMatches = nodeText.match(regex);
          if (nodeMatches) {
            for (const m of nodeMatches) {
              if (matches.length >= maxResults) break;
              const idx = bodyText.indexOf(m, globalIndex);
              const start = Math.max(0, idx - contextLength);
              const end = Math.min(bodyText.length, idx + m.length + contextLength);
              matches.push({
                match: m,
                position: idx,
                context: bodyText.substring(start, end),
                lineNumber: bodyText.substring(0, idx).split('\n').length
              });
              count++;
              globalIndex = idx + m.length;
            }
          }
          if (matches.length >= maxResults) break;
        }
        
        if (savedRange) {
          sel.removeAllRanges();
          sel.addRange(savedRange);
        }
      } catch (e) {
        count = found ? 1 : 0;
      }
      
      if (highlight && count > 0) {
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
        
        const flags2 = caseSensitive ? 'g' : 'gi';
        const escaped2 = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        document.body.innerHTML = document.body.innerHTML.replace(
          new RegExp(escaped2, flags2),
          '<span class="ai-helper-search-highlight">$&</span>'
        );
      }
      
      return {
        success: true,
        query: searchPattern,
        mode: 'plain',
        found,
        total: count,
        matches: matches,
        highlighted: highlight
      };
    }
    
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(searchPattern, flags);
    
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
        new RegExp(searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags),
        '<span class="ai-helper-search-highlight">$&</span>'
      );
    }
    
    return {
      success: true,
      pattern: searchPattern,
      mode: 'regex',
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
export function pageToMarkdown(selector = null, includeImages = true, includeLinks = true, maxLength = 50000) {
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
export function pageToJson(selector = null, maxItems = 100) {
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
export function findSimilarElements(selector, maxResults = 50) {
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
export function getIframeContent(selector = 'iframe', includeNested = false, maxLength = 10000) {
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
export function getPageLanguage() {
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
