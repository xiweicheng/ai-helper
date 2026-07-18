// content/page-extract.js - 网页内容提取工具
// 从 page-tools.js 拆分，包含元数据/链接/表单/图片/Markdown/JSON/iframe/搜索等提取工具

import { deepQuerySelector, deepGetText, deepGetHtml } from './shadow-dom-utils.js';
import { getElementSelector, generateUniqueSelector, removeHighlights } from './page-utils.js';

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
            textContent = deepGetText(doc).substring(0, maxLength);
            htmlLength = deepGetHtml(doc).length;

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
