// browser-tools - page interaction + form operation + content extraction 工具定义

export const BROWSER_TOOLS = [
  {
    id: 'interact_element',
    category: 'page_interaction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'interact_element',
      description: '点击或悬停元素（支持 ref/text/selector 三种定位，优先 ref，ref 来自 query_elements）',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['click', 'hover'] },
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          ref: { type: 'integer', description: 'query_elements 返回的编号（推荐）；仅当前页面有效，导航后需重新 query' },
          text: { type: 'string', description: '按文本匹配元素（如"登录"），找到即点击' },
          tag: { type: 'string', description: '配合 text 限定标签如 button/a' },
          selector: { type: 'string', description: 'CSS 选择器（ref/text 均未提供时使用）；避免纯 nth-child 长链，优先用 query_elements 返回的 selector' },
          waitTime: { type: 'integer' },
          timeout: { type: 'integer' }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'scroll_to',
    category: 'page_interaction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'scroll_to',
      description: '滚动页面',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          target: { type: 'string', enum: ['selector', 'top', 'bottom', 'coordinates', 'text'] },
          selector: { type: 'string' },
          text: { type: 'string', description: 'target=text 时，滚动到包含此文本的元素' },
          x: { type: 'integer' },
          y: { type: 'integer' },
          align: { type: 'string', enum: ['start', 'center', 'end', 'nearest'] },
          behavior: { type: 'string', enum: ['smooth', 'auto'] },
          maxScrolls: { type: 'integer', description: 'target=text 时最大滚动次数（默认20）' },
          pauseMs: { type: 'integer', description: 'target=text 时每次滚动后等待ms（默认500）' }
        },
        required: []
      }
    }
  },
  {
    id: 'wait_element',
    category: 'page_interaction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'wait_element',
      description: '等待元素状态变化；页面跳转等待用 wait_navigation',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          selector: { type: 'string' },
          state: { type: 'string', enum: ['appeared', 'disappeared', 'visible', 'hidden'] },
          timeout: { type: 'integer' }
        },
        required: ['selector']
      }
    }
  },
  {
    id: 'drag_drop',
    category: 'page_interaction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'drag_drop',
      description: '拖拽元素（⚠️实验性，多数网页可能不生效，必要时改用点击）',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          sourceSelector: { type: 'string' },
          targetSelector: { type: 'string' }
        },
        required: ['sourceSelector', 'targetSelector']
      }
    }
  },
  {
    id: 'wait_navigation',
    category: 'page_interaction',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'wait_navigation',
      description: '等待导航',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          timeout: { type: 'integer' },
          waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'] }
        },
        required: []
      }
    }
  },
  {
    id: 'fill_form',
    category: 'form_operation',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'fill_form',
      description: '批量填充表单；React 受控组件单字段建议用 keyboard_input',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                selector: { type: 'string' },
                value: { type: 'string' },
                fieldType: { type: 'string', enum: ['text', 'select', 'checkbox', 'radio', 'contenteditable'] }
              },
              required: ['selector', 'value']
            }
          },
          waitTime: { type: 'integer' }
        },
        required: ['fields']
      }
    }
  },
  {
    id: 'keyboard_input',
    category: 'form_operation',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'keyboard_input',
      description: '键盘输入（绕过 React 受控组件）',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          key: { type: 'string' },
          text: { type: 'string' },
          ctrlKey: { type: 'boolean' },
          shiftKey: { type: 'boolean' },
          altKey: { type: 'boolean' }
        },
        required: []
      }
    }
  },
  {
    id: 'file_upload',
    category: 'form_operation',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'file_upload',
      description: '上传文件',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          selector: { type: 'string' },
          fileName: { type: 'string' },
          fileContent: { type: 'string', description: '文件内容(base64)' },
          fileType: { type: 'string', description: 'MIME类型，如image/png' }
        },
        required: ['selector', 'fileName', 'fileContent']
      }
    }
  },
  {
    id: 'select_dropdown',
    category: 'form_operation',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'select_dropdown',
      description: '下拉选择（自定义组件也支持）',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          triggerSelector: { type: 'string' },
          optionText: { type: 'string' },
          optionSelector: { type: 'string' },
          timeout: { type: 'integer' }
        },
        required: ['triggerSelector', 'optionText']
      }
    }
  },
  {
    id: 'page_content',
    category: 'content_extraction',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'page_content',
      description: '获取页面内容；元素定位用 query_elements，结构化抽取用 extract_data',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          format: { type: 'string', enum: ['text', 'html'] },
          selector: { type: 'string' },
          maxLength: { type: 'integer' }
        },
        required: []
      }
    }
  },
  {
    id: 'extract_data',
    category: 'content_extraction',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'extract_data',
      description: '提取结构化数据',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          dataType: { type: 'string', enum: ['table', 'metadata', 'links', 'forms', 'images'] },
          selector: { type: 'string' },
          filterType: { type: 'string', enum: ['all', 'internal', 'external'], description: '仅links' },
          includeHeaders: { type: 'boolean', description: '仅table' },
          format: { type: 'string', enum: ['json', 'markdown'], description: '仅table' },
          includeImages: { type: 'boolean', description: '仅links' },
          minWidth: { type: 'integer', description: '仅images' },
          minHeight: { type: 'integer', description: '仅images' },
          maxResults: { type: 'integer' }
        },
        required: ['dataType']
      }
    }
  },
  {
    id: 'query_elements',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'query_elements',
      description: '查询可交互元素，推荐优先用于元素定位，返回的 selector 可直接用于 interact_element/fill_form',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          filterByText: { type: 'string' },
          elementTypes: {
            type: 'array',
            items: { type: 'string', enum: ['button', 'input', 'select', 'textarea', 'a', 'checkbox', 'radio', 'menuitem'] }
          },
          maxResults: { type: 'integer' },
          countOnly: { type: 'boolean' }
        },
        required: []
      }
    }
  },
  {
    id: 'search_in_page',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'search_in_page',
      description: '当前页面文本搜索',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          query: { type: 'string' },
          mode: { type: 'string', enum: ['plain', 'regex'] },
          caseSensitive: { type: 'boolean' },
          contextLength: { type: 'integer' },
          maxResults: { type: 'integer' },
          highlight: { type: 'boolean' }
        },
        required: ['query']
      }
    }
  },
  {
    id: 'find_similar',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'find_similar',
      description: '查找相似元素',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          selector: { type: 'string' },
          maxResults: { type: 'integer' }
        },
        required: ['selector']
      }
    }
  },
  {
    id: 'iframe_content',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'iframe_content',
      description: '获取iframe内容',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          selector: { type: 'string' },
          includeNested: { type: 'boolean' },
          maxLength: { type: 'integer' }
        },
        required: []
      }
    }
  },
  {
    id: 'scroll_collect',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'scroll_collect',
      description: '滚动页面并收集内容，适用于无限滚动/懒加载页面',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '省略则用当前活动页' },
          scrollPixels: { type: 'integer' },
          maxScrolls: { type: 'integer' },
          pauseMs: { type: 'integer' },
          selector: { type: 'string' }
        },
        required: []
      }
    }
  },
];
